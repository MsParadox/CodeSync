import { Router } from 'express';
import { Problem } from '../models/Problem.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { executionLimiter } from '../middleware/rateLimit.middleware.js';
import { judge, runSamples } from '../utils/judge.js';
import { logger } from '../utils/logger.js';

export const problemRoutes = Router();

const VALID_LANGS = ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];

// GET /api/problems — list (filters: difficulty, tag, search). Hidden tests
// are stripped by the model's toJSON; we also project them out for lists.
problemRoutes.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { difficulty, tag, search } = req.query;
    const filter = {};
    if (difficulty && ['Easy', 'Medium', 'Hard'].includes(difficulty)) filter.difficulty = difficulty;
    if (tag) filter.tags = tag;
    if (search) filter.title = { $regex: search, $options: 'i' };

    const problems = await Problem.find(filter)
      .select('slug title difficulty tags submissions accepted solvedBy order')
      .sort({ order: 1, createdAt: 1 })
      .lean();

    // Which of these has the signed-in user solved?
    let solvedSet = new Set();
    if (req.user) {
      const u = await User.findById(req.user._id).select('solvedProblems').lean();
      solvedSet = new Set(u?.solvedProblems || []);
    }

    res.json({
      problems: problems.map((p) => ({
        ...p,
        acceptanceRate: p.submissions ? Math.round((p.accepted / p.submissions) * 100) : 0,
        solved: solvedSet.has(p.slug),
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/problems/:slug — full statement + samples + starter code (no hidden tests)
problemRoutes.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const problem = await Problem.findOne({ slug: req.params.slug }).lean();
    if (!problem) return res.status(404).json({ error: 'Problem not found' });
    delete problem.hiddenTests;

    let solved = false;
    if (req.user) {
      const u = await User.findById(req.user._id).select('solvedProblems').lean();
      solved = (u?.solvedProblems || []).includes(problem.slug);
    }
    problem.acceptanceRate = problem.submissions ? Math.round((problem.accepted / problem.submissions) * 100) : 0;
    res.json({ problem, solved });
  } catch (err) { next(err); }
});

// POST /api/problems/:slug/run — run against VISIBLE samples (debug aid)
problemRoutes.post('/:slug/run', requireAuth, executionLimiter, async (req, res, next) => {
  try {
    const problem = await Problem.findOne({ slug: req.params.slug }).lean();
    if (!problem) return res.status(404).json({ error: 'Problem not found' });

    const { language, code } = req.body;
    if (!VALID_LANGS.includes(language)) return res.status(400).json({ error: 'Unsupported language' });
    if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'Code is required' });
    if (code.length > 100000) return res.status(400).json({ error: 'Code exceeds 100KB' });

    const results = await runSamples({ language, code, samples: problem.samples || [] });
    const passed = results.filter((r) => r.passed).length;
    res.json({ results, passed, total: results.length });
  } catch (err) { next(err); }
});

// POST /api/problems/:slug/submit — judge against HIDDEN tests, record stats
problemRoutes.post('/:slug/submit', requireAuth, executionLimiter, async (req, res, next) => {
  try {
    const problem = await Problem.findOne({ slug: req.params.slug });
    if (!problem) return res.status(404).json({ error: 'Problem not found' });

    const { language, code } = req.body;
    if (!VALID_LANGS.includes(language)) return res.status(400).json({ error: 'Unsupported language' });
    if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'Code is required' });
    if (code.length > 100000) return res.status(400).json({ error: 'Code exceeds 100KB' });

    const tests = (problem.hiddenTests || []).map((t) => ({ input: t.input, expectedOutput: t.expectedOutput }));
    const r = await judge({ language, code, tests });
    const overall = r.accepted ? 'success' : r.status;

    // Read user state needed for solve + streak logic
    const u = await User.findById(req.user._id).select('solvedProblems streak').lean();
    const alreadySolved = (u?.solvedProblems || []).includes(problem.slug);
    const firstSolve = r.accepted && !alreadySolved;

    // Persist submission (problemSlug ties it to the problem)
    try {
      await Submission.create({
        roomId:   `problem:${problem.slug}`,
        userId:   req.user._id,
        username: req.user.username,
        avatar:   req.user.avatar || '',
        language,
        code:     code.slice(0, 100000),
        status:   overall,
        exitCode: r.sampleRun?.exitCode ?? 0,
        stdout:   (r.sampleRun?.stdout || '').slice(0, 20000),
        stderr:   (r.sampleRun?.stderr || '').slice(0, 20000),
        executionTimeMs: r.sampleRun?.executionTimeMs || 0,
      });
    } catch (e) { logger.error(`Problem submission save failed: ${e.message}`); }

    // Update problem aggregate stats
    const inc = { submissions: 1 };
    if (r.accepted) inc.accepted = 1;
    if (firstSolve) inc.solvedBy = 1;
    await Problem.updateOne({ _id: problem._id }, { $inc: inc });

    // ── Build user update: solved set, difficulty stat, daily streak ──
    const set = {}, incU = {}, addToSet = {};
    if (firstSolve) {
      addToSet.solvedProblems = problem.slug;
      incU[`stats.solvedByDifficulty.${problem.difficulty.toLowerCase()}`] = 1;
    }
    let streak = u?.streak || { current: 0, max: 0, lastSolvedDate: '' };
    if (r.accepted) {
      const today = new Date().toISOString().slice(0, 10);
      const yest  = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (streak.lastSolvedDate !== today) {            // first AC of the day
        const current = streak.lastSolvedDate === yest ? (streak.current || 0) + 1 : 1;
        const max = Math.max(streak.max || 0, current);
        set['streak.current'] = current;
        set['streak.max'] = max;
        set['streak.lastSolvedDate'] = today;
        streak = { current, max, lastSolvedDate: today };
      }
    }
    const ops = {};
    if (Object.keys(set).length)      ops.$set = set;
    if (Object.keys(incU).length)     ops.$inc = incU;
    if (Object.keys(addToSet).length) ops.$addToSet = addToSet;
    if (Object.keys(ops).length) await User.updateOne({ _id: req.user._id }, ops);

    res.json({
      accepted: r.accepted,
      status: overall,
      testsPassed: r.passed,
      testsTotal: r.total,
      firstFailureIndex: r.firstFailureIndex,
      results: r.results,           // pass/fail + verdict only, no hidden I/O
      firstSolve,
      streak: streak.current,
    });
  } catch (err) { next(err); }
});

// GET /api/problems/meta/leaderboard — ranked by a difficulty-weighted
// score (Easy = 1, Medium = 3, Hard = 5), then streak, then solved count.
const SCORE_WEIGHTS = { easy: 1, medium: 3, hard: 5 };

problemRoutes.get('/meta/leaderboard', async (_req, res, next) => {
  try {
    const users = await User.find({ isActive: true })
      .select('username avatar solvedProblems stats streak')
      .lean();

    const ranked = users
      .map((u) => {
        const bd = u.stats?.solvedByDifficulty || { easy: 0, medium: 0, hard: 0 };
        const score = (bd.easy || 0) * SCORE_WEIGHTS.easy
                    + (bd.medium || 0) * SCORE_WEIGHTS.medium
                    + (bd.hard || 0) * SCORE_WEIGHTS.hard;
        return {
          username: u.username,
          avatar: u.avatar,
          solved: (u.solvedProblems || []).length,
          score,
          streak: u.streak?.current || 0,
          maxStreak: u.streak?.max || 0,
          byDifficulty: bd,
        };
      })
      .filter((u) => u.solved > 0)
      .sort((a, b) => b.score - a.score || b.solved - a.solved || b.maxStreak - a.maxStreak)
      .slice(0, 100)
      .map((u, i) => ({ rank: i + 1, ...u }));

    res.json({ leaderboard: ranked, weights: SCORE_WEIGHTS });
  } catch (err) { next(err); }
});

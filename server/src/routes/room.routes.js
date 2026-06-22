import { Router } from 'express';
import { Room } from '../models/Room.js';
import { Snapshot } from '../models/Snapshot.js';
import { User } from '../models/User.js';
import { SessionEvent } from '../models/SessionEvent.js';
import { Submission } from '../models/Submission.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { roomCreationLimiter } from '../middleware/rateLimit.middleware.js';
import { runCode } from '../services/executionService.js';
import { io } from '../socket/index.js';
import { logger } from '../utils/logger.js';

export const roomRoutes = Router();

const VALID_LANGUAGES = ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];
const VALID_ROLES     = ['editor', 'viewer'];

// ── STATIC ROUTES before dynamic /:roomId ────────────────────────

// GET /api/rooms/my/rooms
roomRoutes.get('/my/rooms', requireAuth, async (req, res, next) => {
  try {
    const rooms = await Room.find({ owner: req.user._id, archived: false })
      .sort({ lastActiveAt: -1 })
      .lean();
    res.json({ rooms });
  } catch (err) { next(err); }
});

// POST /api/rooms — Create a new room
roomRoutes.post('/', requireAuth, roomCreationLimiter, async (req, res, next) => {
  try {
    const {
      name, description = '', language = 'javascript',
      isPrivate = false, password, tags = [],
      interviewMode = false, problemStatement = '',
    } = req.body;

    if (!name || name.trim().length < 2)
      return res.status(400).json({ error: 'Room name must be at least 2 characters' });
    if (!VALID_LANGUAGES.includes(language))
      return res.status(400).json({ error: `Language must be one of: ${VALID_LANGUAGES.join(', ')}` });

    const room = new Room({
      name: name.trim(), description, owner: req.user._id,
      language, isPrivate, tags: tags.slice(0, 5), interviewMode, problemStatement,
    });

    if (isPrivate && password) await room.setPassword(password);
    await room.save();

    await User.findByIdAndUpdate(req.user._id, { $inc: { 'stats.roomsCreated': 1 } });

    const populated = await Room.findById(room._id)
      .populate('owner', 'username avatar')
      .lean();

    res.status(201).json({ room: populated });
  } catch (err) { next(err); }
});

// GET /api/rooms — List public rooms
roomRoutes.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, language, search, tags, sortBy = 'lastActiveAt' } = req.query;

    const filter = { archived: false, isPrivate: false };
    if (language && VALID_LANGUAGES.includes(language)) filter.language = language;
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (tags) filter.tags = { $in: tags.split(',') };

    const sortOptions = {
      lastActiveAt: { lastActiveAt: -1 },
      newest:       { createdAt: -1 },
      name:         { name: 1 },
    };

    const rooms = await Room.find(filter)
      .populate('owner', 'username avatar')
      .sort(sortOptions[sortBy] || { lastActiveAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(Math.min(parseInt(limit), 50))
      .lean();

    const total = await Room.countDocuments(filter);

    res.json({
      rooms,
      pagination: {
        total, page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/rooms/:roomId — Get a single room
roomRoutes.get('/:roomId', optionalAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId, archived: false })
      .populate('owner', 'username avatar')
      .lean();
    if (!room) return res.status(404).json({ error: 'Room not found' });
    delete room.passwordHash;
    // Expose only the COUNT of hidden test cases, never their contents.
    room.testCaseCount = (room.testCases || []).length;
    delete room.testCases;
    res.json({ room });
  } catch (err) { next(err); }
});

// PUT /api/rooms/:roomId — Update room (owner only)
roomRoutes.put('/:roomId', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only the room owner can edit this room' });

    const { name, description, language, isPrivate, password, tags, interviewMode, problemStatement } = req.body;
    if (name) room.name = name.trim();
    if (description !== undefined) room.description = description;
    if (language && VALID_LANGUAGES.includes(language)) room.language = language;
    if (isPrivate !== undefined) room.isPrivate = isPrivate;
    if (tags) room.tags = tags.slice(0, 5);
    if (interviewMode !== undefined) room.interviewMode = interviewMode;
    if (problemStatement !== undefined) room.problemStatement = problemStatement;
    if (isPrivate && password) await room.setPassword(password);
    else if (!isPrivate) room.passwordHash = null;

    await room.save();
    res.json({ room: room.toJSON() });
  } catch (err) { next(err); }
});

// DELETE /api/rooms/:roomId — Archive room (owner only)
roomRoutes.delete('/:roomId', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only the room owner can delete this room' });
    room.archived = true;
    await room.save();
    res.json({ message: 'Room archived successfully' });
  } catch (err) { next(err); }
});

// GET /api/rooms/:roomId/snapshots — Snapshot history (members only)
roomRoutes.get('/:roomId/snapshots', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId, archived: false }).lean();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // ── Membership check: must have at least viewer access ────────
    const role = getRoleFromDoc(room, req.user._id);
    if (!role) return res.status(403).json({ error: 'You do not have access to this room' });

    const snapshots = await Snapshot.find({ roomId: req.params.roomId })
      .sort({ savedAt: -1 })
      .limit(20)
      .select('-yjsState')
      .lean();
    res.json({ snapshots });
  } catch (err) { next(err); }
});

// ── MEMBER MANAGEMENT (Owner only) ───────────────────────────────

// GET /api/rooms/:roomId/members — List members with roles
roomRoutes.get('/:roomId/members', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId, archived: false })
      .populate('members.userId', 'username avatar email')
      .populate('owner', 'username avatar email')
      .lean();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const role = getRoleFromDoc(room, req.user._id);
    if (!role) return res.status(403).json({ error: 'Access denied' });

    // Build roster: owner first, then members
    const roster = [
      {
        userId:   room.owner._id,
        username: room.owner.username,
        avatar:   room.owner.avatar,
        role:     'owner',
      },
      ...room.members.map((m) => ({
        userId:   m.userId._id || m.userId,
        username: m.userId.username,
        avatar:   m.userId.avatar,
        role:     m.role,
        addedAt:  m.addedAt,
      })),
    ];

    res.json({ members: roster });
  } catch (err) { next(err); }
});

// POST /api/rooms/:roomId/members — Add or update a member's role (owner only)
roomRoutes.post('/:roomId/members', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId, archived: false });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only the room owner can manage members' });

    const { username, role = 'editor' } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });

    const targetUser = await User.findOne({ username }).select('_id username avatar').lean();
    if (!targetUser) return res.status(404).json({ error: `User "${username}" not found` });
    if (targetUser._id.toString() === req.user._id.toString())
      return res.status(400).json({ error: 'Cannot change your own role — you are the owner' });

    const changed = room.setMemberRole(targetUser._id, role);
    if (!changed) return res.status(400).json({ error: 'Cannot assign a role to the room owner' });

    await room.save();

    res.json({
      message: `${targetUser.username} is now a ${role}`,
      member:  { userId: targetUser._id, username: targetUser.username, avatar: targetUser.avatar, role },
    });
  } catch (err) { next(err); }
});

// DELETE /api/rooms/:roomId/members/:userId — Remove a member (owner only)
roomRoutes.delete('/:roomId/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId, archived: false });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only the room owner can remove members' });
    if (req.params.userId === req.user._id.toString())
      return res.status(400).json({ error: 'Cannot remove yourself as owner' });

    room.removeMember(req.params.userId);
    await room.save();

    res.json({ message: 'Member removed successfully' });
  } catch (err) { next(err); }
});

// ── SESSION REPLAY ────────────────────────────────────────────────

// GET /api/rooms/:roomId/replay — Session event timeline (members only)
roomRoutes.get('/:roomId/replay', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId, archived: false }).lean();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const role = getRoleFromDoc(room, req.user._id);
    if (!role) return res.status(403).json({ error: 'Access denied' });

    const { includeCode = 'false', limit = 500 } = req.query;

    let events;
    if (includeCode === 'true') {
      // Full replay with Yjs binary (for code playback)
      events = await SessionEvent.getReplay(req.params.roomId, { limit: parseInt(limit) });
      // Convert Yjs binary → base64 for JSON transport.
      events = events.map((e) => ({
        ...e,
        yjsState: bufferToBase64(e.yjsState),
      }));
    } else {
      // Timeline only (lighter — no binary blobs)
      events = await SessionEvent.getTimeline(req.params.roomId);
    }

    res.json({ events, total: events.length });
  } catch (err) { next(err); }
});

// ── INTERVIEW SUBMISSIONS ─────────────────────────────────────────

// GET /api/rooms/:roomId/submissions — list submissions for the room.
// Owner sees ALL participants' submissions (grouped); a non-owner member
// sees only their own. Viewers/strangers are blocked.
roomRoutes.get('/:roomId/submissions', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId, archived: false }).lean();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const role = getRoleFromDoc(room, req.user._id);
    if (!role) return res.status(403).json({ error: 'Access denied' });

    const isOwner = role === 'owner';
    const filter = { roomId: req.params.roomId };
    if (!isOwner) filter.userId = req.user._id;   // members see only their own

    const submissions = await Submission.find(filter)
      .sort({ submittedAt: -1 })
      .limit(200)
      .lean();

    // Group by participant for the interviewer's review panel
    const byUser = new Map();
    for (const s of submissions) {
      const key = String(s.userId);
      if (!byUser.has(key)) {
        byUser.set(key, {
          userId:   s.userId,
          username: s.username,
          avatar:   s.avatar,
          count:    0,
          latestAt: s.submittedAt,
          submissions: [],
        });
      }
      const g = byUser.get(key);
      g.count += 1;
      g.submissions.push(s);
    }

    res.json({
      isOwner,
      total: submissions.length,
      participants: [...byUser.values()],
    });
  } catch (err) { next(err); }
});

// ── HIDDEN TEST CASES (owner only) ────────────────────────────────

// GET /api/rooms/:roomId/testcases — owner fetches the hidden test cases
roomRoutes.get('/:roomId/testcases', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only the room owner can view test cases' });
    res.json({ testCases: room.testCases || [] });
  } catch (err) { next(err); }
});

// PUT /api/rooms/:roomId/testcases — owner sets the hidden test cases
roomRoutes.put('/:roomId/testcases', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only the room owner can edit test cases' });

    const list = Array.isArray(req.body.testCases) ? req.body.testCases : [];
    if (list.length > 25) return res.status(400).json({ error: 'Max 25 test cases' });

    room.testCases = list
      .filter((t) => t && typeof t.input === 'string' && typeof t.expectedOutput === 'string')
      .slice(0, 25)
      .map((t) => ({ input: t.input.slice(0, 20000), expectedOutput: t.expectedOutput.slice(0, 20000) }));
    await room.save();

    res.json({ count: room.testCases.length });
  } catch (err) { next(err); }
});

// ── SUBMIT (run against hidden test cases, then persist) ──────────

// Compare program output to expected, line-trailing-whitespace tolerant.
function normalizeOutput(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n')
    .replace(/\n+$/g, '');
}

// Map a run result + expected output to a judge verdict for one test case.
function verdictFor(run, expectedOutput) {
  if (run.status === 'timeout')        return { passed: false, status: 'timeout',       label: 'Time Limit Exceeded' };
  if (run.status === 'oom')            return { passed: false, status: 'oom',           label: 'Memory Limit Exceeded' };
  if (run.status === 'compile_error')  return { passed: false, status: 'compile_error', label: 'Compilation Error' };
  if (run.status === 'runtime_error' || run.exitCode !== 0)
                                       return { passed: false, status: 'runtime_error', label: 'Runtime Error' };
  if (normalizeOutput(run.stdout) === normalizeOutput(expectedOutput))
                                       return { passed: true,  status: 'success',       label: 'Accepted' };
  return { passed: false, status: 'wrong_answer', label: 'Wrong Answer' };
}

const VALID_SUBMIT_LANGS = ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];

// POST /api/rooms/:roomId/submit — run the solution. If the room has hidden
// test cases, ALL must pass for the submission to be "accepted"; otherwise
// the first failing case's verdict is returned (inputs stay hidden). With
// no test cases, it just runs once with the provided stdin.
roomRoutes.post('/:roomId/submit', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const role = getRoleFromDoc(room.toObject ? room.toObject() : room, req.user._id);
    if (role !== 'owner' && role !== 'editor')
      return res.status(403).json({ error: 'You do not have permission to submit here' });

    const { language, code, stdin = '' } = req.body;
    if (!VALID_SUBMIT_LANGS.includes(language))
      return res.status(400).json({ error: 'Unsupported language' });
    if (typeof code !== 'string' || !code.trim())
      return res.status(400).json({ error: 'Code is required' });
    if (code.length > 100000)
      return res.status(400).json({ error: 'Code exceeds 100KB' });

    const tests = room.testCases || [];
    let accepted, overall, tests_passed = 0, results = [], firstFailureIndex = -1, sampleRun;

    if (tests.length === 0) {
      // No hidden tests — just run once with the user's stdin.
      const run = await runCode({ language, code, stdin });
      sampleRun = run;
      accepted  = run.status === 'success';
      overall   = run.status;
    } else {
      // Run each test until the first failure (compile error fails all).
      accepted = true;
      for (let i = 0; i < tests.length; i++) {
        const run = await runCode({ language, code, stdin: tests[i].input });
        if (i === 0) sampleRun = run;
        const v = verdictFor(run, tests[i].expectedOutput);
        results.push({ index: i + 1, passed: v.passed, verdict: v.label, timeMs: run.executionTimeMs });
        if (v.passed) { tests_passed += 1; continue; }
        accepted = false;
        overall = v.status;
        firstFailureIndex = i + 1;
        break;
      }
      if (accepted) overall = 'success';
    }

    // Persist the attempt (code from request — it's the candidate's editor).
    const submittedAt = new Date();
    try {
      await Submission.create({
        roomId:   req.params.roomId,
        userId:   req.user._id,
        username: req.user.username,
        avatar:   req.user.avatar || '',
        language,
        code:     code.slice(0, 100000),
        status:   overall || 'unknown',
        exitCode: sampleRun?.exitCode ?? 0,
        stdout:   (sampleRun?.stdout || '').slice(0, 20000),
        stderr:   (sampleRun?.stderr || '').slice(0, 20000),
        executionTimeMs: sampleRun?.executionTimeMs || 0,
        submittedAt,
      });
    } catch (e) { logger.error(`Submission save failed: ${e.message}`); }

    // Notify the room (interviewer) over Socket.IO if it's running.
    if (io) {
      io.to(req.params.roomId).emit('interview-submitted', {
        userId:   req.user._id,
        username: req.user.username,
        avatar:   req.user.avatar,
        status:   overall,
        language,
        accepted,
        testsPassed: tests.length ? tests_passed : null,
        testsTotal:  tests.length || null,
        submittedAt: submittedAt.toISOString(),
      });
    }

    res.json({
      accepted,
      status: overall,
      testsTotal:  tests.length,
      testsPassed: tests_passed,
      firstFailureIndex,
      // Per-test pass/fail + verdict ONLY — never the hidden input/expected.
      results,
      // For the no-tests case, surface the run output so the user sees it.
      run: tests.length === 0 ? sampleRun : undefined,
    });
  } catch (err) { next(err); }
});

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Normalise a yjsState field to base64. With .lean(), Mongoose returns
 * Buffer-typed fields as BSON `Binary` objects (which expose `.buffer`),
 * NOT Node Buffers — and Buffer.from(Binary) silently yields an empty
 * buffer. Handle Node Buffer, BSON Binary, and raw byte arrays.
 */
function bufferToBase64(v) {
  if (!v) return null;
  if (Buffer.isBuffer(v)) return v.toString('base64');
  if (v.buffer) return Buffer.from(v.buffer).toString('base64');           // BSON Binary
  if (typeof v.value === 'function') return Buffer.from(v.value(true)).toString('base64');
  try { return Buffer.from(v).toString('base64'); } catch { return null; }
}

/** Pure helper: get role from a lean room document (no methods available) */
function getRoleFromDoc(room, userId) {
  const uid = userId.toString();
  if (room.owner.toString() === uid) return 'owner';
  if (room.owner._id && room.owner._id.toString() === uid) return 'owner';
  const member = (room.members || []).find((m) =>
    (m.userId._id || m.userId).toString() === uid
  );
  if (member) return member.role;
  if (!room.isPrivate) return 'editor'; // public room default
  return null;
}

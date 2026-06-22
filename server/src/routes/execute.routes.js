import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { executionLimiter } from '../middleware/rateLimit.middleware.js';
import { runCode, getActiveContainerCount } from '../services/executionService.js';
import { Execution } from '../models/Snapshot.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

export const executeRoutes = Router();

const VALID_LANGUAGES = ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];

// POST /api/execute
executeRoutes.post('/', requireAuth, executionLimiter, async (req, res, next) => {
  try {
    const { language, code, stdin = '', roomId } = req.body;

    if (!language || !code)
      return res.status(400).json({ error: 'language and code are required' });
    if (!VALID_LANGUAGES.includes(language))
      return res.status(400).json({ error: `Invalid language. Supported: ${VALID_LANGUAGES.join(', ')}` });
    if (typeof code !== 'string' || code.length > 100000)
      return res.status(400).json({ error: 'Code must be a string under 100KB' });

    logger.info(`Execution: ${language} by ${req.user.username} (room: ${roomId || 'none'})`);

    const result = await runCode({ language, code, stdin });

    const execution = await Execution.create({
      roomId:         roomId || 'standalone',
      userId:         req.user._id,
      language, code, stdin,
      stdout:         result.stdout,
      stderr:         result.stderr,
      exitCode:       result.exitCode,
      executionTimeMs: result.executionTimeMs,
      status:         result.status,
    });

    // Fire-and-forget stats update (non-critical path)
    User.findById(req.user._id)
      .then(async (user) => { if (user) await user.recordExecution(language, result.executionTimeMs); })
      .catch(() => {});

    logger.info(`Execution done: ${language} | exit:${result.exitCode} | ${result.executionTimeMs}ms`);

    res.json({ ...result, executionId: execution._id });
  } catch (err) { next(err); }
});

// GET /api/execute/history
executeRoutes.get('/history', requireAuth, async (req, res, next) => {
  try {
    const { roomId, limit = 10, page = 1 } = req.query;
    const filter = roomId ? { roomId } : { userId: req.user._id };

    const executions = await Execution.find(filter)
      .sort({ ranAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(Math.min(parseInt(limit), 50))
      .populate('userId', 'username avatar')
      .lean();

    res.json({ executions });
  } catch (err) { next(err); }
});

// GET /api/execute/stats
executeRoutes.get('/stats', requireAuth, async (req, res, next) => {
  try {
  
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const [userStats, globalTotal, langStats] = await Promise.all([
      Execution.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            total:        { $sum: 1 },
            avgTime:      { $avg: '$executionTimeMs' },
            successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
          },
        },
      ]),
      Execution.countDocuments(),
      Execution.aggregate([
        { $match: { userId } },
        { $group: { _id: '$language', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.json({
      user:             userStats[0] || { total: 0, avgTime: 0, successCount: 0 },
      global:           { total: globalTotal },
      byLanguage:       langStats,
      activeContainers: getActiveContainerCount(),
    });
  } catch (err) { next(err); }
});

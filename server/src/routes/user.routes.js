import { Router } from 'express';
import { User } from '../models/User.js';
import { Room } from '../models/Room.js';
import { Execution } from '../models/Snapshot.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const userRoutes = Router();

// ── IMPORTANT: static routes MUST come before /:username ──────────
// Express matches routes in registration order, so /me would be
// captured by /:username (as username="me") if /:username is first.

// PUT /api/users/me — Update own profile
userRoutes.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { bio, avatar } = req.body;
    const updates = {};
    if (bio !== undefined)    updates.bio    = String(bio).slice(0, 200);
    if (avatar !== undefined) {
      // Accept a remote URL or a small inline data: URL (compressed
      // client-side). Cap the size so the document stays lean.
      if (typeof avatar !== 'string') {
        return res.status(400).json({ error: 'avatar must be a string' });
      }
      const isHttp = /^https?:\/\//i.test(avatar);
      const isData = /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(avatar);
      if (!isHttp && !isData) {
        return res.status(400).json({ error: 'avatar must be an http(s) or data:image URL' });
      }
      if (avatar.length > 600 * 1024) {
        return res.status(413).json({ error: 'Avatar image is too large (max ~400KB). Please pick a smaller image.' });
      }
      updates.avatar = avatar;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ user: user.toJSON() });
  } catch (err) { next(err); }
});

// GET /api/users/me/dashboard — Full dashboard data (static sub-path)
userRoutes.get('/me/dashboard', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [user, myRooms, recentExecutions, executionsByDay] = await Promise.all([
      User.findById(userId),
      Room.find({ owner: userId, archived: false })
        .sort({ lastActiveAt: -1 }).limit(10).lean(),
      Execution.find({ userId })
        .sort({ ranAt: -1 }).limit(10).lean(),
      Execution.aggregate([
        {
          $match: {
            userId,
            ranAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$ranAt' } },
            count:        { $sum: 1 },
            successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      user: user.toJSON(),
      myRooms,
      recentExecutions,
      executionsByDay,
    });
  } catch (err) { next(err); }
});

// GET /api/users/:username — Public profile (dynamic — MUST be last)
userRoutes.get('/:username', async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-passwordHash -email')
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });

    const [roomsCreated, recentExecutions] = await Promise.all([
      Room.countDocuments({ owner: user._id, archived: false }),
      Execution.find({ userId: user._id })
        .sort({ ranAt: -1 }).limit(5)
        .select('language exitCode executionTimeMs ranAt status')
        .lean(),
    ]);

    res.json({
      user: {
        ...user,
        stats: { ...user.stats, roomsCreated },
      },
      recentExecutions,
    });
  } catch (err) { next(err); }
});

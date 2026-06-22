import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';
import { logger } from '../utils/logger.js';

export const authRoutes = Router();

function generateTokens(userId) {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
  const refreshToken = jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
}

// POST /api/auth/register
authRoutes.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({ error: 'Username must be 3–24 characters' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, _ and -' });
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });
    if (existing) {
      const conflict = existing.email === email.toLowerCase() ? 'email' : 'username';
      return res.status(409).json({ error: `This ${conflict} is already taken` });
    }

    const user = await User.create({
      username,
      email: email.toLowerCase(),
      passwordHash: password, // pre-save hook hashes it
    });

    const { accessToken, refreshToken } = generateTokens(user._id);
    logger.info(`New user registered: ${user.username} (${user.email})`);

    res.status(201).json({
      accessToken,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
authRoutes.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    user.lastLogin = new Date();
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);
    logger.info(`User logged in: ${user.username}`);

    res.json({
      accessToken,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRoutes.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ user: user.toJSON() });
});

// POST /api/auth/refresh
authRoutes.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    const payload = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET
    );
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });

    const user = await User.findById(payload.id).lean();
    if (!user) return res.status(401).json({ error: 'User not found' });

    const tokens = generateTokens(user._id);
    res.json(tokens);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
authRoutes.post('/logout', requireAuth, (req, res) => {
  // Stateless JWT — client deletes the token
  res.json({ message: 'Logged out successfully' });
});

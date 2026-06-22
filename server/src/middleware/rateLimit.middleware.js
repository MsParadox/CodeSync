import { rateLimit } from 'express-rate-limit';
import { redisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// General API rate limit: 100 requests per 15 minutes per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
  skip: (req) => process.env.NODE_ENV === 'test',
});

// Auth rate limit: stricter — 10 attempts per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts — please wait 15 minutes.' },
  skip: (req) => process.env.NODE_ENV === 'test',
});

// Execution rate limit: 10 runs per minute per authenticated user (Redis-backed)
export const executionLimiter = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const key = `exec:ratelimit:${userId}`;

    const count = await redisClient.incr(key);

    if (count === 1) {
      await redisClient.expire(key, 60); // 60-second window
    }

    const limit = parseInt(process.env.EXECUTION_RATE_LIMIT || '10');

    if (count > limit) {
      const ttl = await redisClient.ttl(key);
      logger.warn(`Execution rate limit hit for user ${userId} (${count}/${limit})`);
      return res.status(429).json({
        error: `Execution rate limit exceeded (${limit}/min). Try again in ${ttl}s.`,
        retryAfter: ttl,
      });
    }

    // Add rate limit info to response headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    next();
  } catch (err) {
    // Redis down — fail open to avoid blocking users
    logger.error('executionLimiter Redis error:', err.message);
    next();
  }
};

// Room creation limit: 5 per hour per user
export const roomCreationLimiter = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const key = `rooms:created:${userId}`;

    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, 3600);

    if (count > 5) {
      return res.status(429).json({
        error: 'Room creation limit reached (5/hour). Please wait before creating another room.',
      });
    }
    next();
  } catch (err) {
    logger.error('roomCreationLimiter Redis error:', err.message);
    next();
  }
};

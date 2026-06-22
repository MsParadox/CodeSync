import { logger } from '../utils/logger.js';

// ── Global Error Handler ─────────────────────────────────────────
export const errorMiddleware = (err, req, res, next) => {
  // Don't log expected client errors at error level
  const statusCode = err.statusCode || err.status || 500;
  const isClientError = statusCode >= 400 && statusCode < 500;

  if (!isClientError) {
    logger.error(`${req.method} ${req.url} — ${err.message}`, { stack: err.stack });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: 'Validation failed', details: messages });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ error: `${field} already exists` });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// ── Zod / express-validator request validation ───────────────────
export const validate = (schema) => async (req, res, next) => {
  try {
    req.body = await schema.parseAsync(req.body);
    next();
  } catch (err) {
    const details = err.errors?.map((e) => `${e.path.join('.')}: ${e.message}`) || [err.message];
    return res.status(400).json({ error: 'Validation failed', details });
  }
};

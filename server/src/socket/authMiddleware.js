import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

export async function socketAuthMiddleware(socket, next) {
  try {
    // Token can arrive from auth object or query param
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error('AUTHENTICATION_REQUIRED'));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('-passwordHash').lean();

    if (!user) return next(new Error('USER_NOT_FOUND'));
    if (!user.isActive) return next(new Error('ACCOUNT_DEACTIVATED'));

    socket.user = user; // Attach user to socket for all handlers
    next();
  } catch (err) {
    logger.warn(`Socket auth failed: ${err.message} | socketId: ${socket.id}`);
    next(new Error('INVALID_TOKEN'));
  }
}

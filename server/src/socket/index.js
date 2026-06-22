import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from '../config/redis.js';
import { socketAuthMiddleware } from './authMiddleware.js';
import { registerRoomHandlers } from './roomHandlers.js';
import { registerYjsHandlers } from './yjsHandlers.js';
import { registerCursorHandlers } from './cursorHandlers.js';
import { logger } from '../utils/logger.js';

export let io;

// ── Allowed origins — MUST match app.js list exactly ─────────────

function buildAllowedOrigins() {
  const base = new Set([
    'http://localhost',
    'https://localhost',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1',
    'http://127.0.0.1:5173',
  ]);
  if (process.env.CLIENT_URL) base.add(process.env.CLIENT_URL);
  if (process.env.EXTRA_ORIGINS) {
    process.env.EXTRA_ORIGINS.split(',').forEach((o) => base.add(o.trim()));
  }
  return [...base];
}

export function initSocket(httpServer) {
  const allowedOrigins = buildAllowedOrigins();

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        logger.warn(`Socket.IO CORS blocked: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB for Yjs binary
    pingTimeout:   60000,
    pingInterval:  25000,
    transports: ['websocket', 'polling'],
  });

  // ── Redis Adapter — horizontal scaling ───────────────────────
  io.adapter(createAdapter(pubClient, subClient));

  // ── Auth middleware ───────────────────────────────────────────
  io.use(socketAuthMiddleware);

  // ── Connection handler ────────────────────────────────────────
  io.on('connection', (socket) => {
    logger.info(`🔌 Socket connected | id: ${socket.id} | user: ${socket.user.username}`);

    registerRoomHandlers(io, socket);
    registerYjsHandlers(io, socket);
    registerCursorHandlers(io, socket);

    socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));

    socket.on('disconnect', (reason) => {
      logger.info(`🔌 Socket disconnected | id: ${socket.id} | user: ${socket.user.username} | reason: ${reason}`);
    });

    socket.on('error', (err) => {
      logger.error(`Socket error | id: ${socket.id} | ${err.message}`);
    });
  });

  if (process.env.NODE_ENV !== 'test') {
    setInterval(async () => {
      const count = (await io.fetchSockets()).length;
      if (count > 0) logger.debug(`Active sockets: ${count}`);
    }, 60000);
  }

  return io;
}

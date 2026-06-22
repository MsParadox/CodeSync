import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { authRoutes }    from './routes/auth.routes.js';
import { roomRoutes }    from './routes/room.routes.js';
import { executeRoutes } from './routes/execute.routes.js';
import { userRoutes }    from './routes/user.routes.js';
import { problemRoutes } from './routes/problem.routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { apiLimiter }    from './middleware/rateLimit.middleware.js';
import { logger }        from './utils/logger.js';

export const app = express();

// ── Allowed origins ───────────────────────────────────────────────
// CLIENT_URL covers production domain (e.g. https://yourdomain.com).
// http://localhost  = browser accessing via Nginx on port 80 (docker-compose)
// http://localhost:5173 = direct Vite dev server access
// EXTRA_ORIGINS = comma-separated additional origins (optional env var)
function buildAllowedOrigins() {
  const base = new Set([
    'http://localhost',          // ← Nginx port 80 (docker-compose + prod)
    'https://localhost',
    'http://localhost:3000',
    'http://localhost:5173',     // ← direct Vite dev access
    'http://127.0.0.1',
    'http://127.0.0.1:5173',
  ]);
  if (process.env.CLIENT_URL) base.add(process.env.CLIENT_URL);
  if (process.env.EXTRA_ORIGINS) {
    process.env.EXTRA_ORIGINS.split(',').forEach((o) => base.add(o.trim()));
  }
  return [...base];
}

const ALLOWED_ORIGINS = buildAllowedOrigins();
logger.debug('CORS allowed origins:', ALLOWED_ORIGINS);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    logger.warn(`CORS blocked: ${origin}`);
    cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ── Security Headers ──────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS, 'ws:', 'wss:'],
    },
  },
}));

app.use(cors(corsOptions));

// Handle OPTIONS preflight for all routes
app.options('*', cors(corsOptions));

// ── Body Parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ── HTTP Logging (skip in test) ───────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

// ── Global Rate Limit ─────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/rooms',    roomRoutes);
app.use('/api/execute',  executeRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/problems', problemRoutes);

// ── Health Check ──────────────────────────────────────────────────
app.get('/health', async (_, res) => {
  let redisOk = false;
  let mongoOk = false;
  try {
    const { redisClient } = await import('./config/redis.js');
    if (redisClient) { await redisClient.ping(); redisOk = true; }
  } catch (_) {}
  try {
    const mongoose = (await import('mongoose')).default;
    mongoOk = mongoose.connection.readyState === 1;
  } catch (_) {}

  const status = redisOk && mongoOk ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    timestamp:  new Date().toISOString(),
    uptime:     process.uptime(),
    version:    '1.0.0',
    mongodb:    mongoOk  ? 'connected' : 'disconnected',
    redis:      redisOk  ? 'connected' : 'disconnected',
  });
});

app.get('/', (_, res) => {
  res.json({ message: 'CodeSync API', version: '1.0.0' });
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

// ── Global Error Handler ──────────────────────────────────────────
app.use(errorMiddleware);

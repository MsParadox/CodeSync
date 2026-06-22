import 'dotenv/config';
import { createServer } from 'http';
import { app } from './src/app.js';
import { initSocket } from './src/socket/index.js';
import { connectDB } from './src/config/db.js';
import { connectRedis } from './src/config/redis.js';
import { logger } from './src/utils/logger.js';
import { startSnapshotService, stopSnapshotService } from './src/services/snapshotService.js';
import { seedProblems } from './src/seed/problems.js';

const PORT = process.env.PORT || 4000;

async function bootstrap() {
  try {
    logger.info('🚀 CodeSync Server starting...');

    await connectDB();
    logger.info('✅ MongoDB connected');

    // Seed practice problems on first boot (idempotent)
    await seedProblems();

    await connectRedis();
    logger.info('✅ Redis connected');

    const httpServer = createServer(app);
    const io = initSocket(httpServer);

    // Start periodic snapshot service (saves Yjs docs to MongoDB every 60s)
    startSnapshotService(io);

    httpServer.listen(PORT, () => {
      logger.info(`✅ HTTP + WebSocket server running on port ${PORT}`);
      logger.info(`   Environment : ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   Client URL  : ${process.env.CLIENT_URL}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`⚠️  ${signal} received — shutting down gracefully`);
      stopSnapshotService();
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      // Force exit after 10s if connections are still open
      setTimeout(() => { logger.warn('Force exit after timeout'); process.exit(1); }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', err);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason);
      process.exit(1);
    });

  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();

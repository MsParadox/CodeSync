import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

// ── Retry strategy ────────────────────────────────────────────────

function makeRetryStrategy(clientName) {
  return (times) => {
    const delay = Math.min(times * 200, 5000); // cap at 5 seconds
    logger.warn(`Redis [${clientName}]: reconnect attempt #${times} in ${delay}ms`);
    return delay; // never return null — always keep trying
  };
}

const BASE_OPTIONS = {
  maxRetriesPerRequest: 3, // per-command retry (not connection retry)
  lazyConnect: true,
  enableReadyCheck: true,
  enableOfflineQueue: true, // queue commands while reconnecting instead of failing
  connectTimeout: 10000,
};

export let redisClient;
export let pubClient;
export let subClient;

export async function connectRedis() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL environment variable is not set');

  redisClient = new Redis(url, { ...BASE_OPTIONS, retryStrategy: makeRetryStrategy('main') });
  pubClient   = new Redis(url, { ...BASE_OPTIONS, retryStrategy: makeRetryStrategy('pub') });
  subClient   = new Redis(url, { ...BASE_OPTIONS, retryStrategy: makeRetryStrategy('sub') });

  const clients = [redisClient, pubClient, subClient];
  const names   = ['main', 'pub', 'sub'];

  for (const [i, client] of clients.entries()) {
    const name = names[i];

    client.on('error',        (err) => logger.error(`Redis [${name}] error: ${err.message}`));
    client.on('connect',      ()    => logger.info(`Redis [${name}] connected`));
    client.on('reconnecting', ()    => logger.warn(`Redis [${name}] reconnecting...`));
    client.on('ready',        ()    => logger.info(`Redis [${name}] ready`));
    client.on('close',        ()    => logger.warn(`Redis [${name}] connection closed`));

    await client.connect();
  }

  // Confirm the connection is alive
  const pong = await redisClient.ping();
  if (pong !== 'PONG') throw new Error('Redis ping failed');

  logger.info('✅ All Redis clients connected and verified');
}

export async function disconnectRedis() {
  await Promise.allSettled([
    redisClient?.quit(),
    pubClient?.quit(),
    subClient?.quit(),
  ]);
}

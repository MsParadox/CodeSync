import { yjsDocs, saveSnapshot } from '../socket/roomHandlers.js';
import { Snapshot } from '../models/Snapshot.js';
import { Execution } from '../models/Snapshot.js';
import { SessionEvent } from '../models/SessionEvent.js';
import { logger } from '../utils/logger.js';

const SNAPSHOT_INTERVAL_MS = 60 * 1000;   // periodic Yjs saves: every 60s

// ── Retention config ─────────────────────────────────────────────
// Snapshots:      keep last 20 per room (pruned on every save)
// Executions:     MongoDB TTL index handles this (set in Execution schema
//                 or manually — see docs/ARCHITECTURE.md)
// SessionEvents:  auto-expire after 30 days via TTL index in SessionEvent.js
const SNAPSHOT_RETENTION   = 20;

let snapshotInterval = null;

export function startSnapshotService() {
  // Defensive: don't start twice
  if (snapshotInterval) return snapshotInterval;

  logger.info('📸 Snapshot service started (interval: 60s)');
  logger.info(`   Retention: last ${SNAPSHOT_RETENTION} snapshots per room`);
  logger.info('   Session events: auto-expire after 30 days');

  snapshotInterval = setInterval(async () => {
    const roomIds = [...yjsDocs.keys()];
    if (roomIds.length === 0) return;

    logger.debug(`📸 Saving snapshots for ${roomIds.length} active room(s)…`);

    const results = await Promise.allSettled(
      roomIds.map((roomId) => saveSnapshot(roomId, null, 'periodic'))
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      logger.error(`📸 ${failed.length} snapshot(s) failed`, failed.map((r) => r.reason?.message));
    }
  }, SNAPSHOT_INTERVAL_MS);

  return snapshotInterval;
}

export function stopSnapshotService() {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
    logger.info('📸 Snapshot service stopped');
  }
}

// ── Retention stats (for health/admin endpoints) ─────────────────
export async function getRetentionStats() {
  const [snapshotCount, executionCount, sessionCount] = await Promise.all([
    Snapshot.countDocuments(),
    Execution.countDocuments(),
    SessionEvent.countDocuments(),
  ]);
  return { snapshots: snapshotCount, executions: executionCount, sessionEvents: sessionCount };
}

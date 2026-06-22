import * as Y from 'yjs';
import { yjsDocs, scheduleCheckpoint } from './roomHandlers.js';
import { logger } from '../utils/logger.js';

// Per-room throttle: max 50 updates/second across all sockets
const throttleMap = new Map();
const MAX_UPDATES_PER_SEC = 50;

// ── Permission guards ─────────────────────────────────────────────
function assertMembership(socket, roomId) {
  if (!roomId || !socket.rooms.has(roomId)) {
    logger.warn(`[yjs] Unauthorized: ${socket.user.username} not in room ${roomId}`);
    return false;
  }
  return true;
}

/** Viewers cannot push Yjs updates (read-only access) */
function assertCanEdit(socket, roomId) {
  if (!assertMembership(socket, roomId)) return false;
  const role = socket.roomRoles?.[roomId];
  if (role !== 'owner' && role !== 'editor') {
    // Silently drop — no error toast for every blocked keystroke
    logger.debug(`[yjs] Viewer ${socket.user.username} blocked from editing ${roomId}`);
    return false;
  }
  return true;
}

export function registerYjsHandlers(io, socket) {

  // ── yjs-update ── editor / owner only ───────────────────────
  socket.on('yjs-update', ({ roomId, update }) => {
    if (!assertCanEdit(socket, roomId)) return;
    if (!update) return;

    // Per-room throttle to prevent malicious or runaway clients
    const now = Date.now();
    if (!throttleMap.has(roomId)) throttleMap.set(roomId, { count: 0, lastReset: now });
    const t = throttleMap.get(roomId);
    if (now - t.lastReset > 1000) { t.count = 0; t.lastReset = now; }
    if (++t.count > MAX_UPDATES_PER_SEC) return;

    try {
      const binary = Uint8Array.from(atob(update), (c) => c.charCodeAt(0));
      const yjsDoc = yjsDocs.get(roomId);
      if (yjsDoc) {
        Y.applyUpdate(yjsDoc, binary, 'remote');
        // Debounced checkpoint for session replay — fires at most once
        // every 5s per room regardless of how many edits arrive.
        scheduleCheckpoint(roomId, socket.user._id, socket.user.username);
      }
    } catch (e) {
      logger.debug(`[yjs] Malformed update from ${socket.user.username}: ${e.message}`);
    }

    // Broadcast to all OTHER clients (viewers receive updates read-only)
    socket.to(roomId).emit('yjs-update', {
      update,
      userId: socket.user._id,
    });
  });

  // ── yjs-awareness ── all roles (cursors visible to everyone) ─
  socket.on('yjs-awareness', ({ roomId, awarenessUpdate }) => {
    if (!assertMembership(socket, roomId)) return;
    if (!awarenessUpdate) return;
    socket.to(roomId).emit('yjs-awareness', {
      awarenessUpdate,
      userId: socket.user._id,
    });
  });

  // ── request-sync ── all roles ────────────────────────────────
  socket.on('request-sync', ({ roomId }) => {
    if (!assertMembership(socket, roomId)) return;
    const yjsDoc = yjsDocs.get(roomId);
    if (!yjsDoc) return;
    const state = Y.encodeStateAsUpdate(yjsDoc);
    socket.emit('yjs-sync', {
      roomId,
      state: Buffer.from(state).toString('base64'),
    });
  });
}

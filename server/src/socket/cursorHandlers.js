import { redisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

function assertMembership(socket, roomId) {
  if (!roomId || !socket.rooms.has(roomId)) {
    logger.warn(`[cursor] Unauthorized: ${socket.user.username} not in room ${roomId}`);
    return false;
  }
  return true;
}

/** Viewers can broadcast cursor/awareness (they're watching) */
function assertCanParticipate(socket, roomId) {
  return assertMembership(socket, roomId);
}

export function registerCursorHandlers(io, socket) {

  // ── cursor-update ── all roles (viewers have a read cursor too) ─
  socket.on('cursor-update', ({ roomId, line, column }) => {
    if (!assertCanParticipate(socket, roomId)) return;
    if (line === undefined || column === undefined) return;

    redisClient
      .hset(`room:${roomId}:cursors`, socket.user._id.toString(),
        `${line}:${column}:${socket.userColor}`)
      .catch(() => {});

    socket.to(roomId).emit('cursor-update', {
      userId:   socket.user._id,
      username: socket.user.username,
      avatar:   socket.user.avatar,
      color:    socket.userColor,
      role:     socket.roomRoles?.[roomId] || 'editor',
      line,
      column,
    });
  });

  // ── selection-update ── all roles ────────────────────────────
  socket.on('selection-update', ({ roomId, startLine, startColumn, endLine, endColumn }) => {
    if (!assertCanParticipate(socket, roomId)) return;
    socket.to(roomId).emit('selection-update', {
      userId:      socket.user._id,
      username:    socket.user.username,
      color:       socket.userColor,
      role:        socket.roomRoles?.[roomId] || 'editor',
      startLine,   startColumn,
      endLine,     endColumn,
    });
  });

  // ── typing indicators ── editor / owner only ─────────────────
  socket.on('typing-start', ({ roomId }) => {
    const role = socket.roomRoles?.[roomId];
    if (!assertMembership(socket, roomId)) return;
    if (role !== 'owner' && role !== 'editor') return; // viewers don't type
    socket.to(roomId).emit('user-typing', {
      userId:   socket.user._id,
      username: socket.user.username,
      color:    socket.userColor,
    });
  });

  socket.on('typing-stop', ({ roomId }) => {
    if (!assertMembership(socket, roomId)) return;
    socket.to(roomId).emit('user-stopped-typing', { userId: socket.user._id });
  });
}

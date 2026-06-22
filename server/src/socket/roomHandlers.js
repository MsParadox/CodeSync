import * as Y from 'yjs';
import { redisClient } from '../config/redis.js';
import { Room } from '../models/Room.js';
import { Snapshot } from '../models/Snapshot.js';
import { SessionEvent } from '../models/SessionEvent.js';
import { Submission } from '../models/Submission.js';
import { generateColor } from '../utils/generateColor.js';
import { sanitizeText } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';

// ── In-memory Y.Doc store for this server instance ───────────────
export const yjsDocs = new Map();

// ── Checkpoint throttle: one Yjs checkpoint per room per 5 seconds ─
const checkpointTimers = new Map();
const CHECKPOINT_INTERVAL_MS = 5000;

// ── Presence heartbeat TTL: 90 seconds ───────────────────────────
const HEARTBEAT_TTL = 90;

// ── Permission guards ─────────────────────────────────────────────

/** Check socket is in the Socket.IO room */
function assertMembership(socket, roomId) {
  if (!roomId || !socket.rooms.has(roomId)) {
    logger.warn(
      `Unauthorized socket event: socket ${socket.id} ` +
      `(user: ${socket.user.username}) is not in room ${roomId}`
    );
    return false;
  }
  return true;
}

/** Check socket has editor or owner role */
function assertCanEdit(socket, roomId) {
  if (!assertMembership(socket, roomId)) return false;
  const role = socket.roomRoles?.[roomId];
  if (role !== 'owner' && role !== 'editor') {
    socket.emit('error', {
      code: 'PERMISSION_DENIED',
      message: 'Viewers cannot edit. Ask the owner to upgrade your role.',
    });
    return false;
  }
  return true;
}

/** Check socket has owner role */
function assertIsOwner(socket, roomId) {
  if (!assertMembership(socket, roomId)) return false;
  if (socket.roomRoles?.[roomId] !== 'owner') {
    socket.emit('error', {
      code: 'PERMISSION_DENIED',
      message: 'Only the room owner can perform this action.',
    });
    return false;
  }
  return true;
}

// ── Session event helpers ─────────────────────────────────────────

async function recordEvent(roomId, userId, username, eventType, data = {}) {
  try {
    await SessionEvent.create({ roomId, userId, username, eventType, data });
  } catch (err) {
    logger.debug(`Session event record failed (${eventType}): ${err.message}`);
  }
}

/** Schedule a Yjs checkpoint — debounced so rapid updates don't spam DB */
export function scheduleCheckpoint(roomId, userId, username) {
  if (checkpointTimers.has(roomId)) return; // already scheduled
  const timer = setTimeout(async () => {
    checkpointTimers.delete(roomId);
    const yjsDoc = yjsDocs.get(roomId);
    if (!yjsDoc) return;
    try {
      const state = Y.encodeStateAsUpdate(yjsDoc);
      await SessionEvent.create({
        roomId,
        userId,
        username,
        eventType: 'yjs_checkpoint',
        yjsState: Buffer.from(state),
        data: { codeLength: yjsDoc.getText('code').length },
      });
      // Keep only last 200 checkpoints to prevent storage bloat
      await SessionEvent.pruneCheckpoints(roomId, 200);
    } catch (err) {
      logger.debug(`Checkpoint failed for ${roomId}: ${err.message}`);
    }
  }, CHECKPOINT_INTERVAL_MS);
  checkpointTimers.set(roomId, timer);
}

// ── Main handler registration ─────────────────────────────────────

export function registerRoomHandlers(io, socket) {
  const { user } = socket;
  // roomRoles stores per-room role: { [roomId]: 'owner' | 'editor' | 'viewer' }
  if (!socket.roomRoles) socket.roomRoles = {};

  // ── join-room ─────────────────────────────────────────────────
  socket.on('join-room', async ({ roomId, password }) => {
    try {
      if (!roomId) {
        return socket.emit('error', { code: 'INVALID_ROOM_ID', message: 'Room ID is required' });
      }

      const room = await Room.findOne({ roomId, archived: false });
      if (!room) {
        return socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room does not exist' });
      }

      // ── Auto-leave previous room to prevent ghost membership ──
      if (socket.currentRoomId && socket.currentRoomId !== roomId) {
        logger.debug(`Auto-leaving ${socket.currentRoomId} before joining ${roomId}`);
        await handleLeaveRoom(io, socket, socket.currentRoomId);
      }

      // ── Resolve role ───────────────────────────────────────────
      let role = room.getMemberRole(user._id);

      // Private rooms: password check allows entry as editor if no explicit role
      if (room.isPrivate && role === null) {
        const ok = await room.verifyPassword(password || '');
        if (!ok) {
          return socket.emit('error', { code: 'WRONG_PASSWORD', message: 'Incorrect room password' });
        }
        role = 'editor'; // password = enter as editor
      }

      // Public rooms: unknown users default to 'editor' (getMemberRole already handles this)
      if (role === null) {
        return socket.emit('error', { code: 'ACCESS_DENIED', message: 'You do not have access to this room' });
      }

      // ── Participant cap ────────────────────────────────────────
      const memberCount = await redisClient.scard(`room:${roomId}:users`).catch(() => 0);
      if (memberCount >= room.maxParticipants) {
        return socket.emit('error', {
          code: 'ROOM_FULL',
          message: `Room is full (max ${room.maxParticipants})`,
        });
      }

      socket.join(roomId);
      socket.currentRoomId = roomId;
      socket.roomRoles[roomId] = role;

      const color = generateColor(user._id.toString());
      socket.userColor = color;

      // ── Redis: track active users + heartbeat ─────────────────
      const pipeline = redisClient.pipeline();
      pipeline.sadd(`room:${roomId}:users`, user._id.toString());
      pipeline.expire(`room:${roomId}:users`, 86400);
      pipeline.hset(`room:${roomId}:meta`, {
        language: room.language,
        name: room.name,
        lastActiveAt: Date.now().toString(),
      });
      pipeline.expire(`room:${roomId}:meta`, 86400);
      // Presence heartbeat key — refreshed on every ping
      pipeline.set(
        `room:${roomId}:heartbeat:${user._id}`,
        Date.now().toString(),
        'EX',
        HEARTBEAT_TTL
      );
      await pipeline.exec().catch((err) =>
        logger.warn(`Redis pipeline error on join: ${err.message}`)
      );

      // ── Create / restore Y.Doc ────────────────────────────────
      if (!yjsDocs.has(roomId)) {
        const yjsDoc = new Y.Doc();
        const snapshot = await Snapshot.findOne({ roomId }).sort({ savedAt: -1 }).lean();
        if (snapshot?.yjsState) {
          try {
            Y.applyUpdate(yjsDoc, snapshot.yjsState, 'snapshot');
          } catch (e) {
            logger.warn(`Snapshot apply failed for ${roomId}: ${e.message}`);
          }
        }
        yjsDocs.set(roomId, yjsDoc);
        logger.info(`Y.Doc created for room ${roomId}`);
      }

      const yjsDoc  = yjsDocs.get(roomId);
      const yjsState = Y.encodeStateAsUpdate(yjsDoc);

      socket.emit('room-joined', {
        roomId,
        name:             room.name,
        language:         room.language,
        yjsState:         Buffer.from(yjsState).toString('base64'),
        color,
        role,                          // ← NEW: client gets its own role
        interviewMode:    room.interviewMode,
        problemStatement: room.problemStatement,
        // Authoritative interview timing so late joiners get the SAME
        // remaining time as everyone else (fixes 45m vs 15m mismatch).
        interviewDurationMinutes: room.interviewDurationMinutes || 45,
        interviewStartedAt:       room.interviewStartedAt ? room.interviewStartedAt.toISOString() : null,
        testCaseCount:    (room.testCases || []).length,
        isOwner:          role === 'owner',
        tags:             room.tags,
      });

      socket.to(roomId).emit('user-joined', {
        userId:   user._id,
        username: user.username,
        avatar:   user.avatar,
        color,
        role,
      });

      const participants = await buildParticipantList(io, roomId);
      io.to(roomId).emit('participant-list', participants);

      Room.findOneAndUpdate({ roomId }, { lastActiveAt: new Date() }).catch(() => {});

      // Record join event
      await recordEvent(roomId, user._id, user.username, 'join', { role });

      logger.info(`${user.username} (${role}) joined room ${roomId}`);
    } catch (err) {
      logger.error('join-room error:', err);
      socket.emit('error', { code: 'SERVER_ERROR', message: 'Failed to join room' });
    }
  });

  // ── leave-room ────────────────────────────────────────────────
  socket.on('leave-room', async ({ roomId }) => {
    await handleLeaveRoom(io, socket, roomId || socket.currentRoomId);
  });

  socket.on('disconnect', async () => {
    if (socket.currentRoomId) {
      await handleLeaveRoom(io, socket, socket.currentRoomId);
    }
  });

  // ── heartbeat ── refresh Redis presence TTL ──────────────────
  socket.on('heartbeat', async ({ roomId: hbRoomId }) => {
    const rid = hbRoomId || socket.currentRoomId;
    if (!rid || !socket.rooms.has(rid)) return;
    await redisClient
      .set(`room:${rid}:heartbeat:${user._id}`, Date.now().toString(), 'EX', HEARTBEAT_TTL)
      .catch(() => {});
  });

  // ── chat-message ── editor / owner only ─────────────────────
  socket.on('chat-message', ({ roomId, text }) => {
    if (!assertCanEdit(socket, roomId)) return;
    if (!text || typeof text !== 'string') return;
    const clean = sanitizeText(text.trim());
    if (!clean || clean.length > 500) return;

    const msg = {
      userId:    user._id,
      username:  user.username,
      avatar:    user.avatar,
      color:     socket.userColor,
      text:      clean,
      timestamp: new Date().toISOString(),
    };
    io.to(roomId).emit('chat-message', msg);

    // Record chat in session timeline (non-blocking)
    recordEvent(roomId, user._id, user.username, 'chat', { text: clean }).catch(() => {});
  });

  // ── language-change ── editors / owner ───────────────────────
  // Editors (including interview candidates) may pick the language they
  // code in; viewers cannot.
  socket.on('language-change', async ({ roomId, language }) => {
    if (!assertCanEdit(socket, roomId)) return;

    const VALID = ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];
    if (!VALID.includes(language)) return;

    await redisClient.hset(`room:${roomId}:meta`, 'language', language).catch(() => {});
    Room.findOneAndUpdate({ roomId }, { language }).catch(() => {});

    io.to(roomId).emit('language-changed', { language, changedBy: user.username });

    recordEvent(roomId, user._id, user.username, 'language_change', { language });
  });

  // ── interview-mode ── owner only ─────────────────────────────
  socket.on('set-interview-mode', async ({ roomId, enabled, problemStatement, durationMinutes }) => {
    if (!assertIsOwner(socket, roomId)) return;

    const room = await Room.findOne({ roomId });
    if (!room) return;

    const wasOn = room.interviewMode;
    // Stamp the start time only on the off→on transition; editing the
    // problem statement mid-session must NOT reset the running clock.
    let startedAt;
    if (enabled && !wasOn)        startedAt = new Date();
    else if (enabled && wasOn)    startedAt = room.interviewStartedAt || new Date();
    else                          startedAt = null;

    const duration = enabled
      ? (durationMinutes || room.interviewDurationMinutes || 45)
      : (room.interviewDurationMinutes || 45);

    room.interviewMode            = enabled;
    room.problemStatement         = problemStatement || '';
    room.interviewStartedAt       = startedAt;
    room.interviewDurationMinutes = duration;
    await room.save();

    io.to(roomId).emit('interview-mode-changed', {
      enabled,
      problemStatement: problemStatement || '',
      durationMinutes:  duration,
      startedBy:        user.username,
      startedAt:        startedAt ? startedAt.toISOString() : null,
    });

    recordEvent(roomId, user._id, user.username,
      enabled ? 'interview_start' : 'interview_end',
      { problemStatement, durationMinutes: duration }
    );
  });

  // ── interview-submit ── editor / owner ───────────────────────
  // Candidate submits their solution. We PERSIST the submitted code (from
  // the authoritative server-side Y.Doc, falling back to the code the
  // client sent) so the interviewer can review every submission later,
  // then notify the room and timeline it.
  socket.on('interview-submit', async ({ roomId, result }) => {
    if (!assertCanEdit(socket, roomId)) return;

    const doc  = yjsDocs.get(roomId);
    const code = (doc ? doc.getText('code').toString() : '') || result?.code || '';
    const submittedAt = new Date();

    try {
      await Submission.create({
        roomId,
        userId:   user._id,
        username: user.username,
        avatar:   user.avatar,
        language: result?.language || 'javascript',
        code:     code.slice(0, 100000),
        status:   result?.status || 'unknown',
        exitCode: result?.exitCode ?? 0,
        stdout:   (result?.stdout || '').slice(0, 20000),
        stderr:   (result?.stderr || '').slice(0, 20000),
        executionTimeMs: result?.executionTimeMs || 0,
        submittedAt,
      });
    } catch (err) {
      logger.error(`Submission save failed (${roomId}): ${err.message}`);
    }

    io.to(roomId).emit('interview-submitted', {
      userId:    user._id,
      username:  user.username,
      avatar:    user.avatar,
      status:    result?.status || 'unknown',
      language:  result?.language,
      executionTimeMs: result?.executionTimeMs,
      submittedAt: submittedAt.toISOString(),
    });
    recordEvent(roomId, user._id, user.username, 'execute', {
      submission: true,
      status:   result?.status,
      language: result?.language,
    });
  });

  // ── execution broadcasts ── editor / owner only ──────────────
  socket.on('broadcast-execution-started', ({ roomId }) => {
    if (!assertCanEdit(socket, roomId)) return;
    socket.to(roomId).emit('execution-started', {
      userId:   user._id,
      username: user.username,
    });
  });

  socket.on('broadcast-execution-result', ({ roomId, result }) => {
    if (!assertCanEdit(socket, roomId)) return;
    const broadcast = {
      ...result,
      executedBy: { userId: user._id, username: user.username, avatar: user.avatar },
    };
    socket.to(roomId).emit('execution-result', broadcast);

    recordEvent(roomId, user._id, user.username, 'execute', {
      language: result.language,
      status:   result.status,
      exitCode: result.exitCode,
      executionTimeMs: result.executionTimeMs,
    });
  });

  // ── role-updated ── broadcast when owner changes a member's role ─
  socket.on('role-updated', ({ roomId, targetUserId, newRole }) => {
    if (!assertIsOwner(socket, roomId)) return;
    // Update all sockets in the room that belong to this user
    io.in(roomId).fetchSockets().then((sockets) => {
      for (const s of sockets) {
        if (String(s.user?._id) === String(targetUserId)) {
          if (!s.roomRoles) s.roomRoles = {};
          s.roomRoles[roomId] = newRole;
          s.emit('your-role-changed', { roomId, role: newRole });
        }
      }
      io.to(roomId).emit('participant-role-changed', { userId: targetUserId, role: newRole });
    }).catch(() => {});
  });
}

// ── handleLeaveRoom ───────────────────────────────────────────────
async function handleLeaveRoom(io, socket, roomId) {
  if (!roomId) return;
  socket.leave(roomId);
  socket.currentRoomId = null;
  if (socket.roomRoles) delete socket.roomRoles[roomId];

  // Cancel pending checkpoint timer
  const timer = checkpointTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    checkpointTimers.delete(roomId);
  }

  try {
    const pipeline = redisClient.pipeline();
    pipeline.srem(`room:${roomId}:users`, socket.user._id.toString());
    pipeline.hdel(`room:${roomId}:cursors`, socket.user._id.toString());
    pipeline.del(`room:${roomId}:heartbeat:${socket.user._id}`);
    await pipeline.exec().catch((err) =>
      logger.warn(`Redis pipeline error on leave: ${err.message}`)
    );

    socket.to(roomId).emit('user-left', {
      userId:   socket.user._id,
      username: socket.user.username,
    });

    const participants = await buildParticipantList(io, roomId);
    io.to(roomId).emit('participant-list', participants);

    const remaining = await redisClient.scard(`room:${roomId}:users`).catch(() => 1);
    if (remaining === 0) {
      await saveSnapshot(roomId, socket.user._id, 'room-empty');
      yjsDocs.delete(roomId);
      logger.info(`Room ${roomId} empty — Y.Doc released`);
    }

    await recordEvent(roomId, socket.user._id, socket.user.username, 'leave', {});
  } catch (err) {
    logger.error(`handleLeaveRoom error (${roomId}):`, err.message);
  }
}

async function buildParticipantList(io, roomId) {
  try {
    const sockets = await io.in(roomId).fetchSockets();
    return sockets.map((s) => ({
      userId:   s.user._id,
      username: s.user.username,
      avatar:   s.user.avatar,
      color:    s.userColor,
      role:     s.roomRoles?.[roomId] || 'editor',
      socketId: s.id,
    }));
  } catch {
    return [];
  }
}

export async function saveSnapshot(roomId, userId, reason = 'periodic') {
  const yjsDoc = yjsDocs.get(roomId);
  if (!yjsDoc) return;
  try {
    const yjsState = Y.encodeStateAsUpdate(yjsDoc);
    const codeText = yjsDoc.getText('code').toString();
    if (!codeText.trim()) return;

    await Snapshot.create({
      roomId, yjsState: Buffer.from(yjsState),
      code: codeText, savedBy: userId, triggerReason: reason,
    });
    await Snapshot.pruneOld(roomId, 20);

    // Also persist a replay checkpoint so the session can always be played
    // back (in addition to the debounced 5s checkpoints from live edits).
    await SessionEvent.create({
      roomId, userId, username: 'system',
      eventType: 'yjs_checkpoint',
      yjsState: Buffer.from(yjsState),
      data: { reason, codeLength: codeText.length },
    }).catch(() => {});
    await SessionEvent.pruneCheckpoints(roomId, 200).catch(() => {});

    await recordEvent(roomId, userId, 'system', 'snapshot', { reason, codeLength: codeText.length });

    logger.debug(`Snapshot saved for room ${roomId} (${reason})`);
  } catch (err) {
    logger.error(`Snapshot save failed (${roomId}):`, err.message);
  }
}

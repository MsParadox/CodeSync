import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useDispatch, useSelector } from 'react-redux';
import { selectToken } from '../store/authSlice.js';
import {
  setConnectionStatus, setRoom, clearRoom,
  setParticipants, addParticipant, removeParticipant,
  addChatMessage, updateRemoteCursor,
  setCurrentOutput, setInterviewMode,
  setLanguage, setError, setUserRole, updateParticipantRole,
} from '../store/roomSlice.js';
import toast from 'react-hot-toast';
import { api } from '../services/api.js';

// Presence heartbeat — refreshes Redis TTL every 20 seconds
const HEARTBEAT_INTERVAL_MS = 20_000;

export function useSocket() {
  const socketRef    = useRef(null);
  const heartbeatRef = useRef(null);
  const dispatch     = useDispatch();
  const token        = useSelector(selectToken);

  // ── Connect ───────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

    const socket = io(import.meta.env.VITE_SOCKET_URL || '', {
      auth:                 { token },
      transports:           ['websocket', 'polling'],
      reconnectionAttempts: Infinity,     // never give up reconnecting
      reconnectionDelay:    1000,
      reconnectionDelayMax: 8000,
    });

    socketRef.current = socket;
    dispatch(setConnectionStatus('connecting'));


    socket.io.on('reconnect_attempt', () => {
      dispatch(setConnectionStatus('connecting'));
      // api.js keeps localStorage in sync after every token refresh,
      // so localStorage always has the freshest available token.
      const freshToken = localStorage.getItem('cs_token') || token;
      if (freshToken) socket.auth.token = freshToken;
    });

    // ── Connection lifecycle ──────────────────────────────────────
    socket.on('connect', () => {
      dispatch(setConnectionStatus('connected'));
      startHeartbeat(socket);
    });

    socket.on('disconnect', (reason) => {
      dispatch(setConnectionStatus('disconnected'));
      stopHeartbeat();
      if (reason === 'io server disconnect') {
        toast.error('Disconnected by server');
      }
    });

    socket.on('connect_error', (err) => {
      dispatch(setConnectionStatus('error'));
      console.error('[socket] connect_error:', err.message);

      // ── Closes the "JWT expires during collaboration" gap ──────────
      // INVALID_TOKEN means socketAuthMiddleware rejected the handshake
      // (access token expired). localStorage['cs_token'] only gets
      // refreshed as a side-effect of an HTTP 401 via api.js's
      // interceptor — if the user has been purely socket-connected with
      // no HTTP calls, that token is stale. Proactively hit a cheap
      // authenticated endpoint so api.js's interceptor refreshes
      // cs_token BEFORE Socket.IO's next reconnect_attempt (1-8s later)
      // picks it up.
      if (err.message === 'INVALID_TOKEN') {
        api.get('/auth/me').catch(() => {});
      }
    });

  
    socket.io.on('reconnect', () => {
      dispatch(setConnectionStatus('connected'));
      toast.success('Reconnected ✓', { duration: 2500 });

      startHeartbeat(socket);

      // Re-join the room we were in before the disconnect
      const prevRoomId = socket._currentRoomId;
      if (prevRoomId) {
        socket.emit('join-room', { roomId: prevRoomId });
      }
    });

    // ── Room events ───────────────────────────────────────────────
    socket.on('room-joined', (payload) => {
      socket._currentRoomId = payload.roomId;
      dispatch(setRoom(payload));
    });

    socket.on('error', ({ code, message }) => {
      toast.error(message || 'Socket error');
      dispatch(setError(message));
    });

    socket.on('participant-list',  (list)   => dispatch(setParticipants(list)));

    socket.on('user-joined', (user) => {
      dispatch(addParticipant(user));
      const badge = user.role === 'viewer' ? ' 👁' : '';
      toast(`${user.username}${badge} joined`, {
        icon: '👤', duration: 2500,
        style: { borderLeft: `3px solid ${user.color}` },
      });
    });

    socket.on('user-left', ({ userId, username }) => {
      dispatch(removeParticipant(userId));
      toast(`${username} left`, { icon: '👋', duration: 2000 });
    });

    // ── Permission events ─────────────────────────────────────────
    socket.on('your-role-changed', ({ role }) => {
      dispatch(setUserRole(role));
      const msg = role === 'viewer'
        ? 'You are now a viewer — editing disabled'
        : `Your role changed to ${role}`;
      toast(msg, { icon: role === 'viewer' ? '👁' : '✏️', duration: 4000 });
    });

    socket.on('participant-role-changed', ({ userId, role }) => {
      dispatch(updateParticipantRole({ userId, role }));
    });

    // ── Chat ──────────────────────────────────────────────────────
    socket.on('chat-message', (msg) => dispatch(addChatMessage(msg)));

    // ── Cursor ────────────────────────────────────────────────────
    socket.on('cursor-update', (data) => dispatch(updateRemoteCursor(data)));

    // ── Language ──────────────────────────────────────────────────
    socket.on('language-changed', ({ language, changedBy }) => {
      dispatch(setLanguage(language));
      toast(`Language → ${language} (by ${changedBy})`, { icon: '💻', duration: 2500 });
    });

    // ── Execution ─────────────────────────────────────────────────
    socket.on('execution-started', ({ username }) => {
      toast.loading(`${username} is running code…`, { id: 'remote-exec', duration: 6000 });
    });

    socket.on('execution-result', (result) => {
      toast.dismiss('remote-exec');
      dispatch(setCurrentOutput(result));
      const { executedBy, status } = result;
      if      (status === 'success') toast.success(`${executedBy.username}'s code ran ✓`,        { duration: 2500 });
      else if (status === 'timeout') toast.error(`${executedBy.username}'s code timed out`,       { duration: 2500 });
      else                           toast.error(`${executedBy.username}'s code returned an error`, { duration: 2500 });
    });

    // ── Interview ─────────────────────────────────────────────────
    socket.on('interview-mode-changed', (data) => {
      dispatch(setInterviewMode({
        enabled:          data.enabled,
        problemStatement: data.problemStatement,
        durationMinutes:  data.durationMinutes,
        startedAt:        data.startedAt,
      }));
      if (data.enabled) toast(`🎯 Interview started by ${data.startedBy}`, { duration: 4000 });
      else              toast('Interview mode ended', { duration: 2000 });
    });

    socket.on('interview-submitted', (data) => {
      let verdict;
      if (data.testsTotal) {
        verdict = data.accepted
          ? `Accepted ✓ (${data.testsPassed}/${data.testsTotal})`
          : `failed hidden tests (${data.testsPassed}/${data.testsTotal})`;
      } else {
        verdict = data.accepted ? 'ran successfully ✓' : (data.status || 'submitted');
      }
      toast(`📨 ${data.username} submitted — ${verdict}`, {
        icon: '📨', duration: 5000,
        style: { borderLeft: `3px solid ${data.accepted ? '#00ff9d' : '#ff3d6a'}` },
      });
    });

    socket.on('pong', () => {});

    return socket;
  }, [token, dispatch]);

  // ── Heartbeat helpers ─────────────────────────────────────────
  function startHeartbeat(socket) {
    stopHeartbeat();
    heartbeatRef.current = setInterval(() => {
      const roomId = socket._currentRoomId;
      if (roomId && socket.connected) {
        socket.emit('heartbeat', { roomId });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }

  // ── Disconnect ────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    stopHeartbeat();
    if (socketRef.current) {
      socketRef.current._currentRoomId = null;
      socketRef.current.disconnect();
      socketRef.current = null;
      dispatch(clearRoom());
    }
  }, [dispatch]);

  // ── Emit helpers ──────────────────────────────────────────────
  const joinRoom = useCallback((roomId, pw) => {
    socketRef.current?.emit('join-room', { roomId, password: pw });
  }, []);

  const leaveRoom = useCallback((roomId) => {
    if (socketRef.current) {
      socketRef.current._currentRoomId = null;
      socketRef.current.emit('leave-room', { roomId });
    }
    dispatch(clearRoom());
  }, [dispatch]);

  const sendChatMessage      = useCallback((r, text)   => socketRef.current?.emit('chat-message',                { roomId: r, text }), []);
  const sendCursorUpdate     = useCallback((r, l, c)   => socketRef.current?.emit('cursor-update',               { roomId: r, line: l, column: c }), []);
  const sendSelectionUpdate  = useCallback((r, sel)    => socketRef.current?.emit('selection-update',            { roomId: r, ...sel }), []);
  const sendLanguageChange   = useCallback((r, lang)   => socketRef.current?.emit('language-change',             { roomId: r, language: lang }), []);
  const broadcastExecStarted = useCallback((r)         => socketRef.current?.emit('broadcast-execution-started', { roomId: r }), []);
  const broadcastExecResult  = useCallback((r, result) => socketRef.current?.emit('broadcast-execution-result',  { roomId: r, result }), []);
  const setInterviewModeSocket = useCallback((r, en, ps, mins) =>
    socketRef.current?.emit('set-interview-mode', { roomId: r, enabled: en, problemStatement: ps, durationMinutes: mins }), []);
  const submitInterview      = useCallback((r, result) => socketRef.current?.emit('interview-submit', { roomId: r, result }), []);
  const sendTypingStart      = useCallback((r) => socketRef.current?.emit('typing-start', { roomId: r }), []);
  const sendTypingStop       = useCallback((r) => socketRef.current?.emit('typing-stop',  { roomId: r }), []);
  const requestSync          = useCallback((r) => socketRef.current?.emit('request-sync', { roomId: r }), []);
  const pingServer           = useCallback(()  => socketRef.current?.emit('ping'), []);
  const updateMemberRole     = useCallback((r, userId, role) =>
    socketRef.current?.emit('role-updated', { roomId: r, targetUserId: userId, newRole: role }), []);

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => () => stopHeartbeat(), []);

  return {
    socket: socketRef.current,
    connect, disconnect,
    joinRoom, leaveRoom,
    sendChatMessage, sendCursorUpdate, sendSelectionUpdate,
    sendLanguageChange, broadcastExecStarted, broadcastExecResult,
    setInterviewModeSocket, submitInterview, sendTypingStart, sendTypingStop,
    requestSync, pingServer, updateMemberRole,
    getSocket: () => socketRef.current,
  };
}

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../services/api.js';

// ── Async Thunks ─────────────────────────────────────────────────

export const createRoom = createAsyncThunk('room/create', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/rooms', payload);
    return data.room;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to create room');
  }
});

export const fetchRoom = createAsyncThunk('room/fetch', async (roomId, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/rooms/${roomId}`);
    return data.room;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Room not found');
  }
});

export const executeCode = createAsyncThunk('room/execute', async ({ language, code, stdin, roomId }, { rejectWithValue }) => {
  try {
    // Longer timeout than the default 15s: the FIRST run of a language
    // may have to pull a large Docker image (gcc/rust/jdk are hundreds of
    // MB to >1GB) before the (≤10s) execution itself begins.
    const { data } = await api.post('/execute', { language, code, stdin, roomId }, { timeout: 180000 });
    return data;
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return rejectWithValue('Execution timed out — the language image may still be downloading on first use. Please try again in a moment.');
    }
    return rejectWithValue(err.response?.data?.error || 'Execution failed');
  }
});

export const fetchExecutionHistory = createAsyncThunk('room/fetchHistory', async (roomId, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/execute/history?roomId=${roomId}&limit=10`);
    return data.executions;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to fetch history');
  }
});

export const fetchPublicRooms = createAsyncThunk('room/fetchPublic', async (params = {}, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/rooms', { params });
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to fetch rooms');
  }
});

export const fetchRoomMembers = createAsyncThunk('room/fetchMembers', async (roomId, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/rooms/${roomId}/members`);
    return data.members;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to fetch members');
  }
});

export const fetchSessionReplay = createAsyncThunk('room/fetchReplay', async ({ roomId, includeCode = false }, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/rooms/${roomId}/replay`, { params: { includeCode } });
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to fetch replay');
  }
});

// ── Slice ────────────────────────────────────────────────────────

const roomSlice = createSlice({
  name: 'room',
  initialState: {
    // Current room
    roomId: null,
    roomName: null,
    language: 'javascript',
    isOwner: false,
    userRole: null,            // 'owner' | 'editor' | 'viewer'
    interviewMode: false,
    problemStatement: '',
    interviewDuration: 45,
    interviewStartedAt: null,
    testCaseCount: 0,
    tags: [],

    // Collaboration
    participants: [],
    remoteCursors: {},
    userColor: null,

    // Chat
    chatMessages: [],

    // Execution
    executionHistory: [],
    currentOutput: null,
    isExecuting: false,
    executionError: null,
    stdinValue: '',

    // Room browser
    publicRooms: [],
    publicRoomsPagination: null,
    publicRoomsLoading: false,

    // Members / replay
    members: [],
    replayEvents: [],
    replayLoading: false,

    // UI state
    isChatOpen: false,
    isParticipantOpen: true,
    isOutputOpen: true,
    editorFontSize: (() => {
      const v = parseInt(typeof localStorage !== 'undefined' && localStorage.getItem('cs_fontSize'));
      return Number.isFinite(v) ? Math.min(Math.max(v, 10), 24) : 14;
    })(),

    // Status
    connectionStatus: 'disconnected',
    loading: false,
    error: null,
  },
  reducers: {
    // Room setup
    setRoom: (state, { payload }) => {
      state.roomId           = payload.roomId;
      state.roomName         = payload.name;
      state.language         = payload.language;
      state.isOwner          = payload.isOwner;
      state.userRole         = payload.role || (payload.isOwner ? 'owner' : 'editor');
      state.interviewMode    = payload.interviewMode;
      state.problemStatement = payload.problemStatement;
      if (payload.testCaseCount !== undefined) state.testCaseCount = payload.testCaseCount;
      // Authoritative interview timing from the server, so every joiner —
      // early or late — sees the SAME duration and remaining time.
      if (payload.interviewMode) {
        state.interviewDuration  = payload.interviewDurationMinutes || 45;
        state.interviewStartedAt = payload.interviewStartedAt
          || state.interviewStartedAt
          || new Date().toISOString();
      } else {
        state.interviewDuration  = 45;
        state.interviewStartedAt = null;
      }
      state.tags             = payload.tags || [];
      state.userColor        = payload.color;
    },
    clearRoom: (state) => {
      state.roomId = null;
      state.roomName = null;
      state.participants = [];
      state.remoteCursors = {};
      state.chatMessages = [];
      state.currentOutput = null;
      state.userRole = null;
      state.members = [];
      state.interviewMode = false;
      state.problemStatement = '';
      state.interviewDuration = 45;
      state.interviewStartedAt = null;
      state.connectionStatus = 'disconnected';
    },

    // Role update from server (when owner changes your role mid-session)
    setUserRole: (state, { payload }) => {
      state.userRole = payload;
      state.isOwner  = payload === 'owner';
    },

    // Language
    setLanguage: (state, { payload }) => { state.language = payload; },

    // Connection
    setConnectionStatus: (state, { payload }) => { state.connectionStatus = payload; },

    // Participants — now includes role
    setParticipants: (state, { payload }) => { state.participants = payload; },
    addParticipant: (state, { payload }) => {
      if (!state.participants.some((p) => String(p.userId) === String(payload.userId))) {
        state.participants.push(payload);
      }
    },
    removeParticipant: (state, { payload }) => {
      state.participants = state.participants.filter((p) => String(p.userId) !== String(payload));
      const { [payload]: _, ...rest } = state.remoteCursors;
      state.remoteCursors = rest;
    },
    updateParticipantRole: (state, { payload: { userId, role } }) => {
      const idx = state.participants.findIndex((p) => String(p.userId) === String(userId));
      if (idx >= 0) state.participants[idx].role = role;
    },

    // Cursors
    updateRemoteCursor: (state, { payload }) => {
      state.remoteCursors[payload.userId] = {
        line: payload.line, column: payload.column,
        color: payload.color, username: payload.username,
      };
    },
    removeRemoteCursor: (state, { payload }) => { delete state.remoteCursors[payload]; },

    // Chat
    addChatMessage: (state, { payload }) => {
      state.chatMessages.push(payload);
      if (state.chatMessages.length > 200) state.chatMessages.shift();
    },
    clearChat: (state) => { state.chatMessages = []; },

    // Output / execution
    setCurrentOutput: (state, { payload }) => { state.currentOutput = payload; },
    clearCurrentOutput: (state) => { state.currentOutput = null; },
    setStdinValue: (state, { payload }) => { state.stdinValue = payload; },
    addToExecutionHistory: (state, { payload }) => {
      state.executionHistory.unshift(payload);
      if (state.executionHistory.length > 10) state.executionHistory.pop();
    },
    setExecutionHistory: (state, { payload }) => { state.executionHistory = payload; },

    // Hidden test case count (owner updates after editing test cases)
    setRoomTestCaseCount: (state, { payload }) => { state.testCaseCount = payload; },

    // Interview mode
    setInterviewMode: (state, { payload }) => {
      const wasOn = state.interviewMode;
      state.interviewMode    = payload.enabled;
      state.problemStatement = payload.problemStatement || '';
      if (payload.enabled) {
        if (payload.durationMinutes) state.interviewDuration = payload.durationMinutes;
        // Stamp the start time only on the off→on transition. Subsequent
        // events (e.g. the owner editing the problem statement) must NOT
        // reset the running countdown, so we keep the existing value.
        if (!wasOn || !state.interviewStartedAt) {
          state.interviewStartedAt = payload.startedAt || new Date().toISOString();
        }
      } else {
        state.interviewStartedAt = null;
        state.interviewDuration  = 45;
      }
    },

    // UI toggles
    toggleChat:        (state) => { state.isChatOpen = !state.isChatOpen; },
    toggleParticipants:(state) => { state.isParticipantOpen = !state.isParticipantOpen; },
    toggleOutput:      (state) => { state.isOutputOpen = !state.isOutputOpen; },
    setEditorFontSize: (state, { payload }) => {
      state.editorFontSize = Math.max(10, Math.min(24, payload));
      try { localStorage.setItem('cs_fontSize', String(state.editorFontSize)); } catch (_) {}
    },
    setError:  (state, { payload }) => { state.error = payload; },
    clearError:(state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    // Execute code
    builder
      .addCase(executeCode.pending, (state) => {
        state.isExecuting = true;
        state.executionError = null;
      })
      .addCase(executeCode.fulfilled, (state, { payload }) => {
        state.isExecuting = false;
        state.currentOutput = payload;
        state.executionHistory.unshift({ ...payload, ranAt: new Date().toISOString() });
        if (state.executionHistory.length > 10) state.executionHistory.pop();
      })
      .addCase(executeCode.rejected, (state, { payload }) => {
        state.isExecuting = false;
        state.executionError = payload;
        state.currentOutput = { stdout: '', stderr: payload, exitCode: 1, status: 'error' };
      });

    // Fetch execution history
    builder.addCase(fetchExecutionHistory.fulfilled, (state, { payload }) => {
      state.executionHistory = payload;
    });

    // Public rooms
    builder
      .addCase(fetchPublicRooms.pending, (state) => { state.publicRoomsLoading = true; })
      .addCase(fetchPublicRooms.fulfilled, (state, { payload }) => {
        state.publicRoomsLoading = false;
        state.publicRooms = payload.rooms;
        state.publicRoomsPagination = payload.pagination;
      })
      .addCase(fetchPublicRooms.rejected, (state) => { state.publicRoomsLoading = false; });

    // Room members
    builder.addCase(fetchRoomMembers.fulfilled, (state, { payload }) => {
      state.members = payload;
    });

    // Session replay
    builder
      .addCase(fetchSessionReplay.pending, (state) => { state.replayLoading = true; })
      .addCase(fetchSessionReplay.fulfilled, (state, { payload }) => {
        state.replayLoading = false;
        state.replayEvents = payload.events;
      })
      .addCase(fetchSessionReplay.rejected, (state) => { state.replayLoading = false; });
  },
});

export const {
  setRoom, clearRoom, setLanguage, setConnectionStatus, setUserRole,
  setParticipants, addParticipant, removeParticipant, updateParticipantRole,
  updateRemoteCursor, removeRemoteCursor,
  addChatMessage, clearChat,
  setCurrentOutput, clearCurrentOutput, setStdinValue, addToExecutionHistory, setExecutionHistory,
  setInterviewMode, setRoomTestCaseCount,
  toggleChat, toggleParticipants, toggleOutput, setEditorFontSize,
  setError, clearError,
} = roomSlice.actions;

// Selectors
export const selectRoomId            = (s) => s.room.roomId;
export const selectRoomName          = (s) => s.room.roomName;
export const selectLanguage          = (s) => s.room.language;
export const selectParticipants      = (s) => s.room.participants;
export const selectRemoteCursors     = (s) => s.room.remoteCursors;
export const selectChatMessages      = (s) => s.room.chatMessages;
export const selectCurrentOutput     = (s) => s.room.currentOutput;
export const selectIsExecuting       = (s) => s.room.isExecuting;
export const selectExecutionHistory  = (s) => s.room.executionHistory;
export const selectConnectionStatus  = (s) => s.room.connectionStatus;
export const selectUserColor         = (s) => s.room.userColor;
export const selectInterviewMode     = (s) => s.room.interviewMode;
export const selectProblemStatement  = (s) => s.room.problemStatement;
export const selectInterviewDuration = (s) => s.room.interviewDuration;
export const selectInterviewStartedAt= (s) => s.room.interviewStartedAt;
export const selectTestCaseCount     = (s) => s.room.testCaseCount;
export const selectIsChatOpen        = (s) => s.room.isChatOpen;
export const selectIsOwner           = (s) => s.room.isOwner;
export const selectUserRole          = (s) => s.room.userRole;
export const selectCanEdit           = (s) => s.room.userRole === 'owner' || s.room.userRole === 'editor';
export const selectEditorFontSize    = (s) => s.room.editorFontSize;
export const selectStdinValue        = (s) => s.room.stdinValue;
export const selectPublicRooms       = (s) => s.room.publicRooms;
export const selectMembers           = (s) => s.room.members;
export const selectReplayEvents      = (s) => s.room.replayEvents;
export const selectReplayLoading     = (s) => s.room.replayLoading;

export default roomSlice.reducer;

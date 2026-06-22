import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../services/api.js';

// ── Async thunks ─────────────────────────────────────────────────

export const loginUser = createAsyncThunk('auth/login', async ({ email, password }, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', { email, password });
    // Persist to localStorage
    localStorage.setItem('cs_token', data.accessToken);
    localStorage.setItem('cs_refresh', data.refreshToken);
    localStorage.setItem('cs_user', JSON.stringify(data.user));
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Login failed');
  }
});

export const registerUser = createAsyncThunk('auth/register', async ({ username, email, password }, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/register', { username, email, password });
    localStorage.setItem('cs_token', data.accessToken);
    localStorage.setItem('cs_refresh', data.refreshToken);
    localStorage.setItem('cs_user', JSON.stringify(data.user));
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Registration failed');
  }
});

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/auth/me');
    localStorage.setItem('cs_user', JSON.stringify(data.user));
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Session expired');
  }
});

// ── Slice ────────────────────────────────────────────────────────

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: null,
    refreshToken: null,
    loading: false,
    error: null,
    initialized: false,
  },
  reducers: {
    // Load auth state from localStorage on app start
    loadFromStorage: (state) => {
      const token = localStorage.getItem('cs_token');
      const user = localStorage.getItem('cs_user');
      const refreshToken = localStorage.getItem('cs_refresh');
      if (token && user) {
        state.token = token;
        state.refreshToken = refreshToken;
        state.user = JSON.parse(user);
      }
      state.initialized = true;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.error = null;
      localStorage.removeItem('cs_token');
      localStorage.removeItem('cs_refresh');
      localStorage.removeItem('cs_user');
    },
    clearError: (state) => {
      state.error = null;
    },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };
      localStorage.setItem('cs_user', JSON.stringify(state.user));
    },
  },
  extraReducers: (builder) => {
    // Login
    builder.addCase(loginUser.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(loginUser.fulfilled, (state, { payload }) => {
      state.loading = false;
      state.user = payload.user;
      state.token = payload.accessToken;
      state.refreshToken = payload.refreshToken;
      state.initialized = true;
    });
    builder.addCase(loginUser.rejected, (state, { payload }) => {
      state.loading = false;
      state.error = payload;
    });

    // Register
    builder.addCase(registerUser.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(registerUser.fulfilled, (state, { payload }) => {
      state.loading = false;
      state.user = payload.user;
      state.token = payload.accessToken;
      state.refreshToken = payload.refreshToken;
      state.initialized = true;
    });
    builder.addCase(registerUser.rejected, (state, { payload }) => {
      state.loading = false;
      state.error = payload;
    });

    // Fetch me
    builder.addCase(fetchMe.fulfilled, (state, { payload }) => {
      state.user = payload.user;
    });
    builder.addCase(fetchMe.rejected, (state) => {
      // Token invalid — log out
      state.user = null;
      state.token = null;
      localStorage.removeItem('cs_token');
      localStorage.removeItem('cs_user');
    });
  },
});

export const { loadFromStorage, logout, clearError, updateUser } = authSlice.actions;

// Selectors
export const selectUser            = (state) => state.auth.user;
export const selectToken           = (state) => state.auth.token;
export const selectAuthLoading     = (state) => state.auth.loading;
export const selectAuthError       = (state) => state.auth.error;
export const selectIsAuthenticated = (state) => !!state.auth.token && !!state.auth.user;
// selectInitialized: true once loadFromStorage() has run.
// ProtectedRoute reads this to avoid a false redirect on hard refresh.
export const selectInitialized     = (state) => state.auth.initialized;

export default authSlice.reducer;

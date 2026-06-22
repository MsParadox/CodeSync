import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../services/api.js';

export const fetchProblems = createAsyncThunk('problems/list', async (params = {}, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/problems', { params });
    return data.problems;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to load problems');
  }
});

export const fetchProblem = createAsyncThunk('problems/get', async (slug, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/problems/${slug}`);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Problem not found');
  }
});

export const fetchLeaderboard = createAsyncThunk('problems/leaderboard', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/problems/meta/leaderboard');
    return data.leaderboard;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to load leaderboard');
  }
});

const problemSlice = createSlice({
  name: 'problems',
  initialState: {
    list: [],
    listLoading: false,
    current: null,
    currentSolved: false,
    currentLoading: false,
    leaderboard: [],
    leaderboardLoading: false,
    error: null,
  },
  reducers: {
    markSolved: (state, { payload }) => {
      if (state.current?.slug === payload) state.currentSolved = true;
      const p = state.list.find((x) => x.slug === payload);
      if (p) p.solved = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProblems.pending,   (s) => { s.listLoading = true; s.error = null; })
      .addCase(fetchProblems.fulfilled, (s, { payload }) => { s.listLoading = false; s.list = payload; })
      .addCase(fetchProblems.rejected,  (s, { payload }) => { s.listLoading = false; s.error = payload; });

    builder
      .addCase(fetchProblem.pending,   (s) => { s.currentLoading = true; s.current = null; s.error = null; })
      .addCase(fetchProblem.fulfilled, (s, { payload }) => { s.currentLoading = false; s.current = payload.problem; s.currentSolved = payload.solved; })
      .addCase(fetchProblem.rejected,  (s, { payload }) => { s.currentLoading = false; s.error = payload; });

    builder
      .addCase(fetchLeaderboard.pending,   (s) => { s.leaderboardLoading = true; })
      .addCase(fetchLeaderboard.fulfilled, (s, { payload }) => { s.leaderboardLoading = false; s.leaderboard = payload; })
      .addCase(fetchLeaderboard.rejected,  (s) => { s.leaderboardLoading = false; });
  },
});

export const { markSolved } = problemSlice.actions;

export const selectProblems          = (s) => s.problems.list;
export const selectProblemsLoading   = (s) => s.problems.listLoading;
export const selectCurrentProblem    = (s) => s.problems.current;
export const selectCurrentSolved     = (s) => s.problems.currentSolved;
export const selectProblemLoading    = (s) => s.problems.currentLoading;
export const selectLeaderboard       = (s) => s.problems.leaderboard;
export const selectLeaderboardLoading= (s) => s.problems.leaderboardLoading;

export default problemSlice.reducer;

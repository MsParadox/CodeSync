import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice.js';
import roomReducer from './roomSlice.js';
import problemReducer from './problemSlice.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    room: roomReducer,
    problems: problemReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for serializable check
        ignoredActions: ['room/setYjsDoc'],
        ignoredPaths: ['room.yjsDoc'],
      },
    }),
});

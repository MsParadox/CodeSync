import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { selectToken, selectInitialized } from './store/authSlice.js';
import Home from './pages/Home.jsx';
import RoomPage from './pages/Room.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Profile from './pages/Profile.jsx';
import Problems from './pages/Problems.jsx';
import ProblemSolve from './pages/ProblemSolve.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Learn from './pages/Learn.jsx';

// ── Full-screen loader shown only during the one render cycle
// before loadFromStorage() has run (should be < 1 frame in practice,
// but guards against any future async hydration path).
function AuthLoader() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 bg-cyan/20 rotate-45 rounded-sm" />
          <div className="absolute inset-1 bg-cyan rotate-45 rounded-sm animate-pulse" />
        </div>
        <span className="font-display text-xs text-cyan tracking-widest animate-pulse">
          LOADING…
        </span>
      </div>
    </div>
  );
}

// ── Protected route: redirect to /login when unauthenticated ─────
// Only runs AFTER auth is initialized — no false redirects.
function ProtectedRoute({ children }) {
  const token       = useSelector(selectToken);
  const initialized = useSelector(selectInitialized);

  if (!initialized) return <AuthLoader />;
  if (!token)       return <Navigate to="/login" replace />;
  return children;
}

// ── Public-only route: redirect home when already logged in ──────
function PublicRoute({ children }) {
  const token       = useSelector(selectToken);
  const initialized = useSelector(selectInitialized);

  if (!initialized) return <AuthLoader />;
  if (token)        return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  // No useEffect dispatch here — main.jsx handles synchronous hydration.
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/room/:roomId"
          element={
            <ProtectedRoute>
              <RoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="/problems" element={<Problems />} />
        <Route path="/problems/:slug" element={<ProblemSolve />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#111530',
            color: '#e8eaf6',
            border: '1px solid #1e2548',
            fontFamily: 'Exo 2, sans-serif',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#00ff9d', secondary: '#111530' } },
          error:   { iconTheme: { primary: '#ff3d6a', secondary: '#111530' } },
        }}
      />
    </BrowserRouter>
  );
}

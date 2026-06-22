import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchLeaderboard, selectLeaderboard, selectLeaderboardLoading } from '../store/problemSlice.js';
import { selectUser } from '../store/authSlice.js';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function Leaderboard() {
  const dispatch = useDispatch();
  const rows     = useSelector(selectLeaderboard);
  const loading  = useSelector(selectLeaderboardLoading);
  const me       = useSelector(selectUser);

  useEffect(() => { dispatch(fetchLeaderboard()); }, [dispatch]);

  return (
    <div className="min-h-screen bg-void text-text-primary relative">
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />

      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/40 glass-panel">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative w-7 h-7">
            <div className="absolute inset-0 bg-cyan/20 rotate-45 rounded-sm" />
            <div className="absolute inset-1 bg-cyan rotate-45 rounded-sm shadow-neon-cyan" />
          </div>
          <span className="font-display text-base font-bold text-cyan tracking-[0.15em] text-glow-cyan">CODESYNC</span>
        </Link>
        <div className="flex items-center gap-4 text-sm font-body">
          <Link to="/problems" className="text-text-secondary hover:text-cyan transition-colors">Problems</Link>
          <Link to="/learn" className="text-text-secondary hover:text-cyan transition-colors">Learn</Link>
          <Link to="/leaderboard" className="text-cyan">Leaderboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">🏆 <span className="text-cyan text-glow-cyan">Leaderboard</span></h1>
          <p className="text-text-muted text-sm font-body mt-1">
            Ranked by weighted score — Easy ×1, Medium ×3, Hard ×5.
          </p>
        </div>

        <div className="glass-panel rounded border border-border overflow-x-auto custom-scroll">
          <div className="grid grid-cols-[3rem_1fr_4rem_4rem_7rem] gap-2 px-4 py-2.5 border-b border-border text-2xs font-display uppercase tracking-widest text-text-muted min-w-[460px]">
            <div>Rank</div><div>User</div><div className="text-right">Score</div><div className="text-right">🔥</div><div className="text-right">E / M / H</div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-text-muted text-sm font-body">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-text-muted text-sm font-body">No one has solved a problem yet. Be the first!</div>
          ) : (
            rows.map((r) => {
              const isMe = me && r.username === me.username;
              const bd = r.byDifficulty || {};
              return (
                <div key={r.username}
                  className={`grid grid-cols-[3rem_1fr_4rem_4rem_7rem] gap-2 px-4 py-3 border-b border-border/40 last:border-0 items-center min-w-[460px]
                    ${isMe ? 'bg-cyan/10' : ''}`}>
                  <div className="font-display text-sm">{MEDAL[r.rank] || `#${r.rank}`}</div>
                  <Link to={`/profile/${r.username}`} className="flex items-center gap-2 min-w-0 hover:text-cyan transition-colors">
                    <img src={r.avatar || `https://api.dicebear.com/9.x/identicon/svg?seed=${r.username}`} alt="" className="w-7 h-7 rounded-full flex-shrink-0 object-cover" />
                    <span className="font-body text-sm truncate">{r.username}{isMe && <span className="text-2xs text-cyan ml-1">(you)</span>}</span>
                  </Link>
                  <div className="text-right font-display text-cyan">{r.score}</div>
                  <div className="text-right font-code text-xs text-amber">{r.streak > 0 ? `${r.streak}d` : '—'}</div>
                  <div className="text-right text-2xs font-code text-text-muted">
                    <span className="text-green">{bd.easy || 0}</span> / <span className="text-amber">{bd.medium || 0}</span> / <span className="text-red">{bd.hard || 0}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

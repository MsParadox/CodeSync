import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProblems, selectProblems, selectProblemsLoading } from '../store/problemSlice.js';
import { selectIsAuthenticated, selectUser } from '../store/authSlice.js';

const DIFF = {
  Easy:   { color: '#00ff9d' },
  Medium: { color: '#ffd600' },
  Hard:   { color: '#ff3d6a' },
};

function Nav() {
  const isAuth = useSelector(selectIsAuthenticated);
  const user   = useSelector(selectUser);
  return (
    <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/40 glass-panel">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="relative w-7 h-7">
          <div className="absolute inset-0 bg-cyan/20 rotate-45 rounded-sm" />
          <div className="absolute inset-1 bg-cyan rotate-45 rounded-sm shadow-neon-cyan" />
        </div>
        <span className="font-display text-base font-bold text-cyan tracking-[0.15em] text-glow-cyan">CODESYNC</span>
      </Link>
      <div className="flex items-center gap-4 text-sm font-body">
        <Link to="/problems" className="text-cyan">Problems</Link>
        <Link to="/learn" className="text-text-secondary hover:text-cyan transition-colors">Learn</Link>
        <Link to="/leaderboard" className="text-text-secondary hover:text-cyan transition-colors">Leaderboard</Link>
        {isAuth
          ? <Link to="/profile" className="flex items-center gap-2"><img src={user?.avatar} alt="" className="w-7 h-7 rounded-full ring-1 ring-border" /></Link>
          : <Link to="/login" className="btn-cyber btn-cyber-primary text-xs py-1.5">Sign In</Link>}
      </div>
    </nav>
  );
}

export default function Problems() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const problems  = useSelector(selectProblems);
  const loading   = useSelector(selectProblemsLoading);

  const [search, setSearch]   = useState('');
  const [diff, setDiff]       = useState('');
  const [tag, setTag]         = useState('');

  useEffect(() => { dispatch(fetchProblems()); }, [dispatch]);

  const allTags = useMemo(() => {
    const t = new Set();
    problems.forEach((p) => (p.tags || []).forEach((x) => t.add(x)));
    return [...t].sort();
  }, [problems]);

  const filtered = problems.filter((p) => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (diff && p.difficulty !== diff) return false;
    if (tag && !(p.tags || []).includes(tag)) return false;
    return true;
  });

  const solvedCount = problems.filter((p) => p.solved).length;

  return (
    <div className="min-h-screen bg-void text-text-primary relative">
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
      <Nav />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Practice <span className="text-cyan text-glow-cyan">Problems</span></h1>
            <p className="text-text-muted text-sm font-body mt-1">
              Solve, submit against hidden tests, and climb the leaderboard.
            </p>
          </div>
          {problems.length > 0 && (
            <div className="text-right">
              <div className="font-display text-2xl text-green">{solvedCount}<span className="text-text-muted text-sm">/{problems.length}</span></div>
              <div className="text-2xs text-text-muted font-body uppercase tracking-widest">Solved</div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search problems…"
            className="input-cyber rounded text-sm py-1.5 flex-1 min-w-[160px]" />
          <select value={diff} onChange={(e) => setDiff(e.target.value)}
            className="input-cyber rounded text-sm py-1.5 appearance-none">
            <option value="">All Difficulty</option>
            <option>Easy</option><option>Medium</option><option>Hard</option>
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value)}
            className="input-cyber rounded text-sm py-1.5 appearance-none">
            <option value="">All Tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="glass-panel rounded border border-border overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_6rem_6rem] sm:grid-cols-[2.5rem_1fr_8rem_7rem_6rem] gap-2 px-4 py-2.5 border-b border-border text-2xs font-display uppercase tracking-widest text-text-muted">
            <div></div>
            <div>Title</div>
            <div className="hidden sm:block">Tags</div>
            <div>Difficulty</div>
            <div className="text-right">Acc.</div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-text-muted text-sm font-body">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-text-muted text-sm font-body">No problems match your filters.</div>
          ) : (
            filtered.map((p) => {
              const d = DIFF[p.difficulty] || DIFF.Easy;
              return (
                <button
                  key={p.slug}
                  onClick={() => navigate(`/problems/${p.slug}`)}
                  className="w-full grid grid-cols-[2rem_1fr_6rem_6rem] sm:grid-cols-[2.5rem_1fr_8rem_7rem_6rem] gap-2 px-4 py-3
                             border-b border-border/40 last:border-0 items-center text-left hover:bg-surface/50 transition-colors group"
                >
                  <div className="flex items-center justify-center">
                    {p.solved
                      ? <span className="text-green" title="Solved">✓</span>
                      : <span className="w-2 h-2 rounded-full bg-border inline-block" />}
                  </div>
                  <div className="font-body text-sm text-text-primary group-hover:text-cyan transition-colors truncate">{p.title}</div>
                  <div className="hidden sm:flex gap-1 flex-wrap">
                    {(p.tags || []).slice(0, 2).map((t) => (
                      <span key={t} className="text-2xs bg-surface border border-border rounded px-1.5 py-0.5 text-text-muted">{t}</span>
                    ))}
                  </div>
                  <div className="text-xs font-display" style={{ color: d.color }}>{p.difficulty}</div>
                  <div className="text-right text-xs font-code text-text-muted">{p.acceptanceRate}%</div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

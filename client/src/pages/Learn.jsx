import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated, selectUser } from '../store/authSlice.js';
import { DSA_TOPICS, BIG_O, DEV_DOCS, REPO, repoUrl } from '../data/learn.js';

const DIFF = { Easy: '#00ff9d', Medium: '#ffd600', Hard: '#ff3d6a' };

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
        <Link to="/problems" className="text-text-secondary hover:text-cyan transition-colors">Problems</Link>
        <Link to="/learn" className="text-cyan">Learn</Link>
        <Link to="/leaderboard" className="text-text-secondary hover:text-cyan transition-colors">Leaderboard</Link>
        {isAuth
          ? <Link to="/profile"><img src={user?.avatar} alt="" className="w-7 h-7 rounded-full ring-1 ring-border" /></Link>
          : <Link to="/login" className="btn-cyber btn-cyber-primary text-xs py-1.5">Sign In</Link>}
      </div>
    </nav>
  );
}

function TopicDetail({ topic }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display text-xl font-bold text-text-primary">{topic.icon} {topic.name}</h2>
          <span className="text-xs font-display px-2 py-0.5 rounded-full border"
            style={{ color: DIFF[topic.difficulty], borderColor: DIFF[topic.difficulty] + '55', background: DIFF[topic.difficulty] + '11' }}>
            {topic.difficulty}
          </span>
        </div>
        <p className="text-text-secondary text-sm font-body leading-relaxed mt-2">{topic.summary}</p>
      </div>

      <div>
        <h3 className="font-display text-xs text-cyan uppercase tracking-widest mb-2">Key Ideas</h3>
        <ul className="space-y-1.5">
          {topic.keyPoints.map((k, i) => (
            <li key={i} className="flex gap-2 text-sm font-body text-text-secondary">
              <span className="text-cyan/60 flex-shrink-0 mt-0.5">▸</span>{k}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-display text-xs text-cyan uppercase tracking-widest mb-2">Complexity</h3>
        <div className="rounded border border-border overflow-hidden">
          {topic.complexity.map(([op, t], i) => (
            <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 last:border-0">
              <span className="text-xs font-body text-text-secondary">{op}</span>
              <span className="text-xs font-code text-amber">{t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={repoUrl(topic.path)} target="_blank" rel="noopener noreferrer"
          className="btn-cyber btn-cyber-green text-xs py-1.5 inline-flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .5C5.4.5 0 5.9 0 12.5c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0C17.3 4.4 18.3 4.7 18.3 4.7c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6C20.6 22.3 24 17.8 24 12.5 24 5.9 18.6.5 12 .5z"/></svg>
          View code examples
        </a>
        {topic.resources.map(([label, url]) => (
          <a key={label} href={url} target="_blank" rel="noopener noreferrer"
            className="btn-cyber text-xs py-1.5">{label} ↗</a>
        ))}
      </div>
    </div>
  );
}

export default function Learn() {
  const [activeId, setActiveId] = useState(DSA_TOPICS[0].id);
  const [section, setSection]   = useState('dsa'); // dsa | bigo | docs
  const active = DSA_TOPICS.find((t) => t.id === activeId);

  return (
    <div className="min-h-screen bg-void text-text-primary relative">
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
      <Nav />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">📚 <span className="text-cyan text-glow-cyan">Learn</span> — DSA, CP &amp; Dev Docs</h1>
          <p className="text-text-muted text-sm font-body mt-1">
            Concise notes, complexity references and curated documentation. Code examples deep-link to the{' '}
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">DSA-CP repository</a>.
          </p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {[
            { id: 'dsa',  label: 'DSA Topics' },
            { id: 'bigo', label: 'Big-O Cheat Sheet' },
            { id: 'docs', label: 'Dev Documentation' },
          ].map((s) => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`px-4 py-2 text-xs font-display uppercase tracking-wider border-b-2 -mb-px transition-colors
                ${section === s.id ? 'border-cyan text-cyan' : 'border-transparent text-text-muted hover:text-text-secondary'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* ── DSA topics ─────────────────────────────────────────── */}
        {section === 'dsa' && (
          <div className="grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-5">
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible custom-scroll pb-2 lg:pb-0">
              {DSA_TOPICS.map((t) => (
                <button key={t.id} onClick={() => setActiveId(t.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-left flex-shrink-0 transition-colors text-sm font-body
                    ${t.id === activeId ? 'bg-cyan/15 text-cyan' : 'text-text-secondary hover:bg-surface/60'}`}>
                  <span>{t.icon}</span>
                  <span className="whitespace-nowrap lg:whitespace-normal">{t.name}</span>
                </button>
              ))}
            </div>
            <div className="glass-panel rounded border border-border p-5">
              {active && <TopicDetail topic={active} />}
            </div>
          </div>
        )}

        {/* ── Big-O cheat sheet ──────────────────────────────────── */}
        {section === 'bigo' && (
          <div className="glass-panel rounded border border-border overflow-x-auto custom-scroll">
            <table className="w-full text-sm font-body min-w-[560px]">
              <thead>
                <tr className="text-2xs font-display uppercase tracking-widest text-text-muted border-b border-border">
                  <th className="text-left px-4 py-3">Structure</th>
                  <th className="text-left px-4 py-3">Access</th>
                  <th className="text-left px-4 py-3">Search</th>
                  <th className="text-left px-4 py-3">Insert</th>
                  <th className="text-left px-4 py-3">Delete</th>
                </tr>
              </thead>
              <tbody>
                {BIG_O.map((r) => (
                  <tr key={r.ds} className="border-b border-border/40 last:border-0 hover:bg-surface/40">
                    <td className="px-4 py-2.5 text-text-primary">{r.ds}</td>
                    <td className="px-4 py-2.5 font-code text-amber">{r.access}</td>
                    <td className="px-4 py-2.5 font-code text-amber">{r.search}</td>
                    <td className="px-4 py-2.5 font-code text-amber">{r.insert}</td>
                    <td className="px-4 py-2.5 font-code text-amber">{r.del}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-2xs text-text-muted font-body px-4 py-3">* average case &nbsp; † peek only (min/max at root)</p>
          </div>
        )}

        {/* ── Dev documentation ──────────────────────────────────── */}
        {section === 'docs' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DEV_DOCS.map((g) => (
              <div key={g.group} className="glass-panel rounded border border-border p-4">
                <h3 className="font-display text-xs uppercase tracking-widest mb-3" style={{ color: g.color }}>{g.group}</h3>
                <div className="space-y-1.5">
                  {g.links.map(([label, url]) => (
                    <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between text-sm font-body text-text-secondary hover:text-cyan transition-colors group">
                      <span>{label}</span>
                      <span className="text-text-muted group-hover:text-cyan">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

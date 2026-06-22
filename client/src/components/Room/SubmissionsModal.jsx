import React, { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { api } from '../../services/api.js';
import toast from 'react-hot-toast';

// ── Submissions review ────────────────────────────────────────────
// Owners see every participant's submitted code (grouped by person);
// members see only their own. Read-only Monaco renders each solution
// with its verdict + captured output.

const VERDICT = {
  success:       { label: 'Accepted',           color: '#00ff9d' },
  runtime_error: { label: 'Runtime Error',      color: '#ff3d6a' },
  compile_error: { label: 'Compilation Error',  color: '#ff3d6a' },
  error:         { label: 'Error',              color: '#ff3d6a' },
  timeout:       { label: 'Time Limit Exceeded',color: '#ffd600' },
  oom:           { label: 'Memory Limit Exceeded', color: '#ffd600' },
  unknown:       { label: 'Submitted',          color: '#8891c0' },
};

function fmt(ts) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SubmissionsModal({ open, roomId, onClose }) {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [participants, setParts] = useState([]);
  const [isOwner, setIsOwner]   = useState(false);
  const [activeUser, setActiveUser] = useState(null);   // userId key
  const [activeSub, setActiveSub]   = useState(null);   // submission object

  const load = useCallback(() => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    api.get(`/rooms/${roomId}/submissions`)
      .then(({ data }) => {
        setIsOwner(!!data.isOwner);
        setParts(data.participants || []);
        const first = data.participants?.[0];
        setActiveUser(first ? String(first.userId) : null);
        setActiveSub(first?.submissions?.[0] || null);
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load submissions'))
      .finally(() => setLoading(false));
  }, [roomId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const copyCode = useCallback(async () => {
    if (!activeSub) return;
    try { await navigator.clipboard.writeText(activeSub.code || ''); toast.success('Code copied'); }
    catch { toast.error('Copy failed'); }
  }, [activeSub]);

  if (!open) return null;

  const activeGroup = participants.find((p) => String(p.userId) === String(activeUser));
  const verdict = activeSub ? (VERDICT[activeSub.status] || VERDICT.unknown) : null;

  return (
    <div
      className="fixed inset-0 bg-void/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-5xl h-[82vh] glass-panel rounded border border-cyan/30 shadow-panel
                      corner-tl corner-br animate-slide-up flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-cyan">📥</span>
            <h2 className="font-display text-sm text-cyan tracking-wider">
              {isOwner ? 'INTERVIEW SUBMISSIONS' : 'MY SUBMISSIONS'}
            </h2>
            {!loading && (
              <span className="badge badge-info text-2xs">
                {participants.reduce((n, p) => n + p.count, 0)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} title="Refresh"
              className="text-text-muted hover:text-cyan transition-colors text-xs">↻</button>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">✕</button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
            <span className="text-text-secondary text-sm font-body">Loading…</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-red text-sm font-body">{error}</p>
          </div>
        ) : participants.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <div className="text-3xl opacity-30">📭</div>
            <p className="text-text-muted text-sm font-body">No submissions yet.</p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            {/* Participant rail (owner) + submission list */}
            <div className="w-60 flex-shrink-0 border-r border-border flex flex-col min-h-0">
              {isOwner && (
                <div className="overflow-y-auto custom-scroll border-b border-border max-h-40 flex-shrink-0">
                  {participants.map((p) => (
                    <button
                      key={String(p.userId)}
                      onClick={() => { setActiveUser(String(p.userId)); setActiveSub(p.submissions[0]); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
                        ${String(p.userId) === String(activeUser) ? 'bg-cyan/10' : 'hover:bg-surface/60'}`}
                    >
                      <img src={p.avatar || `https://api.dicebear.com/9.x/identicon/svg?seed=${p.username}`}
                           alt="" className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
                      <span className="text-xs font-body text-text-secondary truncate flex-1">{p.username}</span>
                      <span className="badge badge-info text-2xs">{p.count}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-y-auto custom-scroll">
                <div className="px-3 py-1.5 text-2xs font-display tracking-widest uppercase text-text-muted">
                  {isOwner ? `${activeGroup?.username || ''}'s attempts` : 'Attempts'}
                </div>
                {(activeGroup?.submissions || []).map((s) => {
                  const v = VERDICT[s.status] || VERDICT.unknown;
                  const sel = activeSub && activeSub._id === s._id;
                  return (
                    <button
                      key={s._id}
                      onClick={() => setActiveSub(s)}
                      className={`w-full flex flex-col gap-0.5 px-3 py-2 text-left border-l-2 transition-colors
                        ${sel ? 'bg-cyan/10 border-cyan' : 'border-transparent hover:bg-surface/60'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xs font-display" style={{ color: v.color }}>{v.label}</span>
                        <span className="text-2xs font-code text-text-muted ml-auto">{s.language}</span>
                      </div>
                      <span className="text-2xs font-code text-text-muted">{fmt(s.submittedAt)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Code + verdict */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              {activeSub ? (
                <>
                  <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-shrink-0">
                    {verdict && (
                      <span className="badge text-2xs" style={{ color: verdict.color, borderColor: verdict.color + '55', background: verdict.color + '15' }}>
                        {verdict.label}
                      </span>
                    )}
                    <span className="text-2xs font-code text-text-muted">{activeSub.language}</span>
                    {activeSub.executionTimeMs > 0 && (
                      <span className="text-2xs font-code text-text-muted">{activeSub.executionTimeMs}ms</span>
                    )}
                    <span className="text-2xs font-code text-text-muted ml-auto">{fmt(activeSub.submittedAt)}</span>
                    <button onClick={copyCode}
                      className="text-text-muted hover:text-cyan transition-colors text-2xs px-1.5 py-0.5 border border-border rounded">
                      Copy
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <Editor
                      height="100%"
                      language={activeSub.language}
                      value={activeSub.code || ''}
                      theme="vs-dark"
                      options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                    />
                  </div>
                  {(activeSub.stdout || activeSub.stderr) && (
                    <div className="flex-shrink-0 max-h-32 overflow-y-auto custom-scroll border-t border-border p-2 bg-abyss">
                      {activeSub.stdout && <pre className="font-code text-2xs text-green/80 whitespace-pre-wrap break-all">{activeSub.stdout}</pre>}
                      {activeSub.stderr && <pre className="font-code text-2xs text-red/80 whitespace-pre-wrap break-all">{activeSub.stderr}</pre>}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-text-muted text-sm font-body">
                  Select a submission
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

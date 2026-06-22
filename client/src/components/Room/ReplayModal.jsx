import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { api } from '../../services/api.js';

// ── Session Replay ────────────────────────────────────────────────
// Plays back a room's collaboration history. The server records periodic
// Yjs state checkpoints (eventType: 'yjs_checkpoint') plus discrete events
// (join/leave/chat/execute/language_change/interview). We fetch them with
// includeCode=true, decode each checkpoint's base64 Yjs update into a
// throwaway Y.Doc, read its 'code' text, and scrub through the frames.

function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeCheckpoint(b64) {
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, base64ToUint8(b64));
    const code = doc.getText('code').toString();
    doc.destroy();
    return code;
  } catch {
    return '';
  }
}

const EVENT_META = {
  join:            { icon: '👤', label: 'joined',            color: '#00ff9d' },
  leave:           { icon: '👋', label: 'left',              color: '#444d7a' },
  chat:            { icon: '💬', label: 'sent a message',    color: '#ff3db4' },
  execute:         { icon: '▶',  label: 'ran code',          color: '#00d4ff' },
  language_change: { icon: '💻', label: 'changed language',  color: '#ffd600' },
  interview_start: { icon: '🎯', label: 'started interview', color: '#ffd600' },
  interview_end:   { icon: '🏁', label: 'ended interview',   color: '#444d7a' },
  snapshot:        { icon: '📸', label: 'saved snapshot',    color: '#c77dff' },
  yjs_checkpoint:  { icon: '⌨', label: 'edited code',        color: '#00d4ff' },
};

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ReplayModal({ open, roomId, language = 'javascript', onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [events, setEvents]   = useState([]);
  const [frames, setFrames]   = useState([]);   // [{ code, timestamp, username }]
  const [pos, setPos]         = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed]     = useState(1);
  const playRef = useRef(null);

  // Fetch + decode on open
  useEffect(() => {
    if (!open || !roomId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPlaying(false);
    setPos(0);

    api.get(`/rooms/${roomId}/replay`, { params: { includeCode: true, limit: 500 } })
      .then(({ data }) => {
        if (cancelled) return;
        const evs = data.events || [];
        setEvents(evs);
        const decoded = evs
          .filter((e) => e.eventType === 'yjs_checkpoint' && e.yjsState)
          .map((e) => ({
            code:      decodeCheckpoint(e.yjsState),
            timestamp: e.timestamp,
            username:  e.username || 'Unknown',
          }));
        setFrames(decoded);
        setPos(decoded.length > 0 ? decoded.length - 1 : 0);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load replay');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [open, roomId]);

  // Auto-play stepping
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    playRef.current = setInterval(() => {
      setPos((p) => {
        if (p >= frames.length - 1) { setPlaying(false); return p; }
        return p + 1;
      });
    }, Math.max(250, 1200 / speed));
    return () => clearInterval(playRef.current);
  }, [playing, speed, frames.length]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      // Restart from the beginning if we're at the end
      if (!p && pos >= frames.length - 1) setPos(0);
      return !p;
    });
  }, [pos, frames.length]);

  const current = frames[pos];

  // Timeline summary (non-checkpoint events) for the side rail
  const timeline = useMemo(
    () => events.filter((e) => e.eventType !== 'yjs_checkpoint'),
    [events],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-void/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-5xl h-[80vh] glass-panel rounded border border-cyan/30 shadow-panel
                      corner-tl corner-br animate-slide-up flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-cyan">⏪</span>
            <h2 className="font-display text-sm text-cyan tracking-wider">SESSION REPLAY</h2>
            {!loading && frames.length > 0 && (
              <span className="badge badge-info text-2xs">{frames.length} frames</span>
            )}
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">✕</button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Code playback */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {loading ? (
              <div className="flex-1 flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
                <span className="text-text-secondary text-sm font-body">Loading replay…</span>
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-red text-sm font-body">{error}</p>
              </div>
            ) : frames.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <div className="text-3xl opacity-30">🎬</div>
                <p className="text-text-muted text-sm font-body">
                  No code checkpoints recorded yet.<br />
                  Checkpoints are captured as people edit — come back after some collaboration.
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <Editor
                  height="100%"
                  language={language}
                  value={current?.code ?? ''}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    domReadOnly: true,
                    renderWhitespace: 'none',
                  }}
                />
              </div>
            )}
          </div>

          {/* Event timeline rail */}
          <div className="w-60 flex-shrink-0 border-l border-border flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-border text-2xs font-display tracking-widest uppercase text-text-muted flex-shrink-0">
              Timeline ({timeline.length})
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll">
              {timeline.length === 0 ? (
                <p className="px-3 py-4 text-text-muted text-2xs font-body">No events recorded.</p>
              ) : (
                timeline.map((e, i) => {
                  const m = EVENT_META[e.eventType] || { icon: '•', label: e.eventType, color: '#8891c0' };
                  return (
                    <div key={i} className="flex items-start gap-2 px-3 py-1.5 border-b border-border/40">
                      <span className="text-xs flex-shrink-0 mt-0.5">{m.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-2xs font-body text-text-secondary truncate">
                          <span style={{ color: m.color }}>{e.username || 'system'}</span> {m.label}
                          {e.eventType === 'language_change' && e.data?.language ? ` → ${e.data.language}` : ''}
                        </div>
                        <div className="text-2xs font-code text-text-muted">{fmtTime(e.timestamp)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Transport controls */}
        {!loading && !error && frames.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-3 border-t border-border flex-shrink-0">
            <button
              onClick={togglePlay}
              className="p-2 rounded border border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/20 transition-colors flex-shrink-0"
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            <button onClick={() => setPos((p) => Math.max(0, p - 1))}
              className="text-text-muted hover:text-cyan transition-colors flex-shrink-0" title="Previous frame">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button onClick={() => setPos((p) => Math.min(frames.length - 1, p + 1))}
              className="text-text-muted hover:text-cyan transition-colors flex-shrink-0" title="Next frame">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" /></svg>
            </button>

            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={pos}
              onChange={(e) => { setPlaying(false); setPos(Number(e.target.value)); }}
              className="flex-1 accent-cyan cursor-pointer"
            />

            <span className="text-2xs font-code text-text-muted flex-shrink-0 w-24 text-right">
              {pos + 1}/{frames.length} · {current ? fmtTime(current.timestamp) : ''}
            </span>

            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="input-cyber rounded text-2xs py-1 px-1.5 flex-shrink-0"
              title="Playback speed"
            >
              {[0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

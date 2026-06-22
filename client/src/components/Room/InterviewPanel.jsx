import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  selectProblemStatement, selectInterviewMode,
  selectInterviewDuration, selectInterviewStartedAt, selectTestCaseCount,
} from '../../store/roomSlice.js';

// Minimal markdown renderer: bold, inline-code, headers, bullets
function renderMarkdown(text) {
  if (!text) return [];
  return text.split('\n').map((line, i) => {
    const key = i;
    // H1 / H2 / H3
    if (/^### /.test(line)) return <p key={key} className="font-display text-xs text-cyan mt-3 mb-1 tracking-wider uppercase">{line.slice(4)}</p>;
    if (/^## /.test(line))  return <p key={key} className="font-display text-sm text-cyan mt-3 mb-1 tracking-wide">{line.slice(3)}</p>;
    if (/^# /.test(line))   return <p key={key} className="font-display text-base text-cyan mt-2 mb-1">{line.slice(2)}</p>;
    // Bullet
    if (/^[-*] /.test(line)) return (
      <div key={key} className="flex gap-2 my-0.5 ml-2">
        <span className="text-cyan/60 flex-shrink-0 mt-0.5">▸</span>
        <span className="text-text-secondary text-xs font-body leading-relaxed">{inlineFormat(line.slice(2))}</span>
      </div>
    );
    // Numbered list
    if (/^\d+\. /.test(line)) {
      const [num, ...rest] = line.split('. ');
      return (
        <div key={key} className="flex gap-2 my-0.5 ml-2">
          <span className="text-cyan/60 text-xs font-code flex-shrink-0 w-4 text-right">{num}.</span>
          <span className="text-text-secondary text-xs font-body leading-relaxed">{inlineFormat(rest.join('. '))}</span>
        </div>
      );
    }
    // Blank line
    if (!line.trim()) return <div key={key} className="h-2" />;
    // Normal paragraph
    return <p key={key} className="text-text-secondary text-xs font-body leading-relaxed">{inlineFormat(line)}</p>;
  });
}

function inlineFormat(text) {
  // Split on **bold**, `code`, and plain text
  const parts = [];
  let rest = text;
  let idx = 0;

  const patterns = [
    { re: /\*\*(.+?)\*\*/,   render: (m) => <strong key={idx++} className="text-text-primary font-semibold">{m[1]}</strong> },
    { re: /`(.+?)`/,          render: (m) => <code   key={idx++} className="font-code text-2xs bg-surface border border-border rounded px-1 py-0.5 text-amber">{m[1]}</code> },
  ];

  while (rest.length > 0) {
    let earliest = null;
    let matchPat = null;

    for (const p of patterns) {
      const m = p.re.exec(rest);
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = m;
        matchPat = p;
      }
    }

    if (!earliest) { parts.push(rest); break; }
    if (earliest.index > 0) parts.push(rest.slice(0, earliest.index));
    parts.push(matchPat.render(earliest));
    rest = rest.slice(earliest.index + earliest[0].length);
  }

  return parts.length > 0 ? parts : text;
}

// Countdown timer hook
function useCountdown(startedAt, durationMinutes) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!startedAt || !durationMinutes) { setRemaining(null); return; }
    const endMs = new Date(startedAt).getTime() + durationMinutes * 60 * 1000;

    // `timer` is declared with `let` BEFORE tick so the first synchronous
    // tick() (which may already be at 0 for an expired interview) can
    // reference it without hitting the temporal-dead-zone — referencing a
    // `const` here before its initializer threw and crashed the Room.
    let timer = null;
    const tick = () => {
      const diff = Math.max(0, endMs - Date.now());
      setRemaining(diff);
      if (diff === 0 && timer) clearInterval(timer);
    };

    tick();
    timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt, durationMinutes]);

  return remaining;
}

function formatTime(ms) {
  if (ms === null) return null;
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Full InterviewPanel:
//  - Countdown timer driven by real Redux state (duration + startedAt),
//    so it survives re-renders and reflects the owner's chosen duration.
//  - Owner inline edit of problem statement WITHOUT ending the session.
//  - Markdown-formatted problem display.
//  - End session button for owner.
export default function InterviewPanel({ isOwner, canSubmit, onSetInterviewMode, onSubmitSolution, onViewSubmissions, onManageTestCases }) {
  const problemStatement = useSelector(selectProblemStatement);
  const interviewMode    = useSelector(selectInterviewMode);
  const durationMinutes  = useSelector(selectInterviewDuration);
  const startedAt        = useSelector(selectInterviewStartedAt);
  const testCaseCount    = useSelector(selectTestCaseCount);

  const [editing, setEditing]     = useState(false);
  const [editText, setEditText]   = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const remaining = useCountdown(startedAt, durationMinutes);
  const timeStr   = formatTime(remaining);
  const isExpired = remaining === 0;
  const isWarning = remaining !== null && remaining < 5 * 60 * 1000;

  const startEdit = () => { setEditText(problemStatement); setEditing(true); };

  // Save edit KEEPS the session enabled — preserves the existing duration
  // and (server-side) start time. Previously this toggled the session off.
  const saveEdit = useCallback(() => {
    onSetInterviewMode?.(true, editText, durationMinutes);
    setEditing(false);
  }, [editText, durationMinutes, onSetInterviewMode]);

  const handleEndSession = useCallback(() => {
    if (confirmed) {
      onSetInterviewMode?.(false, '', 45);
      setConfirmed(false);
    } else {
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 3000);
    }
  }, [confirmed, onSetInterviewMode]);

  if (!interviewMode) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
      <div className="text-3xl opacity-30">🎯</div>
      <p className="text-text-muted text-xs font-body text-center">
        Interview mode is off.<br/>
        {isOwner ? 'Click the shield icon in the toolbar to start.' : 'Waiting for host to start.'}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-panel">
      {/* ── Header: timer + controls ──────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="badge badge-warning text-2xs">LIVE</span>
          {timeStr && (
            <span
              className={`font-code text-sm font-bold transition-colors
                ${isExpired ? 'text-red animate-pulse' : isWarning ? 'text-amber animate-pulse' : 'text-green'}`}
            >
              {isExpired ? '00:00' : timeStr}
            </span>
          )}
          {isExpired && (
            <span className="text-2xs text-red font-body">Time's up!</span>
          )}
        </div>

        {isOwner && (
          <div className="flex items-center gap-1.5">
            {!editing && (
              <button
                onClick={startEdit}
                title="Edit problem statement"
                className="p-1 rounded text-text-muted hover:text-cyan transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            <button
              onClick={handleEndSession}
              title={confirmed ? 'Click again to confirm' : 'End interview session'}
              className={`text-2xs px-2 py-1 rounded border font-display transition-all
                ${confirmed
                  ? 'border-red bg-red/20 text-red animate-pulse'
                  : 'border-border text-text-muted hover:border-red/40 hover:text-red'}`}
            >
              {confirmed ? 'Confirm?' : 'End'}
            </button>
          </div>
        )}
      </div>

      {/* ── Edit mode ─────────────────────────────────────────── */}
      {editing ? (
        <div className="flex-1 flex flex-col p-3 gap-2 min-h-0">
          <p className="text-text-muted text-2xs font-body">
            Supports **bold**, `code`, # headers, - bullets
          </p>
          <textarea
            className="flex-1 input-cyber rounded font-body text-xs resize-none custom-scroll leading-relaxed"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            placeholder="Write the problem statement here..."
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)}
              className="flex-1 btn-cyber text-xs py-1.5">Cancel</button>
            <button onClick={saveEdit}
              className="flex-1 btn-cyber btn-cyber-green text-xs py-1.5">Save</button>
          </div>
        </div>
      ) : (
        /* ── Problem statement display ────────────────────────── */
        <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-1">
          {problemStatement ? (
            <div className="space-y-0.5">
              {renderMarkdown(problemStatement)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
              <div className="text-2xl opacity-30">📝</div>
              <p className="text-text-muted text-xs font-body text-center">
                {isOwner
                  ? 'No problem statement yet.\nClick the edit button to add one.'
                  : 'Waiting for the host to add a problem statement.'}
              </p>
              {isOwner && (
                <button onClick={startEdit} className="btn-cyber text-xs py-1.5 mt-1">
                  Add Problem
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Submit / review actions ───────────────────────────── */}
      {!editing && (canSubmit || isOwner) && (
        <div className="px-3 py-2.5 border-t border-border flex-shrink-0 space-y-2">
          {/* Hidden-tests indicator */}
          <div className="flex items-center justify-center gap-1.5 text-2xs font-body text-text-muted">
            <span>🧪</span>
            {testCaseCount > 0
              ? <span>{testCaseCount} hidden test case{testCaseCount !== 1 ? 's' : ''} — all must pass</span>
              : <span>No hidden tests — runs normally</span>}
          </div>

          {canSubmit && (
            <button
              onClick={() => onSubmitSolution?.()}
              disabled={isExpired}
              className={`w-full btn-cyber text-xs py-2 flex items-center justify-center gap-2
                ${isExpired ? 'opacity-50 cursor-not-allowed' : 'btn-cyber-green'}`}
              title={isExpired ? "Time's up — submissions closed" : 'Run and submit your solution'}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Submit Solution
            </button>
          )}

          {isOwner && (
            <button
              onClick={() => onManageTestCases?.()}
              className="w-full btn-cyber text-xs py-2 flex items-center justify-center gap-2"
              title="Add or edit hidden test cases"
            >
              <span>🧪</span> Manage Test Cases
            </button>
          )}
          <button
            onClick={() => onViewSubmissions?.()}
            className="w-full btn-cyber text-xs py-2 flex items-center justify-center gap-2"
            title={isOwner ? "Review every candidate's submissions" : 'View your submissions'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {isOwner ? 'View Submissions' : 'My Submissions'}
          </button>
        </div>
      )}

      {/* ── Progress bar ──────────────────────────────────────── */}
      {remaining !== null && durationMinutes > 0 && (
        <div className="h-1 bg-surface flex-shrink-0">
          <div
            className={`h-full transition-all duration-1000
              ${isExpired ? 'bg-red' : isWarning ? 'bg-amber' : 'bg-green'}`}
            style={{
              width: `${Math.max(0, (remaining / (durationMinutes * 60 * 1000)) * 100)}%`,
              boxShadow: isExpired ? '0 0 8px #ff3d6a' : isWarning ? '0 0 8px #ffd600' : '0 0 8px #00ff9d',
            }}
          />
        </div>
      )}
    </div>
  );
}

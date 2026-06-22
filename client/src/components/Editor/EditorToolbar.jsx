import React, { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  selectLanguage, selectIsExecuting, selectEditorFontSize,
  setEditorFontSize, selectConnectionStatus, selectRoomId,
  selectRoomName, selectIsOwner, selectInterviewMode,
} from '../../store/roomSlice.js';
import LanguageSelector from './LanguageSelector.jsx';


export default function EditorToolbar({
  onRun, onLanguageChange, onFormat, onResetTemplate, onDownloadCode, onOpenPalette, onLeaveRoom,
  onSetInterviewMode, selectionInfo,
}) {
  const dispatch       = useDispatch();
  const roomId         = useSelector(selectRoomId);
  const roomName       = useSelector(selectRoomName);
  const isExecuting    = useSelector(selectIsExecuting);
  const fontSize       = useSelector(selectEditorFontSize);
  const connStatus     = useSelector(selectConnectionStatus);
  const isOwner        = useSelector(selectIsOwner);
  const interviewMode  = useSelector(selectInterviewMode);

  const [copied, setCopied]                   = useState(false);
  const [showInterviewModal, setShowInterview] = useState(false);
  const [problemInput, setProblemInput]        = useState('');
  const [durationInput, setDurationInput]      = useState('45');

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success('Room link copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomId]);

  const handleInterviewSubmit = (e) => {
    e.preventDefault();
    onSetInterviewMode?.(true, problemInput, parseInt(durationInput) || 45);
    setShowInterview(false);
  };

  const STATUS = {
    connected:    { color: 'text-green',     dot: 'bg-green',                    label: 'Live' },
    connecting:   { color: 'text-amber',     dot: 'bg-amber animate-pulse',      label: 'Connecting…' },
    disconnected: { color: 'text-text-muted', dot: 'bg-text-muted',              label: 'Offline' },
    error:        { color: 'text-red',       dot: 'bg-red',                      label: 'Error' },
  };
  const status = STATUS[connStatus] || STATUS.disconnected;

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 bg-panel border-b border-border
                      shrink-0 gap-2 flex-wrap min-h-[44px]">

        {/* ── Left: Logo + Room + Status ─────────────────────── */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-5 h-5 relative">
              <div className="absolute inset-0 bg-cyan/20 rotate-45 rounded-sm" />
              <div className="absolute inset-1 bg-cyan rotate-45 rounded-sm" />
            </div>
            <span className="font-display text-xs font-bold text-cyan hidden md:inline tracking-widest">
              CODESYNC
            </span>
          </div>

          <div className="h-4 w-px bg-border flex-shrink-0" />

          {roomName && (
            <span className="font-body text-text-secondary text-sm truncate max-w-[120px]">
              {roomName}
            </span>
          )}

          <div className={`flex items-center gap-1.5 flex-shrink-0 ${status.color}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            <span className="text-xs font-body hidden sm:inline">{status.label}</span>
          </div>

          {interviewMode && <span className="badge badge-warning flex-shrink-0">INTERVIEW</span>}

          {/* FIX 9: Display selection info when text is selected */}
          {selectionInfo && (
            <div className="hidden md:flex items-center gap-1.5 ml-1">
              <span className="text-2xs font-code text-text-muted">
                L{selectionInfo.startLine}–{selectionInfo.endLine}
              </span>
              <span className="text-2xs font-code text-cyan/70">
                {selectionInfo.length} chars
              </span>
            </div>
          )}
        </div>

        {/* ── Center: Language selector ─────────────────────── */}
        <LanguageSelector onLanguageChange={onLanguageChange} />

        {/* ── Right: Actions ────────────────────────────────── */}
        <div className="flex items-center gap-1.5">

          {/* Font size control */}
          <div className="flex items-center gap-0.5 border border-border rounded bg-surface px-1.5 py-0.5">
            <button
              onClick={() => dispatch(setEditorFontSize(fontSize - 1))}
              className="text-text-muted hover:text-cyan text-xs px-1 transition-colors"
              title="Decrease font size"
            >A-</button>
            <span className="text-text-secondary text-xs font-code w-5 text-center select-none">
              {fontSize}
            </span>
            <button
              onClick={() => dispatch(setEditorFontSize(fontSize + 1))}
              className="text-text-muted hover:text-cyan text-xs px-1 transition-colors"
              title="Increase font size"
            >A+</button>
          </div>

          {/* Command palette */}
          {onOpenPalette && (
            <button
              onClick={onOpenPalette}
              title="Command palette (Ctrl+K)"
              className="flex items-center gap-1 px-2 py-1.5 rounded border border-border text-text-muted
                         hover:text-cyan hover:border-cyan/40 hover:bg-cyan/10 transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <kbd className="text-2xs font-code hidden lg:inline">⌘K</kbd>
            </button>
          )}

          {/* Format */}
          <button
            onClick={onFormat}
            title="Format code (Shift+Alt+F)"
            className="p-1.5 rounded border border-border text-text-muted hover:text-cyan
                       hover:border-cyan/40 hover:bg-cyan/10 transition-all duration-150"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </button>

          {/* Reset to template */}
          {onResetTemplate && (
            <button
              onClick={onResetTemplate}
              title="Reset code to language template"
              className="p-1.5 rounded border border-border text-text-muted hover:text-amber
                         hover:border-amber/40 hover:bg-amber/10 transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}

          {/* Download code */}
          {onDownloadCode && (
            <button
              onClick={onDownloadCode}
              title="Download code as file"
              className="p-1.5 rounded border border-border text-text-muted hover:text-cyan
                         hover:border-cyan/40 hover:bg-cyan/10 transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          )}

          {/* Share */}
          <button
            onClick={handleCopyLink}
            title="Copy room link"
            className={`p-1.5 rounded border transition-all duration-150
              ${copied
                ? 'border-green bg-green/10 text-green'
                : 'border-border text-text-muted hover:text-cyan hover:border-cyan/40 hover:bg-cyan/10'}`}
          >
            {copied
              ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            }
          </button>

          {/* Interview mode (owner only) */}
          {isOwner && (
            <button
              onClick={() => {
                if (interviewMode) {
                  onSetInterviewMode?.(false, '', 45);
                } else {
                  setShowInterview(true);
                }
              }}
              title={interviewMode ? 'End interview mode' : 'Start interview mode'}
              className={`p-1.5 rounded border transition-all duration-150
                ${interviewMode
                  ? 'border-amber bg-amber/10 text-amber'
                  : 'border-border text-text-muted hover:text-amber hover:border-amber/40 hover:bg-amber/10'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </button>
          )}

          {/* Run */}
          <button
            onClick={onRun}
            disabled={isExecuting || connStatus !== 'connected'}
            title="Run code (Ctrl+Enter)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border font-display text-xs
                       font-semibold tracking-wider transition-all duration-150 uppercase
              ${isExecuting
                ? 'border-green/30 bg-green/10 text-green/60 cursor-not-allowed'
                : connStatus !== 'connected'
                ? 'border-border text-text-muted cursor-not-allowed opacity-50'
                : 'border-green bg-green/15 text-green hover:bg-green/25 hover:shadow-neon-green'}`}
          >
            {isExecuting ? (
              <><div className="w-3 h-3 border border-green/40 border-t-green rounded-full animate-spin" /><span>Running</span></>
            ) : (
              <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg><span>Run</span></>
            )}
          </button>

          {/* Leave */}
          <button
            onClick={onLeaveRoom}
            title="Leave room"
            className="p-1.5 rounded border border-border text-text-muted hover:text-red
                       hover:border-red/40 hover:bg-red/10 transition-all duration-150"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Interview mode start modal ─────────────────────────── */}
      {showInterviewModal && (
        <div className="fixed inset-0 bg-void/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel rounded border border-amber/30 w-full max-w-lg
                          relative corner-tl corner-br animate-slide-up shadow-panel">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display text-sm text-amber tracking-wider">START INTERVIEW MODE</h2>
              <button onClick={() => setShowInterview(false)}
                className="text-text-muted hover:text-text-primary transition-colors">✕</button>
            </div>
            <form onSubmit={handleInterviewSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">
                  Problem Statement
                </label>
                <textarea
                  className="input-cyber w-full rounded resize-none font-body text-sm"
                  rows={8}
                  placeholder={"Write the problem statement here...\n\nExample:\nImplement a function that returns the nth Fibonacci number.\n\nConstraints:\n- 0 ≤ n ≤ 30\n- Time complexity: O(n)"}
                  value={problemInput}
                  onChange={e => setProblemInput(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">
                  Duration (minutes)
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[15, 30, 45, 60, 90].map(m => (
                    <button key={m} type="button"
                      onClick={() => setDurationInput(String(m))}
                      className={`px-3 py-1.5 rounded border text-xs font-display transition-all
                        ${durationInput === String(m)
                          ? 'border-amber bg-amber/20 text-amber'
                          : 'border-border text-text-muted hover:border-amber/40'}`}
                    >{m}m</button>
                  ))}
                  <input
                    type="number" min="5" max="240"
                    className="input-cyber rounded w-20 text-sm text-center"
                    value={durationInput}
                    onChange={e => setDurationInput(e.target.value)}
                    placeholder="min"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowInterview(false)}
                  className="flex-1 btn-cyber text-xs py-2">Cancel</button>
                <button type="submit" className="flex-1 btn-cyber btn-cyber-green text-xs py-2">
                  Start Interview
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

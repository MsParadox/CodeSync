import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  selectCurrentOutput, selectIsExecuting, selectExecutionHistory,
  selectStdinValue, setStdinValue, selectLanguage, clearCurrentOutput,
} from '../../store/roomSlice.js';

// Judge-style verdicts. `label` is the human-readable badge text.
const STATUS_COLOR = {
  success:       { text: 'text-green', badge: 'badge-success', bg: 'border-green/20', label: 'Accepted' },
  error:         { text: 'text-red',   badge: 'badge-error',   bg: 'border-red/20',   label: 'Error' },
  runtime_error: { text: 'text-red',   badge: 'badge-error',   bg: 'border-red/20',   label: 'Runtime Error' },
  compile_error: { text: 'text-red',   badge: 'badge-error',   bg: 'border-red/20',   label: 'Compilation Error' },
  wrong_answer:  { text: 'text-red',   badge: 'badge-error',   bg: 'border-red/20',   label: 'Wrong Answer' },
  timeout:       { text: 'text-amber', badge: 'badge-warning', bg: 'border-amber/20', label: 'Time Limit Exceeded' },
  oom:           { text: 'text-amber', badge: 'badge-warning', bg: 'border-amber/20', label: 'Memory Limit Exceeded' },
};

function OutputLine({ text, type = 'stdout' }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <div
          key={i}
          className={`font-code text-xs leading-relaxed whitespace-pre-wrap break-all
            ${type === 'stderr' ? 'text-red/80' : 'text-green/90'}`}
        >
          {line || '\u00A0'}
        </div>
      ))}
    </>
  );
}

function ExecutionHistoryItem({ execution, onClick }) {
  const st = STATUS_COLOR[execution.status] || STATUS_COLOR.error;
  const time = new Date(execution.ranAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <button
      onClick={() => onClick(execution)}
      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface/50 transition-colors
                 border-b border-border/50 last:border-0 group text-left"
    >
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.text.replace('text-', 'bg-')}`} />
      <span className="font-code text-xs text-text-muted flex-shrink-0">{time}</span>
      <span className="badge text-2xs" style={{ fontSize: '9px' }}>{execution.language}</span>
      <span className={`text-xs font-code ml-auto flex-shrink-0 ${st.text}`}>
        {execution.executionTimeMs}ms
      </span>
    </button>
  );
}

export default function OutputPanel({ onRun }) {
  const dispatch    = useDispatch();
  const output      = useSelector(selectCurrentOutput);
  const isExecuting = useSelector(selectIsExecuting);
  const history     = useSelector(selectExecutionHistory);
  const stdin       = useSelector(selectStdinValue);
  const language    = useSelector(selectLanguage);

  const [tab, setTab] = useState('output'); // output | stdin | history
  const [selectedHistory, setSelectedHistory] = useState(null);
  const outputRef = useRef(null);

  const displayOutput = selectedHistory || output;
  const st = displayOutput ? (STATUS_COLOR[displayOutput.status] || STATUS_COLOR.error) : null;

  // Combined stdout + stderr text for copy/download actions
  const buildOutputText = useCallback(() => {
    if (!displayOutput) return '';
    const parts = [];
    if (displayOutput.stdout) parts.push(displayOutput.stdout);
    if (displayOutput.stderr) parts.push(`\n[stderr]\n${displayOutput.stderr}`);
    return parts.join('\n').trim();
  }, [displayOutput]);

  const handleCopy = useCallback(async () => {
    const text = buildOutputText();
    if (!text) { toast('Nothing to copy', { icon: '📋' }); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Output copied');
    } catch {
      toast.error('Copy failed');
    }
  }, [buildOutputText]);

  const handleDownload = useCallback(() => {
    const text = buildOutputText();
    if (!text) { toast('Nothing to download', { icon: '📥' }); return; }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `codesync-output-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Output downloaded');
  }, [buildOutputText]);

  const handleClear = useCallback(() => {
    setSelectedHistory(null);
    dispatch(clearCurrentOutput());
  }, [dispatch]);

  useEffect(() => {
    if (output) {
      setSelectedHistory(null);
      setTab('output');
    }
  }, [output]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [displayOutput]);

  const TABS = [
    { id: 'output', label: 'Output' },
    { id: 'stdin',  label: 'Stdin' },
    { id: 'history', label: `History (${history.length})` },
  ];

  return (
    <div className="flex flex-col h-full bg-panel">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSelectedHistory(null); }}
            className={`px-3 py-2 text-xs font-display tracking-wider uppercase transition-colors
              border-b-2 -mb-px
              ${tab === t.id
                ? 'border-cyan text-cyan'
                : 'border-transparent text-text-muted hover:text-text-secondary'}`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-3">
          {isExecuting && (
            <div className="flex items-center gap-1.5 text-green text-xs font-body">
              <div className="w-3 h-3 border border-green/40 border-t-green rounded-full animate-spin" />
              <span>Running…</span>
            </div>
          )}
          {displayOutput && st && (
            <span className={`badge ${st.badge}`}>
              {st.label || displayOutput.status?.toUpperCase()}
            </span>
          )}
          {displayOutput?.executionTimeMs > 0 && (
            <span className="text-2xs text-text-muted font-code">
              {displayOutput.executionTimeMs}ms
            </span>
          )}

          {/* Output actions — only meaningful on the output tab with content */}
          {tab === 'output' && displayOutput && (
            <div className="flex items-center gap-0.5 ml-1 border-l border-border pl-2">
              <button
                onClick={handleCopy}
                title="Copy output"
                className="p-1 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={handleDownload}
                title="Download output as .txt"
                className="p-1 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <button
                onClick={handleClear}
                title="Clear output"
                className="p-1 rounded text-text-muted hover:text-red hover:bg-red/10 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Output tab ─────────────────────────────────────────── */}
      {tab === 'output' && (
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto custom-scroll p-3"
        >
          {isExecuting && !displayOutput && (
            <div className="flex items-center justify-center h-full gap-3">
              <div className="w-5 h-5 border-2 border-green/20 border-t-green rounded-full animate-spin" />
              <span className="text-green text-sm font-body">Executing code…</span>
            </div>
          )}

          {!isExecuting && !displayOutput && (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
              <div className="text-3xl opacity-30">▶</div>
              <p className="text-text-muted text-xs font-body text-center">
                Run your code to see output here.<br />
                <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-2xs font-code">
                  Ctrl+Enter
                </kbd>
              </p>
              <button
                onClick={onRun}
                className="btn-cyber btn-cyber-green text-xs mt-1"
              >
                Run Code
              </button>
            </div>
          )}

          {displayOutput && (
            <div className={`rounded border p-3 space-y-1 ${st?.bg || 'border-border'}`}>
              {/* Executed by info (remote runs) */}
              {displayOutput.executedBy && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
                  <img
                    src={displayOutput.executedBy.avatar}
                    className="w-4 h-4 rounded-full"
                    alt=""
                  />
                  <span className="text-2xs text-text-muted font-body">
                    Executed by {displayOutput.executedBy.username}
                  </span>
                </div>
              )}

              {/* Exit code */}
              {displayOutput.exitCode !== undefined && displayOutput.exitCode !== 0 && (
                <div className="text-2xs font-code text-text-muted mb-1">
                  Exit code: {displayOutput.exitCode}
                </div>
              )}

              {/* Stdout */}
              {displayOutput.stdout && (
                <OutputLine text={displayOutput.stdout} type="stdout" />
              )}

              {/* Stderr */}
              {displayOutput.stderr && (
                <>
                  {displayOutput.stdout && (
                    <div className="h-px bg-border my-1.5" />
                  )}
                  <div className="text-2xs text-text-muted font-code mb-0.5">STDERR:</div>
                  <OutputLine text={displayOutput.stderr} type="stderr" />
                </>
              )}

              {/* Empty success */}
              {!displayOutput.stdout && !displayOutput.stderr && displayOutput.status === 'success' && (
                <div className="text-green text-xs font-body">✓ Executed with no output</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Stdin tab ──────────────────────────────────────────── */}
      {tab === 'stdin' && (
        <div className="flex-1 flex flex-col p-3 gap-2">
          <p className="text-text-muted text-xs font-body">
            Provide standard input for your program:
          </p>
          <textarea
            value={stdin}
            onChange={(e) => dispatch(setStdinValue(e.target.value))}
            placeholder={`Enter stdin for ${language}...\nEach line = one input`}
            className="flex-1 input-cyber rounded font-code text-xs resize-none custom-scroll"
            spellCheck={false}
          />
          <div className="text-2xs text-text-muted font-body">
            {stdin.split('\n').length} line{stdin.split('\n').length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* ── History tab ────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto custom-scroll">
          {history.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-muted text-xs font-body">No executions yet</p>
            </div>
          ) : (
            <div>
              {history.map((exec, i) => (
                <ExecutionHistoryItem
                  key={i}
                  execution={exec}
                  onClick={(e) => { setSelectedHistory(e); setTab('output'); }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

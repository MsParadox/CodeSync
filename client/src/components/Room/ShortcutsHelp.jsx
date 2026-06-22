import React, { useEffect } from 'react';

// ── Keyboard Shortcuts Help ───────────────────────────────────────
// Opened with Shift+? or from the command palette. Pure display modal.

const GROUPS = [
  {
    title: 'General',
    items: [
      { keys: ['Ctrl', 'K'],     desc: 'Open command palette' },
      { keys: ['Shift', '?'],    desc: 'Show this help' },
      { keys: ['Esc'],           desc: 'Close any open dialog' },
    ],
  },
  {
    title: 'Editor',
    items: [
      { keys: ['Ctrl', 'Enter'], desc: 'Run code' },
      { keys: ['Shift', 'Alt', 'F'], desc: 'Format document' },
      { keys: ['Ctrl', 'Z'],     desc: 'Undo' },
      { keys: ['Ctrl', 'F'],     desc: 'Find in file' },
      { keys: ['Ctrl', '/'],     desc: 'Toggle line comment' },
    ],
  },
  {
    title: 'Collaboration',
    items: [
      { keys: ['Ctrl', 'K'], desc: 'Then "Copy room link"' },
      { keys: ['Ctrl', 'K'], desc: 'Then "Open chat" / "Replay session"' },
    ],
  },
];

function Keys({ keys }) {
  return (
    <span className="flex items-center gap-1 flex-shrink-0">
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          <kbd className="font-code text-2xs bg-surface border border-border rounded px-1.5 py-0.5 text-text-secondary">
            {k}
          </kbd>
          {i < keys.length - 1 && <span className="text-text-muted text-2xs">+</span>}
        </React.Fragment>
      ))}
    </span>
  );
}

export default function ShortcutsHelp({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-void/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg glass-panel rounded border border-border shadow-panel
                      corner-tl corner-br animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-sm text-cyan tracking-wider">KEYBOARD SHORTCUTS</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">✕</button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5 max-h-[70vh] overflow-y-auto custom-scroll">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="text-2xs font-display tracking-widest uppercase text-text-muted mb-2">{g.title}</h3>
              <div className="space-y-2">
                {g.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-xs font-body text-text-secondary">{it.desc}</span>
                    <Keys keys={it.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-2.5 border-t border-border text-2xs font-body text-text-muted text-center">
          On macOS, use <kbd className="font-code">⌘</kbd> in place of <kbd className="font-code">Ctrl</kbd>.
        </div>
      </div>
    </div>
  );
}

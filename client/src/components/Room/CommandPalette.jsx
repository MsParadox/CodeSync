import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// ── Command Palette ───────────────────────────────────────────────
// A VS Code / Raycast-style fuzzy action launcher. Opened with Ctrl/Cmd+K.
// Receives a flat list of command objects from Room.jsx:
//   { id, label, hint?, section?, icon?, run, disabled? }
// Keyboard: ↑/↓ to move, Enter to run, Esc to close.

function scoreMatch(query, label) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  // Exact substring is best; otherwise subsequence (fuzzy) match.
  const idx = l.indexOf(q);
  if (idx === 0) return 1000;
  if (idx > 0)   return 500 - idx;
  // Subsequence: every query char appears in order
  let li = 0;
  for (let qi = 0; qi < q.length; qi++) {
    li = l.indexOf(q[qi], li);
    if (li === -1) return -1;
    li++;
  }
  return 100;
}

export default function CommandPalette({ open, commands, onClose }) {
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  // Reset query + focus input whenever the palette opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Defer focus until the modal is painted
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const enabled = commands.filter((c) => !c.disabled);
    if (!query.trim()) return enabled;
    return enabled
      .map((c) => ({ c, score: scoreMatch(query.trim(), c.label) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [commands, query]);

  // Keep the active index in range as the filtered list changes
  useEffect(() => { setActive(0); }, [query]);

  const runActive = useCallback(() => {
    const cmd = filtered[active];
    if (cmd) { onClose(); cmd.run(); }
  }, [filtered, active, onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runActive();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [filtered.length, runActive, onClose]);

  // Scroll the active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  // Group filtered commands by section, preserving order of first appearance
  const sections = [];
  const bySection = new Map();
  filtered.forEach((c) => {
    const s = c.section || 'Actions';
    if (!bySection.has(s)) { bySection.set(s, []); sections.push(s); }
    bySection.get(s).push(c);
  });
  // Build a flat index map so arrow keys traverse across sections
  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 bg-void/70 backdrop-blur-sm z-[60] flex items-start justify-center pt-[12vh] px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl glass-panel rounded border border-cyan/30 shadow-panel
                      corner-tl corner-br animate-slide-up overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command…"
            className="flex-1 bg-transparent outline-none text-sm font-body text-text-primary placeholder:text-text-muted"
          />
          <kbd className="text-2xs font-code text-text-muted border border-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto custom-scroll py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-muted text-xs font-body">
              No matching commands
            </div>
          ) : (
            sections.map((section) => (
              <div key={section}>
                <div className="px-4 pt-2 pb-1 text-2xs font-display tracking-widest uppercase text-text-muted">
                  {section}
                </div>
                {bySection.get(section).map((cmd) => {
                  const idx = flatIdx++;
                  const isActive = idx === active;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => { onClose(); cmd.run(); }}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors
                        ${isActive ? 'bg-cyan/15 text-cyan' : 'text-text-secondary hover:bg-surface/60'}`}
                    >
                      <span className="w-4 text-center flex-shrink-0">{cmd.icon || '›'}</span>
                      <span className="flex-1 text-sm font-body truncate">{cmd.label}</span>
                      {cmd.hint && (
                        <kbd className="text-2xs font-code text-text-muted border border-border rounded px-1.5 py-0.5 flex-shrink-0">
                          {cmd.hint}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-2xs font-body text-text-muted">
          <span><kbd className="font-code">↑↓</kbd> navigate</span>
          <span><kbd className="font-code">↵</kbd> run</span>
          <span className="ml-auto">{filtered.length} command{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectLanguage, selectCanEdit } from '../../store/roomSlice.js';

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', ext: '.js',  color: '#ffd600', icon: 'JS' },
  { id: 'typescript', label: 'TypeScript', ext: '.ts',  color: '#00d4ff', icon: 'TS' },
  { id: 'python',     label: 'Python',     ext: '.py',  color: '#00ff9d', icon: 'PY' },
  { id: 'cpp',        label: 'C++',        ext: '.cpp', color: '#ff6b35', icon: 'C+' },
  { id: 'java',       label: 'Java',       ext: '.java',color: '#ff3d6a', icon: 'JV' },
  { id: 'go',         label: 'Go',         ext: '.go',  color: '#00d4ff', icon: 'GO' },
  { id: 'rust',       label: 'Rust',       ext: '.rs',  color: '#ff6b35', icon: 'RS' },
];

export default function LanguageSelector({ onLanguageChange }) {
  const [open, setOpen]       = useState(false);
  const language              = useSelector(selectLanguage);
  const canEdit               = useSelector(selectCanEdit);
  const dropdownRef           = useRef(null);

  const current = LANGUAGES.find((l) => l.id === language) || LANGUAGES[0];

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (lang) => {
    setOpen(false);
    if (lang.id !== language) onLanguageChange(lang.id);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!canEdit}
        title={canEdit ? 'Change language' : 'Viewers cannot change the language'}
        className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all duration-150 text-sm font-body
          ${open
            ? 'border-cyan bg-cyan/10 text-cyan'
            : 'border-border bg-surface hover:border-cyan/40 hover:text-cyan text-text-secondary'}
          ${!canEdit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {/* Language badge */}
        <span
          className="text-xs font-display font-bold w-5 text-center"
          style={{ color: current.color }}
        >
          {current.icon}
        </span>
        <span className="hidden sm:inline">{current.label}</span>
        <span className="text-text-muted text-xs hidden md:inline">{current.ext}</span>

        {/* Chevron */}
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 glass-panel rounded border border-border z-50 py-1 animate-slide-up shadow-panel">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => handleSelect(lang)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-body transition-colors duration-100
                hover:bg-cyan/10 hover:text-cyan
                ${lang.id === language ? 'bg-cyan/10 text-cyan' : 'text-text-secondary'}`}
            >
              <span
                className="text-xs font-display font-bold w-5 text-center flex-shrink-0"
                style={{ color: lang.color }}
              >
                {lang.icon}
              </span>
              <span className="flex-1 text-left">{lang.label}</span>
              <span className="text-text-muted text-xs">{lang.ext}</span>
              {lang.id === language && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { LANGUAGES };

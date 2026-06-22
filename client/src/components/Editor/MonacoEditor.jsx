import React, { useRef, useCallback, useEffect, useState } from 'react';
import MonacoEditorReact from '@monaco-editor/react';
import { useSelector } from 'react-redux';
import {
  selectLanguage, selectRemoteCursors, selectEditorFontSize,
} from '../../store/roomSlice.js';

const TEMPLATES = {
  javascript: `// CodeSync — Real-Time Collaborative Editor\n\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nfor (let i = 0; i < 10; i++) {\n  console.log(\`fib(\${i}) = \${fibonacci(i)}\`);\n}\n`,
  typescript: `// TypeScript — Start coding!\n\ninterface Point { x: number; y: number; }\n\nfunction distance(a: Point, b: Point): number {\n  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);\n}\n\nconst p1: Point = { x: 0, y: 0 };\nconst p2: Point = { x: 3, y: 4 };\nconsole.log(\`Distance: \${distance(p1, p2)}\`);\n`,
  python: `# Python — Start coding!\n\ndef fibonacci(n: int) -> int:\n    if n <= 1:\n        return n\n    return fibonacci(n - 1) + fibonacci(n - 2)\n\nfor i in range(10):\n    print(f"fib({i}) = {fibonacci(i)}")\n`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint fibonacci(int n) {\n    if (n <= 1) return n;\n    return fibonacci(n-1) + fibonacci(n-2);\n}\n\nint main() {\n    for (int i = 0; i < 10; i++)\n        cout << "fib(" << i << ") = " << fibonacci(i) << endl;\n    return 0;\n}\n`,
  java: `public class Main {\n    static int fibonacci(int n) {\n        if (n <= 1) return n;\n        return fibonacci(n-1) + fibonacci(n-2);\n    }\n    public static void main(String[] args) {\n        for (int i = 0; i < 10; i++)\n            System.out.println("fib(" + i + ") = " + fibonacci(i));\n    }\n}\n`,
  go: `package main\n\nimport "fmt"\n\nfunc fibonacci(n int) int {\n    if n <= 1 { return n }\n    return fibonacci(n-1) + fibonacci(n-2)\n}\n\nfunc main() {\n    for i := 0; i < 10; i++ {\n        fmt.Printf("fib(%d) = %d\\n", i, fibonacci(i))\n    }\n}\n`,
  rust: `fn fibonacci(n: u32) -> u32 {\n    match n {\n        0 | 1 => n,\n        _ => fibonacci(n-1) + fibonacci(n-2),\n    }\n}\n\nfn main() {\n    for i in 0..10 {\n        println!("fib({}) = {}", i, fibonacci(i));\n    }\n}\n`,
};

// ── Brace-based re-indenter ─────────────────────────────────────────
// A pragmatic formatter for C-family languages (cpp/java/go/rust) that
// Monaco can't natively format. Normalises indentation by tracking brace
// depth. Not a full pretty-printer, but it cleans up the common cases
// (consistent 2-space indent, no trailing whitespace, closing braces
// dedented) so Shift+Alt+F is useful for every language.
function braceReindent(source, indentUnit = '  ') {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let depth = 0;
  const out = [];
  for (let raw of lines) {
    const line = raw.replace(/\s+$/g, '');           // strip trailing ws
    const trimmed = line.trim();
    if (trimmed === '') { out.push(''); continue; }

    // Lines starting with a closer dedent before printing
    const startsWithCloser = /^[)}\]]/.test(trimmed);
    const thisDepth = Math.max(0, depth - (startsWithCloser ? 1 : 0));
    out.push(indentUnit.repeat(thisDepth) + trimmed);

    // Net brace delta on this line drives the next line's depth
    let opens = 0, closes = 0;
    for (const ch of trimmed) {
      if (ch === '{' || ch === '(' || ch === '[') opens++;
      else if (ch === '}' || ch === ')' || ch === ']') closes++;
    }
    depth = Math.max(0, depth + opens - closes);
  }
  return out.join('\n');
}

const BRACE_FORMAT_LANGS = ['cpp', 'java', 'go', 'rust'];
let braceFormatterRegistered = false;

function registerBraceFormatter(monaco) {
  if (braceFormatterRegistered) return;   // module-global Monaco — register once
  braceFormatterRegistered = true;
  for (const lang of BRACE_FORMAT_LANGS) {
    monaco.languages.registerDocumentFormattingEditProvider(lang, {
      provideDocumentFormattingEdits(model) {
        const formatted = braceReindent(model.getValue());
        return [{ range: model.getFullModelRange(), text: formatted }];
      },
    });
  }
}

export default function MonacoEditor({ onMount, onCursorChange, onSelectionChange, onTyping, readOnly = false }) {
  const editorRef        = useRef(null);
  const monacoRef        = useRef(null);
  const decorationsRef   = useRef(null);   // FIX 10: use collection API

  const language  = useSelector(selectLanguage);
  const cursors   = useSelector(selectRemoteCursors);
  const fontSize  = useSelector(selectEditorFontSize);
  const [loaded, setLoaded] = useState(false);

  function defineTheme(monaco) {
    monaco.editor.defineTheme('codesync-dark', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'comment',         foreground: '444d7a', fontStyle: 'italic' },
        { token: 'keyword',         foreground: '00d4ff', fontStyle: 'bold' },
        { token: 'string',          foreground: '00ff9d' },
        { token: 'number',          foreground: 'ffd600' },
        { token: 'type',            foreground: 'c77dff' },
        { token: 'type.identifier', foreground: 'c77dff' },
        { token: 'function',        foreground: 'ff9d00' },
        { token: 'operator',        foreground: 'ff3db4' },
        { token: 'delimiter',       foreground: '8891c0' },
        { token: 'regexp',          foreground: 'ff6b35' },
        { token: 'tag',             foreground: 'ff3db4' },
        { token: 'constructor',     foreground: 'ff9d00', fontStyle: 'bold' },
      ],
      colors: {
        'editor.background':                  '#070812',
        'editor.foreground':                  '#e8eaf6',
        'editorLineNumber.foreground':        '#2a3060',
        'editorLineNumber.activeForeground':  '#00d4ff',
        'editor.lineHighlightBackground':     '#0e1028',
        'editorCursor.foreground':            '#00d4ff',
        'editor.selectionBackground':         '#00d4ff22',
        'editor.inactiveSelectionBackground': '#00d4ff11',
        'editorBracketMatch.background':      '#00d4ff22',
        'editorBracketMatch.border':          '#00d4ff88',
        'editorIndentGuide.background1':      '#1e254855',
        'editorIndentGuide.activeBackground1':'#00d4ff55',
        'editorGutter.background':            '#07081299',
        'minimap.background':                 '#070812',
        'scrollbarSlider.background':         '#1e254866',
        'scrollbarSlider.hoverBackground':    '#00d4ff33',
        'scrollbarSlider.activeBackground':   '#00d4ff66',
        'editor.wordHighlightBackground':     '#00d4ff18',
        'editor.wordHighlightStrongBackground':'#c77dff22',
        'editorSuggestWidget.background':     '#0e1028',
        'editorSuggestWidget.border':         '#1e2548',
        'editorSuggestWidget.selectedBackground':'#00d4ff22',
        'editorHoverWidget.background':       '#0e1028',
        'editorHoverWidget.border':           '#1e2548',
        'editorWidget.background':            '#0e1028',
        'editorWidget.border':                '#1e2548',
        'input.background':                   '#0a0d1a',
        'input.border':                       '#1e2548',
        'focusBorder':                        '#00d4ff66',
      },
    });
  }

  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current  = editor;
    monacoRef.current  = monaco;

    defineTheme(monaco);
    monaco.editor.setTheme('codesync-dark');

    editor.updateOptions({
      fontSize, fontFamily: '"JetBrains Mono","Fira Code",monospace',
      fontLigatures: true, lineHeight: 1.7, letterSpacing: 0.5,
      minimap: { enabled: true, scale: 2, showSlider: 'mouseover' },
      scrollBeyondLastLine: false, smoothScrolling: true,
      cursorBlinking: 'phase', cursorSmoothCaretAnimation: 'on',
      cursorStyle: 'line', cursorWidth: 2,
      renderLineHighlight: 'gutter', padding: { top: 16, bottom: 16 },
      suggest: { snippetsPreventQuickSuggestions: false },
      quickSuggestions: { other: true, comments: false, strings: false },
      formatOnType: true, formatOnPaste: true,
      autoClosingBrackets: 'always', autoClosingQuotes: 'always',
      tabSize: 2, insertSpaces: true, wordWrap: 'off',
      renderWhitespace: 'selection',
      guides: { indentation: true, bracketPairs: true },
      bracketPairColorization: { enabled: true },
      stickyScroll: { enabled: true },
      mouseWheelZoom: true, accessibilitySupport: 'off',
      readOnly,
    });

    // Cursor position broadcast
    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.(e.position.lineNumber, e.position.column);
    });

    // Selection tracking — drives the toolbar selection readout and
    // broadcasts the selection range to collaborators. Emits null when
    // the selection collapses to a caret (nothing selected).
    editor.onDidChangeCursorSelection((e) => {
      const sel = e.selection;
      const model = editor.getModel();
      if (!model || sel.isEmpty()) { onSelectionChange?.(null); return; }
      const length = model.getValueLengthInRange(sel);
      onSelectionChange?.({
        startLine:   sel.startLineNumber,
        startColumn: sel.startColumn,
        endLine:     sel.endLineNumber,
        endColumn:   sel.endColumn,
        length,
      });
    });

    editor.onDidChangeModelContent(() => {
      onTyping?.();
    });


    decorationsRef.current = editor.createDecorationsCollection([]);

    setLoaded(true);
    onMount?.(editor, monaco);
  }, [fontSize, readOnly, onMount, onCursorChange, onSelectionChange, onTyping]);

  const handleBeforeMount = useCallback((monaco) => {
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true, esModuleInterop: true,
    });
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      allowNonTsExtensions: true,
      strict: true, noEmit: true,
    });

    // ── Fallback formatters ───────────────────────────────────────
    // Monaco ships document formatters only for JS/TS/JSON/CSS/HTML.
    // For cpp/java/go/rust we register a lightweight brace-based
    // re-indenter so the Format action (Shift+Alt+F) actually does
    // something instead of silently no-op-ing. Python is left to its
    // existing indentation (re-indenting by braces would corrupt it).
    registerBraceFormatter(monaco);
  }, []);

  // Remote cursor decorations
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !decorationsRef.current) return;
    const monaco = monacoRef.current;

    // Inject per-user colour styles
    const styleId = 'remote-cursor-styles';
    let el = document.getElementById(styleId);
    if (!el) { el = document.createElement('style'); el.id = styleId; document.head.appendChild(el); }
    el.textContent = Object.entries(cursors).map(([uid, { color }]) => `
      .remote-cursor-${uid}       { border-left: 2px solid ${color} !important; }
      .remote-cursor-head-${uid}::after {
        background: ${color}; color: #070812;
        font-size: 10px; padding: 1px 4px; border-radius: 2px;
      }
    `).join('\n');

    decorationsRef.current.set(
      Object.entries(cursors).map(([uid, { line, column, username }]) => ({
        range: new monaco.Range(line, column, line, column),
        options: {
          className:              `remote-cursor-${uid}`,
          beforeContentClassName: `remote-cursor-head-${uid}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          hoverMessage: { value: `**${username}**` },
          after: { content: ` ${username} `, inlineClassName: `remote-cursor-head-${uid}` },
        },
      }))
    );
  }, [cursors]);

  useEffect(() => { editorRef.current?.updateOptions({ fontSize }); }, [fontSize]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (model) monacoRef.current.editor.setModelLanguage(model, language);
  }, [language]);

  return (
    <div className="w-full h-full relative">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-void z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
            <span className="text-text-secondary font-body text-sm">Loading editor…</span>
          </div>
        </div>
      )}
      <MonacoEditorReact
        height="100%"
        language={language}
        defaultValue={TEMPLATES[language] || '// Start coding!'}
        theme="codesync-dark"
        beforeMount={handleBeforeMount}
        onMount={handleEditorMount}
        loading={null}
        options={{ automaticLayout: true, readOnly }}
      />
      {readOnly && (
        <div className="absolute top-3 right-3 badge badge-warning z-10">READ ONLY</div>
      )}
    </div>
  );
}

export { TEMPLATES };

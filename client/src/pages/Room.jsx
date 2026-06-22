import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useSocket } from '../hooks/useSocket.js';
import { useYjs } from '../hooks/useYjs.js';
import MonacoEditor, { TEMPLATES } from '../components/Editor/MonacoEditor.jsx';
import EditorToolbar from '../components/Editor/EditorToolbar.jsx';
import ParticipantPanel from '../components/Room/ParticipantPanel.jsx';
import ChatPanel from '../components/Room/ChatPanel.jsx';
import OutputPanel from '../components/Room/OutputPanel.jsx';
import InterviewPanel from '../components/Room/InterviewPanel.jsx';
import CommandPalette from '../components/Room/CommandPalette.jsx';
import ShortcutsHelp from '../components/Room/ShortcutsHelp.jsx';
import ReplayModal from '../components/Room/ReplayModal.jsx';
import SubmissionsModal from '../components/Room/SubmissionsModal.jsx';
import TestCasesModal from '../components/Room/TestCasesModal.jsx';
import { LANGUAGES } from '../components/Editor/LanguageSelector.jsx';
import { api } from '../services/api.js';
import { executeCode, setCurrentOutput } from '../store/roomSlice.js';
import {
  selectRoomId, selectLanguage, selectStdinValue,
  selectIsOwner, selectCanEdit, selectInterviewMode, selectProblemStatement,
  selectConnectionStatus, setLanguage, selectInterviewDuration,
  setEditorFontSize, selectEditorFontSize, toggleOutput,
} from '../store/roomSlice.js';

const TABS = { PARTICIPANTS: 'participants', CHAT: 'chat', INTERVIEW: 'interview' };

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate    = useNavigate();
  const dispatch    = useDispatch();

  const socketHook = useSocket();
  const socketRef  = useRef(null);
  const yjs        = useYjs({ roomId, socketRef });
  // Tracks the unbind fn returned by yjs.bindSocket — see room-joined handler below
  const yjsUnbindRef = useRef(null);

  const [typingUsers, setTypingUsers]     = useState({});
  const [rightTab, setRightTab]           = useState(TABS.PARTICIPANTS);
  const [selectionInfo, setSelectionInfo] = useState(null);

  // Resizable layout — right (chat/people) panel width + output height.
  // Persisted to localStorage so the user's layout sticks between visits.
  const [rightWidth, setRightWidth]   = useState(() => {
    const v = parseInt(localStorage.getItem('cs_rightWidth'));
    return Number.isFinite(v) ? Math.min(Math.max(v, 220), 560) : 280;
  });
  const [outputHeight, setOutputHeight] = useState(() => {
    const v = parseInt(localStorage.getItem('cs_outputHeight'));
    return Number.isFinite(v) ? Math.min(Math.max(v, 120), 600) : 240;
  });
  // Mobile drawer: collapsed by default on narrow screens so the editor
  // gets full width; a floating button toggles the side panel.
  const [panelsCollapsed, setPanelsCollapsed] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1024
  );
  const centerColRef = useRef(null);

  // Generic drag-resize helper (horizontal or vertical)
  const startResize = useCallback((axis, getNext, setter) => (e) => {
    e.preventDefault();
    const move = (ev) => {
      const point = ev.touches ? ev.touches[0] : ev;
      const next = getNext(point);
      setter(next);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }, []);

  useEffect(() => { localStorage.setItem('cs_rightWidth', String(rightWidth)); }, [rightWidth]);
  useEffect(() => { localStorage.setItem('cs_outputHeight', String(outputHeight)); }, [outputHeight]);

  // Overlay UI (command palette, shortcuts help, session replay)
  const [showPalette, setShowPalette]     = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showReplay, setShowReplay]       = useState(false);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [showTestCases, setShowTestCases] = useState(false);

  // Redux state
  const storeRoomId   = useSelector(selectRoomId);
  const language      = useSelector(selectLanguage);
  const stdin         = useSelector(selectStdinValue);
  const isOwner       = useSelector(selectIsOwner);
  const canEdit       = useSelector(selectCanEdit);
  const interviewMode = useSelector(selectInterviewMode);
  const problemStmt   = useSelector(selectProblemStatement);
  const interviewDuration = useSelector(selectInterviewDuration);
  const fontSize      = useSelector(selectEditorFontSize);
  const connStatus    = useSelector(selectConnectionStatus);

  // ── Connect & join room ────────────────────────────────────────
  useEffect(() => {
    const socket = socketHook.connect();
    socketRef.current = socket;

    const joinRoom = () => socketHook.joinRoom(roomId);
    socket.connected ? joinRoom() : socket.once('connect', joinRoom);

    const handleRoomJoined = (payload) => {
      if (payload.yjsState) yjs.applyInitialState(payload.yjsState);
      if (payload.interviewMode) setRightTab(TABS.INTERVIEW);

      yjsUnbindRef.current?.();
      yjsUnbindRef.current = yjs.bindSocket(socket);
    };
    socket.on('room-joined', handleRoomJoined);

    const onTyping     = ({ userId, username }) =>
      setTypingUsers(p => ({ ...p, [userId]: username }));
    const onStopTyping = ({ userId }) =>
      setTypingUsers(p => { const n = { ...p }; delete n[userId]; return n; });

    socket.on('user-typing',          onTyping);
    socket.on('user-stopped-typing',  onStopTyping);
    socket.on('interview-mode-changed', ({ enabled }) => {
      if (enabled) setRightTab(TABS.INTERVIEW);
    });

    return () => {
      yjsUnbindRef.current?.();
      yjsUnbindRef.current = null;
      socket.off('room-joined',           handleRoomJoined);
      socket.off('user-typing',           onTyping);
      socket.off('user-stopped-typing',   onStopTyping);
      socket.off('interview-mode-changed');
      socketHook.leaveRoom(roomId);
      socketHook.disconnect();
    };
  }, [roomId]); // eslint-disable-line


  const handleRunRef = useRef(null);

  const handleRun = useCallback(async () => {
    if (!storeRoomId) return;

    if (!canEdit) { toast.error('Viewers cannot execute code'); return; }
    const code = yjs.getCode();
    if (!code.trim()) { toast.error('Nothing to run!'); return; }

    socketHook.broadcastExecStarted(storeRoomId);

    const result = await dispatch(executeCode({
      language, code, stdin, roomId: storeRoomId,
    })).unwrap().catch(err => ({
      stdout: '', stderr: String(err), exitCode: 1, status: 'error',
    }));

    socketHook.broadcastExecResult(storeRoomId, result);
  }, [storeRoomId, language, stdin, yjs, dispatch, socketHook]);

  // Keep the ref in sync whenever handleRun is recreated
  handleRunRef.current = handleRun;

  // ── Monaco callbacks ──────────────────────────────────────────
  const editorRef = useRef(null);

  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current    = editor;
    editor._roomId       = storeRoomId || roomId;
    yjs.bindMonaco(editor);

    // FIX 4: pass a stable wrapper that delegates to the ref
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => handleRunRef.current?.()
    );
  }, [yjs, storeRoomId, roomId]);

  const handleCursorChange = useCallback((line, column) => {
    if (storeRoomId) socketHook.sendCursorUpdate(storeRoomId, line, column);
  }, [storeRoomId, socketHook]);

  // Typing indicator (debounced)
  const typingTimer = useRef(null);
  const handleTypingStart = useCallback(() => {
    if (!storeRoomId || !canEdit) return; // viewers don't type
    socketHook.sendTypingStart(storeRoomId);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketHook.sendTypingStop(storeRoomId), 1500);
  }, [storeRoomId, socketHook]);

  // Selection tracking for toolbar display
  const handleEditorSelectionChange = useCallback((info) => {
    setSelectionInfo(info);
    if (storeRoomId && info) {
      socketHook.sendSelectionUpdate(storeRoomId, info);
    }
  }, [storeRoomId, socketHook]);

  const handleLanguageChange = useCallback((lang) => {
    if (!storeRoomId) return;
    dispatch(setLanguage(lang));
    socketHook.sendLanguageChange(storeRoomId, lang);
  }, [storeRoomId, dispatch, socketHook]);

  const handleFormat = useCallback(async () => {
    if (!canEdit) { toast.error('Viewers cannot edit code'); return; }
    const editor = editorRef.current;
    const action = editor?.getAction('editor.action.formatDocument');
    if (!action) { toast.error('Formatter unavailable'); return; }
    editor.focus();
    try {
      await action.run();
      toast.success('Formatted', { duration: 1200 });
    } catch {
      toast.error('Nothing to format');
    }
  }, [canEdit]);

  // Reset the shared document to the current language's starter template.
  // Goes through Yjs setCode so the change is a normal CRDT edit and
  // propagates to every collaborator (editors/owner only).
  const handleResetTemplate = useCallback(() => {
    if (!canEdit) { toast.error('Viewers cannot edit code'); return; }
    const tpl = TEMPLATES[language] || '// Start coding!\n';
    yjs.setCode(tpl);
    toast.success('Reset to template');
  }, [canEdit, language, yjs]);

  const handleLeave = useCallback(() => {
    socketHook.leaveRoom(roomId);
    navigate('/');
  }, [roomId, socketHook, navigate]);

  const handleSendMessage = useCallback((text) => {
    socketHook.sendChatMessage(storeRoomId, text);
  }, [storeRoomId, socketHook]);

  // Explicit enabled flag (NOT a blind toggle): previously this computed
  // `enabling = !interviewMode`, so when the owner SAVED an edit to the
  // problem statement while interview mode was already ON, it flipped the
  // session OFF. Callers now state their intent directly.
  const handleSetInterviewMode = useCallback((enabled, problemStatement, durationMinutes) => {
    if (!storeRoomId) return;
    socketHook.setInterviewModeSocket(
      storeRoomId,
      enabled,
      problemStatement ?? problemStmt,
      durationMinutes || interviewDuration || 45,
    );
    if (enabled) setRightTab(TABS.INTERVIEW);
  }, [storeRoomId, problemStmt, interviewDuration, socketHook]);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard?.writeText(url)
      .then(() => toast.success('Room link copied!'))
      .catch(() => toast.error('Copy failed'));
  }, [roomId]);

  // Download the current editor content as a file with the right extension.
  const handleDownloadCode = useCallback(() => {
    const code = yjs.getCode();
    if (!code.trim()) { toast.error('Nothing to download'); return; }
    const ext = LANGUAGES.find((l) => l.id === language)?.ext || '.txt';
    const base = language === 'java' ? 'Main' : 'main';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${base}${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${base}${ext}`);
  }, [yjs, language]);

  // Interview submission: run the code once more, broadcast the result,
  // and notify the room (interviewer) that the candidate has submitted.
  const handleSubmitSolution = useCallback(async () => {
    if (!storeRoomId) return;
    if (!canEdit) { toast.error('Viewers cannot submit'); return; }
    const code = yjs.getCode();
    if (!code.trim()) { toast.error('Nothing to submit!'); return; }
    const t = toast.loading('Judging submission…');
    try {
      // Server runs the code against the room's HIDDEN test cases (if any)
      // and decides acceptance — inputs/expected outputs never reach us.
      const { data } = await api.post(
        `/rooms/${storeRoomId}/submit`,
        { language, code, stdin },
        { timeout: 180000 },
      );
      toast.dismiss(t);

      if (data.testsTotal > 0) {
        if (data.accepted) {
          toast.success(`Accepted ✓ — passed all ${data.testsTotal} hidden tests`);
          dispatch(setCurrentOutput({
            stdout: `✓ Accepted\nPassed ${data.testsPassed}/${data.testsTotal} hidden test cases.`,
            stderr: '', status: 'success', exitCode: 0, executionTimeMs: 0,
          }));
        } else {
          const failVerdict = data.results?.find((r) => !r.passed)?.verdict || 'Failed';
          toast.error(`Hidden test #${data.firstFailureIndex} failed — ${failVerdict}`);
          dispatch(setCurrentOutput({
            stdout: '',
            stderr: `✗ Hidden test case #${data.firstFailureIndex} failed: ${failVerdict}\n`
                  + `Passed ${data.testsPassed}/${data.testsTotal} test cases. Fix and resubmit.`,
            status: data.status, exitCode: 1, executionTimeMs: 0,
          }));
        }
      } else {
        // No hidden tests — show the single run and broadcast it.
        const run = data.run || {};
        dispatch(setCurrentOutput({ ...run }));
        socketHook.broadcastExecResult(storeRoomId, { ...run, language });
        if (data.accepted) toast.success('Submitted — ran successfully ✓');
        else toast('Submitted (with errors) — check the output', { icon: '📨' });
      }
    } catch (err) {
      toast.dismiss(t);
      toast.error(err.response?.data?.error || 'Submission failed');
    }
  }, [storeRoomId, canEdit, language, stdin, yjs, dispatch, socketHook]);

  // ── Command palette command list ──────────────────────────────
  const commands = useMemo(() => {
    const cmds = [
      { id: 'run', section: 'Editor', icon: '▶', label: 'Run code', hint: 'Ctrl+↵',
        disabled: !canEdit || connStatus !== 'connected', run: () => handleRunRef.current?.() },
      { id: 'format', section: 'Editor', icon: '⌥', label: 'Format document', hint: '⇧⌥F',
        disabled: !canEdit, run: () => editorRef.current?.getAction('editor.action.formatDocument')?.run() },
      { id: 'reset', section: 'Editor', icon: '↺', label: 'Reset code to template',
        disabled: !canEdit, run: () => handleResetTemplate() },
      { id: 'font-inc', section: 'Editor', icon: 'A', label: 'Increase font size',
        run: () => dispatch(setEditorFontSize(fontSize + 1)) },
      { id: 'font-dec', section: 'Editor', icon: 'a', label: 'Decrease font size',
        run: () => dispatch(setEditorFontSize(fontSize - 1)) },

      { id: 'panel-people', section: 'Panels', icon: '👥', label: 'Show participants',
        run: () => setRightTab(TABS.PARTICIPANTS) },
      { id: 'panel-chat', section: 'Panels', icon: '💬', label: 'Show chat',
        run: () => setRightTab(TABS.CHAT) },
      { id: 'panel-output', section: 'Panels', icon: '▤', label: 'Toggle output panel',
        run: () => dispatch(toggleOutput()) },

      { id: 'copy-link', section: 'Room', icon: '🔗', label: 'Copy room link',
        run: () => handleCopyLink() },
      { id: 'download-code', section: 'Editor', icon: '⬇', label: 'Download code as file',
        run: () => handleDownloadCode() },
      { id: 'replay', section: 'Room', icon: '⏪', label: 'Replay session',
        run: () => setShowReplay(true) },
      { id: 'submissions', section: 'Room', icon: '📥', label: 'View submissions',
        run: () => setShowSubmissions(true) },
      { id: 'shortcuts', section: 'Room', icon: '⌨', label: 'Keyboard shortcuts', hint: '⇧?',
        run: () => setShowShortcuts(true) },
      { id: 'leave', section: 'Room', icon: '⎋', label: 'Leave room',
        run: () => handleLeave() },
    ];

    // Owner-only: language switching + interview toggle
    if (isOwner) {
      LANGUAGES.forEach((l) => {
        if (l.id === language) return;
        cmds.push({
          id: `lang-${l.id}`, section: 'Language', icon: l.icon?.[0] || '💻',
          label: `Switch to ${l.label}`, run: () => handleLanguageChange(l.id),
        });
      });
      cmds.push({
        id: 'interview', section: 'Room', icon: '🎯',
        label: interviewMode ? 'End interview mode' : 'Start interview mode',
        run: () => handleSetInterviewMode(!interviewMode, interviewMode ? '' : problemStmt, interviewDuration || 45),
      });
      cmds.push({
        id: 'testcases', section: 'Room', icon: '🧪',
        label: 'Manage hidden test cases',
        run: () => setShowTestCases(true),
      });
    }
    return cmds;
  }, [canEdit, connStatus, isOwner, language, interviewMode, problemStmt, interviewDuration,
      fontSize, dispatch, handleCopyLink, handleResetTemplate, handleLeave,
      handleLanguageChange, handleSetInterviewMode, handleDownloadCode]);

  // ── Global keyboard shortcuts (palette / help) ────────────────
  // Capture phase so Ctrl/Cmd+K is caught even when Monaco is focused
  // (Monaco otherwise consumes it as a chord prefix).
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowPalette((v) => !v);
        return;
      }
      if (e.shiftKey && e.key === '?') {
        // Don't hijack a literal "?" typed in chat, inputs, or the editor
        const t = e.target;
        const tag = t?.tagName;
        const typing = tag === 'INPUT' || tag === 'TEXTAREA' ||
                       t?.isContentEditable || t?.closest?.('.monaco-editor');
        if (typing) return;
        e.preventDefault();
        setShowShortcuts(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const availableTabs = [
    TABS.PARTICIPANTS, TABS.CHAT,
    ...(interviewMode ? [TABS.INTERVIEW] : []),
  ];

  const tabLabel = (id) => ({
    [TABS.PARTICIPANTS]: `People`,
    [TABS.CHAT]:         'Chat',
    [TABS.INTERVIEW]:    '🎯 Problem',
  }[id] || id);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-void">
      <EditorToolbar
        onRun={handleRun}
        onLanguageChange={handleLanguageChange}
        onFormat={handleFormat}
        onResetTemplate={handleResetTemplate}
        onDownloadCode={handleDownloadCode}
        onOpenPalette={() => setShowPalette(true)}
        onLeaveRoom={handleLeave}
        onSetInterviewMode={handleSetInterviewMode}
        selectionInfo={selectionInfo}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Center: Editor + Output ──────────────────────────── */}
        <div ref={centerColRef} className="flex-1 flex flex-col overflow-hidden min-w-0">
          {interviewMode && problemStmt && (
            <div className="bg-amber/10 border-b border-amber/30 px-4 py-2 flex-shrink-0 flex items-start gap-2">
              <span className="badge badge-warning text-2xs flex-shrink-0 mt-0.5">PROBLEM</span>
              <p className="text-amber/90 text-xs font-body leading-relaxed line-clamp-2">
                {problemStmt}
              </p>
            </div>
          )}

          <div className="flex-1 overflow-hidden min-h-0">
            <MonacoEditor
              onMount={handleEditorMount}
              onCursorChange={handleCursorChange}
              onSelectionChange={handleEditorSelectionChange}
              onTyping={handleTypingStart}
              readOnly={!canEdit}
            />
          </div>

          {/* Vertical resize handle for the output panel */}
          <div
            onMouseDown={startResize('y', (p) => {
              const rect = centerColRef.current?.getBoundingClientRect();
              if (!rect) return outputHeight;
              return Math.min(Math.max(rect.bottom - p.clientY, 120), rect.height - 140);
            }, setOutputHeight)}
            onTouchStart={startResize('y', (p) => {
              const rect = centerColRef.current?.getBoundingClientRect();
              if (!rect) return outputHeight;
              return Math.min(Math.max(rect.bottom - p.clientY, 120), rect.height - 140);
            }, setOutputHeight)}
            className="h-1.5 flex-shrink-0 cursor-row-resize bg-border/60 hover:bg-cyan/50 transition-colors
                       relative group"
            title="Drag to resize output"
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5 rounded
                            bg-text-muted/40 group-hover:bg-cyan transition-colors" />
          </div>

          <div
            className="flex-shrink-0"
            style={{ height: `${outputHeight}px`, minHeight: '120px' }}
          >
            <OutputPanel onRun={handleRun} />
          </div>
        </div>

        {/* Horizontal resize handle for the right panel (hidden on mobile) */}
        <div
          onMouseDown={startResize('x', (p) => Math.min(Math.max(window.innerWidth - p.clientX, 220), 560), setRightWidth)}
          onTouchStart={startResize('x', (p) => Math.min(Math.max(window.innerWidth - p.clientX, 220), 560), setRightWidth)}
          className="hidden lg:block w-1.5 flex-shrink-0 cursor-col-resize bg-border/60 hover:bg-cyan/50
                     transition-colors relative group"
          title="Drag to resize panel"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-0.5 rounded
                          bg-text-muted/40 group-hover:bg-cyan transition-colors" />
        </div>

        {/* ── Right panel ─────────────────────────────────────── */}
        <div
          style={{ width: `${rightWidth}px` }}
          className={`flex-shrink-0 border-l border-border flex-col
            ${panelsCollapsed ? 'hidden' : 'flex'}
            max-lg:!w-full max-lg:absolute max-lg:right-0 max-lg:top-0 max-lg:bottom-0 max-lg:z-30
            max-lg:bg-panel max-lg:shadow-2xl max-lg:max-w-[20rem]`}
        >
          <div className="flex items-center border-b border-border flex-shrink-0">
            {availableTabs.map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2 px-1 text-xs font-display uppercase tracking-wider
                  border-b-2 -mb-px transition-colors whitespace-nowrap
                  ${rightTab === tab
                    ? 'border-cyan text-cyan'
                    : 'border-transparent text-text-muted hover:text-text-secondary'}`}
              >
                {tabLabel(tab)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            {rightTab === TABS.PARTICIPANTS && (
              <ParticipantPanel typingUsers={typingUsers} socketHook={socketHook} />
            )}
            {rightTab === TABS.CHAT && (
              <ChatPanel onSendMessage={handleSendMessage} />
            )}
            {rightTab === TABS.INTERVIEW && (
              <InterviewPanel
                isOwner={isOwner}
                canSubmit={canEdit}
                onSetInterviewMode={handleSetInterviewMode}
                onSubmitSolution={handleSubmitSolution}
                onViewSubmissions={() => setShowSubmissions(true)}
                onManageTestCases={() => setShowTestCases(true)}
              />
            )}
          </div>
        </div>

        {/* Mobile backdrop when the drawer is open */}
        {!panelsCollapsed && (
          <div
            className="lg:hidden absolute inset-0 bg-void/50 z-20"
            onClick={() => setPanelsCollapsed(true)}
          />
        )}
      </div>

      {/* Floating panel toggle (mobile / tablet only) */}
      <button
        onClick={() => setPanelsCollapsed((c) => !c)}
        className="lg:hidden fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full border border-cyan/40
                   bg-panel/95 text-cyan shadow-neon-cyan flex items-center justify-center backdrop-blur"
        title={panelsCollapsed ? 'Open panel' : 'Close panel'}
      >
        {panelsCollapsed ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-3-3h-4m-6 5H2v-2a3 3 0 013-3h4m6-3a3 3 0 11-6 0 3 3 0 016 0zm6-3a2 2 0 11-4 0 2 2 0 014 0zM7 8a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </button>

      {connStatus === 'error' && (
        <div className="absolute inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-panel rounded border border-red/30 p-6 text-center max-w-sm corner-tl corner-br">
            <div className="text-red text-3xl mb-3">⚠</div>
            <h3 className="font-display text-sm text-red mb-2">Connection Lost</h3>
            <p className="text-text-secondary text-xs font-body mb-4">
              Unable to reach CodeSync servers.
            </p>
            <button onClick={() => window.location.reload()} className="btn-cyber btn-cyber-red text-xs">
              Reconnect
            </button>
          </div>
        </div>
      )}

      {/* ── Overlays: command palette, shortcuts, replay ─────────── */}
      <CommandPalette
        open={showPalette}
        commands={commands}
        onClose={() => setShowPalette(false)}
      />
      <ShortcutsHelp
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
      <ReplayModal
        open={showReplay}
        roomId={roomId}
        language={language}
        onClose={() => setShowReplay(false)}
      />
      <SubmissionsModal
        open={showSubmissions}
        roomId={roomId}
        onClose={() => setShowSubmissions(false)}
      />
      <TestCasesModal
        open={showTestCases}
        roomId={roomId}
        onClose={() => setShowTestCases(false)}
      />
    </div>
  );
}

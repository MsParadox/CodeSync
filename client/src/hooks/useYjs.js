import { useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { useSelector } from 'react-redux';
import { selectUser } from '../store/authSlice.js';
import { selectUserColor } from '../store/roomSlice.js';

const LOCAL_ORIGIN = 'codesync-local';


function uint8ToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function useYjs({ roomId, socketRef }) {
  const ydocRef    = useRef(null);
  const bindingRef = useRef(null);
  const editorRef  = useRef(null);
  const user       = useSelector(selectUser);
  const userColor  = useSelector(selectUserColor);

  // ── Create Y.Doc once per roomId ─────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Broadcast local changes (skip remote-sourced updates via origin guard).
    // This reads socketRef.current LAZILY at fire-time (when the user actually
    // types), by which point Room.jsx's effect has long since created the
    // socket — so this part always worked correctly.
    const broadcastUpdate = (update, origin) => {
      if (origin === 'remote') return;
      if (!socketRef.current || !roomId) return;
      socketRef.current.emit('yjs-update', { roomId, update: uint8ToBase64(update) });
    };

    ydoc.on('update', broadcastUpdate);

    return () => {
      ydoc.off('update', broadcastUpdate);
      bindingRef.current?.destroy();
      bindingRef.current = null;
      ydoc.destroy();
      ydocRef.current = null;
    };
  }, [roomId]);

  const bindSocket = useCallback((socket) => {
    if (!socket) return () => {};

    const handleRemoteUpdate = ({ update, userId }) => {
      if (String(userId) === String(user?._id)) return; // ignore echo of our own update
      if (!update) return;
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      try {
        Y.applyUpdate(ydoc, base64ToUint8(update), 'remote');
      } catch (e) {
        console.warn('[useYjs] Remote update failed:', e.message);
      }
    };

    const handleSync = ({ state }) => {
      if (!state) return;
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      try {
        Y.applyUpdate(ydoc, base64ToUint8(state), 'remote');
      } catch (e) {
        console.warn('[useYjs] Sync state failed:', e.message);
      }
    };

    socket.on('yjs-update', handleRemoteUpdate);
    socket.on('yjs-sync',   handleSync);
    if (roomId) socket.emit('request-sync', { roomId });

    return () => {
      socket.off('yjs-update', handleRemoteUpdate);
      socket.off('yjs-sync',   handleSync);
    };
  }, [roomId, user?._id]);

  // ── Apply server snapshot (called from Room.jsx after room-joined) ─
  const applyInitialState = useCallback((base64State) => {
    const ydoc = ydocRef.current;
    if (!ydoc || !base64State) return;
    try {
      Y.applyUpdate(ydoc, base64ToUint8(base64State), 'remote');
    } catch (e) {
      console.warn('[useYjs] Initial state apply failed:', e.message);
    }
  }, []);

  // ── Bind Monaco editor to shared Y.Text ─────────────────────────
  const bindMonaco = useCallback((monacoEditor) => {
    if (!ydocRef.current || !monacoEditor) return;
    bindingRef.current?.destroy();

    const yText       = ydocRef.current.getText('code');
    const monacoModel = monacoEditor.getModel();
    if (!monacoModel) return;

    // Awareness shim (no y-protocols dependency)
    const awareness = {
      localState: null,
      states: new Map(),
      _handlers: { change: [] },
      on(ev, fn)  { this._handlers[ev]?.push(fn); },
      off(ev, fn) { this._handlers[ev] = this._handlers[ev]?.filter(h => h !== fn); },
      setLocalStateField(field, value) {
        this.localState = { ...(this.localState || {}), [field]: value };
        if (socketRef.current && ydocRef.current?._roomId) {
          const encoded = btoa(JSON.stringify({ userId: user?._id, ...this.localState }));
          socketRef.current.emit('yjs-awareness', {
            roomId: ydocRef.current._roomId,
            awarenessUpdate: encoded,
          });
        }
      },
      getStates() { return this.states; },
    };

    if (ydocRef.current) ydocRef.current._roomId = monacoEditor._roomId;
    editorRef.current = monacoEditor;

    try {
      const binding = new MonacoBinding(
        yText, monacoModel, new Set([monacoEditor]), awareness
      );
      bindingRef.current = binding;
    } catch (e) {
      console.warn('[useYjs] MonacoBinding failed:', e.message);
    }
  }, [user]);

  const getCode = useCallback(() =>
    ydocRef.current?.getText('code').toString() || '', []);

  // Replace the entire document content. When a Monaco editor is bound we
  // drive the change through its model (full-range executeEdits): the
  // y-monaco binding then diffs the model change into Y.Text atomically,
  // which avoids the delete-then-insert race where the binding's internal
  // mutex could swallow the delete and leave the insert — causing repeated
  // resets to APPEND instead of replace. Falls back to direct Y.Text edits
  // before the editor is mounted.
  const setCode = useCallback((newCode) => {
    const editor = editorRef.current;
    const model  = editor?.getModel?.();
    if (editor && model) {
      const fullRange = model.getFullModelRange();
      editor.executeEdits('reset-template', [{ range: fullRange, text: newCode }]);
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.pushUndoStop?.();
      return;
    }
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    const yText = ydoc.getText('code');
    ydoc.transact(() => {
      if (yText.length > 0) yText.delete(0, yText.length);
      yText.insert(0, newCode);
    }, LOCAL_ORIGIN);
  }, []);

  return { ydoc: ydocRef.current, applyInitialState, bindMonaco, bindSocket, getCode, setCode };
}

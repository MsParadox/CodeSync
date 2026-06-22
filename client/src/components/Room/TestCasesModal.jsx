import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { api } from '../../services/api.js';
import { setRoomTestCaseCount } from '../../store/roomSlice.js';
import toast from 'react-hot-toast';

// ── Hidden Test Cases manager (owner only) ────────────────────────
// Owners define input/expected-output pairs that submissions are judged
// against. They are NEVER sent to candidates — only the count is exposed.
// Leaving the list empty makes submissions just run normally.

export default function TestCasesModal({ open, roomId, onClose }) {
  const dispatch = useDispatch();
  const [cases, setCases]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!open || !roomId) return;
    setLoading(true);
    api.get(`/rooms/${roomId}/testcases`)
      .then(({ data }) => setCases(data.testCases?.length ? data.testCases : []))
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load test cases'))
      .finally(() => setLoading(false));
  }, [open, roomId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const addCase    = () => setCases((c) => [...c, { input: '', expectedOutput: '' }]);
  const removeCase = (i) => setCases((c) => c.filter((_, idx) => idx !== i));
  const update     = (i, field, val) =>
    setCases((c) => c.map((tc, idx) => (idx === i ? { ...tc, [field]: val } : tc)));

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const clean = cases.filter((c) => c.input.trim() !== '' || c.expectedOutput.trim() !== '');
      const { data } = await api.put(`/rooms/${roomId}/testcases`, { testCases: clean });
      dispatch(setRoomTestCaseCount(data.count));
      toast.success(data.count > 0 ? `Saved ${data.count} hidden test case${data.count !== 1 ? 's' : ''}` : 'Test cases cleared');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [cases, roomId, dispatch, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-void/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl h-[80vh] glass-panel rounded border border-amber/30 shadow-panel
                      corner-tl corner-br animate-slide-up flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-amber">🧪</span>
            <h2 className="font-display text-sm text-amber tracking-wider">HIDDEN TEST CASES</h2>
            {!loading && <span className="badge badge-warning text-2xs">{cases.length}</span>}
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">✕</button>
        </div>

        <p className="px-5 pt-3 text-2xs font-body text-text-muted flex-shrink-0">
          Submissions are accepted only when every test passes. Candidates see pass/fail
          verdicts (Wrong Answer, TLE, …) but never the inputs. Leave empty to run normally.
        </p>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scroll p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-full gap-3">
              <div className="w-5 h-5 border-2 border-amber/20 border-t-amber rounded-full animate-spin" />
              <span className="text-text-secondary text-sm font-body">Loading…</span>
            </div>
          ) : cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="text-3xl opacity-30">🧪</div>
              <p className="text-text-muted text-sm font-body">No hidden test cases.<br/>Submissions will just run normally.</p>
              <button onClick={addCase} className="btn-cyber text-xs py-1.5 mt-1">+ Add Test Case</button>
            </div>
          ) : (
            cases.map((tc, i) => (
              <div key={i} className="rounded border border-border bg-surface/40 p-3 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xs font-display tracking-widest uppercase text-amber/80">Test #{i + 1}</span>
                  <button onClick={() => removeCase(i)}
                    className="text-text-muted hover:text-red text-xs transition-colors" title="Remove">✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-2xs font-body text-text-muted block mb-1">Input (stdin)</label>
                    <textarea
                      value={tc.input}
                      onChange={(e) => update(i, 'input', e.target.value)}
                      rows={4}
                      placeholder={'e.g.\n5\n1 2 3 4 5'}
                      className="input-cyber w-full rounded font-code text-xs resize-y custom-scroll"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <label className="text-2xs font-body text-text-muted block mb-1">Expected output</label>
                    <textarea
                      value={tc.expectedOutput}
                      onChange={(e) => update(i, 'expectedOutput', e.target.value)}
                      rows={4}
                      placeholder={'e.g.\n15'}
                      className="input-cyber w-full rounded font-code text-xs resize-y custom-scroll"
                      spellCheck={false}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-border flex-shrink-0">
            {cases.length > 0 && (
              <button onClick={addCase} className="btn-cyber text-xs py-2" disabled={cases.length >= 25}>
                + Add ({cases.length}/25)
              </button>
            )}
            <div className="flex-1" />
            <button onClick={onClose} className="btn-cyber text-xs py-2">Cancel</button>
            <button onClick={save} disabled={saving}
              className="btn-cyber btn-cyber-green text-xs py-2 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Test Cases'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

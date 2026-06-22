import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Editor from '@monaco-editor/react';
import toast from 'react-hot-toast';
import {
  fetchProblem, markSolved,
  selectCurrentProblem, selectCurrentSolved, selectProblemLoading,
} from '../store/problemSlice.js';
import { selectIsAuthenticated } from '../store/authSlice.js';
import { createRoom } from '../store/roomSlice.js';
import { LANGUAGES } from '../components/Editor/LanguageSelector.jsx';
import { api } from '../services/api.js';

const DIFF = { Easy: '#00ff9d', Medium: '#ffd600', Hard: '#ff3d6a' };

// ── Minimal markdown (bold, inline code, headers, bullets) ────────
function md(text) {
  if (!text) return null;
  return String(text).split('\n').map((line, i) => {
    if (/^### /.test(line)) return <p key={i} className="font-display text-xs text-cyan mt-3 mb-1 uppercase tracking-wider">{line.slice(4)}</p>;
    if (/^## /.test(line))  return <p key={i} className="font-display text-sm text-cyan mt-3 mb-1">{line.slice(3)}</p>;
    if (/^# /.test(line))   return <p key={i} className="font-display text-base text-cyan mt-2 mb-1">{line.slice(2)}</p>;
    if (/^[-*] /.test(line)) return <div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-cyan/60">▸</span><span className="text-text-secondary text-sm font-body">{inline(line.slice(2))}</span></div>;
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <p key={i} className="text-text-secondary text-sm font-body leading-relaxed">{inline(line)}</p>;
  });
}
function inline(text) {
  const parts = [];
  let rest = text, key = 0;
  const re = /(\*\*(.+?)\*\*|`(.+?)`)/;
  let m;
  while ((m = re.exec(rest))) {
    if (m.index > 0) parts.push(rest.slice(0, m.index));
    if (m[2] !== undefined) parts.push(<strong key={key++} className="text-text-primary font-semibold">{m[2]}</strong>);
    else parts.push(<code key={key++} className="font-code text-2xs bg-surface border border-border rounded px-1 py-0.5 text-amber">{m[3]}</code>);
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) parts.push(rest);
  return parts;
}

function IOBlock({ label, text }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-2xs font-display uppercase tracking-widest text-text-muted mb-1">{label}</div>
      <pre className="font-code text-xs bg-abyss border border-border rounded p-2 whitespace-pre-wrap break-all text-text-secondary">{text || '—'}</pre>
    </div>
  );
}

export default function ProblemSolve() {
  const { slug }  = useParams();
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const problem   = useSelector(selectCurrentProblem);
  const solved    = useSelector(selectCurrentSolved);
  const loading   = useSelector(selectProblemLoading);
  const isAuth    = useSelector(selectIsAuthenticated);

  const [language, setLanguage] = useState('javascript');
  const [code, setCode]         = useState('');
  const [running, setRunning]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab]           = useState('samples'); // samples | result
  const [runResults, setRunResults] = useState(null);
  const [verdict, setVerdict]   = useState(null);
  const loadedKey = useRef('');

  useEffect(() => { dispatch(fetchProblem(slug)); }, [dispatch, slug]);

  // Load code: localStorage draft → starter scaffold → blank
  useEffect(() => {
    if (!problem) return;
    const key = `cs_sol_${slug}_${language}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    const draft = localStorage.getItem(key);
    setCode(draft ?? (problem.starterCode?.[language] || ''));
  }, [problem, slug, language]);

  const onCodeChange = useCallback((val) => {
    setCode(val ?? '');
    localStorage.setItem(`cs_sol_${slug}_${language}`, val ?? '');
  }, [slug, language]);

  const handleRun = useCallback(async () => {
    if (!isAuth) { toast.error('Sign in to run code'); navigate('/login'); return; }
    if (!code.trim()) { toast.error('Write some code first'); return; }
    setRunning(true); setTab('result'); setVerdict(null);
    try {
      const { data } = await api.post(`/problems/${slug}/run`, { language, code }, { timeout: 180000 });
      setRunResults(data.results);
      if (data.passed === data.total) toast.success(`All ${data.total} sample tests passed`);
      else toast(`${data.passed}/${data.total} sample tests passed`, { icon: '🧪' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Run failed');
    } finally { setRunning(false); }
  }, [isAuth, code, slug, language, navigate]);

  const [opening, setOpening] = useState(false);
  const handleOpenInRoom = useCallback(async () => {
    if (!isAuth) { toast.error('Sign in to open a room'); navigate('/login'); return; }
    if (!problem) return;
    setOpening(true);
    // Build a compact problem statement for the room's interview panel.
    const parts = [`# ${problem.title} (${problem.difficulty})`, '', problem.statement];
    if (problem.inputFormat)  parts.push('', '## Input', problem.inputFormat);
    if (problem.outputFormat) parts.push('', '## Output', problem.outputFormat);
    if (problem.constraints)  parts.push('', '## Constraints', problem.constraints);
    (problem.samples || []).slice(0, 2).forEach((s, i) => {
      parts.push('', `## Example ${i + 1}`, `Input: \`${s.input}\``, `Output: \`${s.output}\``);
    });
    const statement = parts.join('\n').slice(0, 4900);
    try {
      const room = await dispatch(createRoom({
        name: `${problem.title} — practice`.slice(0, 80),
        language,
        description: `Collaborative practice: ${problem.title}`,
        interviewMode: true,
        problemStatement: statement,
        tags: (problem.tags || []).slice(0, 5),
      })).unwrap();
      toast.success('Collaborative room created');
      navigate(`/room/${room.roomId}`);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Could not create room');
      setOpening(false);
    }
  }, [isAuth, problem, language, dispatch, navigate]);

  const handleSubmit = useCallback(async () => {
    if (!isAuth) { toast.error('Sign in to submit'); navigate('/login'); return; }
    if (!code.trim()) { toast.error('Write some code first'); return; }
    setSubmitting(true); setTab('result'); setRunResults(null);
    const t = toast.loading('Judging…');
    try {
      const { data } = await api.post(`/problems/${slug}/submit`, { language, code }, { timeout: 180000 });
      setVerdict(data);
      toast.dismiss(t);
      if (data.accepted) {
        toast.success(`Accepted ✓ — passed all ${data.testsTotal} tests`);
        dispatch(markSolved(slug));
        if (data.streak > 1) toast(`🔥 ${data.streak}-day solving streak!`, { duration: 4000 });
      } else {
        const fv = data.results?.find((r) => !r.passed)?.verdict || 'Failed';
        toast.error(`Test #${data.firstFailureIndex} — ${fv}`);
      }
    } catch (err) {
      toast.dismiss(t);
      toast.error(err.response?.data?.error || 'Submission failed');
    } finally { setSubmitting(false); }
  }, [isAuth, code, slug, language, navigate, dispatch]);

  if (loading || !problem) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
          <span className="text-text-secondary font-body text-sm">Loading problem…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-void text-text-primary overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-panel flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/problems" className="text-text-muted hover:text-cyan transition-colors text-sm">← Problems</Link>
          <div className="h-4 w-px bg-border" />
          <span className="font-body text-sm truncate">{problem.title}</span>
          <span className="text-2xs font-display flex-shrink-0" style={{ color: DIFF[problem.difficulty] }}>{problem.difficulty}</span>
          {solved && <span className="badge badge-success text-2xs flex-shrink-0">SOLVED ✓</span>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleOpenInRoom} disabled={opening}
            className="text-xs text-text-muted hover:text-cyan transition-colors disabled:opacity-50 flex items-center gap-1"
            title="Open this problem in a collaborative room">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-3-3h-4m-6 5H2v-2a3 3 0 013-3h4m6-3a3 3 0 11-6 0 3 3 0 016 0zm6-3a2 2 0 11-4 0 2 2 0 014 0zM7 8a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="hidden sm:inline">{opening ? 'Opening…' : 'Solve in Room'}</span>
          </button>
          <Link to="/leaderboard" className="text-text-muted hover:text-cyan transition-colors text-xs hidden sm:inline">Leaderboard</Link>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Statement */}
        <div className="lg:w-[42%] flex-shrink-0 overflow-y-auto custom-scroll border-b lg:border-b-0 lg:border-r border-border p-5 max-lg:max-h-[40vh]">
          <div className="space-y-1">{md(problem.statement)}</div>

          {problem.inputFormat && (<><h3 className="font-display text-xs text-cyan uppercase tracking-wider mt-4 mb-1">Input</h3><div className="space-y-1">{md(problem.inputFormat)}</div></>)}
          {problem.outputFormat && (<><h3 className="font-display text-xs text-cyan uppercase tracking-wider mt-4 mb-1">Output</h3><div className="space-y-1">{md(problem.outputFormat)}</div></>)}
          {problem.constraints && (<><h3 className="font-display text-xs text-cyan uppercase tracking-wider mt-4 mb-1">Constraints</h3><div className="space-y-1">{md(problem.constraints)}</div></>)}

          <h3 className="font-display text-xs text-cyan uppercase tracking-wider mt-5 mb-2">Examples</h3>
          <div className="space-y-3">
            {(problem.samples || []).map((s, i) => (
              <div key={i} className="rounded border border-border bg-surface/30 p-3">
                <div className="text-2xs font-display text-text-muted mb-2">Example {i + 1}</div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <IOBlock label="Input" text={s.input} />
                  <IOBlock label="Output" text={s.output} />
                </div>
                {s.explanation && <p className="text-2xs text-text-muted font-body mt-2">{s.explanation}</p>}
              </div>
            ))}
          </div>

          {(problem.tags || []).length > 0 && (
            <div className="flex gap-1 flex-wrap mt-5">
              {problem.tags.map((t) => <span key={t} className="text-2xs bg-surface border border-border rounded px-1.5 py-0.5 text-text-muted">{t}</span>)}
            </div>
          )}
        </div>

        {/* Editor + actions */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Editor toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              className="input-cyber rounded text-xs py-1 appearance-none">
              {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <button
              onClick={() => { const sc = problem.starterCode?.[language] || ''; setCode(sc); localStorage.setItem(`cs_sol_${slug}_${language}`, sc); }}
              className="text-2xs text-text-muted hover:text-amber transition-colors border border-border rounded px-2 py-1"
              title="Reset to starter code">Reset</button>
            <div className="flex-1" />
            <button onClick={handleRun} disabled={running || submitting}
              className="btn-cyber text-xs py-1.5 px-3 disabled:opacity-50">
              {running ? 'Running…' : 'Run'}
            </button>
            <button onClick={handleSubmit} disabled={running || submitting}
              className="btn-cyber btn-cyber-green text-xs py-1.5 px-4 disabled:opacity-50">
              {submitting ? 'Judging…' : 'Submit'}
            </button>
          </div>

          {/* Editor */}
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={onCodeChange}
              theme="vs-dark"
              options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
            />
          </div>

          {/* Result panel */}
          <div className="flex-shrink-0 border-t border-border bg-panel" style={{ height: '34%', minHeight: '140px' }}>
            <div className="flex items-center border-b border-border">
              {['samples', 'result'].map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-2 text-xs font-display uppercase tracking-wider border-b-2 -mb-px transition-colors
                    ${tab === t ? 'border-cyan text-cyan' : 'border-transparent text-text-muted hover:text-text-secondary'}`}>
                  {t === 'samples' ? 'Samples' : 'Result'}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto custom-scroll p-3" style={{ height: 'calc(100% - 37px)' }}>
              {tab === 'samples' && (
                <div className="space-y-2">
                  {(problem.samples || []).map((s, i) => (
                    <div key={i} className="flex gap-3 text-xs">
                      <IOBlock label={`In #${i + 1}`} text={s.input} />
                      <IOBlock label="Expected" text={s.output} />
                    </div>
                  ))}
                </div>
              )}

              {tab === 'result' && (
                <div className="space-y-2">
                  {/* Submission verdict */}
                  {verdict && (
                    <div className={`rounded border p-3 ${verdict.accepted ? 'border-green/30 bg-green/5' : 'border-red/30 bg-red/5'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-display text-sm ${verdict.accepted ? 'text-green' : 'text-red'}`}>
                          {verdict.accepted ? '✓ Accepted' : '✗ ' + (verdict.results?.find((r) => !r.passed)?.verdict || 'Failed')}
                        </span>
                        <span className="text-2xs font-code text-text-muted ml-auto">
                          {verdict.testsPassed}/{verdict.testsTotal} tests
                        </span>
                      </div>
                      {!verdict.accepted && verdict.firstFailureIndex > 0 && (
                        <p className="text-2xs text-text-muted font-body mt-1">Failed on hidden test #{verdict.firstFailureIndex}.</p>
                      )}
                      {verdict.firstSolve && <p className="text-2xs text-green font-body mt-1">First solve — added to your solved list! 🎉</p>}
                    </div>
                  )}

                  {/* Sample run results */}
                  {runResults && runResults.map((r) => (
                    <div key={r.index} className={`rounded border p-2 ${r.passed ? 'border-green/20' : 'border-red/20'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-2xs font-display ${r.passed ? 'text-green' : 'text-red'}`}>
                          Sample {r.index}: {r.passed ? 'Passed' : r.verdict}
                        </span>
                        <span className="text-2xs font-code text-text-muted ml-auto">{r.timeMs}ms</span>
                      </div>
                      {!r.passed && (
                        <div className="flex gap-3">
                          <IOBlock label="Expected" text={r.expected} />
                          <IOBlock label="Got" text={r.got || r.stderr} />
                        </div>
                      )}
                    </div>
                  ))}

                  {!verdict && !runResults && (
                    <p className="text-text-muted text-xs font-body text-center py-6">Run or submit to see results.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

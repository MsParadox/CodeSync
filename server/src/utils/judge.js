import { runCode } from '../services/executionService.js';

// ── Output comparison ─────────────────────────────────────────────
// Trailing-whitespace and trailing-newline tolerant (standard for
// competitive judges). Returns a canonical form for equality checks.
export function normalizeOutput(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n')
    .replace(/\n+$/g, '');
}

// Map a single run result + expected output to a judge verdict.
export function verdictFor(run, expectedOutput) {
  if (run.status === 'timeout')        return { passed: false, status: 'timeout',       label: 'Time Limit Exceeded' };
  if (run.status === 'oom')            return { passed: false, status: 'oom',           label: 'Memory Limit Exceeded' };
  if (run.status === 'compile_error')  return { passed: false, status: 'compile_error', label: 'Compilation Error' };
  if (run.status === 'runtime_error' || run.exitCode !== 0)
                                       return { passed: false, status: 'runtime_error', label: 'Runtime Error' };
  if (normalizeOutput(run.stdout) === normalizeOutput(expectedOutput))
                                       return { passed: true,  status: 'success',       label: 'Accepted' };
  return { passed: false, status: 'wrong_answer', label: 'Wrong Answer' };
}

/**
 * Run `code` against an ordered list of test cases [{ input, expectedOutput }].
 * Stops at the first failure (a compile error fails everything immediately).
 *
 * Returns:
 *   {
 *     accepted, status, passed, total, firstFailureIndex,
 *     results: [{ index, passed, verdict, timeMs }],
 *     sampleRun   // the first run, for surfacing stdout/stderr
 *   }
 */
export async function judge({ language, code, tests }) {
  if (!tests || tests.length === 0) {
    const run = await runCode({ language, code, stdin: '' });
    return {
      accepted: run.status === 'success',
      status:   run.status,
      passed:   run.status === 'success' ? 1 : 0,
      total:    0,
      firstFailureIndex: -1,
      results:  [],
      sampleRun: run,
    };
  }

  let accepted = true, status = 'success', passed = 0, firstFailureIndex = -1, sampleRun;
  const results = [];
  for (let i = 0; i < tests.length; i++) {
    const run = await runCode({ language, code, stdin: tests[i].input });
    if (i === 0) sampleRun = run;
    const v = verdictFor(run, tests[i].expectedOutput);
    results.push({ index: i + 1, passed: v.passed, verdict: v.label, timeMs: run.executionTimeMs });
    if (v.passed) { passed += 1; continue; }
    accepted = false;
    status = v.status;
    firstFailureIndex = i + 1;
    break;
  }
  return { accepted, status, passed, total: tests.length, firstFailureIndex, results, sampleRun };
}

/**
 * Run against VISIBLE sample tests and return per-sample detail (input,
 * expected, got) — used by the "Run" button so users can debug.
 */
export async function runSamples({ language, code, samples }) {
  const out = [];
  for (let i = 0; i < samples.length; i++) {
    const run = await runCode({ language, code, stdin: samples[i].input });
    const expected = samples[i].output ?? samples[i].expectedOutput ?? '';
    const v = verdictFor(run, expected);
    out.push({
      index: i + 1,
      passed: v.passed,
      verdict: v.label,
      input: samples[i].input,
      expected,
      got: run.stdout || '',
      stderr: run.stderr || '',
      timeMs: run.executionTimeMs,
    });
  }
  return out;
}

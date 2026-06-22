// ════════════════════════════════════════════════════════════════
//  Judge0 execution engine (no Docker, no card, no VM required)
//
//  A drop-in alternative to the Docker sandbox in executionService.js.
//  It submits code to a Judge0 server and maps the response onto the
//  SAME result contract the rest of the app expects:
//
//     runCode({ language, code, stdin }) ->
//       { stdout, stderr, exitCode, executionTimeMs, status, ... }
//
//  Selected via EXEC_ENGINE=judge0. Works against:
//    • the keyless public CE instance (default: https://ce.judge0.com),
//    • a RapidAPI Judge0 endpoint (set JUDGE0_API_KEY + JUDGE0_API_HOST),
//    • or your own self-hosted Judge0 (set JUDGE0_API_URL).
//
//  This lets CodeSync run on card-free PaaS (Render/Koyeb/Vercel) where
//  the Docker socket isn't available — judge.js, the routes, and the
//  frontend are unchanged.
// ════════════════════════════════════════════════════════════════
import { validateCode } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';

const JUDGE0_URL  = (process.env.JUDGE0_API_URL || 'https://ce.judge0.com').replace(/\/$/, '');
const JUDGE0_KEY  = process.env.JUDGE0_API_KEY || '';                 // RapidAPI key (optional)
const JUDGE0_HOST = process.env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com';

const MAX_STDOUT_BYTES  = parseInt(process.env.MAX_STDOUT_BYTES || String(1 * 1024 * 1024));
const MAX_STDERR_BYTES  = parseInt(process.env.MAX_STDERR_BYTES || String(256 * 1024));
const EXECUTION_TIMEOUT = parseInt(process.env.EXECUTION_TIMEOUT_MS || '10000');
const EXEC_MEMORY_KB    = parseInt(process.env.EXEC_MEMORY_MB || '256') * 1024;
const MAX_CONCURRENT    = parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '20');

// ── Our language keys → Judge0 CE language_id ────────────────────
// These IDs are the long-standing Judge0 CE defaults (stable on
// ce.judge0.com). Override per-language with JUDGE0_LANG_<KEY> if your
// instance uses different IDs.
const JUDGE0_LANG = {
  javascript: 63, // Node.js
  typescript: 74, // TypeScript
  python:     71, // Python 3
  cpp:        54, // C++ (GCC)
  java:       62, // Java (OpenJDK)
  go:         60, // Go
  rust:       73, // Rust
};
function languageId(language) {
  const env = process.env[`JUDGE0_LANG_${language.toUpperCase()}`];
  return env ? parseInt(env) : JUDGE0_LANG[language];
}

// Judge0 status ids → our verdict statuses.
//   3 Accepted · 5 TLE · 6 Compilation Error · 7-12,14 Runtime Error · 13 Internal
const OOM_RE = /out of memory|std::bad_alloc|OutOfMemoryError|MemoryError|Cannot allocate memory|\bKilled\b/i;

let activeRequests = 0;

const b64enc = (s) => Buffer.from(s ?? '', 'utf8').toString('base64');
const b64dec = (s) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (JUDGE0_KEY) { h['X-RapidAPI-Key'] = JUDGE0_KEY; h['X-RapidAPI-Host'] = JUDGE0_HOST; }
  return h;
}

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    return { ok: res.ok, status: res.status, body };
  } finally { clearTimeout(t); }
}

function capBytes(str, max) {
  if (!str) return { text: str || '', truncated: false };
  if (Buffer.byteLength(str, 'utf8') <= max) return { text: str, truncated: false };
  return { text: Buffer.from(str, 'utf8').slice(0, max).toString('utf8'), truncated: true };
}

export async function runCode({ language, code, stdin = '' }) {
  const validation = validateCode(code);
  if (!validation.valid) {
    return { stdout: '', stderr: validation.reason, exitCode: 1, executionTimeMs: 0, status: 'error' };
  }

  const langId = languageId(language);
  if (!langId) {
    return { stdout: '', stderr: `Unsupported language: ${language}`, exitCode: 1, executionTimeMs: 0, status: 'error' };
  }

  if (activeRequests >= MAX_CONCURRENT) {
    return { stdout: '', stderr: 'Server busy — please retry in a few seconds.', exitCode: 1, executionTimeMs: 0, status: 'error' };
  }

  const payload = {
    source_code: b64enc(code),
    language_id: langId,
    stdin: b64enc(stdin || ''),
    cpu_time_limit: Math.max(1, Math.ceil(EXECUTION_TIMEOUT / 1000)), // seconds
    wall_time_limit: Math.max(2, Math.ceil(EXECUTION_TIMEOUT / 1000) + 2),
    memory_limit: EXEC_MEMORY_KB,
  };

  activeRequests++;
  const startTime = Date.now();
  try {
    // Prefer synchronous mode (wait=true). If the instance refuses it,
    // fall back to create-then-poll.
    let { ok, status: httpStatus, body } = await fetchJSON(
      `${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`,
      { method: 'POST', headers: headers(), body: JSON.stringify(payload) },
      EXECUTION_TIMEOUT + 20000,
    );

    if (!ok && httpStatus !== 201) {
      const msg = body?.message || body?.error || body?.raw || `Judge0 error (HTTP ${httpStatus})`;
      if (httpStatus === 429) {
        return { stdout: '', stderr: 'Execution service is rate-limited — retry shortly.', exitCode: 1, executionTimeMs: Date.now() - startTime, status: 'error' };
      }
      logger.warn(`Judge0 submit failed (${httpStatus}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      return { stdout: '', stderr: `Execution engine error: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, exitCode: 1, executionTimeMs: Date.now() - startTime, status: 'error' };
    }

    // Poll fallback: we only got a token (status In Queue/Processing or 201).
    if (!body?.status || body.status.id <= 2) {
      const token = body?.token;
      if (!token) {
        return { stdout: '', stderr: 'Execution engine returned no result token.', exitCode: 1, executionTimeMs: Date.now() - startTime, status: 'error' };
      }
      const deadline = Date.now() + EXECUTION_TIMEOUT + 20000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 700));
        const poll = await fetchJSON(`${JUDGE0_URL}/submissions/${token}?base64_encoded=true`, { headers: headers() }, 15000);
        if (poll.ok && poll.body?.status && poll.body.status.id > 2) { body = poll.body; break; }
      }
      if (!body?.status || body.status.id <= 2) {
        return { stdout: '', stderr: 'Execution timed out waiting for the judge.', exitCode: 124, executionTimeMs: Date.now() - startTime, status: 'timeout' };
      }
    }

    const executionTimeMs = body.time != null ? Math.round(parseFloat(body.time) * 1000) : (Date.now() - startTime);
    const statusId = body.status?.id;

    // ── Compilation error ─────────────────────────────────────────
    if (statusId === 6) {
      const { text, truncated } = capBytes(b64dec(body.compile_output) || 'Compilation failed.', MAX_STDERR_BYTES);
      return { stdout: '', stderr: text, exitCode: 1, executionTimeMs, stderrTruncated: truncated, status: 'compile_error' };
    }

    const out = capBytes(b64dec(body.stdout), MAX_STDOUT_BYTES);
    // Runtime errors may carry detail in stderr or the generic `message`.
    const rawErr = b64dec(body.stderr) || b64dec(body.message) || '';
    const err = capBytes(rawErr, MAX_STDERR_BYTES);
    const exitCode = body.exit_code != null ? body.exit_code : (statusId === 3 ? 0 : 1);

    let status;
    if (statusId === 3)      status = 'success';
    else if (statusId === 5) status = 'timeout';
    else if (OOM_RE.test(err.text)) status = 'oom';
    else if (statusId === 13) status = 'error';
    else status = 'runtime_error'; // 4,7,8,9,10,11,12,14

    if (status === 'timeout' && !err.text) {
      err.text = `Timed out after ${EXECUTION_TIMEOUT / 1000}s — infinite loop or slow operation detected.`;
    }

    const finalStdout = out.truncated ? out.text + `\n\n[stdout truncated at ${MAX_STDOUT_BYTES / 1024}KB limit]` : out.text;
    const finalStderr = err.truncated ? err.text + `\n\n[stderr truncated at ${MAX_STDERR_BYTES / 1024}KB limit]` : err.text;

    return {
      stdout: finalStdout,
      stderr: finalStderr,
      exitCode,
      executionTimeMs,
      stdoutTruncated: out.truncated,
      stderrTruncated: err.truncated,
      status,
    };
  } catch (err) {
    const executionTimeMs = Date.now() - startTime;
    if (err.name === 'AbortError') {
      return { stdout: '', stderr: 'Execution engine timed out (no response from Judge0).', exitCode: 124, executionTimeMs, status: 'timeout' };
    }
    logger.error(`Judge0 request error (${language}): ${err.message}`);
    return { stdout: '', stderr: `Execution engine unavailable: ${err.message}`, exitCode: 1, executionTimeMs, status: 'error' };
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
  }
}

// Nothing to pre-pull — execution is remote. Log the target for clarity.
export async function prewarmImages() {
  logger.info(`Execution engine: Judge0 (${JUDGE0_URL}${JUDGE0_KEY ? ', authenticated' : ', keyless'})`);
}

export function getActiveContainerCount() { return activeRequests; }

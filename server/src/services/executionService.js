import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { truncateOutput, validateCode } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';
import * as judge0 from './judge0Service.js';

// ── Engine selection ──────────────────────────────────────────────
// EXEC_ENGINE selects HOW user code runs (the only Docker/VM-bound part):
//   docker (default) → self-hosted Docker sandbox below; needs a VM.
//   judge0           → remote Judge0 API (keyless public CE, RapidAPI key,
//                      or self-hosted). No Docker/VM → deploys on card-free
//                      PaaS (Render/Koyeb/Vercel).
// The choice only swaps the implementation behind the exported runCode /
// prewarmImages / getActiveContainerCount — judge.js, the routes, and the
// frontend are unchanged.
const EXEC_ENGINE = (process.env.EXEC_ENGINE || 'docker').toLowerCase();

const docker = new Docker(
  process.env.DOCKER_SOCKET ? { socketPath: process.env.DOCKER_SOCKET } : {}
);

// ── Code upload via tar (NOT bind mounts) ─────────────────────────
// The server frequently runs INSIDE a container, talking to the host
// Docker daemon through the mounted /var/run/docker.sock. A bind mount
// like `/tmp/exec-xxx:/code` is resolved by the HOST daemon against the
// HOST filesystem — but the file was written inside the SERVER container,
// so /code/main.cpp ends up empty ("no such file or directory").
//
// Uploading the source as a tar stream with container.putArchive() copies
// the bytes directly into the target container's filesystem and works
// identically whether the server is containerized or running bare-metal.
function buildTar(entries) {
  const blocks = [];
  for (const e of entries) {
    const isDir = e.type === 'dir';
    const content = isDir ? Buffer.alloc(0)
      : (Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content, 'utf8'));
    const header = Buffer.alloc(512, 0);
    header.write(e.name, 0, 100, 'utf8');                                       // name
    header.write(((e.mode ?? 0o644) & 0o7777).toString(8).padStart(7, '0') + '\0', 100, 8); // mode
    header.write('0000000\0', 108, 8);                                          // uid (root)
    header.write('0000000\0', 116, 8);                                          // gid (root)
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 12); // size
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12); // mtime
    header.write('        ', 148, 8);                                           // checksum placeholder
    header.write(isDir ? '5' : '0', 156, 1);                                    // typeflag: 5 = dir, 0 = file
    header.write('ustar\0', 257, 6);                                            // magic
    header.write('00', 263, 2);                                                 // version
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);             // real checksum
    blocks.push(header);
    if (!isDir) {
      blocks.push(content);
      const pad = (512 - (content.length % 512)) % 512;
      if (pad) blocks.push(Buffer.alloc(pad, 0));
    }
  }
  blocks.push(Buffer.alloc(1024, 0)); // two zero blocks terminate the archive
  return Buffer.concat(blocks);
}

async function uploadCode(container, filename, code, stdin) {
  // Extracting at '/' creates a world-traversable /code dir then the
  // source file, so the unprivileged runtime user (uid 1000) can read it.
  const entries = [
    { name: 'code/',            type: 'dir', mode: 0o777 },
    { name: `code/${filename}`, content: code, mode: 0o644 },
  ];
  // Program input is delivered as a file the run command redirects from
  // (`< /code/.stdin`). This is far more reliable than attaching to the
  // container's stdin after start (which races the program's first read)
  // and makes interactive programs — input()/scanf/cin/Scanner — work.
  if (stdin) entries.push({ name: 'code/.stdin', content: stdin, mode: 0o644 });
  const tar = buildTar(entries);
  await container.putArchive(Readable.from([tar]), { path: '/' });
}

// ── Language configurations ──────────────────────────────────────
// TypeScript uses a pre-built custom image with tsx installed.
// Containers run with NetworkMode:'none', so npx --yes tsx would fail
// (can't reach npm registry). The codesync-ts image bakes tsx in at
// build time from docker/typescript/Dockerfile.
const LANGUAGE_CONFIG = {
  javascript: {
    image:    'node:20-alpine',
    filename: 'main.js',
    run:      'node /code/main.js',
  },
  typescript: {
    image:    'codesync-ts:latest',
    filename: 'main.ts',
    run:      'tsx /code/main.ts',
  },
  python: {
    image:    'python:3.12-alpine',
    filename: 'main.py',
    run:      'python /code/main.py',
  },
  // Compiled languages write their binaries to /build (a tmpfs mounted
  // WITHOUT noexec) — /tmp is noexec, so executing /tmp/main would fail
  // with "Permission denied".
  cpp: {
    image:    'gcc:13',
    filename: 'main.cpp',
    compile:  'g++ -O2 -std=c++17 -o /build/main /code/main.cpp',
    run:      '/build/main',
  },
  java: {
    // The official `openjdk` Docker Hub repo is deprecated and its tags
    // were removed (openjdk:21-slim now 404s). Eclipse Temurin is the
    // maintained, drop-in replacement and bundles javac.
    image:    'eclipse-temurin:21-jdk',
    filename: 'Main.java',
    compile:  'javac /code/Main.java -d /build',
    run:      'java -cp /build Main',
  },
  go: {
    image:    'golang:1.22-alpine',
    filename: 'main.go',
    // Go 1.16+ is module-aware by default: `go run main.go` without a
    // go.mod fails with "cannot find main module". Initialise a throwaway
    // module first. GOCACHE/TMPDIR point at the exec-able /build tmpfs.
    run:      'go mod init solution >/dev/null 2>&1; go run main.go',
  },
  rust: {
    image:    'rust:1.78-slim',
    filename: 'main.rs',
    compile:  'rustc -o /build/main /code/main.rs',
    run:      '/build/main',
  },
};

// ── Output limits ─────────────────────────────────────────────────
// These enforce hard caps INSIDE the stream reader to prevent a
// runaway `print("A" * 10_000_000)` from exhausting server memory
// or flooding the client's WebSocket connection.
const MAX_STDOUT_BYTES = parseInt(process.env.MAX_STDOUT_BYTES  || String(1  * 1024 * 1024)); // 1 MB
const MAX_STDERR_BYTES = parseInt(process.env.MAX_STDERR_BYTES  || String(256 * 1024));        // 256 KB

// Per-container memory cap. 128MB is too small for the JVM (javac/java)
// and rustc to compile even trivial programs without being OOM-killed, so
// the default is 256MB. Tune with EXEC_MEMORY_MB on memory-constrained hosts.
const EXEC_MEMORY_BYTES = parseInt(process.env.EXEC_MEMORY_MB || '256') * 1024 * 1024;

let activeContainers = 0;
const MAX_CONCURRENT    = parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '20');
const EXECUTION_TIMEOUT = parseInt(process.env.EXECUTION_TIMEOUT_MS      || '10000');

// ── Image availability ────────────────────────────────────────────
// Containers run with NetworkMode:'none', so the image MUST already be
// present locally at run time. The first execution of a language whose
// image has never been pulled used to fail with:
//   (HTTP code 404) no such container - No such image: gcc:13
// ensureImage() inspects the image and pulls it once if missing, caching
// the in-flight pull so concurrent requests for the same image share it.
const imagePulls = new Map(); // image -> Promise

function pullImage(image) {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (e) => (e ? reject(e) : resolve()));
    });
  });
}

// ── Result classification ─────────────────────────────────────────
// Maps raw exit codes + stderr signatures to meaningful judge-style
// statuses so the UI can show "Compilation Error", "Runtime Error",
// "Time Limit Exceeded", "Memory Limit Exceeded", etc.
const COMPILE_ERROR_RE = /\berror:|error\[E\d+\]|cannot find symbol|compilation (failed|terminated)|undefined reference|expected .* before|fatal error:|\bSyntaxError\b|\bIndentationError\b|cannot find module|is not defined at compile/i;
const OOM_RE = /out of memory|std::bad_alloc|OutOfMemoryError|MemoryError|Cannot allocate memory|\bKilled\b|signal: killed/i;

function classifyStatus({ exitCode, stderr = '', isCompiled }) {
  if (exitCode === 0) return 'success';
  // 137 = 128 + SIGKILL(9) — almost always the cgroup OOM killer here
  if (exitCode === 137 || OOM_RE.test(stderr)) return 'oom';
  if (isCompiled && COMPILE_ERROR_RE.test(stderr)) return 'compile_error';
  return 'runtime_error';
}

async function ensureImage(image) {
  // Already present locally?
  try {
    await docker.getImage(image).inspect();
    return;
  } catch (_) { /* not present — fall through to pull */ }

  // Deduplicate concurrent pulls of the same image
  if (!imagePulls.has(image)) {
    logger.info(`Pulling missing execution image: ${image}…`);
    const p = pullImage(image)
      .then(() => logger.info(`  ✅ Pulled ${image}`))
      .catch((err) => { logger.error(`  ⚠️  Pull failed for ${image}: ${err.message}`); throw err; })
      .finally(() => imagePulls.delete(image));
    imagePulls.set(image, p);
  }
  await imagePulls.get(image);
}

async function runCodeDocker({ language, code, stdin = '' }) {
  const validation = validateCode(code);
  if (!validation.valid) {
    return { stdout: '', stderr: validation.reason, exitCode: 1, executionTimeMs: 0, status: 'error' };
  }

  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    return { stdout: '', stderr: `Unsupported language: ${language}`, exitCode: 1, executionTimeMs: 0, status: 'error' };
  }

  if (activeContainers >= MAX_CONCURRENT) {
    return { stdout: '', stderr: 'Server busy — please retry in a few seconds.', exitCode: 1, executionTimeMs: 0, status: 'error' };
  }

  const execId  = uuidv4();
  let container = null;
  activeContainers++;

  try {
    // Redirect program input from an uploaded file when stdin is provided.
    const runCmd = stdin ? `${config.run} < /code/.stdin` : config.run;
    const command = config.compile
      ? `${config.compile} && ${runCmd}`
      : runCmd;

    // Make sure the language image exists locally (pull once if missing).
    // codesync-ts is built locally and not in any registry, so if it's
    // absent we surface a clear, actionable message instead of a 404.
    try {
      await ensureImage(config.image);
    } catch (pullErr) {
      const hint = config.image.startsWith('codesync-')
        ? `Build it first:  docker compose build ts-builder`
        : `Could not pull ${config.image}: ${pullErr.message}`;
      return {
        stdout: '', stderr: `Execution image "${config.image}" is unavailable. ${hint}`,
        exitCode: 1, executionTimeMs: 0, status: 'error',
      };
    }

    const startTime = Date.now();

    // AutoRemove:false so we can call container.wait() atomically
    // (AutoRemove:true creates a race between exit and removal)
    container = await docker.createContainer({
      Image: config.image,
      Cmd:   ['sh', '-c', command],
      HostConfig: {
        Memory:         EXEC_MEMORY_BYTES,  // RAM cap (default 256 MB)
        MemorySwap:     EXEC_MEMORY_BYTES,  // == Memory ⇒ swap disabled
        CpuPeriod:      100000,
        CpuQuota:       50000,              // 50% of one CPU
        NetworkMode:    'none',             // no outbound network
        AutoRemove:     false,
        // Source is uploaded via putArchive (see uploadCode) instead of a
        // bind mount, so it works when the server itself runs in Docker.
        Tmpfs:          {
          '/tmp':   'rw,noexec,nosuid,size=64m',
          // `exec` is REQUIRED: Docker tmpfs mounts default to noexec, which
          // makes compiled binaries (cpp/rust) and `go run`'s temp binary
          // fail with "Permission denied" (exit 126). /build is where all
          // compiled output + toolchain caches live, so it must allow exec.
          '/build': 'rw,exec,nosuid,size=128m,mode=1777',
        },
        SecurityOpt:    ['no-new-privileges:true'],
        PidsLimit:      64,                 // prevent fork bombs
        ReadonlyRootfs: false,
      },
      Env: [
        'HOME=/build',
        'TMPDIR=/build',
        'GOCACHE=/build/.cache/go-build',
        'GOPATH=/build/go',
        'XDG_CACHE_HOME=/build/.cache',
      ],
      User:        '1000',
      WorkingDir:  '/code',
      AttachStdout: true,
      AttachStderr: true,
      Tty:          false,
    });

    // Copy the source (and optional stdin file) into the container.
    await uploadCode(container, config.filename, code, stdin);

    await container.start();

    // Race output capture against execution timeout
    const { stdout, stderr, exitCode, stdoutTruncated, stderrTruncated } =
      await Promise.race([
        captureOutputAndWait(container),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), EXECUTION_TIMEOUT)
        ),
      ]);

    const executionTimeMs = Date.now() - startTime;

    // Append truncation notice inside the output itself so the client
    // always knows why output stopped, without a separate field.
    const finalStdout = stdoutTruncated
      ? stdout + `\n\n[stdout truncated at ${MAX_STDOUT_BYTES / 1024}KB limit]`
      : stdout;
    const finalStderr = stderrTruncated
      ? stderr + `\n\n[stderr truncated at ${MAX_STDERR_BYTES / 1024}KB limit]`
      : stderr;

    return {
      stdout:          finalStdout,
      stderr:          finalStderr,
      exitCode,
      executionTimeMs,
      stdoutTruncated,
      stderrTruncated,
      status: classifyStatus({ exitCode, stderr: finalStderr, isCompiled: !!config.compile }),
    };

  } catch (err) {
    if (err.message === 'TIMEOUT') {
      try { if (container) await container.kill().catch(() => {}); } catch (_) {}
      logger.warn(`Execution timeout for ${language} (${execId})`);
      return {
        stdout: '',
        stderr: `Timed out after ${EXECUTION_TIMEOUT / 1000}s — infinite loop or slow operation detected.`,
        exitCode: 124,
        executionTimeMs: EXECUTION_TIMEOUT,
        status: 'timeout',
      };
    }

    if (err.code === 'ENOENT' || err.code === 'EACCES' || err.message?.includes('connect')) {
      logger.error('Docker unavailable:', err.message);
      return {
        stdout: '',
        stderr: 'Execution engine unavailable — ensure Docker is running.',
        exitCode: 1, executionTimeMs: 0, status: 'error',
      };
    }

    logger.error(`Execution error (${language}):`, err.message);
    return { stdout: '', stderr: `Execution failed: ${err.message}`, exitCode: 1, executionTimeMs: 0, status: 'error' };

  } finally {
    activeContainers = Math.max(0, activeContainers - 1);
    // Source lives inside the container's own filesystem now, so removing
    // the container is the only cleanup needed.
    if (container) container.remove({ force: true }).catch(() => {});
  }
}

/**
 * Collect stdout/stderr from the container while enforcing hard byte caps.
 *
 * Why byte caps here (not just truncateOutput later)?
 * - Without them, a `print("A" * 50_000_000)` buffers 50MB in this
 *   process before we can truncate, causing memory pressure.
 * - By capping inside the write handler we stop accumulating early,
 *   keeping peak memory near MAX_STDOUT_BYTES regardless of code output.
 */
async function captureOutputAndWait(container) {
  let stdout = '';
  let stderr = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutTruncated = false;
  let stderrTruncated = false;

  const outputPromise = new Promise((resolve, reject) => {
    container.logs(
      { stdout: true, stderr: true, follow: true },
      (err, stream) => {
        if (err) return reject(err);

        container.modem.demuxStream(
          stream,
          {
            write: (chunk) => {
              if (stdoutTruncated) return;
              const text = chunk.toString();
              stdoutBytes += Buffer.byteLength(text, 'utf8');
              if (stdoutBytes > MAX_STDOUT_BYTES) {
                // Only add up to the limit
                const remaining = MAX_STDOUT_BYTES - (stdoutBytes - Buffer.byteLength(text, 'utf8'));
                if (remaining > 0) stdout += text.slice(0, remaining);
                stdoutTruncated = true;
              } else {
                stdout += text;
              }
            },
          },
          {
            write: (chunk) => {
              if (stderrTruncated) return;
              const text = chunk.toString();
              stderrBytes += Buffer.byteLength(text, 'utf8');
              if (stderrBytes > MAX_STDERR_BYTES) {
                const remaining = MAX_STDERR_BYTES - (stderrBytes - Buffer.byteLength(text, 'utf8'));
                if (remaining > 0) stderr += text.slice(0, remaining);
                stderrTruncated = true;
              } else {
                stderr += text;
              }
            },
          }
        );
        stream.on('end',   () => resolve());
        stream.on('error', reject);
      }
    );
  });

  // container.wait() is atomic: returns {StatusCode} when main process exits
  const [, waitResult] = await Promise.all([outputPromise, container.wait()]);
  const exitCode = waitResult?.StatusCode ?? 0;

  return { stdout, stderr, exitCode, stdoutTruncated, stderrTruncated };
}

async function prewarmImagesDocker() {
  const images = [...new Set(Object.values(LANGUAGE_CONFIG).map((c) => c.image))];
  logger.info('Pre-warming Docker images...');
  for (const image of images) {
    try {
      await new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve());
        });
      });
      logger.info(`  ✅ ${image}`);
    } catch (err) {
      logger.warn(`  ⚠️  Could not pull ${image}: ${err.message}`);
    }
  }
}

function getActiveContainerCountDocker() { return activeContainers; }

// ── Public engine-dispatched API ──────────────────────────────────
// All callers (judge.js, execute/room routes) import these names; the
// EXEC_ENGINE env var decides which implementation backs them.
const ENGINES = {
  docker: { runCode: runCodeDocker, prewarmImages: prewarmImagesDocker, getActiveContainerCount: getActiveContainerCountDocker },
  judge0: judge0,
};
const engine = ENGINES[EXEC_ENGINE] || ENGINES.docker;
logger.info(`Code execution engine: ${ENGINES[EXEC_ENGINE] ? EXEC_ENGINE : `docker (unknown EXEC_ENGINE="${EXEC_ENGINE}", defaulting)`}`);

export const runCode                 = engine.runCode;
export const prewarmImages           = engine.prewarmImages;
export const getActiveContainerCount = engine.getActiveContainerCount;

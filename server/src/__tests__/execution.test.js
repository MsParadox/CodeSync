/**
 * Execution endpoint tests — Docker and MongoDB fully mocked.
 * Covers: auth guard, input validation, all 7 languages, history, stats,
 *         timeout, large output, container failure, and output limits.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../config/redis.js', () => ({
  redisClient: {
    incr: jest.fn(async () => 1), expire: jest.fn(async () => {}),
    ttl: jest.fn(async () => 55),
  },
  pubClient: {}, subClient: {}, connectRedis: jest.fn(),
}));

// ── Mock Docker execution engine ───────────────────────────────────
// We expose a mockRunCode reference so individual tests can override it.
let mockRunCode = jest.fn(async ({ language }) => ({
  stdout: `Mock output for ${language}`,
  stderr: '', exitCode: 0, executionTimeMs: 42, status: 'success',
  stdoutTruncated: false, stderrTruncated: false,
}));

jest.unstable_mockModule('../services/executionService.js', () => ({
  runCode: (...args) => mockRunCode(...args),
  getActiveContainerCount: jest.fn(() => 3),
  prewarmImages: jest.fn(async () => {}),
}));

const bcryptMod = await import('bcryptjs');
const bcrypt    = bcryptMod.default ?? bcryptMod;

const db = { users: new Map(), uid: 1, execs: [] };

function makeObjectId(n) { return String(n).padStart(24, '0'); }

const chain = (val) => ({
  select: () => chain(val), lean: () => Promise.resolve(val),
  populate: () => chain(val), sort: () => chain(val),
  limit: () => chain(val), skip: () => chain(val),
  then: (r, j) => Promise.resolve(val).then(r, j),
});

jest.unstable_mockModule('../models/User.js', () => ({
  User: {
    findOne: jest.fn(async ({ $or, email } = {}) => {
      if ($or) {
        for (const c of $or) {
          const [k, v] = Object.entries(c)[0];
          for (const u of db.users.values()) if (u[k] === v) return u;
        }
        return null;
      }
      return email ? db.users.get(email.toLowerCase()) ?? null : null;
    }),
    findById: jest.fn((id) => {
      let u = null;
      for (const x of db.users.values()) if (x._id === String(id)) { u = x; break; }
      return chain(u);
    }),
    create: jest.fn(async (data) => {
      const hash = await bcrypt.hash(data.passwordHash, 1);
      const u = {
        _id: makeObjectId(db.uid++), ...data, email: data.email.toLowerCase(),
        passwordHash: hash, isActive: true, lastLogin: new Date(),
        stats: { languageCounts: {}, totalExecutions: 0, totalRuntime: 0 },
        async save() { db.users.set(this.email, this); return this; },
        async comparePassword(p) { return bcrypt.compare(p, this.passwordHash); },
        async recordExecution() { this.stats.totalExecutions++; await this.save(); },
        toJSON() { return { _id: this._id, username: this.username, stats: this.stats }; },
        constructor: { findByIdAndUpdate: jest.fn(async () => {}) },
      };
      db.users.set(u.email, u);
      return u;
    }),
    findByIdAndUpdate: jest.fn(async () => {}),
  },
}));

jest.unstable_mockModule('../models/Room.js', () => ({
  Room: jest.fn(function(d) { Object.assign(this, d); }),
}));

jest.unstable_mockModule('../models/Snapshot.js', () => ({
  Snapshot: { find: jest.fn(() => chain([])) },
  Execution: {
    find: jest.fn(() => chain(db.execs)),
    countDocuments: jest.fn(async () => db.execs.length),
    aggregate: jest.fn(async () => [{
      _id: null,
      total: db.execs.length,
      avgTime: 42,
      successCount: db.execs.length,
    }]),
    create: jest.fn(async (d) => {
      const ex = { _id: `ex${db.execs.length + 1}`, ...d };
      db.execs.push(ex);
      return ex;
    }),
  },
}));

const { default: request } = await import('supertest');
const { app }              = await import('../app.js');

async function getToken(suffix = '') {
  const res = await request(app).post('/api/auth/register')
    .send({ username: `execuser${suffix}`, email: `exec${suffix}@t.com`, password: 'execpassword' });
  return res.body.accessToken;
}

beforeEach(() => {
  db.users.clear();
  db.execs.length = 0;
  db.uid = 1;
  // Reset mock to default success implementation
  mockRunCode = jest.fn(async ({ language }) => ({
    stdout: `Mock output for ${language}`,
    stderr: '', exitCode: 0, executionTimeMs: 42, status: 'success',
    stdoutTruncated: false, stderrTruncated: false,
  }));
});

const VALID_LANGS = ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];

// ─────────────────────────────────────────────────────────────────
describe('POST /api/execute — happy path', () => {
  it('200 — returns required fields', async () => {
    const token = await getToken('a');
    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'javascript', code: 'console.log("hi")' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stdout');
    expect(res.body).toHaveProperty('exitCode');
    expect(res.body).toHaveProperty('executionTimeMs');
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('executionId');
  });

  it.each(VALID_LANGS)('200 — language %s is accepted', async (language) => {
    const suffix = language.replace(/[^a-z]/g, '');
    const token = await getToken(suffix);
    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language, code: '// test' });
    expect(res.status).toBe(200);
    expect(res.body.stdout).toContain(language);
  });

  it('accepts optional stdin field', async () => {
    const token = await getToken('stdin');
    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'python', code: 'print(input())', stdin: 'hello' });
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('POST /api/execute — validation', () => {
  it('401 — unauthenticated', async () => {
    const res = await request(app).post('/api/execute')
      .send({ language: 'python', code: 'print(1)' });
    expect(res.status).toBe(401);
  });

  it('400 — unsupported language', async () => {
    const token = await getToken('v');
    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'cobol', code: 'DISPLAY "hi"' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/language/i);
  });

  it('400 — missing code field', async () => {
    const token = await getToken('w');
    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'python' });
    expect(res.status).toBe(400);
  });

  it('400 — missing language field', async () => {
    const token = await getToken('x');
    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'print(1)' });
    expect(res.status).toBe(400);
  });

  it('400 — code exceeds 100 KB', async () => {
    const token = await getToken('y');
    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'javascript', code: 'x'.repeat(100001) });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('POST /api/execute — edge cases (timeout, large output, failure)', () => {

  it('returns timeout status when execution times out', async () => {
    const token = await getToken('timeout');
    mockRunCode = jest.fn(async () => ({
      stdout: '',
      stderr: 'Timed out after 10s — infinite loop or slow operation detected.',
      exitCode: 124,
      executionTimeMs: 10000,
      status: 'timeout',
      stdoutTruncated: false,
      stderrTruncated: false,
    }));

    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'python', code: 'while True: pass' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('timeout');
    expect(res.body.exitCode).toBe(124);
    expect(res.body.stderr).toMatch(/timed out/i);
  });

  it('returns error status when exit code is non-zero', async () => {
    const token = await getToken('err');
    mockRunCode = jest.fn(async () => ({
      stdout: '',
      stderr: 'SyntaxError: Unexpected token',
      exitCode: 1,
      executionTimeMs: 50,
      status: 'error',
      stdoutTruncated: false,
      stderrTruncated: false,
    }));

    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'javascript', code: 'const =' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.exitCode).not.toBe(0);
  });

  it('returns stdoutTruncated=true when output hits byte limit', async () => {
    const token = await getToken('bigout');
    const hugeOutput = 'A'.repeat(1024 * 1024); // 1MB
    mockRunCode = jest.fn(async () => ({
      stdout: hugeOutput,
      stderr: '',
      exitCode: 0,
      executionTimeMs: 200,
      status: 'success',
      stdoutTruncated: true,
      stderrTruncated: false,
    }));

    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'python', code: 'print("A" * 10_000_000)' });

    expect(res.status).toBe(200);
    expect(res.body.stdoutTruncated).toBe(true);
    expect(res.body.stdout.length).toBe(hugeOutput.length);
  });

  it('reports container failure gracefully', async () => {
    const token = await getToken('crash');
    mockRunCode = jest.fn(async () => ({
      stdout: '',
      stderr: 'Execution engine unavailable — ensure Docker is running.',
      exitCode: 1,
      executionTimeMs: 0,
      status: 'error',
      stdoutTruncated: false,
      stderrTruncated: false,
    }));

    const res = await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'go', code: 'package main; func main() {}' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.stderr).toMatch(/unavailable/i);
  });

  it('execution is stored in history', async () => {
    const token = await getToken('hist');
    await request(app).post('/api/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'go', code: 'fmt.Println("x")' });

    const res = await request(app).get('/api/execute/history')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.executions)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('GET /api/execute/history', () => {
  it('401 — unauthenticated', async () => {
    expect((await request(app).get('/api/execute/history')).status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('GET /api/execute/stats', () => {
  it('200 — returns user, global, activeContainers', async () => {
    const token = await getToken('stats');
    const res = await request(app).get('/api/execute/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('global');
    expect(res.body).toHaveProperty('activeContainers');
    expect(res.body.activeContainers).toBe(3);
  });
});

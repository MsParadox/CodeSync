/**
 * Auth endpoint unit tests — no MongoDB required.
 * Uses an in-memory user store backed by plain JS Maps.
 */
import { jest } from '@jest/globals';

// ── Redis mock ───────────────────────────────────────────────────
jest.unstable_mockModule('../config/redis.js', () => ({
  redisClient: { incr: jest.fn(async () => 1), expire: jest.fn(async () => {}) },
  pubClient:   {},
  subClient:   {},
  connectRedis: jest.fn(),
}));

// ── Shared in-memory store used by both mock and test helpers ────
const store = { users: new Map(), id: 1 };

// ── bcrypt shim: CJS module — must use .default in ESM dynamic import ──
const bcryptMod = await import('bcryptjs');
const bcrypt    = bcryptMod.default ?? bcryptMod;   // handles both ESM + CJS

function makeUser(data) {
  const id   = String(store.id++);
  const user = {
    _id:      id,
    username: data.username,
    email:    (data.email || '').toLowerCase(),
    passwordHash: data.passwordHash,
    isActive: true,
    lastLogin: new Date(),
    stats:    { languageCounts: {} },
    constructor: { findByIdAndUpdate: jest.fn(async () => {}) },
    async save() { store.users.set(this.email, this); return this; },
    async comparePassword(plain) { return bcrypt.compare(plain, this.passwordHash); },
    toJSON() {
      return { _id: this._id, username: this.username, email: this.email,
               isActive: this.isActive, stats: this.stats };
    },
  };
  return user;
}

// ── User model mock ──────────────────────────────────────────────
jest.unstable_mockModule('../models/User.js', () => ({
  User: {
    findOne: jest.fn(async (query = {}) => {
      const { $or, email } = query;
      if ($or) {
        for (const cond of $or) {
          const [k, v] = Object.entries(cond)[0];
          for (const u of store.users.values()) {
            if (u[k] === v) return u;
          }
        }
        return null;
      }
      return email ? store.users.get(email.toLowerCase()) ?? null : null;
    }),
    // Returns a thenable + chainable query shim: supports .select().lean()
    findById: jest.fn((id) => {
      let result = null;
      for (const u of store.users.values()) {
        if (u._id === String(id)) { result = u; break; }
      }
      const chain = {
        select: () => chain,
        lean:   () => Promise.resolve(result),
        then:   (res, rej) => Promise.resolve(result).then(res, rej),
      };
      return chain;
    }),
    create: jest.fn(async (data) => {
      const hash = await bcrypt.hash(data.passwordHash, 1);
      const user = makeUser({ ...data, passwordHash: hash });
      store.users.set(user.email, user);
      return user;
    }),
    findByIdAndUpdate: jest.fn(async () => {}),
  },
}));

// ── Room / Snapshot mocks (imported transitively via routes) ─────
jest.unstable_mockModule('../models/Room.js', () => ({
  Room: {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    findOneAndUpdate: jest.fn(async () => {}),
    countDocuments: jest.fn(async () => 0),
    create: jest.fn(async (d) => ({ ...d, roomId: 'room-uuid', toJSON: () => d })),
  },
}));

jest.unstable_mockModule('../models/Snapshot.js', () => ({
  Snapshot: { find: jest.fn(async () => []) },
  Execution: {
    find: jest.fn(async () => []),
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
    create: jest.fn(async (d) => ({ _id: 'exec1', ...d })),
  },
}));

// ── Dynamic imports AFTER all mocks are registered ───────────────
const { default: request } = await import('supertest');
const { app }              = await import('../app.js');

// Reset store between tests
beforeEach(() => { store.users.clear(); store.id = 1; });

// ── Helper ───────────────────────────────────────────────────────
const REG = { username: 'alice', email: 'alice@test.com', password: 'password123' };
const reg = (o = {}) => request(app).post('/api/auth/register').send({ ...REG, ...o });

// ─────────────────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  it('201 + tokens + sanitised user on valid payload', async () => {
    const res = await reg();
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('409 on duplicate email', async () => {
    await reg();
    const res = await reg({ username: 'bob' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email/i);
  });

  it('409 on duplicate username', async () => {
    await reg();
    const res = await reg({ email: 'other@test.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/username/i);
  });

  it('400 when password < 8 chars', async () => {
    expect((await reg({ password: 'abc' })).status).toBe(400);
  });

  it('400 for username with invalid characters', async () => {
    expect((await reg({ username: 'bad user!' })).status).toBe(400);
  });

  it('400 for username < 3 chars', async () => {
    expect((await reg({ username: 'ab' })).status).toBe(400);
  });

  it('400 when required fields are missing', async () => {
    expect((await request(app).post('/api/auth/register').send({ username: 'x' })).status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  beforeEach(async () => { await reg(); });

  it('200 + tokens for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: REG.email, password: REG.password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('401 for wrong password', async () => {
    expect((await request(app).post('/api/auth/login')
      .send({ email: REG.email, password: 'wrong' })).status).toBe(401);
  });

  it('401 for unknown email', async () => {
    expect((await request(app).post('/api/auth/login')
      .send({ email: 'nobody@x.com', password: 'pw' })).status).toBe(401);
  });

  it('email lookup is case-insensitive', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'ALICE@TEST.COM', password: REG.password });
    expect(res.status).toBe(200);
  });

  it('400 when password field is missing', async () => {
    expect((await request(app).post('/api/auth/login')
      .send({ email: REG.email })).status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  it('200 + user for valid JWT', async () => {
    const { body: { accessToken } } = await reg({ username: 'meuser', email: 'me@x.com' });
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('meuser');
  });

  it('401 with no Authorization header', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('401 for an invalid token', async () => {
    expect((await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer bad.token')).status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('POST /api/auth/refresh', () => {
  it('200 + new accessToken for valid refreshToken', async () => {
    const { body: { refreshToken } } = await reg({ username: 'ref', email: 'ref@x.com' });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('401 for a malformed refresh token', async () => {
    expect((await request(app).post('/api/auth/refresh')
      .send({ refreshToken: 'bad.token' })).status).toBe(401);
  });

  it('401 when refreshToken is absent', async () => {
    expect((await request(app).post('/api/auth/refresh').send({})).status).toBe(401);
  });
});

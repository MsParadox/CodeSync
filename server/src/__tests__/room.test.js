/**
 * Room CRUD endpoint tests — no MongoDB required.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../config/redis.js', () => ({
  redisClient: { incr: jest.fn(async () => 1), expire: jest.fn(async () => {}) },
  pubClient: {}, subClient: {}, connectRedis: jest.fn(),
}));

const bcryptMod = await import('bcryptjs');
const bcrypt    = bcryptMod.default ?? bcryptMod;
const db = { users: new Map(), rooms: new Map(), uid: 1, rid: 1 };

// ── Query-chain shims ────────────────────────────────────────────
const chain = (val) => ({
  select:   () => chain(val),
  lean:     () => Promise.resolve(val),
  populate: () => chain(val),
  sort:     () => chain(val),
  limit:    () => chain(val),
  skip:     () => chain(val),
  then:     (r, j) => Promise.resolve(val).then(r, j),
});

function makeUser(data) {
  const u = {
    _id: String(db.uid++), ...data, email: data.email.toLowerCase(),
    isActive: true, stats: { languageCounts: {} }, lastLogin: new Date(),
    async save() { db.users.set(this.email, this); return this; },
    async comparePassword(p) { return bcrypt.compare(p, this.passwordHash); },
    toJSON() { return { _id: this._id, username: this.username, email: this.email }; },
    constructor: { findByIdAndUpdate: jest.fn(async () => {}) },
  };
  return u;
}

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
      const u = makeUser({ ...data, passwordHash: hash });
      db.users.set(u.email, u);
      return u;
    }),
    findByIdAndUpdate: jest.fn(async () => {}),
  },
}));

// ── Room mock — needs to be a newable constructor ────────────────
jest.unstable_mockModule('../models/Room.js', () => {
  // Room "constructor" — new Room({...}) returns an object with save/setPassword
  function Room(data) {
    Object.assign(this, data);
    this._id       = String(db.rid++);
    this.roomId    = `room-${this._id}`;
    this.archived  = false;
    this.tags      = data.tags || [];
    this.interviewMode   = false;
    this.problemStatement = '';
    this.passwordHash = null;
    this.maxParticipants = 10;
    this.lastActiveAt = new Date();
  }
  Room.prototype.setPassword  = async function(pw) { this.passwordHash = await bcrypt.hash(pw, 1); };
  Room.prototype.verifyPassword = async function(pw) {
    if (!this.passwordHash) return true;
    return bcrypt.compare(pw, this.passwordHash);
  };
  Room.prototype.save = async function() {
    db.rooms.set(this.roomId, this);
    return this;
  };
  Room.prototype.toJSON = function() {
    const { passwordHash, save, setPassword, verifyPassword, toJSON, ...rest } = this;
    return rest;
  };

  // Static query methods
  Room.findOne = jest.fn((q = {}) => {
    let result = null;
    if (q.roomId) {
      const r = db.rooms.get(q.roomId);
      if (r && (q.archived === undefined || !r.archived)) result = r;
    }
    return chain(result);
  });
  Room.findById = jest.fn((id) => {
    let result = null;
    for (const r of db.rooms.values()) if (r._id === id) { result = r; break; }
    return chain(result);
  });
  Room.find = jest.fn((q = {}) => {
    const arr = [...db.rooms.values()].filter(r => {
      if (q.archived === false && r.archived) return false;
      if (q.owner && String(r.owner) !== String(q.owner)) return false;
      if (q.language && r.language !== q.language) return false;
      return true;
    });
    return chain(arr);
  });
  Room.countDocuments = jest.fn(async () => db.rooms.size);
  Room.findOneAndUpdate = jest.fn(async (q, update) => {
    const r = db.rooms.get(q.roomId);
    if (r && update) Object.assign(r, update);
    return r ?? null;
  });

  return { Room };
});

jest.unstable_mockModule('../models/Snapshot.js', () => ({
  Snapshot: { find: jest.fn(() => chain([])) },
  Execution: {
    find: jest.fn(() => chain([])),
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
    create: jest.fn(async (d) => ({ _id: 'ex1', ...d })),
  },
}));

const { default: request } = await import('supertest');
const { app }              = await import('../app.js');

// ── Helpers ──────────────────────────────────────────────────────
async function getToken(suffix = 'owner') {
  const res = await request(app).post('/api/auth/register')
    .send({ username: `usr_${suffix}`, email: `${suffix}@t.com`, password: 'testpass123' });
  return res.body.accessToken;
}
const newRoom = (token, extra = {}) =>
  request(app).post('/api/rooms')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Room', language: 'javascript', ...extra });

beforeEach(() => { db.users.clear(); db.rooms.clear(); db.uid = 1; db.rid = 1; });

// ─────────────────────────────────────────────────────────────────
describe('POST /api/rooms', () => {
  it('201 — creates room and returns it', async () => {
    const token = await getToken();
    const res   = await newRoom(token);
    expect(res.status).toBe(201);
    expect(res.body.room).toHaveProperty('roomId');
    expect(res.body.room.language).toBe('javascript');
    expect(res.body.room.name).toBe('Test Room');
  });

  it('401 — unauthenticated', async () => {
    expect((await request(app).post('/api/rooms')
      .send({ name: 'X', language: 'go' })).status).toBe(401);
  });

  it('400 — unsupported language', async () => {
    const token = await getToken('lang');
    expect((await newRoom(token, { language: 'cobol' })).status).toBe(400);
  });

  it('400 — name < 2 chars', async () => {
    const token = await getToken('short');
    expect((await newRoom(token, { name: 'X' })).status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('GET /api/rooms', () => {
  it('200 — returns rooms array with pagination', async () => {
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rooms)).toBe(true);
    expect(res.body).toHaveProperty('pagination');
  });
});

// ─────────────────────────────────────────────────────────────────
describe('GET /api/rooms/:roomId', () => {
  it('200 — returns room; no passwordHash in response', async () => {
    const token  = await getToken('fetch');
    const create = await newRoom(token);
    expect(create.status).toBe(201);
    const { roomId } = create.body.room;
    const res = await request(app).get(`/api/rooms/${roomId}`);
    expect(res.status).toBe(200);
    expect(res.body.room.roomId).toBe(roomId);
    expect(res.body.room).not.toHaveProperty('passwordHash');
  });

  it('404 for unknown roomId', async () => {
    const res = await request(app).get('/api/rooms/00000000-0000-4000-a000-000000000000');
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('DELETE /api/rooms/:roomId', () => {
  it('401 — unauthenticated delete rejected', async () => {
    const token  = await getToken('del');
    const create = await newRoom(token);
    expect(create.status).toBe(201);
    const { roomId } = create.body.room;
    expect((await request(app).delete(`/api/rooms/${roomId}`)).status).toBe(401);
  });
});

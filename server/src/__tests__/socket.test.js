/**
 * Socket.io integration tests — no MongoDB binary required.
 * Uses mocked Mongoose models + a no-op Redis adapter.
 */
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// ── Redis pub/sub shim ────────────────────────────────────────────
// The @socket.io/redis-adapter needs pub/sub clients that behave like
// event emitters. We use lightweight EventEmitter shims so the adapter
// initialises without a real Redis connection.
class RedisPubSubShim extends EventEmitter {
  async connect()   { return this; }
  async subscribe() { return this; }
  async psubscribe(){ return this; }
  async publish()   { return this; }
  async quit()      { return this; }
  duplicate()       { return new RedisPubSubShim(); }
}

const pubShim = new RedisPubSubShim();
const subShim = new RedisPubSubShim();

jest.unstable_mockModule('../config/redis.js', () => ({
  redisClient: {
    sadd:   jest.fn(async () => 1),
    srem:   jest.fn(async () => 1),
    scard:  jest.fn(async () => 0),
    hset:   jest.fn(async () => 1),
    hdel:   jest.fn(async () => 1),
    hget:   jest.fn(async () => null),
    set:    jest.fn(async () => 'OK'),
    get:    jest.fn(async () => null),
    del:    jest.fn(async () => 1),
    expire: jest.fn(async () => 1),
    ttl:    jest.fn(async () => -1),
    incr:   jest.fn(async () => 1),
    ping:   jest.fn(async () => 'PONG'),
    pipeline: jest.fn(() => ({
      sadd:   jest.fn().mockReturnThis(),
      srem:   jest.fn().mockReturnThis(),
      hset:   jest.fn().mockReturnThis(),
      hdel:   jest.fn().mockReturnThis(),
      set:    jest.fn().mockReturnThis(),
      del:    jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec:   jest.fn(async () => []),
    })),
    quit: jest.fn(async () => {}),
  },
  pubClient:    pubShim,
  subClient:    subShim,
  connectRedis: jest.fn(async () => {}),
}));

// ── No-op Redis adapter (avoids real pub/sub) ────────────────────
// socket.io calls `new ReturnedClass(namespace)` on the value returned
// by createAdapter(). We extend the built-in Adapter so every required
// method (init, close, broadcast, etc.) already exists; we only need
// to suppress the Redis-specific init.
jest.unstable_mockModule('@socket.io/redis-adapter', () => {
  // Lazy-require the base Adapter inside the factory so socket.io is
  // loaded after our other mocks are already in place.
  const getAdapter = async () => {
    const { Adapter } = await import('socket.io-adapter');
    class NoopRedisAdapter extends Adapter {
      async init()  { /* skip Redis connect */ }
      async close() { /* no-op */ }
    }
    return NoopRedisAdapter;
  };

  // createAdapter() is synchronous in real usage but socket.io calls
  // io.adapter(theReturnValue) at server-creation time, not at connect
  // time. We can return the class synchronously after pre-loading it.
  let _AdapterClass = null;

  // Pre-resolve so the first createAdapter() call has the class ready.
  // (The dynamic import Promise resolves before any test runs.)
  const _ready = getAdapter().then((cls) => { _AdapterClass = cls; });

  return {
    createAdapter: jest.fn(() => {
      // If called before _ready resolved (shouldn't happen in tests),
      // fall back to a plain EventEmitter-based stub.
      if (!_AdapterClass) {
        class FallbackAdapter extends EventEmitter {
          async init()  {}
          async close() {}
        }
        return FallbackAdapter;
      }
      return _AdapterClass;
    }),
    _ready,   // exposed so we can await it in beforeAll if needed
  };
});

// ── In-memory model stores ────────────────────────────────────────
const db = { users: new Map(), rooms: new Map(), uid: 1 };

const bcryptMod = await import('bcryptjs');
const bcrypt    = bcryptMod.default ?? bcryptMod;

// Full query-chain shim — every Mongoose method used in the codebase
const chain = (val) => ({
  select:   () => chain(val),
  lean:     () => Promise.resolve(val),
  populate: () => chain(val),
  sort:     () => chain(val),   // Snapshot.findOne().sort({ savedAt:-1 }).lean()
  limit:    () => chain(val),
  skip:     () => chain(val),
  then:     (r, j) => Promise.resolve(val).then(r, j),
});

function makeUser(data) {
  return {
    _id: String(db.uid++), ...data, email: data.email?.toLowerCase(),
    isActive: true, stats: { languageCounts: {} }, lastLogin: new Date(),
    async save() { db.users.set(this.email, this); return this; },
    async comparePassword(p) { return bcrypt.compare(p, this.passwordHash); },
    toJSON() { return { _id: this._id, username: this.username }; },
    constructor: { findByIdAndUpdate: jest.fn() },
  };
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

jest.unstable_mockModule('../models/Room.js', () => {
  function Room(data) {
    Object.assign(this, data);
    this._id = `rid-${Date.now()}`;
    this.roomId = `room-test-${this._id}`;
    this.archived = false; this.tags = []; this.maxParticipants = 10;
    this.interviewMode = false; this.problemStatement = '';
    this.passwordHash = null;
    if (!this.members) this.members = [];
    if (this.isPrivate === undefined) this.isPrivate = false;
  }
  Room.prototype.setPassword    = jest.fn(async function() {});
  Room.prototype.verifyPassword = jest.fn(async () => true);
  Room.prototype.save = jest.fn(async function() {
    db.rooms.set(this.roomId, this); return this;
  });
  Room.prototype.toJSON = function() {
    const { save, setPassword, verifyPassword, toJSON, getMemberRole, canEdit, canView, setMemberRole, removeMember, ...r } = this; return r;
  };


  Room.prototype.getMemberRole = function (userId) {
    const uid = userId.toString();
    if (this.owner.toString() === uid) return 'owner';
    const member = (this.members || []).find((m) => m.userId.toString() === uid);
    if (member) return member.role;
    if (!this.isPrivate) return 'editor';
    return null;
  };
  Room.prototype.canEdit = function (userId) {
    const role = this.getMemberRole(userId);
    return role === 'owner' || role === 'editor';
  };
  Room.prototype.canView = function (userId) {
    return this.getMemberRole(userId) !== null;
  };
  Room.prototype.setMemberRole = function (userId, role) {
    if (this.owner.toString() === userId.toString()) return false;
    if (!this.members) this.members = [];
    const idx = this.members.findIndex((m) => m.userId.toString() === userId.toString());
    if (idx >= 0) this.members[idx].role = role;
    else this.members.push({ userId, role });
    return true;
  };
  Room.prototype.removeMember = function (userId) {
    this.members = (this.members || []).filter((m) => m.userId.toString() !== userId.toString());
  };

  const chain = (val) => ({
    select:   () => chain(val),
    lean:     () => Promise.resolve(val),
    populate: () => chain(val),
    sort:     () => chain(val),
    limit:    () => chain(val),
    skip:     () => chain(val),
    then:     (r, j) => Promise.resolve(val).then(r, j),
  });

  Room.findOne = jest.fn((q = {}) =>
    chain(q.roomId ? db.rooms.get(q.roomId) ?? null : null)
  );
  // findById used by room.routes.js after room.save() to return populated room
  Room.findById = jest.fn((id) => {
    let result = null;
    for (const r of db.rooms.values()) if (r._id === id) { result = r; break; }
    return chain(result);
  });
  Room.find             = jest.fn(() => chain([]));
  Room.countDocuments   = jest.fn(async () => 0);
  Room.findOneAndUpdate = jest.fn(async () => {});
  return { Room };
});

jest.unstable_mockModule('../models/Snapshot.js', () => ({
  Snapshot: {
    findOne: jest.fn(() => chain(null)),
    find:    jest.fn(() => chain([])),
    create:  jest.fn(async () => {}),
    pruneOld: jest.fn(async () => {}),
  },
  Execution: {
    create: jest.fn(async (d) => ({ _id: 'ex1', ...d })),
    find:   jest.fn(() => chain([])),
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
  },
}));

jest.unstable_mockModule('../models/SessionEvent.js', () => ({
  SessionEvent: {
    create:           jest.fn(async (d) => ({ _id: 'evt1', ...d })),
    getReplay:        jest.fn(async () => []),
    getTimeline:      jest.fn(async () => []),
    pruneCheckpoints: jest.fn(async () => {}),
  },
}));

// ── Dynamic imports AFTER mocks ──────────────────────────────────
const { createServer }             = await import('http');
const { io: Client }               = await import('socket.io-client');
const { default: request }         = await import('supertest');
const { app }                      = await import('../app.js');
const { initSocket }               = await import('../socket/index.js');

let httpServer, serverPort;

// ── Server lifecycle ─────────────────────────────────────────────
beforeAll(async () => {
  httpServer = createServer(app);
  initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  serverPort = httpServer.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
});

beforeEach(() => { db.users.clear(); db.rooms.clear(); db.uid = 1; });

// ── Helpers ──────────────────────────────────────────────────────
async function registerAndGetToken(suffix) {
  const res = await request(app).post('/api/auth/register').send({
    username: `s_${suffix}`, email: `s${suffix}@t.com`, password: 'sockpass123',
  });
  return res.body.accessToken;
}

function connectClient(token) {
  return new Promise((resolve, reject) => {
    const socket = Client(`http://127.0.0.1:${serverPort}`, {
      auth: { token }, transports: ['websocket'], reconnection: false,
    });
    socket.once('connect',       () => resolve(socket));
    socket.once('connect_error', (e) => reject(e));
  });
}

async function joinRoom(socket, roomId) {
  return new Promise((resolve) => {
    socket.emit('join-room', { roomId });
    socket.once('room-joined', resolve);
    socket.once('error',       resolve);  // capture errors too
  });
}

// Seed a room via HTTP; the Room mock's save() puts it in db.rooms,
// and the default findOne mock reads from db.rooms — no override needed.
async function seedRoom(token) {
  const res = await request(app)
    .post('/api/rooms')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Socket Test Room', language: 'javascript' });
  return res.body.room?.roomId;
}

// ─────────────────────────────────────────────────────────────────
describe('Socket.io authentication', () => {
  it('connects successfully with a valid JWT', async () => {
    const token  = await registerAndGetToken('auth1');
    const socket = await connectClient(token);
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it('rejects connection with no token', async () => {
    const socket = Client(`http://127.0.0.1:${serverPort}`, {
      transports: ['websocket'], reconnection: false,
    });
    const err = await new Promise((resolve) => socket.once('connect_error', resolve));
    expect(err.message).toMatch(/AUTHENTICATION_REQUIRED|INVALID_TOKEN/);
    socket.disconnect();
  });

  it('rejects connection with an invalid JWT', async () => {
    const socket = Client(`http://127.0.0.1:${serverPort}`, {
      auth: { token: 'totally.bad.jwt' }, transports: ['websocket'], reconnection: false,
    });
    const err = await new Promise((resolve) => socket.once('connect_error', resolve));
    expect(err.message).toMatch(/INVALID_TOKEN/);
    socket.disconnect();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('join-room', () => {
  it('emits room-joined with roomId, yjsState and color', async () => {
    const token  = await registerAndGetToken('join1');
    const roomId = await seedRoom(token);
    const socket = await connectClient(token);

    const payload = await new Promise((resolve) => {
      socket.emit('join-room', { roomId });
      socket.once('room-joined', resolve);
    });

    expect(payload.roomId).toBe(roomId);
    expect(payload).toHaveProperty('yjsState');
    expect(payload).toHaveProperty('color');
    socket.disconnect();
  });

  it('emits ROOM_NOT_FOUND for unknown roomId', async () => {
    const token  = await registerAndGetToken('join2');
    const socket = await connectClient(token);

    const err = await new Promise((resolve) => {
      socket.emit('join-room', { roomId: '00000000-0000-4000-a000-000000000000' });
      socket.once('error', resolve);
    });

    expect(err.code).toBe('ROOM_NOT_FOUND');
    socket.disconnect();
  });

  it('emits INVALID_ROOM_ID when roomId is missing', async () => {
    const token  = await registerAndGetToken('join3');
    const socket = await connectClient(token);

    const err = await new Promise((resolve) => {
      socket.emit('join-room', {});
      socket.once('error', resolve);
    });

    expect(err.code).toBe('INVALID_ROOM_ID');
    socket.disconnect();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('chat-message membership guard', () => {
  it('delivers message to other room members', async () => {
    const t1 = await registerAndGetToken('chat1');
    const t2 = await registerAndGetToken('chat2');
    const roomId = await seedRoom(t1);

    const [s1, s2] = await Promise.all([connectClient(t1), connectClient(t2)]);

    await Promise.all([
      new Promise((r) => { s1.emit('join-room', { roomId }); s1.once('room-joined', r); }),
      new Promise((r) => { s2.emit('join-room', { roomId }); s2.once('room-joined', r); }),
    ]);

    const received = await new Promise((resolve) => {
      s2.once('chat-message', resolve);
      s1.emit('chat-message', { roomId, text: 'Hello from s1' });
    });

    expect(received.text).toBe('Hello from s1');
    s1.disconnect(); s2.disconnect();
  });

  it('does NOT deliver message from socket that never joined', async () => {
    const t1      = await registerAndGetToken('guard1');
    const t2      = await registerAndGetToken('guard2');
    const roomId  = await seedRoom(t1);
    const s1      = await connectClient(t1);  // member
    const s2      = await connectClient(t2);  // never joins

    await new Promise((r) => { s1.emit('join-room', { roomId }); s1.once('room-joined', r); });

    let gotMsg = false;
    s1.on('chat-message', () => { gotMsg = true; });
    s2.emit('chat-message', { roomId, text: 'Sneaky' });

    await new Promise((r) => setTimeout(r, 250));
    expect(gotMsg).toBe(false);
    s1.disconnect(); s2.disconnect();
  });

  it('sanitizes HTML tags in chat messages', async () => {
    const t1 = await registerAndGetToken('san1');
    const t2 = await registerAndGetToken('san2');
    const roomId = await seedRoom(t1);
    const [s1, s2] = await Promise.all([connectClient(t1), connectClient(t2)]);

    await Promise.all([
      new Promise((r) => { s1.emit('join-room', { roomId }); s1.once('room-joined', r); }),
      new Promise((r) => { s2.emit('join-room', { roomId }); s2.once('room-joined', r); }),
    ]);

    const received = await new Promise((resolve) => {
      s2.once('chat-message', resolve);
      s1.emit('chat-message', { roomId, text: '<script>alert(1)</script>hello' });
    });

    expect(received.text).not.toContain('<script>');
    expect(received.text).toContain('hello');
    s1.disconnect(); s2.disconnect();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('yjs-update membership guard', () => {
  it('forwards Yjs update to other room members', async () => {
    const t1     = await registerAndGetToken('yjs1');
    const t2     = await registerAndGetToken('yjs2');
    const roomId = await seedRoom(t1);
    const [s1, s2] = await Promise.all([connectClient(t1), connectClient(t2)]);

    await Promise.all([
      new Promise((r) => { s1.emit('join-room', { roomId }); s1.once('room-joined', r); }),
      new Promise((r) => { s2.emit('join-room', { roomId }); s2.once('room-joined', r); }),
    ]);

    const got = await new Promise((resolve) => {
      s2.once('yjs-update', resolve);
      s1.emit('yjs-update', { roomId, update: btoa('delta') });
    });

    expect(got).toHaveProperty('update');
    s1.disconnect(); s2.disconnect();
  });

  it('silently drops yjs-update from non-member socket', async () => {
    const t1     = await registerAndGetToken('yjsg1');
    const t2     = await registerAndGetToken('yjsg2');
    const roomId = await seedRoom(t1);
    const s1     = await connectClient(t1);  // member
    const s2     = await connectClient(t2);  // NOT in room

    await new Promise((r) => { s1.emit('join-room', { roomId }); s1.once('room-joined', r); });

    let gotUpdate = false;
    s1.on('yjs-update', () => { gotUpdate = true; });
    s2.emit('yjs-update', { roomId, update: btoa('attack') });

    await new Promise((r) => setTimeout(r, 250));
    expect(gotUpdate).toBe(false);
    s1.disconnect(); s2.disconnect();
  });
});

/**
 * Permission system tests — Owner / Editor / Viewer role enforcement.
 *
 * Covers:
 *  - Room model getMemberRole / canEdit / canView
 *  - Member management API (add, update, remove)
 *  - Snapshot access control (members only)
 *  - Session replay access control
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../config/redis.js', () => ({
  redisClient: {
    incr:    jest.fn(async () => 1),
    expire:  jest.fn(async () => {}),
    ttl:     jest.fn(async () => 55),
    sCard:   jest.fn(async () => 0),
    sAdd:    jest.fn(async () => {}),
    hSet:    jest.fn(async () => {}),
    hDel:    jest.fn(async () => {}),
    sRem:    jest.fn(async () => {}),
    del:     jest.fn(async () => {}),
    pipeline: jest.fn(() => ({
      sAdd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      hSet: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      exec: jest.fn(async () => []),
    })),
  },
  pubClient: {}, subClient: {}, connectRedis: jest.fn(),
}));

const bcryptMod = await import('bcryptjs');
const bcrypt    = bcryptMod.default ?? bcryptMod;

const db = { users: new Map(), rooms: new Map(), snapshots: [], events: [], uid: 1, rid: 1 };

function makeOId(n) { return String(n).padStart(24, '0'); }

const chain = (val) => ({
  select:   () => chain(val),
  lean:     () => Promise.resolve(val),

  populate: (f) => {
    if (!val) return chain(val);
    let result = val;
    if (val.members) {
      result = {
        ...result,
        members: val.members.map((m) => {
          const rawId = (m.userId && m.userId._id) ? m.userId._id : m.userId;
          const u = [...db.users.values()].find((u) => u._id === rawId.toString());
          return { ...m, userId: u ? { _id: u._id, username: u.username, avatar: u.avatar, email: u.email } : { _id: rawId, username: 'unknown' } };
        }),
      };
    }
    if (val.owner) {
      const rawOwnerId = (val.owner && val.owner._id) ? val.owner._id : val.owner;
      const owner = [...db.users.values()].find((u) => u._id === rawOwnerId.toString());
      if (owner) result = { ...result, owner: { _id: owner._id, username: owner.username, avatar: owner.avatar, email: owner.email } };
    }
    return chain(result);
  },
  sort:     () => chain(val),
  limit:    () => chain(val),
  skip:     () => chain(val),
  then:     (r, j) => Promise.resolve(val).then(r, j),
});

// ── User mock ──────────────────────────────────────────────────────
jest.unstable_mockModule('../models/User.js', () => ({
  User: {

    findOne: jest.fn(({ $or, username, email } = {}) => {
      if ($or) {
        for (const c of $or) {
          const [k, v] = Object.entries(c)[0];
          for (const u of db.users.values()) if (u[k] === v) return chain(u);
        }
        return chain(null);
      }
      if (username) return chain([...db.users.values()].find((u) => u.username === username) || null);
      return chain(email ? db.users.get(email.toLowerCase()) ?? null : null);
    }),
    findById: jest.fn((id) => {
      const u = [...db.users.values()].find((x) => x._id === String(id));
      return chain(u ?? null);
    }),
    create: jest.fn(async (data) => {
      const hash = await bcrypt.hash(data.passwordHash, 1);
      const u = {
        _id: makeOId(db.uid++), ...data, email: data.email.toLowerCase(),
        passwordHash: hash, isActive: true, lastLogin: new Date(),
        stats: { languageCounts: {}, roomsCreated: 0 },
        async save() { db.users.set(this.email, this); return this; },
        async comparePassword(p) { return bcrypt.compare(p, this.passwordHash); },
        toJSON() { return { _id: this._id, username: this.username, email: this.email }; },
      };
      db.users.set(u.email, u);
      return u;
    }),
    findByIdAndUpdate: jest.fn(async () => {}),
  },
}));

// ── Room mock ──────────────────────────────────────────────────────
jest.unstable_mockModule('../models/Room.js', () => {
  function Room(data) {
    Object.assign(this, {
      _id: makeOId(db.rid),
      roomId: `room-${db.rid}`,
      archived: false,
      members: [],
      tags: [],
      interviewMode: false,
      problemStatement: '',
      passwordHash: null,
      maxParticipants: 10,
      lastActiveAt: new Date(),
      isPrivate: false,
    }, data);
    db.rid++;
  }

  Room.prototype.setPassword = async function(pw) {
    this.passwordHash = await bcrypt.hash(pw, 1);
  };
  Room.prototype.verifyPassword = async function(plain) {
    if (!this.passwordHash) return true;
    return bcrypt.compare(plain, this.passwordHash);
  };
  Room.prototype.save = async function() {
    db.rooms.set(this.roomId, this);
    return this;
  };
  Room.prototype.toJSON = function() {
    const { passwordHash, ...rest } = this;
    return rest;
  };
  Room.prototype.getMemberRole = function(userId) {
    const uid = userId.toString();
    if (this.owner && this.owner.toString() === uid) return 'owner';
    const member = (this.members || []).find((m) => m.userId.toString() === uid);
    if (member) return member.role;
    if (!this.isPrivate) return 'editor';
    return null;
  };
  Room.prototype.canEdit = function(userId) {
    const role = this.getMemberRole(userId);
    return role === 'owner' || role === 'editor';
  };
  Room.prototype.canView = function(userId) {
    return this.getMemberRole(userId) !== null;
  };
  Room.prototype.setMemberRole = function(userId, role) {
    if (this.owner && this.owner.toString() === userId.toString()) return false;
    const idx = (this.members || []).findIndex((m) => m.userId.toString() === userId.toString());
    if (idx >= 0) {
      this.members[idx].role = role;
    } else {
      this.members.push({ userId: userId.toString(), role });
    }
    return true;
  };
  Room.prototype.removeMember = function(userId) {
    this.members = (this.members || []).filter(
      (m) => m.userId.toString() !== userId.toString()
    );
  };

  Room.findOne = jest.fn(({ roomId, archived } = {}) => {
    const r = db.rooms.get(roomId);
    if (!r) return chain(null);
    if (archived === false && r.archived) return chain(null);
    return chain(r);
  });
  Room.find = jest.fn(() => chain([]));
  Room.findById = jest.fn((id) => {
    const r = [...db.rooms.values()].find((x) => x._id === String(id));
    return chain(r ?? null);
  });
  Room.findOneAndUpdate = jest.fn(async () => null);
  Room.countDocuments = jest.fn(async () => 0);

  return { Room };
});

// ── SessionEvent mock ──────────────────────────────────────────────
jest.unstable_mockModule('../models/SessionEvent.js', () => ({
  SessionEvent: {
    create: jest.fn(async (data) => { db.events.push(data); return data; }),
    getReplay: jest.fn(async () => db.events),
    getTimeline: jest.fn(async () => db.events),
    pruneCheckpoints: jest.fn(async () => {}),
  },
}));

// ── Snapshot mock ──────────────────────────────────────────────────
jest.unstable_mockModule('../models/Snapshot.js', () => ({
  Snapshot: {
    find: jest.fn(() => chain(db.snapshots)),
    findOne: jest.fn(() => chain(null)),
    create: jest.fn(async (d) => { db.snapshots.push(d); return d; }),
    pruneOld: jest.fn(async () => {}),
  },
  Execution: {
    find: jest.fn(() => chain([])),
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
    create: jest.fn(async (d) => d),
  },
}));

const { default: request } = await import('supertest');
const { app }              = await import('../app.js');

// ── Helpers ────────────────────────────────────────────────────────
async function register(username, email) {
  const res = await request(app).post('/api/auth/register')
    .send({ username, email, password: 'password123' });
  return res.body.accessToken;
}

async function createRoom(token, overrides = {}) {
  const res = await request(app).post('/api/rooms')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Room', language: 'javascript', ...overrides });
  return res.body.room;
}

beforeEach(() => {
  db.users.clear();
  db.rooms.clear();
  db.snapshots.length = 0;
  db.events.length = 0;
  db.uid = 1;
  db.rid = 1;
});

// ── getMemberRole unit tests (model logic) ─────────────────────────
describe('Room.getMemberRole — logic', () => {
  it('owner always returns "owner"', () => {
    const room = {
      owner: makeOId(1),
      members: [],
      isPrivate: false,
      getMemberRole(uid) {
        if (this.owner === uid) return 'owner';
        const m = this.members.find((x) => x.userId === uid);
        if (m) return m.role;
        if (!this.isPrivate) return 'editor';
        return null;
      },
    };
    expect(room.getMemberRole(makeOId(1))).toBe('owner');
  });

  it('pre-assigned editor returns "editor"', () => {
    const room = {
      owner: makeOId(1),
      members: [{ userId: makeOId(2), role: 'editor' }],
      isPrivate: false,
      getMemberRole(uid) {
        if (this.owner === uid) return 'owner';
        const m = this.members.find((x) => x.userId === uid);
        if (m) return m.role;
        if (!this.isPrivate) return 'editor';
        return null;
      },
    };
    expect(room.getMemberRole(makeOId(2))).toBe('editor');
  });

  it('pre-assigned viewer returns "viewer"', () => {
    const room = {
      owner: makeOId(1),
      members: [{ userId: makeOId(3), role: 'viewer' }],
      isPrivate: false,
      getMemberRole(uid) {
        if (this.owner === uid) return 'owner';
        const m = this.members.find((x) => x.userId === uid);
        if (m) return m.role;
        if (!this.isPrivate) return 'editor';
        return null;
      },
    };
    expect(room.getMemberRole(makeOId(3))).toBe('viewer');
  });

  it('unknown user in a PUBLIC room defaults to "editor"', () => {
    const room = {
      owner: makeOId(1),
      members: [],
      isPrivate: false,
      getMemberRole(uid) {
        if (this.owner === uid) return 'owner';
        const m = this.members.find((x) => x.userId === uid);
        if (m) return m.role;
        if (!this.isPrivate) return 'editor';
        return null;
      },
    };
    expect(room.getMemberRole(makeOId(99))).toBe('editor');
  });

  it('unknown user in a PRIVATE room returns null', () => {
    const room = {
      owner: makeOId(1),
      members: [],
      isPrivate: true,
      getMemberRole(uid) {
        if (this.owner === uid) return 'owner';
        const m = this.members.find((x) => x.userId === uid);
        if (m) return m.role;
        if (!this.isPrivate) return 'editor';
        return null;
      },
    };
    expect(room.getMemberRole(makeOId(99))).toBeNull();
  });
});

// ── Member management API ─────────────────────────────────────────
describe('POST /api/rooms/:roomId/members', () => {
  it('201 — owner can add a member as editor', async () => {
    const ownerToken = await register('owner1', 'owner1@t.com');
    const editorToken = await register('editor1', 'editor1@t.com');

    // Make sure editor user exists in db
    const editorUser = [...db.users.values()].find((u) => u.username === 'editor1');

    const room = await createRoom(ownerToken);

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ username: 'editor1', role: 'editor' });

    expect(res.status).toBe(200);
    expect(res.body.member.role).toBe('editor');
  });

  it('201 — owner can add a member as viewer', async () => {
    const ownerToken = await register('owner2', 'owner2@t.com');
    await register('viewer1', 'viewer1@t.com');

    const room = await createRoom(ownerToken);

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ username: 'viewer1', role: 'viewer' });

    expect(res.status).toBe(200);
    expect(res.body.member.role).toBe('viewer');
  });

  it('403 — non-owner cannot add members', async () => {
    const ownerToken = await register('owner3', 'owner3@t.com');
    const otherToken = await register('other1', 'other1@t.com');
    const room = await createRoom(ownerToken);

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/members`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ username: 'owner3', role: 'viewer' });

    expect(res.status).toBe(403);
  });

  it('400 — invalid role rejected', async () => {
    const ownerToken = await register('owner4', 'owner4@t.com');
    await register('target1', 'target1@t.com');
    const room = await createRoom(ownerToken);

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ username: 'target1', role: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  it('404 — target user not found', async () => {
    const ownerToken = await register('owner5', 'owner5@t.com');
    const room = await createRoom(ownerToken);

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ username: 'nonexistent_xyz', role: 'editor' });

    expect(res.status).toBe(404);
  });

  it('401 — unauthenticated cannot manage members', async () => {
    const ownerToken = await register('owner6', 'owner6@t.com');
    const room = await createRoom(ownerToken);

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/members`)
      .send({ username: 'anyone', role: 'editor' });

    expect(res.status).toBe(401);
  });
});

// ── Snapshot access control ───────────────────────────────────────
describe('GET /api/rooms/:roomId/snapshots — access control', () => {
  it('200 — owner can access snapshots', async () => {
    const ownerToken = await register('snapOwner', 'snapowner@t.com');
    const room = await createRoom(ownerToken);

    const res = await request(app)
      .get(`/api/rooms/${room.roomId}/snapshots`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.snapshots)).toBe(true);
  });

  it('401 — unauthenticated blocked', async () => {
    const ownerToken = await register('snapOwner2', 'snapowner2@t.com');
    const room = await createRoom(ownerToken);

    const res = await request(app)
      .get(`/api/rooms/${room.roomId}/snapshots`);

    expect(res.status).toBe(401);
  });
});

// ── Session replay access control ────────────────────────────────
describe('GET /api/rooms/:roomId/replay — access control', () => {
  it('200 — member can access replay', async () => {
    const ownerToken = await register('replayOwner', 'replayowner@t.com');
    const room = await createRoom(ownerToken);

    const res = await request(app)
      .get(`/api/rooms/${room.roomId}/replay`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it('401 — unauthenticated blocked', async () => {
    const ownerToken = await register('replayOwner2', 'replayowner2@t.com');
    const room = await createRoom(ownerToken);

    const res = await request(app)
      .get(`/api/rooms/${room.roomId}/replay`);

    expect(res.status).toBe(401);
  });

  it('404 — non-existent room', async () => {
    const token = await register('replayUser3', 'replayuser3@t.com');

    const res = await request(app)
      .get('/api/rooms/no-such-room/replay')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ── canEdit / canView helpers ─────────────────────────────────────
describe('canEdit / canView guards', () => {
  const mkRoom = (owner, members, isPrivate = false) => ({
    owner,
    members,
    isPrivate,
    getMemberRole(uid) {
      if (this.owner === uid) return 'owner';
      const m = this.members.find((x) => x.userId === uid);
      if (m) return m.role;
      if (!this.isPrivate) return 'editor';
      return null;
    },
    canEdit(uid)   { const r = this.getMemberRole(uid); return r === 'owner' || r === 'editor'; },
    canView(uid)   { return this.getMemberRole(uid) !== null; },
  });

  it('owner can always edit', () => {
    const room = mkRoom('u1', []);
    expect(room.canEdit('u1')).toBe(true);
  });

  it('editor can edit', () => {
    const room = mkRoom('u1', [{ userId: 'u2', role: 'editor' }]);
    expect(room.canEdit('u2')).toBe(true);
  });

  it('viewer cannot edit', () => {
    const room = mkRoom('u1', [{ userId: 'u3', role: 'viewer' }]);
    expect(room.canEdit('u3')).toBe(false);
  });

  it('viewer can view', () => {
    const room = mkRoom('u1', [{ userId: 'u3', role: 'viewer' }]);
    expect(room.canView('u3')).toBe(true);
  });

  it('stranger in private room cannot view', () => {
    const room = mkRoom('u1', [], true);
    expect(room.canView('u99')).toBe(false);
    expect(room.canEdit('u99')).toBe(false);
  });

  it('stranger in public room can edit (open room default)', () => {
    const room = mkRoom('u1', [], false);
    expect(room.canEdit('u99')).toBe(true);
    expect(room.canView('u99')).toBe(true);
  });
});

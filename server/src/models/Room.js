import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

// ── Member sub-document: Owner / Editor / Viewer ─────────────────
const memberSchema = new mongoose.Schema(
  {
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role:    { type: String, enum: ['editor', 'viewer'], default: 'editor' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Hidden test case sub-document ────────────────────────────────
const testCaseSchema = new mongoose.Schema(
  {
    input:          { type: String, default: '' },
    expectedOutput: { type: String, default: '' },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      unique: true,
      default: () => uuidv4(),
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      maxlength: 300,
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // ── Permission roster ───────────────────────────────────────
    // Pre-assigned members get their explicit role.
    // Users not in this list who join a public room default to 'editor'.
    // Private rooms require the owner to pre-add members OR use a password.
    members: {
      type: [memberSchema],
      default: [],
      validate: { validator: (v) => v.length <= 100, message: 'Max 100 members' },
    },
    language: {
      type: String,
      enum: ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'],
      default: 'javascript',
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    maxParticipants: {
      type: Number,
      default: 10,
      max: 50,
    },
    tags: {
      type: [String],
      default: [],
      validate: { validator: (v) => v.length <= 5, message: 'Max 5 tags' },
    },
    interviewMode: {
      type: Boolean,
      default: false,
    },
    problemStatement: {
      type: String,
      maxlength: 5000,
      default: '',
    },
    // Authoritative interview timing so EVERY participant — including
    // people who join after the interview started — sees the same
    // remaining time and configured duration.
    interviewDurationMinutes: {
      type: Number,
      default: 45,
      min: 1,
      max: 300,
    },
    interviewStartedAt: {
      type: Date,
      default: null,
    },
    // Hidden test cases for interview submissions. NEVER sent to non-owners
    // (stripped in toJSON + route handlers); only their COUNT is exposed.
    // When empty, submissions just run normally.
    testCases: {
      type: [testCaseSchema],
      default: [],
      validate: { validator: (v) => v.length <= 25, message: 'Max 25 test cases' },
    },
    archived: {
      type: Boolean,
      default: false,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, obj) => {
        delete obj.passwordHash;
        delete obj.__v;
        delete obj.testCases;   // hidden — never leak expected outputs
        return obj;
      },
    },
  }
);

// ── Indexes ───────────────────────────────────────────────────────
roomSchema.index({ roomId: 1 }, { unique: true });
roomSchema.index({ owner: 1 });
roomSchema.index({ lastActiveAt: -1 });
roomSchema.index({ archived: 1, lastActiveAt: -1 });
roomSchema.index({ tags: 1 });
roomSchema.index({ 'members.userId': 1 });

// ── Instance Methods ──────────────────────────────────────────────

// Set password
roomSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

// Verify password
roomSchema.methods.verifyPassword = function (plain) {
  if (!this.passwordHash) return true;
  return bcrypt.compare(plain, this.passwordHash);
};

// Touch lastActiveAt
roomSchema.methods.touch = function () {
  this.lastActiveAt = new Date();
  return this.save();
};

/**
 * Returns 'owner' | 'editor' | 'viewer' | null
 * null means the user has no access to this room.
 *
 * Logic:
 *   - Owner is always 'owner'
 *   - Pre-assigned member gets their explicit role
 *   - For PUBLIC rooms, unregistered users default to 'editor'
 *   - For PRIVATE rooms, unregistered users have no access (null)
 */
roomSchema.methods.getMemberRole = function (userId) {
  const uid = userId.toString();
  if (this.owner.toString() === uid) return 'owner';
  const member = this.members.find((m) => m.userId.toString() === uid);
  if (member) return member.role;
  // Public rooms: unknown users default to editor on join
  if (!this.isPrivate) return 'editor';
  return null;
};

/** true if the user can edit code / execute / chat */
roomSchema.methods.canEdit = function (userId) {
  const role = this.getMemberRole(userId);
  return role === 'owner' || role === 'editor';
};

/** true if the user can at least view (all roles except null) */
roomSchema.methods.canView = function (userId) {
  return this.getMemberRole(userId) !== null;
};

/** Upsert a member record. Returns false if userId is the owner. */
roomSchema.methods.setMemberRole = function (userId, role) {
  if (this.owner.toString() === userId.toString()) return false;
  const idx = this.members.findIndex((m) => m.userId.toString() === userId.toString());
  if (idx >= 0) {
    this.members[idx].role = role;
  } else {
    this.members.push({ userId, role });
  }
  return true;
};

/** Remove a member from the roster */
roomSchema.methods.removeMember = function (userId) {
  this.members = this.members.filter((m) => m.userId.toString() !== userId.toString());
};

export const Room = mongoose.model('Room', roomSchema);

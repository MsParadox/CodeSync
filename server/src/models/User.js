import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-zA-Z0-9_-]+$/,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      default: function () {
        return `https://api.dicebear.com/9.x/identicon/svg?seed=${this.username}&backgroundColor=0a0a0f`;
      },
    },
    bio: {
      type: String,
      maxlength: 200,
      default: '',
    },
    stats: {
      roomsCreated: { type: Number, default: 0 },
      totalExecutions: { type: Number, default: 0 },
      totalRuntime: { type: Number, default: 0 }, // ms
      favouriteLanguage: { type: String, default: 'javascript' },
      languageCounts: {
        javascript: { type: Number, default: 0 },
        python: { type: Number, default: 0 },
        cpp: { type: Number, default: 0 },
        java: { type: Number, default: 0 },
        go: { type: Number, default: 0 },
        rust: { type: Number, default: 0 },
        typescript: { type: Number, default: 0 },
      },
      // Practice-problem solve counts by difficulty (for profile + leaderboard)
      solvedByDifficulty: {
        easy:   { type: Number, default: 0 },
        medium: { type: Number, default: 0 },
        hard:   { type: Number, default: 0 },
      },
    },
    // Slugs of practice problems the user has solved (deduped via $addToSet)
    solvedProblems: {
      type: [String],
      default: [],
      index: true,
    },
    // Daily solving streak (UTC day granularity)
    streak: {
      current:        { type: Number, default: 0 },
      max:            { type: Number, default: 0 },
      lastSolvedDate: { type: String, default: '' }, // 'YYYY-MM-DD'
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, obj) => {
        delete obj.passwordHash;
        delete obj.__v;
        return obj;
      },
    },
  }
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Update favourite language
userSchema.methods.recordExecution = async function (language, durationMs) {
  this.stats.totalExecutions += 1;
  this.stats.totalRuntime += durationMs || 0;
  if (this.stats.languageCounts[language] !== undefined) {
    this.stats.languageCounts[language] += 1;
  }

  // Recalculate favourite language
  const counts = this.stats.languageCounts;
  this.stats.favouriteLanguage = Object.keys(counts).reduce((a, b) =>
    counts[a] > counts[b] ? a : b
  );

  await this.save();
};

export const User = mongoose.model('User', userSchema);

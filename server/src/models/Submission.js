import mongoose from 'mongoose';

// ── Submission ───────────────────────────────────────────────────
// A candidate's submitted solution during an interview. Stored per room
// and per participant so the owner/interviewer can review every
// submission (the full code + the verdict it produced).
const submissionSchema = new mongoose.Schema({
  roomId:   { type: String, required: true, index: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  username: { type: String, default: 'Unknown' },
  avatar:   { type: String, default: '' },

  language: { type: String, required: true },
  code:     { type: String, required: true, maxlength: 100000 },

  // Verdict captured at submission time (Accepted / Runtime Error / …)
  status:          { type: String, default: 'unknown' },
  exitCode:        { type: Number, default: 0 },
  stdout:          { type: String, default: '' },
  stderr:          { type: String, default: '' },
  executionTimeMs: { type: Number, default: 0 },

  submittedAt: { type: Date, default: Date.now, index: true },
});

submissionSchema.index({ roomId: 1, submittedAt: -1 });
submissionSchema.index({ roomId: 1, userId: 1, submittedAt: -1 });

// Auto-expire after 90 days to bound storage.
submissionSchema.index({ submittedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const Submission = mongoose.model('Submission', submissionSchema);

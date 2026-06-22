import mongoose from 'mongoose';

/**
 * SessionEvent — records every significant action in a room so the
 * entire collaboration session can be replayed later.
 *
 * For code changes we store Yjs state checkpoints (every ~5s of activity),
 * not individual key-strokes, to keep storage reasonable.
 */
const sessionEventSchema = new mongoose.Schema({
  roomId:   { type: String, required: true, index: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  username: { type: String, default: 'Unknown' },

  eventType: {
    type: String,
    enum: [
      'join',             // user joined the room
      'leave',            // user left the room
      'yjs_checkpoint',   // periodic Yjs state snapshot for replay
      'execute',          // code was executed
      'language_change',  // language switched
      'chat',             // chat message sent
      'interview_start',  // interview mode enabled
      'interview_end',    // interview mode disabled
      'snapshot',         // manual snapshot taken
    ],
    required: true,
    index: true,
  },

  // Arbitrary metadata (language, exit code, message text, etc.)
  data: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Binary Yjs state — only populated for 'yjs_checkpoint' events
  // Stored as Buffer (BSON Binary) to keep it efficient
  yjsState: { type: Buffer, default: null },

  // No `index: true` here — the explicit TTL index below
  // (sessionEventSchema.index({ timestamp: 1 }, { expireAfterSeconds })) already
  // covers {timestamp:1}. Declaring both caused a Mongoose
  // "Duplicate schema index on {timestamp:1}" warning and would attempt
  // to create two indexes with the same key pattern but different
  // options (one plain, one TTL) — MongoDB rejects that as an
  // IndexOptionsConflict.
  timestamp: { type: Date, default: Date.now },
});

sessionEventSchema.index({ roomId: 1, timestamp: 1 });
sessionEventSchema.index({ roomId: 1, eventType: 1 });

// Auto-expire sessions after 30 days to prevent unbounded growth
sessionEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

// ── Statics ───────────────────────────────────────────────────────

/** Fetch the full event list for a room, ordered chronologically */
sessionEventSchema.statics.getReplay = async function (roomId, { limit = 500 } = {}) {
  return this.find({ roomId })
    .sort({ timestamp: 1 })
    .limit(limit)
    .select('-__v')
    .lean();
};

/** Get just the timeline summary (no Yjs binary, lighter response) */
sessionEventSchema.statics.getTimeline = async function (roomId) {
  return this.find({ roomId }, { yjsState: 0, __v: 0 })
    .sort({ timestamp: 1 })
    .lean();
};

/** Keep at most `max` yjs_checkpoint events per room to avoid bloat */
sessionEventSchema.statics.pruneCheckpoints = async function (roomId, max = 200) {
  const checkpoints = await this.find({ roomId, eventType: 'yjs_checkpoint' })
    .sort({ timestamp: -1 })
    .skip(max)
    .select('_id');
  if (checkpoints.length > 0) {
    await this.deleteMany({ _id: { $in: checkpoints.map((c) => c._id) } });
  }
};

export const SessionEvent = mongoose.model('SessionEvent', sessionEventSchema);

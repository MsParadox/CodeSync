import mongoose from 'mongoose';

// ── Snapshot: periodic saves of Yjs document state ───────────────
const snapshotSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  yjsState: { type: Buffer, required: true },   // Uint8Array encoded
  code: { type: String, default: '' },          // Plain text copy for search/display
  language: { type: String, default: 'javascript' },
  savedAt: { type: Date, default: Date.now, index: true },
  savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  triggerReason: {
    type: String,
    enum: ['periodic', 'room-empty', 'manual', 'shutdown'],
    default: 'periodic',
  },
});

snapshotSchema.index({ roomId: 1, savedAt: -1 });

// Keep only the last 20 snapshots per room (TTL via application logic)
snapshotSchema.statics.pruneOld = async function (roomId, keep = 20) {
  const latest = await this.find({ roomId })
    .sort({ savedAt: -1 })
    .skip(keep)
    .select('_id');
  if (latest.length > 0) {
    await this.deleteMany({ _id: { $in: latest.map((d) => d._id) } });
  }
};

export const Snapshot = mongoose.model('Snapshot', snapshotSchema);


// ── Execution: log of every code run ────────────────────────────
const executionSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  language: { type: String, required: true },
  code: { type: String, required: true, maxlength: 100000 },
  stdin: { type: String, default: '' },
  stdout: { type: String, default: '' },
  stderr: { type: String, default: '' },
  exitCode: { type: Number, default: 0 },
  executionTimeMs: { type: Number, default: 0 },
  memoryUsedKB: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['success', 'error', 'timeout', 'oom', 'compile_error', 'runtime_error'],
    default: 'success',
  },
  ranAt: { type: Date, default: Date.now, index: true },
});

executionSchema.index({ roomId: 1, ranAt: -1 });
executionSchema.index({ userId: 1, ranAt: -1 });
executionSchema.index({ ranAt: -1 }); // For global stats

export const Execution = mongoose.model('Execution', executionSchema);

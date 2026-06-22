import mongoose from 'mongoose';

// ── Practice Problem (Codeforces / LeetCode style, stdin-stdout) ──
const problemSchema = new mongoose.Schema(
  {
    slug:       { type: String, required: true, unique: true, index: true },
    title:      { type: String, required: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy', index: true },
    tags:       { type: [String], default: [], index: true },

    statement:   { type: String, default: '' },   // markdown
    inputFormat: { type: String, default: '' },
    outputFormat:{ type: String, default: '' },
    constraints: { type: String, default: '' },

    // Visible to everyone (used by "Run")
    samples: {
      type: [{ input: String, output: String, explanation: String }],
      default: [],
    },
    // Hidden — used by "Submit" judging only, never sent to clients
    hiddenTests: {
      type: [{ input: String, expectedOutput: String }],
      default: [],
    },
    // Optional starter code per language
    starterCode: { type: mongoose.Schema.Types.Mixed, default: {} },

    timeLimitMs: { type: Number, default: 5000 },

    // Aggregate stats
    submissions: { type: Number, default: 0 },
    accepted:    { type: Number, default: 0 },
    solvedBy:    { type: Number, default: 0 },   // distinct users who solved

    order: { type: Number, default: 0 },         // display order
  },
  { timestamps: true }
);

problemSchema.index({ difficulty: 1, order: 1 });

// Never leak hidden tests to clients
problemSchema.set('toJSON', {
  transform: (_, obj) => { delete obj.hiddenTests; delete obj.__v; return obj; },
});

export const Problem = mongoose.model('Problem', problemSchema);

// Deterministic neon color for each user based on their userId string
const NEON_PALETTE = [
  '#00d4ff', // electric cyan
  '#ff3d6a', // neon red/pink
  '#00ff9d', // neon green
  '#ffd600', // neon yellow
  '#ff6b35', // neon orange
  '#c77dff', // neon purple
  '#00f5ff', // light cyan
  '#ff4ec7', // hot pink
  '#69ff47', // lime green
  '#ffe600', // bright yellow
];

export function generateColor(userId) {
  // Create a simple hash from the userId string
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % NEON_PALETTE.length;
  return NEON_PALETTE[index];
}

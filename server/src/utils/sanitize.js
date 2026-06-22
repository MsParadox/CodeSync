// Sanitize chat messages — strip HTML tags to prevent XSS
export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

// Truncate code output to prevent stdout flooding
export function truncateOutput(output, maxBytes = 50000) {
  if (!output) return '';
  if (output.length <= maxBytes) return output;
  return output.slice(0, maxBytes) + '\n\n[... output truncated at 50KB ...]';
}

// Validate room ID format (UUID v4)
export function isValidRoomId(roomId) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return UUID_RE.test(roomId);
}

// Sanitize code before execution — just validate size
export function validateCode(code, maxLength = 100000) {
  if (typeof code !== 'string') return { valid: false, reason: 'Code must be a string' };
  if (code.length === 0) return { valid: false, reason: 'Code cannot be empty' };
  if (code.length > maxLength) return { valid: false, reason: `Code exceeds ${maxLength} character limit` };
  return { valid: true };
}

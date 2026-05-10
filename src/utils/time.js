/**
 * Convert seconds to human-readable string: "1h 30m", "45m", "2h".
 */
export function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Parse time string back to seconds. Accepts: "1h 30m", "1h", "45m", "90" (treated as minutes).
 * Returns null on unparseable input.
 */
export function parseTime(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;
  const hMatch = s.match(/(\d+)\s*h/i);
  const mMatch = s.match(/(\d+)\s*m/i);
  if (!hMatch && !mMatch) {
    const num = parseInt(s, 10);
    return isNaN(num) ? null : num * 60;
  }
  const h = hMatch ? parseInt(hMatch[1], 10) : 0;
  const m = mMatch ? parseInt(mMatch[1], 10) : 0;
  return (h * 3600) + (m * 60);
}

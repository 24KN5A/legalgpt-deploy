/**
 * Tracks chat response latency observed in THIS browser session only.
 * The backend doesn't expose historical latency stats, so we never invent
 * numbers -- we measure real round-trips the user actually made and label
 * it clearly as "this session" wherever it's displayed.
 */
const STORAGE_KEY = "legalgpt-session-latencies";

function readAll(): number[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export function recordLatency(ms: number) {
  const all = readAll();
  all.push(ms);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(-50)));
  } catch {
    /* storage unavailable, ignore */
  }
}

export function getAverageLatencyMs(): number | null {
  const all = readAll();
  if (all.length === 0) return null;
  return Math.round(all.reduce((a, b) => a + b, 0) / all.length);
}

export function getLatencySampleCount(): number {
  return readAll().length;
}

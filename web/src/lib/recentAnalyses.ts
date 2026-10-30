import type { SourceType, Summary } from "../api/types";

// Analyses started in this browser tab. Only IDs and display metadata are kept (no results);
// the server still decides ownership and expiry, so every entry is re-fetched when opened.
export interface RecentAnalysis {
  id: string;
  filename: string;
  source_type: SourceType;
  is_demo: boolean;
  created_at: string;
  expires_at: string;
}

const KEY = "sli.recentAnalyses";
const MAX = 8; // matches the server's retained-job cap
const listeners = new Set<() => void>();

export function readRecent(): RecentAnalysis[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentAnalysis[]) : [];
  } catch {
    return []; // storage blocked or corrupted: the switcher simply stays empty
  }
}

function write(list: RecentAnalysis[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore: switcher is a convenience only
  }
  listeners.forEach((l) => l());
}

export function rememberAnalysis(s: Summary) {
  const entry: RecentAnalysis = {
    id: s.analysis_id,
    filename: s.filename,
    source_type: s.source_type ?? "fortigate",
    is_demo: s.is_demo,
    created_at: s.created_at,
    expires_at: s.expires_at,
  };
  write([entry, ...readRecent().filter((r) => r.id !== s.analysis_id)].slice(0, MAX));
}

export function forgetAnalysis(id: string) {
  write(readRecent().filter((r) => r.id !== id));
}

export function subscribeRecent(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Uses the browser clock only to label entries; the server's 410/404 is authoritative. */
export function isPastExpiry(r: RecentAnalysis, now = Date.now()): boolean {
  const t = Date.parse(r.expires_at);
  return Number.isFinite(t) && t <= now;
}

// Hits arrive from two sources (the edge, and interactsh-client polling seconds later), so ingest
// order isn't time order. Sort by the capture time, to the nanosecond interactsh gives, then by id.
export const timeKey = (ts?: string | null) => String(ts ?? "").replace(/(T\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/, (_, hms, f = "") => `${hms}.${f.padEnd(9, "0").slice(0, 9)}Z`);
export const newestFirst = (a: { timestamp: string; id: number }, b: { timestamp: string; id: number }) => {
  const x = timeKey(a.timestamp), y = timeKey(b.timestamp);
  return x === y ? b.id - a.id : x < y ? 1 : -1;
};
// scrolling the selection into view on page load would scroll a phone past the composer
const BOOT = Date.now();
export const settled = () => Date.now() - BOOT > 2000;
export const isoMs = (ts?: string | null) => (ts ? Date.parse(String(ts).replace(/(\.\d{3})\d+/, "$1")) : NaN);
export const hms = (ts?: string | null) => (ts ? ts.slice(11, 19) : "");
export const hmsms = (ts?: string | null) => (ts ? ts.slice(11, 23) : "");
export const hm = (ts?: string | null) => (ts ? ts.slice(11, 16) : "");

export function dayOrTime(ts?: string | null) {
  const t = isoMs(ts);
  if (!t || !ts) return "";
  return Date.now() - t > 20 * 3600e3 ? `${ts.slice(5, 10)} ${hm(ts)}` : hm(ts);
}

export function ago(ms: number) {
  if (!(ms >= 0)) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function dur(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(m, 0)}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const lineCount = (s: string) => (s ? s.split(/\r?\n/).length : 0);
export const byteCount = (s: string) => new TextEncoder().encode(s || "").length;
// A deploy script as the operator runs it, by its path in this server's checkout.
export const deployCmd = (app: string | undefined, script: string) => `sudo ${app ?? "."}/deploy/${script}`;

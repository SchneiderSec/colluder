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
// Times are stored, exported, reported and copied as evidence in UTC, as the server records them. Settings >
// Display only changes how the dashboard shows them: UTC or this browser's zone, on a 24-hour or 12-hour
// clock (lib/display.ts sets both). Every displayed time goes through the helpers below.
let twelve = false, local = false;
export const setTwelveHour = (on: boolean) => { twelve = on; };
// where "YYYY-MM-DDTHH:MM:SS.mmm" stops for each precision
const upTo = (p: "min" | "s" | "ms") => ({ min: 16, s: 19, ms: 23 })[p];
export const setLocalZone = (on: boolean) => { local = on; };
export const isLocalZone = () => local;
// this browser's zone, short ("PST", "PDT" in summer) and long ("America/Los_Angeles")
export const browserZone = (ms = Date.now()) =>
  new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "local";
export const browserZoneId = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
// the shown zone's name, for labels; pass the time when it matters (PST or PDT)
export const zoneName = (ms = Date.now()) => (local ? browserZone(ms) : "UTC");
// an ISO timestamp's wall-clock digits in the shown zone ("YYYY-MM-DDTHH:MM:SS.mmm"); UTC is the string as stored
const wall = (ts: string) => {
  if (!local) return ts;
  const t = isoMs(ts);
  return Number.isFinite(t) ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 23) : ts;
};
// "HH:MM[:SS[.mmm]]" as the chosen clock: "08:05:09" or "8:05:09 AM"
export const clock = (t: string) => {
  if (!twelve || !/^\d\d:\d\d/.test(t)) return t;
  const h = +t.slice(0, 2);
  return `${h % 12 || 12}${t.slice(2)} ${h < 12 ? "AM" : "PM"}`;
};
export const hms = (ts?: string | null) => (ts ? clock(wall(ts).slice(11, upTo("s"))) : "");
export const hmsms = (ts?: string | null) => (ts ? clock(wall(ts).slice(11, upTo("ms"))) : "");
export const hm = (ts?: string | null) => (ts ? clock(wall(ts).slice(11, upTo("min"))) : "");
// the calendar day in the shown zone, "YYYY-MM-DD"
export const dayKey = (ts: string) => wall(ts).slice(0, 10);
// a full date and time with its zone: "2026-11-20 06:05 UTC" (to the minute), or to the second or millisecond
export const stamp = (ts: string, to: "min" | "s" | "ms" = "min") => `${dayKey(ts)} ${clock(wall(ts).slice(11, upTo(to)))} ${zoneName(isoMs(ts))}`;

// a hit's or a message's exact time, for a tooltip: as shown, then as stored when the page shows another zone
export const exact = (ts: string) => { const s = stamp(ts, "ms"); return s.endsWith(" UTC") ? s : `${s}\n${ts}`; };

// a day in the shown zone, for dividers: "Today", "Yesterday", "Thu, Nov 19" ("Nov 19, 2025" in another
// year); withDate adds the date to Today and Yesterday ("Yesterday · Sat, Nov 21")
export function dayLabel(ts: string, withDate = false, now = Date.now()) {
  const d = dayKey(ts), today = dayKey(new Date(now).toISOString()), y = dayKey(new Date(now - 864e5).toISOString());
  const zone = local ? undefined : "UTC";
  const date = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric", ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) }).format(new Date(isoMs(ts)));
  const near = d === today ? "Today" : d === y ? "Yesterday" : null;
  return near ? (withDate ? `${near} · ${date}` : near) : date;
}

export function dayOrTime(ts?: string | null) {
  const t = isoMs(ts);
  if (!t || !ts) return "";
  return Date.now() - t > 20 * 3600e3 ? `${dayKey(ts).slice(5)} ${hm(ts)}` : hm(ts);
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
// the one command that sets up (or finishes setting up) the server, run as the operator from anywhere
export const setupCmd = (app: string | undefined) => `${app ?? "."}/colluder setup`;

// The mailbox (PLAN-MAILBOX.md): one reserved tag. Mail to <anything>@mailbox-<short>.<domain> is
// stored as mail (lib/store.mjs, table mail): no Discord alert, nothing in the probe views, kept
// COLLUDER_MAIL_DAYS days. The local part names the account it was sent for.
export const MAILBOX_TAG = "mailbox";

const LOCAL_RE = /^[^\s@<>"]{1,200}$/;

// The query string of /api/mail and /api/mail/latest → { local, since, after, before, limit, wait } or { error }
export function mailQuery(sp) {
  const local = String(sp.get("local") ?? sp.get("to") ?? "").trim().toLowerCase();
  if (local && !LOCAL_RE.test(local)) return { error: "local: the part before the @, up to 200 characters." };
  let since = "";
  const s = sp.get("since");
  if (s) {
    // ISO 8601, or seconds back from now ("600s"), or Unix seconds
    const t = /^\d+s$/.test(s) ? Date.now() - Number(s.slice(0, -1)) * 1000 : /^\d{9,11}$/.test(s) ? Number(s) * 1000 : Date.parse(s);
    if (!Number.isFinite(t)) return { error: "since: an ISO 8601 time (2026-11-11T08:00:00Z), Unix seconds, or seconds back (600s)." };
    since = new Date(t).toISOString();
  }
  const int = (k, min, max) => { const v = sp.get(k); if (v === null || v === "") return undefined; const n = Number(v); return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : NaN; };
  const after = int("after", 0, Number.MAX_SAFE_INTEGER), before = int("before", 1, Number.MAX_SAFE_INTEGER);
  const limit = int("limit", 1, 200) ?? 50, wait = int("wait", 0, 60) ?? 0;
  if ([after, before, limit, wait].some((x) => Number.isNaN(x))) return { error: "after, before, limit and wait are whole numbers." };
  return { local, since, after, before, limit, wait };
}

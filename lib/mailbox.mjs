// The mailbox: one reserved tag. Mail to <anything>@mailbox-<short>.<domain> is
// stored as mail (lib/store.mjs, table mail): no Discord alert, nothing in the probe views, kept
// COLLUDER_MAIL_DAYS days. The local part names the account it was sent for.
export const MAILBOX_TAG = "mailbox";

const LOCAL_RE = /^[^\s@<>"]{1,200}$/;

// The body of POST /api/mail/delete → { ids } (the messages shown), { upTo } (everything up to the newest
// shown, so mail arriving while you confirm is kept), or { error }
export function mailDeleteRequest(b) {
  if (b?.all === true) {
    return Number.isSafeInteger(b.upTo) && b.upTo > 0 ? { upTo: b.upTo } : { error: "upTo: the id of the newest message to delete." };
  }
  const ids = Array.isArray(b?.ids) ? [...new Set(b.ids)] : [];
  if (!ids.length || ids.length > 5000 || !ids.every((n) => Number.isSafeInteger(n) && n > 0)) return { error: "ids: 1 to 5000 message ids, or all: true with upTo." };
  return { ids };
}

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

// ---------- the spool (edge.mjs deliverMail → server.mjs) ----------
// Two shapes: <id>.eml, one file per message, each recipient's log line carrying its own Received line
// and its part of parts; or <id>-<n>.eml from an older edge, one file per recipient, Received line in it.
export const SPOOL_NAME = /^[a-z0-9]{6,40}(-\d{1,3})?\.eml$/;
// what deliverMail's receivedLine() makes: three lines, the later two folded with a tab
export const receivedOk = (r) => typeof r === "string" && r.length <= 2048 && /^Received: [^\r\n]*\r\n(\t[^\r\n]*\r\n){0,4}$/.test(r);
// the message as stored for one recipient: its Received line, then the bytes the sender sent
export function storedMessage(m, fileBytes) {
  return receivedOk(m?.received) ? Buffer.concat([Buffer.from(m.received, "latin1"), fileBytes]) : fileBytes;
}
// whether this line is the last that needs the file (a shared file goes after its last recipient)
export function lastPart(m) {
  const shared = Number.isInteger(m?.parts) && m.parts > 1;
  return !shared || m.part === m.parts - 1;
}

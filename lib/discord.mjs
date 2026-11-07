// Discord alerts, per probe tag (PLAN-REVIEW3.md A1). An episode is a run of hits with less than
// 30 min between them. Posted immediately: the first hit of an episode, the first web/SMTP hit of an
// episode that was DNS only so far, a web/SMTP hit from a source IP this probe hasn't seen, and a hit
// on a retired probe (at most one per 10 min). Resolver chatter (a bare-id lookup within 10 s of a
// tagged hit) is never posted. Everything else is counted into a 60 s follow-up, never dropped.
// Everything interpolated from a request is attacker-controlled, so it is neutralised (no mentions,
// no markdown, no links) before posting.
const ROLLUP_MS = 60_000;
const QUIET_MS = 30 * 60_000;
const RETIRED_MS = 10 * 60_000;
const CHATTER_WAIT_MS = 10_000;

export function neutral(s, max = 120) {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[`*_~|>\\[\]()<@#:]/g, (c) => "\\" + c)
    .slice(0, max);
}

export class Discord {
  // clock/timer hooks exist for tests
  constructor({ url, dashboardUrl, log, now = Date.now, later = (fn, ms) => setTimeout(fn, ms).unref?.() }) {
    this.url = url || "";
    // which alerts post (lib/settings.mjs ALERT_KINDS); one turned off falls into the roll-up
    this.kinds = { first: true, escalation: true, source: true, late: true, rollup: true, check: true };
    this.dashboardUrl = dashboardUrl;
    this.log = log;
    this.now = now;
    this.later = later;
    this.eps = new Map();      // tag -> { lastAt, web, dns, sources:Set }
    this.rollups = new Map();  // tag -> { counts, label }
    this.retiredPost = new Map();
  }

  get available() { return Boolean(this.url); }

  // { ok, error }: Settings' test message reports it; alerts only log it
  async post(content) {
    if (!this.url) return { ok: false, error: "no webhook" };
    try {
      const r = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "Colluder", content, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) { this.log(`discord: HTTP ${r.status}`); return { ok: false, error: r.status === 404 ? "HTTP 404, the webhook was deleted or the URL is wrong" : r.status === 401 ? "HTTP 401, the token in the URL is wrong" : `HTTP ${r.status}` }; }
      return { ok: true };
    } catch (e) {
      this.log(`discord: ${e.message}`);
      return { ok: false, error: e.name === "TimeoutError" ? "no answer in 8 s" : e.message };
    }
  }

  // hit: list row. ctx: { prevHitAt, rdns, retired, sourceSeen, bareId, isChatter() }
  // A bare-id DNS lookup without a tag waits 10 s: the tagged hit it belongs to often lands after it.
  onHit(hit, ctx = {}) {
    if (!hit.tag && hit.protocol === "dns" && ctx.bareId && ctx.isChatter) {
      this.later(() => { if (!ctx.isChatter()) this.decide(hit, ctx); }, CHATTER_WAIT_MS);
      return;
    }
    this.decide(hit, ctx);
  }

  decide(hit, ctx) {
    const key = hit.tag || "(untagged)";
    const now = this.now();
    const web = hit.protocol !== "dns";
    const label = hit.tag ? `probe ${neutral(hit.tag, 40)}` : "an untagged payload";
    let ep = this.eps.get(key);
    const quietFor = ep ? now - ep.lastAt : ctx.prevHitAt ? now - Date.parse(ctx.prevHitAt) : Infinity;
    const first = quietFor >= QUIET_MS;
    if (!ep || first) ep = { lastAt: now, web: 0, dns: 0, sources: new Set() };
    const newSource = web && !ep.sources.has(hit.remoteAddress) && !ctx.sourceSeen;

    let why = null;
    if (ctx.retired) {
      if (now - (this.retiredPost.get(key) ?? -Infinity) >= RETIRED_MS) { why = "late"; this.retiredPost.set(key, now); }
    } else if (first) why = "first";
    else if (hit.tag && web && !ep.web) why = "escalation";
    else if (hit.tag && newSource) why = "source";
    if (why && !this.kinds[why]) why = null;

    const dnsBefore = ep.dns;
    ep.lastAt = now;
    if (web) { ep.web++; ep.sources.add(hit.remoteAddress); } else ep.dns++;
    this.eps.set(key, ep);

    if (!why) return this.count(key, label, hit.protocol);
    const who = neutral(hit.remoteAddress, 60) + (ctx.rdns ? ` (${neutral(ctx.rdns, 80)})` : "");
    const what = hit.protocol === "dns" ? neutral(hit.qType || "DNS", 10) + " lookup" : neutral(hit.summary, 90);
    const lead = {
      late: `Late ${hit.protocol.toUpperCase()} hit on retired ${label}`,
      first: `${hit.protocol.toUpperCase()} hit on ${label}`,
      escalation: `${hit.protocol.toUpperCase()} hit on ${label} after ${dnsBefore} DNS ${dnsBefore === 1 ? "lookup" : "lookups"}`,
      source: `${hit.protocol.toUpperCase()} hit on ${label} from a new source`,
    }[why];
    const link = this.dashboardUrl + (hit.tag ? `#probes/${encodeURIComponent(hit.tag)}/hits` : "#probes/unregistered");
    this.post(`${lead} from ${who}: ${what} (#${hit.id})\n${link}`);
  }

  // hits that don't post are counted and reported once a minute per probe
  count(key, label, protocol) {
    if (!this.kinds.rollup) return;
    let r = this.rollups.get(key);
    if (!r) {
      r = { counts: {}, label };
      this.rollups.set(key, r);
      this.later(() => this.flush(key), ROLLUP_MS);
    }
    r.counts[protocol] = (r.counts[protocol] || 0) + 1;
  }

  flush(key) {
    const r = this.rollups.get(key);
    this.rollups.delete(key);
    if (!r) return;
    const parts = Object.entries(r.counts).map(([p, n]) => `${n} ${p.toUpperCase()}`);
    if (parts.length) this.post(`${parts.join(", ")} more on ${r.label} in the last minute.`);
  }
}

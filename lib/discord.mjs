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

// Posts are embeds: a coloured bar for the protocol, a title that opens the probe in Colluder, and the
// source and request as fields. The one-line headline goes in content too, so phone notifications
// say what happened. Request text sits in inline code, where Discord renders no markdown, mentions
// or links; backticks inside it are swapped for a lookalike so it can't close the span early.
const INK = { dns: 0xc793c4, http: 0xe2643f, https: 0x8aa2ea, smtp: 0x62b08f }; // DESIGN.md protocol inks
const COLOR = { other: 0xb5ab9c, late: 0x9a9084, bad: 0xe8735a, ok: 0x62b08f, warn: 0xf2b33d };
export function code(s, max = 200) {
  let t = String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/`/g, "\u02cb").trim();
  if (t.length > max) t = t.slice(0, max - 1) + "\u2026";
  return "`" + (t || "(empty)") + "`";
}
const split = (summary) => { const s = String(summary ?? ""), k = s.indexOf(" · "); return k === -1 ? [s, ""] : [s.slice(0, k), s.slice(k + 3)]; };

// the outside check's change of state (selfcheck.mjs checkAlert has the plain text)
export function checkMessage(r, text, domain, dashboardUrl) {
  const on = domain ? ` on ${neutral(domain, 80)}` : "";
  const bad = r.steps.filter((s) => !s.ok);
  const embed = r.state === "failing"
    ? { color: COLOR.bad, description: "Payloads may not be reaching Colluder. A quiet probe proves nothing until this clears.", fields: bad.slice(0, 10).map((s) => ({ name: neutral(s.label, 120), value: neutral(s.detail, 300) || "failed" })) }
    : { color: r.state === "warn" ? COLOR.warn : COLOR.ok, description: r.warnings.length ? r.warnings.map((w) => neutral(w, 300)).join("\n") : "Every step passes again." };
  const head = r.state === "failing" ? "Outside check failing" : /passing again/.test(text) ? "Outside check passing again" : "Outside check warning";
  return { text, content: `**${head}**${on}`, embeds: [{ ...embed, url: dashboardUrl + "#settings", title: "Open Settings in Colluder", timestamp: new Date().toISOString() }] };
}

export const testMessage = (dashboardUrl) => ({
  text: "Test from Colluder Settings",
  content: "**Test from Colluder Settings**",
  embeds: [{
    color: INK.https, title: "Alerts reach this channel", url: dashboardUrl + "#settings",
    description: "Hits post like this. The bar is the protocol's colour (DNS, HTTP, HTTPS, SMTP), and the title opens the probe in Colluder.",
    fields: [{ name: "Source", value: code("203.0.113.7"), inline: true }, { name: "Reverse DNS", value: "example.net", inline: true }, { name: "Request", value: code("GET /example HTTP/1.1") }],
    timestamp: new Date().toISOString(),
  }],
});

export class Discord {
  // clock/timer hooks exist for tests
  constructor({ url, dashboardUrl, log, now = Date.now, later = (fn, ms) => setTimeout(fn, ms).unref?.() }) {
    this.url = url || "";
    this.avatarUrl = null; // set by loadAvatar()
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
  // msg: a string, or { content, embeds } (text is for logs and tests, never sent). Every message
  // carries the avatar itself, and every card signs off with it in the footer: Discord folds a burst of
  // messages under the first one's header, so without that a grouped hit shows no raccoon at all.
  // wait: Discord answers with the message it stored (the Settings test reports from it).
  async post(msg, { wait = false } = {}) {
    if (!this.url) return { ok: false, error: "no webhook" };
    const { content, embeds } = typeof msg === "string" ? { content: msg } : msg;
    const footer = { text: "Colluder", ...(this.avatarUrl ? { icon_url: this.avatarUrl } : {}) };
    try {
      const r = await fetch(wait ? `${this.url}?wait=true` : this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "Colluder", ...(this.avatarUrl ? { avatar_url: this.avatarUrl } : {}),
          content, embeds: embeds?.map((e) => ({ ...e, footer })), allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) { this.log(`discord: HTTP ${r.status}`); return { ok: false, error: r.status === 404 ? "HTTP 404, the webhook was deleted or the URL is wrong" : r.status === 401 ? "HTTP 401, the token in the URL is wrong" : `HTTP ${r.status}` }; }
      if (wait) { const m = await r.json().catch(() => ({})); return { ok: true, avatar: !!m.author?.avatar, id: m.id ?? null }; }
      return { ok: true };
    } catch (e) {
      this.log(`discord: ${e.message}`);
      return { ok: false, error: e.name === "TimeoutError" ? "no answer in 8 s" : e.message };
    }
  }

  // the webhook's own name and avatar (the raccoon mask). Discord can't fetch an image from this
  // tailnet-only box, so it's sent as data; the webhook URL's token is what allows the change.
  async setIdentity(png) {
    if (!this.url) return { ok: false, error: "no webhook" };
    try {
      const r = await fetch(this.url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Colluder", avatar: `data:image/png;base64,${png.toString("base64")}` }),
        signal: AbortSignal.timeout(10_000),
      });
      return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` };
    } catch (e) { return { ok: false, error: e.name === "TimeoutError" ? "no answer in 10 s" : e.message }; }
  }

  // where Discord hosts the webhook's avatar once it's set: public, so messages can point at it
  async loadAvatar() {
    if (!this.url) return (this.avatarUrl = null);
    try {
      const r = await fetch(this.url, { signal: AbortSignal.timeout(10_000) });
      const j = r.ok ? await r.json() : {};
      this.avatarUrl = /^\d+$/.test(j.id ?? "") && /^[a-f0-9_]+$/.test(j.avatar ?? "") ? `https://cdn.discordapp.com/avatars/${j.id}/${j.avatar}.png?size=128` : null;
    } catch { this.avatarUrl = null; }
    return this.avatarUrl;
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
    const P = `**${neutral(hit.protocol.toUpperCase(), 10)}**`, probe = hit.tag ? `**${neutral(hit.tag, 40)}**` : "an untagged payload";
    const content = {
      late: `Late ${P} hit on retired ${probe}`,
      first: `${P} hit on ${probe}`,
      escalation: `${P} hit on ${probe}, after ${dnsBefore} DNS ${dnsBefore === 1 ? "lookup" : "lookups"}`,
      source: `${P} hit on ${probe} from a new source`,
    }[why];
    const fields = [{ name: "Source", value: code(hit.remoteAddress, 60), inline: true }];
    if (ctx.rdns) fields.push({ name: "Reverse DNS", value: code(ctx.rdns, 120), inline: true });
    if (hit.protocol === "dns") fields.push({ name: "Lookup", value: code(hit.summary || hit.qType || "DNS", 200) });
    else {
      const [req, ua] = split(hit.summary);
      fields.push({ name: hit.protocol === "smtp" ? "Message" : "Request", value: code(req, 300) });
      if (ua) fields.push({ name: "User-Agent", value: code(ua, 200) });
    }
    this.post({
      text: `${lead} from ${who}: ${what} (#${hit.id})\n${link}`,
      content,
      embeds: [{
        color: why === "late" ? COLOR.late : INK[hit.protocol] ?? COLOR.other,
        title: `${hit.tag ? neutral(hit.tag, 40) : "Untagged"} · hit #${hit.id}`, url: link,
        fields, timestamp: hit.timestamp || new Date(now).toISOString(),
      }],
    });
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
    if (!parts.length) return;
    const probe = r.label.startsWith("probe ") ? `**${r.label.slice(6)}**` : r.label;
    this.post({ text: `${parts.join(", ")} more on ${r.label} in the last minute.`, content: `${parts.join(", ")} more on ${probe} in the last minute` });
  }
}

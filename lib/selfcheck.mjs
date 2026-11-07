// The outside check: every few minutes, send a callback the way a target would and confirm Colluder
// recorded it. The edge's heartbeat only says the edge process is alive; it can't see interactsh's DNS
// going quiet behind it (the query is dropped, nothing is counted), a broken delegation, or a
// certificate or domain about to lapse. Each of those turns every payload dark with the dashboard
// still green, and "no callback" then reads as "not vulnerable".
//
// What it proves, step by step:
//   dns:<resolver>  a fresh name (never cached) asked of a public resolver comes back with the box's
//                   IP, and the edge recorded the lookup: the internet path, end to end
//   http, https     a request to the box's public address is answered and recorded. Sent from this
//                   box, so it proves the edge and the certificate, not the firewall in front of it
//   cert, domain    days until the certificate and the domain registration lapse
// Its traffic uses the reserved tag colluder-check and is never stored as hits.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { randomBytes } from "node:crypto";

export const CHECK_TAG = "colluder-check";
export const RESOLVERS = [{ ip: "1.1.1.1", name: "Cloudflare" }, { ip: "8.8.8.8", name: "Google" }];
const DAY = 86400e3;
export const WARN_DAYS = { cert: 21, domain: 30 };

const nonce = () => "c" + [...randomBytes(9)].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

// ---- the default transports (tests pass their own) ----
async function resolve4(server, name, timeoutMs) {
  const r = new dns.promises.Resolver({ timeout: timeoutMs, tries: 1 });
  r.setServers([server]);
  return r.resolve4(name);
}
function webGet({ scheme, ip, host, path, timeoutMs }) {
  return new Promise((ok, no) => {
    const lib = scheme === "https" ? https : http;
    const req = lib.request({
      host: ip, port: scheme === "https" ? 443 : 80, path, method: "GET", agent: false,
      headers: { host, "user-agent": "Colluder outside check", connection: "close" },
      ...(scheme === "https" ? { servername: host, rejectUnauthorized: true } : {}),
      timeout: timeoutMs,
    }, (res) => {
      const cert = scheme === "https" ? res.socket.getPeerCertificate?.() : null;
      res.resume();
      res.on("end", () => ok({ status: res.statusCode, certValidTo: cert?.valid_to || null }));
    });
    req.on("timeout", () => req.destroy(new Error(`no answer in ${timeoutMs / 1000} s`)));
    req.on("error", no);
    req.end();
  });
}
async function rdapExpiry(domain) {
  const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/rdap+json", "user-agent": "Colluder outside check" } }); // rdap.org refuses fetch's default agent (403)
  if (!r.ok) throw new Error(`RDAP HTTP ${r.status}`);
  const j = await r.json();
  const ev = (j.events || []).find((e) => e.eventAction === "expiration");
  if (!ev) throw new Error("RDAP has no expiration date");
  return ev.eventDate;
}

const daysLeft = (iso, now) => Math.floor((Date.parse(iso) - now) / DAY);

export class OutsideCheck {
  constructor({ domain, shortId, publicIp, log = () => {}, onResult = () => {}, now = Date.now,
    waitMs = 8000, timeoutMs = 5000, retryMs = 60_000, resolvers = RESOLVERS,
    transport = { resolve4, webGet, rdapExpiry }, last = null } = {}) {
    Object.assign(this, { domain, shortId, publicIp, log, onResult, now, waitMs, timeoutMs, retryMs, resolvers, transport });
    this.host = `${CHECK_TAG}-${shortId}.${domain}`;
    this.waiting = new Map(); // nonce -> resolve(record)
    this.last = last;         // the latest result, also kept across restarts by the caller
    this.running = null;
    this.domainExpiry = last?.domain ?? null; // { expiresAt, checkedAt } | { error, checkedAt }
  }

  // ingest hands over every record carrying the check's tag; true when it was one we were waiting for
  saw(it) {
    for (const [n, done] of this.waiting) {
      if (it.fullId.includes(n) || it.rawRequest.includes(`/${n}`)) { done(it); return true; }
    }
    return false;
  }
  recorded(n) {
    return new Promise((ok) => {
      const t = setTimeout(() => { this.waiting.delete(n); ok(null); }, this.waitMs);
      t.unref?.();
      this.waiting.set(n, (it) => { clearTimeout(t); this.waiting.delete(n); ok(it); });
    });
  }

  async stepDns(r) {
    const n = nonce(), name = `${n}.${this.host}`;
    const seen = this.recorded(n);
    let ips = null, err = null;
    try { ips = await this.transport.resolve4(r.ip, name, this.timeoutMs); } catch (e) { err = e.code || e.message; }
    const rec = await seen;
    const right = ips?.includes(this.publicIp);
    const ok = !!(right && rec);
    const detail = ok ? `answered ${this.publicIp}; the edge recorded the lookup from ${rec.remoteAddress}`
      : !ips ? `no answer (${err}): payload names may not resolve for targets`
      : !right ? `answered ${ips.join(", ") || "nothing"}, not this box (${this.publicIp})`
      : "answered, but the edge did not record the lookup: DNS hits would be missing";
    return { key: `dns:${r.ip}`, label: `DNS via ${r.name} (${r.ip})`, ok, detail };
  }

  async stepWeb(scheme) {
    const n = nonce();
    const seen = this.recorded(n);
    let res = null, err = null;
    try { res = await this.transport.webGet({ scheme, ip: this.publicIp, host: this.host, path: `/${n}`, timeoutMs: this.timeoutMs }); }
    catch (e) { err = e.code === "CERT_HAS_EXPIRED" ? "the certificate has expired" : /altname|hostname/i.test(e.message) ? "the certificate doesn't cover this name" : e.code || e.message; }
    const rec = res ? await seen : (this.waiting.delete(n), null);
    const ok = !!(res && rec);
    const detail = ok ? `answered ${res.status}; recorded`
      : !res ? `failed: ${err}`
      : `answered ${res.status}, but the edge did not record it: ${scheme.toUpperCase()} hits would be missing`;
    return { key: scheme, label: scheme === "https" ? "HTTPS (from this box)" : "HTTP (from this box)", ok, detail, certValidTo: res?.certValidTo ?? null };
  }

  async domainStep() {
    const now = this.now();
    // RDAP once a day is plenty: the date moves only when someone renews
    if (!this.domainExpiry || now - Date.parse(this.domainExpiry.checkedAt) > DAY || this.domainExpiry.error) {
      try { this.domainExpiry = { expiresAt: await this.transport.rdapExpiry(this.domain), checkedAt: new Date(now).toISOString() }; }
      catch (e) { this.domainExpiry = { error: e.message, checkedAt: new Date(now).toISOString() }; }
    }
    return this.domainExpiry;
  }

  async once(only = null) {
    const steps = [];
    for (const r of this.resolvers) if (!only || only.has(`dns:${r.ip}`)) steps.push(this.stepDns(r));
    for (const s of ["http", "https"]) if (!only || only.has(s)) steps.push(this.stepWeb(s));
    return Promise.all(steps);
  }

  // one full run; a failed step is retried once after retryMs so a dropped packet doesn't page you
  run() {
    if (this.running) return this.running;
    this.running = (async () => {
      const startedAt = new Date(this.now()).toISOString();
      let steps = await this.once();
      const failed = new Set(steps.filter((s) => !s.ok).map((s) => s.key));
      if (failed.size && this.retryMs > 0) {
        await new Promise((ok) => setTimeout(ok, this.retryMs).unref?.());
        const again = await this.once(failed);
        steps = steps.map((s) => (s.ok ? s : { ...again.find((a) => a.key === s.key), retried: true }));
      }
      const domain = await this.domainStep();
      const now = this.now();
      const certValidTo = steps.find((s) => s.key === "https")?.certValidTo ?? this.last?.cert?.validTo ?? null;
      const cert = certValidTo ? { validTo: new Date(certValidTo).toISOString(), days: daysLeft(certValidTo, now) } : null;
      const dom = domain?.expiresAt ? { ...domain, days: daysLeft(domain.expiresAt, now) } : domain;
      const warnings = [];
      if (cert && cert.days < WARN_DAYS.cert) warnings.push(cert.days < 0 ? "The certificate has expired: HTTPS payloads fail." : `The certificate expires in ${cert.days} days (${cert.validTo.slice(0, 10)}).`);
      if (dom?.days != null && dom.days < WARN_DAYS.domain) warnings.push(dom.days < 0 ? `${this.domain} has expired: every payload is dead.` : `${this.domain} expires in ${dom.days} days (${dom.expiresAt.slice(0, 10)}): renew it, or confirm it renews on its own.`);
      const state = steps.some((s) => !s.ok) ? "failing" : warnings.length ? "warn" : "ok";
      const result = { state, startedAt, finishedAt: new Date(now).toISOString(), host: this.host, steps: steps.map(({ certValidTo: _, ...s }) => s), cert, domain: dom, warnings };
      const before = this.last?.state;
      this.last = result;
      this.onResult(result, before);
      return result;
    })().finally(() => { this.running = null; });
    return this.running;
  }
}

// the Discord line for a change of state (null: nothing worth a post)
export function checkAlert(result, before) {
  if (result.state === before) return null;
  const bad = result.steps.filter((s) => !s.ok);
  if (result.state === "failing") return `Outside check failing. ${bad.map((s) => `${s.label}: ${s.detail}`).join(". ")}. Payloads may not be reaching Colluder; a quiet probe proves nothing until this clears.`;
  if (before === "failing") return `Outside check passing again${result.warnings.length ? `, with a warning: ${result.warnings.join(" ")}` : "."}`;
  if (result.state === "warn") return `Outside check warning: ${result.warnings.join(" ")}`;
  return null;
}

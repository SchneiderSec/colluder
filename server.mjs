#!/usr/bin/env node
// Colluder collector + UI. Tails the interactsh-client JSONL, stores interactions in SQLite,
// and serves the single-page UI, a JSON API and a Server-Sent Events stream.
// No secrets in this file: DISCORD_WEBHOOK_URL is read from the environment at runtime.
import http from "node:http";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { Store } from "./lib/store.mjs";
import { Tail } from "./lib/tail.mjs";
import { Engine } from "./lib/engine.mjs";
import { parseInteraction, summarize, TAG_RE } from "./lib/tag.mjs";
import { reverseDns, asnLookup } from "./lib/enrich.mjs";
import { Discord } from "./lib/discord.mjs";
import { validateHttpRule, respond, serialize, describeRule } from "./lib/rules.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const DATA = env.COLLUDER_DATA || join(homedir(), ".local/share/colluder");
const CFG = {
  host: env.COLLUDER_HOST || "100.64.0.10",
  port: Number(env.COLLUDER_PORT || 8090),
  domain: env.COLLUDER_DOMAIN || "oob.example",
  jsonl: env.COLLUDER_JSONL || join(DATA, "interactions.jsonl"),
  edgeJsonl: env.COLLUDER_EDGE_LOG || join(DATA, "edge.jsonl"),
  rulesFile: env.COLLUDER_RULES || join(DATA, "rules.json"),
  edgeStatus: env.COLLUDER_EDGE_STATUS || join(DATA, "edge.status.json"),
  payloadFile: env.COLLUDER_PAYLOAD_FILE || join(DATA, "payload.txt"),
  db: env.COLLUDER_DB || join(DATA, "colluder.db"),
  unit: env.COLLUDER_ENGINE_UNIT || "colluder-engine.service",
  clientBin: env.COLLUDER_CLIENT_BIN || join(homedir(), "go/bin/interactsh-client"),
  extraHosts: (env.COLLUDER_ALLOWED_HOSTS || "box.tailnet.ts.net,user").split(",").map((s) => s.trim()).filter(Boolean),
};
const PUBLIC_URL = env.COLLUDER_PUBLIC_URL || `http://${CFG.host}:${CFG.port}/`;
const ALLOWED_HOSTS = new Set([CFG.host, ...CFG.extraHosts, "127.0.0.1", "localhost"].map((h) => `${h}:${CFG.port}`.toLowerCase()));

const log = (...a) => console.log(new Date().toISOString(), ...a);
const nowIso = () => new Date().toISOString();

await mkdir(dirname(CFG.db), { recursive: true });
const store = new Store(CFG.db);
// v2: HTTP(S) summaries carry the User-Agent
store.resummarize("2", (r) => (r.protocol === "http" || r.protocol === "https")
  ? summarize(r.protocol, { "raw-request": r.rawRequest }, CFG.domain) : null);
const engine = new Engine({ unit: CFG.unit, payloadFile: CFG.payloadFile, clientBin: CFG.clientBin, domain: CFG.domain });
const discord = new Discord({ url: env.DISCORD_WEBHOOK_URL, dashboardUrl: PUBLIC_URL, log });
const clients = new Set();
let live = false; // false while backfilling, so old lines never trigger alerts
const tailStatus = () => tail.status;

// ---------- SSE ----------
function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(event, data) {
  for (const res of clients) send(res, event, data);
}

// ---------- ingest ----------
function ingest(line, source = "engine") {
  let obj;
  try { obj = JSON.parse(line); } catch { log("skip: not JSON"); return; }
  const it = parseInteraction(obj, CFG.domain, { trusted: source === "edge" });
  const receivedAt = nowIso();
  const res = store.insert(line, it, receivedAt);
  if (!res) return;
  const { row, probeCreated } = res;
  if (!live) return;
  broadcast("interaction", row);
  if (probeCreated || row.tag) broadcast("probe", probeOut(row.tag));
  else broadcast("untagged", store.probes().untagged);
  enrichRdns(row.remoteAddress).then((rdns) => {
    if (discordEnabled()) discord.onHit(row, store.priorHitForTag(row.tag, row.id), rdns);
  });
}

const rdnsInflight = new Map();
function enrichRdns(ip) {
  const known = store.enrich(ip);
  if (known && known.rdnsAt) return Promise.resolve(known.rdns);
  if (rdnsInflight.has(ip)) return rdnsInflight.get(ip);
  const p = reverseDns(ip).then((name) => {
    if (name !== null) {
      store.setRdns(ip, name, nowIso());
      broadcast("enrich", store.enrich(ip));
    }
    rdnsInflight.delete(ip);
    return name;
  });
  rdnsInflight.set(ip, p);
  return p;
}

const discordEnabled = () => discord.available && store.meta("discord") !== "off";

// ---------- status ----------
let lastPayloadCid = store.meta("correlation_id");
async function statusTick() {
  const s = await engine.check();
  const p = engine.payload;
  if (p && p.correlationId !== lastPayloadCid) {
    if (lastPayloadCid) {
      store.meta("correlation_changed_at", nowIso());
      store.meta("previous_correlation_id", lastPayloadCid);
      log(`correlation id changed: ${lastPayloadCid} -> ${p.correlationId}`);
    }
    store.meta("correlation_id", p.correlationId);
    lastPayloadCid = p.correlationId;
    await publishRules(); // the edge answers every correlation id this dashboard has used
  }
  await readEdgeStatus();
  broadcast("status", statusPayload());
  return s;
}
function statusPayload() {
  return {
    engine: engine.status,
    payload: engine.payload,
    correlationChangedAt: store.meta("correlation_changed_at"),
    lastHitAt: store.lastHitAt(),
    serverTime: nowIso(),
    log: { path: CFG.jsonl, ...tailStatus() },
    discord: { available: discord.available, enabled: discordEnabled() },
    lastClear: store.lastClear(),
    edge: edgeStatus,
  };
}

// ---------- edge (phase 2) ----------
// The edge reads rules.json and writes edge.status.json; this side owns the rules.
function knownCids() {
  const list = JSON.parse(store.meta("known_cids") || "[]");
  for (const c of [store.meta("correlation_id"), store.meta("previous_correlation_id")]) if (c && !list.includes(c)) list.push(c);
  if (JSON.stringify(list) !== store.meta("known_cids")) store.meta("known_cids", JSON.stringify(list));
  return list;
}
async function publishRules() {
  const rules = {};
  for (const [tag, r] of Object.entries(store.activeRules())) if (r.rule.mode !== "default") rules[tag] = { version: r.version, rule: r.rule };
  const body = JSON.stringify({ generatedAt: nowIso(), domain: CFG.domain, cids: knownCids(), rules }, null, 1);
  const tmp = CFG.rulesFile + ".tmp";
  await writeFile(tmp, body, { mode: 0o600 });
  await rename(tmp, CFG.rulesFile); // atomic: the edge never reads half a file
}

let edgeStatus = { state: "absent" };
async function readEdgeStatus() {
  try {
    const s = JSON.parse(await readFile(CFG.edgeStatus, "utf8"));
    const age = Date.now() - Date.parse(s.heartbeatAt);
    const state = s.stopped ? "stopped" : age > 20_000 ? "stale" : "running";
    edgeStatus = { state, listen: s.listen, cert: s.cert, heartbeatAt: s.heartbeatAt, startedAt: s.startedAt, own: s.own, relayed: s.relayed, errors: s.errors };
  } catch (e) {
    edgeStatus = { state: e.code === "ENOENT" ? "absent" : "unreadable", detail: e.code === "ENOENT" ? undefined : e.message };
  }
}

// probes carry their active HTTP rule (what the tab label and list line show)
const activeRules = () => store.activeRules();
function decorate(p, rules = activeRules()) {
  if (!p) return p;
  const r = rules[p.tag];
  return { ...p, httpRule: r && r.rule.mode !== "default" ? { version: r.version, mode: r.rule.mode, createdAt: r.createdAt, ...describeRule(r.rule, CFG.domain) } : null };
}
const probeOut = (tag) => decorate(store.probe(tag));

function previewRequest(tag, scheme, hop) {
  const host = engine.payload?.host || `${"x".repeat(33)}.${CFG.domain}`;
  const id = host.split(".")[0];
  const q = hop > 1 ? `?hop=${hop}` : "";
  return scheme === "https"
    ? { scheme, method: "GET", target: `/${tag}/${q}`, host, uniqueId: id, domain: CFG.domain }
    : { scheme, method: "GET", target: `/${q}`, host: `${tag}.${host}`, uniqueId: id, domain: CFG.domain };
}

// ---------- HTTP ----------
// The UI is a Vite build (web/ → web/dist). Only these shapes are served; nothing else on disk is reachable.
const DIST = join(HERE, "web", "dist");
const ASSET_RE = /^\/assets\/([A-Za-z0-9_-]+\.(js|css))$/;
const FONT_RE = /^\/fonts\/([a-z0-9-]+\.woff2)$/;
const TYPES = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8" };
const csp = (nonce) => `default-src 'self'; img-src 'self' data:; style-src 'self'${nonce ? ` 'nonce-${nonce}'` : ""}; font-src 'self'; ` +
  "connect-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const CSP = csp(null);

function head(res, code, type, extra = {}) {
  res.writeHead(code, {
    "content-type": type,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": CSP,
    "cache-control": "no-store",
    ...extra,
  });
}
const IMMUTABLE = { "cache-control": "public, max-age=31536000, immutable" };
async function sendFile(res, path, type, extra, transform) {
  let buf;
  try { buf = await readFile(path); } catch (e) {
    if (e.code !== "ENOENT") throw e;
    return json(res, 404, { error: path.endsWith("index.html") ? "UI not built: run npm run build in tools/oob-dashboard" : "not found" });
  }
  head(res, 200, type, extra);
  res.end(transform ? transform(buf) : buf);
}
function json(res, code, data) {
  head(res, code, "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
async function body(req, max = 64 * 1024) {
  const chunks = [];
  let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new Error("body too large"); chunks.push(c); }
  if (!n) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function guard(req, res) {
  // DNS-rebinding defence: only answer for the names we are actually served under.
  const hostHdr = String(req.headers.host || "").toLowerCase();
  if (!ALLOWED_HOSTS.has(hostHdr)) { json(res, 421, { error: "unexpected Host header" }); return false; }
  if (req.method !== "GET" && req.method !== "HEAD") {
    // CSRF defence: JSON only (forces a CORS preflight cross-origin), and same-origin when Origin is sent.
    const ct = String(req.headers["content-type"] || "");
    const origin = req.headers.origin;
    if (!ct.startsWith("application/json")) { json(res, 415, { error: "JSON body required" }); return false; }
    if (origin && !ALLOWED_HOSTS.has(origin.replace(/^https?:\/\//, "").toLowerCase())) {
      json(res, 403, { error: "cross-origin request refused" }); return false;
    }
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const url = new URL(req.url, "http://x");
    const p = url.pathname;

    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      // fresh nonce per page load, for the one <style> tag Radix's scroll lock adds (scripts stay 'self' only)
      const nonce = randomBytes(16).toString("base64");
      return sendFile(res, join(DIST, "index.html"), "text/html; charset=utf-8", { "content-security-policy": csp(nonce) },
        (buf) => buf.toString("utf8").replace("__CSP_NONCE__", nonce));
    }
    const am = ASSET_RE.exec(p);
    if (req.method === "GET" && am) { // content-hashed by Vite, so cache forever
      return sendFile(res, join(DIST, "assets", am[1]), TYPES[am[2]], IMMUTABLE);
    }
    const fm = FONT_RE.exec(p);
    if (req.method === "GET" && fm) {
      return sendFile(res, join(DIST, "fonts", fm[1]), "font/woff2", IMMUTABLE);
    }

    if (req.method === "GET" && p === "/api/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
        connection: "keep-alive",
      });
      res.write("retry: 2000\n\n");
      send(res, "status", statusPayload());
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "GET" && p === "/api/state") {
      const { probes, untagged } = store.probes();
      const rules = activeRules();
      return json(res, 200, { status: statusPayload(), probes: probes.map((p) => decorate(p, rules)), untagged, interactions: store.recent(2000) });
    }
    if (req.method === "GET" && p === "/api/payload") {
      const pl = engine.payload;
      return pl ? json(res, 200, pl) : json(res, 503, { error: engine.status.detail, engine: engine.status });
    }
    let m;
    if (req.method === "GET" && (m = /^\/api\/interactions\/(\d+)$/.exec(p))) {
      const it = store.interaction(Number(m[1]));
      if (!it) return json(res, 404, { error: "no such interaction" });
      if (!it.enrich || !it.enrich.rdnsAt) enrichRdns(it.remoteAddress); // backfilled rows: resolve lazily, arrives as an "enrich" event
      return json(res, 200, it);
    }
    if (req.method === "POST" && p === "/api/probes") {
      const b = await body(req);
      const tag = String(b.tag || "").trim().toLowerCase();
      if (!TAG_RE.test(tag)) return json(res, 400, { error: "Tag must be 1–32 letters, digits or hyphens, not starting or ending with a hyphen." });
      store.plant(tag, String(b.target || "").slice(0, 300), "callback", nowIso());
      const probe = probeOut(tag);
      broadcast("probe", probe);
      return json(res, 200, probe);
    }
    if (req.method === "PATCH" && (m = /^\/api\/probes\/([a-z0-9-]+)$/.exec(p))) {
      const b = await body(req);
      if (!store.probe(m[1])) return json(res, 404, { error: "no such probe" });
      let probe = store.editProbe(m[1], {
        target: b.target === undefined ? undefined : String(b.target).slice(0, 300),
        note: b.note === undefined ? undefined : String(b.note).slice(0, 2000),
      });
      if (b.retired !== undefined) probe = store.retire(m[1], b.retired ? nowIso() : null);
      probe = decorate(probe);
      broadcast("probe", probe);
      return json(res, 200, probe);
    }
    if (req.method === "GET" && (m = /^\/api\/probes\/([a-z0-9-]+)\/http-rule$/.exec(p))) {
      if (!store.probe(m[1])) return json(res, 404, { error: "no such probe" });
      return json(res, 200, { active: activeRules()[m[1]] || null, ...store.ruleHistory(m[1]), edge: edgeStatus });
    }
    if (req.method === "POST" && (m = /^\/api\/probes\/([a-z0-9-]+)\/http-rule(\/preview)?$/.exec(p))) {
      if (!store.probe(m[1])) return json(res, 404, { error: "no such probe" });
      const b = await body(req, 512 * 1024);
      const v = validateHttpRule(b.rule);
      if (v.error && m[2]) return json(res, 200, { error: v.error }); // preview: an unfinished draft is not a failed request
      if (v.error) return json(res, 400, { error: v.error });
      if (m[2]) { // preview: the same code the edge runs, for the probe's own payload host
        const hop = Math.min(Math.max(Number(b.hop) || 1, 1), 99);
        const r = respond(v.rule, (activeRules()[m[1]]?.version || 0) + 1, previewRequest(m[1], b.scheme === "https" ? "https" : "http", hop));
        return json(res, 200, { raw: serialize(r).toString("utf8"), answer: r.answer, delayMs: r.delayMs });
      }
      const saved = store.saveRule(m[1], v.rule, nowIso());
      await publishRules();
      log(`rule saved: ${m[1]} v${saved.version} (${v.rule.mode})`);
      broadcast("probe", probeOut(m[1]));
      return json(res, 200, { active: saved, ...store.ruleHistory(m[1]), edge: edgeStatus });
    }
    if (req.method === "POST" && (m = /^\/api\/enrich\/([0-9a-fA-F:.]+)\/asn$/.exec(p))) {
      try {
        const a = await asnLookup(m[1]);
        store.setAsn(m[1], a, nowIso());
        const e = store.enrich(m[1]);
        broadcast("enrich", e);
        return json(res, 200, e);
      } catch (e) {
        return json(res, 502, { error: `ASN lookup failed: ${e.message}` });
      }
    }
    if (req.method === "POST" && p === "/api/clear") {
      const n = store.clearAll(nowIso());
      broadcast("reload", { reason: "cleared", count: n });
      return json(res, 200, { cleared: n });
    }
    if (req.method === "POST" && p === "/api/restore") {
      const n = store.restoreLastClear();
      broadcast("reload", { reason: "restored", count: n });
      return json(res, 200, { restored: n });
    }
    if (req.method === "POST" && p === "/api/settings") {
      const b = await body(req);
      if (typeof b.discord === "boolean") store.meta("discord", b.discord ? "on" : "off");
      broadcast("status", statusPayload());
      return json(res, 200, statusPayload().discord);
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    log("request error:", e.message);
    if (!res.headersSent) json(res, e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? "invalid JSON" : "internal error" });
    else res.end();
  }
});

// ---------- boot ----------
const tail = new Tail(CFG.jsonl, {
  onLine: (l) => ingest(l, "engine"),
  onError: (e) => log("ingest error:", e.message),
  getState: () => JSON.parse(store.meta("tail") || "null"),
  setState: (s) => store.meta("tail", JSON.stringify(s)),
});

// the edge's own record of the hits it answered (phase 2); absent until the edge runs
const edgeTail = new Tail(CFG.edgeJsonl, {
  onLine: (l) => ingest(l, "edge"),
  onError: (e) => log("edge ingest error:", e.message),
  getState: () => JSON.parse(store.meta("tail_edge") || "null"),
  setState: (s) => store.meta("tail_edge", JSON.stringify(s)),
});

await engine.init();
await tail.start();           // backfill whatever the engine wrote while we were down
await edgeTail.start();
await publishRules();
live = true;
await statusTick();
setInterval(statusTick, 5000).unref();
setInterval(() => { for (const res of clients) res.write(": keep-alive\n\n"); }, 15000).unref();

server.listen(CFG.port, CFG.host, () => log(`colluder listening on http://${CFG.host}:${CFG.port} (log ${CFG.jsonl})`));
const shutdown = () => { tail.stop(); edgeTail.stop(); for (const r of clients) r.end(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

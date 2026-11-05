#!/usr/bin/env node
// Colluder edge: the public HTTP/HTTPS front door (see PHASE2.md).
//   - Requests whose Host carries Colluder's correlation id are answered here, by the probe's rule or
//     interactsh's default reply, and recorded byte-for-byte in edge.jsonl.
//   - Everything else is relayed to interactsh-server on its internal ports, with the real client IP
//     in X-Colluder-Origin-IP (interactsh -oih).
// No API, no database, no secrets: it reads rules.json and the certificate, and appends edge.jsonl.
import net from "node:net";
import tls from "node:tls";
import { readFileSync, openSync, writeSync, writeFileSync, renameSync, watchFile, existsSync, mkdirSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { Reader, readHead, readBody, HttpError, LIMITS } from "./lib/http1.mjs";
import { respond, serialize, reason } from "./lib/rules.mjs";
import { parseInteraction } from "./lib/tag.mjs";

const env = process.env;
const DATA = env.COLLUDER_DATA || join(homedir(), ".local/share/colluder");
const addr = (s) => { const i = s.lastIndexOf(":"); return { host: s.slice(0, i), port: Number(s.slice(i + 1)) }; };
const CFG = {
  domain: env.COLLUDER_DOMAIN || "oob.example",
  http: addr(env.COLLUDER_EDGE_HTTP || "203.0.113.10:80"),
  https: env.COLLUDER_EDGE_HTTPS === "off" ? null : addr(env.COLLUDER_EDGE_HTTPS || "203.0.113.10:443"),
  upHttp: addr(env.COLLUDER_UPSTREAM_HTTP || "127.0.0.1:8081"),
  upHttps: addr(env.COLLUDER_UPSTREAM_HTTPS || "127.0.0.1:8444"),
  cert: env.COLLUDER_EDGE_CERT || join(homedir(), "caido-cert/fullchain.pem"),
  key: env.COLLUDER_EDGE_KEY || join(homedir(), "caido-cert/privkey.pem"),
  rules: env.COLLUDER_RULES || join(DATA, "rules.json"),
  payloadFile: env.COLLUDER_PAYLOAD_FILE || join(DATA, "payload.txt"),
  log: env.COLLUDER_EDGE_LOG || join(DATA, "edge.jsonl"),
  statusFile: env.COLLUDER_EDGE_STATUS || join(DATA, "edge.status.json"),
  maxConns: 512,
  maxDelayed: 64,
};
export const ORIGIN = "X-Colluder-Origin-IP";
const ORIGIN_LC = ORIGIN.toLowerCase();

const log = (...a) => console.log(new Date().toISOString(), ...a);
const stats = { own: 0, relayed: 0, errors: 0, tlsErrors: 0, startedAt: new Date().toISOString() };
let delayed = 0;

// ---------- rules ----------
let state = { cids: [], rules: {}, generatedAt: null };
function loadRules() {
  let next = { cids: [], rules: {}, generatedAt: null };
  try { next = { ...next, ...JSON.parse(readFileSync(CFG.rules, "utf8")) }; } catch (e) {
    if (e.code !== "ENOENT") log("rules.json unreadable, keeping previous rules:", e.message);
    else next.cids = cidFromPayload();
    if (e.code !== "ENOENT") return;
  }
  if (!next.cids?.length) next.cids = cidFromPayload();
  next.cids = next.cids.filter((c) => /^[a-z0-9]{20}$/.test(c));
  state = next;
  log(`rules loaded: ${Object.keys(state.rules).length} rule(s), ${state.cids.length} correlation id(s)`);
}
function cidFromPayload() {
  try { const id = readFileSync(CFG.payloadFile, "utf8").trim().split(".")[0].toLowerCase(); return id.length >= 20 ? [id.slice(0, 20)] : []; } catch { return []; }
}

// The 33-char interactsh id in the Host, if it belongs to Colluder.
export function ownership(hostHeader, cids) {
  const host = String(hostHeader || "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const labels = host.split(".");
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l.length === 33 && /^[a-z0-9]+$/.test(l) && cids.some((c) => l.startsWith(c))) {
      return { uniqueId: l, fullId: labels.slice(0, i + 1).join(".") };
    }
  }
  return null;
}

// Server name from a TLS ClientHello, without decrypting anything (RFC 8446 §4.1.2, RFC 6066 §3).
// Returns { done: false } until the whole first record is in, then { done: true, tls, sni }.
export function sniOf(buf) {
  if (buf.length < 1) return { done: false };
  if (buf[0] !== 0x16) return { done: true, tls: false, sni: null };
  if (buf.length < 5) return { done: false };
  const recLen = buf.readUInt16BE(3);
  if (buf.length < 5 + recLen) return { done: false };
  try {
    let p = 5;
    if (buf[p] !== 0x01) return { done: true, tls: true, sni: null }; // not a ClientHello
    p += 4 + 2 + 32;                       // handshake header, client_version, random
    p += 1 + buf[p];                       // session id
    p += 2 + buf.readUInt16BE(p);          // cipher suites
    p += 1 + buf[p];                       // compression methods
    const end = Math.min(p + 2 + buf.readUInt16BE(p), 5 + recLen);
    p += 2;
    while (p + 4 <= end) {
      const type = buf.readUInt16BE(p), len = buf.readUInt16BE(p + 2);
      p += 4;
      if (type === 0 && len >= 5 && buf[p + 2] === 0) {
        const n = buf.readUInt16BE(p + 3);
        return { done: true, tls: true, sni: buf.subarray(p + 5, p + 5 + n).toString("latin1").toLowerCase() };
      }
      p += len;
    }
  } catch { /* truncated or odd hello: no name */ }
  return { done: true, tls: true, sni: null };
}

// Raw byte pipe to interactsh, for TLS we must not terminate (the apex: interactsh's API and its own
// certificate) and for anything on :443 that isn't TLS.
function passthrough(sock, first, up) {
  stats.relayed++;
  const u = net.connect({ host: up.host, port: up.port });
  u.setTimeout(60_000, () => u.destroy());
  u.once("connect", () => { u.write(first); sock.pipe(u); u.pipe(sock); sock.resume(); });
  u.on("error", () => { stats.errors++; sock.destroy(); });
  sock.on("close", () => u.destroy());
  u.on("close", () => sock.destroy());
}

// ---------- evidence ----------
let logFd = null;
function record(o) {
  writeSync(logFd, JSON.stringify(o) + "\n"); // one write per line; O_APPEND keeps lines whole
}

const ipOf = (sock) => String(sock.remoteAddress || "").replace(/^::ffff:/, "");
const plain = (status) => Buffer.from(`HTTP/1.1 ${status} ${reason(status)}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, "latin1");

// ---------- connections ----------
async function handle(sock, scheme) {
  const t0 = Date.now();
  const ip = ipOf(sock);
  sock.setNoDelay(true);
  sock.setTimeout(60_000, () => sock.destroy());
  sock.on("error", () => {});
  const r = new Reader(sock);
  let head;
  try {
    head = await readHead(r, t0 + 10_000);
  } catch (e) {
    // not HTTP we can route (garbage, huge head): let interactsh see it exactly as it would have
    if (e instanceof HttpError && e.status !== 408) return relay(sock, r, null, scheme);
    stats.errors++;
    return sock.destroy();
  }
  if (!head) return sock.destroy();
  const host = head.get("host")?.[0] || "";
  const own = ownership(host, state.cids);
  if (!own) return relay(sock, r, head, scheme);

  stats.own++;
  const arrived = new Date().toISOString();
  let body = Buffer.alloc(0), dropped = 0, failed = null;
  try { ({ body, dropped } = await readBody(r, head, t0 + 30_000)); } catch (e) { failed = e instanceof HttpError ? e : new HttpError(400, e.message); }
  r.detach();
  const rawRequest = Buffer.concat([head.raw, body]);
  const tag = parseInteraction({ protocol: scheme, "unique-id": own.uniqueId, "full-id": own.fullId, "raw-request": head.raw.toString("latin1") }, CFG.domain).tag;
  const entry = tag ? state.rules[tag] : null;
  let wire, answer;
  if (failed) {
    wire = plain(failed.status);
    answer = { by: "colluder", mode: "error", version: null, error: failed.message };
  } else {
    const res = respond(entry?.rule || null, entry?.version ?? null, { scheme, method: head.method, target: head.target, host, uniqueId: own.uniqueId, domain: CFG.domain });
    wire = serialize(res, head.method);
    answer = res.answer;
    if (res.delayMs) {
      if (delayed < CFG.maxDelayed) { delayed++; await new Promise((ok) => setTimeout(ok, res.delayMs)); delayed--; }
      else answer.delaySkipped = true;
    }
  }
  record({
    protocol: scheme,
    "unique-id": own.uniqueId,
    "full-id": own.fullId,
    "raw-request": rawRequest.toString("utf8"),
    "raw-response": wire.toString("utf8"),
    "remote-address": ip,
    timestamp: arrived,
    "colluder-answer": { ...answer, tag, ...(dropped ? { droppedBytes: dropped } : {}) },
  });
  if (!sock.destroyed) sock.end(wire);
}

function relay(sock, r, head, scheme) {
  stats.relayed++;
  const rest = r.detach();
  sock.pause(); // nothing may flow until the upstream is there to receive it
  let first = Buffer.alloc(0);
  if (head) {
    const ip = ipOf(sock);
    const nl = head.raw.indexOf("\n") + 1;
    if (head.headers.some(([n]) => n.toLowerCase() === ORIGIN_LC)) {
      // a client-supplied origin header is never trusted: rebuild the head without it
      const lines = [head.raw.subarray(0, nl).toString("latin1").replace(/\r?\n$/, ""), `${ORIGIN}: ${ip}`,
        ...head.headers.filter(([n]) => n.toLowerCase() !== ORIGIN_LC).map(([n, v]) => `${n}: ${v}`)];
      first = Buffer.from(lines.join("\r\n") + "\r\n\r\n", "latin1");
    } else {
      first = Buffer.concat([head.raw.subarray(0, nl), Buffer.from(`${ORIGIN}: ${ip}\r\n`, "latin1"), head.raw.subarray(nl)]);
    }
  }
  const up = scheme === "https"
    ? tls.connect({ host: CFG.upHttps.host, port: CFG.upHttps.port, servername: sock.servername || undefined, rejectUnauthorized: false, ALPNProtocols: ["http/1.1"] })
    : net.connect({ host: CFG.upHttp.host, port: CFG.upHttp.port });
  up.setTimeout(60_000, () => up.destroy());
  let connected = false;
  up.once(scheme === "https" ? "secureConnect" : "connect", () => {
    connected = true;
    up.write(Buffer.concat([first, rest]));
    sock.pipe(up);
    up.pipe(sock);
    sock.resume();
  });
  up.on("error", (e) => {
    stats.errors++;
    if (!connected && !sock.destroyed) { log(`upstream ${scheme} unreachable: ${e.message}`); sock.end(plain(502)); }
    else sock.destroy();
  });
  sock.on("close", () => up.destroy());
  up.on("close", () => sock.destroy());
}

// ---------- listeners ----------
function loadCtx() {
  const cert = readFileSync(CFG.cert), key = readFileSync(CFG.key);
  const notAfter = new X509Certificate(cert).validTo;
  return { ctx: { cert, key }, notAfter };
}
let certInfo = null;
const servers = [];
function start() {
  mkdirSync(DATA, { recursive: true, mode: 0o700 });
  logFd = openSync(CFG.log, "a", 0o600);
  loadRules();
  watchFile(CFG.rules, { interval: 1000 }, loadRules);
  watchFile(CFG.payloadFile, { interval: 5000 }, () => { if (!existsSync(CFG.rules)) loadRules(); });

  const h = net.createServer((s) => handle(s, "http"));
  h.maxConnections = CFG.maxConns;
  h.listen(CFG.http.port, CFG.http.host, () => log(`edge http on ${CFG.http.host}:${CFG.http.port}`));
  servers.push(h);

  if (CFG.https) {
    const c = loadCtx();
    certInfo = { notAfter: c.notAfter };
    // TLS is terminated only after reading the server name: the apex (interactsh's polling API, which
    // the wildcard certificate doesn't cover) goes through untouched; everything else is ours to read.
    const s = tls.createServer({ ...c.ctx, ALPNProtocols: ["http/1.1"] }, (sock) => handle(sock, "https"));
    s.on("tlsClientError", () => { stats.tlsErrors++; });
    const front = net.createServer((sock) => {
      sock.on("error", () => {});
      let buf = Buffer.alloc(0);
      const t = setTimeout(() => sock.destroy(), 10_000);
      const onData = (d) => {
        buf = Buffer.concat([buf, d]);
        const h = sniOf(buf);
        if (!h.done && buf.length < 16 * 1024 + 5) return;
        clearTimeout(t);
        sock.off("data", onData);
        sock.pause();
        if (!h.tls || h.sni === CFG.domain) return passthrough(sock, buf, CFG.upHttps);
        sock.unshift(buf);
        s.emit("connection", sock);
      };
      sock.on("data", onData);
    });
    front.maxConnections = CFG.maxConns;
    front.listen(CFG.https.port, CFG.https.host, () => log(`edge https on ${CFG.https.host}:${CFG.https.port}, cert valid until ${c.notAfter}`));
    servers.push(front);
    watchFile(CFG.cert, { interval: 60_000 }, () => {
      try { const n = loadCtx(); s.setSecureContext(n.ctx); certInfo = { notAfter: n.notAfter }; log(`certificate reloaded, valid until ${n.notAfter}`); }
      catch (e) { log("certificate reload failed, keeping the old one:", e.message); }
    });
  }
  for (const s of servers) s.on("error", (e) => { log("listener error:", e.message); process.exit(1); });

  const writeStatus = (stopped = false) => {
    const tmp = CFG.statusFile + ".tmp";
    try {
    writeFileSync(tmp, JSON.stringify({
      pid: process.pid, stopped, heartbeatAt: new Date().toISOString(), ...stats,
      listen: { http: `${CFG.http.host}:${CFG.http.port}`, https: CFG.https ? `${CFG.https.host}:${CFG.https.port}` : null },
      upstream: { http: `${CFG.upHttp.host}:${CFG.upHttp.port}`, https: `${CFG.upHttps.host}:${CFG.upHttps.port}` },
      cert: certInfo, rules: Object.keys(state.rules).length, rulesGeneratedAt: state.generatedAt,
    }), { mode: 0o600 });
    renameSync(tmp, CFG.statusFile);
    } catch (e) { log("status file not written:", e.message); }
  };
  writeStatus();
  const t = setInterval(writeStatus, 5000);
  const stop = () => { clearInterval(t); writeStatus(true); for (const s of servers) s.close(); setTimeout(() => process.exit(0), 1500).unref(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (import.meta.url === `file://${process.argv[1]}`) start();

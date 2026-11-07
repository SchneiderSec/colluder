#!/usr/bin/env node
// Colluder edge: the public HTTP/HTTPS front door (see PHASE2.md).
//   - Requests whose Host carries Colluder's correlation id are answered here, by the probe's rule or
//     interactsh's default reply, and recorded byte-for-byte in edge.jsonl.
//   - Everything else is relayed to interactsh-server on its internal ports, with the real client IP
//     in X-Colluder-Origin-IP (interactsh -oih).
// No API, no database, no secrets: it reads rules.json and the certificate, and appends edge.jsonl.
import net from "node:net";
import tls from "node:tls";
import { isUtf8 } from "node:buffer";
import { readFileSync, openSync, writeSync, writeFileSync, renameSync, watchFile, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { Reader, readHead, readBody, lenientHead, HttpError, LIMITS } from "./lib/http1.mjs";
import { respond, serialize, reason } from "./lib/rules.mjs";
import { parseInteraction } from "./lib/tag.mjs";
import { edgeCodeHash } from "./lib/codehash.mjs";
import { dnsFront } from "./lib/dns.mjs";

const CODE = edgeCodeHash(); // what this process loaded (see lib/codehash.mjs)

const env = process.env;
const DATA = env.COLLUDER_DATA || join(homedir(), ".local/share/colluder");
const addr = (s) => { const i = s.lastIndexOf(":"); return { host: s.slice(0, i), port: Number(s.slice(i + 1)) }; };
const CFG = {
  domain: env.COLLUDER_DOMAIN || "oob.example",
  http: addr(env.COLLUDER_EDGE_HTTP || "203.0.113.10:80"),
  https: env.COLLUDER_EDGE_HTTPS === "off" ? null : addr(env.COLLUDER_EDGE_HTTPS || "203.0.113.10:443"),
  upHttp: addr(env.COLLUDER_UPSTREAM_HTTP || "127.0.0.1:8081"),
  upHttps: addr(env.COLLUDER_UPSTREAM_HTTPS || "127.0.0.1:8444"),
  // DNS front (PLAN-SHORTID.md): off until deploy/dns-front.sh moves interactsh's DNS off :53
  dns: env.COLLUDER_EDGE_DNS && env.COLLUDER_EDGE_DNS !== "off" ? addr(env.COLLUDER_EDGE_DNS) : null,
  upDns: addr(env.COLLUDER_UPSTREAM_DNS || "127.0.0.1:8053"),
  cert: env.COLLUDER_EDGE_CERT || join(homedir(), "caido-cert/fullchain.pem"),
  key: env.COLLUDER_EDGE_KEY || join(homedir(), "caido-cert/privkey.pem"),
  // one wildcard per extra domain, <dir>/<domain>/{fullchain,privkey}.pem (deploy/cert-sync.sh);
  // a client's server name picks among them and the default above
  certDir: env.COLLUDER_EDGE_CERT_DIR || join(homedir(), "caido-cert/domains"),
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
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
let state = { cids: [], shortIds: [], domains: [CFG.domain], rules: {}, generatedAt: null };
function loadRules() {
  let next = { cids: [], shortIds: [], domains: [], rules: {}, generatedAt: null };
  try { next = { ...next, ...JSON.parse(readFileSync(CFG.rules, "utf8")) }; } catch (e) {
    if (e.code !== "ENOENT") log("rules.json unreadable, keeping previous rules:", e.message);
    else next.cids = cidFromPayload();
    if (e.code !== "ENOENT") return;
  }
  if (!next.cids?.length) next.cids = cidFromPayload();
  next.cids = next.cids.filter((c) => /^[a-z0-9]{20}$/.test(c));
  next.shortIds = (Array.isArray(next.shortIds) ? next.shortIds : []).filter((c) => /^[a-z][a-z0-9]{5}$/.test(c));
  // every domain Colluder serves (the payload domain first; an old one stays until it lapses)
  next.domains = [...new Set([...(Array.isArray(next.domains) ? next.domains : []), next.domain, CFG.domain]
    .map((d) => String(d || "").toLowerCase()).filter((d) => DOMAIN_RE.test(d)))];
  const before = state.domains.join(",");
  state = next;
  log(`rules loaded: ${Object.keys(state.rules).length} rule(s), ${state.cids.length} correlation id(s)${state.domains.join(",") !== before ? `, domains ${state.domains.join(", ")}` : ""}`);
}
function cidFromPayload() {
  try { const id = readFileSync(CFG.payloadFile, "utf8").trim().split(".")[0].toLowerCase(); return id.length >= 20 ? [id.slice(0, 20)] : []; } catch { return []; }
}

// Colluder's id in a host name, if it has one: a 33-char interactsh id starting with one of our
// correlation ids (anywhere in the name, as interactsh reads it), or our short id in the label right
// under the domain. Either stands alone (<id>) or has the tag joined by a dash (<tag>-<id>): one
// label, so the *.domain certificate covers it over HTTPS.
// domain: one name or a list (the first that the host ends with decides where "right under" is).
export function ownership(hostHeader, cids, shorts = [], domain = CFG.domain) {
  const host = String(hostHeader || "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const labels = host.split(".");
  const d = domainOf(host, domain);
  const top = d ? labels.length - d.split(".").length - 1 : -1;
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i], dash = l.lastIndexOf("-");
    if (dash === 0 || (dash > 0 && !/^[a-z0-9][a-z0-9-]*$/.test(l.slice(0, dash)))) continue;
    const id = dash < 0 ? l : l.slice(dash + 1);
    const long = id.length === 33 && /^[a-z0-9]+$/.test(id) && cids.some((c) => id.startsWith(c));
    if (long || (i === top && shorts.includes(id))) return { uniqueId: id, fullId: labels.slice(0, i + 1).join(".") };
  }
  return null;
}

// which of our domains a host is under (the longest match), or null
export function domainOf(hostHeader, domains = CFG.domain) {
  const host = String(hostHeader || "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  let best = null;
  for (const d of [].concat(domains)) if (d && host.endsWith("." + d) && (!best || d.length > best.length)) best = d;
  return best;
}

// The host a request is for: the Host header, or the authority of an absolute-form target
// (GET http://x/ HTTP/1.1, which proxies and some HTTP/1.0 clients send with a foreign or no Host).
export function routeOf(hostHeader, target, cids) {
  const byHost = ownership(hostHeader, cids, state.shortIds, state.domains);
  if (byHost) return { own: byHost, host: hostHeader };
  const a = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\s]*)/i.exec(String(target || ""));
  const auth = a ? a[1].replace(/^.*@/, "") : "";
  const byTarget = auth ? ownership(auth, cids, state.shortIds, state.domains) : null;
  return byTarget ? { own: byTarget, host: auth } : null;
}

// Server name and ALPN from a TLS ClientHello, without decrypting anything (RFC 8446 §4.1.2,
// RFC 6066 §3, RFC 7301). Returns { done: false } until the whole first record is in, then
// { done: true, tls, sni, alpn }.
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
    let sni = null;
    const alpn = [];
    while (p + 4 <= end) {
      const type = buf.readUInt16BE(p), len = buf.readUInt16BE(p + 2);
      p += 4;
      if (type === 0 && len >= 5 && buf[p + 2] === 0) {
        const n = buf.readUInt16BE(p + 3);
        sni = buf.subarray(p + 5, p + 5 + n).toString("latin1").toLowerCase();
      } else if (type === 16 && len >= 2) {
        for (let q = p + 2; q < p + len && alpn.length < 10;) { const n = buf[q]; alpn.push(buf.subarray(q + 1, q + 1 + n).toString("latin1")); q += 1 + n; }
      }
      p += len;
    }
    return { done: true, tls: true, sni, alpn };
  } catch { /* truncated or odd hello: no name */ }
  return { done: true, tls: true, sni: null, alpn: [] };
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
// the request as recorded: text, plus the exact bytes when the text would be a lossy view of them
const rawFields = (buf) => ({ "raw-request": buf.toString("utf8"), ...(isUtf8(buf) ? {} : { "raw-request-b64": buf.toString("base64") }) });

// The origin header on a request relayed without a parsed head (one the strict parser refused):
// whatever the client sent under that name is removed, and the real peer added after the first line.
// Returns null when the head can't be found in what was read (then the request is refused).
export function withOrigin(buf, ip) {
  const text = buf.toString("latin1");
  const m = /\r?\n\r?\n/.exec(text);
  const headEnd = m ? m.index + m[0].length : -1;
  if (headEnd === -1) return text.toLowerCase().includes(ORIGIN_LC) ? null : buf;
  const head = text.slice(0, headEnd).replace(new RegExp(`(\\n)${ORIGIN_LC}[ \\t]*:[^\\n]*\\n`, "gi"), "$1");
  const nl = head.indexOf("\n") + 1;
  if (!nl) return buf;
  return Buffer.concat([Buffer.from(head.slice(0, nl) + `${ORIGIN}: ${ip}\r\n` + head.slice(nl), "latin1"), buf.subarray(headEnd)]);
}
const plain = (status) => Buffer.from(`HTTP/1.1 ${status} ${reason(status)}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, "latin1");

// requests answered per probe and rule version, for a decoy's "first N" (in memory: an edge restart
// or a new rule version starts the count again)
const answered = new Map();

// ---------- connections ----------
async function handle(sock, scheme) {
  const t0 = Date.now();
  const ip = ipOf(sock);
  sock.setNoDelay(true);
  sock.setTimeout(60_000, () => sock.destroy());
  sock.on("error", () => {});
  const r = new Reader(sock);
  let head, malformed = null;
  try {
    head = await readHead(r, t0 + 10_000);
  } catch (e) {
    if (e instanceof HttpError && e.headBytes) {
      // a head the strict grammar refuses: if it's addressed to us, it is evidence (a raw newline in
      // the target is what an XXE file read looks like); record it rather than relay it
      const lh = lenientHead(e.headBytes);
      if (routeOf(lh.get("host")?.[0], lh.target, state.cids)) { r.take(e.headBytes.length); head = lh; malformed = e.message; }
    }
    if (!head) {
      // not HTTP we can route (garbage, huge head): interactsh sees it as it would have
      if (e instanceof HttpError && e.status !== 408) return relay(sock, r, null, scheme);
      stats.errors++;
      return sock.destroy();
    }
  }
  if (!head) return sock.destroy();
  const route = routeOf(head.get("host")?.[0] || "", head.target, state.cids);
  if (!route) return relay(sock, r, head, scheme);
  const { own, host } = route;

  stats.own++;
  const arrived = new Date().toISOString();
  let body = Buffer.alloc(0), dropped = 0, failed = null;
  try { ({ body, dropped } = await readBody(r, head, t0 + 30_000)); } catch (e) {
    if (malformed) body = r.take(Math.min(r.buf.length, LIMITS.record)); // keep what came; answer anyway
    else failed = e instanceof HttpError ? e : new HttpError(400, e.message);
  }
  r.detach();
  const rawRequest = Buffer.concat([head.raw, body]);
  const tag = parseInteraction({ protocol: scheme, "unique-id": own.uniqueId, "full-id": own.fullId, "raw-request": head.raw.toString("latin1") }, CFG.domain).tag;
  const entry = tag ? state.rules[tag] : null;
  let wire, answer;
  if (failed) {
    wire = plain(failed.status);
    answer = { by: "colluder", mode: "error", version: null, error: failed.message };
  } else {
    const key = `${tag}\0${entry?.version}`;
    const seen = answered.get(key) ?? 0;
    const res = respond(entry?.rule || null, entry?.version ?? null, { scheme, method: head.method, target: head.target, host, uniqueId: own.uniqueId, domain: domainOf(host, state.domains) || state.domains[0], ua: head.get("user-agent")?.[0] ?? "", ip, seen });
    if (entry?.rule?.decoy && res.answer.version != null) { answered.delete(key); answered.set(key, seen + 1); if (answered.size > 5000) answered.delete(answered.keys().next().value); }
    wire = serialize(res, head.method);
    answer = malformed ? { ...res.answer, malformed } : res.answer;
    if (res.delayMs) {
      if (delayed < CFG.maxDelayed) { delayed++; await new Promise((ok) => setTimeout(ok, res.delayMs)); delayed--; }
      else answer.delaySkipped = true;
    }
  }
  record({
    protocol: scheme,
    "unique-id": own.uniqueId,
    "full-id": own.fullId,
    ...rawFields(rawRequest),
    "raw-response": wire.toString("utf8"),
    "remote-address": ip,
    timestamp: arrived,
    "colluder-answer": { ...answer, tag, ...(dropped ? { droppedBytes: dropped } : {}) },
  });
  if (!sock.destroyed) sock.end(wire);
}

function relay(sock, r, head, scheme) {
  stats.relayed++;
  let rest = r.detach();
  sock.pause(); // nothing may flow until the upstream is there to receive it
  let first = Buffer.alloc(0);
  if (!head) {
    // unparsed: never pass on a client-supplied origin header (interactsh would believe it)
    rest = withOrigin(rest, ipOf(sock));
    if (!rest) { stats.errors++; return sock.end(plain(400)); }
  }
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
// ---------- TLS handshakes that never complete ----------
// A client that refuses the certificate (https://<tag>.<id>…: the wildcard covers one label) closes
// without sending a request: during the handshake (Node, Java), or right after it, since curl and
// others check the name only once the handshake is done. If its server name is ours, that is still a
// hit; the connection counts as a request only once bytes arrive after the handshake.
const pendingTls = new Map();
const connKey = (s) => `${s.remoteAddress}|${s.remotePort}`;
function tlsFailed(p) {
  const own = ownership(p.sni, state.cids, state.shortIds, state.domains);
  if (!own) return;
  const tag = parseInteraction({ protocol: "https", "unique-id": own.uniqueId, "full-id": own.fullId }, CFG.domain).tag;
  stats.own++;
  record({
    protocol: "https", "unique-id": own.uniqueId, "full-id": own.fullId,
    "raw-request": "", "raw-request-b64": p.hello.toString("base64"), "raw-response": "",
    "remote-address": p.ip, timestamp: p.at,
    "colluder-answer": { by: "colluder", mode: "tls", version: null, tag, tls: { sni: p.sni, alpn: p.alpn, error: p.error || (p.handshook ? "handshake completed, then closed without a request" : null) } },
  });
}

// ---------- certificates ----------
// The default pair, plus one per domain directory; each is matched by the names it covers.
function certNames(x509) {
  const san = (x509.subjectAltName || "").split(/,\s*/).filter((e) => e.startsWith("DNS:")).map((e) => e.slice(4).toLowerCase());
  return san.length ? san : [/CN=([^\n,]+)/.exec(x509.subject)?.[1]?.toLowerCase()].filter(Boolean);
}
function loadPair(certPath, keyPath) {
  const cert = readFileSync(certPath), key = readFileSync(keyPath);
  const x = new X509Certificate(cert);
  return { cert, key, names: certNames(x), notAfter: x.validTo, path: certPath };
}
export function loadCerts(cfg = CFG) {
  const def = loadPair(cfg.cert, cfg.key);
  const extra = [];
  let dirs = [];
  try { dirs = readdirSync(cfg.certDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { /* none yet */ }
  for (const d of dirs) {
    try { extra.push(loadPair(join(cfg.certDir, d, "fullchain.pem"), join(cfg.certDir, d, "privkey.pem"))); }
    catch (e) { log(`certificate in ${d} unreadable, skipped:`, e.message); }
  }
  return { def, extra };
}
// the most specific certificate that covers a server name (exact beats wildcard; a wildcard covers
// one label), else null for the default
export function pickCert(servername, pairs) {
  const n = String(servername || "").toLowerCase().replace(/\.$/, "");
  let best = null, score = 0;
  for (const p of pairs) for (const name of p.names) {
    const s = name === n ? 1000 + name.length
      : name.startsWith("*.") && n.endsWith(name.slice(1)) && !n.slice(0, -(name.length - 1)).includes(".") ? name.length : 0;
    if (s > score) { score = s; best = p; }
  }
  return best;
}
// what changes when cert-sync copies a renewal or a new domain in
function certSignature(cfg = CFG) {
  const files = [cfg.cert, cfg.key];
  try { for (const e of readdirSync(cfg.certDir, { withFileTypes: true })) if (e.isDirectory()) files.push(join(cfg.certDir, e.name, "fullchain.pem"), join(cfg.certDir, e.name, "privkey.pem")); } catch { /* none */ }
  return files.map((f) => { try { return `${f}:${statSync(f).mtimeMs}`; } catch { return `${f}:-`; } }).join("|");
}
const certSummary = (c) => ({ notAfter: c.def.notAfter, all: [c.def, ...c.extra].map((p) => ({ names: p.names, notAfter: p.notAfter })) });
let certInfo = null;
const servers = [];
function start() {
  mkdirSync(DATA, { recursive: true, mode: 0o700 });
  logFd = openSync(CFG.log, "a", 0o600);
  loadRules();
  watchFile(CFG.rules, { interval: 250 }, loadRules); // a planted preset serves within a quarter second
  watchFile(CFG.payloadFile, { interval: 5000 }, () => { if (!existsSync(CFG.rules)) loadRules(); });

  const h = net.createServer((s) => handle(s, "http"));
  h.maxConnections = CFG.maxConns;
  h.listen(CFG.http.port, CFG.http.host, () => log(`edge http on ${CFG.http.host}:${CFG.http.port}`));
  servers.push(h);

  if (CFG.https) {
    let c = loadCerts();
    let ctxs = c.extra.map((p) => ({ ...p, ctx: tls.createSecureContext({ cert: p.cert, key: p.key }) }));
    certInfo = certSummary(c);
    // TLS is terminated only after reading the server name: the apex (interactsh's polling API, which
    // the wildcard certificate doesn't cover) goes through untouched; everything else is ours to read.
    const s = tls.createServer({
      cert: c.def.cert, key: c.def.key, ALPNProtocols: ["http/1.1"],
      // the default answers unless another domain's certificate covers the name better
      SNICallback: (name, done) => { const p = pickCert(name, [c.def, ...ctxs]); done(null, p && p !== c.def ? p.ctx : undefined); },
    }, (sock) => {
      const key = connKey(sock), p = pendingTls.get(key);
      if (p) { p.handshook = true; sock.once("data", () => pendingTls.delete(key)); }
      handle(sock, "https");
    });
    s.on("tlsClientError", (err, ts) => {
      stats.tlsErrors++;
      try { const p = pendingTls.get(connKey(ts)); if (p) p.error = String(err?.code || err?.message || "").slice(0, 120); } catch { /* socket gone */ }
    });
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
        if (!h.tls || state.domains.includes(String(h.sni).toLowerCase())) return passthrough(sock, buf, CFG.upHttps);
        if (h.sni && ownership(h.sni, state.cids, state.shortIds, state.domains) && pendingTls.size < 1000) {
          const key = connKey(sock), p = { sni: h.sni, alpn: h.alpn, hello: buf.subarray(0, 16 * 1024), ip: ipOf(sock), at: new Date().toISOString() };
          pendingTls.set(key, p);
          sock.once("close", () => { if (pendingTls.get(key) === p) { pendingTls.delete(key); tlsFailed(p); } });
        }
        sock.unshift(buf);
        s.emit("connection", sock);
      };
      sock.on("data", onData);
    });
    front.maxConnections = CFG.maxConns;
    front.listen(CFG.https.port, CFG.https.host, () => log(`edge https on ${CFG.https.host}:${CFG.https.port}, certificates: ${[c.def, ...c.extra].map((p) => `${p.names.join(" ")} until ${p.notAfter}`).join("; ")}`));
    servers.push(front);
    let sig = certSignature();
    setInterval(() => {
      const now = certSignature();
      if (now === sig) return;
      sig = now;
      try {
        const n = loadCerts();
        const nCtxs = n.extra.map((p) => ({ ...p, ctx: tls.createSecureContext({ cert: p.cert, key: p.key }) }));
        s.setSecureContext({ cert: n.def.cert, key: n.def.key });
        c = n; ctxs = nCtxs; certInfo = certSummary(n);
        log(`certificates reloaded: ${[n.def, ...n.extra].map((p) => `${p.names.join(" ")} until ${p.notAfter}`).join("; ")}`);
      } catch (e) { log("certificate reload failed, keeping the old ones:", e.message); }
    }, 60_000).unref();
  }
  for (const s of servers) s.on("error", (e) => { log("listener error:", e.message); process.exit(1); });

  let dns = null;
  if (CFG.dns) {
    dns = dnsFront({ listen: CFG.dns, upstream: CFG.upDns, owns: (name) => ownership(name, state.cids, state.shortIds, state.domains), record, log, stats });
    dns.listen().then(() => log(`edge dns on ${CFG.dns.host}:${CFG.dns.port} (udp, tcp), relaying to ${CFG.upDns.host}:${CFG.upDns.port}`))
      .catch((e) => { log("dns listener error:", e.message); process.exit(1); });
  }

  const writeStatus = (stopped = false) => {
    const tmp = CFG.statusFile + ".tmp";
    try {
    writeFileSync(tmp, JSON.stringify({
      pid: process.pid, stopped, heartbeatAt: new Date().toISOString(), ...stats,
      listen: { http: `${CFG.http.host}:${CFG.http.port}`, https: CFG.https ? `${CFG.https.host}:${CFG.https.port}` : null, dns: CFG.dns ? `${CFG.dns.host}:${CFG.dns.port}` : null },
      upstream: { http: `${CFG.upHttp.host}:${CFG.upHttp.port}`, https: `${CFG.upHttps.host}:${CFG.upHttps.port}`, dns: CFG.dns ? `${CFG.upDns.host}:${CFG.upDns.port}` : null },
      cert: certInfo, rules: Object.keys(state.rules).length, rulesGeneratedAt: state.generatedAt, code: CODE,
    }), { mode: 0o600 });
    renameSync(tmp, CFG.statusFile);
    } catch (e) { log("status file not written:", e.message); }
  };
  writeStatus();
  const t = setInterval(writeStatus, 5000);
  const stop = () => { clearInterval(t); writeStatus(true); for (const s of servers) s.close(); dns?.close(); setTimeout(() => process.exit(0), 1500).unref(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (import.meta.url === `file://${process.argv[1]}`) start();

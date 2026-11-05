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

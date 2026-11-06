// The edge's DNS front (lib/dns.mjs) and the short id (PLAN-SHORTID.md). Everything listens on
// 127.0.0.1 with ports the OS picks, and closes when the test ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import net from "node:net";
import { parseMessage, formatMessage, questionOf, dnsFront } from "../lib/dns.mjs";
import { ownership } from "../edge.mjs";
import { parseInteraction } from "../lib/tag.mjs";

const DOMAIN = "oob.example";
const CID = "abcdefghij0123456789", ID = CID + "klmnopqrstuvw";
const SHORT = "k3x9q2";

const encName = (n) => Buffer.concat([...n.split(".").filter(Boolean).map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])), Buffer.from([0])]);
function query(id, name, type = 1, edns = true) {
  const h = Buffer.alloc(12); h.writeUInt16BE(id, 0); h.writeUInt16BE(0x0100, 2); h.writeUInt16BE(1, 4); h.writeUInt16BE(edns ? 1 : 0, 10);
  const q = Buffer.alloc(4); q.writeUInt16BE(type, 0); q.writeUInt16BE(1, 2);
  const opt = Buffer.from([0, 0, 41, 0x05, 0xac, 0, 0, 0x80, 0, 0, 0]); // udp 1452, DO
  return Buffer.concat([h, encName(name), q, ...(edns ? [opt] : [])]);
}
// interactsh's answer, more or less: A <box ip> for anything asked
function answer(q) {
  const m = parseMessage(q);
  const h = Buffer.from(q.subarray(0, 12)); h.writeUInt16BE(0x8500, 2); h.writeUInt16BE(1, 6); h.writeUInt16BE(0, 10);
  const qEnd = 12 + encName(m.question[0].name).length + 4;
  const rr = Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0x0e, 0x10, 0, 4, 203, 0, 113, 10]);
  return Buffer.concat([h, q.subarray(12, qEnd), rr]);
}

test("dns: messages read back in interactsh-client's text", () => {
  const q = query(36903, `fetch-${SHORT}.${DOMAIN}`, 48);
  assert.equal(formatMessage(parseMessage(q)), [
    ";; opcode: QUERY, status: NOERROR, id: 36903",
    ";; flags: rd; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1",
    "", ";; OPT PSEUDOSECTION:", "; EDNS: version 0; flags: do; udp: 1452",
    "", ";; QUESTION SECTION:", `;fetch-${SHORT}.${DOMAIN}.\tIN\t DNSKEY`, "",
  ].join("\n"));
  const a = formatMessage(parseMessage(answer(query(7, `x.${DOMAIN}`, 1, false))));
  assert.match(a, /;; flags: qr aa rd; QUERY: 1, ANSWER: 1,/);
  assert.match(a, new RegExp(`\\n;; ANSWER SECTION:\\nx\\.${DOMAIN.replace(".", "\\.")}\\.\\t3600\\tIN\\tA\\t203\\.0\\.113\\.10\\n`));
  assert.deepEqual([questionOf(q).name, questionOf(q).type], [`fetch-${SHORT}.${DOMAIN}`, "DNSKEY"]);
  assert.equal(questionOf(Buffer.from("not dns at all")), null);
  assert.throws(() => parseMessage(Buffer.concat([query(1, "a.b").subarray(0, 12), Buffer.from([0xc0, 0x0c])])), /pointer/);
});

test("short id: owned only right under the domain, alone or with a tag joined by a dash", () => {
  const own = (h) => ownership(h, [CID], [SHORT], DOMAIN);
  assert.deepEqual(own(`signup7-${SHORT}.${DOMAIN}`), { uniqueId: SHORT, fullId: `signup7-${SHORT}` });
  assert.deepEqual(own(`kc1.signup7-${SHORT}.${DOMAIN}:443`), { uniqueId: SHORT, fullId: `kc1.signup7-${SHORT}` });
  assert.deepEqual(own(`${SHORT}.${DOMAIN}.`), { uniqueId: SHORT, fullId: SHORT });
  assert.equal(own(`signup7-${SHORT}.other.example`), null, "someone else's domain");
  assert.equal(own(`${SHORT}.x.${DOMAIN}`), null, "not the label under the domain");
  assert.equal(own(`signup7-${SHORT}x.${DOMAIN}`), null);
  assert.deepEqual(own(`fetch-${ID}.${DOMAIN}`), { uniqueId: ID, fullId: `fetch-${ID}` }, "long ids still work");
  const it = parseInteraction({ protocol: "dns", "unique-id": SHORT, "full-id": `kc1.signup7-${SHORT}` }, DOMAIN);
  assert.deepEqual([it.tag, it.extraLabels], ["signup7", ["kc1"]]);
});

test("dns front: relays every query unchanged and records only Colluder's names, over UDP and TCP", async (t) => {
  const up = dgram.createSocket("udp4");
  up.on("message", (m, r) => up.send(answer(m), r.port, r.address));
  await new Promise((ok) => up.bind(0, "127.0.0.1", ok));
  const upTcp = net.createServer((s) => {
    let buf = Buffer.alloc(0);
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 2 && buf.length >= 2 + buf.readUInt16BE(0)) {
        const a = answer(buf.subarray(2, 2 + buf.readUInt16BE(0)));
        buf = buf.subarray(2 + buf.readUInt16BE(0));
        const len = Buffer.alloc(2); len.writeUInt16BE(a.length); s.write(Buffer.concat([len, a]));
      }
    });
  });
  // the front's TCP upstream is the same port number as its UDP upstream, so bind TCP there too
  await new Promise((ok) => upTcp.listen(up.address().port, "127.0.0.1", ok));

  const recorded = [];
  const front = dnsFront({
    listen: { host: "127.0.0.1", port: 0 }, upstream: { host: "127.0.0.1", port: up.address().port },
    owns: (n) => ownership(n, [CID], [SHORT], DOMAIN), record: (e) => recorded.push(e),
  });
  await front.listen();
  t.after(() => { front.close(); up.close(); upTcp.close(); });
  const { udp: ua, tcp: ta } = front.address();

  const client = dgram.createSocket("udp4");
  t.after(() => client.close());
  const ask = (msg) => new Promise((ok) => { client.once("message", ok); client.send(msg, ua.port, "127.0.0.1"); });
  const ours = await ask(query(4242, `Fetch-${SHORT}.${DOMAIN}`));
  assert.equal(ours.readUInt16BE(0), 4242, "the client gets its own id back");
  assert.match(formatMessage(parseMessage(ours)), /IN\tA\t203\.0\.113\.10/);
  const theirs = await ask(query(99, `nuclei-${"z".repeat(33)}.${DOMAIN}`));
  assert.equal(theirs.readUInt16BE(0), 99);

  const viaTcp = await new Promise((ok, no) => {
    const s = net.connect(ta.port, "127.0.0.1"); let buf = Buffer.alloc(0);
    const q = query(77, `kc3.fetch-${ID}.${DOMAIN}`, 16); const len = Buffer.alloc(2); len.writeUInt16BE(q.length);
    s.on("data", (d) => { buf = Buffer.concat([buf, d]); if (buf.length >= 2 && buf.length >= 2 + buf.readUInt16BE(0)) { s.end(); ok(buf.subarray(2)); } });
    s.on("error", no); s.write(Buffer.concat([len, q]));
  });
  assert.equal(viaTcp.readUInt16BE(0), 77);
  await new Promise((ok) => setTimeout(ok, 50));

  assert.equal(recorded.length, 2, "the foreign name is relayed, not recorded");
  const [u, tc] = recorded;
  assert.deepEqual([u.protocol, u["unique-id"], u["full-id"], u["q-type"], u["remote-address"], u["colluder-answer"].transport], ["dns", SHORT, `fetch-${SHORT}`, "A", "127.0.0.1", "udp"]);
  assert.match(u["raw-request"], /id: 4242\n/, "the record keeps the client's id");
  assert.match(u["raw-response"], /;; ANSWER SECTION:/);
  assert.deepEqual([tc["unique-id"], tc["full-id"], tc["q-type"], tc["colluder-answer"].transport], [ID, `kc3.fetch-${ID}`, "TXT", "tcp"]);
  const it = parseInteraction(u, DOMAIN, { trusted: true });
  assert.deepEqual([it.tag, it.answer.mode, it.summary], ["fetch", "relay", `A fetch-${SHORT}.${DOMAIN}`]);
});

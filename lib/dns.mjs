// The edge's DNS front. interactsh-server keeps answering every query; the edge
// sits in front of it on :53, relays each query and reply unchanged, and records the ones for
// Colluder's own names (the short id and its correlation ids) with the real resolver's address.
// interactsh then sees those queries from loopback; the collector drops its copies.
//
// Parsing is only for the record: a message the parser can't read is still relayed byte for byte.
import dgram from "node:dgram";
import net from "node:net";

export const TYPES = {
  1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 13: "HINFO", 15: "MX", 16: "TXT", 28: "AAAA", 33: "SRV",
  35: "NAPTR", 41: "OPT", 43: "DS", 46: "RRSIG", 47: "NSEC", 48: "DNSKEY", 52: "TLSA", 64: "SVCB", 65: "HTTPS",
  99: "SPF", 255: "ANY", 257: "CAA",
};
const CLASSES = { 1: "IN", 3: "CH", 4: "HS", 255: "ANY" };
const OPCODES = ["QUERY", "IQUERY", "STATUS", "3", "NOTIFY", "UPDATE"];
const RCODES = ["NOERROR", "FORMERR", "SERVFAIL", "NXDOMAIN", "NOTIMP", "REFUSED", "YXDOMAIN", "YXRRSET", "NXRRSET", "NOTAUTH", "NOTZONE"];
const typeName = (t) => TYPES[t] ?? `TYPE${t}`;
const className = (c) => CLASSES[c] ?? `CLASS${c}`;

function readName(buf, off) {
  const labels = [];
  let pos = off, next = -1, jumps = 0;
  for (;;) {
    if (pos >= buf.length) throw new Error("name runs past the message");
    const len = buf[pos];
    if (len === 0) { pos++; break; }
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= buf.length || ++jumps > 32) throw new Error("bad name pointer");
      if (next < 0) next = pos + 2;
      pos = ((len & 0x3f) << 8) | buf[pos + 1];
      continue;
    }
    if (len > 63 || pos + 1 + len > buf.length) throw new Error("bad label");
    // labels are bytes; anything outside printable ASCII is escaped the way dig does it
    labels.push([...buf.subarray(pos + 1, pos + 1 + len)].map((b) => (b > 0x20 && b < 0x7f && b !== 0x2e && b !== 0x5c ? String.fromCharCode(b) : `\\${String(b).padStart(3, "0")}`)).join(""));
    pos += 1 + len;
  }
  return { name: labels.length ? labels.join(".") + "." : ".", next: next >= 0 ? next : pos };
}

function rdataText(buf, type, start, len) {
  const end = start + len;
  const name = (o) => readName(buf, o).name;
  try {
    switch (type) {
      case 1: return len === 4 ? [...buf.subarray(start, end)].join(".") : null;
      case 28: {
        if (len !== 16) return null;
        const g = []; for (let i = 0; i < 16; i += 2) g.push(buf.readUInt16BE(start + i));
        let best = -1, bestLen = 1;
        for (let i = 0; i < 8; i++) { let j = i; while (j < 8 && g[j] === 0) j++; if (j - i > bestLen) { best = i; bestLen = j - i; } }
        const hex = (a) => a.map((x) => x.toString(16)).join(":");
        return best < 0 ? hex(g) : `${hex(g.slice(0, best))}::${hex(g.slice(best + bestLen))}`;
      }
      case 2: case 5: case 12: return name(start);
      case 15: return `${buf.readUInt16BE(start)} ${name(start + 2)}`;
      case 16: case 99: {
        const parts = []; let p = start;
        while (p < end) { const l = buf[p]; parts.push(`"${buf.subarray(p + 1, p + 1 + l).toString("latin1").replace(/["\\]/g, "\\$&")}"`); p += 1 + l; }
        return parts.join(" ");
      }
      case 6: {
        const m = readName(buf, start), r = readName(buf, m.next);
        const n = [0, 4, 8, 12, 16].map((k) => buf.readUInt32BE(r.next + k));
        return `${m.name} ${r.name} ${n.join(" ")}`;
      }
      case 33: return `${buf.readUInt16BE(start)} ${buf.readUInt16BE(start + 2)} ${buf.readUInt16BE(start + 4)} ${name(start + 6)}`;
      case 257: { const tl = buf[start + 1]; return `${buf[start]} ${buf.subarray(start + 2, start + 2 + tl).toString("latin1")} "${buf.subarray(start + 2 + tl, end).toString("latin1")}"`; }
    }
  } catch { /* fall through to the generic form */ }
  return null;
}

// One DNS message, or throws. rr.text is dig's presentation of the record data.
export function parseMessage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) throw new Error("shorter than a DNS header");
  const id = buf.readUInt16BE(0), flags = buf.readUInt16BE(2);
  const counts = [4, 6, 8, 10].map((o) => buf.readUInt16BE(o));
  let off = 12;
  const question = [];
  for (let i = 0; i < counts[0]; i++) {
    const n = readName(buf, off); off = n.next;
    if (off + 4 > buf.length) throw new Error("question runs past the message");
    question.push({ name: n.name, type: buf.readUInt16BE(off), class: buf.readUInt16BE(off + 2) }); off += 4;
  }
  const section = (count) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const n = readName(buf, off); off = n.next;
      if (off + 10 > buf.length) throw new Error("record runs past the message");
      const type = buf.readUInt16BE(off), cls = buf.readUInt16BE(off + 2), ttl = buf.readUInt32BE(off + 4), len = buf.readUInt16BE(off + 8);
      off += 10;
      if (off + len > buf.length) throw new Error("record data runs past the message");
      out.push({ name: n.name, type, class: cls, ttl, rdata: buf.subarray(off, off + len), text: type === 41 ? null : rdataText(buf, type, off, len) });
      off += len;
    }
    return out;
  };
  const answer = section(counts[1]), authority = section(counts[2]), additional = section(counts[3]);
  return {
    id, qr: !!(flags & 0x8000), opcode: (flags >> 11) & 0xf, rcode: flags & 0xf,
    flags: { qr: !!(flags & 0x8000), aa: !!(flags & 0x400), tc: !!(flags & 0x200), rd: !!(flags & 0x100), ra: !!(flags & 0x80), ad: !!(flags & 0x20), cd: !!(flags & 0x10) },
    question, answer, authority, additional,
  };
}

// The text interactsh-client logs for a DNS message (miekg/dns's String()), so a hit recorded by the
// edge reads like one recorded by the engine.
export function formatMessage(m) {
  const opt = m.additional.find((r) => r.type === 41);
  const extra = m.additional.filter((r) => r.type !== 41);
  const flags = Object.entries(m.flags).filter(([, v]) => v).map(([k]) => k).join(" ");
  const rcode = RCODES[(opt ? ((opt.ttl >>> 24) << 4) : 0) | m.rcode] ?? String(m.rcode);
  const out = [
    `;; opcode: ${OPCODES[m.opcode] ?? m.opcode}, status: ${rcode}, id: ${m.id}`,
    `;; flags:${flags ? " " + flags : ""}; QUERY: ${m.question.length}, ANSWER: ${m.answer.length}, AUTHORITY: ${m.authority.length}, ADDITIONAL: ${m.additional.length}`,
  ];
  if (opt) {
    const version = (opt.ttl >>> 16) & 0xff, doBit = (opt.ttl & 0x8000) !== 0;
    out.push("", ";; OPT PSEUDOSECTION:", `; EDNS: version ${version}; flags:${doBit ? " do" : ""}; udp: ${opt.class}`);
  }
  if (m.question.length) {
    out.push("", ";; QUESTION SECTION:");
    for (const q of m.question) out.push(`;${q.name}\t${className(q.class)}\t ${typeName(q.type)}`);
  }
  const rrs = (title, list) => {
    if (!list.length) return;
    out.push("", `;; ${title} SECTION:`);
    for (const r of list) out.push(`${r.name}\t${r.ttl}\t${className(r.class)}\t${typeName(r.type)}\t${r.text ?? `\\# ${r.rdata.length} ${r.rdata.toString("hex")}`}`);
  };
  rrs("ANSWER", m.answer); rrs("AUTHORITY", m.authority); rrs("ADDITIONAL", extra);
  return out.join("\n") + "\n";
}

// The first question's name without the root dot, and its type, or null for an unreadable query.
export function questionOf(buf) {
  try {
    const m = parseMessage(buf);
    const q = m.question[0];
    return q ? { name: q.name.replace(/\.$/, ""), type: typeName(q.type), message: m } : null;
  } catch { return null; }
}

// ---------- the relay ----------
// owns(qname) -> { uniqueId, fullId } for Colluder's names, else null. record(entry) gets one
// interactsh-shaped line per answered query for those names.
export function dnsFront({ listen, upstream, owns, record, log = () => {}, stats = {}, maxPending = 4096, timeoutMs = 5000 }) {
  stats.dnsQueries ??= 0; stats.dnsOwn ??= 0; stats.dnsErrors ??= 0;
  const servers = [];
  const note = (q, reply, ip, transport, at) => {
    if (!q) return;
    const own = owns(q.name);
    if (!own) return;
    stats.dnsOwn++;
    let raw = "";
    try { raw = reply ? formatMessage(parseMessage(reply)) : ""; } catch { raw = reply ? `;; unreadable reply, ${reply.length} bytes: ${reply.toString("hex")}\n` : ""; }
    record({
      protocol: "dns", "unique-id": own.uniqueId, "full-id": own.fullId, "q-type": q.type,
      "raw-request": formatMessage(q.message), "raw-response": raw,
      "remote-address": ip, timestamp: at,
      // interactsh wrote the answer; the edge relayed it and is the one that recorded the query
      "colluder-answer": { by: "interactsh", mode: "relay", version: null, transport },
    });
  };

  // UDP: one upstream socket; queries get a fresh id on the way up and their own back on the way down
  const family = net.isIPv6(listen.host) ? "udp6" : "udp4";
  const udp = dgram.createSocket({ type: family, reuseAddr: false });
  const up = dgram.createSocket(net.isIPv6(upstream.host) ? "udp6" : "udp4");
  const pending = new Map();
  let nextId = Math.floor(Math.random() * 0x10000);
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, p] of pending) if (now - p.t > timeoutMs) pending.delete(k);
  }, 1000);
  sweep.unref?.();
  udp.on("message", (msg, rinfo) => {
    stats.dnsQueries++;
    if (msg.length < 12 || pending.size >= maxPending) { stats.dnsErrors++; return; }
    let id = -1;
    for (let i = 0; i < 0x10000; i++) { const c = (nextId + i) & 0xffff; if (!pending.has(c)) { id = c; break; } }
    if (id < 0) { stats.dnsErrors++; return; }
    nextId = (id + 1) & 0xffff;
    pending.set(id, { rinfo, origId: msg.readUInt16BE(0), q: questionOf(msg), t: Date.now(), at: new Date().toISOString() });
    const fwd = Buffer.from(msg); fwd.writeUInt16BE(id, 0);
    up.send(fwd, upstream.port, upstream.host);
  });
  up.on("message", (msg) => {
    if (msg.length < 12) return;
    const p = pending.get(msg.readUInt16BE(0));
    if (!p) return;
    pending.delete(msg.readUInt16BE(0));
    const back = Buffer.from(msg); back.writeUInt16BE(p.origId, 0);
    udp.send(back, p.rinfo.port, p.rinfo.address);
    try { note(p.q, back, p.rinfo.address.replace(/^::ffff:/, ""), "udp", p.at); } catch (e) { stats.dnsErrors++; log("dns record failed:", e.message); }
  });
  udp.on("error", (e) => { log("dns udp error:", e.message); stats.dnsErrors++; });
  up.on("error", (e) => { log("dns upstream error:", e.message); stats.dnsErrors++; });

  // TCP: a byte pipe both ways; the length-prefixed messages are read on the side for the record
  const frames = (onMsg) => {
    let buf = Buffer.alloc(0);
    return (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 2) {
        const n = buf.readUInt16BE(0);
        if (buf.length < 2 + n) break;
        onMsg(buf.subarray(2, 2 + n));
        buf = buf.subarray(2 + n);
      }
      if (buf.length > 70_000) buf = Buffer.alloc(0); // not DNS: stop reading, keep relaying
    };
  };
  const tcp = net.createServer((sock) => {
    sock.on("error", () => {});
    const ip = sock.remoteAddress?.replace(/^::ffff:/, "") ?? "";
    const asked = new Map();
    const conn = net.connect({ host: upstream.host, port: upstream.port });
    conn.on("error", () => sock.destroy());
    sock.setTimeout(30_000, () => sock.destroy());
    sock.on("data", frames((m) => { stats.dnsQueries++; if (m.length >= 12 && asked.size < 256) asked.set(m.readUInt16BE(0), { q: questionOf(m), at: new Date().toISOString() }); }));
    conn.on("data", frames((m) => {
      if (m.length < 12) return;
      const a = asked.get(m.readUInt16BE(0));
      if (!a) return;
      asked.delete(m.readUInt16BE(0));
      try { note(a.q, m, ip, "tcp", a.at); } catch (e) { stats.dnsErrors++; log("dns record failed:", e.message); }
    }));
    sock.pipe(conn); conn.pipe(sock);
    sock.on("close", () => conn.destroy());
    conn.on("close", () => sock.destroy());
  });
  tcp.maxConnections = 256;
  tcp.on("error", (e) => { log("dns tcp error:", e.message); stats.dnsErrors++; });
  servers.push(udp, tcp);

  return {
    listen: () => Promise.all([
      new Promise((ok, no) => { udp.once("error", no); udp.bind(listen.port, listen.host, () => { udp.off("error", no); ok(); }); }),
      new Promise((ok, no) => { tcp.once("error", no); tcp.listen(listen.port, listen.host, () => { tcp.off("error", no); ok(); }); }),
    ]),
    address: () => ({ udp: udp.address(), tcp: tcp.address() }),
    close: () => { clearInterval(sweep); try { udp.close(); } catch { /* closed */ } try { up.close(); } catch { /* closed */ } tcp.close(); },
  };
}

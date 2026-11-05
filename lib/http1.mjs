// Minimal HTTP/1.x request reader for the edge. It keeps the exact bytes it read, because those
// bytes are the evidence. Internet-facing: every wait has a size cap and a deadline.

export const LIMITS = { head: 32 * 1024, record: 1024 * 1024, consume: 8 * 1024 * 1024 };

export class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

// Wraps a socket and buffers what it reads. pause() while the buffer is large keeps memory bounded.
export class Reader {
  constructor(sock, { highWater = 2 * 1024 * 1024 } = {}) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.ended = false;
    this.err = null;
    this.wake = null;
    this.high = highWater;
    this.onData = (d) => {
      this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
      if (this.buf.length > this.high) sock.pause();
      this.notify();
    };
    this.onEnd = () => { this.ended = true; this.notify(); };
    this.onErr = (e) => { this.err = e; this.ended = true; this.notify(); };
    sock.on("data", this.onData);
    sock.on("end", this.onEnd);
    sock.on("close", this.onEnd);
    sock.on("error", this.onErr);
  }
  notify() { const w = this.wake; this.wake = null; w?.(); }
  // waits for more bytes (or end); rejects at the deadline
  more(deadline) {
    if (this.ended) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const ms = deadline - Date.now();
      if (ms <= 0) return reject(new HttpError(408, "timeout"));
      const t = setTimeout(() => { this.wake = null; reject(new HttpError(408, "timeout")); }, ms);
      this.wake = () => { clearTimeout(t); resolve(true); };
      this.sock.resume();
    });
  }
  take(n) {
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    if (this.buf.length < this.high) this.sock.resume();
    return out;
  }
  // stop listening; returns whatever was buffered but not consumed
  detach() {
    this.sock.off("data", this.onData);
    this.sock.off("end", this.onEnd);
    this.sock.off("close", this.onEnd);
    this.sock.off("error", this.onErr);
    const rest = this.buf;
    this.buf = Buffer.alloc(0);
    return rest;
  }
}

function headEnd(buf) {
  const a = buf.indexOf("\r\n\r\n");
  const b = buf.indexOf("\n\n");
  if (a === -1 && b === -1) return null;
  if (a !== -1 && (b === -1 || a <= b)) return { at: a, len: 4 };
  return { at: b, len: 2 };
}

const REQ_LINE = /^([A-Za-z]{1,20}) (\S{1,16384}) HTTP\/(\d)\.(\d)$/;
const HDR = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*?)[ \t]*$/;

// Reads one request head. Returns { raw, method, target, version, headers: [[name, value]], get(name) }.
// Returns null if the peer closed before sending anything.
export async function readHead(r, deadline, max = LIMITS.head) {
  for (;;) {
    // tolerate stray CRLFs between requests (RFC 9112 §2.2)
    while (r.buf.length && (r.buf[0] === 0x0d || r.buf[0] === 0x0a)) r.take(1);
    const e = headEnd(r.buf);
    if (e) {
      if (e.at > max) throw new HttpError(431, "head too large");
      // parse before consuming, so a head we can't route is still there to relay untouched
      const head = parseHead(r.buf.subarray(0, e.at + e.len));
      r.take(e.at + e.len);
      return head;
    }
    if (r.buf.length > max) throw new HttpError(431, "head too large");
    if (!(await r.more(deadline))) {
      if (!r.buf.length) return null;
      throw new HttpError(400, "incomplete head");
    }
  }
}

export function parseHead(raw) {
  const text = raw.toString("latin1");
  const lines = text.split(/\r?\n/);
  const m = REQ_LINE.exec(lines[0]);
  if (!m) throw new HttpError(400, "bad request line");
  const headers = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    if (line[0] === " " || line[0] === "\t") throw new HttpError(400, "obsolete line folding");
    const h = HDR.exec(line);
    if (!h) throw new HttpError(400, "bad header");
    headers.push([h[1], h[2]]);
  }
  if (headers.length > 200) throw new HttpError(431, "too many headers");
  const get = (name) => {
    const n = name.toLowerCase();
    const all = headers.filter(([k]) => k.toLowerCase() === n).map(([, v]) => v);
    return all.length ? all : null;
  };
  return { raw, method: m[1].toUpperCase(), target: m[2], version: `${m[3]}.${m[4]}`, headers, get };
}

// Body framing per RFC 9112 §6. Returns "none" | { length } | "chunked"; throws on ambiguity.
export function framing(head) {
  const te = head.get("transfer-encoding");
  const cl = head.get("content-length");
  if (te) {
    if (cl) throw new HttpError(400, "both Transfer-Encoding and Content-Length");
    const codings = te.join(",").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (codings[codings.length - 1] !== "chunked") throw new HttpError(400, "unsupported transfer coding");
    return "chunked";
  }
  if (cl) {
    const vals = new Set(cl.join(",").split(",").map((s) => s.trim()));
    if (vals.size !== 1) throw new HttpError(400, "conflicting Content-Length");
    const v = [...vals][0];
    if (!/^\d{1,12}$/.test(v)) throw new HttpError(400, "bad Content-Length");
    return { length: Number(v) };
  }
  return "none";
}

// Reads the body as it appeared on the wire (chunk framing included). Keeps up to `record` bytes,
// consumes up to `consume` bytes, and reports how much was dropped.
// onBytes (optional) sees every consumed slice, for relaying.
export async function readBody(r, head, deadline, { record = LIMITS.record, consume = LIMITS.consume, onBytes } = {}) {
  const f = framing(head);
  const kept = [];
  let keptLen = 0, total = 0;
  const eat = (n) => {
    const b = r.take(n);
    total += b.length;
    if (total > consume) throw new HttpError(413, "body too large");
    if (keptLen < record) { const k = b.subarray(0, record - keptLen); kept.push(k); keptLen += k.length; }
    onBytes?.(b);
    return b;
  };
  const need = async (n) => { while (r.buf.length < n) if (!(await r.more(deadline))) throw new HttpError(400, "body cut short"); };
  if (f === "none") return { body: Buffer.alloc(0), dropped: 0 };
  if (typeof f === "object") {
    if (f.length > consume) throw new HttpError(413, "body too large");
    let left = f.length;
    while (left > 0) {
      if (!r.buf.length) await need(1);
      left -= eat(Math.min(left, r.buf.length)).length;
    }
  } else {
    for (;;) {
      let nl;
      while ((nl = r.buf.indexOf("\n")) === -1) {
        if (r.buf.length > 1024) throw new HttpError(400, "bad chunk size line");
        await need(r.buf.length + 1);
      }
      const line = eat(nl + 1).toString("latin1").replace(/\r?\n$/, "");
      const size = parseInt(line.split(";")[0].trim(), 16);
      if (!/^[0-9a-fA-F]{1,8}$/.test(line.split(";")[0].trim()) || Number.isNaN(size)) throw new HttpError(400, "bad chunk size");
      if (size === 0) {
        // trailers until an empty line
        for (;;) {
          while ((nl = r.buf.indexOf("\n")) === -1) {
            if (r.buf.length > 8192) throw new HttpError(400, "trailers too large");
            await need(r.buf.length + 1);
          }
          const t = eat(nl + 1).toString("latin1");
          if (t === "\r\n" || t === "\n") break;
        }
        break;
      }
      let left = size;
      while (left > 0) {
        if (!r.buf.length) await need(1);
        left -= eat(Math.min(left, r.buf.length)).length;
      }
      await need(1);
      // chunk data is followed by CRLF
      while (r.buf.length < 2 && !(r.buf[0] === 0x0a)) await need(r.buf.length + 1);
      if (r.buf[0] === 0x0d && r.buf[1] === 0x0a) eat(2);
      else if (r.buf[0] === 0x0a) eat(1);
      else throw new HttpError(400, "missing CRLF after chunk");
    }
  }
  return { body: Buffer.concat(kept), dropped: total - keptLen };
}

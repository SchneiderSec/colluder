// Colluder's SMTP receiver (PLAN-MAILBOX.md), run by the edge on :25/:587 (STARTTLS) and :465
// (implicit TLS). Receive only: it never relays or sends. A recipient is accepted only when its domain
// is one of Colluder's names (owns()), so an MX lookup's mail for a probe or the mailbox lands here
// and nothing else does. deliver() must have the message on disk before it resolves: the sender gets
// 250 only after that, so a box that drops right after still has the mail (or the sender retries).
import net from "node:net";
import tls from "node:tls";
import { randomBytes } from "node:crypto";

export const SMTP_LIMITS = { maxSize: 10 * 1024 * 1024, maxRcpt: 50, maxConns: 24, idleMs: 5 * 60_000, sessionMs: 15 * 60_000, maxLine: 4096, maxErrors: 10 };

// <addr> from "FROM:<a@b> SIZE=1" / "TO: <a@b>"; null when malformed. The null sender <> is "".
export function pathArg(rest) {
  const m = /^\s*<([^<>]*)>\s*(.*)$/.exec(rest) || /^\s*([^\s<>]+)\s*(.*)$/.exec(rest);
  if (!m) return null;
  let addr = m[1].trim();
  addr = addr.replace(/^@[^:]+:/, ""); // source route (RFC 5321 §4.1.2): ignored
  const params = {};
  for (const p of (m[2] || "").split(/\s+/).filter(Boolean)) { const i = p.indexOf("="); params[(i < 0 ? p : p.slice(0, i)).toUpperCase()] = i < 0 ? true : p.slice(i + 1); }
  return { addr, params };
}

const CRLF = Buffer.from("\r\n");
const newId = () => Date.now().toString(36) + randomBytes(5).toString("hex");

// opts: { hostname, owns(domain) → { uniqueId, fullId } | null, tlsOptions() → tls server options | null,
//         deliver({ id, at, helo, mailFrom, rcpts: [{ address, own }], data: Buffer, remoteAddress, port, tls }) → Promise,
//         log, stats, limits }
export function smtpSession(sock, opts, { port = 25, implicitTls = false } = {}) {
  const L = { ...SMTP_LIMITS, ...(opts.limits || {}) };
  const stats = opts.stats || {};
  const ip = String(sock.remoteAddress || "").replace(/^::ffff:/, "");
  let conn = sock;
  let buf = Buffer.alloc(0);
  let mode = "cmd"; // cmd | data | closed
  let helo = null, esmtp = false, from = null, rcpts = [], errors = 0;
  let tlsOn = implicitTls ? (sock.getProtocol?.() || "TLS") : null;
  let data = [], dataSize = 0, overSize = false;
  let busy = false;

  const write = (s) => { if (mode !== "closed" && !conn.destroyed) conn.write(s + "\r\n"); };
  const close = (s) => { if (s) write(s); mode = "closed"; conn.end(); };
  const reset = () => { from = null; rcpts = []; data = []; dataSize = 0; overSize = false; };
  const idle = () => close("421 4.4.2 Idle too long, closing");
  conn.setTimeout(L.idleMs, idle);
  const whole = setTimeout(() => close("421 4.4.2 Session too long, closing"), L.sessionMs);
  whole.unref?.();
  sock.on("close", () => clearTimeout(whole));
  sock.on("error", () => {});

  const bad = (s) => { write(s); if (++errors >= L.maxErrors) close("421 4.7.0 Too many errors, closing"); };

  function ehloLines(name) {
    const ext = ["PIPELINING", `SIZE ${L.maxSize}`, "8BITMIME", "SMTPUTF8", "ENHANCEDSTATUSCODES"];
    if (!tlsOn && opts.tlsOptions?.()) ext.push("STARTTLS");
    return [`${opts.hostname} Hello ${name}`, ...ext];
  }

  function startTls() {
    const o = opts.tlsOptions?.();
    if (!o) return bad("454 4.7.0 TLS not available");
    if (tlsOn) return bad("503 5.5.1 Already in TLS");
    buf = Buffer.alloc(0); // RFC 3207 §4.2: nothing sent before the handshake counts after it
    write("220 2.0.0 Ready to start TLS");
    conn.removeListener("data", onData);
    conn.setTimeout(0);
    const t = new tls.TLSSocket(conn, { isServer: true, ...o });
    t.on("error", () => { mode = "closed"; sock.destroy(); });
    t.once("secure", () => {
      tlsOn = t.getProtocol() || "TLS";
      helo = null; esmtp = false; reset(); // §4.2: the client starts over with EHLO
      conn = t;
      conn.setTimeout(L.idleMs, idle);
      conn.on("data", onData);
    });
  }

  async function command(line) {
    const sp = line.indexOf(" ");
    const verb = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
    const rest = sp < 0 ? "" : line.slice(sp + 1);
    switch (verb) {
      case "EHLO": case "HELO": {
        const name = rest.trim().slice(0, 255) || "unknown";
        helo = name; esmtp = verb === "EHLO"; reset();
        if (!esmtp) return write(`250 ${opts.hostname} Hello ${name}`);
        const lines = ehloLines(name);
        return write(lines.map((l, i) => `250${i === lines.length - 1 ? " " : "-"}${l}`).join("\r\n"));
      }
      case "STARTTLS": return startTls();
      case "MAIL": {
        if (!/^FROM:/i.test(rest)) return bad("501 5.5.4 Syntax: MAIL FROM:<address>");
        if (from !== null) return bad("503 5.5.1 Nested MAIL command");
        const p = pathArg(rest.slice(5));
        if (!p) return bad("501 5.1.7 Bad sender address syntax");
        if (p.params.SIZE && Number(p.params.SIZE) > L.maxSize) return write(`552 5.3.4 Message size exceeds fixed limit of ${L.maxSize}`);
        from = p.addr.slice(0, 512);
        return write("250 2.1.0 Ok");
      }
      case "RCPT": {
        if (!/^TO:/i.test(rest)) return bad("501 5.5.4 Syntax: RCPT TO:<address>");
        if (from === null) return bad("503 5.5.1 Need MAIL before RCPT");
        const p = pathArg(rest.slice(3));
        if (!p || !p.addr.includes("@") || p.addr.length > 512) return bad("501 5.1.3 Bad recipient address syntax");
        if (rcpts.length >= L.maxRcpt) return write("452 4.5.3 Too many recipients");
        const domain = p.addr.slice(p.addr.lastIndexOf("@") + 1).toLowerCase().replace(/\.$/, "");
        const own = opts.owns(domain);
        if (!own) { stats.smtpRefused = (stats.smtpRefused || 0) + 1; return bad("550 5.1.1 No such mailbox here"); }
        rcpts.push({ address: p.addr, own });
        return write("250 2.1.5 Ok");
      }
      case "DATA": {
        if (from === null) return bad("503 5.5.1 Need MAIL before DATA");
        if (!rcpts.length) return bad("554 5.5.1 No valid recipients");
        mode = "data"; data = []; dataSize = 0; overSize = false;
        return write("354 End data with <CR><LF>.<CR><LF>");
      }
      case "RSET": reset(); return write("250 2.0.0 Ok");
      case "NOOP": return write("250 2.0.0 Ok");
      case "QUIT": return close("221 2.0.0 Bye");
      case "VRFY": return write("252 2.5.2 Cannot VRFY user, but will accept message");
      case "HELP": return write("214 2.0.0 Colluder receives mail for its own names only");
      case "AUTH": return bad("502 5.5.1 Authentication not offered: this server only receives");
      case "BDAT": return bad("502 5.5.1 BDAT not offered");
      default: return bad("500 5.5.2 Command not recognised");
    }
  }

  async function endData() {
    mode = "cmd";
    if (overSize) { reset(); return write(`552 5.3.4 Message size exceeds fixed limit of ${L.maxSize}`); }
    const body = Buffer.concat(data);
    const msg = { id: newId(), at: new Date().toISOString(), helo, esmtp, mailFrom: from, rcpts, data: body, remoteAddress: ip, port, tls: tlsOn };
    reset();
    try {
      await opts.deliver(msg);
      stats.smtpMessages = (stats.smtpMessages || 0) + 1;
      write(`250 2.0.0 Ok: queued as ${msg.id}`);
    } catch (e) {
      stats.smtpErrors = (stats.smtpErrors || 0) + 1;
      opts.log?.(`smtp: couldn't store a message from ${ip}: ${e.message}`);
      write("451 4.3.0 Couldn't store the message, try again later");
    }
  }

  // one line at a time; DATA lines are kept as bytes (8BITMIME), dot-unstuffed, CRLF-terminated
  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (mode !== "closed") {
        const nl = buf.indexOf(10);
        if (nl === -1) {
          if (mode === "cmd" && buf.length > L.maxLine) { buf = Buffer.alloc(0); bad("500 5.5.2 Line too long"); }
          break;
        }
        let line = buf.subarray(0, nl);
        buf = buf.subarray(nl + 1);
        if (line[line.length - 1] === 13) line = line.subarray(0, line.length - 1);
        if (mode === "data") {
          if (line.length === 1 && line[0] === 46) { await endData(); continue; }
          if (line[0] === 46) line = line.subarray(1);
          dataSize += line.length + 2;
          if (dataSize > L.maxSize) { overSize = true; data = []; continue; }
          data.push(line, CRLF);
          continue;
        }
        if (line.length > L.maxLine) { bad("500 5.5.2 Line too long"); continue; }
        await command(line.toString("utf8").trim());
      }
    } finally { busy = false; }
    if (buf.indexOf(10) !== -1 && mode !== "closed") pump();
  }

  function onData(d) {
    buf = buf.length ? Buffer.concat([buf, d]) : d;
    pump();
  }
  conn.on("data", onData);
  write(`220 ${opts.hostname} ESMTP Colluder (receive only)`);
}

// Listeners for each address: { host, port, implicitTls }. Returns { listen(), close() }.
export function smtpFront(opts) {
  const L = { ...SMTP_LIMITS, ...(opts.limits || {}) };
  const servers = [];
  let open = 0;
  const admit = (sock, port, implicitTls) => {
    if (open >= L.maxConns) { sock.on("error", () => {}); sock.end("421 4.7.0 Too many connections, try again later\r\n"); return; }
    open++;
    sock.on("close", () => open--);
    smtpSession(sock, opts, { port, implicitTls });
  };
  for (const l of opts.listen) {
    let srv;
    if (l.implicitTls) {
      const o = opts.tlsOptions?.();
      if (!o) continue; // no certificate: no implicit-TLS port
      srv = tls.createServer(o, (s) => admit(s, l.port, true));
      srv.on("tlsClientError", () => {});
    } else {
      srv = net.createServer((s) => admit(s, l.port, false));
    }
    srv.maxConnections = L.maxConns + 8;
    servers.push({ srv, l });
  }
  return {
    listen: () => Promise.all(servers.map(({ srv, l }) => new Promise((ok, no) => {
      srv.once("error", no);
      srv.listen(l.port, l.host, () => { srv.off("error", no); ok(); });
    }))),
    close: () => { for (const { srv } of servers) srv.close(); },
    // a renewed certificate: STARTTLS reads tlsOptions() each time; the implicit-TLS servers need telling
    setContext: (o) => { for (const { srv, l } of servers) if (l.implicitTls) srv.setSecureContext(o); },
    get open() { return open; },
  };
}

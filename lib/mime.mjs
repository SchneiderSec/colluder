// Reading a received message: headers, the text and HTML bodies, attachments by
// name, and what a mailbox reader wants from a sign-up or login mail: the one-time code and the
// magic link. No dependencies; RFC 5322 headers, RFC 2045-2047 MIME, RFC 2231 parameters, enough of
// each for real senders (Gmail, SES, SendGrid, Postmark, Mailgun) rather than every corner.
//
// Everything here is attacker-chosen text. It is parsed, never executed; the HTML body is stored and
// shown as text only.

const MAX_DEPTH = 8;
const MAX_PARTS = 200;

// ---------- headers ----------
// [[name, value]] in order, folded lines joined (RFC 5322 §2.2.3); values stay raw (encoded words kept)
export function splitHeaders(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && out.length) out[out.length - 1][1] += " " + line.trim();
    else {
      const i = line.indexOf(":");
      if (i > 0) out.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return out;
}
const header = (hs, name) => hs.find(([n]) => n.toLowerCase() === name)?.[1] ?? null;

function decodeBytes(bytes, charset) {
  const cs = String(charset || "utf-8").trim().toLowerCase().replace(/^"|"$/g, "");
  try { return new TextDecoder(cs === "us-ascii" || cs === "ascii" ? "utf-8" : cs).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

// RFC 2047 encoded words (=?utf-8?B?...?= / =?iso-8859-1?Q?...?=); adjacent words join without the space
export function decodeWords(s) {
  if (!s || !s.includes("=?")) return s ?? "";
  return String(s)
    .replace(/(=\?[^?\s]+\?[bq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[bq]\?)/gi, "$1")
    .replace(/=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi, (m, cs, enc, data) => {
      try {
        const bytes = enc.toLowerCase() === "b" ? Buffer.from(data, "base64")
          : Buffer.from(data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
        return decodeBytes(bytes, cs.split("*")[0]);
      } catch { return m; }
    });
}

// "text/plain; charset=utf-8; name*=utf-8''r%C3%A9sum%C3%A9.pdf" → { value, params }
export function parseParams(v) {
  const s = String(v || "");
  const parts = [];
  let cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && s[i - 1] !== "\\") q = !q;
    if (c === ";" && !q) { parts.push(cur); cur = ""; } else cur += c;
  }
  parts.push(cur);
  const params = {};
  const cont = {};
  for (const p of parts.slice(1)) {
    const i = p.indexOf("=");
    if (i < 0) continue;
    let k = p.slice(0, i).trim().toLowerCase();
    let val = p.slice(i + 1).trim();
    if (val.startsWith('"')) val = val.slice(1, -1).replace(/\\(.)/g, "$1");
    const m = /^([^*]+)\*(\d+)?(\*)?$/.exec(k);
    if (m) { // RFC 2231: name*0*=..., name*=charset'lang'value
      const [, base, idx, ext] = m;
      let piece = val;
      if (ext || (!idx && k.endsWith("*"))) {
        const e = /^([^']*)'[^']*'(.*)$/.exec(val);
        const cs = e ? e[1] : (cont[base]?.cs || "utf-8");
        const raw = e ? e[2] : val;
        try { piece = decodeBytes(Buffer.from(raw.replace(/%([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1"), cs || "utf-8"); } catch { piece = raw; }
        cont[base] = { cs: cs || "utf-8", parts: cont[base]?.parts || [] };
      } else cont[base] = cont[base] || { cs: "utf-8", parts: [] };
      cont[base].parts[Number(idx || 0)] = piece;
      continue;
    }
    params[k] = decodeWords(val);
  }
  for (const [k, c] of Object.entries(cont)) params[k] = c.parts.join("");
  return { value: parts[0].trim().toLowerCase(), params };
}

// ---------- bodies ----------
export function decodeQP(buf) {
  const s = buf.toString("latin1").replace(/=\r?\n/g, "");
  return Buffer.from(s.replace(/=([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
}
function decodeTransfer(buf, cte) {
  const e = String(cte || "").trim().toLowerCase();
  if (e === "base64") return Buffer.from(buf.toString("latin1").replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  if (e === "quoted-printable") return decodeQP(buf);
  return buf;
}

// split head from body at the first blank line (CRLF or bare LF)
function headBody(buf) {
  const s = buf.toString("latin1");
  const m = /\r?\n\r?\n/.exec(s);
  if (!m) return { head: s, body: Buffer.alloc(0) };
  return { head: s.slice(0, m.index), body: buf.subarray(m.index + m[0].length) };
}

function splitMultipart(body, boundary) {
  const s = body.toString("latin1");
  const delim = "--" + boundary;
  const parts = [];
  let pos = s.indexOf(delim);
  while (pos !== -1 && parts.length < MAX_PARTS) {
    let start = pos + delim.length;
    if (s.startsWith("--", start)) break; // the closing delimiter
    start = s.indexOf("\n", start);
    if (start === -1) break;
    start += 1;
    let next = s.indexOf("\n" + delim, start - 1);
    if (next === -1) { parts.push(body.subarray(start)); break; } // unterminated: keep what came
    const end = s[next - 1] === "\r" ? next - 1 : next;
    parts.push(body.subarray(start, Math.max(start, end)));
    pos = next + 1;
  }
  return parts;
}

// The whole message → { headers, subject, from, to, cc, date, messageId, text, html, attachments }
export function parseMail(raw) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), "utf8");
  const top = headBody(buf);
  const headers = splitHeaders(top.head).map(([n, v]) => [n, v]);
  const out = { headers, text: null, html: null, attachments: [], truncated: false };
  let count = 0;
  const walk = (hs, body, depth) => {
    if (++count > MAX_PARTS || depth > MAX_DEPTH) { out.truncated = true; return; }
    const ct = parseParams(header(hs, "content-type") || "text/plain; charset=us-ascii");
    const cd = parseParams(header(hs, "content-disposition") || "");
    const name = cd.params.filename || ct.params.name || null;
    if (ct.value.startsWith("multipart/") && ct.params.boundary) {
      for (const p of splitMultipart(body, ct.params.boundary)) {
        const hb = headBody(p);
        walk(splitHeaders(hb.head), hb.body, depth + 1);
      }
      return;
    }
    const data = decodeTransfer(body, header(hs, "content-transfer-encoding"));
    const inline = cd.value !== "attachment" && !(name && !ct.value.startsWith("text/"));
    if (inline && ct.value === "text/plain" && out.text === null) { out.text = decodeBytes(data, ct.params.charset); return; }
    if (inline && ct.value === "text/html" && out.html === null) { out.html = decodeBytes(data, ct.params.charset); return; }
    if (depth === 0 && ct.value.startsWith("text/") && out.text === null) { out.text = decodeBytes(data, ct.params.charset); return; }
    out.attachments.push({ filename: name ? decodeWords(name).slice(0, 200) : null, contentType: ct.value.slice(0, 100), size: data.length });
  };
  walk(headers, top.body, 0);
  const h = (n) => { const v = header(headers, n); return v === null ? null : decodeWords(v); };
  Object.assign(out, { subject: h("subject"), from: h("from"), to: h("to"), cc: h("cc"), date: h("date"), messageId: h("message-id") });
  return out;
}

// ---------- HTML as text ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", zwnj: "", zwj: "", shy: "", copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·", euro: "€", pound: "£" };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    const v = ENT[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}
export function htmlToText(html) {
  return decodeEntities(String(html || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|blockquote)\s*>/gi, "\n")
    .replace(/<(td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, ""))
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
}

// ---------- what a mailbox reader wants ----------
const CODE_WORDS = /\b(code|otp|passcode|pass code|pin|verification|verify|one[- ]time|security|login|log-in|sign[- ]in|confirm|confirmation|2fa|mfa|two[- ]factor|token|authenticat\w*|c[oó]digo|kode|codice)\b/i;
const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;

// One-time codes: runs of 4 to 8 digits (also "123 456" and "123-456"), scored by the words in front
// of them. Digits inside links, prices, times, dates, phone numbers and colours don't count.
export function extractCodes(subject, text) {
  const found = new Map();
  const scan = (src, inSubject) => {
    const s = String(src || "").replace(URL_RE, " ");
    const re = /(?<![\w#$€£.,:/+-])(\d{3}[ -]\d{3}|\d{4,8})(?![\w%/:]|[.,]\d|-\d)/g;
    for (let m; (m = re.exec(s));) {
      const value = m[1].replace(/[ -]/g, "");
      if (value.length < 4 || value.length > 8) continue;
      const before = s.slice(Math.max(0, m.index - 80), m.index);
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 40);
      let score = 0;
      if (CODE_WORDS.test(before)) score += 10;
      else if (CODE_WORDS.test(after.split("\n")[0])) score += 7; // "Use 123 456 to sign in"
      if (/^\s*(is|:)/i.test(after) && CODE_WORDS.test(before + after)) score += 2;
      if (/(code|pin|otp|passcode)\b[^\n]{0,20}$/i.test(before)) score += 5;
      if (inSubject) score += 4;
      if (value.length === 6) score += 3;
      if (/^\s*\n|^\s*$/.test(after) && /\n\s*$/.test(before)) score += 3; // alone on its line
      if (value.length === 4 && /^(19|20)\d\d$/.test(value)) score -= 6;  // a year
      if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s*$/i.test(before) || /^\s*(am|pm|utc|gmt)\b/i.test(after)) score -= 8;
      if (/(#|no\.?|number|order|invoice|ref\w*|ticket|case|id)\s*:?\s*$/i.test(before) && !CODE_WORDS.test(before.slice(-30))) score -= 6;
      if (/(phone|tel|call|fax)\b[^\n]{0,20}$/i.test(before)) score -= 8;
      if (/(©|copyright|suite|street|st\.|ave|po box|zip)\b[^\n]{0,20}$/i.test(before)) score -= 6;
      const prev = found.get(value);
      const context = (before.slice(-40) + "[" + m[0] + "]" + after.slice(0, 20)).replace(/\s+/g, " ").trim();
      if (!prev || score > prev.score) found.set(value, { value, score, context });
    }
  };
  scan(subject, true);
  scan(text, false);
  const codes = [...found.values()].sort((a, b) => b.score - a.score || (a.value.length === 6 ? -1 : 1));
  return { code: codes[0] && codes[0].score >= 8 ? codes[0].value : null, codes: codes.slice(0, 10) };
}

const LINK_GOOD = /(verif|confirm|activat|magic|log-?in|sign-?in|signin|auth|token|validat|reset|password|passwordless|otp|session|invit|accept|continue|approve|onboard|welcome|callback|email[-_]?(change|update)|one[-_]?time)/i;
const LINK_BAD = /(unsubscribe|opt-?out|preferences|privacy|terms|legal|help|support|faq|contact|careers|blog|facebook|twitter|x\.com\/|linkedin|instagram|youtube|tiktok|apps\.apple|play\.google|\.(png|jpe?g|gif|svg|webp|ico)(\?|$)|open\.(gif|png)|pixel|track(ing)?\/open|beacon)/i;
const TOKEN_PARAM = /[?&#](token|code|key|t|otp|nonce|signature|sig|hash|ticket|oobcode|confirmation_token|reset_password_token|magic|auth|state)=[^&#]{6,}/i;

// Links: every href and every bare URL, with the anchor text, scored so the magic link comes first
export function extractLinks(html, text) {
  const all = new Map();
  const add = (url, label, fromHtml) => {
    const u = decodeEntities(String(url).trim()).replace(/[.,;:!?]+$/, "");
    if (!/^https?:\/\//i.test(u) || u.length > 4096) return;
    const prev = all.get(u);
    const lab = String(label || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (prev) { if (!prev.label && lab) prev.label = lab; return; }
    let score = 0;
    if (LINK_GOOD.test(u)) score += 6;
    if (LINK_GOOD.test(lab)) score += 8;
    if (TOKEN_PARAM.test(u)) score += 6;
    if (/[A-Za-z0-9_-]{24,}/.test(u.replace(/^https?:\/\/[^/]+/, ""))) score += 3; // a long opaque token in the path or query
    if (LINK_BAD.test(u) || LINK_BAD.test(lab)) score -= 12;
    if (fromHtml) score += 1;
    all.set(u, { url: u, label: lab || null, score });
  };
  if (html) {
    const re = /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
    for (let m; (m = re.exec(html));) add(m[2] ?? m[3] ?? m[4], htmlToText(m[5]), true);
  }
  for (const src of [text, html ? htmlToText(html) : ""]) for (const m of String(src || "").matchAll(URL_RE)) add(m[0], "", false);
  const links = [...all.values()].sort((a, b) => b.score - a.score);
  return { link: links[0] && links[0].score >= 6 ? links[0].url : null, links: links.slice(0, 20) };
}

// The address's parts: local part (case kept, compared lower-cased) and the domain
export function splitAddress(addr) {
  const a = String(addr || "").trim().replace(/^<|>$/g, "");
  const at = a.lastIndexOf("@");
  return at < 1 ? { local: a, domain: "" } : { local: a.slice(0, at), domain: a.slice(at + 1).toLowerCase().replace(/\.$/, "") };
}

// Everything the mailbox stores about one message
export function readMail(raw) {
  const m = parseMail(raw);
  const text = m.text ?? (m.html ? htmlToText(m.html) : "");
  const { code, codes } = extractCodes(m.subject, text);
  const { link, links } = extractLinks(m.html, m.text);
  return { ...m, text: m.text, textView: text, code, codes, link, links };
}

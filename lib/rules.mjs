// HTTP answer rules: validation and the exact response the edge sends. Shared by the edge (which
// answers) and the dashboard (which previews), so the preview is the answer, not a guess.

export const MODES = ["default", "redirect", "custom", "file"];
export const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const LOCATION_SCHEMES = /^(https?|gopher|dict|file|ftp|ldap):/i;
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;
const EDGE_HEADERS = new Set(["content-length", "transfer-encoding", "connection"]);
export const MAX_BODY = 256 * 1024;
export const MAX_DELAY = 60_000;
export const MAX_LOOP = 20;

const REASONS = {
  100: "Continue", 101: "Switching Protocols", 200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
  206: "Partial Content", 301: "Moved Permanently", 302: "Found", 303: "See Other", 304: "Not Modified",
  307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
  404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout", 413: "Content Too Large", 418: "I'm a teapot",
  429: "Too Many Requests", 500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway",
  503: "Service Unavailable", 504: "Gateway Timeout",
};
export const reason = (s) => REASONS[s] || "Status";

const bad = (error) => ({ error });
const int = (v) => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN);
// one header line: printable Latin-1 only (the head is written as Latin-1 bytes)
const clean = (s) => /^[\t\x20-\x7e\xa0-\xff]*$/.test(s);

// Returns { rule } (normalised) or { error } (a sentence for the operator).
export function validateHttpRule(input) {
  if (!input || typeof input !== "object") return bad("Rule must be an object.");
  const mode = input.mode;
  if (!MODES.includes(mode)) return bad(`Mode must be one of ${MODES.join(", ")}.`);
  const delayMs = input.delayMs == null || input.delayMs === "" ? 0 : int(input.delayMs);
  if (!(delayMs >= 0 && delayMs <= MAX_DELAY)) return bad("Delay must be 0 to 60000 ms.");
  const sc = input.schemes || {};
  const schemes = { http: sc.http !== false, https: sc.https !== false };
  if (!schemes.http && !schemes.https) return bad("Apply the rule to HTTP, HTTPS or both.");
  const base = { mode, delayMs, schemes };
  if (mode === "default") return { rule: { mode, delayMs: 0, schemes: { http: true, https: true } } };

  if (mode === "redirect") {
    const status = int(input.status ?? 302);
    if (!REDIRECT_STATUSES.includes(status)) return bad("Redirect status must be 301, 302, 303, 307 or 308.");
    const location = String(input.location ?? "").trim();
    if (!location) return bad("Location is required.");
    if (location.length > 2048 || !clean(location) || /\s/.test(location)) return bad("Location must be one URL, up to 2 KB, without spaces or line breaks.");
    if (!LOCATION_SCHEMES.test(location)) return bad("Location must start with http, https, gopher, dict, file, ftp or ldap.");
    const loop = input.loop == null || input.loop === "" ? 0 : int(input.loop);
    if (!(loop >= 0 && loop <= MAX_LOOP)) return bad(`Loop must be 0 to ${MAX_LOOP} hops.`);
    return { rule: { ...base, status, location, loop } };
  }

  const body = String(input.body ?? "");
  const bodyEncoding = input.bodyEncoding === "base64" ? "base64" : "text";
  let bytes;
  if (bodyEncoding === "base64") {
    if (!/^[A-Za-z0-9+/=\s]*$/.test(body)) return bad("Body is not valid base64.");
    bytes = Buffer.from(body, "base64");
  } else bytes = Buffer.from(body, "utf8");
  if (bytes.length > MAX_BODY) return bad("Body must be 256 KB or less.");

  if (mode === "file") {
    const contentType = String(input.contentType ?? "").trim() || "application/octet-stream";
    if (contentType.length > 200 || !clean(contentType)) return bad("Content type must be one line, up to 200 characters.");
    const template = String(input.template ?? "").slice(0, 40);
    return { rule: { ...base, contentType, body, bodyEncoding, template } };
  }

  // custom
  const status = int(input.status ?? 200);
  if (!(status >= 100 && status <= 599)) return bad("Status must be 100 to 599.");
  const raw = Array.isArray(input.headers) ? input.headers : [];
  if (raw.length > 30) return bad("Up to 30 headers.");
  const headers = [];
  for (const h of raw) {
    const [name, value] = Array.isArray(h) ? h : [h?.name, h?.value];
    const n = String(name ?? "").trim();
    const v = String(value ?? "");
    if (!n && !v) continue;
    if (!TOKEN.test(n)) return bad(`Header name "${n.slice(0, 40)}" is not valid.`);
    if (EDGE_HEADERS.has(n.toLowerCase())) return bad(`${n} is set by the edge (Content-Length is computed, Connection is always close).`);
    if (v.length > 4096 || !clean(v)) return bad(`Header ${n}: value must be one line, up to 4 KB.`);
    headers.push([n, v]);
  }
  return { rule: { ...base, status, headers, body, bodyEncoding } };
}

// One-line description for lists and tab labels. The loop comes first and hosts on the OOB domain are
// named, so a narrow list row still says what matters.
export function describeRule(rule, domain = "oob.example") {
  if (!rule || rule.mode === "default") return { short: "default", line: "", scope: "HTTP(S)" };
  const scope = rule.schemes?.http === false ? "HTTPS" : rule.schemes?.https === false ? "HTTP" : "HTTP(S)";
  if (rule.mode === "redirect") {
    let host = rule.location;
    try { host = new URL(rule.location).host || rule.location; } catch { /* keep as typed */ }
    if (host === domain || host.endsWith("." + domain)) host = `your ${domain} host`;
    return { short: String(rule.status), scope, line: `${rule.loop ? `loop ×${rule.loop}, then ` : ""}${rule.status} → ${host}` };
  }
  if (rule.mode === "file") return { short: "file", scope, line: `a hosted file (${rule.contentType})` };
  return { short: String(rule.status), scope, line: `a custom ${rule.status}` };
}

const reverse = (s) => [...String(s)].reverse().join("");

// interactsh-server 1.4.1's default HTTP reply, so targets see no change when Colluder answers.
function defaultReply(req) {
  return {
    status: 200,
    headers: [
      ["Connection", "close"],
      ["Access-Control-Allow-Credentials", "true"],
      ["Access-Control-Allow-Headers", "Content-Type, Authorization"],
      ["Access-Control-Allow-Origin", "*"],
      ["Content-Type", "text/html; charset=utf-8"],
      ["Server", req.domain || "oob.example"],
      ["Vary", "Origin"],
      ["X-Interactsh-Version", "1.4.1"],
    ],
    body: Buffer.from(`<html><head></head><body>${reverse(req.uniqueId || "")}</body></html>`),
  };
}

function hopOf(target) {
  const q = String(target || "").split("#")[0].split("?")[1] || "";
  for (const kv of q.split("&")) {
    const [k, v] = kv.split("=");
    if (k === "hop" && /^\d{1,3}$/.test(v || "")) return Math.max(1, Number(v));
  }
  return 1;
}

function withHop(target, hop) {
  let t = String(target || "/");
  if (/^[a-z]+:\/\//i.test(t)) t = t.replace(/^[a-z]+:\/\/[^/]*/i, "") || "/"; // absolute-form → path
  const [path, query = ""] = t.split("#")[0].split("?");
  const kept = query.split("&").filter((kv) => kv && kv.split("=")[0] !== "hop");
  return `${path || "/"}?${[...kept, `hop=${hop}`].join("&")}`;
}

const HOST_RE = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/i;

// rule: validated rule or null. req: { scheme, method, target, host, uniqueId, domain }.
// Returns { status, headers, body, delayMs, answer } where answer is what gets recorded with the hit.
export function respond(rule, version, req) {
  const r = rule && rule.mode !== "default" && rule.schemes?.[req.scheme] !== false ? rule : null;
  let out;
  const answer = { by: "colluder", mode: r ? r.mode : "default", version: r ? version : null };
  if (!r) out = defaultReply(req);
  else if (r.mode === "redirect") {
    const hop = hopOf(req.target);
    let location = r.location;
    if (r.loop && hop <= r.loop && HOST_RE.test(req.host || "")) {
      location = `${req.scheme}://${req.host}${withHop(req.target, hop + 1)}`;
      answer.hop = hop;
    } else if (r.loop) answer.hop = hop;
    out = { status: r.status, headers: [["Location", location], ["Server", req.domain]], body: Buffer.alloc(0) };
  } else {
    const body = r.bodyEncoding === "base64" ? Buffer.from(r.body, "base64") : Buffer.from(r.body, "utf8");
    const headers = r.mode === "file" ? [["Content-Type", r.contentType]] : [...r.headers];
    if (!headers.some(([n]) => n.toLowerCase() === "server")) headers.push(["Server", req.domain]);
    out = { status: r.mode === "file" ? 200 : r.status, headers, body };
  }
  if (!out.headers.some(([n]) => n.toLowerCase() === "connection")) out.headers.unshift(["Connection", "close"]);
  return { ...out, delayMs: r ? r.delayMs : 0, answer };
}

// The exact bytes on the wire. HEAD and bodiless statuses get headers only.
export function serialize(res, method = "GET") {
  const noBody = method === "HEAD" || res.status === 204 || res.status === 304 || (res.status >= 100 && res.status < 200);
  const lines = [`HTTP/1.1 ${res.status} ${reason(res.status)}`];
  for (const [n, v] of res.headers) lines.push(`${n}: ${v}`);
  if (!(res.status >= 100 && res.status < 200) && res.status !== 204) lines.push(`Content-Length: ${res.body.length}`);
  const head = Buffer.from(lines.join("\r\n") + "\r\n\r\n", "latin1");
  return noBody ? head : Buffer.concat([head, res.body]);
}

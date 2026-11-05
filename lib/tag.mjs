// Turns one interactsh-client JSON line into Colluder's normalised interaction,
// including the probe tag it belongs to.
//
// Tag rules (see PRODUCT.md, "Operating Context"):
//   - DNS/HTTP/SMTP: the label immediately in front of the unique id
//       fetch.<id>.domain          -> tag "fetch"
//       data.fetch.<id>.domain     -> tag "fetch", extra labels ["data"] (exfil, kept)
//   - HTTP(S) with a bare host: the first path segment
//       https://<id>.domain/xff/... -> tag "xff" (HTTPS must be single-label: one-label wildcard cert)
//   - anything else is untagged (tag = null)

export const TAG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const LABEL_RE = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/;

export function requestLine(raw) {
  if (typeof raw !== "string") return "";
  const nl = raw.indexOf("\n");
  return (nl === -1 ? raw : raw.slice(0, nl)).replace(/\r$/, "");
}

function pathTag(raw) {
  const m = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,20} (\S+) HTTP\/[\d.]+$/.exec(requestLine(raw));
  if (!m) return null;
  let target = m[1];
  // absolute-form request lines (proxies): keep only the path
  const abs = /^[a-z]+:\/\/[^/]*(\/.*)?$/i.exec(target);
  if (abs) target = abs[1] || "/";
  const seg = target.split(/[?#]/)[0].split("/")[1] || "";
  let dec;
  try { dec = decodeURIComponent(seg).toLowerCase(); } catch { return null; }
  return TAG_RE.test(dec) ? dec : null;
}

function protocolOf(o) {
  return String(o.protocol || "unknown").toLowerCase();
}

// User-Agent from the request head only (never the body), trimmed for the one-line summary.
export function userAgent(raw) {
  const head = String(raw || "").split(/\r?\n\r?\n/)[0];
  const m = /^user-agent:[ \t]*(.*)$/im.exec(head);
  return m ? m[1].trim().slice(0, 160) : "";
}

export function summarize(protocol, o, domain) {
  if (protocol === "http" || protocol === "https") {
    const ua = userAgent(o["raw-request"]);
    return ua ? `${requestLine(o["raw-request"])} · ${ua}` : requestLine(o["raw-request"]);
  }
  if (protocol === "dns") {
    const name = String(o["full-id"] || "").toLowerCase() + (domain ? "." + domain : "");
    return `${o["q-type"] || "?"} ${name}`.trim();
  }
  if (protocol === "smtp") return o["smtp-from"] ? `MAIL FROM ${o["smtp-from"]}` : "SMTP session";
  return protocol.toUpperCase();
}

// trusted: the line came from Colluder's own edge, so its colluder-* fields are believed.
// (interactsh-client lines never carry them; an attacker can't add fields to either file.)
export function parseInteraction(o, domain = "", { trusted = false } = {}) {
  const protocol = protocolOf(o);
  const uniqueId = String(o["unique-id"] || "").toLowerCase();
  const fullId = String(o["full-id"] || "").toLowerCase();
  let tag = null, tagSource = null, extra = [];

  if (uniqueId && fullId.endsWith(uniqueId) && fullId.length > uniqueId.length + 1) {
    const labels = fullId.slice(0, -(uniqueId.length + 1)).split(".").filter(Boolean);
    const last = labels[labels.length - 1];
    if (last && TAG_RE.test(last)) {
      tag = last;
      tagSource = "subdomain";
      extra = labels.slice(0, -1).filter((l) => LABEL_RE.test(l));
    }
  }
  if (!tag && (protocol === "http" || protocol === "https")) {
    const t = pathTag(o["raw-request"]);
    if (t) { tag = t; tagSource = "path"; }
  }

  return {
    protocol,
    uniqueId,
    fullId,
    qType: o["q-type"] || null,
    remoteAddress: String(o["remote-address"] || ""),
    timestamp: String(o.timestamp || ""),
    rawRequest: typeof o["raw-request"] === "string" ? o["raw-request"] : "",
    // the edge adds the exact bytes when they aren't UTF-8 (the text above is then a lossy view)
    rawBytes: trusted && typeof o["raw-request-b64"] === "string" ? Buffer.from(o["raw-request-b64"], "base64") : null,
    rawResponse: typeof o["raw-response"] === "string" ? o["raw-response"] : "",
    smtpFrom: o["smtp-from"] || null,
    tag,
    tagSource,
    extraLabels: extra,
    summary: trusted && o["colluder-answer"]?.mode === "tls"
      ? `TLS handshake for ${String(o["colluder-answer"].tls?.sni || fullId)}, not completed`
      : summarize(protocol, o, domain),
    answer: trusted && o["colluder-answer"] && typeof o["colluder-answer"] === "object" ? o["colluder-answer"] : null,
  };
}

// The correlation id is the first 20 chars of the 33-char unique id (interactsh default).
export function correlationIdOf(payloadHost) {
  const first = String(payloadHost || "").split(".")[0].toLowerCase();
  return first.length >= 20 ? first.slice(0, 20) : first;
}

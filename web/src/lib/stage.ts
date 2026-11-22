// What the edge did with a hit, in words (labels say what the edge saw, never what
// the target did). A redirect we sent is not proof the target followed it; a later hop is.

import { decodeExfil } from "./exfil.ts"; // with the extension: Node runs this file in tests and the report

type Hit = { summary?: string; fullId?: string; rawRequest?: string; answerMode?: string | null; malformed?: string | null; hop?: number | null; decoy?: string | null; answerCode?: number | null; answerTo?: string | null; hopCode?: number | null; answerPart?: string | null };

// XXE: the DTD sends the file to kx0.<tag>…/d?d=<contents>. The value is everything after the first
// "d=" (a file can hold & and =; an old Java client even sends raw spaces and newlines, which the
// edge records as a malformed request). php://filter output is base64, so that is decoded too.
// From the raw request when there is one (the list row only has the summary, cut at the first line).
// php://filter/convert.base64-encode pads to a multiple of 4. A value in that exact shape that decodes
// to UTF-8 text is the file, whatever it looks like: PHP source and JSON fail decodeExfil's guess at
// "text". One that decodes to bytes that aren't text stays as sent, flagged binary.
const STRICT_B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function strictBase64(v: string): { text: string } | { bytes: number } | null {
  if (v.length < 4 || v.length % 4 || !STRICT_B64.test(v)) return null;
  let bin: string;
  try { bin = atob(v); } catch { return null; }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return { bytes: bytes.length }; }
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text) ? { bytes: bytes.length } : { text };
}

export type XxeValue = { text: string; base64: boolean; binary?: number };
export function xxeValue(h: Hit): XxeValue | null {
  if (!/^kx0\./.test(h.fullId ?? "")) return null;
  let target: string | null = null;
  if (h.rawRequest) {
    const m = /^\S+ ([\s\S]*?) HTTP\/\d\.\d\r?\n/.exec(h.rawRequest);
    target = m ? m[1] : null;
  } else if (h.summary) {
    const line = h.summary.split(" · ")[0];
    const sp = line.indexOf(" "), end = line.lastIndexOf(" HTTP/");
    target = sp > 0 ? line.slice(sp + 1, end > sp ? end : undefined) : null;
  }
  const at = target ? /[?&]d=/.exec(target) : null;
  if (!target || !at) return null;
  let v = target.slice(at.index + 3);
  try { v = decodeURIComponent(v); } catch { /* keep as sent */ }
  const b64 = /^[A-Za-z0-9+/]{8,}={0,2}$/.test(v) ? decodeExfil(v, { max: 1 << 20 }) : null;
  if (b64?.kind === "base64url") return { text: b64.text, base64: true };
  const strict = strictBase64(v);
  if (strict && "text" in strict) return { text: strict.text, base64: true };
  return strict ? { text: v, base64: false, binary: strict.bytes } : { text: v, base64: false };
}
// the hit detail's one line when the file is shown in full below it (the report and the MCP say the same)
export function xxeArrived(v: XxeValue): string {
  if (!v.text) return "file data arrived: empty (the DTD ran; the read returned nothing)";
  const n = new TextEncoder().encode(v.text).length;
  const lines = v.text.replace(/\r?\n$/, "").split(/\r?\n/).length;
  return `file data arrived: ${n.toLocaleString("en-US")} ${n === 1 ? "byte" : "bytes"}${lines > 1 ? `, ${lines} lines` : ""}${v.base64 ? ", base64-decoded" : v.binary ? `, base64 of ${v.binary} bytes that aren't text` : ""}`;
}
const esc = (t: string) => t.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
export function xxeData(h: Hit): string | null {
  const v = xxeValue(h);
  if (!v) return null;
  if (!v.text) return "empty (the DTD ran; the read returned nothing)";
  return esc(v.text) + (v.base64 ? " (base64, decoded)" : v.binary ? ` (base64 of ${v.binary} bytes that aren't text)` : "");
}

export function stageOf(h: Hit): string | null {
  if (h.answerMode === "tls") return "TLS handshake only: no request arrived";
  const s = stageCore(h);
  return h.malformed ? (s ? `malformed request · ${s}` : "malformed request") : s;
}

// the same, short enough for a table row (the full sentence goes in its tooltip): a redirect as its
// code and host ("hop 3 · → 302 169.254.169.254"), file data as a short preview
export function stageShort(h: Hit): string | null {
  if (h.answerMode === "tls") return "TLS handshake only";
  const hop = h.hop && h.hop > 1 ? `hop ${h.hop} · ` : "";
  let core: string | null;
  if (!h.answerPart && !h.decoy && xxeData(h) === null && (h.answerTo || h.hop)) {
    const host = h.answerTo ? (/^[a-z][\w+.-]*:\/\/([^/?#]+)/i.exec(h.answerTo)?.[1] ?? h.answerTo) : null;
    core = host ? `${hop}→ ${h.answerCode ?? "redirect"} ${host}` : `hop ${h.hop} · ${h.hopCode ?? "redirect"}`;
  } else {
    const c = stageCore(h);
    core = c && c.length > 48 ? `${c.slice(0, 47)}…` : c;
  }
  return h.malformed ? (core ? `malformed · ${core}` : "malformed request") : core;
}

function stageCore(h: Hit): string | null {
  if (h.answerPart) return `served ${h.answerPart}`;
  const data = xxeData(h);
  if (data !== null) return `file data: ${data.length > 90 ? data.slice(0, 90) + "…" : data}`;
  if (h.decoy) {
    const method = /^([A-Z]+) /.exec(h.summary ?? "")?.[1];
    const why = h.decoy === "method" ? `to a ${method ?? "matching"} request` : h.decoy === "first" ? "to an early request" : h.decoy === "user-agent" ? "to a matching User-Agent" : "to a matching source";
    return `decoy reply ${why}`;
  }
  const followed = h.hop && h.hop > 1 ? `followed ${h.hop - 1} ${h.hop === 2 ? "redirect" : "redirects"} · ` : "";
  if (h.answerTo) return `${followed}answered ${h.answerCode ?? "a redirect"} → ${h.answerTo}`;
  // a loop hop or an exit recorded before the edge noted targets: say only what's known
  if (h.hop) return `${followed}hop ${h.hop}: answered ${h.hopCode ?? "a redirect"}`;
  return null;
}

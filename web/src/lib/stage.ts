// What the edge did with a hit, in words (PLAN-PRESETS.md: labels say what the edge saw, never what
// the target did). A redirect we sent is not proof the target followed it; a later hop is.

import { decodeExfil } from "./exfil.ts"; // with the extension: Node runs this file in tests and the report

type Hit = { summary?: string; fullId?: string; rawRequest?: string; answerMode?: string | null; malformed?: string | null; hop?: number | null; decoy?: string | null; answerCode?: number | null; answerTo?: string | null; hopCode?: number | null; answerPart?: string | null };

// XXE: the DTD sends the file to kx0.<tag>…/d?d=<contents>. The value is everything after the first
// "d=" (a file can hold & and =; an old Java client even sends raw spaces and newlines, which the
// edge records as a malformed request). php://filter output is base64, so that is decoded too.
// From the raw request when there is one (the list row only has the summary, cut at the first line).
export function xxeValue(h: Hit): { text: string; base64: boolean } | null {
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
  return b64?.kind === "base64url" ? { text: b64.text, base64: true } : { text: v, base64: false };
}
const esc = (t: string) => t.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
export function xxeData(h: Hit): string | null {
  const v = xxeValue(h);
  if (!v) return null;
  if (!v.text) return "empty (the DTD ran; the read returned nothing)";
  return esc(v.text) + (v.base64 ? " (base64, decoded)" : "");
}

export function stageOf(h: Hit): string | null {
  if (h.answerMode === "tls") return "TLS handshake only: no request arrived";
  const s = stageCore(h);
  return h.malformed ? (s ? `malformed request · ${s}` : "malformed request") : s;
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

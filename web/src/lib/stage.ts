// What the edge did with a hit, in words (PLAN-PRESETS.md: labels say what the edge saw, never what
// the target did). A redirect we sent is not proof the target followed it; a later hop is.

import { decodeExfil } from "./exfil.ts"; // with the extension: Node runs this file in tests and the report

type Hit = { summary?: string; fullId?: string; hop?: number | null; decoy?: string | null; answerCode?: number | null; answerTo?: string | null; hopCode?: number | null; answerPart?: string | null };

// XXE: the DTD sends the file to kx0.<tag>…/d?d=<contents>. Shown decoded, one line, control
// characters as escapes; php://filter output is base64, so that is decoded too.
export function xxeData(h: Hit): string | null {
  if (!/^kx0\./.test(h.fullId ?? "")) return null;
  const m = /^[A-Z]+ \S*[?&]d=([^ &#]*)/.exec(h.summary ?? "");
  if (!m) return null;
  let v = m[1];
  try { v = decodeURIComponent(v); } catch { /* keep as sent */ }
  const b64 = /^[A-Za-z0-9+/]{8,}={0,2}$/.test(v) ? decodeExfil(v) : null;
  const text = b64?.kind === "base64url" ? b64.text : v;
  return text.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + (b64?.kind === "base64url" ? " (base64, decoded)" : "");
}

export function stageOf(h: Hit): string | null {
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

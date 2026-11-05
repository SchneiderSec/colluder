// What the edge did with a hit, in words (PLAN-PRESETS.md: labels say what the edge saw, never what
// the target did). A redirect we sent is not proof the target followed it; a later hop is.

type Hit = { summary?: string; hop?: number | null; decoy?: string | null; answerCode?: number | null; answerTo?: string | null; hopCode?: number | null };

export function stageOf(h: Hit): string | null {
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

// How far clients followed a redirect loop (PLAN-REVIEW3.md D): the deepest hop any hit reached on a
// rule version says how many redirects the client's HTTP library follows, and with odd codes in the
// loop, which code it refused. Pure, so the sentence is tested.

type LoopRule = { mode: string; status?: number; loop?: number; hopStatuses?: number[] | string };

// the status the edge sends at hop h of a loop (the exit hop gets the rule's own status)
export function statusAt(rule: LoopRule, h: number): number | undefined {
  const hs = Array.isArray(rule.hopStatuses) ? rule.hopStatuses : []; // saved rules always hold numbers
  if (!rule.loop || h > rule.loop || !hs.length) return rule.status;
  return hs[(h - 1) % hs.length];
}

export function reach(rule: LoopRule, maxHop: number | null | undefined): string | null {
  if (rule.mode !== "redirect" || !rule.loop || !maxHop) return null;
  const hops = rule.loop + 1;
  if (maxHop >= hops) return `followed all ${rule.loop} redirects to the final Location`;
  const followed = maxHop - 1;
  const refused = statusAt(rule, maxHop);
  return `deepest hop ${maxHop} of ${hops}: followed ${followed} ${followed === 1 ? "redirect" : "redirects"}, then stopped at a ${refused}`;
}

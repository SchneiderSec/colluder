// How far clients followed a redirect loop (PLAN-REVIEW3.md D, per client since review 4): where a
// client's run of hops stops says how many redirects its HTTP library follows, and with odd codes in
// the loop, which code it refused. Per source and User-Agent, because a probe pasted in one place is
// often fetched by more than one client (a link checker, then the real fetcher), and self-tests and
// decoy replies are left out by the server. Pure, so the sentences are tested.

type LoopRule = { mode: string; status?: number; loop?: number; hopStatuses?: number[] | string; location?: string };
export type ReachClient = { ip: string; ua: string; maxHop: number; minHop: number; hits: number };

// the status the edge sends at hop h of a loop (the exit hop gets the rule's own status)
export function statusAt(rule: LoopRule, h: number): number | undefined {
  const hs = Array.isArray(rule.hopStatuses) ? rule.hopStatuses : []; // saved rules always hold numbers
  if (!rule.loop || h > rule.loop || !hs.length) return rule.status;
  return hs[(h - 1) % hs.length];
}

const shortUa = (ua: string) => ua.split(/\s+/)[0]?.slice(0, 40) || "";
const hostOf = (url = "") => { try { return new URL(url).hostname.replace(/^\[|\]$/g, ""); } catch { return ""; } };

// one client's run through the loop. Reaching the last hop means the client got the final redirect;
// whether it followed that is in the target's response, never here.
export function reachOf(rule: LoopRule, c: ReachClient): string | null {
  if (rule.mode !== "redirect" || !rule.loop || !c.maxHop) return null;
  const hops = rule.loop + 1;
  const who = `${shortUa(c.ua) || "a client"} from ${c.ip}`;
  const replay = c.minHop > 1 ? " (no earlier hops from this client: a replayed URL, or a client that changed address)" : "";
  if (c.maxHop >= hops) {
    const to = hostOf(rule.location);
    return `${who} reached the last hop (${hops} of ${hops}) and got the ${rule.status}${to ? ` → ${to}` : ""}; whether it followed shows in the target's response${replay}`;
  }
  const followed = c.maxHop - 1;
  return `${who} reached hop ${c.maxHop} of ${hops}: followed ${followed} ${followed === 1 ? "redirect" : "redirects"}, then stopped at a ${statusAt(rule, c.maxHop)}${replay}`;
}

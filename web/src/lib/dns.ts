// DNS signal helpers. Pure, so they can be tested without the app.
// QNAME minimisation: a resolver asks for root.bbop.<id> before ip-10-0-3-17.root.bbop.<id>, so the
// partial name looks like exfil data. A lookup whose name is a proper suffix of a longer name asked by
// the same resolver within STEP_MS is a "step" toward that longer name.

export type DnsHit = { id: number; protocol: string; fullId: string; remoteAddress: string; timestamp: string };

export const STEP_MS = 5_000;
const ms = (iso: string) => Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));

const cache = new WeakMap<object, Map<number, string>>();

// id of each step -> the longest name it was a step toward
export function dnsSteps(list: DnsHit[]): Map<number, string> {
  const hit = cache.get(list);
  if (hit) return hit;
  const out = new Map<number, string>();
  const byResolver = new Map<string, { id: number; name: string; t: number }[]>();
  for (const i of list) {
    if (i.protocol !== "dns") continue;
    const a = byResolver.get(i.remoteAddress) ?? [];
    a.push({ id: i.id, name: i.fullId.toLowerCase(), t: ms(i.timestamp) });
    byResolver.set(i.remoteAddress, a);
  }
  for (const qs of byResolver.values()) {
    qs.sort((a, b) => a.t - b.t);
    for (let x = 0; x < qs.length; x++) {
      let best: string | null = null;
      // sorted by time: only look inside the window around x
      const consider = (y: number) => {
        const longer = qs[y].name;
        if (longer.length > qs[x].name.length && longer.endsWith("." + qs[x].name) && (!best || longer.length > best.length)) best = longer;
      };
      for (let y = x - 1; y >= 0 && qs[x].t - qs[y].t <= STEP_MS; y--) consider(y);
      for (let y = x + 1; y < qs.length && qs[y].t - qs[x].t <= STEP_MS; y++) consider(y);
      if (best) out.set(qs[x].id, best);
    }
  }
  cache.set(list, out);
  return out;
}

// the name that matters in a burst: the longest one asked
export function mostSpecific<T extends { fullId: string }>(items: T[]): T {
  return items.reduce((a, b) => (b.fullId.length > a.fullId.length ? b : a));
}

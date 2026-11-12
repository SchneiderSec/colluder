// Every probe is a member of the crew: an animal in the Colluder's bandit mask, its kind and its coat
// both from its tag, so the same probe is always the same character in the list, its header and
// anywhere else it shows up.
// Run the tests: node --test web/test/view.test.ts

// Coats: eight hues steering clear of amber (the eyes and "new" own it), each in two shades.
// Muted chroma keeps them fur, not signal lights; the mask stays near-black on all of them.
const HUES = [25, 105, 145, 185, 220, 255, 290, 330];
const SHADES = [0.66, 0.84];

// The crew's kinds. The raccoon is the Colluder itself; the rest joined the job.
export const SPECIES = ["raccoon", "cat", "fox", "bear", "rabbit", "bird", "monkey", "owl", "mouse", "dog"] as const;
export type Species = (typeof SPECIES)[number];

const fnv = (tag: string, seed: number) => {
  let h = seed; // FNV-1a
  for (const ch of tag.toLowerCase()) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return h >>> 0;
};
export const crewIndex = (tag: string): number => fnv(tag, 2166136261) % (HUES.length * SHADES.length);
// a second, independent hash for the kind, so coat and kind don't move together
export const speciesIndex = (tag: string): number => fnv(tag, 0x9e3779b9) % SPECIES.length;
export const crewSpecies = (tag: string): Species => SPECIES[speciesIndex(tag)];

const COATS = HUES.length * SHADES.length;
type Member = { tag: string; plantedAt?: string | null; retiredAt?: string | null; lastHitAt?: string | null };
// on the active list: not retired, or retired but heard from since (a late hit)
const onList = (p: Member) => !p.retiredAt || (p.lastHitAt ?? "") > p.retiredAt;
const coatOf = (i: number) => `oklch(${SHADES[i % SHADES.length]} 0.085 ${HUES[Math.floor(i / SHADES.length)]})`;

// A probe's own coat, from its tag alone.
export const crewCoat = (tag: string): string => coatOf(crewIndex(tag));

// Coats for the whole crew, so no two probes on the active list share one. Those pick first, in the
// order they were planted, so a probe keeps its coat when newer ones arrive; each takes its own coat
// or, when an earlier probe wears it, the next free one. Retired probes pick last and may repeat once
// all sixteen are taken.
const crewOrder = (probes: Member[]) => [...probes].sort((a, b) => Number(!onList(a)) - Number(!onList(b)) || (a.plantedAt ?? "").localeCompare(b.plantedAt ?? "") || a.tag.localeCompare(b.tag));
// hand out n slots in crew order: each takes its own, or the next free one while any are left
function deal(order: Member[], n: number, own: (tag: string) => number): Map<string, number> {
  const taken = new Set<number>(), out = new Map<string, number>();
  for (const p of order) {
    let i = own(p.tag);
    if (taken.size < n) while (taken.has(i)) i = (i + 1) % n;
    taken.add(i); out.set(p.tag, i);
  }
  return out;
}
export function crewCoats(probes: Member[]): Map<string, string> {
  return new Map([...deal(crewOrder(probes), COATS, crewIndex)].map(([t, i]) => [t, coatOf(i)]));
}
// Kinds are dealt the same way: the first ten on the active list are ten different animals.
export function crewKinds(probes: Member[]): Map<string, Species> {
  return new Map([...deal(crewOrder(probes), SPECIES.length, speciesIndex)].map(([t, i]) => [t, SPECIES[i]]));
}

export type Look = { coat: string; species: Species };
export function crew(probes: Member[]): Map<string, Look> {
  const coats = crewCoats(probes), kinds = crewKinds(probes);
  return new Map(probes.map((p) => [p.tag, { coat: coats.get(p.tag)!, species: kinds.get(p.tag)! }]));
}

// One crew per probe set: the list and the header read the same map.
let memo: { key: string; looks: Map<string, Look> } | null = null;
export function crewOf(probes: Map<string, Member>): Map<string, Look> {
  const all = [...probes.values()];
  const key = all.map((p) => `${p.tag}|${p.plantedAt}|${onList(p)}`).join(",");
  if (memo?.key !== key) memo = { key, looks: crew(all) };
  return memo.looks;
}
// a probe's look, from the crew when it's in it, else from its tag alone
export const lookOf = (looks: Map<string, Look>, tag: string): Look => looks.get(tag) ?? { coat: crewCoat(tag), species: crewSpecies(tag) };

// The grey coat: no tag, or a tag nobody planted (nobody on the crew).
export const STRAY = "oklch(0.6 0.008 70)";
export const STRAY_LOOK: Look = { coat: STRAY, species: "raccoon" };
// "a cat", "an owl": for tooltips
export const aKind = (s: Species) => (/^[aeiou]/.test(s) ? `an ${s}` : `a ${s}`);

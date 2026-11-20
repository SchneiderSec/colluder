// A throwaway tag for a quick probe: the plant form uses it when the Tag field is left empty.
// Two short words and two digits (brisk-otter-42): easy to say, read and search, always a valid tag,
// never one already in use.
const WORDS_A = ["amber", "brisk", "calm", "dusty", "eager", "faint", "gentle", "hollow", "ivory", "jolly", "keen", "lucky", "misty", "nimble", "olive", "plain", "quiet", "rapid", "silver", "tidy", "urban", "vivid", "witty", "young", "zesty"];
const WORDS_B = ["otter", "heron", "maple", "pebble", "comet", "falcon", "lantern", "harbor", "willow", "ember", "badger", "cedar", "meadow", "orbit", "quill", "raven", "sparrow", "tulip", "walrus", "yarrow", "beacon", "canyon", "dune", "fjord", "gecko"];
const TAG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export function quickTag(taken: (t: string) => boolean = () => false, rand: () => number = Math.random): string {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  for (let i = 0; i < 50; i++) {
    const t = `${pick(WORDS_A)}-${pick(WORDS_B)}-${10 + Math.floor(rand() * 90)}`;
    if (TAG_RE.test(t) && !taken(t)) return t;
  }
  // 62,500 names all taken (or a broken rand): fall back to the clock, still a valid tag
  return `quick-${Date.now().toString(36)}`;
}

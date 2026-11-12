// Easter egg: the word "ultrathink" in a tag or target is drawn the way Claude Code draws it, each
// letter its own colour of a rainbow that flows across the word (components/Ultra.tsx, .ultra-l in
// index.css). Any case, anywhere in the text: "ultrathink-ssrf", "UltraThink the parser".
// Run the tests: node --test web/test/view.test.ts
const WORD = /ultrathink/gi;
export type UltraPart = { s: string; ultra: boolean };
export function ultraParts(text: string): UltraPart[] {
  const out: UltraPart[] = [];
  let at = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index > at) out.push({ s: text.slice(at, m.index), ultra: false });
    out.push({ s: m[0], ultra: true });
    at = m.index + m[0].length;
  }
  if (at < text.length || !out.length) out.push({ s: text.slice(at), ultra: false });
  return out;
}

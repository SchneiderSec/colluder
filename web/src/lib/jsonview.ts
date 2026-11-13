// Lossless JSON layout for the Parsed view. Unlike JSON.parse/stringify it keeps
// every token byte for byte: big integers stay exact, escapes stay escaped, and a key that repeats
// inside one object is kept and flagged. Only whitespace between tokens is re-laid out.
// Returns null for anything that isn't a single valid JSON value, so the caller shows the plain body.

export type Seg = { k: "key" | "str" | "num" | "lit" | "punct" | "ws"; s: string; dup?: boolean };

const TOKEN = /\s*(?:("(?:\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})|[^"\\\u0000-\u001f])*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],:]))/y;

type Tok = { k: "str" | "num" | "lit" | "punct"; s: string };

function tokenize(text: string): Tok[] | null {
  const out: Tok[] = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < text.length) {
    if (/^\s*$/.test(text.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m) return null;
    pos = TOKEN.lastIndex;
    out.push(m[1] !== undefined ? { k: "str", s: m[1] } : m[2] !== undefined ? { k: "num", s: m[2] } : m[3] !== undefined ? { k: "lit", s: m[3] } : { k: "punct", s: m[4] });
  }
  return out;
}

export function layoutJson(text: string, indent = 2): Seg[] | null {
  const toks = tokenize(text);
  if (!toks || !toks.length) return null;
  const out: Seg[] = [];
  let i = 0;
  const nl = (depth: number) => out.push({ k: "ws", s: "\n" + " ".repeat(depth * indent) });
  const p = (s: string) => out.push({ k: "punct", s });

  function value(depth: number): boolean {
    const t = toks![i++];
    if (!t) return false;
    if (t.k !== "punct") { out.push({ k: t.k, s: t.s }); return true; }
    if (t.s === "{") {
      p("{");
      if (toks![i]?.s === "}") { i++; p("}"); return true; }
      const seen = new Set<string>();
      for (;;) {
        const key = toks![i++];
        if (!key || key.k !== "str") return false;
        nl(depth + 1);
        const dup = seen.has(key.s); // same spelling; "a" and "a" are not merged, which is the honest view
        seen.add(key.s);
        out.push({ k: "key", s: key.s, dup });
        if (toks![i++]?.s !== ":") return false;
        out.push({ k: "punct", s: ": " });
        if (!value(depth + 1)) return false;
        const sep = toks![i++];
        if (sep?.s === ",") { p(","); continue; }
        if (sep?.s === "}") { nl(depth); p("}"); return true; }
        return false;
      }
    }
    if (t.s === "[") {
      p("[");
      if (toks![i]?.s === "]") { i++; p("]"); return true; }
      for (;;) {
        nl(depth + 1);
        if (!value(depth + 1)) return false;
        const sep = toks![i++];
        if (sep?.s === ",") { p(","); continue; }
        if (sep?.s === "]") { nl(depth); p("]"); return true; }
        return false;
      }
    }
    return false;
  }

  if (!value(0) || i !== toks.length) return null;
  return out;
}

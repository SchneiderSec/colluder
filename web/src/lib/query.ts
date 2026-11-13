// Query decoding for the Parsed view. Percent-escapes are decoded, but "+" stays
// "+" (only form bodies mean a space by it), a value that decoding changed says so, and control
// characters are shown as escapes so "%0A" never looks like a space.

export type QueryParam = { name: string; value: string | null; raw: string | null; changed: boolean };

const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export function decodedQuery(query: string): QueryParam[] {
  return query.split("&").filter(Boolean).map((kv) => {
    const e = kv.indexOf("=");
    if (e < 0) return { name: dec(kv), value: null, raw: null, changed: false };
    const raw = kv.slice(e + 1);
    const value = dec(raw);
    return { name: dec(kv.slice(0, e)), value, raw, changed: value !== raw };
  });
}

// split text into plain runs and visible escapes for control characters
export function showControls(s: string): [kind: "text" | "ctl", text: string][] {
  const out: [kind: "text" | "ctl", text: string][] = [];
  const NAMED: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t", "\0": "\\0" };
  let run = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c === 0x7f) {
      if (run) { out.push(["text", run]); run = ""; }
      out.push(["ctl", NAMED[ch] ?? "\\x" + c.toString(16).padStart(2, "0")]);
    } else run += ch;
  }
  if (run) out.push(["text", run]);
  return out;
}

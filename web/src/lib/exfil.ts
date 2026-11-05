// Exfil decoding (PLAN-REVIEW3.md C3): labels and query values that look encoded, decoded for display
// only when the result is printable text. Shared by the UI and the server's probe report (Node runs
// this file directly with type stripping, so it uses only erasable TypeScript).
//
// DNS names are case-insensitive and resolvers may randomise case (0x20 encoding), so DNS labels are
// only tried as hex and base32; query values may also be base64url.

export type Decoded = { kind: "hex" | "base32" | "base64url"; text: string };

function printable(s: string): boolean {
  if (s.length < 3) return false;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (!((c >= 0x20 && c < 0x7f) || c === 0x0a || c === 0x0d || c === 0x09)) return false;
  }
  // looks like text, not noise that happens to be printable: mostly letters, digits and the usual
  // separators, and at least half letters or digits
  const usual = (s.match(/[a-z0-9 \t\n\r._\-/:@=,;]/gi) ?? []).length;
  const alnum = (s.match(/[a-z0-9]/gi) ?? []).length;
  return usual / s.length >= 0.8 && alnum / s.length >= 0.5;
}

const bytesToText = (b: number[]) => String.fromCharCode(...b);

function hex(s: string): string | null {
  if (!/^(?:[0-9a-f]{2}){2,}$/i.test(s)) return null;
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
  return bytesToText(out);
}

function base32(s: string): string | null {
  const t = s.replace(/=+$/, "").toLowerCase();
  if (!/^[a-z2-7]{8,}$/.test(t)) return null;
  const A = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of t) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return bytesToText(out);
}

function base64url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]{8,}={0,2}$/.test(s) && !/^[A-Za-z0-9+/]{8,}={0,2}$/.test(s)) return null;
  const t = s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (t.length % 4 === 1) return null;
  try { return atob(t + "=".repeat((4 - (t.length % 4)) % 4)); } catch { return null; }
}

// max: values longer than this aren't tried (4 KB: a guess at random strings is cheap only when short;
// an XXE file read asks for more, since it is known to be data)
export function decodeExfil(s: string, { dns = false, max = 4096 } = {}): Decoded | null {
  if (!s || s.length > max) return null;
  const tries: [Decoded["kind"], (x: string) => string | null][] = [["hex", hex], ["base32", base32]];
  if (!dns) tries.push(["base64url", base64url]);
  for (const [kind, f] of tries) {
    const text = f(s);
    if (text !== null && printable(text) && text !== s) return { kind, text };
  }
  return null;
}

// labels before the tag, one value split across labels (DNS labels max out at 63 bytes): try the
// joined string first, then each label on its own
// A payload's variant code (kc3, kx0…) sits right before the tag; it isn't part of the data.
export function decodeLabels(all: string[]): { label: string; decoded: Decoded }[] {
  const labels = all.length && /^k[a-z]\d{1,2}$/.test(all[all.length - 1]) ? all.slice(0, -1) : all;
  if (!labels.length) return [];
  if (labels.length > 1) {
    const joined = decodeExfil(labels.join(""), { dns: true });
    if (joined) return [{ label: labels.join("."), decoded: joined }];
  }
  const out: { label: string; decoded: Decoded }[] = [];
  for (const l of labels) { const d = decodeExfil(l, { dns: true }); if (d) out.push({ label: l, decoded: d }); }
  return out;
}

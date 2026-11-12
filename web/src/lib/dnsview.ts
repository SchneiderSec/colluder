// Display helpers for DNS and mail raw panes: split a line into tinted segments. Nothing may change
// the data shown, so the segments of a line always join back to the line, character for character.
// Run the tests: node --test web/test/view.test.ts

export type SegKind = "plain" | "ash" | "head" | "name" | "tag" | "type" | "value" | "ok" | "bad" | "field";
export type Seg = { s: string; k: SegKind };

const CLASS = "IN|CH|HS|CS|ANY|NONE|CLASS\\d+";
const QUESTION = new RegExp(`^(;)(\\S+)(\\s+)(${CLASS})(\\s+)(\\S+)(\\s*)$`);
const RECORD = new RegExp(`^(\\S+)(\\s+)(\\d+)(\\s+)(${CLASS})(\\s+)(\\S+)(\\s+)(.*)$`);
const RCODE = /(\b(?:NOERROR|NXDOMAIN|SERVFAIL|REFUSED|FORMERR|NOTIMP|YXDOMAIN|NOTAUTH|NOTZONE)\b)/;

// a DNS name with the probe's tag marked: the label that is the tag, or the tag part of "<tag>-<id>"
export function dnsName(n: string, tag: string | null): Seg[] {
  if (!tag) return [{ s: n, k: "name" }];
  const t = tag.toLowerCase();
  const out: Seg[] = [];
  n.split(".").forEach((l, i) => {
    if (i > 0) out.push({ s: ".", k: "name" });
    const low = l.toLowerCase();
    const hit = low === t ? l.length : low.startsWith(`${t}-`) ? t.length : 0;
    if (hit) out.push({ s: l.slice(0, hit), k: "tag" });
    if (l.slice(hit)) out.push({ s: l.slice(hit), k: "name" });
  });
  return out;
}

// dig-style "key: value" comments (";; opcode: QUERY, status: NOERROR, id: 9692"): the ";" and the keys
// recede, the values read, and the status says whether the lookup worked
function comment(ln: string): Seg[] {
  const out: Seg[] = [];
  ln.split(/([A-Za-z][\w ]*?:)(?=[\s;]|$)/).forEach((p, i) => {
    if (!p) return;
    if (i === 0 || i % 2) { out.push({ s: p, k: "ash" }); return; }
    p.split(RCODE).forEach((q, j) => { if (q) out.push({ s: q, k: j % 2 ? (q === "NOERROR" ? "ok" : "bad") : "plain" }); });
  });
  return out;
}

// One line of a DNS query or answer in dig's text form: section headings, the question, records, and
// the header comments. A line it doesn't recognise is one plain segment.
export function dnsLine(ln: string, tag: string | null): Seg[] {
  if (/^;; .*SECTION:\s*$/.test(ln)) return [{ s: ln, k: "head" }];
  const q = QUESTION.exec(ln);
  if (q) return [{ s: q[1], k: "ash" }, ...dnsName(q[2], tag), { s: q[3], k: "plain" }, { s: q[4], k: "ash" }, { s: q[5], k: "plain" }, { s: q[6], k: "type" }, ...(q[7] ? [{ s: q[7], k: "plain" as const }] : [])];
  if (ln.startsWith(";")) return comment(ln);
  const r = RECORD.exec(ln);
  if (r) return [...dnsName(r[1], tag), { s: r[2], k: "plain" }, { s: r[3], k: "ash" }, { s: r[4], k: "plain" }, { s: r[5], k: "ash" }, { s: r[6], k: "plain" }, { s: r[7], k: "type" }, { s: r[8], k: "plain" }, ...(r[9] ? [{ s: r[9], k: "value" as const }] : [])];
  return [{ s: ln, k: "plain" }];
}

// One line of a mail message's header block: the field name, then the rest. Folded continuation lines
// and the body stay plain.
export function mailLine(ln: string, inHead: boolean): Seg[] {
  const m = inHead ? /^([!-9;-~]+)(:)(.*)$/.exec(ln) : null;
  return m ? [{ s: m[1], k: "field" }, { s: m[2], k: "ash" }, ...(m[3] ? [{ s: m[3], k: "plain" as const }] : [])] : [{ s: ln, k: "plain" }];
}

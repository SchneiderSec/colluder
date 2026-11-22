// Reading aids for HTTP hits: a User-Agent in a few words, and which request headers are the ones
// every browser sends. Display only; the exact bytes are never touched.
// Run the tests: node --test web/test/view.test.ts

// Headers a browser or common client sends on every request. They fold behind one line in the parsed
// view, so Host, User-Agent and anything unusual stand out. A header the view flags (a credential, a
// forwarded IP) is never folded, whatever its name.
const STANDARD = new Set([
  "accept", "accept-encoding", "accept-language", "cache-control", "connection", "dnt", "pragma", "priority", "te",
  "upgrade-insecure-requests", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "sec-fetch-dest", "sec-fetch-mode",
  "sec-fetch-site", "sec-fetch-user", "sec-gpc", "if-none-match", "if-modified-since",
]);
export const isStandardHeader = (name: string) => STANDARD.has(name.toLowerCase());

const OS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"], [/Android/, "Android"], [/Windows/, "Windows"], [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"], [/Linux/, "Linux"],
];
// most specific first: Edge and Opera also say Chrome, Chrome also says Safari
const CLIENT: [RegExp, string][] = [
  [/\b(Googlebot|bingbot|DuckDuckBot|YandexBot|Baiduspider|facebookexternalhit|Twitterbot|Slackbot|Discordbot|LinkedInBot|TelegramBot|WhatsApp)\b\/?([\d.]*)/i, ""],
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, "Edge"], [/\bOPR\/(\d+)/, "Opera"], [/\bFirefox\/(\d+)/, "Firefox"], [/\bFxiOS\/(\d+)/, "Firefox"],
  [/\bCriOS\/(\d+)/, "Chrome"], [/\bChrome\/(\d+)/, "Chrome"], [/\bVersion\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
];
const TOOL = /^(curl|Wget|python-requests|python-urllib3|Python-urllib|aiohttp|httpx|Go-http-client|okhttp|Java|Apache-HttpClient|node-fetch|axios|undici|PostmanRuntime|Ruby|libwww-perl|Nuclei|nuclei|Burp|sqlmap|Faraday|Dart|got|Deno|Bun)\/?([\w.-]*)/;

// "Chrome 150 on macOS", "curl 8.5.0", "Googlebot 2.1"; an unknown agent comes back trimmed
export function uaShort(ua: string): string {
  const s = ua.trim();
  if (!s) return "";
  const t = TOOL.exec(s);
  if (t) return t[2] ? `${t[1]} ${t[2]}` : t[1];
  for (const [re, name] of CLIENT) {
    const m = re.exec(s);
    if (!m) continue;
    if (!name) return m[2] ? `${m[1]} ${m[2]}` : m[1];
    const os = OS.find(([r]) => r.test(s))?.[1];
    return `${name} ${m[1]}${os ? ` on ${os}` : ""}`;
  }
  return s.length > 48 ? `${s.slice(0, 47)}…` : s;
}

// Redirect hops: what the client's HTTP library changed between one request and the next from the same
// source. Credentials and custom headers that survive a redirect to another host are a finding; a
// method that turned from POST into GET says which redirect codes it rewrites. Header names only (the
// values are in each hit's own request).
const HOP_IGNORED = new Set(["host", "content-length", "content-type", "transfer-encoding", "connection", "keep-alive"]);
const CREDENTIALS = new Set(["authorization", "cookie", "proxy-authorization"]);
const headerNames = (raw: string) => {
  const out = new Map<string, string>(); // lowercase -> as sent
  for (const ln of raw.split(/\r?\n\r?\n/)[0].split(/\r?\n/).slice(1)) {
    const m = /^([^:\s]+):/.exec(ln);
    if (m && !out.has(m[1].toLowerCase())) out.set(m[1].toLowerCase(), m[1]);
  }
  return out;
};
const methodOf = (raw: string) => /^([A-Z]{2,12}) /.exec(raw)?.[1] ?? "";
export type HopDiff = { method: [string, string] | null; kept: string[]; dropped: string[]; added: string[] };
export function hopDiff(prevRaw: string, curRaw: string): HopDiff {
  const a = headerNames(prevRaw), b = headerNames(curRaw);
  const ma = methodOf(prevRaw), mb = methodOf(curRaw);
  const notable = (k: string) => CREDENTIALS.has(k) || !isStandardHeader(k) && !HOP_IGNORED.has(k) && k !== "user-agent";
  // credentials first, then the rest in the order sent
  const order = (ks: string[]) => [...ks.filter((k) => CREDENTIALS.has(k)), ...ks.filter((k) => !CREDENTIALS.has(k))];
  return {
    method: ma && mb && ma !== mb ? [ma, mb] : null,
    kept: order([...a.keys()].filter((k) => b.has(k) && notable(k))).map((k) => b.get(k)!),
    dropped: order([...a.keys()].filter((k) => !b.has(k) && notable(k))).map((k) => a.get(k)!),
    added: order([...b.keys()].filter((k) => !a.has(k) && notable(k))).map((k) => b.get(k)!),
  };
}
// "method POST → GET · kept Authorization, Cookie · dropped X-Api-Key"; "same method and headers"
export function hopWords(d: HopDiff): string {
  const parts = [d.method && `method ${d.method[0]} → ${d.method[1]}`, d.kept.length && `kept ${d.kept.join(", ")}`,
    d.dropped.length && `dropped ${d.dropped.join(", ")}`, d.added.length && `added ${d.added.join(", ")}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "same method and headers";
}

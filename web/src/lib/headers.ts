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

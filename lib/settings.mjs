// Settings the dashboard can change: they're saved where they already live, so a restart, a deploy
// script and a hand edit all agree with what Settings shows.
//   colluder.env  DISCORD_WEBHOOK_URL, COLLUDER_CHECK_MINUTES, COLLUDER_DOMAIN, COLLUDER_EXTRA_DOMAINS
//   engine.yaml   the engine's server: line (the rest, the token included, is left exactly as it is)
// Writes are atomic (a temporary file, then a rename) and keep the file private (mode 600).
import { readFile, writeFile, rename } from "node:fs/promises";

// Discord's own webhook hosts only: a saved URL is fetched by this box on every alert
export const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,120}$/;
// the alerts Discord can carry; each can be turned off
export const ALERT_KINDS = ["first", "escalation", "source", "late", "rollup", "check"];
export const CHECK_MINUTES = { min: 2, max: 1440 }; // 0 turns the check off

// what the browser sees of a webhook: enough to recognise it, not enough to post with it
export const webhookHint = (url) => (url ? `…${url.slice(-4)}` : null);

export function alertKinds(saved) {
  let s = {};
  try { s = JSON.parse(saved || "{}") || {}; } catch { s = {}; }
  return Object.fromEntries(ALERT_KINDS.map((k) => [k, s[k] !== false]));
}

// KEY=value lines; null removes the key. A commented-out "# KEY=" line is replaced in place, so the
// value lands where the file explains it. Other lines and comments stay as they are.
export function setEnvLines(text, updates) {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  for (const [key, value] of Object.entries(updates)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`bad key ${key}`);
    if (value !== null && !/^[\x21-\x7e]*$/.test(String(value))) throw new Error(`${key}: only printable characters without spaces`);
    const active = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (value === null) { if (active >= 0) lines.splice(active, 1); continue; }
    const line = `${key}=${value}`;
    if (active >= 0) { lines[active] = line; continue; }
    const commented = lines.findIndex((l) => new RegExp(`^#\\s*${key}=`).test(l));
    if (commented >= 0) lines[commented] = line;
    else lines.push(line);
  }
  return lines.join("\n") + "\n";
}

// the engine's server: line, nothing else (the file holds the token: it's never parsed or logged)
export function setServerLine(text, domain) {
  if (!/^server:.*$/m.test(text)) return `server: ${domain}\n` + text;
  return text.replace(/^server:.*$/m, `server: ${domain}`);
}

async function rewrite(path, change) {
  let text = "";
  try { text = await readFile(path, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  const next = change(text);
  if (next === text) return false;
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, next, { mode: 0o600 });
  await rename(tmp, path);
  return true;
}
export const writeEnv = (path, updates) => rewrite(path, (t) => setEnvLines(t, updates));
export const writeEngineServer = (path, domain) => rewrite(path, (t) => setServerLine(t, domain));

// nuclei's interactsh_server in user's config: read so Settings can say whether it matches (only
// that one key is looked at; the file is never written here)
export async function nucleiServer(path) {
  try {
    const m = /^\s*interactsh_server:\s*["']?([^"'\s#]+)/m.exec(await readFile(path, "utf8"));
    return m ? m[1] : null;
  } catch { return null; }
}

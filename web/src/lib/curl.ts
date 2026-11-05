// "Copy as curl" (PLAN-REVIEW3.md C4): a captured HTTP request rebuilt as a curl command, for a repro
// in a report. Every captured value is single-quoted for the shell, so nothing in it runs.

export const sq = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";

const SKIP = new Set(["host", "content-length", "connection", "transfer-encoding"]);

export function toCurl(raw: string, scheme: "http" | "https", { id, normalised }: { id: number; normalised: boolean }): string | null {
  const sep = /\r?\n\r?\n/.exec(raw);
  const head = (sep ? raw.slice(0, sep.index) : raw).split(/\r?\n/);
  const body = sep ? raw.slice(sep.index + sep[0].length) : "";
  const m = /^([A-Z][A-Z0-9_-]*) (\S+) HTTP\/[\d.]+$/.exec(head[0]);
  if (!m) return null;
  const [, method, target] = m;
  const headers: [string, string][] = [];
  for (const ln of head.slice(1)) {
    const h = /^([^:\s]+):[ \t]*(.*)$/.exec(ln);
    if (!h) return null;
    headers.push([h[1], h[2]]);
  }
  const host = headers.find(([k]) => k.toLowerCase() === "host")?.[1];
  const url = /^https?:\/\//i.test(target) ? target : host ? `${scheme}://${host}${target}` : null;
  if (!url) return null;
  const parts = ["curl", "-sS"];
  if (method === "HEAD") parts.push("-I");
  else if (!(method === "GET" && !body) && !(method === "POST" && body)) parts.push("-X", method);
  parts.push(sq(url));
  for (const [k, v] of headers) if (!SKIP.has(k.toLowerCase())) parts.push("-H", sq(`${k}: ${v}`));
  if (body) parts.push("--data-binary", sq(body));
  const note = normalised ? "; interactsh normalised header order and name case" : "";
  return `# Rebuilt from Colluder hit #${id}${note}\n${parts.join(" ")}`;
}

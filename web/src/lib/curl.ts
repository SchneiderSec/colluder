// "Copy as curl": a captured HTTP request rebuilt as a curl command, for a repro
// in a report. Every captured value is single-quoted for the shell, so nothing in it runs.

export const sq = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";

const SKIP = new Set(["host", "content-length", "connection", "transfer-encoding"]);

// -g: no URL globbing ({{7*7}} and [::1] in a captured query would break it); --path-as-is: send
// /a/../b as captured; --compressed when the client asked for compression, so the reply is readable.
export function toCurl(raw: string, scheme: "http" | "https", { id, normalised, truncated = 0, binary = false }: { id: number; normalised: boolean; truncated?: number; binary?: boolean }): string | null {
  const sep = /\r?\n\r?\n/.exec(raw);
  const head = (sep ? raw.slice(0, sep.index) : raw).split(/\r?\n/);
  const body = sep ? raw.slice(sep.index + sep[0].length) : "";
  const m = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+) (\S+) HTTP\/[\d.]+$/.exec(head[0]);
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
  const parts = ["curl", "-sS", "-g", "--path-as-is"];
  if (headers.some(([k, v]) => k.toLowerCase() === "accept-encoding" && /gzip|deflate|br|zstd/i.test(v))) parts.push("--compressed");
  if (method === "HEAD") parts.push("-I");
  else if (!(method === "GET" && !body) && !(method === "POST" && body)) parts.push("-X", method);
  parts.push(sq(url));
  for (const [k, v] of headers) if (!SKIP.has(k.toLowerCase())) parts.push("-H", sq(`${k}: ${v}`));
  if (body) parts.push("--data-binary", sq(body));
  const note = normalised ? "; interactsh normalised header order and name case" : "";
  const warn = [
    truncated ? `# The body was truncated at capture (${truncated} bytes dropped): this replays only what was kept.` : null,
    binary ? "# The request wasn't UTF-8: this body is a lossy text view. Download the exact bytes from the hit to replay it." : null,
  ].filter(Boolean).join("\n");
  return `# Rebuilt from Colluder hit #${id}${note}\n${warn ? warn + "\n" : ""}${parts.join(" ")}`;
}

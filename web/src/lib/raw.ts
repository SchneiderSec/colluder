import type { Enrich, Interaction, InteractionDetail, Probe } from "./types";
import { isoMs } from "./format";

export type HitGroup = { kind: "one"; items: [Interaction] } | { kind: "burst"; items: Interaction[] };

// hits newest-first; consecutive DNS queries (<3 s apart) collapse into one burst row
export function groupHits(hits: Interaction[]): HitGroup[] {
  const out: HitGroup[] = [];
  for (const i of hits) {
    const g = out[out.length - 1];
    if (i.protocol === "dns" && g) {
      const prev = g.items[g.items.length - 1];
      const close = isoMs(prev.timestamp) - isoMs(i.timestamp) <= 3000;
      if (g.kind === "burst" && close) { g.items.push(i); continue; }
      if (g.kind === "one" && prev.protocol === "dns" && close) { out[out.length - 1] = { kind: "burst", items: [prev, i] }; continue; }
    }
    out.push({ kind: "one", items: [i] });
  }
  return out;
}

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

// "Decoded" view: URL-decoded request line, formatted JSON / form bodies. Copies always stay exact.
export function decode(raw: string, protocol: string) {
  if (!raw || !(protocol === "http" || protocol === "https")) return raw;
  const sep = /\r?\n\r?\n/.exec(raw);
  const head = sep ? raw.slice(0, sep.index) : raw;
  let body = sep ? raw.slice(sep.index + sep[0].length) : "";
  const lines = head.split(/\r?\n/);
  lines[0] = lines[0].replace(/^(\S+ )(\S+)( .*)$/, (_, a: string, t: string, b: string) => a + safeDecode(t) + b);
  const ct = (lines.find((l) => /^content-type:/i.test(l)) || "").toLowerCase();
  if (body) {
    if (ct.includes("json") || /^\s*[[{]/.test(body)) { try { body = JSON.stringify(JSON.parse(body), null, 2); } catch { /* keep */ } }
    else if (ct.includes("x-www-form-urlencoded")) body = body.split("&").map((kv) => kv.split("=").map((x) => safeDecode(x.replace(/\+/g, " "))).join(" = ")).join("\n");
  }
  return lines.join("\n") + (sep ? "\n\n" + body : "");
}

import { answeredBy } from "./answer.ts";
export { answeredBy };

export function evidence(d: InteractionDetail, e: Partial<Enrich>, probe: Probe | undefined, domain: string | undefined) {
  return [
    `Colluder evidence · ${d.tag ? "probe " + d.tag : "untagged"} · interaction #${d.id}`,
    `Protocol: ${d.protocol.toUpperCase()}${d.qType ? " " + d.qType : ""}`,
    `Source: ${d.remoteAddress}${e.rdns ? ` (rDNS ${e.rdns})` : ""}${e.asn ? " · " + [e.asn, e.asnName, e.asnCc].filter(Boolean).join(" ") : ""}`,
    `Full id: ${d.fullId}${domain ? `  (payload domain ${domain})` : ""}`,
    probe?.target ? `Planted on: ${probe.target} (at ${probe.plantedAt})` : null,
    `Captured by ${d.answer ? "Colluder's edge (it answered this hit)" : "engine (interactsh-client)"}: ${d.timestamp}`,
    `Received by dashboard: ${d.receivedAt}`,
    `SHA-256 of raw request (${d.binary ? "the exact bytes; not UTF-8, so the text here is a lossy view" : "UTF-8"}, as logged by the ${d.answer ? "edge" : "engine"}): ${d.reqSha256}`,
    d.answer?.droppedBytes ? `Body truncated: the edge kept the first 1 MB and dropped ${d.answer.droppedBytes} bytes.` : null,
    "",
    d.answer ? "--- Raw request (exact bytes, recorded by Colluder's edge) ---"
      : d.protocol === "http" || d.protocol === "https" ? "--- Raw request (as logged by interactsh-client; header order and name case normalised by interactsh) ---"
      : `--- Raw request (${d.answer ? "as received by the edge" : "as logged by interactsh-client"}) ---`,
    d.rawRequest,
    `--- Raw response (${d.protocol === "dns" ? (d.answer ? "sent by interactsh-server, relayed by the edge" : "sent by interactsh-server") : answeredBy(d.answer)}) ---`,
    d.rawResponse,
  ].filter((x) => x !== null).join("\n");
}

export function variants(host: string | undefined, domain: string | undefined, tag: string | null) {
  if (!host || !domain) return null;
  const idPart = host.endsWith("." + domain) ? host.slice(0, -(domain.length + 1)) : host;
  const all = [
    { proto: "dns", value: tag ? `${tag}-${host}` : host, parts: tag ? [["em", tag], ["", "-" + host]] : [["", host]], note: "Hostname fields; targets that only resolve." },
    { proto: "http", value: tag ? `http://${tag}-${host}/` : `http://${host}/`, parts: tag ? [["", "http://"], ["em", tag], ["", `-${host}/`]] : [["", `http://${host}/`]], note: "URL fields." },
    { proto: "https", value: tag ? `https://${tag}-${host}/` : `https://${host}/`, parts: tag ? [["", "https://"], ["em", tag], ["", `-${host}/`]] : [["", `https://${host}/`]], note: "URL fields; the certificate covers it." },
  ] as const satisfies readonly { proto: string; value: string; parts: readonly (readonly [string, string])[]; note: string }[];
  // Phones: a long (33-char) id shows as "c0ffee12…" so the payload stays on one line with the tag
  // whole; a short id is shown as is. Display only: the title and every copy carry the full value.
  const short = `${idPart.slice(0, 8)}…`;
  const shorten = (t: string) => (idPart.length <= 12 ? t : t.replace(`${idPart}.${domain}`, short).replace(idPart, short));
  return all.map((v) => ({ ...v, short: v.parts.map(([k, t]) => [k, k === "em" ? t : shorten(t)] as const) }));
}

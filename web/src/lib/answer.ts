// What a hit got back, in one sentence. Shared by the hit detail and the probe report (Node runs this
// file for the report, so its imports carry the .ts extension).

type A = {
  mode: string; version: number | null; hop?: number; status?: number; decoy?: string; part?: string;
  code?: number; to?: string; error?: string; malformed?: string; delaySkipped?: boolean;
} | null | undefined;

const DECOY: Record<string, string> = { first: "one of the first requests", "user-agent": "matched the User-Agent", method: "matched the method", source: "matched the source" };

export function answeredBy(a: A): string {
  if (!a) return "sent by interactsh-server (its default reply)";
  if (a.mode === "error") return `refused by Colluder (${a.error ?? "bad request"})`;
  if (a.mode === "tls") return "nothing: the TLS handshake never completed";
  if (a.mode === "relay") return "sent by interactsh-server, relayed by the edge";
  const odd = a.malformed ? "; the request was malformed" : "";
  if (a.mode === "default" || a.version == null) return `sent by Colluder (default reply${odd})`;
  const v = `rule v${a.version}, `;
  if (a.decoy) return `sent by Colluder (${v}decoy: the default reply, ${DECOY[a.decoy] ?? a.decoy}${odd})`;
  const what = a.mode === "redirect"
    ? `redirect${a.hop ? `, hop ${a.hop}` : ""}${a.code ? `: ${a.code} → ${a.to ?? "?"}` : a.status ? ` (${a.status})` : ""}`
    : a.mode === "file" ? "hosted file"
    : a.mode === "preset" ? (a.part ? `XXE preset, served ${a.part}` : "XXE preset, default reply")
    : "custom response";
  return `sent by Colluder (${v}${what}${a.delaySkipped ? "; delay skipped: too many waiting" : ""}${odd})`;
}

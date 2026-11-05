import { useEffect, useRef, useState } from "react";
import { ArrowDown, Copy, FileText, Search, Terminal } from "lucide-react";
import { useApp, loadDetail, lookupAsn, save, chatterOf, setMine } from "@/store";
import { dnsSteps } from "@/lib/dns";
import { stageOf } from "@/lib/stage";
import { decodeLabels } from "@/lib/exfil";
import { variantOf, SECTION_LABEL } from "@/lib/kit";
import { toCurl } from "@/lib/curl";
import type { Enrich } from "@/lib/types";
import { byteCount, lineCount } from "@/lib/format";
import { answeredBy, decode, evidence } from "@/lib/raw";
import { ExactLine, HttpParsed, parseHttp, type Parsed } from "./HttpView";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Chip, TypeChip } from "./bits";
import { Peek } from "./Mark";
import { cn } from "@/lib/utils";

const MAX = 200_000;

// Raw text is attacker-controlled: rendered only as React text nodes (escaped), never as HTML.
// headers a proxy or the client used to say who the real caller is: the first thing to check on SSRF
const FORWARDED = ["x-forwarded-for", "x-real-ip", "forwarded", "true-client-ip", "cf-connecting-ip", "x-client-ip", "x-originating-ip"];
function forwardedFor(raw: string): [string, string][] {
  const head = raw.split(/\r?\n\r?\n/)[0].split(/\r?\n/).slice(1);
  const out: [string, string][] = [];
  for (const ln of head) {
    const m = /^([^:]+):[ \t]*(.*)$/.exec(ln);
    if (m && FORWARDED.includes(m[1].toLowerCase()) && m[2]) out.push([m[1], m[2]]);
  }
  return out;
}

const cut = (t: string) => (t.length > MAX ? t.slice(0, MAX) : t);

function RawPane({ title, sub, text, exact, http, p, tag, domain, capture, clientHttp2 }: { title: string; sub: string; text: string; exact: string; http: boolean; p?: Parsed | null; tag: string | null; domain?: string; capture: "edge" | "engine"; clientHttp2?: boolean }) {
  const shown = cut(text);
  const box = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(0); // lines hidden under the fold, so a cut-off pane never looks complete
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setBelow(Math.max(0, Math.round((el.scrollHeight - el.scrollTop - el.clientHeight) / 18)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", measure); };
  }, [shown]);
  let inHead = http;
  const lines = shown ? shown.split(/\r?\n/) : [];
  return (
    <div className="@container/pane relative flex min-h-[220px] min-w-0 flex-col rounded-[3px] border border-rule-2 bg-well max-[820px]:min-h-[200px]">
      <div className="flex h-8 flex-none items-center gap-2 border-b border-rule-2 pr-1.5 pl-3 text-[12.5px] font-[650]">
        {title}<span className="truncate text-[11px] font-normal text-ash">{sub}</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => copy(exact, title.toLowerCase())}><Copy />Copy</Button>
      </div>
      <div ref={box} tabIndex={0} className={cn("raw min-h-0 flex-1 overflow-auto px-3 font-mono text-[12.5px] leading-[18px] text-bone [tab-size:4]", p ? "py-2.5" : "py-2 whitespace-pre in-[.wrap]:break-all in-[.wrap]:whitespace-pre-wrap")}>
        {!shown && <span className="font-sans text-ash">Empty</span>}
        {p ? <HttpParsed p={p} tag={tag} domain={domain} capture={capture} clientHttp2={clientHttp2} /> : lines.map((ln, idx) => {
          const head = inHead;
          if (inHead && ln === "" && idx > 0) inHead = false;
          return (
            <span key={idx} className="block min-h-[18px] in-[.wrap]:pl-[2ch] in-[.wrap]:-indent-[2ch]">
              {http ? <ExactLine ln={ln} idx={idx} inHead={head} tag={tag} /> : ln || "​"}
            </span>
          );
        })}
        {shown !== text && <span className="block font-sans text-ash">… {byteCount(text) - byteCount(shown)} more bytes not shown. Copy gives everything.</span>}
      </div>
      {below > 0 && (
        <button type="button" onClick={() => box.current?.scrollBy({ top: box.current.clientHeight * 0.8, behavior: "smooth" })}
          className="absolute right-2 bottom-2 flex items-center gap-1 rounded-[9px] border border-rule bg-soot-2 px-2 py-0.5 text-[11px] text-smoke shadow-[0_-8px_16px_8px_var(--well)] hover:text-bone">
          <ArrowDown className="size-3" />{below} more {below === 1 ? "line" : "lines"}
        </button>
      )}
    </div>
  );
}


const segCls = "h-6 rounded-none px-2.5 text-[11px] text-smoke data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone";

export function HitDetail({ id }: { id: number }) {
  const s = useApp((x) => x);
  const [decoded, setDecoded] = useState(false);
  // web hits open parsed (sections, decoded query, highlighted); the choice is remembered
  const [parsed, setParsed] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem("colluder.parsed") ?? "true"); } catch { return true; } });
  const [wrap, setWrap] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem("colluder.wrap") ?? "true"); } catch { return true; } });
  const [err, setErr] = useState<string | null>(null);
  const [asnBusy, setAsnBusy] = useState(false);
  const [peek, setPeek] = useState(0);

  useEffect(() => { setErr(null); loadDetail(id).catch((e) => setErr((e as Error).message)); }, [id]);

  // Konami code: the whole raccoon peeks over the edge once
  useEffect(() => {
    const K = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    let seq: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      seq = seq.concat(e.key).slice(-K.length);
      if (seq.join() === K.join()) { seq = []; setPeek((n) => n + 1); setTimeout(() => setPeek(0), 2800); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const box = "@container relative flex min-h-0 flex-col gap-2.5 overflow-auto border-t border-rule bg-soot-1 py-3.5 pr-5 pl-6 max-[820px]:px-3.5";
  const d = s.details.get(id);
  if (!d) return <article className={box}><p className="text-ash">{err ? `Could not load #${id}: ${err}` : `Loading #${id}…`}</p></article>;

  const e: Partial<Enrich> = s.enrich.get(d.remoteAddress) ?? d.enrich ?? {};
  const open = s.openSeen[s.sel!] ?? s.seen[s.sel!] ?? 0;
  const web = d.protocol === "http" || d.protocol === "https";
  const recvMs = Date.parse(d.receivedAt) - Date.parse(d.timestamp.replace(/(\.\d{3})\d+/, "$1"));
  const probe = d.tag ? s.probes.get(d.tag) : undefined;
  const chatter = chatterOf(s.list).get(d.id);
  const step = d.protocol === "dns" ? dnsSteps(s.list).get(d.id) : undefined;
  const fromBox = (s.status?.selfIps ?? []).includes(d.remoteAddress);
  const mine = (s.status?.mineIps ?? []).includes(d.remoteAddress);
  const kit = variantOf(d);
  const a = d.answer;
  const stage = a ? stageOf({ summary: d.summary, fullId: d.fullId, rawRequest: d.rawRequest, hop: a.hop, decoy: a.decoy, answerCode: a.code, answerTo: a.to, hopCode: a.status, answerPart: a.part, answerMode: a.mode, malformed: a.malformed }) : null;
  const tlsOnly = a?.mode === "tls" ? a.tls : null;
  const curl = web && d.rawRequest ? toCurl(d.rawRequest, d.protocol === "https" ? "https" : "http", { id: d.id, normalised: !d.answer, truncated: d.answer?.droppedBytes ?? 0, binary: !!d.binary }) : null;
  // who wrote the bytes: the edge records them off the socket; interactsh re-serialises them
  const capture = d.answer ? "edge" as const : "engine" as const;
  const reqP = web && parsed ? parseHttp(cut(d.rawRequest)) : null;
  const resP = web && parsed ? parseHttp(cut(d.rawResponse)) : null;
  const http2 = web && /^\S+ \S+ HTTP\/2/.test(d.rawRequest);
  const reqWho = capture === "edge" ? "exact, as received by the edge" : "as logged by interactsh-client";
  const size = (t: string) => `${lineCount(t)} lines · ${byteCount(t)} bytes`;
  const webSub = (t: string, pp: Parsed | null, who: string) => (parsed ? (pp ? `parsed · ${byteCount(t)} bytes` : `couldn't parse as HTTP · exact lines · ${size(t)}`) : `${who} · ${size(t)}`);

  return (
    <article aria-label={`Hit ${d.id}`} className={cn(box, wrap && "wrap")}>
      <div className="flex min-h-[30px] flex-none flex-wrap items-center gap-3">
        <span className="text-[17px] font-bold tracking-[.01em]">#{d.id}</span>
        <TypeChip proto={d.protocol} />
        {d.id > open && !chatter && <Chip>new</Chip>}
        <span className="text-smoke">Received <span className="text-bone">{d.timestamp.replace("T", " ").replace(/(\.\d{3})\d*Z$/, "$1 UTC")}</span></span>
        {d.tag && <span className="text-smoke">tag <span className="font-mono text-bone">{d.tag}</span>{d.tagSource === "path" ? " (from path)" : ""}</span>}
        <Button className="ml-auto" onClick={() => copy(evidence(d, e, probe, s.status?.payload?.domain), "evidence block")}><FileText />Copy as evidence</Button>
      </div>

      <div className="flex flex-none flex-wrap items-center gap-x-[22px] gap-y-1 text-[12.5px] whitespace-nowrap max-[820px]:whitespace-normal">
        <span className="flex items-center gap-2"><span className="text-smoke">{d.protocol === "dns" ? "Resolver" : "Source"}</span><span className="font-mono text-[12.5px]">{d.remoteAddress}</span>{fromBox && <span className="text-[11px] text-ash" title="This is the OOB box itself: a self-test, not a target.">this box</span>}
          {d.protocol !== "dns" && !fromBox && (
            <Button variant="quiet" size="sm" title={mine ? "Hits from this address count as targets again" : "Your browser or proxy: its hits become self-tests (left out of reach and the report's first request)"}
              onClick={() => setMine(d.remoteAddress, !mine).then(() => toast(mine ? `${d.remoteAddress} is no longer marked as yours.` : `${d.remoteAddress} is marked as yours: its hits are self-tests now.`), (x) => toast((x as Error).message, true))}>
              {mine ? "Yours · unmark" : "Mark as mine"}
            </Button>
          )}</span>
        {web && forwardedFor(d.rawRequest).map(([h, v]) => (
          <span key={h} className="flex min-w-0 items-center gap-2" title={`From the ${h} header. The sender sets it, so it may be spoofed.`}>
            <span className="text-smoke">Forwarded for</span><span className="truncate font-mono text-[12.5px] text-bone">{v}</span>
          </span>
        ))}
        <span className="flex min-w-0 items-center gap-2"><span className="text-smoke">rDNS</span>{e.rdnsAt && e.rdns ? <span className="truncate font-mono text-[12.5px]">{e.rdns}</span> : <span className="text-[12.5px] text-ash">{e.rdnsAt ? "no PTR record" : "looking up…"}</span>}</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-smoke">ASN / owner</span>
          {e.asn ? <span className="font-mono text-[12.5px]">{[e.asn, e.asnName, e.asnCc, e.asnPrefix].filter(Boolean).join(" · ")}</span> : (
            <>
              <Button variant="quiet" size="sm" disabled={asnBusy} onClick={() => { setAsnBusy(true); lookupAsn(d.remoteAddress).catch((x) => toast((x as Error).message, true)).finally(() => setAsnBusy(false)); }}>
                <Search />{asnBusy ? "Looking up…" : "Look up"}
              </Button>
              <span className="text-[11px] text-ash max-[820px]:basis-full">Sends this IP to a third-party service (Team Cymru).</span>
            </>
          )}
        </span>
      </div>
      {chatter && (
        <p className="flex-none text-[12.5px] text-smoke">
          <b className="font-semibold text-bone">Likely resolver chatter.</b> A lookup of the bare payload id within 10 s of a hit on <span className="font-mono text-bone">{chatter}</span>: a resolver walking the name label by label (QNAME minimisation), or a client resolving the HTTPS host. Kept, but not counted as new.
        </p>
      )}
      {d.protocol === "dns" && <p className="flex-none text-[12.5px] text-smoke">DNS hits come from the resolver that asked on the target's behalf. It is often a public or ISP resolver, not the target itself.</p>}
      {step && (
        <p className="flex-none text-[12.5px] text-smoke">
          <b className="font-semibold text-bone">Resolver step, not data.</b> The same resolver asked for <span className="font-mono text-bone">{step}</span> within seconds. Resolvers that minimise queries ask for the name one label at a time, so the labels here are part of that longer name.
        </p>
      )}
      {stage && (
        <p className="flex-none text-[12.5px] text-smoke">What the edge did: <span className="text-bone">{stage[0].toUpperCase() + stage.slice(1)}.</span>
          {d.answer?.to && <span className="text-ash"> Whether the target followed that last redirect shows in its own response.{(d.answer.hop ?? 0) > 1 ? " Arriving at this hop proves it follows redirects." : ""}</span>}
        </p>
      )}
      {tlsOnly && (
        <p className="flex-none text-[12.5px] text-smoke">
          <b className="font-semibold text-bone">TLS handshake only.</b> The client asked for <span className="font-mono text-bone">{tlsOnly.sni}</span>{tlsOnly.alpn.length ? <> (ALPN {tlsOnly.alpn.join(", ")})</> : null} and closed before sending a request{tlsOnly.error ? <> ({tlsOnly.error})</> : null}. Most often it rejected the certificate, which covers one label under the domain. It proves the target connected; for the request itself, use the path form <span className="font-mono text-bone">https://&lt;id&gt;.{s.status?.payload?.domain ?? "domain"}/{d.tag ?? "tag"}/</span>. The request pane is empty; the ClientHello bytes are in the download.
        </p>
      )}
      {a?.malformed && (
        <p className="flex-none text-[12.5px] text-smoke">
          <b className="font-semibold text-bone">Malformed request ({a.malformed}).</b> A strict HTTP parser would refuse it (a raw space or newline in the target is what an XXE file read looks like), so the edge recorded it exactly as it came and answered from the probe's rule.
        </p>
      )}
      {(d.binary || a?.droppedBytes || tlsOnly) && (
        <p className="flex flex-none flex-wrap items-center gap-x-2 text-[12.5px] text-smoke">
          {d.binary && !tlsOnly && <span><b className="font-semibold text-bone">Not UTF-8.</b> The text below is a UTF-8 view of {d.rawLength?.toLocaleString("en-US")} bytes, so its copies aren't exact; the SHA-256 is of the bytes.</span>}
          {!!a?.droppedBytes && <span><b className="font-semibold text-bone">Body truncated.</b> The edge kept the first 1 MB and dropped {a.droppedBytes.toLocaleString("en-US")} bytes; copies and curl carry only what was kept.</span>}
          {(d.binary || tlsOnly) && <a className="text-bone underline decoration-ash underline-offset-2 hover:decoration-bone" href={`/api/interactions/${d.id}/raw`} download>Download the exact bytes</a>}
        </p>
      )}
      {kit && <p className="flex-none text-[12.5px] text-smoke">Payload: <span className="text-bone">{SECTION_LABEL[kit.section]}, {kit.name}</span> <span className="font-mono text-ash">({kit.code})</span></p>}
      {!step && !!d.extraLabels?.length && !(kit && d.extraLabels.length === 1) && (
        <p className="flex-none text-[12.5px] text-smoke">
          Extra labels before the tag: <span className="font-mono text-bone">{d.extraLabels.join(".")}</span>
          {decodeLabels(d.extraLabels).map(({ label, decoded }) => (
            <span key={label}> · <span className="font-mono">{label}</span> decodes as {decoded.kind} to <span className="font-mono text-bone">{decoded.text.replace(/[\r\n\t]/g, (c) => (c === "\n" ? "\\n" : c === "\t" ? "\\t" : "\\r"))}</span></span>
          ))}
        </p>
      )}

      <div className="mt-0.5 flex flex-none flex-wrap items-center gap-2">
        {web ? (
          <ToggleGroup type="single" value={parsed ? "parsed" : "exact"} onValueChange={(v) => { if (!v) return; setParsed(v === "parsed"); save("colluder.parsed", v === "parsed"); }} aria-label="View"
            className="overflow-hidden rounded-[3px] border border-rule">
            <ToggleGroupItem value="parsed" className={segCls}>Parsed</ToggleGroupItem>
            <ToggleGroupItem value="exact" className={cn(segCls, "border-l border-rule")}>Exact bytes</ToggleGroupItem>
          </ToggleGroup>
        ) : (
          <ToggleGroup type="single" value={decoded ? "decoded" : "exact"} onValueChange={(v) => v && setDecoded(v === "decoded")} aria-label="View"
            className="overflow-hidden rounded-[3px] border border-rule">
            <ToggleGroupItem value="exact" className={segCls}>Exact bytes</ToggleGroupItem>
            <ToggleGroupItem value="decoded" className={cn(segCls, "border-l border-rule")}>Decoded</ToggleGroupItem>
          </ToggleGroup>
        )}
        {web && parsed ? <span className="mr-auto ml-2.5 text-[12.5px] text-ash">Display only; copies stay exact</span> : (
          <label className="mr-auto ml-2.5 flex cursor-pointer items-center gap-[7px] text-[12.5px]">
            <Switch checked={wrap} onCheckedChange={(v) => { setWrap(v); save("colluder.wrap", v); }} aria-label="Wrap long lines" />
            <span className="text-smoke">Wrap long lines</span><span className="text-ash max-[1180px]:hidden">display only; copies stay exact</span>
          </label>
        )}
        {web && curl && <Button variant="ghost" title="The request rebuilt as a curl command, for a repro" onClick={() => copy(curl, "curl command")}><Terminal />Copy as curl</Button>}
        <Button variant="ghost" onClick={() => copy(`${d.rawRequest}\n\n${d.rawResponse}`, "request and response")}><Copy />Copy both</Button>
      </div>

      <div className="grid min-h-[220px] flex-1 grid-cols-2 gap-3 @max-[900px]:flex-none @max-[900px]:grid-cols-1 @max-[900px]:[&>*]:max-h-[360px]">
        <RawPane title={d.protocol === "dns" ? "Query" : "Request"} http={web} p={reqP} tag={d.tag} domain={s.status?.payload?.domain} capture={capture}
          sub={web ? webSub(d.rawRequest, reqP, reqWho) : decoded ? "decoded view · copy stays exact" : `as logged by interactsh-client · ${size(d.rawRequest)}`}
          text={!web && decoded ? decode(d.rawRequest, d.protocol) : d.rawRequest} exact={d.rawRequest} />
        <RawPane title={d.protocol === "dns" ? "Answer" : "Response"} http={web} p={resP} tag={d.tag} domain={s.status?.payload?.domain} capture={capture} clientHttp2={http2}
          sub={d.protocol === "dns" ? "sent by interactsh-server" : `${answeredBy(d.answer)} · ${parsed && !resP ? "couldn't parse · exact lines · " : ""}${byteCount(d.rawResponse)} bytes`}
          text={!web && decoded ? decode(d.rawResponse, d.protocol) : d.rawResponse} exact={d.rawResponse} />
      </div>

      <div aria-label="Custody record" className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 rounded-[3px] border border-rule bg-soot px-3 py-1.5 text-[11px] whitespace-nowrap max-[820px]:flex-col max-[820px]:items-start">
        <b className="font-[650]">Custody</b>
        <span title={`Captured by ${d.answer ? "Colluder's edge" : "the engine"} ${d.timestamp}`}><span className="text-smoke">{d.answer ? "Edge " : "Engine "}</span><span className="font-mono">{d.timestamp}</span></span>
        <span title={`Received by dashboard ${d.receivedAt}`}>
          <span className="text-smoke">Dashboard </span><span className="font-mono">{d.receivedAt}</span>
          {recvMs >= 0 && <span className="text-ash">{recvMs < 60000 ? ` +${recvMs} ms` : " (backfilled after a restart)"}</span>}
        </span>
        <span className="ml-auto flex items-center gap-1.5 max-[820px]:ml-0" title={`SHA-256 of the exact request bytes, computed by the dashboard when it stored this hit:\n${d.reqSha256}`}>
          <span className="text-smoke">SHA-256 at ingest</span><span className="font-mono">{d.reqSha256.slice(0, 8)}…{d.reqSha256.slice(-4)}</span>
          <Button variant="ghost" size="sm" aria-label="Copy SHA-256" onClick={() => copy(d.reqSha256, "SHA-256")}><Copy /></Button>
        </span>
      </div>
      {!!peek && <Peek key={peek} />}
    </article>
  );
}

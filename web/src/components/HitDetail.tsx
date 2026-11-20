import { useEffect, useRef, useState } from "react";
import { ArrowDown, ChevronRight, Copy, FileText, Search, Terminal, X } from "lucide-react";
import { useApp, loadDetail, lookupAsn, save, chatterOf, setMine, selectHit } from "@/store";
import { dnsSteps } from "@/lib/dns";
import { stageOf } from "@/lib/stage";
import { decodeLabels } from "@/lib/exfil";
import { variantOf, SECTION_LABEL } from "@/lib/kit";
import { toCurl } from "@/lib/curl";
import type { Enrich, InteractionDetail } from "@/lib/types";
import { uaShort } from "@/lib/headers";
import { byteCount, isoMs, lineCount, stamp } from "@/lib/format";
import { answeredBy, decode, evidence } from "@/lib/raw";
import { DnsLine, DnsNameMarked, ExactLine, HttpParsed, MailLine, parseHttp, type Parsed } from "./HttpView";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Chip, TypeChip } from "./bits";
import { Peek } from "./Mark";
import { cn } from "@/lib/utils";
import { Ultra } from "@/components/Ultra";

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

function RawPane({ title, sub, text, exact, http, proto, p, tag, domain, capture, clientHttp2 }: { title: string; sub: string; text: string; exact: string; http: boolean; proto: string; p?: Parsed | null; tag: string | null; domain?: string; capture: "edge" | "engine"; clientHttp2?: boolean }) {
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
  // HTTP and mail both open with a header block that ends at the first blank line
  let inHead = http || proto === "smtp";
  const lines = shown ? shown.split(/\r?\n/) : [];
  return (
    <div className="@container/pane relative flex min-h-[220px] min-w-0 flex-col rounded-[3px] border border-rule bg-well @max-[900px]/detail:min-h-[120px]">
      <div className="flex h-8 flex-none items-center gap-2 border-b border-rule-2 pr-1.5 pl-3 text-body font-[650]">
        {title}<span className="truncate text-label font-normal text-ash">{sub}</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => copy(exact, title.toLowerCase())}><Copy />Copy</Button>
      </div>
      {/* side by side, the panes take the strip's height and scroll inside it: contain-size keeps a long
          capture from setting the strip's minimum, so the strip always holds its panes */}
      <div ref={box} tabIndex={0} className={cn("raw min-h-0 flex-1 overflow-auto px-3 @min-[900px]/detail:contain-size font-mono text-body leading-[1.125rem] text-bone [tab-size:4]", p ? "py-2.5" : "py-2 whitespace-pre in-[.wrap]:break-all in-[.wrap]:whitespace-pre-wrap")}>
        {!shown && <span className="font-sans text-ash">Empty</span>}
        {p ? <HttpParsed p={p} tag={tag} domain={domain} capture={capture} clientHttp2={clientHttp2} /> : lines.map((ln, idx) => {
          const head = inHead;
          if (inHead && ln === "" && idx > 0) inHead = false;
          return (
            <span key={idx} className="block min-h-[18px] in-[.wrap]:pl-[2ch] in-[.wrap]:-indent-[2ch]">
              {http ? <ExactLine ln={ln} idx={idx} inHead={head} tag={tag} />
                : proto === "dns" ? <DnsLine ln={ln} tag={tag} />
                : proto === "smtp" ? <MailLine ln={ln} inHead={head} />
                : ln || "​"}
            </span>
          );
        })}
        {shown !== text && <span className="block font-sans text-ash">… {byteCount(text) - byteCount(shown)} more bytes not shown. Copy gives everything.</span>}
      </div>
      {below > 0 && (
        <button type="button" onClick={() => box.current?.scrollBy({ top: box.current.clientHeight * 0.8, behavior: "smooth" })}
          className="absolute right-2 bottom-2 flex items-center gap-1 rounded-[9px] border border-rule bg-soot-2 px-2 py-0.5 text-label text-smoke shadow-[0_-8px_16px_8px_var(--well)] hover:text-bone">
          <ArrowDown className="size-3" />{below} more {below === 1 ? "line" : "lines"}
        </button>
      )}
    </div>
  );
}


// What happened, in one line, before any detail: "MX lookup of x.orca-k7wq2x.alt.example",
// "GET /d?d= HTTP/1.1" with its User-Agent, "Mail from a@b to kc5@…" with its subject. Captured values
// stay mono and are text only.
function What({ d }: { d: InteractionDetail }) {
  const [head, ...rest] = (d.summary ?? "").split(" · ");
  const tail = rest.join(" · ");
  let lead: React.ReactNode;
  if (d.protocol === "dns") {
    const name = d.qType && head.startsWith(`${d.qType} `) ? head.slice(d.qType.length + 1) : head;
    lead = <><span className="font-sans font-[650]">{d.qType || "DNS"} lookup</span> <span className="text-smoke">of</span> <DnsNameMarked name={name} tag={d.tag} /></>;
  } else if (d.protocol === "smtp") {
    const m = /^MAIL FROM (.*?) → (.*)$/.exec(head);
    lead = m ? <><span className="font-sans font-[650]">Mail</span> <span className="font-sans text-smoke">from</span> {m[1]} <span className="font-sans text-smoke">to</span> {m[2]}</> : head;
  } else lead = head.replace(/ HTTP\/[\d.]+$/, "");
  // a web hit's tail is its User-Agent: named in a few words, the whole string on hover
  const web = d.protocol === "http" || d.protocol === "https";
  const short = web ? uaShort(tail) : tail;
  return (
    <p className="flex-none font-mono text-title leading-snug break-all text-bone">
      {lead}
      {short && <span className="ml-2 font-sans text-body break-normal text-ash" title={web && short !== tail ? tail : undefined}>{short}</span>}
    </p>
  );
}

const segCls = "h-6 rounded-none px-2.5 text-label text-smoke data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone";

export function HitDetail({ id }: { id: number }) {
  const s = useApp((x) => x);
  const [decoded, setDecoded] = useState(false);
  // web hits open parsed (sections, decoded query, highlighted); the choice is remembered
  const [parsed, setParsed] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem("colluder.parsed") ?? "true"); } catch { return true; } });
  const [wrap, setWrap] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem("colluder.wrap") ?? "true"); } catch { return true; } });
  // a DNS hit's query and answer are mostly the resolver's boilerplate: the line above them says what
  // was asked, so the bytes stay folded until wanted (remembered)
  const [dnsBytes, setDnsBytes] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem("colluder.dnsBytes") ?? "false"); } catch { return false; } });
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

  // Strip Bay: the detail sits on the bay, as two strips: what happened (header, lead, fields, notes),
  // then the bytes (view controls, request and response, custody)
  const box = "@container/detail relative flex min-h-0 flex-col gap-2 overflow-auto border-t border-rule bg-bay p-2 max-[820px]:p-1.5";
  const strip = "flex flex-none flex-col gap-2.5 rounded-md border border-rule bg-soot py-3 pr-4 pl-5 max-[820px]:px-3";
  const d = s.details.get(id);
  if (!d) return <article className={box}><p className={cn(strip, "text-ash")}>{err ? `Could not load #${id}: ${err}` : `Loading #${id}…`}</p></article>;

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
  // what went back, in one line: the status, the type and size, and who sent it
  const resHead = web && !tlsOnly ? (resP ?? parseHttp(cut(d.rawResponse))) : null;
  const answered = resHead?.status ? {
    code: resHead.status, reason: resHead.reason ?? "", bytes: byteCount(resHead.body),
    type: (resHead.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "").split(";")[0].trim(),
    by: answeredBy(d.answer),
  } : null;
  // other web hits from this address within 10 s, in time order: one firing, step by step
  const near = web && !fromBox ? s.list.filter((i) => i.id !== d.id && (i.protocol === "http" || i.protocol === "https") && i.remoteAddress === d.remoteAddress
    && Math.abs(isoMs(i.timestamp) - isoMs(d.timestamp)) <= 10_000).sort((x, y) => isoMs(x.timestamp) - isoMs(y.timestamp)) : [];
  const webSub = (t: string, pp: Parsed | null, who: string) => (parsed ? (pp ? `parsed · ${byteCount(t)} bytes` : `couldn't parse as HTTP · exact lines · ${size(t)}`) : `${who} · ${size(t)}`);

  return (
    <article aria-label={`Hit ${d.id}`} className={cn(box, wrap && "wrap")}>
      <div className={strip}>
      {/* the facts wrap among themselves; the actions keep the first line's right end */}
      <div className="flex min-h-[30px] flex-none items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 pt-[3px]">
          <span className="text-headline leading-6 font-bold tracking-[.01em]">#{d.id}</span>
          <TypeChip proto={d.protocol} />
          {d.id > open && !chatter && <Chip>new</Chip>}
          <span className="text-smoke" title={`Captured ${d.timestamp}`}>Received <span className="text-bone">{stamp(d.timestamp, "ms")}</span></span>
          {/* the probe's own tag is already the pane's title; name it only when it says something new */}
          {d.tag && (d.tag !== s.sel || d.tagSource === "path") && <span className="text-smoke">tag <span className="font-mono text-bone"><Ultra text={d.tag} /></span>{d.tagSource === "path" ? " (from path)" : ""}</span>}
        </div>
        <div className="flex flex-none items-center gap-1">
          <Button onClick={() => copy(evidence(d, e, probe, s.status?.payload?.domain), "evidence block")}><FileText />Copy as evidence</Button>
          <Button variant="ghost" size="icon" className="-mr-2 text-smoke" aria-label={`Close hit #${d.id}`} title="Close (Esc)" onClick={() => selectHit(null)}><X /></Button>
        </div>
      </div>

      <What d={d} />

      <div className="flex flex-none flex-wrap items-center gap-x-[22px] gap-y-1 text-body whitespace-nowrap max-[820px]:whitespace-normal">
        <span className="flex items-center gap-2">{d.protocol === "dns"
          ? <span className="cursor-help text-label font-[550] tracking-[.03em] text-ash underline decoration-rule decoration-dotted underline-offset-2" title="DNS hits come from the resolver that asked on the target's behalf. It is often a public or ISP resolver, not the target itself.">Resolver</span>
          : <span className="text-label font-[550] tracking-[.03em] text-ash">Source</span>}<span className={cn("font-mono text-body", !fromBox && !mine && "font-[550] text-bone")}>{d.remoteAddress}</span>{fromBox && <span title="This is the OOB box itself: a self-test, not a target."><Chip grey>this box</Chip></span>}
          {d.protocol !== "dns" && !fromBox && (
            <Button variant="quiet" size="sm" title={mine ? "Hits from this address count as targets again" : "Your browser or proxy: its hits become self-tests (left out of reach and the report's first request)"}
              onClick={() => setMine(d.remoteAddress, !mine).then(() => toast(mine ? `${d.remoteAddress} is no longer marked as yours.` : `${d.remoteAddress} is marked as yours: its hits are self-tests now.`), (x) => toast((x as Error).message, true))}>
              {mine ? "Yours · unmark" : "Mark as mine"}
            </Button>
          )}</span>
        {web && forwardedFor(d.rawRequest).map(([h, v]) => (
          <span key={h} className="flex min-w-0 items-center gap-2" title={`From the ${h} header. The sender sets it, so it may be spoofed.`}>
            <span className="text-label font-[550] tracking-[.03em] text-ash">Forwarded for</span><span className="truncate font-mono text-body text-bone">{v}</span>
          </span>
        ))}
        <span className="flex min-w-0 items-center gap-2"><span className="text-label font-[550] tracking-[.03em] text-ash">rDNS</span>{e.rdnsAt && e.rdns ? <span className="truncate font-mono text-body">{e.rdns}</span> : <span className="text-body text-ash">{e.rdnsAt ? "no PTR record" : "looking up…"}</span>}</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-label font-[550] tracking-[.03em] text-ash">ASN / owner</span>
          {e.asn ? <span className="font-mono text-body">{[e.asn, e.asnName, e.asnCc, e.asnPrefix].filter(Boolean).join(" · ")}</span> : (
            <>
              <Button variant="quiet" size="sm" disabled={asnBusy} title="Sends this IP to a third-party service (Team Cymru)" onClick={() => { setAsnBusy(true); lookupAsn(d.remoteAddress).catch((x) => toast((x as Error).message, true)).finally(() => setAsnBusy(false)); }}>
                <Search />{asnBusy ? "Looking up…" : "Look up"}
              </Button>
            </>
          )}
        </span>
      </div>
      {answered && (
        <p className="flex flex-none flex-wrap items-baseline gap-x-2 text-body text-smoke">
          <span className="text-label font-[550] tracking-[.03em] text-ash">Answered</span>
          <span><b className="font-mono font-[650] text-bone">{answered.code}</b> {answered.reason && <span className="text-bone">{answered.reason}</span>}{answered.type && <> · <span className="font-mono text-bone">{answered.type}</span></>} · {answered.bytes.toLocaleString("en-US")} {answered.bytes === 1 ? "byte" : "bytes"}</span>
          <span className="text-ash">{answered.by}</span>
        </p>
      )}
      {near.length > 0 && (
        <p className="flex flex-none flex-wrap items-baseline gap-x-2 gap-y-1 text-body text-smoke">
          <span className="text-label font-[550] tracking-[.03em] text-ash" title="Web hits from this same address within 10 s: most likely one firing, step by step">Same source</span>
          {near.slice(0, 4).map((n) => {
            const ms = isoMs(n.timestamp) - isoMs(d.timestamp);
            return (
              <button key={n.id} type="button" onClick={() => selectHit(n.id)} title={n.summary}
                className="cursor-pointer text-left underline decoration-rule underline-offset-2 hover:text-bone hover:decoration-bone">
                <span className="font-semibold text-bone">#{n.id}</span> <span className="font-mono">{n.summary.split(" · ")[0].replace(/ HTTP\/[\d.]+$/, "")}</span>{n.tag !== d.tag && n.tag ? <span className="text-ash"> on {n.tag}</span> : null}
                <span className="text-ash"> {Math.abs(ms) < 1000 ? `${Math.abs(ms)} ms` : `${(Math.abs(ms) / 1000).toFixed(1)} s`} {ms < 0 ? "before" : "after"}</span>
              </button>
            );
          })}
          {near.length > 4 && <span className="text-ash">+{near.length - 4} more</span>}
        </p>
      )}
      {chatter && (
        <p className="flex-none text-body text-smoke">
          <b className="font-semibold text-bone">Likely resolver chatter.</b> A lookup of the bare payload id within 10 s of a hit on <span className="font-mono text-bone">{chatter}</span>: a resolver walking the name label by label (QNAME minimisation), or a client resolving the HTTPS host. Kept, but not counted as new.
        </p>
      )}
      {step && (
        <p className="flex-none text-body text-smoke">
          <b className="font-semibold text-bone">Resolver step, not data.</b> The same resolver asked for <span className="font-mono text-bone">{step}</span> within seconds. Resolvers that minimise queries ask for the name one label at a time, so the labels here are part of that longer name.
        </p>
      )}
      {stage && (
        <p className="flex-none text-body text-smoke">What the edge did: <span className="text-bone">{stage[0].toUpperCase() + stage.slice(1)}.</span>
          {d.answer?.to && <span className="text-ash"> Whether the target followed that last redirect shows in its own response.{(d.answer.hop ?? 0) > 1 ? " Arriving at this hop proves it follows redirects." : ""}</span>}
        </p>
      )}
      {tlsOnly && (
        <p className="flex-none text-body text-smoke">
          <b className="font-semibold text-bone">TLS handshake only.</b> The client asked for <span className="font-mono text-bone">{tlsOnly.sni}</span>{tlsOnly.alpn.length ? <> (ALPN {tlsOnly.alpn.join(", ")})</> : null} and closed before sending a request{tlsOnly.error ? <> ({tlsOnly.error})</> : null}. Most often it rejected the certificate, which covers one label under the domain. It proves the target connected; for the request itself, join the tag to the id with a dash: <span className="font-mono text-bone">https://{d.tag ?? "tag"}-&lt;id&gt;.{s.status?.payload?.domain ?? "domain"}/</span>. The request pane is empty; the ClientHello bytes are in the download.
        </p>
      )}
      {a?.malformed && (
        <p className="flex-none text-body text-smoke">
          <b className="font-semibold text-bone">Malformed request ({a.malformed}).</b> A strict HTTP parser would refuse it (a raw space or newline in the target is what an XXE file read looks like), so the edge recorded it exactly as it came and answered from the probe's rule.
        </p>
      )}
      {(d.binary || a?.droppedBytes || tlsOnly) && (
        <p className="flex flex-none flex-wrap items-center gap-x-2 text-body text-smoke">
          {d.binary && !tlsOnly && <span><b className="font-semibold text-bone">Not UTF-8.</b> The text below is a UTF-8 view of {d.rawLength?.toLocaleString("en-US")} bytes, so its copies aren't exact; the SHA-256 is of the bytes.</span>}
          {!!a?.droppedBytes && <span><b className="font-semibold text-bone">Body truncated.</b> The edge kept the first 1 MB and dropped {a.droppedBytes.toLocaleString("en-US")} bytes; copies and curl carry only what was kept.</span>}
          {(d.binary || tlsOnly) && <a className="text-bone underline decoration-ash underline-offset-2 hover:decoration-bone" href={`/api/interactions/${d.id}/raw`} download>Download the exact bytes</a>}
        </p>
      )}
      {kit && <p className="flex-none text-body text-smoke">Payload: <span className="text-bone">{SECTION_LABEL[kit.section]}, {kit.name}</span> <span className="font-mono text-ash">({kit.code})</span></p>}
      {!step && !!d.extraLabels?.length && !(kit && d.extraLabels.length === 1) && (
        <p className="flex-none text-body text-smoke">
          Extra labels before the tag: <span className="font-mono text-bone">{d.extraLabels.join(".")}</span>
          {decodeLabels(d.extraLabels).map(({ label, decoded }) => (
            <span key={label}> · <span className="font-mono">{label}</span> decodes as {decoded.kind} to <span className="font-mono text-bone">{decoded.text.replace(/[\r\n\t]/g, (c) => (c === "\n" ? "\\n" : c === "\t" ? "\\t" : "\\r"))}</span></span>
          ))}
        </p>
      )}

      </div>
      {/* no min-h-0: the strip never shrinks below its panes (it used to, and the panes spilled out of
          it); when there isn't room the detail scrolls instead */}
      <div className={cn(strip, (d.protocol !== "dns" || dnsBytes) && "flex-1 max-[820px]:flex-none")}>
      {d.protocol === "dns" && !dnsBytes ? (
        <button type="button" onClick={() => { setDnsBytes(true); save("colluder.dnsBytes", true); }}
          className="mt-0.5 flex flex-none items-center gap-1.5 self-start text-body text-smoke hover:text-bone">
          <ChevronRight className="size-3.5" />Query and answer<span className="text-ash">· exact bytes ({byteCount(d.rawRequest) + byteCount(d.rawResponse)})</span>
        </button>
      ) : (
      <>
      <div className="mt-0.5 flex flex-none flex-wrap items-center gap-2">
        {web ? (
          <ToggleGroup type="single" value={parsed ? "parsed" : "exact"} onValueChange={(v) => { if (!v) return; setParsed(v === "parsed"); save("colluder.parsed", v === "parsed"); }} aria-label="View"
            className="overflow-hidden rounded-[3px] border border-rule">
            <ToggleGroupItem value="parsed" className={segCls} title="Display only: copies stay exact">Parsed</ToggleGroupItem>
            <ToggleGroupItem value="exact" className={cn(segCls, "border-l border-rule")}>Exact bytes</ToggleGroupItem>
          </ToggleGroup>
        ) : (
          <ToggleGroup type="single" value={decoded ? "decoded" : "exact"} onValueChange={(v) => v && setDecoded(v === "decoded")} aria-label="View"
            className="overflow-hidden rounded-[3px] border border-rule">
            <ToggleGroupItem value="exact" className={segCls}>Exact bytes</ToggleGroupItem>
            <ToggleGroupItem value="decoded" className={cn(segCls, "border-l border-rule")}>Decoded</ToggleGroupItem>
          </ToggleGroup>
        )}
        {web && parsed ? <span className="mr-auto" /> : (
          <label className="mr-auto ml-2.5 flex cursor-pointer items-center gap-[7px] text-body" title="Display only: copies stay exact">
            <Switch checked={wrap} onCheckedChange={(v) => { setWrap(v); save("colluder.wrap", v); }} aria-label="Wrap long lines" />
            <span className="text-smoke">Wrap long lines</span>
          </label>
        )}
        {web && curl && <Button variant="ghost" title="The request rebuilt as a curl command, for a repro" onClick={() => copy(curl, "curl command")}><Terminal />Copy as curl</Button>}
        <Button variant="ghost" onClick={() => copy(`${d.rawRequest}\n\n${d.rawResponse}`, "request and response")}><Copy />Copy both</Button>
        {d.protocol === "dns" && <Button variant="ghost" className="text-ash" onClick={() => { setDnsBytes(false); save("colluder.dnsBytes", false); }}>Fold</Button>}
      </div>

      <div className="grid min-h-[220px] flex-1 grid-cols-2 gap-3 @max-[900px]/detail:flex-none @max-[900px]/detail:grid-cols-1 @max-[900px]/detail:[&>*]:max-h-[360px]">
        <RawPane title={d.protocol === "dns" ? "Query" : "Request"} http={web} proto={d.protocol} p={reqP} tag={d.tag} domain={s.status?.payload?.domain} capture={capture}
          sub={web ? webSub(d.rawRequest, reqP, reqWho) : decoded ? "decoded view · copy stays exact" : `${capture === "edge" ? "as received by the edge" : "as logged by interactsh-client"} · ${size(d.rawRequest)}`}
          text={!web && decoded ? decode(d.rawRequest, d.protocol) : d.rawRequest} exact={d.rawRequest} />
        <RawPane title={d.protocol === "dns" ? "Answer" : "Response"} http={web} proto={d.protocol} p={resP} tag={d.tag} domain={s.status?.payload?.domain} capture={capture} clientHttp2={http2}
          sub={d.protocol === "dns" ? (capture === "edge" ? "sent by interactsh-server, relayed by the edge" : "sent by interactsh-server") : `${answeredBy(d.answer)} · ${web && parsed && !resP ? "couldn't parse · exact lines · " : ""}${byteCount(d.rawResponse)} bytes`}
          text={!web && decoded ? decode(d.rawResponse, d.protocol) : d.rawResponse} exact={d.rawResponse} />
      </div>

      <div aria-label="Custody record" className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 rounded-[3px] border border-rule bg-well px-3 py-1.5 text-label whitespace-nowrap max-[820px]:flex-col max-[820px]:items-start">
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
      </>
      )}
      </div>
      {!!peek && <Peek key={peek} />}
    </article>
  );
}

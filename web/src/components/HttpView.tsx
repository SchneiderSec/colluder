// HTTP requests and responses laid out for reading: start line, query, headers, body.
// Raw text is attacker-controlled: everything here is a React text node (escaped), never HTML.
// Display only: copies always come from the exact bytes.
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Copy } from "lucide-react";
import { copy } from "@/lib/toast";
import { isStandardHeader } from "@/lib/headers";
import { layoutJson } from "@/lib/jsonview";
import { decodedQuery, showControls } from "@/lib/query";
import { decodeExfil } from "@/lib/exfil";
import { dnsLine, dnsName, mailLine, type Seg, type SegKind } from "@/lib/dnsview";

export const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export type Parsed = {
  kind: "request" | "response";
  method?: string; target?: string; version: string;
  status?: string; reason?: string;
  headers: [string, string][];
  body: string;
};

const REQ = /^([A-Z][A-Z0-9_-]{0,19}) (\S+) (HTTP\/[\d.]+)$/;
const RES = /^(HTTP\/[\d.]+) (\d{3})(?: (.*))?$/;
const HDR = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*)$/;

export function parseHttp(raw: string): Parsed | null {
  const sep = /\r?\n\r?\n/.exec(raw);
  const head = (sep ? raw.slice(0, sep.index) : raw).split(/\r?\n/);
  const body = sep ? raw.slice(sep.index + sep[0].length) : "";
  const req = REQ.exec(head[0]);
  const res = req ? null : RES.exec(head[0]);
  if (!req && !res) return null;
  const headers: [string, string][] = [];
  for (const ln of head.slice(1)) {
    const m = HDR.exec(ln);
    if (!m) return null; // folded or malformed head: show it exactly instead
    headers.push([m[1], m[2]]);
  }
  return req
    ? { kind: "request", method: req[1], target: req[2], version: req[3], headers, body }
    : { kind: "response", version: res![1], status: res![2], reason: res![3] ?? "", headers, body };
}

// headers worth a second look, named in a word beside them (never colour alone)
const NOTE: Record<string, string> = {
  "x-forwarded-for": "forwarded for", "x-real-ip": "client IP", forwarded: "forwarded for", via: "via proxy",
  "true-client-ip": "client IP", "cf-connecting-ip": "client IP", "x-client-ip": "client IP", "x-originating-ip": "client IP",
  "x-forwarded-host": "original host", referer: "came from", origin: "came from",
  authorization: "credential", "proxy-authorization": "credential", cookie: "credential", "x-api-key": "credential",
  "x-auth-token": "credential", "x-amz-security-token": "credential", "x-csrf-token": "credential",
};

// the payload host reads as tag + short id, like the hits table; the tag is marked
function Host({ value, tag, domain }: { value: string; tag: string | null; domain?: string }) {
  // [code.][tag. or tag-]<id>.<domain>[:port]; the id is the engine's 33 chars or Colluder's short 6
  const m = domain ? new RegExp(`^(?:(.*)\\.)?(?:([a-z0-9][a-z0-9-]*)-)?([a-z][a-z0-9]{5}|[a-z0-9]{33})\\.(${domain.replace(/\./g, "\\.")})(:\\d+)?$`, "i").exec(value) : null;
  if (!m) return <>{value}</>;
  const labels = m[1] ? m[1].split(".") : [];
  const id = m[3].length > 12 ? `${m[3].slice(0, 8)}…` : m[3];
  return (
    <span title={value}>
      {labels.map((l, n) => <span key={n}>{l === tag ? <Tag>{l}</Tag> : l}.</span>)}
      {m[2] && <span>{m[2] === tag ? <Tag>{m[2]}</Tag> : m[2]}-</span>}
      <span className="text-smoke">{id}</span><span className="text-smoke">.{m[4]}{m[5] ?? ""}</span>
    </span>
  );
}
const Pill = ({ children, strong, title }: { children: ReactNode; strong?: boolean; title?: string }) => (
  <span title={title} className={cn("ml-2 inline-block rounded-[9px] border border-rule px-1.5 align-[1px] font-sans text-label leading-[0.9375rem] whitespace-nowrap", strong ? "text-bone" : "text-smoke")}>{children}</span>
);
// decoded text with control characters drawn as escapes in Ash, so nothing invisible slips by
const Visible = ({ text }: { text: string }) => <>{showControls(text).map(([k, t], n) => (k === "ctl" ? <span key={n} className="text-ash">{t}</span> : t))}</>;
// a value that looks encoded, decoded underneath it (display only)
function Exfil({ value }: { value: string }) {
  const d = decodeExfil(value);
  if (!d) return null;
  return <span className="block font-sans text-label text-ash">decodes as {d.kind} to <span className="font-mono text-body text-bone"><Visible text={d.text} /></span></span>;
}
const Tag = ({ children }: { children: ReactNode }) => <em className="bg-mark px-px text-bone not-italic">{children}</em>;

// a request target: path (tag marked when it is the first segment), then ? key = value & …
// short: the Query section below lists every value in full, so the start line keeps each one brief
const brief = (v: string) => (v.length > 32 ? v.slice(0, 32) + "…" : v);
export function Target({ target, tag, split, short }: { target: string; tag: string | null; split?: boolean; short?: boolean }) {
  const q = target.indexOf("?");
  const path = q < 0 ? target : target.slice(0, q);
  const query = q < 0 ? "" : target.slice(q + 1);
  const segs = path.split("/");
  const p = (
    <span>{segs.map((s, n) => <span key={n}>{n > 0 && "/"}{n === 1 && s === tag ? <Tag>{s}</Tag> : s}</span>)}</span>
  );
  if (!query || split) return p;
  return (
    <>{p}<span className="text-ash">?</span>{query.split("&").map((kv, n) => {
      const e = kv.indexOf("=");
      return <span key={n}>{n > 0 && <span className="text-ash">&amp;</span>}<span className="text-syn-name">{e < 0 ? kv : kv.slice(0, e)}</span>{e >= 0 && <><span className="text-ash">=</span><span className="text-syn-value" title={short && kv.length - e - 1 > 32 ? "In full under Query" : undefined}>{short ? brief(kv.slice(e + 1)) : kv.slice(e + 1)}</span></>}</span>;
    })}</>
  );
}

const statusInk = (s: string) => (s[0] === "2" ? "text-syn-value" : s[0] === "3" ? "text-syn-name" : s[0] === "4" || s[0] === "5" ? "text-bad" : "text-bone");

// a long value shows its first 600 characters and how much more there is (display only; copies are
// taken from the exact bytes, never from here)
const CLAMP = 600;
function Clamp({ text, children }: { text: string; children: (t: string) => ReactNode }) {
  const [all, setAll] = useState(false);
  if (text.length <= CLAMP || all) return <>{children(text)}</>;
  return <>{children(text.slice(0, CLAMP))}<button type="button" onClick={() => setAll(true)} className="ml-1 cursor-pointer font-sans text-label text-smoke underline decoration-ash underline-offset-2 hover:text-bone">+{(text.length - CLAMP).toLocaleString("en-US")} chars</button></>;
}

function Section({ title, meta, children }: { title?: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-rule-2 pt-2 pb-3 first:border-t-0 first:pt-0">
      {title && <h4 className="mb-1.5 flex items-baseline gap-2 font-sans text-label font-[650] tracking-[.03em] text-smoke">{title}{meta && <span className="font-normal tracking-normal text-ash">{meta}</span>}</h4>}
      {children}
    </section>
  );
}

// Name / value rows. Side by side unless the pane is very narrow (a phone). A row with a copy value
// gets a quiet Copy on hover or focus (always shown on touch screens), labelled with what it copies:
// one value, never the request, so the pane's exact-bytes Copy stays the evidence copy.
type Pair = [name: string, value: ReactNode | null, copy?: { text: string; decoded?: boolean }];
function Pairs({ rows, note }: { rows: Pair[]; note?: (name: string) => string | undefined }) {
  return (
    <dl className="m-0 grid grid-cols-[fit-content(18ch)_minmax(0,1fr)] gap-x-3 gap-y-[2px] @max-[310px]/pane:grid-cols-1 @max-[310px]/pane:gap-y-0">
      {rows.map(([k, v, c], n) => {
        const w = note?.(k);
        const what = `${k} value${c?.decoded ? ", decoded" : ""}`;
        return [
          <dt key={`k${n}`} className="min-w-0 text-syn-name [overflow-wrap:anywhere] @max-[310px]/pane:mt-1.5">{k}</dt>,
          <dd key={`v${n}`} className="group/pair m-0 min-w-0 [overflow-wrap:anywhere]">
            {v === "" || v === null ? <span className="font-sans text-ash">{v === null ? "no value" : "empty"}</span> : v}
            {w && <Pill strong={w === "credential"}>{w}</Pill>}
            {c && c.text !== "" && (
              <button type="button" aria-label={`Copy ${what}`} title={`Copy ${what}`} onClick={() => copy(c.text, what)}
                className="ml-1 inline-flex size-5 cursor-pointer items-center justify-center rounded-[3px] align-middle text-ash opacity-0 outline-none group-hover/pair:opacity-100 hover:bg-soot-2 hover:text-bone focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-smoke [@media(hover:none)]:opacity-100">
                <Copy className="size-3" />
              </button>
            )}
          </dd>,
        ];
      })}
    </dl>
  );
}

// JSON laid out token by token from the original text: nothing is re-encoded or merged
function JsonBody({ text }: { text: string }) {
  const segs = layoutJson(text);
  if (!segs) return null;
  return (
    <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {segs.map((g, n) => g.k === "ws" ? g.s
        : g.k === "key" ? <span key={n}><span className="text-syn-name">{g.s}</span>{g.dup && <Pill strong title="This key already appeared in the same object. Parsers disagree on which value wins.">duplicate key</Pill>}</span>
        : g.k === "str" ? <span key={n} className="text-syn-value">{g.s}</span>
        : g.k === "punct" ? <span key={n} className="text-ash">{g.s}</span>
        : <span key={n} className="font-[650] text-bone">{g.s}</span>)}
    </div>
  );
}

// markup bodies: tags quiet, text in bone
function MarkupBody({ text }: { text: string }) {
  const parts = text.split(/(<[^>]{0,2000}>)/);
  return <div className="whitespace-pre-wrap break-all">{parts.map((p, n) => (n % 2 ? <span key={n} className="text-ash">{p}</span> : p))}</div>;
}

function Body({ text, type }: { text: string; type: string }) {
  const t = type.toLowerCase();
  if (t.includes("x-www-form-urlencoded")) {
    return <Pairs rows={text.split("&").filter(Boolean).map((kv) => { const e = kv.indexOf("="); const dec = (s: string) => safeDecode(s.replace(/\+/g, " ")); return [dec(e < 0 ? kv : kv.slice(0, e)), e < 0 ? null : <span className="text-syn-value"><Visible text={dec(kv.slice(e + 1))} /></span>, e < 0 ? undefined : { text: dec(kv.slice(e + 1)), decoded: dec(kv.slice(e + 1)) !== kv.slice(e + 1) }] as Pair; })} />;
  }
  if (t.includes("json") || /^\s*[[{]/.test(text)) { const j = JsonBody({ text }); if (j) return j; }
  if (/html|xml|svg/.test(t) || /^\s*</.test(text)) return <MarkupBody text={text} />;
  return <div className="whitespace-pre-wrap break-all">{text}</div>;
}

// capture: who wrote these bytes. interactsh re-serialises requests (headers sorted after Host, names
// normalised); the edge records them exactly as they came off the socket.
function useStdHeaders(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem("colluder.stdHeaders") ?? "false"); } catch { return false; } });
  return [v, (n) => { setV(n); try { localStorage.setItem("colluder.stdHeaders", JSON.stringify(n)); } catch { /* private mode */ } }];
}

export function HttpParsed({ p, tag, domain, capture, clientHttp2 }: { p: Parsed; tag: string | null; domain?: string; capture: "edge" | "engine"; clientHttp2?: boolean }) {
  const find = (n: string) => p.headers.find(([k]) => k.toLowerCase() === n)?.[1] ?? "";
  const type = find("content-type");
  const q = p.target?.includes("?") ? decodedQuery(p.target.slice(p.target.indexOf("?") + 1)) : [];
  const order = p.kind === "response" ? "as sent" : capture === "edge" ? "in the order received" : "as logged by interactsh: sorted, names normalised";
  const bodyBytes = new TextEncoder().encode(p.body).length;
  // the headers every browser sends fold behind one line (remembered), so Host, User-Agent and anything
  // unusual lead; a header the view flags never folds
  const [std, setStd] = useStdHeaders();
  const boiler = p.kind === "request" ? p.headers.filter(([k]) => isStandardHeader(k) && !NOTE[k.toLowerCase()]) : [];
  const folding = boiler.length >= 3;
  const shownHeaders = folding && !std ? p.headers.filter((h) => !boiler.includes(h)) : p.headers;
  return (
    <div className="font-mono text-body leading-[1.125rem] text-bone">
      <Section>
        {p.kind === "request" ? (
          <div className="[overflow-wrap:anywhere]"><b className="mr-[1ch] font-[650]">{p.method}</b><Target target={p.target!} tag={tag} short={q.length > 0} /><span className="ml-[1ch] text-ash">{p.version}</span></div>
        ) : (
          <>
            <div><span className="mr-[1ch] text-ash">{p.version}</span><b className={cn("mr-[1ch] font-[650]", statusInk(p.status!))}>{p.status}</b>{p.reason}</div>
            {clientHttp2 && capture === "engine" && <p className="mt-1 font-sans text-label text-ash">interactsh's rendering of its reply; the client spoke HTTP/2.</p>}
          </>
        )}
      </Section>
      {q.length > 0 && (
        <Section title="Query" meta={`${q.length} ${q.length === 1 ? "parameter" : "parameters"}, decoded`}>
          <Pairs rows={q.map((x) => [x.name, x.value === null ? null : (
            <span><span className="text-syn-value"><Clamp text={x.value}>{(t) => <Visible text={t} />}</Clamp></span>{x.changed && <Pill title={`As sent: ${x.raw}`}>decoded</Pill>}<Exfil value={x.value} /></span>
          ), x.value === null ? undefined : { text: x.value, decoded: x.changed }] as Pair)} />
        </Section>
      )}
      <Section title="Headers" meta={`${p.headers.length}, ${order}`}>
        <Pairs note={(k) => NOTE[k.toLowerCase()]} rows={shownHeaders.map(([k, v]) => [k, k.toLowerCase() === "host" ? <Host value={v} tag={tag} domain={domain} /> : v === "" ? "" : <Clamp text={v}>{(t) => t}</Clamp>, { text: v }] as Pair)} />
        {folding && (
          <button type="button" onClick={() => setStd(!std)} title={std ? undefined : boiler.map(([k]) => k).join(", ")}
            className="mt-1 flex cursor-pointer items-center gap-1 font-sans text-label text-smoke hover:text-bone">
            <ChevronRight className={cn("size-3 transition-transform", std && "rotate-90")} />{std ? "Fold" : `+${boiler.length}`} standard browser headers
          </button>
        )}
      </Section>
      {(p.body || bodyBytes > 0) && (
        <Section title="Body" meta={[type.split(";")[0], `${bodyBytes} bytes`].filter(Boolean).join(" · ")}>
          <Body text={p.body} type={type} />
        </Section>
      )}
    </div>
  );
}

// one line of the exact view, tinted without changing a character
// DNS and mail lines, tinted like the HTTP view (lib/dnsview.ts splits them; the segments join back to
// the line exactly). Section headings in Smoke, comments and keys in Ash, names in Bone with the tag
// marked, record types and mail field names in the name ink, answer data in the value ink.
const SEG: Record<SegKind, string> = {
  plain: "", ash: "text-ash", head: "font-[650] text-smoke", name: "text-bone", tag: "", type: "font-[650] text-syn-name",
  value: "text-syn-value", ok: "text-syn-value", bad: "text-bad", field: "text-syn-name",
};
function Segs({ segs }: { segs: Seg[] }) {
  if (segs.length === 1 && segs[0].k === "plain") return <>{segs[0].s || "\u200b"}</>;
  return <>{segs.map((g, n) => (g.k === "tag" ? <Tag key={n}>{g.s}</Tag> : <span key={n} className={SEG[g.k] || undefined}>{g.s}</span>))}</>;
}
export const DnsNameMarked = ({ name, tag }: { name: string; tag: string | null }) => <Segs segs={dnsName(name, tag)} />;
export const DnsLine = ({ ln, tag }: { ln: string; tag: string | null }) => <Segs segs={dnsLine(ln, tag)} />;
export const MailLine = ({ ln, inHead }: { ln: string; inHead: boolean }) => <Segs segs={mailLine(ln, inHead)} />;

export function ExactLine({ ln, idx, inHead, tag }: { ln: string; idx: number; inHead: boolean; tag: string | null }) {
  if (idx === 0) {
    const r = REQ.exec(ln);
    if (r) return <><b className="font-[650]">{r[1]}</b> <Target target={r[2]} tag={tag} /> <span className="text-ash">{r[3]}</span></>;
    const s = RES.exec(ln);
    if (s) return <><span className="text-ash">{s[1]}</span> <b className={cn("font-[650]", statusInk(s[2]))}>{s[2]}</b>{s[3] !== undefined && ` ${s[3]}`}</>;
  }
  const m = inHead && idx > 0 ? /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)(:)(.*)$/.exec(ln) : null;
  if (m) return <><span className="text-syn-name">{m[1]}</span><span className="text-ash">{m[2]}</span>{m[3]}</>;
  return <>{ln || "​"}</>;
}

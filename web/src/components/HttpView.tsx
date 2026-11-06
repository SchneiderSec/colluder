// HTTP requests and responses laid out for reading: start line, query, headers, body.
// Raw text is attacker-controlled: everything here is a React text node (escaped), never HTML.
// Display only: copies always come from the exact bytes.
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { layoutJson } from "@/lib/jsonview";
import { decodedQuery, showControls } from "@/lib/query";
import { decodeExfil } from "@/lib/exfil";

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
  const m = domain ? new RegExp(`^(?:(.*)\\.)?([a-z0-9]{33})\\.(${domain.replace(/\./g, "\\.")})(:\\d+)?$`, "i").exec(value) : null;
  if (!m) return <>{value}</>;
  const labels = m[1] ? m[1].split(".") : [];
  return (
    <span title={value}>
      {labels.map((l, n) => <span key={n}>{l === tag ? <Tag>{l}</Tag> : l}.</span>)}
      <span className="text-smoke">{m[2].slice(0, 8)}…</span><span className="text-smoke">.{m[3]}{m[4] ?? ""}</span>
    </span>
  );
}
const Pill = ({ children, strong, title }: { children: ReactNode; strong?: boolean; title?: string }) => (
  <span title={title} className={cn("ml-2 inline-block rounded-[9px] border border-rule px-1.5 align-[1px] font-sans text-[11px] leading-[15px] whitespace-nowrap", strong ? "text-bone" : "text-smoke")}>{children}</span>
);
// decoded text with control characters drawn as escapes in Ash, so nothing invisible slips by
const Visible = ({ text }: { text: string }) => <>{showControls(text).map(([k, t], n) => (k === "ctl" ? <span key={n} className="text-ash">{t}</span> : t))}</>;
// a value that looks encoded, decoded underneath it (display only)
function Exfil({ value }: { value: string }) {
  const d = decodeExfil(value);
  if (!d) return null;
  return <span className="block font-sans text-[11px] text-ash">decodes as {d.kind} to <span className="font-mono text-[12.5px] text-bone"><Visible text={d.text} /></span></span>;
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
  return <>{children(text.slice(0, CLAMP))}<button type="button" onClick={() => setAll(true)} className="ml-1 cursor-pointer font-sans text-[11px] text-smoke underline decoration-ash underline-offset-2 hover:text-bone">+{(text.length - CLAMP).toLocaleString("en-US")} chars</button></>;
}

function Section({ title, meta, children }: { title?: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-rule-2 pt-2 pb-3 first:border-t-0 first:pt-0">
      {title && <h4 className="mb-1.5 flex items-baseline gap-2 font-sans text-[11px] font-[650] tracking-[.03em] text-smoke">{title}{meta && <span className="font-normal tracking-normal text-ash">{meta}</span>}</h4>}
      {children}
    </section>
  );
}

function Pairs({ rows, note }: { rows: [string, ReactNode | null][]; note?: (name: string) => string | undefined }) {
  return (
    <dl className="m-0 grid grid-cols-[fit-content(24ch)_minmax(0,1fr)] gap-x-4 gap-y-[3px] @max-[440px]/pane:grid-cols-1 @max-[440px]/pane:gap-y-0">
      {rows.map(([k, v], n) => {
        const w = note?.(k);
        return [
          <dt key={`k${n}`} className="min-w-0 text-syn-name [overflow-wrap:anywhere] @max-[440px]/pane:mt-1.5">{k}</dt>,
          <dd key={`v${n}`} className="m-0 min-w-0 [overflow-wrap:anywhere]">
            {v === "" || v === null ? <span className="font-sans text-ash">{v === null ? "no value" : "empty"}</span> : v}
            {w && <Pill strong={w === "credential"}>{w}</Pill>}
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
    return <Pairs rows={text.split("&").filter(Boolean).map((kv) => { const e = kv.indexOf("="); const dec = (s: string) => safeDecode(s.replace(/\+/g, " ")); return [dec(e < 0 ? kv : kv.slice(0, e)), e < 0 ? null : <span className="text-syn-value"><Visible text={dec(kv.slice(e + 1))} /></span>]; })} />;
  }
  if (t.includes("json") || /^\s*[[{]/.test(text)) { const j = JsonBody({ text }); if (j) return j; }
  if (/html|xml|svg/.test(t) || /^\s*</.test(text)) return <MarkupBody text={text} />;
  return <div className="whitespace-pre-wrap break-all">{text}</div>;
}

// capture: who wrote these bytes. interactsh re-serialises requests (headers sorted after Host, names
// normalised); the edge records them exactly as they came off the socket.
export function HttpParsed({ p, tag, domain, capture, clientHttp2 }: { p: Parsed; tag: string | null; domain?: string; capture: "edge" | "engine"; clientHttp2?: boolean }) {
  const find = (n: string) => p.headers.find(([k]) => k.toLowerCase() === n)?.[1] ?? "";
  const type = find("content-type");
  const q = p.target?.includes("?") ? decodedQuery(p.target.slice(p.target.indexOf("?") + 1)) : [];
  const order = p.kind === "response" ? "as sent" : capture === "edge" ? "in the order received" : "as logged by interactsh: sorted, names normalised";
  const bodyBytes = new TextEncoder().encode(p.body).length;
  return (
    <div className="font-mono text-[12.5px] leading-[18px] text-bone">
      <Section>
        {p.kind === "request" ? (
          <div className="[overflow-wrap:anywhere]"><b className="mr-[1ch] font-[650]">{p.method}</b><Target target={p.target!} tag={tag} short={q.length > 0} /><span className="ml-[1ch] text-ash">{p.version}</span></div>
        ) : (
          <>
            <div><span className="mr-[1ch] text-ash">{p.version}</span><b className={cn("mr-[1ch] font-[650]", statusInk(p.status!))}>{p.status}</b>{p.reason}</div>
            {clientHttp2 && capture === "engine" && <p className="mt-1 font-sans text-[11px] text-ash">interactsh's rendering of its reply; the client spoke HTTP/2.</p>}
          </>
        )}
      </Section>
      {q.length > 0 && (
        <Section title="Query" meta={`${q.length} ${q.length === 1 ? "parameter" : "parameters"}, decoded`}>
          <Pairs rows={q.map((x) => [x.name, x.value === null ? null : (
            <span><span className="text-syn-value"><Clamp text={x.value}>{(t) => <Visible text={t} />}</Clamp></span>{x.changed && <Pill title={`As sent: ${x.raw}`}>decoded</Pill>}<Exfil value={x.value} /></span>
          )])} />
        </Section>
      )}
      <Section title="Headers" meta={`${p.headers.length}, ${order}`}>
        <Pairs note={(k) => NOTE[k.toLowerCase()]} rows={p.headers.map(([k, v]) => [k, k.toLowerCase() === "host" ? <Host value={v} tag={tag} domain={domain} /> : v === "" ? "" : <Clamp text={v}>{(t) => t}</Clamp>])} />
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

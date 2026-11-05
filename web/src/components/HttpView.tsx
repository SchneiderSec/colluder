// HTTP requests and responses laid out for reading: start line, query, headers, body.
// Raw text is attacker-controlled: everything here is a React text node (escaped), never HTML.
// Display only: copies always come from the exact bytes.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

type Parsed = {
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
const Tag = ({ children }: { children: ReactNode }) => <em className="bg-[#3a2f22] px-px text-bone not-italic">{children}</em>;

// a request target: path (tag marked when it is the first segment), then ? key = value & …
export function Target({ target, tag, split }: { target: string; tag: string | null; split?: boolean }) {
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
      return <span key={n}>{n > 0 && <span className="text-ash">&amp;</span>}<span className="text-syn-name">{e < 0 ? kv : kv.slice(0, e)}</span>{e >= 0 && <><span className="text-ash">=</span><span className="text-syn-value">{kv.slice(e + 1)}</span></>}</span>;
    })}</>
  );
}

const statusInk = (s: string) => (s[0] === "2" ? "text-syn-value" : s[0] === "3" ? "text-syn-name" : s[0] === "4" || s[0] === "5" ? "text-bad" : "text-bone");

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
            {w && <span className={cn("ml-2 inline-block rounded-[9px] border border-rule px-1.5 align-[1px] font-sans text-[11px] leading-[15px] whitespace-nowrap", w === "credential" ? "text-bone" : "text-smoke")}>{w}</span>}
          </dd>,
        ];
      })}
    </dl>
  );
}

// JSON, highlighted by token; anything that isn't valid JSON comes back null
function JsonBody({ text }: { text: string }) {
  let pretty: string;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { return null; }
  const out: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)|([{}[\],])/g;
  let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(pretty))) {
    if (m.index > last) out.push(pretty.slice(last, m.index));
    if (m[1]) out.push(m[2] ? <span key={n++}><span className="text-syn-name">{m[1]}</span><span className="text-ash">{m[2]}</span></span> : <span key={n++} className="text-syn-value">{m[1]}</span>);
    else if (m[3]) out.push(<span key={n++} className="font-[650] text-bone">{m[3]}</span>);
    else out.push(<span key={n++} className="text-ash">{m[4]}</span>);
    last = re.lastIndex;
  }
  out.push(pretty.slice(last));
  return <div className="whitespace-pre-wrap break-all">{out}</div>;
}

// markup bodies: tags quiet, text in bone
function MarkupBody({ text }: { text: string }) {
  const parts = text.split(/(<[^>]{0,2000}>)/);
  return <div className="whitespace-pre-wrap break-all">{parts.map((p, n) => (n % 2 ? <span key={n} className="text-ash">{p}</span> : p))}</div>;
}

function Body({ text, type }: { text: string; type: string }) {
  const t = type.toLowerCase();
  if (t.includes("x-www-form-urlencoded")) {
    return <Pairs rows={text.split("&").filter(Boolean).map((kv) => { const e = kv.indexOf("="); const dec = (s: string) => safeDecode(s.replace(/\+/g, " ")); return [dec(e < 0 ? kv : kv.slice(0, e)), e < 0 ? null : <span className="text-syn-value">{dec(kv.slice(e + 1))}</span>]; })} />;
  }
  if (t.includes("json") || /^\s*[[{]/.test(text)) { const j = JsonBody({ text }); if (j) return j; }
  if (/html|xml|svg/.test(t) || /^\s*</.test(text)) return <MarkupBody text={text} />;
  return <div className="whitespace-pre-wrap break-all">{text}</div>;
}

export function HttpParsed({ p, tag, domain }: { p: Parsed; tag: string | null; domain?: string }) {
  const find = (n: string) => p.headers.find(([k]) => k.toLowerCase() === n)?.[1] ?? "";
  const type = find("content-type");
  const q = p.target?.includes("?") ? p.target.slice(p.target.indexOf("?") + 1).split("&").filter(Boolean) : [];
  const bodyBytes = new TextEncoder().encode(p.body).length;
  return (
    <div className="font-mono text-[12.5px] leading-[18px] text-bone">
      <Section>
        {p.kind === "request" ? (
          <div className="break-all"><b className="mr-[1ch] font-[650]">{p.method}</b><Target target={p.target!} tag={tag} split /><span className="ml-[1ch] text-ash">{p.version}</span></div>
        ) : (
          <div><span className="mr-[1ch] text-ash">{p.version}</span><b className={cn("mr-[1ch] font-[650]", statusInk(p.status!))}>{p.status}</b>{p.reason}</div>
        )}
      </Section>
      {q.length > 0 && (
        <Section title="Query" meta={`${q.length} ${q.length === 1 ? "parameter" : "parameters"}, decoded`}>
          <Pairs rows={q.map((kv) => { const e = kv.indexOf("="); return [safeDecode(e < 0 ? kv : kv.slice(0, e)), e < 0 ? null : <span className="text-syn-value">{safeDecode(kv.slice(e + 1))}</span>]; })} />
        </Section>
      )}
      <Section title="Headers" meta={`${p.headers.length}, in the order received`}>
        <Pairs note={(k) => NOTE[k.toLowerCase()]} rows={p.headers.map(([k, v]) => [k, k.toLowerCase() === "host" ? <Host value={v} tag={tag} domain={domain} /> : v])} />
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

// The mailbox (PLAN-MAILBOX.md): mail to <anyone>@mailbox-<short>.<domain>, kept apart from hits.
// No alerts, no probe, kept a few days. The local part names the account a message was sent for; the
// one-time code and the magic link found in it are what you came for, so they come first.
// Everything in a message was written by its sender: it is shown as text only, links are never live.
import { useEffect, useMemo, useState } from "react";
import { Copy, Download } from "lucide-react";
import { api, fetchMail, onMail, save, useApp } from "@/store";
import type { MailDetail, MailRow } from "@/lib/types";
import { ago, dayOrTime, isoMs, plural } from "@/lib/format";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LineForm, useTick } from "./bits";
import { CrewMark } from "./Mark";
import { aKind, crew, STRAY_LOOK } from "@/lib/crew";
import { cn } from "@/lib/utils";
import { MailLine } from "./HttpView";

const seg = "h-[26px] rounded-none border-l border-rule px-[11px] text-body text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone";
const MAX_SHOWN = 200_000;

// headers and the exact message, with field names tinted like the hit detail (display only: Copy and
// the download give the text as stored)
function MailText({ text, allHead }: { text: string; allHead: boolean }) {
  let head = true;
  return <>{text.split(/\r?\n/).map((ln, n) => {
    const inHead = allHead || head;
    if (!allHead && head && ln === "") head = false;
    return <span key={n}>{n > 0 && "\n"}<MailLine ln={ln} inHead={inHead} /></span>;
  })}</>;
}
type View = "text" | "html" | "headers" | "raw";

function readSeen() { try { return Number(localStorage.getItem("colluder.mailSeen") || 0) || 0; } catch { return 0; } }

export function Mailbox({ arg }: { arg: string | null }) {
  const st = useApp((s) => s.status);
  const mb = st?.mailbox;
  useTick(15000);
  const [rows, setRows] = useState<MailRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [seenAtOpen] = useState(readSeen);

  useEffect(() => { fetchMail().then((r) => setRows(r.messages)).catch((e) => { toast(`Couldn't load the mailbox: ${e.message}`, true); setRows([]); }); }, []);
  useEffect(() => onMail((e) => setRows((r) => {
    const list = r ?? [];
    return e.type === "mail" ? [e.row, ...list.filter((x) => x.id !== e.row.id)] : list.filter((x) => x.id !== e.id);
  })), []);
  // opening the page reads what's here; rows newer than the last visit keep their dot until you leave
  useEffect(() => { if (rows?.length) save("colluder.mailSeen", Math.max(readSeen(), ...rows.map((r) => r.id))); }, [rows]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (rows ?? []).filter((r) => !f || r.localPart.includes(f) || (r.subject ?? "").toLowerCase().includes(f) || (r.mailFrom ?? "").toLowerCase().includes(f));
  }, [rows, filter]);
  // each address is a member of the crew: its coat comes from its local part (first one here picks first)
  const coats = useMemo(() => {
    const first = new Map<string, string>();
    for (const r of rows ?? []) if (!first.has(r.localPart) || r.receivedAt < first.get(r.localPart)!) first.set(r.localPart, r.receivedAt);
    return crew([...first].map(([tag, plantedAt]) => ({ tag, plantedAt })));
  }, [rows]);
  const sel = arg && /^\d+$/.test(arg) ? Number(arg) : shown[0]?.id ?? null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] max-[1180px]:grid-cols-[320px_minmax(0,1fr)] max-[820px]:block">
      <header className="col-span-full border-b border-rule px-8 py-4 max-[820px]:px-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="text-headline font-bold">Mailbox</h1>
          {mb && (
            <span className="flex min-w-0 items-center gap-1.5">
              <code className="min-w-0 truncate font-mono text-title text-bone"><span className="text-ash">anyone</span>@{mb.host}</code>
              <Button variant="ghost" size="icon-sm" aria-label="Copy the mailbox address" onClick={() => copy(`orca-attacker@${mb.host}`, "Address (orca-attacker@…)")}><Copy /></Button>
            </span>
          )}
          <label className="ml-auto flex h-[30px] w-[240px] items-center gap-2 rounded-[3px] border border-rule bg-well px-2.5 text-body text-smoke focus-within:border-smoke max-[820px]:ml-0 max-[820px]:w-full">
            Find
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="local part, subject, sender" className="min-w-0 flex-1 bg-transparent font-mono text-bone caret-amber outline-none placeholder:font-sans placeholder:text-ash" />
          </label>
        </div>
        {mb && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-body text-smoke"
            title={[mb.live && `Receiving on ${mb.smtp!.join(", ")}`, mb.hosts.length > 1 && `Also @${mb.hosts.filter((h) => h !== mb.host).join(", @")}`,
              mb.lastLookup && `Last looked up ${ago(Date.now() - isoMs(mb.lastLookup.at))} (${mb.lastLookup.protocol.toUpperCase()})`].filter(Boolean).join("\n") || undefined}>
            <LineForm kind={mb.live ? "live" : "down"} signal="sparse" className={mb.live ? "text-bone" : "text-bad"} />
            {mb.live
              ? <span>Receiving</span>
              : <span className="text-bad">Not receiving yet: mail for this box still goes to interactsh. The operator runs <code className="font-mono text-bone">sudo ~/tools/colluder/deploy/smtp-front.sh</code></span>}
            <span className="text-ash">· {plural(mb.count, "message")}, kept {plural(mb.retentionDays, "day")}</span>
          </p>
        )}
      </header>

      <section aria-label="Messages" className="min-h-0 overflow-auto border-r border-rule max-[820px]:max-h-[48vh] max-[820px]:border-r-0 max-[820px]:border-b">
        {rows === null ? <p className="px-5 py-4 text-body text-ash">Loading…</p>
          : !shown.length ? <Empty filtered={!!filter.trim() && !!rows.length} host={mb?.host} />
          : (
            <ul>
              {shown.map((r) => (
                <li key={r.id}>
                  <a href={`#mailbox/${r.id}`} aria-current={r.id === sel ? "true" : undefined}
                    className={cn("grid grid-cols-[30px_minmax(0,1fr)_auto] items-start gap-x-2.5 border-b border-rule px-4 py-[11px] no-underline hover:bg-soot-1", r.id === sel && "bg-soot-2 hover:bg-soot-2")}>
                    <span className="pt-px" title={[`${r.localPart}: ${aKind((coats.get(r.localPart) ?? STRAY_LOOK).species)}`, r.id > seenAtOpen && "Arrived since your last visit"].filter(Boolean).join(" · ")}><CrewMark size={30} {...(coats.get(r.localPart) ?? STRAY_LOOK)} unread={r.id > seenAtOpen} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-title font-[650] text-bone">{r.localPart}</span>
                      <span className="block truncate text-body text-bone">{r.subject || <span className="text-ash">(no subject)</span>}</span>
                      <span className="block truncate text-label text-smoke">{r.from || r.mailFrom || "<>"}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1 text-label whitespace-nowrap text-smoke">
                      <time dateTime={r.receivedAt} title={r.receivedAt}>{dayOrTime(r.receivedAt)}</time>
                      {r.code && <code className="rounded-[3px] border border-rule px-1.5 font-mono text-body text-bone">{r.code}</code>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section aria-label="Message" className="min-h-0 overflow-auto">
        {sel !== null ? <Message key={sel} id={sel} /> : null}
      </section>
    </div>
  );
}

function Empty({ filtered, host }: { filtered: boolean; host?: string }) {
  if (filtered) return <p className="px-5 py-4 text-body text-ash">Nothing matches.</p>;
  return (
    <div className="px-5 py-4 text-body leading-[1.1875rem] text-smoke">
      <p className="text-title font-[650] text-bone">No mail yet</p>
      <p className="mt-1.5 max-w-[46ch]">Sign a test account up with an address here{host ? <> like <code className="font-mono text-bone">orca-attacker@{host}</code></> : ""}. Its mail lands in this list: no alert, no probe. Claude reads it with <code className="font-mono text-bone">wait_for_mail</code>.</p>
    </div>
  );
}

function Message({ id }: { id: number }) {
  const [m, setM] = useState<MailDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>("text");
  const [raw, setRaw] = useState<string | null>(null);
  useEffect(() => { api<MailDetail>(`/api/mail/${id}`).then(setM).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => {
    if (view !== "raw" || raw !== null) return;
    fetch(`/api/mail/${id}/raw`).then((r) => r.arrayBuffer()).then((b) => setRaw(new TextDecoder().decode(b))).catch((e) => setRaw(`Couldn't load it: ${e.message}`));
  }, [view, id, raw]);
  if (err) return <p className="px-6 py-5 text-body text-bad">{err}</p>;
  if (!m) return <p className="px-6 py-5 text-body text-ash">Loading…</p>;

  const otherCodes = m.codes.filter((c) => c.value !== m.code && c.score > 0).slice(0, 4);
  const otherLinks = m.links.filter((l) => l.url !== m.link && l.score > 0).slice(0, 6);
  const body = view === "text" ? m.text ?? "" : view === "html" ? m.html ?? "" : view === "headers" ? m.headers.map(([n, v]) => `${n}: ${v}`).join("\n") : raw ?? "Loading…";
  const absent = (view === "text" && !m.text) || (view === "html" && !m.html);

  return (
    <article className="px-6 py-5 max-[820px]:px-4">
      <header>
        <h2 className="text-title font-[650] break-words text-bone">{m.subject || <span className="text-ash">(no subject)</span>}</h2>
        <dl className="mt-2 grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-1 text-body">
          <dt className="text-smoke">To</dt><dd className="min-w-0 font-mono break-all text-bone">{m.rcpt}</dd>
          <dt className="text-smoke">From</dt><dd className="min-w-0 break-words text-bone" title={m.mailFrom !== null ? `Envelope sender (MAIL FROM): ${m.mailFrom || "<>"}` : undefined}>{m.from || <span className="text-ash">none</span>}</dd>
          <dt className="text-smoke">Received</dt><dd className="text-bone"><time dateTime={m.receivedAt}>{m.receivedAt.replace("T", " ").slice(0, 19)} UTC</time>
            <span className="text-ash"> · from <span className="font-mono">{m.remoteAddress}</span>{m.helo ? <> (<span className="font-mono">{m.helo}</span>)</> : null} · {m.tls ? m.tls : "no TLS"} · {plural(m.size, "byte")}</span></dd>
          {m.attachments.length > 0 && <><dt className="text-smoke">Attached</dt><dd className="text-bone">{m.attachments.map((a) => `${a.filename ?? "unnamed"} (${a.contentType}, ${plural(a.size, "byte")})`).join(" · ")}</dd></>}
        </dl>
      </header>

      <div className="mt-4 grid grid-cols-[88px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-y border-rule-2 py-3.5 text-body">
        <span className="pt-1 text-smoke">Code</span>
        <div className="min-w-0">
          {m.code ? (
            <div className="flex flex-wrap items-center gap-3">
              <code className="font-mono text-headline font-[650] tracking-[.06em] text-bone">{m.code}</code>
              <Button onClick={() => copy(m.code!, "Code")}><Copy />Copy code</Button>
            </div>
          ) : <p className="pt-1 text-ash">None found.{m.codes.length ? " Numbers in it, none next to words like code or verification:" : ""}</p>}
          {(otherCodes.length > 0 || (!m.code && m.codes.length > 0)) && (
            <ul className="mt-1.5 space-y-0.5 text-label text-ash">
              {(m.code ? otherCodes : m.codes.slice(0, 4)).map((c) => (
                <li key={c.value} className="flex items-center gap-1.5"><code className="font-mono text-body text-smoke">{c.value}</code><span className="truncate">{c.context}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Copy ${c.value}`} onClick={() => copy(c.value, "Number")}><Copy /></Button></li>
              ))}
            </ul>
          )}
        </div>
        <span className="pt-0.5 text-smoke">Link</span>
        <div className="min-w-0">
          {m.link ? (
            <div className="flex items-start gap-1.5">
              <code className="min-w-0 font-mono break-all text-bone">{m.link}</code>
              <Button variant="ghost" size="icon-sm" aria-label="Copy the link" onClick={() => copy(m.link!, "Link")}><Copy /></Button>
            </div>
          ) : <p className="pt-0.5 text-ash">None that looks like a sign-in or confirmation link.</p>}
          {otherLinks.length > 0 && (
            <details className="mt-1.5 text-label text-ash">
              <summary className="cursor-pointer text-smoke hover:text-bone">{plural(otherLinks.length, "other link")}</summary>
              <ul className="mt-1 space-y-0.5">
                {otherLinks.map((l) => (
                  <li key={l.url} className="flex items-start gap-1.5"><code className="min-w-0 font-mono break-all text-smoke">{l.url}</code>{l.label && <span className="flex-none text-ash">“{l.label}”</span>}
                    <Button variant="ghost" size="icon-sm" aria-label="Copy this link" onClick={() => copy(l.url, "Link")}><Copy /></Button></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as View)} aria-label="Show" title="Shown as text; links aren't live" className="overflow-hidden rounded-[3px] border border-rule">
          {([["text", "Text"], ["html", "HTML source"], ["headers", "Headers"], ["raw", "Exact bytes"]] as [View, string][]).map(([v, l]) => <ToggleGroupItem key={v} value={v} className={seg}>{l}</ToggleGroupItem>)}
        </ToggleGroup>
        <span className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => copy(body, view === "raw" ? "Message" : "Text")}><Copy />Copy</Button>
          <Button variant="quiet" size="sm" asChild><a href={`/api/mail/${id}/raw`} download><Download />.eml</a></Button>
        </span>
      </div>
      <pre className="mt-2 max-h-[60vh] overflow-auto rounded-[3px] border border-rule-2 bg-well p-3 font-mono text-body leading-[18px] break-words whitespace-pre-wrap text-bone">
        {absent ? <span className="font-sans text-ash">{view === "text" ? "No text part; the HTML source has it." : "No HTML part."}</span>
          : view === "headers" || view === "raw" ? <MailText text={body.length > MAX_SHOWN ? body.slice(0, MAX_SHOWN) : body} allHead={view === "headers"} />
          : body.length > MAX_SHOWN ? body.slice(0, MAX_SHOWN) : body}
        {!absent && body.length > MAX_SHOWN && <span className="font-sans text-ash">{`\n… ${body.length - MAX_SHOWN} more characters not shown. Copy gives everything.`}</span>}
      </pre>
    </article>
  );
}

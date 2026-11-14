// The mailbox: mail to <anyone>@mailbox-<short>.<domain>, kept apart from hits. It reads like a mail
// client: who sent it and what it says lead each row; the address it came to (the account it was sent
// for, one of the crew) is the third line. The ten newest are Recent; older mail is the Archive, by day.
// No alerts, no probe, kept a few days. Everything in a message was written by its sender: it is shown
// as text only, links are never live.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Download, Trash2, X } from "lucide-react";
import { api, deleteMail, fetchMail, onMail, save, useApp } from "@/store";
import type { MailDetail, MailRow } from "@/lib/types";
import { ago, dayOrTime, hm, isoMs, plural, setupCmd } from "@/lib/format";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LineForm, useTick } from "./bits";
import { CrewMark, MarkSvg } from "./Mark";
import { aKind, crew, STRAY_LOOK } from "@/lib/crew";
import { cn } from "@/lib/utils";
import { MailLine } from "./HttpView";

const seg = "h-[26px] rounded-none border-l border-rule px-[11px] text-body text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone";
const sectionLabel = "flex min-w-0 items-center gap-1.5 border-b border-rule px-4 pt-3 pb-1.5 text-left text-label font-semibold tracking-[.02em] text-smoke";
const MAX_SHOWN = 200_000;
const RECENT = 10;
const ALL = "*";

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
type View = "message" | "html" | "headers" | "raw";

function readSeen() { try { return Number(localStorage.getItem("colluder.mailSeen") || 0) || 0; } catch { return 0; } }
function readFlag(k: string) { try { return localStorage.getItem(k) === "true"; } catch { return false; } }

// "Acme Inc <notifications@acme.example>" -> name and address; a bare address is both
function sender(from: string | null): { name: string; addr: string } {
  const f = (from ?? "").trim();
  const m = /^\s*"?(.*?)"?\s*<([^>]*)>\s*$/.exec(f);
  if (m) return { name: m[1].trim() || m[2], addr: m[2] };
  return { name: f, addr: f };
}

// the organisation a message is from: the registrable part of its sender's domain
// (portal.acme.example -> acme.example; a.b.co.uk keeps three labels)
function orgOf(r: { from: string | null; mailFrom: string | null }): string {
  const a = sender(r.from || r.mailFrom).addr.toLowerCase();
  const d = a.includes("@") ? a.slice(a.lastIndexOf("@") + 1) : "";
  const l = d.split(".").filter(Boolean);
  if (l.length < 2) return d || "unknown sender";
  const n = /^(co|com|net|org|gov|ac|edu)$/.test(l.at(-2)!) && l.at(-1)!.length === 2 ? 3 : 2;
  return l.slice(-n).join(".");
}
const SELF_ORGS = new Set(["colluder.invalid", "example.invalid"]);   // Colluder's own setup checks
const ORG_HUES = [25, 145, 185, 220, 255, 290, 330, 105];
function orgHue(org: string) { let h = 2166136261; for (const c of org) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ORG_HUES[(h >>> 0) % ORG_HUES.length]; }

// an organisation's sign: its initial on a tile in its hue, drawn here (a sender's logo would be a
// request to the target). Colluder's own check mail wears the Colluder mark.
function OrgMark({ org, size = 28 }: { org: string; size?: number }) {
  if (SELF_ORGS.has(org)) return <span className="inline-flex flex-none" title="Sent by Colluder's own check"><MarkSvg size={size} /></span>;
  const letter = (org.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
  return (
    <span aria-hidden className="org-mark inline-flex flex-none items-center justify-center rounded-[6px] font-[650]"
      style={{ width: size, height: size, fontSize: size >= 34 ? 17 : size >= 26 ? 13.5 : 11, ["--org-h" as string]: orgHue(org) }}>{letter}</span>
  );
}

// the day a message arrived, as the archive groups it (UTC, like every time on the page)
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
function dayLabel(ts: string) {
  const d = ts.slice(0, 10), now = new Date().toISOString().slice(0, 10), y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  return d === now ? "Today" : d === y ? "Yesterday" : DAY.format(new Date(ts));
}

export function Mailbox({ arg }: { arg: string | null }) {
  const st = useApp((s) => s.status);
  const mb = st?.mailbox;
  useTick(15000);
  const [rows, setRows] = useState<MailRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [addr, setAddr] = useState(ALL);
  const [org, setOrg] = useState(ALL);
  const [archiveOpen, setArchiveOpen] = useState(() => readFlag("colluder.mailArchiveOpen"));
  const [seenAtOpen] = useState(readSeen);
  // what the delete dialog is about to remove, and how it says so
  const [doomed, setDoomed] = useState<{ what: { ids: number[] } | { upTo: number }; n: number; title: string; body: string } | null>(null);

  useEffect(() => { fetchMail().then((r) => setRows(r.messages)).catch((e) => { toast(`Couldn't load the mailbox: ${e.message}`, true); setRows([]); }); }, []);
  useEffect(() => onMail((e) => setRows((r) => {
    const list = r ?? [];
    if (e.type === "mail") return [e.row, ...list.filter((x) => x.id !== e.row.id)];
    if ("id" in e) return list.filter((x) => x.id !== e.id);
    const ids = new Set(e.ids ?? []);
    return list.filter((x) => !ids.has(x.id) && !(e.upTo !== undefined && x.id <= e.upTo));
  })), []);
  // opening the page reads what's here; rows newer than the last visit keep their dot until you leave
  useEffect(() => { if (rows?.length) save("colluder.mailSeen", Math.max(readSeen(), ...rows.map((r) => r.id))); }, [rows]);

  // each address is a member of the crew: its coat comes from its local part (first one here picks first)
  const coats = useMemo(() => {
    const first = new Map<string, string>();
    for (const r of rows ?? []) if (!first.has(r.localPart) || r.receivedAt < first.get(r.localPart)!) first.set(r.localPart, r.receivedAt);
    return crew([...first].map(([tag, plantedAt]) => ({ tag, plantedAt })));
  }, [rows]);
  // the addresses, newest mail first, with how many messages each has
  const addresses = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of rows ?? []) n.set(r.localPart, (n.get(r.localPart) ?? 0) + 1);
    return [...n];
  }, [rows]);
  // the organisations mail came from, newest first, with their counts
  const orgs = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of rows ?? []) { const o = orgOf(r); n.set(o, (n.get(o) ?? 0) + 1); }
    return [...n];
  }, [rows]);
  const needle = filter.trim().toLowerCase();
  const narrowed = addr !== ALL || org !== ALL || !!needle;
  const shown = useMemo(() => (rows ?? []).filter((r) => (addr === ALL || r.localPart === addr) && (org === ALL || orgOf(r) === org) && (!needle || r.localPart.includes(needle)
    || (r.subject ?? "").toLowerCase().includes(needle) || (r.from ?? "").toLowerCase().includes(needle) || (r.mailFrom ?? "").toLowerCase().includes(needle))), [rows, addr, org, needle]);
  const sel = arg && /^\d+$/.test(arg) ? Number(arg) : shown[0]?.id ?? null;
  const listRef = useRef<HTMLDivElement>(null);
  // what's shown, in words, for the dialog: "to acme-victim, from acme.example, matching “x”"
  const scope = [addr !== ALL && `to ${addr}`, org !== ALL && `from ${org}`, needle && `matching “${filter.trim()}”`].filter(Boolean).join(", ");
  const total = Math.max(mb?.count ?? 0, rows?.length ?? 0);
  const askClear = (all = false) => {
    if (!rows?.length) return;
    if (narrowed && !all) setDoomed({ what: { ids: shown.map((r) => r.id) }, n: shown.length, title: `Delete ${plural(shown.length, "message")} ${scope}?`, body: "Only the messages shown now; the rest of the mailbox stays." });
    else setDoomed({ what: { upTo: Math.max(...rows.map((r) => r.id)) }, n: total, title: `Delete all ${plural(total, "message")}?`, body: "This empties the mailbox. Mail that arrives from now on still lands here." });
  };
  const askOne = (r: MailRow) => setDoomed({ what: { ids: [r.id] }, n: 1, title: "Delete this message?",
    body: `“${r.subject || "(no subject)"}” from ${sender(r.from || r.mailFrom).name || "an unknown sender"}. Download the .eml first if you want a copy.` });
  const runDelete = async () => {
    if (!doomed) return;
    const { what } = doomed;
    try {
      const r = await deleteMail(what);
      const gone = (id: number) => ("ids" in what ? what.ids.includes(id) : id <= what.upTo);
      setRows((list) => (list ?? []).filter((x) => !gone(x.id)));
      if (sel !== null && gone(sel)) location.hash = "#mailbox";
      if ("upTo" in what) { setAddr(ALL); setOrg(ALL); setFilter(""); }
      toast(`Deleted ${plural(r.deleted, "message")}`);
    } catch (e) { toast(`Couldn't delete: ${(e as Error).message}`, true); }
  };
  useEffect(() => { listRef.current?.scrollTo({ top: 0 }); }, [addr, org, needle]);   // a new filter starts at its newest

  const recent = narrowed ? shown : shown.slice(0, RECENT);
  const older = narrowed ? [] : shown.slice(RECENT);
  // a message opened from a link stays in view, even in a closed archive
  const showArchive = archiveOpen || older.some((r) => r.id === sel);
  const days = useMemo(() => {
    const out: [string, MailRow[]][] = [];
    for (const r of older) { const d = dayLabel(r.receivedAt); if (out.at(-1)?.[0] === d) out.at(-1)![1].push(r); else out.push([d, [r]]); }
    return out;
  }, [older]);
  const row = (r: MailRow, timeOnly = false) => <Row key={r.id} r={r} sel={r.id === sel} unread={r.id > seenAtOpen} look={coats.get(r.localPart) ?? STRAY_LOOK} timeOnly={timeOnly} />;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] m-2 overflow-hidden rounded-md border border-rule bg-soot max-[820px]:m-1.5 max-[1180px]:grid-cols-[320px_minmax(0,1fr)] max-[820px]:block">
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
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="sender, subject, address" className="min-w-0 flex-1 bg-transparent font-mono text-bone caret-amber outline-none placeholder:font-sans placeholder:text-ash" />
          </label>
        </div>
        {mb && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-body text-smoke"
            title={[mb.live && `Receiving on ${mb.smtp!.join(", ")}`, mb.hosts.length > 1 && `Also @${mb.hosts.filter((h) => h !== mb.host).join(", @")}`,
              mb.lastLookup && `Last looked up ${ago(Date.now() - isoMs(mb.lastLookup.at))} (${mb.lastLookup.protocol.toUpperCase()})`].filter(Boolean).join("\n") || undefined}>
            <LineForm kind={mb.live ? "live" : "down"} signal="sparse" className={mb.live ? "text-bone" : "text-bad"} />
            {mb.live
              ? <span>Receiving</span>
              : <span className="text-bad">Not receiving yet: mail for this box still goes to interactsh. The operator runs <code className="font-mono text-bone">{setupCmd(st?.app)}</code> (without --no-mail)</span>}
            <span className="text-ash">· {plural(mb.count, "message")}, kept {plural(mb.retentionDays, "day")}</span>
            {!!rows?.length && <button type="button" onClick={() => { setAddr(ALL); setOrg(ALL); setFilter(""); askClear(true); }}
              className="inline-flex items-center gap-1 text-ash underline decoration-rule underline-offset-2 hover:text-bone max-[820px]:min-h-11"><Trash2 className="size-3.5" />Clear mailbox</button>}
          </p>
        )}
      </header>

      <section aria-label="Messages" className="flex min-h-0 flex-col border-r border-rule max-[820px]:max-h-[48vh] max-[820px]:border-r-0 max-[820px]:border-b">
        {!!addresses.length && (
          <div className="flex flex-none flex-wrap items-center gap-2 border-b border-rule px-4 py-2">
            <Select value={org} onValueChange={setOrg}>
              <SelectTrigger aria-label="Sender" className="h-[28px] w-auto max-w-[170px] min-w-0 gap-2 rounded-[3px] border-rule bg-transparent px-2.5 text-body">
                <span className="text-smoke">From</span><span className="min-w-0 truncate"><SelectValue /></span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>anyone <span className="text-ash">{rows?.length}</span></SelectItem>
                {orgs.map(([o, n]) => (
                  <SelectItem key={o} value={o}><span className="flex items-center gap-2"><OrgMark org={o} size={16} /><span>{o}</span><span className="text-ash">{n}</span></span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={addr} onValueChange={setAddr}>
              <SelectTrigger aria-label="Address" className="h-[28px] w-auto max-w-[190px] min-w-0 gap-2 rounded-[3px] border-rule bg-transparent px-2.5 text-body">
                <span className="text-smoke">To</span><span className="min-w-0 truncate"><SelectValue /></span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>every address <span className="text-ash">{rows?.length}</span></SelectItem>
                {addresses.map(([a, n]) => (
                  <SelectItem key={a} value={a}><span className="flex items-center gap-2"><CrewMark size={16} {...(coats.get(a) ?? STRAY_LOOK)} /><span className="font-mono">{a}</span><span className="text-ash">{n}</span></span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            {narrowed
              ? <span className="ml-auto flex items-center gap-1 text-label whitespace-nowrap text-ash">{shown.length} {shown.length === 1 ? "match" : "matches"}
                  {shown.length > 0 && <Button variant="ghost" size="icon-sm" aria-label={`Delete these ${shown.length}`} title={`Delete these ${shown.length}…`} onClick={() => askClear()}><Trash2 /></Button>}
                  <Button variant="ghost" size="icon-sm" aria-label="Show all mail" title="Show all mail" onClick={() => { setAddr(ALL); setOrg(ALL); setFilter(""); }}><X /></Button></span>
              : null}
          </div>
        )}
        <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
          {rows === null ? <p className="px-5 py-4 text-body text-ash">Loading…</p>
            : !shown.length ? <Empty filtered={narrowed && !!rows.length} host={mb?.host} />
            : (
              <>
                {!narrowed && older.length > 0 && <div className={sectionLabel}>Recent <span className="font-medium text-ash">{recent.length}</span></div>}
                <ul>{recent.map((r) => row(r))}</ul>
                {older.length > 0 && (
                  <>
                    <button type="button" aria-expanded={showArchive} onClick={() => { setArchiveOpen(!showArchive); save("colluder.mailArchiveOpen", !showArchive); }}
                      title="Older mail, by the day it arrived (UTC)" className={cn(sectionLabel, "w-full hover:text-bone max-[820px]:min-h-11")}>
                      {showArchive ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}Archive <span className="font-medium text-ash">{older.length}</span>
                    </button>
                    {showArchive && days.map(([d, list]) => (
                      <div key={d}>
                        <div className="sticky top-0 z-[1] border-b border-rule-2 bg-soot px-4 pt-2 pb-1 text-label font-medium text-ash">{d}</div>
                        <ul>{list.map((r) => row(r, true))}</ul>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
        </div>
      </section>

      <section aria-label="Message" className="min-h-0 overflow-auto">
        {sel !== null ? <Message key={sel} id={sel} look={(lp) => coats.get(lp) ?? STRAY_LOOK} count={(lp) => addresses.find(([a]) => a === lp)?.[1] ?? 0} onAddress={(lp) => { setAddr(lp); setOrg(ALL); setFilter(""); }} onOrg={(o) => { setOrg(o); setAddr(ALL); setFilter(""); }} orgCount={(o) => orgs.find(([x]) => x === o)?.[1] ?? 0} onDelete={askOne} /> : null}
      </section>
      <AlertDialog open={!!doomed} onOpenChange={(o) => { if (!o) setDoomed(null); }}>
        <AlertDialogContent className="max-w-[460px] border-rule bg-soot-1">
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">{doomed?.title}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {doomed?.body} Deleted mail is gone for good, exact bytes included: there's no restore. Probes and hits aren't touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="quiet">Keep {doomed?.n === 1 ? "it" : "them"}</Button></AlertDialogCancel>
            <AlertDialogAction asChild><Button variant="destructive" onClick={() => void runDelete()}>Delete {doomed && plural(doomed.n, "message")}</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// one message in the list, the way a mail client draws it: sender and time, subject, then the address
// it came to (its crew member) and the code when there is one. Unread: the amber dot and a heavier sender.
function Row({ r, sel, unread, look, timeOnly }: { r: MailRow; sel: boolean; unread: boolean; look: typeof STRAY_LOOK; timeOnly: boolean }) {
  const who = sender(r.from || r.mailFrom);
  return (
    <li>
      <a href={`#mailbox/${r.id}`} aria-current={sel ? "true" : undefined}
        className={cn("grid grid-cols-[6px_28px_minmax(0,1fr)_auto] items-start gap-x-2.5 border-b border-rule-2 py-2.5 pr-4 pl-2.5 no-underline hover:bg-hover", sel && "bg-soot-2 hover:bg-soot-2")}>
        <span className={cn("mt-[11px] size-1.5 rounded-full", unread && "bg-amber")} title={unread ? "Arrived since your last visit" : undefined} />
        <span className="pt-0.5" title={orgOf(r)}><OrgMark org={orgOf(r)} /></span>
        <span className="min-w-0">
          <span className={cn("block truncate text-body", unread ? "font-[650] text-bone" : "font-[550] text-bone")} title={r.from || r.mailFrom || undefined}>{who.name || <span className="text-ash">(no sender)</span>}</span>
          <span className={cn("block truncate text-body", unread ? "text-bone" : "text-smoke")}>{r.subject || <span className="text-ash">(no subject)</span>}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-label text-ash" title={`To ${r.rcpt} · ${r.localPart}: ${aKind(look.species)}`}>
            <CrewMark size={16} {...look} /><span className="min-w-0 truncate font-mono">{r.localPart}</span>
          </span>
        </span>
        <span className="flex h-full flex-col items-end justify-between gap-1 text-label whitespace-nowrap text-smoke">
          <time dateTime={r.receivedAt} title={r.receivedAt}>{timeOnly ? hm(r.receivedAt) : dayOrTime(r.receivedAt)}</time>
          {r.code && <code className="rounded-[3px] border border-rule px-1.5 font-mono text-body text-bone">{r.code}</code>}
        </span>
      </a>
    </li>
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

// mail written for HTML only often carries a placeholder text part ("No Text Available"): read the HTML
// part as text instead. Parsed into an inert document (no scripts run, nothing loads) and only its text
// is kept, blocks on their own lines, hidden preheaders dropped.
const BLOCK = /^(P|DIV|TR|TABLE|LI|UL|OL|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|BLOCKQUOTE|CENTER|PRE|HR)$/;
// the images an HTML part asks for from elsewhere: never loaded (they're often open-tracking pixels,
// and loading one tells the sender you read it, and from where); counted so the message says so
function remoteImages(html: string): { count: number; hosts: string[] } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const hosts = new Map<string, number>();
  let count = 0;
  for (const img of doc.querySelectorAll("img[src]")) {
    const m = /^(?:https?:)?\/\/([^/?#]+)/i.exec(img.getAttribute("src") ?? "");
    if (m) { count++; hosts.set(m[1].toLowerCase(), (hosts.get(m[1].toLowerCase()) ?? 0) + 1); }
  }
  return { count, hosts: [...hosts].sort((a, b) => b[1] - a[1]).map(([h]) => h) };
}
function htmlAsText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,head,title,noscript,template").forEach((n) => n.remove());
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { out += (n.textContent ?? "").replace(/[\s\u00a0]+/g, " "); return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    if (/display\s*:\s*none|mso-hide\s*:\s*all/i.test(el.getAttribute("style") ?? "") || el.hasAttribute("hidden")) return;
    if (el.tagName === "BR") { out += "\n"; return; }
    const block = BLOCK.test(el.tagName);
    if (block) out += "\n";
    el.childNodes.forEach(walk);
    if (el.tagName === "TD" || el.tagName === "TH") out += " ";
    if (block) out += "\n";
  };
  walk(doc.body);
  return out.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").replace(/[\u200c\u034f\u00ad]+/g, "").trim();
}

// a sign-in link: its host in Bone, the rest on one line, the whole of it one click away
function LinkLine({ url, label }: { url: string; label?: string | null }) {
  const [open, setOpen] = useState(false);
  const at = url.indexOf("//"), slash = url.indexOf("/", at + 2);
  const head = slash > 0 ? url.slice(0, slash) : url, rest = slash > 0 ? url.slice(slash) : "";
  const long = url.length > 90;
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-1.5">
        <code className={cn("min-w-0 font-mono text-bone", open || !long ? "break-all" : "truncate")} title={long && !open ? url : undefined}>
          {head}<span className="text-smoke">{rest}</span>
        </code>
        <Button variant="ghost" size="icon-sm" className="-mt-0.5" aria-label="Copy the link" onClick={() => copy(url, "Link")}><Copy /></Button>
      </div>
      {(label || long) && (
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-label text-ash">
          {label && <span>“{label}”</span>}
          {long && <button type="button" onClick={() => setOpen(!open)} className="text-smoke underline decoration-rule underline-offset-2 hover:text-bone">{open ? "Show less" : `Show all ${url.length} characters`}</button>}
        </p>
      )}
    </div>
  );
}

function Message({ id, look, count, onAddress, onOrg, orgCount, onDelete }: { id: number; look: (lp: string) => typeof STRAY_LOOK; count: (lp: string) => number; onAddress: (lp: string) => void; onOrg: (o: string) => void; orgCount: (o: string) => number; onDelete: (r: MailRow) => void }) {
  const [m, setM] = useState<MailDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>("message");
  const [raw, setRaw] = useState<string | null>(null);
  // probe info: the probes for the same target, by your naming (acme-lead-a -> acme, acme-trial-a, …)
  const probes = useApp((s) => s.probes);
  const related = useMemo(() => {
    if (!m) return [];
    const word = m.localPart.split(/[-+._]/)[0];
    return [...probes.values()].filter((p) => p.tag === m.localPart || (word.length >= 3 && (p.tag === word || p.tag.startsWith(`${word}-`))))
      .sort((a, b) => Number(!!a.retiredAt) - Number(!!b.retiredAt) || (b.lastHitAt ?? b.plantedAt).localeCompare(a.lastHitAt ?? a.plantedAt));
  }, [m, probes]);
  useEffect(() => { api<MailDetail>(`/api/mail/${id}`).then(setM).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => {
    if (view !== "raw" || raw !== null) return;
    fetch(`/api/mail/${id}/raw`).then((r) => r.arrayBuffer()).then((b) => setRaw(new TextDecoder().decode(b))).catch((e) => setRaw(`Couldn't load it: ${e.message}`));
  }, [view, id, raw]);
  // the readable message: the text part, unless it's missing or a stub and there is HTML to read instead
  const fromHtml = !!m?.html && (m.text ?? "").trim().length < 60;
  // for reading only: runs of blank lines fold to one (Exact bytes and the .eml keep them)
  const readable = useMemo(() => (!m ? "" : fromHtml ? htmlAsText(m.html!) : (m.text ?? "").replace(/\r\n/g, "\n").replace(/\n[ \t]*(?:\n[ \t]*){2,}/g, "\n\n").trim()), [m, fromHtml]);
  const images = useMemo(() => (m?.html ? remoteImages(m.html) : { count: 0, hosts: [] }), [m]);
  if (err) return <p className="px-6 py-5 text-body text-bad">{err}</p>;
  if (!m) return <p className="px-6 py-5 text-body text-ash">Loading…</p>;

  const who = sender(m.from || m.mailFrom);
  const otherCodes = m.codes.filter((c) => c.value !== m.code && c.score > 0).slice(0, 4);
  const otherLinks = m.links.filter((l) => l.url !== m.link && l.score > 0).slice(0, 6);
  const numbers = m.code ? otherCodes : m.codes.slice(0, 4);
  const body = view === "message" ? readable : view === "html" ? m.html ?? "" : view === "headers" ? m.headers.map(([n, v]) => `${n}: ${v}`).join("\n") : raw ?? "Loading…";
  const absent = (view === "message" && !readable) || (view === "html" && !m.html);
  const n = count(m.localPart);
  const o = orgOf(m), on = orgCount(o);

  return (
    <article className="px-6 py-5 max-[820px]:px-4">
      <header className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3.5 max-[820px]:grid-cols-1">
        <span className="pt-0.5 max-[820px]:hidden" title={o}><OrgMark org={o} size={36} /></span>
        <div className="min-w-0">
        <h2 className="text-title font-[650] break-words text-bone">{m.subject || <span className="text-ash">(no subject)</span>}</h2>
        <dl className="mt-2.5 grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body max-[820px]:grid-cols-[60px_minmax(0,1fr)] max-[820px]:gap-x-3">
          <dt className="text-smoke">From</dt>
          <dd className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="min-w-0 break-words text-bone" title={m.mailFrom !== null ? `Envelope sender (MAIL FROM): ${m.mailFrom || "<>"}` : undefined}>
              {who.name ? <>{who.name}{who.addr !== who.name && <span className="font-mono text-smoke"> {who.addr}</span>}</> : <span className="text-ash">none</span>}
            </span>
            {on > 1 && <button type="button" onClick={() => onOrg(o)} className="text-label text-smoke underline decoration-rule underline-offset-2 hover:text-bone">All {on} from {o}</button>}
          </dd>
          <dt className="pt-0.5 text-smoke">To</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex min-w-0 items-center gap-1.5" title={`${m.localPart}: ${aKind(look(m.localPart).species)}`}>
              <CrewMark size={18} {...look(m.localPart)} /><code className="min-w-0 font-mono break-all text-bone">{m.rcpt}</code>
            </span>
            <span className="flex items-center gap-3 text-label">
              {n > 1 && <button type="button" onClick={() => onAddress(m.localPart)} className="text-smoke underline decoration-rule underline-offset-2 hover:text-bone">All {n} to {m.localPart}</button>}
              {related.length > 0 && (
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-ash" title={`Probes named like ${m.localPart.split(/[-+._]/)[0]}…, newest activity first`}>
                  {plural(related.length, "probe")}
                  {related.slice(0, 3).map((p) => <a key={p.tag} href={`#probes/${p.tag}`} className="font-mono text-smoke underline decoration-rule underline-offset-2 hover:text-bone">{p.tag}</a>)}
                  {related.length > 3 && <span>+{related.length - 3}</span>}
                </span>
              )}
            </span>
          </dd>
          <dt className="text-smoke">Received</dt><dd className="text-bone"><time dateTime={m.receivedAt}>{m.receivedAt.replace("T", " ").slice(0, 19)} UTC</time>
            <span className="text-ash"> · from <span className="font-mono">{m.remoteAddress}</span>{m.helo ? <> (<span className="font-mono">{m.helo}</span>)</> : null} · {m.tls ? m.tls : "no TLS"} · {plural(m.size, "byte")}</span></dd>
          {m.attachments.length > 0 && <><dt className="text-smoke">Attached</dt><dd className="text-bone">{m.attachments.map((a) => `${a.filename ?? "unnamed"} (${a.contentType}, ${plural(a.size, "byte")})`).join(" · ")}</dd></>}
        </dl>
        </div>
      </header>

      {(m.code || numbers.length > 0 || m.link || otherLinks.length > 0) && (
        <div className="mt-4 grid grid-cols-[72px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-y border-rule-2 py-3.5 text-body">
          {(m.code || numbers.length > 0) && <>
            <span className="pt-1 text-smoke">Code</span>
            <div className="min-w-0">
              {m.code ? (
                <div className="flex flex-wrap items-center gap-3">
                  <code className="font-mono text-headline font-[650] tracking-[.06em] text-bone">{m.code}</code>
                  <Button onClick={() => copy(m.code!, "Code")}><Copy />Copy code</Button>
                </div>
              ) : <p className="pt-1 text-ash">No code found. Numbers in it, none next to words like code or verification:</p>}
              {numbers.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-label text-ash">
                  {numbers.map((c) => (
                    <li key={c.value} className="flex items-center gap-1.5"><code className="font-mono text-body text-smoke">{c.value}</code><span className="truncate">{c.context}</span>
                      <Button variant="ghost" size="icon-sm" aria-label={`Copy ${c.value}`} onClick={() => copy(c.value, "Number")}><Copy /></Button></li>
                  ))}
                </ul>
              )}
            </div>
          </>}
          {(m.link || otherLinks.length > 0) && <>
            <span className="pt-0.5 text-smoke">Link</span>
            <div className="min-w-0">
              {m.link ? <LinkLine url={m.link} label={m.links.find((l) => l.url === m.link)?.label} />
                : <p className="pt-0.5 text-ash">None that looks like a sign-in or confirmation link.</p>}
              {otherLinks.length > 0 && (
                <details className="mt-1.5 text-label text-ash">
                  <summary className="cursor-pointer text-smoke hover:text-bone">{plural(otherLinks.length, "other link")}</summary>
                  <ul className="mt-1.5 space-y-1.5">{otherLinks.map((l) => <li key={l.url}><LinkLine url={l.url} label={l.label} /></li>)}</ul>
                </details>
              )}
            </div>
          </>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as View)} aria-label="Show" title="Shown as text; links aren't live" className="overflow-hidden rounded-[3px] border border-rule">
          {([["message", "Message"], ["html", "HTML source"], ["headers", "Headers"], ["raw", "Exact bytes"]] as [View, string][]).map(([v, l]) => <ToggleGroupItem key={v} value={v} className={seg}>{l}</ToggleGroupItem>)}
        </ToggleGroup>
        {view === "message" && (fromHtml && readable || images.count > 0) && (
          <span className="flex min-w-0 flex-wrap gap-x-2 text-label text-ash">
            {fromHtml && readable && <span title={m.text?.trim() ? `Its text part only says: ${m.text.trim()}` : "It has no text part"}>Read from the HTML part</span>}
            {fromHtml && readable && images.count > 0 && <span aria-hidden>·</span>}
            {images.count > 0 && <span title={`Not loaded: loading them would tell ${images.hosts.length === 1 ? "that server" : "those servers"} you opened this message, and from where.\n${images.hosts.join("\n")}`}>
              <span className="cursor-help underline decoration-rule decoration-dotted underline-offset-2">{plural(images.count, "remote image")} not loaded</span></span>}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => copy(body, view === "raw" ? "Message" : "Text")}><Copy />Copy</Button>
          <Button variant="quiet" size="sm" asChild><a href={`/api/mail/${id}/raw`} download><Download />.eml</a></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete this message" title="Delete this message…" onClick={() => onDelete(m)}><Trash2 /></Button>
        </span>
      </div>
      <pre className={cn("mt-2 max-h-[60vh] overflow-auto rounded-[3px] border border-rule-2 bg-well p-3 text-body break-words whitespace-pre-wrap text-bone", view === "message" ? "font-sans leading-[1.5]" : "font-mono leading-[18px]")}>
        {absent ? <span className="font-sans text-ash">{view === "message" ? "No text in it." : "No HTML part."}</span>
          : view === "headers" || view === "raw" ? <MailText text={body.length > MAX_SHOWN ? body.slice(0, MAX_SHOWN) : body} allHead={view === "headers"} />
          : <span className={cn(view === "message" && "block max-w-[78ch]")}>{body.length > MAX_SHOWN ? body.slice(0, MAX_SHOWN) : body}</span>}
        {!absent && body.length > MAX_SHOWN && <span className="font-sans text-ash">{`\n… ${body.length - MAX_SHOWN} more characters not shown. Copy gives everything.`}</span>}
      </pre>
    </article>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, ChevronRight, Download, FileText, Search, Trash2, X } from "lucide-react";
import { useApp, keyOf, markSeen, selectHit, patchProbe, saveRule, fetchTrigger, fetchReport, chatterOf, setTab, unreadFor, loadOlder, searchHits, exportUrl, deleteProbe, PROBE_TABS, type AppState, type ProbeTab } from "@/store";
import { probeState } from "@/lib/probeState";
import { dnsSteps, mostSpecific } from "@/lib/dns";
import { stageOf } from "@/lib/stage";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UNTAGGED, type Interaction, type Probe } from "@/lib/types";
import { dayOrTime, hmsms, isoMs, newestFirst, plural, settled } from "@/lib/format";
import { groupHits } from "@/lib/raw";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, LineForm, NewDot, NilDot, TechniqueMark, TypeChip } from "./bits";
import { HitDetail } from "./HitDetail";
import { HttpRuleTab } from "./HttpRule";
import { cn } from "@/lib/utils";

function EditDialog({ p, open, onOpenChange }: { p: Probe; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [target, setTarget] = useState(p.target);
  const [note, setNote] = useState(p.note);
  const [trigger, setTrigger] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setTarget(p.target); setNote(p.note); setTrigger(null);
    fetchTrigger(p.tag).then(setTrigger, () => setTrigger(""));
  }, [open, p.tag, p.target, p.note]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] border-rule bg-soot-1">
        <DialogHeader><DialogTitle>Edit {p.tag}</DialogTitle><DialogDescription>Where you planted it and anything worth remembering.</DialogDescription></DialogHeader>
        <label className="text-body text-smoke">Target<Input className="mt-1.5" value={target} maxLength={300} placeholder="e.g. api.shop.example · POST /import url=" onChange={(e) => setTarget(e.target.value)} /></label>
        <label className="text-body text-smoke">Note<Textarea className="mt-1.5" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></label>
        <label className="text-body text-smoke">Trigger request
          <span className="mt-0.5 block text-label text-ash">The request that made the target call back, pasted from your proxy. It opens the probe report.</span>
          <Textarea className="mt-1.5 max-h-[40vh] font-mono text-body leading-[1.125rem]" rows={7} spellCheck={false} maxLength={32768} disabled={trigger === null}
            placeholder={trigger === null ? "Loading…" : "POST /api/webhooks HTTP/1.1\nHost: api.shop.example\n…"} value={trigger ?? ""} onChange={(e) => setTrigger(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="default" disabled={trigger === null} onClick={() => patchProbe(p.tag, { target, note, ...(trigger !== null ? { trigger } : {}) }).then(() => onOpenChange(false), (e) => toast((e as Error).message, true))}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Head({ s }: { s: AppState }) {
  const [edit, setEdit] = useState(false);
  const [retire, setRetire] = useState(false);
  const [del, setDel] = useState(false);
  const [resetRule, setResetRule] = useState(true);
  const cls = "flex min-w-0 items-center gap-3.5 border-b border-rule pr-5 pl-6 max-[820px]:flex-wrap max-[820px]:gap-2 max-[820px]:px-3.5 max-[820px]:py-2.5";
  if (s.sel === UNTAGGED) {
    return (
      <div className={cls}>
        <span className="text-headline font-semibold">No tag</span>
        <span className="text-body text-smoke">Hits that carry no tag · <b className="font-semibold text-bone">{s.untagged?.hits ?? 0}</b> hits</span>
      </div>
    );
  }
  const p = s.probes.get(s.sel!)!;
  const st = probeState(p);
  const canDelete = st === "retired" || st === "late" || st === "unplanted";
  return (
    <div className={cn(cls, "border-b-0")}>
      <span className="font-mono text-headline whitespace-nowrap">{p.tag}</span>
      {st === "unplanted" ? <Chip grey>not planted</Chip>
        : p.retiredAt ? <span className="flex items-center gap-1.5 text-body whitespace-nowrap text-ash" title="Out of the active list. New hits on this tag are still recorded."><LineForm kind="off" className="w-4" />{st === "late" ? "Retired · late hit" : "Retired"}</span>
        : <span className="flex items-center gap-1.5 text-body font-[550] whitespace-nowrap text-bone" title="Planted and listening: a callback shows up here within seconds"><LineForm kind="live" signal="listen" seed={p.tag} className="w-4" />Armed</span>}
      {st !== "unplanted" && <TechniqueMark technique={p.technique} className="text-body" />}
      <div className="flex min-w-0 gap-3.5 overflow-hidden text-body whitespace-nowrap text-smoke">
        <span className="truncate" title={p.note || undefined}>{p.target || "No target noted"}</span>
        <span>Planted <b className="font-semibold text-bone">{dayOrTime(p.plantedAt)}</b></span>
        {p.note && <span className="truncate text-ash" title={p.note}>Note: {p.note}</span>}
      </div>
      <div className="ml-auto flex gap-1.5">
        {s.status?.discord.available && (
          <Button variant="ghost" size="icon" aria-pressed={!!p.muted} aria-label={p.muted ? `Unmute Discord alerts for ${p.tag}` : `Mute Discord alerts for ${p.tag}`}
            title={p.muted ? "Alerts muted: hits are recorded and shown, but not posted to Discord. Click to unmute." : "Mute Discord alerts for this probe (hits are still recorded)"}
            className={cn(p.muted && "text-ash")}
            onClick={() => patchProbe(p.tag, { muted: !p.muted }).then(() => toast(p.muted ? `Alerts on for ${p.tag}` : `Muted ${p.tag}: no Discord posts, hits still recorded`), (e) => toast((e as Error).message, true))}>
            {p.muted ? <BellOff /> : <Bell />}
          </Button>
        )}
        <Button variant="quiet" title={`Markdown for a bug report: summary, ${p.triggerBytes ? "the triggering request, " : ""}timeline, sources, decoded exfil and the first web request`}
          onClick={() => fetchReport(p.tag).then((md) => copy(md, `${p.tag} report`), (e) => toast((e as Error).message, true))}><FileText />Copy report</Button>
        <Button variant="quiet" onClick={() => setEdit(true)}>Edit</Button>
        {st !== "unplanted" && <Button variant="quiet" onClick={() => (p.retiredAt ? patchProbe(p.tag, { retired: false }).then(() => toast(`Restored ${p.tag}`), (e) => toast((e as Error).message, true)) : setRetire(true))}>{p.retiredAt ? "Restore" : "Retire…"}</Button>}
        {canDelete && <Button variant="destructive" onClick={() => setDel(true)}><Trash2 />Delete…</Button>}
      </div>
      <AlertDialog open={del} onOpenChange={setDel}>
        <AlertDialogContent className="max-w-[460px] border-rule bg-soot-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {p.tag}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the probe for good, with {p.hits ? `its ${plural(p.hits, "stored hit")}` : "any hits stored for it"} and its rule history. Restore can't bring it back.{p.hits ? " Export its hits first if you may need them." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {!!p.hits && <Button variant="quiet" asChild><a href={exportUrl(p.tag)} download><Download />Export hits</a></Button>}
            <AlertDialogCancel asChild><Button variant="quiet">Keep it</Button></AlertDialogCancel>
            <AlertDialogAction asChild><Button variant="destructive" onClick={() => deleteProbe(p.tag).then((n) => toast(`Deleted ${p.tag} and ${plural(n, "stored hit")}`), (e) => toast((e as Error).message, true))}>Delete {p.tag}</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <EditDialog p={p} open={edit} onOpenChange={setEdit} />
      <AlertDialog open={retire} onOpenChange={setRetire}>
        <AlertDialogContent className="max-w-[440px] border-rule bg-soot-1">
          <Button variant="ghost" size="icon-sm" aria-label="Close" className="absolute top-3 right-3 text-smoke" onClick={() => setRetire(false)}><X /></Button>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire {p.tag}?</AlertDialogTitle>
            <AlertDialogDescription>It moves to Retired at the bottom of the list. Its hits stay, and new hits on this tag are still recorded.</AlertDialogDescription>
          </AlertDialogHeader>
          {p.httpRule && (
            <label className="flex items-start gap-2 text-body text-smoke">
              <input type="checkbox" className="mt-[3px] accent-bone" checked={resetRule} onChange={(e) => setResetRule(e.target.checked)} />
              <span>Also reset its HTTP answer to the default reply, so it {s.status?.edge?.state === "running" ? "stops answering" : "won't answer after the cutover"} with <span className="text-bone">{p.httpRule.line}</span></span>
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="quiet">Cancel</Button></AlertDialogCancel>
            <AlertDialogAction asChild><Button variant="default" onClick={() => (p.httpRule && resetRule ? saveRule(p.tag, { mode: "default", delayMs: 0, schemes: { http: true, https: true } }) : Promise.resolve())
              .then(() => patchProbe(p.tag, { retired: true }))
              .then(() => markSeen(p.tag, false)) // its hits are read: a retired probe's old hits are no longer news
              .then(() => toast(`Retired ${p.tag}: hits kept, new ones still recorded${p.httpRule && resetRule ? ", HTTP answer back to default" : ""}`), (e) => toast((e as Error).message, true))}>Retire</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// DNS evidence is the name that was asked for: show the labels before the id, tag highlighted.
export function DnsName({ i }: { i: Interaction }) {
  const prefix = i.fullId.endsWith(i.uniqueId) ? i.fullId.slice(0, -i.uniqueId.length).replace(/\.$/, "") : "";
  const labels = prefix ? prefix.split(".") : [];
  const short = `${i.uniqueId.slice(0, 8)}…`;
  if (!labels.length) return <span className="font-mono text-body text-smoke">{short} <span className="font-sans text-label text-ash">(bare id)</span></span>;
  return (
    <span className="font-mono text-body">
      {labels.map((l, n) => <span key={n}>{n > 0 && "."}{l === i.tag ? <em className="bg-mark px-px text-bone not-italic">{l}</em> : <span className="text-bone">{l}</span>}</span>)}
      <span className="text-smoke">.{short}</span>
    </span>
  );
}

// a web hit's summary is "request line · User-Agent"; the stage label goes between the two, so a
// long User-Agent never cuts it off
const reqOf = (summary: string) => { const k = summary.indexOf(" · "); return k === -1 ? summary : summary.slice(0, k); };
const uaOf = (summary: string) => { const k = summary.indexOf(" · "); return k === -1 ? "" : summary.slice(k + 3); };

// The request line with the raw panes' inks, so a row reads as parts: method, path, the query's
// names and values, the version. Display only: the cell's title and every copy keep the exact text.
function RequestLine({ line }: { line: string }) {
  const m = /^([A-Z]{2,12}) (\S+)( HTTP\/[\d.]+)?(.*)$/.exec(line);
  if (!m) return <span className="font-mono text-body">{line}</span>;
  const [, method, target, version = "", rest] = m;
  const qi = target.indexOf("?");
  const path = qi === -1 ? target : target.slice(0, qi);
  const query = qi === -1 ? "" : target.slice(qi + 1);
  return (
    <span className="font-mono text-body" title={line}>
      <span className="font-[650] text-bone">{method}</span> <span className="text-bone">{path}</span>
      {qi !== -1 && <span className="text-ash">?</span>}
      {query && query.split("&").map((kv, n) => {
        const eq = kv.indexOf("=");
        return (
          <span key={n}>{n > 0 && <span className="text-ash">&amp;</span>}
            <span className="text-syn-name">{eq === -1 ? kv : kv.slice(0, eq)}</span>
            {eq !== -1 && <><span className="text-ash">=</span><span className="text-syn-value">{kv.slice(eq + 1)}</span></>}
          </span>
        );
      })}
      <span className="text-ash">{version}{rest}</span>
    </span>
  );
}

function rowKeys(fn: () => void) {
  return (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
}

// the labels before the payload id, for naming a longer lookup compactly
const labelsOf = (fullId: string) => fullId.split(".").slice(0, -3).join(".") || fullId;

function HitRow({ i, open, sel, arrived, child, chatter, inProbe, step, self, stop, onClick }: { i: Interaction; open: number; sel: boolean; arrived: boolean; child?: boolean; chatter?: string; inProbe?: boolean; step?: string; self?: "box" | "mine"; stop?: boolean; onClick: () => void }) {
  const isNew = i.id > open && !chatter && !step;
  const quiet = !!chatter || !!step;
  const web = i.protocol === "http" || i.protocol === "https";
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => { if (sel && settled()) ref.current?.scrollIntoView({ block: "nearest" }); }, [sel]);
  return (
    <tr ref={ref} tabIndex={sel || stop ? 0 : -1} aria-selected={sel} onClick={(e) => { e.stopPropagation(); onClick(); }} onKeyDown={rowKeys(onClick)}
      className={cn("group cursor-pointer", arrived && "[&>td]:animate-lit", child && "[&>td]:bg-child [&>td:first-child]:pl-11", (quiet || self) && !sel && "[&>td]:text-smoke [&_.text-bone]:text-smoke")}>
      <Td sel={sel} first><span className={cn("flex items-center gap-1.5 font-semibold", isNew ? "text-bone" : "text-smoke")}>{isNew ? <NewDot /> : <NilDot />}#{i.id}</span></Td>
      <Td sel={sel}>{hmsms(i.timestamp)}</Td>
      <Td sel={sel}><TypeChip proto={i.protocol}>{i.protocol === "dns" ? `DNS ${i.qType || "other"}` : undefined}</TypeChip></Td>
      <Td sel={sel} className="font-mono text-body">
        <span className={cn(web && !self && !sel && "font-[550] text-bone")}>{i.remoteAddress}</span>
        {self && <span className="ml-2 font-sans" title="A self-test (the OOB box, or a source you marked as yours), not the target"><Chip grey>{self === "mine" ? "yours" : "this box"}</Chip></span>}
      </Td>
      <Td sel={sel} last>{web || i.protocol === "smtp" ? <>{web ? <RequestLine line={reqOf(i.summary)} /> : <span className="font-mono text-body">{reqOf(i.summary)}</span>}{stageOf(i) && <span className="ml-2 text-label whitespace-nowrap text-smoke" title="What Colluder's edge answered. A redirect sent is not proof it was followed; a later hop is.">· {stageOf(i)}</span>}{uaOf(i.summary) && <span className="ml-2 font-mono text-label text-ash">· {uaOf(i.summary)}</span>}</> : i.protocol === "dns" ? <><DnsName i={i} />{chatter && <span className="text-label text-ash" title="A lookup of the bare payload id near this probe's hits: a resolver walking the name, or a client resolving the HTTPS host. Kept, never counted as new."> · resolver chatter{inProbe ? "" : ` around ${chatter}`}</span>}{step && <span className="text-label text-ash" title={`The resolver asked for this on its way to ${step} (QNAME minimisation). Not exfil data.`}> · resolver step toward <span className="font-mono">{labelsOf(step)}</span></span>}</> : <span className="text-label text-smoke">{i.summary}</span>}</Td>
    </tr>
  );
}
function Td({ children, sel, first, last, className }: { children: React.ReactNode; sel: boolean; first?: boolean; last?: boolean; className?: string }) {
  return (
    <td className={cn("overflow-hidden border-b border-rule-2 px-2.5 py-1.5 text-body text-ellipsis whitespace-nowrap group-hover:bg-hover",
      first && "pl-6 max-[820px]:pl-3.5", last && "max-[820px]:hidden", sel && "border-rule bg-soot-2 text-bone group-hover:bg-soot-2", className)}>{children}</td>
  );
}

const TAB_LABEL: Record<ProbeTab, string> = { hits: "Hits", http: "HTTP response" };
// the tab's note for an unsaved draft says what the draft answers: "302, edited", "XXE, edited"
const draftShort = (r: { mode?: string; status?: number } | undefined) =>
  !r ? "default" : r.mode === "redirect" || r.mode === "custom" ? String(r.status ?? r.mode) : r.mode === "file" ? "file" : r.mode === "preset" ? "XXE" : "default";

function ProbeTabs({ s, p, right }: { s: AppState; p: Probe; right?: React.ReactNode }) {
  const unread = s.tab !== "hits" ? unreadFor(s, p.tag) : 0;
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = PROBE_TABS.indexOf(s.tab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? PROBE_TABS.length - 1 : (i + step + PROBE_TABS.length) % PROBE_TABS.length;
    setTab(PROBE_TABS[next]);
    ref.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  };
  return (
    <div className="flex h-[35px] min-w-0 items-stretch border-b border-rule pr-5 max-[820px]:h-11 max-[820px]:pr-3.5">
    <div ref={ref} role="tablist" aria-label={`Probe ${p.tag}`} onKeyDown={onKeyDown}
      className="flex flex-none items-stretch gap-6 overflow-x-auto pl-6 max-[820px]:gap-5 max-[820px]:pl-3.5">
      {PROBE_TABS.map((t) => {
        const on = s.tab === t;
        return (
          <button key={t} type="button" role="tab" id={`probe-tab-${t}`} aria-selected={on} aria-controls="probe-panel" tabIndex={on ? 0 : -1}
            onClick={() => setTab(t)}
            className={cn("relative flex flex-none cursor-pointer items-center gap-[7px] text-body font-[550] whitespace-nowrap text-smoke hover:text-bone focus-visible:outline-[1.5px] focus-visible:-outline-offset-2 focus-visible:outline-bone",
              on && "text-bone after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-[1px] after:bg-bone")}>
            {TAB_LABEL[t]}
            {t === "hits" ? <span className="font-normal text-smoke">{p.hits}</span>
              : t === "http" && s.ruleDrafts[p.tag] ? <span className="text-label font-normal text-smoke italic" title="Unsaved changes, kept until you save or discard">{draftShort(s.ruleDrafts[p.tag] as { mode?: string; status?: number })}, edited</span>
              : t === "http" && p.httpRule ? (s.status?.edge?.state === "running"
                ? <span className="font-mono text-label font-normal text-bone" title={p.httpRule.line}>{p.httpRule.short}</span>
                : <span className="font-mono text-label font-normal text-ash" title={`v${p.httpRule.version} saved, not served until the cutover`}>{p.httpRule.short}</span>)
              : <span className="text-label font-normal text-ash" title="interactsh-server's standard answer">default</span>}
            {t === "hits" && unread > 0 && <NewDot title={`${plural(unread, "new hit")} since you switched tabs`} />}
          </button>
        );
      })}
    </div>
    {right}
    </div>
  );
}

function autoHit(hits: Interaction[]) {
  const top = hits[0];
  if (!top) return null;
  const near = hits.filter((i) => isoMs(top.timestamp) - isoMs(i.timestamp) < 5000);
  return (near.find((i) => i.protocol !== "dns") ?? top).id;
}

export function ProbePane() {
  const s = useApp((x) => x);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [results, setResults] = useState<Interaction[] | null>(null);
  useEffect(() => { setExpanded(new Set()); setQ(""); setKinds([]); setResults(null); }, [s.sel]);

  // the pane's rows: live hits, older pages loaded on demand, and (on a tagged probe) the resolver
  // chatter around it, which belongs to its story even though it carries no tag
  const chatterAll = chatterOf(s.list);
  const olderRows = s.sel ? s.older[s.sel] : undefined;
  const all = useMemo(() => {
    if (!s.sel) return [];
    const m = new Map<number, Interaction>();
    for (const i of s.list) if (keyOf(i) === s.sel || (s.sel !== UNTAGGED && chatterAll.get(i.id) === s.sel)) m.set(i.id, i);
    for (const i of olderRows ?? []) m.set(i.id, i);
    return [...m.values()].sort(newestFirst);
  }, [s.sel, s.list, olderRows, chatterAll]);
  const steps = useMemo(() => dnsSteps(all), [all]);
  const filtering = q.trim() !== "" || kinds.length > 0;
  // search and type filters run on the server, over every stored hit of this probe
  useEffect(() => {
    if (!s.sel || !filtering) { setResults(null); return; }
    const types = kinds.flatMap((k) => (k === "web" ? ["http", "https"] : [k]));
    const t = setTimeout(() => { searchHits(s.sel!, q.trim(), types).then(setResults, () => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [s.sel, q, kinds, filtering, s.list[0]?.id]);
  const hits = filtering ? results ?? [] : all;

  // keyboard: j / k move through hits
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement)?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog],[role=alertdialog]")) return; // never move hits behind an open dialog
      if ((e.key !== "j" && e.key !== "k") || !s.sel) return;
      if (s.sel !== UNTAGGED && s.tab !== "hits") return;
      const idx = hits.findIndex((i) => i.id === s.hit);
      const next = hits[Math.min(Math.max(idx + (e.key === "j" ? 1 : -1), 0), hits.length - 1)];
      if (!next) return;
      // stepping into a collapsed DNS burst opens it, so the selection is always a visible row
      const g = groupHits(hits).find((x) => x.kind === "burst" && x.items.some((i) => i.id === next.id));
      if (g) setExpanded((prev) => new Set(prev).add(g.items[g.items.length - 1].id));
      selectHit(next.id);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [s.sel, hits, s.hit, s.tab]);

  // until the researcher picks a hit, the selection follows the newest one, preferring a web hit over
  // the DNS lookups that arrive around it (a fetch usually lands a moment after its lookup)
  const hitId = s.hitPicked && hits.some((i) => i.id === s.hit) ? s.hit : autoHit(hits.filter((i) => !chatterAll.has(i.id) && !steps.has(i.id)).concat(hits.slice(0, 1)));
  useEffect(() => { if (hitId !== s.hit && hitId != null) selectHit(hitId, false); }, [hitId, s.hit]);

  const wrap = "@container/probe grid min-h-0 min-w-0 grid-rows-[52px_minmax(0,auto)_minmax(0,1fr)] max-[820px]:grid-rows-[auto_auto_auto]";
  if (!s.sel) {
    return (
      <section className={wrap}>
        <div className="border-b border-rule" /><div />
        <div className="flex items-center justify-center border-t border-rule bg-soot-1 text-body text-ash">
          {s.probes.size ? "Select a probe to see who called." : "Your probes and their callbacks will appear here."}
        </div>
      </section>
    );
  }
  const p = s.probes.get(s.sel);
  // a tagged probe gets the tab strip; Unregistered only has hits
  const tabs = p ? <ProbeTabs s={s} p={p} /> : null;
  const tabbed = p ? "grid-rows-[52px_35px_minmax(0,auto)_minmax(0,1fr)]" : "";
  if (p && s.tab !== "hits") {
    return (
      <section className={cn(wrap, "grid-rows-[52px_35px_minmax(0,1fr)]")} aria-label={`Probe ${s.sel}`}>
        <Head s={s} />{tabs}<HttpRuleTab p={p} />
      </section>
    );
  }
  if (!all.length) {
    const capturing = s.status?.engine?.state === "capturing";
    const st = p ? probeState(p) : "armed";
    const lc = s.status?.lastClear?.at;
    const cleared = lc && p && isoMs(lc) > (isoMs(p.plantedAt) || 0) ? lc : null;
    return (
      <section className={cn(wrap, tabbed)} aria-label={`Probe ${s.sel}`}>
        <Head s={s} />{tabs}
        <div id={p ? "probe-panel" : undefined} role={p ? "tabpanel" : undefined} aria-labelledby={p ? "probe-tab-hits" : undefined} className="max-w-[72ch] px-6 py-[18px] text-body leading-[1.1875rem] text-smoke">
          {/* one sentence for the probe's actual state: retired and never-planted probes aren't "waiting" */}
          {st === "retired" ? (
            <p><b className="font-semibold text-bone">Retired {dayOrTime(p!.retiredAt)} UTC · {cleared ? `no hits since the clear at ${dayOrTime(cleared)}` : "no hits stored"}.</b> New hits on this tag are still recorded and bring it back to the list. Restore it to use its payloads again, or delete it if you're done with it.</p>
          ) : st === "unplanted" ? (
            <p><b className="font-semibold text-bone">Nobody planted {p!.tag}.</b> A request named it{cleared ? `, and its hits went in the clear at ${dayOrTime(cleared)}` : ""}. Delete it, or plant it above to keep its hits under a target.</p>
          ) : (
          <>
          <p>
            <b className="font-semibold text-bone">Armed since {dayOrTime(p?.plantedAt)} UTC · {cleared ? `no hits since the clear at ${dayOrTime(cleared)}` : "no hits yet"}.</b> Waiting for the target to reach any payload above.{" "}
            {capturing ? "The engine is capturing, so a callback will show up here within seconds."
              : <b className="font-semibold text-bone">The engine is not capturing right now (see the banner above), so callbacks are not being recorded until it is back.</b>}
          </p>
          <ul className="mt-2 ml-[18px] list-disc space-y-1">
            <li>Nothing at all? The fetcher may only accept certain schemes, or block unknown hosts. Try the DNS variant: many targets resolve names they never fetch.</li>
            <li>HTTPS needs the tag in the path (one-label certificate). A prefixed HTTPS host fails TLS and looks like silence.</li>
            <li>Hits arriving under No tag instead? The target stripped or rewrote the subdomain.</li>
            <li>Testing DNS yourself and nothing shows? A resolver may answer from its cache and never ask us. Use the DNS payload's fresh-label copy (a random label in front of the tag) to force a new lookup.</li>
          </ul>
          </>
          )}
        </div>
        <div />
      </section>
    );
  }

  const open = s.openSeen[s.sel] ?? s.seen[s.sel] ?? 0;
  const chatter = chatterAll;
  const boxIps = new Set(s.status?.selfIps ?? []), mineIps = new Set(s.status?.mineIps ?? []);
  const selfOf = (ip: string) => (boxIps.has(ip) ? "box" as const : mineIps.has(ip) ? "mine" as const : undefined);
  // with no row selected (a filter hid it), the first row is the table's tab stop
  const selShown = hits.some((i) => i.id === hitId);
  let stopGiven = selShown;
  const takeStop = () => { if (stopGiven) return false; stopGiven = true; return true; };
  const row = (i: Interaction, child?: boolean) => (
    <HitRow key={i.id} stop={takeStop()} child={child} i={i} chatter={chatter.get(i.id)} inProbe={s.sel !== UNTAGGED} step={steps.get(i.id)} self={selfOf(i.remoteAddress)} open={open} sel={i.id === hitId} arrived={i.id === s.arrived} onClick={() => selectHit(i.id)} />
  );
  const rows: React.ReactNode[] = [];
  for (const g of groupHits(hits)) {
    if (g.kind === "one") { rows.push(row(g.items[0])); continue; }
    const items = g.items, first = items[items.length - 1], last = items[0];
    const exp = expanded.has(first.id);
    const srcs = new Map<string, number>();
    for (const i of items) srcs.set(i.remoteAddress, (srcs.get(i.remoteAddress) || 0) + 1);
    const qtypes = [...new Set(items.map((i) => i.qType || "other"))].join(", ");
    const anyNew = items.some((i) => i.id > open && !chatter.has(i.id) && !steps.has(i.id));
    // the name that matters: the longest one asked (resolver steps toward it don't count as names)
    const top = mostSpecific(items);
    const names = new Set(items.filter((i) => !steps.has(i.id)).map((i) => i.fullId.toLowerCase())).size;
    const chatterTags = [...new Set(items.map((i) => chatter.get(i.id)).filter(Boolean))];
    const allChatter = items.every((i) => chatter.has(i.id));
    const sel = !exp && items.some((i) => i.id === hitId);
    // the burst's own lookups; resolver chatter shown alongside isn't this probe's, so it isn't counted
    const own = items.filter((i) => !chatter.has(i.id));
    const toggle = () => { const n = new Set(expanded); if (exp) n.delete(first.id); else n.add(first.id); setExpanded(n); selectHit((own.at(-1) ?? first).id); };
    rows.push(
      <tr key={`g${first.id}`} tabIndex={sel || takeStop() ? 0 : -1} aria-selected={sel} aria-expanded={exp} aria-label={`${items.length} DNS queries, ${exp ? "expanded" : "collapsed"}`} onClick={toggle} onKeyDown={rowKeys(toggle)} className={cn("group cursor-pointer", items.some((i) => i.id === s.arrived) && "[&>td]:animate-lit")}>
        <Td sel={sel} first>
          <span className={cn("flex items-center gap-1.5 font-semibold", anyNew ? "text-bone" : "text-smoke")}>
            {anyNew ? <NewDot /> : <NilDot />}
            <span aria-hidden="true" className="-mr-0.5 -ml-1 text-smoke">
              <ChevronRight className={cn("size-3 transition-transform duration-200", exp && "rotate-90")} />
            </span>
            #{first.id}–{last.id}
          </span>
        </Td>
        <Td sel={sel}>{hmsms(first.timestamp)}</Td>
        <Td sel={sel}><TypeChip proto="dns">DNS ×{own.length || items.length}</TypeChip>{own.length > 0 && own.length < items.length && <span className="ml-1.5 text-label text-ash" title="Lookups of the bare payload id near this probe's hits: resolver chatter, kept but not counted">+{items.length - own.length} chatter</span>}</Td>
        <Td sel={sel}>{srcs.size === 1 ? <span className="font-mono text-body">{first.remoteAddress}</span> : `${srcs.size} resolvers`}</Td>
        <Td sel={sel} last>
          <DnsName i={top} />{names > 1 && <span className="text-label text-ash"> +{names - 1} {names === 2 ? "name" : "names"}</span>}<span className="text-label text-smoke"> · </span>
          <span className="text-label text-smoke">{qtypes} · {Math.max(...items.map((i) => isoMs(i.timestamp))) - Math.min(...items.map((i) => isoMs(i.timestamp)))} ms · </span>
          {allChatter && <span className="text-label text-ash">resolver chatter around {chatterTags.join(", ")} · </span>}
          <span className="font-mono text-label text-smoke">{[...srcs].sort((a, b) => b[1] - a[1]).map(([ip, n]) => `${ip} ×${n}`).join(" · ")}</span>
        </Td>
      </tr>,
    );
    if (exp) for (const i of items) rows.push(row(i, true));
  }
  const filterBar = (where: "tabs" | "bar") => (
    <>
      <ToggleGroup type="multiple" value={kinds} onValueChange={setKinds} aria-label="Show only" className="flex-none overflow-hidden rounded-[3px] border border-rule">
        {[["dns", "DNS"], ["web", "HTTP(S)"], ["smtp", "SMTP"]].map(([v, l], n) => (
          <ToggleGroupItem key={v} value={v} className={cn("h-6 rounded-none px-2.5 text-label text-smoke data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone", n > 0 && "border-l border-rule")}>{l}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      <label className={cn("flex h-6 min-w-[140px] flex-1 items-center gap-1.5 rounded-[3px] border border-rule bg-soot px-2 focus-within:border-smoke", where === "bar" && "max-[820px]:basis-full", where === "tabs" && "max-w-[340px]")}>
        <Search className="size-3.5 flex-none text-ash" strokeWidth={1.5} />
        <input aria-label={`Search ${p ? p.tag : "untagged"} hits`} value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false}
          placeholder="Search names, paths, bodies, IPs" className="h-full w-full min-w-0 bg-transparent font-mono text-body text-bone outline-none placeholder:font-sans placeholder:text-ash" />
        {q && <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="flex-none cursor-pointer text-ash hover:text-bone"><X className="size-3.5" strokeWidth={1.5} /></button>}
      </label>
      {filtering && <span className="text-label whitespace-nowrap text-ash">{results === null ? "searching…" : `${results.length}${results.length === 500 ? "+" : ""} ${results.length === 1 ? "match" : "matches"}`}</span>}
      <Button variant="ghost" size="sm" asChild className="flex-none"><a href={exportUrl(s.sel!)} download title="Every stored hit of this probe as JSON lines, raw bytes included"><Download />Export</a></Button>
    </>
  );
  const firstHit = all[all.length - 1];
  const ownCount = all.filter((i) => keyOf(i) === s.sel).length;
  return (
    <section className={cn(wrap, tabbed)} aria-label={`Probe ${s.sel === UNTAGGED ? "No tag" : s.sel}`}>
      <Head s={s} />{p && <ProbeTabs s={s} p={p} right={<div className="ml-auto hidden min-w-0 flex-1 items-center justify-end gap-2.5 pl-6 @min-[900px]/probe:flex">{filterBar("tabs")}</div>} />}
      <div id={p ? "probe-panel" : undefined} role={p ? "tabpanel" : undefined} aria-labelledby={p ? "probe-tab-hits" : undefined} className="flex min-h-0 flex-col">
      {/* the filters sit in the tab strip when the pane is wide; below it otherwise (and on Unregistered) */}
      <div className={cn("flex flex-none flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-rule-2 py-1.5 pr-5 pl-6 max-[820px]:px-3.5", p && "@min-[900px]/probe:hidden")}>{filterBar("bar")}</div>
      <div className="max-h-[min(28vh,212px)] min-h-0 overflow-auto max-[820px]:max-h-none [@media(max-height:900px)]:max-h-[min(22vh,160px)]">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col className="w-[112px] max-[820px]:w-[84px]" /><col className="w-[116px] max-[820px]:w-[96px]" /><col className="w-[106px] max-[820px]:w-[96px]" /><col className="w-[218px] max-[820px]:w-auto" /><col className="max-[820px]:w-0" /></colgroup>
          <thead>
            <tr>{["#", "Time (UTC)", "Type", "Source", "Request"].map((t, i) => (
              <th key={t} scope="col" className={cn("sticky top-0 z-[1] border-b border-rule bg-soot px-2.5 py-[5px] text-left text-label font-semibold tracking-[.03em] text-smoke", i === 0 && "pl-6 max-[820px]:pl-3.5", i === 4 && "max-[820px]:hidden")}>{t}</th>
            ))}</tr>
          </thead>
          <tbody onKeyDown={(e) => {
            // one tab stop for the table; arrows move between rows (j/k work anywhere)
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            const trs = [...e.currentTarget.querySelectorAll<HTMLTableRowElement>("tr[tabindex]")];
            const at = trs.indexOf(document.activeElement as HTMLTableRowElement);
            const el = trs[at + (e.key === "ArrowDown" ? 1 : -1)];
            if (at === -1 || !el) return;
            e.preventDefault(); el.focus(); el.click();
          }}>
            {rows}
            {filtering && results?.length === 0 && <tr><td colSpan={5} className="px-6 py-3 text-body text-ash">No stored hits match. Search covers names, request lines, raw requests and source IPs.</td></tr>}
          </tbody>
        </table>
        {!filtering && !s.olderDone[s.sel] && ownCount < (p ? p.hits : s.untagged?.hits ?? 0) && (
          <button type="button" onClick={() => loadOlder(s.sel!, all[all.length - 1].id).catch((e) => toast((e as Error).message, true))}
            className="w-full cursor-pointer border-b border-rule-2 px-6 py-1.5 text-left text-body text-smoke hover:bg-hover hover:text-bone">
            Load older hits <span className="text-ash">({ownCount} of {p ? p.hits : s.untagged?.hits} shown)</span>
          </button>
        )}
        <div className="flex items-center gap-2.5 px-6 py-1.5 text-label text-ash">
          <hr className="flex-1 border-0 border-t border-rule-2" />
          {p ? `Planted ${dayOrTime(p.plantedAt)} UTC · first hit ${hmsms(firstHit.timestamp)}` : `First hit ${dayOrTime(firstHit.timestamp)} UTC · ${plural(hits.length, "hit")}`}
          <hr className="flex-1 border-0 border-t border-rule-2" />
        </div>
      </div>
      </div>
      {hitId != null && <HitDetail id={hitId} />}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleStop, CopyPlus, Bell, BellOff, ChevronRight, Copy, Download, Ellipsis, Eraser, FileText, Pencil, RotateCcw, Search, Trash2, Archive, X } from "lucide-react";
import { useApp, getState, cloneProbe, keyOf, markSeen, selectHit, patchProbe, saveRule, fetchRule, fetchTrigger, fetchReport, chatterOf, setTab, unreadFor, loadOlder, searchHits, exportUrl, deleteProbe, clearProbe, restoreProbe, PROBE_TABS, type AppState, type ProbeTab } from "@/store";
import { lastClearFor, probeState } from "@/lib/probeState";
import { dnsSteps, mostSpecific } from "@/lib/dns";
import { stageOf, stageShort } from "@/lib/stage";
import { uaShort } from "@/lib/headers";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UNTAGGED, type Interaction, type Probe } from "@/lib/types";
import { ago, dayKey, dayLabel, dayOrTime, exact, hmParts, idRange, isoMs, newestFirst, plural, settled, zoneName } from "@/lib/format";
import { groupHits } from "@/lib/raw";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ClaudeMark, LineForm, NewDot, NilDot, TechniqueMark, TypeChip } from "./bits";
import { CardOnCrew, NameEditor, startRename, stopAnswering, useProbeSnap, useTabsView } from "./ProbeTabs";
import { HitDetail } from "./HitDetail";
import { HttpRuleTab } from "./HttpRule";
import { CrewMark } from "./Mark";
import { crewOf, lookOf, STRAY_LOOK } from "@/lib/crew";
import { PayloadCopy, PayloadRows } from "./Composer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { shownId, tagged } from "@/lib/kit";
import { hostedFile } from "@/lib/plant";
import { useDisplay, type HitsHeight } from "@/lib/display";
import { typingOrModal } from "@/lib/shortcuts";
import { Ultra } from "@/components/Ultra";

// Settings > Display > Hits list. Short keeps the open hit's detail in view on a laptop (docs/DESIGN.md);
// taller sizes are for reviewing a session's hits later.
const HITS_HEIGHT: Record<HitsHeight, string> = {
  short: "max-h-[min(28vh,212px)] [@media(max-height:900px)]:max-h-[min(22vh,160px)]",
  tall: "max-h-[min(46vh,420px)] [@media(max-height:900px)]:max-h-[min(38vh,300px)]",
  half: "max-h-[58vh] [@media(max-height:900px)]:max-h-[50vh]",
};

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
  const [clr, setClr] = useState(false);
  const [resetRule, setResetRule] = useState(true);
  // the trigger and note, open or folded, per probe for the session
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const notesOpen = !!s.sel && openNotes.has(s.sel);
  const setNotesOpen = (v: boolean) => setOpenNotes((o) => { const n = new Set(o); if (v) n.add(s.sel!); else n.delete(s.sel!); return n; });
  const plantLine = usePlant(s.sel && s.sel !== UNTAGGED ? s.probes.get(s.sel) : undefined);
  const { names, editing, editingAt } = useProbeSnap(); // your name for the probe, from its tab or list row
  // two fixed rows: who the probe is and its actions on the first (one line, the target truncates),
  // what to paste on the second, so the header is the same height from probe to probe
  const cls = "flex h-[52px] min-w-0 items-center gap-3.5 border-b border-rule pr-5 pl-6 max-[820px]:h-auto max-[820px]:flex-wrap max-[820px]:gap-2 max-[820px]:px-3.5 max-[820px]:py-2.5";
  if (s.sel === UNTAGGED) {
    return (
      <div className={cls}>
        <span className="text-headline font-semibold">No tag</span>
        <span className="text-body text-smoke">Hits that carry no tag · <b className="font-semibold text-bone">{s.untagged?.hits ?? 0}</b> hits</span>
        {!!s.untagged?.hits && <div className="ml-auto flex gap-1.5"><Button variant="quiet" onClick={() => setClr(true)}><Eraser />Clear hits…</Button></div>}
        <ClearDialog tag={null} count={s.untagged?.hits ?? 0} open={clr} onOpenChange={setClr} />
      </div>
    );
  }
  const p = s.probes.get(s.sel!)!;
  const st = probeState(p);
  const canDelete = st === "retired" || st === "late" || st === "unplanted";
  const fail = (e: unknown) => toast((e as Error).message, true);
  const mute = () => patchProbe(p.tag, { muted: !p.muted }).then(() => toast(p.muted ? `Alerts on for ${p.tag}` : `Muted ${p.tag}: no Discord posts, hits still recorded`), fail);
  return (
    <div className="min-w-0 border-b border-rule">
    {/* the probe in one line: what it is and whether it listens, the payloads to copy, the report;
        everything else is in the menu */}
    <div className={cn(cls, "border-b-0")}>
      <span className="flex min-w-0 flex-none items-center gap-2.5 font-mono text-headline whitespace-nowrap min-[821px]:max-w-[45%]">
        <CardOnCrew s={s} k={p.tag} hint="Double-click the tag to rename">
          <CrewMark size={26} {...(st === "unplanted" ? STRAY_LOOK : lookOf(crewOf(s.probes), p.tag))} state={p.retiredAt || st === "unplanted" ? "doze" : "wink"} />
        </CardOnCrew>
        {/* a double-click (or F2) renames it right here, where you asked */}
        {editing === p.tag && editingAt === "head" ? <NameEditor k={p.tag} className="h-7 w-[220px] text-title" />
          : names[p.tag] ? (
            <span className="flex min-w-0 items-baseline gap-2" onDoubleClick={() => startRename(p.tag, "head")} title={`${p.tag}: double-click to rename`}>
              <span className="truncate font-sans font-semibold">{names[p.tag]}</span><span className="truncate text-title text-smoke"><Ultra text={p.tag} /></span>
            </span>
          ) : <span className="truncate" title={`${p.tag}: double-click to give it your own name`} onDoubleClick={() => startRename(p.tag, "head")}><Ultra text={p.tag} /></span>}
        {p.plantedBy === "claude" && <ClaudeMark className="size-4" />}
      </span>
      {st === "unplanted" ? <Chip grey>not planted</Chip>
        : p.retiredAt ? <>
            <span className="flex items-center gap-1.5 text-body whitespace-nowrap text-ash" title="Out of the active list. New hits on this tag are still recorded."><LineForm kind="off" className="w-4" />{st === "late" ? "Retired · late hit" : "Retired"}</span>
            {p.httpRule && s.status?.edge?.state === "running" && (
              <Button variant="ghost" size="sm" className="h-6 flex-none px-1.5 text-caution-ink hover:text-caution-ink" title={`Retired, but its rule is still served to anyone who finds the payload: ${p.httpRule.line}. This resets it to the default reply (Undo in the message).`}
                onClick={() => stopAnswering([p.tag])}><CircleStop />Stop answering</Button>
            )}
          </>
        : <span className="flex items-center gap-1.5 text-body font-[550] whitespace-nowrap text-bone" title={`Planted ${dayOrTime(p.plantedAt)} ${zoneName()} and listening: a callback shows up here within seconds`}><LineForm kind="live" signal="listen" seed={p.tag} className="w-4" />Armed</span>}
      {st !== "unplanted" && p.technique !== "callback" && <TechniqueMark technique={p.technique} className="text-body font-[550]" />}
      {!!p.muted && <BellOff aria-label="Discord alerts muted" className="size-3.5 flex-none text-ash" strokeWidth={1.5} />}
      <span className={cn("min-w-0 truncate text-body", p.target ? "text-smoke" : "text-ash")} title={[p.target, p.note && `Note: ${p.note}`].filter(Boolean).join("\n") || undefined}>{p.target ? <Ultra text={p.target} /> : "No target noted"}</span>
      <div className="ml-auto flex flex-none items-center gap-1.5">
        <Button variant="quiet" title={`Markdown for a bug report: summary, ${p.triggerBytes ? "the triggering request, " : ""}timeline, sources, decoded exfil and the first web request`}
          onClick={() => fetchReport(p.tag).then((md) => copy(md, `${p.tag} report`), fail)}><FileText />Copy report</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`More for ${p.tag}`} title="Edit, mute, clear, retire"><Ellipsis /></Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setEdit(true)}><Pencil />Edit target, note, trigger…</DropdownMenuItem>
            {st !== "unplanted" && <DropdownMenuItem onSelect={() => void cloneProbe(p.tag)}><CopyPlus />Clone probe…</DropdownMenuItem>}
            {s.status?.discord.available && <DropdownMenuItem onSelect={mute}>{p.muted ? <><Bell />Unmute Discord alerts</> : <><BellOff />Mute Discord alerts</>}</DropdownMenuItem>}
            {!!p.hits && <DropdownMenuItem onSelect={() => setClr(true)}><Eraser />Clear hits…</DropdownMenuItem>}
            {st !== "unplanted" && <DropdownMenuItem onSelect={() => (p.retiredAt ? patchProbe(p.tag, { retired: false }).then(() => toast(`Restored ${p.tag}`), fail) : setRetire(true))}>{p.retiredAt ? <><RotateCcw />Restore</> : <><Archive />Retire…</>}</DropdownMenuItem>}
            {canDelete && <><DropdownMenuSeparator /><DropdownMenuItem destructive onSelect={() => setDel(true)}><Trash2 />Delete…</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {/* the second row: the line to plant (when the saved answer has one), then the callbacks; the
        trigger and note, when there are any, at its end */}
    <div className="flex min-w-0 items-center gap-x-5 gap-y-1.5 pr-6 pb-3 pl-[60px] empty:hidden max-[820px]:flex-wrap max-[820px]:px-3.5">
      {plantLine && <PlantLine p={p} line={plantLine} />}
      <PayloadCopy tag={p.tag} brief={!!plantLine} />
      {(!!p.triggerBytes || !!p.note) && (
        <Button variant="ghost" size="sm" className="ml-auto flex-none text-smoke" aria-expanded={notesOpen} onClick={() => setNotesOpen(!notesOpen)}
          title={p.triggerBytes ? "The request that made the target call back, and your note" : "Your note on this probe"}>
          <ChevronRight className={cn("transition-transform", notesOpen && "rotate-90")} />
          {[p.triggerBytes ? `Trigger · ${p.triggerBytes < 1024 ? `${p.triggerBytes} bytes` : `${(p.triggerBytes / 1024).toFixed(1)} KB`}` : null, p.note ? "Note" : null].filter(Boolean).join(" · ")}
        </Button>
      )}
    </div>
    {notesOpen && (!!p.triggerBytes || !!p.note) && <TriggerAndNote p={p} onEdit={() => setEdit(true)} />}
    <PayloadRows compact tag={p.tag} className="pr-6 pb-3 pl-[60px] max-[820px]:px-3.5" />
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
      <ClearDialog tag={p.tag} count={p.hits} retired={!!p.retiredAt} open={clr} onOpenChange={setClr} />
      <AlertDialog open={retire} onOpenChange={setRetire}>
        <AlertDialogContent className="max-w-[440px] border-rule bg-soot-1">
          <Button variant="ghost" size="icon-sm" aria-label="Close" className="absolute top-3 right-3 text-smoke" onClick={() => setRetire(false)}><X /></Button>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire {p.tag}?</AlertDialogTitle>
            <AlertDialogDescription>It moves to Retired (in the probe list and under All probes). Its hits stay, and new hits on this tag are still recorded.</AlertDialogDescription>
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

// What Claude (or you) sent to make the target call back, and the note, read in place: the trigger is
// text someone pasted or recorded, so it's shown inert, exactly as stored
function TriggerAndNote({ p, onEdit }: { p: Probe; onEdit: () => void }) {
  const [trigger, setTrigger] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setTrigger(null); setErr(null);
    if (!p.triggerBytes) return;
    let live = true;
    fetchTrigger(p.tag).then((t) => { if (live) setTrigger(t); }, (e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [p.tag, p.triggerBytes]);
  return (
    <div className="flex min-w-0 flex-col gap-2 pr-6 pb-3 pl-[60px] max-[820px]:px-3.5">
      {p.note && <p className="max-w-[90ch] text-body whitespace-pre-wrap text-smoke"><span className="text-label font-[550] tracking-[.03em] text-ash">Note </span><span className="text-bone">{p.note}</span></p>}
      {!!p.triggerBytes && (
        <div className="flex min-w-0 flex-col rounded-[3px] border border-rule bg-well">
          <div className="flex h-8 flex-none items-center gap-2 border-b border-rule-2 pr-1 pl-3">
            <b className="text-body font-[650]">Trigger request</b>
            <span className="truncate text-label text-ash">{p.plantedBy === "claude" ? "recorded by Claude" : "saved with the probe"} · in the report</span>
            <span className="ml-auto flex flex-none items-center">
              <Button variant="ghost" size="sm" disabled={trigger === null} onClick={() => trigger !== null && copy(trigger, "trigger request")}><Copy />Copy</Button>
              <Button variant="ghost" size="sm" onClick={onEdit}><Pencil />Edit</Button>
            </span>
          </div>
          <pre className="m-0 max-h-[220px] overflow-auto px-3 py-2 font-mono text-body leading-[1.125rem] whitespace-pre text-bone">{err ? <span className="text-bad">Couldn't load it: {err}</span> : trigger ?? "Loading…"}</pre>
        </div>
      )}
    </div>
  );
}

// The line to put in the target, from the saved answer (a hosted file's stylesheet line, DOCTYPE line,
// img tag…), so what to paste is in view without opening the Answer tab. The draft's own line is on
// that tab; this one is what the edge serves now.
function usePlant(p: Probe | undefined): [string, string] | null {
  const host = useApp((x) => x.status?.payload?.host);
  const v = p?.httpRule?.mode === "file" && !p.retiredAt ? p.httpRule.version : null;
  const [line, setLine] = useState<[string, string] | null>(null);
  useEffect(() => {
    setLine(null);
    if (v == null || !host || !p) return;
    let live = true;
    fetchRule(p.tag).then((r) => { if (live && r.active?.rule.mode === "file") setLine(hostedFile(r.active.rule, p.tag, host).plant); }, () => {});
    return () => { live = false; };
  }, [p?.tag, v, host]); // eslint-disable-line react-hooks/exhaustive-deps
  return line;
}

function PlantLine({ p, line }: { p: Probe; line: [string, string] }) {
  const host = useApp((x) => x.status?.payload?.host);
  // display only: the payload host recedes to the tag (its id and domain are the same for every
  // payload), so the line's shape and path stay in view; Copy and the tooltip carry it exactly
  const shown = host ? line[0].split(tagged(p.tag, host)).join(`${p.tag}-…`) : line[0];
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="flex-none text-label text-ash" title={`What to put in the target: the ${line[1]} for the saved answer (v${p.httpRule?.version})`}>Plant</span>
      <code className="min-w-0 truncate font-mono text-body text-bone" title={line[0]}>{shown}</code>
      <Button variant="ghost" size="icon-sm" className="flex-none" aria-label={`Copy the ${line[1]}`} onClick={() => copy(line[0], line[1])}><Copy /></Button>
    </span>
  );
}

// DNS evidence is the name that was asked for: show the labels before the id, tag highlighted.
export function DnsName({ i }: { i: Interaction }) {
  // the labels before the id, and how the last joins it: "." (fetch.<id>) or "-" (fetch-<id>)
  const before = i.fullId.endsWith(i.uniqueId) ? i.fullId.slice(0, -i.uniqueId.length) : "";
  const sep = before.endsWith("-") ? "-" : ".";
  const prefix = before.replace(/[.-]$/, "");
  const labels = prefix ? prefix.split(".") : [];
  const short = shownId(i.uniqueId);
  if (!labels.length) return <span className="font-mono text-body text-smoke">{short} <span className="font-sans text-label text-ash">(bare id)</span></span>;
  return (
    <span className="font-mono text-body">
      {labels.map((l, n) => <span key={n}>{n > 0 && "."}{l === i.tag ? <em className="bg-mark px-px text-bone not-italic">{l}</em> : <span className="text-bone">{l}</span>}</span>)}
      <span className="text-smoke">{sep}{short}</span>
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
      {/* the version is in the tooltip: the cell's room goes to the stage and what followed */}
      {!/^ HTTP\/1\.[01]$/.test(version) && <span className="text-ash">{version}</span>}<span className="text-ash">{rest}</span>
    </span>
  );
}

function rowKeys(fn: () => void) {
  return (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
}

// a table time: the minute in the row's ink, the seconds quieter (phones show the minute only)
function TimeCell({ ts }: { ts: string }) {
  const [hm_, ss, ampm] = hmParts(ts);
  return <>{hm_}<span className="text-ash max-[820px]:hidden">{ss}</span>{ampm}</>;
}

// the Request cell in two parts: what arrived, then what the edge did with it right after. When the
// cell runs out of room the request gives way first (the details shrink at a fifth of its rate), so a
// long URL never pushes the outcome out of view.
function Split({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-baseline gap-3">
      <span className="min-w-[10ch] flex-[0_1_auto] truncate">{left}</span>
      {right && <span className="flex min-w-0 flex-[0_0.2_auto] items-baseline gap-2 overflow-hidden text-label whitespace-nowrap">{right}</span>}
    </span>
  );
}

// a lookup of just <tag>-<id>: routine (a resolver, a client resolving the host). Labels beyond the tag
// carry data, so those rows keep full ink.
const plainDns = (i: Interaction) => {
  if (i.protocol !== "dns" || !i.fullId.endsWith(i.uniqueId)) return false;
  const labels = i.fullId.slice(0, -i.uniqueId.length).replace(/[.-]$/, "").split(".").filter(Boolean);
  return labels.length <= 1 && (!labels[0] || labels[0].toLowerCase() === (i.tag ?? "").toLowerCase());
};

// the labels before the payload id, for naming a longer lookup compactly
const labelsOf = (fullId: string) => fullId.split(".").slice(0, -3).join(".") || fullId;

function HitRow({ i, open, sel, arrived, child, chatter, inProbe, step, self, stop, after, onClick }: { i: Interaction; open: number; sel: boolean; arrived: boolean; child?: boolean; chatter?: string; inProbe?: boolean; step?: string; self?: "box" | "mine"; stop?: boolean; after?: { id: number; ms: number }; onClick: () => void }) {
  const isNew = i.id > open && !chatter && !step;
  const quiet = !!chatter || !!step;
  const web = i.protocol === "http" || i.protocol === "https";
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => { if (sel && settled()) ref.current?.scrollIntoView({ block: "nearest" }); }, [sel]);
  return (
    <tr ref={ref} data-hit={i.id} tabIndex={sel || stop ? 0 : -1} aria-selected={sel} onClick={(e) => { e.stopPropagation(); onClick(); }} onKeyDown={rowKeys(onClick)}
      className={cn("group cursor-pointer", arrived && "[&>td]:animate-lit", child && "[&>td]:bg-child [&>td:first-child]:pl-11", (quiet || self) && !sel && "[&>td]:text-smoke [&_.text-bone]:text-smoke")}>
      <Td sel={sel} first><span className={cn("flex items-center gap-1.5 font-semibold", isNew ? "text-bone" : "text-smoke")}>{isNew ? <NewDot /> : <NilDot />}#{i.id}</span></Td>
      <Td sel={sel} title={exact(i.timestamp)}><TimeCell ts={i.timestamp} /></Td>
      <Td sel={sel}><TypeChip proto={i.protocol}>{i.protocol === "dns" ? `DNS ${i.qType || "other"}` : undefined}</TypeChip></Td>
      <Td sel={sel} className="font-mono text-body">
        <span className={cn(web && !self && !sel && "font-[550] text-bone", plainDns(i) && !sel && "text-smoke")} title={i.remoteAddress}>{i.remoteAddress}</span>
        {/* phones: the Request column is hidden, so what arrived rides under the source */}
        <span className="hidden truncate text-label text-smoke max-[820px]:block">{i.protocol === "dns" ? i.fullId : reqOf(i.summary).replace(/ HTTP\/[\d.]+$/, "")}{stageShort(i) ? <span className="font-sans"> · {stageShort(i)}</span> : null}</span>
      </Td>
      <Td sel={sel} last>
        <Split
          left={web ? <RequestLine line={reqOf(i.summary)} /> : i.protocol === "smtp" ? <span className="font-mono text-body">{reqOf(i.summary)}</span> : i.protocol === "dns" ? <DnsName i={i} /> : <span className="text-label text-smoke">{i.summary}</span>}
          right={<>
            {self && <span className="flex-none font-sans" title="A self-test (the OOB box, or a source you marked as yours), not the target"><Chip grey>{self === "mine" ? "yours" : "this box"}</Chip></span>}
            {(web || i.protocol === "smtp") && stageShort(i) && <span className="min-w-0 truncate text-smoke" title={`What Colluder's edge did: ${stageOf(i)}. A redirect sent is not proof it was followed; a later hop is.`}>{stageShort(i)}</span>}
            {web && after && <span className="flex-none text-ash" title={`Same source as #${after.id}, ${after.ms} ms later: most likely the same firing`}>{after.ms < 1000 ? `+${after.ms} ms` : `+${(after.ms / 1000).toFixed(1)} s`} #{after.id}</span>}
            {web && uaOf(i.summary) && <span className="min-w-0 truncate text-ash @max-[760px]/probe:hidden" title={uaOf(i.summary)}>{uaShort(uaOf(i.summary))}</span>}
            {chatter && <span className="flex-none text-ash" title="A lookup of the bare payload id near this probe's hits: a resolver walking the name, or a client resolving the HTTPS host. Kept, never counted as new.">resolver chatter{inProbe ? "" : ` around ${chatter}`}</span>}
            {step && <span className="min-w-0 truncate text-ash" title={`The resolver asked for this on its way to ${step} (QNAME minimisation). Not exfil data.`}>resolver step toward <span className="font-mono">{labelsOf(step)}</span></span>}
          </>} />
      </Td>
    </tr>
  );
}
function Td({ children, sel, first, last, className, title }: { children: React.ReactNode; sel: boolean; first?: boolean; last?: boolean; className?: string; title?: string }) {
  return (
    <td className={cn("overflow-hidden border-b border-rule-2 px-2.5 py-1.5 text-body text-ellipsis whitespace-nowrap group-hover:bg-hover max-[820px]:px-1.5",
      first && "pl-6 max-[820px]:pl-3.5", last ? "max-[820px]:hidden" : "border-r border-r-rule-2", sel && "border-b-rule bg-soot-2 text-bone group-hover:bg-soot-2", className)} title={title}>{children}</td>
  );
}

const TAB_LABEL: Record<ProbeTab, string> = { hits: "Hits", http: "Answer" };
// what the probe answers HTTP with, in words, for the Answer tab's chip
const RULE_WORDS: Record<string, (short: string) => string> = {
  redirect: (s) => `Redirect ${s}`, file: () => "Hosted file", custom: (s) => `Custom ${s}`, preset: () => "XXE preset",
};
const answerWords = (r: { mode: string; short: string } | null | undefined) => (r ? (RULE_WORDS[r.mode]?.(r.short) ?? r.short) : "Default reply");
// the tab's note for an unsaved draft says what the draft answers: "Redirect 302, edited"
const draftWords = (r: { mode?: string; status?: number } | undefined) =>
  !r || !r.mode || r.mode === "default" ? "Default reply" : answerWords({ mode: r.mode, short: String(r.status ?? "") });

// the probe's own tabs (Hits, Answer); not the probe tabs above the pane
function PaneTabs({ s, p }: { s: AppState; p: Probe }) {
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
    <div className="flex h-10 min-w-0 items-stretch border-b border-rule pr-5 max-[820px]:h-11 max-[820px]:pr-3.5">
    <div ref={ref} role="tablist" aria-label={`Probe ${p.tag}`} onKeyDown={onKeyDown}
      className="flex h-10 flex-none items-stretch gap-7 overflow-x-auto pl-6 max-[820px]:h-11 max-[820px]:gap-5 max-[820px]:pl-3.5">
      {PROBE_TABS.map((t) => {
        const on = s.tab === t;
        const draft = t === "http" ? (s.ruleDrafts[p.tag] as { mode?: string; status?: number } | undefined) : undefined;
        return (
          <button key={t} type="button" role="tab" id={`probe-tab-${t}`} aria-selected={on} aria-controls="probe-panel" tabIndex={on ? 0 : -1}
            aria-label={t === "hits" ? `Hits, ${p.hits}` : `Answer: ${draft ? `${draftWords(draft)}, unsaved` : answerWords(p.httpRule)}`}
            onClick={() => setTab(t)}
            className={cn("relative flex flex-none cursor-pointer items-center gap-2 text-title font-[650] whitespace-nowrap text-smoke hover:text-bone focus-visible:outline-[1.5px] focus-visible:-outline-offset-2 focus-visible:outline-bone",
              on && "text-bone after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-[1px] after:bg-bone")}>
            {TAB_LABEL[t]}
            {t === "hits" ? <span className="font-normal text-smoke">{p.hits}</span>
              : draft ? <span className="font-normal" title="Unsaved changes, kept until you save or discard"><Chip grey>{draftWords(draft)}, unsaved</Chip></span>
              : p.httpRule && s.status?.edge?.state !== "running" ? <span className="font-normal opacity-70" title={`v${p.httpRule.version} saved, not served until the cutover`}><Chip grey>{answerWords(p.httpRule)}, not served yet</Chip></span>
              : <span className="font-normal" title={p.httpRule ? p.httpRule.line : "interactsh-server's standard answer"}><Chip grey>{answerWords(p.httpRule)}</Chip></span>}
            {t === "hits" && unread > 0 && <NewDot title={`${plural(unread, "new hit")} since you switched tabs`} />}
          </button>
        );
      })}
    </div>
    </div>
  );
}

export function ProbePane() {
  const s = useApp((x) => x);
  const tabsView = useTabsView();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const display = useDisplay();
  const hitsHeight = display.hits;
  const twelveHour = display.clock === "12";
  // the table's height while a hit is open: dragged (kept per browser), else the Settings preset
  const tableBox = useRef<HTMLDivElement>(null);
  const [hitsPx, setHitsPxState] = useState<number | null>(() => { try { const v = Number(localStorage.getItem("colluder.hitsPx")); return v > 0 ? v : null; } catch { return null; } });
  const setHitsPx = (v: number | null) => { setHitsPxState(v); try { if (v == null) localStorage.removeItem("colluder.hitsPx"); else localStorage.setItem("colluder.hitsPx", String(v)); } catch { /* private mode */ } };
  const [q, setQ] = useState("");
  // the protocol filter and "hide self-tests" stay as you switch probes (triaging one kind of hit
  // across several probes); the search is about one probe, so it starts empty on each
  const [kinds, setKinds] = useState<string[]>([]);
  const [hideSelf, setHideSelf] = useState(false);
  const [results, setResults] = useState<Interaction[] | null>(null);
  useEffect(() => { setExpanded(new Set()); setQ(""); setResults(null); }, [s.sel]);

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
  const boxIps = new Set(s.status?.selfIps ?? []), mineIps = new Set(s.status?.mineIps ?? []);
  const selfOf = (ip: string) => (boxIps.has(ip) ? "box" as const : mineIps.has(ip) ? "mine" as const : undefined);
  const shownBefore = filtering ? results ?? [] : all;
  // self-tests (this box, sources marked yours): the toggle shows only when this probe has one
  const selfCount = all.reduce((n, i) => n + (selfOf(i.remoteAddress) ? 1 : 0), 0);
  const hits = hideSelf && selfCount ? shownBefore.filter((i) => !selfOf(i.remoteAddress)) : shownBefore;
  const selfHidden = shownBefore.length - hits.length;

  // keyboard: a switches Hits and Answer; f searches this probe's hits. An "a" right after "b" is the
  // end of the Konami code (HitDetail's raccoon), not a tab switch.
  useEffect(() => {
    let last = "";
    const onKey = (e: KeyboardEvent) => {
      const prev = last;
      last = e.key;
      if (typingOrModal(e) || !s.sel) return;
      if (e.key === "a" && prev !== "b" && s.sel !== UNTAGGED) { e.preventDefault(); setTab(s.tab === "hits" ? "http" : "hits"); return; }
      if (e.key === "f" && (s.tab === "hits" || s.sel === UNTAGGED)) {
        const el = document.querySelector<HTMLInputElement>('section[aria-label^="Probe "] input[aria-label^="Search "]');
        if (el) { e.preventDefault(); el.focus(); el.select(); }
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [s.sel, s.tab]);

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
  // a hit's detail opens only when you pick one; picking it again, Esc or its close button folds it
  const hitId = s.hit != null && hits.some((i) => i.id === s.hit) ? s.hit : null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || getState().hit == null) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement)?.tagName) || document.querySelector("[role=dialog],[role=alertdialog],[role=menu]")) return;
      selectHit(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const wrap = "@container/probe grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,auto)_minmax(0,1fr)] overflow-hidden rounded-md border border-rule bg-soot max-[820px]:grid-rows-[auto_auto_auto] max-[820px]:overflow-visible";
  if (!s.sel) {
    return (
      <section className={wrap}>
        <div className="border-b border-rule" /><div />
        <div className="flex items-center justify-center border-t border-rule bg-soot-1 text-body text-ash">
          {!s.probes.size ? "Your probes and their callbacks will appear here." : tabsView ? <span>No probe open. <b className="font-semibold text-smoke">+</b> or <kbd className="font-mono text-smoke">p</kbd> plants one; <b className="font-semibold text-smoke">All probes</b> or <kbd className="font-mono text-smoke">o</kbd> opens one.</span> : "Select a probe to see who called."}
        </div>
      </section>
    );
  }
  const p = s.probes.get(s.sel);
  // a tagged probe gets the tab strip; Unregistered only has hits
  const tabs = p ? <PaneTabs s={s} p={p} /> : null;
  const tabbed = p ? "grid-rows-[auto_auto_minmax(0,auto)_minmax(0,1fr)]" : "";
  if (p && s.tab !== "hits") {
    return (
      <section className={cn(wrap, "grid-rows-[auto_auto_minmax(0,1fr)]")} aria-label={`Probe ${s.sel}`}>
        <Head s={s} />{tabs}<HttpRuleTab p={p} />
      </section>
    );
  }
  if (!all.length) {
    const capturing = s.status?.engine?.state === "capturing";
    const chk = s.status?.check;
    const pathBroken = !!(chk?.active && chk.last?.state === "failing");
    const pathOk = !!(chk?.active && chk.last && chk.last.state !== "failing");
    const st = p ? probeState(p) : "armed";
    const cleared = p ? lastClearFor(p, s.status?.lastClear?.at) : null;
    const own = p ?? s.untagged;
    return (
      <section className={cn(wrap, tabbed)} aria-label={`Probe ${s.sel}`}>
        <Head s={s} />{tabs}
        <div id={p ? "probe-panel" : undefined} role={p ? "tabpanel" : undefined} aria-labelledby={p ? "probe-tab-hits" : undefined} className="max-w-[72ch] px-6 py-[18px] text-body leading-[1.1875rem] text-smoke">
          {!!own?.clearedCount && <p className="mb-2.5 flex flex-wrap items-center gap-x-2 text-bone">Cleared {plural(own.clearedCount, "hit")} at {dayOrTime(own.clearedAt)} {zoneName()}.<Button variant="quiet" size="sm" onClick={() => restoreProbe(p?.tag ?? null).catch((e) => toast((e as Error).message, true))}><RotateCcw />Restore them</Button></p>}
          {/* one sentence for the probe's actual state: retired and never-planted probes aren't "waiting" */}
          {st === "retired" ? (
            <p><b className="font-semibold text-bone">Retired {dayOrTime(p!.retiredAt)} {zoneName()} · {cleared ? `no hits since the clear at ${dayOrTime(cleared)}` : "no hits stored"}.</b> New hits on this tag are still recorded and bring it back to the list. Delete it from the ⋯ menu if you're done with it.</p>
          ) : st === "unplanted" ? (
            <p><b className="font-semibold text-bone">Nobody planted {p!.tag}.</b> A request named it{cleared ? `, and its hits went in the clear at ${dayOrTime(cleared)}` : ""}. Delete it, or plant it to keep its hits under a target.</p>
          ) : (
          <>
          <p>
            <b className="font-semibold text-bone">Armed since {dayOrTime(p?.plantedAt)} {zoneName()} · {cleared ? `no hits since the clear at ${dayOrTime(cleared)}` : "no hits yet"}.</b> Waiting for the target to reach one of its payloads.{" "}
            {!capturing ? null : pathBroken
              ? <b className="font-semibold text-bone">But the outside check is failing (see the banner above): callbacks may not be reaching Colluder, so this silence proves nothing yet.</b>
              : pathOk ? `The engine is capturing and the outside check passed ${ago(Date.now() - isoMs(chk!.last!.finishedAt))}, so a callback will show up here within seconds.`
              : "The engine is capturing, so a callback will show up here within seconds."}
            {capturing ? null
              : <b className="font-semibold text-bone">The engine is not capturing right now (see the banner above), so callbacks are not being recorded until it is back.</b>}
          </p>
          <ul className="mt-2 ml-[18px] list-disc space-y-1">
            <li>Nothing at all? The fetcher may only accept certain schemes, or block unknown hosts. Try the DNS variant: many targets resolve names they never fetch.</li>
            <li>HTTPS needs the tag joined to the id with a dash (<span className="font-mono">tag-&lt;id&gt;</span>): the certificate covers one label, so a dotted prefix fails TLS and looks like silence.</li>
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
  // a web hit that lands within 10 s of another from the same source is the same firing carried on
  // (the XSLT fetch, then the command it ran): each one names the hit before it
  const after = new Map<number, { id: number; ms: number }>();
  {
    const last = new Map<string, Interaction>();
    for (const i of [...all].filter((x) => x.protocol === "http" || x.protocol === "https").sort((a, b) => isoMs(a.timestamp) - isoMs(b.timestamp) || a.id - b.id)) {
      const prev = last.get(i.remoteAddress);
      const ms = prev ? isoMs(i.timestamp) - isoMs(prev.timestamp) : Infinity;
      if (prev && ms <= 10_000) after.set(i.id, { id: prev.id, ms });
      last.set(i.remoteAddress, i);
    }
  }
  // with no row selected (a filter hid it), the first row is the table's tab stop
  const selShown = hits.some((i) => i.id === hitId);
  let stopGiven = selShown;
  const takeStop = () => { if (stopGiven) return false; stopGiven = true; return true; };
  const row = (i: Interaction, child?: boolean) => (
    <HitRow key={i.id} stop={takeStop()} child={child} i={i} chatter={chatter.get(i.id)} inProbe={s.sel !== UNTAGGED} step={steps.get(i.id)} self={selfOf(i.remoteAddress)} after={after.get(i.id)} open={open} sel={i.id === hitId} arrived={i.id === s.arrived} onClick={() => selectHit(i.id === hitId ? null : i.id)} />
  );
  const rows: React.ReactNode[] = [];
  const groups = groupHits(hits);
  // a day divider wherever the day changes, when the hits shown span more than one day: the time
  // cells keep HH:MM, and a probe that heard something days apart still reads by day
  const shownAt = (g: (typeof groups)[number]) => g.items[g.items.length - 1].timestamp;
  const days = new Set(groups.map((g) => dayKey(shownAt(g))));
  let lastDay = "";
  for (const g of groups) {
    const day = dayKey(shownAt(g));
    if (days.size > 1 && day !== lastDay) {
      lastDay = day;
      rows.push(
        <tr key={`d${day}`}>
          <th colSpan={5} scope="rowgroup" className="border-b border-rule-2 bg-soot-1 py-1 pr-2.5 pl-6 text-left text-label font-semibold tracking-[.03em] text-smoke max-[820px]:pl-3.5">{dayLabel(shownAt(g), true)}</th>
        </tr>,
      );
    }
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
    const toggle = () => { const n = new Set(expanded); if (exp) n.delete(first.id); else n.add(first.id); setExpanded(n); };
    rows.push(
      <tr key={`g${first.id}`} tabIndex={sel || takeStop() ? 0 : -1} aria-selected={sel} aria-expanded={exp} aria-label={`${items.length} DNS queries, ${exp ? "expanded" : "collapsed"}`} onClick={toggle} onKeyDown={(e) => { if ((e.key === "ArrowRight" && !exp) || (e.key === "ArrowLeft" && exp)) { e.preventDefault(); toggle(); } else rowKeys(toggle)(e); }} className={cn("group cursor-pointer", items.some((i) => i.id === s.arrived) && "[&>td]:animate-lit")}>
        <Td sel={sel} first>
          <span className={cn("flex items-center gap-1.5 font-semibold", anyNew ? "text-bone" : "text-smoke")}>
            {anyNew ? <NewDot /> : <NilDot />}
            <span aria-hidden="true" className="-mr-0.5 -ml-1 text-smoke">
              <ChevronRight className={cn("size-3 transition-transform duration-200", exp && "rotate-90")} />
            </span>
            <span title={`#${first.id} to #${last.id}`}>#{idRange(first.id, last.id)}</span>
          </span>
        </Td>
        <Td sel={sel} title={exact(first.timestamp)}><TimeCell ts={first.timestamp} /></Td>
        <Td sel={sel}><TypeChip proto="dns">DNS ×{own.length || items.length}</TypeChip></Td>
        <Td sel={sel} className={cn(items.every(plainDns) && !sel && "text-smoke")}>{srcs.size === 1 ? <span className="font-mono text-body" title={first.remoteAddress}>{first.remoteAddress}</span>
          : <span className="cursor-help underline decoration-rule decoration-dotted underline-offset-2" title={[...srcs].sort((a, b) => b[1] - a[1]).map(([ip, n]) => `${ip} ×${n}`).join("\n")}>{srcs.size} resolvers</span>}
          <span className="hidden truncate font-mono text-label text-smoke max-[820px]:block">{top.fullId}{names > 1 ? ` +${names - 1}` : ""}</span>
        </Td>
        <Td sel={sel} last>
          <Split
            left={<><DnsName i={top} />{names > 1 && <span className="text-label text-ash"> +{names - 1} {names === 2 ? "name" : "names"}</span>}</>}
            right={<>
              {own.length > 0 && own.length < items.length && <span className="flex-none text-ash" title="Lookups of the bare payload id near this probe's hits: resolver chatter, kept but not counted">+{items.length - own.length} chatter</span>}
              {allChatter && <span className="flex-none text-ash">resolver chatter around {chatterTags.join(", ")}</span>}
              <span className="flex-none text-smoke">{qtypes} · {Math.max(...items.map((i) => isoMs(i.timestamp))) - Math.min(...items.map((i) => isoMs(i.timestamp)))} ms</span>
            </>} />
        </Td>
      </tr>,
    );
    if (exp) for (const i of items) rows.push(row(i, true));
  }
  const filterBar = (
    <>
      <ToggleGroup type="multiple" value={kinds} onValueChange={setKinds} aria-label="Show only" className="flex-none overflow-hidden rounded-[3px] border border-rule">
        {[["dns", "DNS"], ["web", "HTTP(S)"], ["smtp", "SMTP"]].map(([v, l], n) => (
          <ToggleGroupItem key={v} value={v} className={cn("h-[22px] rounded-none px-2.5 text-label text-smoke data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone", n > 0 && "border-l border-rule")}>{l}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      <label className="flex h-6 max-w-[420px] min-w-[140px] flex-1 items-center gap-1.5 rounded-[3px] border border-rule bg-well px-2 focus-within:border-smoke max-[820px]:basis-full">
        <Search className="size-3.5 flex-none text-ash" strokeWidth={1.5} />
        <input aria-label={`Search ${p ? p.tag : "untagged"} hits`} value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false}
          placeholder="Search names, paths, bodies, IPs" className="h-full w-full min-w-0 bg-transparent font-mono text-body text-bone outline-none placeholder:font-sans placeholder:text-ash" />
        {q && <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="flex-none cursor-pointer text-ash hover:text-bone"><X className="size-3.5" strokeWidth={1.5} /></button>}
      </label>
      {selfCount > 0 && (
        <label className="flex flex-none cursor-pointer items-center gap-[7px] text-label text-smoke" title="Hits from this box or from sources you marked as yours">
          <Switch checked={hideSelf} onCheckedChange={setHideSelf} aria-label="Hide self-tests" />Hide self-tests{hideSelf && selfHidden > 0 && <span className="text-ash">({selfHidden} hidden)</span>}
        </label>
      )}
      {filtering && <span className="text-label whitespace-nowrap text-ash">{results === null ? "searching…" : `${hits.length}${results.length === 500 ? "+" : ""} ${hits.length === 1 ? "match" : "matches"}`}</span>}
      <Button variant="ghost" size="sm" asChild className="flex-none"><a href={exportUrl(s.sel!)} download title="Every stored hit of this probe as JSON lines, raw bytes included"><Download />Export</a></Button>
    </>
  );
  const firstHit = all[all.length - 1];
  const ownCount = all.filter((i) => keyOf(i) === s.sel).length;
  return (
    <section className={cn(wrap, tabbed, hitId == null && (p ? "grid-rows-[auto_auto_minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]"))} aria-label={`Probe ${s.sel === UNTAGGED ? "No tag" : s.sel}`}>
      <Head s={s} />{p && <PaneTabs s={s} p={p} />}
      <div id={p ? "probe-panel" : undefined} role={p ? "tabpanel" : undefined} aria-labelledby={p ? "probe-tab-hits" : undefined} className="flex min-h-0 flex-col">
      {/* the filters belong to the hits: their own row inside the Hits panel, never in the tab strip, where
          they read as more tabs */}
      <div className="flex flex-none flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-rule py-2 pr-5 pl-6 max-[820px]:px-3.5">{filterBar}</div>
      <div ref={tableBox} style={hitId != null && hitsPx != null ? { maxHeight: hitsPx } : undefined}
        className={cn("min-h-0 overflow-auto max-[820px]:max-h-none", hitId != null && hitsPx == null && HITS_HEIGHT[hitsHeight])}>
        <table className="w-full table-fixed border-collapse">
          <colgroup><col className="w-[116px] max-[820px]:w-[96px]" /><col className={twelveHour ? "w-[104px] max-[820px]:w-[72px]" : "w-[84px] max-[820px]:w-[56px]"} /><col className="w-[96px] max-[820px]:w-[76px]" /><col className="w-[148px] max-[820px]:w-auto" /><col className="max-[820px]:w-0" /></colgroup>
          <thead>
            <tr>{["#", `Time (${zoneName()})`, "Type", "Source", "Request"].map((t, i) => (
              <th key={t} scope="col" className={cn("sticky top-0 z-[1] border-b border-rule bg-band px-2.5 py-[5px] text-left max-[820px]:px-1.5 text-label font-semibold tracking-[.03em] text-smoke [&:not(:last-child)]:border-r [&:not(:last-child)]:border-r-rule-2", i === 0 && "pl-6 max-[820px]:pl-3.5", i === 4 && "max-[820px]:hidden")}>{t}</th>
            ))}</tr>
          </thead>
          <tbody onKeyDown={(e) => {
            // one tab stop for the table; arrows move between rows (j/k work anywhere), Home and End go
            // to the ends. Landing on a hit opens it; landing on a DNS burst only focuses it (Enter, → and ←
            // open and fold it), so moving past a burst never expands it.
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
            const trs = [...e.currentTarget.querySelectorAll<HTMLTableRowElement>("tr[tabindex]")];
            const at = trs.indexOf(document.activeElement as HTMLTableRowElement);
            const el = e.key === "Home" ? trs[0] : e.key === "End" ? trs.at(-1) : trs[at + (e.key === "ArrowDown" ? 1 : -1)];
            if (at === -1 || !el || el === trs[at]) return;
            e.preventDefault(); el.focus();
            const id = Number(el.dataset.hit);
            if (id) selectHit(id);
          }}>
            {rows}
            {(filtering ? results !== null : selfHidden > 0) && hits.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-3 text-body text-ash">
                {kinds.length && !q.trim() ? `No ${kinds.map((k) => (k === "web" ? "HTTP(S)" : k.toUpperCase())).join(" or ")} hits on this probe.` : "No stored hits match. Search covers names, request lines, raw requests and source IPs."}
                {selfHidden > 0 && ` ${plural(selfHidden, "self-test")} hidden.`}
                {" "}<button type="button" className="cursor-pointer text-smoke underline decoration-ash underline-offset-2 hover:text-bone" onClick={() => { setKinds([]); setQ(""); setHideSelf(false); }}>Show all</button>
              </td></tr>
            )}
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
          {p ? `Planted ${dayOrTime(p.plantedAt)} ${zoneName()} · first hit ${dayOrTime(firstHit.timestamp)}` : `First hit ${dayOrTime(firstHit.timestamp)} ${zoneName()} · ${plural(hits.length, "hit")}`}
          {hitId == null && <span className="text-smoke">· pick a hit to read it</span>}
          {(() => { const o = p ?? s.untagged; return o?.clearedCount ? <RestoreLink tag={p?.tag ?? null} count={o.clearedCount} at={o.clearedAt!} /> : null; })()}
          <hr className="flex-1 border-0 border-t border-rule-2" />
        </div>
      </div>
      {hitId != null && <Splitter box={tableBox} px={hitsPx} onChange={setHitsPx} />}
      </div>
      {hitId != null && <HitDetail id={hitId} />}
    </section>
  );
}

// The border between the hits table and the open hit: drag it, or focus it and use the arrows (Home and
// End go to the ends); a double-click goes back to the Settings preset. Not on phones, where the pane
// scrolls as one.
const MIN_TABLE = 72;
function Splitter({ box, px, onChange }: { box: React.RefObject<HTMLDivElement | null>; px: number | null; onChange: (v: number | null) => void }) {
  const max = () => Math.max(MIN_TABLE, (box.current?.closest("section")?.clientHeight ?? 800) - 260);
  const clamp = (v: number) => Math.round(Math.min(Math.max(v, MIN_TABLE), max()));
  const now = () => box.current?.getBoundingClientRect().height ?? 200;
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = now();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    const move = (m: PointerEvent) => onChange(clamp(h0 + m.clientY - y0));
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 96 : 24;
    const to = e.key === "ArrowUp" ? now() - step : e.key === "ArrowDown" ? now() + step : e.key === "Home" ? MIN_TABLE : e.key === "End" ? max() : null;
    if (to == null) return;
    e.preventDefault();
    onChange(clamp(to));
  };
  return (
    <div role="separator" aria-orientation="horizontal" aria-label="Resize the hits list" aria-valuemin={MIN_TABLE} aria-valuenow={Math.round(px ?? now())} tabIndex={0}
      title="Drag to resize; double-click for the Settings height" onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={() => onChange(null)}
      className="group relative h-0 flex-none cursor-row-resize touch-none outline-none max-[820px]:hidden">
      {/* a 12px grab zone over the seam, and a grip in the middle so it reads as draggable at rest */}
      <span className="absolute inset-x-0 -top-1.5 z-10 flex h-3 items-center justify-center group-hover:bg-rule-2/40 group-focus-visible:bg-smoke/20">
        <span className="h-[3px] w-9 rounded-full bg-rule group-hover:bg-smoke group-focus-visible:bg-bone" />
      </span>
    </div>
  );
}

// Clear one probe's hits (tag null: the hits with no tag). Soft, like a clear of everything.
function ClearDialog({ tag, count, retired, open, onOpenChange }: { tag: string | null; count: number; retired?: boolean; open: boolean; onOpenChange: (v: boolean) => void }) {
  const name = tag ?? "No tag";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[460px] border-rule bg-soot-1">
        <AlertDialogHeader>
          <AlertDialogTitle>Clear {tag ? `${tag}'s` : "the"} {plural(count, "hit")}{tag ? "" : " with no tag"}?</AlertDialogTitle>
          <AlertDialogDescription>
            They're hidden so {tag ? "the probe" : "the view"} starts clean, not deleted: Restore brings them back. {tag ? `${name} stays ${retired ? "retired" : "armed"}, and new hits show up as usual.` : "New hits with no tag show up as usual."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild><Button variant="quiet">Keep them</Button></AlertDialogCancel>
          <AlertDialogAction asChild><Button onClick={() => clearProbe(tag).catch((e) => toast((e as Error).message, true))}><Eraser />Clear {plural(count, "hit")}</Button></AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RestoreLink({ tag, count, at }: { tag: string | null; count: number; at: string }) {
  return (
    <span>
      · {plural(count, "hit")} cleared {dayOrTime(at)}{" "}
      <button type="button" className="cursor-pointer text-smoke underline decoration-ash underline-offset-2 hover:text-bone hover:decoration-bone"
        onClick={() => restoreProbe(tag).catch((e) => toast((e as Error).message, true))}>Restore</button>
    </span>
  );
}

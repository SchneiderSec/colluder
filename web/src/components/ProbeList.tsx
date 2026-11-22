import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Archive, ArrowDownToLine, Bell, BellOff, Check, ChevronDown, ChevronRight, PanelLeftClose, Rows3, Rows4, Search, Trash2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CardOnCrew, NameEditor, ProbeActions, ProbeMarks, isSilent, retireMany, marksLabel, setFolded, setFoldMode, startRename, useFoldMode, useProbeSnap } from "./ProbeTabs";
import { useApp, select, unreadFor, setDiscord, lateHit, deleteProbe, setPlanting, save, type AppState } from "@/store";
import { probeState, quietLine } from "@/lib/probeState";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PROTOS, UNTAGGED, type Counts, type Probe } from "@/lib/types";
import { dayOrTime, dur, isoMs, plural, settled } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Chip, LineForm, TypeChip, useTick } from "./bits";
import { cn } from "@/lib/utils";
import { CrewMark } from "./Mark";
import { crewOf, lookOf, STRAY_LOOK } from "@/lib/crew";
import { Ultra } from "@/components/Ultra";

const activity = (p: Probe) => Math.max(isoMs(p.lastHitAt) || 0, isoMs(p.plantedAt) || 0);
// Armed probes that never heard anything fold into one "Silent" line, so the list leads with the
// ones that talked. A probe planted in the last day stays up: you're still waiting on it. The rule
// (isSilent) is shared with the tabs' "All probes" switcher.
const silent = isSilent;
const loadDense = () => { try { return JSON.parse(localStorage.getItem("colluder.listDense") ?? "false") === true; } catch { return false; } };
const loadOpen = () => { try { return JSON.parse(localStorage.getItem("colluder.silentOpen") ?? "false") as boolean; } catch { return false; } };

function CountChips({ c }: { c: Counts }) {
  return (
    <>
      {PROTOS.filter((k) => c[k]).map((k) => <TypeChip key={k} proto={k} className="text-label font-semibold">{`${k.toUpperCase()} ${c[k]}`}</TypeChip>)}
      {!!c.other && <TypeChip proto="other" className="text-label">{`OTHER ${c.other}`}</TypeChip>}
    </>
  );
}



// A probe that talked, in two lines (about 54px): who it is and when it last heard, then the target
// and what kinds of hits. Its technique, rule, who planted it and muting are the tooltip; the pane
// says the rest. The selected probe is the pane's subject, so its row keeps only the first line.
function Row({ s, p, k, stop, dense }: { s: AppState; p: Probe | (Counts & Partial<Probe>); k: string; stop?: boolean; dense?: boolean }) {
  const unread = unreadFor(s, k);
  const isU = k === UNTAGGED;
  const talking = p.hits > 0;
  const sel = s.sel === k;
  const st = isU ? "heard" : probeState(p as Probe);
  const ref = useRef<HTMLButtonElement>(null);
  // the selected probe stays in view (picked from the status bar, a link, or j/k)
  useEffect(() => { if (sel && settled()) ref.current?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const quiet = st === "retired" || st === "unplanted";
  const look = isU || st === "unplanted" ? STRAY_LOOK : lookOf(crewOf(s.probes), p.tag!);
  const one = sel || dense; // one line: the open probe (the pane says the rest), or the compact list
  const name = isU ? "No tag" : p.tag!;
  const { names, editing, editingAt } = useProbeSnap();
  const alias = names[k] || null;
  const renaming = editing === k && editingAt !== "head";
  const when = p.lastHitAt ? dayOrTime(p.lastHitAt) : "";
  const label = [alias ? `${alias} (${name})` : name, unread ? `${unread} new` : "", talking ? plural(p.hits, "hit") : "no hits", when && `last ${when}`, st === "unplanted" && "not planted", st === "late" && "retired, late hit", marksLabel(s, k)].filter(Boolean).join(", ");
  const second = isU ? <span className="truncate text-smoke">Hits that carry no tag</span>
    : st === "unplanted" ? <span className="truncate text-ash">Nobody planted it</span>
    : st === "late" ? <Chip grey>late hit · retired {dayOrTime(p.retiredAt!)}</Chip>
    : p.target ? <span className="truncate text-smoke"><Ultra text={p.target} /></span>
    : !talking ? <span className="truncate text-ash">{quietLine(p as Probe, s.status?.lastClear?.at)}</span>
    : null;
  const cls = cn("grid w-[calc(100%-14px)] flex-none cursor-pointer items-center gap-x-2.5 gap-y-[3px] rounded-[5px] border border-rule bg-soot pr-3.5 pl-3", dense ? "mb-1 grid-cols-[18px_minmax(0,1fr)_auto] py-[5px]" : "mb-1.5 grid-cols-[22px_minmax(0,1fr)_auto] py-[7px]", " text-left transition-[transform,box-shadow,border-color] duration-500 ease-out-expo hover:bg-hover max-[820px]:min-h-11",
        sel && "border-ash bg-soot-2 hover:bg-soot-2", !!unread && !sel && "translate-x-3 border-amber shadow-[0_4px_12px_rgb(0_0_0/0.28)]", isU && "mt-1.5", s.lit === k && "animate-lit");
  const body = (
    <>
      {/* the probe's colluder: its coat tells probes apart at a glance; amber eyes mean new hits */}
      <span aria-hidden="true" className={cn("flex", !one && "row-span-2")}>
        <CardOnCrew s={s} k={k} side="right" hint="Double-click the row to rename · right-click for more">
          <CrewMark size={dense ? 18 : 22} {...look} state={quiet || isU ? "doze" : "wink"} unread={!!unread} className={cn(st === "retired" && "opacity-70")} />
        </CardOnCrew>
      </span>
      <span className={cn("flex min-w-0 items-center gap-2 font-mono leading-5", dense ? "text-body" : "text-title", quiet ? "text-smoke" : talking ? "font-[550] text-bone" : "text-bone", isU && "font-sans font-semibold")}>
        <ProbeMarks s={s} k={k} />
        {renaming ? <NameEditor k={k} />
          : alias ? <><span className="min-w-0 truncate font-sans font-semibold">{alias}</span><span className="min-w-[4ch] shrink-[2] truncate font-mono text-label font-normal text-ash">{isU ? "No tag" : p.tag}</span></>
          : <span className="truncate">{isU ? "No tag" : <Ultra text={p.tag ?? ""} />}</span>}
        {talking && <span className="flex-none font-sans text-label font-normal whitespace-nowrap text-smoke">{plural(p.hits, "hit")}</span>}
        {!!unread && <span className="flex-none font-sans"><Chip>{unread} new</Chip></span>}
        {!isU && !!p.muted && <BellOff aria-hidden="true" className="size-3 flex-none text-ash" strokeWidth={1.5} />}
      </span>
      {/* right: is it listening (a moving line) or not (a still, dim one), then when it last heard */}
      {st === "unplanted" ? <span className="justify-self-end"><Chip grey>not planted</Chip></span>
        : isU ? <span className="text-right text-body whitespace-nowrap text-bone">{when}</span>
        : st === "armed" || st === "heard" ? (
          <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            <LineForm kind="live" signal="listen" seed={p.tag} className="w-4 text-bone" />
            {talking ? <span className="text-body text-bone">{when}</span> : <span className="text-label text-ash">silent {dur(Date.now() - isoMs(p.plantedAt))}</span>}
          </span>
        ) : (
          <span className="flex items-center justify-end gap-1.5 text-label whitespace-nowrap text-ash">
            <LineForm kind="off" className="w-4" />
            <span className={cn("text-body", st === "late" ? "text-bone" : "text-ash")}>{talking ? when : dayOrTime(p.retiredAt)}</span>
          </span>
        )}
      {!one && (
        <span className="col-span-2 col-start-2 flex h-4 min-w-0 items-center gap-3 text-label">
          <span className="flex min-w-0 flex-1 items-center">{second}</span>
          {talking && <span className="flex flex-none items-center gap-2.5"><CountChips c={p} /></span>}
        </span>
      )}
    </>
  );
  return (
    <ProbeActions s={s} k={k}>
      {renaming ? <div data-key={k} className={cls}>{body}</div> : (
        <button ref={ref} type="button" role="option" aria-selected={sel} aria-label={label} data-key={k} onClick={() => select(k)} onDoubleClick={(e) => { e.preventDefault(); startRename(k); }} tabIndex={sel || stop ? 0 : -1} className={cls}>{body}</button>
      )}
    </ProbeActions>
  );
}

// Retired probes (and tags nobody planted that have no hits left) can go for good, all at once
function DeleteRetired({ tags, hits, open, onOpenChange }: { tags: string[]; hits: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    let n = 0, gone = 0;
    try { for (const t of tags) { n += await deleteProbe(t); gone++; } toast(`Deleted ${plural(gone, "probe")} and ${plural(n, "stored hit")}`); }
    catch (e) { toast(`Deleted ${gone} of ${tags.length}: ${(e as Error).message}`, true); }
    finally { setBusy(false); onOpenChange(false); }
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[460px] border-rule bg-soot-1">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {plural(tags.length, "retired probe")}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes them for good, with their {plural(hits, "stored hit")} and rule history. Restore can't bring them back. Retired probes that got a late hit stay, since that hit may be the finding.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild><Button variant="quiet">Keep them</Button></AlertDialogCancel>
          <AlertDialogAction asChild><Button variant="destructive" disabled={busy} onClick={(e) => { e.preventDefault(); run(); }}>{busy ? "Deleting…" : `Delete ${plural(tags.length, "probe")}`}</Button></AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// A probe with nothing to report, in one line: silent armed probes and retired ones. Raccoon, tag,
// marks, name, target, and when; the longer story is the card (hover) and the menu (right-click).
function Brief({ s, p }: { s: AppState; p: Probe }) {
  const sel = s.sel === p.tag;
  const st = probeState(p);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (sel && settled()) ref.current?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const retired = !!p.retiredAt;
  const when = retired ? (p.hits ? `${plural(p.hits, "hit")} · retired ${dayOrTime(p.retiredAt)}` : `retired ${dayOrTime(p.retiredAt)}`) : `silent ${dur(Date.now() - isoMs(p.plantedAt))}`;
  const look = st === "unplanted" ? STRAY_LOOK : lookOf(crewOf(s.probes), p.tag);
  const { names, editing, editingAt } = useProbeSnap();
  const alias = names[p.tag] || null;
  const renaming = editing === p.tag && editingAt !== "head";
  const label = [alias ? `${alias} (${p.tag})` : p.tag, when, marksLabel(s, p.tag), p.muted && "Discord alerts muted"].filter(Boolean).join(", ");
  const cls = cn("mb-1 flex w-[calc(100%-14px)] min-w-0 cursor-pointer items-center gap-2.5 rounded border border-rule bg-soot py-[6px] pr-4 pl-3 text-left hover:bg-hover max-[820px]:min-h-11", sel && "border-ash bg-soot-2 hover:bg-soot-2", s.lit === p.tag && "animate-lit");
  return (
    <ProbeActions s={s} k={p.tag}>
      {renaming ? (
        <div data-key={p.tag} className={cls}>
          <CrewMark size={18} {...look} state={retired || st === "unplanted" ? "doze" : "wink"} className={cn(retired && "opacity-70")} />
          <NameEditor k={p.tag} />
        </div>
      ) : (
        <button ref={ref} type="button" role="option" aria-selected={sel} aria-label={label} data-key={p.tag} onClick={() => select(p.tag)} onDoubleClick={(e) => { e.preventDefault(); startRename(p.tag); }} tabIndex={sel ? 0 : -1} className={cls}>
          <CardOnCrew s={s} k={p.tag} side="right" hint="Double-click the row to rename · right-click for more">
            <CrewMark size={18} {...look} state={retired || st === "unplanted" ? "doze" : "wink"} className={cn(retired && "opacity-70")} />
          </CardOnCrew>
          <ProbeMarks s={s} k={p.tag} />
          {alias ? <span className={cn("flex-none font-sans text-body font-medium", retired ? "text-smoke" : "text-bone")}>{alias} <span className="font-mono text-label font-normal text-ash">{p.tag}</span></span>
            : <span className={cn("flex-none font-mono text-body", retired ? "text-smoke" : "text-bone")}><Ultra text={p.tag} /></span>}
          <span className={cn("min-w-0 flex-1 truncate text-label", p.target ? "text-smoke" : "text-ash")}>{p.target ? <Ultra text={p.target} /> : ""}</span>
          {!!p.muted && <BellOff aria-hidden="true" className="size-3 flex-none text-ash" strokeWidth={1.5} />}
          <span className="flex-none text-label whitespace-nowrap text-ash">{when}</span>
        </button>
      )}
    </ProbeActions>
  );
}

export function ProbeList({ hidden }: { hidden?: boolean }) {
  const s = useApp((x) => x);
  const [silentOpen, setSilentOpen] = useState(loadOpen);
  const [q, setQ] = useState("");
  const [delAll, setDelAll] = useState(false);
  useTick(30000);
  const needle = q.trim().toLowerCase();
  const { names } = useProbeSnap();
  const every = [...s.probes.values()];
  // a tag nobody planted is only worth a row while it has hits
  const all = every.filter((p) => p.registered || p.hits > 0)
    .filter((p) => !needle || [p.tag, p.target, p.note, names[p.tag]].some((x) => (x ?? "").toLowerCase().includes(needle)));
  // a retired probe that hears something again comes back up: late hits are often the real bug
  const live = all.filter((p) => !p.retiredAt || lateHit(p)).sort((a, b) => activity(b) - activity(a));
  const quiet = live.filter((p) => silent(p, s));
  const active = live.filter((p) => !silent(p, s));
  // the selected probe is never hidden inside a folded group
  const showSilent = silentOpen || !!needle || quiet.some((p) => p.tag === s.sel);
  const retired = all.filter((p) => p.retiredAt && !lateHit(p)).sort((a, b) => activity(b) - activity(a));
  // Retired probes stay out of the list unless a search asks for them (like All probes in the tabs
  // view). Never hidden: one with unread hits, or the one that's open.
  const shownRetired = needle ? retired : retired.filter((p) => unreadFor(s, p.tag) || p.tag === s.sel);
  const hiddenRetired = retired.length - shownRetired.length;
  const deletable = [...retired, ...every.filter((p) => !p.registered && !p.hits)];
  const deletableHits = deletable.reduce((n, p) => n + p.hits, 0);
  const d = s.status?.discord;
  const mode = useFoldMode();
  const [dense, setDense] = useState(loadDense);
  const activeId = useId(), silentId = useId(), retiredId = useId();

  // Gate-board rerank: when a probe jumps to the top on a new hit, slide rows to their new
  // places (FLIP) instead of teleporting, so the eye can follow what moved.
  const listRef = useRef<HTMLDivElement>(null);
  const prevTops = useRef(new Map<string, number>());
  const order = live.map((p) => p.tag).join("|");
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const rows = [...root.querySelectorAll<HTMLElement>("[data-key]")];
    const next = new Map(rows.map((el) => [el.dataset.key!, el.offsetTop]));
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) for (const el of rows) {
      const before = prevTops.current.get(el.dataset.key!);
      const dy = before == null ? 0 : before - el.offsetTop;
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    }
    prevTops.current = next;
  }, [order]);

  // one tab stop per group; arrows move the selection through all of them (Home/End to the ends)
  const onListKey = (e: React.KeyboardEvent) => {
    const opts = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [])];
    const i = opts.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? opts.length - 1 : null;
    if (to == null || i === -1) return;
    e.preventDefault();
    const el = opts[Math.max(0, Math.min(opts.length - 1, to))];
    el?.focus(); el?.click();
  };
  const alerts = !d ? null : !d.available
    ? <Button variant="ghost" size="icon-sm" asChild className="text-ash" title="Discord alerts aren't set up: Settings"><a href="#settings/alerts" aria-label="Set up Discord alerts in Settings"><BellOff /></a></Button>
    : <Button variant="ghost" size="icon-sm" aria-pressed={d.enabled} aria-label="Discord alerts" className={d.enabled ? "text-bone" : "text-ash"}
        title={d.enabled ? "Discord alerts on: the first hit per probe. Click to turn off." : "Discord alerts off. Click to turn on."}
        onClick={() => setDiscord(!d.enabled).catch((e) => toast((e as Error).message, true))}>{d.enabled ? <Bell /> : <BellOff />}</Button>;
  // how the list reads (one line or two per probe) and whether opening a hit trades it for tabs
  const view = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-smoke" aria-label="List view" title={`List view: ${dense ? "one line" : "two lines"} per probe${mode === "auto" ? ", tabs while reading a hit" : ""}`}>{dense ? <Rows4 /> : <Rows3 />}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[250px]">
        <DropdownMenuItem onSelect={() => { setDense(true); save("colluder.listDense", true); }}><Check className={dense ? "" : "invisible"} />One line per probe<span className="ml-auto text-label text-ash">compact</span></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { setDense(false); save("colluder.listDense", false); }}><Check className={dense ? "invisible" : ""} />Two lines per probe<span className="ml-auto text-label text-ash">target, kinds</span></DropdownMenuItem>
        {/* phones never fold: the list sits above the pane there */}
        <DropdownMenuSeparator className="max-[820px]:hidden" />
        <DropdownMenuItem className="max-[820px]:hidden" onSelect={() => setFoldMode(mode === "auto" ? "open" : "auto")}><Check className={mode === "auto" ? "" : "invisible"} />Tabs while reading a hit</DropdownMenuItem>
        <DropdownMenuItem className="max-[820px]:hidden" onSelect={() => setFolded(true)}><PanelLeftClose />Switch to tabs now<span className="ml-auto text-label text-ash">{"\\"}</span></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <section aria-label="Probes" hidden={hidden} className="flex min-h-0 flex-col gap-1.5 max-[820px]:max-h-[48vh]">
      <div className="mr-[14px] flex h-[53px] flex-none items-center gap-2 rounded-md border border-rule bg-soot pr-3 pl-4">
        <h2 className="text-title font-[650]" title="Latest activity first">Probes</h2><span className="text-body text-smoke">{live.length}</span>
        <label className="ml-auto flex h-7 min-w-0 flex-1 basis-0 max-w-[170px] items-center gap-1.5 rounded-[3px] border border-rule bg-soot px-2 focus-within:border-smoke">
          <Search className="size-3.5 flex-none text-ash" strokeWidth={1.5} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter probes" aria-label="Filter probes by tag, target or note"
            className="min-w-0 flex-1 bg-transparent text-body text-bone outline-none placeholder:text-ash" onKeyDown={(e) => e.key === "Escape" && setQ("")} />
          {q && <button type="button" aria-label="Clear filter" className="text-ash hover:text-bone" onClick={() => setQ("")}><X className="size-3.5" /></button>}
        </label>
        <span className="flex flex-none items-center">{alerts}{view}</span>
        <Button variant={s.planting ? "secondary" : "default"} size="sm" title="Plant a new probe (p)" aria-label="Plant" onClick={() => setPlanting(!s.planting)}><ArrowDownToLine /><span className="min-[821px]:max-[1180px]:hidden">Plant</span></Button>
      </div>
      <div ref={listRef} onKeyDown={onListKey} className="flex min-h-0 flex-1 flex-col overflow-auto">
        {needle && !active.length && !retired.length && (
          <p className="px-5 py-[18px] text-body text-smoke">No probe matches “{q.trim()}”. <button type="button" className="underline decoration-ash underline-offset-2 hover:decoration-bone" onClick={() => setQ("")}>Clear the filter</button></p>
        )}
        {s.loaded && !needle && !active.length && !s.untagged?.hits && !retired.length && (
          <div className="max-w-[46ch] px-5 py-[22px] text-body leading-[1.1875rem] text-smoke">
            <b className="mb-1 block text-title font-semibold text-bone">No probes yet.</b>
            Plant one: a tag (e.g. avatar) and where you'll put it. Then copy a payload into the target. Hits show up here the moment something calls back.
          </div>
        )}
        {!!active.length && (!!quiet.length || !!retired.length) && <h3 id={activeId} className="flex min-w-0 items-center gap-1.5 mr-[14px] mb-1.5 border-b border-rule px-1 pt-2 pb-1.5 text-label font-semibold tracking-[.02em] text-smoke">Active <span className="font-medium text-ash">{active.length}</span></h3>}
        {!!active.length && (
          <div role="listbox" aria-labelledby={(!!quiet.length || !!retired.length) ? activeId : undefined} aria-label={(!!quiet.length || !!retired.length) ? undefined : "Probes"} className="flex flex-col">
            {active.map((p, i) => <Row key={p.tag} s={s} p={p} k={p.tag} stop={!s.sel && i === 0} dense={dense} />)}
          </div>
        )}
        {!!quiet.length && (
          <>
            <div className="mr-[14px] mb-1.5 flex min-w-0 items-center border-b border-rule">
              <button type="button" aria-expanded={showSilent} onClick={() => { setSilentOpen(!silentOpen); save("colluder.silentOpen", !silentOpen); }}
                title="Armed, planted over a day ago, and no hits yet"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-1 pt-2 pb-1.5 text-left text-label font-semibold tracking-[.02em] text-smoke hover:text-bone max-[820px]:min-h-11">
                {showSilent ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}<span id={silentId} className="flex-none whitespace-nowrap">Silent <span className="font-medium text-ash">{quiet.length}</span></span>
                {!showSilent && <span className="truncate font-mono text-label text-ash">{quiet.map((p) => names[p.tag] || p.tag).join(" · ")}</span>}
              </button>
              {!needle && <Button variant="ghost" size="sm" className="flex-none text-smoke" title="Retire every probe in Silent (Undo in the message)" onClick={() => retireMany(quiet.map((p) => p.tag), "silent probes")}><Archive />Retire all</Button>}
            </div>
            {showSilent && <div role="listbox" aria-labelledby={silentId} className="flex flex-col">{quiet.map((p) => <Brief key={p.tag} s={s} p={p} />)}</div>}
          </>
        )}
        <div className="flex-1" />
        {!!shownRetired.length && <h3 id={retiredId} className="flex min-w-0 items-center gap-1.5 mr-[14px] mb-1.5 border-b border-rule px-1 pt-2 pb-1.5 text-label font-semibold tracking-[.02em] text-smoke">Retired <span className="font-medium text-ash">{shownRetired.length}</span></h3>}
        {!!shownRetired.length && <div role="listbox" aria-labelledby={retiredId} className="flex flex-col">{shownRetired.map((p) => unreadFor(s, p.tag) ? <Row key={p.tag} s={s} p={p} k={p.tag} dense={dense} /> : <Brief key={p.tag} s={s} p={p} />)}</div>}
        <DeleteRetired tags={deletable.map((p) => p.tag)} hits={deletableHits} open={delAll} onOpenChange={setDelAll} />
        {!!s.untagged?.hits && <div role="listbox" aria-label="Hits with no tag" className="flex flex-col"><Row s={s} p={s.untagged} k={UNTAGGED} dense={dense} /></div>}
        {!needle && (hiddenRetired > 0 || deletable.length > 0) && (
          <div className="mr-[14px] flex min-h-8 items-center gap-2 px-1 pt-1.5 text-label text-ash">
            {hiddenRetired > 0 && <span className="min-w-0 flex-1">{plural(hiddenRetired, "retired probe")} not shown: search finds them.</span>}
            {deletable.length > 0 && <Button variant="ghost" size="sm" className="ml-auto flex-none text-ash hover:text-bone" onClick={() => setDelAll(true)}><Trash2 />Delete retired…</Button>}
          </div>
        )}
      </div>
    </section>
  );
}

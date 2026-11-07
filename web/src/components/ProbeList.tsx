import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Bell, BellOff, ChevronDown, ChevronRight, Redo2, Search, Trash2, X } from "lucide-react";
import { useApp, select, unreadFor, keyOf, setDiscord, lateHit, retiredUnread, deleteProbe, type AppState } from "@/store";
import { probeState, quietLine } from "@/lib/probeState";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PROTOS, UNTAGGED, type Counts, type Probe } from "@/lib/types";
import { dayOrTime, dur, isoMs, plural, settled } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Switch } from "@/components/ui/switch";
import { Chip, LineForm, NewDot, NilDot, TechniqueMark, TypeChip, inkClass, useTick } from "./bits";
import { cn } from "@/lib/utils";

const activity = (p: Probe) => Math.max(isoMs(p.lastHitAt) || 0, isoMs(p.plantedAt) || 0);

function Timeline({ s, k, start }: { s: AppState; k: string; start: string | null }) {
  const hits = s.list.filter((i) => keyOf(i) === k);
  const t0 = isoMs(start) || (hits.length ? isoMs(hits[hits.length - 1].timestamp) : Date.now());
  const span = Math.max(Date.now() - t0, 60000);
  return (
    <span aria-hidden="true" title={`Since ${k === UNTAGGED ? "first hit" : "planting"} ${dayOrTime(start ?? hits[hits.length - 1]?.timestamp)} UTC`}
      className="relative col-start-3 h-2.5 w-[120px]">
      <RingedTail />
      {hits.slice(0, 400).map((i) => {
        const x = Math.min(Math.max((isoMs(i.timestamp) - t0) / span, 0), 1);
        return <i key={i.id} className={cn("absolute top-0 h-2.5 w-0.5 rounded-[1px] bg-current", inkClass(i.protocol))} style={{ left: `calc(${(x * 100).toFixed(2)}% - 1px)` }} />;
      })}
    </span>
  );
}

// The raccoon's ringed tail as the time axis: tapers from planting (left) to now (right),
// with faint dark rings. Quiet enough that the protocol ticks on top stay the signal.
function RingedTail() {
  const id = useId();
  // body: 8 px deep at the root (planting), tapering to a rounded tip at "now"
  const body = "M0 1 C40 1.6 90 3 114 3.6 Q119.5 4 120 5 Q119.5 6 114 6.4 C90 7 40 8.4 0 9 Z";
  return (
    <svg viewBox="0 0 120 10" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      <defs><clipPath id={id}><path d={body} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect width="120" height="10" fill="var(--fur)" opacity="0.4" />
        {[18, 46, 72, 96].map((x) => <rect key={x} x={x} width="12" height="10" fill="var(--soot)" opacity="0.55" />)}
      </g>
    </svg>
  );
}

function CountChips({ c }: { c: Counts }) {
  return (
    <>
      {PROTOS.filter((k) => c[k]).map((k) => <TypeChip key={k} proto={k} className="text-label font-semibold">{`${k.toUpperCase()} ${c[k]}`}</TypeChip>)}
      {!!c.other && <TypeChip proto="other" className="text-label">{`OTHER ${c.other}`}</TypeChip>}
    </>
  );
}



function Row({ s, p, k, stop }: { s: AppState; p: Probe | (Counts & Partial<Probe>); k: string; stop?: boolean }) {
  const unread = unreadFor(s, k);
  const isU = k === UNTAGGED;
  const talking = p.hits > 0;
  const sel = s.sel === k;
  const st = isU ? "heard" : probeState(p as Probe);
  const ref = useRef<HTMLButtonElement>(null);
  // the selected probe stays in view (picked from the status bar, a link, or j/k)
  useEffect(() => { if (sel && settled()) ref.current?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const quiet = st === "retired" || st === "unplanted";
  return (
    <button ref={ref} type="button" role="option" aria-selected={sel} data-key={k} onClick={() => select(k)} tabIndex={sel || stop ? 0 : -1}
      className={cn("grid w-full cursor-pointer grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-[3px] border-b border-rule-2 py-[11px] pr-4 pl-5 text-left hover:bg-hover",
        sel && "bg-soot-2 hover:bg-soot-2", isU && "border-t border-t-rule", s.lit === k && "animate-lit")}>
      {unread ? <NewDot title="New hits since you last looked" /> : <NilDot />}
      <span className={cn("flex min-w-0 items-center gap-[9px] overflow-hidden font-mono text-title", talking && !quiet ? "font-[550] text-bone" : "text-smoke", isU && "font-sans font-semibold")}>
        <span className="truncate">{isU ? "No tag" : p.tag}</span>
        {talking && <b className="font-sans text-body font-medium whitespace-nowrap text-smoke">{plural(p.hits, "hit")}</b>}
        {!isU && !!p.muted && <BellOff aria-label="Discord alerts muted" className="size-3 flex-none text-ash" strokeWidth={1.5} />}
      </span>
      {/* right: the state in one word, or when it last heard something */}
      {/* right: is it listening (a moving line) or not (a still, dim one), then when it last heard */}
      {st === "unplanted" ? <span className="justify-self-end"><Chip grey>not planted</Chip></span>
        : isU ? <span className="text-right text-body whitespace-nowrap text-bone" title={p.lastHitAt ?? ""}>{dayOrTime(p.lastHitAt)}</span>
        : st === "armed" || st === "heard" ? (
          <span className="flex items-center justify-end gap-1.5 whitespace-nowrap" title="Armed: planted and listening">
            <LineForm kind="live" signal="listen" seed={p.tag} className="w-4 text-bone" />
            {talking ? <span className="text-body text-bone" title={p.lastHitAt ?? ""}>{dayOrTime(p.lastHitAt)}</span> : <span className="text-label text-smoke">Armed · silent {dur(Date.now() - isoMs(p.plantedAt))}</span>}
          </span>
        ) : (
          <span className="flex items-center justify-end gap-1.5 text-label whitespace-nowrap text-ash" title={`Retired ${dayOrTime(p.retiredAt)}: out of the active list. New hits are still recorded.`}>
            <LineForm kind="off" className="w-4" />
            {talking ? <>{st === "late" ? "Late hit " : "Retired · last hit "}<span className={cn("text-body", st === "late" ? "text-bone" : "text-ash")}>{dayOrTime(p.lastHitAt)}</span></> : <>Retired {dayOrTime(p.retiredAt)}</>}
          </span>
        )}
      <span className="col-span-2 col-start-2 flex min-w-0 items-center gap-2 text-body text-smoke">
        {!isU && st !== "unplanted" && p.technique !== "callback" && <TechniqueMark technique={p.technique} />}
        {!isU && p.plantedBy === "claude" && <Chip grey>Claude</Chip>}
        <span className="truncate">{isU ? "Hits that carry no tag" : st === "unplanted" ? "A request used this tag; nobody planted it" : p.target || "No target noted"}</span>
      </span>
      {talking ? (
        <span className="col-start-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-label">
          {!!unread && <Chip>{unread} new</Chip>}
          {st === "late" && <Chip grey>late hit · retired {dayOrTime(p.retiredAt!)}</Chip>}
          <CountChips c={p} />
        </span>
      ) : <span className="col-span-2 col-start-2 truncate text-label text-ash">{quietLine(p as Probe, s.status?.lastClear?.at)}</span>}
      {talking && <Timeline s={s} k={k} start={isU ? null : p.plantedAt ?? null} />}
      {!isU && p.httpRule && (
        <span className={cn("col-span-2 col-start-2 flex min-w-0 items-center gap-[5px] text-label", s.status?.edge?.state === "running" ? "text-smoke" : "text-ash")} title={`HTTP rule v${p.httpRule.version}: ${p.httpRule.line}`}>
          <Redo2 className="size-3 flex-none text-ash" strokeWidth={1.5} />
          <span className="truncate">{s.status?.edge?.state === "running" ? `Answers ${p.httpRule.scope} with ${p.httpRule.line}` : `Rule v${p.httpRule.version} saved, not served yet: ${p.httpRule.line}`}</span>
        </span>
      )}
    </button>
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

export function ProbeList() {
  const s = useApp((x) => x);
  const [showRetired, setShowRetired] = useState(false);
  const [q, setQ] = useState("");
  const [delAll, setDelAll] = useState(false);
  useTick(30000);
  const needle = q.trim().toLowerCase();
  const every = [...s.probes.values()];
  // a tag nobody planted is only worth a row while it has hits
  const all = every.filter((p) => p.registered || p.hits > 0)
    .filter((p) => !needle || [p.tag, p.target, p.note].some((x) => (x ?? "").toLowerCase().includes(needle)));
  // a retired probe that hears something again comes back up: late hits are often the real bug
  const active = all.filter((p) => !p.retiredAt || lateHit(p)).sort((a, b) => activity(b) - activity(a));
  const retired = all.filter((p) => p.retiredAt && !lateHit(p)).sort((a, b) => activity(b) - activity(a));
  const deletable = [...retired, ...every.filter((p) => !p.registered && !p.hits)];
  const deletableHits = deletable.reduce((n, p) => n + p.hits, 0);
  const retiredNew = retiredUnread(s);
  const d = s.status?.discord;

  // Gate-board rerank: when a probe jumps to the top on a new hit, slide rows to their new
  // places (FLIP) instead of teleporting, so the eye can follow what moved.
  const listRef = useRef<HTMLDivElement>(null);
  const prevTops = useRef(new Map<string, number>());
  const order = active.map((p) => p.tag).join("|");
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

  // one tab stop for the list; arrows move the selection (Home/End to the ends)
  const onListKey = (e: React.KeyboardEvent) => {
    const opts = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [])];
    const i = opts.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? opts.length - 1 : null;
    if (to == null || i === -1) return;
    e.preventDefault();
    const el = opts[Math.max(0, Math.min(opts.length - 1, to))];
    el?.focus(); el?.click();
  };
  return (
    <section aria-label="Probes" className="flex min-h-0 flex-col border-r border-rule max-[820px]:max-h-[48vh] max-[820px]:border-r-0">
      <div className="flex h-[42px] flex-none items-center gap-2 border-b border-rule pr-3 pl-5">
        <h2 className="text-title font-[650]" title="Latest activity first">Probes</h2><span className="text-body text-smoke">{active.length}</span>
        <label className="ml-auto flex h-7 w-[min(190px,50%)] items-center gap-1.5 rounded-[3px] border border-rule bg-soot px-2 focus-within:border-smoke">
          <Search className="size-3.5 flex-none text-ash" strokeWidth={1.5} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter probes" aria-label="Filter probes by tag, target or note"
            className="min-w-0 flex-1 bg-transparent text-body text-bone outline-none placeholder:text-ash" onKeyDown={(e) => e.key === "Escape" && setQ("")} />
          {q && <button type="button" aria-label="Clear filter" className="text-ash hover:text-bone" onClick={() => setQ("")}><X className="size-3.5" /></button>}
        </label>
      </div>
      <div ref={listRef} role="listbox" aria-label="Probes" onKeyDown={onListKey} className="flex min-h-0 flex-1 flex-col overflow-auto">
        {needle && !active.length && !retired.length && (
          <p className="px-5 py-[18px] text-body text-smoke">No probe matches “{q.trim()}”. <button type="button" className="underline decoration-ash underline-offset-2 hover:decoration-bone" onClick={() => setQ("")}>Clear the filter</button></p>
        )}
        {s.loaded && !needle && !active.length && !s.untagged?.hits && !retired.length && (
          <div className="max-w-[46ch] px-5 py-[22px] text-body leading-[1.1875rem] text-smoke">
            <b className="mb-1 block text-title font-semibold text-bone">No probes yet.</b>
            Plant one above: a tag (e.g. avatar) and where you'll put it. Then copy a payload into the target. Hits show up here the moment something calls back.
          </div>
        )}
        {active.map((p, i) => <Row key={p.tag} s={s} p={p} k={p.tag} stop={!s.sel && i === 0} />)}
        <div className="flex-1" />
        {!!retired.length && (
          <div className="flex items-center border-t border-rule-2 pr-3">
            <button type="button" aria-expanded={showRetired || !!needle} onClick={() => setShowRetired(!showRetired)} className="flex flex-1 items-center gap-1.5 px-5 py-2 text-left text-body text-smoke hover:text-bone max-[820px]:min-h-11">
              {showRetired || needle ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}Retired ({retired.length}){retiredNew > 0 && <span className="text-amber"> · {retiredNew} new</span>}
            </button>
            {(showRetired || needle) && !needle && <Button variant="ghost" size="sm" className="text-smoke" onClick={() => setDelAll(true)}><Trash2 />Delete all…</Button>}
          </div>
        )}
        {(showRetired || needle) && retired.map((p) => <Row key={p.tag} s={s} p={p} k={p.tag} />)}
        <DeleteRetired tags={deletable.map((p) => p.tag)} hits={deletableHits} open={delAll} onOpenChange={setDelAll} />
        {!!s.untagged?.hits && (
          <>
            <Row s={s} p={s.untagged} k={UNTAGGED} />
            <p className="pr-4 pb-2.5 pl-10 text-label leading-[0.9375rem] text-ash">A hit that names a tag nobody planted gets its own row, marked “not planted”.</p>
          </>
        )}
      </div>
      <div className="flex h-10 flex-none items-center gap-2.5 border-t border-rule pr-4 pl-5 text-smoke">
        <Bell className="size-3.5" strokeWidth={1.5} /><span>Discord alerts</span>
        {d && !d.available && <a href="#settings" className="text-ash underline decoration-rule underline-offset-2 hover:text-bone">Set up in Settings</a>}
        {d?.available && (
          <>
            <Switch checked={d.enabled} aria-label="Discord alerts" onCheckedChange={(v) => setDiscord(v).catch((e) => toast((e as Error).message, true))} />
            <LineForm kind={d.enabled ? "live" : "off"} signal="sparse" className={d.enabled ? "w-4 text-bone" : "w-4 text-ash"} />
            <b className="font-semibold text-bone">{d.enabled ? "On" : "Off"}</b><span className="text-ash">first hit per probe</span>
          </>
        )}
      </div>
    </section>
  );
}

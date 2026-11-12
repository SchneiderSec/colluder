import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDownToLine, Bell, BellOff, ChevronDown, ChevronRight, Redo2, Search, Trash2, X } from "lucide-react";
import { useApp, select, unreadFor, keyOf, setDiscord, lateHit, retiredUnread, deleteProbe, setPlanting, save, type AppState } from "@/store";
import { probeState, quietLine } from "@/lib/probeState";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PROTOS, UNTAGGED, type Counts, type Probe } from "@/lib/types";
import { dayOrTime, dur, isoMs, plural, settled } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Switch } from "@/components/ui/switch";
import { Chip, LineForm, TechniqueMark, TypeChip, inkClass, useTick } from "./bits";
import { cn } from "@/lib/utils";
import { CrewMark } from "./Mark";
import { aKind, crewOf, lookOf, STRAY_LOOK } from "@/lib/crew";
import { Ultra } from "@/components/Ultra";

const activity = (p: Probe) => Math.max(isoMs(p.lastHitAt) || 0, isoMs(p.plantedAt) || 0);
// Armed probes that never heard anything fold into one "Silent" line, so the list leads with the
// ones that talked. A probe planted in the last day stays up: you're still waiting on it.
const FRESH_MS = 24 * 3600_000;
const silent = (p: Probe, s: AppState) => !p.retiredAt && p.registered && p.hits === 0 && !unreadFor(s, p.tag) && Date.now() - (isoMs(p.plantedAt) || 0) > FRESH_MS;
const loadOpen = () => { try { return JSON.parse(localStorage.getItem("colluder.silentOpen") ?? "false") as boolean; } catch { return false; } };

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
  const look = isU || st === "unplanted" ? STRAY_LOOK : lookOf(crewOf(s.probes), p.tag!);
  return (
    <button ref={ref} type="button" role="option" aria-selected={sel} data-key={k} onClick={() => select(k)} tabIndex={sel || stop ? 0 : -1}
      className={cn("mb-1.5 grid w-[calc(100%-14px)] cursor-pointer grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-[3px] rounded-[5px] border border-rule bg-soot py-[10px] pr-4 pl-4 text-left transition-[transform,box-shadow,border-color] duration-500 ease-out-expo hover:bg-hover",
        sel && "border-ash bg-soot-2 hover:bg-soot-2", !!unread && !sel && "translate-x-3 border-amber shadow-[0_4px_12px_rgb(0_0_0/0.28)]", isU && "mt-1.5", s.lit === k && "animate-lit")}>
      {/* the probe's raccoon: its coat tells probes apart at a glance; amber eyes mean new hits */}
      <span className="row-span-2 self-start pt-px" title={[isU || st === "unplanted" ? "A stray: nobody planted it" : `${p.tag}'s colluder: ${aKind(look.species)}`, unread && "New hits since you last looked"].filter(Boolean).join(" · ")}>
        <CrewMark size={30} {...look} state={quiet || isU ? "doze" : "wink"} unread={!!unread} className={cn(st === "retired" && "opacity-70")} />
      </span>
      <span className={cn("flex min-w-0 items-center gap-[9px] overflow-hidden font-mono text-title", quiet ? "text-smoke" : talking ? "font-[550] text-bone" : "text-bone", isU && "font-sans font-semibold")}>
        <span className="truncate">{isU ? "No tag" : <Ultra text={p.tag ?? ""} />}</span>
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
            {talking ? <span className="text-body text-bone" title={p.lastHitAt ?? ""}>{dayOrTime(p.lastHitAt)}</span> : <span className="text-label text-ash">Armed · silent {dur(Date.now() - isoMs(p.plantedAt))}</span>}
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
        <span className={cn("truncate", !isU && st !== "unplanted" && !p.target && "text-ash")} title={isU ? "A hit that names a tag nobody planted gets its own row, marked “not planted”." : undefined}>{isU ? "Hits that carry no tag" : st === "unplanted" ? "A request used this tag; nobody planted it" : p.target ? <Ultra text={p.target} /> : "No target noted"}</span>
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

// A probe with nothing to report, in one line: silent armed probes and retired ones. Raccoon, tag,
// target, and when; the longer story (cleared when, planted by whom, its rule) is the tooltip.
function Brief({ s, p }: { s: AppState; p: Probe }) {
  const sel = s.sel === p.tag;
  const st = probeState(p);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (sel && settled()) ref.current?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const retired = !!p.retiredAt;
  const when = retired ? (p.hits ? `${plural(p.hits, "hit")} · retired ${dayOrTime(p.retiredAt)}` : `retired ${dayOrTime(p.retiredAt)}`) : `silent ${dur(Date.now() - isoMs(p.plantedAt))}`;
  const look = st === "unplanted" ? STRAY_LOOK : lookOf(crewOf(s.probes), p.tag);
  const tip = [st === "unplanted" ? p.tag : `${p.tag}'s colluder: ${aKind(look.species)}`, p.target, quietLine(p, s.status?.lastClear?.at), p.plantedBy === "claude" && "Planted by Claude", p.httpRule && `HTTP rule v${p.httpRule.version}: ${p.httpRule.line}`, p.muted && "Discord alerts muted"].filter(Boolean).join("\n");
  return (
    <button ref={ref} type="button" role="option" aria-selected={sel} data-key={p.tag} onClick={() => select(p.tag)} tabIndex={sel ? 0 : -1} title={tip}
      className={cn("mb-1 flex w-[calc(100%-14px)] min-w-0 cursor-pointer items-center gap-2.5 rounded border border-rule-2 bg-soot py-[6px] pr-4 pl-3 text-left hover:bg-hover max-[820px]:min-h-11", sel && "border-ash bg-soot-2 hover:bg-soot-2", s.lit === p.tag && "animate-lit")}>
      <CrewMark size={18} {...look} state={retired || st === "unplanted" ? "doze" : "wink"} className={cn(retired && "opacity-70")} />
      <span className={cn("flex-none font-mono text-body", retired ? "text-smoke" : "text-bone")}><Ultra text={p.tag} /></span>
      <span className={cn("min-w-0 flex-1 truncate text-label", p.target ? "text-smoke" : "text-ash")}>{p.target ? <Ultra text={p.target} /> : "No target noted"}</span>
      {!!p.muted && <BellOff aria-label="Discord alerts muted" className="size-3 flex-none text-ash" strokeWidth={1.5} />}
      <span className="flex-none text-label whitespace-nowrap text-ash">{when}</span>
    </button>
  );
}

export function ProbeList() {
  const s = useApp((x) => x);
  const [showRetired, setShowRetired] = useState(false);
  const [silentOpen, setSilentOpen] = useState(loadOpen);
  const [q, setQ] = useState("");
  const [delAll, setDelAll] = useState(false);
  useTick(30000);
  const needle = q.trim().toLowerCase();
  const every = [...s.probes.values()];
  // a tag nobody planted is only worth a row while it has hits
  const all = every.filter((p) => p.registered || p.hits > 0)
    .filter((p) => !needle || [p.tag, p.target, p.note].some((x) => (x ?? "").toLowerCase().includes(needle)));
  // a retired probe that hears something again comes back up: late hits are often the real bug
  const live = all.filter((p) => !p.retiredAt || lateHit(p)).sort((a, b) => activity(b) - activity(a));
  const quiet = live.filter((p) => silent(p, s));
  const active = live.filter((p) => !silent(p, s));
  // the selected probe is never hidden inside a folded group
  const showSilent = silentOpen || !!needle || quiet.some((p) => p.tag === s.sel);
  const retired = all.filter((p) => p.retiredAt && !lateHit(p)).sort((a, b) => activity(b) - activity(a));
  const deletable = [...retired, ...every.filter((p) => !p.registered && !p.hits)];
  const deletableHits = deletable.reduce((n, p) => n + p.hits, 0);
  const retiredNew = retiredUnread(s);
  const d = s.status?.discord;

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
    <section aria-label="Probes" className="flex min-h-0 flex-col gap-1.5 max-[820px]:max-h-[48vh]">
      <div className="mr-[14px] flex h-[53px] flex-none items-center gap-2 rounded-md border border-rule bg-soot pr-3 pl-4">
        <h2 className="text-title font-[650]" title="Latest activity first">Probes</h2><span className="text-body text-smoke">{live.length}</span>
        <label className="ml-auto flex h-7 w-[min(170px,45%)] items-center gap-1.5 rounded-[3px] border border-rule bg-soot px-2 focus-within:border-smoke">
          <Search className="size-3.5 flex-none text-ash" strokeWidth={1.5} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter probes" aria-label="Filter probes by tag, target or note"
            className="min-w-0 flex-1 bg-transparent text-body text-bone outline-none placeholder:text-ash" onKeyDown={(e) => e.key === "Escape" && setQ("")} />
          {q && <button type="button" aria-label="Clear filter" className="text-ash hover:text-bone" onClick={() => setQ("")}><X className="size-3.5" /></button>}
        </label>
        <Button variant={s.planting ? "secondary" : "default"} size="sm" title="Plant a new probe (p)" onClick={() => setPlanting(!s.planting)}><ArrowDownToLine />Plant</Button>
      </div>
      <div ref={listRef} role="listbox" aria-label="Probes" onKeyDown={onListKey} className="flex min-h-0 flex-1 flex-col overflow-auto">
        {needle && !active.length && !retired.length && (
          <p className="px-5 py-[18px] text-body text-smoke">No probe matches “{q.trim()}”. <button type="button" className="underline decoration-ash underline-offset-2 hover:decoration-bone" onClick={() => setQ("")}>Clear the filter</button></p>
        )}
        {s.loaded && !needle && !active.length && !s.untagged?.hits && !retired.length && (
          <div className="max-w-[46ch] px-5 py-[22px] text-body leading-[1.1875rem] text-smoke">
            <b className="mb-1 block text-title font-semibold text-bone">No probes yet.</b>
            Plant one: a tag (e.g. avatar) and where you'll put it. Then copy a payload into the target. Hits show up here the moment something calls back.
          </div>
        )}
        {!!active.length && (!!quiet.length || !!retired.length) && <div className="flex min-w-0 items-center gap-1.5 mr-[14px] mb-1.5 border-b border-rule px-1 pt-2 pb-1.5 text-label font-semibold tracking-[.02em] text-smoke">Active <span className="font-medium text-ash">{active.length}</span></div>}
        {active.map((p, i) => <Row key={p.tag} s={s} p={p} k={p.tag} stop={!s.sel && i === 0} />)}
        {!!quiet.length && (
          <>
            <button type="button" aria-expanded={showSilent} onClick={() => { setSilentOpen(!silentOpen); save("colluder.silentOpen", !silentOpen); }}
              title="Armed, planted over a day ago, and no hits yet"
              className="flex min-w-0 items-center gap-1.5 mr-[14px] mb-1.5 border-b border-rule px-1 pt-2 pb-1.5 text-left text-label font-semibold tracking-[.02em] text-smoke hover:text-bone max-[820px]:min-h-11">
              {showSilent ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}<span className="flex-none whitespace-nowrap">Silent <span className="font-medium text-ash">{quiet.length}</span></span>
              {!showSilent && <span className="truncate font-mono text-label text-ash">{quiet.map((p) => p.tag).join(" · ")}</span>}
            </button>
            {showSilent && quiet.map((p) => <Brief key={p.tag} s={s} p={p} />)}
          </>
        )}
        <div className="flex-1" />
        {!!retired.length && (
          <div className="mr-[14px] mb-1.5 flex items-center border-b border-rule">
            <button type="button" aria-expanded={showRetired || !!needle} onClick={() => setShowRetired(!showRetired)} className="flex flex-1 items-center gap-1.5 px-1 pt-2 pb-1.5 text-left text-label font-semibold tracking-[.02em] text-smoke hover:text-bone max-[820px]:min-h-11">
              {showRetired || needle ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}Retired <span className="font-medium text-ash">{retired.length}</span>{retiredNew > 0 && <span className="text-amber"> · {retiredNew} new</span>}
            </button>
            {(showRetired || needle) && !needle && <Button variant="ghost" size="sm" className="text-smoke" onClick={() => setDelAll(true)}><Trash2 />Delete all…</Button>}
          </div>
        )}
        {(showRetired || needle) && retired.map((p) => unreadFor(s, p.tag) ? <Row key={p.tag} s={s} p={p} k={p.tag} /> : <Brief key={p.tag} s={s} p={p} />)}
        <DeleteRetired tags={deletable.map((p) => p.tag)} hits={deletableHits} open={delAll} onOpenChange={setDelAll} />
        {!!s.untagged?.hits && <Row s={s} p={s.untagged} k={UNTAGGED} />}
      </div>
      <div className="mr-[14px] flex h-10 flex-none items-center gap-2.5 rounded-md border border-rule bg-soot pr-4 pl-4 text-smoke">
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

import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Archive, ArchiveRestore, Bell, CopyPlus, ChevronDown, ChevronRight, CircleStop, BellOff, CheckCheck, Eraser, ClipboardCopy, FileText, List, PanelLeftOpen, Pencil, Pin, PinOff, Plus, RotateCcw, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp, getState, select, unreadFor, searchAllHits, openHit, cloneProbe, lateHit, setPlanting, setDiscord, markSeen, fetchReport, clearProbe, restoreProbe, patchProbe, fetchRule, saveRule, type AppState } from "@/store";
import { PROTOS, UNTAGGED, type HttpRule, type Interaction, type Probe } from "@/lib/types";
import { dayOrTime, isoMs, plural } from "@/lib/format";
import { copy, toast } from "@/lib/toast";
import { variants } from "@/lib/raw";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from "@/components/ui/context-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Chip, ClaudeMark, LineForm, TypeChip, techniqueIcon, techniqueLabel } from "./bits";
import { cn } from "@/lib/utils";
import { CrewMark } from "./Mark";
import { crewOf, lookOf, STRAY_LOOK } from "@/lib/crew";
import { Ultra } from "@/components/Ultra";

// Probe tabs: the probes you opened, like a browser's tabs. Picking a probe anywhere (the list, a
// link, the status bar, a key) opens its tab; tabs keep their order, drag to reorder, close with × or
// a middle click, and Shift+T reopens the last one closed. Pinned tabs sit first, never close by
// themselves and lose their ×. A double click (or F2) gives a tab your own name; the tag stays in its
// card. Past MAX_TABS the unpinned tab you looked at longest ago, and that has no news, closes itself.
// While you read a hit the side list folds away and the tabs sit on top of the pane, so the pane has
// the full width; \ (or the tabs' list button) brings the list back.

const MAX_TABS = 8;
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

type FoldMode = "auto" | "open";
type Snap = { tabs: string[]; pins: string[]; names: Record<string, string>; closed: { k: string; at: number; pinned: boolean }[]; editing: string | null; editingAt: "head" | null };
let foldMode: FoldMode = read<string>("colluder.listFold", "auto") === "open" ? "open" : "auto";
// which view you were in (tabs or the list) survives a reload
let foldedNow = read<boolean>("colluder.listFolded", false) === true;
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const pinsAtLoad = strings(read("colluder.tabPins", []));
let snap: Snap = {
  tabs: order(strings(read("colluder.tabs", [])), pinsAtLoad),
  pins: pinsAtLoad,
  names: read<Record<string, string>>("colluder.tabNames", {}),
  closed: [],
  editing: null,
  editingAt: null, // "head": renaming in the probe pane's header, where it was asked for
};
const viewed = new Map<string, number>();
let cardFor: string | null = null; // which colluder's card is open (one per page)
const showCard = (k: string | null) => { if (cardFor !== k) { cardFor = k; ping(); } };
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
// pinned tabs first, each group in its own order
function order(tabs: string[], pins: string[]) { return [...tabs.filter((t) => pins.includes(t)), ...tabs.filter((t) => !pins.includes(t))]; }
function update(next: Partial<Snap>) {
  snap = { ...snap, ...next };
  if (next.tabs || next.pins) { snap.tabs = order(snap.tabs, snap.pins); write("colluder.tabs", snap.tabs); write("colluder.tabPins", snap.pins); }
  if (next.names) write("colluder.tabNames", snap.names);
  ping();
}

export const setFoldMode = (m: FoldMode) => { foldMode = m; write("colluder.listFold", m); ping(); };
export const setFolded = (v: boolean) => {
  const sel = getState().sel;
  if (v && sel) openTab(sel); // folding always shows the open probe as a tab
  foldedNow = v; write("colluder.listFolded", v); ping();
};
export const useFoldMode = () => useSyncExternalStore(subscribe, () => foldMode);
const useSnap = () => useSyncExternalStore(subscribe, () => snap);
// your name for a probe, if you gave it one
export const tabName = (k: string) => snap.names[k] || null;

function openTab(k: string) {
  viewed.set(k, Date.now());
  if (snap.tabs.includes(k)) return;
  let next = [...snap.tabs, k];
  const made: Snap["closed"] = [];
  while (next.length > MAX_TABS) {
    const st = getState();
    const spare = next.filter((t) => t !== k && !snap.pins.includes(t) && !unreadFor(st, t)).sort((a, b) => (viewed.get(a) ?? 0) - (viewed.get(b) ?? 0))[0];
    if (!spare) break;
    made.push({ k: spare, at: next.indexOf(spare), pinned: false });
    next = next.filter((t) => t !== spare);
  }
  update({ tabs: next, ...(made.length ? { closed: [...snap.closed.filter((c) => !made.some((m) => m.k === c.k)), ...made].slice(-12) } : {}) });
  // a full strip makes room by closing the tab you looked at longest ago: say which, and how to undo
  if (made.length) toast(`Closed ${label(made[0].k)} to make room. Shift+T reopens it`);
}
const label = (k: string) => tabName(k) ?? (k === UNTAGGED ? "No tag" : k);

function closeTabs(ks: string[], quiet = false) {
  const gone = ks.filter((k) => snap.tabs.includes(k));
  if (!gone.length) return;
  const before = snap.tabs;
  const tabs = before.filter((t) => !gone.includes(t));
  // remembered with where they stood, so Shift+T puts each back in its place (the last closed first)
  const closed = [...snap.closed.filter((c) => !gone.includes(c.k)), ...gone.map((k) => ({ k, at: before.indexOf(k), pinned: snap.pins.includes(k) }))].slice(-12);
  update({ tabs, pins: snap.pins.filter((t) => !gone.includes(t)), closed });
  const sel = getState().sel;
  if (sel && gone.includes(sel)) {
    // the neighbour to the right, else to the left, of the open tab
    const i = before.indexOf(sel);
    const next = before.slice(i + 1).find((t) => tabs.includes(t)) ?? before.slice(0, i).reverse().find((t) => tabs.includes(t));
    if (next) select(next);
    else { select(null, false); history.replaceState(null, "", "#probes"); } // the last tab: an empty strip (Plant, All probes), not the list
  }
  if (!quiet) toast(gone.length === 1 ? `Closed ${label(gone[0])}. Shift+T reopens it` : `Closed ${gone.length} tabs. Shift+T reopens them one by one`);
}
export const closeTab = (k: string) => closeTabs([k]);

function reopenTab() {
  const c = snap.closed.at(-1);
  if (!c) { toast("No closed tab to reopen"); return; }
  update({ closed: snap.closed.slice(0, -1) });
  if (!exists(getState(), c.k)) { reopenTab(); return; } // deleted since: try the one before
  if (!snap.tabs.includes(c.k)) {
    const tabs = [...snap.tabs];
    tabs.splice(Math.min(c.at, tabs.length), 0, c.k);
    update({ tabs, pins: c.pinned ? [...snap.pins, c.k] : snap.pins });
  }
  viewed.set(c.k, Date.now());
  select(c.k);
}
// the "All probes" switcher (tabs view) and planting from anywhere
let switcherOpen = false;
export const setSwitcher = (v: boolean) => { if (switcherOpen !== v) { switcherOpen = v; ping(); } };
const useSwitcher = () => useSyncExternalStore(subscribe, () => switcherOpen);
// + and the p key: open the plant form (or put the cursor back in it); the view stays as it is
export function plantNew() {
  if (location.hash && !location.hash.startsWith("#probes")) location.hash = "#probes";
  if (getState().planting) document.querySelector<HTMLInputElement>('[aria-label="Plant a probe"] input')?.focus();
  else setPlanting(true);
}
// / and o: find a probe. In tabs that's the switcher; with the list docked, its filter.
export function findProbe() {
  if (foldedNow && !matchMedia(PHONE).matches) setSwitcher(true);
  else document.querySelector<HTMLInputElement>('input[aria-label="Filter probes by tag, target or note"]')?.focus();
}
// Facets: narrow the list and the switcher to probes with news, with web hits (not DNS only), planted
// by Claude, or answering HTTP with a rule. Shared by both, for the session (a reload starts unfiltered).
export type Facet = "unread" | "web" | "claude" | "answering";
export const FACETS: [Facet, string, string][] = [
  ["unread", "Unread", "Probes with new hits"],
  ["web", "Web hits", "Probes that got an HTTP or HTTPS hit, not DNS only"],
  ["claude", "By Claude", "Probes Claude planted through the MCP"],
  ["answering", "Answering HTTP", "Probes with a saved HTTP rule (not the default reply)"],
];
let facets: Facet[] = [];
export const toggleFacet = (f: Facet) => { facets = facets.includes(f) ? facets.filter((x) => x !== f) : [...facets, f]; ping(); };
export const clearFacets = () => { if (facets.length) { facets = []; ping(); } };
export const useFacets = () => useSyncExternalStore(subscribe, () => facets);
export const facetMatch = (p: Probe, s: AppState, fs: Facet[]) => fs.every((f) =>
  f === "unread" ? unreadFor(s, p.tag) > 0 : f === "web" ? p.http + p.https > 0 : f === "claude" ? p.plantedBy === "claude" : !!p.httpRule && p.httpRule.mode !== "default");
export function FacetChips({ className }: { className?: string }) {
  const fs = useFacets();
  return (
    <div role="group" aria-label="Show only" className={cn("flex flex-wrap items-center gap-1", className)}>
      {FACETS.map(([f, label, what]) => (
        <button key={f} type="button" aria-pressed={fs.includes(f)} title={what} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleFacet(f)}
          className={cn("h-6 cursor-pointer rounded-[3px] border border-rule px-2 text-label text-smoke hover:text-bone", fs.includes(f) && "bg-soot-2 font-semibold text-bone")}>{label}</button>
      ))}
      {fs.length > 0 && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={clearFacets} className="ml-1 cursor-pointer text-label text-ash underline decoration-rule underline-offset-2 hover:text-bone">Show all</button>}
    </div>
  );
}

// "Matching hits": the search run over every probe's stored hits (two characters or more, debounced)
export function useHitSearch(needle: string) {
  const [hits, setHits] = useState<Interaction[]>([]);
  useEffect(() => {
    if (needle.length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => searchAllHits(needle).then((h) => { if (live) setHits(h); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [needle]);
  return hits;
}
// one matching hit: number, probe, type, source, what it asked for (text only: it came from outside)
export function HitMatch({ i, active, id, onMouseMove, onPick }: { i: Interaction; active?: boolean; id?: string; onMouseMove?: () => void; onPick?: () => void }) {
  const line = i.protocol === "dns" ? i.fullId : i.summary.split(" · ")[0];
  return (
    <div id={id} role="option" aria-selected={!!active} tabIndex={-1} onMouseMove={onMouseMove} onMouseDown={(e) => e.preventDefault()} onClick={() => { openHit(i); onPick?.(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openHit(i); onPick?.(); } }}
      aria-label={`Hit ${i.id} on ${i.tag ?? "no tag"}, ${i.protocol.toUpperCase()} from ${i.remoteAddress}`}
      className={cn("grid h-8 cursor-pointer grid-cols-[auto_auto_auto_minmax(0,1fr)] items-center gap-2.5 rounded-sm px-2 text-body hover:bg-hover focus-visible:outline-[1.5px] focus-visible:-outline-offset-2 focus-visible:outline-bone", active && "bg-accent")}>
      <span className="font-semibold text-smoke">#{i.id}</span>
      <span className="max-w-[120px] truncate font-mono text-bone">{i.tag ?? "No tag"}</span>
      <TypeChip proto={i.protocol} className="text-label" />
      <span className="min-w-0 truncate font-mono text-label text-smoke" title={`${i.remoteAddress} · ${line}`}>{i.remoteAddress} · {line}</span>
    </div>
  );
}

// the id of a probe's tab, for the pane's aria-labelledby
export const tabId = (k: string) => `ptab-${encodeURIComponent(k)}`;
// Armed probes that never heard anything, planted over a day ago, and with nothing new: the list's
// "Silent" group and the switcher's
export const isSilent = (p: Probe, s: AppState) => !p.retiredAt && !!p.registered && p.hits === 0 && !unreadFor(s, p.tag) && Date.now() - (isoMs(p.plantedAt) || 0) > 24 * 3600_000;

const togglePin = (k: string) => update({ pins: snap.pins.includes(k) ? snap.pins.filter((t) => t !== k) : [...snap.pins, k] });
const setEditing = (k: string | null, at: "head" | null = null) => update({ editing: k, editingAt: k ? at : null });
function rename(k: string, name: string) {
  const v = name.trim().slice(0, 40);
  const names = { ...snap.names };
  if (!v || v === k) delete names[k]; else names[k] = v;
  update({ names, editing: null, editingAt: null });
}
// drop `k` before or after `at`; the pinned group stays first
function moveTab(k: string, at: string, after: boolean) {
  if (k === at) return;
  const rest = snap.tabs.filter((t) => t !== k);
  const i = rest.indexOf(at);
  if (i === -1) return;
  rest.splice(after ? i + 1 : i, 0, k);
  update({ tabs: rest });
}

const PHONE = "(max-width: 820px)";
// on a phone the list sits above the pane: picking a probe by tapping it scrolls down to its pane
// (a tap has a click count; keyboard and arrow-key selection don't)
export function openFromList(k: string, e: React.MouseEvent) {
  select(k);
  if (e.detail > 0 && matchMedia(PHONE).matches) requestAnimationFrame(() => document.querySelector("main section[aria-label^='Probe ']")?.scrollIntoView({ block: "start", behavior: "smooth" }));
}
const onPhone = (cb: () => void) => { const m = matchMedia(PHONE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
export const usePhone = () => useSyncExternalStore(onPhone, () => matchMedia(PHONE).matches);

const exists = (s: AppState, k: string) => (k === UNTAGGED ? !!s.untagged?.hits : s.probes.has(k));
const activity = (s: AppState, k: string) => { const p = s.probes.get(k); return p ? Math.max(isoMs(p.lastHitAt) || 0, isoMs(p.plantedAt) || 0) : 0; };

// What a probe answers HTTP with, as a mark: the saved rule if there is one, else what it was planted
// to do. Default reply has no mark (it's the norm). `waiting`: planted for it, but the rule isn't
// saved, or it's saved and the edge isn't serving it yet.
const MODE_WORDS: Record<string, string> = { file: "Hosted file", redirect: "Redirect", custom: "Custom response", preset: "Preset" };
// `warn`: a retired probe still serving its rule (caution ink, never amber: amber is news)
function answerOf(p: Probe | undefined, s: AppState): { Icon: LucideIcon; label: string; line?: string; waiting?: string; warn?: string } | null {
  if (!p) return null;
  const r = p.httpRule;
  const served = s.status?.edge?.state === "running";
  if (r && r.mode !== "default") {
    const Icon = (r.mode === "preset" ? techniqueIcon(p.technique) : techniqueIcon(r.mode)) ?? techniqueIcon(r.mode === "custom" ? "callback" : "file")!;
    const label = r.mode === "preset" ? techniqueLabel(p.technique) ?? "Preset" : MODE_WORDS[r.mode] ?? r.mode;
    if (p.retiredAt) return served ? { Icon, label: `${label}, still answering while retired`, line: `v${r.version}: ${r.line}`, warn: "retired but still answering: right-click › Stop answering HTTP" } : { Icon, label, line: `v${r.version}: ${r.line}`, waiting: "retired; served again if the edge starts" };
    return { Icon, label, line: `v${r.version}: ${r.line}`, waiting: served ? undefined : "saved, not served yet" };
  }
  if (p.retiredAt) return null; // retired on the default reply: nothing to mark
  if (!r && p.technique && p.technique !== "callback") {
    const Icon = techniqueIcon(p.technique);
    if (!Icon) return null;
    const needsRule = p.technique === "file" || p.technique === "redirect";
    return { Icon, label: techniqueLabel(p.technique) ?? p.technique, waiting: needsRule ? "planted for it; the rule isn't saved" : undefined };
  }
  return null;
}

// App calls this once: it opens a tab for whatever gets selected, folds the list when a hit opens
// (if the automatic fold is on), and owns the keys. Returns whether the list is folded.
export function useListFolded(active = true) {
  const folded = useSyncExternalStore(subscribe, () => foldedNow);
  const phone = usePhone(); // every hook runs on every render: never behind && or ?
  const sel = useApp((x) => x.sel);
  useEffect(() => { if (sel) openTab(sel); }, [sel]);
  const hitOpen = useApp((x) => x.hit != null);
  const was = useRef(hitOpen);
  useEffect(() => { if (hitOpen && !was.current && foldMode === "auto") setFolded(true); was.current = hitOpen; }, [hitOpen]);

  // keys from anywhere outside a field or dialog: [ and ] step through the tabs (folded) or the list
  // (open), wrapping round; 1–8 pick a tab and 9 the last; n jumps to the next probe with news; / or
  // o finds a probe (the switcher, or the list's filter); F2 renames the open probe; Shift+T reopens
  // the last closed tab; \ switches between tabs and the list. p (plant) is App's.
  // only on the Probes view: elsewhere (Mailbox, Settings, the kit) these keys would switch probes out
  // of sight and pull the page back to #probes
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement)?.tagName)) return;
      if (document.querySelector("[role=dialog],[role=alertdialog],[role=menu]")) return;
      const st = getState();
      const open = snap.tabs.filter((k) => exists(st, k));
      if (e.key === "\\") { e.preventDefault(); setFolded(!foldedNow); return; }
      if (e.key === "/" || e.key === "o") { e.preventDefault(); findProbe(); return; }
      if (e.key === "T" && e.shiftKey) { e.preventDefault(); reopenTab(); return; }
      if (e.key === "F2" && st.sel && exists(st, st.sel)) { e.preventDefault(); setEditing(st.sel, "head"); return; }
      if (foldedNow && /^[1-9]$/.test(e.key)) {
        const k = e.key === "9" ? open.at(-1) : open[Number(e.key) - 1];
        if (k) { e.preventDefault(); select(k); }
        return;
      }
      if (e.key !== "[" && e.key !== "]" && e.key !== "n") return;
      const listed = [...document.querySelectorAll<HTMLElement>('section[aria-label="Probes"] [role=option][data-key]')].map((el) => el.dataset.key!);
      let next: string | undefined;
      if (e.key === "n") {
        // the open tabs first, then every other probe by latest activity
        const rest = [...st.probes.keys(), UNTAGGED].filter((k) => !open.includes(k) && exists(st, k)).sort((a, b) => activity(st, b) - activity(st, a));
        const seq = foldedNow ? [...open, ...rest] : listed.length ? [...listed, ...rest.filter((k) => !listed.includes(k))] : rest;
        const at = seq.indexOf(st.sel ?? "");
        next = [...seq.slice(at + 1), ...seq.slice(0, at + 1)].find((k) => unreadFor(st, k) > 0);
        if (!next) { toast("No probe has news"); return; }
      } else {
        const seq = foldedNow ? open : listed;
        if (!seq.length) return;
        const at = seq.indexOf(st.sel ?? "");
        // wraps round at either end
        const d = e.key === "]" ? 1 : -1;
        next = seq[at === -1 ? (d > 0 ? 0 : seq.length - 1) : (at + d + seq.length) % seq.length];
      }
      e.preventDefault();
      if (next) select(next);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [active]);
  return folded && !phone;
}
// whether the tabs view is showing (no side effects: for components other than App)
export function useTabsView() {
  const folded = useSyncExternalStore(subscribe, () => foldedNow);
  const phone = usePhone();
  return folded && !phone;
}

// ---------- shared by the tabs and the probe list ----------
// Everything a probe's tab offers (marks, your name for it, the card, the right-click menu) the list's
// rows offer too, so a probe looks and handles the same wherever you meet it.

export const useProbeSnap = () => useSnap();

// The marks between a probe's coat and its name: a pin when its tab is pinned, what it answers HTTP
// with, and Claude's mark when Claude planted it
export function ProbeMarks({ s, k, pin = true, className }: { s: AppState; k: string; pin?: boolean; className?: string }) {
  const { pins } = useSnap();
  const p = s.probes.get(k);
  const answer = answerOf(p, s);
  const pinned = pin && pins.includes(k);
  const claude = p?.plantedBy === "claude";
  if (!pinned && !answer && !claude) return null;
  return (
    <span className={cn("flex flex-none items-center gap-1", className)} aria-hidden="true">
      {pinned && <Pin className="size-3 text-smoke" strokeWidth={1.75} />}
      {answer && <answer.Icon className={cn("size-3.5", answer.warn ? "text-caution-ink" : answer.waiting ? "text-ash" : "text-smoke")} strokeWidth={1.75} />}
      {claude && <ClaudeMark title={null} />}
    </span>
  );
}
// the words the marks stand for, for accessible names
export function marksLabel(s: AppState, k: string) {
  const p = s.probes.get(k);
  return [snap.pins.includes(k) && "pinned tab", answerOf(p, s)?.label, p?.plantedBy === "claude" && "planted by Claude"].filter(Boolean).join(", ");
}

// Typing your own name for a probe, in place of its name
export function NameEditor({ k, className }: { k: string; className?: string }) {
  const tag = k === UNTAGGED ? "No tag" : k;
  return (
    <input autoFocus defaultValue={snap.names[k] ?? (k === UNTAGGED ? "" : k)} aria-label={`Name for ${tag}`} placeholder={tag} maxLength={40}
      onFocus={(e) => e.currentTarget.select()} onBlur={(e) => { if (snap.editing === k) rename(k, e.currentTarget.value); }}
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); rename(k, e.currentTarget.value); } if (e.key === "Escape") setEditing(null); }}
      className={cn("h-6 w-[160px] min-w-0 rounded-[3px] border border-smoke bg-soot-2 px-1.5 font-sans text-body font-normal text-bone outline-none", className)} />
  );
}
// where it was asked for: the tab or list row (a double-click there, the menu), or the probe pane's
// header (its double-click and F2), which is always in view
export const startRename = (k: string, at: "head" | null = null) => setEditing(k, at);

// The card, on hover: what you'd otherwise open the probe to learn
function ProbeCard({ s, k, hint }: { s: AppState; k: string; hint: string }) {
  const p = s.probes.get(k);
  const name = snap.names[k] || null;
  const answer = answerOf(p, s);
  const counts = p ?? s.untagged;
  const unread = unreadFor(s, k);
  const state = !p ? null : p.retiredAt ? (lateHit(p) ? `Retired ${dayOrTime(p.retiredAt)}, then a late hit` : `Retired ${dayOrTime(p.retiredAt)}`) : p.registered ? (p.hits ? "Armed" : "Armed, no hits yet") : "Not planted: a request used this tag";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col">
        {name && <span className="truncate text-title font-[650] text-bone">{name}</span>}
        <span className={cn("truncate font-mono", name ? "text-body text-smoke" : "text-title text-bone")}>{k === UNTAGGED ? "Hits that carry no tag" : <Ultra text={k} />}</span>
        {p?.target && <span className="truncate text-smoke"><Ultra text={p.target} /></span>}
        {p?.note && <span className="line-clamp-2 text-label text-ash">{p.note}</span>}
      </div>
      {state && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-smoke">
          <LineForm kind={p?.retiredAt ? "off" : "live"} signal="listen" seed={k} className={cn("w-4", p?.retiredAt ? "text-ash" : "text-bone")} />
          <span className="text-bone">{state}</span>
          {p?.plantedAt && <span>planted {dayOrTime(p.plantedAt)}</span>}
          {p?.plantedBy === "claude" && <span className="inline-flex items-center gap-1"><ClaudeMark title={null} />by Claude</span>}
          {!!p?.muted && <span className="inline-flex items-center gap-1"><BellOff className="size-3" strokeWidth={1.5} aria-hidden="true" />alerts muted</span>}
        </div>
      )}
      {!!counts?.hits && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label">
          {!!unread && <Chip>{unread} new</Chip>}
          {PROTOS.filter((x) => counts[x]).map((x) => <TypeChip key={x} proto={x} className="text-label font-semibold">{`${x.toUpperCase()} ${counts[x]}`}</TypeChip>)}
          {counts.lastHitAt && <span className="text-ash">last {dayOrTime(counts.lastHitAt)}</span>}
        </div>
      )}
      {answer && (
        <div className="flex min-w-0 items-start gap-2 text-label">
          <answer.Icon className="mt-px size-3.5 flex-none text-smoke" strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0">
            <span className="font-[650] text-bone">{answer.label}</span>{answer.waiting && <span className="text-ash">: {answer.waiting}</span>}{answer.warn && <span className="text-caution-ink">: {answer.warn}</span>}
            {answer.line && <span className="block truncate font-mono text-smoke">{answer.line}</span>}
          </span>
        </div>
      )}
      <div className="border-t border-rule-2 pt-1.5 text-label text-ash">{hint}</div>
    </div>
  );
}

// The probe's card opens from its colluder (the crew mark), not the whole row or tab, so passing over
// the list or the tabs never pops it. One card on the page at a time, keyed by where it's hovered (a
// probe can be on a tab, in the list and in the header at once), and it gives way to a menu, a drag
// and a rename.
export function CardOnCrew({ s, k, hint, side = "bottom", children }: { s: AppState; k: string; hint: string; side?: "bottom" | "right"; children: React.ReactNode }) {
  const id = useId();
  const open = useSyncExternalStore(subscribe, () => cardFor === id);
  const { editing } = useSnap();
  return (
    <HoverCard open={open && editing !== k} onOpenChange={(o) => { if (o) showCard(id); else if (cardFor === id) showCard(null); }}>
      <HoverCardTrigger asChild>
        <span className="flex flex-none cursor-help">{children}</span>
      </HoverCardTrigger>
      <HoverCardContent side={side} align="start"><ProbeCard s={s} k={k} hint={hint} /></HoverCardContent>
    </HoverCard>
  );
}

// Wraps one element (a tab, a list row) with the probe's right-click menu. `extra`: the tab's own items.
// One-click housekeeping, each with Undo in the toast instead of a dialog first.
// Clear: hides the probe's hits (soft; Undo is the server's Restore of that clear).
export function quickClear(k: string) {
  const tag = k === UNTAGGED ? null : k;
  const name = label(k);
  clearProbe(tag).then(
    (r) => toast(`Cleared ${plural(r.cleared, "hit")} on ${name}`, false, { label: "Undo", run: () => restoreProbe(tag).then((x) => toast(`Brought back ${plural(x.restored, "hit")} on ${name}`), fail) }),
    fail);
}
// Retire: out of the active list, its tab closed, and its HTTP answer back to the default reply so a
// forgotten redirect, hosted file or DTD stops answering whoever finds the payload later. Undo puts
// all three back. Several at once (Retire all silent) works the same way, with one Undo.
const DEFAULT_RULE: HttpRule = { mode: "default", delayMs: 0, schemes: { http: true, https: true } };
type Was = { k: string; rule: HttpRule | null };
// put each probe's rule back to what it was (the server keeps the history; this saves it as new)
const putBack = (was: Was[]) => Promise.all(was.filter((w) => w.rule).map((w) => saveRule(w.k, w.rule!)));
async function resetAnswers(ks: string[]): Promise<Was[]> {
  const st = getState();
  const was: Was[] = [];
  for (const k of ks) {
    if (!st.probes.get(k)?.httpRule) continue;
    const rule = (await fetchRule(k)).active?.rule ?? null;
    if (!rule || rule.mode === "default") continue;
    await saveRule(k, DEFAULT_RULE);
    was.push({ k, rule });
  }
  return was;
}
export async function retireMany(ks: string[], what?: string) {
  if (!ks.length) return;
  const one = ks.length === 1 ? label(ks[0]) : null;
  let was: Was[] = [];
  const done: string[] = [];
  try {
    was = await resetAnswers(ks);
    for (const k of ks) { await patchProbe(k, { retired: true }); markSeen(k, false); done.push(k); } // a retired probe's old hits are no longer news
  } catch (e) { fail(e); if (!done.length && !was.length) return; }
  const hadTabs = done.filter((k) => snap.tabs.includes(k));
  if (hadTabs.length) closeTabs(hadTabs, true);
  const answers = was.length ? (one ? ", HTTP answer back to default" : `, ${plural(was.length, "HTTP answer")} back to default`) : "";
  toast(`Retired ${one ?? `${done.length} ${what ?? "probes"}`}${answers}`, false, {
    label: "Undo",
    run: () => Promise.all(done.map((k) => patchProbe(k, { retired: false }))).then(() => putBack(was))
      .then(() => {
        // the tabs come back where they were, most recent close first
        for (let n = 0; n < hadTabs.length && hadTabs.includes(snap.closed.at(-1)?.k ?? ""); n++) reopenTab();
        if (!hadTabs.length && one) select(ks[0]);
        toast(`${one ?? `${done.length} probes`} armed again${was.length ? ", answers restored" : ""}`);
      }, fail),
  });
}
export const quickRetire = (k: string) => retireMany([k]);
// Retired probes whose HTTP rule is still served: the edge answers whoever finds their payloads.
// what a probe answers HTTP with, in words ("hosted file", "redirect", the preset's name)
export const answerWords = (p: Probe) => (p.httpRule ? (p.httpRule.mode === "preset" ? techniqueLabel(p.technique) ?? "preset" : MODE_WORDS[p.httpRule.mode] ?? p.httpRule.mode).toLowerCase() : null);
export const stillAnswering = (s: AppState) => [...s.probes.values()].filter((p) => p.retiredAt && p.httpRule);
export async function stopAnswering(ks: string[]) {
  try {
    const was = await resetAnswers(ks);
    const one = ks.length === 1 ? label(ks[0]) : null;
    toast(`${one ?? plural(was.length, "retired probe")} ${one ? "answers" : "answer"} with the default reply now`, false, { label: "Undo", run: () => putBack(was).then(() => toast("Answers restored"), fail) });
  } catch (e) { fail(e); }
}
// Armed probes that never heard anything, planted over a day ago (the Silent group)
export const silentProbes = (s: AppState) => [...s.probes.values()].filter((p) => isSilent(p, s));
export const quickRestore = (k: string) => patchProbe(k, { retired: false }).then(() => toast(`Restored ${label(k)}: armed again`), fail);
const fail = (e: unknown) => toast((e as Error).message, true);

export function ProbeActions({ s, k, extra, children }: { s: AppState; k: string; extra?: React.ReactNode; children: React.ReactElement }) {
  const { pins, names } = useSnap();
  const p = s.probes.get(k);
  const unread = unreadFor(s, k);
  const pinned = pins.includes(k);
  const vs = k === UNTAGGED ? null : variants(s.status?.payload?.host, s.status?.payload?.domain, k);
  const hits = k === UNTAGGED ? s.untagged?.hits ?? 0 : p?.hits ?? 0;
  return (
    <ContextMenu onOpenChange={(o) => { if (o) showCard(null); }}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => setTimeout(() => setEditing(k), 0)}><Pencil />Rename…<ContextMenuShortcut>F2</ContextMenuShortcut></ContextMenuItem>
        {names[k] && <ContextMenuItem onSelect={() => rename(k, "")}><RotateCcw />Use the tag again</ContextMenuItem>}
        <ContextMenuItem onSelect={() => { if (!pinned) openTab(k); togglePin(k); }}>{pinned ? <><PinOff />Unpin tab</> : <><Pin />Pin as a tab</>}</ContextMenuItem>
        {!!unread && <ContextMenuItem onSelect={() => markSeen(k, false)}><CheckCheck />Mark {plural(unread, "new hit")} as read</ContextMenuItem>}
        <ContextMenuSeparator />
        {k !== UNTAGGED && <ContextMenuItem onSelect={() => copy(k, "tag")}><ClipboardCopy />Copy tag</ContextMenuItem>}
        {vs?.map((v) => <ContextMenuItem key={v.proto} onSelect={() => copy(v.value, `${v.proto.toUpperCase()} payload`)}><ClipboardCopy />Copy {v.proto.toUpperCase()} payload</ContextMenuItem>)}
        {p && <ContextMenuItem onSelect={() => fetchReport(k).then((md) => copy(md, `${k} report`), (e) => toast((e as Error).message, true))}><FileText />Copy report</ContextMenuItem>}
        {p?.registered && <ContextMenuItem onSelect={() => void cloneProbe(k)}><CopyPlus />Clone probe…</ContextMenuItem>}
        {(!!hits || (p?.registered && k !== UNTAGGED)) && <ContextMenuSeparator />}
        {!!hits && <ContextMenuItem onSelect={() => quickClear(k)}><Eraser />Clear {plural(hits, "hit")}</ContextMenuItem>}
        {p?.registered && k !== UNTAGGED && (p.retiredAt
          ? <>{p.httpRule && <ContextMenuItem onSelect={() => stopAnswering([k])}><CircleStop />Stop answering HTTP</ContextMenuItem>}<ContextMenuItem onSelect={() => quickRestore(k)}><ArchiveRestore />Restore (arm again)</ContextMenuItem></>
          : <ContextMenuItem onSelect={() => quickRetire(k)}><Archive />Retire</ContextMenuItem>)}
        {extra}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function Tab({ s, k, i, focus, last }: { s: AppState; k: string; i: number; focus: boolean; last: boolean }) {
  const { pins, names, editing, editingAt, tabs } = useSnap();
  const renaming = editing === k && editingAt !== "head";
  const p = s.probes.get(k);
  const sel = s.sel === k;
  const unread = unreadFor(s, k);
  const pinned = pins.includes(k);
  const stray = k === UNTAGGED || !p?.registered;
  const quiet = !p || !!p.retiredAt;
  const look = stray ? STRAY_LOOK : lookOf(crewOf(s.probes), k);
  const alias = names[k] || null;
  const tag = k === UNTAGGED ? "No tag" : k;
  const ref = useRef<HTMLButtonElement>(null);
  const [drop, setDrop] = useState<"before" | "after" | null>(null);
  useEffect(() => { if (sel) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [sel]);
  // a tab squeezed by a full strip drops its marks and says "3" for "3 new" (the name keeps the room)
  const box = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 150));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const right = tabs.slice(tabs.indexOf(k) + 1).filter((t) => !pins.includes(t));
  const others = tabs.filter((t) => t !== k && !pins.includes(t));
  const label = [alias ? `${alias} (${tag})` : tag, unread && `${unread} new`, p ? plural(p.hits, "hit") : "", marksLabel(s, k)].filter(Boolean).join(", ");

  const extra = (
    <>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => closeTabs([k])}><X />Close tab{pinned && " (pinned)"}<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuItem disabled={!others.length} onSelect={() => closeTabs(others)}>Close other tabs</ContextMenuItem>
      <ContextMenuItem disabled={!right.length} onSelect={() => closeTabs(right)}>Close tabs to the right</ContextMenuItem>
      <ContextMenuItem disabled={!snap.closed.length} onSelect={reopenTab}><RotateCcw />Reopen closed tab<ContextMenuShortcut>⇧T</ContextMenuShortcut></ContextMenuItem>
    </>
  );

  return (
    <ProbeActions s={s} k={k} extra={extra}>
      <div ref={box} draggable={!renaming}
        onDragStart={(e) => { showCard(null); e.dataTransfer.setData("text/x-colluder-tab", k); e.dataTransfer.effectAllowed = "move"; }}
        onDragOver={(e) => { if (!e.dataTransfer.types.includes("text/x-colluder-tab")) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDrop(e.clientX > r.left + r.width / 2 ? "after" : "before"); }}
        onDragLeave={() => setDrop(null)}
        onDragEnd={() => showCard(null)}
        onDrop={(e) => { e.preventDefault(); showCard(null); const from = e.dataTransfer.getData("text/x-colluder-tab"); if (from) moveTab(from, k, drop === "after"); setDrop(null); }}
        role="presentation"
        className={cn("group relative flex h-9 max-w-[240px] min-w-[104px] flex-[0_1_auto] items-center rounded-t-[5px] border border-b-0",
          sel ? "z-10 -mb-px h-[calc(2.25rem+1px)] border-rule bg-soot" : "border-rule hover:bg-hover", s.lit === k && !sel && "animate-lit")}>
        {/* where a dragged tab will land */}
        {drop && <span aria-hidden="true" className={cn("absolute top-1 bottom-1 w-0.5 rounded-full bg-bone", drop === "before" ? "-left-[2px]" : "-right-[2px]")} />}
        {renaming ? (
          <div className="flex h-full min-w-0 items-center gap-2 pr-2 pl-2.5">
            <CrewMark size={18} {...look} state={quiet || stray ? "doze" : "wink"} unread={!!unread} /><NameEditor k={k} className="w-[150px]" />
          </div>
        ) : (
          <button ref={ref} type="button" role="tab" id={tabId(k)} aria-controls="probe-view" aria-selected={sel} tabIndex={focus ? 0 : -1} data-tab={k} aria-label={label}
            aria-keyshortcuts={i < 8 ? String(i + 1) : last ? "9" : undefined}
            onClick={() => select(k)} onDoubleClick={(e) => { e.preventDefault(); setEditing(k); }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); if (!pinned) closeTab(k); } }}
            className={cn("flex h-full min-w-0 cursor-pointer items-center gap-2 pl-2.5 text-left outline-offset-[-2px]", pinned ? "pr-3" : "pr-7")}>
            <CardOnCrew s={s} k={k} hint="Double-click the tab to rename · right-click for more">
              <CrewMark size={18} {...look} state={quiet || stray ? "doze" : "wink"} unread={!!unread} className={cn(quiet && "opacity-70")} />
            </CardOnCrew>
            {!narrow && <ProbeMarks s={s} k={k} />}
            <span className={cn("truncate text-body", alias || k === UNTAGGED ? "font-sans font-medium" : "font-mono", sel ? "text-bone" : quiet ? "text-ash" : "text-smoke group-hover:text-bone", sel && !alias && "font-[550]")}>
              {alias ?? (k === UNTAGGED ? tag : <Ultra text={k} />)}
            </span>
            {!!unread && <span className="flex-none"><Chip>{unread}{!narrow && " new"}</Chip></span>}
          </button>
        )}
        {!pinned && !renaming && (
          <button type="button" aria-label={`Close ${alias ?? tag}`} title="Close tab" onClick={() => closeTab(k)} tabIndex={-1}
            className={cn("absolute right-1.5 grid size-5 place-items-center rounded-[3px] text-ash hover:bg-hover hover:text-bone", !sel && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100")}>
            <X className="size-3" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </ProbeActions>
  );
}

// The "All probes" switcher: every probe in the list's own groups, with a filter, news first. Enter
// (or a click) opens the pick as a tab. Its footer docks the full list, plants, reopens and toggles
// alerts, so nothing needs the list.
// Retired probes stay out of the way: a search finds them (to read old hits, copy a report, restore
// one), and one with a late hit is back under Active anyway. Silent folds to one row (following the
// list's choice); a search opens it. The fold row is part of the arrow-key order: Enter, a click or
// → opens it, ← closes it.
type Row = { k: string; group: string; fold?: { n: number; open: boolean; news: number }; hit?: Interaction };
const FOLDS = ["Silent"];
function Switcher({ s, onPick }: { s: AppState; onPick: () => void }) {
  const { tabs, names } = useSnap();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const listId = useId();
  const fs = useFacets();
  const needle = q.trim().toLowerCase();
  // a facet narrows like a search: folded groups open, retired probes that match show
  const searching = !!needle || fs.length > 0;
  const match = (p: Probe) => facetMatch(p, s, fs) && (!needle || [p.tag, p.target, p.note, names[p.tag]].some((x) => (x ?? "").toLowerCase().includes(needle)));
  const byNews = (a: Probe, b: Probe) => Number(unreadFor(s, b.tag) > 0) - Number(unreadFor(s, a.tag) > 0) || activity(s, b.tag) - activity(s, a.tag);
  const every = [...s.probes.values()].filter((p) => (p.registered || p.hits > 0) && match(p));
  const live = every.filter((p) => !p.retiredAt || lateHit(p));
  const groups: [string, Probe[]][] = [
    ["Active", live.filter((p) => !isSilent(p, s)).sort(byNews)],
    ["Silent", live.filter((p) => isSilent(p, s)).sort(byNews)],
    ["Retired", searching ? every.filter((p) => p.retiredAt && !lateHit(p)).sort(byNews) : []],
  ];
  const retiredHidden = searching ? 0 : [...s.probes.values()].filter((p) => p.registered && p.retiredAt && !lateHit(p)).length;
  const silentCount = silentProbes(s).length;
  const [opened, setOpened] = useState<Set<string>>(() => new Set(read<boolean>("colluder.silentOpen", false) ? ["Silent"] : []));
  const toggle = (g: string, v?: boolean) => setOpened((o) => { const n = new Set(o); if (v ?? !n.has(g)) n.add(g); else n.delete(g); return n; });
  const rows: Row[] = groups.flatMap(([g, ps]) => {
    if (!ps.length) return [];
    const items = ps.map((p) => ({ k: p.tag, group: g }));
    if (!FOLDS.includes(g) || searching) return items;
    const open = opened.has(g);
    const head: Row = { k: `fold:${g}`, group: g, fold: { n: ps.length, open, news: ps.reduce((n, p) => n + unreadFor(s, p.tag), 0) } };
    return open ? [head, ...items] : [head];
  });
  if (s.untagged?.hits && !fs.length && (!needle || "no tag".includes(needle))) rows.push({ k: UNTAGGED, group: "No tag" });
  const found = useHitSearch(q.trim());
  for (const h of found) rows.push({ k: `hit:${h.id}`, group: "Matching hits", hit: h });
  const pick = (k: string) => { select(k); onPick(); };
  const crew = crewOf(s.probes);
  const d = s.status?.discord;
  useEffect(() => setAt(0), [needle, fs]);
  useEffect(() => { document.getElementById(`${listId}-${at}`)?.scrollIntoView({ block: "nearest" }); }, [at, listId]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(rows.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && rows[at]) { e.preventDefault(); const r = rows[at]; if (r.fold) toggle(r.group); else if (r.hit) { openHit(r.hit); onPick(); } else pick(r.k); }
    else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && rows[at]?.fold && !q) { e.preventDefault(); toggle(rows[at].group, e.key === "ArrowRight"); }
  };
  return (
    <div className="flex max-h-[min(560px,70vh)] flex-col">
      <label className="flex h-10 flex-none items-center gap-2 border-b border-rule px-3">
        <Search className="size-3.5 flex-none text-ash" strokeWidth={1.5} aria-hidden="true" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Find a probe: tag, name, target, note"
          role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={rows[at] ? `${listId}-${at}` : undefined} aria-label="Find a probe"
          className="min-w-0 flex-1 bg-transparent text-body text-bone outline-none placeholder:text-ash" />
      </label>
      <FacetChips className="flex-none border-b border-rule px-2 py-1.5" />
      <div id={listId} role="listbox" aria-label="Probes" className="min-h-0 flex-1 overflow-y-auto p-1">
        {!rows.length && <p className="px-2 py-3 text-body text-smoke">{needle ? `No probe or hit matches “${q.trim()}”${fs.length ? " with these filters" : ""}.` : fs.length ? "No probe matches these filters." : "No live probes."}</p>}
        {rows.map((r, i) => {
          if (r.fold) {
            const f = r.fold;
            return (
              <div key={r.k} id={`${listId}-${i}`} role="option" aria-selected={i === at} aria-expanded={f.open} onMouseMove={() => setAt(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle(r.group)}
                aria-label={`${r.group}, ${f.n}${f.news ? `, ${f.news} new` : ""}, ${f.open ? "shown" : "folded"}`}
                className={cn("mt-1 flex h-8 cursor-pointer items-center gap-1.5 rounded-sm px-2 text-label font-semibold text-smoke hover:text-bone", i === at && "bg-accent text-bone")}>
                {f.open ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
                {r.group} <span className="font-medium text-ash">{f.n}</span>
                {f.news > 0 && <span className="ml-auto"><Chip>{f.news} new</Chip></span>}
              </div>
            );
          }
          if (r.hit) return (
            <Fragment key={r.k}>
              {rows[i - 1]?.group !== r.group && <div className="px-2 pt-2 pb-1 text-label font-semibold text-smoke" aria-hidden="true">Matching hits <span className="font-medium text-ash">across every probe</span></div>}
              <HitMatch i={r.hit} id={`${listId}-${i}`} active={i === at} onMouseMove={() => setAt(i)} onPick={onPick} />
            </Fragment>
          );
          const p = s.probes.get(r.k);
          const unread = unreadFor(s, r.k);
          const alias = names[r.k];
          const stray = r.k === UNTAGGED || !p?.registered;
          const quiet = !p || !!p.retiredAt;
          return (
            <Fragment key={r.k}>
              {(i === 0 || rows[i - 1].group !== r.group) && !rows[i - 1]?.fold && <div className="px-2 pt-2 pb-1 text-label font-semibold text-smoke" aria-hidden="true">{r.group}</div>}
              <div id={`${listId}-${i}`} role="option" aria-selected={i === at} onMouseMove={() => setAt(i)} onClick={() => pick(r.k)}
                aria-label={[alias ? `${alias} (${r.k})` : r.k === UNTAGGED ? "No tag" : r.k, unread && `${unread} new`, p ? plural(p.hits, "hit") : "", tabs.includes(r.k) && "open as a tab", marksLabel(s, r.k)].filter(Boolean).join(", ")}
                className={cn("flex h-8 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-body", i === at && "bg-accent", s.sel === r.k && "font-[550]")}>
                <CrewMark size={18} {...(stray ? STRAY_LOOK : lookOf(crew, r.k))} state={quiet || stray ? "doze" : "wink"} unread={!!unread} className={cn(quiet && "opacity-70")} />
                <ProbeMarks s={s} k={r.k} />
                {alias ? <span className="flex min-w-0 flex-1 items-baseline gap-2"><span className="truncate text-bone">{alias}</span><span className="truncate font-mono text-label text-ash">{r.k}</span></span>
                  : <span className={cn("min-w-0 flex-1 truncate", r.k === UNTAGGED ? "text-bone" : "font-mono", quiet ? "text-smoke" : "text-bone")}>{r.k === UNTAGGED ? "No tag" : r.k}</span>}
                {tabs.includes(r.k) && <span className="flex-none text-label text-ash">open</span>}
                {unread ? <Chip>{unread} new</Chip> : <span className="flex-none text-label text-ash">{p?.hits || r.k === UNTAGGED ? `${plural(p?.hits ?? s.untagged?.hits ?? 0, "hit")} · ${dayOrTime((p ?? s.untagged)?.lastHitAt)}` : p?.retiredAt ? `retired ${dayOrTime(p.retiredAt)}` : "no hits"}</span>}
              </div>
            </Fragment>
          );
        })}
        {retiredHidden > 0 && <p className="px-2 pt-2 pb-1 text-label text-ash">{plural(retiredHidden, "retired probe")} not shown: search finds them.</p>}
      </div>
      <div className="flex flex-none flex-wrap items-center gap-1 border-t border-rule p-1">
        <Button variant="ghost" size="sm" className="text-smoke" onClick={() => { onPick(); setFolded(false); }}><PanelLeftOpen />Dock the list<kbd className="ml-1 font-mono text-label text-ash">\</kbd></Button>
        <Button variant="ghost" size="sm" className="text-smoke" onClick={() => { onPick(); plantNew(); }}><Plus />Plant<kbd className="ml-1 font-mono text-label text-ash">p</kbd></Button>
        {!!snap.closed.length && <Button variant="ghost" size="sm" className="text-smoke" onClick={() => { onPick(); reopenTab(); }}><RotateCcw />Reopen<kbd className="ml-1 font-mono text-label text-ash">⇧T</kbd></Button>}
        {!needle && silentCount > 0 && <Button variant="ghost" size="sm" className="text-smoke" title="Armed, planted over a day ago, no hits yet. Undo in the message." onClick={() => retireMany(silentProbes(s).map((p) => p.tag), "silent probes")}><Archive />Retire {silentCount} silent</Button>}
        {d?.available && (
          <Button variant="ghost" size="sm" className={cn("ml-auto", d.enabled ? "text-bone" : "text-ash")} aria-pressed={d.enabled}
            onClick={() => setDiscord(!d.enabled).catch((e) => toast((e as Error).message, true))}>{d.enabled ? <Bell /> : <BellOff />}Alerts {d.enabled ? "on" : "off"}</Button>
        )}
      </div>
    </div>
  );
}

export function ProbeTabs() {
  const s = useApp((x) => x);
  const { tabs } = useSnap();
  const open = tabs.filter((k) => exists(s, k));
  const switcher = useSwitcher();
  const focusKey = open.includes(s.sel ?? "") ? s.sel : open[0];
  const stripRef = useRef<HTMLDivElement>(null);

  // tabs that don't fit (the strip scrolls only once every tab is at its narrowest)
  const [clipped, setClipped] = useState<string[]>([]);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const measure = () => {
      const r = strip.getBoundingClientRect();
      const out = [...strip.querySelectorAll<HTMLElement>("[data-tab]")].filter((el) => { const b = el.getBoundingClientRect(); return b.left < r.left - 1 || b.right > r.right + 1; }).map((el) => el.dataset.tab!);
      setClipped((prev) => (prev.join("|") === out.join("|") ? prev : out));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    strip.addEventListener("scroll", measure);
    return () => { ro.disconnect(); strip.removeEventListener("scroll", measure); };
  }, [open.join("|")]);

  // the count on All probes: every probe in the list, and news you can't see (no tab, or a tab off
  // the strip's edge)
  const listed = [...s.probes.values()].filter((p) => (p.registered || p.hits > 0) && (!p.retiredAt || lateHit(p))).length;
  const unseen = [...s.probes.keys(), UNTAGGED].filter((k) => exists(s, k) && (!open.includes(k) || clipped.includes(k)));
  const news = unseen.reduce((n, k) => n + unreadFor(s, k), 0);

  // background news, spoken: a polite "New hit on X" for a tab you aren't on, at most every 8s each
  const [said, setSaid] = useState("");
  const lastSaid = useRef(new Map<string, number>());
  useEffect(() => {
    const k = s.lit;
    if (!k || k === s.sel || !open.includes(k)) return;
    const now = Date.now();
    if (now - (lastSaid.current.get(k) ?? 0) < 8000) return;
    lastSaid.current.set(k, now);
    setSaid(`New hit on ${label(k)}`);
  }, [s.pulse]); // eslint-disable-line react-hooks/exhaustive-deps

  // arrows move along the tabs (Home/End to the ends), Delete closes, F2 renames; one tab stop
  const onKey = (e: React.KeyboardEvent) => {
    const k0 = (document.activeElement as HTMLElement)?.dataset.tab;
    const i = open.indexOf(k0 ?? "");
    if (i === -1) return;
    if (e.key === "Delete") { e.preventDefault(); closeTab(open[i]); return; }
    if (e.key === "F2") { e.preventDefault(); e.stopPropagation(); setEditing(open[i]); return; }
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? open.length - 1 : null;
    if (to == null) return;
    e.preventDefault();
    const k = open[(to + open.length) % open.length];
    select(k);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-tab="${CSS.escape(k)}"]`)?.focus());
  };

  return (
    <div className="flex h-9 flex-none items-end gap-1">
      <Popover open={switcher} onOpenChange={setSwitcher}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="mb-1 flex-none gap-1.5 px-2 text-smoke"
            aria-label={`All probes: ${listed}${news ? `, ${news} new out of view` : ""}`} title="All probes (o or /)">
            <List /><span className="text-body text-bone">{listed}</span>{news > 0 && <Chip>{news} new</Chip>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={4} className="w-[400px] p-0" onCloseAutoFocus={(e) => { e.preventDefault(); document.querySelector<HTMLElement>(`[data-tab="${CSS.escape(getState().sel ?? "")}"]`)?.focus(); }}>
          <Switcher s={s} onPick={() => setSwitcher(false)} />
        </PopoverContent>
      </Popover>
      <div ref={stripRef} role="tablist" aria-label="Open probes" onKeyDown={onKey} className="flex min-w-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
        {open.map((k, i) => <Tab key={k} s={s} k={k} i={i} focus={k === focusKey} last={i === open.length - 1} />)}
      </div>
      <Button variant="ghost" size="icon-sm" className="mb-1 flex-none text-smoke" aria-label="Plant a new probe" title="Plant a new probe (p)" data-plant-new onClick={plantNew}><Plus /></Button>
      <div role="status" aria-live="polite" className="sr-only">{said}</div>
    </div>
  );
}

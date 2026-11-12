import { useSyncExternalStore } from "react";
import type { AlertKind, CheckResult, Counts, Enrich, HttpRule, Interaction, InteractionDetail, MailRow, Mailbox, Probe, RuleState, StateResponse, Status } from "@/lib/types";
import { UNTAGGED } from "@/lib/types";
import { dnsSteps } from "@/lib/dns";
import { toast } from "@/lib/toast";
import { isoMs, plural } from "@/lib/format";
import { getDisplay } from "@/lib/display";
import { chime } from "@/lib/chime";

export type StreamState = "connecting" | "connected" | "reconnecting";
export type ProbeTab = "hits" | "http";
export const PROBE_TABS: ProbeTab[] = ["hits", "http"];

export interface AppState {
  loaded: boolean;
  loadError: string | null;
  status: Status | null;
  probes: Map<string, Probe>;
  untagged: Counts | null;
  list: Interaction[]; // newest first
  details: Map<number, InteractionDetail>;
  enrich: Map<string, Enrich>;
  seen: Record<string, number>; // per-browser read marker: highest id seen per probe
  openSeen: Record<string, number>; // marker as it was when the probe was opened (keeps rows marked "new")
  sel: string | null;
  hit: number | null;
  hitPicked: boolean; // the researcher chose this hit; otherwise the selection follows new hits
  older: Record<string, Interaction[]>; // B4: hits older than the live list, loaded on demand per probe
  olderDone: Record<string, boolean>;
  tab: ProbeTab; // which probe tab is open; kept across probe switches
  ruleDrafts: Record<string, HttpRule>; // unsaved HTTP rule edits per probe; survive tab and probe switches
  ruleSeed: { tag: string; mode: "redirect" | "file" } | null; // planted with a technique: open its editor in that mode
  stream: { state: StreamState; since: number; lastEventAt: number };
  arrived: number | null; // id that just arrived (row flash)
  lit: string | null; // probe that just got a hit (list flash)
  pulse: number; // increments on every new hit (mark animation)
  planting: boolean; // the plant form is open (it folds away once a probe is planted)
}

function load<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; }
}
export function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
}

let state: AppState = {
  loaded: false, loadError: null, status: null, probes: new Map(), untagged: null, list: [], details: new Map(), enrich: new Map(),
  seen: load<Record<string, number> | null>("colluder.seen", null) ?? {}, openSeen: {}, sel: null, hit: null, hitPicked: false, older: {}, olderDone: {}, tab: "hits", ruleDrafts: {}, ruleSeed: null,
  stream: { state: "connecting", since: Date.now(), lastEventAt: 0 }, arrived: null, lit: null, pulse: 0, planting: false,
};
const firstVisit = load("colluder.seen", null) == null;
const subs = new Set<() => void>();
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  subs.forEach((s) => s());
}
export const getState = () => state;
export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => sel(state));
}

// ---------- API ----------
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(path, {
    method: opts.method,
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error || `HTTP ${r.status}`);
  return data as T;
}

export async function loadState() {
  try {
    const st = await api<StateResponse>("/api/state");
    const probes = new Map(st.probes.map((p) => [p.tag, p]));
    let seen = state.seen;
    if (firstVisit && !state.loaded) { // first visit: everything already here counts as seen
      seen = {};
      for (const p of probes.values()) seen[p.tag] = p.lastId || 0;
      seen[UNTAGGED] = st.untagged?.lastId || 0;
      save("colluder.seen", seen);
    }
    set({ loaded: true, loadError: null, status: st.status, probes, untagged: st.untagged, list: st.interactions, seen });
  } catch (e) {
    set({ loadError: (e as Error).message });
    setTimeout(loadState, 5000);
  }
}

// ---------- unread ----------
export const keyOf = (i: Interaction) => i.tag || UNTAGGED;
// Resolver chatter: recursive resolvers doing QNAME minimisation (and clients resolving the
// older path-form HTTPS host) look up the bare payload id right next to a tagged hit.
// Those lookups are real but carry no signal, so they are labelled and never count as new.
export const CHATTER_MS = 10_000;
const chatterCache = new WeakMap<Interaction[], Map<number, string>>();
export function chatterOf(list: Interaction[]): Map<number, string> {
  let m = chatterCache.get(list);
  if (m) return m;
  m = new Map();
  const tagged = list.filter((i) => i.tag).map((i) => ({ t: isoMs(i.timestamp), tag: i.tag! })).sort((a, b) => a.t - b.t);
  if (tagged.length) {
    for (const i of list) {
      if (i.tag || i.protocol !== "dns" || i.fullId.toLowerCase() !== i.uniqueId.toLowerCase()) continue;
      const t = isoMs(i.timestamp);
      let lo = 0, hi = tagged.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (tagged[mid].t < t) lo = mid + 1; else hi = mid; }
      let best: { t: number; tag: string } | null = null;
      for (const c of [tagged[lo - 1], tagged[lo]]) if (c && (!best || Math.abs(c.t - t) < Math.abs(best.t - t))) best = c;
      if (best && Math.abs(best.t - t) <= CHATTER_MS) m.set(i.id, best.tag);
    }
  }
  chatterCache.set(list, m);
  return m;
}

// Unread counts firings, not rows: one payload firing (a DNS burst plus the HTTP fetch that
// follows it) reads as one event. Unseen hits less than EVENT_GAP_MS apart are one event.
export const EVENT_GAP_MS = 3_000;
export function unreadFor(s: AppState, key: string) {
  const seen = s.seen[key] || 0;
  const chatter = key === UNTAGGED ? chatterOf(s.list) : null;
  const steps = dnsSteps(s.list); // resolver steps toward a longer name are part of that lookup, not news
  const times: number[] = [];
  for (const i of s.list) { if (i.id <= seen) break; if (keyOf(i) === key && !chatter?.has(i.id) && !steps.has(i.id)) times.push(isoMs(i.timestamp)); }
  if (!times.length) return 0;
  times.sort((a, b) => a - b);
  let n = 1;
  for (let k = 1; k < times.length; k++) if (times[k] - times[k - 1] > EVENT_GAP_MS) n++;
  return n;
}
export function totalUnread(s: AppState) {
  let t = unreadFor(s, UNTAGGED);
  for (const p of s.probes.values()) if (!hiddenRetired(p)) t += unreadFor(s, p.tag);
  return t;
}
// a retired probe sits in the collapsed Retired group until it hears something after retiring
export const lateHit = (p: { retiredAt?: string | null; lastHitAt?: string | null }) => !!(p.retiredAt && p.lastHitAt && isoMs(p.lastHitAt) > isoMs(p.retiredAt));
export const hiddenRetired = (p: { retiredAt?: string | null; lastHitAt?: string | null }) => !!p.retiredAt && !lateHit(p);
// unread hits inside the collapsed Retired group (shown on its header; the rail badge leaves them out)
export function retiredUnread(s: AppState) {
  let t = 0;
  for (const p of s.probes.values()) if (hiddenRetired(p)) t += unreadFor(s, p.tag);
  return t;
}
export function markSeen(key: string, keepOpen = true) {
  const newest = state.list.find((i) => keyOf(i) === key)?.id || 0;
  const openSeen = keepOpen && !(key in state.openSeen) ? { ...state.openSeen, [key]: state.seen[key] || 0 } : state.openSeen;
  const seen = { ...state.seen, [key]: Math.max(state.seen[key] || 0, newest) };
  save("colluder.seen", seen);
  set({ seen, openSeen });
}

// ---------- selection ----------
export function select(key: string | null, push = true) {
  if (key && key !== UNTAGGED && !state.probes.has(key)) return;
  if (state.sel !== key) {
    const openSeen = { ...state.openSeen };
    if (key) delete openSeen[key];
    set({ sel: key, hit: null, hitPicked: false, openSeen });
  }
  if (key && !document.hidden && viewingHits()) markSeen(key);
  if (push && key) writeHash();
}
// hits only count as read while the Hits tab is in view (Unregistered has no other tabs)
const viewingHits = () => state.tab === "hits" || state.sel === UNTAGGED;
function writeHash() {
  const key = state.sel;
  if (!key) return;
  const tab = key !== UNTAGGED && state.tab !== "hits" ? "/" + state.tab : "";
  history.replaceState(null, "", "#probes/" + (key === UNTAGGED ? "unregistered" : encodeURIComponent(key)) + tab);
  dispatchEvent(new Event("hashchange")); // replaceState is silent; keep the router's view of the URL in step
}
export function setTab(tab: ProbeTab, push = true) {
  if (state.tab !== tab) set({ tab });
  if (state.sel && !document.hidden && viewingHits()) markSeen(state.sel);
  if (push) writeHash();
}
export const selectHit = (id: number | null, picked = true) => set({ hit: id, hitPicked: picked && id != null });
// the plant form: opened from the Plant button (or p, /), folded again once the probe is planted
export const setPlanting = (planting: boolean) => { if (state.planting !== planting) set({ planting }); };

export async function loadDetail(id: number) {
  if (state.details.has(id)) return;
  const d = await api<InteractionDetail>(`/api/interactions/${id}`);
  const details = new Map(state.details).set(id, d);
  const enrich = d.enrich ? new Map(state.enrich).set(d.remoteAddress, d.enrich) : state.enrich;
  set({ details, enrich });
}

// ---------- actions ----------
export async function plant(tag: string, target: string, technique: string, rule?: HttpRule, served?: string) {
  const existed = state.probes.has(tag);
  const p = await api<Probe>("/api/probes", { method: "POST", body: { tag, target, technique, ...(rule ? { rule } : {}) } });
  set({ probes: new Map(state.probes).set(p.tag, p) });
  // Redirect / Hosted file: plant, then open the HTTP response tab ready to set it up
  const seed = technique === "redirect" || technique === "file" ? technique : null;
  set({ ruleSeed: seed && !p.httpRule ? { tag: p.tag, mode: seed } : null });
  if (seed) setTab("http", false);
  select(p.tag);
  if (rule) { toast(`Planted ${tag}: it now serves ${served ?? "its rule"}. Copy a payload from its header.`); return; }
  toast(existed ? `${tag} already planted: target updated` : seed ? `Planted ${tag}: set up its ${seed === "file" ? "hosted file" : "redirect"}, then copy a payload` : `Planted ${tag}: copy a payload`);
}
export async function patchProbe(tag: string, body: { target?: string; note?: string; trigger?: string; retired?: boolean; muted?: boolean }) {
  const p = await api<Probe>(`/api/probes/${tag}`, { method: "PATCH", body });
  set({ probes: new Map(state.probes).set(p.tag, p) });
}
// Delete a retired probe (or a tag nobody planted) for good: the probe, its stored hits, its rules
function dropProbe(tag: string) {
  if (!state.probes.has(tag)) return;
  const probes = new Map(state.probes);
  probes.delete(tag);
  const older = { ...state.older };
  delete older[tag];
  const wasSel = state.sel === tag;
  set({ probes, older, list: state.list.filter((i) => i.tag !== tag), ...(wasSel ? { sel: null, hit: null } : {}) });
  if (wasSel) { history.replaceState(null, "", "#probes"); dispatchEvent(new Event("hashchange")); }
}
export async function deleteProbe(tag: string) {
  const r = await api<{ deleted: string; hits: number }>(`/api/probes/${encodeURIComponent(tag)}`, { method: "DELETE", body: {} });
  dropProbe(tag);
  return r.hits;
}
export async function lookupAsn(ip: string) {
  const e = await api<Enrich>(`/api/enrich/${encodeURIComponent(ip)}/asn`, { method: "POST", body: {} });
  set({ enrich: new Map(state.enrich).set(ip, e) });
}
// a source you mark as yours (your browser, Caido) is a self-test from then on, everywhere
export async function setMine(ip: string, mine: boolean) {
  const r = await api<{ mineIps: string[] }>(`/api/sources/mine`, { method: "POST", body: { ip, mine } });
  if (state.status) set({ status: { ...state.status, mineIps: r.mineIps } });
}
// ---------- B4: a probe's full history ----------
const hitsPath = (key: string) => `/api/probes/${key === UNTAGGED ? "__untagged" : encodeURIComponent(key)}`;
export async function loadOlder(key: string, before: number) {
  const r = await api<{ hits: Interaction[] }>(`${hitsPath(key)}/hits?before=${before}&limit=200`);
  const have = new Set((state.older[key] ?? []).map((i) => i.id));
  set({
    older: { ...state.older, [key]: [...(state.older[key] ?? []), ...r.hits.filter((i) => !have.has(i.id))] },
    olderDone: { ...state.olderDone, [key]: r.hits.length < 200 },
  });
}
export const searchHits = (key: string, q: string, types: string[]) =>
  api<{ hits: Interaction[] }>(`${hitsPath(key)}/hits?limit=500&q=${encodeURIComponent(q)}&type=${types.join(",")}`).then((r) => r.hits);
export const fetchTrigger = (tag: string) => api<{ trigger: string }>(`/api/probes/${encodeURIComponent(tag)}/trigger`).then((r) => r.trigger);
// C1: the probe report is built on the server from every stored hit; plain Markdown text
export async function fetchReport(tag: string) {
  const r = await fetch(`/api/probes/${encodeURIComponent(tag)}/report.md`, { headers: { accept: "text/markdown" } });
  if (!r.ok) throw new Error(`Couldn't build the report (HTTP ${r.status})`);
  return r.text();
}
export const exportUrl = (key: string) => `${hitsPath(key)}/export.jsonl`;

// ---------- HTTP answer rules (phase 2) ----------
export const fetchRule = (tag: string) => api<RuleState>(`/api/probes/${tag}/http-rule`);
export const previewRule = (tag: string, rule: HttpRule, scheme: "http" | "https", hop: number) =>
  api<{ raw?: string; delayMs?: number; error?: string }>(`/api/probes/${tag}/http-rule/preview`, { method: "POST", body: { rule, scheme, hop } });
export async function saveRule(tag: string, rule: HttpRule) {
  const r = await api<RuleState>(`/api/probes/${tag}/http-rule`, { method: "POST", body: { rule } });
  setRuleDraft(tag, null);
  return r;
}
export const takeRuleSeed = (tag: string) => {
  const s = state.ruleSeed;
  if (s?.tag !== tag) return null;
  set({ ruleSeed: null });
  return s.mode;
};
export function setRuleDraft(tag: string, draft: HttpRule | null) {
  if (!draft && !(tag in state.ruleDrafts)) return;
  const ruleDrafts = { ...state.ruleDrafts };
  if (draft) ruleDrafts[tag] = draft; else delete ruleDrafts[tag];
  set({ ruleDrafts });
}
// drafts live in memory only: ask before a reload or close throws them away
addEventListener("beforeunload", (e) => { if (Object.keys(state.ruleDrafts).length) e.preventDefault(); });
export const setDiscord = (on: boolean) => api("/api/settings", { method: "POST", body: { discord: on } });
// Settings that live on the server (lib/settings.mjs); the answer is the new status
export type ServerSettings = { webhookUrl?: string | null; discordKinds?: Partial<Record<AlertKind, boolean>>; checkMinutes?: number; payloadDomain?: string };
export async function saveSettings(b: ServerSettings) {
  const st = await api<Status>("/api/settings", { method: "POST", body: b });
  set({ status: st });
  return st;
}
export const testDiscord = () => api<{ ok: true }>("/api/discord/test", { method: "POST", body: {} });
// the outside check, now rather than at its next turn; the result also arrives as a status event
export const runCheck = () => api<CheckResult>("/api/check", { method: "POST", body: {} });
export const clearAll = () => api("/api/clear", { method: "POST", body: {} });
export const restoreClear = () => api("/api/restore", { method: "POST", body: {} });
// one probe's hits (null: the hits with no tag)
const scopePath = (tag: string | null) => (tag ? `/api/probes/${encodeURIComponent(tag)}` : "/api/untagged");
export const clearProbe = (tag: string | null) => api<{ cleared: number }>(`${scopePath(tag)}/clear`, { method: "POST", body: {} });
export const restoreProbe = (tag: string | null) => api<{ restored: number }>(`${scopePath(tag)}/restore`, { method: "POST", body: {} });

// ---------- the mailbox (PLAN-MAILBOX.md): its own list, fed by the stream while the page is open ----------
export type MailEvent = { type: "mail"; row: MailRow } | { type: "deleted"; id: number };
const mailSubs = new Set<(e: MailEvent) => void>();
export function onMail(fn: (e: MailEvent) => void) { mailSubs.add(fn); return () => { mailSubs.delete(fn); }; }
export const fetchMail = () => api<{ messages: MailRow[]; mailbox: Mailbox }>("/api/mail?limit=200");

// ---------- SSE ----------
let es: EventSource | null = null;
export function connect() {
  es?.close();
  set({ stream: { ...state.stream, state: state.stream.lastEventAt ? "reconnecting" : "connecting", since: Date.now() } });
  es = new EventSource("/api/stream");
  es.onopen = () => {
    const wasDown = state.stream.state !== "connected" && state.stream.lastEventAt;
    set({ stream: { state: "connected", since: Date.now(), lastEventAt: Date.now() } });
    if (wasDown) loadState(); // catch up on anything missed while disconnected
  };
  es.onerror = () => {
    if (state.stream.state === "connected") set({ stream: { ...state.stream, state: "reconnecting", since: Date.now() } });
  };
  const on = <T,>(ev: string, fn: (d: T) => void) =>
    es!.addEventListener(ev, (e) => {
      state.stream.lastEventAt = Date.now();
      try { fn(JSON.parse((e as MessageEvent).data) as T); } catch (err) { console.error(ev, err); }
    });
  on<Status>("status", (s) => set({ status: s }));
  on<Interaction>("interaction", onInteraction);
  on<Probe | null>("probe", (p) => { if (p) set({ probes: new Map(state.probes).set(p.tag, p) }); });
  on<Counts>("untagged", (u) => set({ untagged: u }));
  on<{ tag: string }>("probe-deleted", (d) => dropProbe(d.tag));
  on<Enrich>("enrich", (e) => set({ enrich: new Map(state.enrich).set(e.ip, e) }));
  on<MailRow>("mail", (row) => mailSubs.forEach((f) => f({ type: "mail", row })));
  on<{ id: number }>("mail-deleted", (d) => mailSubs.forEach((f) => f({ type: "deleted", id: d.id })));
  on<Mailbox>("mailbox", (m) => { if (state.status) set({ status: { ...state.status, mailbox: m } }); });
  on<{ reason: string; count: number; tag?: string | null }>("reload", (d) => {
    const whose = d.tag === undefined ? "" : d.tag ? ` from ${d.tag}` : " with no tag";
    toast(d.reason === "cleared" ? (d.tag === undefined ? `Took out the trash: ${plural(d.count, "interaction")} hidden` : `Cleared ${plural(d.count, "hit")}${whose}. Restore brings them back.`) : `Restored ${plural(d.count, "hit")}${whose}`);
    set({ details: new Map(), hit: null });
    loadState();
  });
}

// the chime counts firings like unread does: resolver chatter, steps toward a longer name, and your own
// sources (this box, sources marked yours) don't ring; hits less than EVENT_GAP_MS apart ring once
let lastWorthyAt = 0;
function maybeChime(row: Interaction, list: Interaction[]) {
  const d = getDisplay();
  if (d.chime === "off" || (d.chime === "hidden" && !document.hidden)) return;
  if ((state.status?.selfIps ?? []).includes(row.remoteAddress) || (state.status?.mineIps ?? []).includes(row.remoteAddress)) return;
  if ((!row.tag && chatterOf(list).has(row.id)) || dnsSteps(list).has(row.id)) return;
  const now = Date.now(), quiet = now - lastWorthyAt > EVENT_GAP_MS;
  lastWorthyAt = now;
  if (quiet) chime();
}

function onInteraction(row: Interaction) {
  if (state.list.some((i) => i.id === row.id)) return;
  const list = [row, ...state.list].slice(0, 5000);
  set({ list, arrived: row.id, lit: keyOf(row), pulse: state.pulse + 1 });
  maybeChime(row, list);
  if (keyOf(row) === state.sel && !document.hidden && location.hash.startsWith("#probes") && viewingHits()) markSeen(keyOf(row), false);
}

// a silent stream is a dead stream: the server sends status every 5 s
setInterval(() => {
  if (state.stream.state === "connected" && Date.now() - state.stream.lastEventAt > 20000) connect();
}, 1000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.sel && viewingHits()) markSeen(state.sel);
});

// One probe, one state, one set of words (audit 2026-11-06): the list row, the probe pane, the payload
// band and the status bar all read it from here, so they can't contradict each other.
import { dayOrTime, isoMs } from "./format.ts";

type P = { registered?: number | boolean; retiredAt?: string | null; lastHitAt?: string | null; plantedAt?: string | null; hits: number; clearedAt?: string | null };

// the clear that explains an empty probe: its own, or a clear of everything after it was planted
export function lastClearFor(p: P, globalAt?: string | null): string | null {
  const g = globalAt && isoMs(globalAt) > (isoMs(p.plantedAt) || 0) ? globalAt : null;
  const own = p.clearedAt ?? null;
  if (!g) return own;
  if (!own) return g;
  return isoMs(own) > isoMs(g) ? own : g;
}

export type ProbeState =
  | "armed" //     planted, listening, nothing (since the last clear)
  | "heard" //     planted, has hits
  | "retired" //   retired, quiet since
  | "late" //      retired, then a hit arrived: often the real bug
  | "unplanted"; // a request named this tag; nobody planted it

export function probeState(p: P): ProbeState {
  if (!p.registered) return "unplanted";
  const late = !!(p.retiredAt && p.lastHitAt && isoMs(p.lastHitAt) > isoMs(p.retiredAt));
  if (p.retiredAt) return late ? "late" : "retired";
  return p.hits > 0 ? "heard" : "armed";
}

export const STATE_WORD: Record<ProbeState, string> = {
  armed: "Armed", heard: "Armed", retired: "Retired", late: "Late hit", unplanted: "Not planted",
};

// Why a probe shows no hits: never planted it, nothing yet, or a clear took them out of view.
export function quietLine(p: P, lastClearAt?: string | null): string {
  const at = lastClearFor(p, lastClearAt);
  const since = at ? `No hits since the clear at ${dayOrTime(at)}` : "No hits yet";
  if (!p.registered) return `${since} · first seen ${dayOrTime(p.plantedAt)}`;
  if (p.retiredAt) return `${since} · retired ${dayOrTime(p.retiredAt)}`;
  return `${since} · planted ${dayOrTime(p.plantedAt)}`;
}

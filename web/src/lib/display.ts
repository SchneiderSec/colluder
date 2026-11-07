// Display preferences (Settings > Display). Kept per browser, like the text size: the dashboard is
// read from a desk monitor and a phone, and other people on the tailnet see it too, so one browser's
// choices never change another's. Applied as attributes on <html>, which index.css themes from.
import { useSyncExternalStore } from "react";

export const DARK_THEMES = ["dark", "contrast", "dracula", "nord", "tokyo"] as const;
export type DarkTheme = (typeof DARK_THEMES)[number];
export type Theme = DarkTheme | "light" | "system";
export type Inks = "colluder" | "safe";
export type Motion = "full" | "still" | "none";
export type Night = "auto" | "off";
export type Chime = "off" | "firings" | "hidden";
export type HitsHeight = "short" | "tall" | "half";
export type Display = { theme: Theme; dark: DarkTheme; inks: Inks; motion: Motion; night: Night; chime: Chime; hits: HitsHeight };

const DEFAULTS: Display = { theme: "dark", dark: "dark", inks: "colluder", motion: "full", night: "auto", chime: "off", hits: "short" };
const ALLOWED: { [K in keyof Display]: readonly Display[K][] } = {
  theme: [...DARK_THEMES, "light", "system"], dark: DARK_THEMES, inks: ["colluder", "safe"], motion: ["full", "still", "none"],
  night: ["auto", "off"], chime: ["off", "firings", "hidden"], hits: ["short", "tall", "half"],
};
const KEY = "colluder.display";

function read(): Display {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Display>;
    const out = { ...DEFAULTS };
    for (const k of Object.keys(ALLOWED) as (keyof Display)[]) if ((ALLOWED[k] as readonly string[]).includes(saved[k] as string)) (out as Record<string, string>)[k] = saved[k] as string;
    return out;
  } catch { return { ...DEFAULTS }; }
}

let current = read();
const subs = new Set<() => void>();
const light = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null;

// the theme actually drawn: "system" follows the OS, light or the dark theme picked last
export const shownTheme = (d: Display = current): Exclude<Theme, "system"> => (d.theme === "system" ? (light?.matches ? "light" : d.dark) : d.theme);
export const isDark = (t: Theme): t is DarkTheme => (DARK_THEMES as readonly string[]).includes(t);

function apply() {
  const el = document.documentElement;
  el.dataset.theme = shownTheme();
  el.dataset.inks = current.inks;
  el.dataset.motion = current.motion;
  // shadcn's dark: variants and the browser's own controls follow the ground
  el.classList.toggle("dark", el.dataset.theme !== "light");
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", el.dataset.theme === "light" ? "light" : "dark");
}

export function setDisplay<K extends keyof Display>(k: K, v: Display[K]) {
  current = { ...current, [k]: v };
  if (k === "theme" && isDark(v as Theme)) current.dark = v as DarkTheme; // what "Match system" uses at night
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode: this load only */ }
  apply();
  subs.forEach((f) => f());
}
export const getDisplay = () => current;

const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
export const useDisplay = () => useSyncExternalStore(subscribe, getDisplay);

// night shift (DESIGN.md): midnight to 05:00 local, on the dark grounds only, unless switched off
export const nightNow = (d: Display, at = new Date()) => d.night === "auto" && shownTheme(d) !== "light" && at.getHours() < 5;

apply();
light?.addEventListener("change", () => { if (current.theme === "system") { apply(); subs.forEach((f) => f()); } });

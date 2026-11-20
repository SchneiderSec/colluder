// Display preferences (Settings > Display). Kept per browser, like the text size: the dashboard is
// read from a desk monitor and a phone, and other people on the tailnet see it too, so one browser's
// choices never change another's. Applied as attributes on <html>, which index.css themes from.
import { useSyncExternalStore } from "react";
import { setLocalZone, setTwelveHour } from "./format";

export const DARK_THEMES = ["dark", "contrast", "dracula", "nord", "tokyo", "mocha", "gruvbox"] as const;
export type DarkTheme = (typeof DARK_THEMES)[number];
export const LIGHT_THEMES = ["light", "latte", "solarized"] as const;
export type LightTheme = (typeof LIGHT_THEMES)[number];
export type Theme = DarkTheme | LightTheme | "system";
export type Inks = "colluder" | "safe";
export type Motion = "full" | "still" | "none";
export type Night = "auto" | "off";
export type Chime = "off" | "firings" | "hidden";
export type HitsHeight = "short" | "tall" | "half";
export type Clock = "24" | "12";
export type Zone = "utc" | "local";
export type Display = { theme: Theme; dark: DarkTheme; light: LightTheme; clock: Clock; zone: Zone; inks: Inks; motion: Motion; night: Night; chime: Chime; hits: HitsHeight };

// the default follows the system: Strip Bay is a matched dark and light pair (docs/DESIGN.md)
const DEFAULTS: Display = { theme: "system", dark: "dark", light: "light", clock: "24", zone: "utc", inks: "colluder", motion: "full", night: "auto", chime: "off", hits: "short" };
const ALLOWED: { [K in keyof Display]: readonly Display[K][] } = {
  theme: [...DARK_THEMES, ...LIGHT_THEMES, "system"], dark: DARK_THEMES, light: LIGHT_THEMES, clock: ["24", "12"], zone: ["utc", "local"], inks: ["colluder", "safe"], motion: ["full", "still", "none"],
  night: ["auto", "off"], chime: ["off", "firings", "hidden"], hits: ["short", "tall", "half"],
};
const KEY = "colluder.display";
// v2 (Strip Bay): "system" became the default. A browser saved before then holds "dark" because it
// was the old default, so it moves to "system" once; any other theme it picked is kept.
const VERSION = 2;

function read(): Display {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Display> & { v?: number };
    if (saved.v !== VERSION && saved.theme === "dark") delete saved.theme;
    const out = { ...DEFAULTS };
    for (const k of Object.keys(ALLOWED) as (keyof Display)[]) if ((ALLOWED[k] as readonly string[]).includes(saved[k] as string)) (out as Record<string, string>)[k] = saved[k] as string;
    return out;
  } catch { return { ...DEFAULTS }; }
}

let current = read();
const subs = new Set<() => void>();
const osLight = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null;

// the theme actually drawn: "system" follows the OS, with the light or dark theme picked last
export const shownTheme = (d: Display = current): Exclude<Theme, "system"> => (d.theme === "system" ? (osLight?.matches ? d.light : d.dark) : d.theme);
export const isDark = (t: Theme): t is DarkTheme => (DARK_THEMES as readonly string[]).includes(t);
export const isLight = (t: Theme): t is LightTheme => (LIGHT_THEMES as readonly string[]).includes(t);

function apply() {
  const el = document.documentElement;
  const shown = shownTheme(), lit = isLight(shown);
  el.dataset.theme = shown;
  el.dataset.scheme = lit ? "light" : "dark";
  el.dataset.inks = current.inks;
  el.dataset.motion = current.motion;
  // shadcn's dark: variants and the browser's own controls follow the ground
  el.classList.toggle("dark", !lit);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", lit ? "light" : "dark");
  setTwelveHour(current.clock === "12");
  setLocalZone(current.zone === "local");
}

export function setDisplay<K extends keyof Display>(k: K, v: Display[K]) {
  current = { ...current, [k]: v };
  // what "Match system" uses: the dark theme picked last at night, the light one by day
  if (k === "theme" && isDark(v as Theme)) current.dark = v as DarkTheme;
  if (k === "theme" && isLight(v as Theme)) current.light = v as LightTheme;
  try { localStorage.setItem(KEY, JSON.stringify({ ...current, v: VERSION })); } catch { /* private mode: this load only */ }
  apply();
  subs.forEach((f) => f());
}
export const getDisplay = () => current;

const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
export const useDisplay = () => useSyncExternalStore(subscribe, getDisplay);

// night shift (docs/DESIGN.md): midnight to 05:00 local, on the dark grounds only, unless switched off
export const nightNow = (d: Display, at = new Date()) => d.night === "auto" && !isLight(shownTheme(d)) && at.getHours() < 5;

apply();
osLight?.addEventListener("change", () => { if (current.theme === "system") { apply(); subs.forEach((f) => f()); } });

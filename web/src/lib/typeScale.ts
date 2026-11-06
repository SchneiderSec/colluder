// Text size (audit 2026-11-06): "compact" is the 12.5px working size; "comfortable" raises the four
// sizes by 8% (12.5 → 13.5) for reading from beside the proxy. Kept per browser.
export type TypeScale = "compact" | "comfortable";
const KEY = "colluder.textSize";
export function readTypeScale(): TypeScale {
  try { return localStorage.getItem(KEY) === "comfortable" ? "comfortable" : "compact"; } catch { return "compact"; }
}
export function applyTypeScale(v: TypeScale, keep = true) {
  document.documentElement.classList.toggle("type-comfortable", v === "comfortable");
  if (keep) try { localStorage.setItem(KEY, v); } catch { /* private mode: this load only */ }
}

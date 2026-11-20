// Theme tokens (web/src/index.css, docs/DESIGN.md "Themes"): every text ink holds 4.5:1 on every ground
// it sits on, and each theme keeps the Strip Bay steps the default is built on, so no theme drifts.
// Run: node --test web/test/themes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
// oklch(L C H) to #rrggbb, so the syntax inks written that way are checked too
const fromOklch = (L: number, C: number, H: number) => {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  const enc = (x: number) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)));
  return "#" + rgb.map((x) => enc(x).toString(16).padStart(2, "0")).join("");
};
const vars = (body: string) => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6}\b|oklch\(([\d.]+) ([\d.]+) ([\d.]+)\))/g)]
  .map((m) => [m[1], m[3] ? fromOklch(+m[3], +m[4], +m[5]) : m[2]]));
const block = (sel: RegExp) => { const m = css.match(sel); assert.ok(m, `no block for ${sel}`); return vars(m![1]); };
const base = block(/^:root, \[data-theme-preview="dark"\] \{([\s\S]*?)\n\}/m);
const THEMES = ["dark", "contrast", "dracula", "nord", "tokyo", "mocha", "gruvbox", "light", "latte", "solarized"] as const;
const LIGHT = new Set(["light", "latte", "solarized"]);
const theme = (t: string) => (t === "dark" ? { ...base } : { ...base, ...block(new RegExp(`^:root\\[data-theme="${t}"\\], \\[data-theme-preview="${t}"\\] \\{([\\s\\S]*?)\\n\\}`, "m")) });
// colour-blind-safe inks: the generic line, then any line that names the theme
const safeLines = [...css.matchAll(/^(:root\[data-inks="safe"\][^{]*)\{([^}]*)\}/gm)];
const safe = (t: string) => Object.assign({}, ...safeLines.filter(([, sel], i) => i === 0 || sel.includes(`"${t}"`)).map(([, , body]) => vars(body)));

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// OKLab lightness, for the steps between grounds
const okL = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
};

const GROUNDS = ["bay", "soot", "soot-1", "soot-2", "well", "hover", "child", "band"];
const TEXT = ["bone", "smoke", "ash", "amber", "bad", "ink-dns", "ink-http", "ink-https", "ink-smtp", "ink-other", "syn-name", "syn-value"];

for (const t of THEMES) {
  const v = theme(t);
  v.band ??= v["soot-1"]; // --band: var(--soot-1) unless the theme sets its own
  test(`${t}: every text ink holds 4.5:1 on every ground`, () => {
    const low = TEXT.flatMap((ink) => GROUNDS.map((g) => [ink, g, ratio(v[ink], v[g])] as const)).filter(([, , r]) => r < 4.5);
    assert.deepEqual(low.map(([i, g, r]) => `${i} on ${g} ${r.toFixed(2)}`), []);
  });
  test(`${t}: colour-blind-safe inks hold 4.5:1 on every ground`, () => {
    const s = safe(t);
    assert.equal(Object.keys(s).length, 4);
    const low = Object.entries(s).flatMap(([ink, c]) => GROUNDS.map((g) => [ink, g, ratio(c, v[g])] as const)).filter(([, , r]) => r < 4.5);
    assert.deepEqual(low.map(([i, g, r]) => `safe ${i} on ${g} ${r.toFixed(2)}`), []);
  });
  test(`${t}: banner and mark pairs hold 4.5:1`, () => {
    for (const [ink, g] of [["alarm-ink", "alarm-ground"], ["alarm-banner-ink", "alarm-ground"], ["caution-ink", "caution-ground"], ["amber", "caution-ground"], ["bone", "mark"], ["bone", "selection"], ["primary-foreground", "bone"]] as const) {
      const fg = ink === "primary-foreground" ? v.soot : v[ink];
      assert.ok(ratio(fg, v[g]) >= 4.5, `${ink} on ${g}: ${ratio(fg, v[g]).toFixed(2)}`);
    }
  });
  test(`${t}: the ultrathink rainbow holds 4.5:1 on every ground`, () => {
    const low = [1, 2, 3, 4, 5, 6, 7].flatMap((i) => GROUNDS.map((g) => [`rb-${i}`, g, ratio(v[`rb-${i}`], v[g])] as const)).filter(([, , r]) => r < 4.5);
    assert.deepEqual(low.map(([i, g, r]) => `${i} on ${g} ${r.toFixed(2)}`), []);
  });
  if (LIGHT.has(t)) {
    test(`${t}: a darker bay frames light strips, selected sits between, and the text tiers stay apart`, () => {
      const L = (k: string) => okL(v[k]);
      assert.ok(L("soot") - L("bay") >= 0.06, `strip off the bay: ${(L("soot") - L("bay")).toFixed(3)}`);
      assert.ok(L("soot") - L("soot-2") >= 0.06 && L("soot-2") > L("bay"), `selected between bay and strip (${L("soot-2").toFixed(3)})`);
      assert.ok(L("hover") < L("soot") && L("hover") > L("soot-2") + 0.02, `hover between strip and selected (${L("hover").toFixed(3)})`);
      assert.ok(L("soot-2") - L("rule") >= 0.1, "edges read against the selected fill");
      assert.ok(L("soot") - L("band") >= 0.02 && L("band") > L("soot-2"), `header band a step below the strip (${(L("soot") - L("band")).toFixed(3)})`);
      assert.ok(lum(v.smoke) / lum(v.bone) >= 1.35, `smoke/bone ${(lum(v.smoke) / lum(v.bone)).toFixed(2)}`);
      assert.ok(lum(v.ash) / lum(v.smoke) >= 1.2, `ash/smoke ${(lum(v.ash) / lum(v.smoke)).toFixed(2)}`);
    });
    continue;
  }
  test(`${t}: grounds step up from bay to selected, and the three text tiers stay apart`, () => {
    const L = (k: string) => okL(v[k]);
    // bay < strip < raised < selected, hover between strip and selected; each step big enough to see
    assert.ok(L("soot") - L("bay") >= 0.035, `strip off the bay: ${(L("soot") - L("bay")).toFixed(3)}`);
    assert.ok(L("soot-1") > L("soot"), "raised above strip");
    assert.ok(L("hover") > L("soot") && L("hover") < L("soot-2") - 0.02, `hover between strip and selected (${L("hover").toFixed(3)} vs ${L("soot-2").toFixed(3)})`);
    assert.ok(L("soot-2") - L("soot") >= 0.06, `selected off the strip: ${(L("soot-2") - L("soot")).toFixed(3)}`);
    assert.ok(L("rule") - L("soot-2") >= 0.055, "edges read against the selected fill");
    assert.ok(L("band") - L("soot") >= 0.02 && L("band") < L("soot-2"), `header band a step above the strip (${(L("band") - L("soot")).toFixed(3)})`);
    // readability pass: Smoke and Ash sit well apart from Bone, not merged into one tier
    assert.ok(lum(v.bone) / lum(v.smoke) >= 1.35, `bone/smoke ${(lum(v.bone) / lum(v.smoke)).toFixed(2)}`);
    assert.ok(lum(v.smoke) / lum(v.ash) >= 1.2, `smoke/ash ${(lum(v.smoke) / lum(v.ash)).toFixed(2)}`);
  });
}

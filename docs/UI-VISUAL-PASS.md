# Colluder UI — Focused Visual Consumption & Operator Ergonomics Pass

**Audit date:** 2026-11-22  
**Baseline:** `f1989ab` (`ux-sprint-2` merged/committed; `ux-sprint-3` in progress)  
**Audience:** An implementing engineering/design session picking this up after `ux-sprint-3` lands.  
**Scope:** Visual hierarchy, scannability, spatial budgets, signal-to-noise ratio, and operator ergonomics across every Colluder surface (`Probes`, `HitDetail`, `HttpView`, `Answer`, `Composer`, `Mailbox`, `Payload kit`, `StatusBar`).

> **Relationship to `docs/UX-UI-IMPROVEMENTS.md` and `PLAN-UX.md`:**  
> Sprints 1 (`25b6136`) and 2 (`f1989ab`) are committed (`UX-01`–`UX-15`, `UX-20`), and Sprint 3 (`UX-16`–`UX-19`: multi-hop diff, drag splitter, mobile hit rows, keyboard shortcuts) is in flight on `ux-sprint-3`. This document intentionally avoids duplicating those functional sprints; it is a focused **visual consumption & operator ergonomics pass** covering the structural visual friction that remains across the UI.

---

## 1. How an Operator Actually Uses Colluder (Design Lens)

Every change below is judged against three real operating modes from [docs/PRODUCT.md](PRODUCT.md):

1. **Across-the-desk peripheral scan (second monitor beside Caido/Burp):**  
   In 0.5 seconds, can the operator tell: *Is the engine/edge alive? Which probe fired? Was it just DNS resolver noise or an actual HTTP/XXE/exfil hit? What did the edge answer?*
2. **Active exploitation & triage loop (1280×800 laptop or 1440×900 display):**  
   Plant or tweak a rule → copy payload → fire from proxy → watch hits land → inspect request headers, decoded query/exfil, and redirect hops → copy evidence or curl. Every wasted vertical pixel of chrome or truncated column forces extra scrolling and context switching.
3. **High-volume / multi-probe / mobile check-in:**  
   20+ probes (including Claude MCP probes), 25 DNS hits per 2 HTTP hits, multi-day probes, OTP emails in Mailbox, quick checks from a phone over the tailnet.

---

## 2. Non-Negotiable Design Guardrails

Read [docs/DESIGN.md](DESIGN.md) before editing. Every change must preserve:

- **Strip Bay architecture:** Neutral graphite bay (`--bay`) framing 1px-edged flat strips (`--soot`, `--soot-1`, `--soot-2`), `--well` for raw bytes and recessed text inputs, `--band` for table column headers. `--rule` divides distinct objects/regions; `--rule-2` divides repeated siblings inside one object only.
- **The Eyeshine Rule:** Amber (`--amber`) means *unread/new* (and the raccoon mark's eyes) and **nothing else**. Never use amber for warnings, buttons, active tabs, or links.
- **The Word-Beside-Ink Rule:** Protocol colors (`--ink-dns`, `--ink-http`, `--ink-https`, `--ink-smtp`) never appear without their text word.
- **The Four Sizes Rule:** Only `text-label` (11px), `text-body` (12.5px), `text-title` (13.5px), and `text-headline` (17px) via `--type-scale`. Never introduce arbitrary `px` font sizes.
- **The Mono-Is-Data Rule:** `Fragment Mono` is for literal copyable values only (tags, IPs, payloads, hashes, timestamps in custody, raw bytes).
- **Evidence safety & copy fidelity:** All remote/attacker-controlled strings render strictly as React text nodes (never HTML or live links). Raw `Copy` / `Copy both` / `Copy as evidence` always deliver exact stored bytes; any decoded or single-field copy must be explicitly labeled.
- **Automated contrast gate:** Run `node --test web/test/themes.test.ts` after any token/surface change (4.5:1 across all 10 themes + color-blind-safe inks).

---

## 3. Priority Overview Matrix

| ID | Wave | Priority | Effort | Title | Primary Files |
|---|---|---|---|---|---|
| **VP-01** | Wave 1 | **P0** | S | Fix `@max-[440px]/pane` header stacking trap in `HttpView` + hover-copy values | `web/src/components/HttpView.tsx` |
| **VP-02** | Wave 1 | **P0** | M | Finish Hits table width reclaim (`#` & `Source`), restore muted `:SS` timing, split `Request` cell (URL left, edge verdict right), quiet plain DNS | `web/src/components/ProbePane.tsx`, `web/src/lib/format.ts` |
| **VP-03** | Wave 1 | **P0** | S–M | Flatten & visually zone `ProbePane` vertical chrome stack, fix hardcoded `40px` tab track, add visible hover grip to `Splitter` | `web/src/components/ProbePane.tsx` |
| **VP-04** | Wave 1 | **P0** | S–M | De-bloat `HitDetail` top strip (merge redundant lines, tooltip caveats, quiet inline actions, flush Custody footer) | `web/src/components/HitDetail.tsx` |
| **VP-05** | Wave 1 | **P1** | S | Fix Eyeshine Rule violation (`text-amber` on unsaved rule + 1-click Answer jump), trim Composer preset prose walls | `web/src/components/Composer.tsx` |
| **VP-06** | Wave 2 | **P1** | M | Probe Tabs "Dock list" button, discoverable Probe List facets, resizable docked list, `Mark all read`, uncrowded Row 1 | `web/src/components/ProbeTabs.tsx`, `web/src/components/ProbeList.tsx`, `web/src/App.tsx`, `web/src/store.ts` |
| **VP-07** | Wave 2 | **P1** | M | Answer tab: syntax-tinted `Next answer`, sticky aside, readable 2-line `Rule history`, `Live` vs `Unsaved` badge, elevated Save footer | `web/src/components/HttpRule.tsx`, `web/src/components/HttpView.tsx` |
| **VP-08** | Wave 2 | **P1** | S | Standardize recessed input wells (`bg-well`) and toolbar control heights (`h-7` headers / `h-6` pane bars) | `ProbeList.tsx`, `ProbePane.tsx`, `Mailbox.tsx`, `HttpRule.tsx` |
| **VP-09** | Wave 2 | **P1** | S–M | Mailbox: eliminate double-scroll trap, natural local-part input + visible `Copy` button, per-message read clearing, aligned metadata labels | `web/src/components/Mailbox.tsx` |
| **VP-10** | Wave 3 | **P2** | S | Payload kit: fix encoded copy toast bug, row hover tracking, `CrewMark` in probe select, `Redirect here` on Address forms | `web/src/components/PayloadKit.tsx` |
| **VP-11** | Wave 3 | **P2** | S | StatusBar: clickable affordance & protocol square on `Last hit`, copyable payload host down to `1360px`, diagnostic links | `web/src/components/Shell.tsx` |

---

## 4. Detailed Specifications

### VP-01 [P0] Fix the `@max-[440px]/pane` Header Stacking Trap in `HttpView`

**Where:** `web/src/components/HttpView.tsx:122-137` (`Pairs`), `:201-216` (`HttpParsed`)

**What the operator experiences today:**  
On a 1280px–1440px screen with the docked probe list open (or split window), each side-by-side `RawPane` inside `HitDetail` measures ~380–430px wide—just *under* the `440px` container query in `Pairs`:
```tsx
<dl className="m-0 grid grid-cols-[fit-content(24ch)_minmax(0,1fr)] gap-x-4 gap-y-[3px] @max-[440px]/pane:grid-cols-1 @max-[440px]/pane:gap-y-0">
```
Because of `@max-[440px]/pane:grid-cols-1`, **every single HTTP header and query parameter stacks into two vertical lines with a `6px` top margin (`mt-1.5`)**. Look at `docs/screenshots/claude-ssrf-probe.png` and `docs/screenshots/xxe-evidence.png`: only 3–4 headers fit in the entire Request/Response viewport (`↓ 15 more lines`) even though the header names (`Host`, `Connection`, `Location`, `Server`) are 4–10 characters wide!

**Changes:**
1. Lower the single-column stacking threshold from `@max-[440px]/pane` to **`@max-[310px]/pane`**.
2. Tighten the key track from `fit-content(24ch)` to **`fit-content(18ch)`** with `gap-x-3 gap-y-[2px]` (long headers like `Access-Control-Allow-Credentials` wrap cleanly at hyphens via `[overflow-wrap:anywhere]` without blowing out the column).
3. **Add hover-only per-value copy in `Parsed` view:** When inspecting a `Query` parameter or a `Headers` row (especially flagged `credential` / `forwarded for` values), render a subtle `opacity-0 group-hover/pair:opacity-100 focus-visible:opacity-100` `Copy` icon button (`size-5`, `aria-label="Copy <name> value"`) at the end of `<dd>` that copies the raw/decoded value (`copy(rawValue, `${name} value`)`). Never interferes with text selection and never changes the pane's exact-byte `Copy` button.
4. Keep the `Parsed` response headers readable: optionally apply the same collapsible standard-header fold (`+N standard CORS/transport headers`, default open or collapsed only for Colluder's own default reply boilerplate) if `p.kind === "response"` and `p.headers.length >= 7`—or evaluate after fixing the 440px stacking bug first, since fixing stacking alone doubles visible lines!

**Acceptance criteria:**
- At `1280×800` and `1440×900` (both docked list and tabs mode), `Headers` and `Query` render side-by-side (`Name   Value` on one line) inside both Request and Response panes.
- Narrow panes (`<310px`, e.g. mobile) still stack cleanly without horizontal overflow.
- Hovering a header or query row reveals a subtle copy-value icon; clicking copies that value with a descriptive toast (`Authorization value copied`).

---

### VP-02 [P0] Hits Table: Reclaim `Request` Width, Restore Sub-Minute Rhythm, Pin Edge Outcome, & Quiet Plain DNS

**Where:** `web/src/components/ProbePane.tsx:324-349, 594-615, 650-656`, `web/src/lib/format.ts:39-42`

**What the operator experiences today:**
1. **Starved `Request` column:** Even after `ux-sprint-3`'s partial trim (`Time 92px`, `Type 100px`), `<colgroup>` (`ProbePane.tsx:660`) still allocates `132px` to `#` and `198px` to `Source` (`522px` total before `Request` starts!). On a 1280px screen with the docked list open, **67% of table width is metadata** (mostly blank whitespace—an IPv4 address is ~105px, and `#40` is ~40px), leaving only **~256px** for `Request`. Redirect destinations (`→ 169.254.169.254`) and XXE file previews are routinely chopped off.
2. **Lost sub-minute rhythm:** Changing `Time` to `hm()` (`23:48`) means 6 hits from an SSRF redirect chain or XXE firing within 4 seconds all show `23:48`—you cannot see the temporal cadence across rows at a glance.
3. **Flat `Request` cell truncation:** `GET /d?d=catalog-worker-prod-02%0A · file data: ... · 118 ms after #3 · Java/17.0.9` is one linear inline string; any real URL >35 chars pushes the edge's outcome (`answered 302 → ...`, `decoy`, `served x.dtd`) completely out of view.
4. **DNS vs. HTTP visual parity:** In mixed traffic (typical 10:1 DNS-to-HTTP ratio), routine DNS lookups visually compete at equal luminance with HTTP/HTTPS callbacks.

**Changes:**
1. **Tighten `<colgroup>`** (`ProbePane.tsx:651`):
   - `#`: `w-[96px] max-[820px]:w-[78px]` (fits dot + chevron + `#9999–9999` cleanly).
   - `Time`: `w-[84px]` in 24-hour mode / `w-[104px]` in 12-hour mode (`max-[820px]:w-[82px]`). Read `useDisplay().clock === "12"` so 24h operators aren't taxed for AM/PM width.
   - `Type`: `w-[92px] max-[820px]:w-[88px]`. Move burst `+n chatter` out of `Type` into the `Request` summary metadata so `Type` never overflows.
   - `Source`: `w-[152px] max-[820px]:w-auto` (fits `255.255.255.255` + compact `yours`/`box` chip; IPv6 truncates cleanly with full `title`).
   - **Net gain:** **+98px** (24h) / **+78px** (12h) beyond `ux-sprint-3` (and **+128px** over `f1989ab`) directly into the `Request` column on every desktop viewport.
2. **Two-tone `HH:MM:SS` timestamps in `Time` cell:**  
   Add a small helper (or split `hms(i.timestamp)`) rendering `HH:MM` in primary row ink and `:SS` in `text-ash` (in 12h: `11:48` + `:47 PM` with `:47` in `text-ash`). Keeps minute-level scanning clean while restoring instant second-by-second sequence reading during SSRF/XXE bursts! Keep `exact(i.timestamp)` in `title`.
3. **Structured two-zone `Request` cell (`HitRow`, `ProbePane.tsx:340`):**  
   Render the `Request` cell content as `<div className="flex min-w-0 items-baseline gap-3">`:
   - **Left (`min-w-0 flex-1 truncate`):** `<RequestLine>` (for web) / mono SMTP summary / `<DnsName>` (for DNS).
   - **Right (`flex flex-none items-baseline gap-2 text-label whitespace-nowrap`):**
     - **Edge outcome / stage** (when present) in `text-smoke` (or `text-bone font-[550]` for high-signal outcomes like XXE `file data` or exit redirect `→ 302 <host>`), using concise scannable phrasing in the table row (full sentence stays in `HitDetail` and tooltip):
       - Exit redirect: `→ 302 169.254.169.254` (with `hop 3` prefix if looped)
       - Loop hop: `hop 2 · 307`
       - Preset part: `served x.dtd`
       - XXE file data (`kx0`): compact `XXE file` chip (`border-rule bg-soot-1 text-bone`) + short preview
       - Decoy: `decoy`
     - **Timing chain** (`+118ms #3`, `text-ash`) when `after` is set.
     - **Short client** (`Go-http-client`, `Java 17`, `Chrome 131`, `text-ash`) — hidden below `@max-[680px]/probe` if stage is present so the edge verdict ALWAYS stays visible!
4. **Signal-weighted row tone:**  
   - Keep `HTTP`, `HTTPS`, `SMTP`, and any `DNS` hit carrying extra/exfil labels (`i.fullId` has labels beyond `tag`/`uniqueId` not classified as `step`/`chatter`) at full `Bone` ink.
   - Gently recede routine bare-tag `DNS` lookup rows (no extra labels, not selected) to `text-smoke` on the `Source` (resolver IP) while keeping `<DnsName>`'s tag highlight crisp—so real HTTP/HTTPS target callbacks and DNS exfil pop immediately out of a wall of resolver queries.

**Acceptance criteria:**
- At `1280×800` docked, an SSRF redirect hit (`GET /me.png?hop=3`) displays both the request path AND the redirect target (`→ 302 169.254.169.254`) without clipping.
- Hits arriving seconds apart show distinct `:SS` in `text-ash`.
- A long query string (`?d=<200 chars>`) truncates on the left while keeping the right-pinned `XXE file` / edge verdict visible.

---

### VP-03 [P0] Flatten & Visually Zone the `ProbePane` Vertical Chrome Stack + Polish `Splitter` Affordance

**Where:** `web/src/components/ProbePane.tsx:84, 148, 375, 489, 643-650, 709-737`

**What the operator experiences today:**
1. Five consecutive horizontal chrome bands stack above the first hit row (`ProbeTabs 36px` + `Head R1 52px` + `Head R2 36px` + `PaneTabs 40px` + `FilterBar 41px` + `thead 27px`), burning ~276px (~35% of an 800px laptop) and visually merging into a ladder of identical `border-b border-rule` lines on the same `bg-soot` ground.
2. `ProbePane.tsx:489` and `:643` hardcode `40px` in `grid-rows-[auto_40px_...]` instead of `auto`, which clips on mobile (`h-11` = 44px) or `Comfortable` text scale.
3. The horizontal `Splitter` introduced in `ux-sprint-3` renders at `h-0` with only a faint `group-hover:bg-rule-2` highlight—making it essentially invisible to discover unless you happen to hover directly over the 1px seam.

**Changes:**
1. **Tighten & visually zone the top chrome (saves ~28px + clarifies hierarchy):**
   - `Head` Row 1 (`ProbePane.tsx:84`): `h-[44px]` (was `h-[52px]`), keeping `CrewMark` at `24px`.
   - `Head` Row 2 (`ProbePane.tsx:148`): tighten to `pb-2.5` (was `pb-3`), and keep `empty:hidden` so probes with no Row 2 items take zero extra height.
   - `PaneTabs` (`ProbePane.tsx:375`): `h-9` (36px on desktop, `max-[820px]:h-11`), and replace every hardcoded `40px` grid track in `ProbePane.tsx:489, 492, 643` with `auto`.
   - `filterBar` (`ProbePane.tsx:648`): place on `bg-band` (matching `thead`) with `py-1.5` and `border-b border-rule-2` flowing directly into `thead` (which keeps `border-b border-rule` below column headers). Now the pane clearly reads as **Identity (`bg-soot`) → Mode Tabs (`bg-soot`, underlined) → Hits Table Header+Toolbar (`bg-band`) → Data (`bg-soot`)**.
2. **Make the horizontal `Splitter` visually discoverable without adding noise:**
   - Give `Splitter` a subtle centered grip pill (`w-9 h-[3px] rounded-full bg-rule opacity-50 group-hover:opacity-100 group-hover:bg-smoke group-focus-visible:opacity-100 group-focus-visible:bg-bone`) centered on the seam above `HitDetail` (`bg-bay`), with a `h-[7px]` hit zone so operators immediately recognize the split is draggable.

**Acceptance criteria:**
- Top chrome above row 1 drops by ≥24px, and `filterBar` + `thead` visually unify as the table header band distinct from `PaneTabs`.
- The Hits/Detail splitter shows a quiet centered grip that brightens cleanly on hover/focus; drag and double-click reset continue working cleanly.
- No clipping at `Comfortable` text scale or `390×844` mobile.

---

### VP-04 [P0] De-Bloat `HitDetail` Top Strip & Reduce Nested Boxing

**Where:** `web/src/components/HitDetail.tsx:176-179, 221-336, 372-395`

**What the operator experiences today:**
1. On a typical SSRF or XXE hit, Strip 1 stacks 7–8 separate vertical lines (`#4`, `<What>`, `Source/rDNS/ASN`, `Answered`, `Same source`, `What the edge did` [2 lines], `Payload`), burning ~210px vertically before you even reach the Request/Response toolbar.
2. `Answered` (`302 Found · 0 bytes · sent by Colluder (rule v1, redirect, hop 3)`) and `What the edge did` (`Followed 2 redirects · answered 302 → 169.254.169.254. Whether the target followed that last redirect shows in its own response...`) repeat each other and dump 2 lines of static tutorial prose on every single redirect hit.
3. Inline `Mark as mine` and `Look up` buttons use bordered `variant="quiet"`, visually competing with the actual `Source`, `rDNS`, and `ASN` values.
4. `RawPane` sits inside 4 nested bordered boxes (`ProbePane` → `bg-bay` → `Strip 2` → `RawPane`), plus a 5th bordered box for the `Custody` bar underneath.

**Changes:**
1. **Merge `Answered` + `stage` into one tight, scannable line (eliminating duplicate prose):**
   - Keep `Answered` as the single source of truth for what went out:  
     `Answered` **`302 Found`** `· → 169.254.169.254 · followed 2 redirects · 0 bytes` `sent by Colluder (rule v1, hop 3)`
   - Move the static educational caveats (*"Whether the target followed that last redirect shows in its own response..."*, *"A strict HTTP parser would refuse it..."*) behind a subtle dotted-underline label or `Info` hover tooltip (just like `Resolver` already does at `HitDetail.tsx:242`!). Keep factual status callouts (`TLS handshake only`, `Not UTF-8`, `Body truncated`, `Malformed request`) as crisp 1-line inline notices with their download link, not 3-line essays.
2. **Quiet the inline metadata triggers (`HitDetail.tsx:244-264`):**
   - Change `Mark as mine` / `Yours · unmark` and `Look up` from bordered `variant="quiet"` to `variant="ghost" size="sm"` with `h-5 px-1.5 text-label text-smoke hover:text-bone` (and keep `Yours` as a compact grey `<Chip>` with a quiet `unmark` link on hover/beside it). Now `Source 203.0.113.45`, `rDNS`, and `ASN` scan as clean data, not a button toolbar.
3. **Tighten Strip 1 & Strip 2 spacing and make `Custody` a flush footer:**
   - Change `strip` (`HitDetail.tsx:179`) from `gap-2.5 py-3 pr-4 pl-5` to `gap-2 py-2.5 px-4`.
   - Render `Custody` (`HitDetail.tsx:381`) as a full-bleed footer attached to the bottom of Strip 2 (`-mx-4 -mb-2.5 mt-0.5 border-t border-rule-2 bg-well px-4 py-1.5 rounded-b-md`) instead of a 5th floating bordered card inside Strip 2. Reclaims ~16px vertically and removes a redundant border ring while keeping Custody on `--well` per `DESIGN.md`.

**Acceptance criteria:**
- On an SSRF hop-3 hit, Strip 1 height shrinks by ~45–65px while preserving 100% of factual information (and tooltips for caveats).
- Request and Response panes gain 3–4 additional visible lines above the fold at `1280×800`.
- `Custody` remains on `--well`, readable, with exact SHA-256 copy button intact.

---

### VP-05 [P1] Fix Eyeshine Rule Violation & Trim Composer Preset Prose

**Where:** `web/src/components/Composer.tsx:100-106, 275-305`

**What the operator experiences today:**
1. **Design-system violation:** `Composer.tsx` renders `"Default reply until you save its redirect."` in **`text-amber`**. Per `docs/DESIGN.md`, amber strictly means *unread/new*—seeing amber under a fresh probe with 0 hits looks like an unread alert!
2. **Bloated Composer preset rows:** Selecting `XXE` or `SSRF → metadata` in `Composer` renders a 3-line paragraph (`Composer.tsx:287-299`) that pushes the entire Probe List and Probe Pane ~180px downward.

**Changes:**
1. Replace `text-amber` on the unsaved-rule notice with `text-caution-ink` (or a compact `bg-caution-ground border-caution-border` inline strip) AND add an inline action button **`Set up its ${unsaved} →`** calling `setTab("http")` so the operator can jump straight to the Answer editor in one click.
2. Condense the XXE and SSRF preset descriptions in `Composer.tsx` to a crisp single line (`Serves x.dtd, feed.xml, sitemap.xml; sends file back as a hit` / `Serves 2 hops (301, 307) then 302 → <host>`), moving the Java/libxml2/.NET and IMDSv2 caveats into a dotted-underline `Caveats` tooltip right beside it.

**Acceptance criteria:**
- Zero `text-amber` usage for non-unread warnings anywhere in `Composer.tsx`.
- Clicking `Set up its redirect →` / `Set up its hosted file →` opens the Answer tab immediately.
- Composer height stays compact when switching to `XXE` or `SSRF → metadata`.

---

### VP-06 [P1] Probe Tabs & Probe List Ergonomics: Dock Button, Discoverable Facets, Resizable List, `Mark all read`, & Uncrowded Row 1

**Where:** `web/src/components/ProbeTabs.tsx:712-721, 785-802`, `web/src/components/ProbeList.tsx:64-103, 250-285`, `web/src/App.tsx:107`, `web/src/store.ts`

**What the operator experiences today:**
1. **Hidden exit from Tabs mode:** Clicking a hit auto-folds the Probe List into Tabs (`foldMode === "auto"` default), yet `ProbeTabs` (`:785-802`) shows `[≡ 4] [tabs...] [+]`, with NO visible button to dock the list back (it's hidden at the bottom of the `All probes` popover or behind `\`).
2. **Hidden Probe List facets:** `FacetChips` (`Unread`, `Web hits`, `By Claude`, `Answering HTTP`) are invisible in the Docked List unless the operator opens the `Rows3` ("List view") dropdown and turns one on (`ProbeList.tsx:258-262, 284`).
3. **Fixed `400px` list width:** Takes 500px total with the rail on 1280px displays (forcing Request/Response to stack under 900px) and feels excessively wide in 1-line `dense` mode.
4. **No `Mark all read`:** Returning after a fuzzer run leaves 6+ probes cocked amber with no bulk clear-unread button.
5. **Crowded Row 1 in `ProbeList`:** `[CrewMark] [marks] [Alias] [tag] [14 hits] [3 new] [BellOff]  [~~~] [17:29]` squeezes probe names in `dense` mode.

**Changes:**
1. **Add a quiet `PanelLeftOpen` button directly on `ProbeTabs` (`ProbeTabs.tsx:786`, before `All probes` or at the far right):**  
   `variant="ghost" size="icon-sm" className="mb-1 flex-none text-smoke" aria-label="Dock probe list" title="Dock probe list (\)" onClick={() => setFolded(false)}`
2. **Dedicated Filter toggle in `ProbeList` header (`ProbeList.tsx:275-282`):**  
   Add a compact `ListFilter` icon button beside the search input (showing a subtle `bg-soot-2 text-bone` active state when `fs.length > 0` or open) that toggles the `<FacetChips />` strip directly beneath the header—making `Unread`, `Web hits`, `By Claude`, and `Answering HTTP` 1 click away in Docked List mode just like in Switcher. Keep the `Rows3` menu focused cleanly on density & folding.
3. **Resizable Docked List width (`App.tsx:107`):**  
   Add a thin vertical drag handle (`w-2 -mx-1 cursor-col-resize`, `role="separator"`, `aria-orientation="vertical"`, double-click reset) between `ProbeList` and `ProbePane` (clamped `260px–460px`, persisted in `localStorage` `colluder.listWidthPx`, defaulting to `360px` — or `320px` under `1280px` — reclaiming 40px by default so 1280px panes hit side-by-side layout more easily).
4. **Add `markAllSeen()` in `store.ts`:**  
   Marks all active probes + untagged as seen (updating `colluder.seen` and clearing `openSeen`), surfaced as a quiet `Mark all read` item in the Probe List view menu and `Switcher` footer **only when `totalUnread(s) > 0`**.
5. **De-crowd `ProbeList` Row 1 (`ProbeList.tsx:74-102`):**  
   - In 2-line mode (not `dense`, not `sel`), move `plural(p.hits, "hit")` to Row 2 (right before `<CountChips />`, or let `<CountChips />` carry the counts while showing total in `title`) OR render a compact tabular count (`14` with `title="14 hits"`) so Row 1 prioritizes **CrewMark + Marks + Name/Tag + New chip + Live line & Time**.

**Acceptance criteria:**
- Operators in Tabs mode can dock the list back in 1 visible click (`PanelLeftOpen`).
- Probe facets are discoverable in 1 click from the Docked List header without opening the density menu.
- Dragging the vertical divider resizes the Probe List smoothly and persists across reloads.
- `Mark all read` clears all cocked strips, the rail badge, and the `(N) Colluder` tab title in one action.

---

### VP-07 [P1] Answer Editor Visual Upgrade: Syntax-Highlighted Preview, Sticky Aside, 2-Line Rule History, & Clear Save State

**Where:** `web/src/components/HttpRule.tsx:270, 429-514`

**What the operator experiences today:**
1. **`Next answer` (`HttpRule.tsx:452`) is monochrome `<pre>` text**—unlike every other HTTP view in Colluder (`HitDetail`, `ProbePane`, `Mailbox`), which use Slate/Sage/Ember syntax tinting.
2. **Aside scrolls away (`HttpRule.tsx:429`):** Editing a 15-line Hosted file body or Decoy rules scrolls `Next answer` completely off screen, losing real-time feedback.
3. **Crushed `Rule history` rows (`HttpRule.tsx:504-513`):** The 4-column grid (`grid-cols-[22px_44px_minmax(0,1fr)_auto]`) inside 400px breaks whenever `dayOrTime` shows a date (`11-19 17:29` > `44px`) and leaves only ~14 characters for the rule description when `active · by Claude · answered 4 hits · deepest hop 2/4` is shown on the right.
4. **Weak visual separation on sticky Save footer (`HttpRule.tsx:475`):** Sits on `bg-soot` (same as form ground), so scrolling fields blend into the Save bar.

**Changes:**
1. **Syntax-tint `Next answer` (`HttpRule.tsx:452`):**  
   Reuse `ExactLine` from `./HttpView` to render `preview.raw` line-by-line (tracking `inHead` until the first blank line, identical to `RawPane` in `HitDetail.tsx:69-77`). Status line (`200`, `302`, `404`), header names (`Location:`, `Content-Type:`), and body read instantly!
2. **Sticky aside at `@min-[940px]` (`HttpRule.tsx:429`):**  
   Add `@min-[940px]:sticky @min-[940px]:top-[18px] @min-[940px]:self-start @min-[940px]:max-h-[calc(100cqh-84px)] @min-[940px]:overflow-y-auto` so `Next answer` stays anchored in view while scrolling the form.
3. **Live vs. Draft badge in `Next answer` header (`HttpRule.tsx:431-438`):**  
   Show a crisp status pill right next to `Next answer`: when `dirty`, render `<span className="rounded-[9px] border border-caution-border bg-caution-ground px-1.5 text-label font-[650] text-caution-ink">unsaved</span>`; when clean and `live && activeV`, render `<Chip grey>live v{activeV.version}</Chip>`. (Uses Caution/Grey—never amber!)
4. **Redesign `HistoryRow` as a clean 2-line item (`HttpRule.tsx:495-514`):**  
   Replace the cramped 4-column grid with a flex/grid 2-line button item (`px-3 py-1.5 border-b border-rule-2 last:border-b-0`):
   - **Line 1:** `<span className="font-mono text-label font-semibold text-smoke">v{v.version}</span>` + full rule summary (`min-w-0 flex-1 truncate text-body text-bone` when current else `text-smoke`) + right-aligned `{dayOrTime(v.createdAt)}` (`flex-none text-label text-ash`, no fixed 44px width!).
   - **Line 2 (`pl-[26px]` aligned under summary, `text-label text-ash flex flex-wrap gap-x-1.5`):** `active` pill (when current & live) / `saved · not served` + `by Claude` + `answered n hits` + `n decoy` + `deepest hop x/y` + `changed ...`.
   - Apply the same clean 2-line rhythm to the baseline `"Default reply from Colluder"` and `"Answered by interactsh"` rows (`HttpRule.tsx:459-470`).
5. **Distinct sticky Save footer (`HttpRule.tsx:475`):**  
   Change `bg-soot` → `bg-soot-1 -mx-6 px-6 max-[820px]:-mx-3.5 max-[820px]:px-3.5` so scrolling form content cleanly tucks under an elevated action bar.

**Acceptance criteria:**
- `Next answer` displays HTTP status code and header names in Colluder's syntax inks across all 10 themes.
- Scrolling a long Hosted file or Custom response keeps `Next answer` visible on screens ≥940px pane width.
- Multi-day rule history dates (`11-19 17:29`) never overlap or crush rule descriptions.

---

### VP-08 [P1] Standardize Recessed Input Wells (`bg-well`) & Toolbar Control Heights

**Where:** `web/src/components/ProbeList.tsx:275`, `web/src/components/ProbePane.tsx:625`, `web/src/components/Mailbox.tsx:512-527`, `web/src/components/HttpRule.tsx:84, 296`

**What the operator experiences today:**
1. Search inputs inside `bg-soot` strips (`Filter probes` in `ProbeList.tsx:275` and `Search hits` in `ProbePane.tsx:625`) ALSO use `bg-soot`, making them visually flat against their container instead of recessed like `Mailbox` (`bg-well`), `HttpRule` (`bg-well`), and `PayloadKit` (`bg-well`).
2. Adjacent controls on the same horizontal toolbar have mismatched heights by 2–4px (e.g., `Mailbox.tsx:512-527` puts a `28px` `ToggleGroup` beside `24px` `size="sm"` Copy/`.eml` buttons; `ProbePane` uses `h-6` (24px) while `ProbeList` uses `h-7` (28px) and `Mailbox` uses `h-[30px]`).

**Changes:**
1. Change `bg-soot` → `bg-well` on:
   - `Filter probes` input wrapper (`ProbeList.tsx:275`)
   - `Search hits` input wrapper (`ProbePane.tsx:625`)
2. Align heights cleanly by toolbar tier:
   - **Page/section header bars** (`ProbeList` header, `Mailbox` header, `PayloadKit` header): `h-7` (28px) or `h-[30px]` consistently across every control in that row.
   - **Compact pane toolbars** (`ProbePane` filter bar, `HitDetail` view bar, `Mailbox` message view bar): standardize `ToggleGroupItem` + `Search` + adjacent `Button size="sm"` to exact `24px` (`h-6` inner / `h-[26px]` outer bordered group = `h-[26px]` matching `Button size="sm"` or `h-6` border-box). Check `Mailbox.tsx:512-527` specifically so `Message | HTML source | Headers | Exact bytes` aligns to the exact pixel with `Copy`, `.eml`, and Trash!

**Acceptance criteria:**
- Every text input on a `bg-soot` surface uses `bg-well` (recessed), visually consistent across Probes, Hits, Answer, Mailbox, and Payload Kit.
- No 2–4px vertical height step between `ToggleGroup` and sibling buttons on the same toolbar row.

---

### VP-09 [P1] Mailbox Visual Polish: Eliminate Double-Scroll Trap, Natural Address Bar, Per-Message Read Clearing, & Aligned Metadata Labels

**Where:** `web/src/components/Mailbox.tsx:92, 189-197, 285-287, 308-329, 437-473, 529`

**What the operator experiences today:**
1. **Double-scroll trap:** `Mailbox.tsx:285` puts `<section className="min-h-0 overflow-auto">` around `<Message>`, and inside `<Message>`, the body `<pre>` (`:529`) has `max-h-[60vh] overflow-auto`. Reading a long email creates nested scrolling!
2. **Awkward address input & hidden Copy action (`Mailbox.tsx:189-197`):** The local-part `<input>` uses `text-right` and unbounded `calc(Nch + 6px)` width (typing shifts text awkwardly and pushes `@host` into truncation), and both Dice and Copy are tiny 24px icon-only ghost buttons—even though grabbing a fresh signup email is the #1 Mailbox action.
3. **Sticky unread dots (`Mailbox.tsx:92, 180`):** Opening Mailbox marks everything read in `localStorage`, while `seenAtOpen` freezes the amber dots for the whole visit—so clicking an unread email NEVER clears its dot until you leave Mailbox and return.
4. **Mismatched metadata labels (`Mailbox.tsx:443-470`):** `From`, `To`, `Received`, `Attached` use `text-body text-smoke`, whereas `HitDetail` uses `text-label font-[550] tracking-[.03em] text-ash` so values visually dominate labels.

**Changes:**
1. **Single clean scroll in Message pane:** Make `<section aria-label="Message">` `flex min-h-0 flex-col overflow-hidden max-[820px]:block max-[820px]:overflow-visible`, make `<article>` `flex min-h-0 flex-1 flex-col px-6 py-5 max-[820px]:block max-[820px]:px-4`, keep `<header>`, `Code/Link` strip, and view toolbar `flex-none`, and give `<pre>` `mt-2 min-h-[200px] flex-1 overflow-auto` (removing `max-h-[60vh]` on desktop).
2. **Cleaner address bar (`Mailbox.tsx:189-197`):**
   - Left-align the local-part `<input>` with `min-w-[8ch] max-w-[26ch]` (`style={{ width: `min(26ch, max(8ch, ${(local || DEFAULT_LOCAL).length + 1}ch))` }}`) so typing feels natural and `@mailbox-...` stays visible.
   - Give the Copy button a visible text label (`<Button variant="quiet" size="sm" ...><Copy />Copy</Button>`) right beside the Dice button (`title="Roll a fresh account name"`).
3. **Clear individual unread dot on select:** Maintain `const [readHere, setReadHere] = useState<Set<number>>(new Set())`; whenever `sel !== null` changes, add `sel` to `readHere`. Compute `unread={r.id > seenAtOpen && !readHere.has(r.id)}` (preserving the amber dot on the first auto-selected message only if unread? Or clearing once explicitly clicked/viewed—e.g. add `sel` on click or after 300ms so you see what was new and watch it mark read as you step through!).
4. **Align `<dt>` labels to `HitDetail` grammar:** Change `From`, `To`, `Received`, `Attached`, `Code`, `Link` labels in `Mailbox.tsx:444-496` to `text-label font-[550] tracking-[.03em] text-ash` (top-aligned cleanly with values).

**Acceptance criteria:**
- Long emails scroll cleanly in one single body pane on desktop with the header and `Copy code` button pinned above.
- Clicking unread messages in Mailbox clears their amber dot immediately.
- Typing in the address local-part field feels smooth and never clips `@host` off screen.

---

### VP-10 [P2] Payload Kit: Fix Encoded Toast Bug, Add Row Hover Tracking, Probe `CrewMark`, & Address-Form Redirect

**Where:** `web/src/components/PayloadKit.tsx:53-107, 152-160, 188-205`

**What the operator experiences today:**
1. **Silent encoded-copy bug:** `PayloadKit.tsx:61` and `:92` call `copy(text, name)` instead of including `encName(enc)`—so copying a `URL ×2` or `JSON`-escaped payload toasts `"HTTP copied"`, hiding the active encoding!
2. **Wide-row visual disconnect:** At `max-w-[1000px]`, rows have no `hover:bg-hover` highlight, making it easy to click the wrong 24px `Copy` icon on the far right.
3. **Bare mono probe dropdown:** `PayloadKit.tsx:152-155` omits `CrewMark` and target from the Probe `<Select>`, unlike every other probe picker in Colluder.
4. **Missing redirect shortcut on `Address forms`:** Operators have to manually copy an obfuscated IP form (`http://0xa9fea9fe/...`) and navigate to Answer instead of clicking `"Redirect <tag> here"`.

**Changes:**
1. Pass `enc` into `Row` (and use `enc === "raw" ? name : `${name}, ${encName(enc)}`` in both `Row` and `MetaItem` copy calls). When `enc !== "raw"`, show a quiet inline badge in the header/intro (`Copying ${encName(enc)}`) with a 1-click `Reset` link so operators never forget an encoding is active.
2. Add `rounded-[3px] -mx-2 px-2 hover:bg-hover` to `Row` and `MetaItem` `<li>` elements so the eye tracks straight across to the Copy button.
3. Render `<CrewMark size={16} ... />` + tag + muted truncated target inside the Probe `<Select>` items (`PayloadKit.tsx:154`).
4. Add a `"Redirect ${tag} here"` ghost action (reusing the unsaved-draft confirm dialog from `MetaItem`) to `Address forms` rows (`PayloadKit.tsx:204`).

**Acceptance criteria:**
- Copying with `URL ×2` active toasts `"HTTP, URL-encoded twice copied"`.
- Hovering any payload row highlights the full horizontal strip cleanly across all 10 themes.

---

### VP-11 [P2] StatusBar: Across-the-Desk Glanceability & Interactive Affordances

**Where:** `web/src/components/Shell.tsx:95-134`

**What the operator experiences today:**
1. `Last hit` is a `<button>` that jumps straight to the latest hit, yet it has zero hover highlight and no protocol ink square—it reads like static text.
2. The base payload host (`Shell.tsx:131`) vanishes below `1560px` (hidden on 1440px laptops!) and is not clickable to copy.
3. `Engine` and `Edge` status items don't link to `#settings/system` when clicked.

**Changes:**
1. On `Last hit` (`Shell.tsx:114-125`): add a tiny `size-2 rounded-[2px]` protocol color square beside `HTTP`/`DNS`/`HTTPS`/`SMTP` (preserving Word-Beside-Ink!) and add `px-1.5 -mx-1.5 h-6 hover:bg-soot transition-colors` so it clearly responds on hover.
2. On the base payload host (`Shell.tsx:131`): make it a `<button type="button">` that copies `host` on click (`copy(host, "base payload host")`, `title="Click to copy base payload host"`, `hover:bg-soot hover:text-bone px-1.5 rounded-[3px]`). Relax its breakpoint from `max-[1560px]:hidden` to **`max-[1360px]:hidden`** (and hide `Engine`'s verbose `interactsh-client v1.4.1 · up 3h 0m` subtext at `max-[1480px]:hidden` instead of `1280px`) so the payload host stays visible on 1440px monitors!
3. Wrap `Engine` and `Edge` items in `<a href="#settings/system" className="flex items-center rounded-[3px] px-1 -mx-1 no-underline hover:bg-soot">` for 1-click diagnostics.

**Acceptance criteria:**
- At `1440×900`, the base payload host is visible in the StatusBar and copies on click with a toast.
- Hovering `Last hit`, `Engine`, or `Edge` shows a subtle `bg-soot` strip highlight.

---

## 5. Recommended Execution Waves

Implement in three clean, reviewable commits (or PRs) after `ux-sprint-3` merges, so each visual shift can be verified in the browser before moving on:

### Wave 1 — Maximum Visual Signal & Space Recovery (P0 + Eyeshine fix)
1. **VP-01** (`HttpView.tsx` 440px → 310px stacking fix + hover value copy)
2. **VP-02** (`ProbePane.tsx` colgroup `#`/`Source` trim + muted `:SS` + split `Request` cell + calm bare DNS)
3. **VP-03** (`ProbePane.tsx` flattened/zoned chrome stack + `auto` grid track + visible `Splitter` hover grip)
4. **VP-04** (`HitDetail.tsx` deduplicated Answered/stage + tooltip caveats + quiet inline triggers + flush Custody footer)
5. **VP-05** (`Composer.tsx` Eyeshine fix + 1-click Answer jump + compact preset notes)

### Wave 2 — Navigation, Editor Clarity, & Surface Consistency (P1)
6. **VP-06** (`ProbeTabs.tsx` Dock button + `ProbeList.tsx` discoverable facets, resizable list, `Mark all read`, uncrowded Row 1)
7. **VP-07** (`HttpRule.tsx` syntax-tinted `Next answer`, sticky aside, live/unsaved badge, 2-line `Rule history`, elevated Save footer)
8. **VP-08** (Standardize `bg-well` inputs & toolbar control heights across `ProbeList`, `ProbePane`, `Mailbox`, `HttpRule`)
9. **VP-09** (`Mailbox.tsx` single-scroll message pane, natural address input + Copy label, per-message unread clearing, aligned `<dt>` labels)

### Wave 3 — Cross-Surface Polish & Glanceability (P2)
10. **VP-10** (`PayloadKit.tsx` encoded toast fix, row hover tracking, `CrewMark` in picker, Address forms redirect)
11. **VP-11** (`Shell.tsx` StatusBar `Last hit` affordance + protocol square, copyable payload host at `1360px+`, diagnostic links)

---

## 6. Verification Checklist for the Implementing Session

After each wave, run:
```sh
npm test
node --test web/test/themes.test.ts
npm run typecheck && npm run build
```

Then visually inspect in a headless or live browser across:
1. **Viewports:** `1280×800` (laptop), `1440×900` (standard monitor), `1920×1080` (second monitor), `390×844` (phone).
2. **Themes:** `Colluder dark`, `Colluder light`, `High contrast`, `Catppuccin Latte`, and `Comfortable` text scale (`1.08×`).
3. **Key visual checks:**
   - Open an SSRF redirect hit and an XXE file hit at `1280×800` docked: verify `Request` shows both URL and edge verdict without clipping, headers sit side-by-side (`Name   Value`), and ≥10 lines of HTTP request/response are visible above the fold.
   - Drag both the horizontal Hits/Detail splitter and vertical List/Pane splitter; reload and confirm persistence; double-click to reset.
   - Switch to `Answer` tab on a Hosted file probe: verify `Next answer` is syntax-tinted and stays pinned while scrolling down to `Decoy`; verify `Rule history` displays multi-day dates cleanly on 2 lines.
   - Open `Mailbox` with a long email and unread messages: verify single clean body scroll, individual unread dot clearing on click, and aligned metadata labels.
   - Verify **zero** amber on non-unread UI (`Composer` unsaved-rule notice uses Caution ink) and **zero** `dangerouslySetInnerHTML` on any remote capture.

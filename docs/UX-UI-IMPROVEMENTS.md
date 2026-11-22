# Colluder UX & UI Improvement Handoff

**Audit date:** 2026-11-22  
**Baseline commit:** `9c5a46f` (`main`)  
**Scope:** End-to-end UX/UI and workflow review of Colluder's web dashboard (`web/src/`), backed by API/storage verification (`server.mjs`, `lib/rules.mjs`, `lib/store.mjs`, `lib/report.mjs`, `lib/mcp.mjs`).  
**Goal:** Give the next engineering/design session a concrete, prioritized, code-referenced backlog that makes security researchers, bug-bounty hunters, and Human+Claude MCP operators measurably faster and less error-prone—while strictly preserving Colluder's existing design system.

---

## 1. Context & Design Guardrails (Preserve These)

Colluder's UI is unusually well-crafted. Before making any change below, read [docs/DESIGN.md](DESIGN.md) and preserve its core commitments:

- **Strip Bay architecture:** Neutral graphite bay (`--bay`) holding flat 1px-edged strips (`--soot`, `--soot-1`, `--soot-2`) with `--well` for raw bytes and `--band` for table headers. Rule (`--rule`) separates distinct objects/bands; Rule 2 (`--rule-2`) only divides repeated siblings inside one object.
- **The Eyeshine Rule:** Amber (`--amber`) means *unread/new* (and the raccoon mark's eyes) and nothing else. Never use amber for buttons, active tabs, links, or decoration.
- **The Word-Beside-Ink Rule:** Protocol colors (`--ink-dns`, `--ink-http`, `--ink-https`, `--ink-smtp`) never appear without their text word.
- **The Four Sizes Rule:** Stick strictly to `text-label` (11px), `text-body` (12.5px), `text-title` (13.5px), and `text-headline` (17px). Use `Fragment Mono` only for literal copyable data.
- **Evidence integrity & safety:** Attacker-controlled text is always rendered as inert React text nodes—never HTML or live links. Every copy action delivers exact raw bytes unless explicitly labeled as a decoded/rebuilt view (e.g., `Copy as curl`, `Copy decoded`). Never fetch remote images/favicons in Mailbox.
- **Theme tests:** Every color/surface token change must pass `web/test/themes.test.ts` (4.5:1 contrast floor and OKLab lightness steps across all 10 themes + color-blind-safe inks).

---

## 2. Priority Overview Matrix

| ID | Category | Priority | Effort | Title | Primary Files |
|---|---|---|---|---|---|
| **UX-01** | Bug / Data Loss | **P0** | S | Answer Editor silently drops `decoy.methods` & `file.headers` on save | `web/src/components/HttpRule.tsx`, `web/src/lib/types.ts` |
| **UX-02** | Bug / Navigation | **P0** | S | Clicking a cross-probe hit in "Same source" closes HitDetail | `web/src/components/HitDetail.tsx` |
| **UX-03** | Bug / Keyboard | **P1** | S | Probe shortcuts fire on Mailbox, Payload Kit & Settings (yanking view) | `web/src/components/ProbeTabs.tsx`, `web/src/App.tsx` |
| **UX-04** | Bug / A11y | **P1** | S | Duplicate `id="probe-panel"` & nested `tabpanel` ARIA in Tabs mode | `web/src/App.tsx`, `web/src/components/ProbePane.tsx`, `HttpRule.tsx` |
| **UX-05** | Bug / Consumer UX | **P1** | S–M | Mailbox: hardcoded `orca-attacker@`, no rail unread badge, 200-item cap | `web/src/components/Mailbox.tsx`, `Shell.tsx`, `store.ts` |
| **UX-06** | UX Clarity | **P1** | S | Hits table shows `HH:MM` only—multi-day probes lose date context | `web/src/components/ProbePane.tsx` |
| **UX-07** | Bug / Routing | **P1** | S | Settings deep links fail (`#settings/check`, `/alerts`); Data count capped at 2000 | `web/src/App.tsx`, `Pages.tsx`, `Shell.tsx`, `ProbeList.tsx` |
| **UX-08** | Bug / Editing | **P1** | S | Header rename opens off-screen input; Kit "Redirect here" clobbers draft | `web/src/components/ProbePane.tsx`, `ProbeTabs.tsx`, `PayloadKit.tsx` |
| **UX-09** | Workflow | **P1** | M–L | Global cross-probe hit search & live "All traffic" triage view | `server.mjs`, `lib/store.mjs`, `ProbeTabs.tsx`, `ProbeList.tsx` |
| **UX-10** | Workflow | **P1** | M | First-class Decoded Exfil / XXE File viewer (stop 90-char truncation) | `web/src/components/HitDetail.tsx`, `web/src/lib/stage.ts` |
| **UX-11** | Workflow | **P1** | S–M | Sticky protocol filters, "Hide self-tests" toggle, and probe facet filters | `web/src/components/ProbePane.tsx`, `ProbeList.tsx`, `ProbeTabs.tsx` |
| **UX-12** | Human + Claude | **P2** | S–M | Surface saved Trigger Request & Probe Note without opening Edit modal | `web/src/components/ProbePane.tsx` |
| **UX-13** | Workflow | **P2** | M | Answer Editor ergonomics: `Copy curl test`, `Cmd/Ctrl+S`, XSLT/XSS templates, Clone Probe, Rule diffs | `web/src/components/HttpRule.tsx`, `ProbeTabs.tsx`, `ProbePane.tsx` |
| **UX-14** | Consistency | **P2** | S | Consistent copy encodings (`raw`, `URL`, `URL×2`, `JSON`, `XML`) everywhere | `web/src/components/Composer.tsx`, `PayloadKit.tsx`, `lib/kit.ts` |
| **UX-15** | Workflow | **P2** | S–M | Central management for "Marked as mine" self-test IPs in Settings | `web/src/components/SettingsParts.tsx`, `Pages.tsx`, `server.mjs` |
| **UX-16** | Workflow | **P2** | M | Redirect-loop & multi-hop header diffing (spot stripped `Authorization`/`Cookie`) | `web/src/components/HitDetail.tsx`, `HttpView.tsx` |
| **UX-17** | Layout / Density | **P2** | M | Reclaim Hits table `Request` width & add drag-resizable table/detail split | `web/src/components/ProbePane.tsx` |
| **UX-18** | Mobile UX | **P2** | S–M | Phone triage: show compact request preview in rows & scroll/switch to pane on tap | `web/src/components/ProbePane.tsx`, `ProbeList.tsx` |
| **UX-19** | Keyboard | **P3** | S–M | `?` shortcut cheat-sheet, hit/tab action keys, fix Arrow toggling DNS bursts, Mailbox keys | `web/src/components/ProbePane.tsx`, `Mailbox.tsx`, `Pages.tsx` |
| **UX-20** | Polish / A11y | **P3** | S | Non-button `Copy` label, Settings disabled contrast (`opacity-60`), Mailbox TZ tooltip, dead code | `Composer.tsx`, `SettingsParts.tsx`, `Mailbox.tsx`, `ProbePane.tsx` |

---

## 3. Part 1 — Confirmed Bugs, Data Loss & Friction (Fix First)

### UX-01 [P0] Answer Editor Silently Drops `decoy.methods` and Hosted File `headers`
**Where:**
- `web/src/components/HttpRule.tsx:68` (`KEYS.file`), `85-91` (`decoyOf`), `345-400` (form fields)
- `web/src/lib/types.ts:88` (`Decoy` interface missing `methods`)
- Contrast with backend: `lib/rules.mjs:88-90` (`file` supports `headers`), `lib/rules.mjs:176-180` (`validateDecoy` supports `methods`), `web/src/lib/presets.ts:12` (`ssrfRule` creates `decoy: { methods: ["HEAD"] }`).

**What happens today:**
1. Planting an **SSRF → metadata** probe with *"Decoy reply for HEAD checks"* checked saves `decoy: { methods: ["HEAD"] }`. When the user opens the **Answer** tab, the Decoy switch is ON, but all three shown inputs (`First`, `User-Agent has`, `Source IPs`) appear blank/`0`. Worse, if the user edits anything else (e.g., changes the redirect target or delay) and clicks Save, `decoyOf()` drops `methods`, **silently deleting the HEAD decoy**.
2. Similarly, the backend supports extra HTTP headers on **Hosted file** rules (e.g., `Access-Control-Allow-Origin: *` for script/JSON/font fetches—and Claude MCP can set them), but `KEYS.file` omits `"headers"` and the UI has no Headers editor in `file` mode. Saving any edit to a hosted file in the dashboard silently strips its extra headers.

**Fix:**
1. Add `methods?: string[] | string` to `Decoy` in `web/src/lib/types.ts`.
2. Preserve and serialize `methods` in `decoyOf()` (`HttpRule.tsx:85-91`), and add a **Methods** field to the Decoy grid (e.g., quick toggle pills `HEAD`, `OPTIONS` + text input for space-separated methods, matching `lib/rules.mjs:178`). Also add `Methods` to `errorField()` (`/^Decoy methods/`).
3. Add `"headers"` to `KEYS.file` (`HttpRule.tsx:68`) and render a collapsible or compact **Extra headers** row under **The file** (reusing the exact header key/value list from `custom` mode, noting `Content-Type` is set above).

**Acceptance criteria:**
- Plant SSRF preset with HEAD decoy → open Answer tab → see `HEAD` selected under Decoy → change delay → Save → `HEAD` decoy survives and previews/serves correctly.
- Save a Hosted file rule with `Access-Control-Allow-Origin: *` (via UI or MCP) → edit body in UI → Save → header is preserved and shown in `Next answer`.

---

### UX-02 [P0] Clicking a Cross-Probe Hit in "Same source" Closes `HitDetail`
**Where:**
- `web/src/components/HitDetail.tsx:182-183, 247`
- `web/src/components/ProbePane.tsx:409`

**What happens today:**
`HitDetail` builds `near` from all web hits in `s.list` from the same IP within 10 s, including hits on *other* probes (`n.tag !== d.tag`, labeled `on <tag>`). Clicking that button runs `onClick={() => selectHit(n.id)}` without switching `s.sel`. Because `ProbePane.tsx:409` checks `hits.some((i) => i.id === s.hit)` against the *current* probe's hits, `hitId` becomes `null` and the detail pane unexpectedly collapses.

**Fix:**
- In `HitDetail.tsx:247`, check `const k = keyOf(n)`: if `k !== s.sel`, call `select(k)` first, then `selectHit(n.id)` (same sequence used by `StatusBar`'s Last Hit button in `Shell.tsx:115-118`).
- Bonus: Also check `s.older[s.sel]` when building `near` so historical probes still correlate nearby hits, and optionally include the immediately preceding DNS lookup (within 3 s) as a contextual link.

---

### UX-03 [P1] Probe Keyboard Shortcuts Fire on Mailbox, Payload Kit, and Settings
**Where:**
- `web/src/components/ProbeTabs.tsx:208-246` (invoked unconditionally from `App.tsx:44`)

**What happens today:**
`useListFolded()` attaches a `window` `keydown` listener for `\`, `/`, `o`, `Shift+T`, `F2`, `1–9`, `[`, `]`, and `n`. Because `App.tsx` mounts it across all views:
- Pressing `[`, `]`, `n`, or `1–9` while reading an email in **Mailbox** or tweaking **Settings** calls `select(k)` → `writeHash()`, **yanking the user back to `#probes/...`**.
- Pressing `\` toggles `listFolded` invisibly; pressing `F2` sets `snap.editing` on a hidden probe; pressing `/` or `o` flips `switcherOpen` on an unmounted popover.

**Fix:**
- Pass `active: boolean` (`route.view === "probes"`) into `useListFolded(route.view === "probes")` (or check `(!location.hash || location.hash.startsWith("#probes"))` inside `onKey`) so all probe-specific shortcuts only fire on the Probes view. Keep `p` global in `App.tsx` since `plantNew()` intentionally navigates to `#probes`.

---

### UX-04 [P1] Duplicate `id="probe-panel"` DOM ID & Nested `tabpanel` ARIA in Tabs Mode
**Where:**
- `web/src/App.tsx:113` (`<div id="probe-panel" role={folded ? "tabpanel" : undefined} aria-labelledby={folded && sel ? tabId(sel) : undefined}>`)
- `web/src/components/ProbePane.tsx:336, 453, 572` (`id="probe-panel" role="tabpanel" aria-labelledby="probe-tab-hits"`)
- `web/src/components/HttpRule.tsx:219, 252` (`id="probe-panel" role="tabpanel" aria-labelledby="probe-tab-http"`)
- `web/src/components/ProbeTabs.tsx:517` (`aria-controls="probe-panel"`)

**What happens today:**
When Tabs mode (`folded`) is active, both the outer probe container (`App.tsx:113`) and the inner Hits/Answer container (`ProbePane.tsx:572` or `HttpRule.tsx:252`) share the exact same `id="probe-panel"`. Screen readers and `aria-controls` lookups resolve inconsistently.

**Fix:**
- Rename the outer wrapper in `App.tsx:113` to `id="probe-view"` and update `ProbeTabs.tsx:517` to `aria-controls="probe-view"`. Keep `id="probe-panel"` exclusively for `PaneTabs` (`Hits` / `Answer`).

---

### UX-05 [P1] Mailbox Consumer Polish: Hardcoded `orca-attacker@`, Missing Rail Badge, 200-Message Cap
**Where:**
- `web/src/components/Mailbox.tsx:171-175, 296, 309`
- `web/src/components/Shell.tsx:51`
- `web/src/store.ts:316`

**What happens today:**
1. **Hardcoded personal handle:** Clicking Copy next to `anyone@mailbox-k7wq2x...` (`Mailbox.tsx:174`) literally copies `orca-attacker@mailbox-...` (and the empty state at `:309` hardcodes `orca-attacker@`). General users of Colluder do not want an unrelated handle (`orca-attacker`) pasted into live target signup forms.
2. **No unread notification on the Rail:** `Shell.tsx:51` only renders an amber badge on `Probes`. When waiting for an OTP/magic-link email while working in Probes (or Caido on another monitor), arriving mail gives zero visual cue on the Mailbox rail icon.
3. **200-message ceiling:** `fetchMail()` (`store.ts:316`) fetches `/api/mail?limit=200` with no pagination. If `mb.count > 200`, older messages cannot be loaded in the UI (the backend `/api/mail?before=<id>` already supports cursor paging in `lib/store.mjs:267`).
4. **Raw UTC tooltip on row time:** `Mailbox.tsx:296` uses `title={r.receivedAt}` instead of showing the active display timezone + stored UTC (`exact()` pattern from `ProbePane.tsx:297`).

**Fix:**
1. Replace the static `anyone` span in `Mailbox.tsx:173` with a compact inline editable local-part prefix (defaulting to a neutral word or last-used address, plus a small dice button using `quickTag()` for instant disposable addresses like `brisk-otter-42@mailbox-...`), and copy `<prefix>@<mb.host>`. Update the empty state example to neutral text (`signup-1@<host>` or `<tag>@<host>`).
2. Track unread mail count in `store.ts` (comparing incoming `mail` SSE events and `status.mailbox.count`/newest ID against `colluder.mailSeen`), and display the standard amber rail badge (`Eyeshine Rule`) on the `Mailbox` rail item in `Shell.tsx:51`.
3. Add a `"Load older messages (200 of N shown)"` button at the bottom of the Mailbox list calling `/api/mail?before=<oldestId>&limit=200`.
4. Format row timestamps' `title` with the shared `exact()` helper (display zone + UTC).

---

### UX-06 [P1] Hits Table Shows `HH:MM` Only—Multi-Day Probes Lose Date Context
**Where:**
- `web/src/components/ProbePane.tsx:286, 537`

**What happens today:**
Every row in the Hits table renders `{hm(i.timestamp)}` (e.g., `09:14` or `9:14 AM`). For long-lived probes (blind XSS, stored SSRF, cron jobs, or retired probes receiving late hits days later), rows from 4 days ago look identical to rows from 5 minutes ago unless hovered one by one.

**Fix:**
- Option A (minimal): Use `dayOrTime(i.timestamp)` whenever a hit's `dayKey` differs from today's `dayKey` (today shows `09:14`, older shows `11-18 09:14`).
- Option B (cleaner for dense scanning, mirrors Mailbox Archive): Keep `hm()` in the cell, and insert lightweight full-width sticky day-divider rows (`Yesterday · Nov 21`, `Thu, Nov 19`) whenever `dayKey` changes between adjacent rows in the table (only shown if hits span >1 day).

---

### UX-07 [P1] Settings Deep Links Ignore Section Hash & Data Count Is Capped at 2000
**Where:**
- `web/src/App.tsx:117` (`<Settings />` receives no `section` prop)
- `web/src/components/Pages.tsx:109-111` (`Settings()`, `count = useApp((x) => x.list.length)`)
- `web/src/components/Shell.tsx:109` (Outside check links to `#settings`)
- `web/src/components/ProbeList.tsx:241` (Discord bell links to `#settings`)

**What happens today:**
1. Navigating to `#settings/display`, `#settings/alerts`, or `#settings/check` always lands at the top (`Payloads`). Clicking the failing **Outside check** indicator in the status bar or the unconfigured **Discord bell** dumps the user at Payloads instead of jumping straight to the relevant section.
2. `Settings()` passes `count = s.list.length` (the live buffer capped at 2000/5000) to `DataSection`, so the Data panel and "Hide every interaction?" dialog underreport total stored hits on busy boxes.

**Fix:**
1. Pass `section={route.arg}` from `App.tsx:117` to `<Settings section={route.arg} />`, scroll to `#set-${section}` on mount/change, and update `Shell.tsx:109` → `#settings/check`, `ProbeList.tsx:241` → `#settings/alerts`, and status-bar clear tooltip/link → `#settings/data`. Update `location.hash` via `replaceState` when clicking section index entries.
2. Compute total active stored hits across all probes (`[...s.probes.values()].reduce((n, p) => n + p.hits, 0) + (s.untagged?.hits ?? 0)`) for `DataSection`.

---

### UX-08 [P1] Header Double-Click Rename Jumps Off-Screen & Kit "Redirect here" Clobbers Unsaved Drafts
**Where:**
- `web/src/components/ProbePane.tsx:105-109` (calls `startRename(p.tag)`)
- `web/src/components/PayloadKit.tsx:54-57` (calls `setRuleDraft(tag, ...)` directly)

**What happens today:**
1. Double-clicking the probe tag in the **Probe Pane header** calls `startRename(p.tag)`, which opens `<NameEditor>` inside the Tab bar or Probe List—NOT where the user clicked. On phones (where the list is stacked above and scrolled out of view), nothing appears to happen at all.
2. In **Payload kit → Cloud metadata**, clicking `"Redirect <tag> here"` calls `setRuleDraft(tag, ...)` without checking whether `s.ruleDrafts[tag]` already holds unsaved edits (e.g., a carefully written custom HTML body or complex redirect loop). It silently overwrites the draft.

**Fix:**
1. Support inline `<NameEditor>` right in `ProbePane`'s `Head` when renaming is initiated from the header (e.g., store `editing: { k: string; where: "tab" | "list" | "head" } | null`).
2. In `PayloadKit.tsx:54-57`, if `getState().ruleDrafts[tag]` already exists, either show a brief confirm dialog (`Replace unsaved Answer draft on <tag>?`) or toast with an Undo restoring the prior draft object.

---

## 4. Part 2 — High-Impact Operator Workflow Enhancements

These improvements target the day-to-day workflows of bug-bounty researchers and pentest operators working across dozens of probes, Caido/Burp, and Claude MCP.

### UX-09 [P1] Global Cross-Probe Hit Search & Live "All Traffic" Triage View
**Problem:**
Currently, hit search (`GET /api/probes/:tag/hits?q=...`) only searches *inside the currently selected probe*. During real engagements with 20+ planted probes (plus Claude's probes), researchers routinely need to answer:
- *"Which probe just received a callback from `10.0.x.x` or `AmazonAWS`?"*
- *"Did ANY probe catch a request containing `X-Api-Key` or `curl`?"*
- *"What is hitting my server right now across all probes while my fuzzer runs?"*

**Proposed UX:**
1. **Backend (`server.mjs` + `lib/store.mjs`):** Add `GET /api/hits?q=...&type=...&limit=100` searching across all non-cleared interactions (`tag`, `full_id`, `summary`, `remote_address`, `raw_request`). Reuse the exact `LIKE ... ESCAPE '\'` pattern from `pageHits`.
2. **Global search inside the Switcher (`o` / `/`):** When typing in the `All probes` switcher (or Probe List filter), add a compact toggle or secondary section **"Matching hits"** (debounced against `/api/hits?q=...`) showing up to 8 matching hits (`#id · probe · type · source · summary`). Selecting a hit navigates directly to that probe and opens the hit (`select(tag); selectHit(id)`).
3. **Optional "All hits" live stream:** Add a toggle or pinned virtual entry (e.g., **"All activity"** alongside `No tag` or as a mode in Probes) showing the chronological cross-probe firehose (non-chatter hits with a `Probe` column wearing each probe's tiny `CrewMark` + tag). Immensely useful on a second monitor while running active scans/fuzzers.

---

### UX-10 [P1] First-Class Decoded Exfil & XXE File Viewer
**Problem:**
In `HitDetail.tsx`:
- Blind XXE file exfiltration (`kx0` hits) is surfaced only through `stageOf()` (`lib/stage.ts:65`), which **escapes newlines (`\n`) and truncates at 90 characters** into one inline sentence! Reading `/etc/passwd` or a config file requires squinting at raw URL-encoded/base64 text in the Request pane.
- DNS exfil labels (`HitDetail.tsx:290-297`) are rendered inline inside a `<p>` tag with escaped `\n` and **no Copy button**.
- Meanwhile, `lib/stage.ts:27` (`xxeValue`) and `lib/exfil.ts` (`decodeLabels`, `decodeExfil`) *already* decode these cleanly (and `lib/report.mjs` already outputs full fenced blocks for them).

**Proposed UX:**
When a hit carries decoded exfil data (XXE file via `xxeValue(d)`, decoded DNS labels via `decodeLabels(d.extraLabels)`, or decoded query value):
- Render a dedicated **Decoded data** block inside the Hit Detail strip (on `--well`, `border-rule`, `Fragment Mono`, max-height scrollable, inert text nodes only):
  - Title bar: `Exfiltrated file` (or `Decoded DNS data`) · provenance caption in Ash (`base64 decoded from ?d=` / `hex decoded from 3 DNS labels`) · **Copy decoded** button + **Download `.txt`** button.
  - Display real newlines (no `\n` escaping, except control chars via `showControls`), with the same `Wrap long lines` and overflow cue behavior as `RawPane`.
  - Keep `What the edge did:` concise (`File data arrived (412 bytes, base64 decoded)`) instead of dumping 90 truncated characters into a sentence.

---

### UX-11 [P1] Better Triage Filters: Sticky Protocol Filter, "Hide Self-Tests", and Probe Facets
**Problem:**
1. `ProbePane.tsx:363` resets `kinds` (`DNS | HTTP(S) | SMTP`) to `[]` on every probe switch. When triaging SSRF across 5 probes, DNS noise floods back on every single click.
2. Self-test hits (`this box` and `yours` IPs) stay interleaved with target hits in the table. When you've sent 8 `curl` sanity checks to verify a redirect rule, you have to scan past them every time.
3. The Probe List and `All probes` switcher only filter by text—there is no quick way to see *"only probes with unread hits"*, *"only probes that got HTTP(S) hits"* (skipping DNS-only noise), *"only Claude's probes"*, or *"only probes serving custom HTTP rules"*.

**Proposed UX:**
1. **Sticky protocol filter (per browser or optional lock):** Keep `kinds` across probe switches (or show a subtle active state when non-empty, with a one-click `Clear` when a probe has hits hidden by the active filter: *"0 HTTP(S) hits (14 DNS hidden by filter — Show all)"*).
2. **"Hide self-tests" toggle in the Hits filter bar (`ProbePane.tsx:552`):** Only shown when the probe actually has ≥1 hit from `selfIps`/`mineIps` (so zero clutter otherwise). Filters out self-test rows client-side (or server-side) and shows how many were hidden (`3 self-tests hidden`).
3. **Lightweight probe facets:** In the `All probes` switcher header and Probe List view menu (or compact chips under the probe filter when focused), allow filtering by: `Unread`, `Web hits`, `By Claude`, `Answering HTTP`.

---

### UX-12 [P2] Surface Saved Trigger Request & Probe Note (Human + Claude MCP Visibility)
**Where:**
- `web/src/components/ProbePane.tsx:55-58, 123, 125-130`

**Problem:**
In Claude's MCP loop (`plant_probe → set_rule → record_trigger → wait_for_hits → get_report`), Claude records the exact HTTP request it sent into `trigger_req` and writes context into `note`. Human operators also paste triggering requests from Caido. Yet on the Probe Pane:
- There is **no visible indication** that a trigger request exists (except reading a hover tooltip on `Copy report`), and viewing/copying it requires opening `⋯ → Edit target, note, trigger…` and reading a form `<Textarea>`.
- `p.note` is completely hidden behind a tooltip on `target` or the crew-mark hover card.

**Proposed UX:**
- Add a quiet, collapsible **"Trigger & note"** disclosure pill/button in the Probe Header (only shown when `p.triggerBytes > 0 || p.note`, or as a subtle button `Trigger (1.2 KB)` / `Note` beside `Copy report` or in Row 2).
- Expanding it reveals an inert `--well` block with the trigger request (with `Copy` and `Edit` buttons) and the full note text—so you can immediately verify *what Claude sent* right above *what called back*, without entering an edit modal.

---

### UX-13 [P2] Answer Editor & Probe Iteration Ergonomics
**Where:**
- `web/src/components/HttpRule.tsx`, `web/src/components/ProbeTabs.tsx`, `web/src/components/ProbePane.tsx`

**Improvements:**
1. **`Cmd/Ctrl+S` to save rule:** Bind `Mod+S` inside `HttpRuleTab` when `dirty && !saving && !preview.error` to trigger `save()`, and show a subtle `⌘S` / `Ctrl+S` hint on the Save button tooltip.
2. **One-click `Copy curl test` in `Next answer` preview bar (`HttpRule.tsx:414`):** Add a ghost icon/button next to the `HTTP | HTTPS` preview toggle that copies `curl -i http://<tag>-<host>/` (matching the preview scheme; `-iL` when a loop is configured) so operators can test their newly saved rule in 1 second.
3. **Clone / Duplicate Probe:** Add **"Clone probe…"** to `ProbeActions` (right-click menu) and the Probe Header `⋯` menu. Opens the Plant form pre-populated with the source probe's `target`, `technique`, and `httpRule` (fetched via `fetchRule`), with a fresh suggested tag (`<tag>-2` or quickTag). Huge time-saver when iterating payloads across multiple endpoints.
4. **Add missing high-value templates in `HttpRule.tsx:40`:**
   - **XSLT stylesheet** (`application/xslt+xml` — already detected by `lib/plant.ts:11`, yet missing from `templates()`!).
   - **Blind XSS beacon** (`application/javascript` — collects `location.href`, `document.domain`, `document.cookie`, DOM snippet and beacons back to the probe).
   - **OIDC Discovery** (`application/json` — `.well-known/openid-configuration` pointing `jwks_uri` / `authorization_endpoint` back at the probe).
5. **Rule History diff summary (`HttpRule.tsx:469-484`):** When hovering or inspecting versions in Rule History, show what changed from `v(n-1)` (or add a quick "Compare with active" tooltip/preview) so loading an older version isn't blind trial-and-error.

---

### UX-14 [P2] Consistent Payload Encoding Across Plain Callbacks & Payload Kit
**Where:**
- `web/src/components/Composer.tsx:104-171`
- `web/src/components/PayloadKit.tsx:129-131`

**Problem:**
- `PayloadRows` offers `Copy as is | URL-encoded | JSON | XML` **only** for `ssrf-metadata` and `xxe` preset probes—NOT for standard `callback`, `redirect`, or `file` probes!
- `PayloadKit` offers `as is | URL-encoded | encoded twice`, omitting `JSON` and `XML`.
- Operators testing JSON APIs, XML bodies, or double-encoded query parameters constantly need these encodings on *plain* probes too.

**Fix:**
- Unify the encoding helper (`as is | URL-encoded | URL ×2 | JSON | XML`) and offer it consistently on both `PayloadRows` (for all probe types when expanded) and `PayloadKit`. (Bonus: remember the chosen encoding only for the current session or reset to `as is` with a clear visual indicator when a non-raw encoding is active so operators don't accidentally paste double-encoded strings later.)

---

### UX-15 [P2] Central Management for "Marked as Mine" Self-Test IPs
**Where:**
- `web/src/components/HitDetail.tsx:211-216`
- `web/src/components/Pages.tsx` / `SettingsParts.tsx`
- `server.mjs:786-794`

**Problem:**
Operators can mark an IP as theirs (`POST /api/sources/mine`) from a hit's detail pane, which excludes it from reports, reach stats, and chimes. However, there is **no place in Settings** to view all currently marked `mineIps`, remove stale IPs (e.g., after VPN/home IP rotation), or pre-register your current IP before running tests.

**Fix:**
- Add a **"Self-test addresses"** group under `Settings → Data` (or `Settings → System`):
  - Show `selfIps` (labeled `this box`, read-only).
  - List `mineIps` as removable mono rows (`Remove` button calling `setMine(ip, false)`).
  - Add an inline IP input + **"Add IP"** button (and optionally a **"Use my current IP"** helper if the dashboard exposes `req.socket.remoteAddress` in `/api/status` when non-loopback).

---

### UX-16 [P2] Redirect-Loop & Multi-Hop Header Diffing
**Where:**
- `web/src/components/HitDetail.tsx` (`Same source` / `HttpParsed`)

**Problem:**
One of Colluder's standout security features is multi-hop redirect loops (`?hop=1 → ?hop=2 → ?hop=3 → metadata`). A critical bug-bounty question during redirect testing is: **did the target's HTTP client forward `Authorization`, `Cookie`, or custom headers across hops, or switch `POST → GET`?** Today the user has to click back and forth between `#2` and `#3` and manually eyeball header lists.

**Proposed UX:**
- When viewing a hit with `d.answer?.hop > 1` (or any hit with an immediately preceding `after` hit from the same source within 10 s), offer a lightweight **"Compare with #prev"** toggle (or compact inline diff line under `Answered`):
  - Automatically summarize high-signal changes: e.g., `vs #2: Method POST → GET · kept Authorization, Cookie · dropped X-Custom-Token` (or `headers unchanged`).
  - Only fetch the previous hit detail on demand or if already cached in `s.details`.

---

## 5. Part 3 — Layout, Density, Mobile, Keyboard & Polish

### UX-17 [P2] Reclaim Horizontal & Vertical Space in the Hits Table
**Where:**
- `web/src/components/ProbePane.tsx:34-38, 576-578`

**Problem:**
1. **Cramped `Request` column:** `<colgroup>` (`ProbePane.tsx:578`) allocates fixed widths: `#` `132px`, `Time` `116px`, `Type` `106px`, `Source` `198px` = **552px** before `Request` starts! On a 1280px screen with the 400px docked list open, the pane is ~778px wide, leaving only **~226px** for `Request` (where method, path, query params, stage label, and User-Agent all fight for room).
2. **Rigid vertical split:** Adjusting how much vertical space the Hits table gets vs. `HitDetail` requires leaving Probes and going to `Settings → Display → Hits → List height` (`Short | Tall | Half`).

**Fix:**
1. Tighten column budgets on desktop:
   - `#`: `104px` (enough for `#3241–3244` + chevron + dot; shrinks cleanly).
   - `Time`: `84px` in 24h / `102px` in 12h (or `112px` only when dates are shown).
   - `Type`: `96px`.
   - `Source`: `156px` (fits any IPv4 `255.255.255.255` + `yours` chip comfortably; truncates long IPv6 with full value on hover).
   - Net gain: **~95–115px wider `Request` column** on every screen!
2. Add a thin, accessible **horizontal drag splitter** (`role="separator"`, keyboard-adjustable with ArrowUp/Down, double-click to reset) on the border between the Hits table and `HitDetail`, persisting height in `localStorage` (falling back to the Settings preset).

---

### UX-18 [P2] Mobile (`<=820px`) Triage Overhaul
**Where:**
- `web/src/components/ProbePane.tsx:578, 581`
- `web/src/components/ProbeList.tsx:263`
- `web/src/App.tsx:107-115`

**Problem:**
`docs/PRODUCT.md` explicitly names *"from a phone over the tailnet"* as a primary context. Currently on phones (`<=820px`):
1. The `Request` column is completely hidden (`max-[820px]:hidden`), leaving only `# | Time | Type | Source`. An operator checking a callback from their phone cannot see what path, DNS name, or stage arrived without tapping every single hit row.
2. `ProbeList` (capped at `48vh`) stacks above `ProbePane`. Tapping a probe in the list selects it, but **does not scroll down to the pane**, forcing manual scrolling past the list on every probe switch.

**Fix:**
1. On `<=820px`, render a compact truncated mono line (request line / DNS name + stage) underneath `Source` (or as a 2-line mobile row layout) so every hit is scannable on a phone without tapping.
2. On `<=820px`, when the user explicitly clicks a probe in `ProbeList` (not on initial page load), smoothly scroll `ProbePane` into view—or offer a simple mobile `"← Probes"` back button header toggle so the phone behaves like a crisp master/detail view instead of a cramped double-stack.

---

### UX-19 [P3] Keyboard Efficiency & Discoverability
**Where:**
- `web/src/components/ProbePane.tsx:388-404, 584-592`
- `web/src/components/Mailbox.tsx`
- `web/src/components/Pages.tsx:80-92`

**Findings & Fixes:**
1. **No `?` shortcut cheat-sheet:** Colluder has 12+ great keyboard shortcuts, all buried at the bottom of `Settings → Keyboard`. Add `?` (outside inputs) to open a compact modal/popover listing shortcuts for the current view.
2. **Missing high-frequency hit/probe shortcuts (on Probes view):**
   - `a` (or `g a` / `g h`): toggle between **Hits** and **Answer** tabs.
   - `e`: **Copy as evidence** when a hit is open.
   - `c`: **Copy as curl** when a web hit is open.
   - `f`: focus the **Search hits** input inside `ProbePane` (since `/` focuses the probe switcher/filter).
3. **Arrow keys on the Hits table toggle DNS bursts (`ProbePane.tsx:584-592`):** `onKeyDown` calls `el.focus(); el.click();` on `ArrowDown`/`ArrowUp`. When moving onto a collapsed DNS burst `<tr>`, `el.click()` immediately expands it—and moving back up collapses it! Fix: `ArrowDown`/`ArrowUp` should focus the row and select single hits, while `Enter`/`Space`/`ArrowRight`/`ArrowLeft` explicitly expand/collapse burst rows. Also add `Home`/`End` support to match `ProbeList`.
4. **Mailbox keyboard navigation:** Add `/` to focus Mailbox `Find`, and `j`/`k` (or `ArrowDown`/`ArrowUp`) to step through messages cleanly.

---

### UX-20 [P3] Visual Clarity, Accessibility & Hygiene Micro-Fixes
**Where:**
- `web/src/components/Composer.tsx:64`
- `web/src/components/SettingsParts.tsx:235`
- `web/src/components/ProbePane.tsx:550`
- `docs/DESIGN.md:409, 522`

**Fixes:**
1. **`Copy` label looks like a button (`Composer.tsx:64`):** The folded payload row renders `<Copy /> Copy` (icon + text) directly next to the `DNS` `HTTP` `HTTPS` ghost buttons, reading like a clickable "Copy all" button. Drop the icon on the static label (plain `Copy:` in `text-label text-ash`) or place the `<Copy />` icon inside each chip button on hover so the affordance is unambiguous.
2. **Settings Alerts dimmed rows contrast (`SettingsParts.tsx:235`):** When Discord alerts are toggled off, `<div className={dc.enabled ? "" : "opacity-60"}>` drops description text contrast to ~2.7:1. Replace `opacity-60` with explicit token colors (`text-smoke` title + `text-ash` description, both ≥4.5:1) so disabled rows remain readable while visually receding.
3. **Dead parameter cleanup (`ProbePane.tsx:550`):** `filterBar(where: "tabs" | "bar")` is only ever called with `"bar"` since filters moved permanently out of the tab strip. Simplify to a clean inline bar.
4. **`docs/DESIGN.md` sync:** Update older sections of `docs/DESIGN.md` (lines 409 and 522 still mention the old 35px tab strip and filters beside tabs at ≥900px, contradicted by the Nov 20 appendix at line 757–758) so future sessions don't get conflicting specs.

---

## 6. Suggested Execution Plan for the Next Session

Batch the work into three clean, verifiable PRs/sprints:

### Sprint 1 — Bug & Data-Loss Fixes (High Confidence, Low Risk)
- **UX-01** (`decoy.methods` + `file.headers` preservation & UI)
- **UX-02** (Cross-probe `Same source` navigation)
- **UX-03** (Gate probe keyboard shortcuts to `route.view === "probes"`)
- **UX-04** (Unique `#probe-view` vs `#probe-panel` IDs)
- **UX-05** (Mailbox local-part editor/dice replacing `orca-attacker@`, rail unread badge, pagination, TZ tooltip)
- **UX-06** (Multi-day dates/dividers in Hits table)
- **UX-07** (Settings `#settings/<section>` deep linking + accurate total hit count)
- **UX-08** (Header inline rename + Payload Kit draft overwrite guard)
- **UX-20** (Quick polish: `Copy` label, Alerts contrast, dead code, `DESIGN.md` sync)

### Sprint 2 — Operator Effectiveness (High Impact)
- **UX-10** (Dedicated Decoded Exfil / XXE File viewer well with Copy/Download)
- **UX-11** (Sticky protocol filter, "Hide self-tests" toggle, Probe facet filters)
- **UX-09** (Global `/api/hits` search in Switcher + optional "All traffic" firehose)
- **UX-12** (Collapsible Trigger Request & Note disclosure in Probe Header)
- **UX-13** (`Mod+S` save, `Copy curl test`, Clone probe, XSLT/Blind-XSS/OIDC templates)
- **UX-14** & **UX-15** (Unified payload encodings + Settings "Marked as mine" IP manager)

### Sprint 3 — Deep Analysis, Layout & Mobile Polish
- **UX-16** (Redirect-loop / multi-hop header diff summary)
- **UX-17** (Tighter Hits `<colgroup>` + drag-resizable table/detail split)
- **UX-18** (Phone triage 2-line hit rows + mobile master/detail scroll/back)
- **UX-19** (`?` shortcut sheet, power-user hit/tab keys, burst arrow-key fix, Mailbox keys)

---

## 7. Verification Checklist for Any Implementing Session

After each sprint, verify:
```sh
npm test
npm run typecheck && npm run build
```
And manually spot-check:
1. **All themes:** Colluder dark, Colluder light, Catppuccin Latte, Solarized Light, Nord, High contrast (confirm `web/test/themes.test.ts` stays green).
2. **Both Probe layouts:** Docked list (`\` open) and Tabs mode (`\` folded), at `1280×800`, `1440×900`, and `390×844` (mobile).
3. **Keyboard-only flow:** `p` → plant → Tab/Enter → copy payload → `o` → switch probe → `j`/`k` → `Esc` → switch to Mailbox/Settings and verify probe keys don't hijack navigation.
4. **Safety:** Verify any newly rendered attacker-controlled data (decoded XXE files, DNS labels, diffed headers, global search snippets) uses React text nodes only (never `dangerouslySetInnerHTML`) and leaves raw copy/evidence bytes untouched.

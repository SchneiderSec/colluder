---
name: Colluder
description: "Your insider on the wire. An out-of-band callback dashboard on warm soot, with bone ink and amber eyeshine."
colors:
  bone: "#ece3d1"
  bone-night: "#e6dccb"
  primary-hover: "#fff8ea"
  amber: "#f2b33d"
  ink-dns: "#c793c4"
  ink-http: "#e2643f"
  ink-https: "#8aa2ea"
  ink-smtp: "#62b08f"
  ink-other: "#b5ab9c"
  soot: "#16120e"
  soot-1: "#1e1914"
  soot-2: "#2a221b"
  well: "#110e0b"
  accent: "#30271f"
  rule: "#3a3129"
  rule-2: "#2a231d"
  smoke: "#b3a99a"
  ash: "#9a8f80"
  fur: "#9a9084"
  bad: "#e8735a"
  destructive: "#c4523a"
  alarm-ink: "#f3b4a3"
  alarm-banner-ink: "#f4c6b8"
  alarm-ground: "#2a1914"
  caution-ink: "#f3d9a4"
  caution-ground: "#2b2113"
  lit-flash: "#3a2c17"
  mask: "#0f0c09"
  eyeshine-highlight: "#fff4d6"
  eye-shut: "#5d554b"
typography:
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.4
    fontVariation: "'wdth' 96"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 650
    lineHeight: 1.4
    fontVariation: "'wdth' 96"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 96"
  control:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 550
    lineHeight: 1.4
    fontVariation: "'wdth' 96"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "0.03em"
    fontVariation: "'wdth' 96"
  rail-label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 550
    lineHeight: "12px"
    fontVariation: "'wdth' 96"
  data:
    fontFamily: "'Fragment Mono', ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.4
  data-raw:
    fontFamily: "'Fragment Mono', ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: "18px"
  data-title:
    fontFamily: "'Fragment Mono', ui-monospace, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.4
  data-headline:
    fontFamily: "'Fragment Mono', ui-monospace, monospace"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.4
  wordmark:
    fontFamily: "'Schibsted Grotesk', Archivo, sans-serif"
    fontSize: "13.5px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
rounded:
  swatch: "2px"
  sm: "3px"
  md: "4px"
  lg: "6px"
  pill: "9px"
  full: "9999px"
spacing:
  cell-y: "6px"
  gap: "10px"
  row-y: "11px"
  gutter-phone: "14px"
  gutter-list: "20px"
  gap-status: "22px"
  gutter: "24px"
components:
  button-primary:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.soot}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    height: "28px"
    padding: "0 10px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-lg:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.soot}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.soot-2}"
    textColor: "{colors.bone}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    height: "28px"
    padding: "0 10px"
  button-secondary-hover:
    backgroundColor: "{colors.accent}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    height: "28px"
    padding: "0 10px"
  button-quiet-hover:
    backgroundColor: "{colors.accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.smoke}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    height: "28px"
    padding: "0 10px"
  button-ghost-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bone}"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.alarm-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    height: "28px"
    padding: "0 10px"
  button-destructive-hover:
    backgroundColor: "{colors.alarm-ground}"
  button-link:
    textColor: "{colors.bone}"
    typography: "{typography.control}"
  composer-field:
    backgroundColor: "{colors.soot}"
    textColor: "{colors.bone}"
    typography: "{typography.data}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 12px"
  type-chip-dns:
    textColor: "{colors.ink-dns}"
    typography: "{typography.label}"
  type-chip-http:
    textColor: "{colors.ink-http}"
    typography: "{typography.label}"
  type-chip-https:
    textColor: "{colors.ink-https}"
    typography: "{typography.label}"
  type-chip-smtp:
    textColor: "{colors.ink-smtp}"
    typography: "{typography.label}"
  type-chip-other:
    textColor: "{colors.ink-other}"
    typography: "{typography.label}"
  chip-new:
    backgroundColor: "{colors.caution-ground}"
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 7px"
  chip-grey:
    backgroundColor: "{colors.soot}"
    textColor: "{colors.smoke}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 7px"
  new-dot:
    backgroundColor: "{colors.amber}"
    rounded: "{rounded.full}"
    size: "6px"
  rail:
    backgroundColor: "{colors.soot}"
    width: "76px"
  rail-item:
    textColor: "{colors.smoke}"
    typography: "{typography.rail-label}"
    rounded: "{rounded.md}"
    width: "70px"
  rail-item-hover:
    backgroundColor: "{colors.soot-1}"
    textColor: "{colors.bone}"
  rail-item-active:
    backgroundColor: "{colors.soot-2}"
    textColor: "{colors.bone}"
  rail-badge:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.soot}"
    rounded: "{rounded.lg}"
    height: "15px"
  composer-band:
    backgroundColor: "{colors.soot-1}"
    padding: "14px 24px 12px"
  probe-row:
    textColor: "{colors.bone}"
    typography: "{typography.data-title}"
    padding: "11px 16px 11px 20px"
  probe-row-selected:
    backgroundColor: "{colors.soot-2}"
  probe-row-lit:
    backgroundColor: "{colors.lit-flash}"
  hit-table-header:
    backgroundColor: "{colors.soot}"
    textColor: "{colors.smoke}"
    typography: "{typography.label}"
    padding: "5px 10px"
  hit-row:
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    padding: "6px 10px"
  hit-row-selected:
    backgroundColor: "{colors.soot-2}"
    textColor: "{colors.bone}"
  hit-detail:
    backgroundColor: "{colors.soot-1}"
    padding: "14px 20px 14px 24px"
  raw-pane:
    backgroundColor: "{colors.well}"
    textColor: "{colors.bone}"
    typography: "{typography.data-raw}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  overflow-cue:
    backgroundColor: "{colors.soot-2}"
    textColor: "{colors.smoke}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  view-toggle-on:
    backgroundColor: "{colors.soot-2}"
    textColor: "{colors.bone}"
    height: "24px"
    padding: "0 10px"
  custody-strip:
    backgroundColor: "{colors.soot}"
    textColor: "{colors.bone}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  status-bar:
    backgroundColor: "{colors.soot-1}"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    height: "28px"
  banner-alarm:
    backgroundColor: "{colors.alarm-ground}"
    textColor: "{colors.alarm-banner-ink}"
    padding: "9px 24px"
  banner-caution:
    backgroundColor: "{colors.caution-ground}"
    textColor: "{colors.caution-ink}"
    padding: "9px 24px"
  toast:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.soot}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  toast-bad:
    backgroundColor: "{colors.alarm-ink}"
    textColor: "{colors.soot}"
  mark-tile:
    backgroundColor: "{colors.fur}"
    size: "36px"
---

# Design System: Colluder

## Overview

**Creative North Star: "The Insider on the Wire"**

Colluder is a night-shift accomplice that sits beside the operator's proxy and reports, in a low voice, exactly who called back. The surface is a strip bay (since 2026-11-12, see "Strip Bay"): a neutral graphite frame holding strips, where every region, probe and detail block is its own object with a hard edge. Everything is dense, tabular and small (a 12.5px working size), because the screen lives on a second monitor and has to be read at a glance from across a desk. Character is real but held back: a raccoon's Domino mask in the corner, a ringed tail drawn under each probe, an amber eye that opens when something arrives. The data itself is never decorated.

The system is built on trust. Liveness is drawn, not implied: every state of the engine and stream has a line form and a plain word. Raw captures are evidence, so they are rendered as inert text, copied byte for byte, and any part that is folded away says how much is missing. Colour carries meaning (protocol, newness, alarm) and is always paired with a word.

It must not look like a hacker costume: no green-on-black terminal, no glitch effects, no neon, no matrix rain. It is a professional instrument that happens to have a raccoon.

**Key Characteristics:**
- A neutral graphite bay (rail, status bar, the gaps) holding strips one tonal step up, each with a 1px edge; a matched dark and light pair that follows the system.
- One accent with a single job: amber means new/unread (and the mark's eyes).
- Four protocol inks, never shown without their word.
- A four-step type scale (11 / 12.5 / 13.5 / 17px) in Archivo at a slightly condensed width, with Fragment Mono only for data.
- Line grammar for liveness: solid, dashed, struck.
- Flat surfaces, hairline rules, fill-only selection.
- Personality lives only in the mark, the tail, the night shift and hidden easter eggs.

## Colors

Strip Bay (2026-11-12): a neutral graphite bay and strips with near-white ink (near-black on the light pair). Warmth lives only in the accents: the amber eyeshine, the crew's coats and the mask. The other saturated colours are the four protocol inks and the alarm reds. The names below are the token names; the values are the default dark theme's (the light pair is under "Strip Bay").

### Primary
- **Bone** (#eceef1): the ink. Body text, primary values, the focus outline, and the fill of the single loud button in a region. It brightens to **Bone Glow** (#ffffff) on primary hover. Between midnight and 05:00 local time the app dims it to **Night Bone** (#dfe1e4) and shows a quiet "Night shift" label in the status bar.

### Secondary
- **Amber Eyeshine** (#f2b33d): new and unread. The new dot, the "n new" chip, the unread badge on the Probes rail item, the favicon's unread dot, and the eyes of the mark. It also tints the text caret in inputs.

### Tertiary (protocol inks)
- **Heather** (#b9a0f2): DNS.
- **Vermilion** (#f08c55): HTTP.
- **Periwinkle** (#73a9f5): HTTPS.
- **Lichen** (#5fc290): SMTP.
- **Dust** (#b5bac1): anything else.
The four sit at one even chroma so none shouts over the others.

### Neutral
- **Bay** (#101113): the frame. Body ground, the rail, the status bar, and the gaps between strips (the hit detail sits on it too).
- **Soot** (#1b1d20): a strip. The probe pane, each probe row, the list header and footer, the Mailbox and Payload kit pages, table headers.
- **Soot 1** (#212327): raised: the plant form, dialogs, popovers.
- **Soot 2** (#2b2f34): selected: the selected probe and hit, the "on" segment of a toggle, the secondary button.
- **Well** (#141518): behind raw request and response bytes and the custody line.
- **Accent Hover** (#282b30), **Hover** (#232529): hover fills.
- **Rule** (#3a3e45): every strip's edge, region borders, field strokes, scrollbar thumb.
- **Rule 2** (#2a2d32): row and column hairlines inside a strip.
- **Smoke** (#b5bac1): secondary text, labels, column headers.
- **Ash** (#979da5): tertiary text: hints, footnotes, placeholders.
- **Fur** (#9a9084): the mark's tile and the raccoon tail's body. Not a text colour; it stays warm (the mask is an accent).

### Status
- **Ember** (#e8735a): "bad" words in the status bar and the invalid-tag field border.
- **Destructive** (#c4523a): shadcn's destructive slot (invalid inputs).
- **Alarm Ink** (#f3b4a3) on **Alarm Ground** (#2a1914): destructive buttons, form errors, failed-action toasts. Engine-down banners use **Alarm Banner Ink** (#f4c6b8) on the same ground.
- **Caution Ink** (#f3d9a4) on **Caution Ground** (#2b2113): stream-paused and correlation-changed banners. Caution Ground also backs the amber "new" chip.
- **Lit Flash** (#3a2c17): the brief warm flash on a probe row or hit row when a hit arrives.

### Syntax (raw panes only)
- **Slate** (`oklch(0.76 0.055 235)`): names: HTTP header names, query and form parameter names, JSON keys, and 3xx status codes.
- **Sage** (`oklch(0.83 0.075 135)`): decoded values the client chose: query and form values, JSON strings, and 2xx status codes. Header values stay Bone, because they are most of what you read.
- 4xx and 5xx status codes are Ember. Methods, numbers, `true`/`false`/`null` are Bone at 650. Versions, punctuation (`? & = :`, JSON brackets) and markup tags are Ash.
- Syntax inks live only on the Well. They are never used for UI, and stay clear of amber and the four protocol inks.

### Mark
- **Mask** (#0f0c09), **Eyeshine Highlight** (#fff4d6), **Shut Eye** (#5d554b): used only inside the raccoon mark and the Konami peek.

### Named Rules
**The Eyeshine Rule.** Amber means "you have not seen this yet" and nothing else. It never marks a button, a link, a heading, a selection or a brand flourish. If amber is on screen, something is unread (or it is the mark's eyes).

**The Word-Beside-Ink Rule.** A protocol ink never appears alone. Every ink is drawn as a small square or tick next to its word (DNS, HTTP, HTTPS, SMTP, OTHER) or inside a labelled row. A colour-blind operator loses nothing.

**The Neutral Bay Rule** (replaced the Warm Soot Rule, 2026-11-12). Every neutral is a neutral graphite (chroma under 0.01). Warmth is an accent: amber, the crew's coats, the mask. No brown grounds, no beige ink.

## Typography

**UI Font:** Archivo (with system-ui, sans-serif), variable, set to width 96 everywhere.
**Data Font:** Fragment Mono (with ui-monospace, monospace).
**Wordmark Font:** Schibsted Grotesk (with Archivo), for the lowercase "colluder" wordmark only.

All three are self-hosted WOFF2 (latin and latin-ext subsets, `font-display: swap`). Nothing loads from a font CDN.

**Character:** a slightly condensed, sturdy grotesk doing the talking, and a calm, light monospace showing exactly what arrived. Tabular figures are on globally so times, counts and IDs line up.

### Hierarchy
- **Headline** (650, 17px): "Plant a probe", the probe name in the probe header (in mono), the hit number "#40" in hit detail (700).
- **Title** (650, 13.5px): section headers ("Probes"), probe tags in the list (mono), large-button text, empty-state leads.
- **Body** (400, 12.5px, 1.4): the working size for nearly everything: table cells, metadata, banners, the status bar, field text. Controls use 550; emphasised values inside body text use 600-650 in Bone. Prose blocks cap at 46-72ch.
- **Label** (650, 11px, 0.03-0.04em): table column headers (600), count chips, protocol counts in probe rows, hints and footnotes (400, in Ash), rail labels (550, 12px leading).
- **Data** (Fragment Mono 400, 12.5px; raw panes 18px leading): tags, IPs, payloads, hashes, custody timestamps, fix commands, raw bytes.

### Named Rules
**The Four Sizes Rule.** There are four sizes: 11, 12.5, 13.5 and 17px. A new element picks one of them. Hierarchy comes from weight (400 / 550 / 650 / 700) and ink (Bone / Smoke / Ash), not new sizes.

**The Mono-Is-Data Rule.** Fragment Mono means "this is a literal value you could copy": a tag, an address, a payload, a hash, a raw byte. Labels, prose, buttons and headings are never mono.

**The Wordmark Rule.** Schibsted Grotesk appears once: the bold, lowercase "colluder" at the left of the status bar. It is not a display face for headings.

## Layout

The desktop is a fixed, full-height application grid that never scrolls as a page:

- **Tool rail** (76px) on the left, spanning the full height: the mark, then Probes, a short Rule, then the cross-probe tool Payload kit, with Settings pinned to the bottom. Anything that changes what a single probe answers is a tab on the probe, not a rail tool.
- **Banners** stack at the top of the main column when something is wrong.
- **Plant form** on top, only while planting (the Plant button in the probe list header, or p, /; open by itself before anything is planted): the "Plant a probe" heading in a 132px label column, then Tag / Target / Technique / Plant in one row and a close button; a new tag previews its payloads under it. Planting folds it away and focuses the next step.
- **Probe list** (400px; 320px under 1180px; traded for probe tabs while a hit is open, see "Probe tabs"): latest activity first, with a 53px header ~~and a 40px Discord-alerts footer~~.
- **Probe pane**: a 52px probe header (tag, state, target; the payload copy buttons, Copy report and a ⋯ menu), the probe's payload rows under it while it has no hits (or when shown), a 40px tab strip (Hits · Answer, see "Tabs that read as tabs"; Unregistered has no tabs), then on the Hits tab a filter row and the hits table (capped at min(28vh, 212px) while a hit is open, min(22vh, 160px) on screens under 900px tall, so detail stays visible), a "Planted … · first hit …" caption between solid hairlines, then the hit detail filling the rest.
- **Status bar** (28px) along the bottom of the main column: wordmark, Engine, Stream, Last hit, then the payload host and the UTC clock on the right.

Spacing is tight and regular: 24px page gutter, 20px list gutter, 10px gaps between controls, 11px vertical row padding in the probe list and 6×10px table cells. The status bar spaces its items 22px apart.

**Breakpoints.** At **1180px** the probe list narrows to 320px and the plant form's payload notes drop out; the request and response panes stack whenever the hit detail is under 900px wide. At **820px** (phone) the rail turns into a sticky horizontal icon strip across the top (labels become screen-reader only), everything stacks into one scrolling column, the probe list caps at 48vh, the plant form's fields go full width, the probe header's buttons take their own wrapping row, the gutter drops to 14px, the hits table hides the Request column, payloads show a short host (`c0ffee12…`) with the tag still highlighted, and the status bar sticks to the bottom of the viewport.

### Named Rules
**The Detail-Stays-Visible Rule.** When a hit is open, the hits table shrinks to min(28vh, 212px) and scrolls on its own, so the selected request is always on screen next to the list it came from.

## Elevation & Depth

Flat. Depth is tonal and edged: Bay (the frame) → Soot (a strip, with a 1px Rule edge and a 5-6px radius) → Soot 1 (raised) → Soot 2 (selected); the Well sits inside a strip for raw bytes. Shadows appear only on things that float above the grid, and on a cocked strip.

### Shadow Vocabulary
- **Toast lift** (`box-shadow: 0 6px 18px rgba(0,0,0,.4)`): the bone copy-confirmation toast above the status bar.
- **Fold fade** (`box-shadow: 0 -8px 16px 8px var(--well)`): behind the "n more lines" cue, fading the last visible raw lines into the well so the cue reads.
- Radix popovers, selects and dialogs keep shadcn's default small shadows.

### Named Rules
**The Strip Rule.** Every object the operator reads as one thing (a region, a probe, a detail block, a banner) is a strip: its own ground one step above the bay, a hard 1px edge, and a gap of bay around it. Nothing is separated by tone alone, and strips never cast shadows except a cocked one.

## Shapes

Corners are barely softened. Controls, fields, raw panes, the custody strip and the view toggle use 3px. Rail items and the toast use 4px. Count chips and the overflow cue are 9px pills. Protocol squares are 8px with a 2px radius. The new dot is a 6px circle. The mark is a rounded square tile (radius 15 on a 64 grid).

Borders are 1px hairlines: Rule between regions, Rule 2 between rows. **The Rule 2 rule (2026-11-20):** Rule 2 (about 1.2:1 against its strip in every theme) only divides repeated siblings inside one object (table rows and columns, a group's rows, a well's title bar from its bytes). The edge of an object, and any boundary between different kinds of thing (a filter bar and its table, a form and its save bar), is a Rule or a bay gap. Lucide icons are drawn at stroke 1.5, 14px in buttons and 19px in the rail.

### Named Rules
**The Line Grammar Rule.** Liveness is a 22px line next to a word. Solid means live, dashed means starting or reconnecting, and a struck line (a slash through it) means down. The same line forms appear in the status bar, the banners and the "Armed · silent" probe rows. A dashed line always means "not yet / trying again", so it is never used as decoration.

**The Fill-Not-Stripe Rule.** Selection is shown by fill alone (Soot 2), never by a coloured side stripe, a left border or an accent bar.

## Components

### Buttons
Restrained, mostly outlined, with exactly one bright button per working region.
- **Shape:** 3px corners; 28px tall (24px small, 36px large); 10px side padding; 12.5px at 550; 14px icons at stroke 1.5; a 6px gap between icon and label.
- **Primary (bone):** Bone fill, Soot text, weight 650; brightens on hover. It is the region's single loud action: Plant in the composer, Copy as evidence in hit detail, Save and Retire in dialogs.
- **Secondary:** Soot 2 fill with a Rule border. On hover the border lifts to Ash and the fill goes to Accent Hover.
- **Quiet:** transparent with a Rule border and Bone text (Edit note, Retire…, Cancel, Look up, fix command). Hover is the same as Secondary.
- **Ghost:** no border, Smoke text, turning Bone with an Accent Hover fill on hover (copy icons, Copy both, Got it).
- **Destructive:** transparent, Alarm Ink text, a dark-red border, Alarm Ground on hover.
- **Link:** Bone text with an Ash underline that turns Bone on hover.
- **Focus:** global 1.5px Bone outline, 2px offset. **Disabled:** 60% opacity; a disabled primary takes the secondary look.

### Chips
- **Type chip:** an 8px ink square plus the uppercase protocol word in the same ink, 650 with 0.03em tracking (DNS A, DNS ×4, HTTP 3).
- **New chip:** an amber "3 new" or "new" pill on Caution Ground with an amber-brown border.
- **Grey chip:** "unregistered" in Smoke on Soot with a Rule border.
- **New dot:** a 6px amber circle at the start of an unread row. Read rows keep an empty 6px slot so columns never shift.
- **Unread counts firings, not rows.** Unseen hits on the same probe less than 3s apart are one event, so one payload firing (a DNS burst plus the HTTP fetch that follows it) reads as "1 new" and "(1) Colluder", never "(5)". Resolver chatter never counts.

### Inputs / Fields
- **Composer field:** a 36px Soot well with a Rule stroke and 3px corners, with the label (Tag, Target, Technique) inside it in Smoke. The value is mono for the tag. The tag field also shows the payload host as a mono suffix. On focus the stroke lifts to Smoke. An invalid tag turns the stroke Ember and puts an Alarm Ink message under the row. The caret is amber.
- **Dialog fields:** shadcn Input and Textarea on Soot 1 dialogs, retyped to 13.5px.

### Navigation (tool rail)
- 70px-wide items: a 19px icon over an 11px label, in Smoke. Hover fills Soot 1. The active item is filled Soot 2 with Bone text (fill only, no stripe). The unread count sits as an amber badge on the Probes item (capped at "99+").
- On a phone the rail becomes a sticky top strip of icons with screen-reader labels; the Rule after Probes turns vertical.

### Probe tabs
- Underline tabs under the probe header, 24px apart, 12.5px/550 in Smoke; the active tab is Bone with a 2px Bone underline sitting on the strip's bottom Rule. No amber on the active tab.
- Each tab carries its state after the label: the hit count on Hits, and on HTTP response what the probe answers with ("default" in Ash, "302, edited" for an unsaved draft).
- Hits only count as read while the Hits tab is in view. A hit that lands while another tab is open keeps the probe unread and puts the amber new dot on the Hits tab.
- Arrow keys, Home and End move between tabs. The tab is in the URL (`#probes/<tag>/http`) and stays put when you switch probes. j/k only act on the Hits tab. Old `#files`, `#responses` and `#rebinding` links open the matching tab.
- The HTTP response label shows the active rule in mono Bone ("302"; Ash while the edge isn't live, because nothing serves it yet), "default" in Ash, or "302, edited" in italic Smoke while an unsaved draft exists. Drafts are kept per probe across tab and probe switches; closing the page with one asks first.

### HTTP response editor
- Two columns when the panel is at least 940px wide (a container query on the panel, not the window): a 96px-label form on the left; on the right a 400px aside with **Next answer** (a raw pane on Well showing the exact bytes the edge will send, from the server's own code, with an HTTP/HTTPS toggle and hop arrows for loops) and **Rule history** (versions with time, what they did and "answered n hits"; clicking one loads it into the editor). Narrower panels put the aside below the form.
- Fields use the composer's field style (Well ground, 3px Rule border, mono values, Smoke border on focus), not stock inputs. Mode, status and encoding are segmented toggles like the hit detail's view toggle.
- A sticky footer: "Unsaved changes" with a hollow Smoke dot, **Save as vN** (primary, disabled while the draft is invalid or unchanged), Discard, and the rule that earlier hits keep the answer they got.
- Before the cutover the preview is titled "Answer after cutover" and the active version reads "saved · not served yet". A missing required value waits until you leave the field (the preview says "Location needed to preview the answer" in Ash); a wrong value is flagged at once. Loops of 9 or more hops warn that Go's HTTP client stops after 10 redirects. On a phone the footer sticks only while there are unsaved changes.
- An invalid draft never errors loudly: the field at fault gets an Ember border and a one-line reason under it, the preview says "Can't answer like this yet: …", and Save stays disabled. Switching mode keeps each mode's fields.
- Hosted file shows what to plant (the DOCTYPE line for XXE, an img tag for SVG, the page URL for headless) and the fetch URLs, each with a copy button.
- Before the cutover a Caution strip says rules aren't served yet, with the cutover command to copy. After it, if the edge stops, an Alarm strip there and an Alarm banner across the app say HTTP hits aren't being captured, with the restart command.
- Probe rows with a rule add a fourth line: a Redo icon in Ash and "Answers HTTP(S) with loop ×9, then 302 → 169.254.169.254" in Smoke (loop first so it survives truncation; hosts on the payload domain read "your … host"). Before the cutover it reads "Rule v1 saved, not served yet: …" in Ash.
- Hits answered as part of a redirect loop show "hop n" after the request line, so a loop reads as a sequence. Copy as evidence names who answered and who captured.
- **Status** is the 301–308 segment plus an "Unusual…" select (300, 305, 306, 309, 310), filled Soot 2 when one is picked. With a loop on, **Hop codes** takes a space-separated list the hops cycle through; the exit hop keeps the Status. Once hits arrive, the Loop row adds "Seen on v3: deepest hop 2 of 10: followed 1 redirect, then stopped at a 309." in Bone, and history rows add "· deepest hop 2/10".
- **Decoy** (every mode but Default): a switch, then First n requests / User-Agent has / Source IPs. Matching requests get interactsh's default reply at once, without the delay; the preview shows what a request past the decoy gets and says "past the decoy". History rows add "· n decoy"; the hit's answer reads "decoy default reply (one of the first requests)".
- **Mute:** when Discord is configured, a Bell icon button sits first in the probe header; muted it turns BellOff in Ash, and the probe's list row shows a small BellOff after the hit count. Hits are still recorded and shown.
- The response pane names who answered: "sent by Colluder · rule v2, redirect, hop 3", "sent by Colluder · default reply", or "sent by interactsh-server" for older hits; the custody line says Edge instead of Engine for hits the edge recorded.
- The status bar adds **Edge answering** (live line) once the edge exists, and **Edge down** in Ember if its heartbeat stops.

### Plant presets
Technique "SSRF → metadata" adds one row under the composer fields: a Cloud select (redirectable catalog rows; default AWS IAM role info), "Decoy reply for HEAD checks" (on), and one Ash sentence saying what Plant will serve. Plant saves the rule as v1 in the same request. For a preset probe, the payload rows become the preset's own: a type chip, a short name ("First choice", "Plausible path", "Over HTTPS"), the payload with the tag marked and its code in Ash, a copy button and a truncated Ash note; under them "Copy as is | URL | JSON | XML" and "Plain callbacks" (the generic three, with a way back).

Technique "XXE" adds a File select (`/etc/hostname`, `/etc/passwd` through php://filter, `win.ini`, or another path) and one Ash sentence with the parser caveats. Its seven payload rows (DOCTYPE line, whole document, parameter entity, external entity, XInclude, SVG upload, feed URL) fold into one line of named copy buttons while you read hits, like the plain rows. In the HTTP response tab a preset reads "XXE preset" with "Use another kind of answer" instead of the mode switch, then Serves (the parts) and File.

**Stage labels** follow the request line in Ash and repeat in the detail as "Edge: …": "decoy reply to a HEAD request", "hop 1: answered 301", "followed 1 redirect · hop 2: answered 307", "followed 2 redirects · answered 302 → 169.254.169.254". They say what the edge sent, never what the target did; the detail adds that following the exit shows in the target's response, not here. A payload code reads "Payload: SSRF → cloud metadata, First choice (ks1)".

**Edge code banner:** when the edge runs older code than is on disk (`lib/codehash.mjs`), an amber banner says so with a copyable `sudo systemctl restart colluder-edge`.

### Payload kit
A rail page in three bands. The header: "Payload kit", a Probe select (active probes, latest activity first; it opens on the probe you were looking at), the probe's host in mono with the tag marked, and on the right "Copy as is | URL-encoded | encoded twice", which changes what is shown and what is copied. Below, a 208px section list (the current one filled Soot 2, Bone 600) beside the section: a one-paragraph Smoke intro, any inputs that shape it (expected host; address, path and preset target buttons), then payload rows divided by Rule 2 hairlines: a 176px Smoke name, the payload in mono Bone (wrapping anywhere, tag marked, the variant code in Ash), an optional 11px Ash note under it, and a ghost copy button. No cards, no per-row icons. Under 820px the section list becomes a horizontal strip and names sit above payloads. A hit whose name or path carries a kit code says "Payload kit: Allowlist bypass, Userinfo @ (ka1)" in its detail.
- **Cloud metadata** rows name the provider in Bone over the endpoint in Smoke, then the URL, then one Smoke line saying what it needs ("Needs `Metadata: true`, so a redirect can't reach it" with the header in mono, or "No header needed: a redirect reaches it"), an Ash note, and ghost actions "Redirect ‹probe› here" (opens the probe's HTTP response tab with that redirect as an unsaved draft) and "Address forms" (IPv4 hosts only). The HTTP response editor's Targets list is built from the same catalog (`web/src/lib/metadata.ts`).

### Status bar and banners
- **Status bar:** Soot 1, 28px, the wordmark then `Engine` / `Stream` / `Last hit`, each as a line form, a Smoke label and a bold word ("capturing", "connected", "3m 57s ago"). A failing state turns the line and the word Ember. Hovering Engine explains the line grammar.
- **Banners:** full-width strips at the top of the main column, Alarm (engine down or degraded, load failure) or Caution (stream paused, correlation id changed, shown only while a live probe was planted before the change). Each leads with its line form, states what is wrong and what it means, and offers the fix inline (a copyable command, "Got it").

### Probe list row
A three-line row: new-dot slot, mono tag and hit count, last-activity time; then the target in Smoke; then count chips (amber "n new", protocol counts) and the **Ringed Tail**. Silent probes read "Armed · silent 3m" with a solid live line, and "No callbacks yet · planted 09:06"; retired ones read "Retired · silent 4h" in Ash. A retired probe that gets a hit after retirement comes back into the active list with a grey "late hit · retired 14:02" chip. The Unregistered row sits at the bottom, separated by a Rule, in sans rather than mono.

### Ringed Tail (signature)
A 120×10px raccoon tail as the probe's time axis: Fur at 40% opacity, tapering from a deep root at planting time (left) to a rounded tip at now (right), crossed by four faint Soot rings. Each hit is a 2px tick in its protocol ink at its relative time. The tail stays quiet so the ticks carry the signal.

### Gate-board rerank (signature)
When a hit moves a probe to the top, the rows slide to their new places (FLIP, 420ms, ease-out-expo) so the eye can follow what moved, and the arriving row flashes Lit for 1.4s.

### Hits table and DNS bursts
Fixed columns `#`, `Time (UTC)` (hours and minutes since 2026-11-20; the open hit shows the exact time; when the hits shown span more than one day, a Soot 1 divider row names each day: "Today · Sun, Nov 22", "Thu, Nov 19"), `Type`, `Source` (mono), `Request` (mono request line plus User-Agent for web, the mail sender for SMTP; for DNS the queried name, with the tag highlighted, any exfil labels in Bone, and the id shortened to `c0ffee12…`). It has a sticky Soot header with 11px Smoke labels. DNS lookups that arrive together collapse into one burst row ("#18–21", "DNS ×4", "2 resolvers", then the most specific name asked, "+n names" when there were others, query types (blank ones read "other"), span in ms, per-IP counts) with a chevron that expands its children, indented, on a slightly darker ground. Selected rows fill Soot 2.

- **Filters:** DNS / HTTP(S) / SMTP toggles, a search field ("Search names, paths, bodies, IPs") and Export (every stored hit as JSON lines). They are the first row inside the Hits panel at every width (since 2026-11-20; never in the tab strip). Search and type filters run on the server over every stored hit, not only the loaded ones, and say "n matches".
- **History:** the live list holds the newest 2000 hits across all probes; a probe with more shows "Load older hits (2000 of 2100 shown)" at the end of its table.
- **Resolver steps:** a lookup whose name is a proper suffix of a longer name the same resolver asked within 5 s reads "· resolver step toward ip-10-0-3-17.root…" in Ash (QNAME minimisation), never counts as new, and its detail says "Resolver step, not data." instead of listing extra labels.
- **Chatter on the probe:** bare-id lookups attributed to a probe also appear in that probe's table, greyed, as "· resolver chatter", never new.
- **This box:** hits from the OOB box itself (`COLLUDER_SELF_IPS`) read "this box" in Ash next to the source.

### Resolver-chatter labelling
A bare-id lookup within 10s of a tagged hit is labelled "resolver chatter around ‹tag›" in Ash. It is kept but never counted as new (no dot, no chip). Hit detail explains it in one sentence (QNAME minimisation or HTTPS host resolution).

### Hit detail
A header line with "#40", a type chip, an optional new chip, the receive time, the tag (and "(from path)"), and the bone **Copy as evidence** on the right. Then Source / rDNS / ASN, where ASN lookup is opt-in and labelled as sending the IP to a third party. Then an **Exact bytes | Decoded** segmented toggle, a "Wrap long lines" switch (its tooltip: display only, copies stay exact), **Copy as curl** (web hits: the request rebuilt as a shell-quoted curl command, Host, Content-Length and Connection dropped, with a comment naming the hit and, for engine hits, that interactsh normalised the headers), and Copy both. Extra DNS labels that decode to text add "· 726f6f74 decodes as hex to root" (hex and base32 only, since DNS case isn't reliable; labels split across a name are joined first).

### Probe report and trigger
The probe header has a quiet **Copy report** before Edit. It copies Markdown built on the server from every stored hit: summary (payloads, planted, counts, web sources with rDNS/ASN and "this OOB box"), the triggering request, a timeline (planted, first DNS, the first web request per protocol and per new source, decoded exfil, last hit), DNS resolvers, and the first non-self-test web request with its custody hash and the answer that went out. Captured values only appear inside code spans or fences longer than any backtick run in them. The Edit dialog has a mono **Trigger request** textarea (up to 32 KB) for the request pasted from the proxy; it loads on demand, so probe updates stay small.

### Parsed HTTP view
Web hits open in **Parsed** (the choice is remembered; DNS and SMTP keep Exact bytes | Decoded). Each pane reads top to bottom in sections divided by Rule 2 hairlines, each headed by an 11px/650 Smoke label with an Ash count ("Headers 8, in the order received"):
- the start line, unlabelled: method in Bone 650, the full raw target (path with the tag marked, then the encoded query tinted), the version in Ash; for responses the version, the status code in its syntax ink, and the reason. An engine-captured response to an HTTP/2 request adds "interactsh's rendering of its reply; the client spoke HTTP/2." in Ash;
- **Query** ("3 parameters, decoded"): a name/value list. `+` stays `+`; a value that decoding changed carries a grey "decoded" pill whose tooltip shows it as sent; control characters show as `\n`, `\t`, `\xNN` in Ash; a bare parameter reads "no value"; a value that decodes (hex, base32, base64url) to text gets an Ash "decodes as base64url to root:x:0:0" line under it;
- **Headers**: a name/value list. Its count says whose order it is: "as logged by interactsh: sorted, names normalised" for engine hits (interactsh re-serialises requests), "in the order received" for edge hits, "as sent" for responses. Names are capped at 24ch and wrapping at hyphens. The payload host reads as the tag marked, the id shortened to `c0ffee12…` and the domain in Smoke. Headers worth a second look carry a grey pill with a word: "forwarded for", "client IP", "via proxy", "original host", "came from", and "credential" (Bone) for Authorization, Cookie and API-key headers;
- **Body** (type · bytes): JSON re-indented token by token from the original text (big numbers, escapes and repeated keys survive; a repeated key gets a Bone "duplicate key" pill), form bodies as a decoded name/value list, HTML/XML with tags in Ash, anything else as text.
A head that doesn't parse as HTTP falls back to the exact lines and the caption says "couldn't parse as HTTP · exact lines". Pane captions name who wrote the bytes: "as logged by interactsh-client" or "exact, as received by the edge". Forwarded-IP headers (X-Forwarded-For and friends) also appear as "Forwarded for 10.20.0.9" next to Source, with a tooltip saying the sender sets them. The Parsed toggle's tooltip says copies stay exact, and Copy still gives the exact bytes. Exact bytes keeps every character but tints the request line, query, header names and status code with the same inks.

The panes sit side by side while the hit detail is at least 900px wide and stack below that (a container query); a pane narrower than 440px stacks each name above its value.

### Raw pane
Request (or Query) and Response (or Answer) side by side on the Well, each with a 32px title bar showing the name, an Ash sub-caption ("exact, as received · 6 lines · 145 bytes") and a ghost Copy. Bytes are Fragment Mono 12.5/18px. HTTP header names are tinted Slate. Wrapped lines hang-indent by 2ch.

### Overflow cue (signature)
When lines sit below the fold, a Soot 2 pill in the pane's bottom-right reads "↓ 3 more lines" over a fade into the well. Clicking it scrolls 80% of a page. Captures over 200,000 characters end with "… n more bytes not shown. Copy gives everything."

### Custody line (signature)
A small Soot strip under the panes: **Custody** · Engine timestamp · Dashboard timestamp with the +ms delay (or "backfilled after a restart") · "SHA-256 at ingest d40830ad…e975" with a copy button. The wording is deliberately "SHA-256 at ingest", which says what the dashboard computed and when. It never says "sealed", "verified" or "tamper-proof".

### The Mark (signature)
The raccoon's Domino mask on a Fur tile, 36px in the rail, also drawn as the 64px favicon (with an amber unread dot) and the Discord avatar. States: **wink** (resting: left eye open, right eye winking), **open** (both eyes wide and popping on a new hit), **blink** (slow 2.4s blink while engine or stream is connecting), **doze** (eyes shut in Shut Eye after 2h with no traffic; the next hit wakes it with two quick blinks), **mirror** (the wink swaps sides after washing). Easter eggs: five clicks within 2.5s make it wash its paws, and the Konami code makes the whole raccoon peek up over the hit detail once. Neither ever touches evidence or copy.

### Toast
A Bone pill (Alarm Ink when something failed) that rises 44px above the bottom edge, centred, confirming what was copied ("HTTP payload copied"). It is announced politely to screen readers.

## Do's and Don'ts

### Do:
- **Do** keep amber (#f2b33d) for new/unread and the mark's eyes only.
- **Do** pair every protocol ink with its word: square plus "DNS", tick plus a labelled row.
- **Do** draw liveness with the line grammar (solid = live, dashed = starting/reconnecting, struck = down) next to a plain word, and make the bad state Ember.
- **Do** show selection with the Soot 2 fill alone.
- **Do** pick one of 11 / 12.5 / 13.5 / 17px, and get hierarchy from weight and ink.
- **Do** set every literal value (tag, IP, payload, hash, raw byte) in Fragment Mono, and nothing else.
- **Do** render raw, attacker-controlled data as text nodes only, never as HTML, markdown or links.
- **Do** make every copy action deliver the exact bytes as received. Wrap and Decoded are display-only, and the UI says so ("copy stays exact").
- **Do** announce what is folded or cut ("3 more lines", "n more bytes not shown") so a partial view never looks complete.
- **Do** use ease-out-expo (cubic-bezier(0.16, 1, 0.3, 1)) for movement, and let prefers-reduced-motion switch off every animation and transition.
- **Do** keep the custody wording factual: "SHA-256 at ingest".
- **Do** label resolver chatter instead of hiding it, and leave it out of new counts.

### Don't:
- **Don't** use amber for buttons, links, focus, headings or decoration.
- **Don't** use colour alone to mean a protocol or a state.
- **Don't** use dashed lines or borders as decoration; dashed means "starting or reconnecting".
- **Don't** mark selection or the active nav item with a side stripe, left border or accent bar.
- **Don't** add font sizes outside the four-step scale, or use Schibsted Grotesk anywhere but the wordmark.
- **Don't** put more than one bone primary button in a working region.
- **Don't** add shadows to panels, rows or panes; step the tone instead.
- **Don't** call captures "sealed", "verified" or "tamper-proof".
- **Don't** transform data when it is copied (no trimming, re-encoding, wrapping or decoding).
- **Don't** put raccoon jokes, easter eggs or playful copy in evidence, data or error text.
- **Don't** dress it as a hacker tool: no terminal green, glitch, neon or scanlines.

## Review 4 polish (2026-11-05, PLAN-REVIEW4.md)
- No planned surfaces ship: the Listeners page, the DNS answers tab and "DNS rebinding (planned)" are gone until they work.
- Payload rows fold into one line of copy buttons on every tab of a probe that has hits; a fresh probe keeps them open. A preset shows three rows, then "Show all n payloads". A Redirect or Hosted-file probe without a saved rule says "default reply until you save its redirect" in amber under its tag.
- After planting, focus goes to the next real step: Location (Redirect), Template (Hosted file), else the first copy button. Toasts sit above the editor's Save footer.
- Hits sort by capture time. The Request cell reads request line · stage · User-Agent (Ash), so the stage is never cut off. Bursts count their own lookups, with "+n chatter" beside.
- The probe list and the hits table are one tab stop each; arrows move the selection. Segmented toggles and select triggers show the Bone focus outline. The selected probe scrolls into view (never on first load).
- Hit detail: "What the edge did: …" as a sentence, the follow-up caveat in Ash; TLS-only, malformed, not-UTF-8 and truncated hits each get one bold-led sentence, with "Download the exact bytes". "Mark as mine" sits beside a non-box source; its hits read "yours".
- Parsed view: with a Query section, the start line shows each value briefly; any value over 600 characters shows "+n chars".
- On a phone the status bar keeps short labels (Eng, Str, Edge) and rail targets are 44px.
- Names: technique "Default reply" (was Callback), copy formats "as is · URL-encoded · JSON · XML", "Clear all hits…".

## Audit fixes (2026-11-06)
- **One state per probe, one set of words** (`web/src/lib/probeState.ts`), read by the list row, the probe pane, the payload band and the status bar: Armed, Retired, Late hit, Not planted. A retired probe never says "waiting"; a tag nobody planted never says "Armed".
- **Cleared hits are named.** A probe with nothing since a clear reads "No hits since the clear at 15:30"; the status bar's Last hit adds "· cleared 15:30" with a tooltip pointing to Restore.
- **"No tag" and "not planted".** Hits without any tag are the **No tag** row (it was "Unregistered", the same word as a tag nobody planted). A tag a request named but nobody planted gets a grey "not planted" chip, and leaves the list once it has no hits.
- **Probes can be deleted.** Retired probes and not-planted tags get a destructive **Delete…** in the header (with Export hits in the confirm); the Retired section gets **Delete all…**, which skips probes with a late hit. Deleting is permanent: the probe, every stored hit (cleared ones too) and its rule history. Live probes must be retired first; Claude (the MCP) can't delete.
- **Filter probes** in the list header (tag, target, note); "Latest activity first" moved to the heading's tooltip.
- **Technique mark:** an icon plus word (SSRF → metadata, XXE, Redirect, Hosted file) in the row and header. The plain callback has none, since it's the default.
- **Colour, amended rules.** The syntax inks (Slate names, Sage values) now also colour the query in the hits table's Request cell, with the method in Bone 650 and the version in Ash; still never used for UI chrome. Self-test rows (this box, yours) recede to Smoke with a grey "this box"/"yours" chip in Source, so target hits are the Bone rows; a target's source IP is Bone 550. Hit-detail labels (Source, rDNS, ASN / owner) use the 11px Label style so values stand apart.
- **A retired probe's payload band** folds to one line: "Retired 05:18. Restore it to use these payloads again, or plant a new tag above." with "Show its payloads".
- **Touch:** under 820px or on coarse pointers every button keeps its look but gets a centred 44px hit area; the probe tab strip is 44px tall.
- **Tokens:** hover, child-row, tag-mark, Alarm and Caution colours are CSS tokens (`--hover`, `--child`, `--mark`, `--alarm-*`, `--caution-*`); components no longer hard-code them.

## Live lines (2026-11-06)
- **The Line Grammar Rule, amended.** A live line moves: a dim wire (38%) with a short pulse of signal travelling left to right every 1.8s (ease-in-out). Motion means live and nothing else on screen moves continuously. Dashed (starting or reconnecting) and struck (down) stay still. A fourth form, **off**, is a still line at 45% for things that are off by choice: retired probes, Discord alerts turned off.
- **Each live thing has its own signal** (amended the same day, after "they all look uniform"): the **engine** is a heartbeat trace with a beat running through it, then a rest; the **stream** carries two small packets along the wire; the **edge** sends a pulse out and back (request, answer); an **armed probe** listens: a slower, dimmer pulse coming in from the right, each probe on its own phase (from its tag), so the list shimmers instead of marching in step; **alerts** send one pulse, then a long rest. Lines of the same kind without a seed share one phase. With reduced motion the pulse is removed and the wire is solid, beside the same word.
- Where it appears: the status bar (Engine capturing, Stream connected, Edge answering), every armed probe row (silent ones and ones with hits, before the last-hit time), the probe header ("Armed", or "Retired" with the off line), and Discord alerts in the list footer and Settings.

## Type and contrast pass (2026-11-06, audit)
- **Smoke is #b3a99a and Ash is #9a8f80** (were #a99f90 and #8f8576). Ash was 4.31:1 on a selected row (Soot 2) and only 4.7–5.1:1 elsewhere; now it is at least 4.9:1 on every surface (5.9 on Soot) and Smoke at least 6.3:1. They moved together, so the step between them stays the same (1.37 vs 1.39).
- **The four sizes are theme tokens in rem**, times `--type-scale`: `text-label` 11px, `text-body` 12.5px, `text-title` 13.5px, `text-headline` 17px at the default. A browser's default font size carries through; no component uses a px font size. (`lib/utils.ts` teaches tailwind-merge that these are sizes, not colours.)
- **The label size defaults to weight 450 with 0.01em tracking**, because 11px at 400 is thin light-on-dark in condensed Archivo. An explicit weight or tracking class on the element still wins (chips stay 650).
- **Text size setting:** Settings → Display → Compact | Comfortable. Comfortable multiplies the four sizes by 1.08 (12.5 → 13.5), per browser (`colluder.textSize`). The status bar drops the payload host below 1640px and the last-hit clock below 1520px in Comfortable mode so nothing overlaps.
- **Disabled buttons** are 60% opacity (was 45%). A disabled primary drops to the secondary look (Soot 2, Smoke text, Rule border) instead of fading the bone fill, which read as broken at 2.9:1.
- The hover glow on the primary button is the `--bone-glow` token.

## Themes and display settings (2026-11-07)

- **Dark stays the default and the reference.** Every other look overrides the same custom properties on `<html>` (`data-theme`, `data-inks`, `data-motion`, set by `lib/display.ts`); no component carries its own colours. Each text colour holds 4.5:1 on every ground it sits on (Soot, Soot 1, Soot 2, Well, Hover), checked with a script.
- **High contrast** is the same room with the lights up: Smoke `#d6ccbc`, Ash `#c2b7a6`, Rule `#6a5b4b` (2.9:1 against Soot, so dividers read), inks lifted.
- **Light** is warm paper (`#f3eee3`, raised `#faf7f0`, Well `#ebe4d6`) with Soot ink (`#1d1813`). Amber deepens to burnt ochre `#7f5300` so it still reads as text; the four inks deepen (DNS `#8a3f86`, HTTP `#a93a17`, HTTPS `#3450ad`, SMTP `#1f6f48`). The primary button inverts (dark fill, paper text). Night shift never applies to it. The raccoon mark keeps its own palette: a dark mask reads on paper.
- **Colour-blind-safe inks** use Okabe-Ito hues (reddish purple, orange, sky blue, bluish green), tuned per ground. The protocol name is always written beside its colour, so colour is never the only cue.
- **Motion:** Moving (default), Still lines (the live-line pulse is removed, as with reduced motion; arrival pops and flashes stay), None (reduced motion whatever the system says). The system's reduce-motion setting always wins.
- **Display settings are per browser** (localStorage `colluder.display`), like the text size: the desk monitor and the phone differ, and other people on the tailnet see the same dashboard.
- **The arrival chime** is two soft sine notes (E5 then B5, 0.3 s), made with Web Audio, off by default. It follows the unread rules: resolver chatter, DNS steps and your own sources don't ring, and a burst rings once.

## Settings page (2026-11-07, restructured)

- **Two columns:** a sticky section index (176px) beside the sections (720px max). Below 1000px the index becomes a wrapped row of jump links above the sections. The index doubles as a health summary: each entry carries its state in the line grammar (Outside check passing or failing, System capturing, Alerts on or off) or its current value (payload domain, theme). The highlight follows the scroll; a clicked entry holds while its scroll settles.
- **Order, by why you came:** Payloads (what to paste, which domain), Alerts, Outside check, Display, System (engine and edge facts), Data, Keyboard.
- **One row grammar:** grouped panels (Soot 1, Rule border, 4px radius, Rule 2 hairlines between rows) of label | value rows, with a 168px label column and labels top-aligned with the first line. Editable rows are 28px lines; read-only facts use the dense row. A group may have a small title above it (label size, Smoke) and a note under it (Ash). There's no nesting, and no shadows.
- **Rhythm:** 44px between sections, 20px between groups, 12px from a section's heading to its first group.
- **The outside check** is a status line (line form, state word, last run) over a domain × step matrix (Passed with a check mark, Failed in Bad with a cross; the step's detail is in the cell's title). Failures are spelled out on an Alarm ground under the matrix, warnings on Caution. On phones the matrix becomes one line per domain naming the failed steps. Certificate and registration dates live on each domain's row under Payloads, not here.

## Named dark themes (2026-11-07)

- **Dracula, Nord and Tokyo Night** join Colluder (the default dark), High contrast and Light. Each takes its published palette (all MIT-licensed) for the ground, ink and accents, mapped to Colluder's roles: amber is new/unread (Dracula orange `#ffb86c`, Nord yellow `#ebcb8b`, Tokyo `#e0af68`). The four protocol inks stay four distinct hues: Dracula purple/pink/cyan/green, Nord aurora purple and orange with frost blue and aurora green, Tokyo magenta/orange/blue/green.
- **Lifted only where 4.5:1 fails:** each original's comment grey is replaced by a lighter secondary and tertiary ink. Dracula and Nord's "current line" colours (`#44475a`, `#4c566a`) stay as the text selection, but the selected-row fill is a step deeper (`#393c4e`, `#3c4454`) so coloured text on a selected row still reads. Red is lifted a little on both. Colour-blind-safe inks get per-theme values on Dracula and Nord. Every pair was checked with a script.
- **The theme picker** is a grid of preview tiles (a radio group: arrow keys move, Space or Enter picks). Each tile is a miniature of the dashboard drawn in its own theme's tokens (see "Every theme gets the same care"), with a faint Rule hairline so the light one keeps its edge. Match system splits light and dark on the diagonal.
- **Match system** uses Light when the OS is light, and otherwise the dark theme picked last (`dark` in `colluder.display`), not always Colluder.

## More themes, and Discord (2026-11-07)

- **Catppuccin Mocha** (mauve DNS, peach HTTP, blue HTTPS, green SMTP, yellow for new) and **Gruvbox Dark** (purple DNS, orange HTTP, blue HTTPS, aqua SMTP: its olive green sits too near the yellow that marks new). Mocha's palette holds 4.5:1 unchanged. Gruvbox's selected-row fill is a step deeper than bg1, and its red, purple and blue are lifted a little. Long names shorten on the narrow picker tiles ("Catppuccin", "Gruvbox").
- **Discord posts are embeds.** The bar is the protocol's ink (the default palette), grey for late hits on retired probes. The title (probe · hit number) opens the probe in Colluder. Source and Reverse DNS are inline fields; Request and User-Agent (or Lookup for DNS) are full-width; Discord shows the timestamp in local time. The headline also goes in the message text, so phone notifications say what happened. Request data sits in inline code, where Discord renders no markdown, mentions or links. Roll-ups stay one plain line. Outside check changes are embeds in Bad, Smtp green or Amber.
- **The webhook's avatar** is the resting mark (open eye and wink, no paws) on Fur, centred for Discord's circle crop: `assets/discord-avatar.png`, 512px. The collector sets it with the webhook's own token, once per webhook and avatar, at start and when a webhook is saved.

## Readability pass (2026-11-12)

"Everything is so monotone": in the named dark themes the three text inks had drifted together, and labels outweighed the values they name.

- **One contrast floor for Smoke and Ash in every dark theme.** Smoke sits at 6.3:1 and Ash at 4.7:1 on the brightest ground they appear on (the selected row), as in the default theme, and no higher. Dracula, Nord, Tokyo Night, Mocha and Gruvbox had lifted both well above that, so Bone, Smoke and Ash differed by only 1.25× and 1.6× in luminance (the default: 1.9× and 2.8×). Each keeps its hue; only the lightness moved (Mocha: Smoke `#afb7d2`, Ash `#989fb9`). A theme whose Bone is dim still has less room than the default; the weight rules below carry the rest. High contrast and Light are unchanged.
- **Labels sit behind values.** Hit-detail field labels (Source, Resolver, Forwarded for, rDNS, ASN / owner) are 11px at 550 in Ash, not 650 in Smoke. The probe header's technique is 550; "Planted" is Ash with its time in Smoke, after the target. The sentence under every DNS hit is Ash: it is a footnote, not news.
- **Probe rows:** a planted probe's tag is Bone whether or not it has hits (weight 550 marks the ones that do); retired and not-planted tags stay Smoke. "Armed · silent 4d" and "No target noted" are Ash.
- **DNS and mail raw panes are tinted like HTTP** (`web/src/lib/dnsview.ts`, tested to join back to the exact line). DNS: section headings in Smoke 650, `;` comments and their keys in Ash with values in Bone, the status in the value ink (Ember when it failed), names in Bone with the tag marked, TTL and class in Ash, the record type in the name ink at 650, the answer data in the value ink. Mail: header field names in the name ink, in the hit detail and in the Mailbox's Headers and Exact bytes views. Display only; Copy, the download and the evidence block carry the bytes as stored.
- **Mocha's value ink is Pink** (`#f5c2e7`): Rosewater sat on top of its text ink.
- **Mail to a probe names its capture:** the edge's mail hits carry an answer record (mode `mail`) and the 250 the edge sent, so the panes read "exact, as received by the edge" and "sent by Colluder's edge: the message was accepted". Hits stored before this read as engine captures.

## Distill (2026-11-12)

"It is overwhelming and I have no idea where to look." Every part of the Probes view carried the same weight, and the answer (what called back) sat under a composer, six header buttons, a filter bar and two dig dumps. Same look, same layout; less on screen at once, in reading order.

- **Planting folds away.** The composer became a plant form behind a Plant button in the probe list header (bone while closed, secondary while open), opened by p or / from anywhere, closed by its × or Esc on an empty form, and open by itself only when nothing is planted. Planting closes it and focuses the next step (the first payload copy button, or the Redirect / Hosted file editor). A new tag still previews its payloads in the form.
- **Payloads live with their probe.** While a probe has hits, its payloads are copy buttons in its header (type chip each, a ⌄ to show the rows); a probe without hits shows the rows under its header, notes in each row's tooltip. A retired probe gets one Ash line and "Show its payloads".
- **The header is one line:** tag, Armed/Retired (planted time in its tooltip), the technique only when it isn't Default reply, a muted bell when muted, the target (note in its tooltip); then payloads, Copy report and ⋯ (Edit target, note, trigger…; Mute/Unmute Discord alerts; Clear hits…; Retire…/Restore; Delete… after a separator, in Alarm Ink). The menu is `components/ui/dropdown-menu.tsx` (Radix), styled like the select popover.
- **Silent probes fold.** Armed probes planted over a day ago with no hits and nothing unread collapse into one "Silent (n)" line listing their tags; opening it is remembered, and a selected or filtered-for probe always shows. The No tag explanation is the row's tooltip.
- **A hit leads with one sentence** in Title size: "MX lookup of x.orca-k7wq2x.oob.example" (the tag marked), "Mail from a to b" with the subject in Ash, or the request line with its User-Agent in Ash. Facts (Source / Resolver, rDNS, ASN) follow, then the bytes.
- **Explanations are tooltips:** "Resolver" (dotted underline) says DNS hits come from the resolver, Look up says it sends the IP to Team Cymru, Wrap long lines and Parsed say copies stay exact.
- **DNS bytes fold** behind "Query and answer · exact bytes (n)", remembered per browser; the line above already says what was asked. HTTP and SMTP panes stay open: their bytes are the story.
- **A hit opens only when you pick it.** Opening a probe shows its hits table filling the pane and "pick a hit to read it" in the caption; nothing is selected for you, and new hits don't move the selection. Clicking the open hit again, Esc, or the × beside Copy as evidence folds the detail. Expanding a DNS burst only expands it. The hits-list height setting caps the table only while a hit is open.

## The crew (2026-11-12)

"The probes blend together: give them different colour colluders, as if they're part of the collusion team." Every probe is a raccoon on the crew, drawn with the Mark's own mask (`CrewMark` in `components/Mark.tsx`), 30px in the probe row's lead column and 26px beside the tag in the probe header, so the list and the pane visibly name the same probe.

- **The coat tells probes apart.** `lib/crew.ts` hashes the tag to one of sixteen coats: eight hues (25, 105, 145, 185, 220, 255, 290, 330 in OKLCH, steering clear of amber) in two shades (L 0.66 and 0.84), chroma 0.085 so they read as fur, not signal lights. The tile is self-contained like the Mark, so one set works on every theme. Probes on the active list (including a retired probe with a late hit) pick first in plant order and never share a coat: one whose coat is taken moves to the next free one, and an earlier probe keeps its coat when new ones arrive. Retired probes pick last and may repeat once all sixteen are worn.
- **The face says the state.** Armed: a cream wink. Retired or not planted: eyes shut (retired at 70% opacity). No tag and not-planted tags are the grey stray (`STRAY`): nobody on the crew. **Amber stays "new":** only a raccoon with hits you haven't seen opens both eyes in amber and wears the amber badge; it replaces the row's amber dot.
- Rows divide on Rule instead of Rule 2, so the edge between two probes holds even when neither is selected.


## Second distill pass (2026-11-12)

The same four complaints, followed into the other surfaces: too much at once, things blending, detail before it's asked for, explanations taking room.

- **Payload kit: the shared host recedes.** Every payload of a probe carries the same long host, so it is Ash; what tells two payloads apart stays Bone (scheme, path, separators) and the variant code is Bone 650; the tag keeps its mark. `payloadParts` in `lib/kit.ts` splits the text (tested to join back exactly, URL-encoded copies included); `Marked` renders it everywhere a payload is shown. The kit no longer opens on a retired probe.
- **Quiet probes take one line.** Silent armed probes and retired ones (without unseen hits) are `Brief` rows: an 18px raccoon, the tag, the target in Smoke, and "silent 2d" / "retired 11-05" / "1 hit · retired 11-06" in Ash. Cleared-when, planted-by-Claude, the HTTP rule and muting are the tooltip. Probes that talked keep the full row.
- **Mailbox: every address is on the crew.** Each local part wears its own coat (the same `crewCoats`, first address seen picks first); a message you haven't seen opens its raccoon's eyes in amber, replacing the dot. The header is one line ("Receiving · 25 messages, kept 7 days") with ports, other hosts and the last lookup in its tooltip. The envelope sender is the From line's tooltip, and "shown as text; links aren't live" is the view toggle's.
- **HTTP hits name the client in a few words.** The lead line is the method and path, then "Chrome 150 on macOS" (`uaShort` in `lib/headers.ts`, tested), the whole User-Agent on hover. In the parsed request, the headers every browser sends (Accept*, Connection, Sec-CH-UA*, Sec-Fetch-*, Upgrade-Insecure-Requests, …) fold behind "+12 standard browser headers" when there are three or more, remembered per browser; a header the view flags never folds.

## The crew gets characters (2026-11-12)

"Have the colluders be different animals: a cat, a bird, a monkey." The crew is now ten kinds, all wearing the Colluder's bandit mask: raccoon (the Colluder itself), cat, fox, bear, rabbit, bird, monkey, owl, mouse, dog. `CrewMark` draws a head instead of the Mark's tile, so the kind shows in its silhouette: one head (ellipse 24×22), the mask and eyes at 80%, and per kind the ears or crest behind the head, the face, muzzle or cheeks in front, and the nose, beak or whiskers on top. Muzzles and faces are a lighter fur of the same coat (cream at 55%), inner ears a shade darker, beaks and teeth cream, small noses pink; a 2.5-unit dark outline keeps light coats clear on Light. Each kind was checked to read at 18px: the owl's tufts flare outward and it has pale eye-discs, the raccoon has rounded ears and a white brow, so neither reads as the cat.

- **Kinds are dealt like coats** (`crewKinds` in `lib/crew.ts`, a second hash independent of the coat): the first ten on the active list are ten different animals, and a probe keeps its kind as newer ones arrive. `crew()` returns each member's look (coat and kind); the Mailbox deals its addresses the same way. Strays (no tag, not planted) stay the grey raccoon.
- **The shark (2026-11-12)** is the eleventh kind: swept dorsal fin, pectoral fins, a pale belly, gill slits and a toothy grin (the jaw, hinged at the top lip, nearly shut at rest). A third hash picks the sharks (about one tag in eleven); every other tag keeps the kind it had among the first ten. **Easter egg:** click a shark three times in a row and it bites: it lunges (scale 1.12, a slight tilt) with the jaw wide, then snaps shut (240 ms in) and settles. The snap's overshoot is deliberate; it's what reads as a bite. The click still selects the row; reduced motion shows the frames without the movement.
- **Crew tricks (2026-11-12).** The shark's bite grew into a set: click any crew member three times in a row and it does its own trick. Raccoon: pulls the mask down over its eyes, then winks the other eye. Cat: swats a paw at the cursor. Fox: crouches, then pounces nose-first. Bear: yawns, then naps with z's. Rabbit: hops, ears flopping on the landing. Bird: flaps its crest and lifts off. Monkey: covers its eyes (see no evil). Owl: turns its head all the way round. Mouse: whiskers twitch, then it shrinks back. Dog: pants. Shark: bites. The moves are CSS keyframes on named parts (`.cm-body`, `.cm-back`, `.cm-top`, `.cm-mask` and each trick's prop: paw, hands, tongue, yawn, z's; "Crew tricks" in index.css); the eyes and the jaw are timed in `CrewMark` (`TRICKS`, typed per species so a new kind can't ship without one). A prop rests in its key pose, so reduced motion shows the pose without the movement. The click still selects the row.
- **The owl works nights (2026-11-12).** From midnight to 05:00 local time a silent or retired owl keeps its eyes wide open (both cream, a size up) while the rest of the quiet crew dozes. It follows the clock, not the Night shift setting.
- **ultrathink (2026-11-12).** The word "ultrathink" (any case, anywhere) in a tag or target is drawn the way Claude Code draws it: each letter one of seven rainbow colours, red to violet, flowing rightward through the word (2.1 s cycle; `components/Ultra.tsx`, `lib/ultrathink.ts`, `.ultra-l`). It shows in the list rows, the probe header, the hit detail, the status bar's last hit and the Payload kit picker. The seven colours (`--rb-1`…`--rb-7`) are set per theme pair and hold 4.6:1 on every ground of every theme, blends between them 4.59 at worst; reduced motion keeps the still rainbow. The rainbow's yellow sits beside amber only inside this word; amber still means only "new" everywhere else.
- Hovering a member names it: "orca's colluder: a monkey", "orca-shop-victim: a monkey".
- Eyes are unchanged: a cream wink while armed, shut once retired, amber with the badge only for unseen hits.

## Strip Bay (2026-11-12)

"No clear separation between elements": the warm soot theme had one brown ground for the rail, list, pane and status bar, beige ink in every tier, and murky banners. The replacement world, chosen from four mockups (Strip Bay, Packet List, Departure Board, the category standard), comes from air-traffic-control flight strips: each flight is a strip in a bay, fields sit in ruled boxes, and a controller flags one by sliding it out of line.

- **A matched pair that follows the system.** "Match system" is the default (Settings → Display: Match system and the light themes, then Colluder dark, High contrast and the named dark themes). A browser that saved the old default "dark" moves to Match system once (`colluder.display` v2); an explicit pick of any other theme is kept.
- **Dark:** bay `#101113`, strip `#1b1d20`, raised `#212327`, selected `#2b2f34`, well `#141518`, edge `#3a3e45`, hairline `#2a2d32`; ink `#eceef1` / `#b5bac1` / `#979da5`.
- **Light:** bay `#d7dade`, strip `#ffffff`, selected `#e6ebf1`, well `#f5f6f8`, edge `#b9bfc7`, hairline `#e1e4e8`; ink `#16181b` / `#454a52` / `#555b64`; amber `#7f4f00`; inks DNS `#7044be`, HTTP `#9f4309`, HTTPS `#265bb9`, SMTP `#0e6d43`. Every text ink holds 4.5:1 on every ground it can sit on, the bay included (`web/test/themes.test.ts`). High contrast is the same bay with brighter edges and text; the named themes each get a bay one step below their ground.
- **The shell:** the rail and status bar sit on the bay with no borders; the current tool is a strip. Banners are strips with their own alarm or caution edge, stacked with 6px gaps. The work area has 8px of bay around and between the probe list and the pane.
- **The probe list is not a strip; its parts are.** The header (53px, so its bottom edge meets the probe header's), each probe row (5px radius) and the Discord footer are strips in the bay; silent and retired probes are slimmer strips. **Bays** label the sections: Active (shown when there are other sections), Silent and Retired, each a small Smoke label over a Rule line.
- **The cocked strip (signature).** A probe with unread hits slides 12px out of line toward the pane, with an amber edge and a soft shadow; once read it slides back (0.5 s, ease-out-expo; reduced motion shows the offset without the slide). The list keeps 14px on the right so a cocked strip never clips. Amber still means only "not seen yet".
- **The pane** is one strip. Hit-table columns are divided by Rule 2 hairlines; state (selected, new, chatter) restyles a row's fill and ink, never the grid. The **hit detail** sits on the bay inside the pane as two strips: what happened (header, lead, fields, notes), then the bytes (view controls, request and response wells with a Rule edge, custody on the Well).
- **Mailbox and the Payload kit** are each one strip in the bay; Settings' grouped panels already were.
- **Theme tiles** were redrawn from the new values (the rail swatch is the bay, the ground is a strip).


## The mailbox reads like a mail client (2026-11-14)

"Take a look at how disorganized the mailbox looks: replicate the organization of a mailbox, with the probe info reachable; the 10 most recent and then an archive." The rows led with the address (the local part) in Title mono, so every row looked the same and the mail itself came second.

- **Rows lead with who and what:** the sender's display name (Body; 650 while unread, 550 once seen; the full From on hover), then the subject (Bone unread, Smoke read), then the address it came to as a third line: its crew member at 16px and the local part in Ash mono. The time and the code chip sit on the right. Unread is the 6px amber new dot in the lead slot (the crew mark no longer carries it here; this replaces "a message you haven't seen opens its raccoon's eyes in amber" from the second distill pass).
- **Recent and Archive:** the ten newest are **Recent**; older mail folds into **Archive n** (closed by default, remembered per browser, opened by itself when the selected message is in it), grouped under sticky day labels in UTC ("Today", "Yesterday", "Thu, Nov 12"), each row showing only its time. The section labels are the probe list's bay labels.
- **To filter:** a select above the list ("To every address 56", then each address with its crew mark and count, newest mail first). Picking one, or typing in Find, shows a flat list with "n matches" and an × that clears both.
- **Probe info in the message:** the To line shows the address with its crew mark, "All n to ‹address›" (sets the filter), and the probes for the same target by naming: a probe whose tag is the address, its first word, or starts with that word and a dash (`acme-lead-a` → `acme-trial-a`, `acme-trial-b`), newest activity first, up to three plus "+n".
- **Message pane:** Code and Link rows appear only when there is something to show (a missing code with candidate numbers still lists them). A long link shows its host in Bone and the rest in Smoke on one truncated line, its label under it, and "Show all n characters" to unfold it; the other links use the same line. The first view is **Message**: the text part, or when that is missing or a stub under 60 characters (SendGrid's "No Text Available"), the HTML part read as text in an inert parsed document (scripts, styles and `display:none` preheaders dropped, blocks on their own lines), captioned "Read from the HTML part" with the stub in its tooltip. It is set in Archivo at 1.5 leading, capped at 78ch; HTML source, Headers and Exact bytes stay mono and exact.
- **Organisation signs (2026-11-14, polish).** Every message is from an organisation: the registrable part of its sender's domain (`portal.acme.example` → acme.example; three labels under `co.uk`-style suffixes). Its sign (`OrgMark`) is the domain's initial at 650 on a 6px-radius tile tinted from the domain (one of the crew's eight hues, never amber; `.org-mark` in index.css, a dark and a light pair), 28px in the row's lead column (the unread dot sits before it), 36px leading the message header (hidden on phones), 16px in the filter. Colluder's own check mail (`colluder.invalid`, `example.invalid`) wears the Colluder mark. **No logos are fetched:** every image in this mail is remote and the busiest hosts are open-tracking services (Mailjet, SES, SendGrid), so a favicon, BIMI logo or `<img>` would tell the target the message was read, and from where.
- **From filter** beside To: "From anyone 56", then each organisation with its sign and count; the From line in a message offers "All n from ‹org›".
- **Remote images are counted, never loaded:** the Message view says "n remote images not loaded" (dotted underline; the hosts and the reason in its tooltip). The readable Message view folds runs of blank lines to one; Exact bytes and the .eml keep them.
- **Clearing (2026-11-14).** "Clear mailbox" sits after the count in the page header (Ash, dotted rule underline, a 14px trash icon); a filtered list adds a trash icon beside "n matches" for just the messages shown, and each message has one after .eml. All three confirm in the same alert dialog as "Clear all hits", naming what goes ("Delete 9 messages to acme-victim?") and saying plainly there is no restore; the action is the destructive button. Clearing everything deletes up to the newest message on screen, so mail arriving while you confirm is kept. `POST /api/mail/delete` (`{ ids }` or `{ all: true, upTo }`) is the dashboard's alone: Claude's requests are refused like every other non-probe write.

## Operator clarity (2026-11-20)

"The layout is an issue when it comes to clarity as an operator", "the back component doesn't actually contain the others", and the Hosted file form "could be cleaner, more organised, clearer".

- **The bytes strip holds its panes.** It used to shrink to whatever height was left (`min-h-0`) while its request and response panes kept their 220px minimum, so on a short screen the panes spilled out past the strip's edge. Now the strip never shrinks below its contents and the hit detail scrolls instead. Side by side, each pane's scroll box is `contain: size`, so a long capture still scrolls inside its pane rather than stretching the strip. Stacked (detail under 900px), a pane sizes to its content between 120px and 360px, so a three-header request no longer sits in an empty 220px well. The hit detail is the named container `detail`.
- **The probe header wraps, never clips.** At a 1280px window the payload buttons, Copy report and ⋯ ran off the pane's right edge. The header now wraps: when the line is full, the actions drop to a second line, right-aligned. Under a 1040px pane Copy report is its icon (named in its label and tooltip). The folded payloads read "Copy DNS HTTP HTTPS ⌄": one Ash "Copy" names the group, so each button is just its chip.
- ~~The filters join the tab strip from a 720px pane~~ (reversed the same day: next to the tabs they read as more tabs; see "Tabs that read as tabs").
- **The hit header keeps its actions on the first line.** The facts (number, type, new, received, tag) wrap among themselves; Copy as evidence and × stay at the first line's right end. The tag is left out when it is the probe the pane already shows (kept for "(from path)", No tag and chatter from another probe).
- **The HTTP response form reads in groups.** Small headings on a Rule 2 hairline (Label size, Smoke 650): **The redirect**, **The response**, or **The file** (Template, Content type, Body); for a hosted file **Point the target at it** ("served at any path under the probe, over HTTP and HTTPS"; Plant this, Fetch URL); then **Options** (Delay, Applies to, Decoy). The one-line explanations of Delay and Applies to sit beside their controls in Ash instead of under them.
- **Plant this follows the file, not the template.** What to plant and the fetch path come from the content type and body actually served (`fileKind` in `HttpRule.tsx`): an XSLT stylesheet gives `<?xml-stylesheet type="text/xsl" href="http://…/x.xsl"?>`, a DTD the DOCTYPE line, SVG an img tag, HTML the page URL; JSON and other XML only change the fetch path (`/x.json`, `/x.xml`). DTDs and stylesheets point at HTTP, which parsers fetch most reliably; the rest at HTTPS. A template whose type or body was rewritten wears a grey "edited" chip, and its help says Save keeps your version.
- **The body is a well like the raw panes:** a 32px title bar with "8 lines · 424 bytes of 256 KB, sent as UTF-8" and the Text | Base64 toggle, then the text unwrapped (markup keeps its lines; long ones scroll sideways), sized to its content between 6 and 20 rows. The plant line wraps rather than truncating, since it is the thing to paste.

## Tabs that read as tabs, and firings (2026-11-20, critique)

"The HTTP response doesn't even look like a tab." An `/impeccable critique` (28/40) found the frame around the results generic and split: filters in the tab row read as more tabs, what to paste lived on another tab under the body, and one firing (XSLT fetch, then the command it ran) showed as unrelated packets.

- **The tabs are Hits and Answer.** "HTTP response" is now **Answer** (it pairs with "Answer with"). Tabs are Title size at 650 in a 40px strip, 28px apart; each carries its state as a grey chip, never fused into the label: "Answer [Hosted file]", "[Redirect 302]", "[Default reply]", "[… , unsaved]" for a draft, "[…, not served yet]" (dimmed) before the cutover. Accessible names say the same ("Answer: Hosted file"). Old `#…/http` links still work.
- **The filters never sit in the tab strip.** DNS / HTTP(S) / SMTP, search (capped at 420px) and Export are the first row inside the Hits panel at every width.
- **The probe header is two fixed rows.** Row 1 is one line: the crew mark and tag (truncating, at most 45% of the row above the phone breakpoint), state, technique, target (truncating), then Copy report (always with its words) and ⋯. Row 2 is what to paste. The header no longer changes height from probe to probe.
- **Row 2 leads with the plant line.** For a probe whose saved answer is a hosted file with a plant line (`lib/plant.ts`, shared with the Answer tab), row 2 reads "Plant `<?xml-stylesheet … href="http://kc1aspose-poc-1-…/x.xsl"?>`" with a copy button; the payload host shows as the tag and "…" (display only; the tooltip and copy are exact), and the DNS/HTTP/HTTPS callbacks fold behind one "Callbacks ⌄" button. Other probes keep "Copy DNS HTTP HTTPS ⌄".
- **The Answer form puts the output first:** Answer with, then **Point the target at it** (Plant this, Fetch URL), then The file, then Options. With unsaved changes its note says "from your unsaved changes: save before you plant it".
- **Firings read as a story.** In the hits table, a web hit within 10 s of another from the same source says "· 118 ms after #3323" (Smoke) after the stage; the User-Agent is named in a few words ("curl 7.61.1", "Chrome 131 on Windows") with the full string on hover; HTTP/1.0 and 1.1 versions move to the cell's tooltip. The # column is 132px so burst ranges ("#3241–3244") fit.
- **The hit detail says what went back and what came with it.** Two fact lines under Source / rDNS / ASN, with Label-style names: **Answered** "200 OK · text/xml · 424 bytes" and who sent it ("sent by Colluder (rule v3, hosted file)"); **Same source** lists the other web hits from that address within 10 s in time order ("#3322 GET /x.xsl 211 ms before · #3323 GET /x.xsl 118 ms before"), each one click away. Self-test sources get no Same source line.

## The list as a switcher (2026-11-20, critique)

The probe list's job while you read one probe is switching and noticing, not retelling each probe's story; the pane already does that. It supersedes the three-line row (§ Probe list), the 40px Discord footer and the Ringed Tail in rows.

- **Active rows are two lines (~54px, about 11 at 1280×800).** Line 1: crew mark (22px), mono tag, "n hits", amber "n new" chip, a muted bell; then the live line and the last-hit time. Line 2: the target (or "Nobody planted it", the late-hit chip, the quiet line for silent ones) and the protocol counts at the right. The technique, the HTTP rule, Claude as planter, the note and muting live in the row's tooltip, as in the one-line rows. A probe with no target leaves line 2's left blank: no "No target noted" filler.
- **The selected row keeps only line 1.** The pane header beside it names everything else.
- **The Ringed Tail leaves the list.** Each tail ran on its own probe's clock, so the column couldn't be read across rows. The signature stays in this doc for a later home in the probe header.
- ~~**Opening a hit folds the list to the crew** (58px column)~~ (replaced by probe tabs, below: nobody knows a probe by its coat alone): each active probe as its 28px colluder in a 44px strip, in activity order, with amber eyes and the 6px cocked edge for news, the Soot-2 fill for the open one, and "+n" for the rest. The pane gains ~340px, so at 1280 request and response sit side by side. The fold sticks while you hop probes in the column; the header's panel button, the "+n" or `\` brings the list back. With the list open, the same button turns "fold while reading" off or on (remembered per browser as `colluder.listFold`). Phones never fold.
- **Keys from anywhere** (not in a field or dialog): `[` and `]` step through probes in list order, `n` jumps to the next probe with news (a toast when none has), `\` folds or unfolds.
- **Discord alerts are a bell in the list header** (Bell on, BellOff off, a link to Settings when not set up), freeing the footer's 40px. The filter flexes to at most 170px; between 821 and 1180px Plant shows only its icon.
- **Each bay is its own listbox** labelled by its heading (Active, Silent, Retired, Hits with no tag), so headings no longer sit inside a listbox. Row names are short and lead with the news: "sf, 3 new, 17 hits, last 17:29".

## Probe tabs and list density (2026-11-20, operator feedback)

The crew column failed in use: an operator doesn't know which probe a coat belongs to. Folding now trades the list for tabs that carry names, and the list itself gets a density choice.

- **Probe tabs, like a browser's** (`components/ProbeTabs.tsx`). Picking a probe anywhere (the list, a link, the status bar, a key) opens its tab. Tabs keep their order, close with × (shown on hover and on the open tab; always on touch) or a middle click, and are remembered per browser (`colluder.tabs`). Past 8 tabs, the one looked at longest ago that has no news closes itself. A tab is a crew mark (18px), the mono tag (truncating at 220px) and an amber "n new" chip; the open tab is a Soot strip that runs 1px over the pane's top edge so they read as one object, and the others carry a faint Rule-2 edge.
- **While a hit is open the tabs replace the list.** The list stays mounted (hidden), so its filter, groups and scroll survive; the pane keeps one place in the tree, so folding never resets its filters or the open hit. The strip reads **All probes · tabs · +** (see "Tabs as a working mode", 2026-11-20): All probes finds and opens any probe and carries the amber "n new" for news out of view; + plants. Closing the open tab moves to its neighbour; closing the last leaves an empty strip, never the list.
- **Keys.** `[` / `]` step through the tabs while folded and through the list otherwise; arrows, Home and End move along the focused tab strip and Delete closes the focused tab; `n` jumps to the next probe with news (open tabs first, then the rest by activity); `\` switches between tabs and the list.
- **The list has two densities**, picked from the list header's view menu (Rows icon) and remembered (`colluder.listDense`): **one line per probe** (~30px: 18px mark, tag, hits, new, live line and time; about 20 fit at 1280×800) and **two lines per probe** (the target and the protocol counts on line 2). The same menu turns "Tabs while reading a hit" on or off and switches to tabs now. Phones never fold, so those two items are hidden there.

## Probe tabs: names, marks and handling (2026-11-20, operator feedback)

The tabs became the operator's working set, so they get the handling a browser's tabs have.

- **Marks between the coat and the name** (Smoke, 12–14px, in this order): a pin when pinned; what the probe answers HTTP with (Lucide FileText for a hosted file, CornerUpRight for a redirect, PhoneIncoming for a custom response, the preset's own technique mark; Default reply has none, it's the norm), in Ash while it's waiting (planted for a file or redirect with no rule saved, or saved but not served yet); and **Claude's spark** for probes Claude planted. ~~The spark is drawn in the text colour, never Claude's terracotta~~ (operator's call, same day: it has to read as Claude). The mark (`ClaudeMark` in `bits.tsx`) is **Claude Code's pixel robot** (the operator's call, replacing a drawn spark), in **Claude orange** (painted with `fill="var(--claude)"`, not currentColor, because menus recolour every icon inside them) (`--claude`, #D97757), the one place that colour appears; the starburst shape and its spot right before the name keep it apart from the HTTP ink's square and amber's chip. It also follows the tag in list rows.
- **Your own names.** Double-click a tab (or F2, or Rename… in its menu) to name it; Enter keeps, Escape cancels, an empty name goes back to the tag. A named tab shows the name in the sans face (it's yours, not data); the tag stays in its card and its accessible name ("Coda main (coda)"). Names live in the browser (`colluder.tabNames`) and also show in the + menu.
- **The card.** Hovering a tab for about half a second opens a card: name and tag, target and note, state with the live/off line and who planted it when, "n new" and the protocol counts with the last hit, and the answer with its rule line. One card at a time; it gives way to the menu, a drag and a rename.
- **The menu** (right-click): Rename…, Use the tag again, Pin/Unpin, Mark n new hits as read; Copy tag, Copy DNS/HTTP/HTTPS payload, Copy report; Close tab, Close other tabs, Close tabs to the right (both leave pinned tabs), Reopen closed tab.
- **Pinned tabs** sit first, never close themselves to make room and have no × (close them from the menu or with Delete); a middle click doesn't close them either.
- **Drag to reorder**, with a 2px Bone bar where the tab will land; the pinned group stays first.
- **Reopen.** Shift+T (or the menu, or +) reopens the last closed tab in the place it stood, pinned again if it was; up to 12 are remembered for the session. Closing says so in a toast that names the key.
- **Keys** while the tabs show: 1–8 pick a tab by position and 9 the last; F2 renames; on the focused strip, arrows move, Delete closes, F2 renames. Settings › Keyboard lists every key.
- **A hit landing on a background tab flashes it** (the list's Lit flash), beside the amber eyes and count.
- **The view survives a reload** (2026-11-20): whether you were on the tabs or the list is remembered per browser (`colluder.listFolded`), whichever way you got there (opening a hit, `\`, "Switch to tabs now"). With no tab to show and no probe open, it starts on the list.

## One probe, one look: the list matches the tabs (2026-11-20, operator feedback)

The tab features had landed only on the tabs; the full list still showed the old rows. A probe now looks and handles the same wherever it appears. The shared pieces live in `components/ProbeTabs.tsx` and the list, the tabs, the + menu and the pane header all use them:

- **`ProbeMarks`**: pin (when its tab is pinned), what it answers HTTP with, Claude Code's robot. Before the name, in list rows (two-line, one-line and the slim silent/retired rows), tabs and the + menu.
- **Your names**: a named probe shows the name (sans) with its tag after it (mono, Ash) in list rows and the pane header, and the name alone on a tab. The collapsed Silent line lists names too. Double-click a list row or the pane header's tag, F2 in either view, or Rename… in any menu.
- **`ProbeActions`**: the hover card (opens to the right of a list row, below a tab) and the right-click menu: Rename, Use the tag again, Pin as a tab (opens it), Mark read, Copy tag / DNS / HTTP / HTTPS payload / report. Tabs add their close and reopen items. List rows lose their `title` tooltips: the card replaces them.
- Accessible names carry the same words everywhere: "ServiceNow login (sf), 17 hits, last 17:29", then "pinned tab, Hosted file, planted by Claude".
- **The card opens from the colluder only** (2026-11-20, operator feedback): hovering a tab or a row no longer pops it; hovering the probe's crew mark (help cursor) does, in tabs, list rows, the slim rows and the probe header. `CardOnCrew` keys the open card by where it was hovered, not by probe, so a probe that is both a tab and a (hidden) list row shows one card, not two. The right-click menu (`ProbeActions`) still covers the whole tab or row.

## Tabs as a working mode (2026-11-20, critique: 22/40)

The tabs were built as a fold of the list, so anything they couldn't do (plant, find a retired probe, filter) sent the operator back to the list, and planting from the + menu did so before a word was typed. The tabs view is now a place to work in, with nothing that throws you out of it.

- **The strip reads: All probes · tabs · +.** **+ plants a new probe** (Plus icon, "Plant a new probe (p)"), like a browser's new tab, and never changes the view: the plant form opens above the strip, the new probe opens as a selected tab, focus goes to its next step (a payload copy button, or the answer's first field). Cancelling (Escape or ×) returns focus to whatever opened the form (`cancelPlanting` in the store).
- **All probes** (Lucide List icon, the probe count, an amber "n new" for news you can't see: probes without a tab and tabs squeezed off the strip) opens the **switcher** (`components/ui/popover.tsx`): a filter (tag, your name, target, note) over the list's own groups (Active, Silent, Retired, No tag), news first in each; arrows move, Enter or a click opens the pick as a tab, "open" marks probes that already have one. Its footer: Dock the list (`\`), Plant (`p`), Reopen (⇧T), and the Discord alerts toggle, so nothing needs the list. The Silent rule (`isSilent`) is shared with the list.
- **Tabs shrink to fit** (content width up to 240px, down to 104px) before the strip ever scrolls; under 150px a tab drops its marks and says "3" for "3 new". A full strip (8) closing a tab says which in a toast with Shift+T.
- **Nothing ejects.** Closing the last tab leaves an empty strip and a pane that says "No probe open. + or p plants one; All probes or o opens one." Only `\`, "Dock the list" and the list's own menu switch views. The retire dialog no longer points at "the bottom of the list".
- **Keys.** `p` plants (in either view, staying in it); `/` and `o` find a probe (the switcher in tabs, the list's filter when docked); `[` `]` wrap round; Settings › Keyboard lists every key, including the strip's arrows, Home/End and Delete.
- **Screen readers.** Tab wrappers are `role="presentation"`; each tab has an id and `aria-controls="probe-panel"`, and the pane is the `tabpanel` labelled by the open tab. A hit on a background tab is spoken politely ("New hit on X", at most every 8 s per probe). The pane's own Hits/Answer strip is `PaneTabs` in code, so the two aren't confused.

## Quick probes (2026-11-20)

A test probe shouldn't need naming. When the plant form's Tag field is empty it shows a made-up tag in its place (two short words and two digits, e.g. `brisk-otter-42`, never one in use; `lib/quicktag.ts`), and Plant uses it: `p`, then Enter, plants one. A dice button beside the field deals another name; typing your own replaces it. Screen readers hear "Left empty, the probe is planted as brisk-otter-42." The old "Give the probe a tag first" error is gone; a typed tag is still checked as before. Rename the probe later (double-click or F2) if it turns out to matter.

## Housekeeping from the right-click menu (2026-11-20)

The probe menu (a tab, a list row, the brief) ends with housekeeping, each one click with **Undo** in the toast rather than a dialog first. Toasts with an action stay 7 s and take clicks; plain toasts are unchanged.

- **Clear n hits** hides the probe's hits (the server's soft clear); Undo is that clear's Restore.
- **Retire** takes the probe out of the active list, closes its tab, and resets a non-default HTTP answer to the default reply, because a retired probe's rule is otherwise still served by the edge: a forgotten redirect, hosted file or XXE DTD would keep answering whoever finds the payload. Undo arms it again, puts its rule back and reopens the tab. The pane's Retire… keeps its dialog (with the reset as a checkbox) for the deliberate case.
- **Restore (arm again)** on a retired probe.

## Probes that outlive the work (2026-11-20)

Investigated what leaving probes up costs. Load is not it: a probe is a row (the database is ~5 MB), and the edge log grows ~2.5 MB a day almost all from background DNS noise, not probes (576 GB free; rotation left alone). What matters:

- **A retired probe's rule was still served.** The edge publishes every probe's latest non-default rule, retired or not (deliberate: a blind-XSS collector should still catch fires months later). Claude's `retire_probe` never reset the rule, so two Claude probes (`coda-r7t1-jwks`, `coda-r7t1-x5u`, both hosted files) were found retired and still answering.
  - **MCP:** `retire_probe` now resets the answer to the default reply first, unless `keep_answering: true` (the blind-XSS case); on a probe already retired but still answering it stops the answer. The server's instructions say to retire when the work ends.
  - **Dashboard:** a caution banner names retired probes still answering (only while the edge is running), with **Stop answering** (Undo in the toast) and **Keep them answering**, remembered for exactly that set of tag and rule version, so a new one brings it back. Their answer mark turns caution ink in tabs, rows and the card ("retired but still answering"); the pane header gets a **Stop answering** button; the right-click menu gets Stop answering HTTP. A retired probe on the default reply shows no answer mark and never says "waiting".
- **Armed probes nobody retires.** Silent (armed, a day old, no hits) gets **Retire all** on its group header, and All probes gets **Retire n silent**: one click, one Undo for the lot (arms them again, puts answers back, reopens tabs). Retiring resets answers the same way as a single retire.
- Late hits on retired probes still arrive and are kept, and Discord posts them at most once per 10 minutes per probe, as before.
- **All probes leaves retired probes out (2026-11-20).** After a cleanup the switcher was mostly Retired. Browsing it now lists the live probes only (Active, Silent folded to one row, No tag) and ends with "34 retired probes not shown: search finds them."; any search includes them under Retired. A retired probe with a late hit is under Active anyway, and one still answering HTTP has its banner. The docked list keeps its folded Retired section (with Delete all…).
- **The docked list does the same (2026-11-20).** Retired probes are not listed unless the filter asks for them (the filter now also matches your names for probes). Never hidden: a retired probe with unread hits, or the one that's open; they show under a plain "Retired n" heading. The list ends with "33 retired probes not shown: search finds them." and **Delete retired…** (the old section's Delete all…, same dialog).

## Every theme gets the same care (2026-11-20, operator feedback)

"It seems primarily optimized for Nord and the rest kind of have a weird design." Two causes: the picker drew every theme from a hand-copied swatch (stale since the readability pass) as the same two lines and five dots, so Colluder dark, High contrast, Dracula, Tokyo Night and Catppuccin read as one near-black box and only Nord's grey-blue stood apart; and Nord was the only named theme whose grounds kept the Strip Bay steps and whose roles stayed in their lanes.

- **Tiles are drawn from the theme itself.** Each theme block in `index.css` applies to `[data-theme-preview="<theme>"]` as well as `<html>` (the colour-blind-safe inks too), and a tile is a miniature of the dashboard in those tokens: the bay and rail, three probe strips (plain, selected, one cocked out with its amber edge), and the pane with its title, primary button and four hit rows in the protocol inks, one selected. Nothing is copied, so a tile can't drift from its theme.
- **The rules are a test.** `web/test/themes.test.ts` checks every theme: each text ink (and the safe inks) at 4.5:1 on Bay, Soot, Soot 1, Soot 2, Well, Hover and Child; the banner and mark pairs; the ground steps the default is built on (strip at least 0.035 OKLab L off the bay, selected at least 0.06 off the strip, hover between them, edges reading against the selected fill); and Bone, Smoke and Ash kept apart.
- **Tokyo Night:** the bay drops to `#101119` so the strips separate from it (it was 0.032 L off them).
- **Gruvbox:** selected is Gruvbox's own bg1 `#3c3836`, a full step above the strip (the deeper `#373331` sat 0.048 off it and nearly met the hover fill). Its inks still hold 4.5:1 on it.
- **Dracula:** the caution banner is in its orange family (`#ffd9a8` on `#3a3428`, edge `#8a6d48`), not the lime yellow, and the tag mark is a warm `#4d4538` like the other named themes, off DNS purple.
- **Light:** the four inks are a touch deeper so they hold 4.5:1 on the grey bay too, where the hit detail sits.

## Two more light themes, and a 12-hour clock (2026-11-20, operator feedback)

"I'd like to see one or two more light themes as most we have are dark", and "I don't want the 24 hour clock."

- **Catppuccin Latte and Solarized Light** join Colluder light. Each follows Colluder light's structure: light strips on a darker bay, the selected fill between them. Latte: Base `#eff1f5` strips on a Surface 0 `#ccd0da` bay, selected `#dce2f2`; its Text `#4c4f69`, deepened slightly to `#3e415a`, is Smoke under a deeper Bone `#1c1e35` so the three tiers stay apart. Solarized: base3 `#fdf6e3` strips on `#e4ddc8`, selected base2 `#eee8d5`, base02 `#073642` ink; SMTP is cyan, as Gruvbox's is aqua, because its olive green sits too near the yellow that marks new. Every original accent misses 4.5:1 on the bay, so each is deepened along its own hue until it holds (`web/test/themes.test.ts` checks them, the safe inks and the rainbow). Latte's HTTP and amber are set apart by hand (burnt orange `#9f3300`, ochre `#794f00`), as in Colluder light.
- **Light themes are a set** (`LIGHT_THEMES` in `lib/display.ts`). `<html>` carries `data-scheme="light|dark"` for rules that follow the scheme rather than one theme (the org marks). Night shift skips every light theme. **Match system** uses the light theme picked last by day (`light` in `colluder.display`) and the dark one at night.
- **The picker** puts Match system and the three light themes in the first row and the seven dark themes after them; the Catppuccin tiles say Mocha and Latte (the full name is in the hint and the accessible name).
- **Clock** (Settings → Display): 24-hour (default) or 12-hour. Times stay UTC either way; 12-hour drops the leading zero and adds AM or PM ("8:00:04.850 AM", "11-18 8:00 AM"). One switch in `lib/format.ts` (`clock`, used by `hms`, `hmsms`, `hm` and so `dayOrTime`) covers the hits table, probe list, tabs, mailbox, status bar clock and last-hit time.

## Time zone (2026-11-20, operator feedback)

"The logs and all that should be by default whatever server they are on, but let me adjust to PST for the UI."

- **Time zone** (Settings → Display): UTC (default) or This browser (its short name, e.g. PST, PDT in summer). Only the dashboard's display changes: stored hits, the server's logs, reports (`report.md`), exports and Copy as evidence keep UTC, as the server records them.
- **One path for every displayed time:** `lib/format.ts` shifts an ISO timestamp to the shown zone's wall clock before `hms`, `hmsms`, `hm`, `dayOrTime`, `dayKey` and `stamp` (a full date and time with the zone's name) format it, then applies the 12-hour clock. Labels that said UTC say the shown zone: the hits table's `Time (PST)`, the status bar clock, Planted / Armed since / Retired / Cleared lines, the correlation-id banner, the hit detail's Received, the Mailbox's Received and its day groups ("Today" is the shown zone's today), and the outside check's last run.
- **The exact stored time is on hover:** a hit's time cell and the hit detail's Received carry the UTC timestamp as their tooltip, as the Mailbox rows already did.
- **The hits table shows hours and minutes** ("8:54", or "08:54"): "we don't need the milliseconds", and opening a hit shows its exact time (Received, to the millisecond, in the shown zone). Hovering a time cell shows the same, with the stored UTC timestamp under it when the page shows another zone. Gaps inside a burst ("703 ms after #1171") stay in milliseconds.

## Separation pass (2026-11-20, critique: 29/40)

"A lack of spacers/dividers/some visual distinction between elements": the Settings index couldn't be told from the tool rail, and the top of the probe pane ran together. Structural, in every theme; light themes made it worse.

- **Settings is one strip, like the Payload kit.** The page sits in the 8px bay gutter as a strip: a header band ("Settings", with the motto in Ash) closed by a Rule, the section index as a 208px column with a Rule on its right, the sections scrolling beside it. Index entries are full-bleed, one height (46px, whether or not they carry a status line), Title size, selected on Soot 2; a Rule after Outside check splits why you came (Payloads, Alerts, Outside check) from the machinery, as the rail's Rule follows Probes. Below 1000px the index is a wrapped row of bordered entries under the header band; on phones the strip stacks.
- **The probe pane groups into bands.** Identity (the header line and the payload row) closes on a Rule, and the payload row starts under the tag (60px), so it reads as the probe's. Then the Hits/Answer tabs (Rule), the filter bar (now a Rule, not Rule 2: it is not a table row), and the column heads on **Band**, a new token one step off the strip (dark themes: Soot 1; Light `#f5f6f8`, Latte `#e6e9ef`, Solarized `#f6efda`; tested at 0.02 OKLab L or more, the right way for the scheme).
- **Light themes: selected is a full step off the strip.** Latte's Soot 2 is `#d2d9ef` and Solarized's `#e8e1ca`, 0.06 L or more below the strip as in Colluder light; the test's light threshold rose from 0.04 to 0.06. The tag mark moved with it (Latte `#c6cde3`, Solarized `#e0d5b5`) so it still shows on a selected row. Nothing selectable sits bare on the bay any more (the Settings index was the case where hover outweighed selected).
- **Rule 2 audit** against the rule under Shapes: probe list rows and inactive probe tabs (object edges on the bay, which DESIGN already said divide on Rule), the switcher's search and footer, the HTTP response preview's edge and its save bar, the custody record, and the Mailbox's facts block and message well moved to Rule. Rows, columns, group rows and well title bars keep Rule 2.

## UX audit (2026-11-22, `docs/UX-UI-IMPROVEMENTS.md`)

- **Decoded data is a well, not a sentence.** An XXE file read or DNS label exfil that decodes as text shows in full in a `--well` panel in the hit detail: a 32px title bar ("File read through XXE", how it was decoded, bytes and lines, Copy decoded, .txt), then the text with real line ends; other control characters show as Ash markers. The stage line says what arrived ("file data arrived: 412 bytes, 9 lines, base64-decoded"); table rows keep the short preview.
- **vs #prev.** A web hit with an earlier request from the same source and User-Agent within 10 s gets a line under "Same source": method change, then header names kept, dropped and added (credentials first). Names only; values stay in each hit.
- **Day dividers** (Soot 1 rows, Smoke label) split the hits table by day in the display zone when its hits span more than one day.
- **The table/detail border drags.** A `role="separator"` between the hits table and the open hit: drag, arrows (Shift for bigger steps), Home/End; double-click returns to the Settings preset. Kept per browser; not on phones. Columns (see the visual pass below for the current widths).
- **Phones:** each hit row carries the request line or DNS name under the source, since the Request column is hidden; tapping a probe in the list scrolls to its pane.
- **Facets** (Unread, Web hits, By Claude, Answering HTTP) are toggle chips: bordered, Soot 2 and Bone when on. They narrow the list and the switcher alike and open folded groups, like a search.
- **Copy encodings** are one picker everywhere (as is, URL, URL ×2, JSON, XML), back to "as is" on reload.
- **Keys:** `?` opens the sheet for the current view (one list in `lib/shortcuts.ts`, also Settings › Keyboard). Probe keys only act on the Probes view.

## Visual pass, batch 1 (2026-11-22, `docs/UI-VISUAL-PASS.md`)

- **A missing rule is caution, not amber.** "Default reply until you save its redirect" sits on caution ground with caution ink and a "Set up its redirect →" link to the Answer tab.
- **Name/value rows stay side by side** down to a 310px pane (a phone); the name track is `fit-content(18ch)`. Each value has a quiet Copy on hover or focus (always on touch screens) that copies that one value and says so ("User-Agent value", "q value, decoded"); the pane's Copy stays the exact-bytes copy.
- **Copies name their encoding.** Any copy made with an encoding other than "as is" says which in its toast ("HTTP, URL ×2"), in the Payload kit as everywhere else. Kit rows highlight on hover.
- **The table/detail splitter shows a grip** at rest (a 36×3 Rule pill on the seam, Smoke on hover, Bone on focus).
- **Mailbox:** a message is one scroll (header, code and link stay; the body fills the rest); an unread dot clears when that message is opened; labels use the hit detail's label grammar (label size, 550, Ash).

## Visual pass, batch 2 (2026-11-22)

- **Hits table columns:** `#` 116, Time 84 (104 on a 12-hour clock), Type 96, Source 148; Request takes the rest. Phones: 96 / 56 (72) / 76 / the rest, with 6px cell padding. A burst's ids share their prefix once (`#3387–88`, full range on hover).
- **Time cells** show seconds in Ash after the minute (`16:57`:14); phones show the minute only. The exact stamp stays in the tooltip.
- **The Request cell has two parts:** what arrived, then what the edge did right after it, in label size: the self-test chip, the short stage (`served x.dtd`, `hop 3 · → 302 169.254.169.254`), `+92 ms #3385`, the client. When room runs out the request truncates first (the details shrink at a fifth of its rate), so the outcome stays in view. The full stage sentence is in the tooltip.
- **Routine DNS is quieter:** a lookup of just `<tag>-<id>` (no data labels) shows its resolver in Smoke. Labels beyond the tag keep full ink. A burst's resolvers are in the Source tooltip ("3 resolvers").
- **Hit detail:** the Answered line says what the edge did (`→ <target> · followed 2 redirects`, `served x.dtd`) and, for a redirect, one visible Ash line: "A redirect sent isn't proof it was followed: a later hop is." "What the edge did" appears only when there's no response to describe. Mark as mine and Look up are ghost buttons at label size. Strips are `px-4 py-2.5`; Custody is the bytes strip's flush footer on the well.
- **Probe list:** 360px wide (320 below 1400). A Show-only toggle sits inside the filter field; Mark all read is in the list's view menu and the All probes footer when anything is unread. The tab strip starts with a Dock button.

## Visual pass, batch 3 (2026-11-22)

- **Answer editor:** Next answer is tinted like a hit's raw response (status ink, header names, Ash colons) and carries a state pill beside its title: `unsaved` in caution ink while the draft differs, `live vN` (grey) when the saved rule is what the edge answers (not on a retired probe). Where the editor has two columns (pane ≥940px) the aside is sticky: it stays 18px under the panel top and scrolls inside itself above the save bar. The save bar is Soot-1, edge to edge, so the form scrolls under it.
- **Rule history rows are two lines:** `vN`, what it answers (Bone when active), the date on the right; under it in Ash, joined by `·`: active or "saved · not served yet", by Claude, answered N hits, decoys, deepest hop, what changed. The baseline rows ("Default reply from Colluder", "Answered by interactsh") use the same rhythm.
- **Text fields are wells:** every text input on a strip sits on `--well` (probe filter, hit search, the plant form's Tag, Target and file path, the Answer and kit fields). Selects and toggles stay controls (Soot or transparent).
- **Control heights by row:** the controls in a row share one outer height. Compact pane bars are 24 (the hits filter bar: toggles, search, Export). The hit view bar and the Mailbox message bar are 28. Page headers are 30 (Mailbox address, Copy, Find; the kit's Probe select and encoding picker). The plant form is 36. A select's own height class wins over the component default.
- **Status bar:** Last hit has a protocol square beside its word and a hover strip; Engine and Edge open Settings → System; the base payload host shows from 1360px (1600 with comfortable type) and copies on click. Engine's version and uptime show from 1480px.

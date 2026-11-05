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
  smoke: "#a99f90"
  ash: "#8f8576"
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

Colluder is a night-shift accomplice that sits beside the operator's proxy and reports, in a low voice, exactly who called back. The surface is a warm soot room lit by bone-coloured ink. Everything is dense, tabular and small (a 12.5px working size), because the screen lives on a second monitor and has to be read at a glance from across a desk. Character is real but held back: a raccoon's Domino mask in the corner, a ringed tail drawn under each probe, an amber eye that opens when something arrives. The data itself is never decorated.

The system is built on trust. Liveness is drawn, not implied: every state of the engine and stream has a line form and a plain word. Raw captures are evidence, so they are rendered as inert text, copied byte for byte, and any part that is folded away says how much is missing. Colour carries meaning (protocol, newness, alarm) and is always paired with a word.

It must not look like a hacker costume: no green-on-black terminal, no glitch effects, no neon, no matrix rain. It is a professional instrument that happens to have a raccoon.

**Key Characteristics:**
- Warm near-black soot ground, layered in three tonal steps plus a deeper well for raw bytes.
- One accent with a single job: amber means new/unread (and the mark's eyes).
- Four protocol inks, never shown without their word.
- A four-step type scale (11 / 12.5 / 13.5 / 17px) in Archivo at a slightly condensed width, with Fragment Mono only for data.
- Line grammar for liveness: solid, dashed, struck.
- Flat surfaces, hairline rules, fill-only selection.
- Personality lives only in the mark, the tail, the night shift and hidden easter eggs.

## Colors

A warm, low-chroma brown-black ground with bone ink. The only saturated colours are the four protocol inks, the amber eyeshine and the alarm reds.

### Primary
- **Bone** (#ece3d1): the ink. Body text, primary values, the focus outline, and the fill of the single loud button in a region. It brightens to **Bone Glow** (#fff8ea) on primary hover. Between midnight and 05:00 local time the app dims it to **Night Bone** (#e6dccb) and shows a quiet "Night shift" label in the status bar.

### Secondary
- **Amber Eyeshine** (#f2b33d): new and unread. The new dot, the "n new" chip, the unread badge on the Probes rail item, the favicon's unread dot, and the eyes of the mark. It also tints the text caret in inputs.

### Tertiary (protocol inks)
- **Heather** (#c793c4): DNS.
- **Vermilion** (#e2643f): HTTP.
- **Periwinkle** (#8aa2ea): HTTPS.
- **Lichen** (#62b08f): SMTP.
- **Dust** (#b5ab9c): anything else.

### Neutral
- **Soot** (#16120e): app ground, rail, status-bar-adjacent surfaces, table header, field wells in the composer.
- **Soot 1** (#1e1914): raised bands: composer, hit detail, status bar, dialogs, rail hover.
- **Soot 2** (#2a221b): selection fill, the active rail item, the "on" segment of a toggle, the secondary button.
- **Well** (#110e0b): the deepest surface, used only behind raw request and response bytes.
- **Accent Hover** (#30271f): hover fill for secondary, quiet and ghost buttons.
- **Rule** (#3a3129): structural borders between regions, field strokes, scrollbar thumb.
- **Rule 2** (#2a231d): row dividers inside lists and tables, raw-pane frames.
- **Smoke** (#a99f90): secondary text, labels, column headers.
- **Ash** (#8f8576): tertiary text: hints, footnotes, placeholders, sub-captions.
- **Fur** (#9a9084): the mark's tile and the raccoon tail's body. Not a text colour.

### Status
- **Ember** (#e8735a): "bad" words in the status bar and the invalid-tag field border.
- **Destructive** (#c4523a): shadcn's destructive slot (invalid inputs).
- **Alarm Ink** (#f3b4a3) on **Alarm Ground** (#2a1914): destructive buttons, form errors, failed-action toasts. Engine-down banners use **Alarm Banner Ink** (#f4c6b8) on the same ground.
- **Caution Ink** (#f3d9a4) on **Caution Ground** (#2b2113): stream-paused and correlation-changed banners. Caution Ground also backs the amber "new" chip.
- **Lit Flash** (#3a2c17): the brief warm flash on a probe row or hit row when a hit arrives.

### Mark
- **Mask** (#0f0c09), **Eyeshine Highlight** (#fff4d6), **Shut Eye** (#5d554b): used only inside the raccoon mark and the Konami peek.

### Named Rules
**The Eyeshine Rule.** Amber means "you have not seen this yet" and nothing else. It never marks a button, a link, a heading, a selection or a brand flourish. If amber is on screen, something is unread (or it is the mark's eyes).

**The Word-Beside-Ink Rule.** A protocol ink never appears alone. Every ink is drawn as a small square or tick next to its word (DNS, HTTP, HTTPS, SMTP, OTHER) or inside a labelled row. A colour-blind operator loses nothing.

**The Warm Soot Rule.** Every neutral is warm (OKLCH hue 62-78°, chroma under 0.03). No cool greys, no pure black, no pure white.

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

- **Tool rail** (76px) on the left, spanning the full height: the mark, then Probes, Hosted files, Redirects & responses, DNS rebinding, Payload kit, Listeners, with Settings pinned to the bottom.
- **Banners** stack at the top of the main column when something is wrong.
- **Composer band** on top: the "Plant a probe" heading in a 132px label column, then Tag / Target / Technique / Plant in one row, then the selected probe's DNS, HTTP and HTTPS payload variants, each with a copy button and a one-line note.
- **Probe list** (400px; 320px under 1180px): latest activity first, with a 42px header and a 40px Discord-alerts footer.
- **Probe pane**: a 52px probe header, then the hits table (capped at min(28vh, 212px) while a hit is open, so detail stays visible), a "Planted … · first hit …" caption between solid hairlines, then the hit detail filling the rest.
- **Status bar** (28px) along the bottom of the main column: wordmark, Engine, Stream, Last hit, then the payload host and the UTC clock on the right.

Spacing is tight and regular: 24px page gutter, 20px list gutter, 10px gaps between controls, 11px vertical row padding in the probe list and 6×10px table cells. The status bar spaces its items 22px apart.

**Breakpoints.** At **1180px** the probe list narrows to 320px, payload notes and the "display only" hint drop out, and the request and response panes stack. At **820px** (phone) the rail turns into a sticky horizontal icon strip across the top (labels become screen-reader only), everything stacks into one scrolling column, the probe list caps at 48vh, the composer fields go full width, the gutter drops to 14px, the hits table hides the Request column, payloads show a short host (`c0ffee12…`) with the tag still highlighted, and the status bar sticks to the bottom of the viewport.

### Named Rules
**The Detail-Stays-Visible Rule.** When a hit is open, the hits table shrinks to min(28vh, 212px) and scrolls on its own, so the selected request is always on screen next to the list it came from.

## Elevation & Depth

Flat. Depth is tonal: Well (deepest, raw bytes) → Soot (ground) → Soot 1 (raised bands) → Soot 2 (selected), divided by 1px Rule hairlines. Shadows appear only on things that float above the grid.

### Shadow Vocabulary
- **Toast lift** (`box-shadow: 0 6px 18px rgba(0,0,0,.4)`): the bone copy-confirmation toast above the status bar.
- **Fold fade** (`box-shadow: 0 -8px 16px 8px var(--well)`): behind the "n more lines" cue, fading the last visible raw lines into the well so the cue reads.
- Radix popovers, selects and dialogs keep shadcn's default small shadows.

### Named Rules
**The Flat Soot Rule.** Panels, rows, panes and bands never cast shadows. If something needs to stand forward, move it one tonal step up.

## Shapes

Corners are barely softened. Controls, fields, raw panes, the custody strip and the view toggle use 3px. Rail items and the toast use 4px. Count chips and the overflow cue are 9px pills. Protocol squares are 8px with a 2px radius. The new dot is a 6px circle. The mark is a rounded square tile (radius 15 on a 64 grid).

Borders are 1px hairlines: Rule between regions, Rule 2 between rows. Lucide icons are drawn at stroke 1.5, 14px in buttons and 19px in the rail.

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
- **Focus:** global 1.5px Bone outline, 2px offset. **Disabled:** 45% opacity.

### Chips
- **Type chip:** an 8px ink square plus the uppercase protocol word in the same ink, 650 with 0.03em tracking (DNS A, DNS ×4, HTTP 3).
- **New chip:** an amber "3 new" or "new" pill on Caution Ground with an amber-brown border.
- **Grey chip:** "unregistered" in Smoke on Soot with a Rule border.
- **New dot:** a 6px amber circle at the start of an unread row. Read rows keep an empty 6px slot so columns never shift.

### Inputs / Fields
- **Composer field:** a 36px Soot well with a Rule stroke and 3px corners, with the label (Tag, Target, Technique) inside it in Smoke. The value is mono for the tag. The tag field also shows the payload host as a mono suffix. On focus the stroke lifts to Smoke. An invalid tag turns the stroke Ember and puts an Alarm Ink message under the row. The caret is amber.
- **Dialog fields:** shadcn Input and Textarea on Soot 1 dialogs, retyped to 13.5px.

### Navigation (tool rail)
- 70px-wide items: a 19px icon over an 11px label, in Smoke. Hover fills Soot 1. The active item is filled Soot 2 with Bone text (fill only, no stripe). The unread count sits as an amber badge on the Probes item (capped at "99+").
- On a phone the rail becomes a sticky top strip of icons with screen-reader labels.

### Status bar and banners
- **Status bar:** Soot 1, 28px, the wordmark then `Engine` / `Stream` / `Last hit`, each as a line form, a Smoke label and a bold word ("capturing", "connected", "3m 57s ago"). A failing state turns the line and the word Ember. Hovering Engine explains the line grammar.
- **Banners:** full-width strips at the top of the main column, Alarm (engine down or degraded, load failure) or Caution (stream paused, correlation id changed). Each leads with its line form, states what is wrong and what it means, and offers the fix inline (a copyable command, "Got it").

### Probe list row
A three-line row: new-dot slot, mono tag and hit count, last-activity time; then the target in Smoke; then count chips (amber "n new", protocol counts) and the **Ringed Tail**. Silent probes read "Armed · silent 3m" with a solid live line, and "No callbacks yet · planted 09:06". The Unregistered row sits at the bottom, separated by a Rule, in sans rather than mono.

### Ringed Tail (signature)
A 120×10px raccoon tail as the probe's time axis: Fur at 40% opacity, tapering from a deep root at planting time (left) to a rounded tip at now (right), crossed by four faint Soot rings. Each hit is a 2px tick in its protocol ink at its relative time. The tail stays quiet so the ticks carry the signal.

### Gate-board rerank (signature)
When a hit moves a probe to the top, the rows slide to their new places (FLIP, 420ms, ease-out-expo) so the eye can follow what moved, and the arriving row flashes Lit for 1.4s.

### Hits table and DNS bursts
Fixed columns `#`, `Time (UTC)` (to the millisecond), `Type`, `Source` (mono), `Request` (mono summary for web and SMTP, "A lookup" in 11px for DNS). It has a sticky Soot header with 11px Smoke labels. DNS lookups that arrive together collapse into one burst row ("#18–21", "DNS ×4", "2 resolvers", query types, span in ms, per-IP counts) with a chevron that expands its children, indented, on a slightly darker ground. Selected rows fill Soot 2.

### Resolver-chatter labelling
A bare-id lookup within 10s of a tagged hit is labelled "resolver chatter around ‹tag›" in Ash. It is kept but never counted as new (no dot, no chip). Hit detail explains it in one sentence (QNAME minimisation or HTTPS host resolution).

### Hit detail
A header line with "#40", a type chip, an optional new chip, the receive time, the tag (and "(from path)"), and the bone **Copy as evidence** on the right. Then Source / rDNS / ASN, where ASN lookup is opt-in and labelled as sending the IP to a third party. Then an **Exact bytes | Decoded** segmented toggle, a "Wrap long lines" switch captioned "display only; copies stay exact", and Copy both.

### Raw pane
Request (or Query) and Response (or Answer) side by side on the Well, each with a 32px title bar showing the name, an Ash sub-caption ("exact, as received · 6 lines · 145 bytes") and a ghost Copy. Bytes are Fragment Mono 12.5/18px. HTTP header names are tinted Smoke. Wrapped lines hang-indent by 2ch.

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

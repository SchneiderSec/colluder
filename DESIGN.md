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
- **Probe list** (400px; 320px under 1180px): latest activity first, with a 42px header and a 40px Discord-alerts footer.
- **Probe pane**: a 52px probe header (tag, state, target; the payload copy buttons, Copy report and a ⋯ menu), the probe's payload rows under it while it has no hits (or when shown), a 35px tab strip (Hits · HTTP response; Unregistered has no tabs), then on the Hits tab the hits table (capped at min(28vh, 212px) while a hit is open, min(22vh, 160px) on screens under 900px tall, so detail stays visible), a "Planted … · first hit …" caption between solid hairlines, then the hit detail filling the rest.
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
- **Banners:** full-width strips at the top of the main column, Alarm (engine down or degraded, load failure) or Caution (stream paused, correlation id changed). Each leads with its line form, states what is wrong and what it means, and offers the fix inline (a copyable command, "Got it").

### Probe list row
A three-line row: new-dot slot, mono tag and hit count, last-activity time; then the target in Smoke; then count chips (amber "n new", protocol counts) and the **Ringed Tail**. Silent probes read "Armed · silent 3m" with a solid live line, and "No callbacks yet · planted 09:06"; retired ones read "Retired · silent 4h" in Ash. A retired probe that gets a hit after retirement comes back into the active list with a grey "late hit · retired 14:02" chip. The Unregistered row sits at the bottom, separated by a Rule, in sans rather than mono.

### Ringed Tail (signature)
A 120×10px raccoon tail as the probe's time axis: Fur at 40% opacity, tapering from a deep root at planting time (left) to a rounded tip at now (right), crossed by four faint Soot rings. Each hit is a 2px tick in its protocol ink at its relative time. The tail stays quiet so the ticks carry the signal.

### Gate-board rerank (signature)
When a hit moves a probe to the top, the rows slide to their new places (FLIP, 420ms, ease-out-expo) so the eye can follow what moved, and the arriving row flashes Lit for 1.4s.

### Hits table and DNS bursts
Fixed columns `#`, `Time (UTC)` (to the millisecond), `Type`, `Source` (mono), `Request` (mono request line plus User-Agent for web, the mail sender for SMTP; for DNS the queried name, with the tag highlighted, any exfil labels in Bone, and the id shortened to `c0ffee12…`). It has a sticky Soot header with 11px Smoke labels. DNS lookups that arrive together collapse into one burst row ("#18–21", "DNS ×4", "2 resolvers", then the most specific name asked, "+n names" when there were others, query types (blank ones read "other"), span in ms, per-IP counts) with a chevron that expands its children, indented, on a slightly darker ground. Selected rows fill Soot 2.

- **Filters:** DNS / HTTP(S) / SMTP toggles, a search field ("Search names, paths, bodies, IPs") and Export (every stored hit as JSON lines). They sit at the right of the tab strip when the probe pane is at least 900px wide, and in their own row under it otherwise (and on Unregistered). Search and type filters run on the server over every stored hit, not only the loaded ones, and say "n matches".
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
- **The theme picker** is a grid of preview tiles (a radio group: arrow keys move, Space or Enter picks). Each tile is a miniature drawn in its own theme's colours (the rail, two lines of ink, the four protocol inks and the new-hit dot), with a faint Rule hairline so the light one keeps its edge. Match system splits light and dark on the diagonal.
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
- **ultrathink (2026-11-12).** The word "ultrathink" (any case, anywhere) in a tag or target is drawn the way Claude Code draws it: each letter one of seven rainbow colours, red to violet, flowing rightward through the word (2.1 s cycle; `components/Ultra.tsx`, `lib/ultrathink.ts`, `.ultra-l`). It shows in the list rows, the probe header, the hit detail, the status bar's last hit and the Payload kit picker. The seven colours (`--rb-1`…`--rb-7`) are set per theme pair and hold 4.6:1 on every ground of every theme, blends between them 4.59 at worst; reduced motion keeps the still rainbow. The rainbow's yellow sits beside amber only inside this word; amber still means only "new" everywhere else.
- Hovering a member names it: "orca's colluder: a monkey", "orca-shop-victim: a monkey".
- Eyes are unchanged: a cream wink while armed, shut once retired, amber with the badge only for unseen hits.

## Strip Bay (2026-11-12)

"No clear separation between elements": the warm soot theme had one brown ground for the rail, list, pane and status bar, beige ink in every tier, and murky banners. The replacement world, chosen from four mockups (Strip Bay, Packet List, Departure Board, the category standard), comes from air-traffic-control flight strips: each flight is a strip in a bay, fields sit in ruled boxes, and a controller flags one by sliding it out of line.

- **A matched pair that follows the system.** "Match system" is the default (Settings → Display: Match system, Colluder dark, Colluder light, then High contrast and the named themes). A browser that saved the old default "dark" moves to Match system once (`colluder.display` v2); an explicit pick of any other theme is kept.
- **Dark:** bay `#101113`, strip `#1b1d20`, raised `#212327`, selected `#2b2f34`, well `#141518`, edge `#3a3e45`, hairline `#2a2d32`; ink `#eceef1` / `#b5bac1` / `#979da5`.
- **Light:** bay `#d7dade`, strip `#ffffff`, selected `#e6ebf1`, well `#f5f6f8`, edge `#b9bfc7`, hairline `#e1e4e8`; ink `#16181b` / `#454a52` / `#555b64`; amber `#7f4f00`; inks DNS `#7348c2`, HTTP `#a94c18`, HTTPS `#2a5fbe`, SMTP `#1c754b`. Every text ink holds 4.5:1 on every ground it can sit on, the bay included (checked with a script). High contrast is the same bay with brighter edges and text; the named themes each get a bay one step below their ground.
- **The shell:** the rail and status bar sit on the bay with no borders; the current tool is a strip. Banners are strips with their own alarm or caution edge, stacked with 6px gaps. The work area has 8px of bay around and between the probe list and the pane.
- **The probe list is not a strip; its parts are.** The header (53px, so its bottom edge meets the probe header's), each probe row (5px radius) and the Discord footer are strips in the bay; silent and retired probes are slimmer strips. **Bays** label the sections: Active (shown when there are other sections), Silent and Retired, each a small Smoke label over a Rule line.
- **The cocked strip (signature).** A probe with unread hits slides 12px out of line toward the pane, with an amber edge and a soft shadow; once read it slides back (0.5 s, ease-out-expo; reduced motion shows the offset without the slide). The list keeps 14px on the right so a cocked strip never clips. Amber still means only "not seen yet".
- **The pane** is one strip. Hit-table columns are divided by Rule 2 hairlines; state (selected, new, chatter) restyles a row's fill and ink, never the grid. The **hit detail** sits on the bay inside the pane as two strips: what happened (header, lead, fields, notes), then the bytes (view controls, request and response wells with a Rule edge, custody on the Well).
- **Mailbox and the Payload kit** are each one strip in the bay; Settings' grouped panels already were.
- **Theme tiles** were redrawn from the new values (the rail swatch is the bay, the ground is a strip).


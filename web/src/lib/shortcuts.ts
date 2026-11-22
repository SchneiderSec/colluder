// Every keyboard shortcut, by where it works: the ? sheet shows the current view's groups and
// Settings > Keyboard shows them all. One list, so the two never disagree.
export type Shortcut = [keys: string[], what: string];
export type ShortcutGroup = { title: string; views: string[]; keys: Shortcut[] };

export const SHORTCUTS: ShortcutGroup[] = [
  { title: "Anywhere", views: ["probes", "kit", "mailbox", "settings"], keys: [
    [["p"], "Plant a probe (stays in the view you're in)"],
    [["?"], "These shortcuts"],
    [["Esc"], "Leave a field, close the plant form or a hit"],
  ] },
  { title: "Probes", views: ["probes"], keys: [
    [["/", "o"], "Find a probe: All probes in tabs, the filter with the list docked"],
    [["[", "]"], "Previous / next probe, wrapping round (tabs, or the list)"],
    [["n"], "Next probe with new hits"],
    [["1–8", "9"], "Probe tab by position, or the last"],
    [["\\"], "Switch between the probe tabs and the docked list"],
    [["Shift+T"], "Reopen the last closed tab"],
    [["F2"], "Rename the open probe, in its header"],
    [["a"], "Switch between Hits and Answer"],
    [["←", "→"], "Move along the tab strip (when a tab has focus); Home and End go to the ends"],
    [["Delete"], "Close the focused tab"],
  ] },
  { title: "Hits", views: ["probes"], keys: [
    [["j", "k"], "Next / previous hit"],
    [["↑", "↓"], "Move between rows (when the table has focus); Home and End go to the ends"],
    [["Enter", "→", "←"], "Open or fold a DNS burst row"],
    [["f"], "Search this probe's hits"],
    [["e"], "Copy the open hit as evidence"],
    [["c"], "Copy the open web hit as curl"],
  ] },
  { title: "Answer", views: ["probes"], keys: [
    [["Ctrl+S", "⌘S"], "Save the rule"],
  ] },
  { title: "Mailbox", views: ["mailbox"], keys: [
    [["/"], "Find mail"],
    [["j", "k"], "Next / previous message"],
  ] },
];

// a key handler's guard: not while typing, not under a dialog or menu, no modifiers
export const typingOrModal = (e: KeyboardEvent) =>
  e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement)?.tagName ?? "")
  || (document.activeElement as HTMLElement)?.isContentEditable || !!document.querySelector("[role=dialog],[role=alertdialog],[role=menu]");

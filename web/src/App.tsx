import { useEffect, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApp, select, setTab, totalUnread, unreadFor, loadState, connect, getState, setPlanting, PROBE_TABS, type ProbeTab } from "@/store";
import { UNTAGGED } from "@/lib/types";
import { Rail, StatusBar, Banners } from "@/components/Shell";
import { Composer } from "@/components/Composer";
import { ProbeList } from "@/components/ProbeList";
import { ProbeTabs, plantNew, tabId, useListFolded } from "@/components/ProbeTabs";
import { ProbePane } from "@/components/ProbePane";
import { Settings } from "@/components/Pages";
import { PayloadKit } from "@/components/PayloadKit";
import { Mailbox } from "@/components/Mailbox";
import { MarkSvg, setFavicon } from "@/components/Mark";
import { Toaster } from "@/components/bits";
import { ShortcutSheet } from "@/components/Shortcuts";
import { nightNow, useDisplay } from "@/lib/display";
import { cn } from "@/lib/utils";

// tools that became probe tabs: old links land on the tab instead
const MOVED: Record<string, ProbeTab> = { files: "http", responses: "http", rebinding: "hits" };

function useRoute() {
  const read = () => {
    const [view, arg, tab] = decodeURIComponent(location.hash.slice(1)).split("/");
    if (view in MOVED) return { view: "probes", arg: null, tab: MOVED[view] };
    return {
      view: view && (view === "probes" || view === "settings" || view === "kit" || view === "mailbox") ? view : "probes",
      arg: arg || null,
      tab: (PROBE_TABS as string[]).includes(tab) ? (tab as ProbeTab) : "hits" as ProbeTab,
    };
  };
  const [r, setR] = useState(read);
  useEffect(() => { const f = () => setR(read()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return r;
}

export default function App() {
  const route = useRoute();
  const loaded = useApp((s) => s.loaded);
  const unread = useApp(totalUnread);
  const night = nightNow(useDisplay());
  const favSrc = useRef<HTMLDivElement>(null);
  const planting = useApp((s) => s.planting);
  // reading a hit trades the side list for probe tabs on top of the pane, so the pane gets the width
  const folded = useListFolded(route.view === "probes");
  const sel = useApp((x) => x.sel);

  useEffect(() => { loadState(); connect(); }, []);

  // Esc leaves a text field, so j/k and p work again (dialogs handle their own Esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (e.key === "Escape" && el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !el.closest("[role=dialog],[role=alertdialog]")) el.blur();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // "p" anywhere opens the plant form (it focuses its tag field) without changing the view; "/" and
  // "o" find a probe (ProbeTabs' keys)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement)?.tagName) || document.querySelector("[role=dialog],[role=alertdialog],[role=menu]");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "p") { e.preventDefault(); plantNew(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // nothing planted yet: the plant form is the first step, so it starts open
  useEffect(() => {
    const s = getState();
    if (loaded && !s.probes.size && !s.untagged?.hits) setPlanting(true);
  }, [loaded]);

  // route → selection (deep links like #probes/fetch); default to the most recent probe
  useEffect(() => {
    if (!loaded || route.view !== "probes") return;
    const s = getState();
    setTab(route.tab, false);
    const want = route.arg === "unregistered" ? UNTAGGED : route.arg;
    if (want && (want === UNTAGGED || s.probes.has(want))) { select(want, false); return; }
    if (!s.sel) {
      // open where the news is: unread first, then the latest hit, then the latest planted
      const t = (x: string | null) => (x ? Date.parse(x) : 0);
      const first = [...s.probes.values()].filter((p) => !p.retiredAt).sort((a, b) =>
        (unreadFor(s, b.tag) ? 1 : 0) - (unreadFor(s, a.tag) ? 1 : 0) || t(b.lastHitAt) - t(a.lastHitAt) || t(b.plantedAt) - t(a.plantedAt))[0];
      if (first) select(first.tag); else if (s.untagged?.hits) select(UNTAGGED);
    } else if (!route.arg) select(s.sel); // bare #probes or an old tool link: put the probe and tab back in the URL
  }, [loaded, route.view, route.arg, route.tab]);

  useEffect(() => {
    document.title = unread ? `(${unread}) Colluder` : "Colluder";
    if (favSrc.current) setFavicon(unread, favSrc.current.innerHTML);
  }, [unread]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("grid h-full grid-cols-[76px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] max-[820px]:block max-[820px]:h-auto max-[820px]:min-h-full", night && "[--bone:var(--bone-night)]")}>
        <Rail view={route.view} />
        <main className="flex min-h-0 min-w-0 flex-col max-[820px]:block">
          <Banners />
          {route.view === "probes" ? (
            <>
              {planting && <Composer />}
              <div className={cn("grid min-h-0 flex-1 gap-x-2 p-2 max-[820px]:flex max-[820px]:flex-col max-[820px]:gap-2 max-[820px]:p-1.5", folded ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-[360px_minmax(0,1fr)] max-[1400px]:grid-cols-[320px_minmax(0,1fr)]")}>
                {/* the list stays mounted while folded, so its filter, groups and scroll survive */}
                <ProbeList hidden={folded} />
                {/* one place in the tree for the pane, so folding never resets its filters or open hit */}
                <div className="flex min-h-0 min-w-0 flex-col">
                  {folded && <ProbeTabs />}
                  <div id="probe-view" role={folded ? "tabpanel" : undefined} aria-labelledby={folded && sel ? tabId(sel) : undefined} className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]"><ProbePane /></div>
                </div>
              </div>
            </>
          ) : route.view === "settings" ? <Settings section={route.arg} /> : route.view === "mailbox" ? <Mailbox arg={route.arg} /> : <PayloadKit section={route.arg} />}
        </main>
        <StatusBar />
      </div>
      <Toaster />
      <ShortcutSheet view={route.view} />
      <div ref={favSrc} hidden aria-hidden="true"><MarkSvg size={64} badge={!!unread} /></div>
    </TooltipProvider>
  );
}

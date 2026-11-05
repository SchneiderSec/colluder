import { useEffect, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApp, select, setTab, totalUnread, unreadFor, loadState, connect, getState, PROBE_TABS, type ProbeTab } from "@/store";
import { UNTAGGED } from "@/lib/types";
import { Rail, StatusBar, Banners } from "@/components/Shell";
import { Composer } from "@/components/Composer";
import { ProbeList } from "@/components/ProbeList";
import { ProbePane } from "@/components/ProbePane";
import { Settings, Planned, PLANNED } from "@/components/Pages";
import { MarkSvg, setFavicon } from "@/components/Mark";
import { Toaster } from "@/components/bits";
import { cn } from "@/lib/utils";

// tools that became probe tabs: old links land on the tab instead
const MOVED: Record<string, ProbeTab> = { files: "http", responses: "http", rebinding: "dns" };

function useRoute() {
  const read = () => {
    const [view, arg, tab] = decodeURIComponent(location.hash.slice(1)).split("/");
    if (view in MOVED) return { view: "probes", arg: null, tab: MOVED[view] };
    return {
      view: view && (view === "probes" || view === "settings" || view in PLANNED) ? view : "probes",
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
  const night = new Date().getHours() < 5;
  const favSrc = useRef<HTMLDivElement>(null);

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
      <div className={cn("grid h-full grid-cols-[76px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] max-[820px]:block max-[820px]:h-auto max-[820px]:min-h-full", night && "[--bone:#e6dccb]")}>
        <Rail view={route.view} />
        <main className="flex min-h-0 min-w-0 flex-col max-[820px]:block">
          <Banners />
          {route.view === "probes" ? (
            <>
              <Composer />
              <div className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)] max-[1180px]:grid-cols-[320px_minmax(0,1fr)] max-[820px]:block">
                <ProbeList />
                <ProbePane />
              </div>
            </>
          ) : route.view === "settings" ? <Settings /> : <Planned view={route.view} />}
        </main>
        <StatusBar />
      </div>
      <Toaster />
      <div ref={favSrc} hidden aria-hidden="true"><MarkSvg size={64} badge={!!unread} /></div>
    </TooltipProvider>
  );
}

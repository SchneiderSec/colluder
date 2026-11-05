import { ArrowDownToLine, Copy, FileText, Radio, Repeat, Settings2, Undo2, Briefcase } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp, totalUnread } from "@/store";
import { ago, dur, hms, isoMs } from "@/lib/format";
import { copy } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { LineForm, useTick } from "./bits";
import { Mark } from "./Mark";
import { cn } from "@/lib/utils";

export const TOOLS: { view: string; label: string; icon: LucideIcon }[] = [
  { view: "probes", label: "Probes", icon: ArrowDownToLine },
  { view: "files", label: "Hosted files", icon: FileText },
  { view: "responses", label: "Redirects & responses", icon: Undo2 },
  { view: "rebinding", label: "DNS rebinding", icon: Repeat },
  { view: "kit", label: "Payload kit", icon: Briefcase },
  { view: "listeners", label: "Listeners", icon: Radio },
];

function markBase(s: ReturnType<typeof useApp<import("@/store").AppState>>): "wink" | "blink" | "doze" {
  const e = s.status?.engine;
  if (s.stream.state !== "connected" || !e || e.state === "starting" || e.state === "unknown") return "blink";
  const last = s.status?.lastHitAt;
  return last && e.state === "capturing" && Date.now() - isoMs(last) > 2 * 3600e3 ? "doze" : "wink";
}

export function Rail({ view }: { view: string }) {
  const s = useApp((x) => x);
  useTick(15000);
  const unread = totalUnread(s);
  const Item = ({ v, label, Icon, badge }: { v: string; label: string; Icon: LucideIcon; badge?: number }) => (
    <a href={`#${v}`} aria-current={view === v ? "page" : undefined}
      className={cn("relative flex w-[70px] flex-none flex-col items-center gap-[5px] rounded py-[9px] pb-2 text-center text-[11px] leading-3 font-[550] text-smoke no-underline hover:bg-soot-1 hover:text-bone max-[820px]:w-auto max-[820px]:px-2.5 max-[820px]:py-1.5",
        view === v && "bg-soot-2 text-bone")}>
      <Icon className="size-[19px]" strokeWidth={1.5} />
      <span className="max-[820px]:sr-only">{label}</span>
      {!!badge && <span className="absolute top-[5px] left-[42px] h-[15px] min-w-4 rounded-lg bg-amber px-1 text-[11px] leading-[15px] font-bold text-soot max-[820px]:left-auto max-[820px]:right-0" aria-label={`${badge} unread`}>{badge > 99 ? "99+" : badge}</span>}
    </a>
  );
  return (
    <nav aria-label="Tools" className="row-span-2 z-10 flex flex-col items-center gap-0.5 border-r border-rule bg-soot pt-3.5 pb-2.5 max-[820px]:row-span-1 max-[820px]:sticky max-[820px]:top-0 max-[820px]:flex-row max-[820px]:overflow-x-auto max-[820px]:border-r-0 max-[820px]:border-b max-[820px]:px-2.5 max-[820px]:py-0">
      <Mark base={markBase(s)} pulse={s.pulse} />
      {TOOLS.map((t) => <Item key={t.view} v={t.view} label={t.label} Icon={t.icon} badge={t.view === "probes" ? unread : undefined} />)}
      <span className="flex-1 max-[820px]:hidden" />
      <Item v="settings" label="Settings" Icon={Settings2} />
    </nav>
  );
}

export function StatusBar() {
  const s = useApp((x) => x);
  useTick(1000);
  const e = s.status?.engine;
  const engine = ({
    capturing: ["live", "capturing", false], starting: ["dash", "starting", false], degraded: ["dash", "degraded", true],
    down: ["down", "down", true], missing: ["down", "not installed", true], unknown: ["dash", "checking", false],
  } as const)[e?.state ?? "unknown"];
  const ss = s.stream.state;
  const off = ss !== "connected" && Date.now() - s.stream.since > 30000;
  const last = s.status?.lastHitAt;
  const host = s.status?.payload?.host;
  const now = new Date();
  const night = now.getHours() < 5;
  const Item = ({ kind, label, word, sub, bad, title }: { kind?: "live" | "dash" | "down"; label: string; word: string; sub?: string; bad?: boolean; title?: string }) => (
    <div className="flex items-center gap-[7px]" title={title}>
      {kind && <LineForm kind={kind} className={bad ? "text-bad" : "text-bone"} />}
      <span className="text-smoke">{label}</span>
      <b className={cn("font-[650]", bad && "text-bad")}>{word}</b>
      {sub && <span className="text-ash max-[820px]:hidden">{sub}</span>}
    </div>
  );
  return (
    <footer role="status" aria-live="off" className="col-start-2 flex h-7 items-center gap-[22px] overflow-hidden border-t border-rule bg-soot-1 pr-4 pl-6 text-[12.5px] whitespace-nowrap max-[820px]:sticky max-[820px]:bottom-0 max-[820px]:col-start-1 max-[820px]:pl-3.5">
      <span className="font-brand text-[13.5px] leading-none font-bold tracking-[-.01em]">colluder</span>
      <Item kind={engine[0]} label="Engine" word={engine[1]} bad={engine[2]}
        sub={`${e?.version ?? ""}${e?.state === "capturing" && e.since ? ` · up ${dur(Date.now() - Date.parse(e.since))}` : ""}`}
        title={`${e?.detail ?? ""}\nSolid line: live. Dashed: starting or reconnecting. Struck: down.`} />
      <Item kind={ss === "connected" ? "live" : off ? "down" : "dash"} label="Stream" word={ss === "connected" ? "connected" : off ? "offline, retrying" : ss} bad={off} />
      <Item label="Last hit" word={last ? ago(Date.now() - isoMs(last)) : "none yet"} sub={last ? hms(last) : ""} />
      <div className="ml-auto flex items-center gap-[18px]">
        {night && <span className="text-[11px] text-ash">Night shift</span>}
        {host && <span className="font-mono text-[11px] text-smoke max-[820px]:hidden">{host.slice(0, 8)}….{s.status!.payload!.domain}</span>}
        <span className="font-semibold tracking-[.02em]">{now.toISOString().slice(11, 19)}<span className="ml-[3px] text-[11px] font-medium text-smoke">UTC</span></span>
      </div>
    </footer>
  );
}

export function Banners() {
  const s = useApp((x) => x);
  useTick(1000);
  const e = s.status?.engine;
  const out = [];
  if (e && ["down", "missing", "degraded"].includes(e.state)) {
    out.push(
      <div key="engine" className="flex flex-wrap items-center gap-3 border-b border-rule bg-[#2a1914] px-6 py-[9px] text-[12.5px] text-[#f4c6b8] max-[820px]:px-3.5">
        <LineForm kind="down" />
        <span><b>{e.state === "degraded" ? "The engine is having trouble. " : "The engine is not capturing. "}</b>{e.detail}{e.state !== "degraded" && " Payloads will not record hits until it is back."}</span>
        {e.fix && <Button variant="quiet" className="ml-auto max-w-full overflow-hidden" onClick={() => copy(e.fix!, "fix command")}><Copy /><span className="truncate font-mono text-bone">{e.fix}</span></Button>}
      </div>,
    );
  }
  if (s.stream.state !== "connected" && Date.now() - s.stream.since > 8000) {
    out.push(
      <div key="stream" className="flex items-center gap-3 border-b border-rule bg-[#2b2113] px-6 py-[9px] max-[820px]:px-3.5 text-[12.5px] text-[#f3d9a4]">
        <LineForm kind="dash" />
        Live updates paused: reconnecting to the dashboard{s.stream.lastEventAt ? `, last update ${ago(Date.now() - s.stream.lastEventAt)}` : ""}. What you see may be out of date.
      </div>,
    );
  }
  const ch = s.status?.correlationChangedAt;
  let acked = "";
  try { acked = localStorage.getItem("colluder.ackCorr") ?? ""; } catch { /* */ }
  if (ch && acked !== JSON.stringify(ch)) {
    out.push(
      <div key="corr" className="flex items-center gap-3 border-b border-rule bg-[#2b2113] px-6 py-[9px] max-[820px]:px-3.5 text-[12.5px] text-[#f3d9a4]">
        The engine's correlation id changed at {ch.replace("T", " ").slice(0, 16)} UTC. Payloads planted before then no longer reach this dashboard; copy fresh ones.
        <Button variant="ghost" className="ml-auto" onClick={() => { try { localStorage.setItem("colluder.ackCorr", JSON.stringify(ch)); } catch { /* */ } location.reload(); }}>Got it</Button>
      </div>,
    );
  }
  if (s.loadError) out.push(<div key="load" className="border-b border-rule bg-[#2a1914] px-6 py-[9px] text-[12.5px] text-[#f4c6b8] max-[820px]:px-3.5">Could not load Colluder's state: {s.loadError}. Retrying…</div>);
  return <>{out}</>;
}

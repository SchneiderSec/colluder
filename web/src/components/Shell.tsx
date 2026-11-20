import { Fragment, useState } from "react";
import { ArrowDownToLine, Copy, Settings2, Briefcase, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp, totalUnread, chatterOf, keyOf, select, selectHit, runCheck } from "@/store";
import { UNTAGGED } from "@/lib/types";
import { ago, dur, hms, isoMs, newestFirst } from "@/lib/format";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { LineForm, useTick, type Signal } from "./bits";
import { Mark } from "./Mark";
import { cn } from "@/lib/utils";
import { shownId } from "@/lib/kit";
import { nightNow, useDisplay } from "@/lib/display";
import { Ultra } from "@/components/Ultra";
import { answerWords, stillAnswering, stopAnswering, tabName } from "./ProbeTabs";

// The rail holds tools that work across probes. What a single probe answers (HTTP response,
// hosted files, DNS and rebinding) lives in tabs on the probe itself.
export const TOOLS: { view: string; label: string; icon: LucideIcon }[] = [
  { view: "probes", label: "Probes", icon: ArrowDownToLine },
  { view: "kit", label: "Payload kit", icon: Briefcase },
  { view: "mailbox", label: "Mailbox", icon: Mail },
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
      className={cn("relative flex w-[70px] flex-none flex-col items-center gap-[5px] rounded py-[9px] pb-2 text-center text-label leading-3 font-[550] border border-transparent text-smoke no-underline hover:bg-soot hover:text-bone max-[820px]:min-h-11 max-[820px]:w-auto max-[820px]:min-w-11 max-[820px]:justify-center max-[820px]:px-2.5 max-[820px]:py-1.5",
        view === v && "border-rule bg-soot text-bone")}>
      <Icon className="size-[19px]" strokeWidth={1.5} />
      <span className="max-[820px]:sr-only">{label}</span>
      {!!badge && <span className="absolute top-[5px] left-[42px] h-[15px] min-w-4 rounded-lg bg-amber px-1 text-label leading-[0.9375rem] font-bold text-soot max-[820px]:left-auto max-[820px]:right-0" aria-label={`${badge} unread`}>{badge > 99 ? "99+" : badge}</span>}
    </a>
  );
  return (
    <nav aria-label="Tools" className="row-span-2 z-10 flex flex-col items-center gap-0.5 bg-bay pt-3.5 pb-2.5 max-[820px]:row-span-1 max-[820px]:sticky max-[820px]:top-0 max-[820px]:flex-row max-[820px]:overflow-x-auto max-[820px]:border-b max-[820px]:border-rule max-[820px]:px-2.5 max-[820px]:py-0">
      <Mark base={markBase(s)} pulse={s.pulse} />
      {TOOLS.map((t, i) => (
        <Fragment key={t.view}>
          {i === 1 && <hr className="my-2 w-9 border-0 border-t border-rule max-[820px]:mx-1 max-[820px]:my-0 max-[820px]:h-5 max-[820px]:w-0 max-[820px]:border-t-0 max-[820px]:border-l" />}
          <Item v={t.view} label={t.label} Icon={t.icon} badge={t.view === "probes" ? unread : undefined} />
        </Fragment>
      ))}
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
  const clearAt = s.status?.lastClear?.at;
  const host = s.status?.payload?.host;
  const edgeSt = s.status?.edge;
  const ck = s.status?.check;
  const cl = ck?.last;
  const checkTip = !ck?.active ? "" : !cl ? "Outside check: the first run is about 30 s after Colluder starts." :
    `Outside check, every ${ck.everyMinutes} min (Settings has the details):\n${cl.steps.map((x) => `${x.ok ? "ok  " : "FAIL"}  ${x.label}: ${x.detail}`).join("\n")}${cl.warnings.length ? "\n" + cl.warnings.join("\n") : ""}`;
  // the newest hit that carries signal (resolver chatter skipped)
  const chatter = chatterOf(s.list);
  const lastHit = s.list.filter((i) => !chatter.has(i.id)).reduce<typeof s.list[number] | undefined>((m, i) => (!m || newestFirst(i, m) < 0 ? i : m), undefined);
  const now = new Date();
  const night = nightNow(useDisplay(), now);
  // on a phone each state keeps a short label, so "capturing connected answering" says what is which
  // shortWide: the short label from 1280px down (phones get short anyway), for items that crowd the bar
  const Item = ({ kind, signal, label, short, shortWide, word, sub, subHide = "max-[1280px]:hidden", bad, title }: { kind?: "live" | "dash" | "down"; signal?: Signal; label: string; short?: string; shortWide?: boolean; word: string; sub?: string; subHide?: string; bad?: boolean; title?: string }) => (
    <div className="flex items-center gap-[7px]" title={title}>
      {kind && <LineForm kind={kind} signal={signal} className={bad ? "text-bad" : "text-bone"} />}
      <span className={cn("text-smoke", short && (shortWide ? "max-[1280px]:hidden" : "max-[820px]:hidden"))}>{label}</span>
      {short && <span className={cn("hidden text-smoke", shortWide ? "max-[1280px]:inline" : "max-[820px]:inline")}>{short}</span>}
      <b className={cn("font-[650]", bad && "text-bad")}>{word}</b>
      {sub && <span className={cn("text-ash", subHide)}>{sub}</span>}
    </div>
  );
  return (
    <footer role="status" aria-live="off" className="col-start-2 flex h-7 items-center gap-[22px] max-[820px]:gap-3.5 overflow-hidden bg-bay pr-4 pl-3 text-body whitespace-nowrap max-[820px]:sticky max-[820px]:bottom-0 max-[820px]:col-start-1 max-[820px]:pl-3.5">
      <span className="font-brand text-title leading-none font-bold tracking-[-.01em] max-[820px]:hidden">colluder</span>
      <Item kind={engine[0]} signal="beat" label="Engine" short="Eng" word={engine[1]} bad={engine[2]}
        sub={`${e?.version ?? ""}${e?.state === "capturing" && e.since ? ` · up ${dur(Date.now() - Date.parse(e.since))}` : ""}`}
        title={`${e?.detail ?? ""}\nA moving line: live (the engine beats, the stream carries packets, the edge echoes). Dashed: starting or reconnecting. Struck: down. Still and dim: off.`} />
      <Item kind={ss === "connected" ? "live" : off ? "down" : "dash"} signal="packets" label="Stream" short="Str" word={ss === "connected" ? "connected" : off ? "offline, retrying" : ss} bad={off} />
      {edgeSt && edgeSt.state !== "absent" && (
        <Item kind={edgeSt.state === "running" ? "live" : "down"} signal="echo" label="Edge" short="Edge" bad={edgeSt.state !== "running"}
          word={edgeSt.state === "running" ? "answering" : edgeSt.state === "stale" ? "silent" : "down"}
          // a passing outside check rides on the edge's item; only a failing one takes room of its own
          sub={edgeSt.state === "running" && cl && cl.state !== "failing" ? `checked ${ago(Date.now() - isoMs(cl.finishedAt))}` : ""} subHide="max-[1680px]:hidden"
          title={[edgeSt.state === "running" ? `Colluder's edge answers your probes on ${[edgeSt.listen?.http, edgeSt.listen?.https, edgeSt.listen?.dns].filter(Boolean).join(", ")}` : "The edge isn't answering: HTTP rules are not being served", checkTip].filter(Boolean).join("\n\n")} />
      )}
      {ck?.active && cl?.state === "failing" && (
        <a href="#settings" className="flex items-center rounded-[3px] no-underline hover:text-bone">
          <Item kind="down" signal="listen" label="Outside check" short="Check" shortWide word="failing" bad title={checkTip} />
        </a>
      )}
      {lastHit ? (
        <button type="button" title={`Open hit #${lastHit.id}`} onClick={() => {
          const k = keyOf(lastHit);
          location.hash = "#probes/" + (k === UNTAGGED ? "unregistered" : k);
          select(k, false);
          selectHit(lastHit.id);
        }} className="flex min-w-0 cursor-pointer items-center gap-[7px] overflow-hidden rounded-[3px] hover:text-bone">
          <span className="text-smoke max-[820px]:hidden">Last hit</span>
          <b className={cn("min-w-[5ch] truncate font-[650]", lastHit.tag && "font-mono")}>{lastHit.tag ? <Ultra text={lastHit.tag} /> : "No tag"}</b>
          <span className="text-smoke max-[820px]:hidden">{lastHit.protocol.toUpperCase()}</span>
          <b className="font-[650] whitespace-nowrap">{ago(Date.now() - isoMs(lastHit.timestamp))}</b>
          <span className="text-ash max-[1280px]:hidden in-[.type-comfortable]:max-[1520px]:hidden">{hms(lastHit.timestamp)}</span>
        </button>
      ) : <Item label="Last hit" word={last ? ago(Date.now() - isoMs(last)) : "none yet"}
          sub={last && clearAt && isoMs(clearAt) >= isoMs(last) ? `${hms(last)} · cleared ${hms(clearAt)}` : last ? hms(last) : ""}
          title={last && clearAt && isoMs(clearAt) >= isoMs(last) ? "Hits were cleared after this one arrived, so no probe shows it. Settings → Restore last clear brings them back." : undefined} />}
      <div className="ml-auto flex flex-none items-center gap-[18px] max-[820px]:hidden">
        {night && <span className="text-label text-ash">Night shift</span>}
        {host && <span className="font-mono text-label text-smoke max-[1560px]:hidden in-[.type-comfortable]:max-[1800px]:hidden">{shownId(host.split(".")[0])}.{s.status!.payload!.domain}</span>}
        <span className="font-semibold tracking-[.02em]">{now.toISOString().slice(11, 19)}<span className="ml-[3px] text-label font-medium text-smoke">UTC</span></span>
      </div>
    </footer>
  );
}

export function Banners() {
  const s = useApp((x) => x);
  const [, bump] = useState(0); // "Got it" is kept in localStorage; this re-reads it
  useTick(1000);
  const e = s.status?.engine;
  const out = [];
  if (e && ["down", "missing", "degraded"].includes(e.state)) {
    out.push(
      <div key="engine" className="flex flex-wrap items-center gap-3 rounded-md border border-alarm-border bg-alarm-ground px-4 py-[9px] text-body text-alarm-banner-ink max-[820px]:px-3.5">
        <LineForm kind="down" />
        <span><b>{e.state === "degraded" ? "The engine is having trouble. " : "The engine is not capturing. "}</b>{e.detail}{e.state !== "degraded" && " Payloads will not record hits until it is back."}</span>
        {e.fix && <Button variant="quiet" className="ml-auto max-w-full overflow-hidden" onClick={() => copy(e.fix!, "fix command")}><Copy /><span className="truncate font-mono text-bone">{e.fix}</span></Button>}
      </div>,
    );
  }
  if (s.stream.state !== "connected" && Date.now() - s.stream.since > 8000) {
    out.push(
      <div key="stream" className="flex items-center gap-3 rounded-md border border-caution-border bg-caution-ground px-4 py-[9px] max-[820px]:px-3.5 text-body text-caution-ink">
        <LineForm kind="dash" />
        Live updates paused: reconnecting to the dashboard{s.stream.lastEventAt ? `, last update ${ago(Date.now() - s.stream.lastEventAt)}` : ""}. What you see may be out of date.
      </div>,
    );
  }
  // once the edge owns :80/:443, it being down means HTTP hits go uncaptured, not just unanswered
  const ed = s.status?.edge;
  if (ed && (ed.state === "stale" || ed.state === "stopped")) {
    const fix = "sudo systemctl restart colluder-edge";
    out.push(
      <div key="edge" className="flex flex-wrap items-center gap-3 rounded-md border border-alarm-border bg-alarm-ground px-4 py-[9px] text-body text-alarm-banner-ink max-[820px]:px-3.5">
        <LineForm kind="down" />
        <span><b>Colluder's edge isn't answering. </b>HTTP and HTTPS hits on your probes are not being captured{ed.heartbeatAt ? ` (last heartbeat ${ago(Date.now() - isoMs(ed.heartbeatAt))})` : ""}. {ed.listen?.dns ? "Nor is DNS: the edge answers it, so payload names don't resolve at all." : "DNS still is."}</span>
        <Button variant="quiet" className="ml-auto max-w-full overflow-hidden" onClick={() => copy(fix, "fix command")}><Copy /><span className="truncate font-mono text-bone">{fix}</span></Button>
      </div>,
    );
  }
  // the edge is a root service: new rule features only reach the internet after it restarts
  if (ed?.state === "running" && ed.codeStale) {
    const fix = "sudo systemctl restart colluder-edge";
    out.push(
      <div key="edge-code" className="flex flex-wrap items-center gap-3 rounded-md border border-caution-border bg-caution-ground px-4 py-[9px] text-body text-caution-ink max-[820px]:px-3.5">
        <span><b className="font-semibold">The edge is running older code than what's installed.</b> Rules still answer, but features added since it started aren't served yet. A restart takes about a second.</span>
        <Button variant="quiet" className="ml-auto max-w-full overflow-hidden" onClick={() => copy(fix, "restart command")}><Copy /><span className="truncate font-mono text-bone">{fix}</span></Button>
      </div>,
    );
  }
  // the outside check: failing means a quiet probe proves nothing; warnings are dismissed one by one
  const ck = s.status?.check;
  if (ck?.active && ck.last?.state === "failing") {
    const bad = ck.last.steps.filter((x) => !x.ok);
    out.push(
      <div key="check" className="flex flex-wrap items-center gap-3 rounded-md border border-alarm-border bg-alarm-ground px-4 py-[9px] text-body text-alarm-banner-ink max-[820px]:px-3.5">
        <LineForm kind="down" />
        <span><b>Callbacks may not be reaching Colluder. </b>{bad.map((x) => `${x.label}: ${x.detail}.`).join(" ")} Until this clears, a quiet probe proves nothing.</span>
        <Button variant="quiet" className="ml-auto" disabled={ck.running} onClick={() => runCheck().catch((x) => toast((x as Error).message, true))}>{ck.running ? "Checking…" : "Check again"}</Button>
      </div>,
    );
  }
  let seenWarn = "";
  try { seenWarn = localStorage.getItem("colluder.ackCheckWarn") ?? ""; } catch { /* */ }
  const warnKey = ck?.last?.warnings.join("|") ?? "";
  if (ck?.active && warnKey && warnKey !== seenWarn) { // shown when failing too: a lapsing cert matters either way
    out.push(
      <div key="check-warn" className="flex items-center gap-3 rounded-md border border-caution-border bg-caution-ground px-4 py-[9px] max-[820px]:px-3.5 text-body text-caution-ink">
        <span>{ck.last?.warnings.join(" ")}</span>
        <Button variant="ghost" className="ml-auto" onClick={() => { try { localStorage.setItem("colluder.ackCheckWarn", warnKey); } catch { /* */ } bump((n) => n + 1); }}>Got it</Button>
      </div>,
    );
  }
  const ch = s.status?.correlationChangedAt;
  let acked = "";
  try { acked = localStorage.getItem("colluder.ackCorr") ?? ""; } catch { /* */ }
  if (ch && acked !== JSON.stringify(ch)) {
    out.push(
      <div key="corr" className="flex items-center gap-3 rounded-md border border-caution-border bg-caution-ground px-4 py-[9px] max-[820px]:px-3.5 text-body text-caution-ink">
        {s.status?.edge?.state === "running"
          ? <>The engine's correlation id changed at {ch.replace("T", " ").slice(0, 16)} UTC. Older payloads still bring HTTP(S) hits here through Colluder's edge, but not their DNS lookups; copy fresh ones for DNS.</>
          : <>The engine's correlation id changed at {ch.replace("T", " ").slice(0, 16)} UTC. Payloads planted before then no longer reach this dashboard; copy fresh ones.</>}
        <Button variant="ghost" className="ml-auto" onClick={() => { try { localStorage.setItem("colluder.ackCorr", JSON.stringify(ch)); } catch { /* */ } bump((n) => n + 1); }}>Got it</Button>
      </div>,
    );
  }
  // retired probes whose rule the edge still serves: whoever finds their payloads gets the answer.
  // "Keep answering" is remembered for exactly this set (tag and rule version), so a new one shows.
  const live = ed?.state === "running" ? stillAnswering(s) : [];
  const liveKey = live.map((p) => `${p.tag}@${p.httpRule!.version}`).sort().join("|");
  let keptKey = "";
  try { keptKey = localStorage.getItem("colluder.keepAnswering") ?? ""; } catch { /* */ }
  if (live.length && liveKey !== keptKey) {
    const shown = live.slice(0, 3);
    out.push(
      <div key="retired-answering" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-caution-border bg-caution-ground px-4 py-[9px] max-[820px]:px-3.5 text-body text-caution-ink">
        <span className="min-w-0 flex-1">
          <b className="font-semibold">{live.length === 1 ? "A retired probe still answers HTTP" : `${live.length} retired probes still answer HTTP`}: </b>
          {shown.map((p, i) => (
            <Fragment key={p.tag}>
              {i > 0 && ", "}
              <button type="button" className="cursor-pointer font-mono underline decoration-caution-border underline-offset-2 hover:decoration-caution-ink" onClick={() => select(p.tag)}>{tabName(p.tag) ?? p.tag}</button>
              {" "}({answerWords(p)})
            </Fragment>
          ))}
          {live.length > shown.length && ` and ${live.length - shown.length} more`}. Anyone who finds {live.length === 1 ? "its payloads" : "their payloads"} still gets that answer.
        </span>
        <span className="flex flex-none items-center gap-1.5">
          <Button variant="quiet" onClick={() => stopAnswering(live.map((p) => p.tag))}>Stop answering</Button>
          <Button variant="ghost" title="Hide this until another retired probe is left answering" onClick={() => { try { localStorage.setItem("colluder.keepAnswering", liveKey); } catch { /* */ } bump((n) => n + 1); }}>Keep {live.length === 1 ? "it" : "them"} answering</Button>
        </span>
      </div>,
    );
  }
  if (s.loadError) out.push(<div key="load" className="rounded-md border border-alarm-border bg-alarm-ground px-4 py-[9px] text-body text-alarm-banner-ink max-[820px]:px-3.5">Could not load Colluder's state: {s.loadError}. Retrying…</div>);
  return out.length ? <div className="flex flex-none flex-col gap-1.5 px-2 pt-2 max-[820px]:px-1.5">{out}</div> : null;
}

// Settings: a sticky index of sections on the left that doubles as a health summary (each entry
// carries its state in the line grammar), and the sections themselves, ordered by why you came:
// what to paste, who hears about hits, whether callbacks get through, how it looks, then the
// machinery underneath.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, RotateCcw, Trash2 } from "lucide-react";
import { useApp, clearAll, restoreClear } from "@/store";
import { AlertsSection, CheckSection, DisplaySection, Group, PayloadSection, Row, Section, THEME_NAMES, checkWord, fail } from "./SettingsParts";
import { LineForm } from "./bits";
import { plural, setupCmd } from "@/lib/format";
import { copy } from "@/lib/toast";
import { useDisplay } from "@/lib/display";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Status } from "@/lib/types";

function edgeRows(e: Status["edge"], app?: string): [string, ReactNode][] {
  if (!e || e.state === "absent") return [["State", <span className="text-smoke">Not set up yet. HTTP rules are saved, but interactsh still answers the internet. To go live: <code className="font-mono">{setupCmd(app)}</code>.</span>]];
  const word = { running: "answering", stale: "silent (no heartbeat for 20 s)", stopped: "stopped", unreadable: `status unreadable: ${e.detail ?? ""}`, absent: "" }[e.state];
  const rows: [string, ReactNode][] = [["State", <span className={e.state === "running" ? "text-bone" : "font-semibold text-bad"}>{word}</span>]];
  if (e.listen) rows.push(["Listening", <code className="font-mono text-bone">{[e.listen.http, e.listen.https, e.listen.dns && `${e.listen.dns} (DNS)`].filter(Boolean).join(" · ")}</code>]);
  // the default certificate is usually also in its domain's folder: list each one once
  const certs = [...new Map((e.cert?.all ?? []).map((c) => [`${c.names.join(" ")}|${c.notAfter}`, c])).values()];
  if (certs.length > 1) for (const c of certs) rows.push([`Certificate ${c.names[0] ?? ""}`, `valid until ${c.notAfter}`]);
  else if (e.cert?.notAfter) rows.push(["Certificate valid until", e.cert.notAfter]);
  if (e.startedAt) rows.push(["Since start", `${e.own ?? 0} answered for your probes · ${e.relayed ?? 0} passed to interactsh · ${e.errors ?? 0} refused or broken connections (scanners, mostly; details in journalctl -u colluder-edge)`]);
  return rows;
}

function SystemSection({ st }: { st: Status | null }) {
  const e = st?.engine;
  const rows: [string, ReactNode][] = e ? [
    ["State", <span className={e.state === "capturing" ? "text-bone" : "font-semibold text-bad"}>{e.detail.toLowerCase() === e.state ? e.detail : `${e.state}: ${e.detail}`}</span>],
    ...(e.fix ? [["Fix", <span className="flex items-start gap-2"><code className="font-mono break-all text-bone">{e.fix}</code><Button variant="ghost" size="icon-sm" aria-label="Copy fix" onClick={() => copy(e.fix!, "fix command")}><Copy /></Button></span>] as [string, ReactNode]] : []),
    ["Captures", "DNS, HTTP, HTTPS and SMTP; every hit shows up under Probes"],
    ["Service", <code className="font-mono text-bone">{e.unit}</code>],
    ["Client", e.version ?? "unknown"],
    ["Restarts", String(e.restarts)],
    ["Engine log", <code className="font-mono break-all text-bone">{st?.log.path}</code>],
  ] : [];
  return (
    <Section id="system" title="System" desc="The engine records callbacks; the edge answers them on this box's public address.">
      <Group title="Engine">{rows.map(([k, v]) => <Row dense key={k} label={k}>{v}</Row>)}</Group>
      <Group title="Edge">{edgeRows(st?.edge, st?.app).map(([k, v]) => <Row dense key={k} label={k}>{v}</Row>)}</Group>
    </Section>
  );
}

function DataSection({ count, st }: { count: number; st: Status | null }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Section id="data" title="Data" desc="Clearing hides hits from the dashboard without deleting anything; Restore brings them back.">
      <Group>
        <Row label="Hits shown">
          <span className="mr-auto text-bone">{plural(count, "interaction")}</span>
          {st?.lastClear && <Button variant="quiet" onClick={() => restoreClear().catch(fail)}><RotateCcw />Restore last clear ({plural(st.lastClear.count, "interaction")})</Button>}
          <Button variant="destructive" disabled={!count} onClick={() => setConfirm(true)}><Trash2 />Clear all hits…</Button>
        </Row>
      </Group>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="max-w-[460px] border-rule bg-soot-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Hide every interaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides {plural(count, "interaction")} from the dashboard. Nothing is deleted: they stay in the database and in the engine's log ({st?.log.path}), and Restore brings them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="quiet">Keep them</Button></AlertDialogCancel>
            <AlertDialogAction asChild><Button variant="destructive" onClick={() => clearAll().catch(fail)}>Clear all hits</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

const Kbd = ({ k }: { k: string }) => <kbd className="rounded-[3px] border border-rule bg-soot-2 px-1.5 font-mono text-label text-bone">{k}</kbd>;
function KeyboardSection() {
  return (
    <Section id="keyboard" title="Keyboard">
      <Group>
        {([[["p"], "Plant a probe (stays in the view you're in)"], [["/", "o"], "Find a probe: All probes in tabs, the filter with the list docked"], [["j", "k"], "Next / previous hit"], [["[", "]"], "Previous / next probe, wrapping round (tabs, or the list)"], [["n"], "Next probe with new hits"], [["1–8", "9"], "Probe tab by position, or the last"], [["\\"], "Switch between the probe tabs and the docked list"], [["Shift+T"], "Reopen the last closed tab"], [["F2"], "Rename the open probe"], [["←", "→"], "Move along the tab strip (when a tab has focus); Home and End go to the ends"], [["Delete"], "Close the focused tab"], [["Esc"], "Leave a field, close the plant form or a hit"]] as [string[], string][]).map(([keys, what]) => (
          <Row dense key={what} label={<span className="flex items-center gap-1.5">{keys.map((k, i) => <span key={k} className="contents">{i > 0 && <span className="text-ash">or</span>}<Kbd k={k} /></span>)}</span>}>
            <span className="text-bone">{what}</span>
          </Row>
        ))}
      </Group>
    </Section>
  );
}

// ---------- the index ----------
type Entry = { id: string; name: string; line?: "live" | "dash" | "down" | "off"; sub?: string; bad?: boolean };
function entries(st: Status | null, theme: string): Entry[] {
  const dc = st?.discord, e = st?.engine, w = checkWord(st);
  return [
    { id: "payloads", name: "Payloads", sub: st?.domains?.payload ?? st?.payload?.domain },
    { id: "alerts", name: "Alerts", line: !dc?.available ? undefined : dc.enabled ? "live" : "off", sub: !dc ? undefined : !dc.available ? "no webhook yet" : dc.enabled ? "on" : "off" },
    { id: "check", name: "Outside check", line: w.kind, sub: w.word, bad: w.kind === "down" },
    { id: "display", name: "Display", sub: theme },
    { id: "system", name: "System", line: !e ? undefined : e.state === "capturing" ? "live" : e.state === "down" || e.state === "missing" ? "down" : "dash", sub: e?.state, bad: e?.state === "down" || e?.state === "missing" || e?.state === "degraded" },
    { id: "data", name: "Data" },
    { id: "keyboard", name: "Keyboard" },
  ];
}

export function Settings() {
  const st = useApp((x) => x.status);
  const count = useApp((x) => x.list.length);
  const d = useDisplay();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("payloads");
  // a clicked entry stays chosen while the scroll it started settles (Data can't reach the top)
  const chosen = useRef<{ id: string; until: number } | null>(null);

  // the index follows the scroll: the last section whose top has passed a line near the top
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (chosen.current && Date.now() < chosen.current.until) return setActive(chosen.current.id);
        const secs = [...el.querySelectorAll<HTMLElement>("[data-section]")];
        const top = el.getBoundingClientRect().top + 96;
        let cur = secs[0]?.dataset.section ?? "payloads";
        for (const s of secs) if (s.getBoundingClientRect().top <= top) cur = s.dataset.section!;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) cur = secs.at(-1)?.dataset.section ?? cur;
        setActive(cur);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  const go = (id: string) => {
    document.getElementById(`set-${id}`)?.scrollIntoView({ block: "start", behavior: d.motion === "full" && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
    chosen.current = { id, until: Date.now() + 1200 };
    setActive(id);
  };
  const list = entries(st, THEME_NAMES[d.theme]);

  return (
    <div ref={scroller} className="min-h-0 overflow-auto px-8 pt-7 pb-24 max-[820px]:px-4 max-[820px]:pb-10">
      <div className="grid max-w-[980px] grid-cols-[176px_minmax(0,1fr)] gap-x-12 max-[1000px]:grid-cols-1">
        <header className="col-span-full mb-7">
          <h1 className="text-headline font-bold text-bone">Settings</h1>
          <p className="mt-0.5 text-smoke">Colluder · Your insider on the wire.</p>
        </header>

        <nav aria-label="Settings sections" className="sticky top-6 self-start max-[1000px]:static max-[1000px]:mb-8">
          <ul className="space-y-0.5 max-[1000px]:flex max-[1000px]:flex-wrap max-[1000px]:gap-1.5 max-[1000px]:space-y-0">
            {list.map((x) => {
              const on = active === x.id;
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => go(x.id)} aria-current={on ? "location" : undefined}
                    className={cn("flex w-full flex-col items-start rounded-[3px] px-2.5 py-1.5 text-left transition-colors max-[1000px]:w-auto max-[1000px]:border max-[1000px]:border-rule",
                      on ? "bg-soot-2 text-bone" : "text-smoke hover:bg-hover hover:text-bone")}>
                    <span className={on ? "font-semibold" : ""}>{x.name}</span>
                    {x.sub && (
                      <span className={cn("flex max-w-full items-center gap-1.5 text-label max-[1000px]:hidden", x.bad ? "text-bad" : "text-ash")}>
                        {x.line && <LineForm kind={x.line} signal={x.id === "system" ? "beat" : x.id === "check" ? "echo" : "sparse"} className={cn("w-4", x.bad ? "text-bad" : x.line === "off" ? "text-ash" : "text-smoke")} />}
                        <span className="truncate">{x.sub}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 max-w-[720px]">
          <PayloadSection st={st} />
          <AlertsSection st={st} />
          <CheckSection st={st} />
          <DisplaySection />
          <SystemSection st={st} />
          <DataSection count={count} st={st} />
          <KeyboardSection />
        </div>
      </div>
    </div>
  );
}

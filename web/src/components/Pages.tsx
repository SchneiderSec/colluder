// Settings: a sticky index of sections on the left that doubles as a health summary (each entry
// carries its state in the line grammar), and the sections themselves, ordered by why you came:
// what to paste, who hears about hits, whether callbacks get through, how it looks, then the
// machinery underneath.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useApp, clearAll, restoreClear, setMine } from "@/store";
import { AlertsSection, CheckSection, DisplaySection, Group, PayloadSection, Row, Section, THEME_NAMES, checkWord, fail } from "./SettingsParts";
import { LineForm } from "./bits";
import { Keys } from "./Shortcuts";
import { SHORTCUTS } from "@/lib/shortcuts";
import { plural, setupCmd } from "@/lib/format";
import { copy, toast } from "@/lib/toast";
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

// Self-test addresses: this box (from config, read only) and the ones you marked as yours, so a stale one
// (a VPN or home IP that rotated) can go, and a new one can be added before testing from it
function SelfTests({ st }: { st: Status | null }) {
  const [ip, setIp] = useState("");
  const [busy, setBusy] = useState(false);
  const mark = (v: string, mine: boolean) => {
    setBusy(true);
    return setMine(v, mine).then(() => { toast(mine ? `${v} is marked as yours: its hits are self-tests now.` : `${v} is no longer marked as yours.`); if (mine) setIp(""); }, fail).finally(() => setBusy(false));
  };
  const box = st?.selfIps ?? [], mine = st?.mineIps ?? [];
  return (
    <Group title="Self-test addresses" note="Hits from these are self-tests: left out of the report's first request, reach, and the chime. Mark your browser's or proxy's public address, as the edge sees it (a hit's Source).">
      <Row dense label="This box">{box.length ? box.map((x) => <code key={x} className="font-mono text-bone">{x}</code>) : <span className="text-ash">none configured</span>}</Row>
      <Row dense label="Yours">
        {mine.length ? mine.map((x) => (
          <span key={x} className="flex items-center gap-0.5"><code className="font-mono text-bone">{x}</code>
            <Button variant="ghost" size="icon-sm" aria-label={`Unmark ${x}`} title="Its hits count as targets again" disabled={busy} onClick={() => void mark(x, false)}><X /></Button></span>
        )) : <span className="text-ash">none yet</span>}
      </Row>
      <Row dense label="Add">
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (ip.trim()) void mark(ip.trim(), true); }}>
          <label className="flex h-7 w-[220px] items-center rounded-[3px] border border-rule bg-well px-2 focus-within:border-smoke">
            <input aria-label="IP address to mark as yours" value={ip} spellCheck={false} placeholder="203.0.113.7 or 2001:db8::7" onChange={(e) => setIp(e.target.value)}
              className="min-w-0 flex-1 bg-transparent font-mono text-body text-bone outline-none placeholder:font-sans placeholder:text-ash" />
          </label>
          <Button type="submit" variant="quiet" size="sm" disabled={busy || !ip.trim()}><Plus />Mark as mine</Button>
        </form>
      </Row>
    </Group>
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
      <SelfTests st={st} />
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

function KeyboardSection() {
  return (
    <Section id="keyboard" title="Keyboard" desc="? shows the ones for the view you're in.">
      {SHORTCUTS.map((g) => (
        <Group key={g.title} title={g.title}>
          {g.keys.map(([keys, what]) => <Row dense key={what} label={<Keys keys={keys} />}><span className="text-bone">{what}</span></Row>)}
        </Group>
      ))}
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

export function Settings({ section }: { section?: string | null }) {
  const st = useApp((x) => x.status);
  // every stored hit the clear would hide, not the live list's (capped) length
  const count = useApp((x) => [...x.probes.values()].reduce((n, p) => n + p.hits, 0) + (x.untagged?.hits ?? 0));
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

  const go = (id: string, smooth = true) => {
    const el = document.getElementById(`set-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: smooth && d.motion === "full" && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
    chosen.current = { id, until: Date.now() + 1200 };
    setActive(id);
    // the section is in the URL, so a reload or a shared link lands on it (silent: no route change)
    if (location.hash !== `#settings/${id}`) history.replaceState(null, "", `#settings/${id}`);
  };
  // #settings/<section> (the status bar's failing check, the list's alerts bell, a shared link)
  // On mount from the prop; after that from each hashchange (the index writes the hash silently, so a
  // link to the section the route last named still scrolls)
  useEffect(() => {
    if (section) requestAnimationFrame(() => go(section, false));
    const onHash = () => { const m = /^#settings\/([a-z]+)/.exec(location.hash); if (m) go(m[1], false); };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = entries(st, THEME_NAMES[d.theme]);

  // one strip like the Payload kit: a header band, the section index as its own column, the sections scrolling
  // beside it. "Why you came" (payloads, alerts, the outside check) sits above a Rule, the machinery below it.
  return (
    <div className="m-2 grid min-h-0 flex-1 grid-cols-[208px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-rule bg-soot max-[1000px]:grid-cols-1 max-[1000px]:grid-rows-[auto_auto_minmax(0,1fr)] max-[820px]:m-1.5 max-[820px]:block">
      <header className="col-span-full flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule px-8 py-4 max-[820px]:px-4">
        <h1 className="text-headline font-bold text-bone">Settings</h1>
        <p className="text-body text-ash">Colluder · Your insider on the wire.</p>
      </header>

      <nav aria-label="Settings sections" className="min-h-0 overflow-auto border-r border-rule py-3 max-[1000px]:border-r-0 max-[1000px]:border-b max-[1000px]:px-4 max-[1000px]:py-2.5">
        <ul className="max-[1000px]:flex max-[1000px]:flex-wrap max-[1000px]:gap-1.5">
          {list.map((x) => {
            const on = active === x.id;
            return (
              <Fragment key={x.id}>
                <li>
                  <button type="button" onClick={() => go(x.id)} aria-current={on ? "location" : undefined}
                    className={cn("flex min-h-[46px] w-full flex-col items-start justify-center px-8 py-1.5 text-left transition-colors",
                      "max-[1000px]:min-h-0 max-[1000px]:w-auto max-[1000px]:rounded-[3px] max-[1000px]:border max-[1000px]:border-rule max-[1000px]:px-2.5 max-[1000px]:py-1",
                      on ? "bg-soot-2 text-bone" : "text-smoke hover:bg-hover hover:text-bone")}>
                    <span className={cn("text-title", on && "font-semibold")}>{x.name}</span>
                    {x.sub && (
                      <span className={cn("flex max-w-full items-center gap-1.5 text-label max-[1000px]:hidden", x.bad ? "text-bad" : "text-ash")}>
                        {x.line && <LineForm kind={x.line} signal={x.id === "system" ? "beat" : x.id === "check" ? "echo" : "sparse"} className={cn("w-4", x.bad ? "text-bad" : x.line === "off" ? "text-ash" : "text-smoke")} />}
                        <span className="truncate">{x.sub}</span>
                      </span>
                    )}
                  </button>
                </li>
                {x.id === "check" && <li aria-hidden className="mx-8 my-2 border-t border-rule max-[1000px]:hidden" />}
              </Fragment>
            );
          })}
        </ul>
      </nav>

      <div ref={scroller} className="min-h-0 overflow-auto px-8 pt-6 pb-24 max-[820px]:px-4 max-[820px]:pb-10">
        <div className="max-w-[720px]">
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

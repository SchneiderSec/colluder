import { useState, type ReactNode } from "react";
import { Bell, Copy, RotateCcw, Trash2 } from "lucide-react";
import { useApp, clearAll, restoreClear, setDiscord, runCheck } from "@/store";
import { LineForm } from "./bits";
import { ago, isoMs, plural } from "@/lib/format";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { applyTypeScale, readTypeScale, type TypeScale } from "@/lib/typeScale";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Status } from "@/lib/types";

const Page = ({ children }: { children: ReactNode }) => <div className="min-h-0 overflow-auto px-8 py-7 max-[820px]:px-4"><div className="max-w-[800px]">{children}</div></div>;
const H = ({ children }: { children: ReactNode }) => <h2 className="mt-6 mb-2 text-title font-[650]">{children}</h2>;

function edgeRows(e: Status["edge"]): [string, ReactNode][] {
  if (!e || e.state === "absent") return [["State", <span className="text-smoke">Not installed yet (before the cutover). HTTP rules are saved, but interactsh still answers the internet. To go live: <code className="font-mono">sudo ~/work/tools/oob-dashboard/deploy/cutover-phase2.sh</code> (see PHASE2.md).</span>]];
  const word = { running: "answering", stale: "silent (no heartbeat for 20 s)", stopped: "stopped", unreadable: `status unreadable: ${e.detail ?? ""}`, absent: "" }[e.state];
  const rows: [string, ReactNode][] = [["State", <span className={e.state === "running" ? "" : "text-bad"}>{word}</span>]];
  if (e.listen) rows.push(["Listening", <code className="font-mono">{[e.listen.http, e.listen.https, e.listen.dns && `${e.listen.dns} (DNS)`].filter(Boolean).join(" · ")}</code>]);
  if (e.cert?.all && e.cert.all.length > 1) for (const c of e.cert.all) rows.push([`Certificate ${c.names[0] ?? ""}`, `valid until ${c.notAfter}`]);
  else if (e.cert?.notAfter) rows.push(["Certificate valid until", e.cert.notAfter]);
  if (e.startedAt) rows.push(["Since start", `${e.own ?? 0} answered for your probes · ${e.relayed ?? 0} passed to interactsh · ${e.errors ?? 0} refused or broken connections (scanners, mostly; details in journalctl -u colluder-edge)`]);
  return rows;
}

// the outside check (lib/selfcheck.mjs), one row per step of the path it proved or didn't
function checkRows(c: Status["check"]): [string, ReactNode][] {
  if (!c?.active) return [["State", <span className="text-smoke">Off until the edge fronts DNS (deploy/dns-front.sh): it checks the short payload host.</span>]];
  const l = c.last;
  if (!l) return [["State", <span className="text-smoke">{c.running ? "Running…" : "Not run yet: the first check runs about 30 s after Colluder starts."}</span>]];
  const rows: [string, ReactNode][] = [
    ["Last run", <span>{l.finishedAt.replace("T", " ").slice(0, 19)} UTC <span className="text-smoke">· {ago(Date.now() - isoMs(l.finishedAt))} · every {c.everyMinutes} min, on <code className="font-mono">{l.host}</code></span></span>],
    ...l.steps.map((x): [string, ReactNode] => [x.label, <span><b className={x.ok ? "font-[650]" : "font-[650] text-bad"}>{x.ok ? "Passed" : "Failed"}</b> <span className={x.ok ? "text-smoke" : ""}>· {x.detail}{x.retried ? " (on the retry a minute later)" : ""}</span></span>]),
  ];
  // each served domain's certificate and registration (one domain: no name needed)
  const per = c.domains?.length ? c.domains : [{ domain: "", primary: true, last: l }];
  for (const d of per) {
    const r = d.last, at = per.length > 1 ? ` · ${d.domain}${d.primary ? " (payloads)" : ""}` : "";
    if (!r) { rows.push([`Certificate${at}`, <span className="text-smoke">Not checked yet</span>]); continue; }
    if (r.cert) rows.push([`Certificate${at}`, <span className={r.cert.days < 21 ? "text-bad" : ""}>{r.cert.days < 0 ? "expired" : `${r.cert.days} days left`} <span className="text-smoke">· until {r.cert.validTo.slice(0, 10)}</span></span>]);
    if (r.domain) rows.push([`Registration${at}`, r.domain.expiresAt
      ? <span className={(r.domain.days ?? 99) < 30 ? "text-bad" : ""}>{(r.domain.days ?? 0) < 0 ? "expired" : `${r.domain.days} days left`} <span className="text-smoke">· until {r.domain.expiresAt.slice(0, 10)}, from RDAP once a day</span></span>
      : <span className="text-smoke">Couldn't read it from RDAP ({r.domain.error}); tried again next run</span>]);
  }
  return rows;
}

export function Settings() {
  const s = useApp((x) => x);
  const [confirm, setConfirm] = useState(false);
  const [scale, setScale] = useState<TypeScale>(readTypeScale);
  const st = s.status;
  const e = st?.engine;
  const rows: [string, ReactNode][] = e ? [
    ["State", e.detail.toLowerCase() === e.state ? e.detail : `${e.state}: ${e.detail}`],
    ...(e.fix ? [["Fix", <span className="flex items-start gap-2"><code className="font-mono break-all">{e.fix}</code><Button variant="ghost" size="icon-sm" aria-label="Copy fix" onClick={() => copy(e.fix!, "fix command")}><Copy /></Button></span>] as [string, ReactNode]] : []),
    ["Service", <code className="font-mono">{e.unit}</code>],
    ["Client", e.version ?? "unknown"],
    ["Captures", "DNS, HTTP, HTTPS and SMTP; every hit shows up under Probes"],
    ["Payload", <code className="font-mono break-all">{st?.payload?.host ?? "none yet"}</code>],
    ...(st?.payload ? [["Short id", st.payload.short
      ? <span><code className="font-mono">{st.payload.shortId}</code> <span className="text-smoke">· in use; the edge records its DNS</span></span>
      : <span><code className="font-mono">{st.payload.shortId}</code> <span className="text-smoke">· waiting for the edge's DNS front (deploy/dns-front.sh); payloads use the long id until then</span></span>] as [string, ReactNode]] : []),
    ...(st?.payload?.short ? [["Long payload", <span><code className="font-mono break-all">{st.payload.longHost}</code> <span className="text-smoke">· for SMTP, and old payloads</span></span>] as [string, ReactNode]] : []),
    ["Correlation id", <code className="font-mono">{st?.payload?.correlationId ?? "none"}</code>],
    ["Engine log", <code className="font-mono break-all">{st?.log.path}</code>],
    ["Restarts", String(e.restarts)],
  ] : [];
  return (
    <Page>
      <h1 className="text-headline font-bold">Settings</h1>
      <p className="mt-1 text-smoke">Colluder · Your insider on the wire.</p>

      <H>Engine</H>
      <dl className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body max-[820px]:grid-cols-1">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-smoke">{k}</dt><dd>{v}</dd></div>)}
      </dl>

      <H>Edge</H>
      <dl className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body max-[820px]:grid-cols-1">
        {edgeRows(st?.edge).map(([k, v]) => <div key={k} className="contents"><dt className="text-smoke">{k}</dt><dd>{v}</dd></div>)}
      </dl>

      <H>Outside check</H>
      <p className="mb-2 max-w-[68ch] text-smoke">The edge's heartbeat says it's running, not that callbacks get through. Every few minutes Colluder asks Cloudflare and Google to resolve a fresh name on your short host and requests it over HTTP and HTTPS, then confirms the edge recorded each one. Its traffic never shows up as hits. The web steps run from this box, so they cover the edge and the certificate, not the firewall in front of them.</p>
      <dl className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body max-[820px]:grid-cols-1">
        {checkRows(st?.check).map(([k, v]) => <div key={k} className="contents"><dt className="text-smoke">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {st?.check?.active && (
        <Button variant="quiet" className="mt-3" disabled={st.check.running} onClick={() => runCheck().then((r) => toast(r.state === "failing" ? "Check failed: see the rows above" : "Check passed")).catch((x) => toast((x as Error).message, true))}>
          {st.check.running ? "Checking…" : "Check now"}
        </Button>
      )}

      <H>Display</H>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-rule py-3 text-smoke">
        Text size
        <ToggleGroup type="single" value={scale} onValueChange={(v) => { if (!v) return; setScale(v as TypeScale); applyTypeScale(v as TypeScale); }} aria-label="Text size" className="overflow-hidden rounded-[3px] border border-rule">
          {([["compact", "Compact"], ["comfortable", "Comfortable"]] as [TypeScale, string][]).map(([v, l]) => (
            <ToggleGroupItem key={v} value={v} className="h-7 rounded-none border-l border-rule px-3 text-body text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone">{l}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="text-ash">Comfortable sets everything one step larger (12.5px text becomes 13.5px). This browser only.</span>
      </div>

      <H>Alerts</H>
      <div className="flex items-center gap-2.5 border-t border-rule py-3 text-smoke">
        <Bell className="size-3.5" strokeWidth={1.5} />Discord alerts
        {!st?.discord.available ? <span className="text-ash">Not configured: set DISCORD_WEBHOOK_URL in ~/.config/colluder/colluder.env and restart colluder.service.</span> : (
          <>
            <Switch checked={st.discord.enabled} aria-label="Discord alerts" onCheckedChange={(v) => setDiscord(v).catch((x) => toast((x as Error).message, true))} />
            <LineForm kind={st.discord.enabled ? "live" : "off"} signal="sparse" className={st.discord.enabled ? "w-4 text-bone" : "w-4 text-ash"} />
            <b className="font-semibold text-bone">{st.discord.enabled ? "On" : "Off"}</b><span className="text-ash">per probe: the first hit, the first web hit, new sources and late hits; the rest in a roll-up each minute. Mute a probe with the bell in its header.</span>
          </>
        )}
      </div>

      <H>Data</H>
      <p className="text-body text-smoke">{plural(s.list.length, "interaction")} shown. Clearing hides them without deleting anything.</p>
      <div className="mt-2.5 flex gap-2">
        <Button variant="destructive" disabled={!s.list.length} onClick={() => setConfirm(true)}><Trash2 />Clear all hits…</Button>
        {st?.lastClear && (
          <Button variant="quiet" onClick={() => restoreClear().catch((x) => toast((x as Error).message, true))}><RotateCcw />Restore last clear ({plural(st.lastClear.count, "interaction")})</Button>
        )}
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="max-w-[460px] border-rule bg-soot-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Hide every interaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides {plural(s.list.length, "interaction")} from the dashboard. Nothing is deleted: they stay in the database and in the engine's log ({st?.log.path}), and Restore brings them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="quiet">Keep them</Button></AlertDialogCancel>
            <AlertDialogAction asChild><Button variant="destructive" onClick={() => clearAll().catch((x) => toast((x as Error).message, true))}>Clear all hits</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <H>Keyboard</H>
      <ul className="space-y-1.5 text-body text-smoke">
        {[[["p", "/"], "plant a probe"], [["j", "k"], "next / previous hit"], [["Esc"], "leave a field"]].map(([keys, what]) => (
          <li key={what as string} className="flex items-center gap-1.5">
            {(keys as string[]).map((k, i) => <span key={k} className="contents">{i > 0 && <span>or</span>}<kbd className="rounded-[3px] border border-rule bg-soot-2 px-1.5 font-mono text-label text-bone">{k}</kbd></span>)}
            <span className="ml-1">{what as string}</span>
          </li>
        ))}
      </ul>
    </Page>
  );
}

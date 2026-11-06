import { useState, type ReactNode } from "react";
import { Bell, Copy, RotateCcw, Trash2 } from "lucide-react";
import { useApp, clearAll, restoreClear, setDiscord } from "@/store";
import { LineForm } from "./bits";
import { plural } from "@/lib/format";
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
  if (e.listen) rows.push(["Listening", <code className="font-mono">{[e.listen.http, e.listen.https].filter(Boolean).join(" · ")}</code>]);
  if (e.cert?.notAfter) rows.push(["Certificate valid until", e.cert.notAfter]);
  if (e.startedAt) rows.push(["Since start", `${e.own ?? 0} answered for your probes · ${e.relayed ?? 0} passed to interactsh · ${e.errors ?? 0} refused or broken connections (scanners, mostly; details in journalctl -u colluder-edge)`]);
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

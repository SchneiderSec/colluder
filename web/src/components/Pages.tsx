import { useState, type ReactNode } from "react";
import { Bell, Copy, RotateCcw, Trash2 } from "lucide-react";
import { useApp, clearAll, restoreClear, setDiscord } from "@/store";
import { plural } from "@/lib/format";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TOOLS } from "./Shell";
import type { Status } from "@/lib/types";

export const PLANNED: Record<string, [string, string]> = {
  kit: ["Generate payloads tied to a probe: URL and IP obfuscation for filter bypass, a cloud metadata catalog (AWS, GCP, Azure, Alibaba, Oracle, Kubernetes), Gopher payloads, XXE, blind-XSS and JNDI templates.", "Generation only; no server changes needed. A good first phase-2 tool."],
  listeners: ["Status and settings for SMTP, LDAP/JNDI, FTP, SMB/NTLM and TLS/SNI capture.", "SMTP is already captured by the engine and shows up in Probes. The others need interactsh flags or Colluder's own responder."],
};

const Page = ({ children }: { children: ReactNode }) => <div className="min-h-0 overflow-auto px-8 py-7 max-[820px]:px-4"><div className="max-w-[800px]">{children}</div></div>;
const H = ({ children }: { children: ReactNode }) => <h2 className="mt-6 mb-2 text-[13.5px] font-[650]">{children}</h2>;

export function Planned({ view }: { view: string }) {
  const t = TOOLS.find((x) => x.view === view)!;
  const [what, note] = PLANNED[view];
  return (
    <Page>
      <h1 className="flex items-center gap-2.5 text-[17px] font-bold"><t.icon className="size-5" strokeWidth={1.5} />{t.label}</h1>
      <p className="mt-1 text-[11px] font-semibold tracking-[.06em] text-ash uppercase">Planned</p>
      <p className="mt-4 max-w-[64ch] text-[13.5px] leading-[21px]">{what}</p>
      <p className="mt-3 max-w-[64ch] text-[12.5px] leading-[19px] text-smoke">{note}</p>
      <p className="mt-5 text-[12.5px] text-ash">The research and build order live in tools/oob-dashboard/ROADMAP.md.</p>
    </Page>
  );
}

function edgeRows(e: Status["edge"]): [string, ReactNode][] {
  if (!e || e.state === "absent") return [["State", <span className="text-smoke">Not installed yet (before the cutover). HTTP rules are saved, but interactsh still answers the internet. To go live: <code className="font-mono">sudo ~/work/tools/oob-dashboard/deploy/cutover-phase2.sh</code> (see PHASE2.md).</span>]];
  const word = { running: "answering", stale: "silent (no heartbeat for 20 s)", stopped: "stopped", unreadable: `status unreadable: ${e.detail ?? ""}`, absent: "" }[e.state];
  const rows: [string, ReactNode][] = [["State", <span className={e.state === "running" ? "" : "text-bad"}>{word}</span>]];
  if (e.listen) rows.push(["Listening", <code className="font-mono">{[e.listen.http, e.listen.https].filter(Boolean).join(" · ")}</code>]);
  if (e.cert?.notAfter) rows.push(["Certificate valid until", e.cert.notAfter]);
  if (e.startedAt) rows.push(["Since start", `${e.own ?? 0} answered for your probes · ${e.relayed ?? 0} passed to interactsh · ${e.errors ?? 0} errors`]);
  return rows;
}

export function Settings() {
  const s = useApp((x) => x);
  const [confirm, setConfirm] = useState(false);
  const st = s.status;
  const e = st?.engine;
  const rows: [string, ReactNode][] = e ? [
    ["State", e.detail.toLowerCase() === e.state ? e.detail : `${e.state}: ${e.detail}`],
    ...(e.fix ? [["Fix", <span className="flex items-start gap-2"><code className="font-mono break-all">{e.fix}</code><Button variant="ghost" size="icon-sm" aria-label="Copy fix" onClick={() => copy(e.fix!, "fix command")}><Copy /></Button></span>] as [string, ReactNode]] : []),
    ["Service", <code className="font-mono">{e.unit}</code>],
    ["Client", e.version ?? "unknown"],
    ["Payload", <code className="font-mono break-all">{st?.payload?.host ?? "none yet"}</code>],
    ["Correlation id", <code className="font-mono">{st?.payload?.correlationId ?? "none"}</code>],
    ["Engine log", <code className="font-mono break-all">{st?.log.path}</code>],
    ["Restarts", String(e.restarts)],
  ] : [];
  return (
    <Page>
      <h1 className="text-[17px] font-bold">Settings</h1>
      <p className="mt-1 text-smoke">Colluder · Your insider on the wire.</p>

      <H>Engine</H>
      <dl className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px] max-[820px]:grid-cols-1">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-smoke">{k}</dt><dd>{v}</dd></div>)}
      </dl>

      <H>Edge</H>
      <dl className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px] max-[820px]:grid-cols-1">
        {edgeRows(st?.edge).map(([k, v]) => <div key={k} className="contents"><dt className="text-smoke">{k}</dt><dd>{v}</dd></div>)}
      </dl>

      <H>Alerts</H>
      <div className="flex items-center gap-2.5 border-t border-rule py-3 text-smoke">
        <Bell className="size-3.5" strokeWidth={1.5} />Discord alerts
        {!st?.discord.available ? <span className="text-ash">Not configured: set DISCORD_WEBHOOK_URL in ~/.config/colluder/colluder.env and restart colluder.service.</span> : (
          <>
            <Switch checked={st.discord.enabled} aria-label="Discord alerts" onCheckedChange={(v) => setDiscord(v).catch((x) => toast((x as Error).message, true))} />
            <b className="font-semibold text-bone">{st.discord.enabled ? "On" : "Off"}</b><span className="text-ash">first hit per probe, then a 60 s roll-up</span>
          </>
        )}
      </div>

      <H>Data</H>
      <p className="text-[12.5px] text-smoke">{plural(s.list.length, "interaction")} shown. Clearing hides them without deleting anything.</p>
      <div className="mt-2.5 flex gap-2">
        <Button variant="destructive" disabled={!s.list.length} onClick={() => setConfirm(true)}><Trash2 />Take out the trash…</Button>
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
            <AlertDialogAction asChild><Button variant="destructive" onClick={() => clearAll().catch((x) => toast((x as Error).message, true))}>Take out the trash</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <H>Keyboard</H>
      <ul className="space-y-1.5 text-[12.5px] text-smoke">
        {[[["p", "/"], "plant a probe"], [["j", "k"], "next / previous hit"], [["Esc"], "leave a field"]].map(([keys, what]) => (
          <li key={what as string} className="flex items-center gap-1.5">
            {(keys as string[]).map((k, i) => <span key={k} className="contents">{i > 0 && <span>or</span>}<kbd className="rounded-[3px] border border-rule bg-soot-2 px-1.5 font-mono text-[11px] text-bone">{k}</kbd></span>)}
            <span className="ml-1">{what as string}</span>
          </li>
        ))}
      </ul>
    </Page>
  );
}

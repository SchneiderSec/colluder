// The parts of Settings you can change: the payload domain, the outside check's interval, Discord, and
// the display. Server settings are saved to colluder.env / engine.yaml (lib/settings.mjs); display
// settings stay in this browser (lib/display.ts).
import { useState, type ReactNode } from "react";
import { Copy, Play, Send } from "lucide-react";
import { saveSettings, setDiscord, testDiscord } from "@/store";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LineForm, TypeChip } from "./bits";
import { applyTypeScale, readTypeScale, type TypeScale } from "@/lib/typeScale";
import { setDisplay, useDisplay, type Display } from "@/lib/display";
import { chime } from "@/lib/chime";
import type { AlertKind, Status } from "@/lib/types";

const fail = (x: unknown) => toast((x as Error).message, true);
const DAY = 86400e3;
// Palo Alto's URL filtering counts a domain as newly registered for 32 days; others are shorter
export const YOUNG_DAYS = 32;

export function Seg<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <ToggleGroup type="single" value={value} disabled={disabled} onValueChange={(v) => { if (v) onChange(v as T); }} aria-label={label} className="overflow-hidden rounded-[3px] border border-rule">
      {options.map(([v, l]) => (
        <ToggleGroupItem key={v} value={v} className="h-7 rounded-none border-l border-rule px-3 text-body text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone">{l}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// one setting: its name on the left, the control and what it does on the right
export function Pref({ label, children, hint, id }: { label: string; children: ReactNode; hint?: ReactNode; id?: string }) {
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-x-4 border-t border-rule py-3 max-[820px]:grid-cols-1 max-[820px]:gap-y-2">
      <div id={id} className="pt-1 text-smoke">{label}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">{children}</div>
        {hint && <div className="mt-1.5 max-w-[68ch] text-ash">{hint}</div>}
      </div>
    </div>
  );
}

const daysSince = (iso?: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : null);
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ---------- domains ----------
export function DomainSection({ st }: { st: Status | null }) {
  const [pick, setPick] = useState<string | null>(null);
  const d = st?.domains;
  if (!d) return null;
  const per = st?.check?.domains ?? [];
  const last = (dom: string) => per.find((x) => x.domain === dom)?.last ?? null;
  const age = (dom: string) => daysSince(last(dom)?.domain?.registeredAt);
  const want = `https://${d.payload}`;
  const nucleiOk = d.nuclei?.replace(/\/+$/, "").toLowerCase() === want || d.nuclei?.toLowerCase() === d.payload;
  const young = pick ? age(pick) : null;
  const go = () => {
    const to = pick!;
    setPick(null);
    saveSettings({ payloadDomain: to }).then(() => toast(`Switching payloads to ${to}: the engine and Colluder restart, back in about 10 s`)).catch(fail);
  };
  return (
    <>
      <p className="mb-2 max-w-[68ch] text-smoke">Every domain here answers and records: payloads already planted keep working whichever one new payloads use. Switching restarts the engine on the new domain (its long payload changes; the short id stays) and Colluder with it.</p>
      {d.served.map((dom) => {
        const l = last(dom), a = age(dom), cur = dom === d.payload;
        return (
          <Pref key={dom} label={cur ? "Payloads use" : "Also served"}>
            <code className="font-mono text-bone">{dom}</code>
            <span className="text-ash">
              {[a != null && `registered ${a === 0 ? "today" : `${a} ${a === 1 ? "day" : "days"} ago`}`,
                l?.domain?.days != null && `expires in ${l.domain.days} days`,
                l && (l.state === "failing" ? "outside check failing" : "outside check passing")].filter(Boolean).join(" · ")}
            </span>
            {!cur && <Button variant="quiet" size="sm" disabled={!!d.switching} onClick={() => setPick(dom)}>{d.switching === dom ? "Switching…" : "Use for payloads…"}</Button>}
            {!cur && a != null && a < YOUNG_DAYS && <span className="basis-full text-caution-ink">Young: web filters that block newly registered domains may refuse it until {dateOf(Date.parse(l!.domain!.registeredAt!) + YOUNG_DAYS * DAY)}.</span>}
          </Pref>
        );
      })}
      <Pref label="Nuclei" hint={<>Nuclei runs its own interactsh client, so it doesn't follow this setting. It reads <code className="font-mono">interactsh_server</code> from <code className="font-mono">~/.config/user/config.yaml</code>{nucleiOk ? "." : "; change it to the line above."}</>}>
        {nucleiOk
          ? <span><code className="font-mono text-bone">{d.nuclei}</code> <span className="text-ash">· matches</span></span>
          : <>
            <code className="font-mono text-bone">interactsh_server: {want}</code>
            <Button variant="ghost" size="icon-sm" aria-label="Copy the nuclei line" onClick={() => copy(`interactsh_server: ${want}`, "nuclei line")}><Copy /></Button>
            <span className="text-caution-ink">{d.nuclei ? `now ${d.nuclei}` : "not set in user's config"}</span>
          </>}
      </Pref>
      <AlertDialog open={!!pick} onOpenChange={(v) => { if (!v) setPick(null); }}>
        <AlertDialogContent className="max-w-[500px] border-rule bg-soot-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch payloads to {pick}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>New payloads are built on {pick}. Payloads already planted on {d.payload} keep recording for as long as it's served, and the outside check keeps proving both.</p>
                <p>The engine restarts and gets a new long payload; the short payload keeps its id. Colluder restarts too and this page reconnects in about 10 seconds.</p>
                {young != null && young < YOUNG_DAYS && <p className="text-caution-ink">{pick} is {young === 0 ? "less than a day" : `${young} ${young === 1 ? "day" : "days"}`} old. Corporate web filters often block domains younger than about {YOUNG_DAYS} days, so targets behind one may not call back yet.</p>}
                <p>Nuclei isn't changed: set its <code className="font-mono">interactsh_server</code> afterwards (shown here once you switch).</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="quiet">Keep {d.payload}</Button></AlertDialogCancel>
            <AlertDialogAction asChild><Button onClick={go}>Switch to {pick}</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------- the outside check's interval ----------
export function CheckInterval({ st }: { st: Status | null }) {
  const c = st?.check;
  if (!c) return null;
  const cur = c.off ? "0" : String(c.everyMinutes);
  const opts: [string, string][] = [["5", "5 min"], ["10", "10 min"], ["30", "30 min"], ["60", "1 hour"], ["0", "Off"]];
  if (!opts.some(([v]) => v === cur)) opts.splice(-1, 0, [cur, `${cur} min`]);
  return (
    <Pref label="Runs" hint={c.off ? <span className="text-caution-ink">Off: nothing tells you if callbacks stop reaching Colluder, and a quiet probe reads the same as a dead path. Check now still works.</span> : "Each run makes two lookups and two requests per served domain; a step that fails is tried once more a minute later."}>
      <Seg label="How often the outside check runs" value={cur} options={opts} onChange={(v) => saveSettings({ checkMinutes: Number(v) }).then(() => toast(v === "0" ? "Outside check off" : `Outside check every ${v} min`)).catch(fail)} />
    </Pref>
  );
}

// ---------- Discord ----------
const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,120}$/;
const KINDS: [AlertKind, string, string][] = [
  ["first", "First hit", "A probe's first hit, or its first after 30 quiet minutes."],
  ["escalation", "First web hit", "The first HTTP, HTTPS or SMTP hit on a probe that has only had DNS so far."],
  ["source", "New source", "A web hit on a probe from an address it hasn't heard from before."],
  ["late", "Late hits", "Hits on a retired probe, at most one post every 10 minutes."],
  ["rollup", "Roll-up", "Everything else, counted once a minute per probe. Alerts switched off above are counted here."],
  ["check", "Outside check", "When it starts failing, passes again, or warns about a certificate or domain."],
];

export function DiscordSection({ st }: { st: Status | null }) {
  const dc = st?.discord;
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!dc) return null;
  const bad = url.trim() !== "" && !WEBHOOK_RE.test(url.trim());
  const save = () => {
    setBusy(true);
    saveSettings({ webhookUrl: url.trim() })
      .then(() => { setEditing(false); setUrl(""); toast("Webhook saved. Send a test to see it arrive."); })
      .catch(fail).finally(() => setBusy(false));
  };
  const test = () => { setBusy(true); testDiscord().then(() => toast("Test sent: check the channel")).catch(fail).finally(() => setBusy(false)); };
  const showForm = !dc.available || editing;
  return (
    <>
      <Pref label="Webhook" id="pref-webhook" hint={showForm
        ? <>In Discord: the channel's settings, Integrations, Webhooks, New Webhook, Copy Webhook URL. It's saved to <code className="font-mono">~/.config/colluder/colluder.env</code> and never shown here again in full.</>
        : "Only the last four characters are shown. Replace it to move alerts to another channel."}>
        {showForm ? (
          <form className="flex w-full max-w-[560px] items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!bad && url.trim()) save(); }}>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} aria-labelledby="pref-webhook" aria-invalid={bad} placeholder="https://discord.com/api/webhooks/…" autoComplete="off" spellCheck={false} className="h-7 flex-1 font-mono" />
            <Button type="submit" size="sm" disabled={busy || bad || !url.trim()}>Save</Button>
            {editing && <Button type="button" variant="quiet" size="sm" onClick={() => { setEditing(false); setUrl(""); }}>Cancel</Button>}
          </form>
        ) : (
          <>
            <code className="font-mono text-bone">discord.com/api/webhooks/{dc.hint}</code>
            <Button variant="quiet" size="sm" disabled={busy} onClick={test}><Send />Send test</Button>
            <Button variant="quiet" size="sm" onClick={() => setEditing(true)}>Replace…</Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmRemove(true)}>Remove…</Button>
          </>
        )}
        {bad && <span className="basis-full text-bad">That isn't a Discord webhook URL: it starts https://discord.com/api/webhooks/ followed by two parts.</span>}
      </Pref>
      {dc.available && (
        <>
          <Pref label="Alerts">
            <Switch checked={dc.enabled} aria-label="Discord alerts" onCheckedChange={(v) => setDiscord(v).catch(fail)} />
            <LineForm kind={dc.enabled ? "live" : "off"} signal="sparse" className={dc.enabled ? "w-4 text-bone" : "w-4 text-ash"} />
            <b className="font-semibold text-bone">{dc.enabled ? "On" : "Off"}</b>
            <span className="text-ash">Mute one probe with the bell in its header.</span>
          </Pref>
          <Pref label="Post when">
            <ul className="w-full space-y-2">
              {KINDS.map(([k, name, what]) => {
                const on = dc.kinds?.[k] ?? true;
                return (
                  <li key={k} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5">
                    <Switch checked={on} disabled={!dc.enabled} aria-labelledby={`kind-${k}`} onCheckedChange={(v) => saveSettings({ discordKinds: { [k]: v } }).catch(fail)} className="mt-px" />
                    <span id={`kind-${k}`} className={dc.enabled ? "" : "opacity-60"}><b className="font-semibold text-bone">{name}</b> <span className="text-ash">· {what}</span></span>
                  </li>
                );
              })}
            </ul>
          </Pref>
        </>
      )}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent className="max-w-[460px] border-rule bg-soot-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the Discord webhook?</AlertDialogTitle>
            <AlertDialogDescription>Alerts stop at once. Colluder doesn't keep a copy, so adding it back takes the URL from Discord again. To pause alerts and keep it, switch Alerts off instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="quiet">Keep it</Button></AlertDialogCancel>
            <AlertDialogAction asChild><Button variant="destructive" onClick={() => saveSettings({ webhookUrl: null }).then(() => toast("Webhook removed")).catch(fail)}>Remove webhook</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------- display (this browser) ----------
export function DisplaySection() {
  const d = useDisplay();
  const [scale, setScale] = useState<TypeScale>(readTypeScale);
  const set = <K extends keyof Display>(k: K) => (v: Display[K]) => setDisplay(k, v);
  return (
    <>
      <p className="mb-2 max-w-[68ch] text-smoke">These stay in this browser: the desk monitor and the phone can each have their own.</p>
      <Pref label="Theme" hint={d.theme === "light" ? "For a bright room. The protocol colours are deepened to read on paper." : d.theme === "contrast" ? "Brighter secondary text and rules, for reading from across a desk or on a dim second monitor." : d.theme === "system" ? "Light when the system is set to light, dark otherwise." : undefined}>
        <Seg label="Theme" value={d.theme} onChange={set("theme")} options={[["dark", "Dark"], ["contrast", "High contrast"], ["light", "Light"], ["system", "Match system"]]} />
      </Pref>
      <Pref label="Protocol colours" hint={d.inks === "safe" ? "Okabe-Ito hues: DNS, HTTP, HTTPS and SMTP stay apart with red-green and blue-yellow colour blindness." : undefined}>
        <Seg label="Protocol colours" value={d.inks} onChange={set("inks")} options={[["colluder", "Colluder"], ["safe", "Colour-blind safe"]]} />
        <span className="flex gap-3" aria-hidden>{["dns", "http", "https", "smtp"].map((p) => <TypeChip key={p} proto={p} />)}</span>
      </Pref>
      <Pref label="Text size" hint="Comfortable sets everything one step larger (12.5px text becomes 13.5px).">
        <Seg label="Text size" value={scale} onChange={(v) => { setScale(v); applyTypeScale(v); }} options={[["compact", "Compact"], ["comfortable", "Comfortable"]]} />
      </Pref>
      <Pref label="Hits list" hint={d.hits === "short" ? "About six rows, so the open hit's detail stays in view on a laptop." : "Taller, for reading back through a session. The hit detail moves down to make room."}>
        <Seg label="Hits list height" value={d.hits} onChange={set("hits")} options={[["short", "Short"], ["tall", "Tall"], ["half", "Half the screen"]]} />
      </Pref>
      <Pref label="Motion" hint={{ full: "Live lines carry a moving signal; arrivals pop and flash.", still: "Live lines hold still (a solid wire beside the same word); arrivals still pop and flash.", none: "Nothing moves, whatever the system's reduce-motion setting." }[d.motion]}>
        <Seg label="Motion" value={d.motion} onChange={set("motion")} options={[["full", "Moving"], ["still", "Still lines"], ["none", "None"]]} />
      </Pref>
      <Pref label="Night shift" hint={d.theme === "light" ? "Dark themes only: the light theme never dims." : "From midnight to 05:00 local time the text dims a little and the status bar says so."}>
        <Seg label="Night shift" value={d.night} onChange={set("night")} options={[["auto", "Midnight to 05:00"], ["off", "Off"]]} />
      </Pref>
      <Pref label="Sound" hint={d.chime === "off" ? "A soft two-note chime when a probe fires. Resolver chatter, DNS steps and your own sources don't ring; a burst rings once." : "Browsers keep a page silent after each reload until you click or press a key in it."}>
        <Seg label="Arrival sound" value={d.chime} onChange={(v) => { setDisplay("chime", v); if (v !== "off") chime(); }} options={[["off", "Off"], ["firings", "Every firing"], ["hidden", "Only when this tab is hidden"]]} />
        {d.chime !== "off" && <Button variant="quiet" size="sm" onClick={chime}><Play />Play it</Button>}
      </Pref>
    </>
  );
}

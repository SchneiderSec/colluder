// Settings, piece by piece. One row grammar for everything: a label column and a value column inside
// grouped panels, so reading a state and changing a setting look like the same kind of thing.
// Server settings are saved to colluder.env / engine.yaml (lib/settings.mjs); display settings stay in
// this browser (lib/display.ts).
import { useState, type ReactNode } from "react";
import { Check, Copy, Play, Send, X } from "lucide-react";
import { saveSettings, setDiscord, testDiscord, runCheck } from "@/store";
import { copy, toast } from "@/lib/toast";
import { ago, isoMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LineForm, TypeChip } from "./bits";
import { applyTypeScale, readTypeScale, type TypeScale } from "@/lib/typeScale";
import { setDisplay, shownTheme, useDisplay, type Display, type Theme } from "@/lib/display";
import { chime } from "@/lib/chime";
import type { AlertKind, CheckResult, Status } from "@/lib/types";

export const fail = (x: unknown) => toast((x as Error).message, true);
const DAY = 86400e3;
// Palo Alto's URL filtering counts a domain as newly registered for 32 days; others are shorter
export const YOUNG_DAYS = 32;
const daysSince = (iso?: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : null);
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

// ---------- the grammar ----------
export function Section({ id, title, desc, action, children }: { id: string; title: string; desc?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={`set-${id}`} data-section={id} aria-labelledby={`set-${id}-h`} className="scroll-mt-6 pt-11 first:pt-0">
      <div className="mb-3 flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <h2 id={`set-${id}-h`} className="text-title font-[650] text-bone">{title}</h2>
          {desc && <p className="mt-1 max-w-[64ch] text-smoke">{desc}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

// a panel of rows; a title names it when a section holds more than one
export function Group({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div>
      {title && <h3 className="mb-1.5 text-label font-semibold tracking-[.03em] text-smoke">{title}</h3>}
      <div className="divide-y divide-rule-2 overflow-hidden rounded-[4px] border border-rule bg-soot-1">{children}</div>
      {note && <p className="mt-2 max-w-[64ch] text-ash">{note}</p>}
    </div>
  );
}

// label | value. dense: read-only facts, one line each
export function Row({ label, hint, children, id, dense }: { label: ReactNode; hint?: ReactNode; children: ReactNode; id?: string; dense?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[168px_minmax(0,1fr)] gap-x-6 gap-y-0.5 px-4 max-[640px]:grid-cols-1", dense ? "py-[7px]" : "py-2.5")}>
      <div id={id} className={cn("flex items-center self-start text-smoke", dense ? "min-h-5" : "min-h-7")}>{label}</div>
      <div className="min-w-0">
        <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1.5", dense ? "min-h-5" : "min-h-7")}>{children}</div>
        {hint && <div className="mt-1 max-w-[62ch] text-ash">{hint}</div>}
      </div>
    </div>
  );
}

export function Seg<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <ToggleGroup type="single" value={value} disabled={disabled} onValueChange={(v) => { if (v) onChange(v as T); }} aria-label={label} className="flex-wrap overflow-hidden rounded-[3px] border border-rule bg-soot">
      {options.map(([v, l]) => (
        <ToggleGroupItem key={v} value={v} className="h-7 rounded-none border-l border-rule px-3 text-body text-smoke first:border-l-0 hover:text-bone data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone">{l}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const Mono = ({ children, className }: { children: ReactNode; className?: string }) => <code className={cn("font-mono text-bone", className)}>{children}</code>;
const Tag = ({ children }: { children: ReactNode }) => <span className="rounded-[3px] border border-rule px-1.5 text-label font-semibold tracking-[.03em] text-bone">{children}</span>;

// ---------- payloads and domains ----------
export function PayloadSection({ st }: { st: Status | null }) {
  const [pick, setPick] = useState<string | null>(null);
  const pl = st?.payload, d = st?.domains;
  const per = st?.check?.domains ?? [];
  const last = (dom: string) => per.find((x) => x.domain === dom)?.last ?? null;
  const age = (dom: string) => daysSince(last(dom)?.domain?.registeredAt);
  const want = d ? `https://${d.payload}` : "";
  const nucleiOk = !!d && (d.nuclei?.replace(/\/+$/, "").toLowerCase() === want || d.nuclei?.toLowerCase() === d.payload);
  const young = pick ? age(pick) : null;
  const go = () => {
    const to = pick!;
    setPick(null);
    saveSettings({ payloadDomain: to }).then(() => toast(`Switching payloads to ${to}: the engine and Colluder restart, back in about 10 s`)).catch(fail);
  };
  return (
    <Section id="payloads" title="Payloads" desc="What you paste into targets, and the domains it can be built on.">
      <Group title="Current payload">
        <Row dense label="Payload">
          <Mono className="break-all">{pl?.host ?? "none yet"}</Mono>
          {pl?.host && <Button variant="ghost" size="icon-sm" aria-label="Copy the payload" onClick={() => copy(pl.host, "payload")}><Copy /></Button>}
        </Row>
        {pl && (
          <Row dense label="Short id">
            <Mono>{pl.shortId}</Mono>
            <span className="text-ash">{pl.short ? "in use; the edge records its DNS" : "waiting for the edge's DNS front (deploy/dns-front.sh); payloads use the long id until then"}</span>
          </Row>
        )}
        {pl?.short && <Row dense label="Long payload"><Mono className="break-all">{pl.longHost}</Mono><span className="text-ash">for SMTP, and old payloads</span></Row>}
        <Row dense label="Correlation id"><Mono>{pl?.correlationId ?? "none"}</Mono></Row>
      </Group>

      {d && (
        <Group title="Domains" note="Every domain listed answers and records: payloads already planted keep working whichever one new payloads use. Switching restarts the engine on the new domain (its long payload changes; the short id stays) and Colluder with it.">
          {d.served.map((dom) => {
            const l = last(dom), a = age(dom), cur = dom === d.payload;
            const cert = l?.cert, reg = l?.domain;
            return (
              <div key={dom} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Mono>{dom}</Mono>{cur && <Tag>Payloads</Tag>}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-ash">
                    {a != null && <span>Registered {a === 0 ? "today" : `${days(a)} ago`}</span>}
                    {cert && <span className={cert.days < 21 ? "text-bad" : ""}>Certificate {cert.days < 0 ? "expired" : `${days(cert.days)} left`}</span>}
                    {reg?.days != null && <span className={reg.days < 30 ? "text-bad" : ""}>Registration {reg.days < 0 ? "expired" : `${days(reg.days)} left`} · {reg.expiresAt?.slice(0, 10)}</span>}
                    {reg?.error && <span>Registration unknown (RDAP: {reg.error})</span>}
                  </div>
                  {!cur && a != null && a < YOUNG_DAYS && <p className="mt-1 text-caution-ink">New domain: web filters that block newly registered domains may refuse it until {dateOf(Date.parse(reg!.registeredAt!) + YOUNG_DAYS * DAY)}.</p>}
                </div>
                {!cur && <Button variant="quiet" disabled={!!d.switching} onClick={() => setPick(dom)}>{d.switching === dom ? "Switching…" : "Use for payloads…"}</Button>}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-bone">Nuclei</span>
                {nucleiOk ? <span className="text-ash">uses <Mono>{d.nuclei}</Mono>, which matches</span> : <span className="text-caution-ink">{d.nuclei ? <>still uses <Mono className="text-caution-ink">{d.nuclei}</Mono></> : "has no interactsh_server in user's config"}</span>}
              </div>
              <p className="mt-1 text-ash">It runs its own interactsh client, so it doesn't follow this setting: it reads <Mono className="text-ash">interactsh_server</Mono> from <Mono className="text-ash">~/.config/user/config.yaml</Mono>.</p>
            </div>
            {!nucleiOk && <Button variant="quiet" onClick={() => copy(`interactsh_server: ${want}`, "nuclei line")}><Copy />Copy the line</Button>}
          </div>
        </Group>
      )}

      <AlertDialog open={!!pick} onOpenChange={(v) => { if (!v) setPick(null); }}>
        <AlertDialogContent className="max-w-[500px] border-rule bg-soot-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch payloads to {pick}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>New payloads are built on {pick}. Payloads already planted on {d?.payload} keep recording for as long as it's served, and the outside check keeps proving both.</p>
                <p>The engine restarts and gets a new long payload; the short payload keeps its id. Colluder restarts too and this page reconnects in about 10 seconds.</p>
                {young != null && young < YOUNG_DAYS && <p className="text-caution-ink">{pick} is {young === 0 ? "less than a day" : days(young)} old. Corporate web filters often block domains younger than about {YOUNG_DAYS} days, so targets behind one may not call back yet.</p>}
                <p>Nuclei isn't changed: set its <code className="font-mono">interactsh_server</code> afterwards (Settings shows the line once you switch).</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="quiet">Keep {d?.payload}</Button></AlertDialogCancel>
            <AlertDialogAction asChild><Button onClick={go}>Switch to {pick}</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

// ---------- Discord ----------
const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,120}$/;
const KINDS: [AlertKind, string, string][] = [
  ["first", "First hit", "A probe's first hit, or its first after 30 quiet minutes."],
  ["escalation", "First web hit", "The first HTTP, HTTPS or SMTP hit on a probe that has only had DNS so far."],
  ["source", "New source", "A web hit from an address the probe hasn't heard from before."],
  ["late", "Late hits", "Hits on a retired probe, at most one post every 10 minutes."],
  ["rollup", "Roll-up", "Everything else, counted once a minute per probe. Alerts switched off above are counted here."],
  ["check", "Outside check", "When it starts failing, passes again, or warns about a certificate or domain."],
];

export function AlertsSection({ st }: { st: Status | null }) {
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
    <Section id="alerts" title="Alerts" desc="Discord hears when something new happens on a probe; repeats are rolled up once a minute. Mute one probe with the bell in its header.">
      <Group>
        <Row label="Discord webhook" id="pref-webhook" hint={showForm
          ? <>In Discord: the channel's settings, Integrations, Webhooks, New Webhook, Copy Webhook URL. Saved to <Mono className="text-ash">~/.config/colluder/colluder.env</Mono>, and never shown here again in full.</>
          : undefined}>
          {showForm ? (
            <form className="flex w-full items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!bad && url.trim()) save(); }}>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} aria-labelledby="pref-webhook" aria-invalid={bad} placeholder="https://discord.com/api/webhooks/…" autoComplete="off" spellCheck={false} className="h-7 min-w-0 flex-1 bg-soot font-mono" />
              <Button type="submit" disabled={busy || bad || !url.trim()}>Save</Button>
              {editing && <Button type="button" variant="quiet" onClick={() => { setEditing(false); setUrl(""); }}>Cancel</Button>}
            </form>
          ) : (
            <>
              <Mono className="mr-auto">…/webhooks/{dc.hint}</Mono>
              <Button variant="quiet" disabled={busy} onClick={test}><Send />Send test</Button>
              <Button variant="quiet" onClick={() => setEditing(true)}>Replace…</Button>
              <Button variant="destructive" onClick={() => setConfirmRemove(true)}>Remove…</Button>
            </>
          )}
          {bad && <span className="basis-full text-bad">That isn't a Discord webhook URL: it starts https://discord.com/api/webhooks/ followed by two parts.</span>}
        </Row>
        {dc.available && (
          <>
            <Row label="Alerts">
              <Switch checked={dc.enabled} aria-label="Discord alerts" onCheckedChange={(v) => setDiscord(v).catch(fail)} />
              <LineForm kind={dc.enabled ? "live" : "off"} signal="sparse" className={dc.enabled ? "w-4 text-bone" : "w-4 text-ash"} />
              <b className="font-semibold text-bone">{dc.enabled ? "On" : "Off: nothing posts, the webhook is kept"}</b>
            </Row>
            <Row label="Post when">
              <ul className="w-full divide-y divide-rule-2">
                {KINDS.map(([k, name, what]) => {
                  const on = dc.kinds?.[k] ?? true;
                  return (
                    <li key={k} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 py-2 first:pt-1 last:pb-0.5">
                      <Switch checked={on} disabled={!dc.enabled} aria-labelledby={`kind-${k}`} aria-describedby={`kind-${k}-d`} onCheckedChange={(v) => saveSettings({ discordKinds: { [k]: v } }).catch(fail)} className="mt-0.5" />
                      <div className={dc.enabled ? "" : "opacity-60"}>
                        <div id={`kind-${k}`} className="font-semibold text-bone">{name}</div>
                        <div id={`kind-${k}-d`} className="text-ash">{what}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Row>
          </>
        )}
      </Group>
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
    </Section>
  );
}

// ---------- the outside check ----------
// "DNS via Cloudflare (1.1.1.1)" -> "Cloudflare DNS"; the web steps by their scheme
const stepHead = (key: string, label: string) => (key.startsWith("dns:") ? `${/via (\S+)/.exec(label)?.[1] ?? key.slice(4)} DNS` : key.toUpperCase());

export function checkWord(st: Status | null): { kind: "live" | "dash" | "down" | "off"; word: string } {
  const c = st?.check;
  if (!c?.active) return { kind: "off", word: "not active" };
  if (c.off) return { kind: "off", word: "off" };
  if (!c.last) return { kind: "dash", word: c.running ? "running" : "not run yet" };
  return c.last.state === "failing" ? { kind: "down", word: "failing" } : { kind: "live", word: c.last.state === "warn" ? "passing, with a warning" : "passing" };
}

export function CheckSection({ st }: { st: Status | null }) {
  const c = st?.check;
  if (!c) return null;
  const l = c.last;
  const per = c.domains?.length ? c.domains : l ? [{ domain: "", primary: true, last: l as CheckResult | null }] : [];
  const cols = (per.find((p) => p.last)?.last?.steps ?? []).map((s) => ({ key: s.key, head: stepHead(s.key, s.label) }));
  const failed = per.flatMap((p) => (p.last?.steps ?? []).filter((s) => !s.ok).map((s) => ({ ...s, domain: p.domain })));
  const w = checkWord(st);
  const cur = c.off ? "0" : String(c.everyMinutes);
  const opts: [string, string][] = [["5", "5 min"], ["10", "10 min"], ["30", "30 min"], ["60", "1 hour"], ["0", "Off"]];
  if (!opts.some(([v]) => v === cur)) opts.splice(-1, 0, [cur, `${cur} min`]);
  const check = () => runCheck().then((r) => toast(r.state === "failing" ? "Check failed: the failing steps are listed" : "Check passed")).catch(fail);
  return (
    <Section id="check" title="Outside check"
      desc="The edge's heartbeat says it's running, not that callbacks get through. So Colluder regularly resolves a fresh name through Cloudflare and Google and requests it over HTTP and HTTPS, then confirms the edge recorded each one. Its traffic never shows up as hits."
      action={c.active ? <Button variant="quiet" disabled={c.running} onClick={check}>{c.running ? "Checking…" : "Check now"}</Button> : undefined}>
      <Group note={c.active ? "The web steps run from this box, so they prove the edge and the certificate, not the firewall in front of them." : undefined}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-3">
          <LineForm kind={w.kind} signal="echo" className={w.kind === "down" ? "text-bad" : w.kind === "off" ? "text-ash" : "text-bone"} />
          <b className={cn("font-semibold first-letter:uppercase", w.kind === "down" ? "text-bad" : "text-bone")}>{w.word}</b>
          <span className="text-ash">
            {!c.active ? "It starts once the edge fronts DNS (deploy/dns-front.sh): it checks the short payload host."
              : l ? `last run ${l.finishedAt.slice(11, 16)} UTC, ${ago(Date.now() - isoMs(l.finishedAt))}${c.off ? "" : ` · every ${c.everyMinutes} min`}`
              : "the first run is about 30 s after Colluder starts"}
          </span>
        </div>
        {/* phones: one line per domain, its failures named (the table needs room for five columns) */}
        {cols.length > 0 && (
          <ul className="hidden divide-y divide-rule-2 border-t border-rule-2 max-[640px]:block">
            {per.map((p) => {
              const bad = (p.last?.steps ?? []).filter((s) => !s.ok);
              return (
                <li key={p.domain || "one"} className="px-4 py-2">
                  <Mono className="break-all">{p.domain || l?.host}</Mono>
                  <div className={bad.length ? "font-semibold text-bad" : "text-ash"}>
                    {!p.last ? "not run" : bad.length ? `Failed: ${bad.map((s) => stepHead(s.key, s.label)).join(", ")}` : `All ${p.last.steps.length} steps passed`}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {cols.length > 0 && (
          <div className="overflow-x-auto max-[640px]:hidden">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule-2">
                  <th scope="col" className="py-1.5 pr-3 pl-4 text-label font-semibold tracking-[.03em] text-smoke">Domain</th>
                  {cols.map((x) => <th key={x.key} scope="col" className="px-3 py-1.5 text-label font-semibold tracking-[.03em] text-smoke">{x.head}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule-2">
                {per.map((p) => (
                  <tr key={p.domain || "one"}>
                    <th scope="row" className="py-2 pr-3 pl-4 font-normal"><Mono>{p.domain || l?.host}</Mono></th>
                    {cols.map((x) => {
                      const s = p.last?.steps.find((y) => y.key === x.key);
                      return (
                        <td key={x.key} className="px-3 py-2" title={s?.detail}>
                          {!s ? <span className="text-ash">not run</span>
                            : s.ok ? <span className="inline-flex items-center gap-1.5 text-bone"><Check className="size-3.5 text-smoke" strokeWidth={2} />{s.retried ? "Passed on retry" : "Passed"}</span>
                            : <span className="inline-flex items-center gap-1.5 font-semibold text-bad"><X className="size-3.5" strokeWidth={2.25} />Failed</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {failed.length > 0 && (
          <ul className="space-y-1 bg-alarm-ground px-4 py-3 text-alarm-ink">
            {failed.map((s) => <li key={`${s.domain}${s.key}`}><b className="font-semibold">{s.domain ? `${s.domain} · ` : ""}{s.label}:</b> {s.detail}{s.retried ? " (also on the retry a minute later)" : ""}</li>)}
          </ul>
        )}
        {(l?.warnings.length ?? 0) > 0 && <ul className="space-y-1 bg-caution-ground px-4 py-3 text-caution-ink">{l!.warnings.map((x) => <li key={x}>{x}</li>)}</ul>}
        <Row label="Runs" hint={c.off ? <span className="text-caution-ink">Off: nothing tells you if callbacks stop reaching Colluder, and a quiet probe reads the same as a dead path. Check now still works.</span> : "Each run makes two lookups and two requests per domain; a failed step is tried once more a minute later."}>
          <Seg label="How often the outside check runs" value={cur} options={opts} onChange={(v) => saveSettings({ checkMinutes: Number(v) }).then(() => toast(v === "0" ? "Outside check off" : `Outside check every ${v} min`)).catch(fail)} />
        </Row>
      </Group>
    </Section>
  );
}

// ---------- display (this browser) ----------
export const THEME_NAMES: Record<Theme, string> = { dark: "Colluder", contrast: "High contrast", dracula: "Dracula", nord: "Nord", tokyo: "Tokyo Night", light: "Light", system: "Match system" };
const THEME_HINTS: Record<Exclude<Theme, "system">, string> = {
  dark: "Colluder's own: warm soot with bone ink and amber for anything new.",
  contrast: "Brighter secondary text and rules, for reading from across a desk or on a dim second monitor.",
  dracula: "Dracula's purple-grey night: purple DNS, pink HTTP, cyan HTTPS, green SMTP, orange for new.",
  nord: "Nord's arctic grey-blue, cooler and quieter, with frost and aurora accents.",
  tokyo: "Tokyo Night's deep indigo with neon accents, the darkest of the set.",
  light: "For a bright room. The protocol colours deepen to read on paper.",
};
// each tile is painted in its own theme's colours (the page around it stays in the current one)
type Swatch = { ground: string; rail: string; ink: string; dim: string; fresh: string; inks: [string, string, string, string] };
const SWATCH: Record<Exclude<Theme, "system">, Swatch> = {
  dark: { ground: "#16120e", rail: "#110e0b", ink: "#ece3d1", dim: "#b3a99a", fresh: "#f2b33d", inks: ["#c793c4", "#e2643f", "#8aa2ea", "#62b08f"] },
  contrast: { ground: "#120f0b", rail: "#0c0a08", ink: "#f8f1e3", dim: "#d6ccbc", fresh: "#f7c25a", inks: ["#dcaad9", "#f2865f", "#a9bdf6", "#7fcca8"] },
  dracula: { ground: "#282a36", rail: "#21222c", ink: "#f8f8f2", dim: "#d0d3e3", fresh: "#ffb86c", inks: ["#bd93f9", "#ff79c6", "#8be9fd", "#50fa7b"] },
  nord: { ground: "#2e3440", rail: "#272c36", ink: "#eceff4", dim: "#d3d9e4", fresh: "#ebcb8b", inks: ["#d0aeca", "#e3a58e", "#8ec6d5", "#a3be8c"] },
  tokyo: { ground: "#1a1b26", rail: "#16161e", ink: "#c0caf5", dim: "#a9b1d6", fresh: "#e0af68", inks: ["#bb9af7", "#ff9e64", "#7aa2f7", "#9ece6a"] },
  light: { ground: "#f3eee3", rail: "#ebe4d6", ink: "#1d1813", dim: "#554c40", fresh: "#7f5300", inks: ["#8a3f86", "#a93a17", "#3450ad", "#1f6f48"] },
};

// a miniature of the dashboard: the rail, two lines of text, the four protocol inks and a new-hit dot
function Miniature({ w, className }: { w: Swatch; className?: string }) {
  return (
    <span className={cn("absolute inset-0 flex", className)} style={{ backgroundColor: w.ground }}>
      <span className="w-2.5 flex-none" style={{ backgroundColor: w.rail }} />
      <span className="flex flex-1 flex-col justify-center gap-[5px] px-2.5">
        <span className="h-[3px] w-[62%] rounded-full" style={{ backgroundColor: w.ink }} />
        <span className="h-[3px] w-[40%] rounded-full opacity-80" style={{ backgroundColor: w.dim }} />
        <span className="mt-0.5 flex items-center gap-[5px]">
          {w.inks.map((c) => <span key={c} className="size-[7px] rounded-[2px]" style={{ backgroundColor: c }} />)}
          <span className="ml-auto size-[7px] rounded-full" style={{ backgroundColor: w.fresh }} />
        </span>
      </span>
    </span>
  );
}

function ThemePicker({ d }: { d: Display }) {
  const order: Theme[] = ["dark", "contrast", "dracula", "nord", "tokyo", "light", "system"];
  return (
    <ToggleGroup type="single" value={d.theme} onValueChange={(v) => { if (v) setDisplay("theme", v as Theme); }} aria-label="Theme" className="grid w-full grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5">
      {order.map((t) => {
        const on = d.theme === t;
        return (
          <ToggleGroupItem key={t} value={t} aria-label={THEME_NAMES[t]}
            className="group h-auto min-w-0 flex-col items-stretch gap-1.5 rounded-[4px] border border-rule bg-transparent p-1.5 text-left shadow-none hover:border-ash hover:bg-transparent data-[state=on]:border-bone data-[state=on]:bg-soot-2">
            <span className="relative block h-12 overflow-hidden rounded-[3px] outline outline-1 -outline-offset-1 outline-rule/70" aria-hidden>
              {t === "system"
                ? <><Miniature w={SWATCH.light} className="[clip-path:polygon(0_0,100%_0,0_100%)]" /><Miniature w={SWATCH[d.dark]} className="[clip-path:polygon(100%_0,100%_100%,0_100%)]" /></>
                : <Miniature w={SWATCH[t]} />}
            </span>
            <span className={cn("flex items-center gap-1 px-0.5 text-body", on ? "font-semibold text-bone" : "text-smoke group-hover:text-bone")}>
              <span className="truncate">{THEME_NAMES[t]}</span>
              {on && <Check className="ml-auto size-3.5 flex-none" strokeWidth={2.25} />}
            </span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export function DisplaySection() {
  const d = useDisplay();
  const [scale, setScale] = useState<TypeScale>(readTypeScale);
  const set = <K extends keyof Display>(k: K) => (v: Display[K]) => setDisplay(k, v);
  return (
    <Section id="display" title="Display" desc="Saved in this browser only, so the desk monitor and the phone can each have their own.">
      <Group title="Look">
        <Row label="Theme" hint={d.theme === "system" ? `Light when the system is set to light; otherwise ${THEME_NAMES[d.dark]}, the dark theme you picked last.` : THEME_HINTS[d.theme]}>
          <ThemePicker d={d} />
        </Row>
        <Row label="Protocol colours" hint={d.inks === "safe" ? "Okabe-Ito hues: DNS, HTTP, HTTPS and SMTP stay apart with red-green and blue-yellow colour blindness." : undefined}>
          <Seg label="Protocol colours" value={d.inks} onChange={set("inks")} options={[["colluder", "Colluder"], ["safe", "Colour-blind safe"]]} />
          <span className="flex gap-3 pl-1" aria-hidden>{["dns", "http", "https", "smtp"].map((p) => <TypeChip key={p} proto={p} />)}</span>
        </Row>
        <Row label="Text size" hint="Comfortable sets everything one step larger: 12.5px text becomes 13.5px.">
          <Seg label="Text size" value={scale} onChange={(v) => { setScale(v); applyTypeScale(v); }} options={[["compact", "Compact"], ["comfortable", "Comfortable"]]} />
        </Row>
        <Row label="Motion" hint={{ full: "Live lines carry a moving signal; arrivals pop and flash.", still: "Live lines hold still, a solid wire beside the same word; arrivals still pop and flash.", none: "Nothing moves, whatever the system's reduce-motion setting." }[d.motion]}>
          <Seg label="Motion" value={d.motion} onChange={set("motion")} options={[["full", "Moving"], ["still", "Still lines"], ["none", "None"]]} />
        </Row>
        <Row label="Night shift" hint={shownTheme(d) === "light" ? "Dark themes only: the light theme never dims." : "From midnight to 05:00 local time the text dims a little and the status bar says so."}>
          <Seg label="Night shift" value={d.night} onChange={set("night")} options={[["auto", "Midnight to 05:00"], ["off", "Off"]]} />
        </Row>
      </Group>
      <Group title="Hits">
        <Row label="List height" hint={d.hits === "short" ? "About six rows, so the open hit's detail stays in view on a laptop." : "Taller, for reading back through a session; the hit detail moves down to make room."}>
          <Seg label="Hits list height" value={d.hits} onChange={set("hits")} options={[["short", "Short"], ["tall", "Tall"], ["half", "Half the screen"]]} />
        </Row>
        <Row label="Sound" hint={d.chime === "off" ? "A soft two-note chime when a probe fires. Resolver chatter, DNS steps and your own sources don't ring; a burst rings once." : "Browsers keep a page silent after each reload until you click or press a key in it."}>
          <Seg label="Arrival sound" value={d.chime} onChange={(v) => { setDisplay("chime", v); if (v !== "off") chime(); }} options={[["off", "Off"], ["firings", "Every firing"], ["hidden", "Only when the tab is hidden"]]} />
          {d.chime !== "off" && <Button variant="ghost" onClick={chime}><Play />Play it</Button>}
        </Row>
      </Group>
    </Section>
  );
}

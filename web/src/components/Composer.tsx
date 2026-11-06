import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Copy, RefreshCw } from "lucide-react";
import { useApp, plant, save } from "@/store";
import { TAG_RE, UNTAGGED } from "@/lib/types";
import { variants } from "@/lib/raw";
import { hostOf } from "@/lib/metadata";
import { CLOUDS, XXE_FILES, ssrfRule, xxeRule } from "@/lib/presets";
import { ssrfPayloads, xxePayloads, jsonEscape, xmlEscape, type Payload } from "@/lib/kit";
import { copy } from "@/lib/toast";
import { dayOrTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LineForm, TypeChip } from "./bits";
import { Marked } from "./PayloadKit";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const BAD_TAG = "Letters, digits and hyphens; can't start or end with a hyphen.";

const PRESET_LABEL: Record<string, string> = { "ssrf-metadata": "SSRF", xxe: "XXE" };
type CopyAs = "raw" | "url" | "json" | "xml";
const asCopy = (s: string, c: CopyAs) => (c === "url" ? encodeURIComponent(s) : c === "json" ? jsonEscape(s) : c === "xml" ? xmlEscape(s) : s);

export function Composer() {
  const s = useApp((x) => x);
  const [tag, setTag] = useState("");
  const [target, setTarget] = useState("");
  const [technique, setTechnique] = useState("callback");
  const [cloud, setCloud] = useState(CLOUDS[0].id);
  const [headDecoy, setHeadDecoy] = useState(true);
  const [xxeFile, setXxeFile] = useState(XXE_FILES[0][0]);
  const [xxeCustom, setXxeCustom] = useState("");
  const [copyAs, setCopyAs] = useState<CopyAs>("raw");
  const [plain, setPlain] = useState(false);
  const [err, setErr] = useState("");
  const tagRef = useRef<HTMLInputElement>(null);
  const varsRef = useRef<HTMLDivElement>(null);

  // "p" or "/" anywhere focuses the tag field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement)?.tagName) || document.querySelector("[role=dialog],[role=alertdialog]");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "p" || e.key === "/") { e.preventDefault(); tagRef.current?.focus(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const host = s.status?.payload?.host;
  const domain = s.status?.payload?.domain;
  const preview = tag && TAG_RE.test(tag) && !s.probes.has(tag) ? tag : null;
  const shownTag = preview || (s.sel && s.sel !== UNTAGGED ? s.sel : null);
  const vs = variants(host, domain, shownTag);
  // a preset probe's own payloads replace the plain three (which stay behind "Plain callbacks")
  const shownTechnique = preview ? technique : shownTag ? s.probes.get(shownTag)?.technique : null;
  useEffect(() => setPlain(false), [shownTag]);
  // planted as Redirect or Hosted file, but the rule isn't saved yet
  const shownProbe = shownTag && !preview ? s.probes.get(shownTag) : undefined;
  const unsaved = shownProbe && !shownProbe.httpRule && (shownProbe.technique === "redirect" || shownProbe.technique === "file") ? (shownProbe.technique === "file" ? "hosted file" : "redirect") : null;
  const presetRows: Payload[] | null = !host || !shownTag ? null
    : shownTechnique === "ssrf-metadata" ? ssrfPayloads(shownTag, host)
    : shownTechnique === "xxe" ? xxePayloads(shownTag, host) : null;
  // B6: while you read a probe's hits, its payloads fold into one line of copy buttons, so the hit
  // detail gets the room. "Show payloads" keeps them open (remembered).
  const [pinned, setPinned] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem("colluder.payloadsOpen") ?? "false"); } catch { return false; } });
  const pin = (v: boolean) => { setPinned(v); save("colluder.payloadsOpen", v); };
  // folded on every tab of a probe that has hits (the editor and the hit detail both need the room);
  // a fresh probe keeps its rows open, since copying one is the next step
  const reading = !preview && !!shownTag && (s.probes.get(shownTag)?.hits ?? 0) > 0;
  // a preset's rows show three at a time until asked: seven rows push the probe pane half a screen down
  const [allRows, setAllRows] = useState(false);
  useEffect(() => setAllRows(false), [shownTag]);
  const folded = reading && !pinned && !!vs;
  // a retired probe's payloads still reach Colluder, but offering them invites firing a probe you've
  // stopped watching: one line says so, with the rows one click away
  const [retiredOpen, setRetiredOpen] = useState(false);
  useEffect(() => setRetiredOpen(false), [shownTag]);
  const retiredShown = !!shownProbe?.retiredAt && !retiredOpen;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!TAG_RE.test(tag)) { setErr(tag ? BAD_TAG : "Give the probe a tag first, e.g. avatar."); tagRef.current?.focus(); return; }
    try {
      const c = CLOUDS.find((x) => x.id === cloud)!;
      const file = xxeFile === "custom" ? xxeCustom.trim() : xxeFile;
      if (technique === "ssrf-metadata") await plant(tag, target.trim(), technique, ssrfRule(c.url, headDecoy), `302 → ${hostOf(c.url)} (${c.provider}: ${c.name}) after 2 hops`);
      else if (technique === "xxe") {
        if (!host) throw new Error("No payload host yet: wait for the engine.");
        await plant(tag, target.trim(), technique, xxeRule(`${tag}.${host}`, file), `an XXE DTD reading ${file}`);
      }
      else await plant(tag, target.trim(), technique);
      const next = technique === "redirect" ? '[aria-label="Location"]' : technique === "file" ? '[aria-label="Template"]' : null;
      setTag(""); setTarget(""); setErr(""); setTechnique("callback"); setPlain(false);
      // the next step: setting up the answer for Redirect / Hosted file, else copying a payload
      const focus = (n: number) => requestAnimationFrame(() => {
        const el = next ? document.querySelector<HTMLElement>(next) : varsRef.current?.querySelector<HTMLButtonElement>("button[data-copy]");
        if (el) el.focus(); else if (n > 0) focus(n - 1);
      });
      focus(60); // the editor appears once its rule loads
    }
    catch (ex) { setErr((ex as Error).message); }
  }

  const fld = "flex h-9 items-center gap-[9px] overflow-hidden rounded-[3px] border border-rule bg-soot px-3 whitespace-nowrap transition-colors focus-within:border-smoke";
  return (
    <section aria-label="Plant a probe" className="grid grid-cols-[132px_minmax(0,1fr)] gap-y-2.5 border-b border-rule bg-soot-1 px-6 pt-3.5 pb-3 max-[820px]:grid-cols-1 max-[820px]:px-3.5">
      <h1 className="self-start pt-[6px] text-[17px] font-[650] max-[820px]:pt-0">Plant a probe</h1>
      <form onSubmit={submit} noValidate autoComplete="off"
        className="grid grid-cols-[minmax(200px,318px)_minmax(0,1fr)_236px_auto] gap-2.5 max-[1180px]:grid-cols-[minmax(160px,1fr)_minmax(0,1.4fr)_172px_auto] max-[820px]:grid-cols-1">
        <label className={cn(fld, err && "border-bad")}>
          <span className="text-[12.5px] font-[550] text-smoke">Tag</span>
          <input ref={tagRef} value={tag} maxLength={32} spellCheck={false} placeholder="e.g. avatar" aria-invalid={!!err} aria-describedby="tag-err"
            onChange={(e) => { const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); setTag(v); setErr(v && !TAG_RE.test(v) ? BAD_TAG : ""); }}
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-bone outline-none placeholder:text-ash" />
          {host && <span className="font-mono text-[12.5px] text-ash">.{host.slice(0, 8)}…</span>}
        </label>
        <label className={fld}>
          <span className="text-[12.5px] font-[550] text-smoke">Target</span>
          <input value={target} maxLength={300} onChange={(e) => setTarget(e.target.value)} placeholder="Where you planted it, e.g. api.shop.example · POST /import url="
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-bone outline-none placeholder:text-ash" />
        </label>
        <Select value={technique} onValueChange={setTechnique}>
          <SelectTrigger aria-label="Technique" className="h-9 w-full justify-start gap-[9px] rounded-[3px] border-rule bg-soot text-[12.5px] [&>svg]:ml-auto">
            <span className="text-[12.5px] font-[550] text-smoke max-[1180px]:sr-only max-[820px]:not-sr-only">Technique</span><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="callback">Default reply</SelectItem>
            <SelectItem value="redirect">Redirect</SelectItem>
            <SelectItem value="file">Hosted file</SelectItem>
            <SelectItem value="ssrf-metadata">SSRF → metadata</SelectItem>
            <SelectItem value="xxe">XXE</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="default" size="lg" className="h-9"><ArrowDownToLine />Plant</Button>
        {technique === "xxe" && (
          <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-smoke">
            <Select value={xxeFile} onValueChange={setXxeFile}>
              <SelectTrigger aria-label="File to read" className="h-8 w-auto gap-[9px] rounded-[3px] border-rule bg-soot text-[12.5px]"><span className="font-[550] text-smoke">File</span><SelectValue /></SelectTrigger>
              <SelectContent>{XXE_FILES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
            {xxeFile === "custom" && (
              <label className="flex h-8 w-[280px] items-center rounded-[3px] border border-rule bg-soot px-2.5 focus-within:border-smoke">
                <input aria-label="Path of the file to read" spellCheck={false} value={xxeCustom} onChange={(e) => setXxeCustom(e.target.value)} placeholder="/etc/issue or file:///…"
                  className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-bone outline-none placeholder:font-sans placeholder:text-ash" />
              </label>
            )}
            <span className="max-w-[110ch] text-ash">Serves at once: a DTD that reads the file and sends it back as a hit, plus feed.xml and sitemap.xml for "import from URL" features. Modern Java rejects a newline in the URL, so keep to one-line files there; libxml2 2.9+ and .NET 4.5.2+ don't load external entities by default.</span>
          </div>
        )}
        {technique === "ssrf-metadata" && (
          <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-smoke">
            <Select value={cloud} onValueChange={setCloud}>
              <SelectTrigger aria-label="Cloud" className="h-8 w-auto gap-[9px] rounded-[3px] border-rule bg-soot text-[12.5px]"><span className="font-[550] text-smoke">Cloud</span><SelectValue /></SelectTrigger>
              <SelectContent>{CLOUDS.map((c) => <SelectItem key={c.id} value={c.id}>{c.provider}: {c.name}</SelectItem>)}</SelectContent>
            </Select>
            <label className="flex cursor-pointer items-center gap-[7px]"><input type="checkbox" className="size-3.5 accent-bone" checked={headDecoy} onChange={(e) => setHeadDecoy(e.target.checked)} />Decoy reply for HEAD checks</label>
            <span className="text-ash">Serves at once: two hops back through the probe (301, 307), then 302 → <span className="font-mono">{hostOf(CLOUDS.find((x) => x.id === cloud)!.url)}</span>. A redirect can't do IMDSv2's PUT, so a 401 in the target's response means v2 is enforced.</span>
          </div>
        )}
      </form>
      {err && <p id="tag-err" className="col-start-2 -mt-1 text-[12.5px] text-alarm-ink max-[820px]:col-start-1">{err}</p>}

      <div className="pt-[3px] text-[12.5px] leading-[17px] text-smoke max-[820px]:flex max-[820px]:gap-1.5 max-[820px]:pt-0.5">
        {preview ? "Preview for" : shownTag ? "Payloads for" : "Base payload"}
        <span className="block truncate font-mono text-[12.5px] text-bone">{shownTag ?? "no tag"}</span>
        {unsaved && <span className="block text-[11px] leading-[15px] text-amber max-[820px]:hidden" title="Planted, but its rule isn't saved yet: payloads copied now get the default reply">default reply until you save its {unsaved}</span>}
      </div>
      {retiredShown ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-smoke">
          <span>Retired {dayOrTime(shownProbe!.retiredAt)}. Restore it to use these payloads again, or plant a new tag above.</span>
          <Button variant="ghost" size="sm" className="text-ash" onClick={() => setRetiredOpen(true)}>Show its payloads</Button>
        </p>
      ) : presetRows && !plain && reading && !pinned ? (
        <div ref={varsRef} className="flex min-w-0 flex-wrap items-center gap-1">
          {presetRows.map((p) => (
            <Button key={p.code} data-copy variant="ghost" size="sm" title={`${p.note ?? ""}\n${p.text}`} aria-label={`Copy ${p.name} payload`} onClick={() => copy(asCopy(p.text, copyAs), `${p.name} payload`)}>
              <Copy />{p.name}
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="ml-1 text-ash" onClick={() => pin(true)}>Show payloads</Button>
        </div>
      ) : presetRows && !plain ? (
        <div ref={varsRef} className="grid min-w-0 grid-cols-[164px_minmax(0,max-content)_28px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 max-[820px]:grid-cols-[minmax(0,1fr)_28px]">
          {(allRows ? presetRows : presetRows.slice(0, 3)).map((p) => (
            <div key={p.code} className="contents">
              <span title={p.note} className="flex items-center gap-2 text-[12.5px] whitespace-nowrap text-smoke max-[820px]:col-span-full"><TypeChip proto={/^https:/.test(p.text) ? "https" : "http"} />{p.name}</span>
              <span className="truncate font-mono text-[12.5px] text-smoke" title={p.text}><Marked text={p.text} tag={shownTag!} code={p.code} /></span>
              <Button data-copy variant="ghost" size="icon-sm" aria-label={`Copy ${p.name} payload`} onClick={() => copy(asCopy(p.text, copyAs), `${p.name} payload${copyAs === "raw" ? "" : `, ${copyAs === "url" ? "URL-encoded" : copyAs === "json" ? "JSON-escaped" : "XML-escaped"}`}`)}><Copy /></Button>
              <span className="truncate pl-2 text-[11px] text-ash max-[1180px]:hidden" title={p.note}>{p.note}</span>
            </div>
          ))}
          <div className="col-span-full mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ash">
            <span className="flex items-center gap-2">Copy
              <ToggleGroup type="single" value={copyAs} onValueChange={(v) => v && setCopyAs(v as CopyAs)} aria-label="Copy as" className="overflow-hidden rounded-[3px] border border-rule">
                {([["raw", "as is"], ["url", "URL-encoded"], ["json", "JSON"], ["xml", "XML"]] as [CopyAs, string][]).map(([v, l]) => (
                  <ToggleGroupItem key={v} value={v} className="h-[22px] rounded-none border-l border-rule px-2 text-[11px] text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone">{l}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </span>
            {presetRows.length > 3 && <Button variant="ghost" size="sm" className="text-smoke" onClick={() => setAllRows(!allRows)}>{allRows ? "Show fewer" : `Show all ${presetRows.length} payloads`}</Button>}
            <Button variant="ghost" size="sm" className="text-ash" onClick={() => setPlain(true)}>Plain callbacks</Button>
            {reading && pinned && <Button variant="ghost" size="sm" className="text-ash" onClick={() => pin(false)}>Fold payloads</Button>}
          </div>
        </div>
      ) : folded ? (
        <div ref={varsRef} className="flex min-w-0 flex-wrap items-center gap-1">
          {vs!.map((v) => (
            <Button key={v.proto} data-copy variant="ghost" size="sm" title={v.value} aria-label={`Copy ${v.proto.toUpperCase()} payload`} onClick={() => copy(v.value, `${v.proto.toUpperCase()} payload`)}>
              <Copy /><TypeChip proto={v.proto} />
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="ml-1 text-ash" onClick={() => pin(true)}>Show payloads</Button>
        </div>
      ) : (
      <div ref={varsRef} className="grid min-w-0 auto-rows-[24px] grid-cols-[62px_minmax(0,max-content)_54px_minmax(0,1fr)] items-center gap-x-2.5 max-[820px]:grid-cols-[52px_minmax(0,1fr)_54px]">
        {!vs ? (
          <p className="col-span-full flex items-center gap-2 text-[12.5px] text-smoke">
            <LineForm kind="dash" />{s.status?.engine ? `No payload yet. ${s.status.engine.detail}` : "Waiting for the engine's payload…"}
          </p>
        ) : (
          <>
            {vs.map((v) => (
              <div key={v.proto} className="contents">
                <TypeChip proto={v.proto} />
                <span className="truncate font-mono text-[12.5px] text-smoke" title={v.value}>
                  {([[v.parts, "max-[820px]:hidden"], [v.short, "hidden max-[820px]:inline"]] as const).map(([parts, cls]) => (
                    <span key={cls} className={cls}>
                      {parts.map(([k, t], i) => (k === "em" ? <em key={i} className="bg-mark px-px text-bone not-italic">{t}</em> : <span key={i}>{t}</span>))}
                    </span>
                  ))}
                </span>
                <span className="flex gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button data-copy variant="ghost" size="icon-sm" aria-label={`Copy ${v.proto.toUpperCase()} payload`} onClick={() => copy(v.value, `${v.proto.toUpperCase()} payload`)}><Copy /></Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy {v.proto.toUpperCase()} payload</TooltipContent>
                  </Tooltip>
                  {v.proto === "dns" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Copy DNS payload with a fresh label"
                          onClick={() => copy(`${Math.random().toString(36).slice(2, 6).padEnd(4, "x")}.${v.value}`, "DNS payload with a fresh label")}><RefreshCw /></Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy with a fresh random label in front, so no resolver can answer from cache</TooltipContent>
                    </Tooltip>
                  )}
                </span>
                <span className="truncate pl-2 text-[11px] text-ash max-[1180px]:hidden">{v.note}</span>
              </div>
            ))}
            {preview && <p className="col-span-full text-[11px] text-ash">Not planted yet: these already work, but Plant records the tag and target so the hits read as a story.</p>}
            {presetRows && plain && <Button variant="ghost" size="sm" className="col-span-full justify-self-start text-ash" onClick={() => setPlain(false)}>{PRESET_LABEL[shownTechnique ?? ""] ?? "Preset"} payloads</Button>}
            {reading && pinned && <Button variant="ghost" size="sm" className="col-span-full justify-self-start text-ash" onClick={() => pin(false)}>Fold payloads while reading hits</Button>}
          </>
        )}
      </div>
      )}
    </section>
  );
}

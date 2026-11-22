import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDownToLine, ChevronDown, Copy, Dices, RefreshCw, X } from "lucide-react";
import { useApp, plant, save, setPlanting, cancelPlanting } from "@/store";
import { TAG_RE } from "@/lib/types";
import { quickTag } from "@/lib/quicktag";
import { variants } from "@/lib/raw";
import { hostOf } from "@/lib/metadata";
import { CLOUDS, XXE_FILES, ssrfRule, xxeRule } from "@/lib/presets";
import { ssrfPayloads, xxePayloads, jsonEscape, xmlEscape, tagged, shownId, type Payload } from "@/lib/kit";
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

// "Show payloads" is remembered per browser and shared by the header's copy buttons and the rows
// under it, so it lives outside either component
let pinnedNow = (() => { try { return JSON.parse(localStorage.getItem("colluder.payloadsOpen") ?? "false") as boolean; } catch { return false; } })();
const pinSubs = new Set<() => void>();
const setPinned = (v: boolean) => { pinnedNow = v; save("colluder.payloadsOpen", v); pinSubs.forEach((f) => f()); };
const usePinned = () => useSyncExternalStore((cb) => { pinSubs.add(cb); return () => pinSubs.delete(cb); }, () => pinnedNow);

// What a probe's payload area shows: its variants, a preset's own rows, and whether they're folded.
function usePayloads(tag: string | null, previewTechnique?: string) {
  const s = useApp((x) => x);
  const host = s.status?.payload?.host;
  const domain = s.status?.payload?.domain;
  const probe = tag && !previewTechnique ? s.probes.get(tag) : undefined;
  const technique = previewTechnique ?? probe?.technique ?? null;
  const vs = variants(host, domain, tag);
  const presetRows: Payload[] | null = !host || !tag ? null
    : technique === "ssrf-metadata" ? ssrfPayloads(tag, host)
    : technique === "xxe" ? xxePayloads(tag, host) : null;
  // planted as Redirect or Hosted file, but the rule isn't saved yet
  const unsaved = probe && !probe.httpRule && (probe.technique === "redirect" || probe.technique === "file") ? (probe.technique === "file" ? "hosted file" : "redirect") : null;
  const pinned = usePinned();
  // while you read a probe's hits its payloads fold into copy buttons in the header; a fresh probe
  // keeps its rows open, since copying one is the next step
  const reading = !!probe && probe.hits > 0;
  return { s, host, vs, presetRows, technique, unsaved, probe, reading, pinned, folded: reading && !pinned && !!vs };
}

// The probe header's copy buttons, while the rows are folded: one per variant (or per preset payload)
export function PayloadCopy({ tag, brief }: { tag: string; brief?: boolean }) {
  const { vs, presetRows, folded, probe } = usePayloads(tag);
  if (!folded || probe?.retiredAt) return null;
  // beside a plant line the callbacks are secondary: one button that shows them
  if (brief) return (
    <Button variant="ghost" size="sm" className="flex-none text-smoke" data-payloads title="The DNS, HTTP and HTTPS callbacks" onClick={() => setPinned(true)}>Callbacks<ChevronDown /></Button>
  );
  return (
    // one "Copy" names the group, so each button is just its payload's name (narrower, and it reads)
    <div className="flex flex-wrap items-center gap-0.5 max-[820px]:mr-auto" data-payloads>
      <span className="mr-0.5 text-label text-ash">Copy</span>
      {presetRows ? presetRows.slice(0, 3).map((p) => (
        <Button key={p.code} data-copy variant="ghost" size="sm" title={`${p.note ?? ""}\n${p.text}`} aria-label={`Copy ${p.name} payload`} onClick={() => copy(p.text, `${p.name} payload`)}>
          {p.name}
        </Button>
      )) : vs!.map((v) => (
        <Button key={v.proto} data-copy variant="ghost" size="sm" title={v.value} aria-label={`Copy ${v.proto.toUpperCase()} payload`} onClick={() => copy(v.value, `${v.proto.toUpperCase()} payload`)}>
          <TypeChip proto={v.proto} />
        </Button>
      ))}
      <Button variant="ghost" size="icon-sm" className="text-ash" aria-label="Show payloads" title="Show the payloads in full" onClick={() => setPinned(true)}><ChevronDown /></Button>
    </div>
  );
}

// The payload rows: the three variants (or a preset's rows) with copy buttons and notes. Under the
// probe header for a fresh probe or when shown; in the plant form as a preview of a new tag.
export function PayloadRows({ tag, previewTechnique, className, compact }: { tag: string | null; previewTechnique?: string; className?: string; compact?: boolean }) {
  const { s, vs, presetRows, technique, unsaved, probe, reading, pinned, folded } = usePayloads(tag, previewTechnique);
  const preview = !!previewTechnique;
  const [copyAs, setCopyAs] = useState<CopyAs>("raw");
  const [plain, setPlain] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const [retiredOpen, setRetiredOpen] = useState(false);
  useEffect(() => { setPlain(false); setAllRows(false); setRetiredOpen(false); }, [tag]);
  if (folded) return null;
  // a retired probe's payloads still reach Colluder, but offering them invites firing a probe you've
  // stopped watching: one line says so, with the rows one click away
  if (probe?.retiredAt && !retiredOpen) {
    return (
      <p className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-body text-ash", className)}>
        <span>Retired {dayOrTime(probe.retiredAt)}. Restore it to use these payloads again, or plant a new tag.</span>
        <Button variant="ghost" size="sm" className="text-smoke" onClick={() => setRetiredOpen(true)}>Show its payloads</Button>
      </p>
    );
  }
  const fold = reading && pinned && !preview ? <Button variant="ghost" size="sm" className="text-ash" onClick={() => setPinned(false)}>Fold payloads</Button> : null;
  return (
    <div data-payloads className={cn("min-w-0", className)}>
      {unsaved && <p className="mb-1 text-label text-amber" title="Planted, but its rule isn't saved yet: payloads copied now get the default reply">Default reply until you save its {unsaved}.</p>}
      {presetRows && !plain ? (
        <div className={cn("grid min-w-0 items-center gap-x-2.5 gap-y-0.5 max-[820px]:grid-cols-[minmax(0,1fr)_28px]", compact ? "grid-cols-[164px_minmax(0,1fr)_28px]" : "grid-cols-[164px_minmax(0,max-content)_28px_minmax(0,1fr)]")}>
          {(allRows ? presetRows : presetRows.slice(0, 3)).map((p) => (
            <div key={p.code} className="contents">
              <span title={p.note} className="flex items-center gap-2 text-body whitespace-nowrap text-smoke max-[820px]:col-span-full"><TypeChip proto={/^https:/.test(p.text) ? "https" : "http"} />{p.name}</span>
              <span className="truncate font-mono text-body text-smoke" title={compact && p.note ? `${p.text}\n${p.note}` : p.text}><Marked text={p.text} tag={tag!} code={p.code} /></span>
              <Button data-copy variant="ghost" size="icon-sm" aria-label={`Copy ${p.name} payload`} onClick={() => copy(asCopy(p.text, copyAs), `${p.name} payload${copyAs === "raw" ? "" : `, ${copyAs === "url" ? "URL-encoded" : copyAs === "json" ? "JSON-escaped" : "XML-escaped"}`}`)}><Copy /></Button>
              {!compact && <span className="truncate pl-2 text-label text-ash max-[1180px]:hidden" title={p.note}>{p.note}</span>}
            </div>
          ))}
          <div className="col-span-full mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ash">
            <span className="flex items-center gap-2">Copy
              <ToggleGroup type="single" value={copyAs} onValueChange={(v) => v && setCopyAs(v as CopyAs)} aria-label="Copy as" className="overflow-hidden rounded-[3px] border border-rule">
                {([["raw", "as is"], ["url", "URL-encoded"], ["json", "JSON"], ["xml", "XML"]] as [CopyAs, string][]).map(([v, l]) => (
                  <ToggleGroupItem key={v} value={v} className="h-[22px] rounded-none border-l border-rule px-2 text-label text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone">{l}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </span>
            {presetRows.length > 3 && <Button variant="ghost" size="sm" className="text-smoke" onClick={() => setAllRows(!allRows)}>{allRows ? "Show fewer" : `Show all ${presetRows.length} payloads`}</Button>}
            <Button variant="ghost" size="sm" className="text-ash" onClick={() => setPlain(true)}>Plain callbacks</Button>
            {fold}
          </div>
        </div>
      ) : (
        <div className={cn("grid min-w-0 auto-rows-[24px] items-center gap-x-2.5 max-[820px]:grid-cols-[52px_minmax(0,1fr)_54px]", compact ? "grid-cols-[62px_minmax(0,max-content)_54px]" : "grid-cols-[62px_minmax(0,max-content)_54px_minmax(0,1fr)]")}>
          {!vs ? (
            <p className="col-span-full flex items-center gap-2 text-body text-smoke">
              <LineForm kind="dash" />{s.status?.engine ? `No payload yet. ${s.status.engine.detail}` : "Waiting for the engine's payload…"}
            </p>
          ) : (
            <>
              {vs.map((v) => (
                <div key={v.proto} className="contents">
                  <TypeChip proto={v.proto} />
                  <span className="truncate font-mono text-body text-smoke" title={compact ? `${v.value}\n${v.note}` : v.value}>
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
                  {!compact && <span className="truncate pl-2 text-label text-ash max-[1180px]:hidden">{v.note}</span>}
                </div>
              ))}
              {preview && <p className="col-span-full text-label text-ash">Not planted yet: these already work, but Plant records the tag and target so the hits read as a story.</p>}
              {presetRows && plain && <Button variant="ghost" size="sm" className="col-span-full justify-self-start text-ash" onClick={() => setPlain(false)}>{PRESET_LABEL[technique ?? ""] ?? "Preset"} payloads</Button>}
              {fold && <div className="col-span-full justify-self-start">{fold}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// The plant form. Folded away until asked for (the Plant button, or p, /): planting is occasional,
// reading what came back is the everyday job.
export function Composer() {
  const s = useApp((x) => x);
  const [tag, setTag] = useState("");
  const [target, setTarget] = useState("");
  const [technique, setTechnique] = useState("callback");
  const [cloud, setCloud] = useState(CLOUDS[0].id);
  const [headDecoy, setHeadDecoy] = useState(true);
  const [xxeFile, setXxeFile] = useState(XXE_FILES[0][0]);
  const [xxeCustom, setXxeCustom] = useState("");
  const [err, setErr] = useState("");
  const tagRef = useRef<HTMLInputElement>(null);
  useEffect(() => { tagRef.current?.focus(); }, []);
  // a quick probe: leave Tag empty and it plants under a made-up name, shown in the field (the dice
  // deals another)
  const roll = () => quickTag((t) => s.probes.has(t));
  const [quick, setQuick] = useState(roll);

  const host = s.status?.payload?.host;
  const preview = tag && TAG_RE.test(tag) && !s.probes.has(tag) ? tag : null;
  const empty = s.loaded && !s.probes.size && !s.untagged?.hits;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tag && !TAG_RE.test(tag)) { setErr(BAD_TAG); tagRef.current?.focus(); return; }
    const tag_ = tag || (s.probes.has(quick) ? roll() : quick);
    try {
      const c = CLOUDS.find((x) => x.id === cloud)!;
      const file = xxeFile === "custom" ? xxeCustom.trim() : xxeFile;
      if (technique === "ssrf-metadata") await plant(tag_, target.trim(), technique, ssrfRule(c.url, headDecoy), `302 → ${hostOf(c.url)} (${c.provider}: ${c.name}) after 2 hops`);
      else if (technique === "xxe") {
        if (!host) throw new Error("No payload host yet: wait for the engine.");
        await plant(tag_, target.trim(), technique, xxeRule(tagged(tag_, host), file), `an XXE DTD reading ${file}`);
      }
      else await plant(tag_, target.trim(), technique);
      const next = technique === "redirect" ? '[aria-label="Location"]' : technique === "file" ? '[aria-label="Template"]' : null;
      setPlanting(false);
      // the next step: setting up the answer for Redirect / Hosted file, else copying a payload
      const focus = (n: number) => requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(next ?? "[data-payloads] button[data-copy]");
        if (el) el.focus(); else if (n > 0) focus(n - 1);
      });
      focus(60); // the editor appears once its rule loads
    }
    catch (ex) { setErr((ex as Error).message); }
  }

  const fld = "flex h-9 items-center gap-[9px] overflow-hidden rounded-[3px] border border-rule bg-soot px-3 whitespace-nowrap transition-colors focus-within:border-smoke";
  return (
    <section aria-label="Plant a probe" className="grid grid-cols-[132px_minmax(0,1fr)_auto] gap-x-0 gap-y-2.5 mx-2 mt-2 rounded-md border border-rule bg-soot-1 px-5 pt-3.5 pb-3 max-[820px]:mx-1.5 max-[820px]:grid-cols-[minmax(0,1fr)_auto] max-[820px]:px-3.5"
      onKeyDown={(e) => { if (e.key === "Escape" && !tag && !target && !empty) cancelPlanting(); }}>
      <h1 className="self-start pt-[6px] text-headline font-[650] max-[820px]:pt-0">Plant a probe</h1>
      <form onSubmit={submit} noValidate autoComplete="off"
        className="grid grid-cols-[minmax(200px,318px)_minmax(0,1fr)_236px_auto] gap-2.5 max-[1180px]:grid-cols-[minmax(160px,1fr)_minmax(0,1.4fr)_172px_auto] max-[820px]:col-span-full max-[820px]:row-start-2 max-[820px]:grid-cols-1">
        <label className={cn(fld, err && "border-bad")}>
          <span className="text-body font-[550] text-smoke">Tag</span>
          <input ref={tagRef} value={tag} maxLength={32} spellCheck={false} placeholder={quick} aria-invalid={!!err} aria-describedby="tag-err tag-quick"
            onChange={(e) => { const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); setTag(v); setErr(v && !TAG_RE.test(v) ? BAD_TAG : ""); }}
            className="min-w-0 flex-1 bg-transparent font-mono text-body text-bone outline-none placeholder:text-ash" />
          <span id="tag-quick" className="sr-only">{tag ? "" : `Left empty, the probe is planted as ${quick}.`}</span>
          {!tag && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Another made-up name" onClick={() => { setQuick(roll()); tagRef.current?.focus(); }}
                  className="-mx-1 flex size-6 flex-none items-center justify-center rounded-sm text-ash hover:bg-accent hover:text-bone focus-visible:outline-2 focus-visible:outline-smoke [&_svg]:size-3.5">
                  <Dices strokeWidth={1.5} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Left empty, the probe is planted as {quick}. The dice deals another name.</TooltipContent>
            </Tooltip>
          )}
          {host && <span className="font-mono text-body text-ash">-{shownId(host.split(".")[0])}</span>}
        </label>
        <label className={fld}>
          <span className="text-body font-[550] text-smoke">Target</span>
          <input value={target} maxLength={300} onChange={(e) => setTarget(e.target.value)} placeholder="Where you planted it, e.g. api.shop.example · POST /import url="
            className="min-w-0 flex-1 bg-transparent text-body text-bone outline-none placeholder:text-ash" />
        </label>
        <Select value={technique} onValueChange={setTechnique}>
          <SelectTrigger aria-label="Technique" className="h-9 w-full justify-start gap-[9px] rounded-[3px] border-rule bg-soot text-body [&>svg]:ml-auto">
            <span className="text-body font-[550] text-smoke max-[1180px]:sr-only max-[820px]:not-sr-only">Technique</span><SelectValue />
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
          <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body text-smoke">
            <Select value={xxeFile} onValueChange={setXxeFile}>
              <SelectTrigger aria-label="File to read" className="h-8 w-auto gap-[9px] rounded-[3px] border-rule bg-soot text-body"><span className="font-[550] text-smoke">File</span><SelectValue /></SelectTrigger>
              <SelectContent>{XXE_FILES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
            {xxeFile === "custom" && (
              <label className="flex h-8 w-[280px] items-center rounded-[3px] border border-rule bg-soot px-2.5 focus-within:border-smoke">
                <input aria-label="Path of the file to read" spellCheck={false} value={xxeCustom} onChange={(e) => setXxeCustom(e.target.value)} placeholder="/etc/issue or file:///…"
                  className="min-w-0 flex-1 bg-transparent font-mono text-body text-bone outline-none placeholder:font-sans placeholder:text-ash" />
              </label>
            )}
            <span className="max-w-[110ch] text-ash">Serves at once: a DTD that reads the file and sends it back as a hit, plus feed.xml and sitemap.xml for "import from URL" features. Modern Java rejects a newline in the URL, so keep to one-line files there; libxml2 2.9+ and .NET 4.5.2+ don't load external entities by default.</span>
          </div>
        )}
        {technique === "ssrf-metadata" && (
          <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body text-smoke">
            <Select value={cloud} onValueChange={setCloud}>
              <SelectTrigger aria-label="Cloud" className="h-8 w-auto gap-[9px] rounded-[3px] border-rule bg-soot text-body"><span className="font-[550] text-smoke">Cloud</span><SelectValue /></SelectTrigger>
              <SelectContent>{CLOUDS.map((c) => <SelectItem key={c.id} value={c.id}>{c.provider}: {c.name}</SelectItem>)}</SelectContent>
            </Select>
            <label className="flex cursor-pointer items-center gap-[7px]"><input type="checkbox" className="size-3.5 accent-bone" checked={headDecoy} onChange={(e) => setHeadDecoy(e.target.checked)} />Decoy reply for HEAD checks</label>
            <span className="text-ash">Serves at once: two hops back through the probe (301, 307), then 302 → <span className="font-mono">{hostOf(CLOUDS.find((x) => x.id === cloud)!.url)}</span>. A redirect can't do IMDSv2's PUT, so a 401 in the target's response means v2 is enforced.</span>
          </div>
        )}
      </form>
      {!empty
        ? <Button variant="ghost" size="icon" className="ml-2 self-start text-smoke max-[820px]:col-start-2 max-[820px]:row-start-1" aria-label="Close the plant form" title="Close (Esc)" onClick={cancelPlanting}><X /></Button>
        : <span />}
      {err && <p id="tag-err" className="col-start-2 -mt-1 text-body text-alarm-ink max-[820px]:col-start-1">{err}</p>}
      {preview && <PayloadRows tag={preview} previewTechnique={technique} className="col-start-2 max-[820px]:col-span-full max-[820px]:col-start-1" />}
    </section>
  );
}

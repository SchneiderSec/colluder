import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Copy, RefreshCw } from "lucide-react";
import { useApp, plant } from "@/store";
import { TAG_RE, UNTAGGED } from "@/lib/types";
import { variants } from "@/lib/raw";
import { copy } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LineForm, TypeChip } from "./bits";
import { cn } from "@/lib/utils";

const BAD_TAG = "Letters, digits and hyphens; can't start or end with a hyphen.";

export function Composer() {
  const s = useApp((x) => x);
  const [tag, setTag] = useState("");
  const [target, setTarget] = useState("");
  const [technique, setTechnique] = useState("callback");
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!TAG_RE.test(tag)) { setErr(tag ? BAD_TAG : "Give the probe a tag first, e.g. avatar."); tagRef.current?.focus(); return; }
    try {
      await plant(tag, target.trim(), technique);
      setTag(""); setTarget(""); setErr("");
      // next step is copying a payload: put focus there, not back in an emptied field
      requestAnimationFrame(() => varsRef.current?.querySelector<HTMLButtonElement>("button[data-copy]")?.focus());
    }
    catch (ex) { setErr((ex as Error).message); }
  }

  const fld = "flex h-9 items-center gap-[9px] overflow-hidden rounded-[3px] border border-rule bg-soot px-3 whitespace-nowrap transition-colors focus-within:border-smoke";
  return (
    <section aria-label="Plant a probe" className="grid grid-cols-[132px_minmax(0,1fr)] gap-y-2.5 border-b border-rule bg-soot-1 px-6 pt-3.5 pb-3 max-[820px]:grid-cols-1 max-[820px]:px-3.5">
      <h1 className="self-center text-[17px] font-[650]">Plant a probe</h1>
      <form onSubmit={submit} noValidate autoComplete="off"
        className="grid grid-cols-[minmax(200px,318px)_minmax(0,1fr)_214px_auto] gap-2.5 max-[1180px]:grid-cols-[minmax(160px,1fr)_minmax(0,1.4fr)_160px_auto] max-[820px]:grid-cols-1">
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
            <span className="text-[12.5px] font-[550] text-smoke">Technique</span><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="callback">Callback</SelectItem>
            <SelectItem value="redirect">Redirect</SelectItem>
            <SelectItem value="file">Hosted file</SelectItem>
            <SelectItem value="rebind" disabled>DNS rebinding (planned)</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="default" size="lg" className="h-9"><ArrowDownToLine />Plant</Button>
      </form>
      {err && <p id="tag-err" className="col-start-2 -mt-1 text-[12.5px] text-[#f3b4a3] max-[820px]:col-start-1">{err}</p>}

      <div className="pt-[3px] text-[12.5px] leading-[17px] text-smoke max-[820px]:flex max-[820px]:gap-1.5 max-[820px]:pt-0.5">
        {preview ? "Preview for" : shownTag ? "Payloads for" : "Base payload"}
        <span className="block truncate font-mono text-[12.5px] text-bone">{shownTag ?? "no tag"}</span>
      </div>
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
                      {parts.map(([k, t], i) => (k === "em" ? <em key={i} className="bg-[#3a2f22] px-px text-bone not-italic">{t}</em> : <span key={i}>{t}</span>))}
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
          </>
        )}
      </div>
    </section>
  );
}

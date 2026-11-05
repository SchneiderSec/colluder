// The Payload kit (PLAN-KIT.md): payloads for one probe, ready to copy. Generation only.
import { useMemo, useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { useApp } from "@/store";
import { UNTAGGED } from "@/lib/types";
import { SECTIONS, addressForms, bypasses, callbacks, encode, formUrl, type Enc, type Payload } from "@/lib/kit";
import { copy } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const READY = SECTIONS.filter((s) => s.ready);
type SectionId = (typeof READY)[number]["id"];
const TARGETS: [string, string][] = [["169.254.169.254", "AWS, Azure, GCP, Oracle, DigitalOcean"], ["127.0.0.1", "the target itself"], ["100.100.100.200", "Alibaba"], ["169.254.170.2", "AWS ECS"]];

const fld = "flex h-[30px] min-w-0 items-center rounded-[3px] border border-rule bg-well px-2.5 font-mono text-[12.5px] text-bone transition-colors focus-within:border-smoke";
const seg = "h-[26px] rounded-none border-l border-rule px-[11px] text-[12.5px] text-smoke first:border-l-0 data-[state=on]:bg-soot-2 data-[state=on]:font-semibold data-[state=on]:text-bone";

// the payload exactly as copied, with the tag marked and the variant code in Ash
function Marked({ text, tag, code }: { text: string; tag: string; code?: string }) {
  const words = [tag, code].filter(Boolean).map((w) => w!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![a-z0-9-])(${words.join("|")})(?![a-z0-9-])`, "g");
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push(text.slice(at, m.index));
    out.push(m[0] === tag ? <em key={m.index} className="bg-[#3a2f22] px-px text-bone not-italic">{m[0]}</em> : <span key={m.index} className="text-ash">{m[0]}</span>);
    at = m.index! + m[0].length;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

function Row({ name, code, text, note, tag }: { name: string; code?: string; text: string; note?: string; tag: string }) {
  return (
    <li className="grid grid-cols-[176px_minmax(0,1fr)_auto] items-start gap-x-4 border-b border-rule-2 py-2.5 max-[820px]:grid-cols-[minmax(0,1fr)_auto]">
      <span className="pt-px text-[12.5px] font-[550] text-smoke max-[820px]:col-span-full">{name}</span>
      <div className="min-w-0">
        <code className="block font-mono text-[12.5px] leading-[18px] break-all text-bone"><Marked text={text} tag={tag} code={code} /></code>
        {note && <p className="mt-1 max-w-[70ch] text-[11px] leading-4 text-ash">{note}</p>}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Copy ${name}`} onClick={() => copy(text, name)}><Copy /></Button>
    </li>
  );
}

function Field({ label, value, onChange, placeholder, w = "w-[260px]" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; w?: string }) {
  return (
    <label className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-smoke">
      {label}
      <span className={cn(fld, w)}><input aria-label={label} spellCheck={false} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none placeholder:font-sans placeholder:text-ash" /></span>
    </label>
  );
}

export function PayloadKit({ section }: { section: string | null }) {
  const s = useApp((x) => x);
  const host = s.status?.payload?.host;
  // latest activity first, like the probe list; the kit opens on the probe you were looking at
  const active = useMemo(() => {
    const t = (p: { lastHitAt?: string | null; plantedAt: string }) => Math.max(p.lastHitAt ? Date.parse(p.lastHitAt) : 0, Date.parse(p.plantedAt) || 0);
    return [...s.probes.values()].filter((p) => !p.retiredAt).sort((a, b) => t(b) - t(a));
  }, [s.probes]);
  const fallback = s.sel && s.sel !== UNTAGGED && s.probes.has(s.sel) ? s.sel : active[0]?.tag ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const tag = picked && s.probes.has(picked) ? picked : fallback;
  const sec: SectionId = (READY.find((x) => x.id === section)?.id ?? "callbacks") as SectionId;
  const [enc, setEnc] = useState<Enc>("raw");
  const [expected, setExpected] = useState("");
  const [ip, setIp] = useState("169.254.169.254");
  const [path, setPath] = useState("/latest/meta-data/");

  if (!host || !tag) {
    return (
      <div className="min-h-0 overflow-auto px-8 py-7 max-[820px]:px-4">
        <h1 className="text-[17px] font-bold">Payload kit</h1>
        <p className="mt-3 max-w-[64ch] text-[13.5px] text-smoke">{!host ? "Waiting for the engine's payload host." : <>Plant a probe first: every payload here calls back to one. <a className="text-bone underline underline-offset-2" href="#probes">Plant a probe</a></>}</p>
      </div>
    );
  }

  const rows: Payload[] = sec === "callbacks" ? callbacks(tag, host) : sec === "bypass" ? bypasses(tag, host, expected) : [];
  const forms = sec === "address" ? addressForms(ip) : null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[208px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] max-[820px]:block">
      <header className="col-span-full flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-rule px-8 py-4 max-[820px]:px-4">
        <h1 className="text-[17px] font-bold">Payload kit</h1>
        <Select value={tag} onValueChange={setPicked}>
          <SelectTrigger aria-label="Probe" className="h-[30px] w-auto min-w-[150px] gap-2 rounded-[3px] border-rule bg-transparent px-2.5 font-mono text-[13.5px]"><span className="font-sans text-[12.5px] text-smoke">Probe</span><SelectValue /></SelectTrigger>
          <SelectContent>{active.map((p) => <SelectItem key={p.tag} value={p.tag} className="font-mono">{p.tag}</SelectItem>)}</SelectContent>
        </Select>
        <code className="min-w-0 truncate font-mono text-[12.5px] text-smoke"><Marked text={`${tag}.${host}`} tag={tag} /></code>
        <span className="ml-auto flex items-center gap-2.5 text-[12.5px] text-smoke">
          Copy
          <ToggleGroup type="single" value={enc} onValueChange={(v) => v && setEnc(v as Enc)} aria-label="Encoding" className="overflow-hidden rounded-[3px] border border-rule">
            {([["raw", "as is"], ["once", "URL-encoded"], ["twice", "encoded twice"]] as [Enc, string][]).map(([v, l]) => <ToggleGroupItem key={v} value={v} className={seg}>{l}</ToggleGroupItem>)}
          </ToggleGroup>
        </span>
      </header>

      <nav aria-label="Payload kit sections" className="border-r border-rule py-3 max-[820px]:flex max-[820px]:overflow-x-auto max-[820px]:border-r-0 max-[820px]:border-b max-[820px]:px-2 max-[820px]:py-1.5">
        {READY.map((x) => (
          <a key={x.id} href={`#kit/${x.id}`} aria-current={x.id === sec ? "page" : undefined}
            className={cn("block px-8 py-[7px] text-[13.5px] whitespace-nowrap text-smoke hover:text-bone max-[820px]:px-3", x.id === sec && "bg-soot-2 font-semibold text-bone")}>{x.label}</a>
        ))}
      </nav>

      <section aria-label={READY.find((x) => x.id === sec)!.label} className="min-h-0 overflow-auto px-8 pt-4 pb-10 max-[820px]:px-4">
        <div className="max-w-[1000px]">
          {sec === "callbacks" && <p className="max-w-[72ch] text-[12.5px] leading-[19px] text-smoke">Ways to make a target call <span className="font-mono text-bone">{tag}</span>. Each carries a short variant code, shown in grey, in the name or path, so the hit says which one fired.</p>}
          {sec === "bypass" && (
            <>
              <p className="max-w-[72ch] text-[12.5px] leading-[19px] text-smoke">For a URL field that only accepts certain hosts: the validator reads the host it expects, the fetcher connects to <span className="font-mono text-bone">{tag}</span>. Plain HTTP, so the code is a DNS label and still shows when the path is dropped.</p>
              <div className="mt-3"><Field label="Host the target expects" value={expected} onChange={setExpected} placeholder="api.shop.example" /></div>
            </>
          )}
          {sec === "address" && (
            <>
              <p className="max-w-[72ch] text-[12.5px] leading-[19px] text-smoke">The same internal address written the ways filters miss. These go to the target, not to a probe, so a working one shows up as data in a response, not as a hit; pair them with a redirect from the probe's HTTP response tab.</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Field label="Address" value={ip} onChange={setIp} w="w-[170px]" />
                <Field label="Path" value={path} onChange={setPath} w="w-[220px]" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[12.5px]">
                {TARGETS.map(([a, who]) => (
                  <button key={a} type="button" onClick={() => setIp(a)} className={cn("rounded-[3px] border border-rule px-2 py-0.5 text-smoke hover:text-bone", ip === a && "border-smoke text-bone")}>
                    <span className="font-mono">{a}</span> <span className="text-ash">{who}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <ul className="mt-3 border-t border-rule-2">
            {rows.map((p) => <Row key={p.code} name={p.name} code={p.code} text={encode(p.text, enc)} note={p.note} tag={tag} />)}
            {forms?.map((f) => <Row key={f.name} name={f.name} text={encode(formUrl(f, path), enc)} note={f.note} tag={tag} />)}
          </ul>
          {sec === "address" && !forms && <p role="alert" className="mt-3 text-[12.5px] text-bad">Type an IPv4 address, like 169.254.169.254.</p>}
        </div>
      </section>
    </div>
  );
}

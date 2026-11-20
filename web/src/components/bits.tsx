import { useEffect, useState, type ReactNode } from "react";
import { Cloud, CornerUpRight, FileCode2, FileText, PhoneIncoming, type LucideIcon } from "lucide-react";
import { onToast, dismiss, type Toast } from "@/lib/toast";
import { protoKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const INK: Record<string, string> = { dns: "text-dns", http: "text-http", https: "text-https", smtp: "text-smtp", other: "text-other" };
export const inkClass = (p: string) => INK[protoKey(p)];

// Protocol chip: colour square + word (never colour alone)
export function TypeChip({ proto, children, className }: { proto: string; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-body font-[650] tracking-[.03em] whitespace-nowrap before:size-2 before:rounded-[2px] before:bg-current before:content-['']", inkClass(proto), className)}>
      {children ?? proto.toUpperCase()}
    </span>
  );
}

export const NewDot = ({ title = "New" }: { title?: string }) => <i title={title} className="inline-block size-1.5 flex-none rounded-full bg-amber" />;
export const NilDot = () => <i className="inline-block w-1.5 flex-none" />;
export const Chip = ({ children, grey }: { children: ReactNode; grey?: boolean }) => (
  <span className={cn("rounded-[9px] border px-[7px] text-label leading-[1.0625rem] font-[650] tracking-[.04em] whitespace-nowrap",
    grey ? "border-rule bg-soot text-smoke" : "border-caution-border bg-caution-ground text-amber")}>{children}</span>
);

// What a probe was planted to do, as a drawn mark and a word: the probe list and header use it so
// an SSRF probe and an XXE probe stop looking alike
const TECHNIQUES: Record<string, [string, LucideIcon]> = {
  callback: ["Default reply", PhoneIncoming], "ssrf-metadata": ["SSRF → metadata", Cloud], xxe: ["XXE", FileCode2],
  redirect: ["Redirect", CornerUpRight], file: ["Hosted file", FileText],
};
export const techniqueLabel = (t?: string | null) => TECHNIQUES[t ?? ""]?.[0] ?? null;
export const techniqueIcon = (t?: string | null) => TECHNIQUES[t ?? ""]?.[1] ?? null;

// Claude Code's mark (the pixel robot), for probes Claude planted through the MCP, in Claude's own
// orange (--claude, #D97757) so it reads as Claude at a glance. The fill is the colour itself, not
// currentColor: menus colour every icon inside them (`[&_svg]:text-smoke`), and this one must stay orange.
const CLAUDE_CODE = "M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z";
export function ClaudeMark({ className, title = "Planted by Claude" }: { className?: string; title?: string | null }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-3.5 flex-none", className)} role={title ? "img" : undefined} aria-label={title ?? undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={CLAUDE_CODE} fill="var(--claude)" fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}
export function TechniqueMark({ technique, className }: { technique?: string | null; className?: string }) {
  const t = TECHNIQUES[technique ?? ""];
  if (!t) return null;
  const [label, Icon] = t;
  return (
    <span className={cn("inline-flex flex-none items-center gap-1 text-label font-[650] tracking-[.03em] whitespace-nowrap text-smoke", className)}>
      <Icon className="size-3 text-ash" strokeWidth={1.75} aria-hidden="true" />{label}
    </span>
  );
}

// Liveness drawn as line form. Live lines move, and each live thing moves its own way, so they read
// as different signals rather than one repeated tick:
//   beat     the engine: a heartbeat trace with a beat running through it, then a rest
//   packets  the stream: two small packets travelling along the wire
//   echo     the edge: a pulse that goes out and comes back (request, answer)
//   listen   an armed probe: a slower pulse coming in from the right; each probe has its own phase
//   sparse   alerts: one pulse, then a long rest
//   pulse    anything else live
// dashed = starting/reconnecting; struck = down; off = still and dim, off by choice. With reduced
// motion the movement stops and the wire is solid (the engine keeps its heartbeat shape).
export type Signal = "pulse" | "beat" | "packets" | "echo" | "listen" | "sparse";
const SIGNAL_MS: Record<Signal, number> = { pulse: 1800, beat: 2200, packets: 1300, echo: 1100, listen: 2800, sparse: 4200 };
const WIRE = "M1 4h20";
const HEARTBEAT = "M1 4h6.5l1.5-2.6 2 5.2 2-5.2 1.5 2.6h6.5";
const hash = (t: string) => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export function LineForm({ kind, signal = "pulse", seed, className }: { kind: "live" | "dash" | "down" | "off"; signal?: Signal; seed?: string; className?: string }) {
  const ms = SIGNAL_MS[signal];
  // a seed (a probe's tag) gives it its own phase; without one, every line of that signal runs in step
  const [delay] = useState(() => `-${(seed ? hash(seed) : Date.now()) % (signal === "echo" ? ms * 2 : ms)}ms`);
  const d = kind === "live" && signal === "beat" ? HEARTBEAT : WIRE;
  return (
    <svg viewBox="0 0 22 8" className={cn("h-2 w-[22px] flex-none overflow-visible", kind === "off" && "opacity-45", className)} aria-hidden="true">
      <path d={d} pathLength={20} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeDasharray={kind === "dash" ? "3 3" : undefined}
        className={kind === "live" ? cn("live-base", signal === "listen" && "live-base-quiet") : undefined} />
      {kind === "live" && <path d={d} pathLength={20} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        className={`live-pulse sig-${signal}`} style={{ animationDelay: delay }} />}
      {kind === "down" && <path d="M8 7.5l6-7" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  );
}

export function Toaster() {
  const [t, setT] = useState<Toast | null>(null);
  // the last toast stays rendered while it fades out, so it doesn't blank mid-transition
  const [last, setLast] = useState<Toast | null>(null);
  useEffect(() => onToast((x) => { setT(x); if (x) setLast(x); }), []);
  const shown = t ?? last;
  return (
    <div role="status" aria-live="polite"
      className={cn("fixed bottom-[92px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded px-3.5 py-[7px] text-body font-semibold text-soot shadow-[0_6px_18px_rgba(0,0,0,.4)] transition-[opacity,translate] duration-300 ease-out-expo",
        t ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0", !t?.action && "pointer-events-none", shown?.bad ? "bg-alarm-ink" : "bg-bone")}>
      <span>{shown?.msg}</span>
      {t?.action && (
        <button type="button" onClick={() => { const a = t.action!; dismiss(); a.run(); }}
          className="-my-1 -mr-1.5 cursor-pointer rounded-sm px-2 py-1 underline decoration-soot/50 underline-offset-2 hover:bg-soot/10 hover:decoration-soot focus-visible:outline-2 focus-visible:outline-soot">{t.action.label}</button>
      )}
    </div>
  );
}

// re-render every `ms` (relative times, clock)
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const i = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(i); }, [ms]);
}

import { useEffect, useState, type ReactNode } from "react";
import { onToast } from "@/lib/toast";
import { protoKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const INK: Record<string, string> = { dns: "text-dns", http: "text-http", https: "text-https", smtp: "text-smtp", other: "text-other" };
export const inkClass = (p: string) => INK[protoKey(p)];

// Protocol chip: colour square + word (never colour alone)
export function TypeChip({ proto, children, className }: { proto: string; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-[650] tracking-[.03em] whitespace-nowrap before:size-2 before:rounded-[2px] before:bg-current before:content-['']", inkClass(proto), className)}>
      {children ?? proto.toUpperCase()}
    </span>
  );
}

export const NewDot = ({ title = "New" }: { title?: string }) => <i title={title} className="inline-block size-1.5 flex-none rounded-full bg-amber" />;
export const NilDot = () => <i className="inline-block w-1.5 flex-none" />;
export const Chip = ({ children, grey }: { children: ReactNode; grey?: boolean }) => (
  <span className={cn("rounded-[9px] border px-[7px] text-[11px] leading-[17px] font-[650] tracking-[.04em] whitespace-nowrap",
    grey ? "border-rule bg-soot text-smoke" : "border-[#6b5126] bg-[#2b2113] text-amber")}>{children}</span>
);

// Liveness drawn as line form: solid = live, dashed = starting/reconnecting, struck = down
export function LineForm({ kind, className }: { kind: "live" | "dash" | "down"; className?: string }) {
  return (
    <svg viewBox="0 0 22 8" className={cn("h-2 w-[22px] flex-none", className)} aria-hidden="true">
      <path d="M1 4h20" stroke="currentColor" strokeWidth="1.6" strokeDasharray={kind === "dash" ? "3 3" : undefined} />
      {kind === "down" && <path d="M8 7.5l6-7" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  );
}

export function Toaster() {
  const [t, setT] = useState<{ id: number; msg: string; bad: boolean } | null>(null);
  useEffect(() => onToast(setT), []);
  return (
    <div role="status" aria-live="polite"
      className={cn("pointer-events-none fixed bottom-[92px] left-1/2 z-50 -translate-x-1/2 rounded px-3.5 py-[7px] text-[12.5px] font-semibold text-soot shadow-[0_6px_18px_rgba(0,0,0,.4)] transition-all duration-300 ease-out-expo",
        t ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0", t?.bad ? "bg-[#f3b4a3]" : "bg-bone")}>
      {t?.msg}
    </div>
  );
}

// re-render every `ms` (relative times, clock)
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const i = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(i); }, [ms]);
}

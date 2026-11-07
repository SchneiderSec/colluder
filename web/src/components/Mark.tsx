import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// The Colluder mark: a raccoon's bandit mask (Domino), one eye open, one winking.
// States: wink (resting) · open (new hit) · blink (connecting) · doze (idle for hours) · mirror (after washing).
export type MarkState = "wink" | "open" | "blink" | "doze" | "mirror";
const C = { fur: "#9a9084", mask: "#0f0c09", shine: "#f2b33d", hl: "#fff4d6", dim: "#5d554b" };
const MASK = "M4 30C4 22 14 19 24 21C28 22 30 24 32 24C34 24 36 22 40 21C50 19 60 22 60 30C60 39 52 44 44 43C38 42 35 38 32 38C29 38 26 42 20 43C12 44 4 39 4 30Z";
const L: [number, number] = [19, 31], R: [number, number] = [45, 31], r = 5;

const Open = ({ x, y, k = 1 }: { x: number; y: number; k?: number }) => (
  <g className="eye"><circle cx={x} cy={y} r={r * k} fill={C.shine} /><circle cx={x + r * 0.35} cy={y - r * 0.38} r={r * 0.3} fill={C.hl} /></g>
);
const Wink = ({ x, y }: { x: number; y: number }) => (
  <path className="eye" d={`M${x - r} ${y + 1.5}Q${x} ${y - r * 1.3} ${x + r} ${y + 1.5}`} stroke={C.shine} strokeWidth={r * 0.6} strokeLinecap="round" fill="none" />
);
const Shut = ({ x, y }: { x: number; y: number }) => (
  <path className="eye" d={`M${x - r} ${y - 1}Q${x} ${y + r * 1.1} ${x + r} ${y - 1}`} stroke={C.dim} strokeWidth={r * 0.55} strokeLinecap="round" fill="none" />
);

export function MarkSvg({ state = "wink", size = 36, badge = false }: { state?: MarkState; size?: number; badge?: boolean }) {
  const eyes = {
    open: <><Open x={L[0]} y={L[1]} k={1.08} /><Open x={R[0]} y={R[1]} k={1.08} /></>,
    doze: <><Shut x={L[0]} y={L[1]} /><Shut x={R[0]} y={R[1]} /></>,
    blink: <><Open x={L[0]} y={L[1]} /><Open x={R[0]} y={R[1]} /></>,
    mirror: <><Wink x={L[0]} y={L[1]} /><Open x={R[0]} y={R[1]} /></>,
    wink: <><Open x={L[0]} y={L[1]} /><Wink x={R[0]} y={R[1]} /></>,
  }[state];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill={C.fur} />
      <path d={MASK} fill={C.mask} />
      {eyes}
      {size > 20 && (
        <g className="paws"><circle cx="24" cy="52" r="5" fill={C.fur} stroke={C.mask} strokeWidth="2" /><circle cx="40" cy="52" r="5" fill={C.fur} stroke={C.mask} strokeWidth="2" /></g>
      )}
      {badge && <circle cx="54" cy="10" r="10" fill={C.shine} stroke="var(--soot)" strokeWidth="3" />}
    </svg>
  );
}

const LABEL: Record<MarkState, string> = {
  wink: "Colluder", open: "Colluder: new hit", blink: "Colluder: connecting", doze: "Colluder: dozing, no traffic for a while", mirror: "Colluder",
};

// base comes from liveness; pulse increments on every new hit.
export function Mark({ base, pulse }: { base: "wink" | "blink" | "doze"; pulse: number }) {
  const [flash, setFlash] = useState<{ state: MarkState; cls: string } | null>(null);
  const prevBase = useRef(base);
  const prevPulse = useRef(pulse);
  const clicks = useRef<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (pulse === prevPulse.current) return;
    prevPulse.current = pulse;
    const waking = base === "doze" || prevBase.current === "doze";
    setFlash({ state: "open", cls: waking ? "mk-wake" : "mk-pop" });
    later(1600, () => setFlash(null));
  }, [pulse, base]);

  useEffect(() => {
    if (prevBase.current === "doze" && base === "wink") { setFlash({ state: "open", cls: "mk-wake" }); later(900, () => setFlash(null)); }
    prevBase.current = base;
  }, [base]);

  const onClick = () => {
    const now = Date.now();
    clicks.current = clicks.current.filter((t) => now - t < 2500).concat(now);
    if (clicks.current.length < 5) return;
    clicks.current = [];
    setFlash({ state: "doze", cls: "mk-wash" }); // eyes shut while it washes its paws
    later(1900, () => setFlash({ state: "mirror", cls: "" }));
    later(2800, () => setFlash(null));
  };

  const st: MarkState = flash?.state ?? base;
  const cls = flash?.cls ?? (base === "blink" ? "mk-blink" : "");
  return (
    <button type="button" onClick={onClick} aria-label={LABEL[st]} className={cn("mb-3.5 flex-none cursor-pointer rounded-[15px] p-0 max-[820px]:my-1.5 max-[820px]:mr-1 max-[820px]:[&_svg]:size-8", cls)}>
      <MarkSvg state={st} size={36} />
    </button>
  );
}

// Favicon with an amber unread dot, drawn from the same SVG.
let lastFav = "";
export function setFavicon(unread: number, svg: string) {
  const key = unread ? "u" : "n";
  if (key === lastFav) return;
  lastFav = key;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    c.getContext("2d")!.drawImage(img, 0, 0, 64, 64);
    (document.getElementById("favicon") as HTMLLinkElement).href = c.toDataURL("image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));
}

export function Peek() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const a = requestAnimationFrame(() => requestAnimationFrame(() => setUp(true)));
    const b = setTimeout(() => setUp(false), 1900);
    return () => { cancelAnimationFrame(a); clearTimeout(b); };
  }, []);
  return (
    <svg className={cn("peek", up && "up")} viewBox="0 0 120 90" aria-hidden="true">
      <path d="M22 40L18 8L44 26Z M98 40L102 8L76 26Z" fill={C.fur} stroke={C.mask} strokeWidth="2" />
      <path d="M24 16L28 30L36 26Z M96 16L92 30L84 26Z" fill={C.mask} />
      <ellipse cx="60" cy="56" rx="44" ry="34" fill={C.fur} />
      <path d="M14 52C14 44 30 40 44 43C50 44 56 47 60 47C64 47 70 44 76 43C90 40 106 44 106 52C106 62 92 66 80 64C72 63 66 58 60 58C54 58 48 63 40 64C28 66 14 62 14 52Z" fill={C.mask} />
      <circle cx="38" cy="53" r="6" fill={C.shine} />
      <path d="M76 55Q82 46 88 55" stroke={C.shine} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <ellipse cx="60" cy="70" rx="6" ry="4" fill={C.mask} />
      <ellipse cx="34" cy="88" rx="12" ry="8" fill={C.fur} stroke={C.mask} strokeWidth="2" />
      <ellipse cx="86" cy="88" rx="12" ry="8" fill={C.fur} stroke={C.mask} strokeWidth="2" />
    </svg>
  );
}

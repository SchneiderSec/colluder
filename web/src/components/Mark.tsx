import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Species } from "@/lib/crew";
import { cn } from "@/lib/utils";

// The Colluder mark: a raccoon's bandit mask (Domino), one eye open, one winking.
// States: wink (resting) · open (new hit) · blink (connecting) · doze (idle for hours) · mirror (after washing).
export type MarkState = "wink" | "open" | "blink" | "doze" | "mirror";
const C = { fur: "#9a9084", mask: "#0f0c09", shine: "#f2b33d", hl: "#fff4d6", dim: "#5d554b" };
const MASK = "M4 30C4 22 14 19 24 21C28 22 30 24 32 24C34 24 36 22 40 21C50 19 60 22 60 30C60 39 52 44 44 43C38 42 35 38 32 38C29 38 26 42 20 43C12 44 4 39 4 30Z";
const L: [number, number] = [19, 31], R: [number, number] = [45, 31], r = 5;

const Open = ({ x, y, k = 1, ink = C.shine }: { x: number; y: number; k?: number; ink?: string }) => (
  <g className="eye"><circle cx={x} cy={y} r={r * k} fill={ink} /><circle cx={x + r * 0.35} cy={y - r * 0.38} r={r * 0.3} fill={C.hl} /></g>
);
const Wink = ({ x, y, ink = C.shine }: { x: number; y: number; ink?: string }) => (
  <path className="eye" d={`M${x - r} ${y + 1.5}Q${x} ${y - r * 1.3} ${x + r} ${y + 1.5}`} stroke={ink} strokeWidth={r * 0.6} strokeLinecap="round" fill="none" />
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

// The crew: every probe is an animal wearing the Colluder's bandit mask (lib/crew.ts deals its kind and
// coat). One head, one mask, one pair of eyes for all of them; the kind is in the ears, the muzzle and
// the beak, drawn to still read at 18px. A dark outline keeps light coats clear on light themes.
// Eyes: a cream wink while armed, shut once retired, and amber (with the badge) only for hits you
// haven't seen: amber stays the colour of "new".
const INK = C.mask;
const LIGHT = "rgba(255,248,235,.55)"; // muzzles, cheeks, faces: lighter fur of the same coat
const SHADE = "rgba(15,12,9,.3)"; // inner ears
const CREAM = "#f3ead9"; // beaks and teeth
const PINK = "#e7a3ad"; // noses and inner ears of the small ones
const line = { stroke: "rgba(15,12,9,.6)", strokeWidth: 2.5, strokeLinejoin: "round" as const };
// draw a part, then its mirror image across the face
const Both = ({ children }: { children: ReactNode }) => <>{children}<g transform="translate(64 0) scale(-1 1)">{children}</g></>;
const Whiskers = () => <Both><path d="M22 51L7 48M22 54L7 56" stroke={INK} strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" /></Both>;
const Snout = ({ r = 10 }: { r?: number }) => <><ellipse cx="32" cy="52" rx={r} ry={r * 0.72} fill={LIGHT} /><ellipse cx="32" cy="48.5" rx="4.2" ry="3" fill={INK} /></>;

// behind the head (ears, crests) and in front of it (faces, muzzles); the mask and eyes go on top
const KIND: Record<Species, { back?: (c: string) => ReactNode; front?: (c: string) => ReactNode; top?: ReactNode }> = {
  raccoon: {
    // rounded ears, the white brow above the mask, a pale muzzle
    back: (c) => <Both><path d="M11 28Q7 11 17 9Q25 9 28 18Z" fill={c} {...line} /><path d="M14.5 24Q12.5 14 17.5 13Q22 13.5 23.5 18.5Z" fill={SHADE} /></Both>,
    front: () => <><path d="M11 31Q32 13 53 31Q32 22.5 11 31Z" fill={LIGHT} /><Snout r={9} /></>,
  },
  cat: {
    back: (c) => <Both><path d="M10 30L12 3L29 17Z" fill={c} {...line} /><path d="M14 23L14.8 10L23 17Z" fill={SHADE} /></Both>,
    top: <><path d="M28.5 48h7L32 52Z" fill={PINK} /><Whiskers /></>,
  },
  fox: {
    back: (c) => <Both><path d="M9 32L10 0L31 17Z" fill={c} {...line} /><path d="M10.2 13L10 0L17.5 6.5Z" fill={INK} /></Both>,
    front: () => <path d="M8.5 40Q22 45 32 60Q42 45 55.5 40Q53 57 32 61Q11 57 8.5 40Z" fill={LIGHT} />,
    top: <circle cx="32" cy="56" r="3.2" fill={INK} />,
  },
  bear: {
    back: (c) => <Both><circle cx="13" cy="18" r="9" fill={c} {...line} /><circle cx="13" cy="18" r="4.5" fill={SHADE} /></Both>,
    front: () => <Snout r={11} />,
  },
  rabbit: {
    back: (c) => <Both><ellipse cx="23" cy="10" rx="6" ry="13" transform="rotate(-10 23 10)" fill={c} {...line} /><ellipse cx="23" cy="11" rx="2.6" ry="9" transform="rotate(-10 23 11)" fill={PINK} opacity=".75" /></Both>,
    front: () => <><rect x="29" y="53" width="6" height="5.5" rx="1" fill={CREAM} stroke={INK} strokeOpacity=".5" strokeWidth="1" /><path d="M32 53v5.5" stroke={INK} strokeOpacity=".5" strokeWidth="1" /></>,
    top: <path d="M29.5 48.5h5L32 51.5Z" fill={PINK} />,
  },
  bird: {
    back: (c) => <><path d="M29 18Q20 8 22 2Q29 7 32 16Z" fill={c} {...line} /><path d="M31 17Q30 5 34 0Q38 7 35 17Z" fill={c} {...line} /><path d="M35 18Q40 7 46 5Q44 13 38 19Z" fill={c} {...line} /></>,
    top: <path d="M25.5 46h13L32 58Z" fill={CREAM} stroke={INK} strokeOpacity=".6" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  monkey: {
    back: (c) => <Both><circle cx="7" cy="37" r="8" fill={c} {...line} /><circle cx="7" cy="37" r="4.2" fill={LIGHT} /></Both>,
    front: () => <path d="M14 39Q14 27 26 28.5Q32 30.5 38 28.5Q50 27 50 39Q50 58 32 59.5Q14 58 14 39Z" fill={LIGHT} />,
    top: <><circle cx="29.6" cy="50.5" r="1.6" fill={INK} /><circle cx="34.4" cy="50.5" r="1.6" fill={INK} /><path d="M27 54.5Q32 57.5 37 54.5" stroke={INK} strokeOpacity=".6" strokeWidth="1.6" fill="none" strokeLinecap="round" /></>,
  },
  owl: {
    // tufts that flare outward, pale discs round the eyes, a short beak and chest feathers
    back: (c) => <Both><path d="M14 22L1 9L24 15Z" fill={c} {...line} /></Both>,
    front: () => <><Both><circle cx="21" cy="36" r="12.5" fill={LIGHT} /></Both><Both><path d="M21 54l3.5 3.5L28 54" stroke={LIGHT} strokeWidth="2.2" fill="none" strokeLinecap="round" /></Both></>,
    top: <path d="M28.5 44h7L32 51.5Z" fill={CREAM} stroke={INK} strokeOpacity=".6" strokeWidth="1.4" strokeLinejoin="round" />,
  },
  mouse: {
    back: (c) => <Both><circle cx="12" cy="17" r="11" fill={c} {...line} /><circle cx="12" cy="17" r="6" fill={PINK} opacity=".6" /></Both>,
    top: <><circle cx="32" cy="51.5" r="2.6" fill={INK} /><Whiskers /></>,
  },
  shark: {
    // a swept dorsal fin, pectoral fins, the pale belly sharks wear, gill slits; the jaw is drawn by
    // CrewMark (it bites)
    back: (c) => <><path d="M26.5 18.5Q30 4 44.5 -1.5Q38 8.5 40 18.5Z" fill={c} {...line} /><Both><path d="M13 49Q2 54.5 0.5 62Q11 61.5 18.5 55Z" fill={c} {...line} /></Both></>,
    front: () => <path d="M9 43Q32 50.5 55 43Q53 59.5 32 61Q11 59.5 9 43Z" fill={LIGHT} />,
    top: <Both><path d="M12.6 45q-1.5 2.7 0 5.4M15.4 46q-1.5 2.7 0 5.4" stroke={INK} strokeOpacity=".5" strokeWidth="1.3" fill="none" strokeLinecap="round" /></Both>,
  },
  dog: {
    front: (c) => <><Both><path d="M11 21Q2 29 5 46Q9 51 14 45Q16 33 19 24Z" fill={c} {...line} /><path d="M11 21Q2 29 5 46Q9 51 14 45Q16 33 19 24Z" fill={SHADE} /></Both><Snout r={10} /></>,
    top: <path d="M30 57Q32 61.5 34 57Z" fill={PINK} />,
  },
};

// The shark's jaw: a row of teeth on each side of a dark mouth, hinged at the top lip. At rest it's
// nearly shut (a toothy grin); open is 1.
const TOP_TEETH = [19.5, 23.5, 27.5, 31.5, 35.5, 39.5, 43.5].map((x) => `M${x - 2} 49.6l2 4.2l2-4.2Z`).join("");
const LOW_TEETH = ([[21.5, 58.4], [25.5, 60.4], [29.5, 61.6], [33.5, 61.7], [37.5, 60.9], [41.5, 59]] as const).map(([x, y]) => `M${x - 2} ${y}l2-4l2 4Z`).join("");
const Jaw = ({ open }: { open: number }) => (
  <g style={{ transformOrigin: "32px 50px", transform: `scaleY(${open})`, transition: "transform 120ms cubic-bezier(.3,1.5,.5,1)" }}>
    <path d="M17 50Q32 47.5 47 50Q45 61 32 62Q19 61 17 50Z" fill="#2a0d10" stroke={INK} strokeOpacity=".6" strokeWidth="1.2" />
    <path d={TOP_TEETH} fill={CREAM} /><path d={LOW_TEETH} fill={CREAM} />
  </g>
);
// Easter eggs: click any crew member three times in a row and it does its trick. The click still
// does whatever the row does. The movement is CSS keyframes on the parts below ("Crew tricks" in
// index.css); the eyes and the shark's jaw are timed here, beat by beat. Each trick's parts rest in
// its key pose (hands over the eyes, tongue out), so reduced motion shows the pose without the moves.
type Eyes = "rest" | "shut" | "mirror" | "hidden";
type Beat = { ms: number; eyes?: Eyes; jaw?: number };
const TRICKS: Record<Species, Beat[]> = {
  raccoon: [{ ms: 650, eyes: "hidden" }, { ms: 800, eyes: "mirror" }], // pulls the mask over its eyes, then winks the other eye
  cat: [{ ms: 750 }], // swats a paw at the cursor
  fox: [{ ms: 850 }], // crouches, then pounces nose-first
  bear: [{ ms: 900 }, { ms: 2600, eyes: "shut" }], // yawns, then naps
  rabbit: [{ ms: 800 }], // hops, ears flopping on the landing
  bird: [{ ms: 1100 }], // flaps its crest and lifts off
  monkey: [{ ms: 1500 }], // see no evil
  owl: [{ ms: 1000 }], // turns its head all the way round
  mouse: [{ ms: 1100 }], // whiskers twitch, then it shrinks back
  dog: [{ ms: 1500 }], // pants
  shark: [{ ms: 240, jaw: 1 }, { ms: 190, jaw: 0.04 }], // bites: jaws wide, then snap
};
function useTrick(species: Species) {
  const [beat, setBeat] = useState(-1);
  const [run, setRun] = useState(0); // remounts the parts, so a trick restarts from the top
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const play = () => {
    timers.current.forEach(clearTimeout);
    setRun((n) => n + 1);
    setBeat(0);
    let at = 0;
    timers.current = TRICKS[species].map((b, i) => (at += b.ms, window.setTimeout(() => setBeat(i + 1 < TRICKS[species].length ? i + 1 : -1), at)));
  };
  return { beat, run, step: beat < 0 ? null : TRICKS[species][beat], play };
}

// the props a trick brings on: paws, hands, a tongue, a yawn, the z's of a nap
function Prop({ species, coat, beat }: { species: Species; coat: string; beat: number }) {
  if (species === "cat") return (
    <g className="cm-paw"><ellipse cx="50" cy="50" rx="7.5" ry="6.5" fill={coat} {...line} />
      <path d="M46.5 45.5v3M50 44.5v3.5M53.5 45.5v3" stroke={INK} strokeOpacity=".5" strokeWidth="1.3" strokeLinecap="round" /></g>
  );
  if (species === "monkey") return (
    // the backs of two hands, fingers up, over the eyes
    <g className="cm-hands"><Both><path d="M11.5 44Q10 34 13 28.5Q15.5 25 18.5 27.5Q20.5 24.5 23.5 26.5Q26.5 24.5 29 27.5Q32.5 28 32 33.5Q31.5 42 28.5 46Q20 49.5 11.5 44Z" fill={coat} {...line} />
      <path d="M18.5 27.5l.8 6M23.5 26.5l.2 6.5M28.8 27.6l-.6 6" stroke={INK} strokeOpacity=".45" strokeWidth="1.3" strokeLinecap="round" fill="none" /></Both></g>
  );
  if (species === "dog") return <path className="cm-tongue" d="M29 56.5h6v4.5q-3 4.5-6 0Z" fill={PINK} stroke={INK} strokeOpacity=".45" strokeWidth="1" />;
  if (species === "bear" && beat === 0) return <ellipse className="cm-yawn" cx="32" cy="55" rx="4.2" ry="4" fill="#2a0d10" />;
  if (species === "bear") return (
    <g className="cm-zzz" fill={C.hl} fontFamily="ui-sans-serif, system-ui" fontWeight="800">
      <text x="50" y="16" fontSize="13">z</text><text x="58" y="6" fontSize="10">z</text><text x="64" y="-2" fontSize="8">z</text>
    </g>
  );
  return null;
}

// Night shift: from midnight to 05:00 local time an owl doesn't doze. Silent and retired owls keep
// their eyes wide open while the rest of the quiet crew sleeps.
const owlHours = () => new Date().getHours() < 5;

export function CrewMark({ coat, species = "raccoon", state = "wink", unread = false, size = 22, className }: { coat: string; species?: Species; state?: "wink" | "doze"; unread?: boolean; size?: number; className?: string }) {
  const k = KIND[species];
  const { beat, run, step, play } = useTrick(species);
  const eyes = step?.eyes ?? "rest";
  const awake = species === "owl" && state === "doze" && !unread && owlHours();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={cn("flex-none overflow-visible select-none", step && `trick-${species} beat-${beat}`, className)}
      onClick={(e) => { if (e.detail > 0 && e.detail % 3 === 0) play(); }}>
      <g key={run} className="cm-body">
        <g className="cm-back">{k.back?.(coat)}</g>
        <ellipse cx="32" cy="38" rx="24" ry="22" fill={coat} {...line} />
        {k.front?.(coat)}
        {/* the Colluder's mask and eyes, a size down so the face shows around them */}
        <g transform="translate(32 36) scale(.8) translate(-32 -31)">
          <path className="cm-mask" d={MASK} fill={C.mask} />
          {eyes === "hidden" ? null
            : eyes === "shut" ? <><Shut x={L[0]} y={L[1]} /><Shut x={R[0]} y={R[1]} /></>
            : eyes === "mirror" ? <><Wink x={L[0]} y={L[1]} ink={C.hl} /><Open x={R[0]} y={R[1]} ink={C.hl} /></>
            : unread ? <><Open x={L[0]} y={L[1]} k={1.1} /><Open x={R[0]} y={R[1]} k={1.1} /></>
            : awake ? <><Open x={L[0]} y={L[1]} k={1.15} ink={C.hl} /><Open x={R[0]} y={R[1]} k={1.15} ink={C.hl} /></>
            : state === "doze" ? <><Shut x={L[0]} y={L[1]} /><Shut x={R[0]} y={R[1]} /></>
            : <><Open x={L[0]} y={L[1]} ink={C.hl} /><Wink x={R[0]} y={R[1]} ink={C.hl} /></>}
        </g>
        <g className="cm-top">{k.top}</g>
        {species === "shark" && <Jaw open={step?.jaw ?? 0.3} />}
        {step && <Prop species={species} coat={coat} beat={beat} />}
      </g>
      {unread && <circle cx="57" cy="7" r="9" fill={C.shine} stroke="var(--soot)" strokeWidth="4" />}
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

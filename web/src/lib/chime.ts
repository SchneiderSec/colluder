// The arrival chime (Settings > Display > Sound): two soft rising notes, made here rather than loaded,
// so there's no file to fetch. Browsers start audio muted on every page load until the first click or
// key press; the context is created on the first gesture and resumed after that.
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}
// any gesture unlocks it for the rest of this load
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => context(), { once: true, capture: true });

export function chime() {
  const c = context();
  if (!c) return;
  if (c.state === "running") play(c);
  else void c.resume().then(() => { if (c.state === "running") play(c); }, () => {}); // still locked: silent
}

function play(c: AudioContext) {
  const t = c.currentTime;
  for (const [i, f] of [659.25, 987.77].entries()) { // E5 then B5: a question answered
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const at = t + i * 0.09;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.08, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + 0.34);
  }
}

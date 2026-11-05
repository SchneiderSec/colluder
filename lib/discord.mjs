// Discord alerts: the first hit on a probe tag posts immediately; further hits on that tag within
// the next 60 s are rolled into one follow-up count. A tag that has been quiet for 30 min counts
// as "first" again. Everything interpolated from a request is attacker-controlled, so it is
// neutralised (no mentions, no markdown, no links) before posting.
const ROLLUP_MS = 60_000;
const QUIET_MS = 30 * 60_000;

export function neutral(s, max = 120) {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[`*_~|>\\[\]()<@#:]/g, (c) => "\\" + c)
    .slice(0, max);
}

export class Discord {
  constructor({ url, dashboardUrl, log }) {
    this.url = url || "";
    this.dashboardUrl = dashboardUrl;
    this.log = log;
    this.windows = new Map(); // tag -> { until, counts, timer }
    this.lastPostFor = new Map();
  }

  get available() { return Boolean(this.url); }

  async post(content) {
    if (!this.url) return;
    try {
      const r = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "Colluder", content, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) this.log(`discord: HTTP ${r.status}`);
    } catch (e) {
      this.log(`discord: ${e.message}`);
    }
  }

  // hit: list row; prevHitAt: timestamp of the previous hit on the same tag (null if none)
  onHit(hit, prevHitAt, rdns) {
    const key = hit.tag || "(untagged)";
    const now = Date.now();
    const w = this.windows.get(key);
    if (w && now < w.until) {
      w.counts[hit.protocol] = (w.counts[hit.protocol] || 0) + 1;
      return;
    }
    const quietFor = prevHitAt ? now - Date.parse(prevHitAt) : Infinity;
    if (quietFor < QUIET_MS && this.lastPostFor.has(key)) return;

    const who = neutral(hit.remoteAddress, 60) + (rdns ? ` (${neutral(rdns, 80)})` : "");
    const what = hit.protocol === "dns" ? neutral(hit.qType || "DNS", 10) + " lookup" : neutral(hit.summary, 90);
    const label = hit.tag ? `probe ${neutral(hit.tag, 40)}` : "an untagged payload";
    this.post(`${hit.protocol.toUpperCase()} hit on ${label} from ${who}: ${what}\n${this.dashboardUrl}`);
    this.lastPostFor.set(key, now);

    const win = { until: now + ROLLUP_MS, counts: {} };
    win.timer = setTimeout(() => {
      this.windows.delete(key);
      const parts = Object.entries(win.counts).map(([p, n]) => `${n} ${p.toUpperCase()}`);
      if (parts.length) this.post(`${parts.join(", ")} more on ${label} in the last minute.`);
    }, ROLLUP_MS);
    win.timer.unref?.();
    this.windows.set(key, win);
  }
}

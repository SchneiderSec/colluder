// The engine check : proves interactsh still records for the
// engine's id and the engine still collects it.
//
// interactsh-client registers its correlation id once, when it starts, and interactsh-server keeps
// registrations in memory only. When interactsh restarts (a deploy script, a reboot, the box
// dropping) it forgets the id; the client goes on polling, gets "correlation id not found", and
// says nothing. From then on everything interactsh records for the id is thrown away. On 2026-11-07
// that went unnoticed for four days.
//
// So every few minutes this looks up <nonce>.colluder-check.<engine id>.<domain> through the public
// DNS path. interactsh records it only while the id is registered, and the engine writes it to its
// log only while it polls: if it doesn't arrive in time, twice running, the engine is restarted, which
// registers the same id again (systemd stops it with SIGINT, so the session file keeps the id).
// The lookup never becomes a hit: colluder-check is reserved.
import { randomBytes } from "node:crypto";

export const ENGINE_CHECK_LABEL = "colluder-check";

export class EngineCheck {
  // resolve(name) → Promise (a DNS lookup through the public path); restart() → Promise<string|null> (error)
  constructor({ resolve, restart, log = () => {}, waitMs = 20_000, failuresBeforeRestart = 2, restartGapMs = 10 * 60_000, now = () => Date.now() }) {
    Object.assign(this, { resolve, restart, log, waitMs, failuresBeforeRestart, restartGapMs, now });
    this.pending = null;
    this.failures = 0;
    this.lastRestartAt = 0;
    this.last = null; // { state: ok | failing | restarted, at, detail, tookMs }
    this.running = false;
  }

  // an engine log line (parsed JSON): true when it is this check's own lookup (never a hit)
  saw(obj) {
    const full = String(obj?.["full-id"] || "").toLowerCase();
    if (!full.includes(`.${ENGINE_CHECK_LABEL}.`) && !full.startsWith(`${ENGINE_CHECK_LABEL}.`)) return false;
    if (this.pending && full.startsWith(this.pending.nonce + ".")) this.pending.done();
    return true;
  }

  // longHost: the engine's payload host (<33-char id>.<domain>)
  async run(longHost) {
    if (this.running || !longHost) return this.last;
    this.running = true;
    const nonce = randomBytes(5).toString("hex");
    const name = `${nonce}.${ENGINE_CHECK_LABEL}.${longHost}`;
    const t0 = this.now();
    let arrived;
    const seen = new Promise((ok) => { arrived = ok; });
    this.pending = { nonce, done: () => arrived(true) };
    try {
      // the answer doesn't matter (interactsh answers every name); the record of the question does
      await this.resolve(name).catch(() => {});
      const ok = await Promise.race([seen, new Promise((r) => setTimeout(() => r(false), this.waitMs).unref?.())]);
      if (ok) {
        if (this.failures) this.log(`engine check: the engine records again (after ${this.failures} failed check${this.failures > 1 ? "s" : ""})`);
        this.failures = 0;
        this.last = { state: "ok", at: new Date(this.now()).toISOString(), tookMs: this.now() - t0, detail: null };
        return this.last;
      }
      this.failures++;
      const detail = `a lookup of the engine's own id didn't reach the engine within ${Math.round(this.waitMs / 1000)} s: interactsh may have forgotten its registration (it restarted), or the engine stopped polling`;
      this.log(`engine check failed (${this.failures} in a row): ${detail}`);
      this.last = { state: "failing", at: new Date(this.now()).toISOString(), detail, failures: this.failures };
      if (this.failures >= this.failuresBeforeRestart && this.now() - this.lastRestartAt >= this.restartGapMs) {
        this.lastRestartAt = this.now();
        const err = await this.restart();
        this.log(err ? `engine check: restart failed: ${err}` : "engine check: engine restarted to register its id again");
        this.last = { ...this.last, state: err ? "failing" : "restarted", restartedAt: new Date(this.now()).toISOString(), restartError: err || null };
      }
      return this.last;
    } finally {
      this.pending = null;
      this.running = false;
    }
  }
}

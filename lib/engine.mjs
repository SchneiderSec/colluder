// Engine health: asks systemd about the interactsh-client unit, reads its recent journal for errors,
// and reads the payload the client stored. Produces one plain-language status for the UI.
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { correlationIdOf } from "./tag.mjs";

function run(cmd, args, timeout = 4000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 256 * 1024 }, (err, stdout, stderr) =>
      resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout || ""), stderr: String(stderr || "") }));
  });
}

const ERR_RE = /\[(ERR|FTL|FATAL)\]|could not|unauthorized|forbidden|connection refused|no such host/i;

export class Engine {
  constructor({ unit, payloadFile, clientBin, domain }) {
    Object.assign(this, { unit, payloadFile, clientBin, domain });
    this.version = null;
    this.status = { state: "unknown", detail: "Checking engine…" };
    this.payload = null;
  }

  async init() {
    const v = await run(this.clientBin, ["-version"]);
    const m = /v?(\d+\.\d+\.\d+)/.exec(v.stdout + v.stderr);
    this.version = m ? `interactsh-client v${m[1]}` : "interactsh-client";
  }

  async readPayload() {
    try {
      const [txt, s] = await Promise.all([readFile(this.payloadFile, "utf8"), stat(this.payloadFile)]);
      const host = txt.split(/\s+/).map((x) => x.trim().toLowerCase()).find((x) => x && x.includes("."));
      if (!host) return null;
      return { host, correlationId: correlationIdOf(host), domain: this.domain, writtenAt: s.mtime.toISOString() };
    } catch {
      return null;
    }
  }

  async unitState() {
    const r = await run("systemctl", ["--user", "show", this.unit, "-p", "ActiveState", "-p", "SubState",
      "-p", "ExecMainStatus", "-p", "ExecMainStartTimestamp", "-p", "NRestarts", "-p", "Result", "-p", "LoadState"]);
    if (!r.ok && !r.stdout) return null;
    const o = {};
    for (const line of r.stdout.split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) o[line.slice(0, i)] = line.slice(i + 1);
    }
    return o;
  }

  async recentErrors() {
    const r = await run("journalctl", ["--user", "-u", this.unit, "--since", "-3min", "-o", "cat", "--no-pager", "-n", "40"]);
    if (!r.ok) return null;
    const lines = r.stdout.split("\n").map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim()).filter(Boolean);
    const errs = lines.filter((l) => ERR_RE.test(l));
    return errs.length ? errs[errs.length - 1].slice(0, 300) : null;
  }

  async check() {
    const [u, payload, lastError] = await Promise.all([this.unitState(), this.readPayload(), this.recentErrors()]);
    this.payload = payload;
    const fix = `systemctl --user restart ${this.unit}`;
    let s;
    if (!u || u.LoadState === "not-found") {
      s = { state: "missing", detail: `The engine service (${this.unit}) is not installed.`,
        fix: `Install deploy/${this.unit} and run: systemctl --user enable --now ${this.unit}` };
    } else if (u.ActiveState === "active" && u.SubState === "running") {
      const since = u.ExecMainStartTimestamp || null;
      if (!payload) s = { state: "starting", detail: "Engine is running but has not registered a payload yet.", since };
      else if (lastError) s = { state: "degraded", detail: `Engine is running but reported: ${lastError}`, since, fix };
      else s = { state: "capturing", detail: "Capturing", since };
    } else if (u.ActiveState === "activating") {
      s = { state: "starting", detail: "Engine is starting." };
    } else {
      const code = u.ExecMainStatus && u.ExecMainStatus !== "0" ? ` (exit code ${u.ExecMainStatus})` : "";
      s = { state: "down", detail: `Engine stopped${code}.${lastError ? " Last error: " + lastError : ""}`, fix };
    }
    s.unit = this.unit;
    s.restarts = Number(u?.NRestarts || 0);
    s.version = this.version;
    this.status = s;
    return s;
  }
}

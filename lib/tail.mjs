// Follows the engine's JSON-lines file. Survives restarts (resumes from the stored offset),
// truncation and rotation (inode change -> re-read from 0; the store dedupes by line hash),
// a file that does not exist yet, and partial trailing lines.
import { open, stat } from "node:fs/promises";
import { watch } from "node:fs";

export class Tail {
  constructor(path, { onLine, onError, getState, setState, pollMs = 1000 }) {
    Object.assign(this, { path, onLine, onError, getState, setState, pollMs });
    this.partial = "";
    this.reading = false;
    this.again = false;
    this.status = { exists: false, size: 0, error: null };
  }

  start() {
    const st = this.getState() || {};
    this.ino = st.ino ?? null;
    this.offset = st.offset ?? 0;
    this.timer = setInterval(() => this.read(), this.pollMs);
    this.armWatch();
    return this.read();
  }

  stop() {
    clearInterval(this.timer);
    this.watcher?.close();
  }

  armWatch() {
    try {
      this.watcher?.close();
      this.watcher = watch(this.path, () => this.read());
      this.watcher.on("error", () => { this.watcher = null; });
    } catch { this.watcher = null; } // file missing: polling covers it until it appears
  }

  async read() {
    if (this.reading) { this.again = true; return; }
    this.reading = true;
    try {
      do {
        this.again = false;
        await this.readOnce();
      } while (this.again);
    } finally {
      this.reading = false;
    }
  }

  async readOnce() {
    let s;
    try {
      s = await stat(this.path);
    } catch (e) {
      this.status = { exists: false, size: 0, error: e.code === "ENOENT" ? null : e.message };
      return;
    }
    if (!this.status.exists && !this.watcher) this.armWatch();
    this.status = { exists: true, size: s.size, error: null };
    if (this.ino !== s.ino || s.size < this.offset) {
      // new file or truncated: start over; duplicates are ignored by the store
      this.ino = s.ino;
      this.offset = 0;
      this.partial = "";
      this.armWatch();
    }
    if (s.size === this.offset) return;
    const fh = await open(this.path, "r");
    try {
      const len = s.size - this.offset;
      const buf = Buffer.alloc(Math.min(len, 8 * 1024 * 1024));
      const { bytesRead } = await fh.read(buf, 0, buf.length, this.offset);
      const text = this.partial + buf.subarray(0, bytesRead).toString("utf8");
      const lines = text.split("\n");
      this.partial = lines.pop();
      // only advance past complete lines so a restart never loses a half-written record
      this.offset += bytesRead - Buffer.byteLength(this.partial, "utf8");
      this.partial = "";
      for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        try { this.onLine(l); } catch (e) { this.onError?.(e, l); }
      }
      this.setState({ ino: this.ino, offset: this.offset });
      if (bytesRead < len) this.again = true;
    } finally {
      await fh.close();
    }
  }
}

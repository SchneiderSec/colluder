// A fingerprint of the code the edge runs. The edge is a root service started at the cutover; it
// keeps running the code it loaded until someone restarts it. It writes this hash into its status
// file at startup, and the dashboard compares it with the files on disk, so "the edge runs older
// code" is an alarm instead of a mystery.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EDGE_FILES = ["edge.mjs", "lib/http1.mjs", "lib/rules.mjs", "lib/tag.mjs"];

export function edgeCodeHash(root = ROOT) {
  const h = createHash("sha256");
  for (const f of EDGE_FILES) { h.update(f + "\0"); h.update(readFileSync(join(root, f))); }
  return h.digest("hex").slice(0, 16);
}

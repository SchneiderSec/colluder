// The Answer tab's draft: what the form edits, and the part of it that's saved. The draft keeps every
// mode's fields (switching mode loses nothing); effective() is what the server gets. Anything the
// server keeps must survive here, even when the form has no field for it, or a save from the
// dashboard silently drops what the MCP (or a preset) set.
// Run the tests: node --test web/test/view.test.ts
import type { Decoy, HttpRule, RuleMode } from "./types.ts";

export const DEFAULT: HttpRule = { mode: "default", delayMs: 0, schemes: { http: true, https: true } };
export const MODE_DEFAULTS: Record<RuleMode, Partial<HttpRule>> = {
  default: {},
  redirect: { status: 302, location: "", loop: 0 },
  custom: { status: 200, headers: [], body: "", bodyEncoding: "text" },
  file: { contentType: "text/plain; charset=utf-8", body: "", bodyEncoding: "text", template: "" },
  preset: {},
};

export const norm = (r: HttpRule): HttpRule => (r.mode === "default" ? DEFAULT : { ...DEFAULT, ...MODE_DEFAULTS[r.mode], ...r });

const KEYS: Record<RuleMode, (keyof HttpRule)[]> = {
  default: [],
  redirect: ["status", "location", "loop", "hopStatuses"],
  custom: ["status", "headers", "body", "bodyEncoding"],
  // extra headers on a hosted file (Access-Control-Allow-Origin for a script or font): lib/rules.mjs keeps them
  file: ["contentType", "body", "bodyEncoding", "template", "headers"],
  preset: ["kind", "params"],
};

export function effective(r: HttpRule): HttpRule {
  if (r.mode === "default") return DEFAULT;
  const n = norm(r);
  const out: Record<string, unknown> = { mode: n.mode, delayMs: n.delayMs, schemes: { http: n.schemes.http, https: n.schemes.https } };
  for (const k of KEYS[n.mode]) out[k] = n[k];
  if (n.mode === "redirect") {
    const hs = typeof n.hopStatuses === "string" ? n.hopStatuses.split(/[\s,]+/).filter(Boolean).map((x) => (/^\d+$/.test(x) ? Number(x) : x)) : n.hopStatuses ?? [];
    if (n.loop && hs.length) out.hopStatuses = hs; else delete out.hopStatuses;
  }
  // a hosted file's empty header rows are dropped, like the server does; none at all is no headers
  if (n.mode === "file") {
    const hs = (n.headers ?? []).filter(([k, v]) => k.trim() || v.trim());
    if (hs.length) out.headers = hs; else delete out.headers;
  }
  const d = decoyOf(n.decoy);
  if (d) out.decoy = d;
  return out as unknown as HttpRule;
}

// as lib/rules.mjs splits them: space- or comma-separated, upper-cased, each once
export const methodsOf = (m: Decoy["methods"]): string[] =>
  [...new Set((Array.isArray(m) ? m : String(m ?? "").split(/[\s,]+/)).map((x) => String(x).trim().toUpperCase()).filter(Boolean))];

// the decoy as the server stores it: empty parts dropped, all empty is none
export function decoyOf(d?: Decoy | null): Decoy | null {
  if (!d) return null;
  const methods = methodsOf(d.methods);
  const sources = (Array.isArray(d.sources) ? d.sources : String(d.sources ?? "").split(/[\s,]+/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const ua = (d.ua ?? "").trim();
  const out: Decoy = { ...(methods.length ? { methods } : {}), ...(d.first ? { first: d.first } : {}), ...(ua ? { ua } : {}), ...(sources.length ? { sources } : {}) };
  return Object.keys(out).length ? out : null;
}

export const sameRule = (a: HttpRule, b: HttpRule) => JSON.stringify(effective(a)) === JSON.stringify(effective(b));

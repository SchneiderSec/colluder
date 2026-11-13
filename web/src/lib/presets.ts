// Plant presets: the rule a preset probe is planted with. Shared by the composer and
// the MCP (Node runs this file there, so its imports carry the .ts extension).

import { METADATA, redirectable, type MetaRow } from "./metadata.ts";
import type { HttpRule } from "./types.ts";

// SSRF → cloud metadata (P1): 302 (a POSTing webhook turns it into a GET), two hops back through the
// probe first so a blind SSRF shows ?hop=2/3 as hits (301 then 307, codes every common client
// follows), and optionally the decoy reply for HEAD checks.
export const CLOUDS: MetaRow[] = METADATA.filter(redirectable).filter((r) => /^(aws|alibaba|oracle|do|hetzner|openstack)(-|$)/.test(r.id));
export function ssrfRule(url: string, headDecoy: boolean): HttpRule {
  return { mode: "redirect", delayMs: 0, schemes: { http: true, https: true }, status: 302, location: url, loop: 2, hopStatuses: [301, 307], ...(headDecoy ? { decoy: { methods: ["HEAD"] } } : {}) } as HttpRule;
}
// XXE (P2): the DTD reads one file. A one-line file works everywhere the URL survives (modern Java
// rejects a newline in it); php://filter base64-encodes multi-line files on PHP.
export const XXE_FILES: [string, string][] = [
  ["/etc/hostname", "/etc/hostname (one line, works on Java)"],
  ["php://filter/convert.base64-encode/resource=/etc/passwd", "/etc/passwd through php://filter (PHP)"],
  ["file:///c:/windows/win.ini", "C:\\Windows\\win.ini (Windows; multi-line, so only clients that send raw newlines)"],
  ["custom", "Another file…"],
];
// probeHost: <tag>.<payload host>
export function xxeRule(probeHost: string, file: string): HttpRule {
  return { mode: "preset", delayMs: 0, schemes: { http: true, https: true }, kind: "xxe", params: { host: probeHost, file } } as unknown as HttpRule;
}

// What a hosted file is, from what it actually serves (not the template it started from, since the
// body may have been rewritten since): the path to fetch it at, and the line to put in the target.
// Shared by the Answer tab (the draft) and the probe header (the saved rule).
import { tagged } from "./kit.ts";

export type FileKind = { ext: string; plant?: (url: string) => [string, string]; scheme: "http" | "https" };

export function fileKind(contentType: string, body: string): FileKind {
  const t = contentType.toLowerCase(), b = body.slice(0, 4000);
  // parsers fetch DTDs and stylesheets over plain HTTP most reliably; browsers and renderers take HTTPS
  if (/xsl/.test(t) || /<xsl:(stylesheet|transform)\b/.test(b)) return { ext: ".xsl", scheme: "http", plant: (u) => [`<?xml-stylesheet type="text/xsl" href="${u}"?>`, "stylesheet line"] };
  if (/dtd/.test(t) || /^\s*<!ENTITY/.test(b)) return { ext: ".dtd", scheme: "http", plant: (u) => [`<!DOCTYPE x SYSTEM "${u}">`, "DOCTYPE line"] };
  if (/svg/.test(t) || /^\s*(<\?xml[^>]*>\s*)?<svg\b/.test(b)) return { ext: ".svg", scheme: "https", plant: (u) => [`<img src="${u}">`, "image tag"] };
  if (/html/.test(t)) return { ext: ".html", scheme: "https", plant: (u) => [u, "page URL"] };
  if (/json/.test(t)) return { ext: ".json", scheme: "https" };
  if (/xml/.test(t)) return { ext: ".xml", scheme: "https" };
  return { ext: "", scheme: "https" };
}

// The fetch URLs and, when the file has one, the line to plant: [text, what it is]
export function hostedFile(rule: { contentType?: string; body?: string; bodyEncoding?: string }, tag: string, host: string) {
  const kind = fileKind(rule.contentType ?? "", rule.bodyEncoding === "base64" ? "" : rule.body ?? "");
  const urls = (["http", "https"] as const).map((sch) => `${sch}://${tagged(tag, host)}/x${kind.ext}`) as [string, string];
  const plant = kind.plant?.(kind.scheme === "http" ? urls[0] : urls[1]) ?? null;
  return { urls, plant };
}

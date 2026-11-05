// Source-IP enrichment.
//   rDNS: automatic, via the box's own resolver (PTR query).
//   ASN/owner: only on explicit request; it asks Team Cymru's public DNS service (a third party).
import { promises as dns } from "node:dns";
import { isIP } from "node:net";

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export async function reverseDns(ip) {
  if (!isIP(ip)) return null;
  try {
    const names = await withTimeout(dns.reverse(ip), 4000);
    return names[0] || "";
  } catch {
    return ""; // empty string = looked up, no PTR record
  }
}

function cymruName(ip) {
  if (isIP(ip) === 4) return ip.split(".").reverse().join(".") + ".origin.asn.cymru.com";
  if (isIP(ip) === 6) {
    const full = expandV6(ip).replace(/:/g, "");
    return full.split("").reverse().join(".") + ".origin6.asn.cymru.com";
  }
  return null;
}

function expandV6(ip) {
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const mid = Array(8 - h.length - t.length).fill("0");
  return [...h, ...mid, ...t].map((x) => x.padStart(4, "0")).join(":");
}

export async function asnLookup(ip) {
  const name = cymruName(ip);
  if (!name) throw new Error("not an IP address");
  const txt = (await withTimeout(dns.resolveTxt(name), 5000)).map((r) => r.join(""))[0];
  if (!txt) throw new Error("no ASN record");
  // "15169 | 8.8.8.0/24 | US | arin | 2023-12-28"
  const [asn, prefix, cc] = txt.split("|").map((s) => s.trim());
  const first = asn.split(/\s+/)[0];
  let asName = "";
  try {
    const t2 = (await withTimeout(dns.resolveTxt(`AS${first}.asn.cymru.com`), 5000)).map((r) => r.join(""))[0] || "";
    asName = (t2.split("|")[4] || "").trim();
  } catch { /* name is optional */ }
  return { asn: "AS" + first, prefix, cc, name: asName };
}

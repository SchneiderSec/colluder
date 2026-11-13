// Two served domains at once (a new payload domain, an old one until it lapses): the edge owns our
// names under either, picks each domain's certificate by server name, and summaries name the domain
// that was actually asked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ownership, domainOf, pickCert, loadCerts } from "../edge.mjs";
import { summarize } from "../lib/tag.mjs";

const OLD = "oob.example", NEW = "alt.example", BOTH = [NEW, OLD];
const CID = "abcdefghij0123456789", ID = CID + "klmnopqrstuvw", SHORT = "k3x9q2";

test("domains: a short id is ours right under either domain, and only there", () => {
  const own = (h) => ownership(h, [CID], [SHORT], BOTH);
  assert.deepEqual(own(`avatar-${SHORT}.${NEW}`), { uniqueId: SHORT, fullId: `avatar-${SHORT}` });
  assert.deepEqual(own(`kc1.avatar-${SHORT}.${OLD}`), { uniqueId: SHORT, fullId: `kc1.avatar-${SHORT}` });
  assert.equal(own(`${SHORT}.x.${NEW}`), null, "not the label under the domain");
  assert.equal(own(`${SHORT}.net`), null, "the bare TLD is not ours");
  assert.equal(own(`${SHORT}.evil-${NEW}`), null, "a lookalike domain");
  assert.deepEqual(own(`fetch-${ID}.${NEW}`), { uniqueId: ID, fullId: `fetch-${ID}` }, "long ids on the new domain");
  // the single-domain form still works as before
  assert.deepEqual(ownership(`a-${SHORT}.${OLD}`, [CID], [SHORT], OLD), { uniqueId: SHORT, fullId: `a-${SHORT}` });
  assert.equal(ownership(`a-${SHORT}.${NEW}`, [CID], [SHORT], OLD), null, "a domain not served");
});

test("domains: domainOf names the domain a host is under", () => {
  assert.equal(domainOf(`x-${SHORT}.${NEW}:443`, BOTH), NEW);
  assert.equal(domainOf(`x.${OLD}.`, BOTH), OLD);
  assert.equal(domainOf(NEW, BOTH), null, "the apex is not under itself");
  assert.equal(domainOf("x.example.com", BOTH), null);
  assert.equal(domainOf("a.b.example.co.uk", ["example.co.uk", "b.example.co.uk"]), "b.example.co.uk", "the longest match");
});

test("certificates: the most specific one covering the server name wins; a wildcard covers one label", () => {
  const def = { names: [`*.${OLD}`, OLD] }, neu = { names: [`*.${NEW}`, NEW] }, exact = { names: [`api.${NEW}`] };
  const pairs = [def, neu, exact];
  assert.equal(pickCert(`fetch-${SHORT}.${NEW}`, pairs), neu);
  assert.equal(pickCert(`fetch-${SHORT}.${OLD}`, pairs), def);
  assert.equal(pickCert(NEW, pairs), neu, "the apex by its exact name");
  assert.equal(pickCert(`api.${NEW}`, pairs), exact, "exact beats wildcard");
  assert.equal(pickCert(`kc1.fetch-${SHORT}.${NEW}`, pairs), null, "two labels: nothing covers it");
  assert.equal(pickCert("other.example", pairs), null);
  assert.equal(pickCert(`X-${SHORT}.${NEW.toUpperCase()}.`, pairs), neu, "case and a trailing dot");
});

test("certificates: loadCerts reads the default pair and one per domain directory", (t) => {
  try { execFileSync("openssl", ["version"], { stdio: "ignore" }); } catch { return t.skip("no openssl"); }
  const dir = mkdtempSync(join(tmpdir(), "colluder-certs-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const make = (path, name) => {
    mkdirSync(path, { recursive: true });
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-days", "2",
      "-subj", `/CN=*.${name}`, "-addext", `subjectAltName=DNS:*.${name},DNS:${name}`,
      "-keyout", join(path, "privkey.pem"), "-out", join(path, "fullchain.pem")], { stdio: "ignore" });
  };
  make(dir, OLD);
  make(join(dir, "domains", NEW), NEW);
  mkdirSync(join(dir, "domains", "broken.example")); // no files: skipped, not fatal
  const c = loadCerts({ cert: join(dir, "fullchain.pem"), key: join(dir, "privkey.pem"), certDir: join(dir, "domains") });
  assert.deepEqual(c.def.names, [`*.${OLD}`, OLD]);
  assert.deepEqual(c.extra.map((p) => p.names), [[`*.${NEW}`, NEW]]);
  assert.equal(pickCert(`a-${SHORT}.${NEW}`, [c.def, ...c.extra]), c.extra[0]);
});

test("summaries: a DNS hit names the domain that was asked, not the payload domain", () => {
  const raw = (name) => `;; opcode: QUERY, status: NOERROR, id: 7\n\n;; QUESTION SECTION:\n;${name}.\tIN\t A\n`;
  assert.equal(summarize("dns", { "full-id": `fetch-${SHORT}`, "q-type": "A", "raw-request": raw(`Fetch-${SHORT}.${OLD}`) }, BOTH), `A fetch-${SHORT}.${OLD}`);
  assert.equal(summarize("dns", { "full-id": `fetch-${SHORT}`, "q-type": "A", "raw-request": "" }, BOTH), `A fetch-${SHORT}.${NEW}`, "no question: the payload domain");
  assert.equal(summarize("dns", { "full-id": `fetch-${SHORT}`, "q-type": "A", "raw-request": raw("unrelated.example") }, BOTH), `A fetch-${SHORT}.${NEW}`, "a question that isn't this id is ignored");
});

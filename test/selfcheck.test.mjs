// The outside check (lib/selfcheck.mjs), with the network swapped for fakes: the "edge" records a
// step by handing the check what ingest would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OutsideCheck, CHECK_TAG, checkAlert } from "../lib/selfcheck.mjs";
import { parseInteraction } from "../lib/tag.mjs";

const DOMAIN = "oob.example", SHORT = "k3x9q2", IP = "203.0.113.10";
const NOW = Date.parse("2026-11-07T15:00:00Z");
const inDays = (d) => new Date(NOW + d * 86400e3).toISOString();

// world: what each part of the path does. dns[ip]: "ok" | "silent" (answers, never recorded) | "dead" | "wrong"
function setup(world = {}, opts = {}) {
  const w = { dns: {}, http: "ok", https: "ok", cert: inDays(40), domain: inDays(200), ...world };
  const calls = { rdap: 0, dns: 0 };
  let check;
  // what the edge writes and ingest hands over, parsed the same way
  const edgeSaw = (fullId, raw = "") => setTimeout(() => check.saw(parseInteraction({ protocol: raw ? "http" : "dns", "unique-id": SHORT, "full-id": fullId, "raw-request": raw }, DOMAIN)), 5);
  const transport = {
    async resolve4(server, name) {
      calls.dns++;
      const mode = w.dns[server] ?? "ok";
      if (mode === "dead") throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
      if (mode === "ok") edgeSaw(name.slice(0, -(DOMAIN.length + 1)));
      return mode === "wrong" ? ["10.0.0.1"] : [IP];
    },
    async webGet({ scheme, host, path }) {
      const mode = w[scheme];
      if (mode === "dead") throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      if (mode === "ok") edgeSaw(host.slice(0, -(DOMAIN.length + 1)), `GET ${path} HTTP/1.1\r\nHost: ${host}\r\n\r\n`);
      return { status: 200, certValidTo: scheme === "https" ? new Date(w.cert).toUTCString() : null };
    },
    async rdapExpiry() { calls.rdap++; if (w.domain === "fail") throw new Error("RDAP HTTP 503"); return w.domain; },
  };
  check = new OutsideCheck({ domain: DOMAIN, shortId: SHORT, publicIp: IP, now: () => NOW, waitMs: 200, retryMs: 0, transport, ...opts });
  return { check, calls, w };
}

test("outside check: every step passes when each callback is answered and recorded", async () => {
  const { check } = setup();
  const r = await check.run();
  assert.equal(r.state, "ok");
  assert.deepEqual(r.steps.map((s) => [s.key, s.ok]), [["dns:1.1.1.1", true], ["dns:8.8.8.8", true], ["http", true], ["https", true]]);
  assert.equal(r.host, `${CHECK_TAG}-${SHORT}.${DOMAIN}`);
  assert.deepEqual([r.cert.days, r.domain.days, r.warnings], [40, 200, []]);
  // its names parse as the reserved tag on Colluder's short id: what ingest diverts
  const it = parseInteraction({ protocol: "dns", "unique-id": SHORT, "full-id": `cabc.${CHECK_TAG}-${SHORT}` }, DOMAIN);
  assert.deepEqual([it.tag, it.uniqueId], [CHECK_TAG, SHORT]);
});

test("outside check: a lookup that resolves but isn't recorded fails (interactsh answering, the edge blind)", async () => {
  const { check } = setup({ dns: { "8.8.8.8": "silent" } });
  const r = await check.run();
  assert.equal(r.state, "failing");
  const bad = r.steps.filter((s) => !s.ok);
  assert.deepEqual(bad.map((s) => s.key), ["dns:8.8.8.8"]);
  assert.match(bad[0].detail, /did not record/);
});

test("outside check: no answer, a wrong answer and a dead web port each name what broke", async () => {
  const { check } = setup({ dns: { "1.1.1.1": "dead", "8.8.8.8": "wrong" }, https: "dead" });
  const r = await check.run();
  const d = Object.fromEntries(r.steps.map((s) => [s.key, s]));
  assert.match(d["dns:1.1.1.1"].detail, /no answer \(ETIMEOUT\)/);
  assert.match(d["dns:8.8.8.8"].detail, /10\.0\.0\.1, not this box/);
  assert.match(d.https.detail, /failed: ECONNREFUSED/);
  assert.equal(d.http.ok, true);
  assert.equal(check.waiting.size, 0, "nothing left waiting");
});

test("outside check: a failed step is retried once before it counts", async () => {
  const s = setup({ dns: { "1.1.1.1": "dead" } }, { retryMs: 20 });
  setTimeout(() => { s.w.dns["1.1.1.1"] = "ok"; }, 10); // the packet loss clears before the retry
  const r = await s.check.run();
  assert.equal(r.state, "ok");
  assert.equal(r.steps[0].retried, true);
  assert.equal(s.calls.dns, 3, "only the failed resolver was asked again");
});

test("outside check: a certificate or domain near its end warns; RDAP is asked once a day", async () => {
  const { check, calls } = setup({ cert: inDays(12), domain: inDays(9) });
  const r = await check.run();
  assert.equal(r.state, "warn");
  assert.match(r.warnings[0], /certificate expires in 12 days/);
  assert.match(r.warnings[1], /oob\.example expires in 9 days .*renew it/);
  await check.run();
  assert.equal(calls.rdap, 1);
  const f = setup({ domain: "fail" });
  const r2 = await f.check.run();
  assert.equal(r2.state, "ok", "RDAP being down isn't the pipeline being down");
  assert.match(r2.domain.error, /503/);
});

test("outside check: Discord hears about changes of state, not every run", () => {
  const failing = { state: "failing", steps: [{ ok: false, label: "DNS via Google (8.8.8.8)", detail: "no answer (ETIMEOUT): payload names may not resolve for targets" }], warnings: [] };
  const ok = { state: "ok", steps: [], warnings: [] };
  assert.match(checkAlert(failing, "ok"), /^Outside check failing\. DNS via Google .*a quiet probe proves nothing/);
  assert.equal(checkAlert(failing, "failing"), null);
  assert.equal(checkAlert(ok, "failing"), "Outside check passing again.");
  assert.equal(checkAlert(ok, "ok"), null);
  assert.equal(checkAlert(ok, undefined), null, "a first clean run is not news");
  assert.match(checkAlert({ state: "warn", steps: [], warnings: ["The certificate expires in 12 days (2026-11-19)."] }, "ok"), /^Outside check warning: The certificate/);
});

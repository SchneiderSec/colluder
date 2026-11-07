// Settings the dashboard writes (lib/settings.mjs): colluder.env lines, the engine's server line, the
// webhook check, and Discord's per-alert switches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setEnvLines, setServerLine, WEBHOOK_RE, alertKinds, webhookHint, writeEnv, writeEngineServer, nucleiServer } from "../lib/settings.mjs";
import { Discord } from "../lib/discord.mjs";

const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123";

test("settings: env lines are replaced in place, uncommented where the file explains them, removed on null", () => {
  const file = "# Optional. Uncomment to enable Discord alerts\n# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...\nCOLLUDER_EXTRA_DOMAINS=alt.example\n";
  const a = setEnvLines(file, { DISCORD_WEBHOOK_URL: HOOK, COLLUDER_CHECK_MINUTES: "5" });
  assert.equal(a, `# Optional. Uncomment to enable Discord alerts\nDISCORD_WEBHOOK_URL=${HOOK}\nCOLLUDER_EXTRA_DOMAINS=alt.example\nCOLLUDER_CHECK_MINUTES=5\n`);
  const b = setEnvLines(a, { COLLUDER_CHECK_MINUTES: "15", COLLUDER_EXTRA_DOMAINS: null });
  assert.equal(b, `# Optional. Uncomment to enable Discord alerts\nDISCORD_WEBHOOK_URL=${HOOK}\nCOLLUDER_CHECK_MINUTES=15\n`);
  assert.equal(setEnvLines("", { A: "1" }), "A=1\n");
  assert.throws(() => setEnvLines("", { A: "x\nCOLLUDER_DOMAIN=evil" }), /printable/, "no line injection");
  assert.throws(() => setEnvLines("", { A: "a b" }), /printable/);
  assert.throws(() => setEnvLines("", { "a=b": "1" }), /bad key/);
});

test("settings: only the engine's server line changes; the token line stays byte for byte", () => {
  const y = "server: oob.example\ntoken: SECRET-VALUE\njson: true\n";
  assert.equal(setServerLine(y, "alt.example"), "server: alt.example\ntoken: SECRET-VALUE\njson: true\n");
  assert.equal(setServerLine("token: T\n", "alt.example"), "server: alt.example\ntoken: T\n");
});

test("settings: files are rewritten privately (600), and unchanged files are left alone", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "colluder-settings-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = join(dir, "colluder.env"), yaml = join(dir, "engine.yaml");
  writeFileSync(env, "COLLUDER_DOMAIN=oob.example\n", { mode: 0o644 });
  writeFileSync(yaml, "server: oob.example\ntoken: T\n", { mode: 0o600 });
  assert.equal(await writeEnv(env, { COLLUDER_DOMAIN: "alt.example" }), true);
  assert.equal(readFileSync(env, "utf8"), "COLLUDER_DOMAIN=alt.example\n");
  assert.equal(statSync(env).mode & 0o777, 0o600);
  assert.equal(await writeEnv(env, { COLLUDER_DOMAIN: "alt.example" }), false, "nothing to change");
  await writeEngineServer(yaml, "alt.example");
  assert.equal(readFileSync(yaml, "utf8"), "server: alt.example\ntoken: T\n");
  writeFileSync(join(dir, "config.yaml"), "nuclei:\n    interactsh_server: https://oob.example # ours\n");
  assert.equal(await nucleiServer(join(dir, "config.yaml")), "https://oob.example");
  assert.equal(await nucleiServer(join(dir, "missing.yaml")), null);
});

test("settings: only Discord's own webhook URLs are accepted, and the browser sees four characters", () => {
  assert.ok(WEBHOOK_RE.test(HOOK));
  assert.ok(WEBHOOK_RE.test(HOOK.replace("discord.com", "canary.discord.com")));
  assert.ok(WEBHOOK_RE.test(HOOK.replace("discord.com", "discordapp.com")));
  for (const bad of [HOOK.replace("https", "http"), HOOK.replace("discord.com", "discord.com.evil.io"), "https://evil.io/api/webhooks/1234567/abcdefghijklmnopqrstuvwxyz", HOOK + "?wait=1", HOOK + "/../x"]) assert.ok(!WEBHOOK_RE.test(bad), bad);
  assert.equal(webhookHint(HOOK), "…-123");
  assert.equal(webhookHint(""), null);
});

test("settings: an alert kind turned off falls into the roll-up; the roll-up off posts nothing", () => {
  assert.deepEqual(alertKinds('{"source":false}'), { first: true, escalation: true, source: false, late: true, rollup: true, check: true });
  assert.equal(alertKinds("not json").first, true);
  const posts = [], timers = [];
  const d = new Discord({ url: "x", dashboardUrl: "http://dash/", log: () => {}, now: () => 1e9, later: (fn) => timers.push(fn) });
  d.post = (c) => posts.push(typeof c === "string" ? c : c.text);
  d.kinds = alertKinds('{"first":false}');
  d.onHit({ id: 1, protocol: "dns", tag: "t", remoteAddress: "1.2.3.4", qType: "A", fullId: "t-x", uniqueId: "x" }, {});
  assert.equal(posts.length, 0);
  timers.splice(0).forEach((f) => f());
  assert.match(posts[0], /^1 DNS more on probe t/);
  d.kinds = alertKinds('{"first":false,"rollup":false}');
  d.onHit({ id: 2, protocol: "dns", tag: "u", remoteAddress: "1.2.3.4", qType: "A", fullId: "u-x", uniqueId: "x" }, {});
  assert.equal(timers.length, 0);
  assert.equal(posts.length, 1);
});

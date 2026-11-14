// lib/config.mjs: the YAML subset, environment over file over defaults, and in-place updates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig, loadConfig, setConfigLines, writeConfig, renderConfig, requireConfig } from "../lib/config.mjs";

const SAMPLE = `# a comment
domain: oob.example   # the payload domain
extra_domains: [old.example, "other.example"]
public_ip: 203.0.113.10
dashboard:
  host: 100.64.0.10
  port: 9000
  allowed_hosts:
    - box
    - box.tailnet.example
paths:
  data: ~/colluder-data
tls:
  cert: '/etc/x y/fullchain.pem'
mail_days: 3
`;

test("config: the YAML subset reads scalars, nesting, inline and block lists, comments", () => {
  const c = parseConfig(SAMPLE);
  assert.equal(c.domain, "oob.example");
  assert.deepEqual(c.extra_domains, ["old.example", "other.example"]);
  assert.deepEqual(c.dashboard, { host: "100.64.0.10", port: "9000", allowed_hosts: ["box", "box.tailnet.example"] });
  assert.equal(c.tls.cert, "/etc/x y/fullchain.pem");
  assert.throws(() => parseConfig("domain: a\n    weird: b\n"), /line 2/);
  assert.throws(() => parseConfig("- loose\n"), /line 1/);
  assert.equal(parseConfig('note: "a # not a comment"\n').note, "a # not a comment");
});

test("config: environment over file over defaults; ~ expands; self_ips and public_url fill in", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-")), path = join(dir, "config.yaml");
  writeFileSync(path, SAMPLE);
  const c = loadConfig({ env: { COLLUDER_CONFIG: path }, home: "/home/op" });
  assert.equal(c.file, path);
  assert.equal(c.domain, "oob.example");
  assert.equal(c["dashboard.port"], 9000);
  assert.deepEqual(c["dashboard.allowed_hosts"], ["box", "box.tailnet.example"]);
  assert.equal(c["paths.data"], "/home/op/colluder-data");
  assert.equal(c["tls.key"], "/home/op/.local/share/colluder/tls/privkey.pem", "default, expanded");
  assert.deepEqual(c.self_ips, ["203.0.113.10"], "defaults to the public IP");
  assert.equal(c["dashboard.public_url"], "http://100.64.0.10:9000/");
  assert.equal(c.mail_days, 3);
  const e = loadConfig({ env: { COLLUDER_CONFIG: path, COLLUDER_DOMAIN: "Env.Example", COLLUDER_EXTRA_DOMAINS: "", COLLUDER_SELF_IPS: "198.51.100.1, 198.51.100.2" }, home: "/home/op" });
  assert.equal(e.domain, "env.example", "environment wins, lowercased");
  assert.deepEqual(e.extra_domains, ["old.example", "other.example"], "an empty variable doesn't erase the file's value");
  assert.deepEqual(e.self_ips, ["198.51.100.1", "198.51.100.2"]);
});

test("config: no file is fine until a needed key is missing, and the error says how to fix it", () => {
  const c = loadConfig({ env: { COLLUDER_CONFIG: "/nonexistent/config.yaml" }, home: "/home/op" });
  assert.equal(c.file, null);
  assert.equal(c.domain, "");
  assert.equal(c["dashboard.host"], "127.0.0.1");
  assert.throws(() => requireConfig(c, ["domain", "public_ip"]), /domain, public_ip missing.*colluder setup/);
  assert.doesNotThrow(() => requireConfig(loadConfig({ env: { COLLUDER_CONFIG: "/x", COLLUDER_DOMAIN: "a.example", COLLUDER_PUBLIC_IP: "203.0.113.1" } }), ["domain", "public_ip"]));
});

test("config: Settings updates lines in place, keeping comments; a block list becomes inline; no injection", () => {
  const a = setConfigLines(SAMPLE, { domain: "old.example", extra_domains: ["oob.example"] });
  assert.match(a, /^domain: old\.example  # the payload domain$/m);
  assert.match(a, /^extra_domains: \[oob\.example\]$/m);
  assert.equal(a.replace(/^(domain|extra_domains):.*$/gm, ""), SAMPLE.replace(/^(domain|extra_domains):.*$/gm, ""), "nothing else changed");
  assert.deepEqual(parseConfig(setConfigLines("extra_domains:\n  - a.example\n  - b.example\nmail_days: 7\n", { extra_domains: [] })), { extra_domains: [], mail_days: "7" });
  assert.match(setConfigLines("", { domain: "new.example" }), /^domain: new\.example\n$/);
  assert.equal(parseConfig(setConfigLines("", { domain: "x\ny: 1" })).y, undefined, "a newline can't make a second key");
  assert.throws(() => setConfigLines("", { "dashboard.host": "x" }), /top-level/);
});

test("config: init's file reads back to what was asked, and writeConfig keeps the file private", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-")), path = join(dir, "config.yaml");
  writeFileSync(path, renderConfig({ domain: "oob.example", public_ip: "203.0.113.10", dashboard_host: "100.64.0.10", allowed_hosts: ["box"] }), { mode: 0o600 });
  const c = loadConfig({ env: { COLLUDER_CONFIG: path }, home: "/home/op" });
  assert.equal(c.domain, "oob.example");
  assert.equal(c["dashboard.host"], "100.64.0.10");
  assert.deepEqual(c["dashboard.allowed_hosts"], ["box"]);
  assert.equal(c.mail_days, 7);
  assert.equal(await writeConfig(path, { domain: "next.example" }), true);
  assert.equal(await writeConfig(path, { domain: "next.example" }), false, "nothing to change");
  assert.match(readFileSync(path, "utf8"), /^domain: next\.example  # the payload domain/m);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

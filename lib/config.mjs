// This box's Colluder configuration: ~/.config/colluder/config.yaml (or $COLLUDER_CONFIG).
// Written once by `node lib/config.mjs init` (deploy/install.sh runs it); the Settings page updates the
// domains in place. Secrets never live here: the Discord webhook stays in colluder.env (mode 600) and
// the interactsh token in engine.yaml.
//
// Every key can be overridden by an environment variable (tests and one-off runs use that), so the
// order is: environment, then this file, then the defaults below. Paths may start with ~.
//
//   node lib/config.mjs get <key>         print one resolved value (deploy scripts read it this way)
//   node lib/config.mjs set <key> <value> change a top-level key in the file (lists comma-separated)
//   node lib/config.mjs init [--domain d --public-ip ip --dashboard-host h ...] [--yes]
//                                          write the file once, asking for what it can't detect
import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const configPath = (env = process.env) => env.COLLUDER_CONFIG || join(homedir(), ".config/colluder/config.yaml");

// key -> [environment variable, default, kind]. kind: "str" | "list" | "num" | "path"
const KEYS = {
  domain: ["COLLUDER_DOMAIN", "", "str"],
  extra_domains: ["COLLUDER_EXTRA_DOMAINS", [], "list"],
  public_ip: ["COLLUDER_PUBLIC_IP", "", "str"],
  self_ips: ["COLLUDER_SELF_IPS", [], "list"],
  "dashboard.host": ["COLLUDER_HOST", "127.0.0.1", "str"],
  "dashboard.port": ["COLLUDER_PORT", 8090, "num"],
  "dashboard.allowed_hosts": ["COLLUDER_ALLOWED_HOSTS", [], "list"],
  "dashboard.public_url": ["COLLUDER_PUBLIC_URL", "", "str"],
  "paths.data": ["COLLUDER_DATA", "~/.local/share/colluder", "path"],
  "paths.node": ["COLLUDER_NODE", "", "path"],
  "paths.interactsh_client": ["COLLUDER_CLIENT_BIN", "~/go/bin/interactsh-client", "path"],
  "paths.interactsh_server": ["COLLUDER_SERVER_BIN", "~/go/bin/interactsh-server", "path"],
  "tls.cert": ["COLLUDER_EDGE_CERT", "~/.local/share/colluder/tls/fullchain.pem", "path"],
  "tls.key": ["COLLUDER_EDGE_KEY", "~/.local/share/colluder/tls/privkey.pem", "path"],
  "tls.cert_dir": ["COLLUDER_EDGE_CERT_DIR", "~/.local/share/colluder/tls/domains", "path"],
  "nuclei.config": ["COLLUDER_NUCLEI_CONFIG", "", "path"],
  "nuclei.token_file": ["COLLUDER_NUCLEI_TOKEN_FILE", "", "path"],
  "nuclei.token_var": ["COLLUDER_NUCLEI_TOKEN_VAR", "", "str"],
  mail_days: ["COLLUDER_MAIL_DAYS", 7, "num"],
};
export const CONFIG_KEYS = Object.keys(KEYS);

// ---------- a small YAML reader: what this file uses, nothing more ----------
// Top-level and one level of nesting (two-space indent), scalars, quoted strings, inline [a, b] lists
// and "- item" block lists, # comments. Anything else is an error that names the line.
const unquote = (v) => {
  const s = v.trim();
  if (/^"(.*)"$/.test(s)) return JSON.parse(s);
  if (/^'(.*)'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  return s;
};
const stripComment = (v) => {
  let q = null;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(v[i - 1]))) return v.slice(0, i);
  }
  return v;
};
const scalar = (raw) => {
  const v = stripComment(raw).trim();
  if (v === "" || v === "~" || v === "null") return "";
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(",").map(unquote).filter((x) => x !== "");
  return unquote(v);
};
export function parseConfig(text) {
  const out = {};
  let section = null, listKey = null;
  text.split(/\r?\n/).forEach((line, n) => {
    if (!stripComment(line).trim()) return;
    const err = (why) => new Error(`config line ${n + 1}: ${why}: ${line.trim()}`);
    const item = /^(\s+)-\s*(.*)$/.exec(line);
    if (item) {
      if (!listKey) throw err("a list item outside a list");
      const [obj, k] = listKey;
      if (!Array.isArray(obj[k])) obj[k] = [];
      obj[k].push(scalar(item[2]));
      return;
    }
    const m = /^( *)([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (!m) throw err("expected key: value");
    const [, ind, key, rest] = m;
    if (ind.length === 0) {
      if (stripComment(rest).trim() === "") { out[key] = {}; section = key; listKey = [out, key]; }
      else { out[key] = scalar(rest); section = null; listKey = null; }
    } else if (ind.length === 2 && section) {
      const obj = out[section];
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw err("nested under a value");
      obj[key] = stripComment(rest).trim() === "" ? [] : scalar(rest);
      listKey = [obj, key];
    } else throw err("unexpected indent");
  });
  // a section that only ever held list items is a list
  for (const [k, v] of Object.entries(out)) if (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length) out[k] = [];
  return out;
}

const pick = (obj, key) => key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
const expand = (p, home) => (typeof p === "string" && (p === "~" || p.startsWith("~/")) ? join(home, p.slice(2)) : p);

// The resolved configuration. A missing file is fine (everything comes from the environment then);
// a malformed one throws, so a typo is never silently ignored.
export function loadConfig({ env = process.env, home = homedir(), path = configPath(env) } = {}) {
  let file = {};
  if (existsSync(path)) file = parseConfig(readFileSync(path, "utf8"));
  const cfg = { file: existsSync(path) ? path : null };
  for (const [key, [envName, def, kind]] of Object.entries(KEYS)) {
    let v = env[envName] !== undefined && env[envName] !== "" ? env[envName] : pick(file, key);
    if (v === undefined || v === "") v = def;
    if (kind === "list") v = (Array.isArray(v) ? v : String(v).split(",")).map((x) => String(x).trim()).filter(Boolean);
    else if (kind === "num") v = Number(v);
    else if (kind === "path") v = expand(String(v), home);
    else v = String(v).trim();
    cfg[key] = v;
  }
  if (!cfg["paths.node"]) cfg["paths.node"] = process.execPath;
  if (!cfg.self_ips.length && cfg.public_ip) cfg.self_ips = [cfg.public_ip];
  if (!cfg["dashboard.public_url"]) cfg["dashboard.public_url"] = `http://${cfg["dashboard.host"]}:${cfg["dashboard.port"]}/`;
  cfg.extra_domains = cfg.extra_domains.map((d) => d.toLowerCase());
  cfg.domain = cfg.domain.toLowerCase();
  return cfg;
}

// What a process needs before it can serve: the payload domain, and (for the dashboard and the edge)
// the public address. The message says how to fix it.
export function requireConfig(cfg, keys) {
  const missing = keys.filter((k) => (Array.isArray(cfg[k]) ? !cfg[k].length : !cfg[k]));
  if (!missing.length) return;
  const where = cfg.file ? `in ${cfg.file}` : `(no ${configPath()} yet: run deploy/install.sh, or node lib/config.mjs init)`;
  throw new Error(`Colluder isn't configured: ${missing.join(", ")} missing ${where}`);
}

// ---------- writing ----------
const yamlValue = (v) => {
  if (Array.isArray(v)) return `[${v.map(yamlValue).join(", ")}]`;
  if (typeof v === "number") return String(v);
  const s = String(v);
  return s === "" || /[:#'"\[\],{}&*!|>%@`]|^\s|\s$|^(true|false|null|yes|no|~)$/i.test(s) ? JSON.stringify(s) : s;
};
// Replace top-level scalar or inline-list lines in place, keeping comments and everything else; a key
// that isn't there is appended. Values are checked: no line breaks, so nothing can be injected.
export function setConfigLines(text, updates) {
  let out = text;
  for (const [key, value] of Object.entries(updates)) {
    if (!/^[a-z_]+$/.test(key)) throw new Error(`can only set top-level keys, not ${key}`);
    const v = yamlValue(value);
    if (/[\r\n]/.test(v)) throw new Error(`${key}: value must be printable on one line`);
    // the key's line, and any "- item" lines under it (a block list being replaced by an inline one)
    const m = new RegExp(`^${key}:([^\\n]*)\\n?((?:[ \\t]+-[^\\n]*\\n?)*)`, "m").exec(out);
    if (!m) { out = `${out}${out && !out.endsWith("\n") ? "\n" : ""}${key}: ${v}\n`; continue; }
    const rest = m[1], comment = rest.slice(stripComment(rest).length).trim(); // a trailing # note stays
    const line = `${key}: ${v}${comment ? `  ${comment}` : ""}`;
    out = out.slice(0, m.index) + line + (m[0].endsWith("\n") ? "\n" : "") + out.slice(m.index + m[0].length);
  }
  return out;
}
export async function writeConfig(path, updates) {
  const before = await readFile(path, "utf8").catch((e) => { if (e.code === "ENOENT") return ""; throw e; });
  const after = setConfigLines(before, updates);
  if (after === before) return false;
  const tmp = `${path}.tmp`;
  await writeFile(tmp, after, { mode: 0o600 });
  await rename(tmp, path);
  return true;
}

// The file init writes: every key, with what it does. Values are filled in; the rest stay as defaults.
export function renderConfig(v) {
  const L = (k, val, note) => `${k}: ${yamlValue(val)}${note ? `  # ${note}` : ""}`;
  return [
    "# Colluder: this box's configuration. Written by `node lib/config.mjs init`; edit it, then restart",
    "# the dashboard (systemctl --user restart colluder) and the edge (sudo systemctl restart colluder-edge).",
    "# Any key can be overridden by its environment variable (COLLUDER_DOMAIN, COLLUDER_PUBLIC_IP, ...).",
    "# Secrets don't go here: the Discord webhook lives in colluder.env, the interactsh token in engine.yaml.",
    "",
    L("domain", v.domain, "the payload domain: its NS records point at this box"),
    L("extra_domains", v.extra_domains ?? [], "other domains still served (an old one, until it lapses)"),
    L("public_ip", v.public_ip, "where every payload name resolves; the edge listens here"),
    L("self_ips", v.self_ips ?? [], "addresses that are this box (hits from them are marked); default: public_ip"),
    "",
    "dashboard:",
    `  ${L("host", v.dashboard_host ?? "127.0.0.1", "keep it private: localhost or a tailnet address")}`,
    `  ${L("port", v.dashboard_port ?? 8090)}`,
    `  ${L("allowed_hosts", v.allowed_hosts ?? [], "other names you open it by (a tailnet hostname)")}`,
    `  ${L("public_url", v.public_url ?? "", "the link Discord alerts carry; default http://host:port/")}`,
    "",
    "paths:",
    `  ${L("data", v.data ?? "~/.local/share/colluder")}`,
    `  ${L("node", v.node ?? process.execPath, "the node the services run")}`,
    `  ${L("interactsh_client", v.interactsh_client ?? "~/go/bin/interactsh-client")}`,
    `  ${L("interactsh_server", v.interactsh_server ?? "~/go/bin/interactsh-server")}`,
    "",
    "tls:  # the wildcard certificate the edge serves (deploy/cert-sync.sh copies interactsh's here)",
    `  ${L("cert", v.tls_cert ?? "~/.local/share/colluder/tls/fullchain.pem")}`,
    `  ${L("key", v.tls_key ?? "~/.local/share/colluder/tls/privkey.pem")}`,
    `  ${L("cert_dir", v.tls_cert_dir ?? "~/.local/share/colluder/tls/domains", "one <domain>/ per extra domain")}`,
    "",
    "nuclei:  # optional: another interactsh client on this box (Settings shows which server it uses)",
    `  ${L("config", v.nuclei_config ?? "", "a config file with an interactsh_server: line")}`,
    `  ${L("token_file", v.token_file ?? "", "an env file the token rotation also updates")}`,
    `  ${L("token_var", v.token_var ?? "", "the variable in it that holds the token")}`,
    "",
    L("mail_days", v.mail_days ?? 7, "the mailbox keeps mail this many days"),
    "",
  ].join("\n");
}

// ---------- command line ----------
async function detectPublicIp() {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync("ip", ["-4", "route", "get", "1.1.1.1"], { encoding: "utf8", timeout: 3000 });
    return /\bsrc (\d+\.\d+\.\d+\.\d+)/.exec(out)?.[1] ?? "";
  } catch { return ""; }
}
async function detectTailnet() {
  const { execFileSync } = await import("node:child_process");
  try { return execFileSync("tailscale", ["ip", "-4"], { encoding: "utf8", timeout: 3000 }).trim().split("\n")[0] || ""; } catch { return ""; }
}
async function init(args) {
  const path = configPath();
  if (existsSync(path) && !args.includes("--force")) { console.log(`${path} already exists; leaving it as it is (--force rewrites it).`); return; }
  const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const yes = args.includes("--yes");
  const { createInterface } = await import("node:readline/promises");
  const rl = yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, def) => {
    if (yes) return def;
    const a = (await rl.question(`${q}${def ? ` [${def}]` : ""}: `)).trim();
    return a || def;
  };
  const v = {};
  v.domain = (flag("domain") ?? (await ask("Payload domain (its NS records point at this box)", ""))).toLowerCase();
  v.public_ip = flag("public-ip") ?? (await ask("Public IPv4 address payload names resolve to", await detectPublicIp()));
  v.dashboard_host = flag("dashboard-host") ?? (await ask("Dashboard address (keep it private: 127.0.0.1 or a tailnet IP)", (await detectTailnet()) || "127.0.0.1"));
  const allowed = flag("allowed-hosts") ?? (yes ? "" : await ask("Other names you open the dashboard by, comma-separated", ""));
  v.allowed_hosts = allowed ? allowed.split(",").map((s) => s.trim()).filter(Boolean) : [];
  rl?.close();
  for (const [k, f] of [["extra_domains", "extra-domains"], ["self_ips", "self-ips"]]) if (flag(f)) v[k] = flag(f).split(",").map((s) => s.trim()).filter(Boolean);
  for (const [k, f] of [["tls_cert", "tls-cert"], ["tls_key", "tls-key"], ["tls_cert_dir", "tls-cert-dir"], ["nuclei_config", "nuclei-config"], ["token_file", "token-file"], ["token_var", "token-var"], ["interactsh_client", "interactsh-client"], ["interactsh_server", "interactsh-server"]]) if (flag(f)) v[k] = flag(f);
  // interactsh, unless given: where deploy/get-interactsh.sh puts it (~/.local/bin), else `go install`'s ~/go/bin
  for (const name of ["client", "server"]) {
    const local = `.local/bin/interactsh-${name}`;
    if (!existsSync(join(homedir(), "go/bin", `interactsh-${name}`)) && existsSync(join(homedir(), local))) v[`interactsh_${name}`] ??= `~/${local}`;
  }
  if (!v.domain || !v.public_ip) { console.error("A domain and a public IP are needed; nothing written."); process.exit(1); }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, renderConfig(v), { mode: 0o600, flag: args.includes("--force") ? "w" : "wx" });
  console.log(`wrote ${path}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === "get" && rest[0]) {
      const v = loadConfig()[rest[0]];
      if (v === undefined) throw new Error(`no config key ${rest[0]} (keys: ${CONFIG_KEYS.join(", ")})`);
      process.stdout.write(Array.isArray(v) ? v.join(",") : String(v));
    } else if (cmd === "set" && rest[0] && rest.length === 2) {
      const [key, raw] = rest, kind = KEYS[key]?.[2];
      if (!kind || key.includes(".")) throw new Error(`set works on top-level keys: ${CONFIG_KEYS.filter((k) => !k.includes(".")).join(", ")}`);
      const value = kind === "list" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : kind === "num" ? Number(raw) : raw;
      console.log((await writeConfig(configPath(), { [key]: value })) ? `set ${key}` : `${key} unchanged`);
    } else if (cmd === "init") await init(rest);
    else { console.error("usage: node lib/config.mjs get <key> | set <key> <value> | init [--domain d --public-ip ip ...] [--yes] [--force]"); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
}

#!/usr/bin/env node
// Colluder's MCP server over stdio. Claude Code starts it per session; it exits when
// stdin closes and listens on nothing. It talks to the collector's HTTP API like the dashboard does.
//
//   claude mcp add --scope user colluder -- node <this file>
//
// COLLUDER_URL: the collector. On the Colluder box it defaults to the dashboard address in
// ~/.config/colluder/config.yaml; another machine sets it (e.g. http://box.tailnet:8090).
// stdout carries only protocol messages; diagnostics go to stderr.

import http from "node:http";
import { createInterface } from "node:readline";
import { createServer } from "./lib/mcp.mjs";
import { loadConfig } from "./lib/config.mjs";

const C = process.env.COLLUDER_URL ? null : loadConfig();
const BASE = new URL(process.env.COLLUDER_URL || `http://${C["dashboard.host"]}:${C["dashboard.port"]}`);
const TIMEOUT_MS = 15_000;

// node:http, not fetch: the collector checks the Host header, which fetch won't let us set
function request(method, path, body) {
  const data = body === undefined || body === null ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: BASE.hostname, port: BASE.port || 80, path, method,
      // the actor label: the collector lets Claude change only the probes it planted
      headers: { host: BASE.host, accept: "application/json", "x-colluder-actor": "claude",
        ...(data ? { "content-type": "application/json", "content-length": data.length } : {}) },
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const type = String(res.headers["content-type"] || "");
        let body = buf;
        if (type.startsWith("application/json")) { try { body = JSON.parse(buf.toString("utf8")); } catch { body = { error: "unreadable JSON" }; } }
        else if (type.startsWith("text/")) body = buf.toString("utf8");
        resolve({ status: res.statusCode, body });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`no answer from ${BASE.host} in ${TIMEOUT_MS / 1000} s`)));
    req.on("error", reject);
    req.end(data ?? undefined);
  });
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const api = { get: (path) => request("GET", path), send: (method, path, body) => request(method, path, body) };
const handle = createServer({ api, send, version: "0.2.0" });

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  for (const m of Array.isArray(msg) ? msg : [msg]) handle(m).catch((e) => process.stderr.write(`colluder-mcp: ${e.message}\n`));
});
rl.on("close", () => process.exit(0));

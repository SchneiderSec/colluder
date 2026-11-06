#!/usr/bin/env node
// Colluder's MCP server over stdio (PLAN-MCP.md). Claude Code starts it per session; it exits when
// stdin closes and listens on nothing. It talks to the collector's HTTP API like the dashboard does.
//
//   claude mcp add --scope user colluder -- node <this file>
//
// COLLUDER_URL: the collector (default http://100.64.0.10:8090; another tailnet machine sets the
// tailnet name). stdout carries only protocol messages; diagnostics go to stderr.

import http from "node:http";
import { createInterface } from "node:readline";
import { createServer } from "./lib/mcp.mjs";

const BASE = new URL(process.env.COLLUDER_URL || "http://100.64.0.10:8090");
const TIMEOUT_MS = 15_000;

// node:http, not fetch: the collector checks the Host header, which fetch won't let us set
function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: BASE.hostname, port: BASE.port || 80, path, method: "GET",
      headers: { host: BASE.host, accept: "application/json", "x-colluder-actor": "claude" },
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
    req.end();
  });
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const handle = createServer({ api: { get }, send, version: "0.1.0" });

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  for (const m of Array.isArray(msg) ? msg : [msg]) handle(m).catch((e) => process.stderr.write(`colluder-mcp: ${e.message}\n`));
});
rl.on("close", () => process.exit(0));

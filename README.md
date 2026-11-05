# Colluder

Your insider on the wire. A self-hosted dashboard for out-of-band interactions against
`oob.example`, served on the tailnet at <http://100.64.0.10:8090>
(also `http://box.tailnet.ts.net:8090`).

## How it fits together

```
interactsh-server (203.0.113.10, :53/:80/:443, -auth)      untouched
        ▲ polls every 2 s (token from ~/.config/colluder/engine.yaml, session in session.yaml)
colluder-engine.service   interactsh-client v1.4.1, stdout appended → ~/.local/share/colluder/interactions.jsonl
        │ tail (fs.watch + poll, resumes by offset, survives truncation)
colluder.service          node server.mjs → SQLite (colluder.db), SSE, JSON API, UI from web/dist
        ▼
browser on the tailnet
```

- **Engine**: the stock `interactsh-client` CLI. Colluder never speaks the interactsh protocol.
  `-sf session.yaml` keeps the correlation id across restarts, so planted payloads stay valid.
- **Collector** (`server.mjs`, `lib/`): Node 26, no runtime npm dependencies (`node:http`,
  `node:sqlite`, `fs` tail). Every JSON line is stored once (deduped by hash), tagged, and pushed
  to browsers over Server-Sent Events.
- **UI** (`web/`): React + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix), built by Vite into
  `web/dist`, which the collector serves. `web/dist` and `web/node_modules` are not committed.

## Probes and tags

A probe is a tag you plant somewhere. The composer gives three payloads per tag:

| Variant | Shape | Use |
|---|---|---|
| DNS | `tag.<id>.oob.example` | hostname fields, resolve-only targets |
| HTTP | `http://tag.<id>.oob.example/` | URL fields |
| HTTPS | `https://<id>.oob.example/tag/` | tag in the **path**: the wildcard certificate covers one label only |

Hits are matched to probes by the label just before the id, or (HTTP/S) by the first path
segment. Labels further left are kept as exfil data. Hits for tags you never planted create an
"unregistered" probe; hits with no tag go to Unregistered.

**Resolver chatter.** Public resolvers using QNAME minimisation (Cloudflare, Google) look up the
bare payload id (`NS`, `A`, …) before the tagged name, and a client fetching an HTTPS payload
resolves the bare host because its tag sits in the path. An untagged DNS lookup of the bare id
within 10 s of a tagged hit is labelled "resolver chatter around <tag>": it stays listed under
Unregistered but never counts as new, so it can't light up the tab title.

**Restarts.** The engine keeps its correlation id (the first 20 characters of the payload host) in
`session.yaml`, so planted payloads survive restarts. Only the 13-character suffix changes per run,
and the server routes on the correlation id alone. systemd stops the engine with SIGINT because the
client saves its session only from its interrupt handler.

## Install / update (operator)

```sh
tools/oob-dashboard/deploy/install.sh        # config (600), UI build, units, daemon-reload
systemctl --user disable --now interactsh-web.service    # first time only: frees :8090
systemctl --user enable --now colluder-engine.service colluder.service
```

After changing UI code: `npm run build` here, then reload the browser (no restart needed).
After changing server code: `systemctl --user restart colluder`.

Discord alerts (first hit per probe, then a 60 s roll-up): put `DISCORD_WEBHOOK_URL=...` in
`~/.config/colluder/colluder.env`, restart `colluder`, then switch alerts on in the UI.

## Configuration (environment, all optional)

| Variable | Default |
|---|---|
| `COLLUDER_HOST` / `COLLUDER_PORT` | `100.64.0.10` / `8090` |
| `COLLUDER_DATA` | `~/.local/share/colluder` (jsonl, payload.txt, colluder.db) |
| `COLLUDER_ENGINE_UNIT` | `colluder-engine.service` |
| `COLLUDER_ALLOWED_HOSTS` | `box.tailnet.ts.net,user` (plus host:port) |
| `COLLUDER_DOMAIN` | `oob.example` |
| `DISCORD_WEBHOOK_URL` | unset (alerts off) |

## Security notes

- Bound to the tailnet address only; the tailnet is the authentication.
- Host-header allowlist (DNS-rebinding defence); state-changing requests need a JSON body and a
  same-origin `Origin` (CSRF defence).
- Strict CSP: scripts from self only; styles from self plus a per-page-load nonce for the one
  `<style>` tag Radix's scroll lock injects.
- Raw requests are attacker-controlled. They are rendered as text only, and Discord posts are
  neutralised (no mentions, no markdown, no links).
- The interactsh token lives only in `~/.config/colluder/engine.yaml` (mode 600). Never on argv,
  never in this repo.
- Source enrichment: reverse DNS runs automatically; ASN lookup (Team Cymru, a third party)
  only when you click "Look up".

## Development

```sh
npm test                      # collector unit tests (node:test)
npm run typecheck && npm run build
```

`PRODUCT.md` holds the product brief, `DESIGN.md` the visual system, `ROADMAP.md` the planned
tools (hosted files, redirects & responses, DNS rebinding, payload kit, listeners).

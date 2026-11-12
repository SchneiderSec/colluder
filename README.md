# Colluder

Your insider on the wire. A self-hosted dashboard for out-of-band interactions against
`oob.example`, served on the tailnet at <http://100.64.0.10:8090>
(also `http://box.tailnet.ts.net:8090`).

## How it fits together

```
internet ── :80/:443 ── colluder-edge (phase 2)  answers Colluder's probes itself → edge.jsonl
                              └─ everything else → interactsh-server on 8081/8444 (real IP in X-Colluder-Origin-IP)
         ── :25 :587 :465 ── colluder-edge (after smtp-front.sh): mail for Colluder's names → mail-spool + edge.jsonl
         ── :53 :389 ── interactsh-server (203.0.113.10, token in /etc/interactsh/server.yaml)
        ▲ polls every 2 s (token from ~/.config/colluder/engine.yaml, session in session.yaml)
colluder-engine.service   interactsh-client v1.4.1, stdout appended → ~/.local/share/colluder/interactions.jsonl
        │ tail both files (fs.watch + poll, resumes by offset, survives truncation)
colluder.service          node server.mjs → SQLite (colluder.db), SSE, JSON API, rules.json, UI from web/dist
        ▼
browser on the tailnet
```

Until the phase 2 cutover runs, interactsh still owns :80/:443 and the edge isn't running: the
dashboard says so, and HTTP rules are saved but not served. See `PHASE2.md`.

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
| HTTPS | `https://tag-<id>.oob.example/` | tag **joined to the id with a dash**: the wildcard certificate covers one label only, so `tag.<id>` fails TLS. The older path form `https://<id>.oob.example/tag/` is still read. |

Every protocol uses one host form, `tag-<id>.oob.example`. With the edge's DNS front
(`sudo deploy/dns-front.sh`, see PLAN-SHORTID.md) `<id>` is Colluder's 6-char short id, e.g.
`https://signup7-k7wq2x.oob.example/`; before it, the engine's 33-char id. Email
payloads use the short id once the edge receives SMTP (`deploy/smtp-front.sh`, PLAN-MAILBOX.md).

Hits are matched to probes by the label just before the id, or (HTTP/S) by the first path
segment. Labels further left are kept as exfil data. Hits for tags you never planted create an
"unregistered" probe; hits with no tag go to Unregistered.

**Resolver chatter.** Public resolvers using QNAME minimisation (Cloudflare, Google) look up the
bare payload id (`NS`, `A`, …) before the tagged name, and a client fetching an older path-form
HTTPS payload resolves the bare host. An untagged DNS lookup of the bare id
within 10 s of a tagged hit is labelled "resolver chatter around <tag>": it stays listed under
Unregistered but never counts as new, so it can't light up the tab title.

**HTTP responses (phase 2).** Each probe's HTTP response tab sets what it answers: interactsh's
default reply, a redirect (with optional loops back through the probe), a custom response, or a hosted
file (templates for XXE DTDs, headless-browser probe pages, SVG, JWKS). Rules are versioned; every hit
records which version answered it. The edge answers every correlation id this dashboard has used, so
HTTP payloads from before an id change work again once the edge is live.

**Restarts.** The engine keeps its correlation id (the first 20 characters of the payload host) in
`session.yaml`, so planted payloads survive restarts. Only the 13-character suffix changes per run,
and the server routes on the correlation id alone. systemd stops the engine with SIGINT because the
client saves its session only from its interrupt handler.

## Outside check

The edge's heartbeat only says the edge process is running. Behind it, interactsh can stop answering DNS
(the edge then drops the query and counts no error), and the delegation, the certificate or the domain
can lapse. Any of these turns every payload dark while the dashboard looks healthy, and a quiet probe
then reads as "not vulnerable". So every 10 minutes (`lib/selfcheck.mjs`) the collector:

- asks Cloudflare (1.1.1.1) and Google (8.8.8.8) to resolve a fresh, never-cached name on the short host
  (`<nonce>.colluder-check-<short>.<domain>`) and expects the box's IP back *and* the edge's record of
  the lookup: the real internet path, end to end;
- requests `colluder-check-<short>.<domain>/<nonce>` over HTTP and HTTPS (certificate verified) and
  expects the edge's record. These run from the box itself, so they cover the edge and the certificate,
  not the firewall in front of it;
- reads the certificate's end date from that HTTPS answer, and the domain's registration end date from
  RDAP once a day. It warns under 21 days for the certificate (interactsh's certmagic renews it at about
  30, so this fires only if that renewal failed) and under 30 days for the domain.

A failed step is retried once a minute later before it counts. A failing check shows a red banner and
status item, changes the empty probe's "a callback will show up within seconds" line, and posts to
Discord on the change (and again when it passes). The tag `colluder-check` is reserved: its traffic is
never stored as hits. Settings → Outside check shows every step and has **Check now**; Claude sees the
result in its `status` tool. It runs only once the edge fronts DNS (the short host is the payload).

## Mailbox (PLAN-MAILBOX.md)

Mail to `<anyone>@mailbox-<short>.<domain>` is kept as mail, not hits: no Discord alert, not in the
probe views, kept 7 days (`COLLUDER_MAIL_DAYS`). The local part names the account (`orca-attacker@…`).
The edge receives it on :25/:587 (STARTTLS) and :465 once `sudo deploy/smtp-front.sh` has run, writes
each message to disk before it answers 250, and refuses mail for any other name. Read it in the
Mailbox tool, with `GET /api/mail/latest?local=orca-attacker&since=<time>&wait=30` (the newest message
with the one-time code and magic link found in it), or with the MCP's `wait_for_mail`.

**Engine check.** interactsh keeps registrations in memory: when it restarts it forgets the engine's
id and the engine keeps polling silently. Every 3 minutes the dashboard looks up its own engine id
through the public DNS path and expects the engine to log it; twice not, and the engine is restarted
(it registers again). The engine reads "degraded" until it records again.

## Two domains (moving to a new one)

Colluder can serve a second domain next to the payload domain, so a new domain is answering, has its
own certificate and passes the outside check before any payload uses it, and the old one keeps working
until it lapses. `domain` in config.yaml is the payload domain; `extra_domains` lists the others. The
dashboard publishes the list in `rules.json`; the edge owns our names under any of them, passes each
apex through to interactsh, and picks each domain's certificate by server name (`tls.cert_dir/<domain>/`,
copied there by `cert-sync.sh`; `tls.cert` stays the default). interactsh reads its domains from
`/etc/interactsh/domains.env`.

```sh
# 1. at the registrar: glue records ns1/ns2.<new> -> <public_ip>, then nameservers ns1/ns2.<new>
# 2. operator:
sudo deploy/add-domain.sh new.example         # checks the delegation first; adds it to extra_domains
sudo deploy/add-domain.sh --rollback          # undo
```

The script stops unless the registry already delegates the domain here (interactsh asks Let's Encrypt
for the wildcard once, at start), restarts interactsh with both domains, waits for the certificate,
installs the multi-domain `cert-sync`, restarts the edge and the dashboard, and verifies DNS (direct and
through Cloudflare), HTTPS on both domains and the outside check. Payloads keep using the old domain.

## Phase 2 cutover (operator, once)

```sh
sudo deploy/cutover-phase2.sh     # edge on :80/:443, interactsh to 8081/8444, token rotated
sudo deploy/rollback-phase2.sh    # undo: interactsh back on :80/:443 (keeps the new token)
```

The script stops if a nuclei scan is running (`--force` overrides), never prints the token, and ends
with live checks (edge answers, interactsh still reachable and authenticated, engine polling).

## Install / update (operator)

```sh
deploy/install.sh        # config.yaml (asks once), engine.yaml + colluder.env (600), UI build, units
systemctl --user enable --now colluder-engine.service colluder.service
```

The first run writes `~/.config/colluder/config.yaml`: it asks for the payload domain, detects the
public IP and a tailnet address, and never overwrites the file afterwards. Unattended:
`deploy/install.sh --domain oob.example --public-ip 203.0.113.10 --dashboard-host 100.64.0.10 --yes`.
The units in `deploy/` are templates; install.sh (user units) and the cutover (system units) fill in
the paths, node and user from config.yaml.

After changing UI code: `npm run build` here, then reload the browser (no restart needed).
After changing server code: `systemctl --user restart colluder`. After changing `edge.mjs` or
`lib/`: `sudo systemctl restart colluder-edge` too.

Discord alerts (per probe: the first hit of an episode, the first HTTP hit after DNS-only traffic,
an HTTP hit from a new source, late hits on retired probes; never resolver chatter; everything else
in a once-a-minute count. See PLAN-REVIEW3.md A1): paste the webhook URL in Settings > Alerts. Each
kind of alert can be switched off there; one switched off is counted in the roll-up instead. Posts are
embeds coloured by protocol. Colluder sets the webhook's name and raccoon avatar itself, once per
webhook (`assets/discord-avatar.png`, via the webhook's own token, since Discord can't fetch an image
from this tailnet-only box).

## Settings
Settings saves what it changes where it already lives, so a restart, a deploy script and a hand
edit agree with it (lib/settings.mjs). Claude can't change any of it.
- **Domains:** which served domain new payloads use. Switching writes `domain` and `extra_domains`
  in config.yaml (comments and other keys kept) and the `server:` line of `engine.yaml` (nothing else
  in it), restarts the engine (new long payload; the short id stays) and Colluder. When
  `nuclei.config` is set, that client's `interactsh_server` is shown, not changed. RDAP's registration date warns about
  a domain under 32 days old, which some corporate web filters block.
- **Outside check:** how often it runs (`COLLUDER_CHECK_MINUTES`, 0 is off). Applied at once.
- **Alerts:** the Discord webhook (`DISCORD_WEBHOOK_URL`, only Discord's own webhook URLs; the
  browser only ever sees its last four characters), a test message, and which alerts post (kept in
  the database). Applied at once.
- **Display**, per browser: theme (dark, high contrast, light, match system), colour-blind-safe
  protocol colours, text size, hits list height, motion (moving, still lines, none), night shift,
  and an optional arrival chime.

## Claude (MCP)
`mcp.mjs` lets a Claude Code session plant probes, set what they answer, wait for callbacks, read
hits and fetch reports (PLAN-MCP.md). Claude can change only the probes it planted; yours are
read-only to it. It runs over stdio, so Claude Code starts it per session. It listens on nothing and
talks to the collector's API like the dashboard does. Register it once (the operator):

    claude mcp add --scope user colluder -- node ~/tools/colluder/mcp.mjs

`COLLUDER_URL` points it at the collector (default: `dashboard.host:port` from config.yaml, so
another machine sets it). Everything a hit
carries comes back under an `untrusted` key: Claude is told it is evidence, never instructions.

## Configuration

Everything about the box lives in `~/.config/colluder/config.yaml` (`COLLUDER_CONFIG` moves it),
written once by install.sh and commented key by key. Each key has an environment variable that
overrides it, for tests and one-off runs. `node lib/config.mjs get <key>` prints a resolved value;
the deploy scripts read the file that way (deploy/lib.sh).

| Key | Variable | Default |
|---|---|---|
| `domain` | `COLLUDER_DOMAIN` | none: required (the payload domain) |
| `extra_domains` | `COLLUDER_EXTRA_DOMAINS` | none (other domains served; see Two domains) |
| `public_ip` | `COLLUDER_PUBLIC_IP` | none: required (where payload names resolve; the edge listens here) |
| `self_ips` | `COLLUDER_SELF_IPS` | `public_ip` (hits from these read "this box") |
| `dashboard.host` / `.port` | `COLLUDER_HOST` / `COLLUDER_PORT` | `127.0.0.1` / `8090` |
| `dashboard.allowed_hosts` | `COLLUDER_ALLOWED_HOSTS` | none (other names you open it by, besides host:port) |
| `dashboard.public_url` | `COLLUDER_PUBLIC_URL` | `http://host:port/` (the link Discord alerts carry) |
| `paths.data` | `COLLUDER_DATA` | `~/.local/share/colluder` (jsonl, payload.txt, colluder.db) |
| `paths.node` | `COLLUDER_NODE` | the node install.sh ran with (the units run it) |
| `paths.interactsh_client` / `_server` | `COLLUDER_CLIENT_BIN` / `COLLUDER_SERVER_BIN` | `~/go/bin/interactsh-client` / `-server` |
| `tls.cert` / `tls.key` | `COLLUDER_EDGE_CERT` / `COLLUDER_EDGE_KEY` | `~/.local/share/colluder/tls/{fullchain,privkey}.pem` (kept fresh by `colluder-cert-sync.timer`) |
| `tls.cert_dir` | `COLLUDER_EDGE_CERT_DIR` | `~/.local/share/colluder/tls/domains` (one `<domain>/` per extra domain) |
| `nuclei.config` | `COLLUDER_NUCLEI_CONFIG` | none (another interactsh client's config; Settings shows its server) |
| `nuclei.token_file` / `token_var` | | none (an env file the cutover's token rotation also updates) |
| `mail_days` | `COLLUDER_MAIL_DAYS` | `7` |

Secrets stay out of it. `~/.config/colluder/colluder.env` (600) holds `DISCORD_WEBHOOK_URL` and
`COLLUDER_CHECK_MINUTES` (Settings writes both); `engine.yaml` (600) holds the interactsh server and
token. The edge's listeners come from `~/.config/colluder/edge.env`, which the deploy scripts write:
`COLLUDER_EDGE_HTTP` / `_HTTPS` (default `public_ip:80` / `:443`, `off` disables HTTPS),
`COLLUDER_UPSTREAM_HTTP` / `_HTTPS`, `COLLUDER_EDGE_DNS`, `COLLUDER_EDGE_SMTP` / `_SMTPS`.

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
- The edge is the only internet-facing Colluder process: no API, no database, only
  `CAP_NET_BIND_SERVICE`, `ProtectSystem=strict`, writes only the data dir. Its HTTP/1.1 reader caps
  heads at 32 KB, recorded bodies at 1 MB, and every wait has a deadline. Rules can only be written
  from the tailnet dashboard; only probes you configured redirect anywhere.
- TLS for the apex (interactsh's polling API) is passed through without decryption; Colluder's own
  probes are terminated with the wildcard certificate and recorded byte-for-byte.
- Source enrichment: reverse DNS runs automatically; ASN lookup (Team Cymru, a third party)
  only when you click "Look up".

## Development

```sh
npm test                      # collector + edge tests (node:test; the edge runs on loopback against fake upstreams)
npm run typecheck && npm run build
```

`PRODUCT.md` holds the product brief, `DESIGN.md` the visual system, `ROADMAP.md` what is planned:
per-probe HTTP responses (redirects, loops, hosted files) and DNS answers (rebinding) as tabs on each
probe, plus the Payload kit and Listeners in the rail.

# Colluder guide

The reference behind the [README](../README.md): how Colluder is put together, what each setup step
does, and how its features behave.

## How it fits together

```
internet ── :80 :443 ──── colluder-edge   answers Colluder's probes itself, records them → edge.jsonl
          ── :53 ───────┤                 relays DNS to interactsh, records Colluder's names
          ── :25 :587 :465                receives mail for Colluder's names → mail spool
                          └─ everything else → interactsh-server (internal ports, the client's real IP in a header)
                                   ▲ polls every 2 s
colluder-engine.service    the stock interactsh-client, appending JSON lines → interactions.jsonl
                                   │ tails both files
colluder.service           node server.mjs → SQLite, live updates (SSE), JSON API, the UI
                                   ▼
                           your browser, on the private network
```

- **Engine:** the stock `interactsh-client` CLI (v1.4.1). Colluder never speaks the interactsh
  protocol itself. `-sf session.yaml` keeps the correlation id across restarts, so planted payloads
  stay valid.
- **Collector** (`server.mjs`, `lib/`): Node 26 with no runtime npm dependencies (`node:http`,
  `node:sqlite`). Every JSON line is stored once, matched to its probe and pushed to browsers.
- **Edge** (`edge.mjs`): the only internet-facing Colluder process. It answers probes by their
  rules and passes everything else to interactsh untouched.
- **UI** (`web/`): React, TypeScript, Tailwind CSS v4 and shadcn/ui, built by Vite into `web/dist`,
  which the collector serves.

## Setup in detail

You need:

- A Linux server with a public IPv4 address, systemd and sudo (tested on a fresh Ubuntu 24.04).
- A domain, or a subdomain, delegated to that server (below).
- Node 26 or later.
- Ports 53 (UDP and TCP), 80 and 443 open, plus 25, 465 and 587 for mail, in the server's firewall
  and any cloud firewall in front of it.
- A private way to reach the dashboard, such as Tailscale, or an SSH tunnel
  (`ssh -L 8090:127.0.0.1:8090 you@your-server`). Don't expose it to the internet.

### Delegating the domain

Colluder answers DNS for its domain itself, so the domain's nameservers must be this server. Replace
`oob.example` and `203.0.113.10` with your domain and IP.

- **A whole domain:** at the registrar, create glue records `ns1.oob.example` and `ns2.oob.example`
  → `203.0.113.10`, then make them the domain's nameservers.
- **A subdomain of a domain you already have** (its other records stay as they are): where that
  domain's DNS is hosted, add an `A` record `ns-oob` → `203.0.113.10` and an `NS` record `oob` →
  `ns-oob.<your domain>`. Colluder's domain is then `oob.<your domain>`.

`./colluder check` confirms the delegation by asking the parent zone's own servers, so it works
before anything on the server answers.

### `./colluder setup`

Run it as your own user from the checkout; it asks for sudo when it reaches the steps that need root.
It asks for the domain the first time (or pass `--domain oob.example --public-ip 203.0.113.10
--dashboard-host 100.64.0.10 --yes` to run unattended). Every step checks before it changes anything,
skips itself when it's already done, never prints a token, and ends with live checks, so running
setup again after fixing something picks up where it stopped.

1. **interactsh.** Downloads the interactsh v1.4.1 release binaries for this machine, checks them
   against the release's checksums and installs them in `~/.local/bin` (`deploy/download.sh`). If
   you built interactsh with `go install`, Colluder uses it from `~/go/bin`.
2. **Dashboard** (`deploy/install.sh`). Writes `~/.config/colluder/config.yaml` once (the domain, the
   detected public IP, a tailnet address if there is one), builds the UI, installs the user units,
   turns on lingering (so the dashboard and engine keep running after you log out) and starts the
   dashboard.
3. **Check** (`deploy/check.sh`): tools, Node, interactsh, the domain's delegation, ports, firewall
   and lingering. Setup stops here if anything fails (`--force` goes ahead anyway).
4. **Web** (`deploy/edge.sh`, root). Writes a fresh interactsh token (`/etc/interactsh/server.yaml`,
   root, 600, and the engine's `engine.yaml`), starts interactsh under systemd on internal HTTP
   ports, waits for its Let's Encrypt wildcard certificate and copies it for the edge, puts the edge
   on :80/:443 and starts the engine. An interactsh you started by hand earlier is stopped first.
5. **DNS** (`deploy/dns.sh`, root). The edge takes :53 in front of interactsh, so Colluder's
   6-character short id resolves and its lookups are recorded. The outside check runs from here on.
6. **Mail** (`deploy/mail.sh`, root; skipped with `--no-mail`). The edge takes :25, :587 and :465 and
   receives mail for Colluder's names: the mailbox and email payloads. It never relays or sends.

Each step can be undone on its own: `sudo deploy/edge.sh --undo`, `sudo deploy/dns.sh --undo`,
`sudo deploy/mail.sh --undo`. `./colluder uninstall` removes everything (it keeps your probes, hits
and mail unless you add `--purge`).

## Probes and tags

A probe is a tag you plant somewhere. The plant form gives payloads per tag:

| Variant | Shape | Use |
|---|---|---|
| DNS | `tag-<id>.oob.example` | hostname fields, resolve-only targets |
| HTTP | `http://tag-<id>.oob.example/` | URL fields |
| HTTPS | `https://tag-<id>.oob.example/` | the tag is joined to the id with a dash, because a wildcard certificate covers one label only |
| Email | `x@tag-<id>.oob.example` | arrives as an SMTP hit with the whole message (once setup's mail step has run) |

`<id>` is Colluder's 6-character short id once the edge answers DNS (setup's DNS step), and the engine's
33-character id before that. The **Payload kit** builds more forms for one probe: allowlist
bypasses, address encodings, cloud metadata URLs, UNC paths and more, each with a short variant code
so a hit says which one fired.

Hits are matched to probes by the label just before the id, or (HTTP/S) by the first path
segment. Labels further left are kept as exfil data and decoded when they look encoded. A hit for a
tag you never planted gets its own "not planted" row; hits with no tag are listed apart.

**Resolver chatter.** Public resolvers using QNAME minimisation (Cloudflare, Google) look up the
bare payload id before the tagged name. An untagged lookup of the bare id within 10 s of a tagged
hit is labelled "resolver chatter" and never counts as new.

**HTTP responses.** Each probe's HTTP response tab sets what it answers: interactsh's default reply,
a redirect (optionally looping back through the probe first), a custom response, or a hosted file.
Rules are versioned, and every hit records which version answered it.

**Restarts.** The engine keeps its correlation id in `session.yaml`, so planted payloads survive
restarts. systemd stops it with SIGINT because the client saves its session only from its interrupt
handler.

## The outside check

The edge's heartbeat only says the edge process is running. Behind it, interactsh can stop answering
DNS, and the delegation, the certificate or the domain can lapse. Any of these turns every payload
dark while the dashboard looks healthy. So every 10 minutes (`lib/selfcheck.mjs`) the collector:

- asks Cloudflare (1.1.1.1) and Google (8.8.8.8) to resolve a fresh, never-cached name on the short
  host and expects the box's IP back *and* the edge's record of the lookup;
- requests a fresh path over HTTP and HTTPS (certificate verified) and expects the edge's record.
  These run from the box itself, so they cover the edge and the certificate, not a firewall in front
  of it;
- reads the certificate's end date, and the domain's registration end date from RDAP once a day. It
  warns under 21 days for the certificate (interactsh renews at about 30) and under 30 for the domain.

A failed step is retried once a minute later before it counts. A failure shows a red banner and
posts to Discord. Settings → Outside check shows every step and has **Check now**.

**Engine check.** interactsh keeps registrations in memory: when it restarts it forgets the
engine's id, and the engine keeps polling silently. Every 3 minutes the dashboard looks up its own
engine id through public DNS and expects the engine to log it; after two misses it restarts the
engine, which registers again.

## Mailbox

Mail to `<anyone>@mailbox-<id>.oob.example` is kept as mail, not hits: no alerts, not in the probe
views, kept 7 days (`mail_days`). The local part names the account (`orca-attacker@…`). The edge
writes each message to disk before it answers 250 and refuses mail for any other name; nothing is
relayed or sent. Read it in the Mailbox tool, through the API
(`GET /api/mail/latest?local=orca-attacker&since=<time>&wait=30` returns the newest message with
the one-time code and magic link found in it), or with the MCP's `wait_for_mail`.

## Discord alerts

Paste a webhook URL in Settings → Alerts. Per probe, Colluder posts the first hit of an episode, the
first HTTP hit after DNS-only traffic, an HTTP hit from a new source, and late hits on retired
probes; everything else goes into a once-a-minute count, never dropped. Each kind can be switched off.
Posts are neutralised (no mentions, no markdown, no links), since hits carry attacker-controlled text.

## Claude Code (MCP)

`mcp.mjs` lets a Claude Code session plant probes, set what they answer, wait for callbacks, read
hits and fetch reports. Claude can change only the probes it planted; yours are read-only to it.
It runs over stdio (Claude Code starts it per session), listens on nothing, and uses the
collector's API like the dashboard does. Register it once:

```sh
claude mcp add --scope user colluder -- node /path/to/colluder/mcp.mjs
```

`COLLUDER_URL` points it at a collector on another machine (default: `dashboard.host:port` from
config.yaml). Everything a hit carries comes back under an `untrusted` key, and Claude is told it is
evidence, never instructions.

## Configuration

Everything about the box lives in `~/.config/colluder/config.yaml` (`COLLUDER_CONFIG` moves it),
written once by `./colluder setup` and commented key by key. Each key has an environment variable that
overrides it. `node lib/config.mjs get <key>` prints a resolved value; the deploy scripts read the
file that way (`deploy/lib.sh`), and the unit files in `deploy/` are templates they fill in.

| Key | Variable | Default |
|---|---|---|
| `domain` | `COLLUDER_DOMAIN` | none: required (the payload domain) |
| `extra_domains` | `COLLUDER_EXTRA_DOMAINS` | none (other domains served; see below) |
| `public_ip` | `COLLUDER_PUBLIC_IP` | none: required (where payload names resolve; the edge listens here) |
| `self_ips` | `COLLUDER_SELF_IPS` | `public_ip` (hits from these read "this box") |
| `dashboard.host` / `.port` | `COLLUDER_HOST` / `COLLUDER_PORT` | `127.0.0.1` / `8090` |
| `dashboard.allowed_hosts` | `COLLUDER_ALLOWED_HOSTS` | none (other names you open it by, besides host:port) |
| `dashboard.public_url` | `COLLUDER_PUBLIC_URL` | `http://host:port/` (the link Discord alerts carry) |
| `paths.data` | `COLLUDER_DATA` | `~/.local/share/colluder` |
| `paths.node` | `COLLUDER_NODE` | the node install.sh ran with (the units run it) |
| `paths.interactsh_client` / `_server` | `COLLUDER_CLIENT_BIN` / `COLLUDER_SERVER_BIN` | `~/go/bin/interactsh-client` / `-server` (setup records `~/.local/bin/…` when it downloaded them there) |
| `tls.cert` / `tls.key` | `COLLUDER_EDGE_CERT` / `COLLUDER_EDGE_KEY` | `~/.local/share/colluder/tls/{fullchain,privkey}.pem` (kept fresh by `colluder-cert-sync.timer`) |
| `tls.cert_dir` | `COLLUDER_EDGE_CERT_DIR` | `~/.local/share/colluder/tls/domains` (one `<domain>/` per extra domain) |
| `nuclei.config` | `COLLUDER_NUCLEI_CONFIG` | none (another interactsh client's config, such as nuclei's; Settings shows its server) |
| `nuclei.token_file` / `token_var` | | none (an env file whose token setup's web step also updates when it rotates it) |
| `mail_days` | `COLLUDER_MAIL_DAYS` | `7` |

Secrets stay out of it. `~/.config/colluder/colluder.env` (600) holds `DISCORD_WEBHOOK_URL` and
`COLLUDER_CHECK_MINUTES` (Settings writes both); `engine.yaml` (600) holds the interactsh server and
token. The edge's listeners come from `~/.config/colluder/edge.env`, which the deploy scripts write.

**Settings** saves each change where it already lives, so a restart, a deploy script and a hand edit
agree with it: the payload domain (config.yaml and engine.yaml, then the engine restarts), the
outside check's interval, the Discord webhook and which alerts post, and per-browser display options
(theme, colour-blind-safe protocol colours, text size, motion, night shift, an arrival chime).

## Moving to a new domain

Colluder can serve a second domain next to the payload domain, so a new one is answering, has its
own certificate and passes the outside check before any payload uses it, while the old one keeps
working until it lapses.

```sh
# at the registrar first: glue records ns1/ns2.new.example -> your IP, then nameservers ns1/ns2.new.example
./colluder add-domain new.example             # checks the delegation first; adds it to extra_domains
sudo deploy/add-domain.sh --undo              # undo
```

Then switch payloads to it in Settings → Domains.

## Updating

`./colluder update` pulls the latest version, rebuilds the UI (reinstalling its packages when the
lockfile changed), restarts the dashboard and restarts the edge. When working on the code yourself,
`npm run build` rebuilds the UI and `systemctl --user restart colluder` restarts the dashboard.

## Security model

- The dashboard binds to a private address only and has no login: anyone who can reach it has full
  access. It checks the Host header against an allowlist (DNS-rebinding defence), and
  state-changing requests need a JSON body and a same-origin `Origin` (CSRF defence).
- Strict CSP: scripts from self only; styles from self plus a per-page-load nonce.
- Captured requests are attacker-controlled. They are rendered as text only, never as HTML.
- The interactsh token lives only in files with mode 600, never on a command line and never in
  this repo.
- The edge is the only internet-facing Colluder process: no API, no database, only
  `CAP_NET_BIND_SERVICE`, `ProtectSystem=strict`, and it writes only the data directory. Its HTTP/1.1
  reader caps heads at 32 KB and recorded bodies at 1 MB, and every wait has a deadline. Rules can
  only be written from the dashboard, and only probes you configured redirect anywhere.
- TLS for the apex (interactsh's polling API) passes through without decryption; Colluder's own
  probes are terminated with the wildcard certificate and recorded byte-for-byte.
- Reverse DNS of sources runs automatically; the ASN lookup (Team Cymru, a third party) runs only
  when you click "Look up".

Only test targets you're authorised to test.

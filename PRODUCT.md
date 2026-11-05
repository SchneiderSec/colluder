# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- **Collector:** one small Node (v26, via nvm) service using plain `http`, an `fs` tail, Server-Sent Events and `node:sqlite`. No runtime npm dependencies.
- **UI (operator decision, 2026-11-05):** React + TypeScript + Tailwind CSS + shadcn/ui (Radix primitives), built with Vite into a static bundle that the collector serves. Dev-only dependencies, nothing extra at runtime.
- **Engine:** the existing `interactsh-client` v1.4.1 CLI, run as a `systemd --user` service writing JSON lines. The dashboard never speaks the interactsh protocol itself.
- **Binding:** directly on the tailnet IP 100.64.0.10:8090 (no `tailscale serve`, no tailnet HTTPS).

## Users

The operator, a security researcher doing bug-bounty work, fires blind/SSRF/OOB payloads at in-scope targets and needs to know whether, when, from where, and how a target called back. The dashboard is used in every setting: always open on a second monitor beside Caido, opened later to check what happened, from a phone over the tailnet, and by other people or agents on the tailnet.

## Product Purpose

Replaces the flaky OmniOAST and the protocol-incompatible interactsh-web with a dashboard that is easy to trust. Success means that at a glance the operator knows (1) the engine is alive and capturing, (2) the live stream is connected, (3) which payload to use, and (4) what activity arrived, with complete, copy-exact detail for any interaction.

## Positioning

Built on the matched v1.4.1 CLI client that is known to capture DNS/HTTP/HTTPS from our own server, so "nothing shown" means nothing arrived, not a silent client failure. It is designed around how the operator works: tag-labelled probes, rolled-up DNS bursts, and evidence-grade raw data.

## Operating Context

- Server: interactsh-server v1.4.1 at oob.example (203.0.113.10, 53/80/443), `-auth` token, wildcard LE cert `*.oob.example`.
- One engine client = one correlation id = one base payload. Probes are told apart by a tag: a subdomain prefix label (`fetch.<id>…`, DNS/HTTP only) or the first path segment (`https://<id>.oob.example/xff/…`). HTTPS payloads must be single-label because the cert is single-label wildcard.
- Real traffic: DNS hits usually outnumber HTTP heavily (sample: 25 DNS to 2 HTTP from one SSRF), often from third-party resolvers rather than the target itself.
- Evidence feeds reports. The quality bar is captured requests and responses, so raw data must copy out exactly.
- Multiple base payloads / multiple engine clients are out of MVP scope (later extension). A Caido plugin front-end on the same engine+collector is a possible later extension.

## Capabilities and Constraints

- Live interactions table (SSE, newest first, no reload): time, type, probe tag, source, full-id. Row opens full raw request/response.
- Current payload shown prominently with copy, plus a payload builder: tag in, ready-to-copy DNS/HTTP/HTTPS variants out.
- Filter by type and by probe tag.
- Persistence in SQLite (survives restarts), with clear-all behind a confirm. JSONL from the engine stays the raw source of truth.
- Attention: unread count in tab title + favicon; optional Discord webhook (`DISCORD_WEBHOOK_URL`) posting the first hit per probe tag, with follow-ups rolled into a count (~60s window).
- Access: the tailnet is the auth boundary; no login; every viewer has full access.
- Secrets (`NUCLEI_INTERACTSH_TOKEN`, `DISCORD_WEBHOOK_URL`) are read from env at runtime, never printed, never in source, never sent to the browser.
- Undecided: whether HTTPS is distinguishable from HTTP in v1.4.1 client output (to verify empirically); which enrichments (rDNS, ASN/owner of source) ship by default vs opt-in.

## Brand Commitments

- Name: **Colluder**. The tool is the operator's accomplice, a secret insider on the wire.
- Mascot: a raccoon (a sneaky grabber). Mark: the raccoon's bandit mask only, one eye open and one winking. It works as a 16px favicon with the unread count and as the Discord avatar.
- Motto: "Your insider on the wire."
- Voice: quiet professional. Copy is precise, neutral and explicit about state and recovery. No jokes in data, evidence, or error copy.
- Personality is subtle and lives in specific touches: the mask's slow blink while connecting; the winking eye opening on a new hit (favicon too); a nocturnal doze (eyes shut) after hours of no traffic, woken by the first hit; the activity strip drawn as a ringed raccoon tail; hidden easter eggs (never in evidence copy).
- Must not look like a "hacker" costume.

## Evidence on Hand

Real interaction JSON from the engine (fields: protocol, unique-id, full-id, q-type, raw-request, raw-response, remote-address, timestamp). No invented sample data may be presented as real captures.

## Product Principles

1. Liveness is never ambiguous: engine, stream, and last-hit state are always visible and say plainly what is wrong.
2. Every detail is reachable, and only the essentials are shown by default. Extra detail is opt-in, never hidden or lost.
3. Raw data is evidence: shown exactly as received and copyable exactly.
4. Signal over noise: bursts are grouped and probes are labelled, so one payload firing reads as one event.
5. It works in every viewing context: a glance from across the desk, a phone, or a deep read.

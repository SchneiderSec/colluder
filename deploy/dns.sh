#!/usr/bin/env bash
# The DNS step of `./colluder setup`: move interactsh-server's DNS from :53 to :8053 and put
# colluder-edge on :53 in front of it. The edge relays every query and answer unchanged and records the ones for
# Colluder's names, so Colluder's short payloads (avatar-<short>.domain) show up as DNS hits.
#   Run by setup; by hand, as root:  sudo deploy/dns.sh [--force]
#   Undo:                            sudo deploy/dns.sh --undo
# DNS for the domain is down for a few seconds during the switch. No token is read or printed.
set -euo pipefail
umask 077

. "$(dirname "$0")/lib.sh"   # the operator, paths, public IP and domain, from config.yaml
PORTS=/etc/interactsh/ports.env
EENV=$H/.config/colluder/edge.env
UP_PORT=8053
MODE=${1:-}; [[ "$MODE" == "--undo" ]] && MODE=--rollback

say()  { local t="$*"; printf '   \033[2m-- %s\033[0m\n' "${t#[0-9]/[0-9] }"; }
ok()   { printf '   ok    %s\n' "$*"; }
bad()  { printf '   FAIL  %s\n' "$*"; FAILED=1; }
die()  { printf '\n   STOP  %s\n' "$*" >&2; exit 1; }
as_user() { sudo -u "$U" XDG_RUNTIME_DIR=/run/user/$UID_U DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID_U/bus "$@"; }
FAILED=0

[[ $EUID -eq 0 ]] || die "run with sudo"
[[ -f $PORTS && -f $EENV ]] || die "the edge isn't set up yet: run ./colluder setup"

# edge.env stays the user's file (owner and mode kept); lines are replaced, never duplicated
set_env() { # set_env KEY [VALUE]: no VALUE removes the line
  local tmp; tmp=$(mktemp)
  grep -v "^$1=" "$EENV" > "$tmp" || true
  [[ $# -ge 2 ]] && printf '%s=%s\n' "$1" "$2" >> "$tmp"
  install -o $U -g $U -m 600 "$tmp" "$EENV"; rm -f "$tmp"
}
# wait_udp PORT REGEX: something listens on udp PORT at an address matching REGEX (127.0.0.53 is
# systemd-resolved's stub, never interactsh)
wait_udp() { for _ in $(seq 1 40); do ss -lunH "sport = :$1" | awk '{print $4}' | grep -qE "$2" && return 0; sleep 0.5; done; return 1; }

rollback() {
  say "undo: interactsh back on :53, the edge off it"
  set_env COLLUDER_EDGE_DNS
  set_env COLLUDER_UPSTREAM_DNS
  systemctl restart colluder-edge.service
  sed -i -E "s/ ?-dns-port [0-9]+//" "$PORTS"
  systemctl restart interactsh.service
  if wait_udp 53 "^($PUB|0\.0\.0\.0|\*|\[::\]):53$"; then ok "interactsh answers DNS on :53 again"; else printf '   FAIL  interactsh is not on :53: journalctl -u interactsh\n'; fi
  dig +short +time=3 +tries=1 @"$PUB" A "rollback-check.$DOMAIN" | grep -q . && ok "the domain resolves" || printf '   FAIL  no answer from %s:53\n' "$PUB"
  as_user systemctl --user restart colluder.service
  ok "dashboard restarted: payloads go back to the long id"
}

if [[ "$MODE" == "--rollback" ]]; then rollback; exit 0; fi

say "1/4 preflight"
if pgrep -x nuclei >/dev/null && [[ "$MODE" != "--force" ]]; then die "a nuclei scan is running; DNS drops for a few seconds during the switch. Re-run with --force to go ahead anyway."; fi
command -v dig >/dev/null || die "dig not found (apt install dnsutils)"
as_user "$NODE" --test "$APP/test/dns.test.mjs" "$APP/test/edge.test.mjs" >/dev/null 2>&1 || die "edge tests fail: run npm test in $APP"
ok "edge and DNS tests pass"
if ss -lunH "sport = :$UP_PORT" | grep -q . && ! grep -q -- "-dns-port $UP_PORT" "$PORTS"; then die "port $UP_PORT is already in use"; fi
SHORT=$("$NODE" -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((j.shortIds||[])[0]||"")}catch{}' "$DATA/rules.json")
[[ "$SHORT" =~ ^[a-z][a-z0-9]{5}$ ]] || die "no short id in rules.json yet: restart the dashboard (systemctl --user restart colluder) and run this again"
ok "short id $SHORT"
trap 'echo; printf "   STOP  something failed: undoing this step\n"; rollback' ERR

say "2/4 interactsh DNS to :$UP_PORT"
grep -q -- "-dns-port $UP_PORT" "$PORTS" || sed -i -E "s/^(INTERACTSH_PORT_FLAGS=.*)$/\1 -dns-port $UP_PORT/" "$PORTS"
grep -q -- "-dns-port $UP_PORT" "$PORTS"
systemctl restart interactsh.service
wait_udp $UP_PORT ":$UP_PORT$" || { echo "   interactsh did not come up on :$UP_PORT (journalctl -u interactsh)"; false; }
UP=$(ss -lunH "sport = :$UP_PORT" | awk '{print $4}' | head -1)
UP=${UP/#\*:/127.0.0.1:}; UP=${UP/#0.0.0.0:/127.0.0.1:}; UP=${UP/#\[::\]:/127.0.0.1:}
ok "interactsh DNS on $UP (udp and tcp)"

say "3/4 the edge on $PUB:53"
set_env COLLUDER_EDGE_DNS "$PUB:53"
set_env COLLUDER_UPSTREAM_DNS "$UP"
systemctl restart colluder-edge.service
wait_udp 53 "^$PUB:53$" || { echo "   the edge did not bind $PUB:53 (journalctl -u colluder-edge)"; false; }
ok "edge listening on $PUB:53"
as_user systemctl --user restart colluder.service
ok "dashboard restarted"

say "4/4 verify"
trap - ERR
CHECK="setup-check-dns-$SHORT.$DOMAIN"
before=$(wc -l < "$DATA/edge.jsonl")
a=$(dig +short +time=3 +tries=2 @"$PUB" A "$CHECK" || true)
[[ -n "$a" ]] && ok "your short host resolves through the edge ($a)" || bad "no A answer for $CHECK"
t=$(dig +short +tcp +time=3 +tries=2 @"$PUB" A "$CHECK" || true)
[[ -n "$t" ]] && ok "and over TCP" || bad "no TCP answer"
ns=$(dig +short +time=3 +tries=2 @"$PUB" NS "$DOMAIN" || true)
[[ -n "$ns" ]] && ok "the domain's NS records pass through ($(echo $ns | tr '\n' ' '))" || bad "no NS answer for $DOMAIN"
other=$(dig +short +time=3 +tries=2 @"$PUB" A "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.$DOMAIN" || true)
[[ -n "$other" ]] && ok "other clients' names still resolve (interactsh answers them)" || bad "foreign name got no answer"
sleep 1
grep -q "setup-check-dns-$SHORT" <(tail -n +$((before + 1)) "$DATA/edge.jsonl") && ok "the edge recorded the check as a DNS hit" || bad "the check lookup was not recorded in edge.jsonl"

if (( FAILED )); then
  echo; echo "Some checks failed. Undo with: sudo $APP/deploy/dns.sh --undo"; exit 1
fi
[[ -n "${COLLUDER_IN_SETUP:-}" ]] && exit 0   # setup prints the summary
echo; echo "Done. Payloads now use $SHORT.$DOMAIN (e.g. https://avatar-$SHORT.$DOMAIN/)."
echo "The check left a 'setup-check-dns' tag under Probes; delete it there if you like."

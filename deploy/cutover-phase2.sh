#!/usr/bin/env bash
# Phase 2 cutover: put colluder-edge in front of interactsh on :80/:443 and rotate the
# interactsh auth token. Run as root:   sudo deploy/cutover-phase2.sh [--force]
# Rollback:                            sudo deploy/rollback-phase2.sh
# The token is never printed and never placed on a command line.
set -euo pipefail
umask 077

. "$(dirname "$0")/lib.sh"   # the operator, paths, public IP and domain, from config.yaml
BIN=$SERVER_BIN
ORIGIN_HDR=X-Colluder-Origin-IP
FORCE=0; [[ "${1:-}" == "--force" ]] && FORCE=1

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '   ok    %s\n' "$*"; }
bad()  { printf '   FAIL  %s\n' "$*"; FAILED=1; }
die()  { printf '\n   STOP  %s\n' "$*" >&2; exit 1; }
as_user() { sudo -u "$U" XDG_RUNTIME_DIR=/run/user/$UID_U DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID_U/bus "$@"; }
FAILED=0

[[ $EUID -eq 0 ]] || die "run with sudo"
[[ -x "$BIN" && -x "$NODE" ]] || die "interactsh-server or node not found"

say "1/6 preflight"
if pgrep -x nuclei >/dev/null && (( ! FORCE )); then die "a nuclei scan is running; it would lose callbacks during the switch and its token would stop working. Re-run with --force to go ahead anyway."; fi
[[ -f $APP/web/dist/index.html ]] || die "UI not built: run npm run build in $APP as $U"
as_user "$NODE" --test "$APP/test/edge.test.mjs" >/dev/null 2>&1 || die "edge tests fail: run npm test in $APP"
ok "edge tests pass"
install -D -m 755 "$APP/deploy/cert-sync.sh" /usr/local/libexec/colluder-cert-sync
write_cert_defaults
/usr/local/libexec/colluder-cert-sync | sed 's/^/   /'
for p in 8081 8444; do
  if ss -ltnH "sport = :$p" | grep -q . && ! systemctl is-active -q interactsh; then die "port $p is already in use"; fi
done
ok "internal ports 8081/8444 free"

say "2/6 stop the engine (it saves its session, keeping the correlation id)"
as_user systemctl --user stop colluder-engine.service
ok "colluder-engine stopped"

say "3/6 rotate the interactsh token"
NEW=$(openssl rand -hex 32)
install -d -m 700 /etc/interactsh
printf 'token: "%s"\n' "$NEW" > /etc/interactsh/server.yaml
chmod 600 /etc/interactsh/server.yaml
# user files: rewritten by the user (owner and mode kept), token passed on stdin
printf '%s' "$NEW" | as_user env TOKEN_FILE="$(cfg nuclei.token_file)" TOKEN_VAR="$(cfg nuclei.token_var)" DATA="$DATA" python3 -I -c '
import os, re, sys
tok = sys.stdin.read().strip()
assert re.fullmatch(r"[0-9a-f]{64}", tok)
home = os.path.expanduser("~")
edits = [
    (f"{home}/.config/colluder/engine.yaml", r"^token:.*$", f"token: \x27{tok}\x27"),
    (os.environ["DATA"] + "/session.yaml", r"^server-token:.*$", f"server-token: \"{tok}\""),
]
# config.yaml nuclei.token_file / token_var: another client on this box that uses the same token
if os.environ.get("TOKEN_FILE") and os.environ.get("TOKEN_VAR"):
    v = os.environ["TOKEN_VAR"]
    assert re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", v)
    edits.insert(0, (os.environ["TOKEN_FILE"], rf"^(export )?{v}=.*$", f"{v}={tok}"))
for path, pat, line in edits:
    s = open(path).read()
    n, k = re.subn(pat, lambda m: line, s, count=1, flags=re.M)
    if k != 1: sys.exit(f"token line not found in {path}")
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f: f.write(n)
    os.replace(tmp, path)
    print("   ok    token updated in", path)
'
unset NEW

say "4/6 move interactsh to internal HTTP ports, under systemd"
printf 'INTERACTSH_PORT_FLAGS=-http-port 8081 -https-port 8444 -oih %s\n' "$ORIGIN_HDR" > /etc/interactsh/ports.env
render_unit "$APP/deploy/interactsh.service" /etc/systemd/system/interactsh.service
render_unit "$APP/deploy/colluder-edge.service" /etc/systemd/system/colluder-edge.service
install -m 644 "$APP/deploy/colluder-cert-sync.service" /etc/systemd/system/colluder-cert-sync.service
install -m 644 "$APP/deploy/colluder-cert-sync.timer" /etc/systemd/system/colluder-cert-sync.timer
systemctl daemon-reload
# the hand-started server (sudo in a terminal) holds :53/:80/:443; stop it the way it likes (SIGINT)
if ! systemctl is-active -q interactsh; then
  for pid in $(pgrep -f "^$BIN( |$)" || true); do kill -INT "$pid" 2>/dev/null || true; done
  for _ in $(seq 1 20); do pgrep -f "^$BIN( |$)" >/dev/null || break; sleep 0.5; done
  pgrep -f "^$BIN( |$)" >/dev/null && { pkill -TERM -f "^$BIN( |$)" || true; sleep 1; }
fi
systemctl enable --now interactsh.service
systemctl restart interactsh.service
for _ in $(seq 1 40); do ss -ltnH "sport = :8081" | grep -q . && ss -lunH "sport = :53" | grep -q "$PUB" && break; sleep 0.5; done
UP_HTTP=$(ss -ltnH "sport = :8081" | awk '{print $4}' | head -1); UP_HTTPS=$(ss -ltnH "sport = :8444" | awk '{print $4}' | head -1)
[[ -n "$UP_HTTP" && -n "$UP_HTTPS" ]] || die "interactsh did not come up on 8081/8444 (journalctl -u interactsh); run rollback-phase2.sh"
UP_HTTP=${UP_HTTP/#\*:/127.0.0.1:}; UP_HTTP=${UP_HTTP/#0.0.0.0:/127.0.0.1:}; UP_HTTP=${UP_HTTP/#\[::\]:/127.0.0.1:}
UP_HTTPS=${UP_HTTPS/#\*:/127.0.0.1:}; UP_HTTPS=${UP_HTTPS/#0.0.0.0:/127.0.0.1:}; UP_HTTPS=${UP_HTTPS/#\[::\]:/127.0.0.1:}
ok "interactsh on $UP_HTTP (http) and $UP_HTTPS (https); DNS, SMTP, LDAP unchanged"
install -o $U -g $U -m 600 /dev/null $H/.config/colluder/edge.env
printf 'COLLUDER_EDGE_HTTP=%s:80\nCOLLUDER_EDGE_HTTPS=%s:443\nCOLLUDER_UPSTREAM_HTTP=%s\nCOLLUDER_UPSTREAM_HTTPS=%s\n' "$PUB" "$PUB" "$UP_HTTP" "$UP_HTTPS" > $H/.config/colluder/edge.env

say "5/6 start the edge, the certificate timer, and the engine"
systemctl enable --now colluder-cert-sync.timer
systemctl enable --now colluder-edge.service
systemctl restart colluder-edge.service
for _ in $(seq 1 20); do ss -ltnH "sport = :443" | grep -q "$PUB" && break; sleep 0.5; done
as_user systemctl --user restart colluder.service
as_user systemctl --user start colluder-engine.service
ok "edge, timer, dashboard and engine started"

say "6/6 verify"
ID=$(cut -d. -f1 "$DATA/payload.txt")
sleep 3
# unauthenticated registration must be refused (the token config was read)
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST -H 'content-type: application/json' -d '{}' "http://${UP_HTTP}/register" || true)
[[ "$code" == "401" ]] && ok "interactsh refuses unauthenticated clients (401)" || bad "interactsh /register answered $code, expected 401: the token may not be loaded"
body=$(curl -s --max-time 5 --resolve "cutover-http.$ID.$DOMAIN:80:$PUB" "http://cutover-http.$ID.$DOMAIN/" -A colluder-cutover || true)
[[ "$body" == *"$(rev <<<"$ID")"* ]] && ok "edge answers your probes over HTTP" || bad "own HTTP probe did not get the edge's reply"
body=$(curl -s --max-time 5 --resolve "$ID.$DOMAIN:443:$PUB" "https://$ID.$DOMAIN/cutover-https/" -A colluder-cutover || true)
[[ "$body" == *"$(rev <<<"$ID")"* ]] && ok "edge answers your probes over HTTPS with a valid certificate" || bad "own HTTPS probe failed (certificate or edge)"
hdr=$(curl -s -o /dev/null -D - --max-time 5 --resolve "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.$DOMAIN:80:$PUB" "http://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.$DOMAIN/" || true)
grep -qi '^server:' <<<"$hdr" && ok "other clients' traffic reaches interactsh through the edge" || bad "foreign HTTP request got no answer from interactsh"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 --resolve "$DOMAIN:443:$PUB" "https://$DOMAIN/" || true)
[[ "$code" != "000" ]] && ok "interactsh's API on https://$DOMAIN passes through with its own certificate ($code)" || bad "https://$DOMAIN unreachable: clients can't poll"
before=$(wc -l < "$DATA/interactions.jsonl")
dig +short +time=3 +tries=1 "@$PUB" "cutover-dns.$ID.$DOMAIN" A >/dev/null || true
for _ in $(seq 1 20); do (( $(wc -l < "$DATA/interactions.jsonl") > before )) && break; sleep 1; done
(( $(wc -l < "$DATA/interactions.jsonl") > before )) && ok "engine polls with the new token (DNS hit arrived)" || bad "no DNS hit reached the engine in 20 s: check journalctl --user -u colluder-engine"
grep -q 'cutover-http' "$DATA/edge.jsonl" 2>/dev/null && ok "edge recorded its hits for the dashboard" || bad "edge.jsonl has no record of the check"

echo
if (( FAILED )); then
  echo "Some checks failed. The rollback puts interactsh back on :80/:443 (keeping the new token):"
  echo "  sudo $APP/deploy/rollback-phase2.sh"
  exit 1
fi
cat <<EOF
Cutover done. Colluder answers your probes on :80/:443; everything else reaches interactsh unchanged.
  - New interactsh token: in engine.yaml$( [[ -n "$(cfg nuclei.token_file)" ]] && echo " and $(cfg nuclei.token_file) ($(cfg nuclei.token_var))"). Any other
    interactsh client started before now keeps the old token and stops receiving.
  - Rollback: sudo $APP/deploy/rollback-phase2.sh
EOF

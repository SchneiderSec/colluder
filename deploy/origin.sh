#!/usr/bin/env bash
# Gives interactsh a secret origin header. interactsh (-oih) takes a request's source address from
# that header, from whoever sends it, and its internal ports (8081, 8444) are on the public IP. With
# the old fixed name (X-Colluder-Origin-IP), anyone could choose the source address of a hit; with a
# random one, only the edge knows it. Without the header, interactsh records the real peer address.
# ./colluder setup runs this once on a box set up before it existed; by hand, as root:
#   sudo deploy/origin.sh [--force]    --force: go ahead despite a running nuclei scan
# interactsh restarts (a few seconds without callbacks), then the edge. Nothing else changes.
set -euo pipefail
umask 077

. "$(dirname "$0")/lib.sh"
PORTS=/etc/interactsh/ports.env
EENV=$H/.config/colluder/edge.env
FORCE=0
for a in "$@"; do case "$a" in --force) FORCE=1 ;; *) echo "unknown option $a" >&2; exit 2 ;; esac; done

say()  { local t="$*"; printf '   \033[2m-- %s\033[0m\n' "${t#[0-9]/[0-9] }"; }
ok()   { printf '   ok    %s\n' "$*"; }
die()  { printf '\n   STOP  %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run with sudo"
[[ -f $PORTS && -f $EENV ]] || die "the edge isn't set up yet: run ./colluder setup"
grep -q -- "-oih " "$PORTS" || die "$PORTS has no -oih: interactsh isn't behind the edge (run ./colluder setup)"

# edge.env stays the user's file (owner and mode kept); lines are replaced, never duplicated
set_env() {
  local tmp; tmp=$(mktemp)
  grep -v "^$1=" "$EENV" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  install -o "$U" -g "$U" -m 600 "$tmp" "$EENV"; rm -f "$tmp"
}

NAME=$(origin_header)
HAVE=$(sed -nE 's/^COLLUDER_ORIGIN_HEADER=(.*)$/\1/p' "$EENV" | head -1)
if [[ "$HAVE" == "$NAME" ]] && grep -q -- "-oih $NAME\b" "$PORTS"; then ok "interactsh and the edge already share a secret origin header"; exit 0; fi
if pgrep -x nuclei >/dev/null && (( ! FORCE )); then die "a nuclei scan is running; it would miss callbacks while interactsh restarts. Re-run with --force to go ahead anyway."; fi

say "1/3 interactsh: believe only the new header"
cp -p "$PORTS" "$PORTS.bak"
sed -i -E "s/-oih [A-Za-z0-9-]+/-oih $NAME/" "$PORTS"
grep -q -- "-oih $NAME" "$PORTS" || { mv -f "$PORTS.bak" "$PORTS"; die "couldn't change $PORTS (restored)"; }
systemctl restart interactsh.service
for _ in $(seq 1 60); do ss -ltnH "sport = :8081" | grep -q . && break; sleep 0.5; done
ss -ltnH "sport = :8081" | grep -q . || { mv -f "$PORTS.bak" "$PORTS"; systemctl restart interactsh.service; die "interactsh didn't come back on 8081 (journalctl -u interactsh); the old header is restored"; }
rm -f "$PORTS.bak"
ok "interactsh restarted"

say "2/3 the edge: send it"
set_env COLLUDER_ORIGIN_HEADER "$NAME"
systemctl restart colluder-edge.service
for _ in $(seq 1 20); do ss -ltnH "sport = :80" | grep -q "$PUB" && break; sleep 0.5; done
ok "edge restarted"

say "3/3 verify"
st="$DATA/edge.status.json"
for _ in $(seq 1 20); do grep -q '"originSecret":true' "$st" 2>/dev/null && break; sleep 0.5; done
grep -q '"originSecret":true' "$st" 2>/dev/null || die "the edge isn't sending the new header (journalctl -u colluder-edge)"
hdr=$(curl -s -o /dev/null -D - --max-time 5 --resolve "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.$DOMAIN:80:$PUB" "http://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.$DOMAIN/" || true)
grep -qi '^server:' <<<"$hdr" && ok "other clients' traffic still reaches interactsh through the edge" || die "a relayed request got no answer from interactsh"
ok "interactsh believes only the edge about where a request came from"

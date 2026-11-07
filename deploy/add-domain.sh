#!/usr/bin/env bash
# Serve a second domain alongside the current one (the new payload domain, while the old one runs out).
# Payloads keep using the current domain; this makes the new one answer, get its own wildcard
# certificate, and pass the outside check, so the switch later is one setting.
#   Run as root, after pointing the domain's nameservers at ns1/ns2.<domain> (glue: this box's IP):
#     sudo tools/oob-dashboard/deploy/add-domain.sh alt.example [--force]
#   Undo:  sudo tools/oob-dashboard/deploy/add-domain.sh --rollback
# interactsh restarts once (DNS for the domains is down for a few seconds). No token is read or printed.
set -euo pipefail
umask 077

U=user; H=/home/$U; UID_U=$(id -u $U)
APP=$H/work/tools/oob-dashboard
DATA=$H/.local/share/colluder
NODE=$H/.nvm/versions/node/v26.1.0/bin/node
PUB=203.0.113.10
OLD=oob.example
UNIT=/etc/systemd/system/interactsh.service
DOMS=/etc/interactsh/domains.env
CENV=$H/.config/colluder/colluder.env
STORE=/root/.local/share/certmagic/certificates
BK=/root/colluder-add-domain-backup

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '   ok    %s\n' "$*"; }
bad()  { printf '   FAIL  %s\n' "$*"; FAILED=1; }
die()  { printf '\n   STOP  %s\n' "$*" >&2; exit 1; }
as_user() { sudo -u "$U" XDG_RUNTIME_DIR=/run/user/$UID_U DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID_U/bus "$@"; }
FAILED=0

[[ $EUID -eq 0 ]] || die "run with sudo"

# colluder.env stays the user's file (owner and mode kept); lines are replaced, never duplicated
set_env() { # set_env FILE KEY [VALUE]: no VALUE removes the line
  local f=$1 tmp; tmp=$(mktemp)
  [[ -f "$f" ]] && { grep -v "^$2=" "$f" > "$tmp" || true; }
  [[ $# -ge 3 ]] && printf '%s=%s\n' "$2" "$3" >> "$tmp"
  install -o $U -g $U -m 600 "$tmp" "$f"; rm -f "$tmp"
}
wait_udp() { for _ in $(seq 1 40); do ss -lunH "sport = :$1" | grep -q . && return 0; sleep 0.5; done; return 1; }

rollback() {
  say "rollback: interactsh back to its old unit and domains, the dashboard back to one domain"
  [[ -d $BK ]] || { echo "   no backup in $BK: nothing to undo"; return 0; }
  [[ -f $BK/interactsh.service ]] && install -m 644 $BK/interactsh.service $UNIT
  if [[ -f $BK/domains.env ]]; then install -m 600 $BK/domains.env $DOMS; else rm -f $DOMS; fi
  if [[ -f $BK/colluder.env ]]; then install -o $U -g $U -m 600 $BK/colluder.env "$CENV"; else set_env "$CENV" COLLUDER_EXTRA_DOMAINS; fi
  systemctl daemon-reload
  systemctl restart interactsh.service
  if wait_udp 8053; then ok "interactsh is back"; else printf '   FAIL  interactsh did not come back: journalctl -u interactsh\n'; fi
  systemctl restart colluder-edge.service
  as_user systemctl --user restart colluder.service
  ok "edge and dashboard restarted on one domain (the new cert-sync stays: it handles one domain too)"
}

if [[ "${1:-}" == "--rollback" ]]; then rollback; exit 0; fi
NEW=${1:-}; MODE=${2:-}
[[ "$NEW" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$ ]] || die "usage: sudo $0 <new-domain> [--force]   (or --rollback)"
[[ "$NEW" != "$OLD" ]] || die "$NEW is already the payload domain"

say "1/5 preflight"
if pgrep -x nuclei >/dev/null && [[ "$MODE" != "--force" ]]; then die "a nuclei scan is running; interactsh restarts (DNS drops for a few seconds). Re-run with --force to go ahead anyway."; fi
command -v dig >/dev/null || die "dig not found (apt install dnsutils)"
# the registry must already send $NEW's lookups here, or the certificate request fails (interactsh asks once, at start)
TLDNS=$(dig +short NS "${NEW#*.}." | head -1)
[[ -n "$TLDNS" ]] || die "can't find the nameservers for .${NEW#*.}"
REF=$(dig +norec +noall +authority +additional @"$TLDNS" NS "$NEW" || true)
NSN=$(awk '$4=="NS"{print tolower($5)}' <<<"$REF" | sort -u)
[[ -n "$NSN" ]] || die "the .${NEW#*.} registry has no nameservers for $NEW yet"
while read -r n; do
  [[ "$n" == *".$NEW." ]] || die "$NEW's nameservers are still $(echo $NSN | tr '\n' ' '): at the registrar, set them to ns1.$NEW and ns2.$NEW, wait a few minutes, run this again"
  ip=$(awk -v n="$n" 'tolower($1)==n && $4=="A"{print $5}' <<<"$REF" | head -1)
  [[ "$ip" == "$PUB" ]] || die "glue for $n is '${ip:-none}', not $PUB: fix the glue record at the registrar"
done <<<"$NSN"
ok "the registry delegates $NEW to this box ($(echo $NSN | tr '\n' ' '))"
as_user "$NODE" --test "$APP/test/dns.test.mjs" "$APP/test/edge.test.mjs" "$APP/test/domains.test.mjs" "$APP/test/selfcheck.test.mjs" >/dev/null 2>&1 || die "edge tests fail: run npm test in $APP"
ok "edge, DNS and domain tests pass"
# a domain in server.yaml would fight the -d flag: stop rather than guess which wins (key names only)
if grep -qiE '^\s*(d|domain)\s*:' /etc/interactsh/server.yaml 2>/dev/null; then die "/etc/interactsh/server.yaml sets a domain itself; move it to $DOMS (INTERACTSH_DOMAINS=...) by hand first"; fi
SHORT=$("$NODE" -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((j.shortIds||[])[0]||"")}catch{}' "$DATA/rules.json")
[[ "$SHORT" =~ ^[a-z][a-z0-9]{5}$ ]] || die "no short id in rules.json: run deploy/dns-front.sh first"
CUR=$( [[ -f $DOMS ]] && sed -n 's/^INTERACTSH_DOMAINS=//p' $DOMS || echo "$OLD")
[[ -n "$CUR" ]] || CUR=$OLD
case ",$CUR," in *",$NEW,"*) LIST=$CUR;; *) LIST="$CUR,$NEW";; esac
ok "interactsh will serve: $LIST"
rm -rf $BK; install -d -m 700 $BK
cp -p $UNIT $BK/interactsh.service
[[ -f $DOMS ]] && cp -p $DOMS $BK/domains.env
[[ -f "$CENV" ]] && cp -p "$CENV" $BK/colluder.env
ok "backups in $BK"
trap 'echo; printf "   STOP  something failed: rolling back\n"; rollback' ERR

say "2/5 interactsh serves $NEW"
install -m 644 "$APP/deploy/interactsh.service" $UNIT
printf 'INTERACTSH_DOMAINS=%s\n' "$LIST" > $DOMS; chmod 600 $DOMS
systemctl daemon-reload
systemctl restart interactsh.service
wait_udp 8053 || { echo "   interactsh did not come back (journalctl -u interactsh)"; false; }
ok "interactsh restarted"
for _ in $(seq 1 90); do ls "$STORE"/*/"wildcard_.$NEW"/*.crt >/dev/null 2>&1 && break; sleep 2; done
ls "$STORE"/*/"wildcard_.$NEW"/*.crt >/dev/null 2>&1 || { echo "   no certificate for *.$NEW after 3 minutes (journalctl -u interactsh | grep -i certificate)"; false; }
ok "Let's Encrypt issued *.$NEW"

say "3/5 certificates for the edge"
install -D -m 755 "$APP/deploy/cert-sync.sh" /usr/local/libexec/colluder-cert-sync
install -m 644 "$APP/deploy/colluder-cert-sync.service" /etc/systemd/system/colluder-cert-sync.service
[[ -f /etc/default/colluder-cert-sync ]] || printf 'ROOT_DOMAIN=%s\n' "$OLD" > /etc/default/colluder-cert-sync
systemctl daemon-reload
ROOT_DOMAIN=$(sed -n 's/^ROOT_DOMAIN=//p' /etc/default/colluder-cert-sync) /usr/local/libexec/colluder-cert-sync | sed 's/^/   /'
[[ -f $H/caido-cert/domains/$NEW/fullchain.pem ]] || { echo "   cert-sync did not place $NEW's certificate"; false; }
ok "both certificates in $H/caido-cert/domains/"

say "4/5 the edge and the dashboard serve both"
set_env "$CENV" COLLUDER_EXTRA_DOMAINS "$NEW"
as_user systemctl --user restart colluder.service
sleep 2
systemctl restart colluder-edge.service
for _ in $(seq 1 20); do ss -ltnH "sport = :443" | grep -q "$PUB" && break; sleep 0.5; done
ok "restarted (payloads still use $OLD)"

say "5/5 verify"
trap - ERR
sleep 2
a=$(dig +short +time=3 +tries=2 @"$PUB" A "colluder-check-$SHORT.$NEW" || true)
[[ "$a" == *"$PUB"* ]] && ok "this box answers for $NEW ($a)" || bad "no A answer for colluder-check-$SHORT.$NEW from $PUB"
p=$(dig +short +time=3 +tries=2 @1.1.1.1 A "c$RANDOM.colluder-check-$SHORT.$NEW" || true)
[[ "$p" == *"$PUB"* ]] && ok "and through Cloudflare's resolver (the internet path)" || bad "Cloudflare's resolver did not get $PUB for $NEW"
for d in "$NEW" "$OLD"; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 --resolve "colluder-check-$SHORT.$d:443:$PUB" "https://colluder-check-$SHORT.$d/add-domain" 2>&1 || true)
  [[ "$code" =~ ^[0-9]{3}$ && "$code" != "000" ]] && ok "https://…$d answers $code with a valid certificate" || bad "HTTPS on $d: $code"
done
r=$(as_user curl -s -X POST -H "host: 100.64.0.10:8090" -H "origin: http://100.64.0.10:8090" -H "content-type: application/json" --data '{}' --max-time 120 http://100.64.0.10:8090/api/check || true)
st=$("$NODE" -e 'try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.state+(j.steps||[]).filter(s=>!s.ok).map(s=>"\n      "+s.label+": "+s.detail).join(""))}catch{process.stdout.write("unreadable")}' "$r")
[[ "$st" == ok* || "$st" == warn* ]] && ok "the outside check passes on both domains ($st)" || bad "outside check: $st"

if (( FAILED )); then
  echo; echo "Some checks failed. Undo with: sudo $APP/deploy/add-domain.sh --rollback"; exit 1
fi
echo; echo "Done. $NEW is served and proven; payloads still use $OLD until you switch them."

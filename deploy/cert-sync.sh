#!/usr/bin/env bash
# Copies interactsh's Let's Encrypt wildcard certificates (root-only certmagic store) to where the
# edge and the oob-https-responder skill read them. Copies only what changed; the edge reloads on
# change. Run by colluder-cert-sync.timer (root).
#   every domain interactsh holds a wildcard for -> ~/caido-cert/domains/<domain>/{fullchain,privkey}.pem
#   ROOT_DOMAIN's also -> ~/caido-cert/{fullchain,privkey}.pem (the edge's default, the skill's only one)
# ROOT_DOMAIN comes from /etc/default/colluder-cert-sync when set there.
set -euo pipefail
ROOT_DOMAIN=${ROOT_DOMAIN:-oob.example}
DST=${CERT_DST:-/home/user/caido-cert}   # CERT_DST, CERT_STORE: for tests
STORE=${CERT_STORE:-/root/.local/share/certmagic/certificates}

# put CRT and KEY at DIR/fullchain.pem and DIR/privkey.pem; prints 1 when something changed
place() {
  local crt=$1 key=$2 dir=$3 changed=0
  install -d -o user -g user -m 755 "$dir"
  cmp -s "$crt" "$dir/fullchain.pem" || { install -o user -g user -m 640 "$crt" "$dir/fullchain.pem.new"; changed=1; }
  cmp -s "$key" "$dir/privkey.pem" || { install -o user -g user -m 640 "$key" "$dir/privkey.pem.new"; changed=1; }
  # key first, then cert: the edge reloads when the cert file changes
  if [[ -f "$dir/privkey.pem.new" ]]; then mv -f "$dir/privkey.pem.new" "$dir/privkey.pem"; fi
  if [[ -f "$dir/fullchain.pem.new" ]]; then mv -f "$dir/fullchain.pem.new" "$dir/fullchain.pem"; fi
  echo $changed
}

install -d -o user -g user -m 755 "$DST" "$DST/domains"
found=0; root_found=0
for SRC in "$STORE"/*/wildcard_.*; do
  [[ -d "$SRC" ]] || continue
  d=${SRC##*/wildcard_.}
  [[ "$d" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$ ]] || { echo "skipped an odd directory name: $SRC" >&2; continue; }
  CRT="$SRC/wildcard_.$d.crt"; KEY="$SRC/wildcard_.$d.key"
  [[ -f "$CRT" && -f "$KEY" ]] || { echo "$d: certificate or key missing in certmagic" >&2; continue; }
  # a cert/key pair that doesn't match would break TLS: refuse it
  [[ "$(openssl x509 -in "$CRT" -noout -pubkey)" == "$(openssl pkey -in "$KEY" -pubout)" ]] || { echo "$d: certmagic cert and key do not match, not copied" >&2; continue; }
  found=$((found + 1))
  c=$(place "$CRT" "$KEY" "$DST/domains/$d")
  if [[ "$d" == "$ROOT_DOMAIN" ]]; then root_found=1; r=$(place "$CRT" "$KEY" "$DST"); c=$((c | r)); fi
  if (( c )); then echo "$d: certificate updated, $(openssl x509 -in "$CRT" -noout -enddate)"; else echo "$d: certificate unchanged"; fi
done
(( found )) || { echo "no wildcard certificates in certmagic" >&2; exit 1; }
(( root_found )) || echo "warning: no certificate for $ROOT_DOMAIN; the edge's default stays as it was" >&2

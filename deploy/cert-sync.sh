#!/usr/bin/env bash
# Copies interactsh's Let's Encrypt wildcard certificate (root-only certmagic store) to where the
# edge and the oob-https-responder skill read it. Copies only when it changed; the edge reloads on
# change. Run by colluder-cert-sync.timer (root).
set -euo pipefail
DOMAIN=oob.example
DST=/home/user/caido-cert
SRC=$(ls -d /root/.local/share/certmagic/certificates/*/"wildcard_.$DOMAIN" 2>/dev/null | head -1)
[[ -n "$SRC" ]] || { echo "no wildcard certificate for $DOMAIN in certmagic" >&2; exit 1; }
CRT="$SRC/wildcard_.$DOMAIN.crt"; KEY="$SRC/wildcard_.$DOMAIN.key"
# a cert/key pair that doesn't match would break TLS: refuse it
[[ "$(openssl x509 -in "$CRT" -noout -pubkey)" == "$(openssl pkey -in "$KEY" -pubout)" ]] || { echo "certmagic cert and key do not match" >&2; exit 1; }
install -d -o user -g user -m 755 "$DST"
changed=0
cmp -s "$CRT" "$DST/fullchain.pem" || { install -o user -g user -m 640 "$CRT" "$DST/fullchain.pem.new"; changed=1; }
cmp -s "$KEY" "$DST/privkey.pem" || { install -o user -g user -m 640 "$KEY" "$DST/privkey.pem.new"; changed=1; }
# key first, then cert: the edge reloads when the cert file changes
[[ -f "$DST/privkey.pem.new" ]] && mv -f "$DST/privkey.pem.new" "$DST/privkey.pem"
[[ -f "$DST/fullchain.pem.new" ]] && mv -f "$DST/fullchain.pem.new" "$DST/fullchain.pem"
if (( changed )); then echo "certificate updated: $(openssl x509 -in "$DST/fullchain.pem" -noout -enddate)"; else echo "certificate unchanged"; fi

#!/usr/bin/env bash
# Copies interactsh's Let's Encrypt wildcard certificates (root-only certmagic store) to where the
# edge reads them (config.yaml's tls paths). Copies only what changed; the edge reloads on change.
# Run by colluder-cert-sync.timer (root).
#   every domain interactsh holds a wildcard for -> $CERT_DOMAINS/<domain>/{fullchain,privkey}.pem
#   ROOT_DOMAIN's also -> $CERT_DST/{fullchain,privkey}.pem (the edge's default certificate)
# ROOT_DOMAIN, CERT_USER, CERT_DST and CERT_DOMAINS come from /etc/default/colluder-cert-sync, which the
# deploy scripts write from config.yaml (deploy/lib.sh: write_cert_defaults).
set -euo pipefail
DEFAULTS=${CERT_DEFAULTS:-/etc/default/colluder-cert-sync}
if [[ -z "${ROOT_DOMAIN:-}" || -z "${CERT_DST:-}" ]] && [[ -r "$DEFAULTS" ]]; then set -a; . "$DEFAULTS"; set +a; fi
: "${ROOT_DOMAIN:?not set: run a deploy script (it writes $DEFAULTS from config.yaml)}"
: "${CERT_DST:?not set}" "${CERT_USER:?not set}"
DOMAINS_DST=${CERT_DOMAINS:-$CERT_DST/domains}
STORE=${CERT_STORE:-/root/.local/share/certmagic/certificates}   # CERT_STORE: for tests

# put CRT and KEY at DIR/fullchain.pem and DIR/privkey.pem; prints 1 when something changed
place() {
  local crt=$1 key=$2 dir=$3 changed=0
  install -d -o "$CERT_USER" -g "$CERT_USER" -m 755 "$dir"
  cmp -s "$crt" "$dir/fullchain.pem" || { install -o "$CERT_USER" -g "$CERT_USER" -m 640 "$crt" "$dir/fullchain.pem.new"; changed=1; }
  cmp -s "$key" "$dir/privkey.pem" || { install -o "$CERT_USER" -g "$CERT_USER" -m 640 "$key" "$dir/privkey.pem.new"; changed=1; }
  # key first, then cert: the edge reloads when the cert file changes
  if [[ -f "$dir/privkey.pem.new" ]]; then mv -f "$dir/privkey.pem.new" "$dir/privkey.pem"; fi
  if [[ -f "$dir/fullchain.pem.new" ]]; then mv -f "$dir/fullchain.pem.new" "$dir/fullchain.pem"; fi
  echo $changed
}

install -d -o "$CERT_USER" -g "$CERT_USER" -m 755 "$CERT_DST" "$DOMAINS_DST"
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
  c=$(place "$CRT" "$KEY" "$DOMAINS_DST/$d")
  if [[ "$d" == "$ROOT_DOMAIN" ]]; then root_found=1; r=$(place "$CRT" "$KEY" "$CERT_DST"); c=$((c | r)); fi
  if (( c )); then echo "$d: certificate updated, $(openssl x509 -in "$CRT" -noout -enddate)"; else echo "$d: certificate unchanged"; fi
done
(( found )) || { echo "no wildcard certificates in certmagic" >&2; exit 1; }
(( root_found )) || echo "warning: no certificate for $ROOT_DOMAIN; the edge's default stays as it was" >&2

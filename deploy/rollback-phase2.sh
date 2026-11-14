#!/usr/bin/env bash
# Undo the phase 2 cutover: stop colluder-edge and put interactsh back on :80/:443.
# Keeps the rotated token and the systemd-managed interactsh (no hand-started server needed).
# Run as root:   sudo deploy/rollback-phase2.sh
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
. "$(dirname "$0")/lib.sh"   # the operator, paths, public IP and domain, from config.yaml

systemctl disable --now colluder-edge.service 2>/dev/null || true
printf 'INTERACTSH_PORT_FLAGS=\n' > /etc/interactsh/ports.env
systemctl restart interactsh.service
# interactsh listens only after it has tried for its certificate (a first try can take minutes)
for _ in $(seq 1 180); do ss -ltnH "sport = :80" | grep -q "$PUB" && break; sleep 1; done
for _ in $(seq 1 10); do ss -ltnH "sport = :443" | grep -q "$PUB" && break; sleep 0.5; done
if ss -ltnH "sport = :443" | grep -q "$PUB" && ss -ltnH "sport = :80" | grep -q "$PUB"; then
  echo "Rolled back: interactsh answers :80/:443 again; colluder-edge is stopped and disabled."
  echo "HTTP rules in the dashboard are kept but not served until the next cutover."
elif ss -ltnH "sport = :80" | grep -q "$PUB" && ! compgen -G "/root/.local/share/certmagic/certificates/*/wildcard_.$DOMAIN" >/dev/null; then
  echo "Rolled back: interactsh answers :80 again; colluder-edge is stopped and disabled."
  echo "It has no certificate for *.$DOMAIN yet, so no HTTPS: once deploy/check.sh passes, run the cutover again."
else
  echo "interactsh did not come back on :80/:443: journalctl -u interactsh" >&2; exit 1
fi

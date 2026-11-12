#!/usr/bin/env bash
# Undo the phase 2 cutover: stop colluder-edge and put interactsh back on :80/:443.
# Keeps the rotated token and the systemd-managed interactsh (no hand-started server needed).
# Run as root:   sudo ~/tools/colluder/deploy/rollback-phase2.sh
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
PUB=203.0.113.10

systemctl disable --now colluder-edge.service 2>/dev/null || true
printf 'INTERACTSH_PORT_FLAGS=\n' > /etc/interactsh/ports.env
systemctl restart interactsh.service
for _ in $(seq 1 40); do ss -ltnH "sport = :443" | grep -q "$PUB" && break; sleep 0.5; done
if ss -ltnH "sport = :443" | grep -q "$PUB" && ss -ltnH "sport = :80" | grep -q "$PUB"; then
  echo "Rolled back: interactsh answers :80/:443 again; colluder-edge is stopped and disabled."
  echo "HTTP rules in the dashboard are kept but not served until the next cutover."
else
  echo "interactsh did not come back on :80/:443: journalctl -u interactsh" >&2; exit 1
fi

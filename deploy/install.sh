#!/usr/bin/env bash
# Colluder install, run by the operator (not by an agent):
#   writes ~/.config/colluder/{engine.yaml,colluder.env} (mode 600), builds the UI,
#   copies the two user units and reloads systemd. It never prints the token.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CONF="$HOME/.config/colluder"
KEYS="$HOME/.config/user/api-keys.env"
umask 077
mkdir -p "$CONF" "$HOME/.local/share/colluder" "$HOME/.config/systemd/user"

tok=$(grep -E '^(export )?NUCLEI_INTERACTSH_TOKEN=' "$KEYS" | tail -n1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']\$//") || true
if [ -z "${tok:-}" ]; then echo "NUCLEI_INTERACTSH_TOKEN not found in $KEYS" >&2; exit 1; fi
printf "server: oob.example\ntoken: '%s'\n" "${tok//\'/\'\'}" > "$CONF/engine.yaml"
unset tok
chmod 600 "$CONF/engine.yaml"
echo "wrote $CONF/engine.yaml (600)"

if [ ! -f "$CONF/colluder.env" ]; then
  printf '# Optional. Uncomment to enable Discord alerts, then: systemctl --user restart colluder\n# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...\n' > "$CONF/colluder.env"
fi
chmod 600 "$CONF/colluder.env"

export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null; nvm use 26 >/dev/null
cd "$ROOT/web"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm run build --silent
echo "built UI into web/dist"

install -m 644 "$ROOT/deploy/colluder-engine.service" "$ROOT/deploy/colluder.service" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
echo "installed units. Next:"
echo "  systemctl --user disable --now interactsh-web.service"
echo "  systemctl --user enable --now colluder-engine.service colluder.service"

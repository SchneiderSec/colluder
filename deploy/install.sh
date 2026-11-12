#!/usr/bin/env bash
# Colluder install, run by the operator (not by root, not by an agent):
#   1. writes ~/.config/colluder/config.yaml once (asks for the domain; detects the public IP and a
#      tailnet address). Flags pass through to `node lib/config.mjs init`, so it can run unattended:
#        deploy/install.sh --domain oob.example --public-ip 203.0.113.10 --dashboard-host 100.64.0.10 --yes
#   2. writes ~/.config/colluder/engine.yaml (server + interactsh token, mode 600) if it isn't there,
#      and colluder.env (optional secrets) if it isn't there. The token is never printed.
#   3. builds the UI, renders the two user units from config.yaml and reloads systemd.
# Running it again keeps config.yaml, engine.yaml and colluder.env as they are.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CONF="$HOME/.config/colluder"
umask 077
mkdir -p "$CONF" "$HOME/.config/systemd/user"

NODE=${COLLUDER_NODE:-$(command -v node || true)}
[[ -x "${NODE:-}" ]] || { echo "node not found on PATH (Colluder needs Node 26 or later; or set COLLUDER_NODE)" >&2; exit 1; }
major=$("$NODE" -p 'process.versions.node.split(".")[0]')
(( major >= 26 )) || { echo "$NODE is Node $major; Colluder needs 26 or later" >&2; exit 1; }

# 1. config.yaml (init leaves an existing file alone); paths.node records the node used here
"$NODE" "$ROOT/lib/config.mjs" init "$@"
. "$ROOT/deploy/lib.sh"
mkdir -p "$DATA"

# 2. engine.yaml: the interactsh server and its token
if [[ ! -f "$CONF/engine.yaml" ]]; then
  tok=""
  TF=$(cfg nuclei.token_file); TV=$(cfg nuclei.token_var)
  if [[ -n "$TF" && -n "$TV" && -f "$TF" ]]; then
    tok=$(grep -E "^(export )?$TV=" "$TF" | tail -n1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']\$//") || true
  fi
  if [[ -z "$tok" ]]; then
    read -r -s -p "interactsh server token (the -token your interactsh-server runs with; empty if none): " tok; echo
  fi
  [[ "$tok" =~ ^[[:print:]]*$ ]] || { echo "the token has unprintable characters" >&2; exit 1; }
  printf "server: %s\ntoken: '%s'\n" "$DOMAIN" "${tok//\'/\'\'}" > "$CONF/engine.yaml"
  unset tok
  chmod 600 "$CONF/engine.yaml"
  echo "wrote $CONF/engine.yaml (600)"
fi
if [[ ! -f "$CONF/colluder.env" ]]; then
  printf '# Optional secrets. Uncomment to enable Discord alerts, then: systemctl --user restart colluder\n# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...\n' > "$CONF/colluder.env"
fi
chmod 600 "$CONF/colluder.env"

# 3. the UI and the user units
PATH="$(dirname "$NODE"):$PATH"
( cd "$ROOT/web" && { [[ -d node_modules ]] || npm ci --no-audit --no-fund; } && npm run build --silent )
echo "built UI into web/dist"
render_unit "$ROOT/deploy/colluder-engine.service" "$HOME/.config/systemd/user/colluder-engine.service"
render_unit "$ROOT/deploy/colluder.service" "$HOME/.config/systemd/user/colluder.service"
systemctl --user daemon-reload
echo "installed the units. Next:"
echo "  systemctl --user enable --now colluder-engine.service colluder.service"
echo "  then open $DASH"

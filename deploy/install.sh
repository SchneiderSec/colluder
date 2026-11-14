#!/usr/bin/env bash
# The dashboard step of `./colluder setup` (and of `./colluder update`), run as the operator, not root:
#   1. writes ~/.config/colluder/config.yaml once (asks for the domain; detects the public IP and a
#      tailnet address). Flags pass through to `node lib/config.mjs init`, so it can run unattended:
#        --domain oob.example --public-ip 203.0.113.10 --dashboard-host 100.64.0.10 --yes
#   2. writes ~/.config/colluder/engine.yaml (server + interactsh token, mode 600) and colluder.env
#      (optional secrets) if they aren't there. The token is set by deploy/edge.sh, which starts
#      interactsh with a fresh one; it is never printed.
#   3. builds the UI, renders the two user units from config.yaml, turns on lingering (so Colluder
#      keeps running after you log out) and starts the dashboard, or restarts it after an update.
# Running it again keeps config.yaml, engine.yaml and colluder.env as they are.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CONF="$HOME/.config/colluder"
umask 077
mkdir -p "$CONF" "$HOME/.config/systemd/user"

NODE=${COLLUDER_NODE:-$(command -v node || true)}
[[ -x "${NODE:-}" ]] || { echo "node not found on PATH (Colluder needs Node 26 or later: nvm install 26; or set COLLUDER_NODE)" >&2; exit 1; }
major=$("$NODE" -p 'process.versions.node.split(".")[0]')
(( major >= 26 )) || { echo "$NODE is Node $major; Colluder needs 26 or later (nvm install 26)" >&2; exit 1; }

# 1. config.yaml (init leaves an existing file alone); paths.node records the node used here
"$NODE" "$ROOT/lib/config.mjs" init "$@"
. "$ROOT/deploy/lib.sh"
mkdir -p "$DATA"

# 2. engine.yaml: the interactsh server and its token (empty until the cutover sets one)
if [[ ! -f "$CONF/engine.yaml" ]]; then
  tok=""
  TF=$(cfg nuclei.token_file); TV=$(cfg nuclei.token_var)
  if [[ -n "$TF" && -n "$TV" && -f "$TF" ]]; then
    tok=$(grep -E "^(export )?$TV=" "$TF" | tail -n1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']\$//") || true
  fi
  [[ "$tok" =~ ^[[:print:]]*$ ]] || { echo "the token has unprintable characters" >&2; exit 1; }
  printf "server: %s\ntoken: '%s'\n" "$DOMAIN" "${tok//\'/\'\'}" > "$CONF/engine.yaml"
  unset tok
  chmod 600 "$CONF/engine.yaml"
  echo "   ok    wrote $CONF/engine.yaml (600)"
fi
if [[ ! -f "$CONF/colluder.env" ]]; then
  printf '# Optional secrets. Uncomment to enable Discord alerts, then: systemctl --user restart colluder\n# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...\n' > "$CONF/colluder.env"
fi
chmod 600 "$CONF/colluder.env"

# 3. the UI, the user units, lingering, and the dashboard
PATH="$(dirname "$NODE"):$PATH"
export NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
# reinstall the UI's packages when the lockfile changed (an update that adds or bumps one), not only when missing
LOCK=$(sha256sum "$ROOT/web/package-lock.json" | cut -d' ' -f1)
( cd "$ROOT/web" && { [[ "$(cat node_modules/.colluder-lock 2>/dev/null)" == "$LOCK" ]] || { npm ci --no-audit --no-fund --loglevel=error >/dev/null && echo "$LOCK" > node_modules/.colluder-lock; }; } && npx vite build --logLevel error >/dev/null )
echo "   ok    dashboard built"
render_unit "$ROOT/deploy/colluder-engine.service" "$HOME/.config/systemd/user/colluder-engine.service"
render_unit "$ROOT/deploy/colluder.service" "$HOME/.config/systemd/user/colluder.service"
systemctl --user daemon-reload
if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]]; then
  loginctl enable-linger "$USER" 2>/dev/null && echo "   ok    lingering on: Colluder keeps running after you log out" \
    || echo "   note  couldn't turn on lingering yet; the web step does it as root"
fi
if systemctl --user is-active -q colluder.service; then
  systemctl --user restart colluder.service; echo "   ok    dashboard restarted"
else
  systemctl --user enable --now colluder.service >/dev/null 2>&1; echo "   ok    dashboard started"
fi
# the engine needs interactsh's token, which the web step sets; once it has one, keep it running
grep -q "^token: ''$" "$CONF/engine.yaml" || systemctl --user enable --now colluder-engine.service >/dev/null 2>&1

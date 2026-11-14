#!/usr/bin/env bash
# Colluder install and update, run by the operator as their normal user (not by root, not by an agent):
#   1. writes ~/.config/colluder/config.yaml once (asks for the domain; detects the public IP and a
#      tailnet address). Flags pass through to `node lib/config.mjs init`, so it can run unattended:
#        deploy/install.sh --domain oob.example --public-ip 203.0.113.10 --dashboard-host 100.64.0.10 --yes
#   2. runs deploy/check.sh, which says what still needs fixing (nothing fatal here).
#   3. writes ~/.config/colluder/engine.yaml (server + interactsh token, mode 600) and colluder.env
#      (optional secrets) if they aren't there. The token is set by deploy/cutover-phase2.sh, which
#      starts interactsh with a fresh one; it is never printed.
#   4. builds the UI, renders the two user units from config.yaml, turns on lingering (so Colluder
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

# 2. what still needs doing before the cutover (DNS, ports, firewall); informational here
"$ROOT/deploy/check.sh" || true

# 3. engine.yaml: the interactsh server and its token (empty until the cutover sets one)
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
  echo "wrote $CONF/engine.yaml (600)"
fi
if [[ ! -f "$CONF/colluder.env" ]]; then
  printf '# Optional secrets. Uncomment to enable Discord alerts, then: systemctl --user restart colluder\n# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...\n' > "$CONF/colluder.env"
fi
chmod 600 "$CONF/colluder.env"

# 4. the UI, the user units, lingering, and the dashboard
PATH="$(dirname "$NODE"):$PATH"
# reinstall the UI's packages when the lockfile changed (an update that adds or bumps one), not only when missing
LOCK=$(sha256sum "$ROOT/web/package-lock.json" | cut -d' ' -f1)
( cd "$ROOT/web" && { [[ "$(cat node_modules/.colluder-lock 2>/dev/null)" == "$LOCK" ]] || { npm ci --no-audit --no-fund && echo "$LOCK" > node_modules/.colluder-lock; }; } && npm run build --silent )
echo "built UI into web/dist"
render_unit "$ROOT/deploy/colluder-engine.service" "$HOME/.config/systemd/user/colluder-engine.service"
render_unit "$ROOT/deploy/colluder.service" "$HOME/.config/systemd/user/colluder.service"
systemctl --user daemon-reload
if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]]; then
  loginctl enable-linger "$USER" 2>/dev/null && echo "turned on lingering: Colluder keeps running after you log out" \
    || echo "couldn't turn on lingering; the cutover does it (or: sudo loginctl enable-linger $USER)"
fi
if systemctl --user is-active -q colluder.service; then
  systemctl --user restart colluder.service; echo "restarted the dashboard"
else
  systemctl --user enable --now colluder.service; echo "started the dashboard"
fi
if grep -q "^token: ''$" "$CONF/engine.yaml"; then
  echo
  echo "Open $DASH. Next, start interactsh and put the edge in front (as root):"
  echo "  sudo deploy/cutover-phase2.sh"
else
  systemctl --user enable --now colluder-engine.service
  echo
  echo "Open $DASH"
fi

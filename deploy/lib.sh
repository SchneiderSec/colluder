# Shared by the deploy scripts (sourced, run as root via sudo). Everything about this box comes from
# the operator's ~/.config/colluder/config.yaml (lib/config.mjs), never from the scripts:
#   U H UID_U   the operator (who owns this checkout), their home and uid
#   APP DATA    this checkout, and Colluder's data directory
#   NODE        the node the services run (paths.node)
#   PUB DOMAIN  the public address and the payload domain
#   DASH        the dashboard's address
#   SERVER_BIN  interactsh-server
#   cfg <key>   any other config value
# render_unit <template> <dest>: install a unit from deploy/, filling in @APP@ @USER@ @HOME@ @DATA@
#   @NODE@ @CLIENT_BIN@ @SERVER_BIN@ @DOMAIN@ @DASH@
APP=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
U=${COLLUDER_USER:-$(stat -c %U "$APP")}
H=$(getent passwd "$U" | cut -d: -f6)
UID_U=$(id -u "$U")
CONFIG=${COLLUDER_CONFIG:-$H/.config/colluder/config.yaml}
# run as the operator (install.sh does; the root scripts drop to them, so ~ means their home)
as_op() { if [[ $EUID -eq $UID_U ]]; then "$@"; else sudo -u "$U" -H "$@"; fi; }
[[ -r "$CONFIG" ]] || { echo "no $CONFIG: run ./colluder setup as $U first" >&2; exit 1; }
# node first, straight from the file: it's what reads the rest
NODE=$(sed -nE 's/^[[:space:]]+node:[[:space:]]*"?([^"#]*[^"#[:space:]])"?.*$/\1/p' "$CONFIG" | head -1)
NODE=${NODE/#\~/$H}
[[ -x "${NODE:-}" ]] || NODE=$(as_op bash -lc 'command -v node' 2>/dev/null || true)
[[ -x "${NODE:-}" ]] || { echo "node not found: set paths.node in $CONFIG" >&2; exit 1; }
cfg() { as_op env COLLUDER_CONFIG="$CONFIG" "$NODE" "$APP/lib/config.mjs" get "$1"; }
DATA=$(cfg paths.data)
PUB=$(cfg public_ip)
DOMAIN=$(cfg domain)
DASH="http://$(cfg dashboard.host):$(cfg dashboard.port)"
CLIENT_BIN=$(cfg paths.interactsh_client)
SERVER_BIN=$(cfg paths.interactsh_server)
[[ -n "$PUB" && -n "$DOMAIN" ]] || { echo "$CONFIG needs domain and public_ip" >&2; exit 1; }

# run a user-level systemctl (and the like) as the operator, from a root script
as_user() { sudo -u "$U" XDG_RUNTIME_DIR=/run/user/$UID_U DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID_U/bus "$@"; }
# interactsh keeps client registrations in memory: after it restarts, the engine has to register its
# id again or it records nothing. The dashboard's engine check would restart it within about two
# minutes; doing it here closes that gap. Not fatal: if it fails, the engine check still recovers.
restart_engine() {
  # it registers over HTTPS, which interactsh opens only once it has its certificate: wait for that
  # (8444 behind the edge, 443 without it), up to 30 s; past that, systemd's retries take over
  local _; for _ in $(seq 1 60); do ss -ltnpH "( sport = :8444 or sport = :443 )" 2>/dev/null | grep -q interactsh && break; sleep 0.5; done
  if as_user systemctl --user restart colluder-engine.service; then printf '   ok    %s\n' "engine restarted: it registers its id with interactsh again"
  else printf '   WARN  %s\n' "couldn't restart the engine; the dashboard's engine check restarts it within a few minutes (journalctl --user -u colluder-engine)"; fi
}

# where cert-sync puts the certificates, from config.yaml: the edge's default next to tls.cert, the
# others under tls.cert_dir (the file names are always fullchain.pem and privkey.pem)
write_cert_defaults() {
  printf 'ROOT_DOMAIN=%s\nCERT_USER=%s\nCERT_DST=%s\nCERT_DOMAINS=%s\n' "$DOMAIN" "$U" "$(dirname "$(cfg tls.cert)")" "$(cfg tls.cert_dir)" > /etc/default/colluder-cert-sync
}

render_unit() {
  local src=$1 dest=$2 tmp
  tmp=$(mktemp)
  sed -e "s#@APP@#$APP#g; s#@USER@#$U#g; s#@HOME@#$H#g; s#@DATA@#$DATA#g; s#@NODE@#$NODE#g" \
      -e "s#@CLIENT_BIN@#$CLIENT_BIN#g; s#@SERVER_BIN@#$SERVER_BIN#g; s#@DOMAIN@#$DOMAIN#g; s#@DASH@#$DASH#g" "$src" > "$tmp"
  if grep -q '@[A-Z_]*@' "$tmp"; then echo "unfilled placeholder in $src: $(grep -o '@[A-Z_]*@' "$tmp" | sort -u | tr '\n' ' ')" >&2; rm -f "$tmp"; exit 1; fi
  install -D -m 644 "$tmp" "$dest"; rm -f "$tmp"
}
# render to stdout instead (to compare with what's installed)
render_unit_stdout() {
  local t; t=$(mktemp -d); render_unit "$1" "$t/u"; cat "$t/u"; rm -rf "$t"
}

# The name of the header the edge puts the client's address in, which interactsh believes (-oih).
# A secret: interactsh would believe that header from anyone, and its ports are on the public IP.
# Prints the one already in /etc/interactsh/ports.env when it is a secret one, else a new one.
ORIGIN_LEGACY=X-Colluder-Origin-IP
origin_header() {
  local cur
  cur=$(sed -nE 's/^INTERACTSH_PORT_FLAGS=.*-oih ([A-Za-z0-9-]+).*$/\1/p' /etc/interactsh/ports.env 2>/dev/null | head -1 || true)
  if [[ "$cur" =~ ^X-Colluder-Origin-[A-Za-z0-9-]{1,64}$ && "$cur" != "$ORIGIN_LEGACY" ]]; then echo "$cur"
  else echo "X-Colluder-Origin-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"; fi
}

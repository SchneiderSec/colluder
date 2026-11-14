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

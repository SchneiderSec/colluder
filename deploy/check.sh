#!/usr/bin/env bash
# Checks this server is ready for Colluder and says what to fix. Changes nothing; safe any time.
#   ./colluder check [--domain oob.example] [--public-ip 203.0.113.10]     (this is deploy/check.sh)
# Run as your normal user. ./colluder setup runs it before it changes anything as root, and so does
# deploy/edge.sh when run by hand. Exit status 1 when something must be fixed first.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FAILED=0
ok()   { printf '   ok    %s\n' "$*"; }
warn() { printf '   WARN  %s\n' "$*"; }
fail() { printf '   FAIL  %s\n' "$*"; FAILED=1; }
note() { printf '   note  %s\n' "$*"; }
DOMAIN=""; PUB=""
while (( $# )); do case "$1" in --domain) DOMAIN=${2:-}; shift 2 ;; --public-ip) PUB=${2:-}; shift 2 ;; *) echo "unknown option $1" >&2; exit 2 ;; esac; done

[[ -n "${COLLUDER_IN_SETUP:-}" ]] || printf '\n\033[1m== Colluder check\033[0m\n'
# ---- the system
[[ -d /run/systemd/system ]] && ok "systemd" || fail "systemd is not running: Colluder's services need it"
command -v sudo >/dev/null && ok "sudo" || fail "sudo is missing: the cutover and front scripts run as root"
miss=(); for c in curl openssl python3 ss sha256sum dig; do command -v "$c" >/dev/null || miss+=("$c"); done
(( ${#miss[@]} )) && fail "missing tools: ${miss[*]} (on Debian/Ubuntu: sudo apt install curl openssl python3 iproute2 coreutils bind9-dnsutils)" || ok "curl, openssl, python3, ss, dig"

# ---- Node
NODE=${COLLUDER_NODE:-$(command -v node || true)}
if [[ -x "${NODE:-}" ]]; then
  major=$("$NODE" -p 'process.versions.node.split(".")[0]')
  (( major >= 26 )) && ok "Node $("$NODE" -v)" || fail "Node $("$NODE" -v) is too old: Colluder needs 26 or later (nvm install 26)"
else
  fail "Node not found: install Node 26 or later (with nvm: nvm install 26)"; NODE=""
fi

# ---- the config (once setup has written it)
cfg() { [[ -n "$NODE" ]] && "$NODE" "$ROOT/lib/config.mjs" get "$1" 2>/dev/null; }
CONF=${COLLUDER_CONFIG:-$HOME/.config/colluder/config.yaml}
if [[ -f "$CONF" && -n "$NODE" ]]; then
  [[ -n "$DOMAIN" ]] || DOMAIN=$(cfg domain)
  [[ -n "$PUB" ]] || PUB=$(cfg public_ip)
  CLIENT=$(cfg paths.interactsh_client); SERVER=$(cfg paths.interactsh_server)
fi
[[ -n "$PUB" ]] || PUB=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')
for name in client server; do
  var=${name^^}; [[ -n "${!var:-}" ]] && continue
  if [[ -x "$HOME/go/bin/interactsh-$name" ]]; then printf -v "$var" '%s' "$HOME/go/bin/interactsh-$name"; else printf -v "$var" '%s' "$HOME/.local/bin/interactsh-$name"; fi
done

# ---- interactsh
for b in "$CLIENT" "$SERVER"; do
  if [[ -x "$b" ]]; then
    v=$("$b" -version 2>&1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1)
    [[ "$v" == "1.4.1" ]] && ok "$(basename "$b") $v" || warn "$(basename "$b") is ${v:-of unknown version}; Colluder is built against 1.4.1 (./colluder setup installs it)"
  else
    fail "$(basename "$b") not found at $b: run ./colluder setup"
  fi
done

# ---- the domain's delegation, read from the parent zone's own servers (works before interactsh runs)
if [[ -z "$DOMAIN" ]]; then
  note "no domain yet: ./colluder setup asks for it (or pass --domain)"
elif [[ -z "$PUB" ]]; then
  fail "no public IPv4 address found on this server"
else
  ok "domain $DOMAIN, public IP $PUB"
  python3 -I - "$DOMAIN" "$PUB" <<'PY' || FAILED=1
import random, socket, struct, sys
domain, pub = sys.argv[1].rstrip(".").lower(), sys.argv[2]
def ask(server, name, qtype, rd=True):
    q = struct.pack(">HHHHHH", random.randrange(65536), 0x0100 if rd else 0, 1, 0, 0, 0)
    q += b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\0" + struct.pack(">HH", qtype, 1)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(4)
    try: s.sendto(q, (server, 53)); m = s.recv(4096)
    finally: s.close()
    def nm(i):
        out = []
        while True:
            n = m[i]
            if n == 0: return ".".join(out), i + 1
            if n & 0xC0 == 0xC0:
                return ".".join(out + [nm(struct.unpack(">H", m[i:i + 2])[0] & 0x3FFF)[0]]).strip("."), i + 2
            out.append(m[i + 1:i + 1 + n].decode().lower()); i += n + 1
    counts = struct.unpack(">HHHH", m[4:12]); i = 12
    for _ in range(counts[0]): i = nm(i)[1] + 4
    recs = []
    for sec, c in enumerate(counts[1:]):
        for _ in range(c):
            owner, i = nm(i); t, _, _, ln = struct.unpack(">HHIH", m[i:i + 10]); i += 10
            data = nm(i)[0] if t == 2 else socket.inet_ntoa(m[i:i + 4]) if t == 1 and ln == 4 else None
            recs.append((sec, owner, t, data)); i += ln
    return (m[3] & 0x0F), recs
def a(name):
    try: return {d for _, o, t, d in ask("1.1.1.1", name, 1)[1] if t == 1}
    except OSError: return set()
labels = domain.split(".")
parent = next((".".join(labels[k:]) for k in range(1, len(labels))
               if any(t == 2 for _, _, t, _ in ask("1.1.1.1", ".".join(labels[k:]), 2)[1])), None)
if not parent: print(f"   FAIL  couldn't find the zone above {domain}"); sys.exit(1)
pns = sorted(d for _, _, t, d in ask("1.1.1.1", parent, 2)[1] if t == 2)
pip = next((ip for n in pns for ip in sorted(a(n))), None)
if not pip: print(f"   FAIL  couldn't reach the {parent} servers"); sys.exit(1)
rcode, recs = ask(pip, domain, 2, rd=False)
ns = sorted({d for sec, o, t, d in recs if t == 2 and o == domain})
if rcode == 3 or not ns:
    print(f"   FAIL  the {parent} servers don't delegate {domain}: at your registrar, add glue records ns1.{domain} and ns2.{domain} -> {pub} and make them the domain's nameservers (it can take a few minutes to show)")
    sys.exit(1)
glue = {}
for sec, o, t, d in recs:
    if t == 1: glue.setdefault(o, set()).add(d)
bad = []
for n in ns:
    ips = glue.get(n) or a(n)
    if pub not in ips: bad.append(f"{n} -> {', '.join(sorted(ips)) or 'nothing'}")
if bad:
    print(f"   FAIL  {domain} is delegated, but not all of its nameservers point here ({pub}): {'; '.join(bad)}"); sys.exit(1)
print(f"   ok    {parent} delegates {domain} to {', '.join(ns)} -> {pub}")
PY
fi

# ---- ports: free, or held by interactsh/the edge already
held_by_us() { systemctl is-active -q interactsh 2>/dev/null || systemctl is-active -q colluder-edge 2>/dev/null || pgrep -f "interactsh-server" >/dev/null; }
for spec in tcp:80 tcp:443 tcp:53 udp:53; do
  proto=${spec%%:*}; p=${spec##*:}
  l=$(ss -lnH -${proto:0:1} "sport = :$p" 2>/dev/null | awk '{print $4}' | grep -vE '^127\.0\.0\.5[34](%[a-z0-9]+)?:' || true)
  if [[ -z "$l" ]]; then ok "$p/$proto free"
  elif held_by_us; then ok "$p/$proto in use by interactsh or the edge"
  else fail "$p/$proto is already in use ($(echo $l | tr '\n' ' ')): stop what holds it (sudo ss -lnp${proto:0:1} 'sport = :$p' shows it)"; fi
done
if ss -lnuH "sport = :53" 2>/dev/null | grep -qE '127\.0\.0\.5[34](%[a-z0-9]+)?:53'; then
  note "systemd-resolved listens on 127.0.0.53:53 for this server's own lookups; interactsh and the edge use $PUB:53"
fi

# ---- firewall
if systemctl is-active -q ufw 2>/dev/null; then
  rules=$(sudo -n ufw status 2>/dev/null || true)
  if [[ -z "$rules" ]]; then warn "ufw is on, and its rules need sudo to read: allow 53 (tcp and udp), 80, 443 (and 25, 465, 587 for mail)"
  elif grep -q "Status: active" <<<"$rules"; then
    for p in 53 80 443; do grep -qE "^$p(/(tcp|udp))?[[:space:]]+ALLOW" <<<"$rules" && ok "ufw allows $p" || fail "ufw is active and has no ALLOW rule for $p: sudo ufw allow $p"; done
  else ok "ufw is installed but not enabled"
  fi
elif command -v firewall-cmd >/dev/null && systemctl is-active -q firewalld 2>/dev/null; then
  warn "firewalld is on: allow 53 (tcp and udp), 80, 443 (and 25, 465, 587 for mail)"
else
  ok "no host firewall active"
fi
note "a cloud firewall (AWS security groups, Hetzner Firewalls and the like) must allow the same ports"

# ---- the dashboard and engine are user services: they keep running after you log out only with lingering
if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" == "yes" ]]; then ok "lingering on for $USER"
else note "lingering is off for $USER: ./colluder setup turns it on, so Colluder keeps running after you log out"; fi

[[ -n "${COLLUDER_IN_SETUP:-}" ]] && exit $FAILED
echo
if (( FAILED )); then echo "Fix the FAIL lines above, then run ./colluder check again."; exit 1; fi
echo "Ready."

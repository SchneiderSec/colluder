#!/usr/bin/env bash
# The mail step of `./colluder setup`: move interactsh-server's SMTP from :25/:587/:465 to internal
# ports and put colluder-edge on them. The edge receives mail for Colluder's names itself (probes and the
# mailbox), writes each message to disk before it answers 250, and refuses everything else. Nothing
# is relayed or sent.
#   Run by setup (unless --no-mail); by hand, as root:  sudo deploy/mail.sh [--force]
#   Undo:                                               sudo deploy/mail.sh --undo
# Mail to the domain is refused for a few seconds during the switch (senders retry). No token is read
# or printed. interactsh restarts, which makes it forget the engine's registration: the engine is
# restarted after it, so it registers again.
set -euo pipefail
umask 077

. "$(dirname "$0")/lib.sh"   # the operator, paths, public IP and domain, from config.yaml
PORTS=/etc/interactsh/ports.env
EENV=$H/.config/colluder/edge.env
UP_SMTP=8025; UP_SMTPS=8587; UP_AUTOTLS=8465
FLAGS="-smtp-port $UP_SMTP -smtps-port $UP_SMTPS -smtp-autotls-port $UP_AUTOTLS"
MODE=${1:-}; [[ "$MODE" == "--undo" ]] && MODE=--rollback

say()  { local t="$*"; printf '   \033[2m-- %s\033[0m\n' "${t#[0-9]/[0-9] }"; }
ok()   { printf '   ok    %s\n' "$*"; }
bad()  { printf '   FAIL  %s\n' "$*"; FAILED=1; }
warn() { printf '   WARN  %s\n' "$*"; }
die()  { printf '\n   STOP  %s\n' "$*" >&2; exit 1; }
FAILED=0

[[ $EUID -eq 0 ]] || die "run with sudo"
[[ -f $PORTS && -f $EENV ]] || die "the edge isn't set up yet: run ./colluder setup"

set_env() { # set_env KEY [VALUE]: no VALUE removes the line (edge.env stays the user's file)
  local tmp; tmp=$(mktemp)
  grep -v "^$1=" "$EENV" > "$tmp" || true
  [[ $# -ge 2 ]] && printf '%s=%s\n' "$1" "$2" >> "$tmp"
  install -o $U -g $U -m 600 "$tmp" "$EENV"; rm -f "$tmp"
}
# wait_tcp PORT REGEX [PROC]: something (named PROC) listens on tcp PORT at an address matching REGEX
wait_tcp() { for _ in $(seq 1 40); do ss -ltnpH "sport = :$1" | grep -E "$2" | grep -q "${3:-.}" && return 0; sleep 0.5; done; return 1; }
greeting() { timeout 8 bash -c "exec 3<>/dev/tcp/$PUB/$1; IFS= read -r -t 6 l <&3; printf '%s' \"\$l\"" 2>/dev/null || true; }

rollback() {
  say "undo: interactsh back on :25/:587/:465, the edge off them"
  set_env COLLUDER_EDGE_SMTP
  set_env COLLUDER_EDGE_SMTPS
  systemctl restart colluder-edge.service
  sed -i -E "s/ ?-smtp-port [0-9]+//; s/ ?-smtps-port [0-9]+//; s/ ?-smtp-autotls-port [0-9]+//" "$PORTS"
  systemctl restart interactsh.service
  if wait_tcp 25 ":25( |$)"; then ok "interactsh answers SMTP on :25 again ($(greeting 25))"; else printf '   FAIL  nothing on :25: journalctl -u interactsh\n'; fi
  restart_engine
  as_user systemctl --user restart colluder.service
  ok "dashboard restarted: email payloads go back to the long id"
}

if [[ "$MODE" == "--rollback" ]]; then rollback; exit 0; fi

say "1/5 preflight"
if pgrep -x nuclei >/dev/null && [[ "$MODE" != "--force" ]]; then die "a nuclei scan is running; interactsh restarts (a few seconds without callbacks). Re-run with --force to go ahead anyway."; fi
command -v python3 >/dev/null || die "python3 not found (the check sends a test message with it)"
as_user "$NODE" --test "$APP/test/mail.test.mjs" "$APP/test/edge.test.mjs" >/dev/null 2>&1 || die "mail or edge tests fail: run npm test in $APP"
ok "mail and edge tests pass"
for p in $UP_SMTP $UP_SMTPS $UP_AUTOTLS; do
  if ss -ltnH "sport = :$p" | grep -q . && ! grep -q -- "-smtp-port $UP_SMTP" "$PORTS"; then die "port $p is already in use"; fi
done
SHORT=$("$NODE" -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((j.shortIds||[])[0]||"")}catch{}' "$DATA/rules.json")
[[ "$SHORT" =~ ^[a-z][a-z0-9]{5}$ ]] || die "no short id in rules.json yet: restart the dashboard (systemctl --user restart colluder) and run this again"
ok "short id $SHORT: the mailbox will be <anyone>@mailbox-$SHORT.$DOMAIN"
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  for p in 25 465 587; do ufw status | grep -qE "^$p(/tcp)?[[:space:]]+ALLOW" || warn "ufw is active and has no ALLOW rule for $p/tcp: senders on the internet can't reach it (ufw allow $p/tcp)"; done
fi
trap 'echo; printf "   STOP  something failed: undoing this step\n"; rollback' ERR

say "2/5 interactsh SMTP to :$UP_SMTP, :$UP_SMTPS, :$UP_AUTOTLS"
grep -q -- "-smtp-port $UP_SMTP" "$PORTS" || sed -i -E "s/^(INTERACTSH_PORT_FLAGS=.*)$/\1 $FLAGS/" "$PORTS"
grep -q -- "-smtp-port $UP_SMTP" "$PORTS"
systemctl restart interactsh.service
wait_tcp $UP_SMTP ":$UP_SMTP( |$)" || { echo "   interactsh did not come up on :$UP_SMTP (journalctl -u interactsh)"; false; }
ok "interactsh SMTP moved off the public ports"
restart_engine

say "3/5 the edge on $PUB:25, :587 (STARTTLS) and :465 (TLS)"
set_env COLLUDER_EDGE_SMTP "$PUB:25,$PUB:587"
set_env COLLUDER_EDGE_SMTPS "$PUB:465"
systemctl restart colluder-edge.service
wait_tcp 25 "$PUB:25( |$)" node || { echo "   the edge did not bind $PUB:25 (journalctl -u colluder-edge)"; false; }
ok "edge listening for mail"
as_user systemctl --user restart colluder.service
for _ in $(seq 1 30); do curl -fsS -m 2 "$DASH/api/mailbox" >/dev/null 2>&1 && break; sleep 1; done
ok "dashboard restarted"

say "4/5 verify"
trap - ERR
g=$(greeting 25); [[ "$g" == 220*Colluder* ]] && ok ":25 greets: $g" || bad ":25 greeting is '$g'"
g=$(greeting 587); [[ "$g" == 220*Colluder* ]] && ok ":587 greets too" || bad ":587 greeting is '$g'"
if command -v openssl >/dev/null; then
  s=$(timeout 10 openssl s_client -starttls smtp -connect "$PUB:25" -servername "mail.$DOMAIN" </dev/null 2>/dev/null | grep -m1 -E "^subject=|^ *0 s:" || true)
  [[ -n "$s" ]] && ok "STARTTLS on :25 ($s)" || bad "STARTTLS on :25 didn't complete"
  s=$(timeout 10 openssl s_client -connect "$PUB:465" -servername "mail.$DOMAIN" </dev/null 2>/dev/null | grep -m1 -E "^subject=|^ *0 s:" || true)
  [[ -n "$s" ]] && ok "TLS on :465" || bad "TLS on :465 didn't complete"
fi
NONCE=$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')
LOCAL="setup-check-mail-$NONCE"
out=$(python3 -I - "$PUB" "$LOCAL@mailbox-$SHORT.$DOMAIN" "nobody@elsewhere.example" <<'PY' 2>&1
import smtplib, sys
from email.message import EmailMessage
pub, to, foreign = sys.argv[1:4]
m = EmailMessage(); m["From"] = "setup-check@colluder.invalid"; m["To"] = to; m["Subject"] = "Colluder setup mail check"
m.set_content("Your verification code is 731942.\n\nOr sign in: https://colluder.invalid/magic?token=a1b2c3d4e5f6g7h8i9\n")
s = smtplib.SMTP(pub, 25, timeout=15); s.ehlo("setup-check.colluder.invalid"); s.starttls(); s.ehlo("setup-check.colluder.invalid")
print("sent", s.send_message(m))
try:
    s.sendmail("x@colluder.invalid", [foreign], "Subject: no\r\n\r\nno\r\n"); print("foreign ACCEPTED")
except smtplib.SMTPRecipientsRefused:
    print("foreign refused")
s.quit()
PY
)
grep -q "^sent {}" <<<"$out" && ok "a test message over STARTTLS was accepted" || bad "sending failed: $out"
grep -q "foreign refused" <<<"$out" && ok "mail for other domains is refused (not an open relay)" || bad "a foreign recipient wasn't refused: $out"
r=$(curl -fsS -m 20 "$DASH/api/mail/latest?local=$LOCAL&wait=15" || true)
grep -q '"code":"731942"' <<<"$r" && ok "the mailbox stored it and found the code" || bad "the message isn't in the mailbox: ${r:0:300}"
grep -q '"link":"https://colluder.invalid/magic' <<<"$r" && ok "and the magic link" || bad "the link wasn't found"

say "5/5 the engine"
sleep 3
r=$(curl -fsS -m 5 "$DASH/api/status" || true)
grep -q '"state":"capturing"' <<<"$r" && ok "engine capturing (the engine check runs within a minute and every 3 after)" || warn "engine not 'capturing' yet: look at the dashboard in a minute"

if (( FAILED )); then
  echo; echo "Some checks failed. Undo with: sudo $APP/deploy/mail.sh --undo"; exit 1
fi
[[ -n "${COLLUDER_IN_SETUP:-}" ]] && exit 0   # setup prints the summary
echo
echo "Done. Mail for Colluder's names now lands in Colluder:"
echo "  mailbox:  <anyone>@mailbox-$SHORT.$DOMAIN  (dashboard Mailbox tab, /api/mail, MCP wait_for_mail)"
echo "  probes:   kc5@<tag>-$SHORT.$DOMAIN arrives as an SMTP hit with the whole message"
echo "The check left one message for $LOCAL in the mailbox; it goes with the rest after the retention period."

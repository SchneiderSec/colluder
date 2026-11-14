#!/usr/bin/env bash
# Downloads the interactsh release Colluder is built against (server and client), checks both against
# the release's checksums, and installs them for this user. No Go toolchain needed.
#   deploy/get-interactsh.sh [--dir DIR]     default DIR: ~/.local/bin
# Run as your normal user, before deploy/install.sh (which finds the binaries there).
set -euo pipefail
VERSION=1.4.1
DIR="$HOME/.local/bin"
[[ "${1:-}" == "--dir" && -n "${2:-}" ]] && DIR=$2

case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  i386|i686) ARCH=386 ;;
  armv7l|armv6l) ARCH=arm ;;
  *) echo "no interactsh release for $(uname -m)" >&2; exit 1 ;;
esac
for c in curl sha256sum python3; do command -v "$c" >/dev/null || { echo "$c is needed (apt install $c)" >&2; exit 1; }; done

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
BASE="https://github.com/projectdiscovery/interactsh/releases/download/v$VERSION"
curl -fsSL --retry 3 -o "$TMP/checksums.txt" "$BASE/interactsh_${VERSION}_checksums.txt"
mkdir -p "$DIR"
for name in interactsh-server interactsh-client; do
  zip="${name}_${VERSION}_linux_${ARCH}.zip"
  curl -fsSL --retry 3 -o "$TMP/$zip" "$BASE/$zip"
  want=$(awk -v f="$zip" '$2 == f { print $1 }' "$TMP/checksums.txt")
  [[ -n "$want" ]] || { echo "$zip is not in the release checksums" >&2; exit 1; }
  [[ "$(sha256sum "$TMP/$zip" | cut -d' ' -f1)" == "$want" ]] || { echo "$zip does not match its checksum: not installed" >&2; exit 1; }
  python3 -I -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extract(sys.argv[2], sys.argv[3])' "$TMP/$zip" "$name" "$TMP"
  install -m 755 "$TMP/$name" "$DIR/$name"
  echo "installed $DIR/$name (v$VERSION, linux/$ARCH, checksum verified)"
done

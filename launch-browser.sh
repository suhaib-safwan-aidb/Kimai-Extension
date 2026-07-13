#!/usr/bin/env bash
# Launch Brave (or Chrome) with SSL certificate verification disabled.
#
# This is required when connecting to internal Kimai servers that use
# self-signed or untrusted HTTPS certificates (equivalent to curl -k).
#
# Usage:
#   ./launch-browser.sh            # auto-detects Brave or Chrome
#   ./launch-browser.sh brave      # force Brave
#   ./launch-browser.sh chrome     # force Chrome
#
# NOTE: Only use this for internal company networks. Do not use this script
# to browse public/untrusted sites.

set -e

BROWSER="${1:-auto}"

FLAGS=(
  "--ignore-certificate-errors"
  "--ignore-certificate-errors-spki-list"
  "--ignore-ssl-errors"
)

case "$BROWSER" in
  brave)
    BINARY="brave-browser"
    ;;
  chrome)
    BINARY="google-chrome"
    ;;
  auto)
    if command -v brave-browser &>/dev/null; then
      BINARY="brave-browser"
    elif command -v google-chrome &>/dev/null; then
      BINARY="google-chrome"
    else
      echo "ERROR: Neither Brave nor Chrome found. Install one and retry." >&2
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 [brave|chrome|auto]" >&2
    exit 1
    ;;
esac

echo "Launching $BINARY with certificate verification disabled..."
exec "$BINARY" "${FLAGS[@]}" "$@" &

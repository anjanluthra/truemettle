#!/usr/bin/env bash
# Renders the Open Graph card and the icons from the HTML templates in this
# folder, using headless Chromium so the real Fraunces cut is used.
#
#   npm run images
#
# CHROME may be set to any Chrome/Chromium binary.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chrome="${CHROME:-}"

if [ -z "$chrome" ]; then
  # The headless shell reports an exact viewport for --window-size; full
  # Chrome subtracts its window chrome and silently clips the render.
  for candidate in \
    /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell \
    /opt/pw-browsers/chromium-*/chrome-linux/chrome \
    "$(command -v chromium || true)" \
    "$(command -v chromium-browser || true)" \
    "$(command -v google-chrome || true)" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if [ -x "$candidate" ]; then chrome="$candidate"; break; fi
  done
fi

if [ -z "$chrome" ] || [ ! -x "$chrome" ]; then
  echo "No Chrome/Chromium found. Set CHROME=/path/to/chrome and re-run." >&2
  exit 1
fi

shot() { # template  width  height  output
  local tmp
  tmp="$(mktemp -d)"
  "$chrome" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --allow-file-access-from-files --force-device-scale-factor=1 \
    --virtual-time-budget=4000 --user-data-dir="$tmp" \
    --window-size="$2,$3" --screenshot="$root/public/$4" \
    "file://$root/tools/$1" >/dev/null 2>&1
  rm -rf "$tmp"
  echo "  public/$4  ($2×$3)"
}

echo "Rendering with $chrome"
shot og-template.html   1200 630 og.png
shot icon-template.html  180 180 apple-touch-icon.png
shot icon-template.html   32  32 icon-32.png

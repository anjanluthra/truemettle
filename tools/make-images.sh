#!/usr/bin/env bash
# Renders the link-preview card and the icons from the HTML templates in this
# folder, using headless Chromium.
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
    /opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell \
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
shot og-template.html   1200 630 opengraph-image.png
# Link previews take a JPEG; LinkedIn, X, WhatsApp and Slack all read it.
python3 -c "from PIL import Image; Image.open('$root/public/opengraph-image.png').convert('RGB').save('$root/public/opengraph-image.jpg', quality=90)" \
  || sips -s format jpeg -s formatOptions 90 "$root/public/opengraph-image.png" --out "$root/public/opengraph-image.jpg" >/dev/null
rm "$root/public/opengraph-image.png"
cp "$root/public/opengraph-image.jpg" "$root/public/twitter-image.jpg"
echo "  public/opengraph-image.jpg, public/twitter-image.jpg  (1200×630)"
shot icon-template.html  180 180 apple-touch-icon.png
shot icon-template.html   32  32 icon-32.png

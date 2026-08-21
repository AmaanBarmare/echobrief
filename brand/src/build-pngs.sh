#!/usr/bin/env bash
# Regenerate brand/logo/png/ from brand/logo/svg/ using headless Chrome.
#   bash brand/src/build-pngs.sh
set -euo pipefail
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SVG="$HERE/../logo/svg"; PNG="$HERE/../logo/png"
mkdir -p "$PNG"

shot() { # <svg> <png> <w,h>
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --screenshot="$PNG/$2" --window-size="$3" \
    "$SVG/$1" >/dev/null 2>&1
  echo "  $2"
}

echo "Lockups (376x144 — 2x the 188x72 artboard):"
for v in light dark mono-black mono-white; do
  shot "echobrief-lockup-$v.svg" "echobrief-lockup-$v.png" 376,144
done

echo "Mark:"
for v in "" -dark -mono-black -mono-white; do
  shot "echobrief-mark$v.svg" "echobrief-mark$v-512.png" 512,512
done

echo "App icon:"
for s in 1024 512 256 128 64 32; do
  shot echobrief-icon.svg "echobrief-icon-$s.png" "$s,$s"
done

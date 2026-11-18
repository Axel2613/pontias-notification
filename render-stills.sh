#!/bin/bash
# Usage: ./render-stills.sh 10 60 120 ...
cd "$(dirname "$0")"
for f in "$@"; do
  npx remotion still src/index.ts PontiasNotification out/still_$f.png --frame=$f \
    --browser-executable=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell \
    --gl=swangle --log=error
done

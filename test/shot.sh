#!/bin/zsh
# Usage (on the Mac): shot.sh <dir-with-repo-copy> <out.png> <width> <height> [query]
# PAGE=phone renders a true 390 px viewport in an iframe (crop the shot to 390 wide).
# Serves the repo copy over http (the card uses history.pushState, which file:// URLs refuse).
PORT=${PORT:-8765}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/test/harness.html"; then
  (cd "$1" && python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &)
  sleep 1
fi
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --run-all-compositor-stages-before-draw --force-device-scale-factor=${SCALE:-1} \
  --screenshot="$2" --window-size="$3,$4" --virtual-time-budget=3000 \
  "http://127.0.0.1:$PORT/test/${PAGE:-harness}.html${5:+?$5}" 2>/dev/null

#!/bin/bash
# launch-linkedin-chrome.sh — a SECOND CDP Chrome, for LinkedIn work only.
#
# WHY A SEPARATE PROFILE
# The apply browser on 9444 (.apply-chrome-profile) holds the employer-portal
# logins — Workday, Oracle, SuccessFactors. It has never been logged into
# LinkedIn, and an Easy Apply sweep once stopped dead because of it.
# Logging LinkedIn into that same profile would put your LinkedIn session in the
# same browser that agents drive across two dozen employer forms.
#
# So: its own port, its own profile directory. You log into LinkedIn here ONCE
# and the session persists. Nothing else uses this profile.
PORT=9555
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.linkedin-chrome-profile"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if curl -s -m 3 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "already running on $PORT"
  curl -s -m 3 "http://127.0.0.1:$PORT/json/version" | head -2
  exit 0
fi

mkdir -p "$DIR"
"$CHROME" \
  --remote-debugging-port=$PORT \
  --user-data-dir="$DIR" \
  --no-first-run \
  --no-default-browser-check \
  "https://www.linkedin.com/login" \
  >/dev/null 2>&1 &

for i in $(seq 1 20); do
  sleep 1
  if curl -s -m 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
    echo "LinkedIn Chrome up on port $PORT"
    echo "profile: $DIR"
    echo "Log into LinkedIn in the window that just opened. The session persists."
    exit 0
  fi
done
echo "did not come up on $PORT"
exit 1

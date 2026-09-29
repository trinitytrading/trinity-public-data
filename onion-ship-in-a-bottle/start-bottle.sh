#!/bin/sh
cd "$(dirname "$0")"
echo "Open http://127.0.0.1:8789/ in Phantom or Solflare."
python3 -m http.server 8789

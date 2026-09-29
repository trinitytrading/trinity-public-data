@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:8789/ in Phantom or Solflare.
python -m http.server 8789

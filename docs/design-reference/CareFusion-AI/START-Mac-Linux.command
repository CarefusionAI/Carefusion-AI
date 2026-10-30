#!/bin/bash
cd "$(dirname "$0")/site"
echo "Starting CareFusion AI at http://localhost:8080 (press Ctrl+C to stop)"
( sleep 1; open http://localhost:8080/index.html 2>/dev/null || xdg-open http://localhost:8080/index.html ) &
python3 -m http.server 8080

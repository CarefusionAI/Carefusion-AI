@echo off
cd /d "%~dp0site"
echo Starting CareFusion AI at http://localhost:8080 ... (close this window to stop)
start "" http://localhost:8080/index.html
python -m http.server 8080 || py -m http.server 8080
pause

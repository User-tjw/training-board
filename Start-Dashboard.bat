@echo off
echo Training Board wird gestartet...
echo Oeffne http://localhost:8765 im Browser
cd /d "%~dp0"
start http://localhost:8765
python -m http.server 8765
pause

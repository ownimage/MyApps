@echo off
REM Launch the PhoneButtons server (Flask + Socket.IO) that serves the app and
REM replays keystrokes on this PC. Run from anywhere; paths are relative to this
REM file. On the first run it installs the server's Python dependencies if they
REM are missing.
REM
REM It STOPS any server already running on port 5000 first (a leftover instance
REM keeps the port and can be serving stale code, which looks like "This site
REM can't be reached").
REM
REM By default it ALSO publishes the server through a Cloudflare QUICK TUNNEL (a
REM real, trusted https URL — no certificate to install) and shows that URL as a
REM QR code to scan. Needs `cloudflared` installed; without it the server still
REM runs and it tells you what to install.
REM   PhoneButtonServer.cmd --no-tunnel          (no tunnel, local only)
REM   PhoneButtonServer.cmd --qr https://host    (QR for an address you already have)
REM   PhoneButtonServer.cmd --no-qr              (start no browser page at all)
setlocal
cd /d "%~dp0"

set "PY=py -3.13"

REM Stop any server already listening on port 5000.
echo Stopping any existing PhoneButtons server on port 5000 ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique; if ($pids) { foreach ($p in $pids) { Write-Host ('        killing PID ' + $p); Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } else { Write-Host '        nothing was listening' }"
echo Waiting for the port to be released ...
ping -n 3 127.0.0.1 >nul

REM Install the server deps if the key modules are missing.
%PY% -c "import win32gui, psutil, PIL, flask, flask_socketio" 1>nul 2>nul
if errorlevel 1 (
  echo Installing PhoneButtons server dependencies ^(first run^)...
  %PY% -m pip install -r "server\requirements.txt"
  if errorlevel 1 (
    echo.
    echo Failed to install the dependencies. Check your Python / pip setup.
    pause
    exit /b 1
  )
)

REM Tunnel + QR by default, unless the user chose a tunnel/QR option themselves.
set "TUNNEL=--tunnel"
echo %* | findstr /i /c:"--tunnel" /c:"--no-tunnel" /c:"--qr" >nul
if not errorlevel 1 set "TUNNEL="

%PY% "server\app.py" %TUNNEL% %* --debug-keys
endlocal

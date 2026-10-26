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
REM The Cloudflare tunnel is OFF by default - nothing is published unless asked:
REM   StartRemoteHIDServer.cmd --tunnel           publish this server (QR shown)
REM   StartRemoteHIDServer.cmd --qr URL           QR for an address you already have
REM   StartRemoteHIDServer.cmd --no-qr            start no browser page at all
REM
REM If the mouse is on THIS PC too, add --mouser: the server then starts
REM mouser-capture.exe with the local autoconfig (UDP straight to this server) and
REM the app's "Manage mouser-capture" page picks it up without a QR scan.
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

REM The tunnel is opt-in: a plain start is local-only (nothing on the internet).
%PY% "server\app.py" %* --debug-keys
endlocal

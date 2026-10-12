@echo off
REM Launch the PhoneButtons server (Flask + Socket.IO) that serves the app and
REM replays keystrokes on this PC. Run from anywhere; paths are relative to this
REM file. On the first run it installs the server's Python dependencies if they
REM are missing. Pass server args through, e.g. `PhoneButtonServer.cmd --no-qr`.
setlocal
cd /d "%~dp0"

set "PY=py -3.13"

REM Install the server deps if the key modules are missing.
%PY% -c "import win32gui, psutil, PIL, flask, flask_socketio" 1>nul 2>nul
if errorlevel 1 (
  echo Installing PhoneButtons server dependencies ^(first run^)...
  %PY% -m pip install -r "PhoneButtons\server\requirements.txt"
  if errorlevel 1 (
    echo.
    echo Failed to install the dependencies. Check your Python / pip setup.
    pause
    exit /b 1
  )
)

%PY% "PhoneButtons\server\app.py" %*
endlocal

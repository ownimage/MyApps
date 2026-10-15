@echo off
REM Launch the PhoneButtons server (Flask + Socket.IO) that serves the app and
REM replays keystrokes on this PC. Run from anywhere; paths are relative to this
REM file. On the first run it installs the server's Python dependencies if they
REM are missing.
REM
REM HTTPS IS THE DEFAULT: it starts an AD-HOC self-signed HTTPS server (needs the
REM `cryptography` package). Override with:
REM   PhoneButtonServer.cmd --no-tls                       (plain HTTP)
REM   PhoneButtonServer.cmd --cert server.crt --key server.key
REM NOTE a self-signed cert shows a browser warning and is NOT a secure context,
REM so the camera "Scan QR" stays blocked until the cert is trusted by the device.
REM Other args are passed through, e.g. --no-qr.
setlocal
cd /d "%~dp0"

set "PY=py -3.13"

REM Install the server deps if the key modules are missing.
%PY% -c "import win32gui, psutil, PIL, flask, flask_socketio, cryptography" 1>nul 2>nul
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

REM Default to ad-hoc HTTPS unless a TLS choice was given (--no-tls opts out).
set "TLS=--adhoc"
echo %* | findstr /i /c:"--adhoc" /c:"--cert" /c:"--key" /c:"--no-tls" >nul
if not errorlevel 1 set "TLS="

%PY% "PhoneButtons\server\app.py" %TLS% %*
endlocal

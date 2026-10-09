@echo off
REM Launch the PhoneButtons server (Flask + Socket.IO) that serves the app and
REM replays keystrokes on this PC. Run from anywhere; paths are relative to this
REM file. Pass server args through, e.g. `PhoneButtonServer.cmd --no-qr`.
cd /d "%~dp0"
py -3.13 "PhoneButtons\server\app.py" %*

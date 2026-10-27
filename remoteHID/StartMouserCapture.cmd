@echo off
REM Launch the mouser-capture CONTROL PANEL on THIS PC (the one with the mouse).
REM Run from anywhere; paths are relative to this file.
REM
REM The panel is a small management socket plus a QR page:
REM   * it prints a "panel:" line with a loopback address and a token
REM   * open that address to see the QR, then scan it with PhoneButtons,
REM     Manage mouser-capture (or paste the address there instead)
REM
REM Tunnel is OFF by default (nothing is published to the internet):
REM   StartMouserCapture.cmd --tunnel              publish through Cloudflare
REM   StartMouserCapture.cmd --public-url URL      a named tunnel you already run
REM   StartMouserCapture.cmd --simulate            demo the panel, no driver
REM
REM To configure the capture for THIS box automatically, start the server with
REM --mouser instead:  StartRemoteHIDServer.cmd --mouser
REM
REM Keys: Q or Ctrl+C quits. Ctrl+Alt+Shift+Q disarms the filter immediately.
setlocal
cd /d "%~dp0"

set "EXE=Mouser\out\mouser-capture.exe"
if not exist "%EXE%" (
  echo mouser-capture.exe is not built yet.
  echo.
  echo   powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Mouser\build.ps1"
  echo.
  pause
  exit /b 1
)

REM Stop a leftover panel on the default port: it would hold the port and the
REM settings file, so this start would fail with a confusing "address in use".
echo Stopping any existing mouser-capture panel on port 7802 ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = (Get-NetTCPConnection -LocalPort 7802 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique; if ($pids) { foreach ($p in $pids) { Write-Host ('        killing PID ' + $p); Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } else { Write-Host '        nothing was listening' }"
ping -n 2 127.0.0.1 >nul

"%EXE%" --ui %*
endlocal

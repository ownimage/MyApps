@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo  MyApps - clean test server start (BACKGROUND)
echo ==========================================================

echo Stopping anything listening on ports 8080 and 8081 ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = (Get-NetTCPConnection -LocalPort 8080,8081 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique; if ($pids) { foreach ($p in $pids) { Write-Host ('        killing PID ' + $p); Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } else { Write-Host '        nothing was listening' }"

echo Waiting for the ports to be released ...
ping -n 3 127.0.0.1 >nul

echo Clearing the Vite dependency cache (node_modules\.vite) ...
if exist "node_modules\.vite" (
  rmdir /s /q "node_modules\.vite" 2>nul
  if exist "node_modules\.vite" (
    ping -n 2 127.0.0.1 >nul
    rmdir /s /q "node_modules\.vite" 2>nul
  )
  if exist "node_modules\.vite" echo         WARNING: could not fully remove node_modules\.vite - a process may still hold it
)

set "LOG=%TEMP%\myapps-serve.log"
set "ERRLOG=%TEMP%\myapps-serve.err.log"

echo Starting the test servers in the BACKGROUND (hidden; log: %LOG%) ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'node' -ArgumentList 'tests/serve-tests.mjs' -WorkingDirectory '%CD%' -WindowStyle Hidden -RedirectStandardOutput '%LOG%' -RedirectStandardError '%ERRLOG%'"

echo Waiting for BOTH ports to accept a connection ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$up=$false; for ($i=0; $i -lt 60; $i++) { $a=$false; $b=$false; try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8080); $a=$true; $c.Close() } catch {}; try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8081); $b=$true; $c.Close() } catch {}; if ($a -and $b) { $up=$true; break }; Start-Sleep -Milliseconds 500 }; if ($up) { exit 0 } else { exit 1 }"

if errorlevel 1 goto failed

echo.
echo ==========================================================
echo  READY - both servers are running in the BACKGROUND
echo ==========================================================
echo     root origin : http://localhost:8080/
echo     sub-path    : http://localhost:8081/PlanMyDay/
echo.
echo  This window has finished; the servers keep running.
echo  Run the regression in this window (they are reused via EXTERNAL_SERVERS):
echo      set EXTERNAL_SERVERS=1
echo      .\node_modules\.bin\playwright.cmd test --last-failed --retries=0
echo.
echo  To stop them: re-run this script (it kills them first), or:
echo      powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080,8081 -State Listen ^| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
echo.
endlocal
exit /b 0

:failed
echo.
echo ==========================================================
echo  ERROR - the servers did NOT come up in time
echo ==========================================================
if exist "%LOG%" powershell -NoProfile -Command "Write-Host '--- log (last 25 lines) ---'; Get-Content '%LOG%' -Tail 25"
if exist "%ERRLOG%" powershell -NoProfile -Command "Write-Host '--- err (last 25 lines) ---'; Get-Content '%ERRLOG%' -Tail 25"
endlocal
exit /b 1

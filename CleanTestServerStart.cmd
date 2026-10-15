@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo  MyApps - clean test server start
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

echo Starting the test server (Ctrl+C to stop) ...
echo     root origin : http://localhost:8080/
echo     sub-path    : http://localhost:8081/PlanMyDay/
echo.

node "tests\serve-tests.mjs"

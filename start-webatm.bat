@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-webatm.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo Script encountered an error.
)
pause

@echo off
setlocal enabledelayedexpansion

:: Get the directory of the batch script (without trailing backslash)
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo ===================================================
echo   Starting FTS Server and WebATM Automatic Runner  
echo ===================================================
echo.
echo Active Directory: %BASE_DIR%
echo.

:: Check if virtual environment exists
if not exist "%BASE_DIR%\venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment python.exe not found at:
    echo         "%BASE_DIR%\venv\Scripts\python.exe"
    echo Please make sure the venv is set up correctly in the workspace.
    pause
    exit /b 1
)

echo [1/3] Launching BlueSky Simulation Server (Headless)...
powershell -WindowStyle Hidden -Command ^
"Start-Process '%BASE_DIR%\venv\Scripts\python.exe' ^
-WorkingDirectory '%BASE_DIR%\FTS Server' ^
-ArgumentList 'BlueSky.py --headless' ^
-WindowStyle Hidden"

echo Waiting 10 seconds for BlueSky to initialize...
powershell -Command "Start-Sleep -Seconds 10"

echo [2/3] Launching WebATM Interface Server...
powershell -WindowStyle Hidden -Command ^
"Start-Process '%BASE_DIR%\venv\Scripts\python.exe' ^
-WorkingDirectory '%BASE_DIR%' ^
-ArgumentList 'WebATM.py' ^
-WindowStyle Hidden"

echo Waiting 5 seconds for WebATM to start...
powershell -Command "Start-Sleep -Seconds 5"

echo [3/3] Opening Web Interface in default browser...
start http://localhost:8082

echo.
echo ===================================================
echo   System successfully started!
echo   To stop all services, run: stop-webatm.bat
echo ===================================================
powershell -Command "Start-Sleep -Seconds 3"
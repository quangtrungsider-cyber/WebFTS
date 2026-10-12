@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Stopping FTS Server and WebATM Services...
echo ===================================================
echo.

:: Run powershell logic to find and kill the processes
powershell -Command ^
"$stopped = $false; ^
Write-Host 'Searching for background python.exe instances...' -ForegroundColor Cyan; ^
$procs = Get-CimInstance Win32_Process -Filter ""Name = 'python.exe' or Name = 'pythonw.exe'""; ^
foreach ($p in $procs) { ^
    if ($p.CommandLine -like '*WebATM.py*' -or $p.CommandLine -like '*BlueSky.py*') { ^
        Write-Host ""Terminating process ID $($p.ProcessId): $($p.Name)"" -ForegroundColor Yellow; ^
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; ^
        $stopped = $true; ^
    } ^
} ^
Write-Host 'Checking ports 8082, 11000, 11001, 4000...' -ForegroundColor Cyan; ^
$ports = @(8082, 11000, 11001, 4000); ^
foreach ($port in $ports) { ^
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; ^
    if ($connections) { ^
        foreach ($conn in $connections) { ^
            $procId = $conn.OwningProcess; ^
            if ($procId) { ^
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue; ^
                if ($proc) { ^
                    Write-Host ""Terminating process $($proc.Name) (PID: $procId) holding port $port..."" -ForegroundColor Yellow; ^
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue; ^
                    $stopped = $true; ^
                } ^
            } ^
        } ^
    } ^
} ^
if (-not $stopped) { ^
    Write-Host 'No running WebATM or BlueSky services were found.' -ForegroundColor Green; ^
} else { ^
    Write-Host 'All services stopped successfully.' -ForegroundColor Green; ^
}"

echo.
echo ===================================================
echo   Done
echo ===================================================
powershell -Command "Start-Sleep -Seconds 3"

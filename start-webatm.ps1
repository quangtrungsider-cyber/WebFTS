$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $baseDir

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Starting FTS Server and WebATM Automatic Runner  " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Active Directory: $baseDir"

# Determine Python path
$py = Join-Path $baseDir ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    $py = "D:\Python314\python.exe"
}
if (-not (Test-Path $py)) {
    $py = "python.exe"
}
Write-Host "Using Python: $py"

$logsDir = Join-Path $baseDir "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

# 1. Cloudflare Tunnel (exposes https://fts.vatmfts.com publicly)
Write-Host "[1/4] Checking Cloudflare Tunnel (cloudflared)..." -ForegroundColor Yellow
$cfProc = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($cfProc) {
    Write-Host "      cloudflared is already running (PID $($cfProc.Id))." -ForegroundColor Green
} else {
    $cfExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
    $cfConfig = "C:\Users\trunglq\.cloudflared\config.yml"
    if ((Test-Path $cfExe) -and (Test-Path $cfConfig)) {
        Start-Process -FilePath $cfExe -ArgumentList "tunnel", "--config", $cfConfig, "run" -WindowStyle Hidden
        Write-Host "      cloudflared started -- https://fts.vatmfts.com should be reachable shortly." -ForegroundColor Green
    } else {
        Write-Host "      cloudflared.exe or config.yml not found -- public URL (fts.vatmfts.com) will NOT work." -ForegroundColor Red
        Write-Host "      Expected: $cfExe" -ForegroundColor Red
        Write-Host "      Expected: $cfConfig" -ForegroundColor Red
    }
}

# 2. BlueSky Simulation Server
Write-Host "[2/4] Launching BlueSky Simulation Server (Headless)..." -ForegroundColor Yellow
$bsConn = Get-NetTCPConnection -LocalPort 11000 -ErrorAction SilentlyContinue
if ($bsConn) {
    Write-Host "      BlueSky is already running on port 11000." -ForegroundColor Green
} else {
    $bsLog = Join-Path $logsDir "bluesky.log"
    $bsErr = Join-Path $logsDir "bluesky_err.log"
    $bsDir = Join-Path $baseDir "FTS Server"
    Start-Process -FilePath $py -ArgumentList "-X utf8 BlueSky.py --headless" -WorkingDirectory $bsDir -RedirectStandardOutput $bsLog -RedirectStandardError $bsErr -WindowStyle Hidden
}

# 3. WebATM Interface Server
Write-Host "[3/4] Launching WebATM Interface Server..." -ForegroundColor Yellow
$atmConn = Get-NetTCPConnection -LocalPort 8082 -ErrorAction SilentlyContinue
if ($atmConn) {
    Write-Host "      WebATM is already running on port 8082." -ForegroundColor Green
} else {
    $atmLog = Join-Path $logsDir "webatm.log"
    $atmErr = Join-Path $logsDir "webatm_err.log"
    Start-Process -FilePath $py -ArgumentList "-X utf8 WebATM.py" -WorkingDirectory $baseDir -RedirectStandardOutput $atmLog -RedirectStandardError $atmErr -WindowStyle Hidden
}

# 4. FTS Node API Server
Write-Host "[4/4] Launching FTS Node API Server (Aerodrome Layout)..." -ForegroundColor Yellow
$nodeConn = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
if ($nodeConn) {
    Write-Host "      Node API is already running on port 4000." -ForegroundColor Green
} else {
    $nodeLog = Join-Path $logsDir "node_api.log"
    $ftsDir = Join-Path $baseDir "FTS Server"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start > `"$nodeLog`" 2>&1" -WorkingDirectory $ftsDir -WindowStyle Hidden
}

Write-Host ""
Write-Host "Waiting for WebATM to respond on http://localhost:8082 (up to 30s)..." -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    $conn = Get-NetTCPConnection -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $ok = $true
        break
    }
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8082/" -UseBasicParsing -TimeoutSec 1
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
}

if ($ok) {
    Write-Host "WebATM is UP and ready!" -ForegroundColor Green
    Write-Host "Local URL:  http://localhost:8082" -ForegroundColor Green
    Write-Host "Public URL: https://fts.vatmfts.com" -ForegroundColor Green
    Start-Process "http://localhost:8082"
} else {
    Write-Host "WebATM did not respond within 30s." -ForegroundColor Red
    if (Test-Path "$baseDir\webatm_crash.log") {
        Write-Host ""
        Write-Host "=== Last crash from webatm_crash.log ===" -ForegroundColor Red
        Get-Content "$baseDir\webatm_crash.log" -Tail 20
    }
    $webatmLogFile = Join-Path $logsDir "webatm.log"
    if (Test-Path $webatmLogFile) {
        $logContent = Get-Content $webatmLogFile -Tail 20
        if ($logContent) {
            Write-Host ""
            Write-Host "=== Last entries from logs/webatm.log ===" -ForegroundColor Yellow
            $logContent
        }
    }
    $webatmErrFile = Join-Path $logsDir "webatm_err.log"
    if (Test-Path $webatmErrFile) {
        $errContent = Get-Content $webatmErrFile -Tail 20
        if ($errContent) {
            Write-Host ""
            Write-Host "=== Last errors from logs/webatm_err.log ===" -ForegroundColor Red
            $errContent
        }
    }
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Servers are running in background." -ForegroundColor Cyan
Write-Host "  To stop them, run stop-webatm.bat" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

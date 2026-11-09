param(
  [int]$AppPort = 3000,
  [int]$DbPort = 55432,
  [switch]$SkipBuild,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot ".data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "start-local.log"

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $logFile -Value $line
  if (-not $Quiet) { Write-Host $line }
}

function Test-Port([int]$Port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Wait-Port([int]$Port, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $Port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Test-App {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:$AppPort/login" -UseBasicParsing -TimeoutSec 10
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Stop-Port([int]$Port) {
  $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $connections) { return }
  $processIds = $connections.OwningProcess | Sort-Object -Unique
  foreach ($processId in $processIds) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

Write-Log "Checking SIMPAR local services..."

if (-not (Test-Port $DbPort)) {
  Write-Log "Starting PostgreSQL on port $DbPort..."
  $dbOut = Join-Path $logDir "db.out.log"
  $dbErr = Join-Path $logDir "db.err.log"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run db:start" -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $dbOut -RedirectStandardError $dbErr | Out-Null
  if (-not (Wait-Port $DbPort 90)) {
    Write-Log "ERROR: PostgreSQL did not start on port $DbPort."
    exit 1
  }
  Write-Log "PostgreSQL is listening on port $DbPort."
} else {
  Write-Log "PostgreSQL is already listening on port $DbPort."
}

$distDir = Join-Path $projectRoot ".next-local"
if (-not (Test-Path $distDir) -and -not $SkipBuild) {
  Write-Log "Build folder is missing. Running production build..."
  $env:NEXT_DIST_DIR = ".next-local"
  $buildLog = Join-Path $logDir "build.log"
  & npm run build 2>&1 | Tee-Object -FilePath $buildLog -Append
  if ($LASTEXITCODE -ne 0) {
    Write-Log "ERROR: Production build failed."
    exit 1
  }
  Write-Log "Production build completed."
}

if (Test-Port $AppPort) {
  if (Test-App) {
    Write-Log "SIMPAR is already healthy at http://localhost:$AppPort."
    exit 0
  }
  Write-Log "Port $AppPort is listening but the health check failed. Restarting the app..."
  Stop-Port $AppPort
}

Write-Log "Starting Next.js on port $AppPort..."
$env:NEXT_DIST_DIR = ".next-local"
$appOut = Join-Path $logDir "app.out.log"
$appErr = Join-Path $logDir "app.err.log"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start" -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $appOut -RedirectStandardError $appErr | Out-Null

if (-not (Wait-Port $AppPort 90)) {
  Write-Log "ERROR: Next.js did not start on port $AppPort."
  exit 1
}

$healthy = $false
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if (Test-App) {
    $healthy = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $healthy) {
  Write-Log "ERROR: SIMPAR health check failed at http://localhost:$AppPort/login."
  exit 1
}

Write-Log "SIMPAR is healthy at http://localhost:$AppPort."

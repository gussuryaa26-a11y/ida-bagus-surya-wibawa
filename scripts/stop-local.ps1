param(
  [int]$AppPort = 3000,
  [int]$DbPort = 55432
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot ".data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "start-local.log"

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $logFile -Value $line
  Write-Host $line
}

function Test-Port([int]$Port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
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

if (Test-Port $AppPort) {
  Write-Log "Stopping SIMPAR app on port $AppPort..."
  Stop-Port $AppPort
}

if (Test-Port $DbPort) {
  $pgCtl = Join-Path $projectRoot "node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe"
  $dataDir = Join-Path $projectRoot ".data\pg"
  if ((Test-Path $pgCtl) -and (Test-Path $dataDir)) {
    Write-Log "Stopping PostgreSQL gracefully..."
    try {
      & $pgCtl -D $dataDir stop -m fast | Out-Null
      Start-Sleep -Seconds 3
    } catch {
      Write-Log "Graceful PostgreSQL stop failed; forcing port shutdown."
    }
  }
  if (Test-Port $DbPort) {
    Write-Log "Stopping PostgreSQL on port $DbPort..."
    Stop-Port $DbPort
  }
}

Write-Log "SIMPAR local services stopped."

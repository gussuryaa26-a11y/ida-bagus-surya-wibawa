param(
  [int]$IntervalSeconds = 30
)

$ErrorActionPreference = "SilentlyContinue"
$projectRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot "start-local.ps1"
$logDir = Join-Path $projectRoot ".data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "keep-alive.log"

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $logFile -Value $line
}

$mutex = New-Object System.Threading.Mutex($false, "Local\SIMPARLocalKeepAlive")
if (-not $mutex.WaitOne(0)) {
  exit 0
}

try {
  Write-Log "Keep-alive started (interval ${IntervalSeconds}s)."
  while ($true) {
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript -Quiet
    } catch {
      Write-Log "start-local.ps1 failed: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds $IntervalSeconds
  }
} finally {
  Write-Log "Keep-alive stopped."
  $mutex.ReleaseMutex()
}

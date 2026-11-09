param(
  [int]$AppPort = 3000,
  [int]$DbPort = 55432
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$stopScript = Join-Path $PSScriptRoot "stop-local.ps1"
$keepAliveScript = Join-Path $PSScriptRoot "keep-local-alive.ps1"
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "SIMPAR Local.lnk"

if (-not (Test-Path $keepAliveScript)) {
  throw "keep-local-alive.ps1 not found at $keepAliveScript"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$keepAliveScript`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "SIMPAR local server keep-alive"
$shortcut.Save()
Write-Host "Startup shortcut installed: $shortcutPath"

Write-Host "Stopping current local services so they can be restarted detached..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript
Start-Sleep -Seconds 1

$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$keepAliveScript`""
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command }
if ($result.ReturnValue -ne 0) {
  throw "Failed to start keep-alive process (WMI return code $($result.ReturnValue))."
}
Write-Host "Keep-alive started detached (PID $($result.ProcessId))."

Write-Host "Waiting for SIMPAR to become healthy..."
$healthy = $false
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:$AppPort/login" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
      $healthy = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $healthy) {
  throw "SIMPAR did not become healthy within 120 seconds. Check .data\logs."
}

Write-Host "SIMPAR is healthy at http://localhost:$AppPort."
Write-Host "Autostart installed. The keep-alive checks every 60 seconds and restarts services if needed."

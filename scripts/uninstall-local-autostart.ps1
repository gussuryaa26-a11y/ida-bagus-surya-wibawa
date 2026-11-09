$ErrorActionPreference = "Stop"
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "SIMPAR Local.lnk"

if (Test-Path $shortcutPath) {
  Remove-Item -Force $shortcutPath
  Write-Host "Startup shortcut removed: $shortcutPath"
} else {
  Write-Host "Startup shortcut not found."
}

$keepAliveProcesses = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like "*keep-local-alive.ps1*" }

foreach ($process in $keepAliveProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host "Stopped keep-alive process PID $($process.ProcessId)."
}

Write-Host "Autostart removed. Local services are left running; use stop-local.ps1 to stop them."

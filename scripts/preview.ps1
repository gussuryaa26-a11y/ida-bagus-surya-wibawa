# Buka SIMPAR localhost di Google Chrome.
# Jika dev server belum jalan, jalankan `npm run dev` di jendela baru lebih dulu.

param(
  [string]$Url = "http://localhost:3000",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$chromePaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
  Write-Host "[preview] Google Chrome tidak ditemukan. Membuka browser default..." -ForegroundColor Yellow
  Start-Process $Url
  exit 0
}

function Test-Port($port) {
  try {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop)
  } catch {
    return $false
  }
}

if (-not (Test-Port $Port)) {
  Write-Host "[preview] Dev server belum berjalan, menjalankan 'npm run dev'..." -ForegroundColor Cyan
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -WorkingDirectory (Split-Path $PSScriptRoot -Parent)

  $deadline = (Get-Date).AddSeconds(90)
  while (-not (Test-Port $Port)) {
    if ((Get-Date) -gt $deadline) {
      Write-Host "[preview] Timeout menunggu dev server di port $Port." -ForegroundColor Red
      exit 1
    }
    Start-Sleep -Milliseconds 750
  }
}

Write-Host "[preview] Membuka $Url di Google Chrome..." -ForegroundColor Green
Start-Process -FilePath $chrome -ArgumentList "--new-window", $Url

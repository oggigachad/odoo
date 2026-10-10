# Keeps the Skyline backend running on this PC: starts Docker Desktop if needed, brings the stack up,
# publishes it with a Cloudflare quick tunnel and restarts the tunnel if it ever drops.
# Registered as a Windows logon task by deploy/install-autostart.ps1. The public address is written to
# deploy/current-api-url.txt every time it changes. Log: deploy/autostart.log
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "autostart.log"
$urlFile = Join-Path $PSScriptRoot "current-api-url.txt"
$tunnelLog = Join-Path $PSScriptRoot "tunnel.log"
function Log($m) { "$(Get-Date -Format 's') $m" | Add-Content $log }

Log "autostart begins"

# 1. Docker engine
function Test-Docker { docker info *> $null; return ($LASTEXITCODE -eq 0) }
if (-not (Test-Docker)) {
  $exe = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"
  if (Test-Path $exe) { Start-Process $exe; Log "started Docker Desktop" } else { Log "Docker Desktop not found at $exe" }
  for ($i = 0; $i -lt 90 -and -not (Test-Docker); $i++) { Start-Sleep 5 }
}
if (-not (Test-Docker)) { Log "Docker engine never became ready; giving up"; exit 1 }

# 2. The stack (containers also restart by themselves; this makes sure they exist and are current)
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d 2>&1 | Add-Content $log
for ($i = 0; $i -lt 60; $i++) {
  try { if ((Invoke-WebRequest -Uri "http://127.0.0.1:8001/api/v1/stats" -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200) { break } } catch { }
  Start-Sleep 3
}
Log "API answers locally"

# 3. Tunnel supervisor: keep one tunnel alive, record its address
function Start-Tunnel {
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-Item $tunnelLog -ErrorAction SilentlyContinue
  $p = Start-Process cloudflared -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:8001" -RedirectStandardError $tunnelLog -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep 2
    $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $u = $m.Matches[0].Value; Set-Content $urlFile $u; Log "tunnel up: $u"; return $p }
  }
  Log "tunnel did not report an address"; return $p
}

$tunnel = Start-Tunnel
while ($true) {
  Start-Sleep 20
  if ($tunnel.HasExited) { Log "tunnel exited, restarting"; $tunnel = Start-Tunnel }
  # make sure the containers are still up (Docker Desktop restarts, updates, ...)
  if (-not (Test-Docker)) { Log "docker engine down, waiting"; continue }
  $running = (docker ps --filter "name=skyline-api-1" --filter "status=running" -q)
  if (-not $running) { Log "api container not running, starting stack"; docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d 2>&1 | Add-Content $log }
}

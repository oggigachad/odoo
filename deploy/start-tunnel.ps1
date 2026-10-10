# Start the production stack on this PC and publish it with a Cloudflare quick tunnel.
# Docker Desktop must be running. Prints the public https address (it changes each time the tunnel restarts).
Set-Location $PSScriptRoot
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
$log = Join-Path $PSScriptRoot "tunnel.log"
Start-Process cloudflared -ArgumentList "tunnel","--no-autoupdate","--url","http://127.0.0.1:8001" -RedirectStandardError $log -WindowStyle Hidden
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep 2
  $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($m) { Write-Host "API address: $($m.Matches[0].Value)"; Write-Host "If it differs from the one built into the site, rebuild: cd frontend; `$env:VITE_API_URL='<address>'; npm run build, then upload frontend/dist to Netlify."; break }
}

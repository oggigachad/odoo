# Builds the website against the CURRENT public API address (deploy/current-api-url.txt) and zips it for Netlify.
# Upload the zip's contents by dragging the folder frontend\dist onto Netlify > Deploys, or set VITE_API_URL there and redeploy.
$url = (Get-Content (Join-Path $PSScriptRoot "current-api-url.txt")).Trim()
Write-Host "building the site for API $url"
Push-Location (Join-Path $PSScriptRoot "..\frontend")
$env:VITE_API_URL = $url
npm run build
Pop-Location
$zip = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads\skyline-site-for-netlify.zip"
Remove-Item $zip -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $PSScriptRoot "..\frontend\dist\*") -DestinationPath $zip
Write-Host "ready: $zip  (and the folder frontend\dist)"

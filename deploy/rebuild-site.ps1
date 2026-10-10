# Builds the website against the CURRENT public API address (deploy/current-api-url.txt) and zips it for Netlify.
# Upload by dragging the folder frontend\dist (or the zip's contents) onto Netlify > Deploys, or set VITE_API_URL there and redeploy.
$root = Split-Path $PSScriptRoot -Parent
$url = (Get-Content (Join-Path $PSScriptRoot "current-api-url.txt")).Trim()
Write-Host "building the site for API $url"
Push-Location (Join-Path $root "frontend")
$env:VITE_API_URL = $url
npm run build
Pop-Location

# the sign-in video is 72 MB at 4K; re-encode big videos in the build output so the upload is small and reliable
$dist = Join-Path $root "frontend\dist"
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
  Get-ChildItem (Join-Path $dist "*.mp4") | Where-Object { $_.Length -gt 20MB } | ForEach-Object {
    $tmp = "$($_.FullName).small.mp4"
    ffmpeg -y -v error -i $_.FullName -vf "scale=-2:1080" -c:v libx264 -crf 29 -preset veryfast -an -movflags +faststart $tmp
    if (Test-Path $tmp) { Move-Item $tmp $_.FullName -Force; Write-Host "re-encoded $($_.Name)" }
  }
}

$zip = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads\skyline-site-for-netlify.zip"
Remove-Item $zip -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $dist "*") -DestinationPath $zip
Write-Host "ready: $zip  (and the folder frontend\dist)"

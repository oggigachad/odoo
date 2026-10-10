# Backs up the production database and the uploaded pictures (Windows / Docker Desktop version of backup.sh).
#   powershell -ExecutionPolicy Bypass -File deploy\backup.ps1                  # back up now
#   powershell -ExecutionPolicy Bypass -File deploy\backup.ps1 -Install         # also schedule it every day at 03:00
# Output: %USERPROFILE%\Backups\skyline\db_<time>.sql.gz and media_<time>.zip, kept for 14 days.
# Copy that folder to another disk or cloud drive from time to time: a backup on the same PC dies with the PC.
param([switch]$Install, [string]$Out = (Join-Path $env:USERPROFILE "Backups\skyline"))
$ErrorActionPreference = "Stop"
if ($Install) {
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""
  $trigger = New-ScheduledTaskTrigger -Daily -At 3am
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName "SkylineBackup" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Write-Host "scheduled: SkylineBackup runs every day at 03:00 (or at the next sign-in if the PC was off)"
}
New-Item -ItemType Directory -Force $Out | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmm"
$env:PGPASSWORD = ""
docker exec skyline-postgres-1 sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > /tmp/db.sql.gz'
docker cp skyline-postgres-1:/tmp/db.sql.gz (Join-Path $Out "db_$stamp.sql.gz")
# the MinIO image has no tar, so copy the data folder out and zip it here
$tmp = Join-Path $env:TEMP "skyline-media-$stamp"
docker cp skyline-minio-1:/data $tmp
Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath (Join-Path $Out "media_$stamp.zip") -Force
Remove-Item $tmp -Recurse -Force
Get-ChildItem $Out -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force
$files = Get-ChildItem $Out -File | Where-Object { $_.Name -like "*_$stamp.*" }
$files | ForEach-Object { Write-Host ("{0}  {1:N0} KB" -f $_.FullName, ($_.Length / 1KB)) }

# Registers (or removes with -Remove) the Windows logon task that runs deploy/autostart.ps1 for the current user.
#   powershell -ExecutionPolicy Bypass -File deploy\install-autostart.ps1          # install
#   powershell -ExecutionPolicy Bypass -File deploy\install-autostart.ps1 -Remove  # uninstall
param([switch]$Remove)
$name = "SkylineBackend"
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host "removed $name"; exit 0 }
$script = Join-Path $PSScriptRoot "autostart.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force | Out-Null
Write-Host "installed ${name}: it starts Docker, the stack and the tunnel every time you sign in to Windows"


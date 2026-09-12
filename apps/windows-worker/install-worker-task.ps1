param(
  [Parameter(Mandatory = $true)] [string]$WorkerPath,
  [Parameter(Mandatory = $true)] [ValidatePattern('^https://')] [string]$ControlPlaneUrl,
  [Parameter(Mandatory = $true)] [guid]$DeviceId,
  [Parameter(Mandatory = $true)] [string]$KeyPath,
  [Parameter(Mandatory = $true)] [string]$SecretPath,
  [Parameter(Mandatory = $true)] [string]$StatePath,
  [Parameter(Mandatory = $true)] [string]$ManifestPublicKeyB64,
  [Parameter(Mandatory = $true)] [string]$AllowedRootsJson,
  [Parameter(Mandatory = $true)] [string]$QuarantineRoot,
  [string]$TaskName = 'AI Operations Windows Worker'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $WorkerPath -PathType Leaf)) {
  throw "Worker executable was not found: $WorkerPath"
}
if (-not (Test-Path -LiteralPath $SecretPath -PathType Leaf)) {
  throw "DPAPI worker secret was not found: $SecretPath. Pair the worker before installing the task."
}
$null = $AllowedRootsJson | ConvertFrom-Json

$runnerDirectory = Join-Path $env:ProgramData 'AI-Operations'
New-Item -ItemType Directory -Force -Path $runnerDirectory | Out-Null
$runnerPath = Join-Path $runnerDirectory 'run-worker.ps1'
$runner = @"
`$env:AI_OPERATIONS_CONTROL_PLANE_URL = '$ControlPlaneUrl'
`$env:AI_OPERATIONS_DEVICE_ID = '$DeviceId'
`$env:AI_OPERATIONS_KEY_PATH = '$KeyPath'
`$env:AI_OPERATIONS_SECRET_PATH = '$SecretPath'
`$env:AI_OPERATIONS_STATE_PATH = '$StatePath'
`$env:AI_OPERATIONS_MANIFEST_PUBLIC_KEY_B64 = '$ManifestPublicKeyB64'
`$env:AI_OPERATIONS_ALLOWED_ROOTS_JSON = '$($AllowedRootsJson.Replace("'", "''"))'
`$env:AI_OPERATIONS_QUARANTINE_ROOT = '$QuarantineRoot'
& '$WorkerPath'
"@
Set-Content -LiteralPath $runnerPath -Value $runner -Encoding UTF8

$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
Write-Output "Installed scheduled task '$TaskName'. The worker secret is read from the DPAPI file at $SecretPath and is not placed in the task command line."

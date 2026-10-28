param(
  [ValidateNotNullOrEmpty()] [string]$TaskName = 'AI Operations Windows Worker'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  throw "The worker task '$TaskName' is not installed. Install the worker for this environment first."
}

Start-ScheduledTask -TaskName $TaskName
Write-Output "Started '$TaskName'. Refresh AI Operations after the next heartbeat."

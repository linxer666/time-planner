$ErrorActionPreference = "Stop"

$Port = 5173
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$PortInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($PortInUse) {
  Write-Host ""
  Write-Host "Port $Port is already in use."
  Write-Host "Open http://localhost:$Port directly, or close the other server window first."
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}

$Candidates = @(
  @{ Command = "python"; Args = @() },
  @{ Command = "py"; Args = @("-3") },
  @{ Command = "python3"; Args = @() }
)

foreach ($Candidate in $Candidates) {
  try {
    $VersionArgs = @($Candidate.Args) + @("--version")
    & $Candidate.Command @VersionArgs *> $null

    Write-Host ""
    Write-Host "Server started: http://localhost:$Port"
    Write-Host "Keep this window open. Closing it stops the server."
    Write-Host ""

    $ServerArgs = @($Candidate.Args) + @("-m", "http.server", "$Port", "--bind", "127.0.0.1")
    & $Candidate.Command @ServerArgs
    exit
  } catch {
  }
}

Write-Host ""
Write-Host "Python not found. Install Python 3, or open index.html directly."
Write-Host ""
Read-Host "Press Enter to exit"

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$GhCandidates = @(
  "gh",
  "$env:TEMP\gh-cli\bin\gh.exe",
  "$env:ProgramFiles\GitHub CLI\gh.exe"
)

$Gh = $null
foreach ($Candidate in $GhCandidates) {
  if (Get-Command $Candidate -ErrorAction SilentlyContinue) {
    $Gh = $Candidate
    break
  }
}

if (-not $Gh) {
  Write-Host "Downloading GitHub CLI..."
  $ghDir = Join-Path $env:TEMP "gh-cli"
  New-Item -ItemType Directory -Force -Path $ghDir | Out-Null
  $zip = Join-Path $ghDir "gh.zip"
  Invoke-WebRequest -Uri "https://github.com/cli/cli/releases/download/v2.67.0/gh_2.67.0_windows_amd64.zip" -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $ghDir -Force
  $Gh = Join-Path $ghDir "bin\gh.exe"
}

if (-not (Test-Path ".git")) {
  git init -b main
}

git add -A
$Status = git status --porcelain
if ($Status) {
  git commit -m "deploy: update site"
}

$loggedIn = $true
try {
  & $Gh auth status 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) { $loggedIn = $false }
} catch {
  $loggedIn = $false
}

if (-not $loggedIn) {
  Write-Host ""
  Write-Host "Please login to GitHub in the browser:"
  & $Gh auth login --hostname github.com --git-protocol https --web
}

$RepoName = "time-planner"
$User = (& $Gh api user -q .login)
$Remote = ""
try {
  $Remote = git remote get-url origin 2>$null
} catch {
  $Remote = ""
}

if (-not $Remote) {
  Write-Host ""
  Write-Host "Creating repo $User/$RepoName ..."
  & $Gh repo create $RepoName --public --source=. --remote=origin --push --description "time-planner"
} else {
  Write-Host ""
  Write-Host "Pushing to GitHub..."
  git push -u origin main
}

Write-Host ""
Write-Host "Enabling GitHub Pages..."
& $Gh api -X PUT "repos/$User/$RepoName/pages" -f "build_type=workflow" | Out-Null

$PagesUrl = "https://$User.github.io/$RepoName/"
Write-Host ""
Write-Host "Done!"
Write-Host "Site URL (ready in 1-2 min): $PagesUrl"
Write-Host ""
Write-Host "Run this script again after code changes to update the site."

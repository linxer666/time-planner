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
  Write-Host "正在下载 GitHub CLI..."
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
  git commit -m "部署双线计划台到 GitHub Pages"
}

& $Gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "请先登录 GitHub（会打开浏览器）："
  & $Gh auth login --hostname github.com --git-protocol https --web
}

$RepoName = "time-planner"
$User = (& $Gh api user -q .login)
$Remote = git remote get-url origin 2>$null

if (-not $Remote) {
  Write-Host ""
  Write-Host "正在创建仓库 $User/$RepoName ..."
  & $Gh repo create $RepoName --public --source=. --remote=origin --push --description "双线计划台 - 实习+考公"
} else {
  Write-Host ""
  Write-Host "正在推送到 GitHub..."
  git push -u origin main
}

Write-Host ""
Write-Host "正在开启 GitHub Pages..."
& $Gh api -X PUT "repos/$User/$RepoName/pages" -f "build_type=workflow" | Out-Null

$PagesUrl = "https://$User.github.io/$RepoName/"
Write-Host ""
Write-Host "部署已提交！"
Write-Host "网站地址（约 1-2 分钟后生效）： $PagesUrl"
Write-Host ""
Write-Host "以后改完代码，再运行一次本脚本即可更新网站。"

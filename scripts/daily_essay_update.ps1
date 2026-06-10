# 申论积累每日自动更新
# 用法：
#   .\scripts\daily_essay_update.ps1           # 本地更新 JSON
#   .\scripts\daily_essay_update.ps1 -Push     # 更新后推送到 GitHub（线上站同步）
param(
    [switch]$Push,
    [switch]$Fallback
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("essay-daily-{0}.log" -f (Get-Date -Format "yyyyMMdd"))

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

Write-Log "=== 申论每日更新开始 ==="

if (-not (Test-Path ".env")) {
    Write-Log "错误：未找到 .env，请先 copy .env.example .env 并填入 AI_API_KEY"
    exit 1
}

$pyArgs = @("scripts\essay_pipeline.py", "--daily")
if ($Fallback) { $pyArgs += "--fallback-only" }

python @pyArgs 2>&1 | ForEach-Object { Write-Log $_ }
if ($LASTEXITCODE -ne 0) {
    Write-Log "流水线失败，退出码 $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Log "本地 data/essay_public.json 已更新"

if ($Push) {
    if (-not (Test-Path ".git")) {
        Write-Log "未初始化 git，跳过推送"
        exit 0
    }
    git add data/essay_public.json
    $status = git status --porcelain data/essay_public.json
    if (-not $status) {
        Write-Log "今日无新变化，无需推送"
        exit 0
    }
    $msg = "chore: daily essay update $(Get-Date -Format 'yyyy-MM-dd')"
    git commit -m $msg
    git push
    Write-Log "已推送到远程，GitHub Pages 将自动部署"
}

Write-Log "=== 完成 ==="

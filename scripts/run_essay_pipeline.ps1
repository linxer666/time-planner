# 申论积累流水线
# 用法：
#   .\scripts\run_essay_pipeline.ps1              # 爬取 + AI 提炼
#   .\scripts\run_essay_pipeline.ps1 -Daily      # 每日模式（推荐定时任务用）
#   .\scripts\run_essay_pipeline.ps1 -Fallback   # AI 不可用时，规则兜底
# 每日自动更新：.\scripts\setup_essay_scheduler.ps1
param([switch]$Fallback, [switch]$ExtractOnly, [switch]$Daily)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
Write-Host "=== 申论积累流水线 ===" -ForegroundColor Cyan

$args = @()
if ($ExtractOnly) { $args += "--extract-only" }
if ($Daily) { $args += "--daily" }
if ($Fallback) { $args += "--fallback-only" }

python scripts\essay_pipeline.py @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "=== 完成，前端将读取 data/essay_public.json ===" -ForegroundColor Green

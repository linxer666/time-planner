# 注册 Windows 计划任务：每天 07:00 自动更新申论积累
# 用法：
#   .\scripts\setup_essay_scheduler.ps1              # 仅本地更新
#   .\scripts\setup_essay_scheduler.ps1 -Push      # 更新后自动 git push（线上站每日同步）
param([switch]$Push, [string]$Time = "07:00")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "TimePlanner-EssayDaily"
$ScriptPath = Join-Path $Root "scripts\daily_essay_update.ps1"
$PushFlag = if ($Push) { " -Push" } else { "" }

if (-not (Test-Path $ScriptPath)) {
    Write-Host "找不到 $ScriptPath" -ForegroundColor Red
    exit 1
}

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`"$PushFlag" `
    -WorkingDirectory $Root

$Trigger = New-ScheduledTaskTrigger -Daily -At $Time
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "双线计划台：每日爬取官媒评论并 AI 提炼申论素材" `
    -Force | Out-Null

Write-Host ""
Write-Host "已注册计划任务：$TaskName" -ForegroundColor Green
Write-Host "每天 $Time 运行：$ScriptPath$PushFlag"
Write-Host ""
Write-Host "前提条件："
Write-Host "  1. 本机 $Time 前后需开机（或用「错过时尽快启动」已开启）"
Write-Host "  2. 已配置 .env（AI_API_KEY 等）"
if ($Push) {
    Write-Host "  3. git 已配置远程仓库且可 push"
}
Write-Host ""
Write-Host "手动测试：.\scripts\daily_essay_update.ps1$PushFlag"
Write-Host "查看日志：logs\essay-daily-YYYYMMDD.log"
Write-Host "删除任务：Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
Write-Host ""

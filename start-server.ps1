$ErrorActionPreference = "Stop"

$Port = 5173
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

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
    Write-Host "网站已启动： http://localhost:$Port"
    Write-Host "请保持这个窗口打开，关闭窗口网站就会停止。"
    Write-Host ""

    $ServerArgs = @($Candidate.Args) + @("-m", "http.server", "$Port", "--bind", "127.0.0.1")
    & $Candidate.Command @ServerArgs
    exit
  } catch {
  }
}

Write-Host ""
Write-Host "没有找到 Python，暂时无法一键启动本地服务器。"
Write-Host "请先安装 Python 3，或者直接双击 index.html 试用基础页面。"
Write-Host ""
Read-Host "按回车退出"

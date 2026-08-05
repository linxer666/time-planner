$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WorkersDir = Join-Path $Root "workers"
Set-Location $WorkersDir

$WranglerToml = Join-Path $WorkersDir "wrangler.toml"
$ExampleToml = Join-Path $WorkersDir "wrangler.toml.example"

if (-not (Test-Path $WranglerToml)) {
  if (-not (Test-Path $ExampleToml)) {
    throw "Missing workers/wrangler.toml.example"
  }
  Copy-Item $ExampleToml $WranglerToml
  Write-Host "Created workers/wrangler.toml - check SUPABASE_URL, then run this script again."
  exit 0
}

Write-Host "Deploying Supabase proxy Worker..."
Write-Host "First time: npx wrangler login (browser auth required)"
Write-Host ""

npx --yes wrangler deploy

Write-Host ""
Write-Host "Done. Add the workers.dev URL to supabase-config.js as proxyUrl, then git push."
Write-Host 'Example: proxyUrl: "https://time-planner-supabase.YOUR_CF_USER.workers.dev",'

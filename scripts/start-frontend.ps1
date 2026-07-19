$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FrontendRoot = Join-Path $ProjectRoot "frontend"
$Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $Npm) {
    throw "npm.cmd is not available. Install the current Node.js LTS release first."
}
if (-not (Test-Path (Join-Path $FrontendRoot "node_modules"))) {
    throw "Missing frontend\node_modules. Run .\scripts\bootstrap-frontend.ps1 first."
}

Push-Location $FrontendRoot
try {
    & $Npm.Source run dev
}
finally {
    Pop-Location
}

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FrontendRoot = Join-Path $ProjectRoot "frontend"
$Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $Npm) {
    throw "npm.cmd is not available. Install the current Node.js LTS release, reopen PowerShell, and retry."
}

Push-Location $FrontendRoot
try {
    & $Npm.Source install
    if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed (exit code $LASTEXITCODE)." }
}
finally {
    Pop-Location
}

Write-Host "Frontend environment is ready: $FrontendRoot"

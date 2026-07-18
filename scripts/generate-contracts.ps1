$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$FrontendRoot = Join-Path $ProjectRoot "frontend"

if (-not (Test-Path $VenvPython)) {
    throw "Missing .venv. Run .\scripts\bootstrap.ps1 first."
}

Push-Location $ProjectRoot
try {
    & $VenvPython -B .\scripts\export_contracts.py
    if ($LASTEXITCODE -ne 0) { throw "Contract export failed (exit code $LASTEXITCODE)." }

    Push-Location $FrontendRoot
    try {
        & npm.cmd run generate:types
        if ($LASTEXITCODE -ne 0) { throw "TypeScript contract generation failed (exit code $LASTEXITCODE)." }
    }
    finally {
        Pop-Location
    }

    Write-Host "Pydantic, JSON Schema, OpenAPI and TypeScript contracts are synchronized."
}
finally {
    Pop-Location
}

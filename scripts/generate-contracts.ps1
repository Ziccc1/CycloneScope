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
        $Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        $Node = Get-Command node -ErrorAction SilentlyContinue
        if ($Npm) {
            & $Npm.Source run generate:types
        }
        elseif ($Node -and (Test-Path ".\node_modules\openapi-typescript\bin\cli.js")) {
            & $Node.Source .\node_modules\openapi-typescript\bin\cli.js `
                ..\schemas\generated\openapi.json -o .\src\types\api.generated.ts
        }
        else {
            throw "Missing frontend tooling. Install Node.js, then run .\scripts\bootstrap-frontend.ps1."
        }
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

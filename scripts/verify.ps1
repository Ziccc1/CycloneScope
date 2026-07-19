$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$TestRunRoot = Join-Path $ProjectRoot ".test-runs"
$TestTemp = Join-Path $TestRunRoot ([guid]::NewGuid().ToString("N"))
$PytestBaseTemp = Join-Path $TestTemp "pytest"

if (-not (Test-Path $VenvPython)) {
    throw "Missing .venv. Run .\scripts\bootstrap.ps1 first."
}

New-Item -ItemType Directory -Force -Path $TestTemp | Out-Null
$PreviousTemp = $env:TEMP
$PreviousTmp = $env:TMP
$PreviousTmpDir = $env:TMPDIR
$env:TEMP = $TestTemp
$env:TMP = $TestTemp
$env:TMPDIR = $TestTemp

Push-Location $ProjectRoot
try {
    Write-Host "[1/3] Checking generated data contracts..."
    & $VenvPython -B .\scripts\export_contracts.py --check
    if ($LASTEXITCODE -ne 0) { throw "Contract check failed (exit code $LASTEXITCODE)." }

    Write-Host "[2/3] Running FastAPI, SQLite and contract tests..."
    & $VenvPython -m pytest --basetemp $PytestBaseTemp
    if ($LASTEXITCODE -ne 0) { throw "Backend tests failed (exit code $LASTEXITCODE)." }

    Write-Host "[3/3] Generating React types and running the production build..."
    Push-Location (Join-Path $ProjectRoot "frontend")
    try {
        $Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        $Node = Get-Command node -ErrorAction SilentlyContinue
        if ($Npm) {
            & $Npm.Source run build
        }
        elseif ($Node -and (Test-Path ".\node_modules\vite\bin\vite.js")) {
            & $Node.Source .\node_modules\openapi-typescript\bin\cli.js `
                ..\schemas\generated\openapi.json -o .\src\types\api.generated.ts
            if ($LASTEXITCODE -ne 0) { throw "Type generation failed (exit code $LASTEXITCODE)." }
            & $Node.Source .\node_modules\typescript\bin\tsc --noEmit
            if ($LASTEXITCODE -ne 0) { throw "TypeScript check failed (exit code $LASTEXITCODE)." }
            & $Node.Source .\node_modules\vite\bin\vite.js build
        }
        else {
            throw "Missing frontend tooling. Install Node.js, then run .\scripts\bootstrap-frontend.ps1."
        }
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed (exit code $LASTEXITCODE)." }
    }
    finally {
        Pop-Location
    }

    Write-Host "CycloneScope local verification passed."
}
finally {
    Pop-Location
    $env:TEMP = $PreviousTemp
    $env:TMP = $PreviousTmp
    $env:TMPDIR = $PreviousTmpDir

    $ResolvedProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\') + '\'
    $ResolvedTestTemp = [System.IO.Path]::GetFullPath($TestTemp)
    $SafeToRemove = $ResolvedTestTemp.StartsWith(
        $ResolvedProjectRoot,
        [System.StringComparison]::OrdinalIgnoreCase
    ) -and (Split-Path -Leaf $ResolvedTestTemp) -match '^[0-9a-f]{32}$'
    if ($SafeToRemove -and (Test-Path -LiteralPath $ResolvedTestTemp)) {
        Remove-Item -LiteralPath $ResolvedTestTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

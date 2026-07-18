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
    & $VenvPython -m pytest --basetemp $PytestBaseTemp
    if ($LASTEXITCODE -ne 0) { throw "Tests failed (exit code $LASTEXITCODE)." }
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

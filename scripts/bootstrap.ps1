$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VenvRoot = Join-Path $ProjectRoot ".venv"
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$VenvPip = Join-Path $ProjectRoot ".venv\Scripts\pip.exe"
$BootstrapTemp = Join-Path $ProjectRoot ".test-runs\bootstrap"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python is not available on PATH. Install Python 3.11+ or activate the project Conda environment."
}

$PreviousTemp = $env:TEMP
$PreviousTmp = $env:TMP
$PreviousSslKeyLogFile = $env:SSLKEYLOGFILE
New-Item -ItemType Directory -Force -Path $BootstrapTemp | Out-Null
$env:TEMP = $BootstrapTemp
$env:TMP = $BootstrapTemp
$env:SSLKEYLOGFILE = Join-Path $BootstrapTemp "sslkeylog.log"

try {
    if (-not (Test-Path $VenvPython)) {
        python -m venv $VenvRoot
        if ($LASTEXITCODE -ne 0) { throw "Failed to create .venv (exit code $LASTEXITCODE)." }
    }

    if (-not (Test-Path $VenvPip)) {
        Write-Host "Existing .venv is incomplete; rebuilding it..."
        python -m venv --clear $VenvRoot
        if ($LASTEXITCODE -ne 0) { throw "Failed to rebuild .venv (exit code $LASTEXITCODE)." }
    }

    & $VenvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "Failed to upgrade pip (exit code $LASTEXITCODE)." }

    & $VenvPython -m pip install -r (Join-Path $ProjectRoot "backend\requirements.txt")
    if ($LASTEXITCODE -ne 0) { throw "Failed to install Python dependencies (exit code $LASTEXITCODE)." }
}
finally {
    $env:TEMP = $PreviousTemp
    $env:TMP = $PreviousTmp
    $env:SSLKEYLOGFILE = $PreviousSslKeyLogFile
}

Write-Host "Python environment is ready: $VenvPython"

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    throw "Missing .venv. Run .\scripts\bootstrap.ps1 first."
}

& $VenvPython -m uvicorn app.main:app --app-dir (Join-Path $ProjectRoot "backend") --reload --host 127.0.0.1 --port 8000

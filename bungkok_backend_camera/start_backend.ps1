$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$pythonPath = if (Test-Path "$PSScriptRoot\.venv\Scripts\python.exe") {
    "$PSScriptRoot\.venv\Scripts\python.exe"
} else {
    "python"
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  BUNGKOK Posture Studio (Dual Mode + Realtime Wireframe)  " -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "Buka browser Anda ke: http://127.0.0.1:8000" -ForegroundColor Yellow
Write-Host "Dokumentasi API:     http://127.0.0.1:8000/docs" -ForegroundColor Yellow
Write-Host "Tekan Ctrl+C untuk menghentikan server.`n" -ForegroundColor Gray

& $pythonPath -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload

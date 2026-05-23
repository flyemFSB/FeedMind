param(
    [switch]$SkipInstall,
    [switch]$SkipDb
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root "data"
$backendDir = Join-Path $root "backend"
$agentDir = Join-Path $root "agent"
$frontendDir = Join-Path $root "frontend"
$envFile = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"
$databaseUrl = "postgresql+psycopg://postgres:postgres@localhost:5432/feedmind"

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
}

# 启动 PostgreSQL (pgvector) 容器
if (-not $SkipDb) {
    & "$PSScriptRoot\start-db.ps1"
}

if (-not $SkipInstall) {
    Push-Location $backendDir
    uv sync
    Pop-Location

    Push-Location $agentDir
    uv sync
    Pop-Location

    Push-Location $frontendDir
    pnpm install
    Pop-Location
}

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$backendDir'; uv run fastapi dev app/main.py --host 127.0.0.1 --port 8000"
)

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$agentDir'; `$env:TZ='Asia/Shanghai'; `$env:BACKEND_API_URL='http://localhost:8000'; uv run langgraph dev --host 127.0.0.1 --port 2024"
)

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$frontendDir'; `$env:BACKEND_API_URL='http://localhost:8000'; `$env:AGENT_API_URL='http://localhost:2024'; pnpm dev"
)

Write-Host "FeedMind local services are starting:"
Write-Host "  Frontend:    http://localhost:3000"
Write-Host "  Backend API: http://localhost:8000/api/v1/health"
Write-Host "  Agent API:   http://localhost:2024/docs"

param(
    [switch]$SkipInstall,
    [switch]$SkipDb,
    [switch]$SkipPull
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"
$dataDir = Join-Path $root "data"
$dbPath = Join-Path $dataDir "feedmind.db"

function Ensure-EnvFile {
    if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
        Copy-Item $envExample $envFile
    }

    if (Test-Path $envFile) {
        $envContent = Get-Content $envFile -Raw
        if ($envContent -notmatch "(?m)^DATABASE_PATH=") {
            Add-Content $envFile "`nDATABASE_PATH=./data/feedmind.db"
        }
    }
}

function Ensure-SqliteDb {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    $env:DATABASE_PATH = ".\data\feedmind.db"
    Write-Host "SQLite 数据库路径：$dbPath"
}

Ensure-EnvFile

if (-not $SkipDb) {
    Ensure-SqliteDb
}

Push-Location $root
try {
    if (-not $SkipInstall) {
        pnpm install
    }

    # 先构建共享包，再初始化 SQLite 表结构，避免 CLI 运行时找不到 workspace dist。
    pnpm build:packages
    if (-not $SkipDb) {
        pnpm --filter @feedmind/db db:init
    }

    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location '$root'; pnpm api:dev"
    )

    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location '$root'; `$env:TZ='Asia/Shanghai'; pnpm agent:dev"
    )

    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location '$root'; pnpm web:dev"
    )
}
finally {
    Pop-Location
}

Write-Host "FeedMind local services are starting:"
Write-Host "  Web:       http://localhost:3000"
Write-Host "  API:       http://localhost:8000/api/v1/health"
Write-Host "  Agent API: http://localhost:2024/docs"

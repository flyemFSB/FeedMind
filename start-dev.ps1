<#
.SYNOPSIS
  FeedMind 本地开发环境一键启动脚本
.DESCRIPTION
  自动完成：环境变量检查 → 依赖安装 → 共享包构建 → 数据库初始化 → 启动服务
.PARAMETER SkipInstall
  跳过 pnpm install
.PARAMETER SkipDb
  跳过数据库初始化
#>
param([switch]$SkipInstall, [switch]$SkipDb)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── 1. 确保 .env 存在 ──────────────────────────────────────────────
$envFile = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-Host "已从 .env.example 创建 .env"
}

# ── 2. 确保 data 目录和 DATABASE_PATH ─────────────────────────────
$dataDir = Join-Path $root "data"
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$env:DATABASE_PATH = Join-Path $dataDir "feedmind.db"

if (-not $SkipDb) {
    Write-Host "数据库路径：$env:DATABASE_PATH"
}

# ── 3. 安装依赖 + 构建共享包 + 初始化数据库 ──────────────────────
Push-Location $root
try {
    if (-not $SkipInstall) {
        Write-Host "▶ 安装依赖..."
        pnpm install
    }

    Write-Host "▶ 构建共享包..."
    pnpm build:packages

    if (-not $SkipDb) {
        Write-Host "▶ 初始化数据库..."
        pnpm --filter @feedmind/db db:init
    }

    # ── 4. 启动服务 ────────────────────────────────────────────────
    Write-Host "▶ 启动服务..."
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; pnpm api:dev"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; pnpm web:dev"
}
finally {
    Pop-Location
}

Write-Host "`nFeedMind 本地服务启动中："
Write-Host "  Web 前端：http://localhost:3000"
Write-Host "  API 服务：http://localhost:8000/api/v1/health"

<#
.SYNOPSIS
  FeedMind 本地开发环境一键启动
.DESCRIPTION
  自动完成：.env 检查 → 依赖安装 → 数据库初始化 → 启动 API + Web（同一终端）
.PARAMETER SkipInstall
  跳过 pnpm install
.PARAMETER SkipDb
  跳过数据库初始化
#>
param([switch]$SkipInstall, [switch]$SkipDb)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ── 1. .env ──────────────────────────────────────────────
$envFile = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
}

# ── 2. data ──────────────────────────────────────────────
New-Item -ItemType Directory -Path (Join-Path $root "data") -Force | Out-Null

# ── 3. install + db ──────────────────────────────────────
Push-Location $root
try {
    if (-not $SkipInstall) { pnpm install }
    if (-not $SkipDb) { pnpm run db:init }

    # ── 4. 启动 API + Web（同一终端，concurrently 加前缀区分）───
    pnpm run dev
} finally {
    Pop-Location
}

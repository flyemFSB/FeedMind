param(
    [switch]$SkipInstall,
    [switch]$SkipDb,
    [switch]$SkipPull
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"

function Ensure-EnvFile {
    if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
        Copy-Item $envExample $envFile
    }
}

function Start-FeedMindPostgres {
    $containerName = "feedmind-postgres"
    $imageName = "pgvector/pgvector:pg18"
    $dbUser = "postgres"
    $dbPass = "postgres"
    $dbName = "feedmind"
    $hostPort = 5432
    $volumeName = "feedmind-pgdata"

    if (-not (docker --version 2>$null)) {
        throw "未找到 Docker，请先安装 Docker Desktop。"
    }

    if (-not $SkipPull) {
        docker pull $imageName
    }

    $existing = docker ps -a --filter "name=$containerName" --format "{{.Status}}" 2>$null
    if ($existing) {
        if ($existing -notmatch "^Up") {
            docker start $containerName | Out-Null
        }
    } else {
        docker volume create $volumeName 2>$null | Out-Null
        docker run -d `
            --name $containerName `
            -e "TZ=Asia/Shanghai" `
            -e "POSTGRES_USER=$dbUser" `
            -e "POSTGRES_PASSWORD=$dbPass" `
            -e "POSTGRES_DB=$dbName" `
            -p "${hostPort}:5432" `
            -v "${volumeName}:/var/lib/postgresql" `
            --restart unless-stopped `
            $imageName | Out-Null
    }

    Write-Host "等待 PostgreSQL 就绪..."
    for ($i = 0; $i -lt 30; $i++) {
        $ready = docker exec $containerName pg_isready -U $dbUser 2>$null
        if ($ready) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        throw "PostgreSQL 启动超时，请检查容器日志：docker logs $containerName"
    }

    docker exec $containerName psql -U $dbUser -d $dbName -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>$null | Out-Null
}

Ensure-EnvFile

if (-not $SkipDb) {
    Start-FeedMindPostgres
}

Push-Location $root
try {
    if (-not $SkipInstall) {
        pnpm install
    }

    # 先构建共享包，再迁移数据库，避免 CLI 运行时找不到 workspace dist。
    pnpm build:packages
    pnpm db:migrate

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

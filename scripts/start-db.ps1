param(
    [switch]$SkipPull
)

$ErrorActionPreference = "Stop"

$containerName = "feedmind-postgres"
$imageName = "pgvector/pgvector:pg18"
$dbUser = "postgres"
$dbPass = "postgres"
$dbName = "feedmind"
$hostPort = 5432
$volumeName = "feedmind-pgdata"

# 检查 Docker
$dockerVersion = docker --version 2>$null
if (-not $dockerVersion) {
    Write-Error "未找到 Docker，请先安装 Docker Desktop。"
    exit 1
}

# 拉取最新镜像
if (-not $SkipPull) {
    Write-Host "正在拉取 $imageName ..."
    docker pull $imageName
}

# 检查容器状态
$existing = docker ps -a --filter "name=$containerName" --format "{{.Status}}" 2>$null

if ($existing) {
    if ($existing -match "^Up") {
        Write-Host "容器 $containerName 已在运行中。"
        return
    }
    Write-Host "容器 $containerName 已存在，正在启动..."
    docker start $containerName
} else {
    Write-Host "正在创建容器 $containerName ..."

    # 确保数据卷存在
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
        $imageName
}

# 等待数据库就绪
Write-Host "等待 PostgreSQL 就绪..."
$maxRetries = 30
$retry = 0
do {
    Start-Sleep -Seconds 1
    $ready = docker exec $containerName pg_isready -U $dbUser 2>$null
    $retry++
} while (-not $ready -and $retry -lt $maxRetries)

if (-not $ready) {
    Write-Error "PostgreSQL 启动超时，请检查容器日志：docker logs $containerName"
    exit 1
}

# 确保 vector 扩展已启用
Write-Host "正在启用 pgvector 扩展..."
docker exec $containerName psql -U $dbUser -d $dbName -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>$null

Write-Host "PostgreSQL ($imageName) 已就绪：localhost:$hostPort"
Write-Host "  用户: $dbUser"
Write-Host "  密码: $dbPass"
Write-Host "  数据库: $dbName"
Write-Host "  扩展: pgvector"

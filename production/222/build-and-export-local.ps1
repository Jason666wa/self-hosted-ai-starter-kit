# 为 222 离线部署：构建自定义 runners 并导出所需镜像 tar
# 用法（本机 PowerShell）：
#   cd D:\Jason_Code\self-hosted-ai-starter-kit\production\222
#   .\build-and-export-local.ps1
#
# 产物落在本目录，再整体拷到 222，例如 /home/ai/project/n8n/222

$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Building custom n8n-runners image..." -ForegroundColor Yellow
docker compose -f docker-compose.yml build task-runners
if ($LASTEXITCODE -ne 0) { throw "Failed to build task-runners" }

$Images = @(
    @{ Image = "n8nio/n8n:latest"; Tar = "n8nio-n8n-latest.tar" },
    @{ Image = "self-hosted-ai-starter-kit/n8n-runners:latest"; Tar = "n8n-runners-latest.tar" },
    @{ Image = "postgres:16-alpine"; Tar = "postgres-16-alpine.tar" },
    @{ Image = "qdrant/qdrant:latest"; Tar = "qdrant-latest.tar" }
)

Write-Host "`nExporting $($Images.Count) images into: $ScriptDir" -ForegroundColor Yellow

$i = 0
foreach ($entry in $Images) {
    $i++
    $image = $entry.Image
    $tar = $entry.Tar
    Write-Host "[$i/$($Images.Count)] $image -> $tar" -ForegroundColor Cyan

    $null = docker image inspect $image 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Image missing locally, trying docker pull..." -ForegroundColor Yellow
        docker pull $image
        if ($LASTEXITCODE -ne 0) { throw "Failed to pull $image" }
    }

    docker save -o $tar $image
    if ($LASTEXITCODE -ne 0) { throw "Failed to save $image" }

    $sizeMB = [math]::Round((Get-Item $tar).Length / 1MB, 1)
    Write-Host "  OK ($sizeMB MB)" -ForegroundColor Green
}

Write-Host "`nDone. Package layout:" -ForegroundColor Green
Write-Host "  production/222/"
Write-Host "    n8n/                 (SSO hooks + runners Dockerfile/config)"
Write-Host "    docker-compose.yml"
Write-Host "    docker-compose.emagy-sso.override.yml"
Write-Host "    .env                 (do NOT overwrite server secrets blindly)"
Write-Host "    *.tar"
Write-Host "    load-and-up.sh"
Write-Host "`nCopy this folder to 222, then:"
Write-Host "  cd /home/ai/project/n8n/222   # or your path"
Write-Host "  bash load-and-up.sh"

# ============================================
# BUILD SCRIPT FOR KOHOST TERMINAL IMAGE
# ============================================
# Run this script to build the terminal Docker image
# Usage: .\docker\build-terminal.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Building KoHost Terminal Docker Image" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check if Docker is running
$dockerStatus = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Docker is not running!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "`n✓ Docker is running" -ForegroundColor Green

# Change to project root
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (Test-Path (Join-Path $PSScriptRoot "..")) {
    $projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
}
Set-Location $projectRoot

Write-Host "`n📂 Building from: $projectRoot" -ForegroundColor Yellow

# Build the image
Write-Host "`n🔨 Building Docker image: kohost-terminal:latest" -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray

docker build -t kohost-terminal:latest -f docker/terminal.Dockerfile .

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Build successful!" -ForegroundColor Green
    Write-Host "`n📋 Image details:" -ForegroundColor Cyan
    docker images kohost-terminal:latest
    
    Write-Host "`n🧪 Testing image..." -ForegroundColor Yellow
    docker run --rm kohost-terminal:latest bash -c "echo '=== Tool Versions ===' && node --version && npm --version && php --version | head -1 && composer --version && git --version"
    
    Write-Host "`n✓ Image is ready to use!" -ForegroundColor Green
    Write-Host "The terminal will automatically use this image." -ForegroundColor Gray
} else {
    Write-Host "`n❌ Build failed!" -ForegroundColor Red
    Write-Host "Check the error messages above." -ForegroundColor Yellow
    exit 1
}

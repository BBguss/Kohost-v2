# ============================================
# KOHOST TERMINAL - Docker Setup Script
# ============================================
# Run this script to build the Docker image
# Required: Docker Desktop installed and running

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  KOHOST TERMINAL - Docker Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "[1/4] Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker not found"
    }
    Write-Host "  Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Docker is not installed or not running!" -ForegroundColor Red
    Write-Host "  Please install Docker Desktop from: https://docker.com" -ForegroundColor Red
    exit 1
}

# Check if Docker daemon is running
Write-Host "[2/4] Checking Docker daemon..." -ForegroundColor Yellow
try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon not running"
    }
    Write-Host "  Docker daemon is running" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Docker daemon is not running!" -ForegroundColor Red
    Write-Host "  Please start Docker Desktop and wait until it's ready" -ForegroundColor Red
    exit 1
}

# Build the image
Write-Host "[3/4] Building Docker image..." -ForegroundColor Yellow
Write-Host "  This may take 2-5 minutes on first build..." -ForegroundColor Gray

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath

Push-Location $projectRoot
docker build -t kohost-terminal:latest -f docker/terminal.Dockerfile .
$buildResult = $LASTEXITCODE
Pop-Location

if ($buildResult -ne 0) {
    Write-Host "  ERROR: Docker build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Image built successfully!" -ForegroundColor Green

# Verify the image
Write-Host "[4/4] Verifying installation..." -ForegroundColor Yellow
$imageInfo = docker images kohost-terminal:latest --format "{{.Repository}}:{{.Tag}} ({{.Size}})"
Write-Host "  Image: $imageInfo" -ForegroundColor Green

# Test the image
Write-Host ""
Write-Host "Testing installed tools..." -ForegroundColor Yellow
docker run --rm kohost-terminal:latest bash -c "echo '  Node.js:' \$(node --version); echo '  NPM:' \$(npm --version); echo '  PHP:' \$(php --version | head -1); echo '  Composer:' \$(composer --version 2>/dev/null | head -1); echo '  Git:' \$(git --version)"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Configure database in server/.env" -ForegroundColor White
Write-Host "  2. Run: cd server && node index.js" -ForegroundColor White
Write-Host "  3. Run: npm run dev (in another terminal)" -ForegroundColor White
Write-Host "  4. Open: http://localhost:5173" -ForegroundColor White
Write-Host ""

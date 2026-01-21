# ============================================
# KOHOST TERMINAL - Docker Setup Script
# ============================================
# Run this script to build the terminal Docker image

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " KoHost Terminal Docker Setup" -ForegroundColor Cyan  
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
$dockerVersion = docker --version 2>$null
if (-not $dockerVersion) {
    Write-Host "ERROR: Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://docker.com" -ForegroundColor Yellow
    exit 1
}

Write-Host "Docker found: $dockerVersion" -ForegroundColor Green

# Navigate to docker directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dockerDir = Join-Path $scriptDir "docker"

if (-not (Test-Path $dockerDir)) {
    $dockerDir = Join-Path (Split-Path -Parent $scriptDir) "docker"
}

if (-not (Test-Path (Join-Path $dockerDir "terminal.Dockerfile"))) {
    Write-Host "ERROR: terminal.Dockerfile not found in $dockerDir" -ForegroundColor Red
    exit 1
}

Write-Host "Building Docker image..." -ForegroundColor Yellow
Write-Host ""

# Build the image
docker build -t kohost-terminal:latest -f "$dockerDir\terminal.Dockerfile" $dockerDir

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " Docker image built successfully!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Image: kohost-terminal:latest" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Restart the Node.js server" -ForegroundColor White
    Write-Host "2. Install xterm dependencies: npm install xterm xterm-addon-fit xterm-addon-web-links" -ForegroundColor White
    Write-Host "3. Open Terminal in your web panel" -ForegroundColor White
} else {
    Write-Host "" 
    Write-Host "ERROR: Docker build failed" -ForegroundColor Red
    exit 1
}

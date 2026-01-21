#!/bin/bash
# ============================================
# KOHOST TERMINAL - Docker Setup Script
# ============================================
# Run this script to build the Docker image
# Required: Docker installed and running

echo ""
echo "============================================"
echo "  KOHOST TERMINAL - Docker Setup"
echo "============================================"
echo ""

# Check if Docker is running
echo "[1/4] Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "  ERROR: Docker is not installed!"
    echo "  Please install Docker from: https://docker.com"
    exit 1
fi
echo "  Docker found: $(docker --version)"

# Check if Docker daemon is running
echo "[2/4] Checking Docker daemon..."
if ! docker info &> /dev/null; then
    echo "  ERROR: Docker daemon is not running!"
    echo "  Please start Docker and try again"
    exit 1
fi
echo "  Docker daemon is running"

# Build the image
echo "[3/4] Building Docker image..."
echo "  This may take 2-5 minutes on first build..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"
docker build -t kohost-terminal:latest -f docker/terminal.Dockerfile .

if [ $? -ne 0 ]; then
    echo "  ERROR: Docker build failed!"
    exit 1
fi
echo "  Image built successfully!"

# Verify the image
echo "[4/4] Verifying installation..."
IMAGE_INFO=$(docker images kohost-terminal:latest --format "{{.Repository}}:{{.Tag}} ({{.Size}})")
echo "  Image: $IMAGE_INFO"

# Test the image
echo ""
echo "Testing installed tools..."
docker run --rm kohost-terminal:latest bash -c "echo '  Node.js:' \$(node --version); echo '  NPM:' \$(npm --version); echo '  PHP:' \$(php --version | head -1); echo '  Composer:' \$(composer --version 2>/dev/null | head -1); echo '  Git:' \$(git --version)"

echo ""
echo "============================================"
echo "  SETUP COMPLETE!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Configure database in server/.env"
echo "  2. Run: cd server && node index.js"
echo "  3. Run: npm run dev (in another terminal)"
echo "  4. Open: http://localhost:5173"
echo ""

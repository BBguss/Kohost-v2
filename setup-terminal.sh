#!/bin/bash
# ============================================
# KOHOST TERMINAL - Docker Setup Script (Linux/Mac)
# ============================================

echo "============================================"
echo " KoHost Terminal Docker Setup"
echo "============================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed"
    echo "Please install Docker first"
    exit 1
fi

echo "Docker found: $(docker --version)"

# Find Dockerfile
SCRIPT_DIR="$(dirname "$0")"
DOCKER_DIR="$SCRIPT_DIR/docker"

if [ ! -f "$DOCKER_DIR/terminal.Dockerfile" ]; then
    DOCKER_DIR="$(dirname "$SCRIPT_DIR")/docker"
fi

if [ ! -f "$DOCKER_DIR/terminal.Dockerfile" ]; then
    echo "ERROR: terminal.Dockerfile not found"
    exit 1
fi

echo "Building Docker image..."
echo ""

# Build the image
docker build -t kohost-terminal:latest -f "$DOCKER_DIR/terminal.Dockerfile" "$DOCKER_DIR"

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================"
    echo " Docker image built successfully!"
    echo "============================================"
    echo ""
    echo "Image: kohost-terminal:latest"
    echo ""
    echo "Next steps:"
    echo "1. Restart the Node.js server"
    echo "2. Install xterm: npm install xterm xterm-addon-fit xterm-addon-web-links"
    echo "3. Open Terminal in your web panel"
else
    echo ""
    echo "ERROR: Docker build failed"
    exit 1
fi

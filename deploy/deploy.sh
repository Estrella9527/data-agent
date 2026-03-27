#!/bin/bash
# Deploy 重明 Data Agent
# Prerequisites: bash deploy/init-server.sh

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=========================================="
echo "  重明 Data Agent — Deploy"
echo "=========================================="

cd "$APP_DIR"

# Check .env.production
if [ ! -f .env.production ]; then
    echo "ERROR: .env.production not found!"
    echo "  cp deploy/.env.production .env.production"
    echo "  vim .env.production"
    exit 1
fi

# Symlink .env for docker compose
cp .env.production .env

# Build and start
echo ""
echo "Building containers (web + api + chromadb)..."
docker compose -f docker-compose.prod.yml build

echo ""
echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d

# Wait for services
echo ""
echo "Waiting for services to start..."
sleep 8

# Prisma migration
echo ""
echo "Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T web npx prisma db push --skip-generate 2>&1 || \
    echo "Note: Prisma push may have failed — check logs"

echo ""
echo "=========================================="
echo "  Deployment complete!"
echo "=========================================="
echo ""
docker compose -f docker-compose.prod.yml ps
echo ""
echo "Logs:    docker compose -f docker-compose.prod.yml logs -f"
echo "Restart: docker compose -f docker-compose.prod.yml restart"
echo "Backup:  bash deploy/backup.sh"

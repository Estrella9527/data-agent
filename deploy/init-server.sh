#!/bin/bash
# Server setup script — incremental, safe for shared servers
# Only installs what's missing, does not touch existing services
# Run as root

set -e

echo "=========================================="
echo "  重明 Data Agent — Server Setup"
echo "=========================================="

# 1. Install Docker (if not present)
if command -v docker &> /dev/null; then
    echo "[1/4] Docker already installed: $(docker --version)"
else
    echo "[1/4] Installing Docker..."
    dnf install -y dnf-utils
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    # Configure log rotation + mirror
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.m.daocloud.io"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF
    systemctl start docker
    systemctl enable docker
    echo "Docker installed: $(docker --version)"
fi

# 2. Create PostgreSQL database and user for this project
echo "[2/4] Setting up PostgreSQL database..."
# Read password from .env.production
if [ -f .env.production ]; then
    PG_USER=$(grep '^POSTGRES_USER=' .env.production | cut -d= -f2)
    PG_PASS=$(grep '^POSTGRES_PASSWORD=' .env.production | cut -d= -f2)
    PG_DB=$(grep '^POSTGRES_DB=' .env.production | cut -d= -f2)
else
    echo "WARNING: .env.production not found, using defaults"
    PG_USER="dataagent"
    PG_PASS="CHANGE_ME"
    PG_DB="dataagent"
fi

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'\"" | grep -q 1 || \
    su - postgres -c "psql -c \"CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${PG_DB}'\"" | grep -q 1 || \
    su - postgres -c "psql -c \"CREATE DATABASE ${PG_DB} OWNER ${PG_USER};\""
echo "Database '${PG_DB}' ready (user: ${PG_USER})"

# 3. Configure PostgreSQL to accept Docker connections
echo "[3/4] Configuring PostgreSQL access for Docker..."
PG_HBA=$(su - postgres -c "psql -t -c 'SHOW hba_file'" | xargs)
PG_CONF=$(su - postgres -c "psql -t -c 'SHOW config_file'" | xargs)

# Allow connections from Docker bridge network (172.x.x.x)
if ! grep -q "172.0.0.0/8" "$PG_HBA" 2>/dev/null; then
    echo "# Docker containers access" >> "$PG_HBA"
    echo "host    all    all    172.0.0.0/8    md5" >> "$PG_HBA"
    echo "Added Docker network to pg_hba.conf"
fi

# Ensure PostgreSQL listens on all interfaces (or at least localhost + docker bridge)
if grep -q "^listen_addresses" "$PG_CONF"; then
    sed -i "s/^listen_addresses.*/listen_addresses = '*'/" "$PG_CONF"
else
    echo "listen_addresses = '*'" >> "$PG_CONF"
fi

systemctl restart postgresql
echo "PostgreSQL configured and restarted"

# 4. Install Nginx config
echo "[4/4] Installing Nginx server block..."
if [ -f deploy/nginx-data-agent.conf ]; then
    cp deploy/nginx-data-agent.conf /etc/nginx/conf.d/data-agent.conf
    nginx -t && systemctl reload nginx
    echo "Nginx config installed and reloaded"
else
    echo "WARNING: deploy/nginx-data-agent.conf not found, skip"
fi

echo ""
echo "=========================================="
echo "  Setup complete!"
echo "=========================================="
echo ""
echo "Next: bash deploy/deploy.sh"

#!/bin/bash
# Database backup — uses system PostgreSQL
# Keeps last 7 daily backups

set -e

BACKUP_DIR="/opt/projects/data-agent/backups"
DB_USER="dataagent"
DB_NAME="dataagent"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "Backing up database..."
su - postgres -c "pg_dump ${DB_NAME}" | gzip > "${BACKUP_DIR}/db_${DATE}.sql.gz"

# Remove backups older than 7 days
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +7 -delete

echo "Backup complete: ${BACKUP_DIR}/db_${DATE}.sql.gz"
ls -lh "${BACKUP_DIR}"/db_*.sql.gz

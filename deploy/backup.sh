#!/usr/bin/env sh
# Nightly backup of PostgreSQL and the MinIO bucket. Add to cron:  0 3 * * * /opt/skyline/deploy/backup.sh
# Copy the files in $OUT to storage OFF this server (S3, another host); a backup on the same disk is not a backup.
set -eu
cd "$(dirname "$0")"
OUT="${OUT:-/var/backups/skyline}"; mkdir -p "$OUT"; STAMP=$(date +%Y%m%d_%H%M)
. ./.env.production
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT/db_$STAMP.sql.gz"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T minio sh -c 'tar -C /data -cz .' > "$OUT/media_$STAMP.tar.gz"
find "$OUT" -type f -mtime +14 -delete
echo "backup written to $OUT ($STAMP)"

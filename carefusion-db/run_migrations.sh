#!/usr/bin/env bash
# Usage: ./run_migrations.sh "<postgres connection string>"
set -euo pipefail
DB="${1:?connection string required}"
for f in migrations/*.sql; do
  echo "==> $f"
  psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "All migrations applied."

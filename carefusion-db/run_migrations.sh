#!/usr/bin/env bash
# Usage: ./run_migrations.sh "<postgres connection string>"
set -euo pipefail
DB="${1:?connection string required}"
# One psql call per file (in file-name order). Do NOT wrap them in a single transaction:
# migrations 120+ use ALTER TYPE ... ADD VALUE and then use the new value in a later file.
for f in migrations/*.sql; do
  echo "==> $f"
  psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "All migrations applied."

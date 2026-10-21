#!/usr/bin/env bash
# CareFusion AI database runner (migrations and demo seeds).
#
# Usage:
#   ./run_migrations.sh "<postgres connection string>" [migrate|seed|all]
#     migrate  (default) apply migrations/*.sql that are not in the ledger yet
#     seed     apply seed files that are not in the ledger yet:
#                seed/demo_data.sql, then seed/design/NN_*.sql in file-name order
#     all      migrate, then seed
#
# How it works
#   * A ledger table public.schema_migrations records (filename, checksum) for every file that was
#     applied. A file already in the ledger is skipped, so running this script again is a no-op.
#   * One psql call per file, never one big transaction. Migrations 120+ use ALTER TYPE ... ADD VALUE
#     and then use the new value in a later file, so each file must be committed on its own.
#   * The ledger row is written by the same psql call, right after the file succeeded
#     (psql stops at the first error, so a failed file is never recorded).
#   * An already-migrated database from before the ledger existed is detected and "baselined":
#     the migrations that are visibly there are recorded without being run, so only the rest
#     (for example 120+) are applied.
#   * A migration file that changed after it was applied is an error (never edit an applied
#     migration, add a new numbered file). A seed file that changed is skipped with a warning
#     because seeds are not re-runnable by default.
#
# Environment switches
#   SEED_FORCE=1            re-run the seed/design/*.sql files even if they are in the ledger (they are
#                           written to be idempotent). seed/demo_data.sql is never re-run: it is NOT
#                           idempotent
#   ALLOW_CHECKSUM_DRIFT=1  only warn when an applied migration file has changed
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

DB="${1:?connection string required}"
MODE="${2:-migrate}"
case "$MODE" in migrate | seed | all) ;; *) echo "Unknown mode '$MODE' (use migrate, seed or all)" >&2; exit 2 ;; esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

psql_run() { psql "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }
psql_val() { psql "$DB" -X -q -At -v ON_ERROR_STOP=1 "$@"; }

checksum() {
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Escape a value for a single-quoted SQL literal (file names and hex checksums only; defensive).
sq() { printf "%s" "${1//\'/\'\'}"; }

ensure_ledger() {
  psql_run -c "
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename    text PRIMARY KEY,                         -- path relative to carefusion-db/
      kind        text NOT NULL DEFAULT 'migration' CHECK (kind IN ('migration','seed')),
      checksum    text NOT NULL,                            -- sha256 of the file when it was applied
      applied_at  timestamptz NOT NULL DEFAULT now(),
      baselined   boolean NOT NULL DEFAULT false            -- true = found already applied, not run by this tool
    );"
}

ledger_checksum() { # prints the recorded checksum or nothing
  psql_val -c "SELECT checksum FROM public.schema_migrations WHERE filename = '$(sq "$1")'"
}

record_sql() { # filename kind checksum baselined
  printf "INSERT INTO public.schema_migrations (filename, kind, checksum, baselined) VALUES ('%s','%s','%s',%s) ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()" \
    "$(sq "$1")" "$2" "$3" "$4"
}

# ---- Baseline a database that was migrated before the ledger existed ----
exists_obj() { [ "$(psql_val -c "SELECT to_regclass('$1') IS NOT NULL")" = "t" ]; }

# Marker = the last object a migration file creates (so a half-applied file is not mistaken for done).
migration_marker() {
  case "$(basename "$1")" in
    120_*) echo "identity.family_link" ;;
    121_*) echo "engage.alert_read" ;;
    122_*) echo "inpatient.v_bed_board" ;;
    123_*) echo "imaging.v_worklist" ;;
    124_*) echo "pharmacy.v_dispensing_log" ;;
    125_*) echo "report.v_disease_weekly" ;;
    126_*) echo "donation.organ_lookup_log" ;;
    127_*) echo "audit.flagged_event" ;;
    128_*) echo "engage.notification_template" ;;
    *) echo "" ;;
  esac
}

baseline_legacy_db() {
  local n
  n="$(psql_val -c "SELECT count(*) FROM public.schema_migrations WHERE kind = 'migration'")"
  [ "$n" = "0" ] || return 0
  exists_obj "identity.person" || return 0   # empty database: nothing to baseline
  echo "==> Existing database without a ledger: recording the migrations that are already applied"
  local f num marker
  for f in migrations/*.sql; do
    num="$(basename "$f")"; num="${num%%_*}"
    if [ "$((10#$num))" -le 110 ]; then
      # 000-110 are applied together by the old runner; 110 inserts reference rows, so check one.
      [ "$(psql_val -c "SELECT EXISTS (SELECT 1 FROM org.bed_type)")" = "t" ] || continue
    else
      marker="$(migration_marker "$f")"
      [ -n "$marker" ] && exists_obj "$marker" || continue
    fi
    psql_run -c "$(record_sql "$f" migration "$(checksum "$f")" true)"
    echo "    baselined $f"
  done
}

# ---- Apply one file (one psql call; the ledger row is written right after it succeeds) ----
apply_file() { # file kind
  local f="$1" kind="$2" sum recorded force="${SEED_FORCE:-0}"
  [ "$f" = "seed/demo_data.sql" ] && force=0
  sum="$(checksum "$f")"
  recorded="$(ledger_checksum "$f")"
  if [ -n "$recorded" ]; then
    if [ "$recorded" = "$sum" ]; then
      if [ "$kind" = "seed" ] && [ "$force" = "1" ]; then
        echo "==> $f (SEED_FORCE: re-running)"
      else
        echo "--  $f (already applied)"
        return 0
      fi
    elif [ "$kind" = "migration" ]; then
      if [ "${ALLOW_CHECKSUM_DRIFT:-0}" = "1" ]; then
        echo "!!  $f changed after it was applied (ALLOW_CHECKSUM_DRIFT=1: continuing)" >&2
        return 0
      fi
      echo "ERROR: $f changed after it was applied (recorded $recorded, now $sum)." >&2
      echo "       Never edit an applied migration; add a new numbered file instead." >&2
      exit 3
    else
      if [ "$force" = "1" ]; then
        echo "==> $f (changed; SEED_FORCE: re-running)"
      else
        echo "!!  $f changed since it was applied; skipped (set SEED_FORCE=1 to re-run an idempotent seed)" >&2
        return 0
      fi
    fi
  else
    echo "==> $f"
  fi
  psql_run -f "$f" -c "$(record_sql "$f" "$kind" "$sum" false)"
}

run_migrations() {
  local f
  baseline_legacy_db
  for f in migrations/*.sql; do apply_file "$f" migration; done
  echo "Migrations up to date."
}

run_seeds() {
  local f
  if [ -f seed/demo_data.sql ]; then apply_file seed/demo_data.sql seed; fi
  if [ -d seed/design ]; then
    for f in seed/design/[0-9]*.sql; do
      [ -e "$f" ] || continue
      apply_file "$f" seed
    done
  fi
  echo "Seeds up to date."
}

ensure_ledger
case "$MODE" in
  migrate) run_migrations ;;
  seed)    run_seeds ;;
  all)     run_migrations; run_seeds ;;
esac

-- =====================================================================
-- CareFusion AI — Government Edition
-- 000_foundation.sql : extensions, schemas, roles, shared helper functions
-- PostgreSQL 16+ with PostGIS 3.x
-- =====================================================================

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS postgis;      -- hospital geofence, pharmacy distance, donor area
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- sha256 hashing, random bytes
CREATE EXTENSION IF NOT EXISTS citext;       -- case-insensitive codes
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- exclusion constraints on time ranges

-- ---------- Schemas ----------
CREATE SCHEMA IF NOT EXISTS util;
CREATE SCHEMA IF NOT EXISTS geo;
CREATE SCHEMA IF NOT EXISTS org;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS access;
CREATE SCHEMA IF NOT EXISTS records;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS pharmacy;
CREATE SCHEMA IF NOT EXISTS donation;
CREATE SCHEMA IF NOT EXISTS engage;
CREATE SCHEMA IF NOT EXISTS audit;

-- ---------- Group roles (no login; real logins are granted these) ----------
-- cf_migrator : runs migrations, owns objects (BYPASSRLS)
-- cf_app      : Node platform API (subject to row-level security)
-- cf_ai       : FastAPI AI service (ai schema + read of needed records)
-- cf_report   : dashboards — de-identified views only
-- cf_auditor  : read audit log (central admin tooling), with its own access logged
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['cf_migrator','cf_app','cf_ai','cf_report','cf_auditor'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;

-- ---------- UUID v7 (time-ordered ids; PostgreSQL 18 has uuidv7() built in) ----------
CREATE OR REPLACE FUNCTION util.uuid_v7() RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
  b  bytea  := gen_random_bytes(16);
BEGIN
  b := set_byte(b, 0, ((ms >> 40) & 255)::int);
  b := set_byte(b, 1, ((ms >> 32) & 255)::int);
  b := set_byte(b, 2, ((ms >> 24) & 255)::int);
  b := set_byte(b, 3, ((ms >> 16) & 255)::int);
  b := set_byte(b, 4, ((ms >> 8)  & 255)::int);
  b := set_byte(b, 5, ( ms        & 255)::int);
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);   -- version 7
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);   -- RFC 4122 variant
  RETURN encode(b, 'hex')::uuid;
END $$;

-- ---------- Request context (set by the API on every transaction) ----------
-- SET LOCAL app.user_id = '<uuid>'; SET LOCAL app.person_id = '<uuid>'; SET LOCAL app.account_type = 'doctor';
CREATE OR REPLACE FUNCTION util.ctx_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION util.ctx_person_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.person_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION util.ctx_account_type() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.account_type', true), '') $$;

-- ---------- updated_at maintenance ----------
CREATE OR REPLACE FUNCTION util.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------- Append-only protection ----------
-- Fully immutable: any UPDATE or DELETE is refused.
CREATE OR REPLACE FUNCTION util.forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CF001: % on %.% is not allowed (append-only table)',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END $$;

-- Partly mutable: UPDATE may change only the columns named in the trigger arguments.
-- Usage: CREATE TRIGGER ... BEFORE UPDATE ... EXECUTE FUNCTION util.allow_only_columns('status','updated_at');
CREATE OR REPLACE FUNCTION util.allow_only_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
  i int;
BEGIN
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    old_j := old_j - TG_ARGV[i];
    new_j := new_j - TG_ARGV[i];
  END LOOP;
  IF old_j IS DISTINCT FROM new_j THEN
    RAISE EXCEPTION 'CF002: only columns (%) may change on %.%',
      array_to_string(TG_ARGV, ', '), TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---------- Monthly partition helper ----------
-- Creates monthly partitions for a range-partitioned table from start month for N months.
-- Production: run monthly from pg_cron (or use pg_partman where the cloud offers it).
CREATE OR REPLACE FUNCTION util.ensure_monthly_partitions(
  parent regclass, start_month date, months int)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  m date;
  part_name text;
  created int := 0;
  nsp text;
  rel text;
BEGIN
  SELECT n.nspname, c.relname INTO nsp, rel
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = parent;
  FOR i IN 0 .. months - 1 LOOP
    m := (date_trunc('month', start_month) + make_interval(months => i))::date;
    part_name := format('%s_%s', rel, to_char(m, 'YYYYMM'));
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = nsp AND c.relname = part_name) THEN
      EXECUTE format('CREATE TABLE %I.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
                     nsp, part_name, parent, m, (m + interval '1 month')::date);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END $$;

GRANT USAGE ON SCHEMA util TO cf_app, cf_ai, cf_report, cf_auditor;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA util TO cf_app, cf_ai, cf_report, cf_auditor;

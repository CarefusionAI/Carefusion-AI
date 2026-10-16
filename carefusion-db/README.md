# CareFusion AI — Database (PostgreSQL 16 + PostGIS)

Production-grade schema for the full CareFusion AI Government Edition: every user type (citizen, emergency contact, doctor, nurse/lab/radiology staff, hospital admin, pharmacy admin, pharmacist, district / state / zonal / central admin) and every feature in project docs 01–10. Design notes: **11_DATABASE_DESIGN.md** in the project.

> ⚠ No real patient data in any non-production environment. Alpha (Neon) = synthetic data only.

## What is inside
```
migrations/
  000_foundation.sql        extensions, 12 schemas, roles, UUID v7, append-only helpers, partition helper
  010_geo_org.sql           zones, states/UTs, districts, hospitals (geofence), departments, beds, pharmacies
  020_identity.sql          person, login accounts, all role profiles, devices, emergency contacts/codes, DPDP consents
  030_admin.sql             admin posts, approval chain with time limits, flags, suspensions, death records, alerts
  040_access.sql            key / card+OTP / admission / emergency / break-glass sessions, location checks, misuse
  050_records.sql           folders, documents (files in object storage), highlights, clinical facts, vitals, dates panel, orders, referrals
  060_ai.sql                AI runs (locked), top-3 hypotheses, evidence, doctor review
  070_pharmacy.sql          medicine catalogue, interactions, e-signed prescriptions, stock, dispensing, controlled-drug register
  080_donation_engage.sql   blood donors/requests, organ pledges, appointments, ratings, complaints, chat, notifications, alerts
  090_audit.sql             hash-chained activity log (per-stream chains), daily chain heads, log-view grants
  100_security_views.sql    row-level security, privileged helpers, views per user type, de-identified report views, grants
  110_reference_data.sql    5 zones, 36 states/UTs (approved mapping), Kerala districts, master lists, approval rules, partitions
tests/
  test_rules.sql            46 rule tests in one rolled-back transaction
  bench_audit_log.sql       pgbench script: parallel writes to the log
run_migrations.sh
```

## Run it
```bash
# Local (Docker):  docker run -d --name cf-db -e POSTGRES_PASSWORD=dev -p 5432:5432 postgis/postgis:16-3.4
./run_migrations.sh "postgresql://postgres:dev@localhost:5432/postgres"
psql "postgresql://postgres:dev@localhost:5432/postgres" -v ON_ERROR_STOP=1 -f tests/test_rules.sql
```
Neon (alpha): use the connection string from the Neon console. ⚠ Check that `postgis`, `pgcrypto`, `citext` and `btree_gist` are allowed on the Neon free plan first.

## Tested (2026-10-11, PostgreSQL 16.15 + PostGIS 3.4)
- All migrations apply on an empty database; **97 tables and views** in 12 schemas.
- **46 / 46 rule tests pass** — e.g. raw Aadhaar refused; doctor cannot open own record; one doctor per key session; 30-minute limit; geofence reason; documents, AI runs, prescriptions, dispensing and logs cannot be edited or deleted; patient sees AI result only after doctor review; RLS hides a record when the patient ends the session but keeps the doctor's own additions; dispensing reduces stock and closes the prescription; donation switches the donor off for 90 days; death record locks all accounts; hash-chain tampering detected.
- **Log under load:** 16 parallel writers, ~5,500 log rows/second on a small test machine, all 36 chains verify intact.

## How the API must use it
Every request runs in a transaction and first sets the caller:
```sql
SET LOCAL app.user_id = '<app_user.id>';
SET LOCAL app.person_id = '<person.id>';
SET LOCAL app.account_type = 'doctor';
```
Row-level security, the views and the log helper `audit.log(...)` read these values. The API connects as a login role that is a member of `cf_app` (never as the owner).

Error codes raised by rules start with `CFxxx` (e.g. `CF023` own record, `CF056` not enough stock) so the API can show clear messages.

## Rules for changes
- SQL files are the source of truth. Never edit an applied migration; add a new numbered file.
- Prisma (Node API) reads the schema with `prisma db pull`; do not let Prisma Migrate change the database (it cannot manage triggers, RLS or partitions).
- Run `tests/test_rules.sql` in CI on every change.

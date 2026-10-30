-- =====================================================================
-- 125_admin_ops.sql : what the hospital / pharmacy / district-to-central consoles show
--   approvals (priority, reminders, more-info, hospital-level approver),
--   blocks + population denominators, disease surveillance (weekly series,
--   baselines, anomalies, response actions, field requests),
--   platform flags + history, access rules, report catalogue + export log,
--   facility compliance documents, doctor rota, staff invites,
--   permission matrix with hospital overrides, AI model register + release
--   requests + safety reports + drift, and de-identified rollup views.
-- All numbers here are aggregates or facility data; none identifies a patient.
-- Rule codes: CF140 (national rule cannot be overridden), CF141 (release needs sign-offs),
--   CF142 (flag change needs a reason / second signer), CF143 (export must be de-identified).
-- =====================================================================

-- ---------- Approvals: hospital-level approver, priority, reminders, more-info ----------
ALTER TYPE admin.admin_level ADD VALUE IF NOT EXISTS 'hospital' BEFORE 'district';
ALTER TYPE admin.approval_subject ADD VALUE IF NOT EXISTS 'special_category';
ALTER TYPE admin.approval_subject ADD VALUE IF NOT EXISTS 'hospital_profile_change';
ALTER TYPE admin.approval_subject ADD VALUE IF NOT EXISTS 'hospital_staff';
ALTER TYPE admin.approval_subject ADD VALUE IF NOT EXISTS 'admin_create';
ALTER TYPE admin.approval_status  ADD VALUE IF NOT EXISTS 'more_info';

ALTER TABLE admin.approval_request ADD COLUMN assigned_hospital_id uuid REFERENCES org.hospital(id);
ALTER TABLE admin.approval_request ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent'));
ALTER TABLE admin.approval_request ADD COLUMN reminders_sent smallint NOT NULL DEFAULT 0 CHECK (reminders_sent >= 0);
ALTER TABLE admin.approval_request ADD COLUMN more_info_requested_at timestamptz;
ALTER TABLE admin.approval_request ADD COLUMN more_info_note text;
-- "more_info" is not a final decision: allow it without decided_at.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'admin.approval_request'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%decided_at IS NOT NULL%' LOOP
    EXECUTE format('ALTER TABLE admin.approval_request DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE admin.approval_request ADD CONSTRAINT approval_decided_check
  CHECK (status::text IN ('pending','escalated','more_info') OR decided_at IS NOT NULL);
ALTER TABLE admin.approval_request ADD CONSTRAINT approval_hospital_scope_check
  CHECK (assigned_level::text <> 'hospital' OR assigned_hospital_id IS NOT NULL);
CREATE INDEX approval_hospital_inbox_ix ON admin.approval_request (assigned_hospital_id, status, due_at)
  WHERE assigned_hospital_id IS NOT NULL;

-- ---------- Blocks and population denominators ----------
CREATE TABLE geo.block (
  id           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  district_id  uuid NOT NULL REFERENCES geo.district(id),
  name         text NOT NULL,
  lgd_code     text UNIQUE,
  UNIQUE (district_id, name)
);
CREATE TABLE geo.population (
  id          uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  unit_type   text NOT NULL CHECK (unit_type IN ('block','district','state')),
  block_id    uuid REFERENCES geo.block(id),
  district_id uuid REFERENCES geo.district(id),
  state_id    smallint REFERENCES geo.state(id),
  as_of_year  smallint NOT NULL CHECK (as_of_year BETWEEN 2000 AND 2100),
  population  bigint NOT NULL CHECK (population > 0),
  source      text NOT NULL DEFAULT 'DEMO projection (synthetic)',
  CHECK ((unit_type = 'block'    AND block_id IS NOT NULL    AND district_id IS NULL AND state_id IS NULL) OR
         (unit_type = 'district' AND district_id IS NOT NULL AND block_id IS NULL    AND state_id IS NULL) OR
         (unit_type = 'state'    AND state_id IS NOT NULL    AND block_id IS NULL    AND district_id IS NULL))
);
CREATE UNIQUE INDEX population_block_uq    ON geo.population (block_id, as_of_year)    WHERE block_id IS NOT NULL;
CREATE UNIQUE INDEX population_district_uq ON geo.population (district_id, as_of_year) WHERE district_id IS NOT NULL;
CREATE UNIQUE INDEX population_state_uq    ON geo.population (state_id, as_of_year)    WHERE state_id IS NOT NULL;

-- ---------- Disease surveillance (counts only, no people) ----------
CREATE TABLE surveillance.disease (
  code                 citext PRIMARY KEY,                 -- dengue, fever, lepto
  name                 text NOT NULL,
  icd10                text,
  threshold_per_lakh   numeric(6,2) NOT NULL DEFAULT 10,   -- design: "above 10 / lakh"
  sd_threshold         numeric(4,2) NOT NULL DEFAULT 2,    -- "2 SD over baseline"
  is_active            boolean NOT NULL DEFAULT true
);
CREATE TABLE surveillance.case_report (
  id            uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  disease_code  citext NOT NULL REFERENCES surveillance.disease(code),
  district_id   uuid NOT NULL REFERENCES geo.district(id),
  block_id      uuid REFERENCES geo.block(id),
  hospital_id   uuid REFERENCES org.hospital(id),
  week_start    date NOT NULL CHECK (extract(isodow FROM week_start) = 1),     -- ISO week Monday
  cases         int NOT NULL CHECK (cases >= 0),
  source        text NOT NULL DEFAULT 'doctor' CHECK (source IN ('lab','doctor','syndromic','import')),
  reported_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (disease_code, district_id, block_id, hospital_id, week_start, source)
);
CREATE INDEX case_report_week_ix ON surveillance.case_report (district_id, disease_code, week_start);
CREATE TABLE surveillance.baseline (
  disease_code   citext NOT NULL REFERENCES surveillance.disease(code),
  district_id    uuid NOT NULL REFERENCES geo.district(id),
  iso_week       smallint NOT NULL CHECK (iso_week BETWEEN 1 AND 53),
  baseline_cases numeric(10,2) NOT NULL CHECK (baseline_cases >= 0),
  sd             numeric(10,2) NOT NULL DEFAULT 0 CHECK (sd >= 0),
  years_from     smallint NOT NULL DEFAULT 2021,
  years_to       smallint NOT NULL DEFAULT 2025,
  PRIMARY KEY (disease_code, district_id, iso_week)
);
CREATE TABLE surveillance.anomaly (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  disease_code          citext NOT NULL REFERENCES surveillance.disease(code),
  level                 admin.admin_level NOT NULL,
  zone_id               smallint REFERENCES geo.zone(id),
  state_id              smallint REFERENCES geo.state(id),
  district_id           uuid REFERENCES geo.district(id),
  week_start            date NOT NULL,
  hot_units             text[] NOT NULL DEFAULT '{}',              -- unit codes the map highlights
  confidence            numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  title                 text NOT NULL,
  body                  text NOT NULL,
  evidence              jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_simulated          boolean NOT NULL DEFAULT true,              -- labelled "simulated AI output"
  needs_epidemiologist_review boolean NOT NULL DEFAULT true,
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  reviewed_by_user_id   uuid REFERENCES identity.app_user(id),
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE surveillance.response_action (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  disease_code       citext NOT NULL REFERENCES surveillance.disease(code),
  level              admin.admin_level NOT NULL,
  zone_id            smallint REFERENCES geo.zone(id),
  state_id           smallint REFERENCES geo.state(id),
  district_id        uuid REFERENCES geo.district(id),
  title              text NOT NULL,
  meta               text,
  status             text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done')),
  tone               text,
  created_by_user_id uuid REFERENCES identity.app_user(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER response_action_updated BEFORE UPDATE ON surveillance.response_action FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();
CREATE TABLE surveillance.field_request (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  anomaly_id           uuid REFERENCES surveillance.anomaly(id),
  requested_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  team_name            text NOT NULL,
  status               text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','assigned','done','cancelled')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Weekly rate per lakh by district; counts under 5 are hidden (small-cell rule).
CREATE VIEW surveillance.v_district_week AS
SELECT c.disease_code, c.district_id, c.week_start, sum(c.cases)::int AS cases,
       CASE WHEN sum(c.cases) < 5 THEN NULL ELSE sum(c.cases)::int END AS cases_shown,
       (sum(c.cases) < 5) AS suppressed,
       p.population,
       round(sum(c.cases) * 100000.0 / p.population, 1) AS per_lakh,
       b.baseline_cases, b.sd,
       (sum(c.cases) > b.baseline_cases + d.sd_threshold * b.sd) AS above_threshold
FROM surveillance.case_report c
JOIN surveillance.disease d ON d.code = c.disease_code
LEFT JOIN LATERAL (SELECT population FROM geo.population gp WHERE gp.district_id = c.district_id
                    ORDER BY as_of_year DESC LIMIT 1) p ON true
LEFT JOIN surveillance.baseline b ON b.disease_code = c.disease_code AND b.district_id = c.district_id
                                 AND b.iso_week = extract(week FROM c.week_start)::int
GROUP BY c.disease_code, c.district_id, c.week_start, p.population, b.baseline_cases, b.sd, d.sd_threshold;

-- ---------- Platform flags (maintenance mode, AI on/off …) and access rules ----------
CREATE TABLE admin.platform_flag (
  code         citext PRIMARY KEY,                  -- maint, ai, reg, sms, bg
  label        text NOT NULL,
  description  text,
  enabled      boolean NOT NULL,
  updated_by   uuid REFERENCES identity.app_user(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin.platform_flag_history (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  flag_code           citext NOT NULL REFERENCES admin.platform_flag(code),
  enabled             boolean NOT NULL,
  changed_by_user_id  uuid REFERENCES identity.app_user(id),
  second_confirm_by   uuid REFERENCES identity.app_user(id),
  note                text,
  at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (second_confirm_by IS NULL OR second_confirm_by <> changed_by_user_id)
);
CREATE INDEX platform_flag_history_ix ON admin.platform_flag_history (flag_code, at DESC);
CREATE TRIGGER platform_flag_history_immutable BEFORE UPDATE OR DELETE ON admin.platform_flag_history
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
CREATE TRIGGER platform_flag_limited BEFORE UPDATE ON admin.platform_flag
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('enabled','updated_by','updated_at','label','description');
CREATE OR REPLACE FUNCTION admin.platform_flag_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(util.ctx_user_id(), NEW.updated_by);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_flag_stamp BEFORE UPDATE ON admin.platform_flag FOR EACH ROW EXECUTE FUNCTION admin.platform_flag_log();
CREATE OR REPLACE FUNCTION admin.platform_flag_log_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    INSERT INTO admin.platform_flag_history (flag_code, enabled, changed_by_user_id) VALUES (NEW.code, NEW.enabled, util.ctx_user_id());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_flag_history_row AFTER UPDATE ON admin.platform_flag FOR EACH ROW EXECUTE FUNCTION admin.platform_flag_log_after();

CREATE TABLE admin.access_rule (
  code         citext PRIMARY KEY,                  -- session_minutes, break_glass_review_hours, …
  value        jsonb NOT NULL,
  description  text,
  updated_by   uuid REFERENCES identity.app_user(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER access_rule_updated BEFORE UPDATE ON admin.access_rule FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- ---------- Reports and exports ----------
CREATE TABLE admin.report_definition (
  code             citext PRIMARY KEY,
  title            text NOT NULL,
  description      text,
  frequency        text NOT NULL CHECK (frequency IN ('weekly','monthly','on_demand')),
  scope_levels     admin.admin_level[] NOT NULL DEFAULT '{}',
  small_cell_min   smallint NOT NULL DEFAULT 5 CHECK (small_cell_min >= 0),
  is_active        boolean NOT NULL DEFAULT true
);
CREATE TABLE admin.report_export (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  report_code           citext NOT NULL REFERENCES admin.report_definition(code),
  requested_by_user_id  uuid NOT NULL REFERENCES identity.app_user(id),
  level                 admin.admin_level NOT NULL,
  zone_id               smallint REFERENCES geo.zone(id),
  state_id              smallint REFERENCES geo.state(id),
  district_id           uuid REFERENCES geo.district(id),
  period_label          text NOT NULL,                          -- 'Last 30 days', 'This quarter'
  period_from           date,
  period_to             date,
  format                text NOT NULL CHECK (format IN ('csv','pdf')),
  storage_key           text,
  size_bytes            bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  deidentified          boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL DEFAULT now() + interval '30 days',
  CONSTRAINT export_must_be_deidentified CHECK (deidentified)       -- CF143: exports never contain identities
);
CREATE INDEX report_export_user_ix ON admin.report_export (requested_by_user_id, created_at DESC);
CREATE TRIGGER report_export_immutable BEFORE UPDATE OR DELETE ON admin.report_export FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Facility compliance documents (licence, NOC, registers, GST, cold-chain log …) ----------
CREATE TABLE org.facility_document (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  facility_type         text NOT NULL CHECK (facility_type IN ('hospital','pharmacy')),
  hospital_id           uuid REFERENCES org.hospital(id),
  pharmacy_id           uuid REFERENCES org.pharmacy(id),
  doc_type              text NOT NULL,                 -- drug_licence, gst, fire_noc, cold_chain_log, narcotic_return, photo_id …
  title                 text NOT NULL,
  reference_no          text,
  valid_from            date,
  valid_until           date,
  storage_key           text,
  status                text NOT NULL DEFAULT 'under_review'
                        CHECK (status IN ('verified','under_review','renew_soon','expired','upcoming','rejected')),
  verified_by_user_id   uuid REFERENCES identity.app_user(id),
  verified_at           timestamptz,
  uploaded_by_user_id   uuid REFERENCES identity.app_user(id),
  uploaded_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(hospital_id, pharmacy_id) = 1),
  CHECK ((facility_type = 'hospital') = (hospital_id IS NOT NULL)),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE INDEX facility_document_hospital_ix ON org.facility_document (hospital_id, doc_type) WHERE hospital_id IS NOT NULL;
CREATE INDEX facility_document_pharmacy_ix ON org.facility_document (pharmacy_id, doc_type) WHERE pharmacy_id IS NOT NULL;
CREATE INDEX facility_document_expiry_ix ON org.facility_document (valid_until) WHERE valid_until IS NOT NULL;
CREATE TRIGGER facility_document_limited BEFORE UPDATE ON org.facility_document
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('status','verified_by_user_id','verified_at');
CREATE TRIGGER facility_document_no_delete BEFORE DELETE ON org.facility_document FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Doctor rota (week roster, publish) ----------
CREATE TABLE org.roster_week (
  hospital_id          uuid NOT NULL REFERENCES org.hospital(id),
  week_start           date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  min_doctors_per_day  smallint NOT NULL DEFAULT 4,
  min_night_oncall     smallint NOT NULL DEFAULT 1,
  published_at         timestamptz,
  published_by_user_id uuid REFERENCES identity.app_user(id),
  PRIMARY KEY (hospital_id, week_start),
  CHECK ((published_at IS NULL) = (published_by_user_id IS NULL))
);
CREATE TABLE org.doctor_roster (
  id              uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id     uuid NOT NULL REFERENCES org.hospital(id),
  doctor_user_id  uuid NOT NULL REFERENCES identity.app_user(id),
  duty_date       date NOT NULL,
  shift           text NOT NULL CHECK (shift IN ('op','night','off','ward_round','teleconsult')),
  UNIQUE (hospital_id, doctor_user_id, duty_date)
);
CREATE INDEX doctor_roster_day_ix ON org.doctor_roster (hospital_id, duty_date);
CREATE VIEW org.v_roster_coverage AS
SELECT r.hospital_id, r.duty_date,
       count(*) FILTER (WHERE r.shift <> 'off')::int AS doctors_on_duty,
       count(*) FILTER (WHERE r.shift = 'night')::int AS night_oncall,
       (count(*) FILTER (WHERE r.shift <> 'off') < coalesce(w.min_doctors_per_day, 4)
        OR count(*) FILTER (WHERE r.shift = 'night') < coalesce(w.min_night_oncall, 1)) AS thin_cover
FROM org.doctor_roster r
LEFT JOIN org.roster_week w ON w.hospital_id = r.hospital_id AND w.week_start = date_trunc('week', r.duty_date)::date
GROUP BY r.hospital_id, r.duty_date, w.min_doctors_per_day, w.min_night_oncall;

-- ---------- Staff profile extras (directory, nurse registration, shift) ----------
ALTER TABLE identity.staff_profile ADD COLUMN employee_code text;                -- 'DEMO-ST-0412'
ALTER TABLE identity.staff_profile ADD COLUMN registration_no text;             -- council / registry number (KNMC, KPMC, AERB …)
ALTER TABLE identity.staff_profile ADD COLUMN designation text;                  -- Staff nurse, Charge nurse, DMLT technician …
ALTER TABLE identity.staff_profile ADD COLUMN shift text CHECK (shift IS NULL OR shift IN ('day','night','rotating'));
ALTER TABLE identity.staff_profile ADD COLUMN is_charge boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX staff_employee_code_uq ON identity.staff_profile (hospital_id, employee_code) WHERE employee_code IS NOT NULL;

-- ---------- Staff invitations (hospital admin / pharmacy admin invite; activation link) ----------
CREATE TABLE identity.staff_invite (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id         uuid REFERENCES org.hospital(id),
  pharmacy_id         uuid REFERENCES org.pharmacy(id),
  role_kind           text NOT NULL CHECK (role_kind IN ('doctor','nurse','lab','radiology','front_desk','pharmacist')),
  full_name           text NOT NULL,
  email_hash          bytea NOT NULL,
  email_enc           bytea,
  enc_key_id          text,
  registration_no     text,
  employee_code       text,
  ward_id             uuid REFERENCES org.ward(id),
  shift               text CHECK (shift IS NULL OR shift IN ('day','night','rotating')),
  token_hash          bytea NOT NULL UNIQUE,                 -- the link carries the token; only its hash is stored
  invited_by_user_id  uuid NOT NULL REFERENCES identity.app_user(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_sent_at        timestamptz NOT NULL DEFAULT now(),
  resend_count        smallint NOT NULL DEFAULT 0,
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at         timestamptz,
  accepted_user_id    uuid REFERENCES identity.app_user(id),
  revoked_at          timestamptz,
  CHECK (num_nonnulls(hospital_id, pharmacy_id) = 1),
  CHECK (role_kind <> 'pharmacist' OR pharmacy_id IS NOT NULL),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX staff_invite_open_ix ON identity.staff_invite (hospital_id, pharmacy_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ---------- Permission matrix (national rules locked, hospital settings editable) ----------
CREATE TABLE admin.permission (
  code    citext PRIMARY KEY,
  label   text NOT NULL,
  note    text,
  locked  boolean NOT NULL DEFAULT false              -- true = national rule, hospitals cannot change it
);
CREATE TABLE admin.role_permission (
  role_key         text NOT NULL CHECK (role_key IN ('doctor','nurse','lab','radiology','pharmacist','front_desk')),
  permission_code  citext NOT NULL REFERENCES admin.permission(code),
  allowed          boolean NOT NULL,
  PRIMARY KEY (role_key, permission_code)
);
CREATE TABLE admin.hospital_permission_override (
  hospital_id      uuid NOT NULL REFERENCES org.hospital(id),
  role_key         text NOT NULL,
  permission_code  citext NOT NULL,
  allowed          boolean NOT NULL,
  updated_by       uuid REFERENCES identity.app_user(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, role_key, permission_code),
  FOREIGN KEY (role_key, permission_code) REFERENCES admin.role_permission(role_key, permission_code)
);
CREATE OR REPLACE FUNCTION admin.check_override() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF (SELECT locked FROM admin.permission WHERE code = NEW.permission_code) THEN
    RAISE EXCEPTION 'CF140: % is a national rule and cannot be changed by a hospital', NEW.permission_code USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER hospital_permission_check BEFORE INSERT OR UPDATE ON admin.hospital_permission_override
  FOR EACH ROW EXECUTE FUNCTION admin.check_override();
CREATE VIEW admin.v_effective_permission AS
SELECT h.id AS hospital_id, rp.role_key, rp.permission_code, p.label, p.locked,
       COALESCE(o.allowed, rp.allowed) AS allowed
FROM org.hospital h CROSS JOIN admin.role_permission rp
JOIN admin.permission p ON p.code = rp.permission_code
LEFT JOIN admin.hospital_permission_override o
       ON o.hospital_id = h.id AND o.role_key = rp.role_key AND o.permission_code = rp.permission_code;

-- ---------- AI model register, release requests, safety reports, drift ----------
CREATE TABLE ai.model (
  id          uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  name        text NOT NULL UNIQUE,                          -- 'Clinical guidance LLM'
  module      text NOT NULL CHECK (module IN ('symptom_chat','image','genomic','temporal','citizen_guidance_chat','surveillance')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai.model_version (
  id              uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  model_id        uuid NOT NULL REFERENCES ai.model(id),
  version         text NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shadow','live','on_hold','rolled_back','retired')),
  meta            text,
  drift_pct       numeric(5,2),
  agreement_pct   numeric(5,2),
  is_simulated    boolean NOT NULL DEFAULT true,             -- every alpha model is simulated
  released_at     timestamptz,
  UNIQUE (model_id, version)
);
ALTER TABLE ai.ai_run ADD COLUMN model_version_id uuid REFERENCES ai.model_version(id);   -- optional link; model_name/version text stay

CREATE TABLE ai.release_request (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  model_version_id      uuid NOT NULL REFERENCES ai.model_version(id),
  from_version_id       uuid REFERENCES ai.model_version(id),
  submitted_by          text NOT NULL,                        -- 'AI safety board'
  submitted_by_user_id  uuid REFERENCES identity.app_user(id),
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  required_signoffs     smallint NOT NULL DEFAULT 2 CHECK (required_signoffs > 0),
  status                text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','approved','on_hold','rejected','released')),
  shadow_run_days       smallint NOT NULL DEFAULT 14,
  metrics               jsonb NOT NULL DEFAULT '{}'::jsonb,   -- agreement, unsafe advice %, regional gain, test cases
  checklist             jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE ai.release_signoff (
  request_id        uuid NOT NULL REFERENCES ai.release_request(id),
  approver_user_id  uuid NOT NULL REFERENCES identity.app_user(id),
  decision          text NOT NULL CHECK (decision IN ('approve','hold')),
  reason            text,
  signed_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, approver_user_id)
);
CREATE TRIGGER release_signoff_immutable BEFORE UPDATE OR DELETE ON ai.release_signoff FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
-- A request can be marked 'released' only with enough approvals.
CREATE OR REPLACE FUNCTION ai.check_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE n int;
BEGIN
  IF NEW.status = 'released' AND OLD.status <> 'released' THEN
    SELECT count(*) INTO n FROM ai.release_signoff WHERE request_id = NEW.id AND decision = 'approve';
    IF n < NEW.required_signoffs THEN
      RAISE EXCEPTION 'CF141: release needs % approvals (has %)', NEW.required_signoffs, n USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER release_request_check BEFORE UPDATE ON ai.release_request FOR EACH ROW EXECUTE FUNCTION ai.check_release();

CREATE TABLE ai.safety_report (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  model_version_id   uuid REFERENCES ai.model_version(id),
  reporter_user_id   uuid NOT NULL REFERENCES identity.app_user(id),          -- clinician
  run_id             uuid REFERENCES ai.ai_run(id),
  kind               text NOT NULL CHECK (kind IN ('unsafe_advice','missed_finding','bias','wrong_language','other')),
  severity           text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  title              text NOT NULL,
  detail             text,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','closed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz
);
CREATE INDEX safety_report_status_ix ON ai.safety_report (status, created_at DESC);
CREATE TABLE ai.drift_metric (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  model_version_id   uuid NOT NULL REFERENCES ai.model_version(id),
  measured_at        timestamptz NOT NULL DEFAULT now(),
  metric             text NOT NULL CHECK (metric IN ('agreement_pct','drift_pct','unsafe_advice_pct')),
  value              numeric(8,3) NOT NULL,
  region             text,                                  -- 'North-east zone'
  sample_size        int CHECK (sample_size IS NULL OR sample_size >= 0)
);
CREATE INDEX drift_metric_ix ON ai.drift_metric (model_version_id, metric, measured_at DESC);
CREATE TRIGGER drift_metric_immutable BEFORE UPDATE OR DELETE ON ai.drift_metric FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
-- "Automatic rollback if drift passes 5 %": a live version whose drift passes the limit is rolled back.
CREATE OR REPLACE FUNCTION ai.drift_rollback() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE limit_pct numeric;
BEGIN
  IF NEW.metric = 'drift_pct' THEN
    SELECT COALESCE((value #>> '{}')::numeric, 5) INTO limit_pct FROM admin.access_rule WHERE code = 'ai_rollback_drift_pct';
    limit_pct := COALESCE(limit_pct, 5);
    UPDATE ai.model_version SET drift_pct = NEW.value WHERE id = NEW.model_version_id;
    IF NEW.value > limit_pct THEN
      UPDATE ai.model_version SET status = 'rolled_back' WHERE id = NEW.model_version_id AND status = 'live';
    END IF;
  ELSIF NEW.metric = 'agreement_pct' THEN
    UPDATE ai.model_version SET agreement_pct = NEW.value WHERE id = NEW.model_version_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER drift_metric_apply AFTER INSERT ON ai.drift_metric FOR EACH ROW EXECUTE FUNCTION ai.drift_rollback();

-- =====================================================================
-- De-identified rollup views for the consoles (cf_report reads only these)
-- =====================================================================
-- Registered share: citizens with an ABHA-linked account per population.
CREATE VIEW report.v_registered_share AS
SELECT c.district_id, count(*) FILTER (WHERE p.abha_number IS NOT NULL)::int AS abha_linked,
       count(*)::int AS registered, pop.population,
       round(100.0 * count(*) FILTER (WHERE p.abha_number IS NOT NULL) / NULLIF(pop.population, 0), 1) AS pct_of_population
FROM identity.citizen_profile c
JOIN identity.person p ON p.id = c.person_id
LEFT JOIN LATERAL (SELECT population FROM geo.population gp WHERE gp.district_id = c.district_id ORDER BY as_of_year DESC LIMIT 1) pop ON true
WHERE c.district_id IS NOT NULL
GROUP BY c.district_id, pop.population;

CREATE VIEW report.v_registrations_monthly AS
SELECT c.district_id, date_trunc('month', p.created_at)::date AS month, p.registration_channel::text AS channel, count(*)::int AS registrations
FROM identity.person p JOIN identity.citizen_profile c ON c.person_id = p.id
GROUP BY 1, 2, 3;

-- Beds by district / state / zone / national (from the published counts).
CREATE VIEW report.v_beds_rollup AS
SELECT 'district'::text AS level, h.district_id::text AS unit, b.bed_type::text, sum(b.total)::int AS total, sum(b.free)::int AS free
FROM org.bed_availability b JOIN org.hospital h ON h.id = b.hospital_id AND h.status = 'active' GROUP BY h.district_id, b.bed_type
UNION ALL
SELECT 'state', d.state_id::text, b.bed_type::text, sum(b.total)::int, sum(b.free)::int
FROM org.bed_availability b JOIN org.hospital h ON h.id = b.hospital_id AND h.status = 'active'
JOIN geo.district d ON d.id = h.district_id GROUP BY d.state_id, b.bed_type
UNION ALL
SELECT 'zone', s.zone_id::text, b.bed_type::text, sum(b.total)::int, sum(b.free)::int
FROM org.bed_availability b JOIN org.hospital h ON h.id = b.hospital_id AND h.status = 'active'
JOIN geo.district d ON d.id = h.district_id JOIN geo.state s ON s.id = d.state_id GROUP BY s.zone_id, b.bed_type
UNION ALL
SELECT 'national', 'IN', b.bed_type::text, sum(b.total)::int, sum(b.free)::int
FROM org.bed_availability b JOIN org.hospital h ON h.id = b.hospital_id AND h.status = 'active' GROUP BY b.bed_type;

-- Grievance ageing by district and escalation level.
CREATE VIEW report.v_grievance_ageing AS
SELECT c.district_id, c.escalation_level, c.status,
       count(*)::int AS complaints,
       count(*) FILTER (WHERE now() - c.created_at <= interval '2 days')::int  AS age_0_2_days,
       count(*) FILTER (WHERE now() - c.created_at > interval '2 days' AND now() - c.created_at <= interval '7 days')::int AS age_3_7_days,
       count(*) FILTER (WHERE now() - c.created_at > interval '7 days')::int   AS age_over_7_days
FROM engage.complaint c GROUP BY c.district_id, c.escalation_level, c.status;

-- Approval funnel and decision time by level and subject.
CREATE VIEW report.v_approval_funnel AS
SELECT r.assigned_level::text AS level, r.subject_type::text AS subject, r.status::text AS status, count(*)::int AS requests,
       round(avg(extract(epoch FROM (r.decided_at - r.submitted_at)) / 86400)::numeric, 1) AS avg_days_to_decide,
       count(*) FILTER (WHERE r.decided_at IS NOT NULL AND r.decided_at <= r.due_at)::int AS decided_in_sla
FROM admin.approval_request r GROUP BY 1, 2, 3;

-- Doctor sessions: live right now and by hour of day (per district of the doctor's hospital).
CREATE VIEW report.v_live_sessions AS
SELECT h.district_id, count(*)::int AS live_sessions
FROM access.access_session s
JOIN identity.doctor_profile dp ON dp.user_id = s.user_id
JOIN org.hospital h ON h.id = dp.hospital_id
WHERE s.ended_at IS NULL AND s.expires_at > now()
GROUP BY h.district_id;
CREATE VIEW report.v_sessions_by_hour AS
SELECT h.district_id, (s.started_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
       extract(hour FROM s.started_at AT TIME ZONE 'Asia/Kolkata')::int AS hour, count(*)::int AS sessions
FROM access.access_session s
JOIN identity.doctor_profile dp ON dp.user_id = s.user_id
JOIN org.hospital h ON h.id = dp.hospital_id
GROUP BY 1, 2, 3;

CREATE VIEW report.v_disease_weekly AS
SELECT disease_code, district_id, week_start, cases_shown, suppressed, population, per_lakh, above_threshold
FROM surveillance.v_district_week;

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA geo, surveillance, admin, org, identity TO cf_app;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA ai TO cf_app, cf_ai;
GRANT UPDATE ON ai.model_version, ai.release_request, ai.safety_report TO cf_app;
GRANT SELECT ON ALL TABLES IN SCHEMA geo TO cf_ai;
GRANT USAGE ON SCHEMA surveillance TO cf_report;
GRANT SELECT ON surveillance.v_district_week TO cf_report;
GRANT SELECT ON ALL TABLES IN SCHEMA report TO cf_report;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA surveillance, admin, ai, org TO cf_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA geo, surveillance, admin, org, identity, ai FROM cf_app, cf_ai, cf_report, cf_auditor;

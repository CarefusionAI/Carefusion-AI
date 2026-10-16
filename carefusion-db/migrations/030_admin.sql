-- =====================================================================
-- 030_admin.sql : admin posts, approvals with time limits, flags,
--                 suspensions, misuse cases, death records, pattern alerts
-- =====================================================================

CREATE TYPE admin.admin_level     AS ENUM ('district','state','zonal','central');
CREATE TYPE admin.approval_subject AS ENUM (
  'doctor','hospital_admin','pharmacy_admin','hospital','pharmacy',
  'zonal_admin','state_admin','district_admin','flagged_citizen','flagged_doctor');
CREATE TYPE admin.approval_status AS ENUM ('pending','approved','rejected','escalated','cancelled');
CREATE TYPE admin.flag_reason     AS ENUM (
  'face_mismatch','duplicate','suspicious_data','hpr_mismatch','licence_mismatch','other');
CREATE TYPE admin.task_status     AS ENUM ('open','in_review','closed');

-- ---------- Who is which admin, for which area ----------
CREATE TABLE admin.admin_post (
  id                      uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  user_id                 uuid NOT NULL REFERENCES identity.app_user(id),
  level                   admin.admin_level NOT NULL,
  zone_id                 smallint REFERENCES geo.zone(id),
  state_id                smallint REFERENCES geo.state(id),
  district_id             uuid REFERENCES geo.district(id),
  jan_parichay_ref        text,                         -- SSO subject (mock in alpha)
  valid                   tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),
  handed_over_to_user_id  uuid REFERENCES identity.app_user(id),
  CHECK (
    (level = 'central'  AND zone_id IS NULL AND state_id IS NULL AND district_id IS NULL) OR
    (level = 'zonal'    AND zone_id IS NOT NULL AND state_id IS NULL AND district_id IS NULL) OR
    (level = 'state'    AND state_id IS NOT NULL AND zone_id IS NULL AND district_id IS NULL) OR
    (level = 'district' AND district_id IS NOT NULL AND zone_id IS NULL AND state_id IS NULL)),
  EXCLUDE USING gist (user_id WITH =, valid WITH &&)    -- one active post per admin
);
CREATE INDEX admin_post_area_ix ON admin.admin_post (level, zone_id, state_id, district_id);

-- ---------- Approval time limits per subject and step (days still to decide) ----------
CREATE TABLE admin.approval_rule (
  subject_type        admin.approval_subject NOT NULL,
  step                smallint NOT NULL CHECK (step > 0),
  approver_level      admin.admin_level NOT NULL,
  time_limit          interval NOT NULL DEFAULT interval '7 days',  -- placeholder until decided
  escalate_to_level   admin.admin_level,
  needs_two_persons   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (subject_type, step)
);

-- ---------- Every approval, in one table ----------
CREATE TABLE admin.approval_request (
  id                       uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  subject_type             admin.approval_subject NOT NULL,
  subject_user_id          uuid REFERENCES identity.app_user(id),
  subject_person_id        uuid REFERENCES identity.person(id),
  subject_hospital_id      uuid REFERENCES org.hospital(id),
  subject_pharmacy_id      uuid REFERENCES org.pharmacy(id),
  step                     smallint NOT NULL DEFAULT 1,
  assigned_level           admin.admin_level NOT NULL,
  assigned_zone_id         smallint REFERENCES geo.zone(id),
  assigned_state_id        smallint REFERENCES geo.state(id),
  assigned_district_id     uuid REFERENCES geo.district(id),
  status                   admin.approval_status NOT NULL DEFAULT 'pending',
  submitted_at             timestamptz NOT NULL DEFAULT now(),
  due_at                   timestamptz NOT NULL,
  escalated_at             timestamptz,
  escalated_to_id          uuid REFERENCES admin.approval_request(id),
  decided_by_user_id       uuid REFERENCES identity.app_user(id),
  second_approver_user_id  uuid REFERENCES identity.app_user(id),
  decided_at               timestamptz,
  reason                   text,
  check_results            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- HPR/HFR/licence/e-KYC results
  CHECK (num_nonnulls(subject_user_id, subject_person_id, subject_hospital_id, subject_pharmacy_id) >= 1),
  CHECK (status IN ('pending','escalated') OR decided_at IS NOT NULL),
  CHECK (status <> 'rejected' OR reason IS NOT NULL),
  CHECK (second_approver_user_id IS NULL OR second_approver_user_id <> decided_by_user_id)
);
CREATE INDEX approval_inbox_ix ON admin.approval_request
  (assigned_level, assigned_district_id, assigned_state_id, assigned_zone_id, status, due_at);
CREATE INDEX approval_overdue_ix ON admin.approval_request (due_at) WHERE status = 'pending';

-- ---------- Flags ----------
CREATE TABLE admin.account_flag (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  subject_person_id    uuid REFERENCES identity.person(id),
  subject_user_id      uuid REFERENCES identity.app_user(id),
  reason               admin.flag_reason NOT NULL,
  details              jsonb NOT NULL DEFAULT '{}'::jsonb,
  raised_by_user_id    uuid REFERENCES identity.app_user(id),   -- null = system
  raised_at            timestamptz NOT NULL DEFAULT now(),
  approval_request_id  uuid REFERENCES admin.approval_request(id),
  status               admin.task_status NOT NULL DEFAULT 'open',
  CHECK (num_nonnulls(subject_person_id, subject_user_id) >= 1)
);

-- ---------- Suspensions (two-person approval for admins) ----------
CREATE TABLE admin.suspension (
  id                       uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  user_id                  uuid NOT NULL REFERENCES identity.app_user(id),
  reason                   text NOT NULL,
  suspended_by_user_id     uuid NOT NULL REFERENCES identity.app_user(id),
  second_approver_user_id  uuid REFERENCES identity.app_user(id),
  valid                    tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),
  lifted_by_user_id        uuid REFERENCES identity.app_user(id),
  CHECK (second_approver_user_id IS NULL OR second_approver_user_id <> suspended_by_user_id),
  CHECK (user_id <> suspended_by_user_id)
);

-- ---------- Unusual-pattern alerts (de-identified) ----------
CREATE TABLE admin.unusual_pattern_alert (
  id            uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  area_level    admin.admin_level NOT NULL,
  zone_id       smallint REFERENCES geo.zone(id),
  state_id      smallint REFERENCES geo.state(id),
  district_id   uuid REFERENCES geo.district(id),
  alert_type    text NOT NULL,                          -- many_break_glass, disease_spike, shortage …
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,     -- no names, no record content
  created_at    timestamptz NOT NULL DEFAULT now(),
  status        admin.task_status NOT NULL DEFAULT 'open',
  closed_by     uuid REFERENCES identity.app_user(id),
  closed_at     timestamptz
);

-- ---------- Death record ----------
CREATE TABLE admin.death_record (
  person_id             uuid PRIMARY KEY REFERENCES identity.person(id),
  date_of_death         date NOT NULL,
  source                text NOT NULL CHECK (source IN ('hospital','certificate','crs')),
  recorded_by_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  certificate_doc_id    uuid,                            -- FK in 090
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  family_notified_at    timestamptz,
  notto_notified_at     timestamptz
);

-- On a death record: mark person deceased and lock every account.
CREATE OR REPLACE FUNCTION admin.apply_death() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE identity.person SET deceased_at = NEW.date_of_death::timestamptz WHERE id = NEW.person_id;
  UPDATE identity.app_user
     SET status = 'locked_deceased', status_reason = 'death recorded', deactivated_at = now()
   WHERE person_id = NEW.person_id AND status <> 'locked_deceased';
  RETURN NEW;
END $$;
CREATE TRIGGER death_apply AFTER INSERT ON admin.death_record
  FOR EACH ROW EXECUTE FUNCTION admin.apply_death();
CREATE TRIGGER death_no_delete BEFORE DELETE ON admin.death_record
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Rating rules master list ----------
CREATE TABLE admin.rating_rule (
  code        citext PRIMARY KEY,
  description text NOT NULL,
  value       jsonb NOT NULL
);

-- ---------- Blood donor eligibility rules (⚠ values to verify with NBTC rules) ----------
CREATE TABLE admin.blood_eligibility_rule (
  code        citext PRIMARY KEY,           -- min_age, max_age, min_weight_kg, gap_after_donation
  value       jsonb NOT NULL,
  verified    boolean NOT NULL DEFAULT false
);

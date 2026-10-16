-- =====================================================================
-- 040_access.sql : opening a patient's record — key sessions, card + OTP,
--                  admission mode, emergency access, break-glass,
--                  location checks, misuse cases
-- Live 10-second key validation and OTPs happen in Valkey; this is the record.
-- =====================================================================

CREATE TYPE access.session_mode AS ENUM (
  'key','card_otp','admission','emergency_contact','emergency_aadhaar_fallback','break_glass');
CREATE TYPE access.ended_by AS ENUM ('patient','timeout','doctor','discharge','admin','system');
CREATE TYPE access.review_status AS ENUM ('pending','ok','misuse');

-- ---------- Admission mode ----------
CREATE TABLE access.admission (
  id                     uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id      uuid NOT NULL REFERENCES identity.person(id),
  hospital_id            uuid NOT NULL REFERENCES org.hospital(id),
  ward                   text,
  admitted_at            timestamptz NOT NULL DEFAULT now(),
  discharged_at          timestamptz,
  granted_by_person_id   uuid NOT NULL REFERENCES identity.person(id),   -- patient or emergency contact
  consent_id             uuid REFERENCES identity.consent_record(id),
  CHECK (discharged_at IS NULL OR discharged_at > admitted_at)
);
CREATE UNIQUE INDEX admission_one_open_uq ON access.admission (patient_person_id) WHERE discharged_at IS NULL;

CREATE TABLE access.admission_team (
  admission_id  uuid NOT NULL REFERENCES access.admission(id),
  user_id       uuid NOT NULL REFERENCES identity.app_user(id),
  team_role     text NOT NULL CHECK (team_role IN ('doctor','nurse')),
  added_at      timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz,
  PRIMARY KEY (admission_id, user_id, added_at)
);

-- ---------- Every opening of a full record ----------
CREATE TABLE access.access_session (
  id                       uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id        uuid NOT NULL REFERENCES identity.person(id),
  user_id                  uuid NOT NULL REFERENCES identity.app_user(id),
  mode                     access.session_mode NOT NULL,
  key_token_id             text,                       -- id of the single-use 10-s key / card OTP
  admission_id             uuid REFERENCES access.admission(id),
  started_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz NOT NULL,
  ended_at                 timestamptz,
  ended_by                 access.ended_by,
  start_inside_geofence    boolean,
  reason                   text,                       -- needed outside geofence / break-glass
  is_family_member         boolean NOT NULL DEFAULT false,
  CHECK (expires_at > started_at),
  CHECK (mode NOT IN ('key','card_otp') OR expires_at <= started_at + interval '30 minutes'),
  CHECK (mode NOT IN ('key','card_otp') OR key_token_id IS NOT NULL),
  CHECK (mode <> 'admission' OR admission_id IS NOT NULL),
  CHECK (mode <> 'break_glass' OR reason IS NOT NULL),
  CHECK (start_inside_geofence IS DISTINCT FROM false OR reason IS NOT NULL),
  CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
-- One doctor at a time for key / card sessions.
CREATE UNIQUE INDEX access_one_key_session_uq
  ON access.access_session (patient_person_id)
  WHERE ended_at IS NULL AND mode IN ('key','card_otp');
CREATE UNIQUE INDEX access_key_token_uq ON access.access_session (key_token_id) WHERE key_token_id IS NOT NULL;
CREATE INDEX access_user_ix    ON access.access_session (user_id, started_at DESC);
CREATE INDEX access_patient_ix ON access.access_session (patient_person_id, started_at DESC);

-- Rules on opening: no own record; no account that is not active; family flag.
CREATE OR REPLACE FUNCTION access.check_session_open() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  opener_person uuid;
  opener_status identity.account_status;
  opener_type   identity.account_type;
BEGIN
  SELECT person_id, status, account_type INTO opener_person, opener_status, opener_type
  FROM identity.app_user WHERE id = NEW.user_id;

  IF opener_status <> 'active' THEN
    RAISE EXCEPTION 'CF020: account % is not active', NEW.user_id USING ERRCODE = 'check_violation';
  END IF;
  IF opener_type NOT IN ('doctor','staff') THEN
    RAISE EXCEPTION 'CF021: only doctors (and nurses in admission mode) open records' USING ERRCODE = 'check_violation';
  END IF;
  IF opener_type = 'staff' AND NEW.mode <> 'admission' THEN
    RAISE EXCEPTION 'CF022: staff may open records only in admission mode' USING ERRCODE = 'check_violation';
  END IF;
  IF opener_person = NEW.patient_person_id THEN
    RAISE EXCEPTION 'CF023: a doctor account cannot open its own citizen record' USING ERRCODE = 'check_violation';
  END IF;
  -- Family flag: opener is an emergency contact or guardian of the patient (rule to confirm).
  IF EXISTS (SELECT 1 FROM identity.emergency_contact
             WHERE citizen_person_id = NEW.patient_person_id AND contact_person_id = opener_person
               AND removed_at IS NULL)
     OR EXISTS (SELECT 1 FROM identity.citizen_profile
                WHERE person_id = NEW.patient_person_id AND guardian_person_id = opener_person) THEN
    NEW.is_family_member := true;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access_session_open BEFORE INSERT ON access.access_session
  FOR EACH ROW EXECUTE FUNCTION access.check_session_open();

-- Sessions are history: only ending fields may change; never deleted.
CREATE TRIGGER access_session_only_end BEFORE UPDATE ON access.access_session
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('ended_at','ended_by');
CREATE TRIGGER access_session_no_delete BEFORE DELETE ON access.access_session
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Emergency access details and two-level review ----------
CREATE TABLE access.emergency_access (
  session_id                    uuid PRIMARY KEY REFERENCES access.access_session(id),
  contact_person_id             uuid REFERENCES identity.person(id),
  approved_on_contact_phone_at  timestamptz,
  fallback_used                 boolean NOT NULL DEFAULT false,   -- contact's Aadhaar (token) + code typed by doctor
  break_glass_reason            text,
  district_review_status        access.review_status NOT NULL DEFAULT 'pending',
  district_reviewer_id          uuid REFERENCES identity.app_user(id),
  district_reviewed_at          timestamptz,
  central_verify_status         access.review_status NOT NULL DEFAULT 'pending',
  central_verifier_id           uuid REFERENCES identity.app_user(id),
  central_verified_at           timestamptz,
  central_due_at                timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  patient_notified_at           timestamptz,
  CHECK (contact_person_id IS NOT NULL OR break_glass_reason IS NOT NULL)
);
CREATE INDEX emergency_review_ix ON access.emergency_access (district_review_status, central_verify_status, central_due_at);

-- ---------- Location checks (at opening and every 5 minutes) ----------
CREATE TABLE access.location_check (
  id                uuid NOT NULL DEFAULT util.uuid_v7(),
  session_id        uuid NOT NULL REFERENCES access.access_session(id),
  checked_at        timestamptz NOT NULL DEFAULT now(),
  point             geometry(Point, 4326),               -- exact GPS, or null if refused
  ip_area           text,
  inside_geofence   boolean,
  distance_m        integer,
  reason            text,
  PRIMARY KEY (id, checked_at)
) PARTITION BY RANGE (checked_at);
CREATE INDEX location_session_ix ON access.location_check (session_id, checked_at);
CREATE TABLE access.location_check_default PARTITION OF access.location_check DEFAULT;
CREATE TRIGGER location_check_immutable BEFORE UPDATE OR DELETE ON access.location_check
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Misuse cases (break-glass or location rule) ----------
CREATE TABLE access.misuse_case (
  id                     uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  session_id             uuid NOT NULL REFERENCES access.access_session(id),
  found_by_user_id       uuid NOT NULL REFERENCES identity.app_user(id),
  finding                text NOT NULL,
  suspension_id          uuid REFERENCES admin.suspension(id),
  council_reported_at    timestamptz,
  council_ref            text,
  patient_informed_at    timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 020_identity.sql : people, login accounts, every role's profile,
--                    devices, emergency contacts, consents
-- Passwords / OTP / MFA / hardware keys / Jan Parichay live in Keycloak.
-- =====================================================================

CREATE TYPE identity.sex             AS ENUM ('female','male','other');
CREATE TYPE identity.check_status    AS ENUM ('pending','passed','failed','assisted');
CREATE TYPE identity.account_type    AS ENUM (
  'citizen','doctor','staff','hospital_admin','pharmacy_admin','pharmacist',
  'district_admin','state_admin','zonal_admin','central_admin');
CREATE TYPE identity.account_status  AS ENUM (
  'pending','active','rejected','suspended','deactivated','locked_deceased');
CREATE TYPE identity.blood_group     AS ENUM ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown');
CREATE TYPE identity.organ_status    AS ENUM ('none','pledged','withdrawn');
CREATE TYPE identity.employment_type AS ENUM ('govt','private');
CREATE TYPE identity.signing_method  AS ENUM ('dsc','aadhaar_esign','mock');
CREATE TYPE identity.staff_role      AS ENUM ('nurse','lab','radiology');
CREATE TYPE identity.consent_purpose AS ENUM (
  'privacy_notice','location_logging','ai_research','minor_guardian',
  'admission_access','abdm_share','organ_pledge','notifications');

-- ---------- person : one real human ----------
CREATE TABLE identity.person (
  id                     uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  full_name              text NOT NULL,
  date_of_birth          date NOT NULL CHECK (date_of_birth > '1900-01-01'),
  sex                    identity.sex NOT NULL,
  aadhaar_token          text UNIQUE,                 -- UIDAI reference token ONLY, never the number
  abha_number            text UNIQUE,                 -- 14-digit ABHA (DEMO-… in alpha)
  abha_address           citext UNIQUE,
  pan_token              text,                        -- optional
  phone_enc              bytea,                       -- encrypted (envelope, AES-256)
  phone_hash             bytea UNIQUE,                -- HMAC-SHA256 for lookup
  email_enc              bytea,
  email_hash             bytea UNIQUE,
  enc_key_id             text,                        -- key id used for *_enc columns
  photo_key              text,                        -- R2 key (⚠ verify UIDAI rules before storing)
  kyc_status             identity.check_status NOT NULL DEFAULT 'pending',
  face_check_status      identity.check_status NOT NULL DEFAULT 'pending',
  identity_locked_at     timestamptz,                 -- name/DOB/sex locked after verification
  registered_by_user_id  uuid,                        -- ASHA / hospital staff (assisted)
  deceased_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_raw_aadhaar CHECK (aadhaar_token IS NULL OR aadhaar_token !~ '^[0-9]{12}$')
);
CREATE TRIGGER person_updated BEFORE UPDATE ON identity.person
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- Locked identity fields cannot change once verified (only via admin migration role).
CREATE OR REPLACE FUNCTION identity.protect_locked_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.identity_locked_at IS NOT NULL AND
     (NEW.full_name IS DISTINCT FROM OLD.full_name OR
      NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth OR
      NEW.sex IS DISTINCT FROM OLD.sex OR
      NEW.aadhaar_token IS DISTINCT FROM OLD.aadhaar_token) AND
     current_user <> 'cf_migrator' THEN
    RAISE EXCEPTION 'CF010: identity is locked after verification; change via admin request'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER person_identity_lock BEFORE UPDATE ON identity.person
  FOR EACH ROW EXECUTE FUNCTION identity.protect_locked_identity();

-- ---------- app_user : one login account ----------
CREATE TABLE identity.app_user (
  id              uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  person_id       uuid NOT NULL REFERENCES identity.person(id),
  account_type    identity.account_type NOT NULL,
  keycloak_sub    text NOT NULL UNIQUE,
  status          identity.account_status NOT NULL DEFAULT 'pending',
  status_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  deactivated_at  timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, account_type)                    -- doctor = 1 citizen row + 1 doctor row
);
CREATE INDEX app_user_type_status_ix ON identity.app_user (account_type, status);
CREATE TRIGGER app_user_updated BEFORE UPDATE ON identity.app_user
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();
-- Accounts are never deleted (decision 2026-10-10; ⚠ DPDP erasure to verify).
CREATE TRIGGER app_user_no_delete BEFORE DELETE ON identity.app_user
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
CREATE TRIGGER person_no_delete BEFORE DELETE ON identity.person
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

ALTER TABLE identity.person
  ADD CONSTRAINT person_registered_by_fk FOREIGN KEY (registered_by_user_id) REFERENCES identity.app_user(id);

-- ---------- Citizen health profile ----------
CREATE TABLE identity.citizen_profile (
  person_id              uuid PRIMARY KEY REFERENCES identity.person(id),
  preferred_language     text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','ml','hi')),
  address_enc            bytea,
  district_id            uuid REFERENCES geo.district(id),
  approx_location        geometry(Point, 4326),        -- rounded ~1 km; donor map only
  blood_group            identity.blood_group NOT NULL DEFAULT 'unknown',
  organ_donor_status     identity.organ_status NOT NULL DEFAULT 'none',
  guardian_person_id     uuid REFERENCES identity.person(id),
  guardian_consent_at    timestamptz,
  handover_due_on        date,
  handed_over_at         timestamptz,
  health_card_issued_at  timestamptz,
  ai_research_opt_in     boolean NOT NULL DEFAULT false,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (guardian_person_id IS DISTINCT FROM person_id),
  CHECK (guardian_person_id IS NULL OR guardian_consent_at IS NOT NULL)
);
CREATE INDEX citizen_district_ix  ON identity.citizen_profile (district_id);
CREATE INDEX citizen_guardian_ix  ON identity.citizen_profile (guardian_person_id) WHERE guardian_person_id IS NOT NULL;
CREATE INDEX citizen_location_gix ON identity.citizen_profile USING gist (approx_location);
CREATE TRIGGER citizen_profile_updated BEFORE UPDATE ON identity.citizen_profile
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- Special category (fixed list + Other) with status; history kept by new rows.
CREATE TABLE identity.special_category_type (
  code       citext PRIMARY KEY,                       -- cancer, hiv, pregnancy, disability, dialysis, other
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true
);
CREATE TABLE identity.special_category (
  id               uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  person_id        uuid NOT NULL REFERENCES identity.person(id),
  category_code    citext NOT NULL REFERENCES identity.special_category_type(code),
  other_text       text,
  status           text NOT NULL,                      -- e.g. treated / untreated / in progress
  set_by_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  set_at           timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  CHECK ((category_code = 'other') = (other_text IS NOT NULL))
);
CREATE INDEX special_category_person_ix ON identity.special_category (person_id) WHERE ended_at IS NULL;

-- ---------- Emergency contacts and their emergency code ----------
CREATE TABLE identity.emergency_contact (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  citizen_person_id   uuid NOT NULL REFERENCES identity.person(id),
  contact_person_id   uuid NOT NULL REFERENCES identity.person(id),   -- must be a registered user
  relation            text NOT NULL,
  priority            smallint NOT NULL DEFAULT 1 CHECK (priority > 0),
  added_at            timestamptz NOT NULL DEFAULT now(),
  removed_at          timestamptz,
  CHECK (citizen_person_id <> contact_person_id)
);
CREATE UNIQUE INDEX emergency_contact_active_uq
  ON identity.emergency_contact (citizen_person_id, contact_person_id) WHERE removed_at IS NULL;

CREATE TABLE identity.emergency_code (
  person_id         uuid PRIMARY KEY REFERENCES identity.person(id),  -- the contact
  code_hash         text NOT NULL,                     -- Argon2id hash (never the code)
  set_at            timestamptz NOT NULL DEFAULT now(),
  failed_attempts   smallint NOT NULL DEFAULT 0,
  locked_until      timestamptz
);

-- ---------- Devices (rotating key secret is per device) ----------
CREATE TABLE identity.device (
  id                uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  user_id           uuid NOT NULL REFERENCES identity.app_user(id),
  platform          text NOT NULL CHECK (platform IN ('android','ios','web')),
  device_name       text,
  key_secret_enc    bytea,                             -- TOTP-style secret for the 10-second key
  enc_key_id        text,
  bound_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz,
  revoked_at        timestamptz,
  revoked_reason    text                               -- lost_phone, logout_everywhere, admin
);
CREATE UNIQUE INDEX device_one_key_device_uq
  ON identity.device (user_id) WHERE revoked_at IS NULL AND key_secret_enc IS NOT NULL;

-- ---------- Role profiles ----------
CREATE TABLE identity.doctor_profile (
  user_id                uuid PRIMARY KEY REFERENCES identity.app_user(id),
  hpr_id                 text NOT NULL UNIQUE,
  council_name           text NOT NULL,                -- NMC / state medical council
  council_reg_no         text NOT NULL,
  specialisation         text,
  degrees                jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{"degree":"MBBS","year":2018,"doc_id":"…"}]
  hospital_id            uuid NOT NULL REFERENCES org.hospital(id),
  department_id          uuid REFERENCES org.department(id),
  employment_type        identity.employment_type NOT NULL,
  employee_proof_doc_id  uuid,                         -- records.document (FK in 090)
  signing_method         identity.signing_method NOT NULL DEFAULT 'mock',
  duty_hours             jsonb NOT NULL DEFAULT '{}'::jsonb,
  hpr_verified_at        timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (council_name, council_reg_no)
);
CREATE INDEX doctor_hospital_ix ON identity.doctor_profile (hospital_id);
CREATE TRIGGER doctor_profile_updated BEFORE UPDATE ON identity.doctor_profile
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

CREATE TABLE identity.doctor_posting_history (
  id              uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  user_id         uuid NOT NULL REFERENCES identity.app_user(id),
  hospital_id     uuid NOT NULL REFERENCES org.hospital(id),
  department_id   uuid REFERENCES org.department(id),
  valid           tstzrange NOT NULL,
  changed_by      uuid NOT NULL REFERENCES identity.app_user(id),   -- district admin
  EXCLUDE USING gist (user_id WITH =, valid WITH &&)                 -- no overlapping postings
);

CREATE TABLE identity.staff_profile (
  user_id             uuid PRIMARY KEY REFERENCES identity.app_user(id),
  hospital_id         uuid NOT NULL REFERENCES org.hospital(id),
  department_id       uuid REFERENCES org.department(id),
  staff_role          identity.staff_role NOT NULL,
  created_by_user_id  uuid NOT NULL REFERENCES identity.app_user(id)  -- hospital admin
);
CREATE INDEX staff_hospital_ix ON identity.staff_profile (hospital_id, staff_role);

CREATE TABLE identity.hospital_admin_profile (
  user_id                 uuid PRIMARY KEY REFERENCES identity.app_user(id),
  hospital_id             uuid NOT NULL REFERENCES org.hospital(id),
  photo_id_doc_id         uuid,
  authorisation_doc_id    uuid,
  licence_doc_id          uuid,
  employee_id_doc_id      uuid
);

CREATE TABLE identity.pharmacy_admin_profile (
  user_id       uuid PRIMARY KEY REFERENCES identity.app_user(id),
  pharmacy_id   uuid NOT NULL REFERENCES org.pharmacy(id)
);

CREATE TABLE identity.pharmacist_profile (
  user_id             uuid PRIMARY KEY REFERENCES identity.app_user(id),
  pharmacy_id         uuid NOT NULL REFERENCES org.pharmacy(id),
  registration_no     text NOT NULL,
  created_by_user_id  uuid NOT NULL REFERENCES identity.app_user(id)  -- pharmacy admin
);

-- ---------- DPDP consent records ----------
CREATE TABLE identity.consent_record (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  person_id           uuid NOT NULL REFERENCES identity.person(id),
  purpose             identity.consent_purpose NOT NULL,
  notice_version      text NOT NULL,
  given_by_person_id  uuid NOT NULL REFERENCES identity.person(id),   -- self, guardian or contact
  granted_at          timestamptz NOT NULL DEFAULT now(),
  withdrawn_at        timestamptz,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX consent_person_ix ON identity.consent_record (person_id, purpose) WHERE withdrawn_at IS NULL;
CREATE TRIGGER consent_only_withdraw BEFORE UPDATE ON identity.consent_record
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('withdrawn_at');
CREATE TRIGGER consent_no_delete BEFORE DELETE ON identity.consent_record
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

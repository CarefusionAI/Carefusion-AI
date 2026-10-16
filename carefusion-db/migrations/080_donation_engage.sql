-- =====================================================================
-- 080_donation_engage.sql : blood donors, donations, requests, organ
--   pledges; appointments, ratings, complaints, chat, notifications,
--   health alerts
-- =====================================================================

-- ======================= DONATION =======================
CREATE TYPE donation.urgency AS ENUM ('normal','urgent','critical');
CREATE TYPE donation.request_status AS ENUM ('open','fulfilled','cancelled','expired');

CREATE TABLE donation.blood_donor (
  person_id               uuid PRIMARY KEY REFERENCES identity.person(id),
  ready                   boolean NOT NULL DEFAULT false,
  eligible_from           date,
  eligibility_checked_at  timestamptz,
  last_donation_at        timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT ready OR eligibility_checked_at IS NOT NULL)
);
CREATE INDEX blood_donor_ready_ix ON donation.blood_donor (person_id) WHERE ready;
CREATE TRIGGER blood_donor_updated BEFORE UPDATE ON donation.blood_donor
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- Cannot switch ON before the eligible date.
CREATE OR REPLACE FUNCTION donation.check_ready() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ready AND NEW.eligible_from IS NOT NULL AND NEW.eligible_from > current_date THEN
    RAISE EXCEPTION 'CF060: not eligible to donate until %', NEW.eligible_from USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER blood_donor_ready_check BEFORE INSERT OR UPDATE ON donation.blood_donor
  FOR EACH ROW EXECUTE FUNCTION donation.check_ready();

CREATE TABLE donation.blood_donation (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  donor_person_id      uuid NOT NULL REFERENCES identity.person(id),
  donated_at           timestamptz NOT NULL,
  hospital_id          uuid NOT NULL REFERENCES org.hospital(id),
  recorded_by_user_id  uuid NOT NULL REFERENCES identity.app_user(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER blood_donation_immutable BEFORE UPDATE OR DELETE ON donation.blood_donation
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- After a donation: toggle OFF and set next eligible date (gap from rule table; default 90 days).
CREATE OR REPLACE FUNCTION donation.apply_donation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE gap_days int;
BEGIN
  SELECT (value->>'days')::int INTO gap_days FROM admin.blood_eligibility_rule WHERE code = 'gap_after_donation';
  gap_days := COALESCE(gap_days, 90);
  INSERT INTO donation.blood_donor (person_id, ready, eligible_from, last_donation_at)
  VALUES (NEW.donor_person_id, false, (NEW.donated_at + make_interval(days => gap_days))::date, NEW.donated_at)
  ON CONFLICT (person_id) DO UPDATE
    SET ready = false, eligible_from = EXCLUDED.eligible_from, last_donation_at = EXCLUDED.last_donation_at;
  INSERT INTO records.dated_event (patient_person_id, event_type, starts_at, title, source_table, source_id)
  VALUES (NEW.donor_person_id, 'blood_donation_eligible',
          NEW.donated_at + make_interval(days => gap_days), 'Eligible to donate blood again',
          'donation.blood_donation', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER blood_donation_apply AFTER INSERT ON donation.blood_donation
  FOR EACH ROW EXECUTE FUNCTION donation.apply_donation();

CREATE TABLE donation.blood_request (
  id                     uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  requested_by_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  patient_person_id      uuid REFERENCES identity.person(id),
  blood_group            identity.blood_group NOT NULL CHECK (blood_group <> 'unknown'),
  units                  smallint NOT NULL CHECK (units BETWEEN 1 AND 20),
  hospital_id            uuid NOT NULL REFERENCES org.hospital(id),
  urgency                donation.urgency NOT NULL DEFAULT 'normal',
  status                 donation.request_status NOT NULL DEFAULT 'open',
  created_at             timestamptz NOT NULL DEFAULT now(),
  closes_at              timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blood_request_open_ix ON donation.blood_request (blood_group, hospital_id) WHERE status = 'open';
CREATE TRIGGER blood_request_updated BEFORE UPDATE ON donation.blood_request
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

CREATE TABLE donation.blood_request_response (
  request_id        uuid NOT NULL REFERENCES donation.blood_request(id),
  donor_person_id   uuid NOT NULL REFERENCES identity.person(id),
  alerted_at        timestamptz NOT NULL DEFAULT now(),
  response          text CHECK (response IN ('will_donate','cannot')),
  responded_at      timestamptz,
  PRIMARY KEY (request_id, donor_person_id)
);

CREATE TABLE donation.organ_pledge (
  id                         uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  person_id                  uuid NOT NULL REFERENCES identity.person(id),
  organs                     text[] NOT NULL CHECK (cardinality(organs) > 0),
  pledged_at                 timestamptz NOT NULL DEFAULT now(),
  hospital_id                uuid NOT NULL REFERENCES org.hospital(id),
  witnessing_doctor_user_id  uuid NOT NULL REFERENCES identity.app_user(id),
  document_id                uuid NOT NULL REFERENCES records.document(id),   -- signed form
  verification_status        text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  notto_ref                  text,
  withdrawn_at               timestamptz
);
CREATE UNIQUE INDEX organ_pledge_active_uq ON donation.organ_pledge (person_id) WHERE withdrawn_at IS NULL;
CREATE TRIGGER organ_pledge_limited_update BEFORE UPDATE ON donation.organ_pledge
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('verification_status','notto_ref','withdrawn_at');

-- ======================= ENGAGEMENT =======================
CREATE TYPE engage.appointment_status AS ENUM ('requested','confirmed','rejected','cancelled','completed','no_show');
CREATE TYPE engage.rating_target AS ENUM ('doctor','hospital','pharmacy');
CREATE TYPE engage.moderation AS ENUM ('pending','published','removed');
CREATE TYPE engage.channel AS ENUM ('push','sms','email');
CREATE TYPE engage.alert_scope AS ENUM ('national','state','district');
CREATE TYPE engage.alert_severity AS ENUM ('normal','emergency');

-- ---------- Appointments (free booking; no payment columns) ----------
CREATE TABLE engage.appointment_slot (
  id               uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id      uuid NOT NULL REFERENCES org.hospital(id),
  department_id    uuid REFERENCES org.department(id),
  doctor_user_id   uuid REFERENCES identity.app_user(id),
  during           tstzrange NOT NULL,
  capacity         smallint NOT NULL DEFAULT 1 CHECK (capacity > 0),
  EXCLUDE USING gist (doctor_user_id WITH =, during WITH &&) WHERE (doctor_user_id IS NOT NULL)
);
CREATE INDEX slot_hospital_ix ON engage.appointment_slot (hospital_id, department_id);

CREATE TABLE engage.appointment (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  slot_id             uuid NOT NULL REFERENCES engage.appointment_slot(id),
  citizen_person_id   uuid NOT NULL REFERENCES identity.person(id),
  status              engage.appointment_status NOT NULL DEFAULT 'requested',
  requested_at        timestamptz NOT NULL DEFAULT now(),
  decided_by_user_id  uuid REFERENCES identity.app_user(id),
  decided_at          timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, citizen_person_id)
);
CREATE INDEX appointment_citizen_ix ON engage.appointment (citizen_person_id, requested_at DESC);
CREATE TRIGGER appointment_updated BEFORE UPDATE ON engage.appointment
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- Capacity check when confirming.
CREATE OR REPLACE FUNCTION engage.check_capacity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cap int; used int;
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed') THEN
    SELECT capacity INTO cap FROM engage.appointment_slot WHERE id = NEW.slot_id FOR UPDATE;
    SELECT count(*) INTO used FROM engage.appointment WHERE slot_id = NEW.slot_id AND status = 'confirmed' AND id <> NEW.id;
    IF used >= cap THEN
      RAISE EXCEPTION 'CF070: slot is full' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appointment_capacity BEFORE INSERT OR UPDATE ON engage.appointment
  FOR EACH ROW EXECUTE FUNCTION engage.check_capacity();

-- ---------- Ratings (one per user per target; district admin moderates) ----------
CREATE TABLE engage.rating (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  rater_person_id    uuid NOT NULL REFERENCES identity.person(id),
  target_type        engage.rating_target NOT NULL,
  target_id          uuid NOT NULL,                  -- app_user (doctor) / hospital / pharmacy
  stars              smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment            text,
  moderation_status  engage.moderation NOT NULL DEFAULT 'pending',
  moderated_by       uuid REFERENCES identity.app_user(id),
  moderated_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rater_person_id, target_type, target_id)
);
CREATE INDEX rating_target_ix ON engage.rating (target_type, target_id) WHERE moderation_status = 'published';
CREATE TRIGGER rating_updated BEFORE UPDATE ON engage.rating
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- Only ABHA-verified people may rate.
CREATE OR REPLACE FUNCTION engage.check_rater() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM identity.person WHERE id = NEW.rater_person_id
                 AND abha_number IS NOT NULL AND kyc_status IN ('passed','assisted')) THEN
    RAISE EXCEPTION 'CF071: only ABHA-verified users can rate' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rating_rater_check BEFORE INSERT ON engage.rating
  FOR EACH ROW EXECUTE FUNCTION engage.check_rater();

CREATE TABLE engage.rating_reply (
  id               uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  rating_id        uuid NOT NULL REFERENCES engage.rating(id),
  author_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  body             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER rating_reply_no_delete BEFORE DELETE ON engage.rating_reply
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Complaints ----------
CREATE TABLE engage.complaint (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  raised_by_person_id   uuid NOT NULL REFERENCES identity.person(id),
  about_type            text NOT NULL CHECK (about_type IN ('doctor','hospital','pharmacy','staff','app','other')),
  about_id              uuid,
  district_id           uuid NOT NULL REFERENCES geo.district(id),
  body                  text NOT NULL,
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','resolved','closed')),
  assigned_to_user_id   uuid REFERENCES identity.app_user(id),
  resolution            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX complaint_district_ix ON engage.complaint (district_id, status);
CREATE TRIGGER complaint_updated BEFORE UPDATE ON engage.complaint
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- ---------- Chat (doctor follow-up, blood donors) ----------
CREATE TABLE engage.chat_thread (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  thread_type         text NOT NULL CHECK (thread_type IN ('doctor_followup','blood_donor')),
  patient_person_id   uuid REFERENCES identity.person(id),
  doctor_user_id      uuid REFERENCES identity.app_user(id),
  blood_request_id    uuid REFERENCES donation.blood_request(id),
  donor_person_id     uuid REFERENCES identity.person(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  closed_at           timestamptz,
  CHECK ((thread_type = 'doctor_followup' AND patient_person_id IS NOT NULL AND doctor_user_id IS NOT NULL) OR
         (thread_type = 'blood_donor' AND blood_request_id IS NOT NULL AND donor_person_id IS NOT NULL))
);

-- Follow-up chat only with a doctor who has treated the patient.
CREATE OR REPLACE FUNCTION engage.check_followup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.thread_type = 'doctor_followup' AND NOT EXISTS (
       SELECT 1 FROM access.access_session
       WHERE patient_person_id = NEW.patient_person_id AND user_id = NEW.doctor_user_id) THEN
    RAISE EXCEPTION 'CF072: chat allowed only with doctors who have treated this patient' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER chat_followup_check BEFORE INSERT ON engage.chat_thread
  FOR EACH ROW EXECUTE FUNCTION engage.check_followup();

CREATE TABLE engage.chat_message (
  id               uuid NOT NULL DEFAULT util.uuid_v7(),
  thread_id        uuid NOT NULL,                     -- FK checked in API (partitioned hot table)
  sender_user_id   uuid NOT NULL,
  body_enc         bytea NOT NULL,
  enc_key_id       text NOT NULL,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  blocked          boolean NOT NULL DEFAULT false,
  block_reason     text,                              -- e.g. payment talk (blood)
  reported_at      timestamptz,
  PRIMARY KEY (id, sent_at)
) PARTITION BY RANGE (sent_at);
CREATE INDEX chat_thread_ix ON engage.chat_message (thread_id, sent_at);
CREATE TABLE engage.chat_message_default PARTITION OF engage.chat_message DEFAULT;
CREATE TRIGGER chat_message_report_only BEFORE UPDATE ON engage.chat_message
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('reported_at');
CREATE TRIGGER chat_message_no_delete BEFORE DELETE ON engage.chat_message
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Notifications (no health details in payload) ----------
CREATE TABLE engage.notification (
  id              uuid NOT NULL DEFAULT util.uuid_v7(),
  user_id         uuid NOT NULL,
  channel         engage.channel NOT NULL,
  template_code   text NOT NULL,                      -- DLT template id for SMS
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','delivered')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX notification_user_ix ON engage.notification (user_id, created_at DESC);
CREATE TABLE engage.notification_default PARTITION OF engage.notification DEFAULT;

-- ---------- Health alerts ----------
CREATE TABLE engage.health_alert (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  issued_by_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  scope               engage.alert_scope NOT NULL,
  state_id            smallint REFERENCES geo.state(id),
  district_id         uuid REFERENCES geo.district(id),
  severity            engage.alert_severity NOT NULL,
  category            text NOT NULL,                  -- outbreak, heat, vaccination_drive …
  title               text NOT NULL,
  body                text NOT NULL,
  starts_at           timestamptz NOT NULL DEFAULT now(),
  ends_at             timestamptz,
  CHECK ((scope = 'national' AND state_id IS NULL AND district_id IS NULL) OR
         (scope = 'state' AND state_id IS NOT NULL) OR
         (scope = 'district' AND district_id IS NOT NULL))
);
CREATE INDEX health_alert_active_ix ON engage.health_alert (scope, state_id, district_id, starts_at DESC);

CREATE TABLE engage.alert_mute (
  user_id        uuid NOT NULL REFERENCES identity.app_user(id),
  category       text NOT NULL,
  muted_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);
-- Emergency alerts ignore mutes: the sender joins alert_mute only when severity = 'normal'
-- (see view engage.v_alert_recipients_rule in 100_views.sql).

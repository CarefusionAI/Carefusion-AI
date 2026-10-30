-- =====================================================================
-- 121_outpatient_clinical.sql : outpatient side of the citizen / doctor apps
--   records extras (folder colour + archive, document sensitivity / summary /
--   scan / views, personal reminders), appointments + OP queue + visits,
--   doctor find-care fields + schedule blocks, vitals targets + clinical
--   alerts, messages (thread types, participants, attachments), AI chat history,
--   reviews + complaints extensions, health-alert composer, special-category
--   requests.
-- Rule codes: CF100 (wrong patient), CF101 (review visit mismatch),
--   CF102 (alert needs second approver), CF103 (system folder cannot be archived).
-- =====================================================================

-- ---------- Shared helpers for the new tables ----------
-- Same-patient check: NEW.<fk> must point to a row of the same patient.
-- Usage: ... EXECUTE FUNCTION util.check_same_patient('records.document', 'document_id')
CREATE OR REPLACE FUNCTION util.check_same_patient() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE p uuid; fk uuid := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
BEGIN
  IF fk IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT patient_person_id FROM %s WHERE id = $1', TG_ARGV[0]) INTO p USING fk;
  IF p IS DISTINCT FROM NEW.patient_person_id THEN
    RAISE EXCEPTION 'CF100: % belongs to another patient', TG_ARGV[1] USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Standard patient-record row-level security (same three policies as migration 100).
CREATE OR REPLACE PROCEDURE util.enable_patient_rls(p_table text, p_col text DEFAULT 'patient_person_id', p_write boolean DEFAULT true)
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('CREATE POLICY patient_read ON %s FOR SELECT TO cf_app, cf_ai USING (util.can_read_patient(%I))', p_table, p_col);
  IF p_write THEN
    EXECUTE format('CREATE POLICY patient_insert ON %s FOR INSERT TO cf_app, cf_ai WITH CHECK (util.can_write_patient(%I))', p_table, p_col);
    EXECUTE format('CREATE POLICY patient_update ON %s FOR UPDATE TO cf_app USING (util.can_write_patient(%I))', p_table, p_col);
  END IF;
END $$;

-- Hospital of the current request (doctor / staff / hospital admin) — for staff-queue policies.
CREATE OR REPLACE FUNCTION util.ctx_hospital_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE(dp.hospital_id, sp.hospital_id, ha.hospital_id)
  FROM identity.app_user u
  LEFT JOIN identity.doctor_profile dp ON dp.user_id = u.id
  LEFT JOIN identity.staff_profile  sp ON sp.user_id = u.id
  LEFT JOIN identity.hospital_admin_profile ha ON ha.user_id = u.id
  WHERE u.id = util.ctx_user_id()
$$;

-- =====================================================================
-- A. RECORDS EXTRAS
-- =====================================================================

-- Folder colour + archive (instead of delete: records are never deleted).
ALTER TABLE records.folder ADD COLUMN colour text CHECK (colour IS NULL OR length(colour) <= 24);
ALTER TABLE records.folder ADD COLUMN archived_at timestamptz;
ALTER TABLE records.folder ADD CONSTRAINT folder_system_not_archived
  CHECK (archived_at IS NULL OR kind = 'user');          -- the 5 system folders can never be archived
DROP TRIGGER folder_rename_only ON records.folder;
CREATE TRIGGER folder_rename_only BEFORE UPDATE ON records.folder
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('name','colour','archived_at');

-- Document sensitivity (honours the citizen's share switches) and display labels.
CREATE TYPE records.doc_sensitivity AS ENUM ('general','mental_health','genomic');
ALTER TABLE records.document ADD COLUMN sensitivity records.doc_sensitivity NOT NULL DEFAULT 'general';
ALTER TABLE records.document ADD COLUMN source_label text;       -- "Lab · added by …", "Uploaded by you"
ALTER TABLE records.document ADD COLUMN signature_note text;     -- "Lab seal", "e-Signed by Dr …"
ALTER TYPE records.dated_event_type ADD VALUE IF NOT EXISTS 'personal_reminder';

-- A doctor sees a mental-health / genomic document only if the citizen switched that category ON
-- (the author always sees their own). Citizens always see their own record.
CREATE POLICY sensitivity_gate ON records.document AS RESTRICTIVE FOR SELECT TO cf_app, cf_ai
  USING (sensitivity::text = 'general'
         OR util.ctx_account_type() = 'citizen'
         OR created_by_user_id = util.ctx_user_id()
         OR EXISTS (SELECT 1 FROM identity.share_preference s
                    WHERE s.person_id = patient_person_id AND s.category::text = sensitivity::text AND s.enabled));

-- Plain-language AI summary of a document. Citizens see it ONLY after a doctor has reviewed it (rule 3).
CREATE TABLE records.document_summary (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  document_id           uuid NOT NULL REFERENCES records.document(id),
  patient_person_id     uuid NOT NULL REFERENCES identity.person(id),
  summary_title         text NOT NULL,
  summary_enc           bytea NOT NULL,
  enc_key_id            text NOT NULL,
  model_name            text NOT NULL,
  model_version         text NOT NULL,
  is_simulated          boolean NOT NULL DEFAULT true,          -- labelled "simulated AI output" in the alpha
  reviewed_by_user_id   uuid REFERENCES identity.app_user(id),  -- doctor
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((reviewed_by_user_id IS NULL) = (reviewed_at IS NULL))
);
CREATE INDEX document_summary_doc_ix ON records.document_summary (document_id, created_at DESC);
CREATE TRIGGER document_summary_same_patient BEFORE INSERT ON records.document_summary
  FOR EACH ROW EXECUTE FUNCTION util.check_same_patient('records.document', 'document_id');
CREATE TRIGGER document_summary_review_only BEFORE UPDATE ON records.document_summary
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('reviewed_by_user_id','reviewed_at');
CREATE TRIGGER document_summary_no_delete BEFORE DELETE ON records.document_summary
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
ALTER TABLE records.document_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY summary_read ON records.document_summary FOR SELECT TO cf_app, cf_ai
  USING (util.can_read_patient(patient_person_id) AND (util.ctx_account_type() <> 'citizen' OR reviewed_at IS NOT NULL));
CREATE POLICY summary_insert ON records.document_summary FOR INSERT TO cf_app, cf_ai
  WITH CHECK (util.can_write_patient(patient_person_id));
CREATE POLICY summary_review ON records.document_summary FOR UPDATE TO cf_app
  USING (util.ctx_account_type() = 'doctor' AND util.can_read_patient(patient_person_id));

-- "New" badge: first time a user opened a document.
CREATE TABLE records.document_view (
  document_id      uuid NOT NULL REFERENCES records.document(id),
  user_id          uuid NOT NULL REFERENCES identity.app_user(id),
  first_viewed_at  timestamptz NOT NULL DEFAULT now(),
  last_viewed_at   timestamptz NOT NULL DEFAULT now(),
  view_count       int NOT NULL DEFAULT 1,
  PRIMARY KEY (document_id, user_id)
);
ALTER TABLE records.document_view ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_views ON records.document_view FOR ALL TO cf_app
  USING (user_id = util.ctx_user_id()) WITH CHECK (user_id = util.ctx_user_id());

-- Virus scan + OCR for uploads (the file itself stays in object storage).
CREATE TABLE records.document_scan (
  document_id        uuid PRIMARY KEY REFERENCES records.document(id),
  patient_person_id  uuid NOT NULL REFERENCES identity.person(id),
  virus_status       text NOT NULL DEFAULT 'pending' CHECK (virus_status IN ('pending','clean','infected','error')),
  scanned_at         timestamptz,
  ocr_status         text NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','done','not_needed','failed')),
  ocr_text_enc       bytea,
  enc_key_id         text,
  ocr_language       text,
  extracted_at       timestamptz
);
CREATE TRIGGER document_scan_same_patient BEFORE INSERT ON records.document_scan
  FOR EACH ROW EXECUTE FUNCTION util.check_same_patient('records.document', 'document_id');
CALL util.enable_patient_rls('records.document_scan');

-- Personal reminders: extra columns on the Dates panel.
ALTER TABLE records.dated_event ADD COLUMN repeat_rule text NOT NULL DEFAULT 'none'
  CHECK (repeat_rule IN ('none','daily','weekly','monthly','yearly'));
ALTER TABLE records.dated_event ADD COLUMN remind_before interval;
ALTER TABLE records.dated_event ADD COLUMN snoozed_until timestamptz;
ALTER TABLE records.dated_event ADD COLUMN notes text;
-- Phone-calendar sync feed (secret link; only the hash is stored).
CREATE TABLE records.calendar_feed (
  person_id    uuid PRIMARY KEY REFERENCES identity.person(id),
  token_hash   bytea NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);
ALTER TABLE records.calendar_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_feed ON records.calendar_feed FOR ALL TO cf_app
  USING (person_id = util.ctx_person_id()) WITH CHECK (person_id = util.ctx_person_id());

-- Special-category request flow: request -> lab proof -> district review -> card issued.
CREATE TABLE identity.special_category_request (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  person_id             uuid NOT NULL REFERENCES identity.person(id),
  category_code         citext NOT NULL REFERENCES identity.special_category_type(code),
  other_text            text,
  status                text NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested','proof_uploaded','district_review','approved','rejected','card_issued','cancelled')),
  proof_document_id     uuid REFERENCES records.document(id),
  approval_request_id   uuid REFERENCES admin.approval_request(id),
  requested_at          timestamptz NOT NULL DEFAULT now(),
  decided_by_user_id    uuid REFERENCES identity.app_user(id),
  decided_at            timestamptz,
  reason                text,
  card_issued_at        timestamptz,
  special_category_id   uuid REFERENCES identity.special_category(id),    -- row created on approval
  CHECK ((category_code = 'other') = (other_text IS NOT NULL)),
  CHECK (status <> 'rejected' OR reason IS NOT NULL)
);
CREATE INDEX special_category_request_person_ix ON identity.special_category_request (person_id, requested_at DESC);
CREATE TABLE identity.special_category_request_step (
  id           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  request_id   uuid NOT NULL REFERENCES identity.special_category_request(id),
  step         text NOT NULL,                 -- requested / lab proof / district review / card issued
  actor_user_id uuid REFERENCES identity.app_user(id),
  note         text,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER sc_request_step_immutable BEFORE UPDATE OR DELETE ON identity.special_category_request_step
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- =====================================================================
-- B. FIND CARE, APPOINTMENTS, OP QUEUE
-- =====================================================================
ALTER TABLE identity.doctor_profile ADD COLUMN languages text[] NOT NULL DEFAULT '{}';
ALTER TABLE identity.doctor_profile ADD COLUMN fee_amount numeric(10,2) CHECK (fee_amount IS NULL OR fee_amount >= 0);  -- informational; no payments in the app
ALTER TABLE identity.doctor_profile ADD COLUMN years_experience smallint CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 70);
ALTER TABLE identity.doctor_profile ADD COLUMN accepts_walkin boolean NOT NULL DEFAULT true;
ALTER TABLE identity.doctor_profile ADD COLUMN offers_teleconsult boolean NOT NULL DEFAULT false;
ALTER TABLE identity.doctor_profile ADD COLUMN bio text;

ALTER TABLE org.hospital ADD COLUMN services text[] NOT NULL DEFAULT '{}';
ALTER TABLE org.hospital ADD COLUMN about text;
ALTER TABLE org.hospital ADD COLUMN show_in_find_care boolean NOT NULL DEFAULT true;
ALTER TABLE org.hospital ADD COLUMN accepts_bookings boolean NOT NULL DEFAULT true;
ALTER TABLE org.department ADD COLUMN head_user_id uuid REFERENCES identity.app_user(id);

CREATE TYPE engage.slot_type AS ENUM ('op','teleconsult','ward_round','walk_in');
ALTER TABLE engage.appointment_slot ADD COLUMN slot_type engage.slot_type NOT NULL DEFAULT 'op';

CREATE SEQUENCE engage.booking_ref_seq START 58213;      -- DEMO-APT-58213, +1 each
ALTER TABLE engage.appointment ADD COLUMN booking_ref text NOT NULL DEFAULT ('DEMO-APT-' || nextval('engage.booking_ref_seq')::text);
ALTER TABLE engage.appointment ADD CONSTRAINT appointment_booking_ref_uq UNIQUE (booking_ref);
ALTER TABLE engage.appointment ADD COLUMN token_no int CHECK (token_no IS NULL OR token_no > 0);
ALTER TABLE engage.appointment ADD COLUMN reason text;
ALTER TABLE engage.appointment ADD COLUMN visit_type text NOT NULL DEFAULT 'new' CHECK (visit_type IN ('new','follow_up','review','teleconsult'));
ALTER TABLE engage.appointment ADD COLUMN fee_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0);   -- informational
ALTER TABLE engage.appointment ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','priority','emergency'));
ALTER TABLE engage.appointment ADD COLUMN cancelled_reason text;
ALTER TABLE engage.appointment ADD COLUMN reminder_sent_at timestamptz;

-- One row per visit to the OP (booked or walk-in): the queue, waiting time, no-shows.
CREATE TYPE engage.visit_status AS ENUM ('booked','checked_in','waiting','in_consultation','done','no_show','cancelled');
CREATE TABLE engage.op_visit (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id        uuid NOT NULL REFERENCES org.hospital(id),
  department_id      uuid REFERENCES org.department(id),
  doctor_user_id     uuid REFERENCES identity.app_user(id),
  patient_person_id  uuid NOT NULL REFERENCES identity.person(id),
  appointment_id     uuid UNIQUE REFERENCES engage.appointment(id),
  visit_date         date NOT NULL DEFAULT current_date,
  token_no           int NOT NULL CHECK (token_no > 0),
  priority           text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','priority','emergency')),
  is_walk_in         boolean NOT NULL DEFAULT false,
  status             engage.visit_status NOT NULL DEFAULT 'booked',
  checked_in_at      timestamptz,
  called_at          timestamptz,
  started_at         timestamptz,
  ended_at           timestamptz,
  access_session_id  uuid REFERENCES access.access_session(id),      -- the doctor session opened for this visit
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (hospital_id, doctor_user_id, visit_date, token_no),
  CHECK (called_at IS NULL OR checked_in_at IS NULL OR called_at >= checked_in_at),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX op_visit_queue_ix   ON engage.op_visit (hospital_id, visit_date, doctor_user_id, status);
CREATE INDEX op_visit_patient_ix ON engage.op_visit (patient_person_id, visit_date DESC);
CREATE TRIGGER op_visit_updated BEFORE UPDATE ON engage.op_visit
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();
ALTER TABLE engage.op_visit ENABLE ROW LEVEL SECURITY;
CREATE POLICY visit_patient ON engage.op_visit FOR SELECT TO cf_app USING (util.can_read_patient(patient_person_id));
CREATE POLICY visit_hospital ON engage.op_visit FOR SELECT TO cf_app
  USING (util.ctx_account_type() IN ('doctor','staff','hospital_admin') AND hospital_id = util.ctx_hospital_id());
CREATE POLICY visit_write ON engage.op_visit FOR INSERT TO cf_app
  WITH CHECK (util.ctx_account_type() IN ('doctor','staff','hospital_admin') AND hospital_id = util.ctx_hospital_id());
CREATE POLICY visit_update ON engage.op_visit FOR UPDATE TO cf_app
  USING (util.ctx_account_type() IN ('doctor','staff','hospital_admin') AND hospital_id = util.ctx_hospital_id());

-- Doctor's own schedule (OP clinic, teleconsult, ward round, procedure, leave) for the week view.
CREATE TABLE org.doctor_schedule_block (
  id               uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  doctor_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  hospital_id      uuid NOT NULL REFERENCES org.hospital(id),
  block_type       text NOT NULL CHECK (block_type IN ('op_clinic','teleconsult','ward_round','procedure','night_call','leave')),
  during           tstzrange NOT NULL,
  location         text,
  note             text,
  EXCLUDE USING gist (doctor_user_id WITH =, during WITH &&)
);
CREATE INDEX doctor_schedule_hospital_ix ON org.doctor_schedule_block (hospital_id, doctor_user_id);

-- =====================================================================
-- C. VITALS TARGETS AND CLINICAL ALERTS
-- =====================================================================
ALTER TABLE records.vital_observation ADD COLUMN context text;   -- fasting / random / post_meal, or temperature site
ALTER TABLE records.vital_observation ADD COLUMN note text;
ALTER TABLE records.vital_observation ADD COLUMN set_id uuid;    -- groups one NEWS set (inpatient.vital_set.id); no FK (partitioned hot table)

-- Target (or goal) range per patient and LOINC code, set by the doctor (or the citizen for a goal weight).
CREATE TABLE records.vital_target (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id  uuid NOT NULL REFERENCES identity.person(id),
  code               text NOT NULL,                      -- LOINC, same as vital_observation.code
  low_value          numeric(10,3),
  high_value         numeric(10,3),
  goal_value         numeric(10,3),
  unit               text NOT NULL,
  set_by_user_id     uuid NOT NULL REFERENCES identity.app_user(id),
  valid              tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),
  note               text,
  CHECK (num_nonnulls(low_value, high_value, goal_value) >= 1),
  CHECK (low_value IS NULL OR high_value IS NULL OR low_value <= high_value),
  EXCLUDE USING gist (patient_person_id WITH =, code WITH =, valid WITH &&)
);
CALL util.enable_patient_rls('records.vital_target');

-- Clinical alerts: critical lab value, EWS raised, home reading out of range, referral accepted, overdue dose …
CREATE TYPE records.alert_kind AS ENUM (
  'critical_lab','abnormal_lab','vitals_critical','home_reading','referral_update',
  'overdue_dose','imaging_critical','ward_notice');
CREATE TABLE records.clinical_alert (
  id                       uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  kind                     records.alert_kind NOT NULL,
  severity                 text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  patient_person_id        uuid REFERENCES identity.person(id),          -- null for ward notices
  hospital_id              uuid REFERENCES org.hospital(id),
  target_user_id           uuid REFERENCES identity.app_user(id),        -- the doctor / nurse it is for
  title                    text NOT NULL,
  detail                   text,
  source_table             text,
  source_id                uuid,
  event_id                 uuid REFERENCES engage.event(id),
  raised_at                timestamptz NOT NULL DEFAULT now(),
  acknowledged_by_user_id  uuid REFERENCES identity.app_user(id),
  acknowledged_at          timestamptz,
  resolved_at              timestamptz,
  CHECK ((acknowledged_by_user_id IS NULL) = (acknowledged_at IS NULL)),
  CHECK (kind::text = 'ward_notice' OR patient_person_id IS NOT NULL)
);
CREATE INDEX clinical_alert_target_ix ON records.clinical_alert (target_user_id, raised_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX clinical_alert_hospital_ix ON records.clinical_alert (hospital_id, raised_at DESC);
CREATE TRIGGER clinical_alert_ack_only BEFORE UPDATE ON records.clinical_alert
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('acknowledged_by_user_id','acknowledged_at','resolved_at');
CREATE TRIGGER clinical_alert_no_delete BEFORE DELETE ON records.clinical_alert
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
ALTER TABLE records.clinical_alert ENABLE ROW LEVEL SECURITY;
CREATE POLICY alert_target ON records.clinical_alert FOR SELECT TO cf_app USING (target_user_id = util.ctx_user_id());
CREATE POLICY alert_patient ON records.clinical_alert FOR SELECT TO cf_app
  USING (patient_person_id IS NOT NULL AND util.can_read_patient(patient_person_id) AND util.ctx_account_type() <> 'citizen');
CREATE POLICY alert_hospital ON records.clinical_alert FOR SELECT TO cf_app
  USING (hospital_id IS NOT NULL AND util.ctx_account_type() IN ('doctor','staff','hospital_admin') AND hospital_id = util.ctx_hospital_id());
CREATE POLICY alert_insert ON records.clinical_alert FOR INSERT TO cf_app
  WITH CHECK (util.ctx_account_type() IN ('doctor','staff','hospital_admin')
              OR (util.ctx_account_type() = 'citizen' AND patient_person_id = util.ctx_person_id() AND kind::text = 'home_reading'));
CREATE POLICY alert_ack ON records.clinical_alert FOR UPDATE TO cf_app
  USING (target_user_id = util.ctx_user_id()
         OR (hospital_id IS NOT NULL AND util.ctx_account_type() IN ('doctor','staff') AND hospital_id = util.ctx_hospital_id()));

-- =====================================================================
-- D. MESSAGES: more thread types, participants, attachments, read state
-- =====================================================================
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'engage.chat_thread'::regclass AND contype = 'c' LOOP
    EXECUTE format('ALTER TABLE engage.chat_thread DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE engage.chat_thread ADD COLUMN subject text;
ALTER TABLE engage.chat_thread ADD COLUMN hospital_id uuid REFERENCES org.hospital(id);
ALTER TABLE engage.chat_thread ADD COLUMN pharmacy_id uuid REFERENCES org.pharmacy(id);
ALTER TABLE engage.chat_thread ADD COLUMN last_message_at timestamptz;
ALTER TABLE engage.chat_thread ADD CONSTRAINT chat_thread_type_check
  CHECK (thread_type IN ('doctor_followup','blood_donor','pharmacist','hospital_desk','lab','radiology','health_dept','broadcast'));
ALTER TABLE engage.chat_thread ADD CONSTRAINT chat_thread_shape CHECK (
  (thread_type = 'doctor_followup' AND patient_person_id IS NOT NULL AND doctor_user_id IS NOT NULL) OR
  (thread_type = 'blood_donor'     AND blood_request_id IS NOT NULL AND donor_person_id IS NOT NULL) OR
  (thread_type NOT IN ('doctor_followup','blood_donor') AND (patient_person_id IS NOT NULL OR thread_type = 'broadcast')));

CREATE TABLE engage.chat_participant (
  id             uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  thread_id      uuid NOT NULL REFERENCES engage.chat_thread(id),
  user_id        uuid REFERENCES identity.app_user(id),
  hospital_id    uuid REFERENCES org.hospital(id),         -- an office / desk as a party (appointments desk, lab …)
  pharmacy_id    uuid REFERENCES org.pharmacy(id),
  display_name   text NOT NULL,
  party_role     engage.event_role,
  added_at       timestamptz NOT NULL DEFAULT now(),
  last_read_at   timestamptz,                               -- read receipt: messages before this are read
  muted          boolean NOT NULL DEFAULT false,
  CHECK (num_nonnulls(user_id, hospital_id, pharmacy_id) >= 1)
);
CREATE UNIQUE INDEX chat_participant_user_uq ON engage.chat_participant (thread_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX chat_participant_user_ix ON engage.chat_participant (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE engage.chat_attachment (
  id               uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  thread_id        uuid NOT NULL REFERENCES engage.chat_thread(id),
  message_id       uuid NOT NULL,                           -- chat_message(id, sent_at); no FK (partitioned)
  message_sent_at  timestamptz NOT NULL,
  file_name        text NOT NULL,
  mime_type        text NOT NULL,
  size_bytes       bigint NOT NULL CHECK (size_bytes >= 0),
  storage_key      text NOT NULL,
  sha256           bytea CHECK (sha256 IS NULL OR octet_length(sha256) = 32),
  scan_status      text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','infected')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_attachment_msg_ix ON engage.chat_attachment (message_id, message_sent_at);
CREATE TRIGGER chat_attachment_scan_only BEFORE UPDATE ON engage.chat_attachment
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('scan_status');
CREATE TRIGGER chat_attachment_no_delete BEFORE DELETE ON engage.chat_attachment
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE OR REPLACE FUNCTION engage.is_thread_participant(p_thread uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM engage.chat_participant p WHERE p.thread_id = p_thread AND p.user_id = util.ctx_user_id())
      OR EXISTS (SELECT 1 FROM engage.chat_thread t WHERE t.id = p_thread
                 AND (t.doctor_user_id = util.ctx_user_id() OR t.patient_person_id = util.ctx_person_id()
                      OR t.donor_person_id = util.ctx_person_id()))
$$;
ALTER TABLE engage.chat_participant ENABLE ROW LEVEL SECURITY;
CREATE POLICY participant_read ON engage.chat_participant FOR SELECT TO cf_app
  USING (user_id = util.ctx_user_id() OR engage.is_thread_participant(thread_id));
CREATE POLICY participant_write ON engage.chat_participant FOR ALL TO cf_app
  USING (user_id = util.ctx_user_id()) WITH CHECK (engage.is_thread_participant(thread_id));
ALTER TABLE engage.chat_attachment ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachment_read ON engage.chat_attachment FOR SELECT TO cf_app USING (engage.is_thread_participant(thread_id));
CREATE POLICY attachment_insert ON engage.chat_attachment FOR INSERT TO cf_app WITH CHECK (engage.is_thread_participant(thread_id));
CREATE POLICY attachment_scan ON engage.chat_attachment FOR UPDATE TO cf_app USING (engage.is_thread_participant(thread_id));

-- Unread count per participant (messages from others after last_read_at).
CREATE VIEW engage.v_thread_unread WITH (security_invoker = true) AS
SELECT p.thread_id, p.user_id,
       (SELECT count(*) FROM engage.chat_message m
         WHERE m.thread_id = p.thread_id AND m.sender_user_id IS DISTINCT FROM p.user_id
           AND (p.last_read_at IS NULL OR m.sent_at > p.last_read_at))::int AS unread
FROM engage.chat_participant p
WHERE p.user_id = util.ctx_user_id();

-- =====================================================================
-- E. AI CHAT HISTORY AND EDITED VERDICT
-- =====================================================================
ALTER TYPE ai.verdict ADD VALUE IF NOT EXISTS 'edited';
ALTER TABLE ai.ai_review ADD COLUMN edited_text text;
ALTER TABLE ai.ai_review ADD CONSTRAINT ai_review_edit_shape
  CHECK ((verdict::text = 'edited') = (edited_text IS NOT NULL AND length(trim(edited_text)) > 0));

CREATE TABLE ai.chat_session (
  id                           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id            uuid NOT NULL REFERENCES identity.person(id),
  kind                         text NOT NULL CHECK (kind IN ('citizen_guidance','clinical_assist')),
  title                        text,
  started_by_user_id           uuid NOT NULL REFERENCES identity.app_user(id),
  access_session_id            uuid REFERENCES access.access_session(id),   -- clinical assist runs inside a doctor session
  folder_id                    uuid REFERENCES records.folder(id),           -- the "AI Chat" system folder
  is_simulated                 boolean NOT NULL DEFAULT true,                -- "simulated AI output" in the alpha
  message_count                int NOT NULL DEFAULT 0,
  started_at                   timestamptz NOT NULL DEFAULT now(),
  ended_at                     timestamptz,
  shared_with_doctor_user_id   uuid REFERENCES identity.app_user(id),
  shared_at                    timestamptz,
  CHECK (kind = 'citizen_guidance' OR access_session_id IS NOT NULL),
  CHECK ((shared_with_doctor_user_id IS NULL) = (shared_at IS NULL))
);
CREATE INDEX ai_chat_session_patient_ix ON ai.chat_session (patient_person_id, started_at DESC);
CREATE TRIGGER ai_chat_session_limited BEFORE UPDATE ON ai.chat_session
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('title','message_count','ended_at','shared_with_doctor_user_id','shared_at');
CREATE TRIGGER ai_chat_session_no_delete BEFORE DELETE ON ai.chat_session
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE ai.chat_message (
  id             uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  session_id     uuid NOT NULL REFERENCES ai.chat_session(id),
  seq            int NOT NULL,
  role           text NOT NULL CHECK (role IN ('user','assistant','system')),
  body_enc       bytea NOT NULL,
  enc_key_id     text NOT NULL,
  source_refs    jsonb NOT NULL DEFAULT '[]'::jsonb,     -- guideline / PubMed ids shown under an answer
  red_flag       boolean NOT NULL DEFAULT false,         -- red-flag stop (108 advice)
  red_flag_reason text,
  ai_run_id      uuid REFERENCES ai.ai_run(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);
CREATE OR REPLACE FUNCTION ai.chat_message_before() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.seq IS NULL OR NEW.seq = 0 THEN
    SELECT COALESCE(max(seq), 0) + 1 INTO NEW.seq FROM ai.chat_message WHERE session_id = NEW.session_id;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION ai.chat_message_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE ai.chat_session SET message_count = message_count + 1 WHERE id = NEW.session_id;
  RETURN NEW;
END $$;
ALTER TABLE ai.chat_message ALTER COLUMN seq SET DEFAULT 0;
CREATE TRIGGER ai_chat_message_seq BEFORE INSERT ON ai.chat_message
  FOR EACH ROW EXECUTE FUNCTION ai.chat_message_before();
CREATE TRIGGER ai_chat_message_count AFTER INSERT ON ai.chat_message
  FOR EACH ROW EXECUTE FUNCTION ai.chat_message_after();
CREATE TRIGGER ai_chat_message_immutable BEFORE UPDATE OR DELETE ON ai.chat_message
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

ALTER TABLE ai.chat_session ENABLE ROW LEVEL SECURITY;
-- Citizens see their own guidance chats only (never a doctor's clinical-assist chat).
CREATE POLICY chat_session_citizen ON ai.chat_session FOR SELECT TO cf_app, cf_ai
  USING (kind = 'citizen_guidance' AND patient_person_id = util.ctx_person_id() AND util.ctx_account_type() = 'citizen');
CREATE POLICY chat_session_owner ON ai.chat_session FOR SELECT TO cf_app, cf_ai
  USING (started_by_user_id = util.ctx_user_id() OR shared_with_doctor_user_id = util.ctx_user_id());
CREATE POLICY chat_session_insert ON ai.chat_session FOR INSERT TO cf_app, cf_ai
  WITH CHECK (started_by_user_id = util.ctx_user_id()
              AND (kind = 'citizen_guidance' AND patient_person_id = util.ctx_person_id()
                   OR kind = 'clinical_assist' AND util.can_write_patient(patient_person_id)));
CREATE POLICY chat_session_update ON ai.chat_session FOR UPDATE TO cf_app
  USING (started_by_user_id = util.ctx_user_id());
ALTER TABLE ai.chat_message ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_message_read ON ai.chat_message FOR SELECT TO cf_app, cf_ai
  USING (EXISTS (SELECT 1 FROM ai.chat_session s WHERE s.id = session_id));     -- inherits the session policies
CREATE POLICY chat_message_insert ON ai.chat_message FOR INSERT TO cf_app, cf_ai
  WITH CHECK (EXISTS (SELECT 1 FROM ai.chat_session s WHERE s.id = session_id AND s.started_by_user_id = util.ctx_user_id()));

-- =====================================================================
-- F. REVIEWS (department, verified visit, helpful votes, reports)
-- =====================================================================
ALTER TABLE engage.rating ADD COLUMN department_id uuid REFERENCES org.department(id);
ALTER TABLE engage.rating ADD COLUMN op_visit_id uuid REFERENCES engage.op_visit(id);
ALTER TABLE engage.rating ADD COLUMN visit_verified boolean NOT NULL DEFAULT false;
ALTER TABLE engage.rating ADD COLUMN tags text[] NOT NULL DEFAULT '{}';       -- "kind nurses", "clean wards", "OP wait" …

CREATE OR REPLACE FUNCTION engage.check_rating_visit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v engage.op_visit;
BEGIN
  IF NEW.op_visit_id IS NOT NULL THEN
    SELECT * INTO v FROM engage.op_visit WHERE id = NEW.op_visit_id;
    IF v.patient_person_id IS DISTINCT FROM NEW.rater_person_id OR v.status::text <> 'done'
       OR (NEW.target_type::text = 'hospital' AND NEW.target_id <> v.hospital_id)
       OR (NEW.target_type::text = 'doctor' AND NEW.target_id IS DISTINCT FROM v.doctor_user_id) THEN
      RAISE EXCEPTION 'CF101: the visit does not match this reviewer and target' USING ERRCODE = 'check_violation';
    END IF;
    NEW.visit_verified := true;
    NEW.department_id := COALESCE(NEW.department_id, v.department_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rating_visit_check BEFORE INSERT ON engage.rating
  FOR EACH ROW EXECUTE FUNCTION engage.check_rating_visit();

CREATE TABLE engage.rating_helpful (
  rating_id  uuid NOT NULL REFERENCES engage.rating(id),
  user_id    uuid NOT NULL REFERENCES identity.app_user(id),
  at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rating_id, user_id)
);
CREATE TABLE engage.rating_report (
  id                uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  rating_id         uuid NOT NULL REFERENCES engage.rating(id),
  reporter_user_id  uuid NOT NULL REFERENCES identity.app_user(id),
  reason            text NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','dismissed')),
  decided_by_user_id uuid REFERENCES identity.app_user(id),
  decided_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rating_report_open_ix ON engage.rating_report (status) WHERE status = 'open';

-- =====================================================================
-- G. COMPLAINTS (ref number, category, severity, timeline, attachments)
-- =====================================================================
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'engage.complaint'::regclass AND contype = 'c' LOOP
    EXECUTE format('ALTER TABLE engage.complaint DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
CREATE SEQUENCE engage.complaint_ref_seq START 417;       -- next after CMP-0412 … CMP-0416
ALTER TABLE engage.complaint ADD COLUMN ref_no text NOT NULL DEFAULT ('CMP-' || lpad(nextval('engage.complaint_ref_seq')::text, 4, '0'));
ALTER TABLE engage.complaint ADD CONSTRAINT complaint_ref_no_uq UNIQUE (ref_no);
ALTER TABLE engage.complaint ADD COLUMN title text;
ALTER TABLE engage.complaint ADD COLUMN category text NOT NULL DEFAULT 'other';
ALTER TABLE engage.complaint ADD COLUMN severity text NOT NULL DEFAULT 'normal';
ALTER TABLE engage.complaint ADD COLUMN hospital_id uuid REFERENCES org.hospital(id);
ALTER TABLE engage.complaint ADD COLUMN pharmacy_id uuid REFERENCES org.pharmacy(id);
ALTER TABLE engage.complaint ADD COLUMN access_session_id uuid REFERENCES access.access_session(id);   -- "report an open"
ALTER TABLE engage.complaint ADD COLUMN place_text text;
ALTER TABLE engage.complaint ADD COLUMN due_at timestamptz;
ALTER TABLE engage.complaint ADD COLUMN escalation_level smallint NOT NULL DEFAULT 0;   -- 0 facility,1 district,2 state,3 zonal,4 central
ALTER TABLE engage.complaint ADD COLUMN resolved_at timestamptz;
ALTER TABLE engage.complaint ADD CONSTRAINT complaint_about_type_check
  CHECK (about_type IN ('doctor','hospital','pharmacy','staff','app','other','lab','radiology','access_session'));
ALTER TABLE engage.complaint ADD CONSTRAINT complaint_status_check
  CHECK (status IN ('open','assigned','resolved','closed','reopened','escalated'));
ALTER TABLE engage.complaint ADD CONSTRAINT complaint_category_check
  CHECK (category IN ('op_services','pharmacy','staff_conduct','lab','cleanliness','billing','app','record_access','other'));
ALTER TABLE engage.complaint ADD CONSTRAINT complaint_severity_check CHECK (severity IN ('normal','urgent','safety'));
ALTER TABLE engage.complaint ADD CONSTRAINT complaint_escalation_check CHECK (escalation_level BETWEEN 0 AND 4);
ALTER TABLE engage.complaint ADD CONSTRAINT complaint_resolution_check
  CHECK (status NOT IN ('resolved','closed') OR resolved_at IS NOT NULL) NOT VALID;   -- tolerate rows from before this column

CREATE TABLE engage.complaint_event (
  id             uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  complaint_id   uuid NOT NULL REFERENCES engage.complaint(id),
  actor_user_id  uuid REFERENCES identity.app_user(id),
  kind           text NOT NULL CHECK (kind IN ('filed','assigned','note','resolved','escalated','reopened','closed','citizen_notified')),
  text           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX complaint_event_ix ON engage.complaint_event (complaint_id, created_at);
CREATE TRIGGER complaint_event_immutable BEFORE UPDATE OR DELETE ON engage.complaint_event
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE engage.complaint_attachment (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  complaint_id          uuid NOT NULL REFERENCES engage.complaint(id),
  file_name             text NOT NULL,
  mime_type             text NOT NULL,
  size_bytes            bigint NOT NULL CHECK (size_bytes >= 0),
  storage_key           text NOT NULL,
  sha256                bytea CHECK (sha256 IS NULL OR octet_length(sha256) = 32),
  uploaded_by_user_id   uuid REFERENCES identity.app_user(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER complaint_attachment_immutable BEFORE UPDATE OR DELETE ON engage.complaint_attachment
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- The timeline writes itself: "filed" on insert, one row per status change.
CREATE OR REPLACE FUNCTION engage.complaint_log() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.due_at := COALESCE(NEW.due_at, NEW.created_at + interval '7 days');     -- 7-day reply rule
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER complaint_defaults BEFORE INSERT ON engage.complaint
  FOR EACH ROW EXECUTE FUNCTION engage.complaint_log();
CREATE OR REPLACE FUNCTION engage.complaint_log_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO engage.complaint_event (complaint_id, actor_user_id, kind, text)
    VALUES (NEW.id, util.ctx_user_id(), 'filed', NEW.body);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO engage.complaint_event (complaint_id, actor_user_id, kind, text)
    VALUES (NEW.id, util.ctx_user_id(),
            CASE NEW.status WHEN 'assigned' THEN 'assigned' WHEN 'resolved' THEN 'resolved' WHEN 'closed' THEN 'closed'
                            WHEN 'reopened' THEN 'reopened' WHEN 'escalated' THEN 'escalated' ELSE 'note' END,
            COALESCE(NEW.resolution, 'status: ' || NEW.status));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER complaint_timeline AFTER INSERT OR UPDATE OF status ON engage.complaint
  FOR EACH ROW EXECUTE FUNCTION engage.complaint_log_after();

-- =====================================================================
-- H. HEALTH-ALERT COMPOSER (draft / scheduled / sent, second approver, SMS, reach, zone scope)
-- =====================================================================
ALTER TYPE engage.alert_scope ADD VALUE IF NOT EXISTS 'zone';
CREATE TYPE engage.alert_status AS ENUM ('draft','pending_second_approval','scheduled','sent','cancelled');
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'engage.health_alert'::regclass AND contype = 'c' LOOP
    EXECUTE format('ALTER TABLE engage.health_alert DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE engage.health_alert ADD COLUMN zone_id smallint REFERENCES geo.zone(id);
ALTER TABLE engage.health_alert ADD COLUMN status engage.alert_status NOT NULL DEFAULT 'sent';   -- rows that existed were sent
ALTER TABLE engage.health_alert ADD COLUMN scheduled_at timestamptz;
ALTER TABLE engage.health_alert ADD COLUMN sent_at timestamptz;
ALTER TABLE engage.health_alert ADD COLUMN second_approver_user_id uuid REFERENCES identity.app_user(id);
ALTER TABLE engage.health_alert ADD COLUMN second_approved_at timestamptz;
ALTER TABLE engage.health_alert ADD COLUMN sms boolean NOT NULL DEFAULT false;
ALTER TABLE engage.health_alert ADD COLUMN translate boolean NOT NULL DEFAULT true;
ALTER TABLE engage.health_alert ADD COLUMN reach_count int CHECK (reach_count IS NULL OR reach_count >= 0);
ALTER TABLE engage.health_alert ADD COLUMN issuer_name text;                -- "District Health Office, Pathanamthitta"
ALTER TABLE engage.health_alert ADD COLUMN category_group text NOT NULL DEFAULT 'health_dept'
  CHECK (category_group IN ('emergency','health_dept','my_care','system'));
ALTER TABLE engage.health_alert ADD CONSTRAINT health_alert_scope_check CHECK (
  (scope::text = 'national' AND state_id IS NULL AND district_id IS NULL AND zone_id IS NULL) OR
  (scope::text = 'zone'     AND zone_id IS NOT NULL) OR
  (scope::text = 'state'    AND state_id IS NOT NULL) OR
  (scope::text = 'district' AND district_id IS NOT NULL));
ALTER TABLE engage.health_alert ADD CONSTRAINT health_alert_second_signer_check
  CHECK (second_approver_user_id IS NULL OR second_approver_user_id <> issued_by_user_id);
-- An emergency alert cannot go out (scheduled or sent) without a second admin's approval.
ALTER TABLE engage.health_alert ADD CONSTRAINT health_alert_emergency_two_person CHECK (
  severity::text <> 'emergency' OR status::text IN ('draft','pending_second_approval','cancelled')
  OR (second_approver_user_id IS NOT NULL AND second_approved_at IS NOT NULL)) NOT VALID;   -- NOT VALID: tolerate alerts sent before this rule
CREATE INDEX health_alert_status_ix ON engage.health_alert (status, scheduled_at);

CREATE TABLE engage.alert_read (
  user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  alert_id  uuid NOT NULL REFERENCES engage.health_alert(id),
  read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alert_id)
);
ALTER TABLE engage.alert_read ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_reads ON engage.alert_read FOR ALL TO cf_app
  USING (user_id = util.ctx_user_id()) WITH CHECK (user_id = util.ctx_user_id());

-- Recipients: now also zone scope, and only alerts that have actually been sent.
CREATE OR REPLACE VIEW engage.v_alert_recipients_rule AS
SELECT a.id AS alert_id, u.id AS user_id
FROM engage.health_alert a
JOIN identity.app_user u ON u.status = 'active' AND u.account_type = 'citizen'
JOIN identity.citizen_profile c ON c.person_id = u.person_id
LEFT JOIN geo.district d ON d.id = c.district_id
LEFT JOIN geo.state s ON s.id = d.state_id
WHERE a.status::text = 'sent'
  AND (a.scope::text = 'national'
       OR (a.scope::text = 'zone'     AND s.zone_id = a.zone_id)
       OR (a.scope::text = 'state'    AND d.state_id = a.state_id)
       OR (a.scope::text = 'district' AND c.district_id = a.district_id))
  AND (a.severity::text = 'emergency' OR NOT EXISTS (
        SELECT 1 FROM engage.alert_mute m WHERE m.user_id = u.id AND m.category = a.category));

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA engage, identity, records, org, ai TO cf_app;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA ai TO cf_ai;
GRANT UPDATE ON ai.chat_session TO cf_ai;
GRANT SELECT ON ALL TABLES IN SCHEMA records, identity, org TO cf_ai;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA engage TO cf_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA engage, ai, records, util TO cf_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA engage, identity, records, org, ai FROM cf_app, cf_ai, cf_report, cf_auditor;

-- =====================================================================
-- 050_records.sql : the health record — folders, documents (files in R2),
--                   highlights, clinical facts, vitals, dates panel,
--                   staff orders, referrals
-- Rule: nothing here is ever deleted; corrections are new rows.
-- =====================================================================

CREATE TYPE records.folder_kind AS ENUM (
  'user','doctor_uploads','ai_chat','image_analysis','genomic_analysis','temporal_analysis');
CREATE TYPE records.doc_type AS ENUM (
  'consultation_note','prescription','lab_report','scan','vcf','discharge_summary',
  'handover_note','referral_note','certificate','upload','text_note','ai_chat_summary',
  'voice_note_transcript','identity_proof','organ_pledge_form');
CREATE TYPE records.fact_source AS ENUM ('doctor','staff','self_reported','device','import');
CREATE TYPE records.order_type  AS ENUM ('vitals','lab','scan','vcf');
CREATE TYPE records.order_status AS ENUM ('open','in_progress','done','cancelled');
CREATE TYPE records.referral_status AS ENUM ('sent','seen','accepted','closed');
CREATE TYPE records.dated_event_type AS ENUM (
  'appointment','past_visit','medicine_dose','refill_due','vaccination_due','test_due',
  'checkup_due','blood_donation_eligible','treatment_session','prescription_expiry','follow_up');

-- ---------- Folders ----------
CREATE TABLE records.folder (
  id                     uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id      uuid NOT NULL REFERENCES identity.person(id),
  parent_folder_id       uuid REFERENCES records.folder(id),
  name                   text NOT NULL,
  kind                   records.folder_kind NOT NULL DEFAULT 'user',
  created_by_user_id     uuid NOT NULL REFERENCES identity.app_user(id),
  created_in_session_id  uuid REFERENCES access.access_session(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_person_id, parent_folder_id, name)
);
-- The 4 AI folders + "Doctor uploads" exist once per patient, at top level.
CREATE UNIQUE INDEX folder_system_once_uq ON records.folder (patient_person_id, kind) WHERE kind <> 'user';
CREATE INDEX folder_patient_ix ON records.folder (patient_person_id);
CREATE TRIGGER folder_rename_only BEFORE UPDATE ON records.folder
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('name');
CREATE TRIGGER folder_no_delete BEFORE DELETE ON records.folder
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Create the system folders for every new citizen person.
CREATE OR REPLACE FUNCTION records.create_system_folders(p_person uuid, p_user uuid) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO records.folder (patient_person_id, name, kind, created_by_user_id)
  VALUES (p_person, 'Doctor uploads',     'doctor_uploads',    p_user),
         (p_person, 'AI Chat',            'ai_chat',           p_user),
         (p_person, 'Image Analysis',     'image_analysis',    p_user),
         (p_person, 'Genomic Analysis',   'genomic_analysis',  p_user),
         (p_person, 'Temporal Analysis',  'temporal_analysis', p_user)
  ON CONFLICT DO NOTHING;
$$;

-- ---------- Documents (append-only; file lives in object storage) ----------
CREATE TABLE records.document (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id    uuid NOT NULL REFERENCES identity.person(id),
  folder_id            uuid NOT NULL REFERENCES records.folder(id),     -- folder at creation
  title                text NOT NULL,
  doc_type             records.doc_type NOT NULL,
  storage_key          text,                          -- R2 / S3 object key
  body_enc             bytea,                         -- typed notes, encrypted
  mime_type            text,
  size_bytes           bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sha256               bytea NOT NULL CHECK (octet_length(sha256) = 32),
  enc_key_id           text NOT NULL,
  is_self_reported     boolean NOT NULL DEFAULT false,
  created_by_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  session_id           uuid REFERENCES access.access_session(id),
  order_id             uuid,                          -- FK added after clinical_order
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_key IS NOT NULL OR body_enc IS NOT NULL)
);
CREATE INDEX document_patient_ix ON records.document (patient_person_id, created_at DESC);
CREATE INDEX document_folder_ix  ON records.document (folder_id);
CREATE TRIGGER document_immutable BEFORE UPDATE OR DELETE ON records.document
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Moving a document between folders is recorded, never edited in place.
CREATE TABLE records.document_move (
  id               uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  document_id      uuid NOT NULL REFERENCES records.document(id),
  to_folder_id     uuid NOT NULL REFERENCES records.folder(id),
  moved_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  moved_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_move_ix ON records.document_move (document_id, moved_at DESC);
CREATE TRIGGER document_move_immutable BEFORE UPDATE OR DELETE ON records.document_move
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Same patient check for moves and folders.
CREATE OR REPLACE FUNCTION records.check_same_patient_folder() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE f_patient uuid; d_patient uuid;
BEGIN
  IF TG_TABLE_NAME = 'document' THEN
    SELECT patient_person_id INTO f_patient FROM records.folder WHERE id = NEW.folder_id;
    IF f_patient IS DISTINCT FROM NEW.patient_person_id THEN
      RAISE EXCEPTION 'CF030: folder belongs to another patient' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT patient_person_id INTO f_patient FROM records.folder WHERE id = NEW.to_folder_id;
    SELECT patient_person_id INTO d_patient FROM records.document WHERE id = NEW.document_id;
    IF f_patient IS DISTINCT FROM d_patient THEN
      RAISE EXCEPTION 'CF030: folder belongs to another patient' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_same_patient BEFORE INSERT ON records.document
  FOR EACH ROW EXECUTE FUNCTION records.check_same_patient_folder();
CREATE TRIGGER document_move_same_patient BEFORE INSERT ON records.document_move
  FOR EACH ROW EXECUTE FUNCTION records.check_same_patient_folder();

CREATE TABLE records.highlight (
  id            uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  document_id   uuid NOT NULL REFERENCES records.document(id),
  user_id       uuid NOT NULL REFERENCES identity.app_user(id),
  anchor        jsonb NOT NULL,                       -- {"page":2,"start":120,"end":180}
  note          text,
  colour        text NOT NULL DEFAULT 'yellow',
  session_id    uuid REFERENCES access.access_session(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX highlight_doc_ix ON records.highlight (document_id);
CREATE TRIGGER highlight_immutable BEFORE UPDATE OR DELETE ON records.highlight
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Clinical facts (each change = new row; old row gets superseded_by) ----------
-- Shared columns are repeated per table so each can be distributed by patient later.
CREATE TABLE records.allergy (
  id uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id uuid NOT NULL REFERENCES identity.person(id),
  substance text NOT NULL, substance_code text, reaction text,
  severity text CHECK (severity IN ('mild','moderate','severe','unknown')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','entered_in_error')),
  source records.fact_source NOT NULL, recorded_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  session_id uuid REFERENCES access.access_session(id), recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES records.allergy(id), fhir jsonb);

CREATE TABLE records.condition (
  id uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id uuid NOT NULL REFERENCES identity.person(id),
  code_system text CHECK (code_system IN ('ICD-10','ICD-11','SNOMED-CT')), code text, name text NOT NULL,
  is_chronic boolean NOT NULL DEFAULT false, onset_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved','inactive','entered_in_error')),
  source records.fact_source NOT NULL, recorded_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  session_id uuid REFERENCES access.access_session(id), recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES records.condition(id), fhir jsonb);

CREATE TABLE records.medication_current (
  id uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id uuid NOT NULL REFERENCES identity.person(id),
  medicine_id uuid,                                    -- pharmacy.medicine (FK in 090)
  free_text text, dose text, since date, until date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped','entered_in_error')),
  source records.fact_source NOT NULL, recorded_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  session_id uuid REFERENCES access.access_session(id), recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES records.medication_current(id), fhir jsonb,
  CHECK (medicine_id IS NOT NULL OR free_text IS NOT NULL));

CREATE TABLE records.immunization (
  id uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id uuid NOT NULL REFERENCES identity.person(id),
  vaccine text NOT NULL, dose_number smallint, given_on date NOT NULL,
  hospital_id uuid REFERENCES org.hospital(id),
  source records.fact_source NOT NULL, recorded_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES records.immunization(id), fhir jsonb);

CREATE TABLE records.procedure_stay (
  id uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id uuid NOT NULL REFERENCES identity.person(id),
  kind text NOT NULL CHECK (kind IN ('surgery','hospital_stay','procedure')),
  description text NOT NULL, hospital_id uuid REFERENCES org.hospital(id),
  from_date date, to_date date CHECK (to_date IS NULL OR from_date IS NULL OR to_date >= from_date),
  source records.fact_source NOT NULL, recorded_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES records.procedure_stay(id), fhir jsonb);

CREATE TABLE records.family_history (
  id uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id uuid NOT NULL REFERENCES identity.person(id),
  relation text NOT NULL, condition_name text NOT NULL, condition_code text,
  source records.fact_source NOT NULL, recorded_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES records.family_history(id), fhir jsonb);

CREATE TABLE records.lifestyle (
  id uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id uuid NOT NULL REFERENCES identity.person(id),
  smoking text CHECK (smoking IN ('never','former','current','unknown')),
  alcohol text CHECK (alcohol IN ('never','former','occasional','regular','unknown')),
  since date,
  source records.fact_source NOT NULL, recorded_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES records.lifestyle(id), fhir jsonb);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['allergy','condition','medication_current','immunization',
                           'procedure_stay','family_history','lifestyle'] LOOP
    EXECUTE format('CREATE INDEX %1$s_patient_ix ON records.%1$s (patient_person_id) WHERE superseded_by IS NULL', t);
    EXECUTE format('CREATE TRIGGER %1$s_supersede_only BEFORE UPDATE ON records.%1$s
                    FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns(''superseded_by'')', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_delete BEFORE DELETE ON records.%1$s
                    FOR EACH ROW EXECUTE FUNCTION util.forbid_change()', t);
  END LOOP;
END $$;

-- ---------- Staff orders queue ----------
CREATE TABLE records.clinical_order (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id     uuid NOT NULL REFERENCES identity.person(id),
  ordered_by_user_id    uuid NOT NULL REFERENCES identity.app_user(id),
  session_id            uuid REFERENCES access.access_session(id),
  admission_id          uuid REFERENCES access.admission(id),
  hospital_id           uuid NOT NULL REFERENCES org.hospital(id),
  department_id         uuid REFERENCES org.department(id),
  order_type            records.order_type NOT NULL,
  details               text NOT NULL,                  -- "BP every 4 h", "CBC", "chest X-ray"
  status                records.order_status NOT NULL DEFAULT 'open',
  due_at                timestamptz,
  completed_by_user_id  uuid REFERENCES identity.app_user(id),
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'done' OR completed_at IS NOT NULL)
);
CREATE INDEX order_queue_ix ON records.clinical_order (hospital_id, department_id, status, due_at);
CREATE TRIGGER order_updated BEFORE UPDATE ON records.clinical_order
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();
ALTER TABLE records.document
  ADD CONSTRAINT document_order_fk FOREIGN KEY (order_id) REFERENCES records.clinical_order(id);

-- ---------- Vitals (hospital + self-reported); partitioned by month ----------
CREATE TABLE records.vital_observation (
  id                   uuid NOT NULL DEFAULT util.uuid_v7(),
  patient_person_id    uuid NOT NULL,                  -- FK not declared on partitioned hot table (checked in API)
  code                 text NOT NULL,                  -- LOINC, e.g. 8867-4 heart rate
  value_num            numeric(10,3) NOT NULL,
  unit                 text NOT NULL,
  effective_at         timestamptz NOT NULL,
  source               records.fact_source NOT NULL,
  device_kind          text,                           -- bp_machine, glucometer, smartwatch
  recorded_by_user_id  uuid NOT NULL,
  order_id             uuid,
  admission_id         uuid,
  recorded_offline     boolean NOT NULL DEFAULT false,
  synced_at            timestamptz,
  entered_in_error     boolean NOT NULL DEFAULT false,
  fhir                 jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, effective_at)
) PARTITION BY RANGE (effective_at);
CREATE INDEX vital_patient_time_ix ON records.vital_observation (patient_person_id, code, effective_at DESC);
CREATE TABLE records.vital_observation_default PARTITION OF records.vital_observation DEFAULT;
CREATE TRIGGER vital_error_flag_only BEFORE UPDATE ON records.vital_observation
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('entered_in_error','synced_at');
CREATE TRIGGER vital_no_delete BEFORE DELETE ON records.vital_observation
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Dates panel ----------
CREATE TABLE records.dated_event (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id  uuid NOT NULL REFERENCES identity.person(id),
  event_type         records.dated_event_type NOT NULL,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz,
  title              text NOT NULL,
  source_table       text,
  source_id          uuid,
  set_by_user_id     uuid REFERENCES identity.app_user(id),
  status             text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','missed','cancelled')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dated_event_patient_ix ON records.dated_event (patient_person_id, starts_at);
CREATE TRIGGER dated_event_updated BEFORE UPDATE ON records.dated_event
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- ---------- Referrals ----------
CREATE TABLE records.referral (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id  uuid NOT NULL REFERENCES identity.person(id),
  from_user_id       uuid NOT NULL REFERENCES identity.app_user(id),
  to_user_id         uuid REFERENCES identity.app_user(id),
  to_hospital_id     uuid REFERENCES org.hospital(id),
  note_document_id   uuid NOT NULL REFERENCES records.document(id),
  status             records.referral_status NOT NULL DEFAULT 'sent',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(to_user_id, to_hospital_id) >= 1)
);
CREATE INDEX referral_to_ix ON records.referral (to_user_id, status);
CREATE TRIGGER referral_updated BEFORE UPDATE ON records.referral
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

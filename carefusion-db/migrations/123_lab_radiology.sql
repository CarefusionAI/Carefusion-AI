-- =====================================================================
-- 123_lab_radiology.sql : orders get a reference, priority and accept/reject;
--   LAB: test catalogue + panels, order items, specimens, results + values,
--   critical-value calls, result acknowledgement, instruments, reagent lots,
--   QC runs, turnaround view;
--   IMAGING: rooms, equipment events, room schedule, studies, series, files
--   (withdraw within 24 h), exposure, prior studies.
-- ONE order id scheme: ORD-DEMO-NNNN (records.clinical_order.order_ref).
--   The sequence starts at 6000 so the seed can assign 0001-5999 by hand
--   (call setval if the seed goes above 6000).
-- Not modelled (assumption): sex/age-specific reference ranges (one range per test),
--   LIS analyser interface messages, DICOM pixel data (files live in object storage).
-- Rule codes: CF120 (result locked), CF121 (withdraw window / reason), CF122 (wrong patient).
-- =====================================================================

-- ---------- Orders: reference, priority, accept / reject, bed ----------
ALTER TYPE records.order_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE records.order_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE records.order_type   ADD VALUE IF NOT EXISTS 'medication';
ALTER TYPE records.order_type   ADD VALUE IF NOT EXISTS 'nursing';
CREATE TYPE records.order_priority AS ENUM ('routine','urgent','stat');

CREATE SEQUENCE records.order_ref_seq START 6000;
ALTER TABLE records.clinical_order ADD COLUMN order_ref text NOT NULL
  DEFAULT ('ORD-DEMO-' || lpad(nextval('records.order_ref_seq')::text, 4, '0'));
ALTER TABLE records.clinical_order ADD CONSTRAINT clinical_order_ref_uq UNIQUE (order_ref);
ALTER TABLE records.clinical_order ADD CONSTRAINT clinical_order_ref_format CHECK (util.is_canonical_order_ref(order_ref));
ALTER TABLE records.clinical_order ADD COLUMN priority records.order_priority NOT NULL DEFAULT 'routine';
ALTER TABLE records.clinical_order ADD COLUMN accepted_by_user_id uuid REFERENCES identity.app_user(id);
ALTER TABLE records.clinical_order ADD COLUMN accepted_at timestamptz;
ALTER TABLE records.clinical_order ADD COLUMN rejected_reason text;
ALTER TABLE records.clinical_order ADD COLUMN assigned_to_user_id uuid REFERENCES identity.app_user(id);
ALTER TABLE records.clinical_order ADD COLUMN bed_id uuid REFERENCES org.bed(id);
ALTER TABLE records.clinical_order ADD COLUMN clinical_note text;
ALTER TABLE records.clinical_order ADD CONSTRAINT clinical_order_reject_reason
  CHECK (status::text <> 'rejected' OR length(trim(coalesce(rejected_reason, ''))) > 0);
CREATE INDEX clinical_order_priority_ix ON records.clinical_order (hospital_id, order_type, status, priority, created_at);

-- Helpers for policies (SECURITY DEFINER: look at the order without opening the whole table).
-- Is the current user a staff member of this staff role (lab / radiology / nurse) at the order's hospital?
CREATE OR REPLACE FUNCTION records.order_in_my_hospital(p_order uuid, p_staff_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM records.clinical_order o
                 JOIN identity.staff_profile sp ON sp.hospital_id = o.hospital_id
                 WHERE o.id = p_order AND sp.user_id = util.ctx_user_id() AND sp.staff_role::text = p_staff_role)
$$;
CREATE OR REPLACE FUNCTION records.order_is_mine(p_order uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM records.clinical_order o WHERE o.id = p_order AND o.ordered_by_user_id = util.ctx_user_id())
$$;
CREATE OR REPLACE FUNCTION records.order_patient(p_order uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT patient_person_id FROM records.clinical_order WHERE id = p_order
$$;

-- =====================================================================
-- LAB
-- =====================================================================
CREATE TABLE lab.test_catalogue (
  code                 citext PRIMARY KEY,                   -- 'HBA1C', 'LDL', 'K'
  loinc                text,
  name                 text NOT NULL,
  category             text NOT NULL DEFAULT 'biochemistry',
  specimen_type        text NOT NULL DEFAULT 'serum',
  tube_type            text,
  unit                 text,
  ref_low              numeric(12,3),
  ref_high             numeric(12,3),
  critical_low         numeric(12,3),
  critical_high        numeric(12,3),
  ref_text             text,                                 -- qualitative ranges ("Negative")
  tat_target_minutes   int CHECK (tat_target_minutes IS NULL OR tat_target_minutes > 0),
  fasting_required     boolean NOT NULL DEFAULT false,
  is_active            boolean NOT NULL DEFAULT true,
  CHECK (ref_low IS NULL OR ref_high IS NULL OR ref_low <= ref_high)
);
CREATE TABLE lab.panel (
  code      citext PRIMARY KEY,                              -- 'CBC', 'LIPID', 'LFT'
  name      text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE lab.panel_test (
  panel_code  citext NOT NULL REFERENCES lab.panel(code),
  test_code   citext NOT NULL REFERENCES lab.test_catalogue(code),
  sort_order  smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (panel_code, test_code)
);

CREATE TABLE lab.order_item (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  order_id           uuid NOT NULL REFERENCES records.clinical_order(id),
  patient_person_id  uuid NOT NULL REFERENCES identity.person(id),
  test_code          citext NOT NULL REFERENCES lab.test_catalogue(code),
  panel_code         citext REFERENCES lab.panel(code),
  status             text NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','collected','resulted','cancelled')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, test_code)
);
CREATE TRIGGER lab_item_same_patient BEFORE INSERT ON lab.order_item
  FOR EACH ROW EXECUTE FUNCTION util.check_same_patient('records.clinical_order', 'order_id');
CREATE TRIGGER lab_item_status_only BEFORE UPDATE ON lab.order_item
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('status');

CREATE TABLE lab.specimen (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  order_id             uuid NOT NULL REFERENCES records.clinical_order(id),
  patient_person_id    uuid NOT NULL REFERENCES identity.person(id),
  barcode              text NOT NULL UNIQUE,
  tube_type            text,
  tube_count           smallint NOT NULL DEFAULT 1 CHECK (tube_count > 0),
  fasting              boolean,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','collected','in_lab','rejected','done')),
  collected_by_user_id uuid REFERENCES identity.app_user(id),
  collected_at         timestamptz,
  send_by              timestamptz,
  received_at          timestamptz,
  rejected_reason      text,                                  -- haemolysed, clotted, wrong tube …
  rejected_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'rejected' OR (rejected_reason IS NOT NULL AND rejected_at IS NOT NULL)),
  CHECK (status NOT IN ('collected','in_lab','done') OR collected_at IS NOT NULL)
);
CREATE INDEX specimen_order_ix ON lab.specimen (order_id);
CREATE TRIGGER specimen_same_patient BEFORE INSERT ON lab.specimen
  FOR EACH ROW EXECUTE FUNCTION util.check_same_patient('records.clinical_order', 'order_id');
CREATE TRIGGER specimen_no_delete BEFORE DELETE ON lab.specimen
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE lab.result (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  order_id              uuid NOT NULL REFERENCES records.clinical_order(id),
  patient_person_id     uuid NOT NULL REFERENCES identity.person(id),
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','preliminary','verified','released','amended')),
  amends_result_id      uuid REFERENCES lab.result(id),       -- a correction is a NEW result row
  entered_by_user_id    uuid NOT NULL REFERENCES identity.app_user(id),
  verified_by_user_id   uuid REFERENCES identity.app_user(id),
  released_by_user_id   uuid REFERENCES identity.app_user(id),
  released_at           timestamptz,
  esign_by_user_id      uuid REFERENCES identity.app_user(id),   -- pathologist
  esign_method          identity.signing_method,
  esign_ref             text,
  awaiting_esign        boolean NOT NULL DEFAULT false,
  document_id           uuid REFERENCES records.document(id),    -- released report PDF
  delivered_to_doctor_at   timestamptz,
  delivered_to_patient_at  timestamptz,
  clinical_comment      text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (status::text NOT IN ('released','amended') OR (released_at IS NOT NULL AND released_by_user_id IS NOT NULL)),
  CHECK (status::text <> 'verified' OR verified_by_user_id IS NOT NULL)
);
CREATE INDEX lab_result_order_ix ON lab.result (order_id);
CREATE INDEX lab_result_patient_ix ON lab.result (patient_person_id, released_at DESC);
CREATE TRIGGER result_same_patient BEFORE INSERT ON lab.result
  FOR EACH ROW EXECUTE FUNCTION util.check_same_patient('records.clinical_order', 'order_id');
-- Once released a result is a record: only the delivery stamps can still be set.
CREATE TRIGGER result_released_lock BEFORE UPDATE ON lab.result
  FOR EACH ROW WHEN (OLD.status IN ('released','amended'))
  EXECUTE FUNCTION util.allow_only_columns('delivered_to_doctor_at','delivered_to_patient_at');
CREATE TRIGGER result_no_delete BEFORE DELETE ON lab.result
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE lab.result_value (
  id                uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  result_id         uuid NOT NULL REFERENCES lab.result(id),
  test_code         citext NOT NULL REFERENCES lab.test_catalogue(code),
  value_num         numeric(14,4),
  value_text        text,
  unit              text,
  ref_low           numeric(12,3),
  ref_high          numeric(12,3),
  flag              text CHECK (flag IN ('N','L','H','LL','HH','A')),     -- normal, low, high, critical low / high, abnormal (text)
  is_critical       boolean NOT NULL DEFAULT false,
  delta_prev        numeric(14,4),                                       -- change from the previous released value
  prev_value_id     uuid REFERENCES lab.result_value(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (result_id, test_code),
  CHECK (value_num IS NOT NULL OR value_text IS NOT NULL)
);
CREATE INDEX result_value_test_ix ON lab.result_value (test_code, created_at DESC);

-- Fill ranges from the catalogue, compute the flag and the delta; refuse changes on a released result.
CREATE OR REPLACE FUNCTION lab.result_value_prepare() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE c lab.test_catalogue; r lab.result; prev lab.result_value;
BEGIN
  SELECT * INTO r FROM lab.result WHERE id = NEW.result_id;
  IF r.status IN ('released','amended') THEN
    RAISE EXCEPTION 'CF120: result % is released; add a new (amended) result instead', r.id USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO c FROM lab.test_catalogue WHERE code = NEW.test_code;
  NEW.unit     := COALESCE(NEW.unit, c.unit);
  NEW.ref_low  := COALESCE(NEW.ref_low, c.ref_low);
  NEW.ref_high := COALESCE(NEW.ref_high, c.ref_high);
  IF NEW.value_num IS NOT NULL AND NEW.flag IS NULL THEN
    NEW.flag := CASE WHEN c.critical_high IS NOT NULL AND NEW.value_num >= c.critical_high THEN 'HH'
                     WHEN c.critical_low  IS NOT NULL AND NEW.value_num <= c.critical_low  THEN 'LL'
                     WHEN NEW.ref_high IS NOT NULL AND NEW.value_num > NEW.ref_high THEN 'H'
                     WHEN NEW.ref_low  IS NOT NULL AND NEW.value_num < NEW.ref_low  THEN 'L'
                     ELSE 'N' END;
  END IF;
  NEW.is_critical := COALESCE(NEW.flag IN ('LL','HH'), false);
  IF NEW.value_num IS NOT NULL AND NEW.prev_value_id IS NULL THEN
    SELECT v.* INTO prev FROM lab.result_value v JOIN lab.result pr ON pr.id = v.result_id
     WHERE pr.patient_person_id = r.patient_person_id AND v.test_code = NEW.test_code
       AND pr.status IN ('released','amended') AND v.value_num IS NOT NULL
     ORDER BY pr.released_at DESC LIMIT 1;
    IF FOUND THEN NEW.prev_value_id := prev.id; NEW.delta_prev := NEW.value_num - prev.value_num; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER result_value_prepare BEFORE INSERT OR UPDATE ON lab.result_value
  FOR EACH ROW EXECUTE FUNCTION lab.result_value_prepare();
CREATE OR REPLACE FUNCTION lab.result_value_no_delete_released() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lab.result WHERE id = OLD.result_id AND status IN ('released','amended')) THEN
    RAISE EXCEPTION 'CF120: result % is released; values cannot be removed', OLD.result_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER result_value_no_delete_released BEFORE DELETE ON lab.result_value
  FOR EACH ROW EXECUTE FUNCTION lab.result_value_no_delete_released();

CREATE TABLE lab.critical_call (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  result_value_id       uuid NOT NULL REFERENCES lab.result_value(id),
  patient_person_id     uuid NOT NULL REFERENCES identity.person(id),
  called_by_user_id     uuid NOT NULL REFERENCES identity.app_user(id),     -- lab technician
  called_to_user_id     uuid REFERENCES identity.app_user(id),              -- doctor / nurse who took the call
  called_to_name        text,
  called_at             timestamptz NOT NULL DEFAULT now(),
  read_back_confirmed   boolean NOT NULL DEFAULT false,
  read_back_at          timestamptz,
  note                  text,
  CHECK (num_nonnulls(called_to_user_id, called_to_name) >= 1),
  CHECK (read_back_confirmed = (read_back_at IS NOT NULL))
);
CREATE INDEX critical_call_patient_ix ON lab.critical_call (patient_person_id, called_at DESC);
CREATE TRIGGER critical_call_readback_only BEFORE UPDATE ON lab.critical_call
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('read_back_confirmed','read_back_at','note');
CREATE TRIGGER critical_call_no_delete BEFORE DELETE ON lab.critical_call
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Doctor's acknowledgement ("waiting for your review" list).
CREATE TABLE lab.result_ack (
  result_id       uuid NOT NULL REFERENCES lab.result(id),
  doctor_user_id  uuid NOT NULL REFERENCES identity.app_user(id),
  acked_at        timestamptz NOT NULL DEFAULT now(),
  comment         text,
  PRIMARY KEY (result_id, doctor_user_id)
);
CREATE TRIGGER result_ack_immutable BEFORE UPDATE OR DELETE ON lab.result_ack
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE lab.instrument (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id           uuid NOT NULL REFERENCES org.hospital(id),
  name                  text NOT NULL,                       -- 'Sysmex XN-DEMO'
  kind                  text NOT NULL,                       -- haematology, biochemistry …
  model                 text,
  serial_no             text,
  status                text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','calibrating','down','retired')),
  last_calibrated_at    timestamptz,
  next_calibration_due  date,
  location              text
);
CREATE TABLE lab.reagent_lot (
  id            uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id   uuid NOT NULL REFERENCES org.hospital(id),
  instrument_id uuid REFERENCES lab.instrument(id),
  reagent       text NOT NULL,
  lot_no        text NOT NULL,
  opened_at     date,
  expiry_date   date NOT NULL,
  status        text NOT NULL DEFAULT 'in_use' CHECK (status IN ('in_use','expired','quarantined','empty')),
  UNIQUE (hospital_id, reagent, lot_no)
);
CREATE TABLE lab.qc_run (
  id             uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  instrument_id  uuid NOT NULL REFERENCES lab.instrument(id),
  test_code      citext NOT NULL REFERENCES lab.test_catalogue(code),
  reagent_lot_id uuid REFERENCES lab.reagent_lot(id),
  qc_level       smallint NOT NULL DEFAULT 1 CHECK (qc_level BETWEEN 1 AND 3),
  run_at         timestamptz NOT NULL DEFAULT now(),
  run_by_user_id uuid REFERENCES identity.app_user(id),
  value_num      numeric(14,4) NOT NULL,
  target_mean    numeric(14,4) NOT NULL,
  target_sd      numeric(14,4) NOT NULL CHECK (target_sd > 0),
  z_score        numeric(8,3) GENERATED ALWAYS AS ((value_num - target_mean) / target_sd) STORED,
  westgard_rule  text,                                        -- 1_2s warning, 1_3s reject (single-rule check)
  accepted       boolean NOT NULL DEFAULT true,
  comment        text
);
CREATE INDEX qc_run_series_ix ON lab.qc_run (instrument_id, test_code, qc_level, run_at DESC);
CREATE OR REPLACE FUNCTION lab.qc_run_rules() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE z numeric := (NEW.value_num - NEW.target_mean) / NEW.target_sd;
BEGIN
  IF abs(z) > 3 THEN NEW.westgard_rule := '1_3s'; NEW.accepted := false;
  ELSIF abs(z) > 2 THEN NEW.westgard_rule := COALESCE(NEW.westgard_rule, '1_2s');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qc_run_rules BEFORE INSERT ON lab.qc_run FOR EACH ROW EXECUTE FUNCTION lab.qc_run_rules();
CREATE TRIGGER qc_run_immutable BEFORE UPDATE OR DELETE ON lab.qc_run FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Lab security: patients see released results only; lab staff of the ordering hospital work on them;
-- the ordering doctor sees results of their own orders; a doctor with a live session sees the patient's.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab.order_item','lab.specimen','lab.result'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY patient_read ON %s FOR SELECT TO cf_app, cf_ai USING (util.can_read_patient(patient_person_id)%s)', t,
                   CASE t WHEN 'lab.result' THEN ' AND (util.ctx_account_type() <> ''citizen'' OR status IN (''released'',''amended''))' ELSE '' END);
    EXECUTE format('CREATE POLICY hospital_work ON %s FOR ALL TO cf_app
                    USING (records.order_in_my_hospital(order_id, ''lab'')) WITH CHECK (records.order_in_my_hospital(order_id, ''lab''))', t);
    EXECUTE format('CREATE POLICY orderer_read ON %s FOR SELECT TO cf_app USING (records.order_is_mine(order_id))', t);
  END LOOP;
END $$;
ALTER TABLE lab.result_value ENABLE ROW LEVEL SECURITY;
CREATE POLICY value_read ON lab.result_value FOR SELECT TO cf_app, cf_ai
  USING (EXISTS (SELECT 1 FROM lab.result r WHERE r.id = result_id));          -- inherits the lab.result policies
CREATE POLICY value_work ON lab.result_value FOR ALL TO cf_app
  USING (EXISTS (SELECT 1 FROM lab.result r WHERE r.id = result_id AND records.order_in_my_hospital(r.order_id, 'lab')))
  WITH CHECK (EXISTS (SELECT 1 FROM lab.result r WHERE r.id = result_id AND records.order_in_my_hospital(r.order_id, 'lab')));
ALTER TABLE lab.critical_call ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_read ON lab.critical_call FOR SELECT TO cf_app
  USING (called_by_user_id = util.ctx_user_id() OR called_to_user_id = util.ctx_user_id() OR util.can_read_patient(patient_person_id));
CREATE POLICY call_write ON lab.critical_call FOR INSERT TO cf_app WITH CHECK (called_by_user_id = util.ctx_user_id());
CREATE POLICY call_readback ON lab.critical_call FOR UPDATE TO cf_app
  USING (called_by_user_id = util.ctx_user_id() OR called_to_user_id = util.ctx_user_id());
ALTER TABLE lab.result_ack ENABLE ROW LEVEL SECURITY;
CREATE POLICY ack_own ON lab.result_ack FOR ALL TO cf_app
  USING (doctor_user_id = util.ctx_user_id()) WITH CHECK (doctor_user_id = util.ctx_user_id());

-- Lab worklist (STAT first) and turnaround time (order received -> released).
CREATE VIEW lab.v_worklist WITH (security_invoker = true) AS
SELECT o.id AS order_id, o.order_ref, o.hospital_id, o.patient_person_id, p.full_name AS patient_name,
       o.priority, o.status, o.created_at AS ordered_at, o.ordered_by_user_id, o.bed_id,
       (SELECT string_agg(i.test_code::text, ', ' ORDER BY i.test_code) FROM lab.order_item i WHERE i.order_id = o.id) AS tests,
       round(extract(epoch FROM (now() - o.created_at)) / 60)::int AS waiting_minutes
FROM records.clinical_order o
JOIN identity.person p ON p.id = o.patient_person_id
WHERE o.order_type::text = 'lab' AND o.status::text IN ('open','accepted','in_progress');

CREATE VIEW lab.v_order_tat WITH (security_invoker = true) AS
SELECT o.id AS order_id, o.order_ref, o.hospital_id, o.priority, o.created_at AS ordered_at, o.accepted_at,
       min(r.released_at) AS released_at,
       round(extract(epoch FROM (min(r.released_at) - o.created_at)) / 60)::int AS tat_minutes
FROM records.clinical_order o
JOIN lab.result r ON r.order_id = o.id AND r.status IN ('released','amended')
GROUP BY o.id, o.order_ref, o.hospital_id, o.priority, o.created_at, o.accepted_at;

-- Lab analyte series for charts (HbA1c, LDL …) — replaces storing lab values as vitals.
CREATE VIEW lab.v_analyte_series WITH (security_invoker = true) AS
SELECT r.patient_person_id, v.test_code, t.name AS test_name, v.value_num, v.unit, v.flag, v.ref_low, v.ref_high,
       r.released_at AS observed_at, r.order_id
FROM lab.result_value v
JOIN lab.result r ON r.id = v.result_id AND r.status IN ('released','amended')
JOIN lab.test_catalogue t ON t.code = v.test_code
WHERE v.value_num IS NOT NULL;

-- Critical values not yet called (lab safety net).
CREATE VIEW lab.v_critical_uncalled WITH (security_invoker = true) AS
SELECT v.id AS result_value_id, r.order_id, r.patient_person_id, v.test_code, v.value_num, v.flag, r.created_at
FROM lab.result_value v JOIN lab.result r ON r.id = v.result_id
WHERE v.is_critical AND NOT EXISTS (SELECT 1 FROM lab.critical_call c WHERE c.result_value_id = v.id);

-- =====================================================================
-- IMAGING
-- =====================================================================
CREATE TABLE imaging.room (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id           uuid NOT NULL REFERENCES org.hospital(id),
  modality              text NOT NULL CHECK (modality IN ('XR','CT','USG','MRI','ECHO','MAMMO','FLUORO','PORTABLE')),
  name                  text NOT NULL,                        -- 'CT room 1', 'USG 2', 'MRI 1.5T'
  status                text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','down','maintenance')),
  out_of_service_reason text,
  is_active             boolean NOT NULL DEFAULT true,
  UNIQUE (hospital_id, name)
);
CREATE TABLE imaging.equipment_event (
  id           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  room_id      uuid NOT NULL REFERENCES imaging.room(id),
  kind         text NOT NULL CHECK (kind IN ('downtime','service','calibration','flat_field','repair')),
  starts_at    timestamptz,
  ends_at      timestamptz,
  due_on       date,
  note         text,
  recorded_by_user_id uuid REFERENCES identity.app_user(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX equipment_event_room_ix ON imaging.equipment_event (room_id, starts_at DESC);

CREATE TABLE imaging.study (
  id                       uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  order_id                 uuid NOT NULL UNIQUE REFERENCES records.clinical_order(id),
  patient_person_id        uuid NOT NULL REFERENCES identity.person(id),
  hospital_id              uuid NOT NULL REFERENCES org.hospital(id),
  modality                 text NOT NULL CHECK (modality IN ('XR','CT','USG','MRI','ECHO','MAMMO','FLUORO','PORTABLE')),
  body_part                text NOT NULL,
  view_text                text,                              -- 'PA + lateral'
  priority                 records.order_priority NOT NULL DEFAULT 'routine',
  room_id                  uuid REFERENCES imaging.room(id),
  contrast                 boolean NOT NULL DEFAULT false,
  clinical_note            text,
  status                   text NOT NULL DEFAULT 'waiting'
                           CHECK (status IN ('waiting','scheduled','in_progress','uploaded','awaiting_report','reported','withdrawn')),
  performed_by_user_id     uuid REFERENCES identity.app_user(id),      -- radiology technician
  reporting_doctor_user_id uuid REFERENCES identity.app_user(id),
  burned_in_name_checked   boolean NOT NULL DEFAULT false,              -- patient name burned into image matches
  checklist                jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at               timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX study_worklist_ix ON imaging.study (hospital_id, status, priority, created_at);
CREATE INDEX study_patient_ix  ON imaging.study (patient_person_id, created_at DESC);
CREATE TRIGGER study_same_patient BEFORE INSERT ON imaging.study
  FOR EACH ROW EXECUTE FUNCTION util.check_same_patient('records.clinical_order', 'order_id');
CREATE TRIGGER study_updated BEFORE UPDATE ON imaging.study FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();
CREATE TRIGGER study_no_delete BEFORE DELETE ON imaging.study FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE imaging.room_slot (
  id        uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  room_id   uuid NOT NULL REFERENCES imaging.room(id),
  study_id  uuid REFERENCES imaging.study(id),
  during    tstzrange NOT NULL,
  label     text,
  EXCLUDE USING gist (room_id WITH =, during WITH &&)
);

CREATE TABLE imaging.study_series (
  id              uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  study_id        uuid NOT NULL REFERENCES imaging.study(id),
  series_no       smallint NOT NULL,
  modality        text,
  description     text,
  instance_count  int NOT NULL DEFAULT 1 CHECK (instance_count >= 0),
  UNIQUE (study_id, series_no)
);

CREATE TABLE imaging.study_file (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  study_id              uuid NOT NULL REFERENCES imaging.study(id),
  series_id             uuid REFERENCES imaging.study_series(id),
  document_id           uuid NOT NULL REFERENCES records.document(id),   -- DICOM / zip / image / report PDF in object storage
  kind                  text NOT NULL DEFAULT 'dicom' CHECK (kind IN ('dicom','zip','image','report')),
  uploaded_by_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  uploaded_at           timestamptz NOT NULL DEFAULT now(),
  withdrawn_at          timestamptz,
  withdrawn_by_user_id  uuid REFERENCES identity.app_user(id),
  withdrawn_reason      text,
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by_user_id IS NULL))
);
CREATE INDEX study_file_study_ix ON imaging.study_file (study_id);
-- Wrong-patient upload can be withdrawn within 24 h of upload, with a reason; nothing else may change.
CREATE OR REPLACE FUNCTION imaging.check_withdraw() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'CF121: file is already withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.withdrawn_at IS NOT NULL THEN
    IF length(trim(coalesce(NEW.withdrawn_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'CF121: a reason is needed to withdraw a file' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.withdrawn_at > OLD.uploaded_at + interval '24 hours' THEN
      RAISE EXCEPTION 'CF121: files can be withdrawn only within 24 hours of upload' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER study_file_withdraw_only BEFORE UPDATE ON imaging.study_file
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('withdrawn_at','withdrawn_by_user_id','withdrawn_reason');
CREATE TRIGGER study_file_withdraw_rules BEFORE UPDATE ON imaging.study_file
  FOR EACH ROW EXECUTE FUNCTION imaging.check_withdraw();
CREATE TRIGGER study_file_no_delete BEFORE DELETE ON imaging.study_file FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE imaging.exposure (
  study_id          uuid PRIMARY KEY REFERENCES imaging.study(id),
  kvp               numeric(6,1),
  mas               numeric(8,2),
  dap_mgycm2        numeric(10,2),
  exposure_ms       int,
  operator_user_id  uuid REFERENCES identity.app_user(id),
  recorded_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE imaging.study_prior (
  study_id        uuid NOT NULL REFERENCES imaging.study(id),
  prior_study_id  uuid NOT NULL REFERENCES imaging.study(id),
  PRIMARY KEY (study_id, prior_study_id),
  CHECK (study_id <> prior_study_id)
);
CREATE OR REPLACE FUNCTION imaging.check_prior_same_patient() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF (SELECT patient_person_id FROM imaging.study WHERE id = NEW.study_id)
     IS DISTINCT FROM (SELECT patient_person_id FROM imaging.study WHERE id = NEW.prior_study_id) THEN
    RAISE EXCEPTION 'CF122: prior study belongs to another patient' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER study_prior_same_patient BEFORE INSERT ON imaging.study_prior
  FOR EACH ROW EXECUTE FUNCTION imaging.check_prior_same_patient();

-- Imaging security: citizens see a study when it is reported; radiology staff of the hospital work on it;
-- the ordering doctor, the reporting doctor and a doctor with a live session read it.
ALTER TABLE imaging.study ENABLE ROW LEVEL SECURITY;
CREATE POLICY patient_read ON imaging.study FOR SELECT TO cf_app, cf_ai
  USING (util.can_read_patient(patient_person_id) AND (util.ctx_account_type() <> 'citizen' OR status = 'reported'));
CREATE POLICY hospital_work ON imaging.study FOR ALL TO cf_app
  USING (records.order_in_my_hospital(order_id, 'radiology')) WITH CHECK (records.order_in_my_hospital(order_id, 'radiology'));
CREATE POLICY orderer_read ON imaging.study FOR SELECT TO cf_app
  USING (records.order_is_mine(order_id) OR reporting_doctor_user_id = util.ctx_user_id());
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['imaging.study_series','imaging.study_file','imaging.exposure','imaging.study_prior'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY inherits_study ON %s FOR ALL TO cf_app
                    USING (EXISTS (SELECT 1 FROM imaging.study s WHERE s.id = study_id))
                    WITH CHECK (EXISTS (SELECT 1 FROM imaging.study s WHERE s.id = study_id))', t);
  END LOOP;
END $$;
-- Room slots may exist without a study (blocked time): visible to the hospital's staff.
ALTER TABLE imaging.room_slot ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_slot_hospital ON imaging.room_slot FOR ALL TO cf_app
  USING (EXISTS (SELECT 1 FROM imaging.room r WHERE r.id = room_id AND r.hospital_id = util.ctx_hospital_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM imaging.room r WHERE r.id = room_id AND r.hospital_id = util.ctx_hospital_id()));

CREATE VIEW imaging.v_worklist WITH (security_invoker = true) AS
SELECT s.id AS study_id, o.order_ref, s.hospital_id, s.patient_person_id, p.full_name AS patient_name,
       s.modality, s.body_part, s.priority, s.status, s.room_id, s.reporting_doctor_user_id, o.ordered_by_user_id,
       s.created_at, round(extract(epoch FROM (now() - s.created_at)) / 60)::int AS waiting_minutes
FROM imaging.study s
JOIN records.clinical_order o ON o.id = s.order_id
JOIN identity.person p ON p.id = s.patient_person_id
WHERE s.status NOT IN ('reported','withdrawn');

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA lab, imaging, records TO cf_app;
GRANT SELECT ON ALL TABLES IN SCHEMA lab, imaging TO cf_ai;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA records TO cf_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA lab, imaging, records TO cf_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA lab, imaging, records FROM cf_app, cf_ai, cf_report, cf_auditor;

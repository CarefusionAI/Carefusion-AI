-- =====================================================================
-- 122_inpatient.sql : wards and beds, admission details, vital sets with NEWS2
--   score and escalation, nursing tasks and notes, inpatient medication orders
--   and administration record (MAR), shift handover (shared by doctor / nurse /
--   lab / radiology), ward stock, staff shifts.
-- Assumption: NEWS2 scale 1 for SpO2 (no hypercapnic scale 2) in the alpha.
-- Rule codes: none new (uses CF001/CF002/CF100 and CHECK constraints).
-- =====================================================================

-- ---------- Wards and beds ----------
CREATE TABLE org.ward (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id           uuid NOT NULL REFERENCES org.hospital(id),
  department_id         uuid REFERENCES org.department(id),
  code                  text NOT NULL,                      -- 'W3', 'ICU', 'MAT'
  name                  text NOT NULL,                      -- 'Ward 3'
  charge_nurse_user_id  uuid REFERENCES identity.app_user(id),
  is_active             boolean NOT NULL DEFAULT true,
  UNIQUE (hospital_id, code)
);

CREATE TYPE org.bed_status AS ENUM ('free','occupied','reserved','cleaning','out_of_service');
CREATE TABLE org.bed (
  id           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  ward_id      uuid NOT NULL REFERENCES org.ward(id),
  hospital_id  uuid NOT NULL REFERENCES org.hospital(id),
  bed_no       text NOT NULL,                               -- '7', 'ICU-4'
  bed_type     citext NOT NULL DEFAULT 'general' REFERENCES org.bed_type(code),
  status       org.bed_status NOT NULL DEFAULT 'free',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ward_id, bed_no)
);
CREATE INDEX bed_hospital_ix ON org.bed (hospital_id, status);
CREATE TRIGGER bed_row_updated BEFORE UPDATE ON org.bed FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

ALTER TABLE identity.staff_profile ADD COLUMN ward_id uuid REFERENCES org.ward(id);

-- ---------- Admission details (IP number, bed, diet, mobility, diagnosis) ----------
ALTER TABLE access.admission ADD COLUMN department_id uuid REFERENCES org.department(id);
ALTER TABLE access.admission ADD COLUMN bed_id uuid REFERENCES org.bed(id);
ALTER TABLE access.admission ADD COLUMN ip_number text;
ALTER TABLE access.admission ADD COLUMN diet text;
ALTER TABLE access.admission ADD COLUMN mobility text;
ALTER TABLE access.admission ADD COLUMN diagnosis_text text;
ALTER TABLE access.admission ADD COLUMN expected_discharge date;
CREATE UNIQUE INDEX admission_ip_number_uq ON access.admission (hospital_id, ip_number) WHERE ip_number IS NOT NULL;
CREATE UNIQUE INDEX admission_one_open_per_bed_uq ON access.admission (bed_id) WHERE discharged_at IS NULL AND bed_id IS NOT NULL;

-- Keep the bed status in step with admissions.
CREATE OR REPLACE FUNCTION access.admission_sync_bed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.bed_id IS NOT NULL AND (NEW.bed_id IS DISTINCT FROM OLD.bed_id OR NEW.discharged_at IS NOT NULL) THEN
    UPDATE org.bed SET status = 'cleaning' WHERE id = OLD.bed_id AND status = 'occupied';
  END IF;
  IF NEW.bed_id IS NOT NULL AND NEW.discharged_at IS NULL THEN
    UPDATE org.bed SET status = 'occupied' WHERE id = NEW.bed_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER admission_bed_sync AFTER INSERT OR UPDATE ON access.admission
  FOR EACH ROW EXECUTE FUNCTION access.admission_sync_bed();

-- Admission rows hold patient names' keys: only the patient, a guardian and the hospital's clinical staff see them.
ALTER TABLE access.admission ENABLE ROW LEVEL SECURITY;
CREATE POLICY admission_patient ON access.admission FOR SELECT TO cf_app
  USING (patient_person_id = util.ctx_person_id() OR granted_by_person_id = util.ctx_person_id()
         OR util.can_read_patient(patient_person_id));
CREATE POLICY admission_hospital ON access.admission FOR SELECT TO cf_app
  USING (util.ctx_account_type() IN ('doctor','staff','hospital_admin') AND hospital_id = util.ctx_hospital_id());
CREATE POLICY admission_write ON access.admission FOR INSERT TO cf_app
  WITH CHECK (util.ctx_account_type() IN ('doctor','staff','hospital_admin') AND hospital_id = util.ctx_hospital_id());
CREATE POLICY admission_update ON access.admission FOR UPDATE TO cf_app
  USING (util.ctx_account_type() IN ('doctor','staff','hospital_admin') AND hospital_id = util.ctx_hospital_id());

-- Bed counts per bed type are a cache of org.bed (the district dashboard reads bed_availability).
CREATE OR REPLACE FUNCTION org.refresh_bed_availability(p_hospital uuid, p_user uuid) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  INSERT INTO org.bed_availability (hospital_id, bed_type, total, free, updated_by)
  SELECT b.hospital_id, b.bed_type, count(*) FILTER (WHERE b.status <> 'out_of_service')::int,
         count(*) FILTER (WHERE b.status = 'free')::int, p_user
  FROM org.bed b WHERE b.hospital_id = p_hospital GROUP BY b.hospital_id, b.bed_type
  ON CONFLICT (hospital_id, bed_type) DO UPDATE
    SET total = EXCLUDED.total, free = EXCLUDED.free, updated_by = EXCLUDED.updated_by;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Occupancy per department (hospital admin "Departments & beds", overview bars).
CREATE VIEW org.v_department_beds AS
SELECT w.hospital_id, w.department_id, d.name AS department,
       count(b.id) FILTER (WHERE b.status <> 'out_of_service')::int AS total,
       count(b.id) FILTER (WHERE b.status = 'occupied')::int        AS occupied,
       count(b.id) FILTER (WHERE b.status = 'free')::int            AS free,
       round(100.0 * count(b.id) FILTER (WHERE b.status = 'occupied')
             / NULLIF(count(b.id) FILTER (WHERE b.status <> 'out_of_service'), 0), 0)::int AS pct_full
FROM org.ward w
JOIN org.bed b ON b.ward_id = w.id
LEFT JOIN org.department d ON d.id = w.department_id
GROUP BY w.hospital_id, w.department_id, d.name;

-- ---------- Escalation chain (hospital setting) ----------
CREATE TABLE org.escalation_chain (
  hospital_id     uuid NOT NULL REFERENCES org.hospital(id),
  step            smallint NOT NULL CHECK (step > 0),
  news_min        smallint NOT NULL CHECK (news_min BETWEEN 0 AND 20),
  notify_role     text NOT NULL,                   -- 'charge_nurse', 'ward_doctor', 'rapid_response'
  within_minutes  smallint NOT NULL CHECK (within_minutes >= 0),
  PRIMARY KEY (hospital_id, step)
);

-- =====================================================================
-- NEWS2 early-warning score (Royal College of Physicians scale 1)
-- =====================================================================
-- Returns the seven parameter scores in this order: resp rate, SpO2, air/oxygen,
-- systolic BP, pulse, consciousness, temperature.
CREATE OR REPLACE FUNCTION inpatient.news2_parts(rr int, spo2 int, on_oxygen boolean, sbp int, pulse int, temp numeric, avpu text)
RETURNS int[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    CASE WHEN rr <= 8 THEN 3 WHEN rr <= 11 THEN 1 WHEN rr <= 20 THEN 0 WHEN rr <= 24 THEN 2 ELSE 3 END,
    CASE WHEN spo2 <= 91 THEN 3 WHEN spo2 <= 93 THEN 2 WHEN spo2 <= 95 THEN 1 ELSE 0 END,
    CASE WHEN on_oxygen THEN 2 ELSE 0 END,
    CASE WHEN sbp <= 90 THEN 3 WHEN sbp <= 100 THEN 2 WHEN sbp <= 110 THEN 1 WHEN sbp <= 219 THEN 0 ELSE 3 END,
    CASE WHEN pulse <= 40 THEN 3 WHEN pulse <= 50 THEN 1 WHEN pulse <= 90 THEN 0 WHEN pulse <= 110 THEN 1 WHEN pulse <= 130 THEN 2 ELSE 3 END,
    CASE WHEN avpu = 'A' THEN 0 ELSE 3 END,
    CASE WHEN temp <= 35.0 THEN 3 WHEN temp <= 36.0 THEN 1 WHEN temp <= 38.0 THEN 0 WHEN temp <= 39.0 THEN 1 ELSE 2 END]
$$;

-- Band: total 0-4 low (a single parameter scoring 3 = low-medium), 5-6 medium, 7+ high.
CREATE OR REPLACE FUNCTION inpatient.news2_band(parts int[]) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN (SELECT sum(x) FROM unnest(parts) x) >= 7 THEN 'high'
              WHEN (SELECT sum(x) FROM unnest(parts) x) >= 5 THEN 'medium'
              WHEN (SELECT max(x) FROM unnest(parts) x) = 3 THEN 'low_medium'
              ELSE 'low' END
$$;

-- ---------- Vital sets (one nurse observation round) ----------
CREATE TABLE inpatient.vital_set (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  admission_id          uuid NOT NULL REFERENCES access.admission(id),
  patient_person_id     uuid NOT NULL REFERENCES identity.person(id),
  observed_at           timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  resp_rate             smallint NOT NULL CHECK (resp_rate BETWEEN 0 AND 80),
  spo2                  smallint NOT NULL CHECK (spo2 BETWEEN 40 AND 100),
  on_oxygen             boolean NOT NULL DEFAULT false,
  systolic              smallint NOT NULL CHECK (systolic BETWEEN 30 AND 300),
  diastolic             smallint CHECK (diastolic BETWEEN 20 AND 200),
  pulse                 smallint NOT NULL CHECK (pulse BETWEEN 10 AND 300),
  temp_c                numeric(4,1) NOT NULL CHECK (temp_c BETWEEN 25 AND 45),
  avpu                  text NOT NULL DEFAULT 'A' CHECK (avpu IN ('A','C','V','P','U')),
  news_parts            int[] NOT NULL DEFAULT '{}',        -- filled by trigger
  news_score            smallint NOT NULL DEFAULT 0,        -- filled by trigger
  news_band             text NOT NULL DEFAULT 'low' CHECK (news_band IN ('low','low_medium','medium','high')),
  note                  text,
  entered_in_error      boolean NOT NULL DEFAULT false,
  recorded_offline      boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vital_set_admission_ix ON inpatient.vital_set (admission_id, observed_at DESC);
CREATE INDEX vital_set_patient_ix   ON inpatient.vital_set (patient_person_id, observed_at DESC);

CREATE OR REPLACE FUNCTION inpatient.vital_set_score() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.news_parts := inpatient.news2_parts(NEW.resp_rate, NEW.spo2, NEW.on_oxygen, NEW.systolic, NEW.pulse, NEW.temp_c, NEW.avpu);
  NEW.news_score := (SELECT sum(x) FROM unnest(NEW.news_parts) x);
  NEW.news_band  := inpatient.news2_band(NEW.news_parts);
  RETURN NEW;
END $$;
CREATE TRIGGER vital_set_score BEFORE INSERT ON inpatient.vital_set
  FOR EACH ROW EXECUTE FUNCTION inpatient.vital_set_score();
CREATE TRIGGER vital_set_same_patient BEFORE INSERT ON inpatient.vital_set
  FOR EACH ROW EXECUTE FUNCTION util.check_same_patient('access.admission', 'admission_id');
CREATE TRIGGER vital_set_error_flag_only BEFORE UPDATE ON inpatient.vital_set
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('entered_in_error');
CREATE TRIGGER vital_set_no_delete BEFORE DELETE ON inpatient.vital_set
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Escalations: raised automatically when a set scores medium or high; the nurse / doctor acknowledges.
CREATE TABLE inpatient.escalation (
  id                       uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  vital_set_id             uuid NOT NULL REFERENCES inpatient.vital_set(id),
  admission_id             uuid NOT NULL REFERENCES access.admission(id),
  patient_person_id        uuid NOT NULL REFERENCES identity.person(id),
  level                    smallint NOT NULL CHECK (level BETWEEN 1 AND 3),   -- 1 inform, 2 doctor review, 3 rapid response
  news_score               smallint NOT NULL,
  paged_role               text NOT NULL,
  paged_to_user_id         uuid REFERENCES identity.app_user(id),
  paged_at                 timestamptz NOT NULL DEFAULT now(),
  acknowledged_by_user_id  uuid REFERENCES identity.app_user(id),
  acknowledged_at          timestamptz,
  outcome                  text,
  CHECK ((acknowledged_by_user_id IS NULL) = (acknowledged_at IS NULL))
);
CREATE INDEX escalation_open_ix ON inpatient.escalation (admission_id, paged_at DESC) WHERE acknowledged_at IS NULL;
CREATE TRIGGER escalation_ack_only BEFORE UPDATE ON inpatient.escalation
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('acknowledged_by_user_id','acknowledged_at','outcome');
CREATE TRIGGER escalation_no_delete BEFORE DELETE ON inpatient.escalation
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE OR REPLACE FUNCTION inpatient.vital_set_escalate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.news_band IN ('medium','high') AND NOT NEW.entered_in_error THEN
    INSERT INTO inpatient.escalation (vital_set_id, admission_id, patient_person_id, level, news_score, paged_role)
    VALUES (NEW.id, NEW.admission_id, NEW.patient_person_id,
            CASE WHEN NEW.news_band = 'high' THEN 3 ELSE 2 END, NEW.news_score,
            CASE WHEN NEW.news_band = 'high' THEN 'rapid_response' ELSE 'ward_doctor' END);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vital_set_escalate AFTER INSERT ON inpatient.vital_set
  FOR EACH ROW EXECUTE FUNCTION inpatient.vital_set_escalate();

-- ---------- Nursing tasks and notes ----------
CREATE TABLE inpatient.nursing_task (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  admission_id         uuid NOT NULL REFERENCES access.admission(id),
  patient_person_id    uuid NOT NULL REFERENCES identity.person(id),
  assigned_to_user_id  uuid REFERENCES identity.app_user(id),
  kind                 text NOT NULL DEFAULT 'other' CHECK (kind IN ('vitals','dressing','mobilise','io_chart','education','medication','other')),
  title                text NOT NULL,
  due_at               timestamptz NOT NULL,
  done_at              timestamptz,
  done_by_user_id      uuid REFERENCES identity.app_user(id),
  note                 text,
  created_by_user_id   uuid REFERENCES identity.app_user(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((done_at IS NULL) = (done_by_user_id IS NULL))
);
CREATE INDEX nursing_task_user_ix ON inpatient.nursing_task (assigned_to_user_id, due_at) WHERE done_at IS NULL;
CREATE TRIGGER nursing_task_limited BEFORE UPDATE ON inpatient.nursing_task
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('assigned_to_user_id','done_at','done_by_user_id','note');
CREATE TRIGGER nursing_task_no_delete BEFORE DELETE ON inpatient.nursing_task
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE inpatient.nursing_note (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  admission_id       uuid NOT NULL REFERENCES access.admission(id),
  patient_person_id  uuid NOT NULL REFERENCES identity.person(id),
  author_user_id     uuid NOT NULL REFERENCES identity.app_user(id),
  kind               text NOT NULL DEFAULT 'note' CHECK (kind IN ('note','sbar')),
  body_enc           bytea NOT NULL,                       -- encrypted; SBAR sections live inside the ciphertext
  enc_key_id         text NOT NULL,
  session_id         uuid REFERENCES access.access_session(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nursing_note_admission_ix ON inpatient.nursing_note (admission_id, created_at DESC);
CREATE TRIGGER nursing_note_immutable BEFORE UPDATE OR DELETE ON inpatient.nursing_note
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Inpatient medication orders and the administration record (MAR) ----------
CREATE TABLE inpatient.med_order (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  admission_id         uuid NOT NULL REFERENCES access.admission(id),
  patient_person_id    uuid NOT NULL REFERENCES identity.person(id),
  medicine_id          uuid NOT NULL REFERENCES pharmacy.medicine(id),
  dose                 text NOT NULL,
  route                text NOT NULL DEFAULT 'oral' CHECK (route IN ('oral','iv','im','sc','inhaled','topical','pr','other')),
  frequency            text NOT NULL,                      -- 'TDS', 'q6h', 'stat'
  schedule_times       time[] NOT NULL DEFAULT '{}',
  is_prn               boolean NOT NULL DEFAULT false,
  instructions         text,
  start_at             timestamptz NOT NULL DEFAULT now(),
  stop_at              timestamptz,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped','completed')),
  ordered_by_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  clinical_order_id    uuid REFERENCES records.clinical_order(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX med_order_admission_ix ON inpatient.med_order (admission_id, status);
CREATE TRIGGER med_order_limited BEFORE UPDATE ON inpatient.med_order
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('status','stop_at');
CREATE TRIGGER med_order_no_delete BEFORE DELETE ON inpatient.med_order
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE inpatient.med_administration (
  id                       uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  med_order_id             uuid NOT NULL REFERENCES inpatient.med_order(id),
  admission_id             uuid NOT NULL REFERENCES access.admission(id),
  patient_person_id        uuid NOT NULL REFERENCES identity.person(id),
  due_at                   timestamptz NOT NULL,
  given_at                 timestamptz,
  outcome                  text NOT NULL CHECK (outcome IN ('given','withheld','refused','missed')),
  reason                   text,
  dose_given               text,
  nurse_user_id            uuid NOT NULL REFERENCES identity.app_user(id),
  band_scanned             boolean NOT NULL DEFAULT false,     -- patient wristband scanned
  drug_scanned             boolean NOT NULL DEFAULT false,     -- drug barcode scanned
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (med_order_id, due_at),
  CHECK (outcome = 'given' OR length(trim(coalesce(reason, ''))) > 0),         -- withheld / refused / missed need a reason
  CHECK ((outcome = 'given') = (given_at IS NOT NULL))
);
CREATE INDEX med_admin_due_ix ON inpatient.med_administration (admission_id, due_at);
CREATE TRIGGER med_admin_immutable BEFORE UPDATE OR DELETE ON inpatient.med_administration
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
CREATE TRIGGER med_admin_same_patient BEFORE INSERT ON inpatient.med_administration
  FOR EACH ROW EXECUTE FUNCTION util.check_same_patient('inpatient.med_order', 'med_order_id');

-- Row-level security: same access rule as the rest of the patient record.
CALL util.enable_patient_rls('inpatient.vital_set');
CALL util.enable_patient_rls('inpatient.escalation');
CALL util.enable_patient_rls('inpatient.nursing_task');
CALL util.enable_patient_rls('inpatient.nursing_note');
CALL util.enable_patient_rls('inpatient.med_order');
CALL util.enable_patient_rls('inpatient.med_administration');
-- Ward staff also see the tasks assigned to them while a patient is on their ward.
CREATE POLICY task_assignee ON inpatient.nursing_task FOR SELECT TO cf_app USING (assigned_to_user_id = util.ctx_user_id());

-- ---------- Shift handover (one table for doctors, nurses, lab, radiology …) ----------
CREATE TABLE org.shift_handover (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id           uuid NOT NULL REFERENCES org.hospital(id),
  unit_kind             text NOT NULL CHECK (unit_kind IN ('ward','doctor','casualty','lab','radiology','pharmacy')),
  unit_name             text NOT NULL,                       -- 'Ward 3', 'Central Lab'
  ward_id               uuid REFERENCES org.ward(id),
  shift_date            date NOT NULL DEFAULT current_date,
  from_user_id          uuid NOT NULL REFERENCES identity.app_user(id),
  to_user_id            uuid REFERENCES identity.app_user(id),
  summary               text,
  ai_draft_text         text,                                -- "simulated AI output" draft the nurse / doctor edits
  ai_draft_simulated    boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  signed_at             timestamptz,
  signed_by_user_id     uuid REFERENCES identity.app_user(id),   -- the person taking over
  CHECK ((signed_at IS NULL) = (signed_by_user_id IS NULL))
);
CREATE INDEX shift_handover_ix ON org.shift_handover (hospital_id, shift_date DESC, unit_kind);
-- Before signing the text can be edited; once signed, the handover is a record and cannot change.
CREATE TRIGGER shift_handover_limited BEFORE UPDATE ON org.shift_handover
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('summary','to_user_id','signed_at','signed_by_user_id','ai_draft_text');
CREATE TRIGGER shift_handover_signed_lock BEFORE UPDATE ON org.shift_handover
  FOR EACH ROW WHEN (OLD.signed_at IS NOT NULL) EXECUTE FUNCTION util.forbid_change();
CREATE TRIGGER shift_handover_no_delete BEFORE DELETE ON org.shift_handover
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE org.handover_item (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  handover_id        uuid NOT NULL REFERENCES org.shift_handover(id),
  admission_id       uuid REFERENCES access.admission(id),
  patient_person_id  uuid REFERENCES identity.person(id),
  bed_id             uuid REFERENCES org.bed(id),
  order_id           uuid REFERENCES records.clinical_order(id),
  flag               text NOT NULL DEFAULT 'info' CHECK (flag IN ('watch','pending','transfer','info')),
  note               text NOT NULL,
  from_ai_draft      boolean NOT NULL DEFAULT false,
  done_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX handover_item_ix ON org.handover_item (handover_id);

CREATE OR REPLACE FUNCTION org.handover_visible(p_hospital uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT util.ctx_account_type() IN ('doctor','staff','hospital_admin') AND p_hospital = util.ctx_hospital_id()
$$;
ALTER TABLE org.shift_handover ENABLE ROW LEVEL SECURITY;
CREATE POLICY handover_read ON org.shift_handover FOR SELECT TO cf_app USING (org.handover_visible(hospital_id));
CREATE POLICY handover_write ON org.shift_handover FOR INSERT TO cf_app WITH CHECK (org.handover_visible(hospital_id) AND from_user_id = util.ctx_user_id());
CREATE POLICY handover_update ON org.shift_handover FOR UPDATE TO cf_app USING (org.handover_visible(hospital_id));
ALTER TABLE org.handover_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY handover_item_read ON org.handover_item FOR SELECT TO cf_app
  USING (EXISTS (SELECT 1 FROM org.shift_handover h WHERE h.id = handover_id));
CREATE POLICY handover_item_write ON org.handover_item FOR INSERT TO cf_app
  WITH CHECK (EXISTS (SELECT 1 FROM org.shift_handover h WHERE h.id = handover_id));
CREATE POLICY handover_item_update ON org.handover_item FOR UPDATE TO cf_app
  USING (EXISTS (SELECT 1 FROM org.shift_handover h WHERE h.id = handover_id));

-- ---------- Ward stock (insulin pens …) and requests to the pharmacy ----------
CREATE TABLE org.ward_stock (
  id           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  ward_id      uuid NOT NULL REFERENCES org.ward(id),
  medicine_id  uuid NOT NULL REFERENCES pharmacy.medicine(id),
  quantity     numeric(10,2) NOT NULL CHECK (quantity >= 0),
  par_level    numeric(10,2) NOT NULL DEFAULT 0 CHECK (par_level >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ward_id, medicine_id)
);
CREATE TRIGGER ward_stock_updated BEFORE UPDATE ON org.ward_stock FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

CREATE TABLE org.ward_stock_request (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  ward_id              uuid NOT NULL REFERENCES org.ward(id),
  medicine_id          uuid NOT NULL REFERENCES pharmacy.medicine(id),
  quantity             numeric(10,2) NOT NULL CHECK (quantity > 0),
  requested_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  pharmacy_id          uuid REFERENCES org.pharmacy(id),
  status               text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','issued','rejected','cancelled')),
  note                 text,
  requested_at         timestamptz NOT NULL DEFAULT now(),
  decided_by_user_id   uuid REFERENCES identity.app_user(id),
  fulfilled_at         timestamptz
);
CREATE INDEX ward_stock_request_ix ON org.ward_stock_request (ward_id, status);

-- ---------- Staff shifts (attendance for "staff on duty", breaks) ----------
CREATE TABLE org.staff_shift (
  id            uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  user_id       uuid NOT NULL REFERENCES identity.app_user(id),
  hospital_id   uuid NOT NULL REFERENCES org.hospital(id),
  ward_id       uuid REFERENCES org.ward(id),
  role_label    text,                                    -- 'Staff nurse', 'Charge nurse'
  shift_start   timestamptz NOT NULL,
  shift_end     timestamptz NOT NULL,
  break_taken   boolean NOT NULL DEFAULT false,
  break_minutes smallint CHECK (break_minutes IS NULL OR break_minutes >= 0),
  clocked_in_at timestamptz,
  CHECK (shift_end > shift_start),
  EXCLUDE USING gist (user_id WITH =, tstzrange(shift_start, shift_end) WITH &&)
);
CREATE INDEX staff_shift_hospital_ix ON org.staff_shift (hospital_id, shift_start);

-- ---------- Bed board (nurse home) ----------
-- stable = low, watch = low_medium / medium, critical = high.
CREATE VIEW inpatient.v_bed_board WITH (security_invoker = true) AS
SELECT b.hospital_id, w.id AS ward_id, w.name AS ward, b.id AS bed_id, b.bed_no, b.bed_type, b.status AS bed_status,
       a.id AS admission_id, a.patient_person_id, p.full_name AS patient_name, a.ip_number, a.diagnosis_text,
       vs.news_score AS latest_news, vs.observed_at AS latest_news_at,
       CASE WHEN a.id IS NULL THEN 'free'
            WHEN vs.news_band = 'high' THEN 'critical'
            WHEN vs.news_band IN ('medium','low_medium') THEN 'watch'
            ELSE 'stable' END AS acuity
FROM org.bed b
JOIN org.ward w ON w.id = b.ward_id
LEFT JOIN access.admission a ON a.bed_id = b.id AND a.discharged_at IS NULL
LEFT JOIN identity.person p ON p.id = a.patient_person_id
LEFT JOIN LATERAL (SELECT s.news_score, s.news_band, s.observed_at FROM inpatient.vital_set s
                    WHERE s.admission_id = a.id AND NOT s.entered_in_error ORDER BY s.observed_at DESC LIMIT 1) vs ON true;

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA inpatient, org, access TO cf_app;
GRANT SELECT ON ALL TABLES IN SCHEMA inpatient TO cf_ai;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA inpatient, org, access TO cf_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA inpatient, org, access FROM cf_app, cf_ai, cf_report, cf_auditor;

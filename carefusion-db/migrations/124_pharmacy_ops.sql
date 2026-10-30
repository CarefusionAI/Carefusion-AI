-- =====================================================================
-- 124_pharmacy_ops.sql : prescription number + verify / ready / collected,
--   doctor drafts, counter queue tokens, dose schedule + dose log, stock
--   batches (publish / block / cost), FEFO rule, stock ledger, suppliers +
--   purchase orders (approval over Rs 1,00,000), CDSCO recalls, substitutes,
--   finder search log, sync runs, counter state, dispensing log views.
-- Decisions (assumptions): a doctor's "Save draft" lives in pharmacy.prescription_draft
--   (prescription rows are immutable and need a signed document); "ready" and
--   "collected" live in pharmacy.rx_fulfilment, not as new rx_status values.
-- Rule codes: CF130 (stock cannot go below zero), CF131 (recall rights),
--   CF132 (batch blocked), CF133 (FEFO override reason), CF134 (PO approval).
-- =====================================================================

-- ---------- Prescription number, schedule details ----------
CREATE SEQUENCE pharmacy.rx_number_seq START 90000;       -- RX-DEMO-88213 style numbers below 90000 are for the seed
ALTER TABLE pharmacy.prescription ADD COLUMN rx_number text NOT NULL DEFAULT ('RX-DEMO-' || nextval('pharmacy.rx_number_seq')::text);
ALTER TABLE pharmacy.prescription ADD CONSTRAINT prescription_rx_number_uq UNIQUE (rx_number);
ALTER TABLE pharmacy.prescription_item ADD COLUMN schedule_times time[] NOT NULL DEFAULT '{}';
ALTER TABLE pharmacy.prescription_item ADD COLUMN with_food text CHECK (with_food IS NULL OR with_food IN ('before','with','after','any'));
ALTER TABLE pharmacy.prescription_item ADD COLUMN check_results jsonb NOT NULL DEFAULT '{}'::jsonb;   -- allergy / interaction / stock / eGFR results the doctor saw
ALTER TABLE pharmacy.dispensing ADD COLUMN batch_override_reason text;

-- Doctor's working copy before signing (lines as JSON; becomes a prescription on e-sign).
CREATE TABLE pharmacy.prescription_draft (
  id                       uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id        uuid NOT NULL REFERENCES identity.person(id),
  doctor_user_id           uuid NOT NULL REFERENCES identity.app_user(id),
  session_id               uuid NOT NULL REFERENCES access.access_session(id),
  hospital_id              uuid NOT NULL REFERENCES org.hospital(id),
  lines                    jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{medicine_id,dose,frequency,duration_days,quantity,…}]
  checks                   jsonb NOT NULL DEFAULT '{}'::jsonb,       -- allergy / interaction / stock / eGFR results shown
  notes                    text,
  promoted_prescription_id uuid REFERENCES pharmacy.prescription(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rx_draft_doctor_ix ON pharmacy.prescription_draft (doctor_user_id, updated_at DESC) WHERE promoted_prescription_id IS NULL;
CREATE TRIGGER rx_draft_updated BEFORE UPDATE ON pharmacy.prescription_draft FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();
ALTER TABLE pharmacy.prescription_draft ENABLE ROW LEVEL SECURITY;
CREATE POLICY draft_owner ON pharmacy.prescription_draft FOR ALL TO cf_app
  USING (doctor_user_id = util.ctx_user_id()) WITH CHECK (doctor_user_id = util.ctx_user_id());

-- Pharmacy of the current pharmacist / pharmacy admin.
CREATE OR REPLACE FUNCTION pharmacy.ctx_pharmacy_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE(pp.pharmacy_id, pa.pharmacy_id)
  FROM identity.app_user u
  LEFT JOIN identity.pharmacist_profile pp ON pp.user_id = u.id
  LEFT JOIN identity.pharmacy_admin_profile pa ON pa.user_id = u.id
  WHERE u.id = util.ctx_user_id()
$$;

-- ---------- Verification, ready / collected, counter queue ----------
CREATE TABLE pharmacy.queue_token (
  id               uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  prescription_id  uuid NOT NULL REFERENCES pharmacy.prescription(id),
  pharmacy_id      uuid NOT NULL REFERENCES org.pharmacy(id),
  token_date       date NOT NULL DEFAULT current_date,
  token_no         int NOT NULL CHECK (token_no > 0),
  token_label      text NOT NULL,                              -- 'P-042'
  counter          text,
  issued_at        timestamptz NOT NULL DEFAULT now(),
  called_at        timestamptz,
  served_at        timestamptz,
  UNIQUE (pharmacy_id, token_date, token_no),
  UNIQUE (prescription_id, pharmacy_id)
);
CREATE INDEX queue_token_open_ix ON pharmacy.queue_token (pharmacy_id, token_date, token_no) WHERE served_at IS NULL;

CREATE TABLE pharmacy.rx_verification (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  prescription_id       uuid NOT NULL REFERENCES pharmacy.prescription(id),
  pharmacy_id           uuid NOT NULL REFERENCES org.pharmacy(id),
  pharmacist_user_id    uuid NOT NULL REFERENCES identity.app_user(id),
  check_code            text NOT NULL CHECK (check_code IN ('esignature','qr','hpr','validity','allergy','interaction','stock')),
  passed                boolean NOT NULL,
  detail                text,
  checked_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rx_verification_rx_ix ON pharmacy.rx_verification (prescription_id, checked_at DESC);
CREATE TRIGGER rx_verification_immutable BEFORE UPDATE OR DELETE ON pharmacy.rx_verification
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- One row per prescription at the pharmacy that fills it: verified -> ready -> collected.
CREATE TABLE pharmacy.rx_fulfilment (
  prescription_id       uuid PRIMARY KEY REFERENCES pharmacy.prescription(id),
  pharmacy_id           uuid NOT NULL REFERENCES org.pharmacy(id),
  verified_by_user_id   uuid REFERENCES identity.app_user(id),
  verified_at           timestamptz,
  ready_at              timestamptz,
  collected_at          timestamptz,
  collected_by_person_id uuid REFERENCES identity.person(id),          -- patient or a family member
  sms_sent_at           timestamptz,
  CHECK ((verified_by_user_id IS NULL) = (verified_at IS NULL)),
  CHECK (ready_at IS NULL OR verified_at IS NOT NULL),
  CHECK (collected_at IS NULL OR ready_at IS NOT NULL)
);
CREATE TRIGGER rx_fulfilment_no_delete BEFORE DELETE ON pharmacy.rx_fulfilment FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Read = anyone who may read the prescription (patient, writer, receiving pharmacy); write = the pharmacy's pharmacist.
DO $$
DECLARE t text; col text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy.queue_token','pharmacy.rx_verification','pharmacy.rx_fulfilment'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY via_prescription ON %s FOR SELECT TO cf_app
                    USING (EXISTS (SELECT 1 FROM pharmacy.prescription p WHERE p.id = prescription_id))', t);
    EXECUTE format('CREATE POLICY pharmacy_write ON %s FOR INSERT TO cf_app
                    WITH CHECK (util.ctx_account_type() = ''pharmacist'' AND pharmacy_id = pharmacy.ctx_pharmacy_id())', t);
    IF t <> 'pharmacy.rx_verification' THEN
      EXECUTE format('CREATE POLICY pharmacy_update ON %s FOR UPDATE TO cf_app
                      USING (util.ctx_account_type() = ''pharmacist'' AND pharmacy_id = pharmacy.ctx_pharmacy_id())', t);
    END IF;
  END LOOP;
END $$;

-- ---------- Dose schedule and dose log ----------
CREATE TABLE records.dose_log (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id     uuid NOT NULL REFERENCES identity.person(id),
  prescription_item_id  uuid NOT NULL REFERENCES pharmacy.prescription_item(id),
  scheduled_for         timestamptz NOT NULL,
  taken_at              timestamptz,
  skipped               boolean NOT NULL DEFAULT false,
  skip_reason           text,
  source                text NOT NULL DEFAULT 'self' CHECK (source IN ('self','caregiver','nurse')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prescription_item_id, scheduled_for),
  CHECK (NOT (skipped AND taken_at IS NOT NULL))
);
CREATE INDEX dose_log_patient_ix ON records.dose_log (patient_person_id, scheduled_for);
CREATE OR REPLACE FUNCTION records.dose_log_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE p uuid;
BEGIN
  SELECT rx.patient_person_id INTO p FROM pharmacy.prescription_item i
    JOIN pharmacy.prescription rx ON rx.id = i.prescription_id WHERE i.id = NEW.prescription_item_id;
  IF p IS DISTINCT FROM NEW.patient_person_id THEN
    RAISE EXCEPTION 'CF100: prescription item belongs to another patient' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dose_log_same_patient BEFORE INSERT ON records.dose_log FOR EACH ROW EXECUTE FUNCTION records.dose_log_check();
CREATE TRIGGER dose_log_tick_only BEFORE UPDATE ON records.dose_log
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('taken_at','skipped','skip_reason','source');
CREATE TRIGGER dose_log_no_delete BEFORE DELETE ON records.dose_log FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
CALL util.enable_patient_rls('records.dose_log');

-- Create the dose slots for an item from its schedule_times (India time), for p_days days from p_from.
CREATE OR REPLACE FUNCTION pharmacy.generate_dose_log(p_item uuid, p_from date DEFAULT current_date, p_days int DEFAULT NULL)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE i pharmacy.prescription_item; pat uuid; n int;
BEGIN
  SELECT * INTO i FROM pharmacy.prescription_item WHERE id = p_item;
  SELECT patient_person_id INTO pat FROM pharmacy.prescription WHERE id = i.prescription_id;
  INSERT INTO records.dose_log (patient_person_id, prescription_item_id, scheduled_for)
  SELECT pat, i.id, ((p_from + d) + t) AT TIME ZONE 'Asia/Kolkata'
  FROM generate_series(0, COALESCE(p_days, i.duration_days) - 1) d, unnest(i.schedule_times) t
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- "n left": quantity prescribed minus doses taken (assumes 1 unit per dose; refine per form later).
CREATE VIEW records.v_medicine_supply WITH (security_invoker = true) AS
SELECT i.id AS prescription_item_id, rx.patient_person_id, rx.rx_number, i.medicine_id, i.quantity,
       (SELECT count(*) FROM records.dose_log d WHERE d.prescription_item_id = i.id AND d.taken_at IS NOT NULL)::int AS doses_taken,
       i.quantity - (SELECT count(*) FROM records.dose_log d WHERE d.prescription_item_id = i.id AND d.taken_at IS NOT NULL) AS units_left,
       rx.valid_until
FROM pharmacy.prescription_item i JOIN pharmacy.prescription rx ON rx.id = i.prescription_id;

-- ---------- Stock batches: publish / block / cost; medicine category; pharmacy licence facts ----------
ALTER TABLE pharmacy.stock_item ADD COLUMN is_published boolean NOT NULL DEFAULT true;     -- shown in the public finder
ALTER TABLE pharmacy.stock_item ADD COLUMN mrp numeric(10,2) CHECK (mrp IS NULL OR mrp >= 0);
ALTER TABLE pharmacy.stock_item ADD COLUMN cost numeric(10,2) CHECK (cost IS NULL OR cost >= 0);
ALTER TABLE pharmacy.stock_item ADD COLUMN blocked_reason text;                           -- recall etc.; counter refuses to dispense
ALTER TABLE pharmacy.stock_item ADD COLUMN blocked_at timestamptz;
ALTER TABLE pharmacy.stock_item ADD CONSTRAINT stock_blocked_pair CHECK ((blocked_reason IS NULL) = (blocked_at IS NULL));
ALTER TABLE pharmacy.medicine ADD COLUMN category text;                                   -- Diabetes, Cardiac, General …
ALTER TABLE pharmacy.medicine ADD COLUMN is_jan_aushadhi boolean NOT NULL DEFAULT false;
CREATE INDEX medicine_category_ix ON pharmacy.medicine (category);
ALTER TABLE org.pharmacy ADD COLUMN licence_valid_until date;
ALTER TABLE org.pharmacy ADD COLUMN is_jan_aushadhi boolean NOT NULL DEFAULT false;
ALTER TABLE org.pharmacy ADD COLUMN counters smallint NOT NULL DEFAULT 1 CHECK (counters > 0);
ALTER TABLE org.pharmacy ADD COLUMN compliance_score smallint CHECK (compliance_score IS NULL OR compliance_score BETWEEN 0 AND 100);
ALTER TABLE org.pharmacy ADD COLUMN last_inspection_on date;
ALTER TABLE org.pharmacy ADD COLUMN next_inspection_due date;

-- The public finder shows only published, unblocked batches (presence, not exact stock, is shown by the app).
CREATE OR REPLACE VIEW pharmacy.v_stock_status AS
SELECT s.pharmacy_id, ph.name AS pharmacy_name, ph.location, ph.opening_hours, ph.pharmacy_type,
       s.medicine_id, m.generic_name, m.form, m.strength, m.schedule,
       sum(s.quantity) FILTER (WHERE s.expiry_date >= current_date) AS quantity,
       min(s.unit_price) AS min_price,
       CASE WHEN coalesce(sum(s.quantity) FILTER (WHERE s.expiry_date >= current_date), 0) = 0 THEN 'out'
            WHEN sum(s.quantity) FILTER (WHERE s.expiry_date >= current_date) <= max(s.low_threshold) THEN 'low'
            ELSE 'in' END AS stock_level
FROM pharmacy.stock_item s
JOIN org.pharmacy ph ON ph.id = s.pharmacy_id AND ph.status = 'active'
JOIN pharmacy.medicine m ON m.id = s.medicine_id
WHERE s.is_published AND s.blocked_reason IS NULL
GROUP BY s.pharmacy_id, ph.name, ph.location, ph.opening_hours, ph.pharmacy_type,
         s.medicine_id, m.generic_name, m.form, m.strength, m.schedule;

-- Pharmacy admin overview numbers.
CREATE VIEW pharmacy.v_stock_overview AS
SELECT s.pharmacy_id,
       count(DISTINCT s.medicine_id)::int AS skus,
       count(DISTINCT s.medicine_id) FILTER (WHERE s.is_published AND s.blocked_reason IS NULL)::int AS skus_published,
       count(*) FILTER (WHERE s.quantity < s.low_threshold AND s.blocked_reason IS NULL)::int AS low_batches,
       count(*) FILTER (WHERE s.blocked_reason IS NOT NULL)::int AS blocked_batches,
       coalesce(sum(s.quantity * coalesce(s.cost, s.unit_price)), 0)::numeric(14,2) AS stock_value
FROM pharmacy.stock_item s GROUP BY s.pharmacy_id;

-- Expiry watch: <=30 days, 31-90 days, with value at cost.
CREATE VIEW pharmacy.v_expiry_watch AS
SELECT s.pharmacy_id, s.medicine_id, m.generic_name, s.batch_no, s.expiry_date, s.quantity,
       (s.quantity * coalesce(s.cost, s.unit_price))::numeric(14,2) AS value_at_cost,
       CASE WHEN s.expiry_date < current_date THEN 'expired'
            WHEN s.expiry_date <= current_date + 30 THEN 'within_30_days'
            ELSE 'within_90_days' END AS bucket,
       date_trunc('month', s.expiry_date)::date AS expiry_month
FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
WHERE s.quantity > 0 AND s.expiry_date <= current_date + 90;

-- ---------- Stock ledger ----------
CREATE TYPE pharmacy.movement_type AS ENUM ('receipt','dispense','adjustment','write_off','return_to_supplier','transfer','quarantine');
CREATE TABLE pharmacy.stock_movement (
  id             uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  pharmacy_id    uuid NOT NULL REFERENCES org.pharmacy(id),
  stock_item_id  uuid NOT NULL REFERENCES pharmacy.stock_item(id),
  movement_type  pharmacy.movement_type NOT NULL,
  quantity_delta numeric(12,2) NOT NULL CHECK (quantity_delta <> 0),
  reason         text,
  po_id          uuid,                                        -- FK added below (purchase_order defined after)
  ref_table      text,
  ref_id         uuid,
  by_user_id     uuid REFERENCES identity.app_user(id),
  at             timestamptz NOT NULL DEFAULT now(),
  CHECK (movement_type::text NOT IN ('adjustment','write_off','return_to_supplier') OR length(trim(coalesce(reason, ''))) > 0)
);
CREATE INDEX stock_movement_item_ix ON pharmacy.stock_movement (stock_item_id, at DESC);
CREATE INDEX stock_movement_pharmacy_ix ON pharmacy.stock_movement (pharmacy_id, at DESC);
CREATE TRIGGER stock_movement_immutable BEFORE UPDATE OR DELETE ON pharmacy.stock_movement FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Every movement except a dispense (already applied by pharmacy.apply_dispensing) changes the batch quantity.
CREATE OR REPLACE FUNCTION pharmacy.apply_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE q numeric;
BEGIN
  IF NEW.movement_type::text <> 'dispense' THEN
    UPDATE pharmacy.stock_item SET quantity = quantity + NEW.quantity_delta
     WHERE id = NEW.stock_item_id AND pharmacy_id = NEW.pharmacy_id RETURNING quantity INTO q;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CF130: stock batch not found in this pharmacy' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_movement_apply AFTER INSERT ON pharmacy.stock_movement FOR EACH ROW EXECUTE FUNCTION pharmacy.apply_movement();
-- (stock_item.quantity already has CHECK (quantity >= 0), so a movement that would go below zero fails.)

-- Log each dispense in the ledger, block recalled batches, enforce FEFO with an override reason.
CREATE OR REPLACE FUNCTION pharmacy.dispense_log_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.outcome::text IN ('dispensed','substitute') THEN
    INSERT INTO pharmacy.stock_movement (pharmacy_id, stock_item_id, movement_type, quantity_delta, ref_table, ref_id, by_user_id)
    VALUES (NEW.pharmacy_id, NEW.stock_item_id, 'dispense', -NEW.quantity, 'pharmacy.dispensing', NEW.id, NEW.pharmacist_user_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dispensing_movement AFTER INSERT ON pharmacy.dispensing FOR EACH ROW EXECUTE FUNCTION pharmacy.dispense_log_movement();

CREATE OR REPLACE FUNCTION pharmacy.dispense_batch_rules() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE s pharmacy.stock_item;
BEGIN
  IF NEW.outcome::text IN ('dispensed','substitute') THEN
    SELECT * INTO s FROM pharmacy.stock_item WHERE id = NEW.stock_item_id;
    IF s.blocked_reason IS NOT NULL THEN
      RAISE EXCEPTION 'CF132: batch % is blocked (%)', s.batch_no, s.blocked_reason USING ERRCODE = 'check_violation';
    END IF;
    -- FEFO: an earlier-expiring batch of the same medicine was available, so the pharmacist must say why.
    IF EXISTS (SELECT 1 FROM pharmacy.stock_item o
               WHERE o.pharmacy_id = s.pharmacy_id AND o.medicine_id = s.medicine_id AND o.id <> s.id
                 AND o.expiry_date < s.expiry_date AND o.expiry_date >= current_date
                 AND o.blocked_reason IS NULL AND o.quantity >= NEW.quantity)
       AND length(trim(coalesce(NEW.batch_override_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'CF133: an earlier-expiring batch is available; give a reason to override FEFO' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dispensing_batch_rules BEFORE INSERT ON pharmacy.dispensing FOR EACH ROW EXECUTE FUNCTION pharmacy.dispense_batch_rules();

-- ---------- Suppliers, purchase orders, indents ----------
CREATE TABLE pharmacy.supplier (
  id          uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  name        text NOT NULL UNIQUE,
  kind        text NOT NULL DEFAULT 'distributor' CHECK (kind IN ('state_store','distributor','manufacturer','district_store')),
  district_id uuid REFERENCES geo.district(id),
  gstin       text,
  is_active   boolean NOT NULL DEFAULT true
);
CREATE SEQUENCE pharmacy.po_number_seq START 419;
CREATE TABLE pharmacy.purchase_order (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  po_number            text NOT NULL UNIQUE DEFAULT ('PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('pharmacy.po_number_seq')::text, 4, '0')),
  pharmacy_id          uuid NOT NULL REFERENCES org.pharmacy(id),
  supplier_id          uuid NOT NULL REFERENCES pharmacy.supplier(id),
  is_indent            boolean NOT NULL DEFAULT false,                       -- request to the district / state store
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_approval','approved','held','sent','in_transit','received','cancelled')),
  total_amount         numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),     -- kept by trigger from po_line
  raised_by_user_id    uuid NOT NULL REFERENCES identity.app_user(id),
  approved_by_user_id  uuid REFERENCES identity.app_user(id),
  approved_at          timestamptz,
  hold_reason          text,
  expected_on          date,
  received_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- orders over Rs 1,00,000 need the pharmacy admin's approval before they go out
  CONSTRAINT po_needs_approval CHECK (status NOT IN ('approved','sent','in_transit','received')
                                      OR total_amount <= 100000 OR approved_by_user_id IS NOT NULL),
  CONSTRAINT po_approver_not_raiser CHECK (approved_by_user_id IS NULL OR approved_by_user_id <> raised_by_user_id),
  CONSTRAINT po_hold_reason CHECK (status <> 'held' OR length(trim(coalesce(hold_reason, ''))) > 0)
);
CREATE INDEX po_pharmacy_ix ON pharmacy.purchase_order (pharmacy_id, status, created_at DESC);
CREATE TRIGGER po_updated BEFORE UPDATE ON pharmacy.purchase_order FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();
ALTER TABLE pharmacy.stock_movement ADD CONSTRAINT stock_movement_po_fk FOREIGN KEY (po_id) REFERENCES pharmacy.purchase_order(id);

CREATE TABLE pharmacy.po_line (
  id           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  po_id        uuid NOT NULL REFERENCES pharmacy.purchase_order(id),
  medicine_id  uuid NOT NULL REFERENCES pharmacy.medicine(id),
  quantity     numeric(12,2) NOT NULL CHECK (quantity > 0),
  unit_cost    numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  line_total   numeric(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  received_qty numeric(12,2) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  UNIQUE (po_id, medicine_id)
);
CREATE OR REPLACE FUNCTION pharmacy.po_recalc() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE pid uuid := COALESCE(NEW.po_id, OLD.po_id);
BEGIN
  UPDATE pharmacy.purchase_order SET total_amount = COALESCE((SELECT sum(line_total) FROM pharmacy.po_line WHERE po_id = pid), 0)
   WHERE id = pid;
  RETURN NULL;
END $$;
CREATE TRIGGER po_line_total AFTER INSERT OR UPDATE OR DELETE ON pharmacy.po_line FOR EACH ROW EXECUTE FUNCTION pharmacy.po_recalc();

-- ---------- Recalls (CDSCO / manufacturer notices) ----------
CREATE TABLE pharmacy.drug_recall (
  id             uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  recall_ref     text NOT NULL UNIQUE,
  source         text NOT NULL CHECK (source IN ('CDSCO','state_drug_control','manufacturer')),
  medicine_id    uuid REFERENCES pharmacy.medicine(id),
  medicine_name  text NOT NULL,
  batch_no       text,
  recall_class   text NOT NULL DEFAULT 'II' CHECK (recall_class IN ('I','II','III','notice')),
  issued_on      date NOT NULL DEFAULT current_date,
  title          text NOT NULL,
  reason         text,
  urgent         boolean NOT NULL DEFAULT false,
  action_text    text,
  notice_key     text,                                          -- object-storage key of the notice PDF
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER drug_recall_immutable BEFORE UPDATE OR DELETE ON pharmacy.drug_recall FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
CREATE TABLE pharmacy.recall_ack (
  recall_id              uuid NOT NULL REFERENCES pharmacy.drug_recall(id),
  pharmacy_id            uuid NOT NULL REFERENCES org.pharmacy(id),
  status                 text NOT NULL DEFAULT 'action_needed' CHECK (status IN ('action_needed','review','confirmed_off_shelf','not_stocked')),
  qty_on_shelf           numeric(12,2),
  confirmed_by_user_id   uuid REFERENCES identity.app_user(id),
  confirmed_at           timestamptz,
  note                   text,
  PRIMARY KEY (recall_id, pharmacy_id),
  CHECK ((confirmed_by_user_id IS NULL) = (confirmed_at IS NULL))
);

-- Apply a recall: block matching batches everywhere (class I-III) and open an acknowledgement per pharmacy.
CREATE OR REPLACE FUNCTION pharmacy.apply_recall(p_recall uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r pharmacy.drug_recall; n int := 0;
BEGIN
  IF util.ctx_user_id() IS NOT NULL AND util.ctx_account_type() <> 'central_admin' THEN
    RAISE EXCEPTION 'CF131: only central admin or a system job may apply a recall' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM pharmacy.drug_recall WHERE id = p_recall;
  IF r.recall_class <> 'notice' AND r.medicine_id IS NOT NULL AND r.batch_no IS NOT NULL THEN
    UPDATE pharmacy.stock_item
       SET blocked_reason = 'Recall ' || r.recall_ref, blocked_at = now(), is_published = false
     WHERE medicine_id = r.medicine_id AND batch_no = r.batch_no AND blocked_reason IS NULL;
  END IF;
  INSERT INTO pharmacy.recall_ack (recall_id, pharmacy_id, status, qty_on_shelf)
  SELECT r.id, s.pharmacy_id, CASE WHEN r.recall_class = 'notice' THEN 'review' ELSE 'action_needed' END, sum(s.quantity)
  FROM pharmacy.stock_item s
  WHERE s.medicine_id = r.medicine_id AND (r.batch_no IS NULL OR s.batch_no = r.batch_no)
  GROUP BY s.pharmacy_id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ---------- Substitutes ----------
CREATE TABLE pharmacy.medicine_substitute (
  medicine_id             uuid NOT NULL REFERENCES pharmacy.medicine(id),
  substitute_medicine_id  uuid NOT NULL REFERENCES pharmacy.medicine(id),
  kind                    text NOT NULL DEFAULT 'generic' CHECK (kind IN ('generic','therapeutic')),
  note                    text,
  requires_doctor_ok      boolean NOT NULL DEFAULT false,         -- therapeutic swaps need the prescriber's agreement
  PRIMARY KEY (medicine_id, substitute_medicine_id),
  CHECK (medicine_id <> substitute_medicine_id)
);

-- ---------- Finder search log and billing sync ----------
CREATE TABLE pharmacy.stock_search_log (
  id           uuid NOT NULL DEFAULT util.uuid_v7(),
  pharmacy_id  uuid NOT NULL,                      -- pharmacy shown in the result (no FK: hot table)
  medicine_id  uuid NOT NULL,
  searched_at  timestamptz NOT NULL DEFAULT now(),
  district_id  uuid,                               -- searcher's district (coarse)
  PRIMARY KEY (id, searched_at)
) PARTITION BY RANGE (searched_at);
CREATE INDEX stock_search_pharmacy_ix ON pharmacy.stock_search_log (pharmacy_id, searched_at DESC);
CREATE TABLE pharmacy.stock_search_log_default PARTITION OF pharmacy.stock_search_log DEFAULT;
CREATE TRIGGER stock_search_log_immutable BEFORE UPDATE OR DELETE ON pharmacy.stock_search_log FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
SELECT util.ensure_monthly_partitions('pharmacy.stock_search_log', date_trunc('month', now())::date, 24);

CREATE TABLE pharmacy.stock_sync_run (
  id            uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  pharmacy_id   uuid NOT NULL REFERENCES org.pharmacy(id),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed')),
  rows_synced   int NOT NULL DEFAULT 0 CHECK (rows_synced >= 0),
  error         text
);
CREATE INDEX stock_sync_pharmacy_ix ON pharmacy.stock_sync_run (pharmacy_id, started_at DESC);

-- ---------- Pharmacist profile extras and counter state ----------
ALTER TABLE identity.pharmacist_profile ADD COLUMN role_label text;                               -- Senior pharmacist, Store in-charge
ALTER TABLE identity.pharmacist_profile ADD COLUMN shift text CHECK (shift IS NULL OR shift IN ('day','night','rotating'));
CREATE TABLE pharmacy.counter_state (
  user_id      uuid PRIMARY KEY REFERENCES identity.app_user(id),
  pharmacy_id  uuid NOT NULL REFERENCES org.pharmacy(id),
  counter      text,
  state        text NOT NULL DEFAULT 'off' CHECK (state IN ('on','break','off')),
  since        timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz
);

-- ---------- Dispensing log (CSV export) ----------
CREATE VIEW pharmacy.v_dispensing_log WITH (security_invoker = true) AS
SELECT d.dispensed_at, d.pharmacy_id, rx.rx_number, d.pharmacist_user_id, pp.full_name AS pharmacist,
       m.generic_name, m.strength, d.outcome, d.quantity, s.batch_no, d.substitute_medicine_id, d.batch_override_reason
FROM pharmacy.dispensing d
JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
JOIN pharmacy.prescription rx ON rx.id = i.prescription_id
JOIN pharmacy.medicine m ON m.id = i.medicine_id
JOIN identity.app_user pu ON pu.id = d.pharmacist_user_id
JOIN identity.person pp ON pp.id = pu.person_id
LEFT JOIN pharmacy.stock_item s ON s.id = d.stock_item_id;

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA pharmacy, records, org, identity TO cf_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA pharmacy TO cf_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pharmacy, records TO cf_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA pharmacy, records, org, identity FROM cf_app, cf_ai, cf_report, cf_auditor;

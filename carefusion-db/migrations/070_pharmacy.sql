-- =====================================================================
-- 070_pharmacy.sql : medicine catalogue, interactions, e-signed
--                    prescriptions, delivery, live stock, dispensing,
--                    controlled-drug register
-- =====================================================================

CREATE TYPE pharmacy.schedule AS ENUM ('none','H','H1','X');
CREATE TYPE pharmacy.rx_status AS ENUM ('issued','partly_dispensed','dispensed','expired','cancelled');
CREATE TYPE pharmacy.dispense_outcome AS ENUM ('dispensed','substitute','out_of_stock');
CREATE TYPE pharmacy.sent_by AS ENUM ('patient','doctor_same_hospital');

-- ---------- National medicine catalogue (source to confirm) ----------
CREATE TABLE pharmacy.medicine (
  id             uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  generic_name   text NOT NULL,
  form           text NOT NULL,                       -- tablet, syrup, injection …
  strength       text NOT NULL,
  schedule       pharmacy.schedule NOT NULL DEFAULT 'none',
  atc_code       text,
  is_active      boolean NOT NULL DEFAULT true,
  UNIQUE (generic_name, form, strength)
);
CREATE INDEX medicine_name_ix ON pharmacy.medicine (lower(generic_name) text_pattern_ops);

CREATE TABLE pharmacy.drug_interaction (
  medicine_a_id  uuid NOT NULL REFERENCES pharmacy.medicine(id),
  medicine_b_id  uuid NOT NULL REFERENCES pharmacy.medicine(id),
  severity       text NOT NULL CHECK (severity IN ('minor','moderate','major','contraindicated')),
  note           text,
  source         text NOT NULL,
  PRIMARY KEY (medicine_a_id, medicine_b_id),
  CHECK (medicine_a_id < medicine_b_id)              -- store each pair once
);

-- ---------- Prescriptions ----------
CREATE TABLE pharmacy.prescription (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id   uuid NOT NULL REFERENCES identity.person(id),
  doctor_user_id      uuid NOT NULL REFERENCES identity.app_user(id),
  session_id          uuid NOT NULL REFERENCES access.access_session(id),
  hospital_id         uuid NOT NULL REFERENCES org.hospital(id),
  issued_at           timestamptz NOT NULL DEFAULT now(),
  valid_until         timestamptz NOT NULL,
  document_id         uuid NOT NULL REFERENCES records.document(id),   -- signed PDF
  signature_method    identity.signing_method NOT NULL,
  signature_ref       text NOT NULL,                  -- signature / certificate reference
  qr_token            text NOT NULL UNIQUE,           -- random; QR carries only this token
  status              pharmacy.rx_status NOT NULL DEFAULT 'issued',
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > issued_at)
);
CREATE INDEX rx_patient_ix ON pharmacy.prescription (patient_person_id, issued_at DESC);
CREATE TRIGGER rx_status_only BEFORE UPDATE ON pharmacy.prescription
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('status','updated_at');
CREATE TRIGGER rx_no_delete BEFORE DELETE ON pharmacy.prescription
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE pharmacy.prescription_item (
  id                           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  prescription_id              uuid NOT NULL REFERENCES pharmacy.prescription(id),
  medicine_id                  uuid NOT NULL REFERENCES pharmacy.medicine(id),
  dose                         text NOT NULL,
  frequency                    text NOT NULL,
  duration_days                smallint NOT NULL CHECK (duration_days > 0),
  quantity                     numeric(10,2) NOT NULL CHECK (quantity > 0),
  instructions                 text,
  allergy_warning_shown        boolean NOT NULL DEFAULT false,
  interaction_warning_shown    boolean NOT NULL DEFAULT false,
  override_reason              text,
  CHECK (NOT (allergy_warning_shown OR interaction_warning_shown) OR override_reason IS NOT NULL)
);
CREATE INDEX rx_item_rx_ix ON pharmacy.prescription_item (prescription_id);
CREATE TRIGGER rx_item_immutable BEFORE UPDATE OR DELETE ON pharmacy.prescription_item
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE pharmacy.prescription_delivery (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  prescription_id    uuid NOT NULL REFERENCES pharmacy.prescription(id),
  pharmacy_id        uuid NOT NULL REFERENCES org.pharmacy(id),
  sent_by            pharmacy.sent_by NOT NULL,
  patient_agreed_at  timestamptz,
  sent_at            timestamptz NOT NULL DEFAULT now(),
  received_at        timestamptz,
  CHECK (sent_by <> 'doctor_same_hospital' OR patient_agreed_at IS NOT NULL)
);
CREATE INDEX rx_delivery_pharmacy_ix ON pharmacy.prescription_delivery (pharmacy_id, received_at);

-- Doctor may send directly only to the pharmacy linked to the prescription's hospital.
CREATE OR REPLACE FUNCTION pharmacy.check_delivery() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sent_by = 'doctor_same_hospital' AND NOT EXISTS (
       SELECT 1 FROM pharmacy.prescription p JOIN org.pharmacy ph ON ph.linked_hospital_id = p.hospital_id
       WHERE p.id = NEW.prescription_id AND ph.id = NEW.pharmacy_id) THEN
    RAISE EXCEPTION 'CF050: doctor can send directly only to own hospital pharmacy' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rx_delivery_check BEFORE INSERT ON pharmacy.prescription_delivery
  FOR EACH ROW EXECUTE FUNCTION pharmacy.check_delivery();

-- ---------- Live stock ----------
CREATE TABLE pharmacy.stock_item (
  id             uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  pharmacy_id    uuid NOT NULL REFERENCES org.pharmacy(id),
  medicine_id    uuid NOT NULL REFERENCES pharmacy.medicine(id),
  batch_no       text NOT NULL,
  expiry_date    date NOT NULL,
  quantity       numeric(12,2) NOT NULL CHECK (quantity >= 0),
  unit_price     numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  low_threshold  numeric(12,2) NOT NULL DEFAULT 10,
  source         org.stock_source NOT NULL DEFAULT 'manual',
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, medicine_id, batch_no)
);
CREATE INDEX stock_medicine_ix ON pharmacy.stock_item (medicine_id, pharmacy_id) WHERE quantity > 0;
CREATE INDEX stock_expiry_ix   ON pharmacy.stock_item (pharmacy_id, expiry_date) WHERE quantity > 0;
CREATE TRIGGER stock_updated BEFORE UPDATE ON pharmacy.stock_item
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- ---------- Dispensing (append-only) ----------
CREATE TABLE pharmacy.dispensing (
  id                       uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  prescription_item_id     uuid NOT NULL REFERENCES pharmacy.prescription_item(id),
  pharmacy_id              uuid NOT NULL REFERENCES org.pharmacy(id),
  pharmacist_user_id       uuid NOT NULL REFERENCES identity.app_user(id),
  outcome                  pharmacy.dispense_outcome NOT NULL,
  quantity                 numeric(10,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  stock_item_id            uuid REFERENCES pharmacy.stock_item(id),
  substitute_medicine_id   uuid REFERENCES pharmacy.medicine(id),
  note_to_doctor           text,
  dispensed_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (outcome = 'out_of_stock' OR (quantity > 0 AND stock_item_id IS NOT NULL)),
  CHECK (outcome <> 'substitute' OR substitute_medicine_id IS NOT NULL)
);
CREATE INDEX dispensing_item_ix ON pharmacy.dispensing (prescription_item_id);
CREATE INDEX dispensing_pharmacy_ix ON pharmacy.dispensing (pharmacy_id, dispensed_at DESC);
CREATE TRIGGER dispensing_immutable BEFORE UPDATE OR DELETE ON pharmacy.dispensing
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Checks + stock reduction + prescription status, in one transaction.
CREATE OR REPLACE FUNCTION pharmacy.apply_dispensing() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rx pharmacy.prescription;
  item pharmacy.prescription_item;
  s pharmacy.stock_item;
  total_items int; done_items int;
BEGIN
  SELECT * INTO item FROM pharmacy.prescription_item WHERE id = NEW.prescription_item_id;
  SELECT * INTO rx FROM pharmacy.prescription WHERE id = item.prescription_id FOR UPDATE;

  IF rx.status IN ('dispensed','expired','cancelled') OR rx.valid_until < now() THEN
    RAISE EXCEPTION 'CF051: prescription is % / expired', rx.status USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.pharmacist_profile
                 WHERE user_id = NEW.pharmacist_user_id AND pharmacy_id = NEW.pharmacy_id) THEN
    RAISE EXCEPTION 'CF052: pharmacist does not belong to this pharmacy' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.outcome IN ('dispensed','substitute') THEN
    SELECT * INTO s FROM pharmacy.stock_item WHERE id = NEW.stock_item_id FOR UPDATE;
    IF s.pharmacy_id <> NEW.pharmacy_id THEN
      RAISE EXCEPTION 'CF053: stock batch is from another pharmacy' USING ERRCODE = 'check_violation';
    END IF;
    IF s.medicine_id <> COALESCE(NEW.substitute_medicine_id, item.medicine_id) THEN
      RAISE EXCEPTION 'CF054: stock batch is a different medicine' USING ERRCODE = 'check_violation';
    END IF;
    IF s.expiry_date < current_date THEN
      RAISE EXCEPTION 'CF055: batch % is expired', s.batch_no USING ERRCODE = 'check_violation';
    END IF;
    IF s.quantity < NEW.quantity THEN
      RAISE EXCEPTION 'CF056: not enough stock (% left)', s.quantity USING ERRCODE = 'check_violation';
    END IF;
    UPDATE pharmacy.stock_item SET quantity = quantity - NEW.quantity WHERE id = s.id;
  END IF;

  SELECT count(*) INTO total_items FROM pharmacy.prescription_item WHERE prescription_id = rx.id;
  SELECT count(DISTINCT d.prescription_item_id) INTO done_items
    FROM pharmacy.dispensing d JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
   WHERE i.prescription_id = rx.id AND d.outcome IN ('dispensed','substitute');
  IF NEW.outcome IN ('dispensed','substitute') AND NOT EXISTS (
       SELECT 1 FROM pharmacy.dispensing d WHERE d.prescription_item_id = NEW.prescription_item_id
         AND d.outcome IN ('dispensed','substitute')) THEN
    done_items := done_items + 1;   -- this row is not visible yet (BEFORE trigger)
  END IF;
  UPDATE pharmacy.prescription
     SET status = CASE WHEN done_items >= total_items THEN 'dispensed'::pharmacy.rx_status
                       WHEN done_items > 0 THEN 'partly_dispensed'::pharmacy.rx_status
                       ELSE status END,
         updated_at = now()
   WHERE id = rx.id;
  RETURN NEW;
END $$;
CREATE TRIGGER dispensing_apply BEFORE INSERT ON pharmacy.dispensing
  FOR EACH ROW EXECUTE FUNCTION pharmacy.apply_dispensing();

-- ---------- Controlled-drug register (Schedule H / H1 / X) ----------
-- ⚠ Exact fields to match the Drugs and Cosmetics Rules before go-live.
CREATE TABLE pharmacy.controlled_drug_register (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  dispensing_id      uuid NOT NULL UNIQUE REFERENCES pharmacy.dispensing(id),
  pharmacy_id        uuid NOT NULL REFERENCES org.pharmacy(id),
  schedule           pharmacy.schedule NOT NULL CHECK (schedule <> 'none'),
  patient_name       text NOT NULL,
  patient_address    text NOT NULL,
  doctor_name        text NOT NULL,
  doctor_reg_no      text NOT NULL,
  medicine_name      text NOT NULL,
  quantity           numeric(10,2) NOT NULL,
  entry_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cdr_pharmacy_ix ON pharmacy.controlled_drug_register (pharmacy_id, entry_at DESC);
CREATE TRIGGER cdr_immutable BEFORE UPDATE OR DELETE ON pharmacy.controlled_drug_register
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Pharmacy software link (automatic stock sync) ----------
CREATE TABLE pharmacy.software_link (
  pharmacy_id      uuid PRIMARY KEY REFERENCES org.pharmacy(id),
  vendor           text NOT NULL,
  api_client_id    text NOT NULL,
  secret_ref       text NOT NULL,                     -- reference into the secrets manager, never the secret
  last_sync_at     timestamptz,
  last_sync_status text
);

-- =====================================================================
-- 129_catalogue_hpr_posting.sql : follow-ups of the design seed (files 10_ .. 80_)
--   1. special-category type 'diabetes' (the chronic-illness card of the citizen design)
--   2. lab catalogue additions NEUT / UCULT / ABG (seed 30_ inserts them too, with ON CONFLICT DO NOTHING)
--   3. event_type_ref.default_href are now app ROUTE PATHS (the old values were guesses such as /doctor/queue)
--   4. canonical HPR id enforced as a CHECK on identity.doctor_profile (DEMO-HPR-71-NNNN)
--   5. visiting postings: a doctor with a row in identity.doctor_posting_history that covers the time of a
--      break-glass session is "of" that hospital for the hospital review (view + access.hospital_review)
--   6. audit.log and audit.log_scoped run as their owner (cf_app can only INSERT through the function, not into the table)
--   7. engage.booking_ref_seq moves past the seeded booking refs (DEMO-APT-58190 .. 59014)
--   8. dispensing: an item is "done" when the dispensed quantity reaches the prescribed quantity, so a partial dispense
--      leaves the prescription 'partly_dispensed' and can be topped up later
-- Idempotent where it is cheap (ON CONFLICT / IF NOT EXISTS). Never edits an applied migration.
-- =====================================================================

-- ---------- 1. special category type ----------
INSERT INTO identity.special_category_type (code, name) VALUES
  ('diabetes', 'Diabetes (chronic illness card)')
ON CONFLICT (code) DO NOTHING;

-- ---------- 2. lab catalogue additions ----------
INSERT INTO lab.test_catalogue
  (code, loinc, name, category, specimen_type, tube_type, unit, ref_low, ref_high, critical_low, critical_high, ref_text, tat_target_minutes, fasting_required) VALUES
  ('NEUT',  NULL, 'Neutrophils',        'haematology',  'whole blood',    'EDTA (lavender)',     '%',  40.0, 75.0, NULL, NULL, NULL, 60,   false),
  ('UCULT', NULL, 'Urine culture',      'microbiology', 'urine',          'Sterile container',   NULL, NULL, NULL, NULL, NULL, 'No growth', 4320, false),
  ('ABG',   NULL, 'Arterial blood gas', 'blood gas',    'arterial blood', 'Heparinised syringe', NULL, NULL, NULL, NULL, NULL, 'See components', 30, false)
ON CONFLICT (code) DO NOTHING;
INSERT INTO lab.panel_test (panel_code, test_code, sort_order) VALUES ('CBC', 'NEUT', 6) ON CONFLICT DO NOTHING;

-- ---------- 3. default event links are route paths ----------
UPDATE engage.event_type_ref t SET default_href = v.href
FROM (VALUES
  ('booking',          '/doctor?section=schedule'),
  ('prescription',     '/pharmacist?section=queue'),
  ('lab-order',        '/lab-tech?section=home'),
  ('imaging-order',    '/radiology-tech?section=worklist'),
  ('lab-result',       '/doctor?section=orders'),
  ('imaging-result',   '/doctor?section=orders'),
  ('break-glass',      '/hospital-admin?section=breakglass'),
  ('alert',            '/citizen/alerts'),
  ('vitals-critical',  '/doctor?section=session'),
  ('vitals',           '/doctor?section=session'),
  ('dispensed',        '/citizen/medicines'),
  ('collected',        '/citizen/medicines'),
  ('complaint',        '/hospital-admin?section=complaints'),
  ('complaint-update', '/citizen/complaints'),
  ('blood-request',    '/citizen/blood'),
  ('blood-response',   '/doctor?section=donors'),
  ('message',          '/citizen/messages'),
  ('referral',         '/doctor?section=referral'),
  ('handover',         '/doctor?section=referral'),
  ('session-ended',    '/doctor?section=session'),
  ('ai-chat-shared',   '/doctor?section=session'),
  ('review',           '/hospital-admin?section=reviews')
) AS v(code, href)
WHERE t.code = v.code;

-- ---------- 4. canonical HPR id ----------
-- NOT VALID first (never blocks the migration on an old dev database), then VALIDATE when every row passes.
-- seed/demo_data.sql (generate.py) now writes DEMO-HPR-71-NNNN as well, so a fresh database validates.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doctor_hpr_canonical'
                  AND conrelid = 'identity.doctor_profile'::regclass) THEN
    ALTER TABLE identity.doctor_profile
      ADD CONSTRAINT doctor_hpr_canonical CHECK (identity.is_canonical_hpr_id(hpr_id)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.doctor_profile WHERE NOT identity.is_canonical_hpr_id(hpr_id)) THEN
    ALTER TABLE identity.doctor_profile VALIDATE CONSTRAINT doctor_hpr_canonical;
  ELSE
    RAISE NOTICE 'doctor_hpr_canonical left NOT VALID: some old doctor rows have a non-canonical HPR id (new rows are checked).';
  END IF;
END $$;

-- ---------- 5. visiting postings in the break-glass review ----------
-- Does this doctor work at this hospital at this moment? Base posting (doctor_profile) or a visiting posting.
CREATE OR REPLACE FUNCTION access.doctor_serves_hospital(p_doctor uuid, p_hospital uuid, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p_hospital IS NOT NULL AND (
    EXISTS (SELECT 1 FROM identity.doctor_profile dp WHERE dp.user_id = p_doctor AND dp.hospital_id = p_hospital)
    OR EXISTS (SELECT 1 FROM identity.doctor_posting_history ph
                WHERE ph.user_id = p_doctor AND ph.hospital_id = p_hospital AND ph.valid @> p_at))
$$;
GRANT EXECUTE ON FUNCTION access.doctor_serves_hospital(uuid, uuid, timestamptz) TO cf_app;

-- Same columns and meaning as in 127; only the doctor-to-hospital test changed. hospital_id is the admin's own hospital.
CREATE OR REPLACE VIEW access.v_break_glass_review WITH (security_barrier) AS
SELECT e.session_id, s.started_at, s.ended_at,
       round(extract(epoch FROM (coalesce(s.ended_at, least(s.expires_at, now())) - s.started_at)) / 60)::int AS minutes_open,
       util.ctx_hospital_id() AS hospital_id, u.id AS doctor_user_id, dper.full_name AS doctor_name,
       CASE WHEN pat.is_unidentified THEN pat.temp_label ELSE pat.full_name END AS patient_label,
       e.reason_category, e.break_glass_reason, e.evidence_note, e.match_method,
       e.second_doctor_user_id, e.hospital_review_status, e.hospital_due_at, e.hospital_reviewed_at,
       e.district_review_status, e.central_verify_status,
       (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('kind', iv.item_kind, 'label', iv.label)), '[]'::jsonb)
          FROM access.item_view iv WHERE iv.session_id = s.id) AS viewed
FROM access.emergency_access e
JOIN access.access_session s ON s.id = e.session_id AND s.mode = 'break_glass'
JOIN identity.app_user u ON u.id = s.user_id
JOIN identity.person dper ON dper.id = u.person_id
JOIN identity.person pat ON pat.id = s.patient_person_id
WHERE util.ctx_account_type() = 'hospital_admin'
  AND access.doctor_serves_hospital(u.id, util.ctx_hospital_id(), s.started_at);

CREATE OR REPLACE FUNCTION access.hospital_review(p_session uuid, p_outcome access.review_status, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE doc uuid; started timestamptz; cur access.review_status;
BEGIN
  IF util.ctx_account_type() <> 'hospital_admin' THEN
    RAISE EXCEPTION 'CF160: only the hospital admin can review' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_outcome = 'pending' THEN
    RAISE EXCEPTION 'CF160: choose justified (ok) or not justified (misuse)' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.user_id, s.started_at, e.hospital_review_status INTO doc, started, cur
    FROM access.emergency_access e JOIN access.access_session s ON s.id = e.session_id
    WHERE e.session_id = p_session;
  IF NOT access.doctor_serves_hospital(doc, util.ctx_hospital_id(), started) THEN
    RAISE EXCEPTION 'CF160: this emergency access is not in your hospital' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF cur <> 'pending' THEN
    RAISE EXCEPTION 'CF160: already reviewed' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE access.emergency_access
     SET hospital_review_status = p_outcome, hospital_reviewer_id = util.ctx_user_id(),
         hospital_reviewed_at = now(), hospital_review_note = p_note
   WHERE session_id = p_session;
  PERFORM audit.log('breakglass.hospital_review', 'access_session', p_session, NULL, p_session,
                    jsonb_build_object('outcome', p_outcome));
END $$;

-- ---------- 6. audit functions run as owner ----------
-- Both write one row into the hash chain (the chain trigger needs the table owner's rights). The request context
-- (app.user_id ...) is still read from the session settings, so the actor recorded is the caller.
ALTER FUNCTION audit.log(text, text, uuid, uuid, uuid, jsonb, smallint, inet, text, geometry, uuid)
  SECURITY DEFINER SET search_path = pg_catalog, public;
ALTER FUNCTION audit.log_scoped(text, uuid, uuid, uuid, text, uuid, uuid, uuid, jsonb, smallint)
  SECURITY DEFINER SET search_path = pg_catalog, public;
GRANT EXECUTE ON FUNCTION audit.log(text, text, uuid, uuid, uuid, jsonb, smallint, inet, text, geometry, uuid) TO cf_app;
GRANT EXECUTE ON FUNCTION audit.log_scoped(text, uuid, uuid, uuid, text, uuid, uuid, uuid, jsonb, smallint) TO cf_app;

-- ---------- 7. booking reference sequence ----------
-- The design seed uses DEMO-APT-58190 .. 58213 and 59001 .. 59014. New bookings continue after the highest one (floor 59100).
SELECT setval('engage.booking_ref_seq',
  GREATEST((SELECT last_value FROM engage.booking_ref_seq),
           (SELECT coalesce(max(substring(booking_ref FROM '[0-9]+$')::bigint), 0) FROM engage.appointment WHERE booking_ref ~ '^DEMO-APT-[0-9]+$'),
           59100));

-- ---------- 8. dispensing: quantity-aware item completion ----------
-- Same as 124 except the "done items" count: an item is done when the quantity given (dispensed + substitute rows,
-- including this one) reaches the prescribed quantity. Before, one row of any size closed the item.
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
  -- items whose given quantity (earlier rows + this row, which is not visible yet in a BEFORE trigger) reaches the prescribed quantity
  SELECT count(*) INTO done_items
    FROM pharmacy.prescription_item i
   WHERE i.prescription_id = rx.id
     AND coalesce((SELECT sum(d.quantity) FROM pharmacy.dispensing d
                    WHERE d.prescription_item_id = i.id AND d.outcome IN ('dispensed','substitute')), 0)
         + CASE WHEN i.id = NEW.prescription_item_id AND NEW.outcome IN ('dispensed','substitute') THEN NEW.quantity ELSE 0 END
         >= i.quantity;
  UPDATE pharmacy.prescription
     SET status = CASE WHEN done_items >= total_items THEN 'dispensed'::pharmacy.rx_status
                       WHEN done_items > 0 OR EXISTS (SELECT 1 FROM pharmacy.dispensing d JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
                                                       WHERE i.prescription_id = rx.id AND d.outcome IN ('dispensed','substitute'))
                                          OR NEW.outcome IN ('dispensed','substitute')
                            THEN 'partly_dispensed'::pharmacy.rx_status
                       ELSE status END,
         updated_at = now()
   WHERE id = rx.id;
  RETURN NEW;
END $$;

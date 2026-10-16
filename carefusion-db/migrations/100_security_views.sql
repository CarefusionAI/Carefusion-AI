-- =====================================================================
-- 100_security_views.sql : cross-schema foreign keys, row-level security,
--   privileged helper functions, views for each user type, grants
-- =====================================================================

-- ---------- Foreign keys that point "forward" across files ----------
ALTER TABLE geo.state               ADD FOREIGN KEY (zone_changed_by) REFERENCES identity.app_user(id);
ALTER TABLE org.hospital            ADD FOREIGN KEY (approved_by) REFERENCES identity.app_user(id);
ALTER TABLE org.pharmacy            ADD FOREIGN KEY (approved_by) REFERENCES identity.app_user(id);
ALTER TABLE org.bed_availability    ADD FOREIGN KEY (updated_by)  REFERENCES identity.app_user(id);
ALTER TABLE identity.doctor_profile ADD FOREIGN KEY (employee_proof_doc_id) REFERENCES records.document(id);
ALTER TABLE admin.death_record      ADD FOREIGN KEY (certificate_doc_id) REFERENCES records.document(id);
ALTER TABLE records.medication_current ADD FOREIGN KEY (medicine_id) REFERENCES pharmacy.medicine(id);
ALTER TABLE identity.hospital_admin_profile
  ADD FOREIGN KEY (photo_id_doc_id)      REFERENCES records.document(id),
  ADD FOREIGN KEY (authorisation_doc_id) REFERENCES records.document(id),
  ADD FOREIGN KEY (licence_doc_id)       REFERENCES records.document(id),
  ADD FOREIGN KEY (employee_id_doc_id)   REFERENCES records.document(id);

-- =====================================================================
-- Access rules used by row-level security (SECURITY DEFINER = can look
-- at session tables without opening them to the app role)
-- =====================================================================

-- Can the current request READ this patient's full record?
CREATE OR REPLACE FUNCTION util.can_read_patient(p_patient uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT
    -- the patient themself
    p_patient = util.ctx_person_id() AND util.ctx_account_type() = 'citizen'
    -- guardian of a minor (before handover)
    OR (util.ctx_account_type() = 'citizen' AND EXISTS (
          SELECT 1 FROM identity.citizen_profile c
          WHERE c.person_id = p_patient AND c.guardian_person_id = util.ctx_person_id()
            AND c.handed_over_at IS NULL))
    -- doctor / nurse with a live session (key, card, admission, emergency)
    OR EXISTS (
          SELECT 1 FROM access.access_session s
          WHERE s.patient_person_id = p_patient AND s.user_id = util.ctx_user_id()
            AND s.ended_at IS NULL AND s.expires_at > now())
$$;

-- Can the current request ADD to this patient's record?
CREATE OR REPLACE FUNCTION util.can_write_patient(p_patient uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT util.can_read_patient(p_patient)
    -- lab / radiology / nurse: only for patients with an open order in their hospital + department
    OR (util.ctx_account_type() = 'staff' AND EXISTS (
          SELECT 1 FROM records.clinical_order o
          JOIN identity.staff_profile sp ON sp.user_id = util.ctx_user_id()
          WHERE o.patient_person_id = p_patient AND o.status IN ('open','in_progress')
            AND o.hospital_id = sp.hospital_id
            AND (o.department_id IS NULL OR sp.department_id IS NULL OR o.department_id = sp.department_id)))
$$;

-- Chain trigger runs with owner rights so the app never needs rights on chain_tip.
ALTER FUNCTION audit.chain_row() SECURITY DEFINER SET search_path = pg_catalog, public;

-- =====================================================================
-- Row-level security on patient data (second lock behind the API)
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'records.folder','records.document','records.allergy','records.condition',
    'records.medication_current','records.immunization','records.procedure_stay',
    'records.family_history','records.lifestyle','records.vital_observation',
    'records.dated_event','records.clinical_order','records.referral',
    'pharmacy.prescription'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY patient_read ON %s FOR SELECT TO cf_app, cf_ai
                    USING (util.can_read_patient(patient_person_id))', t);
    EXECUTE format('CREATE POLICY patient_insert ON %s FOR INSERT TO cf_app, cf_ai
                    WITH CHECK (util.can_write_patient(patient_person_id))', t);
    EXECUTE format('CREATE POLICY patient_update ON %s FOR UPDATE TO cf_app
                    USING (util.can_write_patient(patient_person_id))', t);
  END LOOP;
END $$;

-- Doctors keep seeing what they themselves added after the session ends ("past patients").
CREATE POLICY own_additions ON records.document FOR SELECT TO cf_app
  USING (created_by_user_id = util.ctx_user_id());
-- Staff see their orders queue (patient name only via API) and complete orders.
CREATE POLICY staff_queue ON records.clinical_order FOR SELECT TO cf_app
  USING (util.ctx_account_type() = 'staff' AND hospital_id =
         (SELECT hospital_id FROM identity.staff_profile WHERE user_id = util.ctx_user_id()));
CREATE POLICY staff_complete ON records.clinical_order FOR UPDATE TO cf_app
  USING (util.ctx_account_type() = 'staff' AND hospital_id =
         (SELECT hospital_id FROM identity.staff_profile WHERE user_id = util.ctx_user_id()));
-- Referral receivers see referrals sent to them (full record still needs the key).
CREATE POLICY referral_receiver ON records.referral FOR SELECT TO cf_app
  USING (to_user_id = util.ctx_user_id());
-- Prescription writer always sees own prescriptions.
CREATE POLICY rx_writer ON pharmacy.prescription FOR SELECT TO cf_app
  USING (doctor_user_id = util.ctx_user_id());
-- Pharmacists see prescriptions delivered to their pharmacy.
CREATE POLICY rx_pharmacy ON pharmacy.prescription FOR SELECT TO cf_app
  USING (util.ctx_account_type() = 'pharmacist' AND EXISTS (
         SELECT 1 FROM pharmacy.prescription_delivery d
         JOIN identity.pharmacist_profile pp ON pp.pharmacy_id = d.pharmacy_id
         WHERE d.prescription_id = prescription.id AND pp.user_id = util.ctx_user_id()));
CREATE POLICY rx_pharmacy_update ON pharmacy.prescription FOR UPDATE TO cf_app
  USING (util.ctx_account_type() = 'pharmacist');

-- ---------- AI results: patient sees a run only after the doctor's review ----------
ALTER TABLE ai.ai_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_read ON ai.ai_run FOR SELECT TO cf_app, cf_ai
  USING (util.can_read_patient(patient_person_id) AND (
           util.ctx_account_type() <> 'citizen'
           OR tool = 'citizen_guidance_chat'
           OR EXISTS (SELECT 1 FROM ai.ai_review rv WHERE rv.run_id = ai_run.id)));
CREATE POLICY ai_own_runs ON ai.ai_run FOR SELECT TO cf_app, cf_ai
  USING (run_by_user_id = util.ctx_user_id());
CREATE POLICY ai_insert ON ai.ai_run FOR INSERT TO cf_app, cf_ai
  WITH CHECK (util.can_write_patient(patient_person_id) OR
              (tool = 'citizen_guidance_chat' AND patient_person_id = util.ctx_person_id()));

-- ---------- Pharmacist QR scan: look up by token, record the delivery ----------
CREATE OR REPLACE FUNCTION pharmacy.receive_by_qr(p_token text, p_pharmacy uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE rx_id uuid;
BEGIN
  IF util.ctx_account_type() <> 'pharmacist' OR NOT EXISTS (
       SELECT 1 FROM identity.pharmacist_profile WHERE user_id = util.ctx_user_id() AND pharmacy_id = p_pharmacy) THEN
    RAISE EXCEPTION 'CF080: only a pharmacist of this pharmacy can scan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT id INTO rx_id FROM pharmacy.prescription
   WHERE qr_token = p_token AND status IN ('issued','partly_dispensed') AND valid_until > now();
  IF rx_id IS NULL THEN
    RAISE EXCEPTION 'CF081: prescription not found, already dispensed or expired' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO pharmacy.prescription_delivery (prescription_id, pharmacy_id, sent_by, received_at)
  VALUES (rx_id, p_pharmacy, 'patient', now());
  PERFORM audit.log('rx.scan', 'prescription', rx_id, NULL, NULL, jsonb_build_object('pharmacy', p_pharmacy));
  RETURN rx_id;
END $$;

-- =====================================================================
-- Views for each user type
-- =====================================================================

-- Citizen: who opened my record (no GPS / IP / device).
CREATE VIEW access.v_access_history WITH (security_barrier) AS
SELECT s.patient_person_id, s.id AS session_id, s.mode, s.started_at, s.ended_at, s.ended_by,
       p.full_name AS opened_by, u.account_type, h.name AS hospital
FROM access.access_session s
JOIN identity.app_user u ON u.id = s.user_id
JOIN identity.person p   ON p.id = u.person_id
LEFT JOIN identity.doctor_profile dp ON dp.user_id = u.id
LEFT JOIN identity.staff_profile sp  ON sp.user_id = u.id
LEFT JOIN org.hospital h ON h.id = COALESCE(dp.hospital_id, sp.hospital_id)
WHERE s.patient_person_id = util.ctx_person_id();

-- Any doctor in an emergency: basic info without a key (every read logged by the API).
CREATE VIEW access.v_emergency_basic WITH (security_barrier) AS
SELECT p.id AS person_id, p.full_name, p.date_of_birth, p.sex, c.blood_group, c.organ_donor_status,
       (SELECT coalesce(jsonb_agg(jsonb_build_object('substance', a.substance, 'severity', a.severity)), '[]')
          FROM records.allergy a
         WHERE a.patient_person_id = p.id AND a.superseded_by IS NULL AND a.status = 'active') AS allergies,
       (SELECT coalesce(jsonb_agg(jsonb_build_object('contact_person_id', e.contact_person_id,
                                                     'name', cp.full_name, 'relation', e.relation)
                                  ORDER BY e.priority), '[]')
          FROM identity.emergency_contact e JOIN identity.person cp ON cp.id = e.contact_person_id
         WHERE e.citizen_person_id = p.id AND e.removed_at IS NULL) AS emergency_contacts
FROM identity.person p
JOIN identity.citizen_profile c ON c.person_id = p.id
WHERE util.ctx_account_type() = 'doctor';

-- Stock finder (citizens and doctors): in / low / out per pharmacy + medicine.
CREATE VIEW pharmacy.v_stock_status AS
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
GROUP BY s.pharmacy_id, ph.name, ph.location, ph.opening_hours, ph.pharmacy_type,
         s.medicine_id, m.generic_name, m.form, m.strength, m.schedule;

-- Nearest pharmacies with a medicine: SELECT * FROM pharmacy.find_medicine(:med, :lon, :lat, 10000);
CREATE OR REPLACE FUNCTION pharmacy.find_medicine(p_medicine uuid, p_lon float8, p_lat float8, p_radius_m int DEFAULT 10000)
RETURNS TABLE (pharmacy_id uuid, pharmacy_name text, stock_level text, min_price numeric, distance_m int, opening_hours jsonb)
LANGUAGE sql STABLE AS $$
  SELECT v.pharmacy_id, v.pharmacy_name, v.stock_level, v.min_price,
         ST_Distance(v.location::geography, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography)::int,
         v.opening_hours
  FROM pharmacy.v_stock_status v
  WHERE v.medicine_id = p_medicine
    AND ST_DWithin(v.location::geography, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography, p_radius_m)
  ORDER BY (v.stock_level = 'out'), 5
$$;

-- Pharmacy admin: items expiring in 60 days.
CREATE VIEW pharmacy.v_near_expiry AS
SELECT s.pharmacy_id, s.medicine_id, m.generic_name, s.batch_no, s.expiry_date, s.quantity
FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
WHERE s.quantity > 0 AND s.expiry_date <= current_date + 60;

-- Is a doctor inside their hospital geofence?
CREATE OR REPLACE FUNCTION access.inside_geofence(p_doctor uuid, p_lon float8, p_lat float8)
RETURNS TABLE (inside boolean, distance_m int)
LANGUAGE sql STABLE AS $$
  SELECT ST_Contains(h.geofence, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)),
         ST_Distance(h.geofence::geography, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography)::int
  FROM identity.doctor_profile d JOIN org.hospital h ON h.id = d.hospital_id
  WHERE d.user_id = p_doctor
$$;

-- Matching blood donors near a hospital (approximate area only).
CREATE OR REPLACE FUNCTION donation.matching_donors(p_request uuid, p_radius_m int DEFAULT 20000)
RETURNS TABLE (donor_person_id uuid, approx_distance_km int)
LANGUAGE sql STABLE AS $$
  SELECT c.person_id,
         round(ST_Distance(c.approx_location::geography, h.location::geography) / 1000)::int
  FROM donation.blood_request r
  JOIN org.hospital h ON h.id = r.hospital_id
  JOIN identity.citizen_profile c ON c.blood_group = r.blood_group
  JOIN donation.blood_donor d ON d.person_id = c.person_id AND d.ready
  JOIN identity.person p ON p.id = c.person_id AND p.deceased_at IS NULL
  WHERE r.id = p_request AND r.status = 'open'
    AND ST_DWithin(c.approx_location::geography, h.location::geography, p_radius_m)
$$;

-- Public rating summary (published ratings only).
CREATE VIEW engage.v_rating_summary AS
SELECT target_type, target_id, count(*) AS ratings, round(avg(stars), 2) AS avg_stars
FROM engage.rating WHERE moderation_status = 'published'
GROUP BY target_type, target_id;

-- Health alerts a user should receive (emergency alerts ignore mutes).
CREATE VIEW engage.v_alert_recipients_rule AS
SELECT a.id AS alert_id, u.id AS user_id
FROM engage.health_alert a
JOIN identity.app_user u ON u.status = 'active' AND u.account_type = 'citizen'
JOIN identity.citizen_profile c ON c.person_id = u.person_id
LEFT JOIN geo.district d ON d.id = c.district_id
WHERE (a.scope = 'national' OR (a.scope = 'state' AND d.state_id = a.state_id)
       OR (a.scope = 'district' AND c.district_id = a.district_id))
  AND (a.severity = 'emergency' OR NOT EXISTS (
        SELECT 1 FROM engage.alert_mute m WHERE m.user_id = u.id AND m.category = a.category));

-- Admin inboxes: overdue approvals to escalate.
CREATE VIEW admin.v_overdue_approvals AS
SELECT * FROM admin.approval_request WHERE status = 'pending' AND due_at < now();

-- =====================================================================
-- De-identified reporting views (dashboards) — no names, no ids of people
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS report;

CREATE VIEW report.v_district_daily_sessions AS
SELECT h.district_id, date_trunc('day', s.started_at)::date AS day, s.mode, count(*) AS sessions
FROM access.access_session s
JOIN identity.doctor_profile dp ON dp.user_id = s.user_id
JOIN org.hospital h ON h.id = dp.hospital_id
GROUP BY 1, 2, 3;

CREATE VIEW report.v_district_shortages AS
SELECT ph.district_id, v.medicine_id, v.generic_name,
       count(*) FILTER (WHERE v.stock_level = 'out') AS pharmacies_out,
       count(*) FILTER (WHERE v.stock_level = 'low') AS pharmacies_low,
       count(*) AS pharmacies_total
FROM pharmacy.v_stock_status v JOIN org.pharmacy ph ON ph.id = v.pharmacy_id
GROUP BY 1, 2, 3;

CREATE VIEW report.v_district_beds AS
SELECT h.district_id, b.bed_type, sum(b.total) AS total, sum(b.free) AS free
FROM org.bed_availability b JOIN org.hospital h ON h.id = b.hospital_id AND h.status = 'active'
GROUP BY 1, 2;

CREATE VIEW report.v_emergency_access_by_district AS
SELECT h.district_id, date_trunc('week', s.started_at)::date AS week, s.mode,
       count(*) AS events, count(*) FILTER (WHERE e.district_review_status = 'misuse') AS misuse
FROM access.access_session s
JOIN access.emergency_access e ON e.session_id = s.id
JOIN identity.doctor_profile dp ON dp.user_id = s.user_id
JOIN org.hospital h ON h.id = dp.hospital_id
GROUP BY 1, 2, 3;

-- =====================================================================
-- Grants
-- =====================================================================
GRANT USAGE ON SCHEMA geo, org, identity, admin, access, records, ai, pharmacy, donation, engage, audit
  TO cf_app, cf_ai;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA geo, org, identity, admin, access, records, pharmacy, donation, engage
  TO cf_app;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA ai TO cf_app, cf_ai;
GRANT SELECT ON ALL TABLES IN SCHEMA records, identity, org, geo TO cf_ai;
GRANT INSERT ON audit.activity_log TO cf_app, cf_ai;
GRANT SELECT ON audit.log_view_grant TO cf_app;
GRANT INSERT, UPDATE ON audit.log_view_grant TO cf_app;
GRANT USAGE ON SEQUENCE audit.activity_seq TO cf_app, cf_ai;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA access, records, ai, pharmacy, donation, engage, audit, admin TO cf_app;
GRANT EXECUTE ON FUNCTION audit.log TO cf_ai;
-- No DELETE or TRUNCATE for any app role, anywhere.
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA geo, org, identity, admin, access, records, ai, pharmacy, donation, engage, audit
  FROM cf_app, cf_ai, cf_report, cf_auditor;

GRANT USAGE ON SCHEMA report TO cf_report;
GRANT SELECT ON ALL TABLES IN SCHEMA report TO cf_report;

GRANT USAGE ON SCHEMA audit TO cf_auditor;
GRANT SELECT ON audit.activity_log, audit.chain_head, audit.chain_tip TO cf_auditor;
GRANT EXECUTE ON FUNCTION audit.verify_chain TO cf_auditor;

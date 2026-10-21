-- =====================================================================
-- tests/test_rules.sql : proves the database rules hold.
-- Runs inside one transaction and ROLLS BACK — leaves no data behind.
-- Usage: psql "<conn>" -v ON_ERROR_STOP=1 -f tests/test_rules.sql
-- =====================================================================
BEGIN;
SET client_min_messages = notice;

CREATE TEMP TABLE t_result (name text, passed boolean, detail text);
GRANT INSERT, SELECT ON t_result TO cf_app;
\o /dev/null

-- Run SQL that MUST fail with a given CareFusion code (or SQLSTATE).
CREATE FUNCTION pg_temp.expect_fail(p_name text, p_sql text, p_code text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  INSERT INTO t_result VALUES (p_name, false, 'no error raised');
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE p_code || '%' OR SQLSTATE = p_code THEN
    INSERT INTO t_result VALUES (p_name, true, SQLERRM);
  ELSE
    INSERT INTO t_result VALUES (p_name, false, SQLSTATE || ' ' || SQLERRM);
  END IF;
END $$;

CREATE FUNCTION pg_temp.check(p_name text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$ INSERT INTO t_result VALUES (p_name, coalesce(p_ok, false), p_detail) $$;

-- ---------------- Fixture (synthetic) ----------------
CREATE TEMP TABLE fx (k text PRIMARY KEY, v uuid);
GRANT SELECT ON fx TO cf_app;
DO $$
DECLARE
  d uuid; h uuid; ph uuid; m uuid; st uuid;
  doc_p uuid; doc_cit uuid; doc_u uuid;
  pat_p uuid; pat_u uuid;
  staff_p uuid; staff_u uuid;
  phar_p uuid; phar_u uuid;
  dadm_p uuid; dadm_u uuid;
BEGIN
  SELECT id INTO d FROM geo.district WHERE name = 'Kollam';
  INSERT INTO org.hospital (hfr_id, name, ownership, hospital_type, district_id, address, location, geofence, licence_no, status)
  VALUES ('DEMO-HFR-0001', 'Demo District Hospital', 'govt', 'DH', d, 'Demo Road, Kollam',
          ST_SetSRID(ST_MakePoint(76.60, 8.88), 4326),
          ST_Buffer(ST_SetSRID(ST_MakePoint(76.60, 8.88), 4326)::geography, 300)::geometry,
          'DEMO-LIC-1', 'active') RETURNING id INTO h;
  INSERT INTO org.pharmacy (licence_no, name, pharmacy_type, linked_hospital_id, district_id, address, location, status)
  VALUES ('DEMO-DL-0001', 'Demo Hospital Pharmacy', 'govt_hospital', h, d, 'Same campus',
          ST_SetSRID(ST_MakePoint(76.601, 8.881), 4326), 'active') RETURNING id INTO ph;

  INSERT INTO identity.person (full_name, date_of_birth, sex, abha_number, kyc_status, face_check_status, aadhaar_token)
  VALUES ('Dr Demo Doctor', '1985-01-01', 'female', 'DEMO-ABHA-0001', 'passed', 'passed', 'DEMO-TOKEN-0001') RETURNING id INTO doc_p;
  INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status) VALUES (doc_p, 'citizen', 'kc-doc-cit', 'active') RETURNING id INTO doc_cit;
  INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status) VALUES (doc_p, 'doctor', 'kc-doc', 'active') RETURNING id INTO doc_u;
  INSERT INTO identity.doctor_profile (user_id, hpr_id, council_name, council_reg_no, hospital_id, employment_type)
  VALUES (doc_u, 'DEMO-HPR-0001', 'Travancore-Cochin Medical Council', 'DEMO-REG-1', h, 'govt');

  INSERT INTO identity.person (full_name, date_of_birth, sex, abha_number, kyc_status, face_check_status, aadhaar_token)
  VALUES ('Demo Patient', '1970-05-05', 'male', 'DEMO-ABHA-0002', 'passed', 'passed', 'DEMO-TOKEN-0002') RETURNING id INTO pat_p;
  INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status) VALUES (pat_p, 'citizen', 'kc-pat', 'active') RETURNING id INTO pat_u;
  INSERT INTO identity.citizen_profile (person_id, district_id, blood_group, approx_location)
  VALUES (pat_p, d, 'O+', ST_SetSRID(ST_MakePoint(76.62, 8.90), 4326));
  PERFORM records.create_system_folders(pat_p, pat_u);

  INSERT INTO identity.person (full_name, date_of_birth, sex) VALUES ('Demo Nurse', '1990-02-02', 'female') RETURNING id INTO staff_p;
  INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status) VALUES (staff_p, 'staff', 'kc-staff', 'active') RETURNING id INTO staff_u;

  INSERT INTO identity.person (full_name, date_of_birth, sex) VALUES ('Demo Pharmacist', '1992-03-03', 'male') RETURNING id INTO phar_p;
  INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status) VALUES (phar_p, 'pharmacist', 'kc-phar', 'active') RETURNING id INTO phar_u;

  INSERT INTO identity.person (full_name, date_of_birth, sex) VALUES ('Demo District Admin', '1980-04-04', 'male') RETURNING id INTO dadm_p;
  INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status) VALUES (dadm_p, 'district_admin', 'kc-dadm', 'active') RETURNING id INTO dadm_u;
  INSERT INTO identity.staff_profile (user_id, hospital_id, staff_role, created_by_user_id) VALUES (staff_u, h, 'nurse', dadm_u);
  INSERT INTO identity.pharmacist_profile (user_id, pharmacy_id, registration_no, created_by_user_id) VALUES (phar_u, ph, 'DEMO-PH-1', dadm_u);

  INSERT INTO pharmacy.medicine (generic_name, form, strength) VALUES ('Paracetamol', 'tablet', '500 mg') RETURNING id INTO m;
  INSERT INTO pharmacy.stock_item (pharmacy_id, medicine_id, batch_no, expiry_date, quantity, unit_price)
  VALUES (ph, m, 'B1', current_date + 200, 30, 1.50) RETURNING id INTO st;

  INSERT INTO fx VALUES ('district', d), ('hospital', h), ('pharmacy', ph), ('medicine', m), ('stock', st),
    ('doc_p', doc_p), ('doc_u', doc_u), ('doc_cit', doc_cit), ('pat_p', pat_p), ('pat_u', pat_u),
    ('staff_u', staff_u), ('phar_u', phar_u), ('dadm_u', dadm_u);
END $$;

-- ---------------- 1. Identity ----------------
SELECT pg_temp.expect_fail('Raw 12-digit Aadhaar is refused',
  $q$INSERT INTO identity.person (full_name, date_of_birth, sex, aadhaar_token) VALUES ('X','1990-01-01','male','123412341234')$q$,
  '23514');
UPDATE identity.person SET identity_locked_at = now() WHERE id = (SELECT v FROM fx WHERE k='pat_p');
SELECT pg_temp.expect_fail('Locked name cannot change',
  format($q$UPDATE identity.person SET full_name = 'Changed' WHERE id = %L$q$, (SELECT v FROM fx WHERE k='pat_p')), 'CF010');
SELECT pg_temp.expect_fail('Accounts are never deleted',
  format($q$DELETE FROM identity.app_user WHERE id = %L$q$, (SELECT v FROM fx WHERE k='pat_u')), 'CF001');
SELECT pg_temp.check('Doctor has two accounts on one person',
  (SELECT count(*) = 2 FROM identity.app_user WHERE person_id = (SELECT v FROM fx WHERE k='doc_p')));

-- ---------------- 2. Opening a record ----------------
SELECT pg_temp.expect_fail('Doctor cannot open own citizen record',
  format($q$INSERT INTO access.access_session (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence)
            VALUES (%L, %L, 'key', 'k-own', now() + interval '30 min', true)$q$,
         (SELECT v FROM fx WHERE k='doc_p'), (SELECT v FROM fx WHERE k='doc_u')), 'CF023');
SELECT pg_temp.expect_fail('Key session longer than 30 minutes is refused',
  format($q$INSERT INTO access.access_session (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence)
            VALUES (%L, %L, 'key', 'k-long', now() + interval '45 min', true)$q$,
         (SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='doc_u')), '23514');
SELECT pg_temp.expect_fail('Outside geofence needs a reason',
  format($q$INSERT INTO access.access_session (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence)
            VALUES (%L, %L, 'key', 'k-out', now() + interval '30 min', false)$q$,
         (SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='doc_u')), '23514');
SELECT pg_temp.expect_fail('Nurse cannot open a record with a key',
  format($q$INSERT INTO access.access_session (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence)
            VALUES (%L, %L, 'key', 'k-nurse', now() + interval '30 min', true)$q$,
         (SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='staff_u')), 'CF022');

INSERT INTO access.access_session (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence)
VALUES ((SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='doc_u'), 'key', 'k-1', now() + interval '30 min', true);
INSERT INTO fx SELECT 'session', id FROM access.access_session WHERE key_token_id = 'k-1';

SELECT pg_temp.expect_fail('Only one doctor at a time (second key session refused)',
  format($q$INSERT INTO access.access_session (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence)
            VALUES (%L, %L, 'key', 'k-2', now() + interval '30 min', true)$q$,
         (SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='doc_u')), '23505');
SELECT pg_temp.expect_fail('Same 10-second key cannot be used twice',
  format($q$INSERT INTO access.access_session (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence)
            VALUES (%L, %L, 'emergency_contact', 'k-1', now() + interval '30 min', true)$q$,
         (SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='doc_u')), '23505');
SELECT pg_temp.expect_fail('Session history cannot be rewritten',
  format($q$UPDATE access.access_session SET started_at = now() - interval '1 day' WHERE id = %L$q$,
         (SELECT v FROM fx WHERE k='session')), 'CF002');
SELECT pg_temp.check('Geofence check: hospital pin is inside',
  (SELECT inside FROM access.inside_geofence((SELECT v FROM fx WHERE k='doc_u'), 76.60, 8.88)));
SELECT pg_temp.check('Geofence check: 5 km away is outside',
  (SELECT NOT inside FROM access.inside_geofence((SELECT v FROM fx WHERE k='doc_u'), 76.645, 8.88)));

-- ---------------- 3. Records: append-only + RLS ----------------
INSERT INTO records.document (patient_person_id, folder_id, title, doc_type, body_enc, sha256, enc_key_id, created_by_user_id, session_id)
SELECT (SELECT v FROM fx WHERE k='pat_p'), f.id, 'Consultation note', 'consultation_note', '\xdeadbeef',
       digest('note', 'sha256'), 'k1', (SELECT v FROM fx WHERE k='doc_u'), (SELECT v FROM fx WHERE k='session')
FROM records.folder f WHERE f.patient_person_id = (SELECT v FROM fx WHERE k='pat_p') AND f.kind = 'doctor_uploads';
INSERT INTO fx SELECT 'doc1', id FROM records.document WHERE title = 'Consultation note';

SELECT pg_temp.expect_fail('Documents cannot be edited',
  format($q$UPDATE records.document SET title = 'x' WHERE id = %L$q$, (SELECT v FROM fx WHERE k='doc1')), 'CF001');
SELECT pg_temp.expect_fail('Documents cannot be deleted',
  format($q$DELETE FROM records.document WHERE id = %L$q$, (SELECT v FROM fx WHERE k='doc1')), 'CF001');

-- As the API role (row-level security on)
SET ROLE cf_app;
SELECT set_config('app.user_id', (SELECT v FROM fx WHERE k='doc_u')::text, true),
       set_config('app.person_id', (SELECT v FROM fx WHERE k='doc_p')::text, true),
       set_config('app.account_type', 'doctor', true);
SELECT pg_temp.check('RLS: doctor with live session sees the record',
  (SELECT count(*) > 0 FROM records.folder WHERE patient_person_id = (SELECT v FROM fx WHERE k='pat_p')));
RESET ROLE;
UPDATE access.access_session SET ended_at = now(), ended_by = 'patient' WHERE id = (SELECT v FROM fx WHERE k='session');
SET ROLE cf_app;
SELECT pg_temp.check('RLS: after patient ends session, doctor no longer sees folders',
  (SELECT count(*) = 0 FROM records.folder WHERE patient_person_id = (SELECT v FROM fx WHERE k='pat_p')));
SELECT pg_temp.check('RLS: doctor still sees own additions (past patients)',
  (SELECT count(*) = 1 FROM records.document WHERE patient_person_id = (SELECT v FROM fx WHERE k='pat_p')));
SELECT set_config('app.user_id', (SELECT v FROM fx WHERE k='pat_u')::text, true),
       set_config('app.person_id', (SELECT v FROM fx WHERE k='pat_p')::text, true),
       set_config('app.account_type', 'citizen', true);
SELECT pg_temp.check('RLS: patient sees own record',
  (SELECT count(*) = 5 FROM records.folder WHERE patient_person_id = (SELECT v FROM fx WHERE k='pat_p')));
SELECT pg_temp.check('Patient access history shows the doctor session',
  (SELECT count(*) = 1 FROM access.v_access_history));
RESET ROLE;

-- ---------------- 4. AI results ----------------
INSERT INTO access.access_session (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence)
VALUES ((SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='doc_u'), 'key', 'k-3', now() + interval '30 min', true);
INSERT INTO fx SELECT 'session2', id FROM access.access_session WHERE key_token_id = 'k-3';

SELECT pg_temp.expect_fail('AI run must go in the matching tool folder',
  format($q$INSERT INTO ai.ai_run (patient_person_id, tool, folder_id, run_by_user_id, session_id, input_enc, output_enc, enc_key_id,
            model_name, model_version, is_simulated, status, started_at, finished_at, result_sha256)
            SELECT %L, 'image', f.id, %L, %L, '\x01', '\x02', 'k1', 'sim-vision', '0.1', true, 'completed', now(), now(), digest('r','sha256')
            FROM records.folder f WHERE f.patient_person_id = %L AND f.kind = 'genomic_analysis'$q$,
         (SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='doc_u'), (SELECT v FROM fx WHERE k='session2'),
         (SELECT v FROM fx WHERE k='pat_p')), 'CF041');

INSERT INTO ai.ai_run (patient_person_id, tool, folder_id, run_by_user_id, session_id, input_enc, output_enc, enc_key_id,
                       model_name, model_version, is_simulated, status, started_at, finished_at, result_sha256)
SELECT (SELECT v FROM fx WHERE k='pat_p'), 'image', f.id, (SELECT v FROM fx WHERE k='doc_u'), (SELECT v FROM fx WHERE k='session2'),
       '\x01', '\x02', 'k1', 'sim-vision', '0.1', true, 'completed', now(), now(), digest('r', 'sha256')
FROM records.folder f WHERE f.patient_person_id = (SELECT v FROM fx WHERE k='pat_p') AND f.kind = 'image_analysis';
INSERT INTO fx SELECT 'run', id FROM ai.ai_run LIMIT 1;

SELECT pg_temp.expect_fail('AI results are locked',
  format($q$UPDATE ai.ai_run SET status = 'failed' WHERE id = %L$q$, (SELECT v FROM fx WHERE k='run')), 'CF001');

SET ROLE cf_app;
SELECT set_config('app.user_id', (SELECT v FROM fx WHERE k='pat_u')::text, true),
       set_config('app.person_id', (SELECT v FROM fx WHERE k='pat_p')::text, true),
       set_config('app.account_type', 'citizen', true);
SELECT pg_temp.check('Patient cannot see AI result before doctor review',
  (SELECT count(*) = 0 FROM ai.ai_run));
RESET ROLE;
SELECT pg_temp.expect_fail('Only a doctor can review AI results',
  format($q$INSERT INTO ai.ai_review (run_id, doctor_user_id, verdict, reason) VALUES (%L, %L, 'agree', 'ok')$q$,
         (SELECT v FROM fx WHERE k='run'), (SELECT v FROM fx WHERE k='staff_u')), 'CF042');
INSERT INTO ai.ai_review (run_id, doctor_user_id, verdict, reason)
VALUES ((SELECT v FROM fx WHERE k='run'), (SELECT v FROM fx WHERE k='doc_u'), 'disagree', 'Opacity is artefact on review');
SET ROLE cf_app;
SELECT set_config('app.user_id', (SELECT v FROM fx WHERE k='pat_u')::text, true),
       set_config('app.person_id', (SELECT v FROM fx WHERE k='pat_p')::text, true),
       set_config('app.account_type', 'citizen', true);
SELECT pg_temp.check('Patient sees AI result after doctor review',
  (SELECT count(*) = 1 FROM ai.ai_run));
RESET ROLE;

-- ---------------- 5. Prescriptions and dispensing ----------------
INSERT INTO records.document (patient_person_id, folder_id, title, doc_type, storage_key, sha256, enc_key_id, created_by_user_id, session_id)
SELECT (SELECT v FROM fx WHERE k='pat_p'), f.id, 'Prescription', 'prescription', 'rx/demo.pdf', digest('rx', 'sha256'), 'k1',
       (SELECT v FROM fx WHERE k='doc_u'), (SELECT v FROM fx WHERE k='session2')
FROM records.folder f WHERE f.patient_person_id = (SELECT v FROM fx WHERE k='pat_p') AND f.kind = 'doctor_uploads';
INSERT INTO pharmacy.prescription (patient_person_id, doctor_user_id, session_id, hospital_id, valid_until, document_id,
                                   signature_method, signature_ref, qr_token)
SELECT (SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='doc_u'), (SELECT v FROM fx WHERE k='session2'),
       (SELECT v FROM fx WHERE k='hospital'), now() + interval '30 days', d.id, 'mock', 'MOCK-SIG', 'QR-DEMO-1'
FROM records.document d WHERE d.title = 'Prescription';
INSERT INTO fx SELECT 'rx', id FROM pharmacy.prescription WHERE qr_token = 'QR-DEMO-1';
INSERT INTO pharmacy.prescription_item (prescription_id, medicine_id, dose, frequency, duration_days, quantity)
VALUES ((SELECT v FROM fx WHERE k='rx'), (SELECT v FROM fx WHERE k='medicine'), '500 mg', 'TDS', 5, 15);
INSERT INTO fx SELECT 'rx_item', id FROM pharmacy.prescription_item WHERE prescription_id = (SELECT v FROM fx WHERE k='rx');

SELECT pg_temp.expect_fail('Prescription content cannot change',
  format($q$UPDATE pharmacy.prescription SET valid_until = now() + interval '1 year' WHERE id = %L$q$, (SELECT v FROM fx WHERE k='rx')), 'CF002');
SELECT pg_temp.expect_fail('Warning shown needs an override reason',
  format($q$INSERT INTO pharmacy.prescription_item (prescription_id, medicine_id, dose, frequency, duration_days, quantity, allergy_warning_shown)
            VALUES (%L, %L, '1', 'OD', 1, 1, true)$q$, (SELECT v FROM fx WHERE k='rx'), (SELECT v FROM fx WHERE k='medicine')), '23514');
SELECT pg_temp.expect_fail('Cannot dispense more than stock',
  format($q$INSERT INTO pharmacy.dispensing (prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id)
            VALUES (%L, %L, %L, 'dispensed', 100, %L)$q$,
         (SELECT v FROM fx WHERE k='rx_item'), (SELECT v FROM fx WHERE k='pharmacy'), (SELECT v FROM fx WHERE k='phar_u'),
         (SELECT v FROM fx WHERE k='stock')), 'CF056');

-- Pharmacist scans QR (as API role)
SET ROLE cf_app;
SELECT set_config('app.user_id', (SELECT v FROM fx WHERE k='phar_u')::text, true),
       set_config('app.person_id', NULL, true),
       set_config('app.account_type', 'pharmacist', true);
SELECT pg_temp.check('Pharmacist QR scan finds the prescription',
  pharmacy.receive_by_qr('QR-DEMO-1', (SELECT v FROM fx WHERE k='pharmacy')) = (SELECT v FROM fx WHERE k='rx'));
RESET ROLE;

INSERT INTO pharmacy.dispensing (prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id)
VALUES ((SELECT v FROM fx WHERE k='rx_item'), (SELECT v FROM fx WHERE k='pharmacy'), (SELECT v FROM fx WHERE k='phar_u'),
        'dispensed', 15, (SELECT v FROM fx WHERE k='stock'));
SELECT pg_temp.check('Stock reduced 30 → 15 after dispensing',
  (SELECT quantity = 15 FROM pharmacy.stock_item WHERE id = (SELECT v FROM fx WHERE k='stock')));
SELECT pg_temp.check('Prescription marked dispensed',
  (SELECT status = 'dispensed' FROM pharmacy.prescription WHERE id = (SELECT v FROM fx WHERE k='rx')));
SELECT pg_temp.expect_fail('Fully dispensed prescription cannot be dispensed again',
  format($q$INSERT INTO pharmacy.dispensing (prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id)
            VALUES (%L, %L, %L, 'dispensed', 1, %L)$q$,
         (SELECT v FROM fx WHERE k='rx_item'), (SELECT v FROM fx WHERE k='pharmacy'), (SELECT v FROM fx WHERE k='phar_u'),
         (SELECT v FROM fx WHERE k='stock')), 'CF051');
SELECT pg_temp.check('Stock finder returns the pharmacy with distance',
  (SELECT stock_level = 'in' AND distance_m BETWEEN 50 AND 5000
   FROM pharmacy.find_medicine((SELECT v FROM fx WHERE k='medicine'), 76.61, 8.89, 10000) LIMIT 1));

-- ---------------- 6. Blood donation ----------------
INSERT INTO donation.blood_donor (person_id, ready, eligibility_checked_at) VALUES ((SELECT v FROM fx WHERE k='pat_p'), true, now());
INSERT INTO donation.blood_donation (donor_person_id, donated_at, hospital_id, recorded_by_user_id)
VALUES ((SELECT v FROM fx WHERE k='pat_p'), now(), (SELECT v FROM fx WHERE k='hospital'), (SELECT v FROM fx WHERE k='doc_u'));
SELECT pg_temp.check('Donation switches donor OFF and sets next date (~90 days)',
  (SELECT NOT ready AND eligible_from = (current_date + 90) FROM donation.blood_donor WHERE person_id = (SELECT v FROM fx WHERE k='pat_p')));
SELECT pg_temp.expect_fail('Cannot switch ON before eligible date',
  format($q$UPDATE donation.blood_donor SET ready = true WHERE person_id = %L$q$, (SELECT v FROM fx WHERE k='pat_p')), 'CF060');
SELECT pg_temp.check('Next donation date added to Dates panel',
  (SELECT count(*) = 1 FROM records.dated_event WHERE event_type = 'blood_donation_eligible'));

-- ---------------- 7. Ratings and chat ----------------
SELECT pg_temp.expect_fail('Non-ABHA-verified person cannot rate',
  format($q$INSERT INTO engage.rating (rater_person_id, target_type, target_id, stars) VALUES
            ((SELECT person_id FROM identity.app_user WHERE id = %L), 'hospital', %L, 5)$q$,
         (SELECT v FROM fx WHERE k='staff_u'), (SELECT v FROM fx WHERE k='hospital')), 'CF071');
INSERT INTO engage.rating (rater_person_id, target_type, target_id, stars, comment)
VALUES ((SELECT v FROM fx WHERE k='pat_p'), 'hospital', (SELECT v FROM fx WHERE k='hospital'), 4, 'Clean and quick');
SELECT pg_temp.expect_fail('One rating per user per hospital',
  format($q$INSERT INTO engage.rating (rater_person_id, target_type, target_id, stars) VALUES (%L, 'hospital', %L, 1)$q$,
         (SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='hospital')), '23505');
SELECT pg_temp.expect_fail('Chat only with a doctor who treated the patient',
  format($q$INSERT INTO engage.chat_thread (thread_type, patient_person_id, doctor_user_id) VALUES ('doctor_followup', %L, %L)$q$,
         (SELECT v FROM fx WHERE k='doc_p'), (SELECT v FROM fx WHERE k='doc_u')), 'CF072');
INSERT INTO engage.chat_thread (thread_type, patient_person_id, doctor_user_id)
VALUES ('doctor_followup', (SELECT v FROM fx WHERE k='pat_p'), (SELECT v FROM fx WHERE k='doc_u'));
SELECT pg_temp.check('Follow-up chat with treating doctor allowed', true);

-- ---------------- 8. Activity log hash chain ----------------
SELECT set_config('app.user_id', (SELECT v FROM fx WHERE k='doc_u')::text, true),
       set_config('app.account_type', 'doctor', true);
SELECT audit.log('document.view', 'document', (SELECT v FROM fx WHERE k='doc1'), (SELECT v FROM fx WHERE k='pat_p'), NULL, '{}', 33::smallint)
FROM generate_series(1, 5);
SELECT pg_temp.check('Hash chain verifies when untouched', audit.verify_chain(33::smallint) IS NULL);
SELECT pg_temp.expect_fail('Log rows cannot be edited',
  $q$UPDATE audit.activity_log SET action = 'x' WHERE stream_id = 33$q$, 'CF001');
SELECT pg_temp.expect_fail('Log rows cannot be deleted',
  $q$DELETE FROM audit.activity_log WHERE stream_id = 33$q$, 'CF001');
-- Simulate an attacker with superuser rights who disables the trigger and edits a row:
ALTER TABLE audit.activity_log_default DISABLE TRIGGER USER;
DO $$ DECLARE p regclass; BEGIN
  FOR p IN SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent = 'audit.activity_log'::regclass LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', p);
  END LOOP;
END $$;
UPDATE audit.activity_log SET action = 'document.print'
 WHERE seq = (SELECT min(seq) + 2 FROM audit.activity_log WHERE stream_id = 33);
SELECT pg_temp.check('Tampering is detected by verify_chain', audit.verify_chain(33::smallint) IS NOT NULL,
  'first broken seq = ' || audit.verify_chain(33::smallint));
SET ROLE cf_app;
SELECT pg_temp.expect_fail('App role has no DELETE right on the log',
  $q$DELETE FROM audit.activity_log$q$, '42501');
RESET ROLE;

-- ---------------- 9. Death flow ----------------
INSERT INTO admin.death_record (person_id, date_of_death, source, recorded_by_user_id)
VALUES ((SELECT v FROM fx WHERE k='pat_p'), current_date, 'hospital', (SELECT v FROM fx WHERE k='doc_u'));
SELECT pg_temp.check('Death record locks every account of the person',
  (SELECT bool_and(status = 'locked_deceased') FROM identity.app_user WHERE person_id = (SELECT v FROM fx WHERE k='pat_p')));

-- =====================================================================
-- NEW TESTS for migrations 120-127 (events feed, outpatient, inpatient,
-- lab/imaging, pharmacy ops, admin ops, donation/organ, access/audit extras)
-- =====================================================================

-- Section 8 disabled the log triggers on purpose (tamper simulation). Switch them back on.
DO $$ DECLARE p regclass; BEGIN
  FOR p IN SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent = 'audit.activity_log'::regclass LOOP
    EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', p);
  END LOOP;
END $$;

-- Helpers: fixture lookup, "act as" a fixture user (sets the request context), user factory.
CREATE FUNCTION pg_temp.f(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM fx WHERE k = p_key $$;
CREATE FUNCTION pg_temp.act(p_key text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE u uuid := (SELECT v FROM fx WHERE k = p_key || '_u');
BEGIN
  PERFORM set_config('app.user_id', u::text, true);
  PERFORM set_config('app.person_id', (SELECT person_id FROM identity.app_user WHERE id = u)::text, true);
  PERFORM set_config('app.account_type', (SELECT account_type::text FROM identity.app_user WHERE id = u), true);
END $$;
CREATE FUNCTION pg_temp.mk_user(p_key text, p_name text, p_type identity.account_type) RETURNS void LANGUAGE plpgsql AS $$
DECLARE pp uuid; uu uuid;
BEGIN
  INSERT INTO identity.person (full_name, date_of_birth, sex, abha_number, kyc_status, face_check_status, aadhaar_token)
  VALUES (p_name, '1988-06-01', 'female', 'DEMO-ABHA-N-' || p_key, 'passed', 'passed', 'DEMO-TOKEN-N-' || p_key) RETURNING id INTO pp;
  INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status) VALUES (pp, p_type, 'kc-n-' || p_key, 'active') RETURNING id INTO uu;
  INSERT INTO fx VALUES (p_key || '_p', pp), (p_key || '_u', uu);
END $$;

-- ---------------- Fixture for the new sections (synthetic) ----------------
DO $$
DECLARE d2 uuid; h2 uuid; hm uuid := (SELECT v FROM fx WHERE k='hospital'); d1 uuid := (SELECT v FROM fx WHERE k='district');
        minor uuid; bg uuid; sess uuid; fold uuid;
BEGIN
  PERFORM set_config('app.user_id', '', true);      -- system events have no sender
  SELECT id INTO d2 FROM geo.district WHERE name = 'Kottayam';
  INSERT INTO org.hospital (hfr_id, name, ownership, hospital_type, district_id, address, location, geofence, licence_no, status)
  VALUES ('DEMO-HFR-N-0002', 'Demo Kottayam Hospital', 'govt', 'DH', d2, 'Demo Road, Kottayam',
          ST_SetSRID(ST_MakePoint(76.52, 9.59), 4326),
          ST_Buffer(ST_SetSRID(ST_MakePoint(76.52, 9.59), 4326)::geography, 300)::geometry, 'DEMO-LIC-N2', 'active') RETURNING id INTO h2;
  INSERT INTO fx VALUES ('dKot', d2), ('h2', h2);

  PERFORM pg_temp.mk_user('citA', 'Citizen A', 'citizen');
  PERFORM pg_temp.mk_user('citB', 'Citizen B', 'citizen');
  PERFORM pg_temp.mk_user('citC', 'Citizen C Kottayam', 'citizen');
  PERFORM pg_temp.mk_user('grd',  'Guardian G', 'citizen');
  PERFORM pg_temp.mk_user('ipP',  'Inpatient P', 'citizen');
  INSERT INTO identity.citizen_profile (person_id, district_id, blood_group) VALUES
    (pg_temp.f('citA_p'), d1, 'B+'), (pg_temp.f('citB_p'), d1, 'O+'), (pg_temp.f('citC_p'), d2, 'A+'),
    (pg_temp.f('grd_p'), d1, 'O+'), (pg_temp.f('ipP_p'), d1, 'B+');
  INSERT INTO identity.person (full_name, date_of_birth, sex) VALUES ('Minor M', '2018-04-04', 'male') RETURNING id INTO minor;
  INSERT INTO identity.citizen_profile (person_id, district_id, guardian_person_id, guardian_consent_at)
  VALUES (minor, d1, pg_temp.f('grd_p'), now());
  INSERT INTO fx VALUES ('minor_p', minor);
  PERFORM records.create_system_folders(pg_temp.f('citA_p'), pg_temp.f('citA_u'));
  PERFORM records.create_system_folders(pg_temp.f('citB_p'), pg_temp.f('citB_u'));

  PERFORM pg_temp.mk_user('docH',  'Dr H One', 'doctor');
  PERFORM pg_temp.mk_user('docH_b','Dr H Two', 'doctor');
  PERFORM pg_temp.mk_user('docH2', 'Dr H2', 'doctor');
  INSERT INTO identity.doctor_profile (user_id, hpr_id, council_name, council_reg_no, hospital_id, employment_type) VALUES
    (pg_temp.f('docH_u'),  'DEMO-HPR-71-9001', 'TCMC', 'DEMO-REG-N1', hm, 'govt'),
    (pg_temp.f('docH_b_u'),'DEMO-HPR-71-9002', 'TCMC', 'DEMO-REG-N2', hm, 'govt'),
    (pg_temp.f('docH2_u'), 'DEMO-HPR-71-9003', 'TCMC', 'DEMO-REG-N3', h2, 'govt');

  PERFORM pg_temp.mk_user('hadmH',  'Hospital Admin H', 'hospital_admin');
  PERFORM pg_temp.mk_user('hadmH2', 'Hospital Admin H2', 'hospital_admin');
  INSERT INTO identity.hospital_admin_profile (user_id, hospital_id) VALUES (pg_temp.f('hadmH_u'), hm), (pg_temp.f('hadmH2_u'), h2);
  PERFORM pg_temp.mk_user('lab', 'Lab Tech', 'staff');
  PERFORM pg_temp.mk_user('rad', 'Radiology Tech', 'staff');
  INSERT INTO identity.staff_profile (user_id, hospital_id, staff_role, created_by_user_id) VALUES
    (pg_temp.f('lab_u'), hm, 'lab', pg_temp.f('dadm_u')), (pg_temp.f('rad_u'), hm, 'radiology', pg_temp.f('dadm_u'));

  PERFORM pg_temp.mk_user('distA', 'District Admin Kollam', 'district_admin');
  PERFORM pg_temp.mk_user('stA',   'State Admin Kerala', 'state_admin');
  PERFORM pg_temp.mk_user('znA',   'Zonal Admin South', 'zonal_admin');
  PERFORM pg_temp.mk_user('cenA',  'Central Admin', 'central_admin');
  INSERT INTO admin.admin_post (user_id, level, district_id) VALUES (pg_temp.f('distA_u'), 'district', d1);
  INSERT INTO admin.admin_post (user_id, level, state_id)    VALUES (pg_temp.f('stA_u'), 'state', 33);
  INSERT INTO admin.admin_post (user_id, level, zone_id)     VALUES (pg_temp.f('znA_u'), 'zonal', 2);
  INSERT INTO admin.admin_post (user_id, level)              VALUES (pg_temp.f('cenA_u'), 'central');

  -- A live key session for Dr H One on citizen A
  INSERT INTO access.access_session (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence)
  VALUES (pg_temp.f('citA_p'), pg_temp.f('docH_u'), 'key', 'k-n-1', now() + interval '30 min', true) RETURNING id INTO sess;
  INSERT INTO fx VALUES ('sessA', sess);
  -- A break-glass session for Dr H One on citizen B
  INSERT INTO access.access_session (patient_person_id, user_id, mode, reason, expires_at, start_inside_geofence)
  VALUES (pg_temp.f('citB_p'), pg_temp.f('docH_u'), 'break_glass', 'Unconscious, no key, family unreachable', now() + interval '60 min', true) RETURNING id INTO bg;
  INSERT INTO fx VALUES ('sessBG', bg);

  -- Events (system-created; no sender)
  INSERT INTO engage.event (type, from_role, to_roles, title, patient_person_id, hospital_id)
  VALUES ('lab-result', 'labtech', '{citizen,doctor}', 'EVT patient A', pg_temp.f('citA_p'), hm);
  INSERT INTO engage.event (type, from_role, to_roles, title, patient_person_id)
  VALUES ('dispensed', 'pharmacist', '{citizen}', 'EVT minor M', minor);
  INSERT INTO engage.event (type, from_role, to_roles, title, district_id)
  VALUES ('alert', 'district', '{citizen,doctor}', 'EVT alert Kollam', d1);
  INSERT INTO engage.event (type, from_role, to_roles, title)
  VALUES ('alert', 'central', '{citizen,doctor}', 'EVT national');
  INSERT INTO engage.event (type, from_role, to_roles, title, patient_person_id, pharmacy_id)
  VALUES ('prescription', 'doctor', '{doctor,pharmacist}', 'EVT pharmacy patient A', pg_temp.f('citA_p'), pg_temp.f('pharmacy'));
  INSERT INTO engage.event (type, from_role, to_roles, title, district_id)
  VALUES ('alert', 'central', '{district,state,zonal,central}', 'EVT gov Kollam', d1);
  INSERT INTO engage.event (type, from_role, to_roles, title, district_id)
  VALUES ('alert', 'central', '{district,state,zonal,central}', 'EVT gov Kottayam', d2);
  INSERT INTO engage.event (type, from_role, to_roles, title, to_user_id)
  VALUES ('message', 'doctor', '{doctor}', 'EVT direct to H One', pg_temp.f('docH_u'));
  INSERT INTO engage.event (type, from_role, to_roles, title, patient_person_id, hospital_id, created_by_user_id)
  VALUES ('referral', 'doctor', '{pharmacist}', 'EVT sent by H One', pg_temp.f('citA_p'), hm, pg_temp.f('docH_u'));
  INSERT INTO fx SELECT 'ev_patA', id FROM engage.event WHERE title = 'EVT patient A';
  INSERT INTO fx SELECT 'ev_minor', id FROM engage.event WHERE title = 'EVT minor M';
  INSERT INTO fx SELECT 'ev_direct', id FROM engage.event WHERE title = 'EVT direct to H One';
END $$;

-- ---------------- 10. Events feed: who may see what ----------------
SELECT pg_temp.check('EVENTS: unified type imaging-order exists',
  (SELECT count(*) = 1 FROM engage.event_type_ref WHERE code = 'imaging-order'));
SELECT pg_temp.expect_fail('EVENTS: old name radiology-order is refused (unknown type)',
  $q$INSERT INTO engage.event (type, from_role, to_roles, title) VALUES ('radiology-order', 'doctor', '{radiology}', 'x')$q$, '23503');
SELECT pg_temp.expect_fail('EVENTS: href with a web address is refused',
  $q$INSERT INTO engage.event (type, from_role, to_roles, title, href) VALUES ('alert', 'central', '{citizen}', 'x', 'http://x')$q$, '23514');
SELECT pg_temp.expect_fail('EVENTS: href starting with // is refused',
  $q$INSERT INTO engage.event (type, from_role, to_roles, title, href) VALUES ('alert', 'central', '{citizen}', 'x', '//evil')$q$, '23514');
SELECT pg_temp.expect_fail('EVENTS: relative href is refused',
  $q$INSERT INTO engage.event (type, from_role, to_roles, title, href) VALUES ('alert', 'central', '{citizen}', 'x', 'relative/path')$q$, '23514');
INSERT INTO engage.event (type, from_role, to_roles, title, href) VALUES ('alert', 'central', '{citizen}', 'EVT href ok', '/citizen/medicines');
SELECT pg_temp.check('EVENTS: app route href /citizen/medicines is accepted',
  (SELECT href = '/citizen/medicines' FROM engage.event WHERE title = 'EVT href ok'));
SELECT pg_temp.expect_fail('EVENTS: event about a patient may not go to district/state/zonal/central',
  format($q$INSERT INTO engage.event (type, from_role, to_roles, title, patient_person_id, hospital_id)
            VALUES ('booking', 'citizen', '{doctor,district}', 'x', %L, %L)$q$, pg_temp.f('citA_p'), pg_temp.f('hospital')), '23514');
SELECT pg_temp.expect_fail('EVENTS: patient event without facility, direct user or citizen-only audience is refused',
  format($q$INSERT INTO engage.event (type, from_role, to_roles, title, patient_person_id) VALUES ('booking', 'citizen', '{doctor}', 'x', %L)$q$,
         pg_temp.f('citA_p')), '23514');
SELECT pg_temp.expect_fail('EVENTS: events cannot be edited',
  format($q$UPDATE engage.event SET title = 'changed' WHERE id = %L$q$, pg_temp.f('ev_patA')), 'CF001');
SELECT pg_temp.expect_fail('EVENTS: events cannot be deleted',
  format($q$DELETE FROM engage.event WHERE id = %L$q$, pg_temp.f('ev_patA')), 'CF001');

SET ROLE cf_app;
SELECT pg_temp.act('citA');
SELECT pg_temp.check('EVENTS: citizen A sees the event about A',
  (SELECT count(*) = 1 FROM engage.event WHERE title = 'EVT patient A'));
SELECT pg_temp.check('EVENTS: citizen A does not see the minor''s event',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT minor M'));
SELECT pg_temp.check('EVENTS: citizen A sees the district alert and the national event',
  (SELECT count(*) = 2 FROM engage.event WHERE title IN ('EVT alert Kollam', 'EVT national')));
SELECT pg_temp.check('EVENTS: citizen A does not see doctor-only or gov-only events',
  (SELECT count(*) = 0 FROM engage.event WHERE title IN ('EVT gov Kollam', 'EVT direct to H One', 'EVT sent by H One')));
SELECT pg_temp.act('citB');
SELECT pg_temp.check('EVENTS: citizen B (not the patient) does NOT see the event about A',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT patient A'));
SELECT pg_temp.check('EVENTS: citizen B sees no event that names a patient',
  (SELECT count(*) = 0 FROM engage.event WHERE patient_person_id IS NOT NULL));
SELECT pg_temp.check('EVENTS: citizen B (same district) sees the district alert',
  (SELECT count(*) = 1 FROM engage.event WHERE title = 'EVT alert Kollam'));
SELECT pg_temp.act('citC');
SELECT pg_temp.check('EVENTS: citizen C in another district does NOT see the Kollam alert',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT alert Kollam'));
SELECT pg_temp.check('EVENTS: citizen C still sees the national event',
  (SELECT count(*) = 1 FROM engage.event WHERE title = 'EVT national'));
SELECT pg_temp.act('grd');
SELECT pg_temp.check('EVENTS: guardian sees the minor''s event',
  (SELECT count(*) = 1 FROM engage.event WHERE title = 'EVT minor M'));
SELECT pg_temp.check('EVENTS: guardian does not see events about other patients',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT patient A'));

SELECT pg_temp.act('docH');
SELECT pg_temp.check('EVENTS: doctor of hospital H sees the hospital-scoped patient event',
  (SELECT count(*) = 1 FROM engage.event WHERE title = 'EVT patient A'));
SELECT pg_temp.check('EVENTS: patient event with only a pharmacy scope is invisible to a doctor',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT pharmacy patient A'));
SELECT pg_temp.check('EVENTS: doctor sees the direct message and the sender sees what they sent',
  (SELECT count(*) = 2 FROM engage.event WHERE title IN ('EVT direct to H One', 'EVT sent by H One')));
SELECT pg_temp.check('EVENTS: doctor never sees citizen-only events',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT minor M'));
SELECT pg_temp.act('docH_b');
SELECT pg_temp.check('EVENTS: a colleague does not see a direct message meant for another doctor',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT direct to H One'));
SELECT pg_temp.check('EVENTS: a colleague does not see an event the sender sent to pharmacists only',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT sent by H One'));
SELECT pg_temp.act('docH2');
SELECT pg_temp.check('EVENTS: doctor of another hospital does NOT see the hospital H patient event',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT patient A'));
SELECT pg_temp.check('EVENTS: doctor of another district does not see the Kollam alert but sees the national one',
  (SELECT count(*) FILTER (WHERE title = 'EVT alert Kollam') = 0 AND count(*) FILTER (WHERE title = 'EVT national') = 1
   FROM engage.event WHERE title IN ('EVT alert Kollam', 'EVT national')));
SELECT pg_temp.act('hadmH');
SELECT pg_temp.check('EVENTS: hospital admin of H does not see a patient event not addressed to the role',
  (SELECT count(*) = 0 FROM engage.event WHERE title = 'EVT patient A'));

-- Government admins: area events yes, patient events never
SELECT pg_temp.act('distA');
SELECT pg_temp.check('EVENTS: district admin sees own-district event only',
  (SELECT count(*) FILTER (WHERE title = 'EVT gov Kollam') = 1 AND count(*) FILTER (WHERE title = 'EVT gov Kottayam') = 0
   FROM engage.event WHERE title LIKE 'EVT gov%'));
SELECT pg_temp.check('EVENTS: district admin sees NO event that names a patient',
  (SELECT count(*) = 0 FROM engage.event WHERE patient_person_id IS NOT NULL));
SELECT pg_temp.act('stA');
SELECT pg_temp.check('EVENTS: state admin sees both districts of Kerala',
  (SELECT count(*) = 2 FROM engage.event WHERE title LIKE 'EVT gov%'));
SELECT pg_temp.check('EVENTS: state admin sees NO event that names a patient',
  (SELECT count(*) = 0 FROM engage.event WHERE patient_person_id IS NOT NULL));
SELECT pg_temp.act('znA');
SELECT pg_temp.check('EVENTS: zonal admin sees the South zone events but no patient event',
  (SELECT count(*) FILTER (WHERE title LIKE 'EVT gov%') = 2 AND count(*) FILTER (WHERE patient_person_id IS NOT NULL) = 0 FROM engage.event));
SELECT pg_temp.act('cenA');
SELECT pg_temp.check('EVENTS: central admin sees all gov events but no patient event',
  (SELECT count(*) FILTER (WHERE title LIKE 'EVT gov%') = 2 AND count(*) FILTER (WHERE patient_person_id IS NOT NULL) = 0 FROM engage.event));
RESET ROLE;

-- Read state (per user)
SET ROLE cf_app;
SELECT pg_temp.act('docH');
SELECT pg_temp.check('EVENTS: unread bell counts events sent to me, not sent by me',
  (SELECT engage.unread_event_count() = 4 AND count(*) = 4 FROM engage.v_my_events WHERE NOT is_read AND NOT sent_by_me AND title LIKE 'EVT%'));
SELECT pg_temp.check('EVENTS: mark_events_read marks one event',
  engage.mark_events_read(ARRAY[pg_temp.f('ev_patA')]) = 1);
SELECT pg_temp.check('EVENTS: marked event shows is_read and bell goes 4 -> 3',
  (SELECT is_read FROM engage.v_my_events WHERE title = 'EVT patient A') AND engage.unread_event_count() = 3);
SELECT pg_temp.act('docH_b');
SELECT pg_temp.check('EVENTS: read state is per user (colleague still has it unread)',
  (SELECT NOT is_read FROM engage.v_my_events WHERE title = 'EVT patient A'));
SELECT pg_temp.act('docH2');
SELECT pg_temp.check('EVENTS: a user cannot mark an event read that they cannot see',
  engage.mark_events_read(ARRAY[pg_temp.f('ev_patA')]) = 0);
SELECT pg_temp.act('citB');
SELECT pg_temp.check('EVENTS: mark all read marks every visible event', engage.mark_events_read() >= 1);
SELECT pg_temp.check('EVENTS: after mark all read the bell is zero', engage.unread_event_count() = 0);
RESET ROLE;

-- Sending rules (insert policy)
SET ROLE cf_app;
SELECT pg_temp.act('citA');
SELECT pg_temp.expect_fail('EVENTS: a citizen cannot send an event as a doctor',
  format($q$INSERT INTO engage.event (type, from_role, to_roles, title, hospital_id) VALUES ('booking', 'doctor', '{doctor}', 'forged', %L)$q$,
         pg_temp.f('hospital')), '42501');
SELECT pg_temp.expect_fail('EVENTS: a citizen cannot create an event about another patient',
  format($q$INSERT INTO engage.event (type, from_role, to_roles, title, patient_person_id, hospital_id)
            VALUES ('booking', 'citizen', '{doctor}', 'about B', %L, %L)$q$, pg_temp.f('citB_p'), pg_temp.f('hospital')), '42501');
INSERT INTO engage.event (type, from_role, to_roles, title, patient_person_id, hospital_id)
VALUES ('booking', 'citizen', '{doctor}', 'EVT booking by A', pg_temp.f('citA_p'), pg_temp.f('hospital'));
SELECT pg_temp.check('EVENTS: a citizen can create an event about themself (sender recorded from the request)',
  (SELECT count(*) = 1 FROM engage.event WHERE title = 'EVT booking by A' AND created_by_user_id = util.ctx_user_id()));
RESET ROLE;

-- ---------------- 11. Records extras: folders, documents, summaries ----------------
INSERT INTO records.folder (patient_person_id, name, kind, created_by_user_id)
VALUES (pg_temp.f('citA_p'), 'My papers', 'user', pg_temp.f('citA_u'));
UPDATE records.folder SET colour = 'sage', archived_at = now() WHERE name = 'My papers' AND patient_person_id = pg_temp.f('citA_p');
SELECT pg_temp.check('FOLDERS: a user folder can be archived and coloured',
  (SELECT archived_at IS NOT NULL AND colour = 'sage' FROM records.folder WHERE name = 'My papers' AND patient_person_id = pg_temp.f('citA_p')));
SELECT pg_temp.expect_fail('FOLDERS: a system folder cannot be archived',
  format($q$UPDATE records.folder SET archived_at = now() WHERE patient_person_id = %L AND kind = 'ai_chat'$q$, pg_temp.f('citA_p')), '23514');
SELECT pg_temp.expect_fail('FOLDERS: a folder can still not be deleted',
  format($q$DELETE FROM records.folder WHERE name = 'My papers' AND patient_person_id = %L$q$, pg_temp.f('citA_p')), 'CF001');
SELECT pg_temp.expect_fail('FOLDERS: only name, colour and archive may change',
  format($q$UPDATE records.folder SET kind = 'user' WHERE patient_person_id = %L AND kind = 'ai_chat'$q$, pg_temp.f('citA_p')), 'CF002');

INSERT INTO records.document (patient_person_id, folder_id, title, doc_type, body_enc, sha256, enc_key_id, created_by_user_id, sensitivity)
SELECT pg_temp.f('citA_p'), f.id, t.title, 'text_note', '\x01', digest(t.title, 'sha256'), 'k1', pg_temp.f('citA_u'), t.s::records.doc_sensitivity
FROM records.folder f, (VALUES ('N general note', 'general'), ('N mental health note', 'mental_health')) t(title, s)
WHERE f.patient_person_id = pg_temp.f('citA_p') AND f.name = 'My papers';
INSERT INTO fx SELECT 'doc_gen', id FROM records.document WHERE title = 'N general note';
INSERT INTO fx SELECT 'doc_mh', id FROM records.document WHERE title = 'N mental health note';

SET ROLE cf_app;
SELECT pg_temp.act('docH');
SELECT pg_temp.check('DOCS: doctor with a live session sees the general document',
  (SELECT count(*) = 1 FROM records.document WHERE title = 'N general note'));
SELECT pg_temp.check('DOCS: doctor does NOT see the mental-health document while the switch is off',
  (SELECT count(*) = 0 FROM records.document WHERE title = 'N mental health note'));
SELECT pg_temp.act('citA');
SELECT pg_temp.check('DOCS: the citizen always sees their own mental-health document',
  (SELECT count(*) = 1 FROM records.document WHERE title = 'N mental health note'));
RESET ROLE;
INSERT INTO identity.share_preference (person_id, category, enabled) VALUES (pg_temp.f('citA_p'), 'mental_health', true);
SET ROLE cf_app;
SELECT pg_temp.act('docH');
SELECT pg_temp.check('DOCS: doctor sees the mental-health document once the citizen switches it on',
  (SELECT count(*) = 1 FROM records.document WHERE title = 'N mental health note'));
RESET ROLE;

INSERT INTO records.document_summary (document_id, patient_person_id, summary_title, summary_enc, enc_key_id, model_name, model_version)
VALUES (pg_temp.f('doc_gen'), pg_temp.f('citA_p'), 'Plain summary', '\x02', 'k1', 'sim-summary', '0.1');
SET ROLE cf_app;
SELECT pg_temp.act('citA');
SELECT pg_temp.check('DOCS: AI summary is hidden from the citizen until a doctor reviews it',
  (SELECT count(*) = 0 FROM records.document_summary));
RESET ROLE;
UPDATE records.document_summary SET reviewed_by_user_id = pg_temp.f('docH_u'), reviewed_at = now();
SET ROLE cf_app;
SELECT pg_temp.act('citA');
SELECT pg_temp.check('DOCS: AI summary is visible to the citizen after review, and flagged simulated',
  (SELECT count(*) = 1 AND bool_and(is_simulated) FROM records.document_summary));
RESET ROLE;
SELECT pg_temp.expect_fail('DOCS: a summary cannot point to a document of another patient',
  format($q$INSERT INTO records.document_summary (document_id, patient_person_id, summary_title, summary_enc, enc_key_id, model_name, model_version)
            VALUES (%L, %L, 'x', '\x02', 'k1', 'sim', '0.1')$q$, pg_temp.f('doc_gen'), pg_temp.f('citB_p')), 'CF100');

-- ---------------- 12. Orders, lab ----------------
INSERT INTO lab.test_catalogue (code, name, unit, ref_low, ref_high, critical_low, critical_high)
VALUES ('ZTEST_K', 'Test potassium', 'mmol/L', 3.5, 5.2, 2.5, 6.0) ON CONFLICT DO NOTHING;
INSERT INTO records.clinical_order (patient_person_id, ordered_by_user_id, hospital_id, order_type, details, priority)
VALUES (pg_temp.f('citA_p'), pg_temp.f('docH_u'), pg_temp.f('hospital'), 'lab', 'Potassium', 'stat');
INSERT INTO fx SELECT 'ord_lab', id FROM records.clinical_order WHERE details = 'Potassium';
SELECT pg_temp.check('ORDERS: order_ref gets the ORD-DEMO-NNNN format by default',
  (SELECT order_ref ~ '^ORD-DEMO-[0-9]{4,}$' FROM records.clinical_order WHERE id = pg_temp.f('ord_lab')));
SELECT pg_temp.expect_fail('ORDERS: old-style order numbers (LAB-8841) are refused',
  format($q$INSERT INTO records.clinical_order (patient_person_id, ordered_by_user_id, hospital_id, order_type, details, order_ref)
            VALUES (%L, %L, %L, 'lab', 'x', 'LAB-8841')$q$, pg_temp.f('citA_p'), pg_temp.f('docH_u'), pg_temp.f('hospital')), '23514');
SELECT pg_temp.expect_fail('ORDERS: a rejected order needs a reason',
  format($q$INSERT INTO records.clinical_order (patient_person_id, ordered_by_user_id, hospital_id, order_type, details, status)
            VALUES (%L, %L, %L, 'lab', 'x', 'rejected')$q$, pg_temp.f('citA_p'), pg_temp.f('docH_u'), pg_temp.f('hospital')), '23514');

INSERT INTO lab.result (order_id, patient_person_id, entered_by_user_id) VALUES (pg_temp.f('ord_lab'), pg_temp.f('citA_p'), pg_temp.f('lab_u'));
INSERT INTO fx SELECT 'res1', id FROM lab.result WHERE order_id = pg_temp.f('ord_lab');
INSERT INTO lab.result_value (result_id, test_code, value_num) VALUES (pg_temp.f('res1'), 'ZTEST_K', 6.4);
SELECT pg_temp.check('LAB: value above critical limit is flagged HH and critical (range filled from catalogue)',
  (SELECT flag = 'HH' AND is_critical AND ref_high = 5.2 AND unit = 'mmol/L' FROM lab.result_value WHERE result_id = pg_temp.f('res1')));
SELECT pg_temp.check('LAB: critical value not yet called shows in the safety-net view',
  (SELECT count(*) = 1 FROM lab.v_critical_uncalled WHERE result_value_id = (SELECT id FROM lab.result_value WHERE result_id = pg_temp.f('res1'))));
INSERT INTO lab.critical_call (result_value_id, patient_person_id, called_by_user_id, called_to_name, read_back_confirmed, read_back_at)
SELECT id, pg_temp.f('citA_p'), pg_temp.f('lab_u'), 'Dr H One', true, now() FROM lab.result_value WHERE result_id = pg_temp.f('res1');
SELECT pg_temp.check('LAB: after the call is logged it leaves the safety-net view',
  (SELECT count(*) = 0 FROM lab.v_critical_uncalled WHERE result_value_id = (SELECT id FROM lab.result_value WHERE result_id = pg_temp.f('res1'))));
UPDATE lab.result SET status = 'released', released_at = now(), released_by_user_id = pg_temp.f('lab_u') WHERE id = pg_temp.f('res1');
SELECT pg_temp.expect_fail('LAB: a released result refuses new values',
  format($q$INSERT INTO lab.result_value (result_id, test_code, value_num) VALUES (%L, 'ZTEST_K', 4)$q$, pg_temp.f('res1')), 'CF120');
SELECT pg_temp.expect_fail('LAB: a released result cannot be edited',
  format($q$UPDATE lab.result SET clinical_comment = 'changed' WHERE id = %L$q$, pg_temp.f('res1')), 'CF002');
SELECT pg_temp.expect_fail('LAB: values of a released result cannot be deleted',
  format($q$DELETE FROM lab.result_value WHERE result_id = %L$q$, pg_temp.f('res1')), 'CF120');
SELECT pg_temp.expect_fail('LAB: a result cannot be deleted',
  format($q$DELETE FROM lab.result WHERE id = %L$q$, pg_temp.f('res1')), 'CF001');
INSERT INTO lab.result (order_id, patient_person_id, entered_by_user_id) VALUES (pg_temp.f('ord_lab'), pg_temp.f('citA_p'), pg_temp.f('lab_u'));
INSERT INTO lab.result_value (result_id, test_code, value_num)
SELECT id, 'ZTEST_K', 4.0 FROM lab.result WHERE status = 'draft' AND order_id = pg_temp.f('ord_lab');
SELECT pg_temp.check('LAB: normal value is flagged N and the change from the last released value is computed (-2.4)',
  (SELECT v.flag = 'N' AND v.delta_prev = -2.4 FROM lab.result_value v JOIN lab.result r ON r.id = v.result_id WHERE r.status = 'draft' AND r.order_id = pg_temp.f('ord_lab')));
SELECT pg_temp.check('LAB: analyte series view shows only released values',
  (SELECT count(*) = 1 FROM lab.v_analyte_series WHERE patient_person_id = pg_temp.f('citA_p') AND test_code = 'ZTEST_K'));
SET ROLE cf_app;
SELECT pg_temp.act('citA');
SELECT pg_temp.check('LAB: citizen sees the released result but not the draft',
  (SELECT count(*) = 1 FROM lab.result WHERE order_id = pg_temp.f('ord_lab')));
SELECT pg_temp.act('lab');
SELECT pg_temp.check('LAB: lab technician of the ordering hospital sees both results',
  (SELECT count(*) = 2 FROM lab.result WHERE order_id = pg_temp.f('ord_lab')));
SELECT pg_temp.act('docH2');
SELECT pg_temp.check('LAB: a doctor of another hospital sees no result',
  (SELECT count(*) = 0 FROM lab.result));
RESET ROLE;

-- ---------------- 13. Imaging ----------------
INSERT INTO records.clinical_order (patient_person_id, ordered_by_user_id, hospital_id, order_type, details)
VALUES (pg_temp.f('citA_p'), pg_temp.f('docH_u'), pg_temp.f('hospital'), 'scan', 'Chest X-ray'),
       (pg_temp.f('citB_p'), pg_temp.f('docH_u'), pg_temp.f('hospital'), 'scan', 'Wrist X-ray');
INSERT INTO imaging.study (order_id, patient_person_id, hospital_id, modality, body_part)
SELECT id, patient_person_id, hospital_id, 'XR', details FROM records.clinical_order WHERE details IN ('Chest X-ray', 'Wrist X-ray');
INSERT INTO fx SELECT 'study_a', s.id FROM imaging.study s WHERE s.patient_person_id = pg_temp.f('citA_p');
INSERT INTO fx SELECT 'study_b', s.id FROM imaging.study s WHERE s.patient_person_id = pg_temp.f('citB_p');
SELECT pg_temp.expect_fail('IMAGING: a prior study of another patient is refused',
  format($q$INSERT INTO imaging.study_prior (study_id, prior_study_id) VALUES (%L, %L)$q$, pg_temp.f('study_a'), pg_temp.f('study_b')), 'CF122');
INSERT INTO imaging.study_file (study_id, document_id, uploaded_by_user_id) VALUES (pg_temp.f('study_a'), pg_temp.f('doc_gen'), pg_temp.f('rad_u'));
INSERT INTO fx SELECT 'file_new', id FROM imaging.study_file WHERE study_id = pg_temp.f('study_a');
SELECT pg_temp.expect_fail('IMAGING: withdrawing a file needs a reason',
  format($q$UPDATE imaging.study_file SET withdrawn_at = now(), withdrawn_by_user_id = %L WHERE id = %L$q$, pg_temp.f('rad_u'), pg_temp.f('file_new')), 'CF121');
UPDATE imaging.study_file SET withdrawn_at = now(), withdrawn_by_user_id = pg_temp.f('rad_u'), withdrawn_reason = 'Wrong patient name burned in'
 WHERE id = pg_temp.f('file_new');
SELECT pg_temp.check('IMAGING: a file can be withdrawn within 24 h with a reason',
  (SELECT withdrawn_at IS NOT NULL FROM imaging.study_file WHERE id = pg_temp.f('file_new')));
INSERT INTO imaging.study_file (study_id, document_id, uploaded_by_user_id, uploaded_at)
VALUES (pg_temp.f('study_b'), pg_temp.f('doc_gen'), pg_temp.f('rad_u'), now() - interval '2 days');
SELECT pg_temp.expect_fail('IMAGING: withdrawing after 24 h is refused',
  format($q$UPDATE imaging.study_file SET withdrawn_at = now(), withdrawn_by_user_id = %L, withdrawn_reason = 'late' WHERE study_id = %L$q$,
         pg_temp.f('rad_u'), pg_temp.f('study_b')), 'CF121');
SELECT pg_temp.expect_fail('IMAGING: an already withdrawn file cannot be withdrawn again',
  format($q$UPDATE imaging.study_file SET withdrawn_reason = 'again' WHERE id = %L$q$, pg_temp.f('file_new')), 'CF121');
SET ROLE cf_app;
SELECT pg_temp.act('citA');
SELECT pg_temp.check('IMAGING: citizen does not see a study until it is reported',
  (SELECT count(*) = 0 FROM imaging.study));
SELECT pg_temp.act('rad');
SELECT pg_temp.check('IMAGING: radiology technician sees both studies of the hospital',
  (SELECT count(*) = 2 FROM imaging.study));
RESET ROLE;
UPDATE imaging.study SET status = 'reported' WHERE id = pg_temp.f('study_a');
SET ROLE cf_app;
SELECT pg_temp.act('citA');
SELECT pg_temp.check('IMAGING: citizen sees the study once it is reported',
  (SELECT count(*) = 1 FROM imaging.study));
RESET ROLE;

-- ---------------- 14. Inpatient: NEWS2, escalation, MAR, handover ----------------
SELECT pg_temp.check('NEWS2: design case (SpO2 91, RR 24, HR 112, SBP 105, 38.4, alert, air) scores 9 = high',
  (SELECT (SELECT sum(x) FROM unnest(p) x) = 9 AND inpatient.news2_band(p) = 'high' FROM (SELECT inpatient.news2_parts(24, 91, false, 105, 112, 38.4, 'A') p) s));
SELECT pg_temp.check('NEWS2: all normal scores 0 = low',
  inpatient.news2_band(inpatient.news2_parts(16, 98, false, 120, 70, 37.0, 'A')) = 'low');
SELECT pg_temp.check('NEWS2: a single parameter scoring 3 gives low_medium',
  inpatient.news2_band(inpatient.news2_parts(8, 98, false, 120, 70, 37.0, 'A')) = 'low_medium');
SELECT pg_temp.check('NEWS2: oxygen adds 2 and confusion scores 3',
  (SELECT (SELECT sum(x) FROM unnest(p) x) = 5 FROM (SELECT inpatient.news2_parts(16, 98, true, 120, 70, 37.0, 'C') p) s));

INSERT INTO access.admission (patient_person_id, hospital_id, granted_by_person_id)
VALUES (pg_temp.f('ipP_p'), pg_temp.f('hospital'), pg_temp.f('ipP_p'));
INSERT INTO fx SELECT 'adm1', id FROM access.admission WHERE patient_person_id = pg_temp.f('ipP_p');
INSERT INTO inpatient.vital_set (admission_id, patient_person_id, recorded_by_user_id, resp_rate, spo2, systolic, pulse, temp_c)
VALUES (pg_temp.f('adm1'), pg_temp.f('ipP_p'), pg_temp.f('staff_u'), 16, 98, 120, 70, 37.0);
SELECT pg_temp.check('NEWS2: a normal vital set is scored 0 with no escalation',
  (SELECT news_score = 0 AND news_band = 'low' FROM inpatient.vital_set WHERE admission_id = pg_temp.f('adm1'))
  AND (SELECT count(*) = 0 FROM inpatient.escalation WHERE admission_id = pg_temp.f('adm1')));
INSERT INTO inpatient.vital_set (admission_id, patient_person_id, recorded_by_user_id, resp_rate, spo2, systolic, pulse, temp_c, observed_at)
VALUES (pg_temp.f('adm1'), pg_temp.f('ipP_p'), pg_temp.f('staff_u'), 24, 91, 105, 112, 38.4, now() + interval '1 hour');
SELECT pg_temp.check('NEWS2: the trigger scores the set (9, high) and raises a rapid-response escalation',
  (SELECT count(*) = 1 FROM inpatient.vital_set WHERE news_score = 9 AND news_band = 'high' AND admission_id = pg_temp.f('adm1'))
  AND (SELECT level = 3 AND paged_role = 'rapid_response' FROM inpatient.escalation WHERE admission_id = pg_temp.f('adm1')));
INSERT INTO inpatient.vital_set (admission_id, patient_person_id, recorded_by_user_id, resp_rate, spo2, systolic, pulse, temp_c, on_oxygen, observed_at)
VALUES (pg_temp.f('adm1'), pg_temp.f('ipP_p'), pg_temp.f('staff_u'), 22, 94, 105, 100, 38.5, false, now() + interval '2 hours');
SELECT pg_temp.check('NEWS2: a medium set (6) raises a ward-doctor escalation',
  (SELECT count(*) = 1 FROM inpatient.escalation WHERE admission_id = pg_temp.f('adm1') AND level = 2 AND paged_role = 'ward_doctor' AND news_score = 6));
SELECT pg_temp.expect_fail('NEWS2: a vital set cannot be edited (only the error flag)',
  format($q$UPDATE inpatient.vital_set SET pulse = 80 WHERE admission_id = %L$q$, pg_temp.f('adm1')), 'CF002');
SELECT pg_temp.expect_fail('NEWS2: a vital set cannot be deleted',
  format($q$DELETE FROM inpatient.vital_set WHERE admission_id = %L$q$, pg_temp.f('adm1')), 'CF001');
SELECT pg_temp.expect_fail('NEWS2: a set for another patient than the admission is refused',
  format($q$INSERT INTO inpatient.vital_set (admission_id, patient_person_id, recorded_by_user_id, resp_rate, spo2, systolic, pulse, temp_c)
            VALUES (%L, %L, %L, 16, 98, 120, 70, 37.0)$q$, pg_temp.f('adm1'), pg_temp.f('citB_p'), pg_temp.f('staff_u')), 'CF100');

INSERT INTO inpatient.med_order (admission_id, patient_person_id, medicine_id, dose, frequency, ordered_by_user_id)
VALUES (pg_temp.f('adm1'), pg_temp.f('ipP_p'), pg_temp.f('medicine'), '500 mg', 'TDS', pg_temp.f('docH_u'));
INSERT INTO fx SELECT 'morder', id FROM inpatient.med_order WHERE admission_id = pg_temp.f('adm1');
SELECT pg_temp.expect_fail('MAR: a withheld dose without a reason is refused',
  format($q$INSERT INTO inpatient.med_administration (med_order_id, admission_id, patient_person_id, due_at, outcome, nurse_user_id)
            VALUES (%L, %L, %L, now(), 'withheld', %L)$q$, pg_temp.f('morder'), pg_temp.f('adm1'), pg_temp.f('ipP_p'), pg_temp.f('staff_u')), '23514');
INSERT INTO inpatient.med_administration (med_order_id, admission_id, patient_person_id, due_at, outcome, reason, nurse_user_id)
VALUES (pg_temp.f('morder'), pg_temp.f('adm1'), pg_temp.f('ipP_p'), now(), 'withheld', 'BP low', pg_temp.f('staff_u'));
SELECT pg_temp.check('MAR: a withheld dose with a reason is recorded', (SELECT count(*) = 1 FROM inpatient.med_administration WHERE reason = 'BP low'));
SELECT pg_temp.expect_fail('MAR: the administration record cannot be edited',
  $q$UPDATE inpatient.med_administration SET reason = 'x'$q$, 'CF001');
SELECT pg_temp.expect_fail('MAR: an administration for another patient than the order is refused',
  format($q$INSERT INTO inpatient.med_administration (med_order_id, admission_id, patient_person_id, due_at, outcome, reason, nurse_user_id)
            VALUES (%L, %L, %L, now() + interval '1 hour', 'refused', 'x', %L)$q$, pg_temp.f('morder'), pg_temp.f('adm1'), pg_temp.f('citB_p'), pg_temp.f('staff_u')), 'CF100');

INSERT INTO org.shift_handover (hospital_id, unit_kind, unit_name, from_user_id, summary)
VALUES (pg_temp.f('hospital'), 'ward', 'Ward 3', pg_temp.f('staff_u'), 'Bed 7 watch');
UPDATE org.shift_handover SET summary = 'Bed 7 watch, repeat obs 18:00' WHERE unit_name = 'Ward 3';
UPDATE org.shift_handover SET signed_at = now(), signed_by_user_id = pg_temp.f('lab_u') WHERE unit_name = 'Ward 3';
SELECT pg_temp.expect_fail('HANDOVER: a signed handover cannot change',
  $q$UPDATE org.shift_handover SET summary = 'rewritten' WHERE unit_name = 'Ward 3'$q$, 'CF001');
SELECT pg_temp.expect_fail('HANDOVER: a handover cannot be deleted',
  $q$DELETE FROM org.shift_handover WHERE unit_name = 'Ward 3'$q$, 'CF001');

-- ---------------- 15. Pharmacy operations ----------------
SELECT pg_temp.check('PHARMACY: prescriptions get an RX-DEMO number by default',
  (SELECT rx_number ~ '^RX-DEMO-[0-9]+$' FROM pharmacy.prescription WHERE id = pg_temp.f('rx')));
INSERT INTO pharmacy.medicine (generic_name, form, strength) VALUES ('Zedomycin', 'tablet', '100 mg');
INSERT INTO fx SELECT 'med2', id FROM pharmacy.medicine WHERE generic_name = 'Zedomycin';
INSERT INTO pharmacy.stock_item (pharmacy_id, medicine_id, batch_no, expiry_date, quantity, unit_price) VALUES
  (pg_temp.f('pharmacy'), pg_temp.f('med2'), 'ZA', current_date + 30,  100, 2),
  (pg_temp.f('pharmacy'), pg_temp.f('med2'), 'ZB', current_date + 200, 100, 2),
  (pg_temp.f('pharmacy'), pg_temp.f('med2'), 'RC-1', current_date + 100, 20, 2);
INSERT INTO fx SELECT 'stockA', id FROM pharmacy.stock_item WHERE batch_no = 'ZA' AND medicine_id = pg_temp.f('med2');
INSERT INTO fx SELECT 'stockB', id FROM pharmacy.stock_item WHERE batch_no = 'ZB' AND medicine_id = pg_temp.f('med2');
INSERT INTO fx SELECT 'stockC', id FROM pharmacy.stock_item WHERE batch_no = 'RC-1' AND medicine_id = pg_temp.f('med2');

INSERT INTO pharmacy.stock_movement (pharmacy_id, stock_item_id, movement_type, quantity_delta, by_user_id)
VALUES (pg_temp.f('pharmacy'), pg_temp.f('stockB'), 'receipt', 50, pg_temp.f('phar_u'));
SELECT pg_temp.check('STOCK: a receipt movement adds to the batch (100 -> 150)',
  (SELECT quantity = 150 FROM pharmacy.stock_item WHERE id = pg_temp.f('stockB')));
SELECT pg_temp.expect_fail('STOCK: a write-off without a reason is refused',
  format($q$INSERT INTO pharmacy.stock_movement (pharmacy_id, stock_item_id, movement_type, quantity_delta) VALUES (%L, %L, 'write_off', -5)$q$,
         pg_temp.f('pharmacy'), pg_temp.f('stockB')), '23514');
SELECT pg_temp.expect_fail('STOCK: a movement that would take the batch below zero is refused',
  format($q$INSERT INTO pharmacy.stock_movement (pharmacy_id, stock_item_id, movement_type, quantity_delta, reason) VALUES (%L, %L, 'write_off', -1000, 'expired')$q$,
         pg_temp.f('pharmacy'), pg_temp.f('stockB')), '23514');
SELECT pg_temp.expect_fail('STOCK: the ledger cannot be edited',
  $q$UPDATE pharmacy.stock_movement SET quantity_delta = 1$q$, 'CF001');

-- A prescription with three lines for Zedomycin (the third has a schedule for the dose log)
INSERT INTO records.document (patient_person_id, folder_id, title, doc_type, storage_key, sha256, enc_key_id, created_by_user_id, session_id)
SELECT pg_temp.f('citA_p'), f.id, 'Rx N', 'prescription', 'rx/n.pdf', digest('rxn', 'sha256'), 'k1', pg_temp.f('docH_u'), pg_temp.f('sessA')
FROM records.folder f WHERE f.patient_person_id = pg_temp.f('citA_p') AND f.kind = 'doctor_uploads';
INSERT INTO pharmacy.prescription (patient_person_id, doctor_user_id, session_id, hospital_id, valid_until, document_id, signature_method, signature_ref, qr_token)
SELECT pg_temp.f('citA_p'), pg_temp.f('docH_u'), pg_temp.f('sessA'), pg_temp.f('hospital'), now() + interval '30 days', d.id, 'mock', 'MOCK', 'QR-N-1'
FROM records.document d WHERE d.title = 'Rx N';
INSERT INTO fx SELECT 'rxN', id FROM pharmacy.prescription WHERE qr_token = 'QR-N-1';
INSERT INTO pharmacy.prescription_item (prescription_id, medicine_id, dose, frequency, duration_days, quantity)
VALUES (pg_temp.f('rxN'), pg_temp.f('med2'), '100 mg', 'OD', 10, 10), (pg_temp.f('rxN'), pg_temp.f('med2'), '100 mg', 'OD', 10, 10);
INSERT INTO pharmacy.prescription_item (prescription_id, medicine_id, dose, frequency, duration_days, quantity, schedule_times, with_food)
VALUES (pg_temp.f('rxN'), pg_temp.f('med2'), '100 mg', 'BD', 3, 6, '{08:00,20:00}', 'after');
INSERT INTO fx SELECT 'itemN1', (SELECT id FROM pharmacy.prescription_item WHERE prescription_id = pg_temp.f('rxN') AND schedule_times = '{}' ORDER BY id LIMIT 1);
INSERT INTO fx SELECT 'itemN2', (SELECT id FROM pharmacy.prescription_item WHERE prescription_id = pg_temp.f('rxN') AND schedule_times = '{}' ORDER BY id DESC LIMIT 1);
INSERT INTO fx SELECT 'itemN3', (SELECT id FROM pharmacy.prescription_item WHERE prescription_id = pg_temp.f('rxN') AND schedule_times <> '{}');

SELECT pg_temp.expect_fail('FEFO: dispensing a later-expiring batch while an earlier one is available needs a reason',
  format($q$INSERT INTO pharmacy.dispensing (prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id)
            VALUES (%L, %L, %L, 'dispensed', 5, %L)$q$, pg_temp.f('itemN1'), pg_temp.f('pharmacy'), pg_temp.f('phar_u'), pg_temp.f('stockB')), 'CF133');
INSERT INTO pharmacy.dispensing (prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id, batch_override_reason)
VALUES (pg_temp.f('itemN1'), pg_temp.f('pharmacy'), pg_temp.f('phar_u'), 'dispensed', 5, pg_temp.f('stockB'), 'Earlier batch is a damaged carton');
SELECT pg_temp.check('FEFO: with an override reason the dispense succeeds and stock goes 150 -> 145',
  (SELECT quantity = 145 FROM pharmacy.stock_item WHERE id = pg_temp.f('stockB')));
SELECT pg_temp.check('STOCK: a dispense writes a ledger row (-5)',
  (SELECT count(*) = 1 FROM pharmacy.stock_movement WHERE stock_item_id = pg_temp.f('stockB') AND movement_type = 'dispense' AND quantity_delta = -5));
UPDATE pharmacy.stock_item SET blocked_reason = 'Recall RN-TEST', blocked_at = now() WHERE id = pg_temp.f('stockA');
SELECT pg_temp.expect_fail('RECALL: a blocked batch cannot be dispensed',
  format($q$INSERT INTO pharmacy.dispensing (prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id)
            VALUES (%L, %L, %L, 'dispensed', 2, %L)$q$, pg_temp.f('itemN2'), pg_temp.f('pharmacy'), pg_temp.f('phar_u'), pg_temp.f('stockA')), 'CF132');
SELECT pg_temp.check('RECALL: a blocked batch disappears from the public stock finder',
  (SELECT quantity = 165 FROM pharmacy.v_stock_status WHERE medicine_id = pg_temp.f('med2')));   -- ZB 145 + RC-1 20; blocked ZA left out
INSERT INTO pharmacy.drug_recall (recall_ref, source, medicine_id, medicine_name, batch_no, title)
VALUES ('CDSCO-N-1', 'CDSCO', pg_temp.f('med2'), 'Zedomycin 100 mg', 'RC-1', 'Test recall');
INSERT INTO fx SELECT 'recall1', id FROM pharmacy.drug_recall WHERE recall_ref = 'CDSCO-N-1';
SELECT pg_temp.act('docH');
SELECT pg_temp.expect_fail('RECALL: a doctor cannot apply a recall',
  format($q$SELECT pharmacy.apply_recall(%L)$q$, pg_temp.f('recall1')), 'CF131');
SELECT set_config('app.user_id', '', true), set_config('app.account_type', '', true);
SELECT pg_temp.check('RECALL: a system job applies the recall and opens one acknowledgement per pharmacy',
  pharmacy.apply_recall(pg_temp.f('recall1')) = 1);
SELECT pg_temp.check('RECALL: the matching batch is blocked and unpublished',
  (SELECT blocked_reason LIKE 'Recall CDSCO-N-1%' AND NOT is_published FROM pharmacy.stock_item WHERE id = pg_temp.f('stockC')));
SELECT pg_temp.check('RECALL: acknowledgement starts as action_needed',
  (SELECT status = 'action_needed' AND qty_on_shelf = 20 FROM pharmacy.recall_ack WHERE recall_id = pg_temp.f('recall1')));
SELECT pg_temp.expect_fail('RECALL: a recall notice cannot be edited',
  $q$UPDATE pharmacy.drug_recall SET title = 'x'$q$, 'CF001');

INSERT INTO pharmacy.supplier (name, kind) VALUES ('Test KMSCL', 'state_store');
INSERT INTO pharmacy.purchase_order (pharmacy_id, supplier_id, raised_by_user_id)
SELECT pg_temp.f('pharmacy'), id, pg_temp.f('phar_u') FROM pharmacy.supplier WHERE name = 'Test KMSCL';
INSERT INTO fx SELECT 'po1', id FROM pharmacy.purchase_order WHERE raised_by_user_id = pg_temp.f('phar_u');
INSERT INTO pharmacy.po_line (po_id, medicine_id, quantity, unit_cost) VALUES (pg_temp.f('po1'), pg_temp.f('med2'), 1000, 150);
SELECT pg_temp.check('PO: lines keep the order total (1000 x 150 = 150000) and po_number looks like PO-YYYY-NNNN',
  (SELECT total_amount = 150000 AND po_number ~ '^PO-[0-9]{4}-[0-9]{4}$' FROM pharmacy.purchase_order WHERE id = pg_temp.f('po1')));
SELECT pg_temp.expect_fail('PO: an order over Rs 1,00,000 cannot be approved without an approver',
  format($q$UPDATE pharmacy.purchase_order SET status = 'approved' WHERE id = %L$q$, pg_temp.f('po1')), '23514');
SELECT pg_temp.expect_fail('PO: the approver cannot be the person who raised it',
  format($q$UPDATE pharmacy.purchase_order SET status = 'approved', approved_by_user_id = %L WHERE id = %L$q$, pg_temp.f('phar_u'), pg_temp.f('po1')), '23514');
UPDATE pharmacy.purchase_order SET status = 'approved', approved_by_user_id = pg_temp.f('dadm_u'), approved_at = now() WHERE id = pg_temp.f('po1');
SELECT pg_temp.check('PO: a different approver can approve it', (SELECT status = 'approved' FROM pharmacy.purchase_order WHERE id = pg_temp.f('po1')));
SELECT pg_temp.expect_fail('PO: sending an order back needs a reason',
  format($q$UPDATE pharmacy.purchase_order SET status = 'held' WHERE id = %L$q$, pg_temp.f('po1')), '23514');

SELECT pg_temp.check('DOSES: generate_dose_log creates 2 doses x 3 days = 6 slots',
  pharmacy.generate_dose_log(pg_temp.f('itemN3'), current_date) = 6);
SELECT pg_temp.check('DOSES: running it again adds nothing (no duplicates)',
  pharmacy.generate_dose_log(pg_temp.f('itemN3'), current_date) = 0);
UPDATE records.dose_log SET taken_at = now() WHERE id = (SELECT id FROM records.dose_log WHERE prescription_item_id = pg_temp.f('itemN3') ORDER BY scheduled_for LIMIT 1);
SELECT pg_temp.check('DOSES: ticking a dose works and the supply view counts it',
  (SELECT doses_taken = 1 AND units_left = 5 FROM records.v_medicine_supply WHERE prescription_item_id = pg_temp.f('itemN3')));
SELECT pg_temp.expect_fail('DOSES: only tick fields can change',
  format($q$UPDATE records.dose_log SET scheduled_for = now() WHERE prescription_item_id = %L$q$, pg_temp.f('itemN3')), 'CF002');
SELECT pg_temp.expect_fail('DOSES: a dose cannot be both skipped and taken',
  format($q$UPDATE records.dose_log SET skipped = true WHERE taken_at IS NOT NULL AND prescription_item_id = %L$q$, pg_temp.f('itemN3')), '23514');

-- ---------------- 16. Engagement: alerts, complaints, chat, AI chat, reviews ----------------
SELECT pg_temp.expect_fail('ALERTS: an emergency alert cannot be sent without a second approver',
  format($q$INSERT INTO engage.health_alert (issued_by_user_id, scope, severity, category, title, body, status)
            VALUES (%L, 'national', 'emergency', 'heat', 'Heat', 'Stay indoors', 'sent')$q$, pg_temp.f('dadm_u')), '23514');
INSERT INTO engage.health_alert (issued_by_user_id, scope, severity, category, title, body, status)
VALUES (pg_temp.f('dadm_u'), 'national', 'emergency', 'heat', 'Heat draft', 'Stay indoors', 'pending_second_approval');
SELECT pg_temp.check('ALERTS: the same alert can wait for the second approver', (SELECT count(*) = 1 FROM engage.health_alert WHERE title = 'Heat draft'));
SELECT pg_temp.expect_fail('ALERTS: the second approver cannot be the issuer',
  format($q$UPDATE engage.health_alert SET status = 'sent', second_approver_user_id = %L, second_approved_at = now() WHERE title = 'Heat draft'$q$, pg_temp.f('dadm_u')), '23514');
UPDATE engage.health_alert SET status = 'sent', second_approver_user_id = pg_temp.f('znA_u'), second_approved_at = now() WHERE title = 'Heat draft';
SELECT pg_temp.check('ALERTS: with a different second approver it goes out, and citizens are recipients',
  (SELECT count(*) = 1 FROM engage.v_alert_recipients_rule r JOIN engage.health_alert a ON a.id = r.alert_id
    WHERE a.title = 'Heat draft' AND r.user_id = pg_temp.f('citA_u')));
SELECT pg_temp.expect_fail('ALERTS: emergency alerts cannot be switched off in notification preferences',
  format($q$INSERT INTO engage.notification_pref (user_id, category, channel, enabled) VALUES (%L, 'emergency', 'sms', false)$q$, pg_temp.f('citA_u')), '23514');

INSERT INTO engage.complaint (raised_by_person_id, about_type, about_id, district_id, body, category, severity)
VALUES (pg_temp.f('citA_p'), 'hospital', pg_temp.f('hospital'), pg_temp.f('district'), 'Long OP wait', 'op_services', 'normal');
SELECT pg_temp.check('COMPLAINT: ref number CMP-NNNN and a 7-day reply deadline are set',
  (SELECT ref_no ~ '^CMP-[0-9]{4}$' AND due_at = created_at + interval '7 days' FROM engage.complaint WHERE body = 'Long OP wait'));
SELECT pg_temp.check('COMPLAINT: the timeline starts with a "filed" event',
  (SELECT count(*) = 1 FROM engage.complaint_event e JOIN engage.complaint c ON c.id = e.complaint_id WHERE c.body = 'Long OP wait' AND e.kind = 'filed'));
UPDATE engage.complaint SET status = 'assigned' WHERE body = 'Long OP wait';
SELECT pg_temp.check('COMPLAINT: a status change adds a timeline event',
  (SELECT count(*) = 2 FROM engage.complaint_event e JOIN engage.complaint c ON c.id = e.complaint_id WHERE c.body = 'Long OP wait'));
SELECT pg_temp.expect_fail('COMPLAINT: resolving needs a resolved time',
  $q$UPDATE engage.complaint SET status = 'resolved' WHERE body = 'Long OP wait'$q$, '23514');
SELECT pg_temp.expect_fail('COMPLAINT: timeline events cannot be edited',
  $q$UPDATE engage.complaint_event SET text = 'x'$q$, 'CF001');

SELECT pg_temp.expect_fail('CHAT: a pharmacist thread must name a patient',
  format($q$INSERT INTO engage.chat_thread (thread_type, pharmacy_id) VALUES ('pharmacist', %L)$q$, pg_temp.f('pharmacy')), '23514');
INSERT INTO engage.chat_thread (thread_type, patient_person_id, pharmacy_id) VALUES ('pharmacist', pg_temp.f('citA_p'), pg_temp.f('pharmacy'));
SELECT pg_temp.check('CHAT: pharmacist threads are accepted', (SELECT count(*) = 1 FROM engage.chat_thread WHERE thread_type = 'pharmacist'));

INSERT INTO ai.chat_session (patient_person_id, kind, started_by_user_id) VALUES (pg_temp.f('citA_p'), 'citizen_guidance', pg_temp.f('citA_u'));
INSERT INTO fx SELECT 'aichat', id FROM ai.chat_session WHERE patient_person_id = pg_temp.f('citA_p');
INSERT INTO ai.chat_message (session_id, role, body_enc, enc_key_id) VALUES (pg_temp.f('aichat'), 'user', '\x01', 'k1'), (pg_temp.f('aichat'), 'assistant', '\x02', 'k1');
SELECT pg_temp.check('AICHAT: messages get sequence numbers 1,2 and the session counts them',
  (SELECT array_agg(seq ORDER BY seq) = ARRAY[1,2] FROM ai.chat_message WHERE session_id = pg_temp.f('aichat'))
  AND (SELECT message_count = 2 AND is_simulated FROM ai.chat_session WHERE id = pg_temp.f('aichat')));
SELECT pg_temp.expect_fail('AICHAT: chat messages cannot be edited',
  $q$UPDATE ai.chat_message SET red_flag = true$q$, 'CF001');
SELECT pg_temp.expect_fail('AICHAT: a clinical-assist chat needs a doctor session',
  format($q$INSERT INTO ai.chat_session (patient_person_id, kind, started_by_user_id) VALUES (%L, 'clinical_assist', %L)$q$, pg_temp.f('citA_p'), pg_temp.f('docH_u')), '23514');
SET ROLE cf_app;
SELECT pg_temp.act('citB');
SELECT pg_temp.check('AICHAT: another citizen cannot read the chat',
  (SELECT count(*) = 0 FROM ai.chat_session) AND (SELECT count(*) = 0 FROM ai.chat_message));
SELECT pg_temp.act('citA');
SELECT pg_temp.check('AICHAT: the owner reads the chat',
  (SELECT count(*) = 2 FROM ai.chat_message));
RESET ROLE;

INSERT INTO ai.ai_run (patient_person_id, tool, folder_id, run_by_user_id, session_id, input_enc, output_enc, enc_key_id,
                       model_name, model_version, is_simulated, status, started_at, finished_at, result_sha256)
SELECT pg_temp.f('citA_p'), 'image', f.id, pg_temp.f('docH_u'), pg_temp.f('sessA'), '\x01', '\x02', 'k1', 'sim-vision', '0.1', true, 'completed', now(), now(), digest('r2', 'sha256')
FROM records.folder f WHERE f.patient_person_id = pg_temp.f('citA_p') AND f.kind = 'image_analysis';
INSERT INTO fx SELECT 'runN', id FROM ai.ai_run WHERE patient_person_id = pg_temp.f('citA_p');
SELECT pg_temp.expect_fail('AIREVIEW: an "edited" verdict needs the edited text',
  format($q$INSERT INTO ai.ai_review (run_id, doctor_user_id, verdict, reason) VALUES (%L, %L, 'edited', 'changed')$q$, pg_temp.f('runN'), pg_temp.f('docH_u')), '23514');
SELECT pg_temp.expect_fail('AIREVIEW: edited text with an "agree" verdict is refused',
  format($q$INSERT INTO ai.ai_review (run_id, doctor_user_id, verdict, reason, edited_text) VALUES (%L, %L, 'agree', 'ok', 'text')$q$, pg_temp.f('runN'), pg_temp.f('docH_u')), '23514');
INSERT INTO ai.ai_review (run_id, doctor_user_id, verdict, reason, edited_text)
VALUES (pg_temp.f('runN'), pg_temp.f('docH_u'), 'edited', 'Finding adjusted', 'Mild change, repeat in 2 weeks');
SELECT pg_temp.check('AIREVIEW: an edited verdict with text is stored',
  (SELECT verdict::text = 'edited' FROM ai.ai_review WHERE run_id = pg_temp.f('runN')));

INSERT INTO engage.op_visit (hospital_id, patient_person_id, token_no, status) VALUES (pg_temp.f('hospital'), pg_temp.f('citA_p'), 1, 'booked');
INSERT INTO fx SELECT 'visit1', id FROM engage.op_visit WHERE patient_person_id = pg_temp.f('citA_p');
SELECT pg_temp.expect_fail('REVIEW: a rating tied to a visit that is not done is refused',
  format($q$INSERT INTO engage.rating (rater_person_id, target_type, target_id, stars, op_visit_id) VALUES (%L, 'hospital', %L, 5, %L)$q$,
         pg_temp.f('citA_p'), pg_temp.f('hospital'), pg_temp.f('visit1')), 'CF101');
UPDATE engage.op_visit SET status = 'done' WHERE id = pg_temp.f('visit1');
INSERT INTO engage.rating (rater_person_id, target_type, target_id, stars, op_visit_id) VALUES (pg_temp.f('citA_p'), 'hospital', pg_temp.f('hospital'), 5, pg_temp.f('visit1'));
SELECT pg_temp.check('REVIEW: a rating tied to a completed visit is marked visit-verified',
  (SELECT visit_verified FROM engage.rating WHERE rater_person_id = pg_temp.f('citA_p') AND target_type = 'hospital'));
SELECT pg_temp.expect_fail('OP VISIT: two visits cannot share a token for the same doctor and day',
  format($q$INSERT INTO engage.op_visit (hospital_id, patient_person_id, token_no) VALUES (%L, %L, 1)$q$, pg_temp.f('hospital'), pg_temp.f('citB_p')), '23505');

-- ---------------- 17. Donation and organ pledge ----------------
INSERT INTO donation.organ_type (code, name, kind) VALUES ('ztest_kidney', 'Kidney (test)', 'organ'), ('ztest_cornea', 'Cornea (test)', 'tissue') ON CONFLICT DO NOTHING;
SELECT pg_temp.expect_fail('ORGAN: an unknown organ is refused',
  format($q$INSERT INTO donation.organ_pledge (person_id, organs) VALUES (%L, '{unobtainium}')$q$, pg_temp.f('citA_p')), 'CF151');
INSERT INTO donation.organ_pledge (person_id, organs) VALUES (pg_temp.f('citA_p'), '{ztest_kidney}');
SELECT pg_temp.check('ORGAN: a pledge can start at the intent step with no hospital, doctor or document',
  (SELECT status = 'intent' AND hospital_id IS NULL AND document_id IS NULL FROM donation.organ_pledge WHERE person_id = pg_temp.f('citA_p')));
SELECT pg_temp.expect_fail('ORGAN: registering needs 2 signed witnesses (none yet)',
  format($q$UPDATE donation.organ_pledge SET status = 'registered', hospital_id = %L, witnessing_doctor_user_id = %L, document_id = %L
            WHERE person_id = %L$q$, pg_temp.f('hospital'), pg_temp.f('docH_u'), pg_temp.f('doc_gen'), pg_temp.f('citA_p')), 'CF150');
INSERT INTO donation.organ_witness (pledge_id, full_name, relation, is_relative, signed_at)
SELECT id, 'Ravi', 'husband', true, now() FROM donation.organ_pledge WHERE person_id = pg_temp.f('citA_p');
INSERT INTO donation.organ_witness (pledge_id, full_name, relation, is_relative)
SELECT id, 'Neighbour', 'neighbour', false FROM donation.organ_pledge WHERE person_id = pg_temp.f('citA_p');
SELECT pg_temp.expect_fail('ORGAN: one signed and one unsigned witness is still not enough',
  format($q$UPDATE donation.organ_pledge SET status = 'registered', hospital_id = %L, witnessing_doctor_user_id = %L, document_id = %L
            WHERE person_id = %L$q$, pg_temp.f('hospital'), pg_temp.f('docH_u'), pg_temp.f('doc_gen'), pg_temp.f('citA_p')), 'CF150');
UPDATE donation.organ_witness SET signed_at = now() WHERE full_name = 'Neighbour';
UPDATE donation.organ_pledge SET status = 'registered', hospital_id = pg_temp.f('hospital'), witnessing_doctor_user_id = pg_temp.f('docH_u'),
       document_id = pg_temp.f('doc_gen') WHERE person_id = pg_temp.f('citA_p');
SELECT pg_temp.check('ORGAN: with 2 signed witnesses including a relative the pledge registers',
  (SELECT status = 'registered' FROM donation.organ_pledge WHERE person_id = pg_temp.f('citA_p')));
SELECT pg_temp.expect_fail('ORGAN: after registering the organ list can no longer change',
  format($q$UPDATE donation.organ_pledge SET organs = '{ztest_cornea}' WHERE person_id = %L$q$, pg_temp.f('citA_p')), 'CF002');
INSERT INTO donation.organ_pledge (person_id, organs) VALUES (pg_temp.f('citB_p'), '{ztest_cornea}');
INSERT INTO donation.organ_witness (pledge_id, full_name, relation, is_relative, signed_at)
SELECT id, w, 'friend', false, now() FROM donation.organ_pledge, (VALUES ('Friend 1'), ('Friend 2')) t(w) WHERE person_id = pg_temp.f('citB_p');
SELECT pg_temp.expect_fail('ORGAN: two signed witnesses who are not relatives are not enough',
  format($q$UPDATE donation.organ_pledge SET status = 'registered', hospital_id = %L, witnessing_doctor_user_id = %L, document_id = %L
            WHERE person_id = %L$q$, pg_temp.f('hospital'), pg_temp.f('docH_u'), pg_temp.f('doc_gen'), pg_temp.f('citB_p')), 'CF150');
SELECT pg_temp.act('docH_b');
SELECT pg_temp.expect_fail('ORGAN: a doctor who is not a designated coordinator cannot look up a pledge',
  format($q$SELECT * FROM donation.lookup_organ_pledge(%L, 'CERT-1', 'Brain-stem death confirmed')$q$, pg_temp.f('citA_p')), 'CF152');
INSERT INTO donation.transplant_centre (name, state_id, organs) VALUES ('Test Transplant Centre', 33, '{ztest_kidney}');
INSERT INTO donation.transplant_coordinator (user_id, centre_id, designated_by_user_id)
SELECT pg_temp.f('docH_b_u'), id, pg_temp.f('dadm_u') FROM donation.transplant_centre WHERE name = 'Test Transplant Centre';
SELECT pg_temp.check('ORGAN: a designated coordinator gets the pledge',
  (SELECT count(*) = 1 FROM donation.lookup_organ_pledge(pg_temp.f('citA_p'), 'CERT-1', 'Brain-stem death confirmed')));
SELECT pg_temp.check('ORGAN: the lookup is logged with the certificate reference',
  (SELECT count(*) = 1 FROM donation.organ_lookup_log WHERE person_id = pg_temp.f('citA_p') AND death_certificate_ref = 'CERT-1'));
SELECT pg_temp.expect_fail('ORGAN: a lookup needs a real reason',
  format($q$SELECT * FROM donation.lookup_organ_pledge(%L, 'CERT-2', 'x')$q$, pg_temp.f('citA_p')), '23514');

SELECT pg_temp.expect_fail('BLOOD: a donation needs a hospital or a camp',
  format($q$INSERT INTO donation.blood_donation (donor_person_id, donated_at, hospital_id, recorded_by_user_id) VALUES (%L, now(), NULL, %L)$q$,
         pg_temp.f('citA_p'), pg_temp.f('docH_u')), '23514');
INSERT INTO donation.blood_camp (name, district_id, venue, starts_at, ends_at) VALUES ('Test camp', pg_temp.f('district'), 'Town hall', now(), now() + interval '6 hours');
INSERT INTO donation.blood_donation (donor_person_id, donated_at, camp_id, recorded_by_user_id, donation_type, hb_value)
SELECT pg_temp.f('citA_p'), now(), id, pg_temp.f('docH_u'), 'platelets', 13.5 FROM donation.blood_camp WHERE name = 'Test camp';
SELECT pg_temp.check('BLOOD: a camp donation is accepted, gets a donor code and switches the donor off',
  (SELECT donor_code LIKE 'DEMO-BD-KL-%' AND NOT ready FROM donation.blood_donor WHERE person_id = pg_temp.f('citA_p')));
INSERT INTO donation.blood_bank (name, district_id) VALUES ('Test bank', pg_temp.f('district'));
INSERT INTO donation.blood_stock_reading (bank_id, blood_group, units, daily_use_units)
SELECT id, g::identity.blood_group, 6, 2 FROM donation.blood_bank, (VALUES ('B+'), ('O-')) t(g) WHERE name = 'Test bank';
SELECT pg_temp.check('BLOOD: days of cover = units / daily use (3.0 days = low)',
  (SELECT days_cover = 3.0 AND level = 'low' FROM report.v_blood_cover WHERE district_id = pg_temp.f('district') AND blood_group = 'B+'));

-- ---------------- 18. Break-glass, unidentified patients, access views ----------------
SELECT pg_temp.expect_fail('BREAK-GLASS: a reason shorter than 20 characters is refused',
  format($q$INSERT INTO access.emergency_access (session_id, break_glass_reason) VALUES (%L, 'too short')$q$, pg_temp.f('sessBG')), '23514');
INSERT INTO access.emergency_access (session_id, break_glass_reason, reason_category, match_method, evidence_note)
VALUES (pg_temp.f('sessBG'), 'Unconscious on arrival, no key, family unreachable', 'unconscious', 'face_and_fingerprint', 'Casualty register C-1');
SELECT pg_temp.check('BREAK-GLASS: the hospital review has a 72 h window',
  (SELECT hospital_due_at - now() BETWEEN interval '71 hours' AND interval '73 hours' AND hospital_review_status::text = 'pending'
   FROM access.emergency_access WHERE session_id = pg_temp.f('sessBG')));
SELECT pg_temp.expect_fail('BREAK-GLASS: the confirming doctor cannot be the doctor who opened it',
  format($q$UPDATE access.emergency_access SET second_doctor_user_id = %L, second_doctor_at = now() WHERE session_id = %L$q$,
         pg_temp.f('docH_u'), pg_temp.f('sessBG')), 'CF161');
SELECT pg_temp.expect_fail('BREAK-GLASS: the confirming person must be a doctor',
  format($q$UPDATE access.emergency_access SET second_doctor_user_id = %L, second_doctor_at = now() WHERE session_id = %L$q$,
         pg_temp.f('lab_u'), pg_temp.f('sessBG')), 'CF161');
UPDATE access.emergency_access SET second_doctor_user_id = pg_temp.f('docH_b_u'), second_doctor_at = now() WHERE session_id = pg_temp.f('sessBG');
SELECT pg_temp.check('BREAK-GLASS: a different doctor can confirm',
  (SELECT second_doctor_user_id = pg_temp.f('docH_b_u') FROM access.emergency_access WHERE session_id = pg_temp.f('sessBG')));
INSERT INTO access.item_view (session_id, patient_person_id, user_id, item_kind, label)
VALUES (pg_temp.f('sessBG'), pg_temp.f('citB_p'), pg_temp.f('docH_u'), 'emergency_card', 'Emergency card');
SET ROLE cf_app;
SELECT pg_temp.act('hadmH');
SELECT pg_temp.check('BREAK-GLASS: hospital admin sees the case with what was viewed',
  (SELECT count(*) = 1 AND bool_and(viewed::text LIKE '%Emergency card%') FROM access.v_break_glass_review));
SELECT pg_temp.act('hadmH2');
SELECT pg_temp.check('BREAK-GLASS: admin of another hospital sees nothing',
  (SELECT count(*) = 0 FROM access.v_break_glass_review));
SELECT pg_temp.expect_fail('BREAK-GLASS: admin of another hospital cannot review it',
  format($q$SELECT access.hospital_review(%L, 'ok', 'fine')$q$, pg_temp.f('sessBG')), 'CF160');
SELECT pg_temp.act('docH_b');
SELECT pg_temp.expect_fail('BREAK-GLASS: a doctor cannot do the hospital review',
  format($q$SELECT access.hospital_review(%L, 'ok', 'fine')$q$, pg_temp.f('sessBG')), 'CF160');
SELECT pg_temp.act('hadmH');
SELECT access.hospital_review(pg_temp.f('sessBG'), 'ok', 'Justified, casualty case');
SELECT pg_temp.check('BREAK-GLASS: the hospital admin records "justified"',
  (SELECT hospital_review_status::text = 'ok' FROM access.v_break_glass_review));
SELECT pg_temp.expect_fail('BREAK-GLASS: a case is reviewed once',
  format($q$SELECT access.hospital_review(%L, 'misuse', 'again')$q$, pg_temp.f('sessBG')), 'CF160');
RESET ROLE;

SELECT pg_temp.expect_fail('UNIDENTIFIED: an unidentified person needs a temporary label and an estimated age',
  $q$INSERT INTO identity.person (full_name, date_of_birth, sex, is_unidentified) VALUES ('Unknown', '1980-01-01', 'male', true)$q$, '23514');
INSERT INTO identity.person (full_name, date_of_birth, sex, is_unidentified, temp_label, dob_estimated)
VALUES ('Unknown male ~45', '1981-01-01', 'male', true, 'Unknown male ~45 (DEMO-0000-5512)', true);
SELECT pg_temp.check('UNIDENTIFIED: a proper unidentified person is accepted',
  (SELECT count(*) = 1 FROM identity.person WHERE is_unidentified));

-- Scoped audit rows
SELECT pg_temp.act('lab');
SELECT audit.log_scoped('lab.upload', p_hospital := pg_temp.f('hospital'), p_patient := pg_temp.f('citA_p'),
                        p_details := '{"how":"Lab order ORD-DEMO-6001","saw":"Upload only"}', p_stream := 34::smallint);
SELECT pg_temp.check('AUDIT: log_scoped writes the hospital column and a hashed copy in details',
  (SELECT hospital_id = pg_temp.f('hospital') AND details #>> '{scope,hospital}' = pg_temp.f('hospital')::text
   FROM audit.activity_log WHERE stream_id = 34 AND action = 'lab.upload'));
SELECT pg_temp.check('AUDIT: the scope columns match the hashed copy and the chain verifies',
  audit.check_scope_columns(34::smallint) IS NULL AND audit.verify_chain(34::smallint) IS NULL);
SET ROLE cf_app;
SELECT pg_temp.act('hadmH');
SELECT pg_temp.check('AUDIT: hospital admin reads the hospital''s log rows without patient identity',
  (SELECT count(*) = 1 FROM audit.v_scoped_log WHERE action = 'lab.upload')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'audit' AND table_name = 'v_scoped_log' AND column_name IN ('patient_person_id', 'ip', 'gps_point')));
SELECT pg_temp.act('hadmH2');
SELECT pg_temp.check('AUDIT: admin of another hospital sees none of it',
  (SELECT count(*) = 0 FROM audit.v_scoped_log WHERE action = 'lab.upload'));
SELECT pg_temp.act('citA');
SELECT pg_temp.check('AUDIT: the citizen sees the lab upload on their record',
  (SELECT count(*) = 1 FROM access.v_order_access_history WHERE action = 'lab.upload' AND saw = 'Upload only'));
SELECT pg_temp.act('citB');
SELECT pg_temp.check('AUDIT: another citizen does not see it',
  (SELECT count(*) = 0 FROM access.v_order_access_history));
RESET ROLE;
INSERT INTO audit.flagged_event (rule, event_text, status, reviewed_by_user_id, reviewed_at, escalated_to_level)
VALUES ('many_break_glass', 'x', 'escalated', pg_temp.f('dadm_u'), now(), 'state');
SELECT pg_temp.expect_fail('AUDIT: an escalated flag needs a target level',
  $q$INSERT INTO audit.flagged_event (rule, event_text, status, reviewed_by_user_id, reviewed_at) VALUES ('r', 'x', 'escalated', NULL, now())$q$, '23514');

-- ---------------- 19. Admin console data ----------------
INSERT INTO admin.platform_flag (code, label, enabled) VALUES ('ztest_flag', 'Test flag', false);
SELECT pg_temp.act('cenA');
UPDATE admin.platform_flag SET enabled = true WHERE code = 'ztest_flag';
SELECT pg_temp.check('FLAGS: switching a platform flag writes a history row with who changed it',
  (SELECT count(*) = 1 AND bool_and(enabled) AND bool_and(changed_by_user_id = pg_temp.f('cenA_u')) FROM admin.platform_flag_history WHERE flag_code = 'ztest_flag'));
SELECT pg_temp.expect_fail('FLAGS: flag history cannot be edited',
  $q$UPDATE admin.platform_flag_history SET enabled = false$q$, 'CF001');
SELECT pg_temp.expect_fail('FLAGS: the second confirmer cannot be the same person',
  format($q$INSERT INTO admin.platform_flag_history (flag_code, enabled, changed_by_user_id, second_confirm_by) VALUES ('ztest_flag', true, %L, %L)$q$,
         pg_temp.f('cenA_u'), pg_temp.f('cenA_u')), '23514');

INSERT INTO ai.model (name, module) VALUES ('Test guidance LLM', 'citizen_guidance_chat');
INSERT INTO ai.model_version (model_id, version, status) SELECT id, v, s FROM ai.model, (VALUES ('3.2', 'live'), ('3.3', 'pending')) t(v, s) WHERE name = 'Test guidance LLM';
INSERT INTO fx SELECT 'mv_live', id FROM ai.model_version WHERE version = '3.2' AND model_id = (SELECT id FROM ai.model WHERE name = 'Test guidance LLM');
INSERT INTO fx SELECT 'mv_new', id FROM ai.model_version WHERE version = '3.3' AND model_id = (SELECT id FROM ai.model WHERE name = 'Test guidance LLM');
INSERT INTO ai.release_request (model_version_id, from_version_id, submitted_by) VALUES (pg_temp.f('mv_new'), pg_temp.f('mv_live'), 'AI safety board');
INSERT INTO fx SELECT 'rel1', id FROM ai.release_request WHERE model_version_id = pg_temp.f('mv_new');
SELECT pg_temp.expect_fail('AI GOVERNANCE: a release without sign-offs is refused',
  format($q$UPDATE ai.release_request SET status = 'released' WHERE id = %L$q$, pg_temp.f('rel1')), 'CF141');
INSERT INTO ai.release_signoff (request_id, approver_user_id, decision) VALUES (pg_temp.f('rel1'), pg_temp.f('cenA_u'), 'approve');
SELECT pg_temp.expect_fail('AI GOVERNANCE: one approval of two is still refused',
  format($q$UPDATE ai.release_request SET status = 'released' WHERE id = %L$q$, pg_temp.f('rel1')), 'CF141');
INSERT INTO ai.release_signoff (request_id, approver_user_id, decision) VALUES (pg_temp.f('rel1'), pg_temp.f('znA_u'), 'approve');
UPDATE ai.release_request SET status = 'released' WHERE id = pg_temp.f('rel1');
SELECT pg_temp.check('AI GOVERNANCE: two approvals allow the release', (SELECT status = 'released' FROM ai.release_request WHERE id = pg_temp.f('rel1')));
SELECT pg_temp.expect_fail('AI GOVERNANCE: sign-offs cannot be changed', $q$UPDATE ai.release_signoff SET decision = 'hold'$q$, 'CF001');
INSERT INTO ai.drift_metric (model_version_id, metric, value, region) VALUES (pg_temp.f('mv_live'), 'drift_pct', 3.0, 'North-east');
SELECT pg_temp.check('AI GOVERNANCE: drift 3 % keeps the live version live',
  (SELECT status = 'live' AND drift_pct = 3.0 FROM ai.model_version WHERE id = pg_temp.f('mv_live')));
INSERT INTO ai.drift_metric (model_version_id, metric, value, region) VALUES (pg_temp.f('mv_live'), 'drift_pct', 6.0, 'North-east');
SELECT pg_temp.check('AI GOVERNANCE: drift 6 % rolls the live version back automatically',
  (SELECT status = 'rolled_back' FROM ai.model_version WHERE id = pg_temp.f('mv_live')));

INSERT INTO admin.permission (code, label, locked) VALUES ('ztest_national', 'National rule', true), ('ztest_local', 'Hospital setting', false);
INSERT INTO admin.role_permission (role_key, permission_code, allowed) VALUES ('doctor', 'ztest_national', true), ('doctor', 'ztest_local', true);
SELECT pg_temp.expect_fail('PERMISSIONS: a hospital cannot override a national rule',
  format($q$INSERT INTO admin.hospital_permission_override (hospital_id, role_key, permission_code, allowed) VALUES (%L, 'doctor', 'ztest_national', false)$q$,
         pg_temp.f('hospital')), 'CF140');
INSERT INTO admin.hospital_permission_override (hospital_id, role_key, permission_code, allowed) VALUES (pg_temp.f('hospital'), 'doctor', 'ztest_local', false);
SELECT pg_temp.check('PERMISSIONS: a hospital setting can be overridden and the effective view shows it',
  (SELECT NOT allowed FROM admin.v_effective_permission WHERE hospital_id = pg_temp.f('hospital') AND permission_code = 'ztest_local')
  AND (SELECT allowed FROM admin.v_effective_permission WHERE hospital_id = pg_temp.f('hospital') AND permission_code = 'ztest_national'));

INSERT INTO admin.report_definition (code, title, frequency) VALUES ('ztest_rep', 'Test report', 'on_demand');
SELECT pg_temp.expect_fail('REPORTS: an export that is not de-identified is refused',
  format($q$INSERT INTO admin.report_export (report_code, requested_by_user_id, level, period_label, format, deidentified) VALUES ('ztest_rep', %L, 'district', 'Last 7 days', 'csv', false)$q$,
         pg_temp.f('dadm_u')), '23514');
INSERT INTO admin.report_export (report_code, requested_by_user_id, level, period_label, format) VALUES ('ztest_rep', pg_temp.f('dadm_u'), 'district', 'Last 7 days', 'csv');
SELECT pg_temp.check('REPORTS: a de-identified export is logged and expires in 30 days',
  (SELECT expires_at - created_at = interval '30 days' FROM admin.report_export WHERE report_code = 'ztest_rep'));
SELECT pg_temp.expect_fail('REPORTS: the export log cannot be edited', $q$UPDATE admin.report_export SET size_bytes = 1$q$, 'CF001');

INSERT INTO org.facility_document (facility_type, pharmacy_id, doc_type, title, reference_no, valid_until)
VALUES ('pharmacy', pg_temp.f('pharmacy'), 'fire_noc', 'Fire NOC', 'DEMO-NOC-1', current_date + 40);
SELECT pg_temp.expect_fail('COMPLIANCE: a document cannot be edited, only its status',
  $q$UPDATE org.facility_document SET title = 'changed'$q$, 'CF002');
UPDATE org.facility_document SET status = 'renew_soon' WHERE doc_type = 'fire_noc';
SELECT pg_temp.check('COMPLIANCE: status can change', (SELECT status = 'renew_soon' FROM org.facility_document WHERE doc_type = 'fire_noc'));
SELECT pg_temp.expect_fail('COMPLIANCE: a hospital document must name a hospital',
  format($q$INSERT INTO org.facility_document (facility_type, pharmacy_id, doc_type, title) VALUES ('hospital', %L, 'x', 'x')$q$, pg_temp.f('pharmacy')), '23514');
SELECT pg_temp.expect_fail('COMPLIANCE: compliance documents cannot be deleted', $q$DELETE FROM org.facility_document$q$, 'CF001');

SELECT pg_temp.expect_fail('INVITES: an invite cannot belong to a hospital and a pharmacy at once',
  format($q$INSERT INTO identity.staff_invite (hospital_id, pharmacy_id, role_kind, full_name, email_hash, token_hash, invited_by_user_id)
            VALUES (%L, %L, 'pharmacist', 'X', digest('a', 'sha256'), digest('t1', 'sha256'), %L)$q$, pg_temp.f('hospital'), pg_temp.f('pharmacy'), pg_temp.f('dadm_u')), '23514');
SELECT pg_temp.expect_fail('INVITES: a pharmacist invite needs a pharmacy',
  format($q$INSERT INTO identity.staff_invite (hospital_id, role_kind, full_name, email_hash, token_hash, invited_by_user_id)
            VALUES (%L, 'pharmacist', 'X', digest('a', 'sha256'), digest('t2', 'sha256'), %L)$q$, pg_temp.f('hospital'), pg_temp.f('dadm_u')), '23514');
INSERT INTO identity.staff_invite (pharmacy_id, role_kind, full_name, email_hash, token_hash, invited_by_user_id)
VALUES (pg_temp.f('pharmacy'), 'pharmacist', 'Anu George', digest('anu', 'sha256'), digest('t3', 'sha256'), pg_temp.f('dadm_u'));
SELECT pg_temp.check('INVITES: a valid pharmacist invite expires in 7 days',
  (SELECT expires_at - created_at = interval '7 days' FROM identity.staff_invite WHERE full_name = 'Anu George'));

-- Approvals: hospital-level approver and "more info"
INSERT INTO admin.approval_request (subject_type, subject_user_id, assigned_level, assigned_district_id, status, due_at)
VALUES ('doctor', pg_temp.f('docH2_u'), 'district', pg_temp.f('district'), 'more_info', now() + interval '7 days');
SELECT pg_temp.check('APPROVALS: "more info" is a valid open status without a decision time',
  (SELECT count(*) = 1 FROM admin.approval_request WHERE status::text = 'more_info' AND decided_at IS NULL));
SELECT pg_temp.expect_fail('APPROVALS: a rejection still needs a decision time',
  format($q$INSERT INTO admin.approval_request (subject_type, subject_user_id, assigned_level, assigned_district_id, status, due_at, reason)
            VALUES ('doctor', %L, 'district', %L, 'rejected', now() + interval '7 days', 'no')$q$, pg_temp.f('docH2_u'), pg_temp.f('district')), '23514');
SELECT pg_temp.expect_fail('APPROVALS: a hospital-level request must name the hospital',
  format($q$INSERT INTO admin.approval_request (subject_type, subject_user_id, assigned_level, status, due_at)
            VALUES ('hospital_staff', %L, 'hospital', 'pending', now() + interval '7 days')$q$, pg_temp.f('docH2_u')), '23514');
INSERT INTO admin.approval_request (subject_type, subject_user_id, assigned_level, assigned_hospital_id, status, due_at)
VALUES ('hospital_staff', pg_temp.f('docH2_u'), 'hospital', pg_temp.f('hospital'), 'pending', now() + interval '7 days');
SELECT pg_temp.check('APPROVALS: a hospital admin can be the approver of a staff request',
  (SELECT count(*) = 1 FROM admin.approval_request WHERE assigned_level::text = 'hospital'));

SELECT pg_temp.expect_fail('FAMILY: a family member who has not accepted cannot show the key',
  format($q$INSERT INTO identity.family_link (citizen_person_id, member_person_id, relation, can_show_key) VALUES (%L, %L, 'husband', true)$q$,
         pg_temp.f('citA_p'), pg_temp.f('citB_p')), '23514');

-- ---------------- Results ----------------
\o
SELECT CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, left(detail, 90) AS detail
FROM t_result ORDER BY passed, name;
SELECT count(*) FILTER (WHERE passed) AS passed, count(*) FILTER (WHERE NOT passed) AS failed FROM t_result;

ROLLBACK;

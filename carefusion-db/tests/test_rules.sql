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

-- ---------------- Results ----------------
\o
SELECT CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, left(detail, 90) AS detail
FROM t_result ORDER BY passed, name;
SELECT count(*) FILTER (WHERE passed) AS passed, count(*) FILTER (WHERE NOT passed) AS failed FROM t_result;

ROLLBACK;

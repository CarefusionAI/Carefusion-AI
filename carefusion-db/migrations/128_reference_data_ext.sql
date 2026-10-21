-- =====================================================================
-- 128_reference_data_ext.sql : reference data for migrations 120-127
--   access rules, platform flag defaults, report catalogue, permission matrix,
--   new approval rules, lab test catalogue + panels, surveillance diseases,
--   organ / tissue list, notification templates, extra blood / rating rules.
-- Everything here is synthetic demo reference data. Rows marked with the warning
-- sign must be verified (clinical / legal) before any real use.
-- Runs after 125 and 126, so the enum values added there are already committed.
-- =====================================================================

-- ---------- Access rules (admin console "Access rules in force") ----------
INSERT INTO admin.access_rule (code, value, description) VALUES
  ('session_minutes',                '30',  'Doctor record session length (minutes)'),
  ('break_glass_window_minutes',     '15',  'Break-glass window for the doctor (minutes)'),
  -- ⚠ Design conflict: citizen screen says the emergency card ends after 60 minutes, doctor screen says 15. Open question for Athun.
  ('emergency_card_session_minutes', '60',  'Emergency-card session length as the citizen screen states it (minutes)'),
  ('break_glass_review_hours',       '72',  'Hospital admin review window for a break-glass use (hours)'),
  ('break_glass_central_verify_hours','24', 'Central verification window for a break-glass use (hours)'),
  ('failed_signins_before_lock',     '5',   'Failed sign-ins before the account locks'),
  ('lock_minutes',                   '15',  'How long a locked account stays locked (minutes)'),
  ('audit_retention_years',          '10',  'Audit log retention (years)'),
  ('access_history_retention_years', '7',   'Citizen access history retention (years)'),
  ('admin_two_person_expiry_hours',  '72',  'A two-person sign-off expires after this many hours without the second signature'),
  ('ai_rollback_drift_pct',          '5',   'A live AI model whose drift passes this percentage is rolled back automatically'),
  ('complaint_reply_days',           '7',   'Days to reply to a citizen complaint before it goes to the district grievance officer'),
  ('small_cell_min',                 '5',   'Counts below this number are hidden in reports and maps'),
  ('po_approval_threshold_inr',      '100000', 'Purchase orders above this amount (INR) need the pharmacy admin''s approval'),
  ('account_deletion_grace_days',    '30',  'Days before a requested account deletion is applied (accounts are deactivated, not deleted)')
ON CONFLICT (code) DO NOTHING;

-- ---------- Platform flags (inventory_admin.md 4.5 System settings) ----------
INSERT INTO admin.platform_flag (code, label, description, enabled) VALUES
  ('maint', 'Maintenance mode', 'Citizens and staff see a notice; only emergency access and break-glass keep working.', false),
  ('ai',    'AI features',      'AI Health Chat, image analysis and doctor assist. Turning off hides AI outputs everywhere.', true),
  ('reg',   'New registrations','Citizen and doctor sign-ups. Existing accounts are not affected.', true),
  ('sms',   'SMS gateway',      'One-time codes and alert SMS to phones without the app.', true),
  ('bg',    'Break-glass access','Emergency access without a citizen key. Needs a reason and is reviewed in 72 h.', true)
ON CONFLICT (code) DO NOTHING;

-- ---------- Report catalogue ----------
INSERT INTO admin.report_definition (code, title, description, frequency, scope_levels) VALUES
  ('health_summary','Monthly health summary',        'Registrations, visits, prescriptions and alerts for the area.', 'monthly',   '{district,state,zonal,central}'),
  ('idsp_weekly',   'Disease surveillance (IDSP format)', 'Weekly case counts by disease; counts under 5 are hidden.', 'weekly',    '{district,state,zonal,central}'),
  ('blood_organ',   'Blood & organ network',         'Blood stock and cover, donors, camps, pledges and waiting lists.', 'weekly',   '{district,state,zonal,central}'),
  ('coverage',      'Registration coverage',         'Share of the population with an ABHA-linked account.', 'monthly',          '{district,state,zonal,central}'),
  ('audit_access',  'Audit & access',                'De-identified record-access and break-glass summary.', 'on_demand',        '{district,state,zonal,central}'),
  ('facilities',    'Facility directory',            'Hospitals and pharmacies on the platform.', 'on_demand',                   '{district,state,zonal,central}')
ON CONFLICT (code) DO NOTHING;

-- ---------- Permission matrix (inventory_admin.md 3.6) ----------
INSERT INTO admin.permission (code, label, note, locked) VALUES
  ('open_record_key',  'Open record with citizen key',      'National rule',          true),
  ('break_glass',      'Break-glass emergency access',      'National rule · logged', true),
  ('view_admission',   'View admission records (ward)',     'Hospital setting',       false),
  ('upload_results',   'Upload results to an order',        'Hospital setting',       false),
  ('attach_images',    'Attach images to an order',         'Hospital setting',       false),
  ('dispense_rx',      'Dispense e-signed prescriptions',   'National rule',          true),
  ('book_op',          'Book and reschedule OP visits',     'Hospital setting',       false),
  ('record_vitals',    'Record vitals at triage',           'Hospital setting',       false),
  ('use_ai_assistant', 'Use AI clinical assistant',         'Hospital setting',       false)
ON CONFLICT (code) DO NOTHING;

-- role order: doctor, nurse, lab, radiology, pharmacist, front_desk
INSERT INTO admin.role_permission (role_key, permission_code, allowed)
SELECT r.role_key, m.code, r.allowed::boolean
FROM (VALUES
  ('open_record_key',  '1,0,0,0,0,0'),
  ('break_glass',      '1,0,0,0,0,0'),
  ('view_admission',   '1,1,0,0,0,0'),
  ('upload_results',   '0,0,1,1,0,0'),
  ('attach_images',    '0,0,0,1,0,0'),
  ('dispense_rx',      '0,0,0,0,1,0'),
  ('book_op',          '1,0,0,0,0,1'),
  ('record_vitals',    '1,1,0,0,0,0'),
  ('use_ai_assistant', '1,0,0,0,0,0')
) AS m(code, flags)
CROSS JOIN LATERAL unnest(ARRAY['doctor','nurse','lab','radiology','pharmacist','front_desk'], string_to_array(m.flags, ','))
     AS r(role_key, allowed)
ON CONFLICT DO NOTHING;

-- ---------- Approval rules for the subjects added in 125 ----------
-- Time limits are placeholders until the team decides the days (same as 110).
INSERT INTO admin.approval_rule (subject_type, step, approver_level, time_limit, escalate_to_level, needs_two_persons) VALUES
  ('hospital_staff',          1, 'hospital', '7 days',  'district', false),
  ('special_category',        1, 'district', '7 days',  'state',    false),
  ('hospital_profile_change', 1, 'district', '7 days',  'state',    false),
  ('admin_create',            1, 'state',    '72 hours', NULL,      true)
ON CONFLICT DO NOTHING;

-- ---------- Lab test catalogue ----------
-- ⚠ Demo values: adult reference ranges, ONE range per test, critical limits illustrative.
-- Verify with the lab's own ranges before any clinical use. LOINC codes given only where certain.
INSERT INTO lab.test_catalogue
  (code, loinc, name, category, specimen_type, tube_type, unit, ref_low, ref_high, critical_low, critical_high, ref_text, tat_target_minutes, fasting_required) VALUES
  ('HB',    '718-7',   'Haemoglobin',                'haematology',  'whole blood', 'EDTA (lavender)', 'g/dL',         12.0,  16.0,  7.0,  20.0, NULL, 60,  false),
  ('WBC',   '6690-2',  'White blood cell count',     'haematology',  'whole blood', 'EDTA (lavender)', '10^3/uL',       4.0,  11.0,  2.0,  30.0, NULL, 60,  false),
  ('PLT',   '777-3',   'Platelet count',             'haematology',  'whole blood', 'EDTA (lavender)', '10^3/uL',     150.0, 450.0, 20.0, 1000.0, NULL, 60, false),
  ('RBC',   '789-8',   'Red blood cell count',       'haematology',  'whole blood', 'EDTA (lavender)', '10^6/uL',       4.0,   5.5, NULL, NULL, NULL, 60,  false),
  ('HCT',   '4544-3',  'Haematocrit',                'haematology',  'whole blood', 'EDTA (lavender)', '%',            36.0,  48.0, 20.0,  60.0, NULL, 60,  false),
  ('CRP',   '1988-5',  'C-reactive protein',         'biochemistry', 'serum',       'Gel (yellow)',    'mg/L',          0.0,   5.0, NULL, NULL, NULL, 120, false),
  ('GLUF',  '1558-6',  'Glucose, fasting',           'biochemistry', 'plasma',      'Fluoride (grey)', 'mg/dL',        70.0, 100.0, 40.0, 450.0, NULL, 60,  true),
  ('GLUR',  '2345-7',  'Glucose, random',            'biochemistry', 'plasma',      'Fluoride (grey)', 'mg/dL',        70.0, 140.0, 40.0, 450.0, NULL, 60,  false),
  ('HBA1C', '4548-4',  'HbA1c',                      'biochemistry', 'whole blood', 'EDTA (lavender)', '%',             4.0,   5.6, NULL, NULL, NULL, 240, false),
  ('CHOL',  '2093-3',  'Total cholesterol',          'biochemistry', 'serum',       'Gel (yellow)',    'mg/dL',         0.0, 200.0, NULL, NULL, NULL, 240, true),
  ('LDL',   '13457-7', 'LDL cholesterol',            'biochemistry', 'serum',       'Gel (yellow)',    'mg/dL',         0.0, 100.0, NULL, NULL, NULL, 240, true),   -- design value 142 mg/dL = high
  ('HDL',   '2085-9',  'HDL cholesterol',            'biochemistry', 'serum',       'Gel (yellow)',    'mg/dL',        40.0, 100.0, NULL, NULL, NULL, 240, true),
  ('TG',    '2571-8',  'Triglycerides',              'biochemistry', 'serum',       'Gel (yellow)',    'mg/dL',         0.0, 150.0, NULL, 1000.0, NULL, 240, true),
  ('UREA',  '3094-0',  'Blood urea nitrogen',        'biochemistry', 'serum',       'Gel (yellow)',    'mg/dL',         7.0,  20.0, NULL, 100.0, NULL, 120, false),
  ('CREAT', '2160-0',  'Creatinine',                 'biochemistry', 'serum',       'Gel (yellow)',    'mg/dL',         0.6,   1.3, NULL,  10.0, NULL, 120, false),
  ('K',     '2823-3',  'Potassium',                  'biochemistry', 'serum',       'Gel (yellow)',    'mmol/L',        3.5,   5.1,  2.8,   6.0, NULL, 60,  false),   -- design: 6.1 / 6.4 are critical high (>= 6.0)
  ('NA',    '2951-2',  'Sodium',                     'biochemistry', 'serum',       'Gel (yellow)',    'mmol/L',      135.0, 145.0, 120.0, 160.0, NULL, 60, false),
  ('ALT',   '1742-6',  'ALT (SGPT)',                 'biochemistry', 'serum',       'Gel (yellow)',    'U/L',           7.0,  56.0, NULL, NULL, NULL, 240, false),
  ('AST',   '1920-8',  'AST (SGOT)',                 'biochemistry', 'serum',       'Gel (yellow)',    'U/L',          10.0,  40.0, NULL, NULL, NULL, 240, false),
  ('ALP',   '6768-6',  'Alkaline phosphatase',       'biochemistry', 'serum',       'Gel (yellow)',    'U/L',          44.0, 147.0, NULL, NULL, NULL, 240, false),
  ('BILT',  '1975-2',  'Bilirubin, total',           'biochemistry', 'serum',       'Gel (yellow)',    'mg/dL',         0.1,   1.2, NULL,  15.0, NULL, 240, false),
  ('TSH',   '3016-3',  'TSH',                        'endocrine',    'serum',       'Gel (yellow)',    'mIU/L',         0.4,   4.0, NULL, NULL, NULL, 360, false),
  ('FT4',   '3024-7',  'Free T4',                    'endocrine',    'serum',       'Gel (yellow)',    'ng/dL',         0.8,   1.8, NULL, NULL, NULL, 360, false),
  ('VITD',  '1989-3',  'Vitamin D, 25-hydroxy',      'endocrine',    'serum',       'Gel (yellow)',    'ng/mL',        30.0, 100.0, NULL, NULL, NULL, 1440, false),
  ('INR',   '34714-6', 'PT / INR',                   'coagulation',  'plasma',      'Citrate (blue)',  'ratio',         0.8,   1.2, NULL,   5.0, NULL, 120, false),
  ('URINE', NULL,      'Urine routine',              'urine',        'urine',       'Sterile container', NULL,         NULL,  NULL, NULL, NULL, 'Within normal limits', 120, false),
  ('DENGNS1', NULL,    'Dengue NS1 antigen',         'serology',     'serum',       'Gel (yellow)',    NULL,          NULL,  NULL, NULL, NULL, 'Negative', 180, false),
  ('BCULT', NULL,      'Blood culture',              'microbiology', 'whole blood', 'Culture bottle',  NULL,          NULL,  NULL, NULL, NULL, 'No growth at 5 days', 7200, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO lab.panel (code, name) VALUES
  ('CBC','Complete blood count'), ('LIPID','Lipid profile'), ('LFT','Liver function tests'),
  ('KFT','Kidney function and electrolytes'), ('HBA1C','HbA1c'), ('TFT','Thyroid function'),
  ('URINEP','Urine routine'), ('DENGUE','Dengue NS1')
ON CONFLICT (code) DO NOTHING;

INSERT INTO lab.panel_test (panel_code, test_code, sort_order) VALUES
  ('CBC','HB',1), ('CBC','WBC',2), ('CBC','PLT',3), ('CBC','RBC',4), ('CBC','HCT',5),
  ('LIPID','CHOL',1), ('LIPID','LDL',2), ('LIPID','HDL',3), ('LIPID','TG',4),
  ('LFT','ALT',1), ('LFT','AST',2), ('LFT','ALP',3), ('LFT','BILT',4),
  ('KFT','UREA',1), ('KFT','CREAT',2), ('KFT','NA',3), ('KFT','K',4),
  ('HBA1C','HBA1C',1),
  ('TFT','TSH',1), ('TFT','FT4',2),
  ('URINEP','URINE',1),
  ('DENGUE','DENGNS1',1)
ON CONFLICT DO NOTHING;

-- ---------- Surveillance diseases (inventory_admin.md 4.4) ----------
INSERT INTO surveillance.disease (code, name, icd10, threshold_per_lakh, sd_threshold) VALUES
  ('dengue',    'Dengue',                 'A90',   10, 2),
  ('fever',     'Acute fever',            'R50.9', 10, 2),
  ('lepto',     'Leptospirosis',          'A27',   10, 2),
  ('malaria',   'Malaria',                'B54',   10, 2),
  ('diarrhoea', 'Acute diarrhoeal disease','A09',  10, 2)
ON CONFLICT (code) DO NOTHING;

-- ---------- Organ and tissue list (CitizenOrgan screen keys) ----------
INSERT INTO donation.organ_type (code, name, kind) VALUES
  ('kidneys','Kidneys','organ'), ('liver','Liver','organ'), ('heart','Heart','organ'), ('lungs','Lungs','organ'),
  ('pancreas','Pancreas','organ'), ('small_intestine','Small intestine','organ'),
  ('corneas','Corneas','tissue'), ('skin','Skin','tissue'), ('bone','Bone & tissue','tissue'), ('heart_valves','Heart valves','tissue')
ON CONFLICT (code) DO NOTHING;

-- ---------- Notification templates (SMS / push / email text) ----------
CREATE TABLE engage.notification_template (
  code             citext NOT NULL,
  channel          engage.channel NOT NULL,
  dlt_template_id  text,                       -- DLT template id for SMS (DEMO values in the alpha)
  body_en          text NOT NULL,
  body_ml          text,
  body_hi          text,
  is_active        boolean NOT NULL DEFAULT true,
  PRIMARY KEY (code, channel)
);
-- Templates never carry health details (rule in 080): only dates, names of people and places.
INSERT INTO engage.notification_template (code, channel, dlt_template_id, body_en, body_ml) VALUES
  ('otp',                   'sms',   'DEMO-DLT-1001', 'Your CareFusion one-time code is {{code}}. Do not share it.', NULL),
  ('appointment_confirmed', 'sms',   'DEMO-DLT-1002', 'Appointment with {{doctor}} on {{when}}. Token {{token}}. Ref {{ref}}.',
                                                      'നാളെ {{when}}-ന് {{doctor}}മായി അപ്പോയിന്റ്മെന്റ്.'),
  ('appointment_reminder',  'sms',   'DEMO-DLT-1003', 'Reminder: your appointment with {{doctor}} is on {{when}}.', NULL),
  ('rx_ready',              'sms',   'DEMO-DLT-1004', 'Your prescription {{rx}} is ready to collect at {{pharmacy}}. Token {{token}}.', NULL),
  ('lab_result_ready',      'push',  NULL,            'A new result is ready in your CareFusion documents.', NULL),
  ('record_opened',         'push',  NULL,            '{{who}} opened your record at {{hospital}}. Open the app to see details.', NULL),
  ('health_alert',          'sms',   'DEMO-DLT-1005', '{{title}} - {{issuer}}. {{message}}', NULL),
  ('blood_request',         'sms',   'DEMO-DLT-1006', 'Blood donors needed: {{group}} at {{hospital}}. Open CareFusion if you can donate.', NULL)
ON CONFLICT DO NOTHING;
GRANT SELECT ON engage.notification_template TO cf_app;

-- ---------- Extra donor / rating rules ----------
-- ⚠ Values to verify against NBTC / blood-bank rules before go-live.
INSERT INTO admin.blood_eligibility_rule (code, value, verified) VALUES
  ('min_hb_gdl', '{"g_per_dl": 12.5}', false)
ON CONFLICT (code) DO NOTHING;
INSERT INTO admin.rating_rule (code, description, value) VALUES
  ('visit_verified_badge', 'A review linked to a completed visit gets the "verified visit" badge', 'true')
ON CONFLICT (code) DO NOTHING;

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA engage, admin, lab, surveillance, donation TO cf_app;
GRANT SELECT ON ALL TABLES IN SCHEMA lab, surveillance TO cf_ai;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA engage, admin, lab, surveillance, donation FROM cf_app, cf_ai, cf_report, cf_auditor;

-- =====================================================================
-- 110_reference_data.sql : fixed reference data for every environment
--   5 zones, all 28 states + 8 UTs with the approved zone mapping,
--   Kerala's 14 districts (pilot state), master lists, approval rules,
--   partitions for the next 24 months
-- (Synthetic demo people/hospitals are NOT here — see seed/ for the alpha.)
-- =====================================================================

INSERT INTO geo.zone (id, name) VALUES
  (1,'North'), (2,'South'), (3,'East'), (4,'West'), (5,'Central');

INSERT INTO geo.state (id, code, name, is_ut, zone_id) VALUES
  -- North
  (1,'HR','Haryana',false,1), (2,'HP','Himachal Pradesh',false,1), (3,'PB','Punjab',false,1),
  (4,'RJ','Rajasthan',false,1), (5,'DL','Delhi',true,1), (6,'CH','Chandigarh',true,1),
  (7,'JK','Jammu and Kashmir',true,1), (8,'LA','Ladakh',true,1),
  -- Central
  (9,'UP','Uttar Pradesh',false,5), (10,'UK','Uttarakhand',false,5),
  (11,'MP','Madhya Pradesh',false,5), (12,'CG','Chhattisgarh',false,5),
  -- East
  (13,'BR','Bihar',false,3), (14,'JH','Jharkhand',false,3), (15,'OD','Odisha',false,3),
  (16,'WB','West Bengal',false,3), (17,'AS','Assam',false,3), (18,'AR','Arunachal Pradesh',false,3),
  (19,'MN','Manipur',false,3), (20,'ML','Meghalaya',false,3), (21,'MZ','Mizoram',false,3),
  (22,'NL','Nagaland',false,3), (23,'TR','Tripura',false,3), (24,'SK','Sikkim',false,3),
  (25,'AN','Andaman and Nicobar Islands',true,3),
  -- West
  (26,'GJ','Gujarat',false,4), (27,'MH','Maharashtra',false,4), (28,'GA','Goa',false,4),
  (29,'DH','Dadra and Nagar Haveli and Daman and Diu',true,4),
  -- South
  (30,'AP','Andhra Pradesh',false,2), (31,'TG','Telangana',false,2), (32,'KA','Karnataka',false,2),
  (33,'KL','Kerala',false,2), (34,'TN','Tamil Nadu',false,2), (35,'PY','Puducherry',true,2),
  (36,'LD','Lakshadweep',true,2);

-- Kerala (pilot). Boundaries to be loaded from official GIS data later.
INSERT INTO geo.district (state_id, name)
SELECT 33, d FROM unnest(ARRAY[
  'Thiruvananthapuram','Kollam','Pathanamthitta','Alappuzha','Kottayam','Idukki','Ernakulam',
  'Thrissur','Palakkad','Malappuram','Kozhikode','Wayanad','Kannur','Kasaragod']) AS d;

INSERT INTO org.hospital_type (code, name) VALUES
  ('SC','Sub Centre / Health and Wellness Centre'), ('PHC','Primary Health Centre'),
  ('FHC','Family Health Centre'), ('CHC','Community Health Centre'),
  ('THQ','Taluk Headquarters Hospital'), ('DH','District Hospital'),
  ('GH','General Hospital'), ('MCH','Medical College Hospital'),
  ('PVT_CLINIC','Private Clinic'), ('PVT_HOSP','Private Hospital'), ('PVT_MULTI','Private Multi-speciality Hospital');

INSERT INTO org.bed_type (code, name) VALUES
  ('general','General ward'), ('icu','ICU'), ('hdu','High dependency unit'),
  ('oxygen','Oxygen-supported'), ('paediatric','Paediatric'), ('maternity','Maternity');

INSERT INTO identity.special_category_type (code, name) VALUES
  ('cancer','Cancer'), ('hiv','HIV'), ('pregnancy','Pregnancy'), ('disability','Disability'),
  ('dialysis','Dialysis / kidney disease'), ('tuberculosis','Tuberculosis'),
  ('transplant','Transplant recipient'), ('mental_health','Mental health condition'), ('other','Other');

-- Approval chain (decided). Time limits are placeholders until the team decides the days.
INSERT INTO admin.approval_rule (subject_type, step, approver_level, time_limit, escalate_to_level, needs_two_persons) VALUES
  ('doctor',          1, 'district', '7 days', 'state',   false),
  ('doctor',          2, 'state',    '7 days', 'zonal',   false),
  ('flagged_doctor',  1, 'central',  '7 days', NULL,      false),
  ('hospital_admin',  1, 'district', '7 days', 'state',   false),
  ('pharmacy_admin',  1, 'district', '7 days', 'state',   false),
  ('hospital',        1, 'district', '7 days', 'state',   false),
  ('pharmacy',        1, 'district', '7 days', 'state',   false),
  ('flagged_citizen', 1, 'district', '7 days', 'state',   false),
  ('flagged_citizen', 2, 'state',    '7 days', 'zonal',   false),
  ('district_admin',  1, 'zonal',    '7 days', 'central', false),
  ('state_admin',     1, 'central',  '7 days', NULL,      false),
  ('zonal_admin',     1, 'central',  '7 days', NULL,      true);

-- ⚠ Values to verify against NBTC / blood-bank rules before go-live.
INSERT INTO admin.blood_eligibility_rule (code, value, verified) VALUES
  ('gap_after_donation', '{"days": 90}', false),
  ('min_age',            '{"years": 18}', false),
  ('max_age',            '{"years": 65}', false),
  ('min_weight_kg',      '{"kg": 45}', false);

INSERT INTO admin.rating_rule (code, description, value) VALUES
  ('one_per_target', 'One rating per user per doctor/hospital/pharmacy (updatable)', 'true'),
  ('needs_abha',     'Only ABHA-verified users can rate', 'true'),
  ('moderate_comments', 'District admin checks comments before they are public', 'true');

-- Partitions: current month and the next 23 (a monthly job keeps adding more).
SELECT util.ensure_monthly_partitions('audit.activity_log',        date_trunc('month', now())::date, 24);
SELECT util.ensure_monthly_partitions('records.vital_observation', date_trunc('month', now())::date - 365, 36);
SELECT util.ensure_monthly_partitions('access.location_check',     date_trunc('month', now())::date, 24);
SELECT util.ensure_monthly_partitions('engage.chat_message',       date_trunc('month', now())::date, 24);
SELECT util.ensure_monthly_partitions('engage.notification',       date_trunc('month', now())::date, 24);

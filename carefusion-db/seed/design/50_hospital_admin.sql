-- =====================================================================
-- seed/design/50_hospital_admin.sql : Hospital admin (Dr. Meera Krishnan) and Pharmacy admin (Suma Thomas) consoles.
-- Kinds 0500-0599 (see IDS.md). Builds on 00_base.sql. Idempotent (ON CONFLICT DO NOTHING / NOT EXISTS), one transaction.
-- Synthetic data only. No Aadhaar digits (opaque tokens). Demo "today" = Saturday 17 October 2026, clock times IST.
--
-- Id map (kind -> table; serial rule)
--   0501 org.ward            4 = Ward 4 (general medicine overflow ward)
--   0502 org.bed             ward n * 1000 + bed index (Ward 4 = 4001..4024, Casualty 11001.., ICU 12001.., Maternity 13001..,
--                            Paediatric 14001.., Orthopaedic 15001.., Surgical 16001..)
--   0503 identity.person     1-5 staff applicants (a1..a5), 11 unidentified casualty patient
--   0504 identity.app_user   same serial as the person; 5001 / 5002 = companion citizen accounts of the two doctor applicants
--   0505 admin.approval_request  1-5 pending applicants (a1..a5), 6 = Lekha Pillai (approved today 11:40)
--   0506 identity.staff_invite   1 Anu George (pending), 2 Faisal Rahman (accepted)
--   0507 org.facility_document   1-2 hospital 1; 11-16 Demo Hospital Pharmacy; 21 Care Plus Demo Pharmacy
--   0508 org.staff_shift     1.. (today's shifts of the staff list)
--   0509 org.doctor_roster   1..42 (6 doctors x 7 days, week 19-25 Oct 2026)
--   0510 access.access_session   1 s5 (Dr. Sreeja Paul / Thomas Kurian 16 Oct 03:12), 2 b1 (Dr. Vivek Menon, unknown male, 17 Oct 14:02),
--                                3 b2 (Dr. Sameer Ali / Thankamma Pillai 15 Oct 23:40), 4 b3 (Dr. Arun Nair / Anjali Menon 11 Oct 09:10)
--   0511 engage.complaint    1 CMP-0402, 2 CMP-0403, 3 CMP-0404 (hospital inbox; design numbers 0398 / 0391 / 0377 clash with the citizen seed)
--   0512 engage.complaint_event  running serial
--   0513 engage.rating       1-4 hospital reviews; 0514 engage.rating_reply 1-2
--   0515 access.item_view    running serial (what the break-glass doctors viewed)
-- Reconciliations / decisions (details in the report of the session that wrote this file):
--   * BEDS 240 vs 200: the department table of the design sums to 200 beds in service; the HFR record says 240 sanctioned beds.
--     org.bed holds the 200 beds in service (org.v_department_beds / bed_availability sum to 200); the 240 sanctioned beds
--     is kept as text on the HFR registration document and on org.hospital.about (base).
--   * OCCUPIED beds: the design says 168 of 200 (84%). General medicine cannot reach 52 occupied because the base fixes Ward 3 at
--     22 occupied and Ward 5 at 12 free beds (max 22 + 24 = 46 in a 60-bed department). Rows win: 162 of 200 (81%).
--   * Break-glass: 4 reviews (s5, b1, b2, b3). Justified: b2 and b3; open: s5 and b1 (the headline "2 still need your review").
-- Admissions of the hospital (Admissions list) are NOT written here: they belong to the doctor/inpatient seed (kinds 0200s).
-- =====================================================================
BEGIN;

-- ---------- Ward 4 (general medicine overflow) and the beds of the other departments of Demo General Hospital ----------
INSERT INTO org.ward (id, hospital_id, department_id, code, name) VALUES
  ('cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0011-4000-8000-000000000101', 'W4', 'Ward 4')
ON CONFLICT DO NOTHING;

INSERT INTO org.bed (id, ward_id, hospital_id, bed_no, bed_type, status) VALUES
  ('cfd00000-0502-4000-8000-000000004001', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-1', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004002', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-2', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004003', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-3', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004004', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-4', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004005', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-5', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004006', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-6', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004007', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-7', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004008', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-8', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004009', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-9', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004010', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-10', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004011', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-11', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004012', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-12', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004013', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-13', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004014', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-14', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004015', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-15', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004016', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-16', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004017', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-17', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004018', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-18', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004019', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-19', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004020', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-20', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004021', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-21', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004022', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-22', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004023', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-23', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000004024', 'cfd00000-0501-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'W4-24', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011001', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 1', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011002', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 2', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011003', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 3', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011004', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 4', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011005', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 5', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011006', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 6', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011007', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 7', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011008', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 8', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011009', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 9', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011010', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 10', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011011', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 11', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011012', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 12', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011013', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 13', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011014', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 14', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011015', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 15', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011016', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 16', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011017', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 17', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011018', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 18', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000011019', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 19', 'general', 'free'),
  ('cfd00000-0502-4000-8000-000000011020', 'cfd00000-0013-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'Casualty 20', 'general', 'free'),
  ('cfd00000-0502-4000-8000-000000012001', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-1', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012002', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-2', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012003', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-3', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012004', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-4', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012005', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-5', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012006', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-6', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012007', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-7', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012008', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-8', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012009', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-9', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012010', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-10', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012011', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-11', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012012', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-12', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012013', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-13', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012014', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-14', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012015', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-15', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012016', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-16', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012017', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-17', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012018', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-18', 'icu', 'occupied'),
  ('cfd00000-0502-4000-8000-000000012019', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-19', 'icu', 'free'),
  ('cfd00000-0502-4000-8000-000000012020', 'cfd00000-0013-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'ICU-20', 'icu', 'free'),
  ('cfd00000-0502-4000-8000-000000013001', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 1', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013002', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 2', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013003', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 3', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013004', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 4', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013005', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 5', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013006', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 6', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013007', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 7', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013008', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 8', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013009', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 9', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013010', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 10', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013011', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 11', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013012', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 12', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013013', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 13', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013014', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 14', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013015', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 15', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013016', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 16', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013017', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 17', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013018', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 18', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013019', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 19', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013020', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 20', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013021', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 21', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013022', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 22', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013023', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 23', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013024', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 24', 'maternity', 'occupied'),
  ('cfd00000-0502-4000-8000-000000013025', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 25', 'maternity', 'free'),
  ('cfd00000-0502-4000-8000-000000013026', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 26', 'maternity', 'free'),
  ('cfd00000-0502-4000-8000-000000013027', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 27', 'maternity', 'free'),
  ('cfd00000-0502-4000-8000-000000013028', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 28', 'maternity', 'free'),
  ('cfd00000-0502-4000-8000-000000013029', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 29', 'maternity', 'free'),
  ('cfd00000-0502-4000-8000-000000013030', 'cfd00000-0013-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'Maternity 30', 'maternity', 'free'),
  ('cfd00000-0502-4000-8000-000000014001', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'NICU-1', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014002', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'NICU-2', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014003', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'NICU-3', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014004', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'NICU-4', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014005', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-5', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014006', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-6', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014007', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-7', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014008', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-8', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014009', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-9', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014010', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-10', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014011', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-11', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014012', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-12', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014013', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-13', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014014', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-14', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014015', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-15', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014016', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-16', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014017', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-17', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014018', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-18', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014019', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-19', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014020', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-20', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014021', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-21', 'paediatric', 'occupied'),
  ('cfd00000-0502-4000-8000-000000014022', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-22', 'paediatric', 'free'),
  ('cfd00000-0502-4000-8000-000000014023', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-23', 'paediatric', 'free'),
  ('cfd00000-0502-4000-8000-000000014024', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-24', 'paediatric', 'free'),
  ('cfd00000-0502-4000-8000-000000014025', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-25', 'paediatric', 'free'),
  ('cfd00000-0502-4000-8000-000000014026', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-26', 'paediatric', 'free'),
  ('cfd00000-0502-4000-8000-000000014027', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-27', 'paediatric', 'free'),
  ('cfd00000-0502-4000-8000-000000014028', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-28', 'paediatric', 'free'),
  ('cfd00000-0502-4000-8000-000000014029', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-29', 'paediatric', 'free'),
  ('cfd00000-0502-4000-8000-000000014030', 'cfd00000-0013-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'PAE-30', 'paediatric', 'free'),
  ('cfd00000-0502-4000-8000-000000015001', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 1', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015002', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 2', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015003', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 3', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015004', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 4', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015005', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 5', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015006', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 6', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015007', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 7', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015008', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 8', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015009', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 9', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015010', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 10', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015011', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 11', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015012', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 12', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015013', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 13', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015014', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 14', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015015', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 15', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000015016', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 16', 'general', 'free'),
  ('cfd00000-0502-4000-8000-000000015017', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 17', 'general', 'free'),
  ('cfd00000-0502-4000-8000-000000015018', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 18', 'general', 'free'),
  ('cfd00000-0502-4000-8000-000000015019', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 19', 'general', 'free'),
  ('cfd00000-0502-4000-8000-000000015020', 'cfd00000-0013-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'Ortho 20', 'general', 'free'),
  ('cfd00000-0502-4000-8000-000000016001', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 1', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016002', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 2', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016003', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 3', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016004', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 4', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016005', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 5', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016006', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 6', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016007', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 7', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016008', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 8', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016009', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 9', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016010', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 10', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016011', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 11', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016012', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 12', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016013', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 13', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016014', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 14', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016015', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 15', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016016', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 16', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016017', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 17', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016018', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 18', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016019', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 19', 'general', 'occupied'),
  ('cfd00000-0502-4000-8000-000000016020', 'cfd00000-0013-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'Surgical 20', 'general', 'occupied')
ON CONFLICT DO NOTHING;

-- Bed counts per bed type (cache of org.bed, read by the district dashboard). Covers Ward 3, Ward 5 (base) and the beds above.
INSERT INTO org.bed_availability (hospital_id, bed_type, total, free, updated_by)
SELECT b.hospital_id, b.bed_type, count(*) FILTER (WHERE b.status <> 'out_of_service')::int,
       count(*) FILTER (WHERE b.status = 'free')::int, 'cfd00000-0002-4000-8000-000000000008'
FROM org.bed b WHERE b.hospital_id = 'cfd00000-0010-4000-8000-000000000001' GROUP BY b.hospital_id, b.bed_type
ON CONFLICT (hospital_id, bed_type) DO NOTHING;

-- ---------- 5 staff applicants waiting for the hospital admin (people, pending accounts, profiles) ----------
INSERT INTO identity.person (id, full_name, date_of_birth, sex, aadhaar_token, abha_number, abha_address, kyc_status, face_check_status, created_at, registration_channel) VALUES
  ('cfd00000-0503-4000-8000-000000000001', 'Dr. Nisha Abraham', '1987-06-12', 'female', 'tok_DEMO_cd9c612b6a56', 'DEMO-0000-8501', 'nisha.abraham@demo', 'passed', 'passed', '2026-10-17 10:12:00+05:30'::timestamptz, 'hospital_staff'),
  ('cfd00000-0503-4000-8000-000000000002', 'Dr. Rajeev Pillai', '1983-02-03', 'male', 'tok_DEMO_547ebea307b9', 'DEMO-0000-8502', 'rajeev.pillai@demo', 'passed', 'passed', '2026-10-16 09:40:00+05:30'::timestamptz, 'hospital_staff'),
  ('cfd00000-0503-4000-8000-000000000003', 'Sreelakshmi Kurup', '1997-11-20', 'female', 'tok_DEMO_5ab0aa7b6127', 'DEMO-0000-8503', 'sreelakshmi.kurup@demo', 'passed', 'passed', '2026-10-15 11:05:00+05:30'::timestamptz, 'hospital_staff'),
  ('cfd00000-0503-4000-8000-000000000004', 'Arjun Das', '1999-04-08', 'male', 'tok_DEMO_8b5dff7ca86c', 'DEMO-0000-8504', 'arjun.das@demo', 'passed', 'passed', '2026-10-14 14:20:00+05:30'::timestamptz, 'hospital_staff'),
  ('cfd00000-0503-4000-8000-000000000005', 'Minu Joseph', '1994-09-14', 'female', 'tok_DEMO_3bb414e833ce', 'DEMO-0000-8505', 'minu.joseph@demo', 'passed', 'passed', '2026-10-12 10:30:00+05:30'::timestamptz, 'hospital_staff')
ON CONFLICT DO NOTHING;

-- the unidentified casualty patient of break-glass review b1 (shape rule: temporary label, estimated DOB, no Aadhaar / ABHA)
INSERT INTO identity.person (id, full_name, date_of_birth, sex, kyc_status, face_check_status, created_at, registration_channel, is_unidentified, temp_label, dob_estimated) VALUES
  ('cfd00000-0503-4000-8000-000000000011', 'Unidentified patient (Casualty)', '1981-01-01', 'male', 'pending', 'pending', '2026-10-17 14:02:00+05:30', 'hospital_staff', true, 'Unknown male ~45 (DEMO-0000-5512)', true)
ON CONFLICT DO NOTHING;

INSERT INTO identity.app_user (id, person_id, account_type, keycloak_sub, status, status_reason, created_at) VALUES
  ('cfd00000-0504-4000-8000-000000000001', 'cfd00000-0503-4000-8000-000000000001', 'doctor', 'demo-kc-doctor-nisha-abraham', 'pending', NULL, '2026-10-17 10:12:00+05:30'::timestamptz),
  ('cfd00000-0504-4000-8000-000000000002', 'cfd00000-0503-4000-8000-000000000002', 'doctor', 'demo-kc-doctor-rajeev-pillai', 'pending', NULL, '2026-10-16 09:40:00+05:30'::timestamptz),
  ('cfd00000-0504-4000-8000-000000000003', 'cfd00000-0503-4000-8000-000000000003', 'staff', 'demo-kc-staff-sreelakshmi-kurup', 'pending', NULL, '2026-10-15 11:05:00+05:30'::timestamptz),
  ('cfd00000-0504-4000-8000-000000000004', 'cfd00000-0503-4000-8000-000000000004', 'staff', 'demo-kc-staff-arjun-das', 'pending', NULL, '2026-10-14 14:20:00+05:30'::timestamptz),
  ('cfd00000-0504-4000-8000-000000000005', 'cfd00000-0503-4000-8000-000000000005', 'staff', 'demo-kc-staff-minu-joseph', 'pending', NULL, '2026-10-12 10:30:00+05:30'::timestamptz),
  ('cfd00000-0504-4000-8000-000000005001', 'cfd00000-0503-4000-8000-000000000001', 'citizen', 'demo-kc-citizen-nisha-abraham', 'active', NULL, '2026-10-01 00:00:00+05:30'),
  ('cfd00000-0504-4000-8000-000000005002', 'cfd00000-0503-4000-8000-000000000002', 'citizen', 'demo-kc-citizen-rajeev-pillai', 'active', NULL, '2026-10-01 00:00:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO identity.citizen_profile (person_id, preferred_language, district_id) VALUES
  ('cfd00000-0503-4000-8000-000000000001', 'en', util.seed_district('Pathanamthitta')),
  ('cfd00000-0503-4000-8000-000000000002', 'en', util.seed_district('Pathanamthitta'))
ON CONFLICT DO NOTHING;

INSERT INTO identity.doctor_profile (user_id, hpr_id, council_name, council_reg_no, specialisation, degrees, hospital_id, department_id, employment_type, signing_method) VALUES
  ('cfd00000-0504-4000-8000-000000000001', 'DEMO-HPR-71-4410', 'Demo Medical Council, Kerala', 'DEMO-MC-60412', 'Paediatrics', '[{"degree": "MBBS", "year": 2014}, {"degree": "MD Paediatrics", "year": 2018}]'::jsonb, 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0011-4000-8000-000000000104', 'govt', 'mock'),
  ('cfd00000-0504-4000-8000-000000000002', 'DEMO-HPR-71-3982', 'Demo Medical Council, Kerala', 'DEMO-MC-39871', 'Orthopaedics', '[{"degree": "MBBS", "year": 2009}, {"degree": "MS Orthopaedics", "year": 2013}]'::jsonb, 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0011-4000-8000-000000000106', 'private', 'mock')
ON CONFLICT DO NOTHING;

INSERT INTO identity.staff_profile (user_id, hospital_id, department_id, staff_role, created_by_user_id, ward_id, registration_no, designation) VALUES
  ('cfd00000-0504-4000-8000-000000000003', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0011-4000-8000-000000000103', 'nurse', 'cfd00000-0002-4000-8000-000000000008', 'cfd00000-0013-4000-8000-000000000012', 'DNC DEMO-88231', 'Staff nurse (ICU)'),
  ('cfd00000-0504-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0011-4000-8000-000000000108', 'lab', 'cfd00000-0002-4000-8000-000000000008', NULL, 'DPC DEMO-1140', 'Lab technician'),
  ('cfd00000-0504-4000-8000-000000000005', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0011-4000-8000-000000000109', 'radiology', 'cfd00000-0002-4000-8000-000000000008', NULL, 'DRB DEMO-RT-221', 'Radiographer')
ON CONFLICT DO NOTHING;

-- ---------- Staff approvals queue (admin.approval_request: hospital-level approver, 7-day limit) ----------
INSERT INTO admin.approval_request (id, subject_type, subject_user_id, subject_person_id, subject_hospital_id, step, assigned_level, assigned_hospital_id, status, submitted_at, due_at, check_results, priority, decided_by_user_id, decided_at, reason) VALUES
  ('cfd00000-0505-4000-8000-000000000001', 'hospital_staff', 'cfd00000-0504-4000-8000-000000000001', 'cfd00000-0503-4000-8000-000000000001', 'cfd00000-0010-4000-8000-000000000001', 1, 'hospital', 'cfd00000-0010-4000-8000-000000000001', 'pending', '2026-10-17 10:12:00+05:30'::timestamptz, '2026-10-17 10:12:00+05:30'::timestamptz + interval '7 days', '{"role": "Doctor", "department": "Paediatrics", "registry": "HPR DEMO-HPR-71-4410", "employment": "Government", "ekyc": "passed", "documents": [{"title": "MBBS degree certificate", "meta": "University of Kerala · 2014", "checked": true, "expired": false}, {"title": "MD Paediatrics", "meta": "AIIMS demo · 2018", "checked": true, "expired": false}, {"title": "Demo Medical Council registration", "meta": "Valid till 2029", "checked": false, "expired": false}, {"title": "Appointment order", "meta": "DHS Kerala · 02 Oct 2026", "checked": false, "expired": false}], "blocked_reason": null}'::jsonb, 'normal', NULL, NULL, NULL),
  ('cfd00000-0505-4000-8000-000000000002', 'hospital_staff', 'cfd00000-0504-4000-8000-000000000002', 'cfd00000-0503-4000-8000-000000000002', 'cfd00000-0010-4000-8000-000000000001', 1, 'hospital', 'cfd00000-0010-4000-8000-000000000001', 'pending', '2026-10-16 09:40:00+05:30'::timestamptz, '2026-10-16 09:40:00+05:30'::timestamptz + interval '7 days', '{"role": "Doctor", "department": "Orthopaedics", "registry": "HPR DEMO-HPR-71-3982", "employment": "Visiting · private", "ekyc": "passed", "documents": [{"title": "MBBS degree certificate", "meta": "Calicut University · 2009", "checked": false, "expired": false}, {"title": "MS Orthopaedics", "meta": "2013", "checked": false, "expired": false}, {"title": "Demo Medical Council registration", "meta": "Expired Aug 2026", "checked": false, "expired": true}, {"title": "Visiting consultant agreement", "meta": "Signed 30 Sep", "checked": false, "expired": false}], "blocked_reason": "Registration expired: the council registration expired in Aug 2026. Approving is blocked until a renewed certificate is uploaded."}'::jsonb, 'normal', NULL, NULL, NULL),
  ('cfd00000-0505-4000-8000-000000000003', 'hospital_staff', 'cfd00000-0504-4000-8000-000000000003', 'cfd00000-0503-4000-8000-000000000003', 'cfd00000-0010-4000-8000-000000000001', 1, 'hospital', 'cfd00000-0010-4000-8000-000000000001', 'pending', '2026-10-15 11:05:00+05:30'::timestamptz, '2026-10-15 11:05:00+05:30'::timestamptz + interval '7 days', '{"role": "Nurse", "department": "ICU", "registry": "DNC DEMO-88231", "employment": "Contract", "ekyc": "passed", "documents": [{"title": "B.Sc Nursing", "meta": "2019", "checked": false, "expired": false}, {"title": "Demo Nursing Council registration", "meta": "Valid till 2028", "checked": false, "expired": false}, {"title": "Appointment order", "meta": "NHM · 10 Oct", "checked": false, "expired": false}], "blocked_reason": null}'::jsonb, 'normal', NULL, NULL, NULL),
  ('cfd00000-0505-4000-8000-000000000004', 'hospital_staff', 'cfd00000-0504-4000-8000-000000000004', 'cfd00000-0503-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 1, 'hospital', 'cfd00000-0010-4000-8000-000000000001', 'pending', '2026-10-14 14:20:00+05:30'::timestamptz, '2026-10-14 14:20:00+05:30'::timestamptz + interval '7 days', '{"role": "Lab tech", "department": "Laboratory", "registry": "DPC DEMO-1140", "employment": "Government", "ekyc": "passed", "documents": [{"title": "DMLT certificate", "meta": "2020", "checked": false, "expired": false}, {"title": "Appointment order", "meta": "DHS Kerala", "checked": false, "expired": false}], "blocked_reason": null}'::jsonb, 'normal', NULL, NULL, NULL),
  ('cfd00000-0505-4000-8000-000000000005', 'hospital_staff', 'cfd00000-0504-4000-8000-000000000005', 'cfd00000-0503-4000-8000-000000000005', 'cfd00000-0010-4000-8000-000000000001', 1, 'hospital', 'cfd00000-0010-4000-8000-000000000001', 'pending', '2026-10-12 10:30:00+05:30'::timestamptz, '2026-10-12 10:30:00+05:30'::timestamptz + interval '7 days', '{"role": "Radiology tech", "department": "Radiology", "registry": "DRB DEMO-RT-221", "employment": "Government", "ekyc": "passed", "documents": [{"title": "Diploma in Radiography", "meta": "2016", "checked": false, "expired": false}, {"title": "Radiation board certificate", "meta": "Valid", "checked": false, "expired": false}, {"title": "Appointment order", "meta": "DHS Kerala", "checked": false, "expired": false}], "blocked_reason": null}'::jsonb, 'normal', NULL, NULL, NULL),
  ('cfd00000-0505-4000-8000-000000000006', 'hospital_staff', 'cfd00000-0002-4000-8000-000000000003', 'cfd00000-0001-4000-8000-000000000003', 'cfd00000-0010-4000-8000-000000000001', 1, 'hospital', 'cfd00000-0010-4000-8000-000000000001', 'approved', '2026-10-15 09:00:00+05:30', '2026-10-22 09:00:00+05:30', '{"role": "Nurse", "department": "Ward 3", "registry": "DNC DEMO-4471", "employment": "Government", "ekyc": "passed", "documents": []}'::jsonb, 'normal', 'cfd00000-0002-4000-8000-000000000008', '2026-10-17 11:40:00+05:30', 'Approved')
ON CONFLICT DO NOTHING;

-- ---------- Roles and permissions: the default matrix (9 permissions x 6 roles) is in migration 128; one hospital override ----------
-- Audit story 09:12: 'Radiology: attach images to an order' was set by the hospital admin (same value as the default).
INSERT INTO admin.hospital_permission_override (hospital_id, role_key, permission_code, allowed, updated_by) VALUES
  ('cfd00000-0010-4000-8000-000000000001', 'radiology', 'attach_images', true, 'cfd00000-0002-4000-8000-000000000008')
ON CONFLICT DO NOTHING;

-- ---------- Pharmacy admin: invites (Anu George pending, Faisal Rahman accepted) ----------
INSERT INTO identity.staff_invite (id, pharmacy_id, role_kind, full_name, email_hash, token_hash, registration_no, shift, invited_by_user_id, created_at, last_sent_at, expires_at, accepted_at, accepted_user_id) VALUES
  ('cfd00000-0506-4000-8000-000000000001', 'cfd00000-0012-4000-8000-000000000001', 'pharmacist', 'Anu George', sha256('anu.george@demo.example'::bytea), sha256('demo-invite-token-1'::bytea), 'DSPC DEMO-41982', NULL, 'cfd00000-0002-4000-8000-000000000007', '2026-10-15 10:20:00+05:30'::timestamptz, '2026-10-15 10:20:00+05:30'::timestamptz, '2026-10-22 10:20:00+05:30'::timestamptz, NULL, NULL),
  ('cfd00000-0506-4000-8000-000000000002', 'cfd00000-0012-4000-8000-000000000001', 'pharmacist', 'Faisal Rahman', sha256('faisal.rahman@demo.example'::bytea), sha256('demo-invite-token-2'::bytea), 'DSPC DEMO-40517', 'night', 'cfd00000-0002-4000-8000-000000000007', '2026-10-10 09:00:00+05:30'::timestamptz, '2026-10-10 09:00:00+05:30'::timestamptz, '2026-10-17 09:00:00+05:30'::timestamptz, '2026-10-12 08:30:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000304')
ON CONFLICT DO NOTHING;

-- ---------- Pharmacists: counter and break state now (the design's Overview 'Pharmacists on shift' card) ----------
-- Joseph Mathew is Counter 2 (his own app / persona) and Divya Raj Counter 1: the pharmacy admin screen swaps the two; persona wins.
INSERT INTO pharmacy.counter_state (user_id, pharmacy_id, counter, state, since, last_active_at) VALUES
  ('cfd00000-0002-4000-8000-000000000006', 'cfd00000-0012-4000-8000-000000000001', 'Counter 2', 'on', '2026-10-17 08:00:00+05:30'::timestamptz, '2026-10-17 14:45:00+05:30'::timestamptz),
  ('cfd00000-0002-4000-8000-000000000301', 'cfd00000-0012-4000-8000-000000000001', 'Counter 1', 'on', '2026-10-17 08:00:00+05:30'::timestamptz, '2026-10-17 14:44:00+05:30'::timestamptz),
  ('cfd00000-0002-4000-8000-000000000302', 'cfd00000-0012-4000-8000-000000000001', 'Store room', 'break', '2026-10-17 14:33:00+05:30'::timestamptz, '2026-10-17 14:33:00+05:30'::timestamptz),
  ('cfd00000-0002-4000-8000-000000000303', 'cfd00000-0012-4000-8000-000000000001', NULL, 'off', '2026-10-17 07:58:00+05:30'::timestamptz, '2026-10-16 07:58:00+05:30'::timestamptz),
  ('cfd00000-0002-4000-8000-000000000304', 'cfd00000-0012-4000-8000-000000000001', NULL, 'off', '2026-10-16 08:00:00+05:30'::timestamptz, '2026-10-16 08:00:00+05:30'::timestamptz)
ON CONFLICT DO NOTHING;

-- ---------- Compliance documents (org.facility_document) ----------
INSERT INTO org.facility_document (id, facility_type, hospital_id, pharmacy_id, doc_type, title, reference_no, valid_from, valid_until, storage_key, status, verified_by_user_id, verified_at, uploaded_by_user_id) VALUES
  ('cfd00000-0507-4000-8000-000000000001', 'hospital', 'cfd00000-0010-4000-8000-000000000001', NULL, 'hfr', 'HFR registration certificate · 240 sanctioned beds, 200 in service', 'DEMO-HFR-KL-0193', '2026-01-12', NULL, 'demo/facility-docs/hfr-1.pdf', 'verified', 'cfd00000-0002-4000-8000-000000000009', '2026-01-12 10:00:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000008'),
  ('cfd00000-0507-4000-8000-000000000002', 'hospital', 'cfd00000-0010-4000-8000-000000000001', NULL, 'clinical_licence', 'Clinical establishment licence', 'DEMO-HCE-KL-0193', '2025-04-01', '2027-03-31', 'demo/facility-docs/clinical_licence-2.pdf', 'verified', 'cfd00000-0002-4000-8000-000000000009', '2026-01-12 10:00:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000008'),
  ('cfd00000-0507-4000-8000-000000000011', 'pharmacy', NULL, 'cfd00000-0012-4000-8000-000000000001', 'drug_licence', 'Retail drug licence (Form 20 & 21)', 'DEMO-DL-KL-2041', '2024-04-01', '2029-03-31', 'demo/facility-docs/drug_licence-11.pdf', 'verified', NULL, '2026-01-02 10:00:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000007'),
  ('cfd00000-0507-4000-8000-000000000012', 'pharmacy', NULL, 'cfd00000-0012-4000-8000-000000000001', 'gst', 'GST registration', 'DEMO-GST-32-1234', '2025-06-01', NULL, 'demo/facility-docs/gst-12.pdf', 'verified', NULL, '2026-01-02 10:00:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000007'),
  ('cfd00000-0507-4000-8000-000000000013', 'pharmacy', NULL, 'cfd00000-0012-4000-8000-000000000001', 'pharmacist_certificate', 'Registered pharmacist certificate · Joseph Mathew · DSPC DEMO-30214', 'DSPC DEMO-30214', NULL, NULL, 'demo/facility-docs/pharmacist_certificate-13.pdf', 'verified', NULL, '2026-01-02 10:00:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000007'),
  ('cfd00000-0507-4000-8000-000000000014', 'pharmacy', NULL, 'cfd00000-0012-4000-8000-000000000001', 'cold_chain_log', 'Cold chain log, Q3 2026 · fridge 2-8 C', NULL, '2026-07-01', '2026-09-30', 'demo/facility-docs/cold_chain_log-14.pdf', 'under_review', NULL, NULL, 'cfd00000-0002-4000-8000-000000000007'),
  ('cfd00000-0507-4000-8000-000000000015', 'pharmacy', NULL, 'cfd00000-0012-4000-8000-000000000001', 'fire_noc', 'Fire NOC', 'DEMO-FNOC-2041', '2025-12-01', '2026-11-30', 'demo/facility-docs/fire_noc-15.pdf', 'renew_soon', NULL, NULL, 'cfd00000-0002-4000-8000-000000000007'),
  ('cfd00000-0507-4000-8000-000000000016', 'pharmacy', NULL, 'cfd00000-0012-4000-8000-000000000001', 'narcotic_return', 'Narcotic drugs register (Schedule X) · monthly return, Oct due 05 Nov', NULL, '2026-10-01', '2026-11-05', 'demo/facility-docs/narcotic_return-16.pdf', 'upcoming', NULL, NULL, 'cfd00000-0002-4000-8000-000000000007'),
  ('cfd00000-0507-4000-8000-000000000021', 'pharmacy', NULL, 'cfd00000-0012-4000-8000-000000000002', 'drug_licence', 'Retail drug licence · expires in 20 days', 'DEMO-DL-KL-2988', '2023-11-07', '2026-11-06', 'demo/facility-docs/drug_licence-21.pdf', 'renew_soon', NULL, NULL, 'cfd00000-0002-4000-8000-000000000306')
ON CONFLICT DO NOTHING;

-- ---------- Staff on duty now (org.staff_shift, today). Fathima Beevi and Dr. Sameer Ali are Off: no row. ----------
INSERT INTO org.staff_shift (id, user_id, hospital_id, ward_id, role_label, shift_start, shift_end, break_taken, clocked_in_at) VALUES
  ('cfd00000-0508-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', 'cfd00000-0010-4000-8000-000000000001', NULL, 'Doctor', '2026-10-17 09:00:00+05:30'::timestamptz, '2026-10-17 17:00:00+05:30'::timestamptz, false, '2026-10-17 09:00:00+05:30'::timestamptz),
  ('cfd00000-0508-4000-8000-000000000002', 'cfd00000-0002-4000-8000-000000000102', 'cfd00000-0010-4000-8000-000000000001', NULL, 'Doctor', '2026-10-17 08:00:00+05:30'::timestamptz, '2026-10-17 20:00:00+05:30'::timestamptz, false, '2026-10-17 08:00:00+05:30'::timestamptz),
  ('cfd00000-0508-4000-8000-000000000003', 'cfd00000-0002-4000-8000-000000000003', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0013-4000-8000-000000000003', 'Staff nurse', '2026-10-17 07:00:00+05:30'::timestamptz, '2026-10-17 15:00:00+05:30'::timestamptz, false, '2026-10-17 07:00:00+05:30'::timestamptz),
  ('cfd00000-0508-4000-8000-000000000004', 'cfd00000-0002-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', NULL, 'Lab technician', '2026-10-17 08:00:00+05:30'::timestamptz, '2026-10-17 16:00:00+05:30'::timestamptz, false, '2026-10-17 08:00:00+05:30'::timestamptz),
  ('cfd00000-0508-4000-8000-000000000005', 'cfd00000-0002-4000-8000-000000000121', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0013-4000-8000-000000000012', 'Staff nurse (ICU)', '2026-10-17 07:00:00+05:30'::timestamptz, '2026-10-17 19:00:00+05:30'::timestamptz, false, '2026-10-17 07:00:00+05:30'::timestamptz),
  ('cfd00000-0508-4000-8000-000000000006', 'cfd00000-0002-4000-8000-000000000006', 'cfd00000-0010-4000-8000-000000000001', NULL, 'Pharmacist', '2026-10-17 08:00:00+05:30'::timestamptz, '2026-10-17 20:00:00+05:30'::timestamptz, false, '2026-10-17 08:00:00+05:30'::timestamptz)
ON CONFLICT DO NOTHING;

-- ---------- Doctor roster, week Mon 19 - Sun 25 Oct 2026 (draft, not published); minimum 4 doctors and 1 night on-call per day ----------
INSERT INTO org.roster_week (hospital_id, week_start, min_doctors_per_day, min_night_oncall) VALUES
  ('cfd00000-0010-4000-8000-000000000001', '2026-10-19', 4, 1)
ON CONFLICT DO NOTHING;

INSERT INTO org.doctor_roster (id, hospital_id, doctor_user_id, duty_date, shift) VALUES
  ('cfd00000-0509-4000-8000-000000000001', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', '2026-10-19', 'op'),
  ('cfd00000-0509-4000-8000-000000000002', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', '2026-10-20', 'op'),
  ('cfd00000-0509-4000-8000-000000000003', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', '2026-10-21', 'op'),
  ('cfd00000-0509-4000-8000-000000000004', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', '2026-10-22', 'op'),
  ('cfd00000-0509-4000-8000-000000000005', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', '2026-10-23', 'op'),
  ('cfd00000-0509-4000-8000-000000000006', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', '2026-10-24', 'off'),
  ('cfd00000-0509-4000-8000-000000000007', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', '2026-10-25', 'night'),
  ('cfd00000-0509-4000-8000-000000000008', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000102', '2026-10-19', 'night'),
  ('cfd00000-0509-4000-8000-000000000009', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000102', '2026-10-20', 'off'),
  ('cfd00000-0509-4000-8000-000000000010', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000102', '2026-10-21', 'night'),
  ('cfd00000-0509-4000-8000-000000000011', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000102', '2026-10-22', 'off'),
  ('cfd00000-0509-4000-8000-000000000012', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000102', '2026-10-23', 'night'),
  ('cfd00000-0509-4000-8000-000000000013', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000102', '2026-10-24', 'op'),
  ('cfd00000-0509-4000-8000-000000000014', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000102', '2026-10-25', 'off'),
  ('cfd00000-0509-4000-8000-000000000015', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000103', '2026-10-19', 'op'),
  ('cfd00000-0509-4000-8000-000000000016', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000103', '2026-10-20', 'op'),
  ('cfd00000-0509-4000-8000-000000000017', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000103', '2026-10-21', 'off'),
  ('cfd00000-0509-4000-8000-000000000018', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000103', '2026-10-22', 'op'),
  ('cfd00000-0509-4000-8000-000000000019', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000103', '2026-10-23', 'op'),
  ('cfd00000-0509-4000-8000-000000000020', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000103', '2026-10-24', 'night'),
  ('cfd00000-0509-4000-8000-000000000021', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000103', '2026-10-25', 'off'),
  ('cfd00000-0509-4000-8000-000000000022', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000104', '2026-10-19', 'op'),
  ('cfd00000-0509-4000-8000-000000000023', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000104', '2026-10-20', 'op'),
  ('cfd00000-0509-4000-8000-000000000024', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000104', '2026-10-21', 'op'),
  ('cfd00000-0509-4000-8000-000000000025', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000104', '2026-10-22', 'off'),
  ('cfd00000-0509-4000-8000-000000000026', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000104', '2026-10-23', 'op'),
  ('cfd00000-0509-4000-8000-000000000027', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000104', '2026-10-24', 'op'),
  ('cfd00000-0509-4000-8000-000000000028', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000104', '2026-10-25', 'off'),
  ('cfd00000-0509-4000-8000-000000000029', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000105', '2026-10-19', 'off'),
  ('cfd00000-0509-4000-8000-000000000030', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000105', '2026-10-20', 'op'),
  ('cfd00000-0509-4000-8000-000000000031', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000105', '2026-10-21', 'op'),
  ('cfd00000-0509-4000-8000-000000000032', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000105', '2026-10-22', 'op'),
  ('cfd00000-0509-4000-8000-000000000033', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000105', '2026-10-23', 'op'),
  ('cfd00000-0509-4000-8000-000000000034', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000105', '2026-10-24', 'night'),
  ('cfd00000-0509-4000-8000-000000000035', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000105', '2026-10-25', 'off'),
  ('cfd00000-0509-4000-8000-000000000036', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000107', '2026-10-19', 'op'),
  ('cfd00000-0509-4000-8000-000000000037', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000107', '2026-10-20', 'off'),
  ('cfd00000-0509-4000-8000-000000000038', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000107', '2026-10-21', 'op'),
  ('cfd00000-0509-4000-8000-000000000039', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000107', '2026-10-22', 'op'),
  ('cfd00000-0509-4000-8000-000000000040', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000107', '2026-10-23', 'op'),
  ('cfd00000-0509-4000-8000-000000000041', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000107', '2026-10-24', 'off'),
  ('cfd00000-0509-4000-8000-000000000042', 'cfd00000-0010-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000107', '2026-10-25', 'off')
ON CONFLICT DO NOTHING;

-- ---------- Break-glass reviews for the hospital admin (sessions + emergency details + what was viewed) ----------
INSERT INTO access.access_session (id, patient_person_id, user_id, mode, started_at, expires_at, ended_at, ended_by, start_inside_geofence, reason) VALUES
  ('cfd00000-0510-4000-8000-000000000001', 'cfd00000-0001-4000-8000-000000001001', 'cfd00000-0002-4000-8000-000000000101', 'break_glass', '2026-10-16 03:12:00+05:30'::timestamptz, '2026-10-16 03:42:00+05:30'::timestamptz, '2026-10-16 03:30:00+05:30'::timestamptz, 'doctor', true, 'Unconscious on arrival'),
  ('cfd00000-0510-4000-8000-000000000002', 'cfd00000-0503-4000-8000-000000000011', 'cfd00000-0002-4000-8000-000000000102', 'break_glass', '2026-10-17 14:02:00+05:30'::timestamptz, '2026-10-17 14:32:00+05:30'::timestamptz, '2026-10-17 14:24:00+05:30'::timestamptz, 'doctor', true, 'Unconscious road accident patient. Identified by Aadhaar biometric. Needed allergies and blood group.'),
  ('cfd00000-0510-4000-8000-000000000003', 'cfd00000-0001-4000-8000-000000001023', 'cfd00000-0002-4000-8000-000000000103', 'break_glass', '2026-10-15 23:40:00+05:30'::timestamptz, '2026-10-16 00:10:00+05:30'::timestamptz, '2026-10-16 00:21:00+05:30'::timestamptz, 'doctor', true, 'Transferred from PHC at night, family unreachable. Needed medication history.'),
  ('cfd00000-0510-4000-8000-000000000004', 'cfd00000-0001-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', 'break_glass', '2026-10-11 09:10:00+05:30'::timestamptz, '2026-10-11 09:40:00+05:30'::timestamptz, '2026-10-11 09:16:00+05:30'::timestamptz, 'doctor', true, 'Citizen key not working, patient present and consenting verbally.')
ON CONFLICT DO NOTHING;

INSERT INTO access.emergency_access (session_id, break_glass_reason, reason_category, match_method, evidence_note, hospital_due_at, hospital_review_status, hospital_reviewer_id, hospital_reviewed_at, hospital_review_note, central_due_at, patient_notified_at, district_review_status, district_reviewer_id, district_reviewed_at, central_verify_status, central_verifier_id, central_verified_at) VALUES
  ('cfd00000-0510-4000-8000-000000000001', 'Unconscious on arrival', 'unconscious', 'face', 'Logged automatically · citizen notified', '2026-10-19 03:12:00+05:30'::timestamptz, 'pending', NULL, NULL, NULL, '2026-10-17 03:12:00+05:30'::timestamptz, '2026-10-16 03:13:00+05:30'::timestamptz, 'pending', NULL, NULL, 'pending', NULL, NULL),
  ('cfd00000-0510-4000-8000-000000000002', 'Unconscious road accident patient. Identified by Aadhaar biometric. Needed allergies and blood group.', 'accident', 'aadhaar_biometric', 'Casualty register entry #C-4471 · ambulance 108 handover', '2026-10-20 14:02:00+05:30'::timestamptz, 'pending', NULL, NULL, NULL, '2026-10-18 14:02:00+05:30'::timestamptz, '2026-10-17 14:03:00+05:30'::timestamptz, 'pending', NULL, NULL, 'pending', NULL, NULL),
  ('cfd00000-0510-4000-8000-000000000003', 'Transferred from PHC at night, family unreachable. Needed medication history.', 'transfer', 'manual', 'Referral note DEMO-REF-2210', '2026-10-18 23:40:00+05:30'::timestamptz, 'ok', 'cfd00000-0002-4000-8000-000000000008', '2026-10-16 19:40:00+05:30'::timestamptz, 'Justified: transfer at night, family unreachable.', '2026-10-16 23:40:00+05:30'::timestamptz, '2026-10-15 23:41:00+05:30'::timestamptz, 'ok', 'cfd00000-0002-4000-8000-000000000009', '2026-10-16 19:40:00+05:30'::timestamptz, 'ok', 'cfd00000-0002-4000-8000-000000000012', '2026-10-16 19:40:00+05:30'::timestamptz),
  ('cfd00000-0510-4000-8000-000000000004', 'Citizen key not working, patient present and consenting verbally.', 'key_unavailable', 'manual', 'Citizen confirmed in app afterwards', '2026-10-14 09:10:00+05:30'::timestamptz, 'ok', 'cfd00000-0002-4000-8000-000000000008', '2026-10-12 05:10:00+05:30'::timestamptz, 'Justified: key failure, citizen confirmed in the app.', '2026-10-12 09:10:00+05:30'::timestamptz, '2026-10-11 09:11:00+05:30'::timestamptz, 'ok', 'cfd00000-0002-4000-8000-000000000009', '2026-10-12 05:10:00+05:30'::timestamptz, 'ok', 'cfd00000-0002-4000-8000-000000000012', '2026-10-12 05:10:00+05:30'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO access.item_view (id, session_id, patient_person_id, user_id, item_kind, label, viewed_at) VALUES
  ('cfd00000-0515-4000-8000-000000000001', 'cfd00000-0510-4000-8000-000000000001', 'cfd00000-0001-4000-8000-000000001001', 'cfd00000-0002-4000-8000-000000000101', 'emergency_card', 'Emergency card', '2026-10-16 03:14:00+05:30'::timestamptz),
  ('cfd00000-0515-4000-8000-000000000002', 'cfd00000-0510-4000-8000-000000000001', 'cfd00000-0001-4000-8000-000000001001', 'cfd00000-0002-4000-8000-000000000101', 'allergy', 'Allergies', '2026-10-16 03:14:00+05:30'::timestamptz),
  ('cfd00000-0515-4000-8000-000000000003', 'cfd00000-0510-4000-8000-000000000001', 'cfd00000-0001-4000-8000-000000001001', 'cfd00000-0002-4000-8000-000000000101', 'medication', 'Medicines', '2026-10-16 03:14:00+05:30'::timestamptz),
  ('cfd00000-0515-4000-8000-000000000004', 'cfd00000-0510-4000-8000-000000000002', 'cfd00000-0503-4000-8000-000000000011', 'cfd00000-0002-4000-8000-000000000102', 'emergency_card', 'Emergency card', '2026-10-17 14:04:00+05:30'::timestamptz),
  ('cfd00000-0515-4000-8000-000000000005', 'cfd00000-0510-4000-8000-000000000002', 'cfd00000-0503-4000-8000-000000000011', 'cfd00000-0002-4000-8000-000000000102', 'allergy', 'Allergies', '2026-10-17 14:04:00+05:30'::timestamptz),
  ('cfd00000-0515-4000-8000-000000000006', 'cfd00000-0510-4000-8000-000000000002', 'cfd00000-0503-4000-8000-000000000011', 'cfd00000-0002-4000-8000-000000000102', 'document', 'Last discharge summary', '2026-10-17 14:04:00+05:30'::timestamptz),
  ('cfd00000-0515-4000-8000-000000000007', 'cfd00000-0510-4000-8000-000000000003', 'cfd00000-0001-4000-8000-000000001023', 'cfd00000-0002-4000-8000-000000000103', 'medication', 'Medicines', '2026-10-15 23:42:00+05:30'::timestamptz),
  ('cfd00000-0515-4000-8000-000000000008', 'cfd00000-0510-4000-8000-000000000003', 'cfd00000-0001-4000-8000-000000001023', 'cfd00000-0002-4000-8000-000000000103', 'lab_result', 'Lab reports (90 days)', '2026-10-15 23:42:00+05:30'::timestamptz),
  ('cfd00000-0515-4000-8000-000000000009', 'cfd00000-0510-4000-8000-000000000003', 'cfd00000-0001-4000-8000-000000001023', 'cfd00000-0002-4000-8000-000000000103', 'document', 'Discharge summaries', '2026-10-15 23:42:00+05:30'::timestamptz),
  ('cfd00000-0515-4000-8000-000000000010', 'cfd00000-0510-4000-8000-000000000004', 'cfd00000-0001-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000002', 'lab_result', 'Lab reports only', '2026-10-11 09:12:00+05:30'::timestamptz)
ON CONFLICT DO NOTHING;

-- ---------- Complaints inbox of the hospital (CMP-0412 Long OP wait is filed by Anjali Menon in the citizen seed (kind 01xx)) ----------
INSERT INTO engage.complaint (id, ref_no, title, raised_by_person_id, about_type, about_id, district_id, hospital_id, category, severity, status, body, place_text, resolution, resolved_at, created_at, updated_at) VALUES
  ('cfd00000-0511-4000-8000-000000000001', 'CMP-0402', 'Medicine out of stock at hospital pharmacy', 'cfd00000-0001-4000-8000-000000001009', 'hospital', 'cfd00000-0010-4000-8000-000000000001', util.seed_district('Pathanamthitta'), 'cfd00000-0010-4000-8000-000000000001', 'pharmacy', 'normal', 'assigned', 'Told to buy Insulin glargine outside for the second time this month.', 'Hospital pharmacy counter', NULL, NULL, '2026-10-16 10:15:00+05:30'::timestamptz, '2026-10-16 10:15:00+05:30'::timestamptz),
  ('cfd00000-0511-4000-8000-000000000002', 'CMP-0403', 'Rude behaviour at casualty registration', 'cfd00000-0001-4000-8000-000000001019', 'hospital', 'cfd00000-0010-4000-8000-000000000001', util.seed_district('Pathanamthitta'), 'cfd00000-0010-4000-8000-000000000001', 'staff_conduct', 'urgent', 'open', 'Night shift registration staff refused to help my elderly father fill the form.', 'Casualty registration', NULL, NULL, '2026-10-15 21:40:00+05:30'::timestamptz, '2026-10-15 21:40:00+05:30'::timestamptz),
  ('cfd00000-0511-4000-8000-000000000003', 'CMP-0404', 'Lab report delayed by 5 days', 'cfd00000-0001-4000-8000-000000001008', 'hospital', 'cfd00000-0010-4000-8000-000000000001', util.seed_district('Pathanamthitta'), 'cfd00000-0010-4000-8000-000000000001', 'lab', 'normal', 'resolved', 'Thyroid test report promised in 1 day, arrived after 5.', 'Central Lab', 'Report delivered; lab turnaround reviewed with the lab in-charge.', '2026-10-16 15:30:00+05:30'::timestamptz, '2026-10-11 12:05:00+05:30'::timestamptz, '2026-10-11 12:05:00+05:30'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO engage.complaint_event (id, complaint_id, actor_user_id, kind, text, created_at) VALUES
  ('cfd00000-0512-4000-8000-000000000001', 'cfd00000-0511-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000008', 'assigned', 'Assigned to PRO desk · Sindhu V.', '2026-10-16 11:00:00+05:30'::timestamptz),
  ('cfd00000-0512-4000-8000-000000000002', 'cfd00000-0511-4000-8000-000000000003', 'cfd00000-0002-4000-8000-000000000008', 'assigned', 'Assigned to PRO desk · Sindhu V.', '2026-10-12 09:30:00+05:30'::timestamptz),
  ('cfd00000-0512-4000-8000-000000000003', 'cfd00000-0511-4000-8000-000000000003', 'cfd00000-0002-4000-8000-000000000008', 'resolved', 'Report delivered; lab turnaround reviewed with the lab in-charge.', '2026-10-16 15:30:00+05:30'::timestamptz),
  ('cfd00000-0512-4000-8000-000000000004', 'cfd00000-0511-4000-8000-000000000003', 'cfd00000-0002-4000-8000-000000000008', 'citizen_notified', 'Citizen notified in the app.', '2026-10-16 15:31:00+05:30'::timestamptz)
ON CONFLICT DO NOTHING;

-- ---------- Reviews of the hospital (4 shown on the screen; the 4.3 / 1,284 totals are not seeded) ----------
INSERT INTO engage.rating (id, rater_person_id, target_type, target_id, stars, comment, moderation_status, created_at, department_id, tags) VALUES
  ('cfd00000-0513-4000-8000-000000000001', 'cfd00000-0001-4000-8000-000000001005', 'hospital', 'cfd00000-0010-4000-8000-000000000001', 5, 'Dr. Arun Nair explained my sugar results clearly and the OP queue moved fast.', 'published', '2026-10-17 10:30:00+05:30'::timestamptz, 'cfd00000-0011-4000-8000-000000000101', ARRAY['Clear explanation', 'OP wait']::text[]),
  ('cfd00000-0513-4000-8000-000000000002', 'cfd00000-0001-4000-8000-000000001002', 'hospital', 'cfd00000-0010-4000-8000-000000000001', 4, 'Quick attention at night. Waiting area needs more fans.', 'published', '2026-10-16 08:10:00+05:30'::timestamptz, 'cfd00000-0011-4000-8000-000000000102', ARRAY['Quick attention', 'Cleanliness']::text[]),
  ('cfd00000-0513-4000-8000-000000000003', 'cfd00000-0001-4000-8000-000000001007', 'hospital', 'cfd00000-0010-4000-8000-000000000001', 5, 'Nurses were kind and the discharge summary came to my app the same day.', 'published', '2026-10-15 17:20:00+05:30'::timestamptz, 'cfd00000-0011-4000-8000-000000000105', ARRAY['Kind nurses']::text[]),
  ('cfd00000-0513-4000-8000-000000000004', 'cfd00000-0001-4000-8000-000000001006', 'hospital', 'cfd00000-0010-4000-8000-000000000001', 2, 'Two of my medicines were out of stock and I had to buy outside.', 'published', '2026-10-14 12:45:00+05:30'::timestamptz, NULL, ARRAY['Pharmacy stock']::text[])
ON CONFLICT DO NOTHING;

INSERT INTO engage.rating_reply (id, rating_id, author_user_id, body, created_at) VALUES
  ('cfd00000-0514-4000-8000-000000000001', 'cfd00000-0513-4000-8000-000000000001', 'cfd00000-0002-4000-8000-000000000008', 'Thank you. We are working on shorter OP queues.', '2026-10-17 11:00:00+05:30'),
  ('cfd00000-0514-4000-8000-000000000002', 'cfd00000-0513-4000-8000-000000000003', 'cfd00000-0002-4000-8000-000000000008', 'Thank you. We will pass this on to the maternity ward team.', '2026-10-16 09:00:00+05:30')
ON CONFLICT DO NOTHING;

-- ---------- Audit log rows seen by the hospital admin and the pharmacy admin (audit.activity_log, scope columns + hashed scope copy) ----------
-- Not idempotent by id (the chain assigns seq), so each row is guarded by details->>'seed_ref'. Stream 33 = Kerala. No patient names in details.
INSERT INTO audit.activity_log (stream_id, occurred_at, user_id, account_type, action, entity_type, patient_person_id, hospital_id, pharmacy_id, details)
SELECT 33, v.at, v.uid, v.acct, v.action, v.etype, v.pat, v.hid, v.pid, v.det
FROM (VALUES
  ('h-audit-1', '2026-10-17 15:44:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000003'::uuid, 'staff'::identity.account_type, 'access.denied', NULL, NULL::uuid, 'cfd00000-0010-4000-8000-000000000001'::uuid, NULL::uuid, '{"seed_ref": "h-audit-1", "summary": "Tried to open a record outside the admission · 403", "scope": {"hospital": "cfd00000-0010-4000-8000-000000000001"}}'::jsonb),
  ('h-audit-2', '2026-10-17 15:20:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000002'::uuid, 'doctor'::identity.account_type, 'session.open', 'access_session', 'cfd00000-0001-4000-8000-000000000001'::uuid, 'cfd00000-0010-4000-8000-000000000001'::uuid, NULL::uuid, '{"seed_ref": "h-audit-2", "summary": "Citizen key session · 30 min", "scope": {"hospital": "cfd00000-0010-4000-8000-000000000001"}}'::jsonb),
  ('h-audit-3', '2026-10-17 14:02:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000102'::uuid, 'doctor'::identity.account_type, 'breakglass.open', 'access_session', 'cfd00000-0503-4000-8000-000000000011'::uuid, 'cfd00000-0010-4000-8000-000000000001'::uuid, NULL::uuid, '{"seed_ref": "h-audit-3", "summary": "Break-glass · Casualty", "scope": {"hospital": "cfd00000-0010-4000-8000-000000000001"}}'::jsonb),
  ('h-audit-4', '2026-10-17 11:40:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000008'::uuid, 'hospital_admin'::identity.account_type, 'admin.approve', 'approval_request', NULL::uuid, 'cfd00000-0010-4000-8000-000000000001'::uuid, NULL::uuid, '{"seed_ref": "h-audit-4", "summary": "Approved staff account · Nurse · Ward 3", "scope": {"hospital": "cfd00000-0010-4000-8000-000000000001"}}'::jsonb),
  ('h-audit-5', '2026-10-17 10:05:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000004'::uuid, 'staff'::identity.account_type, 'lab.upload', 'order', NULL::uuid, 'cfd00000-0010-4000-8000-000000000001'::uuid, NULL::uuid, '{"seed_ref": "h-audit-5", "summary": "Result uploaded to order ORD-DEMO-5521", "scope": {"hospital": "cfd00000-0010-4000-8000-000000000001"}}'::jsonb),
  ('h-audit-6', '2026-10-17 09:12:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000008'::uuid, 'hospital_admin'::identity.account_type, 'admin.permission', NULL, NULL::uuid, 'cfd00000-0010-4000-8000-000000000001'::uuid, NULL::uuid, '{"seed_ref": "h-audit-6", "summary": "Permission changed · Radiology · attach images to an order", "scope": {"hospital": "cfd00000-0010-4000-8000-000000000001"}}'::jsonb),
  ('h-audit-7', '2026-10-17 08:01:00+05:30'::timestamptz, NULL::uuid, NULL::identity.account_type, 'system.sync', NULL, NULL::uuid, 'cfd00000-0010-4000-8000-000000000001'::uuid, NULL::uuid, '{"seed_ref": "h-audit-7", "summary": "Bed counts sent to the district dashboard", "scope": {"hospital": "cfd00000-0010-4000-8000-000000000001"}}'::jsonb),
  ('p-audit-1', '2026-10-17 15:42:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000006'::uuid, 'pharmacist'::identity.account_type, 'rx.dispense', NULL, NULL::uuid, NULL::uuid, 'cfd00000-0012-4000-8000-000000000001'::uuid, '{"seed_ref": "p-audit-1", "summary": "Rx DEMO-RX-88213 · Metformin 500 mg x 60", "scope": {"pharmacy": "cfd00000-0012-4000-8000-000000000001"}}'::jsonb),
  ('p-audit-2', '2026-10-17 15:31:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000007'::uuid, 'pharmacy_admin'::identity.account_type, 'stock.publish', NULL, NULL::uuid, NULL::uuid, 'cfd00000-0012-4000-8000-000000000001'::uuid, '{"seed_ref": "p-audit-2", "summary": "Atorvastatin 10 mg shown in public finder", "scope": {"pharmacy": "cfd00000-0012-4000-8000-000000000001"}}'::jsonb),
  ('p-audit-3', '2026-10-17 15:12:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000301'::uuid, 'pharmacist'::identity.account_type, 'rx.block_batch', NULL, NULL::uuid, NULL::uuid, 'cfd00000-0012-4000-8000-000000000001'::uuid, '{"seed_ref": "p-audit-3", "summary": "Counter blocked batch RN-2291 (recall)", "scope": {"pharmacy": "cfd00000-0012-4000-8000-000000000001"}}'::jsonb),
  ('p-audit-4', '2026-10-17 14:55:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000302'::uuid, 'pharmacist'::identity.account_type, 'stock.receive', NULL, NULL::uuid, NULL::uuid, 'cfd00000-0012-4000-8000-000000000001'::uuid, '{"seed_ref": "p-audit-4", "summary": "PO-2026-0401 · 31 lines checked in", "scope": {"pharmacy": "cfd00000-0012-4000-8000-000000000001"}}'::jsonb),
  ('p-audit-5', '2026-10-17 14:20:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000007'::uuid, 'pharmacy_admin'::identity.account_type, 'staff.invite', NULL, NULL::uuid, NULL::uuid, 'cfd00000-0012-4000-8000-000000000001'::uuid, '{"seed_ref": "p-audit-5", "summary": "Anu George invited as pharmacist", "scope": {"pharmacy": "cfd00000-0012-4000-8000-000000000001"}}'::jsonb),
  ('p-audit-6', '2026-10-17 13:48:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000006'::uuid, 'pharmacist'::identity.account_type, 'rx.dispense', NULL, NULL::uuid, NULL::uuid, 'cfd00000-0012-4000-8000-000000000001'::uuid, '{"seed_ref": "p-audit-6", "summary": "Rx DEMO-RX-88190 · Amlodipine 5 mg x 30", "scope": {"pharmacy": "cfd00000-0012-4000-8000-000000000001"}}'::jsonb),
  ('p-audit-7', '2026-10-17 11:02:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000301'::uuid, 'pharmacist'::identity.account_type, 'auth.signin', NULL, NULL::uuid, NULL::uuid, 'cfd00000-0012-4000-8000-000000000001'::uuid, '{"seed_ref": "p-audit-7", "summary": "Sign-in · two-step · Counter 1 terminal", "scope": {"pharmacy": "cfd00000-0012-4000-8000-000000000001"}}'::jsonb),
  ('p-audit-8', '2026-10-17 09:15:00+05:30'::timestamptz, 'cfd00000-0002-4000-8000-000000000007'::uuid, 'pharmacy_admin'::identity.account_type, 'staff.deactivate', NULL, NULL::uuid, NULL::uuid, 'cfd00000-0012-4000-8000-000000000001'::uuid, '{"seed_ref": "p-audit-8", "summary": "Bindu Varghese deactivated · on long leave", "scope": {"pharmacy": "cfd00000-0012-4000-8000-000000000001"}}'::jsonb)
) AS v(ref, at, uid, acct, action, etype, pat, hid, pid, det)
WHERE NOT EXISTS (SELECT 1 FROM audit.activity_log l WHERE l.details ->> 'seed_ref' = v.ref);

COMMIT;
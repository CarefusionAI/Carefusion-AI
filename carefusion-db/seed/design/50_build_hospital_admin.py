"""Generator of 50_hospital_admin.sql (python3 50_build_hospital_admin.py). Hand-run when the design data changes; the .sql is what the runner applies."""
import sys, hashlib
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_admin_common import *

o = Out()
H1 = uid(10, 1)
PH1 = uid(12, 1)
PH2 = uid(12, 2)
U = lambda s: uid(2, s)
P = lambda s: uid(1, s)
D = lambda s: uid(11, s)
DIST = "util.seed_district('Pathanamthitta')"
MEERA, SUMA = U(8), U(7)

o.w("""-- =====================================================================
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
""")

# ------------------------------------------------------------------ wards + beds
o.w("-- ---------- Ward 4 (general medicine overflow) and the beds of the other departments of Demo General Hospital ----------")
o.insert("org.ward", "id, hospital_id, department_id, code, name",
         [f"('{uid(501, 4)}', '{H1}', '{D(101)}', 'W4', 'Ward 4')"])

WARDS = [  # ward n, ward uid kind, dept serial, total, occupied, bed_type, namer
    (4, 501, 101, 24, 24, "general", lambda k: f"W4-{k}"),
    (11, 13, 102, 20, 18, "general", lambda k: f"Casualty {k}"),
    (12, 13, 103, 20, 18, "icu", lambda k: f"ICU-{k}"),
    (13, 13, 105, 30, 24, "maternity", lambda k: f"Maternity {k}"),
    (14, 13, 104, 30, 21, "paediatric", lambda k: f"NICU-{k}" if k <= 4 else f"PAE-{k}"),
    (15, 13, 106, 20, 15, "general", lambda k: f"Ortho {k}"),
    (16, 13, 107, 20, 20, "general", lambda k: f"Surgical {k}"),
]
rows = []
for n, wk, dept, total, occ, btype, namer in WARDS:
    for k in range(1, total + 1):
        st = "occupied" if k <= occ else "free"
        rows.append(f"('{uid(502, n * 1000 + k)}', '{uid(wk, n)}', '{H1}', {q(namer(k))}, '{btype}', '{st}')")
o.insert("org.bed", "id, ward_id, hospital_id, bed_no, bed_type, status", rows)
o.w("""-- Bed counts per bed type (cache of org.bed, read by the district dashboard). Covers Ward 3, Ward 5 (base) and the beds above.
INSERT INTO org.bed_availability (hospital_id, bed_type, total, free, updated_by)
SELECT b.hospital_id, b.bed_type, count(*) FILTER (WHERE b.status <> 'out_of_service')::int,
       count(*) FILTER (WHERE b.status = 'free')::int, '%s'
FROM org.bed b WHERE b.hospital_id = '%s' GROUP BY b.hospital_id, b.bed_type
ON CONFLICT (hospital_id, bed_type) DO NOTHING;
""" % (MEERA, H1))

# ------------------------------------------------------------------ applicants
o.w("-- ---------- 5 staff applicants waiting for the hospital admin (people, pending accounts, profiles) ----------")
APPS = [
    # n, slug, name, dob, sex, acct, role label, dept label, applied (IST), registry, employment, docs, blocked
    (1, "nisha-abraham", "Dr. Nisha Abraham", "1987-06-12", "female", "doctor", "Doctor", "Paediatrics", "2026-10-17 10:12",
     "HPR DEMO-HPR-71-4410", "Government",
     [("MBBS degree certificate", "University of Kerala · 2014", True, False), ("MD Paediatrics", "AIIMS demo · 2018", True, False),
      ("Demo Medical Council registration", "Valid till 2029", False, False), ("Appointment order", "DHS Kerala · 02 Oct 2026", False, False)], None),
    (2, "rajeev-pillai", "Dr. Rajeev Pillai", "1983-02-03", "male", "doctor", "Doctor", "Orthopaedics", "2026-10-16 09:40",
     "HPR DEMO-HPR-71-3982", "Visiting · private",
     [("MBBS degree certificate", "Calicut University · 2009", False, False), ("MS Orthopaedics", "2013", False, False),
      ("Demo Medical Council registration", "Expired Aug 2026", False, True), ("Visiting consultant agreement", "Signed 30 Sep", False, False)],
     "Registration expired: the council registration expired in Aug 2026. Approving is blocked until a renewed certificate is uploaded."),
    (3, "sreelakshmi-kurup", "Sreelakshmi Kurup", "1997-11-20", "female", "staff", "Nurse", "ICU", "2026-10-15 11:05",
     "DNC DEMO-88231", "Contract",
     [("B.Sc Nursing", "2019", False, False), ("Demo Nursing Council registration", "Valid till 2028", False, False), ("Appointment order", "NHM · 10 Oct", False, False)], None),
    (4, "arjun-das", "Arjun Das", "1999-04-08", "male", "staff", "Lab tech", "Laboratory", "2026-10-14 14:20",
     "DPC DEMO-1140", "Government",
     [("DMLT certificate", "2020", False, False), ("Appointment order", "DHS Kerala", False, False)], None),
    (5, "minu-joseph", "Minu Joseph", "1994-09-14", "female", "staff", "Radiology tech", "Radiology", "2026-10-12 10:30",
     "DRB DEMO-RT-221", "Government",
     [("Diploma in Radiography", "2016", False, False), ("Radiation board certificate", "Valid", False, False), ("Appointment order", "DHS Kerala", False, False)], None),
]
prow, urow = [], []
for n, slug, name, dob, sex, acct, role, dept, applied, reg, emp, docs, blocked in APPS:
    prow.append(f"('{uid(503, n)}', {q(name)}, '{dob}', '{sex}', {q(tok(slug))}, 'DEMO-0000-{8500 + n}', {q(slug.replace('-', '.') + '@demo')}, 'passed', 'passed', {ist(applied)}, 'hospital_staff')")
    urow.append(f"('{uid(504, n)}', '{uid(503, n)}', '{acct}', 'demo-kc-{acct}-{slug}', 'pending', NULL, {ist(applied)})")
# companion citizen accounts of the doctor applicants
for n, slug in ((1, "nisha-abraham"), (2, "rajeev-pillai")):
    urow.append(f"('{uid(504, 5000 + n)}', '{uid(503, n)}', 'citizen', 'demo-kc-citizen-{slug}', 'active', NULL, '2026-10-01 00:00:00+05:30')")
o.insert("identity.person", "id, full_name, date_of_birth, sex, aadhaar_token, abha_number, abha_address, kyc_status, face_check_status, created_at, registration_channel", prow)
o.w("-- the unidentified casualty patient of break-glass review b1 (shape rule: temporary label, estimated DOB, no Aadhaar / ABHA)")
o.insert("identity.person", "id, full_name, date_of_birth, sex, kyc_status, face_check_status, created_at, registration_channel, is_unidentified, temp_label, dob_estimated",
         [f"('{uid(503, 11)}', 'Unidentified patient (Casualty)', '1981-01-01', 'male', 'pending', 'pending', '2026-10-17 14:02:00+05:30', 'hospital_staff', true, 'Unknown male ~45 (DEMO-0000-5512)', true)"],
         label="identity.person (unidentified)")
o.insert("identity.app_user", "id, person_id, account_type, keycloak_sub, status, status_reason, created_at", urow)
o.insert("identity.citizen_profile", "person_id, preferred_language, district_id",
         [f"('{uid(503, 1)}', 'en', {DIST})", f"('{uid(503, 2)}', 'en', {DIST})"])
o.insert("identity.doctor_profile",
         "user_id, hpr_id, council_name, council_reg_no, specialisation, degrees, hospital_id, department_id, employment_type, signing_method",
         [f"('{uid(504, 1)}', 'DEMO-HPR-71-4410', 'Demo Medical Council, Kerala', 'DEMO-MC-60412', 'Paediatrics', {jb([{'degree': 'MBBS', 'year': 2014}, {'degree': 'MD Paediatrics', 'year': 2018}])}, '{H1}', '{D(104)}', 'govt', 'mock')",
          f"('{uid(504, 2)}', 'DEMO-HPR-71-3982', 'Demo Medical Council, Kerala', 'DEMO-MC-39871', 'Orthopaedics', {jb([{'degree': 'MBBS', 'year': 2009}, {'degree': 'MS Orthopaedics', 'year': 2013}])}, '{H1}', '{D(106)}', 'private', 'mock')"])
o.insert("identity.staff_profile", "user_id, hospital_id, department_id, staff_role, created_by_user_id, ward_id, registration_no, designation",
         [f"('{uid(504, 3)}', '{H1}', '{D(103)}', 'nurse', '{MEERA}', '{uid(13, 12)}', 'DNC DEMO-88231', 'Staff nurse (ICU)')",
          f"('{uid(504, 4)}', '{H1}', '{D(108)}', 'lab', '{MEERA}', NULL, 'DPC DEMO-1140', 'Lab technician')",
          f"('{uid(504, 5)}', '{H1}', '{D(109)}', 'radiology', '{MEERA}', NULL, 'DRB DEMO-RT-221', 'Radiographer')"])

# approvals
o.w("-- ---------- Staff approvals queue (admin.approval_request: hospital-level approver, 7-day limit) ----------")
arows = []
for n, slug, name, dob, sex, acct, role, dept, applied, reg, emp, docs, blocked in APPS:
    cr = {"role": role, "department": dept, "registry": reg, "employment": emp, "ekyc": "passed",
          "documents": [{"title": t, "meta": m, "checked": c, "expired": e} for t, m, c, e in docs],
          "blocked_reason": blocked}
    arows.append(f"('{uid(505, n)}', 'hospital_staff', '{uid(504, n)}', '{uid(503, n)}', '{H1}', 1, 'hospital', '{H1}', 'pending', {ist(applied)}, "
                 f"{ist(applied)} + interval '7 days', {jb(cr)}, 'normal', NULL, NULL, NULL)")
# Lekha Pillai: approved today 11:40 by the hospital admin (audit row "Approved Lekha Pillai · Nurse · Ward 3")
cr = {"role": "Nurse", "department": "Ward 3", "registry": "DNC DEMO-4471", "employment": "Government", "ekyc": "passed", "documents": []}
arows.append(f"('{uid(505, 6)}', 'hospital_staff', '{U(3)}', '{P(3)}', '{H1}', 1, 'hospital', '{H1}', 'approved', '2026-10-15 09:00:00+05:30', "
             f"'2026-10-22 09:00:00+05:30', {jb(cr)}, 'normal', '{MEERA}', '2026-10-17 11:40:00+05:30', 'Approved')")
o.insert("admin.approval_request",
         "id, subject_type, subject_user_id, subject_person_id, subject_hospital_id, step, assigned_level, assigned_hospital_id, status, submitted_at, due_at, check_results, priority, decided_by_user_id, decided_at, reason",
         arows)

# ------------------------------------------------------------------ permission override
o.w("-- ---------- Roles and permissions: the default matrix (9 permissions x 6 roles) is in migration 128; one hospital override ----------")
o.w("-- Audit story 09:12: 'Radiology: attach images to an order' was set by the hospital admin (same value as the default).")
o.insert("admin.hospital_permission_override", "hospital_id, role_key, permission_code, allowed, updated_by",
         [f"('{H1}', 'radiology', 'attach_images', true, '{MEERA}')"])

# ------------------------------------------------------------------ invites + pharmacist state
o.w("-- ---------- Pharmacy admin: invites (Anu George pending, Faisal Rahman accepted) ----------")
inv = [
    (1, "Anu George", "anu.george@demo.example", "DSPC DEMO-41982", None, "2026-10-15 10:20", "2026-10-22 10:20", None, None),
    (2, "Faisal Rahman", "faisal.rahman@demo.example", "DSPC DEMO-40517", "night", "2026-10-10 09:00", "2026-10-17 09:00", "2026-10-12 08:30", U(304)),
]
irows = []
for n, name, mail, reg, shift, created, exp, acc, accuser in inv:
    irows.append(f"('{uid(506, n)}', '{PH1}', 'pharmacist', {q(name)}, sha256({q(mail)}::bytea), sha256({q('demo-invite-token-' + str(n))}::bytea), "
                 f"{q(reg)}, {q(shift)}, '{SUMA}', {ist(created)}, {ist(created)}, {ist(exp)}, {ist(acc) if acc else 'NULL'}, {q(accuser)})")
o.insert("identity.staff_invite",
         "id, pharmacy_id, role_kind, full_name, email_hash, token_hash, registration_no, shift, invited_by_user_id, created_at, last_sent_at, expires_at, accepted_at, accepted_user_id", irows)

o.w("-- ---------- Pharmacists: counter and break state now (the design's Overview 'Pharmacists on shift' card) ----------")
o.w("-- Joseph Mathew is Counter 2 (his own app / persona) and Divya Raj Counter 1: the pharmacy admin screen swaps the two; persona wins.")
cs = [(6, "Counter 2", "on", "2026-10-17 08:00", "2026-10-17 14:45"), (301, "Counter 1", "on", "2026-10-17 08:00", "2026-10-17 14:44"),
      (302, "Store room", "break", "2026-10-17 14:33", "2026-10-17 14:33"), (303, None, "off", "2026-10-17 07:58", "2026-10-16 07:58"),
      (304, None, "off", "2026-10-16 08:00", "2026-10-16 08:00")]
o.insert("pharmacy.counter_state", "user_id, pharmacy_id, counter, state, since, last_active_at",
         [f"('{U(s)}', '{PH1}', {q(c)}, '{st}', {ist(since)}, {ist(last)})" for s, c, st, since, last in cs])

# ------------------------------------------------------------------ compliance documents
o.w("-- ---------- Compliance documents (org.facility_document) ----------")
docs = [
    (501, 1, "hospital", H1, None, "hfr", "HFR registration certificate · 240 sanctioned beds, 200 in service", "DEMO-HFR-KL-0193", "2026-01-12", None, "verified", U(9), "2026-01-12 10:00", MEERA),
    (501, 2, "hospital", H1, None, "clinical_licence", "Clinical establishment licence", "DEMO-HCE-KL-0193", "2025-04-01", "2027-03-31", "verified", U(9), "2026-01-12 10:00", MEERA),
    (501, 11, "pharmacy", None, PH1, "drug_licence", "Retail drug licence (Form 20 & 21)", "DEMO-DL-KL-2041", "2024-04-01", "2029-03-31", "verified", None, "2026-01-02 10:00", SUMA),
    (501, 12, "pharmacy", None, PH1, "gst", "GST registration", "DEMO-GST-32-1234", "2025-06-01", None, "verified", None, "2026-01-02 10:00", SUMA),
    (501, 13, "pharmacy", None, PH1, "pharmacist_certificate", "Registered pharmacist certificate · Joseph Mathew · DSPC DEMO-30214", "DSPC DEMO-30214", None, None, "verified", None, "2026-01-02 10:00", SUMA),
    (501, 14, "pharmacy", None, PH1, "cold_chain_log", "Cold chain log, Q3 2026 · fridge 2-8 C", None, "2026-07-01", "2026-09-30", "under_review", None, None, SUMA),
    (501, 15, "pharmacy", None, PH1, "fire_noc", "Fire NOC", "DEMO-FNOC-2041", "2025-12-01", "2026-11-30", "renew_soon", None, None, SUMA),
    (501, 16, "pharmacy", None, PH1, "narcotic_return", "Narcotic drugs register (Schedule X) · monthly return, Oct due 05 Nov", None, "2026-10-01", "2026-11-05", "upcoming", None, None, SUMA),
    (501, 21, "pharmacy", None, PH2, "drug_licence", "Retail drug licence · expires in 20 days", "DEMO-DL-KL-2988", "2023-11-07", "2026-11-06", "renew_soon", None, None, U(306)),
]
fdr = []
for k, n, ft, h, ph, dt, title, ref, vf, vu, status, ver, verat, upl in docs:
    fdr.append(f"('{uid(507, n)}', '{ft}', {q(h)}, {q(ph)}, {q(dt)}, {q(title)}, {q(ref)}, {q(vf)}, {q(vu)}, "
               f"{q('demo/facility-docs/' + dt + '-' + str(n) + '.pdf')}, '{status}', {q(ver)}, {ist(verat) if verat else 'NULL'}, '{upl}')")
o.insert("org.facility_document",
         "id, facility_type, hospital_id, pharmacy_id, doc_type, title, reference_no, valid_from, valid_until, storage_key, status, verified_by_user_id, verified_at, uploaded_by_user_id", fdr)

# ------------------------------------------------------------------ staff shifts (today)
o.w("-- ---------- Staff on duty now (org.staff_shift, today). Fathima Beevi and Dr. Sameer Ali are Off: no row. ----------")
sh = [(2, "Doctor", "09:00", "17:00"), (102, "Doctor", "08:00", "20:00"), (3, "Staff nurse", "07:00", "15:00"),
      (4, "Lab technician", "08:00", "16:00"), (121, "Staff nurse (ICU)", "07:00", "19:00"), (6, "Pharmacist", "08:00", "20:00")]
o.insert("org.staff_shift", "id, user_id, hospital_id, ward_id, role_label, shift_start, shift_end, break_taken, clocked_in_at",
         [f"('{uid(508, i)}', '{U(s)}', '{H1}', {q(uid(13, 3)) if s == 3 else (q(uid(13, 12)) if s == 121 else 'NULL')}, {q(lab)}, {ist('2026-10-17 ' + a)}, {ist('2026-10-17 ' + b)}, false, {ist('2026-10-17 ' + a)})"
          for i, (s, lab, a, b) in enumerate(sh, 1)])

# ------------------------------------------------------------------ doctor roster
o.w("-- ---------- Doctor roster, week Mon 19 - Sun 25 Oct 2026 (draft, not published); minimum 4 doctors and 1 night on-call per day ----------")
o.insert("org.roster_week", "hospital_id, week_start, min_doctors_per_day, min_night_oncall", [f"('{H1}', '2026-10-19', 4, 1)"])
# exact design rows (o = OP, n = night on-call, x = off): Arun, Vivek, Sameer, Rekha Soman, Ann Mary, Hari Prasad
ROSTER = [(2, "oooooxn"), (102, "nxnxnox"), (103, "ooxoonx"), (104, "oooxoox"), (105, "xoooonx"), (107, "oxoooxx")]
shift_name = {"o": "op", "n": "night", "x": "off"}
rr = []
i = 0
for s, pat in ROSTER:
    assert len(pat) == 7, (s, pat)
    for d, c in enumerate(pat):
        i += 1
        rr.append(f"('{uid(509, i)}', '{H1}', '{U(s)}', '2026-10-{19 + d}', '{shift_name[c]}')")
o.insert("org.doctor_roster", "id, hospital_id, doctor_user_id, duty_date, shift", rr)

# ------------------------------------------------------------------ break-glass reviews
o.w("-- ---------- Break-glass reviews for the hospital admin (sessions + emergency details + what was viewed) ----------")
# n, doctor serial, patient person id, started, minutes, reason, category, match, evidence, viewed, status, note
BG = [
    (1, 101, P(1001), "2026-10-16 03:12", 18, "Unconscious on arrival", "unconscious", "face", "Logged automatically · citizen notified",
     [("emergency_card", "Emergency card"), ("allergy", "Allergies"), ("medication", "Medicines")], "pending", None),
    (2, 102, uid(503, 11), "2026-10-17 14:02", 22,
     "Unconscious road accident patient. Identified by Aadhaar biometric. Needed allergies and blood group.", "accident", "aadhaar_biometric",
     "Casualty register entry #C-4471 · ambulance 108 handover",
     [("emergency_card", "Emergency card"), ("allergy", "Allergies"), ("document", "Last discharge summary")], "pending", None),
    (3, 103, P(1023), "2026-10-15 23:40", 41, "Transferred from PHC at night, family unreachable. Needed medication history.", "transfer", "manual",
     "Referral note DEMO-REF-2210",
     [("medication", "Medicines"), ("lab_result", "Lab reports (90 days)"), ("document", "Discharge summaries")], "ok",
     "Justified: transfer at night, family unreachable."),
    (4, 2, P(1), "2026-10-11 09:10", 6, "Citizen key not working, patient present and consenting verbally.", "key_unavailable", "manual",
     "Citizen confirmed in app afterwards", [("lab_result", "Lab reports only")], "ok", "Justified: key failure, citizen confirmed in the app."),
]
srow, erow, ivrow = [], [], []
from datetime import datetime, timedelta
ivn = 0
for n, ds, pat, start, mins, reason, cat, match, ev, viewed, status, note in BG:
    t0 = datetime.strptime(start, "%Y-%m-%d %H:%M")
    due72 = (t0 + timedelta(hours=72)).strftime("%Y-%m-%d %H:%M")
    due24 = (t0 + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M")
    notif = (t0 + timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M")
    rev = (t0 + timedelta(hours=20)).strftime("%Y-%m-%d %H:%M") if status == "ok" else None
    erow.append(f"('{uid(510, n)}', {q(reason)}, {q(cat)}, {q(match)}, {q(ev)}, {ist(due72)}, "
                f"'{status}', {q(MEERA) if status == 'ok' else 'NULL'}, {ist(rev) if rev else 'NULL'}, {q(note)}, "
                f"{ist(due24)}, {ist(notif)}, "
                f"'{'ok' if status == 'ok' else 'pending'}', {q(U(9)) if status == 'ok' else 'NULL'}, {ist(rev) if rev else 'NULL'}, "
                f"'{'ok' if n in (3, 4) else 'pending'}', {q(U(12)) if n in (3, 4) else 'NULL'}, {ist(rev) if n in (3, 4) else 'NULL'})")
    for kind, label in viewed:
        ivn += 1
        ivrow.append(f"('{uid(515, ivn)}', '{uid(510, n)}', '{pat}', '{U(ds)}', '{kind}', {q(label)}, "
                     f"{ist((t0 + timedelta(minutes=2)).strftime('%Y-%m-%d %H:%M'))})")
# simpler explicit access_session insert (columns written out)
srow = []
for n, ds, pat, start, mins, reason, cat, match, ev, viewed, status, note in BG:
    t0 = datetime.strptime(start, "%Y-%m-%d %H:%M")
    t1 = t0 + timedelta(minutes=mins)
    exp = t0 + timedelta(minutes=30)
    srow.append(f"('{uid(510, n)}', '{pat}', '{U(ds)}', 'break_glass', {ist(start)}, {ist(exp.strftime('%Y-%m-%d %H:%M'))}, "
                f"{ist(t1.strftime('%Y-%m-%d %H:%M'))}, 'doctor', true, {q(reason)})")
o.insert("access.access_session", "id, patient_person_id, user_id, mode, started_at, expires_at, ended_at, ended_by, start_inside_geofence, reason", srow)
o.insert("access.emergency_access",
         "session_id, break_glass_reason, reason_category, match_method, evidence_note, hospital_due_at, hospital_review_status, hospital_reviewer_id, hospital_reviewed_at, hospital_review_note, central_due_at, patient_notified_at, district_review_status, district_reviewer_id, district_reviewed_at, central_verify_status, central_verifier_id, central_verified_at",
         erow)
o.insert("access.item_view", "id, session_id, patient_person_id, user_id, item_kind, label, viewed_at", ivrow)

# ------------------------------------------------------------------ complaints and reviews
o.w("-- ---------- Complaints inbox of the hospital (CMP-0412 Long OP wait is filed by Anjali Menon in the citizen seed (kind 01xx)) ----------")
CMP = [
    (1, "CMP-0402", "Medicine out of stock at hospital pharmacy", P(1009), "pharmacy", "normal", "assigned", "2026-10-16 10:15",
     "Told to buy Insulin glargine outside for the second time this month.", "Hospital pharmacy counter", None),
    (2, "CMP-0403", "Rude behaviour at casualty registration", P(1019), "staff_conduct", "urgent", "open", "2026-10-15 21:40",
     "Night shift registration staff refused to help my elderly father fill the form.", "Casualty registration", None),
    (3, "CMP-0404", "Lab report delayed by 5 days", P(1008), "lab", "normal", "resolved", "2026-10-11 12:05",
     "Thyroid test report promised in 1 day, arrived after 5.", "Central Lab", "Report delivered; lab turnaround reviewed with the lab in-charge."),
]
cr, ce = [], []
for n, ref, title, who, cat, sev, status, created, body, place, res in CMP:
    resolved = "'2026-10-16 15:30:00+05:30'::timestamptz" if status == "resolved" else "NULL"
    cr.append(f"('{uid(511, n)}', {q(ref)}, {q(title)}, '{who}', 'hospital', '{H1}', {DIST}, '{H1}', {q(cat)}, {q(sev)}, {q(status)}, {q(body)}, {q(place)}, {q(res)}, {resolved}, {ist(created)}, {ist(created)})")
o.insert("engage.complaint", "id, ref_no, title, raised_by_person_id, about_type, about_id, district_id, hospital_id, category, severity, status, body, place_text, resolution, resolved_at, created_at, updated_at", cr)
ev = [
    (1, 1, "assigned", "Assigned to PRO desk · Sindhu V.", "2026-10-16 11:00", MEERA),
    (2, 3, "assigned", "Assigned to PRO desk · Sindhu V.", "2026-10-12 09:30", MEERA),
    (3, 3, "resolved", "Report delivered; lab turnaround reviewed with the lab in-charge.", "2026-10-16 15:30", MEERA),
    (4, 3, "citizen_notified", "Citizen notified in the app.", "2026-10-16 15:31", MEERA),
]
o.insert("engage.complaint_event", "id, complaint_id, actor_user_id, kind, text, created_at",
         [f"('{uid(512, n)}', '{uid(511, c)}', '{a}', '{k}', {q(t)}, {ist(at)})" for n, c, k, t, at, a in ev])

o.w("-- ---------- Reviews of the hospital (4 shown on the screen; the 4.3 / 1,284 totals are not seeded) ----------")
REV = [
    (1, P(1005), 5, "2026-10-17 10:30", 101, "Dr. Arun Nair explained my sugar results clearly and the OP queue moved fast.", ["Clear explanation", "OP wait"]),
    (2, P(1002), 4, "2026-10-16 08:10", 102, "Quick attention at night. Waiting area needs more fans.", ["Quick attention", "Cleanliness"]),
    (3, P(1007), 5, "2026-10-15 17:20", 105, "Nurses were kind and the discharge summary came to my app the same day.", ["Kind nurses"]),
    (4, P(1006), 2, "2026-10-14 12:45", None, "Two of my medicines were out of stock and I had to buy outside.", ["Pharmacy stock"]),
]
o.insert("engage.rating", "id, rater_person_id, target_type, target_id, stars, comment, moderation_status, created_at, department_id, tags",
         [f"('{uid(513, n)}', '{who}', 'hospital', '{H1}', {st}, {q(txt)}, 'published', {ist(at)}, {q(D(d)) if d else 'NULL'}, {arr(tags)})"
          for n, who, st, at, d, txt, tags in REV])
o.insert("engage.rating_reply", "id, rating_id, author_user_id, body, created_at",
         [f"('{uid(514, 1)}', '{uid(513, 1)}', '{MEERA}', 'Thank you. We are working on shorter OP queues.', '2026-10-17 11:00:00+05:30')",
          f"('{uid(514, 2)}', '{uid(513, 3)}', '{MEERA}', 'Thank you. We will pass this on to the maternity ward team.', '2026-10-16 09:00:00+05:30')"])

# ------------------------------------------------------------------ audit log rows (hospital + pharmacy scope)
o.w("-- ---------- Audit log rows seen by the hospital admin and the pharmacy admin (audit.activity_log, scope columns + hashed scope copy) ----------")
o.w("-- Not idempotent by id (the chain assigns seq), so each row is guarded by details->>'seed_ref'. Stream 33 = Kerala. No patient names in details.")
AUD = [
    # ref, time, user serial, acct, action, entity_type, patient, hospital?, pharmacy?, summary
    ("h-audit-1", "2026-10-17 15:44", 3, "staff", "access.denied", None, None, True, False, "Tried to open a record outside the admission · 403"),
    ("h-audit-2", "2026-10-17 15:20", 2, "doctor", "session.open", "access_session", P(1), True, False, "Citizen key session · 30 min"),
    ("h-audit-3", "2026-10-17 14:02", 102, "doctor", "breakglass.open", "access_session", uid(503, 11), True, False, "Break-glass · Casualty"),
    ("h-audit-4", "2026-10-17 11:40", 8, "hospital_admin", "admin.approve", "approval_request", None, True, False, "Approved staff account · Nurse · Ward 3"),
    ("h-audit-5", "2026-10-17 10:05", 4, "staff", "lab.upload", "order", None, True, False, "Result uploaded to order ORD-DEMO-5521"),
    ("h-audit-6", "2026-10-17 09:12", 8, "hospital_admin", "admin.permission", None, None, True, False, "Permission changed · Radiology · attach images to an order"),
    ("h-audit-7", "2026-10-17 08:01", None, None, "system.sync", None, None, True, False, "Bed counts sent to the district dashboard"),
    ("p-audit-1", "2026-10-17 15:42", 6, "pharmacist", "rx.dispense", None, None, False, True, "Rx RX-DEMO-55120 · Metformin 500 mg x 60"),
    ("p-audit-2", "2026-10-17 15:31", 7, "pharmacy_admin", "stock.publish", None, None, False, True, "Atorvastatin 10 mg shown in public finder"),
    ("p-audit-3", "2026-10-17 15:12", 301, "pharmacist", "rx.block_batch", None, None, False, True, "Counter blocked batch RN-2291 (recall)"),
    ("p-audit-4", "2026-10-17 14:55", 302, "pharmacist", "stock.receive", None, None, False, True, "PO-2026-0401 · 31 lines checked in"),
    ("p-audit-5", "2026-10-17 14:20", 7, "pharmacy_admin", "staff.invite", None, None, False, True, "Anu George invited as pharmacist"),
    ("p-audit-6", "2026-10-17 14:31", 6, "pharmacist", "rx.dispense", None, None, False, True, "Rx RX-DEMO-88190 · Losartan 50 mg x 30"),
    ("p-audit-7", "2026-10-17 11:02", 301, "pharmacist", "auth.signin", None, None, False, True, "Sign-in · two-step · Counter 1 terminal"),
    ("p-audit-8", "2026-10-17 09:15", 7, "pharmacy_admin", "staff.deactivate", None, None, False, True, "Bindu Varghese deactivated · on long leave"),
]
vals = []
for ref, at, us, acct, action, et, pat, hosp, phar, summ in AUD:
    scope = {"hospital": H1} if hosp else {"pharmacy": PH1}
    det = {"seed_ref": ref, "summary": summ, "scope": scope}
    vals.append(f"({q(ref)}, {ist(at)}, {q(U(us)) if us else 'NULL'}::uuid, {q(acct)}::identity.account_type, {q(action)}, {q(et)}, {q(pat)}::uuid, "
                f"{q(H1) if hosp else 'NULL'}::uuid, {q(PH1) if phar else 'NULL'}::uuid, {jb(det)})")
o.w("""INSERT INTO audit.activity_log (stream_id, occurred_at, user_id, account_type, action, entity_type, patient_person_id, hospital_id, pharmacy_id, details)
SELECT 33, v.at, v.uid, v.acct, v.action, v.etype, v.pat, v.hid, v.pid, v.det
FROM (VALUES
""" + ",\n".join("  " + v for v in vals) + """
) AS v(ref, at, uid, acct, action, etype, pat, hid, pid, det)
WHERE NOT EXISTS (SELECT 1 FROM audit.activity_log l WHERE l.details ->> 'seed_ref' = v.ref);
""")
o.counts["audit.activity_log"] = len(vals)

o.w("COMMIT;")
open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "50_hospital_admin.sql"), "w").write(o.text())
print(o.counts)

#!/usr/bin/env python3
"""
Generator for seed/design/20_doctor_inpatient.sql  (Doctor app + Nurse app seed).

    python3 carefusion-db/seed/design/20_build_doctor.py

Deterministic (no clock, no randomness). 20_doctor_inpatient.sql is the file that is applied; this
script is only its source. Ids: cfd00000-KKKK-4000-8000-NNNNNNNNNNNN, kinds 0200-0299 only.
Everything is synthetic. Demo "today" = Saturday 17 October 2026, clock IST (+05:30).
The doctor timeline "now" is about 14:35; the nurse timeline "now" is about 10:42.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "20_doctor_inpatient.sql"
IST = "+05:30"

# ------------------------------------------------------------------ id helpers
def uid(kind: int, n: int) -> str:
    return f"cfd00000-{kind:04d}-4000-8000-{n:012d}"


def U(kind: int, n: int) -> str:          # literal uuid
    return f"'{uid(kind, n)}'"


def P(n: int) -> str:                       # identity.person
    return U(1, n)


def A(n: int) -> str:                       # identity.app_user (primary account = person serial)
    return U(2, n)


def q(s) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def ts(s: str | None) -> str:
    """'2026-10-17 14:30' -> timestamptz literal in IST."""
    if s is None:
        return "NULL"
    if len(s) == 10:
        s += " 00:00"
    if len(s) == 16:
        s += ":00"
    return f"'{s}{IST}'"


def nb(v) -> str:
    return "NULL" if v is None else str(v)


def bo(v) -> str:
    return "NULL" if v is None else ("true" if v else "false")


def jb(obj) -> str:
    return q(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def byt(text: str) -> str:                  # synthetic "ciphertext": plain UTF-8 under key id demo-none
    return f"convert_to({q(text)}, 'UTF8')"


def sha(text: str) -> str:
    return "decode('" + hashlib.sha256(text.encode()).hexdigest() + "', 'hex')"


def hrs(s: str, h: float) -> str:
    """add hours to 'YYYY-MM-DD HH:MM'"""
    from datetime import datetime, timedelta
    d = datetime.strptime(s, "%Y-%m-%d %H:%M") + timedelta(hours=h)
    return d.strftime("%Y-%m-%d %H:%M")


def mins(s: str, m: int) -> str:
    return hrs(s, m / 60.0)


# ------------------------------------------------------------------ kinds owned by this file
K_SESSION, K_SLOT, K_APPT, K_VISIT, K_BLOCK, K_DOC = 201, 202, 203, 204, 205, 206
K_AIRUN, K_AIHYP, K_AIEV, K_ORDER, K_RX, K_RXITEM = 207, 208, 209, 210, 211, 212
K_RXDELIV, K_RXDRAFT, K_REFERRAL, K_HANDOVER, K_HITEM = 213, 214, 215, 216, 217
K_THREAD, K_PART, K_MSG, K_RATING, K_ALERT, K_MED = 218, 219, 220, 221, 222, 225
K_ADM, K_VSET, K_ESC, K_TASK, K_NOTE, K_MEDORD = 230, 232, 233, 234, 235, 236
K_MAR, K_WSTOCK, K_WREQ, K_SHIFT, K_ALLERGY, K_COND = 237, 238, 239, 240, 242, 243
K_MEDCUR, K_IMM, K_CHATS, K_CHATM, K_LOC, K_ITEMV, K_PERSON2 = 244, 246, 249, 250, 252, 253, 299

HOSP = U(10, 1)
DEPT_GM, DEPT_CAS, DEPT_ICU, DEPT_LAB, DEPT_RAD = U(11, 101), U(11, 102), U(11, 103), U(11, 108), U(11, 109)
WARD3 = U(13, 3)
BED = lambda n: U(14, 3000 + n)

# person serials (see IDS.md)
ANJALI, ARUN, LEKHA, RAHUL, FATHIMA_B, JOSEPH_M, MEERA = 1, 2, 3, 4, 5, 6, 8
AJAY, BANERJEE = 9, 12
SREEJA, VIVEK, SAMEER, LEELA, HEMA, ANITHA_G = 101, 102, 103, 108, 114, 112
ASHA, MINI_J, BEENA, REJO, ANOOP, VINOD_K = 121, 122, 123, 124, 125, 126
TKURIAN, TVARG, JKURIAN, MTHOMAS, LAKSHMI, RPILLAI, FNAZAR, BIJU, SPILLAI, BABU = 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010
SINDHU, ABDUL, SREEDEVI, MARY, GOPI, DIVYA, AKHIL, RSASI, MARIAMMA, BINDU_V = 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020
NISHA, JPHILIP, THANKAMMA, RAVI, SASI_K = 1021, 1022, 1023, 2001, 2002
ANITHA = 1103

NAME = {1: "Anjali Menon", 2: "Dr. Arun Nair", 3: "Lekha Pillai", 4: "Rahul Varghese", 5: "Fathima Beevi",
        101: "Dr. Sreeja Paul", 102: "Dr. Vivek Menon", 103: "Dr. Sameer Ali", 108: "Dr. Leela George", 114: "Dr. Hema Kurup",
        1001: "Thomas Kurian", 1002: "Thomas Varghese", 1003: "Joseph Kurian", 1004: "Mini Thomas", 1005: "Lakshmi Amma",
        1006: "Ramesh Pillai", 1007: "Fathima Nazar", 1008: "Biju George", 1009: "Suresh Pillai", 1010: "Babu Jacob",
        1011: "Sindhu Raj", 1012: "Abdul Rasheed", 1013: "Sreedevi Amma", 1014: "Mary George", 1015: "Gopi Mohan",
        1016: "Divya Ramesh", 1017: "Akhil Suresh", 1018: "Rahul Sasi", 1019: "Mariamma Joseph", 1020: "Bindu Vijayan",
        1021: "Nisha Rajan", 1022: "Joseph Philip", 1023: "Thankamma Pillai", 1103: "Anitha Mathew", 2001: "Ravi Menon",
        1101: "Ramesh Kaimal", 1102: "Lalitha Panicker", 1105: "Joy Varghese", 1109: "Saji Nair", 1110: "Usha Devi", 1113: "Ali Hassan",
        1114: "Bindu Sasidharan", 1115: "Mohan Lal", 1116: "Rosamma Thomas", 1117: "Shibu Philip", 1119: "Kunjumon Chacko",
        1120: "Fousiya Abdulla", 1121: "Vinod Raj", 1122: "Ammini Kurup", 1123: "Rajan Chacko", 1124: "Sathi Kumari",
        2002: "Sasi Kumar", 102: "Dr. Vivek Menon"}

out: list[str] = []
AIK: dict = {}
maps: dict[str, list[str]] = {}               # serial maps for the header


def w(s: str = "") -> None:
    out.append(s)


def insert(table: str, cols: list[str], rows: list[list[str]], conflict: str = "ON CONFLICT DO NOTHING") -> None:
    if not rows:
        return
    body = ",\n".join("  (" + ", ".join(r) + ")" for r in rows)
    w(f"INSERT INTO {table} ({', '.join(cols)}) VALUES\n{body}\n{conflict};")


def section(title: str) -> None:
    w()
    w(f"-- ---------- {title} ----------")


# ================================================================== NEWS2 (same rules as inpatient.news2_parts)
def news2(rr, spo2, o2, sbp, pulse, temp, avpu):
    p = [3 if rr <= 8 else 1 if rr <= 11 else 0 if rr <= 20 else 2 if rr <= 24 else 3,
         3 if spo2 <= 91 else 2 if spo2 <= 93 else 1 if spo2 <= 95 else 0,
         2 if o2 else 0,
         3 if sbp <= 90 else 2 if sbp <= 100 else 1 if sbp <= 110 else 0 if sbp <= 219 else 3,
         3 if pulse <= 40 else 1 if pulse <= 50 else 0 if pulse <= 90 else 1 if pulse <= 110 else 2 if pulse <= 130 else 3,
         0 if avpu == "A" else 3,
         3 if temp <= 35.0 else 1 if temp <= 36.0 else 0 if temp <= 38.0 else 1 if temp <= 39.0 else 2]
    tot = sum(p)
    band = "high" if tot >= 7 else "medium" if tot >= 5 else "low_medium" if max(p) == 3 else "low"
    return tot, band


# ================================================================== reference: medicines (shared with 40_)
# (serial, generic_name, form, strength, schedule, category)
MEDS = [
    (1, "Metformin", "tablet", "500 mg", "none", "Diabetes"),
    (2, "Atorvastatin", "tablet", "10 mg", "none", "Cardiac"),
    (3, "Vitamin D3 (cholecalciferol)", "capsule", "60000 IU", "none", "General"),
    (4, "Clopidogrel", "tablet", "75 mg", "none", "Cardiac"),
    (5, "Omeprazole", "capsule", "20 mg", "none", "Gastro"),
    (6, "Folic acid", "tablet", "5 mg", "none", "General"),
    (7, "Iron + folic acid", "tablet", "100 mg + 0.5 mg", "none", "General"),
    (8, "Calcium", "tablet", "500 mg", "none", "General"),
    (9, "Paracetamol", "tablet", "650 mg", "none", "General"),
    (10, "Amoxicillin", "syrup", "250 mg/5 mL", "H", "Antibiotic"),
    (11, "Methylphenidate", "tablet", "10 mg", "X", "Neuro"),
    (12, "Amlodipine", "tablet", "5 mg", "none", "Cardiac"),
    (13, "Glimepiride", "tablet", "1 mg", "none", "Diabetes"),
    (14, "Azithromycin", "tablet", "500 mg", "H", "Antibiotic"),
    (15, "Cetirizine", "tablet", "10 mg", "none", "Allergy"),
    (16, "Clotrimazole", "cream", "1%", "none", "Skin"),
    (17, "Losartan", "tablet", "50 mg", "none", "Cardiac"),
    (18, "Aspirin", "tablet", "75 mg", "none", "Cardiac"),
    (19, "Ceftriaxone", "injection", "1 g", "H1", "Antibiotic"),
    (20, "Pantoprazole", "tablet", "40 mg", "none", "Gastro"),
    (21, "Insulin regular", "injection", "100 IU/mL vial", "H", "Diabetes"),
    (22, "Salbutamol", "nebuliser solution", "2.5 mg", "none", "Respiratory"),
    (23, "Sodium chloride 0.9%", "infusion", "500 mL", "none", "Fluids"),
    (24, "Insulin glargine", "pen", "100 IU/mL", "H", "Diabetes"),
    (25, "Paracetamol", "infusion", "1 g/100 mL", "none", "General"),
]
MED = {m[1] + "|" + m[2] + "|" + m[3]: m[0] for m in MEDS}
MEDID = {m[0]: U(K_MED, m[0]) for m in MEDS}
maps["medicines (kind 0225, shared: 40_ must look up by generic_name+form+strength)"] = [
    f"{m[0]} = {m[1]} {m[3]} ({m[2]}, schedule {m[4]})" for m in MEDS]


# ================================================================== sessions
# key: (patient, user, mode, start, minutes_open_or_None, ended_by, reason, kind)
# minutes: how long it lasted; None = still open at "now". expiry = start + 30 min (key) / window (others)
SESS: list[dict] = []
SK: dict[str, int] = {}


def sess(key, patient, user, start, dur=None, ended=None, mode="key", reason=None, expires_min=30, adm=None, geo="hosp1"):
    SESS.append(dict(key=key, patient=patient, user=user, start=start, dur=dur, ended=ended, mode=mode,
                     reason=reason, exp=expires_min, adm=adm, geo=geo, n=len(SESS) + 1))
    SK[key] = len(SESS)


EXT_SESSION = {"an_now": "'cfd00000-0104-4000-8000-000000000001'"}   # Anjali's live session, written by 10_citizen.sql (kind 0104)
EXT_DOC_RX1 = "'cfd00000-0101-4000-8000-000000000003'"               # the PDF of Anjali's 17 Oct prescription, written by 10_citizen.sql


def SID(key: str) -> str:
    return EXT_SESSION.get(key) or U(K_SESSION, SK[key])


# Dr. Arun Nair, key sessions
sess("an_now", ANJALI, ARUN, "2026-10-17 14:24", None, None)   # EXTERNAL: written by 10_citizen.sql (0104-1, open, 18:42 left at 14:35); used by reference, not inserted
sess("jk_today", JKURIAN, ARUN, "2026-10-17 13:40", 22, "doctor")
sess("mt_today", MTHOMAS, ARUN, "2026-10-17 12:15", 30, "timeout")
sess("akhil_today", AKHIL, ARUN, "2026-10-17 14:05", 17, "doctor")
sess("rp_thu", RPILLAI, ARUN, "2026-10-15 11:00", 20, "doctor")
sess("la_wed", LAKSHMI, ARUN, "2026-10-14 10:30", 18, "doctor")
sess("fn_wed", FNAZAR, ARUN, "2026-10-14 11:10", 20, "doctor")
sess("an_15oct", ANJALI, ARUN, "2026-10-15 10:05", 15, "doctor")
sess("an_aug", ANJALI, ARUN, "2026-08-18 10:15", 20, "doctor")
sess("an_jul", ANJALI, ARUN, "2026-07-12 09:40", 20, "doctor")
sess("an_may", ANJALI, ARUN, "2026-05-30 10:00", 20, "doctor")
sess("an_oct2_derm", ANJALI, HEMA, "2026-10-02 11:30", 20, "doctor", geo="adoor")
sess("an_mar_derm", ANJALI, HEMA, "2026-03-04 10:30", 20, "doctor", geo="adoor")
sess("mt_16oct", MTHOMAS, ARUN, "2026-10-16 11:00", 25, "doctor")
sess("tv_sep30", TVARG, ARUN, "2026-09-30 11:00", 20, "doctor")
sess("tv_sep1", TVARG, ARUN, "2026-09-01 10:30", 20, "doctor")
sess("bj_oct4", BABU, ARUN, "2026-10-04 10:00", 20, "doctor")
sess("sp_16oct", SPILLAI, ARUN, "2026-10-16 12:00", 20, "doctor")
# other doctors
sess("tv_sreeja", TVARG, SREEJA, "2026-10-17 14:10", 18, "doctor")
sess("divya_leela", DIVYA, LEELA, "2026-10-17 13:45", 15, "doctor")
sess("divya_sep", DIVYA, LEELA, "2026-09-18 10:00", 15, "doctor")
sess("rsasi_leela", RSASI, LEELA, "2026-10-17 14:10", 20, "doctor")
sess("mariamma_cas", MARIAMMA, VIVEK, "2026-10-17 12:05", 25, "doctor")
# break-glass sessions. The four of the hospital-admin review queue (s5 Dr. Sreeja Paul / Thomas Kurian 16 Oct 03:12, b1 Dr. Vivek Menon
# unknown male 17 Oct 14:02, b2 Dr. Sameer Ali / Thankamma Pillai 15 Oct 23:40, b3 Dr. Arun Nair / Anjali Menon 11 Oct 09:10) are written by
# 50_hospital_admin.sql (kind 0510) and the 21 Sep one (Dr. Vivek Menon / Anjali) by 10_citizen.sql (0104-3). Here: Dr. Nair's two older uses.
sess("bg_oct3", None, ARUN, "2026-10-03 16:20", 12, "doctor", mode="break_glass",
     reason="Road accident, patient unconscious, unidentified, needed allergies and blood group.", expires_min=15)
sess("bg_aug12", None, ARUN, "2026-08-12 21:05", 10, "doctor", mode="break_glass",
     reason="Unconscious, known diabetic bracelet, needed conditions and blood group.", expires_min=15)
# admission-mode sessions (Lekha, nurse timeline)
sess("nu_anitha", ANITHA, LEKHA, "2026-10-17 10:41", 120, "timeout", mode="admission", expires_min=120, adm=3)
sess("nu_sreedevi", 1013, LEKHA, "2026-10-17 10:20", 120, "timeout", mode="admission", expires_min=120, adm=12)
sess("nu_tk", TKURIAN, LEKHA, "2026-10-17 10:02", 120, "timeout", mode="admission", expires_min=120, adm=7)
sess("nu_abdul", ABDUL, LEKHA, "2026-10-17 09:15", 120, "timeout", mode="admission", expires_min=120, adm=4)

# patients created for the unidentified break-glass cases of Dr. Nair (kind 0299)
UNID = {
    "bg_oct3": (2, "Unknown male ~28", "male", "1998-01-01", "Unknown male ~28 (DEMO-0000-5514)"),
    "bg_aug12": (3, "Unknown female ~55", "female", "1971-01-01", "Unknown female ~55 (DEMO-0000-5513)"),
}

# break-glass review details: key -> dict
BG = {
    "bg_oct3": dict(cat="accident", match="aadhaar_biometric", second=None, evid="Casualty register entry #C-4190",
                    hosp=("ok", MEERA, "2026-10-04 10:00", "Reviewed · justified."), dist=("ok", AJAY, "2026-10-05 10:00"), cent=("ok", BANERJEE, "2026-10-05 14:00"),
                    due_h="2026-10-06 16:20", due_c="2026-10-04 16:20", notified=None, viewed=[("emergency_card", "Emergency card"), ("allergy", "Allergies")]),
    "bg_aug12": dict(cat="unconscious", match="face_and_fingerprint", second=None, evid="Casualty register entry #C-2957",
                     hosp=("ok", MEERA, "2026-08-13 10:00", "Reviewed · justified."), dist=("ok", AJAY, "2026-08-14 10:00"), cent=("ok", BANERJEE, "2026-08-14 14:00"),
                     due_h="2026-08-15 21:05", due_c="2026-08-13 21:05", notified=None, viewed=[("emergency_card", "Emergency card")]),
}


def sess_patient(s: dict) -> str:
    if s["patient"] is None:
        return U(K_PERSON2, UNID[s["key"]][0])
    return P(s["patient"])


# ================================================================== admissions (Ward 3 board)
# bed -> (person serial, ip_number, admitted_at, diagnosis, diet, mobility, expected_discharge, doctors[], nurses[])
BOARD = {
    1: (1101, "IP-DEMO-30301", "2026-10-13 11:20", "Cellulitis, left leg", "Normal", "Independent", None),
    2: (1102, "IP-DEMO-30302", "2026-10-12 09:40", "Acute pyelonephritis", "Normal", "Independent", None),
    3: (1103, "IP-DEMO-30318", "2026-10-15 16:10", "Type 2 diabetes with lower respiratory tract infection (LRTI)", "Diabetic 1800 kcal", "Independent", "2026-10-19"),
    4: (1012, "IP-DEMO-30304", "2026-10-14 08:30", "Infected foot wound, post debridement", "Normal", "Assisted", None),
    5: (1105, "IP-DEMO-30305", "2026-10-14 19:15", "Acute gastroenteritis", "Light diet", "Independent", None),
    7: (1001, "IP-DEMO-30307", "2026-10-16 04:20", "COPD exacerbation with pneumonia", "Normal", "Bed rest", None),
    8: (1014, "IP-DEMO-30308", "2026-10-15 12:05", "Upper GI bleed, for endoscopy", "Nil by mouth until 13:00", "Independent", None),
    9: (1109, "IP-DEMO-30309", "2026-10-11 10:30", "Dengue fever, recovering", "Normal", "Independent", "2026-10-18"),
    10: (1110, "IP-DEMO-30310", "2026-10-13 15:45", "Acute exacerbation of asthma", "Normal", "Independent", None),
    11: (1015, "IP-DEMO-30311", "2026-10-14 13:00", "COPD, chest infection", "Normal", "Assisted", None),
    12: (1013, "IP-DEMO-30312", "2026-10-15 22:30", "Hypertension with fall, low BP on treatment", "Low salt", "Bed rest, fall risk high", None),
    13: (1113, "IP-DEMO-30313", "2026-10-12 17:00", "Congestive cardiac failure", "Low salt", "Assisted", None),
    14: (1114, "IP-DEMO-30314", "2026-10-14 11:10", "Acute pancreatitis", "Nil by mouth", "Bed rest", None),
    15: (1115, "IP-DEMO-30315", "2026-10-13 07:50", "Chronic kidney disease, fluid overload", "Renal diet", "Assisted", None),
    16: (1116, "IP-DEMO-30316", "2026-10-15 09:20", "Hip pain, work-up", "Normal", "Wheelchair", None),
    17: (1117, "IP-DEMO-30317", "2026-10-16 10:35", "Acute febrile illness", "Normal", "Independent", None),
    19: (1119, "IP-DEMO-30319", "2026-10-14 14:00", "Liver cirrhosis, ascites", "Low salt", "Assisted", None),
    20: (1120, "IP-DEMO-30320", "2026-10-15 18:25", "Anaemia, under work-up", "Normal", "Independent", None),
    21: (1121, "IP-DEMO-30321", "2026-10-12 12:00", "Uncontrolled diabetes", "Diabetic 1800 kcal", "Independent", None),
    22: (1122, "IP-DEMO-30322", "2026-10-16 21:40", "Acute confusion, urinary infection", "Normal", "Bed rest", None),
    23: (1123, "IP-DEMO-30323", "2026-10-13 16:30", "Stroke, rehabilitation", "Soft diet", "Wheelchair", None),
    24: (1124, "IP-DEMO-30324", "2026-10-14 20:15", "Acute bronchitis", "Normal", "Independent", None),
}
LEKHA_BEDS = [3, 4, 7, 8, 11, 12]
ADM = lambda bed: U(K_ADM, bed)
maps["admissions (kind 0230, serial = bed number in Ward 3)"] = [
    f"{b} = {NAME.get(v[0], 'person ' + str(v[0]))} ({v[1]})" for b, v in sorted(BOARD.items())]
# names for non-listed ward patients
for b, v in BOARD.items():
    NAME.setdefault(v[0], f"patient {v[0]}")

# ================================================================== clinical orders (kind 0210)
# serial: dict(...)  ; ref = ORD-DEMO-%04d
ORD: list[dict] = []
OK: dict[str, int] = {}


def order(key, patient, by, otype, details, status, prio, created, due=None, done=None, done_by=None, accepted=None,
          accepted_by=None, assigned=None, bed=None, note=None, session=None, dept=None, hosp_dept=None, rejected=None):
    ORD.append(dict(key=key, patient=patient, by=by, type=otype, details=details, status=status, prio=prio, created=created,
                    due=due, done=done, done_by=done_by, accepted=accepted, accepted_by=accepted_by, assigned=assigned,
                    bed=bed, note=note, session=session, dept=dept, n=len(ORD) + 1))
    OK[key] = len(ORD)


def OID(key: str) -> str:
    return U(K_ORDER, OK[key])


# --- doctor-app orders (LAB-/RAD- in the design) ---
order("an_lipid", ANJALI, ARUN, "lab", "Lipid profile", "done", "routine", "2026-10-17 10:07", due="2026-10-17 12:00", done="2026-10-17 11:05",
      done_by=RAHUL, accepted="2026-10-17 10:20", accepted_by=RAHUL, assigned=RAHUL, dept=DEPT_LAB,
      note="Statin review; LDL expected high. Result LDL 142 mg/dL (high) released 17 Oct 11:05.")
order("an_hba1c", ANJALI, ARUN, "lab", "HbA1c", "done", "routine", "2026-10-02 10:15", done="2026-10-04 09:30", done_by=RAHUL,
      accepted="2026-10-02 10:40", accepted_by=RAHUL, assigned=RAHUL, dept=DEPT_LAB, note="Diabetes follow-up. Result 7.4% on 4 Oct (earlier 7.9%).")
order("an_cxr", ANJALI, ARUN, "scan", "Chest X-ray PA + lateral", "done", "routine", "2026-10-15 10:12", done="2026-10-15 11:00", done_by=FATHIMA_B,
      accepted="2026-10-15 10:30", accepted_by=FATHIMA_B, assigned=FATHIMA_B, dept=DEPT_RAD, session="an_15oct",
      note="Cough 3 weeks, post infection. Contrast: none. Images uploaded, AI pre-read awaiting doctor review.")
order("tv_k", TVARG, SREEJA, "lab", "Electrolytes (potassium)", "done", "stat", "2026-10-17 13:25", due="2026-10-17 14:30", done="2026-10-17 14:02",
      done_by=RAHUL, accepted="2026-10-17 13:35", accepted_by=RAHUL, assigned=RAHUL, dept=DEPT_LAB,
      note="Critical K+ 6.1 mmol/L flagged by Rahul Varghese at 14:02; priority in OP queue.")
order("la_ns1", LAKSHMI, ARUN, "lab", "Dengue NS1", "in_progress", "urgent", "2026-10-17 13:10", due="2026-10-17 18:00",
      accepted="2026-10-17 13:30", accepted_by=RAHUL, assigned=RAHUL, dept=DEPT_LAB, note="Fever day 3. Result expected by evening.")
order("sp_echo", SPILLAI, ARUN, "scan", "Echocardiogram", "accepted", "routine", "2026-10-16 12:20", due="2026-10-20 11:00",
      accepted="2026-10-16 14:00", accepted_by=FATHIMA_B, assigned=FATHIMA_B, dept=DEPT_RAD, session="sp_16oct", note="Cardiology referral work-up. Scheduled.")
order("jk_hba1c", JKURIAN, ARUN, "lab", "HbA1c", "in_progress", "routine", "2026-10-17 08:55", due="2026-10-17 17:00",
      accepted="2026-10-17 09:20", accepted_by=RAHUL, assigned=RAHUL, dept=DEPT_LAB, note="Sample taken. Review of Glimepiride dose.")
order("jk_cxr", JKURIAN, ARUN, "scan", "Chest X-ray PA", "open", "urgent", "2026-10-17 14:30", due="2026-10-17 17:00",
      assigned=FATHIMA_B, dept=DEPT_RAD, session="jk_today", note="Ordered from the Doctor app.")
# --- radiology worklist (DEMO-IMG-xxxx in the design) ---
order("tk_ct", TKURIAN, SREEJA, "scan", "CT abdomen with contrast", "in_progress", "urgent", "2026-10-17 14:05", due="2026-10-17 15:30",
      accepted="2026-10-17 14:10", accepted_by=VINOD_K, assigned=VINOD_K, bed=7, dept=DEPT_RAD, note="RLQ pain, ? appendicitis. Contrast: IV, creatinine 0.9. CT room 1.")
order("divya_usg", DIVYA, LEELA, "scan", "Obstetric ultrasound, 20 weeks (anomaly scan)", "in_progress", "routine", "2026-10-17 13:50",
      accepted="2026-10-17 13:55", accepted_by=FATHIMA_B, assigned=FATHIMA_B, dept=DEPT_RAD, session="divya_leela", note="Anomaly scan. USG room 2.")
order("akhil_xray", AKHIL, ARUN, "scan", "X-ray wrist AP/LAT, right", "open", "urgent", "2026-10-17 14:18", due="2026-10-17 16:00",
      assigned=FATHIMA_B, dept=DEPT_RAD, session="akhil_today", note="Fall from bike, swelling. X-ray DR 1.")
order("mariamma_ct", MARIAMMA, VIVEK, "scan", "CT head, plain", "open", "stat", "2026-10-17 14:22", due="2026-10-17 15:00",
      assigned=VINOD_K, dept=DEPT_RAD, note="Sudden weakness, 72 y, CKD stage 3. CT room 1.")
order("sp_mri", SPILLAI, SREEJA, "scan", "MRI brain with gadolinium", "accepted", "routine", "2026-10-14 15:10", due="2026-10-19 14:00",
      accepted="2026-10-14 16:00", accepted_by=FATHIMA_B, assigned=FATHIMA_B, dept=DEPT_RAD,
      note="Chronic headache. Rescheduled to Mon 19 Oct 14:00 (MRI 1.5T out of service on Sat 17 Oct).")
order("bindu_usg", BINDU_V, ARUN, "scan", "Thyroid ultrasound", "done", "routine", "2026-10-16 15:00", done="2026-10-17 10:40", done_by=FATHIMA_B,
      accepted="2026-10-16 15:30", accepted_by=FATHIMA_B, assigned=FATHIMA_B, dept=DEPT_RAD, note="Neck swelling. Images uploaded 10:40.")
# --- lab worklist (LO-55xxx in the design) ---
order("tk_abg", TKURIAN, ARUN, "lab", "Arterial blood gas (ABG)", "open", "stat", "2026-10-17 09:48", due="2026-10-17 10:30", assigned=RAHUL, bed=7,
      dept=DEPT_LAB, note="Ward 3 Bed 7, COPD. Repeat ABG also planned at 16:00.")
order("abdul_cbc", ABDUL, ARUN, "lab", "CBC, CRP", "in_progress", "stat", "2026-10-17 09:58", due="2026-10-17 11:30", accepted="2026-10-17 10:05",
      accepted_by=RAHUL, assigned=RAHUL, bed=4, dept=DEPT_LAB, note="Collect 11:30. On antibiotics since 16 Oct. To verify: WBC 13.2 (high).")
order("sreedevi_lytes", 1013, ARUN, "lab", "Electrolytes", "in_progress", "stat", "2026-10-17 10:20", due="2026-10-17 11:30", accepted="2026-10-17 10:24",
      accepted_by=RAHUL, assigned=RAHUL, bed=12, dept=DEPT_LAB, note="Low BP, amlodipine withheld. Running.")
order("anitha_hba1c", ANITHA, ARUN, "lab", "HbA1c, fasting blood sugar", "in_progress", "urgent", "2026-10-17 08:15", due="2026-10-17 12:00",
      accepted="2026-10-17 08:40", accepted_by=RAHUL, assigned=RAHUL, bed=3, dept=DEPT_LAB, note="Sample sent. Running.")
order("jphilip_lipid", JPHILIP, ARUN, "lab", "Lipid profile", "open", "routine", "2026-10-17 10:30", assigned=RAHUL, dept=DEPT_LAB, note="OP. Awaiting sample.")
order("mary_lft", MARY, ARUN, "lab", "Liver function test (LFT)", "in_progress", "routine", "2026-10-17 08:55", accepted="2026-10-17 09:10",
      accepted_by=RAHUL, assigned=RAHUL, bed=8, dept=DEPT_LAB, note="To verify.")
order("nisha_thyroid", NISHA, ARUN, "lab", "TSH, T4", "in_progress", "routine", "2026-10-17 08:30", accepted="2026-10-17 08:50",
      accepted_by=RAHUL, assigned=RAHUL, dept=DEPT_LAB, note="OP. To verify.")
order("gopi_glucose", GOPI, SREEJA, "lab", "Blood glucose (random)", "open", "urgent", "2026-10-17 10:40", due="2026-10-17 11:30", assigned=RAHUL, bed=11,
      dept=DEPT_LAB, note="Ward 3 Bed 11.")
order("mary_urine", MARY, ARUN, "lab", "Urine culture", "in_progress", "routine", "2026-10-16 14:00", accepted="2026-10-16 14:20", accepted_by=RAHUL,
      assigned=RAHUL, bed=8, dept=DEPT_LAB, note="Incubating, read at 18:00.")
order("tk_bcult", TKURIAN, SREEJA, "lab", "Blood culture", "in_progress", "urgent", "2026-10-16 03:40", accepted="2026-10-16 04:05", accepted_by=RAHUL,
      assigned=RAHUL, bed=7, dept=DEPT_LAB, note="Preliminary result posted 16 Oct.")
# --- nurse-app orders (O-78xx in the design) ---
order("tk_ceftriaxone", TKURIAN, ARUN, "medication", "Ceftriaxone 1 g IV", "open", "stat", "2026-10-17 10:31", due="2026-10-17 10:00", assigned=LEKHA, bed=7,
      dept=DEPT_GM, note="Due now. Overdue dose at 10:00.")
order("gopi_cxr", GOPI, SREEJA, "scan", "Chest X-ray, portable", "open", "stat", "2026-10-17 09:40", due="2026-10-17 11:45", assigned=FATHIMA_B, bed=11,
      dept=DEPT_RAD, note="Portable. Nurse prep 11:45.")
order("sreedevi_ns", 1013, SREEJA, "medication", "IV sodium chloride 0.9% 500 mL", "accepted", "routine", "2026-10-17 10:12", accepted="2026-10-17 10:15",
      accepted_by=LEKHA, assigned=LEKHA, bed=12, dept=DEPT_GM, note="Running since 10:15.")
order("mary_insulin", MARY, ARUN, "medication", "Insulin regular sliding scale", "accepted", "routine", "2026-10-17 07:50", accepted="2026-10-17 08:00",
      accepted_by=LEKHA, assigned=LEKHA, bed=8, dept=DEPT_GM, note="Active. Hold if NBM.")
order("sreedevi_bp", 1013, SREEJA, "nursing", "Repeat BP in 30 minutes", "open", "urgent", "2026-10-17 10:40", due="2026-10-17 11:10", assigned=LEKHA, bed=12,
      dept=DEPT_GM, note="After fluids. Recheck 12:15 also planned.")
order("anitha_ceftriaxone", ANITHA, ARUN, "medication", "Ceftriaxone 1 g IV over 30 minutes", "accepted", "routine", "2026-10-17 10:31", due="2026-10-17 10:00",
      accepted="2026-10-17 10:35", accepted_by=LEKHA, assigned=LEKHA, bed=3, dept=DEPT_GM,
      note="Penicillin allergy on record. Cross-reactivity is low; doctor confirmed at 10:31.")
maps["clinical orders (kind 0210, order_ref ORD-DEMO-NNNN, NNNN = serial). 30_ must fulfil the lab/scan ones"] = [
    f"{o['n']:04d} {o['key']}: {NAME.get(o['patient'], o['patient'])} · {o['type']} · {o['details']} · {o['status']}"
    for o in ORD]


# ================================================================== prescriptions (kind 0211)
RXS: list[dict] = []
RK: dict[str, int] = {}


def rx(key, number, patient, doctor, session, issued, status, items, hospital=1, pharmacy=1, deliver=True, sig="mock", note=None):
    RXS.append(dict(key=key, number=number, patient=patient, doctor=doctor, session=session, issued=issued, status=status,
                    items=items, hospital=hospital, pharmacy=pharmacy, deliver=deliver, n=len(RXS) + 1))
    RK[key] = len(RXS)


# item: (medicine serial, dose, frequency, duration_days, quantity, instructions, with_food, times, warn)
rx("an_55120", "RX-DEMO-55120", ANJALI, ARUN, "an_now", "2026-10-17 14:30", "issued", [
    (1, "500 mg", "1-0-1 (twice daily)", 30, 60, "Walk 30 minutes daily. Repeat lipid profile in 3 months.", "after", ["08:00", "20:00"], None),
    (2, "10 mg", "0-1-0 (after lunch)", 30, 30, "Report muscle aches or dark urine.", "after", ["14:00"], None),
    (3, "60000 IU", "Once a week, Sunday morning", 56, 8, "8 weeks.", "after", ["08:00"], None)])
rx("tv_88219", "RX-DEMO-88219", TVARG, SREEJA, "tv_sreeja", "2026-10-17 14:27", "issued", [
    (4, "75 mg", "0-1-0 (once daily)", 30, 30, "Take at night.", "any", ["21:00"], "interaction"),
    (5, "20 mg", "1-0-0 (before breakfast)", 14, 14, "Take 12 hours apart from clopidogrel.", "before", ["07:30"], "interaction")])
rx("divya_88207", "RX-DEMO-88207", DIVYA, LEELA, "divya_leela", "2026-10-17 13:58", "issued", [
    (6, "5 mg", "1-0-0", 30, 30, None, "after", ["08:00"], None),
    (7, "1 tablet", "0-1-0", 30, 30, None, "after", ["14:00"], None),
    (8, "500 mg", "0-0-1", 30, 30, None, "after", ["21:00"], None)])
rx("akhil_88222", "RX-DEMO-88222", AKHIL, ARUN, "akhil_today", "2026-10-17 14:20", "issued", [
    (9, "650 mg", "SOS, maximum 3 a day", 5, 15, None, "after", [], None),
    (10, "125 mg (5 mL)", "5 mL three times a day", 5, 1, "1 bottle", "after", ["08:00", "14:00", "20:00"], None)])
rx("rsasi_88224", "RX-DEMO-88224", RSASI, LEELA, "rsasi_leela", "2026-10-17 14:28", "issued", [
    (11, "10 mg", "1-0-0", 30, 30, "Schedule X: guardian ID needed at the counter.", "after", ["08:00"], None)])
rx("mariamma_88199", "RX-DEMO-88199", MARIAMMA, VIVEK, "mariamma_cas", "2026-10-17 12:20", "issued", [
    (12, "5 mg", "1-0-0", 30, 30, None, "any", ["08:00"], None)])
rx("jk_88205", "RX-DEMO-88205", JKURIAN, ARUN, "jk_today", "2026-10-17 13:55", "issued", [
    (13, "1 mg", "1-0-0 (before breakfast)", 30, 30, "Dose reviewed against HbA1c.", "before", ["07:30"], None)])
rx("mt_88201", "RX-DEMO-88201", MTHOMAS, ARUN, "mt_16oct", "2026-10-16 11:05", "issued", [
    (4, "75 mg", "0-1-0 (once daily)", 30, 30, "CYP2C19 *1/*2: response may be reduced, review planned.", "any", ["21:00"], None)])
# history (status set directly; the dispensing rows of the past are not seeded)
rx("la_88180", "RX-DEMO-88180", LAKSHMI, ARUN, "la_wed", "2026-10-14 10:45", "dispensed", [
    (9, "650 mg", "1 tablet three times a day if fever", 5, 15, None, "after", [], None)])
rx("an_aug_47731", "RX-DEMO-47731", ANJALI, ARUN, "an_aug", "2026-08-18 10:30", "dispensed", [
    (1, "500 mg", "1-0-1 (twice daily)", 30, 60, None, "after", ["08:00", "20:00"], None),
    (2, "10 mg", "0-1-0 (after lunch)", 30, 30, None, "after", ["14:00"], None)])
rx("an_jul_44201", "RX-DEMO-44201", ANJALI, ARUN, "an_jul", "2026-07-12 09:55", "dispensed", [
    (14, "500 mg", "once daily", 3, 3, "Penicillin allergy: macrolide chosen.", "after", ["09:00"], None)])
rx("an_may_41150", "RX-DEMO-41150", ANJALI, ARUN, "an_may", "2026-05-30 10:15", "cancelled", [
    (1, "500 mg", "1-0-0 (once daily)", 30, 30, "Replaced on 18 Aug 2026 by RX-DEMO-47731.", "after", ["08:00"], None)])
rx("an_mar_39871", "RX-DEMO-39871", ANJALI, HEMA, "an_mar_derm", "2026-03-04 10:45", "dispensed", [
    (15, "10 mg", "0-0-1", 10, 10, None, "any", ["21:00"], None)], hospital=2, pharmacy=6)
rx("an_oct2_87140", "RX-DEMO-87140", ANJALI, HEMA, "an_oct2_derm", "2026-10-02 11:40", "dispensed", [
    (16, "1% cream", "Apply twice daily", 14, 1, "Ends 16 Oct.", "any", [], None)], hospital=2, pharmacy=6)
rx("tv_sep30_88101", "RX-DEMO-88101", TVARG, ARUN, "tv_sep30", "2026-09-30 11:15", "dispensed", [
    (4, "75 mg", "0-1-0", 30, 30, None, "any", ["21:00"], None),
    (18, "75 mg", "1-0-0", 30, 30, None, "after", ["08:00"], None)])
rx("tv_sep1_87702", "RX-DEMO-87702", TVARG, ARUN, "tv_sep1", "2026-09-01 10:45", "partly_dispensed", [
    (2, "40 mg", "0-0-1", 30, 30, "Partial supply, balance open.", "any", ["21:00"], None)])
rx("divya_sep_88010", "RX-DEMO-88010", DIVYA, LEELA, "divya_sep", "2026-09-18 10:10", "dispensed", [
    (6, "5 mg", "1-0-0", 30, 30, None, "after", ["08:00"], None),
    (7, "1 tablet", "0-1-0", 30, 30, None, "after", ["14:00"], None)])
maps["prescriptions (kind 0211, serial = rx_number below). items: kind 0212, serial = rx*100 + line"] = [
    f"{r['n']:02d} = {r['number']} · {NAME.get(r['patient'], r['patient'])} · {NAME.get(r['doctor'], r['doctor'])} · "
    f"{r['issued']} · status {r['status']}" for r in RXS]


# ================================================================== write file
def extra_maps():
    maps["access sessions (kind 0201; serial 1 is unused: Anjali's live 14:24 session is 0104-1 from 10_citizen.sql)"] = [
        f"{x['n']:02d} {x['key']}: {NAME.get(x['patient'], x['patient']) if x['patient'] else 'unidentified'} <- {NAME.get(x['user'], x['user'])} · {x['mode']} · {x['start']}"
        for x in SESS if x["key"] not in EXT_SESSION]
    maps["AI runs (kind 0207; hypotheses 0208 = run*10 + rank; evidence 0209 = hypothesis*10 + n)"] = [
        "1 Anjali image (chest X-ray, PENDING review, disagreement on side) | 2 Anjali genomic (uncertain, edited) | 3 Anjali temporal (agree)",
        "4 Joseph Kurian temporal HbA1c (PENDING) | 5 Mini Thomas genomic CYP2C19 (uncertain, PENDING, disagreement) | 6 Lakshmi Amma symptom chat (disagree)",
        "ai.chat_session 0249-1: Dr. Nair's clinical-assist chat in Anjali's live session (2 messages)"]
    maps["other ids"] = [
        "documents 0206: 1..17 = prescription PDF of rx serial n (serial 1 is 10_citizen.sql doc 0101-3, not written here); 101..103 = referral notes",
        "referrals 0215: 1 Suresh Pillai Cardiology Kottayam (accepted) | 2 Mini Thomas Neurology DH Kozhencherry (sent) | 3 Babu Jacob Nephrology Kottayam (seen)",
        "shift_handover 0216: 1 doctor 17:00 Arun -> Sreeja (draft) | 2 Ward 3 Lekha -> Beena (draft) | 4 doctor 16 Oct (signed); items 0217",
        "chat_thread 0218: 1 Anjali (only if 10_ did not write one) | 2 Joseph Kurian | 3 Lakshmi Amma (+ daughter Sindhu) | 4 Ramesh Pillai | 5 Fathima Nazar",
        "op_visit/appointment/slot 0204/0203/0202: serial = OP token of 17 Oct (token 7 is Anjali = 10_citizen.sql 0142-3 / 0141-3 / 0140-3)",
        "escalation 0233 and vital_set 0232 share serials; nursing_task 0234 (1-9), med_order 0236 (1-9), med_administration 0237 (1-5)",
        "ratings of Dr. Nair 0221: 1-3 named reviews, 1001-1309 background reviews (312 in total, average about 4.6)"]


def build() -> str:
    extra_maps()
    w("-- =====================================================================")
    w("-- seed/design/20_doctor_inpatient.sql : DOCTOR + NURSE (inpatient) layer of the design seed")
    w("-- (generated by 20_build_doctor.py; DO NOT EDIT BY HAND: change the generator and regenerate)")
    w("--")
    w("-- What it seeds: doctor OP queue / visits / schedule, patient access sessions (rotating key, admission mode,")
    w("--   Dr. Nair's two older break-glass uses; the 4 hospital-admin break-glass reviews are in 50_), AI results (simulated, doctor review pending/done, with disagreement), prescriptions,")
    w("--   clinical orders (lab / imaging / medication / nursing), referrals, handovers, message threads, reviews,")
    w("--   Ward 3 admissions (24-bed board), NEWS2 vital sets + escalations, nursing tasks and notes, MAR, ward stock.")
    w("-- Not here (other files): lab / imaging results (30_), pharmacy stock + dispensing (40_), donors and blood requests (70_),")
    w("--   events feed and audit log (80_).")
    w("-- Ids: cfd00000-KKKK-4000-8000-NNNNNNNNNNNN, kinds 0200-0299 only. Idempotent: ON CONFLICT DO NOTHING; base rows are never edited.")
    w("-- Demo today = Saturday 17 October 2026 (IST). Doctor timeline now ~14:35, nurse timeline now ~10:42.")
    w("-- Every AI output below is SIMULATED and requires clinician review (alpha rule 3).")
    w("-- DEPENDS ON: 00_base.sql, and 10_citizen.sql for Anjali's live session 0104-1 and the PDF 0101-3 of her prescription RX-DEMO-55120.")
    w("-- Assumptions and decisions (also in the report to the coordinator):")
    w("--   * Prescriptions are valid 180 days (the design says 30): the dispensing trigger refuses an expired prescription using the real clock,")
    w("--     and the demo runs months after 17 Oct 2026. Rx 55120 has THREE items (Vitamin D3 added, IDS suggestion); prescriber times are")
    w("--     shifted to <= 14:35 so no row lies in the future of the doctor timeline.")
    w("--   * Statuses 'issued' are meant to be dispensed by 40_; 'dispensed' / 'partly_dispensed' / 'cancelled' rows are history (no dispensing rows).")
    w("--   * NEWS2 (migration 122) differs from the prototype's partial formula: computed scores can differ by 1-2 from the screens; the board")
    w("--     states (stable / watch / critical) and Bed 7 = 7, Bed 12 = 5 match. The escalation trigger is switched off for the vital_set insert")
    w("--     (it would stamp paged_at = now()) and the escalations are written explicitly.")
    w("--   * Medicines are inserted here (kind 0225) because prescriptions and the MAR need them; 40_ must INSERT ... ON CONFLICT DO NOTHING and")
    w("--     look ids up by (generic_name, form, strength).")
    w("--   * Encrypted columns hold plain UTF-8 bytes with enc_key_id 'demo-none' (same convention as 10_citizen.sql).")
    w("--")
    w("-- SERIAL MAPS (other seed files reference these ids)")
    for title, lines in maps.items():
        w(f"--   {title}")
        for ln in lines:
            w(f"--     {ln}")
    w("--   kinds in use: 0201 access_session, 0202 appointment_slot, 0203 appointment, 0204 op_visit, 0205 doctor_schedule_block,")
    w("--     0206 document, 0207 ai_run, 0208 ai_hypothesis, 0209 ai_evidence, 0210 clinical_order, 0211 prescription, 0212 prescription_item,")
    w("--     0213 prescription_delivery, 0214 prescription_draft, 0215 referral, 0216 shift_handover, 0217 handover_item, 0218 chat_thread,")
    w("--     0219 chat_participant, 0220 chat_message, 0221 rating, 0222 clinical_alert, 0225 medicine, 0230 admission, 0232 vital_set,")
    w("--     0233 escalation, 0234 nursing_task, 0235 nursing_note, 0236 med_order, 0237 med_administration, 0238 ward_stock,")
    w("--     0239 ward_stock_request, 0240 staff_shift, 0242 allergy, 0243 condition, 0244 medication_current, 0246 immunization,")
    w("--     0249 ai chat_session, 0250 ai chat_message, 0252 location_check, 0253 item_view, 0299 unidentified patients")
    w("-- =====================================================================")
    w("BEGIN;")
    medicines()
    system_folders()
    unidentified()
    admissions()
    sessions()
    orders()
    appointments()
    prescriptions()
    # filled by later sections (functions defined below)
    for fn in (clinical_facts, ai_results, referrals, handovers, vitals, nursing, messaging, reviews, alerts, shifts):
        fn()
    w()
    w("COMMIT;")
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------- sections
def medicines():
    section("medicine catalogue entries this file needs (kind 0225; unique by generic_name+form+strength, so 40_ cannot duplicate them)")
    insert("pharmacy.medicine", ["id", "generic_name", "form", "strength", "schedule", "category"],
           [[MEDID[m[0]], q(m[1]), q(m[2]), q(m[3]), f"{q(m[4])}::pharmacy.schedule", q(m[5])] for m in MEDS])
    w("-- drug interaction: clopidogrel (4) + omeprazole (5), moderate (the doctor saw the warning on RX-DEMO-88219)")
    w(f"INSERT INTO pharmacy.drug_interaction (medicine_a_id, medicine_b_id, severity, note, source) VALUES\n"
      f"  ({MEDID[4]}, {MEDID[5]}, 'moderate', 'Omeprazole may reduce clopidogrel activation. Separate by 12 hours or use pantoprazole.', 'DEMO reference (assumption, verify clinically)')\nON CONFLICT DO NOTHING;")


FOLDER_PATIENTS = [ANJALI, JKURIAN, MTHOMAS, LAKSHMI, RPILLAI, FNAZAR, TVARG, SPILLAI, BABU, DIVYA, AKHIL, MARIAMMA, TKURIAN, 1013, ANITHA]


def system_folders():
    section("system folders (Doctor uploads, AI Chat, Image/Genomic/Temporal Analysis) for the patients used below; no-op if they exist")
    rows = []
    for p in FOLDER_PATIENTS:
        rows.append(f"({P(p)}::uuid, {A(p)}::uuid)")
    # RSASI is a minor without a login: created by the guardian's account
    rows.append(f"({P(RSASI)}::uuid, {A(SASI_K)}::uuid)")
    w("DO $$ BEGIN\n  PERFORM records.create_system_folders(v.p, v.u) FROM (VALUES\n    " + ",\n    ".join(rows) + "\n  ) AS v(p, u);\nEND $$;")


def unidentified():
    section("unidentified patients of the casualty break-glass cases (kind 0299)")
    rows = []
    for key, (n, name, sex, dob, label) in UNID.items():
        rows.append([U(K_PERSON2, n), q(name), q(dob) + "::date", f"{q(sex)}::identity.sex", "'pending'::identity.check_status",
                     "'pending'::identity.check_status", "true", q(label), "true", ts("2026-10-03 16:20") if key == "bg_oct3" else ts("2026-08-12 21:05")])
    insert("identity.person", ["id", "full_name", "date_of_birth", "sex", "kyc_status", "face_check_status", "is_unidentified", "temp_label", "dob_estimated", "created_at"], rows)


def admissions():
    section("Ward 3 admissions (kind 0230, serial = bed number): 22 occupied beds, beds 6 and 18 stay free")
    rows = []
    for bed, (person, ip, adm, diag, diet, mob, exp) in sorted(BOARD.items()):
        rows.append([ADM(bed), P(person), HOSP, q("Ward 3"), ts(adm), "NULL", P(person), DEPT_GM, BED(bed), q(ip), q(diet), q(mob), q(diag),
                     f"{q(exp)}::date" if exp else "NULL"])
    insert("access.admission", ["id", "patient_person_id", "hospital_id", "ward", "admitted_at", "discharged_at", "granted_by_person_id",
                                "department_id", "bed_id", "ip_number", "diet", "mobility", "diagnosis_text", "expected_discharge"], rows)
    team = []
    for bed, (person, ip, adm, *_r) in sorted(BOARD.items()):
        doc = ARUN
        team.append([ADM(bed), A(doc), q("doctor"), ts(adm)])
        nurse = LEKHA if bed in LEKHA_BEDS else MINI_J
        team.append([ADM(bed), A(nurse), q("nurse"), ts(adm)])
    insert("access.admission_team", ["admission_id", "user_id", "team_role", "added_at"], team)


def sessions():
    section("access sessions (kind 0201): rotating-key sessions, admission mode, break-glass; + location checks and items viewed")
    rows = []
    for s in SESS:
        if s["key"] in EXT_SESSION:
            continue
        start = s["start"]
        exp = mins(start, s["exp"])
        if s["dur"] is None:
            ended, ended_by = None, None
        else:
            ended = mins(start, s["dur"])
            ended_by = s["ended"]
            if s["ended"] == "timeout":
                ended = exp if s["mode"] != "break_glass" else mins(start, s["exp"])
        key_token = q(f"demo-key-{s['n']:03d}") if s["mode"] == "key" else "NULL"
        rows.append([U(K_SESSION, s["n"]), sess_patient(s), A(s["user"]), f"{q(s['mode'])}::access.session_mode", key_token,
                     ADM(s["adm"]) if s["adm"] else "NULL", ts(start), ts(exp),
                     ts(ended) if ended else "NULL", f"{q(ended_by)}::access.ended_by" if ended_by else "NULL",
                     "true", q(s["reason"]) if s["reason"] else "NULL"])
    insert("access.access_session", ["id", "patient_person_id", "user_id", "mode", "key_token_id", "admission_id", "started_at", "expires_at",
                                     "ended_at", "ended_by", "start_inside_geofence", "reason"], rows)
    # emergency_access rows
    w("-- break-glass details and the three review stages (hospital 72 h, district, central 24 h)")
    erows = []
    for s in SESS:
        if s["mode"] != "break_glass":
            continue
        d = BG[s["key"]]
        hs, hrv, hat, hnote = d["hosp"]
        ds, drv, dat = d["dist"] if len(d["dist"]) == 3 else (d["dist"][0], None, None)
        cs, crv, cat_ = d["cent"] if len(d["cent"]) == 3 else (d["cent"][0], None, None)
        erows.append([U(K_SESSION, s["n"]), "NULL", "NULL", "false", q(s["reason"]),
                      f"{q(ds)}::access.review_status", A(drv) if drv else "NULL", ts(dat) if dat else "NULL",
                      f"{q(cs)}::access.review_status", A(crv) if crv else "NULL", ts(cat_) if cat_ else "NULL",
                      ts(d["due_c"]), ts(d["notified"]) if d["notified"] else "NULL",
                      q(d["cat"]), A(d["second"][0]) if d["second"] else "NULL", ts(d["second"][1]) if d["second"] else "NULL",
                      f"{q(hs)}::access.review_status", A(hrv) if hrv else "NULL", ts(hat) if hat else "NULL", q(hnote) if hnote else "NULL",
                      ts(d["due_h"]), "NULL", q(d["match"]), q(d["evid"])])
    insert("access.emergency_access", ["session_id", "contact_person_id", "approved_on_contact_phone_at", "fallback_used", "break_glass_reason",
                                       "district_review_status", "district_reviewer_id", "district_reviewed_at",
                                       "central_verify_status", "central_verifier_id", "central_verified_at", "central_due_at", "patient_notified_at",
                                       "reason_category", "second_doctor_user_id", "second_doctor_at",
                                       "hospital_review_status", "hospital_reviewer_id", "hospital_reviewed_at", "hospital_review_note",
                                       "hospital_due_at", "contact_notified_at", "match_method", "evidence_note"], erows)
    # items viewed
    irows, n = [], 0
    for s in SESS:
        if s["mode"] != "break_glass":
            continue
        for i, (kind, label) in enumerate(BG[s["key"]]["viewed"]):
            n += 1
            irows.append([U(K_ITEMV, n), U(K_SESSION, s["n"]), sess_patient(s), A(s["user"]), q(kind), "NULL", q(label),
                          ts(mins(s["start"], 1 + i))])
    insert("access.item_view", ["id", "session_id", "patient_person_id", "user_id", "item_kind", "item_id", "label", "viewed_at"], irows)
    # location check at opening (and one 5 minutes later for sessions longer than 5 minutes)
    lrows, n = [], 0
    for s in SESS:
        if s["mode"] == "admission":
            continue
        x, y = ("76.7350", "9.1520") if s["geo"] == "adoor" else ("76.7871", "9.2649")
        for off in (0, 5):
            if off and (s["dur"] is not None and s["dur"] < 6):
                continue
            n += 1
            lrows.append([U(K_LOC, n), SID(s["key"]), ts(mins(s["start"], off)), f"ST_SetSRID(ST_MakePoint({x}, {y}), 4326)",
                          q("Pathanamthitta, Kerala"), "true", str(30 + off * 2), "NULL"])
    insert("access.location_check", ["id", "session_id", "checked_at", "point", "ip_area", "inside_geofence", "distance_m", "reason"], lrows)


def orders():
    section("clinical orders (kind 0210; order_ref ORD-DEMO-NNNN = serial). Lab / scan orders are fulfilled by 30_, medication / nursing by the MAR below")
    rows = []
    for o in ORD:
        bed_adm = (U(K_ADM, o["bed"]) if o["bed"] else "NULL")
        bed = BED(o["bed"]) if o["bed"] else "NULL"
        rows.append([U(K_ORDER, o["n"]), P(o["patient"]), A(o["by"]), SID(o["session"]) if o["session"] else "NULL", bed_adm, HOSP,
                     o["dept"] or DEPT_GM, f"{q(o['type'])}::records.order_type", q(o["details"]), f"{q(o['status'])}::records.order_status",
                     ts(o["due"]), A(o["done_by"]) if o["done_by"] else "NULL", ts(o["done"]), ts(o["created"]), ts(o["done"] or o["accepted"] or o["created"]),
                     q(f"ORD-DEMO-{o['n']:04d}"), f"{q(o['prio'])}::records.order_priority", A(o["accepted_by"]) if o["accepted_by"] else "NULL",
                     ts(o["accepted"]), A(o["assigned"]) if o["assigned"] else "NULL", bed, q(o["note"])])
    insert("records.clinical_order", ["id", "patient_person_id", "ordered_by_user_id", "session_id", "admission_id", "hospital_id", "department_id",
                                      "order_type", "details", "status", "due_at", "completed_by_user_id", "completed_at", "created_at", "updated_at",
                                      "order_ref", "priority", "accepted_by_user_id", "accepted_at", "assigned_to_user_id", "bed_id", "clinical_note"], rows)
    w("-- keep the order-reference sequence clear of the hand-assigned refs")
    w("DO $$ BEGIN PERFORM setval('records.order_ref_seq', greatest((SELECT last_value FROM records.order_ref_seq), 6000)); END $$;")


# ---------------------------------------------------------------- appointments + OP queue + schedule
def appointments():
    section("Dr. Arun Nair's OP block 2, Saturday 17 Oct 2026: slots (kind 0202), appointments (0203), OP visits / queue (0204)")
    # (token, patient, status, slot start or None, minutes, appt_status, visit_type, reason, checked_in, called, started, ended, session, priority, walk_in)
    V = [
        (1, JKURIAN, "done", "2026-10-17 09:00", "completed", "review", "HbA1c review", "08:50", "09:02", "09:03", "09:20", None, "normal", False),
        (2, MTHOMAS, "done", "2026-10-17 09:20", "completed", "review", "Clopidogrel review", "09:10", "09:22", "09:23", "09:38", None, "normal", False),
        (3, BABU, "no_show", "2026-10-17 09:40", "no_show", "follow_up", "Kidney follow-up", None, None, None, None, None, "normal", False),
        (5, JPHILIP, "done", None, None, None, "Walk-in, lipid check", "10:00", "10:05", "10:06", "10:22", None, "normal", True),
        (6, NISHA, "done", None, None, None, "Thyroid review, TSH and T4", "08:20", "08:30", "08:31", "08:50", None, "normal", True),
        (8, TVARG, "checked_in", "2026-10-17 14:30", "confirmed", "review", "Critical potassium review", "14:03", None, None, None, None, "priority", False),
        (9, LAKSHMI, "waiting", "2026-10-17 14:50", "confirmed", "new", "Fever day 3", "14:23", None, None, None, None, "normal", False),
        (10, RPILLAI, "waiting", "2026-10-17 15:10", "confirmed", "review", "Hypertension review", "14:17", None, None, None, None, "normal", False),
        (11, FNAZAR, "checked_in", "2026-10-17 15:30", "confirmed", "follow_up", "Antenatal, 24 weeks", "14:30", None, None, None, None, "normal", False),
        (12, BIJU, "checked_in", None, None, None, "Back pain", "14:33", None, None, None, None, "normal", True),
        (13, AKHIL, "done", None, None, None, "Wrist injury, fall from bike", "14:00", "14:04", "14:05", "14:22", "akhil_today", "normal", True),
        (14, SINDHU, "booked", "2026-10-17 16:00", "confirmed", "teleconsult", "Thyroid teleconsult (video)", None, None, None, None, None, "normal", False),
    ]
    # slot per appointment (20 min; teleconsult 60 min)
    srows, arows, vrows = [], [], []
    visit_status = {"done": "done", "no_show": "no_show", "in_consultation": "in_consultation", "checked_in": "checked_in",
                    "waiting": "waiting", "booked": "booked"}
    for (tok, patient, st, slot, ast, vtype, reason, cin, called, started, ended, sess_key, prio, walk) in V:
        appt_id = "NULL"
        if slot:
            dur = 60 if vtype == "teleconsult" else 20
            srows.append([U(K_SLOT, tok), HOSP, DEPT_GM, A(ARUN), f"tstzrange({ts(slot)}, {ts(mins(slot, dur))}, '[)')", "1",
                          f"{q('teleconsult' if vtype == 'teleconsult' else 'op')}::engage.slot_type"])
            appt_id = U(K_APPT, tok)
            arows.append([appt_id, U(K_SLOT, tok), P(patient), f"{q(ast)}::engage.appointment_status", ts(mins(slot, -60 * 24 * 2)),
                          A(ARUN), ts(mins(slot, -60 * 24 * 2 + 30)), q(f"DEMO-APT-{59000 + tok}"), str(tok), q(reason), q(vtype), "0", q(prio)])
        d = "2026-10-17 "
        vrows.append([U(K_VISIT, tok), HOSP, DEPT_GM, A(ARUN), P(patient), appt_id, "'2026-10-17'", str(tok), q(prio), bo(walk),
                      f"{q(visit_status[st])}::engage.visit_status", ts(d + cin) if cin else "NULL", ts(d + called) if called else "NULL",
                      ts(d + started) if started else "NULL", ts(d + ended) if ended else "NULL", SID(sess_key) if sess_key else "NULL"])
    insert("engage.appointment_slot", ["id", "hospital_id", "department_id", "doctor_user_id", "during", "capacity", "slot_type"], srows)
    insert("engage.appointment", ["id", "slot_id", "citizen_person_id", "status", "requested_at", "decided_by_user_id", "decided_at", "booking_ref",
                                  "token_no", "reason", "visit_type", "fee_amount", "priority"], arows)
    insert("engage.op_visit", ["id", "hospital_id", "department_id", "doctor_user_id", "patient_person_id", "appointment_id", "visit_date", "token_no",
                               "priority", "is_walk_in", "status", "checked_in_at", "called_at", "started_at", "ended_at", "access_session_id"], vrows)
    w("-- Anjali Menon's token 07 (slot 14:15, appointment 0141-3, visit 0142-3) is written by 10_citizen.sql and reused as is.")
    w("-- 14 patients today = 13 rows here + Anjali: 6 seen (tokens 1, 2, 5, 6, 13 + Anjali), 1 no-show, 5 waiting or checked in, 1 teleconsult booked.")
    # schedule blocks
    section("Dr. Arun Nair's schedule blocks, week of 12-17 Oct (kind 0205) and Dr. Sreeja Paul's visiting evening cover")
    B = [
        ("2026-10-12 09:00", "2026-10-12 13:00", "op_clinic", "OP block 2", None), ("2026-10-12 14:00", "2026-10-12 17:00", "op_clinic", "OP block 2", None),
        ("2026-10-13 08:00", "2026-10-13 09:00", "ward_round", "Ward 3", None), ("2026-10-13 10:00", "2026-10-13 14:00", "op_clinic", "OP block 2", None),
        ("2026-10-13 16:00", "2026-10-13 17:00", "teleconsult", "Video", None),
        ("2026-10-14 09:00", "2026-10-14 13:00", "op_clinic", "OP block 2", None),
        ("2026-10-14 15:00", "2026-10-14 17:00", "procedure", "Adoor", "Diabetes camp, Adoor (ward-style)"),
        ("2026-10-15 08:00", "2026-10-15 09:00", "ward_round", "Ward 3", None), ("2026-10-15 10:00", "2026-10-15 14:00", "op_clinic", "OP block 2", None),
        ("2026-10-15 16:00", "2026-10-15 17:00", "teleconsult", "Video", None),
        ("2026-10-16 09:00", "2026-10-16 13:00", "op_clinic", "OP block 2", None),
        ("2026-10-16 14:00", "2026-10-16 15:00", "procedure", "Conference room", "Case review"),
        ("2026-10-17 09:00", "2026-10-17 15:45", "op_clinic", "OP block 2", None), ("2026-10-17 16:00", "2026-10-17 17:00", "teleconsult", "Video", "Sindhu Raj, thyroid"),
    ]
    rows = [[U(K_BLOCK, i + 1), A(ARUN), HOSP, q(t), f"tstzrange({ts(a)}, {ts(b)}, '[)')", q(loc), q(note)] for i, (a, b, t, loc, note) in enumerate(B)]
    rows.append([U(K_BLOCK, len(B) + 1), A(SREEJA), HOSP, q("ward_round"), f"tstzrange({ts('2026-10-17 17:00')}, {ts('2026-10-17 21:00')}, '[)')",
                 q("OP block 2 and Ward 3"), q("Visiting evening cover from Demo Taluk Hospital, Adoor; takes Dr. Nair's 17:00 handover")])
    insert("org.doctor_schedule_block", ["id", "doctor_user_id", "hospital_id", "block_type", "during", "location", "note"], rows)


# ---------------------------------------------------------------- prescriptions
def prescriptions():
    section("prescription PDFs (documents, kind 0206) in each patient's 'Doctor uploads' folder")
    drows = []
    for r in RXS:
        if r["key"] == "an_55120":
            continue                                   # its PDF is 0101-3, written by 10_citizen.sql
        fld = f"(SELECT id FROM records.folder WHERE patient_person_id = {P(r['patient'])} AND kind = 'doctor_uploads')"
        storage = f"demo/prescriptions/{r['number']}.pdf"
        drows.append([U(K_DOC, r["n"]), P(r["patient"]), fld, q(f"e-Signed prescription {r['number']}"), "'prescription'::records.doc_type", q(storage),
                      q("application/pdf"), str(100000 + r["n"] * 1311), sha(storage), q("demo-none"), A(r["doctor"]), SID(r["session"]), ts(r["issued"]),
                      q(f"{NAME[r['doctor']]} · e-Signed"), q("e-Signed (DSC)")])
    insert("records.document", ["id", "patient_person_id", "folder_id", "title", "doc_type", "storage_key", "mime_type", "size_bytes", "sha256", "enc_key_id",
                                "created_by_user_id", "session_id", "created_at", "source_label", "signature_note"], drows)
    section("prescriptions (kind 0211) + items (0212) + delivery to the hospital pharmacy (0213). Validity 180 days (see header note)")
    rrows, irows, delrows = [], [], []
    for r in RXS:
        hosp = HOSP if r["hospital"] == 1 else U(10, 2)
        rrows.append([U(K_RX, r["n"]), P(r["patient"]), A(r["doctor"]), SID(r["session"]), hosp, ts(r["issued"]), ts(hrs(r["issued"], 24 * 180)),
                      (EXT_DOC_RX1 if r["key"] == "an_55120" else U(K_DOC, r["n"])), "'mock'::identity.signing_method", q(f"DEMO-ESIGN-{r['number'][8:]}"), q(f"demo-qr-{r['number'][8:]}"),
                      f"{q(r['status'])}::pharmacy.rx_status", ts(r["issued"]), q(r["number"])])
        for i, (med, dose, freq, days, qty, instr, food, times, warn) in enumerate(r["items"], start=1):
            override = "'Doctor aware, continue; take 12 hours apart.'" if warn == "interaction" else "NULL"
            tarr = "ARRAY[" + ", ".join(f"{q(t)}::time" for t in times) + "]::time[]" if times else "'{}'::time[]"
            irows.append([U(K_RXITEM, r["n"] * 100 + i), U(K_RX, r["n"]), MEDID[med], q(dose), q(freq), str(days), str(qty), q(instr),
                          "false", bo(warn == "interaction"), override, tarr, q(food), jb({"allergy": "no penicillin-group medicine" if r["patient"] == ANJALI else "none recorded",
                                                                                           "interaction": "see warning" if warn else "none", "simulated": True})])
        if r["deliver"] and r["status"] in ("issued", "dispensed", "partly_dispensed"):
            by = "doctor_same_hospital" if (r["hospital"] == 1 and r["pharmacy"] == 1) else "patient"
            delrows.append([U(K_RXDELIV, r["n"]), U(K_RX, r["n"]), U(12, r["pharmacy"]), f"{q(by)}::pharmacy.sent_by",
                            ts(r["issued"]), ts(hrs(r["issued"], 0.02)), "NULL"])
    insert("pharmacy.prescription", ["id", "patient_person_id", "doctor_user_id", "session_id", "hospital_id", "issued_at", "valid_until", "document_id",
                                     "signature_method", "signature_ref", "qr_token", "status", "updated_at", "rx_number"], rrows)
    insert("pharmacy.prescription_item", ["id", "prescription_id", "medicine_id", "dose", "frequency", "duration_days", "quantity", "instructions",
                                          "allergy_warning_shown", "interaction_warning_shown", "override_reason", "schedule_times", "with_food", "check_results"], irows)
    insert("pharmacy.prescription_delivery", ["id", "prescription_id", "pharmacy_id", "sent_by", "patient_agreed_at", "sent_at", "received_at"], delrows)
    section("doctor drafts (kind 0214): Ramesh Pillai amlodipine + losartan (2 items), Anjali metformin refill (needs e-sign)")
    drafts = [
        [U(K_RXDRAFT, 1), P(RPILLAI), A(ARUN), SID("rp_thu"), HOSP,
         jb([{"medicine_id": uid(K_MED, 12), "name": "Amlodipine 5 mg", "dose": "5 mg", "frequency": "1-0-0", "duration_days": 30, "quantity": 30},
             {"medicine_id": uid(K_MED, 17), "name": "Losartan 50 mg", "dose": "50 mg", "frequency": "0-0-1", "duration_days": 30, "quantity": 30}]),
         jb({"simulated": True, "note": "no interaction found"}), q("Draft · 2 items"), "NULL", ts("2026-10-15 11:18"), ts("2026-10-15 11:18")],
        [U(K_RXDRAFT, 2), P(ANJALI), A(ARUN), SID("an_now"), HOSP,
         jb([{"medicine_id": uid(K_MED, 1), "name": "Metformin 500 mg", "dose": "500 mg", "frequency": "1-0-1", "duration_days": 30, "quantity": 60}]),
         jb({"simulated": True, "egfr": "92 (kidney function OK for metformin)"}), q("Metformin refill, needs e-sign"), "NULL", ts("2026-10-17 14:31"), ts("2026-10-17 14:31")]]
    insert("pharmacy.prescription_draft", ["id", "patient_person_id", "doctor_user_id", "session_id", "hospital_id", "lines", "checks", "notes",
                                           "promoted_prescription_id", "created_at", "updated_at"], drafts)


# ---------------------------------------------------------------- the remaining sections are appended below
def _guard(table, p, cond):
    return f"NOT EXISTS (SELECT 1 FROM {table} WHERE patient_person_id = {p} AND {cond})"


def clinical_facts():
    section("clinical facts used by the chart and the emergency card (guarded: skipped if the citizen seed already wrote the same fact)")
    # (kind serial, person, substance, reaction, severity, by user, recorded_at)
    A_ = [(2, ANITHA, "Penicillin", "Rash", "moderate", ANITHA, "2026-10-15 16:30")]     # Anjali's own facts are in 10_citizen.sql
    for n, p, sub, rea, sev, by, at in A_:
        w(f"INSERT INTO records.allergy (id, patient_person_id, substance, reaction, severity, status, source, recorded_by_user_id, recorded_at)\n"
          f"SELECT {U(K_ALLERGY, n)}, {P(p)}, {q(sub)}, {q(rea)}, {q(sev)}, 'active', 'doctor', {A(ARUN)}, {ts(at)}\n"
          f"WHERE {_guard('records.allergy', P(p), f'lower(substance) = lower({q(sub)}) AND superseded_by IS NULL')}\nON CONFLICT DO NOTHING;")
    C = [
         (3, TKURIAN, "ICD-10", "J44.1", "COPD with acute exacerbation", True, "2020-01-01"),
         (4, TKURIAN, "ICD-10", "J18.9", "Pneumonia", False, "2026-10-16"),
         (5, ANITHA, "ICD-10", "E11", "Type 2 diabetes mellitus", True, "2024-06-01"),
         (6, ANITHA, "ICD-10", "J22", "Lower respiratory tract infection", False, "2026-10-15"),
         (7, 1013, "ICD-10", "I10", "Essential hypertension", True, "2018-01-01"),
         (8, TVARG, "ICD-10", "E87.5", "Hyperkalaemia", False, "2026-10-17")]
    for n, p, cs, code, name, chronic, onset in C:
        w(f"INSERT INTO records.condition (id, patient_person_id, code_system, code, name, is_chronic, onset_date, status, source, recorded_by_user_id, recorded_at)\n"
          f"SELECT {U(K_COND, n)}, {P(p)}, {q(cs)}, {q(code)}, {q(name)}, {bo(chronic)}, {q(onset)}::date, 'active', 'doctor', {A(ARUN)}, {ts(onset + ' 10:00')}\n"
          f"WHERE {_guard('records.condition', P(p), f'lower(name) = lower({q(name)}) AND superseded_by IS NULL')}\nON CONFLICT DO NOTHING;")
    w("-- (Anjali's allergy, conditions, current medicines and immunisations: written by 10_citizen.sql)")


def ai_results():
    section("AI results (kinds 0207 run, 0208 hypothesis, 0209 evidence): SIMULATED, saved in the matching AI folder, doctor review pending or done")
    FOLDER_OF = {"image": "image_analysis", "genomic": "genomic_analysis", "temporal": "temporal_analysis", "symptom_chat": "ai_chat"}
    R = [
        dict(n=1, patient=ANJALI, tool="image", session="an_now", start="2026-10-17 14:30", end="2026-10-17 14:31", status="completed",
             model="cxr-vision-sim", module="Image analysis · Chest X-ray PA, 15 Oct (2 views)", conf=0.71,
             head="Possible mild right lower zone opacity",
             text="Pattern is consistent with resolving infection. No pneumothorax, no effusion detected. Compared with the earlier film.",
             hyps=[(1, "Mild right lower zone opacity, consistent with a resolving infection", "ICD-10", "J18.9", 0.71, "SUPPORTED_WITH_CAUTION", 0.68,
                    [("guideline", "DEMO-GL-CXR-001", "global", 0.81), ("guideline", "DEMO-GL-LRTI-004", "state", 0.74), ("pubmed", "PMID-DEMO-30112", "global", 0.55)]),
                   (2, "Subsegmental atelectasis", "ICD-10", "J98.11", 0.18, "UNCERTAIN", 0.21, [("guideline", "DEMO-GL-CXR-002", "global", 0.4)]),
                   (3, "Normal study with vascular overlap", None, None, 0.11, "UNCERTAIN", 0.10, [("pubmed", "PMID-DEMO-27741", "global", 0.3)])],
             dis={"agreement": False, "kind": "laterality",
                  "models": [{"name": "cxr-doctor-view-sim", "finding": "right lower zone opacity", "confidence": 0.71},
                             {"name": "cxr-radiology-preread-sim", "finding": "left lower zone opacity, about 22 mm", "confidence": 0.58}],
                  "note": "The two simulated models disagree on the side. Shown to the doctor as a disagreement report; the doctor decides.", "simulated": True},
             review=None),
        dict(n=2, patient=ANJALI, tool="genomic", session="an_now", start="2026-10-17 14:27", end="2026-10-17 14:28", status="uncertain",
             model="genomic-panel-sim", module="Genomic panel · 24 genes", conf=0.54,
             head="SLCO1B1 variant may raise statin muscle risk",
             text="Consider a lower statin dose and monitor CK. Evidence is moderate.",
             hyps=[(1, "SLCO1B1 c.521T>C heterozygous: statin myopathy risk raised", "ClinVar", "DEMO-CV-SLCO1B1-521", 0.54, "UNCERTAIN", 0.90,
                    [("clinvar", "RCV-DEMO-SLCO1B1", "global", 0.7), ("guideline", "CPIC-DEMO-LEVEL-B", "global", 0.66)]),
                   (2, "CYP2C9 *1/*1: normal metabolism", "ClinVar", "DEMO-CV-CYP2C9-11", 0.92, "VERIFIED", 0.40, [("clinvar", "RCV-DEMO-CYP2C9", "global", 0.8)]),
                   (3, "CYP2C19 *1/*2: clopidogrel response reduced", "ClinVar", "DEMO-CV-CYP2C19-12", 0.80, "SUPPORTED_WITH_CAUTION", 0.30,
                    [("clinvar", "RCV-DEMO-CYP2C19", "global", 0.75)])],
             dis={"agreement": True, "kind": "none", "note": "Both simulated pipelines gave the same variant calls.", "simulated": True},
             review=("edited", "2026-10-17 14:33", "Variant noted. Continue atorvastatin 10 mg, check CK at 3 months, ask about muscle aches.",
                     "Variant noted. Continue atorvastatin 10 mg, check CK at 3 months, ask about muscle aches.")),
        dict(n=3, patient=ANJALI, tool="temporal", session="an_now", start="2026-10-17 14:28", end="2026-10-17 14:29", status="completed",
             model="temporal-trend-sim", module="Temporal analysis · HbA1c and LDL, Apr 2025 to Oct 2026", conf=0.82,
             head="LDL up 20% in 6 months",
             text="Glucose control improving (HbA1c 7.9% to 7.4%); lipids drifting up (LDL 118 to 142 mg/dL). Review statin adherence.",
             hyps=[(1, "LDL rising (118 to 142 mg/dL) while HbA1c improves (7.9% to 7.4%)", None, None, 0.82, "VERIFIED", 0.80,
                    [("guideline", "DEMO-GL-LIPID-007", "state", 0.78)]),
                   (2, "Statin refill gap (70% on time)", None, None, 0.60, "SUPPORTED_WITH_CAUTION", 0.50, [("regional", "DEMO-REG-ADHERENCE-02", "state", 0.5)]),
                   (3, "Diet change after the September infection", None, None, 0.30, "UNCERTAIN", 0.20, [("guideline", "DEMO-GL-LIFESTYLE-01", "global", 0.3)])],
             dis={"agreement": True, "kind": "none", "simulated": True},
             review=("agree", "2026-10-17 14:34", "Trend matches the lab records. Review statin adherence at the next visit.", None)),
        dict(n=4, patient=JKURIAN, tool="temporal", session="jk_today", start="2026-10-17 13:50", end="2026-10-17 13:51", status="completed",
             model="temporal-trend-sim", module="Temporal analysis · HbA1c trend", conf=0.80,
             head="HbA1c improving on Glimepiride",
             text="HbA1c 8.4% (Jul) to 7.9% (Oct). Today's sample is still being processed.",
             hyps=[(1, "HbA1c improving: 8.4% to 7.9% over 3 months", None, None, 0.80, "VERIFIED", 0.80, [("guideline", "DEMO-GL-DM-003", "global", 0.7)]),
                   (2, "Fasting-glucose pattern stable", None, None, 0.45, "UNCERTAIN", 0.30, [("regional", "DEMO-REG-DM-01", "state", 0.4)])],
             dis={"agreement": True, "kind": "none", "simulated": True}, review=None),
        dict(n=5, patient=MTHOMAS, tool="genomic", session="mt_today", start="2026-10-17 12:30", end="2026-10-17 12:31", status="uncertain",
             model="genomic-panel-sim", module="Genomic panel · CYP2C19", conf=0.54,
             head="CYP2C19 *1/*2: clopidogrel response may be reduced",
             text="Consider an alternative antiplatelet or a dose review. Evidence is moderate; confirm with the cardiologist.",
             hyps=[(1, "CYP2C19 *1/*2: intermediate metabolizer, clopidogrel response reduced", "ClinVar", "DEMO-CV-CYP2C19-12", 0.54, "UNCERTAIN", 0.88,
                    [("clinvar", "RCV-DEMO-CYP2C19", "global", 0.75), ("guideline", "CPIC-DEMO-LEVEL-A", "global", 0.7)]),
                   (2, "CYP2C9 *1/*1: normal", "ClinVar", "DEMO-CV-CYP2C9-11", 0.90, "VERIFIED", 0.30, [("clinvar", "RCV-DEMO-CYP2C9", "global", 0.8)])],
             dis={"agreement": False, "kind": "significance",
                  "models": [{"name": "pgx-a-sim", "finding": "moderate impact", "confidence": 0.60},
                             {"name": "pgx-b-sim", "finding": "significant impact", "confidence": 0.48}],
                  "note": "The simulated pipelines rate the clinical impact differently.", "simulated": True}, review=None),
        dict(n=6, patient=LAKSHMI, tool="symptom_chat", session="la_wed", start="2026-10-14 10:40", end="2026-10-14 10:41", status="completed",
             model="symptom-triage-sim", module="Symptom assist · fever day 3", conf=0.52,
             head="Viral fever most likely; dengue cannot be excluded",
             text="Order NS1 and platelet count; watch for warning signs.",
             hyps=[(1, "Viral fever", "ICD-10", "B34.9", 0.52, "SUPPORTED_WITH_CAUTION", 0.55, [("guideline", "DEMO-GL-FEVER-002", "state", 0.6)]),
                   (2, "Dengue fever", "ICD-10", "A90", 0.31, "UNCERTAIN", 0.40, [("regional", "DEMO-REG-DENGUE-2026", "state", 0.7)]),
                   (3, "Malaria", "ICD-10", "B54", 0.12, "UNCERTAIN", 0.10, [("guideline", "DEMO-GL-MALARIA-001", "global", 0.3)])],
             dis={"agreement": False, "kind": "ranking",
                  "models": [{"name": "triage-a-sim", "finding": "viral fever first", "confidence": 0.52},
                             {"name": "triage-b-sim", "finding": "dengue first (local outbreak)", "confidence": 0.49}],
                  "note": "Regional outbreak data moves dengue up in one model.", "simulated": True},
             review=("disagree", "2026-10-14 10:55", "Day 3 fever in a dengue-season district: dengue first, NS1 ordered.", None)),
    ]
    AIK.update({r["n"]: r for r in R})
    runs, hyps, evs, revs = [], [], [], []
    for r in R:
        out_text = json.dumps({"module": r["module"], "status": r["hyps"][0][5],
                               "confidence": r["conf"], "headline": r["head"], "text": r["text"],
                               "requires_clinician_review": True, "simulated": True, "label": "Simulated AI output. Guidance only."}, ensure_ascii=False)
        in_text = json.dumps({"simulated": True, "tool": r["tool"], "note": "synthetic demo input"})
        folder = f"(SELECT id FROM records.folder WHERE patient_person_id = {P(r['patient'])} AND kind = '{FOLDER_OF[r['tool']]}')"
        runs.append([U(K_AIRUN, r["n"]), P(r["patient"]), f"{q(r['tool'])}::ai.tool", folder, A(ARUN), SID(r["session"]), byt(in_text), byt(out_text),
                     q("demo-none"), q(r["model"]), q("0.3-sim"), "true", f"{q(r['status'])}::ai.run_status", jb(r["dis"]), ts(r["start"]), ts(r["end"]),
                     sha(out_text), ts(r["end"])])
        for (rank, label, cs, code, conf, est, score, evl) in r["hyps"]:
            hid = r["n"] * 10 + rank
            hyps.append([U(K_AIHYP, hid), U(K_AIRUN, r["n"]), str(rank), q(label), q(cs), q(code), str(conf), f"{q(est)}::ai.evidence_status", str(score)])
            for j, (st, ref, store, rel) in enumerate(evl, start=1):
                evs.append([U(K_AIEV, hid * 10 + j), U(K_AIHYP, hid), f"{q(st)}::ai.evidence_source", q(ref), q(store), str(rel)])
        if r["review"]:
            verdict, at, reason, edited = r["review"]
            revs.append([U(K_AIRUN, r["n"]), A(ARUN), f"{q(verdict)}::ai.verdict", q(reason), ts(at), q(edited)])
    insert("ai.ai_run", ["id", "patient_person_id", "tool", "folder_id", "run_by_user_id", "session_id", "input_enc", "output_enc", "enc_key_id", "model_name",
                         "model_version", "is_simulated", "status", "disagreement_report", "started_at", "finished_at", "result_sha256", "created_at"], runs)
    insert("ai.ai_hypothesis", ["id", "run_id", "rank", "label", "code_system", "code", "confidence", "evidence_status", "ranking_score"], hyps)
    insert("ai.ai_evidence", ["id", "hypothesis_id", "source_type", "source_ref", "store", "relevance"], evs)
    insert("ai.ai_review", ["run_id", "doctor_user_id", "verdict", "reason", "reviewed_at", "edited_text"], revs)
    w("-- Review state: runs 1 (Anjali chest X-ray), 4 (Joseph Kurian HbA1c trend) and 5 (Mini Thomas CYP2C19) are WAITING for Dr. Nair's review (3 pending, oldest 12:30).")
    w("-- Runs 2, 3, 6 are reviewed (edited / agree / disagree). Citizens see an AI result only after a doctor review row exists (alpha rule 3).")
    section("Dr. Nair's clinical-assist chat inside Anjali's open session (kinds 0249 session, 0250 message); simulated")
    folder = f"(SELECT id FROM records.folder WHERE patient_person_id = {P(ANJALI)} AND kind = 'ai_chat')"
    insert("ai.chat_session", ["id", "patient_person_id", "kind", "title", "started_by_user_id", "access_session_id", "folder_id", "is_simulated", "started_at"],
           [[U(K_CHATS, 1), P(ANJALI), q("clinical_assist"), q("Antibiotic options with a penicillin allergy"), A(ARUN), SID("an_now"), folder, "true", ts("2026-10-17 14:29")]])
    insert("ai.chat_message", ["id", "session_id", "seq", "role", "body_enc", "enc_key_id", "source_refs", "red_flag", "created_at"], [
        [U(K_CHATM, 1), U(K_CHATS, 1), "1", q("user"), byt("Anything I should know before prescribing an antibiotic?"), q("demo-none"), "'[]'::jsonb", "false", ts("2026-10-17 14:29")],
        [U(K_CHATM, 2), U(K_CHATS, 1), "2", q("assistant"),
         byt("Penicillin allergy recorded (rash, 2019). Last infection treated with azithromycin without issues. Consider a macrolide or doxycycline. "
             "Avoid all penicillins; cephalosporin cross-reactivity is low but caution advised. Simulated AI output. Guidance only."),
         q("demo-none"), jb([{"type": "allergy list", "label": "Allergies"}, {"type": "visit", "label": "Sep visit"}]), "false", ts("2026-10-17 14:29")]])


def referrals():
    section("referrals sent by Dr. Nair (kind 0215) with their referral-note documents (kind 0206, serials 101-103)")
    R = [(1, SPILLAI, 8, "Cardiology", "accepted", "2026-10-16 12:30", "sp_16oct", "2026-10-16 17:00"),
         (2, MTHOMAS, 3, "Neurology", "sent", "2026-10-12 15:00", None, "2026-10-12 15:00"),
         (3, BABU, 8, "Nephrology", "seen", "2026-10-04 10:30", "bj_oct4", "2026-10-06 11:00")]
    HOSPN = {8: "Demo Medical College, Kottayam", 3: "Demo District Hospital, Kozhencherry"}
    drows, rrows = [], []
    for n, patient, h, dept, st, at, sk, upd in R:
        storage = f"demo/referrals/REF-{n:03d}.pdf"
        fld = f"(SELECT id FROM records.folder WHERE patient_person_id = {P(patient)} AND kind = 'doctor_uploads')"
        drows.append([U(K_DOC, 100 + n), P(patient), fld, q(f"Referral note · {dept}, {HOSPN[h]}"), "'referral_note'::records.doc_type", q(storage), q("application/pdf"),
                      "90112", sha(storage), q("demo-none"), A(ARUN), SID(sk) if sk else "NULL", ts(at), q("Dr. Arun Nair · General medicine"), q("e-Signed (DSC)")])
        rrows.append([U(K_REFERRAL, n), P(patient), A(ARUN), "NULL", U(10, h), U(K_DOC, 100 + n), f"{q(st)}::records.referral_status", ts(at), ts(upd)])
    insert("records.document", ["id", "patient_person_id", "folder_id", "title", "doc_type", "storage_key", "mime_type", "size_bytes", "sha256", "enc_key_id",
                                "created_by_user_id", "session_id", "created_at", "source_label", "signature_note"], drows)
    insert("records.referral", ["id", "patient_person_id", "from_user_id", "to_user_id", "to_hospital_id", "note_document_id", "status", "created_at", "updated_at"], rrows)
    w("-- 1 Suresh Pillai Cardiology, Kottayam, accepted 16 Oct | 2 Mini Thomas Neurology, DH Kozhencherry, waiting | 3 Babu Jacob Nephrology, Kottayam, seen")


def handovers():
    section("shift handovers (kind 0216) and items (kind 0217): doctor 17:00 to Dr. Sreeja Paul, Ward 3 15:00 to Sr. Beena Thomas, plus the signed doctor handover of yesterday (a signed Ward 3 handover is left out on purpose: tests/test_rules.sql updates every Ward 3 handover row)")
    HO = [
        # n, unit_kind, unit_name, ward, date, from, to, summary, ai, created, signed_at, signed_by
        (1, "doctor", "OP block 2", None, "2026-10-17", ARUN, SREEJA, "Evening OP handover · 3 patients", "Simulated AI draft: 3 patients to hand over (potassium watch, dengue test pending, transfer to Kottayam at 19:30). Edit before sending.",
         "2026-10-17 14:20", None, None),
        (2, "ward", "Ward 3", WARD3, "2026-10-17", LEKHA, BEENA, "Ward 3 · 22 of 24 beds · NEWS 5 or more: Beds 7, 12 · likely discharges Beds 3, 9",
         "Simulated AI draft: 6 patients under Lekha Pillai; Bed 7 needs doctor review and ABG at 16:00; Bed 12 BP after fluids; Bed 11 X-ray result pending. Edit before sending.",
         "2026-10-17 10:45", None, None),
        (4, "doctor", "OP block 2", None, "2026-10-16", ARUN, SREEJA, "Evening OP handover · 2 patients", None, "2026-10-16 16:50", "2026-10-16 17:05", SREEJA),
    ]
    hrows = []
    for n, kind, unit, ward, d, frm, to, summ, ai, created, sat, sby in HO:
        hrows.append([U(K_HANDOVER, n), HOSP, q(kind), q(unit), ward or "NULL", f"{q(d)}::date", A(frm), A(to), q(summ), q(ai), "true", ts(created),
                      ts(sat) if sat else "NULL", A(sby) if sby else "NULL"])
    insert("org.shift_handover",
           ["id", "hospital_id", "unit_kind", "unit_name", "ward_id", "shift_date", "from_user_id", "to_user_id", "summary", "ai_draft_text", "ai_draft_simulated",
            "created_at", "signed_at", "signed_by_user_id"], hrows)
    # items: n, handover, patient, bed, order key, flag, note, from_ai, done_at
    I = [
        (1, 1, TVARG, None, None, "watch", "Critical potassium 6.1: repeat at 18:00, ECG done", False, None, "2026-10-17 14:21"),
        (2, 1, LAKSHMI, None, "la_ns1", "pending", "Fever day 3, dengue NS1 pending", False, None, "2026-10-17 14:22"),
        (3, 1, SPILLAI, None, None, "transfer", "Transfer to Demo Medical College, Kottayam at 19:30", False, None, "2026-10-17 14:23"),
        (4, 2, 1013, 12, None, "info", "Fluids 500 mL running since 10:15; fall risk high, bed rails up", False, "2026-10-17 10:20", "2026-10-17 10:45"),
        (5, 2, ANITHA, 3, None, "info", "Discharge plan drafted; likely discharge Monday", False, "2026-10-17 10:30", "2026-10-17 10:45"),
        (6, 2, TKURIAN, 7, None, "watch", "SBAR for escalation: febrile, SpO2 94% on 2 L oxygen, NEWS 7; Dr. Nair to review", True, None, "2026-10-17 10:45"),
        (7, 2, GOPI, 11, "gopi_cxr", "pending", "Post portable chest X-ray status (result pending)", False, None, "2026-10-17 10:45"),
        (8, 2, TKURIAN, 7, "tk_ceftriaxone", "pending", "Ceftriaxone 1 g IV (due 10:00), overdue", False, None, "2026-10-17 10:45"),
        (9, 2, TKURIAN, 7, "tk_abg", "pending", "Repeat ABG at 16:00", False, None, "2026-10-17 10:45"),
        (10, 2, ABDUL, 4, "abdul_cbc", "pending", "CBC and CRP sample to lab by 11:30", False, None, "2026-10-17 10:45"),
        (11, 2, 1013, 12, "sreedevi_bp", "pending", "Recheck BP after fluids at 12:15", False, None, "2026-10-17 10:45"),
        (13, 4, TVARG, None, None, "info", "Routine review next week", False, "2026-10-16 17:05", "2026-10-16 16:50"),
    ]
    irows = []
    for n, h, patient, bed, ok, flag, note, ai, done, created in I:
        irows.append([U(K_HITEM, n), U(K_HANDOVER, h), ADM(bed) if bed else "NULL", P(patient), BED(bed) if bed else "NULL", OID(ok) if ok else "NULL",
                      q(flag), q(note), bo(ai), ts(done) if done else "NULL", ts(created)])
    insert("org.handover_item", ["id", "handover_id", "admission_id", "patient_person_id", "bed_id", "order_id", "flag", "note", "from_ai_draft", "done_at", "created_at"], irows)


# ---------------------------------------------------------------- vital sets (NEWS2) and escalations
def _default_obs(bed):
    return dict(rr=16 + bed % 3, spo2=96 + bed % 3, o2=False, sbp=118 + (bed * 3) % 20, pulse=72 + (bed * 5) % 15, temp=36.6 + (bed % 4) / 10, avpu="A")


VS: list[dict] = []


def vset(bed, at, rr, spo2, o2, sbp, dbp, pulse, temp, avpu="A", by=None, note=None):
    tot, band = news2(rr, spo2, o2, sbp, pulse, temp, avpu)
    VS.append(dict(n=len(VS) + 1, bed=bed, at=at, rr=rr, spo2=spo2, o2=o2, sbp=sbp, dbp=dbp, pulse=pulse, temp=temp, avpu=avpu,
                   by=by or (LEKHA if bed in LEKHA_BEDS else MINI_J), note=note, score=tot, band=band))


def _build_vitals():
    # Bed 3 Anitha Mathew: 5 sets since the evening of 16 Oct (BP, pulse, SpO2, temp from the nurse table)
    for at, rr, sp, sbp, dbp, pu, t in [("2026-10-16 18:00", 18, 95, 124, 80, 90, 37.8), ("2026-10-16 22:00", 20, 93, 128, 84, 98, 38.4),
                                        ("2026-10-17 02:00", 20, 93, 130, 82, 96, 38.2), ("2026-10-17 06:00", 20, 94, 126, 80, 92, 37.9),
                                        ("2026-10-17 10:00", 18, 95, 122, 78, 88, 37.4)]:
        vset(3, at, rr, sp, False, sbp, dbp, pu, t, note="Comfortable, cough reduced. Tolerating diet." if at.endswith("10:00") else None)
    # Bed 7 Thomas Kurian: NEWS rises since admission, 7 at 10:28 (escalated)
    for at, rr, sp, o2, sbp, dbp, pu, t, note in [
            ("2026-10-16 04:30", 22, 94, True, 112, 70, 104, 37.8, "Admitted via Casualty at 04:20; on oxygen."),
            ("2026-10-16 12:00", 20, 95, True, 118, 74, 100, 38.1, None), ("2026-10-16 20:00", 20, 95, True, 120, 76, 98, 38.2, None),
            ("2026-10-17 02:00", 22, 95, True, 116, 72, 96, 37.9, None), ("2026-10-17 06:00", 20, 94, True, 114, 72, 100, 38.1, None),
            ("2026-10-17 08:00", 22, 94, True, 116, 74, 104, 37.9, None),
            ("2026-10-17 10:28", 24, 91, False, 118, 76, 110, 38.6, "SpO2 91% on room air; oxygen 2 L started, SpO2 94%. Escalated.")]:
        vset(7, at, rr, sp, o2, sbp, dbp, pu, t, note=note)
    # Bed 12 Sreedevi Amma: NEWS 5 at 10:05 (BP 92/58, HR 108)
    vset(12, "2026-10-17 06:10", 18, 96, False, 128, 80, 84, 36.8)
    vset(12, "2026-10-17 10:05", 20, 94, False, 92, 58, 108, 38.4, note="Low BP, amlodipine withheld, fluids started 10:15.")
    # Bed 4 Abdul Rasheed: watch (SBP 90 scores 3), Bed 11 Gopi Mohan: watch (RR 25), Bed 22 Ammini Kurup: new confusion
    vset(4, "2026-10-17 06:00", 18, 97, False, 124, 78, 80, 37.2)
    vset(4, "2026-10-17 09:30", 20, 96, False, 90, 56, 102, 37.9, note="Wound dressing done, clean. CBC pending.")
    vset(11, "2026-10-17 06:20", 20, 95, False, 130, 82, 92, 37.0)
    vset(11, "2026-10-17 09:50", 25, 96, False, 126, 80, 88, 37.3, note="Salbutamol neb due 10:00.")
    vset(22, "2026-10-17 06:40", 18, 96, False, 122, 76, 84, 36.9)
    vset(22, "2026-10-17 08:30", 20, 96, False, 118, 74, 90, 37.1, avpu="C", note="New confusion since last night.")
    # Bed 8 Mary George and every other occupied bed: stable
    for bed in sorted(BOARD):
        if any(v["bed"] == bed for v in VS):
            continue
        d = _default_obs(bed)
        at = "2026-10-17 06:00" if bed in LEKHA_BEDS else "2026-10-17 07:30"
        vset(bed, at, d["rr"], d["spo2"], d["o2"], d["sbp"], d["sbp"] - 42, d["pulse"], round(d["temp"], 1), d["avpu"])


EXPECT_BAND = {3: "low", 7: "high", 12: "medium", 4: "low_medium", 11: "low_medium", 22: "low_medium", 8: "low"}


def vitals():
    _build_vitals()
    section("vital sets with NEWS2 (kind 0232; the trigger computes news_parts / news_score / news_band from the raw observations) and escalations (kind 0233)")
    last = {}
    for v in VS:
        last[v["bed"]] = v
    for bed, band in EXPECT_BAND.items():
        assert last[bed]["band"] == band, (bed, last[bed])
    rows = [[U(K_VSET, v["n"]), ADM(v["bed"]), P(BOARD[v["bed"]][0]), ts(v["at"]), A(v["by"]), str(v["rr"]), str(v["spo2"]), bo(v["o2"]), str(v["sbp"]),
             str(v["dbp"]), str(v["pulse"]), str(v["temp"]), q(v["avpu"]), q(v["note"]), ts(v["at"])] for v in VS]
    w("-- the escalation trigger stamps paged_at = now(); it is switched off for this insert and the escalations are written below with their real times")
    w("ALTER TABLE inpatient.vital_set DISABLE TRIGGER vital_set_escalate;")
    insert("inpatient.vital_set", ["id", "admission_id", "patient_person_id", "observed_at", "recorded_by_user_id", "resp_rate", "spo2", "on_oxygen", "systolic",
                                   "diastolic", "pulse", "temp_c", "avpu", "note", "created_at"], rows)
    w("ALTER TABLE inpatient.vital_set ENABLE TRIGGER vital_set_escalate;")
    erows = []
    for v in VS:
        if v["band"] not in ("medium", "high"):
            continue
        high = v["band"] == "high"
        paged = mins(v["at"], 1)
        if v["bed"] == 7 and v["at"] == "2026-10-17 10:28":
            ack, ack_at, outcome = ARUN, "2026-10-17 10:35", "Rapid response team paged 10:28. Dr. Nair acknowledged; oxygen 2 L, ceftriaxone ordered."
        elif v["bed"] == 7:
            ack, ack_at, outcome = VIVEK if v["at"] < "2026-10-17" else ARUN, mins(v["at"], 15), "Reviewed at the bedside; antibiotics and oxygen continued."
        else:
            ack, ack_at, outcome = None, None, None                  # Bed 12 NEWS 5: hourly observations, not acknowledged yet
        erows.append([U(K_ESC, v["n"]), U(K_VSET, v["n"]), ADM(v["bed"]), P(BOARD[v["bed"]][0]), "3" if high else "2", str(v["score"]),
                      q("rapid_response" if high else "ward_doctor"), "NULL" if high else A(ARUN), ts(paged),
                      A(ack) if ack else "NULL", ts(ack_at) if ack_at else "NULL", q(outcome)])
    insert("inpatient.escalation", ["id", "vital_set_id", "admission_id", "patient_person_id", "level", "news_score", "paged_role", "paged_to_user_id", "paged_at",
                                    "acknowledged_by_user_id", "acknowledged_at", "outcome"], erows)
    w("-- board state from the latest set: " + ", ".join(f"bed {b} {last[b]['score']} ({last[b]['band']})" for b in sorted(EXPECT_BAND)) + "; all other occupied beds low")


def escalation_chain():
    section("Ward escalation chain of Demo General Hospital (nurse Alerts page): duty doctor within 15 min, rapid response at NEWS 7, nursing superintendent after 30 min")
    insert("org.escalation_chain", ["hospital_id", "step", "news_min", "notify_role", "within_minutes"],
           [[HOSP, "1", "5", q("ward_doctor"), "15"], [HOSP, "2", "7", q("rapid_response"), "0"], [HOSP, "3", "5", q("nursing_superintendent"), "30"]])


def nursing():
    escalation_chain()
    section("nursing tasks (0234), notes (0235), inpatient medication orders (0236) and the MAR (0237), ward stock (0238, 0239)")
    T = [(1, 3, "vitals", "Morning vitals", "2026-10-17 06:00", "2026-10-17 06:10", "Done 06:10", LEKHA),
         (2, 8, "other", "Endoscopy consent", "2026-10-17 08:30", "2026-10-17 08:30", "Signed", LEKHA),
         (3, 7, "medication", "IV Ceftriaxone", "2026-10-17 10:00", None, "STAT, overdue", ARUN),
         (4, 4, "other", "Collect CBC, CRP", "2026-10-17 11:30", None, "Lab order", ARUN),
         (5, 12, "io_chart", "Fluid balance", "2026-10-17 11:00", None, "Chart hourly", LEKHA),
         (6, 11, "other", "Prep for X-ray", "2026-10-17 11:45", None, "Portable", SREEJA),
         (7, 7, "other", "Repeat ABG", "2026-10-17 16:00", None, "Dr. Nair to review", ARUN),
         (8, 12, "vitals", "Recheck BP after fluids", "2026-10-17 12:15", None, "After fluids", SREEJA),
         (9, 7, "vitals", "Hourly observations", "2026-10-17 11:00", None, "NEWS 7", ARUN)]
    insert("inpatient.nursing_task", ["id", "admission_id", "patient_person_id", "assigned_to_user_id", "kind", "title", "due_at", "done_at", "done_by_user_id",
                                      "note", "created_by_user_id", "created_at"],
           [[U(K_TASK, n), ADM(b), P(BOARD[b][0]), A(LEKHA), q(k), q(t), ts(d), ts(dn) if dn else "NULL", A(LEKHA) if dn else "NULL", q(nt), A(cb),
             ts(mins(d, -120))] for (n, b, k, t, d, dn, nt, cb) in T])
    N = [(1, 12, "2026-10-17 10:20", "nu_sreedevi", "Low BP, amlodipine withheld. Fluids 500 mL started 10:15. Fall risk high, bed rails up."),
         (2, 3, "2026-10-17 09:50", None, "Improving. Sugar 164 pre-lunch. Likely discharge Monday."),
         (3, 4, "2026-10-17 09:15", "nu_abdul", "CBC sample pending collection. Wound dressing done, clean."),
         (4, 8, "2026-10-17 08:40", None, "NBM for endoscopy at 13:00. Consent signed.")]
    insert("inpatient.nursing_note", ["id", "admission_id", "patient_person_id", "author_user_id", "kind", "body_enc", "enc_key_id", "session_id", "created_at"],
           [[U(K_NOTE, n), ADM(b), P(BOARD[b][0]), A(LEKHA), q("note"), byt(txt), q("demo-none"), SID(sk) if sk else "NULL", ts(at)] for (n, b, at, sk, txt) in N])
    # medication orders: n, bed, medicine, dose, route, freq, times, prn, instructions, ordered_by, order key, start
    MO = [(1, 3, 1, "500 mg", "oral", "BD", ["08:00", "20:00"], False, "After food", ARUN, None, "2026-10-15 17:00"),
          (2, 4, 20, "40 mg", "oral", "OD", ["08:00"], False, "Before food", ARUN, None, "2026-10-14 09:00"),
          (3, 8, 21, "6 units", "sc", "Sliding scale", ["08:00"], False, "Hold if nil by mouth", ARUN, "mary_insulin", "2026-10-17 07:50"),
          (4, 7, 19, "1 g", "iv", "STAT", ["10:00"], False, "Overdue: first dose not yet given", ARUN, "tk_ceftriaxone", "2026-10-17 10:31"),
          (5, 3, 19, "1 g", "iv", "OD", ["10:00"], False, "Over 30 minutes. Penicillin allergy: cross-reactivity low, doctor confirmed 10:31.", ARUN, "anitha_ceftriaxone", "2026-10-17 10:31"),
          (6, 11, 22, "2.5 mg", "inhaled", "6-hourly", ["10:00", "16:00"], False, "Nebulised", ARUN, None, "2026-10-16 13:30"),
          (7, 12, 12, "5 mg", "oral", "OD", ["10:00"], False, "Withhold if systolic BP below 100", ARUN, None, "2026-10-15 23:00"),
          (8, 4, 9, "650 mg", "oral", "PRN", [], True, "If temperature above 38", ARUN, None, "2026-10-14 09:00"),
          (9, 12, 23, "500 mL", "iv", "Over 4 hours", [], False, "Running since 10:15", SREEJA, "sreedevi_ns", "2026-10-17 10:12")]
    rows = []
    for n, b, med, dose, route, freq, times, prn, instr, by, ok, start in MO:
        tarr = "ARRAY[" + ", ".join(f"{q(t)}::time" for t in times) + "]::time[]" if times else "'{}'::time[]"
        rows.append([U(K_MEDORD, n), ADM(b), P(BOARD[b][0]), MEDID[med], q(dose), q(route), q(freq), tarr, bo(prn), q(instr), ts(start), "NULL", q("active"),
                     A(by), OID(ok) if ok else "NULL", ts(start)])
    insert("inpatient.med_order", ["id", "admission_id", "patient_person_id", "medicine_id", "dose", "route", "frequency", "schedule_times", "is_prn", "instructions",
                                   "start_at", "stop_at", "status", "ordered_by_user_id", "clinical_order_id", "created_at"], rows)
    # MAR: n, med order, due, given_at, outcome, reason, dose
    MA = [(1, 1, "2026-10-17 08:00", "2026-10-17 08:02", "given", None, "500 mg"),
          (2, 2, "2026-10-17 08:00", "2026-10-17 08:04", "given", None, "40 mg"),
          (3, 3, "2026-10-17 08:00", "2026-10-17 08:06", "given", None, "6 units"),
          (4, 7, "2026-10-17 10:00", None, "withheld", "BP 92/58, doctor informed", None),
          (5, 9, "2026-10-17 10:15", "2026-10-17 10:15", "given", None, "500 mL")]
    morder = {m[0]: m for m in MO}
    insert("inpatient.med_administration", ["id", "med_order_id", "admission_id", "patient_person_id", "due_at", "given_at", "outcome", "reason", "dose_given",
                                            "nurse_user_id", "band_scanned", "drug_scanned", "created_at"],
           [[U(K_MAR, n), U(K_MEDORD, mo), ADM(morder[mo][1]), P(BOARD[morder[mo][1]][0]), ts(due), ts(g) if g else "NULL", q(o), q(r), q(dose),
             A(LEKHA), bo(o == "given"), bo(o == "given"), ts(g or due)] for (n, mo, due, g, o, r, dose) in MA])
    w("-- Not yet given (no MAR row): Bed 7 Ceftriaxone 1 g IV due 10:00 (overdue), Bed 3 Ceftriaxone 10:00, Bed 11 Salbutamol 10:00; Bed 4 Paracetamol is PRN.")
    insert("org.ward_stock", ["id", "ward_id", "medicine_id", "quantity", "par_level", "updated_at"],
           [[U(K_WSTOCK, 1), WARD3, MEDID[24], "3", "10", ts("2026-10-17 08:00")], [U(K_WSTOCK, 2), WARD3, MEDID[25], "22", "20", ts("2026-10-17 08:00")],
            [U(K_WSTOCK, 3), WARD3, MEDID[21], "4", "6", ts("2026-10-17 08:00")], [U(K_WSTOCK, 4), WARD3, MEDID[23], "40", "30", ts("2026-10-17 08:00")]])
    insert("org.ward_stock_request", ["id", "ward_id", "medicine_id", "quantity", "requested_by_user_id", "pharmacy_id", "status", "note", "requested_at"],
           [[U(K_WREQ, 1), WARD3, MEDID[24], "6", A(LEKHA), U(12, 1), q("requested"), q("Only 3 pens left on the ward"), ts("2026-10-17 09:05")]])


def messaging():
    section("message threads with patients (kind 0218 thread, 0219 participant, 0220 message). Anjali's thread is the one 10_citizen.sql wrote (looked up; created only if absent)")
    ANJ_THREAD = (f"(SELECT id FROM engage.chat_thread WHERE thread_type = 'doctor_followup' AND patient_person_id = {P(ANJALI)} "
                  f"AND doctor_user_id = {A(ARUN)} ORDER BY created_at, id LIMIT 1)")
    w(f"INSERT INTO engage.chat_thread (id, thread_type, patient_person_id, doctor_user_id, subject, created_at, last_message_at)\n"
      f"SELECT {U(K_THREAD, 1)}, 'doctor_followup', {P(ANJALI)}, {A(ARUN)}, 'Dr. Arun Nair', {ts('2026-10-17 12:10')}, {ts('2026-10-17 12:12')}\n"
      f"WHERE NOT EXISTS (SELECT 1 FROM engage.chat_thread WHERE thread_type = 'doctor_followup' AND patient_person_id = {P(ANJALI)} AND doctor_user_id = {A(ARUN)})\nON CONFLICT DO NOTHING;")
    for uid_, name, role, last in [(ANJALI, "Anjali Menon", "citizen", "2026-10-17 12:00"), (ARUN, "Dr. Arun Nair · General medicine · Demo General Hospital", "doctor", "2026-10-17 09:30")]:
        w(f"INSERT INTO engage.chat_participant (id, thread_id, user_id, display_name, party_role, added_at, last_read_at)\n"
          f"SELECT {U(K_PART, 1 if uid_ == ANJALI else 2)}, {ANJ_THREAD}, {A(uid_)}, {q(name)}, '{role}', {ts('2026-10-17 09:12')}, {ts(last)}\nON CONFLICT DO NOTHING;")
    for n, who, at, text in [(1, ANJALI, "2026-10-17 12:10", "Doctor, after starting atorvastatin I get mild leg aches at night. Should I stop?"),
                             (2, ANJALI, "2026-10-17 12:12", "I also uploaded my glucometer log from home.")]:
        w(f"INSERT INTO engage.chat_message (id, thread_id, sender_user_id, body_enc, enc_key_id, sent_at)\n"
          f"SELECT {U(K_MSG, n)}, {ANJ_THREAD}, {A(who)}, {byt(text)}, 'demo-none', {ts(at)}\nON CONFLICT DO NOTHING;")
    TH = [  # n, patient, name, other party user (sender of patient messages), other name, subject, doctor last read, messages(sender, at, text)
        (2, JKURIAN, "Joseph Kurian", JKURIAN, "2026-10-17 11:00", [(JKURIAN, "2026-10-17 11:40", "Lab says my HbA1c sample is taken. When will you see the result?")]),
        (3, LAKSHMI, "Lakshmi Amma", SINDHU, "2026-10-17 09:30",
         [(SINDHU, "2026-10-17 09:05", "Fever is less today, 99 F. Still tired."),
          (ARUN, "2026-10-17 09:20", "Good. Keep drinking fluids. The dengue test result will come by evening, I will message you.")]),
        (4, RPILLAI, "Ramesh Pillai", RPILLAI, "2026-10-15 11:30",
         [(RPILLAI, "2026-10-15 09:10", "BP at home 138/88 this week."), (ARUN, "2026-10-15 11:25", "Thank you. Continue amlodipine; we will review on Tuesday.")]),
        (5, FNAZAR, "Fathima Nazar", FNAZAR, "2026-10-14 12:10",
         [(FNAZAR, "2026-10-14 10:40", "Is it safe to take paracetamol for headache?"),
          (ARUN, "2026-10-14 11:25", "Yes, paracetamol 500 mg up to 3 times a day is fine. Tell us if headaches persist.")])]
    trows, prows, mrows = [], [], []
    mid = 10
    for n, patient, pname, other, last_read, msgs in TH:
        first, lastm = msgs[0][1], msgs[-1][1]
        trows.append([U(K_THREAD, n), q("doctor_followup"), P(patient), A(ARUN), q("Dr. Arun Nair"), ts(first), ts(lastm)])
        prows.append([U(K_PART, n * 10 + 1), U(K_THREAD, n), A(patient if other == patient else patient), q(pname), "'citizen'::engage.event_role", ts(first), ts(lastm)])
        if other != patient:
            prows.append([U(K_PART, n * 10 + 3), U(K_THREAD, n), A(other), q("Daughter Sindhu (via family link)"), "'citizen'::engage.event_role", ts(first), ts(lastm)])
        prows.append([U(K_PART, n * 10 + 2), U(K_THREAD, n), A(ARUN), q("Dr. Arun Nair · General medicine · Demo General Hospital"), "'doctor'::engage.event_role", ts(first), ts(last_read)])
        for who, at, text in msgs:
            mid += 1
            mrows.append([U(K_MSG, mid), U(K_THREAD, n), A(who), byt(text), q("demo-none"), ts(at)])
    insert("engage.chat_thread", ["id", "thread_type", "patient_person_id", "doctor_user_id", "subject", "created_at", "last_message_at"], trows)
    insert("engage.chat_participant", ["id", "thread_id", "user_id", "display_name", "party_role", "added_at", "last_read_at"], prows)
    insert("engage.chat_message", ["id", "thread_id", "sender_user_id", "body_enc", "enc_key_id", "sent_at"], mrows)
    w("-- unread for Dr. Nair: Anjali 2, Joseph Kurian 1 (messages after his last_read_at)")


def reviews():
    section("reviews of Dr. Arun Nair (kind 0221): 3 named reviews + 309 background reviews so the totals match 312 and the 76/16/5/2/1 split")
    named = [(1, JKURIAN, 5, "2026-10-08 18:00", "Saw my lab result within an hour and messaged me the change in tablets.", ["Explains clearly"]),
             (2, SINDHU, 4, "2026-10-01 17:30", "Teleconsult was smooth. Wait for the video link was 10 minutes.", ["Speaks Malayalam", "On time"]),
             (3, BABU, 3, "2026-09-27 19:00", "Good doctor, but OP waiting time was over an hour on Monday.", ["Long wait"])]
    rows = [[U(K_RATING, n), P(p), "'doctor'::engage.rating_target", A(ARUN), str(st), q(c), "'published'::engage.moderation", DEPT_GM, "ARRAY[" + ", ".join(q(t) for t in tags) + "]::text[]", ts(at)]
            for (n, p, st, at, c, tags) in named]
    insert("engage.rating", ["id", "rater_person_id", "target_type", "target_id", "stars", "comment", "moderation_status", "department_id", "tags", "created_at"], rows)
    w("-- background reviewers: generated citizens of demo_data.sql (static file, ordered by id); stars 236 x 5, 49 x 4, 15 x 3, 6 x 2, 3 x 1")
    w(f"""INSERT INTO engage.rating (id, rater_person_id, target_type, target_id, stars, comment, moderation_status, department_id, tags, created_at)
SELECT util.seed_uuid({K_RATING}, 1000 + p.rn), p.id, 'doctor', {A(ARUN)},
       CASE WHEN p.rn <= 236 THEN 5 WHEN p.rn <= 285 THEN 4 WHEN p.rn <= 300 THEN 3 WHEN p.rn <= 306 THEN 2 ELSE 1 END,
       NULL, 'published', {DEPT_GM},
       CASE WHEN p.rn <= 128 THEN ARRAY['Explains clearly']::text[]
            WHEN p.rn BETWEEN 129 AND 224 THEN ARRAY['Speaks Malayalam']::text[]
            WHEN p.rn BETWEEN 225 AND 295 THEN ARRAY['On time']::text[]
            ELSE ARRAY['Long wait']::text[] END,
       timestamptz '2026-01-05 10:00:00+05:30' + (p.rn * interval '23 hours 17 minutes')
FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM identity.person
       WHERE created_at = '2026-10-16 12:00:00+00' AND kyc_status = 'passed' AND abha_number IS NOT NULL) p
WHERE p.rn <= 309
ON CONFLICT DO NOTHING;""")


def alerts():
    section("clinical alerts for the doctor and nurse bells (kind 0222)")
    AL = [  # n, kind, severity, patient, target, title, detail, raised, ack_by, ack_at
        (1, "critical_lab", "critical", TVARG, ARUN, "Critical lab value: Potassium 6.1 mmol/L", "Thomas Varghese · flagged by Rahul Varghese, 14:02", "2026-10-17 14:02", None, None),
        (2, "referral_update", "info", SPILLAI, ARUN, "Referral accepted: Demo Medical College, Kottayam", "Suresh Pillai (cardiology) accepted on 16 Oct", "2026-10-16 17:00", None, None),
        (3, "vitals_critical", "critical", TKURIAN, ARUN, "Early-warning score 7 · Bed 7", "Thomas Kurian · SpO2 91% · escalated by Lekha Pillai", "2026-10-17 10:29", ARUN, "2026-10-17 10:35"),
        (4, "overdue_dose", "warning", TKURIAN, LEKHA, "Overdue dose · Bed 7", "Ceftriaxone 1 g IV was due 10:00", "2026-10-17 10:30", None, None),
        (5, "abnormal_lab", "info", ABDUL, LEKHA, "Lab result ready · Bed 4", "CBC: WBC 13.2 (high). Doctor notified.", "2026-10-17 10:40", None, None)]
    rows = [[U(K_ALERT, n), f"{q(k)}::records.alert_kind", q(sv), P(pat), HOSP, A(tg), q(t), q(d), "NULL", "NULL", ts(at), A(ab) if ab else "NULL", ts(aat) if aat else "NULL", "NULL"]
            for (n, k, sv, pat, tg, t, d, at, ab, aat) in AL]
    rows.append([U(K_ALERT, 6), "'ward_notice'::records.alert_kind", q("info"), "NULL", HOSP, A(LEKHA), q("Ward notice: fire drill Monday 10:00"),
                 q("Oxygen cylinder check due."), "NULL", "NULL", ts("2026-10-16 16:00"), "NULL", "NULL", "NULL"])
    insert("records.clinical_alert", ["id", "kind", "severity", "patient_person_id", "hospital_id", "target_user_id", "title", "detail", "source_table", "source_id",
                                      "raised_at", "acknowledged_by_user_id", "acknowledged_at", "resolved_at"], rows)


def shifts():
    section("staff shifts for Saturday 17 Oct (kind 0240): Ward 3 charge / float / evening nurses and the visiting evening doctor; Lekha, Arun and others are in 50_hospital_admin.sql")
    S = [(2, MINI_J, "Charge nurse", WARD3, "07:00", "15:00", True, 25, "06:55"),
         (3, REJO, "Float nurse", WARD3, "07:00", "15:00", False, None, "06:58"), (4, BEENA, "Staff nurse (evening)", WARD3, "15:00", "23:00", False, None, None),
         (6, SREEJA, "Visiting doctor (evening cover)", None, "17:00", "21:00", False, None, None)]
    insert("org.staff_shift", ["id", "user_id", "hospital_id", "ward_id", "role_label", "shift_start", "shift_end", "break_taken", "break_minutes", "clocked_in_at"],
           [[U(K_SHIFT, n), A(u), HOSP, ward or "NULL", q(role), ts("2026-10-17 " + a), ts("2026-10-17 " + b), bo(bt), nb(bm), ts("2026-10-17 " + c) if c else "NULL"]
            for (n, u, role, ward, a, b, bt, bm, c) in S])


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT} ({len(out)} lines)")

#!/usr/bin/env python3
"""
Generator for seed/design/00_base.sql and the registry tables inside seed/design/IDS.md.

    python3 carefusion-db/seed/design/build_base.py

The output is deterministic (no randomness, no clock), so re-running it changes nothing unless
the data below changes. 00_base.sql is the artefact that is applied; this file is only the
source it is generated from. IDS.md keeps its hand-written text outside the
<!-- BEGIN GENERATED --> / <!-- END GENERATED --> markers.

Identity rule: every shared row has a literal UUID  cfd00000-KKKK-4000-8000-NNNNNNNNNNNN
where KKKK is the "kind" (4 decimal digits) and NNNNNNNNNNNN the serial (12 decimal digits).
The same value is returned by SQL util.seed_uuid(kind, n) (installed by 00_base.sql).

Synthetic data only. No Aadhaar digits anywhere (opaque tokens). Demo "today" = Sat 17 Oct 2026.
"""
from __future__ import annotations

import hashlib
import re
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
TODAY = date(2026, 10, 17)

# ----------------------------------------------------------------------------------------------
# Kinds (4 decimal digits). 0001-0099 belong to this base file. Other seed files pick their own
# kinds inside the block reserved for their domain (see IDS.md, section "Reserved kinds").
# ----------------------------------------------------------------------------------------------
K_PERSON, K_USER, K_ECONTACT, K_FAMILY, K_CONSENT = 1, 2, 3, 4, 6
K_HOSPITAL, K_DEPT, K_PHARMACY, K_WARD, K_BED, K_BLOCK = 10, 11, 12, 13, 14, 15
K_ADMIN_POST, K_BLOOD_BANK, K_TRANSPLANT = 16, 17, 18
COMPANION_OFFSET = 5000   # app_user serial of the companion CITIZEN account of a doctor = 5000 + person serial


def uid(kind: int, n: int) -> str:
    return f"cfd00000-{kind:04d}-4000-8000-{n:012d}"


def q(s: object) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


# ----------------------------------------------------------------------------------------------
# Timestamps. Personas sort FIRST by created_at (apps/api lookupDemoIdentity orders by created_at),
# then other base rows, then seed/demo_data.sql rows (2026-10-16).
# ----------------------------------------------------------------------------------------------
def ts_persona(n: int) -> str:
    return f"2026-01-01 00:00:{n:02d}+00"


T_SUPPORT = "2026-01-02 00:00:00+00"
T_COMPANION = "2026-01-03 00:00:00+00"
T_VERIFIED = "2026-01-01 00:00:00+00"

# ----------------------------------------------------------------------------------------------
# Geography
# ----------------------------------------------------------------------------------------------
STATE_KERALA = 33
ZONE_SOUTH = 2
BLOCKS = [  # (serial, code, name)  Pathanamthitta district, 12 blocks, in the order of the district map
    (1, "PLK", "Pulikeezhu"), (2, "TVL", "Thiruvalla"), (3, "MLY", "Mallappally"), (4, "VNK", "Vennikulam"),
    (5, "KZC", "Kozhencherry"), (6, "ELT", "Elanthoor"), (7, "RNI", "Ranni"), (8, "PRN", "Perunad"),
    (9, "PDM", "Pandalam"), (10, "PTA", "Pathanamthitta"), (11, "KNI", "Konni"), (12, "ADR", "Adoor"),
]

# ----------------------------------------------------------------------------------------------
# Facilities: hospitals. (n, name, hfr, type, ownership, district, lat, lng, depts)
# ----------------------------------------------------------------------------------------------
GM = "General medicine"
HOSPITALS = [
    (1, "Demo General Hospital, Pathanamthitta", "DEMO-HFR-KL-0193", "GH", "govt", "Pathanamthitta", 9.2648, 76.7870,
     [GM, "Casualty", "ICU", "Paediatrics", "Maternity", "Orthopaedics", "Surgery", "Laboratory", "Radiology"]),
    (2, "Demo Taluk Hospital, Adoor", "DEMO-HFR-KL-0201", "THQ", "govt", "Pathanamthitta", 9.1520, 76.7350,
     [GM, "Casualty", "Ophthalmology", "Dermatology"]),
    (3, "Demo District Hospital, Kozhencherry", "DEMO-HFR-KL-0202", "DH", "govt", "Pathanamthitta", 9.3342, 76.7066,
     [GM, "Casualty", "Paediatrics", "Maternity", "Diabetology"]),
    (4, "Demo Taluk Hospital, Kozhencherry", "DEMO-HFR-KL-0203", "THQ", "govt", "Pathanamthitta", 9.3300, 76.7130,
     [GM, "Casualty"]),
    (5, "Demo Taluk Hospital, Thiruvalla", "DEMO-HFR-KL-0204", "THQ", "govt", "Pathanamthitta", 9.3830, 76.5720,
     [GM, "Casualty"]),
    (6, "Demo Private Hospital, Thiruvalla", "DEMO-HFR-KL-0205", "PVT_HOSP", "private", "Pathanamthitta", 9.3870, 76.5760,
     [GM, "Endocrinology"]),
    (7, "Demo Cardiac Care Centre, Pathanamthitta", "DEMO-HFR-KL-0206", "PVT_HOSP", "private", "Pathanamthitta", 9.2700, 76.7900,
     ["Cardiology"]),
    (8, "Demo Medical College, Kottayam", "DEMO-HFR-KL-0207", "MCH", "govt", "Kottayam", 9.6350, 76.5200,
     [GM, "Cardiology", "Nephrology", "Neurology", "Radiology"]),
    (9, "PHC Kozhencherry", "DEMO-HFR-KL-0211", "PHC", "govt", "Pathanamthitta", 9.3280, 76.7200, [GM]),
    (10, "PHC Konni", "DEMO-HFR-KL-0212", "PHC", "govt", "Pathanamthitta", 9.2330, 76.8500, [GM]),
    (11, "PHC Omalloor", "DEMO-HFR-KL-0213", "PHC", "govt", "Pathanamthitta", 9.2790, 76.7770, [GM]),
    (12, "PHC Elanthoor", "DEMO-HFR-KL-0214", "PHC", "govt", "Pathanamthitta", 9.3150, 76.7600, [GM]),
    (13, "Demo Eye Centre, Pathanamthitta", "DEMO-HFR-KL-0221", "PVT_CLINIC", "private", "Pathanamthitta", 9.2610, 76.7840,
     ["Ophthalmology"]),
]
HOSP_BY_N = {h[0]: h for h in HOSPITALS}


def dept_serial(hosp: int, dept_name: str) -> int:
    names = HOSP_BY_N[hosp][8]
    return hosp * 100 + names.index(dept_name) + 1


# Pharmacies: (n, name, licence, type, linked_hospital, district, lat, lng)
PHARMACIES = [
    (1, "Demo Hospital Pharmacy", "DEMO-DL-KL-2041", "govt_hospital", 1, "Pathanamthitta", 9.2652, 76.7875),
    (2, "Care Plus Demo Pharmacy, Thiruvalla", "DEMO-DL-KL-2988", "private", None, "Pathanamthitta", 9.3860, 76.5730),
    (3, "Demo Generic Medicines Kendra, Pathanamthitta", "DEMO-DL-KL-3105", "private", None, "Pathanamthitta", 9.2640, 76.7860),
    (4, "Lotus Medical Store, Kozhencherry", "DEMO-DL-KL-3112", "private", None, "Pathanamthitta", 9.3320, 76.7180),
    (5, "Sneha Community Pharmacy, Pathanamthitta", "DEMO-DL-KL-3120", "private", None, "Pathanamthitta", 9.2670, 76.7830),
    (6, "Demo Taluk Hospital Pharmacy, Adoor", "DEMO-DL-KL-3077", "govt_hospital", 2, "Pathanamthitta", 9.1525, 76.7345),
]

# Hospital 1 profile (hospital admin "Hospital profile" screen). 240 = sanctioned beds on the HFR record; 200 = beds in service
# (the department table of the same screen sums to 200); see seed/design/50_hospital_admin.sql, decision "beds".
H1_PROFILE = dict(
    address="College Road, Pathanamthitta, Kerala 689645", phone="0468 222 0000",
    services=["Casualty 24x7", "ICU", "Dialysis", "Blood bank", "CT and X-ray", "Maternity"],
    about=("District-level government hospital with 240 sanctioned beds (200 in service), 24x7 casualty, dialysis and a blood bank."),
    timings='{"op": "08:00-14:00", "casualty": "24x7", "help_desk": "08:00-20:00"}')
# Department heads of hospital 1 (person serial of the doctor); departments without a head are left out
H1_DEPT_HEAD = {GM: 2, "Casualty": 102, "ICU": 103, "Paediatrics": 104, "Maternity": 105, "Orthopaedics": 106,
                "Surgery": 107, "Laboratory": 109}

# Staff extras (identity.staff_profile): serial -> (employee code, registration no, designation, shift, is_charge).
# Registration labels are demo councils: DNC = Demo Nursing Council, DPC = Demo Paramedical Council, DRB = Demo Radiation Board.
STAFF_EXTRA = {
    3: ("DEMO-ST-0412", "DNC DEMO-4471", "Staff nurse", "day", False),
    4: ("DEMO-ST-0413", "DPC DEMO-0981", "Lab technician (DMLT)", "day", False),
    5: ("DEMO-ST-0414", "DRB DEMO-RT-118", "Radiographer", "day", False),
    121: ("DEMO-ST-0415", "DNC DEMO-60218", "Staff nurse (ICU)", "rotating", False),
    122: ("DEMO-ST-0416", "DNC DEMO-31807", "Charge nurse", "day", True),
    123: ("DEMO-ST-0417", "DNC DEMO-47720", "Staff nurse", "rotating", False),
    124: ("DEMO-ST-0418", "DNC DEMO-52264", "Float nurse", "rotating", False),
    125: ("DEMO-ST-0419", "DPC DEMO-1066", "Lab technician", "day", False),
    126: ("DEMO-ST-0420", "DRB DEMO-RT-131", "CT technologist", "day", False),
}
# Pharmacist extras (identity.pharmacist_profile): serial -> (role label, shift)
PHARMACIST_EXTRA = {
    6: ("Senior pharmacist", "day"), 301: ("Pharmacist", "day"), 302: ("Store in-charge", "day"),
    303: ("Pharmacist", "night"), 304: ("Pharmacist", "night"), 305: ("Pharmacist", None),
}
# Pharmacy extras (org.pharmacy): n -> dict of columns
PHARMACY_EXTRA = {
    1: dict(licence_valid_until="2029-03-31", counters=2, compliance_score=96,
            last_inspection_on="2026-08-02", next_inspection_due="2027-02-15"),
    2: dict(licence_valid_until="2026-11-06", counters=1),          # 20 days from the demo today
    3: dict(is_jan_aushadhi=True),
}

# Wards (DGH = hospital 1): (n, code, name, dept name, charge nurse person serial or None)
WARDS = [
    (3, "W3", "Ward 3", GM, 122),
    (5, "W5", "Ward 5", GM, None),
    (11, "CAS", "Casualty", "Casualty", None),
    (12, "ICU", "ICU", "ICU", None),
    (13, "MAT", "Maternity ward", "Maternity", None),
    (14, "PAE", "Paediatric ward", "Paediatrics", None),
    (15, "ORT", "Orthopaedic ward", "Orthopaedics", None),
    (16, "SUR", "Surgical ward", "Surgery", None),
]
WARD_W3, WARD_W5, WARD_ICU = 3, 5, 12
FREE_BEDS_W3 = {6, 18}
W5_BEDS = 12

# ----------------------------------------------------------------------------------------------
# People.  Fields: serial, slug, display name, dob (ISO) or age, sex, group
# full_name stores the display name exactly as the designs show it (honorific included).
# ----------------------------------------------------------------------------------------------
PERSONAS = [  # (serial, slug, name, dob, sex, account_type, role label)
    (1, "anjali-menon", "Anjali Menon", "1991-02-14", "female", "citizen", "Citizen"),
    (2, "arun-nair", "Dr. Arun Nair", "1980-05-09", "male", "doctor", "Doctor, General medicine"),
    (3, "lekha-pillai", "Lekha Pillai", "1993-08-21", "female", "staff", "Nurse, Ward 3"),
    (4, "rahul-varghese", "Rahul Varghese", "1990-03-17", "male", "staff", "Lab technician"),
    (5, "fathima-beevi", "Fathima Beevi", "1992-11-02", "female", "staff", "Radiology technician"),
    (6, "joseph-mathew", "Joseph Mathew", "1985-06-25", "male", "pharmacist", "Pharmacist, Counter 2"),
    (7, "suma-thomas", "Suma Thomas", "1982-01-30", "female", "pharmacy_admin", "Pharmacy admin"),
    (8, "meera-krishnan", "Dr. Meera Krishnan", "1975-09-12", "female", "hospital_admin", "Hospital admin (Medical Superintendent)"),
    (9, "ajay-kumar", "Ajay Kumar", "1979-12-04", "male", "district_admin", "District admin, Pathanamthitta"),
    (10, "latha-nair", "Latha Nair", "1972-04-18", "female", "state_admin", "State admin, Kerala"),
    (11, "r-venkatesh", "R. Venkatesh", "1970-07-07", "male", "zonal_admin", "Zonal admin, South"),
    (12, "s-banerjee", "S. Banerjee", "1968-02-23", "male", "central_admin", "Central admin, National"),
]

# Doctors: (serial, slug, name, dob, sex, hospital n, dept name, specialisation, hpr 4 digits, council reg 5 digits, notes)
DOCTORS = [
    (2, "arun-nair", "Dr. Arun Nair", "1980-05-09", "male", 1, GM, "General medicine", "0042", "41822", "persona"),
    (101, "sreeja-paul", "Dr. Sreeja Paul", "1984-03-03", "female", 2, "Ophthalmology", "Ophthalmology", "0057", "48810",
     "Ophthalmologist at Adoor Taluk Hospital; visiting evening cover at Demo General Hospital"),
    (102, "vivek-menon", "Dr. Vivek Menon", "1981-07-19", "male", 1, "Casualty", "Emergency medicine", "0061", "52033",
     "Casualty head; the emergency doctor of the 21 Sep break-glass (was 'Dr. Vinod K.')"),
    (103, "sameer-ali", "Dr. Sameer Ali", "1978-10-02", "male", 1, "ICU", "Critical care", "0073", "52871", "ICU head"),
    (104, "rekha-soman", "Dr. Rekha Soman", "1983-02-26", "female", 1, "Paediatrics", "Paediatrics", "0084", "53190", "Paediatrics head (was 'Dr. Rekha S.')"),
    (105, "ann-mary-joseph", "Dr. Ann Mary Joseph", "1986-06-14", "female", 1, "Maternity", "Obstetrics and gynaecology", "0091", "54402",
     "Maternity head (was 'Dr. Ann Mary')"),
    (106, "thomas-koshy", "Dr. Thomas Koshy", "1974-09-09", "male", 1, "Orthopaedics", "Orthopaedics", "0102", "50417",
     "Orthopaedics head (was 'Dr. Thomas K.')"),
    (107, "hari-prasad", "Dr. Hari Prasad", "1972-12-21", "male", 1, "Surgery", "General surgery", "0115", "49733", "Surgery head"),
    (108, "leela-george", "Dr. Leela George", "1979-01-11", "female", 1, "Maternity", "Obstetrics and gynaecology", "0126", "51268", "USG orders"),
    (109, "deepa-mohan", "Dr. Deepa Mohan", "1982-08-30", "female", 1, "Laboratory", "Pathology", "0133", "52946", "Pathologist, e-signs lab reports"),
    (110, "lakshmi-varma", "Dr. Lakshmi Varma", "1976-04-05", "female", 3, "Diabetology", "Diabetology", "0150", "47811", "District Hospital Kozhencherry"),
    (111, "cherian-thomas", "Dr. Cherian Thomas", "1970-11-23", "male", 7, "Cardiology", "Cardiology", "0163", "44205",
     "Private cardiologist (was 'Dr. Thomas Kurian')"),
    (112, "anitha-george", "Dr. Anitha George", "1988-05-17", "female", 10, GM, "Family medicine", "0171", "55091", "PHC Konni"),
    (113, "rajesh-menon", "Dr. Rajesh Menon", "1977-03-28", "male", 6, "Endocrinology", "Endocrinology", "0188", "46628", "Demo Private Hospital, Thiruvalla"),
    (114, "hema-kurup", "Dr. Hema Kurup", "1985-10-10", "female", 2, "Dermatology", "Dermatology", "0195", "53777",
     "Dermatology prescriber at Adoor (replaces Dr. Sreeja Paul on the 2 Oct / 4 Mar prescriptions)"),
]
GOVT_HOSPITALS = {1, 2, 3, 4, 5, 8, 9, 10, 11, 12}

# Clinical support staff: (serial, slug, name, dob, sex, staff_role, hospital n, dept, ward n or None, note)
STAFF = [
    (3, "lekha-pillai", "Lekha Pillai", "1993-08-21", "female", "nurse", 1, GM, 3, "persona; staff id DEMO-ST-0412, reg KL-NC-DEMO-4471"),
    (4, "rahul-varghese", "Rahul Varghese", "1990-03-17", "male", "lab", 1, "Laboratory", None, "persona; Central Lab"),
    (5, "fathima-beevi", "Fathima Beevi", "1992-11-02", "female", "radiology", 1, "Radiology", None, "persona"),
    (121, "asha-mohan", "Asha Mohan", "1995-02-10", "female", "nurse", 1, "ICU", 12, "ICU nurse"),
    (122, "mini-jacob", "Sr. Mini Jacob", "1980-06-15", "female", "nurse", 1, GM, 3, "Ward 3 charge nurse (was 'Sr. Mini Joseph')"),
    (123, "beena-thomas", "Sr. Beena Thomas", "1987-09-03", "female", "nurse", 1, GM, 3, "evening shift, takes Ward 3 handover"),
    (124, "rejo-mathew", "Br. Rejo Mathew", "1991-01-20", "male", "nurse", 1, GM, 3, "float nurse"),
    (125, "anoop-krishnan", "Anoop Krishnan", "1992-12-01", "male", "lab", 1, "Laboratory", None, "lab colleague (was 'Anoop K.'), takes lab handover 14:00"),
    (126, "vinod-kurian", "Vinod Kurian", "1989-04-12", "male", "radiology", 1, "Radiology", None, "CT technologist 08:00-20:00"),
]

# Pharmacy staff: (serial, slug, name, dob, sex, account_type, pharmacy n, reg no, active, note)
PHARMA_STAFF = [
    (6, "joseph-mathew", "Joseph Mathew", "1985-06-25", "male", "pharmacist", 1, "DSPC DEMO-30214", True, "persona; senior pharmacist"),
    (7, "suma-thomas", "Suma Thomas", "1982-01-30", "female", "pharmacy_admin", 1, None, True, "persona"),
    (301, "divya-raj", "Divya Raj", "1988-07-14", "female", "pharmacist", 1, "DSPC DEMO-33871", True, ""),
    (302, "shaji-kurian", "Shaji Kurian", "1981-03-09", "male", "pharmacist", 1, "DSPC DEMO-28140", True, "store in-charge"),
    (303, "neethu-babu", "Neethu Babu", "1994-11-27", "female", "pharmacist", 1, "DSPC DEMO-39025", True, "night shift"),
    (304, "faisal-rahman", "Faisal Rahman", "1993-05-06", "male", "pharmacist", 1, "DSPC DEMO-40517", True, "night shift"),
    (305, "bindu-varghese", "Bindu Varghese", "1986-02-19", "female", "pharmacist", 1, "DSPC DEMO-21339", False, "deactivated account"),
    (306, "ancy-varghese", "Ancy Varghese", "1984-09-23", "female", "pharmacy_admin", 2, None, True, "admin of Care Plus Demo Pharmacy; licence expires in 20 days"),
]

# Government admins: (serial, slug, name, dob, sex, account_type, level, scope, note)
#   scope: ('district', district name) | ('state', state id) | ('zone', zone id) | None (central)
ADMINS = [
    (9, "ajay-kumar", "Ajay Kumar", "1979-12-04", "male", "district_admin", "district", ("district", "Pathanamthitta"), "persona"),
    (10, "latha-nair", "Latha Nair", "1972-04-18", "female", "state_admin", "state", ("state", 33), "persona"),
    (11, "r-venkatesh", "R. Venkatesh", "1970-07-07", "male", "zonal_admin", "zonal", ("zone", 2), "persona"),
    (12, "s-banerjee", "S. Banerjee", "1968-02-23", "male", "central_admin", "central", None, "persona"),
    (201, "sajeev-k", "Dr. Sajeev K", "1976-01-08", "male", "district_admin", "district", ("district", "Thiruvananthapuram"), "state console unit admin"),
    (202, "mini-joseph", "Dr. Mini Joseph", "1977-08-16", "female", "district_admin", "district", ("district", "Ernakulam"), "state console unit admin"),
    (203, "fasal-rahman", "Dr. Fasal Rahman", "1974-05-30", "male", "district_admin", "district", ("district", "Kozhikode"), "state console unit admin"),
    (204, "shalini-rao", "Dr. Shalini Rao", "1971-10-14", "female", "state_admin", "state", ("state", 32), "Karnataka (zonal console)"),
    (205, "k-srinivas", "K. Srinivas", "1969-03-21", "male", "state_admin", "state", ("state", 30), "Andhra Pradesh (zonal console)"),
    (206, "farhan-ali", "Dr. Farhan Ali", "1973-12-09", "male", "state_admin", "state", ("state", 31), "Telangana (zonal console)"),
    (207, "m-selvi", "M. Selvi", "1975-06-02", "female", "state_admin", "state", ("state", 35), "Puducherry UT admin (zonal console)"),
    (208, "nitin-prasad", "Dr. Nitin Prasad", "1972-09-17", "male", "state_admin", "state", ("state", 13), "Bihar (central console)"),
    (209, "ak-mishra", "A. K. Mishra", "1967-11-25", "male", "state_admin", "state", ("state", 9), "Uttar Pradesh (central console)"),
    (210, "k-bose", "Dr. K. Bose", "1966-04-13", "male", "zonal_admin", "zonal", ("zone", 3), "East zone (central console)"),
    (211, "n-sharma", "N. Sharma", "1970-02-28", "female", "zonal_admin", "zonal", ("zone", 5), "Central zone (central console)"),
    (212, "l-sangma", "Dr. L. Sangma", "1971-08-05", "male", "zonal_admin", "zonal", ("zone", 1),
     "acting; the design says 'North-east', mapped to the North zone because there is no North-east zone"),
    (213, "suja-varma", "Dr. Suja Varma", "1973-02-11", "female", "district_admin", "district", ("district", "Pathanamthitta"),
     "deputy DMO, Pathanamthitta; second approver of the District console (the design label 'Dr. Meera Krishnan (DMO office)' is replaced by this separate person)"),
]
# Hospital admin: Dr. Meera Krishnan -> hospital 1
HOSPITAL_ADMINS = [(8, 1)]
META = {8: ("meera-krishnan", "Dr. Meera Krishnan", "1975-09-12", "female", "hospital_admin")}

# Citizens / patients. (serial, slug, name, age, sex, blood, home block/town, note)
P = "Pathanamthitta"
CITIZENS = [
    (1, "anjali-menon", "Anjali Menon", None, "female", "B+", "Kozhencherry", "persona; DOB 1991-02-14 (35); outpatient"),
    (1001, "thomas-kurian", "Thomas Kurian", 68, "male", None, "Pathanamthitta", "inpatient Ward 3 Bed 7; COPD, pneumonia; also break-glass patient of 03:12"),
    (1002, "thomas-varghese", "Thomas Varghese", 61, "male", None, "Pathanamthitta", "OP token 08; critical K+ 6.1"),
    (1003, "joseph-kurian", "Joseph Kurian", 66, "male", None, "Konni", "HbA1c review, Glimepiride"),
    (1004, "mini-thomas", "Mini Thomas", 47, "female", None, "Kozhencherry", "clopidogrel review, CYP2C19 *1/*2"),
    (1005, "lakshmi-amma", "Lakshmi Amma", 72, "female", None, "Omalloor", "fever day 3, dengue NS1; via daughter Sindhu"),
    (1006, "ramesh-pillai", "Ramesh Pillai", 55, "male", None, "Pathanamthitta", "hypertension"),
    (1007, "fathima-nazar", "Fathima Nazar", 29, "female", None, "Adoor", "antenatal 24 weeks (was 'Fathima N.')"),
    (1008, "biju-george", "Biju George", 44, "male", "B+", "Konni", "back pain; blood donor B+ (9 donations)"),
    (1009, "suresh-pillai", "Suresh Pillai", 58, "male", None, "Adoor", "cardiology referral to Medical College Kottayam (was 'Suresh P.')"),
    (1010, "babu-jacob", "Babu Jacob", 58, "male", None, "Thiruvalla", "kidney follow-up, nephrology referral"),
    (1011, "sindhu-raj", "Sindhu Raj", 34, "female", None, "Omalloor", "thyroid teleconsult; daughter of Lakshmi Amma (was 'Sindhu R.')"),
    (1012, "abdul-rasheed", "Abdul Rasheed", 52, "male", None, "Pathanamthitta", "inpatient Ward 3 Bed 4; CBC + CRP"),
    (1013, "sreedevi-amma", "Sreedevi Amma", 74, "female", None, "Ranni", "inpatient Ward 3 Bed 12; NEWS 5"),
    (1014, "mary-george", "Mary George", 59, "female", None, "Kozhencherry", "inpatient Ward 3 Bed 8; NBM for endoscopy"),
    (1015, "gopi-mohan", "Gopi Mohan", 61, "male", None, "Pandalam", "inpatient Ward 3 Bed 11; portable chest X-ray (was 'Gopi M.')"),
    (1016, "divya-ramesh", "Divya Ramesh", 27, "female", None, "Adoor", "pregnant 20 weeks; obstetric USG"),
    (1017, "akhil-suresh", "Akhil Suresh", 19, "male", None, "Adoor", "wrist X-ray"),
    (1018, "rahul-sasi", "Rahul Sasi", 11, "male", None, "Adoor", "MINOR; guardian Sasi Kumar; Schedule X medicine"),
    (1019, "mariamma-joseph", "Mariamma Joseph", 72, "female", None, "Thiruvalla", "CKD3; CT head STAT (was 'Mariamma J.')"),
    (1020, "bindu-vijayan", "Bindu Vijayan", 38, "female", None, "Pathanamthitta", "thyroid USG (was 'Bindu V.')"),
    (1021, "nisha-rajan", "Nisha Rajan", 29, "female", None, "Pathanamthitta", "TSH / T4 (was 'Nisha R.')"),
    (1022, "joseph-philip", "Joseph Philip", 45, "male", None, "Pathanamthitta", "lab LO-style order (was 'Joseph P.')"),
    (1023, "thankamma-pillai", "Thankamma Pillai", 70, "female", None, "Pathanamthitta", "ICU patient of a break-glass (Dr. Sameer Ali) (was 'Thankamma P.')"),
    # Ward 3 board-only patients: serial = 1100 + bed number
    (1101, "ramesh-kaimal", "Ramesh Kaimal", 63, "male", None, "Pathanamthitta", "Ward 3 Bed 1 (was 'Ramesh K.')"),
    (1102, "lalitha-panicker", "Lalitha Panicker", 67, "female", None, "Pathanamthitta", "Ward 3 Bed 2 (was 'Lalitha P.')"),
    (1103, "anitha-mathew", "Anitha Mathew", 34, "female", "B+", "Pathanamthitta", "Ward 3 Bed 3; LRTI, penicillin allergy, likely discharge (was 'Anjali M.' / IP-DEMO-30318)"),
    (1105, "joy-varghese", "Joy Varghese", 58, "male", None, "Pathanamthitta", "Ward 3 Bed 5 (was 'Joy V.')"),
    (1109, "saji-nair", "Saji Nair", 49, "male", None, "Pathanamthitta", "Ward 3 Bed 9; likely discharge (was 'Saji N.')"),
    (1110, "usha-devi", "Usha Devi", 56, "female", None, "Pathanamthitta", "Ward 3 Bed 10 (was 'Usha D.')"),
    (1113, "ali-hassan", "Ali Hassan", 60, "male", None, "Pathanamthitta", "Ward 3 Bed 13 (was 'Ali H.')"),
    (1114, "bindu-sasidharan", "Bindu Sasidharan", 51, "female", None, "Pathanamthitta", "Ward 3 Bed 14 (was 'Bindu S.')"),
    (1115, "mohan-lal", "Mohan Lal", 66, "male", None, "Pathanamthitta", "Ward 3 Bed 15 (was 'Mohan L.')"),
    (1116, "rosamma-thomas", "Rosamma Thomas", 71, "female", None, "Pathanamthitta", "Ward 3 Bed 16 (was 'Rosamma T.')"),
    (1117, "shibu-philip", "Shibu Philip", 43, "male", None, "Pathanamthitta", "Ward 3 Bed 17 (was 'Shibu P.')"),
    (1119, "kunjumon-chacko", "Kunjumon Chacko", 69, "male", None, "Pathanamthitta", "Ward 3 Bed 19 (was 'Kunjumon')"),
    (1120, "fousiya-abdulla", "Fousiya Abdulla", 48, "female", None, "Pathanamthitta", "Ward 3 Bed 20 (was 'Fousiya'); also the 'Fousiya A.' reviewer"),
    (1121, "vinod-raj", "Vinod Raj", 54, "male", None, "Pathanamthitta", "Ward 3 Bed 21 (was 'Vinod R.')"),
    (1122, "ammini-kurup", "Ammini Kurup", 77, "female", None, "Pathanamthitta", "Ward 3 Bed 22 (was 'Ammini')"),
    (1123, "rajan-chacko", "Rajan Chacko", 62, "male", None, "Pathanamthitta", "Ward 3 Bed 23 (was 'Rajan C.')"),
    (1124, "sathi-kumari", "Sathi Kumari", 57, "female", None, "Pathanamthitta", "Ward 3 Bed 24 (was 'Sathi K.')"),
    # Family, guardians, witnesses
    (2001, "ravi-menon", "Ravi Menon", 40, "male", "O+", "Kozhencherry", "Anjali's husband, emergency contact 1, trusted family"),
    (2002, "sasi-kumar", "Sasi Kumar", 42, "male", None, "Adoor", "guardian of Rahul Sasi (was 'Sasi K.')"),
    (2003, "sarala-nair", "Sarala Nair", 62, "female", None, "Kozhencherry", "Anjali's mother (the ONLY mother name), emergency contact 2, organ witness 1"),
    (2004, "diya-menon", "Diya Menon", 9, "female", None, "Kozhencherry", "MINOR; Anjali's daughter, Anjali is guardian"),
    (2005, "johnson-kuruvilla", "Johnson Kuruvilla", 58, "male", None, "Kozhencherry", "neighbour, organ witness 2 (was 'Thomas Kurian')"),
    # Donors
    (3001, "vishnu-prasad", "Vishnu Prasad", 31, "male", "O+", "Pathanamthitta", "blood donor"),
    (3002, "reshma-kurup", "Reshma Kurup", 27, "female", "A+", "Konni", "blood donor (was 'Reshma K.')"),
    (3003, "ananya-raj", "Ananya Raj", 24, "female", "O-", "Adoor", "blood donor (was 'Ananya R.')"),
]
MINORS = {1018, 2004}

# Ward 3 board: bed -> (person serial, state code); s = stable, w = watch, c = critical, f = free
BOARD = {
    1: (1101, "s"), 2: (1102, "s"), 3: (1103, "s"), 4: (1012, "w"), 5: (1105, "s"), 6: (None, "f"),
    7: (1001, "c"), 8: (1014, "s"), 9: (1109, "s"), 10: (1110, "s"), 11: (1015, "w"), 12: (1013, "w"),
    13: (1113, "s"), 14: (1114, "s"), 15: (1115, "s"), 16: (1116, "s"), 17: (1117, "s"), 18: (None, "f"),
    19: (1119, "s"), 20: (1120, "s"), 21: (1121, "s"), 22: (1122, "w"), 23: (1123, "s"), 24: (1124, "s"),
}
LEKHA_BEDS = {3, 4, 7, 8, 11, 12}   # kept for the doc only: nurse "mine" (Bed 3 is now Anitha Mathew)

# Locations (approx, ~1 km rounded) for citizen_profile.approx_location
TOWN = {
    "Pathanamthitta": (9.26, 76.79), "Kozhencherry": (9.33, 76.71), "Adoor": (9.15, 76.73), "Konni": (9.23, 76.85),
    "Thiruvalla": (9.38, 76.57), "Omalloor": (9.28, 76.78), "Ranni": (9.39, 76.78), "Pandalam": (9.23, 76.68),
}

# Blood banks and transplant centre
BLOOD_BANKS = [
    (1, "Demo General Hospital Blood Bank", 1, "Pathanamthitta", "govt"),
    (2, "Demo Medical College Blood Bank, Kottayam", 8, "Kottayam", "govt"),
]
TRANSPLANT_CENTRES = [(1, "Demo Medical College, Kottayam", 8, ["kidneys", "liver", "heart", "corneas"])]


# ----------------------------------------------------------------------------------------------
# Helpers for identity
# ----------------------------------------------------------------------------------------------
def dob_for_age(age: int, serial: int) -> str:
    month = 1 + serial % 9
    day = 1 + (serial * 7) % 27
    return f"{TODAY.year - age:04d}-{month:02d}-{day:02d}"


def token_for(slug: str) -> str:
    return "tok_DEMO_" + hashlib.sha256(("carefusion-demo|" + slug).encode()).hexdigest()[:12]


def handle_for(name: str, used: set[str]) -> str:
    base = re.sub(r"^(dr|sr|br)\.\s*", "", name.lower())
    base = re.sub(r"[^a-z. ]", "", base).strip().replace(" ", ".")
    base = re.sub(r"\.+", ".", base)
    h = f"{base}@demo"
    i = 2
    while h in used:
        h = f"{base}{i}@demo"
        i += 1
    used.add(h)
    return h


def collect_people():
    """Return ordered list of person dicts (one per distinct serial) with a source tag."""
    people: dict[int, dict] = {}
    order: list[int] = []

    def add(serial, slug, name, dob, sex, **kw):
        if serial in people:
            people[serial].update({k: v for k, v in kw.items() if v is not None})
            return
        people[serial] = dict(serial=serial, slug=slug, name=name, dob=dob, sex=sex, **kw)
        order.append(serial)

    for s, slug, name, dob, sex, acct, role in PERSONAS:
        add(s, slug, name, dob, sex, accounts=[acct], persona=True, role=role)
    for s, slug, name, dob, sex, hosp, dept, spec, hpr, reg, note in DOCTORS:
        add(s, slug, name, dob, sex, doctor=True, note=note, role=f"Doctor, {spec}")
    for s, slug, name, dob, sex, srole, hosp, dept, ward, note in STAFF:
        add(s, slug, name, dob, sex, staff=True, note=note, role=f"Staff ({srole})")
    for s, slug, name, dob, sex, acct, ph, reg, active, note in PHARMA_STAFF:
        add(s, slug, name, dob, sex, pharma=True, note=note, role=acct.replace("_", " "))
    for s, slug, name, dob, sex, acct, level, scope, note in ADMINS:
        add(s, slug, name, dob, sex, admin=True, note=note, role=acct.replace("_", " "))
    for s, (slug, name, dob, sex, acct) in META.items():
        add(s, slug, name, dob, sex, role="Hospital admin")
    for s, slug, name, age, sex, blood, town, note in CITIZENS:
        dob = "1991-02-14" if s == 1 else dob_for_age(age, s)
        add(s, slug, name, dob, sex, citizen=True, blood=blood, town=town, note=note,
            role="Citizen" if s != 1 else "Citizen")
    return [people[s] for s in order]


# ----------------------------------------------------------------------------------------------
# SQL builders
# ----------------------------------------------------------------------------------------------
def build_sql() -> tuple[str, dict]:
    out: list[str] = []
    w = out.append
    people = collect_people()
    by_serial = {p["serial"]: p for p in people}
    persona_serials = {p[0] for p in PERSONAS}
    used_handles: set[str] = set()

    # accounts per person: list of (account_type, app_user serial, created_at, status)
    accounts: dict[int, list[tuple[str, int, str, str]]] = {}
    abha_seq = 0
    for p in people:
        s = p["serial"]
        created = ts_persona(s) if s in persona_serials else T_SUPPORT
        p["created"] = created
        accts: list[tuple[str, int, str, str]] = []
        if p.get("persona"):
            accts.append((p["accounts"][0], s, created, "active"))
        if p.get("doctor") and not p.get("persona"):
            accts.append(("doctor", s, created, "active"))
        if p.get("staff") and not p.get("persona"):
            accts.append(("staff", s, created, "active"))
        for row in PHARMA_STAFF:
            if row[0] == s and not p.get("persona"):
                accts.append((row[5], s, created, "active" if row[8] else "deactivated"))
        for row in ADMINS:
            if row[0] == s and not p.get("persona"):
                accts.append((row[5], s, created, "active"))
        if s in META and not p.get("persona"):
            accts.append((META[s][4], s, created, "active"))
        if p.get("citizen") and s not in MINORS:
            if s == 1:
                pass  # already the persona citizen account
            else:
                accts.append(("citizen", s, created, "active"))
        # Doctors (and only doctors) are first verified citizens: companion citizen account.
        if p.get("doctor"):
            accts.append(("citizen", COMPANION_OFFSET + s, T_COMPANION, "active"))
        accounts[s] = accts
        # ABHA / handle
        if s == 1:
            p["abha"] = "DEMO-0000-1234"
            p["handle"] = "anjali.menon@demo"
            used_handles.add(p["handle"])
        elif s == 2:
            p["abha"] = "DEMO-0000-5678"
            p["handle"] = handle_for(p["name"], used_handles)
        elif s == 213:  # added later: fixed number so the sequence of every other person stays unchanged
            p["abha"] = "DEMO-0000-8213"
            p["handle"] = handle_for(p["name"], used_handles)
        else:
            abha_seq += 1
            p["abha"] = f"DEMO-0000-{9000 + abha_seq:04d}"
            p["handle"] = handle_for(p["name"], used_handles)
        p["token"] = token_for(p["slug"])

    # ---------------- header ----------------
    w("""-- =====================================================================
-- seed/design/00_base.sql : BASE layer of the design seed (generated by build_base.py).
-- Shared identities that every later seed file (10_*.sql ...) builds on.
--   * 12 demo role personas + supporting people, facilities, geography, wards and beds, admin posts.
--   * Literal deterministic UUIDs  cfd00000-KKKK-4000-8000-NNNNNNNNNNNN  (see seed/design/IDS.md).
--   * Idempotent: every insert is ON CONFLICT DO NOTHING; running it twice changes nothing.
--   * Run AFTER migrations 000-128 and (in the normal order) AFTER seed/demo_data.sql.
--   * Personas get created_at 2026-01-01 so apps/api lookupDemoIdentity (ORDER BY created_at)
--     picks them before the generated people of demo_data.sql (2026-10-16).
-- Synthetic data only. No Aadhaar digits (opaque tokens). Demo "today" = Sat 17 Oct 2026.
-- DO NOT EDIT BY HAND: change build_base.py and regenerate.
-- =====================================================================
BEGIN;

-- ---------- helpers other seed files can use ----------
CREATE OR REPLACE FUNCTION util.seed_uuid(kind int, n bigint) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT ('cfd00000-' || lpad(kind::text, 4, '0') || '-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
COMMENT ON FUNCTION util.seed_uuid(int, bigint) IS
  'Deterministic seed id: cfd00000-KKKK-4000-8000-NNNNNNNNNNNN (kind 4 digits, serial 12 digits). See carefusion-db/seed/design/IDS.md';

-- geo.district ids are random (migration 110); find them by name.
CREATE OR REPLACE FUNCTION util.seed_district(p_name text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM geo.district WHERE state_id = 33 AND name = p_name $$;
""")

    # ---------------- geo blocks ----------------
    w("\n-- ---------- Pathanamthitta blocks (12) ----------")
    w("INSERT INTO geo.block (id, district_id, name) VALUES")
    w(",\n".join(f"  ('{uid(K_BLOCK, n)}', util.seed_district('Pathanamthitta'), {q(name)})"
                 for n, code, name in BLOCKS))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- persons ----------------
    w("\n-- ---------- people (identity.person) ----------")
    w("INSERT INTO identity.person (id, full_name, date_of_birth, sex, aadhaar_token, abha_number, abha_address,"
      " kyc_status, face_check_status, identity_locked_at, created_at, registration_channel) VALUES")
    rows = []
    for p in people:
        minor = p["serial"] in MINORS
        kyc = "assisted" if minor else "passed"
        face = "pending" if minor else "passed"
        lock = "NULL" if minor else q(T_VERIFIED)
        rows.append(f"  ('{uid(K_PERSON, p['serial'])}', {q(p['name'])}, {q(p['dob'])}, {q(p['sex'])}, {q(p['token'])},"
                    f" {q(p['abha'])}, {q(p['handle'])}, '{kyc}', '{face}', {lock}, {q(p['created'])},"
                    f" '{'help_desk' if minor else 'citizen_app'}')")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- app users ----------------
    w("\n-- ---------- login accounts (identity.app_user) ----------")
    w("INSERT INTO identity.app_user (id, person_id, account_type, keycloak_sub, status, activated_at, deactivated_at, created_at) VALUES")
    rows = []
    for p in people:
        for acct, uns, created, status in accounts[p["serial"]]:
            sub = f"demo-kc-{acct.replace('_', '-')}-{p['slug']}"
            act = q(created) if status == "active" else q(created)
            deact = q("2026-09-02 00:00:00+00") if status == "deactivated" else "NULL"
            rows.append(f"  ('{uid(K_USER, uns)}', '{uid(K_PERSON, p['serial'])}', '{acct}', {q(sub)}, '{status}', {act}, {deact}, {q(created)})")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- admin posts ----------------
    w("\n-- ---------- admin posts (admin.admin_post) ----------")
    w("INSERT INTO admin.admin_post (id, user_id, level, zone_id, state_id, district_id, jan_parichay_ref, valid) VALUES")
    rows = []
    for s, slug, name, dob, sex, acct, level, scope, note in ADMINS:
        zone = state = "NULL"
        dist = "NULL"
        if scope:
            kind, val = scope
            if kind == "zone":
                zone = str(val)
            elif kind == "state":
                state = str(val)
            else:
                dist = f"util.seed_district({q(val)})"
        rows.append(f"  ('{uid(K_ADMIN_POST, s)}', '{uid(K_USER, s)}', '{level}', {zone}, {state}, {dist},"
                    f" {q('demo-jp-' + slug)}, tstzrange({q(ts_persona(s) if s in persona_serials else T_SUPPORT)}::timestamptz, NULL))")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- hospitals ----------------
    w("\n-- ---------- hospitals (org.hospital) ----------")
    w("INSERT INTO org.hospital (id, hfr_id, name, ownership, hospital_type, district_id, address, location, geofence,"
      " licence_no, phone, timings, services, about, status, approved_by, approved_at, created_at) VALUES")
    rows = []
    for n, name, hfr, htype, own, dist, lat, lng, depts in HOSPITALS:
        pt = f"ST_SetSRID(ST_MakePoint({lng:.6f}, {lat:.6f}), 4326)"
        geo = f"ST_Envelope(ST_Buffer({pt}, 0.006))"
        timings = H1_PROFILE["timings"] if n == 1 else "{}"
        address = H1_PROFILE["address"] if n == 1 else "Demo address, " + dist + ", Kerala"
        phone = q(H1_PROFILE["phone"]) if n == 1 else "NULL"
        services = ("ARRAY[" + ", ".join(q(x) for x in H1_PROFILE["services"]) + "]::text[]") if n == 1 else "'{}'::text[]"
        about = q(H1_PROFILE["about"]) if n == 1 else "NULL"
        rows.append(f"  ('{uid(K_HOSPITAL, n)}', {q(hfr)}, {q(name)}, '{own}', '{htype}', util.seed_district({q(dist)}),"
                    f" {q(address)}, {pt}, {geo}, {q('DEMO-HCE-KL-' + hfr[-4:])}, {phone},"
                    f" {q(timings)}::jsonb, {services}, {about}, 'active', '{uid(K_USER, 9)}', {q(T_VERIFIED)}, {q(T_SUPPORT)})")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    w("\n-- ---------- departments (org.department): serial = hospital*100 + position in the list ----------")
    w("INSERT INTO org.department (id, hospital_id, name, head_user_id) VALUES")
    rows = []
    for n, name, hfr, htype, own, dist, lat, lng, depts in HOSPITALS:
        for i, d in enumerate(depts, 1):
            head = f"'{uid(K_USER, H1_DEPT_HEAD[d])}'" if n == 1 and d in H1_DEPT_HEAD else "NULL"
            rows.append(f"  ('{uid(K_DEPT, n * 100 + i)}', '{uid(K_HOSPITAL, n)}', {q(d)}, {head})")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- pharmacies ----------------
    w("\n-- ---------- pharmacies (org.pharmacy) ----------")
    w("INSERT INTO org.pharmacy (id, licence_no, name, pharmacy_type, linked_hospital_id, district_id, address, location,"
      " opening_hours, licence_valid_until, counters, compliance_score, last_inspection_on, next_inspection_due,"
      " is_jan_aushadhi, status, approved_by, approved_at, created_at) VALUES")
    rows = []
    for n, name, lic, ptype, linked, dist, lat, lng in PHARMACIES:
        link = f"'{uid(K_HOSPITAL, linked)}'" if linked else "NULL"
        hours = '{"mon-sun": [["08:00", "20:00"]]}'
        x = PHARMACY_EXTRA.get(n, {})
        def dt(k):
            return q(x[k]) + "::date" if k in x else "NULL"
        rows.append(f"  ('{uid(K_PHARMACY, n)}', {q(lic)}, {q(name)}, '{ptype}', {link}, util.seed_district({q(dist)}),"
                    f" {q('Demo address, ' + dist + ', Kerala')}, ST_SetSRID(ST_MakePoint({lng:.6f}, {lat:.6f}), 4326),"
                    f" {q(hours)}::jsonb, {dt('licence_valid_until')}, {x.get('counters', 1)},"
                    f" {x.get('compliance_score', 'NULL')}, {dt('last_inspection_on')}, {dt('next_inspection_due')},"
                    f" {'true' if x.get('is_jan_aushadhi') else 'false'},"
                    f" 'active', '{uid(K_USER, 9)}', {q(T_VERIFIED)}, {q(T_SUPPORT)})")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- wards & beds ----------------
    w("\n-- ---------- wards of Demo General Hospital (org.ward) and 24-bed board of Ward 3 (org.bed) ----------")
    w("INSERT INTO org.ward (id, hospital_id, department_id, code, name, charge_nurse_user_id) VALUES")
    rows = []
    for n, code, name, dept, charge in WARDS:
        cn = f"'{uid(K_USER, charge)}'" if charge else "NULL"
        rows.append(f"  ('{uid(K_WARD, n)}', '{uid(K_HOSPITAL, 1)}', '{uid(K_DEPT, dept_serial(1, dept))}', {q(code)}, {q(name)}, {cn})")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")
    w("-- Ward 3: bed serial = 3000 + bed number. 22 of 24 occupied (beds 6 and 18 free). Occupant = see IDS.md board table.")
    w("-- Ward 5: bed serial = 5000 + bed number, 12 beds, all free (admissions are written by later seed files).")
    w("INSERT INTO org.bed (id, ward_id, hospital_id, bed_no, bed_type, status) VALUES")
    rows = []
    for b in range(1, 25):
        st = "free" if b in FREE_BEDS_W3 else "occupied"
        rows.append(f"  ('{uid(K_BED, 3000 + b)}', '{uid(K_WARD, WARD_W3)}', '{uid(K_HOSPITAL, 1)}', '{b}', 'general', '{st}')")
    for b in range(1, W5_BEDS + 1):
        rows.append(f"  ('{uid(K_BED, 5000 + b)}', '{uid(K_WARD, WARD_W5)}', '{uid(K_HOSPITAL, 1)}', '{b}', 'general', 'free')")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- doctor profiles ----------------
    w("\n-- ---------- doctors (identity.doctor_profile) ----------")
    w("INSERT INTO identity.doctor_profile (user_id, hpr_id, council_name, council_reg_no, specialisation, degrees,"
      " hospital_id, department_id, employment_type, signing_method, duty_hours, hpr_verified_at) VALUES")
    rows = []
    for s, slug, name, dob, sex, hosp, dept, spec, hpr, reg, note in DOCTORS:
        degrees = '[{"degree": "MBBS", "year": 2008}, {"degree": "MD", "year": 2012}]' if s == 2 else '[{"degree": "MBBS"}]'
        duty = '{"days": "Mon-Sat", "from": "09:00", "to": "17:00"}' if s == 2 else "{}"
        emp = "govt" if hosp in GOVT_HOSPITALS else "private"
        rows.append(f"  ('{uid(K_USER, s)}', 'DEMO-HPR-71-{hpr}', 'Demo Medical Council, Kerala', 'DEMO-MC-{reg}',"
                    f" {q(spec)}, {q(degrees)}::jsonb, '{uid(K_HOSPITAL, hosp)}', '{uid(K_DEPT, dept_serial(hosp, dept))}',"
                    f" '{emp}', 'mock', {q(duty)}::jsonb, {q(T_VERIFIED)})")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- staff profiles ----------------
    w("\n-- ---------- nurses, lab and radiology staff (identity.staff_profile), created by the hospital admin ----------")
    w("INSERT INTO identity.staff_profile (user_id, hospital_id, department_id, staff_role, created_by_user_id, ward_id,"
      " employee_code, registration_no, designation, shift, is_charge) VALUES")
    rows = []
    for s_, slug, name, dob, sex, srole, hosp, dept, ward, note in STAFF:
        wd = f"'{uid(K_WARD, ward)}'" if ward else "NULL"
        ec, rg, ds, sh, ch = STAFF_EXTRA[s_]
        rows.append(f"  ('{uid(K_USER, s_)}', '{uid(K_HOSPITAL, hosp)}', '{uid(K_DEPT, dept_serial(hosp, dept))}', '{srole}',"
                    f" '{uid(K_USER, 8)}', {wd}, {q(ec)}, {q(rg)}, {q(ds)}, {q(sh)}, {'true' if ch else 'false'})")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- hospital admin ----------------
    w("\n-- ---------- hospital admin (identity.hospital_admin_profile) ----------")
    w("INSERT INTO identity.hospital_admin_profile (user_id, hospital_id) VALUES")
    w(",\n".join(f"  ('{uid(K_USER, s)}', '{uid(K_HOSPITAL, h)}')" for s, h in HOSPITAL_ADMINS))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- pharmacy admins + pharmacists ----------------
    w("\n-- ---------- pharmacy admins (identity.pharmacy_admin_profile) ----------")
    w("INSERT INTO identity.pharmacy_admin_profile (user_id, pharmacy_id) VALUES")
    w(",\n".join(f"  ('{uid(K_USER, r[0])}', '{uid(K_PHARMACY, r[6])}')" for r in PHARMA_STAFF if r[5] == "pharmacy_admin"))
    w("ON CONFLICT DO NOTHING;")
    w("\n-- ---------- pharmacists (identity.pharmacist_profile), created by the pharmacy admin Suma Thomas ----------")
    w("INSERT INTO identity.pharmacist_profile (user_id, pharmacy_id, registration_no, created_by_user_id, role_label, shift) VALUES")
    w(",\n".join(f"  ('{uid(K_USER, r[0])}', '{uid(K_PHARMACY, r[6])}', {q(r[7])}, '{uid(K_USER, 7)}',"
                 f" {q(PHARMACIST_EXTRA[r[0]][0])}, {q(PHARMACIST_EXTRA[r[0]][1]) if PHARMACIST_EXTRA[r[0]][1] else 'NULL'})"
                 for r in PHARMA_STAFF if r[5] == "pharmacist"))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- citizen profiles ----------------
    w("\n-- ---------- citizen health-profile shells (identity.citizen_profile) ----------")
    w("-- Blood group only where a design shows it. Doctors have a companion citizen profile (every doctor is first a citizen).")
    w("INSERT INTO identity.citizen_profile (person_id, preferred_language, district_id, approx_location, blood_group,"
      " guardian_person_id, guardian_consent_at, handover_due_on, health_card_issued_at) VALUES")
    rows = []
    for p in people:
        s = p["serial"]
        if not (p.get("citizen") or p.get("doctor")):
            continue
        town = p.get("town") or "Pathanamthitta"
        lat, lng = TOWN.get(town, TOWN["Pathanamthitta"])
        lat += (s % 7) * 0.002
        lng += (s % 5) * 0.002
        blood = p.get("blood") or "unknown"
        guardian, gcons, due = "NULL", "NULL", "NULL"
        if s == 2004:
            guardian, gcons = f"'{uid(K_PERSON, 1)}'", q("2026-01-05 00:00:00+00")
        if s == 1018:
            guardian, gcons = f"'{uid(K_PERSON, 2002)}'", q("2026-01-05 00:00:00+00")
        if s in MINORS:
            y, m, d = (int(x) for x in p["dob"].split("-"))
            due = q(f"{y + 18:04d}-{m:02d}-{d:02d}")
        lang = "ml" if s in (1005, 1013, 1122) else "en"
        card = "NULL" if s in MINORS else q(T_VERIFIED)
        rows.append(f"  ('{uid(K_PERSON, s)}', '{lang}', util.seed_district('Pathanamthitta'),"
                    f" ST_SetSRID(ST_MakePoint({lng:.2f}, {lat:.2f}), 4326), '{blood}', {guardian}, {gcons}, {due}, {card})")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- relationships ----------------
    w("\n-- ---------- emergency contacts, family links ----------")
    w("INSERT INTO identity.emergency_contact (id, citizen_person_id, contact_person_id, relation, priority, added_at) VALUES")
    w(f"  ('{uid(K_ECONTACT, 1)}', '{uid(K_PERSON, 1)}', '{uid(K_PERSON, 2001)}', 'Husband', 1, {q(T_SUPPORT)}),")
    w(f"  ('{uid(K_ECONTACT, 2)}', '{uid(K_PERSON, 1)}', '{uid(K_PERSON, 2003)}', 'Mother', 2, {q(T_SUPPORT)})")
    w("ON CONFLICT DO NOTHING;")
    w("INSERT INTO identity.family_link (id, citizen_person_id, member_person_id, relation, can_show_key, requested_at, accepted_at) VALUES")
    w(f"  ('{uid(K_FAMILY, 1)}', '{uid(K_PERSON, 1)}', '{uid(K_PERSON, 2001)}', 'husband', true, {q(T_SUPPORT)}, {q(T_SUPPORT)}),")
    w(f"  ('{uid(K_FAMILY, 2)}', '{uid(K_PERSON, 1)}', '{uid(K_PERSON, 2004)}', 'daughter', false, {q(T_SUPPORT)}, {q(T_SUPPORT)})")
    w("ON CONFLICT DO NOTHING;")

    # ---------------- consents ----------------
    w("\n-- ---------- privacy-notice consent for every person with a login (identity.consent_record); minors via guardian ----------")
    w("INSERT INTO identity.consent_record (id, person_id, purpose, notice_version, given_by_person_id, granted_at) VALUES")
    rows = []
    for p in people:
        s = p["serial"]
        giver = s
        if s == 2004:
            giver = 1
        if s == 1018:
            giver = 2002
        purpose = "minor_guardian" if s in MINORS else "privacy_notice"
        rows.append(f"  ('{uid(K_CONSENT, s)}', '{uid(K_PERSON, s)}', '{purpose}', '1.0-alpha', '{uid(K_PERSON, giver)}', {q(T_SUPPORT)})")
    w(",\n".join(rows))
    w("ON CONFLICT DO NOTHING;")

    # ---------------- blood banks, transplant centre ----------------
    w("\n-- ---------- blood banks and transplant centre ----------")
    w("INSERT INTO donation.blood_bank (id, name, hospital_id, district_id, kind, address) VALUES")
    w(",\n".join(f"  ('{uid(K_BLOOD_BANK, n)}', {q(name)}, '{uid(K_HOSPITAL, h)}', util.seed_district({q(d)}), '{kind}',"
                 f" {q('Demo address, ' + d + ', Kerala')})" for n, name, h, d, kind in BLOOD_BANKS))
    w("ON CONFLICT DO NOTHING;")
    w("INSERT INTO donation.transplant_centre (id, name, hospital_id, state_id, organs) VALUES")
    w(",\n".join(f"  ('{uid(K_TRANSPLANT, n)}', {q(name)}, '{uid(K_HOSPITAL, h)}', 33, ARRAY[{', '.join(q(o) for o in organs)}])"
                 for n, name, h, organs in TRANSPLANT_CENTRES))
    w("ON CONFLICT DO NOTHING;")

    w("\nCOMMIT;")
    return "\n".join(out) + "\n", dict(people=people, accounts=accounts)


# ----------------------------------------------------------------------------------------------
# IDS.md generated registry
# ----------------------------------------------------------------------------------------------
def build_registry(ctx: dict) -> str:
    people = ctx["people"]
    accounts = ctx["accounts"]
    L: list[str] = []
    a = L.append

    a("### Personas (the 12 demo sign-in roles)\n")
    a("Sign-in order in `lookupDemoIdentity`: earliest `created_at` among active accounts of the role. Personas are 2026-01-01 00:00:NN.\n")
    a("| # | Persona | Role on the sign-in page | account_type | person id | app_user id |")
    a("|---|---------|--------------------------|--------------|-----------|-------------|")
    for s, slug, name, dob, sex, acct, role in PERSONAS:
        a(f"| {s} | {name} | {role} | `{acct}` | `{uid(K_PERSON, s)}` | `{uid(K_USER, s)}` |")

    a("\n### Everyone else (person serial, display name, what they are)\n")
    a("`app_user` id = kind `0002` + the same serial. Doctors also have a companion CITIZEN account: kind `0002` + (5000 + serial).\n")
    a("| Serial | Display name | DOB | Sex | Accounts | Note |")
    a("|--------|--------------|-----|-----|----------|------|")
    for p in people:
        if p.get("persona"):
            continue
        accts = ", ".join(f"{t}" for t, _, _, _ in accounts[p["serial"]]) or "none (minor, no login)"
        note = p.get("note") or p.get("role") or ""
        a(f"| {p['serial']} | {p['name']} | {p['dob']} | {p['sex'][0].upper()} | {accts} | {note} |")

    a("\n### Hospitals (`org.hospital`, kind `0010`) and their departments (kind `0011`, serial = hospital*100 + position)\n")
    a("| n | Hospital id | Name | HFR id | Type | District | Departments (position) |")
    a("|---|-------------|------|--------|------|----------|------------------------|")
    for n, name, hfr, htype, own, dist, lat, lng, depts in HOSPITALS:
        dl = ", ".join(f"{i}={d}" for i, d in enumerate(depts, 1))
        a(f"| {n} | `{uid(K_HOSPITAL, n)}` | {name} | `{hfr}` | {htype} {own} | {dist} | {dl} |")

    a("\n### Pharmacies (`org.pharmacy`, kind `0012`)\n")
    a("| n | Pharmacy id | Name | Licence | Type | Linked hospital |")
    a("|---|-------------|------|---------|------|-----------------|")
    for n, name, lic, ptype, linked, dist, lat, lng in PHARMACIES:
        a(f"| {n} | `{uid(K_PHARMACY, n)}` | {name} | `{lic}` | {ptype} | {linked or ''} |")

    a("\n### Wards of Demo General Hospital (`org.ward`, kind `0013`) and beds (`org.bed`, kind `0014`)\n")
    a("| n | Ward id | Code | Name | Department | Charge nurse |")
    a("|---|---------|------|------|------------|--------------|")
    for n, code, name, dept, charge in WARDS:
        a(f"| {n} | `{uid(K_WARD, n)}` | {code} | {name} | {dept} | {by_name(people, charge)} |")
    a("\nWard 3 bed id = kind `0014`, serial `3000 + bed_no` (for example bed 7 = `" + uid(K_BED, 3007) + "`). "
      "Ward 5 bed id = serial `5000 + bed_no` (12 beds, all free). Beds 1-24 of Ward 3 hold `bed_no` `'1'`..`'24'`.\n")
    a("Ward 3 board (state: s stable, w watch, c critical, f free; `mine` = assigned to Lekha Pillai in the design):\n")
    a("| Bed | Occupant | Person serial | State | Lekha's |")
    a("|-----|----------|---------------|-------|---------|")
    for b in range(1, 25):
        ps, st = BOARD[b]
        mine = "yes" if b in {4, 7, 8, 11, 12, 3} else ""
        who = by_name(people, ps) if ps else "(free)"
        a(f"| {b} | {who} | {ps or ''} | {st} | {mine} |")

    a("\n### Geography\n")
    a("India (central) > South zone (`geo.zone` id 2) > Kerala (`geo.state` id 33, code KL) > Pathanamthitta district > 12 blocks.\n")
    a("`geo.district` ids are random (migration 110): use `util.seed_district('Pathanamthitta')`. Blocks (`geo.block`, kind `0015`):\n")
    a("| n | Code | Block | Block id |")
    a("|---|------|-------|----------|")
    for n, code, name in BLOCKS:
        a(f"| {n} | {code} | {name} | `{uid(K_BLOCK, n)}` |")

    a("\n### Admin posts (`admin.admin_post`, kind `0016`, serial = the admin's person serial)\n")
    a("| Serial | Admin | Level | Scope | Post id |")
    a("|--------|-------|-------|-------|---------|")
    for s, slug, name, dob, sex, acct, level, scope, note in ADMINS:
        sc = "India" if scope is None else f"{scope[0]} {scope[1]}"
        a(f"| {s} | {name} | {level} | {sc} | `{uid(K_ADMIN_POST, s)}` |")

    a("\n### Other shared rows\n")
    a("| Table | kind | Serials |")
    a("|-------|------|---------|")
    a("| `identity.emergency_contact` | 0003 | 1 Ravi Menon (priority 1), 2 Sarala Nair (priority 2), both for Anjali |")
    a("| `identity.family_link` | 0004 | 1 Ravi Menon (can show key), 2 Diya Menon (daughter, Anjali is guardian) |")
    a("| `identity.consent_record` | 0006 | serial = person serial (privacy_notice; minors: minor_guardian) |")
    a("| `donation.blood_bank` | 0017 | " + "; ".join(f"{n} {name}" for n, name, *_ in BLOOD_BANKS) + " |")
    a("| `donation.transplant_centre` | 0018 | " + "; ".join(f"{n} {name}" for n, name, *_ in TRANSPLANT_CENTRES) + " |")
    return "\n".join(L) + "\n"


def by_name(people, serial):
    if serial is None:
        return ""
    for p in people:
        if p["serial"] == serial:
            return p["name"]
    return str(serial)


def main() -> None:
    sql, ctx = build_sql()
    (HERE / "00_base.sql").write_text(sql, encoding="utf-8")
    reg = build_registry(ctx)
    ids = HERE / "IDS.md"
    begin, end = "<!-- BEGIN GENERATED -->", "<!-- END GENERATED -->"
    if ids.exists():
        text = ids.read_text(encoding="utf-8")
        if begin in text and end in text:
            head, rest = text.split(begin, 1)
            _, tail = rest.split(end, 1)
            ids.write_text(f"{head}{begin}\n\n{reg}\n{end}{tail}", encoding="utf-8")
        else:
            print("IDS.md has no generated markers; registry not written")
    else:
        ids.write_text(f"{begin}\n\n{reg}\n{end}\n", encoding="utf-8")
    print(f"wrote 00_base.sql ({len(sql.splitlines())} lines), {len(ctx['people'])} people")


if __name__ == "__main__":
    main()

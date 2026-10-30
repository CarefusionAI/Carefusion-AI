"""
Synthetic demo-data generator for CareFusion AI alpha.

Outputs: demo_data.sql  (to be run AFTER the migrations and 110_reference_data.sql)

Rules (from CLAUDE.md):
  - Every identifier starts with DEMO- and can never pass as real Aadhaar/ABHA.
  - No raw Aadhaar — tokens only.
  - Deterministic: seeded so every run produces the same output.

No external dependencies — uses built-in random + hardcoded Indian name lists.
"""

from __future__ import annotations

import hashlib
import random
from datetime import date, timedelta, timezone
from pathlib import Path

SEED = 42
random.seed(SEED)

OUT = Path(__file__).parent / "demo_data.sql"

# ── Indian name lists (Kerala-heavy, common names) ──

MALE_FIRST = [
    "Arun", "Vishnu", "Rahul", "Suresh", "Manoj", "Rajesh", "Sanjay", "Deepak",
    "Anand", "Prasad", "Vijay", "Mohan", "Ravi", "Krishna", "Gopal", "Sunil",
    "Ajith", "Sreejith", "Pramod", "Biju", "Jayan", "Unnikrishnan", "Satheesh",
    "Harish", "Dinesh", "Pradeep", "Santhosh", "Ramesh", "Babu", "Akhil",
    "Arjun", "Dev", "Kiran", "Nair", "Pillai", "Menon", "Kurup", "Rajan",
    "Thomas", "Joseph", "Mathew", "George", "John", "Samuel", "Daniel", "David",
    "Ashok", "Vinod", "Girish", "Mukesh",
]
FEMALE_FIRST = [
    "Asha", "Lakshmi", "Priya", "Swathi", "Anjali", "Deepa", "Kavitha", "Revathi",
    "Meera", "Nandini", "Divya", "Sumi", "Reshma", "Aswathy", "Gayathri", "Lekha",
    "Sreelakshmi", "Amala", "Bhavana", "Chandana", "Devika", "Fathima", "Geetha",
    "Hema", "Indira", "Jaya", "Kamala", "Latha", "Manju", "Nisha",
    "Padma", "Radha", "Sarala", "Thara", "Uma", "Vasantha", "Yamuna", "Ambili",
    "Bindu", "Chinnu", "Devi", "Elsa", "Mary", "Grace", "Rosemary", "Susan",
    "Anitha", "Beena", "Chithra", "Dhanya",
]
LAST_NAMES = [
    "Nair", "Menon", "Pillai", "Kumar", "Varma", "Kurup", "Panicker", "Iyer",
    "Nambiar", "Warrier", "Pothan", "Thampi", "Das", "Pai", "Kaimal", "Unnithan",
    "Rajan", "Krishnan", "Gopalan", "Chandran", "Mohan", "Thomas", "Joseph",
    "Mathew", "George", "Abraham", "Kurian", "Philip", "Chacko", "Varghese",
    "Shetty", "Reddy", "Sharma", "Gupta", "Singh", "Patel", "Rao", "Naidu",
    "Subramaniam", "Raghavan",
]

NOW = "2026-10-16T12:00:00+00:00"

# ── Kerala districts ──

DISTRICTS = [
    {"name": "Ernakulam", "lat": 9.9312, "lng": 76.2673},
    {"name": "Thiruvananthapuram", "lat": 8.5241, "lng": 76.9366},
]

HOSPITAL_TYPES = [
    ("PHC", "govt", 3),
    ("CHC", "govt", 2),
    ("DH", "govt", 1),
    ("MCH", "govt", 1),
    ("PVT_CLINIC", "private", 2),
    ("PVT_HOSP", "private", 1),
]

DEPARTMENTS = ["General Medicine", "Surgery", "Paediatrics", "Obstetrics", "Orthopaedics"]
STAFF_ROLES = ["nurse", "lab", "radiology"]
BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
SEXES = ["female", "male"]
SPECIALISATIONS = [
    "General Medicine", "General Surgery", "Paediatrics", "Obstetrics & Gynaecology",
    "Orthopaedics", "Ophthalmology", "ENT", "Dermatology", "Psychiatry", "Anaesthesiology",
]

# ── Helpers ──

_uuid_counter = 0

def demo_uuid() -> str:
    global _uuid_counter
    _uuid_counter += 1
    h = hashlib.md5(f"demo-{_uuid_counter}-{SEED}".encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

def demo_aadhaar(n: int) -> str:
    return f"DEMO-{n:04d}-{random.randint(1000, 9999):04d}"

def demo_abha(n: int) -> str:
    return f"DEMO-{n:02d}-{random.randint(1000, 9999):04d}-{random.randint(1000, 9999):04d}-{random.randint(1000, 9999):04d}"

def demo_hfr(n: int) -> str:
    return f"DEMO-HFR-{n:06d}"

def demo_hpr(n: int) -> str:
    return f"DEMO-HPR-71-{n:04d}"   # canonical (identity.is_canonical_hpr_id); n < 42 so it never meets the design doctors (0042+)

def demo_licence(prefix: str, n: int) -> str:
    return f"DEMO-{prefix}-{n:06d}"

def demo_reg(n: int) -> str:
    return f"DEMO-REG-{n:06d}"

def sq(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"

def point_wkt(lat: float, lng: float) -> str:
    return f"ST_SetSRID(ST_MakePoint({lng:.6f}, {lat:.6f}), 4326)"

def geofence_wkt(lat: float, lng: float, r: float = 0.005) -> str:
    coords = ", ".join([
        f"{lng-r:.6f} {lat-r:.6f}", f"{lng+r:.6f} {lat-r:.6f}",
        f"{lng+r:.6f} {lat+r:.6f}", f"{lng-r:.6f} {lat+r:.6f}",
        f"{lng-r:.6f} {lat-r:.6f}",
    ])
    return f"ST_SetSRID(ST_GeomFromText('POLYGON(({coords}))'), 4326)"

def random_dob(min_age: int = 18, max_age: int = 70) -> str:
    base = date(2026, 10, 16)
    days = min_age * 365 + random.randint(0, (max_age - min_age) * 365)
    return (base - timedelta(days=days)).isoformat()

def random_name(sex: str) -> str:
    first = random.choice(MALE_FIRST if sex == "male" else FEMALE_FIRST)
    last = random.choice(LAST_NAMES)
    return f"{first} {last}"

# ── Collect SQL ──

lines: list[str] = []
def emit(sql: str) -> None:
    lines.append(sql)

emit("-- =============================================================")
emit("-- CareFusion AI — synthetic demo data (auto-generated)")
emit("-- Run AFTER all migrations. All IDs start with DEMO-.")
emit("-- =============================================================")
emit("BEGIN;")
emit("")

emit("CREATE TEMP TABLE _demo_districts (name text PRIMARY KEY, id uuid NOT NULL);")
for d in DISTRICTS:
    emit(f"INSERT INTO _demo_districts SELECT {sq(d['name'])}, id FROM geo.district WHERE name = {sq(d['name'])} AND state_id = 33;")
emit("")

# ── Hospitals ──

hospitals: list[dict] = []
hosp_n = 0
for d_idx, district in enumerate(DISTRICTS):
    for htype, ownership, count in HOSPITAL_TYPES:
        for i in range(count):
            hosp_n += 1
            lat = district["lat"] + random.uniform(-0.08, 0.08)
            lng = district["lng"] + random.uniform(-0.08, 0.08)
            hid = demo_uuid()
            suffixes = {
                "PHC": f"PHC {random.choice(LAST_NAMES)}puram",
                "CHC": f"CHC {random.choice(LAST_NAMES)}puram",
                "DH": f"{district['name']} District Hospital",
                "MCH": f"Govt Medical College, {district['name']}",
                "PVT_CLINIC": f"Dr {random.choice(LAST_NAMES)}'s Clinic",
                "PVT_HOSP": f"{random.choice(LAST_NAMES)} Hospital",
            }
            hname = suffixes.get(htype, f"Hospital {hosp_n}")
            if i > 0:
                hname += f" ({i + 1})"
            hospitals.append({
                "id": hid, "name": hname, "htype": htype, "ownership": ownership,
                "district": district["name"], "lat": lat, "lng": lng,
                "hfr_id": demo_hfr(hosp_n), "licence": demo_licence("HCE", hosp_n),
            })

emit(f"-- {len(hospitals)} hospitals")
for h in hospitals:
    emit(
        f"INSERT INTO org.hospital (id, hfr_id, name, ownership, hospital_type, district_id, "
        f"address, location, geofence, licence_no, status, created_at) VALUES ("
        f"{sq(h['id'])}, {sq(h['hfr_id'])}, {sq(h['name'])}, {sq(h['ownership'])}, {sq(h['htype'])}, "
        f"(SELECT id FROM _demo_districts WHERE name = {sq(h['district'])}), "
        f"{sq('Demo Address, ' + h['district'] + ', Kerala')}, "
        f"{point_wkt(h['lat'], h['lng'])}, {geofence_wkt(h['lat'], h['lng'])}, "
        f"{sq(h['licence'])}, 'active', {sq(NOW)});"
    )
emit("")

# Departments
dept_map: dict[str, list[dict]] = {}
for h in hospitals:
    n_depts = 3 if h["htype"] in ("PHC", "PVT_CLINIC") else 5
    depts = []
    for dname in DEPARTMENTS[:n_depts]:
        did = demo_uuid()
        depts.append({"id": did, "name": dname})
        emit(f"INSERT INTO org.department (id, hospital_id, name) VALUES ({sq(did)}, {sq(h['id'])}, {sq(dname)});")
    dept_map[h["id"]] = depts
emit("")

# Beds — deferred until hospital admin users exist (FK on updated_by)
emit("-- Beds inserted after hospital admins are created")
emit("")

# ── Pharmacies ──

pharmacies: list[dict] = []
pharm_n = 0
for d_idx, district in enumerate(DISTRICTS):
    for i in range(20):
        pharm_n += 1
        lat = district["lat"] + random.uniform(-0.1, 0.1)
        lng = district["lng"] + random.uniform(-0.1, 0.1)
        pid = demo_uuid()
        is_govt = i < 5
        linked = hospitals[d_idx * 10 + i] if is_govt and (d_idx * 10 + i) < len(hospitals) else None
        pname = f"Hospital Pharmacy, {linked['name']}" if linked else f"{random.choice(LAST_NAMES)} Medical Store"
        pharmacies.append({
            "id": pid, "name": pname, "district": district["name"],
            "lat": lat, "lng": lng, "licence": demo_licence("DL", pharm_n),
            "ptype": "govt_hospital" if linked else "private",
            "linked_hospital_id": linked["id"] if linked else None,
        })

emit(f"-- {len(pharmacies)} pharmacies")
for p in pharmacies:
    linked = sq(p["linked_hospital_id"]) if p["linked_hospital_id"] else "NULL"
    emit(
        f"INSERT INTO org.pharmacy (id, licence_no, name, pharmacy_type, linked_hospital_id, district_id, "
        f"address, location, status, created_at) VALUES ("
        f"{sq(p['id'])}, {sq(p['licence'])}, {sq(p['name'])}, {sq(p['ptype'])}, {linked}, "
        f"(SELECT id FROM _demo_districts WHERE name = {sq(p['district'])}), "
        f"{sq('Demo Address, ' + p['district'] + ', Kerala')}, "
        f"{point_wkt(p['lat'], p['lng'])}, 'active', {sq(NOW)});"
    )
emit("")

# ── People + accounts ──

person_n = 0
user_n = 0

def make_person() -> dict:
    global person_n
    person_n += 1
    sex = random.choice(SEXES)
    return {
        "id": demo_uuid(), "full_name": random_name(sex), "dob": random_dob(),
        "sex": sex, "aadhaar_token": demo_aadhaar(person_n),
        "abha_number": demo_abha(person_n), "abha_address": f"demo{person_n}@abdm",
    }

def make_user(person_id: str, account_type: str, kc_sub: str | None = None) -> dict:
    global user_n
    user_n += 1
    return {"id": demo_uuid(), "person_id": person_id, "account_type": account_type,
            "keycloak_sub": kc_sub or f"demo-kc-{user_n:06d}"}

def emit_person(p: dict) -> None:
    emit(
        f"INSERT INTO identity.person (id, full_name, date_of_birth, sex, aadhaar_token, abha_number, "
        f"abha_address, kyc_status, face_check_status, identity_locked_at, created_at) VALUES ("
        f"{sq(p['id'])}, {sq(p['full_name'])}, {sq(p['dob'])}, {sq(p['sex'])}, {sq(p['aadhaar_token'])}, "
        f"{sq(p['abha_number'])}, {sq(p['abha_address'])}, 'passed', 'passed', {sq(NOW)}, {sq(NOW)});"
    )

def emit_user(u: dict) -> None:
    emit(
        f"INSERT INTO identity.app_user (id, person_id, account_type, keycloak_sub, status, activated_at, created_at) VALUES ("
        f"{sq(u['id'])}, {sq(u['person_id'])}, {sq(u['account_type'])}, {sq(u['keycloak_sub'])}, 'active', {sq(NOW)}, {sq(NOW)});"
    )

# ── Admins ──

emit("-- ===== Admin accounts =====")
p = make_person(); u = make_user(p["id"], "central_admin", "demo-central-admin-kc")
emit_person(p); emit_user(u)
emit(f"INSERT INTO admin.admin_post (id, user_id, level) VALUES ({sq(demo_uuid())}, {sq(u['id'])}, 'central');")
emit("")

p = make_person(); u = make_user(p["id"], "zonal_admin", "demo-zonal-admin-kc")
emit_person(p); emit_user(u)
emit(f"INSERT INTO admin.admin_post (id, user_id, level, zone_id) VALUES ({sq(demo_uuid())}, {sq(u['id'])}, 'zonal', 2);")
emit("")

p = make_person(); u = make_user(p["id"], "state_admin", "demo-state-admin-kc")
emit_person(p); emit_user(u)
emit(f"INSERT INTO admin.admin_post (id, user_id, level, state_id) VALUES ({sq(demo_uuid())}, {sq(u['id'])}, 'state', 33);")
emit("")

district_admin_users: dict[str, dict] = {}
for district in DISTRICTS:
    p = make_person(); u = make_user(p["id"], "district_admin", f"demo-da-{district['name'].lower()[:5]}-kc")
    emit_person(p); emit_user(u)
    emit(f"INSERT INTO admin.admin_post (id, user_id, level, district_id) VALUES ({sq(demo_uuid())}, {sq(u['id'])}, 'district', (SELECT id FROM _demo_districts WHERE name = {sq(district['name'])}));")
    district_admin_users[district["name"]] = u
emit("")

# ── Hospital admins ──

emit("-- ===== Hospital admins =====")
hospital_admin_users: dict[str, dict] = {}
for h in hospitals:
    p = make_person(); u = make_user(p["id"], "hospital_admin")
    emit_person(p); emit_user(u)
    emit(f"INSERT INTO identity.hospital_admin_profile (user_id, hospital_id) VALUES ({sq(u['id'])}, {sq(h['id'])});")
    hospital_admin_users[h["id"]] = u
emit("")

emit("-- Bed availability (now that hospital admins exist for the FK)")
for h in hospitals:
    ha = hospital_admin_users[h["id"]]
    btypes = ["general", "icu"] if h["htype"] in ("PHC", "PVT_CLINIC") else ["general", "icu", "oxygen", "paediatric"]
    for bt in btypes:
        total = random.randint(5, 50) if bt == "general" else random.randint(2, 15)
        free = random.randint(0, total)
        emit(f"INSERT INTO org.bed_availability (hospital_id, bed_type, total, free, updated_by) "
             f"VALUES ({sq(h['id'])}, {sq(bt)}, {total}, {free}, {sq(ha['id'])});")
emit("")

# ── Doctors (2 per hospital) ──

emit("-- ===== Doctors =====")
doc_n = 0
for h in hospitals:
    for di in range(2):
        doc_n += 1
        p = make_person(); u = make_user(p["id"], "doctor")
        emit_person(p); emit_user(u)
        dept = dept_map[h["id"]][di % len(dept_map[h["id"]])]
        emp = "govt" if h["ownership"] == "govt" else "private"
        emit(
            f"INSERT INTO identity.doctor_profile (user_id, hpr_id, council_name, council_reg_no, "
            f"specialisation, hospital_id, department_id, employment_type, signing_method) VALUES ("
            f"{sq(u['id'])}, {sq(demo_hpr(doc_n))}, 'Kerala Medical Council', {sq(demo_reg(doc_n))}, "
            f"{sq(random.choice(SPECIALISATIONS))}, {sq(h['id'])}, {sq(dept['id'])}, {sq(emp)}, 'mock');"
        )
emit("")

# ── Staff (3 per hospital) ──

emit("-- ===== Staff =====")
for h in hospitals:
    ha = hospital_admin_users[h["id"]]
    for role in STAFF_ROLES:
        p = make_person(); u = make_user(p["id"], "staff")
        emit_person(p); emit_user(u)
        dept = dept_map[h["id"]][0]
        emit(
            f"INSERT INTO identity.staff_profile (user_id, hospital_id, department_id, staff_role, created_by_user_id) VALUES ("
            f"{sq(u['id'])}, {sq(h['id'])}, {sq(dept['id'])}, {sq(role)}, {sq(ha['id'])});"
        )
emit("")

# ── Pharmacy admins ──

emit("-- ===== Pharmacy admins =====")
pharmacy_admin_users: dict[str, dict] = {}
for ph in pharmacies:
    p = make_person(); u = make_user(p["id"], "pharmacy_admin")
    emit_person(p); emit_user(u)
    emit(f"INSERT INTO identity.pharmacy_admin_profile (user_id, pharmacy_id) VALUES ({sq(u['id'])}, {sq(ph['id'])});")
    pharmacy_admin_users[ph["id"]] = u
emit("")

# ── Pharmacists ──

emit("-- ===== Pharmacists =====")
reg_n = 1000
for ph in pharmacies:
    pa = pharmacy_admin_users[ph["id"]]
    p = make_person(); u = make_user(p["id"], "pharmacist")
    emit_person(p); emit_user(u)
    reg_n += 1
    emit(
        f"INSERT INTO identity.pharmacist_profile (user_id, pharmacy_id, registration_no, created_by_user_id) VALUES ("
        f"{sq(u['id'])}, {sq(ph['id'])}, {sq(demo_reg(reg_n))}, {sq(pa['id'])});"
    )
emit("")

# ── Citizens ──

CITIZEN_COUNT = 2000
emit(f"-- ===== {CITIZEN_COUNT} citizens =====")
for i in range(CITIZEN_COUNT):
    p = make_person(); u = make_user(p["id"], "citizen")
    emit_person(p); emit_user(u)
    district = random.choice(DISTRICTS)
    lat = district["lat"] + random.uniform(-0.15, 0.15)
    lng = district["lng"] + random.uniform(-0.15, 0.15)
    emit(
        f"INSERT INTO identity.citizen_profile (person_id, preferred_language, district_id, approx_location, blood_group) VALUES ("
        f"{sq(p['id'])}, {sq(random.choice(['en', 'ml', 'hi']))}, "
        f"(SELECT id FROM _demo_districts WHERE name = {sq(district['name'])}), "
        f"{point_wkt(lat, lng)}, {sq(random.choice(BLOOD_GROUPS))});"
    )
emit("")

# ── Consent records ──

emit("-- ===== Privacy notice consent =====")
emit(
    "INSERT INTO identity.consent_record (person_id, purpose, notice_version, given_by_person_id) "
    "SELECT p.id, 'privacy_notice', '1.0-alpha', p.id "
    "FROM identity.person p JOIN identity.app_user u ON u.person_id = p.id AND u.status = 'active' "
    "WHERE p.aadhaar_token LIKE 'DEMO-%';"
)
emit("")

emit("DROP TABLE IF EXISTS _demo_districts;")
emit("COMMIT;")
emit(f"-- Generated: {person_n} persons, {user_n} users, {len(hospitals)} hospitals, {len(pharmacies)} pharmacies")

OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {OUT} ({len(lines)} lines, {person_n} persons, {user_n} users)")

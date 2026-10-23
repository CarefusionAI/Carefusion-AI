"""Generator of 60_gov_console.sql (python3 60_build_gov_console.py). Hand-run when the design data changes; the .sql is what the runner applies."""
import sys, re, json
from datetime import date, datetime, timedelta
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_admin_common import *

INV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "docs", "notes", "inventory_admin.md")
o = Out()
U = lambda s: uid(2, s)
P = lambda s: uid(1, s)
H1, PH1, PH2 = uid(10, 1), uid(12, 1), uid(12, 2)
DPTA = "util.seed_district('Pathanamthitta')"
AJAY, LATHA, VENK, BANER, SUJA = U(9), U(10), U(11), U(12), U(213)
G = lambda n: uid(604, n)          # new gov-console accounts
GP = lambda n: uid(603, n)         # new gov-console people

o.w("""-- =====================================================================
-- seed/design/60_gov_console.sql : District (Ajay Kumar), State (Latha Nair), Zonal (R. Venkatesh) and Central (S. Banerjee) consoles.
-- Kinds 0600-0699 (see IDS.md). Builds on 00_base.sql. Idempotent (ON CONFLICT DO NOTHING / NOT EXISTS), one transaction.
-- Synthetic, de-identified aggregates only. Demo "today" = Saturday 17 October 2026 (ISO week 42), clock times IST.
--
-- Id map (kind -> table; serial rule)
--   0601 surveillance.case_report   running serial (blocks of Pathanamthitta first, then the 13 other Kerala districts)
--   0602 surveillance.anomaly       1 district (leptospirosis), 2 state (dengue), 3 zonal (dengue), 4 central (fever)
--   0603 identity.person            gov-console applicants and second signers: 1-7 district inbox, 11-18 state, 21-24 zonal, 31-33 central,
--                                   41 / 42 / 43 second signers (State / Zonal / Central), 51 / 52 clinicians of two AI safety reports
--   0604 identity.app_user          same serial as the person (accounts are pending for applicants)
--   0605 admin.admin_post           41 / 42 / 43 second signers
--   0606 engage.health_alert        level * 100 + n (district 101-104, state 201-204, zonal 301-303, central 401-404)
--   0607 admin.platform_flag_history 1-3
--   0608 admin.report_export        1-11 (district 1-3, state 4-6, zonal 7-8, central 9-11)
--   0609 org.hospital (pending)     1 St. Gregorios Demo Hospital Ranni, 2 PHC Perunad, 3 Demo Specialty Hospital Kochi
--   0610 org.pharmacy (pending)     1 Demo Generic Medicines Kendra Adoor
--   0611 admin.approval_request     same serial as the applicant person (district 1-10, state 11-18, zonal 21-25, central 31-34)
--   0612 admin.account_flag         1 flagged citizen account, 2 Care Plus pharmacy admin, 3 flagged doctor
--   0613 surveillance.response_action  level * 10 + n (district 11-14, state 21-24, zonal 31-34, central 41-44)
--   0614 surveillance.field_request 1-4 (one per level)
--   0615 geo.population             running serial (12 blocks, 14 districts, 36 states)
--   0616 audit.flagged_event        1-5
--   0617 ai.model 1-4, 0618 ai.model_version 1-5, 0619 ai.release_request 1, 0620 ai.safety_report 1-4, 0621 ai.drift_metric running
--   0622 engage.complaint (grievances of District / State consoles), 0623 engage.complaint_event
-- Reconciliations (design headline vs rows; rows win):
--   * Disease series: totals per week are the design's chart series; per-unit cases are the series total split by the tile rates
--     (largest remainder; District leptospirosis in weeks 40-42 puts 86% of the cases in Ranni and Perunad so they stay above the small-cell limit). Per-lakh rates of single tiles are therefore NOT the design's random tile draws (ranking and hot units
--     are kept). Pathanamthitta is one truth (District console blocks); the State console splits the rest of Kerala.
--   * Anomaly narratives of District and State are rewritten from the seeded rows. Zonal and Central have no case tables outside
--     Kerala, so their narratives stay as designed (stored text).
--   * AI image model v2.1: drift 8.1% is above the 5% rollback rule, so it is stored as on_hold ("Drift alert"), not live.
--   * Complaint numbers: CMP-0398 / CMP-0377 are used twice in the design with different texts; here CMP-0405 .. CMP-0408.
--   * Not seeded (no table or no source): see the report of the session that wrote this file.
-- =====================================================================
BEGIN;
""")

# ------------------------------------------------------------------ people / posts / facilities
o.w("-- ---------- Second signers, applicants and clinicians (people, accounts, admin posts) ----------")
# serial, name, dob, sex, acct, status, slug
PEOPLE = [
    (1, "Dr. Tomy Kuriakose", "1969-05-04", "male", "hospital_admin", "pending", "tomy-kuriakose"),
    (2, "Bindu Rajan", "1983-09-17", "female", "pharmacy_admin", "pending", "bindu-rajan"),
    (3, "Dr. Shibu George", "1971-01-23", "male", "hospital_admin", "pending", "shibu-george"),
    (4, "Dr. Asha Philip", "1984-11-02", "female", "doctor", "pending", "asha-philip"),
    (5, "Dr. Vinod Menon", "1979-03-30", "male", "doctor", "pending", "vinod-menon"),
    (6, "Dr. Reshma Krishnan", "1986-07-12", "female", "doctor", "pending", "reshma-krishnan"),
    (7, "Citizen account DEMO-U-88231", "1990-01-01", "female", "citizen", "active", "demo-u-88231"),
    (11, "Dr. Rekha Sukumaran", "1972-02-14", "female", "district_admin", "pending", "rekha-sukumaran"),
    (12, "Manoj Pillai", "1975-08-09", "male", "district_admin", "pending", "manoj-pillai"),
    (13, "Dr. Haris Vasu", "1970-12-01", "male", "district_admin", "pending", "haris-vasu"),
    (14, "Dr. Arvind Pillai", "1977-04-21", "male", "doctor", "pending", "arvind-pillai"),
    (15, "Dr. Neha Thomas", "1989-10-05", "female", "doctor", "pending", "neha-thomas"),
    (16, "Dr. Joby Alex", "1976-06-18", "male", "doctor", "active", "joby-alex"),
    (21, "K. Saravanan", "1968-03-12", "male", "state_admin", "pending", "k-saravanan"),
    (22, "Dr. Ayesha Fathima", "1974-09-26", "female", "state_admin", "pending", "ayesha-fathima"),
    (23, "Dr. Anbu Selvan", "1973-01-19", "male", "district_admin", "pending", "anbu-selvan"),
    (24, "Dr. Meena Rajan", "1976-05-07", "female", "district_admin", "pending", "meena-rajan"),
    (31, "Dr. P. Singh", "1967-07-15", "male", "zonal_admin", "pending", "p-singh"),
    (32, "A. Das", "1969-02-03", "male", "zonal_admin", "pending", "a-das"),
    (33, "Dr. M. Iyer", "1966-11-28", "female", "zonal_admin", "pending", "m-iyer"),
    (41, "Dr. Rema Pillai", "1970-08-22", "female", "state_admin", "active", "rema-pillai"),
    (42, "Dr. Sudha Raman", "1968-04-10", "female", "zonal_admin", "active", "sudha-raman"),
    (43, "Dr. Vikram Chandra", "1965-12-30", "male", "central_admin", "active", "vikram-chandra"),
    (51, "Dr. Anup Bora", "1980-02-27", "male", "doctor", "active", "anup-bora"),
    (52, "Dr. Pooja Malhotra", "1983-10-16", "female", "doctor", "active", "pooja-malhotra"),
]
prow, urow = [], []
for s, name, dob, sex, acct, status, slug in PEOPLE:
    prow.append(f"('{GP(s)}', {q(name)}, '{dob}', '{sex}', {q(tok(slug))}, 'DEMO-0000-{8600 + s}', {q(slug + '@demo')}, 'passed', 'passed', '2026-10-01 09:00:00+05:30', 'citizen_app')")
    act = "'2026-10-01 09:00:00+05:30'" if status == "active" else "NULL"
    urow.append(f"('{G(s)}', '{GP(s)}', '{acct}', 'demo-kc-{acct.replace('_', '-')}-{slug}', '{status}', {act}, '2026-10-01 09:00:00+05:30')")
o.insert("identity.person", "id, full_name, date_of_birth, sex, aadhaar_token, abha_number, abha_address, kyc_status, face_check_status, created_at, registration_channel", prow)
o.insert("identity.app_user", "id, person_id, account_type, keycloak_sub, status, activated_at, created_at", urow)
o.insert("admin.admin_post", "id, user_id, level, zone_id, state_id, district_id, jan_parichay_ref, valid",
         [f"('{uid(605, 41)}', '{G(41)}', 'state', NULL, 33, NULL, 'demo-jp-rema-pillai', tstzrange('2026-01-02 00:00:00+00'::timestamptz, NULL))",
          f"('{uid(605, 42)}', '{G(42)}', 'zonal', 2, NULL, NULL, 'demo-jp-sudha-raman', tstzrange('2026-01-02 00:00:00+00'::timestamptz, NULL))",
          f"('{uid(605, 43)}', '{G(43)}', 'central', NULL, NULL, NULL, 'demo-jp-vikram-chandra', tstzrange('2026-01-02 00:00:00+00'::timestamptz, NULL))"],
         label="admin.admin_post (second signers)")

o.w("-- ---------- Facilities waiting for approval (pending hospitals and a pharmacy of the approval queues) ----------")
HOSP = [  # n, name, hfr, type, ownership, district, lat, lng
    (1, "St. Gregorios Demo Hospital, Ranni", "DEMO-HFR-KL-0231", "PVT_HOSP", "private", "Pathanamthitta", 9.3870, 76.7800),
    (2, "PHC Perunad", "DEMO-HFR-KL-0233", "PHC", "govt", "Pathanamthitta", 9.3700, 76.8800),
    (3, "Demo Specialty Hospital, Kochi", "DEMO-HFR-KL-0232", "PVT_HOSP", "private", "Ernakulam", 9.9816, 76.2999),
]
hr = []
for n, name, hfr, ht, own, dist, lat, lng in HOSP:
    pt = f"ST_SetSRID(ST_MakePoint({lng:.6f}, {lat:.6f}), 4326)"
    hr.append(f"('{uid(609, n)}', {q(hfr)}, {q(name)}, '{own}', '{ht}', util.seed_district({q(dist)}), {q('Demo address, ' + dist + ', Kerala')}, {pt}, "
              f"ST_Envelope(ST_Buffer({pt}, 0.006)), {q('DEMO-HCE-KL-' + hfr[-4:])}, '{{}}'::jsonb, 'pending', '2026-10-01 09:00:00+05:30')")
o.insert("org.hospital", "id, hfr_id, name, ownership, hospital_type, district_id, address, location, geofence, licence_no, timings, status, created_at", hr)
pt = "ST_SetSRID(ST_MakePoint(76.735000, 9.152800), 4326)"
o.insert("org.pharmacy", "id, licence_no, name, pharmacy_type, district_id, address, location, opening_hours, status, created_at",
         [f"('{uid(610, 1)}', 'DEMO-DL-KL-3307', 'Demo Generic Medicines Kendra, Adoor', 'private', {DPTA}, 'Demo address, Pathanamthitta, Kerala', {pt}, "
          f"'{{\"mon-sun\": [[\"08:00\", \"20:00\"]]}}'::jsonb, 'pending', '2026-10-01 09:00:00+05:30')"])
o.insert("identity.hospital_admin_profile", "user_id, hospital_id", [f"('{G(1)}', '{uid(609, 1)}')", f"('{G(3)}', '{uid(609, 2)}')"])
o.insert("identity.pharmacy_admin_profile", "user_id, pharmacy_id", [f"('{G(2)}', '{uid(610, 1)}')"])

# ------------------------------------------------------------------ populations
o.w("-- ---------- Population denominators (geo.population, 2026 projection). Uniform split of each console's population over its map units. ----------")
state_ids = {  # geo.state ids from migration 110
    "Haryana": 1, "Himachal Pradesh": 2, "Punjab": 3, "Rajasthan": 4, "Delhi": 5, "Chandigarh": 6, "Jammu and Kashmir": 7, "Ladakh": 8,
    "Uttar Pradesh": 9, "Uttarakhand": 10, "Madhya Pradesh": 11, "Chhattisgarh": 12, "Bihar": 13, "Jharkhand": 14, "Odisha": 15,
    "West Bengal": 16, "Assam": 17, "Arunachal Pradesh": 18, "Manipur": 19, "Meghalaya": 20, "Mizoram": 21, "Nagaland": 22, "Tripura": 23,
    "Sikkim": 24, "Andaman and Nicobar Islands": 25, "Gujarat": 26, "Maharashtra": 27, "Goa": 28, "Dadra and Nagar Haveli and Daman and Diu": 29,
    "Andhra Pradesh": 30, "Telangana": 31, "Karnataka": 32, "Kerala": 33, "Tamil Nadu": 34, "Puducherry": 35, "Lakshadweep": 36}
DISTRICTS = ["Thiruvananthapuram", "Kollam", "Pathanamthitta", "Alappuzha", "Kottayam", "Idukki", "Ernakulam", "Thrissur", "Palakkad",
             "Malappuram", "Kozhikode", "Wayanad", "Kannur", "Kasaragod"]
pr, n = [], 0
for b in range(1, 13):
    n += 1
    pr.append(f"('{uid(615, n)}', 'block', '{uid(15, b)}', NULL, NULL, 2026, 99750)")
others = [d for d in DISTRICTS if d != "Pathanamthitta"]
for d in DISTRICTS:
    n += 1
    pop = 1197000 if d == "Pathanamthitta" else 2569461 + (7 if d == "Thiruvananthapuram" else 0)
    pr.append(f"('{uid(615, n)}', 'district', NULL, util.seed_district({q(d)}), NULL, 2026, {pop})")
south = {30, 31, 32, 34, 35, 36}
for name, sid in state_ids.items():
    n += 1
    if sid == 33:
        pop = 34600000
    elif sid in south:
        pop = 36900000
    else:
        pop = 40137931 + (1 if sid == 9 else 0)
    pr.append(f"('{uid(615, n)}', 'state', NULL, NULL, {sid}, 2026, {pop})")
o.insert("geo.population", "id, unit_type, block_id, district_id, state_id, as_of_year, population", pr)

# ------------------------------------------------------------------ surveillance
o.w("-- ---------- Disease surveillance: weekly case reports (ISO weeks 31-42 of 2026), 5-year baselines, anomalies, response actions ----------")
BLOCKS = ["PLK", "TVL", "MLY", "VNK", "KZC", "ELT", "RNI", "PRN", "PDM", "PTA", "KNI", "ADR"]
TILE_D = {  # dengue, fever, lepto per lakh (G.District.1)
    "PLK": (9.6, 7.8, 12.3), "TVL": (8.9, 11.7, 2.9), "MLY": (7.3, 8.9, 1.5), "VNK": (11.2, 12.2, 9.2), "KZC": (8.8, 5.8, 5.3),
    "ELT": (2.8, 9.3, 11.2), "RNI": (4.2, 11.7, 24.5), "PRN": (13.6, 2.4, 12.3), "PDM": (4.5, 13.6, 11.4), "PTA": (2.5, 3.4, 9.2),
    "KNI": (7.1, 7.5, 13.0), "ADR": (1.6, 1.3, 7.5)}
SER_D = {
    "dengue": ([47, 55, 46, 50, 53, 54, 40, 39, 38, 26, 25, 20], [44, 46, 48, 48, 48, 46, 44, 41, 37, 33, 30, 28]),
    "fever": ([615, 754, 671, 786, 875, 954, 1016, 777, 765, 738, 529, 575], [656, 719, 776, 821, 851, 861, 852, 823, 779, 722, 659, 596]),
    "lepto": ([6, 8, 9, 10, 9, 9, 10, 10, 8, 11, 14, 14], [7, 8, 9, 9, 9, 9, 9, 9, 9, 8, 7, 7])}
SDIST = ["KGD", "KNR", "WYD", "KZD", "MLP", "TSR", "PKD", "EKM", "IDK", "ALP", "KTM", "KLM", "PTA", "TVM"]
SNAME = {"KGD": "Kasaragod", "KNR": "Kannur", "WYD": "Wayanad", "KZD": "Kozhikode", "MLP": "Malappuram", "TSR": "Thrissur", "PKD": "Palakkad",
         "EKM": "Ernakulam", "IDK": "Idukki", "ALP": "Alappuzha", "KTM": "Kottayam", "KLM": "Kollam", "PTA": "Pathanamthitta", "TVM": "Thiruvananthapuram"}
TILE_S = {  # G.State.1: dengue, fever, lepto
    "KGD": (10.7, 7.1, 7.2), "KNR": (7, 8.9, 11.4), "WYD": (2.6, 7, 13.1), "KZD": (9.2, 11.5, 7.4), "MLP": (2.1, 13.1, 9.8), "TSR": (10.4, 5.8, 7.8),
    "PKD": (6.6, 10.1, 7.3), "EKM": (12.6, 3.2, 10.5), "IDK": (11.9, 9, 12.2), "ALP": (6.5, 6.8, 9.6), "KTM": (9.7, 13, 5.2), "KLM": (16, 10.9, 3.4),
    "PTA": (2.5, 3.4, 9.2), "TVM": (25.2, 10.7, 11.8)}
SER_S = {
    "dengue": ([1147, 1153, 1118, 1433, 1284, 1140, 975, 1110, 934, 1156, 1373, 1590], [1117, 1182, 1224, 1239, 1225, 1185, 1121, 1039, 949, 858, 775, 709]),
    "fever": ([20884, 29957, 31237, 31482, 30612, 38911, 35943, 32044, 25867, 29385, 22402, 20639], [24800, 27183, 29335, 31047, 32155, 32550, 32194, 31122, 29438, 27305, 24929, 22540]),
    "lepto": ([149, 158, 219, 221, 212, 199, 245, 218, 185, 208, 182, 125], [168, 184, 199, 210, 218, 220, 218, 211, 199, 185, 169, 153])}
DIS = ["dengue", "fever", "lepto"]
SRC = {"dengue": "lab", "fever": "syndromic", "lepto": "lab"}
WK0 = date(2026, 7, 27)   # Monday of ISO week 31
weeks = [WK0 + timedelta(days=7 * i) for i in range(12)]
assert weeks[11] == date(2026, 10, 12) and weeks[11].isocalendar()[1] == 42
def rep_at(w):
    if w == 11:
        return "2026-10-17 12:00"
    return (weeks[w] + timedelta(days=6)).strftime("%Y-%m-%d") + " 18:00"

cr, bl = [], []
serial = 0
pta_week = {}      # (disease, week) -> district total
block_wk42 = {}    # (disease, code) -> cases week 42
for di, dis in enumerate(DIS):
    rep, base = SER_D[dis]
    weights = [TILE_D[c][di] for c in BLOCKS]
    for w in range(12):
        if dis == "lepto" and w >= 9:
            # outbreak weeks: 86% of the district total sits in the two flagged blocks (split by sqrt of their tile rates),
            # the rest over the other blocks by tile rate, so the hot blocks stay above the small-cell limit of 5
            hot = [BLOCKS.index("RNI"), BLOCKS.index("PRN")]
            hot_total = round(0.86 * rep[w])
            ah = lr_alloc(hot_total, [weights[i] ** 0.5 for i in hot])
            rest = [i for i in range(12) if i not in hot]
            ar_ = lr_alloc(rep[w] - hot_total, [weights[i] for i in rest])
            al = [0] * 12
            for i, v in zip(hot, ah):
                al[i] = v
            for i, v in zip(rest, ar_):
                al[i] = v
        else:
            al = lr_alloc(rep[w], weights)
        pta_week[(dis, w)] = rep[w]
        for code, cases in zip(BLOCKS, al):
            serial += 1
            if w == 11:
                block_wk42[(dis, code)] = cases
            cr.append(f"('{uid(601, serial)}', '{dis}', {DPTA}, '{uid(15, BLOCKS.index(code) + 1)}', '{weeks[w]}', {cases}, '{SRC[dis]}', {ist(rep_at(w))})")
    for w in range(12):
        bl.append(f"('{dis}', {DPTA}, {weeks[w].isocalendar()[1]}, {base[w]}, {round(0.15 * base[w], 2)})")
# State console: the other 13 districts split what is left of the state series
state_wk42 = {}
state_base42 = {}
oth = [c for c in SDIST if c != "PTA"]
for di, dis in enumerate(DIS):
    rep, base = SER_S[dis]
    wts = [TILE_S[c][di] * (2569468 if c == "TVM" else 2569461) for c in oth]
    for w in range(12):
        left = rep[w] - pta_week[(dis, w)]
        assert left > 0
        al = lr_alloc(left, wts)
        bleft = base[w] - SER_D[dis][1][w]
        tw = sum(wts)
        for code, cases, wt in zip(oth, al, wts):
            serial += 1
            if w == 11:
                state_wk42[(dis, code)] = cases
            b = round(bleft * wt / tw, 2)
            if w == 11:
                state_base42[(dis, code)] = b
            cr.append(f"('{uid(601, serial)}', '{dis}', util.seed_district({q(SNAME[code])}), NULL, '{weeks[w]}', {cases}, '{SRC[dis]}', {ist(rep_at(w))})")
            bl.append(f"('{dis}', util.seed_district({q(SNAME[code])}), {weeks[w].isocalendar()[1]}, {b}, {round(0.15 * b, 2)})")
o.insert("surveillance.case_report", "id, disease_code, district_id, block_id, week_start, cases, source, reported_at",
         [r.replace(", NULL, '2026", ", NULL, '2026") for r in cr])
o.insert("surveillance.baseline", "disease_code, district_id, iso_week, baseline_cases, sd", bl)

# anomalies (District and State narratives are recomputed from the rows)
d_hot = block_wk42[("lepto", "RNI")] + block_wk42[("lepto", "PRN")]
d_tot, d_base = SER_D["lepto"][0][11], SER_D["lepto"][1][11]
s_hot = state_wk42[("dengue", "TVM")] + state_wk42[("dengue", "KLM")]
s_base = round(state_base42[("dengue", "TVM")] + state_base42[("dengue", "KLM")])
ANOM = [
    (1, "lepto", "district", None, None, DPTA, ["RNI", "PRN"], 0.78, "Leptospirosis rising in Ranni and Perunad",
     f"{d_tot} cases this week across the district, {d_tot / d_base:.1f}x the 5-year baseline of {d_base:.0f} for week 42; {d_hot} of them in Ranni and Perunad. The rise began 6 days after the 8 Oct flooding along the Pamba.",
     [f"{d_tot} cases vs baseline {d_base} (week 42)", "Onset clustered 6-11 days after flooding", "61% of cases are farm or cleanup workers"]),
    (2, "dengue", "state", None, 33, None, ["TVM", "KLM"], 0.81, "Dengue clusters on the southern coast",
     f"Thiruvananthapuram and Kollam reported {s_hot} cases this week, {s_hot / s_base:.1f}x their baseline of {s_base}. 7 clusters sit along the coastal belt, where breeding sites rose after early rain.",
     [f"{s_hot} cases vs baseline {s_base} (TVM + KLM)", "7 clusters within 2 km of the coast", "NS1 positivity up from 9% to 17%"]),
    (3, "dengue", "zonal", 2, None, None, ["KA", "KL"], 0.74, "Dengue up in Karnataka and Kerala",
     "Karnataka (mainly Bengaluru Urban) and Kerala together reported 5,940 cases this week, 1.7x baseline. Tamil Nadu and Andhra Pradesh are within the normal range.",
     ["5,940 cases vs baseline 3,480", "Bengaluru Urban: 41% of Karnataka cases", "Serotype DENV-2 in 68% of typed samples"]),
    (4, "fever", "central", None, None, None, ["BR", "UP", "JH"], 0.69, "Acute fever up in Bihar, eastern UP and Jharkhand",
     "Acute febrile illness in these three states is 1.7x the 5-year baseline for week 42. Children under 15 make up 46% of cases; scrub typhus and Japanese encephalitis tests are pending in 3 districts.",
     ["3.1 lakh cases vs baseline 1.8 lakh", "46% of cases under 15 years", "Rise follows 3 weeks of flooding in north Bihar"]),
]
o.insert("surveillance.anomaly",
         "id, disease_code, level, zone_id, state_id, district_id, week_start, hot_units, confidence, title, body, evidence, is_simulated, needs_epidemiologist_review, status, created_at",
         [f"('{uid(602, n)}', '{dis}', '{lvl}', {zn if zn else 'NULL'}, {st if st else 'NULL'}, {dsc if dsc else 'NULL'}, '2026-10-12', {arr(hot)}, {conf}, {q(title)}, {q(body)}, {jb(ev)}, true, true, 'open', '2026-10-17 06:00:00+05:30')"
          for n, dis, lvl, zn, st, dsc, hot, conf, title, body, ev in ANOM])

ACT = {  # level -> (admin user, zone, state, district, disease, rows)
    "district": (AJAY, "NULL", "NULL", DPTA, "lepto", [
        ("Doxycycline prophylaxis at 9 PHCs", "Started 12 Oct · 3,410 doses given", "in_progress", "info"),
        ("Fever clinics extended to 20:00", "Ranni THQ, PHC Perunad", "in_progress", "success"),
        ("Water quality testing", "28 wells tested, 6 unsafe", "planned", "warning"),
        ("Report to State surveillance unit", "Sent 16 Oct, 18:00", "done", "neutral")]),
    "state": (LATHA, "NULL", "33", "NULL", "dengue", [
        ("Fogging & source reduction", "TVM: 41 wards · KLM: 18 wards", "in_progress", "info"),
        ("NS1 kits moved to coastal PHCs", "6,000 kits sent 15 Oct", "done", "success"),
        ("Platelet stock check", "Kollam DH under 3 days", "planned", "warning"),
        ("Report to Zonal and IDSP", "Sent 16 Oct, 19:30", "done", "neutral")]),
    "zonal": (VENK, "2", "NULL", "NULL", "dengue", [
        ("Vector control support to Bengaluru", "40 entomologists deployed", "in_progress", "info"),
        ("Test kits moved from TN reserve", "45,000 NS1 kits", "done", "success"),
        ("Puducherry admin backlog", "2 requests over limit", "planned", "warning"),
        ("Zonal report to MoHFW", "Sent 16 Oct, 20:00", "done", "neutral")]),
    "central": (BANER, "NULL", "NULL", "NULL", "fever", [
        ("Central team to north Bihar", "NCDC epidemiologists, 4 districts", "in_progress", "info"),
        ("JE vaccine top-up", "12 lakh doses released", "done", "success"),
        ("Scrub typhus test kits", "Stock under 2 weeks in Jharkhand", "planned", "warning"),
        ("WHO IHR weekly update", "Sent 16 Oct, 21:00", "done", "neutral")]),
}
ar = []
for li, (lvl, (adm, zn, st, dsc, dis, rows)) in enumerate(ACT.items(), 1):
    for i, (t, m, s, tone) in enumerate(rows, 1):
        ar.append(f"('{uid(613, li * 10 + i)}', '{dis}', '{lvl}', {zn}, {st}, {dsc}, {q(t)}, {q(m)}, '{s}', '{tone}', '{adm}', '2026-10-1{2 + i % 4} 10:00:00+05:30')")
o.insert("surveillance.response_action", "id, disease_code, level, zone_id, state_id, district_id, title, meta, status, tone, created_by_user_id, created_at", ar)
FT = {"district": "District Rapid Response Team, Kozhencherry", "state": "State Rapid Response Team, Thiruvananthapuram",
      "zonal": "Zonal entomology team, Bengaluru", "central": "NCDC central surveillance unit"}
o.w("-- Assumption: the design shows the 'Request field investigation' button but no seeded request; one open request per level is added.")
o.insert("surveillance.field_request", "id, anomaly_id, requested_by_user_id, team_name, status, created_at",
         [f"('{uid(614, li)}', '{uid(602, li)}', '{ACT[lvl][0]}', {q(FT[lvl])}, 'requested', '2026-10-17 14:10:00+05:30')" for li, lvl in enumerate(ACT, 1)])

# ------------------------------------------------------------------ approvals
o.w("-- ---------- Approvals inbox of the four consoles (admin.approval_request; checks in check_results; failed checks start with '!') ----------")
def checks(lst):
    return [{"text": c.lstrip("!"), "ok": not c.startswith("!")} for c in lst]
def due(s):
    return ist(s)
AP = []   # dicts
def ap(n, stype, subj_user, subj_person, level, scope, submitted, dueat, prio="normal", status="pending", step=1, hosp=None, pharm=None,
       decided_by=None, decided_at=None, second=None, role=None, org=None, ref=None, chk=None, flag=False, summary=None, escalated_at=None):
    AP.append(dict(n=n, stype=stype, user=subj_user, person=subj_person, level=level, scope=scope, submitted=submitted, due=dueat, prio=prio,
                   status=status, step=step, hosp=hosp, pharm=pharm, by=decided_by, at=decided_at, second=second,
                   cr={"role": role, "org": org, "ref": ref, "checks": checks(chk or []), "flag": flag, "summary": summary}, esc=escalated_at))
dist_scope = ("district", DPTA)
ap(1, "hospital_admin", G(1), GP(1), "district", dist_scope, "2026-10-15 10:00", "2026-10-18 17:00", "urgent", hosp=uid(609, 1),
   role="Hospital admin", org="St. Gregorios Demo Hospital, Ranni (private)", ref="HFR DEMO-HFR-KL-0231", chk=["HFR verified", "Aadhaar e-KYC", "Licence valid to 2028"])
ap(2, "pharmacy_admin", G(2), GP(2), "district", dist_scope, "2026-10-14 10:00", "2026-10-21 17:00", pharm=uid(610, 1),
   role="Pharmacy admin", org="Demo Generic Medicines Kendra, Adoor", ref="Drug licence DEMO-DL-KL-3307", chk=["Drug licence verified", "Aadhaar e-KYC", "Pharmacist reg. DSPC"])
ap(3, "hospital_admin", G(3), GP(3), "district", dist_scope, "2026-10-12 10:00", "2026-10-19 17:00", hosp=uid(609, 2),
   role="Hospital admin", org="PHC Perunad (Government)", ref="G.O. DEMO-GO-118/2026", chk=["HFR verified", "Government order", "Aadhaar e-KYC"])
ap(4, "pharmacy_admin", U(306), P(306), "district", dist_scope, "2026-10-11 10:00", "2026-10-18 17:00", pharm=PH2, flag=True,
   role="Pharmacy admin", org="Care Plus Demo Pharmacy, Thiruvalla", ref="Drug licence DEMO-DL-KL-2988",
   chk=["Aadhaar e-KYC", "!Licence expires in 20 days", "!1 open audit flag"])
ap(5, "pharmacy_admin", U(7), P(7), "district", dist_scope, "2026-10-08 10:00", "2026-10-15 17:00", status="approved", pharm=PH1,
   decided_by=AJAY, decided_at="2026-10-12 11:00", second=SUJA, role="Pharmacy admin", org="Demo Hospital Pharmacy, Pathanamthitta",
   ref="Drug licence DEMO-DL-KL-2041", chk=["Drug licence verified", "Aadhaar e-KYC"])
ap(6, "doctor", G(4), GP(4), "district", dist_scope, "2026-10-13 10:00", "2026-10-20 17:00", role="Doctor", org="PHC Elanthoor", summary="General medicine · PHC Elanthoor · HPR verified", chk=["HPR verified"])
ap(7, "doctor", G(5), GP(5), "district", dist_scope, "2026-10-14 10:00", "2026-10-17 18:00", "urgent", role="Doctor", org="Demo Taluk Hospital, Thiruvalla", summary="Paediatrics · Demo Taluk Hospital, Thiruvalla")
ap(8, "doctor", G(6), GP(6), "district", dist_scope, "2026-10-15 10:00", "2026-10-22 17:00", role="Doctor", org="Private clinic, Adoor", summary="Gynaecology · Private clinic, Adoor · licence check")
ap(9, "flagged_citizen", G(7), GP(7), "district", dist_scope, "2026-10-17 09:30", "2026-10-17 18:00", "urgent", role="Flagged citizen", org="Citizen account",
   summary="4 failed face checks in 1 hour")
ap(10, "pharmacy", None, None, "district", dist_scope, "2026-10-16 22:50", "2026-10-19 17:00", pharm=PH2, role="Flagged pharmacy", org="Care Plus Demo Pharmacy", summary="Pharmacy · 14 dispenses in 10 min")
st_scope = ("state", 33)
ap(11, "district_admin", G(11), GP(11), "state", st_scope, "2026-10-15 10:00", "2026-10-17 18:00", "urgent", role="District admin", org="Wayanad",
   ref="G.O.(Rt) DEMO-2231/2026/H&FWD", chk=["Nomination letter", "Aadhaar e-KYC", "Security key"])
ap(12, "district_admin", G(12), GP(12), "state", st_scope, "2026-10-13 10:00", "2026-10-19 17:00", "urgent", role="District admin", org="Kasaragod",
   ref="G.O.(Rt) DEMO-2240/2026/H&FWD", chk=["Nomination letter", "Aadhaar e-KYC", "!Security key not registered"])
ap(13, "hospital", None, None, "state", st_scope, "2026-10-11 10:00", "2026-10-21 17:00", step=2, hosp=uid(609, 3), flag=True,
   role="Escalation · hospital admin", org="Raised by Ernakulam DMO", ref="HFR DEMO-HFR-KL-0232", chk=["!Licence name mismatch", "HFR verified"], summary="Hospital · licence name mismatch")
ap(14, "district_admin", G(13), GP(13), "state", st_scope, "2026-10-16 10:00", "2026-10-22 17:00", role="District admin (acting)", org="Malappuram",
   ref="G.O.(Rt) DEMO-2252/2026/H&FWD", chk=["Nomination letter", "Aadhaar e-KYC", "Security key"])
ap(15, "district_admin", AJAY, P(9), "state", st_scope, "2026-08-28 10:00", "2026-09-04 17:00", status="approved", decided_by=LATHA, decided_at="2026-09-01 11:00",
   second=G(41), role="District admin", org="Pathanamthitta", ref="G.O.(Rt) DEMO-2107/2026/H&FWD", chk=["Nomination letter", "Security key"])
ap(16, "doctor", G(14), GP(14), "state", st_scope, "2026-10-14 10:00", "2026-10-18 17:00", "urgent", step=2, role="Doctor", org="Demo Medical College, Kozhikode",
   summary="Cardiology · Demo Medical College, Kozhikode · foreign degree")
ap(17, "doctor", G(15), GP(15), "state", st_scope, "2026-10-12 10:00", "2026-10-23 17:00", step=2, role="Doctor", org="Escalated by Ernakulam DMO",
   summary="Escalated by Ernakulam DMO · name mismatch")
ap(18, "flagged_doctor", G(16), GP(16), "state", st_scope, "2026-10-16 18:00", "2026-10-18 17:00", "urgent", role="Flagged doctor", org="Thrissur",
   summary="Doctor DEMO-HPR-71-0451 · opened 38 records in one shift")
zn_scope = ("zone", 2)
ap(21, "state_admin", G(21), GP(21), "zonal", zn_scope, "2026-10-14 10:00", "2026-10-19 17:00", "urgent", role="State admin", org="Tamil Nadu",
   ref="G.O. DEMO-TN-HFW-412", chk=["Nomination letter", "Aadhaar e-KYC", "Security key"])
ap(22, "state_admin", G(22), GP(22), "zonal", zn_scope, "2026-10-12 10:00", "2026-10-23 17:00", role="UT admin", org="Lakshadweep",
   ref="Order DEMO-LD-H-77", chk=["Nomination letter", "Aadhaar e-KYC", "!Security key not registered"])
for k, (n_, g) in enumerate(((23, 23), (24, 24)), 1):
    ap(n_, "district_admin", G(g), GP(g), "zonal", zn_scope, "2026-09-26 10:00", "2026-10-10 17:00", status="escalated", step=2, flag=True,
       role="Escalation · 2 requests", org="Puducherry · waiting 21 days at UT level", ref="DEMO-ESC-PY-009", chk=["!Over 14-day limit", "Documents complete"],
       escalated_at="2026-10-11 09:00")
ap(25, "state_admin", LATHA, P(10), "zonal", zn_scope, "2026-06-28 10:00", "2026-07-05 17:00", status="approved", decided_by=VENK, decided_at="2026-07-02 11:00",
   second=G(42), role="State admin", org="Kerala", ref="G.O. DEMO-KL-HFW-1180", chk=["Nomination letter", "Security key"])
ap(31, "zonal_admin", G(31), GP(31), "central", None, "2026-10-15 10:00", "2026-10-19 17:00", "urgent", role="Zonal admin", org="North zone",
   ref="MoHFW order DEMO-Z/2026/31", chk=["Nomination letter", "Aadhaar e-KYC", "Security key"])
ap(32, "zonal_admin", G(32), GP(32), "central", None, "2026-10-13 10:00", "2026-10-18 17:00", "urgent", role="Zonal admin", org="North-east zone",
   ref="MoHFW order DEMO-Z/2026/34", chk=["Nomination letter", "Aadhaar e-KYC", "!Security key not registered"])
ap(33, "zonal_admin", G(33), GP(33), "central", None, "2026-10-16 10:00", "2026-10-23 17:00", role="Zonal admin", org="West zone",
   ref="MoHFW order DEMO-Z/2026/36", chk=["Nomination letter", "Aadhaar e-KYC", "Security key"])
ap(34, "zonal_admin", VENK, P(11), "central", None, "2026-05-28 10:00", "2026-06-04 17:00", status="approved", decided_by=BANER, decided_at="2026-06-01 11:00",
   second=G(43), role="Zonal admin", org="South zone", ref="MoHFW order DEMO-Z/2026/12", chk=["Nomination letter", "Security key"])
rows = []
for a in AP:
    sc = a["scope"]
    az = sc[1] if sc and sc[0] == "zone" else None
    ast = sc[1] if sc and sc[0] == "state" else None
    adi = sc[1] if sc and sc[0] == "district" else None
    rows.append(f"('{uid(611, a['n'])}', '{a['stype']}', {q(a['user'])}, {q(a['person'])}, {q(a['hosp'])}, {q(a['pharm'])}, {a['step']}, '{a['level']}', "
                f"{az if az else 'NULL'}, {ast if ast else 'NULL'}, {adi if adi else 'NULL'}, '{a['status']}', {ist(a['submitted'])}, {ist(a['due'])}, "
                f"{ist(a['esc']) if a['esc'] else 'NULL'}, {q(a['by'])}, {q(a['second'])}, {ist(a['at']) if a['at'] else 'NULL'}, "
                f"{q('Approved') if a['status'] == 'approved' else 'NULL'}, {jb(a['cr'])}, '{a['prio']}')")
o.insert("admin.approval_request",
         "id, subject_type, subject_user_id, subject_person_id, subject_hospital_id, subject_pharmacy_id, step, assigned_level, assigned_zone_id, assigned_state_id, assigned_district_id, status, submitted_at, due_at, escalated_at, decided_by_user_id, second_approver_user_id, decided_at, reason, check_results, priority",
         rows)
o.insert("admin.account_flag", "id, subject_person_id, subject_user_id, reason, details, raised_by_user_id, raised_at, approval_request_id, status",
         [f"('{uid(612, 1)}', '{GP(7)}', '{G(7)}', 'face_mismatch', {jb({'failed_face_checks': 4, 'window': '1 hour'})}, NULL, '2026-10-17 09:30:00+05:30', '{uid(611, 9)}', 'open')",
          f"('{uid(612, 2)}', '{P(306)}', '{U(306)}', 'suspicious_data', {jb({'audit_ref': 'DEMO-AUD-88C1', 'text': '14 prescriptions dispensed in 10 minutes'})}, NULL, '2026-10-16 22:50:00+05:30', '{uid(611, 4)}', 'open')",
          f"('{uid(612, 3)}', '{GP(16)}', '{G(16)}', 'suspicious_data', {jb({'hpr_id': 'DEMO-HPR-71-0451', 'records_opened': 38, 'window': 'one shift'})}, NULL, '2026-10-16 18:00:00+05:30', '{uid(611, 18)}', 'open')"])

# ------------------------------------------------------------------ health alerts
o.w("-- ---------- Health alerts: sent and scheduled lists of the four consoles (emergency alerts carry the second signer) ----------")
def reach(s):
    s = s.strip()
    m = re.match(r"([\d.]+) (cr|lakh)$", s)
    if m:
        return int(round(float(m.group(1)) * (10_000_000 if m.group(2) == "cr" else 100_000)))
    return int(s.replace(",", ""))
SND = {"district": "District Medical Office, Pathanamthitta", "state": "Demo Directorate of Health Services, Kerala",
       "zonal": "MoHFW Regional Office, South zone", "central": "Ministry of Health & Family Welfare"}
AL = {
    "district": (101, AJAY, SUJA, ("district", None), [
        ("Heatwave — stay indoors 12:00–16:00", "emergency", "Whole district", "2026-10-17 09:00", "8,12,400", "Sent", "heat"),
        ("Dengue — dry day every Sunday", "advisory", "Adoor, Pandalam", "2026-10-18 07:00", "1,62,300", "Scheduled", "vector_control"),
        ("Sabarimala season health camps open", "advisory", "Ranni, Perunad", "2026-11-15 06:00", "1,08,900", "Scheduled", "health_camp"),
        ("Flood: boil drinking water", "emergency", "Ranni, Kozhencherry", "2026-10-09 05:40", "1,94,000", "Sent", "flood")]),
    "state": (201, LATHA, G(41), ("state", 33), [
        ("Heatwave — 7 districts on orange alert", "emergency", "Palakkad, Thrissur, Kollam +4", "2026-10-17 08:30", "1.42 cr", "Sent", "heat"),
        ("Dengue dry day — every Sunday", "advisory", "Whole state", "2026-10-18 07:00", "2.41 cr", "Scheduled", "vector_control"),
        ("Nipah: no new cases, stay alert", "advisory", "Kozhikode, Malappuram", "2026-10-14 10:00", "71.2 lakh", "Sent", "outbreak"),
        ("Flood: boil drinking water", "emergency", "Pathanamthitta, Alappuzha", "2026-10-09 05:40", "29.4 lakh", "Sent", "flood")]),
    "zonal": (301, VENK, G(42), ("zone", 2), [
        ("Cyclone watch — coastal Andhra Pradesh", "emergency", "Andhra Pradesh, Puducherry", "2026-10-17 06:15", "3.9 cr", "Sent", "cyclone"),
        ("Dengue dry day — every Sunday", "advisory", "Karnataka, Kerala", "2026-10-18 07:00", "6.3 cr", "Scheduled", "vector_control"),
        ("Heatwave advisory", "advisory", "Telangana", "2026-10-12 08:00", "2.6 cr", "Sent", "heat")]),
    "central": (401, BANER, G(43), ("national", None), [
        ("Cyclone watch — coastal Andhra Pradesh & Odisha", "emergency", "AP, Odisha, Puducherry", "2026-10-17 06:00", "8.1 cr", "Sent", "cyclone"),
        ("National dengue dry day", "advisory", "Whole country", "2026-10-18 07:00", "78.4 cr", "Scheduled", "vector_control"),
        ("Air quality — limit outdoor exercise", "advisory", "Delhi, Haryana, Punjab", "2026-10-20 06:00", "5.6 cr", "Scheduled", "air_quality"),
        ("Flood: boil drinking water", "emergency", "Bihar, Assam", "2026-10-02 05:10", "9.8 cr", "Sent", "flood")]),
}
alr = []
for lvl, (base_n, issuer, second, (scope, sid), items) in AL.items():
    for i, (title, typ, target, when, rch, status, cat) in enumerate(items):
        t = datetime.strptime(when, "%Y-%m-%d %H:%M")
        sent = status == "Sent"
        sc_state = sid if scope == "state" else None
        sc_zone = sid if scope == "zone" else None
        emer = typ == "emergency"
        sec = q(second) if emer else "NULL"
        sec_at = ist((t - timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M")) if emer else "NULL"
        alr.append(f"('{uid(606, base_n + i)}', '{issuer}', '{scope}', {sc_state or 'NULL'}, {DPTA if scope == 'district' else 'NULL'}, {sc_zone or 'NULL'}, "
                   f"'{'emergency' if emer else 'normal'}', {q(cat)}, {q(title)}, {q(title + '. Area: ' + target + '.')}, {ist(when)}, "
                   f"'{'sent' if sent else 'scheduled'}', {'NULL' if sent else ist(when)}, {ist(when) if sent else 'NULL'}, {sec}, {sec_at}, true, true, {reach(rch)}, "
                   f"{q(SND[lvl])}, '{'emergency' if emer else 'health_dept'}')")
o.insert("engage.health_alert",
         "id, issued_by_user_id, scope, state_id, district_id, zone_id, severity, category, title, body, starts_at, status, scheduled_at, sent_at, second_approver_user_id, second_approved_at, sms, translate, reach_count, issuer_name, category_group",
         alr)

# ------------------------------------------------------------------ platform flags history, report exports
o.w("-- ---------- System settings: change history (flag defaults are in migration 128; maintenance Off, AI/registration/SMS/break-glass On) ----------")
o.insert("admin.platform_flag_history", "id, flag_code, enabled, changed_by_user_id, note, at",
         [f"('{uid(607, 1)}', 'ai', true, '{BANER}', 'AI features turned on', {ist('2026-10-02 10:12')})",
          f"('{uid(607, 2)}', 'maint', false, NULL, 'NHA ops: maintenance finished', {ist('2026-09-28 04:30')})",
          f"('{uid(607, 3)}', 'sms', true, '{BANER}', 'SMS gateway turned on', {ist('2026-09-12 18:05')})"])

o.w("-- ---------- Reports and exports: recent exports (kept 30 days; de-identified by constraint) ----------")
EXP = [  # file, requested_by, level, scope, at, size
    ("idsp_weekly_wk41.csv", AJAY, "district", "2026-10-13 09:10", 62), ("blood_organ_sep-2026.pdf", AJAY, "district", "2026-10-02 17:45", 1126),
    ("coverage_q2.csv", SUJA, "district", "2026-09-30 11:02", 88),
    ("idsp_weekly_wk41.csv", LATHA, "state", "2026-10-13 10:02", 410), ("health_summary_sep-2026.pdf", LATHA, "state", "2026-10-03 16:20", 3482),
    ("coverage_q2.csv", LATHA, "state", "2026-09-30 11:02", 1229),
    ("health_summary_sep-2026.pdf", VENK, "zonal", "2026-10-04 12:30", 6963), ("idsp_weekly_wk41.csv", VENK, "zonal", "2026-10-13 11:00", 2458),
    ("health_summary_sep-2026.pdf", BANER, "central", "2026-10-05 10:15", 14541), ("idsp_weekly_wk41.csv", BANER, "central", "2026-10-13 12:00", 10035),
    ("audit_access_q2.csv", BANER, "central", "2026-10-01 09:00", 22528),
]
er = []
for i, (f, by, lvl, at, kb) in enumerate(EXP, 1):
    code = re.match(r"(.+?)_(wk41|sep-2026|q2)\.", f).group(1)
    per = re.match(r".+?_(wk41|sep-2026|q2)\.", f).group(1)
    label, pf, pt_ = {"wk41": ("Week 41", "2026-10-05", "2026-10-11"), "sep-2026": ("September 2026", "2026-09-01", "2026-09-30"),
                      "q2": ("Q2 2026", "2026-04-01", "2026-06-30")}[per]
    zn = "2" if lvl == "zonal" else "NULL"
    stt = "33" if lvl == "state" else "NULL"
    dsc = DPTA if lvl == "district" else "NULL"
    t0 = datetime.strptime(at, "%Y-%m-%d %H:%M")
    er.append(f"('{uid(608, i)}', '{code}', '{by}', '{lvl}', {zn}, {stt}, {dsc}, {q(label)}, '{pf}', '{pt_}', '{f.rsplit('.', 1)[1]}', {q('demo/exports/' + f)}, {kb * 1024}, true, "
              f"{ist(at)}, {ist((t0 + timedelta(days=30)).strftime('%Y-%m-%d %H:%M'))})")
o.insert("admin.report_export",
         "id, report_code, requested_by_user_id, level, zone_id, state_id, district_id, period_label, period_from, period_to, format, storage_key, size_bytes, deidentified, created_at, expires_at", er)

# ------------------------------------------------------------------ AI governance
o.w("-- ---------- AI governance (Central): model register, versions, drift and agreement series, release request, safety reports ----------")
MODELS = [(1, "Clinical guidance LLM", "symptom_chat"), (2, "Image analysis · chest X-ray", "image"), (3, "Temporal risk model", "temporal"), (4, "Genomic variant explainer", "genomic")]
o.insert("ai.model", "id, name, module", [f"('{uid(617, n)}', {q(nm)}, '{mod}')" for n, nm, mod in MODELS])
VERS = [(1, 1, "v3.2", "live", "AI Health Chat and doctor assist · 22 languages", "2026-08-01"),
        (2, 2, "v2.1", "on_hold", "Radiology assist · 1,840 facilities · drift alert, held for review", "2026-05-10"),
        (3, 3, "v1.3", "live", "Early warning on vitals trends", "2026-06-15"),
        (4, 4, "v1.0", "shadow", "Pilot · 6 medical colleges", None),
        (5, 1, "v3.3", "pending", "Release candidate", None)]
o.insert("ai.model_version", "id, model_id, version, status, meta, is_simulated, released_at",
         [f"('{uid(618, n)}', '{uid(617, m)}', {q(v)}, '{st}', {q(meta)}, true, {ist(rel) if rel else 'NULL'})" for n, m, v, st, meta, rel in VERS])
g_ag = [91.2, 92.7, 92.2, 91.8, 91.1, 92.6, 92.2, 91.7, 91, 92.5, 91.8, 92.3]
i_ag = [92.1, 92.3, 92.6, 92.8, 92, 92.3, 92.6, 92.8, 92.2, 89.8, 87.7, 84.9]
dm, k = [], 0
for w in range(12):
    at = (weeks[w] + timedelta(days=6)).strftime("%Y-%m-%d") + " 12:00" if w < 11 else "2026-10-17 12:00"
    for ver, val, reg in ((1, g_ag[w], None), (2, i_ag[w], "North-east zone" if w >= 9 else None)):
        k += 1
        dm.append(f"('{uid(621, k)}', '{uid(618, ver)}', {ist(at)}, 'agreement_pct', {val}, {q(reg)})")
for ver, val, reg in ((1, 0.4, None), (2, 8.1, "North-east zone"), (3, 1.1, None)):
    k += 1
    dm.append(f"('{uid(621, k)}', '{uid(618, ver)}', {ist('2026-10-17 12:00')}, 'drift_pct', {val}, {q(reg)})")
k += 1
dm.append(f"('{uid(621, k)}', '{uid(618, 5)}', {ist('2026-10-14 09:00')}, 'unsafe_advice_pct', 0.02, NULL)")
o.insert("ai.drift_metric", "id, model_version_id, measured_at, metric, value, region", dm)
o.insert("ai.release_request", "id, model_version_id, from_version_id, submitted_by, submitted_at, required_signoffs, status, shadow_run_days, metrics, checklist",
         [f"('{uid(619, 1)}', '{uid(618, 5)}', '{uid(618, 1)}', 'AI safety board', {ist('2026-10-14 09:00')}, 2, 'waiting', 14, "
          f"{jb({'agreement_pct': 93.1, 'unsafe_advice_pct': 0.02, 'regional_gain_pts': 4.2, 'regional_gain_label': 'Malayalam / Tamil', 'test_cases': 48200})}, "
          f"{jb([{'item': 'Clinical validation on Indian data', 'required': True}, {'item': 'Safety board sign-off (2 of 3)', 'required': True}, {'item': 'Shadow run · 14 days, no patient impact', 'required': True}, {'item': 'Automatic rollback if drift passes 5%', 'always_on': True}])})"])
SR = [(1, U(2), 1, "unsafe_advice", "high", "Chat advised home care for chest pain", "Kerala · caught by the safety filter, no harm", "closed", "2026-10-06 11:00", "2026-10-12 16:00"),
      (2, G(51), 2, "missed_finding", "high", "X-ray flagged normal, radiologist found nodule", "Assam · older scanner", "reviewing", "2026-10-10 14:30", None),
      (3, U(112), 1, "wrong_language", "medium", "Wrong drug name in Malayalam answer", "Kerala · transliteration error", "closed", "2026-09-28 10:15", "2026-10-12 16:00"),
      (4, G(52), 3, "other", "low", "Risk score missing for paediatric vitals", "Delhi · out of scope by design", "closed", "2026-09-24 09:45", "2026-09-26 12:00")]
o.insert("ai.safety_report", "id, model_version_id, reporter_user_id, kind, severity, title, detail, status, created_at, closed_at",
         [f"('{uid(620, n)}', '{uid(618, ver)}', '{rep}', '{kind}', '{sev}', {q(t)}, {q(d)}, '{st}', {ist(c)}, {ist(cl) if cl else 'NULL'})"
          for n, rep, ver, kind, sev, t, d, st, c, cl in SR])

# ------------------------------------------------------------------ flagged audit events
o.w("-- ---------- Audit & security: flagged events (the same five events at every level; District facilities are used) ----------")
FL = [(1, "break_glass_no_admission", "high", "Break-glass access with no admission recorded", "Doctor", uid(10, 5), "2026-10-17 03:12", "DEMO-AUD-91F2"),
      (2, "many_dispenses_short_time", "medium", "14 prescriptions dispensed in 10 minutes · Care Plus Demo Pharmacy", "Pharmacist", None, "2026-10-16 22:40", "DEMO-AUD-88C1"),
      (3, "upload_to_closed_order", "medium", "Lab upload to an order closed 3 days earlier", "Lab tech", uid(10, 12), "2026-10-15 16:05", "DEMO-AUD-87A0"),
      (4, "failed_signins_locked", "low", "9 failed sign-ins, account locked", "Nurse", uid(10, 3), "2026-10-14 07:58", "DEMO-AUD-86D4"),
      (5, "many_records_one_shift", "medium", "Same doctor opened 38 records in one shift", "Doctor", H1, "2026-10-13 19:20", "DEMO-AUD-85B9")]
o.insert("audit.flagged_event", "id, rule, severity, event_text, actor_role, hospital_id, district_id, status, created_at",
         [f"('{uid(616, n)}', '{rule}', '{sev}', {q(txt + ' [' + ref + ']')}, {q(role)}, {q(h)}, {DPTA}, 'open', {ist(at)})" for n, rule, sev, txt, role, h, at, ref in FL])

# ------------------------------------------------------------------ grievances of the District / State consoles
o.w("-- ---------- Grievances shown on the District and State overview (CMP-0412 itself is filed in the citizen seed) ----------")
GV = [  # n, ref, title, who, district expr, hospital, about_type, category, status, created, place, esc level
    (1, "CMP-0406", "Ambulance took 50 minutes", P(1003), DPTA, None, "other", "other", "open", "2026-10-14 09:20", "108 service · Konni", 0),
    (2, "CMP-0405", "Medicine out of stock twice", P(1011), DPTA, uid(10, 12), "hospital", "pharmacy", "open", "2026-10-15 11:10", "PHC Elanthoor", 0),
    (3, "CMP-0407", "Escalated: denied free dialysis", P(1010), "util.seed_district('Kollam')", None, "hospital", "op_services", "escalated", "2026-10-11 10:30", "Demo General Hospital, Kollam", 2),
    (4, "CMP-0408", "Escalated: staff asked for payment", P(1004), "util.seed_district('Palakkad')", None, "hospital", "staff_conduct", "escalated", "2026-10-13 15:45", "Demo PHC, Palakkad", 2),
]
o.insert("engage.complaint", "id, ref_no, title, raised_by_person_id, about_type, district_id, hospital_id, category, severity, status, body, place_text, escalation_level, created_at, updated_at",
         [f"('{uid(622, n)}', {q(ref)}, {q(t)}, '{who}', '{at_}', {dist}, {q(h)}, '{cat}', 'normal', '{st}', {q(t + ' · ' + place)}, {q(place)}, {lv}, {ist(c)}, {ist(c)})"
          for n, ref, t, who, dist, h, at_, cat, st, c, place, lv in GV])
o.insert("engage.complaint_event", "id, complaint_id, actor_user_id, kind, text, created_at",
         [f"('{uid(623, 1)}', '{uid(622, 3)}', '{AJAY}', 'escalated', 'Escalated to State by the District admin', {ist('2026-10-11 16:00')})",
          f"('{uid(623, 2)}', '{uid(622, 4)}', '{AJAY}', 'escalated', 'Escalated to State by the District admin', {ist('2026-10-13 18:00')})"])

# ------------------------------------------------------------------ generated audit logs (G.*.7 of the inventory)
o.w("-- ---------- Audit log (logs section): the design's generated rows, with the same text, actors as pseudonymous labels ----------")
o.w("-- District / State rows carry district_id (chain of Kerala, stream 33); Zonal / Central rows span several states and go to the national chain (stream 0). Times as designed (some after the 14:45 prototype 'now').")
txt = open(INV, encoding="utf-8").read()
def parse_log(section_title):
    a = txt.index(section_title)
    ends = [i for i in (txt.find("\n### ", a + 10), txt.find("\n---", a + 10)) if i > 0]
    b = min(ends)
    out = []
    for m in re.finditer(r"^\| (l\d+) \| 17 Oct (\d\d:\d\d) \| (\w+) \| (.+?) \| (.+?) \| (.+?) \| (\w+) \| (EV-\d+) \|$", txt[a:b], re.M):
        out.append(m.groups())
    return out
ACTION = {"Session opened with citizen key": "session.open", "Session ended by citizen": "session.end", "Break-glass access · casualty": "breakglass.open",
          "Approved hospital admin": "admin.approve", "Role changed: nurse → charge nurse": "admin.role_change", "Report exported (de-identified)": "report.export",
          "Failed sign-in · account locked": "auth.locked", "Security key registered": "auth.key_registered", "Lab result uploaded to order": "lab.upload",
          "Health alert broadcast": "alert.broadcast"}
ROLE = {"Doctor": "doctor", "Lab tech": "staff", "Nurse": "staff", "Hospital admin": "hospital_admin", "Citizen": "citizen"}
LV = {"district": "district_admin", "state": "state_admin", "zonal": "zonal_admin", "central": "central_admin"}
ST_BY_NAME = dict(state_ids); ST_BY_NAME.update({"Jammu & Kashmir": 7, "Dadra & Nagar Haveli and Daman & Diu": 29, "Andaman & Nicobar": 25})
logs = []
for lvl, sect in (("district", "#### G.District.7"), ("state", "#### G.State.7"), ("zonal", "#### G.Zonal.7"), ("central", "#### G.Central.7")):
    for (lid, tm, typ, action, actor, where, tag, ev) in parse_log(sect):
        role = actor.split(" · ")[0]
        acct = LV[lvl] if role == "Admin" else ROLE[role]
        if lvl == "district":
            dist, stream = DPTA, 33
        elif lvl == "state":
            dist, stream = f"util.seed_district({q(where)})", 33
        else:
            dist, stream = None, 0   # zonal / central rows span several states: national chain (stream 0)
        det = {"seed_ref": f"gov-{lvl}-{lid}", "summary": action, "actor_label": actor, "where": where, "type": typ, "level_tag": tag, "event_ref": ev, "console": lvl}
        logs.append((f"2026-10-17 {tm}", acct, ACTION[action], stream, dist, det))
vals = [f"({ist(at)}, {q(acct)}::identity.account_type, {q(ac)}, {st}::smallint, {dist or 'NULL::uuid'}, {jb(det)})" for at, acct, ac, st, dist, det in logs]
o.w("""INSERT INTO audit.activity_log (stream_id, occurred_at, user_id, account_type, action, district_id, details)
SELECT v.stream, v.at, NULL, v.acct, v.action, v.did, v.det
FROM (VALUES
""" + ",\n".join("  " + v for v in vals) + """
) AS v(at, acct, action, stream, did, det)
WHERE NOT EXISTS (SELECT 1 FROM audit.activity_log l WHERE l.details ->> 'seed_ref' = v.det ->> 'seed_ref');
""")
o.counts["audit.activity_log"] = len(vals)

o.w("COMMIT;")
open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "60_gov_console.sql"), "w").write(o.text())
print(o.counts)
print("district anomaly:", d_tot, d_base, d_hot, " state anomaly:", s_hot, s_base)

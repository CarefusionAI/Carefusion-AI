#!/usr/bin/env python3
"""
Generator for seed/design/10_citizen.sql (Citizen screens: everything about Anjali Menon and her context).

    python3 carefusion-db/seed/design/10_build_citizen.py

Deterministic (no clock, fixed pseudo-random seed for the BP series). 10_citizen.sql is the artefact that
is applied by run_migrations.sh; this file is only the source it is generated from.

Rules (see IDS.md): one transaction, ON CONFLICT DO NOTHING, no change to base rows, ids only in kinds
0100-0199, demo "today" = Saturday 17 October 2026 (IST, +05:30), synthetic data only, no Aadhaar digits.
"""
from __future__ import annotations

import hashlib
import json
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import build_base as B  # noqa: E402  (people lists, helpers)

OUT = HERE / "10_citizen.sql"

# ----------------------------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------------------------
uid = B.uid
q = B.q


def PP(n):  # identity.person id
    return uid(1, n)


def UU(n):  # identity.app_user id
    return uid(2, n)


def HOSP(n):
    return uid(10, n)


def DEPT(h, name):
    return uid(11, B.dept_serial(h, name))


def T(s: str) -> str:
    """'2026-10-17 14:24' (IST) -> SQL timestamptz literal."""
    if len(s) == 10:
        s += " 00:00"
    return f"'{s}:00+05:30'"


def D(s: str) -> str:
    return f"'{s}'::date"


def BYTES(text: str, kind: str = "text") -> str:
    return f"convert_to({q(text)}, 'UTF8')"


def SHA(label: str) -> str:
    return "'\\x" + hashlib.sha256(("carefusion-demo-doc|" + label).encode()).hexdigest() + "'::bytea"


def J(s: str) -> str:
    return q(s) + "::jsonb"


def arr(items):
    return "ARRAY[" + ", ".join(q(i) for i in items) + "]::text[]"


ANJALI_P = PP(1)
ANJALI_U = UU(1)
ARUN, SREEJA, VIVEK, SAMEER, LAKSHMI = UU(2), UU(101), UU(102), UU(103), UU(110)
CHERIAN, ANITHA, RAJESH = UU(111), UU(112), UU(113)
RAHUL, FATHIMA, JOSEPH, SUMA, MEERA, AJAY, LATHA, LEKHA, BANERJEE = (
    UU(4), UU(5), UU(6), UU(7), UU(8), UU(9), UU(10), UU(3), UU(12))
PATHANAMTHITTA = "util.seed_district('Pathanamthitta')"

# Serial map (kind -> what). Printed into the SQL header.
KINDS = {
    100: "records.folder (1 Lab reports, 2 Imaging, 3 Prescriptions, 4 Discharge, 5 Uploaded by me, 6 Insurance & schemes)",
    101: "records.document (serial = design d0..d9 + 1)",
    102: "records.document_summary (same serial as the document)",
    104: "access.access_session of Anjali (1 Dr Arun 17 Oct 14:24 live, 2 Dr Sreeja 2 Oct, 3 break-glass 21 Sep)",
    105: "access.item_view",
    106: "admin.approval_request (1 = special-category request, district review)",
    107: "identity.special_category_request (1)",
    108: "identity.special_category_request_step (1..3)",
    110: "records.dated_event",
    111: "records.vital_observation",
    112: "records.vital_target",
    113: "records.vital_observation.set_id (BP + pulse pairs)",
    114: "records.allergy", 115: "records.condition", 116: "records.procedure_stay",
    117: "records.lifestyle", 118: "records.medication_current", 119: "records.immunization",
    120: "ai.chat_session (1 today, 2 chest X-ray, 3 Onam fasting, 4 dengue)",
    121: "ai.chat_message (serial = session*100 + seq)",
    130: "engage.chat_thread (1 Dr Arun, 2 appointments desk, 3 lab, 4 radiology, 5 Dr Sreeja, 6 health dept)",
    131: "engage.chat_participant", 132: "engage.chat_message", 133: "engage.chat_attachment",
    140: "engage.appointment_slot (1-3 past, 11-14 other providers, 2000+ Dr Arun 20-24 Oct)",
    141: "engage.appointment (1 26 Sep, 2 2 Oct, 3 17 Oct, 4 = Wed 21 Oct 10:30 token 16, 5-7 other bookers)",
    142: "engage.op_visit (1 26 Sep, 2 2 Oct, 3 17 Oct token 7, 4 11 Aug PHC Konni)",
    150: "engage.health_alert (1 heatwave, 2 dengue, 3 blood camp)",
    151: "engage.notification (in_app rows of the Alerts screen)",
    160: "engage.rating (1-8 = the 8 reviews of the design, in order)",
    161: "engage.rating_reply", 162: "engage.complaint (1 CMP-0412 .. 4 CMP-0266)", 163: "engage.complaint_event",
    164: "engage.rating_helpful: none (composite key)",
    170: "identity.device (1 Pixel 7 Chrome, 2 Galaxy A54 app, 3 Windows laptop Edge)",
    190: "identity.person: extra reviewers (1-6)",
}

out: list[str] = []
w = out.append
counts: dict[str, int] = {}


def ins(table: str, cols: list[str], rows: list[list[str]], conflict: str = "ON CONFLICT DO NOTHING", note: str = ""):
    if not rows:
        return
    counts[table] = counts.get(table, 0) + len(rows)
    if note:
        w(f"\n-- {note}")
    w(f"INSERT INTO {table} ({', '.join(cols)}) VALUES")
    w(",\n".join("  (" + ", ".join(r) + ")" for r in rows))
    w(conflict + ";")


# ----------------------------------------------------------------------------------------------
# 0. Header
# ----------------------------------------------------------------------------------------------
hdr = [
    "-- =====================================================================",
    "-- seed/design/10_citizen.sql : CITIZEN layer of the design seed (generated by 10_build_citizen.py).",
    "-- Everything the 16 Citizen screens show for Anjali Menon and her context.",
    "-- Depends on: migrations 000-128, 00_base.sql. Idempotent (ON CONFLICT DO NOTHING / WHERE NOT EXISTS).",
    "-- Demo \"today\" = Saturday 17 October 2026, clock times IST (+05:30). Synthetic data only; no Aadhaar digits.",
    "-- DO NOT EDIT BY HAND: change 10_build_citizen.py and regenerate.",
    "--",
    "-- CANONICAL RESOLUTIONS (see IDS.md D1-D18, plus these file-level ones):",
    "--   * Documents: 10 real rows in 6 folders (not 24). The designs also state 24 documents / 38 MB (Home, Settings),",
    "--     186 MB of 1 GB (Documents) and a 41 MB export ZIP; those are static design figures and are NOT",
    "--     reproduced by the rows (real sizes add up to a few MB). The API should compute them from size_bytes.",
    "--   * Booking: Wed 21 Oct 2026 10:30 with Dr. Arun Nair, token 16 (8 + 2 * slot index 4), ref DEMO-APT-58213.",
    "--   * LDL 142 mg/dL (HDL 48, TG 160) on 17 Oct 11:05; HbA1c 7.4 % on 4 Oct 2026 (7.9 % on 12 Jun 2026).",
    "--     The 6.9 % tile and the 132 LDL of the Documents summary are dropped.",
    "--   * Weight 61 kg on 15 Oct (series 62.8 -> 61.0 over 12 weeks, same shape as the design); height 158 cm;",
    "--     BMI 24.4; goal 58 kg (assumption: the design's goal 62 kg is above the canonical weight).",
    "--   * BP: 28 readings 18 Sep - 17 Oct, average 121/78, 26 in range of the target 90-130 / 60-85,",
    "--     highest 134/86 on 16 Oct 21:10 (a second high one, 131/86, on 9 Oct 21:05; both after a missed evening dose).",
    "--   * Prescription 17 Oct (RX-DEMO-88213): the prescription rows belong to the doctor seed (20_). The document",
    "--     row of its PDF is cfd00000-0101-4000-8000-000000000003 (folder Prescriptions) and the access session of",
    "--     the signing visit is cfd00000-0104-4000-8000-000000000001; use them in pharmacy.prescription.",
    "--   * Prescription-dependent rows are NOT here: pharmacy.prescription(+items), dose_log, refill_due links to a",
    "--     prescription, queue token P-042, medicine finder stock. They go in 20_/40_ with prescription ids kind 0211.",
    "--   * Encrypted columns (body_enc, summary_enc) hold PLAIN UTF-8 bytes with enc_key_id 'demo-none' (same",
    "--     convention as apps/api documents.service.ts). Not secret, demo only.",
    "--   * Special category: the diabetes card is requested with category_code 'other' + other_text because the",
    "--     type list (migration 110) has no 'diabetes'; a later migration may add it.",
    "--   * Provider details of the Find-care cards (languages, OP fee, years, teleconsult) live in",
    "--     identity.doctor_profile, which is a BASE row (not updated here). Values to add in build_base.py:",
    "--       Dr Arun Nair: ml+en, fee 0, 14 y | Dr Lakshmi Varma: ml+en, 0 | Dr Cherian Thomas: en+hi, 500",
    "--       Dr Anitha George: ml, 0, walk-in | Dr Rajesh Menon: en+ta, 600.",
    "--",
    "-- ID SERIAL MAP (all ids cfd00000-KKKK-4000-8000-NNNNNNNNNNNN, kinds 0100-0199):",
]
for k, v in sorted(KINDS.items()):
    hdr.append(f"--   {k:04d}  {v}")
hdr += [
    "-- =====================================================================",
    "BEGIN;",
]
out.extend(hdr)

# ----------------------------------------------------------------------------------------------
# 1. Extra reviewer persons (kind 0190). The reviews of the design come from people who are not in the base.
# ----------------------------------------------------------------------------------------------
REVIEWER_PEOPLE = [  # (serial, slug, name, dob, sex)
    (1, "sreelatha-krishnan", "Sreelatha Krishnan", "1979-03-11", "female"),
    (2, "biju-mathew", "Biju Mathew", "1984-07-02", "male"),
    (3, "rajan-thomas", "Rajan Thomas", "1971-11-20", "male"),
    (4, "mini-jose", "Mini Jose", "1986-01-28", "female"),
    (5, "lekha-raj", "Lekha Raj", "1990-09-09", "female"),
    (6, "ancy-philip", "Ancy Philip", "1989-05-15", "female"),
]
rows = []
for s, slug, name, dob, sex in REVIEWER_PEOPLE:
    abha = f"DEMO-0000-{8000 + s:04d}"
    rows.append([f"'{uid(190, s)}'", q(name), q(dob), q(sex), q(B.token_for(slug)), q(abha),
                 q(slug.replace("-", ".") + "@demo"), "'passed'", "'passed'", T("2026-01-02 00:00"),
                 T("2026-10-16 00:00"), "'citizen_app'"])
ins("identity.person", ["id", "full_name", "date_of_birth", "sex", "aadhaar_token", "abha_number", "abha_address",
                        "kyc_status", "face_check_status", "identity_locked_at", "created_at", "registration_channel"],
    rows, note="---------- reviewers who are not in the base (ABHA-verified, no login) ----------")

# ----------------------------------------------------------------------------------------------
# 2. Health profile facts (allergy, condition, procedures, lifestyle, current medicines, vaccines)
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Profile / health card =====")
ins("records.allergy",
    ["id", "patient_person_id", "substance", "substance_code", "reaction", "severity", "status", "source",
     "recorded_by_user_id", "recorded_at"],
    [[f"'{uid(114, 1)}'", f"'{ANJALI_P}'", q("Penicillin"), "NULL", q("Rash (2019)"), q("moderate"), q("active"),
      "'doctor'", f"'{ARUN}'", T("2026-03-02 10:00")]])
ins("records.condition",
    ["id", "patient_person_id", "code_system", "code", "name", "is_chronic", "onset_date", "status", "source",
     "recorded_by_user_id", "recorded_at"],
    [[f"'{uid(115, 1)}'", f"'{ANJALI_P}'", q("ICD-10"), q("E11"), q("Type 2 diabetes mellitus"), "true",
      D("2021-03-11"), q("active"), "'doctor'", f"'{ARUN}'", T("2026-03-02 10:00")]])
ins("records.procedure_stay",
    ["id", "patient_person_id", "kind", "description", "hospital_id", "from_date", "to_date", "source",
     "recorded_by_user_id", "recorded_at"],
    [[f"'{uid(116, 1)}'", f"'{ANJALI_P}'", q("surgery"), q("C-section (birth of Diya)"), f"'{HOSP(3)}'",
      D("2017-07-16"), D("2017-07-19"), "'doctor'", f"'{ARUN}'", T("2026-03-02 10:00")],
     [f"'{uid(116, 2)}'", f"'{ANJALI_P}'", q("hospital_stay"), q("3-day stay for chest infection (treated with non-penicillin antibiotics)"),
      f"'{HOSP(4)}'", D("2026-09-19"), D("2026-09-22"), "'doctor'", f"'{ARUN}'", T("2026-09-26 11:00")]])
ins("records.lifestyle",
    ["id", "patient_person_id", "smoking", "alcohol", "since", "source", "recorded_by_user_id", "recorded_at"],
    [[f"'{uid(117, 1)}'", f"'{ANJALI_P}'", q("never"), q("never"), "NULL", "'self_reported'", f"'{ANJALI_U}'",
      T("2026-03-02 10:00")]])
ins("records.medication_current",
    ["id", "patient_person_id", "medicine_id", "free_text", "dose", "since", "until", "status", "source",
     "recorded_by_user_id", "recorded_at"],
    [[f"'{uid(118, 1)}'", f"'{ANJALI_P}'", "NULL", q("Metformin 500 mg tablet"), q("1 tablet twice daily after food"),
      D("2021-03-11"), "NULL", q("active"), "'doctor'", f"'{ARUN}'", T("2026-03-02 10:00")],
     [f"'{uid(118, 2)}'", f"'{ANJALI_P}'", "NULL", q("Atorvastatin 10 mg tablet"), q("1 tablet after lunch"),
      D("2026-08-18"), "NULL", q("active"), "'doctor'", f"'{ARUN}'", T("2026-08-18 11:00")]])
ins("records.immunization",
    ["id", "patient_person_id", "vaccine", "dose_number", "given_on", "hospital_id", "source", "recorded_by_user_id",
     "recorded_at"],
    [[f"'{uid(119, 1)}'", f"'{ANJALI_P}'", q("Influenza (seasonal)"), "1", D("2025-11-14"), f"'{HOSP(9)}'", "'doctor'",
      f"'{ARUN}'", T("2025-11-14 11:00")]])

# ----------------------------------------------------------------------------------------------
# 4. Folders, documents, summaries, views, scans
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Folders and documents =====")
FOLDERS = [  # serial, name, colour
    (1, "Lab reports", "blue"), (2, "Imaging", "lavender"), (3, "Prescriptions", "teal"),
    (4, "Discharge", "peach"), (5, "Uploaded by me", "cream"), (6, "Insurance & schemes", "gold"),
]
ins("records.folder", ["id", "patient_person_id", "name", "kind", "created_by_user_id", "created_at", "colour"],
    [[f"'{uid(100, s)}'", f"'{ANJALI_P}'", q(n), "'user'", f"'{ANJALI_U}'", T("2026-01-02 09:00" if s != 6 else "2026-03-02 09:00"), q(c)]
     for s, n, c in FOLDERS])

# serial, folder, title, type, mime, size, created (IST), created_by, self, source_label, sign, ft
DOCS = [
    (1, 1, "Lipid profile", "lab_report", "application/pdf", 253952, "2026-10-17 11:05", RAHUL, False, "Demo General Hospital Central Lab", "Lab seal + e-sign",
     "Cholesterol slightly high",
     "LDL 142 mg/dL is above the 100 target. HDL (48) is acceptable and triglycerides (160) are slightly above normal. Your doctor may continue Atorvastatin and suggest diet changes.",
     ARUN, "2026-10-17 14:30"),
    (2, 2, "Chest X-ray, PA view", "scan", "application/dicom", 3250585, "2026-10-15 09:40", FATHIMA, False, "Radiology, Demo General Hospital", "Reviewed by Dr. Arun Nair",
     "No urgent findings",
     "Mild hazy area in the right lower zone, likely from last month's chest infection. Repeat X-ray in 2 weeks.",
     ARUN, "2026-10-15 12:00"),
    (3, 3, "Prescription: diabetes review", "prescription", "application/pdf", 114688, "2026-10-17 10:05", ARUN, False, "Dr. Arun Nair", "e-Signed (DSC)",
     "3 medicines, 30 days",
     "Metformin 500 mg twice daily, Atorvastatin 10 mg after lunch, Vitamin D3 60,000 IU once a week (Sunday). Valid till 14 Nov 2026.",
     ARUN, "2026-10-17 10:10"),
    (4, 1, "HbA1c", "lab_report", "application/pdf", 215040, "2026-10-04 16:30", RAHUL, False, "District PHL, Pathanamthitta", "Lab seal + e-sign",
     "Sugar control improving", "HbA1c 7.4%, down from 7.9% in June. Target is under 7%.", ARUN, "2026-10-05 10:00"),
    (5, 4, "Discharge summary", "discharge_summary", "application/pdf", 389120, "2026-09-22 15:00", ARUN, False, "Demo Taluk Hospital, Kozhencherry", "e-Signed",
     "3-day stay for chest infection",
     "Admitted with fever and cough, treated with antibiotics (non-penicillin). Discharged stable.", ARUN, "2026-09-26 11:30"),
    (6, 1, "Complete blood count", "lab_report", "application/pdf", 196608, "2026-09-20 11:20", RAHUL, False, "Demo Taluk Hospital, Kozhencherry lab", "Lab seal",
     "Infection markers raised",
     "White cells 13,200, consistent with an infection at the time. Repeat was normal.", ARUN, "2026-09-26 11:30"),
    (7, 2, "Abdominal ultrasound", "scan", "image/jpeg", 1843200, "2026-06-11 12:00", FATHIMA, False, "Demo General Hospital", "Reported",
     "Normal study", "Liver, gallbladder and kidneys look normal.", ARUN, "2026-06-12 10:00"),
    (8, 5, "Eye test (optician)", "upload", "application/pdf", 532480, "2026-05-08 10:00", ANJALI_U, True, "Uploaded by you", "Not verified",
     "Mild short sight", "Glasses -0.75 both eyes. No diabetic eye changes noted.", None, None),
    (9, 5, "Old vaccination card", "upload", "image/jpeg", 1468006, "2026-10-17 13:40", ANJALI_U, True, "Uploaded by you", "Not verified",
     "Childhood vaccines listed", "Photo of a 1990s card: BCG, DPT, polio and measles. A doctor can confirm it.", None, None),
    (10, 6, "Demo Health Cover e-card", "upload", "application/pdf", 98304, "2026-03-02 09:30", ANJALI_U, True, "Uploaded by you", "Not verified",
     "Health cover card", "Family floater cover of Rs 5 lakh a year at empanelled hospitals. Card holder: Anjali Menon.", None, None),
]
FOLDER_OF = {1: 1, 2: 2, 3: 3, 4: 1, 5: 4, 6: 1, 7: 2, 8: 5, 9: 5, 10: 6}
rows = []
for (s, f, title, dt, mime, size, created, by, selfrep, src, sign, st, sm, rev, revat) in DOCS:
    ext = {"application/pdf": "pdf", "application/dicom": "dcm", "image/jpeg": "jpg"}[mime]
    key = f"seed/citizen/anjali-menon/{s:02d}-{title.lower().replace(' ', '-').replace(',', '').replace(':', '')}.{ext}"
    rows.append([f"'{uid(101, s)}'", f"'{ANJALI_P}'", f"'{uid(100, f)}'", q(title), f"'{dt}'", q(key), q(mime), str(size),
                 SHA(title), q("demo-none"), "true" if selfrep else "false", f"'{by}'", T(created), "'general'", q(src), q(sign)])
ins("records.document",
    ["id", "patient_person_id", "folder_id", "title", "doc_type", "storage_key", "mime_type", "size_bytes", "sha256",
     "enc_key_id", "is_self_reported", "created_by_user_id", "created_at", "sensitivity", "source_label", "signature_note"],
    rows, note="10 documents (design d0..d9); storage_key is a placeholder object name (no file in MinIO)")

rows = []
for (s, f, title, dt, mime, size, created, by, selfrep, src, sign, st, sm, rev, revat) in DOCS:
    rows.append([f"'{uid(102, s)}'", f"'{uid(101, s)}'", f"'{ANJALI_P}'", q(st), BYTES(sm), q("demo-none"),
                 q("carefusion-demo-summariser (simulated AI output)"), q("sim-0.1"), "true",
                 f"'{rev}'" if rev else "NULL", T(revat) if revat else "NULL", T(created)])
ins("records.document_summary",
    ["id", "document_id", "patient_person_id", "summary_title", "summary_enc", "enc_key_id", "model_name",
     "model_version", "is_simulated", "reviewed_by_user_id", "reviewed_at", "created_at"],
    rows, note="plain-language summaries: simulated AI output, doctor-reviewed except on documents the citizen uploaded herself (rule 3: gate in the API)")

ins("records.document_scan",
    ["document_id", "patient_person_id", "virus_status", "scanned_at", "ocr_status", "ocr_language", "extracted_at"],
    [[f"'{uid(101, d[0])}'", f"'{ANJALI_P}'", "'clean'", T(d[6]), "'done'" if d[3] != "scan" else "'not_needed'", q("en"),
      T(d[6]) if d[3] != "scan" else "NULL"] for d in DOCS])

# Seen by Anjali (not "new"): d3 HbA1c, d4 discharge, d5 CBC, d6 ultrasound, d7 eye test, d9 e-card
rows = []
for s, first in [(4, "2026-10-05 08:15"), (5, "2026-09-26 18:00"), (6, "2026-09-26 18:05"), (7, "2026-06-12 20:00"),
                 (8, "2026-05-08 10:05"), (10, "2026-03-02 09:35")]:
    rows.append([f"'{uid(101, s)}'", f"'{ANJALI_U}'", T(first), T(first), "1"])
ins("records.document_view", ["document_id", "user_id", "first_viewed_at", "last_viewed_at", "view_count"], rows,
    note="documents already opened by Anjali; the others carry the 'New' badge (no view row)")

# ----------------------------------------------------------------------------------------------
# 3. Special-category (diabetes) request and its 4-step timeline
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Special category (diabetes chronic-illness card) =====")
ins("admin.approval_request",
    ["id", "subject_type", "subject_person_id", "step", "assigned_level", "assigned_district_id", "status",
     "submitted_at", "due_at", "reason", "check_results", "priority"],
    [[f"'{uid(106, 1)}'", "'special_category'", f"'{ANJALI_P}'", "1", "'district'", PATHANAMTHITTA, "'pending'",
      T("2026-10-14 10:00"), T("2026-10-21 17:00"), "NULL",
      J('{"proof": "HbA1c 7.4% on 04 Oct 2026", "requested_by": "Dr. Arun Nair", "card": "Diabetes care programme"}'),
      "'normal'"]],
    note="district review step opened 14 Oct (usually 5 working days -> due 21 Oct)")
ins("identity.special_category_request",
    ["id", "person_id", "category_code", "other_text", "status", "proof_document_id", "approval_request_id",
     "requested_at"],
    [[f"'{uid(107, 1)}'", f"'{ANJALI_P}'", "'other'", q("Diabetes (chronic illness card, diabetes care programme)"),
      q("district_review"), f"'{uid(101, 4)}'", f"'{uid(106, 1)}'", T("2026-10-02 11:30")]])
ins("identity.special_category_request_step",
    ["id", "request_id", "step", "actor_user_id", "note", "at"],
    [[f"'{uid(108, 1)}'", f"'{uid(107, 1)}'", q("requested"), f"'{ARUN}'", q("Request sent by Dr. Arun Nair"), T("2026-10-02 11:30")],
     [f"'{uid(108, 2)}'", f"'{uid(107, 1)}'", q("proof_uploaded"), f"'{ARUN}'", q("Lab proof attached: HbA1c 7.4% on 04 Oct"), T("2026-10-04 17:00")],
     [f"'{uid(108, 3)}'", f"'{uid(107, 1)}'", q("district_review"), "NULL", q("With Ajay Kumar, Pathanamthitta district office"), T("2026-10-14 10:00")]])

# ----------------------------------------------------------------------------------------------
# 5. Access: sessions, items viewed, break-glass, order-based access history (audit log)
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Share & access =====")
ins("access.access_session",
    ["id", "patient_person_id", "user_id", "mode", "key_token_id", "started_at", "expires_at", "ended_at", "ended_by",
     "start_inside_geofence", "reason"],
    [[f"'{uid(104, 1)}'", f"'{ANJALI_P}'", f"'{ARUN}'", "'key'", q("demo-key-session-0001"), T("2026-10-17 14:24"),
      T("2026-10-17 14:54"), "NULL", "NULL", "true", "NULL"],
     [f"'{uid(104, 2)}'", f"'{ANJALI_P}'", f"'{SREEJA}'", "'key'", q("demo-key-session-0002"), T("2026-10-02 10:15"),
      T("2026-10-02 10:45"), T("2026-10-02 10:27"), "'patient'", "true", "NULL"],
     [f"'{uid(104, 3)}'", f"'{ANJALI_P}'", f"'{VIVEK}'", "'break_glass'", "NULL", T("2026-09-21 02:48"),
      T("2026-09-21 03:48"), T("2026-09-21 03:21"), "'doctor'", "true",
      q("Road accident, patient unconscious and unable to share the key; husband Ravi Menon present at Casualty")]],
    note="live key session of Dr Arun (ended_at NULL = still open in the demo), ended-by-you session of Dr Sreeja, break-glass of 21 Sep (Dr Vivek Menon, D11)")
ins("access.emergency_access",
    ["session_id", "contact_person_id", "approved_on_contact_phone_at", "fallback_used", "break_glass_reason",
     "district_review_status", "district_reviewer_id", "district_reviewed_at", "central_verify_status",
     "central_verifier_id", "central_verified_at", "central_due_at", "patient_notified_at", "reason_category",
     "second_doctor_user_id", "second_doctor_at", "hospital_review_status", "hospital_reviewer_id",
     "hospital_reviewed_at", "hospital_review_note", "hospital_due_at", "contact_notified_at", "match_method",
     "evidence_note"],
    [[f"'{uid(104, 3)}'", f"'{PP(2001)}'", T("2026-09-21 02:52"), "false",
      q("Road accident, patient unconscious and unable to share the key; husband Ravi Menon present at Casualty"),
      "'ok'", f"'{AJAY}'", T("2026-09-22 10:00"), "'ok'", f"'{BANERJEE}'", T("2026-09-22 15:00"), T("2026-09-22 02:48"),
      T("2026-09-21 02:53"), q("accident"), f"'{SAMEER}'", T("2026-09-21 02:50"), "'ok'", f"'{MEERA}'",
      T("2026-09-21 11:00"), q("Justified: casualty register entry matches the time of arrival."),
      T("2026-09-24 02:48"), T("2026-09-21 02:51"), q("face"), q("Casualty register entry (demo)")]])
ins("access.item_view",
    ["id", "session_id", "patient_person_id", "user_id", "item_kind", "item_id", "label", "viewed_at"],
    [[f"'{uid(105, 1)}'", f"'{uid(104, 1)}'", f"'{ANJALI_P}'", f"'{ARUN}'", "'lab_result'", f"'{uid(101, 1)}'", q("Lipid profile"), T("2026-10-17 14:25")],
     [f"'{uid(105, 2)}'", f"'{uid(104, 1)}'", f"'{ANJALI_P}'", f"'{ARUN}'", "'vital'", "NULL", q("30-day BP readings"), T("2026-10-17 14:27")],
     [f"'{uid(105, 3)}'", f"'{uid(104, 1)}'", f"'{ANJALI_P}'", f"'{ARUN}'", "'prescription'", f"'{uid(101, 3)}'", q("Atorvastatin 10 mg (draft)"), T("2026-10-17 14:31")],
     [f"'{uid(105, 4)}'", f"'{uid(104, 2)}'", f"'{ANJALI_P}'", f"'{SREEJA}'", "'lab_result'", f"'{uid(101, 4)}'", q("HbA1c"), T("2026-10-02 10:18")],
     [f"'{uid(105, 5)}'", f"'{uid(104, 2)}'", f"'{ANJALI_P}'", f"'{SREEJA}'", "'prescription'", "NULL", q("Current medicines"), T("2026-10-02 10:20")],
     [f"'{uid(105, 6)}'", f"'{uid(104, 3)}'", f"'{ANJALI_P}'", f"'{VIVEK}'", "'emergency_card'", "NULL", q("Emergency card"), T("2026-09-21 02:49")]],
    note="what each session opened (titles only)")

# Access history rows that are not key sessions come from the audit log (access.v_order_access_history).
HIST = [  # key, when, actor user, account_type, action, how, saw, hospital
    ("citizen:access:lab-2026-10-17", "2026-10-17 11:05", RAHUL, "staff", "lab.result_upload", "Lab order #ORD-DEMO-5521", "Upload only"),
    ("citizen:access:imaging-2026-10-15", "2026-10-15 09:40", FATHIMA, "staff", "imaging.study_upload", "Imaging order #ORD-DEMO-2210", "Upload only"),
    ("citizen:access:rx-2026-10-12", "2026-10-12 17:12", JOSEPH, "pharmacist", "rx.prescription_scan", "Prescription scan", "Rx only"),
    ("citizen:access:nurse-2026-09-04", "2026-09-04 12:30", LEKHA, "staff", "nurse.admission_view", "Admission mode, Ward 3", "Vitals"),
]
w("\n-- order-based access history (lab, radiology, pharmacist, nurse): audit rows; the hash chain is built by the trigger,")
w("-- idempotency is by details->>'seed_key'")
for key, when, actor, atype, action, how, saw in HIST:
    counts["audit.activity_log"] = counts.get("audit.activity_log", 0) + 1
    det = json.dumps({"how": how, "saw": saw, "seed_key": key})
    w(f"INSERT INTO audit.activity_log (stream_id, occurred_at, user_id, account_type, action, entity_type, patient_person_id, details, hospital_id, district_id)\n"
      f"SELECT 0, {T(when)}, '{actor}', '{atype}'::identity.account_type, {q(action)}, 'access_history', '{ANJALI_P}', "
      f"{q(det)}::jsonb, '{HOSP(1)}', {PATHANAMTHITTA}\n"
      f"WHERE NOT EXISTS (SELECT 1 FROM audit.activity_log WHERE details->>'seed_key' = {q(key)});")

# ----------------------------------------------------------------------------------------------
# 6. Visits, appointments, slots (Find care)
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Find care: slots, appointments, visits =====")
SLOT_TIMES = ["09:00", "09:15", "09:30", "09:45", "10:30", "10:45", "11:00", "11:15", "11:30"]


def rng(day: str, t: str, minutes: int = 15) -> str:
    start = datetime.strptime(f"{day} {t}", "%Y-%m-%d %H:%M")
    end = start + timedelta(minutes=minutes)
    return f"tstzrange({T(start.strftime('%Y-%m-%d %H:%M'))}, {T(end.strftime('%Y-%m-%d %H:%M'))}, '[)')"


slot_rows = []
# past slots of the visits
slot_rows.append([f"'{uid(140, 1)}'", f"'{HOSP(1)}'", f"'{DEPT(1, B.GM)}'", f"'{ARUN}'", rng("2026-09-26", "10:30"), "1", "'op'"])
slot_rows.append([f"'{uid(140, 2)}'", f"'{HOSP(2)}'", f"'{DEPT(2, 'Ophthalmology')}'", f"'{SREEJA}'", rng("2026-10-02", "10:15"), "1", "'op'"])
slot_rows.append([f"'{uid(140, 3)}'", f"'{HOSP(1)}'", f"'{DEPT(1, B.GM)}'", f"'{ARUN}'", rng("2026-10-17", "14:15"), "1", "'op'"])
# other providers on the Find-care list
slot_rows.append([f"'{uid(140, 11)}'", f"'{HOSP(3)}'", f"'{DEPT(3, 'Diabetology')}'", f"'{LAKSHMI}'", rng("2026-10-21", "09:00"), "1", "'op'"])
slot_rows.append([f"'{uid(140, 12)}'", f"'{HOSP(7)}'", f"'{DEPT(7, 'Cardiology')}'", f"'{CHERIAN}'", rng("2026-10-17", "17:30"), "1", "'op'"])
slot_rows.append([f"'{uid(140, 13)}'", f"'{HOSP(10)}'", f"'{DEPT(10, B.GM)}'", f"'{ANITHA}'", rng("2026-10-17", "09:00", 240), "30", "'walk_in'"])
slot_rows.append([f"'{uid(140, 14)}'", f"'{HOSP(6)}'", f"'{DEPT(6, 'Endocrinology')}'", f"'{RAJESH}'", rng("2026-10-22", "11:00"), "1", "'op'"])
# PHC Konni past walk-in (11 Aug)
slot_rows.append([f"'{uid(140, 15)}'", f"'{HOSP(10)}'", f"'{DEPT(10, B.GM)}'", f"'{ANITHA}'", rng("2026-08-11", "09:00", 240), "30", "'walk_in'"])
# Dr Arun's morning OP, Tue 20 - Sat 24 Oct (picker days), 9 slots of 15 minutes
for off in range(5):
    day = (date(2026, 10, 20) + timedelta(days=off)).isoformat()
    for i, t in enumerate(SLOT_TIMES):
        slot_rows.append([f"'{uid(140, 2000 + off * 10 + i + 1)}'", f"'{HOSP(1)}'", f"'{DEPT(1, B.GM)}'", f"'{ARUN}'",
                          rng(day, t), "1", "'op'"])
ins("engage.appointment_slot", ["id", "hospital_id", "department_id", "doctor_user_id", "during", "capacity", "slot_type"],
    slot_rows, note="slots (Dr Arun 20-24 Oct x 9 morning slots; the picker's 'full' ones are taken by other patients below)")


def slot_arun(day_off: int, idx: int) -> str:
    return uid(140, 2000 + day_off * 10 + idx + 1)


APPTS = [  # serial, slot, person, status, requested, decided, booking_ref, token, reason, visit_type, fee, doctor-decider
    (1, uid(140, 1), PP(1), "completed", "2026-09-24 09:00", "2026-09-24 09:20", "DEMO-APT-58190", 7, "New problem: fever, cough", "new", 0),
    (2, uid(140, 2), PP(1), "completed", "2026-09-30 15:00", "2026-09-30 15:30", "DEMO-APT-58197", 3, "Diabetic eye check", "new", 0),
    (3, uid(140, 3), PP(1), "completed", "2026-10-15 11:00", "2026-10-15 11:20", "DEMO-APT-58201", 7, "Follow-up visit", "follow_up", 0),
    (4, slot_arun(1, 4), PP(1), "confirmed", "2026-10-14 09:50", "2026-10-14 10:05", "DEMO-APT-58213", 16, "Follow-up visit", "follow_up", 0),
    (5, slot_arun(1, 0), PP(1006), "confirmed", "2026-10-14 08:30", "2026-10-14 09:00", "DEMO-APT-58210", 8, "Prescription refill", "follow_up", 0),
    (6, slot_arun(1, 2), PP(1011), "confirmed", "2026-10-14 08:45", "2026-10-14 09:00", "DEMO-APT-58211", 12, "Test results", "review", 0),
    (7, slot_arun(1, 7), PP(1008), "confirmed", "2026-10-14 09:10", "2026-10-14 09:30", "DEMO-APT-58212", 22, "New problem: back pain", "new", 0),
]
rows = []
for s, slot, person, st, req, dec, ref, tok, reason, vt, fee in APPTS:
    decider = SREEJA if s == 2 else ARUN
    rows.append([f"'{uid(141, s)}'", f"'{slot}'", f"'{person}'", f"'{st}'", T(req), f"'{decider}'", T(dec), q(ref), str(tok),
                 q(reason), q(vt), str(fee), "'normal'"])
ins("engage.appointment",
    ["id", "slot_id", "citizen_person_id", "status", "requested_at", "decided_by_user_id", "decided_at", "booking_ref",
     "token_no", "reason", "visit_type", "fee_amount", "priority"],
    rows, note="Anjali's booking for Wed 21 Oct 10:30 is serial 4 (token 16); the three 'full' slots are held by other patients")

VISITS = [  # serial, hospital, dept, doctor, appointment, date, token, status, checked_in, called, started, ended, session
    (1, 1, B.GM, ARUN, uid(141, 1), "2026-09-26", 7, "done", "2026-09-26 10:05", "2026-09-26 10:30", "2026-09-26 10:32", "2026-09-26 10:50", None),
    (2, 2, "Ophthalmology", SREEJA, uid(141, 2), "2026-10-02", 3, "done", "2026-10-02 09:55", "2026-10-02 10:15", "2026-10-02 10:15", "2026-10-02 10:27", uid(104, 2)),
    (3, 1, B.GM, ARUN, uid(141, 3), "2026-10-17", 7, "done", "2026-10-17 13:50", "2026-10-17 14:20", "2026-10-17 14:24", "2026-10-17 14:50", uid(104, 1)),
    (4, 10, B.GM, ANITHA, None, "2026-08-11", 14, "done", "2026-08-11 09:20", "2026-08-11 09:40", "2026-08-11 09:42", "2026-08-11 09:55", None),
]
rows = []
for s, h, dept, doc, appt, dte, tok, st, ci, ca, sa, en, sess in VISITS:
    rows.append([f"'{uid(142, s)}'", f"'{HOSP(h)}'", f"'{DEPT(h, dept)}'", f"'{doc}'", f"'{ANJALI_P}'", f"'{appt}'" if appt else "NULL",
                 D(dte), str(tok), "'normal'", "true" if s == 4 else "false", f"'{st}'", T(ci), T(ca), T(sa), T(en),
                 f"'{sess}'" if sess else "NULL"])
ins("engage.op_visit",
    ["id", "hospital_id", "department_id", "doctor_user_id", "patient_person_id", "appointment_id", "visit_date",
     "token_no", "priority", "is_walk_in", "status", "checked_in_at", "called_at", "started_at", "ended_at", "access_session_id"],
    rows, note="past OP visits (the 17 Oct visit is Anjali's token 7 in Dr Arun's queue; the doctor seed must reuse this row)")

# ----------------------------------------------------------------------------------------------
# 7. Dates (calendar)
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Dates =====")
EV = [  # serial, type, start, end, title, source_table, source_id, set_by, status, remind_before, notes
    (1, "test_due", "2026-10-04 08:00", None, "HbA1c blood test", None, None, ARUN, "done", None, "District PHL, Pathanamthitta · done"),
    (2, "refill_due", "2026-10-09 10:00", None, "Atorvastatin refill", None, None, ARUN, "done", None, "Collected"),
    (3, "past_visit", "2026-10-17 14:20", "2026-10-17 14:50", "Visit with Dr. Arun Nair", "engage.op_visit", uid(142, 3), None, "done", None, "14:20 · done"),
    (4, "appointment", "2026-10-21 10:30", "2026-10-21 10:45", "Follow-up with Dr. Arun Nair", "engage.appointment", uid(141, 4), ARUN, "scheduled", "1 day",
     "10:30 · OP block 2, Demo General Hospital · token 16"),
    (5, "refill_due", "2026-10-24 09:00", None, "Metformin refill due", None, None, ARUN, "scheduled", "3 days", "Set by Dr. Arun Nair · 30 tablets · any generic-medicine or hospital pharmacy"),
    (6, "checkup_due", "2026-10-28 11:00", None, "Diabetic eye screening", None, None, SREEJA, "scheduled", "1 day", "11:00 · Demo Taluk Hospital, Kozhencherry"),
    (7, "test_due", "2026-10-29 09:00", None, "Repeat chest X-ray", None, None, ARUN, "scheduled", "1 day", "Radiology · any time 9 to 4"),
    (8, "test_due", "2026-10-30 07:00", None, "HbA1c blood test", None, None, ARUN, "scheduled", "1 day", "Fasting from 22:00 the night before · any government lab (walk-in 07:00-10:00, not booked)"),
    (9, "vaccination_due", "2026-10-31 10:00", None, "Diya: MR booster", None, None, None, "scheduled", "1 day", "PHC Kozhencherry · 10:00 · reminder for Diya Menon (daughter, you are guardian)"),
    # "Eligible to donate blood again" (2 Nov) is seeded by 70_donation.sql
    (11, "vaccination_due", "2026-11-15 09:00", None, "Influenza vaccine", None, None, None, "scheduled", None, "Yearly · any PHC"),
    (12, "past_visit", "2026-09-26 10:30", "2026-09-26 10:50", "Dr. Arun Nair · fever, cough", "engage.op_visit", uid(142, 1), None, "done", None, "Prescription e-signed · follow-up set"),
    (13, "past_visit", "2026-10-02 10:15", "2026-10-02 10:27", "Dr. Sreeja Paul · eye check", "engage.op_visit", uid(142, 2), None, "done", None, "Demo Taluk Hospital, Adoor · normal"),
    (14, "past_visit", "2026-08-11 09:42", "2026-08-11 09:55", "PHC Konni · dengue test", "engage.op_visit", uid(142, 4), None, "done", None, "Negative · no follow-up needed"),
    (15, "past_visit", "2026-10-15 09:40", None, "Chest X-ray · Radiology", None, None, None, "done", None, "Demo General Hospital · report in Documents"),
]
rows = []
for s, t, st, en, title, stbl, sid, by, status, rem, notes in EV:
    rows.append([f"'{uid(110, s)}'", f"'{ANJALI_P}'", f"'{t}'", T(st), T(en) if en else "NULL", q(title),
                 q(stbl) if stbl else "NULL", f"'{sid}'" if sid else "NULL", f"'{by}'" if by else "NULL", q(status),
                 f"interval '{rem}'" if rem else "NULL", q(notes), "'none'"])
ins("records.dated_event",
    ["id", "patient_person_id", "event_type", "starts_at", "ends_at", "title", "source_table", "source_id", "set_by_user_id",
     "status", "remind_before", "notes", "repeat_rule"],
    rows, note="calendar events and past visits (the HbA1c test of the design's '3 Oct' is on 4 Oct to match the document)")

# ----------------------------------------------------------------------------------------------
# 8. Vitals series and targets
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Home vitals =====")
BP = []  # (datetime str, sys, dia, pulse or None, note)
rnd = random.Random(2026_10_17)
fixed = [("2026-10-17 07:40", 118, 76, 72, None), ("2026-10-16 21:10", 134, 86, None, "Missed evening dose"),
         ("2026-10-16 07:42", 121, 78, None, None), ("2026-10-09 21:05", 131, 86, None, "Missed evening dose")]
days = [date(2026, 9, 18) + timedelta(days=i) for i in range(28)]          # 18 Sep .. 15 Oct
days = [d for d in days if d not in (date(2026, 10, 9), date(2026, 10, 16)) and d != date(2026, 10, 17)]
chosen = sorted(rnd.sample(days, 24))
vals = [(rnd.randint(116, 126), rnd.randint(72, 82)) for _ in chosen]
target_sys, target_dia = 121 * 28, 78 * 28
need_s = target_sys - sum(f[1] for f in fixed) - sum(v[0] for v in vals)
need_d = target_dia - sum(f[2] for f in fixed) - sum(v[1] for v in vals)
i = 0
while need_s != 0 or need_d != 0:
    j = i % len(vals)
    s_, d_ = vals[j]
    if need_s > 0 and s_ < 128:
        s_ += 1; need_s -= 1
    elif need_s < 0 and s_ > 116:
        s_ -= 1; need_s += 1
    if need_d > 0 and d_ < 82:
        d_ += 1; need_d -= 1
    elif need_d < 0 and d_ > 72:
        d_ -= 1; need_d += 1
    vals[j] = (s_, d_)
    i += 1
    assert i < 10000
for d_, (s_, dd) in zip(chosen, vals):
    BP.append((f"{d_.isoformat()} 07:{rnd.randint(30, 55):02d}", s_, dd, rnd.choice([68, 70, 71, 72, 74, None]), None))
BP += fixed
BP.sort()
assert len(BP) == 28
assert sum(b[1] for b in BP) == target_sys and sum(b[2] for b in BP) == target_dia
assert max(b[1] for b in BP) == 134 and sum(1 for b in BP if b[1] > 130 or b[2] > 85) == 2

obs = []  # (kind-serial, code, value, unit, when, source, by, context, note, set_id)
n = 0


def add_obs(code, value, unit, when, source="self_reported", by=ANJALI_U, ctx=None, note=None, set_id=None):
    global n
    n += 1
    obs.append([f"'{uid(111, n)}'", f"'{ANJALI_P}'", q(code), str(value), q(unit), T(when), f"'{source}'", f"'{by}'",
                q(ctx) if ctx else "NULL", q(note) if note else "NULL", f"'{set_id}'" if set_id else "NULL"])


for k, (when, s_, d_, pulse, note) in enumerate(BP, start=1):
    sid = uid(113, k)
    add_obs("8480-6", s_, "mm[Hg]", when, ctx="sitting", note=note, set_id=sid)
    add_obs("8462-4", d_, "mm[Hg]", when, ctx="sitting", note=note, set_id=sid)
    if pulse:
        add_obs("8867-4", pulse, "/min", when, ctx="sitting", set_id=sid)
SUGAR = [("2026-08-29", 148), ("2026-09-05", 144), ("2026-09-12", 143), ("2026-09-19", 139), ("2026-09-26", 140),
         ("2026-10-03", 136), ("2026-10-10", 133), ("2026-10-17", 132)]
for d_, v in SUGAR:
    add_obs("1558-6", v, "mg/dL", f"{d_} 07:35", ctx="fasting", note="Before breakfast")
WY = [14, 18, 16, 24, 28, 26, 34, 38, 42, 44, 50, 54]
for k, y in enumerate(WY):
    kg = round(62.8 - (y - 14) * 1.8 / 40, 1)
    add_obs("29463-7", kg, "kg", f"{(date(2026, 7, 30) + timedelta(days=7 * k)).isoformat()} 07:30")
assert round(62.8 - (54 - 14) * 1.8 / 40, 1) == 61.0
add_obs("8302-2", 158, "cm", "2026-03-02 10:00", source="doctor", by=ARUN)
add_obs("2708-6", 98, "%", "2026-10-14 07:38", note="Pulse 70")
add_obs("2708-6", 98, "%", "2026-10-17 07:40")
add_obs("8310-5", 36.8, "Cel", "2026-10-14 18:00", ctx="oral")
add_obs("8310-5", 36.8, "Cel", "2026-10-17 07:40", ctx="oral")
# Lab-derived values (HbA1c, lipids) so the Vitals/Documents screens agree: staff-recorded
add_obs("4548-4", 7.9, "%", "2026-06-12 11:00", source="staff", by=RAHUL, note="Earlier result")
add_obs("4548-4", 7.4, "%", "2026-10-04 16:30", source="staff", by=RAHUL, note="District PHL, Pathanamthitta")
add_obs("13457-7", 158, "mg/dL", "2026-06-12 11:00", source="staff", by=RAHUL, note="Earlier LDL")
add_obs("13457-7", 142, "mg/dL", "2026-10-17 11:05", source="staff", by=RAHUL, note="Lipid profile, uploaded by Rahul Varghese")
add_obs("2085-9", 48, "mg/dL", "2026-10-17 11:05", source="staff", by=RAHUL)
add_obs("2571-8", 160, "mg/dL", "2026-10-17 11:05", source="staff", by=RAHUL)
ins("records.vital_observation",
    ["id", "patient_person_id", "code", "value_num", "unit", "effective_at", "source", "recorded_by_user_id", "context", "note", "set_id"],
    obs, note=f"{len(obs)} observations: BP x28 (+pulse), fasting sugar x8, weight x12, height, SpO2, temperature, HbA1c x2, LDL x2, HDL, TG")

ins("records.vital_target",
    ["id", "patient_person_id", "code", "low_value", "high_value", "goal_value", "unit", "set_by_user_id", "valid", "note"],
    [[f"'{uid(112, 1)}'", f"'{ANJALI_P}'", q("8480-6"), "90", "130", "NULL", q("mm[Hg]"), f"'{ARUN}'", "tstzrange('2026-09-26 00:00+05:30', NULL)", q("Systolic target band set by Dr. Arun Nair")],
     [f"'{uid(112, 2)}'", f"'{ANJALI_P}'", q("8462-4"), "60", "85", "NULL", q("mm[Hg]"), f"'{ARUN}'", "tstzrange('2026-09-26 00:00+05:30', NULL)", q("Diastolic target band set by Dr. Arun Nair")],
     [f"'{uid(112, 3)}'", f"'{ANJALI_P}'", q("1558-6"), "70", "130", "NULL", q("mg/dL"), f"'{ARUN}'", "tstzrange('2026-09-26 00:00+05:30', NULL)", q("Fasting sugar: under 130 mg/dL")],
     [f"'{uid(112, 4)}'", f"'{ANJALI_P}'", q("29463-7"), "NULL", "NULL", "58", q("kg"), f"'{ARUN}'", "tstzrange('2026-09-26 00:00+05:30', NULL)", q("Goal weight (assumption: 58 kg)")],
     [f"'{uid(112, 5)}'", f"'{ANJALI_P}'", q("4548-4"), "NULL", "7.0", "NULL", q("%"), f"'{ARUN}'", "tstzrange('2026-09-26 00:00+05:30', NULL)", q("HbA1c target: under 7%")],
     [f"'{uid(112, 6)}'", f"'{ANJALI_P}'", q("13457-7"), "NULL", "100", "NULL", q("mg/dL"), f"'{ARUN}'", "tstzrange('2026-09-26 00:00+05:30', NULL)", q("LDL target: under 100 mg/dL")]])

# ----------------------------------------------------------------------------------------------
# 9. AI chat (simulated)
# ----------------------------------------------------------------------------------------------
w("\n-- ===== AI Health Chat (all simulated AI output; guidance only) =====")
SESS = [  # serial, title, start, end, message list
    (1, "Is my cholesterol bad?", "2026-10-17 15:40", None, [
        ("user", "My lipid report came today. Is my cholesterol bad?", "2026-10-17 15:40", None),
        ("assistant", "Your LDL is 142 mg/dL, a little above the 100 your doctor aims for. HDL (48) and triglycerides (160) are close to normal. Atorvastatin usually takes 6-8 weeks to show its full effect, and your current course began in August. This is simulated guidance, not a diagnosis.",
         "2026-10-17 15:40", ("Lipid profile · 17 Oct", uid(101, 1))),
        ("user", "Should I take a higher dose?", "2026-10-17 15:41", None),
        ("assistant", "Only your doctor can change a dose. I can add this question to your next visit on 21 Oct with Dr. Arun Nair, or you can message him now.",
         "2026-10-17 15:41", ("Prescription · e-signed", uid(101, 3))),
    ]),
    (2, "Chest X-ray result explained", "2026-10-15 17:05", "2026-10-15 17:12", [
        ("user", "My chest X-ray images are in Documents. Can you explain the result in simple words?", "2026-10-15 17:05", None),
        ("assistant", "Dr. Arun Nair reviewed your chest X-ray (PA view, 15 Oct). It shows a mild hazy area in the lower right part of the lung, which doctors often see after a recent chest infection. No urgent findings were noted. This is simulated guidance, not a diagnosis.",
         "2026-10-15 17:05", ("Chest X-ray, PA view · 15 Oct", uid(101, 2))),
        ("user", "Is the hazy area serious?", "2026-10-15 17:07", None),
        ("assistant", "Your doctor wrote that the changes are mild and likely from last month's infection, and asked for a repeat X-ray in 2 weeks. I cannot say more than your doctor's note. If you get fever, chest pain or trouble breathing, call your doctor or 108.",
         "2026-10-15 17:07", ("Doctor's review note", uid(101, 2))),
        ("user", "When should I repeat it?", "2026-10-15 17:10", None),
        ("assistant", "Your record shows a repeat chest X-ray on 29 Oct at Radiology, Demo General Hospital (any time 9 to 4).",
         "2026-10-15 17:10", ("Dates · 29 Oct", None)),
    ]),
    (3, "Can I fast during Onam with Metformin?", "2026-09-02 19:30", "2026-09-02 19:48", [
        ("user", "Can I fast during Onam with Metformin?", "2026-09-02 19:30", None),
        ("assistant", "Fasting while taking diabetes medicines can drop your sugar too low. Please do not stop or skip Metformin on your own. A full-day fast is not advised without your doctor's plan. Simulated guidance only.",
         "2026-09-02 19:30", ("Metformin · prescription", None)),
        ("user", "What if I only skip lunch?", "2026-09-02 19:33", None),
        ("assistant", "Skipping a meal while on Metformin carries a lower risk than with some other sugar-lowering medicines, but low sugar can still happen. It is best to ask your doctor before changing meal times.",
         "2026-09-02 19:33", ("Your record · medicines", None)),
        ("user", "What are the signs of low sugar?", "2026-09-02 19:36", None),
        ("assistant", "Shakiness, sweating, hunger, headache, confusion or a fast heartbeat. Take something sugary and check your sugar. If you faint or feel very unwell, call 108.",
         "2026-09-02 19:36", ("General guidance", None)),
        ("user", "Can you tell the doctor?", "2026-09-02 19:40", None),
        ("assistant", "I can add this question to your next visit with Dr. Arun Nair, or you can message him. Only your doctor can change your plan.",
         "2026-09-02 19:40", ("Shared with your doctor: not sent", None)),
        ("user", "Okay, I will message him.", "2026-09-02 19:48", None),
    ]),
    (4, "Dengue warning signs", "2026-08-12 08:10", "2026-08-12 08:16", [
        ("user", "What are the warning signs of dengue?", "2026-08-12 08:10", None),
        ("assistant", "Warning signs include severe belly pain, repeated vomiting, bleeding from gums or nose, black stools, extreme tiredness or restlessness and fast breathing. If you see any of these, go to a hospital the same day or call 108. Simulated guidance, not a diagnosis.",
         "2026-08-12 08:10", ("Health department advisory", None)),
        ("user", "Is mosquito spray enough?", "2026-08-12 08:14", None),
        ("assistant", "Spray helps, but removing standing water near your home matters most. Use nets or repellent and keep water containers covered.",
         "2026-08-12 08:14", ("Health department advisory", None)),
    ]),
]
rows = []
for s, title, st, en, msgs in SESS:
    rows.append([f"'{uid(120, s)}'", f"'{ANJALI_P}'", "'citizen_guidance'", q(title), f"'{ANJALI_U}'", "true", T(st),
                 T(en) if en else "NULL"])
ins("ai.chat_session", ["id", "patient_person_id", "kind", "title", "started_by_user_id", "is_simulated", "started_at", "ended_at"],
    rows, note="4 chats; message_count is maintained by the insert trigger on ai.chat_message")
rows = []
for s, title, st, en, msgs in SESS:
    for k, (role, text, when, src) in enumerate(msgs, start=1):
        refs = "'[]'::jsonb"
        if src:
            item = {"label": src[0], "simulated": True}
            refs = q('[{"label": "%s", "simulated": true%s}]' % (src[0].replace('"', ''), (', "document_id": "%s"' % src[1]) if src[1] else "")) + "::jsonb"
        rows.append([f"'{uid(121, s * 100 + k)}'", f"'{uid(120, s)}'", str(k), q(role), BYTES(text), q("demo-none"), refs, "false", T(when)])
ins("ai.chat_message", ["id", "session_id", "seq", "role", "body_enc", "enc_key_id", "source_refs", "red_flag", "created_at"], rows)

# ----------------------------------------------------------------------------------------------
# 10. Messages
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Messages =====")
THREADS = [  # serial, type, subject, doctor, hospital, last_read(Anjali), other participant (user, hospital, display, role)
    (1, "doctor_followup", "Dr. Arun Nair", ARUN, None, "2026-10-17 12:00", (ARUN, None, "Dr. Arun Nair · General medicine · Demo General Hospital", "doctor")),
    (2, "hospital_desk", "Demo General Hospital · Appointments desk", None, 1, "2026-10-14 10:30", (None, 1, "Demo General Hospital · Appointments desk", "hospitaladmin")),
    (3, "lab", "Rahul Varghese · Lab technician", None, 1, "2026-10-17 11:30", (RAHUL, None, "Rahul Varghese · Lab technician · Demo General Hospital Central Lab", "labtech")),
    (4, "radiology", "Fathima Beevi · Radiology", None, 1, "2026-10-15 10:00", (FATHIMA, None, "Fathima Beevi · Radiology · Demo General Hospital", "radiology")),
    (5, "doctor_followup", "Dr. Sreeja Paul", SREEJA, None, "2026-10-02 13:00", (SREEJA, None, "Dr. Sreeja Paul · Ophthalmology · Demo Taluk Hospital, Adoor", "doctor")),
    (6, "health_dept", "Demo Health Department · Announcements", None, None, "2026-09-28 12:00", (AJAY, None, "Demo Health Department · announcements, no replies", "district")),
]
MSGS = {  # thread -> [(sender, text, when, attachment)]  attachment = (file, mime, size)
    1: [(ANJALI_U, "Doctor, my evening BP was 134/86 yesterday. I had missed the dose. Should I worry?", "2026-10-17 09:12", None),
        (ARUN, "One higher reading after a missed dose is expected. Keep logging morning and evening for a week and share the log with me.", "2026-10-17 11:40", None),
        (ARUN, "I have also sent your updated prescription. The Atorvastatin dose stays the same for now.", "2026-10-17 14:30", ("Prescription_17Oct.pdf", "application/pdf", 114688)),
        (ARUN, "Please do the HbA1c test before your follow-up on 21 Oct.", "2026-10-17 14:30", None)],
    2: [(MEERA, "Your follow-up with Dr. Arun Nair is confirmed for Wed 21 Oct, 10:30, OP block 2. Token 16.", "2026-10-14 10:05", None),
        (ANJALI_U, "Thank you. Is parking available?", "2026-10-14 10:20", None),
        (MEERA, "Yes, visitor parking near Gate 3 is free for the first 2 hours.", "2026-10-14 11:02", None)],
    3: [(RAHUL, "Your lipid profile is ready and added to your Documents.", "2026-10-17 11:05", ("Lipid_profile_17Oct.pdf", "application/pdf", 253952)),
        (ANJALI_U, "Got it, thank you.", "2026-10-17 11:20", None)],
    4: [(FATHIMA, "Your chest X-ray images are uploaded. Dr. Arun Nair will review and message you.", "2026-10-15 09:40", ("CXR_PA_15Oct.dcm", "application/dicom", 3250585))],
    5: [(SREEJA, "Your retina check is normal. Repeat the eye check once a year because of diabetes.", "2026-10-02 12:30", None)],
    6: [(AJAY, "Free diabetes screening camp at PHC Konni on 25 Oct, 9:00-13:00. Bring your ABHA card.", "2026-09-28 10:00", None)],
}
rows = []
for s, tt, subj, doc, hosp, lr, part in THREADS:
    last = max(m[2] for m in MSGS[s])
    rows.append([f"'{uid(130, s)}'", q(tt), f"'{ANJALI_P}'", f"'{doc}'" if doc else "NULL", q(subj), f"'{HOSP(hosp)}'" if hosp else "NULL",
                 T(MSGS[s][0][2]), T(last)])
ins("engage.chat_thread", ["id", "thread_type", "patient_person_id", "doctor_user_id", "subject", "hospital_id", "created_at", "last_message_at"],
    rows, note="6 threads (requires the doctor sessions above: CF072)")
rows = []
for s, tt, subj, doc, hosp, lr, part in THREADS:
    rows.append([f"'{uid(131, s * 10 + 1)}'", f"'{uid(130, s)}'", f"'{ANJALI_U}'", "NULL", "NULL", q("Anjali Menon"), "'citizen'", T(MSGS[s][0][2]), T(lr)])
    pu, ph, dn, role = part
    last_read_other = "NULL"
    if s == 1:
        last_read_other = T("2026-10-17 09:30")
    elif s in (2, 3, 4, 5):
        last_read_other = T(max(m[2] for m in MSGS[s]))
    rows.append([f"'{uid(131, s * 10 + 2)}'", f"'{uid(130, s)}'", f"'{pu}'" if pu else "NULL", f"'{HOSP(ph)}'" if ph else "NULL", "NULL",
                 q(dn), f"'{role}'", T(MSGS[s][0][2]), last_read_other])
ins("engage.chat_participant",
    ["id", "thread_id", "user_id", "hospital_id", "pharmacy_id", "display_name", "party_role", "added_at", "last_read_at"], rows,
    note="unread = messages after Anjali's last_read_at (Dr Arun 2, appointments desk 1)")
rows, att = [], []
for s, msgs in MSGS.items():
    for k, (sender, text, when, a) in enumerate(msgs, start=1):
        mid = uid(132, s * 100 + k)
        rows.append([f"'{mid}'", f"'{uid(130, s)}'", f"'{sender}'", BYTES(text), q("demo-none"), T(when)])
        if a:
            att.append([f"'{uid(133, s * 100 + k)}'", f"'{uid(130, s)}'", f"'{mid}'", T(when), q(a[0]), q(a[1]), str(a[2]),
                        q(f"seed/citizen/anjali-menon/messages/{a[0]}"), SHA(a[0]), "'clean'"])
ins("engage.chat_message", ["id", "thread_id", "sender_user_id", "body_enc", "enc_key_id", "sent_at"], rows)
ins("engage.chat_attachment",
    ["id", "thread_id", "message_id", "message_sent_at", "file_name", "mime_type", "size_bytes", "storage_key", "sha256", "scan_status"], att)

# ----------------------------------------------------------------------------------------------
# 11. Alerts and notification preferences
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Alerts =====")
ins("engage.health_alert",
    ["id", "issued_by_user_id", "scope", "district_id", "severity", "category", "title", "body", "starts_at", "ends_at",
     "status", "sent_at", "second_approver_user_id", "second_approved_at", "sms", "reach_count", "issuer_name", "category_group"],
    [[f"'{uid(150, 1)}'", f"'{AJAY}'", "'district'", PATHANAMTHITTA, "'emergency'", q("heatwave"),
      q("Heatwave warning: Pathanamthitta"),
      q("Stay indoors 12:00-16:00, drink water every hour, check on elderly neighbours. Cooling centre open at Demo General Hospital."),
      T("2026-10-17 11:20"), T("2026-10-18 18:00"), "'sent'", T("2026-10-17 11:20"), f"'{LATHA}'", T("2026-10-17 11:15"), "true",
      "61200", q("Demo State Disaster Management Authority"), "'emergency'"],
     [f"'{uid(150, 2)}'", f"'{AJAY}'", "'district'", PATHANAMTHITTA, "'normal'", q("outbreak"),
      q("Dengue cases rising in your ward"),
      q("Remove standing water near your home. Free fever check at PHC Omalloor, 9-1, all week."),
      T("2026-10-17 09:05"), T("2026-10-24 18:00"), "'sent'", T("2026-10-17 09:05"), "NULL", "NULL", "true",
      "18400", q("Demo Directorate of Health Services"), "'health_dept'"],
     [f"'{uid(150, 3)}'", f"'{AJAY}'", "'district'", PATHANAMTHITTA, "'normal'", q("blood_camp"),
      q("Blood donation camp: 8 Nov"),
      q("Demo Taluk Hospital, Adoor. You become eligible again on 2 Nov."),
      T("2026-10-14 10:00"), T("2026-11-08 18:00"), "'sent'", T("2026-10-14 10:00"), "NULL", "NULL", "false",
      "22950", q("Demo State Blood Transfusion Council"), "'health_dept'"]])
ins("engage.alert_read", ["user_id", "alert_id", "read_at"], [[f"'{ANJALI_U}'", f"'{uid(150, 3)}'", T("2026-10-14 18:30")]],
    note="blood camp alert already read; heatwave and dengue unread")

NOTIFS = [  # serial, template, kind, title, body, when, read, action(label, href)
    (3, "record_opened", "my_care", "Dr. Arun Nair opened your record",
     "Using your key, inside the hospital. The session ends 30 minutes after it opened unless you end it first.", "2026-10-17 14:24", False, ("See session", "/citizen/access")),
    (4, "appointment_confirmed", "my_care", "Appointment confirmed: Wed 21 Oct, 10:30",
     "Follow-up with Dr. Arun Nair, OP block 2. Bring your glucose diary.", "2026-10-14 10:05", True, ("View", "/citizen/dates")),
    (5, "refill_reminder", "my_care", "Metformin refill due in 7 days", "In stock at Demo Hospital Pharmacy, 1.2 km.", "2026-10-17 08:00", True, ("Find stock", "/citizen/medicines")),
    (6, "new_device_signin", "system", "New sign-in on Android phone",
     "Samsung Galaxy A54, Pathanamthitta. Not you? Sign it out from Settings.", "2026-10-15 21:10", True, ("Review", "/citizen/settings")),
]
rows = []
for s, tmpl, kind, title, body, when, read, (al, ah) in NOTIFS:
    payload = '{"title": "%s", "body": "%s", "action": {"label": "%s", "href": "%s"}}' % (title.replace('"', ''), body.replace('"', ''), al, ah)
    rows.append([f"'{uid(151, s)}'", f"'{ANJALI_U}'", "'in_app'", q(tmpl), J(payload), "'delivered'" if read else "'sent'", T(when), T(when),
                 q(kind), "'normal'"])
ins("engage.notification", ["id", "user_id", "channel", "template_code", "payload", "status", "created_at", "sent_at", "kind", "priority"],
    rows, note="in-app rows of the Alerts screen (status 'delivered' = read, 'sent' = unread; assumption). The lab-result / prescription / dispensed / blood rows are events (80_ events seed).")

rows = []
PREFS = [("health_dept", True, True), ("my_care", True, True), ("record_opened", True, True), ("blood_requests", False, False),
         ("appointment_reminders", True, True), ("medicine_reminders", True, True), ("monthly_summary", False, False), ("emergency", True, True)]
for cat, app, sms in PREFS:
    rows.append([f"'{ANJALI_U}'", f"'{cat}'", "'app'", "true" if app else "false", T("2026-10-01 09:00")])
    rows.append([f"'{ANJALI_U}'", f"'{cat}'", "'sms'", "true" if sms else "false", T("2026-10-01 09:00")])
rows.append([f"'{ANJALI_U}'", "'monthly_summary'", "'email'", "false", T("2026-10-01 09:00")])
ins("engage.notification_pref", ["user_id", "category", "channel", "enabled", "updated_at"], rows,
    note="Send by: App + SMS. Emergency cannot be turned off. Monthly summary (email on the 1st) is off.")

# ----------------------------------------------------------------------------------------------
# 12. Settings
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Settings =====")
ins("identity.user_preference",
    ["user_id", "text_size", "high_contrast", "reduce_motion", "read_aloud", "show_english_terms", "face_check_new_device", "quiet_hours", "extra"],
    [[f"'{ANJALI_U}'", "'default'", "false", "false", "false", "true", "true",
      J('{"enabled": true, "from": "22:00", "to": "07:00"}'),
      J('{"app_language": "en", "ai_language": "ml", "emergency_card_without_key": true, "ai_reads_documents": true, "research_use": false, "monthly_summary_email": false, "send_by": "App + SMS"}')]])
ins("identity.share_preference", ["person_id", "category", "enabled"],
    [[f"'{ANJALI_P}'", f"'{c}'", "true" if e else "false"] for c, e in
     [("lab", True), ("rx", True), ("vitals", True), ("imaging", False), ("genomic", False), ("mental_health", False)]],
    note="'What a doctor can see': 3 of 6 switchable folders on (4 of 7 with the locked emergency card)")
ins("identity.device",
    ["id", "user_id", "platform", "device_name", "bound_at", "last_seen_at", "last_ip_area", "last_city", "user_agent"],
    [[f"'{uid(170, 1)}'", f"'{ANJALI_U}'", "'web'", q("Pixel 7 · Chrome"), T("2026-08-20 09:00"), T("2026-10-17 15:50"), q("Pathanamthitta"), q("Pathanamthitta"), q("Chrome on Android (demo)")],
     [f"'{uid(170, 2)}'", f"'{ANJALI_U}'", "'android'", q("Samsung Galaxy A54 · CareFusion app"), T("2026-10-15 21:10"), T("2026-10-15 21:10"), q("Pathanamthitta"), q("Pathanamthitta"), q("CareFusion app (demo)")],
     [f"'{uid(170, 3)}'", f"'{ANJALI_U}'", "'web'", q("Windows laptop · Edge"), T("2026-10-02 10:44"), T("2026-10-02 10:44"), q("Kochi"), q("Kochi"), q("Edge on Windows (demo)")]],
    note="3 signed-in devices (no key secret is stored; the rotating key is generated at run time)")

# ----------------------------------------------------------------------------------------------
# 13. Reviews, replies, helpful votes
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Reviews =====")
REVIEWS = [  # serial, rater person id, hospital n, dept (hospital n, name) or None, stars, date, text, tags, reply(author, text, date), helpful
    (1, uid(190, 1), 1, (1, B.GM), 5, "2026-10-12 18:00",
     "Dr. Arun Nair explained my sugar report slowly and in Malayalam. The token system meant I waited only 20 minutes.",
     ["explains clearly", "short wait"], (MEERA, "Thank you. We will share this with the OP team.", "2026-10-13 10:00"), 18),
    (2, uid(190, 2), 1, None, 4, "2026-10-10 17:00",
     "Medicines were ready when the app said. One brand was out of stock, but they gave an approved substitute.",
     ["Pharmacy", "medicines ready"], None, 9),
    (3, PP(1120), 3, (3, "Diabetology"), 5, "2026-10-08 12:00",
     "Dr. Lakshmi Varma checked my feet and eyes in one visit. Clean ward, helpful nurses.",
     ["clean ward", "kind staff"], None, 14),
    (4, uid(190, 3), 1, (1, "Laboratory"), 3, "2026-10-06 13:00",
     "Results came on the app the same afternoon, but the sample queue was long at 8 am.",
     ["fast results", "long queue"], (RAHUL, "We have opened a second collection counter from 7:30.", "2026-10-07 11:00"), 6),
    (5, uid(190, 4), 10, (10, B.GM), 5, "2026-10-02 11:00",
     "Walk-in dengue test with no waiting. The ASHA worker helped my mother register on the app.",
     ["no waiting", "helpful staff"], None, 11),
    (6, PP(1002), 2, None, 2, "2026-09-29 19:00",
     "Good doctor, but the X-ray machine was down and I had to come back the next day.",
     ["equipment down", "Orthopaedics"], None, 4),
    (7, uid(190, 5), 1, (1, "Radiology"), 4, "2026-09-25 15:00",
     "Chest X-ray done quickly. The report was easy to read with the AI summary marked clearly as not final.",
     ["quick", "clear report"], None, 7),
    (8, uid(190, 6), 3, (3, "Paediatrics"), 5, "2026-09-20 10:00",
     "Diya's vaccine was on time and the nurse explained side effects. Reminder came the day before.",
     ["on time", "explained side effects"], None, 12),
]
rows = []
for s, rater, h, dept, stars, when, text, tags, reply, helpful in REVIEWS:
    rows.append([f"'{uid(160, s)}'", f"'{rater}'", "'hospital'", f"'{HOSP(h)}'", str(stars), q(text), "'published'",
                 f"'{DEPT(*dept)}'" if dept else "NULL", arr(tags), T(when)])
ins("engage.rating", ["id", "rater_person_id", "target_type", "target_id", "stars", "comment", "moderation_status", "department_id", "tags", "created_at"],
    rows, note="8 hospital reviews (the 1284-review totals of the design are static; the screen should aggregate these rows)")
rows = []
for s, rater, h, dept, stars, when, text, tags, reply, helpful in REVIEWS:
    if reply:
        rows.append([f"'{uid(161, s)}'", f"'{uid(160, s)}'", f"'{reply[0]}'", q(reply[1]), T(reply[2])])
ins("engage.rating_reply", ["id", "rating_id", "author_user_id", "body", "created_at"], rows,
    note="replies by Dr Meera Krishnan and the lab; the 'Hospital admin' reply to review 6 (Adoor) is not seeded: Adoor has no admin account")
# helpful votes from citizen accounts of the base, never the reviewer
voter_pool = [s for (s, slug, name, age, sex, blood, town, note) in B.CITIZENS
              if s not in B.MINORS and s not in (1, 1120, 1002)] + [5000 + d[0] for d in B.DOCTORS]
rows = []
for s, rater, h, dept, stars, when, text, tags, reply, helpful in REVIEWS:
    voters = [v for v in voter_pool if PP(v) != rater and v < 5000][: helpful - 0]
    if len(voters) < helpful:
        voters += [v for v in voter_pool if v >= 5000][: helpful - len(voters)]
    for v in voters[:helpful]:
        rows.append([f"'{uid(160, s)}'", f"'{UU(v)}'", T(when)])
ins("engage.rating_helpful", ["rating_id", "user_id", "at"], rows, note="helpful votes (counts as in the design: 18, 9, 14, 6, 11, 4, 7, 12)")

# ----------------------------------------------------------------------------------------------
# 14. Complaints
# ----------------------------------------------------------------------------------------------
w("\n-- ===== Complaints =====")
CMP = [  # serial, ref, title, category, about_type, hospital n/None, pharmacy n/None, place, filed, status, assigned, resolved, body, sev, esc, events
    (1, "CMP-0412", "Long OP wait", "op_services", "hospital", 1, None, "Demo General Hospital", "2026-10-14 14:02", "assigned", MEERA, None,
     "Waited 2 h 40 min at OP block 2",
     [("filed", None, "Waited 2 h 40 min at OP block 2", "2026-10-14 14:02", ANJALI_U),
      ("note", MEERA, "Reviewing OP token data for that day", "2026-10-15 10:20", MEERA)]),
    (2, "CMP-0377", "Medicine out of stock", "pharmacy", "pharmacy", None, 1, "Demo Hospital Pharmacy", "2026-09-28 11:40", "resolved", SUMA, "2026-10-02 16:00",
     "Atorvastatin unavailable twice",
     [("filed", None, "Atorvastatin unavailable twice", "2026-09-28 11:40", ANJALI_U),
      ("note", None, "Stock reorder approved", "2026-09-29 09:15", SUMA),
      ("resolved", None, "Stock now shown live in the medicine finder", "2026-10-02 16:00", SUMA)]),
    (3, "CMP-0301", "Rude behaviour at registration", "staff_conduct", "hospital", 2, None, "Demo Taluk Hospital, Adoor", "2026-09-03 10:05", "resolved", None, "2026-09-06 12:30",
     "Rude behaviour at the registration counter",
     [("filed", None, "Rude behaviour at the registration counter", "2026-09-03 10:05", ANJALI_U),
      ("resolved", None, "Hospital admin: staff counselled; apology sent", "2026-09-06 12:30", None)]),
    (4, "CMP-0266", "Lab report delayed", "lab", "hospital", 10, None, "PHC Konni", "2026-08-12 09:00", "resolved", None, "2026-08-13 15:20",
     "Lab report delayed",
     [("filed", None, "Lab report delayed", "2026-08-12 09:00", ANJALI_U),
      ("resolved", None, "Lab supervisor: report uploaded; delay due to courier", "2026-08-13 15:20", None)]),
]
rows = []
for s, ref, title, cat, at, h, ph, place, filed, status, assigned, resolved, body, evs in CMP:
    about_id = HOSP(h) if h else uid(12, ph)
    rows.append([f"'{uid(162, s)}'", f"'{ANJALI_P}'", q(at), f"'{about_id}'", PATHANAMTHITTA, q(body), q(status),
                 f"'{assigned}'" if assigned else "NULL", q(evs[-1][2]) if status == "resolved" else "NULL", T(filed), q(ref), q(title), q(cat), "'normal'",
                 f"'{HOSP(h)}'" if h else "NULL", f"'{uid(12, ph)}'" if ph else "NULL", q(place),
                 f"({T(filed)}::timestamptz + interval '7 days')", "0", T(resolved) if resolved else "NULL", T(evs[-1][3])])
w("\n-- the complaint insert trigger writes an automatic 'filed' event with a random id and the current time;")
w("-- it is switched off for this statement so that the timeline below (fixed ids and times) is the only one")
w("ALTER TABLE engage.complaint DISABLE TRIGGER complaint_timeline;")
ins("engage.complaint",
    ["id", "raised_by_person_id", "about_type", "about_id", "district_id", "body", "status", "assigned_to_user_id", "resolution", "created_at",
     "ref_no", "title", "category", "severity", "hospital_id", "pharmacy_id", "place_text", "due_at", "escalation_level", "resolved_at", "updated_at"],
    rows, note="4 complaints (CMP-0412 under review, three resolved); next new ref in the app is CMP-0417")
w("ALTER TABLE engage.complaint ENABLE TRIGGER complaint_timeline;")
rows = []
for s, ref, title, cat, at, h, ph, place, filed, status, assigned, resolved, body, evs in CMP:
    for k, (kind, actor, text, when, who) in enumerate(evs, start=1):
        actor_id = who if who else None
        rows.append([f"'{uid(163, s * 10 + k)}'", f"'{uid(162, s)}'", f"'{actor_id}'" if actor_id else "NULL", q(kind), q(text), T(when)])
ins("engage.complaint_event", ["id", "complaint_id", "actor_user_id", "kind", "text", "created_at"], rows)

w("\nCOMMIT;")

OUT.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {OUT} ({len(out)} lines)")
for t, c in sorted(counts.items()):
    print(f"{t}: {c}")

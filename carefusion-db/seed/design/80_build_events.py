#!/usr/bin/env python3
"""
Generator for seed/design/80_events.sql : the cross-role EVENTS FEED, read state, citizen "My care" notifications and
audit rows for access sessions. Kinds 0800-0899 (see IDS.md).

    python3 carefusion-db/seed/design/80_build_events.py

Deterministic (no clock, no randomness). The output only INSERTs; every statement is idempotent
(ON CONFLICT DO NOTHING / WHERE NOT EXISTS) so SEED_FORCE=1 re-runs change nothing.

Design decisions (details in the file header of 80_events.sql):
  * The 10 design events (CF_SEED s1..s10) are written as literal rows, one row per AUDIENCE, because an event has ONE href
    and the apps are different routes (/pharmacist?section=queue for the pharmacist, /citizen/medicines for the citizen).
  * created_at follows the seeded ENTITY (appointment requested, prescription signed, ...), not the design's literal clock time,
    so no event is older than the thing it reports. Design time -> seeded time is listed in the file header.
  * Derived history is written with INSERT ... SELECT from the real tables, so titles and texts always match the rows.
  * Government roles never get a patient-linked event (CHECK event_patient_not_to_gov): they get a second, NON-identifying row
    (no patient, no name, no entity pointer), one row per console level (each console has its own route).
"""
from __future__ import annotations

from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "80_events.sql"

BOOK = "'cfd00000-0010-4000-8000-000000000001'"     # Demo General Hospital
PHARM1 = "'cfd00000-0012-4000-8000-000000000001'"   # Demo Hospital Pharmacy
PATH_D = "util.seed_district('Pathanamthitta')"
ANJALI_P = "'cfd00000-0001-4000-8000-000000000001'"
THOMAS_K_P = "'cfd00000-0001-4000-8000-000000001001'"


def U(n: int) -> str:                    # identity.app_user literal (primary account = person serial)
    return f"'cfd00000-0002-4000-8000-{n:012d}'"


def EID(kind: int, serial: int) -> str:
    return f"'cfd00000-{kind:04d}-4000-8000-{serial:012d}'"


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def ts(s: str) -> str:
    return f"'{s}:00+05:30'::timestamptz"


def roles(*r: str) -> str:
    return "ARRAY[" + ", ".join(f"'{x}'" for x in r) + "]::engage.event_role[]"


# console levels: (audience slot, role, route)
GOV = [(5, "district", "/district-admin"), (6, "state", "/state-admin"), (7, "zonal", "/zonal-admin"), (8, "central", "/central-admin")]

COLS = ("id, type, from_role, created_by_user_id, to_roles, to_user_id, title, text, href, entity_type, entity_id, "
        "patient_person_id, hospital_id, pharmacy_id, district_id, created_at")

out: list[str] = []
counts: dict[str, int] = {}


def w(s: str = "") -> None:
    out.append(s)


def count(k: str, n: int = 1) -> None:
    counts[k] = counts.get(k, 0) + n


# ---------------------------------------------------------------------------------------------- design events (literal)
DESIGN_ROWS: list[str] = []


def design(kind_serial: int, aud: int, typ: str, frm: str, by: int | None, to: list[str], title: str, text: str, href: str,
           etype: str | None, eid: str | None, pat: str | None, hosp: str | None, pharm: str | None, dist: str | None, at: str) -> None:
    DESIGN_ROWS.append(
        "  (" + ", ".join([
            EID(801, kind_serial * 10 + aud), f"'{typ}'", f"'{frm}'", U(by) if by else "NULL", roles(*to), "NULL",
            q(title), q(text), q(href), q(etype) if etype else "NULL", eid or "NULL", pat or "NULL", hosp or "NULL",
            pharm or "NULL", dist or "NULL", ts(at)]) + ")")
    count("engage.event")


def gov_rows(s: int, typ: str, frm: str, by: int | None, title: str, text: str, section: str, hosp: str | None, at: str) -> None:
    """The non-identifying copy for the four console levels (no patient, no entity pointer)."""
    for slot, role, route in GOV:
        design(s, slot, typ, frm, by, [role], title, text, f"{route}?section={section}", None, None, None, hosp, None, None, at)


def build_design() -> None:
    # s1 booking: Anjali's booking for Wed 21 Oct 10:30 (appointment 0141-4, requested 14 Oct 09:50)
    t, x = "New booking · Anjali Menon", "Wed 21 Oct, 10:30 · follow-up · token 16 · DEMO-APT-58213"
    a = EID(141, 4)
    design(1, 1, "booking", "citizen", 1, ["doctor"], t, x, "/doctor?section=schedule", "engage.appointment", a, ANJALI_P, BOOK, None, None, "2026-10-14 09:50")
    design(1, 2, "booking", "citizen", 1, ["hospitaladmin"], t, x, "/hospital-admin?section=overview", "engage.appointment", a, ANJALI_P, BOOK, None, None, "2026-10-14 09:50")
    gov_rows(1, "booking", "citizen", None, "New booking · Demo General Hospital", "Wed 21 Oct, 10:30 · follow-up", "overview", BOOK, "2026-10-14 09:50")

    # s2 prescription: RX-DEMO-55120 signed 14:30, sent to the pharmacy 14:31
    t = "e-Signed prescription · Anjali Menon"
    x = "Metformin 500 mg ×60, Atorvastatin 10 mg ×30, Vitamin D3 60000 IU ×8 · Dr. Arun Nair · RX-DEMO-55120"
    a = EID(211, 1)
    design(2, 1, "prescription", "doctor", 2, ["pharmacist"], t, x, "/pharmacist?section=queue", "pharmacy.prescription", a, ANJALI_P, BOOK, PHARM1, None, "2026-10-17 14:31")
    design(2, 2, "prescription", "doctor", 2, ["citizen"], t, x, "/citizen/medicines", "pharmacy.prescription", a, ANJALI_P, BOOK, PHARM1, None, "2026-10-17 14:31")

    # s3 lab order: the lipid profile order ORD-DEMO-0001 (HbA1c is the separate order ORD-DEMO-0002 of 2 Oct)
    design(3, 1, "lab-order", "doctor", 2, ["labtech"], "Lab order · Lipid profile", "Anjali Menon · routine · ORD-DEMO-0001 · Dr. Arun Nair",
           "/lab-tech?section=home", "records.clinical_order", EID(210, 1), ANJALI_P, BOOK, None, None, "2026-10-17 10:07")

    # s4 lab result: lipid profile released 11:05 by Rahul Varghese
    t, x = "Result ready · Lipid profile", "LDL 142 mg/dL (high) · uploaded by Rahul Varghese"
    a = EID(304, 1)
    design(4, 1, "lab-result", "labtech", 4, ["doctor"], t, x, "/doctor?section=orders", "lab.result", a, ANJALI_P, BOOK, None, None, "2026-10-17 11:05")
    design(4, 2, "lab-result", "labtech", 4, ["citizen"], t, x, "/citizen/documents", "lab.result", a, ANJALI_P, BOOK, None, None, "2026-10-17 11:05")
    gov_rows(4, "lab-result", "labtech", None, "Result released · Demo General Hospital Central Lab", "One lab report released to a doctor and the patient", "overview", BOOK, "2026-10-17 11:05")

    # s5 break-glass: Dr. Sreeja Paul / Thomas Kurian, unconscious on arrival, 16 Oct 03:12 (session 0510-1)
    a = EID(510, 1)
    design(5, 1, "break-glass", "doctor", 101, ["hospitaladmin"], "Emergency access used",
           "Dr. Sreeja Paul · Thomas Kurian · unconscious on arrival", "/hospital-admin?section=breakglass",
           "access.access_session", a, THOMAS_K_P, BOOK, None, None, "2026-10-16 03:12")
    # the patient himself is told (never Anjali): no other person's name in his text
    design(5, 2, "break-glass", "doctor", 101, ["citizen"], "Emergency access used",
           "Dr. Sreeja Paul opened your emergency card at Demo General Hospital · you were unconscious on arrival", "/citizen/access",
           "access.access_session", a, THOMAS_K_P, BOOK, None, None, "2026-10-16 03:12")
    gov_rows(5, "break-glass", "doctor", None, "Emergency access used", "Demo General Hospital · casualty · hospital review open", "audit", BOOK, "2026-10-16 03:12")

    # s6 alert: heatwave 0606-101 (district medical office). Staff roles only: citizens already get this alert from engage.health_alert
    # (a citizen copy would show the heatwave twice on the Alerts screen).
    a = EID(606, 101)
    for aud, role, href in ((1, "doctor", "/doctor?section=home"), (2, "nurse", "/nurse?section=alerts"), (3, "hospitaladmin", "/hospital-admin?section=overview")):
        design(6, aud, "alert", "district", 9, [role], "Heatwave — Pathanamthitta", "Stay indoors 12:00–16:00 · District health office", href,
               "engage.health_alert", a, None, None, None, PATH_D, "2026-10-17 09:00")

    # s7 vitals-critical: Thomas Kurian, bed 7, NEWS 7 (escalation 0233-12 at 10:29), doctor and nurse only
    a = EID(233, 12)
    t, x = "Early-warning score 7 · Bed 7", "Thomas Kurian · SpO₂ 91% · escalated by Lekha Pillai"
    design(7, 1, "vitals-critical", "nurse", 3, ["doctor"], t, x, "/doctor?section=session", "inpatient.escalation", a, THOMAS_K_P, BOOK, None, None, "2026-10-17 10:29")
    design(7, 2, "vitals-critical", "nurse", 3, ["nurse"], t, x, "/nurse?section=alerts", "inpatient.escalation", a, THOMAS_K_P, BOOK, None, None, "2026-10-17 10:29")

    # s8 dispensed: RX-DEMO-55120 ready at 15:42 (verified 15:36)
    t, x = "Ready to collect · Demo Hospital Pharmacy", "Anjali Menon · Metformin, Atorvastatin, Vitamin D3 · Joseph Mathew"
    a = EID(211, 1)
    design(8, 1, "dispensed", "pharmacist", 6, ["citizen"], t, x, "/citizen/medicines", "pharmacy.prescription", a, ANJALI_P, None, PHARM1, None, "2026-10-17 15:42")
    design(8, 2, "dispensed", "pharmacist", 6, ["pharmacyadmin"], t, x, "/pharmacy-admin?section=overview", "pharmacy.prescription", a, ANJALI_P, None, PHARM1, None, "2026-10-17 15:42")

    # s9 complaint: CMP-0412 (the complaint is about the hospital, so no patient link; the sender sees it as sender)
    a = EID(162, 1)
    t, x = "Complaint filed · long OP wait", "Demo General Hospital · ticket CMP-0412"
    design(9, 1, "complaint", "citizen", 1, ["hospitaladmin"], t, x, "/hospital-admin?section=complaints", "engage.complaint", a, None, BOOK, None, None, "2026-10-14 14:02")
    gov_rows(9, "complaint", "citizen", None, t, x, "overview", BOOK, "2026-10-14 14:02")

    # s10 blood request: B+ 2 units, surgery tomorrow 08:00 (request 0704-3). Citizens of the district see it (broadcast, no patient).
    a = EID(704, 3)
    t, x = "Blood needed · B+ · 2 units", "Demo General Hospital · surgery tomorrow 08:00"
    design(10, 1, "blood-request", "doctor", 2, ["citizen"], t, x, "/citizen/blood", "donation.blood_request", a, None, BOOK, None, PATH_D, "2026-10-17 14:30")
    gov_rows(10, "blood-request", "doctor", None, t, x, "blood", BOOK, "2026-10-17 14:30")


# ---------------------------------------------------------------------------------------------- derived history
def ser(alias: str, off: str = "0") -> str:
    return f"(right({alias}.id::text, 12)::bigint + {off})"


def eid_expr(kind: int, alias: str, aud: int, off: str = "0") -> str:
    return f"util.seed_uuid({kind}, {ser(alias, off)} * 10 + {aud})"


def UNAME(x: str) -> str:
    return f"(SELECT pp.full_name FROM identity.app_user uu JOIN identity.person pp ON pp.id = uu.person_id WHERE uu.id = {x})"


def reachable(p: str) -> str:
    """A citizen (or the guardian of a minor) can actually open this person's feed."""
    return (f"(EXISTS (SELECT 1 FROM identity.app_user cu WHERE cu.person_id = {p} AND cu.account_type = 'citizen' AND cu.status = 'active')"
            f" OR EXISTS (SELECT 1 FROM identity.citizen_profile cp WHERE cp.person_id = {p} AND cp.guardian_person_id IS NOT NULL))")


def citizen_user(p: str) -> str:
    return f"(SELECT cu.id FROM identity.app_user cu WHERE cu.person_id = {p} AND cu.account_type = 'citizen' ORDER BY cu.created_at LIMIT 1)"


def stmt(select_cols: list[str], frm: str, note: str) -> None:
    assert len(select_cols) == 16, (note, len(select_cols))
    w(f"-- {note}")
    w(f"INSERT INTO engage.event ({COLS})")
    w("SELECT " + ",\n       ".join(select_cols))
    w(f"FROM {frm}")
    w("ON CONFLICT (id) DO NOTHING;")
    w()


def gov_stmt(kind: int, alias: str, typ: str, frm_role: str, title: str, text: str, section: str, hosp: str, at: str,
             frm: str, note: str, off: str = "0") -> None:
    """Four non-identifying rows (one per console level) for each source row."""
    for slot, role, route in GOV:
        stmt([eid_expr(kind, alias, slot, off), q(typ), q(frm_role), "NULL", roles(role), "NULL", title, text, q(f"{route}?section={section}"),
              "NULL", "NULL", "NULL", hosp, "NULL", "NULL", at], frm, f"{note} ({role} console)")


def build_derived() -> None:
    w("-- ---------- derived history (INSERT ... SELECT from the seeded rows; ids = kind 08xx + entity serial * 10 + audience) ----------")
    w("-- audience slots: 1 first role, 2 second role, 3 third role, 5 district, 6 state, 7 zonal, 8 central console")
    w()

    # booking (kind 0802): the other confirmed bookings (Wed 21 Oct and the 17 Oct OP list)
    frm = ("engage.appointment a JOIN engage.appointment_slot sl ON sl.id = a.slot_id JOIN identity.person p ON p.id = a.citizen_person_id\n"
           "WHERE a.status = 'confirmed' AND a.id <> " + EID(141, 4) + " AND (a.id::text LIKE 'cfd00000-0141-%' OR a.id::text LIKE 'cfd00000-0203-%')")
    off = "(CASE substr(a.id::text, 10, 4) WHEN '0203' THEN 100 ELSE 0 END)"
    for aud, role, href in ((1, "doctor", "/doctor?section=schedule"), (2, "hospitaladmin", "/hospital-admin?section=overview")):
        stmt([eid_expr(802, "a", aud, off), "'booking'", "'citizen'", citizen_user("a.citizen_person_id"), roles(role), "NULL",
              "'New booking · ' || p.full_name",
              "to_char(lower(sl.during) AT TIME ZONE 'Asia/Kolkata', 'Dy DD Mon, HH24:MI') || ' · ' || replace(a.visit_type, '_', '-') || ' · token ' || a.token_no || ' · ' || a.booking_ref",
              q(href), "'engage.appointment'", "a.id", "a.citizen_person_id", "sl.hospital_id", "NULL", "NULL", "a.requested_at"],
             frm, f"booking -> {role}")

    # prescription (kind 0803): every prescription since 1 Sep except the design one; pharmacist copy, citizen copy
    pfrm = ("pharmacy.prescription p JOIN identity.person pat ON pat.id = p.patient_person_id\n"
            "LEFT JOIN pharmacy.rx_fulfilment f ON f.prescription_id = p.id\n"
            "LEFT JOIN LATERAL (SELECT string_agg(m.generic_name || ' ×' || trim_scale(i.quantity)::text, ', ' ORDER BY i.id) AS txt\n"
            "                     FROM pharmacy.prescription_item i JOIN pharmacy.medicine m ON m.id = i.medicine_id WHERE i.prescription_id = p.id) it ON true\n"
            "WHERE p.id <> " + EID(211, 1) + " AND p.status <> 'cancelled' AND p.issued_at >= '2026-09-01+05:30'")
    poff = "(CASE substr(p.id::text, 10, 4) WHEN '0415' THEN 100 ELSE 0 END)"
    rx_pharm = "COALESCE(f.pharmacy_id, (SELECT d.pharmacy_id FROM pharmacy.prescription_delivery d WHERE d.prescription_id = p.id LIMIT 1))"
    rx_text = "COALESCE(it.txt, 'e-prescription') || ' · ' || " + UNAME("p.doctor_user_id") + " || ' · ' || p.rx_number"
    stmt([eid_expr(803, "p", 1, poff), "'prescription'", "'doctor'", "p.doctor_user_id", roles("pharmacist"), "NULL",
          "'e-Signed prescription · ' || pat.full_name", rx_text, q("/pharmacist?section=queue"), "'pharmacy.prescription'", "p.id",
          "p.patient_person_id", "p.hospital_id", rx_pharm, "NULL", "p.issued_at + interval '1 minute'"],
         pfrm + " AND " + rx_pharm + " IS NOT NULL", "prescription -> pharmacist")
    stmt([eid_expr(803, "p", 2, poff), "'prescription'", "'doctor'", "p.doctor_user_id", roles("citizen"), "NULL",
          "'e-Signed prescription · ' || pat.full_name", rx_text, q("/citizen/medicines"), "'pharmacy.prescription'", "p.id",
          "p.patient_person_id", "p.hospital_id", rx_pharm, "NULL", "p.issued_at + interval '1 minute'"],
         pfrm + " AND " + reachable("p.patient_person_id") + " AND " + rx_pharm + " IS NOT NULL", "prescription -> citizen")

    # lab-order (0804) and imaging-order (0805): the 30 design orders (ORD-DEMO-00NN)
    ofrm = ("records.clinical_order o JOIN identity.person pat ON pat.id = o.patient_person_id\n"
            "WHERE o.order_type = '{t}' AND o.order_ref ~ '^ORD-DEMO-00[0-9]{{2}}$' AND o.id <> " + EID(210, 1))
    for kind, otype, typ, label, role, href in ((804, "lab", "lab-order", "Lab order", "labtech", "/lab-tech?section=home"),
                                                (805, "scan", "imaging-order", "Imaging order", "radiology", "/radiology-tech?section=worklist")):
        stmt([eid_expr(kind, "o", 1), f"'{typ}'", "'doctor'", "o.ordered_by_user_id", roles(role), "NULL",
              f"'{label} · ' || o.details", "pat.full_name || ' · ' || o.priority::text || ' · ' || o.order_ref || ' · ' || " + UNAME("o.ordered_by_user_id"),
              q(href), "'records.clinical_order'", "o.id", "o.patient_person_id", "o.hospital_id", "NULL", "NULL", "o.created_at"],
             ofrm.format(t=otype), f"{typ} -> {role}")

    # lab-result (0806): released results since 1 Oct except the design one
    rfrm = ("lab.result r JOIN records.clinical_order o ON o.id = r.order_id JOIN identity.person pat ON pat.id = r.patient_person_id\n"
            "WHERE r.status IN ('released', 'amended') AND r.id <> " + EID(304, 1) + " AND r.released_at >= '2026-10-01+05:30'\n"
            "  AND o.order_ref ~ '^ORD-DEMO-0[01][0-9]{2}$'")
    for aud, role, href, extra in ((1, "doctor", "/doctor?section=orders", ""), (2, "citizen", "/citizen/documents", " AND " + reachable("r.patient_person_id"))):
        stmt([eid_expr(806, "r", aud), "'lab-result'", "'labtech'", "r.released_by_user_id", roles(role), "NULL",
              "'Result ready · ' || o.details", "pat.full_name || ' · ' || o.order_ref || ' · released by ' || " + UNAME("r.released_by_user_id"),
              q(href), "'lab.result'", "r.id", "r.patient_person_id", "o.hospital_id", "NULL", "NULL", "r.released_at"],
             rfrm + extra, f"lab-result -> {role}")

    # imaging-result (0807): uploaded / awaiting report / reported studies of 2026; the citizen only after the report
    sfrm = ("imaging.study s JOIN records.clinical_order o ON o.id = s.order_id JOIN identity.person pat ON pat.id = s.patient_person_id\n"
            "WHERE s.status IN ('uploaded', 'awaiting_report', 'reported') AND s.completed_at >= '2026-01-01+05:30'")
    stmt([eid_expr(807, "s", 1), "'imaging-result'", "'radiology'", "s.performed_by_user_id", roles("doctor"), "NULL",
          "'Images ready · ' || o.details", "pat.full_name || ' · ' || o.order_ref || ' · ' || s.modality || CASE WHEN s.status = 'reported' THEN ' · report signed' ELSE ' · report awaited' END",
          q("/doctor?section=orders"), "'imaging.study'", "s.id", "s.patient_person_id", "s.hospital_id", "NULL", "NULL", "s.completed_at"],
         sfrm, "imaging-result -> doctor")
    stmt([eid_expr(807, "s", 2), "'imaging-result'", "'radiology'", "s.performed_by_user_id", roles("citizen"), "NULL",
          "'Images ready · ' || o.details", "o.order_ref || ' · ' || s.modality || ' · the report is signed by your doctor'",
          q("/citizen/documents"), "'imaging.study'", "s.id", "s.patient_person_id", "s.hospital_id", "NULL", "NULL", "s.completed_at + interval '15 minutes'"],
         sfrm + " AND s.status = 'reported' AND " + reachable("s.patient_person_id"), "imaging-result -> citizen (only after the doctor's report)")

    # break-glass (0808): every other break-glass session. Hospital admin: details. Patient: no other name. Consoles: no names (since 1 Oct).
    bfrm = ("access.access_session s JOIN access.emergency_access e ON e.session_id = s.id JOIN identity.person pat ON pat.id = s.patient_person_id\n"
            "WHERE s.mode = 'break_glass' AND s.id <> " + EID(510, 1))
    boff = "(CASE substr(s.id::text, 10, 4) WHEN '0201' THEN 1000 WHEN '0510' THEN 2000 ELSE 0 END)"
    dname = UNAME("s.user_id")
    stmt([eid_expr(808, "s", 1, boff), "'break-glass'", "'doctor'", "s.user_id", roles("hospitaladmin"), "NULL", "'Emergency access used'",
          dname + " || ' · ' || CASE WHEN pat.is_unidentified THEN pat.temp_label ELSE pat.full_name END || ' · ' || left(coalesce(e.break_glass_reason, 'emergency'), 90)",
          q("/hospital-admin?section=breakglass"), "'access.access_session'", "s.id", "s.patient_person_id", BOOK, "NULL", "NULL", "s.started_at"],
         bfrm, "break-glass -> hospital admin")
    stmt([eid_expr(808, "s", 2, boff), "'break-glass'", "'doctor'", "s.user_id", roles("citizen"), "NULL", "'Emergency access used'",
          dname + " || ' opened your emergency card at Demo General Hospital · only the emergency card, allergies and medicines were shown'",
          q("/citizen/access"), "'access.access_session'", "s.id", "s.patient_person_id", BOOK, "NULL", "NULL", "s.started_at"],
         bfrm + " AND NOT pat.is_unidentified AND " + reachable("s.patient_person_id"), "break-glass -> the patient (no other person's name)")
    gov_stmt(808, "s", "break-glass", "doctor", "'Emergency access used'", "'Demo General Hospital · emergency access under review'", "audit", BOOK,
             "s.started_at", bfrm + " AND s.started_at >= '2026-10-01+05:30'", "break-glass, non-identifying", boff)

    # alert (0809): the other sent district alerts, to the staff of the district (citizens read them from engage.health_alert)
    afrm = ("engage.health_alert a\n"
            "WHERE a.id IN (" + ", ".join([EID(606, 104), EID(150, 2), EID(150, 3)]) + ") AND a.status = 'sent'")
    aoff = "(CASE substr(a.id::text, 10, 4) WHEN '0150' THEN 1000 ELSE 0 END)"
    for aud, role, href in ((1, "doctor", "/doctor?section=home"), (2, "nurse", "/nurse?section=alerts"), (3, "hospitaladmin", "/hospital-admin?section=overview")):
        stmt([eid_expr(809, "a", aud, aoff), "'alert'", "'district'", "a.issued_by_user_id", roles(role), "NULL", "a.title", "left(a.body, 200)", q(href),
              "'engage.health_alert'", "a.id", "NULL", "NULL", "NULL", "a.district_id", "COALESCE(a.sent_at, a.starts_at)"],
             afrm, f"alert -> {role}")

    # vitals-critical (0810): the other escalations of 17 Oct
    vfrm = ("inpatient.escalation x JOIN identity.person pat ON pat.id = x.patient_person_id JOIN access.admission ad ON ad.id = x.admission_id\n"
            "JOIN org.bed bd ON bd.id = ad.bed_id\n"
            "WHERE x.id <> " + EID(233, 12) + " AND x.paged_at >= '2026-10-17+05:30' AND x.news_score >= 5")
    for aud, role, href in ((1, "doctor", "/doctor?section=session"), (2, "nurse", "/nurse?section=alerts")):
        stmt([eid_expr(810, "x", aud), "'vitals-critical'", "'nurse'", U(3), roles(role), "NULL",
              "'Early-warning score ' || x.news_score || ' · Bed ' || bd.bed_no", "pat.full_name || ' · paged ' || replace(x.paged_role, '_', ' ')",
              q(href), "'inpatient.escalation'", "x.id", "x.patient_person_id", "ad.hospital_id", "NULL", "NULL", "x.paged_at"],
             vfrm, f"vitals-critical -> {role}")

    # dispensed / collected (0811)
    dfrm = ("pharmacy.rx_fulfilment f JOIN pharmacy.prescription p ON p.id = f.prescription_id JOIN identity.person pat ON pat.id = p.patient_person_id\n"
            "JOIN org.pharmacy ph ON ph.id = f.pharmacy_id\n"
            "LEFT JOIN LATERAL (SELECT string_agg(m.generic_name, ', ' ORDER BY i.id) AS txt FROM pharmacy.prescription_item i\n"
            "                     JOIN pharmacy.medicine m ON m.id = i.medicine_id WHERE i.prescription_id = p.id) it ON true\n"
            "WHERE p.id <> " + EID(211, 1) + " AND f.ready_at >= '2026-10-01+05:30'")
    doff = "(CASE substr(p.id::text, 10, 4) WHEN '0415' THEN 100 ELSE 0 END)"
    dtext = "pat.full_name || ' · ' || COALESCE(it.txt, 'medicines') || ' · ' || " + UNAME("f.verified_by_user_id")

    def dsel(pk: str, aud: int, typ: str, role: str, title: str, text: str, href: str, at: str) -> list[str]:
        return [eid_expr(811, "p", aud, doff), f"'{typ}'", "'pharmacist'", "f.verified_by_user_id", roles(role), "NULL", title, text, q(href),
                "'pharmacy.prescription'", "p.id", "p.patient_person_id", "NULL", "f.pharmacy_id", "NULL", at]

    stmt(dsel("p", 1, "dispensed", "citizen", "'Ready to collect · ' || ph.name", dtext, "/citizen/medicines", "f.ready_at"),
         dfrm + " AND " + reachable("p.patient_person_id"), "dispensed -> citizen")
    stmt(dsel("p", 2, "dispensed", "pharmacyadmin", "'Ready to collect · ' || ph.name", dtext, "/pharmacy-admin?section=overview", "f.ready_at"),
         dfrm + " AND f.pharmacy_id = " + PHARM1, "dispensed -> pharmacy admin")
    stmt(dsel("p", 3, "collected", "citizen", "'Medicines collected · ' || ph.name", dtext, "/citizen/medicines", "f.collected_at"),
         dfrm + " AND f.collected_at IS NOT NULL AND " + reachable("p.patient_person_id"), "collected -> citizen")

    # complaint (0812): hospital complaints of October (hospital admin copy + consoles) and the resolutions told to the citizen
    cfrm = ("engage.complaint c\nWHERE c.id <> " + EID(162, 1) + " AND c.hospital_id = " + BOOK + " AND c.created_at >= '2026-10-01+05:30'")
    coff = "(CASE substr(c.id::text, 10, 4) WHEN '0511' THEN 1000 WHEN '0622' THEN 2000 ELSE 0 END)"
    stmt([eid_expr(812, "c", 1, coff), "'complaint'", "'citizen'", citizen_user("c.raised_by_person_id"), roles("hospitaladmin"), "NULL",
          "'Complaint filed · ' || lower(COALESCE(c.title, 'complaint'))", "'Demo General Hospital · ticket ' || c.ref_no", q("/hospital-admin?section=complaints"),
          "'engage.complaint'", "c.id", "NULL", "c.hospital_id", "NULL", "NULL", "c.created_at"], cfrm, "complaint -> hospital admin")
    gov_stmt(812, "c", "complaint", "citizen", "'Complaint filed · ' || lower(COALESCE(c.title, 'complaint'))", "'Demo General Hospital · ticket ' || c.ref_no", "overview", BOOK,
             "c.created_at", cfrm, "complaint, non-identifying", coff)
    ufrm = ("engage.complaint c\nWHERE c.status = 'resolved' AND c.resolved_at IS NOT NULL AND c.id <> " + EID(162, 1)
            + " AND " + citizen_user("c.raised_by_person_id") + " IS NOT NULL")
    stmt([eid_expr(812, "c", 3, coff), "'complaint-update'", "'hospitaladmin'", "NULL", roles("citizen"), citizen_user("c.raised_by_person_id"),
          "'Complaint resolved · ' || c.ref_no", "COALESCE(c.title, 'Your complaint') || ' · ' || COALESCE(left(c.resolution, 120), 'resolved by the facility')",
          q("/citizen/complaints"), "'engage.complaint'", "c.id", "NULL", "c.hospital_id", "NULL", "NULL", "c.resolved_at"],
         ufrm, "complaint-update -> the citizen who filed it (direct)")

    # blood-request (0813) and blood-response (0814)
    qfrm = "donation.blood_request r JOIN org.hospital h ON h.id = r.hospital_id\nWHERE r.id <> " + EID(704, 3)
    stmt([eid_expr(813, "r", 1), "'blood-request'", "'doctor'", "r.requested_by_user_id", roles("citizen"), "NULL",
          "'Blood needed · ' || r.blood_group::text || ' · ' || r.units || CASE WHEN r.units = 1 THEN ' unit' ELSE ' units' END",
          "h.name || ' · ' || r.urgency::text", q("/citizen/blood"), "'donation.blood_request'", "r.id", "NULL", "r.hospital_id", "NULL", PATH_D, "r.created_at"],
         qfrm, "blood-request -> citizens of the district")
    gov_stmt(813, "r", "blood-request", "doctor", "'Blood needed · ' || r.blood_group::text || ' · ' || r.units || CASE WHEN r.units = 1 THEN ' unit' ELSE ' units' END",
             "h.name || ' · ' || r.urgency::text", "blood", "r.hospital_id", "r.created_at", qfrm, "blood-request, non-identifying")
    resp = ("donation.blood_request_response rr JOIN donation.blood_request r ON r.id = rr.request_id JOIN org.hospital h ON h.id = r.hospital_id\n"
            "WHERE rr.response IS NOT NULL AND rr.responded_at IS NOT NULL")
    rid = "util.seed_uuid(814, right(rr.request_id::text, 12)::bigint * 10000 + right(rr.donor_person_id::text, 4)::bigint)"
    stmt([rid, "'blood-response'", "'citizen'", citizen_user("rr.donor_person_id"), roles("doctor"), "NULL",
          "'Donor responded · ' || r.blood_group::text",
          "CASE rr.response::text WHEN 'will_donate' THEN 'A donor will donate' WHEN 'cannot' THEN 'A donor cannot donate now' ELSE 'A donor replied' END || ' · ' || h.name",
          q("/doctor?section=donors"), "'donation.blood_request'", "r.id", "NULL", "r.hospital_id", "NULL", "NULL", "rr.responded_at"],
         resp, "blood-response -> doctors (no donor name)")

    # referral (0815)
    ffrm = ("records.referral rf JOIN identity.person pat ON pat.id = rf.patient_person_id LEFT JOIN org.hospital th ON th.id = rf.to_hospital_id\n"
            "WHERE true")
    ftext = "pat.full_name || ' · routine · ' || COALESCE(th.name, 'colleague') || ' · ' || " + UNAME("rf.from_user_id")
    stmt([eid_expr(815, "rf", 1), "'referral'", "'doctor'", "rf.from_user_id", roles("citizen"), "NULL", "'Referral · ' || COALESCE(th.name, 'colleague')",
          ftext, q("/citizen/care"), "'records.referral'", "rf.id", "rf.patient_person_id", BOOK, "NULL", "NULL", "rf.created_at"],
         ffrm + " AND " + reachable("rf.patient_person_id"), "referral -> citizen")
    stmt([eid_expr(815, "rf", 2), "'referral'", "'doctor'", "rf.from_user_id", roles("hospitaladmin"), "NULL", "'Referral · ' || COALESCE(th.name, 'colleague')",
          ftext, q("/hospital-admin?section=overview"), "'records.referral'", "rf.id", "rf.patient_person_id", BOOK, "NULL", "NULL", "rf.created_at"],
         ffrm, "referral -> hospital admin")


# ---------------------------------------------------------------------------------------------- read state, notifications, audit
def build_read_state() -> None:
    w("-- ---------- read state: each demo persona has read everything older than the cutoff (the feed shows only 'today' as unread) ----------")
    w("-- Visibility is decided by the real function engage.event_visible under a temporary request context (transaction-local settings).")
    w("DO $$")
    w("DECLARE r record;")
    w("BEGIN")
    w("  FOR r IN SELECT * FROM (VALUES")
    w("      (1, 'citizen',        '2026-10-17 00:00:00+05:30'::timestamptz),")
    for n, acct in ((2, "doctor"), (3, "staff"), (4, "staff"), (5, "staff"), (6, "pharmacist"), (7, "pharmacy_admin"), (8, "hospital_admin")):
        w(f"      ({n}, '{acct}', '2026-10-17 06:00:00+05:30'::timestamptz),")
    w("      (9, 'district_admin', '2026-10-17 06:00:00+05:30'::timestamptz)")
    w("    ) AS v(serial, acct, cutoff) LOOP")
    w("    PERFORM set_config('app.user_id', util.seed_uuid(2, r.serial)::text, true);")
    w("    PERFORM set_config('app.person_id', util.seed_uuid(1, r.serial)::text, true);")
    w("    PERFORM set_config('app.account_type', r.acct, true);")
    w("    INSERT INTO engage.event_read (event_id, user_id, read_at)")
    w("    SELECT e.id, util.seed_uuid(2, r.serial), e.created_at + interval '30 minutes'")
    w("      FROM engage.event e")
    w("     WHERE e.id::text LIKE 'cfd00000-08%'")
    w("       AND e.created_at < r.cutoff")
    w("       AND engage.event_role_of(util.seed_uuid(2, r.serial)) = ANY (e.to_roles)")
    w("       AND engage.event_visible(e.to_roles, e.created_by_user_id, e.to_user_id, e.patient_person_id, e.hospital_id, e.pharmacy_id,")
    w("                                e.district_id, e.state_id, e.zone_id)")
    w("    ON CONFLICT DO NOTHING;")
    w("  END LOOP;")
    w("  -- Anjali also read the two blood requests of today (so her bell shows 3 unread: lab result, prescription, ready to collect, like the design)")
    w(f"  INSERT INTO engage.event_read (event_id, user_id, read_at) VALUES ({EID(801, 101)}, {U(1)}, '2026-10-17 14:40:00+05:30'),")
    w(f"    ({EID(813, 11)}, {U(1)}, '2026-10-17 11:40:00+05:30') ON CONFLICT DO NOTHING;   -- 813-11 = the Kottayam request of 11:20")
    w("  PERFORM set_config('app.user_id', '', true);")
    w("  PERFORM set_config('app.person_id', '', true);")
    w("  PERFORM set_config('app.account_type', '', true);")
    w("END $$;")
    w()


def build_notifications() -> None:
    w("-- ---------- citizen 'My care' notifications (engage.notification, channel in_app) that deliver Anjali's care events ----------")
    w("-- id = cfd00000-0816-...: serial = (event kind - 800) * 1000000 + event serial. event_id links the delivery to the event.")
    w("INSERT INTO engage.notification (id, user_id, channel, template_code, payload, status, created_at, sent_at, event_id, kind, priority)")
    w("SELECT util.seed_uuid(816, (substr(e.id::text, 10, 4)::int - 800) * 1000000 + right(e.id::text, 12)::bigint),")
    w(f"       {U(1)}, 'in_app',")
    w("       CASE e.type::text WHEN 'booking' THEN 'appointment_confirmed' WHEN 'prescription' THEN 'rx_signed' WHEN 'dispensed' THEN 'rx_ready'")
    w("                         WHEN 'collected' THEN 'rx_collected' WHEN 'lab-result' THEN 'lab_result_ready' WHEN 'imaging-result' THEN 'imaging_result_ready'")
    w("                         WHEN 'break-glass' THEN 'record_opened' ELSE 'blood_request' END,")
    w("       jsonb_build_object('title', e.title, 'body', e.text, 'action', jsonb_build_object('href', e.href,")
    w("            'label', CASE e.type::text WHEN 'dispensed' THEN 'See in Medicines' WHEN 'prescription' THEN 'Track at pharmacy' WHEN 'lab-result' THEN 'See in Documents'")
    w("                                       WHEN 'break-glass' THEN 'See access history' ELSE 'View' END)),")
    w("       'delivered', e.created_at, e.created_at + interval '1 minute', e.id, 'my_care',")
    w("       CASE WHEN e.type::text IN ('break-glass', 'blood-request') THEN 'high' ELSE 'normal' END")
    w("  FROM engage.event e")
    w(f"WHERE 'citizen' = ANY (e.to_roles) AND e.patient_person_id = {ANJALI_P} AND e.id::text LIKE 'cfd00000-08%'")
    w("   AND e.type::text IN ('booking', 'prescription', 'dispensed', 'collected', 'lab-result', 'imaging-result', 'break-glass')")
    w("   AND e.created_at >= '2026-10-01+05:30'")
    w("ON CONFLICT DO NOTHING;")
    w("-- the blood request is a broadcast (no patient), so it is added on its own")
    w("INSERT INTO engage.notification (id, user_id, channel, template_code, payload, status, created_at, sent_at, event_id, kind, priority)")
    w(f"SELECT util.seed_uuid(816, 1 * 1000000 + 101), {U(1)}, 'in_app', 'blood_request',")
    w("       jsonb_build_object('title', e.title, 'body', e.text, 'action', jsonb_build_object('href', e.href, 'label', 'See in Blood donation')),")
    w("       'delivered', e.created_at, e.created_at + interval '1 minute', e.id, 'my_care', 'high'")
    w(f"  FROM engage.event e WHERE e.id = {EID(801, 101)}")
    w("ON CONFLICT DO NOTHING;")
    w()


def build_audit() -> None:
    w("-- ---------- audit.activity_log rows for the access sessions that have none (10_, 20_, 50_ sessions) ----------")
    w("-- The hash chain is built by the trigger audit.chain_row (stream 33 = Kerala). The rows are appended in session-time order; idempotency is")
    w("-- by details->>'seed_key'. Scope columns and the hashed copy details.scope.hospital carry the same hospital (audit.check_scope_columns stays NULL).")
    w("-- Key / card sessions use the action 'access.session_open' (the citizen already reads them from access.v_access_history; the action does not match")
    w("-- the order-access view). Admission sessions: 'admission.open'. Break-glass: 'breakglass.open' (shown to the patient). Session 0510-2 is skipped:")
    w("-- 50_ has the audit row h-audit-3 for it.")
    base = ("FROM access.access_session s\n"
            "JOIN identity.app_user u ON u.id = s.user_id\n"
            "LEFT JOIN identity.doctor_profile dp ON dp.user_id = s.user_id\n"
            "LEFT JOIN identity.staff_profile sp ON sp.user_id = s.user_id\n"
            "CROSS JOIN LATERAL (SELECT COALESCE((SELECT ph.hospital_id FROM identity.doctor_posting_history ph\n"
            "                                      WHERE ph.user_id = s.user_id AND ph.valid @> s.started_at), dp.hospital_id, sp.hospital_id) AS hid) h\n"
            "WHERE (s.id::text LIKE 'cfd00000-0104-%' OR s.id::text LIKE 'cfd00000-0201-%' OR s.id::text LIKE 'cfd00000-0510-%')\n"
            "  AND s.id <> " + EID(510, 2))
    act = ("CASE s.mode::text WHEN 'break_glass' THEN 'breakglass.open' WHEN 'admission' THEN 'admission.open' ELSE 'access.session_open' END")
    summary = ("CASE s.mode::text WHEN 'break_glass' THEN 'Break-glass session opened' WHEN 'admission' THEN 'Admission-mode session opened'\n"
               "         ELSE 'Citizen key session opened · 30 min' END")
    w("INSERT INTO audit.activity_log (stream_id, occurred_at, user_id, account_type, action, entity_type, entity_id, patient_person_id, session_id, hospital_id, details)")
    w("SELECT 33, s.started_at, s.user_id, u.account_type, " + act + ", 'access_session', s.id, s.patient_person_id, s.id, h.hid,")
    w("       jsonb_build_object('seed_key', 'access:open:' || s.id, 'summary', " + summary + ",")
    w("                          'scope', jsonb_build_object('hospital', h.hid))")
    w(base)
    w("  AND NOT EXISTS (SELECT 1 FROM audit.activity_log l WHERE l.details ->> 'seed_key' = 'access:open:' || s.id)")
    w("ORDER BY s.started_at, s.id;")
    w("INSERT INTO audit.activity_log (stream_id, occurred_at, user_id, account_type, action, entity_type, entity_id, patient_person_id, session_id, hospital_id, details)")
    w("SELECT 33, s.ended_at, s.user_id, u.account_type, 'access.session_end', 'access_session', s.id, s.patient_person_id, s.id, h.hid,")
    w("       jsonb_build_object('seed_key', 'access:end:' || s.id, 'summary', 'Session ended · ' || COALESCE(s.ended_by::text, 'timeout'),")
    w("                          'scope', jsonb_build_object('hospital', h.hid))")
    w(base)
    w("  AND s.ended_at IS NOT NULL AND s.mode::text <> 'break_glass'")
    w("  AND NOT EXISTS (SELECT 1 FROM audit.activity_log l WHERE l.details ->> 'seed_key' = 'access:end:' || s.id)")
    w("ORDER BY s.ended_at, s.id;")
    w()


# ---------------------------------------------------------------------------------------------- file
HEADER = """-- =====================================================================
-- seed/design/80_events.sql : EVENTS FEED layer of the design seed (generated by 80_build_events.py; DO NOT EDIT BY HAND).
-- What it seeds: engage.event (the 10 design events s1..s10 with their audiences, plus derived history of bookings, prescriptions,
--   lab / imaging orders and results, break-glass sessions, alerts, early-warning escalations, dispensing, complaints, blood requests,
--   referrals), engage.event_read (bell state), Anjali's in-app "My care" notifications, and audit.activity_log rows for the access
--   sessions that had none. Kinds 0800-0899. Depends on 00_ .. 70_ and migrations 000-129. Idempotent (ON CONFLICT DO NOTHING / NOT EXISTS).
-- Demo "today" = Saturday 17 October 2026, IST. Synthetic data only; titles never carry an Aadhaar or ABHA number.
--
-- RULES THIS FILE FOLLOWS (migration 120)
--   * href is an in-app ROUTE PATH (apps/web: /citizen/..., /doctor?section=..., /hospital-admin?section=...), never a .dc.html file.
--     An event has ONE href, so an event for two apps is written as two rows (one per audience).
--   * Government roles (district, state, zonal, central) never receive an event with a patient (CHECK event_patient_not_to_gov). They get a
--     separate NON-identifying row (no patient, no name, no entity pointer), one per console level, for booking, lab-result, break-glass,
--     complaint and blood-request (the types the console feed shows).
--   * The break-glass event of the citizen says "Emergency access used" and names no other person. The design's s5 (Thomas Kurian) goes to the
--     hospital admin with details and to Thomas Kurian himself, never to Anjali; Anjali sees her own two break-glass sessions (21 Sep, 11 Oct).
--   * created_at follows the SEEDED ENTITY. Design clock time -> seeded time:
--       s1 booking 09:12 -> 14 Oct 09:50 (appointment 0141-4 requested)      s2 prescription 10:05 -> 17 Oct 14:31 (RX-DEMO-55120 signed 14:30)
--       s3 lab order 10:07 -> 17 Oct 10:07 (ORD-DEMO-0001, lipid profile)       s4 lab result 11:05 -> 17 Oct 11:05 (LDL 142)
--       s5 break-glass 03:12 -> 16 Oct 03:12 (session 0510-1, IDS D3)            s6 alert 08:00 -> 17 Oct 09:00 (health_alert 0606-101)
--       s7 vitals 12:40 -> 17 Oct 10:29 (escalation 0233-12, NEWS 7)            s8 dispensed 13:20 -> 17 Oct 15:42 (ready at the counter)
--       s9 complaint 14:02 -> 14 Oct 14:02 (CMP-0412)                            s10 blood request 14:30 -> 17 Oct 14:30 (request 0704-3)
--   * s3 text names ORD-DEMO-0001 (lipid only): the HbA1c of the design title is the separate order ORD-DEMO-0002 of 2 Oct.
--   * The heatwave alert is sent to doctor / nurse / hospital admin only: citizens already get it as an alert row (engage.health_alert),
--     a citizen event would list it twice on the Alerts screen.
--   * Dispensing uses the time of the pharmacy seed (ready 15:42), so a 'dispensed' event is later than the doctor timeline (~14:35).
--
-- ID MAP (cfd00000-KKKK-4000-8000-SSSSSSSSSSSS)
--   0801 engage.event, design events:  serial = design number (1..10) * 10 + audience slot
--          audience slots 1..4 = staff / citizen audiences, 5 district, 6 state, 7 zonal, 8 central console
--   0802 booking | 0803 prescription (serial = rx serial, +100 for the extra pharmacy prescriptions 0415) | 0804 lab-order | 0805 imaging-order
--   0806 lab-result | 0807 imaging-result | 0808 break-glass (+1000 for 0201 sessions, +2000 for 0510) | 0809 alert (+1000 for 0150 alerts)
--   0810 vitals-critical | 0811 dispensed / collected (slot 3) | 0812 complaint (+1000 for 0511, +2000 for 0622) / complaint-update (slot 3)
--   0813 blood-request | 0814 blood-response | 0815 referral | 0816 engage.notification (in_app, 'My care')
--   derived serial = (entity serial [+ offset]) * 10 + audience slot
-- =====================================================================
"""


def main() -> None:
    build_design()
    w(HEADER)
    w("BEGIN;")
    w()
    w("-- ---------- the 10 design events (one row per audience) ----------")
    w(f"INSERT INTO engage.event ({COLS}) VALUES")
    w(",\n".join(DESIGN_ROWS))
    w("ON CONFLICT (id) DO NOTHING;")
    w()
    build_derived()
    build_read_state()
    build_notifications()
    build_audit()
    w("-- keep the booking-reference sequence ahead of the seeded refs (also done by migration 129; GREATEST makes it a no-op on a re-run)")
    w("SELECT setval('engage.booking_ref_seq', GREATEST((SELECT last_value FROM engage.booking_ref_seq),")
    w("  (SELECT coalesce(max(substring(booking_ref FROM '[0-9]+$')::bigint), 0) FROM engage.appointment WHERE booking_ref ~ '^DEMO-APT-[0-9]+$'), 59100));")
    w()
    w("COMMIT;")
    OUT.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {OUT.name}: {len(DESIGN_ROWS)} design rows")


if __name__ == "__main__":
    main()

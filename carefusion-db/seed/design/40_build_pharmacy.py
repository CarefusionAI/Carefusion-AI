#!/usr/bin/env python3
"""
Generator for seed/design/40_pharmacy.sql (pharmacy operations: catalogue, stock, batches, purchase orders,
recalls, queue, verification, dispensing, dose log, finder search log).

    python3 carefusion-db/seed/design/40_build_pharmacy.py

Deterministic (no clock, no random). 40_pharmacy.sql is the artefact that run_migrations.sh applies; this file is
only the source it is generated from.

Rules (see IDS.md): one transaction, ON CONFLICT DO NOTHING / NOT EXISTS guards, no change to base rows,
ids only in kinds 0400-0499, demo "today" = Saturday 17 October 2026 (IST, +05:30), synthetic data only.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "40_pharmacy.sql"

# ----------------------------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------------------------


def U(kind: int, n: int) -> str:
    return f"cfd00000-{kind:04d}-4000-8000-{n:012d}"


def q(s) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def ts(date: str, hhmm: str) -> str:
    return f"'{date} {hhmm}:00+05:30'::timestamptz"


def num(x) -> str:
    return f"{x:.2f}" if isinstance(x, float) else str(x)


# base ids
PH = {n: U(12, n) for n in range(1, 7)}
HOSP1 = U(10, 1)
ARUN, SUMA, JOSEPH, MEERA, AJAY = U(2, 2), U(2, 7), U(2, 6), U(2, 8), U(2, 9)
DIVYA, SHAJI = U(2, 301), U(2, 302)
REJI = U(421, 1)
RX = lambda n: U(211, n)  # noqa: E731
ITEM = lambda rx, line: U(212, rx * 100 + line)  # noqa: E731
PERSON = lambda n: U(1, n)  # noqa: E731

lines_out: list[str] = []


def emit(s: str = "") -> None:
    lines_out.append(s)


# ----------------------------------------------------------------------------------------------
# medicine catalogue
# ----------------------------------------------------------------------------------------------
# existing (kind 0225, written by 20_doctor_inpatient.sql): key -> (generic, form, strength)
EXISTING = {
    "metformin500": ("Metformin", "tablet", "500 mg"),
    "atorva10": ("Atorvastatin", "tablet", "10 mg"),
    "vitd3": ("Vitamin D3 (cholecalciferol)", "capsule", "60000 IU"),
    "clopidogrel75": ("Clopidogrel", "tablet", "75 mg"),
    "omeprazole20": ("Omeprazole", "capsule", "20 mg"),
    "folic5": ("Folic acid", "tablet", "5 mg"),
    "ironfa": ("Iron + folic acid", "tablet", "100 mg + 0.5 mg"),
    "calcium500": ("Calcium", "tablet", "500 mg"),
    "paracetamol650": ("Paracetamol", "tablet", "650 mg"),
    "amoxsyr250": ("Amoxicillin", "syrup", "250 mg/5 mL"),
    "methylphen10": ("Methylphenidate", "tablet", "10 mg"),
    "amlodipine5": ("Amlodipine", "tablet", "5 mg"),
    "glimepiride1": ("Glimepiride", "tablet", "1 mg"),
    "azithro500": ("Azithromycin", "tablet", "500 mg"),
    "cetirizine10": ("Cetirizine", "tablet", "10 mg"),
    "clotrimazole1": ("Clotrimazole", "cream", "1%"),
    "losartan50": ("Losartan", "tablet", "50 mg"),
    "aspirin75": ("Aspirin", "tablet", "75 mg"),
    "ceftriaxone1g": ("Ceftriaxone", "injection", "1 g"),
    "pantoprazole40": ("Pantoprazole", "tablet", "40 mg"),
    "insulinreg": ("Insulin regular", "injection", "100 IU/mL vial"),
    "insulinglar": ("Insulin glargine", "pen", "100 IU/mL"),
}
# new (kind 0401): key -> (serial, generic, form, strength, schedule, category, atc, jan_aushadhi)
NEW_MEDS = [
    ("amox500cap", "Amoxicillin", "capsule", "500 mg", "H", "Antibiotic", "J01CA04", False),
    ("amoxsyr125", "Amoxicillin", "syrup", "125 mg/5 mL", "H", "Antibiotic", "J01CA04", False),
    ("amoxclav625", "Amoxicillin + clavulanic acid", "tablet", "625 mg", "H", "Antibiotic", "J01CR02", False),
    ("doxy100", "Doxycycline", "capsule", "100 mg", "H", "Antibiotic", "J01AA02", True),
    ("atorva20", "Atorvastatin", "tablet", "20 mg", "none", "Cardiac", "C10AA05", True),
    ("atorva40", "Atorvastatin", "tablet", "40 mg", "none", "Cardiac", "C10AA05", True),
    ("atorvaDL", "Atorvastatin (Demo Labs generic)", "tablet", "10 mg", "none", "Cardiac", "C10AA05", True),
    ("metformin1000", "Metformin", "tablet", "1000 mg", "none", "Diabetes", "A10BA02", True),
    ("ranitidine150", "Ranitidine", "tablet", "150 mg", "none", "Gastro", "A02BA02", False),
    ("salbinh", "Salbutamol", "inhaler", "100 mcg/dose", "none", "Respiratory", "R03AC02", False),
    ("salbsyr", "Salbutamol", "syrup", "2 mg/5 mL", "none", "Respiratory", "R03CC02", False),
    ("ors", "ORS (oral rehydration salts)", "powder", "sachet", "none", "General", "A07CA", True),
    ("diclogel", "Diclofenac", "gel", "1%", "none", "General", "M02AA15", False),
    ("vitbc", "Vitamin B complex", "tablet", "standard", "none", "General", "A11EA", True),
    ("ibuprofen400", "Ibuprofen", "tablet", "400 mg", "none", "General", "M01AE01", True),
    ("telmisartan40", "Telmisartan", "tablet", "40 mg", "H", "Cardiac", "C09CA07", True),
    ("levothyrox50", "Levothyroxine", "tablet", "50 mcg", "H", "General", "H03AA01", True),
    ("montelukast10", "Montelukast", "tablet", "10 mg", "H", "Respiratory", "R03DC03", False),
    ("ondansetron4", "Ondansetron", "tablet", "4 mg", "H", "Gastro", "A04AA01", False),
    ("cefixime200", "Cefixime", "tablet", "200 mg", "H", "Antibiotic", "J01DD08", False),
    ("cipro500", "Ciprofloxacin", "tablet", "500 mg", "H", "Antibiotic", "J01MA02", False),
    ("metronidazole400", "Metronidazole", "tablet", "400 mg", "H", "Antibiotic", "J01XD01", True),
    ("domperidone10", "Domperidone", "tablet", "10 mg", "H", "Gastro", "A03FA03", False),
    ("glimepiride2", "Glimepiride", "tablet", "2 mg", "none", "Diabetes", "A10BB12", True),
    ("diclotab50", "Diclofenac", "tablet", "50 mg", "none", "General", "M01AB05", True),
]
MED_TRIPLE = dict(EXISTING)
for k, g, f, s, *_ in NEW_MEDS:
    MED_TRIPLE[k] = (g, f, s)

# price per dispensing unit (1 tablet / 1 pen / 1 bottle / 1 sachet / 1 tube): price, mrp, cost
PRICE = {
    "metformin500": (1.80, 2.00, 1.20), "atorva10": (3.50, 4.00, 2.40), "atorvaDL": (3.20, 4.00, 2.10),
    "insulinglar": (450.0, 500.0, 400.0), "amlodipine5": (1.20, 1.50, 0.80), "clopidogrel75": (4.50, 6.00, 3.00),
    "amoxsyr250": (62.0, 75.0, 45.0), "amoxsyr125": (48.0, 60.0, 35.0), "salbinh": (150.0, 175.0, 110.0),
    "paracetamol650": (1.10, 1.50, 0.70), "ors": (12.0, 20.0, 8.0), "folic5": (0.90, 1.20, 0.50),
    "vitd3": (18.0, 22.0, 12.0), "omeprazole20": (1.60, 2.20, 1.00), "ironfa": (1.20, 1.60, 0.80),
    "calcium500": (1.80, 2.50, 1.20), "methylphen10": (12.0, 15.0, 8.0), "pantoprazole40": (3.20, 4.50, 2.00),
    "losartan50": (2.60, 3.50, 1.70), "glimepiride1": (2.20, 3.00, 1.40), "azithro500": (18.0, 24.0, 12.0),
    "cetirizine10": (0.90, 1.20, 0.50), "ceftriaxone1g": (70.0, 90.0, 45.0), "ranitidine150": (1.50, 2.00, 0.90),
    "insulinreg": (140.0, 165.0, 105.0), "diclogel": (55.0, 70.0, 38.0), "vitbc": (0.80, 1.10, 0.50),
    "salbsyr": (60.0, 75.0, 42.0), "amox500cap": (7.50, 10.0, 5.0), "aspirin75": (0.60, 0.90, 0.35),
    "doxy100": (4.20, 6.0, 2.80), "amoxclav625": (22.0, 28.0, 15.0), "atorva20": (6.50, 8.0, 4.50),
    "atorva40": (11.0, 14.0, 7.50), "metformin1000": (3.60, 4.50, 2.40), "ibuprofen400": (1.20, 1.60, 0.70),
    "telmisartan40": (5.0, 6.50, 3.20), "levothyrox50": (1.80, 2.40, 1.20), "montelukast10": (8.0, 10.0, 5.50),
    "ondansetron4": (4.0, 5.50, 2.50), "cefixime200": (14.0, 18.0, 9.0), "cipro500": (5.50, 7.50, 3.50),
    "metronidazole400": (1.20, 1.60, 0.70), "domperidone10": (1.50, 2.00, 0.90), "glimepiride2": (3.50, 4.50, 2.30),
    "diclotab50": (1.10, 1.50, 0.60), "clotrimazole1": (45.0, 60.0, 30.0),
}

# ----------------------------------------------------------------------------------------------
# stock (final quantities = what the screens show AFTER everything this file does)
# ----------------------------------------------------------------------------------------------
# pharmacy 1: (key, batch, expiry, final_qty, low_threshold, published, blocked)
P1 = [
    ("metformin500", "MF2210", "2027-04-30", 160, 0, True, None),
    ("metformin500", "MF-24A19", "2027-08-31", 260, 200, True, None),
    ("atorva10", "AT1180", "2027-03-31", 0, 0, True, None),
    ("atorva10", "AT-1182", "2027-05-31", 18, 150, True, None),
    ("atorvaDL", "AT-DL2208", "2027-09-30", 240, 50, True, None),
    ("insulinglar", "IG0913", "2026-12-31", 0, 0, True, None),
    ("insulinglar", "IG-5530", "2027-01-31", 6, 20, True, None),
    ("amlodipine5", "AM5521", "2027-06-30", 180, 0, True, None),
    ("amlodipine5", "AM-7741", "2027-12-31", 200, 150, True, None),
    ("clopidogrel75", "CL-3318", "2027-07-31", 210, 100, True, None),
    ("amoxsyr250", "AS-2201", "2027-03-31", 0, 25, True, None),
    ("amoxsyr125", "AS-1252", "2027-04-30", 5, 5, True, None),
    ("salbinh", "SB0331", "2027-02-28", 0, 0, True, None),
    ("salbinh", "SB-0442", "2027-06-30", 9, 25, False, None),
    ("paracetamol650", "PC-9910", "2028-03-31", 1200, 400, True, None),
    ("ors", "OR-6620", "2028-02-29", 60, 200, True, None),
    ("ors", "OR9921", "2026-11-14", 80, 0, True, None),
    ("folic5", "FA-5521", "2028-01-31", 800, 200, True, None),
    ("vitd3", "VD-0721", "2026-11-15", 90, 0, True, None),
    ("vitd3", "VD-0902", "2027-10-31", 88, 30, True, None),
    ("omeprazole20", "OM-3340", "2027-08-31", 340, 100, True, None),
    ("ironfa", "IF-2207", "2028-02-29", 640, 150, True, None),
    ("calcium500", "CA-1190", "2028-01-31", 512, 150, True, None),
    ("methylphen10", "MP-0442", "2027-09-30", 60, 20, False, None),
    ("pantoprazole40", "PT7720", "2026-11-20", 0, 0, True, None),
    ("pantoprazole40", "PP-8834", "2026-11-28", 610, 100, True, None),
    ("losartan50", "B2241", "2027-08-31", 300, 100, True, None),
    ("losartan50", "LS8812", "2027-01-12", 240, 0, True, None),
    ("glimepiride1", "GM-2210", "2027-08-31", 270, 100, True, None),
    ("azithro500", "AZ1902", "2026-12-06", 36, 0, True, None),
    ("cetirizine10", "CT4410", "2026-11-28", 300, 0, True, None),
    ("cetirizine10", "CT-1203", "2026-10-31", 340, 0, True, None),
    ("ceftriaxone1g", "CF1180", "2026-10-24", 12, 0, True, None),
    ("ranitidine150", "RN0712", "2026-10-29", 120, 0, True, None),
    ("ranitidine150", "RN-2291", "2027-03-31", 64, 200, False, ("Recall RC-DEMO-2026-0101", "2026-10-15 16:30")),
    ("insulinreg", "IR0450", "2026-11-02", 4, 0, True, None),
    ("diclogel", "DG3301", "2026-11-09", 18, 0, True, None),
    ("diclogel", "DG-5512", "2026-11-20", 44, 0, True, None),
    ("vitbc", "VB5520", "2026-12-20", 500, 0, True, None),
    ("salbsyr", "SS0118", "2027-01-04", 14, 0, True, None),
    ("amox500cap", "AX2209", "2026-10-15", 40, 0, True, None),
    ("amox500cap", "AX-3307", "2026-11-30", 120, 600, False, None),
    ("aspirin75", "ASP-4410", "2028-01-31", 600, 150, True, None),
    ("doxy100", "DX-2208", "2027-09-30", 150, 50, True, None),
    ("amoxclav625", "AC-3310", "2027-06-30", 120, 40, True, None),
    ("atorva20", "AT20-111", "2027-08-31", 200, 60, True, None),
    ("atorva40", "AT40-120", "2027-08-31", 60, 20, True, None),
    ("metformin1000", "MF1K-77", "2027-10-31", 300, 80, True, None),
    ("ibuprofen400", "IB-4410", "2028-01-31", 500, 150, True, None),
    ("telmisartan40", "TM-5521", "2027-12-31", 260, 80, True, None),
    ("levothyrox50", "LV-3302", "2027-11-30", 400, 100, True, None),
    ("montelukast10", "MK-8801", "2027-09-30", 200, 60, True, None),
    ("ondansetron4", "ON-1190", "2027-07-31", 180, 60, True, None),
    ("cefixime200", "CX-2205", "2027-05-31", 100, 40, True, None),
    ("cipro500", "CP-7712", "2027-06-30", 150, 50, True, None),
    ("metronidazole400", "MZ-3318", "2027-10-31", 300, 80, True, None),
    ("domperidone10", "DM-4420", "2027-08-31", 250, 80, True, None),
    ("glimepiride2", "GM2-901", "2027-11-30", 200, 60, True, None),
    ("diclotab50", "DC-6620", "2028-01-31", 400, 100, True, None),
]
# other pharmacies: (key, batch, expiry, qty, threshold)
OTHER = {
    2: [("metformin500", "CP-MF-01", "2027-09-30", 250, 50), ("atorva10", "CP-AT-01", "2027-10-31", 120, 40),
        ("paracetamol650", "CP-PC-01", "2028-01-31", 800, 200), ("amlodipine5", "CP-AM-01", "2027-11-30", 200, 60),
        ("azithro500", "CP-AZ-01", "2027-08-31", 40, 50), ("cetirizine10", "CP-CT-01", "2027-12-31", 300, 80)],
    3: [("metformin500", "JA-MF-01", "2027-09-30", 120, 40), ("atorva10", "JA-AT-01", "2027-10-31", 420, 100),
        ("doxy100", "JA-DX-01", "2027-08-31", 210, 50), ("paracetamol650", "JA-PC-01", "2028-01-31", 600, 150),
        ("amlodipine5", "JA-AM-01", "2027-11-30", 500, 100), ("losartan50", "JA-LS-01", "2027-10-31", 300, 80),
        ("omeprazole20", "JA-OM-01", "2027-09-30", 280, 80), ("cetirizine10", "JA-CT-01", "2027-12-31", 250, 80),
        ("glimepiride1", "JA-GM-01", "2027-10-31", 180, 50), ("folic5", "JA-FA-01", "2028-02-29", 400, 100),
        ("aspirin75", "JA-AS-01", "2028-01-31", 350, 100), ("clopidogrel75", "JA-CL-01", "2027-09-30", 120, 40),
        ("pantoprazole40", "JA-PT-01", "2027-10-31", 260, 80)],
    4: [("metformin500", "LM-MF-01", "2027-08-31", 18, 50), ("paracetamol650", "LM-PC-01", "2028-01-31", 500, 150),
        ("amoxclav625", "LM-AC-01", "2027-07-31", 60, 20), ("ors", "LM-OR-01", "2028-01-31", 200, 50),
        ("salbinh", "LM-SB-01", "2027-09-30", 25, 20), ("insulinglar", "LM-IG-01", "2027-03-31", 12, 10)],
    5: [("metformin500", "SN-MF-01", "2027-08-31", 0, 50), ("atorva10", "SN-AT-01", "2027-09-30", 60, 30),
        ("paracetamol650", "SN-PC-01", "2028-01-31", 300, 100), ("omeprazole20", "SN-OM-01", "2027-10-31", 150, 50),
        ("losartan50", "SN-LS-01", "2027-11-30", 100, 40)],
    6: [("cetirizine10", "P6-CTZ-01", "2027-12-31", 400, 100), ("clotrimazole1", "P6-CLO-01", "2027-10-31", 80, 20),
        ("paracetamol650", "P6-PC-01", "2028-01-31", 600, 150), ("metformin500", "P6-MF-01", "2027-10-31", 300, 80),
        ("amlodipine5", "P6-AM-01", "2027-11-30", 250, 60), ("ors", "P6-OR-01", "2028-01-31", 150, 40),
        ("azithro500", "P6-AZ-01", "2027-08-31", 60, 20), ("doxy100", "P6-DX-01", "2027-09-30", 80, 20)],
}
PRICE_FACTOR = {2: 2.0, 3: 0.9, 4: 2.33, 5: 1.6, 6: 0.9}
PRICE_OVERRIDE = {(3, "metformin500"): 1.60, (4, "metformin500"): 4.20, (5, "metformin500"): 1.70}

# movements that change a batch quantity (non-dispense): (ph, key, batch) -> list of (type, delta, reason, date, hhmm, user, po_number)
MOVES = [
    ("receipt", "folic5", "FA-5521", 400, "PO-2026-0401 goods receipt", "2026-10-17", "14:55", SHAJI, "PO-2026-0401"),
    ("receipt", "paracetamol650", "PC-9910", 600, "PO-2026-0401 goods receipt", "2026-10-17", "14:55", SHAJI, "PO-2026-0401"),
    ("receipt", "clopidogrel75", "CL-3318", 100, "PO-2026-0401 goods receipt", "2026-10-17", "14:55", SHAJI, "PO-2026-0401"),
    ("receipt", "omeprazole20", "OM-3340", 150, "PO-2026-0401 goods receipt", "2026-10-17", "14:55", SHAJI, "PO-2026-0401"),
    ("receipt", "calcium500", "CA-1190", 200, "PO-2026-0401 goods receipt", "2026-10-17", "14:55", SHAJI, "PO-2026-0401"),
    ("receipt", "ironfa", "IF-2207", 200, "PO-2026-0401 goods receipt", "2026-10-17", "14:55", SHAJI, "PO-2026-0401"),
    ("adjustment", "salbinh", "SB-0442", -1, "Stock count correction", "2026-10-12", "17:10", SHAJI, None),
    ("write_off", "vitbc", "VB5520", -12, "Damaged strips", "2026-10-14", "16:40", SHAJI, None),
]

# ----------------------------------------------------------------------------------------------
# dispensing
# ----------------------------------------------------------------------------------------------
# live dispenses go through the real triggers (stock, FEFO, prescription status).
# (rx, item_id, ph, pharmacist, outcome, qty, key, batch, substitute_key, note, override, date, hhmm)
LIVE = [
    (6, ITEM(6, 1), 1, JOSEPH, "dispensed", 30, "amlodipine5", "AM5521", None, None, None, "2026-10-17", "12:41"),
    (7, ITEM(7, 1), 1, JOSEPH, "dispensed", 30, "glimepiride1", "GM-2210", None, None, None, "2026-10-17", "14:12"),
    (1, ITEM(1, 1), 1, JOSEPH, "dispensed", 60, "metformin500", "MF2210", None, None, None, "2026-10-17", "15:42"),
    (1, ITEM(1, 2), 1, JOSEPH, "substitute", 30, "atorvaDL", "AT-DL2208", "atorvaDL",
     "Atorvastatin 10 mg: 18 on hand of 30. Dispensed the Demo Labs generic (same molecule and strength). Patient told; logged against the prescription.",
     None, "2026-10-17", "15:42"),
    (1, ITEM(1, 3), 1, JOSEPH, "dispensed", 8, "vitd3", "VD-0902", None, None,
     "Earlier batch VD-0721 (15 Nov) is held for return to supplier", "2026-10-17", "15:42"),
]
# history rows (prescriptions already 'dispensed' / 'partly_dispensed' in 20_, or the extra prescriptions below):
# inserted with the dispensing triggers off, stock figures are already the final ones.
# (rx_ref, item_id|None(extra), ph, pharmacist, outcome, qty, key, batch, override, date, hhmm)
HISTORY_20 = [
    (9, ITEM(9, 1), 1, JOSEPH, "dispensed", 15, "paracetamol650", "PC-9910", None, "2026-10-14", "11:20"),
    (10, ITEM(10, 1), 1, JOSEPH, "dispensed", 60, "metformin500", "MF-24A19", None, "2026-08-18", "11:15"),
    (10, ITEM(10, 2), 1, JOSEPH, "dispensed", 30, "atorva10", "AT-1182", None, "2026-08-18", "11:15"),
    (11, ITEM(11, 1), 1, JOSEPH, "dispensed", 3, "azithro500", "AZ1902", None, "2026-07-12", "10:20"),
    (13, ITEM(13, 1), 6, REJI, "dispensed", 10, "cetirizine10", "P6-CTZ-01", None, "2026-03-04", "11:10"),
    (14, ITEM(14, 1), 6, REJI, "dispensed", 1, "clotrimazole1", "P6-CLO-01", None, "2026-10-02", "12:10"),
    (15, ITEM(15, 1), 1, JOSEPH, "dispensed", 30, "clopidogrel75", "CL-3318", None, "2026-09-30", "11:30"),
    (15, ITEM(15, 2), 1, JOSEPH, "dispensed", 30, "aspirin75", "ASP-4410", None, "2026-09-30", "11:30"),
    (16, ITEM(16, 1), 1, JOSEPH, "dispensed", 10, "atorva10", "AT1180", None, "2026-09-01", "11:00"),
    (17, ITEM(17, 1), 1, DIVYA, "dispensed", 30, "folic5", "FA-5521", None, "2026-09-18", "10:50"),
    (17, ITEM(17, 2), 1, DIVYA, "dispensed", 30, "ironfa", "IF-2207", None, "2026-09-18", "10:50"),
]
# the 7 extra prescriptions of the pharmacist's 'Dispensing log (today)'
# (serial, rx_number, person name, dob, sex, key, dose, freq, days, qty, issued hh:mm, dispensed hh:mm, outcome, dispensed_qty, batch, status, override)
EXTRA = [
    (1, "RX-DEMO-88190", "Rajan Pillai", "1971-08-12", "male", "losartan50", "50 mg", "1-0-0", 30, 30, "14:10", "14:31",
     "dispensed", 30, "B2241", "dispensed", "Earlier batch LS8812 held back for the ward indent"),
    (2, "RX-DEMO-88188", "Shibu Thomas", "1980-03-02", "male", "insulinglar", "10 units", "0-0-1 (night)", 30, 1, "13:30", "13:52",
     "dispensed", 1, "IG0913", "dispensed", None),
    (3, "RX-DEMO-88183", "Leela Kumari", "1976-11-21", "female", "atorva10", "10 mg", "0-1-0", 30, 30, "13:05", "13:20",
     "dispensed", 10, "AT1180", "partly_dispensed", None),
    (4, "RX-DEMO-88177", "Nisha Babu", "1994-06-04", "female", "salbinh", "2 puffs", "when needed", 30, 1, "11:50", "12:05",
     "dispensed", 1, "SB0331", "dispensed", None),
    (5, "RX-DEMO-88170", "Joy Mathew", "1962-09-30", "male", "metformin500", "500 mg", "1-0-1", 30, 60, "11:15", "11:40",
     "dispensed", 60, "MF2210", "dispensed", None),
    (6, "RX-DEMO-88162", "Ammini Varghese", "1953-01-08", "female", "amoxsyr250", "250 mg (5 mL)", "5 mL three times a day", 5, 1,
     "10:40", "11:02", "out_of_stock", 0, None, "issued", None),
    (7, "RX-DEMO-88151", "Faisal Kareem", "1990-12-14", "male", "pantoprazole40", "40 mg", "1-0-0 (before breakfast)", 14, 14,
     "10:00", "10:18", "dispensed", 14, "PT7720", "dispensed", None),
]

# ----------------------------------------------------------------------------------------------
# stock bookkeeping
# ----------------------------------------------------------------------------------------------
STOCK = []  # dicts
for key, batch, exp, qty, thr, pub, blocked in P1:
    STOCK.append(dict(ph=1, key=key, batch=batch, exp=exp, final=qty, thr=thr, pub=pub, blocked=blocked))
for ph, rows in OTHER.items():
    for key, batch, exp, qty, thr in rows:
        STOCK.append(dict(ph=ph, key=key, batch=batch, exp=exp, final=qty, thr=thr, pub=True, blocked=None))
SID = {}
for i, s in enumerate(STOCK, 1):
    s["id"] = U(402, i)
    SID[(s["ph"], s["batch"])] = s["id"]
    s["initial"] = s["final"]
BY = {(s["ph"], s["batch"]): s for s in STOCK}
for ph, batch in [(l[2], l[7]) for l in LIVE if l[4] != "out_of_stock"]:
    pass
for l in LIVE:
    BY[(l[2], l[7])]["initial"] += l[5]
for m in MOVES:
    BY[(1, m[2])]["initial"] -= m[3]
for s in STOCK:
    assert s["initial"] >= 0, s


def price_of(s):
    base, mrp, cost = PRICE[s["key"]]
    ph = s["ph"]
    if ph == 1:
        return base, mrp, cost
    p = PRICE_OVERRIDE.get((ph, s["key"]), round(base * PRICE_FACTOR[ph], 2))
    return p, max(mrp, p), cost


# ----------------------------------------------------------------------------------------------
# purchase orders
# ----------------------------------------------------------------------------------------------
SUPPLIERS = [
    (1, "Demo State Medical Stores", "state_store", "DEMO-GST-32-0001"),
    (2, "Medisupply Kochi", "distributor", "DEMO-GST-32-0412"),
    (3, "Apex Pharma Distributors", "distributor", "DEMO-GST-32-0409"),
    (4, "Sree Agencies", "distributor", "DEMO-GST-32-0396"),
    (5, "Demo District Medical Store, Pathanamthitta", "district_store", None),
    (6, "Demo Labs", "manufacturer", "DEMO-GST-32-0006"),
]
POOL = [s["key"] for s in STOCK if s["ph"] == 1 and s["key"] not in ("methylphen10",)]
POOL = list(dict.fromkeys(POOL))


def cost_of(key):
    return PRICE[key][2]


def build_lines(total, fixed, filler_n, exclude, skip=0):
    """fixed: list of (key, qty, unit_cost). Returns list of (key, qty, unit_cost) summing to total exactly."""
    used = {f[0] for f in fixed} | set(exclude)
    pool = [k for k in POOL if k not in used]
    fillers = [pool[(skip + i) % len(pool)] for i in range(filler_n)]
    assert len(set(fillers)) == len(fillers), "pool too small"
    fsum = sum(round(qv * c, 2) for _, qv, c in fixed)
    base = [10 + (i * 7) % 15 for i in range(len(fillers) - 1)]  # relative weights
    # scale quantities so filler lines (without the last) cost about 85 percent of what is left
    raw = sum(base[i] * cost_of(fillers[i]) for i in range(len(base)))
    left = total - fsum
    factor = 0.85 * left / raw
    lines = list(fixed)
    s = fsum
    for i, k in enumerate(fillers[:-1]):
        qv = max(10, int(round(base[i] * factor / 10.0)) * 10)
        lines.append((k, qv, cost_of(k)))
        s += round(qv * cost_of(k), 2)
    rem = round(total - s, 2)
    assert rem > 0, (total, s)
    for qv in (1000, 500, 400, 250, 200, 100, 50, 40, 25, 20, 10, 5, 4, 2, 1):
        c = rem / qv
        if abs(round(c, 2) * qv - rem) < 1e-9 and 0.5 <= c <= 900:
            lines.append((fillers[-1], qv, round(c, 2)))
            break
    else:
        raise SystemExit(f"cannot solve last line for {total}")
    assert abs(sum(round(a * b, 2) for _, a, b in lines) - total) < 1e-6
    return lines


PO = []  # dicts
PO.append(dict(n=1, number="PO-2026-0418", sup=1, indent=False, status="pending_approval", raised=SHAJI, approver=None,
               approved_at=None, expected="2026-10-24", received=None, created=("2026-10-16", "11:20"),
               lines=build_lines(124300, [("metformin500", 3000, 6.20), ("atorva10", 2000, 10.70), ("insulinglar", 120, 400.0)], 19, [])))
PO.append(dict(n=2, number="PO-2026-0412", sup=2, indent=False, status="in_transit", raised=JOSEPH, approver=SUMA,
               approved_at=("2026-10-13", "14:00"), expected="2026-10-20", received=None, created=("2026-10-13", "10:05"),
               lines=build_lines(38750, [("ors", 500, 8.0), ("salbinh", 60, 110.0)], 7, [], skip=3)))
PO.append(dict(n=3, number="PO-2026-0409", sup=3, indent=False, status="in_transit", raised=SHAJI, approver=SUMA,
               approved_at=("2026-10-11", "12:30"), expected="2026-10-18", received=None, created=("2026-10-11", "09:40"),
               lines=build_lines(62180, [], 14, [], skip=10)))
PO.append(dict(n=4, number="PO-2026-0401", sup=1, indent=False, status="received", raised=SUMA, approver=MEERA,
               approved_at=("2026-10-05", "09:30"), expected="2026-10-16", received=("2026-10-17", "14:55"), created=("2026-10-04", "10:00"),
               lines=build_lines(208900, [("folic5", 400, 0.50), ("paracetamol650", 600, 0.70), ("clopidogrel75", 100, 3.0),
                                          ("omeprazole20", 150, 1.0), ("calcium500", 200, 1.2), ("ironfa", 200, 0.80)], 25, [], skip=2)))
PO.append(dict(n=5, number="PO-2026-0396", sup=4, indent=False, status="received", raised=DIVYA, approver=SUMA,
               approved_at=("2026-10-01", "15:00"), expected="2026-10-06", received=("2026-10-06", "11:30"), created=("2026-10-01", "11:10"),
               lines=build_lines(14200, [], 6, [], skip=20)))
PO.append(dict(n=6, number="IND-2026-0031", sup=5, indent=True, status="sent", raised=JOSEPH, approver=SUMA,
               approved_at=("2026-10-16", "09:30"), expected="2026-10-19", received=None, created=("2026-10-16", "09:00"),
               lines=[("atorva10", 1000, 10.70)]))
PO.append(dict(n=7, number="IND-2026-0032", sup=5, indent=True, status="sent", raised=JOSEPH, approver=SUMA,
               approved_at=("2026-10-16", "09:30"), expected="2026-10-19", received=None, created=("2026-10-16", "09:02"),
               lines=[("insulinglar", 20, 400.0)]))
PO.append(dict(n=8, number="IND-2026-0033", sup=5, indent=True, status="in_transit", raised=JOSEPH, approver=SUMA,
               approved_at=("2026-10-14", "10:00"), expected="2026-10-18", received=None, created=("2026-10-14", "09:30"),
               lines=[("amoxsyr250", 50, 45.0)]))
PO_ID = {p["number"]: U(404, p["n"]) for p in PO}

# ----------------------------------------------------------------------------------------------
# SQL
# ----------------------------------------------------------------------------------------------
emit(f"""-- =====================================================================
-- seed/design/40_pharmacy.sql : PHARMACY OPERATIONS layer of the design seed (generated by 40_build_pharmacy.py).
-- DO NOT EDIT BY HAND: change the generator and regenerate.
--
-- What it seeds: medicine catalogue completion (25 more medicines, substitutes, interactions), live stock and batches of the 6
--   pharmacies (FEFO batches, 16 expiry batches, a recalled batch), suppliers, 5 purchase orders + 3 indents (with lines),
--   2 recalls + acknowledgements, the 8-token counter queue of 17 Oct (P-038 .. P-045), verification, ready/collected state,
--   the dispensing log and its stock ledger, Anjali's dose schedule and dose log, the public finder search log, billing-sync state.
-- Ids: cfd00000-KKKK-4000-8000-NNNNNNNNNNNN, kinds 0400-0499. Idempotent: ON CONFLICT DO NOTHING / WHERE NOT EXISTS (dispensing
--   triggers run BEFORE the conflict check, so every dispensing insert is guarded by NOT EXISTS). Base rows are never edited.
-- Demo today = Saturday 17 October 2026 (IST). Pharmacy snapshot time is about 15:50.
-- DEPENDS ON: 00_base.sql (people, pharmacies, pharmacists), 10_citizen.sql (nothing hard; Anjali's PDF 0101-3 is used by Rx 1 in 20_),
--   20_doctor_inpatient.sql (medicines 0225-1..25, prescriptions 0211-1..17 and their items, access sessions, hospital delivery rows).
--   Runs after 30_ (lab) in file-name order, before 50_.
--
-- ID SERIAL MAP
--   0401 pharmacy.medicine (new)          1..25 in the order of the generator list (amox500cap, amoxsyr125, amoxclav625, doxy100, atorva20,
--                                          atorva40, atorvaDL, metformin1000, ranitidine150, salbinh, salbsyr, ors, diclogel, vitbc,
--                                          ibuprofen400, telmisartan40, levothyrox50, montelukast10, ondansetron4, cefixime200, cipro500,
--                                          metronidazole400, domperidone10, glimepiride2, diclotab50). The 22 medicines of 20_ (kind 0225) are reused.
--   0402 pharmacy.stock_item              running serial (pharmacy 1 first, then pharmacies 2..6)
--   0403 pharmacy.supplier                1 Demo State Medical Stores, 2 Medisupply Kochi, 3 Apex Pharma Distributors, 4 Sree Agencies,
--                                          5 Demo District Medical Store, 6 Demo Labs
--   0404 pharmacy.purchase_order          1 PO-2026-0418, 2 PO-2026-0412, 3 PO-2026-0409, 4 PO-2026-0401, 5 PO-2026-0396,
--                                          6/7/8 indents IND-2026-0031/32/33
--   0405 pharmacy.po_line                 running serial
--   0406 pharmacy.drug_recall             1 RC-DEMO-2026-0101 (Ranitidine RN-2291, CDSCO class II), 2 RC-DEMO-2026-0099 (Amoxicillin AX-3307 notice)
--   0407 pharmacy.queue_token             serial = token number (38 Rx6, 39 Rx7, 40 Rx3, 41 Rx8, 42 Rx1 = P-042, 43 Rx2, 44 Rx4, 45 Rx5)
--   0408 pharmacy.rx_verification         running serial
--   0409 pharmacy.dispensing              running serial (live ones first, then history)
--   0410 pharmacy.stock_movement          running serial
--   0411 records.dose_log                 running serial
--   0412 pharmacy.stock_search_log        running serial
--   0413 pharmacy.stock_sync_run          1..12
--   0414 pharmacy.controlled_drug_register 1 Insulin glargine (Shibu Thomas), 2 Azithromycin (Anjali, 12 Jul)
--   0415 pharmacy.prescription (extra)    1..7 = RX-DEMO-88190, 88188, 88183, 88177, 88170, 88162, 88151 (the pharmacist's dispensing log of today)
--   0416 pharmacy.prescription_item (extra)  serial = extra serial * 100 + 1
--   0417 pharmacy.prescription_delivery (extra)  same serial as the extra prescription
--   0418 access.access_session (extra)    same serial as the extra prescription
--   0419 records.document (extra)         same serial as the extra prescription
--   0420 identity.person                  1..7 extra patients (Rajan Pillai, Shibu Thomas, Leela Kumari, Nisha Babu, Joy Mathew, Ammini Varghese,
--                                          Faisal Kareem), 11 = Reji Thomas (pharmacist, Demo Taluk Hospital Pharmacy Adoor)
--   0421 identity.app_user                1 = Reji Thomas
--
-- DECISIONS AND CONFLICTS (also in the report to the coordinator)
--   * ONE stock figure per medicine = the PHARMACIST screen (Stock levels / prescription lines / dispensing log), summed over all batches.
--     Dropped: admin on-hand (Metformin 4,200, Atorvastatin 380, Insulin glargine 46, Amlodipine 2,600, Paracetamol 12,400, Amoxicillin 500 mg 120 as
--     the only stock, Salbutamol 88, ORS 1,900), doctor view (Metformin 1,240, Atorvastatin 38, Azithromycin 0), citizen finder (Metformin 400).
--     Atorvastatin 10 mg at Demo Hospital Pharmacy = 18 (low, reorder 150). Reorder points = pharmacist 'Reorder at' (admin 'min' dropped).
--     The pharmacist figures are the values AFTER the dispenses this file records (so initial stock = figure + what was dispensed).
--     Exception: ORS = 60 (OR-6620) + 80 (expiring batch OR9921) = 140, because the design's expiry list holds more ORS than its stock page.
--   * Batches: the admin's batch codes are the primary batch of a medicine, the pharmacist dispensing-log codes (MF2210, AM5521, AT1180, IG0913, SB0331,
--     PT7720, B2241) are earlier-expiring or sold-out batches, so FEFO is real (Metformin MF2210 goes before MF-24A19). Unit prices, MRP and cost are per
--     dispensing unit (1 tablet, 1 pen, 1 sachet); the finder's per-strip prices (Rs 18) are 10 x the unit price. PO unit costs follow the design (Rs 6.20,
--     Rs 10.70 per pack) and are NOT reconciled with the per-unit stock costs.
--   * Atorvastatin 'Demo Labs, same salt' (240 in stock) is its own catalogue entry 'Atorvastatin (Demo Labs generic)' so that it is a real substitute
--     (outcome 'substitute'); Anjali's Atorvastatin x30 is dispensed from it (240 left after the 30).
--   * Expiry batches are ABSOLUTE design dates (e.g. Ceftriaxone CF1180 24 Oct 2026). Views that compare with now() age with the real clock;
--     the 'expired' batches stay as rows (qty > 0) waiting for quarantine. The 5 admin expiring batches (CT-1203, VD-0721, DG-5512, PP-8834, AX-3307)
--     and the 11 pharmacist expiry batches are all present (16 batches within 90 days of 17 Oct), so '6 within 30 days' becomes 8 by the rows.
--   * Anjali's prescription RX-DEMO-55120 is verified 15:36 and dispensed 15:42 by Joseph Mathew (the admin audit row says 15:42), ready to collect,
--     not collected. Token P-042 (issued 14:34) has 3 unserved tokens ahead (P-039, P-040, P-041). Rx 5, 2, 3, 4 and 8 stay 'issued' and waiting;
--     Rx 6 (Mariamma, 12:41) and Rx 7 (Joseph Kurian, 14:12) are dispensed, Rx 6 collected 12:45.
--   * 'Indent pending 2' = IND-2026-0031 (Atorvastatin) and IND-2026-0032 (Insulin glargine), both 'sent'; IND-2026-0033 (Amoxicillin syrup) is 'in_transit'.
--   * PO-2026-0401 was raised by Suma Thomas and is above Rs 1,00,000, but the database refuses an approver equal to the raiser (CF134).
--     ASSUMPTION: the Medical Superintendent of the linked hospital (Dr. Meera Krishnan) approves it. PO-2026-0418 (Rs 1,24,300, 22 lines) stays pending.
--   * The extra patients of the pharmacist's dispensing log (Rajan P., Shibu T., Leela K., Nisha B., Joy M., Ammini V., Faisal K.) are new people
--     with assumed birth dates; Rx 88190 is Losartan x30 at 14:31 (pharmacist screen); the audit text of 50_ says 'Amlodipine x30 at 13:48' (not edited).
--   * Doses taken this morning/afternoon are logged against the items of RX-DEMO-55120 although it is signed at 14:30 (the screen shows one active
--     prescription). Taken today 2 of 5: Metformin 08:00 and Atorvastatin 14:00 taken; Metformin 20:00 and Clotrimazole 22:00 pending; Vitamin D3 is
--     a weekly Sunday dose and its slot today is marked skipped ('not due today'). 'n left' derives from the rows (Metformin 59, Atorvastatin 29).
--   * Reji Thomas (new pharmacist at Adoor, created_by = Ajay Kumar because that pharmacy has no admin) exists only so the two Adoor prescriptions
--     (2 Oct clotrimazole, 4 Mar cetirizine) have a verifying pharmacist.
--   * Not seeded (see report): 1,248 SKUs / 412 tracked items, 'used per day', Insulin glargine at 'KMSCL store' (a supplier, not a pharmacy), the
--     refill_due -> prescription links of 10_ (rows would have to be updated), the 17 Sep refill prescription and the 96 percent adherence month.
-- =====================================================================
BEGIN;
""")

# ---- medicine lookup table ----
emit("-- ---------- medicine lookup by (generic_name, form, strength): ids of 20_ (kind 0225) and of this file (kind 0401) ----------")
emit("CREATE TEMP TABLE _m (key text PRIMARY KEY, id uuid) ON COMMIT DROP;")
emit("INSERT INTO pharmacy.medicine (id, generic_name, form, strength, schedule, atc_code, category, is_jan_aushadhi) VALUES")
vals = []
for i, (k, g, f, s, sch, cat, atc, ja) in enumerate(NEW_MEDS, 1):
    vals.append(f"  ({q(U(401, i))}, {q(g)}, {q(f)}, {q(s)}, '{sch}'::pharmacy.schedule, {q(atc)}, {q(cat)}, {'true' if ja else 'false'})")
emit(",\n".join(vals))
emit("ON CONFLICT DO NOTHING;")
emit("INSERT INTO _m (key, id)")
emit("SELECT k.key, (SELECT m.id FROM pharmacy.medicine m WHERE m.generic_name = k.g AND m.form = k.f AND m.strength = k.s) FROM (VALUES")
emit(",\n".join(f"  ({q(k)}, {q(g)}, {q(f)}, {q(s)})" for k, (g, f, s) in MED_TRIPLE.items()))
emit(") AS k(key, g, f, s);")
emit("DO $$ BEGIN IF EXISTS (SELECT 1 FROM _m WHERE id IS NULL) THEN RAISE EXCEPTION '40_pharmacy: a medicine is missing (run 20_doctor_inpatient.sql first)'; END IF; END $$;")
emit()

# ---- substitutes and interactions ----
emit("-- ---------- generic / therapeutic substitutes ----------")
emit("INSERT INTO pharmacy.medicine_substitute (medicine_id, substitute_medicine_id, kind, note, requires_doctor_ok)")
emit("SELECT a.id, b.id, v.kind, v.note, v.ok FROM (VALUES")
subs = [
    ("atorva10", "atorvaDL", "generic", "Same molecule and strength (Demo Labs). Generic substitution is allowed; the patient is told and it is logged against the prescription.", False),
    ("amoxsyr250", "amoxsyr125", "generic", "Same total dose using two bottles of the lower strength. Label the new volume clearly: 10 mL three times a day.", False),
    ("omeprazole20", "pantoprazole40", "therapeutic", "Pantoprazole interacts less with clopidogrel. Needs the doctor to approve the change.", True),
    ("ranitidine150", "pantoprazole40", "therapeutic", "Ranitidine is recalled; the prescriber must approve the change.", True),
]
emit(",\n".join(f"  ({q(a)}, {q(b)}, {q(k)}, {q(n)}, {'true' if ok else 'false'})" for a, b, k, n, ok in subs))
emit(") AS v(a, b, kind, note, ok) JOIN _m a ON a.key = v.a JOIN _m b ON b.key = v.b ON CONFLICT DO NOTHING;")
emit()
emit("-- ---------- more drug interactions (demo reference, to verify clinically) ----------")
emit("INSERT INTO pharmacy.drug_interaction (medicine_a_id, medicine_b_id, severity, note, source)")
emit("SELECT least(a.id, b.id), greatest(a.id, b.id), v.sev, v.note, 'DEMO reference (assumption, verify clinically)' FROM (VALUES")
ints = [
    ("aspirin75", "clopidogrel75", "moderate", "Both reduce platelet function: bleeding risk rises. Review the need for both."),
    ("losartan50", "ibuprofen400", "moderate", "Ibuprofen can blunt losartan and strain the kidneys. Prefer paracetamol."),
    ("clopidogrel75", "pantoprazole40", "minor", "Pantoprazole interacts less with clopidogrel than omeprazole."),
    ("cipro500", "glimepiride1", "moderate", "Ciprofloxacin can cause low or high blood sugar with glimepiride."),
]
emit(",\n".join(f"  ({q(a)}, {q(b)}, {q(s)}, {q(n)})" for a, b, s, n in ints))
emit(") AS v(a, b, sev, note) JOIN _m a ON a.key = v.a JOIN _m b ON b.key = v.b ON CONFLICT DO NOTHING;")
emit()

# ---- people for the dispensing log, pharmacist of Adoor ----
emit("-- ---------- extra people: 7 patients of today's dispensing log and the Adoor pharmacist ----------")
emit("INSERT INTO identity.person (id, full_name, date_of_birth, sex, aadhaar_token, abha_number, abha_address, kyc_status, face_check_status, identity_locked_at, created_at, registration_channel) VALUES")
pv = []
for (n, rxno, name, dob, sex, *_r) in EXTRA:
    slug = name.lower().replace(" ", ".")
    tok = "tok_DEMO_" + hashlib.sha256(("40pharm-" + slug).encode()).hexdigest()[:12]
    pv.append(f"  ({q(U(420, n))}, {q(name)}, {q(dob)}, {q(sex)}, {q(tok)}, {q('DEMO-0000-84%02d' % n)}, {q(slug + '@demo')}, 'passed', 'passed', '2026-01-02 00:00:00+05:30', '2026-10-16 00:00:00+05:30', 'citizen_app')")
tok = "tok_DEMO_" + hashlib.sha256(b"40pharm-reji.thomas").hexdigest()[:12]
pv.append(f"  ({q(U(420, 11))}, 'Reji Thomas', '1990-02-15', 'male', {q(tok)}, 'DEMO-0000-8411', 'reji.thomas@demo', 'passed', 'passed', '2026-01-02 00:00:00+05:30', '2026-01-02 00:00:00+05:30', 'citizen_app')")
emit(",\n".join(pv))
emit("ON CONFLICT DO NOTHING;")
emit("INSERT INTO identity.app_user (id, person_id, account_type, keycloak_sub, status, activated_at, created_at) VALUES")
emit(f"  ({q(REJI)}, {q(U(420, 11))}, 'pharmacist', 'demo-kc-pharmacist-reji-thomas', 'active', '2026-01-02 00:00:00+00', '2026-01-02 00:00:00+00')")
emit("ON CONFLICT DO NOTHING;")
emit("INSERT INTO identity.pharmacist_profile (user_id, pharmacy_id, registration_no, created_by_user_id, role_label, shift) VALUES")
emit(f"  ({q(REJI)}, {q(PH[6])}, 'DSPC DEMO-36402', {q(AJAY)}, 'Pharmacist', 'day')")
emit("ON CONFLICT DO NOTHING;")
emit("DO $$ BEGIN")
for (n, *_r) in EXTRA:
    emit(f"  PERFORM records.create_system_folders({q(U(420, n))}::uuid, {q(ARUN)}::uuid);")
emit("END $$;")
emit()

# ---- suppliers ----
emit("-- ---------- suppliers (KMSCL of the design = Demo State Medical Stores, IDS section 5) ----------")
emit("INSERT INTO pharmacy.supplier (id, name, kind, district_id, gstin, is_active) VALUES")
emit(",\n".join(f"  ({q(U(403, n))}, {q(name)}, {q(kind)}, util.seed_district('Pathanamthitta'), {q(gst)}, true)" for n, name, kind, gst in SUPPLIERS))
emit("ON CONFLICT DO NOTHING;")
emit()

# ---- stock ----
emit("-- ---------- stock batches (final quantities already net of the dispenses and movements below) ----------")
for ph in range(1, 7):
    rows = [s for s in STOCK if s["ph"] == ph]
    emit(f"-- pharmacy {ph}: {len(rows)} batches")
    emit("INSERT INTO pharmacy.stock_item (id, pharmacy_id, medicine_id, batch_no, expiry_date, quantity, unit_price, low_threshold, source, updated_at, is_published, mrp, cost, blocked_reason, blocked_at)")
    emit("SELECT v.id, v.ph, m.id, v.batch, v.exp, v.qty, v.price, v.thr, v.src::org.stock_source, v.upd, v.pub, v.mrp, v.cost, v.br, v.ba FROM (VALUES")
    vv = []
    for s in rows:
        p, mrp, cost = price_of(s)
        br, ba = (s["blocked"] if s["blocked"] else (None, None))
        vv.append(f"  ({q(s['id'])}::uuid, {q(PH[ph])}::uuid, {q(s['key'])}, {q(s['batch'])}, DATE {q(s['exp'])}, {s['initial']}, {num(float(p))}::numeric, {s['thr']}, "
                  f"{q('software_sync' if ph == 1 else 'manual')}, {ts('2026-10-17', '15:55') if ph == 1 else ts('2026-10-16', '18:00')}, {'true' if s['pub'] else 'false'}, "
                  f"{num(float(mrp))}::numeric, {num(float(cost))}::numeric, {q(br)}, {ts(*ba.split()) if ba else 'NULL::timestamptz'})")
    emit(",\n".join(vv))
    emit(") AS v(id, ph, key, batch, exp, qty, price, thr, src, upd, pub, mrp, cost, br, ba) JOIN _m m ON m.key = v.key ON CONFLICT DO NOTHING;")
emit()

# ---- recalls ----
emit("-- ---------- recalls (RN-2291 is already blocked above; AX-3307 is a notice, hidden from the finder but not blocked) ----------")
emit("INSERT INTO pharmacy.drug_recall (id, recall_ref, source, medicine_id, medicine_name, batch_no, recall_class, issued_on, title, reason, urgent, action_text, notice_key, created_at)")
emit("SELECT v.id, v.ref, v.src, m.id, v.mname, v.batch, v.cls, v.issued, v.title, v.reason, v.urgent, v.action, v.nkey, v.cat FROM (VALUES")
emit(f"  ({q(U(406, 1))}::uuid, 'RC-DEMO-2026-0101', 'CDSCO', 'ranitidine150', 'Ranitidine 150 mg', 'RN-2291', 'II', DATE '2026-10-15', 'CDSCO recall: Ranitidine 150 mg, batch RN-2291', 'Class II. NDMA impurity.', true, 'The counter blocks this batch. Move stock to quarantine and confirm off shelf.', 'demo/recalls/rc-demo-2026-0101.pdf', {ts('2026-10-15', '16:00')}),")
emit(f"  ({q(U(406, 2))}::uuid, 'RC-DEMO-2026-0099', 'manufacturer', 'amox500cap', 'Amoxicillin 500 mg', 'AX-3307', 'notice', DATE '2026-10-09', 'Manufacturer notice: Amoxicillin 500 mg, batch AX-3307', 'Labelling error on the outer carton.', false, 'No safety risk. Relabel before dispensing or return to supplier.', 'demo/recalls/rc-demo-2026-0099.pdf', {ts('2026-10-09', '10:00')})")
emit(") AS v(id, ref, src, key, mname, batch, cls, issued, title, reason, urgent, action, nkey, cat) JOIN _m m ON m.key = v.key ON CONFLICT DO NOTHING;")
emit("INSERT INTO pharmacy.recall_ack (recall_id, pharmacy_id, status, qty_on_shelf, note) VALUES")
emit(f"  ({q(U(406, 1))}, {q(PH[1])}, 'action_needed', 64, '64 strips on shelf'),")
emit(f"  ({q(U(406, 2))}, {q(PH[1])}, 'review', 120, 'Relabel before dispensing or return to supplier')")
emit("ON CONFLICT DO NOTHING;")
emit()

# ---- billing sync ----
emit("-- ---------- billing-software link and sync runs of Demo Hospital Pharmacy (every 5 minutes, last at 15:55) ----------")
emit("INSERT INTO pharmacy.software_link (pharmacy_id, vendor, api_client_id, secret_ref, last_sync_at, last_sync_status) VALUES")
emit(f"  ({q(PH[1])}, 'Demo Billing Suite (mock connector)', 'demo-billing-2041', 'secret://demo/pharmacy-2041/billing', {ts('2026-10-17', '15:55')}, 'ok')")
emit("ON CONFLICT DO NOTHING;")
emit("INSERT INTO pharmacy.stock_sync_run (id, pharmacy_id, started_at, finished_at, status, rows_synced, error) VALUES")
sr = []
for i in range(12):
    mm = 55 - 5 * i
    hh = 15 if mm >= 0 else 14
    mm = mm % 60
    sr.append(f"  ({q(U(413, i + 1))}, {q(PH[1])}, {ts('2026-10-17', '%02d:%02d' % (hh, mm))}, {ts('2026-10-17', '%02d:%02d' % (hh, mm))} + interval '4 seconds', 'ok', {3 + (i * 7) % 17}, NULL)")
emit(",\n".join(sr))
emit("ON CONFLICT DO NOTHING;")
emit()

# ---- extra prescriptions ----
emit("-- ---------- the 7 extra prescriptions behind the pharmacist's dispensing log of today (sessions, PDFs, prescriptions, items, deliveries) ----------")
emit("INSERT INTO access.access_session (id, patient_person_id, user_id, mode, key_token_id, admission_id, started_at, expires_at, ended_at, ended_by, start_inside_geofence, reason) VALUES")
sv = []


def minus(hhmm, mins):
    h, m = map(int, hhmm.split(":"))
    t = h * 60 + m - mins
    return "%02d:%02d" % (t // 60, t % 60)


def plus(hhmm, mins):
    return minus(hhmm, -mins)


for (n, rxno, name, dob, sex, key, dose, freq, days, qty, iss, dsp, outc, dq, batch, status, ov) in EXTRA:
    sv.append(f"  ({q(U(418, n))}, {q(U(420, n))}, {q(ARUN)}, 'key'::access.session_mode, {q('demo-key-0418-%02d' % n)}, NULL, {ts('2026-10-17', minus(iss, 12))}, {ts('2026-10-17', plus(minus(iss, 12), 30))}, {ts('2026-10-17', plus(iss, 5))}, 'doctor'::access.ended_by, true, NULL)")
emit(",\n".join(sv))
emit("ON CONFLICT DO NOTHING;")
emit("INSERT INTO records.document (id, patient_person_id, folder_id, title, doc_type, storage_key, mime_type, size_bytes, sha256, enc_key_id, created_by_user_id, session_id, created_at, source_label, signature_note) VALUES")
dv = []
for (n, rxno, name, dob, sex, key, dose, freq, days, qty, iss, *_r) in EXTRA:
    sha = hashlib.sha256(rxno.encode()).hexdigest()
    dv.append(f"  ({q(U(419, n))}, {q(U(420, n))}, (SELECT id FROM records.folder WHERE patient_person_id = {q(U(420, n))} AND kind = 'doctor_uploads'), {q('e-Signed prescription ' + rxno)}, 'prescription'::records.doc_type, {q('demo/prescriptions/' + rxno + '.pdf')}, 'application/pdf', {98000 + n * 1234}, decode({q(sha)}, 'hex'), 'demo-none', {q(ARUN)}, {q(U(418, n))}, {ts('2026-10-17', iss)}, 'Dr. Arun Nair · e-Signed', 'e-Signed (DSC)')")
emit(",\n".join(dv))
emit("ON CONFLICT DO NOTHING;")
emit("INSERT INTO pharmacy.prescription (id, patient_person_id, doctor_user_id, session_id, hospital_id, issued_at, valid_until, document_id, signature_method, signature_ref, qr_token, status, updated_at, rx_number) VALUES")
rv = []
for (n, rxno, name, dob, sex, key, dose, freq, days, qty, iss, dsp, outc, dq, batch, status, ov) in EXTRA:
    code = rxno.split("-")[-1]
    rv.append(f"  ({q(U(415, n))}, {q(U(420, n))}, {q(ARUN)}, {q(U(418, n))}, {q(HOSP1)}, {ts('2026-10-17', iss)}, {ts('2026-10-17', iss)} + interval '180 days', {q(U(419, n))}, 'mock'::identity.signing_method, {q('DEMO-ESIGN-' + code)}, {q('demo-qr-' + code)}, {q(status)}::pharmacy.rx_status, {ts('2026-10-17', dsp)}, {q(rxno)})")
emit(",\n".join(rv))
emit("ON CONFLICT DO NOTHING;")
emit("INSERT INTO pharmacy.prescription_item (id, prescription_id, medicine_id, dose, frequency, duration_days, quantity, instructions, allergy_warning_shown, interaction_warning_shown, override_reason, schedule_times, with_food, check_results)")
emit("SELECT v.id, v.rx, m.id, v.dose, v.freq, v.days, v.qty, NULL, false, false, NULL, '{}'::time[], 'any', '{\"allergy\": \"none recorded\", \"interaction\": \"none\", \"simulated\": true}'::jsonb FROM (VALUES")
iv = []
for (n, rxno, name, dob, sex, key, dose, freq, days, qty, *_r) in EXTRA:
    iv.append(f"  ({q(U(416, n * 100 + 1))}::uuid, {q(U(415, n))}::uuid, {q(key)}, {q(dose)}, {q(freq)}, {days}::smallint, {qty}::numeric)")
emit(",\n".join(iv))
emit(") AS v(id, rx, key, dose, freq, days, qty) JOIN _m m ON m.key = v.key ON CONFLICT DO NOTHING;")
emit("INSERT INTO pharmacy.prescription_delivery (id, prescription_id, pharmacy_id, sent_by, patient_agreed_at, sent_at, received_at) VALUES")
dl = []
for (n, rxno, name, dob, sex, key, dose, freq, days, qty, iss, dsp, *_r) in EXTRA:
    dl.append(f"  ({q(U(417, n))}, {q(U(415, n))}, {q(PH[1])}, 'doctor_same_hospital'::pharmacy.sent_by, {ts('2026-10-17', iss)}, {ts('2026-10-17', plus(iss, 1))}, {ts('2026-10-17', minus(dsp, 3))})")
emit(",\n".join(dl))
emit("ON CONFLICT DO NOTHING;")
emit()

# ---- purchase orders ----
emit("-- ---------- purchase orders and indents (totals are kept by the po_line trigger; they equal the design amounts) ----------")
emit("INSERT INTO pharmacy.purchase_order (id, po_number, pharmacy_id, supplier_id, is_indent, status, raised_by_user_id, approved_by_user_id, approved_at, hold_reason, expected_on, received_at, created_at, updated_at) VALUES")
pv = []
for p in PO:
    ap = ts(*p["approved_at"]) if p["approved_at"] else "NULL"
    rc = ts(*p["received"]) if p["received"] else "NULL"
    pv.append(f"  ({q(PO_ID[p['number']])}, {q(p['number'])}, {q(PH[1])}, {q(U(403, p['sup']))}, {'true' if p['indent'] else 'false'}, {q(p['status'])}, {q(p['raised'])}, {q(p['approver']) if p['approver'] else 'NULL'}, {ap}, NULL, DATE {q(p['expected'])}, {rc}, {ts(*p['created'])}, {ts(*p['created'])})")
emit(",\n".join(pv))
emit("ON CONFLICT DO NOTHING;")
emit("INSERT INTO pharmacy.po_line (id, po_id, medicine_id, quantity, unit_cost, received_qty)")
emit("SELECT v.id, v.po, m.id, v.qty, v.cost, v.rcv FROM (VALUES")
lv = []
ln = 0
for p in PO:
    for key, qv, c in p["lines"]:
        ln += 1
        rcv = qv if p["status"] == "received" else 0
        lv.append(f"  ({q(U(405, ln))}::uuid, {q(PO_ID[p['number']])}::uuid, {q(key)}, {qv}::numeric, {num(float(c))}::numeric, {rcv}::numeric)")
emit(",\n".join(lv))
emit(") AS v(id, po, key, qty, cost, rcv) JOIN _m m ON m.key = v.key ON CONFLICT DO NOTHING;")
emit()

# ---- stock ledger: receipts, adjustments, write-offs (they change the batch quantity by trigger) ----
emit("-- ---------- stock ledger: goods receipts of PO-2026-0401 (sample), a count correction, a write-off ----------")
mn = 0
for (mt, key, batch, delta, reason, d, hm, user, ponum) in MOVES:
    mn += 1
    po = q(PO_ID[ponum]) if ponum else "NULL"
    emit(f"INSERT INTO pharmacy.stock_movement (id, pharmacy_id, stock_item_id, movement_type, quantity_delta, reason, po_id, ref_table, ref_id, by_user_id, at)")
    emit(f"VALUES ({q(U(410, mn))}, {q(PH[1])}, {q(SID[(1, batch)])}, {q(mt)}::pharmacy.movement_type, {delta}, {q(reason)}, {po}, NULL, NULL, {q(user)}, {ts(d, hm)}) ON CONFLICT DO NOTHING;")
emit()

# ---- dispensing ----
LIVE_DISPENSE_IDS = []
dn = 0
emit("-- ---------- LIVE dispensing through the real triggers (stock, FEFO, prescription status). Ledger rows are written below with the right clock. ----------")
emit("ALTER TABLE pharmacy.dispensing DISABLE TRIGGER dispensing_movement;")
for (rx, item, ph, user, outc, qty, key, batch, subkey, note, ov, d, hm) in LIVE:
    dn += 1
    did = U(409, dn)
    LIVE_DISPENSE_IDS.append((did, ph, user, outc, qty, SID[(ph, batch)], d, hm))
    sub = f"(SELECT id FROM _m WHERE key = {q(subkey)})" if subkey else "NULL::uuid"
    emit("INSERT INTO pharmacy.dispensing (id, prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id, substitute_medicine_id, note_to_doctor, dispensed_at, batch_override_reason)")
    emit(f"SELECT {q(did)}, {q(item)}, {q(PH[ph])}, {q(user)}, {q(outc)}::pharmacy.dispense_outcome, {qty}, {q(SID[(ph, batch)])}, {sub}, {q(note)}, {ts(d, hm)}, {q(ov)}")
    emit(f"WHERE NOT EXISTS (SELECT 1 FROM pharmacy.dispensing WHERE id = {q(did)});")
emit("ALTER TABLE pharmacy.dispensing ENABLE TRIGGER dispensing_movement;")
emit()

emit("-- ---------- HISTORY dispensing (prescriptions already dispensed or the day's earlier fills): triggers off, stock figures are final ----------")
emit("ALTER TABLE pharmacy.dispensing DISABLE TRIGGER dispensing_apply;")
emit("ALTER TABLE pharmacy.dispensing DISABLE TRIGGER dispensing_batch_rules;")
emit("ALTER TABLE pharmacy.dispensing DISABLE TRIGGER dispensing_movement;")
HIST_ROWS = []  # (did, ph, user, outcome, qty, stock_id|None, date, hm)
for (rx, item, ph, user, outc, qty, key, batch, ov, d, hm) in HISTORY_20:
    HIST_ROWS.append((item, ph, user, outc, qty, SID[(ph, batch)], ov, d, hm))
for (n, rxno, name, dob, sex, key, dose, freq, days, qty, iss, dsp, outc, dq, batch, status, ov) in EXTRA:
    HIST_ROWS.append((U(416, n * 100 + 1), 1, JOSEPH, outc, dq, SID[(1, batch)] if batch else None, ov, "2026-10-17", dsp))
for (item, ph, user, outc, qty, sid, ov, d, hm) in sorted(HIST_ROWS, key=lambda r: (r[7], r[8])):
    dn += 1
    did = U(409, dn)
    if outc != "out_of_stock":
        LIVE_DISPENSE_IDS.append((did, ph, user, outc, qty, sid, d, hm))
    emit("INSERT INTO pharmacy.dispensing (id, prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id, substitute_medicine_id, note_to_doctor, dispensed_at, batch_override_reason)")
    note = "Out of stock today. Balance stays open on the prescription." if outc == "out_of_stock" else None
    emit(f"SELECT {q(did)}, {q(item)}, {q(PH[ph])}, {q(user)}, {q(outc)}::pharmacy.dispense_outcome, {qty}, {q(sid) if sid else 'NULL::uuid'}, NULL::uuid, {q(note)}, {ts(d, hm)}, {q(ov)}")
    emit(f"WHERE NOT EXISTS (SELECT 1 FROM pharmacy.dispensing WHERE id = {q(did)});")
emit("ALTER TABLE pharmacy.dispensing ENABLE TRIGGER dispensing_apply;")
emit("ALTER TABLE pharmacy.dispensing ENABLE TRIGGER dispensing_batch_rules;")
emit("ALTER TABLE pharmacy.dispensing ENABLE TRIGGER dispensing_movement;")
emit()

emit("-- ---------- ledger rows of every dispense (type 'dispense' does not change the batch quantity) ----------")
for (did, ph, user, outc, qty, sid, d, hm) in LIVE_DISPENSE_IDS:
    mn += 1
    emit("INSERT INTO pharmacy.stock_movement (id, pharmacy_id, stock_item_id, movement_type, quantity_delta, reason, po_id, ref_table, ref_id, by_user_id, at)")
    emit(f"VALUES ({q(U(410, mn))}, {q(PH[ph])}, {q(sid)}, 'dispense'::pharmacy.movement_type, {-qty}, NULL, NULL, 'pharmacy.dispensing', {q(did)}, {q(user)}, {ts(d, hm)}) ON CONFLICT DO NOTHING;")
emit()

# controlled drug (schedule H) register entries of the history
emit("-- ---------- Schedule H register entries (Insulin glargine of today, Azithromycin of 12 Jul) ----------")
ids_by_item = {}
n_ = 0
# find dispensing ids by prescription item
dsp_ids = {}
tmp = 0
live_n = len(LIVE)
tmp = live_n
for (item, ph, user, outc, qty, sid, ov, d, hm) in sorted(HIST_ROWS, key=lambda r: (r[7], r[8])):
    tmp += 1
    dsp_ids[item] = U(409, tmp)
emit("INSERT INTO pharmacy.controlled_drug_register (id, dispensing_id, pharmacy_id, schedule, patient_name, patient_address, doctor_name, doctor_reg_no, medicine_name, quantity, entry_at)")
emit(f"SELECT {q(U(414, 1))}, {q(dsp_ids[U(416, 201)])}, {q(PH[1])}, 'H'::pharmacy.schedule, 'Shibu Thomas', 'Demo address, Pathanamthitta, Kerala', 'Dr. Arun Nair', 'DEMO-MC-41822', 'Insulin glargine 100 IU/mL pen', 1, {ts('2026-10-17', '13:52')}")
emit(f"WHERE NOT EXISTS (SELECT 1 FROM pharmacy.controlled_drug_register WHERE id = {q(U(414, 1))});")
emit(f"INSERT INTO pharmacy.controlled_drug_register (id, dispensing_id, pharmacy_id, schedule, patient_name, patient_address, doctor_name, doctor_reg_no, medicine_name, quantity, entry_at)")
emit(f"SELECT {q(U(414, 2))}, {q(dsp_ids[ITEM(11, 1)])}, {q(PH[1])}, 'H'::pharmacy.schedule, 'Anjali Menon', 'House 14, Temple Road, Kozhencherry, Pathanamthitta 689641', 'Dr. Arun Nair', 'DEMO-MC-41822', 'Azithromycin 500 mg tablet', 3, {ts('2026-07-12', '10:20')}")
emit(f"WHERE NOT EXISTS (SELECT 1 FROM pharmacy.controlled_drug_register WHERE id = {q(U(414, 2))});")
emit()

# ---- verification + fulfilment + tokens ----
emit("-- ---------- verification (7 checks), ready / collected, and the counter queue ----------")
# (rx_ref, ph, user, verified_date, verified_hm, kind) ; kind picks the detail texts
VER = [
    ("rx1", RX(1), 1, JOSEPH, "2026-10-17", "15:36", "Dr. Arun Nair", "DEMO-ESIGN-55120", "15 Apr 2027", "Allergy on record: penicillin. Nothing on this prescription is a penicillin.", "No interactions between the 3 items (simulated check)",
     (False, "Atorvastatin 10 mg: 18 on hand of 30; Demo Labs generic (same molecule and strength) offered as substitute. Metformin and Vitamin D3 in stock.")),
    ("rx6", RX(6), 1, JOSEPH, "2026-10-17", "12:30", "Dr. Vivek Menon (Casualty)", "DEMO-ESIGN-88199", "15 Apr 2027", "No allergy on record", "Single item, no interaction", (True, "Amlodipine 5 mg x30 in stock")),
    ("rx7", RX(7), 1, JOSEPH, "2026-10-17", "14:08", "Dr. Arun Nair", "DEMO-ESIGN-88205", "15 Apr 2027", "No allergy on record", "Single item, no interaction", (True, "Glimepiride 1 mg x30 in stock")),
    ("rx9", RX(9), 1, JOSEPH, "2026-10-14", "11:15", "Dr. Arun Nair", "DEMO-ESIGN-88180", "12 Apr 2027", "No allergy on record", "Single item, no interaction", (True, "In stock")),
    ("rx10", RX(10), 1, JOSEPH, "2026-08-18", "11:10", "Dr. Arun Nair", "DEMO-ESIGN-47731", "14 Feb 2027", "Allergy on record: penicillin. No penicillin-group medicine.", "No interactions", (True, "In stock")),
    ("rx11", RX(11), 1, JOSEPH, "2026-07-12", "10:15", "Dr. Arun Nair", "DEMO-ESIGN-44201", "8 Jan 2027", "Allergy on record: penicillin. Azithromycin is a macrolide.", "Single item, no interaction", (True, "In stock")),
    ("rx13", RX(13), 6, REJI, "2026-03-04", "11:05", "Dr. Hema Kurup", "DEMO-ESIGN-39871", "31 Aug 2026", "No penicillin-group medicine", "Single item, no interaction", (True, "In stock")),
    ("rx14", RX(14), 6, REJI, "2026-10-02", "12:05", "Dr. Hema Kurup", "DEMO-ESIGN-87140", "31 Mar 2027", "No penicillin-group medicine", "Single item, no interaction", (True, "In stock")),
    ("rx15", RX(15), 1, JOSEPH, "2026-09-30", "11:25", "Dr. Arun Nair", "DEMO-ESIGN-88101", "29 Mar 2027", "No allergy on record", "Aspirin + clopidogrel: doctor aware (simulated check)", (True, "In stock")),
    ("rx16", RX(16), 1, JOSEPH, "2026-09-01", "10:55", "Dr. Arun Nair", "DEMO-ESIGN-87702", "28 Feb 2027", "No allergy on record", "Single item, no interaction", (False, "Atorvastatin: 10 of 30 available; balance stays open")),
    ("rx17", RX(17), 1, DIVYA, "2026-09-18", "10:45", "Dr. Leela George", "DEMO-ESIGN-88010", "17 Mar 2027", "No allergy on record", "No interactions", (True, "In stock")),
]
for (n, rxno, name, dob, sex, key, dose, freq, days, qty, iss, dsp, outc, dq, batch, status, ov) in EXTRA:
    if outc == "dispensed":
        VER.append((f"x{n}", U(415, n), 1, JOSEPH, "2026-10-17", minus(dsp, 3), "Dr. Arun Nair", "DEMO-ESIGN-" + rxno.split("-")[-1], "14 Apr 2027",
                    "No allergy on record", "Single item, no interaction", (outc == "dispensed" and dq == qty, f"{dq} of {qty} available")))
vn = 0
for (tag, rxid, ph, user, d, hm, doc, sig, valid, allergy, inter, (stock_ok, stock_txt)) in VER:
    checks = [
        ("esignature", True, f"e-signature {sig} valid (mock verifier)"),
        ("qr", True, "QR token matched the prescription"),
        ("hpr", True, f"{doc}: registration active (mock HPR lookup)"),
        ("validity", True, f"Valid until {valid}"),
        ("allergy", True, allergy),
        ("interaction", True, inter),
        ("stock", stock_ok, stock_txt),
    ]
    emit("INSERT INTO pharmacy.rx_verification (id, prescription_id, pharmacy_id, pharmacist_user_id, check_code, passed, detail, checked_at) VALUES")
    rows = []
    for code, ok, det in checks:
        vn += 1
        rows.append(f"  ({q(U(408, vn))}, {q(rxid)}, {q(PH[ph])}, {q(user)}, {q(code)}, {'true' if ok else 'false'}, {q(det)}, {ts(d, hm)})")
    emit(",\n".join(rows))
    emit("ON CONFLICT DO NOTHING;")
# fulfilment: (rx, ph, verifier, verified, ready, collected, collected_by, sms)
FUL = [
    (RX(1), 1, JOSEPH, ("2026-10-17", "15:36"), ("2026-10-17", "15:42"), None, None, ("2026-10-17", "15:42")),
    (RX(6), 1, JOSEPH, ("2026-10-17", "12:30"), ("2026-10-17", "12:41"), ("2026-10-17", "12:45"), PERSON(1019), ("2026-10-17", "12:41")),
    (RX(7), 1, JOSEPH, ("2026-10-17", "14:08"), ("2026-10-17", "14:12"), None, None, ("2026-10-17", "14:12")),
    (RX(9), 1, JOSEPH, ("2026-10-14", "11:15"), ("2026-10-14", "11:20"), ("2026-10-14", "11:50"), PERSON(1011), ("2026-10-14", "11:20")),
    (RX(10), 1, JOSEPH, ("2026-08-18", "11:10"), ("2026-08-18", "11:15"), ("2026-08-18", "11:30"), PERSON(1), ("2026-08-18", "11:15")),
    (RX(11), 1, JOSEPH, ("2026-07-12", "10:15"), ("2026-07-12", "10:20"), ("2026-07-12", "10:35"), PERSON(1), ("2026-07-12", "10:20")),
    (RX(13), 6, REJI, ("2026-03-04", "11:05"), ("2026-03-04", "11:10"), ("2026-03-04", "11:20"), PERSON(1), ("2026-03-04", "11:10")),
    (RX(14), 6, REJI, ("2026-10-02", "12:05"), ("2026-10-02", "12:10"), ("2026-10-02", "12:15"), PERSON(1), ("2026-10-02", "12:10")),
    (RX(15), 1, JOSEPH, ("2026-09-30", "11:25"), ("2026-09-30", "11:30"), ("2026-09-30", "11:45"), PERSON(1002), ("2026-09-30", "11:30")),
    (RX(16), 1, JOSEPH, ("2026-09-01", "10:55"), ("2026-09-01", "11:00"), ("2026-09-01", "11:10"), PERSON(1002), ("2026-09-01", "11:00")),
    (RX(17), 1, DIVYA, ("2026-09-18", "10:45"), ("2026-09-18", "10:50"), ("2026-09-18", "11:05"), PERSON(1016), ("2026-09-18", "10:50")),
]
for (n, rxno, name, dob, sex, key, dose, freq, days, qty, iss, dsp, outc, dq, batch, status, ov) in EXTRA:
    if outc == "dispensed":
        FUL.append((U(415, n), 1, JOSEPH, ("2026-10-17", minus(dsp, 3)), ("2026-10-17", dsp), ("2026-10-17", plus(dsp, 6)) if dq == qty else None, U(420, n), ("2026-10-17", dsp)))
emit("INSERT INTO pharmacy.rx_fulfilment (prescription_id, pharmacy_id, verified_by_user_id, verified_at, ready_at, collected_at, collected_by_person_id, sms_sent_at) VALUES")
fv = []
for (rxid, ph, ver, v, r, c, cb, sms) in FUL:
    fv.append(f"  ({q(rxid)}, {q(PH[ph])}, {q(ver)}, {ts(*v)}, {ts(*r)}, {ts(*c) if c else 'NULL::timestamptz'}, {q(cb) if cb else 'NULL::uuid'}, {ts(*sms)})")
emit(",\n".join(fv))
emit("ON CONFLICT DO NOTHING;")
# tokens: (no, rx, counter, issued, called, served)
TOK = [
    (38, RX(6), "Counter 2", "12:21", "12:30", "12:45"),
    (39, RX(7), "Counter 1", "13:57", "14:05", None),
    (40, RX(3), None, "13:59", None, None),
    (41, RX(8), None, "14:05", None, None),
    (42, RX(1), "Counter 2", "14:34", "15:36", None),
    (43, RX(2), None, "14:35", None, None),
    (44, RX(4), None, "14:36", None, None),
    (45, RX(5), None, "14:37", None, None),
]
emit("INSERT INTO pharmacy.queue_token (id, prescription_id, pharmacy_id, token_date, token_no, token_label, counter, issued_at, called_at, served_at) VALUES")
tv = []
for (no, rxid, ctr, iss, cal, srv) in TOK:
    tv.append(f"  ({q(U(407, no))}, {q(rxid)}, {q(PH[1])}, DATE '2026-10-17', {no}, {q('P-%03d' % no)}, {q(ctr)}, {ts('2026-10-17', iss)}, {ts('2026-10-17', cal) if cal else 'NULL::timestamptz'}, {ts('2026-10-17', srv) if srv else 'NULL::timestamptz'})")
emit(",\n".join(tv))
emit("ON CONFLICT DO NOTHING;")
emit()

# ---- dose log ----
emit("-- ---------- Anjali's dose log: today's 5 slots (2 taken), then the schedules from RX-DEMO-55120 via pharmacy.generate_dose_log ----------")
emit("INSERT INTO records.dose_log (id, patient_person_id, prescription_item_id, scheduled_for, taken_at, skipped, skip_reason, source, created_at) VALUES")
dv = []
dn2 = 0
A = PERSON(1)


def dl_row(item, d, hm, taken=None, skipped=False, reason=None):
    global dn2
    dn2 += 1
    return (f"  ({q(U(411, dn2))}, {q(A)}, {q(item)}, {ts(d, hm)}, {ts(d, taken) if taken else 'NULL::timestamptz'}, "
            f"{'true' if skipped else 'false'}, {q(reason)}, 'self', {ts(d, '07:00')})")


dv.append(dl_row(ITEM(1, 1), "2026-10-17", "08:00", taken="08:12"))
dv.append(dl_row(ITEM(1, 2), "2026-10-17", "14:00", taken="14:08"))
dv.append(dl_row(ITEM(1, 3), "2026-10-17", "08:00", skipped=True, reason="Not due today: weekly dose on Sundays"))
dv.append(dl_row(ITEM(14, 1), "2026-10-17", "22:00"))
# clotrimazole history, 2 .. 16 Oct at 22:00, taken
for dd in range(2, 17):
    dv.append(dl_row(ITEM(14, 1), "2026-10-%02d" % dd, "22:00", taken="22:%02d" % (5 + (dd * 3) % 40)))
# vitamin D3 weekly, Sundays from 18 Oct, 8 doses
for w in range(8):
    day = 18 + 7 * w
    d = "2026-10-%02d" % day if day <= 31 else ("2026-11-%02d" % (day - 31) if day - 31 <= 30 else "2026-12-%02d" % (day - 61))
    dv.append(dl_row(ITEM(1, 3), d, "08:00"))
emit(",\n".join(dv))
emit("ON CONFLICT DO NOTHING;")
emit(f"SELECT pharmacy.generate_dose_log({q(ITEM(1, 1))}::uuid, DATE '2026-10-17', 30);")
emit(f"SELECT pharmacy.generate_dose_log({q(ITEM(1, 2))}::uuid, DATE '2026-10-17', 30);")
emit()

# ---- finder search log ----
emit("-- ---------- public medicine-finder search log, 11 to 17 Oct (312 searches show Demo Hospital Pharmacy) ----------")
COUNTS = {1: 312, 2: 70, 3: 140, 4: 56, 5: 42, 6: 64}
sl = []
sn = 0
for ph, cnt in COUNTS.items():
    keys = [s["key"] for s in STOCK if s["ph"] == ph]
    weights = []
    for k in keys:
        w = 6 if k in ("metformin500", "atorva10", "paracetamol650") else 2
        weights.extend([k] * w)
    for i in range(cnt):
        h = int(hashlib.sha256(f"{ph}-{i}".encode()).hexdigest()[:8], 16)
        k = weights[h % len(weights)]
        day = 11 + (h // 7) % 7
        minute_of_day = 7 * 60 + (h // 49) % (14 * 60)
        if day == 17:
            minute_of_day = min(minute_of_day, 15 * 60 + 50)
        sn += 1
        sl.append(f"  ({q(U(412, sn))}::uuid, {q(PH[ph])}::uuid, {q(k)}, {ts('2026-10-%02d' % day, '%02d:%02d' % (minute_of_day // 60, minute_of_day % 60))})")
emit("INSERT INTO pharmacy.stock_search_log (id, pharmacy_id, medicine_id, searched_at, district_id)")
emit("SELECT v.id, v.ph, m.id, v.at, util.seed_district('Pathanamthitta') FROM (VALUES")
emit(",\n".join(sl))
emit(") AS v(id, ph, key, at) JOIN _m m ON m.key = v.key ON CONFLICT DO NOTHING;")
emit()
emit("COMMIT;")

OUT.write_text("\n".join(lines_out) + "\n")
print(f"wrote {OUT} ({len(lines_out)} lines); stock batches {len(STOCK)}, PO lines {ln}, dispensing {dn}, dose rows {dn2}, searches {sn}")

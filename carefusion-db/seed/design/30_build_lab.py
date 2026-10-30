#!/usr/bin/env python3
"""
Generator for seed/design/30_lab_imaging.sql  (LabTech app + RadiologyTech app seed).

    python3 carefusion-db/seed/design/30_build_lab.py

Deterministic (no clock, no randomness). 30_lab_imaging.sql is the file that is applied; this script is
only its source. Ids: cfd00000-KKKK-4000-8000-NNNNNNNNNNNN, kinds 0300-0399 only.
Everything is synthetic. Demo "today" = Saturday 17 October 2026, clock IST (+05:30).
Lab timeline "now" is about 10:42 (the LabTech design); the radiology and doctor timelines are about 14:30.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "30_lab_imaging.sql"
IST = "+05:30"


# ------------------------------------------------------------------ helpers
def uid(kind: int, n: int) -> str:
    return f"cfd00000-{kind:04d}-4000-8000-{n:012d}"


def U(kind: int, n: int) -> str:
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
    if s is None:
        return "NULL"
    if len(s) == 10:
        s += " 00:00"
    if len(s) == 16:
        s += ":00"
    return f"'{s}{IST}'::timestamptz"


def nb(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, float):
        return repr(round(v, 4))
    return str(v)


def bo(v) -> str:
    return "NULL" if v is None else ("true" if v else "false")


def jb(obj) -> str:
    return q(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def addm(s: str, m: int) -> str:
    d = datetime.strptime(s, "%Y-%m-%d %H:%M") + timedelta(minutes=m)
    return d.strftime("%Y-%m-%d %H:%M")


def rng(a: str, b: str) -> str:
    return f"tstzrange({ts(a)}, {ts(b)}, '[)')"


# ------------------------------------------------------------------ kinds owned by this file
K_ORDER, K_ITEM, K_SPEC, K_RES, K_VAL, K_CALL = 301, 302, 303, 304, 305, 306
K_INSTR, K_LOT, K_QC, K_ROOM, K_EQ, K_STUDY = 307, 308, 309, 310, 311, 312
K_SLOT, K_SERIES, K_FILE, K_DOC, K_HAND, K_HITEM = 313, 314, 315, 316, 317, 318

HOSP = U(10, 1)
DEPT_LAB, DEPT_RAD = U(11, 108), U(11, 109)

# person serials (IDS.md)
ANJALI, ARUN, RAHUL, FATHIMA, SREEJA, VIVEK, SAMEER, LEELA, DEEPA = 1, 2, 4, 5, 101, 102, 103, 108, 109
ANOOP, VINOD = 125, 126
TKURIAN, TVARG, JKURIAN, LAKSHMI, SPILLAI = 1001, 1002, 1003, 1005, 1009
ABDUL, SREEDEVI, MARY, GOPI, DIVYA, AKHIL, MARIAMMA, BINDU_V = 1012, 1013, 1014, 1015, 1016, 1017, 1019, 1020
NISHA, JPHILIP, ANITHA = 1021, 1022, 1103

# ------------------------------------------------------------------ catalogue (copy of migration 128 + 3 extra codes)
# code: (unit, ref_low, ref_high, crit_low, crit_high)   used to compute the flag exactly like lab.result_value_prepare
CAT = {
    "HB": ("g/dL", 12.0, 16.0, 7.0, 20.0), "WBC": ("10^3/uL", 4.0, 11.0, 2.0, 30.0),
    "PLT": ("10^3/uL", 150.0, 450.0, 20.0, 1000.0), "RBC": ("10^6/uL", 4.0, 5.5, None, None),
    "HCT": ("%", 36.0, 48.0, 20.0, 60.0), "CRP": ("mg/L", 0.0, 5.0, None, None),
    "GLUF": ("mg/dL", 70.0, 100.0, 40.0, 450.0), "GLUR": ("mg/dL", 70.0, 140.0, 40.0, 450.0),
    "HBA1C": ("%", 4.0, 5.6, None, None), "CHOL": ("mg/dL", 0.0, 200.0, None, None),
    "LDL": ("mg/dL", 0.0, 100.0, None, None), "HDL": ("mg/dL", 40.0, 100.0, None, None),
    "TG": ("mg/dL", 0.0, 150.0, None, 1000.0), "UREA": ("mg/dL", 7.0, 20.0, None, 100.0),
    "CREAT": ("mg/dL", 0.6, 1.3, None, 10.0), "K": ("mmol/L", 3.5, 5.1, 2.8, 6.0),
    "NA": ("mmol/L", 135.0, 145.0, 120.0, 160.0), "ALT": ("U/L", 7.0, 56.0, None, None),
    "AST": ("U/L", 10.0, 40.0, None, None), "ALP": ("U/L", 44.0, 147.0, None, None),
    "BILT": ("mg/dL", 0.1, 1.2, None, 15.0), "TSH": ("mIU/L", 0.4, 4.0, None, None),
    "FT4": ("ng/dL", 0.8, 1.8, None, None), "NEUT": ("%", 40.0, 75.0, None, None),
    "DENGNS1": (None, None, None, None, None), "BCULT": (None, None, None, None, None),
    "UCULT": (None, None, None, None, None), "ABG": (None, None, None, None, None),
}


def flag_of(code: str, v: float, rl=None, rh=None) -> str:
    unit, crl, crh, cl, ch = CAT[code]
    rl = crl if rl is None else rl
    rh = crh if rh is None else rh
    if ch is not None and v >= ch:
        return "HH"
    if cl is not None and v <= cl:
        return "LL"
    if rh is not None and v > rh:
        return "H"
    if rl is not None and v < rl:
        return "L"
    return "N"


def tat_target(code: str) -> int:
    return {"HB": 60, "WBC": 60, "PLT": 60, "K": 60, "GLUR": 60, "GLUF": 60, "CRP": 120, "CREAT": 120}.get(code, 240)


# ------------------------------------------------------------------ order model
class Order:
    """A clinical order this file fulfils. 0210 orders (n = 1..30) already exist (20_); 0301 orders are written here."""

    def __init__(self, n: int, own: bool, patient: int, kind: str, created: str, priority: str = "routine"):
        self.n, self.own, self.patient, self.kind = n, own, patient, kind
        self.created, self.priority = created, priority
        self.key = n if not own else 1000 + n          # serial base for items / specimens / results / studies
        self.uuid = uid(K_ORDER if own else 210, n)
        self.ref = None

    @property
    def lit(self) -> str:
        return f"'{self.uuid}'"


def named(n: int, patient: int, kind: str, created: str, priority: str) -> Order:
    o = Order(n, False, patient, kind, created, priority)
    o.ref = f"ORD-DEMO-{n:04d}"
    return o


# ------------------------------------------------------------------ the 30_ output
sql: list[str] = []


def emit(s: str = "") -> None:
    sql.append(s)


def insert(table: str, cols: str, rows: list[str]) -> None:
    if not rows:
        return
    emit(f"INSERT INTO {table} ({cols}) VALUES")
    emit(",\n".join("  " + r for r in rows))
    emit("ON CONFLICT DO NOTHING;")


# ================================================================== LAB DATA
# ---- orders written here (kind 0301): history for delta checks + prior chest X-rays + background for the turnaround stats
EXTRA_ORDERS: list[dict] = []     # rows for records.clinical_order
LAB: list[dict] = []              # one dict per lab order (named or extra)
HIST_LDL_PREV = 158.0
HIST_HBA1C_PREV = 7.9

H1 = Order(1, True, ANJALI, "lab", "2026-06-12 10:30")          # ORD-DEMO-0101  Anjali LDL + HbA1c, 12 Jun
H1.ref = "ORD-DEMO-0101"
H2 = Order(2, True, ABDUL, "lab", "2026-10-12 10:00")           # ORD-DEMO-0102  Abdul CBC + CRP, 12 Oct (delta check)
H2.ref = "ORD-DEMO-0102"
X3 = Order(3, True, ANJALI, "scan", "2026-09-20 10:30")         # ORD-DEMO-0103  prior chest X-ray 20 Sep 2026
X3.ref = "ORD-DEMO-0103"
X4 = Order(4, True, ANJALI, "scan", "2025-03-18 10:00")         # ORD-DEMO-0104  prior chest X-ray Mar 2025
X4.ref = "ORD-DEMO-0104"


def order_row(o: Order, ordered_by: int, dept: str, details: str, status: str, completed_by: int | None,
              completed_at: str | None, accepted_by: int | None, accepted_at: str | None, note: str,
              assigned: int | None, due: str | None = None) -> str:
    ot = {"lab": "lab", "scan": "scan"}[o.kind]
    return (f"({o.lit}, {P(o.patient)}, {A(ordered_by)}, NULL, NULL, {HOSP}, {dept}, '{ot}'::records.order_type, {q(details)}, "
            f"'{status}'::records.order_status, {ts(due)}, {A(completed_by) if completed_by else 'NULL'}, {ts(completed_at)}, "
            f"{ts(o.created)}, {ts(completed_at or accepted_at or o.created)}, {q(o.ref)}, '{o.priority}'::records.order_priority, "
            f"{A(accepted_by) if accepted_by else 'NULL'}, {ts(accepted_at)}, {A(assigned) if assigned else 'NULL'}, NULL, {q(note)})")


# ------------------------------------------------------------------ lab spec helper
def V(code, num=None, text=None, rl=None, rh=None, prev=None, flag=None):
    """a result value; prev = (prev_value_uuid, prev_number)"""
    return dict(code=code, num=num, text=text, rl=rl, rh=rh, prev=prev, flag=flag)


def val_uuid(key: int, line: int) -> str:
    return uid(K_VAL, key * 100 + line)


def add_lab(o: Order, tests, item_status, spec=None, res=None, ack=None, call=None, panel=None):
    LAB.append(dict(o=o, tests=tests, item_status=item_status, spec=spec, res=res, ack=ack, call=call, panel=panel))


def SP(status, barcode, tube, count, fasting, by, coll, recv, send_by=None, rej=None, rej_at=None, seq=1):
    return dict(status=status, barcode=barcode, tube=tube, count=count, fasting=fasting, by=by, coll=coll, recv=recv,
                send_by=send_by, rej=rej, rej_at=rej_at, seq=seq)


# ---- history 1: Anjali, 12 Jun 2026 (LDL 158 mg/dL, HbA1c 7.9 %: same values as the vitals of 10_citizen.sql)
add_lab(H1, [("LDL", "LIPID"), ("HBA1C", "HBA1C")], "resulted",
        spec=SP("done", "ORD-DEMO-0101-T1", "Gel (yellow) + EDTA (lavender)", 2, True, RAHUL, "2026-06-12 10:35", "2026-06-12 10:40"),
        res=dict(status="released", entered=RAHUL, verified=RAHUL, released_by=RAHUL, released_at="2026-06-12 11:00",
                 created="2026-06-12 10:55", esign=DEEPA, esign_ref="DEMO-ESIGN-0101", doc=None, to_doc="2026-06-12 11:00",
                 to_pat="2026-06-12 11:00", comment="Earlier result, kept for the trend.",
                 values=[V("LDL", HIST_LDL_PREV), V("HBA1C", HIST_HBA1C_PREV)]),
        ack=("2026-06-12 15:00", "Noted. Start atorvastatin, review in 3 months."))

# ---- history 2: Abdul Rasheed, 12 Oct (outpatient, before admission on 14 Oct): WBC 9.8, CRP 18 for the delta check
add_lab(H2, [("WBC", "CBC"), ("CRP", None)], "resulted",
        spec=SP("done", "ORD-DEMO-0102-T1", "EDTA (lavender) + Gel (yellow)", 2, False, RAHUL, "2026-10-12 10:15", "2026-10-12 10:20"),
        res=dict(status="released", entered=RAHUL, verified=RAHUL, released_by=RAHUL, released_at="2026-10-12 12:26",
                 created="2026-10-12 12:15", esign=None, esign_ref=None, doc=None, to_doc="2026-10-12 12:26",
                 to_pat="2026-10-12 12:26", comment=None,
                 values=[V("WBC", 9.8), V("CRP", 18.0, rl=0.0, rh=10.0)]),
        ack=("2026-10-12 16:00", "Wound review in 2 days."))

# ---- ORD-DEMO-0001: Anjali lipid profile (released 17 Oct 11:05 by Rahul Varghese, LDL 142)
O1 = named(1, ANJALI, "lab", "2026-10-17 10:07", "routine")
add_lab(O1, [("CHOL", "LIPID"), ("LDL", "LIPID"), ("HDL", "LIPID"), ("TG", "LIPID")], "resulted",
        spec=SP("done", "ORD-DEMO-0001-0417", "Gel (yellow)", 1, True, RAHUL, "2026-10-17 10:22", "2026-10-17 10:26"),
        res=dict(status="released", entered=RAHUL, verified=RAHUL, released_by=RAHUL, released_at="2026-10-17 11:05",
                 created="2026-10-17 10:58", esign=DEEPA, esign_ref="DEMO-ESIGN-0001", doc=U(101, 1),
                 to_doc="2026-10-17 11:05", to_pat="2026-10-17 11:05",
                 comment="Fasting sample. LDL above the 100 mg/dL target.",
                 values=[V("CHOL", 222.0), V("LDL", 142.0, prev=(val_uuid(1000 + 1, 1), HIST_LDL_PREV)), V("HDL", 48.0), V("TG", 160.0)]))

# ---- ORD-DEMO-0002: Anjali HbA1c (7.4 % on 4 Oct, earlier 7.9 %)
O2 = named(2, ANJALI, "lab", "2026-10-02 10:15", "routine")
add_lab(O2, [("HBA1C", "HBA1C")], "resulted",
        spec=SP("done", "ORD-DEMO-0002-0410", "EDTA (lavender)", 1, False, RAHUL, "2026-10-04 08:10", "2026-10-04 08:15"),
        res=dict(status="released", entered=RAHUL, verified=RAHUL, released_by=RAHUL, released_at="2026-10-04 09:30",
                 created="2026-10-04 09:20", esign=DEEPA, esign_ref="DEMO-ESIGN-0002", doc=U(101, 4),
                 to_doc="2026-10-04 09:30", to_pat="2026-10-04 16:30",
                 comment="Improving; target under 7 %.",
                 values=[V("HBA1C", 7.4, prev=(val_uuid(1000 + 1, 2), HIST_HBA1C_PREV))]),
        ack=("2026-10-05 10:00", "Improving. Continue metformin."))

# ---- ORD-DEMO-0004: Thomas Varghese potassium 6.1 (critical), called to Dr. Sreeja Paul
O4 = named(4, TVARG, "lab", "2026-10-17 13:25", "stat")
add_lab(O4, [("K", None)], "resulted",
        spec=SP("done", "ORD-DEMO-0004-0417", "Gel (yellow)", 1, False, RAHUL, "2026-10-17 13:40", "2026-10-17 13:45"),
        res=dict(status="released", entered=RAHUL, verified=RAHUL, released_by=RAHUL, released_at="2026-10-17 14:02",
                 created="2026-10-17 13:58", esign=None, esign_ref=None, doc=None, to_doc="2026-10-17 14:03", to_pat=None,
                 comment="Critical value. Sample not haemolysed. Doctor called, read back confirmed.",
                 values=[V("K", 6.1)]),
        call=dict(code="K", to=SREEJA, at="2026-10-17 14:03", rb="2026-10-17 14:04",
                  note="K+ 6.1 mmol/L read back by Dr. Sreeja Paul; ECG and repeat advised."))

# ---- in-progress and open lab orders (ORD-DEMO-0005 ...)
O5 = named(5, LAKSHMI, "lab", "2026-10-17 13:10", "urgent")
add_lab(O5, [("DENGNS1", None)], "collected",
        spec=SP("in_lab", "ORD-DEMO-0005-0417", "Gel (yellow)", 1, False, RAHUL, "2026-10-17 13:35", "2026-10-17 13:40"))
O7 = named(7, JKURIAN, "lab", "2026-10-17 08:55", "routine")
add_lab(O7, [("HBA1C", "HBA1C")], "collected",
        spec=SP("in_lab", "ORD-DEMO-0007-0417", "EDTA (lavender)", 1, False, RAHUL, "2026-10-17 09:25", "2026-10-17 09:30"))
O15 = named(15, TKURIAN, "lab", "2026-10-17 09:48", "stat")
add_lab(O15, [("ABG", None)], "ordered",
        spec=SP("pending", "ORD-DEMO-0015-0417", "Heparinised syringe", 1, None, None, None, None, send_by="2026-10-17 10:30"))
# Abdul Rasheed CBC + CRP: values entered, to verify (design LO-55120)
O16 = named(16, ABDUL, "lab", "2026-10-17 09:58", "stat")
add_lab(O16, [("HB", "CBC"), ("WBC", "CBC"), ("PLT", "CBC"), ("RBC", "CBC"), ("HCT", "CBC"), ("NEUT", "CBC"), ("CRP", None)], "collected",
        spec=SP("in_lab", "ORD-DEMO-0016-0417", "EDTA (lavender) + Plain (red) + Blood culture bottle", 3, False, RAHUL,
                "2026-10-17 10:20", "2026-10-17 10:25", send_by="2026-10-17 11:30"),
        res=dict(status="draft", entered=RAHUL, verified=None, released_by=None, released_at=None, created="2026-10-17 10:38",
                 esign=None, esign_ref=None, doc=None, to_doc=None, to_pat=None,
                 comment="Sample slightly haemolysed; platelet count confirmed on smear.",
                 values=[V("HB", 11.8, rl=12.0, rh=16.0), V("WBC", 13.2, rl=4.0, rh=11.0, prev=(val_uuid(1000 + 2, 1), 9.8)),
                         V("PLT", 148.0, rl=150.0, rh=410.0), V("RBC", 4.1, rl=4.2, rh=5.4), V("HCT", 36.2, rl=36.0, rh=46.0),
                         V("NEUT", 82.0, rl=40.0, rh=75.0), V("CRP", 46.0, rl=0.0, rh=10.0, prev=(val_uuid(1000 + 2, 2), 18.0))]))
O17 = named(17, SREEDEVI, "lab", "2026-10-17 10:20", "stat")
add_lab(O17, [("NA", None), ("K", None)], "collected",
        spec=SP("in_lab", "ORD-DEMO-0017-0417", "Gel (yellow)", 1, False, RAHUL, "2026-10-17 10:30", "2026-10-17 10:34"))
O18 = named(18, ANITHA, "lab", "2026-10-17 08:15", "urgent")
add_lab(O18, [("HBA1C", "HBA1C"), ("GLUF", None)], "collected",
        spec=SP("in_lab", "ORD-DEMO-0018-0417", "EDTA (lavender) + Fluoride (grey)", 2, True, RAHUL, "2026-10-17 08:30", "2026-10-17 08:45"))
O19 = named(19, JPHILIP, "lab", "2026-10-17 10:30", "routine")
add_lab(O19, [("CHOL", "LIPID"), ("LDL", "LIPID"), ("HDL", "LIPID"), ("TG", "LIPID")], "ordered",
        spec=SP("pending", "ORD-DEMO-0019-0417", "Gel (yellow)", 1, True, None, None, None))
O20 = named(20, MARY, "lab", "2026-10-17 08:55", "routine")
add_lab(O20, [("ALT", "LFT"), ("AST", "LFT"), ("ALP", "LFT"), ("BILT", "LFT")], "collected",
        spec=SP("in_lab", "ORD-DEMO-0020-0417", "Gel (yellow)", 1, False, RAHUL, "2026-10-17 09:00", "2026-10-17 09:15"),
        res=dict(status="draft", entered=RAHUL, verified=None, released_by=None, released_at=None, created="2026-10-17 10:05",
                 esign=None, esign_ref=None, doc=None, to_doc=None, to_pat=None, comment=None,
                 values=[V("ALT", 38.0), V("AST", 34.0), V("ALP", 112.0), V("BILT", 0.8)]))
O21 = named(21, NISHA, "lab", "2026-10-17 08:30", "routine")
add_lab(O21, [("TSH", "TFT"), ("FT4", "TFT")], "collected",
        spec=SP("in_lab", "ORD-DEMO-0021-0417", "Gel (yellow)", 1, False, RAHUL, "2026-10-17 08:40", "2026-10-17 08:55"),
        res=dict(status="draft", entered=RAHUL, verified=None, released_by=None, released_at=None, created="2026-10-17 09:40",
                 esign=None, esign_ref=None, doc=None, to_doc=None, to_pat=None, comment=None,
                 values=[V("TSH", 2.4), V("FT4", 1.2)]))
O22 = named(22, GOPI, "lab", "2026-10-17 10:40", "urgent")
add_lab(O22, [("GLUR", None)], "ordered",
        spec=SP("pending", "ORD-DEMO-0022-0417", "Fluoride (grey)", 1, False, None, None, None, send_by="2026-10-17 11:30"))
O23 = named(23, MARY, "lab", "2026-10-16 14:00", "routine")
add_lab(O23, [("UCULT", None)], "collected",
        spec=SP("in_lab", "ORD-DEMO-0023-0416", "Sterile container", 1, False, RAHUL, "2026-10-16 14:10", "2026-10-16 14:25"))
O24 = named(24, TKURIAN, "lab", "2026-10-16 03:40", "urgent")
add_lab(O24, [("BCULT", None)], "collected",
        spec=SP("in_lab", "ORD-DEMO-0024-0416", "Culture bottle (aerobic + anaerobic)", 2, False, RAHUL, "2026-10-16 03:50", "2026-10-16 04:00"),
        res=dict(status="preliminary", entered=RAHUL, verified=None, released_by=None, released_at=None, created="2026-10-16 15:45",
                 esign=None, esign_ref=None, doc=None, to_doc=None, to_pat=None,
                 comment="Preliminary: no growth at 24 h. Final report at 5 days.",
                 values=[V("BCULT", None, text="No growth at 24 h (preliminary). Final report at 5 days.")]))

NAMED_LAB = [O1, O2, O4, O5, O7, O15, O16, O17, O18, O19, O20, O21, O22, O23, O24]

# ---- background orders for the turnaround page (7 days, STAT median per day 51 48 44 46 40 39 42, routine median 156 min)
POOL = [1006, 1008, 1010, 1011, 1007, 1004, 1009, 1101, 1102, 1105, 1109, 1110, 1113, 1114, 1115, 1116, 1117,
        1119, 1120, 1121, 1122, 1123, 1124, 3001, 3002, 3003, 2001, 2002, 2003, 2005, 1023]
DOCS = [ARUN, SREEJA, VIVEK, SAMEER]
STAT_TESTS = [("K", 4.4, 0.35), ("GLUR", 112.0, 14.0), ("HB", 13.2, 1.1), ("K", 4.1, 0.3), ("GLUR", 96.0, 12.0), ("HB", 12.6, 0.9), ("K", 4.7, 0.25)]
ROUT_TESTS = [("LDL", 108.0, 22.0), ("HBA1C", 6.4, 0.9), ("ALT", 32.0, 9.0), ("TSH", 2.4, 0.9), ("CRP", 4.0, 3.0), ("CHOL", 184.0, 24.0),
              ("CREAT", 0.9, 0.2), ("LDL", 121.0, 18.0), ("HBA1C", 5.9, 0.5)]
STAT_OFF = [-12, -8, -4, 0, 3, 6, 9]
STAT_MED = {11: 51, 12: 48, 13: 44, 14: 46, 15: 40, 16: 39, 17: 42}
ROUT_BASE = [64, 112, 146, 166, 205, 238]
LATE = {12: 262, 13: 251, 14: 284, 15: 270, 16: 256}
TODAY_STAT = [28, 33, 42, 45, 51, 58]                    # + ORD-DEMO-0004 (37 min) = median 42
BG: list[dict] = []
idx = 0


def noise(i: int, spread: float) -> float:
    h = int(hashlib.sha256(f"bg{i}".encode()).hexdigest()[:6], 16) / 0xFFFFFF       # 0..1 deterministic
    return (h - 0.5) * 2 * spread * 0.6


for day in range(11, 18):
    stat_tats = TODAY_STAT[:] if day == 17 else [STAT_MED[day] + o for o in STAT_OFF]
    rout = ROUT_BASE[:]
    if day in LATE:
        rout[-1] = LATE[day]
    if day == 17:
        rout = rout[1:]                      # ORD-DEMO-0001 (58 min) is the sixth routine of today
    if day == 12:
        rout = [r for r in rout if r != 146]  # Abdul's order of 12 Oct (146 min) is the sixth routine of that day
    for k, tat in enumerate(stat_tats):
        idx += 1
        code, mu, sd = STAT_TESTS[(idx + k) % len(STAT_TESTS)]
        created = f"2026-10-{day:02d} " + addm("2026-10-01 08:15", k * 41)[11:]
        BG.append(dict(idx=idx, day=day, prio="stat", tat=tat, created=created, code=code, mu=mu, sd=sd, rejected=(day == 17 and k in (1, 4))))
    for k, tat in enumerate(rout):
        idx += 1
        code, mu, sd = ROUT_TESTS[(idx + k) % len(ROUT_TESTS)]
        start = "07:00" if day == 17 else "07:30"
        step = 30 if day == 17 else 47
        created = f"2026-10-{day:02d} " + addm(f"2026-10-01 {start}", k * step)[11:]
        BG.append(dict(idx=idx, day=day, prio="routine", tat=tat, created=created, code=code, mu=mu, sd=sd, rejected=False))

for b in BG:
    o = Order(100 + b["idx"], True, POOL[(b["idx"] * 7) % len(POOL)], "lab", b["created"], b["prio"])
    o.ref = f"ORD-DEMO-{1000 + b['idx']:04d}"
    b["o"] = o
    rel = addm(b["created"], b["tat"])
    num = round(b["mu"] + noise(b["idx"], b["sd"]) * (1 if b["idx"] % 6 else 2.2), 1)
    if b["code"] in ("K",):
        num = round(max(3.6, min(5.0, num)), 1)
    num = abs(num)
    by = RAHUL if int(rel[11:13]) < 14 else ANOOP
    coll = addm(b["created"], 12 if b["prio"] == "stat" else 20)
    recv = addm(coll, 6)
    tube = {"K": "Gel (yellow)", "GLUR": "Fluoride (grey)", "HB": "EDTA (lavender)", "LDL": "Gel (yellow)", "HBA1C": "EDTA (lavender)",
            "ALT": "Gel (yellow)", "TSH": "Gel (yellow)", "CRP": "Gel (yellow)", "CHOL": "Gel (yellow)", "CREAT": "Gel (yellow)"}[b["code"]]
    spec = SP("done", f"{o.ref}-T1", tube, 1, b["code"] in ("LDL", "CHOL"), by, coll, recv)
    specs = []
    if b["rejected"]:
        rej_coll = addm(b["created"], 8)
        specs.append(SP("rejected", f"{o.ref}-T1", tube, 1, False, by, rej_coll, addm(rej_coll, 4), rej="Haemolysed sample, recollected",
                        rej_at=addm(rej_coll, 10), seq=1))
        spec = SP("done", f"{o.ref}-T2", tube, 1, False, by, coll, recv, seq=2)
    specs.append(spec)
    b["lab"] = dict(o=o, tests=[(b["code"], None)], item_status="resulted", spec=None, specs=specs,
                    res=dict(status="released", entered=by, verified=by, released_by=by, released_at=rel, created=addm(rel, -6),
                             esign=None, esign_ref=None, doc=None, to_doc=rel, to_pat=addm(rel, 5), comment=None,
                             values=[V(b["code"], num)]),
                    ack=None, call=None, panel=None)
    b["rel"], b["by"] = rel, by
    LAB.append(b["lab"])

TEST_NAME = {"K": "Potassium", "GLUR": "Blood glucose (random)", "HB": "Haemoglobin", "LDL": "LDL cholesterol", "HBA1C": "HbA1c",
             "ALT": "ALT (SGPT)", "TSH": "TSH", "CRP": "C-reactive protein", "CHOL": "Total cholesterol", "CREAT": "Creatinine"}

# ================================================================== SQL OUTPUT
HEADER = f"""-- =====================================================================
-- seed/design/30_lab_imaging.sql : LAB TECHNICIAN + RADIOLOGY TECHNICIAN layer of the design seed
-- (generated by 30_build_lab.py; DO NOT EDIT BY HAND: change the generator and regenerate)
--
-- What it seeds
--   LAB (LabTech app, Rahul Varghese, Central Lab): order items, specimens (pending / collected / in lab / rejected / done),
--   results + values with reference ranges, flags, delta against the previous value and critical flags, the critical-call log
--   (K+ 6.1 for Thomas Varghese, ORD-DEMO-0004, called to Dr. Sreeja Paul with read-back), doctor acknowledgements, 4 instruments,
--   2 reagent lots, QC runs with Westgard flags (Levey-Jennings series for glucose L2), and a 7-day background of released
--   orders that feeds lab.v_order_tat (STAT median per day 51 48 44 46 40 39 42 min, routine median 156 min).
--   RADIOLOGY (RadiologyTech app, Fathima Beevi): 7 rooms, equipment events (QC, service, MRI downtime), the room schedule of
--   Sat 17 Oct, studies for every scan order of 20_ (waiting / scheduled / in progress / uploaded / awaiting report),
--   series, file metadata, exposure, prior studies of Anjali's chest X-ray, lab and radiology shift handovers.
-- Not here (other files): pharmacy (40_), hospital admin (50_), gov consoles (60_), donation (70_), events feed + audit (80_).
-- Ids: cfd00000-KKKK-4000-8000-NNNNNNNNNNNN, kinds 0300-0399 only. Idempotent: ON CONFLICT DO NOTHING; base rows are never edited.
-- Demo today = Saturday 17 October 2026 (IST). LabTech "now" ~10:42, Radiology and Doctor "now" ~14:30.
-- Every AI statement below is SIMULATED (rule 3): the only AI content is the chest X-ray pre-read, which repeats the radiology
-- model of ai.ai_run 0207-1 (20_) and is labelled "Simulated AI output. Guidance only."
--
-- DEPENDS ON (apply order is by file name, so 30_ runs after these):
--   00_base.sql    persons, app users, staff_profile (Rahul, Fathima, Anoop, Vinod), Demo General Hospital, departments 0011-108 / 0011-109, beds
--   10_citizen.sql documents 0101-1 (Anjali lipid PDF), 0101-2 (chest X-ray DICOM), 0101-4 (HbA1c PDF); Anjali's vitals LDL 158 / HbA1c 7.9 of 12 Jun
--   20_doctor_inpatient.sql  the 30 clinical orders kind 0210 (ORD-DEMO-0001 .. 0030) and ai.ai_run 0207-1 (chest X-ray AI)
--   migrations 000-128 (123 = lab and imaging tables, 128 = test catalogue)
-- The 20_ order rows are NEVER updated here: their FINAL statuses (done / in_progress / open / accepted) already match what is seeded below.
--
-- DECISIONS AND ASSUMPTIONS (also in the report to the coordinator)
--   * Critical K+: ONE critical call, K+ 6.1 mmol/L of Thomas Varghese (design Upload page, Doctor app alert), released 14:02, called to
--     Dr. Sreeja Paul 14:03, read-back 14:04. The K+ 6.4 "Ward 5 Bed 2", Glu 42 "OP-219" and Hb 6.9 "Ward 2 Bed 9" call rows of the LabTech
--     home have no patient (Ward 5 holds no admission, Ward 2 does not exist, OP-219 is not a person) and are NOT seeded.
--   * Chest X-ray AI: the radiology pre-read is the "radiology" model of ai.ai_run 0207-1: left lower zone opacity about 22 mm,
--     confidence 0.58, UNCERTAIN. The Doctor-app view of the same run says right lower zone, 0.71. 20_ already keeps both as a
--     disagreement report (kind laterality); imaging.study.checklist.ai_preread points at that run and repeats 0.58 / left. No new AI run.
--   * Lab times follow the order rows of 20_ (immutable): lipid released 11:05 (the LabTech "09:12" of the upload list is dropped), HbA1c
--     released 4 Oct 09:30 (the report PDF reached the patient's folder 16:30), chest X-ray order done 15 Oct 11:00 (study_file uploaded 10:55;
--     the citizen document row of 10_ is stamped 09:40, earlier than the order itself: a cosmetic conflict of 10_ vs 20_).
--   * LDL history: 158 mg/dL on 12 Jun 2026 (the vital_observation of 10_citizen.sql). 20_ ai_run 0207-3 says "LDL 118 to 142"; the two
--     seeds disagree and 30_ follows 10_ (delta -16, the chart rises or falls with the data, the AI sentence is text only).
--   * Reference ranges: the design shows its own ranges for the CBC of ORD-DEMO-0016 (CRP 0-10, RBC 4.2-5.4, HCT 36-46, PLT 150-410); those
--     are stored on the value rows. Everything else uses the one-range catalogue of migration 128. Flags and critical flags are computed
--     exactly like lab.result_value_prepare (critical limits come from the catalogue). That trigger is switched off for the value insert
--     (it refuses values on a released result, which would break a re-run) and every field it would fill is written explicitly.
--   * Catalogue additions (reference data that migration 128 lacks; a later migration should own them): NEUT (neutrophils %, in the CBC
--     panel), UCULT (urine culture), ABG (arterial blood gas). Inserted ON CONFLICT DO NOTHING.
--   * Values of ORD-DEMO-0020 (LFT), 0021 (TSH, FT4) and the 91 background results are invented, normal-range or mildly abnormal, for the
--     "to verify" screens and the turnaround page. Marked in result.clinical_comment where the design gives no value.
--   * The prior chest X-rays (20 Sep 2026 and Mar 2025) are written as two history orders (kind 0301, ORD-DEMO-0103 / 0104) with
--     'reported' studies at Demo General Hospital; the design's "Prior 09/26" and the Doctor app's "Mar 2025 film" are both linked.
--     The lateral view of the 15 Oct study has a series row but no file (the citizen's Documents list is fixed at 10 documents).
--   * ORD-DEMO-0006 (echocardiogram) has no room (the equipment list has no echo room); its slot is in checklist.scheduled_for.
--   * Lab KPI numbers of the design (open 38, awaiting sample 12, ready to verify 7, samples 19/24, released 64/72, QC 3 of 4, 4 of 4 analysers)
--     are static figures; the rows give open 6 (ORD 15, 19, 22 awaiting sample and 5, 7, 17, 18, 23, 24 running), ready to verify 3,
--     QC today 3 passed of 4, 2 rejected samples (haemolysis) today, 4 analysers up. The API should compute counts from the rows.
--   * Radiology KPIs of the design (waiting 6, uploaded today 6, workload by modality) are likewise computed from the rows
--     (waiting 4: ORD 8, 11, 12, 26; in progress 2: ORD 9 CT room 1, ORD 10 USG 2; scheduled 3: ORD 6, 13 and room slots).
--   * Cobas c311 and Sysmex XN are the design's analyser names with a DEMO suffix; the 4th analyser (HbA1c) is an assumption
--     (the design counts 4 of 4 analysers but names three).
-- =====================================================================
BEGIN;
"""

emit(HEADER.rstrip("\n"))

# ---- catalogue additions
emit("""
-- ---------- catalogue additions (NEUT, UCULT, ABG) ----------
INSERT INTO lab.test_catalogue
  (code, loinc, name, category, specimen_type, tube_type, unit, ref_low, ref_high, critical_low, critical_high, ref_text, tat_target_minutes, fasting_required) VALUES
  ('NEUT',  NULL, 'Neutrophils',        'haematology',  'whole blood',    'EDTA (lavender)',     '%',  40.0, 75.0, NULL, NULL, NULL, 60,   false),
  ('UCULT', NULL, 'Urine culture',      'microbiology', 'urine',          'Sterile container',   NULL, NULL, NULL, NULL, NULL, 'No growth', 4320, false),
  ('ABG',   NULL, 'Arterial blood gas', 'blood gas',    'arterial blood', 'Heparinised syringe', NULL, NULL, NULL, NULL, NULL, 'See components', 30, false)
ON CONFLICT (code) DO NOTHING;
INSERT INTO lab.panel_test (panel_code, test_code, sort_order) VALUES ('CBC', 'NEUT', 6) ON CONFLICT DO NOTHING;
""")

# ---- extra clinical orders (history lab, prior imaging, background lab)
emit("-- ---------- extra clinical orders (kind 0301): history for the delta checks, prior chest X-rays, background for the turnaround page ----------")
cols = ("id, patient_person_id, ordered_by_user_id, session_id, admission_id, hospital_id, department_id, order_type, details, status, due_at, "
        "completed_by_user_id, completed_at, created_at, updated_at, order_ref, priority, accepted_by_user_id, accepted_at, assigned_to_user_id, bed_id, clinical_note")
rows = [
    order_row(H1, ARUN, U(11, 108), "LDL cholesterol, HbA1c", "done", RAHUL, "2026-06-12 11:00", RAHUL, "2026-06-12 10:40",
              "History order: earlier values for the trend (LDL 158 mg/dL, HbA1c 7.9 %).", RAHUL),
    order_row(H2, ARUN, U(11, 108), "WBC, CRP", "done", RAHUL, "2026-10-12 12:26", RAHUL, "2026-10-12 10:10",
              "History order (outpatient, before admission on 14 Oct): WBC 9.8, CRP 18 for the delta check.", RAHUL),
    order_row(X3, ARUN, U(11, 109), "Chest X-ray PA", "done", FATHIMA, "2026-09-20 11:15", FATHIMA, "2026-09-20 10:45",
              "History order: chest X-ray during the September chest infection (prior 09/26).", FATHIMA),
    order_row(X4, ARUN, U(11, 109), "Chest X-ray PA", "done", FATHIMA, "2025-03-18 10:30", FATHIMA, "2025-03-18 10:10",
              "History order: earlier chest X-ray film (Mar 2025), used as the comparison by the Doctor-app AI.", FATHIMA),
]
for k, b in enumerate(BG):
    o = b["o"]
    doc = DOCS[b["idx"] % len(DOCS)]
    rel = b["rel"]
    rows.append(order_row(o, doc, U(11, 108), TEST_NAME[b["code"]] + " (background order)", "done", b["by"], rel, b["by"], addm(b["created"], 5),
                          "Background order for the turnaround statistics (synthetic).", b["by"]))
insert("records.clinical_order", cols, rows)

# ---- order items
emit("\n-- ---------- lab.order_item (kind 0302, serial = order key * 100 + line) ----------")
rows = []
for L in LAB:
    o = L["o"]
    for i, (code, panel) in enumerate(L["tests"], 1):
        rows.append(f"({U(K_ITEM, o.key * 100 + i)}, {o.lit}, {P(o.patient)}, {q(code)}, {q(panel)}, {q(L['item_status'])}, {ts(o.created)})")
insert("lab.order_item", "id, order_id, patient_person_id, test_code, panel_code, status, created_at", rows)

# ---- specimens
emit("\n-- ---------- lab.specimen (kind 0303, serial = order key * 10 + 1; a recollected background sample uses + 2) ----------")
rows = []
for L in LAB:
    o = L["o"]
    specs = L.get("specs") or ([L["spec"]] if L["spec"] else [])
    for s in specs:
        created = o.created
        rows.append(f"({U(K_SPEC, o.key * 10 + s['seq'])}, {o.lit}, {P(o.patient)}, {q(s['barcode'])}, {q(s['tube'])}, {s['count']}, {bo(s['fasting'])}, "
                    f"{q(s['status'])}, {A(s['by']) if s['by'] else 'NULL'}, {ts(s['coll'])}, {ts(s['send_by'])}, {ts(s['recv'])}, "
                    f"{q(s['rej'])}, {ts(s['rej_at'])}, {ts(created)})")
insert("lab.specimen", "id, order_id, patient_person_id, barcode, tube_type, tube_count, fasting, status, collected_by_user_id, collected_at, send_by, "
       "received_at, rejected_reason, rejected_at, created_at", rows)

# ---- results
emit("\n-- ---------- lab.result (kind 0304, serial = order key) ----------")
rows = []
for L in LAB:
    r, o = L["res"], L["o"]
    if not r:
        continue
    rows.append(f"({U(K_RES, o.key)}, {o.lit}, {P(o.patient)}, {q(r['status'])}, NULL, {A(r['entered'])}, {A(r['verified']) if r['verified'] else 'NULL'}, "
                f"{A(r['released_by']) if r['released_by'] else 'NULL'}, {ts(r['released_at'])}, {A(r['esign']) if r['esign'] else 'NULL'}, "
                f"{q('mock') + '::identity.signing_method' if r['esign'] else 'NULL'}, {q(r['esign_ref'])}, false, {r['doc'] if r['doc'] else 'NULL'}, "
                f"{ts(r['to_doc'])}, {ts(r['to_pat'])}, {q(r['comment'])}, {ts(r['created'])})")
insert("lab.result", "id, order_id, patient_person_id, status, amends_result_id, entered_by_user_id, verified_by_user_id, released_by_user_id, released_at, "
       "esign_by_user_id, esign_method, esign_ref, awaiting_esign, document_id, delivered_to_doctor_at, delivered_to_patient_at, clinical_comment, created_at", rows)

# ---- result values (trigger switched off: see header)
emit("\n-- ---------- lab.result_value (kind 0305, serial = order key * 100 + line) ----------")
emit("-- result_value_prepare refuses a value on a released result (CF120) even when the row would be skipped by ON CONFLICT, so it is")
emit("-- switched off for this insert; ranges, flag, critical flag and delta are written explicitly (computed like the trigger).")
emit("ALTER TABLE lab.result_value DISABLE TRIGGER result_value_prepare;")
rows = []
VALS: dict[str, dict] = {}
for L in LAB:
    r, o = L["res"], L["o"]
    if not r:
        continue
    t_res = r["created"]
    for i, v in enumerate(r["values"], 1):
        code = v["code"]
        unit, crl, crh, cl, ch = CAT[code]
        rl = v["rl"] if v["rl"] is not None else crl
        rh = v["rh"] if v["rh"] is not None else crh
        if v["num"] is not None:
            fl = flag_of(code, v["num"], v["rl"], v["rh"])
        else:
            fl = None
        crit = fl in ("LL", "HH")
        prev_id, delta = ("NULL", "NULL")
        if v["prev"]:
            prev_id = f"'{v['prev'][0]}'"
            delta = nb(round(v["num"] - v["prev"][1], 4))
        vid = val_uuid(o.key, i)
        VALS[f"{o.key}:{i}"] = dict(code=code, num=v["num"], flag=fl)
        rows.append(f"('{vid}', {U(K_RES, o.key)}, {q(code)}, {nb(v['num'])}, {q(v['text'])}, {q(unit)}, {nb(rl)}, {nb(rh)}, {q(fl)}, "
                    f"{bo(crit)}, {delta}, {prev_id}, {ts(t_res)})")
insert("lab.result_value", "id, result_id, test_code, value_num, value_text, unit, ref_low, ref_high, flag, is_critical, delta_prev, prev_value_id, created_at", rows)
emit("ALTER TABLE lab.result_value ENABLE TRIGGER result_value_prepare;")

# ---- critical calls
emit("\n-- ---------- lab.critical_call (kind 0306) ----------")
rows = []
n = 0
for L in LAB:
    c = L["call"]
    if not c:
        continue
    n += 1
    o = L["o"]
    line = [i for i, (cd, _) in enumerate(L["tests"], 1) if cd == c["code"]][0]
    rows.append(f"({U(K_CALL, n)}, '{val_uuid(o.key, line)}', {P(o.patient)}, {A(RAHUL)}, {A(c['to'])}, NULL, {ts(c['at'])}, true, {ts(c['rb'])}, {q(c['note'])})")
insert("lab.critical_call", "id, result_value_id, patient_person_id, called_by_user_id, called_to_user_id, called_to_name, called_at, read_back_confirmed, read_back_at, note", rows)

# ---- acknowledgements
emit("\n-- ---------- lab.result_ack (doctor acknowledgements; the lipid result and the K+ 6.1 are still WAITING for Dr. Nair) ----------")
rows = []
for L in LAB:
    if L["ack"]:
        o = L["o"]
        rows.append(f"({U(K_RES, o.key)}, {A(ARUN)}, {ts(L['ack'][0])}, {q(L['ack'][1])})")
insert("lab.result_ack", "result_id, doctor_user_id, acked_at, comment", rows)

# ---- instruments, reagent lots, QC
emit("\n-- ---------- instruments (kind 0307), reagent lots (0308), QC runs (0309) ----------")
INSTR = [
    (1, "Sysmex XN-DEMO", "haematology", "XN-DEMO", "DEMO-SN-XN-0001", "ok", "2026-10-03 09:00", "2026-11-03", "Central Lab, bench 1"),
    (2, "Cobas c311 DEMO", "biochemistry", "c311-DEMO", "DEMO-SN-C3-0002", "ok", "2026-10-10 09:00", "2026-10-17", "Central Lab, bench 2"),
    (3, "ABG analyser", "blood gas", "ABG-DEMO", "DEMO-SN-ABG-0003", "ok", "2026-10-12 09:00", "2026-11-12", "Central Lab, ward-side bench"),
    (4, "HbA1c analyser", "HbA1c", "HBA1C-DEMO", "DEMO-SN-HB-0004", "ok", "2026-10-01 09:00", "2026-11-01", "Central Lab, bench 3"),
]
insert("lab.instrument", "id, hospital_id, name, kind, model, serial_no, status, last_calibrated_at, next_calibration_due, location",
       [f"({U(K_INSTR, i)}, {HOSP}, {q(nm)}, {q(kd)}, {q(md)}, {q(sn)}, {q(st)}, {ts(lc)}, '{nd}'::date, {q(loc)})"
        for i, nm, kd, md, sn, st, lc, nd, loc in INSTR])
insert("lab.reagent_lot", "id, hospital_id, instrument_id, reagent, lot_no, opened_at, expiry_date, status",
       [f"({U(K_LOT, 1)}, {HOSP}, {U(K_INSTR, 4)}, 'HbA1c reagent', '24K18', '2026-09-20'::date, '2026-11-30'::date, 'in_use')",
        f"({U(K_LOT, 2)}, {HOSP}, {U(K_INSTR, 2)}, 'CRP reagent', '31C02', '2026-08-30'::date, '2027-01-12'::date, 'in_use')"])

qc_rows = []
qn = 0
GLU_Z = [0.3, -0.5, 0.8, -0.2, 1.1, 0.4, -0.9, 0.2, -1.3, 0.6, 0.1, -0.4, 0.9, -0.7, 1.4, -0.1, 0.5, -1.0, 0.7]
for d, z in zip(range(28, 28 + 19), GLU_Z):                      # 28 Sep .. 16 Oct (Levey-Jennings: 19 prior + today = 20 runs, all in control)
    day = f"2026-09-{d:02d}" if d <= 30 else f"2026-10-{d - 30:02d}"
    qn += 1
    qc_rows.append(f"({U(K_QC, qn)}, {U(K_INSTR, 2)}, 'GLUR', NULL, 2, {ts(day + ' 07:40')}, {A(RAHUL if qn % 3 else ANOOP)}, {nb(round(250 + z * 6, 2))}, 250, 6, NULL, true, NULL)")
TODAY_QC = [
    ("GLUR", 2, 2, "07:40", 248.0, 250.0, 6.0, "Pass", None),
    ("HB", 1, 1, "07:42", 8.1, 8.0, 0.15, "Pass", None),
    ("K", 2, 1, "07:55", 3.38, 3.60, 0.10, "1_2s warning", "Potassium L1 1_2s warning (Westgard). Cobas calibration flagged 08:10: rerun K+ L1 before releasing electrolytes."),
    ("K", 2, 1, "08:20", 3.51, 3.60, 0.10, "Pass", "Rerun of K+ L1 after the 1_2s warning."),
]
for code, inst, lvl, t, val, mean, sd, res, comment in TODAY_QC:
    qn += 1
    qc_rows.append(f"({U(K_QC, qn)}, {U(K_INSTR, inst)}, {q(code)}, NULL, {lvl}, {ts('2026-10-17 ' + t)}, {A(RAHUL)}, {val}, {mean}, {sd}, NULL, true, {q(comment)})")
emit("-- qc_run_rules sets westgard_rule (1_2s / 1_3s) from the z-score; z_score is a generated column")
insert("lab.qc_run", "id, instrument_id, test_code, reagent_lot_id, qc_level, run_at, run_by_user_id, value_num, target_mean, target_sd, westgard_rule, accepted, comment", qc_rows)

# ================================================================== IMAGING
emit("\n-- ---------- imaging.room (kind 0310) ----------")
ROOMS = [
    (1, "XR", "X-ray DR 1", "ok", None), (2, "PORTABLE", "Portable X-ray", "ok", None), (3, "CT", "CT room 1", "ok", None),
    (4, "USG", "USG 1", "ok", None), (5, "USG", "USG 2", "ok", None),
    (6, "MRI", "MRI 1.5T", "down", "Helium level warning; service engineer on Mon 19 Oct 10:00. Orders moved to Mon and Tue."),
    (7, "MAMMO", "Mammography", "ok", None),
]
insert("imaging.room", "id, hospital_id, modality, name, status, out_of_service_reason, is_active",
       [f"({U(K_ROOM, i)}, {HOSP}, {q(m)}, {q(nm)}, {q(st)}, {q(rs)}, true)" for i, m, nm, st, rs in ROOMS])

emit("\n-- ---------- imaging.equipment_event (kind 0311): last QC (calibration), next service, MRI downtime, DR 1 detector calibration due today ----------")
EQ = [
    (1, 1, "calibration", "2026-10-10 10:00", None, None, "Last QC 10 Oct."),
    (2, 1, "calibration", None, None, "2026-10-17", "Detector calibration due today (before 16:00)."),
    (3, 1, "service", None, None, "2026-10-17", "Next service 17 Oct."),
    (4, 2, "calibration", "2026-10-14 10:00", None, None, "Last QC 14 Oct."),
    (5, 2, "service", None, None, "2026-11-02", "Next service 2 Nov."),
    (6, 3, "calibration", "2026-10-16 10:00", None, None, "Last QC 16 Oct."),
    (7, 3, "service", None, None, "2026-10-30", "Next service 30 Oct."),
    (8, 4, "calibration", "2026-10-12 10:00", None, None, "Last QC 12 Oct."),
    (9, 4, "service", None, None, "2026-11-12", "Next service 12 Nov."),
    (10, 5, "calibration", "2026-10-12 10:30", None, None, "Last QC 12 Oct."),
    (11, 5, "service", None, None, "2026-11-12", "Next service 12 Nov."),
    (12, 6, "calibration", "2026-10-01 10:00", None, None, "Last QC 1 Oct."),
    (13, 6, "downtime", "2026-10-17 08:00", "2026-10-19 12:00", None, "Down for service: helium level warning. Engineer Mon 19 Oct 10:00. 4 MRI orders moved to Mon-Tue."),
    (14, 6, "service", None, None, "2026-10-19", "Engineer visit Mon 19 Oct 10:00."),
    (15, 7, "calibration", "2026-10-09 10:00", None, None, "Last QC 9 Oct."),
    (16, 7, "service", None, None, "2026-11-09", "Next service 9 Nov."),
]
rows = []
for i, r, k, st_, en_, d, nt in EQ:
    due = "NULL" if d is None else f"'{d}'::date"
    rows.append(f"({U(K_EQ, i)}, {U(K_ROOM, r)}, {q(k)}, {ts(st_)}, {ts(en_)}, {due}, {q(nt)}, {A(FATHIMA)}, {ts(st_ or '2026-10-01 09:00')})")
insert("imaging.equipment_event", "id, room_id, kind, starts_at, ends_at, due_on, note, recorded_by_user_id, created_at", rows)

# ---- studies
emit("\n-- ---------- imaging.study (kind 0312, serial = order key; prior studies 1003 / 1004) ----------")
AI_PREREAD = {
    "simulated": True, "label": "Simulated AI output. Guidance only.",
    "run_id": uid(207, 1), "module": "Image analysis · pre-read", "status": "UNCERTAIN", "confidence": 0.58,
    "headline": "Possible small opacity, left lower zone",
    "evidence": ["Left lower zone, about 22 mm", "Not seen on 09/26 prior"],
    "note": "Radiology pre-read model of ai_run 0207-1; the Doctor-app model reads the right lower zone (0.71). The doctor decides.",
}
# (order, modality, body, view, prio, room, contrast, note, status, performed, reporting, burned, checklist, started, completed, created, updated)
ST = [
    (named(3, ANJALI, "scan", "2026-10-15 10:12", "routine"), "XR", "Chest", "PA + lateral", "routine", 1, False,
     "Cough 3 weeks, post infection. Allergy alert: penicillin. No known contrast allergy.", "awaiting_report", FATHIMA, ARUN, True,
     {"id_matched": True, "views_acquired": True, "prior_linked": True, "sent_to_reporting_doctor": True, "ai_preread": AI_PREREAD},
     "2026-10-15 10:35", "2026-10-15 11:00"),
    (named(6, SPILLAI, "scan", "2026-10-16 12:20", "routine"), "ECHO", "Heart", "Transthoracic echocardiogram", "routine", None, False,
     "Cardiology referral work-up. Scheduled Tue 20 Oct 11:00.", "scheduled", None, ARUN, False,
     {"scheduled_for": "2026-10-20T11:00:00+05:30", "room_note": "no echo room in the equipment list"}, None, None),
    (named(8, JKURIAN, "scan", "2026-10-17 14:30", "urgent"), "XR", "Chest", "PA", "urgent", 1, False,
     "Ordered from the Doctor app.", "waiting", None, ARUN, False, {}, None, None),
    (named(9, TKURIAN, "scan", "2026-10-17 14:05", "urgent"), "CT", "Abdomen", "With IV contrast", "urgent", 3, True,
     "RLQ pain, ? appendicitis. Contrast: IV, creatinine 0.9. CT room 1.", "in_progress", VINOD, SREEJA, False,
     {"id_matched": True, "contrast_consent": True, "creatinine_mg_dl": 0.9}, "2026-10-17 14:18", None),
    (named(10, DIVYA, "scan", "2026-10-17 13:50", "routine"), "USG", "Pelvis (obstetric)", "20-week anomaly scan", "routine", 5, False,
     "Anomaly scan. USG room 2.", "in_progress", FATHIMA, LEELA, False, {"id_matched": True}, "2026-10-17 13:58", None),
    (named(11, AKHIL, "scan", "2026-10-17 14:18", "urgent"), "XR", "Wrist", "AP/LAT, right", "urgent", 1, False,
     "Fall from bike, swelling. X-ray DR 1.", "waiting", None, ARUN, False, {}, None, None),
    (named(12, MARIAMMA, "scan", "2026-10-17 14:22", "stat"), "CT", "Head", "Plain", "stat", 3, False,
     "Sudden weakness, 72 y, CKD stage 3. CT room 1.", "waiting", None, VIVEK, False, {}, None, None),
    (named(13, SPILLAI, "scan", "2026-10-14 15:10", "routine"), "MRI", "Brain", "With gadolinium", "routine", 6, True,
     "Chronic headache. Rescheduled to Mon 19 Oct 14:00 (MRI 1.5T out of service on Sat 17 Oct).", "scheduled", None, SREEJA, False,
     {"scheduled_for": "2026-10-19T14:00:00+05:30", "moved_because": "MRI downtime"}, None, None),
    (named(14, BINDU_V, "scan", "2026-10-16 15:00", "routine"), "USG", "Neck (thyroid)", "Thyroid ultrasound", "routine", 5, False,
     "Neck swelling. Images uploaded 10:40.", "uploaded", FATHIMA, ARUN, True,
     {"id_matched": True, "views_acquired": True, "prior_linked": False, "sent_to_reporting_doctor": False}, "2026-10-17 10:15", "2026-10-17 10:40"),
    (named(26, GOPI, "scan", "2026-10-17 09:40", "stat"), "PORTABLE", "Chest", "AP portable", "stat", 2, False,
     "Portable. Nurse prep 11:45.", "waiting", None, SREEJA, False, {}, None, None),
    (X3, "XR", "Chest", "PA", "routine", 1, False, "Prior study (Sep 2026) for comparison.", "reported", FATHIMA, ARUN, True,
     {"id_matched": True, "views_acquired": True}, "2026-09-20 10:50", "2026-09-20 11:15"),
    (X4, "XR", "Chest", "PA", "routine", 1, False, "Prior study (Mar 2025) for comparison.", "reported", FATHIMA, ARUN, True,
     {"id_matched": True, "views_acquired": True}, "2025-03-18 10:15", "2025-03-18 10:30"),
]
rows = []
for o, mod, body, view, pr, room, contrast, note, status, perf, rep, burned, chk, st, en in ST:
    upd = en or st or o.created
    rows.append(f"({U(K_STUDY, o.key)}, {o.lit}, {P(o.patient)}, {HOSP}, {q(mod)}, {q(body)}, {q(view)}, '{pr}'::records.order_priority, "
                f"{U(K_ROOM, room) if room else 'NULL'}, {bo(contrast)}, {q(note)}, {q(status)}, {A(perf) if perf else 'NULL'}, {A(rep)}, "
                f"{bo(burned)}, {jb(chk)}, {ts(st)}, {ts(en)}, {ts(o.created)}, {ts(upd)})")
insert("imaging.study", "id, order_id, patient_person_id, hospital_id, modality, body_part, view_text, priority, room_id, contrast, clinical_note, status, "
       "performed_by_user_id, reporting_doctor_user_id, burned_in_name_checked, checklist, started_at, completed_at, created_at, updated_at", rows)

emit("\n-- ---------- imaging.room_slot (kind 0313): Sat 17 Oct schedule of the design, MRI blocked, two Mon / Tue MRI slots ----------")
D = "2026-10-17"
SLOTS = [
    # room, start, end, study key, label
    (1, f"{D} 09:00", f"{D} 10:00", None, "Chest PA (booked)"), (1, f"{D} 10:00", f"{D} 11:00", None, "Knee AP/LAT (booked)"),
    (1, f"{D} 11:00", f"{D} 12:00", None, "Chest PA (booked)"), (1, f"{D} 12:00", f"{D} 13:00", None, "Lunch"),
    (1, f"{D} 13:00", f"{D} 14:00", None, "Spine LS (booked)"), (1, f"{D} 15:00", f"{D} 16:00", None, "Hand PA (booked)"),
    (3, f"{D} 09:00", f"{D} 10:00", None, "CT head (booked)"), (3, f"{D} 11:00", f"{D} 12:00", None, "CT KUB (booked)"),
    (3, f"{D} 12:00", f"{D} 13:00", None, "Lunch"), (3, f"{D} 13:00", f"{D} 14:00", None, "CT chest (booked)"),
    (3, f"{D} 14:00", f"{D} 15:00", 9, "CT abdomen with contrast"),
    (5, f"{D} 09:00", f"{D} 10:00", None, "Abdomen (booked)"), (5, f"{D} 10:00", f"{D} 11:00", 14, "Thyroid ultrasound"),
    (5, f"{D} 12:00", f"{D} 13:00", None, "Lunch"), (5, f"{D} 13:00", f"{D} 14:00", 10, "Obstetric scan, 20 weeks"),
    (5, f"{D} 14:00", f"{D} 15:00", None, "Pelvis (booked)"),
    (6, f"{D} 08:00", f"{D} 17:00", None, "Out of service all day (service Mon 19 Oct)"),
    (6, "2026-10-19 14:00", "2026-10-19 15:00", 13, "MRI brain with gadolinium (moved from Sat)"),
    (6, "2026-10-20 09:30", "2026-10-20 10:30", None, "MRI knee (moved because of downtime)"),
]
insert("imaging.room_slot", "id, room_id, study_id, during, label",
       [f"({U(K_SLOT, i)}, {U(K_ROOM, r)}, {U(K_STUDY, s) if s else 'NULL'}, {rng(a, b)}, {q(lb)})" for i, (r, a, b, s, lb) in enumerate(SLOTS, 1)])

emit("\n-- ---------- imaging.study_series (kind 0314, serial = study key * 10 + series_no) ----------")
SERIES = [
    (3, 1, "XR", "Chest PA", 1), (3, 2, "XR", "Chest lateral (file not stored in the demo)", 1),
    (14, 1, "USG", "Thyroid, transverse and longitudinal", 24),
    (1003, 1, "XR", "Chest PA (prior Sep 2026)", 1), (1004, 1, "XR", "Chest PA (prior Mar 2025)", 1),
]
insert("imaging.study_series", "id, study_id, series_no, modality, description, instance_count",
       [f"({U(K_SERIES, k * 10 + no)}, {U(K_STUDY, k)}, {no}, {q(m)}, {q(d)}, {c})" for k, no, m, d, c in SERIES])

emit("\n-- system folders of Bindu Vijayan (the document below goes to Doctor uploads); no-op if they exist")
emit(f"DO $$ BEGIN PERFORM records.create_system_folders({P(BINDU_V)}::uuid, {A(BINDU_V)}::uuid); END $$;")
emit("\n-- ---------- records.document (kind 0316) for the thyroid ultrasound images of Bindu Vijayan (Doctor uploads folder) ----------")
sk = "demo/imaging/ORD-DEMO-0014/thyroid-us-series-001.zip"
insert("records.document", "id, patient_person_id, folder_id, title, doc_type, storage_key, mime_type, size_bytes, sha256, enc_key_id, created_by_user_id, session_id, created_at, source_label, signature_note",
       [f"({U(K_DOC, 1)}, {P(BINDU_V)}, (SELECT id FROM records.folder WHERE patient_person_id = {P(BINDU_V)} AND kind = 'doctor_uploads'), "
        f"'Thyroid ultrasound, images', 'scan'::records.doc_type, {q(sk)}, 'application/zip', 25165824, decode('{hashlib.sha256(sk.encode()).hexdigest()}', 'hex'), "
        f"'demo-none', {A(FATHIMA)}, NULL, {ts('2026-10-17 10:40')}, 'Radiology, Demo General Hospital', 'Not reported yet')"])

emit("\n-- ---------- imaging.study_file (kind 0315): citizen DICOM of Anjali (document 0101-2, from 10_) and Bindu's ZIP ----------")
insert("imaging.study_file", "id, study_id, series_id, document_id, kind, uploaded_by_user_id, uploaded_at",
       [f"({U(K_FILE, 3)}, {U(K_STUDY, 3)}, {U(K_SERIES, 31)}, {U(101, 2)}, 'dicom', {A(FATHIMA)}, {ts('2026-10-15 10:55')})",
        f"({U(K_FILE, 14)}, {U(K_STUDY, 14)}, {U(K_SERIES, 141)}, {U(K_DOC, 1)}, 'zip', {A(FATHIMA)}, {ts('2026-10-17 10:40')})"])

emit("\n-- ---------- imaging.exposure: Chest PA of Anjali (110 kVp, 2.5 mAs, DAP 0.08 Gy.cm2 = 800 mGy.cm2) ----------")
insert("imaging.exposure", "study_id, kvp, mas, dap_mgycm2, exposure_ms, operator_user_id, recorded_at",
       [f"({U(K_STUDY, 3)}, 110.0, 2.50, 800.00, 20, {A(FATHIMA)}, {ts('2026-10-15 10:50')})",
        f"({U(K_STUDY, 1003)}, 109.0, 2.60, 820.00, 20, {A(FATHIMA)}, {ts('2026-09-20 10:55')})",
        f"({U(K_STUDY, 1004)}, 110.0, 2.80, 850.00, 22, {A(FATHIMA)}, {ts('2025-03-18 10:20')})"])

emit("\n-- ---------- imaging.study_prior: the 15 Oct chest X-ray is linked to the Sep 2026 and Mar 2025 films ----------")
insert("imaging.study_prior", "study_id, prior_study_id",
       [f"({U(K_STUDY, 3)}, {U(K_STUDY, 1003)})", f"({U(K_STUDY, 3)}, {U(K_STUDY, 1004)})"])

# ---- shift handovers (lab -> Anoop 14:00, radiology -> Vinod 16:00), drafts
emit("\n-- ---------- org.shift_handover (kind 0317) + handover_item (0318): lab to Anoop Krishnan 14:00, radiology to Vinod Kurian 16:00 (drafts) ----------")
insert("org.shift_handover", "id, hospital_id, unit_kind, unit_name, ward_id, shift_date, from_user_id, to_user_id, summary, ai_draft_text, ai_draft_simulated, created_at",
       [f"({U(K_HAND, 1)}, {HOSP}, 'lab', 'Central Lab', NULL, '2026-10-17'::date, {A(RAHUL)}, {A(ANOOP)}, "
        f"'Handover to Anoop Krishnan at 14:00. Electrolytes wait for the K+ L1 rerun; cultures incubating.', NULL, true, {ts('2026-10-17 09:05')})",
        f"({U(K_HAND, 2)}, {HOSP}, 'radiology', 'Radiology', NULL, '2026-10-17'::date, {A(FATHIMA)}, {A(VINOD)}, "
        f"'Handover to Vinod Kurian at 16:00. MRI 1.5T is down until Mon 19 Oct; DR 1 detector calibration due today.', NULL, true, {ts('2026-10-17 13:10')})"])
insert("org.handover_item", "id, handover_id, admission_id, patient_person_id, bed_id, order_id, flag, note, from_ai_draft, done_at, created_at",
       [f"({U(K_HITEM, 1)}, {U(K_HAND, 1)}, NULL, NULL, NULL, NULL, 'watch', 'Cobas c311 flagged calibration at 08:10: rerun K+ L1 before releasing electrolytes.', false, NULL, {ts('2026-10-17 09:05')})",
        f"({U(K_HITEM, 2)}, {U(K_HAND, 1)}, NULL, {P(MARY)}, NULL, {U(210, 23)}, 'pending', 'Urine culture (ORD-DEMO-0023) incubating, read at 18:00.', false, NULL, {ts('2026-10-17 08:30')})",
        f"({U(K_HITEM, 3)}, {U(K_HAND, 2)}, NULL, NULL, NULL, NULL, 'info', 'USG 2 gel warmer replaced. Obstetric list running 15 min late.', false, NULL, {ts('2026-10-17 13:10')})",
        f"({U(K_HITEM, 4)}, {U(K_HAND, 2)}, NULL, NULL, NULL, NULL, 'info', 'MRI orders for Mon-Tue confirmed with patients by SMS.', false, {ts('2026-10-17 11:45')}, {ts('2026-10-17 11:45')})",
        f"({U(K_HITEM, 5)}, {U(K_HAND, 2)}, NULL, NULL, NULL, NULL, 'watch', 'X-ray DR 1: detector calibration due today before 16:00.', false, NULL, {ts('2026-10-17 13:15')})"])

emit("\nCOMMIT;")

# ---- serial map into the header (inserted after the DEPENDS block)
MAP = """--
-- SERIAL MAPS (other seed files reference these ids)
--   kinds in use: 0301 clinical_order (extra), 0302 lab.order_item, 0303 lab.specimen, 0304 lab.result, 0305 lab.result_value,
--     0306 lab.critical_call, 0307 lab.instrument, 0308 lab.reagent_lot, 0309 lab.qc_run, 0310 imaging.room, 0311 imaging.equipment_event,
--     0312 imaging.study, 0313 imaging.room_slot, 0314 imaging.study_series, 0315 imaging.study_file, 0316 records.document,
--     0317 org.shift_handover, 0318 org.handover_item
--   "order key" = the serial of the 0210 order (1..30) or 1000 + the serial of the 0301 order below.
--   0301 clinical_order: 1 = ORD-DEMO-0101 Anjali LDL + HbA1c 12 Jun 2026 | 2 = ORD-DEMO-0102 Abdul Rasheed WBC + CRP 12 Oct |
--     3 = ORD-DEMO-0103 Anjali chest X-ray 20 Sep 2026 (prior) | 4 = ORD-DEMO-0104 Anjali chest X-ray Mar 2025 (prior) |
--     101..{last} = ORD-DEMO-{first_ref}..{last_ref} background lab orders (serial 100 + n, ref 1000 + n; released, 7 days)
--   lab.order_item   serial = order key * 100 + line   | lab.specimen serial = order key * 10 + 1 (recollected sample: + 2)
--   lab.result       serial = order key                | lab.result_value serial = order key * 100 + line
--   lab results by order (status): 0001 released | 0002 released | 0004 released (critical K+) | 0016 draft (to verify) | 0020 draft | 0021 draft |
--     0024 preliminary (blood culture) | 1001 / 1002 released history | background 1101..{key_last} released
--   lab.critical_call 1 = K+ 6.1 Thomas Varghese (result value 0304/0305 serial 40001, order 0004), called to Dr. Sreeja Paul
--   lab.instrument 1 Sysmex XN-DEMO | 2 Cobas c311 DEMO | 3 ABG analyser | 4 HbA1c analyser ; reagent_lot 1 HbA1c 24K18 | 2 CRP 31C02
--   lab.qc_run 1..19 glucose L2 history (28 Sep .. 16 Oct) | 20 glucose L2 07:40 | 21 Hb L1 07:42 | 22 K L1 07:55 (1_2s) | 23 K L1 08:20
--   imaging.room 1 X-ray DR 1 | 2 Portable X-ray | 3 CT room 1 | 4 USG 1 | 5 USG 2 | 6 MRI 1.5T | 7 Mammography
--   imaging.study serial = order key: 0003 Anjali chest X-ray (awaiting_report) | 0006 echo (scheduled) | 0008 (waiting) | 0009 CT abdomen (in_progress) |
--     0010 obstetric USG (in_progress) | 0011 wrist (waiting) | 0012 CT head (waiting) | 0013 MRI brain (scheduled Mon 19 Oct 14:00) |
--     0014 thyroid USG (uploaded) | 0026 portable chest (waiting) | 1003 prior Sep 2026 | 1004 prior Mar 2025
--   imaging.study_series serial = study key * 10 + series_no | imaging.study_file serial = study key | records.document 0316-1 = thyroid USG images
--   org.shift_handover 0317: 1 lab (Rahul to Anoop 14:00, draft) | 2 radiology (Fathima to Vinod 16:00, draft); items 0318-1..5
--"""
text = "\n".join(sql)
last_bg = max(b["idx"] for b in BG)
MAP = MAP.format(last=100 + last_bg, first_ref=f"{1001:04d}", last_ref=f"{1000 + last_bg:04d}", key_last=1000 + 100 + last_bg)
text = text.replace("-- =====================================================================\nBEGIN;", MAP + "\n-- =====================================================================\nBEGIN;", 1)
OUT.write_text(text + "\n", encoding="utf-8")
print(f"wrote {OUT}  ({len(text.splitlines())} lines)")

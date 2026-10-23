"""Shared helpers of 50_build_hospital_admin.py and 60_build_gov_console.py (generators of 50_hospital_admin.sql / 60_gov_console.sql)."""
import hashlib


def uid(kind: int, n: int) -> str:
    return f"cfd00000-{kind:04d}-4000-8000-{n:012d}"


def q(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def ist(s: str) -> str:
    """'2026-10-17 10:12' (IST) -> SQL timestamptz literal."""
    if len(s) == 10:
        s += " 00:00"
    return f"'{s}:00+05:30'::timestamptz"


def jb(obj) -> str:
    import json
    return q(json.dumps(obj, ensure_ascii=False, separators=(", ", ": "))) + "::jsonb"


def arr(items) -> str:
    return "ARRAY[" + ", ".join(q(x) for x in items) + "]::text[]"


def tok(slug: str) -> str:
    return "tok_DEMO_" + hashlib.sha256(("cfd-" + slug).encode()).hexdigest()[:12]


def lr_alloc(total: int, weights: list) -> list:
    """Largest-remainder allocation of an integer total over weights (sums exactly to total)."""
    s = sum(weights)
    raw = [total * w / s for w in weights]
    base = [int(x) for x in raw]
    left = total - sum(base)
    order = sorted(range(len(weights)), key=lambda i: (-(raw[i] - base[i]), i))
    for i in order[:left]:
        base[i] += 1
    return base


def person_rows(rows):
    """rows: (serial, name, dob, sex, slug, kyc) -> INSERT identity.person statement text. Kind 0603 handled by caller."""
    raise NotImplementedError


class Out:
    def __init__(self):
        self.parts = []
        self.counts = {}

    def w(self, s=""):
        self.parts.append(s)

    def insert(self, table, cols, rows, label=None, conflict="ON CONFLICT DO NOTHING"):
        """rows: list of strings '(…)' (already formatted)."""
        if not rows:
            return
        self.w(f"INSERT INTO {table} ({cols}) VALUES")
        self.w(",\n".join("  " + r for r in rows))
        self.w(conflict + ";")
        self.counts[label or table] = self.counts.get(label or table, 0) + len(rows)
        self.w()

    def text(self):
        return "\n".join(self.parts)

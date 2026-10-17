"""Temporal (vitals trend) analysis. SIMULATED interpretation.

Trend arithmetic (first half vs second half mean) is computed from the input,
but the clinical interpretation and confidence levels are simulated.
"""

from statistics import mean

from fastapi import APIRouter

from schemas import (
    AIConfidence,
    AISuggestion,
    DisagreementReport,
    EvidenceSource,
    MetricTrend,
    TemporalRequest,
    TemporalResponse,
    level_from_score,
    utc_now,
)

router = APIRouter(prefix="/api/v1/temporal", tags=["temporal (simulated)"])

MODEL_VERSION = "temporal-sim-0.1.0"

METRICS = ["systolic", "diastolic", "heart_rate", "spo2", "temperature_c", "glucose_mg_dl"]
# Percent change below this counts as stable.
STABLE_BAND = {
    "systolic": 3.0,
    "diastolic": 3.0,
    "heart_rate": 5.0,
    "spo2": 1.0,
    "temperature_c": 0.5,
    "glucose_mg_dl": 8.0,
}


def _numbers(history: list[dict], metric: str) -> list[float]:
    out = []
    for r in history:
        v = r.get(metric)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out.append(float(v))
    return out


def _trend(history: list[dict], metric: str) -> MetricTrend | None:
    vals = _numbers(history, metric)
    if len(vals) < 2:
        return None
    mid = len(vals) // 2
    first, second = mean(vals[:mid]), mean(vals[mid:])
    change = 0.0 if first == 0 else (second - first) / first * 100.0
    band = STABLE_BAND[metric]
    direction = "stable" if abs(change) < band else ("rising" if change > 0 else "falling")
    return MetricTrend(
        metric=metric,
        readings_used=len(vals),
        first_half_mean=round(first, 1),
        second_half_mean=round(second, 1),
        change_percent=round(change, 1),
        direction=direction,
    )


def _src(name: str, detail: str) -> list[EvidenceSource]:
    return [EvidenceSource(source=name, detail=detail)]


@router.post("/analyze", response_model=TemporalResponse)
def analyze_trends(req: TemporalRequest) -> TemporalResponse:
    """Simulated vitals trend analysis. Returns top-3 suggestions."""
    history = req.vitals_history
    trends = [t for m in METRICS if (t := _trend(history, m))]
    by_metric = {t.metric: t for t in trends}

    # (score, suggestion, reasoning, evidence)
    cands: list[tuple[float, str, str, list[EvidenceSource]]] = []

    def t(metric: str) -> MetricTrend | None:
        return by_metric.get(metric)

    sys_t, spo2_t, temp_t, glu_t, hr_t = t("systolic"), t("spo2"), t("temperature_c"), t("glucose_mg_dl"), t("heart_rate")

    if sys_t and sys_t.direction == "rising":
        s = min(0.9, 0.55 + abs(sys_t.change_percent) / 40)
        cands.append((s, "Rising blood pressure trend: review hypertension control",
                      f"Mean systolic rose from {sys_t.first_half_mean} to {sys_t.second_half_mean} mmHg. Check adherence to antihypertensives (e.g. amlodipine) and salt intake.",
                      _src("India Hypertension Control Initiative protocol (simulated citation)", "Review treatment if BP stays above target on repeat readings.")))
    if sys_t and sys_t.direction == "falling" and sys_t.second_half_mean < 100:
        cands.append((0.6, "Falling blood pressure trend: check for dehydration or over-treatment",
                      f"Mean systolic fell to {sys_t.second_half_mean} mmHg.",
                      _src("Primary care vitals guide (simulated)", "Low BP with symptoms needs prompt assessment.")))
    if spo2_t and spo2_t.direction == "falling":
        s = min(0.92, 0.6 + abs(spo2_t.change_percent) / 10)
        cands.append((s, "Falling oxygen saturation trend: assess for respiratory compromise",
                      f"Mean SpO2 fell from {spo2_t.first_half_mean}% to {spo2_t.second_half_mean}%. Consider chest examination and imaging.",
                      _src("Respiratory monitoring guide (simulated citation)", "SpO2 below 94% on repeat readings needs evaluation.")))
    if temp_t and temp_t.direction == "rising":
        s = min(0.88, 0.55 + abs(temp_t.change_percent) / 5)
        cands.append((s, "Rising temperature trend: evolving febrile illness",
                      f"Mean temperature rose from {temp_t.first_half_mean} to {temp_t.second_half_mean} C. Consider dengue, malaria or typhoid work-up in season; paracetamol (e.g. Crocin, Dolo-650) is a doctor's choice for symptom relief.",
                      _src("NVBDCP / NCVBDC fever guidance (simulated citation)", "Persistent fever needs a cause-directed work-up.")))
    if glu_t and glu_t.direction == "rising":
        s = min(0.9, 0.55 + abs(glu_t.change_percent) / 60)
        cands.append((s, "Rising glucose trend: review glycaemic control",
                      f"Mean glucose rose from {glu_t.first_half_mean} to {glu_t.second_half_mean} mg/dL. Consider HbA1c and review of metformin or diet.",
                      _src("ICMR diabetes guidance (simulated citation)", "Rising readings over time suggest worsening control.")))
    if hr_t and hr_t.direction == "rising":
        cands.append((0.58, "Rising heart rate trend: look for fever, pain, anaemia or volume loss",
                      f"Mean heart rate rose from {hr_t.first_half_mean} to {hr_t.second_half_mean} bpm.",
                      _src("Vitals interpretation guide (simulated)", "Tachycardia trends often reflect an underlying stressor.")))

    cands.sort(key=lambda c: c[0], reverse=True)

    suggestions: list[AISuggestion] = []
    for i, (score, text, reasoning, ev) in enumerate(cands[:3], start=1):
        suggestions.append(
            AISuggestion(
                rank=i, suggestion=text, confidence=level_from_score(round(score, 2)),
                confidence_score=round(score, 2), evidence=ev,
                reasoning=f"{reasoning} Simulated trend reading for a doctor to review.",
            )
        )

    # Fill with "stable" style suggestions so we always return three.
    stable_pad = [
        ("No concerning trend in the supplied vitals", "Available metrics are within stable bands in this simulated read."),
        ("Continue routine monitoring", "Keep recording vitals at the usual interval."),
        ("Consider adding more metrics or readings", "More data points make the simulated trend read more reliable."),
    ]
    n_readings = len(history)
    while len(suggestions) < 3:
        i = len(suggestions) + 1
        text, reasoning = stable_pad[i - 1]
        score = 0.7 if (not cands and i == 1 and n_readings >= 4) else 0.3
        suggestions.append(
            AISuggestion(
                rank=i, suggestion=text, confidence=level_from_score(score), confidence_score=score,
                evidence=_src("Simulated trend engine", f"{len(trends)} metric trend(s) computed from {n_readings} reading(s)."),
                reasoning=f"{reasoning} Simulated output.",
            )
        )

    # Disagreement: conflicting signals between metrics.
    disagreement = None
    details = []
    if hr_t and sys_t and hr_t.direction == "rising" and sys_t.direction == "falling":
        details.append("Heart rate is rising while blood pressure is falling; this can signal volume loss or sepsis and conflicts with a simple 'stable' read.")
    if temp_t and temp_t.direction == "rising" and hr_t and hr_t.direction == "falling":
        details.append("Temperature is rising but heart rate is falling, which is an unusual combination worth checking for measurement error.")
    if n_readings < 4 and trends:
        details.append("Very few readings were supplied, so the trend direction itself is uncertain.")
    if details:
        disagreement = DisagreementReport(
            has_disagreement=True,
            modules_compared=["temporal-trend-sim", "temporal-rules-sim"],
            summary="Simulated trend signals conflict or are weakly supported.",
            details=details,
        )

    # With very little data, nothing may be stronger than UNCERTAIN.
    if n_readings < 4:
        suggestions = [
            s.model_copy(update={"confidence": AIConfidence.UNCERTAIN, "confidence_score": min(s.confidence_score, 0.45)})
            for s in suggestions
        ]

    return TemporalResponse(
        suggestions=suggestions,
        model_version=MODEL_VERSION,
        timestamp=utc_now(),
        disagreement_report=disagreement,
        readings_received=n_readings,
        trends=trends,
    )

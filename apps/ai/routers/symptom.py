"""Symptom analysis (chat-based). SIMULATED output only."""

from fastapi import APIRouter

from schemas import (
    AIConfidence,
    AISuggestion,
    DisagreementReport,
    EvidenceSource,
    SymptomRequest,
    SymptomResponse,
    level_from_score,
    seeded_int,
    utc_now,
)

router = APIRouter(prefix="/api/v1/symptom", tags=["symptom (simulated)"])

MODEL_VERSION = "symptom-sim-0.1.0"

# Small fake knowledge base: condition -> keywords, reasoning, evidence.
# Indian context. Drug names are examples for a doctor, never a prescription.
_CONDITIONS: list[dict] = [
    {
        "name": "Dengue fever",
        "keywords": ["fever", "bukhar", "headache", "body ache", "joint pain", "rash", "retro-orbital", "vomiting"],
        "reasoning": (
            "Fever with body ache and headache during monsoon season fits dengue. "
            "A doctor may consider paracetamol (e.g. Crocin, Dolo-650) for fever and "
            "would normally avoid NSAIDs until dengue is ruled out."
        ),
        "evidence": [
            ("NVBDCP dengue case management guideline (simulated citation)", "Fever with 2+ of headache, myalgia, rash, retro-orbital pain is a suspected case."),
            ("Regional seasonal pattern (simulated)", "Higher dengue incidence after monsoon in many Indian states."),
        ],
        "red_flags": ["Persistent vomiting", "Bleeding from gums or nose", "Severe abdominal pain"],
    },
    {
        "name": "Malaria",
        "keywords": ["fever", "chills", "shivering", "sweating", "headache", "vomiting", "body ache"],
        "reasoning": "Cyclic fever with chills and sweating suggests malaria; a rapid diagnostic test or smear is needed to confirm.",
        "evidence": [
            ("NCVBDC malaria guideline (simulated citation)", "Fever with chills in an endemic area warrants a blood smear or RDT."),
        ],
        "red_flags": ["Altered consciousness", "Very dark urine", "Breathlessness"],
    },
    {
        "name": "Typhoid (enteric fever)",
        "keywords": ["fever", "abdominal pain", "stomach pain", "constipation", "diarrhoea", "diarrhea", "weakness", "headache"],
        "reasoning": "Step-ladder fever with abdominal discomfort and weakness is typical of enteric fever; blood culture helps confirm.",
        "evidence": [
            ("ICMR antimicrobial guidance (simulated citation)", "Send blood culture before starting antibiotics where possible."),
        ],
        "red_flags": ["Black stools", "Severe abdominal pain", "Confusion"],
    },
    {
        "name": "Pulmonary tuberculosis",
        "keywords": ["cough", "khansi", "night sweats", "weight loss", "blood in sputum", "hemoptysis", "chest pain", "fever"],
        "reasoning": "Cough lasting more than two weeks with weight loss or night sweats should prompt sputum testing (CBNAAT/NAAT) under the national TB programme.",
        "evidence": [
            ("NTEP diagnostic algorithm (simulated citation)", "Cough over 2 weeks is presumptive TB; test sputum."),
        ],
        "red_flags": ["Coughing blood", "Marked breathlessness", "Rapid weight loss"],
    },
    {
        "name": "Community-acquired pneumonia",
        "keywords": ["cough", "fever", "shortness of breath", "breathlessness", "chest pain", "fast breathing"],
        "reasoning": "Fever, cough and fast breathing suggest a lower respiratory infection; oxygen saturation and chest imaging guide the next step.",
        "evidence": [
            ("Indian respiratory society guidance (simulated citation)", "Check SpO2 and respiratory rate; image the chest if hypoxic."),
        ],
        "red_flags": ["SpO2 below 94%", "Bluish lips", "Confusion"],
    },
    {
        "name": "Type 2 diabetes mellitus (new or uncontrolled)",
        "keywords": ["excessive thirst", "frequent urination", "polyuria", "fatigue", "blurred vision", "weight loss", "tingling", "numbness"],
        "reasoning": "Thirst, frequent urination and fatigue raise the possibility of high blood sugar; fasting and post-meal glucose with HbA1c are the usual checks.",
        "evidence": [
            ("ICMR-INDIAB study context (simulated citation)", "High and rising diabetes prevalence across Indian states."),
        ],
        "red_flags": ["Fruity breath", "Drowsiness", "Persistent vomiting"],
    },
    {
        "name": "Hypertension (possible)",
        "keywords": ["headache", "dizziness", "chest pain", "palpitations", "blurred vision", "nosebleed"],
        "reasoning": "Headache and dizziness with palpitations can accompany raised blood pressure; repeat BP readings are needed to confirm.",
        "evidence": [
            ("India Hypertension Control Initiative protocol (simulated citation)", "Confirm with two readings on separate occasions."),
        ],
        "red_flags": ["Chest pain at rest", "Weakness on one side", "Slurred speech"],
    },
    {
        "name": "Acute gastroenteritis",
        "keywords": ["diarrhoea", "diarrhea", "vomiting", "loose motions", "stomach pain", "abdominal pain", "nausea", "fever"],
        "reasoning": "Loose motions with vomiting suggest gastroenteritis; hydration (ORS) status is the key thing to assess.",
        "evidence": [
            ("National diarrhoea control guidance (simulated citation)", "ORS and zinc are first-line for dehydration in children."),
        ],
        "red_flags": ["Sunken eyes", "No urine for 8 hours", "Blood in stool"],
    },
    {
        "name": "Viral upper respiratory infection",
        "keywords": ["cough", "cold", "sore throat", "runny nose", "sneezing", "fever", "headache"],
        "reasoning": "Cold, sore throat and mild fever usually point to a self-limiting viral infection; paracetamol (e.g. Dolo-650) may be used for symptom relief at a doctor's discretion.",
        "evidence": [
            ("Primary care symptom guide (simulated citation)", "Most viral URIs settle in 5 to 7 days."),
        ],
        "red_flags": ["Fever over 5 days", "Difficulty swallowing", "Breathlessness"],
    },
    {
        "name": "Iron-deficiency anaemia",
        "keywords": ["fatigue", "weakness", "pale", "dizziness", "breathlessness", "palpitations", "hair fall"],
        "reasoning": "Tiredness, pallor and dizziness are common in anaemia, which is widespread among Indian women and adolescents; a haemoglobin test is the first step.",
        "evidence": [
            ("NFHS anaemia prevalence data (simulated citation)", "High anaemia burden in women and children."),
        ],
        "red_flags": ["Fainting", "Chest pain", "Severe breathlessness"],
    },
]

# Fallback suggestions used to always return three items.
_FALLBACKS = ["Viral upper respiratory infection", "Acute gastroenteritis", "Iron-deficiency anaemia"]


def _score_condition(cond: dict, symptoms: list[str], seed: int) -> tuple[float, int]:
    """Return (simulated score, number of keyword matches)."""
    text = " ".join(s.lower() for s in symptoms)
    matches = sum(1 for kw in cond["keywords"] if kw in text)
    # Small deterministic jitter so scores are not perfectly flat.
    jitter = (seeded_int(seed, cond["name"]) % 90) / 1000.0  # 0.000 - 0.089
    score = min(0.93, 0.18 + 0.17 * matches + jitter) if matches else 0.15 + jitter
    return round(score, 2), matches


@router.post("/analyze", response_model=SymptomResponse)
def analyze_symptoms(req: SymptomRequest) -> SymptomResponse:
    """Simulated chat-based symptom analysis. Returns top-3 suggestions."""
    seed = seeded_int(*sorted(s.lower() for s in req.symptoms))

    scored = []
    for cond in _CONDITIONS:
        score, matches = _score_condition(cond, req.symptoms, seed)
        scored.append((score, matches, cond))
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    top = scored[:3]

    suggestions: list[AISuggestion] = []
    for i, (score, matches, cond) in enumerate(top, start=1):
        level = level_from_score(score)
        # No keyword match at all can never be better than UNCERTAIN.
        if matches == 0:
            level = AIConfidence.UNCERTAIN
        suggestions.append(
            AISuggestion(
                rank=i,
                suggestion=f"Possible: {cond['name']}",
                confidence=level,
                confidence_score=score,
                evidence=[EvidenceSource(source=s, detail=d) for s, d in cond["evidence"]],
                reasoning=(
                    f"{cond['reasoning']} Matched {matches} reported symptom keyword(s). "
                    "This is a simulated suggestion for a doctor to review, not a diagnosis."
                ),
            )
        )

    # Internal disagreement: simulated sub-models disagree when top-2 scores are close.
    disagreement = None
    if len(top) >= 2 and abs(top[0][0] - top[1][0]) < 0.08:
        disagreement = DisagreementReport(
            has_disagreement=True,
            modules_compared=["symptom-rules-sim", "symptom-retrieval-sim"],
            summary="Simulated sub-models could not clearly separate the top two suggestions.",
            details=[
                f"'{top[0][2]['name']}' (score {top[0][0]}) and '{top[1][2]['name']}' (score {top[1][0]}) are very close.",
                "Additional tests or history are needed to separate them.",
            ],
        )

    red_flags = sorted({rf for _, m, c in top if m > 0 for rf in c["red_flags"]})[:5]

    return SymptomResponse(
        suggestions=suggestions,
        model_version=MODEL_VERSION,
        timestamp=utc_now(),
        disagreement_report=disagreement,
        red_flags=red_flags,
    )

"""Medical image analysis. SIMULATED output only.

The uploaded file is read only to compute a hash (so the same file gives the
same fake result). It is not stored, decoded or sent anywhere.
"""

import hashlib

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from schemas import (
    AIConfidence,
    AISuggestion,
    DisagreementReport,
    EvidenceSource,
    ImageResponse,
    level_from_score,
    seeded_int,
    utc_now,
)

router = APIRouter(prefix="/api/v1/image", tags=["image (simulated)"])

MODEL_VERSION = "image-sim-0.1.0"
MAX_BYTES = 15 * 1024 * 1024  # 15 MB
ALLOWED_PREFIXES = ("image/",)
ALLOWED_EXACT = {"application/dicom", "application/octet-stream"}

# Fake findings per modality. (suggestion, reasoning, evidence source, evidence detail)
_FINDINGS: dict[str, list[tuple[str, str, str, str]]] = {
    "chest X-ray (simulated)": [
        ("Right lower zone opacity, possible consolidation", "Increased density in the right lower zone is consistent with pneumonia; correlate with clinical findings.", "Chest radiograph pattern library (simulated)", "Lobar opacity with air bronchograms."),
        ("Upper zone fibro-cavitary changes, possible tuberculosis", "Upper zone scarring or cavities are a known pattern in pulmonary TB; sputum NAAT is advised.", "NTEP imaging reference (simulated citation)", "Upper lobe cavitation raises TB suspicion."),
        ("Cardiomegaly, cardiothoracic ratio increased", "Enlarged cardiac shadow; echocardiography may be considered.", "Cardiac size heuristics (simulated)", "CTR above 0.5 on PA view."),
        ("No acute cardiopulmonary abnormality seen", "No obvious focal lesion on this simulated read.", "Normal variant library (simulated)", "Clear lung fields, sharp costophrenic angles."),
        ("Blunted costophrenic angle, possible pleural effusion", "Fluid in the pleural space can blunt the angle; ultrasound can confirm.", "Pleural pattern library (simulated)", "Meniscus sign at the lung base."),
    ],
    "skin photograph (simulated)": [
        ("Annular scaly patch, possible tinea (dermatophyte) infection", "Ring-shaped lesions with central clearing are common in tinea, frequent in humid regions.", "Dermatology image set (simulated)", "Annular plaque with raised scaly edge."),
        ("Hypopigmented anaesthetic patch, possible leprosy", "A pale patch with reduced sensation needs a slit-skin or clinical leprosy work-up.", "NLEP screening guide (simulated citation)", "Hypopigmented patch with sensory loss."),
        ("Erythematous plaque with silvery scale, possible psoriasis", "Well-defined red plaques with silvery scale fit psoriasis.", "Dermatology image set (simulated)", "Plaque on extensor surface."),
        ("Benign-appearing pigmented lesion", "Symmetric, even-coloured lesion; routine follow-up.", "Lesion symmetry heuristic (simulated)", "Regular border and uniform colour."),
        ("Papulovesicular rash, possible scabies", "Itchy burrows and papules between fingers fit scabies.", "Dermatology image set (simulated)", "Burrows in finger webs."),
    ],
    "retinal fundus photograph (simulated)": [
        ("Microaneurysms and dot haemorrhages, possible diabetic retinopathy", "Early diabetic retinal changes; refer for ophthalmology review.", "Diabetic retinopathy grading guide (simulated citation)", "Microaneurysms in the posterior pole."),
        ("Increased cup-to-disc ratio, possible glaucoma", "A large cup suggests glaucoma risk; check eye pressure and visual fields.", "Optic disc heuristics (simulated)", "Cup-to-disc ratio above 0.6."),
        ("No referable retinopathy seen", "No clear retinal lesion on this simulated read.", "Normal fundus library (simulated)", "Healthy macula and disc."),
        ("Retinal pallor, possible vascular occlusion", "Pale retina with narrowed vessels needs urgent review.", "Retinal vascular reference (simulated)", "Attenuated arterioles."),
        ("Hard exudates near macula, possible maculopathy", "Exudates near the macula can threaten central vision.", "Diabetic retinopathy grading guide (simulated citation)", "Circinate exudates."),
    ],
}


def _is_allowed(content_type: str | None) -> bool:
    if not content_type:
        return False
    return content_type.startswith(ALLOWED_PREFIXES) or content_type in ALLOWED_EXACT


@router.post("/analyze", response_model=ImageResponse)
async def analyze_image(
    file: UploadFile = File(..., description="Medical image (synthetic/demo images only)"),
    modality_hint: str | None = Form(
        default=None, description="Optional: chest_xray | skin | fundus"
    ),
) -> ImageResponse:
    """Simulated medical image analysis. Returns top-3 suggestions."""
    if not _is_allowed(file.content_type):
        raise HTTPException(status_code=415, detail="Upload an image file (PNG, JPEG or DICOM).")

    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB).")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    sha = hashlib.sha256(data).hexdigest()
    seed = seeded_int(sha)

    hint_map = {
        "chest_xray": "chest X-ray (simulated)",
        "skin": "skin photograph (simulated)",
        "fundus": "retinal fundus photograph (simulated)",
    }
    modalities = list(_FINDINGS.keys())
    modality = hint_map.get((modality_hint or "").lower()) or modalities[seed % len(modalities)]

    pool = _FINDINGS[modality]
    start = seed % len(pool)
    picks = [pool[(start + i) % len(pool)] for i in range(3)]

    scores = [0.62 + (seed % 25) / 100, 0.45 + ((seed >> 4) % 20) / 100, 0.25 + ((seed >> 8) % 20) / 100]
    scores = sorted((round(min(s, 0.93), 2) for s in scores), reverse=True)

    suggestions = []
    for i, ((text, reasoning, src, detail), score) in enumerate(zip(picks, scores), start=1):
        suggestions.append(
            AISuggestion(
                rank=i,
                suggestion=text,
                confidence=level_from_score(score),
                confidence_score=score,
                evidence=[EvidenceSource(source=src, detail=detail)],
                reasoning=f"{reasoning} Simulated finding for a radiologist or doctor to review; not a diagnosis.",
            )
        )

    # Simulated disagreement between the two heads of the image model.
    disagreement = None
    if seed % 3 == 0:
        disagreement = DisagreementReport(
            has_disagreement=True,
            modules_compared=["image-classifier-sim", "image-localiser-sim"],
            summary="Simulated classifier and localiser disagree on the main finding.",
            details=[
                f"Classifier favours: {picks[0][0]}.",
                f"Localiser highlights a region that fits better with: {picks[1][0]}.",
            ],
        )

    return ImageResponse(
        suggestions=suggestions,
        model_version=MODEL_VERSION,
        timestamp=utc_now(),
        disagreement_report=disagreement,
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=len(data),
        file_sha256=sha,
        modality_guess=modality,
    )

"""Genomic analysis (pharmacogenomic + risk). SIMULATED output only."""

from fastapi import APIRouter

from schemas import (
    AIConfidence,
    AISuggestion,
    DisagreementReport,
    EvidenceSource,
    GenomicRequest,
    GenomicResponse,
    PharmacogenomicFinding,
    RiskFinding,
    level_from_score,
    seeded_int,
    utc_now,
)

router = APIRouter(prefix="/api/v1/genomic", tags=["genomic (simulated)"])

MODEL_VERSION = "genomic-sim-0.1.0"

# gene -> fake knowledge. Gene/drug pairs are real-world themes, but the
# interpretations here are simplified and simulated.
_KB: dict[str, dict] = {
    "CYP2C19": {
        "drug": "clopidogrel",
        "brands": ["Clopilet", "Plavix"],
        "implication": "Reduced activation of clopidogrel is possible; a doctor may consider an alternative antiplatelet.",
        "base": 0.82,
        "risk": None,
    },
    "CYP2D6": {
        "drug": "tramadol / codeine",
        "brands": ["Ultracet", "Tramazac"],
        "implication": "Altered pain-drug metabolism is possible; response and side effects may differ.",
        "base": 0.66,
        "risk": None,
    },
    "SLCO1B1": {
        "drug": "atorvastatin",
        "brands": ["Atorva", "Lipitor"],
        "implication": "Higher chance of statin muscle side effects; a doctor may choose a lower dose or another statin.",
        "base": 0.74,
        "risk": None,
    },
    "HLA-B": {
        "drug": "carbamazepine",
        "brands": ["Tegretol", "Zen"],
        "implication": "Carries a higher risk of a severe skin reaction with carbamazepine in some South and Southeast Asian groups; HLA-B*15:02 testing is often discussed.",
        "base": 0.88,
        "risk": None,
    },
    "G6PD": {
        "drug": "primaquine / dapsone",
        "brands": ["Primaquine", "Dapsone"],
        "implication": "G6PD deficiency can cause red cell breakdown with these drugs; relevant to malaria treatment in India.",
        "base": 0.85,
        "risk": None,
    },
    "NUDT15": {
        "drug": "azathioprine / mercaptopurine",
        "brands": ["Imuran", "Purinethol"],
        "implication": "Increased risk of severe bone-marrow suppression; lower starting dose may be considered.",
        "base": 0.8,
        "risk": None,
    },
    "TPMT": {
        "drug": "azathioprine / mercaptopurine",
        "brands": ["Imuran", "Purinethol"],
        "implication": "Reduced enzyme activity can raise thiopurine toxicity; dose adjustment is often discussed.",
        "base": 0.78,
        "risk": None,
    },
    "VKORC1": {
        "drug": "warfarin",
        "brands": ["Warf", "Uniwarfin"],
        "implication": "May need a lower warfarin dose; INR monitoring remains essential.",
        "base": 0.7,
        "risk": None,
    },
    "HBB": {
        "drug": None,
        "brands": [],
        "implication": "",
        "base": 0.84,
        "risk": ("Beta-thalassaemia / sickle-cell trait or disease", "Carrier or affected status possible; counselling and family screening advised"),
    },
    "BRCA1": {
        "drug": None,
        "brands": [],
        "implication": "",
        "base": 0.76,
        "risk": ("Hereditary breast and ovarian cancer", "Higher than average lifetime risk (simulated band)"),
    },
    "BRCA2": {
        "drug": None,
        "brands": [],
        "implication": "",
        "base": 0.76,
        "risk": ("Hereditary breast and ovarian cancer", "Higher than average lifetime risk (simulated band)"),
    },
    "TCF7L2": {
        "drug": None,
        "brands": [],
        "implication": "",
        "base": 0.55,
        "risk": ("Type 2 diabetes", "Mildly increased risk (simulated band)"),
    },
}


def _gene_of(variant: dict) -> str | None:
    gene = variant.get("gene")
    return str(gene).strip().upper() if gene else None


@router.post("/analyze", response_model=GenomicResponse)
def analyze_genomics(req: GenomicRequest) -> GenomicResponse:
    """Simulated pharmacogenomic and risk analysis. Returns top-3 suggestions."""
    pgx: list[PharmacogenomicFinding] = []
    risks: list[RiskFinding] = []
    ranked: list[tuple[float, AISuggestion]] = []
    recognised = 0

    for v in req.variants:
        gene = _gene_of(v)
        # HLA-B alleles may be sent as "HLA-B*15:02"; match on the gene prefix.
        key = "HLA-B" if gene and gene.startswith("HLA-B") else gene
        entry = _KB.get(key) if key else None
        if not entry:
            continue
        recognised += 1

        genotype = str(v["genotype"]) if v.get("genotype") else None
        seed = seeded_int(key, genotype, v.get("rsid"))
        score = round(min(0.93, entry["base"] + (seed % 8) / 100), 2)
        level = level_from_score(score)
        src = EvidenceSource(
            source="PharmGKB / CPIC style guidance (simulated citation)",
            detail=f"Simulated interpretation for {key} {genotype or '(genotype not given)'}.",
        )

        if entry["drug"]:
            pgx.append(
                PharmacogenomicFinding(
                    gene=key,
                    genotype=genotype,
                    drug=entry["drug"],
                    indian_brand_examples=entry["brands"],
                    implication=entry["implication"],
                    confidence=level,
                )
            )
            ranked.append(
                (
                    score,
                    AISuggestion(
                        rank=1,
                        suggestion=f"Review {entry['drug']} use: {key} variant noted",
                        confidence=level,
                        confidence_score=score,
                        evidence=[src],
                        reasoning=f"{entry['implication']} Simulated finding for a doctor or pharmacist to review.",
                    ),
                )
            )
        if entry["risk"]:
            cond, band = entry["risk"]
            risks.append(RiskFinding(condition=cond, gene=key, relative_risk=band, confidence=level))
            ranked.append(
                (
                    score,
                    AISuggestion(
                        rank=1,
                        suggestion=f"Consider genetic counselling: {cond}",
                        confidence=level,
                        confidence_score=score,
                        evidence=[src],
                        reasoning=f"{band}. Simulated risk estimate; a clinical geneticist should interpret it.",
                    ),
                )
            )

    ranked.sort(key=lambda t: t[0], reverse=True)
    suggestions: list[AISuggestion] = []
    for i, (_, s) in enumerate(ranked[:3], start=1):
        suggestions.append(s.model_copy(update={"rank": i}))

    # Pad to three so the shape is always the same.
    pad = [
        "No further actionable variants recognised in the simulated panel",
        "Consider extending the panel to additional pharmacogenes",
        "Re-run after confirmatory lab genotyping",
    ]
    while len(suggestions) < 3:
        i = len(suggestions) + 1
        suggestions.append(
            AISuggestion(
                rank=i,
                suggestion=pad[i - 1],
                confidence=AIConfidence.UNCERTAIN,
                confidence_score=0.2,
                evidence=[
                    EvidenceSource(
                        source="Simulated variant panel",
                        detail=f"{recognised} of {len(req.variants)} submitted variants were recognised.",
                    )
                ],
                reasoning="Not enough recognised variants to make a stronger simulated suggestion.",
            )
        )

    # Disagreement: same drug flagged by two genes with different confidence levels,
    # or recognised variants far below those submitted.
    disagreement = None
    by_drug: dict[str, set[AIConfidence]] = {}
    for f in pgx:
        by_drug.setdefault(f.drug, set()).add(f.confidence)
    conflicts = [d for d, levels in by_drug.items() if len(levels) > 1]
    if conflicts:
        disagreement = DisagreementReport(
            has_disagreement=True,
            modules_compared=["pharmacogenomic-sim", "risk-sim"],
            summary="Different genes give different confidence for the same drug.",
            details=[f"Mixed confidence levels for: {', '.join(sorted(conflicts))}."],
        )

    return GenomicResponse(
        suggestions=suggestions,
        model_version=MODEL_VERSION,
        timestamp=utc_now(),
        disagreement_report=disagreement,
        pharmacogenomic_findings=pgx,
        risk_findings=risks,
        variants_received=len(req.variants),
        variants_recognised=recognised,
    )

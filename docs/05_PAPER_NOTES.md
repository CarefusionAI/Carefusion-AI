# 05 — Paper Notes: "CareFusion AI: Evidence-Based Agentic Intelligence for Multi-Modal Clinical Decision Support"
IEEE ICSCST 2026, Paper 1609. Authors: Athun Sujith, Abhishek Gopan, Reno Varghese, Melvin/Melbin V Thomas, Anila A.

## Core idea
Decision support, not autonomous diagnosis. Two layers:
- **Intuition layer** — four modules run in parallel (30 s timeout each) and propose hypotheses
- **Verification layer** — hypotheses with confidence > 0.6 get evidence retrieved; status VERIFIED (≥2 sources, avg relevance > 0.7), SUPPORTED_WITH_CAUTION (1 source, relevance > 0.85), else UNCERTAIN. Ranking: confidence × min(|evidence|/3, 1)

## Modules
| Module | Method | Key results |
|---|---|---|
| Symptom | Whisper base → DistilBERT constrained to 247 ICD-11 terms → 5 prevalence buckets, Isolation Forest each → multinomial LR (520 classes, 40k MIMIC-IV cases) top-3 | Top-3 96.1%, hallucination 1.3% (16/1,245, κ 0.92); rare-disease sensitivity 68% → 91% (specificity 85% → 78%) |
| Vision | ResNet-50 + Grad-CAM++; loss = CE + 0.5·max(0, 1−IoU(CAM, bbox)); NIH Chest X-ray | AUROC 0.96, sens 94.5%, spec 89.2%, mean IoU 0.72 |
| Genomic | Deterministic: VCF v4.2/4.3, chrom/pos/GQ ≥ 30 checks, normalize, ClinVar match (≥2 submissions) | Parsing 100% (500/500), match 99.9%, FP 0%, FN 0.08% |
| Temporal | Stacked LSTM 2×128, 30-day, 12 vitals, class weight 1:2.5, MIMIC-IV | Acc 88.5%, AUROC 0.91, RMSE 0.12, 8.2 h lead time |

Knowledge base: 15,000 docs — 2,500 guidelines, 8,000 PubMed, 3,200 ClinVar, 1,300 regional epi. BERT encoder, FAISS, relevance = 0.7·sim + 0.3·recency, top-3, < 100 ms.
Conflict resolution (Algorithm 1): pathogenic genomic → critical vision → symptom + temporal agreement → else report disagreement.
Baselines: SVM 88.2%/0%, BERT 97.2%/18.3%, GPT-3.5 92.4%/12.1%, published CDSS 78.3%/2.1%. 5-fold CV stable.
Failure modes: symptom anomalies 2.3%, small lesions 5.5% FN, genomic gaps 0.08%, chronic disease blindness, multi-modal conflicts.

## Inconsistencies to fix
1. Fig. 2 symptom bar shows 0.901; caption/text say 96.1%.
2. Fig. 3 legend: vision 0.9988 / temporal 0.9522 vs text 0.96 / 0.91.
3. Retrieval rule: protocol says "cosine distance < 0.3", Algorithm 2 says "similarity > 0.3" — opposite meanings.
4. Table IX "< 1.3%" hallucination vs exactly 1.3% elsewhere.
5. End-to-end 97.5% / 15–20% hallucination is an estimate, not an experiment.
6. Q&A prep cites a 0.978 vision ablation not shown in the paper.
7. Author name: "Melvin" (paper) vs "Melbin" (deck).
8. Deck mentions Ethereum/blockchain and Node.js; paper does not.

## Gaps for the Indian government version
- All data is US/international (MIMIC-IV, NIH X-ray, 1000 Genomes) and retrospective → need Indian prospective validation.
- English-only symptom vocabulary; Whisper base weak on Malayalam/Hindi → Bhashini or larger speech model.
- Regional store uses CDC → add ICMR guidelines, IDSP/IHIP surveillance, state health data.
- Likely Software as a Medical Device under CDSCO → regulatory pathway needed.
- No subgroup fairness audit yet (age, sex, region).

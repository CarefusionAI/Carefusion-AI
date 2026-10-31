# 19 — Disease Symptom Reasoning System (DSRS): plan

> Drafted 2026-10-31 from Athun's description. **Status: DRAFT, not yet approved.** Nothing here is built yet. It supersedes the "symptom reasoning engine" wording in docs 05 and 08 once approved (those docs stay as the source for the paper's design).
> Rule 9 applies: items marked **Assumption** or **Needs a decision** must be confirmed with Athun before building.

---

## 1. What it is, in one paragraph

A doctor (or, in a limited form, a citizen) describes symptoms. The system returns:

1. **What the person may have**: a ranked list of possible diseases (a differential), never a diagnosis.
2. **Why**: for each disease, the findings that support it, the findings that argue against it, and the evidence behind it.
3. **What to ask next**: the most useful follow-up questions, in order.
4. **What to test**: the lab tests, scans or examinations that would separate the leading diseases.
5. **How sure we are**: a status for each suggestion (VERIFIED, SUPPORTED_WITH_CAUTION or UNCERTAIN), any disagreement between models, red flags, and an honest "I cannot tell" when that is the truth.

It is **decision support only**. The doctor decides. This follows the paper (docs 05) and project rules 3 and 4 in `CLAUDE.md`.

**Name.** From now on we call it the **Disease Symptom Reasoning System (DSRS)**. The paper's "symptom module" becomes the first stage of DSRS. *(Assumption: "Dizzlebird" in your message means DistilBERT.)*

## 2. Honest framing of "no flaw"

A system with no flaw is not possible, and promising it would be unsafe. What we **can** build, and prove with tests, is a system where:

- Every claim it shows is **traceable to a source** it actually retrieved, or it is not shown.
- It **says "uncertain" or declines** instead of guessing.
- **Dangerous situations are caught by fixed rules**, not by a model's mood.
- Failures are **measured** on a clinician-checked test set, and we publish the numbers, including the bad ones.
- A doctor always reviews before anything reaches a citizen.

So the goal in this plan is: **no ungrounded statement reaches a doctor, and every known failure mode has a test.** Where the plan says "target", the number is a proposal for Athun and a clinician to agree, not a result.

## 3. What exists today (starting point)

| Piece | State today |
|---|---|
| `apps/ai/routers/symptom.py` | Simulated. 10 hard-coded conditions, keyword matching plus seeded jitter, made-up citations. Returns top-3, red flags, disagreement. |
| `apps/api/src/doctor/ai.service.ts` | Calls the AI service, saves each run (locked, hashed), handles agree/disagree. |
| Doctor UI | AI chat panel in the patient session. |
| Citizen UI | AI Health Chat, guidance only: no disease list, emergency flagging. |
| Decision log (Oct 2026) | "All 4 AI modules simulated in the alpha." **Using a real model changes this and needs a new logged decision** (see section 13). |

The plan keeps the **same API shape and the same saved-run format** where possible, so the screens keep working while the inside is replaced step by step.

## 4. The output contract (what DSRS returns)

This is the most important design choice. The contract is fixed first; models can then be swapped behind it.

```json
{
  "run_id": "uuid",
  "mode": "simulated | grounded",
  "model_versions": { "...": "..." },
  "urgency": { "level": "emergency | urgent | routine", "reasons": ["..."], "source": "rule | model" },
  "extracted_findings": [
    { "text": "fever 3 days", "code": "ICD-11 ...", "present": true, "onset_days": 3 }
  ],
  "differential": [
    {
      "rank": 1,
      "disease": "Dengue fever",
      "code": "ICD-11 1D20",
      "likelihood_band": "high | moderate | low",
      "status": "VERIFIED | SUPPORTED_WITH_CAUTION | UNCERTAIN",
      "supports": [ { "finding": "fever", "claim": "...", "cite": ["kb:doc123#p4"] } ],
      "against": [ { "finding": "no rash", "claim": "...", "cite": ["kb:doc123#p5"] } ],
      "missing": ["platelet count", "days since onset"],
      "evidence": [ { "id": "kb:doc123#p4", "title": "...", "publisher": "...", "year": 2023, "relevance": 0.81 } ]
    }
  ],
  "next_questions": [
    { "question": "Any bleeding from gums or nose?", "why": "separates dengue with warning signs from simple viral fever", "helps_separate": ["Dengue", "Viral URI"], "cite": ["kb:..."] }
  ],
  "recommended_tests": [
    { "test": "NS1 antigen or dengue IgM", "why": "...", "when": "day 1-5 of fever", "cite": ["kb:..."] }
  ],
  "red_flags": ["..."],
  "disagreement_report": { "has_disagreement": true, "between": ["classifier", "llm"], "summary": "..." },
  "abstention": { "abstained": false, "reason": null },
  "judge": { "verdict": "pass | pass_with_warnings | fail", "checks": [ { "name": "citation_support", "result": "pass" } ] },
  "disclaimer": "Decision support for a doctor, not a diagnosis."
}
```

Rules built into the contract:
- `cite` is **required** on every `supports`, `against`, `next_questions` and `recommended_tests` entry. No cite, no display.
- `mode` is always shown in the UI. While any part is simulated it says **"simulated AI output"** and never uses the paper's accuracy numbers.
- `urgency` from a **rule** can only be raised by the model, never lowered below the rule's level.
- Drug names and doses are **not part of the output**. Treatment stays with the doctor and the prescription screen.

## 5. Pipeline: how an answer is produced

```
input (text / voice-to-text, vitals, history, age, sex, region, season)
  │
  ▼
[0] Safety screen ──────────────► emergency rules fire first (chest pain + sweating, stroke signs, ...)
  │
  ▼
[1] Understand: extract findings, negation, timing, severity ──► standard codes (ICD-11)
  │
  ▼
[2] Hypotheses (several INDEPENDENT generators)
      a. trained classifier on structured findings
      b. LLM differential (free reasoning, no tools)
      c. rule / guideline matcher (syndromic rules from national programmes)
  │            └─► merge, de-duplicate, keep disagreements
  ▼
[3] Retrieve evidence (hybrid search + reranker) for each candidate
  │
  ▼
[4] Grounded reasoning: LLM may use ONLY retrieved passages, must cite passage IDs
  │
  ▼
[5] Plan: next questions and tests (information-gain ranking, tests only from guideline mappings)
  │
  ▼
[6] Verify (defence in depth): claim checks → rule checks → LLM judge → consistency
  │
  ▼
[7] Release or abstain ──► doctor sees result; doctor agrees / disagrees with a reason
```

### Stage 0 — Safety screen (deterministic, runs first)
- A list of **emergency patterns** written with a clinician (for example chest pain with sweating, sudden weakness on one side, severe breathlessness, heavy bleeding, altered consciousness, suicidal thoughts, high fever in a young infant).
- It does not use a model. If it fires, `urgency = emergency` and the UI shows it before anything else.
- Target: **100% recall on the clinician-written emergency test cases** (a false alarm is acceptable; a miss is not).
- Free-text from the patient is treated as **untrusted input**: stripped of instructions before it reaches an LLM (prompt-injection defence, section 8).

### Stage 1 — Understand the input
- Extract findings with a clinical NER model plus a constrained mapper (this is where **DistilBERT**-style models from the paper fit: map text to a closed list of codes, so the model cannot invent a symptom).
- Handle **negation** ("no fever"), **timing** ("since Monday"), **severity**, **who** the symptom belongs to ("my father has…").
- Output the findings list shown back to the doctor to confirm. A wrong extraction is the most common silent failure, so the doctor can correct it before reasoning continues.
- Languages: English first (decided). Hindi/Malayalam words typed in English letters are handled as a later phase.

### Stage 2 — Generate hypotheses (several, independent)
Using more than one generator is how we catch each one's blind spots.

| Generator | What it is | Strength | Weakness |
|---|---|---|---|
| Classifier | Trained model on structured findings (paper: multinomial LR; options below) | Fast, calibrated, repeatable | Only knows diseases it was trained on |
| LLM differential | A language model asked for a differential from the findings only | Good with unusual combinations | Can invent, can be over-confident |
| Rule matcher | National-programme syndromic rules (fever + chills in a malaria area, cough over 2 weeks for TB, etc.) | Matches how Indian public health actually works | Narrow |

- Candidates from all three are merged. **Where they disagree, that is recorded** in `disagreement_report` (paper's Algorithm 1 idea), not hidden.
- Rare and dangerous diseases get a **"must not miss" list** per presentation (for example, fever + headache + neck stiffness always includes meningitis for consideration), so a likelihood ranking cannot push a dangerous option off the list.

### Stage 3 — Retrieve evidence
- Search the curated knowledge base (section 7) for each candidate: **hybrid search** (keyword BM25 + vector embeddings), then a **reranker**.
- Every passage keeps its **provenance**: document, publisher, year, section, version.
- Relevance score is kept and used by the verification rules (the paper's 0.7 and 0.85 thresholds).
- Recency matters for guidelines: newer wins when two disagree, and the conflict is shown.

### Stage 4 — Grounded reasoning (the "why")
- The reasoning model receives **only** the findings and the retrieved passages, plus a strict instruction: *state a claim only if a passage supports it, and cite the passage ID.*
- Output is **structured** (the contract in section 4), not free text, so claims can be checked by code.
- Anything the model says that has no valid citation is **removed**, not softened.
- Numbers (cut-offs, ranges) must be copied from a passage or computed by a tool, never recalled by the model.

### Stage 5 — Next questions and recommended tests
- **Questions:** pick questions that best separate the top candidates (information gain: how much the answer would change the ranking), restricted to questions tied to a cited source. Ask a small number (about 3 to 5), most useful first. Red-flag questions come first when safety requires.
- **Tests:** a test is only recommended if a guideline passage links it to the candidate disease, with the timing window ("NS1 in the first 5 days"). Tests are grouped as "do now", "if the first result is X" and "not needed yet" to avoid over-testing.
- Cost and availability: later, tests are marked as available or not at the doctor's hospital using the hospital data we already hold.

### Stage 6 — Verification (defence in depth)
No single check is trusted. Each one catches different failures.

| Layer | What it checks | Type |
|---|---|---|
| 6a Citation check | Every cited ID exists, was retrieved for this run, and is from an allowed source. | Code |
| 6b Claim support (NLI) | A natural-language-inference model tests whether the cited passage actually entails the claim. Unsupported claims are dropped. | Model |
| 6c Rule checks | Status rules from the paper (VERIFIED needs 2+ sources averaging above 0.7, SUPPORTED_WITH_CAUTION one source above 0.85, else UNCERTAIN); urgency never below rule; no drug or dose text; closed vocabulary only. | Code |
| 6d Consistency | Run the reasoning a few times with different wording and sampling; if the top diagnosis or key tests flip, lower the status and report it. | Model + code |
| 6e **LLM judge** | A *different* model family reads the findings, the output and the passages against a written rubric and returns pass / pass-with-warnings / fail with reasons. | Model |
| 6f Disagreement | Generators and judge disagree, or evidence conflicts: show the disagreement. | Code |

**About LLM-as-a-judge, honestly.** A judge is useful, but it is not ground truth. It can be fooled, it can prefer fluent wrong answers, and it tends to favour output from its own model family. So:
- The judge is **a different model family** from the reasoner.
- It gets a **rubric with concrete yes/no checks**, not "is this good?".
- It can **only lower** confidence or fail an output; it can never promote an unsupported claim.
- The judge itself is **measured against clinicians** on the test set (agreement score). If it does not agree with clinicians, it does not ship.

### Stage 7 — Release or abstain
- Release if checks pass. If they fail or evidence is thin, **abstain with a reason** ("not enough evidence for any candidate above 0.6; here is what to ask") and still show the safety screen, questions and red flags.
- The doctor marks **agree / disagree with a reason**. This is stored (locked, encrypted, hashed) and becomes evaluation data.
- A citizen sees a result **only after doctor review**. The citizen's own chat stays **guidance only** (no disease list), as decided.

## 6. Models: roles and candidates

*(Assumption: names below are candidates to evaluate, not decisions. Licences and hosting need checking before choosing.)*

| Role | Candidates | Notes |
|---|---|---|
| Speech to text | Whisper (paper) | Doctor checks the text before use. Mock in alpha unless decided otherwise. |
| Finding extraction / code mapping | DistilBERT-style classifier (paper), a clinical NER model | Constrained to a closed code list. |
| Hypothesis classifier | Logistic regression (paper), gradient boosting | Needs training data (section 9). |
| LLM reasoner | A strong general LLM through an API (for example a Claude model), or an open model if data must stay in India | **Synthetic data only** in the alpha. Real patient data needs an in-country, government-approved host. |
| Embeddings | Biomedical sentence embedding model | For retrieval. |
| Reranker | Cross-encoder reranker | Improves what the reasoner sees. |
| Claim checker | NLI model fine-tuned on medical text | Stage 6b. |
| Judge | An LLM from a **different family** than the reasoner | Stage 6e. |

Laptop limit: 16 GB RAM. Large local models will not run well, so large models go through an API in the alpha and small models (classifier, NER, NLI, reranker) can run in the `apps/ai` container.

## 7. Knowledge base (the "grounding")

Grounding is only as good as what it is grounded on. A weak or messy knowledge base gives confident wrong answers.

**Sources to collect (with licence check before use):**
- National programme guidelines: NVBDCP/NCVBDC (dengue, malaria), NTEP (TB), ICMR treatment and antimicrobial guidance, Kerala state health department circulars.
- WHO guidelines and ICD-11 (WHO licence terms apply).
- Open-access literature (PubMed Central open subset).
- ClinVar (public) for the genomic module.
- Regional epidemiology (state disease bulletins) for seasonal and area priors.

**Rules:**
- **Curated, not scraped.** Every document is logged with source, date, licence, version and who approved it.
- Chunked by meaning (sections), each chunk keeps its heading path.
- **Versioned and immutable:** a run records the KB version, so any answer can be reproduced later.
- Review: a clinician spot-checks a sample of chunks per disease before it enters the "approved" set.
- Start **small and good**: about 15 to 25 priority conditions (the common Indian presentations in the current simulation plus the must-not-miss list), not 15,000 documents. Grow after the evaluation is working. *(The paper's 15,000-document figure is a target, not a start.)*

## 8. Safety and failure-mode controls

| Failure mode | Control |
|---|---|
| Invented disease, test or number | Closed vocabulary of codes, citations required, numbers only from passages or tools. |
| Plausible but unsupported claim | Citation check + NLI claim check; unsupported claims removed. |
| Missed emergency | Deterministic stage 0, tested at 100% recall on clinician cases. |
| Over-confidence | Status rules from evidence counts, calibration measured, consistency runs, abstention. |
| Anchoring on the first guess | Independent generators, must-not-miss list, disagreement shown. |
| Wrong input understanding | Doctor confirms extracted findings before reasoning. |
| Negation errors ("no chest pain") | Dedicated negation tests in the evaluation set. |
| Prompt injection via patient text | Patient text is data, never instructions: delimited, instruction-stripped, model has no tools that act, output is schema-validated. |
| Treatment advice sneaking in | Output schema has no treatment fields; checker blocks drug and dose text. |
| Bias (age, sex, region, language) | Evaluation reported per group; tests on women, children, older adults, rural phrasing. |
| Judge that is wrong or flattering | Different family, rubric, can only lower, measured against clinicians. |
| Silent model or KB change | Model and KB versions in every run; regression suite in CI blocks changes that make results worse. |
| Privacy | Alpha: synthetic data only. Real data: in-country host, no raw Aadhaar, minimum text sent to any model, run logged with a hash. |
| Citizen harm | Citizens never see a disease list from DSRS; doctor review first; emergency messages only. |

## 9. Data for training and testing

- **MIMIC-IV cannot be used on a public site** (credentialed data, usage agreement). The paper used it; we do not copy it into the demo. *(Assumption: to be confirmed against its data use agreement.)*
- **Public datasets to evaluate** *(Needs a check of licences and suitability)*: for example synthetic differential-diagnosis datasets with evidences and questions (DDXPlus-style), public symptom-to-disease datasets, and clinician-written vignettes.
- **Our own clinician-checked set (the most important asset):**
  - 300 or more **vignettes** (short synthetic cases) across the priority conditions, each with: findings, the correct differential, must-not-miss items, expected next questions, expected tests, and the guideline source.
  - Includes hard cases: negation, two diseases at once, rare presentations, children, pregnancy, elderly, missing information, contradictory information, and deliberately misleading input.
  - Written or reviewed by **at least one practising clinician** *(Needs a decision: who. Without a clinician reviewer the project cannot claim clinical validity.)*
- Doctor agree/disagree data from the demo is stored and, with consent rules decided later, used to improve the system. It is never used to train on real patients without approval.

## 10. How we will measure it

| Measure | What it tells us | Proposed target (to agree) |
|---|---|---|
| Emergency recall | Does stage 0 catch every dangerous case? | 100% on clinician emergency set |
| Must-not-miss inclusion | Is the dangerous disease on the list when it should be? | At least 98% |
| Top-3 contains the true disease | Basic usefulness | Report; set after first baseline |
| **Citation precision** | Share of shown claims that the cited passage truly supports | At least 99% (checked by clinician sample) |
| **Unsupported-claim rate** | Claims shown with no real support | Under 1% |
| Abstention quality | Declines when it should, not when it should not | Report both error types |
| Calibration | Does "high" mean right most of the time? | Report a calibration error; "VERIFIED" must be right clearly more often than "UNCERTAIN" |
| Question usefulness | Do clinicians rate the next questions as useful? | Clinician rating, 3 or more of 5 average |
| Test appropriateness | Right tests, not over-testing | Clinician rating, plus share of tests with a guideline source = 100% |
| Judge vs clinician agreement | Is the judge trustworthy? | A kappa score set with the clinician; judge ships only if it meets it |
| Robustness | Same answer after rewording, typos, negation, word order | Regression suite; no flips on paraphrase tests |
| Group fairness | Same quality across age, sex, language style | Per-group report |
| Latency | Doctor waiting time | Under about 15 s for the full run (paper's modules had a 30 s timeout) |

All of this runs as an **evaluation harness** (`apps/ai/eval/`) that can be run on every change and in CI. A change that makes safety or citation numbers worse **fails the build**.

**We will not** quote the paper's accuracy numbers (96.1% top-3, 1.3% hallucination) for DSRS. We report only what our own harness measures, on our own test set.

## 11. Where it fits in the code

| Area | Change |
|---|---|
| `apps/ai/` | New package `reasoning/` with the stages above; `routers/symptom.py` keeps its URL and calls the new pipeline. A `mode` switch keeps the simulated version available (`simulated` vs `grounded`). Evaluation harness in `apps/ai/eval/`. KB builder in `apps/ai/kb/`. |
| `carefusion-db/migrations` | New numbered migration(s): KB documents and versions, reasoning runs (inputs, outputs, versions, judge result), doctor feedback. Never edit applied migrations (rule 5). |
| `packages/shared` | The output contract as a Zod schema, shared by the AI service, API and web. |
| `apps/api/src/doctor/ai.service.ts` | Calls the new endpoint, validates against the contract, saves locked and hashed, stores feedback. |
| `apps/web` doctor AI chat | Show findings for confirmation, differential with supports/against, next questions (click to answer), tests, status, disagreement, judge result, "simulated/grounded" label. |
| Citizen chat | Unchanged in what it may show. Uses stage 0 and the guidance-only rules. |
| Admin AI governance (central console) | Shows model and KB versions, evaluation results and judge agreement. |
| CI | Runs the evaluation harness on a small fast set. |

## 12. Phases

Each phase ends with something that works and a measured result. Effort is a rough guess in working sessions of about 5 hours *(Assumption; revise after Phase 1)*.

| Phase | Goal | Main deliverables | Exit test | Rough effort |
|---|---|---|---|---|
| **0. Decide and specify** | Agree scope, names and rules. | This plan approved; decision-log entries; clinician reviewer identified; priority condition list (15–25). | Athun approves; list signed off. | 1–2 sessions |
| **1. Contract and baseline** | Fixed output shape and a way to measure. | Zod contract; first 100 vignettes; evaluation harness; baseline numbers for the **current simulated engine**. | Harness runs in CI and gives numbers. | 3–4 sessions |
| **2. Knowledge base and retrieval** | Real, versioned, citable evidence. | Curated KB for the priority list; hybrid search + reranker; provenance. | Retrieval finds the right passage for at least 90% of vignette questions (proposed). | 4–6 sessions |
| **3. Understand and hypothesise** | Find findings and candidates reliably. | Finding extraction with negation/timing; classifier; rule matcher; LLM differential; merge with disagreement; must-not-miss lists. | Top-3 and must-not-miss numbers beat the baseline. | 4–6 sessions |
| **4. Grounded reasoning** | Every claim cited. | Structured reasoner; citation enforcement; claim support check. | Citation precision and unsupported-claim targets met. | 3–5 sessions |
| **5. Questions and tests** | Useful next steps. | Information-gain question picker; guideline-linked test planner; "do now / if / not yet" grouping. | Clinician ratings meet target. | 3–4 sessions |
| **6. Verification and judge** | Defence in depth. | Rule checks; consistency runs; LLM judge with rubric; abstention; judge-vs-clinician measurement. | Judge agreement target met; abstention behaves. | 3–5 sessions |
| **7. Doctor UI and storage** | Doctors can use it. | Doctor chat panel changes; locked, hashed storage; agree/disagree feedback. | Click-through of the doctor flow; live deploy with a mode switch. | 3–4 sessions |
| **8. Hardening** | Stress and fairness. | Adversarial and injection tests; per-group report; load and latency; model/KB version pinning; monitoring page in AI governance. | Safety numbers hold; no regression. | 2–4 sessions |

At about 2 sessions a week, Phases 0–7 are roughly **8 to 12 weeks**. Phase 2 (knowledge base) and the clinician review are the likely bottlenecks, not the code.

**Order of safety:** stage 0 (emergency rules) and the evaluation harness come **before** any LLM is allowed near the output.

## 13. Decisions needed (to log in `docs/04_DECISION_LOG.md` once agreed)

1. **Scope of "real".** Move DSRS from "simulated" to "grounded" for the **symptom reasoning only** (other three modules stay simulated for now)? This changes the October decision "all 4 AI modules simulated".
2. **Which LLM and where it runs.** Alpha with synthetic data through an external API, or only open models we host? (The answer must change for real patient data.)
3. **Clinician reviewer.** Who reviews the vignettes and the emergency rules?
4. **Priority condition list.** Start with which 15–25 conditions?
5. **Targets.** Agree the numbers in section 10 with the clinician.
6. **Citizen side.** Confirm the citizen chat stays guidance only, and does not show DSRS differentials.

## 14. What this plan does not promise

- It does not diagnose, treat or replace a doctor.
- It does not claim the accuracy of the research paper.
- It does not use real patient data in the alpha.
- It does not guarantee no mistakes. It guarantees, and tests, that unsupported claims are blocked, emergencies are caught by rule, uncertainty is shown, and every run can be audited and reproduced.
- Regulatory status (for example whether a clinical decision support tool needs registration in India) is **not decided**. Needs checking before any real-world use.

## Open questions

1. Is "Dizzlebird" DistilBERT? And do you want DistilBERT specifically, or any model that maps text to a closed code list?
2. Which language model should be the reasoner, and may the alpha send **synthetic** cases to an outside API?
3. Who is the clinician (or doctor friend) who can review vignettes and the emergency rules? Without one we can build, but we cannot call it clinically checked.
4. Should the first release cover only the doctor's chat, with the citizen chat unchanged?
5. Should the next questions be answered by clicking in the UI (the system re-runs with the new answer), or only shown as a list for the doctor to ask aloud?
6. Is a fast, convincing demo for the ministry the priority, or is the research-quality evaluation the priority? The plan above favours evaluation; a demo-first version would do Phases 1, 3 and 7 early and mark the rest "planned".

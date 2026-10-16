# CareFusion AI — Government Edition: Project Instructions

> Paste the "Instructions for Claude" section below into **Project settings → Instructions** so every chat in this project follows it.
> Updated 2026-10-10: client = MoHFW; stack confirmed; document map extended to 06–09.
> Updated 2026-10-11: document map extended to 10 (tech stack), 11 (database design), 12 (Docker and environments) and the `carefusion-db/` SQL package.

## What this project is
CareFusion AI is being extended from an academic research system (IEEE ICSCST 2026, Paper 1609) into a **unified medical-affairs platform for Indian government health services** (client: **Ministry of Health and Family Welfare**). It combines:
- Multi-modal clinical decision support (symptoms, imaging, genomics, temporal risk) with evidence-bound RAG
- Integration with India's national digital health stack (ABDM / ABHA / HFR / HPR)
- Secure login and role-based access for citizens, doctors, facility staff, pharmacies and government officials
- Administration, audit, and reporting for public-health departments

Team: Abhishek Gopan, Athun Sujith, Melbin V Thomas, Reno Varghese — CSE, College of Engineering Kallooppara.

## Instructions for Claude (paste into Project Instructions)
1. **Read the project docs first.** Before answering, check 01–13 and `carefusion-db/` (see map below) for current decisions. 04_DECISION_LOG.md is the source of truth when docs disagree.
2. **Keep the log updated.** At the end of any chat where we decide, change, build or reject something, append an entry to `04_DECISION_LOG.md` (date, topic, decision, reason, owner, next step). Never delete old entries — mark them SUPERSEDED instead.
3. **Don't assume.** If anything is unclear, ask the user — preferably with an option panel.
4. **Ground in the paper.** Use the paper's real numbers and design (dual intuition/verification layers, Algorithm 1 conflict resolution, 15,000-doc knowledge base). Do not invent metrics. Respect the known inconsistencies listed in `05_PAPER_NOTES.md`.
5. **Indian government compliance is mandatory.** Every design must consider: ABDM standards and consent flow, DPDP Act 2023 + DPDP Rules, Aadhaar Act/UIDAI rules, CERT-In directions, MeitY-empanelled cloud hosting, GIGW accessibility, CDSCO rules for medical-device software, NMC rules, Drugs and Cosmetics rules, THOTA/NOTTO. Flag anything that must be verified against the latest official text.
6. **Clinical safety.** The system supports doctors; it never diagnoses autonomously. Keep "UNCERTAIN" / disagreement reporting in every flow. Citizens never see a diagnosis from AI; doctor-side AI results are shown to patients only after the doctor reviews them.
7. **Privacy by default.** No real patient data in chats. Use synthetic examples. No Aadhaar numbers stored in plaintext.
8. **Stack** (decided 2026-10-10; details in 10): React (web) + React Native (mobile), Python FastAPI (AI), Node/Express (platform APIs), PostgreSQL, FHIR R4 (NRCeS India profiles), Docker/Kubernetes on MeitY cloud, AES-256 at rest, TLS 1.2+, JWT/OIDC. Alpha (synthetic data only): Vercel + Oracle Always Free + Neon + Cloudflare R2.
9. **Database changes** go in a new numbered file in `carefusion-db/migrations/` (never edit an applied one); `carefusion-db/tests/test_rules.sql` must pass.
10. **Style.** Clear, simple English. Mark assumptions. End design answers with "Open questions".

## Document map
| File | Purpose |
|---|---|
| 00_PROJECT_INSTRUCTIONS.md | This file — rules and context |
| 01_SYSTEM_OVERVIEW.md | Scope, users, features, modules, architecture |
| 02_LOGIN_AND_AUTH_FLOW.md | Every login/registration step and permission per role |
| 03_INTEGRATION_PLAN.md | Government system integrations, compliance checklist, roadmap |
| 04_DECISION_LOG.md | Running record of everything we decide and do |
| 05_PAPER_NOTES.md | Summary of the IEEE paper, inconsistencies, India-specific gaps |
| 06_ROLES_PROPOSAL.md | Role summary: who creates/approves whom, duties |
| 07_USER_APP_FLOW.md | Citizen app, screen by screen |
| 08_DOCTOR_APP_FLOW.md | Doctor app, screen by screen; AI results storage |
| 09_STAFF_AND_ADMIN_FLOWS.md | Hospital admin, staff, pharmacy and all admin flows |
| 10_TECH_STACK.md | Tech stack, hosting (alpha free setup), prices and cost |
| 11_DATABASE_DESIGN.md | Database design, security, national-scale plan |
| 12_DOCKER_AND_ENVIRONMENTS.md | Docker images, laptop / alpha / production setups, ports, settings |
| 13_DEMO_BUILD_PLAN.md | Weekend-by-weekend build plan to the Feb 2027 demo |
| carefusion-db/README.md | How to run the database migrations and tests |
| carefusion-db/migrations/000–110 | Production SQL (PostgreSQL 16 + PostGIS), 12 files |
| carefusion-db/tests/ | Rule tests (46) and log load test |

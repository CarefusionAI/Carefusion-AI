# 01 — System Overview: CareFusion AI (Government Edition)

> Rewritten 2026-10-10 to match every decision in 04_DECISION_LOG.md up to "Final doubts round + staff/admin flows". Screen-by-screen detail lives in 07 (citizen), 08 (doctor) and 09 (staff, pharmacy, admins). Older versions SUPERSEDED.

## Goal
One national platform where every citizen, hospital (government and private), pharmacy and health administrator in India shares medical records, gets AI-assisted, evidence-backed clinical support, and manages medical affairs — linked to the national ABDM ecosystem.

## Client, scope and rollout
- **Client:** Ministry of Health and Family Welfare (MoHFW)
- **Scope:** national — every state and UT, every district, every hospital (government and private), every pharmacy (government hospital and private)
- **Users** = all ordinary people of the country (citizens/patients), plus the professionals and admins below
- **Platforms:** mobile app **and** website
- **Pilot:** a few districts in **Kerala** (districts to be chosen later), **English only**; Malayalam and Hindi added after the pilot
- **Then:** national rollout state by state, zone by zone

## Admin hierarchy
```
Central admin (whole country)
   └─ Zonal admins (5): North, South, East, West, Central
        └─ State admins (28 states + 8 UTs)
             └─ District admins
                  ├─ Hospital admins (government + private)
                  │     └─ Nurse / lab / radiology staff
                  ├─ Pharmacy admins (government hospital pharmacy + private pharmacy)
                  │     └─ Pharmacists
                  └─ Doctors (approved by district → state; central checks flagged cases)
Citizens (self-register; Aadhaar e-KYC + live face check; ABHA linked in background)
```

### Zones (only the central admin can change a state's zone)
| Zone | States | UTs |
|---|---|---|
| North | Haryana, Himachal Pradesh, Punjab, Rajasthan | Delhi, Chandigarh, Jammu & Kashmir, Ladakh |
| Central | Uttar Pradesh, Uttarakhand, Madhya Pradesh, Chhattisgarh | — |
| East | Bihar, Jharkhand, Odisha, West Bengal, Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Tripura, Sikkim | Andaman & Nicobar Islands |
| West | Gujarat, Maharashtra, Goa | Dadra & Nagar Haveli and Daman & Diu |
| South | Andhra Pradesh, Telangana, Karnataka, Kerala, Tamil Nadu | Puducherry, Lakshadweep |

No Northeast zone (NE states are in East).

## Roles (summary — details in 06, 07, 08, 09)
| Role | Main actions |
|---|---|
| Citizen | Health profile, rotating key, folders, dates panel, home vitals, AI guidance chat, doctor follow-up chat, reviews and appointments, medicine stock finder, blood and organ donation, access history |
| Emergency contact | Registered citizen; approves emergency access on own phone with an emergency code |
| Doctor | Two accounts (citizen + doctor). Opens record with patient key (30 min). AI chat, image, genomic, temporal analysis; file manager; e-signed prescriptions; referrals; donor and stock sections |
| Nurse / lab / radiology staff | Orders queue; upload vitals, reports, scans, VCF for ordered patients only |
| Hospital admin | Profile, staff accounts, appointments, admissions list, bed availability, linked pharmacy stock (view), ratings replies, dashboard |
| Pharmacy admin | Pharmacists, live stock (software sync or manual), near-expiry alerts, controlled-drug register, hours, location |
| Pharmacist | Receives/scans prescriptions, checks e-signature, controlled-drug checks, dispenses |
| District admin | Task inbox: approvals (with time limits), emergency reviews, flagged users, location flags, moderation, complaints, unusual-pattern alerts, transfers |
| State admin | Creates district admins; confirms doctors; second review of flagged users; health alerts; state AI guidelines; logs with central permission |
| Zonal admin | Creates state admins; approves district admins; escalations; zone dashboard |
| Central admin | Zones; zonal admins; approves state admins; verifies emergency access within 24 h; flagged doctors; all logs; master lists; national alerts; suspensions |

## Citizen health profile
- Identity: name, DOB, sex, ABHA number, preferred language, address (name/DOB/identity locked after verification)
- Emergency contacts (minimum 1, no maximum) — each must be a registered user
- Blood group, allergies, organ donor status
- Special category — fixed list + "Other", with status (e.g. "Cancer — in progress")
- Current medications, medical conditions, chronic conditions
- Documents in **folders** (patient and doctor can create folders)
- Medical history: chat summaries, prescriptions, diagnoses, medical images, AI results, genomic data, lab reports, vitals (hospital and **self-reported home** vitals), vaccinations, surgeries/hospital stays, family history, smoking/alcohol
- **Dates panel:** appointments, past visits, medicine/refill dates, vaccination/test due dates, next blood-donation date, treatment schedule, prescription expiry
- Access history (who opened the record and when)
- Minors: managed by parent/guardian with recorded consent; handed over at 18

## Patient record access
**Normal visit — rotating key**
- App shows a key that changes every 10 seconds, as QR + number
- Doctor scans/types it → **30-minute session**, one doctor at a time; patient can **end it early**
- Doctor can read, add documents, highlight, create folders — never edit or delete
- Afterwards the doctor sees only the patient's name + own additions
- Patient notified of every session

**No smartphone:** printed health card (ABHA QR) + OTP to the patient's basic phone

**Admitted patients:** admission mode — patient or emergency contact grants the treating team access until discharge; every view logged

**Referral:** referral note goes ahead; receiving doctor still needs the patient's key

**Unconscious patient — emergency access**
- Basic emergency info (blood group, allergies, emergency contacts) visible without a key
- Detailed records: **emergency contact approves on their own phone** with their emergency code; doctor typing the contact's Aadhaar + code is fallback only
- No contact reachable → **break-glass** with mandatory reason, time-limited
- District admin reviews first; central admin verifies within 24 h; full access record stored; patient notified
- Misuse → account suspended + case reported to the medical council

**Doctor's own record:** doctor account cannot open its own citizen record; opening a family member's record is allowed but flagged

## AI tools and AI results
- Doctor side (decision support only): AI chat (symptom engine), image analysis, genomic analysis, temporal analysis; doctor marks agree/disagree with reason
- Citizen side: AI health chat is **guidance only** — no diagnosis, flags emergencies, suggests a doctor
- **Every AI run saved** in its own top-level folder (AI Chat, Image Analysis, Genomic Analysis, Temporal Analysis) with input, output, evidence + status, model version, time and doctor's verdict
- AI results are **locked, encrypted and hash-logged**; patient sees a result only **after the doctor reviews it**
- Anonymous data used to improve the AI **only with the citizen's opt-in consent**

## Prescriptions & pharmacy
- Doctor writes from the national medicine catalogue (generic names) with **allergy and drug-interaction warnings** and **stock shown**
- **Government-approved e-signature** + verifiable QR
- Patient always gets the signed copy and chooses any pharmacy (send from app or show QR); for the **doctor's own hospital pharmacy**, the doctor can send it directly if the patient agrees
- **Live pharmacy view / medicine stock finder:** stock (in/low/out), price, hours, distance
- Pharmacist checks e-signature; controlled drugs (Schedule H/H1/X) get extra checks and a register; stock updates in real time

## Blood and organ donation
- Blood: "ready to donate" toggle (eligibility check; auto-off ~3 months after donating); requests auto-alert matching nearby donors; map shows approximate area only; contact via in-app call/chat; no payment talk; e-RaktKosh blood-bank stock shown
- Organ: pledge signed at a hospital with a verified doctor; linked to the NOTTO registry; list visible to authorised doctors only; allocation by NOTTO/SOTTO

## Ratings, appointments, chat, alerts
- Ratings: doctors, hospitals, pharmacies; any time; ABHA-verified users; one per user per entity; district admin moderates comments
- Appointments: free booking, any fee paid at the hospital (no payments in app)
- Chat with doctors: only doctors who have treated the user
- Notifications: app push, SMS, email (no WhatsApp)
- Health alerts: normal ones can be muted; emergency alerts never
- Bed availability shown to citizens and ambulances
- **Not in first version:** video consultation (later, possibly eSanjeevani)

## Accounts, death and logs
- Accounts are **never deleted**, only deactivated (⚠ to verify against DPDP right to erasure)
- Death recorded by hospital/doctor or certificate → account locked, family notified, organ pledge sent to NOTTO, records kept for the legal period
- **Every user** has a personal log (action, GPS or IP area, time, device, IP); no one can edit or delete; kept forever; tamper-proof hash chain (no blockchain)
- Viewers: central admin always; state admin with central permission; patient sees only access history
- Doctors: location checked at record opening and every 5 minutes during a session; must be inside their hospital geofence or give a reason (flagged)

## Modules
**Clinical AI (from the paper — decision support only)**
1. Symptom Reasoning Engine — Whisper + DistilBERT closed vocabulary (247 ICD-11 terms), bucketed Isolation Forest, logistic regression top-3
2. Vision Engine — ResNet-50 + Grad-CAM++ with spatial-validity loss
3. Genomic Engine — deterministic VCF validation + ClinVar matching
4. Temporal Risk Engine — 2×128 LSTM; uses hospital and self-reported vitals
5. Evidence/RAG layer — 15,000-doc knowledge base (global + state stores); VERIFIED / SUPPORTED_WITH_CAUTION / UNCERTAIN
6. Conflict resolution — Algorithm 1 precedence + disagreement reporting
7. AI results store — per-tool folders, locked, encrypted, hash-logged
8. Citizen guidance chat — no diagnosis; emergency flagging
9. Voice-to-text notes for doctors (Whisper)

**Platform**
10. Identity & Access — Aadhaar e-KYC + UIDAI face check, ABHA, HPR, admin chain, MFA/hardware keys, Jan Parichay for all district/state/zonal/central admins, rotating keys, health cards
11. ABDM Gateway connector — HIP/HIU, consent, FHIR bundles
12. Medical Records — FHIR R4 store, encrypted vault, folders, highlights, dates panel
13. Access modes — key session, card + OTP, admission mode, emergency approval, break-glass, two-level review
14. Pharmacy — live stock, software sync, prescription handover, e-signature check, controlled-drug register
15. Donation — blood donors/requests/alerts, e-RaktKosh link, organ pledges (NOTTO link)
16. Ratings, complaints, appointments, referrals, bed availability
17. Dashboards — district / state / zonal / national, unusual-pattern alerts
18. Notifications & health alerts — push, SMS (DLT), email
19. Activity logs & audit — append-only, hash-chained
20. Multilingual UI — English first; Malayalam and Hindi next; Bhashini later
21. Offline mode — cached view and offline visit/vitals recording with sync

## High-level architecture
```
Citizens / Doctors / Staff / Pharmacies / Admins (React Native app + React website, GIGW-compliant)
            │  HTTPS, OIDC/JWT, MFA, Jan Parichay for admins
     API Gateway + WAF + Rate limiting
            │
 ┌──────────┼───────────────┬──────────────────┬───────────────────┐
 Identity   Clinical AI      Records & access    Pharmacy, donation,  Gov integration
 & keys     (FastAPI: 4      (FHIR, folders,     ratings, beds,       (ABDM, UIDAI, e-Sign,
            modules, RAG,    AI results store)   appointments         NOTTO, e-RaktKosh, SMS)
            guidance chat)                       (Node/Express)
            │
 Data: PostgreSQL (FHIR), object store (DICOM/VCF; fast tier + archive tier, encrypted),
       vector store (FAISS), real-time stock DB, append-only hash-chained log
            │
 Hosting: MeitY-empanelled cloud (India) + live copy in a second India region
```

## Non-functional requirements
- MeitY-empanelled cloud; data in India; AES-256 at rest; TLS 1.2+; keys in HSM/KMS
- Backup: live copy in a second MeitY region with automatic switch-over
- Storage: recent scans/VCF on fast storage; older (e.g. 2+ years) to archive, still retrievable
- Aadhaar never stored in plaintext — token only
- Every action logged
- Availability 99.5%+; offline mode for health centres
- Real-time stock updates across the country
- Accessibility: GIGW / WCAG 2.1 AA
- Security audit (CERT-In empanelled / STQC) before go-live

## Tech stack (Claude's choice at user's request; user can override)
React (web) + React Native (mobile) · Python FastAPI (AI services) · Node/Express (platform APIs) · PostgreSQL + FHIR R4 · Docker/Kubernetes on MeitY cloud

## Out of scope (first version)
Autonomous diagnosis, payments/billing, insurance (PM-JAY), video consultation, blockchain, spreadsheet stock upload.

## Open questions
- Kerala pilot districts
- CDSCO: are the AI modules (and the citizen guidance chat) Software as a Medical Device? (research before the pilot)
- To verify: Aadhaar handling (UIDAI), logs kept forever and never-delete accounts (DPDP), GPS/location logging (DPDP), doctor ratings (NMC), e-prescription e-signatures, Schedule H/H1/X rules, NOTTO/THOTA, blood-bank rules, children's data (DPDP)
- Exact approval time limit; first pharmacy software to support; drug-interaction database; medicine catalogue source

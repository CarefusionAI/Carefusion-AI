# 16 — All Role Features: What Each User Sees and Does

**Project:** CareFusion AI (Government Edition)
**Document type:** Definitive per-role feature and workflow reference
**Last updated:** 2026-10-17 (W4 Sat S1)
**Owner:** Athun Sujith (with Claude)
**Source of truth when docs disagree:** `docs/04_DECISION_LOG.md`

> **SYNTHETIC DEMO DATA.** The alpha runs only on synthetic data. Demo identifiers look like `DEMO-0000-1234`. Every screen shows a "SYNTHETIC DEMO DATA" banner (`DemoBanner.tsx`).

---

## Table of Contents

0. [How to read this document](#0-how-to-read-this-document)
1. [Project context and rules](#1-project-context-and-rules)
2. [Role overview and status at a glance](#2-role-overview-and-status-at-a-glance)
3. [Role 1: Citizen](#3-role-1-citizen)
4. [Role 2: Doctor](#4-role-2-doctor)
5. [Role 3: Nurse](#5-role-3-nurse)
6. [Role 4: Lab Technician](#6-role-4-lab-technician)
7. [Role 5: Radiology Technician](#7-role-5-radiology-technician)
8. [Role 6: Pharmacist](#8-role-6-pharmacist)
9. [Role 7: Pharmacy Admin](#9-role-7-pharmacy-admin)
10. [Role 8: Hospital Admin](#10-role-8-hospital-admin)
11. [Role 9: District Admin](#11-role-9-district-admin)
12. [Role 10: State Admin](#12-role-10-state-admin)
13. [Role 11: Zonal Admin](#13-role-11-zonal-admin)
14. [Role 12: Central Admin](#14-role-12-central-admin)
15. [Cross-cutting features (all roles)](#15-cross-cutting-features-all-roles)
16. [Account creation and approval chain](#16-account-creation-and-approval-chain)
17. [Implementation status summary](#17-implementation-status-summary)
18. [Code reference](#18-code-reference)
19. [Open questions](#19-open-questions)

---

## 0. How to read this document

### 0.1 Status labels

Every feature in this document carries one of these labels.

| Label | Meaning |
|-------|---------|
| **BUILT** | Working in the code on branch `w4-citizen-profile` (or merged to `main`). Code files and API paths are listed. |
| **BUILT (read only)** | The screen or API exists, but editing or creating is not yet built. |
| **PARTIALLY BUILT** | Some parts of the page or feature exist. The built parts are named; the rest is DESIGNED. |
| **PLACEHOLDER** | The route and page file exist but only show a generic "Coming soon" page (`RolePage.tsx`). |
| **DESIGNED, NOT BUILT** | The behaviour is fully described in the design docs (07, 08, 09) but no code exists yet. |
| **NOT IN ALPHA** | Deliberately left out of the first version. |
| **TO VERIFY** | A legal or technical point that must be checked before it is built (see Section 19). |

### 0.2 Document conventions

- Where an API path is given for a **BUILT** feature, it comes from the current code.
- Where a feature is **DESIGNED, NOT BUILT**, no API path is given. Paths will be set when the feature is built. Any field list for such a feature is the design intent, not final.
- "Simulated AI output" means the alpha returns pre-written or randomised outputs from `apps/ai` (FastAPI) that follow the shape of the real module. It is never real inference and never claims the paper's accuracy numbers.
- Source design docs: `docs/07_USER_APP_FLOW.md` (citizen), `docs/08_DOCTOR_APP_FLOW.md` (doctor), `docs/09_STAFF_AND_ADMIN_FLOWS.md` (staff and admins), `docs/06_ROLES_PROPOSAL.md` (role summary).
- Authentication details (login, tokens, guards, demo auth) are in `docs/15_LOGIN_AND_AUTH_COMPLETE_DETAILS.md`. They are not repeated here.

---

## 1. Project context and rules

### 1.1 What the project is

CareFusion AI is a unified medical-affairs platform for Indian government health services. The client is the Ministry of Health and Family Welfare. It extends an academic research system (IEEE ICSCST 2026, Paper 1609) into a platform that connects citizens, doctors, hospital staff, pharmacies and a chain of government administrators.

The alpha is a **website only**. It uses:

| Layer | Technology |
|-------|-----------|
| Web | React 18 + Vite + TypeScript + shadcn/ui + Tailwind (`apps/web`) |
| API | NestJS (Node 22) + Prisma (`apps/api`) |
| AI | FastAPI, Python 3.12, simulated outputs (`apps/ai`) |
| Database | PostgreSQL 16 + PostGIS |
| Identity | Keycloak |
| Cache | Valkey |
| Files | MinIO (laptop) / Cloudflare R2 (alpha) |
| Mail (laptop) | Mailpit |

There are **12 roles**. The demo target is a working alpha on synthetic data by about 14 February 2027, with the core demo online by 12 to 13 December 2026.

### 1.2 Rules that apply to every role

| # | Rule | What it means for features |
|---|------|----------------------------|
| 1 | Synthetic data only | No real patient data is ever used or requested. Identifiers like `DEMO-0000-1234` can never pass as real Aadhaar or ABHA numbers. |
| 2 | No raw Aadhaar anywhere | Only Aadhaar tokens are stored and shown (masked). |
| 3 | AI is decision support only | No autonomous diagnosis. Results carry VERIFIED / SUPPORTED_WITH_CAUTION / UNCERTAIN and disagreement reporting. In the alpha every AI output is labelled "simulated AI output". Citizens see an AI result only after a doctor has reviewed it. |
| 4 | Government integrations are mock connectors | Aadhaar e-KYC, face check, ABHA, HPR, HFR, Jan Parichay, e-Sign, NOTTO, e-RaktKosh and SMS use the same request and response shape as the real services. No real government logos or look-alike official login pages. |
| 5 | SQL migrations are the database source of truth | `carefusion-db/migrations/`. Prisma uses `prisma db pull` only. |
| 6 | Never break `main` | Work on branches, merge by pull request when tests pass. |
| 7 | No secrets in the repo | Settings come from `.env`. |

---

## 2. Role overview and status at a glance

### 2.1 The 12 roles

| # | Role | Route | Dashboard file | Status |
|---|------|-------|----------------|--------|
| 1 | Citizen | `/citizen` | `CitizenHome.tsx` | BUILT (Profile + Documents tabs) |
| 2 | Doctor | `/doctor` | `DoctorHome.tsx` | PLACEHOLDER |
| 3 | Nurse | `/nurse` | `NurseHome.tsx` | PLACEHOLDER |
| 4 | Lab Technician | `/lab-tech` | `LabTechHome.tsx` | PLACEHOLDER |
| 5 | Radiology Technician | `/radiology-tech` | `RadioTechHome.tsx` | PLACEHOLDER |
| 6 | Pharmacist | `/pharmacist` | `PharmacistHome.tsx` | PLACEHOLDER |
| 7 | Pharmacy Admin | `/pharmacy-admin` | `PharmacyAdminHome.tsx` | PARTIALLY BUILT |
| 8 | Hospital Admin | `/hospital-admin` | `HospitalAdminHome.tsx` | PARTIALLY BUILT |
| 9 | District Admin | `/district-admin` | `DistrictAdminHome.tsx` | PARTIALLY BUILT |
| 10 | State Admin | `/state-admin` | `StateAdminHome.tsx` | PARTIALLY BUILT |
| 11 | Zonal Admin | `/zonal-admin` | `ZonalAdminHome.tsx` | PARTIALLY BUILT |
| 12 | Central Admin | `/central-admin` | `CentralAdminHome.tsx` | PARTIALLY BUILT |

All dashboard files live in `apps/web/src/pages/`.

### 2.2 Who can see what (access summary)

| Role | Can open a patient's full record? | How |
|------|-----------------------------------|-----|
| Citizen | Own record | Always |
| Doctor | Yes, for 30 minutes | Patient's rotating key (QR or number), or health card QR + OTP; admission mode; emergency access (break-glass) |
| Nurse | Only in admission mode | Treating-team membership until discharge |
| Lab Technician | No | Sees order details only |
| Radiology Technician | No | Sees order details only |
| Pharmacist | Prescription only | Prescription QR or incoming queue |
| Pharmacy Admin | No | Pharmacy data only |
| Hospital Admin | No | Sees admitted names and treating team only |
| District / State / Zonal / Central Admin | No | De-identified dashboards; activity logs per rules in Section 15.6 |

### 2.3 Hierarchy of administrators

```
Central Admin  (national; 5 zones)
   |
Zonal Admin    (North / South / East / West / Central)
   |
State Admin
   |
District Admin
   |
Hospital Admin  /  Pharmacy Admin
   |
Doctors, Nurses, Lab Techs, Radiology Techs, Pharmacists
```

---

## 3. Role 1: Citizen

**Dashboard:** `apps/web/src/pages/CitizenHome.tsx` — **BUILT** (Profile tab + Documents tab)
**Route:** `/citizen`

**Description.** The citizen is any person with a verified CareFusion account (identity checked through mock Aadhaar e-KYC, face check and ABHA). The citizen owns their health record: they see their profile, keep documents in folders, control who may open their record and for how long, and see an access history of everyone who did. The citizen can search for doctors, hospitals, medicines and blood donors, and can pledge blood or organ donation. AI features are guidance for the citizen only; clinical AI results appear only after a doctor has reviewed them. The citizen is the only role that can hand out a key to the record.

### 3.1 Health Profile — BUILT

Shown in the Profile tab of `CitizenHome.tsx`.

#### 3.1.1 Identity card (locked fields)

These fields come from the verified identity and **cannot be edited** by the citizen. The card shows an "Identity verified - locked fields" indicator.

| Field | Notes | Status |
|-------|-------|--------|
| Full name | From e-KYC | BUILT |
| Date of birth | From e-KYC | BUILT |
| Sex | From e-KYC | BUILT |
| Aadhaar token | **Masked**; raw Aadhaar is never stored or shown | BUILT |
| ABHA number | From mock ABHA connector | BUILT |
| ABHA address | From mock ABHA connector | BUILT |
| Location | District + state | BUILT |
| KYC verified badge | Shows e-KYC passed | BUILT |
| Face check verified badge | Shows face match passed | BUILT |
| "Identity verified - locked fields" indicator | Explains why fields are not editable | BUILT |

#### 3.1.2 Editable profile form

| Field | Options | Status |
|-------|---------|--------|
| Preferred language | English / Malayalam / Hindi | BUILT |
| Blood group | A+, A-, B+, B-, AB+, AB-, O+, O-, unknown | BUILT |
| AI research opt-in | Checkbox: allow de-identified data to be used for AI research | BUILT |

#### 3.1.3 Profile fields planned but not yet editable

| Field | Status |
|-------|--------|
| Address | DESIGNED, NOT BUILT |
| Phone and email | DESIGNED, NOT BUILT |
| Allergies | DESIGNED, NOT BUILT |
| Current medications | DESIGNED, NOT BUILT |
| Donor status (blood and organ) | DESIGNED, NOT BUILT (see 3.11 and 3.12) |
| Emergency contacts (edit) | DESIGNED, NOT BUILT (see 3.3) |

> **Note.** The preferred-language setting is stored, but the alpha interface is English only (see 3.14). Hindi and Malayalam screens come after the pilot.

**Code:** `apps/api/src/citizen/` (profile view and edit). Frontend: `CitizenHome.tsx`.

### 3.2 Special Categories — BUILT

Special categories mark conditions or situations that need extra care, so that a doctor sees them early in a session.

| Item | Detail |
|------|--------|
| Category list | Fixed list of types (for example cancer, HIV, pregnancy, disability) plus "Other" with free text. The master list is maintained by Central Admin (see 14.7). |
| Status per category | `untreated` / `in progress` / `treated` |
| Add | Citizen adds a new category with a status |
| End | Citizen ends an existing category (it is closed, not deleted) |
| Link to dates panel | For special-category patients, doctors may set treatment schedules (chemo cycles, dialysis days) shown in the Dates panel (see 3.5) |

**API**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/citizen/special-categories/types` | List the category types |
| POST | `/v1/citizen/special-categories` | Add a category |
| POST | `/v1/citizen/special-categories/:id/end` | End a category |

**Code:** `apps/api/src/citizen/`.

### 3.3 Emergency Contacts — BUILT (read only)

| Item | Detail | Status |
|------|--------|--------|
| List view | Name, relation, priority for each contact | BUILT (read only) |
| Must be a registered user | Each contact needs their own CareFusion account | BUILT (rule enforced at registration) |
| Minimum of one | At least one contact is required | BUILT (enforced at registration) |
| Emergency code | Each contact has a separate emergency code, used only to approve emergency access (see 3.13.4) | Designed with the emergency flow |
| Add / edit / remove contact | Not built | DESIGNED, NOT BUILT |

### 3.4 Documents and Folders — BUILT

Shown in the Documents tab of `CitizenHome.tsx`.

#### 3.4.1 Folders

| Folder | Kind | Purpose |
|--------|------|---------|
| Doctor uploads | system | Documents added by doctors and staff |
| AI Chat | system | Saved citizen AI chat sessions (see 3.7) |
| Image Analysis | system | Scans and image analysis inputs and results |
| Genomic Analysis | system | VCF files and genomic results |
| Temporal Analysis | system | Vitals series and deterioration-risk results |
| Custom folders | user | Created by the citizen as needed |

- The 5 system folders are **auto-created** for every citizen (done in `apps/api/src/citizen/` when the profile is created).
- System folders cannot be removed.
- Citizens can create their own folders (`kind=user`).

#### 3.4.2 Documents

| Action | Detail | Status |
|--------|--------|--------|
| Upload | File picker; allowed types PDF, JPG, PNG, DOC, DOCX, TXT; title auto-filled from the file name | BUILT |
| Download | Through a pre-signed MinIO (laptop) or R2 (alpha) URL | BUILT |
| Move | Move a document between folders | BUILT |
| Edit | Not allowed. Documents are immutable. | By design |
| Delete | Not allowed. The store is append-only. | By design |

Each document has these fields:

| Field | Notes |
|-------|-------|
| title | Auto-filled from file name, editable at upload |
| docType | Document type label |
| mimeType | Detected file type |
| sizeBytes | File size |
| isSelfReported | `true` when uploaded by the citizen (kept apart from hospital-recorded documents) |
| SHA-256 hash | Computed at upload for integrity checks |

**API**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/citizen/folders` | List folders |
| POST | `/v1/citizen/folders` | Create a custom folder |
| GET | `/v1/citizen/folders/:id/documents` | List documents in a folder |
| POST | `/v1/citizen/documents/upload` | Upload a document |
| GET | `/v1/citizen/documents/:id/download` | Get a pre-signed download URL |
| POST | `/v1/citizen/documents/:id/move` | Move a document to another folder |

**Code:** `apps/api/src/documents/` (folder CRUD, upload, download, move); `apps/api/src/storage/` (S3-compatible service for MinIO and R2).

### 3.5 Dates Panel — DESIGNED, NOT BUILT

One panel that gathers every date the citizen needs to remember.

| Group | Contents |
|-------|----------|
| Appointments | Upcoming appointments |
| Past visits | Doctor sessions and hospital visits |
| Medicines | Medicine schedule and refill due dates |
| Preventive care | Vaccination, check-up and lab test due dates |
| Blood donation | Next eligible blood donation date |
| Special-category treatment | Treatment schedule set by the doctor (for example chemo cycles, dialysis days) |
| Prescriptions | Prescription validity and expiry dates |
| Doctor-set dates | Follow-up and refill dates set by a doctor appear automatically (see 4.6) |

### 3.6 Home Vitals — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| What the citizen adds | Readings from a BP machine, glucometer or smartwatch |
| Labelling | Marked **self-reported** and stored apart from hospital-recorded vitals |
| Use | Fed into the Temporal Analysis AI module (see 4.2, item 4) alongside hospital vitals |
| Folder | Temporal Analysis |

### 3.7 AI Health Chat — DESIGNED, NOT BUILT

| Rule | Detail |
|------|--------|
| Purpose | **Guidance only** |
| No diagnosis | Never gives a diagnosis or a list of diseases to a citizen |
| Doctor suggestion | Suggests seeing a doctor |
| Emergency flags | Flags emergency warning signs with a clear "go to hospital now" message |
| Saved | The chat is saved in the **AI Chat** folder so the doctor can review it |
| Label | All output labelled "simulated AI output" in the alpha |

### 3.8 Chat with Doctors — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Who | Only doctors who have treated the citizen (follow-up messages) |
| Video consultation | **NOT IN ALPHA** (not in the first version) |

### 3.9 Reviews and Appointments — DESIGNED, NOT BUILT

#### 3.9.1 Browse and review

- Separate sections for **hospital reviews** and **doctor reviews**.
- Filters: department or specialisation, location (district or state), hospital, government or private, rating.
- Each doctor or hospital page shows identity, where they serve, ratings and comments.

#### 3.9.2 Appointment flow

| Step | Action |
|------|--------|
| 1 | Citizen finds a doctor or hospital and requests an appointment |
| 2 | Hospital Admin confirms or rejects (see 10.5) |
| 3 | Citizen is notified; the date goes to the Dates panel |
| 4 | Fee is paid at the hospital. Booking is free. There are no payments in the app. |

#### 3.9.3 Bed availability

Citizens can see bed availability of nearby hospitals (for emergencies). Hospital Admin keeps it updated (see 10.7).

#### 3.9.4 Rating safeguards

| Safeguard | Detail |
|-----------|--------|
| Who can rate | Only ABHA-verified users |
| How many | One rating per user per entity (can be updated) |
| Moderation | District Admin moderates comments (see 11.4) |

### 3.10 Medicine Stock Finder — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Search | Search a medicine by name (national medicine catalogue) |
| Result | Nearest pharmacies and hospitals that have it |
| Shown per result | Stock (in / low / out), price, opening hours, distance |
| Freshness | Real-time updates (live pharmacy view) |

### 3.11 Blood Donation — DESIGNED, NOT BUILT

| Feature | Detail |
|---------|--------|
| "Ready to donate blood" toggle | ON: citizen appears in the donor list with blood group. OFF: removed, and any requesters are notified. |
| Auto-OFF | Turns OFF for about 3 months after a recorded donation (exact interval TO VERIFY, see Section 19) |
| Eligibility check | The toggle can be ON only after an eligibility check (age and blood-bank criteria) |
| Request blood | Fields: blood group, units, hospital, urgency |
| Auto-alert | Matching blood-group donors nearby get a notification |
| Map | Shows donors' **approximate area only** (not an exact address) |
| Contact | Through in-app call and chat. **Phone and address stay hidden.** |
| No payment talk | Selling blood is illegal. Chat blocks payment talk. A **report** button is provided. |
| e-RaktKosh link | Government blood-bank stock is shown alongside individual donors (mock connector in the alpha) |

### 3.12 Organ Donation — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Pledge | The citizen pledges to donate organs and chooses which organs |
| Signing | The pledge is signed **at a hospital** with a verified doctor, with verification and blood work |
| Registry | Recorded in CareFusion and linked to the official NOTTO registry (mock connector in the alpha) |
| Visibility | The organ donor list is visible only to authorised doctors and hospitals. It is **not public**. |
| Allocation | Follows NOTTO and SOTTO rules. CareFusion does **not** match or allocate organs. |

### 3.13 Patient Record Access Controls — DESIGNED, NOT BUILT

These controls decide who can open the citizen's record. They are the heart of the privacy design.

#### 3.13.1 Rotating key

| Item | Detail |
|------|--------|
| Form | QR code + number code |
| Rotation | Changes every **10 seconds** |
| Use | Citizen shows the key to a doctor, who scans or types it |
| Result | Doctor gets a **30-minute** session (see 4.2) |

#### 3.13.2 End session

An **End session** button ends the doctor's access early.

#### 3.13.3 Admission mode

The citizen can grant the treating team access until discharge. Nurses and doctors on the team can open the record in admission mode only.

#### 3.13.4 Emergency access (emergency contact approval)

| Step | Action |
|------|--------|
| 1 | Citizen cannot give a key (unconscious, for example). Doctor requests emergency access. |
| 2 | An emergency contact gets an alert. |
| 3 | The contact approves on their own phone using their separate **emergency code**. |
| 4 | Doctor gets access. The access is logged and reviewed by District Admin, then Central Admin (see 11.3 and 14.4). |

#### 3.13.5 Notification and history

| Item | Detail |
|------|--------|
| Notice | The patient is notified of **every** session |
| Access history | Visible to the citizen: who opened the record and when |

### 3.14 Account and Settings — DESIGNED, NOT BUILT

| Setting | Detail |
|---------|--------|
| Account deletion | Accounts are **never deleted**, only deactivated. DPDP right to erasure is TO VERIFY (Section 19, item 14). |
| Death | A hospital or doctor records the death. The account is locked, family is notified, the organ pledge is sent to NOTTO, and records are kept for the legal period. |
| Notifications | App push, SMS and email. **No WhatsApp.** |
| Health alerts | Normal alerts can be muted. **Emergency alerts can never be muted.** |
| Languages | **English only in the alpha.** Hindi and Malayalam come after the pilot. |
| Offline mode | A cached view when there is no internet. Syncs when the network returns. |

### 3.15 Citizen feature status table

| # | Feature | Status | Code or API |
|---|---------|--------|-------------|
| 3.1 | Health profile (identity card, editable form) | BUILT | `CitizenHome.tsx`, `apps/api/src/citizen/` |
| 3.2 | Special categories | BUILT | `/v1/citizen/special-categories*` |
| 3.3 | Emergency contacts | BUILT (read only) | `apps/api/src/citizen/` |
| 3.4 | Documents and folders | BUILT | `/v1/citizen/folders*`, `/v1/citizen/documents/*` |
| 3.5 | Dates panel | DESIGNED, NOT BUILT | — |
| 3.6 | Home vitals | DESIGNED, NOT BUILT | — |
| 3.7 | AI health chat | DESIGNED, NOT BUILT | — |
| 3.8 | Chat with doctors | DESIGNED, NOT BUILT | — |
| 3.9 | Reviews and appointments | DESIGNED, NOT BUILT | — |
| 3.10 | Medicine stock finder | DESIGNED, NOT BUILT | — |
| 3.11 | Blood donation | DESIGNED, NOT BUILT | — |
| 3.12 | Organ donation | DESIGNED, NOT BUILT | — |
| 3.13 | Record access controls | DESIGNED, NOT BUILT | — |
| 3.14 | Account and settings | DESIGNED, NOT BUILT | — |

---

## 4. Role 2: Doctor

**Dashboard:** `apps/web/src/pages/DoctorHome.tsx` — **PLACEHOLDER** (uses `RolePage` with "Coming soon")
**Route:** `/doctor`

**Description.** The doctor is a medical professional registered in the national HPR (mock connector in the alpha) and approved first by a District Admin and then confirmed by a State Admin. Registration and approval are BUILT (see Section 16), but the doctor's working screens are not. The doctor opens a patient's record only through the patient's key (or admission mode or emergency access), works inside a 30-minute session with AI modules, a file manager, prescriptions and voice notes, and every action is logged. AI is decision support only: the doctor marks agree or disagree on every AI result, and the final decision is always the doctor's. A doctor has two accounts: a citizen account for their own health, and a doctor account for work; the two are kept apart.

### 4.1 Doctor Home — DESIGNED, NOT BUILT

| Section | Contents |
|---------|----------|
| Profile | Name, specialisation, hospital, department, registration details |
| Work time | Duty schedule |
| Appointments | Today's and upcoming |
| Past patients | **Name plus the doctor's own additions only.** Opening the full record needs a new key. |
| Enter patient key | Scan the QR or type the number code. Alternative: health card QR + OTP. |

### 4.2 Patient Session (30 minutes) — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Opening | Doctor scans or types the patient's rotating key (see 3.13.1) |
| Length | 30 minutes, or until the patient ends it early |
| Admission mode | Treating team keeps access until discharge |
| Logging | Every click, button and view is logged (see 4.10) |

#### 4.2.1 Sections inside the session

| # | Section | What it does | Alpha behaviour |
|---|---------|--------------|-----------------|
| 1 | **AI Chat** | The paper's symptom reasoning engine: Whisper speech-to-text + DistilBERT closed vocabulary (247 ICD-11 terms), bucketed Isolation Forest, logistic regression top-3 | Simulated output |
| 2 | **Medical Image Analysis** | ResNet-50 + Grad-CAM++ with spatial-validity loss | Simulated output |
| 3 | **Genomic Analysis** | Deterministic VCF validation + ClinVar matching | Simulated output |
| 4 | **Temporal Analysis** | 2x128 LSTM; vitals-based deterioration risk; uses hospital vitals plus self-reported vitals | Simulated output |
| 5 | **File Manager** | Read, create folders, create new documents, upload, highlight. **Never edit or delete** existing items. | Real (stored in MinIO or R2) |

Every simulated result is labelled "simulated AI output". The paper's accuracy numbers are never claimed for it.

### 4.3 AI Results — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Status on every result | VERIFIED / SUPPORTED_WITH_CAUTION / UNCERTAIN |
| Disagreement reporting | If modules disagree with each other, the disagreement is reported |
| Doctor verdict | The doctor marks **agree** or **disagree** with a short reason. The final decision is always the doctor's. |
| What is saved per run | Input, output, evidence sources and their status, model version, time, doctor's verdict |
| Protection | Locked (no edit or delete), encrypted (AES-256), hash added to the tamper-proof log |
| Patient visibility | The patient sees a result only **after** the doctor reviews it (agree or disagree + note) |

#### 4.3.1 AI result lifecycle

| Step | State | Who can see it |
|------|-------|----------------|
| 1 | Run created (simulated) | Doctor only |
| 2 | Result with status label shown | Doctor only |
| 3 | Doctor records agree/disagree + note | Doctor only |
| 4 | Result released | Doctor and patient |
| 5 | Record locked and hashed | Read only for everyone |

### 4.4 New Document — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Auto-name | `YYYY-MM-DD HH:MM — Dr <name> — <patient name>` |
| Entry | The doctor types into a formatted template (consultation note, prescription, and so on) |
| Storage | Saved into the patient's Doctor uploads folder; immutable after saving |

### 4.5 Voice Notes to Text — DESIGNED, NOT BUILT

| Step | Action |
|------|--------|
| 1 | Doctor dictates |
| 2 | Whisper converts to text (simulated in the alpha) |
| 3 | Doctor checks and edits the text |
| 4 | Doctor saves it as a document |

### 4.6 Follow-up Dates — DESIGNED, NOT BUILT

Follow-up, refill and test dates set by the doctor appear automatically in the patient's Dates panel (see 3.5).

### 4.7 Prescriptions — DESIGNED, NOT BUILT

| Feature | Detail |
|---------|--------|
| Source | Written from the **national medicine catalogue** using generic names |
| Allergy warning | Checked against the patient's allergies |
| Interaction warning | Checked against other prescribed and current medicines (drug-interaction source TO VERIFY) |
| Stock shown | Hospital pharmacy availability is shown while prescribing |
| Signature | Digitally signed with a government-approved e-signature (e-Sign or DSC under the IT Act; rules TO VERIFY). Mock e-Sign connector in the alpha. |
| QR | A verifiable QR is printed on the prescription |
| Delivery | The patient always gets the signed copy and can show or send it to any pharmacy. For the doctor's own hospital pharmacy, the doctor can send directly **if the patient agrees**. |

#### 4.7.1 Prescription workflow

| Step | Actor | Action |
|------|-------|--------|
| 1 | Doctor | Picks medicines from the catalogue (generic names) |
| 2 | System | Shows allergy and interaction warnings and stock |
| 3 | Doctor | Reviews, resolves or overrides warnings, sets dose and duration |
| 4 | Doctor | Signs with e-Sign |
| 5 | System | Generates QR and saves signed copy to the patient's folder |
| 6 | Doctor / Patient | Sends to hospital pharmacy (with consent) or patient takes it to any pharmacy |
| 7 | Pharmacist | Dispenses (see Section 8) |

### 4.8 Referral — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| What | A referral note sent to another doctor or hospital |
| Access | The receiving doctor still needs the patient's key to open the full record |

### 4.9 Shift Handover Note — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| When | In admission mode |
| What | The outgoing doctor writes a short handover for the next doctor on duty |
| Storage | Saved in the patient's records |

### 4.10 Activity Logging and Location — DESIGNED, NOT BUILT

| Rule | Detail |
|------|--------|
| What is logged | Every action in a patient session: every click, button, view |
| Location check | At record open and every **5 minutes** during the session |
| Geofence | The doctor must be inside the registered hospital area |
| Outside the area | Access only with a reason (home visit, emergency). It is flagged to the District Admin (see 11.1). |
| Continuous tracking | **Not used** (privacy and battery) |
| Misuse | Account suspended, case reported to the medical council, patient informed |

### 4.11 Doctor Transfer and Leave — DESIGNED, NOT BUILT

The District Admin updates the doctor's hospital. The geofence and the past-patient list move with the doctor.

### 4.12 Donor Section — DESIGNED, NOT BUILT

| Part | Detail |
|------|--------|
| Blood donor list | Nearby donors; post and track blood requests |
| Patients needing blood | Track the doctor's own recent patients who need blood |
| Organ donor pledges | Visible to **authorised doctors only** (NOTTO rules) |
| Register a pledge | The doctor records the patient's organ pledge, signed at hospital, with verification and blood work |

### 4.13 Stock Section — DESIGNED, NOT BUILT

| Part | Detail |
|------|--------|
| Own hospital pharmacy | Medicines with stock (in / low / out) and expiry |
| Other pharmacies | Search pharmacies nearby (live pharmacy view) |

### 4.14 Doctor's Two Accounts — DESIGNED, NOT BUILT

| Account | Purpose |
|---------|---------|
| Citizen account | The doctor's own health record |
| Doctor account | Doctor tools |

- The doctor account **cannot open its own citizen record**.
- Opening a **family member's** record is allowed but **flagged**.

### 4.15 What is built for doctors today

| Item | Status | Code |
|------|--------|------|
| Doctor registration (HPR check, documents) | BUILT | `apps/api/src/registration/`, `apps/api/src/connectors/` (mock HPR) |
| Doctor approval by District Admin, then confirmation by State Admin | BUILT (inbox approve/reject) | `apps/api/src/approval/` |
| Doctor home screen | PLACEHOLDER | `DoctorHome.tsx` |

### 4.16 Doctor feature status table

| # | Feature | Status |
|---|---------|--------|
| 4.1 | Doctor home | PLACEHOLDER |
| 4.2 | Patient session (30 min) | DESIGNED, NOT BUILT |
| 4.2.1 | AI Chat / Image / Genomic / Temporal / File Manager | DESIGNED, NOT BUILT |
| 4.3 | AI results and verdict | DESIGNED, NOT BUILT |
| 4.4 | New document | DESIGNED, NOT BUILT |
| 4.5 | Voice notes to text | DESIGNED, NOT BUILT |
| 4.6 | Follow-up dates | DESIGNED, NOT BUILT |
| 4.7 | Prescriptions | DESIGNED, NOT BUILT |
| 4.8 | Referral | DESIGNED, NOT BUILT |
| 4.9 | Shift handover note | DESIGNED, NOT BUILT |
| 4.10 | Activity logging and location | DESIGNED, NOT BUILT (audit chain module exists, see 15.6) |
| 4.11 | Transfer and leave | DESIGNED, NOT BUILT |
| 4.12 | Donor section | DESIGNED, NOT BUILT |
| 4.13 | Stock section | DESIGNED, NOT BUILT |
| 4.14 | Two accounts | DESIGNED, NOT BUILT |

---

## 5. Role 3: Nurse

**Dashboard:** `apps/web/src/pages/NurseHome.tsx` — **PLACEHOLDER**
**Route:** `/nurse`

**Description.** The nurse is a hospital staff member created by the Hospital Admin (BUILT, see 10.3). The nurse works from an orders queue: a doctor places an order (for example "BP every 4 hours"), the nurse does the task and uploads the result. The nurse does not get access to the full patient record, only to what the order shows, unless the nurse is on the treating team in admission mode. Everything the nurse uploads is tagged with name, time and order ID.

### 5.1 Orders Queue — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Contents | Active doctor orders for the nurse's department (for example "BP every 4h") |
| Opening an order | Shows the patient's name, the order details and what to upload |
| Access | **No full record access** |

### 5.2 Upload Flow — DESIGNED, NOT BUILT

| Upload type | Format |
|-------------|--------|
| Vitals | Form entry |
| Lab report | PDF or values |
| Scan | X-ray or DICOM |
| Genomic file | VCF |

| Rule | Detail |
|------|--------|
| Tag | Every upload is tagged with the staff name, time and order ID |
| Destination | The right patient folder (and the AI tool folder if applicable) |
| Completion | The order is marked done, and the doctor is notified |

#### 5.2.1 Nurse workflow

| Step | Action |
|------|--------|
| 1 | Open the orders queue |
| 2 | Pick an active order |
| 3 | Do the task (for example measure BP) |
| 4 | Enter or upload the result |
| 5 | Submit; the system tags and files it |
| 6 | Order is marked done; doctor gets a notification |

### 5.3 Admission Mode — DESIGNED, NOT BUILT

Nurses on the treating team can record vitals for the whole stay. They can open records **in admission mode only**.

### 5.4 Offline Mode — DESIGNED, NOT BUILT

The nurse can record vitals offline. The data syncs when the network returns.

### 5.5 Nurse feature status table

| # | Feature | Status |
|---|---------|--------|
| 5.1 | Orders queue | DESIGNED, NOT BUILT |
| 5.2 | Upload flow | DESIGNED, NOT BUILT |
| 5.3 | Admission mode | DESIGNED, NOT BUILT |
| 5.4 | Offline mode | DESIGNED, NOT BUILT |
| — | Account creation by Hospital Admin | BUILT (`/api/v1/admin-ops/create-staff`) |
| — | Dashboard | PLACEHOLDER (`NurseHome.tsx`) |

---

## 6. Role 4: Lab Technician

**Dashboard:** `apps/web/src/pages/LabTechHome.tsx` — **PLACEHOLDER**
**Route:** `/lab-tech`

**Description.** The lab technician is a hospital staff member created by the Hospital Admin. The role works exactly like the nurse role (orders queue, tagged uploads, no full record access) but for laboratory orders. In future, laboratory information systems (LIS) can send reports directly.

### 6.1 Same pattern as Nurse, for Lab — DESIGNED, NOT BUILT

| Feature | Detail |
|---------|--------|
| Orders queue | Lab-specific orders (CBC, blood panel, and similar) |
| Upload | Lab reports as PDF or structured values |
| Tags | Technician name, time and order ID |
| Completion | Order marked done; doctor notified |
| Future | LIS sends reports directly (not in the alpha) |

### 6.2 Lab technician workflow

| Step | Action |
|------|--------|
| 1 | Open the lab orders queue |
| 2 | Open an order: see patient name, test requested, what to upload |
| 3 | Run the test (outside CareFusion) |
| 4 | Upload the report (PDF) or enter structured values |
| 5 | Submit; report goes into the patient folder with tags |
| 6 | Doctor is notified |

### 6.3 Lab technician feature status table

| Feature | Status |
|---------|--------|
| Orders queue | DESIGNED, NOT BUILT |
| Report upload | DESIGNED, NOT BUILT |
| LIS direct feed | NOT IN ALPHA |
| Account creation | BUILT (`/api/v1/admin-ops/create-staff`) |
| Dashboard | PLACEHOLDER (`LabTechHome.tsx`) |

---

## 7. Role 5: Radiology Technician

**Dashboard:** `apps/web/src/pages/RadioTechHome.tsx` — **PLACEHOLDER**
**Route:** `/radiology-tech`

**Description.** The radiology technician is a hospital staff member created by the Hospital Admin. The role works exactly like the nurse role but for imaging orders. Images uploaded here feed the Image Analysis AI module in the doctor's session. In future, a PACS integration can send images directly.

### 7.1 Same pattern as Nurse, for Radiology — DESIGNED, NOT BUILT

| Feature | Detail |
|---------|--------|
| Orders queue | Radiology orders (X-ray, CT, MRI, and similar) |
| Upload | Scans (DICOM, images) |
| Destination | Images go to the **Image Analysis** input folder |
| Tags | Technician name, time and order ID |
| Completion | Order marked done; doctor notified |
| Future | PACS integration sends images directly (not in the alpha) |

### 7.2 Radiology technician workflow

| Step | Action |
|------|--------|
| 1 | Open the radiology orders queue |
| 2 | Open an order |
| 3 | Take the scan (outside CareFusion) |
| 4 | Upload DICOM or image files |
| 5 | Submit; images go to the Image Analysis input folder |
| 6 | Doctor is notified and can run Image Analysis |

### 7.3 Radiology technician feature status table

| Feature | Status |
|---------|--------|
| Orders queue | DESIGNED, NOT BUILT |
| Scan upload | DESIGNED, NOT BUILT |
| PACS direct feed | NOT IN ALPHA |
| Account creation | BUILT (`/api/v1/admin-ops/create-staff`) |
| Dashboard | PLACEHOLDER (`RadioTechHome.tsx`) |

> **Open item.** Storage capacity for scans and VCF files at national scale is not yet estimated (Section 19, item 13).

---

## 8. Role 6: Pharmacist

**Dashboard:** `apps/web/src/pages/PharmacistHome.tsx` — **PLACEHOLDER**
**Route:** `/pharmacist`

**Description.** The pharmacist works at a pharmacy and is created by the Pharmacy Admin (BUILT, see 9.3). The pharmacist receives signed prescriptions, checks that they are valid, dispenses the medicines, handles controlled drugs with extra checks, and every dispensing is recorded against the pharmacist. The pharmacist does not see the patient's health record, only the prescription.

### 8.1 Incoming Prescriptions — DESIGNED, NOT BUILT

The pharmacist receives prescriptions that are:

- sent by patients, or
- sent directly by a doctor of the same hospital (with patient consent, see 4.7).

### 8.2 Dispensing Flow — DESIGNED, NOT BUILT

| Step | Action |
|------|--------|
| 1 | Receive the prescription from the queue, or scan the patient's prescription QR at the counter |
| 2 | The system checks the e-signature and that the prescription is valid and **not already fully dispensed** |
| 3 | **Controlled drugs (Schedule H / H1 / X):** extra checks (valid prescription, quantity limits) and an entry in the controlled-drug register (Schedule rules TO VERIFY) |
| 4 | Mark each medicine as **dispensed**, **substitute given**, or **out of stock** (with a note to the doctor) |
| 5 | Stock reduces automatically |
| 6 | The patient is notified "medicines collected" |
| 7 | Every dispensing is recorded against the pharmacist |

### 8.3 Per-medicine outcomes

| Outcome | What happens |
|---------|--------------|
| Dispensed | Stock decrements; line is closed |
| Substitute given | Pharmacist records the substitute; stock for the substitute decrements; doctor can see the note |
| Out of stock | Note sent to the doctor; line stays open; patient can try another pharmacy |

### 8.4 Pharmacist feature status table

| Feature | Status |
|---------|--------|
| Incoming queue | DESIGNED, NOT BUILT |
| QR scan at counter | DESIGNED, NOT BUILT |
| E-signature and validity check | DESIGNED, NOT BUILT |
| Controlled drug checks and register | DESIGNED, NOT BUILT |
| Per-medicine marking | DESIGNED, NOT BUILT |
| Automatic stock reduction | DESIGNED, NOT BUILT |
| Patient "collected" notification | DESIGNED, NOT BUILT |
| Account creation by Pharmacy Admin | BUILT (`/api/v1/admin-ops/create-pharmacist`) |
| Dashboard | PLACEHOLDER (`PharmacistHome.tsx`) |

---

## 9. Role 7: Pharmacy Admin

**Dashboard:** `apps/web/src/pages/PharmacyAdminHome.tsx` — **PARTIALLY BUILT** (CreatePharmacistForm)
**Route:** `/pharmacy-admin`

**Description.** The pharmacy admin runs one pharmacy (government hospital pharmacy or private). The account is created through registration with a mock drug-licence check and approved by the District Admin. The pharmacy admin keeps stock up to date, creates and deactivates pharmacist accounts, sets opening hours and location, and keeps the controlled-drug register and dispensing reports. Patients can see this pharmacy's stock live.

### 9.1 Home — DESIGNED, NOT BUILT

| Section | Contents |
|---------|----------|
| Pharmacy card | Licence number, type (govt-hospital or private), hours |
| Alerts | Low stock, items near expiry, out-of-stock items requested by patients |

### 9.2 Stock Management — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Add or update | Medicines from the national medicine catalogue |
| Fields | Quantity, price, batch, expiry |
| Pharmacy software link | Pharmacies with existing billing or stock software can sync automatically. Others update in the app. Which software to support first is open (Section 19, item 3). |
| Spreadsheet bulk upload | **Not used** |

### 9.3 Pharmacist Accounts — BUILT

| Item | Detail |
|------|--------|
| Create pharmacist account | `CreatePharmacistForm` component in `CreateAccountForm.tsx` |
| Deactivate pharmacist account | Planned in the design; the creation form is the built part |
| API | `POST /api/v1/admin-ops/create-pharmacist` |
| Code | `apps/api/src/admin-ops/` |

### 9.4 Hours and Location — DESIGNED, NOT BUILT

Opening hours, holidays and a map pin.

### 9.5 Dispensing Report — DESIGNED, NOT BUILT

What was dispensed, and by which pharmacist.

### 9.6 Controlled-Drug Register — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| What | A record of restricted medicines dispensed (Schedule H / H1 / X) |
| Why | Required by Indian drug rules (to verify exact rules) |

### 9.7 Ratings — DESIGNED, NOT BUILT

The pharmacy admin can read ratings and reply. Replies are public. Ratings and comments **cannot be deleted** by the pharmacy.

### 9.8 Pharmacy Admin feature status table

| # | Feature | Status |
|---|---------|--------|
| 9.1 | Home and alerts | DESIGNED, NOT BUILT |
| 9.2 | Stock management | DESIGNED, NOT BUILT |
| 9.3 | Create pharmacist accounts | BUILT |
| 9.4 | Hours and location | DESIGNED, NOT BUILT |
| 9.5 | Dispensing report | DESIGNED, NOT BUILT |
| 9.6 | Controlled-drug register | DESIGNED, NOT BUILT |
| 9.7 | Ratings | DESIGNED, NOT BUILT |
| — | Registration with mock drug-licence check, district approval | BUILT (`apps/api/src/registration/`, `connectors/`, `approval/`) |

---

## 10. Role 8: Hospital Admin

**Dashboard:** `apps/web/src/pages/HospitalAdminHome.tsx` — **PARTIALLY BUILT** (CreateStaffForm)
**Route:** `/hospital-admin`

**Description.** The hospital admin manages one hospital. The account is registered with a mock HFR (Health Facility Registry) check and approved by the District Admin. The hospital admin runs the hospital profile, creates the nurse, lab and radiology accounts, sets appointment slots and confirms requests, keeps bed availability up to date, and sees who is admitted and which team treats them. The hospital admin never opens patient records.

### 10.1 Home — DESIGNED, NOT BUILT

| Section | Contents |
|---------|----------|
| Hospital profile card | Name, HFR ID, type (govt or private), district |
| Today at a glance | Appointments booked, patients admitted, staff on duty, free beds, low-stock alerts from the linked pharmacy |

### 10.2 Hospital Profile — DESIGNED, NOT BUILT

| Field | Notes |
|-------|-------|
| Departments | List |
| Services | List |
| Timings | Opening hours |
| Contact | Phone, email |
| Location | Map pin. **The pin is used for doctors' geofence** (see 4.10). |

### 10.3 Staff Management — BUILT

| Action | Detail | Status |
|--------|--------|--------|
| Create nurse, lab tech, radiology tech accounts | `CreateStaffForm` component in `CreateAccountForm.tsx` | BUILT |
| Deactivate staff accounts | Designed | DESIGNED, NOT BUILT |
| See who is active | Designed | DESIGNED, NOT BUILT |

**API:** `POST /api/v1/admin-ops/create-staff`. **Code:** `apps/api/src/admin-ops/`.

### 10.4 Doctors List — DESIGNED, NOT BUILT

The hospital admin can view doctors linked to the hospital. The list is **read only**. Doctors are approved by the district and then the state.

### 10.5 Appointments — DESIGNED, NOT BUILT

| Action | Detail |
|--------|--------|
| Set slots | Per department or doctor |
| Respond to requests | Confirm or reject appointment requests from citizens (see 3.9.2) |

### 10.6 Admissions — DESIGNED, NOT BUILT

Shows current admitted patients and their treating team. **Names only; no access to records.**

### 10.7 Bed Availability — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Update | Free general and ICU beds |
| Shown to | Citizens and ambulances in emergencies |

### 10.8 Pharmacy Stock (View Only) — DESIGNED, NOT BUILT

The hospital admin can view the linked government hospital pharmacy stock but **cannot manage it** (the Pharmacy Admin does that).

### 10.9 Ratings — DESIGNED, NOT BUILT

Read ratings and comments, and post a public reply. Comments cannot be deleted.

### 10.10 Dashboard — DESIGNED, NOT BUILT

Visits, admissions, referrals in and out, and ratings over time.

### 10.11 Hospital Admin feature status table

| # | Feature | Status |
|---|---------|--------|
| 10.1 | Home | DESIGNED, NOT BUILT |
| 10.2 | Hospital profile | DESIGNED, NOT BUILT |
| 10.3 | Staff management | PARTIALLY BUILT (create) |
| 10.4 | Doctors list | DESIGNED, NOT BUILT |
| 10.5 | Appointments | DESIGNED, NOT BUILT |
| 10.6 | Admissions | DESIGNED, NOT BUILT |
| 10.7 | Bed availability | DESIGNED, NOT BUILT |
| 10.8 | Pharmacy stock (view) | DESIGNED, NOT BUILT |
| 10.9 | Ratings | DESIGNED, NOT BUILT |
| 10.10 | Dashboard | DESIGNED, NOT BUILT |

---

## 11. Role 9: District Admin

**Dashboard:** `apps/web/src/pages/DistrictAdminHome.tsx` — **PARTIALLY BUILT** (ApprovalInbox)
**Route:** `/district-admin`

**Description.** The district admin is the first line of oversight and the busiest approver in the system. A district admin approves new doctors, hospital admins and pharmacy admins in their district, reviews emergency accesses, handles location flags and complaints, moderates rating comments, and watches for unusual patterns. If an approval is not acted on in time, it escalates to the State Admin. The district admin sees de-identified data only, never patient records.

### 11.1 Task Inbox — PARTIALLY BUILT

The approval inbox component (`ApprovalInbox.tsx`) is built with approve and reject actions.

| Pending item | Status |
|--------------|--------|
| Doctor approvals (first step), with due date | BUILT (inbox) |
| Hospital admin approvals | BUILT (inbox) |
| Pharmacy admin approvals | BUILT (inbox) |
| Emergency access reviews (first review) | DESIGNED, NOT BUILT |
| Flagged new users (failed e-KYC or face check, duplicates) | DESIGNED, NOT BUILT |
| Location flags (doctors outside the geofence) | DESIGNED, NOT BUILT |
| Rating comments waiting for moderation | DESIGNED, NOT BUILT |
| Complaints | DESIGNED, NOT BUILT |
| Unusual-pattern alerts (for example a doctor with many break-glass uses, or a disease spike) | DESIGNED, NOT BUILT |

### 11.2 Approvals — BUILT (core)

| Step | Action |
|------|--------|
| 1 | Open an item in the inbox |
| 2 | Check documents and the HPR / HFR / drug-licence results (mock connectors in the alpha) |
| 3 | **Approve** or **reject** (reject needs a reason) |
| 4 | A decision is written to the audit log |
| 5 | Doctor approvals then go to the State Admin for confirmation |

Time limit: if not acted on within a set number of days, the item escalates to the State Admin. The exact number of days is an open question (Section 19, item 1).

**API**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/approvals/inbox` | List pending items |
| POST | `/api/v1/approvals/:id/approve` | Approve |
| POST | `/api/v1/approvals/:id/reject` | Reject |

**Code:** `apps/api/src/approval/`; frontend `ApprovalInbox.tsx`.

### 11.3 Emergency Reviews — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| What the admin sees | The doctor, the reason, the time, and what was viewed |
| Decision | Mark **OK** or **misuse** |
| Misuse | Suspend the account and report to the medical council |
| Next level | Central Admin verifies within 24 hours (see 14.4) |

### 11.4 Moderation — DESIGNED, NOT BUILT

Approve or remove rating comments (abuse, private health details).

### 11.5 Complaints — DESIGNED, NOT BUILT

Assign, respond and close.

### 11.6 Accounts — DESIGNED, NOT BUILT

| Action | Detail |
|--------|--------|
| Suspend / deactivate | Accounts in the district |
| Doctor transfers | Update the doctor's hospital; geofence and past-patient list move with the doctor (see 4.11) |

### 11.7 Dashboard — DESIGNED, NOT BUILT

Hospitals, pharmacies, shortages, ratings and emergency accesses, all **de-identified**.

### 11.8 District Admin feature status table

| # | Feature | Status |
|---|---------|--------|
| 11.1 | Task inbox | PARTIALLY BUILT |
| 11.2 | Approve / reject | BUILT |
| 11.3 | Emergency reviews | DESIGNED, NOT BUILT |
| 11.4 | Moderation | DESIGNED, NOT BUILT |
| 11.5 | Complaints | DESIGNED, NOT BUILT |
| 11.6 | Accounts (suspend, transfers) | DESIGNED, NOT BUILT |
| 11.7 | Dashboard | DESIGNED, NOT BUILT |

---

## 12. Role 10: State Admin

**Dashboard:** `apps/web/src/pages/StateAdminHome.tsx` — **PARTIALLY BUILT** (ApprovalInbox + CreateAdminForm)
**Route:** `/state-admin`

**Description.** The state admin oversees all districts in one state. The state admin creates district admin accounts (which a Zonal Admin then approves), confirms doctors that districts have approved, handles second reviews of flagged users and overdue district approvals, sends state-wide health alerts, adds state health guidelines to the regional AI knowledge store, and can view logs only when the Central Admin grants permission.

### 12.1 Home — PARTIALLY BUILT

| Item | Status |
|------|--------|
| Approval inbox | BUILT (`ApprovalInbox.tsx`) |
| Pending: district-approved doctors waiting for state confirmation | BUILT (inbox) |
| Flagged new users escalated by districts | DESIGNED, NOT BUILT |
| Overdue district approvals | DESIGNED, NOT BUILT |
| State alerts, shortages, unusual-pattern alerts | DESIGNED, NOT BUILT |

### 12.2 District Admin Creation — BUILT

| Item | Detail |
|------|--------|
| Action | Create district admin accounts |
| Component | `CreateAdminForm` with `creatorLevel="state"` |
| Approval | The Zonal Admin approves the new district admin |
| API | `POST /api/v1/admin-ops/create-admin` |
| Code | `apps/api/src/admin-ops/` |

### 12.3 Doctor Confirmation — BUILT (via inbox)

The second step: confirm doctors approved by districts. This appears in the state admin's approval inbox.

### 12.4 Flagged Users — DESIGNED, NOT BUILT

Second review of flagged users escalated from districts.

### 12.5 Health Alerts — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| Send | State-wide alerts, of type normal or emergency |
| Citizens | Can mute normal alerts; emergency alerts are never muted |

### 12.6 AI Guidelines — DESIGNED, NOT BUILT

Add state health guidelines to the regional AI knowledge store. In the alpha, this feeds simulated outputs only.

### 12.7 Logs — DESIGNED, NOT BUILT

| Step | Action |
|------|--------|
| 1 | State admin requests permission from the Central Admin to view logs |
| 2 | Central Admin grants permission (see 14.6) |
| 3 | State admin views the logs |

### 12.8 Dashboard — DESIGNED, NOT BUILT

Disease trends, shortages, ratings and doctor counts by district.

### 12.9 State Admin feature status table

| # | Feature | Status |
|---|---------|--------|
| 12.1 | Home | PARTIALLY BUILT |
| 12.2 | Create district admin | BUILT |
| 12.3 | Doctor confirmation | BUILT (inbox) |
| 12.4 | Flagged users | DESIGNED, NOT BUILT |
| 12.5 | Health alerts | DESIGNED, NOT BUILT |
| 12.6 | AI guidelines | DESIGNED, NOT BUILT |
| 12.7 | Logs (with permission) | DESIGNED, NOT BUILT |
| 12.8 | Dashboard | DESIGNED, NOT BUILT |

---

## 13. Role 11: Zonal Admin

**Dashboard:** `apps/web/src/pages/ZonalAdminHome.tsx` — **PARTIALLY BUILT** (ApprovalInbox + CreateAdminForm)
**Route:** `/zonal-admin`

**Description.** The zonal admin oversees a group of states (one of five zones: North, South, East, West, Central). The zonal admin creates state admin accounts (which the Central Admin approves), approves district admins created by state admins, takes escalations from states, and compares states in the zone.

### 13.1 State Admin Creation — BUILT

| Item | Detail |
|------|--------|
| Action | Create state admin accounts |
| Component | `CreateAdminForm` with `creatorLevel="zonal"` |
| Approval | The Central Admin approves |
| API | `POST /api/v1/admin-ops/create-admin` |

### 13.2 District Admin Approvals — BUILT (via inbox)

Approve district admins created by state admins, through the approval inbox.

### 13.3 Escalations — DESIGNED, NOT BUILT

Problems that states cannot solve.

### 13.4 Zone Dashboard — DESIGNED, NOT BUILT

Compare states within the zone.

### 13.5 Zonal Admin feature status table

| # | Feature | Status |
|---|---------|--------|
| 13.1 | Create state admin | BUILT |
| 13.2 | Approve district admins | BUILT (inbox) |
| 13.3 | Escalations | DESIGNED, NOT BUILT |
| 13.4 | Zone dashboard | DESIGNED, NOT BUILT |

---

## 14. Role 12: Central Admin

**Dashboard:** `apps/web/src/pages/CentralAdminHome.tsx` — **PARTIALLY BUILT** (ApprovalInbox + CreateAdminForm)
**Route:** `/central-admin`

**Description.** The central admin is the national authority. The central admin assigns states to zones, creates zonal admins (with two-person approval), approves state admins, verifies every emergency access within 24 hours, does the final check on flagged doctors, can view any user's activity log at any time, manages national master lists, sends national alerts, and can suspend any account (two-person approval when suspending admins).

### 14.1 Zone Management — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| What | Assign states to zones |
| Rule | **Only the Central Admin** can change a state's zone |
| Zones | 5: North, South, East, West, Central |

### 14.2 Zonal Admin Creation — BUILT

| Item | Detail |
|------|--------|
| Action | Create zonal admin accounts |
| Component | `CreateAdminForm` with `creatorLevel="central"` |
| Approval | **Two-person approval** required |
| API | `POST /api/v1/admin-ops/create-admin` |

### 14.3 State Admin Approvals — BUILT (via inbox)

Approve state admins created by zonal admins.

### 14.4 Emergency Verification — DESIGNED, NOT BUILT

Verify **every** emergency access within **24 hours**, after the District Admin has reviewed it (see 11.3).

### 14.5 Flagged Doctors — DESIGNED, NOT BUILT

Final check on flagged doctor applications.

### 14.6 Logs — DESIGNED, NOT BUILT

| Item | Detail |
|------|--------|
| View | Any user's activity log, at any time |
| Grant | Give State Admins permission to view logs (see 12.7) |

### 14.7 Master Lists — DESIGNED, NOT BUILT

| List | Used by |
|------|---------|
| Special categories list | Citizen profile (see 3.2) |
| Medicine catalogue | Prescriptions, pharmacy stock, stock finder |
| Hospital types | Hospital profile |
| Rating rules | Ratings system |

### 14.8 National Alerts — DESIGNED, NOT BUILT

Send national health alerts, of type normal or emergency.

### 14.9 Account Suspension — DESIGNED, NOT BUILT

Suspend any account. Suspending admins needs **two-person approval**.

### 14.10 National Dashboard — DESIGNED, NOT BUILT

All metrics nationally, plus unusual-pattern alerts (de-identified).

### 14.11 Central Admin feature status table

| # | Feature | Status |
|---|---------|--------|
| 14.1 | Zone management | DESIGNED, NOT BUILT |
| 14.2 | Create zonal admin | BUILT |
| 14.3 | Approve state admins | BUILT (inbox) |
| 14.4 | Emergency verification | DESIGNED, NOT BUILT |
| 14.5 | Flagged doctors | DESIGNED, NOT BUILT |
| 14.6 | Logs | DESIGNED, NOT BUILT |
| 14.7 | Master lists | DESIGNED, NOT BUILT |
| 14.8 | National alerts | DESIGNED, NOT BUILT |
| 14.9 | Account suspension | DESIGNED, NOT BUILT |
| 14.10 | National dashboard | DESIGNED, NOT BUILT |

---

## 15. Cross-cutting features (all roles)

### 15.1 Prescriptions and Pharmacy System — DESIGNED, NOT BUILT

| Part | Detail | Roles involved |
|------|--------|----------------|
| Writing | Doctor writes from the national medicine catalogue (generic names) with allergy and drug-interaction warnings, and stock shown | Doctor |
| Signing | Signed with a government e-signature, with a verifiable QR | Doctor |
| Patient copy | The patient always gets the signed copy and chooses any pharmacy | Citizen |
| Direct send | Doctor's own hospital pharmacy: direct send if the patient agrees | Doctor, Pharmacist |
| Dispensing | Pharmacist checks the e-signature; controlled drugs get extra checks | Pharmacist |
| Live pharmacy view | Stock (in / low / out), price, hours and distance for citizens and doctors | Citizen, Doctor |
| Stock upkeep | Pharmacy Admin keeps stock updated | Pharmacy Admin |

### 15.2 Blood Donation System — DESIGNED, NOT BUILT

| Part | Detail |
|------|--------|
| Toggle | "Ready to donate" with eligibility check and auto-OFF for 3 months |
| Requests | By users, doctors or hospitals, with auto-alert to matching donors |
| Map | Shows an approximate area; in-app contact (number and address hidden) |
| Payment | **Not allowed**; chat blocks payment talk; report button |
| Blood banks | e-RaktKosh stock shown (mock connector in the alpha) |

### 15.3 Organ Donation System — DESIGNED, NOT BUILT

| Part | Detail |
|------|--------|
| Pledges | Signed at hospital with a verified doctor |
| Registry | Linked to NOTTO (mock connector in the alpha) |
| Visibility | Authorised doctors only |
| Allocation | By NOTTO and SOTTO rules; CareFusion does not allocate |

### 15.4 Ratings System — DESIGNED, NOT BUILT

| Rule | Detail |
|------|--------|
| What is rated | Doctors, hospitals and pharmacies |
| When | Any time |
| Who | ABHA-verified users |
| How many | One rating per user per entity (updatable) |
| Moderation | District Admin moderates comments |
| Replies | Rated entities can reply but not delete |
| Policy check | NMC rules on doctor ratings TO VERIFY |

### 15.5 Notifications — DESIGNED, NOT BUILT

| Channel | Status in design |
|---------|------------------|
| App push | Yes |
| SMS | Yes (mock SMS connector in the alpha) |
| Email | Yes (Mailpit on laptop) |
| WhatsApp | **No** |

| Alert type | Can the citizen mute it? |
|------------|--------------------------|
| Normal health alert | Yes |
| Emergency health alert | **Never** |

### 15.6 Activity Logging — PARTIALLY BUILT

| Item | Detail | Status |
|------|--------|--------|
| Hash-chained audit log module | `apps/api/src/audit/` | BUILT |
| Permanent log per user | Action, GPS or IP area, time, device, IP | DESIGNED (audit module is the base) |
| Immutability | No one can edit or delete; kept forever | By design |
| Tamper-proof | Hash chain | BUILT (audit module) |
| Central Admin | Always sees all | DESIGNED, NOT BUILT |
| State Admin | Sees logs only with permission | DESIGNED, NOT BUILT |
| Patient | Sees **access history only** | DESIGNED, NOT BUILT |

### 15.7 Offline Mode — DESIGNED, NOT BUILT

Staff can view cached data and record visits and vitals offline. Data syncs when the network returns.

### 15.8 Mock government connectors — BUILT

All live in `apps/api/src/connectors/`.

| Connector | Used for | Status |
|-----------|----------|--------|
| Aadhaar e-KYC | Citizen identity check at registration | BUILT (mock) |
| Face check | Face match at registration | BUILT (mock) |
| ABHA | ABHA number and address | BUILT (mock) |
| HPR | Doctor registration check | BUILT (mock) |
| HFR | Hospital registration check | BUILT (mock) |
| Drug licence | Pharmacy registration check | BUILT (mock) |
| Jan Parichay, e-Sign, NOTTO, e-RaktKosh, SMS | Staff login, prescription signing, organ registry, blood-bank stock, notifications | Listed in rules; not yet built |

---

## 16. Account creation and approval chain

### 16.1 How each role gets an account

| Role | Created by | Approved by | Status |
|------|-----------|-------------|--------|
| Citizen | Self-registration (mock e-KYC, face check, ABHA) | Automatic if checks pass; failures flagged to District Admin | BUILT |
| Doctor | Self-registration (mock HPR) | District Admin (first), State Admin (second); Central Admin final check if flagged | BUILT (registration and inbox) |
| Nurse / Lab Tech / Radiology Tech | Hospital Admin | — | BUILT (creation) |
| Pharmacist | Pharmacy Admin | — | BUILT (creation) |
| Pharmacy Admin | Self-registration (mock drug licence) | District Admin | BUILT (registration and inbox) |
| Hospital Admin | Self-registration (mock HFR) | District Admin | BUILT (registration and inbox) |
| District Admin | State Admin | Zonal Admin | BUILT |
| State Admin | Zonal Admin | Central Admin | BUILT |
| Zonal Admin | Central Admin | Two-person approval | BUILT |
| Central Admin | Seeded for the demo | — | Demo data |

> **Assumption.** The "seeded for the demo" origin of the Central Admin and the "automatic if checks pass" rule for citizens are inferred from the current build and `docs/15_LOGIN_AND_AUTH_COMPLETE_DETAILS.md`. Check that file if anything differs; the decision log wins.

### 16.2 Admin chain diagram

```
Central Admin --creates--> Zonal Admin       (two-person approval)
Zonal Admin   --creates--> State Admin       (Central approves)
State Admin   --creates--> District Admin    (Zonal approves)
District Admin approves--> Doctors (step 1), Hospital Admins, Pharmacy Admins
State Admin   confirms --> Doctors (step 2)
Central Admin final check -> Flagged doctors
```

### 16.3 All account creation endpoints

| Endpoint | Creates | Called from |
|----------|---------|-------------|
| `POST /api/v1/admin-ops/create-admin` | District, state or zonal admin (by `creatorLevel`) | `CreateAdminForm` in State, Zonal and Central admin pages |
| `POST /api/v1/admin-ops/create-staff` | Nurse, lab tech, radiology tech | `CreateStaffForm` in Hospital Admin page |
| `POST /api/v1/admin-ops/create-pharmacist` | Pharmacist | `CreatePharmacistForm` in Pharmacy Admin page |

---

## 17. Implementation status summary

### 17.1 By role

| Role | Dashboard Status | Features Built |
|------|-----------------|----------------|
| Citizen | BUILT (Profile + Documents tabs) | Profile view/edit, special categories, emergency contacts (view), folders, document upload/download/move |
| Doctor | PLACEHOLDER | None yet (registration and approval are built) |
| Nurse | PLACEHOLDER | None yet |
| Lab Tech | PLACEHOLDER | None yet |
| Radiology Tech | PLACEHOLDER | None yet |
| Pharmacist | PLACEHOLDER | None yet |
| Pharmacy Admin | PARTIAL | Create pharmacist accounts |
| Hospital Admin | PARTIAL | Create staff accounts |
| District Admin | PARTIAL | Approval inbox (approve/reject) |
| State Admin | PARTIAL | Approval inbox + create district admin |
| Zonal Admin | PARTIAL | Approval inbox + create state admin |
| Central Admin | PARTIAL | Approval inbox + create zonal admin |

### 17.2 Count of features by status (approximate)

These counts are an estimate from the sub-sections above, not a tracked metric.

| Role | BUILT or partly built | DESIGNED, NOT BUILT |
|------|-----------------------|---------------------|
| Citizen | 4 (profile, categories, contacts, documents) | 10 |
| Doctor | 0 | 14 |
| Nurse | 0 | 4 |
| Lab Tech | 0 | 2 |
| Radiology Tech | 0 | 2 |
| Pharmacist | 0 | 7 |
| Pharmacy Admin | 1 | 6 |
| Hospital Admin | 1 | 9 |
| District Admin | 2 | 5 |
| State Admin | 3 | 5 |
| Zonal Admin | 2 | 2 |
| Central Admin | 2 | 8 |

### 17.3 Built API modules

| Module | Path | Features |
|--------|------|----------|
| Auth | `apps/api/src/auth/` | JWT + demo auth, guards, role checking |
| Citizen | `apps/api/src/citizen/` | Profile view/edit, special categories, folder auto-creation |
| Documents | `apps/api/src/documents/` | Folder CRUD, document upload (MinIO), download (pre-signed URL), move |
| Storage | `apps/api/src/storage/` | S3-compatible service for MinIO and R2 |
| Registration | `apps/api/src/registration/` | Citizen and doctor registration (with mock connectors) |
| Connectors | `apps/api/src/connectors/` | Mock Aadhaar e-KYC, face check, ABHA, HPR, HFR, drug licence |
| Approval | `apps/api/src/approval/` | Approval inbox, approve/reject workflow |
| Admin-ops | `apps/api/src/admin-ops/` | Create admin, staff, pharmacist accounts |
| Audit | `apps/api/src/audit/` | Hash-chained audit log |
| Database | `apps/api/src/database/` | PostgreSQL connection pool |

### 17.4 All built API endpoints

| Method | Path | Module | Role(s) |
|--------|------|--------|---------|
| GET | `/v1/citizen/special-categories/types` | Citizen | Citizen |
| POST | `/v1/citizen/special-categories` | Citizen | Citizen |
| POST | `/v1/citizen/special-categories/:id/end` | Citizen | Citizen |
| GET | `/v1/citizen/folders` | Documents | Citizen |
| POST | `/v1/citizen/folders` | Documents | Citizen |
| GET | `/v1/citizen/folders/:id/documents` | Documents | Citizen |
| POST | `/v1/citizen/documents/upload` | Documents | Citizen |
| GET | `/v1/citizen/documents/:id/download` | Documents | Citizen |
| POST | `/v1/citizen/documents/:id/move` | Documents | Citizen |
| GET | `/api/v1/approvals/inbox` | Approval | District, State, Zonal, Central admins |
| POST | `/api/v1/approvals/:id/approve` | Approval | District, State, Zonal, Central admins |
| POST | `/api/v1/approvals/:id/reject` | Approval | District, State, Zonal, Central admins |
| POST | `/api/v1/admin-ops/create-admin` | Admin-ops | State, Zonal, Central admins |
| POST | `/api/v1/admin-ops/create-staff` | Admin-ops | Hospital Admin |
| POST | `/api/v1/admin-ops/create-pharmacist` | Admin-ops | Pharmacy Admin |

> **Note.** Profile view and edit endpoints exist in `apps/api/src/citizen/` but their exact paths are not listed in the source brief for this document. Read the controller file before relying on them. Path prefixes (`/v1/...` versus `/api/v1/...`) are as supplied and should be checked against the controllers.

### 17.5 Suggested build order (assumption, to confirm against `docs/13_DEMO_BUILD_PLAN.md`)

| Priority | Area | Reason |
|----------|------|--------|
| 1 | Finish citizen basics (emergency contact edit, allergies, medications, dates panel) | Citizen is the only built dashboard |
| 2 | Doctor session (rotating key, 30-minute session, file manager) | Core of the demo |
| 3 | Simulated AI modules and verdict flow | Central story of the product |
| 4 | Orders queue and staff upload (nurse, lab, radiology) | Fills the Image and Temporal modules with data |
| 5 | Prescriptions and pharmacist dispensing | Complete medicine loop |
| 6 | Admin dashboards, emergency review, logs | Governance story |
| 7 | Donation, ratings, appointments, stock finder | Wider platform features |

---

## 18. Code reference

### 18.1 Frontend pages (`apps/web/src/pages/`)

| File | Role | Status |
|------|------|--------|
| `CitizenHome.tsx` | Citizen | Built (Profile + Documents) |
| `DoctorHome.tsx` | Doctor | Placeholder |
| `NurseHome.tsx` | Nurse | Placeholder |
| `LabTechHome.tsx` | Lab Tech | Placeholder |
| `RadioTechHome.tsx` | Radiology Tech | Placeholder |
| `PharmacistHome.tsx` | Pharmacist | Placeholder |
| `PharmacyAdminHome.tsx` | Pharmacy Admin | CreatePharmacistForm |
| `HospitalAdminHome.tsx` | Hospital Admin | CreateStaffForm |
| `DistrictAdminHome.tsx` | District Admin | ApprovalInbox |
| `StateAdminHome.tsx` | State Admin | ApprovalInbox + CreateAdminForm |
| `ZonalAdminHome.tsx` | Zonal Admin | ApprovalInbox + CreateAdminForm |
| `CentralAdminHome.tsx` | Central Admin | ApprovalInbox + CreateAdminForm |

### 18.2 Shared components

| File | Purpose |
|------|---------|
| `RolePage.tsx` | Generic placeholder for unbuilt role pages |
| `ApprovalInbox.tsx` | Approval inbox with approve/reject actions |
| `CreateAccountForm.tsx` | `CreateAdminForm`, `CreateStaffForm`, `CreatePharmacistForm` |
| `DemoBanner.tsx` | "SYNTHETIC DEMO DATA" banner |
| `Layout.tsx` | App layout with header, role badge, logout |
| `RegisterKit.tsx` | Registration form components |

### 18.3 Related docs

| Doc | Content |
|-----|---------|
| `docs/04_DECISION_LOG.md` | Source of truth when docs disagree |
| `docs/06_ROLES_PROPOSAL.md` | Role summary |
| `docs/07_USER_APP_FLOW.md` | Citizen features (source) |
| `docs/08_DOCTOR_APP_FLOW.md` | Doctor features (source) |
| `docs/09_STAFF_AND_ADMIN_FLOWS.md` | Staff and admin features (source) |
| `docs/13_DEMO_BUILD_PLAN.md` | Build schedule |
| `docs/15_LOGIN_AND_AUTH_COMPLETE_DETAILS.md` | Auth details |

---

## 19. Open questions

These are carried over unchanged. Items marked "Verify" are legal or technical checks to complete before the feature is built.

| # | Question | Affects |
|---|----------|---------|
| 1 | Exact approval time limit (days) before escalation | District Admin inbox (11.2), State Admin overdue list (12.1) |
| 2 | Kerala pilot districts | Pilot rollout, District Admin accounts |
| 3 | Which pharmacy software to support first, and the sync method | Pharmacy stock (9.2) |
| 4 | Drug-interaction database source | Prescriptions (4.7) |
| 5 | National medicine catalogue source | Prescriptions, stock, stock finder, master list (14.7) |
| 6 | Verify: e-Sign and DSC rules for e-prescriptions (IT Act, Drugs and Cosmetics rules) | Prescriptions (4.7) |
| 7 | Verify: NMC rules on generic-name prescribing and doctor ratings | Prescriptions (4.7), Ratings (15.4) |
| 8 | Verify: Schedule H / H1 / X dispensing rules | Pharmacist (8.2), controlled-drug register (9.6) |
| 9 | Verify: NOTTO integration route | Organ donation (3.12, 15.3) |
| 10 | Verify: e-RaktKosh integration route | Blood donation (3.11, 15.2) |
| 11 | CDSCO classification of AI modules | Doctor AI sections (4.2) |
| 12 | Blood donation interval and eligibility criteria | Blood donation (3.11) |
| 13 | Storage capacity estimate for scans and VCF at national scale | Radiology and genomic uploads (7, 4.2) |
| 14 | DPDP right to erasure versus "never delete" accounts | Account and settings (3.14) |

### 19.1 Extra points raised while writing this document

These are not in the original open-questions list. They are suggestions for Athun to confirm.

| # | Point | Why it matters |
|---|-------|----------------|
| A | API path prefixes differ in the brief (`/v1/citizen/...` versus `/api/v1/...`). | Confirm whether this is a real difference in the controllers or a typing difference, and fix whichever doc is wrong. |
| B | "Deactivate staff" and "deactivate pharmacist" are described in the design but only creation is listed as built. | Confirm whether deactivation endpoints exist. |
| C | The Central Admin's origin (seeded versus created) is not stated in the source brief. | Confirm against doc 15. |
| D | The brief says the citizen can edit "preferred language" in three languages, while the alpha UI is English only. | Confirm that the setting is stored but has no visible effect until after the pilot. |

---

*End of document. Update the "Last updated" date and the status labels at the end of every session in which a feature is built.*

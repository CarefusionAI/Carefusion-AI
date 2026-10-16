# 03 — Integration Plan (Government Systems) — National Rollout

> Rewritten 2026-10-10 to match all decisions in 04_DECISION_LOG.md, 07, 08 and 09. Client: **MoHFW**. Pilot: **Kerala** (districts to choose later), English only.
> Status of every item: **TO VERIFY** against current official docs before implementation. Rules and APIs change.

## 1. Core national integrations (ABDM — National Health Authority)
| System | What we use it for | Our role |
|---|---|---|
| ABHA (health ID) | Created/linked in the background at citizen sign-up; printed health card QR | Create / verify / link ABHA |
| HPR | Auto-check doctor credentials before district approval | Verify professional |
| HFR | Verify hospital at hospital-admin registration | Verify facility |
| Consent Manager | Consent when records move to/from other ABDM apps | Request & honour consent artefacts |
| Health Information Exchange | Share/receive records with other hospitals' systems | **HIP** and **HIU** |
| Scan & Share / UHI | OPD queue, discovery | Later |

Inside CareFusion, doctors open records with the patient's key (or card + OTP / admission mode). ABDM consent is used whenever records leave or enter CareFusion.

**Data format:** FHIR R4 with NRCeS India profiles. **Coding:** SNOMED CT, LOINC, ICD-10/ICD-11 (map the paper's 247-symptom vocabulary).

### ABDM onboarding steps
1. Register on the ABDM sandbox → client ID/secret
2. Build & test milestones (ABHA → HIP linking & push → HIU consent & fetch)
3. NHA functional testing
4. Security audit certificate (CERT-In empanelled auditor)
5. Production access → go live

## 2. Other integrations
| System | Purpose | Phase | Status |
|---|---|---|---|
| **UIDAI e-KYC + face authentication** | Citizen identity at sign-up; live face check; lost-phone recovery; emergency-contact Aadhaar fallback (token only) | 1 | Decided — access route (authorised agency) to verify |
| **Jan Parichay SSO** | Login for district, state, zonal and central admins | 1 | Decided |
| **SMS gateway (DLT templates) + push + email** | OTPs, card OTPs, alerts, reminders | 1 | Decided (no WhatsApp) |
| **MeitY-empanelled cloud** (+ second India region) | Hosting, live backup with switch-over | 0 | Decided |
| **Drug licence check** | State drug control / CDSCO records; manual where no API | 1 | Decided — per-state API to verify |
| **e-Sign / DSC provider** | Doctors' legally valid prescription signatures; verifiable QR | 4 | Decided — provider to pick |
| **National medicine catalogue** | Generic-name medicine list for prescribing and stock | 4 | Decided — source to confirm |
| **Drug-interaction database** | Interaction warnings while prescribing | 4 | Decided — database to pick |
| **Pharmacy software sync** | Automatic stock updates from pharmacies' existing billing/stock software | 4 | Decided — first vendors to pick |
| **Indian maps provider** | Pharmacy distance, donor approximate area, IP-area fallback, doctor geofence | 4 | Decided — Mappls vs Bhuvan to pick |
| **e-RaktKosh** | Government blood-bank stock shown alongside donors | 4 | Decided — integration route to verify |
| **NOTTO registry** | Link organ pledges; notify on death | 4 | Decided — integration route to verify |
| **Death registration / certificates** | Trigger death flow | 4 | To verify (CRS or manual upload) |
| Lab systems / PACS | Reports and scans sent straight in | Later | Decided as later phase |
| DigiLocker | Patients pull/save reports | 6 | Later |
| Bhashini | Malayalam, Hindi and more | After pilot | Later |
| eSanjeevani | Video consultation | Later | Not in first version |
| IHIP / IDSP | Outbreak signals for dashboards and unusual-pattern alerts | 6 | Later |
| U-WIN | Vaccination records | 6 | Later |
| PM-JAY | Insurance | Out of scope | — |
| e-Health Kerala | Existing hospital records in the pilot state | 7 | Check during pilot planning |
| Other state HMIS | Existing hospital records | 8 | Per state |

## 3. Compliance & legal checklist
- [ ] **DPDP Act 2023 + Rules** — consent notices; location logging (citizens and doctors); logs kept forever; **never-delete accounts vs right to erasure**; children's data (verifiable parental consent); publishing ratings; AI-research opt-in
- [ ] **Aadhaar Act + UIDAI** — e-KYC and face authentication access; Aadhaar fallback for emergency contacts; tokenisation / Aadhaar Data Vault
- [ ] **ABDM data policies** — consent, retention, sharing
- [ ] **CERT-In directions** — 6-hour incident reporting, 180-day minimum log retention, time sync
- [x] **Hosting** — MeitY-empanelled cloud, data in India *(decided)*
- [ ] **CDSCO / Medical Devices Rules 2017** — are the AI modules and citizen guidance chat Software as a Medical Device? *(research before pilot)*
- [ ] **NMC** — doctor ratings/reviews; generic-name prescribing; misuse reporting route
- [ ] **IT Act** — e-Sign/DSC validity for prescriptions
- [ ] **Drugs and Cosmetics Act & Rules** — e-prescriptions; Schedule H/H1/X register and dispensing limits
- [ ] **THOTA Act + NOTTO/SOTTO rules** — organ pledges and data sharing
- [ ] **Blood-bank rules (NBTC)** — donation interval and donor eligibility; ban on paid donation
- [ ] **GIGW / WCAG 2.1 AA** — app and website
- [ ] **Security audit** (STQC / CERT-In empanelled) before go-live
- [ ] **Clinical validation** — prospective study on Indian patients; ethics approval (ICMR AI guidelines); ethics approval also needed for AI-research data use
- [ ] **Kerala pilot approvals** — state health department; hospital ethics committees

## 4. Phased roadmap (approved order; contents updated 2026-10-10)
| Phase | Scope | Outcome |
|---|---|---|
| 0 — Foundation | Repo, CI/CD, MeitY cloud + second-region backup, hash-chained log, FHIR store, React web + React Native shells, offline-sync framework | Running skeleton |
| 1 — Identity & admin chain | Aadhaar e-KYC + face check, ABHA linking, OTP/biometric login, assisted registration + health cards, HPR/HFR/drug-licence checks, Jan Parichay, MFA/hardware keys, admin create/approve chain with time limits, zones | Every role can register and log in |
| 2 — Records & access | Citizen profile, folders, dates panel, home vitals, rotating key + 30-min session + end button, card + OTP, admission mode, emergency approval + break-glass + two-level review, lost-phone recovery, notifications | Core record sharing works |
| 3 — ABDM HIP/HIU | Consent flow, record push/pull, FHIR bundles | Sandbox-certified |
| 4 — Pharmacy & services | Live stock + software sync, medicine catalogue, e-signed prescriptions with safety checks, dispensing + controlled-drug register, maps, ratings + moderation, appointments, complaints, referrals, bed availability, blood donation + e-RaktKosh, organ pledges + NOTTO, death flow | Pharmacy and citizen services live |
| 5 — Clinical AI | 4 modules + RAG + conflict resolution in doctor UI; AI results store; citizen guidance chat; voice notes; agree/disagree | AI-assisted consult |
| 6 — Dashboards & alerts | District/state/zonal/national dashboards, unusual-pattern alerts, health alerts (mute rules), IHIP/IDSP, DigiLocker | Officials onboard |
| 7 — Pilot: Kerala | A few districts (to choose); English only; prospective clinical validation; security audit; ABDM production | Go/no-go for scale |
| 8 — National rollout | State by state, zone by zone; Malayalam, Hindi and more via Bhashini | All 36 states/UTs live |

## Open questions
- Kerala pilot districts and hospitals
- Which ABDM milestones MoHFW wants first
- Providers to pick: maps, e-Sign/DSC, drug-interaction database, medicine catalogue source, first pharmacy software vendors
- UIDAI access route (which authorised agency)
- e-RaktKosh, NOTTO and death-registration integration routes
- Do Kerala pilot hospitals use e-Health Kerala, and must we integrate?

# 06 — Roles & Features (APPROVED; updated 2026-10-10)

> First approved 2026-10-09; updated 2026-10-10 to match later decisions in 04_DECISION_LOG.md. This file is the **role summary**. Screen-by-screen flows: **07** (citizen), **08** (doctor), **09** (staff, pharmacy, admins).

## Who creates and approves whom
| Account | Created by | Approved by |
|---|---|---|
| Central admin | Set up at launch (two-person approval) | — |
| Zonal admin (5) | Central admin (two-person approval) | — |
| State admin | Zonal admin | Central admin |
| District admin | State admin | Zonal admin |
| Hospital admin | Self-registers (HFR ID, photo ID, authorisation letter, hospital licence, employee ID) | District admin |
| Pharmacy admin | Self-registers (drug licence number) | District admin |
| Doctor | Self-registers | District admin → state admin (central: flagged cases only) |
| Nurse / lab / radiology staff | Hospital admin | — |
| Pharmacist | Pharmacy admin | — |
| Citizen | Self-registers (Aadhaar e-KYC + face check; or assisted by ASHA/hospital staff) | Automatic; flagged cases → district → state |

All admin and staff accounts use MFA; district/state/zonal/central admins also use Jan Parichay + hardware key. Every action goes to the user's permanent log. Approvals have time limits and escalate if overdue. Admin transfers hand open tasks to the new admin.

---

## Central admin (whole country)
- Assigns states to zones (only central can)
- Creates zonal admins; approves state admins
- Verifies every emergency access within 24 hours
- Final check on flagged doctor applications
- Views any log; grants state admins permission to view logs
- National dashboard with unusual-pattern alerts (de-identified)
- Master lists: special categories, medicine catalogue, hospital types, rating rules
- National health alerts; suspends any account (two-person approval for admins)

## Zonal admin (North / South / East / West / Central)
- Creates state admins; approves district admins
- Zone dashboard; escalation point

## State admin
- Creates district admins
- Confirms doctors approved by districts; second review of flagged new users; handles overdue district approvals
- State dashboard; state health alerts (normal or emergency)
- Adds state guidelines to the AI's regional knowledge store
- Views logs only with central admin's permission

## District admin
- Approves doctors (first step), hospital admins and pharmacy admins
- First review of emergency access (mark OK or misuse → suspension + medical council report)
- First review of flagged new users; location flags for doctors
- Moderates rating comments; handles complaints
- Suspends/deactivates accounts; handles doctor transfers
- District dashboard with unusual-pattern alerts

## Hospital admin (government and private)
- Hospital profile (departments, timings, location — used for doctors' geofence)
- Creates and manages nurse, lab and radiology staff
- Appointment slots; confirms appointment requests
- Admissions list (names + treating team only); bed availability (shown to citizens and ambulances)
- Views linked government hospital pharmacy stock (cannot manage)
- Replies to ratings (cannot delete); hospital dashboard

## Nurse / lab / radiology staff
- Orders queue; uploads vitals, lab reports, scans, VCF only for ordered patients (whole stay in admission mode)
- Every upload tagged with uploader, time and order ID; offline vitals with sync
- Later: lab/scan machines send results directly

## Pharmacy admin (government hospital pharmacy or private pharmacy)
- Pharmacist accounts
- Live stock (medicine, quantity, price, batch, expiry) — synced from existing pharmacy software or updated in app
- Near-expiry and low-stock alerts
- Controlled-drug register (Schedule H/H1/X)
- Hours, location; replies to ratings

## Pharmacist
- Receives prescriptions sent by patients or directly by a doctor of the same hospital, or scans the patient's prescription QR
- Checks the e-signature and validity; extra checks for controlled drugs
- Marks dispensed / substitute given / out of stock; stock updates automatically; every dispensing recorded against the pharmacist

## Doctor
- See 08: patient sessions with AI tools, file manager, e-signed prescriptions, referrals, donor and stock sections, voice notes, shift handover

## Citizen
- See 07: profile, dates panel, folders, home vitals, AI guidance chat, doctor follow-up chat, reviews and appointments, medicine stock finder, blood and organ donation

---

## Prescriptions
- Doctor writes from the national medicine catalogue with allergy and interaction warnings and stock shown; signs with a government-approved e-signature (verifiable QR)
- Patient always gets the signed copy and chooses any pharmacy (send from app or show QR)
- Doctor's own hospital pharmacy: doctor can send directly if the patient agrees

## Live pharmacy availability
- Citizens and doctors search a medicine → nearby pharmacies with stock (in / low / out), price, hours, distance
- Real-time updates; shortages flagged on dashboards

## Ratings
- Doctors, hospitals and pharmacies; any time; logged-in ABHA-verified users only; one rating per user per entity (updatable); district admin checks comments; rated parties reply but never delete
- ⚠ To verify: NMC rules on doctor ratings; DPDP rules on publishing reviews

## Extra features
- **Appointments:** free booking; any fee paid at the hospital
- **Notifications:** app push, SMS, email
- **Complaints:** handled by the district admin
- **Health alerts:** state/central; normal alerts can be muted, emergency alerts never
- **Bed availability**, **blood donation**, **organ pledges** (see 07/09)

## Open questions
- Exact approval time limit (days); first pharmacy software to support
- Compliance checks listed in 03

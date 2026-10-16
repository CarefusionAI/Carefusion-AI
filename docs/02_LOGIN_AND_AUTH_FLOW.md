# 02 — Login, Registration & Access Control (all steps)

> Rewritten 2026-10-10 to match 04_DECISION_LOG.md, 07, 08 and 09. Older versions (citizen login with ABHA + OTP; district-only doctor approval; Aadhaar-typed emergency access as the main method) — SUPERSEDED.
> Verify every ABDM / UIDAI / Jan Parichay / e-Sign API name and version against the latest official documentation before building.

## Principles
- National identity where possible: Aadhaar e-KYC + ABHA (citizens), HPR (doctors), HFR (hospitals), drug licence (pharmacies), Jan Parichay (all district/state/zonal/central admins)
- Aadhaar never stored in plaintext — verified via UIDAI, token only
- MFA for every staff, pharmacy and admin account; hardware security keys for district, state, zonal and central admins
- Every login, failure, action and permission change goes to the user's permanent activity log
- No one can edit or delete logs
- Same flows on mobile app and website

## Login pages
- **Main login page** with a **User / Doctor** switch
- **Separate login pages** for: nurse/lab/radiology staff, hospital admin, pharmacy admin, pharmacist, district/state/zonal/central admins

## Who creates and approves whom
| Account | Created by | Approved by |
|---|---|---|
| Central admin | Set up at launch (two-person approval) | — |
| Zonal admin (5) | Central admin (two-person approval) | — |
| State admin | Zonal admin | Central admin |
| District admin | State admin | Zonal admin |
| Hospital admin | Self-registers (HFR ID, photo ID, authorisation letter, hospital licence, employee ID) | District admin |
| Pharmacy admin | Self-registers (drug licence no.) | District admin |
| Doctor | Self-registers | District admin → state admin (central checks flagged cases only) |
| Nurse / lab / radiology staff | Hospital admin | — |
| Pharmacist | Pharmacy admin | — |
| Citizen | Self-registers (or assisted by ASHA/hospital staff) | Automatic if e-KYC + face check pass; flagged cases → district → state |

Approvals have a time limit; overdue items escalate to the next level (exact days to decide).

---

## A. Citizen
**Registration**
1. Open app/website → read and accept privacy notice (DPDP consent, incl. location logging; optional AI-research opt-in)
2. **Create new user** → name, phone, email, DOB, sex, address, password
3. **Aadhaar e-KYC** (token only) + **live face check** (UIDAI face authentication); PAN optional
4. **Under 18:** birth certificate + parent/guardian (registered user) with recorded consent; guardian manages the account; handover at 18
5. ABHA created or linked in the background
6. Fill health profile; add **at least one emergency contact** (registered user)
7. Approved **automatically**; flagged cases (face mismatch, duplicate, suspicious) → district admin → state admin

**Assisted registration (no smartphone):** ASHA worker or hospital staff registers the person (same e-KYC + face check) → **printed health card** with ABHA QR

**Login**
1. First login: phone/email → **OTP**
2. Then **password** or **fingerprint / face ID**
3. Access token ~15 min + device-bound refresh token

**Lost phone:** Aadhaar OTP + face check on the new phone, or assisted recovery at a hospital/ASHA → old device logged out; rotating key moves to the new phone

**Sharing records with a doctor**
1. "Share with doctor" → rotating key (changes every 10 s) as QR + number
2. Doctor scans/types → 30-minute session, one doctor; patient can **End session** any time
3. Patient notified; session shown in access history
- **Health card users:** doctor scans card → OTP to the patient's basic phone → patient reads out the code → 30-minute session
- **Admission mode:** patient or emergency contact grants the treating team access until discharge

## B. Emergency contact
1. Must be a registered citizen
2. Sets up a separate **emergency code**
3. In an emergency: gets an alert and **approves on their own phone** with the emergency code
4. Fallback only: doctor enters the contact's Aadhaar number + emergency code

## C. Doctor
**Two accounts:** a citizen account (own health record) and a doctor account; the User/Doctor switch picks which. The doctor account cannot open its own citizen record; family members' records are allowed but flagged.

**Registration**
1. Self-register → HPR ID + NMC/state council registration number
2. Degrees + specialisation (certificates), hospital + department
3. Employee proof: government — govt employee ID / posting order; private — hospital employee ID
4. HPR checked automatically → **district admin approves → state admin confirms**; flagged cases → central admin
5. Password + mandatory MFA; e-signature (e-Sign/DSC) set up for prescriptions
6. Status: PENDING → ACTIVE (or REJECTED with reason)

**Login:** username + password → MFA; 15-min idle timeout

**Opening a patient record (normal):** scan/type key → 30-minute session; location checked at opening and every 5 min (hospital geofence; outside → reason + flag to district admin)

**Opening a patient record (emergency):**
1. Basic emergency info visible without a key
2. Request detailed access → emergency contact approves on their phone (fallback: Aadhaar + code)
3. No contact reachable → break-glass with mandatory reason, time-limited
4. District admin review → central admin verification within 24 h; misuse → suspension + medical council report

## D. Nurse / lab / radiology staff
1. Hospital admin creates the account → activation link → password + MFA
2. Login → orders queue; can upload only for ordered patients (or the whole stay in admission mode)

## E. Hospital admin
1. Self-register with HFR ID + photo ID, authorisation letter, hospital licence, employee ID
2. District admin approves → password + MFA (hardware key recommended)

## F. Pharmacy admin & pharmacist
1. Pharmacy admin self-registers with drug licence number (govt hospital pharmacy or private); checked against state drug control / CDSCO records
2. District admin approves; government hospital pharmacy linked to its hospital
3. Pharmacy admin creates pharmacist accounts → activation → password + MFA

## G. District, state, zonal and central admins
1. Created by the level above; approved where shown
2. Log in with **Jan Parichay + hardware security key** (all four levels)
3. Approved network/VPN recommended for state, zonal and central
4. Scope locked to their area
5. Admin transfer: open tasks hand over to the new admin; accounts never shared

---

## Permissions (summary)
| Permission | Citizen | Doctor | Staff | Hosp. admin | Pharm. admin | Pharmacist | District | State | Zonal | Central |
|---|---|---|---|---|---|---|---|---|---|---|
| View own record | ✔ | | | | | | | | | |
| Open patient record (key/card/admission) | | ✔ | admission only | | | | | | | |
| Emergency access | | ✔ | | | | | | | | |
| Run AI tools | guidance chat | ✔ | | | | | | | | |
| See AI results | after doctor review | ✔ | | | | | | | | |
| Upload data | ✔ own (incl. home vitals) | ✔ | ✔ ordered pts | | | | | | | |
| Write / e-sign prescription | | ✔ | | | | | | | | |
| Dispense | | | | | | ✔ | | | | |
| Manage stock | | | | view (linked) | ✔ | auto | | | | |
| Bed availability | view | | | ✔ | | | | | | |
| Manage staff accounts | | | | ✔ staff | ✔ pharmacists | | | | | |
| Approve doctors | | | | | | | ✔ first | ✔ confirm | | flagged |
| Approve hospitals/pharmacies | | | | | | | ✔ | | | |
| Flagged new users | | | | | | | ✔ first | ✔ second | | |
| Review emergency access | | | | | | | ✔ first | | | ✔ 24 h |
| Moderate ratings / complaints | | | | | | | ✔ | | | |
| Health alerts | mute normal | | | | | | | ✔ state | | ✔ national |
| Dashboards | | | | hospital | | | district | state | zone | national |
| View activity logs | access history only | | | | | | | with central permission | | ✔ all |
| Assign zones | | | | | | | | | | ✔ |

## Session & security settings
- Access token 15 min; refresh 8 h (staff/admins) / 30 days (citizen, device-bound)
- Doctor patient session: 30 min from key scan, or until the patient ends it
- Admission mode: until discharge
- Rotating key: changes every 10 s; single use; one active doctor session per patient
- Lock after 5 failed attempts (time-based unlock + admin reset)
- Password: min 12 chars, breached-password check
- JWT signed (RS256/ES256), keys rotated; refresh tokens rotated and revocable
- "Log out everywhere"; 15-min idle timeout on staff/admin screens
- Rate limits/CAPTCHA on OTP, key-entry and emergency-access endpoints

## Open questions
- Exact approval time limit (days)
- To verify: UIDAI e-KYC and face authentication access; Aadhaar fallback for emergency contacts; PAN storage; DPDP children's data and location logging; e-Sign/DSC onboarding for doctors; Jan Parichay onboarding for this app

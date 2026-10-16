# 07 — Citizen (User) App Flow

> Written 2026-10-10 from the user's description, with choices made via option panels (see 04_DECISION_LOG.md, entries "User app flow", "User app flow — doubts cleared", "Claude's suggestions on gaps", "Remaining doubts round" and "Final doubts round"). Items marked *(Claude)* are Claude's additions; the user approved Claude adding what is required.
> 01, 02, 03 and 06 were updated on 2026-10-10 to match this file.

## 1. Login page
- One login page with a switch: **User** / **Doctor**
- A doctor has **two separate accounts**: a citizen account (own health record) and a doctor account (doctor tools). The switch picks which one to log in to.
  - The doctor account **cannot open the doctor's own citizen record**
  - Opening a **family member's** record is allowed but **flagged in the log**
- All other roles (staff, hospital admin, pharmacy, all admins) have their **own separate login pages**
- First login: phone/email → **OTP**
- After that the user chooses: **password**, or **fingerprint / face ID** on their device
- **Lost phone:** recover online with **Aadhaar OTP + face check** on the new phone, **or** through assisted help (hospital/ASHA). Old phone is logged out and the rotating key moves to the new phone.

## 2. New user registration
1. Tap **Create new user**
2. Fill basic details: name, phone, email, date of birth, sex, address, password
3. Identity:
   - **Aadhaar via e-KYC** (verified online with UIDAI; no Aadhaar copy stored — token only)
   - **Live face check** using **UIDAI Aadhaar face authentication** (real-time liveness, matched to Aadhaar photo)
   - **PAN** — optional
   - **Under 18:** birth certificate + **parent/guardian** (must be a registered user); **guardian manages the minor's account**
4. App **creates or links the user's ABHA** (national health ID) in the background
5. **Approval: automatic** if e-KYC and face check pass → account active at once
6. **Flagged cases only** (face mismatch, duplicate, suspicious data) go to the **district admin**, then **state admin** for manual review
- Panchayat validation and the 2-week manual approval for every user: **not used** (too heavy at national scale)
- *(Claude — required)* **Parental consent for minors:** guardian gives recorded consent for the child's data to be processed (DPDP Act requires verifiable parental consent for children)
- *(Claude — required)* **Turning 18:** the minor gets a prompt to take over their own account; guardian access ends after the handover
- **AI research consent:** at sign-up (and any time in settings) the user can **opt in** to let anonymous data improve the AI; off by default

**People without smartphones**
- **Assisted registration:** ASHA workers or hospital staff register them on their behalf (same e-KYC and face check)
- **Printed health card** with an ABHA QR code
- Doctor opens the record by **scanning the card + an OTP sent to the patient's basic phone** (patient reads out the code) → normal 30-minute session

## 3. Home / profile
- Shows the user's profile and health details
- **User can edit:** address, phone/email, allergies, medications, donor status, emergency contacts
- **Locked after verification:** name, date of birth, Aadhaar-linked identity (change only through admin request)
- **Special category tag** with status: e.g. "Cancer — treated / untreated / in progress"
- **Home vitals:** user can add readings from BP machine, glucometer, smartwatch etc.; shown as **self-reported**, separate from hospital-recorded vitals

**Dates panel**
- Upcoming appointments
- Past visits (doctor sessions, hospital visits)
- Medicine schedule and refill due dates
- Vaccination, check-up and lab test due dates
- *(Claude)* Next date the user is eligible to donate blood
- *(Claude)* Treatment schedule for special-category patients (e.g. chemotherapy cycles, dialysis days) — added by the doctor
- *(Claude)* Prescription validity / expiry dates
- Follow-up and refill dates set by the doctor appear here automatically

## 4. Reviews & appointments
- Separate sections for **hospital reviews** and **doctor reviews**
- **Filters:** department/specialisation, location (district/state), hospital, government/private, rating
- Each doctor/hospital page shows who they are, where they serve, ratings and comments
- **Request appointment** → hospital confirms it before it is booked
- **Booking is free; any fee is paid at the hospital** (no payments in the app)
- **Bed availability** of nearby hospitals visible (for emergencies)

## 5. Chat
- **AI health chat — guidance only:** never gives a diagnosis or list of diseases to the citizen; suggests seeing a doctor, flags emergency warning signs ("go to hospital now"); chat saved in the `AI Chat` folder for the doctor
- **Chat with doctors:** only with **doctors who have treated the user** (follow-up messages)
- **Chat with blood donors** (for blood requests)
- Video consultation: not in the first version

## 6. File management
- Create folders, upload files, images and text notes
- See AI chat summaries, medical images, lab tests, prescriptions, and **AI results after the doctor has reviewed them** (per-tool folders: AI Chat, Image Analysis, Genomic Analysis, Temporal Analysis)
- Example: a "Cancer" folder holding all related documents
- **Doctor during a key session:** can read, create folders, upload documents and notes — **never edit or delete**

## 7. Medicine stock finder
- Search a medicine → nearest pharmacies/hospitals that have it, with stock (in/low/out), price, hours, distance

## 8. Doctor access to records
- **End session button:** the patient can end a doctor's 30-minute session at any time
- **Admission mode:** when a patient is admitted (ward/ICU), the patient or emergency contact grants the **treating team** access **until discharge**; every view is logged
- **Emergency contact approval:** in an emergency the contact **gets an alert and approves on their own phone** with their emergency code. The doctor typing the contact's **Aadhaar + code** is kept only as a **fallback**
- **Referral:** the new doctor still needs the patient's key

## 9. Blood donation
- Toggle **"Ready to donate blood"** ON/OFF
- ON → user appears in the donor list with blood group
- OFF (e.g. sick) → removed from the list; anyone with an open request to them is notified
- **Auto-OFF for ~3 months after a recorded donation** (exact gap to verify with blood-bank rules)
- *(Claude — required)* Only users who meet basic donor eligibility (age and other blood-bank criteria — to verify) can turn the toggle ON
- **Request blood:** users, doctors and hospitals post a request (blood group, units, hospital, urgency)
- **Auto-alert:** donors with a matching blood group nearby get a notification; they choose whether to respond
- **Map:** shows donors' **approximate area only** (not exact address), based on their saved address
- Contact through **in-app call or chat** — phone number and address stay hidden
- **No payment:** selling blood is illegal — chat blocks payment talk; report button for misuse
- **e-RaktKosh link:** government blood-bank stock shown alongside individual donors

## 10. Organ donation
- User pledges to donate organs, choosing which organs
- Pledge form is **signed at a hospital with a verified doctor**, with verification and blood work
- Pledge is recorded in CareFusion and **linked to the official NOTTO registry**
- Organ donor list visible **only to authorised doctors/hospitals**, not the public
- Allocation follows NOTTO/SOTTO rules — CareFusion does not match or allocate organs itself

## 11. Account deletion and death
- **Account deletion: never deleted** (user's choice) — account can only be deactivated
  - ⚠ To verify: the DPDP Act gives users a right to erasure; refusing all deletion may break it
- **Death:** hospital/doctor records the death (or via death certificate) → account locked, family/emergency contacts notified, organ pledge sent to NOTTO, records kept for the legal period

## 12. Doctors (approval)
- Doctor credentials checked by **district → state**; **central admin checks only flagged cases**

## 13. App-wide settings
- **Notifications:** app push, SMS (works on basic phones) and email. WhatsApp not used.
- **Health alerts:** normal alerts can be muted; emergency alerts never
- **Languages:** **English only at first and in the Kerala pilot**; Hindi and Malayalam added after the pilot (Bhashini for more later)
- **Offline mode:** health-centre staff can view cached data and record visits without internet; syncs when the network returns

## Open questions
- Kerala pilot districts — to choose later (Claude suggests Pathanamthitta + Thiruvananthapuram)
- Verify: UIDAI face authentication and e-KYC access for this app; PAN storage rules; blood donation interval and donor eligibility criteria; NOTTO integration route; THOTA Act limits; DPDP rules on children's data; DPDP right to erasure vs "never delete"; e-RaktKosh integration route; CDSCO status of a citizen-facing AI chat

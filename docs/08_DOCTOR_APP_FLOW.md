# 08 — Doctor App Flow

> Written 2026-10-10 from the user's description, with choices made via option panels (see 04_DECISION_LOG.md, entries "Doctor app flow", "AI results storage" and "Final doubts round"). Registration and login for doctors are already decided (see 02 and 07). Items marked *(Claude)* are Claude's suggestions that the user accepted.
> Where this file differs from 01/02/06, **this file is newer**.

## 1. Doctor home (after login)
- **Profile** — name, specialisation, hospital, department, registration details
- **Work time** — duty hours / schedule
- **Appointments** — today's and upcoming
- **Past patients** — list of patients seen; shows **only the patient's name + what this doctor added** (full record needs a new key)
- **Enter patient key** — scan the patient's QR or type the number code (or health card QR + OTP for patients without smartphones)

## 2. Patient session (after the key is accepted)
Session lasts **30 minutes**, or ends earlier if the **patient taps "End session"**. Admission mode (ward/ICU) gives the treating team access until discharge (see 07).

Sections inside the session:
1. **AI chat** — the paper's symptom reasoning engine (decision support for the doctor)
2. **Medical image analysis** — ResNet-50 + Grad-CAM++ (vision module)
3. **Genomic analysis** — VCF validation + ClinVar matching
4. **Temporal analysis** — vitals-based deterioration risk (LSTM); uses hospital and self-reported vitals
5. **File manager** — read, create folders, **create new documents**, upload, highlight; **never edit or delete**

**AI results:** every result keeps the paper's VERIFIED / SUPPORTED_WITH_CAUTION / UNCERTAIN status and disagreement reporting. The doctor **marks agree / disagree with a short reason**; the final decision is always the doctor's. *(Claude)*

**New document:** auto-named `YYYY-MM-DD HH:MM — Dr <name> — <patient name>`; doctor types into a formatted template (e.g. consultation note, prescription).

**Voice notes to text** *(Claude)*: the doctor can dictate; Whisper (as in the paper) turns speech into text, which the doctor checks before saving.

**Follow-up dates** *(Claude)*: follow-up, refill and test dates the doctor sets appear automatically in the patient's Dates panel.

**Referral:** the doctor sends a referral note to another doctor/hospital; the receiving doctor opens the full record **only with the patient's key**, as usual.

## 3. AI results storage
- **Every AI run is saved** — nothing from the AI tools is lost
- **One top-level folder per tool** in the patient's records:
  - `AI Chat`
  - `Image Analysis`
  - `Genomic Analysis`
  - `Temporal Analysis`
- Each run is saved inside its tool folder, named by date-time and doctor
- **Saved for each run:**
  - Input (symptoms / image / VCF file / vitals used) and the AI output
  - Evidence sources and status (VERIFIED / SUPPORTED_WITH_CAUTION / UNCERTAIN)
  - AI model version and time of the run
  - Doctor's agree/disagree and reason
- **Security:** locked — **no one can edit or delete**; encrypted (AES-256); each result's fingerprint (hash) added to the tamper-proof activity log
- **Patient view:** the patient sees the full AI result **only after the doctor has reviewed it** (agree/disagree + doctor's note). Raw, unreviewed AI output stays hidden from the patient.
- Citizen's own AI health chat (guidance only) is saved in the same `AI Chat` folder, labelled "citizen chat"
- **Storage:** recent files (scans, VCF) on fast storage; older files (e.g. 2+ years) moved to cheaper archive storage, still retrievable

## 4. Prescriptions
- Written in a formatted template, choosing medicines from the **national medicine catalogue** (generic names) *(Claude)*
- **Safety checks** *(Claude)*: **allergy warning** (against the patient's allergies) and **drug interaction warning** (against other prescribed and current medicines)
- **Stock shown while prescribing** — doctor sees whether the hospital pharmacy has the medicine
- **Digitally signed** with a **government-approved e-signature** (e-Sign or DSC under the IT Act); prescription carries a **verifiable QR**
- **Delivery:**
  - Patient always gets the signed copy and can show it / send it to any pharmacy (as decided earlier)
  - **Same hospital:** if the patient agrees, the doctor **sends it directly** to the hospital pharmacy. Partly SUPERSEDES "prescription goes only to the patient".

## 5. Admission mode extras
- **Shift handover note** *(Claude)*: the outgoing doctor writes a short note for the next doctor on duty; saved in the patient's records

## 6. Activity logging, location and misuse
- **Every action** in a patient session is logged — every click, button and view
- **Location:** checked **when opening a patient record** and **every 5 minutes during the session**; doctor must be inside their **registered hospital area (geofence)**
- **Outside the area:** access allowed only with a **reason** (e.g. home visit, emergency); event **flagged to the district admin**
- Continuous all-day tracking: **not used** (privacy and battery)
- **Misuse** (break-glass or location rule abused, found on review): account **suspended**, case **reported to the medical council**, patient informed

## 7. Doctor transfer / leave *(Claude)*
- District admin updates the doctor's hospital; the geofence and past-patient list move with the doctor

## 8. Donor section
- **Blood donor list** — nearby donors; post and track blood requests
- **Patients needing blood** — track own recent patients who need blood
- **Organ donor pledges** — visible to authorised doctors only (NOTTO rules)
- **Register a pledge** — doctor records a patient's organ pledge signed at the hospital (with verification and blood work)

## 9. Stock section
- Doctor sees the medicines available in **their hospital's pharmacy** (stock in/low/out, expiry)
- Can also search other pharmacies nearby (live pharmacy view)

## Not in the first version
- **Video consultation** — later, possibly via eSanjeevani

## Related (user side)
- Citizens have a **medicine stock finder**: search a medicine → nearest pharmacy or hospital that has it (already part of the live pharmacy view in 01/06)

## Open questions
- Verify: e-Sign / DSC rules for e-prescriptions (IT Act, Telemedicine Practice Guidelines, Drugs and Cosmetics rules); NMC rules on generic-name prescribing; national medicine catalogue source; location tracking of doctors under DPDP (notice and consent)
- Which drug-interaction database to use?
- Storage capacity and cost estimate for scans/VCF at national scale

# 09 — Staff, Pharmacy and Admin App Flows (APPROVED 2026-10-10)

> Drafted by Claude on 2026-10-10 at the user's request; **approved by the user** with the changes chosen in option panels (see 04_DECISION_LOG.md, entry "Final doubts round + staff/admin flows"). Items marked *(Claude)* are Claude's suggestions the user accepted.
> All these roles log in on **their own separate login page** with password + MFA; district/state/zonal/central admins also use **Jan Parichay + hardware key**. Every action goes to the user's permanent log.

---

## A. Hospital admin
**Home**
- Hospital profile card (name, HFR ID, type govt/private, district)
- Today at a glance: appointments booked, patients admitted, staff on duty, free beds, low-stock alerts from the linked pharmacy

**Sections**
1. **Hospital profile** — departments, services, timings, contact, location (map pin used for the doctors' geofence)
2. **Staff** — create / deactivate nurse, lab and radiology accounts; see who is active
3. **Doctors list** — view doctors linked to this hospital (read only; doctors are approved by district → state)
4. **Appointments** — set slots per department/doctor; confirm or reject appointment requests
5. **Admissions** *(Claude)* — current admitted patients and their treating team (names only; no access to records)
6. **Bed availability** *(Claude)* — update free general/ICU beds; shown to citizens and ambulances in emergencies
7. **Pharmacy stock (view only)** — linked government hospital pharmacy
8. **Ratings** — read ratings and comments; post a public reply (cannot delete)
9. **Dashboard** — visits, admissions, referrals in/out, ratings over time

## B. Nurse / lab / radiology staff
**Home**
- **Orders queue** — active doctor orders for this staff member's department (e.g. "BP every 4 h", "chest X-ray", "CBC", "upload VCF")

**Flow**
1. Open an order → shows only the patient's name, order details and what to upload (no full record)
2. Upload: vitals form, lab report (PDF/values), scan (X-ray/DICOM), or VCF file
3. Upload is tagged with staff name, time and order ID; goes into the right patient folder (and the right AI tool folder, e.g. images → Image Analysis input)
4. Order marked done → doctor notified
- In **admission mode**, nurses on the treating team can record vitals for the whole stay
- **Offline:** can record vitals offline; syncs later
- **Later phase** *(Claude)*: lab and scan machines (lab information systems, PACS) send reports straight in

## C. Pharmacy admin
**Home**
- Pharmacy card (licence no., type govt-hospital/private, hours)
- Alerts: low stock, **items near expiry** *(Claude)*, out-of-stock items requested by patients

**Sections**
1. **Stock** — add / update medicines (from the national medicine catalogue), quantity, price, batch, expiry
   - **Pharmacy software link** *(Claude)*: pharmacies that already use billing/stock software can sync stock automatically; others update in the app
   - (Spreadsheet bulk upload: **not used**)
2. **Pharmacists** — create / deactivate pharmacist accounts
3. **Hours and location** — opening hours, holidays, map pin
4. **Dispensing report** — what was dispensed, by which pharmacist
5. **Controlled-drug register** *(Claude)* — record of restricted medicines dispensed (Schedule H/H1/X), as Indian drug rules require
6. **Ratings** — read and reply (cannot delete)

## D. Pharmacist
**Home**
- **Incoming prescriptions** — sent ahead by patients, or sent directly by a doctor of the same hospital

**Flow**
1. Receive from the queue, or **scan the patient's prescription QR** at the counter
2. System checks the **e-signature** and that the prescription is valid and not already fully dispensed
3. **Controlled drugs** *(Claude)*: extra checks (valid prescription, quantity limits) and entry in the controlled-drug register
4. Mark each medicine: **dispensed / substitute given / out of stock** (with a note to the doctor)
5. Stock reduces automatically; patient notified "medicines collected"
6. Every dispensing recorded against the pharmacist

## E. District admin
**Home — task inbox**
- Pending approvals: doctors, hospital admins, pharmacy admins
- **Emergency access reviews** (first review)
- **Flagged new users** (failed e-KYC/face check, duplicates)
- **Location flags** (doctors outside geofence)
- Rating comments waiting for moderation; complaints
- **Unusual-pattern alerts** *(Claude)* (e.g. a doctor with many break-glass uses, a spike in a disease)

**Sections**
1. **Approvals** — check documents, HPR/HFR/drug-licence results; approve / reject with reason
   - **Time limit** *(Claude)*: if not acted on within a set number of days, the item escalates to the state admin
2. **Emergency reviews** — see doctor, reason, time, what was viewed; mark OK / misuse (misuse → suspend + report to medical council)
3. **Moderation** — approve or remove rating comments (abuse, private health details)
4. **Complaints** — assign, respond, close
5. **Accounts** — suspend / deactivate in the district; doctor transfers
6. **Dashboard** — hospitals, pharmacies, shortages, ratings, emergency accesses (de-identified)

## F. State admin
**Home**
- Pending: district-approved doctors waiting for state confirmation; flagged new users escalated by districts; overdue district approvals
- State alerts, shortages and unusual-pattern alerts

**Sections**
1. **District admins** — create (zonal admin approves)
2. **Doctor confirmation** — confirm doctors approved by districts
3. **Flagged users** — second review
4. **Health alerts** — send state-wide alerts (normal or emergency; citizens can mute normal alerts, never emergency)
5. **AI guidelines** — add state health guidelines to the regional AI knowledge store
6. **Logs** — request permission from central to view logs; view once granted
7. **Dashboard** — disease trends, shortages, ratings, doctor counts by district

## G. Zonal admin
1. **State admins** — create (central approves)
2. **District admin approvals**
3. **Escalations** — problems states can't solve
4. **Zone dashboard** — compare states

## H. Central admin
1. **Zones** — assign states to zones
2. **Zonal admins** — create (two-person approval)
3. **State admin approvals**
4. **Emergency verification** — verify every emergency access within 24 h
5. **Flagged doctors** — final check on flagged doctor applications
6. **Logs** — view any log; grant state admins permission
7. **Master lists** — special categories, medicine catalogue, hospital types, rating rules
8. **National alerts**
9. **Suspend any account** (two-person approval for admins)
10. **National dashboard** with unusual-pattern alerts

## All admins
- **Admin handover** *(Claude)*: when an admin is transferred, their open tasks move to the new admin; accounts are never shared

---

## Open questions
- Exact approval time limit (days) before escalation
- Which pharmacy software to support first; sync method
- Verify: Drugs and Cosmetics rules for Schedule H/H1/X register and e-prescriptions

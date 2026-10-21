# IDS.md: shared identities of the design seed (base layer)

Source of truth for every seed file that builds on `00_base.sql`. If you need a person, facility, ward, bed or admin post, **use the id below, never invent a new one**. If something is missing, add it to `build_base.py` (the generator) and regenerate, or ask the owner of the base layer.

Files in this folder:

| File | What it is |
|------|------------|
| `00_base.sql` | Generated. Applied by the runner (`run_migrations.sh <conn> seed`). Idempotent. |
| `build_base.py` | Generator of `00_base.sql` and of the tables between the GENERATED markers below. `python3 carefusion-db/seed/design/build_base.py` |
| `IDS.md` | This file. Hand-written text + generated registry. |

All of this is synthetic demo data (rule 1). No raw Aadhaar anywhere (rule 2): see decision D6.

## 1. How the ids work

Every shared row has a **literal, deterministic UUID**:

```
cfd00000-KKKK-4000-8000-NNNNNNNNNNNN
         ^^^^                ^^^^^^^^^^^^
         kind (4 decimal     serial (12 decimal digits, zero padded)
         digits)
```

Example: Anjali Menon's person id is kind 0001, serial 1 = `cfd00000-0001-4000-8000-000000000001`.
It is a valid UUID (version nibble 4, variant 8) and cannot be mistaken for a real record. `00_base.sql` also installs two helpers:

```sql
util.seed_uuid(kind int, n bigint) -> uuid      -- util.seed_uuid(10, 1) = Demo General Hospital
util.seed_district('Pathanamthitta') -> uuid    -- district ids are random (migration 110); look them up by name
```

Other lookups that are stable without helpers: `geo.zone.id = 2` (South), `geo.state.id = 33` (Kerala, code KL).

### Kinds used by the base layer (0001-0099)

| Kind | Table | Serial rule |
|------|-------|-------------|
| 0001 | `identity.person` | person serial (table below). 1-12 personas, 101+ clinical, 201+ gov admins, 301+ pharmacy, 1001+ patients, 2001+ family, 3001+ donors |
| 0002 | `identity.app_user` | same serial as the person (primary account). A doctor's companion CITIZEN account = 5000 + person serial |
| 0003 | `identity.emergency_contact` | 1, 2 |
| 0004 | `identity.family_link` | 1, 2 |
| 0006 | `identity.consent_record` | person serial (privacy notice / minor guardian) |
| 0010 | `org.hospital` | hospital n |
| 0011 | `org.department` | hospital n * 100 + position in the hospital's department list |
| 0012 | `org.pharmacy` | pharmacy n |
| 0013 | `org.ward` | ward n |
| 0014 | `org.bed` | Ward 3: 3000 + bed number; Ward 5: 5000 + bed number |
| 0015 | `geo.block` | block n |
| 0016 | `admin.admin_post` | the admin's person serial |
| 0017 | `donation.blood_bank` | 1, 2 |
| 0018 | `donation.transplant_centre` | 1 |

### Kinds reserved for the other seed files (use your block, serial from 1)

| Kinds | Domain |
|-------|--------|
| 0100-0199 | citizen / outpatient: folders, documents, vitals, appointments, messages, reviews, complaints, AI chat |
| 0200-0299 | doctor and inpatient: sessions, admissions, prescriptions, nursing, MAR, handover |
| 0300-0399 | lab and imaging: orders, specimens, results, studies |
| 0400-0499 | pharmacy ops: stock, purchase orders, dispensing, recalls |
| 0500-0599 | hospital admin and pharmacy admin: approvals, roster, permissions |
| 0600-0699 | government consoles: surveillance, alerts, reports, AI governance |
| 0700-0799 | donation and organ: pledges, camps, requests |
| 0800-0899 | events feed, access sessions, break-glass, audit |

Rows of another seed file must use ids `cfd00000-<your kind>-4000-8000-<serial>` (any `util.seed_uuid(kind, n)`), so a re-run of that file is a no-op via `ON CONFLICT DO NOTHING`.

### Rules every seed file follows

1. Start with `BEGIN;` and end with `COMMIT;`. One file, one transaction. Do not use `ALTER TYPE ... ADD VALUE` (that belongs in a migration).
2. Idempotent: `INSERT ... ON CONFLICT DO NOTHING`. Never UPDATE or DELETE base rows.
3. Refer to base rows with the literal ids from this file (or `util.seed_uuid`). Refer to a person's account by `app_user` id when a `*_user_id` column asks for it, by person id when a `*_person_id` column asks for it.
4. File names `NN_topic.sql` (two digits). The runner applies `seed/demo_data.sql` first, then `seed/design/[0-9]*.sql` in name order, and records each file in `public.schema_migrations`.
5. Demo "today" is **Saturday 17 October 2026**; clock times are IST (+05:30). The prototype's "now" is about 14:30-15:00.
6. A row you insert for a base person must not change `identity.person` (the identity lock trigger blocks it).

## 2. Conventions of the base layer

- **Display names.** `identity.person.full_name` stores the name exactly as the designs show it, honorific included ("Dr. Arun Nair", "Dr. Meera Krishnan", "Sr. Mini Jacob", "R. Venkatesh"). Abbreviated patients ("Joy V.", "Thomas K.") are expanded to full names; the list is below.
- **Persona order.** apps/api `lookupDemoIdentity` picks the active account of a role with the lowest `created_at`. Personas are created at `2026-01-01 00:00:NN` (NN = persona number), other base rows at `2026-01-02`, doctors' companion citizen accounts at `2026-01-03`, the generated people of `demo_data.sql` at `2026-10-16`. So the 12 personas always win without any change to the API. Nurse, lab and radiology are resolved by `staff_profile.staff_role`; Lekha, Rahul and Fathima are the first of their roles. **If a DB already has other accounts created before 2026-01-01 (for example from real API registrations in an old dev DB), those win instead; use a fresh DB for demos.**
- **Keycloak sub.** `demo-kc-<account_type>-<slug>` (for example `demo-kc-doctor-arun-nair`). The Keycloak realm demo users have no fixed ids, so the demo auth mode maps by role, not by sub.
- **Doctors are citizens first.** Every doctor person also has a CITIZEN `app_user` (id 5000 + serial) and a `citizen_profile`.
- **Minors** (Diya Menon, Rahul Sasi) have a person and a citizen profile with a guardian and guardian consent, but no login.
- **Tokens, never digits.** `aadhaar_token = tok_DEMO_<12 hex>` (a hash of the slug). `abha_number = DEMO-0000-NNNN`, `abha_address = firstname.lastname@demo`. Phone numbers and emails are not stored (`phone_enc` / `email_enc` stay NULL). Where a screen needs a phone string, use the display constants in decision D6.
- **Hospital ids.** HFR `DEMO-HFR-KL-NNNN`, licence `DEMO-HCE-KL-NNNN`. Pharmacy licence `DEMO-DL-KL-NNNN`. Doctor `DEMO-HPR-71-NNNN`, council `Demo Medical Council, Kerala`, reg `DEMO-MC-NNNNN`. Pharmacist registration `DSPC DEMO-NNNNN`.
- **What the base does NOT create** (left to the later files): admissions (the bed `status` is already set to occupied/free), `org.bed_availability` rows, folders and documents, vitals, appointments, special-category rows, emergency codes, devices, medicines and stock, suppliers, lab/imaging catalogues, events, access sessions, audit rows.

## 3. Canonical decisions

These override the conflicts in `docs/notes/inventory_*.md`. Each decision names what it replaces.

| # | Topic | Decision | Replaces / reason |
|---|-------|----------|-------------------|
| D1 | Anjali Menon | **35 years, DOB 14 Feb 1991, outpatient.** Address "House 14, Temple Road, **Kozhencherry**, Pathanamthitta 689641"; nearest PHC = PHC Kozhencherry (2.1 km). ABHA `DEMO-0000-1234`, handle `anjali.menon@demo`, blood group B+ (lab confirmed), language en (Malayalam for AI explanations). Booking Wed 21 Oct 2026 10:30 with Dr. Arun Nair. | Age 38 / 34 / DOB 12 Jun 1988; Adoor address (RegisterCitizen); `anjali.m@abdm`; "Tue 21 Oct" (21 Oct 2026 is a Wednesday). |
| D2 | The nurse app's Bed 3 / IP-DEMO-30318 inpatient story | **Not Anjali.** It belongs to **Anitha Mathew** (34 F, person 1103, B+, Ward 3 Bed 3, penicillin allergy, LRTI, likely discharge). The board name "Anjali M." becomes "Anitha M.". Anjali has no admission. | Inventory conflict 1 (OP vs inpatient). |
| D3 | The two Thomases | **Thomas Kurian** (68 M, Ward 3 Bed 7, COPD + pneumonia, NEWS 7, SpO2 91%, person 1001) and **Thomas Varghese** (61 M, OP token 08, K+ 6.1, person 1002) are separate people. The pharmacist's clopidogrel + omeprazole prescription (DEMO-RX-88219, "M 61y") belongs to Thomas Varghese. The lab ABG sits at Bed 7 (not Bed 11); Bed 11 is Gopi Mohan. The break-glass event s5 ("unconscious on arrival", Dr. Sreeja Paul) is Thomas Kurian's arrival on 16 Oct 03:12 (feed time 03:12). The private cardiologist formerly "Dr. Thomas Kurian" is **Dr. Cherian Thomas**; the neighbour/witness formerly "Thomas Kurian" is **Johnson Kuruvilla**. | Inventory conflicts 2, 4, 9; avoids three Thomas Kurians. |
| D4 | Dr. Arun Nair | HPR **`DEMO-HPR-71-0042`**, council reg **41822** (stored `DEMO-MC-41822`, council "Demo Medical Council, Kerala"), citizen ABHA `DEMO-0000-5678`, username `dr.arun.nair`, duty 09:00-17:00, 14 years in practice. `DEMO-HPR-71-4402`, `DEMO-KL-55102` and reg 58213 are dropped. | Doctor inventory conflict 3. |
| D5 | Order ids | Single scheme **`ORD-DEMO-NNNN`** for lab, imaging, nursing and medication orders (`records.clinical_order.order_ref`). LAB-/RAD-/LO-/O-/DEMO-IMG-/DEMO-L-/DEMO-R- numbers are display leftovers and are not stored. | Three parallel schemes. |
| D6 | Aadhaar, ABHA, phones | **No Aadhaar digits at all**, not even last four: `XXXX XXXX 4821` and `XXXX XXXX 1234` are removed; UIs say "Aadhaar verified" and show nothing else. Aadhaar is an opaque token (`tok_DEMO_...`). ABHA `DEMO-0000-NNNN`, handles `name@demo`. Phone display constants (display text only, never stored): Anjali `+91 98765 43210` (masked `+91 98XXX XX210`), Ravi `+91 94470 55120`, Sarala `+91 98XXX X9031`. | Identifier audit in the citizen inventory. |
| D7 | Anjali's mother | **Sarala Nair** only (62 F, person 2003, emergency contact 2 and organ witness 1). "Sarojini Menon" is dropped. | Citizen conflict 10. |
| D8 | Event type | The doctor app's `radiology-order` is **`imaging-order`** everywhere (result: `imaging-result`). | Doctor inventory conflict 9; migration 120. |
| D9 | Dr. Sreeja Paul | **Ophthalmology**, posted at **Demo Taluk Hospital, Adoor** (not in the Demo General Hospital staff list, as the hospital-admin design says); she covers evening ward/OP duty at Demo General Hospital as a visitor (handover 17:00, orders for Beds 11/12, break-glass s5). The dermatology prescriptions of 2 Oct 2026 and 4 Mar 2026 are written by **Dr. Hema Kurup** (Dermatology, Adoor). | Citizen conflict 7. |
| D10 | Dr. Meera Krishnan | **Hospital admin / Medical Superintendent only**: no `doctor_profile`, no prescriptions. The 12 Jul 2026 azithromycin prescription is Dr. Arun Nair's. Her appearance as the District "second approver (DMO office)" is a display name in the admin seed, not a second person. | Citizen conflict 8. |
| D11 | Dr. Vinod K. | The emergency doctor of the 21 Sep 02:48 break-glass ("road accident (Ravi)") is **Dr. Vivek Menon** (Casualty). Radiology's CT technologist **Vinod Kurian** is a different person. | One casualty doctor. |
| D12 | Facility naming | One name per facility (see section 4). "Demo Taluk Hospital, Adoor" = "Taluk Hospital Adoor"; Demo Diagnostics / "Hospital lab" / "Demo General Hospital lab" = **Demo General Hospital Central Lab** (department Laboratory); "District PHL" is a text label only (no facility row). | Citizen conflict 24. |
| D13 | Hospital ids | Demo General Hospital: HFR **`DEMO-HFR-KL-0193`**, Government, 240 beds on the HFR record. `IN3210DEMO0042` / `DEMO-IN3210-7781` are dropped. Pharmacy licence **`DEMO-DL-KL-2041`** (valid to 31 Mar 2029); the admin label `DEMO-DL-2041` is dropped. | Cross-screen ids. |
| D14 | Real-world names | Renamed to fictional ones: see section 5. | Rule 4 and the identifier audit. |
| D15 | Ward 3 | 24 beds, 22 occupied, beds 6 and 18 free, 6 beds are Lekha's (3, 4, 7, 8, 11, 12). Charge nurse is **Sr. Mini Jacob** (was "Sr. Mini Joseph", to avoid a clash with the Ernakulam district admin Dr. Mini Joseph). Ward 5 (12 free beds) exists because the lab design calls a critical value for "Ward 5". | Nurse inventory. |
| D16 | Gov hierarchy | India (central) > South zone > Kerala > Pathanamthitta > 12 blocks (PLK Pulikeezhu, TVL Thiruvalla, MLY Mallappally, VNK Vennikulam, KZC Kozhencherry, ELT Elanthoor, RNI Ranni, PRN Perunad, PDM Pandalam, PTA Pathanamthitta, KNI Konni, ADR Adoor). Block admins (Dr. Lissy John, Dr. Shibu George, Dr. Anil Mathew, Dr. Priya Das) have **no accounts** (there is no block-level post in `admin.admin_post`); the admin seed shows them as directory entries. District/state/zonal admins named on the state, zonal and central consoles have accounts (section 4). Dr. L. Sangma ("North-east, acting") is mapped to the North zone because there is no North-east zone. | Admin inventory section 7. |
| D17 | Beds counts | Base creates only the rows of Ward 3 and Ward 5. `org.bed_availability` (bed counts by type) is left to the hospital-admin seed: the design shows 240 beds on the HFR record but its department table sums to 200 beds / 168 occupied. | Admin inventory section 8. |
| D18 | Gov-console people | The persona holders are the same people at every level: Ajay Kumar = Pathanamthitta district admin = "State approvals: Ajay Kumar approved 1 Sep"; Latha Nair = Kerala state admin; R. Venkatesh = South zonal admin; S. Banerjee = central admin. | Admin inventory section 7. |

### Suggested canonical values for the later seed files (assumptions, not enforced by the base)

- Booking: **Wed 21 Oct 2026 10:30**, Dr. Arun Nair, token 16. Last blood donation 4 Aug 2026 (eligible again 2 Nov).
- Lipid profile LDL **142** mg/dL (17 Oct 11:05, uploaded by Rahul Varghese); HbA1c **7.4%** on 4 Oct 2026 (earlier 7.9%).
- Anjali's prescription: **17 Oct 2026**, e-signed by Dr. Arun Nair, three items (Metformin 500 mg x60, Atorvastatin 10 mg x30, Vitamin D3 60k capsule x8); one prescription id (the pharmacist design's `RX-DEMO-88213`; drop `RX-DEMO-55120`).
- Weight 61 kg (Profile) wins over 58 and 64.2.
- A break-glass event never leaks another patient's name into a citizen's feed (migration 120 already forbids patient events for gov admins; the s5 title for citizens should say "Emergency access used").

## 4. Registry (generated)

Do not edit between the markers: edit `build_base.py` and regenerate.

<!-- BEGIN GENERATED -->

### Personas (the 12 demo sign-in roles)

Sign-in order in `lookupDemoIdentity`: earliest `created_at` among active accounts of the role. Personas are 2026-01-01 00:00:NN.

| # | Persona | Role on the sign-in page | account_type | person id | app_user id |
|---|---------|--------------------------|--------------|-----------|-------------|
| 1 | Anjali Menon | Citizen | `citizen` | `cfd00000-0001-4000-8000-000000000001` | `cfd00000-0002-4000-8000-000000000001` |
| 2 | Dr. Arun Nair | Doctor, General medicine | `doctor` | `cfd00000-0001-4000-8000-000000000002` | `cfd00000-0002-4000-8000-000000000002` |
| 3 | Lekha Pillai | Nurse, Ward 3 | `staff` | `cfd00000-0001-4000-8000-000000000003` | `cfd00000-0002-4000-8000-000000000003` |
| 4 | Rahul Varghese | Lab technician | `staff` | `cfd00000-0001-4000-8000-000000000004` | `cfd00000-0002-4000-8000-000000000004` |
| 5 | Fathima Beevi | Radiology technician | `staff` | `cfd00000-0001-4000-8000-000000000005` | `cfd00000-0002-4000-8000-000000000005` |
| 6 | Joseph Mathew | Pharmacist, Counter 2 | `pharmacist` | `cfd00000-0001-4000-8000-000000000006` | `cfd00000-0002-4000-8000-000000000006` |
| 7 | Suma Thomas | Pharmacy admin | `pharmacy_admin` | `cfd00000-0001-4000-8000-000000000007` | `cfd00000-0002-4000-8000-000000000007` |
| 8 | Dr. Meera Krishnan | Hospital admin (Medical Superintendent) | `hospital_admin` | `cfd00000-0001-4000-8000-000000000008` | `cfd00000-0002-4000-8000-000000000008` |
| 9 | Ajay Kumar | District admin, Pathanamthitta | `district_admin` | `cfd00000-0001-4000-8000-000000000009` | `cfd00000-0002-4000-8000-000000000009` |
| 10 | Latha Nair | State admin, Kerala | `state_admin` | `cfd00000-0001-4000-8000-000000000010` | `cfd00000-0002-4000-8000-000000000010` |
| 11 | R. Venkatesh | Zonal admin, South | `zonal_admin` | `cfd00000-0001-4000-8000-000000000011` | `cfd00000-0002-4000-8000-000000000011` |
| 12 | S. Banerjee | Central admin, National | `central_admin` | `cfd00000-0001-4000-8000-000000000012` | `cfd00000-0002-4000-8000-000000000012` |

### Everyone else (person serial, display name, what they are)

`app_user` id = kind `0002` + the same serial. Doctors also have a companion CITIZEN account: kind `0002` + (5000 + serial).

| Serial | Display name | DOB | Sex | Accounts | Note |
|--------|--------------|-----|-----|----------|------|
| 101 | Dr. Sreeja Paul | 1984-03-03 | F | doctor, citizen | Ophthalmologist at Adoor Taluk Hospital; visiting evening cover at Demo General Hospital |
| 102 | Dr. Vivek Menon | 1981-07-19 | M | doctor, citizen | Casualty head; the emergency doctor of the 21 Sep break-glass (was 'Dr. Vinod K.') |
| 103 | Dr. Sameer Ali | 1978-10-02 | M | doctor, citizen | ICU head |
| 104 | Dr. Rekha Soman | 1983-02-26 | F | doctor, citizen | Paediatrics head (was 'Dr. Rekha S.') |
| 105 | Dr. Ann Mary Joseph | 1986-06-14 | F | doctor, citizen | Maternity head (was 'Dr. Ann Mary') |
| 106 | Dr. Thomas Koshy | 1974-09-09 | M | doctor, citizen | Orthopaedics head (was 'Dr. Thomas K.') |
| 107 | Dr. Hari Prasad | 1972-12-21 | M | doctor, citizen | Surgery head |
| 108 | Dr. Leela George | 1979-01-11 | F | doctor, citizen | USG orders |
| 109 | Dr. Deepa Mohan | 1982-08-30 | F | doctor, citizen | Pathologist, e-signs lab reports |
| 110 | Dr. Lakshmi Varma | 1976-04-05 | F | doctor, citizen | District Hospital Kozhencherry |
| 111 | Dr. Cherian Thomas | 1970-11-23 | M | doctor, citizen | Private cardiologist (was 'Dr. Thomas Kurian') |
| 112 | Dr. Anitha George | 1988-05-17 | F | doctor, citizen | PHC Konni |
| 113 | Dr. Rajesh Menon | 1977-03-28 | M | doctor, citizen | Demo Private Hospital, Thiruvalla |
| 114 | Dr. Hema Kurup | 1985-10-10 | F | doctor, citizen | Dermatology prescriber at Adoor (replaces Dr. Sreeja Paul on the 2 Oct / 4 Mar prescriptions) |
| 121 | Asha Mohan | 1995-02-10 | F | staff | ICU nurse |
| 122 | Sr. Mini Jacob | 1980-06-15 | F | staff | Ward 3 charge nurse (was 'Sr. Mini Joseph') |
| 123 | Sr. Beena Thomas | 1987-09-03 | F | staff | evening shift, takes Ward 3 handover |
| 124 | Br. Rejo Mathew | 1991-01-20 | M | staff | float nurse |
| 125 | Anoop Krishnan | 1992-12-01 | M | staff | lab colleague (was 'Anoop K.'), takes lab handover 14:00 |
| 126 | Vinod Kurian | 1989-04-12 | M | staff | CT technologist 08:00-20:00 |
| 301 | Divya Raj | 1988-07-14 | F | pharmacist | pharmacist |
| 302 | Shaji Kurian | 1981-03-09 | M | pharmacist | store in-charge |
| 303 | Neethu Babu | 1994-11-27 | F | pharmacist | night shift |
| 304 | Faisal Rahman | 1993-05-06 | M | pharmacist | night shift |
| 305 | Bindu Varghese | 1986-02-19 | F | pharmacist | deactivated account |
| 306 | Ancy Varghese | 1984-09-23 | F | pharmacy_admin | admin of Care Plus Demo Pharmacy; licence expires in 20 days |
| 201 | Dr. Sajeev K | 1976-01-08 | M | district_admin | state console unit admin |
| 202 | Dr. Mini Joseph | 1977-08-16 | F | district_admin | state console unit admin |
| 203 | Dr. Fasal Rahman | 1974-05-30 | M | district_admin | state console unit admin |
| 204 | Dr. Shalini Rao | 1971-10-14 | F | state_admin | Karnataka (zonal console) |
| 205 | K. Srinivas | 1969-03-21 | M | state_admin | Andhra Pradesh (zonal console) |
| 206 | Dr. Farhan Ali | 1973-12-09 | M | state_admin | Telangana (zonal console) |
| 207 | M. Selvi | 1975-06-02 | F | state_admin | Puducherry UT admin (zonal console) |
| 208 | Dr. Nitin Prasad | 1972-09-17 | M | state_admin | Bihar (central console) |
| 209 | A. K. Mishra | 1967-11-25 | M | state_admin | Uttar Pradesh (central console) |
| 210 | Dr. K. Bose | 1966-04-13 | M | zonal_admin | East zone (central console) |
| 211 | N. Sharma | 1970-02-28 | F | zonal_admin | Central zone (central console) |
| 212 | Dr. L. Sangma | 1971-08-05 | M | zonal_admin | acting; the design says 'North-east', mapped to the North zone because there is no North-east zone |
| 1001 | Thomas Kurian | 1958-03-15 | M | citizen | inpatient Ward 3 Bed 7; COPD, pneumonia; also break-glass patient of 03:12 |
| 1002 | Thomas Varghese | 1965-04-22 | M | citizen | OP token 08; critical K+ 6.1 |
| 1003 | Joseph Kurian | 1960-05-02 | M | citizen | HbA1c review, Glimepiride |
| 1004 | Mini Thomas | 1979-06-09 | F | citizen | clopidogrel review, CYP2C19 *1/*2 |
| 1005 | Lakshmi Amma | 1954-07-16 | F | citizen | fever day 3, dengue NS1; via daughter Sindhu |
| 1006 | Ramesh Pillai | 1971-08-23 | M | citizen | hypertension |
| 1007 | Fathima Nazar | 1997-09-03 | F | citizen | antenatal 24 weeks (was 'Fathima N.') |
| 1008 | Biju George | 1982-01-10 | M | citizen | back pain; blood donor B+ (9 donations) |
| 1009 | Suresh Pillai | 1968-02-17 | M | citizen | cardiology referral to Medical College Kottayam (was 'Suresh P.') |
| 1010 | Babu Jacob | 1968-03-24 | M | citizen | kidney follow-up, nephrology referral |
| 1011 | Sindhu Raj | 1992-04-04 | F | citizen | thyroid teleconsult; daughter of Lakshmi Amma (was 'Sindhu R.') |
| 1012 | Abdul Rasheed | 1974-05-11 | M | citizen | inpatient Ward 3 Bed 4; CBC + CRP |
| 1013 | Sreedevi Amma | 1952-06-18 | F | citizen | inpatient Ward 3 Bed 12; NEWS 5 |
| 1014 | Mary George | 1967-07-25 | F | citizen | inpatient Ward 3 Bed 8; NBM for endoscopy |
| 1015 | Gopi Mohan | 1965-08-05 | M | citizen | inpatient Ward 3 Bed 11; portable chest X-ray (was 'Gopi M.') |
| 1016 | Divya Ramesh | 1999-09-12 | F | citizen | pregnant 20 weeks; obstetric USG |
| 1017 | Akhil Suresh | 2007-01-19 | M | citizen | wrist X-ray |
| 1018 | Rahul Sasi | 2015-02-26 | M | none (minor, no login) | MINOR; guardian Sasi Kumar; Schedule X medicine |
| 1019 | Mariamma Joseph | 1954-03-06 | F | citizen | CKD3; CT head STAT (was 'Mariamma J.') |
| 1020 | Bindu Vijayan | 1988-04-13 | F | citizen | thyroid USG (was 'Bindu V.') |
| 1021 | Nisha Rajan | 1997-05-20 | F | citizen | TSH / T4 (was 'Nisha R.') |
| 1022 | Joseph Philip | 1981-06-27 | M | citizen | lab LO-style order (was 'Joseph P.') |
| 1023 | Thankamma Pillai | 1956-07-07 | F | citizen | ICU patient of a break-glass (Dr. Sameer Ali) (was 'Thankamma P.') |
| 1101 | Ramesh Kaimal | 1963-04-13 | M | citizen | Ward 3 Bed 1 (was 'Ramesh K.') |
| 1102 | Lalitha Panicker | 1959-05-20 | F | citizen | Ward 3 Bed 2 (was 'Lalitha P.') |
| 1103 | Anitha Mathew | 1992-06-27 | F | citizen | Ward 3 Bed 3; LRTI, penicillin allergy, likely discharge (was 'Anjali M.' / IP-DEMO-30318) |
| 1105 | Joy Varghese | 1968-08-14 | M | citizen | Ward 3 Bed 5 (was 'Joy V.') |
| 1109 | Saji Nair | 1977-03-15 | M | citizen | Ward 3 Bed 9; likely discharge (was 'Saji N.') |
| 1110 | Usha Devi | 1970-04-22 | F | citizen | Ward 3 Bed 10 (was 'Usha D.') |
| 1113 | Ali Hassan | 1966-07-16 | M | citizen | Ward 3 Bed 13 (was 'Ali H.') |
| 1114 | Bindu Sasidharan | 1975-08-23 | F | citizen | Ward 3 Bed 14 (was 'Bindu S.') |
| 1115 | Mohan Lal | 1960-09-03 | M | citizen | Ward 3 Bed 15 (was 'Mohan L.') |
| 1116 | Rosamma Thomas | 1955-01-10 | F | citizen | Ward 3 Bed 16 (was 'Rosamma T.') |
| 1117 | Shibu Philip | 1983-02-17 | M | citizen | Ward 3 Bed 17 (was 'Shibu P.') |
| 1119 | Kunjumon Chacko | 1957-04-04 | M | citizen | Ward 3 Bed 19 (was 'Kunjumon') |
| 1120 | Fousiya Abdulla | 1978-05-11 | F | citizen | Ward 3 Bed 20 (was 'Fousiya'); also the 'Fousiya A.' reviewer |
| 1121 | Vinod Raj | 1972-06-18 | M | citizen | Ward 3 Bed 21 (was 'Vinod R.') |
| 1122 | Ammini Kurup | 1949-07-25 | F | citizen | Ward 3 Bed 22 (was 'Ammini') |
| 1123 | Rajan Chacko | 1964-08-05 | M | citizen | Ward 3 Bed 23 (was 'Rajan C.') |
| 1124 | Sathi Kumari | 1969-09-12 | F | citizen | Ward 3 Bed 24 (was 'Sathi K.') |
| 2001 | Ravi Menon | 1986-04-22 | M | citizen | Anjali's husband, emergency contact 1, trusted family |
| 2002 | Sasi Kumar | 1984-05-02 | M | citizen | guardian of Rahul Sasi (was 'Sasi K.') |
| 2003 | Sarala Nair | 1964-06-09 | F | citizen | Anjali's mother (the ONLY mother name), emergency contact 2, organ witness 1 |
| 2004 | Diya Menon | 2017-07-16 | F | none (minor, no login) | MINOR; Anjali's daughter, Anjali is guardian |
| 2005 | Johnson Kuruvilla | 1968-08-23 | M | citizen | neighbour, organ witness 2 (was 'Thomas Kurian') |
| 3001 | Vishnu Prasad | 1995-05-02 | M | citizen | blood donor |
| 3002 | Reshma Kurup | 1999-06-09 | F | citizen | blood donor (was 'Reshma K.') |
| 3003 | Ananya Raj | 2002-07-16 | F | citizen | blood donor (was 'Ananya R.') |

### Hospitals (`org.hospital`, kind `0010`) and their departments (kind `0011`, serial = hospital*100 + position)

| n | Hospital id | Name | HFR id | Type | District | Departments (position) |
|---|-------------|------|--------|------|----------|------------------------|
| 1 | `cfd00000-0010-4000-8000-000000000001` | Demo General Hospital, Pathanamthitta | `DEMO-HFR-KL-0193` | GH govt | Pathanamthitta | 1=General medicine, 2=Casualty, 3=ICU, 4=Paediatrics, 5=Maternity, 6=Orthopaedics, 7=Surgery, 8=Laboratory, 9=Radiology |
| 2 | `cfd00000-0010-4000-8000-000000000002` | Demo Taluk Hospital, Adoor | `DEMO-HFR-KL-0201` | THQ govt | Pathanamthitta | 1=General medicine, 2=Casualty, 3=Ophthalmology, 4=Dermatology |
| 3 | `cfd00000-0010-4000-8000-000000000003` | Demo District Hospital, Kozhencherry | `DEMO-HFR-KL-0202` | DH govt | Pathanamthitta | 1=General medicine, 2=Casualty, 3=Paediatrics, 4=Maternity, 5=Diabetology |
| 4 | `cfd00000-0010-4000-8000-000000000004` | Demo Taluk Hospital, Kozhencherry | `DEMO-HFR-KL-0203` | THQ govt | Pathanamthitta | 1=General medicine, 2=Casualty |
| 5 | `cfd00000-0010-4000-8000-000000000005` | Demo Taluk Hospital, Thiruvalla | `DEMO-HFR-KL-0204` | THQ govt | Pathanamthitta | 1=General medicine, 2=Casualty |
| 6 | `cfd00000-0010-4000-8000-000000000006` | Demo Private Hospital, Thiruvalla | `DEMO-HFR-KL-0205` | PVT_HOSP private | Pathanamthitta | 1=General medicine, 2=Endocrinology |
| 7 | `cfd00000-0010-4000-8000-000000000007` | Demo Cardiac Care Centre, Pathanamthitta | `DEMO-HFR-KL-0206` | PVT_HOSP private | Pathanamthitta | 1=Cardiology |
| 8 | `cfd00000-0010-4000-8000-000000000008` | Demo Medical College, Kottayam | `DEMO-HFR-KL-0207` | MCH govt | Kottayam | 1=General medicine, 2=Cardiology, 3=Nephrology, 4=Neurology, 5=Radiology |
| 9 | `cfd00000-0010-4000-8000-000000000009` | PHC Kozhencherry | `DEMO-HFR-KL-0211` | PHC govt | Pathanamthitta | 1=General medicine |
| 10 | `cfd00000-0010-4000-8000-000000000010` | PHC Konni | `DEMO-HFR-KL-0212` | PHC govt | Pathanamthitta | 1=General medicine |
| 11 | `cfd00000-0010-4000-8000-000000000011` | PHC Omalloor | `DEMO-HFR-KL-0213` | PHC govt | Pathanamthitta | 1=General medicine |
| 12 | `cfd00000-0010-4000-8000-000000000012` | PHC Elanthoor | `DEMO-HFR-KL-0214` | PHC govt | Pathanamthitta | 1=General medicine |
| 13 | `cfd00000-0010-4000-8000-000000000013` | Demo Eye Centre, Pathanamthitta | `DEMO-HFR-KL-0221` | PVT_CLINIC private | Pathanamthitta | 1=Ophthalmology |

### Pharmacies (`org.pharmacy`, kind `0012`)

| n | Pharmacy id | Name | Licence | Type | Linked hospital |
|---|-------------|------|---------|------|-----------------|
| 1 | `cfd00000-0012-4000-8000-000000000001` | Demo Hospital Pharmacy | `DEMO-DL-KL-2041` | govt_hospital | 1 |
| 2 | `cfd00000-0012-4000-8000-000000000002` | Care Plus Demo Pharmacy, Thiruvalla | `DEMO-DL-KL-2988` | private |  |
| 3 | `cfd00000-0012-4000-8000-000000000003` | Demo Generic Medicines Kendra, Pathanamthitta | `DEMO-DL-KL-3105` | private |  |
| 4 | `cfd00000-0012-4000-8000-000000000004` | Lotus Medical Store, Kozhencherry | `DEMO-DL-KL-3112` | private |  |
| 5 | `cfd00000-0012-4000-8000-000000000005` | Sneha Community Pharmacy, Pathanamthitta | `DEMO-DL-KL-3120` | private |  |
| 6 | `cfd00000-0012-4000-8000-000000000006` | Demo Taluk Hospital Pharmacy, Adoor | `DEMO-DL-KL-3077` | govt_hospital | 2 |

### Wards of Demo General Hospital (`org.ward`, kind `0013`) and beds (`org.bed`, kind `0014`)

| n | Ward id | Code | Name | Department | Charge nurse |
|---|---------|------|------|------------|--------------|
| 3 | `cfd00000-0013-4000-8000-000000000003` | W3 | Ward 3 | General medicine | Sr. Mini Jacob |
| 5 | `cfd00000-0013-4000-8000-000000000005` | W5 | Ward 5 | General medicine |  |
| 11 | `cfd00000-0013-4000-8000-000000000011` | CAS | Casualty | Casualty |  |
| 12 | `cfd00000-0013-4000-8000-000000000012` | ICU | ICU | ICU |  |
| 13 | `cfd00000-0013-4000-8000-000000000013` | MAT | Maternity ward | Maternity |  |
| 14 | `cfd00000-0013-4000-8000-000000000014` | PAE | Paediatric ward | Paediatrics |  |
| 15 | `cfd00000-0013-4000-8000-000000000015` | ORT | Orthopaedic ward | Orthopaedics |  |
| 16 | `cfd00000-0013-4000-8000-000000000016` | SUR | Surgical ward | Surgery |  |

Ward 3 bed id = kind `0014`, serial `3000 + bed_no` (for example bed 7 = `cfd00000-0014-4000-8000-000000003007`). Ward 5 bed id = serial `5000 + bed_no` (12 beds, all free). Beds 1-24 of Ward 3 hold `bed_no` `'1'`..`'24'`.

Ward 3 board (state: s stable, w watch, c critical, f free; `mine` = assigned to Lekha Pillai in the design):

| Bed | Occupant | Person serial | State | Lekha's |
|-----|----------|---------------|-------|---------|
| 1 | Ramesh Kaimal | 1101 | s |  |
| 2 | Lalitha Panicker | 1102 | s |  |
| 3 | Anitha Mathew | 1103 | s | yes |
| 4 | Abdul Rasheed | 1012 | w | yes |
| 5 | Joy Varghese | 1105 | s |  |
| 6 | (free) |  | f |  |
| 7 | Thomas Kurian | 1001 | c | yes |
| 8 | Mary George | 1014 | s | yes |
| 9 | Saji Nair | 1109 | s |  |
| 10 | Usha Devi | 1110 | s |  |
| 11 | Gopi Mohan | 1015 | w | yes |
| 12 | Sreedevi Amma | 1013 | w | yes |
| 13 | Ali Hassan | 1113 | s |  |
| 14 | Bindu Sasidharan | 1114 | s |  |
| 15 | Mohan Lal | 1115 | s |  |
| 16 | Rosamma Thomas | 1116 | s |  |
| 17 | Shibu Philip | 1117 | s |  |
| 18 | (free) |  | f |  |
| 19 | Kunjumon Chacko | 1119 | s |  |
| 20 | Fousiya Abdulla | 1120 | s |  |
| 21 | Vinod Raj | 1121 | s |  |
| 22 | Ammini Kurup | 1122 | w |  |
| 23 | Rajan Chacko | 1123 | s |  |
| 24 | Sathi Kumari | 1124 | s |  |

### Geography

India (central) > South zone (`geo.zone` id 2) > Kerala (`geo.state` id 33, code KL) > Pathanamthitta district > 12 blocks.

`geo.district` ids are random (migration 110): use `util.seed_district('Pathanamthitta')`. Blocks (`geo.block`, kind `0015`):

| n | Code | Block | Block id |
|---|------|-------|----------|
| 1 | PLK | Pulikeezhu | `cfd00000-0015-4000-8000-000000000001` |
| 2 | TVL | Thiruvalla | `cfd00000-0015-4000-8000-000000000002` |
| 3 | MLY | Mallappally | `cfd00000-0015-4000-8000-000000000003` |
| 4 | VNK | Vennikulam | `cfd00000-0015-4000-8000-000000000004` |
| 5 | KZC | Kozhencherry | `cfd00000-0015-4000-8000-000000000005` |
| 6 | ELT | Elanthoor | `cfd00000-0015-4000-8000-000000000006` |
| 7 | RNI | Ranni | `cfd00000-0015-4000-8000-000000000007` |
| 8 | PRN | Perunad | `cfd00000-0015-4000-8000-000000000008` |
| 9 | PDM | Pandalam | `cfd00000-0015-4000-8000-000000000009` |
| 10 | PTA | Pathanamthitta | `cfd00000-0015-4000-8000-000000000010` |
| 11 | KNI | Konni | `cfd00000-0015-4000-8000-000000000011` |
| 12 | ADR | Adoor | `cfd00000-0015-4000-8000-000000000012` |

### Admin posts (`admin.admin_post`, kind `0016`, serial = the admin's person serial)

| Serial | Admin | Level | Scope | Post id |
|--------|-------|-------|-------|---------|
| 9 | Ajay Kumar | district | district Pathanamthitta | `cfd00000-0016-4000-8000-000000000009` |
| 10 | Latha Nair | state | state 33 | `cfd00000-0016-4000-8000-000000000010` |
| 11 | R. Venkatesh | zonal | zone 2 | `cfd00000-0016-4000-8000-000000000011` |
| 12 | S. Banerjee | central | India | `cfd00000-0016-4000-8000-000000000012` |
| 201 | Dr. Sajeev K | district | district Thiruvananthapuram | `cfd00000-0016-4000-8000-000000000201` |
| 202 | Dr. Mini Joseph | district | district Ernakulam | `cfd00000-0016-4000-8000-000000000202` |
| 203 | Dr. Fasal Rahman | district | district Kozhikode | `cfd00000-0016-4000-8000-000000000203` |
| 204 | Dr. Shalini Rao | state | state 32 | `cfd00000-0016-4000-8000-000000000204` |
| 205 | K. Srinivas | state | state 30 | `cfd00000-0016-4000-8000-000000000205` |
| 206 | Dr. Farhan Ali | state | state 31 | `cfd00000-0016-4000-8000-000000000206` |
| 207 | M. Selvi | state | state 35 | `cfd00000-0016-4000-8000-000000000207` |
| 208 | Dr. Nitin Prasad | state | state 13 | `cfd00000-0016-4000-8000-000000000208` |
| 209 | A. K. Mishra | state | state 9 | `cfd00000-0016-4000-8000-000000000209` |
| 210 | Dr. K. Bose | zonal | zone 3 | `cfd00000-0016-4000-8000-000000000210` |
| 211 | N. Sharma | zonal | zone 5 | `cfd00000-0016-4000-8000-000000000211` |
| 212 | Dr. L. Sangma | zonal | zone 1 | `cfd00000-0016-4000-8000-000000000212` |

### Other shared rows

| Table | kind | Serials |
|-------|------|---------|
| `identity.emergency_contact` | 0003 | 1 Ravi Menon (priority 1), 2 Sarala Nair (priority 2), both for Anjali |
| `identity.family_link` | 0004 | 1 Ravi Menon (can show key), 2 Diya Menon (daughter, Anjali is guardian) |
| `identity.consent_record` | 0006 | serial = person serial (privacy_notice; minors: minor_guardian) |
| `donation.blood_bank` | 0017 | 1 Demo General Hospital Blood Bank; 2 Demo Medical College Blood Bank, Kottayam |
| `donation.transplant_centre` | 0018 | 1 Demo Medical College, Kottayam |

<!-- END GENERATED -->

## 5. Renames of real-world names

| Design name | Seed name |
|-------------|-----------|
| Muthoot Medical Centre (demo) | Demo Cardiac Care Centre, Pathanamthitta (hospital 7) |
| Believers Hospital Tiruvalla (demo) | Demo Private Hospital, Thiruvalla (hospital 6) |
| Vasan Eye Care (optician) | Demo Eye Centre, Pathanamthitta (hospital 13) |
| Karunya Community Pharmacy | Sneha Community Pharmacy, Pathanamthitta (pharmacy 5) |
| Medline Pharmacy, Kozhencherry | Lotus Medical Store, Kozhencherry (pharmacy 4) |
| Jan Aushadhi Kendra, Pathanamthitta / Jan Aushadhi, Adoor Rd | Demo Generic Medicines Kendra, Pathanamthitta (pharmacy 3) |
| KMSCL store / KMSCL | Demo State Medical Stores (supplier; created by the pharmacy seed) |
| St. Thomas College, Kozhencherry (blood camp venue) | Demo College, Kozhencherry (text only) |
| Medical College Kottayam | Demo Medical College, Kottayam (hospital 8) |
| PM-JAY / Ayushman Bharat e-card | Demo Health Cover e-card (text only) |
| KNOS (Kerala organ sharing) | Demo Organ Sharing Network (text only) |
| Kerala State Blood Transfusion Council | Demo State Blood Transfusion Council (text only) |
| Kerala State Disaster Management Authority | Demo State Disaster Management Authority (text only) |
| Directorate of Health Services, Kerala | Demo Directorate of Health Services (text only) |
| Kerala Health Dept. | Demo Health Department (text only) |
| Travancore-Cochin Medical Council / TCMC | Demo Medical Council, Kerala (`DEMO-MC-NNNNN`) |
| Kerala State Pharmacy Council (KSPC) | Demo State Pharmacy Council (`DSPC DEMO-NNNNN`) |
| KNMC, KPMC, AERB registration labels | Demo council labels in text (not stored) |
| Care Plus Demo Pharmacy | kept (already fictional) |
| Place names (Pathanamthitta, Kozhencherry, Konni, Adoor, Tiruvalla, Kottayam ...) | kept (real places are fine; no real facility sits on them) |
| 108 ambulance | kept as a plain number; shown with a "demo" notice |

## 6. Expanded abbreviations

Ward 3 board and other short names in the designs map to these people (full list with serials in section 4): Ramesh K. = Ramesh Kaimal, Lalitha P. = Lalitha Panicker, Joy V. = Joy Varghese, Saji N. = Saji Nair, Usha D. = Usha Devi, Ali H. = Ali Hassan, Bindu S. = Bindu Sasidharan, Mohan L. = Mohan Lal, Rosamma T. = Rosamma Thomas, Shibu P. = Shibu Philip, Kunjumon = Kunjumon Chacko, Fousiya = Fousiya Abdulla, Vinod R. = Vinod Raj, Ammini = Ammini Kurup, Rajan C. = Rajan Chacko, Sathi K. = Sathi Kumari, Gopi M. = Gopi Mohan, Fathima N. = Fathima Nazar, Suresh P. = Suresh Pillai, Sindhu R. = Sindhu Raj, Joseph P. = Joseph Philip, Nisha R. = Nisha Rajan, Bindu V. = Bindu Vijayan, Mariamma J. = Mariamma Joseph, Thankamma P. = Thankamma Pillai, Reshma K. = Reshma Kurup, Ananya R. = Ananya Raj, Sasi K. = Sasi Kumar, Anoop K. = Anoop Krishnan, Dr. Rekha S. = Dr. Rekha Soman, Dr. Ann Mary = Dr. Ann Mary Joseph, Dr. Thomas K. = Dr. Thomas Koshy. Ages of abbreviated patients that the design does not state are assumptions.

People named in the designs who are **not** created as persons yet (not needed by the base): the family of patients beyond those listed, Mini Joseph the charge nurse (renamed), Anu George (pharmacist invite, pending, no account), Sasi K.'s other relatives, the three static break-glass doctors' patients other than Thomas Kurian and Thankamma Pillai, and the directory rows generated by the console designs (the admin seed generates its own, with ids in its own kind block).

## 7. Open questions

1. Dr. Sreeja Paul is modelled as an Ophthalmologist at Adoor with visiting cover at Demo General Hospital. A doctor has one `hospital_id`, so the "visiting" part needs a roster/posting row in the doctor seed. Is that acceptable, or should she be posted at Demo General Hospital instead?
2. The District console shows Dr. Meera Krishnan as "second approver (DMO office)". Should the admin seed use a separate DMO-office person, or keep her as a display name only?
3. Bed counts: 240 beds (HFR record) or 200 (department table)? Decision D17 postpones it to the hospital-admin seed.
4. Should the 24 documents (Home/Settings) be seeded as 24 rows or should the counts be reduced to the 10 shown on the Documents screen? (Citizen inventory open question 5; not a base matter.)
5. Block-level admins (Dr. Lissy John and the others) have no accounts. Do we want a block-level admin post in a later migration, or are directory entries enough for the alpha?
6. `demo_data.sql` keeps its random Ernakulam / Thiruvananthapuram filler. Keep it as background volume, or retire it once the design seed is complete?

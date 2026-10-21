# Citizen design: sample-data inventory (for seed scripts)

Source: the 17 Citizen design screens (`Citizen.dc.html` shell plus `CitizenHome`, `Access`, `Profile`, `Documents`, `Dates`, `Vitals`, `AIChat`, `Messages`, `Care`, `Medicines`, `Blood`, `Organ`, `Alerts`, `Settings`, `Reviews`, `Complaints`). All files were read completely. Everything below is synthetic demo data.

How to read this file:
- Values are copied exactly (spelling, punctuation, units). `[derived]` marks numbers I computed from SVG geometry or code logic, not text in the design.
- `FLAG` marks a conflict between screens or a risk. All conflicts are collected in section 22; the seed script needs one decision per conflict.
- Screen file names in headings say where the data lives.

## 0. Index of entities

| # | Entity | Section | Rows (design) |
|---|--------|---------|---------------|
| 1 | Citizen (Anjali Menon) identity and health profile | 2 | 1 |
| 2 | People and roles (doctors, staff, family, officials) | 3 | about 30 |
| 3 | Facilities (hospitals, pharmacies, labs, PHCs) | 4 | about 17 |
| 4 | Cross-app event bus (seed events) | 5 | 10 (6 visible to citizen) |
| 5 | Shell navigation, badges, "now" | 6 | 16 sections |
| 6 | Share key, access session, category switches, access history, trusted family | 7 | 1 session, 7 categories, 7 history rows, 2 family |
| 7 | Special category (chronic card) timeline | 8 | 4 steps |
| 8 | Emergency contacts, family links, address | 8 | 2, 2, 1 |
| 9 | Document folders and documents | 9 | 6 folders, 10 documents |
| 10 | Dates (calendar events, upcoming, reminder types) | 10 | 10 days with events, 6 upcoming |
| 11 | Home vitals (readings, targets, charts, devices) | 11 | 7 readings |
| 12 | AI chat (messages, chips, earlier chats, context) | 12 | 4 messages, 4 chips, 3 earlier chats |
| 13 | Message threads | 13 | 6 threads, 13 messages |
| 14 | Find care (providers, slots, upcoming, past visits) | 14 | 5 providers, 5 days, 9 slots, 4 past visits |
| 15 | Medicines (schedule, prescriptions, refills, pharmacy, stock, past Rx) | 15 | 5 doses, 2 Rx, 4 shops, 4 past Rx |
| 16 | Blood donation | 16 | 3 requests, 8 stock groups, 4 history rows |
| 17 | Organ pledge | 17 | 8 organs, 3 family/witness rows |
| 18 | Alerts and notifications | 18 | 8 static alerts, 5 preference switches |
| 19 | Settings | 19 | 3 devices, 3 languages |
| 20 | Reviews | 20 | 8 reviews, 3 reviewable visits |
| 21 | Complaints | 21 | 4 complaints |
| 22 | Cross-screen inconsistencies | 22 | list |
| 23 | Identifier audit (Aadhaar/ABHA/phone/real names) | 23 | list |
| 24 | Home-only widgets | 24 | list |
| 25 | Suggested seed entity map and open questions | 25 | list |

---

## 1. Global "now" and conventions

- Design "today": **Saturday, 17 October 2026** (Home header: "Saturday, 17 October 2026 · Pathanamthitta · 29°C, humid"; Medicines: "Today · Saturday 17 Oct"). Greeting "Good afternoon, Anjali".
- Clock "now" values used in code: Vitals form "Today · 15:52"; AI chat time of new message 15:52/15:53; Care/Documents upload date default `2026-10-18`; Dates reminder default date `2026-10-19` (Mon 19 Oct, 08:00).
- Calendar weekday facts for Oct 2026 (real calendar): 1 Oct = Thu, 17 = Sat, 19 = Mon, 21 = **Wed**, 24 = Sat, 28 = Wed, 30 = Fri, 31 = Sat; 2 Nov = Mon, 15 Nov = Sun. The design text says "Tue 21 Oct" in many places (FLAG, section 22 item 1).
- Language: English UI; Malayalam strings appear in Care (language chips), Settings (preview SMS) and Profile ("Prefer Malayalam for explanations.").
- Currency: Indian rupee symbol with the number, e.g. "₹500".
- Demo labels used in the design: "SYNTHETIC DEMO DATA" shell banner text is `Synthetic demo data` with body `Anjali Menon is a simulated citizen. IDs like DEMO-0000-1234 are not real.` (Citizen.dc.html). AI badges read "Simulated" (AI chat) and "Guidance only".

---

## 2. Citizen: Anjali Menon (identity and health profile)

### 2.1 Identity card (CitizenProfile, shell, Home, Organ)

```json
{
  "fullName": "Anjali Menon",
  "initials": "AM",
  "role": "Citizen",
  "abhaNumber": "DEMO-0000-1234",
  "abhaAddress": "anjali.m@abdm",
  "aadhaarDisplay": "XXXX XXXX 4821",
  "dateOfBirth": "12 Jun 1988",
  "ageShown": "38 y",
  "sex": "Female",
  "mobileDisplay": "+91 98XXX X4410",
  "verification": {
    "aadhaarVerified": true,
    "faceCheckPassed": true,
    "abhaLinked": true,
    "verifiedOn": "03 Mar 2025",
    "method": "Aadhaar e-KYC and a live face check"
  },
  "profileCompletenessPercent": 92,
  "profileMissing": "vaccination history before 2020 - add it from an old card",
  "shellLabel": "Citizen · DEMO-0000-1234",
  "avatarTone": "peach",
  "hasQrOnCard": true,
  "qrCaption": "Scan at any hospital desk"
}
```

Badges on Profile: "Aadhaar verified", "Face check passed", "ABHA linked". Home header badges: "Profile 92% complete", "ABHA DEMO-0000-1234".

Notes: Profile header text: "Verified with Aadhaar e-KYC and a live face check on 03 Mar 2025." Identity lock text: "Changing your name, date of birth or Aadhaar link needs a fresh e-KYC. Medical fields can be edited anytime and are labelled as self-reported." Lost phone text: "Use 'Recover access' on the login page - an Aadhaar OTP to a new number plus a face check moves your account safely."

### 2.2 Health profile (CitizenProfile view mode)

| Field | Value |
|-------|-------|
| Blood group | B+ · lab confirmed |
| Height / weight | 158 cm · 61 kg |
| Allergies | Penicillin (rash) |
| Conditions | Type 2 diabetes, 2021 |
| Long-term medicines | Metformin, Atorvastatin |
| Surgeries | C-section, 2017 |
| Smoking / alcohol | Never / never |
| Disability | None declared |
| Note field (edit mode default) | Prefer Malayalam for explanations. |

Edit mode fields: Blood group select (options `A+, A-, B+, B-, AB+, AB-, O+, O-`, default `B+`), Weight (kg) default `61`, Allergies default `Penicillin (rash)`, Conditions default `Type 2 diabetes, 2021`, textarea "Anything a doctor should know" (optional). Helper: "Blood group and conditions you add show as 'self-reported' until a doctor confirms them."

### 2.3 Emergency card (Home)

Blood group `B+`; Allergies `Penicillin`; Conditions `Type 2 diabetes`; Contact `Ravi Menon`. Badge: "Special category: Diabetes - in progress". Text: "Visible to a doctor in an emergency, even without your key." Settings toggle "Emergency card without key" (default on; "Blood group, allergies, contact").

### 2.4 Address and language (Profile)

| Field | Value |
|-------|-------|
| Home | Kozhencherry, Pathanamthitta, Kerala 689641 |
| Nearest PHC | PHC Kozhencherry · 2.1 km |
| App language | English · Malayalam for AI chat |

Home header location text: "Pathanamthitta" (town). Care filter chip "Pathanamthitta · 10 km".

---

## 3. People and roles (all names that appear, with every context)

Citizen's linked people:

| Name | Relationship | Details by screen |
|------|--------------|-------------------|
| Ravi Menon | husband | Profile: emergency contact "Husband · +91 94XXX X2207", badge "First"; family link "Can show your key for you", badge "Linked"; Access trusted family badge "Active"; Organ: "Ravi Menon · husband", "Next of kin · informed 12 Oct by SMS link", badge "Acknowledged", card phone "+91 9•••• ••482"; Dates: "Also remind Ravi Menon - Sends him an SMS at the same time"; Access history: break-glass 21 Sep "road accident (Ravi)"; Documents folder suggestion "Family - Ravi" |
| Diya Menon | daughter, 9 | Profile: "Diya Menon, 9", "You are guardian · birth certificate verified", button "Switch"; Access trusted family: "Diya Menon · daughter, 9", "You are her guardian", badge "Guardian"; Dates: vaccine "Diya: MR booster" 31 Oct 10:00 PHC Kozhencherry; Reviews: Ancy P. mentions "Diya's vaccine" |
| Sarala Nair | mother | Profile emergency contact "Mother · +91 98XXX X9031", badge "Second" |
| Sarojini Menon | mother | Organ: "Sarojini Menon · mother", "Witness 1 · will come to the hospital", badge "Signing pending"; FLAG (differs from Sarala Nair, and a Menon surname for the mother is odd) |
| Thomas Kurian | neighbour | Organ: "Thomas Kurian · neighbour", "Witness 2 · not a relative", badge "Signing pending". FLAG: same name is also a cardiologist (Care) and an unconscious patient in Bed 7 (event bus s5, s7) |

Doctors and clinical staff:

| Name | Role / speciality | Facility | Contexts |
|------|-------------------|----------|----------|
| Dr. Arun Nair | General medicine, HPR verified | Demo General Hospital, Pathanamthitta (OP block 2) | Main doctor everywhere: active session, appointment, prescriptions, messages, reviews |
| Dr. Sreeja Paul | FLAG conflicting: Dermatology (Medicines Rx), Ophthalmology (Messages), "eye check" (Care), break-glass doctor (bus s5), "Doctor" in access history | Demo Taluk Hospital, Adoor / Taluk Hospital Adoor | Access history 02 Oct; Rx RX-DEMO-87140 on 2 Oct; past visit 02 Oct eye check; past Rx 04 Mar 2026 Cetirizine; message 2 Oct |
| Dr. Lakshmi Varma | Diabetology | District Hospital Kozhencherry | Care result 2; Reviews (Fousiya A.) |
| Dr. Thomas Kurian | Cardiology, private | Muthoot Medical Centre (demo) | Care result 3 |
| Dr. Anitha George | Family medicine | PHC Konni | Care result 4 |
| Dr. Rajesh Menon | Endocrinology, private | Believers Hospital Tiruvalla (demo) | Care result 5 |
| Dr. Meera Krishnan | FLAG: "hospital admin" (Complaints, Reviews reply "Reply from Dr. Meera Krishnan") and prescribing doctor of Azithromycin 12 Jul 2026 (Medicines past Rx) | Demo General Hospital | |
| Dr. Vinod K. | Emergency doctor | (not stated) | Access history 21 Sep 02:48 break-glass "road accident (Ravi)" |
| Rahul Varghese | Lab technician | "Demo Diagnostics" (Messages) / "Demo General Hospital lab" (Documents) / "Hospital lab" (Reviews) | Lab order DEMO-L-5521; lipid profile 17 Oct 11:05 |
| Fathima Beevi | Radiology | Demo General Hospital | Imaging order DEMO-R-2210, 15 Oct 09:40; CXR_PA_15Oct.dcm |
| Joseph Mathew | Pharmacist | Demo Hospital Pharmacy, Counter 2 | Dispensing event 13:20; access history 12 Oct 17:12 "Prescription scan" |
| Lekha Pillai | Nurse | Ward 3 | Access history 04 Sep 12:30 "Admission mode, Ward 3"; bus s7 |
| Suma Thomas | Pharmacy-side staff (implied pharmacy admin) | Demo Hospital Pharmacy | Complaint CMP-0377 log |
| Ajay Kumar | District reviewer | Pathanamthitta district | Special category: "District review - Ajay Kumar, Pathanamthitta · usually 5 working days" |
| Kerala Health Dept. | Announcement sender (no replies) | | Messages thread |

Avatar tones used in Messages: Dr. Arun Nair `teal`, Demo General Hospital `blue`, Rahul Varghese `peach`, Fathima Beevi `lavender`, Dr. Sreeja Paul `teal`, Kerala Health Dept. `sage`.

---

## 4. Facilities

| Name (as written) | Type | Where it appears | Extra |
|-------------------|------|------------------|-------|
| Demo General Hospital (Demo General Hospital, Pathanamthitta) | Government hospital | everywhere | OP block 2; Appointments desk; visitor parking near Gate 3 free for first 2 hours; organ donation desk ground floor Mon-Sat 09:00-16:00; cooling centre during heatwave; blood bank (last donation 4 Aug 2026) |
| Demo Hospital Pharmacy (Govt) | Pharmacy | Medicines, Home | Counter 2, Joseph Mathew, 1.2 km, open till 20:00, Jan Aushadhi; token P-042; queue "3 ahead · ~8 min"; stock Atorvastatin |
| Demo Diagnostics | Lab | Messages (Rahul Varghese's workplace), Care ("HbA1c test · Demo Diagnostics", walk-in 07:00-10:00 fasting) | |
| District PHL, Pathanamthitta | Public health lab | Documents (HbA1c 04 Oct 2026), Dates (3 Oct) | |
| Taluk Hospital, Kozhencherry | Hospital | Documents (Discharge summary 22 Sep 2026; Complete blood count lab "Taluk Hospital lab") | Dates 28 Oct diabetic eye screening "Taluk Hospital, Kozhencherry" |
| District Hospital Kozhencherry | Government | Care result 2, Reviews, Complaints place | |
| Demo Taluk Hospital, Adoor / Taluk Hospital Adoor | Government | Medicines Rx, Blood (camp 8 Nov), Reviews, Complaints, Messages | FLAG naming variants |
| PHC Kozhencherry | PHC | Profile nearest PHC (2.1 km), Dates (Diya MR 31 Oct 10:00) | |
| PHC Konni | PHC | Care result 4 and past visit 11 Aug (dengue test Negative), Reviews (Mini J.), Complaints CMP-0266 | Free diabetes screening camp 25 Oct 9:00-13:00 (Messages) |
| PHC Omalloor | PHC | Alerts (dengue: "Free fever check at PHC Omalloor, 9-1, all week") | |
| Muthoot Medical Centre (demo) | Private | Care result 3 | FLAG real-world name |
| Believers Hospital Tiruvalla (demo) | Private | Care result 5 | FLAG real-world name |
| Demo Medical College, Kottayam | Government | Blood request (31 km); donation 9 Oct 2025; body donation | |
| St. Thomas College, Kozhencherry | College | Blood donation camp 22 Mar 2026 | FLAG real-world name |
| Jan Aushadhi Kendra, Pathanamthitta | Pharmacy | Medicines stock | |
| Medline Pharmacy, Kozhencherry | Private pharmacy | Medicines stock | |
| Karunya Community Pharmacy | Pharmacy | Medicines stock | FLAG "Karunya" is a Kerala scheme name |
| Vasan Eye Care | Optician | Documents "Eye test - Vasan Eye Care" | FLAG real-world chain |

Organisations quoted: "Kerala State Disaster Management Authority" (heatwave alert), "Directorate of Health Services, Kerala" (dengue alert), "Kerala State Blood Transfusion Council" (blood camp, Silver donor recognition (demo)), "KNOS" (Kerala organ sharing; badge "KNOS · Kerala"), "Kerala Health Dept.", "State grievance cell", "district health office". FLAG: real bodies (section 23).

---

## 5. Cross-app event bus (seed events)

Defined identically in every Citizen file as `CF_SEED`; localStorage key `cf-demo-bus-v1`; at most 40 events kept; new events get id `e<timestamp><rand>` and `at` = current HH:MM. Roles list (NAMES in shell): citizen, doctor, nurse, labtech (Lab), radiology, pharmacist, pharmacyadmin (Pharmacy admin), hospitaladmin (Hospital admin), district (District admin), state, zonal, central.

```json
[
  { "id": "s1",  "type": "booking",         "from": "citizen",    "to": ["doctor"], "title": "New booking · Anjali Menon", "text": "Tue 21 Oct, 10:30 · follow-up", "href": "Doctor.dc.html", "at": "09:12" },
  { "id": "s2",  "type": "prescription",    "from": "doctor",     "to": ["pharmacist","citizen"], "title": "e-Signed prescription · Anjali Menon", "text": "Metformin 500 mg ×60, Atorvastatin 10 mg ×30 · Dr. Arun Nair", "href": "Pharmacist.dc.html", "at": "10:05" },
  { "id": "s3",  "type": "lab-order",       "from": "doctor",     "to": ["labtech"], "title": "Lab order · HbA1c, lipid profile", "text": "Anjali Menon · routine · Dr. Arun Nair", "href": "LabTech.dc.html", "at": "10:07" },
  { "id": "s4",  "type": "lab-result",      "from": "labtech",    "to": ["doctor","citizen"], "title": "Result ready · Lipid profile", "text": "LDL 142 mg/dL (high) · uploaded by Rahul Varghese", "href": "Doctor.dc.html", "at": "11:05" },
  { "id": "s5",  "type": "break-glass",     "from": "doctor",     "to": ["hospitaladmin","citizen"], "title": "Emergency access used", "text": "Dr. Sreeja Paul · Thomas Kurian · unconscious on arrival", "href": "HospitalAdmin.dc.html", "at": "03:12" },
  { "id": "s6",  "type": "alert",           "from": "district",   "to": ["citizen","doctor","nurse","hospitaladmin"], "title": "Heatwave — Pathanamthitta", "text": "Stay indoors 12:00–16:00 · District health office", "href": "CitizenAlerts.dc.html", "at": "08:00" },
  { "id": "s7",  "type": "vitals-critical", "from": "nurse",      "to": ["doctor"], "title": "Early-warning score 7 · Bed 7", "text": "Thomas Kurian · SpO₂ 91% · escalated by Lekha Pillai", "href": "Doctor.dc.html", "at": "12:40" },
  { "id": "s8",  "type": "dispensed",       "from": "pharmacist", "to": ["citizen","pharmacyadmin"], "title": "Ready to collect · Demo Hospital Pharmacy", "text": "Anjali Menon · Metformin, Atorvastatin · Joseph Mathew", "href": "CitizenMedicines.dc.html", "at": "13:20" },
  { "id": "s9",  "type": "complaint",       "from": "citizen",    "to": ["hospitaladmin","district"], "title": "Complaint filed · long OP wait", "text": "Demo General Hospital · ticket CMP-0412", "href": "HospitalAdmin.dc.html", "at": "14:02" },
  { "id": "s10", "type": "blood-request",   "from": "doctor",     "to": ["citizen","district"], "title": "Blood needed · B+ · 2 units", "text": "Demo General Hospital · surgery tomorrow 08:00", "href": "CitizenBlood.dc.html", "at": "14:30" }
]
```

Events the citizen app sees at start (`to` contains "citizen"): s2, s4, s5, s6, s8, s10 (6 events). Shell marks events after the first 3 as already seen, so initial unread bell count = 3 (s2, s4, s5).

FLAG: s5 shows another patient's name ("Thomas Kurian") in Anjali's feed, and the Access screen turns it into an access-history row for Anjali's own record (section 7.4). Decide whether s5 is about Anjali or a different patient.

Event types the citizen app can push (runtime, not seeded): `booking` (to doctor, hospitaladmin; extra fields day, ref, doc, place, time), `session-ended` (to doctor), `ai-chat-shared` (to doctor), `message` (to doctor), `vitals` (to doctor, title "Home reading outside target · Anjali Menon"), `blood-response` (to doctor, district), `review` (to hospitaladmin, doctor), `complaint` (to hospitaladmin, district). Types the citizen app listens for: `message` from doctor, `complaint-update`, `collected`, `lab-result`, `prescription`, `dispensed`, `alert`, `blood-request`, `break-glass`.

Sender labels (CF_FROM; slightly differs by screen): citizen "Citizen", doctor "Doctor", nurse "Nurse", labtech "Lab", radiology "Radiology", pharmacist "Pharmacist" (Documents/Alerts/Medicines: "Pharmacy"), pharmacyadmin "Pharmacy admin", hospitaladmin "Hospital admin", district "District", state "State", zonal "Zonal", central "Central" (Documents/Alerts/Medicines: "MoHFW"). Link labels (CF_LINK): Doctor.dc.html "Open in Doctor app"; Pharmacist.dc.html "Track at pharmacy"; LabTech.dc.html "Open in Lab"; HospitalAdmin.dc.html "Open in Hospital admin"; DistrictAdmin.dc.html "Open in District console"; CitizenMedicines.dc.html "See in Medicines"; CitizenBlood.dc.html "See in Blood donation"; CitizenAlerts.dc.html "See in Alerts"; CitizenDocuments.dc.html "See in Documents".

---

## 6. Shell (Citizen.dc.html): navigation, top bar

Top bar breadcrumb: "Citizen › {section label}". Buttons: "Activity log" (goes to Share & access), bell (goes to Alerts, marks all read), "Share key" (goes to Share & access). Toast on new bus event: three-letter sender tag, title, text, link "Open in {fromName} app".

Navigation (id, label, group, badge):

| id | label | group | badge |
|----|-------|-------|-------|
| home | Home | (main) | |
| access | Share & access | (main) | |
| documents | Documents | (main) | |
| dates | Dates | (main) | 2 |
| vitals | Home vitals | Health | |
| ai | AI Health Chat | Health | |
| messages | Messages | Health | 1 |
| care | Find care | Health | |
| medicines | Medicines | Health | |
| blood | Blood donation | Give | |
| organ | Organ donation | Give | |
| reviews | Reviews | Your voice | |
| complaints | Complaints | Your voice | 1 |
| profile | Profile | Account | |
| alerts | Alerts | Account | unread count (dynamic, starts at 3) |
| settings | Settings | Account | |

Footer user chip: Avatar "Anjali Menon" tone peach, "Citizen · DEMO-0000-1234", link "Sign out" to `Login.dc.html`. Logo link `Main.dc.html`.

---

## 7. Share key, access session, categories, history, trusted family (CitizenAccess, CitizenHome)

### 7.1 Rotating key
- 6 digits, shown as "NNN NNN"; rotates every 10 seconds; each key works once; "only inside a registered hospital".
- Seed values: Home key `482913`; Access key `739204`; new key = `100000 + random(0..899999)`.
- Home text: "Opens a 30-minute session for one doctor. Used once." Access hero: "Your key · changes every 10 seconds".
- How sharing works (4 steps): 1 "Doctor types or scans your key at the hospital." 2 "They see only the folders you allow below." 3 "The session ends after 30 minutes, or when you end it." 4 "Every open is written to your access history."
- Badges: "1 live session", "14 opens this month" (FLAG: history table has 7 rows).

### 7.2 Active session (Home and Access)

```json
{
  "doctor": "Dr. Arun Nair",
  "doctorLine": "General medicine · HPR verified",
  "facility": "Demo General Hospital, Pathanamthitta",
  "startedAt": "14:24",
  "durationMinutes": 30,
  "secondsLeftSeed": 1122,
  "clockSeed": "18:42",
  "progressPercentHome": 62,
  "scopeChips": ["Lab reports", "Prescriptions", "Vitals"],
  "homeLine": "18:42 left of 30:00 · viewing Lab reports",
  "openedInSession": [
    { "time": "14:25", "item": "Lipid profile", "category": "Lab reports", "state": "Viewed" },
    { "time": "14:27", "item": "30-day BP readings", "category": "Vitals", "state": "Viewed" },
    { "time": "14:31", "item": "Atorvastatin 10 mg", "category": "Prescriptions", "state": "Draft" }
  ],
  "closedByDefault": "Imaging, genomics and mental health notes stay closed unless you switch them on."
}
```
FLAG: session started 14:24 with 30 min cannot have 18:42 left at 15:52 (and Alerts says "Session ends at 15:00").
On "End session now": event `session-ended` to doctor, title "Session ended by Anjali Menon", text "Your access to her record closed · 30-minute key session"; UI text "Session ended by you at {time}. Dr. Arun Nair can no longer open your record - his app was told straight away."

### 7.3 Category switches ("What a doctor can see")

```json
[
  { "key": "emg", "label": "Emergency card",             "desc": "Always visible in emergencies — can’t be turned off", "on": true,  "locked": true },
  { "key": "lab", "label": "Lab reports",                "desc": "18 reports since 2023",                                "on": true,  "locked": false },
  { "key": "rx",  "label": "Prescriptions & medicines",  "desc": "9 e-signed prescriptions",                            "on": true,  "locked": false },
  { "key": "vit", "label": "Home vitals",                "desc": "Blood pressure, sugar, weight",                        "on": true,  "locked": false },
  { "key": "img", "label": "Imaging",                    "desc": "X-ray, ultrasound, CT",                                "on": false, "locked": false },
  { "key": "gen", "label": "Genomic results",            "desc": "Hidden unless you turn this on",                       "on": false, "locked": false },
  { "key": "mh",  "label": "Mental health notes",        "desc": "Extra-private · off by default",                       "on": false, "locked": false }
]
```
Counter text: "{n} of 7 folders shared" (4 on by default).

### 7.4 Access history (7 seed rows)

Columns: When, Who, Role, How they got in, What they saw, Status. Status label map: live = "Live" (success), done = "Closed" (neutral), ended = "Ended by you" (peach), review = "Reviewed" (warning). Filter tabs: All (count), Doctors (roles Doctor or Emergency), Hospital staff (everything else).

```json
[
  { "when": "17 Oct, 14:24", "who": "Dr. Arun Nair",   "role": "Doctor",     "how": "Your key",                             "saw": "Lab, Rx, Vitals", "status": "live" },
  { "when": "17 Oct, 11:05", "who": "Rahul Varghese",  "role": "Lab tech",   "how": "Lab order #DEMO-L-5521",               "saw": "Upload only",     "status": "done" },
  { "when": "15 Oct, 09:40", "who": "Fathima Beevi",   "role": "Radiology",  "how": "Imaging order #DEMO-R-2210",           "saw": "Upload only",     "status": "done" },
  { "when": "12 Oct, 17:12", "who": "Joseph Mathew",   "role": "Pharmacist", "how": "Prescription scan",                    "saw": "Rx only",         "status": "done" },
  { "when": "02 Oct, 10:15", "who": "Dr. Sreeja Paul", "role": "Doctor",     "how": "Your key",                             "saw": "Lab, Rx",         "status": "ended" },
  { "when": "21 Sep, 02:48", "who": "Dr. Vinod K.",    "role": "Emergency",  "how": "Break-glass · road accident (Ravi)",   "saw": "Emergency card",  "status": "review" },
  { "when": "04 Sep, 12:30", "who": "Lekha Pillai",    "role": "Nurse",      "how": "Admission mode, Ward 3",               "saw": "Vitals",          "status": "done" }
]
```
Runtime: every `break-glass` bus event adds a row `["Today, <at>", <text before first " · ">, "Emergency", "Break-glass · <last segment of text>", "Emergency card", "review"]` inserted after the first row. Footer text: "Showing {n} entries · kept for 7 years · you can't delete them, nor can anyone else." Button "Download history (PDF)". Home "Who opened your record" shows 3: Dr. Arun Nair "Today 14:24 · your key · inside hospital"; Rahul Varghese · Lab "Today 11:05 · uploaded to an order"; Dr. Sreeja Paul "2 Oct · ended by you after 12 min".

### 7.5 Trusted family, emergency, report

- Trusted family: "Ravi Menon · husband" / "Can show your key for you" / badge Active; "Diya Menon · daughter, 9" / "You are her guardian" / badge Guardian.
- In an emergency (break-glass) card text: "If you can't share your key — unconscious, after an accident — an emergency doctor can open your emergency card only. They must give a reason, a second doctor confirms, and you get an alert straight away." Bullets: "Blood group, allergies, conditions, contact"; "Ends after 60 minutes"; "Reviewed by the district within 24 h".
- Report: "Last report: none · Grievance helpline 1800-000-0000 (demo)".

---

## 8. Special category, emergency contacts, family (CitizenProfile)

### 8.1 Special category status
Badge "In progress". Text: "Chronic illness card — Diabetes care programme. Gives free monthly medicines and a priority queue at government OPs."

```json
[
  { "step": 1, "state": "ok",   "title": "Request sent",       "meta": "02 Oct · by Dr. Arun Nair" },
  { "step": 2, "state": "ok",   "title": "Lab proof attached", "meta": "HbA1c 7.4% · 04 Oct" },
  { "step": 3, "state": "now",  "title": "District review",    "meta": "Ajay Kumar, Pathanamthitta · usually 5 working days" },
  { "step": 4, "state": "next", "title": "Card issued",        "meta": "You'll get an alert and an e-card here" }
]
```

### 8.2 Emergency contacts
```json
[
  { "name": "Ravi Menon",  "relation": "Husband", "phone": "+91 94XXX X2207", "rank": "First" },
  { "name": "Sarala Nair", "relation": "Mother",  "phone": "+91 98XXX X9031", "rank": "Second" }
]
```
Note: "Called automatically if break-glass access is used."

### 8.3 Family and guardian links
```json
[
  { "name": "Diya Menon", "age": 9, "relation": "daughter", "note": "You are guardian · birth certificate verified", "action": "Switch" },
  { "name": "Ravi Menon", "note": "Can show your key for you", "badge": "Linked" }
]
```
CTA: "Link a family member" / "Child, parent or someone you care for".

---

## 9. Documents (CitizenDocuments)

### 9.1 Folders (`DOC_FOLDERS`)
```json
[
  { "id": "lab",   "label": "Lab reports",         "colour": "c-blue" },
  { "id": "img",   "label": "Imaging",             "colour": "c-lav" },
  { "id": "rx",    "label": "Prescriptions",       "colour": "c-teal" },
  { "id": "dis",   "label": "Discharge",           "colour": "c-peach" },
  { "id": "me",    "label": "Uploaded by me",      "colour": "c-cream" },
  { "id": "f-ins", "label": "Insurance & schemes", "colour": "c-gold", "custom": true }
]
```
A virtual "All documents" folder (colour `c-all`) is prepended. Deleting a custom folder moves its files to "Uploaded by me". Folder-name suggestions: Insurance, Dental, Pregnancy, "Family — Ravi", Vaccinations. Colour options (id, label): c-blue Blue, c-teal Teal, c-lav Lavender, c-peach Peach, c-sage Sage, c-gold Gold. Type options for upload: Lab report, Imaging, Prescription, Discharge summary, Insurance, Other. "Added by" filter: Anyone, Doctors, Labs, Radiology, Me. Header text: "{n} documents in {m} folders · {k} uploaded by you". Upload accepts PDF, JPG, PNG up to 20 MB; default upload date `2026-10-18`; default folder `me`.

### 9.2 Documents (10 rows; ids d0..d9 by position)

Fields: folder, name, source, date, addedBy, tone, isNew (shows "New" badge), fileTag, signed, summaryTitle, summary.

```json
[
  { "id": "d0", "folder": "lab", "name": "Lipid profile", "src": "Demo General Hospital lab", "date": "17 Oct 2026", "by": "Rahul Varghese · Lab", "tone": "info", "isNew": true, "ft": "PDF", "sign": "Lab seal + e-sign", "sumTitle": "Cholesterol slightly high", "sum": "LDL 132 mg/dL is above the 100 target. HDL and triglycerides are normal. Your doctor may continue Atorvastatin and suggest diet changes." },
  { "id": "d1", "folder": "img", "name": "Chest X-ray, PA view", "src": "Radiology · Demo General Hospital", "date": "15 Oct 2026", "by": "Fathima Beevi · Radiology", "tone": "ai", "isNew": true, "ft": "DCM", "sign": "Reviewed by Dr. Arun Nair", "sumTitle": "No urgent findings", "sum": "Mild hazy area in the right lower zone, likely from last month’s chest infection. Repeat X-ray in 2 weeks." },
  { "id": "d2", "folder": "rx", "name": "Prescription — diabetes review", "src": "Dr. Arun Nair", "date": "17 Oct 2026", "by": "Doctor", "tone": "teal", "isNew": true, "ft": "Rx", "sign": "e-Signed (DSC)", "sumTitle": "3 medicines, 30 days", "sum": "Metformin 500 mg twice daily, Atorvastatin 10 mg at night, Vitamin D weekly. Valid till 14 Nov 2026." },
  { "id": "d3", "folder": "lab", "name": "HbA1c", "src": "District PHL, Pathanamthitta", "date": "04 Oct 2026", "by": "Lab", "tone": "info", "isNew": false, "ft": "PDF", "sign": "Lab seal + e-sign", "sumTitle": "Sugar control improving", "sum": "HbA1c 7.4%, down from 7.9% in June. Target is under 7%." },
  { "id": "d4", "folder": "dis", "name": "Discharge summary", "src": "Taluk Hospital, Kozhencherry", "date": "22 Sep 2026", "by": "Doctor", "tone": "peach", "isNew": false, "ft": "PDF", "sign": "e-Signed", "sumTitle": "3-day stay for chest infection", "sum": "Admitted with fever and cough, treated with antibiotics (non-penicillin). Discharged stable." },
  { "id": "d5", "folder": "lab", "name": "Complete blood count", "src": "Taluk Hospital lab", "date": "20 Sep 2026", "by": "Lab", "tone": "info", "isNew": false, "ft": "PDF", "sign": "Lab seal", "sumTitle": "Infection markers raised", "sum": "White cells 13,200, consistent with an infection at the time. Repeat was normal." },
  { "id": "d6", "folder": "img", "name": "Abdominal ultrasound", "src": "Demo General Hospital", "date": "11 Jun 2026", "by": "Radiology", "tone": "ai", "isNew": false, "ft": "IMG", "sign": "Reported", "sumTitle": "Normal study", "sum": "Liver, gallbladder and kidneys look normal." },
  { "id": "d7", "folder": "me", "name": "Eye test — Vasan Eye Care", "src": "Uploaded by you", "date": "08 May 2026", "by": "You", "tone": "neutral", "isNew": false, "ft": "PDF", "sign": "Not verified", "sumTitle": "Mild short sight", "sum": "Glasses −0.75 both eyes. No diabetic eye changes noted." },
  { "id": "d8", "folder": "me", "name": "Old vaccination card", "src": "Uploaded by you", "date": "17 Oct 2026", "by": "You", "tone": "neutral", "isNew": true, "ft": "JPG", "sign": "Not verified", "sumTitle": "Childhood vaccines listed", "sum": "Photo of a 1990s card: BCG, DPT, polio and measles. A doctor can confirm it." },
  { "id": "d9", "folder": "f-ins", "name": "PM-JAY e-card", "src": "Uploaded by you", "date": "02 Mar 2026", "by": "You", "tone": "neutral", "isNew": false, "ft": "PDF", "sign": "Not verified", "sumTitle": "Ayushman Bharat card", "sum": "Family floater cover of ₹5 lakh a year at empanelled hospitals. Card holder: Anjali Menon." }
]
```
Folder counts from seed: Lab reports 3, Imaging 2, Prescriptions 1, Discharge 1, Uploaded by me 2, Insurance & schemes 1, All 10. Default selected: d0. AI summary card: module "Report summary · {name}", status verified, confidence 0.86, evidence lines: "From the report text of “{name}”", "Compared with your earlier results", "Not a diagnosis — your doctor decides". Lab-result bus event: if a doc with the same name as the event title (minus "Result ready · ") exists, it gets the "New from lab" badge and the note "Arrived through Dr. Arun Nair's lab order at {time}." (links to LabTech); else a new doc is created in `lab` with `src: "Demo General Hospital lab"`, date `18 Oct 2026`, `sumTitle: "New result — your doctor will review it"`.
Selected-panel text: "Shared: With doctors you give a key to".

Storage: "186 MB of 1 GB"; legend "Lab 82 MB", "Imaging 64 MB", "Rx 24 MB", "Mine 16 MB" (sums to 186). FLAG: Home says Documents "24" and Settings says "24 · 38 MB"; this screen has 10 docs and 186 MB; export ZIP "41 MB".
Live panel title "New from labs & doctors", note "Added to your folders automatically" (types lab-result, prescription, dispensed).

---

## 10. Dates (CitizenDates)

Month shown: October 2026; grid starts Thursday (3 blank cells Mon-Wed, then 31 days, then one trailing blank). "Today" = 17; days before 17 are styled past. Default selected day: 21. Legend kinds: appt Appointment, med Refill, test Test, give Donation, vac Vaccine, alert Alert. Views tabs: Month, List.

### 10.1 Calendar events by day (`EV`)
Fields: kind, short label (shown in cell), title, meta.
```json
{
  "3":  [["test",  "HbA1c",          "HbA1c blood test",               "District PHL · done"]],
  "9":  [["med",   "Refill",         "Atorvastatin refill",            "Collected"]],
  "12": [["alert", "Heat",           "Heatwave alert",                 "Pathanamthitta"]],
  "17": [["appt",  "Dr. Nair",       "Visit with Dr. Arun Nair",       "14:20 · done"],
         ["alert", "Heat",           "Heatwave alert",                 "Stay indoors 12–16"]],
  "21": [["appt",  "10:30 Dr. Nair", "Follow-up with Dr. Arun Nair",   "10:30 · OP block 2, Demo General Hospital"]],
  "24": [["med",   "Metformin",      "Metformin refill due",           "Set by Dr. Arun Nair · 30 tablets"]],
  "28": [["appt",  "Eye check",      "Diabetic eye screening",         "11:00 · Taluk Hospital, Kozhencherry"]],
  "29": [["test",  "X-ray",          "Repeat chest X-ray",             "Radiology · any time 9–4"]],
  "30": [["test",  "HbA1c",          "HbA1c blood test",               "Fasting · any government lab"]],
  "31": [["vac",   "Diya MR",        "Diya: MR booster",               "PHC Kozhencherry · 10:00"]]
}
```
Month summary box ("October at a glance"): Appointments 3, Tests 2, Refills 2, Vaccine 1 (FLAG: the map has 3 tests: 3, 29, 30). Note: 3 Oct HbA1c "done" at District PHL but Documents has HbA1c dated 04 Oct 2026 (FLAG).

### 10.2 "Coming up" list (`UP`, fields day, month, kind, title, meta, relative)
```json
[
  ["21","Oct","appt","Follow-up with Dr. Arun Nair","OP block 2 · Demo General Hospital","in 4 days"],
  ["24","Oct","med","Metformin refill due","Any Jan Aushadhi or hospital pharmacy","in 7 days"],
  ["28","Oct","appt","Diabetic eye screening","Taluk Hospital, Kozhencherry","in 11 days"],
  ["30","Oct","test","HbA1c blood test","Fasting from 22:00 the night before","in 13 days"],
  ["02","Nov","give","Eligible to donate blood","3 months since 02 Aug","in 16 days"],
  ["15","Nov","vac","Influenza vaccine","Yearly · any PHC","in 29 days"]
]
```
Booked appointments from Find care are appended (`Booked: <doc>`, `<place> · sent to doctor's queue`, `in <day-17> days`) and the list is sorted, capped at 7.

### 10.3 Reminder form
Types: Personal reminder, Medicine, Home vitals reading, Appointment (outside the app). Repeat: Does not repeat, Every day, Every week, Every month. Defaults: What placeholder "e.g. Take BP reading", Date `2026-10-19`, Time `08:00`; checkbox "Also remind Ravi Menon" - "Sends him an SMS at the same time". Saved message: "Saved “{title}” for Mon 19 Oct, 08:00." Info alert: "Doctor-set dates can't be deleted - You can snooze a refill or test reminder, but only your doctor can change it."

### 10.4 Home "Dates to remember" (5 rows)
| Day | Mon | Title | Meta | Badge |
|-----|-----|-------|------|-------|
| 21 | Oct | Follow-up with Dr. Arun Nair | 10:30 · OP block 2, Demo General Hospital | Confirmed (success) |
| 24 | Oct | Metformin refill due | Set by Dr. Arun Nair · 30 tablets | Refill (teal) |
| 30 | Oct | HbA1c blood test | Fasting · any government lab | Test (warning) |
| 02 | Nov | Eligible to donate blood again | 3 months after your last donation | Donation (success) |
| 15 | Nov | Influenza vaccine | Yearly · any PHC | Vaccine (ai) |

---

## 11. Home vitals (CitizenVitals, CitizenHome)

### 11.1 Latest readings (stat cards)
- Blood pressure `118/76` mmHg, trend down "4 points lower than last month".
- Fasting sugar `132` mg/dL, trend down "16 lower than 8 weeks ago".
- Weight `64.2` kg, trend down "1.8 kg in 12 weeks".
- SpO₂ · Temp `98%` · `36.8 °C`, hint "Normal · today 07:40".

### 11.2 Readings table (`R`)
Columns: when, type, reading, note, status, flagged (1 = outside range, row highlighted).
```json
[
  ["17 Oct 07:40", "Blood pressure", "118/76 mmHg", "Pulse 72",              "In range",     0],
  ["17 Oct 07:35", "Fasting sugar",  "132 mg/dL",   "Before breakfast",      "Above target", 1],
  ["16 Oct 21:10", "Blood pressure", "134/86 mmHg", "Missed evening dose",   "High",         1],
  ["16 Oct 07:42", "Blood pressure", "121/78 mmHg", "—",                     "In range",     0],
  ["15 Oct 07:30", "Weight",         "64.2 kg",     "—",                     "Steady",       0],
  ["14 Oct 18:00", "Temperature",    "36.8 °C",     "Oral",                  "Normal",       0],
  ["14 Oct 07:38", "SpO₂",           "98%",         "Pulse 70",              "Normal",       0]
]
```
FLAG: stat card says SpO₂ "today 07:40" but SpO₂ row is 14 Oct 07:38; weight card "64.2 kg" row 15 Oct.

### 11.3 Rules, options, targets
- BP is flagged "High" in the add form when systolic >= 140 or diastolic >= 90 or systolic < 90. Sugar flagged when >= 180 (High) or < 70 (Low). Flagged readings notify the doctor: bus event `vitals`, title "Home reading outside target · Anjali Menon", text "{type} {value} · self-reported". UI: "Saved · outside your target, so Dr. Arun Nair was notified" / "Saved to your record · added to the chart".
- Reading types: Blood pressure, Sugar, Weight, SpO₂, Temperature. Sugar "When": Fasting, Before a meal, 2 h after a meal, Random. Temperature "Measured at": Oral, Ear, Forehead, Armpit. Fields: BP systolic/diastolic/pulse (optional); sugar mg/dL; weight kg + waist cm (optional); SpO₂ % + pulse; temp °C; note.
- Fasting sugar target: under 130 mg/dL (dashed line), badge "Above target". Weight goal 62 kg.

### 11.4 BP 30-day panel
- Y axis labels 140/120/100/80; ranges: systolic 116 to 128, diastolic 72 to 82; target band set by Dr. Arun Nair (green rectangle y 40-110 on a 200-high chart).
- Summary tiles: `121/78` 30-day average; `134/86` Highest · 9 Oct (FLAG: table says 16 Oct 21:10); `26 of 28` readings in range. Date labels: 18 Sep, 2 Oct, Today.
- AI insight (status verified, confidence 0.86, module "Trend summary"): "Steady and inside your target" - "26 of 28 readings were in range. Two higher readings followed missed evening doses. This is guidance, not a diagnosis."
- Range tabs: 30 d (selected), 90 d, 1 yr. Home mini chart: "Blood pressure · 30 days", badge "Self-reported", labels 18 Sep, "Avg 121/78", Today.
- SVG polylines (appendix A): the chart curves have no underlying numeric table; generate readings so that systolic stays 116-128 with max 134/86 on one evening, diastolic 72-82, average 121/78, 28 readings over 18 Sep to 17 Oct.

### 11.5 Fasting sugar, 8 weeks
Headline "148 → 132 mg/dL · target under 130". 8 bars (heights in px on a 120 px chart; scale 148 mg/dL = 98 px, 132 = 74 px): `[98,92,90,84,86,80,76,74]`. `[derived]` mg/dL: 148, 144, 142.7, 138.7, 140, 136, 133.3, 132. Tiles: `6.9%` "HbA1c · 12 Sep" (FLAG vs 7.4% on 04 Oct) and `30 Oct` "Next HbA1c test".

### 11.6 Weight and BMI
BMI 25.7 ("BMI · was 26.4 in July"), height 158 cm, marker at 61% of band (Under / Healthy / Over / High). "−1.8 kg in 12 weeks · steady pace". Goal 62 kg; "66.0 kg · July" to "64.2 kg · today". 12 weekly points; chart y values (viewBox height 70): `[14,18,16,24,28,26,34,38,42,44,50,54]`; `[derived]` kg: 66.0, 65.82, 65.91, 65.55, 65.37, 65.46, 65.1, 64.92, 64.74, 64.65, 64.38, 64.2 (66.0 at y 14, 64.2 at y 54). FLAG: Profile says 61 kg, Blood donation page says 58 kg, Vitals says 64.2 kg. BMI check: 64.2 / 1.58² = 25.7.

### 11.7 Devices
Badge "Coming soon". Bluetooth BP monitor ("Last synced — · pair from phone app"); Glucometer ("Type readings in for now"); Phone health apps ("Steps and sleep · read-only"). Link: "Dr. Arun Nair is alerted when a reading is outside your target".

---

## 12. AI Health Chat (CitizenAIChat)

All AI output is simulated: header badge "Simulated"; answer badges "Guidance only" plus source chip.

```json
{
  "assistant": "CareFusion AI",
  "subtitle": "Uses your record only in this chat · nothing is shared",
  "messages": [
    { "me": true,  "text": "My lipid report came today. Is my cholesterol bad?", "time": "15:40" },
    { "me": false, "text": "Your LDL is 142 mg/dL, a little above the 100 your doctor aims for. HDL (48) and triglycerides (160) are close to normal. Atorvastatin usually takes 6–8 weeks to show its full effect, and you started it 3 weeks ago.", "src": "Lipid profile · 17 Oct", "time": "15:40" },
    { "me": true,  "text": "Should I take a higher dose?", "time": "15:41" },
    { "me": false, "text": "Only your doctor can change a dose. I can add this question to your next visit on 21 Oct with Dr. Arun Nair, or you can message him now.", "src": "Prescription · e-signed", "time": "15:41" }
  ],
  "suggestedQuestions": ["What does HbA1c mean?", "Side effects of Metformin", "Food tips for diabetes", "Explain my X-ray"],
  "simulatedReply": { "text": "Thanks — here is what your record shows. Your last 7 readings and current medicines suggest no urgent concern. If this changes or you feel unwell, contact your doctor or call 108.", "src": "Your record · simulated reply", "time": "15:52" },
  "shareReply": { "text": "I sent a summary of this chat to Dr. Arun Nair. He will see it in his Messages and before your visit on 21 Oct.", "src": "Shared with your doctor", "time": "15:53" },
  "shareEvent": { "type": "ai-chat-shared", "to": ["doctor"], "title": "AI chat shared · Anjali Menon", "text": "<last user question> · <n> messages" },
  "contextShown": ["Lipid profile · today", "3 active medicines", "30 days of home vitals", "Allergy: Penicillin"],
  "contextSwitch": "Use my record in this chat (default on)",
  "earlierChats": [
    { "title": "Chest X-ray result explained", "meta": "15 Oct · 6 messages" },
    { "title": "Can I fast during Onam with Metformin?", "meta": "2 Sep · 9 messages" },
    { "title": "Dengue warning signs", "meta": "12 Aug · 4 messages" }
  ],
  "safety": { "title": "Chest pain, trouble breathing or fainting?", "text": "Don't wait for the chat. Call for help now.", "phone": "tel:108", "button": "Call 108 ambulance" }
}
```
FLAG: here LDL = 142 (matches bus s4) but Documents "Lipid profile" says LDL 132. HDL 48, triglycerides 160 appear only here. Atorvastatin "started 3 weeks ago" vs past prescription 18 Aug 2026 (Medicines) lists Atorvastatin already (about 8.5 weeks). "3 active medicines" matches Rx RX-DEMO-88213 (Metformin, Atorvastatin, Vitamin D3).

---

## 13. Messages (CitizenMessages)

Filter tabs: All, Doctors, Hospitals, Labs. Thread list ordered as below. Placeholder for compose: "Write to {name}…". Thread date divider is the fixed text "Thursday, 15 October". Footer: "Attachments go into your Documents too". Badge "End-to-end encrypted". Pending attachment default: "BP log, Oct.pdf · 84 KB". Header copy: "Doctors reply within 2 working days — for emergencies call 108."

Message tuple: [from ("me" or "them"), text, attachment file, attachment size, meta].

```json
[
  { "name": "Dr. Arun Nair", "role": "General medicine · Demo General Hospital", "tone": "teal", "kind": "Doctors", "time": "14:30", "unread": 2, "msgs": [
    ["me",   "Doctor, my evening BP was 134/86 yesterday. I had missed the dose. Should I worry?", "", "", "You · 09:12 · Read"],
    ["them", "One higher reading after a missed dose is expected. Keep logging morning and evening for a week and share the log with me.", "", "", "Dr. Arun Nair · 11:40"],
    ["them", "I have also sent your updated prescription. The Atorvastatin dose stays the same for now.", "Prescription_15Oct.pdf", "e-Signed · 112 KB", "Dr. Arun Nair · 14:30"],
    ["them", "Please do the HbA1c test before your follow-up on 21 Oct.", "", "", "Dr. Arun Nair · 14:30"]
  ] },
  { "name": "Demo General Hospital", "role": "Appointments desk", "tone": "blue", "kind": "Hospitals", "time": "Wed", "unread": 1, "msgs": [
    ["them", "Your follow-up with Dr. Arun Nair is confirmed for Tue 21 Oct, 10:30, OP block 2. Token 14.", "", "", "Appointments · Wed 10:05"],
    ["me",   "Thank you. Is parking available?", "", "", "You · Wed 10:20 · Read"],
    ["them", "Yes — visitor parking near Gate 3 is free for the first 2 hours.", "", "", "Appointments · Wed 11:02"]
  ] },
  { "name": "Rahul Varghese", "role": "Lab technician · Demo Diagnostics", "tone": "peach", "kind": "Labs", "time": "Today", "unread": 0, "msgs": [
    ["them", "Your lipid profile is ready and added to your Documents.", "Lipid_profile_17Oct.pdf", "Lab report · 248 KB", "Rahul Varghese · 11:05"],
    ["me",   "Got it, thank you.", "", "", "You · 11:20 · Read"]
  ] },
  { "name": "Fathima Beevi", "role": "Radiology · Demo General Hospital", "tone": "lavender", "kind": "Labs", "time": "15 Oct", "unread": 0, "msgs": [
    ["them", "Your chest X-ray images are uploaded. Dr. Arun Nair will review and message you.", "CXR_PA_15Oct.dcm", "Image · 3.1 MB", "Fathima Beevi · 15 Oct"]
  ] },
  { "name": "Dr. Sreeja Paul", "role": "Ophthalmology · Taluk Hospital Adoor", "tone": "teal", "kind": "Doctors", "time": "2 Oct", "unread": 0, "msgs": [
    ["them", "Your retina check is normal. Repeat the eye check once a year because of diabetes.", "", "", "Dr. Sreeja Paul · 2 Oct"]
  ] },
  { "name": "Kerala Health Dept.", "role": "Announcements · no replies", "tone": "sage", "kind": "Hospitals", "time": "28 Sep", "unread": 0, "msgs": [
    ["them", "Free diabetes screening camp at PHC Konni on 25 Oct, 9:00–13:00. Bring your ABHA card.", "", "", "Kerala Health Dept. · 28 Sep"]
  ] }
]
```
Runtime: bus events `message` from `doctor` are appended to thread 0 with meta "Dr. Arun Nair · {at} · from Doctor app". Sending in a Doctors thread pushes bus `message` (title "Message from Anjali Menon", text "<draft or 'Sharing my BP log.'> · BP log, Oct.pdf"). Unread total = 3 (nav badge shows 1).
FLAGS: the doctor's "Prescription_15Oct.pdf" (15 Oct) vs Documents prescription dated 17 Oct; the doctor says "sent your updated prescription" on 14:30 and the BP message mentions "yesterday" evening 134/86 (table says 16 Oct 21:10, meaning the thread day is 17 Oct, not "Thursday, 15 October"); token 14 vs Care booking token calc 16.

---

## 14. Find care and appointments (CitizenCare)

Search box prefilled "General medicine"; location chip "Pathanamthitta · 10 km". Filter chips: All, Government, Private, Open now, Female doctor, Telemedicine (only All, Open now, Female doctor, Telemedicine show everything; Government/Private actually filter on type). Sorted by distance. Header: "Government OPs are free. Booking holds your token — pay any fees at the hospital."

### 14.1 Providers (`R`): [doctor, speciality, place, type, tone, next, languages, distance, fee]
```json
[
  ["Dr. Arun Nair",       "General medicine", "Demo General Hospital",               "Government", "teal", "Next: Tue 10:30",   "മലയാളം · English", "1.2 km", "Free OP"],
  ["Dr. Lakshmi Varma",   "Diabetology",      "District Hospital Kozhencherry",      "Government", "teal", "Next: Wed 09:00",   "മലയാളം · English", "4.8 km", "Free OP"],
  ["Dr. Thomas Kurian",   "Cardiology",       "Muthoot Medical Centre (demo)",       "Private",    "gold", "Next: Today 17:30", "English · हिन्दी",  "6.1 km", "₹500"],
  ["Dr. Anitha George",   "Family medicine",  "PHC Konni",                           "Government", "teal", "Walk-in today",     "മലയാളം",           "8.4 km", "Free OP"],
  ["Dr. Rajesh Menon",    "Endocrinology",    "Believers Hospital Tiruvalla (demo)", "Private",    "gold", "Next: Thu 11:00",   "English · தமிழ்",  "9.7 km", "₹600"]
]
```
Map shows 5 places within 10 km (a "you" pin and 5 pins).

### 14.2 Booking picker
- Days: `[["Mon","20"],["Tue","21"],["Wed","22"],["Thu","23"],["Fri","24"]]` (default index 1 = 21). FLAG weekday labels vs real calendar (20 Oct 2026 = Tue).
- Slots: `09:00, 09:15, 09:30, 09:45, 10:30, 10:45, 11:00, 11:15, 11:30` (default index 4 = 10:30); full (disabled) indexes 0, 2, 7 = 09:00, 09:30, 11:15. Caption "Morning OP · token system".
- Reasons: Follow-up visit, New problem, Test results, Prescription refill, Certificate. Switch "Share my key at check-in" - "Opens a 30-minute session when you arrive" (default on).
- Token formula in code: `8 + slotIndex*2` (10:30 gives 16). Seeded upcoming appointment says token 14. Fee shown from provider fee. Booking reference seed `DEMO-APT-58213`, then `DEMO-APT-<58213 + count>`.
- Booking event: type `booking`, to doctor and hospitaladmin, title "New booking · Anjali Menon", text "<Day> <date> Oct · <time> · <doctor> · token <n>", extra fields day, ref, doc, place, time. Confirmation: "Your token is held. We'll remind you the day before." and "Sent to {doctor}'s queue at {time}".

### 14.3 Upcoming and past
Upcoming (badge "N booked"): default row `{ d: "21", m: "Oct", title: "Dr. Arun Nair · follow-up", sub: "10:30 · OP block 2 · token 14", st: "Confirmed" }`, plus a fixed row: 30 Oct "HbA1c test · Demo Diagnostics" - "Walk-in 07:00–10:00 · fasting" - badge "Not booked" (warning). Booking progress for "Tue 21 Oct · Dr. Arun Nair": Step 2 of 3: Requested (done), Confirmed (done), Completed; note "Bring your fasting sugar log. Show your key at the OP desk — the doctor opens your record only then."

Past visits ("Last 6 months", all badge Done):
| Day | Mon | Title | Sub |
|-----|-----|-------|-----|
| 15 | Oct | Chest X-ray · Radiology | Demo General Hospital · report in Documents |
| 26 | Sep | Dr. Arun Nair · fever, cough | Prescription e-signed · follow-up set |
| 02 | Oct | Dr. Sreeja Paul · eye check | Taluk Hospital Adoor · normal |
| 11 | Aug | PHC Konni · dengue test | Negative · no follow-up needed |
FLAG: Reviews says "Visit 17 Oct" with Dr. Arun Nair while Care's past visit is 26 Sep; Dates shows Visit with Dr. Arun Nair on 17 Oct "14:20 · done"; the 02 Oct row is listed after 26 Sep (unsorted).

---

## 15. Medicines (CitizenMedicines, CitizenHome)

### 15.1 Today's schedule (Saturday 17 Oct)
```json
[
  { "slot": "Morning",   "time": "08:00", "items": [ { "id": "m0", "name": "Metformin 500 mg", "how": "1 tablet · after breakfast", "doneSeed": true }, { "id": "m1", "name": "Vitamin D3", "how": "Sundays only — not today", "doneSeed": false } ] },
  { "slot": "Afternoon", "time": "14:00", "items": [ { "id": "a0", "name": "Atorvastatin 10 mg", "how": "1 tablet · after lunch", "doneSeed": true } ] },
  { "slot": "Evening",   "time": "20:00", "items": [ { "id": "e0", "name": "Metformin 500 mg", "how": "1 tablet · after dinner", "doneSeed": false } ] },
  { "slot": "Night",     "time": "22:00", "items": [ { "id": "n0", "name": "Clotrimazole cream", "how": "Thin layer · last day", "doneSeed": false } ] }
]
```
Summary cards: "Taken today" `2` of 5 doses (hint "Next: Metformin at 20:00"); "Active prescriptions" `2` "From 2 doctors"; "Next refill" `24` Oct "Metformin · 7 days left"; "This month" `96%` on time, trend up "3% better than September". Home shows its own list (3 doses): `[Metformin 500 mg, After breakfast, 08:00], [Atorvastatin 10 mg, After lunch, 14:00], [Metformin 500 mg, After dinner, 20:00]`, with only index 0 taken, card "Medicines today" `1` of 3 taken, "Next: Metformin at 20:00". FLAG: 2 of 5 vs 1 of 3.

### 15.2 Prescriptions
```json
[
  {
    "id": "RX-DEMO-88213",
    "doctor": "Dr. Arun Nair", "speciality": "General medicine",
    "facility": "Demo General Hospital, Pathanamthitta", "date": "15 Oct 2026",
    "items": [
      { "name": "Metformin 500 mg tablet", "sig": "1 – 0 – 1 · after food · 30 days", "left": "16 left", "icon": "teal" },
      { "name": "Atorvastatin 10 mg tablet", "sig": "0 – 1 – 0 · after lunch · 30 days", "left": "22 left", "icon": "teal" },
      { "name": "Vitamin D3 60,000 IU sachet", "sig": "Once a week · Sunday morning · 8 weeks", "left": "5 left", "icon": "blue" }
    ],
    "validUntil": "14 Nov 2026",
    "allergyCheck": "Allergy check passed: no penicillin-group medicines.",
    "status": "Dispensed 13:20 (after bus event s8) / Sent to pharmacy 10:05 (after s2) / Signed",
    "badge": "e-Signed · verified"
  },
  {
    "id": "RX-DEMO-87140", "style": "gold",
    "doctor": "Dr. Sreeja Paul", "speciality": "Dermatology",
    "facility": "Demo Taluk Hospital, Adoor", "date": "2 Oct 2026",
    "items": [ { "name": "Clotrimazole 1% cream", "sig": "Apply twice daily · 14 days", "badge": "Ends 16 Oct", "icon": "peach" } ],
    "journey": [ ["Signed by doctor","2 Oct · 11:40"], ["Verified by pharmacist","2 Oct · 12:05"], ["Dispensed · Adoor","2 Oct · 12:10"], ["Course ends","16 Oct"] ]
  }
]
```
Journey for Dr. Arun Nair's prescription (header "Dr. Arun Nair's prescription · journey", date 15 Oct): Signed by doctor "15 Oct · 10:05" (done); Verified by pharmacist "17 Oct · 13:12" (done); Ready to collect "17 Oct · 13:20" (done); Refill due "24 Oct". Tiles: Interaction check "No conflicts found"; Prescription ID `RX-DEMO-55120` (FLAG: differs from RX-DEMO-88213 for the same prescription). Ready-to-collect banner text: `{title}` / `{text}` + " · collected with your rotating key, no paper needed" with link "Track at pharmacy" to Pharmacist.dc.html.
Bus s2 text quantities "Metformin 500 mg ×60, Atorvastatin 10 mg ×30" match 1-0-1 for 30 days and 0-1-0 for 30 days, but Vitamin D3 is missing from the bus text and the Home "Prescription journey" (2 drugs only).

### 15.3 Refill reminders
Metformin 500 mg: "7 days left · refill by 24 Oct", ring 27/113 (about 24 percent filled), button Find. Atorvastatin 10 mg: "22 days left · refill by 8 Nov", ring 83/113. Switch "Remind me 3 days before" - "SMS and app notification" (default on). FLAG: "Metformin 16 left" with 1-0-1 would be 8 days, but screen says 7 days left; Dates shows 9 Oct "Atorvastatin refill: Collected".

### 15.4 AI medicine note
Module "Medicine guidance · AI", status verified: title "Metformin is best taken with food" - "Taking it with meals lowers stomach upset. If you miss a dose, skip it — don't take two together. Ask your doctor before changing anything."

### 15.5 Your pharmacy
Demo Hospital Pharmacy, badge "Open till 20:00", "Counter 2 · Joseph Mathew · 1.2 km", Token `P-042`, Queue "3 ahead · ~8 min". Links: See queue; Message pharmacist.

### 15.6 Stock search (`SH`: name, meta, stock, price, kind, dot)
Search prefill "Metformin 500 mg"; radius options 5 km, 10 km, 25 km, Whole district; filters All, Government only, Open now; note "Live from government and registered private pharmacies · updated 5 min ago".
```json
[
  ["Demo Hospital Pharmacy (Govt)",       "1.2 km · open till 20:00 · Jan Aushadhi",       "In stock · 400", "₹18", "gov", "dotg"],
  ["Jan Aushadhi Kendra, Pathanamthitta", "2.0 km · open till 21:00",                       "In stock · 120", "₹16", "gov", "dotg"],
  ["Medline Pharmacy, Kozhencherry",      "4.6 km · open 24 hours",                         "Low · 18",       "₹42", "pvt", "doty"],
  ["Karunya Community Pharmacy",          "6.1 km · opens 08:00 tomorrow",                  "Out of stock",   "—",   "gov", "dotr"]
]
```
Home hint: "Atorvastatin is in stock at Demo Hospital Pharmacy, 1.2 km · open till 20:00" (stock table above is for Metformin).

### 15.7 Past prescriptions (table: Date, Doctor, Medicines, Status)
```json
[
  { "date": "18 Aug 2026", "doc": "Dr. Arun Nair",   "med": "Metformin 500 mg, Atorvastatin 10 mg", "st": "Completed" },
  { "date": "12 Jul 2026", "doc": "Dr. Meera Krishnan", "med": "Azithromycin 500 mg (3 days)",      "st": "Completed" },
  { "date": "30 May 2026", "doc": "Dr. Arun Nair",   "med": "Metformin 500 mg",                     "st": "Replaced" },
  { "date": "04 Mar 2026", "doc": "Dr. Sreeja Paul", "med": "Cetirizine 10 mg",                     "st": "Completed" }
]
```

### 15.8 Home "Prescription journey" widget
Text: "Metformin 500 mg, Atorvastatin 10 mg · e-signed by Dr. Arun Nair today". Four steps: 1 Prescribed - "Dr. Arun Nair e-signed" (Doctor app); 2 Sent to pharmacy - "Signature and QR checked" (Pharmacy queue); 3 Ready to collect - "Packed by Joseph Mathew" (Dispensing log); 4 Collected - "Show your key at the counter" (My medicines). Stage = 4 if a `collected` event exists, 3 if `dispensed`, 2 if `prescription`, else 1. With seed data stage = 3; badge texts by stage: "Waiting for doctor", "At pharmacy", "Ready to collect", "Collected". Footer "Pharmacy 1.2 km · open till 20:00".

---

## 16. Blood donation (CitizenBlood)

```json
{
  "donorId": "DEMO-BD-KL-30417",
  "bloodGroup": "B+",
  "status": "Registered · resting",
  "available": true,
  "lastDonation": "4 Aug 2026, Demo General Hospital blood bank",
  "nextEligible": "2 November",
  "intervalRule": "Whole blood needs 90 days between donations for women.",
  "restProgress": "74 of 90 days of rest done",
  "countdown": { "days": 16, "hours": 9, "minutesSeed": 42 },
  "stats": { "donationsSince2019": 7, "livesTouched": "up to 21", "haemoglobinGdL": 12.8, "haemoglobinNote": "At last donation · ≥12.5 needed", "bloodGivenLitres": "3.1 L", "tier": "Silver donor", "tierNote": "3 more donations to reach Gold · recognised by Kerala State Blood Transfusion Council (demo)", "nextEligibleBar": "2 Nov · 15 days (83%)" },
  "eligibilityTiles": [ { "k": "Age", "v": "34 · eligible 18–65" }, { "k": "Weight", "v": "58 kg · ≥ 45 kg" }, { "k": "Diabetes", "v": "Allowed on tablets" }, { "k": "Last illness", "v": "None in 4 weeks" } ],
  "checklist": [ "Eat a meal and drink water 2 hours before (default checked)", "Carry your ABHA card or show this app" ]
}
```
Card "Requests nearby": open count (starts at 3 + injected), hint "Within 25 km · B+ or O+".

### 16.1 Requests (`R`): [where, meta, badge, tone, urgent]
```json
[
  ["Demo Medical College, Kottayam",        "B+ · 2 units · surgery today 18:00 · 31 km",         "Urgent",    "danger",  true],
  ["Demo General Hospital, Pathanamthitta", "B+ · 1 unit · thalassaemia patient · 3.2 km",        "This week", "warning", false],
  ["Demo Taluk Hospital, Adoor",            "B+ / O+ · camp on 8 Nov · 18 km",                    "Camp",      "teal",    false]
]
```
Plus live bus `blood-request` items (up to 2, from s10): where = text before first " · " ("Demo General Hospital"), meta = "B+ · 2 units · surgery tomorrow 08:00", badge "From doctor · 14:30", tone danger, button "I can donate", with response event `blood-response` (title "Donor available · B+ · Anjali Menon", text "Responding to: B+ · 2 units · can reach in 40 min", to doctor and district). Other buttons: "Pledge for camp", "I can't donate — notify my circle", "Withdraw", "Share request". Notes: "Live request from the Doctor app", "After your rest period ✓", "Resting until 2 Nov", "Blood bank has your contact for 48 h". Alert: "You're resting until 2 Nov - You can still share requests with family and friends, or pledge for a date after 2 Nov."

### 16.2 Donation history
| Date | Type | Place |
|------|------|-------|
| 4 Aug 2026 | Whole blood | Demo General Hospital, Pathanamthitta · Hb 12.8 |
| 22 Mar 2026 | Whole blood | Camp · St. Thomas College, Kozhencherry |
| 9 Oct 2025 | Platelets | Demo Medical College, Kottayam · emergency request |
| 14 Jan 2025 | Whole blood | Demo Taluk Hospital, Adoor |
| (summary) | 3 more since 2019 | All certificates saved in Documents |
(4 listed + 3 more = 7, matches 7 donations.) FLAG: interval between 22 Mar and 4 Aug 2026 is 135 days (ok), but Dates says "3 months since 02 Aug".

### 16.3 Blood bank stock, Pathanamthitta district (units today)
`[group, units, level, mine]`: A+ 42 hi, A− 4 lo, B+ 11 md (mine), B− 2 lo, O+ 58 hi, O− 3 lo, AB+ 15 md, AB− 1 lo. Level labels: lo "Critical", md "Low", hi "Good". Note: "Short this week: O− and AB−. Your group (B+) is stable. Stock is pooled from 6 blood banks and updated every hour." FLAG: B+ at 11 units is labelled "Low" while note says B+ stable.

---

## 17. Organ and tissue pledge (CitizenOrgan)

```json
{
  "badges": ["Step 3 of 4 · signing pending", "KNOS · Kerala"],
  "steps": ["Your intent", "Family informed", "Sign at hospital", "Registered with KNOS"],
  "currentStepIndex": 2,
  "lastStepAlert": "Take your ABHA card to Demo General Hospital, Pathanamthitta (organ donation desk, ground floor · Mon–Sat, 09:00–16:00). Two witnesses sign with you.",
  "organs": [
    { "key": "kidneys",  "name": "Kidneys",       "note": "Most needed · 2,800 waiting in Kerala", "selectedSeed": true },
    { "key": "liver",    "name": "Liver",         "note": "Can help two people",                    "selectedSeed": false },
    { "key": "heart",    "name": "Heart",         "note": "Within 4–6 hours",                       "selectedSeed": false },
    { "key": "lungs",    "name": "Lungs",         "note": "Within 6–8 hours",                       "selectedSeed": false },
    { "key": "pancreas", "name": "Pancreas",      "note": "For type 1 diabetes",                    "selectedSeed": false },
    { "key": "corneas",  "name": "Corneas",       "note": "Up to 6 hours after death",              "selectedSeed": true },
    { "key": "skin",     "name": "Skin",          "note": "For burns patients",                     "selectedSeed": false },
    { "key": "bone",     "name": "Bone & tissue", "note": "Joints, tendons, valves",                "selectedSeed": false }
  ],
  "bodyDonationOption": "Also donate my body for medical education - Handled by Demo Medical College, Kottayam (unchecked)",
  "donorCard": { "name": "Anjali Menon", "abha": "DEMO-0000-1234", "blood": "B+", "pledged": "Kidneys, corneas", "callFamily": "Ravi Menon · +91 9•••• ••482" },
  "statePledges": { "count": "1,84,210", "note": "people have pledged · demo figure", "barPercent": 64, "caption": "Each donor can help up to 8 people. Your pledge stays private until it is needed." },
  "familyAndWitnesses": [
    { "name": "Ravi Menon",      "role": "husband",   "note": "Next of kin · informed 12 Oct by SMS link", "badge": "Acknowledged" },
    { "name": "Sarojini Menon",  "role": "mother",    "note": "Witness 1 · will come to the hospital",     "badge": "Signing pending" },
    { "name": "Thomas Kurian",   "role": "neighbour", "note": "Witness 2 · not a relative",                "badge": "Signing pending" }
  ],
  "witnessSignatures": "1 of 2 signed (bar 50%)",
  "witnessNote": "Under the Transplantation of Human Organs Act, two witnesses sign — one must be a close relative. Ravi has signed; Sarojini's link expires on 24 Oct.",
  "facts": [
    { "title": "Only after death is certified", "text": "Brain-stem death is certified by a board of 4 doctors, none from the transplant team." },
    { "title": "Your family still decides", "text": "Doctors ask your next of kin. A pledge helps them say yes with confidence." },
    { "title": "You can withdraw any time", "text": "One tap here, no reason needed. We tell KNOS within 24 hours." },
    { "title": "No payment, no sale", "text": "Buying or selling organs is a crime. Allocation follows the state waiting list." }
  ]
}
```
Header: "A pledge records your wish. Under the Transplantation of Human Organs and Tissues Act, 1994, your family is still asked for consent at the time — so tell them now." Home mirror: "Organ pledge - Kidneys, corneas · signing at hospital pending". FLAG: "Ravi has signed" vs statement "Sarojini Menon ... Signing pending" and "Thomas Kurian ... Signing pending" with "1 of 2 signed" (Ravi is not listed as a witness, he is next of kin; so who signed?). Card phone mask differs.

---

## 18. Alerts and notifications (CitizenAlerts)

### 18.1 Static alerts (`A`): [type, title, body, meta, icon, kind badge, tone, iconClass, action]
Category (tab) derivation: `emg`/`dept` rows go to "alerts" tab; `sys` to "updates"; `care` rows in order go to updates, updates, reminders, reminders; a row whose title contains "camp" goes to reminders. Unread seed: rows index 0-3 unread, index 4-7 already read.
```json
[
  { "i": 0, "type": "emg",  "title": "Heatwave warning — Pathanamthitta", "body": "Stay indoors 12:00–16:00, drink water every hour, check on elderly neighbours. Cooling centre open at Demo General Hospital.", "meta": "Kerala State Disaster Management Authority · 11:20 today", "icon": "warn", "kind": "Emergency", "tone": "danger", "ic": "ic t-red", "action": null, "tab": "alerts", "read": false },
  { "i": 1, "type": "dept", "title": "Dengue cases rising in your ward", "body": "Remove standing water near your home. Free fever check at PHC Omalloor, 9–1, all week.", "meta": "Directorate of Health Services, Kerala · 09:05 today", "icon": "bell", "kind": "Health dept", "tone": "info", "ic": "ic t-blue", "action": ["Find PHC", "care"], "tab": "alerts", "read": false },
  { "i": 2, "type": "care", "title": "New lab result: Lipid profile", "body": "Rahul Varghese uploaded your result to Dr. Arun Nair's order. Your doctor will review it.", "meta": "Demo General Hospital lab · 11:05 today", "icon": "doc", "kind": "My care", "tone": "teal", "ic": "ic t-teal", "action": ["Open result", "documents"], "tab": "updates", "read": false },
  { "i": 3, "type": "care", "title": "Dr. Arun Nair opened your record", "body": "Using your key, inside the hospital. Session ends at 15:00 unless you end it first.", "meta": "Access log · 14:24 today", "icon": "eye", "kind": "My care", "tone": "teal", "ic": "ic t-teal", "action": ["See session", "access"], "tab": "updates", "read": false },
  { "i": 4, "type": "care", "title": "Appointment confirmed — Tue 21 Oct, 10:30", "body": "Follow-up with Dr. Arun Nair, OP block 2. Bring your glucose diary.", "meta": "Demo General Hospital · yesterday", "icon": "cal", "kind": "My care", "tone": "teal", "ic": "ic t-teal", "action": ["View", "dates"], "tab": "reminders", "read": true },
  { "i": 5, "type": "care", "title": "Metformin refill due in 7 days", "body": "In stock at Demo Hospital Pharmacy, 1.2 km.", "meta": "Reminder · yesterday", "icon": "pill", "kind": "My care", "tone": "teal", "ic": "ic t-teal", "action": ["Find stock", "medicines"], "tab": "reminders", "read": true },
  { "i": 6, "type": "sys",  "title": "New sign-in on Android phone", "body": "Samsung Galaxy A54 · Pathanamthitta. Not you? Sign it out from Settings.", "meta": "Security · 15 Oct", "icon": "shield", "kind": "System", "tone": "neutral", "ic": "ic t-gold", "action": ["Review", "settings"], "tab": "updates", "read": true },
  { "i": 7, "type": "dept", "title": "Blood donation camp — 8 Nov", "body": "Demo Taluk Hospital, Adoor. You become eligible again on 2 Nov.", "meta": "Kerala State Blood Transfusion Council · 14 Oct", "icon": "drop", "kind": "Health dept", "tone": "info", "ic": "ic t-blue", "action": ["Open", "blood"], "tab": "reminders", "read": true }
]
```
Live rows from the bus (non-citizen senders, unread by default): s2 prescription (kind "My care", tab updates), s5 break-glass (kind "Access", tone warning, tab updates), s8 dispensed (kind "Pickup", tone success, tab reminders), s10 blood-request (kind "Blood request", tone danger, tab alerts). s4 and s6 are hidden as duplicates of static rows 2 and 0. Meta for live rows: "{sender label} · {at} today". Initial totals: 12 notifications (8 static + 4 live), 8 unread (static rows 0-3 plus the 4 live rows). Tab counts: All 12; Alerts 3 (static rows 0 and 1, live s10); Updates 5 (static rows 2, 3, 6, live s2, s5); Reminders 4 (static rows 4, 5, 7, live s8). Segment tabs: All, Alerts, Updates, Reminders; checkbox "Unread only"; button "Mark all as read" (toast "All marked read" - "{n} notifications cleared · emergency alerts stay pinned on Home").

Map card: "Active in your area" badge "1 emergency", caption "You · Pathanamthitta town · Heat index 41°C until 16:00".

### 18.2 Preferences ("What reaches you")
Locked line: "Emergency alerts are always on — required by the Disaster Management Act."
| Switch | Description | Default |
|--------|-------------|---------|
| Health department notices | Outbreaks, vaccine drives, camps | on |
| My care | Appointments, results, prescriptions, refills | on |
| Who opened my record | Tell me each time a doctor or staff opens it | on |
| Blood requests | Only when you're eligible and available | off |
| Quiet hours 22:00–07:00 | Emergencies still ring | on |
Send by options: `App + SMS`, `App only`, `App + SMS + WhatsApp`, `SMS only (no smartphone)`.

FLAGS: appointment alert says "Tue 21 Oct"; Home heatwave alert text says "Can't be muted." Session end time "15:00" conflicts with 30-minute rule.

Home "Health alerts" box: danger "Heatwave — Pathanamthitta: Emergency alert · stay indoors 12:00–16:00. Can't be muted."; info "Dengue season: Kerala health department · remove standing water near your home."

---

## 19. Settings (CitizenSettings)

- Languages: `[ml, "മലയാളം", "Malayalam"], [en, "English", "English"], [hi, "हिन्दी", "Hindi"]`; default `en`. Switches: "Read screens aloud" (off; "Uses your phone's voice in the language above"); "Show medical terms in English too" (on; "e.g. “പ്രമേഹം (Diabetes)” in reports and chat"). SMS preview: Malayalam "നാളെ 10:30-ന് ഡോ. അരുൺ നായരുമായി അപ്പോയിന്റ്മെന്റ്." and English "Appointment with Dr. Arun Nair tomorrow at 10:30."
- Text size options (index, aria): 0 Small, 1 Default (selected), 2 Large, 3 Extra large. Preview line "Your next appointment is on Tuesday 21 October at 10:30 with Dr. Arun Nair." Switches: High contrast (off), Reduce motion (off).
- Security (badge "Strong"): Password "Changed 42 days ago"; Two-step sign-in "OTP to +91 9•••• ••871" (on); "Face check on new devices" - "Same as your registration check" badge "On". Change-password modal: current, new ("12+ characters, not used before").
- Signed-in devices: 
```json
[
  { "name": "Pixel 7 · Chrome",                  "meta": "Pathanamthitta · active now",       "current": true },
  { "name": "Samsung Galaxy A54 · CareFusion app", "meta": "Pathanamthitta · 15 Oct, 21:10", "current": false },
  { "name": "Windows laptop · Edge",             "meta": "Kochi · 2 Oct, 10:44",               "current": false }
]
```
  Action "Sign out all others".
- Notifications: Appointment reminders (on; "1 day and 2 hours before"), Medicine reminders (on; "At each dose time"), Monthly health summary (off; "Email on the 1st").
- Privacy: Emergency card without key (on), Use my data for research (off; "Anonymised, for Kerala public health studies"), Let AI read my documents (on; "Only to answer your own questions").
- Your data: "Documents 24 · 38 MB", "Last export Never"; export states: "Prepare my download" -> "Preparing… we'll SMS you" -> "Download ZIP (41 MB)"; ZIP has a FHIR file and PDFs.
- Delete account: "Your login and app data are removed after 30 days. Hospital records stay with hospitals as the law requires, and your ABHA number is not deleted." Modal: Aadhaar OTP confirm, type DELETE.
- Saved indicator "All changes saved".

---

## 20. Reviews (CitizenReviews)

Hospital summary (Demo General Hospital, badge Government): average `4.3` (4.4 after the citizen posts), "1284 reviews" (+ own), distribution 5★ 64%, 4★ 22%, 3★ 8%, 2★ 4%, 1★ 2%; tiles `212` Verified reviews, `86%` Get a hospital reply, `1.6 days` Average reply time. FLAG: 212 verified vs 1284 reviews; the distribution implies 4.42.
"What people mention" (last 90 days): Doctors explain clearly 88%, Clean wards 76%, Pharmacy had stock 71%, OP waiting time OK 48%. Popular words: kind, explained well, clean, crowded OP (warning), free medicines.
Visits the citizen can review: Dr. Arun Nair "Visit 17 Oct · General medicine" (initials AN); Demo Hospital Pharmacy "Collected 12 Oct" (PH); Hospital lab · Rahul Varghese "Lipid profile 17 Oct" (LB). FLAG: pharmacy collected 12 Oct vs prescription ready to collect 17 Oct.

### 20.1 Reviews (`REVIEWS`): [name, hospital, location, department, stars, date, text, replyBy, reply, helpful]
```json
[
  ["Sreelatha K.", "Demo General Hospital", "Pathanamthitta", "General medicine", 5, "12 Oct", "Dr. Arun Nair explained my sugar report slowly and in Malayalam. The token system meant I waited only 20 minutes.", "Dr. Meera Krishnan", "Thank you — we will share this with the OP team.", 18],
  ["Biju M.", "Demo General Hospital", "Pathanamthitta", "Pharmacy", 4, "10 Oct", "Medicines were ready when the app said. One brand was out of stock, but they gave an approved substitute.", "", "", 9],
  ["Fousiya A.", "District Hospital Kozhencherry", "Kozhencherry", "Diabetology", 5, "8 Oct", "Dr. Lakshmi Varma checked my feet and eyes in one visit. Clean ward, helpful nurses.", "", "", 14],
  ["Rajan T.", "Demo General Hospital", "Pathanamthitta", "Lab", 3, "6 Oct", "Results came on the app the same afternoon, but the sample queue was long at 8 am.", "Lab supervisor", "We have opened a second collection counter from 7:30.", 6],
  ["Mini J.", "PHC Konni", "Konni", "Family medicine", 5, "2 Oct", "Walk-in dengue test with no waiting. The ASHA worker helped my mother register on the app.", "", "", 11],
  ["Thomas V.", "Taluk Hospital Adoor", "Adoor", "Orthopaedics", 2, "29 Sep", "Good doctor, but the X-ray machine was down and I had to come back the next day.", "Hospital admin", "The machine was repaired on 30 Sep. Sorry for the trouble.", 4],
  ["Lekha R.", "Demo General Hospital", "Pathanamthitta", "Radiology", 4, "25 Sep", "Chest X-ray done quickly. The report was easy to read with the AI summary marked clearly as not final.", "", "", 7],
  ["Ancy P.", "District Hospital Kozhencherry", "Kozhencherry", "Paediatrics", 5, "20 Sep", "Diya’s vaccine was on time and the nurse explained side effects. Reminder came the day before.", "", "", 12]
]
```
Filters: Location (All locations, Pathanamthitta, Kozhencherry, Konni, Adoor); Department (All departments, General medicine, Diabetology, Pharmacy, Lab, Radiology, Family medicine, Orthopaedics, Paediatrics); Sort (Most recent, Highest rated, Most helpful); rating chips (Any rating, 5 ★, 4 ★ & up, 3 ★ & up, 2 ★ & up). First page shows 4, "Load more" adds 3. Star tags: 5 Excellent (success), 4 Good (teal), 3 Okay (warning), 2 Poor (danger), 1 Bad (danger). Write-review: default rating 4, departments (General medicine, Pharmacy, Lab, Radiology, OP registration, Ward care), 600-character limit, checkbox "Show my first name only" ("Your ABHA number is never shown"). Posted row: name "Anjali M. (you)", location Pathanamthitta, dept "General medicine", date "Today"; bus event `review` (to hospitaladmin, doctor; title "New <n>★ review · <target>"). Default review text if empty: "Clear explanation and short wait. The app reminder helped."
FLAG: reviewer Ancy P. says "Diya’s vaccine" (matches daughter's name Diya, a privacy-style coincidence); Dr. Meera Krishnan replies as hospital admin.

---

## 21. Complaints (CitizenComplaints)

Header: "The hospital admin answers within 7 days; the district health office sees every complaint." Badge "Helpline 1800-000-0000 (demo)". Open count = complaints with stage < 2 (starts at 1).

### 21.1 Existing complaints
Stage 0 Filed (warning), 1 Under review (warning), 2 Resolved (success).
```json
[
  { "ref": "CMP-0412", "title": "Long OP wait", "place": "Demo General Hospital", "date": "14 Oct", "stage": 1, "log": [
      ["You", "Filed: waited 2 h 40 min at OP block 2", "14 Oct, 14:02"],
      ["Dr. Meera Krishnan", "Reviewing OP token data for that day", "15 Oct, 10:20"] ] },
  { "ref": "CMP-0377", "title": "Medicine out of stock", "place": "Demo Hospital Pharmacy", "date": "28 Sep", "stage": 2, "log": [
      ["You", "Filed: Atorvastatin unavailable twice", "28 Sep, 11:40"],
      ["Suma Thomas", "Stock reorder approved", "29 Sep, 09:15"],
      ["Suma Thomas", "Resolved: stock now shown live in the medicine finder", "2 Oct, 16:00"] ] },
  { "ref": "CMP-0301", "title": "Rude behaviour at registration", "place": "Taluk Hospital Adoor", "date": "3 Sep", "stage": 2, "log": [
      ["You", "Filed", "3 Sep, 10:05"],
      ["Hospital admin", "Staff counselled; apology sent", "6 Sep, 12:30"] ] },
  { "ref": "CMP-0266", "title": "Lab report delayed", "place": "PHC Konni", "date": "12 Aug", "stage": 2, "log": [
      ["You", "Filed", "12 Aug, 09:00"],
      ["Lab supervisor", "Report uploaded; delay due to courier", "13 Aug, 15:20"] ] }
]
```
New complaint ref formula: `CMP-0` + (413 + number of complaints), i.e. next is `CMP-0417`. Bus s9 event matches CMP-0412 ("Complaint filed · long OP wait", 14:02). Runtime `complaint-update` events from the admin update a matching ref.

### 21.2 Form options
- Category: Long waiting time (default), Medicine not available, Staff behaviour, Cleanliness, Billing or fees, Privacy — record opened wrongly, Lab or report delay, Other.
- Where: Demo General Hospital, Pathanamthitta (default); Demo Hospital Pharmacy; District Hospital Kozhencherry; PHC Konni; Taluk Hospital Adoor.
- Seriousness: Normal (default), Urgent — affecting my treatment, Safety concern. Date of visit default `2026-10-17`. Textarea limit 1000 characters. Attach proof examples: op-token-slip.jpg 412 KB, pharmacy-bill.pdf 96 KB, photo-ward.png 1.2 MB. Consent text: "The hospital may call me about this" - "+91 ••••• 43210 · 09:00–18:00".
- Process: Within 24 h admin acknowledges; within 7 days reply; day 8 escalates to district. Who handles it: 1 Hospital admin (replies within 2 days), 2 District health office (sees every complaint, steps in after 7 days), 3 State grievance cell. Success text: "Complaint {ref} filed - Dr. Meera Krishnan (hospital admin) and the Pathanamthitta district office were notified at {time}."
- Access tie-in: Access screen button "Report an open" goes to complaints; category "Privacy — record opened wrongly".
- Demo advance buttons: "Simulate next update" -> "Under review · assigned to OP in-charge" then "Resolved · second token counter opened 07:30–10:00" (both by Dr. Meera Krishnan); resolved can be "Reopen (demo)": "Reopened: still waiting over 2 hours".

---

## 22. Cross-screen inconsistencies (decisions needed before seeding)

1. Weekday: all text says "Tue 21 Oct" (Care days Mon 20 / Tue 21, bus s1, Messages, Alerts, Settings, AI chat) but 21 Oct 2026 is a Wednesday (the Dates calendar itself computes 21 = Wed). Recommend: seed the appointment on Wed 21 Oct 2026 and fix labels, or move the demo year/date.
2. Appointment token: seeded "token 14" (Messages, Care upcoming) vs booking formula giving 16 for 10:30.
3. Documents count: Home "24", Settings "24 · 38 MB", Access "18 reports since 2023" and "9 e-signed prescriptions", Documents screen has 10 rows and 186 MB storage, export ZIP 41 MB. Home says "3 added by doctors this week".
4. Lipid profile LDL: 142 (bus s4, AI chat) vs 132 (Documents summary). HDL 48 and triglycerides 160 only in AI chat.
5. HbA1c: 7.4% on 04 Oct, down from 7.9% in June (Documents, Profile special-category proof) vs 6.9% on 12 Sep (Vitals tile); Dates shows a "done" HbA1c on 3 Oct; next HbA1c 30 Oct; bus s3 shows an HbA1c lab order on the same day as lipid profile (17 Oct) and Messages say "do the HbA1c before 21 Oct".
6. Prescription identity: 15 Oct (Medicines RX-DEMO-88213, Messages Prescription_15Oct.pdf) vs 17 Oct (Documents, Home "today", bus s2 at 10:05); second ID RX-DEMO-55120 for the same prescription; bus lists 2 drugs, Documents/Medicines list 3 (adds Vitamin D3); Atorvastatin timing "at night" (Documents) vs after lunch 14:00 (Medicines, Home); Medicines "Active prescriptions: 2 from 2 doctors" but the Clotrimazole course ends 16 Oct (yesterday) yet scheduled tonight "last day".
7. Dr. Sreeja Paul speciality: Dermatology (Rx), Ophthalmology (Messages), eye check (Care, Dates "Diabetic eye screening" at Kozhencherry on 28 Oct), plus break-glass doctor for another patient.
8. Dr. Meera Krishnan is hospital admin (Complaints/Reviews) and also a prescribing doctor (past Rx 12 Jul 2026).
9. Thomas Kurian: private cardiologist (Care), neighbour/witness (Organ), unconscious Bed 7 patient (bus s5, s7). Decide distinct people or rename.
10. Mother: Sarala Nair (Profile) vs Sarojini Menon (Organ).
11. Phone masks for the citizen: `+91 98XXX X4410` (Profile), OTP to `+91 9•••• ••871` (Settings), `+91 ••••• 43210` (Complaints). Ravi: `+91 94XXX X2207` (Profile) vs `+91 9•••• ••482` (Organ).
12. Age: Born 12 Jun 1988 (38 y) vs Blood page "Age 34". Weight: 61 kg (Profile), 58 kg (Blood), 64.2 kg (Vitals).
13. Last blood donation: 4 Aug 2026 (Blood) vs "3 months since 02 Aug" (Dates) vs "02 Nov" eligibility (90 days from 4 Aug = 2 Nov). Countdown "16 days 9 hours" vs "15 days" elsewhere. Blood "Donations 7 since 2019".
14. Session timing: started 14:24, 30-minute limit, but "18:42 left" and Alerts "ends at 15:00"; "now" is about 15:52.
15. Medicines taken today: 2 of 5 (Medicines) vs 1 of 3 (Home).
16. BP highest: "134/86 · 9 Oct" (tile) vs 16 Oct 21:10 (table row; "missed evening dose yesterday" in Messages).
17. Dates month summary says Tests = 2 but 3 tests are in the calendar; Refills 2 matches (9 Oct Atorvastatin collected, 24 Oct Metformin).
18. Reviews: "1284 reviews" vs "212 Verified reviews"; average 4.3 vs 4.42 from the distribution.
19. Past visits: Dr. Arun Nair visit "26 Sep fever, cough" (Care), "Visit 17 Oct" (Reviews, Dates 17 Oct 14:20), discharge summary 22 Sep ("3-day stay for chest infection") at Taluk Hospital, Kozhencherry.
20. Pharmacy: reviews "Collected 12 Oct" and Access history 12 Oct 17:12 Joseph Mathew "Prescription scan" vs dispensed event s8 on 17 Oct 13:20 and journey "Verified 17 Oct 13:12".
21. Event bus s5 leaks another patient's name into the citizen's feed and becomes a row in Anjali's access history (see 5 and 7.4). Access history already has a break-glass row for 21 Sep 02:48 (Dr. Vinod K.) about Ravi's accident.
22. Distance and weather: Home "29°C, humid", Alerts "Heat index 41°C", cooling centre.
23. Bus times have no dates: s2 10:05 (today), s8 13:20, s9 14:02 (complaint CMP-0412 is dated 14 Oct in the Complaints screen).
24. Naming variants: "Demo Taluk Hospital, Adoor" / "Taluk Hospital Adoor" / "Demo Taluk Hospital" ; lab: "Demo General Hospital lab" / "Demo Diagnostics" / "Hospital lab"; "Demo Hospital Pharmacy" vs "Demo Hospital Pharmacy (Govt)".
25. Blood stock B+ 11 units labelled "Low" while text says B+ is stable.
26. Organ: "Ravi has signed" but witnesses listed are Sarojini and Thomas; "1 of 2 signed".

---

## 23. Identifier audit

Identifiers in the design (all must remain DEMO-style):

| Identifier | Value | Verdict |
|------------|-------|---------|
| ABHA number | `DEMO-0000-1234` | OK, cannot pass as a real 14-digit ABHA |
| ABHA address | `anjali.m@abdm` | FLAG: looks like a real ABHA address handle (`@abdm`). Suggest `anjali.m@demo-abdm` or `anjali.m@demo` |
| Aadhaar display | `XXXX XXXX 4821` | FLAG: shows the last 4 digits of an Aadhaar-format value. Rule 2 says tokens only, no raw Aadhaar. Suggest an opaque token such as `DEMO-AADHAAR-TOKEN-4821` or hide the field |
| Mobile | `+91 98XXX X4410`; `+91 9•••• ••871`; `+91 ••••• 43210`; Ravi `+91 94XXX X2207`, `+91 9•••• ••482`; Sarala `+91 98XXX X9031` | Masked, but use one consistent fake number format (e.g. +91 90000 00001 range) or keep masked and unify |
| Blood donor ID | `DEMO-BD-KL-30417` | OK |
| Lab order | `DEMO-L-5521` | OK |
| Imaging order | `DEMO-R-2210` | OK |
| Appointment ref | `DEMO-APT-58213` (+1 each) | OK |
| Prescription ids | `RX-DEMO-88213`, `RX-DEMO-87140`, `RX-DEMO-55120` | OK (dedupe 55120) |
| Complaint tickets | `CMP-0412`, `CMP-0377`, `CMP-0301`, `CMP-0266`, next `CMP-0417` | OK (non-DEMO prefix, but not an official format) |
| Pharmacy token | `P-042` | OK |
| Helpline | `1800-000-0000 (demo)` | OK |
| Ambulance | `tel:108`, text "Call 108 ambulance" | 108 is the real emergency ambulance number; acceptable but is a live number in a link. Consider a demo notice |
| Share-key | 6-digit numbers (`482913`, `739204`) | OK (random) |
| PM-JAY | "PM-JAY e-card", "Ayushman Bharat", ₹5 lakh | Real scheme names (no logo). Review against rule 4 |

Real organisation names that appear (review against "synthetic" and rule 4): Muthoot Medical Centre (demo), Believers Hospital Tiruvalla (demo), Vasan Eye Care, St. Thomas College Kozhencherry, Karunya Community Pharmacy, Medline Pharmacy, Jan Aushadhi, Kerala State Disaster Management Authority, Directorate of Health Services Kerala, Kerala State Blood Transfusion Council (demo), KNOS, Kerala Health Dept., Samsung Galaxy A54, Pixel 7, Windows/Edge. Place names (Pathanamthitta, Kozhencherry, Konni, Adoor, Kottayam, Tiruvalla, Omalloor, Kochi) are real Kerala places. Legal references: Transplantation of Human Organs and Tissues Act 1994, Disaster Management Act.

No raw 12-digit Aadhaar, no 14-digit ABHA and no real phone number appears in the Citizen screens.

---

## 24. Home-only widgets (CitizenHome) not covered above

- Quick actions: "Share with a doctor" - "Show your rotating key"; "Ask the AI" - "Guidance, not diagnosis"; "Book appointment" - "Free · pay at hospital"; "Upload a report" - "PDF, photo or scan".
- Header line: "You have 1 appointment this week, 2 medicines left today and a lab test due on 30 Oct." (FLAG vs 1 of 3 / 2 of 5 and 30 Oct HbA1c: consistent with date.)
- Stat cards: Next appointment `Tue 21` "Oct · 10:30" hint "Dr. Arun Nair · Confirmed"; Medicines today `1` of 3 taken; Blood pressure `118/76` mmHg hint "On target · 4 lower than last month"; Documents `24` "3 added by doctors this week".
- Recent documents (3): "Lipid profile" / "Lab · added by Rahul Varghese · today"; "Chest X-ray, PA view" / "Image Analysis · 15 Oct"; "e-Signed prescription" / "Dr. Arun Nair · valid till 14 Nov".
- AI insight card: module "Reviewed result · Image analysis", status caution, title "Chest X-ray: no urgent findings", reviewed by Dr. Arun Nair; text "Your doctor reviewed this result and wrote: “Mild changes, likely from last month's infection. Repeat in 2 weeks.”" (AI output is shown only after doctor review, consistent with rule 3; badge is simulated.)
- Giving box: "Blood donor · B+" / "Resting until 02 Nov · 2 requests nearby"; "Organ pledge" / "Kidneys, corneas · signing at hospital pending".
- Connected apps feed shows the first 4 bus events visible to citizen; title "Connected apps", sender tag chip (first 3 letters of sender role, e.g. "doc", "lab").

---

## 25. Suggested seed entity map and open questions

Entity candidates (table : source section): `citizen` (2), `citizen_health_profile` (2.2), `emergency_contact` (8.2), `family_link` (8.3, 7.5), `special_category_request` + `special_category_step` (8.1), `person_staff` / `practitioner` (3), `facility` (4), `pharmacy` and `pharmacy_stock` (15.6), `bus_event` / `notification` (5, 18), `access_key_session` and `access_history` (7), `access_category_consent` (7.3), `doc_folder` + `document` (9), `calendar_event` + `reminder` (10), `vital_reading` + `vital_target` (11), `ai_chat_thread` + `ai_chat_message` (12), `message_thread` + `message` + `attachment` (13), `appointment` + `provider_slot` (14), `prescription` + `prescription_item` + `dose_schedule` + `dose_log` (15), `blood_donor` + `blood_request` + `blood_donation` + `blood_bank_stock` (16), `organ_pledge` + `witness` (17), `notification_pref` + `device_session` + `user_setting` (18, 19), `review` + `review_stats` (20), `complaint` + `complaint_log` (21).

Open questions:
1. Pick one canonical value for every item in section 22 (the seed cannot satisfy both). My suggestion: appointment on Wed 21 Oct 2026, token 16; Lipid LDL 142; HbA1c 7.4% on 04 Oct 2026 and drop the 6.9% tile (or relabel as earlier value 12 Sep); prescription dated 17 Oct 2026 with ID RX-DEMO-88213 and 3 items; Dr. Sreeja Paul = Ophthalmology everywhere (change Rx to a different dermatologist); Dr. Meera Krishnan = hospital admin only; rename the Bed 7 patient and the neighbour; mother = Sarala Nair; one phone number format; age 38, weight 64.2 kg; last donation 4 Aug 2026.
2. How should Aadhaar be shown? Tokenised only, or masked last-4 allowed for the demo?
3. Should real-world organisation names (section 23) be renamed to demo names now?
4. Should the seed be date-relative (move all dates with "today") or pinned to 17 Oct 2026?
5. Should the 24 documents (Home/Settings) be seeded as 24 rows, or should the counts be changed to 10?

---

## Appendix A. SVG chart data (decoration, no numeric source)

Home mini BP chart (viewBox 300 x 110, grid at y 20/55/90): path `M0 62 C20 50 30 70 50 58 S80 40 100 52 S130 66 150 50 S180 38 200 46 S230 60 250 44 S280 40 300 42`; end dot (300,42).

Vitals BP chart (viewBox 420 x 200; y 20=140, 75=120, 130=100, 185=80 mmHg; target band y 40-110):
- Systolic: `M30 95 C60 80 75 104 100 88 S140 62 170 80 S210 98 240 74 S280 58 310 70 S360 88 390 64 S410 60 420 62`, end dot (420, 62).
- Diastolic: `M30 168 C60 160 80 176 100 166 S140 150 170 160 S210 172 240 156 S280 148 310 154 S360 164 390 150 S410 148 420 150`, end dot (420, 150).
- Axis note: labels 140/120/100/80 sit at y 24/79/134/189. Systolic end dot (y 62) reads about 125 on that axis; the diastolic line is drawn lower (y 150) and does not map to 72-82 on the same axis, so treat the chart as decorative.

Weight chart path: `M0 14 L27 18 L54 16 L82 24 L109 28 L136 26 L164 34 L191 38 L218 42 L245 44 L273 50 L300 54` (x values 0, 27, 54, 82, 109, 136, 164, 191, 218, 245, 273, 300).

Fasting sugar bars: rect x = 8, 45, 82, 119, 156, 193, 230, 267 (width 24); y = 22, 28, 30, 36, 34, 40, 44, 46; height 98, 92, 90, 84, 86, 80, 76, 74; target dashed line at y 40.

## Appendix B. Runtime constants worth keeping

- Bus polling every 2 s; toast 4 s; new-key interval 10 s; session 30 min = 1800 s; seed `left` 1122 s.
- Blood countdown minute seed 42, decrements each minute; Documents upload simulates 10 steps at 160 ms.
- Care progress "Step 2 of 3"; Complaint stage fill classes p0/p1/p2.
- Doc thumbnail colours map to folder colour; imaging folder always uses the image thumbnail.

# Admin Console design inventory (seed-data source)

Lossless extraction of every inline sample dataset in the six Admin Console design screens. Read-only extraction; nothing in the design was changed. All people, facilities, numbers and IDs below are the design's synthetic values and are already `DEMO-` style. Written 2026-10-21 for the seed script (W5 frontend port).

Source folder (scratchpad copy of the design project):
`/tmp/claude-1000/-home-athun-projects-Carefusion-AI/ecae4ace-beb4-4757-9d25-ca60dd10531e/scratchpad/artifact-files/0c6d1902-b513-4471-bcfd-eff32230574a/project/`

| Screen file | Size | Lines | Role | Sign-in persona | Shape |
| --- | --- | --- | --- | --- | --- |
| `PharmacyAdmin.dc.html` | 64 KB | 596 | `pharmacyadmin` | Suma Thomas, "Pharmacy admin · DEMO-DL-KL-2041" | Own script, 7 sections |
| `HospitalAdmin.dc.html` | 87 KB | 770 | `hospitaladmin` | Dr. Meera Krishnan, "Hospital admin · Demo General Hospital" | Own script, 12 sections |
| `DistrictAdmin.dc.html` | 146 KB | 1581 | `district` | Ajay Kumar, "District admin · Pathanamthitta" | Shared "gov console" template + `CFG` |
| `StateAdmin.dc.html` | 146 KB | 1581 | `state` | Latha Nair, "State admin · Kerala" | same template, different `CFG` |
| `ZonalAdmin.dc.html` | 146 KB | 1581 | `zonal` | R. Venkatesh, "Zonal admin · South zone" | same template, different `CFG` |
| `CentralAdmin.dc.html` | 154 KB | 1654 | `central` | S. Banerjee, "Central admin · MoHFW" | same template + AI governance + system settings |

Verified by `diff`: District, State and Zonal differ ONLY in `<title>`, the `.map{grid-template-columns:repeat(N,…)}` CSS line and the one-line `var CFG = {...}`. Central differs from District only in `<title>`, the map CSS (8 columns), the `CFG`, and one extra markup block (section `AI GOVERNANCE`, lines 809-881). The whole engine (formulas, generators, nav, sections) is byte-identical across all four.

Document map:
1. Shared event bus (all six screens)
2. Pharmacy admin
3. Hospital admin
4. Gov console template (shared by District/State/Zonal/Central): structure, literal values, formulas
5. Per-level `CFG` (verbatim JSON for all four levels) — Section C
6. Generated (computed) data for all four levels — Section G
7. Cross-screen links
8. Inconsistencies in the design to resolve when seeding

---

## 1. Shared event bus (identical in all six screens)

localStorage key `cf-demo-bus-v1`. Array of events, newest first, max 40 kept. `busFor(role)` returns events whose `to` array contains the role. A screen polls every 2 s and on the `storage` event; a new event shows a toast ("From {fromLabel} · {at}").

`CF_FROM` labels (role -> label): citizen=Citizen, doctor=Doctor, nurse=Nurse, labtech=Lab, radiology=Radiology, pharmacist=Pharmacist, pharmacyadmin=Pharmacy admin, hospitaladmin=Hospital admin, district=District, state=State, zonal=Zonal, central=Central. (Gov console uses `FROM_LABEL` with the same keys but `citizen`="Citizen app", `doctor`="Doctor app".)

Seed events `CF_SEED` (10 rows, verbatim):

| id | type | from | to | title | text | href | at |
| --- | --- | --- | --- | --- | --- | --- | --- |
| s1 | booking | citizen | doctor | New booking · Anjali Menon | Tue 21 Oct, 10:30 · follow-up | Doctor.dc.html | 09:12 |
| s2 | prescription | doctor | pharmacist, citizen | e-Signed prescription · Anjali Menon | Metformin 500 mg ×60, Atorvastatin 10 mg ×30 · Dr. Arun Nair | Pharmacist.dc.html | 10:05 |
| s3 | lab-order | doctor | labtech | Lab order · HbA1c, lipid profile | Anjali Menon · routine · Dr. Arun Nair | LabTech.dc.html | 10:07 |
| s4 | lab-result | labtech | doctor, citizen | Result ready · Lipid profile | LDL 142 mg/dL (high) · uploaded by Rahul Varghese | Doctor.dc.html | 11:05 |
| s5 | break-glass | doctor | hospitaladmin, citizen | Emergency access used | Dr. Sreeja Paul · Thomas Kurian · unconscious on arrival | HospitalAdmin.dc.html | 03:12 |
| s6 | alert | district | citizen, doctor, nurse, hospitaladmin | Heatwave — Pathanamthitta | Stay indoors 12:00–16:00 · District health office | CitizenAlerts.dc.html | 08:00 |
| s7 | vitals-critical | nurse | doctor | Early-warning score 7 · Bed 7 | Thomas Kurian · SpO₂ 91% · escalated by Lekha Pillai | Doctor.dc.html | 12:40 |
| s8 | dispensed | pharmacist | citizen, pharmacyadmin | Ready to collect · Demo Hospital Pharmacy | Anjali Menon · Metformin, Atorvastatin · Joseph Mathew | CitizenMedicines.dc.html | 13:20 |
| s9 | complaint | citizen | hospitaladmin, district | Complaint filed · long OP wait | Demo General Hospital · ticket CMP-0412 | HospitalAdmin.dc.html | 14:02 |
| s10 | blood-request | doctor | citizen, district | Blood needed · B+ · 2 units | Demo General Hospital · surgery tomorrow 08:00 | CitizenBlood.dc.html | 14:30 |

Events the Admin screens EMIT (with `busPush`):

| Emitter | Trigger | type | from | to | title | text | href |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hospital admin | "Resolve & notify citizen" on a complaint | complaint-update | hospitaladmin | citizen | `Complaint resolved · {ticket}` | `Demo General Hospital replied: {complaint title}` | CitizenComplaints.dc.html |
| Gov console (any level) | Grievance "Escalate" (district role only) | complaint | ROLE | state | `Escalated complaint · {title}` | `{facility} · ticket {ref}` | StateAdmin.dc.html |
| Gov console | Grievance "Assign" | complaint | ROLE | hospitaladmin | `Complaint assigned to you · {title}` | `From {scope.short} · ticket {ref}` | HospitalAdmin.dc.html |
| Gov console | Grievance "Close" | complaint-update | ROLE | citizen | `Your complaint {ref} is resolved` | `{title} · {scope.sender}` | Citizen.dc.html |
| Gov console | Blood request "Notify matching donors" | blood-request | ROLE | citizen | `Donors near you needed · {title without "Blood needed · "}` | `Sent by {scope.sender} to registered donors within 10 km` | CitizenBlood.dc.html |
| Gov console | Alerts "Send" with When = Now | alert | ROLE | citizen, doctor, nurse, hospitaladmin | `{"Emergency: " if emergency}{title}` | `{target name} · {scope.sender}` | CitizenAlerts.dc.html |
| Central only | Settings: maintenance mode toggle confirmed | alert | central | citizen, doctor, nurse, hospitaladmin | on: `Scheduled maintenance tonight 01:00–03:00`; off: `Maintenance finished` | `Ministry of Health & Family Welfare · emergency access keeps working` | CitizenAlerts.dc.html |
| Pharmacy admin | nothing emitted (consumes only) | | | | | | |

Gov console feed filter `govFeed()`: event is shown if `to` contains the screen's ROLE (`district`/`state`/`zonal`/`central`) OR `type` is one of `complaint, blood-request, alert, break-glass, booking, lab-result`. From the seed that is s1, s4, s5, s6, s9, s10 (array order); the "Connected apps" card shows the first 3 = s1, s4, s5. Toast pops for new events addressed to ROLE or of type complaint/blood-request. Hospital feed (`busFor('hospitaladmin')`) = s5, s6, s9. Pharmacy feed (`busFor('pharmacyadmin')`) = s8 only.

---

## 2. Pharmacy admin (`PharmacyAdmin.dc.html`)

### 2.1 Identity and chrome
- Banner (warning): "Synthetic demo data — Demo Hospital Pharmacy and licence DEMO-DL-KL-2041 are simulated."
- Pharmacy: **Demo Hospital Pharmacy**, Pathanamthitta. Admin user: **Suma Thomas** ("Pharmacy admin · DEMO-DL-KL-2041"). Page date line: "Saturday, 17 October 2026 · Pathanamthitta"; greeting "Good afternoon, Suma".
- Sub-line: "4 pharmacists on shift, 2 recalls to action and 1 purchase order waiting for your approval."
- Badges: "Licence valid · 14 Mar 2028", "DEMO-DL-KL-2041".
- Top bar: "Demo Hospital Pharmacy › {section}", live chip "Stock synced {just now | N s ago | N min ago}" (counter 0..299 s, +1 per second, wraps), bell (aria "Recalls and expiry, 2 need action"), button "Invite pharmacist".
- Nav (sidebar sections): (no title) Overview, Pharmacists | Stock: Inventory & finder (`inventory`), Purchase orders (`orders`, badge 1 while PO-2026-0418 is pending), Expiry & recalls (`expiry`, badge 2) | Governance: Licence & compliance (`compliance`), Audit log (`audit`). Section ids: overview, staff, inventory, orders, expiry, compliance, audit.

### 2.2 Overview literals
KPI stat cards:

| Label | Value | Unit | Hint / trend | Tone |
| --- | --- | --- | --- | --- |
| Prescriptions filled today | 186 (static literal on this card; only the "Today" callout in the 30-day chart is `186 + count of live dispensed bus events`, i.e. 187 with the seed) | | trend up "12% vs last Saturday" | sage |
| Items in stock | 1,248 | SKUs | "1,102 published to public finder" | default |
| Low stock | 17 | items | trend up "4 more than yesterday" | peach |
| Expiring in 30 days | ₹48,620 | | "42 batches · 9 suppliers" | blue |

Dispensing this week (bar chart, "e-Signed prescriptions only"): Sun 142, Mon 158, Tue 151, Wed 170, Thu 164, Fri 176, Today 186. (SVG bars heights 108,122,116,134,128,140, today 150 on a 180 px viewBox.)

Public stock finder hero: **88%** "of your stock is visible to citizens searching nearby. 312 searches found you this week."

Stock by category (name, SKUs, value, bar width %): Diabetes 312 · ₹4.2 L · 100; Cardiac 268 · ₹3.6 L · 90; General 241 · ₹1.1 L · 80; Antibiotic 186 · ₹2.3 L · 60; Respiratory 124 · ₹1.8 L · 40; Gastro 117 · ₹0.9 L · 40. (SKU sum = 1,248.)

Dispenses · 30 days: badge "+18% month on month"; line chart peak **191 on 12 October** ("during the dengue spike"), average **158**, end value ≈186; callouts Today = `186 + live dispensed count`, 30 days = **4,742**, Avg wait = **6 min**. Polyline vertices (x,y on 320x150): (0,108) (22,104) (44,110) (66,98) (88,100) (110,92) (132,96) (154,84) (176,88) (198,66) (210,34 = peak) (222,54) (244,70) (266,62) (288,52) (310,44) (320,40).

Connected apps feed: first 3 bus events for `pharmacyadmin`; for a `dispensed` event an "effect" line is built from the stock-decrement map `CF_DEC`: `[name-match, inventory id, qty]` = Metformin→i1 −60, Atorvastatin→i2 −30, Insulin→i3 −2, Amlodipine→i4 −30, Amoxicillin→i6 −15, Paracetamol→i5 −10 ("Stock updated: Metformin −60 · Atorvastatin −30"). The same decrements are applied to the Inventory on-hand quantities. With the seed event s8 the displayed on-hand are therefore: i1 4,200→4,140; i2 380→350.

"Needs your action" (4 rows):
1. CDSCO recall · Ranitidine 150 mg — "Batch RN-2291 · 64 strips on shelf" (danger icon) -> Act (Expiry page)
2. PO-2026-0418 awaiting approval — "KMSCL · ₹1,24,300 · 22 lines" (warn) -> Review (Orders)
3. Invite pending · Anu George — "Sent 2 days ago · expires in 5 days" (blue) -> Resend (Staff)
4. Fire NOC renewal — "Due 30 Nov 2026" (peach) -> Upload (Compliance)

Low stock card (name, qty, min) — qty for Insulin glargine and Atorvastatin come from the (decremented) inventory: Insulin glargine 46 / min 60; Atorvastatin 10 mg 350 (380 before dispense) / min 800; Amoxicillin 500 mg 120 / 600; Ranitidine 150 mg 64 / 200; Salbutamol inhaler 88 / **150** (note: inventory table says min 50). Bar class: `p = clamp(round(qty/min*10), 1, 10)`, width = p*10 %, colour red if p<=3, amber if p<=6.

Pharmacists on shift card (static): Joseph Mathew · Counter 1 · 74 fills today · On shift; Divya Raj · Counter 2 · 61 fills · On shift; Shaji Kurian · Store room · receiving · Break; Neethu Babu · Night shift from 20:00 · Off.

### 2.3 Pharmacist staff (`STAFF`, 6 rows)

| id | name | council reg | role | shift | last active | fills today | default active |
| --- | --- | --- | --- | --- | --- | --- | --- |
| s1 | Joseph Mathew | KSPC DEMO-30214 | Senior pharmacist | Day | Now | 74 | true |
| s2 | Divya Raj | KSPC DEMO-33871 | Pharmacist | Day | Now | 61 | true |
| s3 | Shaji Kurian | KSPC DEMO-28140 | Store in-charge | Day | 12 min ago | 12 | true |
| s4 | Neethu Babu | KSPC DEMO-39025 | Pharmacist | Night | Yesterday 07:58 | 0 | true |
| s5 | Faisal Rahman | KSPC DEMO-40517 | Pharmacist | Night | 16 Oct | 0 | true |
| s6 | Bindu Varghese | KSPC DEMO-21339 | Pharmacist | — | 02 Sep | 0 | **false** (Deactivated) |

Staff page KPIs: Active = count active "of 6 accounts" (5 by default); Invites pending 1 "Anu George"; Two-step enabled 100% "Required for all staff"; Registration renewals 1 "Shaji Kurian · Jan 2027". Subtitle: "Kerala State Pharmacy Council numbers verified". Row actions Deactivate/Reactivate toggle.

Pending invites: Anu George — anu.george@demo.example · KSPC DEMO-41982 · sent 15 Oct (Resend / Revoke). Faisal Rahman — "Accepted 12 Oct · activation complete" (Joined badge).
Info card: pharmacists see only the prescription being filled (medicine, dose, prescriber, allergies) — no history, no documents, no AI chat; every view audit-logged.
Invite modal fields: Full name (required, "As on pharmacy council registration"), Work email (required), Kerala State Pharmacy Council number (required, helper "We check this against the council register."), Shift select options: `Day · 08:00–20:00`, `Night · 20:00–08:00`, `Rotating`.

### 2.4 Inventory (`INV`, 9 rows) — "Showing N of 1,248 items · stock syncs from your billing system every 5 minutes"

| id | medicine | category | batch | on hand | min | expiry | public finder default |
| --- | --- | --- | --- | --- | --- | --- | --- |
| i1 | Metformin 500 mg | Diabetes | MF-24A19 | 4200 | 1500 | Aug 2027 | Shown |
| i2 | Atorvastatin 10 mg | Cardiac | AT-1182 | 380 | 800 | May 2027 | Shown |
| i3 | Insulin glargine 100 IU/mL | Diabetes | IG-5530 | 46 | 60 | Jan 2027 | Shown |
| i4 | Amlodipine 5 mg | Cardiac | AM-7741 | 2600 | 1000 | Dec 2027 | Shown |
| i5 | Paracetamol 650 mg | General | PC-9910 | 12400 | 4000 | Mar 2028 | Shown |
| i6 | Amoxicillin 500 mg | Antibiotic | AX-3307 | 120 | 600 | Nov 2026 | **Hidden** |
| i7 | Salbutamol inhaler | Respiratory | SB-0442 | 88 | 50 | Jun 2027 | **Hidden** |
| i8 | ORS sachet | General | OR-6620 | 1900 | 1000 | Feb 2028 | Shown |
| i9 | Ranitidine 150 mg | Gastro | RN-2291 | 64 | 200 | "Recalled" | Hidden (recall), level "Blocked" |

Level badge: expiry=="Recalled" -> Blocked (danger); qty<min -> Low (warning); else OK (success). So Low = i2, i3, i6; i9 Blocked. Filters: All, Low stock (qty<min), Hidden from finder, Diabetes (category). Search over name+batch. Public finder shows presence only, never exact quantity.

### 2.5 Purchase orders

| id | supplier | lines | amount | raised by | date | status |
| --- | --- | --- | --- | --- | --- | --- |
| PO-2026-0418 | KMSCL | 22 | ₹1,24,300 | Shaji Kurian | 16 Oct | pending (-> approved/held on action) |
| PO-2026-0412 | Medisupply Kochi | 9 | ₹38,750 | Joseph Mathew | 13 Oct | transit |
| PO-2026-0409 | Apex Pharma Dist. | 14 | ₹62,180 | Shaji Kurian | 11 Oct | transit |
| PO-2026-0401 | KMSCL | 31 | ₹2,08,900 | Suma Thomas | 04 Oct | received |
| PO-2026-0396 | Sree Agencies | 6 | ₹14,200 | Divya Raj | 01 Oct | received |

Status badges: pending=warning "Awaiting approval"; approved=success "Approved · sent"; held=peach "Sent back"; transit=info "In transit"; received=neutral "Received". Rule text: orders over ₹1,00,000 need admin approval.
PO KPIs: Awaiting approval (1 or 0); In transit 3 "KMSCL, Medisupply, Apex"; Spend this month ₹6.8L "Budget ₹9L"; On-time delivery 94% (up "3 pts this quarter").
PO-2026-0418 detail: Lines 22; Total ₹1,24,300; Raised by Shaji Kurian; Expected 24 Oct. Line items: Metformin 500 mg × 3,000 = ₹18,600; Atorvastatin 10 mg × 2,000 = ₹21,400; Insulin glargine pen × 120 = ₹48,000; "+ 19 more lines" = ₹36,300 (sums to ₹1,24,300). Buttons: Approve order; Send back to Shaji.

### 2.6 Expiry and recalls
Recalls (`REC`):
| id | title | meta | body | urgent |
| --- | --- | --- | --- | --- |
| r1 | CDSCO recall · Ranitidine 150 mg, batch RN-2291 | Issued 15 Oct 2026 · Class II · NDMA impurity | 64 strips on shelf. The counter blocks this batch. Move stock to quarantine and confirm. | true (status "Action needed", danger) |
| r2 | Manufacturer notice · Amoxicillin 500 mg, batch AX-3307 | Issued 09 Oct 2026 · labelling error on outer carton | No safety risk. Relabel before dispensing or return to supplier. | false (status "Review", warning) |
Actions: "Confirm off shelf" (-> "Off shelf · confirmed", sage; "Undo confirmation"), "Download notice".

Expiring soon (badge "42 batches"):
| medicine | batch | qty | expires |
| --- | --- | --- | --- |
| Amoxicillin 500 mg | AX-3307 | 120 | 30 Nov |
| Cetirizine 10 mg | CT-1203 | 340 | 31 Oct |
| Vitamin D3 60K | VD-0721 | 90 | 15 Nov |
| Diclofenac gel | DG-5512 | 44 | 20 Nov |
| Pantoprazole 40 mg | PP-8834 | 610 | 28 Nov |

Expiry by month (value at cost): October ₹12,480 (bar 30%); November ₹36,140 (80%); December ₹22,900 (50%); January ₹9,300 (20%). Info: "Return to supplier — KMSCL accepts returns up to 60 days before expiry. 11 batches qualify."

### 2.7 Licence and compliance
Documents (name | meta | status | tone):
1. Retail drug licence (Form 20 & 21) | DEMO-DL-KL-2041 · valid till 14 Mar 2028 | Verified | success
2. GST registration | 32DEMO1234F1Z5 · verified 02 Jan 2026 | Verified | success
3. Registered pharmacist certificate | Joseph Mathew · KSPC DEMO-30214 | Verified | success
4. Cold chain log — Q3 2026 | Uploaded 03 Oct · fridge 2–8 °C | Under review | info
5. Fire NOC | Expires 30 Nov 2026 | Renew soon | warning
6. Narcotic drugs register (Schedule X) | Monthly return · Oct due 05 Nov | Upcoming | neutral
Hero: Drug licence DEMO-DL-KL-2041 — "Forms 20 & 21 · Retail · valid till 14 Mar 2028". Compliance score **96** (bar 90%). "Last inspection 02 Aug 2026 · no major findings. Next due Feb 2027." Subtitle: "Documents verified by the State Drugs Control Department."

### 2.8 Audit log (`AUD`, 8 rows; "kept for 7 years")
Filters: All, Dispensing (`rx`), Stock (`stock`), Staff (`staff`). Badge warning for Blocked/Deactivated.
| time | who | action | detail | group |
| --- | --- | --- | --- | --- |
| 15:42 | Joseph Mathew | Dispensed | Rx DEMO-RX-88213 · Metformin 500 mg × 60 | rx |
| 15:31 | Suma Thomas | Published | Atorvastatin 10 mg shown in public finder | stock |
| 15:12 | Divya Raj | Blocked | Counter blocked batch RN-2291 (recall) | rx |
| 14:55 | Shaji Kurian | Received | PO-2026-0401 · 31 lines checked in | stock |
| 14:20 | Suma Thomas | Invited | Anu George · pharmacist | staff |
| 13:48 | Joseph Mathew | Dispensed | Rx DEMO-RX-88190 · Amlodipine 5 mg × 30 | rx |
| 11:02 | System | Sign-in | Divya Raj · two-step · Counter 2 terminal | staff |
| 09:15 | Suma Thomas | Deactivated | Bindu Varghese · on long leave | staff |

---

## 3. Hospital admin (`HospitalAdmin.dc.html`)

### 3.1 Identity and chrome
- Banner: "Synthetic demo data — Demo General Hospital, its staff and HFR ID are simulated."
- Hospital: **Demo General Hospital**, Pathanamthitta; HFR facility ID **IN3210DEMO0042** ("Verified 12 Jan 2026 · Government · District hospital"; badge "HFR verified"). Admin user: **Dr. Meera Krishnan**. Date line: "Saturday, 17 October 2026 · Pathanamthitta"; greeting "Good afternoon, Dr. Meera"; sub-line "{pending} staff approvals, 2 break-glass reviews and bed occupancy at 84%." (168/200 = 84%).
- Top bar: "Demo General Hospital › {section}", "{196..200} staff on duty" (random re-roll every 4 s, base 198), bell (break-glass), button "Review approvals · {pending}".
- Nav: (none) Overview, Approvals (badge = pending count, 5 initially), Staff | Hospital: Admissions, Doctor roster (`roster`), Departments & beds (`beds`), Roles & permissions (`roles`), Hospital profile (`profile`) | Citizens: Complaints (badge = open count), Reviews | Oversight: Break-glass reviews (`breakglass`, badge = open BG count), Audit log (`audit`).

### 3.2 Overview literals
KPI cards: OP visits today **642** (up "8% vs last Saturday"; count-up animation); Beds occupied **168** of 200 (hint "ICU 18 of 20"); Active doctor sessions **37** ("Citizen-key sessions right now"); Pending approvals = pending count ("Doctors and staff").
Bed occupancy by department: first 6 of the 7 departments in 3.5. Hero "Break-glass this week" **3** — "emergency record openings without a citizen key. 2 still need your review within 72 hours."
Approval queue peek: first 3 of the 5 applicants (name · role · dept · status badge).
Staff on duty (kv): Doctors 48, Nurses 112, Lab 14, Radiology 9, Pharmacy 4, Admin 11 (sum 198).
Recent activity (static): Break-glass · Casualty — Dr. Vivek Menon · 14:02 (danger); Approved Lekha Pillai — Nurse · Ward 3 · 11:40 (sage); Role updated — Radiology tech can attach to orders · 09:12 (blue).
Connected apps: first 3 bus events for hospitaladmin.
Citizen complaints card: first 3 complaints + "Inbox · N open".
Citizen rating card: **4.3** ★★★★☆ "1,284 reviews"; distribution bars 5★ 58%, 4★ 22%, 3★ 9%, 2★ 5%, 1★ 6% (bar width class `max(10, round(pct/10)*10)`); "Most mentioned": Kind nurses · 41 (success), Clean wards · 28 (success), OP wait · 22 (warning), Parking · 9 (warning); footer "212 verified reviews · 86% replied within 3 days".

### 3.3 Staff approvals (`APPS`, 5 applicants; all "pending" by default; `statusOf` = decision or pending)

| id | name | role | dept | applied | registry | employment | documents (title \| meta) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a1 | Dr. Nisha Abraham | Doctor | Paediatrics | today 10:12 | HPR 71-DEMO-4410 | Government | MBBS degree certificate \| University of Kerala · 2014; MD Paediatrics \| AIIMS demo · 2018; TCMC registration \| Valid till 2029; Appointment order \| DHS Kerala · 02 Oct 2026 |
| a2 | Dr. Rajeev Pillai | Doctor | Orthopaedics | yesterday | HPR 71-DEMO-3982 | Visiting · private | MBBS degree certificate \| Calicut University · 2009; MS Orthopaedics \| 2013; TCMC registration \| **Expired Aug 2026**; Visiting consultant agreement \| Signed 30 Sep |
| a3 | Sreelakshmi K. | Nurse | ICU | 15 Oct | KNMC DEMO-88231 | Contract | B.Sc Nursing \| 2019; KNMC registration \| Valid till 2028; Appointment order \| NHM · 10 Oct |
| a4 | Arjun Das | Lab tech | Laboratory | 14 Oct | KPMC DEMO-1140 | Government | DMLT certificate \| 2020; Appointment order \| DHS Kerala |
| a5 | Mini Joseph | Radiology tech | Radiology | 12 Oct | AERB DEMO-RT-221 | Government | Diploma in Radiography \| 2016; AERB certificate \| Valid; Appointment order \| DHS Kerala |

Defaults: selected a1; a1 documents 0 and 1 pre-checked ("Mark checked"); every other doc unchecked. "Aadhaar e-KYC: Verified" shown for all. Approve is enabled only if all docs checked, none "Expired", and status pending. a2 shows warning "Registration expired — TCMC registration expired in Aug 2026. Approving is blocked until a renewed certificate is uploaded."
Queue filters: Pending (default), Doctors, Decided, All. Reject reasons: Registration could not be verified (default); Registration expired; Document unreadable or incomplete; Not employed at this hospital; Other. Approved message: "{name} can now sign in to the Staff Portal. They were told by SMS and email."

### 3.4 Staff directory — "198 active accounts across 9 departments"
KPI cards: Doctors 62 ("48 on duty"); Nurses 128 ("112 on duty"); Technicians 31 ("Lab 18 · Radiology 13"); Two-step on 100% ("Required"). Role filters: All, Doctors, Nurses, Lab, Radiology. "Showing {n} of 198".
`STAFF` (8 rows: name, role, dept, registration, status):
| name | role | dept | registration | status |
| --- | --- | --- | --- | --- |
| Dr. Arun Nair | Doctor | General medicine | HPR 71-DEMO-1022 | On duty |
| Dr. Vivek Menon | Doctor | Casualty | HPR 71-DEMO-2871 | On duty |
| Lekha Pillai | Nurse | Ward 3 | KNMC DEMO-55102 | On duty |
| Rahul Varghese | Lab tech | Laboratory | KPMC DEMO-0981 | On duty |
| Fathima Beevi | Radiology | Radiology | AERB DEMO-RT-118 | Off |
| Joseph Mathew | Pharmacist | Pharmacy | KSPC DEMO-30214 | On duty |
| Dr. Sameer Ali | Doctor | ICU | HPR 71-DEMO-3310 | Off |
| Asha Mohan | Nurse | ICU | KNMC DEMO-60218 | On duty |

### 3.5 Departments & beds (`DEPTS`: name, occupied, total beds, head, staff)
| department | occupied | total | free | % full (badge) | head | staff |
| --- | --- | --- | --- | --- | --- | --- |
| Casualty | 18 | 20 | 2 | 90% | Dr. Vivek Menon | 22 |
| General medicine | 52 | 60 | 8 | 87% | Dr. Arun Nair | 41 |
| ICU | 18 | 20 | 2 | 90% | Dr. Sameer Ali | 26 |
| Paediatrics | 21 | 30 | 9 | 70% | Dr. Rekha S. | 19 |
| Maternity | 24 | 30 | 6 | 80% | Dr. Ann Mary | 23 |
| Orthopaedics | 15 | 20 | 5 | 75% | Dr. Thomas K. | 12 |
| Surgery | 20 | 20 | 0 | 100% | Dr. Hari Prasad | 18 |
Totals: 168 occupied / 200 beds. Badge tone: >=100% danger, >=85% warning, else success. Page text: "Published to the district dashboard every 15 minutes."

### 3.6 Roles & permissions matrix (roles: Doctor, Nurse, Lab tech, Radiology, Pharmacist, Front desk)
| permission | note | Doctor | Nurse | Lab tech | Radiology | Pharmacist | Front desk | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open record with citizen key | National rule | 1 | 0 | 0 | 0 | 0 | 0 | yes |
| Break-glass emergency access | National rule · logged | 1 | 0 | 0 | 0 | 0 | 0 | yes |
| View admission records (ward) | Hospital setting | 1 | 1 | 0 | 0 | 0 | 0 | no |
| Upload results to an order | Hospital setting | 0 | 0 | 1 | 1 | 0 | 0 | no |
| Attach images to an order | Hospital setting | 0 | 0 | 0 | 1 | 0 | 0 | no |
| Dispense e-signed prescriptions | National rule | 0 | 0 | 0 | 0 | 1 | 0 | yes |
| Book and reschedule OP visits | Hospital setting | 1 | 0 | 0 | 0 | 0 | 1 | no |
| Record vitals at triage | Hospital setting | 1 | 1 | 0 | 0 | 0 | 0 | no |
| Use AI clinical assistant | Hospital setting | 1 | 0 | 0 | 0 | 0 | 0 | no |
Badge: "All changes saved" or "{n} unsaved change(s)".

### 3.7 Break-glass reviews (`BG`, 3 static + live from bus)
| id | doctor | patient | meta | reason | viewed | evidence |
| --- | --- | --- | --- | --- | --- | --- |
| b1 | Dr. Vivek Menon | Unknown male, ~45 | Casualty · today 14:02 · 22 min | Unconscious road accident patient. Identified by Aadhaar biometric. Needed allergies and blood group. | Emergency card, allergies, last discharge summary | Casualty register entry #C-4471 · ambulance 108 handover |
| b2 | Dr. Sameer Ali | Thankamma P. | ICU · 15 Oct 23:40 · 41 min | Transferred from PHC at night, family unreachable. Needed medication history. | Medicines, lab reports (90 days), discharge summaries | Referral note DEMO-REF-2210 |
| b3 | Dr. Arun Nair | Anjali Menon | General medicine · 11 Oct 09:10 · 6 min | Citizen key not working, patient present and consenting verbally. | Lab reports only | Citizen confirmed in app afterwards |
Live rows: every `break-glass` bus event for hospitaladmin is parsed `text.split(' · ')` -> [doctor, patient, reason], unshifted to the top: meta "From the Doctor app · {at} · live", reason capitalised + ".", viewed "Emergency card, allergies, medicines", evidence "Logged automatically · citizen notified". With the seed s5 the list is `[s5 live (Dr. Sreeja Paul / Thomas Kurian / "Unconscious on arrival."), b1, b2, b3]`.
Status rule (by list index i): index 2 is pre-"Justified"; others "Review due in 71 h" (i=0), "70 h" (i=1), "38 h" (i=3 / default). Buttons: Justified; "Not justified — escalate to district" -> status "Escalated to district". (Because the index-2 rule is positional, with the live seed row b2 is the one shown pre-justified and b3 shows "Review due in 38 h"; the intended design was b3 justified.)

### 3.8 Audit log (`AUD`, 7 rows) — filters All / Record access (`access`) / Admin changes (`admin`) / System (`system`)
| time | who | action | detail | group |
| --- | --- | --- | --- | --- |
| 15:44 | Lekha Pillai | Denied | Tried to open record outside admission · 403 | access |
| 15:20 | Dr. Arun Nair | Session | Citizen key · Anjali Menon · 30 min | access |
| 14:02 | Dr. Vivek Menon | Break-glass | Unknown male ~45 · Casualty | access |
| 11:40 | Dr. Meera Krishnan | Approved | Lekha Pillai · Nurse · Ward 3 | admin |
| 10:05 | Rahul Varghese | Upload | Lipid profile to order DEMO-ORD-5521 | access |
| 09:12 | Dr. Meera Krishnan | Permission | Radiology · attach images to an order | admin |
| 08:01 | System | Sync | Bed counts sent to district dashboard | system |

### 3.9 Hospital profile (form defaults)
Hospital name Demo General Hospital (locked, "Legal detail · request a change"); HFR facility ID IN3210DEMO0042 (locked); Ownership select options `Government · State`, `Government · Central`, `Private`, `Trust / NGO` (no default shown; hospital is Government · State per "Verified … Government"); Public phone **0468 222 0000**; Address **College Road, Pathanamthitta, Kerala 689645**; OP hours **08:00 – 14:00 · Casualty 24×7**; About "District-level government hospital with 200 beds, 24×7 casualty, dialysis and a blood bank."; switches default ON: "Show in Find care" (Citizens can book OP appointments here.), "Accept referrals from other hospitals", "Publish blood bank stock". Services badges: Casualty 24×7, ICU, Dialysis, Blood bank, CT · X-ray, Maternity.

### 3.10 Admissions (`ADM`, 8 rows) — filters All / Medicine (General medicine) / ICU / Maternity / Surgery
KPI cards: Admitted 168 ("12 since midnight"); Discharges planned 21 ("Before 14:00 today"); Critical 6 ("ICU 4 · Casualty 2"); Avg stay 3.8 days ("District target 4.0").
| patient | bed | department | status | treating doctor | admitted |
| --- | --- | --- | --- | --- | --- |
| Thomas Kurian | Bed 7 · Ward 3 | General medicine | Critical | Dr. Arun Nair | 15 Oct |
| Thankamma P. | ICU-4 | ICU | Critical | Dr. Sameer Ali | 15 Oct |
| Baby of Reshma | NICU-2 | Paediatrics | Stable | Dr. Rekha S. | 16 Oct |
| Reshma S. | Maternity 11 | Maternity | Recovering | Dr. Ann Mary | 16 Oct |
| Gopi M. | Bed 11 · Ward 3 | General medicine | Stable | Dr. Arun Nair | 14 Oct |
| Abdul R. | Surgical 5 | Surgery | Post-op | Dr. Hari Prasad | 17 Oct |
| Usha D. | Ortho 3 | Orthopaedics | Discharge today | Dr. Thomas K. | 12 Oct |
| Kunjumon | ICU-7 | ICU | Stable | Dr. Sameer Ali | 13 Oct |
Status tone: Critical danger, Stable success, Recovering teal, Post-op warning, Discharge today info. Department colour tags: General medicine #86bdb8, ICU #d99a96, Paediatrics #b7a6d4, Maternity #e7c58e, Surgery #8eb4d6, Orthopaedics #8ebba5.

### 3.11 Doctor roster (week Mon 19 Oct – Sun 25 Oct 2026; OP 08:00–14:00; Night = casualty on-call)
Cell codes: `o` = OP shift, `n` = Night on-call, `x` = Off (click cycles x -> o -> n -> x). Days: Mon 19, Tue 20, Wed 21, Thu 22, Fri 23, Sat 24, Sun 25.
| doctor | department | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dr. Arun Nair | General medicine | o | o | o | o | o | x | n |
| Dr. Vivek Menon | Casualty | n | x | n | x | n | o | x |
| Dr. Sameer Ali | ICU | o | o | x | o | o | n | x |
| Dr. Rekha S. | Paediatrics | o | o | o | x | o | o | x |
| Dr. Ann Mary | Maternity | x | o | o | o | o | n | x |
| Dr. Hari Prasad | Surgery | o | x | o | o | o | x | x |
Coverage (doctors on duty of 6 / night on-calls): Mon 5/6 (1), Tue 4/6 (0), Wed 5/6 (1), Thu 4/6 (0), Fri 6/6 (1), Sat 4/6 (2), Sun 1/6 (1). Rule: at least 4 doctors and 1 night on-call each day; default warning "Thin cover on Sun". Badge "Draft · not published" -> "Published · staff notified".

### 3.12 Complaints
`CMP0` (3 static + live one from bus event s9):
| id | ticket | title | who | when | category (tone) | text | urgent | default state |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| (live, id=s9) | CMP-0412 | Long OP wait (from event title minus "Complaint filed · ", capitalised) | Anjali Menon | today 14:02 | OP services (blue) | "Demo General Hospital · ticket CMP-0412 — filed from the Citizen app." | true | new |
| k1 | CMP-0398 | Medicine out of stock at hospital pharmacy | Suresh K. | 16 Oct | Pharmacy (teal) | Told to buy Insulin glargine outside for the second time this month. | false | assigned |
| k2 | CMP-0391 | Rude behaviour at casualty registration | Mariamma J. | 15 Oct | Staff conduct (peach) | Night shift registration staff refused to help my elderly father fill the form. | true | new |
| k3 | CMP-0377 | Lab report delayed by 5 days | Biju George | 11 Oct | Lab (info) | Thyroid test report promised in 1 day, arrived after 5. | false | resolved |
States: new = "New" (warning, button "Assign to PRO desk"), assigned = "Under review" (warning, note "With PRO desk · Sindhu V.", button "Resolve & notify citizen"), resolved = "Resolved" (success, note "Citizen notified"). Open count default 3, resolved 1. Header: "Reply within 7 days; unresolved complaints go to the district grievance officer."
By category · 30 days: OP waiting 14, Pharmacy stock 9, Staff conduct 6, Lab delays 5, Cleanliness 3. Response time: **2.4 days** average · target 7. Link "See what the citizen sees →" -> CitizenComplaints.dc.html.

### 3.13 Reviews
`REV` (name, stars, when, department, text):
1. Lakshmi Amma, 5, today, General medicine — "Dr. Arun Nair explained my sugar results clearly and the OP queue moved fast."
2. Thomas Varghese, 4, yesterday, Casualty — "Quick attention at night. Waiting area needs more fans."
3. Fathima N., 5, 15 Oct, Maternity — "Nurses were kind and the discharge summary came to my app the same day."
4. Ramesh Pillai, 2, 14 Oct, Pharmacy — "Two of my medicines were out of stock and I had to buy outside."
Rating distribution as in 3.2. By department: General medicine 4.6, Maternity 4.5, Casualty 4.1, Laboratory 3.9, Pharmacy 3.4. This month at a glance: New reviews 38; Rating vs September +0.2; Average reply time 1.6 d. Notes: "OP waiting time came up in 22 reviews this month. Linked complaints: CMP-0412, CMP-0398".

---

## 4. Gov console template (District / State / Zonal / Central)

Every gov screen is the same template parameterised by `CFG` (Section C) plus deterministic generators (Section G). Banner (warning): "Synthetic demo data — Every number here is aggregated and de-identified. The Admin Console never shows an individual patient's record."

### 4.1 Chrome and navigation
- Crumb: `Admin Console › {scope.short} › {section}`. Top bar: "{live} live doctor sessions" (random walk every 3 s: `live += round((rand-0.45)*jitter)`, clamped to 90–110% of `CFG.live`), approvals bell with pending count, button "New alert".
- Nav sections and ids:
  - (no title): Overview `overview`; "Map & {childLabel lowercase}" `map`; Approvals `approvals` (badge = pending); Approval inbox `inbox` (badge = open inbox items)
  - Public health: Health alerts `alerts`; Disease surveillance `surveillance` (static badge 1); Blood & organ `blood`
  - Oversight: Audit & security `audit` (badge = open flags, 5 initially); Audit log `logs`; Reports & export `reports`; and, only if `hasAI` (Central), AI governance `ai` (badge 1 while release request open)
  - People: Directory `directory`; Admin accounts `admins`; and, only for Central, System settings `settings`
- Sections: overview, map, approvals, alerts, surveillance, blood, audit, reports, [ai], inbox, directory, admins, logs, [settings].
- Level matrix:

| | District | State | Zonal | Central |
| --- | --- | --- | --- | --- |
| `id` (hash seed prefix) | dist | state | zone | central |
| `role` | district | state | zonal | central |
| person / roleLine | Ajay Kumar · District admin · Pathanamthitta | Latha Nair · State admin · Kerala | R. Venkatesh · Zonal admin · South zone | S. Banerjee · Central admin · MoHFW |
| unit kind (`childOne`) | block (12) | district (14) | state (7 in South zone; `small`) | state/UT (36; `small`) |
| `createLevel` (admin accounts it creates) | Block health admin | District admin | State admin | Zonal admin |
| `secondAdmin` (2-person sign-off) | Dr. Meera Krishnan (DMO office) | Additional Director (Public Health) | Deputy Director General (South) | Joint Secretary (Digital Health) |
| `escalateTo` | the State admin (Kerala) | the Zonal admin (South) | the Central admin (MoHFW) | the National Health Authority security cell |
| `grievOn` (Grievances card instead of Approval funnel on Overview) | true | true | false | false |
| `hasAI` | false | false | false | true |
| map columns | 5 | 4 | 8 | 8 |
| `mapRows` / rankTop | 4 / 4 | 8 / 8 (+ "Needs attention" under ranking) | 7 / 3 | 7 / 3 |
| admin sign-in (`scope.mfa`) | Security key | Security key | Security key | Security key + Jan Parichay |
| audit-log rows generated | 16 | 16 | 16 | 40 |
| initial audit-log rows shown | 8 | 8 | 8 | 12 (Show more -> up to 40) |

### 4.2 Overview (all levels)
Header: `eyebrow = "{level} overview · week 42 · 17 Oct 2026"`, h1 `"{scope.title} at a glance"`, summary = `scope.summary`, badges "Population {scope.pop}" and "All services normal".
Blocks: 4 KPI cards from `CFG.kpis` (`[label, value, unit, hint, trend(prefix '-' = down), icon key, tone]`); health-tile map with metric segmented control (Registered / "{Disease} rate" / Blood cover); selected-unit card (Registered %, disease /lakh, Blood cover days, Facilities, Doctors online, Admin) + "Needs attention" (3 lowest by the metric); "Live doctor sessions" (big number = live value, "peak today {scope.peak}", 24-bar hour chart with hour 15 highlighted); "Waiting for you" (first 3 pending approvals: name, role · org, age badge); Ranking list; "Citizens registered" 12-month line (Nov 2025 – Oct 2026, label "{regNow} now"); "Disease watch · 12 weeks" (dengue/fever/leptospirosis lines normalised to own peak); "Facility mix" (4 segments from `CFG.mix`, total = `facTotal`); AIInsight "Surveillance anomaly" (status caution, from `CFG.anomaly`); "Blood stock" (bars, "{groups} under 4 days of cover.", "Call for donors", "{n} upcoming" camps); "Flagged for review" (first 3 open flags); "Connected apps" (bus feed, "{n} events today"); Grievances (District/State) or Approval funnel (Zonal/Central); "Registrations by month".

Static literals inside Overview:
- Approval funnel card (Zonal/Central only): rows Submitted / Documents verified / Reviewed / Approved from `CFG.funnel`; "Median decision time now {decision[5]} days."; kv: Decided within SLA **92%**; Escalated upward **6**; Oldest open **6 days**; Reminders sent **41**.
- Registrations by month: stacked bar 12 months (Citizens/Doctors/Staff = 0.55–0.65 / 0.28 / remainder of each month's total); "{monthNew} new this month" where `monthNew = regNow * 0.012`, split Citizens 86%, Doctors 5%, Staff 9% of monthNew; "This month, by channel": Citizen app **71%**, Hospital help desk **18%**, ASHA worker **11%**; link "See what citizens see →" -> CitizenHome.dc.html.
- Computed `monthNew` and split per level: District 10,104 (8,689 / 505 / 909); State 2,89,200 (2,48,712 / 14,460 / 26,028); Zonal 21,48,000 (18,47,280 / 1,07,400 / 1,93,320); Central 94,08,000 (80,90,880 / 4,70,400 / 8,46,720).

### 4.3 Map metrics (formulas — implement exactly to reproduce Section G)
`hs(str)` = FNV-1a 32-bit over UTF-16 char codes: `x = 2166136261; for each ch: x ^= code; x = Math.imul(x, 16777619)`; result `((x >>> 0) % 10000) / 10000`.
Per unit `u = [code, name, col, row]`:
- `hot = anomaly.hot includes code`
- `cov = 55 + 38*hs(code + "cov")` (% registered with an ABHA-linked account; shown `round`)
- `rate(disease) = 1 + 13*hs(code + disease)` per lakh; if `hot && disease == anomaly.disease`: `rate = rate*1.6 + 9`. Disease keys: `dengue`, `fever` ("Acute fever"), `lepto` ("Leptospirosis").
- `bld = 2 + 12*hs(code + "bld")` days of blood cover (shown `toFixed(0)`)
- Selected-unit card extras: `facilities = round(facTotal/units * (0.6 + 0.8*hs(code+"f")))`; `doctors online = round(live/units * (0.5 + hs(code+"d")))`; admin = `unitAdmins[code]` or "Assigned".
- Colour levels: Registered `clamp(floor((cov-55)/7.6),0,4)`; Disease rate `<4:0, <7:1, <10:2, <14:3, else 4`; Blood cover `<4:4, <6:3, <8:2, <11:1, else 0`. Legends: Registered "55%" … "90%+"; Disease "Low"…"High"; Blood "14 days"…"<4 days".
- Unit status badge: hot -> "Outbreak watch" (danger); else bld<4 -> "Low blood" (warning); else "Normal" (success).
- Ranking: top 8 units sorted by metric (Blood cover sorts ascending = lowest cover first); ranking table columns `# | {Block/District/State} | Registered | {Disease} / lakh | Blood cover`.
- Map note: "Registered = share of residents with an ABHA-linked account. Disease = cases per 1 lakh people this week. Blood cover = days the stock lasts at the current use rate. Units with fewer than 5 cases show “<5”."

### 4.4 Surveillance (formulas)
Default disease = `anomaly.disease` (District: lepto; State: dengue; Zonal: dengue; Central: fever).
- `series(d)[i], i=0..11 = round(base * season * (0.85 + 0.3*hs(id + d + i)))`, `season = 0.75 + 0.35*sin((i + (d=="dengue"?2:0))/3.2)`, `base = dzBase[d]`; for `d == anomaly.disease && i >= 9`: multiply by `1 + (i-8)*0.55`.
- `baseline(d)[i] = round(base * (0.8 + 0.25*sin((i + (d=="dengue"?2:0))/3.2)))`.
- Weeks shown 31..42 (index 11 = week 42 "this week"). Stat cards: This week = series[11]; "5-year baseline" = baseline[11] ("Same week, average of 2021–2025"); Rate per lakh = `series[11]/popN*100000` toFixed(1); Units above threshold = count of units with `rate >= 10` ("Threshold = 2 SD over baseline"; table column "Above 10 / lakh"). Trend: ratio = now/base; up "{round((ratio-1)*100)}% above baseline" when >1.05, else down "{…}% below baseline".
- "Highest rates" table: top 6 units by rate; `cases = round(rate*popN/units/100000)`, shown "<5" if <5; status "Above threshold" (danger) if rate>=10 else "Normal".
- AIInsight "Anomaly detection": on the anomaly disease = status caution, confidence `anomaly.conf`, title/body/evidence from `anomaly`; on other diseases = status verified, confidence 0.88, title "No unusual pattern for {disease lowercase}", body "Weekly counts are within the expected range for this season in every {unit}. The model will flag any {unit} that crosses 2 SD above its baseline.", evidence ["All {n} {units} within 2 SD of baseline", "Lab positivity steady at {6 + round(hs(disease)*6)}%"]. Footer badge "Needs epidemiologist review". Subtitle: "Cases reported by labs and doctors on the platform, grouped by week. Counts under 5 are hidden."
- Response actions (4 per level, `CFG.actions`: `[title, meta, status, tone]`).
- Buttons: "Draft an advisory" (opens Alerts with `CFG.draft` and target = first hot unit), "Request field investigation" -> toast "Field investigation requested · {fieldTeam}".

### 4.5 Approvals, inbox, alerts, blood, audit, reports, directory, admins, logs, settings
- **Approvals page**: stat cards Waiting (pending count; hint "Oldest: 6 days"), Approved this month (`apMonthBase` + approved-in-session count; hint `scope.apMonth`), Rejected (`apRejBase` + rejected-in-session; hint "Most common: expired licence"), Average decision time **1.8 days** (down "0.6 days faster than September"). Request list from `CFG.approvals`: `{name, role, org, ref, when, checks[], flag?, status?}`; a check string starting with `!` is a failed check (shown "! …") else "✓ …". Seeded `status:"approved"` rows (the last row per level) start Approved and cannot be undone; others start Waiting. Filters: All / Waiting / Decided. Right column: "What we check before you approve" = `scope.checklist` (4 lines), and "Facility directory" table `[Type, Count, On platform %]` from `CFG.directory`. Approve/Reject toast: "Approved: {name} · notified by SMS and email".
- **Approval inbox**: three columns Doctor applications (buttons Approve / Ask for documents), Admin applications (Approve / Hold), Flagged users (Clear / Suspend). Items from `CFG.inbox.{doctor,admin,flagged}` = `{name, meta, prio ('normal'|'urgent'), due}`. Header "{n} items need a decision". Another item (`CFG.incoming`, `kind = incoming.type`) is injected at the top 6 s after page load with toast "New doctor application: …" (or admin application / flagged account) and flash highlight. Then "Approval funnel · 90 days" (`CFG.funnel`, 4 rows with % of first) and "Days to decision" (median, last 6 months May–Oct; target 2 days; values `CFG.decision`, axis max 5).
- **Alerts page**: types Emergency (needs a second admin; button "Send for second approval"; initial status "Awaiting 2nd admin") / Advisory (default; "Send advisory" / "Schedule advisory"). Fields: Send to = "Whole {scopeWord}" + each unit; When = Send now / Today 18:00 / Tomorrow 07:00; Title (max 80); Message (320 hint "plain words, one action"); Switches "Also send SMS" (To phones without the app, ON) and "Translate automatically" (`scope.langs`, ON). Estimated reach = `popN*0.7` (whole) or `popN*0.7/units*(0.7+0.6*hs(code+"p"))`. Default draft = `CFG.draft` (title, msg). Phone preview "From {scope.sender}". "Sent & scheduled" list = `CFG.scheduled` (`{title, type, target, when, reach, status}`), badge "{n} this month".
- **Blood & organ**: stat cards Units in stock = sum of `blood[]` counts (District 1,162; State 17,051; Zonal 1,36,700; Central 6,32,000) with hint `scope.banks`; Registered donors `scope.donors`/`donorsHint`; Organ pledges `scope.pledges`/`pledgesHint`; Transplants this year `scope.tx` (up `scope.txUp`). "Blood requests from hospitals" = live `blood-request` bus events (seed s10 "Blood needed · B+ · 2 units" / "Demo General Hospital · surgery tomorrow 08:00" / 14:30) with button "Notify matching donors" -> badge "Donors notified · Citizen app". "Stock by blood group": `[group, units, days of cover]` bars (red if <4 days, amber if <7). Warning alert title "Low stock: {groups with <4 d}" (District O−, AB−; State/Zonal/Central B−, AB−). "Organ waiting list" `[organ, people]` + kv "Median wait · kidney" = `scope.waitKidney`, "Certified transplant centres" = `scope.txCentres`. Blood banks table `[name, units, cover days]` with state Low (<4 d, danger), Watch (<7, warning), else Good (success). Donation camps = `scope.camps` `{name, meta, target}`. "Call for donors" -> Alerts prefilled "Blood donors needed: {low groups}" / "Your nearest blood bank is running low. If you are eligible, please donate this week. Open CareFusion to see the nearest bank and its hours."
- **Audit & security**: 4 KPI cards = `CFG.audit` (`[label, value, unit, hint, trend, tone]`); "Flagged events" = `CFG.flags` `[event, role, facility, when, severity, ref]` (all open initially; Justified / Escalate -> toast "Escalated to {escalateTo}"); "Break-glass · 12 weeks" bar chart (generated, see G); "Access rules in force": Doctor session length 30 min; Break-glass review window 72 h; Admin sign-in `scope.mfa`; Failed sign-ins before lock 5; Audit log retention 10 years.
- **Reports**: period select Last 7 days / Last 30 days (default) / This quarter / This financial year; 6 report cards (`CFG.reports`; identical titles/frequencies at all levels, descriptions say "for the district/state/zone/country"): Monthly health summary (Monthly, key `health_summary`), Disease surveillance (IDSP format) (Weekly, `idsp_weekly`), Blood & organ network (Weekly, `blood_organ`), Registration coverage (Monthly, `coverage`), Audit & access (On demand, `audit_access`), Facility directory (On demand, `facilities`). CSV/PDF buttons add a row to "Recent exports" (kept 30 days) named `{key}_{period lowercased, spaces->hyphens}.{csv|pdf}`, by = person, at "Just now", size "84 KB" (csv) / "1.2 MB" (pdf); list capped at 6; seed exports in `CFG.exports`.
- **Directory**: generated, see G (18 doctors / 18 hospitals & facilities / 18 staff; status filter All/Active/Pending/Suspended; stat cards Doctors, Facilities, Staff, Needs attention = pending count with hint "{suspended} suspended · rest pending"). Citizens are never listed.
- **Admin accounts**: form (Full name "As on Aadhaar", Official email "name@gov.in" optional, Covers = unit select defaulting to first unit, Nomination order number e.g. "G.O. DEMO-114/2026"); "Step 1 of 2"; two-person sign-off panel (requester = person, second approver = `secondAdmin`); rules: "Neither signer can approve their own account." / "The new admin is verified by Aadhaar e-KYC and a hardware security key." / "Requests expire after 72 hours without the second signature." Table "Admins you manage" = `CFG.admins` `[name, role, covers, since]`, Security key = "Registered" (new row "Activation sent").
- **Audit log (logs)**: 6 type chips All / Record access / Break-glass / Admin / Exports / Sign-in; text filter; table Time · Level (INFO / OK / NOTICE / ALERT) · Event · Actor · Where · Ref. Generated (G). Event templates `LOGT` (type, action, actor role, tag): [access, "Session opened with citizen key", Doctor, info]; [access, "Session ended by citizen", Citizen, info]; [breakglass, "Break-glass access · casualty", Doctor, danger]; [admin, "Approved hospital admin", Admin, ok]; [admin, "Role changed: nurse → charge nurse", Hospital admin, info]; [export, "Report exported (de-identified)", Admin, warn]; [signin, "Failed sign-in · account locked", Nurse, danger]; [signin, "Security key registered", Admin, ok]; [access, "Lab result uploaded to order", Lab tech, info]; [admin, "Health alert broadcast", Admin, warn].
- **System settings (Central only)** "Global flags": `SYS_FLAGS` `[key, label, description, default]`:

| key | label | description | default |
| --- | --- | --- | --- |
| maint | Maintenance mode | Citizens and staff see a notice; only emergency access and break-glass keep working. | Off |
| ai | AI features | AI Health Chat, image analysis and doctor assist. Turning off hides AI outputs everywhere. | On |
| reg | New registrations | Citizen and doctor sign-ups. Existing accounts are not affected. | On |
| sms | SMS gateway | One-time codes and alert SMS to phones without the app. | On |
| bg | Break-glass access | Emergency access without a citizen key. Needs a reason and is reviewed in 72 h. | On |

Change history seed (setting, changed to, by, when): AI features / On / S. Banerjee / 2 Oct, 10:12; Maintenance mode / Off / NHA ops / 28 Sep, 04:30; SMS gateway / On / S. Banerjee / 12 Sep, 18:05 (new rows prepended, max 6). Confirm texts: maintenance on = "Every citizen and staff app will show a maintenance notice. Only emergency access and break-glass keep working. A notice is sent to all apps now."; AI off = "AI Health Chat, image analysis and doctor assist will be hidden everywhere until you turn them back on."; break-glass off = "Doctors will not be able to open records in an emergency without a citizen key. Use only for a confirmed security incident."; other = "This change applies to the whole country immediately and is written to the audit log." Footnote: "Emergency access never turns off with maintenance. Break-glass stays available unless switched off on its own."
- **Grievances card (District and State overview)**: first 3 of (live `complaint` bus events not already present by ref) + `CFG.grievances`; statuses Open (warning) / Assigned to facility (info) / Resolved (success) / Escalated to State (danger); buttons Assign, Escalate (district role only), Close. Live row from seed s9: ref CMP-0412, title "Long OP wait" -> "Long OP wait", facility "Demo General Hospital", age "Today 14:02". So the District grievance card shows: CMP-0412 (live) + CMP-0398 + CMP-0405; the State card shows CMP-0412 (live) + CMP-0377 + CMP-0389.

### 4.6 Central-only: AI governance (`ai` section, from `CFG.models`, `CFG.safety`)
- Header: eyebrow "National · AI model governance", h1 "AI models in CareFusion", badge "Alpha · simulated outputs".
- KPI cards: Models in use = count of models whose status != "Pending" (4) "Across 4 modules"; Waiting for approval 1 (0 after approve/hold) "Needs 2 approvers"; Clinician agreement **91.4%** (up "1.2 pts since v3.1"); Drift alerts **1** "Image analysis · North-east".
- Model register rows (`models`: `[name, version, meta, drift, status, tone]`) — in the Central CFG (Section C.4). "Before any model goes live" checklist: Clinical validation on Indian data (Required); Safety board sign-off (2 of 3) (Required); Shadow run · 14 days, no patient impact (Required, info); Automatic rollback if drift passes 5% (Always on).
- Release request: "Clinical guidance LLM · v3.2 → v3.3"; "Submitted by the AI safety board · 14 Oct"; Agreement **93.1%**; Unsafe advice **0.02%**; Malayalam / Tamil **+4.2 pts**; Test cases **48,200**. Status "Waiting · 0 of 2" (warning) -> Approve (1 of 2) = "Approved · 1 of 2" (success) / Hold = "On hold" (neutral). Toasts: "Approved 1 of 2 · waiting for the AI safety board chair"; "Release on hold · submitter notified".
- AIInsight "Drift monitor": status uncertain, confidence 0.62, title "Image analysis agreement fell in the North-east", body "Chest X-ray agreement with radiologists dropped from 92% to 84% over 3 weeks. Most affected images come from two older scanner models.", evidence ["Agreement 92% → 84% (3 weeks)", "71% of disagreements from 2 scanner models", "Other zones unchanged"].
- "Clinician agreement · 12 weeks": guidance line ≈ `91 + 2*hs('a'+q)`; image line `92 - (q>8 ? (q-8)*2.6 : 0) + hs('b'+q)`; minimum 85% dashed (values in G.Central.3).
- "Safety reports from clinicians · last 30 days" = `CFG.safety` `[title, meta, status, tone]` (Section C.4).

---

## Section C — Per-level `CFG` (verbatim)

All four levels share the same key set. Key semantics:
`units` = `[code, name, gridCol, gridRow]` map tiles; `unitAdmins` = code -> admin name; `live` = baseline live doctor sessions (+`jitter`); `popN` = population; `regNow` = ABHA-registered citizens now; `facTotal` = facilities; `bgWeekly` = weekly break-glass baseline; `dzBase` = weekly baseline per disease; `anomaly` = outbreak narrative; `kpis` = `[label, value, unit, hint, trend, icon, tone]`; `flags` = `[event, role, facility, when, severity(danger|warning|info), ref]`; `blood` = `[group, units, days]`; `organs` = `[organ, waiting]`; `banks` = `[name, units, days]`; `mix` = facility mix `[label, count]`; `actions` = `[title, meta, status, tone]`; `directory` = `[type, count, % on platform]`; `audit` = `[label, value, unit, hint, trend, tone]`; `reports` = `[title, desc, freq, key]`; `admins` = `[name, role, covers, since]`.

### C.1 DistrictAdmin.dc.html — CFG (verbatim)

Scalars:

```json
{
 "id": "dist",
 "person": "Ajay Kumar",
 "roleLine": "District admin · Pathanamthitta",
 "today": "17 Oct 2026",
 "childLabel": "Health blocks",
 "childOne": "block",
 "scopeWord": "district",
 "small": false,
 "hasAI": false,
 "selDefault": "RNI",
 "live": 37,
 "jitter": 5,
 "popN": 1197000,
 "regNow": 842000,
 "facTotal": 214,
 "bgWeekly": 4,
 "apMonthBase": 11,
 "apRejBase": 2,
 "secondAdmin": "Dr. Meera Krishnan (DMO office)",
 "escalateTo": "the State admin (Kerala)",
 "fieldTeam": "District Rapid Response Team, Kozhencherry",
 "role": "district",
 "createLevel": "Block health admin",
 "grievOn": true,
 "mapRows": 4
}
```

**units** (12) — `[code, name, gridCol, gridRow]`:

```json
[
  ["PLK","Pulikeezhu",0,0],
  ["TVL","Thiruvalla",1,0],
  ["MLY","Mallappally",2,0],
  ["VNK","Vennikulam",3,0],
  ["KZC","Kozhencherry",1,1],
  ["ELT","Elanthoor",2,1],
  ["RNI","Ranni",3,1],
  ["PRN","Perunad",4,1],
  ["PDM","Pandalam",1,2],
  ["PTA","Pathanamthitta",2,2],
  ["KNI","Konni",3,2],
  ["ADR","Adoor",2,3]
]
```

**unitAdmins**:

```json
{ "RNI": "Dr. Lissy John", "PRN": "Dr. Shibu George", "TVL": "Dr. Anil Mathew", "ADR": "Dr. Priya Das" }
```

**dzBase**:

```json
{ "dengue": 46, "fever": 820, "lepto": 9 }
```

**anomaly**:

```json
{ "disease": "lepto", "hot": [ "RNI", "PRN" ], "conf": 0.78, "title": "Leptospirosis rising in Ranni and Perunad", "body": "23 cases this week across the two blocks, 2.6× the 5-year baseline for week 42. The rise began 6 days after the 8 Oct flooding along the Pamba.", "evidence": [ "23 cases vs baseline 9 (week 42)", "Onset clustered 6–11 days after flooding", "61% of cases are farm or cleanup workers" ] }
```

**draft**:

```json
{ "title": "Leptospirosis advisory — Ranni & Perunad", "msg": "If you worked in flood water or mud this month, get free doxycycline from your nearest PHC. Wear boots and gloves while cleaning. See a doctor if you have fever with muscle pain." }
```

**scheduled**:

```json
[
  {"title":"Heatwave — stay indoors 12:00–16:00","type":"emergency","target":"Whole district","when":"Today 09:00","reach":"8,12,400","status":"Sent"},
  {"title":"Dengue — dry day every Sunday","type":"advisory","target":"Adoor, Pandalam","when":"Sun 19 Oct, 07:00","reach":"1,62,300","status":"Scheduled"},
  {"title":"Sabarimala season health camps open","type":"advisory","target":"Ranni, Perunad","when":"15 Nov, 06:00","reach":"1,08,900","status":"Scheduled"},
  {"title":"Flood: boil drinking water","type":"emergency","target":"Ranni, Kozhencherry","when":"9 Oct, 05:40","reach":"1,94,000","status":"Sent"}
]
```

**approvals**:

```json
[
  {"name":"Dr. Thomas Kurian","role":"Hospital admin","org":"St. Gregorios Demo Hospital, Ranni (private)","ref":"HFR DEMO-IN3210-7781","when":"2 days ago","checks":["HFR verified","Aadhaar e-KYC","Licence valid to 2028"]},
  {"name":"Bindu Rajan","role":"Pharmacy admin","org":"Jan Aushadhi Demo Kendra, Adoor","ref":"Drug licence DEMO-DL-KL-3307","when":"3 days ago","checks":["Drug licence verified","Aadhaar e-KYC","Pharmacist reg. KSPC"]},
  {"name":"Dr. Shibu George","role":"Hospital admin","org":"PHC Perunad (Government)","ref":"G.O. DEMO-GO-118/2026","when":"5 days ago","checks":["HFR verified","Government order","Aadhaar e-KYC"]},
  {"name":"Ancy Varghese","role":"Pharmacy admin","org":"Care Plus Demo Pharmacy, Thiruvalla","ref":"Drug licence DEMO-DL-KL-2988","when":"6 days ago","flag":true,"checks":["Aadhaar e-KYC","!Licence expires in 20 days","!1 open audit flag"]},
  {"name":"Suma Thomas","role":"Pharmacy admin","org":"Demo Hospital Pharmacy, Pathanamthitta","ref":"Drug licence DEMO-DL-KL-2041","when":"12 Oct","status":"approved","checks":["Drug licence verified","Aadhaar e-KYC"]}
]
```

**flags**:

```json
[
  ["Break-glass access with no admission recorded","Doctor","Demo Taluk Hospital, Thiruvalla","Today 03:12","danger","DEMO-AUD-91F2"],
  ["14 prescriptions dispensed in 10 minutes","Pharmacist","Care Plus Demo Pharmacy","Yesterday 22:40","warning","DEMO-AUD-88C1"],
  ["Lab upload to an order closed 3 days earlier","Lab tech","PHC Elanthoor","15 Oct, 16:05","warning","DEMO-AUD-87A0"],
  ["9 failed sign-ins, account locked","Nurse","Demo District Hospital, Kozhencherry","14 Oct, 07:58","info","DEMO-AUD-86D4"],
  ["Same doctor opened 38 records in one shift","Doctor","Demo General Hospital","13 Oct, 19:20","warning","DEMO-AUD-85B9"]
]
```

**blood**:

```json
[
  ["O+",412,11],
  ["B+",338,10],
  ["A+",251,9],
  ["AB+",74,8],
  ["O−",31,3],
  ["B−",28,4],
  ["A−",19,5],
  ["AB−",9,3]
]
```

**organs**:

```json
[
  ["Kidney",148],
  ["Cornea",92],
  ["Liver",31],
  ["Heart",6],
  ["Lungs",2]
]
```

**banks**:

```json
[
  ["Demo District Hospital, Kozhencherry",486,9],
  ["Demo General Hospital, Adoor",318,7],
  ["Demo Taluk Hospital, Thiruvalla",221,5],
  ["Demo Medical College, Konni",137,3]
]
```

**mix**:

```json
[
  ["Government (DH, THQ, CHC, PHC)",65],
  ["Private hospitals & clinics",58],
  ["Pharmacies",79],
  ["Labs & imaging",12]
]
```

**kpis**:

```json
[
  ["Facilities on platform","214",null,"65 government · 149 private","6 joined this month","fac","blue"],
  ["Citizens registered","8.42","lakh",null,"6,120 this month","users","sage"],
  ["Doctors active","1,042",null,"96 used break-glass rules correctly","4.1% vs September","doc",null],
  ["Open health alerts","3",null,"1 emergency · 2 advisories",null,"al","peach"]
]
```

**actions**:

```json
[
  ["Doxycycline prophylaxis at 9 PHCs","Started 12 Oct · 3,410 doses given","In progress","info"],
  ["Fever clinics extended to 20:00","Ranni THQ, PHC Perunad","Active","success"],
  ["Water quality testing","28 wells tested, 6 unsafe","Action needed","warning"],
  ["Report to State surveillance unit","Sent 16 Oct, 18:00","Sent","neutral"]
]
```

**directory**:

```json
[
  ["District & taluk hospitals",7,100],
  ["CHC / PHC / FHC",58,100],
  ["Private hospitals",41,88],
  ["Clinics",17,64],
  ["Pharmacies",79,91],
  ["Labs & imaging",12,83]
]
```

**audit**:

```json
[
  ["Break-glass (30 days)","18",null,"16 justified, 2 open","-3 vs September","peach"],
  ["Reviewed within 72 h","89","%","Target 95%",null,"sage"],
  ["After-hours record opens","412",null,"Mostly casualty, 20:00–06:00",null,null],
  ["Failed admin sign-ins","6",null,"All blocked by security key",null,"blue"]
]
```

**exports**:

```json
[
  {"file":"idsp_weekly_wk41.csv","by":"Ajay Kumar","at":"13 Oct, 09:10","size":"62 KB"},
  {"file":"blood_organ_sep-2026.pdf","by":"Ajay Kumar","at":"2 Oct, 17:45","size":"1.1 MB"},
  {"file":"coverage_q2.csv","by":"Dr. Meera Krishnan","at":"30 Sep, 11:02","size":"88 KB"}
]
```

**reports**:

```json
[
  ["Monthly health summary","Registrations, sessions, facilities and alerts for the district","Monthly","health_summary"],
  ["Disease surveillance (IDSP format)","Weekly S, P and L form counts by unit","Weekly","idsp_weekly"],
  ["Blood & organ network","Stock, donations, camps and waiting list","Weekly","blood_organ"],
  ["Registration coverage","ABHA-linked accounts by unit, age band and sex","Monthly","coverage"],
  ["Audit & access","Break-glass, session and admin activity","On demand","audit_access"],
  ["Facility directory","Every facility on the platform with its status","On demand","facilities"]
]
```

**scope**:

```json
{ "short": "Pathanamthitta", "level": "District", "title": "Pathanamthitta", "pop": "11.97 lakh", "peak": "52 at 11:00", "summary": "Leptospirosis is above baseline in two blocks after the floods, blood stock for negative groups is low, and 4 admin requests are waiting for you.", "childLabel": "Health blocks", "childOne": "block", "approvalsNote": "Approve hospital and pharmacy admins in Pathanamthitta. Government facilities need a Government order; private ones need a valid licence.", "apMonth": "Hospitals 7 · pharmacies 4", "checklist": [ "Health Facility Registry (HFR) ID matches the facility", "Licence or Government order is valid and not expiring in 30 days", "Applicant is verified by Aadhaar e-KYC and has two-step sign-in", "No open audit flags against the facility" ], "langs": "Malayalam and English", "sender": "District Medical Office, Pathanamthitta", "bloodSub": "4 blood banks and the organ pledges of citizens living in the district. Waiting-list numbers are counts only.", "banks": "4 blood banks", "banksShort": "4 banks · updated hourly", "donors": "31,240", "donorsHint": "9,880 donated this year", "pledges": "6,412", "pledgesHint": "212 this month", "tx": "14", "txUp": "3 more than 2025", "waitKidney": "2.4 years", "txCentres": "2", "mfa": "Security key", "camps": [ { "name": "NSS College, Pandalam", "meta": "Wed 22 Oct · 09:00–14:00", "target": "120 units" }, { "name": "KSRTC depot, Thiruvalla", "meta": "Sun 26 Oct · 08:00–13:00", "target": "80 units" }, { "name": "Pre-Sabarimala camp, Ranni", "meta": "Sat 8 Nov · 08:00–16:00", "target": "200 units" } ] }
```

**inbox**:

```json
{ "doctor": [ { "name": "Dr. Asha Philip", "meta": "General medicine · PHC Elanthoor · HPR verified", "prio": "normal", "due": "Due 20 Oct" }, { "name": "Dr. Vinod Menon", "meta": "Paediatrics · Demo Taluk Hospital, Thiruvalla", "prio": "urgent", "due": "Due today" }, { "name": "Dr. Reshma K", "meta": "Gynaecology · Private clinic, Adoor · licence check", "prio": "normal", "due": "Due 22 Oct" } ], "admin": [ { "name": "Dr. Thomas Kurian", "meta": "Hospital admin · St. Gregorios Demo Hospital", "prio": "urgent", "due": "Due 18 Oct" }, { "name": "Bindu Rajan", "meta": "Pharmacy admin · Jan Aushadhi Demo Kendra", "prio": "normal", "due": "Due 21 Oct" } ], "flagged": [ { "name": "Account DEMO-U-88231", "meta": "Citizen · 4 failed face checks in 1 hour", "prio": "urgent", "due": "Due today" }, { "name": "Care Plus Demo Pharmacy", "meta": "Pharmacy · 14 dispenses in 10 min", "prio": "normal", "due": "Due 19 Oct" } ] }
```

**incoming**:

```json
{ "type": "doctor", "name": "Dr. Gopika Nair", "meta": "Dermatology · Demo District Hospital, Kozhencherry", "prio": "normal", "due": "Due 24 Oct" }
```

**admins**:

```json
[
  ["Dr. Lissy John","Block health admin","Ranni","3 Mar 2026"],
  ["Dr. Shibu George","Block health admin","Perunad","9 Apr 2026"],
  ["Dr. Anil Mathew","Block health admin","Thiruvalla","21 Jan 2026"],
  ["Dr. Priya Das","Block health admin","Adoor","2 Jun 2026"]
]
```

**grievances**:

```json
[
  {"ref":"CMP-0398","title":"Ambulance took 50 minutes","facility":"108 service · Konni","age":"3 days"},
  {"ref":"CMP-0405","title":"Medicine out of stock twice","facility":"PHC Elanthoor","age":"2 days"}
]
```

**funnel**:

```json
[ 148, 131, 120, 109 ]
```

**decision**:

```json
[ 3.1, 2.8, 2.6, 2.3, 2, 1.8 ]
```

### C.2 StateAdmin.dc.html — CFG (verbatim)

Scalars:

```json
{
 "id": "state",
 "person": "Latha Nair",
 "roleLine": "State admin · Kerala",
 "today": "17 Oct 2026",
 "childLabel": "Districts",
 "childOne": "district",
 "scopeWord": "state",
 "small": false,
 "hasAI": false,
 "selDefault": "TVM",
 "live": 1284,
 "jitter": 60,
 "popN": 34600000,
 "regNow": 24100000,
 "facTotal": 9860,
 "bgWeekly": 62,
 "apMonthBase": 3,
 "apRejBase": 1,
 "secondAdmin": "Additional Director (Public Health)",
 "escalateTo": "the Zonal admin (South)",
 "fieldTeam": "State Rapid Response Team, Thiruvananthapuram",
 "role": "state",
 "createLevel": "District admin",
 "grievOn": true,
 "mapRows": 8
}
```

**units** (14) — `[code, name, gridCol, gridRow]`:

```json
[
  ["KGD","Kasaragod",0,0],
  ["KNR","Kannur",0,1],
  ["WYD","Wayanad",1,1],
  ["KZD","Kozhikode",0,2],
  ["MLP","Malappuram",1,2],
  ["TSR","Thrissur",1,3],
  ["PKD","Palakkad",2,3],
  ["EKM","Ernakulam",1,4],
  ["IDK","Idukki",2,4],
  ["ALP","Alappuzha",1,5],
  ["KTM","Kottayam",2,5],
  ["KLM","Kollam",2,6],
  ["PTA","Pathanamthitta",3,6],
  ["TVM","Thiruvananthapuram",2,7]
]
```

**unitAdmins**:

```json
{ "PTA": "Ajay Kumar", "TVM": "Dr. Sajeev K", "EKM": "Dr. Mini Joseph", "WYD": "Vacant · request pending", "KGD": "Vacant · request pending" }
```

**dzBase**:

```json
{ "dengue": 1180, "fever": 31000, "lepto": 210 }
```

**anomaly**:

```json
{ "disease": "dengue", "hot": [ "TVM", "KLM" ], "conf": 0.81, "title": "Dengue clusters on the southern coast", "body": "Thiruvananthapuram and Kollam reported 412 cases this week, 1.9× their baseline. 7 clusters sit along the coastal belt, where breeding sites rose after early rain.", "evidence": [ "412 cases vs baseline 216 (TVM + KLM)", "7 clusters within 2 km of the coast", "NS1 positivity up from 9% to 17%" ] }
```

**draft**:

```json
{ "title": "Dengue advisory — Thiruvananthapuram & Kollam", "msg": "Dengue is rising in your area. Empty standing water around your home every Sunday. If you have high fever with body ache or rash, visit a government hospital — testing is free." }
```

**scheduled**:

```json
[
  {"title":"Heatwave — 7 districts on orange alert","type":"emergency","target":"Palakkad, Thrissur, Kollam +4","when":"Today 08:30","reach":"1.42 cr","status":"Sent"},
  {"title":"Dengue dry day — every Sunday","type":"advisory","target":"Whole state","when":"Sun 19 Oct, 07:00","reach":"2.41 cr","status":"Scheduled"},
  {"title":"Nipah: no new cases, stay alert","type":"advisory","target":"Kozhikode, Malappuram","when":"14 Oct, 10:00","reach":"71.2 lakh","status":"Sent"},
  {"title":"Flood: boil drinking water","type":"emergency","target":"Pathanamthitta, Alappuzha","when":"9 Oct, 05:40","reach":"29.4 lakh","status":"Sent"}
]
```

**approvals**:

```json
[
  {"name":"Dr. Rekha S","role":"District admin","org":"Wayanad","ref":"G.O.(Rt) DEMO-2231/2026/H&FWD","when":"2 days ago","checks":["Nomination letter","Aadhaar e-KYC","Security key"]},
  {"name":"Manoj P","role":"District admin","org":"Kasaragod","ref":"G.O.(Rt) DEMO-2240/2026/H&FWD","when":"4 days ago","checks":["Nomination letter","Aadhaar e-KYC","!Security key not registered"]},
  {"name":"Demo Specialty Hospital, Kochi","role":"Escalation · hospital admin","org":"Raised by Ernakulam DMO","ref":"HFR DEMO-IN3207-1190","when":"6 days ago","flag":true,"checks":["!Licence name mismatch","HFR verified"]},
  {"name":"Dr. Haris V","role":"District admin (acting)","org":"Malappuram","ref":"G.O.(Rt) DEMO-2252/2026/H&FWD","when":"Yesterday","checks":["Nomination letter","Aadhaar e-KYC","Security key"]},
  {"name":"Ajay Kumar","role":"District admin","org":"Pathanamthitta","ref":"G.O.(Rt) DEMO-2107/2026/H&FWD","when":"1 Sep","status":"approved","checks":["Nomination letter","Security key"]}
]
```

**flags**:

```json
[
  ["Break-glass access with no admission recorded","Doctor","Demo General Hospital, Kollam","Today 03:12","danger","DEMO-AUD-91F2"],
  ["14 prescriptions dispensed in 10 minutes","Pharmacist","Demo Pharmacy, Kozhikode","Yesterday 22:40","warning","DEMO-AUD-88C1"],
  ["Lab upload to an order closed 3 days earlier","Lab tech","Demo Taluk Hospital, Chalakudy","15 Oct, 16:05","warning","DEMO-AUD-87A0"],
  ["9 failed sign-ins, account locked","Nurse","Demo Medical College, Thrissur","14 Oct, 07:58","info","DEMO-AUD-86D4"],
  ["Same doctor opened 38 records in one shift","Doctor","Demo District Hospital, Palakkad","13 Oct, 19:20","warning","DEMO-AUD-85B9"]
]
```

**blood**:

```json
[
  ["O+",6120,10],
  ["B+",4980,9],
  ["A+",3710,9],
  ["AB+",1090,8],
  ["O−",410,4],
  ["B−",352,3],
  ["A−",268,5],
  ["AB−",121,3]
]
```

**organs**:

```json
[
  ["Kidney",2140],
  ["Cornea",1320],
  ["Liver",412],
  ["Heart",58],
  ["Lungs",21]
]
```

**banks**:

```json
[
  ["Demo Medical College, Thiruvananthapuram",2410,8],
  ["Demo Medical College, Kozhikode",2190,9],
  ["Demo General Hospital, Ernakulam",1660,6],
  ["Demo Medical College, Thrissur",1310,7],
  ["Demo District Hospital, Kollam",780,3],
  ["Demo District Hospital, Wayanad",402,4]
]
```

**mix**:

```json
[
  ["Government",1910],
  ["Private hospitals & clinics",3640],
  ["Pharmacies",3820],
  ["Labs & imaging",490]
]
```

**kpis**:

```json
[
  ["Facilities on platform","9,860",null,"1,910 government","184 joined this month","fac","blue"],
  ["Citizens registered","2.41","crore","70% of residents","2.1 lakh this month","users","sage"],
  ["Doctors active","38,400",null,"Across 14 districts","3.2% vs September","doc",null],
  ["Open health alerts","6",null,"2 emergency · 4 advisories",null,"al","peach"]
]
```

**actions**:

```json
[
  ["Fogging & source reduction","TVM: 41 wards · KLM: 18 wards","In progress","info"],
  ["NS1 kits moved to coastal PHCs","6,000 kits sent 15 Oct","Done","success"],
  ["Platelet stock check","Kollam DH under 3 days","Action needed","warning"],
  ["Report to Zonal and IDSP","Sent 16 Oct, 19:30","Sent","neutral"]
]
```

**directory**:

```json
[
  ["Medical colleges",33,100],
  ["District & taluk hospitals",102,100],
  ["CHC / PHC / FHC",1102,99],
  ["Private hospitals",1240,81],
  ["Pharmacies",3820,87],
  ["Labs & imaging",490,76]
]
```

**audit**:

```json
[
  ["Break-glass (30 days)","264",null,"251 justified, 13 open","-6 vs September","peach"],
  ["Reviewed within 72 h","93","%","Target 95%","2 pts","sage"],
  ["After-hours record opens","6,120",null,"Mostly casualty and ICU",null,null],
  ["Admin accounts","1,184",null,"All with security keys",null,"blue"]
]
```

**exports**:

```json
[
  {"file":"idsp_weekly_wk41.csv","by":"Latha Nair","at":"13 Oct, 10:02","size":"410 KB"},
  {"file":"health_summary_sep-2026.pdf","by":"Latha Nair","at":"3 Oct, 16:20","size":"3.4 MB"},
  {"file":"coverage_q2.csv","by":"State IT cell","at":"30 Sep, 11:02","size":"1.2 MB"}
]
```

**reports**:

```json
[
  ["Monthly health summary","Registrations, sessions, facilities and alerts for the state","Monthly","health_summary"],
  ["Disease surveillance (IDSP format)","Weekly S, P and L form counts by unit","Weekly","idsp_weekly"],
  ["Blood & organ network","Stock, donations, camps and waiting list","Weekly","blood_organ"],
  ["Registration coverage","ABHA-linked accounts by unit, age band and sex","Monthly","coverage"],
  ["Audit & access","Break-glass, session and admin activity","On demand","audit_access"],
  ["Facility directory","Every facility on the platform with its status","On demand","facilities"]
]
```

**scope**:

```json
{ "short": "Kerala", "level": "State", "title": "Kerala", "pop": "3.46 crore", "peak": "1,512 at 11:00", "summary": "Dengue is rising on the southern coast, Wayanad and Kasaragod still need district admins, and stock of negative blood groups is low in Kollam.", "childLabel": "Districts", "childOne": "district", "approvalsNote": "Approve district admins and handle escalations raised by district medical officers.", "apMonth": "District admins 2 · escalations 1", "checklist": [ "Nomination letter from the appointing authority", "Applicant is verified by Aadhaar e-KYC", "Hardware security key registered", "Previous holder handed over and was signed out everywhere" ], "langs": "Malayalam, English, Tamil, Kannada", "sender": "Directorate of Health Services, Kerala", "bloodSub": "Blood banks across 14 districts and the state organ network. Waiting-list numbers are counts only.", "banks": "186 blood banks", "banksShort": "largest 6 of 186", "donors": "4.6 lakh", "donorsHint": "1.38 lakh donated this year", "pledges": "1.92 lakh", "pledgesHint": "3,240 this month", "tx": "318", "txUp": "12% vs 2025", "waitKidney": "2.1 years", "txCentres": "26", "mfa": "Security key", "camps": [ { "name": "University College, Thiruvananthapuram", "meta": "Tue 21 Oct · 09:00–15:00", "target": "300 units" }, { "name": "Infopark, Kochi", "meta": "Fri 24 Oct · 10:00–17:00", "target": "450 units" }, { "name": "Kozhikode beach camp", "meta": "Sun 2 Nov · 08:00–14:00", "target": "250 units" } ] }
```

**inbox**:

```json
{ "doctor": [ { "name": "Dr. Arvind Pillai", "meta": "Cardiology · Demo Medical College, Kozhikode · foreign degree", "prio": "urgent", "due": "Due 18 Oct" }, { "name": "Dr. Neha Thomas", "meta": "Escalated by Ernakulam DMO · name mismatch", "prio": "normal", "due": "Due 23 Oct" } ], "admin": [ { "name": "Dr. Rekha S", "meta": "District admin · Wayanad", "prio": "urgent", "due": "Due today" }, { "name": "Manoj P", "meta": "District admin · Kasaragod · key missing", "prio": "urgent", "due": "Due 19 Oct" }, { "name": "Dr. Haris V", "meta": "District admin (acting) · Malappuram", "prio": "normal", "due": "Due 22 Oct" } ], "flagged": [ { "name": "Demo Specialty Hospital, Kochi", "meta": "Hospital · licence name mismatch", "prio": "normal", "due": "Due 21 Oct" }, { "name": "Doctor DEMO-HPR-71-0451", "meta": "Opened 38 records in one shift · Thrissur", "prio": "urgent", "due": "Due 18 Oct" } ] }
```

**incoming**:

```json
{ "type": "admin", "name": "Dr. Suresh Babu", "meta": "District admin · Idukki · nomination uploaded", "prio": "normal", "due": "Due 25 Oct" }
```

**admins**:

```json
[
  ["Ajay Kumar","District admin","Pathanamthitta","1 Sep 2026"],
  ["Dr. Sajeev K","District admin","Thiruvananthapuram","12 Feb 2026"],
  ["Dr. Mini Joseph","District admin","Ernakulam","30 Mar 2026"],
  ["Dr. Fasal Rahman","District admin","Kozhikode","8 May 2026"]
]
```

**grievances**:

```json
[
  {"ref":"CMP-0377","title":"Escalated: denied free dialysis","facility":"Demo General Hospital, Kollam","age":"6 days"},
  {"ref":"CMP-0389","title":"Escalated: staff asked for payment","facility":"Demo PHC, Palakkad","age":"4 days"}
]
```

**funnel**:

```json
[ 2140, 1910, 1780, 1652 ]
```

**decision**:

```json
[ 3.6, 3.3, 3, 2.6, 2.4, 2.2 ]
```

### C.3 ZonalAdmin.dc.html — CFG (verbatim)

Scalars:

```json
{
 "id": "zone",
 "person": "R. Venkatesh",
 "roleLine": "Zonal admin · South zone",
 "today": "17 Oct 2026",
 "childLabel": "States & UTs",
 "childOne": "state",
 "scopeWord": "zone",
 "small": true,
 "hasAI": false,
 "selDefault": "KA",
 "live": 9820,
 "jitter": 300,
 "popN": 256000000,
 "regNow": 179000000,
 "facTotal": 142000,
 "bgWeekly": 410,
 "apMonthBase": 1,
 "apRejBase": 0,
 "secondAdmin": "Deputy Director General (South)",
 "escalateTo": "the Central admin (MoHFW)",
 "fieldTeam": "Zonal entomology team, Bengaluru",
 "role": "zonal",
 "createLevel": "State admin",
 "grievOn": false,
 "mapRows": 7
}
```

**units** (7) — `[code, name, gridCol, gridRow]`:

```json
[
  ["TG","Telangana",3,4],
  ["KA","Karnataka",2,5],
  ["AP","Andhra Pradesh",3,5],
  ["LD","Lakshadweep",0,6],
  ["KL","Kerala",2,6],
  ["TN","Tamil Nadu",3,6],
  ["PY","Puducherry",4,6]
]
```

**unitAdmins**:

```json
{ "KL": "Latha Nair", "TN": "Vacant · request pending", "KA": "Dr. Shalini Rao", "AP": "K. Srinivas", "TG": "Dr. Farhan Ali", "PY": "M. Selvi", "LD": "Vacant · request pending" }
```

**dzBase**:

```json
{ "dengue": 9800, "fever": 280000, "lepto": 1100 }
```

**anomaly**:

```json
{ "disease": "dengue", "hot": [ "KA", "KL" ], "conf": 0.74, "title": "Dengue up in Karnataka and Kerala", "body": "Karnataka (mainly Bengaluru Urban) and Kerala together reported 5,940 cases this week, 1.7× baseline. Tamil Nadu and Andhra Pradesh are within the normal range.", "evidence": [ "5,940 cases vs baseline 3,480", "Bengaluru Urban: 41% of Karnataka cases", "Serotype DENV-2 in 68% of typed samples" ] }
```

**draft**:

```json
{ "title": "Dengue advisory — Karnataka & Kerala", "msg": "Dengue is rising in your state. Empty standing water every week. If you have high fever with body ache, visit a government hospital — testing is free." }
```

**scheduled**:

```json
[
  {"title":"Cyclone watch — coastal Andhra Pradesh","type":"emergency","target":"Andhra Pradesh, Puducherry","when":"Today 06:15","reach":"3.9 cr","status":"Sent"},
  {"title":"Dengue dry day — every Sunday","type":"advisory","target":"Karnataka, Kerala","when":"Sun 19 Oct, 07:00","reach":"6.3 cr","status":"Scheduled"},
  {"title":"Heatwave advisory","type":"advisory","target":"Telangana","when":"12 Oct, 08:00","reach":"2.6 cr","status":"Sent"}
]
```

**approvals**:

```json
[
  {"name":"K. Saravanan","role":"State admin","org":"Tamil Nadu","ref":"G.O. DEMO-TN-HFW-412","when":"3 days ago","checks":["Nomination letter","Aadhaar e-KYC","Security key"]},
  {"name":"Dr. Ayesha Fathima","role":"UT admin","org":"Lakshadweep","ref":"Order DEMO-LD-H-77","when":"5 days ago","checks":["Nomination letter","Aadhaar e-KYC","!Security key not registered"]},
  {"name":"Puducherry district admins","role":"Escalation · 2 requests","org":"Waiting 21 days at UT level","ref":"DEMO-ESC-PY-009","when":"6 days ago","flag":true,"checks":["!Over 14-day limit","Documents complete"]},
  {"name":"Latha Nair","role":"State admin","org":"Kerala","ref":"G.O. DEMO-KL-HFW-1180","when":"2 Jul","status":"approved","checks":["Nomination letter","Security key"]}
]
```

**flags**:

```json
[
  ["Break-glass access with no admission recorded","Doctor","Demo Medical College, Mysuru","Today 03:12","danger","DEMO-AUD-91F2"],
  ["14 prescriptions dispensed in 10 minutes","Pharmacist","Demo Pharmacy, Chennai","Yesterday 22:40","warning","DEMO-AUD-88C1"],
  ["Lab upload to an order closed 3 days earlier","Lab tech","Demo Lab, Vijayawada","15 Oct, 16:05","warning","DEMO-AUD-87A0"],
  ["9 failed sign-ins, account locked","Nurse","Demo General Hospital, Hyderabad","14 Oct, 07:58","info","DEMO-AUD-86D4"],
  ["Same doctor opened 38 records in one shift","Doctor","Demo District Hospital, Madurai","13 Oct, 19:20","warning","DEMO-AUD-85B9"]
]
```

**blood**:

```json
[
  ["O+",48200,9],
  ["B+",41300,9],
  ["A+",29800,8],
  ["AB+",8700,7],
  ["O−",3100,4],
  ["B−",2600,3],
  ["A−",2100,5],
  ["AB−",900,3]
]
```

**organs**:

```json
[
  ["Kidney",18400],
  ["Cornea",9100],
  ["Liver",3900],
  ["Heart",410],
  ["Lungs",160]
]
```

**banks**:

```json
[
  ["Tamil Nadu (412 banks)",41200,9],
  ["Karnataka (298 banks)",30100,7],
  ["Andhra Pradesh (241 banks)",21800,8],
  ["Telangana (196 banks)",18900,6],
  ["Kerala (186 banks)",17050,8],
  ["Puducherry (21 banks)",1600,3]
]
```

**mix**:

```json
[
  ["Government",28400],
  ["Private hospitals & clinics",51200],
  ["Pharmacies",56100],
  ["Labs & imaging",6300]
]
```

**kpis**:

```json
[
  ["Facilities on platform","1.42","lakh","28,400 government","2,410 joined this month","fac","blue"],
  ["Citizens registered","17.9","crore","70% of residents","18.2 lakh this month","users","sage"],
  ["Doctors active","4.1","lakh","Across 7 states & UTs","2.8% vs September","doc",null],
  ["Open health alerts","9",null,"2 emergency · 7 advisories",null,"al","peach"]
]
```

**actions**:

```json
[
  ["Vector control support to Bengaluru","40 entomologists deployed","In progress","info"],
  ["Test kits moved from TN reserve","45,000 NS1 kits","Done","success"],
  ["Puducherry admin backlog","2 requests over limit","Action needed","warning"],
  ["Zonal report to MoHFW","Sent 16 Oct, 20:00","Sent","neutral"]
]
```

**directory**:

```json
[
  ["Medical colleges",412,100],
  ["Government hospitals",4810,99],
  ["CHC / PHC",23180,97],
  ["Private hospitals",19400,78],
  ["Pharmacies",56100,84],
  ["Labs & imaging",6300,72]
]
```

**audit**:

```json
[
  ["Break-glass (30 days)","2,184",null,"2,091 justified, 93 open","-4% vs September","peach"],
  ["Reviewed within 72 h","91","%","Lowest: Puducherry 78%",null,"sage"],
  ["States meeting target","4","of 7","Target: 95% reviewed",null,null],
  ["Admin accounts","9,640",null,"All with security keys",null,"blue"]
]
```

**exports**:

```json
[
  {"file":"health_summary_sep-2026.pdf","by":"R. Venkatesh","at":"4 Oct, 12:30","size":"6.8 MB"},
  {"file":"idsp_weekly_wk41.csv","by":"Zonal cell","at":"13 Oct, 11:00","size":"2.4 MB"}
]
```

**reports**:

```json
[
  ["Monthly health summary","Registrations, sessions, facilities and alerts for the zone","Monthly","health_summary"],
  ["Disease surveillance (IDSP format)","Weekly S, P and L form counts by unit","Weekly","idsp_weekly"],
  ["Blood & organ network","Stock, donations, camps and waiting list","Weekly","blood_organ"],
  ["Registration coverage","ABHA-linked accounts by unit, age band and sex","Monthly","coverage"],
  ["Audit & access","Break-glass, session and admin activity","On demand","audit_access"],
  ["Facility directory","Every facility on the platform with its status","On demand","facilities"]
]
```

**scope**:

```json
{ "short": "South zone", "level": "Zonal", "title": "the South zone", "pop": "25.6 crore", "peak": "11,940 at 11:00", "summary": "Dengue is up in Karnataka and Kerala, Tamil Nadu and Lakshadweep still need admins approved, and a cyclone watch is active for coastal Andhra Pradesh.", "childLabel": "States & UTs", "childOne": "state", "approvalsNote": "Approve state and UT admins in the South zone, and clear escalations that pass the 14-day limit.", "apMonth": "State admins 1", "checklist": [ "Nomination letter from the appointing authority", "Applicant is verified by Aadhaar e-KYC", "Hardware security key registered", "Previous holder handed over and was signed out everywhere" ], "langs": "Malayalam, Tamil, Kannada, Telugu, English", "sender": "MoHFW Regional Office, South zone", "bloodSub": "Blood banks and organ networks of 7 states and UTs, combined. Waiting-list numbers are counts only.", "banks": "1,354 blood banks", "banksShort": "by state", "donors": "38.2 lakh", "donorsHint": "11.6 lakh donated this year", "pledges": "21.4 lakh", "pledgesHint": "28,900 this month", "tx": "3,920", "txUp": "9% vs 2025", "waitKidney": "2.6 years", "txCentres": "214", "mfa": "Security key", "camps": [ { "name": "National Voluntary Blood Donation Day drive", "meta": "All states · 1 Oct–31 Oct", "target": "2.1 lakh units" }, { "name": "IT corridor camps, Hyderabad", "meta": "Sat 25 Oct", "target": "3,000 units" }, { "name": "Temple festival camps, Madurai", "meta": "Sun 2 Nov", "target": "1,200 units" } ] }
```

**ctxUnits** (29, defined in CFG but NOT referenced by any code — context tiles of the rest of India, same `[code,name,col,row]`; identical to Central units minus the 7 South-zone ones):

```json
[
  ["JK","Jammu & Kashmir",2,0],
  ["LA","Ladakh",3,0],
  ["PB","Punjab",1,1],
  ["HP","Himachal Pradesh",2,1],
  ["UK","Uttarakhand",3,1],
  ["CH","Chandigarh",1,2],
  ["HR","Haryana",2,2],
  ["DL","Delhi",3,2],
  ["UP","Uttar Pradesh",4,2],
  ["BR","Bihar",5,2],
  ["SK","Sikkim",6,2],
  ["AR","Arunachal Pradesh",7,2],
  ["RJ","Rajasthan",1,3],
  ["MP","Madhya Pradesh",2,3],
  ["CG","Chhattisgarh",3,3],
  ["JH","Jharkhand",4,3],
  ["WB","West Bengal",5,3],
  ["AS","Assam",6,3],
  ["NL","Nagaland",7,3],
  ["GJ","Gujarat",0,4],
  ["DN","Dadra & Nagar Haveli and Daman & Diu",1,4],
  ["MH","Maharashtra",2,4],
  ["OD","Odisha",4,4],
  ["ML","Meghalaya",6,4],
  ["MN","Manipur",7,4],
  ["GA","Goa",1,5],
  ["TR","Tripura",6,5],
  ["MZ","Mizoram",7,5],
  ["AN","Andaman & Nicobar",6,6]
]
```

**inbox**:

```json
{ "doctor": [ { "name": "Puducherry doctor backlog", "meta": "31 applications past 14 days", "prio": "urgent", "due": "Due today" } ], "admin": [ { "name": "K. Saravanan", "meta": "State admin · Tamil Nadu", "prio": "urgent", "due": "Due 19 Oct" }, { "name": "Dr. Ayesha Fathima", "meta": "UT admin · Lakshadweep · key missing", "prio": "normal", "due": "Due 23 Oct" } ], "flagged": [ { "name": "Demo Lab, Vijayawada", "meta": "Lab · uploads to closed orders", "prio": "normal", "due": "Due 22 Oct" }, { "name": "Admin DEMO-ADM-KA-114", "meta": "Signed in from 2 states in 1 hour", "prio": "urgent", "due": "Due today" } ] }
```

**incoming**:

```json
{ "type": "flagged", "name": "Demo Pharmacy, Chennai", "meta": "Pharmacy · Schedule X over-dispensing", "prio": "urgent", "due": "Due 18 Oct" }
```

**admins**:

```json
[
  ["Latha Nair","State admin","Kerala","2 Jul 2026"],
  ["Dr. Shalini Rao","State admin","Karnataka","18 May 2026"],
  ["K. Srinivas","State admin","Andhra Pradesh","4 Apr 2026"],
  ["Dr. Farhan Ali","State admin","Telangana","22 Jun 2026"],
  ["M. Selvi","UT admin","Puducherry","11 Mar 2026"]
]
```

**grievances**:

```json
[]
```

**funnel**:

```json
[ 18400, 16100, 15200, 14050 ]
```

**decision**:

```json
[ 4.2, 3.9, 3.5, 3.2, 2.9, 2.7 ]
```

### C.4 CentralAdmin.dc.html — CFG (verbatim)

Scalars:

```json
{
 "id": "central",
 "person": "S. Banerjee",
 "roleLine": "Central admin · MoHFW",
 "today": "17 Oct 2026",
 "childLabel": "States & UTs",
 "childOne": "state",
 "scopeWord": "country",
 "small": true,
 "hasAI": true,
 "selDefault": "BR",
 "live": 48210,
 "jitter": 900,
 "popN": 1420000000,
 "regNow": 784000000,
 "facTotal": 780000,
 "bgWeekly": 1900,
 "apMonthBase": 2,
 "apRejBase": 0,
 "secondAdmin": "Joint Secretary (Digital Health)",
 "escalateTo": "the National Health Authority security cell",
 "fieldTeam": "NCDC central surveillance unit",
 "role": "central",
 "createLevel": "Zonal admin",
 "grievOn": false,
 "mapRows": 7
}
```

**units** (36) — `[code, name, gridCol, gridRow]`:

```json
[
  ["JK","Jammu & Kashmir",2,0],
  ["LA","Ladakh",3,0],
  ["PB","Punjab",1,1],
  ["HP","Himachal Pradesh",2,1],
  ["UK","Uttarakhand",3,1],
  ["CH","Chandigarh",1,2],
  ["HR","Haryana",2,2],
  ["DL","Delhi",3,2],
  ["UP","Uttar Pradesh",4,2],
  ["BR","Bihar",5,2],
  ["SK","Sikkim",6,2],
  ["AR","Arunachal Pradesh",7,2],
  ["RJ","Rajasthan",1,3],
  ["MP","Madhya Pradesh",2,3],
  ["CG","Chhattisgarh",3,3],
  ["JH","Jharkhand",4,3],
  ["WB","West Bengal",5,3],
  ["AS","Assam",6,3],
  ["NL","Nagaland",7,3],
  ["GJ","Gujarat",0,4],
  ["DN","Dadra & Nagar Haveli and Daman & Diu",1,4],
  ["MH","Maharashtra",2,4],
  ["TG","Telangana",3,4],
  ["OD","Odisha",4,4],
  ["ML","Meghalaya",6,4],
  ["MN","Manipur",7,4],
  ["GA","Goa",1,5],
  ["KA","Karnataka",2,5],
  ["AP","Andhra Pradesh",3,5],
  ["TR","Tripura",6,5],
  ["MZ","Mizoram",7,5],
  ["LD","Lakshadweep",0,6],
  ["KL","Kerala",2,6],
  ["TN","Tamil Nadu",3,6],
  ["PY","Puducherry",4,6],
  ["AN","Andaman & Nicobar",6,6]
]
```

**unitAdmins**:

```json
{ "KL": "Latha Nair", "BR": "Dr. Nitin Prasad", "UP": "A. K. Mishra", "TN": "Vacant · request pending" }
```

**dzBase**:

```json
{ "dengue": 38000, "fever": 1840000, "lepto": 3600 }
```

**anomaly**:

```json
{ "disease": "fever", "hot": [ "BR", "UP", "JH" ], "conf": 0.69, "title": "Acute fever up in Bihar, eastern UP and Jharkhand", "body": "Acute febrile illness in these three states is 1.7× the 5-year baseline for week 42. Children under 15 make up 46% of cases; scrub typhus and Japanese encephalitis tests are pending in 3 districts.", "evidence": [ "3.1 lakh cases vs baseline 1.8 lakh", "46% of cases under 15 years", "Rise follows 3 weeks of flooding in north Bihar" ] }
```

**draft**:

```json
{ "title": "Fever advisory — Bihar, UP, Jharkhand", "msg": "Fever cases are rising, especially in children. Use bed nets, keep children fully covered at dusk, and visit a government hospital for any fever lasting more than 2 days — testing is free." }
```

**scheduled**:

```json
[
  {"title":"Cyclone watch — coastal Andhra Pradesh & Odisha","type":"emergency","target":"AP, Odisha, Puducherry","when":"Today 06:00","reach":"8.1 cr","status":"Sent"},
  {"title":"National dengue dry day","type":"advisory","target":"Whole country","when":"Sun 19 Oct, 07:00","reach":"78.4 cr","status":"Scheduled"},
  {"title":"Air quality — limit outdoor exercise","type":"advisory","target":"Delhi, Haryana, Punjab","when":"20 Oct, 06:00","reach":"5.6 cr","status":"Scheduled"},
  {"title":"Flood: boil drinking water","type":"emergency","target":"Bihar, Assam","when":"2 Oct, 05:10","reach":"9.8 cr","status":"Sent"}
]
```

**approvals**:

```json
[
  {"name":"Dr. P. Singh","role":"Zonal admin","org":"North zone","ref":"MoHFW order DEMO-Z/2026/31","when":"2 days ago","checks":["Nomination letter","Aadhaar e-KYC","Security key"]},
  {"name":"A. Das","role":"Zonal admin","org":"North-east zone","ref":"MoHFW order DEMO-Z/2026/34","when":"4 days ago","checks":["Nomination letter","Aadhaar e-KYC","!Security key not registered"]},
  {"name":"Policy change: break-glass window","role":"Request from South zone","org":"30 → 45 minutes for ICU","ref":"DEMO-POL-2026-07","when":"5 days ago","flag":true,"checks":["!Needs legal review","Clinical board agreed"]},
  {"name":"Dr. M. Iyer","role":"Zonal admin","org":"West zone","ref":"MoHFW order DEMO-Z/2026/36","when":"Yesterday","checks":["Nomination letter","Aadhaar e-KYC","Security key"]},
  {"name":"R. Venkatesh","role":"Zonal admin","org":"South zone","ref":"MoHFW order DEMO-Z/2026/12","when":"1 Jun","status":"approved","checks":["Nomination letter","Security key"]}
]
```

**flags**:

```json
[
  ["Break-glass access with no admission recorded","Doctor","Demo AIIMS, Patna","Today 03:12","danger","DEMO-AUD-91F2"],
  ["14 prescriptions dispensed in 10 minutes","Pharmacist","Demo Pharmacy, Lucknow","Yesterday 22:40","warning","DEMO-AUD-88C1"],
  ["Lab upload to an order closed 3 days earlier","Lab tech","Demo Lab, Ranchi","15 Oct, 16:05","warning","DEMO-AUD-87A0"],
  ["9 failed sign-ins, account locked","Nurse","Demo Medical College, Guwahati","14 Oct, 07:58","info","DEMO-AUD-86D4"],
  ["Same doctor opened 38 records in one shift","Doctor","Demo District Hospital, Nagpur","13 Oct, 19:20","warning","DEMO-AUD-85B9"]
]
```

**blood**:

```json
[
  ["O+",212000,9],
  ["B+",198000,9],
  ["A+",141000,8],
  ["AB+",41000,7],
  ["O−",13800,4],
  ["B−",12900,3],
  ["A−",9400,5],
  ["AB−",3900,3]
]
```

**organs**:

```json
[
  ["Kidney",61200],
  ["Cornea",38100],
  ["Liver",14800],
  ["Heart",1640],
  ["Lungs",590]
]
```

**banks**:

```json
[
  ["West zone (1,020 banks)",168000,9],
  ["North zone (980 banks)",151000,8],
  ["South zone (1,354 banks)",126000,8],
  ["East zone (760 banks)",92000,5],
  ["Central zone (610 banks)",71000,6],
  ["North-east zone (240 banks)",24000,3]
]
```

**mix**:

```json
[
  ["Government",168000],
  ["Private hospitals & clinics",271000],
  ["Pharmacies",309000],
  ["Labs & imaging",32000]
]
```

**kpis**:

```json
[
  ["Facilities on platform","7.8","lakh","1.68 lakh government","11,200 joined this month","fac","blue"],
  ["ABHA-linked citizens","78.4","crore","55% of residents","1.1 crore this month","users","sage"],
  ["Doctors active","13.6","lakh","Across 36 states & UTs","3.4% vs September","doc",null],
  ["Open health alerts","21",null,"4 emergency · 17 advisories",null,"al","peach"]
]
```

**actions**:

```json
[
  ["Central team to north Bihar","NCDC epidemiologists, 4 districts","In progress","info"],
  ["JE vaccine top-up","12 lakh doses released","Done","success"],
  ["Scrub typhus test kits","Stock under 2 weeks in Jharkhand","Action needed","warning"],
  ["WHO IHR weekly update","Sent 16 Oct, 21:00","Sent","neutral"]
]
```

**directory**:

```json
[
  ["AIIMS & central institutes",64,100],
  ["Medical colleges",780,98],
  ["Government hospitals",25400,96],
  ["CHC / PHC / AAM",141800,91],
  ["Private hospitals",71000,69],
  ["Pharmacies",309000,74]
]
```

**audit**:

```json
[
  ["Break-glass (30 days)","9,840",null,"9,310 justified, 530 open","-5% vs September","peach"],
  ["Reviewed within 72 h","88","%","Lowest zone: North-east 79%",null,"sage"],
  ["States meeting target","19","of 36","Target: 95% reviewed","3 more than September",null],
  ["Admin accounts","41,200",null,"All with security keys",null,"blue"]
]
```

**exports**:

```json
[
  {"file":"health_summary_sep-2026.pdf","by":"S. Banerjee","at":"5 Oct, 10:15","size":"14.2 MB"},
  {"file":"idsp_weekly_wk41.csv","by":"NCDC cell","at":"13 Oct, 12:00","size":"9.8 MB"},
  {"file":"audit_access_q2.csv","by":"NHA security cell","at":"1 Oct, 09:00","size":"22 MB"}
]
```

**reports**:

```json
[
  ["Monthly health summary","Registrations, sessions, facilities and alerts for the country","Monthly","health_summary"],
  ["Disease surveillance (IDSP format)","Weekly S, P and L form counts by unit","Weekly","idsp_weekly"],
  ["Blood & organ network","Stock, donations, camps and waiting list","Weekly","blood_organ"],
  ["Registration coverage","ABHA-linked accounts by unit, age band and sex","Monthly","coverage"],
  ["Audit & access","Break-glass, session and admin activity","On demand","audit_access"],
  ["Facility directory","Every facility on the platform with its status","On demand","facilities"]
]
```

**models**:

```json
[
  ["Clinical guidance LLM","v3.2","AI Health Chat and doctor assist · 22 languages","0.4%","In use","success"],
  ["Image analysis · chest X-ray","v2.1","Radiology assist · 1,840 facilities","8.1%","Drift alert","warning"],
  ["Temporal risk model","v1.3","Early warning on vitals trends","1.1%","In use","success"],
  ["Genomic variant explainer","v1.0","Pilot · 6 medical colleges","—","Pilot","info"],
  ["Clinical guidance LLM","v3.3","Release candidate","—","Pending","neutral"]
]
```

**safety**:

```json
[
  ["Chat advised home care for chest pain","Kerala · caught by the safety filter, no harm","Fixed in v3.3","success"],
  ["X-ray flagged normal, radiologist found nodule","Assam · older scanner","Investigating","warning"],
  ["Wrong drug name in Malayalam answer","Kerala · transliteration error","Fixed in v3.3","success"],
  ["Risk score missing for paediatric vitals","Delhi · out of scope by design","Labelled","neutral"]
]
```

**scope**:

```json
{ "short": "India · MoHFW", "level": "National", "title": "India", "pop": "142 crore", "peak": "58,900 at 11:00", "summary": "Fever is up in Bihar, eastern UP and Jharkhand, a cyclone watch covers the east coast, and a new version of the clinical guidance model is waiting for approval.", "childLabel": "States & UTs", "childOne": "state", "approvalsNote": "Approve zonal admins and national policy changes. State admins are approved by their zone.", "apMonth": "Zonal admins 2", "checklist": [ "Nomination letter from the appointing authority", "Applicant is verified by Aadhaar e-KYC", "Hardware security key registered", "Previous holder handed over and was signed out everywhere" ], "langs": "22 scheduled languages", "sender": "Ministry of Health & Family Welfare", "bloodSub": "The national blood and organ network, combined by zone. Waiting-list numbers are counts only.", "banks": "4,964 blood banks", "banksShort": "by zone", "donors": "1.9 crore", "donorsHint": "62 lakh donated this year", "pledges": "1.1 crore", "pledgesHint": "1.4 lakh this month", "tx": "18,400", "txUp": "11% vs 2025", "waitKidney": "3.1 years", "txCentres": "812", "mfa": "Security key + Jan Parichay", "camps": [ { "name": "National Voluntary Blood Donation month", "meta": "All states · October", "target": "10 lakh units" }, { "name": "Armed forces camps", "meta": "26 Oct · 140 cantonments", "target": "60,000 units" }, { "name": "Railway stations drive", "meta": "1–7 Nov · 300 stations", "target": "45,000 units" } ] }
```

**inbox**:

```json
{ "doctor": [ { "name": "Foreign graduate review", "meta": "212 FMGE applications · NMC check", "prio": "normal", "due": "Due 24 Oct" } ], "admin": [ { "name": "Dr. P. Singh", "meta": "Zonal admin · North zone", "prio": "urgent", "due": "Due 19 Oct" }, { "name": "A. Das", "meta": "Zonal admin · North-east · key missing", "prio": "urgent", "due": "Due 18 Oct" }, { "name": "Dr. M. Iyer", "meta": "Zonal admin · West zone", "prio": "normal", "due": "Due 23 Oct" } ], "flagged": [ { "name": "Break-glass policy change", "meta": "South zone · 30 → 45 min for ICU", "prio": "normal", "due": "Due 25 Oct" }, { "name": "Admin DEMO-ADM-UP-902", "meta": "Bulk export of 9 districts at 02:00", "prio": "urgent", "due": "Due today" } ] }
```

**incoming**:

```json
{ "type": "flagged", "name": "API key DEMO-KEY-4471", "meta": "Partner app · 40× normal call rate", "prio": "urgent", "due": "Due today" }
```

**admins**:

```json
[
  ["R. Venkatesh","Zonal admin","South zone","1 Jun 2026"],
  ["Dr. K. Bose","Zonal admin","East zone","14 Feb 2026"],
  ["N. Sharma","Zonal admin","Central zone","3 Mar 2026"],
  ["Dr. L. Sangma","Zonal admin (acting)","North-east zone","19 Aug 2026"]
]
```

**grievances**:

```json
[]
```

**funnel**:

```json
[ 84200, 74100, 69800, 64300 ]
```

**decision**:

```json
[ 4.8, 4.4, 4, 3.6, 3.3, 3.1 ]
```


---

## Section G — Generated (computed) data, exact outputs of the design's own generators

Column "facilities" and "doctors online" are the selected-unit card values (`round(facTotal/units*(0.6+0.8*hs(code+"f")))` and `round(live/units*(0.5+hs(code+"d")))`). Rates are per lakh, one decimal. Chart series are for weeks 31..42.

### G.District — generated data (id=`dist`)

#### G.District.1 Map units with derived metrics (12 rows)

| code | name | col | row | hot | registered % | dengue /lakh | fever /lakh | lepto /lakh | blood cover days | facilities (sel. card) | doctors online (sel. card) | admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PLK | Pulikeezhu | 0 | 0 |  | 93 | 9.6 | 7.8 | 12.3 | 10 | 21 | 2 | Assigned |
| TVL | Thiruvalla | 1 | 0 |  | 61 | 8.9 | 11.7 | 2.9 | 13 | 20 | 2 | Dr. Anil Mathew |
| MLY | Mallappally | 2 | 0 |  | 58 | 7.3 | 8.9 | 1.5 | 2 | 14 | 4 | Assigned |
| VNK | Vennikulam | 3 | 0 |  | 84 | 11.2 | 12.2 | 9.2 | 4 | 16 | 4 | Assigned |
| KZC | Kozhencherry | 1 | 1 |  | 65 | 8.8 | 5.8 | 5.3 | 14 | 21 | 2 | Assigned |
| ELT | Elanthoor | 2 | 1 |  | 56 | 2.8 | 9.3 | 11.2 | 10 | 12 | 3 | Assigned |
| RNI | Ranni | 3 | 1 | Y | 91 | 4.2 | 11.7 | 24.5 | 10 | 12 | 3 | Dr. Lissy John |
| PRN | Perunad | 4 | 1 | Y | 93 | 13.6 | 2.4 | 12.3 | 5 | 22 | 2 | Dr. Shibu George |
| PDM | Pandalam | 1 | 2 |  | 75 | 4.5 | 13.6 | 11.4 | 7 | 16 | 4 | Assigned |
| PTA | Pathanamthitta | 2 | 2 |  | 87 | 2.5 | 3.4 | 9.2 | 6 | 14 | 4 | Assigned |
| KNI | Konni | 3 | 2 |  | 63 | 7.1 | 7.5 | 13 | 4 | 16 | 4 | Assigned |
| ADR | Adoor | 2 | 3 |  | 70 | 1.6 | 1.3 | 7.5 | 7 | 24 | 3 | Dr. Priya Das |

#### G.District.2 Disease series, weeks 31..42 (index 0 = wk31, 11 = wk42)

| disease | reported wk31..42 | baseline wk31..42 | wk42 now | wk42 baseline | rate per lakh (now/popN*1e5) |
| --- | --- | --- | --- | --- | --- |
| dengue | 47, 55, 46, 50, 53, 54, 40, 39, 38, 26, 25, 20 | 44, 46, 48, 48, 48, 46, 44, 41, 37, 33, 30, 28 | 20 | 28 | 1.7 |
| fever | 615, 754, 671, 786, 875, 954, 1016, 777, 765, 738, 529, 575 | 656, 719, 776, 821, 851, 861, 852, 823, 779, 722, 659, 596 | 575 | 596 | 48 |
| lepto | 6, 8, 9, 10, 9, 9, 10, 10, 8, 11, 14, 14 | 7, 8, 9, 9, 9, 9, 9, 9, 9, 8, 7, 7 | 14 | 7 | 1.2 |

#### G.District.3 Other generated series

- break-glass weekly wk31..42: 4, 3, 5, 5, 4, 4, 3, 5, 4, 4, 4, 4
- registered citizens, 12 months Nov 2025..Oct 2026: 525839, 559231, 595824, 629659, 661613, 679624, 710894, 741091, 773158, 787030, 816101, 836960
- registrations-by-month total weight Nov..Oct (relative, max normalised to 100% bar): 0.699, 0.644, 0.989, 0.933, 0.84, 1.185, 1.13, 1.074, 1.057, 1.11, 1.366, 1.101
- live-sessions hour profile 0..23 (relative 0..1; hour 15 is "now"): 0.09, 0.07, 0.08, 0.08, 0.09, 0.07, 0.34, 0.57, 0.82, 0.78, 0.93, 0.95, 0.83, 0.76, 0.67, 0.59, 0.51, 0.54, 0.37, 0.3, 0.27, 0.19, 0.15, 0.1

#### G.District.4 Directory — doctors (18)

| id | name | speciality | block | HPR id | status |
| --- | --- | --- | --- | --- | --- |
| d0 | Dr. Lakshmi Pillai | General medicine | Pulikeezhu | DEMO-HPR-87-1000 | Active |
| d1 | Dr. Abdul Thomas | ENT | Thiruvalla | DEMO-HPR-20-1037 | Pending |
| d2 | Dr. Sneha Das | Psychiatry | Mallappally | DEMO-HPR-41-1074 | Suspended |
| d3 | Dr. Nisha Rahman | Cardiology | Vennikulam | DEMO-HPR-62-1111 | Active |
| d4 | Dr. Arjun Rao | General medicine | Kozhencherry | DEMO-HPR-92-1148 | Active |
| d5 | Dr. Priya George | ENT | Elanthoor | DEMO-HPR-24-1185 | Pending |
| d6 | Dr. Biju Babu | Dermatology | Ranni | DEMO-HPR-45-1222 | Suspended |
| d7 | Dr. Sajan Menon | Cardiology | Perunad | DEMO-HPR-66-1259 | Active |
| d8 | Dr. Divya Reddy | Ophthalmology | Pandalam | DEMO-HPR-96-1296 | Active |
| d9 | Dr. Thomas George | Emergency medicine | Pathanamthitta | DEMO-HPR-28-1333 | Active |
| d10 | Dr. Joseph Nair | Gynaecology | Konni | DEMO-HPR-73-1370 | Active |
| d11 | Dr. Nisha Krishnan | Dermatology | Adoor | DEMO-HPR-52-1407 | Active |
| d12 | Dr. Manoj Iyer | Emergency medicine | Pulikeezhu | DEMO-HPR-26-1444 | Suspended |
| d13 | Dr. Meera Thomas | General medicine | Thiruvalla | DEMO-HPR-94-1481 | Active |
| d14 | Dr. Fathima Pillai | Gynaecology | Mallappally | DEMO-HPR-69-1518 | Active |
| d15 | Dr. Harish Krishnan | Orthopaedics | Vennikulam | DEMO-HPR-48-1555 | Active |
| d16 | Dr. Kavya Das | Emergency medicine | Kozhencherry | DEMO-HPR-22-1592 | Active |
| d17 | Dr. Suresh Thomas | Ophthalmology | Elanthoor | DEMO-HPR-90-1629 | Active |

#### G.District.5 Directory — hospitals & facilities (18)

| id | name | type | block | beds | status |
| --- | --- | --- | --- | --- | --- |
| h0 | Demo PHC, Pulikeezhu | PHC | Pulikeezhu | 40 | Pending |
| h1 | Demo Clinic, Thiruvalla | Clinic | Thiruvalla | — | Active |
| h2 | Demo Medical college, Mallappally | Medical college | Mallappally | 354 | Active |
| h3 | Demo Taluk hospital, Vennikulam | Taluk hospital | Vennikulam | 497 | Suspended |
| h4 | Demo CHC, Kozhencherry | CHC | Kozhencherry | 68 | Pending |
| h5 | Demo Clinic, Elanthoor | Clinic | Elanthoor | — | Active |
| h6 | Demo Lab, Ranni | Lab | Ranni | — | Active |
| h7 | Demo District hospital, Perunad | District hospital | Perunad | 526 | Active |
| h8 | Demo Private hospital, Pandalam | Private hospital | Pandalam | 97 | Active |
| h9 | Demo Pharmacy, Pathanamthitta | Pharmacy | Pathanamthitta | — | Active |
| h10 | Demo Medical college, Konni | Medical college | Konni | 220 | Active |
| h11 | Demo Pharmacy, Adoor | Pharmacy | Adoor | — | Suspended |
| h12 | Demo Private hospital, Pulikeezhu | Private hospital | Pulikeezhu | 534 | Active |
| h13 | Demo Taluk hospital, Thiruvalla | Taluk hospital | Thiruvalla | 392 | Active |
| h14 | Demo Lab, Mallappally | Lab | Mallappally | — | Active |
| h15 | Demo Clinic, Vennikulam | Clinic | Vennikulam | — | Active |
| h16 | Demo PHC, Kozhencherry | PHC | Kozhencherry | 563 | Active |
| h17 | Demo Taluk hospital, Elanthoor | Taluk hospital | Elanthoor | 420 | Active |

#### G.District.6 Directory — staff (18)

| id | name | role | facility | status |
| --- | --- | --- | --- | --- |
| s0 | Lakshmi Iyer | Lab technician | Demo Medical college, Pulikeezhu | Pending |
| s1 | Sajan Thomas | Nurse | Demo Clinic, Thiruvalla | Suspended |
| s2 | Sneha Nair | Hospital admin | Demo PHC, Mallappally | Active |
| s3 | Abdul Krishnan | Pharmacist | Demo Taluk hospital, Vennikulam | Active |
| s4 | Arjun Iyer | Lab technician | Demo District hospital, Kozhencherry | Active |
| s5 | Anitha Varghese | Pharmacy admin | Demo Clinic, Elanthoor | Active |
| s6 | Biju Nair | Hospital admin | Demo PHC, Ranni | Active |
| s7 | Priya Joseph | Radiology technician | Demo Taluk hospital, Perunad | Active |
| s8 | Fathima George | Radiology technician | Demo District hospital, Pandalam | Pending |
| s9 | Harish Rao | Nurse | Demo Clinic, Pathanamthitta | Suspended |
| s10 | Thomas Rao | Pharmacist | Demo Private hospital, Konni | Suspended |
| s11 | Reena Das | Pharmacy admin | Demo Medical college, Adoor | Pending |
| s12 | Rajesh Babu | Nurse | Demo Taluk hospital, Pulikeezhu | Active |
| s13 | Arjun Menon | Radiology technician | Demo CHC, Thiruvalla | Active |
| s14 | Kavya Thomas | Pharmacist | Demo Private hospital, Mallappally | Active |
| s15 | Harish Das | Pharmacy admin | Demo Medical college, Vennikulam | Active |
| s16 | Fathima Rahman | Nurse | Demo Taluk hospital, Kozhencherry | Active |
| s17 | Divya Menon | Lab technician | Demo PHC, Elanthoor | Active |

#### G.District.7 Audit log (16 rows)

| id | time | type | action | actor | where | tag | ref |
| --- | --- | --- | --- | --- | --- | --- | --- |
| l0 | 17 Oct 23:10 | signin | Security key registered | Admin · DEMO-4712 | Kozhencherry | ok | EV-70000 |
| l1 | 17 Oct 22:55 | export | Report exported (de-identified) | Admin · DEMO-2570 | Thiruvalla | warn | EV-70131 |
| l2 | 17 Oct 21:38 | admin | Approved hospital admin | Admin · DEMO-8998 | Konni | ok | EV-70262 |
| l3 | 17 Oct 19:24 | access | Session opened with citizen key | Doctor · DEMO-6855 | Perunad | info | EV-70393 |
| l4 | 17 Oct 18:07 | access | Lab result uploaded to order | Lab tech · DEMO-5141 | Vennikulam | info | EV-70524 |
| l5 | 17 Oct 16:53 | signin | Failed sign-in · account locked | Nurse · DEMO-2998 | Pulikeezhu | danger | EV-70655 |
| l6 | 17 Oct 15:35 | admin | Approved hospital admin | Admin · DEMO-9426 | Pathanamthitta | ok | EV-70786 |
| l7 | 17 Oct 13:21 | access | Session ended by citizen | Citizen · DEMO-7284 | Ranni | info | EV-70917 |
| l8 | 17 Oct 12:15 | signin | Failed sign-in · account locked | Nurse · DEMO-3856 | Vennikulam | danger | EV-71048 |
| l9 | 17 Oct 11:01 | admin | Role changed: nurse → charge nurse | Hospital admin · DEMO-1713 | Pulikeezhu | info | EV-71179 |
| l10 | 17 Oct 09:09 | signin | Security key registered | Admin · DEMO-7841 | Vennikulam | ok | EV-71310 |
| l11 | 17 Oct 08:23 | access | Session opened with citizen key | Doctor · DEMO-9984 | Ranni | info | EV-71441 |
| l12 | 17 Oct 06:40 | breakglass | Break-glass access · casualty | Doctor · DEMO-3556 | Pathanamthitta | danger | EV-71572 |
| l13 | 17 Oct 05:54 | admin | Role changed: nurse → charge nurse | Hospital admin · DEMO-5699 | Pulikeezhu | info | EV-71703 |
| l14 | 17 Oct 03:06 | access | Lab result uploaded to order | Lab tech · DEMO-8270 | Mallappally | info | EV-71834 |
| l15 | 17 Oct 02:20 | access | Session opened with citizen key | Doctor · DEMO-1413 | Elanthoor | info | EV-71965 |

### G.State — generated data (id=`state`)

#### G.State.1 Map units with derived metrics (14 rows)

| code | name | col | row | hot | registered % | dengue /lakh | fever /lakh | lepto /lakh | blood cover days | facilities (sel. card) | doctors online (sel. card) | admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KGD | Kasaragod | 0 | 0 |  | 60 | 10.7 | 7.1 | 7.2 | 12 | 950 | 84 | Vacant · request pending |
| KNR | Kannur | 0 | 1 |  | 66 | 7 | 8.9 | 11.4 | 3 | 714 | 50 | Assigned |
| WYD | Wayanad | 1 | 1 |  | 93 | 2.6 | 7 | 13.1 | 13 | 625 | 127 | Vacant · request pending |
| KZD | Kozhikode | 0 | 2 |  | 93 | 9.2 | 11.5 | 7.4 | 5 | 585 | 116 | Assigned |
| MLP | Malappuram | 1 | 2 |  | 73 | 2.1 | 13.1 | 9.8 | 3 | 841 | 66 | Assigned |
| TSR | Thrissur | 1 | 3 |  | 56 | 10.4 | 5.8 | 7.8 | 3 | 482 | 104 | Assigned |
| PKD | Palakkad | 2 | 3 |  | 76 | 6.6 | 10.1 | 7.3 | 9 | 901 | 76 | Assigned |
| EKM | Ernakulam | 1 | 4 |  | 83 | 12.6 | 3.2 | 10.5 | 10 | 810 | 61 | Dr. Mini Joseph |
| IDK | Idukki | 2 | 4 |  | 57 | 11.9 | 9 | 12.2 | 13 | 857 | 69 | Assigned |
| ALP | Alappuzha | 1 | 5 |  | 64 | 6.5 | 6.8 | 9.6 | 13 | 522 | 106 | Assigned |
| KTM | Kottayam | 2 | 5 |  | 82 | 9.7 | 13 | 5.2 | 6 | 529 | 107 | Assigned |
| KLM | Kollam | 2 | 6 | Y | 84 | 16 | 10.9 | 3.4 | 6 | 538 | 108 | Assigned |
| PTA | Pathanamthitta | 3 | 6 |  | 87 | 2.5 | 3.4 | 9.2 | 6 | 568 | 113 | Ajay Kumar |
| TVM | Thiruvananthapuram | 2 | 7 | Y | 80 | 25.2 | 10.7 | 11.8 | 3 | 739 | 54 | Dr. Sajeev K |

#### G.State.2 Disease series, weeks 31..42 (index 0 = wk31, 11 = wk42)

| disease | reported wk31..42 | baseline wk31..42 | wk42 now | wk42 baseline | rate per lakh (now/popN*1e5) |
| --- | --- | --- | --- | --- | --- |
| dengue | 1147, 1153, 1118, 1433, 1284, 1140, 975, 1110, 934, 1156, 1373, 1590 | 1117, 1182, 1224, 1239, 1225, 1185, 1121, 1039, 949, 858, 775, 709 | 1590 | 709 | 4.6 |
| fever | 20884, 29957, 31237, 31482, 30612, 38911, 35943, 32044, 25867, 29385, 22402, 20639 | 24800, 27183, 29335, 31047, 32155, 32550, 32194, 31122, 29438, 27305, 24929, 22540 | 20639 | 22540 | 59.7 |
| lepto | 149, 158, 219, 221, 212, 199, 245, 218, 185, 208, 182, 125 | 168, 184, 199, 210, 218, 220, 218, 211, 199, 185, 169, 153 | 125 | 153 | 0.4 |

#### G.State.3 Other generated series

- break-glass weekly wk31..42: 64, 73, 47, 56, 66, 75, 48, 57, 68, 77, 76, 67
- registered citizens, 12 months Nov 2025..Oct 2026: 15050748, 16006501, 17053878, 18022309, 18936900, 19452424, 20347452, 21211756, 22129583, 22526627, 23358708, 23955737
- registrations-by-month total weight Nov..Oct (relative, max normalised to 100% bar): 0.889, 1.024, 0.759, 0.895, 1.068, 0.803, 0.939, 1.074, 1.247, 0.982, 1.249, 1.194
- live-sessions hour profile 0..23 (relative 0..1; hour 15 is "now"): 0.08, 0.08, 0.07, 0.09, 0.08, 0.08, 0.32, 0.59, 0.75, 0.79, 0.9, 1, 0.81, 0.67, 0.66, 0.64, 0.51, 0.49, 0.36, 0.32, 0.24, 0.18, 0.14, 0.11

#### G.State.4 Directory — doctors (18)

| id | name | speciality | district | HPR id | status |
| --- | --- | --- | --- | --- | --- |
| d0 | Dr. Rajesh Das | Orthopaedics | Kasaragod | DEMO-HPR-64-1000 | Active |
| d1 | Dr. Reena Thomas | Emergency medicine | Kannur | DEMO-HPR-43-1037 | Active |
| d2 | Dr. Thomas Pillai | Ophthalmology | Wayanad | DEMO-HPR-17-1074 | Active |
| d3 | Dr. Suresh Krishnan | Gynaecology | Kozhikode | DEMO-HPR-85-1111 | Active |
| d4 | Dr. Fathima Iyer | Orthopaedics | Malappuram | DEMO-HPR-68-1148 | Pending |
| d5 | Dr. Harish Varghese | Psychiatry | Thrissur | DEMO-HPR-47-1185 | Active |
| d6 | Dr. Kavya Nair | Ophthalmology | Palakkad | DEMO-HPR-22-1222 | Active |
| d7 | Dr. Meera Krishnan | Paediatrics | Ernakulam | DEMO-HPR-89-1259 | Suspended |
| d8 | Dr. Joseph Reddy | Cardiology | Idukki | DEMO-HPR-56-1296 | Active |
| d9 | Dr. Nisha Varghese | Psychiatry | Alappuzha | DEMO-HPR-34-1333 | Pending |
| d10 | Dr. Rajesh Pillai | General medicine | Kottayam | DEMO-HPR-58-1370 | Active |
| d11 | Dr. Divya Varghese | ENT | Kollam | DEMO-HPR-79-1407 | Active |
| d12 | Dr. Priya Das | Dermatology | Pathanamthitta | DEMO-HPR-16-1444 | Pending |
| d13 | Dr. Biju Krishnan | Cardiology | Thiruvananthapuram | DEMO-HPR-37-1481 | Suspended |
| d14 | Dr. Fathima Nair | Paediatrics | Kasaragod | DEMO-HPR-62-1518 | Active |
| d15 | Dr. Suresh Varghese | ENT | Kannur | DEMO-HPR-83-1555 | Active |
| d16 | Dr. Thomas Iyer | Dermatology | Wayanad | DEMO-HPR-20-1592 | Pending |
| d17 | Dr. Reena Krishnan | Cardiology | Kozhikode | DEMO-HPR-41-1629 | Suspended |

#### G.State.5 Directory — hospitals & facilities (18)

| id | name | type | district | beds | status |
| --- | --- | --- | --- | --- | --- |
| h0 | Demo Lab, Kasaragod | Lab | Kasaragod | — | Pending |
| h1 | Demo Clinic, Kannur | Clinic | Kannur | — | Suspended |
| h2 | Demo CHC, Wayanad | CHC | Wayanad | 607 | Active |
| h3 | Demo District hospital, Kozhikode | District hospital | Kozhikode | 464 | Active |
| h4 | Demo Medical college, Malappuram | Medical college | Malappuram | 264 | Active |
| h5 | Demo Clinic, Thrissur | Clinic | Thrissur | — | Active |
| h6 | Demo PHC, Palakkad | PHC | Palakkad | 578 | Active |
| h7 | Demo Taluk hospital, Ernakulam | Taluk hospital | Ernakulam | 435 | Active |
| h8 | Demo Pharmacy, Idukki | Pharmacy | Idukki | — | Pending |
| h9 | Demo Private hospital, Alappuzha | Private hospital | Alappuzha | 92 | Suspended |
| h10 | Demo CHC, Kottayam | CHC | Kottayam | 260 | Active |
| h11 | Demo Private hospital, Kollam | Private hospital | Kollam | 403 | Active |
| h12 | Demo Lab, Pathanamthitta | Lab | Pathanamthitta | — | Active |
| h13 | Demo District hospital, Thiruvananthapuram | District hospital | Thiruvananthapuram | 88 | Active |
| h14 | Demo CHC, Kasaragod | CHC | Kasaragod | 231 | Active |
| h15 | Demo Private hospital, Kannur | Private hospital | Kannur | 374 | Active |
| h16 | Demo Lab, Wayanad | Lab | Wayanad | — | Suspended |
| h17 | Demo District hospital, Kozhikode | District hospital | Kozhikode | 60 | Pending |

#### G.State.6 Directory — staff (18)

| id | name | role | facility | status |
| --- | --- | --- | --- | --- |
| s0 | Sajan Krishnan | Lab technician | Demo Taluk hospital, Kasaragod | Active |
| s1 | Joseph Pillai | Radiology technician | Demo PHC, Kannur | Active |
| s2 | Meera Thomas | Hospital admin | Demo Clinic, Wayanad | Active |
| s3 | Manoj Das | Pharmacy admin | Demo District hospital, Kozhikode | Active |
| s4 | Anitha Rahman | Lab technician | Demo Taluk hospital, Malappuram | Active |
| s5 | Lakshmi Menon | Radiology technician | Demo PHC, Thrissur | Active |
| s6 | Abdul Rao | Hospital admin | Demo Clinic, Palakkad | Active |
| s7 | Sneha George | Pharmacy admin | Demo Medical college, Ernakulam | Active |
| s8 | Harish Joseph | Radiology technician | Demo CHC, Idukki | Active |
| s9 | Fathima Nair | Pharmacist | Demo Private hospital, Alappuzha | Suspended |
| s10 | Abdul Babu | Pharmacist | Demo Taluk hospital, Kottayam | Active |
| s11 | Arjun Joseph | Radiology technician | Demo Medical college, Kollam | Active |
| s12 | Sajan Reddy | Nurse | Demo Clinic, Pathanamthitta | Active |
| s13 | Sneha Kurian | Pharmacy admin | Demo PHC, Thiruvananthapuram | Active |
| s14 | Abdul Nair | Pharmacist | Demo Taluk hospital, Kasaragod | Active |
| s15 | Lakshmi Joseph | Radiology technician | Demo Medical college, Kannur | Active |
| s16 | Nisha Iyer | Nurse | Demo Private hospital, Wayanad | Pending |
| s17 | Manoj Varghese | Pharmacy admin | Demo PHC, Kozhikode | Suspended |

#### G.State.7 Audit log (16 rows)

| id | time | type | action | actor | where | tag | ref |
| --- | --- | --- | --- | --- | --- | --- | --- |
| l0 | 17 Oct 23:44 | admin | Approved hospital admin | Admin · DEMO-9918 | Kollam | ok | EV-70000 |
| l1 | 17 Oct 22:59 | signin | Failed sign-in · account locked | Nurse · DEMO-3062 | Kannur | danger | EV-70131 |
| l2 | 17 Oct 21:16 | access | Lab result uploaded to order | Lab tech · DEMO-5633 | Thrissur | info | EV-70262 |
| l3 | 17 Oct 19:30 | access | Session opened with citizen key | Doctor · DEMO-7776 | Idukki | info | EV-70393 |
| l4 | 17 Oct 18:47 | admin | Role changed: nurse → charge nurse | Hospital admin · DEMO-9490 | Pathanamthitta | info | EV-70524 |
| l5 | 17 Oct 16:02 | signin | Failed sign-in · account locked | Nurse · DEMO-2634 | Kannur | danger | EV-70655 |
| l6 | 17 Oct 15:19 | access | Lab result uploaded to order | Lab tech · DEMO-5205 | Thrissur | info | EV-70786 |
| l7 | 17 Oct 13:33 | access | Session ended by citizen | Citizen · DEMO-7347 | Alappuzha | info | EV-70917 |
| l8 | 17 Oct 12:39 | breakglass | Break-glass access · casualty | Doctor · DEMO-9062 | Thiruvananthapuram | danger | EV-71048 |
| l9 | 17 Oct 11:53 | export | Report exported (de-identified) | Admin · DEMO-2205 | Wayanad | warn | EV-71179 |
| l10 | 17 Oct 09:56 | breakglass | Break-glass access · casualty | Doctor · DEMO-8152 | Idukki | danger | EV-71310 |
| l11 | 17 Oct 08:41 | access | Session opened with citizen key | Doctor · DEMO-6009 | Thrissur | info | EV-71441 |
| l12 | 17 Oct 06:27 | signin | Security key registered | Admin · DEMO-3867 | Wayanad | ok | EV-71572 |
| l13 | 17 Oct 05:13 | export | Report exported (de-identified) | Admin · DEMO-1724 | Pathanamthitta | warn | EV-71703 |
| l14 | 17 Oct 03:58 | breakglass | Break-glass access · casualty | Doctor · DEMO-7724 | Alappuzha | danger | EV-71834 |
| l15 | 17 Oct 02:44 | access | Session opened with citizen key | Doctor · DEMO-5581 | Palakkad | info | EV-71965 |

### G.Zonal — generated data (id=`zone`)

#### G.Zonal.1 Map units with derived metrics (7 rows)

| code | name | col | row | hot | registered % | dengue /lakh | fever /lakh | lepto /lakh | blood cover days | facilities (sel. card) | doctors online (sel. card) | admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TG | Telangana | 3 | 4 |  | 82 | 4 | 13.2 | 8.2 | 2 | 19698 | 2020 | Dr. Farhan Ali |
| KA | Karnataka | 2 | 5 | Y | 90 | 18.5 | 9.2 | 2.9 | 4 | 23137 | 915 | Dr. Shalini Rao |
| AP | Andhra Pradesh | 3 | 5 |  | 71 | 12.3 | 4.8 | 7.8 | 3 | 13791 | 1509 | K. Srinivas |
| LD | Lakshadweep | 0 | 6 |  | 89 | 7.1 | 10 | 11.2 | 13 | 16198 | 1718 | Vacant · request pending |
| KL | Kerala | 2 | 6 | Y | 61 | 27.2 | 8.2 | 2.9 | 13 | 16839 | 1840 | Latha Nair |
| TN | Tamil Nadu | 3 | 6 |  | 67 | 6 | 10.7 | 12.3 | 13 | 26457 | 1268 | Vacant · request pending |
| PY | Puducherry | 4 | 6 |  | 90 | 3.8 | 5.7 | 1.6 | 13 | 19539 | 2073 | M. Selvi |

#### G.Zonal.2 Disease series, weeks 31..42 (index 0 = wk31, 11 = wk42)

| disease | reported wk31..42 | baseline wk31..42 | wk42 now | wk42 baseline | rate per lakh (now/popN*1e5) |
| --- | --- | --- | --- | --- | --- |
| dengue | 8907, 10352, 11762, 9492, 9961, 10241, 10294, 7327, 6840, 9791, 9722, 13313 | 9273, 9815, 10165, 10290, 10178, 9839, 9306, 8632, 7881, 7126, 6440, 5889 | 13313 | 5889 | 5.2 |
| fever | 191610, 236253, 282121, 325618, 280794, 307424, 324615, 330830, 237452, 230869, 222000, 177357 | 224000, 245521, 264957, 280426, 290429, 293998, 290786, 281105, 265893, 246623, 225161, 203587 | 177357 | 203587 | 69.3 |
| lepto | 947, 867, 1055, 1222, 1349, 1094, 1181, 1209, 1181, 845, 784, 621 | 880, 965, 1041, 1102, 1141, 1155, 1142, 1104, 1045, 969, 885, 800 | 621 | 800 | 0.2 |

#### G.Zonal.3 Other generated series

- break-glass weekly wk31..42: 317, 504, 446, 387, 328, 516, 524, 465, 293, 481, 486, 299
- registered citizens, 12 months Nov 2025..Oct 2026: 111787712, 118886461, 126665730, 133858642, 140651662, 144480658, 151128377, 157547900, 164364949, 167313948, 173494141, 177928506
- registrations-by-month total weight Nov..Oct (relative, max normalised to 100% bar): 0.951, 0.896, 0.822, 0.767, 1.092, 1.037, 0.963, 0.908, 1.31, 1.254, 1.248, 1.383
- live-sessions hour profile 0..23 (relative 0..1; hour 15 is "now"): 0.07, 0.08, 0.08, 0.09, 0.09, 0.07, 0.34, 0.56, 0.8, 0.76, 0.94, 0.96, 0.86, 0.64, 0.68, 0.6, 0.53, 0.45, 0.38, 0.31, 0.23, 0.2, 0.16, 0.11

#### G.Zonal.4 Directory — doctors (18)

| id | name | speciality | state | HPR id | status |
| --- | --- | --- | --- | --- | --- |
| d0 | Dr. Sajan Pillai | Psychiatry | Telangana | DEMO-HPR-26-1000 | Active |
| d1 | Dr. Lakshmi Varghese | Orthopaedics | Karnataka | DEMO-HPR-47-1037 | Active |
| d2 | Dr. Abdul Iyer | Paediatrics | Andhra Pradesh | DEMO-HPR-72-1074 | Active |
| d3 | Dr. Sneha Joseph | ENT | Lakshadweep | DEMO-HPR-94-1111 | Pending |
| d4 | Dr. Nisha Nair | Dermatology | Kerala | DEMO-HPR-86-1148 | Suspended |
| d5 | Dr. Joseph Varghese | Cardiology | Tamil Nadu | DEMO-HPR-19-1185 | Active |
| d6 | Dr. Meera Reddy | General medicine | Puducherry | DEMO-HPR-44-1222 | Active |
| d7 | Dr. Manoj Joseph | ENT | Telangana | DEMO-HPR-65-1259 | Pending |
| d8 | Dr. Harish Babu | Dermatology | Karnataka | DEMO-HPR-82-1296 | Active |
| d9 | Dr. Fathima Kurian | Cardiology | Andhra Pradesh | DEMO-HPR-14-1333 | Active |
| d10 | Dr. Priya Thomas | Paediatrics | Lakshadweep | DEMO-HPR-81-1370 | Suspended |
| d11 | Dr. Arjun Menon | Orthopaedics | Kerala | DEMO-HPR-60-1407 | Active |
| d12 | Dr. Rajesh Krishnan | Emergency medicine | Tamil Nadu | DEMO-HPR-38-1444 | Active |
| d13 | Dr. Reena Das | Ophthalmology | Puducherry | DEMO-HPR-17-1481 | Active |
| d14 | Dr. Abdul Rao | Paediatrics | Telangana | DEMO-HPR-77-1518 | Active |
| d15 | Dr. Lakshmi Menon | Cardiology | Karnataka | DEMO-HPR-55-1555 | Active |
| d16 | Dr. Anitha Rahman | Psychiatry | Andhra Pradesh | DEMO-HPR-34-1592 | Active |
| d17 | Dr. Biju George | Ophthalmology | Lakshadweep | DEMO-HPR-13-1629 | Active |

#### G.Zonal.5 Directory — hospitals & facilities (18)

| id | name | type | state | beds | status |
| --- | --- | --- | --- | --- | --- |
| h0 | Demo Clinic, Telangana | Clinic | Telangana | — | Active |
| h1 | Demo Medical college, Karnataka | Medical college | Karnataka | 178 | Suspended |
| h2 | Demo Taluk hospital, Andhra Pradesh | Taluk hospital | Andhra Pradesh | 320 | Pending |
| h3 | Demo PHC, Lakshadweep | PHC | Lakshadweep | 463 | Active |
| h4 | Demo Pharmacy, Kerala | Pharmacy | Kerala | — | Active |
| h5 | Demo Medical college, Tamil Nadu | Medical college | Tamil Nadu | 149 | Active |
| h6 | Demo Taluk hospital, Puducherry | Taluk hospital | Puducherry | 292 | Active |
| h7 | Demo PHC, Telangana | PHC | Telangana | 435 | Active |
| h8 | Demo Clinic, Karnataka | Clinic | Karnataka | — | Active |
| h9 | Demo Lab, Andhra Pradesh | Lab | Andhra Pradesh | — | Suspended |
| h10 | Demo Pharmacy, Lakshadweep | Pharmacy | Lakshadweep | — | Active |
| h11 | Demo PHC, Kerala | PHC | Kerala | 585 | Active |
| h12 | Demo Taluk hospital, Tamil Nadu | Taluk hospital | Tamil Nadu | 414 | Active |
| h13 | Demo Medical college, Puducherry | Medical college | Puducherry | 271 | Active |
| h14 | Demo Clinic, Telangana | Clinic | Telangana | — | Suspended |
| h15 | Demo PHC, Karnataka | PHC | Karnataka | 176 | Active |
| h16 | Demo District hospital, Andhra Pradesh | District hospital | Andhra Pradesh | 604 | Active |
| h17 | Demo Lab, Lakshadweep | Lab | Lakshadweep | — | Pending |

#### G.Zonal.6 Directory — staff (18)

| id | name | role | facility | status |
| --- | --- | --- | --- | --- |
| s0 | Thomas Varghese | Radiology technician | Demo Clinic, Telangana | Pending |
| s1 | Divya Pillai | Nurse | Demo Private hospital, Karnataka | Suspended |
| s2 | Rajesh Krishnan | Hospital admin | Demo CHC, Andhra Pradesh | Active |
| s3 | Reena Das | Pharmacist | Demo District hospital, Lakshadweep | Active |
| s4 | Priya Thomas | Radiology technician | Demo Clinic, Kerala | Pending |
| s5 | Arjun Pillai | Nurse | Demo PHC, Tamil Nadu | Suspended |
| s6 | Anitha Rahman | Pharmacy admin | Demo CHC, Puducherry | Active |
| s7 | Biju Das | Pharmacist | Demo District hospital, Telangana | Active |
| s8 | Abdul Rao | Lab technician | Demo Clinic, Karnataka | Pending |
| s9 | Arjun Menon | Nurse | Demo PHC, Andhra Pradesh | Suspended |
| s10 | Lakshmi Kurian | Pharmacist | Demo Clinic, Lakshadweep | Pending |
| s11 | Abdul Rao | Hospital admin | Demo Medical college, Kerala | Active |
| s12 | Biju George | Nurse | Demo Taluk hospital, Tamil Nadu | Active |
| s13 | Sajan Rahman | Lab technician | Demo PHC, Puducherry | Suspended |
| s14 | Joseph Kurian | Pharmacist | Demo Private hospital, Telangana | Pending |
| s15 | Meera Reddy | Hospital admin | Demo Medical college, Karnataka | Active |
| s16 | Sneha Joseph | Nurse | Demo Taluk hospital, Andhra Pradesh | Active |
| s17 | Nisha Babu | Lab technician | Demo CHC, Lakshadweep | Suspended |

#### G.Zonal.7 Audit log (16 rows)

| id | time | type | action | actor | where | tag | ref |
| --- | --- | --- | --- | --- | --- | --- | --- |
| l0 | 17 Oct 23:56 | access | Session opened with citizen key | Doctor · DEMO-4887 | Andhra Pradesh | info | EV-70000 |
| l1 | 17 Oct 22:42 | access | Lab result uploaded to order | Lab tech · DEMO-2744 | Telangana | info | EV-70131 |
| l2 | 17 Oct 21:28 | export | Report exported (de-identified) | Admin · DEMO-9601 | Puducherry | warn | EV-70262 |
| l3 | 17 Oct 19:13 | breakglass | Break-glass access · casualty | Doctor · DEMO-7458 | Kerala | danger | EV-70393 |
| l4 | 17 Oct 18:37 | admin | Approved hospital admin | Admin · DEMO-5315 | Andhra Pradesh | ok | EV-70524 |
| l5 | 17 Oct 16:23 | access | Session ended by citizen | Citizen · DEMO-3173 | Telangana | info | EV-70655 |
| l6 | 17 Oct 15:09 | export | Report exported (de-identified) | Admin · DEMO-1030 | Tamil Nadu | warn | EV-70786 |
| l7 | 17 Oct 13:54 | admin | Approved hospital admin | Admin · DEMO-7886 | Kerala | ok | EV-70917 |
| l8 | 17 Oct 12:02 | admin | Role changed: nurse → charge nurse | Hospital admin · DEMO-8177 | Karnataka | info | EV-71048 |
| l9 | 17 Oct 11:48 | access | Session ended by citizen | Citizen · DEMO-6034 | Telangana | info | EV-71179 |
| l10 | 17 Oct 09:12 | export | Report exported (de-identified) | Admin · DEMO-2995 | Lakshadweep | warn | EV-71310 |
| l11 | 17 Oct 08:26 | access | Lab result uploaded to order | Lab tech · DEMO-5137 | Tamil Nadu | info | EV-71441 |
| l12 | 17 Oct 06:41 | access | Session ended by citizen | Citizen · DEMO-7280 | Puducherry | info | EV-71572 |
| l13 | 17 Oct 05:55 | admin | Approved hospital admin | Admin · DEMO-9423 | Karnataka | ok | EV-71703 |
| l14 | 17 Oct 03:09 | signin | Failed sign-in · account locked | Nurse · DEMO-3423 | Lakshadweep | danger | EV-71834 |
| l15 | 17 Oct 02:23 | access | Lab result uploaded to order | Lab tech · DEMO-5566 | Kerala | info | EV-71965 |

### G.Central — generated data (id=`central`)

#### G.Central.1 Map units with derived metrics (36 rows)

| code | name | col | row | hot | registered % | dengue /lakh | fever /lakh | lepto /lakh | blood cover days | facilities (sel. card) | doctors online (sel. card) | admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JK | Jammu & Kashmir | 2 | 0 |  | 81 | 13.6 | 2.1 | 11 | 11 | 20564 | 1955 | Assigned |
| LA | Ladakh | 3 | 0 |  | 55 | 1.4 | 12.9 | 6 | 9 | 27907 | 1184 | Assigned |
| PB | Punjab | 1 | 1 |  | 91 | 10.5 | 7.8 | 4.4 | 13 | 24376 | 911 | Assigned |
| HP | Himachal Pradesh | 2 | 1 |  | 85 | 5.6 | 11 | 1.1 | 3 | 25884 | 964 | Assigned |
| UK | Uttarakhand | 3 | 1 |  | 69 | 5.3 | 8.2 | 11.6 | 4 | 19692 | 1824 | Assigned |
| CH | Chandigarh | 1 | 2 |  | 73 | 4 | 11.6 | 12.3 | 9 | 17839 | 1745 | Assigned |
| HR | Haryana | 2 | 2 |  | 83 | 6.6 | 9.9 | 11 | 7 | 28522 | 1231 | Assigned |
| DL | Delhi | 3 | 2 |  | 90 | 7.4 | 5.4 | 2.1 | 8 | 13806 | 1370 | Assigned |
| UP | Uttar Pradesh | 4 | 2 | Y | 69 | 12.2 | 30.8 | 6.2 | 12 | 20602 | 1895 | A. K. Mishra |
| BR | Bihar | 5 | 2 | Y | 64 | 1.9 | 23.6 | 9 | 12 | 29378 | 1234 | Dr. Nitin Prasad |
| SK | Sikkim | 6 | 2 |  | 56 | 9.1 | 5.9 | 9.1 | 14 | 15480 | 1563 | Assigned |
| AR | Arunachal Pradesh | 7 | 2 |  | 69 | 2.2 | 5.5 | 9.1 | 3 | 25293 | 982 | Assigned |
| RJ | Rajasthan | 1 | 3 |  | 59 | 3.4 | 13.6 | 6.2 | 10 | 29919 | 1275 | Assigned |
| MP | Madhya Pradesh | 2 | 3 |  | 63 | 6.4 | 11.3 | 8.5 | 13 | 28243 | 1146 | Assigned |
| CG | Chhattisgarh | 3 | 3 |  | 84 | 13 | 6.4 | 4 | 13 | 29271 | 1289 | Assigned |
| JH | Jharkhand | 4 | 3 | Y | 83 | 2.8 | 14.1 | 6.2 | 5 | 20646 | 1962 | Assigned |
| WB | West Bengal | 5 | 3 |  | 93 | 8.1 | 4.9 | 13.9 | 4 | 14799 | 1446 | Assigned |
| AS | Assam | 6 | 3 |  | 70 | 7.1 | 3.6 | 4 | 14 | 22736 | 720 | Assigned |
| NL | Nagaland | 7 | 3 |  | 71 | 9.6 | 1.2 | 3.9 | 9 | 21908 | 720 | Assigned |
| GJ | Gujarat | 0 | 4 |  | 89 | 4.7 | 12.1 | 5.3 | 11 | 21025 | 1927 | Assigned |
| DN | Dadra & Nagar Haveli and Daman & Diu | 1 | 4 |  | 90 | 4.5 | 6.1 | 8 | 8 | 15085 | 1532 | Assigned |
| MH | Maharashtra | 2 | 4 |  | 89 | 2.4 | 12.6 | 5.8 | 9 | 24818 | 881 | Assigned |
| TG | Telangana | 3 | 4 |  | 82 | 4 | 13.2 | 8.2 | 2 | 21039 | 1928 | Assigned |
| OD | Odisha | 4 | 4 |  | 57 | 9.8 | 1.2 | 5 | 4 | 18644 | 1807 | Assigned |
| ML | Meghalaya | 6 | 4 |  | 59 | 4.3 | 5.7 | 1.6 | 10 | 13468 | 1343 | Assigned |
| MN | Manipur | 7 | 4 |  | 78 | 7.8 | 6.4 | 2.3 | 6 | 28163 | 1203 | Assigned |
| GA | Goa | 1 | 5 |  | 57 | 1.7 | 1.3 | 13.1 | 11 | 15123 | 1471 | Assigned |
| KA | Karnataka | 2 | 5 |  | 90 | 5.9 | 9.2 | 2.9 | 4 | 24712 | 873 | Assigned |
| AP | Andhra Pradesh | 3 | 5 |  | 71 | 12.3 | 4.8 | 7.8 | 3 | 14730 | 1441 | Assigned |
| TR | Tripura | 6 | 5 |  | 76 | 1.8 | 4.4 | 5.1 | 6 | 19654 | 1885 | Assigned |
| MZ | Mizoram | 7 | 5 |  | 55 | 2.4 | 1.4 | 6 | 11 | 25730 | 1015 | Assigned |
| LD | Lakshadweep | 0 | 6 |  | 89 | 7.1 | 10 | 11.2 | 13 | 17300 | 1640 | Assigned |
| KL | Kerala | 2 | 6 |  | 61 | 11.4 | 8.2 | 2.9 | 13 | 17985 | 1756 | Latha Nair |
| TN | Tamil Nadu | 3 | 6 |  | 67 | 6 | 10.7 | 12.3 | 13 | 28259 | 1211 | Vacant · request pending |
| PY | Puducherry | 4 | 6 |  | 90 | 3.8 | 5.7 | 1.6 | 13 | 20869 | 1979 | Assigned |
| AN | Andaman & Nicobar | 6 | 6 |  | 67 | 5.5 | 4 | 8.6 | 3 | 13083 | 1377 | Assigned |

#### G.Central.2 Disease series, weeks 31..42 (index 0 = wk31, 11 = wk42)

| disease | reported wk31..42 | baseline wk31..42 | wk42 now | wk42 baseline | rate per lakh (now/popN*1e5) |
| --- | --- | --- | --- | --- | --- |
| dengue | 37344, 37568, 36451, 46606, 42984, 38253, 32839, 37038, 28741, 22881, 19590, 18069 | 35958, 38058, 39415, 39900, 39464, 38150, 36085, 33470, 30558, 27630, 24970, 22837 | 18069 | 22837 | 1.3 |
| fever | 1492111, 1593470, 1648548, 1646439, 2124473, 2014931, 1843054, 1624650, 1959259, 2556054, 3272731, 2818323 | 1472000, 1613422, 1741145, 1842797, 1908533, 1931984, 1910879, 1847263, 1747297, 1620665, 1479632, 1337860 | 2818323 | 1337860 | 198.5 |
| lepto | 2793, 2973, 3015, 4108, 4085, 3869, 3478, 4175, 3474, 2903, 2431, 2250 | 2880, 3157, 3407, 3605, 3734, 3780, 3739, 3614, 3419, 3171, 2895, 2618 | 2250 | 2618 | 0.2 |

#### G.Central.3 Other generated series

- break-glass weekly wk31..42: 1593, 1865, 2191, 2462, 1539, 1811, 2136, 2408, 1485, 1756, 1775, 1503
- registered citizens, 12 months Nov 2025..Oct 2026: 489617690, 520709414, 554781744, 586285896, 616038563, 632809140, 661925404, 690042200, 719900114, 732816398, 759884955, 779306976
- registrations-by-month total weight Nov..Oct (relative, max normalised to 100% bar): 0.718, 0.853, 0.988, 0.723, 0.859, 0.994, 1.129, 1.264, 1, 1.135, 1.038, 1.383
- live-sessions hour profile 0..23 (relative 0..1; hour 15 is "now"): 0.09, 0.08, 0.08, 0.07, 0.08, 0.08, 0.33, 0.5, 0.82, 0.87, 0.97, 0.9, 0.89, 0.73, 0.71, 0.56, 0.54, 0.52, 0.32, 0.29, 0.27, 0.21, 0.15, 0.1
- AI agreement 12 weeks: guidance 91.2, 92.7, 92.2, 91.8, 91.1, 92.6, 92.2, 91.7, 91, 92.5, 91.8, 92.3; image 92.1, 92.3, 92.6, 92.8, 92, 92.3, 92.6, 92.8, 92.2, 89.8, 87.7, 84.9

#### G.Central.4 Directory — doctors (18)

| id | name | speciality | state | HPR id | status |
| --- | --- | --- | --- | --- | --- |
| d0 | Dr. Joseph Varghese | Paediatrics | Jammu & Kashmir | DEMO-HPR-86-1000 | Active |
| d1 | Dr. Nisha Pillai | Orthopaedics | Ladakh | DEMO-HPR-64-1037 | Active |
| d2 | Dr. Manoj Krishnan | Psychiatry | Punjab | DEMO-HPR-39-1074 | Active |
| d3 | Dr. Meera Iyer | Ophthalmology | Himachal Pradesh | DEMO-HPR-18-1111 | Active |
| d4 | Dr. Fathima Thomas | Gynaecology | Uttarakhand | DEMO-HPR-81-1148 | Suspended |
| d5 | Dr. Harish Menon | Orthopaedics | Chandigarh | DEMO-HPR-60-1185 | Pending |
| d6 | Dr. Kavya Krishnan | Emergency medicine | Haryana | DEMO-HPR-35-1222 | Active |
| d7 | Dr. Suresh Das | Ophthalmology | Delhi | DEMO-HPR-14-1259 | Active |
| d8 | Dr. Arjun Rao | General medicine | Uttar Pradesh | DEMO-HPR-94-1296 | Active |
| d9 | Dr. Anitha Menon | Cardiology | Bihar | DEMO-HPR-73-1333 | Active |
| d10 | Dr. Harish Varghese | Psychiatry | Sikkim | DEMO-HPR-96-1370 | Active |
| d11 | Dr. Rajesh Iyer | Orthopaedics | Arunachal Pradesh | DEMO-HPR-29-1407 | Active |
| d12 | Dr. Divya Krishnan | Paediatrics | Rajasthan | DEMO-HPR-54-1444 | Active |
| d13 | Dr. Thomas Pillai | ENT | Madhya Pradesh | DEMO-HPR-75-1481 | Pending |
| d14 | Dr. Reena Thomas | Psychiatry | Chhattisgarh | DEMO-HPR-92-1518 | Suspended |
| d15 | Dr. Anitha Das | Cardiology | Jharkhand | DEMO-HPR-24-1555 | Active |
| d16 | Dr. Arjun Rahman | General medicine | West Bengal | DEMO-HPR-50-1592 | Active |
| d17 | Dr. Priya Menon | ENT | Assam | DEMO-HPR-71-1629 | Pending |

#### G.Central.5 Directory — hospitals & facilities (18)

| id | name | type | state | beds | status |
| --- | --- | --- | --- | --- | --- |
| h0 | Demo Clinic, Jammu & Kashmir | Clinic | Jammu & Kashmir | — | Active |
| h1 | Demo PHC, Ladakh | PHC | Ladakh | 162 | Active |
| h2 | Demo District hospital, Punjab | District hospital | Punjab | 619 | Pending |
| h3 | Demo Lab, Himachal Pradesh | Lab | Himachal Pradesh | — | Suspended |
| h4 | Demo Private hospital, Uttarakhand | Private hospital | Uttarakhand | 334 | Active |
| h5 | Demo CHC, Chandigarh | CHC | Chandigarh | 191 | Active |
| h6 | Demo District hospital, Haryana | District hospital | Haryana | 48 | Active |
| h7 | Demo Pharmacy, Delhi | Pharmacy | Delhi | — | Active |
| h8 | Demo Pharmacy, Uttar Pradesh | Pharmacy | Uttar Pradesh | — | Active |
| h9 | Demo PHC, Bihar | PHC | Bihar | 105 | Active |
| h10 | Demo Lab, Sikkim | Lab | Sikkim | — | Active |
| h11 | Demo District hospital, Arunachal Pradesh | District hospital | Arunachal Pradesh | 364 | Active |
| h12 | Demo PHC, Rajasthan | PHC | Rajasthan | 507 | Active |
| h13 | Demo Clinic, Madhya Pradesh | Clinic | Madhya Pradesh | — | Active |
| h14 | Demo Pharmacy, Chhattisgarh | Pharmacy | Chhattisgarh | — | Pending |
| h15 | Demo District hospital, Jharkhand | District hospital | Jharkhand | 393 | Active |
| h16 | Demo CHC, West Bengal | CHC | West Bengal | 535 | Active |
| h17 | Demo Private hospital, Assam | Private hospital | Assam | 78 | Suspended |

#### G.Central.6 Directory — staff (18)

| id | name | role | facility | status |
| --- | --- | --- | --- | --- |
| s0 | Biju Menon | Radiology technician | Demo Clinic, Jammu & Kashmir | Active |
| s1 | Anitha Thomas | Hospital admin | Demo Medical college, Ladakh | Active |
| s2 | Lakshmi George | Pharmacy admin | Demo Taluk hospital, Punjab | Active |
| s3 | Abdul Rahman | Lab technician | Demo PHC, Himachal Pradesh | Active |
| s4 | Sneha Pillai | Pharmacist | Demo Clinic, Uttarakhand | Active |
| s5 | Sajan Thomas | Hospital admin | Demo District hospital, Chandigarh | Active |
| s6 | Joseph Das | Nurse | Demo CHC, Haryana | Suspended |
| s7 | Meera Krishnan | Lab technician | Demo PHC, Delhi | Pending |
| s8 | Harish Kurian | Radiology technician | Demo Private hospital, Uttar Pradesh | Active |
| s9 | Fathima Reddy | Pharmacist | Demo Medical college, Bihar | Suspended |
| s10 | Sajan Menon | Pharmacy admin | Demo Private hospital, Sikkim | Suspended |
| s11 | Sneha Babu | Pharmacist | Demo PHC, Arunachal Pradesh | Active |
| s12 | Meera George | Lab technician | Demo Taluk hospital, Rajasthan | Active |
| s13 | Lakshmi Reddy | Nurse | Demo Medical college, Madhya Pradesh | Pending |
| s14 | Anitha Menon | Hospital admin | Demo Clinic, Chhattisgarh | Suspended |
| s15 | Biju Rahman | Pharmacist | Demo PHC, Jharkhand | Active |
| s16 | Abdul George | Lab technician | Demo Taluk hospital, West Bengal | Active |
| s17 | Arjun Rao | Nurse | Demo District hospital, Assam | Pending |

#### G.Central.7 Audit log (40 rows)

| id | time | type | action | actor | where | tag | ref |
| --- | --- | --- | --- | --- | --- | --- | --- |
| l0 | 17 Oct 23:10 | access | Session opened with citizen key | Doctor · DEMO-5127 | Nagaland | info | EV-70000 |
| l1 | 17 Oct 23:24 | breakglass | Break-glass access · casualty | Doctor · DEMO-7270 | Goa | danger | EV-70131 |
| l2 | 17 Oct 22:42 | admin | Role changed: nurse → charge nurse | Hospital admin · DEMO-9841 | Jammu & Kashmir | info | EV-70262 |
| l3 | 17 Oct 22:56 | signin | Security key registered | Admin · DEMO-2985 | Bihar | ok | EV-70393 |
| l4 | 17 Oct 21:07 | admin | Health alert broadcast | Admin · DEMO-5556 | West Bengal | warn | EV-70524 |
| l5 | 17 Oct 21:22 | breakglass | Break-glass access · casualty | Doctor · DEMO-7698 | Meghalaya | danger | EV-70655 |
| l6 | 17 Oct 20:39 | admin | Role changed: nurse → charge nurse | Hospital admin · DEMO-1270 | Andaman & Nicobar | info | EV-70786 |
| l7 | 17 Oct 19:53 | signin | Failed sign-in · account locked | Nurse · DEMO-3413 | Delhi | danger | EV-70917 |
| l8 | 17 Oct 19:04 | admin | Health alert broadcast | Admin · DEMO-4271 | Maharashtra | warn | EV-71048 |
| l9 | 17 Oct 18:19 | access | Session ended by citizen | Citizen · DEMO-6413 | Mizoram | info | EV-71179 |
| l10 | 17 Oct 18:46 | admin | Role changed: nurse → charge nurse | Hospital admin · DEMO-5254 | Telangana | info | EV-71310 |
| l11 | 17 Oct 17:31 | access | Session ended by citizen | Citizen · DEMO-3112 | Madhya Pradesh | info | EV-71441 |
| l12 | 17 Oct 17:17 | access | Lab result uploaded to order | Lab tech · DEMO-9968 | Chandigarh | info | EV-71572 |
| l13 | 17 Oct 16:03 | signin | Failed sign-in · account locked | Nurse · DEMO-7825 | Kerala | danger | EV-71703 |
| l14 | 17 Oct 15:43 | admin | Role changed: nurse → charge nurse | Hospital admin · DEMO-5683 | Sikkim | info | EV-71834 |
| l15 | 17 Oct 15:28 | breakglass | Break-glass access · casualty | Doctor · DEMO-3540 | Punjab | danger | EV-71965 |
| l16 | 17 Oct 14:14 | admin | Health alert broadcast | Admin · DEMO-1397 | Tripura | warn | EV-72096 |
| l17 | 17 Oct 14:00 | signin | Security key registered | Admin · DEMO-8254 | Maharashtra | ok | EV-72227 |
| l18 | 17 Oct 13:51 | admin | Approved hospital admin | Admin · DEMO-4398 | Bihar | ok | EV-72358 |
| l19 | 17 Oct 13:37 | access | Session opened with citizen key | Doctor · DEMO-2255 | Jammu & Kashmir | info | EV-72489 |
| l20 | 17 Oct 12:24 | admin | Approved hospital admin | Admin · DEMO-7553 | Maharashtra | ok | EV-72620 |
| l21 | 17 Oct 11:38 | export | Report exported (de-identified) | Admin · DEMO-9696 | Mizoram | warn | EV-72751 |
| l22 | 17 Oct 11:55 | access | Lab result uploaded to order | Lab tech · DEMO-3268 | Uttarakhand | info | EV-72882 |
| l23 | 17 Oct 10:09 | access | Session opened with citizen key | Doctor · DEMO-5411 | Madhya Pradesh | info | EV-73013 |
| l24 | 17 Oct 10:21 | breakglass | Break-glass access · casualty | Doctor · DEMO-7982 | Gujarat | danger | EV-73144 |
| l25 | 17 Oct 09:35 | export | Report exported (de-identified) | Admin · DEMO-1125 | Andhra Pradesh | warn | EV-73275 |
| l26 | 17 Oct 09:52 | signin | Security key registered | Admin · DEMO-3697 | Punjab | ok | EV-73406 |
| l27 | 17 Oct 08:07 | access | Session opened with citizen key | Doctor · DEMO-5839 | Arunachal Pradesh | info | EV-73537 |
| l28 | 17 Oct 07:18 | admin | Role changed: nurse → charge nurse | Hospital admin · DEMO-8410 | Manipur | info | EV-73668 |
| l29 | 17 Oct 07:32 | signin | Failed sign-in · account locked | Nurse · DEMO-1554 | Tamil Nadu | danger | EV-73799 |
| l30 | 17 Oct 06:07 | access | Session opened with citizen key | Doctor · DEMO-8452 | Arunachal Pradesh | info | EV-73930 |
| l31 | 17 Oct 06:53 | access | Lab result uploaded to order | Lab tech · DEMO-6310 | Himachal Pradesh | info | EV-74061 |
| l32 | 17 Oct 05:35 | export | Report exported (de-identified) | Admin · DEMO-3739 | Andhra Pradesh | warn | EV-74192 |
| l33 | 17 Oct 05:21 | admin | Approved hospital admin | Admin · DEMO-1596 | Dadra & Nagar Haveli and Daman & Diu | ok | EV-74323 |
| l34 | 17 Oct 04:10 | access | Session opened with citizen key | Doctor · DEMO-8024 | Madhya Pradesh | info | EV-74454 |
| l35 | 17 Oct 03:55 | signin | Security key registered | Admin · DEMO-5881 | Uttarakhand | ok | EV-74585 |
| l36 | 17 Oct 03:38 | export | Report exported (de-identified) | Admin · DEMO-3310 | Mizoram | warn | EV-74716 |
| l37 | 17 Oct 02:24 | admin | Approved hospital admin | Admin · DEMO-1168 | Maharashtra | ok | EV-74847 |
| l38 | 17 Oct 02:01 | access | Session ended by citizen | Citizen · DEMO-7596 | Jharkhand | info | EV-74978 |
| l39 | 17 Oct 01:47 | admin | Health alert broadcast | Admin · DEMO-5453 | Haryana | warn | EV-75109 |


---

## 7. Cross-screen links (shared people, places, IDs, events)

Time anchor for every screen: **Saturday 17 October 2026**, ISO week 42 (data "weeks 31–42"), hospital roster week 19–25 Oct 2026.

Geography / hierarchy (the four gov levels nest):
- India (Central, 36 states/UTs) -> **South zone** (Zonal, 7 = TG, KA, AP, LD, KL, TN, PY) -> **Kerala** (State, 14 districts: KGD, KNR, WYD, KZD, MLP, TSR, PKD, EKM, IDK, ALP, KTM, KLM, PTA, TVM) -> **Pathanamthitta** (District, 12 blocks: PLK, TVL, MLY, VNK, KZC, ELT, RNI, PRN, PDM, PTA, KNI, ADR) -> **Demo General Hospital** (Hospital admin; HFR IN3210DEMO0042; "IN3210" prefix also in `HFR DEMO-IN3210-7781` at District) and **Demo Hospital Pharmacy** (Pharmacy admin; licence DEMO-DL-KL-2041).
- District unit `PTA` = Pathanamthitta block; State unit `PTA` = Pathanamthitta district (same code, different level; State `unitAdmins.PTA` = Ajay Kumar, the District persona). Zonal/Central unit `KL` = Kerala (`unitAdmins.KL` = Latha Nair, the State persona). Central approvals "R. Venkatesh · South zone · approved 1 Jun" = the Zonal persona. Zonal approvals "Latha Nair · Kerala · approved 2 Jul" = the State persona. State approvals "Ajay Kumar · Pathanamthitta · approved 1 Sep" = the District persona. District approvals "Suma Thomas · Pharmacy admin · Demo Hospital Pharmacy, Pathanamthitta · DEMO-DL-KL-2041 · approved" = the Pharmacy-admin persona.
- District `unitAdmins`/`admins`: RNI Dr. Lissy John (3 Mar 2026), PRN Dr. Shibu George (9 Apr 2026), TVL Dr. Anil Mathew (21 Jan 2026), ADR Dr. Priya Das (2 Jun 2026). State `unitAdmins`/`admins`: PTA Ajay Kumar (1 Sep 2026), TVM Dr. Sajeev K (12 Feb 2026), EKM Dr. Mini Joseph (30 Mar 2026), Kozhikode Dr. Fasal Rahman (8 May 2026; not in `unitAdmins`), WYD and KGD "Vacant · request pending". Zonal: KL Latha Nair, KA Dr. Shalini Rao, AP K. Srinivas, TG Dr. Farhan Ali, PY M. Selvi (UT admin), TN and LD vacant. Central: KL Latha Nair, BR Dr. Nitin Prasad, UP A. K. Mishra, TN vacant; zonal admins R. Venkatesh (South), Dr. K. Bose (East), N. Sharma (Central zone), Dr. L. Sangma (North-east, acting).
- Dr. Meera Krishnan appears as the Hospital admin persona AND as the District "second approver (DMO office)" and as an export author at District ("coverage_q2.csv").
- Clinical story shared with the other (non-admin) apps: citizen **Anjali Menon** (booking Tue 21 Oct 10:30; e-prescription Metformin 500 mg ×60 + Atorvastatin 10 mg ×30 by **Dr. Arun Nair**; lab order HbA1c + lipid profile -> LDL 142 mg/dL by lab tech **Rahul Varghese**; pharmacist **Joseph Mathew** dispensed -> Pharmacy admin stock decrement). In-patient **Thomas Kurian**, Bed 7 · Ward 3, EWS 7 / SpO₂ 91% escalated by nurse **Lekha Pillai**; also the break-glass patient in s5 opened by **Dr. Sreeja Paul** (Dr. Sreeja Paul is not in the hospital staff list). Other break-glass: Dr. Vivek Menon (Casualty), Dr. Sameer Ali (ICU, patient Thankamma P.). Hospital audit refs `DEMO-ORD-5521`; referral `DEMO-REF-2210`. Pharmacy audit Rx refs `DEMO-RX-88213`, `DEMO-RX-88190`.
- Complaint tickets: `CMP-0412` (live from s9; Hospital + District + State grievances), `CMP-0398`, `CMP-0391`, `CMP-0377` (Hospital) and `CMP-0398`, `CMP-0405` (District), `CMP-0377`, `CMP-0389` (State). Hospital reviews text links "CMP-0412, CMP-0398". (Ticket-id collisions: see Section 8.)
- Alerts: bus s6 "Heatwave — Pathanamthitta" ("district") <-> District `scheduled[0]` "Heatwave — stay indoors 12:00–16:00" (sent Today 09:00, reach 8,12,400); State `scheduled[0]` "Heatwave — 7 districts on orange alert" (Today 08:30, 1.42 cr); both reach the citizen, doctor, nurse and hospitaladmin roles when sent live. District "Flood: boil drinking water" 9 Oct 05:40 (Ranni, Kozhencherry) = State "Flood: boil drinking water" 9 Oct 05:40 (Pathanamthitta, Alappuzha). "Dengue dry day every Sunday (Sun 19 Oct 07:00)" repeats at District (Adoor, Pandalam), State (whole state), Zonal (Karnataka, Kerala), Central (whole country).
- Audit flag refs are identical across all four levels: DEMO-AUD-91F2, DEMO-AUD-88C1, DEMO-AUD-87A0, DEMO-AUD-86D4, DEMO-AUD-85B9 (same five events, facility names re-skinned per level; at District they are Demo Taluk Hospital Thiruvalla / Care Plus Demo Pharmacy / PHC Elanthoor / Demo District Hospital Kozhencherry / Demo General Hospital).
- Care Plus Demo Pharmacy (Thiruvalla): District approvals row "Ancy Varghese · Pharmacy admin · DEMO-DL-KL-2988 · licence expires in 20 days, 1 open audit flag" + District flag "14 prescriptions dispensed in 10 minutes" + District inbox "flagged" item.
- Blood request s10 "B+ · 2 units · Demo General Hospital · surgery tomorrow 08:00" feeds the District and State Blood pages (gov feed) and the Citizen blood page.
- Outbound page links used by the admin screens: `AdminLogin.dc.html` (sign-out / logo), `CitizenComplaints.dc.html`, `CitizenHome.dc.html`, plus event hrefs `Doctor.dc.html`, `Pharmacist.dc.html`, `LabTech.dc.html`, `HospitalAdmin.dc.html`, `CitizenAlerts.dc.html`, `CitizenMedicines.dc.html`, `CitizenBlood.dc.html`, `StateAdmin.dc.html`, `Citizen.dc.html`.

Suggested entity grouping for a seed script (my reading of the data; nothing here is in the design):
`geo_unit` (zone/state/district/block + grid col,row + parent) · `admin_user` + `admin_application` (approvals; checks list; status) · `inbox_item` · `health_alert` (scheduled/sent) · `disease_weekly` (unit x disease x week; series+baseline) · `blood_stock` (group, units, days) · `blood_bank` · `organ_waitlist` · `donation_camp` · `audit_flag` · `audit_event` (generated log) · `directory_doctor|facility|staff` (generated) · `kpi/summary snapshots per level` · `export_record` · `report_def` · `system_flag` + `system_flag_history` · `ai_model` + `ai_safety_report` (Central) · hospital: `hospital`, `department`, `bed_count`, `staff_member`, `staff_application` (+documents), `role_permission`, `break_glass_event`, `admission`, `roster_slot`, `complaint`, `review`, `audit_event` · pharmacy: `pharmacy`, `pharmacist`, `pharmacist_invite`, `inventory_item`, `purchase_order` (+lines), `recall_notice`, `expiring_batch`, `compliance_document`, `audit_event` · `event_bus_seed` (the 10 events).

---

## 8. Inconsistencies inside the design (decide before seeding)

Pharmacy admin:
- "Low stock 17 items" KPI vs the inventory table, where only i2, i3, i6 are Low (i9 is Blocked); the Low-stock card lists 5 (adds Ranitidine and Salbutamol). Salbutamol minimum is 50 in the inventory table but 150 in the low-stock card.
- "Items in stock 1,248 SKUs / 1,102 published" vs 9 sample inventory rows; the 88% hero is 1,102 / 1,248.
- "In transit 3 (KMSCL, Medisupply, Apex)" vs 2 transit POs in the table (Medisupply Kochi, Apex Pharma Dist.).
- "42 batches expiring" vs 5 listed; Expiry-by-month totals (₹12,480 + ₹36,140 + ₹22,900 + ₹9,300 = ₹80,820) vs "₹48,620 in 30 days".
- "4 pharmacists on shift" vs shift card: 2 on shift, 1 on break, 1 off; staff page "5 active of 6".
- Amoxicillin AX-3307 is "Nov 2026" in inventory, "30 Nov" in the expiry table, and has a manufacturer notice (r2); it is Hidden from the public finder by default but not Blocked.
- Dispense counts: Today callout = 186 + n live dispensed events; stat card is a static 186.

Hospital admin:
- Staff: directory says 198 active accounts but cards show Doctors 62 + Nurses 128 + Technicians 31 = 221 (plus pharmacy/admin); "staff on duty" kv sums to 198 (48+112+14+9+4+11) while cards say 48 doctors / 112 nurses on duty — i.e. 198 is both "on duty" and "active accounts".
- Departments: 7 departments in Beds but the staff page says "9 departments"; overview bar list shows only the first 6.
- Admissions KPIs (168 admitted, 6 critical) vs the 8 sample rows (2 critical). Beds occupied 168 matches the department sum; admitted 168 therefore equals beds occupied.
- Break-glass: hero says 3 this week / 2 need review; the list has 3 static + 1 live seed row = 4; pre-justified row is positional (index 2) so with the live seed row b2 (not b3) is shown justified. "Casualty b1 meta says today 14:02" while the seed bus event s5 says 03:12.
- Reviews: "1,284 reviews" and "212 verified reviews" both appear; 4 sample reviews.
- Ownership select has no default value (profile text implies Government · State).
- Complaint ticket numbers vs District/State lists: `CMP-0398` is "Medicine out of stock" (Hospital) and "Ambulance took 50 minutes" (District); `CMP-0377` is "Lab report delayed" (Hospital) and "Escalated: denied free dialysis" (State).

Gov console (all levels):
- KPI hint "this month" figures do not match the generated `regNow*0.012` split: District KPI "6,120 this month" vs generated 10,104; State "2.1 lakh" vs 2,89,200; Zonal "18.2 lakh" vs 21,48,000; Central "1.1 crore" vs 94,08,000. Use the KPI strings as authoritative for the Overview cards and the generated value only for the "Registrations by month" card, or reconcile.
- Anomaly narrative numbers do not match the generated series: District lepto "23 cases vs baseline 9" (series wk42 = 14, baseline 7); State dengue "412 cases vs baseline 216" (series differs, see G.State.2); Zonal dengue "5,940 vs 3,480"; Central fever "3.1 lakh vs 1.8 lakh". Narrative strings are stored text; the chart is generated.
- Map-tile rates (`rate per lakh` per unit) are independent random draws and are not consistent with the level-wide weekly cases; the "Units above threshold" count (rate >= 10) is derived from the tile draws.
- District KPI "Doctors active 1,042 — 96 used break-glass rules correctly" hint reads oddly (likely meant "x used break-glass"); "Break-glass (30 days) 18, 16 justified, 2 open" in the audit KPIs.
- Approvals page text "Oldest: 6 days" and the 1.8-day average decision time are static for every level, though `decision[5]` differs (District 1.8, State 2.2, Zonal 2.7, Central 3.1).
- State `Latha Nair` and District persona `Dr. Meera Krishnan` names also appear as other roles (see Section 7).
- Zonal `ctxUnits` (29 tiles of the rest of India) is defined but not rendered.
- Facility mix `facTotal` equals the sum of `mix` at every level (214 / 9,860 / 1,42,000 / 7,80,000); `directory` counts equal the total only for District (7+58+41+17+79+12 = 214); State directory sums to 6,787 (of 9,860), Zonal 1,10,202 (of 1,42,000), Central 5,48,044 (of 7,80,000) — they show subsets.
- Sidebar badge for Surveillance is a static `1`; Audit & security badge = open flags (5).

Generated-data notes:
- Everything in Section G is deterministic: re-running the formulas in Sections 4.3/4.4 (FNV-1a `hs`, `xh` identical function) reproduces it. The `id` prefix (dist/state/zone/central) is part of the hash input for series, directory names, log rows and registrations-by-month; per-unit `cov`, `bld` and base `rate` use only the unit `code` (+ disease), so the same code gives the same tile values at every level; only the `hot` flag (which boosts the anomaly disease rate to `rate*1.6+9`) and the level-scaled `facilities` / `doctors online` numbers differ (e.g. KA at Zonal: hot, dengue 18.5/lakh, 23,137 facilities, 915 doctors; at Central: not hot, dengue 5.9, 24,712, 873).
- Directory generators (`buildDir`): for i in 0..17, unit = `units[i % units.length]`; doctor name `"Dr. " + FIRST[hash] + " " + LAST[hash]` with name pools FIRST = [Anitha, Rajesh, Fathima, Joseph, Lakshmi, Arjun, Divya, Suresh, Meera, Abdul, Priya, Thomas, Kavya, Manoj, Sneha, Biju, Reena, Harish, Nisha, Sajan], LAST = [Nair, Pillai, Menon, Kurian, Varghese, Thomas, Rao, Reddy, Iyer, Das, George, Joseph, Krishnan, Rahman, Babu], SPEC = [General medicine, Paediatrics, Gynaecology, Cardiology, Orthopaedics, Dermatology, Psychiatry, Emergency medicine, ENT, Ophthalmology], STAFF_ROLE = [Nurse, Lab technician, Radiology technician, Pharmacist, Hospital admin, Pharmacy admin], HTYPE = [Medical college, District hospital, Taluk hospital, CHC, PHC, Private hospital, Clinic, Pharmacy, Lab], DSTAT = [Active ×4, Pending, Active, Suspended, Active] (pick index = floor(xh(key)*len)); HPR id `DEMO-HPR-{10+floor(xh(id+"h"+i)*89)}-{1000+i*37}`; beds `20+floor(xh(id+"b"+i)*600)` (— for Pharmacy/Lab/Clinic). Exact outputs are tabulated in G.*.4–6.
- Audit-log generator (`buildLog`): n = 40 (Central) else 16; row i: type from `LOGT[floor(xh(id+"lg"+i)*10)]`, unit from `units[floor(xh(id+"lu"+i)*len)]`, hour `23 - floor(i*23/n)`, minute `floor(xh(id+"lm"+i)*60)`, time `"17 Oct HH:MM"`, actor `"{role} · DEMO-{1000+floor(xh(id+"la"+i)*8999)}"`, where = unit name, ref `EV-{70000+i*131}`.
- The scratch scripts used to compute Section G are at `/tmp/claude-1000/-home-athun-projects-Carefusion-AI/ecae4ace-beb4-4757-9d25-ca60dd10531e/scratchpad/work/` (`gen.js`, `gen_md.js`, `cfg_md.js`); they `new Function`-evaluate the design's own script block, so the numbers are the design's own, not re-implemented.

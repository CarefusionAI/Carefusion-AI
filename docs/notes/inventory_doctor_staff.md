# Design inventory — Doctor, Staff (nurse / lab / radiology / pharmacist) and public/auth screens

Source: Claude Design export `project/` (files `*.dc.html`, read-only; design is NOT changed). Screens read completely: Doctor, Nurse, LabTech, RadiologyTech, Pharmacist, Main, DemoSignIn, Login, StaffLogin, AdminLogin, RegisterCitizen, RegisterDoctor, RegisterHospitalAdmin, RegisterPharmacyAdmin, StaffActivation, Recovery. (There is no `public/` folder in the export; "public/auth pages" = those top-level files.) No `support.js`/shared seed file exists: every screen embeds its own copy of `CF_SEED`; data lives only in script arrays and literal markup.

Purpose: lossless seed-script reference. All identifiers are DEMO-prefixed or fictional. Prototype "now" = **Saturday 17 October 2026** (afternoon, ~14:30–15:00; Nurse/Lab home say 10:42, Pharmacy issued 14:40–15:02, Doctor home "afternoon"). Hospital = "Demo General Hospital, Pathanamthitta" (240 beds per HFR mock). Banner on all screens: "Synthetic demo data" (warning alert, banner). Rule check: no raw Aadhaar anywhere (only `DEMO-0000-1234` style, token `tok_DEMO_8f3a…c21`, "XXXX XXXX 1234").

Table of contents
- 0. Cross-screen entity master (people, facility, beds, orders, prescriptions, medicines) and identified data conflicts
- A. Doctor
- B. Nurse
- C. LabTech
- D. RadiologyTech
- E. Pharmacist
- F. Public / auth / registration screens (Main, DemoSignIn, Login, StaffLogin, AdminLogin, RegisterCitizen/Doctor/HospitalAdmin/PharmacyAdmin, StaffActivation, Recovery)
- G. Suggested seed-entity list and conflict resolutions

# 0. Cross-screen entity master

## 0.1 Staff / users (who they are, where shown)
| Person | Role | Facts (exact) | Appears in |
|---|---|---|---|
| Dr. Arun Nair | Doctor, General medicine | MBBS MD, 14 y, Demo General Hospital; HPR `DEMO-HPR-71-0042` (Doctor profile) / `DEMO-HPR-71-4402` (RegisterDoctor form) / `DEMO-KL-55102` (Pharmacist Rx header); council reg `DEMO-TCMC-41822` (Doctor profile+settings, shown as "TCMC DEMO-41822") / `DEMO-TCMC-58213` (RegisterDoctor); citizen ABHA `DEMO-0000-5678` (RegisterDoctor); username `dr.arun.nair`; rating 4.7/312; langs English, Malayalam, Tamil; duty 09:00–17:00 | Doctor, Main, DemoSignIn, Nurse (duty doctor, orders), Lab (ordering doc), Radiology (ordering doc), Pharmacist (prescriber), RegisterDoctor, Login placeholder |
| Dr. Sreeja Paul | Doctor (evening OP / ward) | HPR `DEMO-KL-48810`; takes handover 17:00; orders for Beds 11/12; receives critical K+ 6.4 call (Ward 5 Bed 2); s5 break-glass user | Doctor handover, Nurse orders, Lab, Radiology, Pharmacist |
| Dr. Leela George | Doctor (obstetrics) | HPR `DEMO-KL-31277` | Radiology (USG order), Pharmacist (Divya Ramesh, Rahul Sasi) |
| Casualty | pseudo-doctor | HPR `DEMO-KL-20031` | Radiology order Mariamma J., Pharmacist Rx |
| Dr. Meera Krishnan | Hospital admin / Medical Superintendent | `ms@demo-hospital.example`, mobile +91 94950 22011; reviews break-glass within 24 h | Doctor emergency, RegisterHospitalAdmin, StaffActivation, DemoSignIn |
| Dr. Deepa Mohan | Pathologist | e-sign on lab reports | LabTech |
| Lekha Pillai | Staff nurse, Ward 3 | Reg `KL-NC-DEMO-4471`; staff ID `DEMO-ST-0412`; day shift 07:00–15:00; charge nurse Sr. Mini Joseph; hands over to Sr. Beena Thomas (others: Br. Rejo Mathew float) | Nurse, StaffActivation, Lab (consent recorded by) |
| Rahul Varghese | Lab technician (DMLT), Central Lab | Analyser "Sysmex XN-DEMO"; handover to Anoop K. 14:00 | LabTech, Doctor (Orders/Lipid result), Nurse |
| Fathima Beevi | Radiology tech / radiographer | 08:00–16:00; handover to Vinod Kurian (CT technologist 08:00–20:00) | RadiologyTech, Doctor orders |
| Joseph Mathew | Pharmacist, Counter 2, Demo Hospital Pharmacy | licence `DEMO-DL-KL-2041` (PharmacyAdmin demo label `DEMO-DL-2041`) | Pharmacist, Doctor Rx, bus s8 |
| Suma Thomas | Pharmacy admin | `suma.t@demo-pharmacy.example`, +91 96330 44871 | RegisterPharmacyAdmin, DemoSignIn |
| Ajay Kumar | District admin Pathanamthitta | | RegisterHospitalAdmin, DemoSignIn |
| Latha Nair | State admin Kerala; R. Venkatesh zonal (South zone); S. Banerjee central (National) | | DemoSignIn |

## 0.2 Patients / citizens (names must be reused consistently)
| Patient | Key facts across screens | Conflicts |
|---|---|---|
| **Anjali Menon** (demo citizen) | DoB 14/02/1991 (RegisterCitizen), mobile +91 98765 43210, email `anjali.m@example.demo`, address "House 14, Temple Road, Adoor", district Pathanamthitta; ABHA `DEMO-0000-1234`, handle `anjali.menon@abha-demo`; B+; allergy Penicillin (rash 2019); emergency contact Ravi Menon (husband, +91 94470 55120); T2 diabetes (dx 11 Mar), lipid LDL 142 (17 Oct), HbA1c 6.9 (7.4 at dx); meds Metformin 500, Atorvastatin 10; imaging id `DEMO-PT-1234`; blood donor (450 mL 02 Aug; resting until 02 Nov); organ donor pledged | Age: 38 (Doctor, Pharmacist, Radiology viewer; DoB 1991 gives 35 in Oct 2026) vs **34** (Nurse/Lab). Inpatient in Nurse Bed 3 (IP-DEMO-30318, admitted 15 Oct, LRTI) while Doctor treats her as OP follow-up (14:24 session) and booked Tue 21 Oct 10:30 |
| Thomas Varghese | M 61, critical K+ 6.1 mmol/L (flagged Rahul Varghese 14:02), OP token 08, appointment 14:30, handover item 1 (repeat K+ 18:00, ECG done); lab LAB-8841 Electrolytes "Critical" | Different surname from Thomas Kurian |
| Thomas Kurian | Nurse Bed 7, **68 M**, COPD, pneumonia admitted 16 Oct, NEWS 7, SpO2 91%; Lab LO-55131 ABG "Ward 3 · Bed 11" (bed conflict), Blood culture LO-55030; Radiology "Thomas K." CT abdomen DEMO-PT-4471 (RLQ pain); Pharmacist Rx DEMO-RX-88219 **M 61y** clopidogrel+omeprazole; bus s5 break-glass "unconscious on arrival" (Dr. Sreeja Paul) | Age 68 vs 61; Rx content vs COPD story; may be intended same person as Varghese (61 M) — decide |
| Joseph Kurian | M 66, HbA1c review 09:00 (done), session 13:40 22 min; HbA1c order LAB-8852 "Sample taken"; Rx Glimepiride 1 mg Dispensed 17 Oct; messages thread; AI temporal review "HbA1c trend · Joseph K." | Radiology urgent chest X-ray "Joseph K." (bus r1). Lab LO-55102 "Joseph P., 45 M" is a different person |
| Mini Thomas | F 47, clopidogrel review 09:20 (Done), session 12:15 30 min timed out; CYP2C19 *1/*2; Rx Clopidogrel 75 mg Signed 16 Oct; referral Neurology DH Kozhencherry Waiting | |
| Lakshmi Amma | F 72, fever day 3, token 09, dengue NS1 LAB-8850 In progress, via daughter Sindhu; Rx Paracetamol 650 Dispensed 14 Oct | |
| Ramesh Pillai | M 55 hypertension, token 10, amlodipine; Rx Amlodipine 5 mg + Losartan Draft; msg BP 138/88 | |
| Fathima N. | F 29 antenatal 24 weeks, token 11 | Doctor Rx/messages |
| Biju George | M 44 back pain, token 12; also blood donor B+ "gave 9 times" 6.8 km | |
| Suresh P. | Cardiology referral MC Kottayam Accepted 16 Oct; transfer Kottayam 19:30; Echo RAD-2214 Scheduled; MRI brain `DEMO-PT-4120` rescheduled Mon 19 Oct 14:00 | |
| Babu Jacob | M 58 kidney follow-up, No-show 09:40; Nephrology MC Kottayam referral Seen 04 Oct; review 3★ | |
| Sindhu R. | F 34 thyroid teleconsult 16:00; also "daughter Sindhu" of Lakshmi | |
| Abdul Rasheed | Nurse Bed 4, Lab LO-55120 CBC+CRP, **52 M** | |
| Sreedevi Amma | Nurse Bed 12, 74 F, NEWS 5, amlodipine withheld, LO-55118 electrolytes | |
| Mary George | Nurse Bed 8, 59 F, NBM endoscopy 13:00, LFT LO-55097, urine culture LO-55071 | |
| Gopi M. | Nurse Bed 11, 61 M, portable CXR, glucose LO-55140 | |
| Divya Ramesh/R. | F 27, pregnant 20 wks; Rx DEMO-RX-88207; USG obstetric `DEMO-PT-2093`/DEMO-IMG-0433 | |
| Akhil Suresh/S. | M 19; Rx DEMO-RX-88222; wrist X-ray `DEMO-PT-7302` | |
| Rahul Sasi | M 11, guardian Sasi K.; Methylphenidate Schedule X | |
| Mariamma Joseph/J. | F 72 CKD3; CT head STAT `DEMO-PT-6610`; Rx amlodipine DEMO-RX-88199 dispensed 12:41 | |
| Bindu V. | Thyroid USG `DEMO-PT-1187` Uploaded | |
| Others | Nisha R. (29 F, TSH T4, OP-207), Joseph P. (45 M, OP-218), Anoop K. (lab colleague) | |
Donor list (Doctor): Vishnu Prasad, Reshma K., Biju George, Ananya R.

## 0.3 Facilities
- Demo General Hospital, Pathanamthitta: Government, 240 beds, HFR `DEMO-HFR-KL-0193`, Ward 3 (24 beds), Central Lab, Radiology (DR 1, CT room 1, USG 1/2, MRI 1.5T), OP block 2, Casualty, Help desk (08:00–20:00). Linked pharmacy "Demo Hospital Pharmacy" (licence `DEMO-DL-KL-2041`, valid until 31 Mar 2029, Forms 20/21, 08:00–20:00).
- Others: Demo Taluk Hospital, Adoor; Demo Private Hospital, Thiruvalla; Medical College Kottayam; District Hospital Kozhencherry; Demo Eye Centre; Vasan Eye Care; PHC Konni; Jan Aushadhi, Adoor Rd; KMSCL store, Pathanamthitta; Demo Blood Bank; Demo Labs (generic maker).
- Admin tiers: CAD Central (5 zones), ZAD Zonal (North, South, East, West, Central), SAD State (28 states + 8 UTs), DAD District, HAD hospital, PAD pharmacy.
- Pilot: Kerala (Pathanamthitta, Kottayam); "42 hospitals connected · demo".

## 0.4 Order id schemes (THREE parallel schemes for the same domain — pick one)
- Doctor app orders: `LAB-8841/8839/8850/8852`, `RAD-2210/2214`; new ones `LAB-2309...` / `RAD-2309...`.
- Lab app: `LO-55xxx` (LO-55131, 55120, 55118, 55109, 55102, 55097, 55090; uploads 55098, 55071, 55044, 55030; new 55140).
- Nurse app: `O-78xx` (O-7841 Ceftriaxone, 7838 CBC CRP, 7835 CXR portable, 7830 IV NS, 7822 HbA1c, 7819 Insulin; new O-7849).
- Radiology: `DEMO-IMG-xxxx` (0417, 0431, 0433, 0436, 0438, 0440, 0442).
Equivalences implied by content: Doctor LAB-8839 (Anjali lipid profile) ≈ Lab LO-55098 (Lipid profile · Anjali Menon, delivered 09:12) ≈ bus s4; Doctor LAB-8852 (Joseph HbA1c) ≈ none in Lab; Doctor LAB-8841 (Thomas Varghese electrolytes) ≈ Lab? no; Doctor RAD-2210 (Anjali Chest X-ray PA) ≈ Radiology DEMO-IMG-0417 (Chest PA + lateral, Waiting for review).

## 0.5 Prescriptions
Doctor-app prescription (Anjali): Metformin 500 mg ×60 and Atorvastatin 10 mg ×30 (bus s2, 10:05) ↔ Pharmacist DEMO-RX-88213 (adds Vitamin D3 60k cap ×8; issued 17 Oct 14:40; Atorvastatin stock 18 short) and bus-derived DEMO-RX-9101. Doctor's historic Rx `DEMO-RX-2291` (20 Sep, azithromycin). Doctor Rx sign target pharmacy: "Demo Hospital Pharmacy".

## 0.6 Conflicts to resolve before seeding (decisions needed)
1. Anjali Menon age 38 vs 34; OP vs inpatient Bed 3 (IP-DEMO-30318).
2. Thomas Varghese (61, K+) vs Thomas Kurian (68 Nurse / 61 Pharmacist / break-glass s5 / CT 4471).
3. Dr. Arun Nair HPR: DEMO-HPR-71-0042 vs DEMO-HPR-71-4402 vs DEMO-KL-55102; TCMC 41822 vs 58213; ABHA DEMO-0000-5678.
4. Lab bed for Thomas Kurian: Lab says "Ward 3 · Bed 11" ABG; Nurse says Bed 7 (Bed 11 = Gopi M.); Lab home KPI says "Bed 7 ABG".
5. Handover "Bed 11 · Joy V." vs bed board (Joy V. is Bed 5; Bed 11 Gopi M.).
6. Chest X-ray AI: Doctor says right lower zone 0.71, compared with Mar 2025; Radiology says left lower zone 0.58, prior 09/26.
7. Critical K+: 6.1 (Thomas Varghese, Doctor + Lab upload page) vs 6.4 (Ward 5 Bed 2, Lab critical calls).
8. Pharmacy stock: Doctor view (Atorvastatin 10 mg 38; Metformin 1,240; Insulin glargine 64 KMSCL) vs Pharmacist (18; 420; 6).
9. Event types: Doctor emits `radiology-order`, Radiology consumes `imaging-order` (only RAD_SEED r1); Doctor `lab-order` text only creates `LO-` ids by hash in Lab.
10. Doctor hospital-admin names in different docs: Dr. Meera Krishnan consistent.
11. Radiology room naming: "USG 2" vs equipment "USG 1/2"; "X-ray DR 1" vs "Portable X-ray".
12. Sat 17 Oct date vs bus s1 "Tue 21 Oct 10:30" booking and Pharmacist bus-row issued date "18 Oct".

# PART A — Doctor.dc.html (Dr. Arun Nair)

Context: ROLE='doctor'. Date shown: Saturday 17 October 2026, "OP block 2, Demo General Hospital, Pathanamthitta". Banner: "Synthetic demo data". Sidebar footer: Dr. Arun Nair, General medicine. Top bar: "Anjali Menon · {clock}" when a session is open. State defaults: `secs: 1122` (18:42 left of 30:00), `open: true`, `bgSecs: 900`.

Doctor identity: Dr. Arun Nair, MBBS MD (General medicine), 14 years, Demo General Hospital Pathanamthitta. HPR `DEMO-HPR-71-0042`; TCMC `DEMO-41822` (Settings shows reg no `DEMO-TCMC-41822`). Languages: English, മലയാളം, Tamil (settings language list: English, മലയാളം, हिन्दी). On duty 09:00–17:00. Rating 4.7, 312 reviews. Devices: "OP block 2 PC · Pixel 8". 2FA authenticator on; Aadhaar e-Sign linked.

## A1. Home KPIs (literal)
- Greeting: "Good afternoon, Dr. Nair"; "14 patients today · 6 seen · 3 AI results waiting for your review."
- OP queue 8 waiting (avg wait 14 min); Seen today 6 of 14 (trend up "3 more than last Saturday"); AI reviews 3 pending (oldest 2 h ago); Orders back 5 results (2 lab, 3 radiology); Hours logged 5.2 h today (31.5 h this week · 2 teleconsults).
- Clinic pace patients/hour 08:00–17:00 (bar heights %): 36,70,88,54,18,36,54(now, 14:00),8,8. Aria: 08:00 2, 09:00 4, 10:00 5, 11:00 3, 12:00 1, 13:00 2, 14:00 3 so far.
- Trio: avg wait 14 min; longest wait 32 min; no-show today 1. "Next: Thomas Varghese — Critical K+ — seen before routine tokens" (token 08).
- This week patients seen: Mon 22, Tue 30, Wed 26, Thu 34, Fri 28, Sat 6 so far (bars h62,h85,h70,h95,h70,h20).
- Recent patients trio: 4 keys entered today; 18 min avg session; 0 ended early.
- Open patient page trio: 3 sessions today; 11 this week; 0 emergency uses.
- Handover trio: 3 patients handed over; 2 results pending; 1 transfer today.
- Notification bell "4 unread".

## A2. OP queue (Home; token / patient / meta / status / tone)
| Token | Patient | Meta | Status | Badge tone |
|---|---|---|---|---|
| 07 | Anjali Menon | F 38 · Follow-up, diabetes | In room | success |
| 08 | Thomas Varghese | M 61 · Critical K⁺ — priority | Next | danger |
| 09 | Lakshmi Amma | F 72 · Fever day 3 | Waiting 12 min | warning |
| 10 | Ramesh Pillai | M 55 · Hypertension review | Waiting 18 min | neutral |
| 11 | Fathima N. | F 29 · Antenatal, 24 weeks | Checked in | info |
| 12 | Biju George | M 44 · Back pain | Checked in | neutral |
+ up to 2 dynamic rows from citizen bookings: token `B1`,`B2`, name = booking title minus "New booking · ", meta "<text> · via citizen app", status "Booked", tone teal.
"Checked in and waiting" (Open page): 08 Thomas Varghese "Critical K⁺ · ask for his key" Priority(danger); 09 Lakshmi Amma "Fever day 3 · waiting 12 min" Waiting; 10 Ramesh Pillai "Hypertension review · waiting 18 min" Waiting.

## A3. Waiting for review (Home)
- Dynamic lab results from bus (type lab-result/imaging-result, to doctor), max 2.
- AI rows (static): "Chest X-ray · Anjali Menon — Image analysis · caution"; "HbA1c trend · Joseph K. — Temporal · verified"; "CYP2C19 variant · Mini T. — Genomic · uncertain". reviewCount = 3 + labRes.length.
- Alerts: bus alerts (vitals-critical => 'bal bad'; alert => 'bal warn') max 2, alertCount = 2 + n. Static alerts: danger "Critical lab value: Potassium 6.1 mmol/L · Thomas Varghese · flagged by Rahul Varghese, 14:02"; info "Referral accepted: Medical College Kottayam accepted Suresh P. (cardiology)."
- Pending prescriptions: "Metformin refill · Anjali Menon — Needs e-sign"; "Amlodipine · Ramesh Pillai — Draft · 2 items".
- Handover at 17:00: 3 patients to Dr. Sreeja Paul (evening OP); "Draft ready · simulated".

## A4. Recent patients (Home)
| Name | Meta |
|---|---|
| Anjali Menon | Today 14:24 · diabetes, lipids |
| Joseph Kurian | Today 13:40 · HbA1c |
| Mini Thomas | Today 12:15 · CYP2C19 |
| Ramesh Pillai | Thu · hypertension |
| Lakshmi Amma | Wed · fever |

Recent sessions (Open page): Joseph Kurian 13:40 · 22 min · ended by you; Mini Thomas 12:15 · 30 min · timed out.

## A5. Open patient session — Anjali Menon (the "demo patient")
Header: "F · 38 · B+ · ABHA DEMO-0000-1234 · Pathanamthitta". Badges: Allergy Penicillin (danger), Type 2 diabetes, Emergency contact: Ravi Menon. Also "Blood group B+", "Organ donor (pledged)". Allergy detail in AI chat: "Penicillin allergy recorded (rash, 2019)".
Demo key: any 6 digits; session 1800 s (30 min).

Timeline (7 entries):
| Date | Title | Detail |
|---|---|---|
| 17 Oct | Lipid profile | LDL 142 mg/dL (high) · Rahul Varghese, Demo Lab |
| 15 Oct | Chest X-ray PA | AI caution — awaiting your review |
| 20 Sep | Lower respiratory infection | Azithromycin 5 days (penicillin avoided) · Dr. Arun Nair |
| 02 Aug | Blood donation | 450 mL · Demo Blood Bank |
| 11 Mar | Diabetes diagnosed | HbA1c 7.4% · Metformin started |
| 04 Jan | Influenza vaccine | PHC Konni · yearly |
| 18 Nov 2025 | Eye check | No diabetic retinopathy · Vasan Eye Care |

At a glance: BP 118/76; HbA1c 6.9%; BMI 24.8; SpO2 98%; Meds 2 active; Docs 24.
AI summary: module Summary, status verified, confidence 0.88, "Diabetes well controlled; LDL rising" / "Consider statin dose review. Guidance only."

Patient files table (Files tab):
| File | Type | Source | Date |
|---|---|---|---|
| Lipid profile | Lab | Demo Lab · Rahul Varghese | 17 Oct 2026 |
| Chest X-ray PA | Imaging | Radiology · Fathima Beevi | 15 Oct 2026 |
| Prescription #DEMO-RX-2291 | Rx | Dr. Arun Nair | 20 Sep 2026 |
| Discharge summary | Discharge | Demo General Hospital | 06 Jun 2025 |
| Glucometer log | Uploaded | Patient | 01 Oct 2026 |

AI chat seed: me "Anything I should know before prescribing an antibiotic?" ; AI "Penicillin allergy recorded (rash, 2019). Last infection treated with azithromycin without issues. Consider a macrolide or doxycycline. Sources: allergy list, 20 Sep visit." Context used: Lipid profile 17 Oct; 2 active prescriptions; Allergy list penicillin.
Canned Q&A:
- a: "Antibiotic options with penicillin allergy?" -> "Avoid all penicillins; cephalosporin cross-reactivity is low but caution advised. Azithromycin or doxycycline are reasonable for respiratory infections. Guidance only."
- b: "Summarise last 3 visits" -> "Mar: diabetes diagnosed, metformin started. Sep: chest infection, azithromycin. Oct: lipid profile shows LDL 142. Guidance only."
- c: "Statin interactions with metformin?" -> "No clinically significant interaction. Monitor liver enzymes at 3 months. Guidance only."
- default free-text reply: "Based on the open record: HbA1c 6.9%, LDL 142, penicillin allergy. I can't confirm more without further data — please use your clinical judgement. Guidance only."

Image analysis (Chest X-ray PA · 15 Oct, "DICOM · 2 views", compare with Mar 2025): AIInsight module "Image analysis", status caution, confidence 0.71, "Possible mild right lower zone opacity"; text "Pattern is consistent with resolving infection. No pneumothorax, no effusion detected."; evidence: ["Increased density, right lower zone (box)", "Compared with Mar 2025 film", "Consistent with 20 Sep infection"]; reviewed-by Dr. Arun Nair after decision. Default patient note: "Mild changes, likely from last month's infection. Repeat in 2 weeks." Decision states: null "Needs your review" (warning) / accept "Accepted · sent to patient" / edit "Edited · sent to patient" / reject "Rejected · not shown".

Genomic panel (24 genes grid; variant cells idx 3(v3),6(v1),11(v2),15(v3),20(v1)): table
| Gene | Variant | Meaning |
|---|---|---|
| SLCO1B1 | c.521T>C | Statin myopathy risk ↑ |
| CYP2C9 | *1/*1 | Normal |
| CYP2C19 | *1/*2 | Clopidogrel response ↓ |
AI: module Genomic, status uncertain, confidence 0.54, "SLCO1B1 variant may raise statin muscle risk" / "Consider a lower statin dose and monitor CK. Evidence is moderate."; evidence ["SLCO1B1 c.521T>C heterozygous","CPIC guideline level B"]. aria: 24 genes, 2 moderate, 1 significant.

Temporal: HbA1c fell 7.4 -> 6.9 % while LDL rose 118 -> 142 mg/dL over 18 months (Apr 25 – Oct 26). AI: Temporal, verified, 0.82, "LDL up 20% in 6 months"; "Glucose control improving; lipids drifting up. Review statin adherence."; evidence ["6 lipid results","8 HbA1c results","Statin refills 70% on time"].

## A6. Prescriptions
- Default new Rx for Anjali Menon: items ['Metformin 500 mg','Atorvastatin 10 mg']; dose strings: even index "1 tablet twice daily after food · 30 days", odd "1 tablet after lunch · 30 days". Advice default: "Walk 30 minutes daily. Repeat lipid profile in 3 months."
- Drug search list: Amoxicillin 500 mg; Amoxicillin + Clavulanate 625 mg; Azithromycin 500 mg; Atorvastatin 20 mg; Metformin 1000 mg; Doxycycline 100 mg; Paracetamol 650 mg; Amlodipine 5 mg. Allergy block regex amoxi|penicil|clav -> "Blocked — patient is allergic to penicillin".
- Checks: Interaction check verified "No major interactions — Metformin + Atorvastatin: safe together. Simulated."; "In stock at Demo Hospital Pharmacy"; "Kidney function OK for metformin (eGFR 92)"; "Penicillin-class drugs are blocked".
- Sent message: "Sent to Joseph Mathew at Demo Hospital Pharmacy and to Anjali's Medicines."
- Issued this week:
| Patient | Medicines | Date | Status (tone) |
|---|---|---|---|
| Joseph Kurian | Glimepiride 1 mg | 17 Oct | Dispensed (success) |
| Mini Thomas | Clopidogrel 75 mg | 16 Oct | Signed (teal) |
| Ramesh Pillai | Amlodipine 5 mg, Losartan | 15 Oct | Draft (neutral) |
| Lakshmi Amma | Paracetamol 650 mg | 14 Oct | Dispensed (success) |

## A7. Emergency (break-glass)
- Reasons: Unconscious patient; Life-threatening bleeding; Severe allergic reaction; Cardiac arrest; Other emergency. Justification min 20 chars. 15-minute read-only window (900 s).
- Matched patient: "Unknown female, ~40 (matched by face + fingerprint to DEMO-0000-5512)". Emergency card: Blood group O+; Allergies Sulfa drugs; Conditions Type 1 diabetes; Contact Brother · notified.
- Notified: Hospital admin review queue (Dr. Meera Krishnan · decides within 24 h); patient's access history; District audit.
- Your last uses: 03 Oct · road accident — Reviewed · justified — Cleared; 12 Aug · unconscious, diabetic — Reviewed · justified — Cleared.
- Bus event pushed: type break-glass, to [hospitaladmin, citizen], title "Emergency access used · <reason>", text "Dr. Arun Nair · Unknown female ~40 (DEMO-0000-5512) · 15 min".

## A8. Referral & handover
- Patients dropdown: Anjali Menon, Thomas Varghese, Suresh P. Refer-to: "Cardiology · Medical College Kottayam", "Endocrinology · District Hospital Kozhencherry", "Ophthalmology · Demo Eye Centre". Urgency: Routine (2 weeks), Soon (72 hours), Urgent (today). Default reason: "Rising LDL despite statin; family history of early MI. Please assess."
- Bus event: referral, to [citizen, hospitaladmin], "Referral · Cardiology, MC Kottayam", "Anjali Menon · routine · rising LDL · Dr. Arun Nair", href CitizenCare.
- Handover 17:00 to Dr. Sreeja Paul: 1 Thomas Varghese "K⁺ 6.1 — repeat at 18:00, ECG done" Watch(danger); 2 Lakshmi Amma "Fever day 3, dengue NS1 pending" Pending(warning); 3 Suresh P. "Transfer to Kottayam at 19:30" Transfer(info). Bus event handover from doctor to [doctor, nurse]: "Shift handover · 3 patients" / "Dr. Arun Nair → Dr. Sreeja Paul · Thomas V., Lakshmi A., Suresh P." href Nurse.
- Referrals sent:
| Patient | To | Sent | Status |
|---|---|---|---|
| Suresh P. | Cardiology, MC Kottayam | 16 Oct | Accepted (success) |
| Mini Thomas | Neurology, DH Kozhencherry | 12 Oct | Waiting (warning) |
| Babu Jacob | Nephrology, MC Kottayam | 04 Oct | Seen (info) |

## A9. Orders
Form: patients [Anjali Menon, Thomas Varghese, Lakshmi Amma, Joseph Kurian]; tests [HbA1c (lab), Lipid profile (lab), Electrolytes (lab), Dengue NS1 (lab), Chest X-ray PA (radiology), USG abdomen (radiology)]; priorities [Routine, Urgent, STAT]. New order id `(RAD-|LAB-) + (2300 + n*7 + 9)` => LAB-2309 first. Assigned: radiology -> "Fathima Beevi", lab -> "Rahul Varghese". Stat cards: Open 11; In progress 4; Results back 5; Critical 1 (K⁺ 6.1 · Thomas V.).
| Order | Patient | Test | Assigned to | Status (tone) |
|---|---|---|---|---|
| LAB-8841 | Thomas Varghese | Electrolytes | Rahul Varghese | Critical (danger) |
| LAB-8839 | Anjali Menon | Lipid profile | Rahul Varghese | Result back (success) |
| RAD-2210 | Anjali Menon | Chest X-ray PA | Fathima Beevi | AI review (ai) |
| LAB-8850 | Lakshmi Amma | Dengue NS1 | Rahul Varghese | In progress (info) |
| RAD-2214 | Suresh P. | Echo | Fathima Beevi | Scheduled (neutral) |
| LAB-8852 | Joseph Kurian | HbA1c | Rahul Varghese | Sample taken (teal) |

## A10. Donors
Blood group chips: A+, A−, B+, B−, O+, O−, AB+, AB− (default B+; within 10 km of Demo General Hospital). Donors:
- B+: Anjali Menon "Resting until 02 Nov"; Vishnu Prasad "2.1 km · last gave Apr"; Reshma K. "3.4 km · first-time donor"; Biju George "6.8 km · gave 9 times".
- O−: Ananya R. "4.2 km · universal donor".
- Other groups: Demo donor 1 (2.5 km), Demo donor 2 (5.0 km), Demo donor 3 (8.1 km).
Blood bank stock: B+ 14; O+ 22; O− 2; AB− 0. Organ pledge lookup restricted (KNOS).
Bus event blood-request: to [citizen,district] "Blood needed · <group> · 2 units" / "Demo General Hospital · requested by Dr. Arun Nair" href CitizenBlood.

## A11. Pharmacy stock (doctor view)
| Medicine | Pharmacy | Distance | Status | Qty |
|---|---|---|---|---|
| Metformin 500 mg | Demo Hospital Pharmacy | 0.0 km | In stock | 1,240 |
| Atorvastatin 10 mg | Demo Hospital Pharmacy | 0.0 km | Low | 38 |
| Atorvastatin 10 mg | Jan Aushadhi, Adoor Rd | 1.2 km | In stock | 420 |
| Insulin glargine | KMSCL store, Pathanamthitta | 3.0 km | In stock | 64 |
| Azithromycin 500 mg | Demo Hospital Pharmacy | 0.0 km | Out | 0 |
| Doxycycline 100 mg | Jan Aushadhi, Adoor Rd | 1.2 km | In stock | 210 |

## A12. Schedule (Sat 17 Oct)
Stat cards: Booked today = 9 + new bookings (2 teleconsults); Checked in 4 waiting; No-shows 1 (auto-reminder 08:00); From citizen app = # booking events.
| Time | Patient | Meta | Status | Tone |
|---|---|---|---|---|
| 09:00 | Joseph Kurian | M 66 · HbA1c review | Done | neutral |
| 09:20 | Mini Thomas | F 47 · clopidogrel review | Done | neutral |
| 09:40 | Babu Jacob | M 58 · kidney follow-up | No-show | danger |
| 10:30 | Anjali Menon | F 38 · diabetes follow-up | Done | neutral |
| 14:30 | Thomas Varghese | M 61 · critical K⁺ review | Next | teal |
| 14:50 | Lakshmi Amma | F 72 · fever day 3 | Checked in | info |
| 15:10 | Ramesh Pillai | M 55 · hypertension | Checked in | info |
| 15:30 | Fathima N. | F 29 · antenatal | Checked in | info |
| 16:00 | Teleconsult · Sindhu R. | F 34 · thyroid · video | Booked | ai |
Up next 14:30: Thomas Varghese "M 61 · critical K⁺ review · checked in 14:05". Booking events appear as slot time 'Tue', status "New booking". Availability: accept online bookings (on), Teleconsult 16:00–17:00 (on), Leave on [No leave planned, Mon 26 Oct, Fri 30 Oct].
Week of 12–17 October:
| Day | Count | Events |
|---|---|---|
| Mon 12 | 22 patients | 09:00 OP clinic; 14:00 OP clinic |
| Tue 13 | 30 patients | 08:00 Ward round; 10:00 OP clinic; 16:00 Teleconsult |
| Wed 14 | 26 patients | 09:00 OP clinic; 15:00 Diabetes camp, Adoor (ward-style) |
| Thu 15 | 34 patients | 08:00 Ward round; 10:00 OP clinic; 16:00 Teleconsult |
| Fri 16 | 28 patients | 09:00 OP clinic; 14:00 Case review |
| Sat 17 | 14 today | 09:00 OP clinic; 16:00 Teleconsult; 17:00 Handover |

## A13. Messages (threads)
| # | Name | Meta | Unread | Messages |
|---|---|---|---|---|
| 0 | Anjali Menon | F 38 · diabetes follow-up · last seen 17 Oct | 2 | pt "Doctor, after starting atorvastatin I get mild leg aches at night. Should I stop?" (Anjali · 12:10); pt "I also uploaded my glucometer log from home." (Anjali · 12:12) (+ live citizen 'message' bus events) |
| 1 | Joseph Kurian | M 66 · HbA1c review | 1 | pt "Lab says my HbA1c sample is taken. When will you see the result?" (Joseph · 11:40) |
| 2 | Lakshmi Amma | F 72 · fever day 3 · via daughter | 0 | pt "Fever is less today, 99°F. Still tired." (Daughter Sindhu · 09:05); me "Good. Keep drinking fluids. The dengue test result will come by evening — I will message you." (You · 09:20) |
| 3 | Ramesh Pillai | M 55 · hypertension | 0 | pt "BP at home 138/88 this week." (Ramesh · Thu); me "Thank you. Continue amlodipine; we will review on Tuesday." (You · Thu) |
| 4 | Fathima N. | F 29 · antenatal 24 weeks | 0 | pt "Is it safe to take paracetamol for headache?" (Fathima · Wed); me "Yes, paracetamol 500 mg up to 3 times a day is fine. Tell us if headaches persist." (You · Wed) |
Quick replies: "Please continue the same dose."; "Book a follow-up in the app."; "I have ordered a test for you." Reply bus event: message from doctor to [citizen] "Reply from Dr. Arun Nair" / "<patient>: <text>" href CitizenMessages.

## A14. Profile & reviews
Dr. Arun Nair (photo initials AN). Mentioned most: Explains clearly 128; Speaks Malayalam 96; On time 71; Long wait 22. KV: Consults 2026 4,210; Teleconsults 386; Avg consult 9 min; Referrals 148. Rating breakdown: 5★ 76%, 4★ 16%, 3★ 5%, 2★ 2%, 1★ 1%.
| Who | Date | Stars | Text |
|---|---|---|---|
| Anjali M. | 12 Oct | 5 | Explained my sugar report in Malayalam and drew a little chart for me. Never felt rushed. |
| Joseph K. | 08 Oct | 5 | Saw my lab result within an hour and messaged me the change in tablets. |
| Sindhu R. | 01 Oct | 4 | Teleconsult was smooth. Wait for the video link was 10 minutes. |
| Babu J. | 27 Sep | 3 | Good doctor, but OP waiting time was over an hour on Monday. |

## A15. CF_SEED (the shared event bus; identical in all role apps unless noted)
localStorage key `cf-demo-bus-v1`; keeps last 40; poll every 2 s. Event shape `{id,type,from,to[],title,text,href,at}`.
```json
[
 {"id":"s1","type":"booking","from":"citizen","to":["doctor"],"title":"New booking · Anjali Menon","text":"Tue 21 Oct, 10:30 · follow-up","href":"Doctor.dc.html","at":"09:12"},
 {"id":"s2","type":"prescription","from":"doctor","to":["pharmacist","citizen"],"title":"e-Signed prescription · Anjali Menon","text":"Metformin 500 mg ×60, Atorvastatin 10 mg ×30 · Dr. Arun Nair","href":"Pharmacist.dc.html","at":"10:05"},
 {"id":"s3","type":"lab-order","from":"doctor","to":["labtech"],"title":"Lab order · HbA1c, lipid profile","text":"Anjali Menon · routine · Dr. Arun Nair","href":"LabTech.dc.html","at":"10:07"},
 {"id":"s4","type":"lab-result","from":"labtech","to":["doctor","citizen"],"title":"Result ready · Lipid profile","text":"LDL 142 mg/dL (high) · uploaded by Rahul Varghese","href":"Doctor.dc.html","at":"11:05"},
 {"id":"s5","type":"break-glass","from":"doctor","to":["hospitaladmin","citizen"],"title":"Emergency access used","text":"Dr. Sreeja Paul · Thomas Kurian · unconscious on arrival","href":"HospitalAdmin.dc.html","at":"03:12"},
 {"id":"s6","type":"alert","from":"district","to":["citizen","doctor","nurse","hospitaladmin"],"title":"Heatwave — Pathanamthitta","text":"Stay indoors 12:00–16:00 · District health office","href":"CitizenAlerts.dc.html","at":"08:00"},
 {"id":"s7","type":"vitals-critical","from":"nurse","to":["doctor"],"title":"Early-warning score 7 · Bed 7","text":"Thomas Kurian · SpO₂ 91% · escalated by Lekha Pillai","href":"Doctor.dc.html","at":"12:40"},
 {"id":"s8","type":"dispensed","from":"pharmacist","to":["citizen","pharmacyadmin"],"title":"Ready to collect · Demo Hospital Pharmacy","text":"Anjali Menon · Metformin, Atorvastatin · Joseph Mathew","href":"CitizenMedicines.dc.html","at":"13:20"},
 {"id":"s9","type":"complaint","from":"citizen","to":["hospitaladmin","district"],"title":"Complaint filed · long OP wait","text":"Demo General Hospital · ticket CMP-0412","href":"HospitalAdmin.dc.html","at":"14:02"},
 {"id":"s10","type":"blood-request","from":"doctor","to":["citizen","district"],"title":"Blood needed · B+ · 2 units","text":"Demo General Hospital · surgery tomorrow 08:00","href":"CitizenBlood.dc.html","at":"14:30"}
]
```
Event type -> chip token/class: booking BK t-blue; prescription Rx t-teal; lab-order LAB t-blue; radiology-order RAD t-lav; lab-result RES t-sage; imaging-result IMG t-lav; break-glass ! t-peach; alert ALR t-peach; vitals-critical EWS t-peach; dispensed OK t-sage; complaint CMP t-cream; blood-request B+ t-peach; message MSG t-teal; referral REF t-lav; handover HO t-cream.
Role labels: citizen, doctor, nurse, labtech, radiology, pharmacist, pharmacyadmin, hospitaladmin, district, state, zonal, central.
Events pushed by Doctor app: prescription (to pharmacist,citizen), lab-order/radiology-order (to labtech|radiology + citizen; text "<patient> · <priority lowercase> · <id> · Dr. Arun Nair"), break-glass, referral, handover, message, blood-request.

NOTE data inconsistency: s5 break-glass says "Dr. Sreeja Paul · Thomas Kurian · unconscious on arrival" at 03:12 but Doctor's own flow uses "Unknown female ~40 (DEMO-0000-5512)". "Thomas Kurian" (bed 7, nurse) vs "Thomas Varghese" (OP queue critical K+) are different people (or same? see cross-link table).

# PART B — Nurse.dc.html (Lekha Pillai, Staff Portal, Ward 3)

Context: ROLE='nurse'. Title "Nurse — Staff Portal". Banner: "Staff Portal · Lekha Pillai and all patients shown are simulated." Breadcrumb "Ward 3 · Demo General Hospital". Top bar: "Day shift · 07:00–15:00". Home date: "Saturday, 17 October 2026 · 10:42" "Good morning, Lekha". CF_SEED is identical to Part A15 (same 10 events; nurse receives s6 alert heatwave only; sends s7). Nurse nav badge: alerts 4 + bus alerts; orders = open pending count.

Nurse identity: Lekha Pillai, Staff nurse · Ward 3. Registration `KL-NC-DEMO-4471` (Nurse). Charge nurse: Sr. Mini Joseph. Hand-over targets: "Sr. Beena Thomas · evening shift" (default), "Sr. Mini Joseph · charge nurse", "Br. Rejo Mathew · float". Handover time 15:00; "Handover in 4 h 18 min"; Breaks taken 1 of 2.

## B1. Ward census & KPIs
Ward census 22 / 24 beds (2 discharges planned today; likely discharges Beds 3, 9 per handover page). My patients 6 (Beds 3, 4, 7, 8, 11, 12). Meds due next hour = doses left in MAR (hint "1 overdue at Bed 7"). Early-warning 2 patients (NEWS >= 5; beds 7, 12). Handover page: Beds occupied 22 of 24; NEWS 5 or more 2 · Beds 7, 12; Doses due next 4 h 9; Likely discharges 2 · Beds 3, 9.
Next due: Bed 11 · X-ray prep 11:45. Overdue: 1 · Bed 7 IV dose.

## B2. Bed board (24 beds; code s=Stable, w=Watch, c=Critical, f=Free; 'mine' = assigned to Lekha)
| Bed | Name (short) | State | Mine |
|---|---|---|---|
| 1 | Ramesh K. | Stable | |
| 2 | Lalitha P. | Stable | |
| 3 | Anjali M. | Stable | mine |
| 4 | Abdul R. | Watch | mine |
| 5 | Joy V. | Stable | |
| 6 | (free) | Free | |
| 7 | Thomas K. | Critical | mine |
| 8 | Mary G. | Stable | mine |
| 9 | Saji N. | Stable | |
| 10 | Usha D. | Stable | |
| 11 | Gopi M. | Watch | mine |
| 12 | Sreedevi A. | Watch | mine |
| 13 | Ali H. | Stable | |
| 14 | Bindu S. | Stable | |
| 15 | Mohan L. | Stable | |
| 16 | Rosamma T. | Stable | |
| 17 | Shibu P. | Stable | |
| 18 | (free) | Free | |
| 19 | Kunjumon | Stable | |
| 20 | Fousiya | Stable | |
| 21 | Vinod R. | Stable | |
| 22 | Ammini | Watch | |
| 23 | Rajan C. | Stable | |
| 24 | Sathi K. | Stable | |
(Note: 2 free beds (6,18) = 22/24 occupied. Home meta says 2 'discharges planned' etc.)
Bed -> full name map (NAMES): Bed 3 Anjali Menon; Bed 4 Abdul Rasheed; Bed 7 Thomas Kurian; Bed 8 Mary George; Bed 11 Gopi M.; Bed 12 Sreedevi Amma. Handover also names "Bed 11 · Joy V. — X-ray result pending" (bed board says Joy V. is Bed 5, Gopi M. is Bed 11: INCONSISTENCY).

## B3. Inpatients with detail
| Bed | Patient | Age/Sex | Details |
|---|---|---|---|
| 3 | Anjali Menon | 34 F (Doctor app says 38) | IP no `IP-DEMO-30318`, admitted 15 Oct, Dr. Arun Nair, Type 2 diabetes + LRTI; Penicillin allergy; blood group B+; diet Diabetic 1800 kcal; mobility Independent; sugar 164 pre-lunch; "Improving... Likely discharge Monday"; Ceftriaxone ordered (doctor confirmed cross-reactivity low, 10:31) |
| 4 | Abdul Rasheed | - | CBC sample pending collection; wound dressing; CBC result WBC 13.2 (high) alert; Paracetamol PRN; Pantoprazole |
| 7 | Thomas Kurian | 68 M | COPD, admitted 16 Oct with pneumonia; NEWS 7; SpO2 91% RR 24 Temp 38.6; on 2 L O2 SpO2 94%; HR 112; ABG repeat 16:00; Ceftriaxone 1 g IV overdue (due 10:00); order O-7841 |
| 8 | Mary George | - | NBM for endoscopy 13:00, consent signed; Insulin regular 6 U SC |
| 11 | Gopi M. | - | Portable chest X-ray prep 11:45; Salbutamol neb; "Joy V." in handover watch list |
| 12 | Sreedevi Amma | 74 F | NEWS 5; BP 92/58 HR 108; amlodipine withheld; NS 500 mL fluids started 10:15; fall risk high, bed rails up |

Early-warning list: Bed 7 Thomas Kurian 68 — score 7 — SpO2 91% RR 24 Temp 38.6 — Escalated (danger); Bed 12 Sreedevi Amma 74 — 5 — BP 92/58 HR 108 — Hourly obs (warning); Bed 3 Anjali Menon 34 — 1 — all within range.

## B4. My tasks (index, name, sub, time; initial done: idx 0,1; idx2 shown 'late')
| # | Task | Sub | Time | Initially done |
|---|---|---|---|---|
| 0 | Bed 3 · Morning vitals | Done 06:10 | 06:00 | yes |
| 1 | Bed 8 · Endoscopy consent | Signed | 08:30 | yes |
| 2 | Bed 7 · IV Ceftriaxone | STAT · overdue | 10:00 | no (late) |
| 3 | Bed 4 · Collect CBC, CRP | Lab order | 11:30 | no |
| 4 | Bed 12 · Fluid balance | Chart hourly | 11:00 | no |
| 5 | Bed 11 · Prep for X-ray | Portable | 11:45 | no |

## B5. Medication round (MAR) 10:00 round; initial given idx 0,1,2; idx 3 shown late
| # | Bed | Drug | Route/sub | Time | Initially given |
|---|---|---|---|---|---|
| 0 | Bed 3 | Metformin 500 mg | Oral · after breakfast | 08:00 | yes |
| 1 | Bed 4 | Pantoprazole 40 mg | Oral · before food | 08:00 | yes |
| 2 | Bed 8 | Insulin regular 6 U | SC · hold if NBM | 08:00 | yes |
| 3 | Bed 7 | Ceftriaxone 1 g | IV · STAT · due | 10:00 | no (late) |
| 4 | Bed 3 | Ceftriaxone 1 g | IV · over 30 min | 10:00 | no |
| 5 | Bed 11 | Salbutamol nebulisation | Inhaled · 2.5 mg | 10:00 | no |
| 6 | Bed 12 | Amlodipine 5 mg | Oral · withheld? | 10:00 | no |
| 7 | Bed 4 | Paracetamol 650 mg | Oral · if T > 38 | PRN | no |
Alert: "Allergy check — Bed 3: Penicillin allergy. Ceftriaxone ordered: cross-reactivity is low; doctor confirmed at 10:31." Withheld/refused: Bed 12 Amlodipine 5 mg withheld — BP 92/58, Dr. informed; Bed 8 nil by mouth till 13:00 (endoscopy). Ward stock: Insulin glargine pens 3 left (warning); Paracetamol IV 1 g 22 (success).

## B6. Orders received (ORD; id, bed, what, kind, by, at, status text)
| Order | Bed | Order | Kind (pri) | Ordered by | At | Status text | Initial decision |
|---|---|---|---|---|---|---|---|
| O-7841 | Bed 7 | Ceftriaxone 1 g IV | stat | Dr. Arun Nair | 10:31 | Due now | pending |
| O-7838 | Bed 4 | CBC, CRP | lab (urgent) | Dr. Arun Nair | 09:58 | Collect 11:30 | pending |
| O-7835 | Bed 11 | Chest X-ray portable | stat | Dr. Sreeja Paul | 09:40 | Radiology | pending |
| O-7830 | Bed 12 | IV NS 500 mL | med (routine) | Dr. Sreeja Paul | 10:12 | Running | accepted |
| O-7822 | Bed 3 | HbA1c, fasting sugar | lab (urgent) | Dr. Arun Nair | 08:15 | Sample sent | accepted |
| O-7819 | Bed 8 | Insulin sliding scale | med (routine) | Dr. Arun Nair | 07:50 | Active | accepted |
Mapping: stat->STAT, lab->Urgent, med->Routine. After 7 s a live order arrives: `O-7849 | Bed 12 | Repeat BP in 30 min | urgent | Dr. Sreeja Paul | <now>`. Bus order events to nurse become `B-xxxx | Ward 3 | <title> | urgent`. Stats: Done this shift 17 (avg 14 min to start); Waiting on lab 4 (Rahul Varghese notified). Escalation chain Ward 3: 1 Duty doctor Dr. Arun Nair within 15 min; 2 Rapid response team NEWS>=7; 3 Nursing superintendent no answer in 30 min.

## B7. Vitals
Patients preset (VPRE): b3 "Bed 3 · Anjali Menon" hr 88 rr 18 spo2 97 temp 37.4; b7 "Bed 7 · Thomas Kurian" hr 112 rr 24 spo2 91 temp 38.6. Defaults: SBP 118, DBP 76, glucose 164 (random, pre-lunch), obs note "Comfortable, cough reduced. Tolerating diet." Consciousness options: Alert, Responds to voice, Responds to pain, Unresponsive; Pain: 0 · none, 1–3 · mild, 4–6 · moderate, 7–10 · severe.
NEWS formula (partial NEWS: RR, SpO2, Temp, HR only): RR <=8:3, <=11:1, <=20:0, <=24:2, else 3; SpO2 <=91:3, <=93:2, <=95:1, else 0; Temp <=35:3, <=36:1, <=38:0, <=39:1, else 2; HR <=40:3, <=50:1, <=90:0, <=110:1, <=130:2, else 3. >=5 escalates to doctor (bus vitals-critical: title "Early-warning score N · Bed X", text "<Name> · SpO₂ x% · RR y · escalated by Lekha Pillai").
Bands: 0–2 routine obs 4–6 h; 3–4 hourly obs + tell charge nurse; 5–6 sent to treating doctor automatically; 7+ rapid response team.
Earlier readings today (Bed 3 table):
| Time | BP | Pulse | SpO2 | Temp | NEWS |
|---|---|---|---|---|---|
| 10:00 | 122/78 | 88 | 95% | 37.4 | 2 |
| 06:00 | 126/80 | 92 | 94% | 37.9 | 3 |
| 02:00 | 130/82 | 96 | 93% | 38.2 | 4 |
| 22:00 | 128/84 | 98 | 93% | 38.4 | 4 |
| 18:00 | 124/80 | 90 | 95% | 37.8 | 2 |
Previous sets: 06:10 120/78 · 92 · SpO2 96 · 37.8; 02:05 124/80 · 96 · SpO2 95 · 38.1; 22:00 126/82 · 101 · SpO2 94 · 38.4. Temperature chart 48 h: 38.8 -> 37.4 °C from 15 Oct to now.

## B8. Admission-mode access log (today)
| Time | Patient | What | Reason |
|---|---|---|---|
| 10:41 | Anjali Menon · Bed 3 | Opened chart | Admission mode |
| 10:20 | Sreedevi Amma · Bed 12 | Nursing note | Admission mode |
| 10:02 | Thomas Kurian · Bed 7 | Vitals + escalation | Order O-7841 |
| 09:15 | Abdul Rasheed · Bed 4 | Dressing note | Admission mode |
Admission session = 2 h (initial left=6372 s = 1:46:12), ends at shift change.

## B9. Nursing notes (initial)
| Title | Body | Meta | Flag |
|---|---|---|---|
| Bed 12 · Sreedevi Amma | Low BP, amlodipine withheld. Fluids 500 mL started 10:15. Fall risk high — bed rails up. | Lekha Pillai · 10:20 | yes |
| Bed 3 · Anjali Menon | Improving. Sugar 164 pre-lunch. Likely discharge Monday. | Lekha Pillai · 09:50 | |
| Bed 4 · Abdul Rasheed | CBC sample pending collection. Wound dressing done, clean. | Lekha Pillai · 09:15 | |
| Bed 8 · Mary George | NBM for endoscopy at 13:00. Consent signed. | Lekha Pillai · 08:40 | |
SBAR defaults (Bed 7 · Thomas Kurian): Situation "Febrile, SpO₂ 91% on room air, NEWS 7."; Background "68 M, COPD, admitted 16 Oct with pneumonia."; Assessment "Worsening since 08:00. On 2 L O₂ now, SpO₂ 94%."; Recommendation "Hourly obs. Repeat ABG at 16:00. Dr. Nair to review."
Handover note checklist (4 of 6 drafted): done Bed 12 fluids & fall risk; done Bed 3 discharge plan; open Bed 7 SBAR for escalation (Priority); open Bed 11 post X-ray status.
Still open at handover (5): Bed 7 Ceftriaxone 1 g IV (due 10:00) Overdue; Bed 7 Repeat ABG 16:00; Bed 4 CBC sample to lab 11:30; Bed 11 Portable chest X-ray 11:45; Bed 12 Recheck BP after fluids 12:15.
Watch list for evening (3): Bed 7 Thomas Kurian hourly obs, ABG 16:00; Bed 12 Sreedevi Amma BP after fluids, fall risk; Bed 11 Joy V. X-ray result pending.

## B10. Alerts page
Bus alerts (heatwave) + static: danger "Bed 7 · NEWS 7 — escalate: Rapid response team paged 10:28. Dr. Arun Nair acknowledged."; warning "Bed 7 · Overdue dose: Ceftriaxone 1 g IV was due 10:00."; info "Lab result ready · Bed 4: CBC: WBC 13.2 (high). Doctor notified."; info "Ward notice: Fire drill Monday 10:00. Oxygen cylinder check due." Switches: early-warning escalations (always on), overdue medicine reminders, lab result ready, ward notices by SMS (off).
Workload initial: Vitals sets 7/10, Medicines 3/8, Tasks 2/6, Orders actioned 3/6.

# PART C — LabTech.dc.html (Rahul Varghese, Central Lab)

Context: ROLE='labtech'. Title "Lab technician — Staff Portal". Banner "Staff Portal · Rahul Varghese, orders and results shown are simulated." Breadcrumb "Central Lab · Demo General Hospital". Top: "Analyser online · Sysmex XN-DEMO". Home date "Saturday, 17 October 2026 · 10:42". Sidebar: Rahul Varghese, "Lab technician · Central Lab" (credential in Upload: "Rahul Varghese, DMLT"). Pathologist e-sign: Dr. Deepa Mohan. Shift handover "To Anoop K. · 14:00". CF_SEED = same 10 events as A15 (labtech receives s3 lab-order; sends s4).

## C1. KPIs
Open orders 38 (9 STAT · 29 routine); Awaiting sample 12 (oldest 54 min); Ready to verify 7; STAT turnaround 42 min (trend up "6 min faster than last week"). Workload initial: Samples collected 18+tubesDone(1)=19/24; Results released 64/72; Queue actioned (n - open)/n; QC runs passed 3/4. "2 samples rejected (haemolysis)". Median turnaround 42 min; STAT waiting 1 · Bed 7 ABG (text; worklist LO-55131 says Bed 11); Analysers up 4 of 4; Next QC run 14:00. Nav badge Worklist = open pending count (9 default).

## C2. Worklist (W) — id | patient | tests | from | priority | status key | status label | waiting
| Order | Patient | Tests | From | Priority | Key | Status | Waiting |
|---|---|---|---|---|---|---|---|
| LO-55131 | Thomas Kurian, 68 M | ABG | Ward 3 · Bed 11 | stat | wait | Awaiting sample | 54 min |
| LO-55120 | Abdul Rasheed, 52 M | CBC, CRP | Ward 3 · Bed 4 | stat | verify | To verify | 38 min |
| LO-55118 | Sreedevi Amma, 74 F | Electrolytes | Ward 3 · Bed 12 | stat | run | Running | 22 min |
| LO-55109 | Anjali Menon, 34 F | HbA1c, FBS | Ward 3 · Bed 3 | routine | run | Running | 1 h 10 |
| LO-55102 | OP-218 · Joseph P., 45 M | Lipid profile | OP | routine | wait | Awaiting sample | 12 min |
| LO-55097 | Mary George, 59 F | LFT | Ward 3 · Bed 8 | routine | verify | To verify | 1 h 42 |
| LO-55090 | OP-207 · Nisha R., 29 F | TSH, T4 | OP | routine | verify | To verify | 2 h 05 |
Incoming queue = only items with key 'wait' start 'pending' (LO-55131, LO-55102) + live: after 7 s `LO-55140 | Gopi M., 61 M | Blood glucose (random) | Ward 3 · Bed 11 | Dr. Sreeja Paul | urgent`. Bus lab-order events become `LO-(55132 + hash%7)` with patient = text.split(' · ')[0] ("Anjali Menon"), tests = title minus "Lab order · " ("HbA1c, lipid profile"), from "Doctor app", routine.
Filters: All, STAT, Awaiting sample, Running, To verify.
Lookup suggestions use W. Recent doc orderOpts (Upload): "LO-55120 · Abdul Rasheed · CBC, CRP"; "LO-55109 · Anjali Menon · HbA1c, FBS" (default); "LO-55097 · Mary George · LFT". Report types: Final report, Interim report, Addendum.

## C3. Sample collection (order LO-55120, barcode LO-55120-0417; Abdul Rasheed, 52 M, Ward 3 Bed 4)
Tubes: EDTA · lavender — CBC · 3 mL (collected); Plain · red — CRP · 4 mL; Blood culture — Aerobic bottle. Fasting 10 h confirmed; labels printed 10:41 · 3 tubes; collector Rahul Varghese; send by 11:30 · tube 2. Checks: name/band ID match; fasting not required; "On antibiotics since 16 Oct — note on culture"; consent recorded by Lekha Pillai. Queue: Bed 11 ABG · STAT 54 min; OP-218 Lipid profile 12 min; OP-221 HbA1c 6 min. Button "Mark collected · 10:44".

## C4. Result entry (LO-55120 · CBC + CRP · Abdul Rasheed, 52 M · Dr. Arun Nair) — values pre-filled
| Parameter | Unit | Ref low | Ref high | Ref text | Value |
|---|---|---|---|---|---|
| WBC | ×10³/µL | 4 | 11 | 4.0–11.0 | 13.2 (High) |
| Haemoglobin | g/dL | 12 | 16 | 12–16 | 11.8 (Low) |
| RBC | ×10⁶/µL | 4.2 | 5.4 | 4.2–5.4 | 4.1 (Low) |
| Haematocrit | % | 36 | 46 | 36–46 | 36.2 |
| Platelets | ×10³/µL | 150 | 410 | 150–410 | 148 (Low) |
| CRP | mg/L | 0 | 10 | < 10 | 46 (High) |
| Neutrophils | % | 40 | 75 | 40–75 | 82 (High) |
Comment default: "Sample slightly haemolysed; platelet count confirmed on smear." Delta check: WBC 9.8 → 13.2 (12 Oct); CRP 18 → 46 (12 Oct). Critical call log: 10:12 K⁺ 6.4 → Dr. Sreeja Paul, read back ✓. Release pushes bus `lab-result` to [doctor, citizen]: title "Result ready · CBC, CRP", text "Abdul Rasheed · LO-55120 · N flagged · uploaded by Rahul Varghese", href CitizenDocuments.

## C5. Critical values to call (Home)
| Badge | Detail | State |
|---|---|---|
| K⁺ 6.4 | Ward 5 · Bed 2 · call Dr. Sreeja Paul | Log call |
| Glu 42 | OP-219 · called Dr. Arun Nair 09:48 | Read back ✓ |
| Hb 6.9 | Ward 2 · Bed 9 · transfusion team told | Read back ✓ |
Upload page "Critical values: K⁺ 6.1 · called 10:12" (note: K⁺ 6.1 here vs 6.4 in call log; K⁺ 6.1 is Thomas Varghese in Doctor app).

## C6. Upload / recent uploads
Recently uploaded (static):
| Title | Meta | Badge |
|---|---|---|
| Lipid profile · Anjali Menon | LO-55098 · 09:12 · 184 KB | Delivered |
| Urine culture · Mary George | LO-55071 · 08:40 · 96 KB | Delivered |
| Thyroid panel · OP-207 | LO-55044 · yesterday | Awaiting e-sign |
| Blood culture · Thomas Kurian | LO-55030 · yesterday · 128 KB | Preliminary |
Upload default file name `cbc_LO-55120.pdf · 212 KB`. Released to: Dr. Arun Nair · patient. Reports kept 7 years, can't be deleted.
Handover notes (initial): "Cobas c311 flagged calibration at 08:10 — rerun K⁺ L1 before releasing electrolytes." (Rahul Varghese · 09:05); "Blood culture LO-55071 incubating, read at 18:00." (Rahul Varghese · 08:30).

## C7. QC
Levey–Jennings Glucose control L2 (20 runs in control). QC runs today:
| Time | Analyte | Level | Value | Result |
|---|---|---|---|---|
| 07:40 | Glucose | L2 | 248 mg/dL | Pass |
| 07:42 | Haemoglobin | L1 | 8.1 g/dL | Pass |
| 07:55 | Potassium | L1 | 3.38 mmol/L | 1₂s warn |
| 08:20 | Potassium | L1 | 3.51 mmol/L | Pass |
Alert "Potassium L1 — 1₂s warning. Westgard rule triggered 07:55." Instruments: Sysmex XN haematology OK; Cobas c311 chemistry Calibrate; ABG analyser OK. Reagent lots: HbA1c lot 24K18 exp 30 Nov; CRP lot 31C02 exp 12 Jan.

## C8. Turnaround stats
STAT median 42 min (target 60); Routine median 2.6 h (target 4); Within target 94% (up from 89%); Rejected samples 1.8% (mostly haemolysis). STAT minutes by day Sun..Today: 51, 48, 44, 46, 40, 39, 42. Slowest tests: Blood culture 48 h Incubation; HbA1c 5.2 h Batched twice daily; LFT 3.8 h Analyser calibration; ABG 28 min Sample transport.

# PART D — RadiologyTech.dc.html (Fathima Beevi, Radiology)

Context: ROLE='radiology'. Banner "Patients, orders and images are simulated. You only see studies that a doctor ordered." Top: "On shift · 08:00–16:00", "Demo General Hospital · Radiology". Sidebar user: Fathima Beevi, "Radiology tech · Demo GH" (also "Radiographer · 08:00–16:00"). Greeting "Good afternoon, Fathima" / "Saturday 17 Oct · 14 studies ordered today · 3 marked urgent". Handover "To Vinod Kurian · 16:00". Team: Fathima Beevi (you) Radiographer 08:00–16:00; Vinod Kurian CT technologist 08:00–20:00. Uses citizen-style IDs `DEMO-PT-xxxx` for patients and `DEMO-IMG-xxxx` for orders. CF_SEED identical to A15; additionally local `RAD_SEED`:
```json
[{"id":"r1","type":"imaging-order","from":"doctor","to":["radiology"],"title":"Imaging order · Chest X-ray PA","text":"Joseph K. · urgent · Dr. Arun Nair","href":"Doctor.dc.html","at":"14:36"}]
```
(Becomes a worklist row `BUS-r1`: part "Chest X-ray PA", patient "Joseph K.", order DEMO-IMG-500, by "Dr. Arun Nair", prio Urgent, status Waiting, time 14:36, room X-ray DR 1, note "Ordered from the Doctor app".) NOTE: Doctor app pushes type `radiology-order` (not `imaging-order`), so Doctor-placed radiology orders appear only in the radiology feed, not the worklist — integration gap; the seed should unify as one imaging-order entity.

## D1. KPIs
Waiting 6 (oldest 38 min); In progress 2 (CT room 1 · USG 2); Uploaded today 6 (all linked); Avg turnaround 42 min (trend up "8 min faster than last week"). Workload by modality [done,pending]: X-ray 4/2, CT 2/2, USG 3/1, MRI 0/4 => "9 completed · 9 pending" (+ nDone). Median wait 18 min; STAT in queue 1 · portable CXR; Rooms up DR 1, CT, USG; Dose alerts today 0. Schedule badge "14 booked · 5 free". Nav badges: worklist 6, equipment 2.
Rooms right now: CT room 1 "CT abdomen · DEMO-PT-4471 · 12 min in" (ok); USG 2 "Obstetric scan · DEMO-PT-2093" (ok); X-ray DR 1 "Detector calibration due today" (warn); MRI 1.5T "Down for service · back Mon 19 Oct" (bad).
Notes (handover): 13:10 "USG 2 gel warmer replaced. Obstetric list running 15 min late."; 11:45 "MRI orders for Mon–Tue confirmed with patients by SMS."

## D2. Studies (worklist) — STUDIES array (index order shown; bus studies are prepended)
| Order id | Mod | Study | Patient | By | Priority | Status | Time | Room | Clinical note | Contrast |
|---|---|---|---|---|---|---|---|---|---|---|
| DEMO-IMG-0417 | X-ray | Chest PA + lateral | Anjali M. · DEMO-PT-1234 | Dr. Arun Nair | Routine | Waiting for review | 15 Oct 10:12 | X-ray DR 1 | Cough 3 wks, post infection | None |
| DEMO-IMG-0431 | CT | CT abdomen with contrast | Thomas K. · DEMO-PT-4471 | Dr. Sreeja Paul | Urgent | Scanning | 14:05 | CT room 1 | RLQ pain, ? appendicitis | IV · creatinine 0.9 |
| DEMO-IMG-0433 | USG | Obstetric scan, 20 wks | Divya R. · DEMO-PT-2093 | Dr. Leela George | Routine | Scanning | 13:50 | USG 2 | Anomaly scan | None |
| DEMO-IMG-0436 | X-ray | Wrist AP/LAT, right | Akhil S. · DEMO-PT-7302 | Dr. Arun Nair | Urgent | Waiting | 14:18 | X-ray DR 1 | Fall from bike, swelling | None |
| DEMO-IMG-0438 | CT | CT head, plain | Mariamma J. · DEMO-PT-6610 | Casualty | Stat | Waiting | 14:22 | CT room 1 | Sudden weakness, 72y | None |
| DEMO-IMG-0440 | MRI | MRI brain | Suresh P. · DEMO-PT-4120 | Dr. Sreeja Paul | Routine | Rescheduled | Mon 14:00 | MRI 1.5T | Chronic headache | Gadolinium |
| DEMO-IMG-0442 | USG | Thyroid ultrasound | Bindu V. · DEMO-PT-1187 | Dr. Arun Nair | Routine | Uploaded | 10:40 | USG 2 | Neck swelling | None |
Priority tones: Routine neutral, Urgent warning, Stat danger. Status tones: Waiting warning, Scanning info, Waiting for review ai, Rescheduled neutral, Uploaded success. Default selected study index 0 (the Anjali Menon chest X-ray DEMO-IMG-0417); default upload order DEMO-IMG-0417.

NOTE cross-link: Anjali Menon's patient ID is `DEMO-PT-1234` here (Doctor app shows ABHA `DEMO-0000-1234`). Thomas K. is `DEMO-PT-4471`; the nurse registration is `KL-NC-DEMO-4471` (coincidence only). Radiology viewer tag: "DEMO-PT-1234 · F · 38y · CHEST PA · 15 Oct 2026"; exposure kVp 110, mAs 2.5, DAP 0.08 Gy·cm², operator Fathima B. Thumbs: PA, LAT, Prior 09/26, Prior 03/25. "Before you send" 3 of 4: ID matched; both views acquired; prior 09/26 linked; (open) send to reporting doctor (Dr. Arun Nair). Allergy alert: "Penicillin. No known contrast allergy."
AI pre-read: module "Image analysis · pre-read", status uncertain, confidence 0.58, "Possible small opacity, left lower zone", evidence ["Left lower zone, about 22 mm","Not seen on 09/26 prior"] (NOTE: Doctor app's AI for the same X-ray says confidence 0.71 "Possible mild right lower zone opacity" — left vs right and 0.71 vs 0.58 inconsistency; also Doctor says compared with Mar 2025 film, radiology says prior 09/26).
Completion pushes bus: type `imaging-result`, from radiology, to [doctor, citizen], title "Images ready · <part>", text "<patient> · <order> · uploaded by Fathima Beevi", href Doctor.dc.html.

## D3. Equipment
| Machine | Room | LED/Status | Last QC | Next service | Studies today |
|---|---|---|---|---|---|
| Digital X-ray DR 1 | Ground floor, R12 | warn · Calibration due | 10 Oct | 17 Oct | 6 |
| Portable X-ray | Wards | ok · Working | 14 Oct | 02 Nov | 2 |
| CT 64-slice | CT room 1 | ok · Working | 16 Oct | 30 Oct | 4 |
| Ultrasound A | USG 1 | ok · Working | 12 Oct | 12 Nov | 3 |
| Ultrasound B | USG 2 | ok · Working | 12 Oct | 12 Nov | 3 |
| MRI 1.5T | MRI suite | bad · Down | 01 Oct | 19 Oct | 0 |
| Mammography | R14 | ok · Working | 09 Oct | 09 Nov | 0 |
Stat cards: Working 5 of 7; Needs attention 1 (DR 1 calibration); Down 1 (MRI · service Mon); Uptime 30 days 96.4%. Alerts: DR 1 calibration due today (before 16:00); MRI 1.5T down — helium level warning, engineer Mon 19 Oct 10:00, 4 MRI orders moved to Mon–Tue.

## D4. Schedule (Sat 17 Oct, rooms: X-ray DR 1 / CT room 1 / USG 2 / MRI 1.5T [Out of service all day])
| Time | X-ray DR 1 | CT room 1 | USG 2 |
|---|---|---|---|
| 09:00 | Chest PA · DEMO-PT-1234 | CT head · DEMO-PT-6610 | Abdomen · DEMO-PT-3302 |
| 10:00 | Knee AP/LAT · DEMO-PT-8820 | Free | Thyroid · DEMO-PT-1187 |
| 11:00 | Chest PA · DEMO-PT-5509 | CT KUB · DEMO-PT-2276 | Free |
| 12:00 | Lunch | Lunch | Lunch |
| 13:00 | Spine LS · DEMO-PT-9031 | CT chest · DEMO-PT-7754 | Obstetric · DEMO-PT-2093 |
| 14:00 | Free | CT abdomen · DEMO-PT-4471 | Pelvis · DEMO-PT-6402 |
| 15:00 | Hand PA · DEMO-PT-3348 | Free | Free |
Moved because of MRI downtime: MRI brain · DEMO-PT-4120 -> Mon 19 Oct 14:00; MRI knee · DEMO-PT-0954 -> Tue 20 Oct 09:30 (patients told by SMS).

## D5. Upload flow
File pool cycle: series_001.dcm (DCM, 48 MB), series_002.dcm (DCM, 51 MB), lateral.dcm (DCM, 22 MB), scout.png (PNG, 2.1 MB). Rules: .dcm/.zip/JPG/PNG up to 2 GB per study; wrong-patient uploads withdrawable within 24 h with a reason; every upload audited.

# PART E — Pharmacist.dc.html (Joseph Mathew, Demo Hospital Pharmacy)

Context: ROLE='pharmacist'. Banner "Prescriptions and patients are simulated. You only see what's on an e-signed prescription." Top: "Counter 2 open"; "Demo Hospital Pharmacy · DEMO-DL-KL-2041" (drug licence). Sidebar user: Joseph Mathew, "Pharmacist · Counter 2" (log 'By' = "Joseph M."). Dispensed-today counter = 31 + dispensed this session ("3 partial"). Waiting = count of non-done prescriptions (avg wait 9 min). Low stock 4 (Atorvastatin 10 mg lowest); Expiring <=30 days 6 (₹ 8,420 value). CF_SEED identical to A15 (pharmacist receives s2 prescription; sends s8 dispensed). Nav badges: queue 4, stock 5, expiry 6.

## E1. Prescription queue (RX array; line = [medicine, sig, prescribed qty, in-stock qty, flag?, substitute?])
| Rx id | Token | Patient | Meta | Doctor | Doctor reg (HPR) | Issued | Wait | Allergy/interaction state |
|---|---|---|---|---|---|---|---|---|
| DEMO-RX-88213 | A14 | Anjali Menon | F · 38y · B+ · allergy: penicillin | Dr. Arun Nair | HPR DEMO-KL-55102 | 17 Oct, 14:40 | 6 min | warn: "Allergy on record: penicillin — Nothing on this prescription is a penicillin. No interactions between these three." |
| DEMO-RX-88219 | A15 | Thomas Kurian | M · 61y · no allergies recorded | Dr. Sreeja Paul | HPR DEMO-KL-48810 | 17 Oct, 14:52 | 3 min | warn: "Interaction: clopidogrel + omeprazole — Moderate. The doctor marked it 'aware, continue'. Suggest taking them 12 hours apart." |
| DEMO-RX-88207 | A12 | Divya Ramesh | F · 27y · pregnant, 20 wks | Dr. Leela George | HPR DEMO-KL-31277 | 17 Oct, 13:58 | 14 min | ok |
| DEMO-RX-88222 | A16 | Akhil Suresh | M · 19y · no allergies recorded | Dr. Arun Nair | HPR DEMO-KL-55102 | 17 Oct, 14:58 | 1 min | ok |
| DEMO-RX-88224 | A17 | Rahul Sasi | M · 11y · guardian: Sasi K. | Dr. Leela George | HPR DEMO-KL-31277 | 17 Oct, 15:02 | just now | ok |
| DEMO-RX-88199 | A10 | Mariamma Joseph | F · 72y · CKD stage 3 | Casualty | HPR DEMO-KL-20031 | 17 Oct, 12:20 | Done 12:41 | ok; already dispensed (pre:true) |
(NOTE: here Dr. Arun Nair HPR is `DEMO-KL-55102`, but the Doctor app profile shows `DEMO-HPR-71-0042` — inconsistent.)

Lines:
- DEMO-RX-88213: Metformin 500 mg tab | 1-0-1 after food · 30 days | 60 | stock 420; Atorvastatin 10 mg tab | 0-0-1 · 30 days | 30 | stock 18 (short) | substitute "Atorvastatin 10 mg (Demo Labs, same salt)" tip "Same molecule and strength, 240 in stock. Generic substitution is allowed; the patient is told and it is logged against the prescription."; Vitamin D3 60k cap | Weekly · 8 weeks | 8 | stock 96.
- DEMO-RX-88219: Clopidogrel 75 mg tab | 0-1-0 · 30 days | 30 | 210 | flag "Interaction with omeprazole"; Omeprazole 20 mg cap | 1-0-0 before food · 14 days | 14 | 340 | flag "Interaction with clopidogrel" | substitute "Pantoprazole 40 mg" tip "Pantoprazole interacts less with clopidogrel. Needs the doctor to approve the change — tap Message doctor from the prescription."
- DEMO-RX-88207: Folic acid 5 mg tab 1-0-0 · 30 days 30 (stock 800); Iron + folic acid tab 0-1-0 · 30 days 30 (640); Calcium 500 mg tab 0-0-1 · 30 days 30 (512).
- DEMO-RX-88222: Paracetamol 650 mg tab | SOS, max 3/day · 5 days | 15 | 1200; Amoxicillin 250 mg syrup | 5 ml thrice daily · 5 days | 1 | 0 (out) | substitute "Amoxicillin 125 mg/5 ml syrup × 2" tip "Same total dose using two bottles of the lower strength (5 in stock). Label the new volume clearly: 10 ml thrice daily."
- DEMO-RX-88224: Methylphenidate 10 mg tab | 1-0-0 · 30 days | 30 | 60 | flag "Schedule X · enter in narcotics register, ID of guardian".
- DEMO-RX-88199: Amlodipine 5 mg tab | 1-0-0 · 30 days | 30 | 380.
Bus-driven rows (from doctor app `prescription` events): id `DEMO-RX-9(101+n)`, token B1.., patient = title after "·" (e.g. Anjali Menon), meta "Sent from the Doctor app at <at>", doctor parsed from text, reg HPR DEMO-KL-55102, issued "18 Oct, <at>", lines parsed from "Metformin 500 mg ×60, Atorvastatin 10 mg ×30" => [name + ' tab', 'As prescribed', qty, stock 200]. NOTE: CF_SEED s2 therefore creates a queue row `DEMO-RX-9101` for Anjali Menon with Metformin 500 mg ×60 and Atorvastatin 10 mg ×30 (stock 200 each) at the TOP of the queue.
Verification checks: e-signature; QR code; prescriber HPR ID; validity "Issued <date> · valid 30 days"; allergy & interactions. Dispense default give = min(prescribed, stock); partial if less ("Balance stays open on the prescription").

## E2. Medicine history (read-only)
- Anjali Menon: 17 Sep Metformin 500 mg × 60 (Dr. Arun Nair, Full); 17 Sep Atorvastatin 10 mg × 30 (Dr. Arun Nair, Full); 18 Aug Metformin 500 mg × 60 (Dr. Arun Nair, Full); 02 Aug Azithromycin 500 mg × 3 (Dr. Sreeja Paul, Full). KV: Allergy Penicillin; Adherence On time · 5 of 6; Last dispensed 02 Oct · this pharmacy; Next refill due 24 Oct · Metformin.
- Thomas Kurian: 30 Sep Clopidogrel 75 mg × 30 (Dr. Sreeja Paul, Full); 30 Sep Aspirin 75 mg × 30 (Full); 01 Sep Atorvastatin 40 mg × 10 of 30 (Partial).
- Divya Ramesh: 18 Sep Folic acid 5 mg × 30 (Dr. Leela George, Full); 18 Sep Iron + folic acid × 30 (Full).
- Others: "—, No earlier dispensing on record, CareFusion AI, New".

## E3. Stock levels (10 rows shown; Items tracked 412, Low 4 (Below reorder), Out 1 (Amoxicillin 250 mg syrup), Indent pending 2 (from district store))
| Medicine | Form | Level | On hand | Reorder at | Used/day | Next supply |
|---|---|---|---|---|---|---|
| Metformin 500 mg | Tablet | ok | 420 | 200 | 64 | — |
| Atorvastatin 10 mg | Tablet | low | 18 | 150 | 40 | Indent · 19 Oct |
| Amlodipine 5 mg | Tablet | ok | 380 | 150 | 52 | — |
| Clopidogrel 75 mg | Tablet | ok | 210 | 100 | 18 | — |
| Insulin glargine | Pen | low | 6 | 20 | 3 | Indent · 19 Oct |
| Amoxicillin 250 mg | Syrup | out | 0 | 25 | 6 | District store · 18 Oct |
| Salbutamol 100 mcg | Inhaler | low | 9 | 25 | 4 | Ordered |
| Paracetamol 650 mg | Tablet | ok | 1200 | 400 | 150 | — |
| ORS sachet | Powder | low | 60 | 200 | 45 | Ordered |
| Folic acid 5 mg | Tablet | ok | 800 | 200 | 30 | — |
(Conflicts with Doctor-app "Pharmacy stock" view: Atorvastatin 10 mg 38 vs 18 here; Metformin 1,240 vs 420; Insulin glargine 64 at KMSCL vs 6 here; Azithromycin 500 Out vs not tracked here; Paracetamol here 1200 = doctor's Akhil stock. Seed should use ONE stock table and expose qty to pharmacy roles / status only to citizens.)

## E4. Expiry watch
Next 30 days (6 batches): 
| Medicine | Batch | Qty | Expires | Days | Action |
|---|---|---|---|---|---|
| Amoxicillin 500 mg cap | AX2209 | 40 caps | 15 Oct | 0 (expired) | Quarantine |
| Ceftriaxone 1 g inj | CF1180 | 12 vials | 24 Oct | 7 | Return to store |
| Ranitidine 150 mg | RN0712 | 120 tabs | 29 Oct | 12 | Return to store |
| Insulin regular | IR0450 | 4 vials | 02 Nov | 16 | Return to store |
| Diclofenac gel | DG3301 | 18 tubes | 09 Nov | 23 | Return to store |
| ORS sachet | OR9921 | 80 sachets | 14 Nov | 28 | Return to store |
31–90 days (5 batches):
| Cetirizine 10 mg | CT4410 | 300 tabs | 28 Nov | 42 | Use first |
| Azithromycin 500 mg | AZ1902 | 36 tabs | 06 Dec | 50 | Use first |
| Vitamin B complex | VB5520 | 500 tabs | 20 Dec | 64 | Use first |
| Salbutamol syrup | SS0118 | 14 bottles | 04 Jan | 79 | Use first |
| Losartan 50 mg | LS8812 | 240 tabs | 12 Jan | 87 | Use first |
Rule: FEFO (first expiry first out) with override reason.

## E5. Dispensing log (today, by Joseph M.)
| Time | Prescription | Patient | Given | Type | Batch |
|---|---|---|---|---|---|
| 14:31 | DEMO-RX-88190 | Rajan P. | Losartan 50 mg × 30 | Full | B2241 |
| 13:52 | DEMO-RX-88188 | Shibu T. | Insulin glargine × 1 pen | Full | IG0913 |
| 13:20 | DEMO-RX-88183 | Leela K. | Atorvastatin 10 mg × 10 of 30 | Partial | AT1180 |
| 12:41 | DEMO-RX-88199 | Mariamma J. | Amlodipine 5 mg × 30 | Full | AM5521 |
| 12:05 | DEMO-RX-88177 | Nisha B. | Salbutamol inhaler × 1 | Full | SB0331 |
| 11:40 | DEMO-RX-88170 | Joy M. | Metformin 500 mg × 60 | Full | MF2210 |
| 11:02 | DEMO-RX-88162 | Ammini V. | Amoxicillin syrup × 0 of 1 | Partial | — |
| 10:18 | DEMO-RX-88151 | Faisal K. | Pantoprazole 40 mg × 14 | Full | PT7720 |
Dispense pushes bus: dispensed from pharmacist to [citizen, pharmacyadmin], title "Ready to collect · Demo Hospital Pharmacy", text "<patient> · <medicine first words> · Joseph Mathew", href CitizenMedicines.

# PART F — Public / auth / registration screens

No tabular domain data; these screens contain demo identity values, role lists and form defaults. Everything below is literal.

## F1. Main.dc.html (landing)
- Title: "Your health, connected." Badge: "One national health record, with AI that assists — never decides". Banner: "This alpha uses simulated people, records and AI results. DEMO-0000 IDs are not real Aadhaar or ABHA numbers."
- Nav: Your record, your key (#privacy); AI that shows its work (#ai); For doctors (#roles); Help (#help). CTAs: Log in -> Login; Create account -> RegisterCitizen.
- Hero bullets: Free for every citizen; Every access logged; Works with a basic phone too.
- Hero preview cards: rotating key "482 913" ("New key in 10 s · opens 30 min"); AI Health Chat quote: user "I've had a mild fever since my booster." AI "A low fever for a day or two is common after a vaccine. Rest and drink fluids. If it lasts beyond 48 hours, see a doctor."; Home vitals self-reported 118/76; appointment card Dr. Arun Nair "General medicine · Tue 21 Oct, 10:30" badge "Confirmed by hospital".
- Facts (dl): Hospitals connected 42 · demo; Doctor session length 30 min · you can end it; Pilot Kerala · Pathanamthitta, Kottayam; Languages at launch English · Malayalam, Hindi next.
- Privacy 4 steps: 1 Show your rotating key (QR + 6-digit, 10 s, once); 2 One doctor, thirty minutes (read and add notes, never edit/delete; end early); 3 Emergencies need your contact (emergency contact approves; break-glass reviewed twice); 4 See who looked, and when (log not editable).
- AI section: four tools Symptom engine, Image analysis, Genomic analysis, Temporal analysis; statuses VERIFIED / SUPPORTED WITH CAUTION / UNCERTAIN; sample AIInsight module "Image analysis", status caution, title "Possible right lower-lobe opacity", confidence 0.67, evidence ["NIH chest X-ray reference set","ICMR guideline: community-acquired pneumonia"], reviewed by Dr. Arun Nair, "One supporting source. The doctor agreed: 'Consistent with examination; chest X-ray repeat in 2 weeks.'"
- For doctors 4 cards: Scan the patient's key; Four AI tools; e-Signed prescriptions; Voice notes.
- CTA: "Register with Aadhaar e-KYC and a quick face check. It takes about five minutes, and your ABHA health ID is linked for you."
- Footer: Account (Log in, Recover access), Register (Citizen, Doctor), Support (Lost phone or password, Privacy notice, Accessibility). "© 2026 CareFusion AI · Alpha"; "Government integrations shown are mock connectors."

## F2. DemoSignIn.dc.html — twelve roles (home page, label, subtitle)
| Group | Code | Role | Page | Subtitle |
|---|---|---|---|---|
| Citizens | CIT | Citizen | Citizen.dc.html | Anjali Menon · Pathanamthitta |
| Medical staff | DOC | Doctor | Doctor.dc.html | Dr. Arun Nair · General medicine |
| Medical staff | NUR | Nurse | Nurse.dc.html | Lekha Pillai · Ward 3 |
| Medical staff | LAB | Lab technician | LabTech.dc.html | Rahul Varghese · Pathology |
| Medical staff | RAD | Radiology technician | RadiologyTech.dc.html | Fathima Beevi · Imaging |
| Pharmacy | PHA | Pharmacist | Pharmacist.dc.html | Joseph Mathew · Hospital pharmacy |
| Pharmacy | PAD | Pharmacy admin | PharmacyAdmin.dc.html | Suma Thomas · Licence DEMO-DL-2041 |
| Administrators | HAD | Hospital admin | HospitalAdmin.dc.html | Dr. Meera Krishnan · Demo General Hospital |
| Administrators | DAD | District admin | DistrictAdmin.dc.html | Ajay Kumar · Pathanamthitta |
| Administrators | SAD | State admin | StateAdmin.dc.html | Latha Nair · Kerala |
| Administrators | ZAD | Zonal admin | ZonalAdmin.dc.html | R. Venkatesh · South zone |
| Administrators | CAD | Central admin | CentralAdmin.dc.html | S. Banerjee · National |
Banner: "Demo sign-in skips passwords and is never part of a production build." Footer note: every demo sign-in is written to audit log as `auth.demo_login`. Links to real pages: Login (Citizens and doctors), StaffLogin (Nurses, lab, radiology, pharmacists), AdminLogin (Hospital, pharmacy & government admins).

## F3. Login.dc.html
Two account kinds: User ("My health record") and Doctor ("Consultations"). User field "Mobile number or email" prefix +91 placeholder "98765 43210"; Doctor field "Doctor username" placeholder "dr.arun.nair". Password; "Forgot password or lost phone?" -> Recovery. "Use fingerprint or face ID" (user only). OTP step: user "A 6-digit code went to +91 ••••• 43210" prefilled digits 4,8,2; doctor "Enter the 6-digit code from your authenticator app. Doctor accounts always need this step." Resend in 0:24. Rotating key demo value 482913 -> "482 913" (random 6-digit every 10 s). Rotating headline words: connected., protected., understood., in your hands. Chips: Your key; Doctor session 30:00 "you can end it"; AI chat "guidance only"; Access log "every view recorded". Demo skip: Continue as citizen / doctor. Banner "Sign-in forms are visual only in the alpha".

## F4. StaffLogin.dc.html
Select "I am a": nurse -> Nurse.dc.html, lab -> Lab technician -> LabTech, radiology -> Radiology technician -> RadiologyTech, pharmacist -> Pharmacist. "Staff ID or email" placeholder `DEMO-ST-0412`. Help text: pharmacist "Your pharmacy admin creates pharmacist accounts."; others "Contact your hospital admin for access." Alert "No self-registration" + link to StaffActivation. 2FA: authenticator 6-digit (prefilled 7,1), "Idle screens lock after 15 minutes." Left panel: "Your orders are waiting."; bullets "Orders queue — BP every 4 h, CBC, chest X-ray — done and tagged to you." and "Works offline — Record vitals without a network; they sync when you're back."

## F5. AdminLogin.dc.html
Roles select: hospital, pharmacy, district, state, zonal, central.
| Role | Home | Scope text | Register page |
|---|---|---|---|
| hospital | HospitalAdmin | Demo General Hospital, Pathanamthitta | RegisterHospitalAdmin |
| pharmacy | PharmacyAdmin | Demo Hospital Pharmacy | RegisterPharmacyAdmin |
| district | DistrictAdmin | Pathanamthitta district | — |
| state | StateAdmin | Kerala | — |
| zonal | ZonalAdmin | South zone | — |
| central | CentralAdmin | National | — |
Gov roles: "Sign in with Jan Parichay" (badge Coming soon; mock) + hardware security key; state/zonal/central sign in from an approved network; no self-registration. Org roles: email/admin ID placeholder "admin@demo-hospital.example" + password + second factor. Hierarchy panel: CAD Central whole country 5 zones; ZAD Zonal North South East West Central; SAD State 28 states and 8 UTs; DAD District approves hospitals, pharmacies, doctors; HAD·PAD Hospital & pharmacy.

## F6. RegisterCitizen.dc.html (7 steps: Consent, Your details, Aadhaar e-KYC, Face check, ABHA, Health profile, Done)
- Consents: C1 privacy notice/DPDP (required, default true); C2 location area for access log (required, default true); C3 anonymised data for AI (optional, default false).
- Details defaults: Full name Anjali Menon; DoB 14/02/1991; Sex Female (Female/Male/Other); Mobile +91 98765 43210; Email anjali.m@example.demo; District Pathanamthitta (options Pathanamthitta, Thiruvananthapuram, Kollam, Kottayam, Ernakulam); Address "House 14, Temple Road, Adoor"; Password demo "harbour-lamp-41" (12+ chars, strength 3/4). Minor switch -> guardian: birth certificate upload, guardian registered mobile +91 94470 11223, consent checkbox.
- Aadhaar step: demo number "DEMO 0000 1234"; OTP "482913"; success: "Anjali Menon · born 14/02/1991 · Female. Stored as token `tok_DEMO_8f3a…c21` — Aadhaar shown as XXXX XXXX 1234." Optional PAN placeholder DEMOP0000X.
- Face check: 3 mini steps (face camera, blink twice, hold still); statuses "Ready when you are." / "Checking liveness…" / "Face matched to your Aadhaar photo."
- ABHA: none found -> create; result card ABHA `DEMO-0000-1234`, handle `anjali.menon@abha-demo`, Anjali Menon, "Pathanamthitta, Kerala".
- Health profile: blood group options A+ A− B+ B− AB+ AB− O+ O− Unknown (default B+); Allergies Penicillin; Preferred language English only (Malayalam/Hindi after pilot); emergency contact mobile +91 94470 55120, relation (Husband, Wife, Parent, Child, Sibling, Friend; default Husband); found "Ravi Menon — Registered · will get an invite to set an emergency code".
- Outcome: approved auto ("You're all set, Anjali") or flagged -> "Under review": Submitted 17 Oct, 15:12; District admin Pathanamthitta first review; State admin Kerala second review. Rail copy: "No smartphone? An ASHA worker or hospital help desk can register you and print a health card."

## F7. RegisterDoctor.dc.html (6 steps)
Linked citizen: Arun Nair, ABHA `DEMO-0000-5678`. HPR ID `DEMO-HPR-71-4402`; council options "Travancore-Cochin Medical Council (demo)" (default), "National Medical Commission (demo)"; council reg no `DEMO-TCMC-58213`; HPR match "Dr. Arun Nair · MBBS, MD". Specialisation options General medicine, Cardiology, Paediatrics, Obstetrics and gynaecology, Radiology. Documents: mbbs_certificate.pdf 1.2 MB Checked; md_certificate.jpg 3.4 MB "Blurry — re-upload". Hospital options: Demo General Hospital, Pathanamthitta; Demo Taluk Hospital, Adoor; Demo Private Hospital, Thiruvalla. Departments General medicine, Casualty, Cardiology, Paediatrics. Employment Government/Private (proof: Government employee ID or posting order / Hospital employee ID). Username `dr.arun.nair`; password demo "cardamom-ridge-27"; authenticator code "304 118"; e-Sign/DSC link (mock). Status timeline: Submitted 17 Oct 2026 15:20 · 3 documents; HPR checked automatically; District admin Pathanamthitta In review due 24 Oct 2026; State admin Kerala confirmation; Active. Rejected demo: "The MD certificate is unreadable..." returned 18 Oct. Copy has literal placeholder "[N] working days".

## F8. RegisterHospitalAdmin.dc.html (4 steps)
HFR ID `DEMO-HFR-KL-0193` -> "Demo General Hospital, Pathanamthitta" HFR verified: Type Government; District Pathanamthitta; Beds 240; Linked pharmacy Demo Hospital Pharmacy. Documents: Photo ID `meera_krishnan_id.pdf` 640 KB Checked; Authorisation letter `authorisation_letter.pdf` 210 KB Checked; Hospital licence `hospital_licence_2026.pdf` 1.8 MB Checking; Employee ID not uploaded (-> `employee_id_card.jpg` 420 KB). Account: Dr. Meera Krishnan, Medical Superintendent, ms@demo-hospital.example, +91 94950 22011, password demo "monsoon-lantern-88". Submitted: reviewed by Ajay Kumar, district admin Pathanamthitta; next: set password+2FA, departments/timings/map pin for doctors' geofence, create nurse/lab/radiology accounts.

## F9. RegisterPharmacyAdmin.dc.html (4 steps)
Types: Government hospital pharmacy (linked hospital options Demo General Hospital, Pathanamthitta / Demo Taluk Hospital, Adoor) or Private pharmacy. Licence `DEMO-DL-KL-2041` -> valid until 31 Mar 2029, "Demo Hospital Pharmacy · Retail and wholesale (Forms 20, 21) · Pathanamthitta". Docs: drug_licence.pdf 880 KB Checked; photo ID not uploaded. Hours Opens 08:00, Closes 20:00, weekly holiday (None — open daily, Sunday, Monday); already uses billing/stock software (default on; sync, no spreadsheets). Account: Suma Thomas, suma.t@demo-pharmacy.example, +91 96330 44871, password demo "pepper-garden-19". After approval: stock from national medicine catalogue, alerts, controlled-drug register (Schedule H, H1, X), pharmacist accounts.

## F10. StaffActivation.dc.html
"Welcome to the team, Lekha." Dr. Meera Krishnan created a Nurse account at Demo General Hospital, Pathanamthitta. Staff ID `DEMO-ST-0412` · Ward 3, General medicine. Link expires 19 Oct 2026, 18:00. Steps Password (demo "ward-three-lotus-6"), Two-step (authenticator key text `DEMO 7K2Q MX4P 91LB`, code "550 213"), Done -> Nurse.

## F11. Recovery.dc.html
Tabs "Forgot password" / "Lost or changed phone". Password reset: registered mobile +91 98765 43210, code "731 004" (sent to +91 ••••• 43210), new password demo "backwater-kite-52"; after 5 wrong attempts lock 15 minutes. Phone loss: online (Aadhaar OTP + live face check; old device "Redmi 9 (demo)" signed out at 15:41) or in person; help desks: "Demo General Hospital, Pathanamthitta — Help desk" (default), "Demo Taluk Hospital, Adoor — Help desk", "ASHA worker, Ward 7 Adoor"; open 08:00–20:00.

# G. Suggested seed entities (derived; not literal design data)

Tables implied: user/identity (citizen, staff, admin), doctor_profile (HPR, council reg, rating, languages), facility (hospital, pharmacy, lab, radiology rooms/equipment), ward + bed (24 beds), admission (patient, bed, IP no., admitted date, treating doctor), vitals_set (time, BP, HR, RR, SpO2, temp, NEWS), nursing_note, task, mar_dose, clinical_order (unified lab/imaging/medication/nursing order, with priority STAT/Urgent/Routine and status), lab_result_parameter (value, unit, ref range, flag), imaging_study (modality, room, status, priority), equipment, qc_run, prescription + prescription_line (substitute, flag, qty, stock), stock_item (qty, reorder, used/day, supply), expiry_batch, dispense_log, appointment/slot (OP block 2, 17 Oct), message_thread/message, review, referral, handover, break_glass_event, donor, blood_stock, event_bus (type, from, to[], title, text, href, at), access_log.

Seed recommendations (to remove the conflicts in 0.6): treat Anjali Menon as 34? Decide; keep ONE order-id scheme (suggest the Doctor-app `LAB-/RAD-` on a unified order table and map the Lab `LO-` and Nurse `O-` as display aliases); make Thomas Kurian (68, COPD, Bed 7) distinct from Thomas Varghese (61, K+ 6.1) and fix Lab ABG bed to Bed 7 and Pharmacist Rx patient to a third name or Varghese; emit `imaging-order` consistently; derive citizen-visible stock as In stock/Low/Out from pharmacy qty. Mark all AI output "simulated" (already present on all AI cards) and keep citizens seeing AI results only after doctor review (Doctor image decision Accept/Edit/Reject drives "sent to patient").


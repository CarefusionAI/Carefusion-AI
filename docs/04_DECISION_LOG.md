# 04 — Decision & Conversation Log

Running record of everything we discuss, decide and do. **Append only** — newest at the bottom. Mark changed decisions as SUPERSEDED; don't delete.

Template:
```
### YYYY-MM-DD — Topic
- Discussed:
- Decision:
- Reason:
- Owner:
- Next step:
- Status: OPEN / DONE / SUPERSEDED
```

---

### 2026-10-09 — Project kickoff: government edition
- Discussed: Extending CareFusion AI (IEEE ICSCST 2026, paper 1609) into software for the Indian government to unify medical affairs, with all login steps and integration with national systems.
- Decision: Created project knowledge base — 00 Instructions, 01 System Overview, 02 Login & Auth Flow, 03 Integration Plan, 04 Decision Log, 05 Paper Notes.
- Decision: Identity built on ABDM (ABHA for patients, HPR for doctors, HFR for facilities) + government SSO for officials; MFA for all staff.
- Decision: FHIR R4 (NRCeS profiles) as data standard; system acts as both ABDM HIP and HIU.
- Decision: AI remains decision-support only; UNCERTAIN/disagreement reporting kept.
- Reason: Government interoperability and DPDP/ABDM compliance require national identity and consent flows.
- Owner: Team (Abhishek, Athun, Melbin, Reno)
- Next step: Pick first client department/state; register on ABDM sandbox; decide hosting; check CDSCO classification.
- Status: OPEN

### 2026-10-09 — Reviewed the IEEE paper
- Discussed: Full read of the paper; found 8 inconsistencies between figures/text/deck and India-specific gaps (see 05_PAPER_NOTES.md).
- Decision: Fix inconsistencies before using numbers in government proposals.
- Next step: Re-check Fig. 2/Fig. 3 values and the retrieval threshold in code; plan Indian-data validation.
- Status: OPEN

### 2026-10-09 — Scope and admin hierarchy (explained by user)
- Discussed: User explained the project scope and user types.
- Decision: Scope is **national** — every state, every district, every hospital (government and private).
- Decision: Admin hierarchy: Central admin → Zonal admins → State admin → District admin → Hospital admins.
- Decision: Zones include North, South, East, West and **Central**.
- Decision: Private hospitals report to the **district admin** (same as government hospitals).
- Decision: Pharmacies (government and private) are included and report to the **district admin**.
- Decision: "Users" = people who use the application — patients and others.
- Reason: Stated by user.
- Owner: Team
- Next step: Confirm open doubts below, then update 01_SYSTEM_OVERVIEW.md and 02_LOGIN_AND_AUTH_FLOW.md.
- Open doubts:
  - Is there a Northeast zone, or only the 5 zones listed?
  - Who decides which state belongs to which zone?
  - Who are the "others" among users (doctors, nurses, lab staff, pharmacists, etc.)?
  - Under a pharmacy: pharmacy admin only, or pharmacists as well?
- Note: Earlier docs (01, 02) assumed a single-state pilot and a different role list; these will be revised after doubts are cleared.
- Status: DONE (doubts resolved below; 01 and 02 revised)

### 2026-10-09 — Zones, users and pharmacy types (clarified by user)
- Discussed: Answers to the open doubts in the previous entry.
- Decision: **No Northeast zone.** Exactly 5 zones: North, South, East, West, Central.
- Decision: **Users = all ordinary people of the country** (citizens/patients).
- Decision: Pharmacies are of exactly two types — **government hospital pharmacy** and **private pharmacy**. Both report to the **district admin**.
- Proposed (awaiting user confirmation): State/UT-to-zone grouping based on MHA Zonal Councils, with the North Eastern Council states merged into East:
  - North: Haryana, Himachal Pradesh, Punjab, Rajasthan; UTs Delhi, Chandigarh, Jammu & Kashmir, Ladakh
  - Central: Uttar Pradesh, Uttarakhand, Madhya Pradesh, Chhattisgarh
  - East: Bihar, Jharkhand, Odisha, West Bengal, Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Tripura, Sikkim
  - West: Gujarat, Maharashtra, Goa; UT Dadra & Nagar Haveli and Daman & Diu
  - South: Andhra Pradesh, Telangana, Karnataka, Kerala, Tamil Nadu; UT Puducherry
  - Unplaced: Andaman & Nicobar Islands, Lakshadweep (not members of any zonal council)
- Reason: Stated by user; grouping drafted by Claude at user's request.
- Owner: Team
- Next step: User to confirm zone grouping; clarify the doubts below; then revise 01 and 02.
- Open doubts:
  - Confirm zone grouping; where do Andaman & Nicobar and Lakshadweep go?
  - East has 12 states — acceptable, or rebalance?
  - Doctors, nurses and lab staff: do they log in? If yes, under whom (hospital admin)?
  - Pharmacy logins: one account per pharmacy, or pharmacy admin + pharmacists?
  - Government hospital pharmacy: reports only to district admin, or also linked to its hospital?
  - Who has authority to assign/change a state's zone (central admin?)
- Status: DONE (all doubts resolved in next entry)

### 2026-10-09 — Zone mapping and role suggestions (approved by user)
- Discussed: Claude's suggestions for the open doubts in the previous entry; user approved all of them.
- Decision: **Zone grouping confirmed** (all 28 states + 8 UTs):
  - North: Haryana, Himachal Pradesh, Punjab, Rajasthan; UTs Delhi, Chandigarh, Jammu & Kashmir, Ladakh
  - Central: Uttar Pradesh, Uttarakhand, Madhya Pradesh, Chhattisgarh
  - East: Bihar, Jharkhand, Odisha, West Bengal, Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Tripura, Sikkim; UT Andaman & Nicobar Islands
  - West: Gujarat, Maharashtra, Goa; UT Dadra & Nagar Haveli and Daman & Diu
  - South: Andhra Pradesh, Telangana, Karnataka, Kerala, Tamil Nadu; UTs Puducherry, Lakshadweep
- Decision: East keeps 12 states (population roughly comparable to Central); no rebalancing.
- Decision: **Only the central admin** can assign or change a state's zone.
- Decision: **Doctors, nurses, lab and radiology staff get logins**, created and managed by the **hospital admin**. Doctors verified via HPR. — *Doctor part SUPERSEDED by "Doctor registration and features" entry below (doctors now self-register; district admin approves). Nurses, lab and radiology staff unchanged.*
- Decision: **Pharmacy = pharmacy admin + individual pharmacist logins.** Pharmacy admin creates pharmacist accounts; every dispensing is recorded against the pharmacist.
- Decision: **Government hospital pharmacy** reports to the district admin and is **also linked to its hospital** to receive that hospital's prescriptions; hospital admin can view its stock but not manage it. — *"Receive that hospital's prescriptions" SUPERSEDED by "Pharmacy view, ratings, prescriptions, extras" entry below (prescriptions now go to the patient, who chooses the pharmacy). Stock-view link to the hospital unchanged. Direct sending to the doctor's own hospital pharmacy (with patient's agreement) re-added on 2026-10-10 — see "Doctor app flow".*
- Reason: Suggested by Claude, approved by user.
- Owner: Team
- Next step: Revise 01_SYSTEM_OVERVIEW.md and 02_LOGIN_AND_AUTH_FLOW.md to the national hierarchy and new role list.
- Status: DONE (01 and 02 revised)

### 2026-10-09 — Citizen (user) profile data and doctor access (explained by user)
- Discussed: What data is stored for each citizen, and how a doctor gets access to it.
- Decision: Citizen profile stores:
  - Emergency contacts — minimum 1, no maximum
  - Blood group
  - Medicines / symptoms / uploaded files (exact meaning of "medicate" still to confirm)
  - Organ donor status
  - Special category (e.g. cancer patient)
  - Address
  - Medical history: chat session summaries, doctor prescriptions/receipts, doctor diagnoses, medical images, AI-analysed images, genomic data
- Decision (suggested by Claude, approved by user): also store date of birth, sex, ABHA number, preferred language, **allergies**, chronic conditions, vitals history (needed by the temporal module), lab reports, vaccination record, past surgeries/hospital stays, family history, smoking/alcohol, and an access history visible to the patient.
- Decision: **Doctor access via a rotating secret key** (changes every 10 seconds). Only one doctor at a time; session lasts 30 minutes; doctor can read and add documents.
- Decision: **Unconscious patient:** basic emergency info (blood group, allergies, emergency contacts and other basic fields) is visible without the key. **Detailed records** need the emergency contact's ID plus a digital secret key.
- Decision: District and state admins have a role after 24 hours to update/verify (exact meaning to confirm).
- Reason: Stated by user.
- Owner: Team
- Next step: Clear the doubts below, then fold into 01 and 02.
- Open doubts:
  - "Medicate" = current medicines, or medical conditions?
  - "Enlight doc" = highlight a document, or something else?
  - Does the patient show the key as a code/QR on their phone for the doctor to enter/scan?
  - Doctor can add documents but never edit/delete existing ones?
  - Special category: fixed list or free text?
  - Emergency access: whose secret key — the emergency contact's own, or the patient's? What is the "emergency contact ID" (phone, ABHA)?
  - What do district/state admins update and verify after 24 hours — the emergency access event, or the patient's record?
  - If no emergency contact can be reached, what happens?
- Status: DONE (resolved in following entries; folded into 01 and 02)

### 2026-10-09 — Emergency access details (clarified by user)
- Discussed: Answers to the emergency-access doubts in the previous entry.
- Decision: **Every emergency contact must be a registered user of CareFusion** and has a **separate emergency secret key**, used only for emergency access to the patient's detailed records.
- Decision (stated by user): The emergency contact is identified by their **Aadhaar number**.
  - ⚠ Compliance flag (Claude): Project rule says no plaintext Aadhaar storage; Aadhaar Act/UIDAI rules restrict collecting and storing Aadhaar numbers (Aadhaar Data Vault / tokenisation) — must verify against latest official text. Claude suggested ABHA number as an alternative identifier. **Awaiting user decision.**
- Decision (suggested by Claude, approved by user): **No emergency contact reachable → break-glass access.** Doctor enters a mandatory reason, gets time-limited access, and the event is reviewed by the district admin.
- Reason: Stated by user / suggested by Claude and approved.
- Owner: Team
- Next step: Decide Aadhaar vs ABHA identifier; clear remaining doubts below.
- Open doubts:
  - Aadhaar number or ABHA number as the emergency contact ID?
  - What do district/state admins update and verify after 24 hours?
  - "Medicate" = current medicines, or medical conditions?
  - "Enlight doc" meaning?
  - Patient shows the key as QR/number on phone?
  - Doctor can add but never edit/delete documents?
  - Special category: fixed list or free text?
- Status: DONE (resolved in following entries — user chose Aadhaar)

### 2026-10-09 — Medical data, doctor actions and file organisation (clarified by user)
- Discussed: Answers to remaining doubts from the previous entry.
- Decision: "Medicate" covers **current medications, medical conditions and documents** — all three are stored.
- Decision: "Enlight doc" = **highlight documents**.
- Decision: During a key-based session the doctor can **add documents and highlight documents** only (no edit/delete of existing documents).
- Decision: Patient's key can be shown as a **QR code or a number code** (interpretation of user's answer — to confirm).
- Decision (new, stated by user): Records can be organised into **folders and files**.
- Reason: Stated by user.
- Owner: Team
- Next step: Clear doubts below.
- Open doubts:
  - Confirm: both QR and number code supported?
  - Who can create folders — patient only, doctor too, or both?
  - Special category: fixed list or free text? (user's answer incomplete)
  - Aadhaar or ABHA number as emergency contact ID? (still open)
  - What do district/state admins update and verify after 24 hours? (still open)
- Status: DONE (resolved in following entries)

### 2026-10-09 — Emergency contact ID and 24-hour verification (stated by user)
- Discussed: Answers to the Aadhaar/ABHA question and the 24-hour admin step.
- Decision (user's final choice): Emergency access to detailed records uses the **emergency contact's Aadhaar number + their emergency secret code**. — *Method partly SUPERSEDED on 2026-10-10 ("Remaining doubts round"): the contact now approves on their own phone; doctor-typed Aadhaar + code is fallback only.*
  - ⚠ Compliance note (Claude): Aadhaar must not be stored in plaintext; verify via UIDAI/ABDM and keep only a token/reference (Aadhaar Data Vault). Confirm against the latest Aadhaar Act / UIDAI regulations before building.
- Decision (stated by user, meaning to confirm): **Central admin verifies within 24 hours**; after the **district admin** step, the person's **full details can be stored/seen**.
- Note: User re-sent the earlier answers (medications/conditions/docs, highlight, QR/code, folders) — no change to the previous entry.
- Reason: Stated by user.
- Owner: Team
- Next step: Confirm the meaning of the 24-hour flow; confirm QR + code, folder creation and special category (Claude proposed defaults below).
- Proposed defaults (Claude, awaiting confirmation):
  - Key shown as both QR code and number code
  - Patient creates and manages folders; doctor's added documents go into a default "Doctor uploads" folder that the patient can reorganise
  - Special category = fixed list + "Other" free-text box
- Open doubts:
  - 24-hour flow: what event does the central admin verify (emergency access, or a new user's registration)? Does "stoen" mean stored or seen?
- Status: DONE (resolved in next entry)

### 2026-10-09 — Emergency review, folders, category, key format (selected by user via option panel)
- Discussed: Remaining doubts from the previous entry, answered through a multiple-choice panel.
- Decision: **24-hour step = emergency access review.** After a doctor uses emergency access, the **district admin reviews it**, then the **central admin verifies it within 24 hours**.
- Decision: After the district admin's review, the **full access record** (doctor, reason, time, what was viewed) is **stored permanently**.
- Decision: **Both patient and doctor can create folders.** Doctor can create folders during the 30-minute key session (previously the doctor could only add and highlight documents — folder creation is now added).
- Decision: **Special category = fixed list + "Other" free-text box** (e.g. cancer, HIV, pregnancy, disability).
- Decision: Patient's rotating key is shown as **both a QR code and a number code**; doctor can scan or type.
- Reason: Selected by user.
- Owner: Team
- Next step: Continue user's explanation of the project; then revise 01_SYSTEM_OVERVIEW.md and 02_LOGIN_AND_AUTH_FLOW.md with all decisions from today.
- Status: DONE (folded into 01 and 02)

### 2026-10-09 — Activity logs for every user (stated by user + option panel)
- Discussed: Per-user activity logs.
- Decision: **Every user of the software** (all roles — citizens, doctors, staff, pharmacists, all admins) has their own activity log.
- Decision: Log records **what was used/done**, **from where** (exact **GPS location**) and other security info (time, device, IP address etc.).
- Decision: **Central admin can always view any log.** **State admin can view logs only with central admin's permission.** No other role selected as a viewer.
- Decision: **No one can edit or delete anything in a log.** Logs are **kept forever**.
- Reason: Stated by user / selected via option panel.
- Owner: Team
- Next step: Resolve the conflicts below.
- ⚠ Conflicts / flags (Claude):
  - Earlier decision says the patient can see an **access history** of who opened their records. User did not select "user sees own log" → is that access history still kept, or removed?
  - **Exact GPS for all users** (including citizens): under DPDP, precise location is personal data needing clear notice, consent and purpose; phone users can deny location permission. Need a rule for when GPS is unavailable/denied. Verify against DPDP Act/Rules.
  - **Keep forever**: DPDP has storage-limitation rules; audit logs may be allowed for legal obligations — verify retention against latest DPDP Rules, CERT-In (min. 180 days) and health-record rules.
- Status: DONE (first two flags resolved in next entry; retention flag still to verify)

### 2026-10-09 — Log conflicts resolved (selected by user via option panel)
- Discussed: Flags from the previous entry.
- Decision: **Patient keeps the access history** — sees only who opened their records and when. The full security log (GPS, IP, device etc.) stays hidden from the patient; only central admin (always) and state admin (with central permission) see full logs.
- Decision: **If GPS is off or permission is refused, the user can still use the app**; the log records the IP-based area instead of exact GPS.
- Still to verify: "keep logs forever" against DPDP Rules, CERT-In directions and health-record retention rules.
- Reason: Selected by user (Claude's recommended options).
- Owner: Team
- Next step: Continue user's explanation (doctors, hospital admin, pharmacy, admin roles); then revise 01 and 02.
- Status: DONE (folded into 01 and 02)

### 2026-10-09 — Doctor registration and features (stated by user + option panels)
- Discussed: How doctors register, prove credentials, access patients, and what they can do.
- Decision: **Doctors self-register** and enter detailed credentials:
  - HPR ID + NMC/state medical council registration number
  - Degrees + specialisation (with certificate uploads)
  - Hospital + department
  - Employee proof: **government doctors** give government employee ID / posting order; **private doctors** give their hospital's employee ID
- Decision: **District admin alone approves** doctor accounts; the hospital admin is **not involved** in doctor registration. This SUPERSEDES the earlier decision that the hospital admin creates and manages doctor accounts (nurses, lab and radiology staff are still managed by the hospital admin). — *"District admin alone" SUPERSEDED on 2026-10-10 (see "User app flow" and "Claude's suggestions on gaps": now district → state, central checks flagged cases only).*
- Decision: Same verification standard for government and private doctors (only the employee-ID document differs).
- Decision: Doctor opens a patient's record by entering/scanning the patient's **rotating secret key** (QR or number; 30-minute session, as decided earlier).
- Decision: Doctor features: **AI diagnosis support** (paper's symptom, image, genomic and vitals modules — decision support only), **write prescriptions** (sent to the linked pharmacy — *SUPERSEDED: prescriptions now go to the patient; see "Pharmacy view, ratings, prescriptions, extras"*), **patient list + history**, **referrals** to another doctor/hospital.
- Decision: After a session ends, the doctor's patient list shows **only patient names + what this doctor added**; seeing the full record again needs a **new secret key**.
- Reason: Stated by user / selected via option panels (some options recommended by Claude).
- Owner: Team
- Next step: Continue with hospital admin, pharmacy and admin roles; then revise 01 and 02.
- Status: DONE (folded into 01 and 02)

### 2026-10-09 — Remaining roles drafted by Claude (user request)
- Discussed: User asked Claude to design all remaining roles because they are not familiar with them, and added two features: live pharmacy data visible to users/doctors, and ratings of doctors/hospitals.
- Decision: Claude wrote **06_ROLES_PROPOSAL.md** — central, zonal, state, district, hospital admin, nurse/lab/radiology staff, pharmacy admin, pharmacist, live pharmacy view, ratings, extras. It is a **draft**; only items the user approves become decisions.
- Owner: Claude (draft) / Team (approval)
- Status: DONE (approved — see "Roles proposal approved" below)

### 2026-10-09 — Pharmacy view, ratings, prescriptions, extras (selected by user via option panel)
- Decision: **Live pharmacy view** for citizens and doctors shows **stock (in / low / out), price, opening hours and distance**.
- Decision: **Ratings: doctors, hospitals and pharmacies** can be rated by **any user at any time** (no visit required). Claude's recommended "after a real visit only" option was not chosen.
  - ⚠ Flag (Claude): open rating invites fake or malicious ratings. Suggested safeguards (awaiting user decision): only logged-in ABHA-verified users, one rating per user per doctor/hospital/pharmacy, district admin moderation of comments. Also verify NMC rules on doctor ratings and DPDP rules on publishing reviews.
- Decision: **Prescription goes to the patient (user)**, not directly to a pharmacy. The patient checks availability at the hospital pharmacy and other pharmacies, and chooses where to buy. This SUPERSEDES "prescriptions sent to the linked pharmacy" (doctor entry) and the government hospital pharmacy "receives that hospital's prescriptions" (zone/role entry). — *Partly SUPERSEDED on 2026-10-10 ("Doctor app flow"): for the doctor's own hospital pharmacy, the doctor can also send it directly if the patient agrees; patient always keeps the signed copy.*
- Decision: Extra features included: **Appointments, Notifications, Complaints, Health alerts**.
- Reason: Selected by user.
- Owner: Team
- Next step: Clear doubts below; then fold 06 + all decisions into 01 and 02.
- Open doubts:
  - How does the chosen pharmacy receive the prescription — patient shows a QR/code at the counter, or sends it from the app?
  - Rating safeguards (see flag above) — accept?
  - Admin creation/approval chain in 06 (each level creates the one below; one level above approves) — accept?
  - Rest of 06 (role duties) — accept as drafted?
- Status: DONE (all doubts resolved in next entry)

### 2026-10-09 — Roles proposal approved (selected by user via option panel)
- Decision: **Prescription handover — both ways:** patient can **send it from the app** to a chosen pharmacy, or **show a prescription QR** at the counter for the pharmacist to scan.
- Decision: **Rating safeguards accepted:** only logged-in ABHA-verified users; one rating per user per doctor/hospital/pharmacy (can be updated); district admin checks comments before they go public. Ratings still allowed any time (no visit required).
- Decision: **Admin chain approved as drafted:** Central creates zonal; zonal creates state (central approves); state creates district (zonal approves); hospital and pharmacy admins self-register (district approves).
- Decision: **All role duties in 06 approved.** 06_ROLES_PROPOSAL.md updated and marked APPROVED.
- Still to verify: NMC rules on doctor ratings; DPDP rules on publishing reviews; Aadhaar storage rules; log retention ("forever").
- Reason: Selected by user.
- Owner: Team
- Next step: Revise 01_SYSTEM_OVERVIEW.md and 02_LOGIN_AND_AUTH_FLOW.md to include every decision from today.
- Status: DONE (see next entry)

### 2026-10-09 — 01 and 02 rewritten (user approved "go ahead")
- Discussed: Bringing the overview and login docs in line with all of today's decisions.
- Decision: **01_SYSTEM_OVERVIEW.md rewritten** — national scope, 5-zone table, full admin hierarchy, all roles, citizen profile, rotating-key and emergency access, prescriptions and live pharmacy view, ratings, activity logs, extra features, updated module list and architecture. Old single-state version SUPERSEDED.
- Decision: **02_LOGIN_AND_AUTH_FLOW.md rewritten** — creation/approval chain, registration and login steps for citizen, emergency contact, doctor, staff, hospital admin, pharmacy admin/pharmacist, and district/state/zonal/central admins; full permissions table; session rules for the 10-second key and 30-minute doctor session. Old version (hospital admin creates doctors; officials via SSO only) SUPERSEDED.
- Additions by Claude (not explicitly discussed — marked so user can reject): hardware MFA for district/state/zonal/central admins; two-person approval for central admin creating zonal admins and suspending admins; patient notified when a doctor session or emergency access happens; rate limits on key-entry and emergency endpoints; hospital admin registers with own identity + appointment proof.
- Owner: Claude (writing) / Team (review)
- Next step: Team reviews 01 and 02; answer their open questions (hosting, CDSCO, blockchain vs hash-chain log, SSO for admins, mobile vs web, hospital admin proof documents); verify compliance items; then update 03_INTEGRATION_PLAN.md (phases still assume a single pilot).
- Status: DONE (additions and most open questions settled in next entry)

### 2026-10-09 — Claude's additions, hosting, platform, SSO, blockchain (selected by user via option panel)
- Decision: **All Claude additions accepted:** hardware security keys for district/state/zonal/central admins; two-person approval for central admin creating zonal admins and suspending admins; patient notified on every doctor session and emergency access; hospital admin uploads own ID + appointment proof. (Rate limits on key-entry/emergency endpoints were not in the panel — kept as a standard security control.)
- Decision: **Hosting = MeitY-empanelled cloud** (data stays in India). State Data Centre option SUPERSEDED.
- Decision: **Launch on both mobile app and website.**
- Decision: **State, zonal and central admins also log in with government SSO (Jan Parichay)**, in addition to MFA/hardware key. (District admins not included in the selection — to confirm if they also use SSO.)
- Decision: **Blockchain/Ethereum dropped.** Tamper-proof, append-only, hash-chained activity log is used instead. Closes paper inconsistency #8 for the government edition.
- Reason: Selected by user (Claude's recommended options for hosting and blockchain).
- Owner: Team
- Next step: Update 03_INTEGRATION_PLAN.md for the national rollout; verify compliance items (Aadhaar storage, log retention, GPS logging, NMC rules on ratings, CDSCO classification); fix the paper's inconsistencies.
- Open doubts:
  - Do district admins also use Jan Parichay SSO?
  - Still open: CDSCO classification of the AI modules; hospital admin proof documents (exact list).
- Status: DONE (03 updated in next entry; doubts carried forward)

### 2026-10-09 — 03 Integration Plan rewritten for national rollout (user approved "yap")
- Discussed: Updating the integration plan, which still assumed a single pilot hospital.
- Decision: **03_INTEGRATION_PLAN.md rewritten** — ABDM integrations mapped to our roles (ABHA login, HPR auto-check for doctors, HFR for hospitals, consent + HIP/HIU for sharing with other ABDM apps); decided integrations added (Jan Parichay, UIDAI Aadhaar token check, SMS/push, MeitY cloud); compliance checklist extended (Aadhaar Act, GPS consent, log retention, ratings/NMC, Drugs and Cosmetics rules for e-prescriptions); new 9-phase roadmap. Old single-pilot version SUPERSEDED.
- Proposed by Claude (NOT yet approved — marked *(proposed)* in 03):
  - Roadmap order: foundation → identity & admin chain → records & access → ABDM → pharmacy & services → clinical AI → dashboards → pilot → national rollout
  - Start with a pilot in a few districts of one state before national rollout
  - Drug licence verification via state drug control / CDSCO records; Indian maps provider for pharmacy distance
- Owner: Claude (writing) / Team (approval)
- Next step: Team approves or changes the proposed roadmap and pilot; answer open doubts below; then begin compliance verification and paper fixes.
- Open doubts:
  - Approve the roadmap order and the pilot idea? Which state/districts for the pilot?
  - Drug licence verification source; maps provider
  - Do district admins also use Jan Parichay? (carried)
  - Hospital admin proof documents — exact list (carried)
  - CDSCO classification of the AI modules (carried)
- Status: DONE (proposals approved in next entry)

### 2026-10-09 — Roadmap, pilot, licence check, maps (selected by user via option panel)
- Decision: **Roadmap order approved:** foundation → identity & admin chain → records & access → ABDM HIP/HIU → pharmacy & services → clinical AI → dashboards & alerts → pilot → national rollout.
- Decision: **Pilot in Kerala** (a few districts) before national rollout. Reason given: team is in Kerala, Malayalam already planned, e-Health Kerala exists.
- Decision: **Drug licence verification** against **state drug control department / CDSCO records**; district admin checks manually where no API exists.
- Decision: **Maps: an Indian provider** (e.g. Mappls/MapmyIndia or ISRO Bhuvan) — exact provider to pick in the pharmacy phase.
- 03_INTEGRATION_PLAN.md updated: "proposed" markers removed for these items; Kerala pilot approvals and e-Health Kerala integration added.
- Reason: Selected by user (Claude's recommended options).
- Owner: Team
- Next step: Choose Kerala pilot districts/hospitals; pick maps provider; verify compliance items; fix paper inconsistencies; register on ABDM sandbox.
- Open doubts:
  - Kerala pilot: which districts and hospitals? (user asked what a pilot is; explained — still to choose; Claude suggested Pathanamthitta + Thiruvananthapuram)
  - Do district admins also use Jan Parichay? (carried)
  - Hospital admin proof documents — exact list (carried)
  - CDSCO classification of the AI modules (carried)
- Status: DONE (district SSO and hospital proof resolved in "Remaining doubts round"; pilot districts and CDSCO still open)

### 2026-10-10 — User app flow (described by user + option panels)
- Discussed: User described the citizen side of the app: login, registration, face check, profile, reviews/appointments, chat, files, blood donation, organ donation. Written up in **07_USER_APP_FLOW.md**.
- Decision: **Login page** with a **User / Doctor** switch; all other roles have their own separate login pages.
- Decision: **Citizen login:** phone/email + **OTP on first login**, then **password or fingerprint/face ID**. **ABHA created/linked in the background** at sign-up (user did not know ABHA; Claude explained it). SUPERSEDES "citizen logs in with ABHA + OTP" in 02.
- Decision: **Registration documents:** Aadhaar via **e-KYC** (no copy stored), **live face check**, **PAN optional**, **birth certificate + parent/guardian** for under-18s ("guarantor" = parent/guardian for minors).
- Decision: **New-user approval = automatic** when e-KYC and face check pass; **only flagged cases** go to district admin then state admin. User's original idea (district → panchayat → state approval for every user, ~2 weeks) **not used** — too heavy for national scale (user chose Claude's recommendation).
- Decision: **Doctor approval = district → state → central** (all three). SUPERSEDES "district admin alone approves doctors". — *SUPERSEDED by "Claude's suggestions on gaps" entry below (central checks flagged cases only).*
- Decision: **Profile editing:** user can edit address, contact, allergies, medications, donor status, emergency contacts; name, DOB and Aadhaar-linked identity locked.
- Decision: **Special category tag** has a status (e.g. cancer — treated / untreated / in progress).
- Decision: **Reviews:** separate hospital and doctor review sections with filters (department, location, hospital, govt/private, rating); **appointment requests** confirmed by the hospital.
- Decision: **Chat:** AI health chat, chat with doctors/hospitals, chat with blood donors.
- Decision: **File management** as before (folders, uploads, images, notes; doctor can add but never edit/delete).
- Decision: **Blood donation:** "Ready to donate" toggle; donor list; blood requests by users/doctors/hospitals; **map shows approximate area only**; contact via **in-app call/chat** with number and address hidden (user chose Claude's recommendation over exact home address).
- Decision: **Organ donation:** pledge signed at a hospital with a verified doctor + verification + blood work; recorded and **linked to the official NOTTO registry**; list visible only to authorised doctors/hospitals; allocation follows NOTTO/SOTTO rules.
- Additions by Claude (in 07, for user to accept/reject): guardian manages minor's account; UIDAI face authentication for the live check; blood donor auto-OFF for ~3 months after donating.
- Reason: Stated by user / selected via option panels.
- Owner: Team
- Next step: Answer open doubts below; then update 01, 02 and 06 to match 07.
- Open doubts:
  - "Dates" on the home profile — what does it mean?
  - Doctor who is also a citizen: one account with User/Doctor switch, or two accounts?
  - Blood requests: auto-alert matching nearby donors, or list only?
  - Verify: UIDAI e-KYC and face authentication access; PAN storage; blood donation interval; NOTTO integration; THOTA Act
- Status: DONE (doubts cleared in next entry; folded into 01/02/06 on 2026-10-10)

### 2026-10-10 — User app flow — doubts cleared (selected by user via option panel)
- Decision: **Dates panel** on the home profile shows: upcoming appointments, past visits, medicine schedule and refill dates, vaccination/check-up/lab test due dates. User also asked Claude to add anything useful → Claude added: next eligible blood-donation date, treatment schedule for special-category patients (e.g. chemo/dialysis days, set by doctor), prescription validity/expiry dates.
- Decision: **Doctors have two separate accounts** — a citizen account (own health record) and a doctor account (doctor tools). The User/Doctor switch on the login page picks which one. (Claude had recommended one account; user chose two.)
- Decision: **Blood requests auto-alert** nearby donors with a matching blood group; donors choose whether to respond.
- Decision: **All three Claude additions accepted:** guardian manages a minor's account; live face check uses UIDAI Aadhaar face authentication; "ready to donate" auto-OFF for ~3 months after a recorded donation.
- Decision: User allowed Claude to add anything required → Claude added (marked in 07): **verifiable parental consent** for minors' data (DPDP requirement — to verify); **account handover at age 18**; **donor eligibility check** before the donate toggle can be turned ON (criteria to verify with blood-bank rules).
- 07_USER_APP_FLOW.md updated.
- Reason: Selected by user.
- Owner: Team
- Next step: Update 01, 02 and 06 to match 07 (login flow, doctor approval chain, two doctor accounts, new user features).
- Still to verify: UIDAI e-KYC and face authentication access; PAN storage; blood donation interval and eligibility; NOTTO integration; THOTA Act; DPDP children's-data rules.
- Status: DONE (see next entry)

### 2026-10-10 — Claude's suggestions on gaps (selected by user via option panels)
- Discussed: User asked for Claude's doubts and suggestions; Claude raised 7 gaps (no-smartphone users, doctor-approval scale, citizen AI chat safety, blood donation rules, doctor's own record, account deletion, death of a patient).
- Decision: **People without smartphones:** **assisted registration** by ASHA workers / hospital staff, and a **printed health card** with ABHA QR. Doctor opens the record with **card QR + OTP sent to the patient's basic phone** → normal 30-minute session. (OTP-only fallback without a card was not selected.)
- Decision: **Doctor approval: district → state; central admin checks flagged cases only.** SUPERSEDES "district → state → central for every doctor".
- Decision: **Citizen AI chat = guidance only** — no diagnosis or disease list shown to citizens; suggests seeing a doctor; flags emergency signs; summary saved for the doctor.
- Decision: **Blood donation safeguards:** chat **blocks payment talk** (selling blood is illegal) with a report button; **link to e-RaktKosh** to show government blood-bank stock.
- Decision: **Doctor's two accounts:** doctor account **cannot open the doctor's own citizen record**; opening a **family member's** record is allowed but **flagged in the log**.
- Decision (user's choice): **Accounts are never deleted** — only deactivated. Claude recommended "delete what the law allows".
  - ⚠ Compliance flag (Claude): DPDP Act gives a right to erasure; refusing all deletion may break it. Verify against DPDP Act/Rules and medical-record retention rules.
- Decision: **Death record flow:** hospital/doctor records the death (or via death certificate) → account locked, family/emergency contacts notified, organ pledge sent to NOTTO, records kept for the legal period.
- 07_USER_APP_FLOW.md updated (new sections: no-smartphone users, AI chat limits, blood safeguards, deletion and death, doctor account rules).
- Reason: Selected by user (mostly Claude's recommended options).
- Owner: Team
- Next step: Update 01, 02 and 06 to match 07; verify compliance items (DPDP erasure, e-RaktKosh access, CDSCO status of citizen AI chat).
- Status: DONE (see next entry)

### 2026-10-10 — Remaining doubts round (user asked Claude for all doubts; answered via 4 option panels)
- Decision: **Admission mode:** when a patient is admitted (ward/ICU), the patient or emergency contact grants the **treating team** access **until discharge**; every view logged. (Fixes the 30-minute/one-doctor limit for in-patients.)
- Decision: **Patient can end a doctor's session early** ("End session" button).
- Decision: **Emergency contact approves on their own phone** (alert + emergency code in their app). Doctor typing the contact's **Aadhaar + code is now fallback only**. Partly SUPERSEDES the 2026-10-09 "emergency contact's Aadhaar + code" method.
- Decision: **Lost phone recovery — both ways:** online with Aadhaar OTP + face check, or assisted at a hospital/ASHA. Old phone logged out; rotating key moves to the new phone.
- Decision: **Home vitals** (BP machine, glucometer, smartwatch) can be added by citizens, marked **self-reported**.
- Decision: **Chat with doctors** only with **doctors who have treated the user** (follow-up). Not open to any doctor; eSanjeevani link not chosen.
- Decision: **Appointments: free booking, any fee paid at the hospital** — no payments in the app (billing stays out of scope).
- Decision: **Notifications:** app push, SMS and email. **WhatsApp not used.**
- Decision: **Languages: English only at first**; Hindi and Malayalam to be added next (Bhashini later for more).
  - ⚠ Note (Claude): Kerala pilot patients may need Malayalam — decide whether to add it before the pilot. *(Resolved in "Final doubts round": English only in the pilot.)*
- Decision: **Offline mode:** staff can view cached data and record visits offline; syncs when the network returns.
- Decision: **AI improvement data:** anonymous data used **only with the citizen's opt-in consent**; ethics approval needed.
- Decision: **District admins also log in with Jan Parichay** (government SSO). Closes the carried doubt.
- Decision: **Hospital admin proof documents:** own photo ID, authorisation letter from the hospital head, hospital licence / clinical establishment registration, and hospital employee ID. Closes the carried doubt.
- Decision: **Client = Ministry of Health and Family Welfare (MoHFW).** (Kerala pilot still planned.)
- Decision: **Tech stack:** user asked Claude to choose "the best". Claude's choice (user can override): keep the defaults — **React (web) + React Native (mobile app, shares code with web)**, **Python FastAPI** for the AI services, **Node/Express** for platform APIs, **PostgreSQL** + FHIR R4, **Docker/Kubernetes** on the MeitY cloud. Reason: matches the paper's prototype and the team's skills; one JavaScript codebase for web and mobile.
- Still open: **Kerala pilot districts** (user gave no preference; Claude suggests Pathanamthitta + Thiruvananthapuram); CDSCO classification.
- 07_USER_APP_FLOW.md updated (lost phone, AI consent, home vitals, free booking, doctor chat scope, session/admission/emergency changes, app-wide settings).
- Reason: Selected by user via option panels (mostly Claude's recommended options).
- Owner: Team
- Next step: Update 01, 02, 03 and 06 with all 2026-10-10 decisions; then compliance checks and paper fixes.
- Status: DONE (folded into main docs — see "Main docs updated" below)

### 2026-10-10 — Doctor app flow (described by user + option panels)
- Discussed: User described what a doctor sees and does after login. Written up in **08_DOCTOR_APP_FLOW.md**.
- Decision: **Doctor home:** profile, work time, appointments, past patients (name + own additions only), and a place to enter the patient's key.
- Decision: **Patient session sections:** AI chat (paper's symptom engine), medical image analysis, genomic analysis, temporal analysis, file manager. Session ends after 30 minutes or when the patient ends it.
- Decision: **New document** ("new video" in user's message = new document/file): auto-named with date-time, doctor and patient name; doctor types into a formatted template.
- Decision: **Every action in a session is logged** — every click, button and view.
- Decision: **Doctor location:** checked when opening a patient record and every 5 minutes during the session; must be inside the registered hospital area (**geofence**). User's original idea (every 5 minutes all the time while logged in) replaced by Claude's recommendation.
- Decision: **Outside the permitted area:** access allowed only with a **reason** (home visit, emergency etc.) and **flagged to the district admin**.
- Decision: **Donor section:** blood donor list, own patients needing blood, organ donor pledges (authorised doctors only), and **doctor can register** a patient's organ pledge signed at the hospital.
- Decision: **Stock section:** doctor sees their hospital pharmacy's medicines; can search nearby pharmacies.
- Decision: **Prescriptions:** digitally signed with a **government-approved e-signature** (e-Sign/DSC) with a verifiable QR; patient always gets the signed copy; for the **doctor's own hospital pharmacy, the doctor can send it directly if the patient agrees**. Partly SUPERSEDES "prescription goes only to the patient".
- Decision (Claude's suggestions, accepted): prescription **allergy warning**, **drug interaction warning**, medicines picked from the **national medicine catalogue** (generic names), and **stock shown while prescribing**.
- Decision (Claude's suggestion, accepted): doctor **marks each AI result agree/disagree with a short reason**; final decision always the doctor's.
- Note: User confirmed the citizen-side **medicine stock finder** (search a medicine → nearest pharmacy/hospital with stock) — already covered by the live pharmacy view.
- Reason: Stated by user / selected via option panels.
- Owner: Team
- Next step: Fold 07 and 08 into 01, 02 and 06; verify e-Sign/DSC rules for e-prescriptions, NMC generic-name rules, doctor location tracking under DPDP; pick a drug-interaction database and medicine catalogue source.
- Status: DONE (folded into main docs — see "Main docs updated" below; verification items carried)

### 2026-10-10 — AI results storage (stated by user + option panels)
- Discussed: User asked that every AI tool's output be saved properly and very securely in its own folder.
- Decision: **Every AI run is saved.** One **top-level folder per tool**: AI Chat, Image Analysis, Genomic Analysis, Temporal Analysis (user's choice; Claude had recommended one AI folder with tool subfolders). Each run named by date-time and doctor.
- Decision: **Saved per run:** input + output; evidence sources + VERIFIED/SUPPORTED_WITH_CAUTION/UNCERTAIN status; AI model version + time; doctor's agree/disagree + reason.
- Decision: **Security:** AI results are **locked (no edit/delete)**, **encrypted**, and each result's **hash is added to the tamper-proof activity log**.
- Decision: **Patient sees AI results only after the doctor reviews them** (agree/disagree + note). User first chose "patient sees everything"; Claude flagged the clash with the earlier rule that citizens are never shown a diagnosis by AI; user then chose "show after doctor reviews".
- Decision: Citizen's own guidance-only AI chat is also saved in the AI Chat folder, labelled "citizen chat" (Claude, follows from "save all AI details").
- 08_DOCTOR_APP_FLOW.md updated (new section "AI results storage"; Claude's 4 pending suggestions listed: voice-to-text notes, auto follow-up dates, shift handover note, doctor transfer handling).
- Reason: Stated by user / selected via option panels.
- Owner: Team
- Next step: User to accept/reject Claude's 4 pending doctor suggestions; then fold 07 and 08 into 01, 02, 03 and 06; plan storage capacity for images/VCF files.
- Status: DONE (pending suggestions accepted in next entry)

### 2026-10-10 — Final doubts round + staff/admin flows (selected by user via option panels)
- Discussed: User asked Claude for all remaining suggestions and doubts; answered through several option panels. Claude then drafted **09_STAFF_AND_ADMIN_FLOWS.md** at the user's request.
- Decision: **All 4 doctor suggestions accepted:** voice notes to text (Whisper), follow-up/refill dates auto-added to the patient's Dates panel, shift handover note in admission mode, doctor transfer handled by district admin (geofence and patient list follow the doctor). 08 updated.
- Decision: **Kerala pilot districts:** postponed — "decide after some time" (Claude's suggestion Pathanamthitta + Thiruvananthapuram kept as a note).
- Decision: **Pilot language: English only** (Malayalam added after the pilot). Claude had recommended adding Malayalam before the pilot.
- Decision: **Storage:** recent scans/VCF on fast storage; older files (e.g. 2+ years) moved to cheaper archive storage, still retrievable.
- Decision: **Referral:** referral note goes to the receiving doctor; full record opens only with the patient's key, as usual.
- Decision: **Video consultation: not in the first version** (later, possibly via eSanjeevani).
- Decision: **Health alerts:** citizens can mute normal alerts; **emergency alerts can never be muted**.
- Decision: **Misuse** of break-glass or the location rule (found on review) → **account suspended + case reported to the medical council**; patient informed.
- Decision: **Backup:** live copy in a **second MeitY cloud region in India** with automatic switch-over.
- Decision: **CDSCO medical-device research: later** (before the pilot). **Paper inconsistency fixes: later** (after the design is finished).
- Decision: **09_STAFF_AND_ADMIN_FLOWS.md approved**, with these choices:
  - Hospital admin **Admissions list** (names + treating team only) — kept
  - Pharmacy **near-expiry alerts** — kept; **spreadsheet bulk upload — not used**
  - Nurse/lab/radiology **orders queue** — approved as drafted
  - Claude's added suggestions, all accepted: **bed availability** (shown to citizens/ambulances), **pharmacy software link** for automatic stock sync, **controlled-drug checks and register** (Schedule H/H1/X), **lab/scan machine link** (later phase), **approval time limits** (escalate to state if overdue), **unusual-pattern alerts** on dashboards, **admin handover** on transfer
- Reason: Selected by user via option panels (mostly Claude's recommended options).
- Owner: Team
- Next step: Fold 07, 08 and 09 into 01, 02, 03 and 06 so all main docs match; later: pilot districts, CDSCO research, paper fixes, compliance checks.
- Open doubts: exact approval time limit (days); which pharmacy software to support first; Drugs and Cosmetics rules for Schedule H/H1/X and e-prescriptions.
- Status: DONE (folded into main docs — see next entry; open doubts carried)

### 2026-10-10 — Main docs updated to match all decisions (user approved "ok")
- Discussed: 01, 02, 03 and 06 were out of date after the 2026-10-10 decisions recorded in 07, 08 and 09.
- Decision: **01_SYSTEM_OVERVIEW.md rewritten** — client MoHFW; Kerala pilot (English only, districts later); new registration and approval chain; citizen features (dates panel, home vitals, donation, stock finder, guidance chat); all access modes (key, card + OTP, admission, emergency approval, break-glass, referral); AI results storage; e-signed prescriptions with safety checks; accounts/death/logs; extended module list; architecture with React/React Native, FastAPI, Node, second-region backup and storage tiers; tech stack; out-of-scope list.
- Decision: **02_LOGIN_AND_AUTH_FLOW.md rewritten** — login pages; creation/approval table (doctor district → state, central flagged; citizen automatic with flagged review); citizen registration incl. minors, assisted registration, health card, lost phone; emergency contact approval on own phone; doctor two accounts, geofence, emergency flow; Jan Parichay for all four admin levels; updated permissions table and session rules.
- Decision: **03_INTEGRATION_PLAN.md rewritten** — UIDAI e-KYC + face auth, e-Sign/DSC, medicine catalogue, drug-interaction database, pharmacy software sync, e-RaktKosh, NOTTO, death registration, LIS/PACS later; extended compliance checklist (DPDP erasure and children's data, IT Act e-Sign, Schedule H/H1/X, THOTA, blood-bank rules); roadmap phases refilled with all features.
- Decision: **06_ROLES_PROPOSAL.md updated** — now a role summary pointing to 07/08/09; approval chain and duties updated.
- Decision: **07_USER_APP_FLOW.md** header updated (no longer "01/02/06 need updating"); small additions for consistency (stock finder section, bed availability, AI results visibility, referral, alert muting, English-only pilot).
- Decision: **00_PROJECT_INSTRUCTIONS.md updated** — client MoHFW, confirmed stack, "don't assume / ask via option panel" rule, compliance list extended, document map extended to 06–09.
- Owner: Claude (writing) / Team (review)
- Next step (suggested by Claude): screen sketches of key screens; ABDM sandbox registration walkthrough; legal/compliance checks; later — pilot districts, CDSCO research, paper fixes.
- Status: DONE (screen sketches made — see next entry)

### 2026-10-10 — Screen sketches of key screens (user approved "ok")
- Discussed: Visual mock-ups of the main screens to show the team / MoHFW.
- Decision: Claude made a **design canvas "CareFusion Key Screens"** (claude.ai artifact, private to the user until shared) with 5 screens, built only from decisions in 01–09:
  - **Login** (mobile) — User/Doctor switch, phone/email + password, fingerprint/face ID, OTP note, create account / doctor registration / lost-phone links, link to staff/admin login pages
  - **Citizen home** (mobile) — rotating key (QR + number, countdown), active doctor session banner with "End session", blood group / allergies / organ donor tiles, Dates panel, bottom tabs (Home, Files, Chat, Medicines, Donate)
  - **Doctor patient session** (web) — geofence status, session timer, tabs for the 4 AI tools + file manager, top-3 AI suggestions with VERIFIED / SUPPORTED WITH CAUTION / UNCERTAIN and Agree / Disagree, patient summary, actions (new document, e-signed prescription, order test, follow-up, referral), voice dictation
  - **Pharmacist queue** (web) — incoming prescriptions, e-signature + not-dispensed checks, medicine table with stock and Schedule H flag, dispensed / substitute / out-of-stock actions
  - **District admin inbox** (web) — sections with counts, task cards for emergency review, doctor approval (with due date), flagged user, location flag, unusual-pattern alert
- Design choices (Claude's, user can change): IBM Plex Sans, deep teal + amber, plain government look; all names and figures synthetic; AI suggestions labelled "sample output".
- Owner: Claude (design) / Team (review)
- Next step: Team reviews the screens and asks for changes; then ABDM sandbox walkthrough and legal checks.
- Status: OPEN

### 2026-10-10 — Funding proposal to ICMR and NMC (selected by user via option panels)
- Discussed: User said the project is "for ICMR and the Indian medical council". Claude explained ICMR (health research body under MoHFW) vs NMC (National Medical Commission, regulates doctors; formerly MCI) and asked via option panels.
- Decision: The project will be **submitted as a funding proposal to both ICMR and NMC**. **MoHFW stays the end user / client** of the platform (no change to 00/01).
- Decision: **Deliverables:** a **full idea document** (proposal) and an **alpha version** of the software.
- Decision: **Alpha scope = everything in 01–09** (user's choice; Claude had recommended a smaller "core slice" — login, citizen record, rotating key, doctor session with AI tools, synthetic data only).
- Decision: **Alpha built together** — Claude and the team both write code.
- Decision: **No specific funding call yet** — Claude to find suitable calls.
- Findings (Claude, web search on 2026-10-10 — all TO VERIFY on icmr.gov.in / epms.icmr.org.in):
  - **ICMR Extramural grants — "Small" (ANVESHAN) and "Intermediate" (NISCHAYAK ANVESHAN):** for scientists working **outside** ICMR institutes; AI/ML predictive tools are an accepted research type. The 2026 round closed in **March 2026**; it was released on **19 Dec 2025** → the next round is likely around **Dec 2026** (best target).
  - **ICMR Intramural 2026:** for ICMR institutes only; closed 30 Sep 2026. Outsiders can join only as co-investigators with an ICMR institute.
  - **ICMR AI Cell ad-hoc proposals** (via ePMS "Ad-hoc Project Program"; a 2022 call seen) — check whether currently open.
  - **DBT "AI for Algorithm/Product/Software Development"** call closed Feb 2026 — watch for the next round.
  - **IndiaAI–ICMR MoU:** ICMR datasets (MIDAS framework) on AIKosh and subsidised GPU compute — useful for validating the AI on Indian data.
- ⚠ Flags (Claude):
  - **NMC usually does not fund research** — it regulates doctors and medical education. It may fit better as a stakeholder (endorsement, misuse-reporting route, rules on ratings/e-prescriptions). To verify.
  - **ICMR extramural PI must have regular employment** at an institution (college/university/hospital) → a faculty member (e.g. guide Anila A) would be PI; students as team. To verify against the next call.
  - **ICMR funds research questions, not product builds.** Proposal should be framed around a research aim (e.g. prospective validation of the AI decision support on Indian patients in the Kerala pilot), with the platform as the delivery vehicle.
  - **Alpha = all of 01–09 is very large** (many months for a 4-person team); a staged alpha may be needed to meet a Dec 2026 deadline.
- Reason: Selected by user via option panels; findings from Claude's search.
- Owner: Team (PI choice, approval) / Claude (proposal draft, alpha build with team)
- Next step: Confirm PI and target call; decide alpha build order and deadline; start the idea document.
- Status: OPEN (alpha approach decided in next entry; PI flag still open)

### 2026-10-10 — Alpha approach: website + synthetic data + mock integrations (stated by user + option panel)
- Discussed: User proposed building the alpha as a working website with synthetic (fake) data so every feature works for reviewers; real government integrations and login-credential validation (which need genuine authorisation) done last. Claude agreed.
- Decision: **Alpha = website only** (responsive, works on phones). React Native app after funding. (Final product is still app + website.)
- Decision: **All features working on synthetic data** — donors, stock, beds, appointments, records etc. seeded with Indian-style synthetic data; "SYNTHETIC DEMO DATA" banner on every screen; fake Aadhaar/ABHA numbers clearly marked as fake (e.g. `DEMO-0000-1234`), never valid-looking.
- Decision: **Government integrations built last, as mock connectors first** (Aadhaar e-KYC, face check, ABHA, HPR, HFR, Jan Parichay, e-Sign, NOTTO, e-RaktKosh, SMS). Each mock uses the same request/response shape as the real service so it can be swapped later. No real government logos or look-alike official login pages — labelled "planned integration".
- Decision: **Demo role switcher** — one-click login as citizen, doctor, staff, pharmacist and each admin level. (Integration status page and guided tour not selected.)
- Decision: **Hosting for the alpha = free/cheap cloud** (e.g. Render/Railway/Vercel + managed PostgreSQL) — acceptable because only synthetic data is used. MeitY cloud stays the plan for real data.
- Suggested by Claude (not yet decided): real AI where public data allows — vision module on NIH chest X-ray, genomic module on ClinVar with synthetic VCFs; symptom and temporal modules on synthetic cases (MIMIC-IV cannot go on a public site). Build order: login + roles → citizen record + rotating key → doctor session with AI → prescription to pharmacy → donors → admin inboxes → dashboards.
- Decision (user): **PI on the ICMR proposal = the user (Athun).**
  - ⚠ Flag (Claude): ICMR extramural grants require the PI to have regular employment at a medical college/research institute/university/recognised lab. A student PI is likely not eligible for these calls. Options: faculty PI with the user as co-investigator, or a student/startup-friendly scheme. To verify against the next call's eligibility rules.
- Reason: Stated by user / selected via option panel.
- Owner: Team / Claude
- Next step: Resolve PI eligibility; confirm build order and AI approach; then set up the project repo and synthetic data generator.
- Status: DONE (follow-ups decided in next entry)

### 2026-10-10 — PI, build order, AI in alpha, code base (selected by user via option panel)
- Decision: **User stays PI** (user's choice; Claude recommended faculty PI with user as Co-PI).
  - ⚠ Still flagged: likely ineligible as PI for ICMR extramural grants (regular-employment rule). Must be checked against the next call before submission; fallback = faculty PI or another scheme.
- Decision: **Build order approved:** login + roles (with demo role switcher) → citizen record + rotating key → doctor session with AI → prescription to pharmacy → donors → admin inboxes → dashboards.
- Decision: **All 4 AI modules simulated in the alpha** — fake but realistic outputs keeping the paper's design (top-3 suggestions, VERIFIED / SUPPORTED_WITH_CAUTION / UNCERTAIN, evidence list, disagreement reporting, agree/disagree). Must be clearly labelled "simulated AI output" and must not claim the paper's accuracy figures for these outputs. (Claude had recommended real vision + genomic modules.)
- Decision: **No existing prototype code — start fresh.**
- Reason: Selected by user.
- Owner: Team / Claude
- Next step: Set up the project (React web + Node/Express + FastAPI + PostgreSQL), synthetic data generator, then build stage 1 (login + roles + role switcher).
- Status: OPEN

### 2026-10-10 — ICMR contact history checked (user's Gmail, read by Claude at user's request)
- Discussed: User asked Claude to read the ICMR emails and suggest a reply. User wants to say: demo ready in about 4 months; paper published on IEEE Xplore.
- Findings:
  - 22 Oct 2025: user emailed Module 1 (symptom prediction) report to several bodies incl. **ICMR-NIRDHDS** (nims.director@icmr.gov.in).
  - 7 Nov 2025: ICMR-NIRDHDS Director's Office replied — reviewed the proposal, invited an online meeting to discuss progress and how NIRDHDS can **assist, guide, refine and validate** the work, and "possible avenues for collaboration and institutional support". Meeting held **11 Nov 2025**.
  - 11 Nov 2025: user sent guide emails as requested (Shilpa Radhakrishnan, Anila A).
  - 3 Dec 2025: user asked for an update and a validation letter for the college. **No reply since (~10 months).**
  - IEEE Xplore: paper confirmed — "CareFusion AI: Evidence-Based Agentic Intelligence for Multi-Modal Clinical Decision Support", ICSCST 2026, document 11709822.
- Note (Claude): NIRDHDS is an **ICMR institute** (digital health and data science) → an ICMR scientist there as collaborator/co-investigator would help with the PI-eligibility issue and with ICMR funding routes.
- Owner: User (send email) / Claude (draft)
- Next step: User sends a follow-up in the original thread; prepare a 2-page concept note to attach.
- Status: DONE (see next entry)

### 2026-10-10 — Concept note + ICMR email draft (user request)
- Decision: Email goes from the user's official address **athunsujith59@gmail.com** (not the developer ID), as a new email to nims.director@icmr.gov.in.
- Done: Claude wrote the **concept note** "CareFusion AI — Concept Note for ICMR-NIRDHDS" (Claude doc, exported as a 6-page A4 PDF): summary, problem, solution diagram, published results (paper's text numbers only, with honest limits), ABDM platform design, why ICMR should support it, roadmap diagram (demo → validation → Kerala pilot → scale), requests (demo slot, NIRDHDS mentor/co-investigator, Indian data route, ICMR programme advice, support letter), team.
- Done: **Gmail draft saved** (not sent) with the PDF attached; includes publication link, key results, 4-month demo, user's role at CloudControl (HybCloud Technologies Pvt. Ltd.) from LinkedIn.
- Note: co-author rows were removed from the note's team table by a later edit; left as is pending user's confirmation.
- Owner: User (review and send) / Claude (drafts)
- Next step: User reviews and sends; follow up by phone after 2–3 weeks if no reply.
- Status: DONE (updated in next entry)

### 2026-10-10 — Startup intent added to ICMR email and note (stated by user)
- Discussed: User asked to tell ICMR that no startup exists yet and that he would like to start one if they like the work; asked Claude's view.
- Claude's view: good idea if kept to one measured paragraph near the end, framed as translation/sustainability under ICMR guidance and its technology-transfer/IP policies — not as a request for investment (ICMR funds research via institutions; startup funding fits BIRAC / Startup India / KSUM).
- Decision: Added one paragraph to the Gmail draft and a 6th request "Guidance on translation" to the concept note; PDF re-exported and the draft's attachment replaced. Draft still not sent.
- ⚠ To check before forming a company: IP terms if ICMR collaborates; CloudControl employment contract rules on side ventures.
- Owner: User (send) / Claude (drafts)
- Status: DONE — **user sent the email on 2026-10-10.** Follow up by phone (+91 9211933317) if no reply by ~24 Oct 2026.

### 2026-10-11 — Tech stack document + free database for the alpha (user approved "ok")
- Discussed: Claude drafted **10_TECH_STACK.md** (status PROPOSAL — layer-by-layer stack, hosting options, prices, cost picture). User then asked about the database suggestion, free options and their time limits.
- Findings (Claude, web search 2026-10-11 — to verify on provider sites):
  - Permanent free PostgreSQL tiers exist at **Neon, Supabase and Aiven**; Render's free database **expires after 30 days**; Railway gives only a trial credit; AWS RDS free tier lasts 12 months.
  - **Neon free:** no expiry, no card; 0.5 GB storage per project; 100 compute-hours per month; sleeps after 5 min idle and wakes in milliseconds automatically.
  - **Supabase free:** pauses the project after 7 days idle and needs a manual restore; 500 MB; 2 free projects.
  - **Aiven free:** permanent; also offers free Valkey; idle shutdown rules not confirmed.
- Decision: **Alpha database = Neon free plan (₹0).** PostgreSQL in Docker on laptops for daily development. Neon holds **synthetic data only** — never real patient data (not MeitY-empanelled; may host outside India).
- Decision: 10_TECH_STACK.md updated — data layer, alpha hosting table (≈ ₹4,700/month instead of ₹5,000–6,500), Neon limits, alpha 4-month total ≈ ₹20,000–25,000, open questions. — *Render-based app hosting (≈ ₹4,700/month) SUPERSEDED by next entry (Vercel + Oracle Always Free + Neon = ₹0/month). Neon decision unchanged.*
- Reason: Neon never expires and never needs a manual unpause → safest for a live ICMR demo; saves ~₹600–1,800/month.
- Owner: Team / Claude
- Next step: Check PostGIS on Neon free; set up regular database dumps; user to decide the rest of 10 (NEW items, Render vs VPS, Valkey on Render vs Aiven free, production cloud, signing method, maps).
- Status: DONE (hosting settled in next entry)

### 2026-10-11 — Free hosting for the alpha: Vercel + Oracle Always Free + Neon (stated by user)
- Discussed: User asked for free servers (AWS and others). Claude searched (2026-10-11 — to verify on provider sites):
  - **Free forever:** Oracle Cloud Always Free (Arm server; officially 4 OCPU / 24 GB, 2026 reports say cut to 2 OCPU / 12 GB; 200 GB storage; card needed for verification; "out of capacity" common; idle servers may be reclaimed; home region fixed at signup); Google Cloud e2-micro (too small); Render free (512 MB, sleeps after 15 min); Vercel / Cloudflare Pages / GitHub Pages (front end only).
  - **Credit only:** AWS new accounts $100–200, Free plan up to 6 months then closes; Google Cloud $300 for 90 days; Azure $200 for 30 days + small VM 12 months; Azure for Students $100 (no card); GitHub Student Pack → DigitalOcean $200 for 1 year.
  - No longer free: Fly.io (new accounts), Railway (trial credit only); Koyeb free compute unclear.
- Decision: **Alpha hosting = Vercel (React front end) + Oracle Cloud Always Free (Node API, FastAPI, Keycloak, Valkey with Docker Compose) + Neon (PostgreSQL) → ₹0/month** (domain ~₹800–1,500/year). SUPERSEDES the Render-based alpha hosting table (≈ ₹4,700/month) in the previous entry.
- Decision: Valkey runs on the Oracle server (closes "Render paid vs Aiven free").
- Rules: **synthetic data only** (none of these are MeitY-empanelled); Oracle home region = Mumbai or Hyderabad if capacity allows; billing alert on Oracle; regular backups (DB dumps + server snapshots).
- Backup plan if no Oracle free server in India: AWS Mumbai credit, DigitalOcean Bangalore via GitHub Student Pack (if a team member is a student), or Render paid.
- 10_TECH_STACK.md updated (section 3.1, prices, cost picture: alpha 4-month total ≈ ₹800–1,500 = domain only; trade-offs; open questions).
- Reason: Stated by user ("front end using vercel, backend using oracle, neon database").
- Owner: Team / Claude
- Next step: Create Oracle Cloud account (choose Mumbai/Hyderabad home region) and claim an Arm server; create Vercel and Neon accounts; check PostGIS on Neon free and Vercel Hobby terms. Still open in 10: NEW items, production cloud, prescription signing, maps.
- Status: OPEN

### 2026-10-11 — File storage for the alpha: Cloudflare R2 (stated by user)
- Discussed: User asked for free storage for demo images, test data and other files. Claude compared free S3-compatible options (web search 2026-10-11 — to verify): Cloudflare R2 (10 GB, no egress fees, 1M write + 10M read ops/month), Backblaze B2 (10 GB, free egress up to 3× stored), MinIO on the Oracle server disk (up to ~150 GB, self-managed), Oracle Object Storage (~10+10+10 GB, to verify), Neon Object Storage (5 GB), Tigris (5 GB), Supabase Storage (1 GB, 50 MB file limit).
- Decision: **Alpha file storage = Cloudflare R2 free plan (₹0).** MinIO in Docker on laptops for development; MeitY-empanelled storage in India for production. Same S3 code in all three.
- Rules: private buckets with short-lived signed links; only synthetic VCF/PDF files and a **small sample of a public, de-identified X-ray dataset** (e.g. a few hundred NIH Chest X-ray images, well under 1 GB); never real patient scans.
- Alpha hosting total unchanged: **₹0/month** (+ domain).
- Suggested by Claude (not yet decided): Backblaze B2 free for nightly backups of the Neon dump and key files.
- 10_TECH_STACK.md updated (data layer, alpha hosting table, R2 limits, prices, open questions).
- Reason: Stated by user ("ok using the cloudflare r2").
- Owner: Team / Claude
- Next step: Create a Cloudflare account and an R2 bucket; decide the backup location.
- Status: OPEN

### 2026-10-11 — Database design document (user request)
- Discussed: User asked to create the full database documentation.
- Done: Claude wrote **11_DATABASE_DESIGN.md** (status PROPOSAL), built from decisions in 01–10: design rules (one person → many accounts, never delete, Aadhaar token only, app-level encryption, files in R2, hash-chained log, UUID v7, FHIR jsonb beside normal columns); 11 schemas (geo, org, identity, admin, access, records, ai, pharmacy, donation, engage, audit); every table with key columns and enums; ER diagram; append-only triggers, database roles, RLS (production), de-identified dashboard views; what lives in Valkey/R2/Keycloak/FAISS; synthetic seed plan (~2,000 citizens, ~150–300 MB, fits Neon free); build order matching the approved alpha order.
- Claude's design choices (user can change): UUID v7 ids; FHIR jsonb column on clinical tables; RLS in production; doctor's two accounts linked by one `person` row; Keycloak in a separate Neon project; seed sizes.
- 00_PROJECT_INSTRUCTIONS.md document map extended with 10 and 11.
- Owner: Claude (writing) / Team (review)
- Next step: User reviews 11 and answers its open questions (family-member rule, approval time limit, Keycloak database, backup location); then Claude writes the Prisma schema + SQL migrations for stage 1.
- Status: OPEN

### 2026-10-11 — Production-level database for the full system (user request)
- Discussed: User asked that the database be production level, with all users, for the full system.
- Done: Claude wrote the **`carefusion-db` package** — 12 numbered SQL migrations (PostgreSQL 16 + PostGIS) covering every user type and every feature in 01–10: 12 schemas, **97 tables and views**; append-only triggers; row-level security on all patient tables; views per user type (access history, emergency basics, stock finder with distance, near-expiry, matching donors, alert recipients, overdue approvals); de-identified `report` views; roles `cf_migrator`/`cf_app`/`cf_ai`/`cf_report`/`cf_auditor` with no DELETE/TRUNCATE for app roles; reference data (5 zones, all 36 states/UTs with the approved mapping, 14 Kerala districts, master lists, approval chain); monthly partitions.
- Tested (local PostgreSQL 16.15 + PostGIS 3.4): all migrations apply on an empty database; **46/46 rule tests pass**; hash-chained log ~5,500 rows/s with 16 parallel writers, all chains intact.
- Bug found and fixed during testing: under parallel writes the log chain broke because the row number was assigned before the stream lock; now assigned after the lock.
- **11_DATABASE_DESIGN.md updated:** SQL is the source of truth (Prisma reads it with `db pull`; Prisma Migrate not used); per-stream hash chains; new **section 19 — production design at national scale** (sizing assumptions, pilot setup with HA + read replica + PgBouncer + second region, Citus sharding by patient for the national phase, partitions + archive, RPO ≤ 5 min / RTO ≤ 1 h / 35-day PITR targets, security and operations).
- Claude's choices (user can change): approval time limit placeholder 7 days; blood-donation gap 90 days (unverified); family flag = doctor is the patient's emergency contact or guardian; Citus for the national phase.
- Owner: Claude (writing) / Team (review)
- Next step: Team reviews; answer open questions in 11; run the migrations on Neon (check extensions allowed); then build stage 1 of the API on top.
- Status: OPEN

### 2026-10-11 — Pre-coding decisions (selected by user via option panels)
- Decision: **All NEW tech items in 10 approved** (Keycloak, NestJS on Express, Prisma, PostGIS, Valkey, Synthea, PWA offline, MLflow, shadcn/Tailwind, HAPI FHIR + Orthanc later). 10_TECH_STACK.md marked APPROVED.
- Decision: **Database design approved as is** (11 + `carefusion-db`). 11_DATABASE_DESIGN.md marked APPROVED.
- Decision: **One private GitHub repo** (monorepo: web, API, AI service, database, shared types); changes via pull requests.
- Decision: **Website look: decide later** — stage 1 built with the screen-sketch style (IBM Plex Sans, deep teal + amber), restyled later if needed.
- Decision (stated by user): **Builders = the user (Athun) + Claude only.** Other team members are not building the alpha.
- Decision: **Alpha demo deadline ≈ mid-February 2027** (~4 months; matches what was told to ICMR).
- Decision: **The user creates all accounts** (GitHub, Oracle, Vercel, Neon, Cloudflare) with **one shared project email**, logins in a password manager, 2-step login on.
- User did not know which first step to take → Claude proposed a plan (see next step).
- ⚠ Flag (Claude): full 01–09 alpha in ~4 months with 2 builders is very tight. Claude can write most code, but the user must create accounts, run and test, deploy, and make decisions. Suggest building stages in the approved order and cutting lower-priority parts of later stages if behind.
- Owner: User (accounts, review, testing, decisions) / Claude (code, docs)
- Next step: User creates the project email + GitHub account and private repo, then attaches the repo to Claude; Claude sets up the monorepo and starts stage 1 (login + roles + demo role switcher).
- Status: OPEN

### 2026-10-11 — Docker images and environments doc (user request)
- Discussed: User asked which Docker images are needed, then asked for a doc.
- Done: Claude wrote **12_DOCKER_AND_ENVIRONMENTS.md** (status PLAN): ready-made images (PostGIS, Valkey, Keycloak, MinIO, Mailpit, Caddy); our images (carefusion-api, carefusion-ai, carefusion-web, db-migrate, seed later); what runs on the laptop vs the Oracle alpha server vs production; ports; start order; commands; memory budget on Oracle (~3–4.5 GB of 12 GB); server rules; settings via `.env`; files to be created in the repo. 00 document map updated.
- Rules (Claude): pinned image versions; images run as non-root, no secrets inside, built for amd64 + arm64 (Oracle is ARM).
- Owner: Claude / User
- Next step: User installs Docker Desktop, tells laptop type and RAM, creates GitHub repo; Claude writes the setup files.
- Status: OPEN

### 2026-10-11 — Demo build plan (user request)
- Discussed: User asked for a step-by-step plan from start to demo. Work only on Saturdays and Sundays, 2 sessions a day (sometimes 3, depending on Claude usage); user wrote "55 hours" — read as ~5 hours per session (to confirm).
- Done: Claude wrote **13_DEMO_BUILD_PLAN.md** (status PLAN): 18 weekends (17 Oct 2026 → 14 Feb 2027), 72 planned sessions; session routine (plan → build → run & check → close with merged code + log entry); weekend-by-weekend tasks for every session following the approved stage order; light weekends for Diwali and year end; **Milestone 1 — core demo online by 12–13 Dec 2026** (for the expected ICMR call); **Milestone 2 — full alpha 13–14 Feb 2027**; cut list if behind (never cut stages 1–3); what the user must provide and when. 00 document map updated.
- Owner: User + Claude
- Next step: W1 (17–18 Oct): project email, GitHub repo, Docker Desktop, repo skeleton, first `docker compose up`.
- Status: OPEN

### 2026-10-11 — Build plan details confirmed (selected by user via option panel)
- Decision: **Sessions ≈ 5 hours**, 2 per day on Saturday and Sunday (3rd session only for catch-up).
- Decision: **Development laptop = Windows, 16 GB RAM** → Docker Desktop with WSL 2; project kept inside WSL; official PostGIS image works (x86).
- Decision: **Keep Milestone 1 — core demo online by 12–13 Dec 2026** (for the expected ICMR call); full alpha by 13–14 Feb 2027.
- 13_DEMO_BUILD_PLAN.md marked APPROVED; 12_DOCKER_AND_ENVIRONMENTS.md updated for Windows.
- Owner: User + Claude
- Next step: W1 (17–18 Oct). Before it: user installs Docker Desktop + WSL 2, creates project email, GitHub account and private repo `carefusion`.
- Status: OPEN

### 2026-10-16 — Accounts, laptop setup and repo ready (user, with Claude's step-by-step help)
- Done: Docker Desktop + WSL 2 (Ubuntu-26.04) installed; **Antigravity** chosen as editor, always opened via "Connect to WSL"; its agent kept off for our repo.
- Done: Project email `carefusionai59@gmail.com` (2026-10-14). Neon project `carefusion-alpha` created early (2026-10-16; region and Postgres version still to confirm).
- Done: **GitHub account `CarefusionAI`** (signed up with `carefusion1234@gmail.com`, not the project email) and private repo **`CarefusionAI/Carefusion-AI`** (name differs from the planned `carefusion`).
- Done: Git config on the laptop (name "Athun Sujith", email carefusion1234@gmail.com, default branch `main`); SSH key added to GitHub; `ssh -T git@github.com` authenticated as CarefusionAI; parent folder `~/projects` created; repo cloned to `~/projects/Carefusion-AI`.
- Decision: **The repo becomes the main copy of the project docs.** All docs (00–14) go in `docs/`, the SQL package in `carefusion-db/`, and a `CLAUDE.md` at the repo root so Claude Code (CLI) reads the context automatically. Decisions made anywhere are written into `docs/` in the repo.
- Pending: link GitHub to Claude (Settings → Connectors → GitHub, allow only `Carefusion-AI`) so Claude can push directly.
- Owner: User / Claude
- Next step: W1 Sat S2 — monorepo skeleton (`apps/web`, `apps/api`, `apps/ai`, `packages/shared`), `docker-compose.yml`, `.env.example`.
- Status: OPEN

### 2026-10-16 — W1 Sat S2: Monorepo skeleton built and running
- Done: Added agent delegation rules to CLAUDE.md (code via Sonnet 5.5, saves via Haiku 5.5, discovery via Explore agent; max depth 5, max 10 concurrent subagents).
- Done: Installed Node.js 22.23.3 (nvm) + pnpm 9.12.0 in WSL.
- Done: Built full monorepo skeleton — `apps/web` (React 18 + Vite + Tailwind, teal/amber theme), `apps/api` (NestJS placeholder), `apps/ai` (FastAPI with 4 simulated AI modules: symptom, image, genomic, temporal), `packages/shared` (12 roles, AIConfidence, demo banner).
- Done: `docker-compose.yml` with 8 services (PostGIS 16, Valkey 8, Keycloak 26, Mailpit, db-migrate, API, AI, web). All 12 database migrations applied. AI service and Keycloak responding.
- Decision: **MinIO deferred to W4** — Docker Hub pull requires authentication; not needed until file uploads.
- Decision: **Bitnami/minio also unavailable** — will resolve with `docker login` or alternative when needed.
- Decision: db-migrate gets `restart: on-failure:3` and a 3-second startup delay to handle the Postgres race condition.
- Owner: Athun + Claude
- Next step: W1 Sun S1 — run database tests in Docker, commit all work to `main` via PR.
- Status: OPEN

### 2026-10-16 — W2 Sat S1: Keycloak realm + login pages + role switcher
- Done: Keycloak `carefusion` realm with 12 roles, 2 OIDC clients (carefusion-web public, carefusion-api confidential), 12 demo users (password Demo1234!pass).
- Done: Three login pages: `/login` (User/Doctor switch), `/login/staff` (Nurse/Lab/Radiology), `/login/admin` (6 admin roles with Jan Parichay SSO placeholder).
- Done: AuthContext with demo role switcher (one-click login as any role, persists in sessionStorage).
- Done: Layout header shows role badge + logout button; RequireAuth guards all role pages.
- Done: GitHub Actions CI pipeline (build-and-test + db-tests jobs).
- Done: "SYNTHETIC DEMO DATA" banner on every page.
- Owner: Athun + Claude
- Status: DONE

### 2026-10-16 — W2 Sat S2 + Sun S1–S2: API auth, synthetic data, audit logging
- Done: NestJS API auth module — Keycloak JWT validation via JWKS (passport-jwt + jwks-rsa), demo mode fallback (Bearer demo:<ROLE> or X-Demo-Role header when DEMO_MODE=true).
- Done: Global CfAuthGuard + RolesGuard with @Public() and @Roles() decorators. /health is public, /api/v1/auth/me and /api/v1/auth/demo-login are protected/public.
- Done: Shared package now builds to dist/ (fixes rootDir issues); workspace dependency properly linked in api + web package.json.
- Done: Synthetic data generator (carefusion-db/seed/generate.py, no external deps): 2 Kerala districts (Ernakulam + Thiruvananthapuram), 20 hospitals, 40 pharmacies, 2000 citizens, 40 doctors, 60 staff, 20 hospital admins, 40 pharmacy admins, 40 pharmacists, 5 admin-chain accounts — all DEMO- identifiers. Verified: 2205 persons, 46 rule tests pass.
- Done: Audit logging — DatabaseService (pg pool) + AuditService calling audit.log() with hash-chained trail. Demo logins recorded with action=auth.demo_login.
- Decision: Use pg driver directly for raw SQL (audit.log, SET LOCAL context) instead of Prisma for now. Prisma full introspection deferred until typed ORM queries are needed.
- Decision: Web AuthContext stores demo token in sessionStorage and sends it via Authorization header to the API.
- Owner: Athun + Claude
- Next step: W3 — citizen registration (mock Aadhaar e-KYC + face check), doctor self-registration (mock HPR), approval chain basics.
- Status: DONE

### 2026-11-01 — W3 Sun S2: Admin creation chain and staff/pharmacist accounts
- Done: Built the **admin-ops API module** (`apps/api/src/admin-ops/`). Central, zonal and state admins create lower-level admins (central→zonal, zonal→state, state→district) through approval requests. Hospital admins create nurse, lab and radiology staff. Pharmacy admins create pharmacists. All writes run in DB transactions with validation. Role-guarded routes: create-admin, create-staff, create-pharmacist, zones, states.
- Done: **Create account UI** (`apps/web/src/components/CreateAccountForm.tsx`) with CreateAdminForm, CreateStaffForm and CreatePharmacistForm. Central, zonal and state admin dashboards now show CreateAdminForm next to the approval inbox. Hospital admin and pharmacy admin dashboards replace their placeholders with a dashboard plus the matching create form.
- Done: Shared Zod schemas added to `packages/shared` (CreateAdminRequestSchema, CreateStaffRequestSchema, CreatePharmacistRequestSchema, CreateAccountResponseSchema). `app.module.ts` imports AdminOpsModule.
- Decision: **Two-person rule for zonal admin creation is stored as metadata** in `check_results` JSON. It is not yet enforced by the approval service.
- Decision: Staff and pharmacist accounts are **activated immediately** (no approval step). Only admin creation goes through the approval chain.
- Reason: Completes the W3 build plan for the full registration and account-creation hierarchy.
- Owner: Athun + Claude
- Next step: Create PR `w3-citizen-registration` → `main` (gh CLI not yet authenticated). Then W4 — doctor verification and patient records.
- Status: DONE

### 2026-10-17 — W4 Sat S1: Citizen profile, documents and folders with MinIO storage
- Done: Merged PR #2 (w3-citizen-registration → main). Created branch `w4-citizen-profile`.
- Done: **Demo identity resolution** — auth guard resolves personId/userId from the database for each demo role, cached in-memory. Demo-login endpoint and auth/me now return personId/userId.
- Done: **Citizen profile API** (`apps/api/src/citizen/`): view profile (joins person + citizen_profile + special_category + emergency_contact + geo), update editable fields (language, blood group, AI opt-in), list special category types, add/end special categories, auto-create system folders on first access.
- Done: **Document/folder API** (`apps/api/src/documents/`): list/create/rename folders, upload documents with SHA-256 hash to MinIO, download via pre-signed URL (separate public endpoint for browser access), move documents between folders. Documents are immutable (no edit/delete).
- Done: **S3-compatible storage service** (`apps/api/src/storage/`): uses @aws-sdk/client-s3 with configurable endpoint; separate signing client for browser-facing pre-signed URLs using MINIO_PUBLIC_ENDPOINT.
- Done: **Citizen home page** (`apps/web/src/pages/CitizenHome.tsx`): Profile tab with identity card (locked fields), editable profile form, special categories CRUD, emergency contacts list. Documents tab with folder sidebar (system folder icons), document list, file upload, download, and move.
- Done: **Shared Zod schemas** (`packages/shared/src/citizen.ts`): BloodGroup, PreferredLanguage, CitizenProfileResponse, UpdateCitizenProfileRequest, SpecialCategoryType/Request, DocType, FolderKind, FolderResponse, CreateFolderRequest, RenameFolderRequest, DocumentResponse, UploadDocumentRequest/Response, DocumentDownloadResponse, MoveDocumentRequest.
- Done: **Docker updates**: MinIO + minio-init containers, multi-stage Dockerfiles for API and web, .dockerignore, configurable Vite proxy target (API_PROXY_TARGET env var for container networking).
- Decision: **5 system folders auto-created per citizen** on first access: Doctor uploads, AI Chat, Image Analysis, Genomic Analysis, Temporal Analysis. User folders have kind=user.
- Decision: **MinIO public endpoint** kept separate from internal endpoint so pre-signed URLs work for browser downloads (MINIO_PUBLIC_ENDPOINT in .env).
- Decision: **Demo identity cached in-memory** (maps role → first active app_user from DB). Cache clears on restart.
- API tested: demo-login, profile view/update, special category add/end, folder auto-create/create/rename — all working.
- TypeScript: zero errors in both apps.
- Owner: Athun + Claude
- Next step: Push branch, test frontend in browser, resolve MinIO image pull (needs docker login), create PR.
- Status: OPEN

### 2026-10-30 — W5 (early): Full front-end port from Claude Design, design seed data, role APIs
- Done: **All 42 design screens ported** to `apps/web` (React + Tailwind + design tokens): public/auth (14), citizen app (16 pages), doctor (12 sections), nurse, lab, radiology, pharmacist, hospital admin, pharmacy admin, and one shared government console shell used by District, State, Zonal and Central. No placeholder pages are left. Web build passes (`tsc` strict).
- Done: **Database**: migrations 120–129 (events feed with RLS, outpatient, inpatient, lab/imaging, pharmacy ops, admin/surveillance, donation/organ, access/audit, catalogue/HPR/posting fixes). New `public.schema_migrations` ledger in `run_migrations.sh` (re-runs are no-ops; existing DBs only get new files). Design seed `carefusion-db/seed/design/00–80_*.sql` (deterministic `DEMO-` data, generators beside them). `tests/test_rules.sql` passes 278 tests (46 before).
- Done: **API**: new NestJS modules for events, citizen app, doctor, staff (nurse/lab/radiology/pharmacist), hospital admin, pharmacy admin, government consoles, plus citizen medicines/blood/organ. Raw SQL via `RequestDbService` (runs as `cf_app` so RLS applies where the connection allows it).
- Decision: **Live cross-role events** use `engage.event` + polling (3 s), not the prototype's localStorage. Patient-linked events never reach government roles; citizens see only their own.
- Decision: **Canonical data** where the design contradicted itself: Anjali Menon is 35 (DOB 14/02/1991) and an outpatient; Thomas Kurian (Bed 7) and Thomas Varghese are different people; one order-id scheme `ORD-DEMO-NNNN`; Dr Arun Nair HPR `DEMO-HPR-71-0042`; event type `imaging-order`; real-world org names replaced with fictional ones; no Aadhaar digits anywhere (tokens only); table rows win over headline totals. Full list in `carefusion-db/seed/design/IDS.md`.
- Decision: **Demo clock**: seed data is dated 17 Oct 2026; set `DEMO_NOW` in `.env` (see `.env.example`) so "today" screens show data.
- Known gaps: no API for staff/admin password login, password reset, staff activation, HFR/licence verification or file upload (those screens are visual only); block-level admins, front-desk and ASHA accounts have no tables; doctor "one-time key" reuse list is in process memory (needs Valkey); profile-change approval does not yet update the hospital row; no browser check was possible (Chromium libs missing in WSL, Docker Desktop not running at the end of the session).
- Owner: Athun + Claude
- Next step: start Docker Desktop, `docker compose up -d`, run `docker compose --profile seed run --rm db-seed`, click through every role from `/demo-signin`, fix what breaks; open PR `w5-frontend-port` after PR #3 (W4) merges.
- Status: OPEN

### 2026-10-30 — First online deployment (alpha demo)
- Done: **Live at https://carefusion-roan.vercel.app** — one Vercel project holds the built web app (static) and the NestJS API as a single serverless function (`/api/*`), talking to a **Neon Postgres** database (`carefusion-alpha`, Singapore, project `withered-sunset-94638598`) loaded with all migrations and the design seed.
- Done: `scripts/build-vercel.sh` assembles the deploy folder (`.vercel-deploy/`); `apps/api/src/serverless.ts` is the serverless entry; `DB_POOL_MAX` setting for the connection pool. Deploy: `scripts/build-vercel.sh && cd .vercel-deploy && vercel deploy --prod`.
- Decision: **Oracle VM not needed for the alpha.** The API runs on Vercel Functions. Reason: no card/VM, one deploy. Costs: small in-memory caches reset per instance; the doctor one-time-key list is per instance.
- Decision: the Vercel runtime cannot `require()` ES modules, so the deploy build pins `jwks-rsa` 3.x and vendors a CommonJS build of `packages/shared`.
- Setup done on Neon: `GRANT cf_app TO cf_owner WITH SET TRUE` so the API can switch to the restricted role.
- Known gaps: demo mode is on, so anyone with the link can open any role (synthetic data only); file storage (R2) not connected; Keycloak not deployed; repo is under a different GitHub account than Vercel's link, so deploys are from the CLI, not on push.
- Owner: Athun + Claude. Status: DONE (alpha)

## 2026-10-31 — Security hardening pass 1
- **Topic:** Audit of code and live site, then five fixes.
- **Decision:** (1) pnpm overrides for multer 2.5, lodash 4.18, body-parser 1.20.9, qs 6.16 (24 advisories down to 6). NOT done, on purpose, because each is a major upgrade: NestJS 11 (moderate), Zod 4 (one high, memory use on huge arrays; body size is capped), react-router 7 (moderate, SSR-only plus a backslash open redirect). (2) `POST /admin/approvals/escalate` needs the `x-cron-secret` header and stays closed when `CRON_SECRET` is unset. (3) Security headers on the API and web (CSP, X-Frame-Options, nosniff, referrer and permissions policy), CORS limited to the web origin, no X-Powered-By. (4) Uploads limited to PDF, images, Word, text, CSV and DICOM, and the file's first bytes must match the claimed type. (5) The wrong-code limiter moved to the database (migration 131, hashed client address) so it holds across serverless instances.
- **Reason:** Audit findings; demo mode lets anyone with the access code act as any role, so the code gate and upload paths matter.
- **Owner:** Athun + Claude. **Next:** browser click-through of all roles; real staff/admin login (removes demo-mode role switching); decide on NestJS 11 / Zod 4 upgrade. **Status:** done pending deploy.

## 2026-10-31 — Run the API function in Singapore (sin1)
- **Topic:** Click-through of all 12 roles on the live site found no broken screens, but API calls took 2–5 s each and some admin pages were still loading after 8 s.
- **Decision:** Pin the Vercel function to `sin1` in the generated `vercel.json`, next to the Neon database (ap-southeast-1). It had been running in `iad1` (Washington DC), so each database round trip crossed the world.
- **Reason:** One request makes several database round trips (begin, set role, set clock, query, commit), so distance multiplies. Measure again after deploy.
- **Owner:** Athun + Claude. **Status:** merged, awaiting deploy.

## 2026-10-31 — Security review for the alpha, fixes in PRs #10 and #11, QA test plan
- **Topic:** White-box security review of the API, web app and live site (two passes), plus a full QA test plan for an external tester working on the live site. Reports: `docs/18_SECURITY_REVIEW.md`, `docs/17_QA_TEST_PLAN.md` and the PDF `docs/CareFusion-AI-QA-Test-Plan.pdf`.
- **Decision:** Fixed what matters for an alpha on synthetic data. (PR #10) A typed 6-digit doctor key now needs the patient's ABHA number and five wrong keys in ten minutes lock that doctor and address (counter in `util.access_attempt`; the QR text is unchanged); `/health` is served by the API on Vercel; CI runs `pnpm audit` (fails on critical); CI now applies the demo seeds before the database rule tests (they had failed on `main` since PR #5; 278 passed on a scratch database). (PR #11) The open `POST /events` endpoint refuses citizens writing to staff and limits each account to 10 notices a minute; CSV exports prefix a quote to cells starting `=`, `+`, `-`, `@`; compose ports bind to `127.0.0.1`; the not-null database error no longer returns database text.
- **Not done, on purpose:** `ACCESS_KEY_SECRET` is not set to a random value (Athun: the access code is only a demo gate and the site is an alpha); the `access-control-allow-origin: *` on static files (Vercel default, harmless); JWT audience check and the demo bearer token (wait for real login). Items that matter only once there is real data or real users (demo mode with every role open, client-trusted OTP and face proof at registration, a general rate limiter, row-level security failing open, admin services running outside row-level security, person-id ownership at registration, upload scanning) are written down in `docs/18` and wait for the real-login work.
- **Reason:** The alpha holds synthetic data only, so the goal is to keep the demo credible (the consent key must not be guessable) and to stop cheap abuse, not to harden for real patients yet.
- **Owner:** Athun + Claude. **Next:** hand the QA plan to the tester; real staff/admin login; automated cross-hospital API tests; the zod, Nest 11 and react-router 7 upgrades. **Status:** DONE (deployed to the live site).

## 2026-10-31 — Fixes from the write-path click-through; infrastructure notes
- **Topic:** Write-path crawl on the local stack (about 600 button clicks, forms filled and submitted, every role up to State Admin at the time of writing).
- **Decision:** (1) Fixed Export CSV on the gov Reports page: the API replies `{ export, content }` but the page used the whole reply as the export, so the download went to `/exports/undefined/download`. (2) "Add staff" (hospital admin) and "Add registered person" (pharmacy admin) no longer ask for a UUID: new `GET /api/v1/admin/people-search?q=` (hospital and pharmacy admins only, 3+ characters, 8 hits, ABHA shown as last four only, each search audited without the search text) and a shared `PersonPicker`. (3) Radiology "Book slot" 409 is correct ("That time slot is already taken"), not a bug.
- **Infrastructure notes (not in git):** the Vercel function now runs in `sin1` (in `scripts/build-vercel.sh`); `DB_POOL_MAX` is 6 in Vercel production settings (was 3). Measured slowest API call: citizen home 5.1 s to 1.6 s, central admin overview 4.0 s to about 1 s.
- **Owner:** Athun + Claude. **Status:** PR open.

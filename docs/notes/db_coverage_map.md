# DB coverage map: migrations 000–110 vs design screens

## 0. Headline findings
- 86 base tables plus 4 partition defaults, 7 views and 4 `report.*` views, in 12 schemas plus `report`. The schema is strong on identity, access, records, audit and pharmacy core. It is thin on everything the staff portals and admin consoles show.
- Entire screen areas have no table at all:
  - **Lab and radiology.** There is no test catalogue, specimen, result values, critical-call log, QC or instruments, and no imaging study, rooms or DICOM files. `records.clinical_order` is only a free-text `details` string.
  - **Inpatient.** There is no ward or bed entity (`org.bed_availability` is counts per bed type) and no NEWS/escalation, medication administration record, nursing tasks or notes, or shift handover.
  - **Aggregates and platform.** There is no disease surveillance, population denominators, platform flags, export log or AI model governance.
- **Cross-role events feed.**
  - The screens use a localStorage bus (`CF_BUS`) with types: booking, prescription, lab-order, lab-result, break-glass, alert, vitals-critical, dispensed, complaint, blood-request, vitals, collected. Each event has from/to roles, a title, text and an href.
  - It maps only loosely onto `engage.notification`, which has no read state, no kind, no sender role, no href and no entity link.
- **Citizen tables that exist but are too thin.** Complaints have no ref number, category, severity, timeline or attachments. Chat has only two thread types and no attachments or read receipts. Organ pledge requires hospital, doctor and signed document up front, so the "intent, family informed, signing pending" stages cannot be stored.
- **Conflicts between screens and constraints**
  - Citizen Documents shows folder Rename and Delete, and a folder colour. `records.folder` has a `folder_no_delete` trigger, a rename-only trigger and no colour column.
  - Hospital admin break-glass review window is 72 h on the screens. The DB has `emergency_access.central_due_at = now()+24h`, and there is no hospital-review stage.
  - Citizen access history is "kept 7 years" and the audit log retention is "10 years". The DB has no retention setting.
  - `ai.ai_review.verdict` allows only agree/disagree. The doctor image screen has Accept / Edit finding / Reject.
  - `pharmacy.prescription.document_id` and `signature_ref` are NOT NULL. The doctor "Save draft" has no row to live in.
  - `engage.chat_thread.thread_type` allows only `doctor_followup` and `blood_donor`. The screens show pharmacist, hospital desk, lab and health-dept threads.
- **Seed**
  - `generate.py` covers only org, people and accounts, bed counts and one consent.
  - It produces no medicines, stock, vitals, appointments, orders, prescriptions, alerts and so on, so almost no screen has data.
  - It also drifts from the design personas and from the counts in docs/11 §17 (see §4).

## 1. Existing schema.table with columns (compact)
Common to many tables: `id uuid` (PK, `util.uuid_v7`) unless stated; `created_at`/`updated_at` are omitted where trivial. Triggers noted: IMM = immutable, APP = append/supersede only, NODEL = no delete.

**geo**
- `zone(id smallint, name)`
- `state(id smallint, code, name, is_ut, zone_id, zone_changed_by, zone_changed_at)`
- `district(id, state_id, name, lgd_code, boundary, centre)`

**org**
- `hospital_type(code, name, is_active)`
- `bed_type(code, name, is_active)`
- `hospital(id, hfr_id, name, ownership, hospital_type, district_id, address, location, geofence, licence_no, phone, email, timings jsonb, status, approved_by, approved_at)`
- `department(id, hospital_id, name, is_active)`
- `bed_availability(hospital_id, bed_type, total, free, updated_by, updated_at)`: aggregate counts only.
- `pharmacy(id, licence_no, name, pharmacy_type, linked_hospital_id, district_id, address, location, opening_hours jsonb, stock_source, status, approved_by, approved_at)`

**identity**
- `person(id, full_name, date_of_birth, sex, aadhaar_token, abha_number, abha_address, pan_token, phone_enc, phone_hash, email_enc, email_hash, enc_key_id, photo_key, kyc_status, face_check_status, identity_locked_at, registered_by_user_id, deceased_at)`
- `app_user(id, person_id, account_type, keycloak_sub, status, status_reason, activated_at, deactivated_at)`
  - Account types: citizen, doctor, staff, hospital_admin, pharmacy_admin, pharmacist, district_admin, state_admin, zonal_admin, central_admin.
- `citizen_profile(person_id, preferred_language en|ml|hi, address_enc, district_id, approx_location, blood_group, organ_donor_status, guardian_person_id, guardian_consent_at, handover_due_on, handed_over_at, health_card_issued_at, ai_research_opt_in)`
- `special_category_type(code, name, is_active)`
- `special_category(id, person_id, category_code, other_text, status text, set_by_user_id, set_at, ended_at)`
- `emergency_contact(id, citizen_person_id, contact_person_id, relation, priority, added_at, removed_at)`
- `emergency_code(person_id, code_hash, set_at, failed_attempts, locked_until)`
- `device(id, user_id, platform, device_name, key_secret_enc, enc_key_id, bound_at, last_seen_at, revoked_at, revoked_reason)`
- `doctor_profile(user_id, hpr_id, council_name, council_reg_no, specialisation, degrees jsonb, hospital_id, department_id, employment_type, employee_proof_doc_id, signing_method, duty_hours jsonb, hpr_verified_at)`
- `doctor_posting_history(id, user_id, hospital_id, department_id, valid tstzrange, changed_by)`
- `staff_profile(user_id, hospital_id, department_id, staff_role nurse|lab|radiology, created_by_user_id)`
- `hospital_admin_profile(user_id, hospital_id, photo_id_doc_id, authorisation_doc_id, licence_doc_id, employee_id_doc_id)`
- `pharmacy_admin_profile(user_id, pharmacy_id)`
- `pharmacist_profile(user_id, pharmacy_id, registration_no, created_by_user_id)`
- `consent_record(id, person_id, purpose, notice_version, given_by_person_id, granted_at, withdrawn_at, details)`: withdraw-only, NODEL.

**admin**
- `admin_post(id, user_id, level, zone_id, state_id, district_id, jan_parichay_ref, valid, handed_over_to_user_id)`
- `approval_rule(subject_type, step, approver_level, time_limit, escalate_to_level, needs_two_persons)`
- `approval_request(id, subject_type, subject_user_id, subject_person_id, subject_hospital_id, subject_pharmacy_id, step, assigned_level, assigned_zone_id, assigned_state_id, assigned_district_id, status, submitted_at, due_at, escalated_at, escalated_to_id, decided_by_user_id, second_approver_user_id, decided_at, reason, check_results jsonb)`
  - Status values: pending, approved, rejected, escalated, cancelled.
  - Subject types: doctor, hospital_admin, pharmacy_admin, hospital, pharmacy, zonal_admin, state_admin, district_admin, flagged_citizen, flagged_doctor.
- `account_flag(id, subject_person_id, subject_user_id, reason, details, raised_by_user_id, raised_at, approval_request_id, status)`
- `suspension(id, user_id, reason, suspended_by_user_id, second_approver_user_id, valid, lifted_by_user_id)`
- `unusual_pattern_alert(id, area_level, zone_id, state_id, district_id, alert_type, details, status, closed_by, closed_at)`
- `death_record(person_id, date_of_death, source, recorded_by_user_id, certificate_doc_id, recorded_at, family_notified_at, notto_notified_at)`
- `rating_rule(code, description, value)`
- `blood_eligibility_rule(code, value, verified)`

**access**
- `admission(id, patient_person_id, hospital_id, ward text, admitted_at, discharged_at, granted_by_person_id, consent_id)`
- `admission_team(admission_id, user_id, team_role doctor|nurse, added_at, removed_at)`
- `access_session(id, patient_person_id, user_id, mode, key_token_id, admission_id, started_at, expires_at, ended_at, ended_by, start_inside_geofence, reason, is_family_member)`
  - Modes: key, card_otp, admission, emergency_contact, emergency_aadhaar_fallback, break_glass.
  - Only ended_at/ended_by can change; NODEL.
- `emergency_access(session_id, contact_person_id, approved_on_contact_phone_at, fallback_used, break_glass_reason, district_review_status/reviewer/at, central_verify_status/verifier/at, central_due_at, patient_notified_at)`
- `location_check(id, session_id, checked_at, point, ip_area, inside_geofence, distance_m, reason)`: partitioned, IMM.
- `misuse_case(id, session_id, found_by_user_id, finding, suspension_id, council_reported_at, council_ref, patient_informed_at)`

**records**
- `folder(id, patient_person_id, parent_folder_id, name, kind, created_by_user_id, created_in_session_id)`: rename-only, NODEL. Kinds: user, doctor_uploads, ai_chat, image_analysis, genomic_analysis, temporal_analysis.
- `document(id, patient_person_id, folder_id, title, doc_type, storage_key, body_enc, mime_type, size_bytes, sha256, enc_key_id, is_self_reported, created_by_user_id, session_id, order_id)`: IMM.
- `document_move(id, document_id, to_folder_id, moved_by_user_id, moved_at)`: IMM.
- `highlight(id, document_id, user_id, anchor, note, colour, session_id)`: IMM.
- Fact tables (APP, share `source`, `recorded_by_user_id`, `recorded_at`, `superseded_by`, `fhir`):
  - `allergy(substance, substance_code, reaction, severity, status, session_id)`
  - `condition(code_system, code, name, is_chronic, onset_date, status, session_id)`
  - `medication_current(medicine_id, free_text, dose, since, until, status, session_id)`
  - `immunization(vaccine, dose_number, given_on, hospital_id)`
  - `procedure_stay(kind, description, hospital_id, from_date, to_date)`
  - `family_history(relation, condition_name, condition_code)`
  - `lifestyle(smoking, alcohol, since)`
- `clinical_order(id, patient_person_id, ordered_by_user_id, session_id, admission_id, hospital_id, department_id, order_type vitals|lab|scan|vcf, details text, status open|in_progress|done|cancelled, due_at, completed_by_user_id, completed_at)`
- `vital_observation(id, patient_person_id, code LOINC, value_num, unit, effective_at, source, device_kind, recorded_by_user_id, order_id, admission_id, recorded_offline, synced_at, entered_in_error, fhir)`: partitioned monthly.
- `dated_event(id, patient_person_id, event_type, starts_at, ends_at, title, source_table, source_id, set_by_user_id, status)`
  - Event types: appointment, past_visit, medicine_dose, refill_due, vaccination_due, test_due, checkup_due, blood_donation_eligible, treatment_session, prescription_expiry, follow_up.
- `referral(id, patient_person_id, from_user_id, to_user_id, to_hospital_id, note_document_id, status)`

**ai**
- `ai_run(id, patient_person_id, tool symptom_chat|image|genomic|temporal|citizen_guidance_chat, folder_id, run_by_user_id, session_id, input_document_ids[], input_enc, output_enc, enc_key_id, model_name, model_version, is_simulated, status, disagreement_report, started_at, finished_at, result_sha256)`: IMM, RLS.
- `ai_hypothesis(id, run_id, rank 1..3, label, code_system, code, confidence, evidence_status, ranking_score)`
- `ai_evidence(id, hypothesis_id, source_type, source_ref, store, relevance)`
- `ai_review(run_id, doctor_user_id, verdict agree|disagree, reason, reviewed_at)`

**pharmacy**
- `medicine(id, generic_name, form, strength, schedule, atc_code, is_active)`
- `drug_interaction(medicine_a_id, medicine_b_id, severity, note, source)`
- `prescription(id, patient_person_id, doctor_user_id, session_id, hospital_id, issued_at, valid_until, document_id, signature_method, signature_ref, qr_token, status issued|partly_dispensed|dispensed|expired|cancelled)`
- `prescription_item(id, prescription_id, medicine_id, dose, frequency text, duration_days, quantity, instructions, allergy_warning_shown, interaction_warning_shown, override_reason)`
- `prescription_delivery(id, prescription_id, pharmacy_id, sent_by, patient_agreed_at, sent_at, received_at)`
- `stock_item(id, pharmacy_id, medicine_id, batch_no, expiry_date, quantity, unit_price, low_threshold, source, updated_at)`
- `dispensing(id, prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id, substitute_medicine_id, note_to_doctor, dispensed_at)`: a trigger decrements stock and updates the prescription status.
- `controlled_drug_register(id, dispensing_id, pharmacy_id, schedule, patient_name, patient_address, doctor_name, doctor_reg_no, medicine_name, quantity, entry_at)`
- `software_link(pharmacy_id, vendor, api_client_id, secret_ref, last_sync_at, last_sync_status)`

**donation**
- `blood_donor(person_id, ready, eligible_from, eligibility_checked_at, last_donation_at)`
- `blood_donation(id, donor_person_id, donated_at, hospital_id, recorded_by_user_id)`
- `blood_request(id, requested_by_user_id, patient_person_id, blood_group, units, hospital_id, urgency, status, closes_at)`
- `blood_request_response(request_id, donor_person_id, alerted_at, response will_donate|cannot, responded_at)`
- `organ_pledge(id, person_id, organs text[], pledged_at, hospital_id, witnessing_doctor_user_id, document_id, verification_status, notto_ref, withdrawn_at)`

**engage**
- `appointment_slot(id, hospital_id, department_id, doctor_user_id, during tstzrange, capacity)`
- `appointment(id, slot_id, citizen_person_id, status requested|confirmed|rejected|cancelled|completed|no_show, requested_at, decided_by_user_id, decided_at)`
- `rating(id, rater_person_id, target_type doctor|hospital|pharmacy, target_id, stars, comment, moderation_status, moderated_by, moderated_at)`
- `rating_reply(id, rating_id, author_user_id, body)`
- `complaint(id, raised_by_person_id, about_type, about_id, district_id, body, status open|assigned|resolved|closed, assigned_to_user_id, resolution)`
- `chat_thread(id, thread_type doctor_followup|blood_donor, patient_person_id, doctor_user_id, blood_request_id, donor_person_id, closed_at)`
- `chat_message(id, thread_id, sender_user_id, body_enc, enc_key_id, sent_at, blocked, block_reason, reported_at)`: partitioned.
- `notification(id, user_id, channel push|sms|email, template_code, payload jsonb, status queued|sent|failed|delivered, created_at, sent_at)`: partitioned.
- `health_alert(id, issued_by_user_id, scope national|state|district, state_id, district_id, severity normal|emergency, category, title, body, starts_at, ends_at)`
- `alert_mute(user_id, category, muted_at)`

**audit**
- `chain_tip(stream_id, last_seq, last_hash, updated_at)`
- `activity_log(seq, stream_id, occurred_at, user_id, account_type, action, entity_type, entity_id, patient_person_id, session_id, ip, ip_area, gps_point, device_id, user_agent, details, prev_hash, row_hash)`: partitioned, hash-chained, IMM.
- `chain_head(day, stream_id, last_seq, last_hash, exported_to)`
- `log_view_grant(id, state_admin_user_id, granted_by_user_id, scope jsonb, valid, reason, revoked_at)`

**Views and functions**
- `access.v_access_history`, `access.v_emergency_basic`
- `pharmacy.v_stock_status`, `pharmacy.v_near_expiry`, `pharmacy.find_medicine()`
- `engage.v_rating_summary`, `engage.v_alert_recipients_rule`
- `admin.v_overdue_approvals`
- `report.v_district_daily_sessions`, `report.v_district_shortages`, `report.v_district_beds`, `report.v_emergency_access_by_district`
- `donation.matching_donors()`, `access.inside_geofence()`, `pharmacy.receive_by_qr()`, `audit.log()`, `audit.verify_chain()`

**RLS** is enabled only on the records, `pharmacy.prescription` and `ai.ai_run` tables. The `engage`, `donation`, `identity` and `org` tables rely on API-layer checks.

**Out of Postgres by design (docs/11 §16):** passwords, MFA and hardware keys (Keycloak); the rotating-key used-list, OTPs and rate limits (Valkey); files (R2). Items below marked KC/Valkey are not DB gaps.

## 2. Screen group → data shown → table(s) or MISSING

Legend: OK = covered; PART = partly covered (gap named); MISSING = no table or column.

### 2.1 Public / auth

| Screens | Data shown | Coverage |
|---|---|---|
| Main, Splash, NotFound, AccessDenied | Static marketing; the 403 page shows a reference and writes to the audit log | `audit.activity_log` OK. No error-reference field (put it in `details`). |
| Login, StaffLogin, AdminLogin, DemoSignIn | Role pick, 2FA, security key, `auth.demo_login` audit | KC / Valkey. Audit OK. Lockout counters (5 failures, 15 min lock) are KC. Admin "scope" comes from `admin.admin_post` OK. |
| Recovery | Password reset and lost phone | `identity.device` revoke + `revoked_reason` OK. Help-desk and ASHA locations list: MISSING. Recovery case (in person, assisted) log: MISSING. |
| RegisterCitizen | 7 steps: consent, details, Aadhaar token, face, ABHA, health profile, approval timeline | `consent_record`, `person`, `citizen_profile`, `emergency_contact`, `emergency_code`, `approval_request`, `account_flag`, guardian fields OK. Draft or in-progress registration state: MISSING (API-held). Minor birth-certificate doc: `records.document` OK. Registration channel (app / help desk / ASHA %): `person.registered_by_user_id` PART (no channel column). |
| RegisterDoctor | Citizen link, HPR check, degrees, workplace and proof, e-Sign, status chain | `doctor_profile` (degrees jsonb), `approval_request` (`check_results`), `document` OK. Rejection "re-upload one document" keeps other checks: PART (no per-document check status). |
| RegisterHospitalAdmin | HFR lookup, 4 documents, submit | `hospital`, `hospital_admin_profile` (4 doc FKs), `approval_request` OK. Beds 240 / linked pharmacy shown: derive. |
| RegisterPharmacyAdmin | Type, licence check, drug licence copy, photo ID, hours, weekly closed day | `org.pharmacy` (type, `opening_hours`) OK. `pharmacy_admin_profile` has no document columns for licence copy or photo ID: MISSING. Licence validity date: MISSING. |
| StaffActivation | Invitation (staff ID, ward, link expiry), password, TOTP | MISSING: `staff_invite` (token, expiry, accepted_at). `staff_profile` lacks `employee_code` and ward. |

### 2.2 Citizen (15 pages)

| Page | Data shown | Coverage |
|---|---|---|
| Citizen (shell) | Unread badge, toast, activity link | **Events feed:** `engage.notification` PART. No `read_at`, kind, sender role, href or entity link, and no in-app channel. MISSING. |
| CitizenHome | Rotating key + QR, live session timer, emergency card, dates, today's doses, documents, alerts, BP 30-day sparkline, blood and organ cards, access history, "connected apps" feed, prescription journey (prescribed, sent, ready, collected) | Key: `device` OK (+ Valkey). Session: `access_session` + `v_access_history` OK. Emergency card: `v_emergency_basic` PART (shows no conditions or special category). Dates: `dated_event` OK. Doses: MISSING dose log. Vitals: `vital_observation` OK. Feed: see above. Journey: `prescription` + `prescription_delivery` + `dispensing`. No "ready" or "collected" state or timestamp: MISSING. Profile completeness: derive. Weather: external. |
| CitizenProfile | ABHA/Aadhaar, health profile (blood group, height, weight, allergies, conditions, surgeries, smoking, disability), special-category request flow (request, lab proof, district review, card issued), emergency contacts, family and guardian links, address, nearest PHC, language | `person`, `citizen_profile`, `allergy`, `condition`, `procedure_stay`, `lifestyle`, `emergency_contact`, `special_category` OK. Height and weight: no column (a vital with a LOINC code would work, but the "self-reported until a doctor confirms" label comes from `source`, which exists). Special-category request workflow: PART (`status` is free text; no request, proof or district approval; the `approval_subject` enum lacks it). Adult family links ("can show your key for you"): MISSING (only minor `guardian_person_id`). Linked family switch: MISSING. Card issued: `health_card_issued_at` OK. |
| CitizenCare | Find doctors or hospitals (distance, fee, language, next slot, govt/private, gender, telemedicine), slot picker (day, time, full), booking modal (token, ref, fee), upcoming and past visits | `hospital`, `doctor_profile`, `appointment_slot`, `appointment` PART. MISSING: doctor languages, fee, gender, walk-in, telemedicine flag; slot type; appointment token number, reason, booking ref and visit type; hospital services. Past visits: `dated_event` / `access_session` PART. |
| CitizenDates | Month and list calendar, kinds (appointment, refill, test, donation, vaccine, alert), add personal reminder with repeat, phone-calendar sync | `dated_event` OK. Personal reminder type, repeat rule, snooze, reminder time: MISSING. Calendar-sync feed token: MISSING. |
| CitizenMedicines | Today's dose slots with tick, active prescriptions (RX number, items, "n left", valid until, allergy-check passed), signed / verified / ready / refill timeline, interaction check, refill reminders, pharmacy queue (token, "3 ahead"), message pharmacist, medicine finder with price | `prescription`, `prescription_item`, `v_stock_status`, `find_medicine()` OK. MISSING: dose schedule and dose log; patient-held supply count; RX human number; pharmacist-verified timestamp and ready / collected status; pharmacy queue token; pharmacist chat thread; Jan Aushadhi flag. "Interaction check" result: stored per item only as boolean flags (PART). |
| CitizenVitals | Latest BP, sugar, weight, SpO2, temp; add reading (kind, when, note); 30-day, 8-week and 12-week series; BMI; HbA1c; target range set by the doctor; out-of-range alert to the doctor | `vital_observation` OK (LOINC code, `source=self_reported`). MISSING: per-patient target / threshold ranges set by the doctor; reading note and "measured when" context (sugar fasting / random, temp site); height / goal weight; devices list ("coming soon"). The out-of-range doctor alert is an event, see the feed. |
| CitizenDocuments | Folders (system plus custom with colour, rename, delete, drag-move), grid and list, doc cards (source, signed state, "new", plain-language AI summary), upload with virus scan and OCR, storage by category, "arrived through lab order" link | `folder`, `document`, `document_move` OK. CONFLICT: folder delete (trigger forbids), folder colour (no column). MISSING: document read / "new" flag, AI plain-language summary, signature description (lab seal / e-Sign), OCR text index, sensitivity class (mental health / genomic), storage-quota counter. Lab folder category: `doc_type` OK. |
| CitizenAccess | Key + QR, active session, session items viewed, folders-shared toggles (lab, Rx, vitals, imaging, genomic, mental health), access history (doctor, lab, radiology, pharmacist, nurse, break-glass), trusted family, report an open | `access_session`, `v_access_history`, `emergency_access` OK for doctors and break-glass. PART: lab, radiology, pharmacist and nurse rows come from order, scan or admission events, not `access_session`; only `audit.activity_log` (not citizen-readable) holds them. MISSING: per-category share preferences; items-viewed-in-session list (activity_log action `document.view` exists but is not exposed); "report an open" (`complaint.about_type` lacks `access_session`); trusted family; second-doctor confirmation. |
| CitizenAlerts | Alert list by category (Emergency / Health dept / My care / System), unread filter, mark-all-read, notification preferences, "in your area" | `health_alert`, `v_alert_recipients_rule`, `alert_mute` OK for broadcast. MISSING: per-user read state; category taxonomy (alerts / updates / reminders); per-channel preference matrix; issuer organisation name (only `issued_by_user_id`). |
| CitizenComplaints | File (category, place, severity: normal / urgent / safety, text, attachments), list by ref (CMP-0412), 3-stage timeline with log, reopen, helpline | `complaint` PART. MISSING: `ref_no`, category, severity, hospital / pharmacy FK, attachments, status-history log, SLA `due_at`, reopen. |
| CitizenMessages | Threads (doctor, appointments desk, lab, radiology, health dept) with unread, attachments, "end-to-end encrypted", book visit | `chat_thread`, `chat_message` PART (`body_enc` OK). MISSING: other thread types, participants / staff or org senders, read receipts and unread counts, attachments. |
| CitizenAIChat | Multi-turn chat with sources, "what the AI can see", red-flag stop (108), earlier chats, share with doctor | `ai_run` (`tool=citizen_guidance_chat`, locked, one row per run) PART. MISSING: chat session / message tables (title, message count, per-turn source, red-flag trigger, shared-with-doctor flag). `ai_run` requires `folder_id`, so the AI Chat folder is OK. |
| CitizenBlood | Donor status and ID (DEMO-BD-KL-…), pause toggle, 90-day countdown, requests near you (urgent, camp), respond / withdraw, donation history (type, Hb, camp), impact stats, tier, blood-bank stock, pre-donation checklist (age, weight, diabetes, illness) | `blood_donor`, `blood_request`, `blood_request_response`, `matching_donors()` OK. MISSING: donor code; donation type (whole / platelets), Hb, camp; camps and camp pledge; blood banks and stock by group; weight / health checklist inputs; "notify my circle" share. `blood_donation.hospital_id` is NOT NULL, so camps cannot be recorded. |
| CitizenOrgan | 4-step pledge (intent, family informed, sign at hospital, registered with KNOS), organ list, donor card, witnesses (2, one relative, link expiry), next-of-kin notice, withdraw | `organ_pledge` PART: hospital, doctor and document are all NOT NULL, so unsigned stages are impossible. MISSING: pledge status steps, witnesses, next-of-kin notice, KNOS submission status. |
| CitizenReviews | Public reviews with filters (location, department, stars), distribution, verified-visit gate, helpful votes, hospital replies, my reviews, write review | `rating`, `rating_reply`, `v_rating_summary` OK. MISSING: department context, verified-visit link (rule only checks ABHA, not a completed visit), helpful votes, aspect tags, abuse reports, star distribution (derive). |
| CitizenSettings | Language, text size, password age, 2-step, "face check on new devices", devices list (name, place, last seen, sign out), notifications, privacy sharing, data export (ZIP/FHIR), account deletion (30-day grace) | `preferred_language`, `device` PART (no location or browser sessions). MISSING: UI preferences, face-check setting, notification and sharing preferences, data-export request, deletion request. Password / 2FA are KC. |

### 2.3 Doctor

| Data shown | Coverage |
|---|---|
| Open patient by key, 30-min session, recent sessions, keys entered, emergency uses | `access_session` / `emergency_access` OK. |
| Today's OP queue: token, name, wait, status, priority, check-in, call-in, average wait, no-show, clinic pace | `appointment` PART. MISSING: token no., check-in time, called time, priority, walk-ins, queue state. |
| "Waiting for your review": lab results, AI results | AI results: `ai_run` + `ai_review` OK. Lab results: MISSING (no result entity, no review task or acknowledgement). |
| Alerts: critical K⁺ flagged by lab, referral accepted by Medical College | Critical call: MISSING. Referral status: `referral` OK. A clinical-alert entity: MISSING. |
| Connected-apps feed | Events feed MISSING (see §3). |
| Patient timeline, at-a-glance (BP, HbA1c, BMI, SpO2, meds, docs) | `records.*`, `vital_observation` OK. |
| Clinical AI chat, image viewer + Accept / Edit / Reject, pharmacogenomic panel, temporal charts | `ai_run`, `ai_hypothesis`, `ai_evidence`, `ai_review` PART. `ai_review.verdict` has no "edited" value or edited text. DICOM study / series entity: MISSING. Lab analyte series (HbA1c, LDL) have no home except `vital_observation` codes (PART). Doctor chat message log: MISSING. |
| Prescription builder: allergy block, interaction check, stock check, eGFR, draft, e-sign, send to pharmacy | `prescription` (+items, delivery), `drug_interaction`, `v_stock_status` OK. Draft state: MISSING (`document_id`, `signature_ref` NOT NULL; status enum has no `draft`). |
| Break-glass: reason category, ≥20 chars, 15-min window, unidentified patient matched by face + fingerprint, notify admin / contact / patient, past uses | `emergency_access.break_glass_reason` PART. MISSING: reason category, unidentified-patient identity, match method, hospital-admin review stage, contact-notified time. `access_session.patient_person_id` is NOT NULL, so an unknown patient has no row. |
| Referral and shift handover (patients, watch / pending / transfer, AI draft, approve, send at 17:00) | `referral` OK. Handover: MISSING. |
| Orders: lab and radiology (priority, tests) | `clinical_order` PART (free text, no priority, no test items). Test catalogue MISSING. |
| Donors: find near hospital, blood-bank stock, organ lookup (restricted to transplant coordinators after brain-stem death) | `matching_donors()`, `organ_pledge` PART. Blood-bank stock MISSING. Transplant-coordinator role, brain-stem-death certification and lookup log: MISSING. |
| Pharmacy stock check | `v_stock_status` OK. |
| Schedule and availability (OP clinic / teleconsult / ward round blocks, week view) | `appointment_slot`, `doctor_profile.duty_hours` PART. Block type: MISSING. Teleconsult: MISSING. |
| Messages with patients | `chat_thread` (`doctor_followup`), `chat_message` PART (no unread, no attachments). |
| Profile: HPR, council reg, years, languages, rating, tags ("explains clearly"), consult stats | HPR / council: OK. Rating: `v_rating_summary` OK. Languages, years of experience, tags, teleconsult stats: MISSING. |
| Settings: 2-step, e-Sign linked, devices | `signing_method`, `device` OK; KC for 2-step. |

### 2.4 Nurse

| Data shown | Coverage |
|---|---|
| Ward 3 bed board: bed numbers, patient, status (stable / watch / critical), occupancy 22 of 24 | MISSING ward and bed entities. `access.admission.ward` is text; `bed_availability` is counts per bed type and not per department. |
| Open chart via admission mode (2-h session), diet, mobility, IP number, diagnosis, treating doctor | `admission`, `admission_team`, `access_session` (mode `admission`) OK. IP number, diet, mobility, bed, diagnosis: MISSING columns. |
| My tasks, task times, workload % | MISSING nursing task. |
| New orders queue: priority (STAT), accept / reject, status | `clinical_order` PART. MISSING: priority, accepted_by / at, rejected reason, assigned nurse. |
| Record vitals set with live NEWS, escalation (score 7 to doctor / rapid response), history grid | `vital_observation` OK for values. NEWS score and escalation chain: MISSING. |
| Medication round: scan band and drug, dose given / withheld / refused with reason, due list, overdue | MISSING inpatient medication orders and administration record. `clinical_order.order_type` has no medication value. |
| Handover notes (SBAR), open items at handover, sign handover, watch list | MISSING. |
| Today's notes (timestamped nursing notes) | `records.document` (`doc_type=text_note`) PART (immutable; no SBAR structure or note-to-bed link). |
| Ward stock (insulin pens), request from pharmacy | MISSING. |
| Alerts (RRT paged, overdue dose, abnormal lab, ward notices such as fire drill), escalation chain config | Events feed and alert entity MISSING; ward notices MISSING. |
| Nurse registration number (KL-NC-…), charge nurse, shift (07:00–15:00), breaks | MISSING `staff_profile` columns and shift tables. |

### 2.5 Lab technician

| Data shown | Coverage |
|---|---|
| Worklist: order ID (LO-55120), patient, tests, from, STAT first, accept / reject | `clinical_order` PART. MISSING: test items, order reference, priority, accept / reject. |
| Find order (order-scoped patient lookup) | RLS `staff_queue` OK. |
| Sample collection: barcode, tubes, labels, fasting, collector, send-by, checks, reject sample (haemolysis) | MISSING specimen / tube. |
| Result entry: analyte, value, unit, ref range, flag, delta check, draft, verify and release, flags to ordering doctor | MISSING result and result-value tables. A released PDF can be a `document` linked by `order_id`. |
| Critical-value call log (value, who was called, read-back) | MISSING. |
| Upload report to order; status Sent / Delivered / Awaiting e-sign / Preliminary | `document.order_id` PART. Documents are immutable, so state needs a separate result record. |
| QC (Levey–Jennings, Westgard), instruments (Sysmex, calibrate), reagent lots, turnaround stats, median TAT, STAT minutes | MISSING. TAT is derivable once order timestamps exist (only `created_at` and `completed_at` exist). |
| Handover notes | MISSING (shared handover table). |

### 2.6 Radiology technician

| Data shown | Coverage |
|---|---|
| Imaging worklist: modality, body part, priority, status, from doctor | `clinical_order` PART (`order_type=scan`, free text). |
| Study console: viewer params, kVp / mAs / DAP dose, operator, prior links, checklist, send to reporting doctor, clinical note, contrast | MISSING imaging study, image files, exposure, prior-study link. |
| Upload DICOM / zip to order, burned-in-name check, wrong-patient withdraw within 24 h with reason | `document` PART (immutable, no withdraw state). MISSING. |
| Rooms and equipment status (CT 1, USG 2, DR 1, MRI down), service dates, flat-field calibration | MISSING. |
| Schedule by room and hour, MRI reschedule with SMS | MISSING room schedule. SMS: `notification` OK. |
| Team on shift, handover | MISSING. |

### 2.7 Pharmacist

| Data shown | Coverage |
|---|---|
| Dispense queue (token, patient, doctor, items), scan QR | `prescription`, `prescription_delivery`, `receive_by_qr()` OK. Queue token and counter: MISSING. |
| Verification checks (e-signature, QR, HPR, validity, allergy and interactions) | MISSING a stored verification result and verified-by / at. |
| Dispense lines: give quantity, in-stock, substitute with reason, partial balance, SMS to patient | `dispensing` OK (substitute, `note_to_doctor`). Batch override reason: MISSING. SMS: `notification` OK. |
| Medicine history of the patient (dispensed-only), adherence | `dispensing` joined to `prescription` OK; adherence derive. |
| Stock levels, record a delivery, raise indent | `stock_item` PART. Goods receipt, stock movement and indent: MISSING. |
| Expiry watch (≤30 days, 31–90 days), pull-expired action, FEFO pick, override | `v_near_expiry` PART (60 days only; no write-off action). |
| Dispensing log (CSV) | `dispensing` OK. |

### 2.8 Pharmacy admin

| Data shown | Coverage |
|---|---|
| Licence validity (14 Mar 2028), compliance score, inspection dates, documents (drug licence, Fire NOC) | MISSING (`org.pharmacy` has `licence_no` only). |
| Dispensing counts (week, today, 30-day, trend), avg wait | `dispensing` OK (counts); avg wait needs queue data. |
| Public stock finder publishing %, searches found you | MISSING `is_published` per item and a search log. |
| Stock by category, SKUs, value; inventory list (1,248); import CSV; sync from billing every 5 min | `stock_item`, `medicine`, `software_link` PART. MISSING: medicine category, MRP / cost value, sync-run log. |
| Purchase orders (supplier KMSCL, lines, ₹ threshold approval, send back) | MISSING supplier, PO, PO lines, approval. |
| CDSCO recalls (batch blocked at counter, acknowledge) | MISSING recall and batch-block flag. |
| Expiry value by month, KMSCL returns window | `v_near_expiry` PART (no cost value). |
| Pharmacists on shift (counter, fills today, break / off), invite, pending invites, resend / revoke, deactivate | `pharmacist_profile`, `app_user.status` OK. MISSING invites, shift state, counter. |
| Audit log of own team, 7 years | `audit.activity_log` PART. No `pharmacy_id` or `hospital_id` column and no scoped read grant. |

### 2.9 Hospital admin

| Data shown | Coverage |
|---|---|
| Bed occupancy by department, 84%, published to district every 15 min | `bed_availability` PART (per bed type only, no per-department split). |
| Staff approvals (HPR / e-KYC / employment / documents; reject; ask for more documents) | `approval_request` PART. Hospital-level approver level absent from `admin_level` and `approval_rule`; no `more_info` status. |
| Staff directory (198 accounts, 9 departments), invite, bulk import, roster | `staff_profile`, `doctor_profile` OK for the entities. MISSING invites, department head, duty roster. |
| Roles and permissions matrix (national rules fixed, hospital rules editable) | MISSING. |
| Break-glass reviews (reason, what was viewed, evidence, 72-h window, justified / not justified, escalate to district) | `emergency_access` PART. MISSING hospital-review columns; the DB window is 24 h and central-only. What was viewed: needs a citizen-independent audit view. |
| Audit log of the hospital | `audit.activity_log` PART (no hospital column). |
| Hospital profile (HFR, services, timings, map pin), legal change needs district approval | `hospital` PART. MISSING services list and profile-change approval subject. |
| Admissions list | `admission` PART (no bed, department colour or diagnosis). |
| Doctor roster (OP shift / night on-call, coverage gaps, publish) | MISSING. |
| Complaints inbox (category, PRO desk assign, resolve and notify, avg 2.4 d, 7-day rule, unresolved to district grievance) | `complaint` PART (see CitizenComplaints). |
| Reviews: reply, department split, mention tags, abuse report, linked complaints | `rating`, `rating_reply` PART. |
| Staff on duty, doctors 48 / nurses 112 | MISSING attendance or shift. |

### 2.10 District, State, Zonal, Central admin
The four screens share one template; the scope (district, state, zone or nation) is a parameter. Central adds AI model governance.

| Data shown | Coverage |
|---|---|
| Population, registered share, map tiles per child unit | `geo.*` has no population: MISSING. Registered share needs `citizen_profile` × population. |
| Live doctor sessions and peak, KPIs | `report.v_district_daily_sessions` PART (daily, by mode; no live or time-of-day series, no state / zone / national rollups). |
| Disease watch (dengue, fever, lepto; per lakh; baseline; threshold; AI note; response actions) | MISSING surveillance entities. `records.condition` has codes but nothing aggregates them. `admin.unusual_pattern_alert` PART (free-text type). |
| Facility mix and directory | `org.hospital`, `org.pharmacy` OK. |
| Blood stock by group (days of cover), blood banks, donation camps, invite donors | MISSING. `donation.matching_donors()` OK. |
| Organ waiting list (counts, median wait, transplant centres) | MISSING. |
| Approvals inbox (type, priority normal / urgent, age, SLA, funnel, median days, escalated, reminders) | `approval_request`, `v_overdue_approvals`, `approval_rule` OK. Priority and "reminders sent": MISSING. "What we check" list: `check_results` OK. |
| Admin accounts, two-person sign-off (72-h expiry) | `admin_post`, `approval_request.second_approver_user_id`, `needs_two_persons` OK. Expiry window: via `due_at`. |
| Health-alert composer (draft, emergency vs advisory, schedule, SMS, reach estimate, second-admin confirm, sent and scheduled list, zone targeting) | `health_alert` PART. MISSING: status / schedule, second approver, SMS flag, reach count, zone scope. |
| Grievances (assign, escalate, close) | `complaint` PART (no escalation level or history). |
| Flagged audit events (justified / escalate), break-glass trend, access rules (30 min session, 72 h review, 5 failures, retention) | `emergency_access`, `misuse_case`, `audit.*` PART. MISSING flagged-event queue and rule settings. |
| Reports and exports (catalogue, frequency, small-cell suppression <5, export history 30 d) | `report.*` views PART. MISSING export log and definitions. |
| System settings: global flags (maintenance mode, etc.), change history, double confirmation | MISSING. |
| Central: AI model register (version, status, drift, agreement), release requests (shadow run, validation, safety sign-off 2 of 3, rollback at 5% drift), clinician safety reports | MISSING (`ai.ai_run.model_name` / `model_version` are text only). |
| Directory of people and places in scope | Derive from `identity.*` and `org.*`. |
| Field teams / ASHA drives | No ASHA account type. MISSING. |

## 3. Cross-cutting feature coverage

| Feature | Existing | Gap |
|---|---|---|
| Events / notifications feed | `engage.notification` (user_id, channel, template_code, payload, status) | `read_at`, `kind`, `from_role`, `href` / entity link, priority; an `in_app` channel; per-user preference matrix. |
| Vitals series | `records.vital_observation` (LOINC, partitioned) | Doctor-set targets; observation context (sugar timing, temp site); NEWS set grouping; height / goal weight; self-reading "notify doctor" rule outcome. |
| Messages | `engage.chat_thread` / `chat_message` | Thread types (pharmacist, hospital desk, lab, broadcast); participants; attachments; read receipts. |
| Appointments / slots | `engage.appointment_slot`, `appointment` | Token, reason, ref, fee, visit type, check-in / called / completed times, priority, slot type, teleconsult, walk-ins, reminders. |
| Lab orders and results | `records.clinical_order`, `document.order_id` | Whole lab domain (catalogue, items, specimen, results, critical calls, QC, instruments, TAT). |
| Radiology orders and results | same | Imaging study, files, exposure, rooms, schedule, equipment, withdraw. |
| Prescriptions / dispensing | `pharmacy.*` (strong) | Draft; ready / collected; verify record; queue token; override reason; dose schedule and log; RX number. |
| Complaints | `engage.complaint` | Ref, category, severity, hospital link, attachments, event log, SLA, escalation, `access_session` target. |
| Reviews | `engage.rating` / `rating_reply` / `v_rating_summary` | Department, visit link, helpful votes, tags, abuse reports. |
| Alerts | `engage.health_alert`, `alert_mute`, `v_alert_recipients_rule` | Read state, category groups, status / schedule, second approver, SMS, reach, zone scope, issuer org. |
| Stock | `pharmacy.stock_item`, `v_stock_status`, `v_near_expiry` | Movements, receipts, POs, suppliers, recalls, publishing flag, MRP, write-offs, search log. |
| Bed board | `org.bed_availability` (counts) | `ward`, `bed` entities; admission bed link; per-department totals. |
| AI chat | `ai.ai_run` (`citizen_guidance_chat`) | Session / message tables; red-flag marker; share-with-doctor; doctor chat log; `edited` verdict. |
| Break-glass | `access_session` (mode), `emergency_access`, `misuse_case` | Reason category, second doctor, unidentified patient, hospital-review stage (72 h), contact notified, match method. |
| Blood / organ donation | `donation.*` | Donor code; donation type / Hb / camp; blood banks, stock, camps; organ witnesses, steps, next-of-kin notice, KNOS status, waitlist, transplant centre, coordinator role. |
| Access log | `access.v_access_history`, `audit.activity_log` | Citizen-readable view for non-session access (lab, radiology, pharmacist, nurse); items-viewed; share-category preferences; hospital / district columns on the log; retention rule. |
| Settings | `citizen_profile.preferred_language`, `device` | UI prefs, notification and sharing prefs, export and deletion requests, device place. |

## 4. Seed coverage (`seed/generate.py` → `demo_data.sql`)
It runs after the migrations and `110_reference_data.sql`, uses seed 42, and every ID starts with `DEMO-`.

**Generated (counts from `demo_data.sql`)**
- 20 hospitals (Ernakulam and Thiruvananthapuram), each with an HFR ID, licence, geofence and 3–5 departments (80 departments).
- 40 pharmacies (5 per district linked to a govt hospital).
- 2,205 persons and users: 1 central, 1 zonal (South), 1 state (Kerala) and 2 district admins with `admin_post`; 20 hospital admins; 40 doctors; 60 staff (nurse, lab, radiology per hospital); 40 pharmacy admins; 40 pharmacists; 2,000 citizens with `citizen_profile`.
- 60 `bed_availability` rows and 2,205 `privacy_notice` consents.
- Tables written: `org.hospital`, `department`, `bed_availability`, `pharmacy`; `identity.person`, `app_user`, `citizen_profile`, `doctor_profile`, `staff_profile`, `hospital_admin_profile`, `pharmacy_admin_profile`, `pharmacist_profile`, `consent_record`; `admin.admin_post`.

**Not seeded (so most screens would be empty)**
- Reference: `pharmacy.medicine` / `drug_interaction` (no medicine catalogue anywhere, in 110 or the generator), `stock_item`, `special_category` rows, `rating_rule` use.
- Records: `records.*` (no vitals, documents, allergies, conditions, folders, orders, referrals, dated events), `ai.*`, `access.*` (no sessions, admissions, break-glass), `emergency_contact`, `emergency_code`, `device`.
- Engagement and donation: `donation.*`, `engage.*` (appointments, slots, ratings, complaints, chat, notifications, alerts), `pharmacy.prescription`, `dispensing`.
- Admin and audit: `admin.approval_request`, `unusual_pattern_alert`; no `audit.activity_log` rows. Direct inserts bypass `audit.log()`, which is fine for seed data.
- System folders are not created (`records.create_system_folders` is never called), so a citizen cannot save AI runs.

**Differences from docs/11 §17**
- Doctors 40 (target 100); staff 60 (150); pharmacists 40 (60). Admins are 1/1/1/2 (target 1 central, 5 zonal, a few state / district).
- No vitals (~300,000 rows), no AI runs (~2,000), no medicine stock for ~300 medicines. No minors with guardians, no deceased case.

**Seed problems found**
- Names are random. The designs use named personas (Anjali Menon, Dr. Arun Nair, Lekha Pillai, Rahul Varghese, Fathima Beevi, Joseph Mathew, Suma Thomas, Dr. Meera Krishnan, Ajay Kumar, Latha Nair, R. Venkatesh, S. Banerjee) around Pathanamthitta and Kozhencherry. The seeded districts (Ernakulam, Thiruvananthapuram) have no Pathanamthitta anchor, even though `110` loads it.
- Doctors get no companion citizen `app_user` + `citizen_profile`, which `RegisterDoctor` expects ("every doctor is first a verified citizen").
- Persons have `identity_locked_at` set, but phone / email hashes are NULL.
- `demo_uuid()` is an md5 value, not a v7 UUID, so time ordering is lost.
- The 2,000 citizens are all adult (age 18–70).

## 5. Proposed new tables / columns for migration 120+
Group by migration number. Prefix `+` means a new table; `~` means ALTER on an existing table. New schemas `lab`, `imaging` and `surveillance` are proposed.

**120_events_prefs**
- `~ engage.notification`: add `kind text`, `from_role identity.account_type`, `href text`, `entity_type`, `entity_id`, `priority`, `read_at`. Add `in_app` to the `engage.channel` enum.
- `+ engage.notification_pref(user_id, category, channel, enabled)`.
- `+ engage.alert_read(user_id, alert_id, read_at)`.
- `~ engage.health_alert`: add `status` (draft / scheduled / sent), `scheduled_at`, `second_approver_user_id`, `sms boolean`, `reach_count int`, `issuer_name text`. Allow zone scope.
- `+ identity.user_preference(user_id, text_size, face_check_new_device bool, share_prefs jsonb)`.
- `+ identity.share_preference(person_id, category, enabled)`: categories lab, rx, vitals, imaging, genomic, mental_health.
- `+ identity.data_export_request`, `identity.account_deletion_request(grace until)`.
- `~ identity.device`: add `last_ip_area`, `last_city`.
- `+ identity.family_link(citizen_person_id, member_person_id, relation, can_show_key, accepted_at, removed_at)`.
- `~ records.folder`: add `colour`. Decide the delete rule: add a soft `archived_at`, and relax the trigger to allow only `name`, `colour` and `archived_at`.
- `~ records.document`: add `sensitivity` (general / mental_health / genomic) and `source_label`.
- `+ records.document_summary(document_id, summary_title, summary, model_version)`.
- `+ records.document_view(document_id, user_id, viewed_at)` for the "new" flag.

**121_scheduling_queue**
- `~ engage.appointment_slot`: add `slot_type` (op / teleconsult / ward_round / walk_in).
- `~ engage.appointment`: add `booking_ref`, `token_no`, `reason`, `visit_type`, `fee_amount`, `checked_in_at`, `called_at`, `completed_at`, `priority`.
- `~ identity.doctor_profile`: add `languages text[]`, `fee_amount`, `gender`, `years_experience`, `accepts_walkin`.
- `~ org.hospital`: add `services text[]` (or `+ org.hospital_service`).
- `+ org.doctor_roster(hospital_id, doctor_user_id, day, shift, published_at)`.
- `~ org.department`: add `head_user_id`.
- `~ identity.staff_profile`: add `employee_code`, `registration_no`, `shift`.
- `+ identity.staff_invite(token_hash, hospital_id / pharmacy_id, role, email_hash, expires_at, accepted_at, revoked_at)`.

**122_lab_imaging** (new schemas `lab`, `imaging`)
- `~ records.clinical_order`: add `order_ref`, `priority`, `accepted_by_user_id`, `accepted_at`, `rejected_reason`, `assigned_to_user_id`, `bed_id`; add `accepted` / `rejected` to the status enum.
- `+ lab.test_catalogue(code, loinc, name, unit, ref_low, ref_high, critical_low, critical_high, tat_target)`.
- `+ lab.order_item`, `+ lab.specimen(barcode, tubes, collected_by, collected_at, fasting, rejected_reason)`.
- `+ lab.result(order_id, status draft / released / preliminary, released_by, released_at, document_id)`, `+ lab.result_value(result_id, test_code, value_num, unit, flag, delta_prev)`.
- `+ lab.critical_call(result_value_id, called_user_id, read_back_at, called_by)`.
- `+ lab.instrument`, `+ lab.qc_run`, `+ lab.reagent_lot`.
- `+ lab.result_ack(result_id, doctor_user_id, acked_at)`.
- `+ imaging.room(modality, name, status)`, `+ imaging.equipment_event(downtime, calibration_due)`, `+ imaging.room_slot`.
- `+ imaging.study(order_id, modality, body_part, priority, room_id, contrast, clinical_note, status, reporting_doctor_id)`.
- `+ imaging.study_file(study_id, document_id, series, withdrawn_at, withdrawn_reason)`, `+ imaging.exposure(kvp, mas, dap, operator_user_id)`, `+ imaging.study_prior(study_id, prior_study_id)`.

**123_inpatient**
- `+ org.ward(hospital_id, department_id, name)`, `+ org.bed(ward_id, number, bed_type, status)`.
- `~ access.admission`: add `bed_id`, `ip_number`, `diet`, `mobility`, `diagnosis_text`, `expected_discharge`.
- `+ records.vital_set(admission_id, observed_at, news_score, band, escalated_to, escalated_at, acked_at)`.
- `+ records.escalation(admission_id, level, paged_at, acked_by)`, `+ org.escalation_chain(hospital_id, step, role, within_minutes)`.
- `+ records.nursing_task(admission_id, assigned_to, due_at, done_at)`.
- `+ records.nursing_note(admission_id, author_user_id, kind (sbar / note), body_enc, created_at)`.
- `+ records.inpatient_med_order(admission_id, medicine_id, dose, route, schedule)`, `+ records.med_administration(order_id, due_at, given_at, outcome given / withheld / refused, reason, nurse_user_id)`.
- `+ org.shift_handover(hospital_id, unit, from_user, to_user, signed_at)`, `+ org.handover_item(handover_id, patient / bed, flag watch / pending / transfer, note, ai_draft bool)`. This table is shared by doctor, nurse, lab and radiology.
- `+ org.ward_stock`, `+ org.ward_stock_request`.
- `~ org.bed_availability`: add `department_id`, or derive from `org.bed` and keep the table as a cache.
- `+ org.staff_shift(user_id, shift_start, shift_end, break_taken)`.

**124_pharmacy_ops**
- `~ pharmacy.rx_status`: add `draft`, `ready`, `collected`.
- `~ pharmacy.prescription`: add `rx_number`, `verified_by_user_id`, `verified_at`, `ready_at`, `collected_at`; make `document_id` and `signature_ref` nullable while `draft` (CHECK).
- `+ pharmacy.rx_verification(prescription_id, check_code, passed, detail)`.
- `+ pharmacy.queue_token(prescription_id, pharmacy_id, counter, token_no, called_at)`.
- `~ pharmacy.dispensing`: add `batch_override_reason`.
- `~ pharmacy.prescription_item`: add `schedule_times time[]`, `with_food`.
- `+ records.dose_log(patient_person_id, prescription_item_id, scheduled_for, taken_at)`.
- `~ pharmacy.stock_item`: add `is_published`, `mrp`, `cost`, `blocked_reason`.
- `~ pharmacy.medicine`: add `category`.
- `+ pharmacy.supplier`, `+ pharmacy.purchase_order`, `+ pharmacy.po_line`, `+ pharmacy.stock_movement` (receipt, adjustment, write-off), `+ pharmacy.drug_recall`, `+ pharmacy.recall_ack`.
- `+ pharmacy.stock_search_log(pharmacy_id, medicine_id, searched_at)`, `+ pharmacy.stock_sync_run(pharmacy_id, started_at, status, rows)`.
- `~ org.pharmacy`: add `licence_valid_until`, `is_jan_aushadhi`, `counters int`, `compliance_score`.
- `+ org.facility_document(facility_type, facility_id, doc_type, document_id, valid_until, verified_by)`. This also covers the pharmacy admin's licence copy and photo ID.
- `+ identity.pharmacist_shift(user_id, counter, state on / break / off)`.

**125_ai_chat_models**
- `+ ai.chat_session(patient_person_id, title, started_at, shared_with_doctor_id)`, `+ ai.chat_message(session_id, role, body_enc, source_refs, red_flag)`. Link to `ai_run` per answer.
- `~ ai.verdict`: add `edited`; `~ ai.ai_review`: add `edited_text`.
- `+ ai.model(name, kind)`, `+ ai.model_version(model_id, version, status, drift_pct, agreement_pct)`, `+ ai.release_request(version_id, status, signoffs)`, `+ ai.safety_report(model_version_id, reporter, kind, text)`.
- `+ ai.drift_metric(model_version_id, measured_at, value)`.

**126_engage_extras**
- `~ engage.complaint`: add `ref_no`, `category`, `severity`, `hospital_id`, `pharmacy_id`, `due_at`, `escalation_level`; add `access_session` to `about_type`.
- `+ engage.complaint_event(complaint_id, actor_user_id, kind, text, at)`, `+ engage.complaint_attachment(complaint_id, document_id)`.
- `~ engage.rating`: add `department`, `appointment_id` / `session_id` (visit-verified), `tags text[]`.
- `+ engage.rating_helpful(rating_id, user_id)`, `+ engage.rating_report(rating_id, reporter, reason)`.
- `~ engage.chat_thread.thread_type`: add `pharmacist`, `hospital_desk`, `lab`, `broadcast`; `+ engage.chat_participant(thread_id, user_id | org)`, `+ engage.chat_attachment`, `~ engage.chat_message`: add `read_at` or a `chat_read` table.

**127_donation_organ**
- `~ donation.blood_donor`: add `donor_code`.
- `~ donation.blood_donation`: add `donation_type`, `hb_value`, `camp_id`; make `hospital_id` nullable (CHECK hospital or camp).
- `+ donation.blood_bank(hospital_id, name, district_id)`, `+ donation.blood_bank_stock(bank_id, blood_group, units, as_of)`, `+ donation.blood_camp(...)`, `+ donation.camp_pledge(camp_id, donor_person_id)`.
- `~ donation.organ_pledge`: add `status` (intent / family_informed / signing / registered), make `hospital_id`, `witnessing_doctor_user_id`, `document_id` nullable until signing.
- `+ donation.organ_witness(pledge_id, name, relation, signed_at, link_expires_at)`, `+ donation.next_of_kin_notice(pledge_id, person_id, notified_at, acknowledged_at)`.
- `+ donation.transplant_centre`, `+ donation.organ_waitlist_snapshot(state_id, organ, waiting, median_days, as_of)`, `+ donation.organ_lookup_log`.
- `~ identity.account_type`: add `transplant_coordinator`.

**128_access_emergency**
- `~ access.emergency_access`: add `reason_category`, `second_doctor_user_id`, `second_doctor_at`, `hospital_review_status`, `hospital_reviewer_id`, `hospital_reviewed_at`, `hospital_due_at (72h)`, `contact_notified_at`, `match_method`. Reconcile 24 h versus 72 h.
- `~ identity.person`: add `is_unidentified boolean`, `temp_label`.
- `+ access.item_view(session_id, document_id, viewed_at)` (or expose `activity_log` through a view).
- `+ access.v_order_access_history` (a citizen-readable view over audit rows for lab, radiology, pharmacy and nurse actions).
- `~ audit.activity_log`: add `hospital_id`, `pharmacy_id`, `district_id` (all nullable, no FK because of the hot table), plus scoped read views.
- `+ audit.flagged_event(log_seq, status, reviewed_by, outcome)`.

**129_admin_platform**
- `+ geo.population(district_id | state_id, year, population)`.
- `+ surveillance.disease(code, name)`, `+ surveillance.case_report(disease_id, district_id, week, count, source)`, `+ surveillance.baseline(disease_id, district_id, week, baseline)`, `+ surveillance.response_action(...)`; a materialised view for weekly rates.
- `+ admin.platform_flag(code, enabled)` and `+ admin.platform_flag_history(flag, changed_by, second_confirm_by, at)`; `+ admin.access_rule(code, value)` for session length, review window, lock threshold and retention.
- `+ admin.report_definition`, `+ admin.report_export(report, requested_by, scope, created_at, expires_at)`.
- `~ admin.approval_request`: add `priority`, `reminders_sent`, `more_info_requested_at`; add status `more_info`. Extend `approval_subject` with `special_category`, `hospital_profile_change`, `hospital_staff`, `admin_create` (hospital-level approver may need a new `admin_level` value or a hospital scope column).
- `+ admin.hospital_permission_override(hospital_id, role, permission, allowed)`.
- `~ identity.person`: add `registration_channel`.
- `~ identity.account_type`: add `asha`.
- `+ report.v_*` rollup views at state, zone and national levels (sessions live, registered share, blood cover, bed occupancy, grievance ageing, approval funnel).

**130_seed_reference**
- Add a medicine catalogue, a lab test catalogue, `surveillance.disease`, notification templates and platform flag defaults.

**Seed (separate step)**
- Add a "personas" block with the named demo people and the Pathanamthitta district. Seed folders, medicines and stock, vitals, appointments, orders, prescriptions, dispensing, alerts, complaints and ratings.
- Create a companion citizen account for each doctor, and add minors with guardians.

## 6. Suggested next steps
1. Decide the open conflicts: folder delete versus the trigger, the 24 h versus 72 h break-glass review, the retention periods, whether prescription draft lives in the table, and the hospital-level approver.
2. Land 120, 121 and 124 first (feed, scheduling and prescription states); they unblock the citizen, doctor and pharmacist screens.
3. Land the lab, imaging and inpatient migrations (122, 123) before building the staff portals.
4. Extend the seed in parallel so each screen has data.
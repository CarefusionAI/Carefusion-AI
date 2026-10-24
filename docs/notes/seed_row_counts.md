# Seed row counts (design seed, fresh database)

Produced on 2026-10-24 from a throwaway `postgis/postgis:16-3.4` database after `run_migrations.sh all` (migrations 000-129, then `seed/demo_data.sql` and `seed/design/00..80`),
then a second run (nothing applied) and `SEED_FORCE=1 run_migrations.sh seed` (no row-count drift: the counts below are identical before and after).

Only tables with at least one row are listed (partition children are folded into the parent table). `public.schema_migrations` is the ledger.

| Schema | Tables with rows | Total rows | Rows per table |
|---|---|---|---|
| access | 6 of 7 | 184 | location_check 50, admission_team 44, access_session 42, admission 22, item_view 19, emergency_access 7 |
| admin | 14 of 17 | 191 | role_permission 54, approval_request 34, admin_post 25, approval_rule 16, access_rule 15, report_export 11, permission 9, report_definition 6, blood_eligibility_rule 5, platform_flag 5, rating_rule 4, account_flag 3, platform_flag_history 3, hospital_permission_override 1 |
| ai | 11 of 12 | 117 | drift_metric 28, chat_message 25, ai_evidence 20, ai_hypothesis 16, ai_run 6, chat_session 5, model_version 5, model 4, safety_report 4, ai_review 3, release_request 1 |
| audit | 3 of 5 | 175 | activity_log 168, flagged_event 5, chain_tip 2 |
| donation | 17 of 17 | 1,683 | transplant_centre 812, blood_stock_reading 592, organ_waitlist_snapshot 190, blood_donation 22, blood_bank 18, organ_type 10, blood_camp 8, camp_pledge 7, donor_checklist 6, blood_donor 5, blood_request 3, blood_request_response 3, organ_witness 2, transplant_coordinator 2, next_of_kin_notice 1, organ_lookup_log 1, organ_pledge 1 |
| engage | 20 of 23 | 966 | rating 324, event 216, event_read 82, rating_helpful 81, appointment_slot 61, complaint_event 22, event_type_ref 22, chat_message 21, chat_participant 21, health_alert 18, notification_pref 17, op_visit 16, appointment 15, notification 13, complaint 11, chat_thread 10, notification_template 8, rating_reply 4, chat_attachment 3, alert_read 1 |
| geo | 5 of 5 | 129 | population 62, state 36, district 14, block 12, zone 5 |
| identity | 19 of 24 | 9,344 | person 2,351, app_user 2,350, consent_record 2,304, citizen_profile 2,066, staff_profile 72, doctor_profile 57, pharmacist_profile 47, pharmacy_admin_profile 43, hospital_admin_profile 23, special_category_type 10, share_preference 6, device 3, special_category_request_step 3, emergency_contact 2, family_link 2, staff_invite 2, doctor_posting_history 1, special_category_request 1, user_preference 1 |
| imaging | 8 of 8 | 66 | room_slot 19, equipment_event 16, study 12, room 7, study_series 5, exposure 3, study_file 2, study_prior 2 |
| inpatient | 6 of 6 | 71 | vital_set 36, med_order 9, nursing_task 9, escalation 8, med_administration 5, nursing_note 4 |
| lab | 12 of 12 | 536 | order_item 125, result_value 112, specimen 107, result 97, test_catalogue 31, panel_test 23, qc_run 23, panel 8, instrument 4, result_ack 3, reagent_lot 2, critical_call 1 |
| org | 18 of 18 | 595 | bed 200, department 115, bed_availability 64, pharmacy 47, doctor_roster 42, hospital 36, handover_item 17, doctor_schedule_block 15, hospital_type 11, staff_shift 10, facility_document 9, ward 9, bed_type 6, shift_handover 5, ward_stock 4, escalation_chain 3, roster_week 1, ward_stock_request 1 |
| pharmacy | 23 of 23 | 1,242 | stock_search_log 684, rx_verification 119, stock_item 97, po_line 85, medicine 50, prescription_item 33, stock_movement 30, prescription 24, dispensing 23, prescription_delivery 23, rx_fulfilment 17, stock_sync_run 12, purchase_order 8, queue_token 8, supplier 6, counter_state 5, drug_interaction 5, medicine_substitute 4, controlled_drug_register 2, drug_recall 2, prescription_draft 2, recall_ack 2, software_link 1 |
| public | 2 of 2 | 8,532 | spatial_ref_sys 8,500, schema_migrations 32 |
| records | 18 of 22 | 581 | folder 126, clinical_order 122, dose_log 115, vital_observation 110, document 37, dated_event 15, document_scan 10, document_summary 10, condition 7, clinical_alert 6, document_view 6, vital_target 6, referral 3, allergy 2, medication_current 2, procedure_stay 2, immunization 1, lifestyle 1 |
| surveillance | 6 of 6 | 1,433 | case_report 900, baseline 504, response_action 16, disease 5, anomaly 4, field_request 4 |

Notes
- `demo_data.sql` is the random Ernakulam / Thiruvananthapuram filler (generated, 40 doctors with canonical HPR ids); the design seed adds the named personas and screens on top.
- `engage.event`: 216 rows (38 are the 10 design events split by audience, the rest are derived history); `audit.activity_log` hash chains of streams 0 and 33 verify (NULL = intact).
- Counting query (run on a fresh, fully seeded database; excludes partition children):
  ```sql
  SELECT table_schema, table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint AS n
  FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')
    AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = (quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass) ORDER BY 1, 2;
  ```

-- =====================================================================
-- 127_access_audit_extras.sql : break-glass details (reason category, second doctor,
--   hospital review stage with 72 h window, contact notified, match method),
--   unidentified patients, items viewed per session, emergency card with
--   conditions, citizen-readable activity view (lab / radiology / pharmacist /
--   nurse), facility / district scope on the audit log with scoped read views,
--   flagged audit events.
-- Decision recorded: hospital review window = 72 h (design); the central
--   verification window stays 24 h (040). Open question for Athun: keep both?
-- Limitation: audit.activity_log.hospital_id / pharmacy_id / district_id are NOT part of
--   the hash (the hash format must never change). audit.log_scoped() also writes the same
--   scope into the hashed `details`, and audit.check_scope_columns() detects any mismatch.
-- Rule codes: CF160 (not your hospital / already reviewed), CF161 (second doctor rule),
--   CF162 (break-glass reason too short).
-- =====================================================================

-- ---------- Unidentified patients (casualty) ----------
ALTER TABLE identity.person ADD COLUMN is_unidentified boolean NOT NULL DEFAULT false;
ALTER TABLE identity.person ADD COLUMN temp_label text;                     -- 'Unknown male ~45 (DEMO-0000-5512)'
ALTER TABLE identity.person ADD COLUMN dob_estimated boolean NOT NULL DEFAULT false;
ALTER TABLE identity.person ADD CONSTRAINT person_unidentified_shape
  CHECK (NOT is_unidentified OR (temp_label IS NOT NULL AND dob_estimated AND aadhaar_token IS NULL AND abha_number IS NULL));
CREATE TABLE identity.person_merge (
  id                uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  from_person_id    uuid NOT NULL UNIQUE REFERENCES identity.person(id),   -- the temporary record
  into_person_id    uuid NOT NULL REFERENCES identity.person(id),          -- the identified person
  merged_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  reason            text,
  merged_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (from_person_id <> into_person_id)
);   -- records are append-only, so a merge is a LINK; the API reads through it
CREATE TRIGGER person_merge_immutable BEFORE UPDATE OR DELETE ON identity.person_merge FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Break-glass: more fields ----------
ALTER TABLE access.emergency_access ADD COLUMN reason_category text
  CHECK (reason_category IS NULL OR reason_category IN ('unconscious','accident','key_unavailable','family_unreachable','transfer','other'));
ALTER TABLE access.emergency_access ADD COLUMN second_doctor_user_id uuid REFERENCES identity.app_user(id);
ALTER TABLE access.emergency_access ADD COLUMN second_doctor_at timestamptz;
ALTER TABLE access.emergency_access ADD COLUMN hospital_review_status access.review_status NOT NULL DEFAULT 'pending';   -- ok = justified, misuse = not justified
ALTER TABLE access.emergency_access ADD COLUMN hospital_reviewer_id uuid REFERENCES identity.app_user(id);
ALTER TABLE access.emergency_access ADD COLUMN hospital_reviewed_at timestamptz;
ALTER TABLE access.emergency_access ADD COLUMN hospital_review_note text;
ALTER TABLE access.emergency_access ADD COLUMN hospital_due_at timestamptz NOT NULL DEFAULT now() + interval '72 hours';
ALTER TABLE access.emergency_access ADD COLUMN contact_notified_at timestamptz;
ALTER TABLE access.emergency_access ADD COLUMN match_method text
  CHECK (match_method IS NULL OR match_method IN ('face','fingerprint','face_and_fingerprint','aadhaar_biometric','manual'));
ALTER TABLE access.emergency_access ADD COLUMN evidence_note text;           -- casualty register entry, ambulance handover …
ALTER TABLE access.emergency_access ADD CONSTRAINT break_glass_reason_len
  CHECK (break_glass_reason IS NULL OR length(trim(break_glass_reason)) >= 20);          -- CF162 (as a constraint)
ALTER TABLE access.emergency_access ADD CONSTRAINT break_glass_second_pair
  CHECK ((second_doctor_user_id IS NULL) = (second_doctor_at IS NULL));
CREATE INDEX emergency_hospital_review_ix ON access.emergency_access (hospital_review_status, hospital_due_at);

CREATE OR REPLACE FUNCTION access.check_second_doctor() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE opener uuid; t identity.account_type;
BEGIN
  IF NEW.second_doctor_user_id IS NOT NULL THEN
    SELECT user_id INTO opener FROM access.access_session WHERE id = NEW.session_id;
    SELECT account_type INTO t FROM identity.app_user WHERE id = NEW.second_doctor_user_id;
    IF NEW.second_doctor_user_id = opener OR t IS DISTINCT FROM 'doctor' THEN
      RAISE EXCEPTION 'CF161: the confirming person must be a different doctor' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER emergency_second_doctor BEFORE INSERT OR UPDATE ON access.emergency_access
  FOR EACH ROW EXECUTE FUNCTION access.check_second_doctor();

-- Hospital admin's review (justified / not justified). Only for doctors of the admin's own hospital.
CREATE OR REPLACE FUNCTION access.hospital_review(p_session uuid, p_outcome access.review_status, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE doc_hosp uuid; cur access.review_status;
BEGIN
  IF util.ctx_account_type() <> 'hospital_admin' THEN
    RAISE EXCEPTION 'CF160: only the hospital admin can review' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_outcome = 'pending' THEN
    RAISE EXCEPTION 'CF160: choose justified (ok) or not justified (misuse)' USING ERRCODE = 'check_violation';
  END IF;
  SELECT dp.hospital_id, e.hospital_review_status INTO doc_hosp, cur
    FROM access.emergency_access e JOIN access.access_session s ON s.id = e.session_id
    JOIN identity.doctor_profile dp ON dp.user_id = s.user_id WHERE e.session_id = p_session;
  IF doc_hosp IS DISTINCT FROM util.ctx_hospital_id() THEN
    RAISE EXCEPTION 'CF160: this emergency access is not in your hospital' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF cur <> 'pending' THEN
    RAISE EXCEPTION 'CF160: already reviewed' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE access.emergency_access
     SET hospital_review_status = p_outcome, hospital_reviewer_id = util.ctx_user_id(),
         hospital_reviewed_at = now(), hospital_review_note = p_note
   WHERE session_id = p_session;
  PERFORM audit.log('breakglass.hospital_review', 'access_session', p_session, NULL, p_session,
                    jsonb_build_object('outcome', p_outcome));
END $$;

-- ---------- Items viewed in a session ----------
CREATE TABLE access.item_view (
  id                 uuid NOT NULL DEFAULT util.uuid_v7(),
  session_id         uuid NOT NULL,                       -- access_session(id); no FK (hot partitioned table)
  patient_person_id  uuid NOT NULL,
  user_id            uuid NOT NULL,
  item_kind          text NOT NULL CHECK (item_kind IN ('document','allergy','condition','medication','vital','lab_result','imaging','prescription','ai_run','emergency_card','other')),
  item_id            uuid,
  label              text,                                -- never the content, only a title
  viewed_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, viewed_at)
) PARTITION BY RANGE (viewed_at);
CREATE INDEX item_view_session_ix ON access.item_view (session_id, viewed_at);
CREATE INDEX item_view_patient_ix ON access.item_view (patient_person_id, viewed_at DESC);
CREATE TABLE access.item_view_default PARTITION OF access.item_view DEFAULT;
CREATE TRIGGER item_view_immutable BEFORE UPDATE OR DELETE ON access.item_view FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
SELECT util.ensure_monthly_partitions('access.item_view', date_trunc('month', now())::date, 24);
ALTER TABLE access.item_view ENABLE ROW LEVEL SECURITY;
CREATE POLICY item_view_patient ON access.item_view FOR SELECT TO cf_app
  USING (patient_person_id = util.ctx_person_id() AND util.ctx_account_type() = 'citizen');
CREATE POLICY item_view_viewer ON access.item_view FOR SELECT TO cf_app USING (user_id = util.ctx_user_id());
CREATE POLICY item_view_insert ON access.item_view FOR INSERT TO cf_app WITH CHECK (user_id = util.ctx_user_id());

-- ---------- Audit log: facility / district scope ----------
ALTER TABLE audit.activity_log ADD COLUMN hospital_id uuid;
ALTER TABLE audit.activity_log ADD COLUMN pharmacy_id uuid;
ALTER TABLE audit.activity_log ADD COLUMN district_id uuid;
CREATE INDEX activity_hospital_ix ON audit.activity_log (hospital_id, occurred_at DESC) WHERE hospital_id IS NOT NULL;
CREATE INDEX activity_pharmacy_ix ON audit.activity_log (pharmacy_id, occurred_at DESC) WHERE pharmacy_id IS NOT NULL;
CREATE INDEX activity_district_ix ON audit.activity_log (district_id, occurred_at DESC) WHERE district_id IS NOT NULL;

CREATE OR REPLACE FUNCTION audit.log_scoped(
  p_action text, p_hospital uuid DEFAULT NULL, p_pharmacy uuid DEFAULT NULL, p_district uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL, p_entity_id uuid DEFAULT NULL, p_patient uuid DEFAULT NULL,
  p_session uuid DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb, p_stream smallint DEFAULT 0)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE s bigint;
BEGIN
  INSERT INTO audit.activity_log (stream_id, user_id, account_type, action, entity_type, entity_id, patient_person_id,
                                  session_id, details, hospital_id, pharmacy_id, district_id)
  VALUES (p_stream, util.ctx_user_id(), util.ctx_account_type()::identity.account_type, p_action, p_entity_type, p_entity_id,
          p_patient, p_session,
          p_details || jsonb_build_object('scope', jsonb_strip_nulls(jsonb_build_object(
              'hospital', p_hospital, 'pharmacy', p_pharmacy, 'district', p_district))),   -- hashed copy of the scope
          p_hospital, p_pharmacy, p_district)
  RETURNING seq INTO s;
  RETURN s;
END $$;

-- Returns the first seq whose scope columns differ from the hashed copy in details (NULL = all match).
CREATE OR REPLACE FUNCTION audit.check_scope_columns(p_stream smallint) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT min(seq) FROM audit.activity_log
   WHERE stream_id = p_stream AND details ? 'scope'
     AND (hospital_id::text IS DISTINCT FROM details #>> '{scope,hospital}'
          OR pharmacy_id::text IS DISTINCT FROM details #>> '{scope,pharmacy}'
          OR district_id::text IS DISTINCT FROM details #>> '{scope,district}')
$$;

-- Scoped read for facility / district admins: no patient identity, no IP, GPS or device.
CREATE VIEW audit.v_scoped_log WITH (security_barrier) AS
SELECT l.seq, l.occurred_at, l.stream_id, l.user_id, l.account_type, pp.full_name AS actor,
       l.action, l.entity_type, l.entity_id, l.session_id, l.details, l.hospital_id, l.pharmacy_id, l.district_id
FROM audit.activity_log l
LEFT JOIN identity.app_user u ON u.id = l.user_id
LEFT JOIN identity.person pp ON pp.id = u.person_id
WHERE (util.ctx_account_type() = 'hospital_admin' AND l.hospital_id IS NOT NULL AND l.hospital_id = util.ctx_hospital_id())
   OR (util.ctx_account_type() = 'pharmacy_admin' AND l.pharmacy_id IS NOT NULL AND l.pharmacy_id = pharmacy.ctx_pharmacy_id())
   OR (util.ctx_account_type() = 'district_admin' AND l.district_id IS NOT NULL AND l.district_id =
        (SELECT ap.district_id FROM admin.admin_post ap WHERE ap.user_id = util.ctx_user_id() AND ap.valid @> now() LIMIT 1));

-- Citizen: who touched my record outside a doctor key session (lab, radiology, pharmacist, nurse, break-glass).
CREATE VIEW access.v_order_access_history WITH (security_barrier) AS
SELECT l.patient_person_id, l.seq, l.occurred_at, l.action,
       pp.full_name AS actor, l.account_type, h.name AS hospital,
       l.details ->> 'how' AS how, l.details ->> 'saw' AS saw
FROM audit.activity_log l
LEFT JOIN identity.app_user u ON u.id = l.user_id
LEFT JOIN identity.person pp ON pp.id = u.person_id
LEFT JOIN org.hospital h ON h.id = l.hospital_id
WHERE l.patient_person_id = util.ctx_person_id()
  AND l.action ~ '^(lab|imaging|rx|nurse|admission|session|breakglass|break_glass|organ)\.';

-- Hospital admin: break-glass review queue (what was viewed, reason, evidence, review window).
CREATE VIEW access.v_break_glass_review WITH (security_barrier) AS
SELECT e.session_id, s.started_at, s.ended_at,
       round(extract(epoch FROM (coalesce(s.ended_at, least(s.expires_at, now())) - s.started_at)) / 60)::int AS minutes_open,
       dp.hospital_id, u.id AS doctor_user_id, dper.full_name AS doctor_name,
       CASE WHEN pat.is_unidentified THEN pat.temp_label ELSE pat.full_name END AS patient_label,
       e.reason_category, e.break_glass_reason, e.evidence_note, e.match_method,
       e.second_doctor_user_id, e.hospital_review_status, e.hospital_due_at, e.hospital_reviewed_at,
       e.district_review_status, e.central_verify_status,
       (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('kind', iv.item_kind, 'label', iv.label)), '[]'::jsonb)
          FROM access.item_view iv WHERE iv.session_id = s.id) AS viewed
FROM access.emergency_access e
JOIN access.access_session s ON s.id = e.session_id AND s.mode = 'break_glass'
JOIN identity.app_user u ON u.id = s.user_id
JOIN identity.person dper ON dper.id = u.person_id
JOIN identity.doctor_profile dp ON dp.user_id = u.id
JOIN identity.person pat ON pat.id = s.patient_person_id
WHERE util.ctx_account_type() = 'hospital_admin' AND dp.hospital_id = util.ctx_hospital_id();

-- Emergency card: now also active conditions and special categories (HIV and mental health stay private).
CREATE OR REPLACE VIEW access.v_emergency_basic WITH (security_barrier) AS
SELECT p.id AS person_id, p.full_name, p.date_of_birth, p.sex, c.blood_group, c.organ_donor_status,
       (SELECT coalesce(jsonb_agg(jsonb_build_object('substance', a.substance, 'severity', a.severity)), '[]')
          FROM records.allergy a
         WHERE a.patient_person_id = p.id AND a.superseded_by IS NULL AND a.status = 'active') AS allergies,
       (SELECT coalesce(jsonb_agg(jsonb_build_object('contact_person_id', e.contact_person_id,
                                                     'name', cp.full_name, 'relation', e.relation)
                                  ORDER BY e.priority), '[]')
          FROM identity.emergency_contact e JOIN identity.person cp ON cp.id = e.contact_person_id
         WHERE e.citizen_person_id = p.id AND e.removed_at IS NULL) AS emergency_contacts,
       (SELECT coalesce(jsonb_agg(jsonb_build_object('name', cd.name, 'chronic', cd.is_chronic)), '[]')
          FROM records.condition cd
         WHERE cd.patient_person_id = p.id AND cd.superseded_by IS NULL AND cd.status = 'active' AND cd.is_chronic) AS conditions,
       (SELECT coalesce(jsonb_agg(t.name), '[]')
          FROM identity.special_category sc JOIN identity.special_category_type t ON t.code = sc.category_code
         WHERE sc.person_id = p.id AND sc.ended_at IS NULL AND sc.category_code NOT IN ('hiv','mental_health')) AS special_categories
FROM identity.person p
JOIN identity.citizen_profile c ON c.person_id = p.id
WHERE util.ctx_account_type() = 'doctor';

-- ---------- Flagged audit events (justified / escalate) ----------
CREATE TABLE audit.flagged_event (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  activity_seq          bigint,                              -- audit.activity_log(seq); no FK (partitioned log)
  activity_occurred_at  timestamptz,
  rule                  text NOT NULL,                       -- many_break_glass, access_outside_hours, repeated_denied …
  severity              text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  event_text            text NOT NULL,
  actor_role            text,
  hospital_id           uuid REFERENCES org.hospital(id),
  district_id           uuid REFERENCES geo.district(id),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','justified','escalated')),
  reviewed_by_user_id   uuid REFERENCES identity.app_user(id),
  reviewed_at           timestamptz,
  outcome_note          text,
  escalated_to_level    admin.admin_level,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'open') = (reviewed_at IS NULL)),
  CHECK (status <> 'escalated' OR escalated_to_level IS NOT NULL)
);
CREATE INDEX flagged_event_open_ix ON audit.flagged_event (district_id, created_at DESC) WHERE status = 'open';
CREATE TRIGGER flagged_event_review_only BEFORE UPDATE ON audit.flagged_event
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('status','reviewed_by_user_id','reviewed_at','outcome_note','escalated_to_level');
CREATE TRIGGER flagged_event_no_delete BEFORE DELETE ON audit.flagged_event FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA access, identity TO cf_app;
GRANT SELECT, INSERT, UPDATE ON audit.flagged_event TO cf_app;
GRANT SELECT ON audit.v_scoped_log TO cf_app;
GRANT SELECT ON audit.flagged_event TO cf_auditor;
GRANT SELECT ON access.v_order_access_history, access.v_break_glass_review TO cf_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA access, audit TO cf_app;
REVOKE EXECUTE ON FUNCTION audit.check_scope_columns(smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.check_scope_columns(smallint) TO cf_auditor;
GRANT EXECUTE ON FUNCTION audit.log_scoped TO cf_ai;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA access, identity, audit FROM cf_app, cf_ai, cf_report, cf_auditor;

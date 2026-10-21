-- =====================================================================
-- 120_events_feed.sql : cross-role events feed ("connected apps"), read state,
--   notification preferences, citizen settings (UI, sharing, export, deletion),
--   adult family links. Also creates the new schemas used by 121-128.
--
-- CANONICAL DEMO-DATA DECISIONS (Phase 2a, 2026-10-21) — assumptions to confirm:
--   1. Anjali Menon is 35 (date of birth 14 Feb 1991), an OUTPATIENT. The nurse-app
--      "Bed 3 / IP-DEMO-30318" inpatient story is NOT carried into the database.
--   2. ONE order-id scheme for lab, imaging, nursing and medication orders:
--      ORD-DEMO-NNNN  (records.clinical_order.order_ref, added in 123).
--      LAB-/LO-/O-/DEMO-IMG-/DEMO-L-/DEMO-R- numbers from the designs are display
--      leftovers and are not stored.
--   3. ONE HPR id format for doctors: DEMO-HPR-71-NNNN (71 = Kerala demo code).
--      NOT enforced by a CHECK here because seed/demo_data.sql (generated)
--      still uses DEMO-HPR-NNNNNN. identity.is_canonical_hpr_id() is provided so
--      the API / next seed can validate; add a CHECK once the seed is regenerated.
--   4. ONE event vocabulary. Radiology orders use 'imaging-order' (the design's
--      doctor app said 'radiology-order'; the radiology app listened for
--      'imaging-order'). Result event is 'imaging-result'. See engage.event_type_ref.
--   5. Break-glass review window: hospital admin 72 h (new stage, 127), district
--      review and central verification keep their existing columns. The central
--      24 h default in 040 is NOT changed (open question for Athun).
--   6. The "radiology-order / lab-order → citizen" copy and the gov-console feed:
--      events about a patient are NEVER delivered to district/state/zonal/central
--      admins (CHECK below). Emit a second, non-identifying event for them.
--
-- Rule codes used by 120-128: CF100-CF199 (see each file). Next free: CF200.
-- NOTE: ALTER TYPE ... ADD VALUE is used. run_migrations.sh applies each file
--   with its own psql call, so new values are committed before later files use
--   them. Do not wrap the whole migration set in one transaction.
-- =====================================================================

-- ---------- New schemas used by 121-128 ----------
CREATE SCHEMA IF NOT EXISTS inpatient;      -- 122 : vital sets, NEWS, nursing, MAR
CREATE SCHEMA IF NOT EXISTS lab;            -- 123 : tests, specimens, results, QC
CREATE SCHEMA IF NOT EXISTS imaging;        -- 123 : studies, rooms, exposure
CREATE SCHEMA IF NOT EXISTS surveillance;   -- 125 : disease series, baselines
GRANT USAGE ON SCHEMA inpatient, lab, imaging, surveillance TO cf_app;
GRANT USAGE ON SCHEMA lab, imaging, inpatient TO cf_ai;

-- ---------- Validators ----------
CREATE OR REPLACE FUNCTION identity.is_canonical_hpr_id(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p ~ '^DEMO-HPR-71-[0-9]{4}$' $$;

CREATE OR REPLACE FUNCTION util.is_canonical_order_ref(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p ~ '^ORD-DEMO-[0-9]{4,}$' $$;

-- =====================================================================
-- EVENTS FEED
-- =====================================================================

-- Roles as the apps name them (one more than identity.account_type: 'staff' is
-- split into nurse / labtech / radiology).
CREATE TYPE engage.event_role AS ENUM (
  'citizen','doctor','nurse','labtech','radiology','pharmacist','pharmacyadmin',
  'hospitaladmin','district','state','zonal','central');

-- Unified event vocabulary (reference list; extend with INSERT, no enum change).
CREATE TABLE engage.event_type_ref (
  code          citext PRIMARY KEY,
  label         text NOT NULL,
  chip          text NOT NULL,            -- short chip text in the feed (BK, Rx, LAB …)
  chip_tone     text NOT NULL,            -- design tone token (blue, teal, lav, sage, peach, cream)
  default_href  text CHECK (default_href IS NULL OR default_href ~ '^/'),
  is_active     boolean NOT NULL DEFAULT true
);
INSERT INTO engage.event_type_ref (code, label, chip, chip_tone, default_href) VALUES
  ('booking',          'New appointment booking',      'BK',  'blue',  '/doctor/queue'),
  ('prescription',     'e-Signed prescription',        'Rx',  'teal',  '/pharmacist/queue'),
  ('lab-order',        'Lab order',                    'LAB', 'blue',  '/lab/worklist'),
  ('imaging-order',    'Imaging order',                'RAD', 'lav',   '/radiology/worklist'),
  ('lab-result',       'Lab result ready',             'RES', 'sage',  '/doctor/results'),
  ('imaging-result',   'Imaging result ready',         'IMG', 'lav',   '/doctor/results'),
  ('break-glass',      'Emergency access used',        '!',   'peach', '/hospital-admin/break-glass'),
  ('alert',            'Health alert',                 'ALR', 'peach', '/citizen/alerts'),
  ('vitals-critical',  'Early-warning score raised',   'EWS', 'peach', '/doctor/alerts'),
  ('vitals',           'Home reading outside target',  'VIT', 'teal',  '/doctor/patients'),
  ('dispensed',        'Ready to collect',             'OK',  'sage',  '/citizen/medicines'),
  ('collected',        'Medicines collected',          'OK',  'sage',  '/citizen/medicines'),
  ('complaint',        'Complaint filed',              'CMP', 'cream', '/hospital-admin/complaints'),
  ('complaint-update', 'Complaint updated',            'CMP', 'cream', '/citizen/complaints'),
  ('blood-request',    'Blood needed',                 'B+',  'peach', '/citizen/blood'),
  ('blood-response',   'Donor responded',              'B+',  'peach', '/doctor/donors'),
  ('message',          'New message',                  'MSG', 'teal',  '/citizen/messages'),
  ('referral',         'Referral',                     'REF', 'lav',   '/doctor/referrals'),
  ('handover',         'Shift handover',               'HO',  'cream', '/doctor/handover'),
  ('session-ended',    'Record session ended',         'END', 'cream', '/doctor/patients'),
  ('ai-chat-shared',   'AI chat shared with you',      'AI',  'lav',   '/doctor/ai'),
  ('review',           'New review',                   'REV', 'cream', '/hospital-admin/reviews');

-- Which viewer-role does a user have? (SECURITY DEFINER: reads profiles the app role cannot.)
CREATE OR REPLACE FUNCTION engage.event_role_of(p_user uuid) RETURNS engage.event_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT (CASE u.account_type
            WHEN 'citizen'        THEN 'citizen'
            WHEN 'doctor'         THEN 'doctor'
            WHEN 'staff'          THEN CASE sp.staff_role WHEN 'nurse' THEN 'nurse'
                                                          WHEN 'lab' THEN 'labtech'
                                                          WHEN 'radiology' THEN 'radiology' END
            WHEN 'hospital_admin' THEN 'hospitaladmin'
            WHEN 'pharmacy_admin' THEN 'pharmacyadmin'
            WHEN 'pharmacist'     THEN 'pharmacist'
            WHEN 'district_admin' THEN 'district'
            WHEN 'state_admin'    THEN 'state'
            WHEN 'zonal_admin'    THEN 'zonal'
            WHEN 'central_admin'  THEN 'central'
          END)::engage.event_role
  FROM identity.app_user u
  LEFT JOIN identity.staff_profile sp ON sp.user_id = u.id
  WHERE u.id = p_user
$$;

-- Where does a user sit? (facility + area chain). Admin: area of the post; others: facility area.
CREATE OR REPLACE FUNCTION engage.viewer_scope(p_user uuid)
RETURNS TABLE (event_role engage.event_role, hospital_id uuid, pharmacy_id uuid,
               district_id uuid, state_id smallint, zone_id smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH b AS (
    SELECT engage.event_role_of(u.id) AS erole,
           COALESCE(dp.hospital_id, sp.hospital_id, ha.hospital_id) AS hosp,
           COALESCE(pp.pharmacy_id, pa.pharmacy_id)                 AS pharm,
           ap.district_id AS a_dist, ap.state_id AS a_state, ap.zone_id AS a_zone,
           cp.district_id AS c_dist
    FROM identity.app_user u
    LEFT JOIN identity.doctor_profile         dp ON dp.user_id = u.id
    LEFT JOIN identity.staff_profile          sp ON sp.user_id = u.id
    LEFT JOIN identity.hospital_admin_profile ha ON ha.user_id = u.id
    LEFT JOIN identity.pharmacist_profile     pp ON pp.user_id = u.id
    LEFT JOIN identity.pharmacy_admin_profile pa ON pa.user_id = u.id
    LEFT JOIN identity.citizen_profile        cp ON cp.person_id = u.person_id AND u.account_type = 'citizen'
    LEFT JOIN admin.admin_post                ap ON ap.user_id = u.id AND ap.valid @> now()
    WHERE u.id = p_user),
  d AS (
    SELECT b.*, COALESCE(b.a_dist, b.c_dist, h.district_id, ph.district_id) AS dist
    FROM b LEFT JOIN org.hospital h ON h.id = b.hosp LEFT JOIN org.pharmacy ph ON ph.id = b.pharm)
  SELECT d.erole, d.hosp, d.pharm,
         CASE WHEN d.a_state IS NOT NULL OR d.a_zone IS NOT NULL THEN NULL ELSE d.dist END,
         COALESCE(d.a_state, CASE WHEN d.a_zone IS NULL AND d.erole <> 'central' THEN gd.state_id END),
         COALESCE(d.a_zone,  CASE WHEN d.erole <> 'central' THEN gs.zone_id END)
  FROM d
  LEFT JOIN geo.district gd ON gd.id = d.dist
  LEFT JOIN geo.state    gs ON gs.id = COALESCE(d.a_state, gd.state_id)
$$;

-- ---------- The feed ----------
CREATE TABLE engage.event (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  type                citext NOT NULL REFERENCES engage.event_type_ref(code),
  from_role           engage.event_role NOT NULL,
  created_by_user_id  uuid REFERENCES identity.app_user(id),       -- null = system job
  to_roles            engage.event_role[] NOT NULL CHECK (cardinality(to_roles) > 0),
  to_user_id          uuid REFERENCES identity.app_user(id),       -- direct recipient (optional)
  title               text NOT NULL CHECK (length(trim(title)) > 0),
  text                text NOT NULL DEFAULT '',
  href                text,                                         -- app route, e.g. /citizen/medicines
  entity_type         text,                                         -- e.g. 'pharmacy.prescription'
  entity_id           uuid,
  patient_person_id   uuid REFERENCES identity.person(id),          -- NULL = not about one patient
  -- scope (who may see it): facility and area. District/state/zone are filled from the facility.
  hospital_id         uuid REFERENCES org.hospital(id),
  pharmacy_id         uuid REFERENCES org.pharmacy(id),
  district_id         uuid REFERENCES geo.district(id),
  state_id            smallint REFERENCES geo.state(id),
  zone_id             smallint REFERENCES geo.zone(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- href must be an in-app path: starts with one '/', no scheme, no '//', no spaces or backslashes.
  CONSTRAINT event_href_is_route CHECK (href IS NULL OR href ~ '^/([^/[:space:]\\][^[:space:]\\]*)?$'),
  CONSTRAINT event_entity_pair   CHECK ((entity_type IS NULL) = (entity_id IS NULL)),
  -- Privacy: an event about a patient never goes to district/state/zonal/central admins.
  CONSTRAINT event_patient_not_to_gov
    CHECK (patient_person_id IS NULL OR NOT (to_roles && ARRAY['district','state','zonal','central']::engage.event_role[])),
  -- Privacy: a patient event is either facility-scoped, addressed to one user, or for citizens only.
  CONSTRAINT event_patient_needs_scope
    CHECK (patient_person_id IS NULL OR hospital_id IS NOT NULL OR pharmacy_id IS NOT NULL OR to_user_id IS NOT NULL
           OR to_roles <@ ARRAY['citizen']::engage.event_role[])
);
CREATE INDEX event_created_ix  ON engage.event (created_at DESC);
CREATE INDEX event_roles_gix   ON engage.event USING gin (to_roles);
CREATE INDEX event_patient_ix  ON engage.event (patient_person_id, created_at DESC) WHERE patient_person_id IS NOT NULL;
CREATE INDEX event_hospital_ix ON engage.event (hospital_id, created_at DESC) WHERE hospital_id IS NOT NULL;
CREATE INDEX event_touser_ix   ON engage.event (to_user_id, created_at DESC) WHERE to_user_id IS NOT NULL;

-- Fill the area chain from the facility, and the sender from the request.
CREATE OR REPLACE FUNCTION engage.event_fill_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, util.ctx_user_id());
  IF NEW.district_id IS NULL AND NEW.hospital_id IS NOT NULL THEN
    SELECT district_id INTO NEW.district_id FROM org.hospital WHERE id = NEW.hospital_id;
  END IF;
  IF NEW.district_id IS NULL AND NEW.pharmacy_id IS NOT NULL THEN
    SELECT district_id INTO NEW.district_id FROM org.pharmacy WHERE id = NEW.pharmacy_id;
  END IF;
  IF NEW.state_id IS NULL AND NEW.district_id IS NOT NULL THEN
    SELECT state_id INTO NEW.state_id FROM geo.district WHERE id = NEW.district_id;
  END IF;
  IF NEW.zone_id IS NULL AND NEW.state_id IS NOT NULL THEN
    SELECT zone_id INTO NEW.zone_id FROM geo.state WHERE id = NEW.state_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER event_scope BEFORE INSERT ON engage.event
  FOR EACH ROW EXECUTE FUNCTION engage.event_fill_scope();
CREATE TRIGGER event_immutable BEFORE UPDATE OR DELETE ON engage.event
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Per-user read state (one row = "this user has read this event").
CREATE TABLE engage.event_read (
  event_id  uuid NOT NULL REFERENCES engage.event(id),
  user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_read_user_ix ON engage.event_read (user_id, read_at DESC);

-- Can the CURRENT request see this event?  (used by the row-level-security policy)
CREATE OR REPLACE FUNCTION engage.event_visible(
  p_to_roles engage.event_role[], p_created_by uuid, p_to_user uuid, p_patient uuid,
  p_hospital uuid, p_pharmacy uuid, p_district uuid, p_state smallint, p_zone smallint)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid := util.ctx_user_id(); v record;
BEGIN
  IF me IS NULL THEN RETURN false; END IF;
  IF p_created_by = me THEN RETURN true; END IF;                 -- the sender sees what they sent
  IF p_to_user IS NOT NULL THEN RETURN p_to_user = me; END IF;   -- direct message: only the recipient
  SELECT * INTO v FROM engage.viewer_scope(me);
  IF v.event_role IS NULL OR NOT (v.event_role = ANY (p_to_roles)) THEN RETURN false; END IF;

  IF v.event_role = 'citizen' THEN
    -- about one patient: only that patient (or the guardian of a minor)
    IF p_patient IS NOT NULL THEN RETURN util.can_read_patient(p_patient); END IF;
    -- broadcast: national, or the citizen's own district / state / zone
    RETURN (p_district IS NULL OR p_district = v.district_id)
       AND (p_state    IS NULL OR p_state    = v.state_id)
       AND (p_zone     IS NULL OR p_zone     = v.zone_id);
  ELSIF v.event_role IN ('doctor','nurse','labtech','radiology','hospitaladmin') THEN
    IF p_hospital IS NOT NULL AND p_hospital IS DISTINCT FROM v.hospital_id THEN RETURN false; END IF;
    IF p_patient IS NOT NULL AND p_hospital IS NULL THEN RETURN false; END IF;   -- patient events: own hospital only
    RETURN (p_district IS NULL OR p_district = v.district_id)
       AND (p_state    IS NULL OR p_state    = v.state_id)
       AND (p_zone     IS NULL OR p_zone     = v.zone_id);
  ELSIF v.event_role IN ('pharmacist','pharmacyadmin') THEN
    IF p_pharmacy IS NOT NULL AND p_pharmacy IS DISTINCT FROM v.pharmacy_id THEN RETURN false; END IF;
    IF p_patient IS NOT NULL AND p_pharmacy IS NULL THEN RETURN false; END IF;   -- patient events: own pharmacy only
    RETURN (p_district IS NULL OR p_district = v.district_id)
       AND (p_state    IS NULL OR p_state    = v.state_id)
       AND (p_zone     IS NULL OR p_zone     = v.zone_id);
  ELSE
    -- district / state / zonal / central admins: never patient events; area must overlap their post
    IF p_patient IS NOT NULL THEN RETURN false; END IF;
    RETURN (p_district IS NULL OR v.district_id IS NULL OR p_district = v.district_id)
       AND (p_state    IS NULL OR v.state_id    IS NULL OR p_state    = v.state_id)
       AND (p_zone     IS NULL OR v.zone_id     IS NULL OR p_zone     = v.zone_id);
  END IF;
END $$;

ALTER TABLE engage.event ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_read ON engage.event FOR SELECT TO cf_app
  USING (engage.event_visible(to_roles, created_by_user_id, to_user_id, patient_person_id,
                              hospital_id, pharmacy_id, district_id, state_id, zone_id));
-- Cannot send as someone else, cannot claim another role, a citizen can only speak about themself.
CREATE POLICY event_insert ON engage.event FOR INSERT TO cf_app
  WITH CHECK (created_by_user_id = util.ctx_user_id()
              AND from_role = engage.event_role_of(util.ctx_user_id())
              AND (util.ctx_account_type() <> 'citizen'
                   OR patient_person_id IS NULL OR patient_person_id = util.ctx_person_id()));

ALTER TABLE engage.event_read ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_read_own ON engage.event_read FOR SELECT TO cf_app USING (user_id = util.ctx_user_id());
CREATE POLICY event_read_ins ON engage.event_read FOR INSERT TO cf_app
  WITH CHECK (user_id = util.ctx_user_id()
              AND EXISTS (SELECT 1 FROM engage.event e WHERE e.id = event_id));   -- event must be visible to me
CREATE POLICY event_read_upd ON engage.event_read FOR UPDATE TO cf_app USING (user_id = util.ctx_user_id());

-- What the app reads: my visible events + my read state (RLS applies to the caller).
CREATE VIEW engage.v_my_events WITH (security_invoker = true) AS
SELECT e.id, e.type, t.label AS type_label, t.chip, t.chip_tone, e.from_role, e.to_roles,
       e.title, e.text, e.href, e.entity_type, e.entity_id, e.patient_person_id,
       e.created_at,
       (r.event_id IS NOT NULL) AS is_read, r.read_at,
       COALESCE(e.created_by_user_id = util.ctx_user_id(), false) AS sent_by_me      -- system events: false, not NULL
FROM engage.event e
JOIN engage.event_type_ref t ON t.code = e.type
LEFT JOIN engage.event_read r ON r.event_id = e.id AND r.user_id = util.ctx_user_id();

-- Bell badge: unread events sent to me (not by me).
CREATE OR REPLACE FUNCTION engage.unread_event_count() RETURNS int
LANGUAGE sql STABLE AS $$
  SELECT count(*)::int FROM engage.v_my_events WHERE NOT is_read AND NOT sent_by_me
$$;

-- "Mark all read" / mark some read. Only events I can see are marked (RLS).
CREATE OR REPLACE FUNCTION engage.mark_events_read(p_ids uuid[] DEFAULT NULL) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  INSERT INTO engage.event_read (event_id, user_id)
  SELECT e.id, util.ctx_user_id() FROM engage.event e
   WHERE (p_ids IS NULL OR e.id = ANY (p_ids))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- =====================================================================
-- NOTIFICATION DELIVERY + PREFERENCES
-- =====================================================================
ALTER TYPE engage.channel ADD VALUE IF NOT EXISTS 'in_app';
ALTER TYPE engage.channel ADD VALUE IF NOT EXISTS 'whatsapp';

ALTER TABLE engage.notification ADD COLUMN event_id uuid;     -- delivery of an event (no FK: partitioned hot table)
ALTER TABLE engage.notification ADD COLUMN kind text;
ALTER TABLE engage.notification ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','emergency'));

CREATE TYPE engage.pref_category AS ENUM (
  'health_dept','my_care','record_opened','blood_requests','appointment_reminders',
  'medicine_reminders','monthly_summary','emergency');
-- Emergency alerts cannot be switched off (Disaster Management Act) — enforced below.
CREATE TABLE engage.notification_pref (
  user_id     uuid NOT NULL REFERENCES identity.app_user(id),
  category    engage.pref_category NOT NULL,
  channel     text NOT NULL CHECK (channel IN ('app','sms','email','whatsapp')),
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category, channel),
  CONSTRAINT emergency_always_on CHECK (category::text <> 'emergency' OR enabled)
);
CREATE TRIGGER notification_pref_updated BEFORE UPDATE ON engage.notification_pref
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- =====================================================================
-- CITIZEN SETTINGS, SHARING, EXPORT, DELETION, FAMILY
-- =====================================================================
CREATE TABLE identity.user_preference (
  user_id                 uuid PRIMARY KEY REFERENCES identity.app_user(id),
  text_size               text NOT NULL DEFAULT 'default' CHECK (text_size IN ('small','default','large','xlarge')),
  high_contrast           boolean NOT NULL DEFAULT false,
  reduce_motion           boolean NOT NULL DEFAULT false,
  read_aloud              boolean NOT NULL DEFAULT false,
  show_english_terms      boolean NOT NULL DEFAULT true,
  face_check_new_device   boolean NOT NULL DEFAULT true,
  quiet_hours             jsonb NOT NULL DEFAULT '{"enabled":true,"from":"22:00","to":"07:00"}'::jsonb,
  extra                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER user_preference_updated BEFORE UPDATE ON identity.user_preference
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- "What a doctor can see" switches. The emergency card is always visible and is not stored here.
CREATE TYPE identity.share_category AS ENUM ('lab','rx','vitals','imaging','genomic','mental_health');
CREATE TABLE identity.share_preference (
  person_id   uuid NOT NULL REFERENCES identity.person(id),
  category    identity.share_category NOT NULL,
  enabled     boolean NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, category)
);   -- default when no row: lab/rx/vitals ON; imaging/genomic/mental_health OFF (applied by the API)
CREATE TRIGGER share_preference_updated BEFORE UPDATE ON identity.share_preference
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

CREATE TABLE identity.data_export_request (
  id            uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  person_id     uuid NOT NULL REFERENCES identity.person(id),
  format        text NOT NULL DEFAULT 'zip' CHECK (format IN ('zip','fhir')),
  status        text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','preparing','ready','expired','failed')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  ready_at      timestamptz,
  expires_at    timestamptz,
  storage_key   text,
  size_bytes    bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CHECK (status <> 'ready' OR storage_key IS NOT NULL)
);
CREATE INDEX data_export_person_ix ON identity.data_export_request (person_id, requested_at DESC);

-- Accounts are never deleted (decision 2026-10-10): a request deactivates the login after the grace period.
CREATE TABLE identity.account_deletion_request (
  id            uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  person_id     uuid NOT NULL REFERENCES identity.person(id),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  grace_until   timestamptz NOT NULL DEFAULT now() + interval '30 days',
  cancelled_at  timestamptz,
  completed_at  timestamptz,
  reason        text,
  CHECK (cancelled_at IS NULL OR completed_at IS NULL)
);
CREATE UNIQUE INDEX account_deletion_open_uq ON identity.account_deletion_request (person_id)
  WHERE cancelled_at IS NULL AND completed_at IS NULL;

-- Adult family links ("can show your key for you"). Minors stay on citizen_profile.guardian_person_id.
CREATE TABLE identity.family_link (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  citizen_person_id  uuid NOT NULL REFERENCES identity.person(id),
  member_person_id   uuid NOT NULL REFERENCES identity.person(id),
  relation           text NOT NULL,
  can_show_key       boolean NOT NULL DEFAULT false,
  requested_at       timestamptz NOT NULL DEFAULT now(),
  accepted_at        timestamptz,
  removed_at         timestamptz,
  CHECK (citizen_person_id <> member_person_id),
  CHECK (NOT can_show_key OR accepted_at IS NOT NULL)        -- member must accept before acting for the citizen
);
CREATE UNIQUE INDEX family_link_active_uq ON identity.family_link (citizen_person_id, member_person_id) WHERE removed_at IS NULL;
CREATE INDEX family_link_member_ix ON identity.family_link (member_person_id) WHERE removed_at IS NULL;

ALTER TABLE identity.device ADD COLUMN last_ip_area text;
ALTER TABLE identity.device ADD COLUMN last_city text;
ALTER TABLE identity.device ADD COLUMN user_agent text;

-- How the person was registered (registration-channel split on the admin overview).
CREATE TYPE identity.registration_channel AS ENUM ('citizen_app','help_desk','asha','hospital_staff');
ALTER TABLE identity.person ADD COLUMN registration_channel identity.registration_channel NOT NULL DEFAULT 'citizen_app';

-- ---------- Row-level security on citizen-owned settings ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['identity.share_preference','identity.data_export_request','identity.account_deletion_request'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own_rows ON %s FOR ALL TO cf_app
                    USING (person_id = util.ctx_person_id() AND util.ctx_account_type() = ''citizen'')
                    WITH CHECK (person_id = util.ctx_person_id() AND util.ctx_account_type() = ''citizen'')', t);
  END LOOP;
END $$;
-- A doctor with a live session reads the sharing switches of that patient (to honour them).
CREATE POLICY doctor_reads_share ON identity.share_preference FOR SELECT TO cf_app
  USING (util.can_read_patient(person_id));

ALTER TABLE identity.user_preference ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON identity.user_preference FOR ALL TO cf_app
  USING (user_id = util.ctx_user_id()) WITH CHECK (user_id = util.ctx_user_id());
ALTER TABLE engage.notification_pref ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON engage.notification_pref FOR ALL TO cf_app
  USING (user_id = util.ctx_user_id()) WITH CHECK (user_id = util.ctx_user_id());

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA engage, identity TO cf_app;
GRANT SELECT ON engage.event_type_ref TO cf_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA engage, identity TO cf_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA engage, identity FROM cf_app, cf_ai, cf_report, cf_auditor;

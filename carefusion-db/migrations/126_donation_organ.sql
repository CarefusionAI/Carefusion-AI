-- =====================================================================
-- 126_donation_organ.sql : blood donor id + checklist, donation type / Hb / camps,
--   blood banks + stock readings + days of cover, donation camps + pledges,
--   organ pledge steps (intent -> family informed -> signing -> registered),
--   witnesses, next-of-kin notices, KNOS status, transplant centres,
--   waiting-list snapshots, transplant coordinators + restricted lookup log.
-- Assumptions: organ-pledge witness rule (2 witnesses, at least 1 relative) comes from the
--   design, not from the Act; brain-stem-death lookup is allowed only to a designated
--   transplant coordinator and is logged (verify with NOTTO rules before go-live).
-- Rule codes: CF150 (pledge needs 2 witnesses incl. 1 relative), CF151 (unknown organ),
--   CF152 (lookup right), CF153 (donation needs hospital or camp).
-- =====================================================================

-- ---------- Blood donors ----------
CREATE SEQUENCE donation.donor_code_seq START 30417;
ALTER TABLE donation.blood_donor ADD COLUMN donor_code text UNIQUE;                -- DEMO-BD-KL-30417
ALTER TABLE donation.blood_donor ADD COLUMN notify_circle boolean NOT NULL DEFAULT false;   -- "notify my circle"
CREATE OR REPLACE FUNCTION donation.donor_code_default() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.donor_code IS NULL THEN
    NEW.donor_code := 'DEMO-BD-KL-' || nextval('donation.donor_code_seq')::text;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER blood_donor_code BEFORE INSERT ON donation.blood_donor
  FOR EACH ROW EXECUTE FUNCTION donation.donor_code_default();

-- Pre-donation self-check (age, weight, diabetes, illness …). Kept as history.
CREATE TABLE donation.donor_checklist (
  id             uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  person_id      uuid NOT NULL REFERENCES identity.person(id),
  answered_at    timestamptz NOT NULL DEFAULT now(),
  weight_kg      numeric(5,1) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 250),
  has_diabetes   boolean,
  recent_illness boolean,
  on_medication  boolean,
  answers        jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligible       boolean NOT NULL,
  reasons        text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX donor_checklist_person_ix ON donation.donor_checklist (person_id, answered_at DESC);
CREATE TRIGGER donor_checklist_immutable BEFORE UPDATE OR DELETE ON donation.donor_checklist FOR EACH ROW EXECUTE FUNCTION util.forbid_change();
ALTER TABLE donation.donor_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON donation.donor_checklist FOR ALL TO cf_app
  USING (person_id = util.ctx_person_id()) WITH CHECK (person_id = util.ctx_person_id());

-- ---------- Blood banks, stock readings, camps ----------
CREATE TABLE donation.blood_bank (
  id           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  name         text NOT NULL,
  hospital_id  uuid REFERENCES org.hospital(id),
  district_id  uuid NOT NULL REFERENCES geo.district(id),
  kind         text NOT NULL DEFAULT 'govt' CHECK (kind IN ('govt','private','red_cross','ngo')),
  address      text,
  phone        text,
  location     geometry(Point, 4326),
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active    boolean NOT NULL DEFAULT true,
  UNIQUE (district_id, name)
);
CREATE INDEX blood_bank_location_gix ON donation.blood_bank USING gist (location);

CREATE TABLE donation.blood_stock_reading (
  id               uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  bank_id          uuid NOT NULL REFERENCES donation.blood_bank(id),
  blood_group      identity.blood_group NOT NULL CHECK (blood_group <> 'unknown'),
  units            int NOT NULL CHECK (units >= 0),
  daily_use_units  numeric(8,2) NOT NULL DEFAULT 0 CHECK (daily_use_units >= 0),   -- average use per day, for days of cover
  as_of            timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES identity.app_user(id)
);
CREATE INDEX blood_stock_reading_ix ON donation.blood_stock_reading (bank_id, blood_group, as_of DESC);
CREATE TRIGGER blood_stock_reading_immutable BEFORE UPDATE OR DELETE ON donation.blood_stock_reading FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE VIEW donation.v_blood_stock_latest AS
SELECT DISTINCT ON (bank_id, blood_group) bank_id, blood_group, units, daily_use_units, as_of,
       CASE WHEN daily_use_units > 0 THEN round(units / daily_use_units, 1) END AS days_cover
FROM donation.blood_stock_reading ORDER BY bank_id, blood_group, as_of DESC;

-- Days of cover per district and blood group: low if under 4 days (design thresholds: <4 low, <7 watch).
CREATE VIEW report.v_blood_cover AS
SELECT b.district_id, l.blood_group, sum(l.units)::int AS units,
       CASE WHEN sum(l.daily_use_units) > 0 THEN round(sum(l.units) / sum(l.daily_use_units), 1) END AS days_cover,
       CASE WHEN sum(l.daily_use_units) > 0 AND sum(l.units) / sum(l.daily_use_units) < 4 THEN 'low'
            WHEN sum(l.daily_use_units) > 0 AND sum(l.units) / sum(l.daily_use_units) < 7 THEN 'watch'
            ELSE 'good' END AS level
FROM donation.v_blood_stock_latest l JOIN donation.blood_bank b ON b.id = l.bank_id
GROUP BY b.district_id, l.blood_group;

CREATE TABLE donation.blood_camp (
  id                 uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  name               text NOT NULL,
  district_id        uuid NOT NULL REFERENCES geo.district(id),
  host_hospital_id   uuid REFERENCES org.hospital(id),
  blood_bank_id      uuid REFERENCES donation.blood_bank(id),
  venue              text NOT NULL,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  target_units       int CHECK (target_units IS NULL OR target_units > 0),
  status             text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','done','cancelled')),
  organiser_user_id  uuid REFERENCES identity.app_user(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX blood_camp_upcoming_ix ON donation.blood_camp (district_id, starts_at) WHERE status IN ('planned','open');
CREATE TABLE donation.camp_pledge (
  camp_id          uuid NOT NULL REFERENCES donation.blood_camp(id),
  donor_person_id  uuid NOT NULL REFERENCES identity.person(id),
  pledged_at       timestamptz NOT NULL DEFAULT now(),
  attended_at      timestamptz,
  PRIMARY KEY (camp_id, donor_person_id)
);

-- A donation happens at a hospital or at a camp (camp donations have no hospital row).
ALTER TABLE donation.blood_donation ALTER COLUMN hospital_id DROP NOT NULL;
ALTER TABLE donation.blood_donation ADD COLUMN camp_id uuid REFERENCES donation.blood_camp(id);
ALTER TABLE donation.blood_donation ADD COLUMN blood_bank_id uuid REFERENCES donation.blood_bank(id);
ALTER TABLE donation.blood_donation ADD COLUMN donation_type text NOT NULL DEFAULT 'whole' CHECK (donation_type IN ('whole','platelets','plasma','double_red'));
ALTER TABLE donation.blood_donation ADD COLUMN hb_value numeric(3,1) CHECK (hb_value IS NULL OR hb_value BETWEEN 5 AND 25);
ALTER TABLE donation.blood_donation ADD COLUMN volume_ml smallint CHECK (volume_ml IS NULL OR volume_ml BETWEEN 50 AND 1000);
ALTER TABLE donation.blood_donation ADD CONSTRAINT blood_donation_place CHECK (num_nonnulls(hospital_id, camp_id) >= 1);   -- CF153 (as a constraint)

-- Donor tier from the number of donations (derived, not stored).
CREATE VIEW donation.v_donor_summary WITH (security_invoker = true) AS
SELECT d.person_id, d.donor_code, d.ready, d.eligible_from, d.last_donation_at,
       (SELECT count(*) FROM donation.blood_donation b WHERE b.donor_person_id = d.person_id)::int AS donations,
       CASE WHEN (SELECT count(*) FROM donation.blood_donation b WHERE b.donor_person_id = d.person_id) >= 25 THEN 'gold'
            WHEN (SELECT count(*) FROM donation.blood_donation b WHERE b.donor_person_id = d.person_id) >= 10 THEN 'silver'
            WHEN (SELECT count(*) FROM donation.blood_donation b WHERE b.donor_person_id = d.person_id) >= 3 THEN 'bronze'
            ELSE 'new' END AS tier,
       (SELECT count(*) FROM donation.blood_donation b WHERE b.donor_person_id = d.person_id) * 3 AS lives_helped   -- 1 whole donation can help up to 3 people
FROM donation.blood_donor d;

-- ---------- Organ and tissue pledge ----------
CREATE TABLE donation.organ_type (
  code     citext PRIMARY KEY,
  name     text NOT NULL,
  kind     text NOT NULL CHECK (kind IN ('organ','tissue')),
  is_active boolean NOT NULL DEFAULT true
);
CREATE OR REPLACE FUNCTION donation.check_organs() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE o text;
BEGIN
  FOREACH o IN ARRAY NEW.organs LOOP
    IF NOT EXISTS (SELECT 1 FROM donation.organ_type WHERE code = o AND is_active) THEN
      RAISE EXCEPTION 'CF151: unknown organ or tissue "%"', o USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER organ_pledge_organs BEFORE INSERT OR UPDATE OF organs ON donation.organ_pledge
  FOR EACH ROW EXECUTE FUNCTION donation.check_organs();

-- Pledge steps: hospital, witnessing doctor and signed document are filled only at the signing step.
ALTER TABLE donation.organ_pledge ALTER COLUMN hospital_id DROP NOT NULL;
ALTER TABLE donation.organ_pledge ALTER COLUMN witnessing_doctor_user_id DROP NOT NULL;
ALTER TABLE donation.organ_pledge ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE donation.organ_pledge ADD COLUMN status text NOT NULL DEFAULT 'registered'
  CHECK (status IN ('intent','family_informed','signing','registered','withdrawn'));
ALTER TABLE donation.organ_pledge ADD COLUMN family_informed_at timestamptz;
ALTER TABLE donation.organ_pledge ADD COLUMN knos_status text NOT NULL DEFAULT 'not_sent' CHECK (knos_status IN ('not_sent','submitted','registered','rejected'));
ALTER TABLE donation.organ_pledge ADD COLUMN knos_ref text;
ALTER TABLE donation.organ_pledge ALTER COLUMN status SET DEFAULT 'intent';
ALTER TABLE donation.organ_pledge ADD CONSTRAINT organ_pledge_registered_complete
  CHECK (status <> 'registered' OR (hospital_id IS NOT NULL AND witnessing_doctor_user_id IS NOT NULL AND document_id IS NOT NULL));
DROP TRIGGER organ_pledge_limited_update ON donation.organ_pledge;
CREATE TRIGGER organ_pledge_limited_update BEFORE UPDATE ON donation.organ_pledge
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns(
    'organs','status','family_informed_at','hospital_id','witnessing_doctor_user_id','document_id','pledged_at',
    'verification_status','notto_ref','knos_status','knos_ref','withdrawn_at');
-- Once registered only verification, registry references and withdrawal can still change.
CREATE TRIGGER organ_pledge_registered_lock BEFORE UPDATE ON donation.organ_pledge
  FOR EACH ROW WHEN (OLD.status = 'registered')
  EXECUTE FUNCTION util.allow_only_columns('status','verification_status','notto_ref','knos_status','knos_ref','withdrawn_at');

CREATE TABLE donation.organ_witness (
  id                uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  pledge_id         uuid NOT NULL REFERENCES donation.organ_pledge(id),
  full_name         text NOT NULL,
  relation          text NOT NULL,
  is_relative       boolean NOT NULL DEFAULT false,
  person_id         uuid REFERENCES identity.person(id),          -- if the witness is also a registered citizen
  link_token_hash   bytea UNIQUE,                                  -- signing link (only the hash is stored)
  link_expires_at   timestamptz,
  signed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organ_witness_pledge_ix ON donation.organ_witness (pledge_id);
CREATE TRIGGER organ_witness_sign_only BEFORE UPDATE ON donation.organ_witness
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('signed_at','link_token_hash','link_expires_at');

CREATE TABLE donation.next_of_kin_notice (
  id                uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  pledge_id         uuid NOT NULL REFERENCES donation.organ_pledge(id),
  person_id         uuid REFERENCES identity.person(id),
  full_name         text NOT NULL,
  relation          text NOT NULL,
  channel           text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','app','email','in_person')),
  notified_at       timestamptz,
  acknowledged_at   timestamptz
);
CREATE INDEX next_of_kin_pledge_ix ON donation.next_of_kin_notice (pledge_id);

-- Registering a pledge needs two signed witnesses, at least one a relative.
CREATE OR REPLACE FUNCTION donation.check_pledge_witnesses() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE n int; rel int;
BEGIN
  IF NEW.status = 'registered' AND OLD.status <> 'registered' THEN
    SELECT count(*), count(*) FILTER (WHERE is_relative) INTO n, rel
      FROM donation.organ_witness WHERE pledge_id = NEW.id AND signed_at IS NOT NULL;
    IF n < 2 OR rel < 1 THEN
      RAISE EXCEPTION 'CF150: a pledge needs 2 signed witnesses, at least one a relative (has %, relatives %)', n, rel
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER organ_pledge_witness_rule BEFORE UPDATE ON donation.organ_pledge
  FOR EACH ROW EXECUTE FUNCTION donation.check_pledge_witnesses();

-- Citizens see their own pledge; the witnessing doctor sees pledges they witnessed.
ALTER TABLE donation.organ_pledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY pledge_owner ON donation.organ_pledge FOR ALL TO cf_app
  USING (person_id = util.ctx_person_id() OR witnessing_doctor_user_id = util.ctx_user_id())
  WITH CHECK (person_id = util.ctx_person_id() OR witnessing_doctor_user_id = util.ctx_user_id());
ALTER TABLE donation.organ_witness ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_pledge ON donation.organ_witness FOR ALL TO cf_app
  USING (EXISTS (SELECT 1 FROM donation.organ_pledge p WHERE p.id = pledge_id))
  WITH CHECK (EXISTS (SELECT 1 FROM donation.organ_pledge p WHERE p.id = pledge_id));
ALTER TABLE donation.next_of_kin_notice ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_pledge ON donation.next_of_kin_notice FOR ALL TO cf_app
  USING (EXISTS (SELECT 1 FROM donation.organ_pledge p WHERE p.id = pledge_id))
  WITH CHECK (EXISTS (SELECT 1 FROM donation.organ_pledge p WHERE p.id = pledge_id));

-- ---------- Transplant centres, waiting list snapshots ----------
CREATE TABLE donation.transplant_centre (
  id           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  name         text NOT NULL,
  hospital_id  uuid REFERENCES org.hospital(id),
  state_id     smallint NOT NULL REFERENCES geo.state(id),
  organs       text[] NOT NULL DEFAULT '{}',
  certified_on date,
  is_active    boolean NOT NULL DEFAULT true,
  UNIQUE (state_id, name)
);
CREATE TABLE donation.organ_waitlist_snapshot (
  id                uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  state_id          smallint NOT NULL REFERENCES geo.state(id),
  organ             citext NOT NULL REFERENCES donation.organ_type(code),
  waiting           int NOT NULL CHECK (waiting >= 0),
  median_wait_days  int CHECK (median_wait_days IS NULL OR median_wait_days >= 0),
  transplants_ytd   int NOT NULL DEFAULT 0 CHECK (transplants_ytd >= 0),
  as_of             date NOT NULL DEFAULT current_date,
  UNIQUE (state_id, organ, as_of)
);

-- ---------- Transplant coordinators and the restricted lookup ----------
CREATE TABLE donation.transplant_coordinator (
  user_id               uuid PRIMARY KEY REFERENCES identity.app_user(id),     -- a doctor account
  centre_id             uuid NOT NULL REFERENCES donation.transplant_centre(id),
  designated_by_user_id uuid NOT NULL REFERENCES identity.app_user(id),
  valid                 tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),
  CHECK (designated_by_user_id <> user_id)
);
CREATE TABLE donation.organ_lookup_log (
  id                    uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  coordinator_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  person_id             uuid NOT NULL REFERENCES identity.person(id),
  death_certificate_ref text NOT NULL CHECK (length(trim(death_certificate_ref)) > 0),   -- brain-stem death certification
  reason                text NOT NULL CHECK (length(trim(reason)) >= 10),
  looked_up_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organ_lookup_person_ix ON donation.organ_lookup_log (person_id, looked_up_at DESC);
CREATE TRIGGER organ_lookup_log_immutable BEFORE UPDATE OR DELETE ON donation.organ_lookup_log FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- The ONLY way a doctor sees someone's pledge without being its witness: a designated coordinator,
-- with a certificate reference, and every use is logged (and goes to the audit trail).
CREATE OR REPLACE FUNCTION donation.lookup_organ_pledge(p_person uuid, p_cert_ref text, p_reason text)
RETURNS TABLE (person_id uuid, organs text[], status text, hospital_id uuid, next_of_kin jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM donation.transplant_coordinator c
                 WHERE c.user_id = util.ctx_user_id() AND c.valid @> now()) THEN
    RAISE EXCEPTION 'CF152: only a designated transplant coordinator can look up a pledge' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO donation.organ_lookup_log (coordinator_user_id, person_id, death_certificate_ref, reason)
  VALUES (util.ctx_user_id(), p_person, p_cert_ref, p_reason);
  PERFORM audit.log('organ.lookup', 'person', p_person, p_person, NULL, jsonb_build_object('certificate', p_cert_ref));
  RETURN QUERY
  SELECT p.person_id, p.organs, p.status, p.hospital_id,
         (SELECT coalesce(jsonb_agg(jsonb_build_object('name', n.full_name, 'relation', n.relation)), '[]'::jsonb)
            FROM donation.next_of_kin_notice n WHERE n.pledge_id = p.id)
  FROM donation.organ_pledge p
  WHERE p.person_id = p_person AND p.withdrawn_at IS NULL AND p.status = 'registered';
END $$;

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA donation TO cf_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA donation TO cf_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA donation TO cf_app;
GRANT SELECT ON ALL TABLES IN SCHEMA report TO cf_report;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA donation FROM cf_app, cf_ai, cf_report, cf_auditor;

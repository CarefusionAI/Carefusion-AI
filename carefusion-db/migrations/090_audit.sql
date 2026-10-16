-- =====================================================================
-- 090_audit.sql : tamper-proof activity log (append-only, hash-chained),
--                 daily chain heads, log-view permissions
-- Production scale: one hash chain per "stream" (one per state/UT +
-- stream 0 for national/central actions) so 37 chains are written in
-- parallel instead of one global bottleneck.
-- =====================================================================

CREATE SEQUENCE audit.activity_seq AS bigint;

CREATE TABLE audit.chain_tip (
  stream_id    smallint PRIMARY KEY,                -- 0 = national, else geo.state.id
  last_seq     bigint NOT NULL,
  last_hash    bytea NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
) WITH (fillfactor = 50);   -- hot row: leave room for HOT updates

CREATE TABLE audit.activity_log (
  seq                 bigint NOT NULL,              -- assigned by chain_row() AFTER the stream lock
  stream_id           smallint NOT NULL DEFAULT 0,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  user_id             uuid,                          -- null for system jobs
  account_type        identity.account_type,
  action              text NOT NULL,                 -- session.open, document.view, ai.run, rx.sign …
  entity_type         text,
  entity_id           uuid,
  patient_person_id   uuid,
  session_id          uuid,
  ip                  inet,
  ip_area             text,
  gps_point           geometry(Point, 4326),         -- null if location refused (decided)
  device_id           uuid,
  user_agent          text,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- never health content
  prev_hash           bytea NOT NULL,
  row_hash            bytea NOT NULL,
  PRIMARY KEY (seq, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX activity_user_ix    ON audit.activity_log (user_id, occurred_at DESC);
CREATE INDEX activity_patient_ix ON audit.activity_log (patient_person_id, occurred_at DESC) WHERE patient_person_id IS NOT NULL;
CREATE INDEX activity_stream_ix  ON audit.activity_log (stream_id, seq);
CREATE TABLE audit.activity_log_default PARTITION OF audit.activity_log DEFAULT;

-- Canonical text of a row for hashing (order and format must never change).
CREATE OR REPLACE FUNCTION audit.canonical(r audit.activity_log) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT concat_ws('|',
    r.seq, r.stream_id, to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    r.user_id, r.account_type, r.action, r.entity_type, r.entity_id, r.patient_person_id,
    r.session_id, host(r.ip), r.ip_area, ST_AsText(r.gps_point), r.device_id, r.user_agent,
    r.details::text, encode(r.prev_hash, 'hex'))
$$;

-- Chain the new row onto its stream (row lock on the stream tip serialises one stream only).
CREATE OR REPLACE FUNCTION audit.chain_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE tip audit.chain_tip;
BEGIN
  NEW.occurred_at := COALESCE(NEW.occurred_at, now());
  SELECT * INTO tip FROM audit.chain_tip WHERE stream_id = NEW.stream_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO audit.chain_tip (stream_id, last_seq, last_hash)
    VALUES (NEW.stream_id, 0, digest('CAREFUSION-GENESIS-' || NEW.stream_id, 'sha256'))
    ON CONFLICT (stream_id) DO NOTHING;
    SELECT * INTO tip FROM audit.chain_tip WHERE stream_id = NEW.stream_id FOR UPDATE;
  END IF;
  -- Number the row only now, while holding the stream lock (held until commit),
  -- so seq order = chain order within a stream even with many parallel writers.
  NEW.seq := nextval('audit.activity_seq');
  NEW.prev_hash := tip.last_hash;
  NEW.row_hash  := '\x00'::bytea;                   -- placeholder for canonical()
  NEW.row_hash  := digest(audit.canonical(NEW), 'sha256');
  UPDATE audit.chain_tip SET last_seq = NEW.seq, last_hash = NEW.row_hash, updated_at = now()
   WHERE stream_id = NEW.stream_id;
  RETURN NEW;
END $$;
CREATE TRIGGER activity_chain BEFORE INSERT ON audit.activity_log
  FOR EACH ROW EXECUTE FUNCTION audit.chain_row();
CREATE TRIGGER activity_immutable BEFORE UPDATE OR DELETE ON audit.activity_log
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Verify a stream: returns the first broken seq, or NULL if the chain is intact.
CREATE OR REPLACE FUNCTION audit.verify_chain(p_stream smallint, p_from timestamptz DEFAULT '-infinity',
                                              p_to timestamptz DEFAULT 'infinity')
RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE
  r audit.activity_log;
  expected_prev bytea := NULL;
BEGIN
  FOR r IN SELECT * FROM audit.activity_log
           WHERE stream_id = p_stream AND occurred_at BETWEEN p_from AND p_to
           ORDER BY seq LOOP
    IF expected_prev IS NOT NULL AND r.prev_hash <> expected_prev THEN
      RETURN r.seq;                                  -- link broken (row removed or reordered)
    END IF;
    IF r.row_hash <> digest(audit.canonical(r), 'sha256') THEN
      RETURN r.seq;                                  -- row content changed
    END IF;
    expected_prev := r.row_hash;
  END LOOP;
  RETURN NULL;
END $$;

-- Daily chain heads (also copied to write-once object storage by a job).
CREATE TABLE audit.chain_head (
  day          date NOT NULL,
  stream_id    smallint NOT NULL,
  last_seq     bigint NOT NULL,
  last_hash    bytea NOT NULL,
  exported_to  text,                                 -- object-lock key in R2 / MeitY storage
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, stream_id)
);
CREATE TRIGGER chain_head_immutable BEFORE UPDATE OR DELETE ON audit.chain_head
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE OR REPLACE FUNCTION audit.snapshot_chain_heads(p_day date DEFAULT current_date) RETURNS int
LANGUAGE sql AS $$
  WITH ins AS (
    INSERT INTO audit.chain_head (day, stream_id, last_seq, last_hash)
    SELECT p_day, stream_id, last_seq, last_hash FROM audit.chain_tip
    ON CONFLICT DO NOTHING RETURNING 1)
  SELECT count(*)::int FROM ins;
$$;

-- State admins see logs only with central admin's permission.
CREATE TABLE audit.log_view_grant (
  id                     uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  state_admin_user_id    uuid NOT NULL REFERENCES identity.app_user(id),
  granted_by_user_id     uuid NOT NULL REFERENCES identity.app_user(id),   -- central admin
  scope                  jsonb NOT NULL,              -- {"state_id":12,"user_ids":[…],"from":…,"to":…}
  valid                  tstzrange NOT NULL,
  reason                 text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  revoked_at             timestamptz
);
CREATE TRIGGER log_view_grant_revoke_only BEFORE UPDATE ON audit.log_view_grant
  FOR EACH ROW EXECUTE FUNCTION util.allow_only_columns('revoked_at');

-- Helper the API calls for every action (keeps column use consistent).
CREATE OR REPLACE FUNCTION audit.log(
  p_action text, p_entity_type text DEFAULT NULL, p_entity_id uuid DEFAULT NULL,
  p_patient uuid DEFAULT NULL, p_session uuid DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb,
  p_stream smallint DEFAULT 0, p_ip inet DEFAULT NULL, p_ip_area text DEFAULT NULL,
  p_gps geometry DEFAULT NULL, p_device uuid DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE s bigint;
BEGIN
  INSERT INTO audit.activity_log (stream_id, user_id, account_type, action, entity_type, entity_id,
                                  patient_person_id, session_id, ip, ip_area, gps_point, device_id, details)
  VALUES (p_stream, util.ctx_user_id(), util.ctx_account_type()::identity.account_type, p_action,
          p_entity_type, p_entity_id, p_patient, p_session, p_ip, p_ip_area, p_gps, p_device, p_details)
  RETURNING seq INTO s;
  RETURN s;
END $$;

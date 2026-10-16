-- =====================================================================
-- 060_ai.sql : every AI run saved — locked, encrypted, hashed
-- Paper design kept: top-3 hypotheses, VERIFIED / SUPPORTED_WITH_CAUTION /
-- UNCERTAIN, evidence list, disagreement reporting, doctor agree/disagree.
-- =====================================================================

CREATE TYPE ai.tool AS ENUM ('symptom_chat','image','genomic','temporal','citizen_guidance_chat');
CREATE TYPE ai.run_status AS ENUM ('completed','uncertain','timeout','failed');
CREATE TYPE ai.evidence_status AS ENUM ('VERIFIED','SUPPORTED_WITH_CAUTION','UNCERTAIN');
CREATE TYPE ai.evidence_source AS ENUM ('guideline','pubmed','clinvar','regional');
CREATE TYPE ai.verdict AS ENUM ('agree','disagree');

CREATE TABLE ai.ai_run (
  id                   uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  patient_person_id    uuid NOT NULL REFERENCES identity.person(id),
  tool                 ai.tool NOT NULL,
  folder_id            uuid NOT NULL REFERENCES records.folder(id),
  run_by_user_id       uuid NOT NULL REFERENCES identity.app_user(id),
  session_id           uuid REFERENCES access.access_session(id),
  input_document_ids   uuid[] NOT NULL DEFAULT '{}',
  input_enc            bytea NOT NULL,
  output_enc           bytea NOT NULL,
  enc_key_id           text NOT NULL,
  model_name           text NOT NULL,
  model_version        text NOT NULL,                  -- from MLflow
  is_simulated         boolean NOT NULL,               -- TRUE for every alpha run
  status               ai.run_status NOT NULL,
  disagreement_report  jsonb,                          -- Algorithm 1 output
  started_at           timestamptz NOT NULL,
  finished_at          timestamptz NOT NULL,
  result_sha256        bytea NOT NULL CHECK (octet_length(result_sha256) = 32),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (finished_at >= started_at),
  CHECK (tool = 'citizen_guidance_chat' OR session_id IS NOT NULL)   -- doctor tools only inside a session
);
CREATE INDEX ai_run_patient_ix ON ai.ai_run (patient_person_id, tool, created_at DESC);
CREATE TRIGGER ai_run_immutable BEFORE UPDATE OR DELETE ON ai.ai_run
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- The run must be saved in the matching tool folder of the same patient.
CREATE OR REPLACE FUNCTION ai.check_run_folder() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE f records.folder;
BEGIN
  SELECT * INTO f FROM records.folder WHERE id = NEW.folder_id;
  IF f.patient_person_id IS DISTINCT FROM NEW.patient_person_id THEN
    RAISE EXCEPTION 'CF040: AI folder belongs to another patient' USING ERRCODE = 'check_violation';
  END IF;
  IF f.kind::text <> (CASE NEW.tool
       WHEN 'symptom_chat' THEN 'ai_chat' WHEN 'citizen_guidance_chat' THEN 'ai_chat'
       WHEN 'image' THEN 'image_analysis' WHEN 'genomic' THEN 'genomic_analysis'
       WHEN 'temporal' THEN 'temporal_analysis' END) THEN
    RAISE EXCEPTION 'CF041: % runs must be saved in the matching AI folder', NEW.tool USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_run_folder_check BEFORE INSERT ON ai.ai_run
  FOR EACH ROW EXECUTE FUNCTION ai.check_run_folder();

CREATE TABLE ai.ai_hypothesis (
  id               uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  run_id           uuid NOT NULL REFERENCES ai.ai_run(id),
  rank             smallint NOT NULL CHECK (rank BETWEEN 1 AND 3),
  label            text NOT NULL,
  code_system      text,
  code             text,
  confidence       numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_status  ai.evidence_status NOT NULL,
  ranking_score    numeric(5,4) NOT NULL CHECK (ranking_score BETWEEN 0 AND 1),
  UNIQUE (run_id, rank)
);
CREATE TRIGGER ai_hypothesis_immutable BEFORE UPDATE OR DELETE ON ai.ai_hypothesis
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE TABLE ai.ai_evidence (
  id              uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hypothesis_id   uuid NOT NULL REFERENCES ai.ai_hypothesis(id),
  source_type     ai.evidence_source NOT NULL,
  source_ref      text NOT NULL,                       -- PMID, ClinVar id, guideline id
  store           text NOT NULL CHECK (store IN ('global','state')),
  relevance       numeric(5,4) NOT NULL CHECK (relevance BETWEEN 0 AND 1)
);
CREATE INDEX ai_evidence_hyp_ix ON ai.ai_evidence (hypothesis_id);
CREATE TRIGGER ai_evidence_immutable BEFORE UPDATE OR DELETE ON ai.ai_evidence
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

-- Doctor's verdict: one per run, final, required before the patient can see it.
CREATE TABLE ai.ai_review (
  run_id           uuid PRIMARY KEY REFERENCES ai.ai_run(id),
  doctor_user_id   uuid NOT NULL REFERENCES identity.app_user(id),
  verdict          ai.verdict NOT NULL,
  reason           text NOT NULL CHECK (length(trim(reason)) > 0),
  reviewed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_review_immutable BEFORE UPDATE OR DELETE ON ai.ai_review
  FOR EACH ROW EXECUTE FUNCTION util.forbid_change();

CREATE OR REPLACE FUNCTION ai.check_review() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r ai.ai_run; t identity.account_type;
BEGIN
  SELECT * INTO r FROM ai.ai_run WHERE id = NEW.run_id;
  SELECT account_type INTO t FROM identity.app_user WHERE id = NEW.doctor_user_id;
  IF t <> 'doctor' THEN
    RAISE EXCEPTION 'CF042: only a doctor can review an AI result' USING ERRCODE = 'check_violation';
  END IF;
  IF r.tool = 'citizen_guidance_chat' THEN
    RAISE EXCEPTION 'CF043: citizen guidance chats are not reviewed as clinical results' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_review_check BEFORE INSERT ON ai.ai_review
  FOR EACH ROW EXECUTE FUNCTION ai.check_review();

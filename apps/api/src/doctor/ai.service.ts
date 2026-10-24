import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { AIInsight, AiChatMessage, AiChatReply, AiChatRequest, AiImageRequest, AiReviewRequest } from '@carefusion/shared/dist/doctor.js'
import type { AuthenticatedUser } from '../auth/types'
import { DEMO_ENC_KEY, DoctorDbService, DoctorTx, toIso } from './doctor-db.service'
import {
  SIM_LABEL,
  simulateChat,
  simulateGenomic,
  simulateImage,
  simulateTemporal,
  simulateDisagreement,
  type InsightDraft,
  type SimContext,
} from './ai-sim'
import { loadHeader, requireLiveSession, shareFlags, systemFolderId, type LiveSession, type ShareCategory } from './session.helpers'

const FOLDER_KIND = { symptom_chat: 'ai_chat', image: 'image_analysis', genomic: 'genomic_analysis', temporal: 'temporal_analysis' } as const
type StoredTool = keyof typeof FOLDER_KIND

const bytes = (s: string) => Buffer.from(s, 'utf8')
const sha = (b: Buffer) => createHash('sha256').update(b).digest()

@Injectable()
export class AiService {
  constructor(private readonly db: DoctorDbService) {}

  /** The platform switch "AI features" (admin console). Off hides AI everywhere. */
  private async requireAiOn(tx: DoctorTx) {
    const f = await tx.one<{ enabled: boolean }>(`SELECT enabled FROM admin.platform_flag WHERE code = 'ai'`)
    if (f && !f.enabled) throw new ServiceUnavailableException('AI features are switched off by the platform administrator')
  }

  private async requireShared(tx: DoctorTx, personId: string, category: ShareCategory, label: string) {
    const flags = await shareFlags(tx, personId)
    if (!flags[category]) throw new ForbiddenException(`The patient has not shared ${label} with doctors`)
  }

  /** Facts the simulation may use. Honours the patient's share switches. */
  private async context(tx: DoctorTx, pid: string): Promise<SimContext> {
    const flags = await shareFlags(tx, pid)
    const header = await loadHeader(tx, pid)
    const allergies = (await tx.query(`SELECT substance FROM records.allergy WHERE patient_person_id = $1 AND superseded_by IS NULL AND status = 'active'`, [pid])).map((r: any) => r.substance as string)
    const conditions = (await tx.query(`SELECT name FROM records.condition WHERE patient_person_id = $1 AND superseded_by IS NULL AND status = 'active'`, [pid])).map((r: any) => r.name as string)
    const medications = flags.rx
      ? (
          await tx.query(
            `SELECT COALESCE(m.generic_name || ' ' || m.strength, mc.free_text) AS name FROM records.medication_current mc
               LEFT JOIN pharmacy.medicine m ON m.id = mc.medicine_id
              WHERE mc.patient_person_id = $1 AND mc.status = 'active' AND mc.superseded_by IS NULL`,
            [pid],
          )
        ).map((r: any) => r.name as string)
      : []
    const labs: SimContext['labs'] = {}
    const series: SimContext['series'] = []
    if (flags.lab) {
      const rows = await tx.query<any>(
        `SELECT test_code::text AS code, test_name, unit, value_num::float8 AS v, flag, observed_at FROM lab.v_analyte_series
          WHERE patient_person_id = $1 ORDER BY test_code, observed_at`,
        [pid],
      )
      const by = new Map<string, SimContext['series'][number]>()
      for (const r of rows) {
        labs[r.code] = { value: r.v, unit: r.unit, flag: r.flag }
        if (!by.has(r.code)) by.set(r.code, { code: r.code, name: r.test_name, unit: r.unit, points: [] })
        by.get(r.code)!.points.push({ at: toIso(r.observed_at)!, value: r.v })
      }
      series.push(...by.values())
    }
    return { patientName: header.name, age: header.age, allergies, conditions, medications, labs, series }
  }

  private folderId(tx: DoctorTx, pid: string, kind: string) {
    return systemFolderId(tx, pid, kind)
  }

  /** Save one simulated run (ai_run + hypotheses + evidence) and return it as an insight. */
  private async storeRun(tx: DoctorTx, s: LiveSession, tool: StoredTool, draft: InsightDraft, input: Record<string, unknown>): Promise<AIInsight> {
    const folderId = await this.folderId(tx, s.patientPersonId, FOLDER_KIND[tool])
    const output = bytes(
      JSON.stringify({
        module: draft.module,
        status: draft.status,
        confidence: draft.confidence,
        headline: draft.headline,
        text: draft.text,
        evidence: draft.evidence,
        requires_clinician_review: true,
        simulated: true,
        label: SIM_LABEL,
      }),
    )
    const runStatus = draft.status === 'UNCERTAIN' ? 'uncertain' : 'completed'
    const run = await tx.one<{ id: string; created_at: Date }>(
      `INSERT INTO ai.ai_run
         (patient_person_id, tool, folder_id, run_by_user_id, session_id, input_enc, output_enc, enc_key_id, model_name, model_version,
          is_simulated, status, disagreement_report, started_at, finished_at, result_sha256)
       VALUES ($1, $2::ai.tool, $3, util.ctx_user_id(), $4, $5, $6, $7, $8, '0.3-sim', true, $9::ai.run_status, $10::jsonb,
               now() - interval '1 second', now(), $11)
       RETURNING id, created_at`,
      [s.patientPersonId, tool, folderId, s.id, bytes(JSON.stringify(input)), output, DEMO_ENC_KEY, draft.modelName, runStatus, draft.disagreement ? JSON.stringify(draft.disagreement) : null, sha(output)],
    )
    const runId = run!.id
    let rank = 0
    const hypIds: string[] = []
    for (const h of draft.hypotheses.slice(0, 3)) {
      rank += 1
      const hy = await tx.one<{ id: string }>(
        `INSERT INTO ai.ai_hypothesis (run_id, rank, label, confidence, evidence_status, ranking_score)
         VALUES ($1, $2, $3, $4, $5::ai.evidence_status, $4) RETURNING id`,
        [runId, rank, h.label, Math.min(1, Math.max(0, h.confidence)), h.evidenceStatus],
      )
      hypIds.push(hy!.id)
    }
    if (hypIds[0]) {
      for (const src of draft.sources) {
        await tx.query(
          `INSERT INTO ai.ai_evidence (hypothesis_id, source_type, source_ref, store, relevance) VALUES ($1, $2::ai.evidence_source, $3, $4, $5)`,
          [hypIds[0], src.type, src.ref, src.store, src.relevance],
        )
      }
    }
    return this.insightById(tx, runId)
  }

  // ---------- reading ----------
  private async insightsFor(tx: DoctorTx, where: string, params: unknown[]): Promise<AIInsight[]> {
    const runs = await tx.query<any>(
      `SELECT r.id, r.tool::text AS tool, r.status::text AS status, r.created_at, r.run_by_user_id, r.patient_person_id,
              CASE WHEN r.enc_key_id = '${DEMO_ENC_KEY}' THEN convert_from(r.output_enc, 'UTF8') END AS out, r.disagreement_report,
              rv.verdict::text AS verdict, rv.reason, rv.edited_text, rv.reviewed_at, rp.full_name AS reviewer
         FROM ai.ai_run r
         LEFT JOIN ai.ai_review rv ON rv.run_id = r.id
         LEFT JOIN identity.app_user ru ON ru.id = rv.doctor_user_id
         LEFT JOIN identity.person rp ON rp.id = ru.person_id
        WHERE r.tool <> 'citizen_guidance_chat' AND ${where}
        ORDER BY r.created_at DESC LIMIT 60`,
      params,
    )
    if (!runs.length) return []
    const ids = runs.map((r) => r.id)
    const hyps = await tx.query<any>(`SELECT id, run_id, rank, label, confidence::float8 AS confidence, evidence_status::text AS evidence_status FROM ai.ai_hypothesis WHERE run_id = ANY($1::uuid[]) ORDER BY run_id, rank`, [ids])
    const evid = await tx.query<any>(
      `SELECT e.hypothesis_id, e.source_type::text AS source_type, e.source_ref, e.store, e.relevance::float8 AS relevance FROM ai.ai_evidence e
        WHERE e.hypothesis_id = ANY($1::uuid[])`,
      [hyps.map((h) => h.id)],
    )
    return runs.map((r) => {
      const out = r.out ? safeJson(r.out) : {}
      const myHyps = hyps.filter((h) => h.run_id === r.id)
      const top = myHyps[0]
      const sources = top ? evid.filter((e) => e.hypothesis_id === top.id).map((e) => ({ type: e.source_type, ref: e.source_ref, store: e.store, relevance: e.relevance })) : []
      const verdict: string | null = r.verdict
      return {
        runId: r.id,
        tool: r.tool,
        module: out.module ?? r.tool,
        status: out.status ?? (r.status === 'uncertain' ? 'UNCERTAIN' : 'SUPPORTED_WITH_CAUTION'),
        confidence: out.confidence ?? top?.confidence ?? 0,
        headline: out.headline ?? top?.label ?? '',
        text: out.text ?? '',
        evidence: Array.isArray(out.evidence) && out.evidence.length ? out.evidence : sources.map((s) => `${s.type}: ${s.ref}`),
        hypotheses: myHyps.map((h) => ({ rank: h.rank, label: h.label, confidence: h.confidence, evidenceStatus: h.evidence_status })),
        sources,
        disagreement: r.disagreement_report ?? null,
        review: {
          state: !verdict ? 'pending' : verdict === 'agree' ? 'accepted' : verdict === 'edited' ? 'edited' : 'rejected',
          verdict: verdict as any,
          reason: r.reason ?? null,
          editedText: r.edited_text ?? null,
          reviewedAt: toIso(r.reviewed_at),
          reviewedBy: r.reviewer ?? null,
          // A citizen sees an AI result only after a doctor reviewed it; a rejected result is not shown.
          visibleToPatient: !!verdict && verdict !== 'disagree',
        },
        simulated: true,
        label: SIM_LABEL,
        createdAt: toIso(r.created_at)!,
      } as AIInsight
    })
  }

  private async insightById(tx: DoctorTx, runId: string): Promise<AIInsight> {
    const i = (await this.insightsFor(tx, 'r.id = $1', [runId]))[0]
    if (!i) throw new NotFoundException('AI result not found')
    return i
  }

  /** All AI results for the open patient (filtered by the patient's switches). */
  async list(user: AuthenticatedUser | undefined, sessionId: string) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId)
      const flags = await shareFlags(tx, s.patientPersonId)
      const all = await this.insightsFor(tx, 'r.patient_person_id = $1', [s.patientPersonId])
      const hide = new Set<string>()
      if (!flags.imaging) hide.add('image')
      if (!flags.genomic) hide.add('genomic')
      const insights = all.filter((i) => !hide.has(i.tool))
      return {
        insights,
        pendingReview: insights.filter((i) => i.review.state === 'pending').length,
        hiddenByPatient: (Object.keys(flags) as ShareCategory[]).filter((k) => !flags[k]),
        simulated: true,
        label: SIM_LABEL,
      }
    })
  }

  /** Results waiting for my review across all my patients (home page). */
  async pendingForMe(tx: DoctorTx) {
    return this.insightsFor(
      tx,
      `r.run_by_user_id = util.ctx_user_id() AND rv.run_id IS NULL`,
      [],
    ).then((rows) => rows.slice(0, 20))
  }

  // ---------- chat ----------
  async chat(user: AuthenticatedUser | undefined, sessionId: string, body: AiChatRequest): Promise<AiChatReply> {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId, { write: true })
      await this.requireAiOn(tx)
      const ctx = await this.context(tx, s.patientPersonId)

      let chatId = body.chatSessionId
      if (chatId) {
        const own = await tx.one(`SELECT 1 FROM ai.chat_session WHERE id = $1 AND started_by_user_id = util.ctx_user_id() AND patient_person_id = $2 AND ended_at IS NULL`, [chatId, s.patientPersonId])
        if (!own) throw new NotFoundException('Chat not found for this patient')
      } else {
        const folderId = await this.folderId(tx, s.patientPersonId, 'ai_chat')
        const created = await tx.one<{ id: string }>(
          `INSERT INTO ai.chat_session (patient_person_id, kind, title, started_by_user_id, access_session_id, folder_id, is_simulated)
           VALUES ($1, 'clinical_assist', $2, util.ctx_user_id(), $3, $4, true) RETURNING id`,
          [s.patientPersonId, body.message.slice(0, 80), s.id, folderId],
        )
        chatId = created!.id
      }

      await tx.query(`INSERT INTO ai.chat_message (session_id, role, body_enc, enc_key_id) VALUES ($1, 'user', $2, $3)`, [chatId, bytes(body.message), DEMO_ENC_KEY])
      const sim = simulateChat(body.message, ctx)
      const draft: InsightDraft = {
        tool: 'symptom_chat',
        module: 'Chat',
        status: sim.status,
        confidence: sim.confidence,
        headline: sim.headline,
        text: sim.text,
        evidence: sim.evidence,
        hypotheses: [{ label: sim.headline, confidence: sim.confidence, evidenceStatus: sim.status }],
        sources: sim.sourceLabels.map((l, i) => ({ type: 'guideline' as const, ref: `DEMO-SRC-${i + 1}: ${l}`, store: 'global' as const, relevance: 0.6 })),
        disagreement: simulateDisagreement(sim.headline, 'No firm answer', sim.status, sim.confidence, body.message),
        modelName: 'clinical-assist-sim',
      }
      const insight = await this.storeRun(tx, s, 'symptom_chat', draft, { question: body.message })
      await tx.query(
        `INSERT INTO ai.chat_message (session_id, role, body_enc, enc_key_id, source_refs, red_flag, red_flag_reason, ai_run_id)
         VALUES ($1, 'assistant', $2, $3, $4::jsonb, $5, $6, $7)`,
        [chatId, bytes(sim.text), DEMO_ENC_KEY, JSON.stringify(sim.sourceLabels.map((l) => ({ label: l, simulated: true }))), sim.redFlag, sim.redFlagReason, insight.runId],
      )
      await tx.audit('ai.chat', { entityType: 'ai_run', entityId: insight.runId ?? undefined, patient: s.patientPersonId, session: s.id, details: { redFlag: sim.redFlag, simulated: true } })
      return { chatSessionId: chatId!, messages: (await this.chatMessages(tx, chatId!)).slice(-2), insight }
    })
  }

  private async chatMessages(tx: DoctorTx, chatId: string): Promise<AiChatMessage[]> {
    const rows = await tx.query<any>(
      `SELECT seq, role, CASE WHEN enc_key_id = '${DEMO_ENC_KEY}' THEN convert_from(body_enc, 'UTF8') END AS body, source_refs, red_flag, created_at
         FROM ai.chat_message WHERE session_id = $1 ORDER BY seq`,
      [chatId],
    )
    return rows.map((r) => ({
      seq: r.seq,
      role: r.role,
      text: r.body ?? '',
      redFlag: r.red_flag,
      sources: Array.isArray(r.source_refs) ? r.source_refs.map((x: any) => ({ label: x.label, simulated: !!x.simulated })) : [],
      createdAt: toIso(r.created_at)!,
    }))
  }

  /** My clinical-assist chats for the open patient (latest first) with the messages of the chosen/latest one. */
  async chatHistory(user: AuthenticatedUser | undefined, sessionId: string, chatSessionId?: string) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId)
      const sessions = await tx.query<any>(
        `SELECT id, title, message_count, started_at FROM ai.chat_session
          WHERE patient_person_id = $1 AND kind = 'clinical_assist' AND started_by_user_id = util.ctx_user_id() ORDER BY started_at DESC LIMIT 10`,
        [s.patientPersonId],
      )
      const pick = chatSessionId ?? sessions[0]?.id
      return {
        sessions: sessions.map((c) => ({ id: c.id, title: c.title, messageCount: c.message_count, startedAt: toIso(c.started_at) })),
        current: pick ? { chatSessionId: pick, messages: await this.chatMessages(tx, pick) } : null,
        simulated: true,
        label: SIM_LABEL,
      }
    })
  }

  // ---------- image / genomic / temporal ----------
  async image(user: AuthenticatedUser | undefined, sessionId: string, body: AiImageRequest): Promise<AIInsight> {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId, { write: true })
      await this.requireAiOn(tx)
      await this.requireShared(tx, s.patientPersonId, 'imaging', 'imaging')
      const doc = await tx.one<any>(
        body.documentId
          ? `SELECT id, title, doc_type::text AS doc_type FROM records.document WHERE id = $1 AND patient_person_id = $2 AND doc_type = 'scan'`
          : `SELECT id, title, doc_type::text AS doc_type FROM records.document WHERE patient_person_id = $2 AND doc_type = 'scan' AND $1::uuid IS NULL ORDER BY created_at DESC LIMIT 1`,
        [body.documentId ?? null, s.patientPersonId],
      )
      if (!doc) throw new NotFoundException('No scan document found for this patient')
      const study = await tx.one<any>(
        `SELECT modality, body_part FROM imaging.study WHERE patient_person_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [s.patientPersonId],
      )
      const draft = simulateImage({ title: doc.title, modality: study?.modality ?? null, bodyPart: study?.body_part ?? null, seed: doc.id })
      const insight = await this.storeRun(tx, s, 'image', draft, { documentId: doc.id, title: doc.title })
      await tx.query(`INSERT INTO access.item_view (session_id, patient_person_id, user_id, item_kind, item_id, label) VALUES ($1,$2,util.ctx_user_id(),'imaging',$3,$4)`, [s.id, s.patientPersonId, doc.id, doc.title])
      await tx.audit('ai.image', { entityType: 'ai_run', entityId: insight.runId ?? undefined, patient: s.patientPersonId, session: s.id, details: { simulated: true } })
      return insight
    })
  }

  async genomic(user: AuthenticatedUser | undefined, sessionId: string): Promise<AIInsight> {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId, { write: true })
      await this.requireAiOn(tx)
      await this.requireShared(tx, s.patientPersonId, 'genomic', 'genomic results')
      const ctx = await this.context(tx, s.patientPersonId)
      const insight = await this.storeRun(tx, s, 'genomic', simulateGenomic(ctx, s.patientPersonId), { panel: '24 genes (simulated)' })
      await tx.audit('ai.genomic', { entityType: 'ai_run', entityId: insight.runId ?? undefined, patient: s.patientPersonId, session: s.id, details: { simulated: true } })
      return insight
    })
  }

  async temporal(user: AuthenticatedUser | undefined, sessionId: string): Promise<AIInsight> {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId, { write: true })
      await this.requireAiOn(tx)
      await this.requireShared(tx, s.patientPersonId, 'lab', 'lab results')
      const ctx = await this.context(tx, s.patientPersonId)
      const insight = await this.storeRun(tx, s, 'temporal', simulateTemporal(ctx, `${s.patientPersonId}:${ctx.series.length}`), { analytes: ctx.series.map((x) => x.code) })
      await tx.audit('ai.temporal', { entityType: 'ai_run', entityId: insight.runId ?? undefined, patient: s.patientPersonId, session: s.id, details: { simulated: true } })
      return insight
    })
  }

  // ---------- doctor's decision ----------
  /**
   * Accept / edit / reject an AI result (one decision per result, final). The citizen sees accepted and edited results
   * only; a rejected result is never shown. Needs the result to be visible to me (my own run, or a live session).
   */
  async review(user: AuthenticatedUser | undefined, runId: string, body: AiReviewRequest): Promise<AIInsight> {
    return this.db.run(user, async (tx) => {
      const run = await tx.one<any>(`SELECT id, patient_person_id, tool::text AS tool, session_id FROM ai.ai_run WHERE id = $1`, [runId])
      if (!run) throw new NotFoundException('AI result not found')
      if (run.tool === 'citizen_guidance_chat') throw new ForbiddenException('Citizen guidance chats are not reviewed as clinical results')
      const existing = await tx.one(`SELECT 1 FROM ai.ai_review WHERE run_id = $1`, [runId])
      if (existing) throw new ConflictException('This result has already been reviewed')
      const verdict = body.decision === 'accept' ? 'agree' : body.decision === 'edit' ? 'edited' : 'disagree'
      const reason = (body.note ?? body.editedText ?? (body.decision === 'accept' ? 'Accepted as simulated guidance' : 'Edited by doctor')).slice(0, 1000)
      await tx.query(
        `INSERT INTO ai.ai_review (run_id, doctor_user_id, verdict, reason, edited_text) VALUES ($1, util.ctx_user_id(), $2::ai.verdict, $3, $4)`,
        [runId, verdict, reason, body.decision === 'edit' ? body.editedText : null],
      )
      await tx.audit('ai.review', { entityType: 'ai_run', entityId: runId, patient: run.patient_person_id, session: run.session_id, details: { verdict } })
      return this.insightById(tx, runId)
    })
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

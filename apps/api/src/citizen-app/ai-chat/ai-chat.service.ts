import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  ChatContextResponse,
  ChatMessageDto,
  ChatSessionDetail,
  ChatSessionDto,
  ChatSourceRef,
  SendChatMessageResponse,
} from '@carefusion/shared/dist/citizen-app.js'
import { SIMULATED_AI_LABEL } from '@carefusion/shared/dist/citizen-app.js'
import { EventsService } from '../../events/events.service'
import { RequestDbService, RequestTx } from '../../events/request-db.service'
import { demoNow, iso, isoReq } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'
import { DISCLAIMER, ReviewedSummary, SUGGESTIONS, simulateReply } from './simulator'

const KEY_ID = 'demo-none' // plain UTF-8 bytes in the alpha (same convention as the seed and the documents module)

interface SessionRow {
  id: string
  title: string | null
  message_count: number
  started_at: Date
  shared_with_doctor_user_id: string | null
  shared_at: Date | null
}
interface MessageRow {
  id: string
  seq: number
  role: 'user' | 'assistant' | 'system'
  body: string
  source_refs: ChatSourceRef[]
  red_flag: boolean
  red_flag_reason: string | null
  created_at: Date
}

const SESSION_COLS = 'id, title, message_count, started_at, shared_with_doctor_user_id, shared_at'
const MESSAGE_COLS = `id, seq, role, convert_from(body_enc, 'UTF8') AS body, source_refs, red_flag, red_flag_reason, created_at`

function sessionDto(r: SessionRow): ChatSessionDto {
  return {
    id: r.id,
    title: r.title,
    messageCount: r.message_count,
    startedAt: isoReq(r.started_at),
    isSimulated: true,
    label: SIMULATED_AI_LABEL,
    sharedWithDoctorUserId: r.shared_with_doctor_user_id,
    sharedAt: iso(r.shared_at),
  }
}

function messageDto(r: MessageRow): ChatMessageDto {
  return {
    id: r.id,
    seq: r.seq,
    role: r.role,
    text: r.body,
    sourceRefs: r.source_refs ?? [],
    redFlag: r.red_flag,
    redFlagReason: r.red_flag_reason,
    createdAt: isoReq(r.created_at),
    isSimulated: r.role === 'assistant',
  }
}

@Injectable()
export class AiChatService {
  constructor(
    private readonly requestDb: RequestDbService,
    private readonly events: EventsService,
  ) {}

  async context(c: CitizenCtx): Promise<ChatContextResponse> {
    const pref = await this.requestDb.run(c.user, (tx) =>
      tx.query<{ ai_reads: boolean | null }>(
        `SELECT (extra ->> 'ai_reads_documents')::boolean AS ai_reads FROM identity.user_preference WHERE user_id = $1`,
        [c.userId],
      ),
    )
    const aiReads = pref[0]?.ai_reads ?? true
    return {
      isSimulated: true,
      label: SIMULATED_AI_LABEL,
      canSee: [
        { label: 'Documents your doctor has reviewed', enabled: aiReads },
        { label: 'Your medicines and dates', enabled: true },
        { label: 'Home vitals', enabled: true },
        { label: 'Results not yet reviewed by a doctor', enabled: false },
      ],
      suggestions: SUGGESTIONS,
      disclaimer: DISCLAIMER,
    }
  }

  async listSessions(c: CitizenCtx): Promise<ChatSessionDto[]> {
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<SessionRow>(
        `SELECT ${SESSION_COLS} FROM ai.chat_session
          WHERE patient_person_id = $1 AND kind = 'citizen_guidance' AND started_by_user_id = $2
          ORDER BY started_at DESC`,
        [c.personId, c.userId],
      ),
    )
    return rows.map(sessionDto)
  }

  async getSession(c: CitizenCtx, id: string): Promise<ChatSessionDetail> {
    return this.requestDb.run(c.user, async (tx) => {
      const s = await this.loadSession(tx, c, id)
      const msgs = await tx.query<MessageRow>(
        `SELECT ${MESSAGE_COLS} FROM ai.chat_message WHERE session_id = $1 ORDER BY seq`,
        [id],
      )
      return { ...sessionDto(s), messages: msgs.map(messageDto) }
    })
  }

  /** Start a chat. With `text`, the first question is answered straight away. */
  async startSession(c: CitizenCtx, text?: string): Promise<SendChatMessageResponse | { session: ChatSessionDto }> {
    return this.requestDb.run(c.user, async (tx) => {
      const created = await tx.query<SessionRow>(
        `INSERT INTO ai.chat_session (patient_person_id, kind, title, started_by_user_id, is_simulated)
         VALUES ($1, 'citizen_guidance', $2, $3, true) RETURNING ${SESSION_COLS}`,
        [c.personId, text ? text.slice(0, 80) : 'New chat', c.userId],
      )
      const session = created[0]!
      if (!text) return { session: sessionDto(session) }
      return this.exchange(tx, c, session.id, text)
    })
  }

  async sendMessage(c: CitizenCtx, sessionId: string, text: string): Promise<SendChatMessageResponse> {
    return this.requestDb.run(c.user, async (tx) => {
      await this.loadSession(tx, c, sessionId)
      return this.exchange(tx, c, sessionId, text)
    })
  }

  private async loadSession(tx: RequestTx, c: CitizenCtx, id: string): Promise<SessionRow> {
    const rows = await tx.query<SessionRow>(
      `SELECT ${SESSION_COLS} FROM ai.chat_session
        WHERE id = $1 AND patient_person_id = $2 AND started_by_user_id = $3 AND kind = 'citizen_guidance'`,
      [id, c.personId, c.userId],
    )
    if (!rows[0]) throw new NotFoundException('Chat not found')
    return rows[0]
  }

  /** Save the question, build the simulated answer, save it. Row-level security gates what the answer can use. */
  private async exchange(tx: RequestTx, c: CitizenCtx, sessionId: string, text: string): Promise<SendChatMessageResponse> {
    const user = await this.insertMessage(tx, sessionId, 'user', text, [], false, null)

    // Only summaries a doctor has reviewed are visible to a citizen (policy summary_read), so nothing unreviewed can leak.
    const reviewed = await tx.query<{ document_id: string; doc_title: string; summary_title: string; summary: string; reviewer: string }>(
      `SELECT ds.document_id, d.title AS doc_title, ds.summary_title, convert_from(ds.summary_enc, 'UTF8') AS summary, p.full_name AS reviewer
         FROM records.document_summary ds
         JOIN records.document d ON d.id = ds.document_id
         JOIN identity.app_user u ON u.id = ds.reviewed_by_user_id
         JOIN identity.person p ON p.id = u.person_id
        WHERE ds.patient_person_id = $1 AND ds.reviewed_at IS NOT NULL
        ORDER BY ds.reviewed_at DESC LIMIT 10`,
      [c.personId],
    )
    const next = await tx.query<{ starts_at: Date; doctor: string | null }>(
      `SELECT lower(s.during) AS starts_at, p.full_name AS doctor
         FROM engage.appointment a
         JOIN engage.appointment_slot s ON s.id = a.slot_id
         LEFT JOIN identity.app_user du ON du.id = s.doctor_user_id
         LEFT JOIN identity.person p ON p.id = du.person_id
        WHERE a.citizen_person_id = $1 AND a.status IN ('requested','confirmed') AND lower(s.during) > $2
        ORDER BY lower(s.during) LIMIT 1`,
      [c.personId, demoNow()],
    )
    const ctx = {
      reviewed: reviewed.map<ReviewedSummary>((r) => ({
        documentId: r.document_id,
        docTitle: r.doc_title,
        title: r.summary_title,
        summary: r.summary,
        reviewer: r.reviewer,
      })),
      nextAppointment: next[0]
        ? {
            whenText: new Date(next[0].starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }),
            doctor: next[0].doctor ?? 'your doctor',
          }
        : null,
    }
    const reply = simulateReply(text, ctx)
    const assistant = await this.insertMessage(tx, sessionId, 'assistant', reply.text, reply.sourceRefs, reply.redFlag, reply.redFlagReason)

    const session = (await tx.query<SessionRow>(`SELECT ${SESSION_COLS} FROM ai.chat_session WHERE id = $1`, [sessionId]))[0]!
    return {
      session: sessionDto(session),
      userMessage: messageDto(user),
      assistantMessage: messageDto(assistant),
      redFlag: reply.redFlag,
      disclaimer: DISCLAIMER,
    }
  }

  private async insertMessage(
    tx: RequestTx,
    sessionId: string,
    role: 'user' | 'assistant',
    text: string,
    refs: ChatSourceRef[],
    redFlag: boolean,
    reason: string | null,
  ): Promise<MessageRow> {
    const rows = await tx.query<MessageRow>(
      `INSERT INTO ai.chat_message (session_id, role, body_enc, enc_key_id, source_refs, red_flag, red_flag_reason)
       VALUES ($1, $2, convert_to($3, 'UTF8'), $4, $5::jsonb, $6, $7)
       RETURNING ${MESSAGE_COLS}`,
      [sessionId, role, text, KEY_ID, JSON.stringify(role === 'assistant' ? refs : []), redFlag, reason],
    )
    return rows[0]!
  }

  /** Share the chat with the doctor who last saw the patient (or the one given). The doctor gets an event. */
  async share(c: CitizenCtx, sessionId: string, doctorUserId?: string): Promise<ChatSessionDto> {
    return this.requestDb.run(c.user, async (tx) => {
      await this.loadSession(tx, c, sessionId)
      let doctor = doctorUserId ?? null
      let hospitalId: string | null = null
      const visit = await tx.query<{ doctor_user_id: string; hospital_id: string }>(
        `SELECT doctor_user_id, hospital_id FROM engage.op_visit
          WHERE patient_person_id = $1 AND doctor_user_id IS NOT NULL
            AND ($2::uuid IS NULL OR doctor_user_id = $2::uuid)
          ORDER BY visit_date DESC, created_at DESC LIMIT 1`,
        [c.personId, doctorUserId ?? null],
      )
      if (visit[0]) {
        doctor = visit[0].doctor_user_id
        hospitalId = visit[0].hospital_id
      }
      if (!doctor || !hospitalId) throw new BadRequestException('No doctor who has seen you was found to share this chat with')

      const updated = await tx.query<SessionRow>(
        `UPDATE ai.chat_session SET shared_with_doctor_user_id = $2, shared_at = now()
          WHERE id = $1 RETURNING ${SESSION_COLS}`,
        [sessionId, doctor],
      )
      const name = (await tx.query<{ full_name: string }>('SELECT full_name FROM identity.person WHERE id = $1', [c.personId]))[0]?.full_name ?? 'Patient'
      await this.events.emit(tx, {
        type: 'ai-chat-shared',
        to: ['doctor'],
        toUserId: doctor,
        title: `AI chat shared · ${name}`,
        text: `${updated[0]!.title ?? 'AI chat'} (simulated AI output)`,
        patientPersonId: c.personId,
        hospitalId,
        entityType: 'ai.chat_session',
        entityId: sessionId,
      })
      return sessionDto(updated[0]!)
    })
  }
}

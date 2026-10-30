import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  MessageDto,
  StartThreadRequest,
  ThreadDetailDto,
  ThreadSummaryDto,
} from '@carefusion/shared/dist/citizen-app.js'
import type { EventRole } from '@carefusion/shared/dist/events.js'
import { EventsService } from '../../events/events.service'
import { RequestDbService, RequestTx } from '../../events/request-db.service'
import { iso, isoReq } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'

const KEY_ID = 'demo-none'
/** Threads where the citizen cannot reply (announcements only). */
const MESSAGE_HREF: Partial<Record<EventRole, string>> = {
  doctor: '/doctor/messages',
  hospitaladmin: '/hospital-admin/messages',
  labtech: '/lab/worklist',
  radiology: '/radiology/worklist',
  pharmacist: '/pharmacist/queue',
}
const READ_ONLY_TYPES = new Set(['health_dept', 'broadcast'])

interface ThreadRow {
  id: string
  thread_type: string
  subject: string | null
  closed_at: Date | null
  hospital_id: string | null
  last_message_at: Date | null
  preview: string | null
  unread: number
  cp_name: string | null
  cp_role: string | null
}

const firstPart = (s: string | null) => (s ? s.split(' · ')[0]! : null)

function threadDto(r: ThreadRow): ThreadSummaryDto {
  return {
    id: r.id,
    type: r.thread_type,
    subject: r.subject,
    counterpartName: firstPart(r.cp_name),
    counterpartRole: r.cp_role,
    lastMessagePreview: r.preview ? r.preview.slice(0, 120) : null,
    lastMessageAt: iso(r.last_message_at),
    unread: r.unread ?? 0,
    canReply: !READ_ONLY_TYPES.has(r.thread_type) && r.closed_at === null,
    encrypted: true,
  }
}

const THREAD_SQL = `
  SELECT t.id, t.thread_type, t.subject, t.closed_at, t.hospital_id,
         COALESCE(t.last_message_at, lm.sent_at) AS last_message_at,
         lm.body AS preview,
         COALESCE((SELECT u.unread FROM engage.v_thread_unread u WHERE u.thread_id = t.id), 0) AS unread,
         cp.display_name AS cp_name, cp.party_role::text AS cp_role
    FROM engage.chat_thread t
    JOIN engage.chat_participant me ON me.thread_id = t.id AND me.user_id = $1
    LEFT JOIN LATERAL (
         SELECT p.display_name, p.party_role FROM engage.chat_participant p
          WHERE p.thread_id = t.id AND p.id <> me.id ORDER BY p.added_at LIMIT 1) cp ON true
    LEFT JOIN LATERAL (
         SELECT convert_from(m.body_enc, 'UTF8') AS body, m.sent_at FROM engage.chat_message m
          WHERE m.thread_id = t.id AND NOT m.blocked ORDER BY m.sent_at DESC LIMIT 1) lm ON true`

@Injectable()
export class MessagesService {
  constructor(
    private readonly requestDb: RequestDbService,
    private readonly events: EventsService,
  ) {}

  async listThreads(c: CitizenCtx): Promise<ThreadSummaryDto[]> {
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<ThreadRow>(`${THREAD_SQL} WHERE t.patient_person_id = $2 ORDER BY COALESCE(t.last_message_at, lm.sent_at) DESC NULLS LAST`, [
        c.userId,
        c.personId,
      ]),
    )
    return rows.map(threadDto)
  }

  async getThread(c: CitizenCtx, id: string): Promise<ThreadDetailDto> {
    return this.requestDb.run(c.user, async (tx) => {
      const summary = await this.loadThread(tx, c, id)
      const msgs = await tx.query<{
        id: string
        thread_id: string
        sender_user_id: string
        sender_name: string | null
        sender_role: string | null
        body: string
        blocked: boolean
        sent_at: Date
      }>(
        `SELECT m.id, m.thread_id, m.sender_user_id, sp.display_name AS sender_name, sp.party_role::text AS sender_role,
                CASE WHEN m.blocked THEN '[message hidden]' ELSE convert_from(m.body_enc, 'UTF8') END AS body,
                m.blocked, m.sent_at
           FROM engage.chat_message m
           LEFT JOIN engage.chat_participant sp ON sp.thread_id = m.thread_id AND sp.user_id = m.sender_user_id
          WHERE m.thread_id = $1 ORDER BY m.sent_at, m.id`,
        [id],
      )
      const atts = await tx.query<{ id: string; message_id: string; file_name: string; mime_type: string; size_bytes: string }>(
        'SELECT id, message_id, file_name, mime_type, size_bytes::text AS size_bytes FROM engage.chat_attachment WHERE thread_id = $1',
        [id],
      )
      const messages: MessageDto[] = msgs.map((m) => ({
        id: m.id,
        threadId: m.thread_id,
        senderUserId: m.sender_user_id,
        senderName: firstPart(m.sender_name),
        senderRole: m.sender_role,
        mine: m.sender_user_id === c.userId,
        text: m.body,
        sentAt: isoReq(m.sent_at),
        attachments: atts
          .filter((a) => a.message_id === m.id)
          .map((a) => ({ id: a.id, fileName: a.file_name, mimeType: a.mime_type, sizeBytes: Number(a.size_bytes) })),
      }))
      return { ...summary, messages }
    })
  }

  private async loadThread(tx: RequestTx, c: CitizenCtx, id: string): Promise<ThreadSummaryDto> {
    const rows = await tx.query<ThreadRow>(`${THREAD_SQL} WHERE t.id = $2 AND t.patient_person_id = $3`, [c.userId, id, c.personId])
    if (!rows[0]) throw new NotFoundException('Conversation not found')
    return threadDto(rows[0])
  }

  async markRead(c: CitizenCtx, id: string): Promise<{ read: true }> {
    await this.requestDb.run(c.user, async (tx) => {
      await this.loadThread(tx, c, id)
      await tx.query('UPDATE engage.chat_participant SET last_read_at = now() WHERE thread_id = $1 AND user_id = $2', [id, c.userId])
    })
    return { read: true }
  }

  async send(c: CitizenCtx, threadId: string, text: string): Promise<MessageDto> {
    return this.requestDb.run(c.user, async (tx) => {
      const t = await this.loadThread(tx, c, threadId)
      if (!t.canReply) throw new ForbiddenException('You cannot reply in this conversation')
      return this.insertAndNotify(tx, c, threadId, text)
    })
  }

  private async insertAndNotify(tx: RequestTx, c: CitizenCtx, threadId: string, text: string): Promise<MessageDto> {
    const ins = await tx.query<{ id: string; sent_at: Date }>(
      `INSERT INTO engage.chat_message (thread_id, sender_user_id, body_enc, enc_key_id)
       VALUES ($1, $2, convert_to($3, 'UTF8'), $4) RETURNING id, sent_at`,
      [threadId, c.userId, text, KEY_ID],
    )
    await tx.query('UPDATE engage.chat_thread SET last_message_at = $2 WHERE id = $1', [threadId, ins[0]!.sent_at])
    await tx.query('UPDATE engage.chat_participant SET last_read_at = $3 WHERE thread_id = $1 AND user_id = $2', [threadId, c.userId, ins[0]!.sent_at])

    // Tell the other side(s).
    const name = (await tx.query<{ full_name: string }>('SELECT full_name FROM identity.person WHERE id = $1', [c.personId]))[0]?.full_name ?? 'Patient'
    const others = await tx.query<{ user_id: string | null; hospital_id: string | null; pharmacy_id: string | null; party_role: EventRole | null }>(
      `SELECT user_id, hospital_id, pharmacy_id, party_role::text AS party_role FROM engage.chat_participant
        WHERE thread_id = $1 AND (user_id IS NULL OR user_id <> $2)`,
      [threadId, c.userId],
    )
    const thread = (await tx.query<{ hospital_id: string | null }>('SELECT hospital_id FROM engage.chat_thread WHERE id = $1', [threadId]))[0]
    for (const o of others) {
      const role: EventRole = o.party_role ?? 'doctor'
      if (role === 'citizen') continue
      if (!o.user_id && !o.hospital_id && !o.pharmacy_id && !thread?.hospital_id) continue
      await this.events.emit(tx, {
        type: 'message',
        to: [role],
        toUserId: o.user_id ?? undefined,
        title: `New message · ${name}`,
        text: text.slice(0, 120),
        href: MESSAGE_HREF[role],
        patientPersonId: c.personId,
        hospitalId: o.user_id ? undefined : (o.hospital_id ?? thread?.hospital_id ?? undefined),
        pharmacyId: o.user_id ? undefined : (o.pharmacy_id ?? undefined),
        entityType: 'engage.chat_thread',
        entityId: threadId,
      })
    }

    return {
      id: ins[0]!.id,
      threadId,
      senderUserId: c.userId,
      senderName: name,
      senderRole: 'citizen',
      mine: true,
      text,
      sentAt: isoReq(ins[0]!.sent_at),
      attachments: [],
    }
  }

  /** Start (or reuse) a conversation with a doctor who has treated you, or with a hospital's appointments desk. */
  async startThread(c: CitizenCtx, req: StartThreadRequest): Promise<ThreadDetailDto> {
    const threadId = await this.requestDb.run(c.user, async (tx) => {
      const me = (await tx.query<{ full_name: string }>('SELECT full_name FROM identity.person WHERE id = $1', [c.personId]))[0]?.full_name ?? 'Citizen'
      let id: string
      if (req.type === 'doctor_followup') {
        const existing = await tx.query<{ id: string }>(
          `SELECT id FROM engage.chat_thread WHERE thread_type = 'doctor_followup' AND patient_person_id = $1 AND doctor_user_id = $2 AND closed_at IS NULL LIMIT 1`,
          [c.personId, req.doctorUserId],
        )
        if (existing[0]) {
          id = existing[0].id
        } else {
          const doc = await tx.query<{ full_name: string; specialisation: string | null; hospital: string }>(
            `SELECT p.full_name, dp.specialisation, h.name AS hospital
               FROM identity.doctor_profile dp
               JOIN identity.app_user u ON u.id = dp.user_id
               JOIN identity.person p ON p.id = u.person_id
               JOIN org.hospital h ON h.id = dp.hospital_id
              WHERE dp.user_id = $1`,
            [req.doctorUserId],
          )
          if (!doc[0]) throw new BadRequestException('Doctor not found')
          const t = await tx.query<{ id: string }>(
            `INSERT INTO engage.chat_thread (thread_type, patient_person_id, doctor_user_id, subject)
             VALUES ('doctor_followup', $1, $2, $3) RETURNING id`,
            [c.personId, req.doctorUserId, req.subject ?? doc[0].full_name],
          )
          id = t[0]!.id
          await tx.query(
            `INSERT INTO engage.chat_participant (thread_id, user_id, display_name, party_role) VALUES
               ($1, $2, $3, 'citizen'), ($1, $4, $5, 'doctor')`,
            [id, c.userId, me, req.doctorUserId, `${doc[0].full_name} · ${doc[0].specialisation ?? 'Doctor'} · ${doc[0].hospital}`],
          )
        }
      } else {
        const existing = await tx.query<{ id: string }>(
          `SELECT id FROM engage.chat_thread WHERE thread_type = 'hospital_desk' AND patient_person_id = $1 AND hospital_id = $2 AND closed_at IS NULL LIMIT 1`,
          [c.personId, req.hospitalId],
        )
        if (existing[0]) {
          id = existing[0].id
        } else {
          const h = await tx.query<{ name: string }>('SELECT name FROM org.hospital WHERE id = $1', [req.hospitalId])
          if (!h[0]) throw new BadRequestException('Hospital not found')
          const t = await tx.query<{ id: string }>(
            `INSERT INTO engage.chat_thread (thread_type, patient_person_id, hospital_id, subject)
             VALUES ('hospital_desk', $1, $2, $3) RETURNING id`,
            [c.personId, req.hospitalId, req.subject ?? `${h[0].name} · Appointments desk`],
          )
          id = t[0]!.id
          await tx.query(
            `INSERT INTO engage.chat_participant (thread_id, user_id, hospital_id, display_name, party_role) VALUES
               ($1, $2, NULL, $3, 'citizen'), ($1, NULL, $4, $5, 'hospitaladmin')`,
            [id, c.userId, me, req.hospitalId, `${h[0].name} · Appointments desk`],
          )
        }
      }
      await this.insertAndNotify(tx, c, id, req.text)
      return id
    })
    return this.getThread(c, threadId)
  }
}

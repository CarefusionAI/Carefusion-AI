import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { AuthenticatedUser } from '../auth/types'
import { DEMO_ENC_KEY, DoctorDbService, toIso } from './doctor-db.service'

const dec = `CASE WHEN m.enc_key_id = '${DEMO_ENC_KEY}' THEN convert_from(m.body_enc, 'UTF8') ELSE '[encrypted]' END`

@Injectable()
export class MessagesService {
  constructor(private readonly db: DoctorDbService) {}

  async threads(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const rows = await tx.query<any>(
        `SELECT t.id, t.patient_person_id, p.full_name, date_part('year', age(p.date_of_birth))::int AS age, p.sex::text AS sex, t.subject, t.last_message_at, t.closed_at,
                (SELECT ${dec} FROM engage.chat_message m WHERE m.thread_id = t.id AND NOT m.blocked ORDER BY m.sent_at DESC LIMIT 1) AS last_text,
                (SELECT count(*) FROM engage.chat_message m
                  WHERE m.thread_id = t.id AND m.sender_user_id <> util.ctx_user_id() AND NOT m.blocked
                    AND m.sent_at > coalesce((SELECT cp.last_read_at FROM engage.chat_participant cp WHERE cp.thread_id = t.id AND cp.user_id = util.ctx_user_id()), '-infinity'))::int AS unread
           FROM engage.chat_thread t JOIN identity.person p ON p.id = t.patient_person_id
          WHERE t.doctor_user_id = util.ctx_user_id() AND t.thread_type = 'doctor_followup'
          ORDER BY t.last_message_at DESC NULLS LAST LIMIT 50`,
      )
      return {
        unreadTotal: rows.reduce((n, r) => n + r.unread, 0),
        quickReplies: ['Please continue the same dose.', 'Book a follow-up in the app.', 'I have ordered a test for you.'],
        threads: rows.map((r) => ({
          id: r.id,
          patientPersonId: r.patient_person_id,
          patientName: r.full_name,
          meta: `${r.sex === 'female' ? 'F' : r.sex === 'male' ? 'M' : 'O'} ${r.age} · ${r.subject ?? 'follow-up'}`,
          lastMessage: r.last_text,
          lastMessageAt: toIso(r.last_message_at),
          unread: r.unread,
          closed: !!r.closed_at,
        })),
      }
    })
  }

  private async ownThread(tx: any, id: string) {
    const t = await tx.one(`SELECT id, patient_person_id, closed_at FROM engage.chat_thread WHERE id = $1 AND doctor_user_id = util.ctx_user_id() AND thread_type = 'doctor_followup'`, [id])
    if (!t) throw new NotFoundException('Conversation not found')
    return t
  }

  /** Open a conversation and mark it read. */
  async thread(user: AuthenticatedUser | undefined, id: string) {
    return this.db.run(user, async (tx) => {
      const t = await this.ownThread(tx, id)
      const msgs = await tx.query<any>(
        `SELECT m.id, m.sender_user_id, ${dec} AS body, m.sent_at, m.blocked,
                (m.sender_user_id = util.ctx_user_id()) AS mine
           FROM engage.chat_message m WHERE m.thread_id = $1 AND NOT m.blocked ORDER BY m.sent_at LIMIT 200`,
        [id],
      )
      await tx.query(`UPDATE engage.chat_participant SET last_read_at = now() WHERE thread_id = $1 AND user_id = util.ctx_user_id()`, [id])
      const p = await tx.one<{ full_name: string }>(`SELECT full_name FROM identity.person WHERE id = $1`, [t.patient_person_id])
      return { id, patientPersonId: t.patient_person_id, patientName: p?.full_name, closed: !!t.closed_at, messages: msgs.map((m: any) => ({ id: m.id, from: m.mine ? 'me' : 'patient', text: m.body, sentAt: toIso(m.sent_at) })) }
    })
  }

  async reply(user: AuthenticatedUser | undefined, id: string, text: string) {
    return this.db.run(user, async (tx) => {
      const t = await this.ownThread(tx, id)
      if (t.closed_at) throw new ForbiddenException('This conversation is closed')
      const hospitalId = await tx.hospitalId()
      const msg = await tx.one<{ id: string; sent_at: Date }>(
        `INSERT INTO engage.chat_message (thread_id, sender_user_id, body_enc, enc_key_id) VALUES ($1, util.ctx_user_id(), $2, $3) RETURNING id, sent_at`,
        [id, Buffer.from(text, 'utf8'), DEMO_ENC_KEY],
      )
      await tx.query(`UPDATE engage.chat_thread SET last_message_at = $2 WHERE id = $1`, [id, msg!.sent_at])
      await tx.query(`UPDATE engage.chat_participant SET last_read_at = now() WHERE thread_id = $1 AND user_id = util.ctx_user_id()`, [id])
      const cit = await tx.one<{ id: string; full_name: string }>(
        `SELECT u.id, p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id WHERE u.person_id = $1 AND u.account_type = 'citizen'`,
        [t.patient_person_id],
      )
      const me = await tx.one<{ full_name: string }>(`SELECT p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id WHERE u.id = util.ctx_user_id()`)
      if (cit) {
        await tx.emit({
          type: 'message',
          toRoles: ['citizen'],
          toUserId: cit.id,
          title: `Reply from ${me?.full_name}`,
          text: text.length > 80 ? `${text.slice(0, 77)}...` : text,
          entityType: 'engage.chat_thread',
          entityId: id,
          patientPersonId: t.patient_person_id,
          hospitalId,
        })
      }
      await tx.audit('message.reply', { entityType: 'chat_thread', entityId: id, patient: t.patient_person_id })
      return { id: msg!.id, from: 'me', text, sentAt: toIso(msg!.sent_at) }
    })
  }
}

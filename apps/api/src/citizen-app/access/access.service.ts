import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  AccessCategoryDto,
  AccessHistoryQuery,
  AccessHistoryResponse,
  AccessHistoryRowDto,
  AccessKeyResponse,
  AccessOverviewResponse,
  AddFamilyMemberRequest,
  ComplaintDto,
  FamilyMemberDto,
  LiveSessionDto,
} from '@carefusion/shared/dist/citizen-app.js'
import { EventsService } from '../../events/events.service'
import { RequestDbService, RequestTx } from '../../events/request-db.service'
import { ComplaintsService } from '../complaints/complaints.service'
import { demoNow, isoReq, istDate } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'
import { KEY_WINDOW_SECONDS, deriveAccessKey, formatKey, keyHandle, keySecondsLeft } from './access-key'
import { buildCategories, auditRole, isDoctorRole, itemCategory, modeText, roleText } from './access.logic'

const EMERGENCY_NOTE =
  "If you can't share your key (unconscious, after an accident), an emergency doctor can open your emergency card only. " +
  'They must give a reason, a second doctor confirms, and you get an alert straight away. The access ends after 60 minutes and is reviewed.'

@Injectable()
export class AccessService {
  private readonly secret: string

  constructor(
    private readonly requestDb: RequestDbService,
    private readonly events: EventsService,
    private readonly complaints: ComplaintsService,
    config: ConfigService,
  ) {
    // Demo secret is fine for synthetic data; set ACCESS_KEY_SECRET in .env for anything shared.
    this.secret = config.get<string>('ACCESS_KEY_SECRET', 'cf-demo-access-key-secret-not-for-production')
  }

  key(c: CitizenCtx, atMs = Date.now()): AccessKeyResponse {
    const code = deriveAccessKey(this.secret, c.personId, atMs)
    const left = keySecondsLeft(atMs)
    return {
      display: formatKey(code),
      code,
      qrPayload: `cfkey:v1:${keyHandle(this.secret, c.personId)}:${code}`,
      windowSeconds: KEY_WINDOW_SECONDS,
      secondsLeft: left,
      expiresAt: new Date(atMs + left * 1000).toISOString(),
      nextRotationAt: new Date(atMs + left * 1000).toISOString(),
      singleUse: true,
      note: 'Opens a 30-minute session for one doctor, only inside a registered hospital. Alpha demo: single use is not enforced yet.',
    }
  }

  async overview(c: CitizenCtx): Promise<AccessOverviewResponse> {
    const [liveSessions, categories, family, history] = await Promise.all([
      this.liveSessions(c),
      this.categories(c),
      this.family(c),
      this.history(c, { filter: 'all', limit: 1 }),
    ])
    return {
      key: this.key(c),
      liveSessions,
      categories,
      sharedCount: categories.filter((x) => x.enabled).length,
      totalCategories: categories.length,
      opensThisMonth: history.opensThisMonth,
      family,
      emergencyNote: EMERGENCY_NOTE,
    }
  }

  // ----- live sessions -----
  async liveSessions(c: CitizenCtx): Promise<LiveSessionDto[]> {
    const now = demoNow()
    return this.requestDb.run(c.user, async (tx) => {
      const rows = await tx.query<{
        id: string
        mode: string
        started_at: Date
        expires_at: Date
        doctor_name: string
        specialisation: string | null
        hpr_verified: boolean | null
        facility: string | null
      }>(
        `SELECT s.id, s.mode::text AS mode, s.started_at, s.expires_at, p.full_name AS doctor_name, dp.specialisation,
                (dp.hpr_verified_at IS NOT NULL) AS hpr_verified, h.name AS facility
           FROM access.access_session s
           JOIN identity.app_user u ON u.id = s.user_id
           JOIN identity.person p ON p.id = u.person_id
           LEFT JOIN identity.doctor_profile dp ON dp.user_id = u.id
           LEFT JOIN identity.staff_profile sp ON sp.user_id = u.id
           LEFT JOIN org.hospital h ON h.id = COALESCE(dp.hospital_id, sp.hospital_id)
          WHERE s.patient_person_id = $1 AND s.ended_at IS NULL AND s.expires_at > $2 AND s.started_at <= $2
          ORDER BY s.started_at DESC`,
        [c.personId, now],
      )
      if (!rows.length) return []
      const [cats, items] = await Promise.all([
        this.categoryRows(tx, c),
        tx.query<{ session_id: string; item_kind: string; label: string | null; viewed_at: Date }>(
          'SELECT session_id, item_kind, label, viewed_at FROM access.item_view WHERE session_id = ANY ($1::uuid[]) AND patient_person_id = $2 ORDER BY viewed_at',
          [rows.map((r) => r.id), c.personId],
        ),
      ])
      const chips = buildCategories(cats).filter((x) => x.enabled && !x.locked).map((x) => x.label)
      return rows.map<LiveSessionDto>((r) => {
        const total = new Date(r.expires_at).getTime() - new Date(r.started_at).getTime()
        const elapsed = now.getTime() - new Date(r.started_at).getTime()
        return {
          id: r.id,
          mode: r.mode,
          doctorName: r.doctor_name,
          doctorLine: r.specialisation ? `${r.specialisation}${r.hpr_verified ? ' · HPR verified' : ''}` : null,
          facility: r.facility,
          startedAt: isoReq(r.started_at),
          expiresAt: isoReq(r.expires_at),
          secondsLeft: Math.max(0, Math.round((new Date(r.expires_at).getTime() - now.getTime()) / 1000)),
          progressPercent: Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))),
          scopeChips: chips,
          openedInSession: items
            .filter((i) => i.session_id === r.id)
            .map((i) => ({
              at: isoReq(i.viewed_at),
              item: (i.label ?? i.item_kind).replace(/\s*\(draft\)/i, ''),
              category: itemCategory(i.item_kind),
              state: /\(draft\)/i.test(i.label ?? '') ? 'Draft' : 'Viewed',
            })),
        }
      })
    })
  }

  async endSession(c: CitizenCtx, id: string): Promise<{ ended: true; endedAt: string }> {
    const now = demoNow()
    return this.requestDb.run(c.user, async (tx) => {
      const rows = await tx.query<{ user_id: string; ended_at: Date }>(
        `UPDATE access.access_session SET ended_at = $3, ended_by = 'patient'
          WHERE id = $1 AND patient_person_id = $2 AND ended_at IS NULL AND expires_at > $3
          RETURNING user_id, ended_at`,
        [id, c.personId, now],
      )
      if (!rows[0]) throw new NotFoundException('No live session with that id')
      const name = (await tx.query<{ full_name: string }>('SELECT full_name FROM identity.person WHERE id = $1', [c.personId]))[0]?.full_name ?? 'Patient'
      await this.events.emit(tx, {
        type: 'session-ended',
        to: ['doctor'],
        toUserId: rows[0].user_id,
        title: `Session ended by ${name}`,
        text: 'Access to the record closed · 30-minute key session',
        patientPersonId: c.personId,
        entityType: 'access.access_session',
        entityId: id,
      })
      return { ended: true as const, endedAt: isoReq(rows[0].ended_at) }
    })
  }

  // ----- history -----
  async history(c: CitizenCtx, q: AccessHistoryQuery): Promise<AccessHistoryResponse> {
    const now = demoNow()
    const { sessions, items, audit } = await this.requestDb.run(c.user, async (tx) => {
      const sessions = await tx.query<{
        session_id: string
        mode: string
        started_at: Date
        ended_at: Date | null
        ended_by: string | null
        opened_by: string
        account_type: string
        hospital: string | null
        expires_at: Date
      }>(
        `SELECT h.session_id, h.mode::text AS mode, h.started_at, h.ended_at, h.ended_by::text AS ended_by, h.opened_by,
                h.account_type::text AS account_type, h.hospital, s.expires_at
           FROM access.v_access_history h JOIN access.access_session s ON s.id = h.session_id
          ORDER BY h.started_at DESC LIMIT 500`,
      )
      const items = sessions.length
        ? await tx.query<{ session_id: string; item_kind: string }>(
            'SELECT DISTINCT session_id, item_kind FROM access.item_view WHERE session_id = ANY ($1::uuid[]) AND patient_person_id = $2',
            [sessions.map((s) => s.session_id), c.personId],
          )
        : []
      const audit = await tx.query<{
        seq: string
        occurred_at: Date
        action: string
        actor: string | null
        account_type: string
        hospital: string | null
        how: string | null
        saw: string | null
      }>(
        `SELECT seq::text AS seq, occurred_at, action, actor, account_type::text AS account_type, hospital, how, saw
           FROM access.v_order_access_history
          WHERE action ~ '^(lab|imaging|rx|nurse)\\.' ORDER BY occurred_at DESC LIMIT 200`,
      )
      return { sessions, items, audit }
    })

    const rows: AccessHistoryRowDto[] = [
      ...sessions.map<AccessHistoryRowDto>((s) => {
        const live = s.ended_at === null && new Date(s.expires_at) > now
        const kinds = [...new Set(items.filter((i) => i.session_id === s.session_id).map((i) => itemCategory(i.item_kind)))]
        return {
          id: `session:${s.session_id}`,
          at: isoReq(s.started_at),
          who: s.opened_by,
          role: roleText(s.account_type, s.mode),
          how: modeText(s.mode),
          saw: kinds.join(', '),
          status: live ? 'live' : s.mode === 'break_glass' ? 'review' : s.ended_by === 'patient' ? 'ended' : 'done',
          sessionId: s.session_id,
        }
      }),
      ...audit.map<AccessHistoryRowDto>((a) => ({
        id: `audit:${a.seq}`,
        at: isoReq(a.occurred_at),
        who: a.actor ?? 'Hospital staff',
        role: auditRole(a.action, a.account_type),
        how: a.how ?? a.action,
        saw: a.saw ?? '',
        status: 'done',
        sessionId: null,
      })),
    ]
      .filter((r) => (q.filter === 'doctors' ? isDoctorRole(r.role) : q.filter === 'staff' ? !isDoctorRole(r.role) : true))
      .sort((a, b) => b.at.localeCompare(a.at))

    const month = istDate(now).slice(0, 7)
    return {
      rows: rows.slice(0, q.limit),
      total: rows.length,
      opensThisMonth: rows.filter((r) => istDate(new Date(r.at)).slice(0, 7) === month).length,
      note: 'Entries are kept for 7 years. You cannot delete them, and nor can anyone else.',
    }
  }

  // ----- share switches -----
  private categoryRows(tx: RequestTx, c: CitizenCtx) {
    return tx.query<{ category: string; enabled: boolean }>(
      'SELECT category::text AS category, enabled FROM identity.share_preference WHERE person_id = $1',
      [c.personId],
    )
  }

  async categories(c: CitizenCtx): Promise<AccessCategoryDto[]> {
    return this.requestDb.run(c.user, async (tx) => buildCategories(await this.categoryRows(tx, c)))
  }

  async setCategory(c: CitizenCtx, key: string, enabled: boolean): Promise<AccessCategoryDto[]> {
    if (key === 'emg') throw new BadRequestException('The emergency card is always visible and cannot be turned off')
    await this.requestDb.run(c.user, (tx) =>
      tx.query(
        `INSERT INTO identity.share_preference (person_id, category, enabled) VALUES ($1, $2::identity.share_category, $3)
         ON CONFLICT (person_id, category) DO UPDATE SET enabled = EXCLUDED.enabled`,
        [c.personId, key, enabled],
      ),
    )
    return this.categories(c)
  }

  // ----- trusted family -----
  async family(c: CitizenCtx): Promise<FamilyMemberDto[]> {
    return this.requestDb.run(c.user, async (tx) => {
      const links = await tx.query<{
        id: string
        member_person_id: string
        name: string
        relation: string
        can_show_key: boolean
        accepted_at: Date | null
        is_minor: boolean
      }>(
        `SELECT fl.id, fl.member_person_id, p.full_name AS name, fl.relation, fl.can_show_key, fl.accepted_at,
                (cp.guardian_person_id = fl.citizen_person_id) AS is_minor
           FROM identity.family_link fl
           JOIN identity.person p ON p.id = fl.member_person_id
           LEFT JOIN identity.citizen_profile cp ON cp.person_id = fl.member_person_id
          WHERE fl.citizen_person_id = $1 AND fl.removed_at IS NULL ORDER BY fl.requested_at`,
        [c.personId],
      )
      const minors = await tx.query<{ person_id: string; name: string }>(
        `SELECT cp.person_id, p.full_name AS name FROM identity.citizen_profile cp JOIN identity.person p ON p.id = cp.person_id
          WHERE cp.guardian_person_id = $1`,
        [c.personId],
      )
      const out: FamilyMemberDto[] = links.map((l) => {
        const guardian = !!l.is_minor
        return {
          id: l.id,
          personId: l.member_person_id,
          name: l.name,
          relation: l.relation,
          kind: guardian ? 'minor_guardian' : 'adult',
          canShowKey: l.can_show_key,
          status: guardian ? 'guardian' : l.accepted_at ? 'active' : 'pending',
          note: guardian ? 'You are the guardian' : l.can_show_key ? 'Can show your key for you' : l.accepted_at ? 'Trusted family member' : 'Waiting for them to accept',
        }
      })
      for (const m of minors) {
        if (!out.some((o) => o.personId === m.person_id)) {
          out.push({
            id: m.person_id,
            personId: m.person_id,
            name: m.name,
            relation: 'child',
            kind: 'minor_guardian',
            canShowKey: false,
            status: 'guardian',
            note: 'You are the guardian',
          })
        }
      }
      return out
    })
  }

  async addFamily(c: CitizenCtx, req: AddFamilyMemberRequest): Promise<FamilyMemberDto[]> {
    await this.requestDb.run(c.user, async (tx) => {
      const found = await tx.query<{ id: string }>(
        `SELECT id FROM identity.person WHERE (abha_number = $1 OR abha_address::text ILIKE $1) AND id <> $2 LIMIT 1`,
        [req.abhaId, c.personId],
      )
      if (!found[0]) throw new NotFoundException('No person with that ABHA id was found')
      const dup = await tx.query('SELECT 1 FROM identity.family_link WHERE citizen_person_id = $1 AND member_person_id = $2 AND removed_at IS NULL', [c.personId, found[0].id])
      if (dup.length) throw new ConflictException('This person is already in your trusted family')
      // can_show_key stays false until the member accepts (database rule).
      await tx.query(
        'INSERT INTO identity.family_link (citizen_person_id, member_person_id, relation, can_show_key) VALUES ($1, $2, $3, false)',
        [c.personId, found[0].id, req.relation],
      )
    })
    return this.family(c)
  }

  async removeFamily(c: CitizenCtx, id: string): Promise<FamilyMemberDto[]> {
    await this.requestDb.run(c.user, async (tx) => {
      const r = await tx.query(
        'UPDATE identity.family_link SET removed_at = now() WHERE id = $1 AND citizen_person_id = $2 AND removed_at IS NULL RETURNING id',
        [id, c.personId],
      )
      if (!r.length) throw new NotFoundException('Family link not found')
    })
    return this.family(c)
  }

  // ----- report an open -----
  reportOpen(c: CitizenCtx, sessionId: string, text: string): Promise<ComplaintDto> {
    return this.complaints.create(c, {
      category: 'record_access',
      severity: 'urgent',
      title: 'Record opened wrongly',
      body: text,
      accessSessionId: sessionId,
      mayCallMe: true,
    })
  }
}

import { BadRequestException, Injectable } from '@nestjs/common'
import type {
  AlertGroup,
  AlertItemDto,
  AlertsResponse,
  ListAlertsQuery,
  NotificationPrefsResponse,
  UpdateNotificationPrefsRequest,
} from '@carefusion/shared/dist/citizen-app.js'
import { PREF_CATEGORIES } from '@carefusion/shared/dist/citizen-app.js'
import { RequestDbService } from '../../events/request-db.service'
import { demoNow, isoReq } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'
import { DEFAULT_QUIET_HOURS, PREF_DEFAULT_OFF, mapEvent, tabForAlert } from './alerts.logic'

const CHANNELS_BY_CATEGORY: Record<string, string[]> = {
  monthly_summary: ['app', 'email', 'sms'],
}
const DEFAULT_CHANNELS = ['app', 'sms']

@Injectable()
export class AlertsService {
  constructor(private readonly requestDb: RequestDbService) {}

  async list(c: CitizenCtx, q: ListAlertsQuery): Promise<AlertsResponse> {
    const now = demoNow()
    const { alerts, events } = await this.requestDb.run(c.user, async (tx) => ({
      alerts: await tx.query<{
        id: string
        severity: string
        category_group: AlertGroup
        title: string
        body: string
        issuer_name: string | null
        at: Date
        is_read: boolean
      }>(
        `SELECT a.id, a.severity::text AS severity, a.category_group, a.title, a.body, a.issuer_name,
                COALESCE(a.sent_at, a.starts_at) AS at, (r.alert_id IS NOT NULL) AS is_read
           FROM engage.health_alert a
           JOIN engage.v_alert_recipients_rule rr ON rr.alert_id = a.id AND rr.user_id = $1
           LEFT JOIN engage.alert_read r ON r.alert_id = a.id AND r.user_id = $1
          WHERE a.starts_at <= $2
          ORDER BY COALESCE(a.sent_at, a.starts_at) DESC LIMIT 200`,
        [c.userId, now],
      ),
      events: await tx.query<{
        id: string
        type: string
        title: string
        text: string
        href: string | null
        created_at: Date
        is_read: boolean
      }>(
        `SELECT id, type::text AS type, title, text, href, created_at, is_read
           FROM engage.v_my_events
          WHERE 'citizen' = ANY (to_roles::text[]) AND NOT sent_by_me AND created_at <= $1
          ORDER BY created_at DESC LIMIT 200`,
        [now],
      ),
    }))

    const items: AlertItemDto[] = [
      ...alerts.map<AlertItemDto>((a) => ({
        id: `alert:${a.id}`,
        source: 'alert',
        group: a.category_group,
        tab: tabForAlert(a.category_group, a.title),
        severity: a.severity === 'emergency' ? 'emergency' : 'normal',
        title: a.title,
        body: a.body,
        issuer: a.issuer_name,
        at: isoReq(a.at),
        read: a.is_read,
        href: '/citizen/alerts',
      })),
      ...events.map<AlertItemDto>((e) => {
        const m = mapEvent(e.type)
        return {
          id: `event:${e.id}`,
          source: 'event',
          group: m.group,
          tab: m.tab,
          severity: 'normal',
          title: e.title,
          body: e.text,
          issuer: null,
          at: isoReq(e.created_at),
          read: e.is_read,
          href: e.href,
        }
      }),
    ].sort((a, b) => b.at.localeCompare(a.at))

    const counts: Record<AlertGroup, number> = { emergency: 0, health_dept: 0, my_care: 0, system: 0 }
    for (const i of items) counts[i.group]++
    const unread = items.filter((i) => !i.read).length
    const filtered = items
      .filter((i) => (q.group ? i.group === q.group : true))
      .filter((i) => (q.unreadOnly ? !i.read : true))
      .slice(0, q.limit)
    return { items: filtered, unread, counts }
  }

  async unreadCount(c: CitizenCtx): Promise<number> {
    return (await this.list(c, { limit: 200, unreadOnly: true })).unread
  }

  /** Mark alerts and events read. Ids are the `id` values from list(); no ids = mark everything. */
  async markRead(c: CitizenCtx, ids?: string[]): Promise<{ marked: number }> {
    const alertIds: string[] = []
    const eventIds: string[] = []
    for (const id of ids ?? []) {
      const [kind, raw] = id.split(':')
      if (!raw || !/^[0-9a-f-]{36}$/i.test(raw)) throw new BadRequestException(`Bad id "${id}"`)
      if (kind === 'alert') alertIds.push(raw)
      else if (kind === 'event') eventIds.push(raw)
      else throw new BadRequestException(`Bad id "${id}"`)
    }
    return this.requestDb.run(c.user, async (tx) => {
      let marked = 0
      const a = await tx.query(
        `INSERT INTO engage.alert_read (user_id, alert_id)
         SELECT $1, rr.alert_id FROM engage.v_alert_recipients_rule rr
          WHERE rr.user_id = $1 AND ($2::uuid[] IS NULL OR rr.alert_id = ANY ($2::uuid[]))
         ON CONFLICT DO NOTHING RETURNING alert_id`,
        [c.userId, ids ? alertIds : null],
      )
      marked += a.length
      if (!ids || eventIds.length) {
        const e = await tx.query<{ n: number }>('SELECT engage.mark_events_read($1::uuid[]) AS n', [ids ? eventIds : null])
        marked += e[0]?.n ?? 0
      }
      return { marked }
    })
  }

  async preferences(c: CitizenCtx): Promise<NotificationPrefsResponse> {
    const { rows, quiet } = await this.requestDb.run(c.user, async (tx) => ({
      rows: await tx.query<{ category: string; channel: string; enabled: boolean }>(
        'SELECT category::text AS category, channel, enabled FROM engage.notification_pref WHERE user_id = $1',
        [c.userId],
      ),
      quiet: await tx.query<{ quiet_hours: { enabled: boolean; from: string; to: string } }>(
        'SELECT quiet_hours FROM identity.user_preference WHERE user_id = $1',
        [c.userId],
      ),
    }))
    const have = new Map(rows.map((r) => [`${r.category}|${r.channel}`, r.enabled]))
    const prefs: NotificationPrefsResponse['prefs'] = []
    for (const category of PREF_CATEGORIES) {
      for (const channel of CHANNELS_BY_CATEGORY[category] ?? DEFAULT_CHANNELS) {
        const key = `${category}|${channel}`
        prefs.push({
          category,
          channel,
          enabled: category === 'emergency' ? true : (have.get(key) ?? !PREF_DEFAULT_OFF.has(category)),
          locked: category === 'emergency',
        })
      }
    }
    return {
      prefs,
      quietHours: quiet[0]?.quiet_hours ?? DEFAULT_QUIET_HOURS,
      emergencyNote: 'Emergency alerts are always on, as required by the Disaster Management Act.',
    }
  }

  async updatePreferences(c: CitizenCtx, req: UpdateNotificationPrefsRequest): Promise<NotificationPrefsResponse> {
    if (req.prefs.some((p) => p.category === 'emergency' && !p.enabled)) {
      throw new BadRequestException('Emergency alerts cannot be switched off')
    }
    await this.requestDb.run(c.user, async (tx) => {
      for (const p of req.prefs) {
        await tx.query(
          `INSERT INTO engage.notification_pref (user_id, category, channel, enabled)
           VALUES ($1, $2::engage.pref_category, $3, $4)
           ON CONFLICT (user_id, category, channel) DO UPDATE SET enabled = EXCLUDED.enabled`,
          [c.userId, p.category, p.channel, p.enabled],
        )
      }
      if (req.quietHours) {
        await tx.query(
          `INSERT INTO identity.user_preference (user_id, quiet_hours) VALUES ($1, $2::jsonb)
           ON CONFLICT (user_id) DO UPDATE SET quiet_hours = EXCLUDED.quiet_hours`,
          [c.userId, JSON.stringify(req.quietHours)],
        )
      }
    })
    return this.preferences(c)
  }
}

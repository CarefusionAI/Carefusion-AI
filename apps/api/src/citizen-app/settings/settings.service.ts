import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  DeleteAccountRequest,
  DeletionRequestDto,
  DeviceDto,
  ExportRequest,
  ExportRequestDto,
  RevokeOtherDevicesRequest,
  SettingsResponse,
  UpdatePreferencesRequest,
} from '@carefusion/shared/dist/citizen-app.js'
import { RequestDbService, RequestTx } from '../../events/request-db.service'
import { iso, isoReq } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'

const EXPORT_NOTE = 'Alpha demo: the export file is not generated. The request is recorded only.'
const DELETE_NOTE =
  'Your login and app data are removed after the grace period. Hospital records stay with hospitals as the law requires, and your ABHA number is not deleted.'

interface DeviceRow {
  id: string
  device_name: string | null
  platform: string
  last_city: string | null
  user_agent: string | null
  last_seen_at: Date | null
  bound_at: Date
  revoked_at: Date | null
}
interface ExportRow {
  id: string
  format: string
  status: string
  requested_at: Date
  ready_at: Date | null
  expires_at: Date | null
  size_bytes: string | null
}
interface DeleteRow {
  id: string
  requested_at: Date
  grace_until: Date
  cancelled_at: Date | null
  completed_at: Date | null
}

const exportDto = (r: ExportRow): ExportRequestDto => ({
  id: r.id,
  format: r.format,
  status: r.status,
  requestedAt: isoReq(r.requested_at),
  readyAt: iso(r.ready_at),
  expiresAt: iso(r.expires_at),
  sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
  note: EXPORT_NOTE,
})
const deleteDto = (r: DeleteRow): DeletionRequestDto => ({
  id: r.id,
  requestedAt: isoReq(r.requested_at),
  graceUntil: isoReq(r.grace_until),
  cancelledAt: iso(r.cancelled_at),
  completedAt: iso(r.completed_at),
  note: DELETE_NOTE,
})

/** extra (snake_case jsonb) <-> API privacy object (camelCase) */
const PRIVACY_KEYS: Record<string, string> = {
  emergencyCardWithoutKey: 'emergency_card_without_key',
  researchUse: 'research_use',
  aiReadsDocuments: 'ai_reads_documents',
  monthlySummaryEmail: 'monthly_summary_email',
  sendBy: 'send_by',
  aiLanguage: 'ai_language',
  appLanguage: 'app_language',
}
const camelPrivacy = (extra: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [camel, snake] of Object.entries(PRIVACY_KEYS)) if (snake in extra) out[camel] = extra[snake]
  return out
}

@Injectable()
export class SettingsService {
  constructor(private readonly requestDb: RequestDbService) {}

  private devices(tx: RequestTx, c: CitizenCtx): Promise<DeviceRow[]> {
    return tx.query<DeviceRow>(
      `SELECT id, device_name, platform, last_city, user_agent, last_seen_at, bound_at, revoked_at
         FROM identity.device WHERE user_id = $1 ORDER BY (revoked_at IS NOT NULL), last_seen_at DESC NULLS LAST`,
      [c.userId],
    )
  }

  private deviceDtos(rows: DeviceRow[]): DeviceDto[] {
    const currentId = rows.find((d) => d.revoked_at === null)?.id // newest active = this device (alpha assumption)
    return rows.map((d) => ({
      id: d.id,
      name: d.device_name,
      platform: d.platform,
      city: d.last_city,
      userAgent: d.user_agent,
      lastSeenAt: iso(d.last_seen_at),
      boundAt: isoReq(d.bound_at),
      revoked: d.revoked_at !== null,
      current: d.id === currentId,
    }))
  }

  async get(c: CitizenCtx): Promise<SettingsResponse> {
    return this.requestDb.run(c.user, async (tx) => {
      const lang = await tx.query<{ preferred_language: string }>(
        'SELECT preferred_language FROM identity.citizen_profile WHERE person_id = $1',
        [c.personId],
      )
      const pref = (
        await tx.query<{
          text_size: string
          high_contrast: boolean
          reduce_motion: boolean
          read_aloud: boolean
          show_english_terms: boolean
          face_check_new_device: boolean
          quiet_hours: { enabled: boolean; from: string; to: string }
          extra: Record<string, unknown>
        }>('SELECT * FROM identity.user_preference WHERE user_id = $1', [c.userId])
      )[0]
      const devices = this.deviceDtos(await this.devices(tx, c))
      const storage = (
        await tx.query<{ n: number; bytes: string }>(
          'SELECT count(*)::int AS n, COALESCE(sum(size_bytes), 0)::text AS bytes FROM records.document WHERE patient_person_id = $1',
          [c.personId],
        )
      )[0]!
      const exp = await tx.query<ExportRow>(
        `SELECT id, format, status, requested_at, ready_at, expires_at, size_bytes::text AS size_bytes
           FROM identity.data_export_request WHERE person_id = $1 ORDER BY requested_at DESC LIMIT 1`,
        [c.personId],
      )
      const del = await tx.query<DeleteRow>(
        `SELECT id, requested_at, grace_until, cancelled_at, completed_at FROM identity.account_deletion_request
          WHERE person_id = $1 AND cancelled_at IS NULL AND completed_at IS NULL LIMIT 1`,
        [c.personId],
      )
      return {
        language: lang[0]?.preferred_language ?? 'en',
        preferences: {
          textSize: pref?.text_size ?? 'default',
          highContrast: pref?.high_contrast ?? false,
          reduceMotion: pref?.reduce_motion ?? false,
          readAloud: pref?.read_aloud ?? false,
          showEnglishTerms: pref?.show_english_terms ?? true,
          faceCheckNewDevice: pref?.face_check_new_device ?? true,
          quietHours: pref?.quiet_hours ?? { enabled: true, from: '22:00', to: '07:00' },
          privacy: camelPrivacy(pref?.extra ?? {}),
        },
        devices,
        storage: { documents: storage.n, bytes: Number(storage.bytes) },
        lastExport: exp[0] ? exportDto(exp[0]) : null,
        deletion: del[0] ? deleteDto(del[0]) : null,
      }
    })
  }

  async updatePreferences(c: CitizenCtx, req: UpdatePreferencesRequest): Promise<SettingsResponse> {
    await this.requestDb.run(c.user, async (tx) => {
      const cols: [string, unknown, string][] = []
      if (req.textSize !== undefined) cols.push(['text_size', req.textSize, ''])
      if (req.highContrast !== undefined) cols.push(['high_contrast', req.highContrast, ''])
      if (req.reduceMotion !== undefined) cols.push(['reduce_motion', req.reduceMotion, ''])
      if (req.readAloud !== undefined) cols.push(['read_aloud', req.readAloud, ''])
      if (req.showEnglishTerms !== undefined) cols.push(['show_english_terms', req.showEnglishTerms, ''])
      if (req.faceCheckNewDevice !== undefined) cols.push(['face_check_new_device', req.faceCheckNewDevice, ''])
      if (req.quietHours !== undefined) cols.push(['quiet_hours', JSON.stringify(req.quietHours), '::jsonb'])
      if (req.privacy) {
        const extra: Record<string, unknown> = {}
        for (const [camel, snake] of Object.entries(PRIVACY_KEYS)) {
          const v = (req.privacy as Record<string, unknown>)[camel]
          if (v !== undefined) extra[snake] = v
        }
        if (Object.keys(extra).length) cols.push(['extra', JSON.stringify(extra), '::jsonb'])
      }
      if (cols.length) {
        const names = cols.map(([n]) => n)
        const params: unknown[] = [c.userId, ...cols.map(([, v]) => v)]
        const placeholders = cols.map(([, , cast], i) => `$${i + 2}${cast}`)
        const updates = cols.map(([n]) => (n === 'extra' ? `extra = identity.user_preference.extra || EXCLUDED.extra` : `${n} = EXCLUDED.${n}`))
        await tx.query(
          `INSERT INTO identity.user_preference (user_id, ${names.join(', ')}) VALUES ($1, ${placeholders.join(', ')})
           ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}`,
          params,
        )
      }
      if (req.preferredLanguage) {
        await tx.query('UPDATE identity.citizen_profile SET preferred_language = $2 WHERE person_id = $1', [c.personId, req.preferredLanguage])
      }
    })
    return this.get(c)
  }

  async listDevices(c: CitizenCtx): Promise<DeviceDto[]> {
    return this.requestDb.run(c.user, async (tx) => this.deviceDtos(await this.devices(tx, c)))
  }

  async revokeDevice(c: CitizenCtx, id: string): Promise<DeviceDto[]> {
    return this.requestDb.run(c.user, async (tx) => {
      const r = await tx.query(
        `UPDATE identity.device SET revoked_at = now(), revoked_reason = 'signed out from Settings'
          WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
        [id, c.userId],
      )
      if (!r.length) throw new NotFoundException('Device not found or already signed out')
      return this.deviceDtos(await this.devices(tx, c))
    })
  }

  async revokeOthers(c: CitizenCtx, req: RevokeOtherDevicesRequest): Promise<DeviceDto[]> {
    return this.requestDb.run(c.user, async (tx) => {
      const keep =
        req.keepDeviceId ??
        (await tx.query<{ id: string }>(
          'SELECT id FROM identity.device WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST LIMIT 1',
          [c.userId],
        ))[0]?.id
      if (!keep) throw new BadRequestException('No active device found')
      await tx.query(
        `UPDATE identity.device SET revoked_at = now(), revoked_reason = 'signed out all others'
          WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
        [c.userId, keep],
      )
      return this.deviceDtos(await this.devices(tx, c))
    })
  }

  async requestExport(c: CitizenCtx, req: ExportRequest): Promise<ExportRequestDto> {
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<ExportRow>(
        `INSERT INTO identity.data_export_request (person_id, format) VALUES ($1, $2)
         RETURNING id, format, status, requested_at, ready_at, expires_at, size_bytes::text AS size_bytes`,
        [c.personId, req.format],
      ),
    )
    return exportDto(rows[0]!)
  }

  async listExports(c: CitizenCtx): Promise<ExportRequestDto[]> {
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<ExportRow>(
        `SELECT id, format, status, requested_at, ready_at, expires_at, size_bytes::text AS size_bytes
           FROM identity.data_export_request WHERE person_id = $1 ORDER BY requested_at DESC LIMIT 20`,
        [c.personId],
      ),
    )
    return rows.map(exportDto)
  }

  async requestDeletion(c: CitizenCtx, req: DeleteAccountRequest): Promise<DeletionRequestDto> {
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<DeleteRow>(
        `INSERT INTO identity.account_deletion_request (person_id, reason) VALUES ($1, $2)
         RETURNING id, requested_at, grace_until, cancelled_at, completed_at`,
        [c.personId, req.reason ?? null],
      ),
    )
    return deleteDto(rows[0]!)
  }

  async cancelDeletion(c: CitizenCtx): Promise<{ cancelled: boolean }> {
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query(
        `UPDATE identity.account_deletion_request SET cancelled_at = now()
          WHERE person_id = $1 AND cancelled_at IS NULL AND completed_at IS NULL RETURNING id`,
        [c.personId],
      ),
    )
    return { cancelled: rows.length > 0 }
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import type { AuthenticatedUser } from '../auth/types'

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly db: DatabaseService) {}

  async logAction(
    user: AuthenticatedUser,
    action: string,
    opts?: {
      entityType?: string
      entityId?: string
      patientPersonId?: string
      sessionId?: string
      ip?: string
      details?: Record<string, unknown>
    },
  ): Promise<void> {
    const client = await this.db.getClient()
    try {
      await client.query('BEGIN')
      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
      if (isValidUuid) {
        await client.query("SELECT set_config('app.user_id', $1, true)", [user.id])
      }
      await client.query("SELECT set_config('app.account_type', $1, true)", [this.mapAccountType(user.role)])
      await client.query(
        `SELECT audit.log(
          $1::text, $2::text, $3::uuid, $4::uuid, $5::uuid,
          $6::jsonb, $7::smallint, $8::inet
        )`,
        [
          action,
          opts?.entityType ?? null,
          opts?.entityId ?? null,
          opts?.patientPersonId ?? null,
          opts?.sessionId ?? null,
          JSON.stringify(opts?.details ?? {}),
          0,
          opts?.ip ?? null,
        ],
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      this.logger.warn(`Audit log failed for ${action}: ${err}`)
    } finally {
      client.release()
    }
  }

  private mapAccountType(role: string): string {
    const map: Record<string, string> = {
      CITIZEN: 'citizen', DOCTOR: 'doctor', NURSE: 'staff', LAB_TECH: 'staff',
      RADIOLOGY_TECH: 'staff', PHARMACIST: 'pharmacist', PHARMACY_ADMIN: 'pharmacy_admin',
      HOSPITAL_ADMIN: 'hospital_admin', DISTRICT_ADMIN: 'district_admin',
      STATE_ADMIN: 'state_admin', ZONAL_ADMIN: 'zonal_admin', CENTRAL_ADMIN: 'central_admin',
    }
    return map[role] ?? 'citizen'
  }
}

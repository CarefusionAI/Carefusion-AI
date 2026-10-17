import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type {
  CreateAccountResponse,
  CreateAdminRequest,
  CreatePharmacistRequest,
  CreateStaffRequest,
} from '@carefusion/shared'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import type { AuthenticatedUser } from '../auth/types'

type TargetLevel = 'zonal' | 'state' | 'district'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Which admin role may create which lower-level admin (docs/02). */
const CREATOR_TO_TARGET: Record<string, TargetLevel> = {
  CENTRAL_ADMIN: 'zonal',
  ZONAL_ADMIN: 'state',
  STATE_ADMIN: 'district',
}

/** Approval route per created admin type. */
const APPROVAL_ROUTE: Record<TargetLevel, { subject: string; level: 'central' | 'zonal'; twoPersons: boolean }> = {
  zonal: { subject: 'zonal_admin', level: 'central', twoPersons: true },
  state: { subject: 'state_admin', level: 'central', twoPersons: false },
  district: { subject: 'district_admin', level: 'zonal', twoPersons: false },
}

@Injectable()
export class AdminOpsService {
  private readonly logger = new Logger(AdminOpsService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Lists for the forms ----------

  listZones(): Promise<{ id: number; name: string }[]> {
    return this.db.query('SELECT id, name FROM geo.zone ORDER BY id')
  }

  listStates(zoneId?: number): Promise<{ id: number; code: string; name: string; zone_id: number }[]> {
    return this.db.query(
      `SELECT id, code::text AS code, name, zone_id
         FROM geo.state
        WHERE ($1::smallint IS NULL OR zone_id = $1::smallint)
        ORDER BY name`,
      [zoneId ?? null],
    )
  }

  // ---------- Create a lower-level admin (needs approval) ----------

  async createAdmin(creator: AuthenticatedUser, req: CreateAdminRequest): Promise<CreateAccountResponse> {
    const allowedTarget = CREATOR_TO_TARGET[creator.role]
    if (!allowedTarget || allowedTarget !== req.targetLevel) {
      throw new ForbiddenException({
        success: false,
        errorMessage: allowedTarget
          ? `Your role can only create ${allowedTarget} admins.`
          : 'Your role cannot create admin accounts.',
      })
    }
    if (req.targetLevel === 'zonal' && req.zoneId === undefined) {
      throw new BadRequestException({ success: false, errorMessage: 'A zone is required for a zonal admin.' })
    }
    if (req.targetLevel === 'state' && req.stateId === undefined) {
      throw new BadRequestException({ success: false, errorMessage: 'A state is required for a state admin.' })
    }
    if (req.targetLevel === 'district' && !req.districtId) {
      throw new BadRequestException({ success: false, errorMessage: 'A district is required for a district admin.' })
    }

    const accountType = `${req.targetLevel}_admin`
    const route = APPROVAL_ROUTE[req.targetLevel]

    const client = await this.db.getClient()
    let userId: string
    try {
      await client.query('BEGIN')

      await this.assertPersonExists(client, req.personId)
      await this.assertNoExistingAccount(client, req.personId, accountType)

      // Resolve and validate the area this admin will cover.
      let zoneId: number | null = null
      let stateId: number | null = null
      let districtId: string | null = null
      let approvalZoneId: number | null = null

      if (req.targetLevel === 'zonal') {
        const z = await client.query('SELECT 1 FROM geo.zone WHERE id = $1::smallint', [req.zoneId])
        if (!z.rowCount) {
          throw new BadRequestException({ success: false, errorMessage: 'The selected zone was not found.' })
        }
        zoneId = req.zoneId!
      } else if (req.targetLevel === 'state') {
        const s = await client.query('SELECT 1 FROM geo.state WHERE id = $1::smallint', [req.stateId])
        if (!s.rowCount) {
          throw new BadRequestException({ success: false, errorMessage: 'The selected state was not found.' })
        }
        stateId = req.stateId!
      } else {
        // District admin: the approval goes to the zonal admin of the district's zone.
        const d = await client.query<{ zone_id: number }>(
          `SELECT s.zone_id
             FROM geo.district d JOIN geo.state s ON s.id = d.state_id
            WHERE d.id = $1::uuid`,
          [req.districtId],
        )
        if (!d.rowCount) {
          throw new BadRequestException({ success: false, errorMessage: 'The selected district was not found.' })
        }
        districtId = req.districtId!
        approvalZoneId = d.rows[0]!.zone_id
      }

      // 4. Pending app user.
      const user = await client.query<{ id: string }>(
        `INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status)
         VALUES ($1::uuid, $2::identity.account_type, $3, 'pending'::identity.account_status)
         RETURNING id`,
        [req.personId, accountType, `demo-${req.targetLevel}-admin-${req.personId}`],
      )
      userId = user.rows[0]!.id

      // 5. Admin post (area of responsibility).
      await client.query(
        `INSERT INTO admin.admin_post (user_id, level, zone_id, state_id, district_id)
         VALUES ($1::uuid, $2::admin.admin_level, $3::smallint, $4::smallint, $5::uuid)`,
        [userId, req.targetLevel, zoneId, stateId, districtId],
      )

      // 6. Approval request, using the time limit from admin.approval_rule (7 days if missing).
      await client.query(
        `INSERT INTO admin.approval_request
           (subject_type, subject_user_id, subject_person_id, step, assigned_level, assigned_zone_id,
            status, due_at, check_results)
         VALUES ($1::admin.approval_subject, $2::uuid, $3::uuid, 1, $4::admin.admin_level, $5::smallint,
                 'pending'::admin.approval_status,
                 now() + COALESCE(
                   (SELECT time_limit FROM admin.approval_rule WHERE subject_type = $1::admin.approval_subject AND step = 1),
                   interval '7 days'),
                 $6::jsonb)`,
        [
          route.subject,
          userId,
          req.personId,
          route.level,
          route.level === 'zonal' ? approvalZoneId : null,
          JSON.stringify({ created_by_admin: creator.username, needs_two_persons: route.twoPersons }),
        ],
      )

      await client.query('COMMIT')
    } catch (err) {
      await this.safeRollback(client)
      throw this.translateError(err)
    } finally {
      client.release()
    }

    await this.audit.logAction(creator, 'admin_ops.create_admin', {
      entityType: 'user',
      entityId: userId,
      details: {
        personId: req.personId,
        targetLevel: req.targetLevel,
        zoneId: req.zoneId ?? null,
        stateId: req.stateId ?? null,
        districtId: req.districtId ?? null,
        actor: creator.username,
        mock: true,
      },
    })

    return { success: true, userId, status: 'pending' }
  }

  // ---------- Hospital admin creates staff (no approval) ----------

  async createStaff(creator: AuthenticatedUser, req: CreateStaffRequest): Promise<CreateAccountResponse> {
    if (creator.role !== 'HOSPITAL_ADMIN') {
      throw new ForbiddenException({ success: false, errorMessage: 'Only a hospital admin can create staff.' })
    }

    const client = await this.db.getClient()
    let userId: string
    let hospitalId: string
    try {
      await client.query('BEGIN')

      await this.assertPersonExists(client, req.personId)
      await this.assertNoExistingAccount(client, req.personId, 'staff')

      // Hospital: the creator's own hospital if they have a profile, else (demo user) the requested one.
      const own = UUID_RE.test(creator.id)
        ? await client.query<{ hospital_id: string }>(
            'SELECT hospital_id FROM identity.hospital_admin_profile WHERE user_id = $1::uuid',
            [creator.id],
          )
        : null
      hospitalId = own?.rows[0]?.hospital_id ?? req.hospitalId
      const h = await client.query(
        `SELECT 1 FROM org.hospital WHERE id = $1::uuid AND status = 'active'::org.facility_status`,
        [hospitalId],
      )
      if (!h.rowCount) {
        throw new BadRequestException({
          success: false,
          errorMessage: 'The hospital was not found or is not active.',
        })
      }

      if (req.departmentId) {
        const dep = await client.query('SELECT 1 FROM org.department WHERE id = $1::uuid AND hospital_id = $2::uuid', [
          req.departmentId,
          hospitalId,
        ])
        if (!dep.rowCount) {
          throw new BadRequestException({
            success: false,
            errorMessage: 'The department does not belong to this hospital.',
          })
        }
      }

      const createdBy = await this.resolveCreatorId(
        client,
        creator,
        `SELECT user_id AS id FROM identity.hospital_admin_profile
          ORDER BY (hospital_id = $1::uuid) DESC LIMIT 1`,
        hospitalId,
        'No hospital admin account exists to record as creator.',
      )

      const user = await client.query<{ id: string }>(
        `INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status, activated_at)
         VALUES ($1::uuid, 'staff'::identity.account_type, $2, 'active'::identity.account_status, now())
         RETURNING id`,
        [req.personId, `demo-staff-${req.personId}`],
      )
      userId = user.rows[0]!.id

      await client.query(
        `INSERT INTO identity.staff_profile (user_id, hospital_id, department_id, staff_role, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::identity.staff_role, $5::uuid)`,
        [userId, hospitalId, req.departmentId ?? null, req.staffRole, createdBy],
      )

      await client.query('COMMIT')
    } catch (err) {
      await this.safeRollback(client)
      throw this.translateError(err)
    } finally {
      client.release()
    }

    await this.audit.logAction(creator, 'admin_ops.create_staff', {
      entityType: 'user',
      entityId: userId,
      details: {
        personId: req.personId,
        hospitalId,
        staffRole: req.staffRole,
        actor: creator.username,
        mock: true,
      },
    })

    return { success: true, userId, status: 'active' }
  }

  // ---------- Pharmacy admin creates pharmacist (no approval) ----------

  async createPharmacist(creator: AuthenticatedUser, req: CreatePharmacistRequest): Promise<CreateAccountResponse> {
    if (creator.role !== 'PHARMACY_ADMIN') {
      throw new ForbiddenException({ success: false, errorMessage: 'Only a pharmacy admin can create pharmacists.' })
    }

    const client = await this.db.getClient()
    let userId: string
    let pharmacyId: string
    try {
      await client.query('BEGIN')

      await this.assertPersonExists(client, req.personId)
      await this.assertNoExistingAccount(client, req.personId, 'pharmacist')

      const own = UUID_RE.test(creator.id)
        ? await client.query<{ pharmacy_id: string }>(
            'SELECT pharmacy_id FROM identity.pharmacy_admin_profile WHERE user_id = $1::uuid',
            [creator.id],
          )
        : null
      pharmacyId = own?.rows[0]?.pharmacy_id ?? req.pharmacyId
      const p = await client.query(
        `SELECT 1 FROM org.pharmacy WHERE id = $1::uuid AND status = 'active'::org.facility_status`,
        [pharmacyId],
      )
      if (!p.rowCount) {
        throw new BadRequestException({
          success: false,
          errorMessage: 'The pharmacy was not found or is not active.',
        })
      }

      const createdBy = await this.resolveCreatorId(
        client,
        creator,
        `SELECT user_id AS id FROM identity.pharmacy_admin_profile
          ORDER BY (pharmacy_id = $1::uuid) DESC LIMIT 1`,
        pharmacyId,
        'No pharmacy admin account exists to record as creator.',
      )

      const user = await client.query<{ id: string }>(
        `INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status, activated_at)
         VALUES ($1::uuid, 'pharmacist'::identity.account_type, $2, 'active'::identity.account_status, now())
         RETURNING id`,
        [req.personId, `demo-pharmacist-${req.personId}`],
      )
      userId = user.rows[0]!.id

      await client.query(
        `INSERT INTO identity.pharmacist_profile (user_id, pharmacy_id, registration_no, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid)`,
        [userId, pharmacyId, req.registrationNo, createdBy],
      )

      await client.query('COMMIT')
    } catch (err) {
      await this.safeRollback(client)
      throw this.translateError(err)
    } finally {
      client.release()
    }

    await this.audit.logAction(creator, 'admin_ops.create_pharmacist', {
      entityType: 'user',
      entityId: userId,
      details: { personId: req.personId, pharmacyId, actor: creator.username, mock: true },
    })

    return { success: true, userId, status: 'active' }
  }

  // ---------- helpers ----------

  /**
   * created_by_user_id is NOT NULL with a foreign key to identity.app_user. Real users pass their own
   * id. Demo logins (ids like "demo-hospital-admin") have no row, so fall back to an existing admin
   * of the same facility (or any) as a stand-in. The real actor is kept in the audit log.
   */
  private async resolveCreatorId(
    client: PoolClient,
    creator: AuthenticatedUser,
    fallbackSql: string,
    facilityId: string,
    missingMessage: string,
  ): Promise<string> {
    if (UUID_RE.test(creator.id)) {
      const r = await client.query('SELECT 1 FROM identity.app_user WHERE id = $1::uuid', [creator.id])
      if (r.rowCount) return creator.id
    }
    const fb = await client.query<{ id: string }>(fallbackSql, [facilityId])
    if (!fb.rowCount) {
      throw new BadRequestException({ success: false, errorMessage: missingMessage })
    }
    return fb.rows[0]!.id
  }

  private async assertPersonExists(client: PoolClient, personId: string): Promise<void> {
    const r = await client.query('SELECT 1 FROM identity.person WHERE id = $1::uuid', [personId])
    if (!r.rowCount) {
      throw new BadRequestException({
        success: false,
        errorMessage: 'No registered person found. The person must register as a citizen first.',
      })
    }
  }

  private async assertNoExistingAccount(client: PoolClient, personId: string, accountType: string): Promise<void> {
    const r = await client.query(
      'SELECT 1 FROM identity.app_user WHERE person_id = $1::uuid AND account_type = $2::identity.account_type',
      [personId, accountType],
    )
    if (r.rowCount) {
      throw new ConflictException({
        success: false,
        errorMessage: 'An account of this type already exists for this person.',
      })
    }
  }

  private async safeRollback(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK')
    } catch (e) {
      this.logger.warn(`Rollback failed: ${e}`)
    }
  }

  private translateError(err: unknown): unknown {
    const e = err as { code?: string; constraint?: string }
    if (e?.code === '23505' || e?.code === '23P01') {
      return new ConflictException({
        success: false,
        errorMessage: 'An account or admin post already exists for this person.',
      })
    }
    if (e?.code === '23514') {
      return new BadRequestException({ success: false, errorMessage: 'Some of the submitted details are not valid.' })
    }
    if (err instanceof Error && 'getStatus' in err) return err // already an HttpException
    this.logger.error(`Admin operation failed: ${err instanceof Error ? err.message : String(err)}`)
    return err
  }
}

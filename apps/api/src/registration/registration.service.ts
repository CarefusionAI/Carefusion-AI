import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common'
import crypto from 'crypto'
import type { PoolClient } from 'pg'
import type {
  AadhaarEkycResponse,
  AadhaarOtpInitResponse,
  CitizenRegistrationRequest,
  CitizenRegistrationResponse,
  FaceCheckResponse,
} from '@carefusion/shared'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import { MockAadhaarEkycService } from '../connectors/aadhaar-ekyc.mock'
import { MockFaceCheckService } from '../connectors/face-check.mock'
import { MockAbhaService } from '../connectors/abha.mock'
import type { AuthenticatedUser } from '../auth/types'

/** Demo-only HMAC key for lookup hashes. Real key management comes later (not a secret). */
const DEMO_HMAC_KEY = 'carefusion-demo-key'
/** Version of the privacy notice shown in the demo registration form. */
const NOTICE_VERSION = 'demo-v1'

/** System actor used for audit entries written during public registration. */
const SYSTEM_REGISTRATION_USER: AuthenticatedUser = {
  id: 'system-registration',
  username: 'system-registration',
  role: 'CITIZEN',
  isDemo: true,
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly aadhaar: MockAadhaarEkycService,
    private readonly face: MockFaceCheckService,
    private readonly abha: MockAbhaService,
  ) {}

  // ---------- Mock connector pass-throughs ----------

  initAadhaarOtp(aadhaarNumber: string): Promise<AadhaarOtpInitResponse> {
    return this.aadhaar.initOtp(aadhaarNumber)
  }

  verifyAadhaarEkyc(aadhaarNumber: string, otp: string, txnId: string): Promise<AadhaarEkycResponse> {
    return this.aadhaar.verifyEkyc(aadhaarNumber, otp, txnId)
  }

  verifyFace(aadhaarToken: string, selfieBase64: string): Promise<FaceCheckResponse> {
    return this.face.verifyFace(aadhaarToken, selfieBase64)
  }

  // ---------- Districts ----------

  /** Kerala districts (state id 33) for the registration form dropdown. */
  async listKeralaDistricts(): Promise<{ id: string; name: string }[]> {
    return this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM geo.district WHERE state_id = $1 ORDER BY name',
      [33],
    )
  }

  // ---------- Citizen registration ----------

  async registerCitizen(req: CitizenRegistrationRequest): Promise<CitizenRegistrationResponse> {
    // Rule: tokens only. Refuse anything shaped like a raw 12-digit Aadhaar number.
    if (/^\d{12}$/.test(req.aadhaarToken)) {
      throw new BadRequestException({
        success: false,
        errorMessage: 'A raw Aadhaar number is not accepted. Send the verification token only.',
      })
    }

    const phoneHash = this.hmac(req.phone)
    const emailHash = req.email ? this.hmac(req.email.trim().toLowerCase()) : null

    const client = await this.db.getClient()
    let personId: string
    let userId: string
    try {
      await client.query('BEGIN')

      // 1-2. Duplicate checks (the DB unique constraints are the final guard).
      const dupAadhaar = await client.query('SELECT 1 FROM identity.person WHERE aadhaar_token = $1', [req.aadhaarToken])
      if (dupAadhaar.rowCount) {
        throw new ConflictException({
          success: false,
          errorMessage: 'This Aadhaar identity is already registered. Please log in instead.',
        })
      }
      const dupPhone = await client.query('SELECT 1 FROM identity.person WHERE phone_hash = $1', [phoneHash])
      if (dupPhone.rowCount) {
        throw new ConflictException({
          success: false,
          errorMessage: 'This phone number is already registered.',
        })
      }
      if (emailHash) {
        const dupEmail = await client.query('SELECT 1 FROM identity.person WHERE email_hash = $1', [emailHash])
        if (dupEmail.rowCount) {
          throw new ConflictException({
            success: false,
            errorMessage: 'This email address is already registered.',
          })
        }
      }

      // Minor handling: under 18 needs a registered citizen guardian.
      const isMinor = await this.isUnder18(client, req.dateOfBirth)
      let guardianConsentGiven = false
      if (isMinor) {
        if (!req.guardianPersonId) {
          throw new BadRequestException({
            success: false,
            errorMessage: 'Citizens under 18 must be registered with a guardian.',
          })
        }
        const guardian = await client.query(
          `SELECT 1 FROM identity.app_user
            WHERE person_id = $1::uuid AND account_type = 'citizen'::identity.account_type
              AND status = 'active'::identity.account_status`,
          [req.guardianPersonId],
        )
        if (!guardian.rowCount) {
          throw new BadRequestException({
            success: false,
            errorMessage: 'The guardian must be an existing, active registered citizen.',
          })
        }
        guardianConsentGiven = true
      } else if (req.guardianPersonId) {
        throw new BadRequestException({
          success: false,
          errorMessage: 'A guardian can only be set for citizens under 18.',
        })
      }

      // 3. Person. Demo: phone/email stored as raw bytes (real encryption comes later).
      const person = await client.query<{ id: string }>(
        `INSERT INTO identity.person
           (full_name, date_of_birth, sex, aadhaar_token, phone_hash, phone_enc,
            email_hash, email_enc, kyc_status, face_check_status, identity_locked_at)
         VALUES ($1, $2::date, $3::identity.sex, $4, $5, $6, $7, $8,
                 $9::identity.check_status, $10::identity.check_status, now())
         RETURNING id`,
        [
          req.fullName,
          req.dateOfBirth,
          req.sex,
          req.aadhaarToken,
          phoneHash,
          Buffer.from(req.phone),
          emailHash,
          req.email ? Buffer.from(req.email) : null,
          'passed',
          'passed',
        ],
      )
      personId = person.rows[0]!.id

      // 4. District lookup (Kerala).
      let districtId: string | null = null
      if (req.districtName) {
        const d = await client.query<{ id: string }>(
          'SELECT id FROM geo.district WHERE state_id = $1 AND lower(name) = lower($2)',
          [33, req.districtName],
        )
        districtId = d.rows[0]?.id ?? null
      }

      // 5. App user. Demo: auto-activate. (Future: face mismatch => account_flag +
      //    approval_request 'flagged_citizen' and status stays 'pending'.)
      const user = await client.query<{ id: string }>(
        `INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status, activated_at)
         VALUES ($1::uuid, $2::identity.account_type, $3, $4::identity.account_status, now())
         RETURNING id`,
        [personId, 'citizen', `demo-citizen-${personId}`, 'active'],
      )
      userId = user.rows[0]!.id

      // 6. Citizen profile.
      await client.query(
        `INSERT INTO identity.citizen_profile
           (person_id, preferred_language, blood_group, district_id, ai_research_opt_in,
            guardian_person_id, guardian_consent_at, handover_due_on)
         VALUES ($1::uuid, $2, $3::identity.blood_group, $4::uuid, $5,
                $6::uuid,
                CASE WHEN $6::uuid IS NULL THEN NULL ELSE now() END,
                CASE WHEN $7::boolean THEN ($8::date + interval '18 years')::date ELSE NULL END)`,
        [
          personId,
          req.preferredLanguage,
          req.bloodGroup,
          districtId,
          req.aiResearchOptIn,
          req.guardianPersonId ?? null,
          guardianConsentGiven,
          req.dateOfBirth,
        ],
      )

      // 7. Consent records (given by the guardian for minors, else by the person).
      const givenBy = req.guardianPersonId ?? personId
      const consents: { purpose: string; details: Record<string, unknown> }[] = [
        { purpose: 'privacy_notice', details: {} },
      ]
      if (req.locationLoggingAccepted) consents.push({ purpose: 'location_logging', details: {} })
      if (req.aiResearchOptIn) consents.push({ purpose: 'ai_research', details: {} })
      if (guardianConsentGiven) {
        consents.push({ purpose: 'minor_guardian', details: { guardianPersonId: req.guardianPersonId } })
      }
      for (const c of consents) {
        await client.query(
          `INSERT INTO identity.consent_record (person_id, purpose, notice_version, given_by_person_id, details)
           VALUES ($1::uuid, $2::identity.consent_purpose, $3, $4::uuid, $5::jsonb)`,
          [personId, c.purpose, NOTICE_VERSION, givenBy, JSON.stringify(c.details)],
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await this.safeRollback(client)
      throw this.translateError(err)
    } finally {
      client.release()
    }

    // 8. ABHA creation in the background (does not block the response).
    void this.createAbhaInBackground(personId, req)

    // 9. Audit (own transaction inside AuditService; failures are logged, not thrown).
    await this.audit.logAction(SYSTEM_REGISTRATION_USER, 'registration.citizen', {
      entityType: 'person',
      entityId: personId,
      details: {
        userId,
        guardian: !!req.guardianPersonId,
        locationLoggingAccepted: req.locationLoggingAccepted,
        aiResearchOptIn: req.aiResearchOptIn,
        mock: true,
      },
    })

    // 10. Response. ABHA is not yet available (created in the background).
    return { success: true, personId, userId, status: 'active' }
  }

  // ---------- helpers ----------

  private hmac(value: string): Buffer {
    return crypto.createHmac('sha256', DEMO_HMAC_KEY).update(value).digest()
  }

  private async isUnder18(client: PoolClient, dateOfBirth: string): Promise<boolean> {
    const r = await client.query<{ minor: boolean }>(
      `SELECT ($1::date + interval '18 years')::date > current_date AS minor`,
      [dateOfBirth],
    )
    return r.rows[0]!.minor
  }

  private async createAbhaInBackground(personId: string, req: CitizenRegistrationRequest): Promise<void> {
    try {
      const res = await this.abha.createAbha({
        aadhaarToken: req.aadhaarToken,
        name: req.fullName,
        dob: req.dateOfBirth,
        sex: req.sex,
        phone: req.phone,
        email: req.email,
      })
      if (!res.success || !res.abhaNumber) {
        this.logger.warn(`ABHA creation failed for person ${personId}: ${res.errorMessage ?? 'unknown'}`)
        return
      }
      await this.db.query(
        'UPDATE identity.person SET abha_number = $1, abha_address = $2, updated_at = now() WHERE id = $3::uuid',
        [res.abhaNumber, res.abhaAddress ?? null, personId],
      )
    } catch (err) {
      this.logger.warn(`ABHA background update failed for person ${personId}: ${err}`)
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
    if (e?.code === '23505') {
      const c = e.constraint ?? ''
      let msg = 'A record with these details already exists.'
      if (c.includes('aadhaar')) msg = 'This Aadhaar identity is already registered.'
      else if (c.includes('phone')) msg = 'This phone number is already registered.'
      else if (c.includes('email')) msg = 'This email address is already registered.'
      return new ConflictException({ success: false, errorMessage: msg })
    }
    if (e?.code === '23514') {
      return new BadRequestException({ success: false, errorMessage: 'Some of the submitted details are not valid.' })
    }
    if (err instanceof Error && 'getStatus' in err) return err // already an HttpException
    this.logger.error(`Registration failed: ${err instanceof Error ? err.message : String(err)}`)
    return err
  }
}

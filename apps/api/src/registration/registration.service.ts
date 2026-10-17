import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common'
import crypto from 'crypto'
import type { PoolClient } from 'pg'
import type {
  AadhaarEkycResponse,
  AadhaarOtpInitResponse,
  CitizenRegistrationRequest,
  CitizenRegistrationResponse,
  DoctorRegistrationRequest,
  DoctorRegistrationResponse,
  DrugLicenceVerifyResponse,
  FaceCheckResponse,
  HfrVerifyResponse,
  HospitalAdminRegistrationRequest,
  HospitalAdminRegistrationResponse,
  HprVerifyResponse,
  PharmacyAdminRegistrationRequest,
  PharmacyAdminRegistrationResponse,
} from '@carefusion/shared'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import { MockAadhaarEkycService } from '../connectors/aadhaar-ekyc.mock'
import { MockFaceCheckService } from '../connectors/face-check.mock'
import { MockAbhaService } from '../connectors/abha.mock'
import { MockHprService } from '../connectors/hpr.mock'
import { MockHfrService } from '../connectors/hfr.mock'
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
    private readonly hpr: MockHprService,
    private readonly hfr: MockHfrService,
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

  verifyHpr(hprId: string): Promise<HprVerifyResponse> {
    return this.hpr.verifyHpr(hprId)
  }

  verifyHfr(hfrId: string): Promise<HfrVerifyResponse> {
    return this.hfr.verifyHfr(hfrId)
  }

  verifyDrugLicence(licenceNo: string): Promise<DrugLicenceVerifyResponse> {
    return this.hfr.verifyDrugLicence(licenceNo)
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

  // ---------- Facility lists (for the registration forms) ----------

  async listHospitals(districtId?: string): Promise<
    { id: string; hfr_id: string; name: string; ownership: string; hospital_type: string; district_id: string }[]
  > {
    const sql = `SELECT id, hfr_id, name, ownership, hospital_type, district_id
                   FROM org.hospital
                  WHERE status = 'active'::org.facility_status
                    AND ($1::uuid IS NULL OR district_id = $1::uuid)
                  ORDER BY name`
    return this.db.query(sql, [districtId ?? null])
  }

  async listPharmacies(districtId?: string): Promise<
    { id: string; licence_no: string; name: string; pharmacy_type: string; district_id: string }[]
  > {
    const sql = `SELECT id, licence_no, name, pharmacy_type, district_id
                   FROM org.pharmacy
                  WHERE status = 'active'::org.facility_status
                    AND ($1::uuid IS NULL OR district_id = $1::uuid)
                  ORDER BY name`
    return this.db.query(sql, [districtId ?? null])
  }

  // ---------- Doctor registration ----------

  async registerDoctor(req: DoctorRegistrationRequest): Promise<DoctorRegistrationResponse> {
    // Re-check the HPR ID on the server; never trust the browser's earlier check.
    const hprResult = await this.hpr.verifyHpr(req.hprId)
    if (!hprResult.success || !hprResult.verified) {
      throw new BadRequestException({
        success: false,
        errorMessage: hprResult.errorMessage ?? 'HPR ID could not be verified.',
      })
    }

    const client = await this.db.getClient()
    let userId: string
    try {
      await client.query('BEGIN')

      await this.assertPersonExists(client, req.personId)
      await this.assertNoExistingAccount(client, req.personId, 'doctor')
      const districtId = await this.getActiveHospitalDistrict(client, req.hospitalId)

      userId = await this.insertPendingUser(client, req.personId, 'doctor')

      await client.query(
        `INSERT INTO identity.doctor_profile
           (user_id, hpr_id, council_name, council_reg_no, specialisation, degrees,
            hospital_id, department_id, employment_type, hpr_verified_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7::uuid, $8::uuid,
                 $9::identity.employment_type, now())`,
        [
          userId,
          req.hprId,
          req.councilName,
          req.councilRegNo,
          req.specialisation ?? null,
          JSON.stringify(req.degrees),
          req.hospitalId,
          req.departmentId ?? null,
          req.employmentType,
        ],
      )

      await this.insertApprovalRequest(client, 'doctor', userId, districtId, { hpr_verified: true })

      await client.query('COMMIT')
    } catch (err) {
      await this.safeRollback(client)
      throw this.translateError(err)
    } finally {
      client.release()
    }

    await this.audit.logAction(SYSTEM_REGISTRATION_USER, 'registration.doctor', {
      entityType: 'user',
      entityId: userId,
      details: { personId: req.personId, hospitalId: req.hospitalId, mock: true },
    })

    return { success: true, userId, status: 'pending' }
  }

  // ---------- Hospital admin registration ----------

  async registerHospitalAdmin(req: HospitalAdminRegistrationRequest): Promise<HospitalAdminRegistrationResponse> {
    const client = await this.db.getClient()
    let userId: string
    try {
      await client.query('BEGIN')

      await this.assertPersonExists(client, req.personId)
      await this.assertNoExistingAccount(client, req.personId, 'hospital_admin')
      const districtId = await this.getActiveHospitalDistrict(client, req.hospitalId)

      userId = await this.insertPendingUser(client, req.personId, 'hospital_admin')

      await client.query(
        `INSERT INTO identity.hospital_admin_profile (user_id, hospital_id) VALUES ($1::uuid, $2::uuid)`,
        [userId, req.hospitalId],
      )

      await this.insertApprovalRequest(client, 'hospital_admin', userId, districtId, {})

      await client.query('COMMIT')
    } catch (err) {
      await this.safeRollback(client)
      throw this.translateError(err)
    } finally {
      client.release()
    }

    await this.audit.logAction(SYSTEM_REGISTRATION_USER, 'registration.hospital_admin', {
      entityType: 'user',
      entityId: userId,
      details: { personId: req.personId, hospitalId: req.hospitalId, mock: true },
    })

    return { success: true, userId, status: 'pending' }
  }

  // ---------- Pharmacy admin registration ----------

  async registerPharmacyAdmin(req: PharmacyAdminRegistrationRequest): Promise<PharmacyAdminRegistrationResponse> {
    // Re-check the drug licence on the server (mock connector).
    const licence = await this.hfr.verifyDrugLicence(req.drugLicenceNo)
    if (!licence.success || !licence.verified) {
      throw new BadRequestException({
        success: false,
        errorMessage: licence.errorMessage ?? 'Drug licence could not be verified.',
      })
    }

    const client = await this.db.getClient()
    let userId: string
    try {
      await client.query('BEGIN')

      await this.assertPersonExists(client, req.personId)
      await this.assertNoExistingAccount(client, req.personId, 'pharmacy_admin')

      const pharmacy = await client.query<{ district_id: string }>(
        'SELECT district_id FROM org.pharmacy WHERE id = $1::uuid',
        [req.pharmacyId],
      )
      if (!pharmacy.rowCount) {
        throw new BadRequestException({ success: false, errorMessage: 'The selected pharmacy was not found.' })
      }
      const districtId = pharmacy.rows[0]!.district_id

      userId = await this.insertPendingUser(client, req.personId, 'pharmacy_admin')

      await client.query(
        `INSERT INTO identity.pharmacy_admin_profile (user_id, pharmacy_id) VALUES ($1::uuid, $2::uuid)`,
        [userId, req.pharmacyId],
      )

      await this.insertApprovalRequest(client, 'pharmacy_admin', userId, districtId, {
        drug_licence_verified: true,
      })

      await client.query('COMMIT')
    } catch (err) {
      await this.safeRollback(client)
      throw this.translateError(err)
    } finally {
      client.release()
    }

    await this.audit.logAction(SYSTEM_REGISTRATION_USER, 'registration.pharmacy_admin', {
      entityType: 'user',
      entityId: userId,
      details: { personId: req.personId, pharmacyId: req.pharmacyId, mock: true },
    })

    return { success: true, userId, status: 'pending' }
  }

  // ---------- helpers ----------

  private async assertPersonExists(client: PoolClient, personId: string): Promise<void> {
    const r = await client.query('SELECT 1 FROM identity.person WHERE id = $1::uuid', [personId])
    if (!r.rowCount) {
      throw new BadRequestException({
        success: false,
        errorMessage: 'No registered person found. Please register as a citizen first.',
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

  /** Returns the hospital's district id; throws if the hospital is missing or not active. */
  private async getActiveHospitalDistrict(client: PoolClient, hospitalId: string): Promise<string> {
    const r = await client.query<{ district_id: string }>(
      `SELECT district_id FROM org.hospital
        WHERE id = $1::uuid AND status = 'active'::org.facility_status`,
      [hospitalId],
    )
    if (!r.rowCount) {
      throw new BadRequestException({
        success: false,
        errorMessage: 'The selected hospital was not found or is not active.',
      })
    }
    return r.rows[0]!.district_id
  }

  private async insertPendingUser(client: PoolClient, personId: string, accountType: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO identity.app_user (person_id, account_type, keycloak_sub, status)
       VALUES ($1::uuid, $2::identity.account_type, $3, 'pending'::identity.account_status)
       RETURNING id`,
      [personId, accountType, `demo-${accountType.replace(/_/g, '-')}-${personId}`],
    )
    return r.rows[0]!.id
  }

  private async insertApprovalRequest(
    client: PoolClient,
    subjectType: string,
    userId: string,
    districtId: string,
    checkResults: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO admin.approval_request
         (subject_type, subject_user_id, step, assigned_level, assigned_district_id,
          status, due_at, check_results)
       VALUES ($1::admin.approval_subject, $2::uuid, 1, 'district'::admin.admin_level, $3::uuid,
               'pending'::admin.approval_status, now() + interval '7 days', $4::jsonb)`,
      [subjectType, userId, districtId, JSON.stringify(checkResults)],
    )
  }

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
      if (c.includes('hpr')) msg = 'This HPR ID is already registered.'
      else if (c.includes('council')) msg = 'This council registration number is already registered.'
      else if (c.includes('person') || c.includes('app_user')) msg = 'An account of this type already exists for this person.'
      else if (c.includes('aadhaar')) msg = 'This Aadhaar identity is already registered.'
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

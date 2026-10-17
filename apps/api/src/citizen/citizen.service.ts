import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  CitizenProfileResponse,
  SpecialCategoryRequest,
  SpecialCategoryType,
  UpdateCitizenProfileRequest,
} from '@carefusion/shared'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class CitizenService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(personId: string): Promise<CitizenProfileResponse> {
    const rows = await this.db.query(
      `SELECT p.id, p.full_name, p.date_of_birth::text AS date_of_birth, p.sex::text AS sex,
              p.aadhaar_token, p.abha_number, p.abha_address::text AS abha_address,
              p.kyc_status::text AS kyc_status, p.face_check_status::text AS face_check_status,
              p.identity_locked_at, p.photo_key,
              cp.preferred_language, cp.blood_group::text AS blood_group,
              cp.organ_donor_status::text AS organ_donor_status, cp.ai_research_opt_in,
              d.id AS district_id, d.name AS district_name,
              s.id AS state_id, s.name AS state_name
         FROM identity.person p
         JOIN identity.citizen_profile cp ON cp.person_id = p.id
         LEFT JOIN geo.district d ON d.id = cp.district_id
         LEFT JOIN geo.state s ON s.id = d.state_id
        WHERE p.id = $1`,
      [personId],
    )
    const r = rows[0]
    if (!r) throw new NotFoundException('Citizen profile not found')

    const categories = await this.db.query(
      `SELECT sc.id, sc.category_code::text AS category_code, sct.name AS category_name,
              sc.other_text, sc.status
         FROM identity.special_category sc
         JOIN identity.special_category_type sct ON sct.code = sc.category_code
        WHERE sc.person_id = $1 AND sc.ended_at IS NULL
        ORDER BY sc.set_at`,
      [personId],
    )

    const contacts = await this.db.query(
      `SELECT ec.id, ec.contact_person_id, cpn.full_name AS contact_name, ec.relation, ec.priority
         FROM identity.emergency_contact ec
         JOIN identity.person cpn ON cpn.id = ec.contact_person_id
        WHERE ec.citizen_person_id = $1 AND ec.removed_at IS NULL
        ORDER BY ec.priority, ec.added_at`,
      [personId],
    )

    return {
      person: {
        id: r.id,
        fullName: r.full_name,
        dateOfBirth: r.date_of_birth,
        sex: r.sex,
        aadhaarToken: r.aadhaar_token,
        abhaNumber: r.abha_number,
        abhaAddress: r.abha_address,
        kycStatus: r.kyc_status,
        faceCheckStatus: r.face_check_status,
        identityLocked: r.identity_locked_at != null,
        photoKey: r.photo_key,
      },
      profile: {
        preferredLanguage: r.preferred_language,
        bloodGroup: r.blood_group,
        organDonorStatus: r.organ_donor_status,
        aiResearchOptIn: r.ai_research_opt_in,
        district: r.district_id ? { id: r.district_id, name: r.district_name } : null,
        state: r.state_id != null ? { id: String(r.state_id), name: r.state_name } : null,
      },
      specialCategories: categories.map((c) => ({
        id: c.id,
        categoryCode: c.category_code,
        categoryName: c.category_name,
        otherText: c.other_text,
        status: c.status,
      })),
      emergencyContacts: contacts.map((c) => ({
        id: c.id,
        contactPersonId: c.contact_person_id,
        contactName: c.contact_name,
        relation: c.relation,
        priority: c.priority,
      })),
    }
  }

  /** Only language, blood group and AI-research opt-in are editable. Identity fields stay locked. */
  async updateProfile(personId: string, patch: UpdateCitizenProfileRequest): Promise<CitizenProfileResponse> {
    const sets: string[] = []
    const params: unknown[] = []
    if (patch.preferredLanguage !== undefined) {
      params.push(patch.preferredLanguage)
      sets.push(`preferred_language = $${params.length}`)
    }
    if (patch.bloodGroup !== undefined) {
      params.push(patch.bloodGroup)
      sets.push(`blood_group = $${params.length}::identity.blood_group`)
    }
    if (patch.aiResearchOptIn !== undefined) {
      params.push(patch.aiResearchOptIn)
      sets.push(`ai_research_opt_in = $${params.length}`)
    }
    if (sets.length === 0) throw new BadRequestException('Nothing to update')

    params.push(personId)
    const updated = await this.db.query(
      `UPDATE identity.citizen_profile SET ${sets.join(', ')} WHERE person_id = $${params.length} RETURNING person_id`,
      params,
    )
    if (updated.length === 0) throw new NotFoundException('Citizen profile not found')
    return this.getProfile(personId)
  }

  async listSpecialCategoryTypes(): Promise<SpecialCategoryType[]> {
    return this.db.query<SpecialCategoryType>(
      `SELECT code::text AS code, name FROM identity.special_category_type WHERE is_active ORDER BY name`,
    )
  }

  async addSpecialCategory(personId: string, userId: string, body: SpecialCategoryRequest) {
    const types = await this.db.query(
      `SELECT code::text AS code FROM identity.special_category_type WHERE code = $1 AND is_active`,
      [body.categoryCode],
    )
    const type = types[0]
    if (!type) throw new BadRequestException('Unknown special category')
    const isOther = type.code.toLowerCase() === 'other'
    if (isOther && !body.otherText) throw new BadRequestException('otherText is required for category "other"')
    if (!isOther && body.otherText) throw new BadRequestException('otherText is only allowed for category "other"')

    const rows = await this.db.query(
      `INSERT INTO identity.special_category (person_id, category_code, other_text, status, set_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, category_code::text AS category_code, other_text, status`,
      [personId, type.code, body.otherText ?? null, body.status, userId],
    )
    const row = rows[0]
    return { id: row.id, categoryCode: row.category_code, otherText: row.other_text, status: row.status }
  }

  async endSpecialCategory(personId: string, id: string) {
    const rows = await this.db.query(`SELECT person_id, ended_at FROM identity.special_category WHERE id = $1`, [id])
    const row = rows[0]
    if (!row) throw new NotFoundException('Special category not found')
    if (row.person_id !== personId) throw new ForbiddenException('Not your record')
    if (row.ended_at) throw new BadRequestException('Already ended')

    const ended = await this.db.query(
      `UPDATE identity.special_category SET ended_at = now() WHERE id = $1 RETURNING ended_at`,
      [id],
    )
    return { id, endedAt: new Date(ended[0].ended_at).toISOString() }
  }

  /** Make sure the 5 system folders exist for this citizen (safe to call repeatedly). */
  async ensureSystemFolders(personId: string, userId: string): Promise<void> {
    const rows = await this.db.query(
      `SELECT count(*)::int AS n FROM records.folder WHERE patient_person_id = $1 AND kind <> 'user'`,
      [personId],
    )
    if ((rows[0]?.n ?? 0) >= 5) return
    await this.db.query(`SELECT records.create_system_folders($1, $2)`, [personId, userId])
  }
}

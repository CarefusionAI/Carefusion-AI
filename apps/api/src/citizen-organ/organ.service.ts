import { createHash, randomBytes } from 'node:crypto'
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  CitizenNextOfKinDto,
  CitizenNextOfKinRequest,
  CitizenOrganOverviewResponse,
  CitizenOrganTypeDto,
  CitizenPledgeStatus,
  CitizenWitnessDto,
  CitizenWitnessInviteRequest,
  CitizenWitnessInviteResponse,
} from '@carefusion/shared/dist/citizen-extras.js'
import { RequestDbService, RequestTx } from '../events/request-db.service'
import type { CitizenCtx } from '../citizen-app/common/citizen-request'
import { demoNow, iso, isoReq } from '../citizen-app/common/clock'

const STEPS = ['Your intent', 'Family informed', 'Sign at hospital', 'Registered with KNOS']

const ORGAN_NOTE: Record<string, string> = {
  kidneys: 'Most needed',
  liver: 'Can help two people',
  heart: 'Within 4–6 hours',
  lungs: 'Within 6–8 hours',
  pancreas: 'For type 1 diabetes',
  small_intestine: 'For intestinal failure',
  corneas: 'Up to 6 hours after death',
  skin: 'For burns patients',
  bone: 'Joints, tendons, valves',
  heart_valves: 'For heart valve repair',
}

const STEP_LABEL: Record<string, string> = {
  none: 'Not started',
  intent: 'Step 2 of 4 · tell your family',
  family_informed: 'Step 3 of 4 · sign at a hospital',
  signing: 'Step 3 of 4 · signing pending',
  registered: 'Step 4 of 4 · registered',
}

interface PledgeRow {
  id: string
  status: CitizenPledgeStatus
  organs: string[]
  pledged_at: Date
  family_informed_at: Date | null
  hospital_id: string | null
  hospital_name: string | null
  knos_status: string
  knos_ref: string | null
  verification_status: string
}

@Injectable()
export class OrganService {
  constructor(private readonly requestDb: RequestDbService) {}

  // ------------------------------------------------------------------ overview
  async overview(c: CitizenCtx): Promise<CitizenOrganOverviewResponse> {
    return this.requestDb.run(c.user, (tx) => this.overviewIn(tx, c))
  }

  private currentStep(p: PledgeRow | undefined): number {
    if (!p) return 0
    switch (p.status) {
      case 'intent':
        return 1
      case 'family_informed':
      case 'signing':
        return 2
      case 'registered':
        return p.knos_status === 'registered' ? 4 : 3
      default:
        return 0
    }
  }

  private async overviewIn(tx: RequestTx, c: CitizenCtx): Promise<CitizenOrganOverviewResponse> {
    const now = demoNow()
    const pledge = (
      await tx.query<PledgeRow>(
        `SELECT p.id, p.status, p.organs, p.pledged_at, p.family_informed_at, p.hospital_id, h.name AS hospital_name,
                p.knos_status, p.knos_ref, p.verification_status
           FROM donation.organ_pledge p LEFT JOIN org.hospital h ON h.id = p.hospital_id
          WHERE p.person_id = $1 AND p.withdrawn_at IS NULL`,
        [c.personId],
      )
    )[0]

    const me = (
      await tx.query<{
        full_name: string
        abha_number: string | null
        blood_group: string
        state_id: number | null
        state_name: string | null
      }>(
        `SELECT p.full_name, p.abha_number, cp.blood_group::text AS blood_group, d.state_id, s.name AS state_name
           FROM identity.person p
           LEFT JOIN identity.citizen_profile cp ON cp.person_id = p.id
           LEFT JOIN geo.district d ON d.id = cp.district_id
           LEFT JOIN geo.state s ON s.id = d.state_id
          WHERE p.id = $1`,
        [c.personId],
      )
    )[0]

    const waiting = await tx.query<{ organ: string; waiting: number }>(
      `SELECT DISTINCT ON (organ) organ::text AS organ, waiting FROM donation.organ_waitlist_snapshot
        WHERE state_id = $1 ORDER BY organ, as_of DESC`,
      [me?.state_id ?? 33],
    )
    const types = await tx.query<{ code: string; name: string; kind: 'organ' | 'tissue' }>(
      'SELECT code::text AS code, name, kind FROM donation.organ_type WHERE is_active ORDER BY kind, array_position(ARRAY[\'kidneys\',\'liver\',\'heart\',\'lungs\',\'pancreas\',\'small_intestine\',\'corneas\',\'skin\',\'bone\',\'heart_valves\'], code::text), name',
    )
    const organTypes: CitizenOrganTypeDto[] = types.map((t) => {
      const w = waiting.find((x) => x.organ === t.code)?.waiting
      const base = ORGAN_NOTE[t.code] ?? ''
      const note = w && t.code === 'kidneys' ? `${base} · ${w.toLocaleString('en-IN')} waiting in ${me?.state_name ?? 'your state'}` : base
      return { code: t.code, name: t.name, kind: t.kind, note }
    })

    let witnesses: CitizenWitnessDto[] = []
    let nextOfKin: CitizenNextOfKinDto[] = []
    if (pledge) {
      const w = await tx.query<{
        id: string
        full_name: string
        relation: string
        is_relative: boolean
        signed_at: Date | null
        link_expires_at: Date | null
      }>(
        `SELECT id, full_name, relation, is_relative, signed_at, link_expires_at FROM donation.organ_witness
          WHERE pledge_id = $1 ORDER BY created_at, full_name`,
        [pledge.id],
      )
      witnesses = w.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        relation: r.relation,
        isRelative: r.is_relative,
        status: r.signed_at ? 'signed' : r.link_expires_at && r.link_expires_at < now ? 'expired' : 'pending',
        signedAt: iso(r.signed_at),
        linkExpiresAt: iso(r.link_expires_at),
      }))
      const n = await tx.query<{
        id: string
        full_name: string
        relation: string
        channel: string
        notified_at: Date | null
        acknowledged_at: Date | null
      }>(
        `SELECT id, full_name, relation, channel, notified_at, acknowledged_at FROM donation.next_of_kin_notice
          WHERE pledge_id = $1 ORDER BY notified_at NULLS LAST, full_name`,
        [pledge.id],
      )
      nextOfKin = n.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        relation: r.relation,
        channel: r.channel,
        notifiedAt: iso(r.notified_at),
        acknowledgedAt: iso(r.acknowledged_at),
        status: r.acknowledged_at ? 'acknowledged' : r.notified_at ? 'informed' : 'not_sent',
      }))
    }

    const contact = (
      await tx.query<{ full_name: string; relation: string }>(
        `SELECT cp.full_name, e.relation FROM identity.emergency_contact e JOIN identity.person cp ON cp.id = e.contact_person_id
          WHERE e.citizen_person_id = $1 AND e.removed_at IS NULL ORDER BY e.priority LIMIT 1`,
        [c.personId],
      )
    )[0]

    const hospitals = await tx.query<{ id: string; name: string }>(
      `SELECT DISTINCT h.id, h.name FROM donation.transplant_centre t JOIN org.hospital h ON h.id = t.hospital_id
        WHERE t.is_active ORDER BY h.name`,
    )
    const deskHospital = pledge?.hospital_id
      ? { id: pledge.hospital_id, name: pledge.hospital_name ?? 'Hospital' }
      : hospitals[0]
    const signed = witnesses.filter((w) => w.status === 'signed')
    const organNames = (pledge?.organs ?? []).map((code) => organTypes.find((t) => t.code === code)?.name ?? code)

    return {
      pledge: pledge
        ? {
            id: pledge.id,
            status: pledge.status,
            currentStep: this.currentStep(pledge),
            stepLabel: STEP_LABEL[pledge.status] ?? pledge.status,
            organs: pledge.organs,
            pledgedAt: isoReq(pledge.pledged_at),
            familyInformedAt: iso(pledge.family_informed_at),
            hospital: pledge.hospital_id ? { id: pledge.hospital_id, name: pledge.hospital_name ?? 'Hospital' } : null,
            knosStatus: pledge.knos_status,
            knosRef: pledge.knos_ref,
            verificationStatus: pledge.verification_status,
          }
        : null,
      steps: STEPS,
      organTypes,
      witnesses,
      nextOfKin,
      signedWitnesses: signed.length,
      hasRelativeWitness: signed.some((w) => w.isRelative),
      card: {
        name: me?.full_name ?? '',
        abhaNumber: me?.abha_number ?? null,
        bloodGroup: me?.blood_group ?? 'unknown',
        pledged: organNames,
        callFamily: contact ? `${contact.full_name} · ${contact.relation}` : null,
      },
      signingDesk: deskHospital
        ? {
            hospitalId: deskHospital.id,
            hospitalName: deskHospital.name,
            hours: 'Mon–Sat, 09:00–16:00',
            where: 'organ donation desk, ground floor',
          }
        : null,
      hospitals,
      stateName: me?.state_name ?? 'Kerala',
      statePledges: 184210,
      statePledgesIsDemoFigure: true,
      canEditOrgans: !pledge || pledge.status !== 'registered',
    }
  }

  // ------------------------------------------------------------------ helpers
  private async activePledge(tx: RequestTx, c: CitizenCtx): Promise<{ id: string; status: CitizenPledgeStatus } | undefined> {
    return (
      await tx.query<{ id: string; status: CitizenPledgeStatus }>(
        'SELECT id, status FROM donation.organ_pledge WHERE person_id = $1 AND withdrawn_at IS NULL',
        [c.personId],
      )
    )[0]
  }

  private async requirePledge(tx: RequestTx, c: CitizenCtx) {
    const p = await this.activePledge(tx, c)
    if (!p) throw new BadRequestException('Choose what you would like to donate first (step 1)')
    return p
  }

  private async setProfileStatus(tx: RequestTx, c: CitizenCtx, status: 'pledged' | 'withdrawn') {
    await tx.query('SAVEPOINT organ_profile')
    try {
      await tx.query('UPDATE identity.citizen_profile SET organ_donor_status = $2::identity.organ_status WHERE person_id = $1', [c.personId, status])
      await tx.query('RELEASE SAVEPOINT organ_profile')
    } catch {
      await tx.query('ROLLBACK TO SAVEPOINT organ_profile')
    }
  }

  // ------------------------------------------------------------------ step 1: intent and organ selection
  async setOrgans(c: CitizenCtx, organs: string[]): Promise<CitizenOrganOverviewResponse> {
    const unique = [...new Set(organs)]
    return this.requestDb.run(c.user, async (tx) => {
      const cur = await this.activePledge(tx, c)
      if (cur && cur.status === 'registered') {
        throw new ConflictException('A registered pledge cannot be changed here. Withdraw it first, then make a new one.')
      }
      if (cur) {
        await tx.query('UPDATE donation.organ_pledge SET organs = $2::text[] WHERE id = $1', [cur.id, unique])
      } else {
        await tx.query(
          `INSERT INTO donation.organ_pledge (person_id, organs, status, verification_status) VALUES ($1, $2::text[], 'intent', 'pending')`,
          [c.personId, unique],
        )
        await this.setProfileStatus(tx, c, 'pledged')
      }
      return this.overviewIn(tx, c)
    })
  }

  // ------------------------------------------------------------------ step 2: family informed
  async informNextOfKin(c: CitizenCtx, body: CitizenNextOfKinRequest): Promise<CitizenOrganOverviewResponse> {
    return this.requestDb.run(c.user, async (tx) => {
      const p = await this.requirePledge(tx, c)
      if (body.personId === c.personId) throw new BadRequestException('Pick a family member, not yourself')
      await tx.query(
        `INSERT INTO donation.next_of_kin_notice (pledge_id, person_id, full_name, relation, channel, notified_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [p.id, body.personId ?? null, body.fullName, body.relation, body.channel],
      )
      if (p.status === 'intent') {
        await tx.query(`UPDATE donation.organ_pledge SET status = 'family_informed', family_informed_at = now() WHERE id = $1`, [p.id])
      }
      return this.overviewIn(tx, c)
    })
  }

  // ------------------------------------------------------------------ step 3: witnesses and signing desk
  async inviteWitness(c: CitizenCtx, body: CitizenWitnessInviteRequest): Promise<{ overview: CitizenOrganOverviewResponse; invite: CitizenWitnessInviteResponse }> {
    return this.requestDb.run(c.user, async (tx) => {
      const p = await this.requirePledge(tx, c)
      if (p.status === 'registered') throw new ConflictException('This pledge is already registered')
      const count = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM donation.organ_witness WHERE pledge_id = $1', [p.id]))[0]!.n
      if (count >= 3) throw new BadRequestException('You can invite at most 3 witnesses')
      if (body.personId === c.personId) throw new BadRequestException('You cannot witness your own pledge')
      const token = randomBytes(24).toString('hex')
      const hash = createHash('sha256').update(token).digest()
      const w = (
        await tx.query<{ id: string; full_name: string; relation: string; is_relative: boolean; signed_at: Date | null; link_expires_at: Date | null }>(
          `INSERT INTO donation.organ_witness (pledge_id, full_name, relation, is_relative, person_id, link_token_hash, link_expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days')
           RETURNING id, full_name, relation, is_relative, signed_at, link_expires_at`,
          [p.id, body.fullName, body.relation, body.isRelative, body.personId ?? null, hash],
        )
      )[0]!
      const overview = await this.overviewIn(tx, c)
      return {
        overview,
        invite: {
          witness: {
            id: w.id,
            fullName: w.full_name,
            relation: w.relation,
            isRelative: w.is_relative,
            status: 'pending' as const,
            signedAt: null,
            linkExpiresAt: iso(w.link_expires_at),
          },
          signingLink: `/witness/sign?t=${token}`,
          simulated: true as const,
        },
      }
    })
  }

  /** Demo only: stands in for the witness opening their link and signing at the hospital desk. */
  async signWitness(c: CitizenCtx, witnessId: string): Promise<CitizenOrganOverviewResponse> {
    const now = demoNow()
    return this.requestDb.run(c.user, async (tx) => {
      const w = (
        await tx.query<{ id: string; signed_at: Date | null; link_expires_at: Date | null }>(
          `SELECT w.id, w.signed_at, w.link_expires_at FROM donation.organ_witness w
             JOIN donation.organ_pledge p ON p.id = w.pledge_id
            WHERE w.id = $1 AND p.person_id = $2 AND p.withdrawn_at IS NULL`,
          [witnessId, c.personId],
        )
      )[0]
      if (!w) throw new NotFoundException('Witness not found')
      if (w.signed_at) throw new ConflictException('This witness has already signed')
      if (w.link_expires_at && w.link_expires_at < now) throw new BadRequestException('The signing link has expired. Send a reminder to get a new one.')
      await tx.query('UPDATE donation.organ_witness SET signed_at = $2 WHERE id = $1', [witnessId, now])
      return this.overviewIn(tx, c)
    })
  }

  async remindWitnesses(c: CitizenCtx): Promise<{ reminded: number; overview: CitizenOrganOverviewResponse }> {
    return this.requestDb.run(c.user, async (tx) => {
      const p = await this.requirePledge(tx, c)
      const rows = await tx.query<{ id: string }>(
        `UPDATE donation.organ_witness SET link_expires_at = now() + interval '7 days'
          WHERE pledge_id = $1 AND signed_at IS NULL RETURNING id`,
        [p.id],
      )
      return { reminded: rows.length, overview: await this.overviewIn(tx, c) }
    })
  }

  async chooseSigningDesk(c: CitizenCtx, hospitalId: string): Promise<CitizenOrganOverviewResponse> {
    return this.requestDb.run(c.user, async (tx) => {
      const p = await this.requirePledge(tx, c)
      if (p.status === 'registered') throw new ConflictException('This pledge is already registered')
      if (p.status === 'intent') throw new BadRequestException('Tell your family first (step 2), then choose where to sign')
      const ok = await tx.query(
        `SELECT 1 FROM donation.transplant_centre t WHERE t.hospital_id = $1 AND t.is_active`,
        [hospitalId],
      )
      if (ok.length === 0) throw new BadRequestException('This hospital does not run an organ donation desk')
      await tx.query(`UPDATE donation.organ_pledge SET hospital_id = $2, status = 'signing' WHERE id = $1`, [p.id, hospitalId])
      return this.overviewIn(tx, c)
    })
  }

  // ------------------------------------------------------------------ withdraw
  async withdraw(c: CitizenCtx): Promise<CitizenOrganOverviewResponse> {
    return this.requestDb.run(c.user, async (tx) => {
      const p = await this.requirePledge(tx, c)
      await tx.query(`UPDATE donation.organ_pledge SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [p.id])
      await this.setProfileStatus(tx, c, 'withdrawn')
      return this.overviewIn(tx, c)
    })
  }
}

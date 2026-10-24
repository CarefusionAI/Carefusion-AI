import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { GovAiGovernance, GovSystem } from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import type { AuthenticatedUser } from '../auth/types'
import { GovScopeService } from './gov-scope.service'
import type { GovScope } from './gov-scope.service'
import { iso, num, numOr0, round1 } from './gov-util'

/** Flag changes that affect every user and therefore need a second central admin (CF142). */
const HIGH_IMPACT = (code: string, enabled: boolean): boolean =>
  (code === 'maint' && enabled) || (code === 'bg' && !enabled) || (code === 'ai' && !enabled)

const CONFIRM_TEXT: Record<string, { on: string; off: string }> = {
  maint: {
    on: 'Every citizen and staff app will show a maintenance notice. Only emergency access and break-glass keep working. A notice is sent to all apps now.',
    off: 'The maintenance notice is removed from every app.',
  },
  ai: {
    on: 'AI Health Chat, image analysis and doctor assist come back everywhere.',
    off: 'AI Health Chat, image analysis and doctor assist will be hidden everywhere until you turn them back on.',
  },
  bg: {
    on: 'Doctors can open records in an emergency without a citizen key again.',
    off: 'Doctors will not be able to open records in an emergency without a citizen key. Use only for a confirmed security incident.',
  },
}
const DEFAULT_CONFIRM = 'This change applies to the whole country immediately and is written to the audit log.'

const PENDING_PREFIX = 'pending_flag.'

@Injectable()
export class PlatformService {
  private readonly demoMode: boolean

  constructor(
    config: ConfigService,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly scopes: GovScopeService,
  ) {
    this.demoMode = config.get<string>('DEMO_MODE', 'false') === 'true'
  }

  // ------------------------------------------------------------ system settings (central)

  async system(scope: GovScope): Promise<GovSystem> {
    const [flags, history, rules, pending, migrations, chain, ping] = await Promise.all([
      this.db.query<any>(
        `SELECT f.code::text AS code, f.label, f.description, f.enabled, f.updated_at, p.full_name AS updated_by
           FROM admin.platform_flag f LEFT JOIN identity.app_user u ON u.id = f.updated_by LEFT JOIN identity.person p ON p.id = u.person_id
          ORDER BY f.code`,
      ),
      this.db.query<any>(
        `SELECT h.id, h.flag_code::text AS code, f.label, h.enabled, h.at, h.note, p.full_name AS by_name, sp.full_name AS second_name
           FROM admin.platform_flag_history h JOIN admin.platform_flag f ON f.code = h.flag_code
           LEFT JOIN identity.app_user u ON u.id = h.changed_by_user_id LEFT JOIN identity.person p ON p.id = u.person_id
           LEFT JOIN identity.app_user su ON su.id = h.second_confirm_by LEFT JOIN identity.person sp ON sp.id = su.person_id
          ORDER BY h.at DESC LIMIT 6`,
      ),
      this.db.query<any>(`SELECT code::text AS code, value, description FROM admin.access_rule WHERE code NOT LIKE '${PENDING_PREFIX}%' ORDER BY code`),
      this.db.query<any>(`SELECT code::text AS code, value, updated_at FROM admin.access_rule WHERE code LIKE '${PENDING_PREFIX}%'`),
      this.db.query<any>(`SELECT count(*)::int AS n, max(applied_at) AS last FROM public.schema_migrations WHERE kind = 'migration'`).catch(() => [{ n: null, last: null }]),
      this.db.query<any>(`SELECT count(*)::int AS streams FROM audit.chain_head`).catch(() => [{ streams: null }]),
      this.db.query<any>('SELECT now() AS now'),
    ])
    const maint = flags.find((f) => f.code === 'maint')?.enabled === true
    return {
      flags: flags.map((f) => ({
        code: f.code,
        label: f.label,
        description: f.description,
        enabled: f.enabled,
        updatedAt: iso(f.updated_at)!,
        updatedBy: f.updated_by,
        needsSecondSignerToChange: { toOn: HIGH_IMPACT(f.code, true), toOff: HIGH_IMPACT(f.code, false) },
        confirmTextOn: CONFIRM_TEXT[f.code]?.on ?? DEFAULT_CONFIRM,
        confirmTextOff: CONFIRM_TEXT[f.code]?.off ?? DEFAULT_CONFIRM,
        pendingChange: (() => {
          const p = pending.find((x) => x.code === `${PENDING_PREFIX}${f.code}`)
          return p ? { enabled: !!p.value?.enabled, reason: p.value?.reason ?? null, requestedBy: p.value?.requestedByName ?? null, requestedAt: iso(p.updated_at)! } : null
        })(),
      })),
      history: history.map((h) => ({
        id: h.id, flag: h.code, label: h.label, enabled: h.enabled, by: h.by_name, secondSigner: h.second_name, note: h.note, at: iso(h.at)!,
      })),
      accessRules: rules.map((r) => ({ code: r.code, value: r.value, description: r.description })),
      health: {
        checkedAt: iso(ping[0].now)!,
        allNormal: !maint,
        checks: [
          { name: 'Database', ok: true },
          { name: 'Maintenance mode', ok: !maint, detail: maint ? 'On' : 'Off' },
          { name: 'Applied migrations', ok: (migrations[0]?.n ?? 0) > 0, detail: migrations[0]?.n === null ? 'ledger not readable' : String(migrations[0]?.n) },
          { name: 'Audit log streams', ok: (chain[0]?.streams ?? 0) >= 0, detail: chain[0]?.streams === null ? 'not readable' : String(chain[0]?.streams) },
        ],
      },
      footnote: 'Emergency access never turns off with maintenance. Break-glass stays available unless switched off on its own.',
      twoPersonRule: 'Maintenance on, AI off and break-glass off each need a second central admin to confirm. Pending requests expire after 72 hours.',
    }
  }

  /**
   * Changes a platform flag. High-impact changes are two steps: the first admin requests (stored as a
   * pending row in admin.access_rule), a different central admin confirms. In demo mode `asPeer` lets
   * a peer admin stand in for the second confirmation (recorded as simulated in the audit log).
   */
  async setFlag(
    scope: GovScope,
    actor: AuthenticatedUser,
    code: string,
    input: { enabled: boolean; reason: string; asPeer?: boolean },
  ): Promise<{ success: true; applied: boolean; pending?: boolean; simulatedSecondSigner?: boolean; flag: { code: string; enabled: boolean } }> {
    const rows = await this.db.query<any>('SELECT code::text AS code, enabled FROM admin.platform_flag WHERE code = $1::citext', [code])
    const flag = rows[0]
    if (!flag) throw new NotFoundException({ success: false, errorMessage: 'Unknown platform flag.' })
    if (flag.enabled === input.enabled) throw new ConflictException({ success: false, errorMessage: 'The flag already has that value.' })

    const key = `${PENDING_PREFIX}${code}`
    let secondSigner: string | null = null
    let simulated = false

    if (HIGH_IMPACT(code, input.enabled)) {
      const pend = (await this.db.query<any>('SELECT value, updated_at FROM admin.access_rule WHERE code = $1::citext', [key]))[0]
      const fresh = pend && Date.now() - new Date(pend.updated_at).getTime() < 72 * 3600 * 1000 && pend.value?.enabled === input.enabled
      if (!fresh) {
        const payload = { enabled: input.enabled, reason: input.reason, requestedBy: scope.userId, requestedByName: scope.personName }
        await this.db.query(
          `INSERT INTO admin.access_rule (code, value, description, updated_by) VALUES ($1::citext, $2::jsonb, 'Pending two-person platform flag change', $3::uuid)
           ON CONFLICT (code) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [key, JSON.stringify(payload), scope.userId],
        )
        await this.audit.logAction(actor, 'platform.flag_requested', { entityType: 'platform_flag', details: { code, enabled: input.enabled, reason: input.reason } })
        return { success: true, applied: false, pending: true, flag: { code, enabled: flag.enabled } }
      }
      if (pend.value.requestedBy === scope.userId) {
        if (!(input.asPeer && this.demoMode && actor.isDemo)) {
          throw new ConflictException({ success: false, errorMessage: 'A different central admin must confirm this change. You requested it.' })
        }
        const peer = (await this.scopes.peers(scope))[0]
        if (!peer) throw new ConflictException({ success: false, errorMessage: 'No other central admin exists to act as second signer.' })
        secondSigner = peer.userId
        simulated = true
      } else {
        secondSigner = scope.userId
      }
    }

    const client = await this.db.getClient()
    try {
      await client.query('BEGIN')
      // The history trigger reads the acting user from this setting.
      await client.query("SELECT set_config('app.user_id', $1, true)", [scope.userId])
      await client.query('UPDATE admin.platform_flag SET enabled = $2 WHERE code = $1::citext', [code, input.enabled])
      await client.query('DELETE FROM admin.access_rule WHERE code = $1::citext', [key]).catch(() => undefined)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw err
    } finally {
      client.release()
    }
    await this.audit.logAction(actor, 'platform.flag_changed', {
      entityType: 'platform_flag',
      details: { code, enabled: input.enabled, reason: input.reason, secondSigner, simulatedSecondSigner: simulated },
    })
    return { success: true, applied: true, ...(simulated ? { simulatedSecondSigner: true } : {}), flag: { code, enabled: input.enabled } }
  }

  // ------------------------------------------------------------ AI governance (central)

  async waitingReleaseRequests(): Promise<number> {
    const r = await this.db.query<{ n: number }>("SELECT count(*)::int AS n FROM ai.release_request WHERE status = 'waiting'")
    return r[0]?.n ?? 0
  }

  async ai(scope: GovScope): Promise<GovAiGovernance> {
    const limitRow = await this.db.query<any>("SELECT value FROM admin.access_rule WHERE code = 'ai_rollback_drift_pct'")
    const rollbackPct = num(limitRow[0]?.value) ?? 5

    const versions = await this.db.query<any>(
      `SELECT v.id, v.version, v.status, v.meta, v.drift_pct, v.agreement_pct, v.is_simulated, v.released_at, m.id AS model_id, m.name, m.module
         FROM ai.model_version v JOIN ai.model m ON m.id = v.model_id ORDER BY m.name, v.version`,
    )
    const toneOf = (status: string, drift: number | null) =>
      status === 'on_hold' || status === 'rolled_back' || (drift !== null && drift > rollbackPct) ? 'danger' : status === 'live' ? 'success' : status === 'shadow' ? 'info' : status === 'pending' ? 'warning' : 'neutral'
    const register = versions.map((v) => ({
      modelId: v.model_id as string,
      versionId: v.id as string,
      name: v.name as string,
      module: v.module as string,
      version: v.version as string,
      status: v.status as string,
      meta: v.meta as string | null,
      driftPct: num(v.drift_pct),
      agreementPct: num(v.agreement_pct),
      releasedAt: iso(v.released_at),
      simulated: !!v.is_simulated,
      tone: toneOf(v.status, num(v.drift_pct)),
    }))

    const reqs = await this.db.query<any>(
      `SELECT r.id, r.status, r.submitted_by, r.submitted_at, r.required_signoffs, r.shadow_run_days, r.metrics, r.checklist,
              m.name AS model, v.version AS to_version, fv.version AS from_version
         FROM ai.release_request r
         JOIN ai.model_version v ON v.id = r.model_version_id JOIN ai.model m ON m.id = v.model_id
         LEFT JOIN ai.model_version fv ON fv.id = r.from_version_id
        ORDER BY (r.status = 'waiting') DESC, r.submitted_at DESC`,
    )
    const signoffs = await this.db.query<any>(
      `SELECT s.request_id, s.approver_user_id, s.decision, s.reason, s.signed_at, p.full_name AS name
         FROM ai.release_signoff s JOIN identity.app_user u ON u.id = s.approver_user_id JOIN identity.person p ON p.id = u.person_id ORDER BY s.signed_at`,
    )
    const releaseRequests = reqs.map((r) => {
      const so = signoffs.filter((s) => s.request_id === r.id)
      const approvals = so.filter((s) => s.decision === 'approve').length
      return {
        id: r.id,
        model: r.model,
        fromVersion: r.from_version,
        toVersion: r.to_version,
        status: r.status,
        submittedBy: r.submitted_by,
        submittedAt: iso(r.submitted_at)!,
        requiredSignoffs: r.required_signoffs,
        approvals,
        holds: so.filter((s) => s.decision === 'hold').length,
        shadowRunDays: r.shadow_run_days,
        metrics: r.metrics,
        checklist: Array.isArray(r.checklist) ? r.checklist : [],
        signoffs: so.map((s) => ({ approver: s.name, decision: s.decision, reason: s.reason, at: iso(s.signed_at)! })),
        youSigned: (so.find((s) => s.approver_user_id === scope.userId)?.decision ?? null) as 'approve' | 'hold' | null,
        canRelease: r.status === 'approved' && approvals >= r.required_signoffs,
      }
    })

    // agreement series: weekly average per model, whole-country values only (region = NULL)
    const series = await this.db.query<any>(
      `SELECT m.name AS model, date_trunc('week', d.measured_at)::date::text AS week_start, round(avg(d.value), 1) AS value, sum(d.sample_size)::int AS samples
         FROM ai.drift_metric d JOIN ai.model_version v ON v.id = d.model_version_id JOIN ai.model m ON m.id = v.model_id
        WHERE d.metric = 'agreement_pct' AND d.region IS NULL AND d.measured_at >= now() - interval '12 weeks'
        GROUP BY 1, 2 ORDER BY 1, 2`,
    )
    const byModel = new Map<string, { week: string; value: number; samples: number | null }[]>()
    for (const s of series) byModel.set(s.model, [...(byModel.get(s.model) ?? []), { week: s.week_start, value: numOr0(s.value), samples: s.samples }])

    // regional drop: compare first and last agreement reading of a region within the last 4 weeks
    const regional = await this.db.query<any>(
      `SELECT m.name AS model, d.region, v.version,
              (array_agg(d.value ORDER BY d.measured_at ASC))[1] AS first_value, (array_agg(d.value ORDER BY d.measured_at DESC))[1] AS last_value,
              min(d.measured_at) AS first_at, max(d.measured_at) AS last_at, count(*)::int AS n
         FROM ai.drift_metric d JOIN ai.model_version v ON v.id = d.model_version_id JOIN ai.model m ON m.id = v.model_id
        WHERE d.metric = 'agreement_pct' AND d.region IS NOT NULL AND d.measured_at >= now() - interval '8 weeks'
        GROUP BY m.name, d.region, v.version HAVING count(*) >= 2`,
    )
    const drops = regional
      .map((r) => ({ ...r, drop: numOr0(r.first_value) - numOr0(r.last_value) }))
      .filter((r) => r.drop >= 2)
      .sort((a, b) => b.drop - a.drop)
    const worst = drops[0]

    const safety = await this.db.query<any>(
      `SELECT s.id, s.kind, s.severity, s.title, s.detail, s.status, s.created_at, s.closed_at, m.name AS model, v.version
         FROM ai.safety_report s LEFT JOIN ai.model_version v ON v.id = s.model_version_id LEFT JOIN ai.model m ON m.id = v.model_id
        WHERE s.created_at >= now() - interval '30 days' ORDER BY (s.status <> 'closed') DESC, s.created_at DESC`,
    )

    const live = register.filter((r) => r.status === 'live')
    const agreement = live.map((r) => r.agreementPct).filter((x): x is number => x !== null)
    const driftAlerts = register.filter((r) => (r.driftPct !== null && r.driftPct > rollbackPct) || r.status === 'on_hold' || r.status === 'rolled_back')

    return {
      simulated: true,
      badge: 'Alpha · simulated outputs',
      notice: 'Every model shown here is a simulated alpha model. No accuracy figure of the research paper is claimed for it.',
      kpis: {
        modelsInUse: new Set(register.filter((r) => r.status !== 'pending').map((r) => r.modelId)).size,
        modules: new Set(register.map((r) => r.module)).size,
        waitingForApproval: releaseRequests.filter((r) => r.status === 'waiting').length,
        clinicianAgreementPct: agreement.length ? round1(agreement.reduce((a, b) => a + b, 0) / agreement.length) : null,
        driftAlerts: driftAlerts.length,
        driftAlertHint: driftAlerts[0] ? `${driftAlerts[0].name}${worst && worst.model === driftAlerts[0].name ? ` · ${worst.region}` : ''}` : null,
      },
      register,
      releaseRequests,
      rollbackRule: { driftPct: rollbackPct, text: `A live model whose drift passes ${rollbackPct}% is rolled back automatically.` },
      agreementSeries: [...byModel.entries()].map(([model, points]) => ({ model, points })),
      minimumAgreementPct: 85,
      driftMonitor: worst
        ? {
            status: 'UNCERTAIN',
            simulated: true,
            title: `${worst.model} agreement fell in ${worst.region}`,
            body: `Agreement with clinicians dropped from ${round1(numOr0(worst.first_value))}% to ${round1(numOr0(worst.last_value))}% over ${Math.max(1, Math.round((new Date(worst.last_at).getTime() - new Date(worst.first_at).getTime()) / (7 * 86400000)))} weeks (${worst.n} readings).`,
            evidence: [`Agreement ${round1(numOr0(worst.first_value))}% to ${round1(numOr0(worst.last_value))}%`, `Region: ${worst.region}`, `Model version ${worst.version}`],
            needsHumanReview: true,
          }
        : null,
      safetyReports: safety.map((s) => ({
        id: s.id, kind: s.kind, severity: s.severity, title: s.title, detail: s.detail, status: s.status,
        model: s.model ? `${s.model} ${s.version}` : null, at: iso(s.created_at)!, closedAt: iso(s.closed_at),
      })),
    }
  }

  async signoff(
    scope: GovScope,
    actor: AuthenticatedUser,
    requestId: string,
    input: { decision: 'approve' | 'hold'; reason?: string; asPeer?: boolean },
  ): Promise<{ success: true; status: string; approvals: number; required: number; simulatedSecondSigner?: boolean }> {
    const rows = await this.db.query<any>('SELECT id, status, required_signoffs FROM ai.release_request WHERE id = $1::uuid', [requestId])
    const req = rows[0]
    if (!req) throw new NotFoundException({ success: false, errorMessage: 'Release request not found.' })
    if (!['waiting', 'approved'].includes(req.status)) throw new ConflictException({ success: false, errorMessage: `This request is already ${req.status.replace('_', ' ')}.` })
    if (input.decision === 'hold' && !input.reason?.trim()) throw new BadRequestException({ success: false, errorMessage: 'A reason is required to put a release on hold.' })

    let approver = scope.userId
    let simulated = false
    const mine = await this.db.query('SELECT 1 FROM ai.release_signoff WHERE request_id = $1::uuid AND approver_user_id = $2::uuid', [requestId, approver])
    if (mine.length) {
      if (!(input.asPeer && this.demoMode && actor.isDemo)) {
        throw new ConflictException({ success: false, errorMessage: 'You have already signed this request. A different approver is needed.' })
      }
      const signed = new Set((await this.db.query<{ a: string }>('SELECT approver_user_id AS a FROM ai.release_signoff WHERE request_id = $1::uuid', [requestId])).map((x) => x.a))
      const peer = (await this.scopes.peers(scope)).find((p) => !signed.has(p.userId))
      if (!peer) throw new ConflictException({ success: false, errorMessage: 'No other central admin is left to sign.' })
      approver = peer.userId
      simulated = true
    }
    await this.db.query('INSERT INTO ai.release_signoff (request_id, approver_user_id, decision, reason) VALUES ($1::uuid, $2::uuid, $3, $4)', [
      requestId, approver, input.decision, input.reason ?? null,
    ])
    const approvals = numOr0((await this.db.query<any>("SELECT count(*)::int AS n FROM ai.release_signoff WHERE request_id = $1::uuid AND decision = 'approve'", [requestId]))[0]?.n)
    let status = req.status as string
    if (input.decision === 'hold') status = 'on_hold'
    else if (approvals >= req.required_signoffs) status = 'approved'
    if (status !== req.status) await this.db.query('UPDATE ai.release_request SET status = $2 WHERE id = $1::uuid', [requestId, status])
    await this.audit.logAction(actor, 'ai.release_signoff', {
      entityType: 'release_request',
      entityId: requestId,
      details: { decision: input.decision, approvals, required: req.required_signoffs, simulatedSecondSigner: simulated, simulatedAi: true },
    })
    return { success: true, status, approvals, required: req.required_signoffs, ...(simulated ? { simulatedSecondSigner: true } : {}) }
  }

  /** Makes an approved release live; the previous live version of the same model is retired. */
  async release(scope: GovScope, actor: AuthenticatedUser, requestId: string): Promise<{ success: true; version: string }> {
    const rows = await this.db.query<any>(
      `SELECT r.id, r.status, r.model_version_id, v.model_id, v.version FROM ai.release_request r JOIN ai.model_version v ON v.id = r.model_version_id WHERE r.id = $1::uuid`,
      [requestId],
    )
    const r = rows[0]
    if (!r) throw new NotFoundException({ success: false, errorMessage: 'Release request not found.' })
    if (r.status !== 'approved') throw new ConflictException({ success: false, errorMessage: 'Only an approved release request can go live.' })
    const client = await this.db.getClient()
    try {
      await client.query('BEGIN')
      await client.query("UPDATE ai.release_request SET status = 'released' WHERE id = $1::uuid", [requestId]) // trigger CF141 re-checks the sign-offs
      await client.query("UPDATE ai.model_version SET status = 'retired' WHERE model_id = $1::uuid AND status = 'live' AND id <> $2::uuid", [r.model_id, r.model_version_id])
      await client.query("UPDATE ai.model_version SET status = 'live', released_at = now() WHERE id = $1::uuid", [r.model_version_id])
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw err
    } finally {
      client.release()
    }
    await this.audit.logAction(actor, 'ai.release', { entityType: 'release_request', entityId: requestId, details: { version: r.version, simulatedAi: true } })
    return { success: true, version: r.version }
  }

  async updateSafetyReport(scope: GovScope, actor: AuthenticatedUser, id: string, status: 'reviewing' | 'closed'): Promise<{ success: true; status: string }> {
    const rows = await this.db.query<any>(
      "UPDATE ai.safety_report SET status = $2, closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE NULL END WHERE id = $1::uuid RETURNING id",
      [id, status],
    )
    if (!rows.length) throw new NotFoundException({ success: false, errorMessage: 'Safety report not found.' })
    await this.audit.logAction(actor, 'ai.safety_report_update', { entityType: 'safety_report', entityId: id, details: { status } })
    return { success: true, status }
  }
}

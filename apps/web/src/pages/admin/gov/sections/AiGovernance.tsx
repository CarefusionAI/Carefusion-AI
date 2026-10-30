import { useState } from 'react'
import type { GovAiGovernance } from '@carefusion/shared'
import { isDemoSession, useGovAi, useRelease, useSafetyStatus, useSignoff } from '../../../../api/gov'
import { AIInsight, Alert, Badge, Button, Card, Checkbox, EmptyState, PageHeader, Skeleton, StatCard, Table } from '../../../../components/ui'
import { ActionModal, KV, QueryState, useGovToast } from '../common'
import { C, LineChart } from '../charts'
import type { SectionProps } from '../types'
import { govErrorText } from '../../../../api/gov'
import { fmtDate, fmtDateTime, fmtNum1, humanise, statusTone } from '../util'

type Release = GovAiGovernance['releaseRequests'][number]
type Model = GovAiGovernance['register'][number]

function Body({ g, ctx }: { g: GovAiGovernance } & SectionProps) {
  const signoff = useSignoff()
  const release = useRelease()
  const safety = useSafetyStatus()
  const toast = useGovToast()
  const [open, setOpen] = useState<{ r: Release; decision: 'approve' | 'hold' } | null>(null)
  const [asPeer, setAsPeer] = useState(false)
  const [releaseFor, setReleaseFor] = useState<Release | null>(null)
  const close = () => {
    setOpen(null)
    setAsPeer(false)
  }
  const weeks = g.agreementSeries[0]?.points.map((p) => p.week.slice(5)) ?? []

  return (
    <div className="gv-stack">
      <PageHeader
        eyebrow="National · AI model governance"
        title="AI models in CareFusion"
        subtitle="Every AI output in the alpha is simulated. Decision support only, never a diagnosis."
        actions={<Badge tone="ai">{g.badge}</Badge>}
      />
      <Alert tone="ai" title="Simulated AI output">
        {g.notice}
      </Alert>
      <div className="gv-grid-4">
        <StatCard label="Models in use" value={String(g.kpis.modelsInUse)} hint={`Across ${g.kpis.modules} modules`} tone="lavender" />
        <StatCard label="Waiting for approval" value={String(g.kpis.waitingForApproval)} hint="Needs 2 approvers" tone="peach" />
        <StatCard label="Clinician agreement" value={g.kpis.clinicianAgreementPct === null ? '–' : `${fmtNum1(g.kpis.clinicianAgreementPct)}%`} hint="Share of simulated suggestions clinicians kept" tone="sage" />
        <StatCard label="Drift alerts" value={String(g.kpis.driftAlerts)} hint={g.kpis.driftAlertHint ?? 'None'} tone="blue" />
      </div>

      <Card title="Model register" titleAs="h2">
        <Table<Model>
          caption="Registered AI models"
          rows={g.register}
          rowKey="versionId"
          empty="No models registered."
          columns={[
            { key: 'name', header: 'Model', render: (m) => <span>{m.name}<span className="gv-muted"> · {m.module}</span></span> },
            { key: 'version', header: 'Version', mono: true },
            { key: 'meta', header: 'Notes', render: (m) => m.meta ?? '–' },
            { key: 'drift', header: 'Drift', align: 'right', render: (m) => (m.driftPct === null ? '–' : `${fmtNum1(m.driftPct)}%`) },
            { key: 'agree', header: 'Agreement', align: 'right', render: (m) => (m.agreementPct === null ? '–' : `${fmtNum1(m.agreementPct)}%`) },
            { key: 'status', header: 'Status', render: (m) => <Badge tone={statusTone(m.status)}>{humanise(m.status)}</Badge> },
            { key: 'sim', header: '', render: (m) => (m.simulated ? <span className="gv-phase-pill">Simulated</span> : null) },
          ]}
        />
      </Card>

      <div className="gv-split">
        <div className="gv-stack">
          <Card title="Release requests" titleAs="h2">
            {g.releaseRequests.length ? (
              <ul className="gv-list" aria-label="Model release requests">
                {g.releaseRequests.map((r) => (
                  <li key={r.id} className="gv-li">
                    <div className="gv-li-head">
                      <p className="gv-li-title">
                        {r.model} · {r.fromVersion ?? 'new'} → {r.toVersion}
                      </p>
                      <Badge tone={statusTone(r.status)}>
                        {humanise(r.status)} · {r.approvals} of {r.requiredSignoffs}
                      </Badge>
                    </div>
                    <p className="gv-li-sub">
                      Submitted by {r.submittedBy} · {fmtDate(r.submittedAt)} · shadow run {r.shadowRunDays} days
                    </p>
                    {Object.keys(r.metrics).length ? (
                      <KV rows={Object.entries(r.metrics).map(([k, v]) => [humanise(k.replace(/([A-Z])/g, ' $1').toLowerCase()), String(v)] as [string, string])} />
                    ) : null}
                    {r.signoffs.length ? (
                      <ul className="gv-muted" style={{ margin: 0, paddingLeft: 18 }}>
                        {r.signoffs.map((s, i) => (
                          <li key={i}>
                            {s.approver}: {s.decision === 'approve' ? 'approved' : 'on hold'}
                            {s.reason ? ` (${s.reason})` : ''} · {fmtDateTime(s.at)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="gv-row" style={{ gap: 6 }}>
                      {r.youSigned ? (
                        <Badge tone={r.youSigned === 'approve' ? 'success' : 'neutral'}>You: {r.youSigned === 'approve' ? 'approved' : 'hold'}</Badge>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => setOpen({ r, decision: 'approve' })}>
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setOpen({ r, decision: 'hold' })}>
                            Hold
                          </Button>
                        </>
                      )}
                      {r.canRelease ? (
                        <Button size="sm" variant="danger" onClick={() => setReleaseFor(r)}>
                          Release to production
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No release requests" titleAs="h4">
                A model waiting for a go-live decision appears here.
              </EmptyState>
            )}
          </Card>
          <Card title="Clinician agreement · 12 weeks" titleAs="h3">
            {g.agreementSeries.length ? (
              <LineChart
                series={[
                  ...g.agreementSeries.slice(0, 3).map((s) => ({ name: s.model, points: s.points.map((p) => p.value) })),
                  { name: `Minimum ${g.minimumAgreementPct}%`, points: weeks.map(() => g.minimumAgreementPct), color: C.base, dash: '3 3', marker: 'square' as const },
                ]}
                xLabels={weeks}
                label={`Clinician agreement by week for each model against the minimum of ${g.minimumAgreementPct} percent`}
                height={190}
              />
            ) : (
              <EmptyState title="No agreement data yet" titleAs="h4" />
            )}
          </Card>
        </div>
        <div className="gv-stack">
          <Card title="Before any model goes live" titleAs="h3">
            <ul className="gv-checks">
              <li><span>Clinical validation on Indian data <Badge tone="outline">Required</Badge></span></li>
              <li><span>Safety board sign-off (2 of 3) <Badge tone="outline">Required</Badge></span></li>
              <li><span>Shadow run, 14 days, no patient impact <Badge tone="info">Required</Badge></span></li>
              <li><span>{g.rollbackRule.text} <Badge tone="success">Always on</Badge></span></li>
            </ul>
          </Card>
          {g.driftMonitor ? (
            <AIInsight title={g.driftMonitor.title} module="Drift monitor" status="uncertain" evidence={g.driftMonitor.evidence} footer={<Badge tone="outline">Needs human review</Badge>}>
              {g.driftMonitor.body}
            </AIInsight>
          ) : null}
        </div>
      </div>

      <Card title="Safety reports from clinicians" titleAs="h2" actions={<span className="gv-muted">last 30 days</span>}>
        {g.safetyReports.length ? (
          <ul className="gv-list" aria-label="Safety reports">
            {g.safetyReports.map((s) => (
              <li key={s.id} className="gv-li">
                <div className="gv-li-head">
                  <p className="gv-li-title">{s.title}</p>
                  <div className="gv-row" style={{ gap: 6 }}>
                    <Badge tone={s.severity === 'high' ? 'danger' : s.severity === 'medium' ? 'warning' : 'info'}>{humanise(s.severity)}</Badge>
                    <Badge tone={statusTone(s.status)} dot>{humanise(s.status)}</Badge>
                  </div>
                </div>
                <p className="gv-li-sub">
                  {[humanise(s.kind), s.model, fmtDateTime(s.at), s.detail].filter(Boolean).join(' · ')}
                </p>
                {s.status !== 'closed' ? (
                  <div className="gv-row" style={{ gap: 6 }}>
                    {s.status !== 'reviewing' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          safety.mutate({ id: s.id, status: 'reviewing' }, { onSuccess: () => toast('Marked as under review.'), onError: (e) => toast(govErrorText(e), { error: true }) })
                        }
                      >
                        Start review
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => safety.mutate({ id: s.id, status: 'closed' }, { onSuccess: () => toast('Report closed.'), onError: (e) => toast(govErrorText(e), { error: true }) })}
                    >
                      Close
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No safety reports" titleAs="h4" />
        )}
      </Card>

      <ActionModal
        open={open !== null}
        title={open ? `${open.decision === 'approve' ? 'Approve' : 'Hold'} ${open.r.model} ${open.r.toVersion}?` : ''}
        confirmLabel={open?.decision === 'approve' ? 'Approve' : 'Put on hold'}
        tone={open?.decision === 'hold' ? 'primary' : 'primary'}
        reasonLabel={open?.decision === 'hold' ? 'Why hold it?' : 'Note'}
        reasonRequired={open?.decision === 'hold'}
        onClose={close}
        onConfirm={async (reason) => {
          await signoff.mutateAsync({ id: open!.r.id, decision: open!.decision, reason, asPeer })
          setAsPeer(false)
          return open!.decision === 'approve' ? `Approved ${open!.r.approvals + 1} of ${open!.r.requiredSignoffs}.` : 'Release put on hold. The submitter is notified.'
        }}
        extra={
          isDemoSession() && open?.decision === 'approve' && open.r.youSigned === null && open.r.approvals > 0 ? (
            <Checkbox checked={asPeer} onChange={setAsPeer} label="Demo only: a peer admin signs as an additional approver" />
          ) : undefined
        }
      >
        <p className="gv-body">
          Release needs {open?.r.requiredSignoffs} approvals. {ctx.person.name}, your decision is recorded in the audit log. This model is a simulated AI output in the alpha.
        </p>
      </ActionModal>
      <ActionModal
        open={releaseFor !== null}
        title="Release this model version?"
        confirmLabel="Release to production"
        tone="danger"
        noReason
        onClose={() => setReleaseFor(null)}
        onConfirm={async () => {
          await release.mutateAsync(releaseFor!.id)
          return `${releaseFor!.model} ${releaseFor!.toVersion} released.`
        }}
      >
        <p className="gv-body">
          {releaseFor?.model} {releaseFor?.toVersion} replaces {releaseFor?.fromVersion ?? 'the current version'} for everyone. It rolls back automatically if drift passes {g.rollbackRule.driftPct}%.
        </p>
      </ActionModal>
    </div>
  )
}

export default function AiGovernance(props: SectionProps) {
  const q = useGovAi(props.ctx.level === 'central')
  return (
    <QueryState q={q} skeleton={<Skeleton height={320} radius={16} />}>
      {(g) => <Body {...props} g={g} />}
    </QueryState>
  )
}

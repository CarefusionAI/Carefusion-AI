import { useState } from 'react'
import type { GovApprovalItem } from '@carefusion/shared'
import {
  isDemoSession,
  useApprove,
  useEscalateApproval,
  useGovApprovals,
  useGovDirectory,
  useGovInbox,
  useMoreInfo,
  useReject,
} from '../../../../api/gov'
import { Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, Glyph, PageHeader, Skeleton, StatCard, Table } from '../../../../components/ui'
import { ActionModal, QueryState, Segmented } from '../common'
import { BarChart, C, FunnelBars } from '../charts'
import type { SectionProps } from '../types'
import { ageText, fmtDate, fmtNum, humanise, LEVEL_NAME, statusTone } from '../util'

type Kind = 'approve' | 'reject' | 'info' | 'escalate'

interface Labels {
  approve: string
  reject: string
  info: string
}

const DEFAULT_LABELS: Labels = { approve: 'Approve', reject: 'Reject', info: 'Ask for documents' }

function useDialogs(ctx: SectionProps['ctx']) {
  const [open, setOpen] = useState<{ item: GovApprovalItem; kind: Kind } | null>(null)
  const [asPeer, setAsPeer] = useState(false)
  const approve = useApprove()
  const reject = useReject()
  const more = useMoreInfo()
  const esc = useEscalateApproval()
  const close = () => {
    setOpen(null)
    setAsPeer(false)
  }
  const item = open?.item
  const kind = open?.kind
  const tp = item?.twoPerson
  const peerOffer = !!tp && tp.state === 'waiting_second_signature' && tp.firstSigner === ctx.person.name && isDemoSession()

  const dialogs = (
    <>
      <ActionModal
        open={kind === 'approve'}
        title={`Approve ${item?.name ?? ''}`}
        confirmLabel="Approve"
        reasonLabel="Note"
        onClose={close}
        onConfirm={async (reason) => {
          const r = await approve.mutateAsync({ id: item!.id, reason, asPeer })
          if (r.twoPerson?.state === 'waiting_second_signature') return `First signature recorded for ${item!.name}. A second admin must also approve.`
          return `Approved: ${item!.name} · notified by SMS and email${r.accountActivated ? ' · account activated' : ''}`
        }}
        extra={
          peerOffer ? (
            <Checkbox
              checked={asPeer}
              onChange={setAsPeer}
              label="Demo only: a peer admin of my level signs as the second approver"
              description="In a real deployment a different person must give the second signature."
            />
          ) : undefined
        }
      >
        <p className="gv-body">
          {item?.role}
          {item?.org ? ` · ${item.org}` : ''}
        </p>
        {tp?.required ? (
          <Alert tone="info" title="Two-person approval">
            {tp.state === 'waiting_second_signature'
              ? `${tp.firstSigner ?? 'An admin'} already signed. This signature completes the approval.`
              : 'This request needs two different admins. Your signature is the first.'}
          </Alert>
        ) : null}
        {item?.checks.some((c) => !c.ok) ? (
          <Alert tone="warning" title="Some checks did not pass">
            {item.checks.filter((c) => !c.ok).map((c) => c.text).join(' · ')}
          </Alert>
        ) : null}
      </ActionModal>
      <ActionModal
        open={kind === 'reject'}
        title={`Reject ${item?.name ?? ''}`}
        confirmLabel="Reject request"
        tone="danger"
        reasonRequired
        reasonLabel="Reason (sent to the applicant)"
        onClose={close}
        onConfirm={async (reason) => {
          await reject.mutateAsync({ id: item!.id, reason })
          return `Rejected: ${item!.name} · applicant notified`
        }}
      >
        <p className="gv-body">The applicant will be told why. This cannot be undone from this screen.</p>
      </ActionModal>
      <ActionModal
        open={kind === 'info'}
        title={`Ask ${item?.name ?? 'the applicant'} for more information`}
        confirmLabel="Send request"
        reasonRequired
        reasonLabel="What is missing"
        onClose={close}
        onConfirm={async (note) => {
          await more.mutateAsync({ id: item!.id, note })
          return `Asked ${item!.name} for more information`
        }}
      />
      <ActionModal
        open={kind === 'escalate'}
        title={`Escalate to ${ctx.escalateTo}`}
        confirmLabel="Escalate"
        reasonLabel="Why are you escalating?"
        onClose={close}
        onConfirm={async (reason) => {
          const r = await esc.mutateAsync({ id: item!.id, reason })
          return `Escalated to ${humanise(r.escalatedToLevel)} level`
        }}
      >
        <p className="gv-body">
          The request moves to {ctx.escalateTo} with a fresh time limit. You will no longer see it in your inbox.
        </p>
      </ActionModal>
    </>
  )
  return { start: (item: GovApprovalItem, kind: Kind) => setOpen({ item, kind }), dialogs }
}

function ChecksChips({ item }: { item: GovApprovalItem }) {
  if (!item.checks.length) return null
  return (
    <ul className="gv-chips" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Checks">
      {item.checks.map((c, i) => (
        <li key={i} className={`gv-chip${c.ok ? '' : ' is-bad'}`}>
          {c.ok ? <Glyph name="check" size={12} /> : <Glyph name="warning" size={12} />}
          {c.text}
          <span className="cf-sr">{c.ok ? ' (passed)' : ' (did not pass)'}</span>
        </li>
      ))}
    </ul>
  )
}

function RequestCard({
  item,
  ctx,
  start,
  labels = DEFAULT_LABELS,
}: {
  item: GovApprovalItem
  ctx: SectionProps['ctx']
  start: (i: GovApprovalItem, k: Kind) => void
  labels?: Labels
}) {
  const waiting = item.decision === 'waiting'
  return (
    <article className={`gv-req${item.flagged ? ' is-flag' : ''}${waiting ? '' : ' is-done'}`} aria-label={`${item.name}, ${item.role ?? ''}`}>
      <Avatar name={item.name} size={40} />
      <div className="gv-req-main">
        <div className="gv-li-head">
          <p className="gv-li-title">{item.name}</p>
          <div className="gv-row" style={{ gap: 6 }}>
            {item.priority === 'urgent' ? <Badge tone="danger">Urgent</Badge> : null}
            {item.overdue && waiting ? <Badge tone="warning">Overdue</Badge> : null}
            {item.moreInfo ? <Badge tone="info">Waiting for applicant</Badge> : null}
            <Badge tone={statusTone(item.decision)} dot>
              {item.decision === 'waiting' ? 'Waiting' : humanise(item.decision)}
            </Badge>
          </div>
        </div>
        <p className="gv-li-sub">
          {item.role}
          {item.org ? ` · ${item.org}` : ''}
        </p>
        <p className="gv-li-sub">
          {[item.ref, item.summary && item.summary !== item.org ? item.summary : null, `submitted ${item.decision === 'waiting' ? ageText(item.ageDays).toLowerCase() : fmtDate(item.submittedAt)}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <ChecksChips item={item} />
        {item.twoPerson.required && waiting ? (
          <p className="gv-muted">
            <Glyph name="shield" size={14} />{' '}
            {item.twoPerson.state === 'waiting_second_signature'
              ? `Two-person approval: ${item.twoPerson.firstSigner ?? 'one admin'} signed, waiting for a second admin.`
              : 'Two-person approval: needs two different admins.'}
          </p>
        ) : null}
        {item.moreInfo?.note ? <p className="gv-muted">Asked for: {item.moreInfo.note}</p> : null}
        {!waiting && item.reason ? <p className="gv-muted">Reason: {item.reason}</p> : null}
        {!waiting && item.decidedBy ? <p className="gv-muted">Decided by {item.decidedBy}{item.decidedAt ? ` on ${fmtDate(item.decidedAt)}` : ''}</p> : null}
      </div>
      {waiting ? (
        <div className="gv-req-actions">
          <Button size="sm" onClick={() => start(item, 'approve')}>
            {labels.approve}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => start(item, 'reject')}>
            {labels.reject}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => start(item, 'info')}>
            {labels.info}
          </Button>
          {item.canEscalate ? (
            <Button size="sm" variant="ghost" onClick={() => start(item, 'escalate')}>
              Escalate
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

const CHECKLIST = [
  'The registry ID (HFR for facilities, HPR for doctors) matches the applicant',
  'The licence or Government order is valid and not expiring in 30 days',
  'The applicant is verified by Aadhaar e-KYC (mock connector in the alpha) and has two-step sign-in',
  'No open audit flags against the applicant or facility',
]

export function ApprovalsSection({ ctx }: SectionProps) {
  const [filter, setFilter] = useState<'all' | 'waiting' | 'decided'>('all')
  const q = useGovApprovals(filter)
  const dir = useGovDirectory({ kind: 'facilities', status: 'all', limit: 1 })
  const { start, dialogs } = useDialogs(ctx)

  return (
    <div className="gv-stack">
      <PageHeader
        eyebrow="Facilities and admins"
        title="Approvals"
        subtitle={`Approve doctors, hospital admins and pharmacy admins for ${ctx.unit.name}. Government facilities need a Government order; private ones need a valid licence.`}
        actions={
          <Segmented
            label="Show requests"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'waiting', label: 'Waiting' },
              { value: 'decided', label: 'Decided' },
            ]}
          />
        }
      />
      <QueryState q={q} skeleton={<Skeleton height={300} radius={16} />}>
        {(a) => (
          <>
            <div className="gv-grid-4">
              <StatCard tone="peach" label="Waiting" value={fmtNum(a.stats.waiting)} hint={a.stats.oldestWaitingDays === null ? 'Nothing waiting' : `Oldest: ${a.stats.oldestWaitingDays} days`} />
              <StatCard tone="sage" label="Approved this month" value={fmtNum(a.stats.approvedThisMonth)} hint={`${a.stats.escalatedUp} escalated upward`} />
              <StatCard label="Rejected" value={fmtNum(a.stats.rejectedThisMonth)} hint={a.stats.mostCommonRejectionReason ? `Most common: ${a.stats.mostCommonRejectionReason}` : 'No rejections this month'} />
              <StatCard
                tone="blue"
                label="Average decision time"
                value={a.stats.avgDecisionDays === null ? '–' : String(a.stats.avgDecisionDays)}
                unit={a.stats.avgDecisionDays === null ? undefined : 'days'}
                trend={
                  a.stats.avgDecisionDaysVsLastMonth
                    ? { direction: a.stats.avgDecisionDaysVsLastMonth < 0 ? 'down' : 'up', text: `${Math.abs(a.stats.avgDecisionDaysVsLastMonth)} days ${a.stats.avgDecisionDaysVsLastMonth < 0 ? 'faster' : 'slower'} than last month` }
                    : undefined
                }
                hint={a.stats.decidedWithinSlaPct === null ? 'No decisions yet' : `${a.stats.decidedWithinSlaPct}% within the time limit`}
              />
            </div>
            <div className="gv-split">
              <Card title="Requests" titleAs="h2" actions={<span className="gv-muted">{a.items.length} shown</span>}>
                {a.items.length ? (
                  <div className="gv-reqs">
                    {a.items.map((it) => (
                      <RequestCard key={it.id} item={it} ctx={ctx} start={start} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No requests here" titleAs="h4">
                    {filter === 'waiting' ? 'Nothing is waiting for you.' : 'No requests match this filter.'}
                  </EmptyState>
                )}
              </Card>
              <div className="gv-stack">
                <Card tone="sage" title="What we check before you approve" titleAs="h3">
                  <ul className="gv-checks">
                    {CHECKLIST.map((c) => (
                      <li key={c}>
                        <Glyph name="check" size={16} />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card title="Facility directory" titleAs="h3">
                  {dir.data ? (
                    <Table
                      caption="Facilities by type"
                      density="compact"
                      rows={dir.data.facilityMix}
                      rowKey="type"
                      columns={[
                        { key: 'type', header: 'Type' },
                        { key: 'count', header: 'Count', align: 'right' as const, render: (r) => fmtNum(r.count) },
                        { key: 'pct', header: 'On platform', align: 'right' as const, render: (r) => `${r.onPlatformPct}%` },
                      ]}
                      empty="No facilities yet."
                    />
                  ) : (
                    <Skeleton lines={3} />
                  )}
                </Card>
                <p className="gv-muted">If you escalate a request it goes to {ctx.escalateTo}. You are the {LEVEL_NAME[ctx.level]} for {ctx.unit.name}.</p>
              </div>
            </div>
          </>
        )}
      </QueryState>
      {dialogs}
    </div>
  )
}

export function InboxSection({ ctx }: SectionProps) {
  const q = useGovInbox()
  const { start, dialogs } = useDialogs(ctx)
  return (
    <div className="gv-stack">
      <QueryState q={q} skeleton={<Skeleton height={300} radius={16} />}>
        {(inbox) => (
          <>
            <PageHeader eyebrow="Inbox" title="Approval inbox" subtitle={`${inbox.total} items need a decision.`} />
            <div className="gv-grid-3">
              <InboxColumn
                title="Doctor applications"
                items={inbox.doctorApplications}
                ctx={ctx}
                start={start}
                labels={{ approve: 'Approve', reject: 'Reject', info: 'Ask for documents' }}
              />
              <InboxColumn
                title="Admin applications"
                items={inbox.adminApplications}
                ctx={ctx}
                start={start}
                labels={{ approve: 'Approve', reject: 'Reject', info: 'Hold: ask for info' }}
              />
              <InboxColumn
                title="Flagged users"
                items={inbox.flaggedUsers}
                ctx={ctx}
                start={start}
                labels={{ approve: 'Clear', reject: 'Suspend', info: 'Ask for info' }}
              />
            </div>
            <div className="gv-split-even">
              <Card title="Approval funnel · 90 days" titleAs="h3">
                <FunnelBars rows={inbox.funnel90d} label="Approval funnel for the last 90 days" />
              </Card>
              <Card title="Days to decision" titleAs="h3" actions={<span className="gv-muted">median, last 6 months</span>}>
                <BarChart
                  items={inbox.daysToDecision.map((d, i) => ({ label: d.label, value: d.medianDays, highlight: i === inbox.daysToDecision.length - 1, hiddenText: 'none' }))}
                  label="Median days from submission to decision, last 6 months, against a 2 day target"
                  target={{ value: 2, label: 'Target 2 days' }}
                  yMax={5}
                  labelEvery={1}
                  showAllValues
                  height={170}
                  color={C.tealSoft}
                  highlightColor={C.teal}
                  valueName="Median days"
                  yFormat={(n) => n.toFixed(0)}
                />
                <p className="gv-muted" style={{ marginTop: 8 }}>
                  Months with no decisions show a hatched bar.
                </p>
              </Card>
            </div>
          </>
        )}
      </QueryState>
      {dialogs}
    </div>
  )
}

function InboxColumn({
  title,
  items,
  ctx,
  start,
  labels,
}: {
  title: string
  items: GovApprovalItem[]
  ctx: SectionProps['ctx']
  start: (i: GovApprovalItem, k: Kind) => void
  labels: Labels
}) {
  return (
    <Card title={title} titleAs="h2" actions={<Badge tone={items.length ? 'warning' : 'success'}>{items.length}</Badge>}>
      {items.length ? (
        <div className="gv-reqs">
          {items.map((it) => (
            <RequestCard key={it.id} item={it} ctx={ctx} start={start} labels={labels} />
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing to decide" titleAs="h4">
          New items appear here as they arrive.
        </EmptyState>
      )}
    </Card>
  )
}

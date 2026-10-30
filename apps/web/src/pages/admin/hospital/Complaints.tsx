import { useState } from 'react'
import { Alert, Badge, Button, PageHeader, Textarea } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useAssignComplaint, useHospitalComplaints, useHospitalComplaintTimeline, useResolveComplaint } from '../../../api/hospitalAdmin'
import type { HospitalComplaintsResponse } from '../../../api/hospitalAdmin'
import { Async, Bar, Box, Chips, ConfirmModal, EmptyBox, PageSkeleton, fmtDate, fmtDateTime, humanise, useFlash } from '../opsKit'
import { COMPLAINT_STATE, categoryTone } from './shared'

type Item = HospitalComplaintsResponse['items'][number]
type Filter = '' | 'open' | 'resolved' | 'escalated'

function Timeline({ id }: { id: string }) {
  const q = useHospitalComplaintTimeline(id)
  if (q.isPending) return <p className="ak-muted">Loading history...</p>
  if (q.isError) return <p className="ak-muted">{errorMessage(q.error)}</p>
  const events = Array.isArray(q.data) ? (q.data as { kind: string; text: string; at: string; actor: string }[]) : []
  if (events.length === 0) return <p className="ak-muted">No history yet.</p>
  return (
    <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      {events.map((e, i) => (
        <li key={i}>
          <strong>{humanise(e.kind)}</strong> {'·'} {e.text} <span className="ak-muted">{e.actor} {'·'} {fmtDateTime(e.at)}</span>
        </li>
      ))}
    </ol>
  )
}

function Card({ k, onAssign, onResolve }: { k: Item; onAssign: () => void; onResolve: () => void }) {
  const [history, setHistory] = useState(false)
  const st = COMPLAINT_STATE[k.state]
  const step2 = k.state !== 'new'
  const step3 = k.state === 'resolved'
  const canAssign = k.state === 'new'
  const canResolve = k.state === 'new' || k.state === 'under_review'
  return (
    <article className={`ak-cmp${k.urgent && k.state !== 'resolved' ? ' is-urgent' : ''}`} aria-label={`${k.refNo} ${k.title}`}>
      <div className="ak-bh">
        <div style={{ minWidth: 0 }}>
          <strong style={{ color: 'var(--ink)' }}>{k.title}</strong>
          <div className="ak-muted">
            {k.refNo} {'·'} {k.who} {'·'} {fmtDate(k.createdAt, false)}
            {k.dueAt && k.state !== 'resolved' ? ` · reply by ${fmtDate(k.dueAt, false)}` : ''}
          </div>
        </div>
        <div className="ak-wrap">
          {k.urgent && k.state !== 'resolved' ? <Badge tone="danger">Urgent</Badge> : null}
          <Badge tone={categoryTone(k.category)}>{k.categoryLabel}</Badge>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
      </div>
      <p className="ak-p">{k.text}</p>
      <div className="ak-track" role="img" aria-label={`Progress: ${st.label}`}>
        <span className="is-on" />
        <span className={step2 ? 'is-on' : ''} />
        <span className={step3 ? 'is-on' : ''} />
      </div>
      <div className="ak-muted ak-track-labels" aria-hidden="true">
        <span>Filed</span>
        <span>Under review</span>
        <span>Resolved</span>
      </div>
      {k.resolution ? (
        <Alert tone="success" title={`Resolved${k.resolvedAt ? ` ${fmtDate(k.resolvedAt)}` : ''}`}>
          {k.resolution}
        </Alert>
      ) : null}
      <div className="ak-wrap">
        {canAssign ? (
          <Button variant="secondary" size="sm" onClick={onAssign}>
            Assign to PRO desk
          </Button>
        ) : null}
        {canResolve ? (
          <Button variant="primary" size="sm" onClick={onResolve}>
            Resolve &amp; notify citizen
          </Button>
        ) : null}
        <button type="button" className="ak-rowbtn" aria-expanded={history} onClick={() => setHistory((h) => !h)}>
          {history ? 'Hide history' : 'History'}
        </button>
        <span className="ak-muted">
          {k.assignee ? `Assigned to ${k.assignee}` : 'Not assigned'}
          {k.escalationLevel > 0 ? ` · escalation level ${k.escalationLevel}` : ''}
        </span>
      </div>
      {history ? <Timeline id={k.id} /> : null}
    </article>
  )
}

export default function Complaints() {
  const [filter, setFilter] = useState<Filter>('')
  const q = useHospitalComplaints(filter)
  const assign = useAssignComplaint()
  const resolve = useResolveComplaint()
  const [assigning, setAssigning] = useState<Item | null>(null)
  const [resolving, setResolving] = useState<Item | null>(null)
  const [text, setText] = useState('')
  const { show, node } = useFlash()

  async function doAssign() {
    if (!assigning) return
    try {
      await assign.mutateAsync({ id: assigning.id })
      show('success', `${assigning.refNo} is under review and assigned to you.`)
      setAssigning(null)
    } catch {
      /* in modal */
    }
  }
  async function doResolve() {
    if (!resolving) return
    try {
      await resolve.mutateAsync({ id: resolving.id, resolution: text.trim() })
      show('success', `${resolving.refNo} is resolved. The citizen has an update in their Complaints page.`)
      setResolving(null)
    } catch {
      /* in modal */
    }
  }

  return (
    <div className="ak-page">
      <PageHeader
        title="Citizen complaints"
        subtitle="Filed by citizens in the app. Reply within 7 days; unresolved complaints go to the district grievance officer."
        actions={
          q.data ? (
            <div className="ak-wrap">
              <Badge tone="warning">{q.data.openCount} open</Badge>
              <Badge tone="success">{q.data.resolvedCount} resolved</Badge>
              {q.data.escalatedCount ? <Badge tone="danger">{q.data.escalatedCount} escalated</Badge> : null}
            </div>
          ) : undefined
        }
      />
      {node}
      <Chips<Filter>
        label="Filter complaints"
        value={filter}
        onChange={setFilter}
        options={[
          { id: '', label: 'All' },
          { id: 'open', label: 'Open' },
          { id: 'resolved', label: 'Resolved' },
          { id: 'escalated', label: 'Escalated' },
        ]}
      />
      <Async query={q} skeleton={<PageSkeleton stats={false} boxes={2} />}>
        {(data) => (
          <div className="ak-grid ak-g21 ak-in">
            <div className="ak-stack">
              {data.items.length === 0 ? (
                <EmptyBox title="No complaints here">Nothing matches this filter.</EmptyBox>
              ) : (
                data.items.map((k) => (
                  <Card
                    key={k.id}
                    k={k}
                    onAssign={() => {
                      assign.reset()
                      setAssigning(k)
                    }}
                    onResolve={() => {
                      resolve.reset()
                      setText('')
                      setResolving(k)
                    }}
                  />
                ))
              )}
            </div>
            <div className="ak-col">
              <Box title="By category · 30 days">
                {data.byCategoryLast30Days.length === 0 ? (
                  <p className="ak-muted">No complaints in the last 30 days.</p>
                ) : (
                  data.byCategoryLast30Days.map((c) => {
                    const max = Math.max(...data.byCategoryLast30Days.map((x) => x.count), 1)
                    return (
                      <div key={c.category} className="ak-rb" style={{ gridTemplateColumns: '110px 1fr 28px' }}>
                        <span className="ak-muted">{c.label}</span>
                        <Bar pct={(c.count / max) * 100} tone="gold" />
                        <span className="ak-muted">{c.count}</span>
                      </div>
                    )
                  })
                )}
              </Box>
              <Box title="Response time">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span className="ak-big" style={{ fontSize: 32 }}>{data.avgResponseDays ?? '-'}</span>
                  <span className="ak-muted">days average {'·'} target {data.targetDays}</span>
                </div>
                <p className="ak-muted ak-table-note">Resolving sends the citizen an update in their Complaints page and closes the ticket for the district.</p>
              </Box>
            </div>
          </div>
        )}
      </Async>

      <ConfirmModal
        open={assigning !== null}
        title={`Take up ${assigning?.refNo ?? 'complaint'}?`}
        confirmLabel="Assign to PRO desk"
        busy={assign.isPending}
        error={assign.isError ? errorMessage(assign.error) : null}
        onConfirm={() => void doAssign()}
        onClose={() => setAssigning(null)}
        size="sm"
      >
        <p className="ak-p">The complaint moves to Under review and is assigned to you as the hospital admin. The citizen sees that it is being looked at.</p>
      </ConfirmModal>

      <ConfirmModal
        open={resolving !== null}
        title={`Resolve ${resolving?.refNo ?? 'complaint'}?`}
        confirmLabel="Resolve and notify citizen"
        busy={resolve.isPending}
        disabled={text.trim().length < 5}
        error={resolve.isError ? errorMessage(resolve.error) : null}
        onConfirm={() => void doResolve()}
        onClose={() => setResolving(null)}
      >
        <p className="ak-p">The citizen is told straight away and the ticket closes for the district.</p>
        <Textarea
          label="What was done"
          required
          rows={4}
          maxLength={2000}
          helper="At least 5 characters. The citizen reads this."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </ConfirmModal>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Alert, Badge, Button, StatCard, Table, TextField } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { useEvents, eventTag } from '../../../hooks/useEvents'
import { useAuth } from '../../../context/AuthContext'
import { errMessage } from '../../../api/nurse'
import { useLabCritical, useLabOrderAction, useLabTat, useLabWorklist } from '../../../api/lab'
import type { LabStage, LabWorklistOrder } from '../../../api/lab'
import { BoxHead, Empty, ErrorBlock, PRIORITY, PageLoading, STAGE, fmtDay, fmtTime, waitText } from './common'
import { ReasonModal } from '../nurse/dialogs'
import type { Go } from '../nurse/types'
import CriticalBox from './CriticalBox'
import LabHandover from './LabHandover'

type Filter = 'all' | 'stat' | LabStage
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stat', label: 'STAT' },
  { id: 'awaiting_sample', label: 'Awaiting sample' },
  { id: 'running', label: 'Running' },
  { id: 'to_verify', label: 'To verify' },
  { id: 'to_release', label: 'To release' },
]

const I = {
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  tube: 'M9 3h6M10 3v13a2 2 0 0 0 4 0V3',
  check: 'M5 12l5 5l9-10',
  clock: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM12 7v5l3 2',
}
function Ic({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

/** Where a technician continues an order, based on its stage. */
export function openStep(o: LabWorklistOrder): { section: string; label: string } {
  if (o.stage === 'new' || o.stage === 'awaiting_sample') return { section: 'collect', label: 'Collect sample' }
  if (o.stage === 'to_release') return { section: 'upload', label: 'Release' }
  return { section: 'results', label: o.stage === 'to_verify' ? 'Verify' : 'Enter results' }
}

export default function Home({ go }: { go: Go }) {
  const { user } = useAuth()
  const wl = useLabWorklist()
  const tat = useLabTat(7)
  const crit = useLabCritical()
  const act = useLabOrderAction()
  const { events, unavailable } = useEvents(user?.role)
  const [filter, setFilter] = useState<Filter>('all')
  const [lookup, setLookup] = useState('')
  const [rejecting, setRejecting] = useState<LabWorklistOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const orders = wl.data?.orders ?? []
  const shown = useMemo(
    () => orders.filter((o) => (filter === 'all' ? true : filter === 'stat' ? o.priority === 'stat' : filter === 'awaiting_sample' ? o.stage === 'awaiting_sample' || o.stage === 'new' : o.stage === filter)),
    [orders, filter],
  )
  const hits = useMemo(() => {
    const q = lookup.trim().toLowerCase()
    if (!q) return []
    return orders.filter((o) => `${o.orderRef} ${o.patientName} ${o.tests ?? ''}`.toLowerCase().includes(q)).slice(0, 4)
  }, [orders, lookup])

  if (wl.isLoading) return <PageLoading title="worklist" />
  if (wl.isError) return <ErrorBlock error={wl.error} onRetry={() => void wl.refetch()} title="Could not load the worklist" />
  const k = wl.data!.kpis
  const incoming = orders.filter((o) => o.stage === 'new')
  const statMedian = tat.data?.byPriority.find((p) => p.priority === 'stat')?.medianMinutes

  const cols: TableColumn<LabWorklistOrder>[] = [
    { key: 'orderRef', header: 'Order', mono: true },
    { key: 'patientName', header: 'Patient', render: (r) => `${r.patientName}${r.age != null ? `, ${r.age}` : ''}${r.sex ? ` ${r.sex.charAt(0).toUpperCase()}` : ''}` },
    { key: 'tests', header: 'Tests' },
    { key: 'from', header: 'From' },
    {
      key: 'priority',
      header: 'Priority',
      render: (r) => <Badge tone={r.priority === 'stat' ? 'danger' : 'neutral'} icon={<span>{(PRIORITY[r.priority] ?? PRIORITY.routine!).icon}</span>}>{(PRIORITY[r.priority] ?? PRIORITY.routine!).label}</Badge>,
    },
    { key: 'stage', header: 'Status', render: (r) => <Badge tone={STAGE[r.stage].tone} icon={<span>{STAGE[r.stage].icon}</span>}>{STAGE[r.stage].label}</Badge> },
    { key: 'waitingMinutes', header: 'Waiting', align: 'right', render: (r) => waitText(r.waitingMinutes) },
    {
      key: 'open',
      header: <span className="lb-sr">Open</span>,
      render: (r) => {
        const s = openStep(r)
        return <button type="button" className="lb-tbl-btn" aria-label={`${s.label}: ${r.orderRef}`} onClick={() => go(s.section, { order: r.orderId })}>{s.label}</button>
      },
    },
  ]

  function accept(o: LabWorklistOrder) {
    setError(null)
    act.mutate({ orderId: o.orderId, action: 'accept' }, { onError: (e) => setError(errMessage(e)) })
  }

  return (
    <div className="lb-pg">
      <header className="lb-head">
        <div>
          <p className="lb-muted" style={{ margin: '0 0 4px' }}>{fmtDay()}</p>
          <h1 className="lb-h1">Worklist</h1>
          <p className="lb-sub">Orders sent to the lab. You can open a patient only through one of these orders.</p>
        </div>
        <div className="lb-pills" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`lb-pill${filter === f.id ? ' is-on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </header>

      <section className="lb-grid lb-g4">
        <StatCard label="Open orders" value={k.openOrders} hint={`${k.statOrders} STAT · ${k.openOrders - k.statOrders} other`} tone="blue" icon={<Ic d={I.flask} />} />
        <StatCard label="Awaiting sample" value={k.awaitingSample} hint={k.awaitingSample ? `Oldest ${waitText(k.oldestAwaitingMinutes)}` : 'None waiting'} tone="peach" icon={<Ic d={I.tube} />} />
        <StatCard label="Ready to verify" value={k.toVerify} hint={`${k.toRelease} verified, ready to release`} icon={<Ic d={I.check} />} />
        <StatCard
          label="STAT turnaround"
          value={statMedian != null ? Math.round(statMedian) : '-'}
          unit={statMedian != null ? 'min' : undefined}
          hint={statMedian != null ? 'Median, last 7 days (target 60)' : 'No STAT results in the last 7 days'}
          tone="sage"
          icon={<Ic d={I.clock} />}
        />
      </section>

      {error ? <Alert tone="danger" title="Could not update the order" onDismiss={() => setError(null)}>{error}</Alert> : null}

      <div className="lb-box">
        <BoxHead title="Incoming orders" right={<span className="lb-muted">{incoming.length} waiting for you · STAT first</span>} />
        {incoming.length === 0 ? (
          <Empty title="No new orders">New orders from doctors appear here.</Empty>
        ) : (
          <div className="lb-list">
            {incoming.map((o) => {
              const p = PRIORITY[o.priority] ?? PRIORITY.routine!
              return (
                <div key={o.orderId} className={`lb-q${o.priority === 'stat' ? ' is-stat' : ''}`}>
                  <span className={`lb-pri is-${o.priority}`}><span aria-hidden="true">{p.icon}</span>{p.label}</span>
                  <span className="lb-mono" style={{ width: 84 }}>{o.orderRef}</span>
                  <div className="lb-grow">
                    <strong className="lb-strong">{o.patientName} · {o.tests}</strong>
                    <div className="lb-muted">{o.from} · {o.orderedBy} · waiting {waitText(o.waitingMinutes)}</div>
                  </div>
                  <div className="lb-actions">
                    <button type="button" className="lb-qa is-ok" aria-label={`Accept ${o.orderRef}, ${o.tests}`} disabled={act.isPending} onClick={() => accept(o)}>Accept</button>
                    <button type="button" className="lb-qa" aria-label={`Reject ${o.orderRef}, ${o.tests}`} disabled={act.isPending} onClick={() => { setModalError(null); setRejecting(o) }}>Reject</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="lb-box">
        <BoxHead title="Worklist" right={<span className="lb-muted">Every open order in the lab</span>} />
        <Table columns={cols} rows={shown} rowKey="orderId" caption="Lab worklist" isRowHighlighted={(r) => r.priority === 'stat'} empty="No orders match this filter." />
      </div>

      <section className="lb-grid lb-g3">
        <div className="lb-box">
          <BoxHead title="Connected apps" right={<Badge tone="teal" dot>Live</Badge>} />
          {unavailable ? (
            <p className="lb-muted" style={{ margin: 0 }}>The events feed is not reachable right now.</p>
          ) : events.length === 0 ? (
            <Empty title="No activity yet">Orders and alerts from other apps appear here.</Empty>
          ) : (
            events.slice(0, 5).map((e) => (
              <div className="lb-feed" key={e.id}>
                <span className="lb-feed-k">{eventTag(e.type).tag}</span>
                <div className="lb-grow">
                  <strong className="lb-strong">{e.title}</strong>
                  <div className="lb-muted">{e.text}</div>
                </div>
                <span className="lb-mono">{e.at}</span>
              </div>
            ))
          )}
        </div>

        <div className="lb-box">
          <BoxHead title="Workload · today" />
          <Bar label="Samples collected" done={k.samplesCollectedToday} total={k.samplesCollectedToday + k.awaitingSample} />
          <Bar label="Results released" done={k.resultsReleasedToday} total={k.resultsReleasedToday + k.toVerify + k.toRelease} />
          <p className="lb-muted" style={{ margin: 0 }}>Filled bar = done · striped = still pending. {k.samplesRejectedToday} sample(s) rejected today.</p>
          <dl className="lb-kvx">
            <div><dt>Median STAT turnaround</dt><dd className={statMedian != null && statMedian <= 60 ? 'is-good' : ''}>{statMedian != null ? `${Math.round(statMedian)} min` : '-'}</dd></div>
            <div><dt>STAT waiting</dt><dd className={k.statOrders ? 'is-bad' : 'is-good'}>{k.statOrders}</dd></div>
            <div><dt>To verify</dt><dd>{k.toVerify}</dd></div>
            <div><dt>Calls to make</dt><dd className={crit.data?.uncalled.length ? 'is-bad' : 'is-good'}>{crit.data ? crit.data.uncalled.length : '-'}</dd></div>
          </dl>
        </div>

        <div className="lb-box">
          <BoxHead title="Find an order" right={<Badge tone="outline">Order-scoped</Badge>} />
          <TextField label="Order ID or patient on an order" placeholder="e.g. LO-55120 or Anjali" value={lookup} onChange={(e) => setLookup(e.target.value)} helper="Searches only open orders sent to the lab." />
          <div className="lb-sugg" role="listbox" aria-label="Matching orders">
            {hits.map((o) => {
              const s = openStep(o)
              return (
                <button key={o.orderId} type="button" role="option" aria-selected={false} onClick={() => go(s.section, { order: o.orderId })}>
                  <span className="lb-mono">{o.orderRef}</span>
                  <span className="lb-grow">
                    <strong style={{ fontSize: 14 }}>{o.patientName}</strong>
                    <span className="lb-muted" style={{ display: 'block' }}>{o.tests} · {STAGE[o.stage].label}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {lookup.trim() && hits.length === 0 ? <p className="lb-muted" style={{ margin: 0 }}>No order matches. Patients without a lab order cannot be looked up.</p> : null}
        </div>
      </section>

      <section className="lb-grid lb-g2">
        <div className="lb-list" style={{ gap: 18 }}>
          <div className="lb-lock">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            <div><strong style={{ color: 'var(--ink)' }}>Order-scoped access.</strong> <span>No patient search. Each order shows name, age, sex and the tests asked for, nothing else from the record.</span></div>
          </div>
          <CriticalBox go={go} />
        </div>
        <LabHandover />
      </section>

      <ReasonModal
        open={!!rejecting}
        title={`Reject ${rejecting?.orderRef ?? 'order'}?`}
        confirmLabel="Reject order"
        label="Why are you rejecting it?"
        helper="The ordering doctor is told and sees your reason."
        busy={act.isPending}
        error={modalError}
        onClose={() => { setRejecting(null); setModalError(null) }}
        onConfirm={(reason) => rejecting && act.mutate({ orderId: rejecting.orderId, action: 'reject', reason }, { onSuccess: () => setRejecting(null), onError: (e) => setModalError(errMessage(e)) })}
      >
        <p style={{ margin: 0 }}>{rejecting?.patientName} · {rejecting?.tests}</p>
      </ReasonModal>
    </div>
  )
}

function Bar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? done / total : 0
  return (
    <div className="lb-wk">
      <span>{label}</span>
      <div className="lb-bar is-wk" role="img" aria-label={`${label}: ${done} done of ${total}, ${total - done} pending`}>
        <span style={{ transform: `scaleX(${pct})` }} />
      </div>
      <b>{done} / {total}</b>
    </div>
  )
}

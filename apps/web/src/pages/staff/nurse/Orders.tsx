import { useMemo, useState } from 'react'
import { Alert, Badge, Button, StatCard, Table } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { errMessage, useNurseOrders, useOrderAction } from '../../../api/nurse'
import type { NurseOrder } from '../../../api/nurse'
import { BoxHead, Empty, ErrorBlock, Loading, PRIORITY, PageLoading, fmtTime, orderStatusLabel, orderTypeLabel } from './common'
import { ConfirmModal, ReasonModal } from './dialogs'

type Filter = 'all' | 'stat' | 'lab' | 'medication' | 'nursing'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stat', label: 'STAT' },
  { id: 'lab', label: 'Lab' },
  { id: 'medication', label: 'Medicine' },
  { id: 'nursing', label: 'Nursing' },
]
const RANK: Record<string, number> = { stat: 0, urgent: 1, routine: 2 }

function statusTone(s: string): 'warning' | 'info' | 'success' | 'neutral' {
  return s === 'open' ? 'warning' : s === 'done' ? 'success' : s === 'rejected' ? 'neutral' : 'info'
}
const STATUS_ICON: Record<string, string> = { open: '…', accepted: '✓', in_progress: '▶', done: '✓', rejected: '✕' }

export default function Orders() {
  const orders = useNurseOrders('all')
  const act = useOrderAction()
  const [filter, setFilter] = useState<Filter>('all')
  const [rejecting, setRejecting] = useState<NurseOrder | null>(null)
  const [completing, setCompleting] = useState<NurseOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const all = orders.data ?? []
  const shown = useMemo(
    () =>
      all
        .filter((o) => (filter === 'all' ? true : filter === 'stat' ? o.priority === 'stat' : o.type === filter))
        .sort((a, b) => {
          const ar = (a.status === 'open' ? 0 : 10) + (RANK[a.priority] ?? 2)
          const br = (b.status === 'open' ? 0 : 10) + (RANK[b.priority] ?? 2)
          return ar - br
        }),
    [all, filter],
  )

  if (orders.isLoading) return <PageLoading title="orders" />
  if (orders.isError) return <ErrorBlock error={orders.error} onRetry={() => void orders.refetch()} title="Could not load orders" />

  const actionable = all.filter((o) => o.actionable)
  const open = actionable.filter((o) => o.status === 'open')
  const done = actionable.filter((o) => o.status === 'done').length
  const waitingLab = all.filter((o) => o.type === 'lab' && ['open', 'accepted', 'in_progress'].includes(o.status)).length
  const statOpen = open.filter((o) => o.priority === 'stat').length

  function run(o: NurseOrder, action: 'accept' | 'reject' | 'complete', reason?: string, after?: () => void) {
    setError(null)
    setModalError(null)
    act.mutate(
      { id: o.id, action, reason },
      {
        onSuccess: () => after?.(),
        onError: (e) => (after ? setModalError(errMessage(e)) : setError(errMessage(e))),
      },
    )
  }

  const cols: TableColumn<NurseOrder>[] = [
    { key: 'orderRef', header: 'Order', mono: true },
    { key: 'bedNo', header: 'Bed', render: (r) => (r.bedNo ? `Bed ${r.bedNo}` : '-') },
    { key: 'details', header: 'Order', render: (r) => `${orderTypeLabel(r.type)} · ${r.details}` },
    { key: 'orderedBy', header: 'Ordered by' },
    { key: 'createdAt', header: 'At', mono: true, render: (r) => fmtTime(r.createdAt) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={statusTone(r.status)} icon={<span>{STATUS_ICON[r.status] ?? '·'}</span>}>
          {orderStatusLabel(r.status)}
        </Badge>
      ),
    },
  ]

  return (
    <div className="nu-pg">
      <header className="nu-head">
        <div>
          <h1 className="nu-h1">Orders received</h1>
          <p className="nu-sub">Only orders for patients in your ward.</p>
        </div>
        <div className="nu-pills" role="group" aria-label="Filter orders">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`nu-pill${filter === f.id ? ' is-on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {error ? <Alert tone="danger" title="Could not update the order" onDismiss={() => setError(null)}>{error}</Alert> : null}

      <div className="nu-box">
        <BoxHead title="Incoming queue" right={<span className="nu-muted">STAT first · waiting orders at the top</span>} />
        {shown.length === 0 ? (
          <Empty title="No orders here">Nothing matches this filter.</Empty>
        ) : (
          <div className="nu-list">
            {shown.map((o) => {
              const p = PRIORITY[o.priority] ?? PRIORITY.routine!
              const pending = o.status === 'open'
              return (
                <div key={o.id} className={`nu-q${o.priority === 'stat' && pending ? ' is-stat' : ''}${!pending ? ' is-done' : ''}`}>
                  <span className={`nu-pri is-${o.priority}`}><span aria-hidden="true">{p.icon}</span>{p.label}</span>
                  <span className="nu-mono" style={{ width: 84 }}>{o.orderRef}</span>
                  <div className="nu-grow">
                    <strong className="nu-strong">{o.bedNo ? `Bed ${o.bedNo} · ` : ''}{orderTypeLabel(o.type)} · {o.details}</strong>
                    <div className="nu-muted">{o.patientName} · {o.orderedBy} · {fmtTime(o.createdAt)}{o.clinicalNote ? ` · ${o.clinicalNote}` : ''}{o.rejectedReason ? ` · Reason: ${o.rejectedReason}` : ''}</div>
                  </div>
                  {o.actionable && pending ? (
                    <div className="nu-actions">
                      <button type="button" className="nu-qa is-ok" aria-label={`Accept ${o.orderRef}, ${o.details}`} disabled={act.isPending} onClick={() => run(o, 'accept')}>Accept</button>
                      <button type="button" className="nu-qa" aria-label={`Reject ${o.orderRef}, ${o.details}`} disabled={act.isPending} onClick={() => { setModalError(null); setRejecting(o) }}>Reject</button>
                    </div>
                  ) : o.actionable && (o.status === 'accepted' || o.status === 'in_progress') ? (
                    <div className="nu-actions">
                      <Badge tone="info" icon={<span>✓</span>}>Accepted</Badge>
                      <button type="button" className="nu-qa is-ok" aria-label={`Mark ${o.orderRef} done`} disabled={act.isPending} onClick={() => { setModalError(null); setCompleting(o) }}>Mark done</button>
                    </div>
                  ) : (
                    <Badge tone={statusTone(o.status)} icon={<span>{STATUS_ICON[o.status] ?? '·'}</span>}>
                      {o.actionable ? orderStatusLabel(o.status) : `${orderStatusLabel(o.status)} · ${o.type === 'lab' ? 'with lab' : 'with radiology'}`}
                    </Badge>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="nu-box">
        <BoxHead title="All orders" />
        {act.isPending && !rejecting && !completing ? <Loading rows={1} label="Updating order" /> : null}
        <Table columns={cols} rows={shown} rowKey="id" caption="Orders for the ward" empty="No orders match this filter." />
      </div>

      <section className="nu-grid nu-g3">
        <StatCard label="Open in queue" value={open.length} hint={`${statOpen} marked STAT`} tone="peach" />
        <StatCard label="Done this shift" value={done} hint="Nursing, medicine and vitals orders" tone="sage" />
        <StatCard label="Waiting on lab" value={waitingLab} hint="Results appear in the chart" tone="blue" />
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
        onConfirm={(reason) => rejecting && run(rejecting, 'reject', reason, () => setRejecting(null))}
      >
        <p style={{ margin: 0 }}>{rejecting?.bedNo ? `Bed ${rejecting.bedNo} · ` : ''}{rejecting?.details}</p>
      </ReasonModal>

      <ConfirmModal
        open={!!completing}
        title={`Mark ${completing?.orderRef ?? 'order'} done?`}
        confirmLabel="Mark done"
        busy={act.isPending}
        error={modalError}
        onClose={() => { setCompleting(null); setModalError(null) }}
        onConfirm={() => completing && run(completing, 'complete', undefined, () => setCompleting(null))}
      >
        <p style={{ margin: 0 }}>{completing?.bedNo ? `Bed ${completing.bedNo} · ` : ''}{completing?.details}. This closes the order for the doctor.</p>
      </ConfirmModal>
    </div>
  )
}

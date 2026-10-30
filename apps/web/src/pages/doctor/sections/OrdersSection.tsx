import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Badge, Button, Select, StatCard, Table, Textarea } from '../../../components/ui'
import type { BadgeTone, TableColumn } from '../../../components/ui'
import { useAckResult, useCreateOrder, useOrderCatalogue, useOrderResults, useOrders } from '../../../api/doctor'
import type { LabResultRow, OrderRow } from '../../../api/doctor'
import { useDoctorSession } from '../session'
import { Box, ConfirmModal, ErrorNote, Header, Loading, NeedPatient, Row, Sent } from '../parts'
import { fmtDayTime } from '../format'

const PRIO: Record<string, BadgeTone> = { routine: 'neutral', urgent: 'warning', stat: 'danger' }
const STATUS_TONE: Record<string, BadgeTone> = { open: 'neutral', accepted: 'info', in_progress: 'info', done: 'success' }

export default function OrdersSection() {
  const { active } = useDoctorSession()
  const sid = active?.sessionId ?? null
  const canWrite = Boolean(active && !active.readOnly)
  const orders = useOrders()
  const results = useOrderResults()
  const catalogue = useOrderCatalogue()
  const create = useCreateOrder(sid)
  const ack = useAckResult()

  const [kind, setKind] = useState<'lab' | 'imaging'>('lab')
  const [pickTest, setPickTest] = useState('')
  const [tests, setTests] = useState<string[]>([])
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'stat'>('routine')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'lab' | 'imaging'>('all')
  const [ackRow, setAckRow] = useState<LabResultRow | null>(null)
  const [ackComment, setAckComment] = useState('')

  const options = useMemo(() => {
    const c = catalogue.data
    if (!c) return []
    if (kind === 'imaging') return c.imaging.map((i) => ({ value: i.name, label: `${i.name} (${i.modality})` }))
    return [
      ...c.lab.panels.map((p) => ({ value: p.name, label: `Panel: ${p.name}` })),
      ...c.lab.tests.map((t) => ({ value: t.name, label: t.name })),
    ]
  }, [catalogue.data, kind])

  function addTest() {
    if (pickTest && !tests.includes(pickTest)) setTests([...tests, pickTest])
    setPickTest('')
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    if (tests.length === 0) return
    create.mutate(
      { kind, tests, priority, note: note.trim() || undefined },
      {
        onSuccess: (r) => {
          setMessage(r.message)
          setTests([])
          setNote('')
        },
      },
    )
  }

  const rows = (orders.data?.orders ?? []).filter((o) => filter === 'all' || o.kind === filter)
  const cols: TableColumn<OrderRow>[] = [
    { key: 'orderRef', header: 'Order', mono: true },
    { key: 'kind', header: 'Type', render: (o) => (o.kind === 'lab' ? 'Lab' : o.kind === 'imaging' ? 'Radiology' : 'Other') },
    { key: 'patientName', header: 'Patient' },
    { key: 'tests', header: 'Tests' },
    { key: 'priority', header: 'Priority', render: (o) => <Badge tone={PRIO[o.priority] ?? 'neutral'}>{o.priority}</Badge> },
    { key: 'statusLabel', header: 'Status', render: (o) => <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.statusLabel}</Badge> },
    { key: 'orderedAt', header: 'Ordered', render: (o) => fmtDayTime(o.orderedAt) },
  ]

  const unackedLab = (results.data?.lab ?? []).filter((r) => !r.acknowledged)

  return (
    <div className="dr-page">
      <Header title="Orders" subtitle="Lab and radiology orders. Staff only see a patient through your order." />

      <form className="dr-stack" onSubmit={submit}>
        <Box title="New order" actions={<Badge tone="outline">Goes straight to the technician's worklist</Badge>}>
          {!active ? <NeedPatient what="Placing an order" /> : !canWrite ? <p className="dr-muted">An emergency (break-glass) session is read-only: no orders.</p> : (
            <>
              <p className="dr-muted" style={{ margin: 0 }}>
                Ordering for <strong>{active.patient.name}</strong>.
              </p>
              <div className="dr-seg" role="group" aria-label="Order type">
                {(['lab', 'imaging'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={kind === k ? 'on' : ''}
                    aria-pressed={kind === k}
                    onClick={() => {
                      setKind(k)
                      setTests([])
                      setPickTest('')
                    }}
                  >
                    {k === 'lab' ? 'Lab' : 'Radiology'}
                  </button>
                ))}
              </div>
              <div className="dr-wrap" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 260px' }}>
                  <Select label={kind === 'lab' ? 'Test or panel' : 'Study'} value={pickTest} onChange={setPickTest} options={options} placeholder="Choose…" />
                </div>
                <Button type="button" variant="secondary" disabled={!pickTest} onClick={addTest}>
                  Add
                </Button>
                <div style={{ flex: '0 1 180px' }}>
                  <Select label="Priority" value={priority} onChange={(v) => setPriority(v as typeof priority)} options={catalogue.data?.priorities ?? ['routine', 'urgent', 'stat']} />
                </div>
              </div>
              <div className="dr-wrap" aria-label="Tests in this order">
                {tests.length === 0 ? <span className="dr-muted">Add one or more tests.</span> : null}
                {tests.map((t) => (
                  <button key={t} type="button" className="dr-chip on" onClick={() => setTests(tests.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                    {t} &times;
                  </button>
                ))}
              </div>
              <Textarea label="Note for the technician" optional value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
              <div>
                <Button type="submit" size="lg" loading={create.isPending} disabled={tests.length === 0}>
                  Place order
                </Button>
              </div>
              <ErrorNote error={create.error} title="Could not place the order" />
              {message ? <Sent>{message}</Sent> : null}
            </>
          )}
        </Box>
      </form>

      <section className="dr-grid dr-g4">
        <StatCard label="Open" value={orders.data?.stats.open ?? '-'} />
        <StatCard label="In progress" value={orders.data?.stats.inProgress ?? '-'} tone="blue" />
        <StatCard label="Results back" value={orders.data?.stats.resultsBack ?? '-'} tone="sage" />
        <StatCard label="Critical" value={orders.data?.stats.critical ?? '-'} tone="peach" hint={unackedLab.some((r) => r.critical) ? 'Needs acknowledging' : undefined} />
      </section>

      <Box
        title="Results to acknowledge"
        actions={<Badge tone={unackedLab.length ? 'warning' : 'success'}>{unackedLab.length} waiting</Badge>}
      >
        {results.isLoading ? <Loading lines={3} /> : null}
        <ErrorNote error={results.error} title="Could not load results" />
        {unackedLab.length === 0 && results.data ? <p className="dr-muted">All lab results are acknowledged.</p> : null}
        {unackedLab.slice(0, 10).map((r) => (
          <Row
            key={r.resultId}
            tok="LAB"
            tone={r.critical ? 'peach' : 'blue'}
            title={
              <>
                {r.title} {r.critical ? <Badge tone="danger">Critical</Badge> : null}
              </>
            }
            sub={`${r.patientName} · ${r.values} · released by ${r.releasedBy}, ${fmtDayTime(r.releasedAt)}`}
            right={
              <Button size="sm" variant="secondary" onClick={() => setAckRow(r)} aria-label={`Acknowledge ${r.title} for ${r.patientName}`}>
                Acknowledge
              </Button>
            }
          />
        ))}
        {(results.data?.imaging ?? []).length ? (
          <>
            <h3 className="dr-strong" style={{ margin: '6px 0 0' }}>
              Radiology studies
            </h3>
            {(results.data?.imaging ?? []).slice(0, 8).map((s) => (
              <Row key={s.studyId} tok="RAD" tone="lav" title={s.title} sub={`${s.patientName} · ${s.orderRef}`} right={<Badge tone={s.status === 'waiting' ? 'neutral' : 'info'}>{s.status.replace(/_/g, ' ')}</Badge>} />
            ))}
          </>
        ) : null}
      </Box>

      <Box
        title="All orders"
        actions={
          <div className="dr-seg" role="group" aria-label="Filter orders">
            {(['all', 'lab', 'imaging'] as const).map((f) => (
              <button key={f} type="button" className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'lab' ? 'Lab' : 'Radiology'}
              </button>
            ))}
          </div>
        }
      >
        {orders.isLoading ? <Loading /> : <Table columns={cols} rows={rows.slice(0, 40)} rowKey="id" striped caption="Orders" isRowHighlighted={(o) => o.critical} empty="No orders." />}
        <ErrorNote error={orders.error} title="Could not load orders" />
      </Box>

      <ConfirmModal
        open={ackRow !== null}
        title="Acknowledge this result?"
        onClose={() => setAckRow(null)}
        confirmLabel="Acknowledge"
        busy={ack.isPending}
        error={ack.error}
        onConfirm={() =>
          ackRow &&
          ack.mutate(
            { resultId: ackRow.resultId, comment: ackComment.trim() || undefined },
            {
              onSuccess: () => {
                setAckRow(null)
                setAckComment('')
              },
            },
          )
        }
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          {ackRow?.title} for {ackRow?.patientName}: {ackRow?.values}. Acknowledging records that you have seen it, with your name and the time.
        </p>
        <Textarea label="Comment (optional)" optional value={ackComment} onChange={(e) => setAckComment(e.target.value)} rows={2} maxLength={500} />
      </ConfirmModal>
    </div>
  )
}

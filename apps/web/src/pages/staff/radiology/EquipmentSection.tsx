import { useEffect, useState } from 'react'
import { useAddEquipmentEvent, useEquipment, useSetRoomStatus } from '../../../api/radiology'
import type { EquipmentRoom, RoomState } from '../../../api/radiology'
import { Alert, Badge, Button, Card, EmptyState, Modal, PageHeader, Select, StatCard, Table, Textarea, TextField } from '../../../components/ui'
import { ListSkeleton, LoadError } from '../../../components/ClinicalBits'
import { errorText } from '../../../api/clinicalHttp'
import { MODALITY_LABEL, fmtDate, fmtDateTime } from './util'

const KIND_LABEL: Record<string, string> = { downtime: 'Downtime', service: 'Service', calibration: 'Calibration', flat_field: 'Flat-field calibration', repair: 'Repair' }
const STATE_LABEL: Record<string, string> = { ok: 'Working', down: 'Down', maintenance: 'In maintenance' }

function Led({ led, label }: { led: 'ok' | 'warn' | 'bad'; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className={`rt-led ${led}`} aria-hidden="true" />
      {label}
    </span>
  )
}

function StatusModal({ room, onClose }: { room: EquipmentRoom | null; onClose: () => void }) {
  const set = useSetRoomStatus()
  const [status, setStatus] = useState<RoomState>('ok')
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (room) {
      set.reset()
      setStatus(room.status === 'ok' ? 'maintenance' : 'ok')
      setReason('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id])
  const needReason = status !== 'ok'
  return (
    <Modal
      open={!!room}
      title={`Change status · ${room?.name ?? ''}`}
      size="sm"
      onClose={set.isPending ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={set.isPending}>
            Cancel
          </Button>
          <Button
            variant={needReason ? 'danger' : 'primary'}
            loading={set.isPending}
            disabled={needReason && reason.trim().length < 3}
            onClick={() => room && set.mutate({ roomId: room.id, status, reason: needReason ? reason.trim() : undefined }, { onSuccess: onClose })}
          >
            {needReason ? 'Take out of service' : 'Return to service'}
          </Button>
        </>
      }
    >
      <div className="rt-stack">
        <Select
          label="New status"
          value={status}
          onChange={(v) => setStatus(v as RoomState)}
          options={[
            { value: 'ok', label: 'Working' },
            { value: 'maintenance', label: 'In maintenance' },
            { value: 'down', label: 'Down' },
          ]}
        />
        {needReason ? (
          <>
            <Textarea label="Why is it out of service?" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} />
            <Alert tone="warning" title="Booked studies are not moved automatically">
              Scheduling is blocked for this room while it is out of service. Reschedule affected studies from the Schedule screen.
            </Alert>
          </>
        ) : null}
        {set.isError ? <Alert tone="danger">{errorText(set.error)}</Alert> : null}
      </div>
    </Modal>
  )
}

function EventModal({ room, onClose }: { room: EquipmentRoom | null; onClose: () => void }) {
  const add = useAddEquipmentEvent()
  const [kind, setKind] = useState('calibration')
  const [dueOn, setDueOn] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (room) {
      add.reset()
      setKind('calibration')
      setDueOn('')
      setNote('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id])
  return (
    <Modal
      open={!!room}
      title={`Log an event · ${room?.name ?? ''}`}
      size="sm"
      onClose={add.isPending ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={add.isPending}>
            Cancel
          </Button>
          <Button
            loading={add.isPending}
            onClick={() =>
              room &&
              add.mutate(
                { roomId: room.id, kind: kind as 'service', dueOn: dueOn || undefined, note: note.trim() || undefined },
                { onSuccess: onClose },
              )
            }
          >
            Save event
          </Button>
        </>
      }
    >
      <div className="rt-stack">
        <Select label="What happened or is planned?" value={kind} onChange={setKind} options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} />
        <TextField label="Due on" type="date" optional value={dueOn} onChange={(e) => setDueOn(e.target.value)} helper="Set this for the next calibration or service date." />
        <Textarea label="Note" optional rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        {add.isError ? <Alert tone="danger">{errorText(add.error)}</Alert> : null}
      </div>
    </Modal>
  )
}

export default function EquipmentSection() {
  const q = useEquipment()
  const [statusFor, setStatusFor] = useState<EquipmentRoom | null>(null)
  const [eventFor, setEventFor] = useState<EquipmentRoom | null>(null)

  if (q.isLoading) {
    return (
      <div className="rt-page">
        <PageHeader title="Equipment" subtitle="Status of each machine, service dates and quality checks." />
        <ListSkeleton rows={4} height={90} label="Loading equipment" />
      </div>
    )
  }
  if (q.isError || !q.data) return <LoadError error={q.error} onRetry={() => q.refetch()} />

  const { summary, rooms, events } = q.data
  const warn = rooms.filter((r) => r.led === 'warn')
  const down = rooms.filter((r) => r.led === 'bad')
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? 'Room'

  return (
    <div className="rt-page">
      <PageHeader title="Equipment" subtitle="Status of each machine, service dates and quality checks." />

      <section className="rt-grid rt-g4" aria-label="Equipment summary">
        <StatCard label="Working" value={summary.working} unit={`of ${summary.total}`} tone="sage" />
        <StatCard label="Needs attention" value={summary.needsAttention} hint={warn.length ? warn.map((r) => r.name).join(', ') : 'Nothing due'} tone="peach" />
        <StatCard label="Down" value={summary.down} hint={down.length ? down.map((r) => r.name).join(', ') : 'All machines up'} />
        <StatCard label="Uptime · 30 days" value={summary.uptime30dPercent ?? '—'} unit={summary.uptime30dPercent === null ? undefined : '%'} tone="blue" />
      </section>

      <Card>
        <Table<EquipmentRoom>
          caption="Radiology equipment"
          rowKey="id"
          columns={[
            { key: 'name', header: 'Machine', render: (r) => <strong style={{ color: 'var(--ink)' }}>{r.name}</strong> },
            { key: 'modality', header: 'Type', render: (r) => MODALITY_LABEL[r.modality] ?? r.modality },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <Led led={r.led} label={r.led === 'warn' ? 'Service due' : (STATE_LABEL[r.status] ?? r.status)} />,
            },
            { key: 'lastQcAt', header: 'Last QC', mono: true, render: (r) => fmtDate(r.lastQcAt) },
            { key: 'nextServiceDue', header: 'Next service', mono: true, render: (r) => fmtDate(r.nextServiceDue) },
            { key: 'studiesToday', header: 'Studies today', align: 'right' },
            { key: 'uptime30dPercent', header: 'Uptime 30 d', align: 'right', render: (r) => `${r.uptime30dPercent}%` },
            {
              key: 'actions',
              header: <span className="cf-sr">Actions</span>,
              render: (r) => (
                <span className="rt-row" style={{ flexWrap: 'nowrap' }}>
                  <Button size="sm" variant="outline" onClick={() => setStatusFor(r)} aria-label={`Change status of ${r.name}`}>
                    Status
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEventFor(r)} aria-label={`Log an event for ${r.name}`}>
                    Log event
                  </Button>
                </span>
              ),
            },
          ]}
          rows={rooms}
          empty="No rooms set up for this hospital."
        />
      </Card>

      <section className="rt-grid rt-g2">
        {warn.map((r) => (
          <Alert key={r.id} tone="warning" title={`${r.name} · service or calibration due`}>
            Next service {fmtDate(r.nextServiceDue)}. Studies can continue meanwhile.
          </Alert>
        ))}
        {down.map((r) => (
          <Alert key={r.id} tone="danger" title={`${r.name} is ${r.status === 'maintenance' ? 'in maintenance' : 'down'}`}>
            {r.outOfServiceReason ?? 'No reason recorded.'}
          </Alert>
        ))}
      </section>

      <Card title="Recent equipment events" titleAs="h2">
        {events.length === 0 ? (
          <EmptyState title="No events in the last 30 days" />
        ) : (
          <div className="rt-feed">
            {events.slice(0, 12).map((e) => (
              <div key={e.id} className="rt-fe">
                <span className="rt-fe-t">{fmtDateTime(e.startsAt ?? e.dueOn)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ color: 'var(--ink)', fontSize: 14 }}>
                    {roomName(e.roomId)} · {KIND_LABEL[e.kind] ?? e.kind}
                  </strong>
                  <div className="rt-muted">{e.note ?? (e.dueOn ? `Due ${fmtDate(e.dueOn)}` : '')}</div>
                </div>
                {e.endsAt ? <Badge tone="success">Closed</Badge> : e.kind === 'downtime' ? <Badge tone="danger">Open</Badge> : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <StatusModal room={statusFor} onClose={() => setStatusFor(null)} />
      <EventModal room={eventFor} onClose={() => setEventFor(null)} />
    </div>
  )
}

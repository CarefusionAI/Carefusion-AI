import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRooms, useWorklist, useAcceptOrder, useRejectOrder } from '../../../api/radiology'
import type { WorklistRow } from '../../../api/radiology'
import { useAuth } from '../../../context/AuthContext'
import { useEvents } from '../../../hooks/useEvents'
import { Badge, Button, Card, EmptyState, PageHeader, StatCard } from '../../../components/ui'
import { ConfirmModal, ListSkeleton, LoadError } from '../../../components/ClinicalBits'
import HandoverPanel from './HandoverPanel'
import { MODALITY_LABEL, PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, fmtMinutes, fmtTime, modClass } from './util'

function greeting(): string {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function RoomLed({ status }: { status: string }) {
  const cls = status === 'ok' ? 'ok' : 'bad'
  return <span className={`rt-led ${cls}${status === 'ok' ? ' rt-pulse' : ''}`} aria-hidden="true" />
}

export default function WorklistSection({
  firstName,
  meId,
  onOpenStudy,
  onGo,
}: {
  firstName: string
  meId: string | undefined
  onOpenStudy: (studyId: string) => void
  onGo: (section: string) => void
}) {
  const { user } = useAuth()
  const wl = useWorklist()
  const rooms = useRooms()
  const { events } = useEvents(user?.role)
  const accept = useAcceptOrder()
  const reject = useRejectOrder()
  const [mod, setMod] = useState('all')
  const [pending, setPending] = useState<WorklistRow | null>(null)
  const [declining, setDeclining] = useState(false)

  const rows = wl.data?.studies ?? []
  const mods = ['all', ...Array.from(new Set(rows.map((r) => r.modality)))]
  const visible = rows.filter((r) => mod === 'all' || r.modality === mod)
  const k = wl.data?.kpis

  function open(r: WorklistRow) {
    if (r.studyId) onOpenStudy(r.studyId)
    else setPending(r)
  }

  function closePending() {
    accept.reset()
    reject.reset()
    setPending(null)
    setDeclining(false)
  }

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

  return (
    <div className="rt-page">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        subtitle={k ? `${today} · ${rows.length} studies in the queue · ${k.statInQueue} marked STAT` : today}
        actions={
          <Button variant="primary" onClick={() => onGo('upload')}>
            Upload images to an order
          </Button>
        }
      />

      {wl.isError ? <LoadError error={wl.error} onRetry={() => wl.refetch()} /> : null}

      <section className="rt-grid rt-g4" aria-label="Today">
        {wl.isLoading ? (
          Array.from({ length: 4 }, (_, i) => <ListSkeleton key={i} rows={1} height={104} label="Loading figures" />)
        ) : k ? (
          <>
            <StatCard label="Waiting" value={k.waiting} hint={k.waiting ? `Oldest: ${fmtMinutes(k.oldestWaitingMinutes)}` : 'Nothing waiting'} tone="peach" />
            <StatCard label="In progress" value={k.inProgress} hint={`${k.scheduled} scheduled`} />
            <StatCard label="Completed today" value={k.completedToday} hint={`${k.awaitingReport} awaiting report`} tone="sage" />
            <StatCard label="Avg turnaround" value={k.avgTurnaroundMinutes === null ? '—' : fmtMinutes(k.avgTurnaroundMinutes)} hint="Last 7 days" tone="blue" />
          </>
        ) : null}
      </section>

      <section className="rt-grid rt-gm">
        <Card
          title="Imaging worklist"
          titleAs="h2"
          actions={
            <div className="rt-flt" role="group" aria-label="Filter by modality">
              {mods.map((m) => (
                <button key={m} type="button" className="rt-fb" aria-pressed={mod === m} onClick={() => setMod(m)}>
                  {m === 'all' ? 'All' : (MODALITY_LABEL[m] ?? m)}
                </button>
              ))}
            </div>
          }
        >
          {wl.isLoading ? (
            <ListSkeleton rows={5} height={66} label="Loading worklist" />
          ) : visible.length === 0 ? (
            <EmptyState title="No studies to show">{mod === 'all' ? 'New imaging orders from doctors appear here.' : 'No studies for this modality. Try All.'}</EmptyState>
          ) : (
            <div className="rt-wl">
              {visible.map((r) => {
                const hot = r.priority !== 'routine'
                return (
                  <button
                    key={r.orderId}
                    type="button"
                    className="rt-wi"
                    onClick={() => open(r)}
                    aria-label={`Open ${r.bodyPart} for ${r.patientName}, ${STATUS_LABEL[r.status] ?? r.status}${r.studyId ? '' : ', new order'}`}
                  >
                    <span className={`rt-mod ${modClass(r.modality)}`}>{MODALITY_LABEL[r.modality] ?? r.modality}</span>
                    <span style={{ minWidth: 0 }}>
                      <strong className={`rt-title${hot ? ' is-hot' : ''}`}>
                        {r.bodyPart}
                        {hot ? <span className="rt-flagp">⚑ {PRIORITY_LABEL[r.priority]}</span> : null}
                        {!r.studyId ? <span className="rt-src">New order</span> : null}
                      </strong>
                      <span className="rt-muted">
                        {r.patientName}
                        {r.age !== null ? ` · ${r.age}${r.sex ? ` ${r.sex[0]?.toUpperCase()}` : ''}` : ''} · {r.orderRef} · {r.orderedBy}
                      </span>
                    </span>
                    <Badge tone={PRIORITY_TONE[r.priority] ?? 'neutral'}>{PRIORITY_LABEL[r.priority] ?? r.priority}</Badge>
                    <span className="rt-right">
                      <Badge tone={STATUS_TONE[r.status] ?? 'neutral'} dot>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                      <span className="rt-muted rt-mono" style={{ display: 'block', marginTop: 4 }}>
                        {r.scheduledFor ? fmtTime(r.scheduledFor) : `waiting ${fmtMinutes(r.waitingMinutes)}`}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <div className="rt-col">
          <Card
            title="Rooms right now"
            titleAs="h2"
            actions={
              <button type="button" className="rt-lk" onClick={() => onGo('equipment')}>
                Equipment
              </button>
            }
          >
            {rooms.isLoading ? (
              <ListSkeleton rows={4} height={58} label="Loading rooms" />
            ) : rooms.isError ? (
              <LoadError error={rooms.error} onRetry={() => rooms.refetch()} />
            ) : (
              <div className="rt-stack" style={{ gap: 10 }}>
                {(rooms.data ?? []).map((r) => (
                  <div key={r.id} className="rt-eq">
                    <RoomLed status={r.status} />
                    <div>
                      <strong>{r.name}</strong>
                      <div className="rt-muted">{r.status !== 'ok' ? (r.outOfServiceReason ?? 'Out of service') : (r.nowScanning ?? 'Free')}</div>
                    </div>
                    {r.status !== 'ok' ? <Badge tone="danger">{r.status === 'down' ? 'Down' : 'Maintenance'}</Badge> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Connected apps" titleAs="h2" actions={<Badge tone="success" dot>Live</Badge>}>
            <div className="rt-feed" aria-live="polite">
              {events.length === 0 ? (
                <p className="rt-muted">No messages from other apps yet.</p>
              ) : (
                events.slice(0, 3).map((e) => (
                  <div key={e.id} className="rt-fe">
                    <span className="rt-fe-t">{e.at}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ color: 'var(--ink)', fontSize: 14 }}>{e.title}</strong>
                      <div className="rt-muted">{e.text}</div>
                    </div>
                    {e.href ? <Link to={e.href}>Open</Link> : null}
                  </div>
                ))
              )}
            </div>
            <p className="rt-muted" style={{ marginTop: 10 }}>
              Studies open only from a doctor's imaging order. Results you send reach the doctor; the patient sees them after the doctor reviews.
            </p>
          </Card>
        </div>
      </section>

      <section className="rt-grid rt-g2">
        <Card title="Workload today" titleAs="h2">
          {k ? (
            <div className="rt-stack">
              {Object.entries(k.byModality).map(([m, v]) => {
                const total = v.done + v.pending || 1
                const dw = Math.round((v.done / total) * 100)
                return (
                  <div key={m} className="rt-wk">
                    <strong style={{ color: 'var(--ink)' }}>{MODALITY_LABEL[m] ?? m}</strong>
                    <div className="rt-wk-b" role="img" aria-label={`${MODALITY_LABEL[m] ?? m}: ${v.done} completed, ${v.pending} pending`}>
                      <span className="rt-wk-d" style={{ width: `${dw}%` }} />
                      <span className="rt-wk-p" style={{ width: `${100 - dw}%` }} />
                    </div>
                    <span className="rt-wk-l">
                      {v.done} done · {v.pending} left
                    </span>
                  </div>
                )
              })}
              <div className="rt-lg">
                <span>
                  <i className="rt-sw" style={{ background: 'var(--primary)' }} />
                  Completed
                </span>
                <span>
                  <i className="rt-sw rt-wk-p" />
                  Pending (striped)
                </span>
              </div>
              <dl className="rt-kv">
                <div>
                  <dt>STAT in queue</dt>
                  <dd className={k.statInQueue ? 'bad' : 'good'}>{k.statInQueue}</dd>
                </div>
                <div>
                  <dt>Rooms up</dt>
                  <dd>{rooms.data ? rooms.data.filter((r) => r.status === 'ok').map((r) => r.name).join(', ') || 'None' : '—'}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <ListSkeleton rows={3} label="Loading workload" />
          )}
        </Card>
        <HandoverPanel meId={meId} />
      </section>

      <ConfirmModal
        open={!!pending}
        title={declining ? 'Decline this imaging order?' : 'New imaging order'}
        confirmLabel={declining ? 'Decline order' : 'Accept and open'}
        reasonLabel={declining ? 'Reason for declining' : undefined}
        danger={declining}
        busy={accept.isPending || reject.isPending}
        error={accept.error ?? reject.error}
        onClose={closePending}
        onConfirm={(reason) => {
          if (!pending) return
          if (declining) reject.mutate({ orderId: pending.orderId, reason }, { onSuccess: closePending })
          else accept.mutate(pending.orderId, { onSuccess: (r) => { closePending(); onOpenStudy(r.studyId) } })
        }}
      >
        {pending ? (
          <>
            <p style={{ margin: 0 }}>
              <strong>{pending.bodyPart}</strong> for {pending.patientName} ({pending.orderRef}), ordered by {pending.orderedBy}. Priority: {PRIORITY_LABEL[pending.priority]}.
            </p>
            {!declining ? (
              <p style={{ margin: 0 }}>
                Accepting creates the study so you can schedule or start it.{' '}
                <button type="button" className="rt-lk" onClick={() => setDeclining(true)}>
                  Decline instead
                </button>
              </p>
            ) : (
              <p style={{ margin: 0 }}>The ordering doctor is told why. This cannot be undone.</p>
            )}
          </>
        ) : null}
      </ConfirmModal>
    </div>
  )
}

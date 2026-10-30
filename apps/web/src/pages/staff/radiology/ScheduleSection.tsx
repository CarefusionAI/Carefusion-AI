import { useState } from 'react'
import { useRadColleagues, useSchedule, useWorklist } from '../../../api/radiology'
import type { RoomSlot } from '../../../api/radiology'
import { Avatar, Badge, Card, EmptyState, PageHeader, TextField, Button } from '../../../components/ui'
import { ListSkeleton, LoadError } from '../../../components/ClinicalBits'
import ScheduleModal from './ScheduleModal'
import { MODALITY_LABEL, PRIORITY_LABEL, PRIORITY_TONE, fmtTime, modClass } from './util'

const DEMO_DAY = '2026-10-17'

function istHour(iso: string | null): number {
  if (!iso) return 0
  return Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })) % 24
}

export default function ScheduleSection({ fullName, onOpenStudy }: { fullName: string; onOpenStudy: (id: string) => void }) {
  const [date, setDate] = useState<string | null>(null)
  const q = useSchedule(date)
  const wl = useWorklist()
  const colleagues = useRadColleagues()
  const [booking, setBooking] = useState<{ studyId: string; modality: string; label: string } | null>(null)

  if (q.isLoading) {
    return (
      <div className="rt-page">
        <PageHeader title="Today's schedule" subtitle="Booked slots by room" />
        <ListSkeleton rows={5} height={52} label="Loading schedule" />
      </div>
    )
  }
  if (q.isError || !q.data) return <LoadError error={q.error} onRetry={() => q.refetch()} />

  const s = q.data
  const allSlots = s.rooms.flatMap((r) => r.slots)
  const hours = allSlots.map((x) => istHour(x.startsAt))
  const from = Math.min(9, ...(hours.length ? hours : [9]))
  const to = Math.max(16, ...(hours.length ? hours : [16]))
  const rows = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const booked = allSlots.filter((x) => x.studyId || !/lunch/i.test(x.label ?? '')).length
  const unscheduled = (wl.data?.studies ?? []).filter((x) => x.studyId && x.status === 'waiting')
  const downRooms = s.rooms.filter((r) => r.status !== 'ok')
  const affected = (wl.data?.studies ?? []).filter((x) => x.room && downRooms.some((r) => r.name === x.room) && ['scheduled', 'waiting'].includes(x.status))
  const dateLabel = new Date(`${s.date}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

  function slotCell(slot: RoomSlot) {
    const label = slot.label ?? slot.bodyPart ?? 'Booked'
    const body = (
      <>
        <b>{label}</b>
        {slot.patientName ?? (slot.studyStatus ? '' : 'Booked slot')}
        <span className="rt-mono" style={{ display: 'block' }}>
          {fmtTime(slot.startsAt)}–{fmtTime(slot.endsAt)}
        </span>
      </>
    )
    const cls = /lunch/i.test(label) ? 'rt-sl is-free' : `rt-sl ${modClass(/ct/i.test(label) ? 'CT' : /mri/i.test(label) ? 'MRI' : /usg|obstet|pelvis|thyroid/i.test(label) ? 'USG' : 'XR')}`
    return slot.studyId ? (
      <button key={slot.id} type="button" className={cls} onClick={() => onOpenStudy(slot.studyId!)} aria-label={`Open ${label}${slot.patientName ? ` for ${slot.patientName}` : ''}`}>
        {body}
      </button>
    ) : (
      <span key={slot.id} className={cls}>
        {body}
      </span>
    )
  }

  return (
    <div className="rt-page">
      <PageHeader
        title="Schedule"
        subtitle={`${dateLabel} · booked slots by room`}
        actions={
          <>
            <TextField label="Date" type="date" value={s.date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <Button variant="outline" size="sm" onClick={() => setDate(DEMO_DAY)}>
              17 Oct (demo day)
            </Button>
            <Badge tone="teal">
              {booked} booked · {s.unscheduledStudies} waiting for a slot
            </Badge>
          </>
        }
      />

      <Card>
        {allSlots.length === 0 ? (
          <EmptyState title="Nothing booked on this date">Pick another date, or book a waiting study from the list below.</EmptyState>
        ) : null}
        <div className="rt-sched-wrap" tabIndex={0} aria-label="Schedule by room and time, scrollable">
          <table className="rt-sched">
            <caption className="cf-sr">Schedule by room and time</caption>
            <thead>
              <tr>
                <th scope="col" className="rt-tm">
                  <span className="cf-sr">Time</span>
                </th>
                {s.rooms.map((r) => (
                  <th key={r.id} scope="col">
                    {r.name}
                    {r.status !== 'ok' ? <div className="rt-muted">Out of service</div> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h}>
                  <th scope="row" className="rt-tm">
                    {String(h).padStart(2, '0')}:00
                  </th>
                  {s.rooms.map((r) => {
                    const here = r.slots.filter((x) => istHour(x.startsAt) === h)
                    return (
                      <td key={r.id}>
                        {here.length ? (
                          here.map(slotCell)
                        ) : r.status !== 'ok' ? (
                          <span className="rt-sl is-down">Out of service</span>
                        ) : (
                          <span className="rt-sl is-free">Free</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="rt-grid rt-g2">
        <Card title="Waiting for a slot" titleAs="h2">
          {wl.isLoading ? (
            <ListSkeleton rows={2} label="Loading studies" />
          ) : unscheduled.length === 0 ? (
            <EmptyState title="Every accepted study has a slot or is under way" />
          ) : (
            <div className="rt-stack" style={{ gap: 10 }}>
              {unscheduled.map((u) => (
                <div key={u.orderId} className="rt-eq">
                  <span className={`rt-mod ${modClass(u.modality)}`} style={{ width: 54 }}>
                    {MODALITY_LABEL[u.modality] ?? u.modality}
                  </span>
                  <div>
                    <strong>
                      {u.bodyPart} · {u.patientName}
                    </strong>
                    <div className="rt-muted">
                      {u.orderRef} · <Badge tone={PRIORITY_TONE[u.priority] ?? 'neutral'}>{PRIORITY_LABEL[u.priority]}</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="soft" onClick={() => setBooking({ studyId: u.studyId!, modality: u.modality, label: `${u.bodyPart} · ${u.patientName}` })}>
                    Book slot
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="rt-col">
          {downRooms.length ? (
            <Card title="Moved because of downtime" titleAs="h2">
              <div className="rt-stack" style={{ gap: 10 }}>
                {downRooms.map((r) => (
                  <p key={r.id} className="rt-muted">
                    <strong style={{ color: 'var(--ink)' }}>{r.name}</strong>: {r.outOfServiceReason ?? 'out of service'}
                  </p>
                ))}
                {affected.map((a) => (
                  <div key={a.orderId} className="rt-eq">
                    <span className="rt-mod rt-m-mri" style={{ width: 54 }}>
                      {MODALITY_LABEL[a.modality] ?? a.modality}
                    </span>
                    <div>
                      <strong>
                        {a.bodyPart} · {a.patientName}
                      </strong>
                      <div className="rt-muted">{a.scheduledFor ? `Now ${new Date(a.scheduledFor).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}` : 'Needs a new slot'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          <Card title="Team on shift" titleAs="h2">
            <div className="rt-stack" style={{ gap: 10 }}>
              <div className="rt-eq">
                <Avatar name={fullName} size={32} />
                <div>
                  <strong>{fullName} (you)</strong>
                  <div className="rt-muted">Radiology technician</div>
                </div>
              </div>
              {(colleagues.data ?? []).map((c) => (
                <div key={c.userId} className="rt-eq">
                  <Avatar name={c.name} size={32} />
                  <div>
                    <strong>{c.name}</strong>
                    <div className="rt-muted">Radiology colleague</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <ScheduleModal open={!!booking} onClose={() => setBooking(null)} study={booking} />
    </div>
  )
}

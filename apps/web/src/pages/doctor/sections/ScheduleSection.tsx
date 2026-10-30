import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, Button, Select, StatCard, Switch } from '../../../components/ui'
import type { BadgeTone } from '../../../components/ui'
import { useDoctorHome, useSchedule, useUpdateProfile, useUpdateQueue } from '../../../api/doctor'
import type { ScheduleAppointment } from '../../../api/doctor'
import { Box, ConfirmModal, ErrorNote, Header, Loading, sectionHref } from '../parts'
import { fmtLongDate } from '../format'

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  booked: { label: 'Booked', tone: 'neutral' },
  checked_in: { label: 'Checked in', tone: 'info' },
  waiting: { label: 'Waiting', tone: 'warning' },
  in_consultation: { label: 'In room', tone: 'success' },
  done: { label: 'Seen', tone: 'success' },
  no_show: { label: 'No-show', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}
const KIND: Record<string, string> = { op: 'OP', walk_in: 'Walk-in', teleconsult: 'Teleconsult' }
const BLOCK: Record<string, string> = { op_clinic: 'OP clinic', teleconsult: 'Teleconsult', ward_round: 'Ward round', procedure: 'Procedure' }

export default function ScheduleSection() {
  const sched = useSchedule()
  const home = useDoctorHome()
  const update = useUpdateQueue()
  const profile = useUpdateProfile()
  const navigate = useNavigate()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [noShow, setNoShow] = useState<ScheduleAppointment | null>(null)

  if (sched.isLoading) return <Loading lines={8} />
  if (sched.isError || !sched.data) return <ErrorNote error={sched.error} title="Could not load the schedule" />
  const d = sched.data
  const next = home.data?.nextUp
  const openable = (a: ScheduleAppointment) => a.status === 'checked_in' || a.status === 'waiting'

  return (
    <div className="dr-page">
      <Header
        title="Schedule"
        subtitle={`${fmtLongDate(d.date)} · bookings from the citizen app land here automatically.`}
        actions={
          <div className="dr-seg" role="group" aria-label="Schedule view">
            <button type="button" className={view === 'day' ? 'on' : ''} aria-pressed={view === 'day'} onClick={() => setView('day')}>
              Today
            </button>
            <button type="button" className={view === 'week' ? 'on' : ''} aria-pressed={view === 'week'} onClick={() => setView('week')}>
              Week
            </button>
          </div>
        }
      />
      <section className="dr-grid dr-g4" aria-label="Schedule numbers">
        <StatCard label="Booked today" value={d.stats.bookedToday} unit="slots" hint={`${d.stats.teleconsults} teleconsult${d.stats.teleconsults === 1 ? '' : 's'}`} tone="blue" />
        <StatCard label="Checked in" value={d.stats.checkedIn} unit="waiting" tone="sage" />
        <StatCard label="No-shows" value={d.stats.noShows} tone="peach" />
        <StatCard label="From citizen app" value={d.stats.fromCitizenApp} unit="bookings" />
      </section>

      {view === 'day' ? (
        <section className="dr-grid dr-s21">
          <Box title="Today's appointments">
            <div className="dr-stack" style={{ gap: 10 }}>
              {d.appointments.length === 0 ? <p className="dr-muted">No appointments.</p> : null}
              {d.appointments.map((a) => {
                const st = STATUS[a.status] ?? { label: a.status, tone: 'neutral' as BadgeTone }
                const cls = a.status === 'done' ? 'done' : a.status === 'no_show' ? 'miss' : a.visitId === next?.visitId ? 'next' : ''
                return (
                  <div key={a.visitId} className={`dr-slot ${cls}`}>
                    <span className="tm">{a.time}</span>
                    <div style={{ minWidth: 0 }}>
                      <strong className="dr-strong">{a.patientName}</strong>
                      <div className="dr-muted">
                        {a.meta} &middot; {KIND[a.kind] ?? a.kind}
                        {a.bookingRef ? ` · ${a.bookingRef}` : ''}
                      </div>
                    </div>
                    <div className="dr-wrap">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {openable(a) ? (
                        <>
                          <button type="button" className="dr-link" onClick={() => navigate(sectionHref('open', { visit: a.visitId }))} aria-label={`Open ${a.patientName} with key`}>
                            Open
                          </button>
                          <button type="button" className="dr-link" onClick={() => setNoShow(a)} aria-label={`Mark ${a.patientName} as no-show`}>
                            No-show
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
            <ErrorNote error={update.error} />
          </Box>
          <div className="dr-col">
            {next ? (
              <Box title={`Up next · token ${next.token}`} tone="blue">
                <div className="dr-wrap" style={{ flexWrap: 'nowrap' }}>
                  <Avatar name={next.patientName} size={44} />
                  <div>
                    <strong className="dr-strong">{next.patientName}</strong>
                    <div className="dr-muted">{next.meta}</div>
                  </div>
                </div>
                <Button onClick={() => navigate(sectionHref('open', { visit: next.visitId }))}>Call in and open with key</Button>
              </Box>
            ) : null}
            <Box title="Availability">
              <Switch
                label="Accept walk-in patients"
                description="Front desk can add walk-ins to your queue."
                checked={d.availability.acceptsWalkin}
                disabled={profile.isPending}
                onChange={(v) => profile.mutate({ acceptsWalkin: v })}
              />
              <Switch
                label="Offer teleconsults"
                description="Citizens can book teleconsult slots."
                checked={d.availability.offersTeleconsult}
                disabled={profile.isPending}
                onChange={(v) => profile.mutate({ offersTeleconsult: v })}
              />
              <Select
                label="Upcoming leave"
                options={d.availability.upcomingLeave.length ? d.availability.upcomingLeave : ['No leave booked']}
                disabled={d.availability.upcomingLeave.length === 0}
                helper="Leave is arranged with the hospital admin (read only here)."
              />
              <ErrorNote error={profile.error} />
            </Box>
          </div>
        </section>
      ) : (
        <Box title="This week">
          <div className="dr-wrap dr-muted">
            <span>Bar colour: </span>
            {Object.entries(BLOCK).map(([k, v]) => (
              <span key={k}>
                &#9612; {v}
              </span>
            ))}
          </div>
          <div className="dr-wk">
            {d.week.map((day) => (
              <div key={day.date} className={`d${day.date === d.date ? ' today' : ''}`}>
                <strong className="dr-strong">{day.weekday}</strong>
                <span className="dr-muted">
                  {day.patients} seen · {day.booked} booked
                </span>
                {day.blocks.length === 0 ? <span className="dr-muted">No clinic</span> : null}
                {day.blocks.map((b) => (
                  <div key={b.id} className={`ev ${b.type}`}>
                    <strong>
                      {b.from}–{b.to}
                    </strong>
                    <br />
                    {BLOCK[b.type] ?? b.type}
                    {b.location ? ` · ${b.location}` : ''}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Box>
      )}

      <ConfirmModal
        open={noShow !== null}
        title="Mark as no-show?"
        onClose={() => setNoShow(null)}
        confirmLabel="Mark no-show"
        danger
        busy={update.isPending}
        onConfirm={() => noShow && update.mutate({ visitId: noShow.visitId, status: 'no_show' }, { onSuccess: () => setNoShow(null) })}
        error={update.error}
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          {noShow?.patientName} is removed from today's waiting list and counted as a no-show. The front desk and the patient's app show the visit as missed. You can put them back to waiting from the front desk.
        </p>
      </ConfirmModal>
    </div>
  )
}

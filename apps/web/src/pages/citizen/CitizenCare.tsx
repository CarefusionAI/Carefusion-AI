import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { AppointmentDto, BookAppointmentResponse, ProviderDto, SlotDto } from '@carefusion/shared'
import { Avatar, Badge, Button, EmptyState, Modal, PageHeader, Select, Skeleton, Switch } from '../../components/ui'
import {
  errorText,
  useAppointments,
  useBookAppointment,
  useCancelAppointment,
  usePastVisits,
  useProviders,
  useProfileLite,
  useSlots,
} from '../../api/citizen2'
import type { ProviderFilters } from '../../api/citizen2'
import { Box, ErrorBox, fmtDD, fmtMon, fmtTime, fmtWd, fmtWhen, pluralize, useToast, ymd } from './c2kit'
import './citizen2.css'

const FILTERS: { id: string; label: string; apply: ProviderFilters }[] = [
  { id: 'all', label: 'All', apply: {} },
  { id: 'govt', label: 'Government', apply: { type: 'govt' } },
  { id: 'private', label: 'Private', apply: { type: 'private' } },
  { id: 'walkin', label: 'Walk-in today', apply: { walkIn: true } },
  { id: 'tele', label: 'Telemedicine', apply: { telemedicine: true } },
]

const REASONS: { label: string; visitType: 'new' | 'follow_up' | 'review' }[] = [
  { label: 'Follow-up visit', visitType: 'follow_up' },
  { label: 'New problem', visitType: 'new' },
  { label: 'Test results', visitType: 'review' },
  { label: 'Prescription refill', visitType: 'follow_up' },
  { label: 'Certificate', visitType: 'new' },
]

const LANG: Record<string, string> = { ml: 'മലയാളം', en: 'English', hi: 'हिन्दी', ta: 'தமிழ்', kn: 'ಕನ್ನಡ', te: 'తెలుగు' }

function feeText(p: ProviderDto): string {
  if (p.ownership === 'govt') return 'Free OP'
  return p.feeAmount && p.feeAmount > 0 ? `₹${p.feeAmount}` : 'Fee at hospital'
}

function ownerLabel(p: ProviderDto): string {
  return p.ownership === 'govt' ? 'Government' : 'Private'
}

/** Step shown under the next booking: requested, confirmed, completed. */
function stageOf(a: AppointmentDto): number {
  if (a.status === 'completed') return 3
  if (a.status === 'confirmed') return 2
  return 1
}

const PIN_SPOTS = [
  [38, 30],
  [62, 62],
  [22, 70],
  [78, 24],
  [55, 18],
  [30, 48],
  [70, 40],
  [48, 78],
]

export default function CitizenCareScreen() {
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [selId, setSelId] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [reason, setReason] = useState(REASONS[0]!.label)
  const [shareKey, setShareKey] = useState(true)
  const [booked, setBooked] = useState<BookAppointmentResponse | null>(null)
  const [cancelTarget, setCancelTarget] = useState<AppointmentDto | null>(null)
  const toast = useToast()

  const filters = useMemo<ProviderFilters>(() => ({ q: q || undefined, ...FILTERS.find((f) => f.id === filter)!.apply }), [q, filter])
  const providers = useProviders(filters)
  const profile = useProfileLite()
  const upcoming = useAppointments('upcoming')
  const past = usePastVisits()
  const book = useBookAppointment()
  const cancel = useCancelAppointment()

  const list = providers.data ?? []
  const sel = list.find((p) => p.doctorUserId === selId) ?? list[0]
  const slots = useSlots(sel?.doctorUserId)

  const days = useMemo(() => {
    const by = new Map<string, SlotDto[]>()
    for (const s of slots.data ?? []) {
      const k = ymd(s.startsAt)
      by.set(k, [...(by.get(k) ?? []), s])
    }
    return [...by.entries()].slice(0, 5).map(([k, v]) => ({ key: k, first: v[0]!.startsAt, slots: v }))
  }, [slots.data])

  // Keep the picked day and slot valid when the doctor or the slot list changes.
  useEffect(() => {
    if (days.length === 0) {
      setDay(null)
      setSlotId(null)
      return
    }
    if (!day || !days.some((d) => d.key === day)) {
      setDay(days[0]!.key)
      setSlotId(null)
    }
  }, [days, day])

  const dayRow = days.find((d) => d.key === day)
  const slot = dayRow?.slots.find((s) => s.slotId === slotId)

  useEffect(() => {
    if (dayRow && !slot) {
      const free = dayRow.slots.find((s) => !s.full)
      if (free) setSlotId(free.slotId)
    }
  }, [dayRow, slot])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    setQ(qInput.trim())
    setSelId(null)
  }

  function onBook() {
    if (!slot) return
    const r = REASONS.find((x) => x.label === reason) ?? REASONS[0]!
    book.mutate(
      { slotId: slot.slotId, reason: r.label, visitType: r.visitType, shareKeyAtCheckIn: shareKey },
      {
        onSuccess: (res) => setBooked(res),
        onError: (e) => toast.show('Could not book', errorText(e)),
      },
    )
  }

  function onCancel() {
    if (!cancelTarget) return
    cancel.mutate(
      { id: cancelTarget.id },
      {
        onSuccess: () => {
          toast.show('Appointment cancelled', `${cancelTarget.bookingRef} · the doctor's queue is updated`)
          setCancelTarget(null)
        },
        onError: (e) => {
          toast.show('Could not cancel', errorText(e))
          setCancelTarget(null)
        },
      },
    )
  }

  const districtName = profile.data?.profile.district?.name
  const next = upcoming.data?.[0]
  const nextStage = next ? stageOf(next) : 0

  return (
    <div className="c2-page">
      <PageHeader
        eyebrow="Health"
        title="Find care & appointments"
        subtitle="Government OPs are free. Booking holds your token — pay any fees at the hospital."
      />

      <section className="c2-hero c2-in" aria-label="Search">
        <svg aria-hidden="true" viewBox="0 0 64 64" width="260" height="260" style={{ position: 'absolute', right: -40, top: -70, opacity: 0.1 }}>
          <rect x="21" y="5" width="18" height="50" rx="9" fill="#3a726d" />
          <rect x="9" y="25" width="50" height="18" rx="9" fill="#3a726d" />
        </svg>
        <form className="c2-sbar" onSubmit={onSearch} role="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ marginLeft: 8 }}>
            <path d="M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM21 21l-5-5" />
          </svg>
          <label htmlFor="c2-care-q" className="cf-sr">
            Search doctors, hospitals or specialities
          </label>
          <input id="c2-care-q" placeholder="Doctor, hospital or speciality" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <span className="c2-where">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" />
            </svg>
            {districtName ?? 'Near you'} · nearest first
          </span>
          <Button type="submit">Search</Button>
        </form>
        <div className="c2-chips" role="group" aria-label="Filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`c2-chip c2-chip-hero${filter === f.id ? ' on' : ''}`}
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id)
                setSelId(null)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <div className="c2-lay c2-in c2-d1">
        <section className="c2-box" aria-label="Results">
          <div className="c2-bh">
            <h2 className="c2-bt">{providers.isSuccess ? `${pluralize(list.length, 'place')} near you` : 'Places near you'}</h2>
            <span className="c2-muted">Sorted by distance</span>
          </div>
          {providers.isLoading ? (
            <div role="status" aria-label="Loading doctors" className="c2-skel-box">
              <Skeleton height={64} radius={16} />
              <Skeleton height={64} radius={16} />
              <Skeleton height={64} radius={16} />
            </div>
          ) : providers.isError ? (
            <ErrorBox error={providers.error} onRetry={() => void providers.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState title="No doctors match" icon={undefined}>
              Try a different search or clear the filter.
            </EmptyState>
          ) : (
            <>
              {list.map((p) => {
                const on = p.doctorUserId === sel?.doctorUserId
                return (
                  <button
                    key={p.doctorUserId}
                    type="button"
                    className={`c2-res${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      setSelId(p.doctorUserId)
                      setDay(null)
                      setSlotId(null)
                    }}
                  >
                    <Avatar name={p.name} size={48} />
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ color: 'var(--ink)', display: 'block' }}>{p.name}</strong>
                      <span className="c2-muted">
                        {p.specialisation ?? 'Doctor'} · {p.hospitalName}
                      </span>
                      <span className="c2-tags">
                        <Badge tone={p.ownership === 'govt' ? 'teal' : 'gold'}>{ownerLabel(p)}</Badge>
                        <Badge tone="outline">{p.nextSlotAt ? `Next: ${fmtWd(p.nextSlotAt)} ${fmtTime(p.nextSlotAt)}` : p.acceptsWalkIn ? 'Walk-in' : 'No slots yet'}</Badge>
                        {p.languages.length ? <Badge tone="neutral">{p.languages.map((l) => LANG[l] ?? l).join(' · ')}</Badge> : null}
                        {p.offersTeleconsult ? <Badge tone="info">Telemedicine</Badge> : null}
                      </span>
                    </span>
                    <span className="c2-km">
                      {p.distanceKm === null ? '' : `${p.distanceKm} km`}
                      <br />
                      <span className="c2-muted" style={{ fontWeight: 400 }}>
                        {feeText(p)}
                      </span>
                    </span>
                  </button>
                )
              })}
              <div className="c2-map" role="img" aria-label={`Map showing ${pluralize(list.length, 'place')} near you`}>
                <svg width="100%" height="100%" viewBox="0 0 600 170" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 120 C120 90 200 140 320 100 S520 60 600 80" stroke="#cfe0e9" strokeWidth="18" fill="none" />
                  <path d="M80 0 L140 170 M380 0 L300 170 M0 40 H600" stroke="#faf5ef" strokeWidth="6" />
                </svg>
                <span className="c2-pin me" style={{ left: '46%', top: '52%' }} title="You" />
                {list.slice(0, PIN_SPOTS.length).map((p, i) => (
                  <span key={p.doctorUserId} className="c2-pin" style={{ left: `${PIN_SPOTS[i]![0]}%`, top: `${PIN_SPOTS[i]![1]}%` }} />
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="c2-box c2-sticky" aria-label="Pick a time" style={{ position: 'sticky', top: 16 }}>
          {!sel ? (
            <EmptyState title="Pick a doctor">Choose a result to see free times.</EmptyState>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar name={sel.name} size={44} />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: 'var(--ink)' }}>{sel.name}</strong>
                  <div className="c2-muted">{sel.hospitalName}</div>
                </div>
              </div>
              {slots.isLoading ? (
                <div role="status" aria-label="Loading times" className="c2-skel-box">
                  <Skeleton height={52} radius={12} />
                  <Skeleton lines={3} height={40} />
                </div>
              ) : slots.isError ? (
                <ErrorBox error={slots.error} onRetry={() => void slots.refetch()} />
              ) : days.length === 0 ? (
                <EmptyState title="No free times">{sel.acceptsWalkIn ? 'This doctor sees walk-in patients at the OP.' : 'No slots are open in the next two weeks.'}</EmptyState>
              ) : (
                <>
                  <div className="c2-days" role="group" aria-label="Day">
                    {days.map((d) => (
                      <button key={d.key} type="button" className={`c2-day${d.key === day ? ' on' : ''}`} aria-pressed={d.key === day} onClick={() => { setDay(d.key); setSlotId(null) }}>
                        <i>{fmtWd(d.first)}</i>
                        <b>{fmtDD(d.first)}</b>
                      </button>
                    ))}
                  </div>
                  <div className="c2-muted">Morning OP · token system</div>
                  <div className="c2-slots" role="group" aria-label="Time">
                    {(dayRow?.slots ?? []).map((s) => (
                      <button
                        key={s.slotId}
                        type="button"
                        className={`c2-slotb${s.full ? ' off' : s.slotId === slotId ? ' on' : ''}`}
                        aria-pressed={s.slotId === slotId}
                        aria-disabled={s.full}
                        title={s.full ? 'Full' : `Token ${s.tokenPreview}`}
                        onClick={() => { if (!s.full) setSlotId(s.slotId) }}
                      >
                        {fmtTime(s.startsAt)}
                      </button>
                    ))}
                  </div>
                  <Select label="Reason for visit" options={REASONS.map((r) => r.label)} value={reason} onChange={setReason} />
                  <Switch label="Share my key at check-in" description="Opens a 30-minute session when you arrive" checked={shareKey} onChange={setShareKey} />
                  <Button size="lg" onClick={onBook} disabled={!slot} loading={book.isPending}>
                    {slot ? `Book ${fmtWd(slot.startsAt)} ${fmtTime(slot.startsAt)}` : 'Pick a time'}
                  </Button>
                </>
              )}
            </>
          )}
        </aside>
      </div>

      <section className="c2-grid c2-g2 c2-in c2-d3">
        <div className="c2-box">
          <div className="c2-bh">
            <h2 className="c2-bt">Upcoming</h2>
            <Badge tone="info">{upcoming.data ? `${upcoming.data.length} booked` : '…'}</Badge>
          </div>
          {upcoming.isLoading ? (
            <div role="status" aria-label="Loading appointments" className="c2-skel-box">
              <Skeleton height={56} radius={12} />
            </div>
          ) : upcoming.isError ? (
            <ErrorBox error={upcoming.error} onRetry={() => void upcoming.refetch()} />
          ) : (upcoming.data ?? []).length === 0 ? (
            <EmptyState title="Nothing booked">Pick a doctor above to book your next visit.</EmptyState>
          ) : (
            <div>
              {upcoming.data!.map((a) => (
                <div className="c2-row" key={a.id}>
                  <span className="c2-dt" style={{ background: 'var(--tint-blue)', color: 'var(--info)' }}>
                    <b>{fmtDD(a.startsAt)}</b>
                    <i>{fmtMon(a.startsAt)}</i>
                  </span>
                  <div className="c2-grow">
                    <strong style={{ color: 'var(--ink)' }}>
                      {a.doctorName ?? 'Doctor'} · {a.reason ?? 'Visit'}
                    </strong>
                    <div className="c2-muted">
                      {fmtTime(a.startsAt)} · {a.hospitalName}
                      {a.tokenNo ? ` · token ${a.tokenNo}` : ''}
                    </div>
                  </div>
                  <Badge tone={a.status === 'confirmed' ? 'success' : 'info'}>{a.status === 'confirmed' ? 'Confirmed' : 'Requested'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setCancelTarget(a)} aria-label={`Cancel appointment ${a.bookingRef}`}>
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          )}
          {next ? (
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div className="c2-bh">
                <h3 className="c2-bt" style={{ fontSize: 14 }}>
                  {fmtWd(next.startsAt)} {fmtDD(next.startsAt)} {fmtMon(next.startsAt)} · {next.doctorName ?? 'Doctor'}
                </h3>
                <span className="c2-muted">Step {nextStage} of 3</span>
              </div>
              <ol aria-label="Booking progress" className="c2-steps3">
                <li className={nextStage >= 1 ? 'done' : ''}>✓ Requested</li>
                <li className={nextStage >= 2 ? 'done' : ''}>{nextStage >= 2 ? '✓ ' : ''}Confirmed</li>
                <li className={nextStage >= 3 ? 'done' : ''}>Completed</li>
              </ol>
              <p className="c2-muted" style={{ margin: 0 }}>
                Show your key at the OP desk — the doctor opens your record only then.
              </p>
            </div>
          ) : null}
        </div>

        <div className="c2-box">
          <div className="c2-bh">
            <h2 className="c2-bt">Past visits</h2>
            <span className="c2-muted">Last 6 months</span>
          </div>
          {past.isLoading ? (
            <div role="status" aria-label="Loading visits" className="c2-skel-box">
              <Skeleton lines={4} height={44} />
            </div>
          ) : past.isError ? (
            <ErrorBox error={past.error} onRetry={() => void past.refetch()} />
          ) : (past.data ?? []).length === 0 ? (
            <EmptyState title="No past visits yet">Finished visits, tests and scans show up here.</EmptyState>
          ) : (
            <div>
              {past.data!.map((v) => (
                <div className="c2-row" key={v.id}>
                  <span className="c2-dt" style={{ background: 'var(--surface-cream)', color: 'var(--ink-muted)' }}>
                    <b>{fmtDD(v.startsAt)}</b>
                    <i>{fmtMon(v.startsAt)}</i>
                  </span>
                  <div className="c2-grow">
                    <strong style={{ color: 'var(--ink)' }}>{v.title}</strong>
                    <div className="c2-muted">{v.sub ?? ''}</div>
                  </div>
                  <Badge tone="neutral">{v.status === 'done' ? 'Done' : v.status === 'scheduled' ? 'Today' : v.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Modal
        open={booked !== null}
        title="Appointment booked"
        onClose={() => setBooked(null)}
        footer={
          <>
            <Link to="/citizen/dates" className="cf-btn cf-btn-secondary cf-btn-md" style={{ textDecoration: 'none' }} onClick={() => setBooked(null)}>
              <span className="cf-btn-label">See in Dates</span>
            </Link>
            <Button onClick={() => setBooked(null)}>Done</Button>
          </>
        }
      >
        {booked ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14, borderRadius: 14, background: 'var(--tint-sage)', color: 'var(--success)', fontWeight: 600 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12l5 5L19 7" />
              </svg>
              {booked.message} {booked.reminder}
            </div>
            <dl className="c2-sum">
              <dt>Doctor</dt>
              <dd>{booked.appointment.doctorName ?? 'Doctor'}</dd>
              <dt>Where</dt>
              <dd>{booked.appointment.hospitalName}</dd>
              <dt>When</dt>
              <dd>{fmtWhen(booked.appointment.startsAt)}</dd>
              <dt>Token</dt>
              <dd>{booked.appointment.tokenNo ?? '—'}</dd>
              <dt>Fee</dt>
              <dd>{booked.appointment.feeAmount > 0 ? `₹${booked.appointment.feeAmount}` : 'Free OP'}</dd>
            </dl>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 14, background: 'var(--tint-blue)' }}>
              <strong style={{ color: 'var(--ink)', fontSize: 14 }}>Sent to {booked.appointment.doctorName ?? 'the doctor'}'s queue</strong>
              <span style={{ fontSize: 13 }}>The doctor app now shows your booking. Your reminder is in Dates.</span>
            </div>
            <p className="c2-muted" style={{ margin: 0 }}>
              Booking reference {booked.appointment.bookingRef}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={cancelTarget !== null}
        title="Cancel this appointment?"
        size="sm"
        onClose={() => setCancelTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={onCancel}>
              Cancel appointment
            </Button>
          </>
        }
      >
        {cancelTarget ? (
          <p>
            {cancelTarget.doctorName ?? 'Doctor'} · {fmtWhen(cancelTarget.startsAt)}. Your token is released and the doctor's queue is updated.
          </p>
        ) : null}
      </Modal>
      {toast.node}
    </div>
  )
}

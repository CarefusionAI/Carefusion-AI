import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { CitizenPrescriptionDto, CitizenRefillDto } from '@carefusion/shared'
import { AIInsight, Badge, Button, EmptyState, Select, Skeleton, StatCard, Switch, Table, TextField } from '../../components/ui'
import type { TableColumn } from '../../components/ui'
import {
  errorText,
  useFinder,
  useMedSummary,
  useMedToday,
  useNotifPrefs,
  usePrescriptions,
  useQueueToken,
  useRefills,
  useToggleDose,
  useUpdateNotifPrefs,
} from '../../api/citizen2'
import type { FinderParams } from '../../api/citizen2'
import { Box, C2Head, CardSkeleton, ErrorBox, Ic, LiveFeed, PATHS, fmtDD, fmtLong, fmtMon, fmtShort, fmtTime, fmtYmdLong, fmtYmdShort, useToast } from './c2kit'
import './citizen2.css'

const RADIUS = [
  { label: '5 km', value: '5' },
  { label: '10 km', value: '10' },
  { label: '25 km', value: '25' },
  { label: 'Whole district', value: 'all' },
]

const STOCK_TEXT = { in: 'In stock', low: 'Low stock', out: 'Out of stock' } as const
const STOCK_DOT = { in: '', low: 'y', out: 'r' } as const

function stepTime(at: string | null): string {
  return at ? `${fmtShort(at)} · ${fmtTime(at)}` : 'Pending'
}

function RefillRing({ r }: { r: CitizenRefillDto }) {
  const dash = Math.round(r.fractionLeft * 113)
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="22" cy="22" r="18" fill="none" stroke="#efe7de" strokeWidth="5" />
      <circle cx="22" cy="22" r="18" fill="none" stroke={r.urgent || r.daysLeft <= 10 ? '#c9a86a' : '#86bdb8'} strokeWidth="5" strokeDasharray={`${dash} 113`} transform="rotate(-90 22 22)" strokeLinecap="round" />
    </svg>
  )
}

function RxCard({ rx, index }: { rx: CitizenPrescriptionDto; index: number }) {
  const ready = rx.fulfilment === 'ready' || rx.fulfilment === 'collected'
  return (
    <div className={`c2-rx${index > 0 ? ' gold' : ''}`}>
      <div className="c2-bh">
        <div>
          <div className="c2-nm">
            {rx.doctorName}
            {rx.specialisation ? ` · ${rx.specialisation}` : ''}
          </div>
          <div className="c2-muted">
            {rx.hospitalName} · {fmtLong(rx.issuedAt)}
          </div>
        </div>
        <span className="c2-mono c2-muted">{rx.rxNumber}</span>
      </div>
      {rx.items.map((i) => (
        <div className="c2-row" key={i.id}>
          <Ic tone={i.medicine.toLowerCase().includes('vitamin') ? 'blue' : i.medicine.toLowerCase().includes('cream') ? 'peach' : 'teal'} d={i.medicine.toLowerCase().includes('cream') ? PATHS.tube : i.medicine.toLowerCase().includes('vitamin') ? PATHS.bottle : PATHS.pill} />
          <div className="c2-grow">
            <div className="c2-nm">{i.medicine}</div>
            <div className="c2-muted">
              {[i.frequency, i.withFood, `${i.durationDays} days`].filter(Boolean).join(' · ')}
            </div>
          </div>
          {i.ended ? (
            <Badge tone="warning">Ended {fmtYmdShort(i.endsOn)}</Badge>
          ) : i.endingSoon ? (
            <Badge tone="warning">Ends {fmtYmdShort(i.endsOn)}</Badge>
          ) : i.unitsLeft !== null ? (
            <span className="c2-muted c2-num">{i.unitsLeft} left</span>
          ) : null}
        </div>
      ))}
      <ol className="c2-trk" aria-label={`Prescription journey, ${rx.doctorName}`}>
        {rx.journey.map((s) => (
          <li key={s.key} className={s.done ? 'done' : ''}>
            <span />
            {s.label}
            <em>
              {s.key === 'next' ? (s.detail ? fmtYmdShort(s.detail) : '') : s.at ? stepTime(s.at) : (s.detail ?? 'Pending')}
            </em>
          </li>
        ))}
      </ol>
      <div className="c2-bh">
        <p className="c2-muted" style={{ margin: 0 }}>
          Valid until {fmtLong(rx.validUntil)} · {rx.allergyNote}
        </p>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Badge tone={ready ? 'success' : 'info'} dot>
            {rx.fulfilmentLabel}
          </Badge>
          <a className="c2-lk" href="#c2-pharmacy">
            Track at pharmacy →
          </a>
        </span>
      </div>
      <dl className="c2-kv">
        <div>
          <dt>Interaction check</dt>
          <dd>{rx.interactionNote}</dd>
        </div>
        <div>
          <dt>Prescription ID</dt>
          <dd className="c2-mono">{rx.rxNumber}</dd>
        </div>
      </dl>
    </div>
  )
}

export default function CitizenMedicinesScreen() {
  const today = useMedToday()
  const summary = useMedSummary()
  const rx = usePrescriptions()
  const refills = useRefills()
  const queue = useQueueToken()
  const toggle = useToggleDose()
  const prefs = useNotifPrefs()
  const setPrefs = useUpdateNotifPrefs()
  const toast = useToast()

  const [qInput, setQInput] = useState('')
  const [radius, setRadius] = useState('10')
  const [govtOnly, setGovtOnly] = useState(false)
  const [openNow, setOpenNow] = useState(false)
  const [applied, setApplied] = useState<string | null>(null)
  const finderRef = useRef<HTMLElement>(null)

  // Start the finder on the medicine that needs a refill soonest.
  const firstRefill = refills.data?.[0]?.medicine
  useEffect(() => {
    if (applied === null && firstRefill) {
      setQInput(firstRefill)
      setApplied(firstRefill)
    }
  }, [firstRefill, applied])

  const params: FinderParams | null = applied ? { q: applied, radiusKm: radius === 'all' ? undefined : Number(radius), govtOnly, openNow } : null
  const finder = useFinder(params)

  const remindOn = (prefs.data?.prefs ?? []).some((p) => p.category === 'medicine_reminders' && p.enabled)
  function setReminder(on: boolean) {
    setPrefs.mutate(
      { prefs: [{ category: 'medicine_reminders', channel: 'app', enabled: on }, { category: 'medicine_reminders', channel: 'sms', enabled: on }] },
      { onError: (e) => toast.show('Could not save', errorText(e)) },
    )
  }

  function onSearch(e: FormEvent) {
    e.preventDefault()
    if (qInput.trim()) setApplied(qInput.trim())
  }

  function findFor(r: CitizenRefillDto) {
    setQInput(r.medicine)
    setApplied(r.medicine)
    setGovtOnly(false)
    finderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function onTick(id: string, taken: boolean, name: string) {
    toggle.mutate(
      { id, taken },
      {
        onSuccess: () => toast.show(taken ? 'Dose ticked' : 'Dose un-ticked', name),
        onError: (e) => toast.show('Could not save', errorText(e)),
      },
    )
  }

  const s = summary.data
  const t = today.data
  const q = queue.data?.queue
  const hasMetformin = (rx.data?.active ?? []).some((r) => r.items.some((i) => /metformin/i.test(i.medicine) && !i.ended))

  const pastCols: TableColumn<{ id: string; date: string; doc: string; med: string; st: string }>[] = [
    { key: 'date', header: 'Date' },
    { key: 'doc', header: 'Doctor' },
    { key: 'med', header: 'Medicines' },
    { key: 'st', header: 'Status' },
  ]

  return (
    <div className="c2-page">
      <C2Head
        eyebrow="Health · Medicines"
        title="Your medicines"
        lead="Prescriptions your doctors e-signed, what to take today, when to refill and where it's in stock."
        actions={
          <>
            <Link to="/citizen/documents" className="cf-btn cf-btn-secondary cf-btn-md" style={{ textDecoration: 'none' }}>
              <span className="cf-btn-label">Download all (PDF)</span>
            </Link>
            <Link to="/citizen/access" className="cf-btn cf-btn-primary cf-btn-md" style={{ textDecoration: 'none' }}>
              <span className="cf-btn-label">Show to pharmacist</span>
            </Link>
          </>
        }
      />

      <section className="c2-grid c2-g4 c2-in c2-d1" aria-label="Summary">
        {today.isLoading || summary.isLoading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={104} radius={16} />
            ))}
          </>
        ) : (
          <>
            <StatCard label="Taken today" value={t?.takenCount ?? 0} unit={`of ${t?.totalCount ?? 0} doses`} hint={t?.nextDose ? `Next: ${t.nextDose.medicine} at ${t.nextDose.time}` : 'No more doses today'} tone="sage" />
            <StatCard label="Active prescriptions" value={s?.activePrescriptions ?? 0} hint={`From ${s?.doctors ?? 0} ${s?.doctors === 1 ? 'doctor' : 'doctors'}`} />
            <StatCard
              label="Next refill"
              value={s?.nextRefill ? fmtDD(`${s.nextRefill.date}T12:00:00+05:30`) : '—'}
              unit={s?.nextRefill ? fmtMon(`${s.nextRefill.date}T12:00:00+05:30`) : undefined}
              hint={s?.nextRefill ? `${s.nextRefill.medicine} · ${s.nextRefill.daysLeft} days left` : 'Nothing due soon'}
              tone="peach"
            />
            <StatCard
              label="This month"
              value={s?.adherence.percent !== null && s?.adherence.percent !== undefined ? `${s.adherence.percent}%` : '—'}
              unit="on time"
              trend={s?.adherence.trendPoints != null ? { direction: s.adherence.trendPoints >= 0 ? 'up' : 'down', text: `${Math.abs(s.adherence.trendPoints)}% ${s.adherence.trendPoints >= 0 ? 'better' : 'lower'} than last month` } : undefined}
              hint={s ? `${s.adherence.taken} of ${s.adherence.due} doses` : undefined}
              tone="blue"
            />
          </>
        )}
      </section>

      {s?.readyToCollect ? (
        <section className="c2-ready c2-in c2-d1" aria-label="Ready to collect">
          <Ic tone="sage" d={PATHS.storeTick} size={22} />
          <div className="c2-grow">
            <div className="c2-nm">Ready to collect · {s.readyToCollect.pharmacyName}</div>
            <div className="c2-muted">
              {s.readyToCollect.medicines}
              {s.readyToCollect.pharmacistName ? ` · ${s.readyToCollect.pharmacistName}` : ''} · collected with your rotating key, no paper needed
            </div>
          </div>
          <a className="cf-btn cf-btn-primary cf-btn-sm" href="#c2-pharmacy">
            <span className="cf-btn-label">Track at pharmacy</span>
          </a>
        </section>
      ) : null}

      <Box title={t ? `Today · ${fmtLong(`${t.date}T12:00:00+05:30`)}` : "Today's doses"} titleId="c2-today-t" actions={<span className="c2-muted">Tap a dose when you take it. Your doctor sees the pattern, not each tap.</span>} className="c2-in c2-d2">
        {today.isLoading ? (
          <CardSkeleton lines={3} label="Loading doses" />
        ) : today.isError ? (
          <ErrorBox error={today.error} onRetry={() => void today.refetch()} />
        ) : !t || t.slots.length === 0 ? (
          <EmptyState title="No doses today">Doses appear here when a doctor gives you a medicine with set times.</EmptyState>
        ) : (
          <div className="c2-slotgrid">
            {t.slots.map((sl) => (
              <div className="c2-sl" key={sl.key}>
                <h3>
                  {sl.label} · {sl.time}
                </h3>
                {sl.doses.map((d) => {
                  const on = d.status === 'taken'
                  return (
                    <div className={`c2-dose${on ? ' done' : ''}`} key={d.id}>
                      <button
                        type="button"
                        className={`c2-chk${on ? ' on' : ''}`}
                        aria-pressed={on}
                        aria-label={`${on ? 'Mark not taken' : 'Mark taken'}: ${d.medicine} at ${d.time}`}
                        disabled={!d.canToggle || (toggle.isPending && toggle.variables?.id === d.id)}
                        onClick={() => onTick(d.id, !on, d.medicine)}
                      >
                        {on ? '✓' : ''}
                      </button>
                      <div className="c2-grow">
                        <div className="c2-nm" style={{ fontSize: 14 }}>{d.medicine}</div>
                        <div className="c2-muted">{d.status === 'skipped' ? 'Skipped today' : d.how}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </Box>

      <LiveFeed title="Prescriptions & pharmacy — live" types={['prescription', 'dispensed', 'collected']} note="From your doctor and pharmacy · live" min={2} />

      <section className="c2-grid c2-wide c2-in c2-d3">
        <div className="c2-box">
          <div className="c2-bh">
            <h2 className="c2-bt">Active prescriptions</h2>
            <Badge tone="success" dot>
              e-Signed · verified
            </Badge>
          </div>
          {rx.isLoading ? (
            <CardSkeleton lines={5} label="Loading prescriptions" />
          ) : rx.isError ? (
            <ErrorBox error={rx.error} onRetry={() => void rx.refetch()} />
          ) : (rx.data?.active ?? []).length === 0 ? (
            <EmptyState title="No active prescriptions">When a doctor e-signs a prescription it shows up here.</EmptyState>
          ) : (
            rx.data!.active.map((r, i) => <RxCard key={r.id} rx={r} index={i} />)
          )}
        </div>

        <div className="c2-stack">
          <Box title="Refill reminders" titleId="c2-refill-t" actions={<Link to="/citizen/dates" className="c2-lk">In Dates</Link>}>
            {refills.isLoading ? (
              <CardSkeleton lines={2} label="Loading refills" />
            ) : refills.isError ? (
              <ErrorBox error={refills.error} onRetry={() => void refills.refetch()} />
            ) : (refills.data ?? []).length === 0 ? (
              <EmptyState title="No refills due soon">We will remind you before a course runs out.</EmptyState>
            ) : (
              refills.data!.map((r) => (
                <div className="c2-row" key={r.prescriptionItemId}>
                  <RefillRing r={r} />
                  <div className="c2-grow">
                    <div className="c2-nm">{r.medicine}</div>
                    <div className="c2-muted">
                      {r.daysLeft <= 0 ? 'Refill now' : `${r.daysLeft} days left`} · refill by {fmtYmdShort(r.refillBy)}
                    </div>
                  </div>
                  <Button variant="soft" size="sm" onClick={() => findFor(r)} aria-label={`Find ${r.medicine} in stock`}>
                    Find
                  </Button>
                </div>
              ))
            )}
            <Switch label="Remind me 3 days before" description="SMS and app notification" checked={remindOn} disabled={prefs.isLoading || setPrefs.isPending} onChange={setReminder} />
          </Box>

          {hasMetformin ? (
            <AIInsight module="Medicine guidance · AI" status="verified" title="Metformin is best taken with food">
              <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
                Taking it with meals lowers stomach upset. If you miss a dose, skip it — don't take two together. Ask your doctor before changing anything.
              </p>
            </AIInsight>
          ) : null}

          <section className="c2-box" id="c2-pharmacy" aria-label="Your pharmacy">
            <div className="c2-bh">
              <h2 className="c2-bt">Your pharmacy</h2>
              {q ? <Badge tone={q.openNow ? 'success' : 'neutral'} dot>{q.openText}</Badge> : null}
            </div>
            {queue.isLoading ? (
              <CardSkeleton lines={2} label="Loading pharmacy" />
            ) : queue.isError ? (
              <ErrorBox error={queue.error} onRetry={() => void queue.refetch()} />
            ) : !q ? (
              <EmptyState title="No pharmacy yet">Once a prescription is sent to a pharmacy, its queue shows here.</EmptyState>
            ) : (
              <>
                <div className="c2-row c2-row-first">
                  <Ic tone="sage" d={PATHS.store} />
                  <div className="c2-grow">
                    <div className="c2-nm">{q.pharmacyName}</div>
                    <div className="c2-muted">
                      {[q.counter, q.pharmacistName, q.distanceKm !== null ? `${q.distanceKm} km` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                {q.tokenLabel ? (
                  <dl className="c2-kv">
                    <div>
                      <dt>Token</dt>
                      <dd className="c2-mono">{q.tokenLabel}</dd>
                    </div>
                    <div>
                      <dt>Queue</dt>
                      <dd>
                        {q.tokenState === 'served' ? 'Served' : q.tokenState === 'called' && q.ahead === 0 ? 'Your turn' : `${q.ahead} ahead · ~${q.waitMinutes ?? 0} min`}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="c2-muted" style={{ margin: 0 }}>No token today. Show your rotating key at the counter to get one.</p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to="/citizen/messages" className="cf-btn cf-btn-ghost cf-btn-sm" style={{ textDecoration: 'none' }}>
                    <span className="cf-btn-label">Message pharmacist</span>
                  </Link>
                </div>
              </>
            )}
          </section>
        </div>
      </section>

      <section className="c2-box c2-in c2-d4" aria-label="Find a medicine" ref={finderRef}>
        <div className="c2-bh">
          <h2 className="c2-bt">Find a medicine in stock nearby</h2>
          <span className="c2-muted">Published stock from government and registered private pharmacies</span>
        </div>
        <form className="c2-srch" onSubmit={onSearch} aria-label="Medicine search">
          <TextField label="Medicine" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="e.g. Metformin 500" />
          <Select label="Within" options={RADIUS} value={radius} onChange={setRadius} />
          <div className="c2-srch-btn">
            <Button type="submit" loading={finder.isFetching}>Search</Button>
          </div>
        </form>
        <div className="c2-chips" role="group" aria-label="Pharmacy filters">
          <button type="button" className={`c2-chip${!govtOnly && !openNow ? ' on' : ''}`} aria-pressed={!govtOnly && !openNow} onClick={() => { setGovtOnly(false); setOpenNow(false) }}>All</button>
          <button type="button" className={`c2-chip${govtOnly ? ' on' : ''}`} aria-pressed={govtOnly} onClick={() => setGovtOnly((v) => !v)}>Government only</button>
          <button type="button" className={`c2-chip${openNow ? ' on' : ''}`} aria-pressed={openNow} onClick={() => setOpenNow((v) => !v)}>Open now</button>
        </div>
        <div aria-live="polite">
          {!applied ? (
            <EmptyState title="Search for a medicine">Type a medicine name to see which pharmacies have it.</EmptyState>
          ) : finder.isLoading ? (
            <CardSkeleton lines={3} label="Searching pharmacies" />
          ) : finder.isError ? (
            <ErrorBox error={finder.error} onRetry={() => void finder.refetch()} />
          ) : (finder.data?.results ?? []).length === 0 ? (
            <EmptyState title="Nothing found">Try a wider distance or another spelling.</EmptyState>
          ) : (
            <div>
              {finder.data!.results.map((p) => (
                <div className="c2-row c2-finder-row" key={`${p.pharmacyId}-${p.medicineId}`}>
                  <Ic tone={p.ownership === 'govt' ? 'teal' : 'blue'} d={PATHS.store} />
                  <div className="c2-grow">
                    <div className="c2-nm">
                      {p.pharmacyName}
                      {p.ownership === 'govt' ? ' (Govt)' : ''}
                    </div>
                    <div className="c2-muted">
                      {[p.medicineName, p.distanceKm !== null ? `${p.distanceKm} km` : null, p.hoursText, p.isJanAushadhi ? 'Jan Aushadhi' : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className="c2-stk">
                    <span className={`c2-dot ${STOCK_DOT[p.stockLevel]}`} aria-hidden="true" />
                    {STOCK_TEXT[p.stockLevel]}
                  </span>
                  <span className="c2-muted c2-num" style={{ width: 70, textAlign: 'right' }}>{p.minPrice !== null ? `₹${p.minPrice}` : '—'}</span>
                  {p.lat !== null && p.lon !== null ? (
                    <a className="c2-lk" href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=16/${p.lat}/${p.lon}`} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${p.pharmacyName} (opens a map in a new tab)`}>
                      Directions
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {finder.data ? <p className="c2-muted" style={{ margin: '8px 0 0' }}>{finder.data.note}</p> : null}
        </div>
      </section>

      <Box title="Past prescriptions" titleId="c2-past-t" actions={<Link to="/citizen/documents" className="c2-lk">All in Documents</Link>} className="c2-in c2-d5">
        {rx.isLoading ? (
          <CardSkeleton lines={3} label="Loading past prescriptions" />
        ) : rx.isError ? (
          <ErrorBox error={rx.error} onRetry={() => void rx.refetch()} />
        ) : (
          <Table
            caption="Past prescriptions"
            columns={pastCols}
            rowKey="id"
            rows={(rx.data?.past ?? []).map((p) => ({ id: p.id, date: fmtYmdLong(p.issuedAt.slice(0, 10)), doc: p.doctorName, med: p.medicines, st: p.status }))}
            empty="No past prescriptions."
          />
        )}
      </Box>
      {toast.node}
    </div>
  )
}

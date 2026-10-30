import { useMemo, useState } from 'react'
import { Badge, Button, StatCard, TextField } from '../../../components/ui'
import { useEvents, eventTag } from '../../../hooks/useEvents'
import { useAuth } from '../../../context/AuthContext'
import { useCompleteTask, useMar, useNurseBoard, useNurseHandovers, useNurseOrders, useNurseTasks, errMessage } from '../../../api/nurse'
import type { NurseBed, NurseOrder } from '../../../api/nurse'
import {
  ACUITY_ICON,
  ACUITY_LABEL,
  BoxHead,
  Empty,
  ErrorBlock,
  Loading,
  NewsChip,
  PRIORITY,
  PageLoading,
  fmtDay,
  fmtTime,
  minutesAgo,
  orderStatusLabel,
  orderTypeLabel,
} from './common'
import type { Go } from './types'

const SVG = {
  bed: 'M3 18V8M3 14h18v4M21 18v-6a3 3 0 0 0-3-3h-7v5',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
  pill: 'M8.5 3.5a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7-7zM6 11l7 7',
  pulse: 'M3 12h4l3-7l4 14l3-7h4',
}
function Ic({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function bedClass(b: NurseBed): string {
  const base = b.acuity === 'free' ? 'is-free' : b.acuity === 'critical' ? 'is-crit' : b.acuity === 'watch' ? 'is-watch' : 'is-occ'
  return `nu-bed ${base}${b.mine ? ' is-mine' : ''}`
}

function Workload({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? done / total : 0
  return (
    <div className="nu-wk">
      <span>{label}</span>
      <div className="nu-bar is-wk" role="img" aria-label={`${label}: ${done} done of ${total}, ${total - done} pending`}>
        <span style={{ transform: `scaleX(${pct})` }} />
      </div>
      <b>
        {done} / {total}
      </b>
    </div>
  )
}

export default function Home({ go, firstName }: { go: Go; firstName: string }) {
  const { user } = useAuth()
  const board = useNurseBoard()
  const tasks = useNurseTasks('mine', 'all')
  const orders = useNurseOrders('all')
  const mar = useMar()
  const handovers = useNurseHandovers()
  const { events, unavailable } = useEvents(user?.role)
  const complete = useCompleteTask()
  const [lookup, setLookup] = useState('')
  const [pickedBed, setPickedBed] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)

  const hits = useMemo(() => {
    const q = lookup.trim().toLowerCase()
    if (!board.data || !q) return []
    return board.data.beds
      .filter((b) => b.admissionId && `${b.bedNo} bed ${b.patientName ?? ''} ${b.ipNumber ?? ''}`.toLowerCase().includes(q))
      .slice(0, 4)
  }, [board.data, lookup])

  if (board.isLoading) return <PageLoading title="ward home" />
  if (board.isError) return <ErrorBlock error={board.error} onRetry={() => void board.refetch()} title="Could not load the ward board" />
  const data = board.data!
  const k = data.kpis
  const openTasks = (tasks.data ?? []).filter((t) => !t.doneAt)
  const taskList = (tasks.data ?? []).slice(0, 7)
  const actionable = (orders.data ?? []).filter((o) => o.actionable)
  const openOrders = actionable.filter((o) => o.status === 'open')
  const ews = [...data.beds].filter((b) => b.latestNews != null).sort((a, b) => (b.latestNews ?? 0) - (a.latestNews ?? 0)).slice(0, 3)
  const lastHandover = handovers.data?.[0]
  const doses = mar.data?.summary
  const ordersActioned = actionable.filter((o) => o.status !== 'open').length
  const tasksAll = tasks.data ?? []

  return (
    <div className="nu-pg">
      <header className="nu-head">
        <div>
          <p className="nu-muted" style={{ margin: '0 0 4px' }}>{fmtDay()}</p>
          <h1 className="nu-h1">Good day, {firstName}</h1>
          <p className="nu-sub">
            {k.bedsOccupied} of {k.bedsTotal} beds occupied · {k.myPatients} patients assigned to you · {k.openTasks} open tasks on the ward.
          </p>
        </div>
        <div className="nu-actions">
          <Badge tone="teal" dot>{data.ward?.name ?? 'All wards'}</Badge>
          <Badge tone="outline">Nurse</Badge>
        </div>
      </header>

      <section className="nu-grid nu-g4">
        <StatCard label="Ward census" value={k.bedsOccupied} unit={`/ ${k.bedsTotal} beds`} hint={`${k.bedsTotal - k.bedsOccupied} beds free`} tone="blue" icon={<Ic d={SVG.bed} />} />
        <StatCard label="My patients" value={k.myPatients} hint="On your admission team or tasks" icon={<Ic d={SVG.user} />} />
        <StatCard
          label="Meds due · next hour"
          value={k.dosesDueNextHour}
          unit="doses"
          hint={k.overdueDoses ? `${k.overdueDoses} overdue` : 'None overdue'}
          tone="peach"
          icon={<Ic d={SVG.pill} />}
        />
        <StatCard label="Early-warning" value={k.earlyWarning} unit="patients" hint="NEWS 5 or more · review now" tone="sage" icon={<Ic d={SVG.pulse} />} />
      </section>

      <section className="nu-grid nu-g21">
        <div className="nu-box">
          <BoxHead
            title={`${data.ward?.name ?? 'Ward'} — bed board`}
            right={
              <div className="nu-legend">
                <Badge tone="teal" icon={<span>{ACUITY_ICON.stable}</span>}>Stable</Badge>
                <Badge tone="warning" icon={<span>{ACUITY_ICON.watch}</span>}>Watch</Badge>
                <Badge tone="danger" icon={<span>{ACUITY_ICON.critical}</span>}>Critical</Badge>
              </div>
            }
          />
          {data.beds.length === 0 ? (
            <Empty title="No beds on this ward">The ward has no beds set up yet.</Empty>
          ) : (
            <div className="nu-beds">
              {data.beds.map((b) => (
                <button
                  key={b.bedId}
                  type="button"
                  className={bedClass(b)}
                  aria-label={`Bed ${b.bedNo}, ${b.patientName ?? 'free'}, ${ACUITY_LABEL[b.acuity]}${b.latestNews != null ? `, NEWS ${b.latestNews}` : ''}${b.mine ? ', assigned to you' : ''}`}
                  onClick={() => go('admit', { bed: b.bedId })}
                >
                  <b>Bed {b.bedNo}</b>
                  <span>{b.patientName ?? 'Ready'}</span>
                  <span className="nu-bed-tag">
                    <span aria-hidden="true">{ACUITY_ICON[b.acuity]}</span>
                    {ACUITY_LABEL[b.acuity]}
                    {b.latestNews != null ? ` · NEWS ${b.latestNews}` : ''}
                    {b.mine ? ' · mine' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="nu-muted" style={{ margin: 0 }}>Opening a bed starts admission mode. The chart opens for 2 hours and every view is logged.</p>
        </div>

        <div className="nu-box">
          <BoxHead title="My tasks" right={<Badge tone="neutral">{openTasks.length} left</Badge>} />
          {tasks.isLoading ? (
            <Loading rows={4} label="Loading tasks" />
          ) : tasks.isError ? (
            <ErrorBlock error={tasks.error} onRetry={() => void tasks.refetch()} />
          ) : taskList.length === 0 ? (
            <Empty title="No tasks for you">Nothing is assigned to you right now.</Empty>
          ) : (
            <div className="nu-list">
              {taskList.map((t) => {
                const done = !!t.doneAt
                return (
                  <div key={t.id} className={`nu-med${done ? ' is-done' : t.late ? ' is-late' : ''}`}>
                    <button
                      type="button"
                      className="nu-chk"
                      aria-pressed={done}
                      aria-label={done ? `Done: ${t.title}` : `Mark done: ${t.title}`}
                      disabled={done || complete.isPending}
                      onClick={() => {
                        setTaskError(null)
                        complete.mutate({ id: t.id }, { onError: (e) => setTaskError(errMessage(e)) })
                      }}
                    >
                      {done ? '✓' : ''}
                    </button>
                    <div className="nu-grow">
                      <strong className="nu-strong">{t.bedNo ? `Bed ${t.bedNo} · ` : ''}{t.title}</strong>
                      <div className="nu-muted">
                        {done ? `Done ${fmtTime(t.doneAt)}` : t.late ? 'Overdue' : t.patientName}
                        {t.note ? ` · ${t.note}` : ''}
                      </div>
                    </div>
                    <span className="nu-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(t.dueAt)}</span>
                  </div>
                )
              })}
              {taskError ? <p className="nu-tag-bad" role="alert">{taskError}</p> : null}
            </div>
          )}
        </div>
      </section>

      <section className="nu-grid nu-g3">
        <div className="nu-box">
          <BoxHead title="New orders" right={<button type="button" className="nu-lk" onClick={() => go('orders')}>All orders · {openOrders.length} open</button>} />
          {orders.isLoading ? (
            <Loading rows={3} label="Loading orders" />
          ) : openOrders.length === 0 ? (
            <Empty title="No new orders">You are up to date.</Empty>
          ) : (
            <div className="nu-list">
              {openOrders.slice(0, 3).map((o) => (
                <OrderLine key={o.id} o={o} />
              ))}
            </div>
          )}
        </div>

        <div className="nu-box">
          <BoxHead title="Early-warning scores" right={<button type="button" className="nu-lk" onClick={() => go('vitals')}>Record vitals</button>} />
          {ews.length === 0 ? (
            <Empty title="No scores yet">Record a set of vitals to see scores here.</Empty>
          ) : (
            ews.map((b) => (
              <div className="nu-row" key={b.bedId}>
                <div className="nu-grow">
                  <strong className="nu-strong">Bed {b.bedNo} · {b.patientName}</strong>
                  <div className="nu-muted">Last set {minutesAgo(b.latestNewsAt)}</div>
                </div>
                <NewsChip score={b.latestNews} band={b.acuity === 'critical' ? 'high' : b.acuity === 'watch' ? (b.latestNews != null && b.latestNews >= 5 ? 'medium' : 'low_medium') : 'low'} />
              </div>
            ))
          )}
        </div>

        <div className="nu-box is-sage">
          <BoxHead title="Shift handover" right={<button type="button" className="nu-lk" onClick={() => go('handover')}>Write notes</button>} />
          {lastHandover ? (
            <>
              <p style={{ margin: 0, fontSize: 14 }}>
                {lastHandover.signedAt ? 'Signed by' : 'Waiting for'} <strong>{lastHandover.signedBy?.name ?? lastHandover.to?.name ?? 'the next nurse'}</strong>
                {' '}· from {lastHandover.from.name}
              </p>
              <div className="nu-bar"><span style={{ transform: `scaleX(${lastHandover.items.length ? lastHandover.items.filter((i) => i.doneAt).length / lastHandover.items.length : lastHandover.signedAt ? 1 : 0.1})` }} /></div>
              <div className="nu-list">
                {lastHandover.items.slice(0, 4).map((i) => (
                  <div key={i.id} className={`nu-med${i.doneAt ? ' is-done' : ''}`}>
                    <span className={`nu-mark${i.doneAt ? '' : ' is-open'}`} aria-hidden="true">✓</span>
                    <span className="nu-grow" style={{ fontSize: 14 }}>{i.bedNo ? `Bed ${i.bedNo} · ` : ''}{i.note}</span>
                    {i.flag === 'watch' ? <Badge tone="danger" icon={<span>‼</span>}>Watch</Badge> : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 14 }}>No handover written yet today. Notes are part of the patient record and visible to the treating doctor.</p>
          )}
        </div>
      </section>

      <section className="nu-grid nu-g3">
        <div className="nu-box">
          <BoxHead title="Connected apps" right={<Badge tone="teal" dot>Live</Badge>} />
          {unavailable ? (
            <p className="nu-muted" style={{ margin: 0 }}>The events feed is not reachable right now.</p>
          ) : events.length === 0 ? (
            <Empty title="No activity yet">Orders, results and alerts from other apps appear here.</Empty>
          ) : (
            events.slice(0, 5).map((e) => (
              <div className="nu-feed" key={e.id}>
                <span className="nu-feed-k">{eventTag(e.type).tag}</span>
                <div className="nu-grow">
                  <strong className="nu-strong">{e.title}</strong>
                  <div className="nu-muted">{e.text}</div>
                </div>
                <span className="nu-mono">{e.at}</span>
              </div>
            ))
          )}
        </div>

        <div className="nu-box">
          <BoxHead title="My workload · this shift" />
          <Workload label="Medicines" done={doses ? doses.given : 0} total={doses ? doses.total : 0} />
          <Workload label="Tasks" done={tasksAll.filter((t) => t.doneAt).length} total={tasksAll.length} />
          <Workload label="Orders actioned" done={ordersActioned} total={actionable.length} />
          <p className="nu-muted" style={{ margin: 0 }}>Filled bar = done · striped = still pending. Counts update as you work.</p>
          <dl className="nu-kvx">
            <div><dt>Overdue doses</dt><dd className={k.overdueDoses ? 'is-bad' : 'is-good'}>{k.overdueDoses}</dd></div>
            <div><dt>Open escalations</dt><dd className={k.openEscalations ? 'is-bad' : 'is-good'}>{k.openEscalations}</dd></div>
            <div><dt>Orders waiting</dt><dd>{k.pendingOrders}</dd></div>
            <div><dt>Open tasks (ward)</dt><dd>{k.openTasks}</dd></div>
          </dl>
        </div>

        <div className="nu-box">
          <BoxHead title="Patient lookup" right={<Badge tone="outline">Ward-scoped</Badge>} />
          <TextField
            label="Bed number or name"
            placeholder="e.g. Bed 7"
            value={lookup}
            onChange={(e) => {
              setLookup(e.target.value)
              setPickedBed(null)
            }}
            helper="Only patients admitted to this ward."
          />
          <div className="nu-sugg" role="listbox" aria-label="Matching patients">
            {hits.map((b) => (
              <button key={b.bedId} type="button" role="option" aria-selected={pickedBed === b.bedId} onClick={() => setPickedBed(b.bedId)}>
                <span className="nu-mono">Bed {b.bedNo}</span>
                <span className="nu-grow">
                  <strong style={{ fontSize: 14 }}>{b.patientName}</strong>
                  <span className="nu-muted" style={{ display: 'block' }}>{b.diagnosis ?? b.ipNumber ?? ''}</span>
                </span>
              </button>
            ))}
          </div>
          {lookup.trim() && hits.length === 0 ? <p className="nu-muted" style={{ margin: 0 }}>No patient matches. You cannot search the national record from here.</p> : null}
          {pickedBed ? (
            <div className="nu-note">
              <strong style={{ color: 'var(--ink)' }}>Open this chart</strong>
              <div className="nu-muted">Opened through admission to this ward · logged</div>
              <div style={{ marginTop: 8 }}>
                <Button size="sm" onClick={() => go('admit', { bed: pickedBed })}>Open chart</Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export function OrderLine({ o }: { o: NurseOrder }) {
  const p = PRIORITY[o.priority] ?? PRIORITY.routine!
  return (
    <div className={`nu-q${o.priority === 'stat' && o.status === 'open' ? ' is-stat' : ''}`}>
      <span className={`nu-pri is-${o.priority}`}>
        <span aria-hidden="true">{p.icon}</span>
        {p.label}
      </span>
      <div className="nu-grow">
        <strong className="nu-strong">{o.bedNo ? `Bed ${o.bedNo} · ` : ''}{o.details}</strong>
        <div className="nu-muted">{o.orderedBy} · {fmtTime(o.createdAt)} · {orderTypeLabel(o.type)} · {orderStatusLabel(o.status)}</div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import type { DatedEventDto, ReminderRepeat } from '@carefusion/shared'
import { Alert, Badge, Button, EmptyState, Select, Skeleton, Tabs, TextField } from '../../components/ui'
import {
  useCalendar,
  useCalendarFeed,
  useCreateCalendarFeed,
  useCreateReminder,
  useRevokeCalendarFeed,
  useUpcoming,
  useUpdateReminder,
} from '../../api/citizen1'
import { Async, Box, DateTile, KIND_LABEL, KIND_TONE, LinkBtn, MutationError, Page, fmt, ymd } from './CitizenKit'

// Dates (CitizenDates.dc.html): calendar, coming up, add a reminder. Data from /citizen/dates/*.

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const REPEATS: { value: ReminderRepeat; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]
const BEFORE = [
  { value: '0', label: 'At the time' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]

function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function inLabel(n: number): string {
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`
}

function EventLine({ e }: { e: DatedEventDto }) {
  const kind = e.isPersonal ? 'personal' : e.kind
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className={clsx('c1-cev-s', KIND_TONE(kind))}>{KIND_LABEL[kind] ?? 'Date'}</span>
      <span style={{ fontSize: 14 }}>{e.title}</span>
      <span className="c1-muted">{[fmt.time(e.startsAt), e.notes].filter(Boolean).join(' · ')}</span>
    </div>
  )
}

function CalendarCard() {
  const go = useNavigate()
  const [month, setMonth] = useState<string | undefined>(undefined)
  const [view, setView] = useState<'month' | 'list'>('month')
  const [selDay, setSelDay] = useState<string | null>(null)
  const cal = useCalendar(month)
  const feed = useCalendarFeed()
  const createFeed = useCreateCalendarFeed()
  const revokeFeed = useRevokeCalendarFeed()

  const data = cal.data
  const byDay = useMemo(() => {
    const m = new Map<string, DatedEventDto[]>()
    for (const e of data?.events ?? []) {
      const k = ymd(e.startsAt)
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return m
  }, [data])

  const cur = data?.month ?? month ?? ''
  const today = data?.today ?? ''
  const day = selDay && selDay.startsWith(cur) ? selDay : today.startsWith(cur) ? today : cur ? `${cur}-01` : ''
  const selEvents = byDay.get(day) ?? []

  let cells: { n: number; key: string }[] = []
  let lead = 0
  if (cur) {
    const [y, m] = cur.split('-').map(Number) as [number, number]
    lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
    cells = Array.from({ length: days }, (_, i) => ({ n: i + 1, key: `${cur}-${String(i + 1).padStart(2, '0')}` }))
  }

  return (
    <Box as="section" label={`${cur ? monthTitle(cur) : ''} calendar`}>
      <div className="c1-bh">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="c1-fbtn" aria-label="Previous month" disabled={!cur} onClick={() => setMonth(shiftMonth(cur, -1))}>‹</button>
          <h2 className="c1-bt" style={{ fontFamily: 'var(--font-serif)', fontSize: 22, lineHeight: '30px' }}>{cur ? monthTitle(cur) : 'Calendar'}</h2>
          <button type="button" className="c1-fbtn" aria-label="Next month" disabled={!cur} onClick={() => setMonth(shiftMonth(cur, 1))}>›</button>
        </div>
        <Tabs
          label="Calendar view"
          variant="segmented"
          value={view}
          onChange={(v) => setView(v as typeof view)}
          tabs={[{ id: 'month', label: 'Month' }, { id: 'list', label: 'List' }]}
        />
      </div>

      <Async query={cal} what="your calendar" skeleton={<Skeleton lines={8} height={28} />}>
        {(c) =>
          view === 'month' ? (
            <>
              <div className="c1-cal">
                {WEEK.map((w) => <span className="c1-wd" key={w}>{w}</span>)}
                {Array.from({ length: lead }, (_, i) => <span className="c1-cell blank" key={`b${i}`} aria-hidden="true" />)}
                {cells.map((cell) => {
                  const evs = byDay.get(cell.key) ?? []
                  const isToday = cell.key === c.today
                  return (
                    <button
                      type="button"
                      key={cell.key}
                      className={clsx('c1-cell', cell.key < c.today && 'past', isToday && 'today', cell.key === day && 'is-sel')}
                      aria-label={`${cell.n} ${monthTitle(cur).split(' ')[0]}${isToday ? ', today' : ''}${evs.length ? `, ${evs.map((e) => e.title).join(', ')}` : ', nothing planned'}`}
                      aria-pressed={cell.key === day}
                      onClick={() => setSelDay(cell.key)}
                    >
                      <span className="c1-dnum">{cell.n}</span>
                      {evs.slice(0, 2).map((e) => (
                        <span key={e.id} className={clsx('c1-cev-s', KIND_TONE(e.isPersonal ? 'personal' : e.kind))}>{e.title}</span>
                      ))}
                      {evs.length > 2 ? <span className="c1-muted" style={{ fontSize: 11 }}>+{evs.length - 2} more</span> : null}
                    </button>
                  )
                })}
              </div>
              <div className="c1-seldate">
                <span className="c1-dt" style={{ background: 'var(--surface-raised)', color: 'var(--ink-strong)' }}>
                  <b>{day.slice(8)}</b>
                  <i>{fmt.mon(`${day}T06:00:00Z`)}</i>
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <strong className="c1-strong">
                    {fmt.dateLong(`${day}T06:00:00Z`).replace(/ \d{4}$/, '')}
                    {day === c.today ? ' · today' : ''}
                  </strong>
                  {selEvents.map((e) => <EventLine key={e.id} e={e} />)}
                  {selEvents.length === 0 ? <span className="c1-muted">Nothing planned. Add a reminder for this day on the right.</span> : null}
                </div>
              </div>
            </>
          ) : c.events.length === 0 ? (
            <EmptyState title="Nothing this month">Appointments, refills and tests appear here.</EmptyState>
          ) : (
            <div>
              {c.events.map((e) => (
                <div className="c1-row" key={e.id}>
                  <DateTile iso={e.startsAt} tone={KIND_TONE(e.isPersonal ? 'personal' : e.kind)} />
                  <div className="c1-grow"><EventLine e={e} /></div>
                  <Badge tone={e.status === 'done' ? 'success' : e.status === 'missed' ? 'danger' : 'neutral'}>{e.status}</Badge>
                </div>
              ))}
            </div>
          )
        }
      </Async>

      {data ? (
        <div className="c1-msum" aria-label={`${monthTitle(cur)} at a glance`}>
          <div><b>{data.summary.appointments}</b><span>Appointments</span></div>
          <div><b>{data.summary.tests}</b><span>Tests</span></div>
          <div><b>{data.summary.refills}</b><span>Refills</span></div>
          <div><b>{data.summary.vaccines}</b><span>Vaccines</span></div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', borderRadius: 16, background: 'var(--tint-blue)', flexWrap: 'wrap' }}>
        <span style={{ flex: 1, fontSize: 14, minWidth: 200 }}>
          <strong className="c1-strong">Sync with your phone calendar.</strong>{' '}
          {feed.data?.active ? 'Your calendar link is on. Dates update when your doctor changes them.' : 'Dates update when your doctor changes them.'}
        </span>
        {feed.data?.active ? (
          <LinkBtn onClick={() => revokeFeed.mutate()} disabled={revokeFeed.isPending}>Turn off</LinkBtn>
        ) : (
          <LinkBtn onClick={() => createFeed.mutate()} disabled={createFeed.isPending || feed.isPending}>Set up</LinkBtn>
        )}
        <LinkBtn onClick={() => go('/citizen/care')}>Book appointment</LinkBtn>
      </div>
      {createFeed.data?.url ? (
        <Alert tone="info" title="Your calendar link (shown once)">
          <code style={{ overflowWrap: 'anywhere' }}>{createFeed.data.url}</code>
          <div className="c1-muted">Add it to Google, Apple or Outlook calendar as a subscribed calendar. Anyone with the link can read your dates.</div>
        </Alert>
      ) : null}
      <MutationError error={createFeed.error ?? revokeFeed.error} />
    </Box>
  )
}

function ComingUp() {
  const go = useNavigate()
  const upcoming = useUpcoming(8)
  const update = useUpdateReminder()
  return (
    <Box title="Coming up" actions={<LinkBtn onClick={() => go('/citizen/care')}>Book appointment</LinkBtn>}>
      <Async query={upcoming} what="upcoming dates" skeleton={<Skeleton lines={6} height={16} />}>
        {(u) => {
          const list = u.events.filter((e) => e.status === 'scheduled')
          if (!list.length) return <EmptyState title="Nothing coming up">Add a reminder below.</EmptyState>
          return (
            <>
              {list.map((e) => {
                const personal = e.isPersonal
                const snoozable = !personal && (e.kind === 'med' || e.kind === 'test')
                return (
                  <div className="c1-row" key={e.id}>
                    <DateTile iso={e.startsAt} tone={KIND_TONE(personal ? 'personal' : e.kind)} />
                    <div className="c1-grow">
                      <strong className="c1-strong" style={{ fontSize: 14 }}>{e.title}</strong>
                      <div className="c1-muted">{e.notes ?? fmt.time(e.startsAt)}</div>
                      {personal || snoozable ? (
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          {personal ? (
                            <LinkBtn disabled={update.isPending} ariaLabel={`Mark ${e.title} done`} onClick={() => update.mutate({ id: e.id, body: { status: 'done' } })}>Done</LinkBtn>
                          ) : null}
                          {snoozable ? (
                            <LinkBtn
                              disabled={update.isPending}
                              ariaLabel={`Snooze ${e.title} for a day`}
                              onClick={() => update.mutate({ id: e.id, body: { snoozedUntil: new Date(Date.now() + 86_400_000).toISOString() } })}
                            >
                              {e.snoozedUntil ? 'Snoozed' : 'Snooze 1 day'}
                            </LinkBtn>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                    <span className="c1-muted" style={{ whiteSpace: 'nowrap' }}>{inLabel(e.inDays)}</span>
                  </div>
                )
              })}
              <MutationError error={update.error} />
            </>
          )
        }}
      </Async>
    </Box>
  )
}

function AddReminder() {
  const cal = useCalendar()
  const create = useCreateReminder()
  const today = cal.data?.today ?? ''
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('08:00')
  const [repeat, setRepeat] = useState<ReminderRepeat>('none')
  const [before, setBefore] = useState('60')
  const [saved, setSaved] = useState<string | null>(null)
  const dateVal = date || (today ? addDays(today, 1) : '')

  function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !dateVal) return
    setSaved(null)
    const t = title.trim()
    create.mutate(
      { title: t, startsAt: `${dateVal}T${time}:00+05:30`, repeat, remindBeforeMinutes: Number(before) },
      {
        onSuccess: () => {
          setSaved(`Saved “${t}” for ${fmt.dateLong(`${dateVal}T06:00:00Z`).replace(/ \d{4}$/, '')}, ${time}.`)
          setTitle('')
        },
      },
    )
  }

  return (
    <Box label="Add a reminder">
      <div className="c1-bh"><h2 className="c1-bt">Add a reminder</h2></div>
      <form className="c1-form" onSubmit={save}>
        <TextField label="What" placeholder="e.g. Take BP reading" required value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <div className="c1-two">
          <TextField label="Date" type="date" required value={dateVal} onChange={(e) => setDate(e.target.value)} />
          <TextField label="Time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Select label="Repeat" options={REPEATS} value={repeat} onChange={(v) => setRepeat(v as ReminderRepeat)} />
        <Select label="Remind me" options={BEFORE} value={before} onChange={setBefore} />
        <MutationError error={create.error} />
        <Button type="submit" loading={create.isPending} disabled={!title.trim() || !dateVal}>Save reminder</Button>
        {saved ? <div className="c1-note" role="status">✓ {saved}</div> : null}
      </form>
    </Box>
  )
}

export default function CitizenDates() {
  return (
    <Page label="Dates">
      <header className="c1-head c1-in">
        <div>
          <p className="c1-eyb">Dates</p>
          <h1 className="c1-ttl">Dates to remember</h1>
          <p>Appointments, refills, tests and donations, set by your doctors or by you.</p>
        </div>
        <div className="c1-lg" aria-label="Legend">
          {(['appt', 'med', 'test', 'give', 'vac', 'personal'] as const).map((k) => (
            <span key={k} className={KIND_TONE(k)}>● {KIND_LABEL[k]}</span>
          ))}
        </div>
      </header>
      <div className="c1-lay c1-in" style={{ animationDelay: '60ms' }}>
        <CalendarCard />
        <div className="c1-stack">
          <ComingUp />
          <AddReminder />
          <Alert tone="info" title="Doctor-set dates can't be deleted">
            You can snooze a refill or test reminder, but only your doctor can change it.
          </Alert>
        </div>
      </div>
    </Page>
  )
}

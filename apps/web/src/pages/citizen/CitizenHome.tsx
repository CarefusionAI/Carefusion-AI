import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Alert, Avatar, Badge, Button, EmptyState, Skeleton, StatCard } from '../../components/ui'
import type { BadgeTone } from '../../components/ui'
import { eventTag, useEvents } from '../../hooks/useEvents'
import type { AccessOverviewResponse, CitizenProfileResponse, DatedEventDto, FolderResponse } from '@carefusion/shared'
import {
  errorMessage,
  useAccessHistory,
  useAccessOverview,
  useAlertsSummary,
  useRecentDocuments,
  useCitizenProfile,
  useEndSession,
  useFolders,
  useRotatingKey,
  useUpcoming,
  useVitalsSummary,
} from '../../api/citizen1'
import { TrendChart } from './CitizenCharts'
import {
  Async,
  Box,
  ICONS,
  Icon,
  KIND_BADGE,
  KIND_LABEL,
  KIND_TONE,
  DateTile,
  KeyQr,
  LinkBtn,
  Page,
  clock,
  fmt,
  humanise,
  plural,
  useTick,
  ymd,
} from './CitizenKit'

// Citizen Home (CitizenHome.dc.html). Synthetic demo data only. Real data comes from the
// citizen API; nothing here is mocked in the browser.

function greetingWord(): string {
  const h = fmt.hour(new Date())
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Share of the key profile fields that are filled in (a simple client-side count, not a score from the API). */
function profileCompleteness(p: CitizenProfileResponse): number {
  const checks = [
    Boolean(p.person.fullName),
    Boolean(p.person.dateOfBirth),
    Boolean(p.person.sex),
    Boolean(p.person.abhaNumber),
    p.person.kycStatus === 'passed',
    p.person.faceCheckStatus === 'passed',
    p.profile.bloodGroup !== 'unknown',
    Boolean(p.profile.district),
    p.emergencyContacts.length > 0,
    Boolean(p.profile.preferredLanguage),
    p.profile.organDonorStatus !== 'none' && p.profile.organDonorStatus !== 'undecided',
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

function Header() {
  const profile = useCitizenProfile()
  const upcoming = useUpcoming(30)
  const today = upcoming.data?.today
  const events = upcoming.data?.events ?? []
  const week = events.filter((e) => e.kind === 'appt' && e.inDays >= 0 && e.inDays <= 7 && e.status === 'scheduled')
  const refills = events.filter((e) => e.kind === 'med' && e.inDays >= 0 && e.inDays <= 7)
  const nextTest = events.find((e) => e.kind === 'test' && e.inDays >= 0)
  const p = profile.data
  const first = p?.person.fullName.split(' ')[0]
  const place = p?.profile.district?.name

  const bits: string[] = []
  if (upcoming.data) {
    bits.push(`${plural(week.length, 'appointment')} this week`)
    bits.push(`${plural(refills.length, 'refill')} due soon`)
    if (nextTest) bits.push(`a ${nextTest.title.toLowerCase()} on ${fmt.dayMon(nextTest.startsAt)}`)
  }
  const sentence = bits.length ? `You have ${bits.slice(0, -1).join(', ')}${bits.length > 1 ? ' and ' : ''}${bits[bits.length - 1]}.` : ' '
  const dateLine = [today ? fmt.dateLong(`${today}T06:30:00Z`) : null, place].filter(Boolean).join(' · ')
  const pct = p ? profileCompleteness(p) : null

  return (
    <header className="c1-head c1-in">
      <div>
        <p className="c1-muted" style={{ margin: '0 0 4px' }}>{dateLine || ' '}</p>
        <h1 className="c1-ttl" style={{ fontSize: 34 }}>
          {greetingWord()}
          {first ? `, ${first}` : ''}
        </h1>
        <p>{sentence}</p>
      </div>
      <div className="c1-flt">
        {pct !== null ? (
          <Badge tone="success" dot>
            Profile {pct}% complete
          </Badge>
        ) : null}
        {p?.person.abhaNumber ? <Badge tone="outline">ABHA {p.person.abhaNumber}</Badge> : null}
      </div>
    </header>
  )
}

function QuickActions() {
  const go = useNavigate()
  const items: { to: string; title: string; sub: string; icon: string; bg: string; fg: string }[] = [
    { to: '/citizen/access', title: 'Share with a doctor', sub: 'Show your rotating key', icon: ICONS.qr, bg: 'var(--tint-teal)', fg: 'var(--primary-text)' },
    { to: '/citizen/ai-chat', title: 'Ask the AI', sub: 'Guidance, not diagnosis', icon: ICONS.ai, bg: 'var(--tint-lavender)', fg: 'var(--ai)' },
    { to: '/citizen/care', title: 'Book appointment', sub: 'Free · pay at hospital', icon: ICONS.calAdd, bg: 'var(--tint-blue)', fg: 'var(--info)' },
    { to: '/citizen/documents', title: 'Upload a report', sub: 'PDF, photo or scan', icon: ICONS.upload, bg: 'var(--tint-peach)', fg: 'var(--peach-text)' },
  ]
  return (
    <section aria-label="Quick actions" className="c1-grid c1-g4 c1-in" style={{ animationDelay: '60ms' }}>
      {items.map((i) => (
        <button key={i.to} type="button" className="c1-qa" onClick={() => go(i.to)}>
          <span className="c1-ic" style={{ background: i.bg, color: i.fg }}>
            <Icon d={i.icon} size={22} />
          </span>
          <strong>{i.title}</strong>
          <span className="s">{i.sub}</span>
        </button>
      ))}
    </section>
  )
}

function KeyCard() {
  useTick(1000)
  const key = useRotatingKey()
  const go = useNavigate()
  const k = key.data
  const left = k ? Math.max(0, Math.ceil((new Date(k.expiresAt).getTime() - Date.now()) / 1000)) : 0
  const frac = k ? Math.min(1, left / k.windowSeconds) : 0
  return (
    <div className="c1-key" aria-label="Your sharing key">
      <svg aria-hidden="true" viewBox="0 0 64 64" width="220" height="220" style={{ position: 'absolute', right: -50, bottom: -60, opacity: 0.12 }}>
        <rect x="21" y="5" width="18" height="50" rx="9" fill="#faf5ef" />
        <rect x="9" y="25" width="50" height="18" rx="9" fill="#faf5ef" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }}>Share with doctor</span>
        <span style={{ fontSize: 13 }}>{k ? `New key in ${left} s` : ''}</span>
      </div>
      {key.isPending ? (
        <Skeleton width="70%" height={40} />
      ) : k ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span className="c1-key-code" aria-live="off">{k.display}</span>
          <KeyQr code={k.code} />
        </div>
      ) : (
        <span role="alert">The key is not available right now. {errorMessage(key.error, '')}</span>
      )}
      <div className="c1-kb">
        <span style={{ transform: `scaleX(${frac})` }} />
      </div>
      <p style={{ margin: 0, fontSize: 13, position: 'relative' }}>
        {k?.note ?? 'Opens a 30-minute session for one doctor.'} Used once.{' '}
        <button type="button" className="c1-lk" style={{ color: 'inherit', textDecoration: 'underline' }} onClick={() => go('/citizen/access')}>
          Open Share and access
        </button>
      </p>
    </div>
  )
}

function ActiveSession() {
  useTick(1000)
  const overview = useAccessOverview()
  const end = useEndSession()
  const go = useNavigate()
  return (
    <Box
      title="Active session"
      actions={
        <span className="c1-is-live">
          <span className="c1-live" aria-hidden="true" />
          {overview.data?.liveSessions.length ? 'Live now' : 'No live session'}
        </span>
      }
    >
      <Async query={overview} what="your live session" skeleton={<Skeleton lines={4} height={14} />}>
        {(o: AccessOverviewResponse) => {
          const s = o.liveSessions[0]
          if (!s) {
            return (
              <EmptyState title="Nobody has your record open">
                A session starts when a doctor types or scans your key. It closes by itself after 30 minutes.
              </EmptyState>
            )
          }
          const left = Math.max(0, Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / 1000))
          const total = Math.max(1, Math.round((new Date(s.expiresAt).getTime() - new Date(s.startedAt).getTime()) / 1000))
          return (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar name={s.doctorName} size={44} />
                <div style={{ minWidth: 0 }}>
                  <strong className="c1-strong">{s.doctorName}</strong>
                  <div className="c1-muted">{[s.doctorLine, s.facility].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span className="c1-num" style={{ fontSize: 32, lineHeight: '40px', fontWeight: 600, color: 'var(--ink-strong)' }}>{clock(left)}</span>
                <span className="c1-muted">
                  left of {clock(total)}
                  {s.scopeChips.length ? ` · viewing ${s.scopeChips.join(', ')}` : ''}
                </span>
              </div>
              <div className="c1-progress" role="progressbar" aria-label="Session time left" aria-valuemin={0} aria-valuemax={total} aria-valuenow={left}>
                <div style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
              </div>
              {end.isError ? <Alert tone="danger" title="Could not end the session">{errorMessage(end.error)}</Alert> : null}
              <div className="c1-flt">
                <Button variant="danger" size="sm" loading={end.isPending} onClick={() => end.mutate(s.id)}>
                  End session
                </Button>
                <Button variant="ghost" size="sm" onClick={() => go('/citizen/access')}>
                  See what was opened
                </Button>
              </div>
            </>
          )
        }}
      </Async>
    </Box>
  )
}

function EmergencyCard() {
  const profile = useCitizenProfile()
  const go = useNavigate()
  return (
    <Box title="Emergency card" actions={<LinkBtn onClick={() => go('/citizen/profile')}>Edit</LinkBtn>}>
      <Async query={profile} what="your emergency card" skeleton={<Skeleton lines={4} height={14} />}>
        {(p) => {
          const contact = [...p.emergencyContacts].sort((a, b) => a.priority - b.priority)[0]
          const conditions = p.specialCategories.map((c) => c.categoryName).join(', ')
          const cat = p.specialCategories[0]
          return (
            <>
              <dl className="c1-kv two" style={{ margin: 0 }}>
                <div><dt>Blood group</dt><dd>{p.profile.bloodGroup === 'unknown' ? 'Not set' : p.profile.bloodGroup}</dd></div>
                <div><dt>Organ donor</dt><dd>{humanise(p.profile.organDonorStatus)}</dd></div>
                <div><dt>Conditions</dt><dd>{conditions || 'None recorded'}</dd></div>
                <div><dt>Contact</dt><dd>{contact?.contactName ?? 'Not set'}</dd></div>
              </dl>
              {cat ? (
                <div className="c1-flt">
                  <Badge tone="peach">Special category: {cat.categoryName} — {cat.status}</Badge>
                </div>
              ) : null}
              <p className="c1-muted" style={{ margin: 0 }}>Visible to a doctor in an emergency, even without your key.</p>
            </>
          )
        }}
      </Async>
    </Box>
  )
}

function Numbers() {
  const upcoming = useUpcoming(30)
  const vitals = useVitalsSummary()
  const folders = useFolders()
  const total = (folders.data ?? []).reduce((n, f) => n + f.documentCount, 0)
  const nextAppt = upcoming.data?.events.find((e) => e.kind === 'appt' && e.status === 'scheduled' && e.inDays >= 0)
  const refills = (upcoming.data?.events ?? []).filter((e) => e.kind === 'med' && e.inDays >= 0)
  const bp = vitals.data?.latest.bp
  const bpStatus = bp ? (bp.status === 'in_range' ? 'On target' : humanise(bp.status)) : ''
  if (upcoming.isPending || vitals.isPending || folders.isPending) {
    return (
      <section aria-label="Your numbers" className="c1-grid c1-g4" role="status">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={110} radius={20} />)}
      </section>
    )
  }
  return (
    <section aria-label="Your numbers" className="c1-grid c1-g4 c1-in" style={{ animationDelay: '180ms' }}>
      <StatCard
        label="Next appointment"
        value={nextAppt ? `${fmt.weekdayShort(nextAppt.startsAt)} ${fmt.day(nextAppt.startsAt)}` : 'None'}
        unit={nextAppt ? `${fmt.mon(nextAppt.startsAt)} · ${fmt.time(nextAppt.startsAt)}` : undefined}
        hint={nextAppt ? `${nextAppt.title} · ${humanise(nextAppt.status)}` : 'Book one from Find care'}
        icon={<Icon d={ICONS.cal} />}
        tone="blue"
      />
      <StatCard
        label="Refills due"
        value={String(refills.length)}
        unit="in the next 30 days"
        hint={refills[0] ? `Next: ${refills[0].title} on ${fmt.dayMon(refills[0].startsAt)}` : 'Nothing due'}
        icon={<Icon d={ICONS.pill} />}
      />
      <StatCard
        label="Blood pressure"
        value={bp && bp.systolic !== null ? `${bp.systolic}/${bp.diastolic}` : '—'}
        unit="mmHg"
        hint={bp ? `${bpStatus} · ${vitals.data?.bp30.inRange ?? 0} of ${vitals.data?.bp30.count ?? 0} readings in range` : 'No reading yet'}
        icon={<Icon d={ICONS.pulse} />}
        tone="sage"
      />
      <StatCard
        label="Documents"
        value={String(total)}
        hint={`${plural(folders.data?.length ?? 0, 'folder')} in your record`}
        icon={<Icon d={ICONS.doc} />}
      />
    </section>
  )
}

function DatesCard() {
  const go = useNavigate()
  const upcoming = useUpcoming(10)
  return (
    <Box title="Dates to remember" actions={<LinkBtn onClick={() => go('/citizen/dates')}>All dates</LinkBtn>}>
      <Async query={upcoming} what="your dates">
        {(u) => {
          const list = u.events.filter((e: DatedEventDto) => e.kind !== 'visit').slice(0, 5)
          if (!list.length) {
            return (
              <EmptyState title="Nothing coming up" action={<Button variant="soft" size="sm" onClick={() => go('/citizen/dates')}>Add a reminder</Button>}>
                Appointments, refills and tests show here.
              </EmptyState>
            )
          }
          return (
            <div>
              {list.map((e) => (
                <div className="c1-row" key={e.id}>
                  <DateTile iso={e.startsAt} tone={KIND_TONE(e.kind)} />
                  <div className="c1-grow">
                    <strong className="c1-strong">{e.title}</strong>
                    <div className="c1-muted">{e.notes ?? fmt.time(e.startsAt)}</div>
                  </div>
                  <Badge tone={KIND_BADGE[e.kind] ?? 'neutral'}>{e.kind === 'appt' && e.status === 'scheduled' ? 'Confirmed' : (KIND_LABEL[e.kind] ?? 'Date')}</Badge>
                </div>
              ))}
            </div>
          )
        }}
      </Async>
    </Box>
  )
}

function MedicinesCard() {
  const go = useNavigate()
  const upcoming = useUpcoming(30)
  const refills = (upcoming.data?.events ?? []).filter((e) => e.kind === 'med' && e.inDays >= 0).slice(0, 3)
  return (
    <Box title="Medicines" actions={<LinkBtn onClick={() => go('/citizen/medicines')}>Prescriptions</LinkBtn>}>
      <Async query={upcoming} what="your medicines">
        {() =>
          refills.length ? (
            <>
              {refills.map((e) => (
                <div key={e.id} className="c1-med">
                  <span className="c1-ic t-med" style={{ width: 36, height: 36 }}><Icon d={ICONS.pill} size={18} /></span>
                  <div className="c1-grow">
                    <strong className="c1-strong">{e.title}</strong>
                    <div className="c1-muted">{e.notes ?? 'Refill reminder'}</div>
                  </div>
                  <span className="c1-muted c1-num">{fmt.dayMon(e.startsAt)}</span>
                </div>
              ))}
            </>
          ) : (
            <EmptyState title="No refills due">Your prescriptions and daily doses are in Medicines.</EmptyState>
          )
        }
      </Async>
      <div style={{ marginTop: 4, padding: 14, borderRadius: 14, background: 'var(--tint-blue)', display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ color: 'var(--info)' }}><Icon d={ICONS.search} size={22} /></span>
        <span style={{ flex: 1, fontSize: 14 }}>
          <strong className="c1-strong">Find a medicine in stock</strong> at a nearby pharmacy.
        </span>
        <LinkBtn onClick={() => go('/citizen/medicines')}>Find</LinkBtn>
      </div>
    </Box>
  )
}

const DOC_TONE: Record<string, { icon: string; bg: string; fg: string }> = {
  lab_report: { icon: ICONS.doc, bg: 'var(--tint-blue)', fg: 'var(--info)' },
  scan: { icon: ICONS.docTick, bg: 'var(--tint-lavender)', fg: 'var(--ai)' },
  prescription: { icon: ICONS.docTick, bg: 'var(--tint-teal)', fg: 'var(--primary-text)' },
}

function RecentDocs() {
  const go = useNavigate()
  const folders = useFolders()
  const docs = useRecentDocuments(3)
  const recent = docs.data ?? []
  const folderName = new Map((folders.data ?? []).map((f) => [f.id, f.name]))
  const loading = folders.isPending || docs.isPending
  return (
    <Box title="Recent documents" actions={<LinkBtn onClick={() => go('/citizen/documents')}>Open folders</LinkBtn>}>
      {loading ? (
        <Skeleton lines={4} height={14} />
      ) : folders.isError || docs.isError ? (
        <Alert tone="warning" title="Could not load documents">{errorMessage(folders.error ?? docs.error)}</Alert>
      ) : recent.length === 0 ? (
        <EmptyState title="No documents yet" action={<Button variant="soft" size="sm" onClick={() => go('/citizen/documents')}>Upload a report</Button>}>
          Reports and prescriptions your care team adds will show here.
        </EmptyState>
      ) : (
        <div>
          {recent.map((d) => {
            const t = DOC_TONE[d.docType] ?? { icon: ICONS.doc, bg: 'var(--tint-peach)', fg: 'var(--peach-text)' }
            return (
              <div className="c1-row" key={d.id}>
                <span className="c1-ic" style={{ width: 36, height: 36, background: t.bg, color: t.fg }}><Icon d={t.icon} size={18} /></span>
                <div className="c1-grow">
                  <strong className="c1-strong" style={{ fontSize: 14 }}>{d.title}</strong>
                  <div className="c1-muted">{folderName.get(d.folderId) ?? humanise(d.docType)} · {fmt.date(d.createdAt)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Box>
  )
}

/**
 * Only doctor-reviewed AI results may reach a citizen. The citizen API has no reviewed-results
 * endpoint yet, so until it does this card states the rule instead of showing any AI output.
 */
function ReviewedResults() {
  return (
    <Box tone="lav" title="Reviewed results">
      <EmptyState title="No reviewed AI results yet" icon={<Icon d={ICONS.ai} size={24} />}>
        Simulated AI output reaches you only after your doctor has reviewed it. Nothing is waiting right now.
      </EmptyState>
    </Box>
  )
}

function HealthAlerts() {
  const go = useNavigate()
  const alerts = useAlertsSummary(6)
  return (
    <Box title="Health alerts" actions={<LinkBtn onClick={() => go('/citizen/alerts')}>All alerts</LinkBtn>}>
      <Async query={alerts} what="your alerts">
        {(a) => {
          const list = a.items.filter((i) => i.group === 'emergency' || i.group === 'health_dept').slice(0, 2)
          if (!list.length) return <EmptyState title="No health alerts">Alerts from the health department appear here.</EmptyState>
          return (
            <>
              {list.map((i) => (
                <Alert key={i.id} tone={i.severity === 'emergency' ? 'danger' : 'info'} title={i.title}>
                  {i.severity === 'emergency' ? 'Emergency alert · ' : ''}
                  {i.body}
                  {i.severity === 'emergency' ? " Can't be muted." : ''}
                </Alert>
              ))}
            </>
          )
        }}
      </Async>
    </Box>
  )
}

function BpCard() {
  const go = useNavigate()
  const vitals = useVitalsSummary()
  return (
    <Box title="Blood pressure · 30 days" actions={<Badge tone="neutral">Self-reported</Badge>}>
      <Async query={vitals} what="your blood pressure">
        {(v) => {
          if (!v.bp30.series.length) return <EmptyState title="No readings yet">Add a reading to see your trend.</EmptyState>
          const first = v.bp30.series[0]!
          return (
            <>
              <TrendChart
                points={v.bp30.series.map((s) => ({ measuredAt: s.measuredAt, value: s.systolic }))}
                label={`Systolic pressure trend over ${v.bp30.days} days, latest ${v.bp30.series[v.bp30.series.length - 1]!.systolic}`}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }} className="c1-muted">
                <span>{fmt.dayMon(first.measuredAt)}</span>
                <span>Avg {v.bp30.avgSystolic}/{v.bp30.avgDiastolic}</span>
                <span>Latest</span>
              </div>
            </>
          )
        }}
      </Async>
      <Button variant="soft" size="sm" onClick={() => go('/citizen/vitals')}>Add a reading</Button>
    </Box>
  )
}

function Giving() {
  const go = useNavigate()
  const profile = useCitizenProfile()
  const upcoming = useUpcoming(30)
  const next = upcoming.data?.events.find((e) => e.kind === 'give' && e.inDays >= 0)
  const p = profile.data
  const row = (icon: ReactNode, title: string, text: string, to: string) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, background: 'rgba(250,245,239,.7)' }}>
      {icon}
      <div style={{ flex: 1 }}>
        <strong className="c1-strong">{title}</strong>
        <div className="c1-muted">{text}</div>
      </div>
      <LinkBtn onClick={() => go(to)}>Open</LinkBtn>
    </div>
  )
  return (
    <Box tone="sage" title="Giving">
      {profile.isPending ? (
        <Skeleton lines={3} height={14} />
      ) : (
        <>
          {row(
            <span style={{ color: 'var(--danger)' }}><Icon d={ICONS.drop} size={26} /></span>,
            `Blood donor${p && p.profile.bloodGroup !== 'unknown' ? ` · ${p.profile.bloodGroup}` : ''}`,
            next ? `${next.title} · ${fmt.dayMon(next.startsAt)}` : 'Open to see requests near you',
            '/citizen/blood',
          )}
          {row(
            <span style={{ color: 'var(--success)' }}><Icon d={ICONS.heart} size={26} /></span>,
            'Organ pledge',
            p ? humanise(p.profile.organDonorStatus) : '',
            '/citizen/organ',
          )}
        </>
      )}
    </Box>
  )
}

function WhoOpened() {
  const go = useNavigate()
  const history = useAccessHistory('all')
  const today = useUpcoming(1).data?.today
  return (
    <Box title="Who opened your record" actions={<LinkBtn onClick={() => go('/citizen/access')}>History</LinkBtn>}>
      <Async query={history} what="your access history">
        {(h) =>
          h.rows.length === 0 ? (
            <EmptyState title="No one has opened your record">Every open is listed here.</EmptyState>
          ) : (
            <div>
              {h.rows.slice(0, 3).map((r) => (
                <div className="c1-row" key={r.id}>
                  <Avatar name={r.who} size={32} />
                  <div className="c1-grow">
                    <strong className="c1-strong" style={{ fontSize: 14 }}>{r.who}{r.role !== 'Doctor' ? ` · ${r.role}` : ''}</strong>
                    <div className="c1-muted">
                      {today && ymd(r.at) === today ? `Today ${fmt.time(r.at)}` : fmt.dateTime(r.at)} · {r.how.toLowerCase()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </Async>
    </Box>
  )
}

function Connected() {
  const { events, unavailable } = useEvents('CITIZEN')
  const list = events.slice(0, 4)
  return (
    <Box
      title="Connected apps"
      actions={
        <span className="c1-is-live">
          <span className="c1-live" aria-hidden="true" />
          Live from your care team
        </span>
      }
    >
      {unavailable ? (
        <Alert tone="warning" title="Live updates are paused">The feed from your care team could not be reached.</Alert>
      ) : list.length === 0 ? (
        <EmptyState title="Nothing new yet">Doctors, labs and pharmacies post here when they act on your care.</EmptyState>
      ) : (
        <div className="c1-feed" aria-live="polite">
          {list.map((e) => {
            const tag = eventTag(e.type)
            const inner = (
              <>
                <span className={clsx('c1-ev-f', `cf-tk-${tag.tone}`)}>{tag.tag}</span>
                <span style={{ minWidth: 0 }}>
                  <b>{e.title}</b>
                  <span className="t">{e.text}</span>
                </span>
                <time dateTime={e.at}>{e.at ? fmt.time(e.at) : ''}</time>
              </>
            )
            return e.href?.startsWith('/') ? (
              <Link key={e.id} className="c1-ev" to={e.href}>{inner}</Link>
            ) : (
              <div key={e.id} className="c1-ev">{inner}</div>
            )
          })}
        </div>
      )}
      <p className="c1-muted" style={{ margin: 0 }}>
        Doctors, labs, pharmacies and your district health office update this as they act on your care.
      </p>
    </Box>
  )
}

const JOURNEY: { label: string; desc: string; to: string; link: string }[] = [
  { label: 'Prescribed', desc: 'Your doctor e-signed it', to: '/citizen/documents', link: 'Documents' },
  { label: 'Sent to pharmacy', desc: 'Signature and QR checked', to: '/citizen/medicines', link: 'Medicines' },
  { label: 'Ready to collect', desc: 'Packed by the pharmacist', to: '/citizen/medicines', link: 'Pickup' },
  { label: 'Collected', desc: 'Show your key at the counter', to: '/citizen/medicines', link: 'My medicines' },
]

function PrescriptionJourney() {
  const go = useNavigate()
  const { events, unavailable } = useEvents('CITIZEN')
  const has = (t: string) => events.some((e) => e.type === t)
  const stage = has('collected') ? 4 : has('dispensed') ? 3 : has('prescription') ? 2 : 0
  const rx = events.find((e) => e.type === 'prescription')
  const badge: { tone: BadgeTone; text: string } =
    stage >= 4 ? { tone: 'success', text: 'Collected' } : stage === 3 ? { tone: 'success', text: 'Ready to collect' } : stage === 2 ? { tone: 'teal', text: 'At pharmacy' } : { tone: 'neutral', text: 'None in progress' }
  return (
    <Box title="Prescription journey" actions={<Badge tone={badge.tone}>{badge.text}</Badge>}>
      {stage === 0 ? (
        <EmptyState title={unavailable ? 'Live updates are paused' : 'No prescription in progress'}>
          When a doctor e-signs a prescription for you, its steps show here.
        </EmptyState>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong className="c1-strong">{rx?.text.split(' · ')[0] ?? 'Your prescription'}</strong>
            {rx ? ' · e-signed' : ''}
          </p>
          <ol className="c1-jr" aria-label="Prescription progress">
            {JOURNEY.map((j, i) => {
              const n = i + 1
              const cls = n < stage ? 'on' : n === stage ? 'now' : ''
              return (
                <li key={j.label} className={clsx('c1-js', cls)} aria-current={n === stage ? 'step' : undefined}>
                  <span className="c1-js-n">{n < stage ? '✓' : n}</span>
                  <b>{j.label}</b>
                  <span className="d">{j.desc}</span>
                  <Link to={j.to} style={{ marginTop: 'auto', fontSize: 12, fontWeight: 600 }}>{j.link} →</Link>
                </li>
              )
            })}
          </ol>
        </>
      )}
      <div className="c1-flt" style={{ alignItems: 'center' }}>
        <Button variant="soft" size="sm" onClick={() => go('/citizen/medicines')}>See in Medicines</Button>
        <Button variant="ghost" size="sm" onClick={() => go('/citizen/complaints')}>Report a problem</Button>
      </div>
    </Box>
  )
}

export default function CitizenHome() {
  return (
    <Page label="Citizen home">
      <Header />
      <QuickActions />
      <section className="c1-grid c1-g3 c1-in" style={{ animationDelay: '120ms' }}>
        <KeyCard />
        <ActiveSession />
        <EmergencyCard />
      </section>
      <Numbers />
      <section className="c1-grid c1-g2 c1-in" style={{ animationDelay: '240ms' }}>
        <DatesCard />
        <MedicinesCard />
      </section>
      <section className="c1-grid c1-g3 c1-in" style={{ animationDelay: '300ms' }}>
        <RecentDocs />
        <ReviewedResults />
        <HealthAlerts />
      </section>
      <section className="c1-grid c1-g3 c1-in" style={{ animationDelay: '360ms' }}>
        <BpCard />
        <Giving />
        <WhoOpened />
      </section>
      <section className="c1-grid c1-g2 c1-in" style={{ animationDelay: '420ms' }}>
        <Connected />
        <PrescriptionJourney />
      </section>
    </Page>
  )
}

import { Link } from 'react-router-dom'
import { Avatar, Badge, PageHeader, StatCard } from '../../../components/ui'
import { useAuth } from '../../../context/AuthContext'
import { useEvents, eventTag } from '../../../hooks/useEvents'
import { useHospitalComplaints, useHospitalOverview } from '../../../api/hospitalAdmin'
import type { HospitalAuditItem, HospitalOverview } from '../../../api/hospitalAdmin'
import { Async, Bar, Box, HeroCross, ICONS, Icon, KV, PageSkeleton, Row, RowText, Stars, fmtDateTime, fmtTime, humanise, num, roleLabelOf } from '../opsKit'
import { COMPLAINT_STATE, SectionLink, greeting, sectionHref, shortGreetingName, weekdayLong } from './shared'

function occTone(pct: number): 'low' | 'mid' | undefined {
  return pct >= 95 ? 'low' : pct >= 85 ? 'mid' : undefined
}

function activityIcon(a: HospitalAuditItem) {
  if (a.group === 'access') return { d: ICONS.warn, tone: 'danger' as const }
  if (a.group === 'admin') return { d: ICONS.tick, tone: 'sage' as const }
  return { d: ICONS.cog, tone: 'blue' as const }
}

function statusBadge(status: string) {
  if (status === 'pending') return { tone: 'warning' as const, label: 'Pending' }
  if (status === 'approved') return { tone: 'success' as const, label: 'Approved' }
  if (status === 'rejected') return { tone: 'danger' as const, label: 'Rejected' }
  return { tone: 'neutral' as const, label: humanise(status) }
}

function ConnectedApps() {
  const { user } = useAuth()
  const { events, unavailable } = useEvents(user?.role)
  const top = events.slice(0, 4)
  return (
    <Box title="Connected apps" actions={<Badge tone="teal" dot>Live</Badge>}>
      {unavailable ? (
        <p className="ak-muted">Activity from other apps is not available right now.</p>
      ) : top.length === 0 ? (
        <p className="ak-muted">Nothing new from the other apps yet.</p>
      ) : (
        top.map((e) => {
          const { tag } = eventTag(e.type)
          const body = (
            <>
              <span className="ak-feed-top">
                <span className="ak-from">{roleLabelOf(e.from)}</span>
                <span className="ak-muted">{fmtTime(e.at)}</span>
              </span>
              <span className="ak-feed-title">
                <span aria-hidden="true" className="ak-muted" style={{ marginRight: 6 }}>
                  {tag}
                </span>
                {e.title}
              </span>
              <span className="ak-feed-text">{e.text}</span>
            </>
          )
          return e.href && e.href.startsWith('/') ? (
            <Link key={e.id} className="ak-feed" to={e.href}>
              {body}
            </Link>
          ) : (
            <div key={e.id} className="ak-feed">
              {body}
            </div>
          )
        })
      )}
    </Box>
  )
}

function ComplaintsPeek() {
  const q = useHospitalComplaints('open')
  const items = (q.data?.items ?? []).slice(0, 3)
  return (
    <Box
      title="Citizen complaints"
      actions={
        <SectionLink to="complaints">
          Inbox{q.data ? ` · ${q.data.openCount} open` : ''}
        </SectionLink>
      }
    >
      {q.isPending ? (
        <p className="ak-muted">Loading complaints...</p>
      ) : q.isError ? (
        <p className="ak-muted">Complaints could not be loaded.</p>
      ) : items.length === 0 ? (
        <p className="ak-muted">No open complaints.</p>
      ) : (
        <div>
          {items.map((k) => (
            <Row key={k.id} icon={<Icon d={ICONS.chat} />} tone="peach" trailing={<Badge tone={COMPLAINT_STATE[k.state].tone}>{COMPLAINT_STATE[k.state].label}</Badge>}>
              <RowText title={k.title} sub={`${k.refNo} · ${fmtDateTime(k.createdAt)}`} />
            </Row>
          ))}
        </div>
      )}
    </Box>
  )
}

function View({ o }: { o: HospitalOverview }) {
  const k = o.kpis
  const opTrend =
    k.opTrendPct === null
      ? undefined
      : { direction: (k.opTrendPct >= 0 ? 'up' : 'down') as 'up' | 'down', text: `${k.opTrendPct >= 0 ? '+' : ''}${k.opTrendPct}% vs last week` }
  const duty = o.staffOnDuty
  return (
    <div className="ak-page">
      <PageHeader
        eyebrow={`${weekdayLong(o.asOf)} · ${o.hospital.district}`}
        title={`${greeting(o.asOf)}, ${shortGreetingName(o.admin.name)}`}
        subtitle={`${k.pendingApprovals} staff approvals, ${o.breakGlass.needReview} break-glass reviews and bed occupancy at ${k.bedOccupancyPct ?? 0}%.`}
        actions={
          <div className="ak-wrap">
            {o.hospital.verifiedAt ? <Badge tone="success" dot>HFR verified</Badge> : <Badge tone="warning" dot>HFR not verified</Badge>}
            <Badge tone="outline">{o.hospital.hfrId}</Badge>
          </div>
        }
      />

      <div className="ak-grid ak-g4 ak-in">
        <StatCard label="OP visits today" value={num(k.opVisitsToday)} trend={opTrend} hint={opTrend ? undefined : 'No visits recorded this day last week'} icon={<Icon d={ICONS.users} />} tone="sage" />
        <StatCard label="Beds occupied" value={num(k.bedsOccupied)} unit={`of ${num(k.bedsTotal)}`} hint={`ICU ${k.icuBedsOccupied} of ${k.icuBedsTotal}`} icon={<Icon d={ICONS.bed} />} tone="blue" />
        <StatCard label="Active doctor sessions" value={num(k.activeDoctorSessions)} hint="Citizen-key sessions right now" icon={<Icon d={ICONS.key} />} />
        <StatCard label="Pending approvals" value={num(k.pendingApprovals)} hint="Doctors and staff" icon={<Icon d={ICONS.check} />} tone="peach" />
      </div>

      <div className="ak-grid ak-g21 ak-in">
        <Box title="Bed occupancy by department" actions={<SectionLink to="beds">Departments</SectionLink>}>
          {o.occupancyByDepartment.length === 0 ? (
            <p className="ak-muted">No beds are set up yet.</p>
          ) : (
            o.occupancyByDepartment.map((d) => (
              <div key={d.department} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, gap: 8 }}>
                  <strong style={{ color: 'var(--ink)' }}>{d.department}</strong>
                  <span className="ak-muted">
                    {d.occupied} of {d.total} {'·'} {d.pctFull}%
                  </span>
                </div>
                <Bar pct={d.pctFull} tone={occTone(d.pctFull)} />
              </div>
            ))
          )}
        </Box>
        <div className="ak-hero">
          <HeroCross />
          <span className="ak-eyebrow">Break-glass this week</span>
          <span className="ak-hero-big">{o.breakGlass.thisWeek}</span>
          <p>
            emergency record openings without a citizen key. {o.breakGlass.needReview} still {o.breakGlass.needReview === 1 ? 'needs' : 'need'} your review within {o.breakGlass.reviewWindowHours} hours.
          </p>
          <div>
            <Link to={sectionHref('breakglass')} className="cf-btn cf-btn-secondary cf-btn-sm" style={{ textDecoration: 'none' }}>
              <span className="cf-btn-label">Review now</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="ak-grid ak-g3 ak-in">
        <Box title="Approval queue" actions={<SectionLink to="approvals">Open</SectionLink>}>
          {o.approvalQueue.length === 0 ? (
            <p className="ak-muted">No applicants are waiting.</p>
          ) : (
            <div>
              {o.approvalQueue.slice(0, 3).map((a) => {
                const b = statusBadge(a.status)
                return (
                  <Row key={a.id} icon={undefined} trailing={<Badge tone={b.tone}>{b.label}</Badge>}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Avatar name={a.name} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <RowText title={a.name} sub={`${a.role ?? 'Staff'} · ${a.department ?? 'No department'}`} />
                      </div>
                    </div>
                  </Row>
                )
              })}
            </div>
          )}
        </Box>
        <Box title="Staff on duty" actions={<SectionLink to="staff">Staff</SectionLink>}>
          <KV
            items={[
              { label: 'Doctors', value: duty.doctors },
              { label: 'Nurses', value: duty.nurses },
              { label: 'Lab', value: duty.lab },
              { label: 'Radiology', value: duty.radiology },
              { label: 'Pharmacy', value: duty.pharmacy },
              { label: 'Admin', value: duty.admin },
            ]}
          />
        </Box>
        <Box title="Recent activity" actions={<SectionLink to="audit">Audit log</SectionLink>}>
          {o.recentActivity.length === 0 ? (
            <p className="ak-muted">Nothing has happened yet today.</p>
          ) : (
            <div>
              {o.recentActivity.slice(0, 4).map((a) => {
                const ic = activityIcon(a)
                return (
                  <Row key={a.seq} icon={<Icon d={ic.d} />} tone={ic.tone}>
                    <RowText title={a.summary} sub={`${a.actor} · ${fmtTime(a.at)}`} />
                  </Row>
                )
              })}
            </div>
          )}
        </Box>
      </div>

      <div className="ak-grid ak-g3 ak-in">
        <ConnectedApps />
        <ComplaintsPeek />
        <Box title="Citizen rating" actions={<SectionLink to="reviews">Reviews</SectionLink>}>
          {o.rating.count === 0 ? (
            <p className="ak-muted">No citizen reviews yet.</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="ak-big">{o.rating.average?.toFixed(1) ?? '-'}</span>
                <Stars n={o.rating.average ?? 0} label={`Average rating ${o.rating.average?.toFixed(1) ?? 'not available'} out of 5`} />
                <span className="ak-muted">{num(o.rating.count)} reviews</span>
              </div>
              {o.rating.distribution.map((r) => (
                <div key={r.stars} className="ak-rb">
                  <span className="ak-muted">{r.stars} star</span>
                  <Bar pct={r.pct} tone={r.stars <= 2 ? 'low' : 'gold'} />
                  <span className="ak-muted">{r.pct}%</span>
                </div>
              ))}
              <div className="ak-stack" style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)', gap: 8 }}>
                <span className="ak-muted" style={{ fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Most mentioned
                </span>
                <div className="ak-wrap" style={{ gap: 6 }}>
                  {o.rating.topTags.slice(0, 4).map((t) => (
                    <Badge key={t.tag} tone="teal">
                      {t.tag} {'·'} {t.count}
                    </Badge>
                  ))}
                </div>
                <span className="ak-muted">
                  {o.rating.verifiedCount} verified reviews {'·'} {o.rating.repliedWithin3DaysPct}% replied within 3 days
                </span>
              </div>
            </>
          )}
        </Box>
      </div>
    </div>
  )
}

export default function Overview() {
  const q = useHospitalOverview()
  return (
    <Async query={q} skeleton={<PageSkeleton boxes={3} />}>
      {(o) => <View o={o} />}
    </Async>
  )
}

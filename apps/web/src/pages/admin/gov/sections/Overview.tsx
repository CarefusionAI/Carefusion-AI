import type { GovGrievances, GovOverview } from '@carefusion/shared'
import { useGovOverview } from '../../../../api/gov'
import { AIInsight, Alert, Badge, Card, EmptyState, PageHeader, Skeleton, StatCard } from '../../../../components/ui'
import { Dot, KV, QueryState, WidgetView } from '../common'
import { BarChart, C, FunnelBars, HBars, LineChart, StackedBars } from '../charts'
import { MapPanel } from './MapSection'
import type { SectionProps } from '../types'
import { ageText, fmtDateTime, fmtNum, fmtNum1, humanise, isoWeekLabel, severityTone, statusTone } from '../util'

const TONES = ['blue', 'sage', undefined, 'peach'] as const

function weekOf(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const wk = 1 + Math.round(((d.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)
  return isoWeekLabel(wk)
}

function OverviewSkeleton() {
  return (
    <div role="status" aria-label="Loading overview" className="gv-stack">
      <Skeleton width="50%" height={32} />
      <div className="gv-grid-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={110} radius={16} />
        ))}
      </div>
      <Skeleton height={300} radius={16} />
    </div>
  )
}

function GrievanceCard({ data, onOpen }: { data: { open: number; ageing: GovGrievances['ageing']; items: GovGrievances['items'] }; onOpen: () => void }) {
  return (
    <Card title="Grievances" titleAs="h3" actions={<Badge tone="warning">{data.open} open</Badge>}>
      {data.items.length ? (
        <ul className="gv-list" aria-label="Recent grievances">
          {data.items.slice(0, 3).map((g) => (
            <li key={g.id} className="gv-li">
              <div className="gv-li-head">
                <p className="gv-li-title">{g.title ?? 'Complaint'}</p>
                <Badge tone={statusTone(g.status)}>{humanise(g.status)}</Badge>
              </div>
              <p className="gv-li-sub">
                {g.ref ?? ''} {g.facility ? `· ${g.facility}` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No open grievances" titleAs="h4">
          Complaints about facilities in your area appear here.
        </EmptyState>
      )}
      <p className="gv-muted" style={{ marginTop: 12 }}>
        Waiting: up to 2 days {data.ageing.upTo2Days} · 3 to 7 days {data.ageing.from3To7Days} · over 7 days {data.ageing.over7Days}
      </p>
      <button type="button" className="gv-link" style={{ marginTop: 8 }} onClick={onOpen}>
        See all grievances
      </button>
    </Card>
  )
}

function Body({ o, ctx, goTo, path, navState }: SectionProps & { o: GovOverview }) {
  const week = weekOf(o.week)
  const peakHour = o.liveSessions.byHour.reduce((best, h) => (h.sessions > best.sessions ? h : best), { hour: 0, sessions: -1 })
  const dw = o.diseaseWatch
  const unitLabel = ctx.child.label.toLowerCase()

  return (
    <div className="gv-stack">
      <PageHeader
        eyebrow={`${ctx.level} overview${week ? ` · ${week.toLowerCase()}` : ''}`}
        title={o.title}
        subtitle={
          o.anomaly
            ? `${o.anomaly.title}. ${o.waitingForYou.length ? `${o.waitingForYou.length} requests are waiting for you.` : ''}`
            : o.waitingForYou.length
              ? `${o.waitingForYou.length} requests are waiting for you.`
              : 'Nothing is waiting for you right now.'
        }
        actions={
          <div className="gv-row">
            {o.population ? <Badge tone="outline">Population {fmtNum(o.population)}</Badge> : null}
            <Badge tone="success" dot>
              Synthetic demo data
            </Badge>
          </div>
        }
      />

      <div className="gv-grid-4">
        {o.kpis.map((k, i) => (
          <StatCard
            key={k.key}
            label={k.label}
            value={k.value === null ? '–' : fmtNum(k.value)}
            unit={k.unit ?? undefined}
            hint={k.hint}
            tone={TONES[i % TONES.length]}
          />
        ))}
      </div>

      <div className="gv-split">
        <MapPanel ctx={ctx} path={path} goTo={goTo} navState={navState} compact />
        <div className="gv-stack">
          <Card title="Live doctor sessions" titleAs="h3" actions={<Badge tone="success" dot>Now</Badge>}>
            <div className="gv-tight">
              <div className="gv-row" style={{ alignItems: 'baseline' }}>
                <p className="gv-bignum">{o.liveSessions.now}</p>
                <p className="gv-muted">
                  peak today {o.liveSessions.peak}
                  {o.liveSessions.asOfDate ? ` (busiest day on record ${o.liveSessions.asOfDate})` : ''}
                </p>
              </div>
              <BarChart
                items={o.liveSessions.byHour.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, value: h.sessions, highlight: h.hour === peakHour.hour && peakHour.sessions > 0 }))}
                label={`Doctor sessions by hour of the day. Busiest hour ${String(peakHour.hour).padStart(2, '0')}:00 with ${Math.max(0, peakHour.sessions)} sessions.`}
                color={C.tealSoft}
                highlightColor={C.teal}
                labelEvery={6}
                height={130}
                valueName="Sessions"
              />
            </div>
          </Card>
          <Card title="Waiting for you" titleAs="h3" actions={<button type="button" className="gv-link" onClick={() => goTo('approvals')}>Approvals</button>}>
            {o.waitingForYou.length ? (
              <ul className="gv-list" aria-label="Requests waiting for you">
                {o.waitingForYou.slice(0, 3).map((a) => (
                  <li key={a.id} className="gv-li">
                    <div className="gv-li-head">
                      <p className="gv-li-title">{a.name}</p>
                      <Badge tone={a.overdue ? 'danger' : 'warning'}>{a.overdue ? `Overdue · ${ageText(a.ageDays)}` : ageText(a.ageDays)}</Badge>
                    </div>
                    <p className="gv-li-sub">
                      {a.role}
                      {a.org ? ` · ${a.org}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="All caught up" titleAs="h4">
                No approval requests are waiting for you.
              </EmptyState>
            )}
          </Card>
          <Card title="Ranking · disease rate" titleAs="h3" actions={<span className="gv-muted">Top {o.ranking.length}</span>}>
            {o.ranking.length ? (
              <ol className="gv-list" aria-label={`Ranking of ${unitLabel}s`}>
                {o.ranking.slice(0, 6).map((r) => (
                  <li key={r.id} className="gv-li" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <span>
                      <span className="gv-muted gv-num" style={{ marginRight: 10 }}>{r.rank}</span>
                      <span className="gv-strong">{r.name}</span>
                    </span>
                    <span className="gv-num gv-strong">{r.value === null ? '<5' : `${fmtNum1(r.value)} / lakh`}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="Nothing to rank yet" titleAs="h4" />
            )}
            <p className="gv-muted" style={{ marginTop: 10 }}>Pick a tile on the map to see that area's detail.</p>
          </Card>
        </div>
      </div>

      <div className="gv-grid-3">
        <Card title="Citizens registered" titleAs="h3" actions={<Badge tone="teal">12 months</Badge>}>
          <LineChart
            series={[{ name: 'Citizens registered', points: o.citizensRegistered.monthly.map((m) => m.cumulative), color: C.teal, marker: 'circle' }]}
            xLabels={o.citizensRegistered.monthly.map((m) => m.label)}
            label={`Citizens registered, cumulative over 12 months. ${fmtNum(o.citizensRegistered.total)} now.`}
            area
            endLabel={`${fmtNum(o.citizensRegistered.total)} now`}
            legend={false}
          />
        </Card>
        <Card title="Disease watch · 12 weeks" titleAs="h3" actions={<button type="button" className="gv-link" onClick={() => goTo('surveillance')}>Surveillance</button>}>
          <WidgetView w={dw}>
            {(d) => (
              <LineChart
                normalise
                series={d.diseases.slice(0, 3).map((x) => ({ name: x.name, points: x.weeks.map((w) => w.cases) }))}
                xLabels={(d.diseases[0]?.weeks ?? []).map((w) => w.weekStart.slice(5))}
                label="Weekly cases of the three watched diseases over 12 weeks, each scaled to its own peak."
              />
            )}
          </WidgetView>
        </Card>
        <Card title="Facility mix" titleAs="h3" actions={<span className="gv-muted">{fmtNum(o.facilityMix.total)} total</span>}>
          {o.facilityMix.total ? (
            <HBars
              label="Facilities on the platform by type"
              rows={o.facilityMix.segments.map((s) => ({ label: s.label.length > 8 ? s.label.slice(0, 7) + '…' : s.label, value: s.count, max: o.facilityMix.total, display: fmtNum(s.count), color: C.tealSoft }))}
            />
          ) : (
            <EmptyState title="No facilities yet" titleAs="h4" />
          )}
          <ul className="gv-list" style={{ marginTop: 12 }}>
            {o.facilityMix.segments.map((s) => (
              <li key={s.label} className="gv-li" style={{ flexDirection: 'row', justifyContent: 'space-between', padding: '4px 0', border: 0 }}>
                <span className="gv-body">{s.label}</span>
                <span className="gv-num gv-strong">{fmtNum(s.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="gv-grid-3">
        {o.anomaly ? (
          <AIInsight
            title={o.anomaly.title}
            module="Surveillance anomaly"
            status="caution"
            confidence={o.anomaly.confidence}
            evidence={o.anomaly.evidence}
            footer={o.anomaly.needsEpidemiologistReview ? <Badge tone="outline">Needs epidemiologist review</Badge> : undefined}
          >
            {o.anomaly.body}
          </AIInsight>
        ) : (
          <Card title="Surveillance anomaly" titleAs="h3">
            <EmptyState title="No unusual pattern" titleAs="h4">
              The model has not flagged any {unitLabel} this week. This is a simulated AI output.
            </EmptyState>
          </Card>
        )}
        <Card title="Blood stock" titleAs="h3" actions={<button type="button" className="gv-link" onClick={() => goTo('blood')}>Network</button>}>
          <WidgetView w={o.blood}>
            {(b) => (
              <div className="gv-tight">
                <HBars
                  label="Blood stock by group, days of cover"
                  rows={b.byGroup.map((g) => ({
                    label: g.group,
                    value: g.daysCover ?? 0,
                    max: 14,
                    display: g.daysCover === null ? `${g.units} u` : `${Math.round(g.daysCover)} d`,
                    status: g.level === 'low' ? 'low' : g.level === 'watch' ? 'watch' : 'good',
                    color: g.level === 'low' ? C.rose : g.level === 'watch' ? C.goldSoft : C.tealSoft,
                  }))}
                />
                {b.lowGroups.length ? <p className="gv-muted">{b.lowGroups.join(', ')} under 4 days of cover.</p> : <p className="gv-muted">All groups have at least 4 days of cover.</p>}
                <div className="gv-row">
                  <button type="button" className="cf-btn cf-btn-soft cf-btn-sm" onClick={() => goTo('blood')}>
                    <span className="cf-btn-label">Call for donors</span>
                  </button>
                  <span className="gv-muted">{b.upcomingCamps} upcoming camps</span>
                </div>
              </div>
            )}
          </WidgetView>
        </Card>
        <Card title="Flagged for review" titleAs="h3" actions={<button type="button" className="gv-link" onClick={() => goTo('audit')}>Audit</button>}>
          {o.flaggedForReview.length ? (
            <ul className="gv-list" aria-label="Flagged events">
              {o.flaggedForReview.slice(0, 3).map((f) => (
                <li key={f.id} className="gv-li">
                  <p className="gv-li-title">
                    <Dot tone={severityTone(f.severity) === 'danger' ? 'danger' : 'warning'} />
                    {f.event.replace(/\s*\[DEMO-AUD-[A-Z0-9]+\]\s*$/, '')}
                  </p>
                  <p className="gv-li-sub">
                    {[f.actorRole, f.facility, fmtDateTime(f.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing flagged" titleAs="h4" />
          )}
        </Card>
      </div>

      <div className="gv-grid-3">
        <Card title="Connected apps" titleAs="h3" actions={<span className="gv-muted">{o.connectedApps.eventsToday} events today</span>}>
          {o.connectedApps.recent.length ? (
            <ul className="gv-list" aria-label="Recent events from other apps">
              {o.connectedApps.recent.slice(0, 3).map((e) => (
                <li key={e.id} className="gv-li">
                  <div className="gv-li-head">
                    <Badge tone="info">{humanise(e.from)} app</Badge>
                    <span className="gv-muted">{fmtDateTime(e.at)}</span>
                  </div>
                  <p className="gv-li-title">{e.title}</p>
                  {e.text ? <p className="gv-li-sub">{e.text}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No events yet" titleAs="h4" />
          )}
        </Card>
        {o.preferredCard === 'grievances' ? (
          <WidgetView w={o.grievances} title="Grievances not available">
            {(g) => <GrievanceCard data={g} onOpen={() => goTo('directory', { directoryTab: 'grievances' })} />}
          </WidgetView>
        ) : (
          <WidgetView w={o.approvalFunnel} title="Approval funnel not available">
            {(f) => (
              <Card title="Approval funnel" titleAs="h3">
                <div className="gv-tight">
                  <FunnelBars rows={f.funnel} label="Approval funnel, last 90 days" />
                  <KV
                    rows={[
                      ['Decided within SLA', f.stats.decidedWithinSlaPct === null ? '–' : `${f.stats.decidedWithinSlaPct}%`],
                      ['Escalated upward', fmtNum(f.stats.escalatedUp)],
                      ['Oldest open', f.stats.oldestWaitingDays === null ? '–' : `${f.stats.oldestWaitingDays} days`],
                      ['Reminders sent', fmtNum(f.stats.remindersSent)],
                    ]}
                  />
                </div>
              </Card>
            )}
          </WidgetView>
        )}
        <Card title="Registrations by month" titleAs="h3">
          <div className="gv-tight">
            <p className="gv-muted">
              {o.registrationsByMonth.thisMonth ? `${fmtNum(o.registrationsByMonth.thisMonth.total)} new this month` : 'No registrations this month'}
            </p>
            <StackedBars
              label="Registrations by month: citizens, doctors and staff"
              months={o.registrationsByMonth.months.map((m) => ({ label: m.label, values: [m.citizens, m.doctors, m.staff] }))}
              parts={[
                { name: 'Citizens', color: C.teal },
                { name: 'Doctors', color: C.tealSoft },
                { name: 'Staff', color: C.goldSoft },
              ]}
            />
            {o.registrationsByMonth.thisMonth ? (
              <div className="gv-grid-3" style={{ gap: 8 }}>
                {(
                  [
                    ['Citizens', o.registrationsByMonth.thisMonth.citizens],
                    ['Doctors', o.registrationsByMonth.thisMonth.doctors],
                    ['Staff', o.registrationsByMonth.thisMonth.staff],
                  ] as [string, number][]
                ).map(([l, v]) => (
                  <div key={l} className="gv-tile">
                    <p className="gv-tile-label">{l}</p>
                    <p className="gv-tile-value">{fmtNum(v)}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {o.registrationsByMonth.byChannelThisMonth.length ? (
              <>
                <p className="gv-strong">This month, by channel</p>
                <HBars
                  label="New registrations this month by channel"
                  rows={o.registrationsByMonth.byChannelThisMonth.map((c) => ({
                    label: humanise(c.channel).slice(0, 8),
                    value: c.count,
                    max: Math.max(1, ...o.registrationsByMonth.byChannelThisMonth.map((x) => x.count)),
                    display: fmtNum(c.count),
                  }))}
                />
                <ul className="gv-muted" style={{ margin: 0, paddingLeft: 18 }}>
                  {o.registrationsByMonth.byChannelThisMonth.map((c) => (
                    <li key={c.channel}>
                      {humanise(c.channel)}: {fmtNum(c.count)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </Card>
      </div>

      <Alert tone="ai" title="Simulated AI output">
        {o.simulatedNotice}
      </Alert>
      <Badge tone={statusTone('active')}>All figures are aggregated and de-identified</Badge>
    </div>
  )
}

export default function Overview(props: SectionProps) {
  const q = useGovOverview()
  return (
    <QueryState q={q} skeleton={<OverviewSkeleton />}>
      {(o) => <Body {...props} o={o} />}
    </QueryState>
  )
}

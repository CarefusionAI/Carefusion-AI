import { Link } from 'react-router-dom'
import { Avatar, Badge, PageHeader, StatCard } from '../../../components/ui'
import { useAuth } from '../../../context/AuthContext'
import { eventTag, useEvents } from '../../../hooks/useEvents'
import { usePharmacyOverview } from '../../../api/pharmacyAdmin'
import type { PharmacyOverview } from '../../../api/pharmacyAdmin'
import { Async, Bar, Box, HeroCross, ICONS, Icon, PageSkeleton, Row, RowText, fmtDate, fmtTime, inr, num, roleLabelOf } from '../opsKit'
import { SectionLink, firstName, greeting, sectionHref, shortDay, weekdayLong } from './shared'
import type { PharmacySection } from './shared'

const ACTION: Record<PharmacyOverview['needsAction'][number]['kind'], { icon: string; tone: 'danger' | 'warn' | 'blue' | 'peach'; to: PharmacySection; cta: string }> = {
  recall: { icon: ICONS.warn, tone: 'danger', to: 'expiry', cta: 'Act' },
  purchase_order: { icon: ICONS.clipboard, tone: 'warn', to: 'orders', cta: 'Review' },
  invite: { icon: ICONS.users, tone: 'blue', to: 'staff', cta: 'Open' },
  document: { icon: ICONS.doc, tone: 'peach', to: 'compliance', cta: 'Open' },
}

const SHIFT_STATE: Record<string, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  on: { label: 'On shift', tone: 'success' },
  break: { label: 'Break', tone: 'info' },
  off: { label: 'Off', tone: 'neutral' },
}

function WeekBars({ week }: { week: PharmacyOverview['dispensingWeek'] }) {
  const max = Math.max(...week.map((d) => d.count), 1)
  const w = 640
  const h = 180
  const slot = w / Math.max(week.length, 1)
  const summary = week.map((d) => `${shortDay(d.date)} ${d.count}`).join(', ')
  return (
    <>
      <svg className="ak-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Prescriptions filled per day: ${summary}`}>
        <path d={`M0 30H${w}M0 80H${w}M0 130H${w}`} stroke="#e4ddd6" />
        {week.map((d, i) => {
          const bh = Math.max(6, (d.count / max) * 150)
          const last = i === week.length - 1
          return <rect key={d.date} x={i * slot + slot * 0.18} y={h - bh} width={slot * 0.64} height={bh} rx={10} fill={last ? '#3a726d' : '#86bdb8'} />
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' }} className="ak-muted" aria-hidden="true">
        {week.map((d, i) => (
          <span key={d.date}>
            {i === week.length - 1 ? <strong style={{ color: 'var(--ink)' }}>Today {d.count}</strong> : `${shortDay(d.date)} ${d.count}`}
          </span>
        ))}
      </div>
    </>
  )
}

function Series({ d }: { d: PharmacyOverview['dispensing30Days'] }) {
  const w = 320
  const h = 150
  const s = d.series
  const max = Math.max(...s.map((x) => x.count), 1)
  const pts = s.map((x, i) => [s.length > 1 ? (i / (s.length - 1)) * w : 0, h - 20 - (x.count / max) * (h - 50)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const peakIdx = s.findIndex((x) => x.date === d.peak.date)
  const peak = peakIdx >= 0 ? pts[peakIdx] : undefined
  const avgY = h - 20 - (d.average / max) * (h - 50)
  return (
    <svg className="ak-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Daily dispenses over 30 days, average ${d.average}, peak ${d.peak.count} on ${fmtDate(d.peak.date, false)}`}>
      <path d={`M0 20H${w}M0 70H${w}M0 120H${w}`} stroke="#e4ddd6" />
      <path d={`M0 ${avgY}H${w}`} stroke="#c9a86a" strokeDasharray="4 4" />
      {pts.length > 1 ? <path d={`${line} V${h} H0Z`} fill="#86bdb8" opacity=".2" /> : null}
      <path d={line} fill="none" stroke="#3a726d" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {peak ? (
        <>
          <circle cx={peak[0]} cy={peak[1]} r="4.5" fill="#c9a86a" />
          <text x={Math.min(peak[0] + 4, w - 90)} y={Math.max(peak[1] - 8, 12)} fontSize="11" fill="#7e6028">
            Peak {d.peak.count} {'·'} {fmtDate(d.peak.date, false)}
          </text>
        </>
      ) : null}
      <text x="4" y={Math.max(avgY - 4, 10)} fontSize="10" fill="#7e6028">
        avg {d.average}
      </text>
    </svg>
  )
}

function ConnectedApps() {
  const { user } = useAuth()
  const { events, unavailable } = useEvents(user?.role)
  const top = events.slice(0, 3)
  return (
    <Box title="Connected apps" actions={<Badge tone="teal" dot>Live dispensing</Badge>}>
      {unavailable ? (
        <p className="ak-muted">Activity from other apps is not available right now.</p>
      ) : top.length === 0 ? (
        <p className="ak-muted">No dispensing activity yet.</p>
      ) : (
        top.map((e) => {
          const body = (
            <>
              <span className="ak-feed-top">
                <span className="ak-from">{roleLabelOf(e.from)}</span>
                <span className="ak-muted">{fmtTime(e.at)}</span>
              </span>
              <span className="ak-feed-title">
                <span aria-hidden="true" className="ak-muted" style={{ marginRight: 6 }}>
                  {eventTag(e.type).tag}
                </span>
                {e.title}
              </span>
              <span className="ak-feed-text">{e.text}</span>
            </>
          )
          return e.href?.startsWith('/') ? (
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
      <p className="ak-muted ak-table-note">Each dispense from the Pharmacist app lowers stock here automatically.</p>
    </Box>
  )
}

function View({ o }: { o: PharmacyOverview }) {
  const k = o.kpis
  const trend =
    k.filledTrendPct === null
      ? undefined
      : { direction: (k.filledTrendPct >= 0 ? 'up' : 'down') as 'up' | 'down', text: `${k.filledTrendPct >= 0 ? '+' : ''}${k.filledTrendPct}% vs last week` }
  const onShift = o.pharmacistsOnShift.filter((p) => p.state === 'on').length
  const recalls = o.needsAction.filter((n) => n.kind === 'recall').length
  const pos = o.needsAction.filter((n) => n.kind === 'purchase_order').length
  const maxCat = Math.max(...o.stockByCategory.map((c) => c.value), 1)
  const today = o.dispensingWeek[o.dispensingWeek.length - 1]?.count ?? 0
  return (
    <div className="ak-page">
      <PageHeader
        eyebrow={`${weekdayLong(o.asOf)}`}
        title={`${greeting(o.asOf)}, ${firstName(o.admin.name)}`}
        subtitle={`${onShift} ${onShift === 1 ? 'pharmacist' : 'pharmacists'} on shift, ${recalls} ${recalls === 1 ? 'recall' : 'recalls'} to action and ${pos} purchase ${pos === 1 ? 'order' : 'orders'} waiting for your approval.`}
        actions={
          <div className="ak-wrap">
            <Badge tone={o.pharmacy.licenceValidUntil ? 'success' : 'warning'} dot>
              {o.pharmacy.licenceValidUntil ? `Licence valid · ${fmtDate(o.pharmacy.licenceValidUntil)}` : 'Licence date missing'}
            </Badge>
            <Badge tone="outline">{o.pharmacy.licenceNo}</Badge>
          </div>
        }
      />

      <div className="ak-grid ak-g4 ak-in">
        <StatCard label="Prescriptions filled today" value={num(k.prescriptionsFilledToday)} trend={trend} hint={trend ? undefined : 'Nothing filled this day last week'} icon={<Icon d={ICONS.rx} />} tone="sage" />
        <StatCard label="Items in stock" value={num(k.itemsInStock)} unit="SKUs" hint={`${num(k.itemsPublished)} published to public finder`} icon={<Icon d={ICONS.box} />} />
        <StatCard label="Low stock" value={num(k.lowStockBatches)} unit="batches" hint={k.blockedBatches ? `${k.blockedBatches} blocked batch${k.blockedBatches === 1 ? '' : 'es'}` : 'None blocked'} icon={<Icon d={ICONS.warn} />} tone="peach" />
        <StatCard label="Expiring in 30 days" value={inr(k.expiring30DaysValue)} hint={`${k.expiring30DaysBatches} batches`} icon={<Icon d={ICONS.cal} />} tone="blue" />
      </div>

      <div className="ak-grid ak-g21 ak-in">
        <Box title="Dispensing this week" actions={<Badge tone="neutral">e-Signed prescriptions only</Badge>}>
          <WeekBars week={o.dispensingWeek} />
        </Box>
        <div className="ak-hero">
          <HeroCross />
          <span className="ak-eyebrow">Public stock finder</span>
          <span className="ak-hero-big">{o.finder.publishedPct}%</span>
          <p>
            of your stock is visible to citizens searching nearby. {num(o.finder.searchesThisWeek)} {o.finder.searchesThisWeek === 1 ? 'search' : 'searches'} found you this week.
          </p>
          <div>
            <Link to={sectionHref('inventory')} className="cf-btn cf-btn-secondary cf-btn-sm" style={{ textDecoration: 'none' }}>
              <span className="cf-btn-label">Manage publishing</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="ak-grid ak-g3 ak-in">
        <Box title="Stock by category" actions={<span className="ak-muted">SKUs {'·'} value</span>}>
          {o.stockByCategory.length === 0 ? (
            <p className="ak-muted">No stock recorded.</p>
          ) : (
            o.stockByCategory.map((c, i) => (
              <div key={c.category} className="ak-cat">
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{c.category}</span>
                <div className="ak-cat-bar">
                  <span className={`ak-cat-fill${i % 6 ? ` is-c${(i % 6) + 1}` : ''}`} style={{ width: `${Math.max(8, (c.value / maxCat) * 100)}%`, display: 'block' }} />
                  <span className="ak-cat-label">
                    {c.skus} {'·'} {inr(c.value)}
                  </span>
                </div>
              </div>
            ))
          )}
        </Box>
        <Box title="Dispenses · 30 days" actions={o.dispensing30Days.monthOnMonthPct !== null ? <Badge tone={o.dispensing30Days.monthOnMonthPct >= 0 ? 'success' : 'warning'}>{o.dispensing30Days.monthOnMonthPct >= 0 ? '+' : ''}{o.dispensing30Days.monthOnMonthPct}% month on month</Badge> : undefined}>
          <Series d={o.dispensing30Days} />
          <div className="ak-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div className="ak-callout"><span className="ak-muted">Today</span><b>{today}</b></div>
            <div className="ak-callout"><span className="ak-muted">30 days</span><b>{num(o.dispensing30Days.total)}</b></div>
            <div className="ak-callout"><span className="ak-muted">Daily average</span><b>{o.dispensing30Days.average}</b></div>
          </div>
        </Box>
        <ConnectedApps />
      </div>

      <div className="ak-grid ak-g3 ak-in">
        <Box title="Needs your action">
          {o.needsAction.length === 0 ? (
            <p className="ak-muted">Nothing needs action right now.</p>
          ) : (
            <div>
              {o.needsAction.map((n) => {
                const a = ACTION[n.kind]
                return (
                  <Row key={`${n.kind}-${n.id}`} icon={<Icon d={a.icon} />} tone={a.tone} trailing={<SectionLink to={a.to}>{a.cta}</SectionLink>}>
                    <RowText title={n.title} sub={n.detail} />
                  </Row>
                )
              })}
            </div>
          )}
        </Box>
        <Box title="Low stock" actions={<SectionLink to="inventory">Inventory</SectionLink>}>
          {o.lowStock.length === 0 ? (
            <p className="ak-muted">Nothing is below its minimum.</p>
          ) : (
            o.lowStock.map((s) => (
              <div key={s.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
                  <strong style={{ color: 'var(--ink)' }}>{s.name}</strong>
                  <span className="ak-muted">
                    {num(s.quantity)} / min {num(s.min)}
                  </span>
                </div>
                <Bar pct={s.min ? (s.quantity / s.min) * 100 : 0} tone={s.min && s.quantity / s.min < 0.5 ? 'low' : 'mid'} />
              </div>
            ))
          )}
        </Box>
        <Box title="Pharmacists on shift" actions={<SectionLink to="staff">All staff</SectionLink>}>
          <div>
            {o.pharmacistsOnShift.map((p) => {
              const st = SHIFT_STATE[p.state] ?? { label: p.state, tone: 'neutral' as const }
              return (
                <Row key={p.userId} icon={undefined} trailing={<Badge tone={st.tone} dot={p.state === 'on'}>{st.label}</Badge>}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={p.name} size={32} />
                    <RowText title={p.name} sub={`${p.counter ?? 'No counter'}${p.fillsToday ? ` · ${p.fillsToday} fills today` : ''}`} />
                  </div>
                </Row>
              )
            })}
          </div>
        </Box>
      </div>
    </div>
  )
}

export default function Overview() {
  const q = usePharmacyOverview()
  return (
    <Async query={q} skeleton={<PageSkeleton boxes={3} />}>
      {(o) => <View o={o} />}
    </Async>
  )
}

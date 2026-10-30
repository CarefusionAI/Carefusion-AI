import { StatCard, Table } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { useLabTat } from '../../../api/lab'
import type { LabTat } from '../../../api/lab'
import { BoxHead, Empty, ErrorBlock, PageLoading } from './common'

export default function Stats() {
  const tat = useLabTat(7)
  if (tat.isLoading) return <PageLoading title="turnaround" />
  if (tat.isError) return <ErrorBlock error={tat.error} onRetry={() => void tat.refetch()} title="Could not load turnaround" />
  const d = tat.data!
  const stat = d.byPriority.find((p) => p.priority === 'stat')
  const routine = d.byPriority.find((p) => p.priority === 'routine')
  const tgt = d.targetsMinutes

  const cols: TableColumn<LabTat['slowestTests'][number]>[] = [
    { key: 'testName', header: 'Test' },
    { key: 'orders', header: 'Orders', align: 'right' },
    { key: 'medianMinutes', header: 'Median', align: 'right', render: (r) => (r.medianMinutes >= 120 ? `${(r.medianMinutes / 60).toFixed(1)} h` : `${Math.round(r.medianMinutes)} min`) },
  ]
  const days = d.statMedianByDay
  const max = Math.max(60, ...days.map((x) => x.medianMinutes)) * 1.1

  return (
    <div className="lb-pg">
      <header>
        <h1 className="lb-h1">Turnaround</h1>
        <p className="lb-sub">Order to release, last {d.windowDays} days. Target: STAT under {tgt.stat ?? 60} min, routine under {Math.round((tgt.routine ?? 240) / 60)} h.</p>
      </header>
      <section className="lb-grid lb-g4">
        <StatCard label="STAT median" value={stat ? Math.round(stat.medianMinutes) : '-'} unit={stat ? 'min' : undefined} hint={`Target ${tgt.stat ?? 60}${stat ? ` · ${stat.orders} orders` : ''}`} tone="sage" />
        <StatCard label="Routine median" value={routine ? (routine.medianMinutes / 60).toFixed(1) : '-'} unit={routine ? 'h' : undefined} hint={`Target ${Math.round((tgt.routine ?? 240) / 60)}${routine ? ` · ${routine.orders} orders` : ''}`} tone="blue" />
        <StatCard label="Within target" value={d.withinTargetPercent ?? '-'} unit={d.withinTargetPercent != null ? '%' : undefined} hint="All priorities" />
        <StatCard label="Rejected samples" value={d.rejectedSamplePercent} unit="%" hint="Share of samples taken" tone="peach" />
      </section>
      <section className="lb-grid lb-g2">
        <div className="lb-box">
          <BoxHead title="STAT minutes by day" />
          {days.length === 0 ? (
            <Empty title="No STAT results in this window">Released STAT orders appear here.</Empty>
          ) : (
            <>
              <svg className="lb-bars" viewBox="0 0 320 150" role="img" aria-label={`STAT turnaround by day: ${days.map((x) => `${x.day} ${Math.round(x.medianMinutes)} minutes`).join(', ')}`}>
                <path d={`M0 ${150 - (60 / max) * 130} H320`} stroke="#d99a96" strokeDasharray="4 4" />
                <text x="268" y={150 - (60 / max) * 130 - 4} fontSize="10" fill="#9a4a46">60 min</text>
                {days.map((x, i) => {
                  const w = Math.min(34, 300 / days.length - 8)
                  const h = (x.medianMinutes / max) * 130
                  const px = 10 + i * (300 / days.length)
                  return (
                    <g key={x.day}>
                      <rect x={px} y={150 - h} width={w} height={h} rx="6" fill={i === days.length - 1 ? '#3a726d' : '#86bdb8'} />
                      <text x={px + w / 2} y={150 - h - 3} fontSize="9" textAnchor="middle" fill="#3f5263">{Math.round(x.medianMinutes)}</text>
                    </g>
                  )
                })}
              </svg>
              <div className="lb-muted" style={{ display: 'flex', justifyContent: 'space-between' }}>{days.map((x) => <span key={x.day}>{x.day.slice(5)}</span>)}</div>
            </>
          )}
        </div>
        <div className="lb-box">
          <BoxHead title="Slowest tests" />
          <Table columns={cols} rows={d.slowestTests} rowKey="testCode" density="compact" caption="Slowest tests" empty="No released results in this window." />
        </div>
      </section>
    </div>
  )
}

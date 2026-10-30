import { Badge } from '../../../../components/ui'
import { useAiTemporal, useTrends } from '../../../../api/doctor'
import type { TrendPoint } from '../../../../api/doctor'
import { Box, ErrorNote, Loading } from '../../parts'
import { fmtDay } from '../../format'
import RunTab from './RunTab'

function LineChart({ name, unit, points, refLow, refHigh }: { name: string; unit: string; points: TrendPoint[]; refLow?: number | null; refHigh?: number | null }) {
  const W = 320
  const H = 110
  const pad = { l: 8, r: 8, t: 10, b: 18 }
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at))
  const vals = sorted.map((p) => p.value)
  const lo = Math.min(...vals, refLow ?? Infinity)
  const hi = Math.max(...vals, refHigh ?? -Infinity)
  const span = hi - lo || 1
  const t0 = new Date(sorted[0]!.at).getTime()
  const t1 = new Date(sorted[sorted.length - 1]!.at).getTime()
  const x = (iso: string) => (t1 === t0 ? W / 2 : pad.l + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (H - pad.t - pad.b)
  const last = sorted[sorted.length - 1]!
  const first = sorted[0]!
  const band = refLow != null && refHigh != null && refHigh > refLow
  return (
    <div className="dr-stack" style={{ gap: 4 }}>
      <div className="dr-between">
        <strong className="dr-strong">{name}</strong>
        <span className="dr-muted">
          {last.value} {unit}
          {last.flag && last.flag !== 'N' ? ` (${last.flag})` : ''}
        </span>
      </div>
      <svg
        className="dr-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${name}: ${sorted.length} result${sorted.length === 1 ? '' : 's'}, from ${first.value} on ${fmtDay(first.at)} to ${last.value} ${unit} on ${fmtDay(last.at)}`}
      >
        {band ? <rect x={pad.l} width={W - pad.l - pad.r} y={y(refHigh as number)} height={Math.max(2, y(refLow as number) - y(refHigh as number))} fill="var(--tint-sage)" /> : null}
        <path d={`M${pad.l} ${H - pad.b}H${W - pad.r}`} stroke="var(--border)" />
        {sorted.length > 1 ? <path d={sorted.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {sorted.map((p) => (
          <circle key={p.at} cx={x(p.at)} cy={y(p.value)} r="4" fill={p.flag && p.flag !== 'N' ? 'var(--danger)' : 'var(--primary)'} />
        ))}
        <text x={pad.l} y={H - 4} fontSize="10" fill="var(--ink-muted)">
          {fmtDay(first.at)}
        </text>
        <text x={W - pad.r} y={H - 4} fontSize="10" fill="var(--ink-muted)" textAnchor="end">
          {fmtDay(last.at)}
        </text>
      </svg>
      {band ? (
        <span className="dr-muted">
          Reference {refLow}–{refHigh} {unit} (shaded)
        </span>
      ) : null}
    </div>
  )
}

export default function TrendsTab({ sid, canReview, readOnly, hidden }: { sid: string; canReview: boolean; readOnly: boolean; hidden: boolean }) {
  const trends = useTrends(sid)
  const run = useAiTemporal(sid)
  const t = trends.data
  const lab = (t?.labSeries ?? []).filter((s) => s.points.length)
  const vit = (t?.vitalSeries ?? []).filter((s) => s.points.length)
  return (
    <div className="dr-page">
      <Box title="Lab results and vitals over time" actions={<Badge tone="outline">Real records, not AI</Badge>}>
        {trends.isLoading ? <Loading lines={4} /> : null}
        <ErrorNote error={trends.error} title="Could not load the trends" />
        {t && lab.length + vit.length === 0 ? <p className="dr-muted">No lab results or vitals on record.</p> : null}
        <div className="dr-grid dr-g3">
          {lab.map((s) => (
            <LineChart key={s.code} name={s.name} unit={s.unit} points={s.points} refLow={s.refLow} refHigh={s.refHigh} />
          ))}
          {vit.map((s) => (
            <LineChart key={s.code} name={s.name} unit={s.unit} points={s.points} />
          ))}
        </div>
      </Box>
      <RunTab
        sid={sid}
        tool="temporal"
        title="Trend analysis"
        intro="A simulated model reads these series together and says what is moving. Check it against the charts above."
        runLabel="Analyse trends (simulated)"
        onRun={() => run.mutate()}
        running={run.isPending}
        error={run.error}
        canRun={!readOnly}
        canReview={canReview}
        hidden={hidden}
      />
    </div>
  )
}

import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import clsx from 'clsx'
import type { AddVitalReadingRequest, VitalKind, VitalReadingDto, VitalsSummaryResponse } from '@carefusion/shared'
import { Alert, Badge, Button, EmptyState, PageHeader, Select, Skeleton, StatCard, Table, TextField, Textarea } from '../../components/ui'
import type { TableColumn } from '../../components/ui'
import { useAddVitalReading, useUpcoming, useVitalReadings, useVitalsSummary } from '../../api/citizen1'
import { BarsChart, BpChart, TrendChart } from './CitizenCharts'
import { Async, Box, ICONS, Icon, MutationError, Page, fmt, humanise } from './CitizenKit'

// Home vitals (CitizenVitals.dc.html). Charts are drawn from the real series returned by
// /citizen/vitals/summary and /citizen/vitals/readings. Plain statistics only: no AI text here.

const KINDS: { id: VitalKind; label: string }[] = [
  { id: 'bp', label: 'Blood pressure' },
  { id: 'sugar', label: 'Sugar' },
  { id: 'weight', label: 'Weight' },
  { id: 'spo2', label: 'SpO₂' },
  { id: 'temperature', label: 'Temperature' },
]
const SUGAR_WHEN = [
  { value: 'fasting', label: 'Fasting' },
  { value: 'before_meal', label: 'Before a meal' },
  { value: 'after_meal', label: '2 h after a meal' },
  { value: 'random', label: 'Random' },
]
const TEMP_WHERE = [
  { value: 'oral', label: 'Oral' },
  { value: 'ear', label: 'Ear' },
  { value: 'forehead', label: 'Forehead' },
  { value: 'armpit', label: 'Armpit' },
]
const STATUS_LABEL: Record<string, string> = {
  in_range: 'In range',
  above_target: 'Above target',
  high: 'High',
  low: 'Low',
  normal: 'Normal',
}

function num(v: string): number | undefined {
  const n = Number(v)
  return v.trim() !== '' && Number.isFinite(n) ? n : undefined
}

function trendText(delta: number, unit: string, span: string): { direction: 'up' | 'down'; text: string } | undefined {
  if (!Number.isFinite(delta) || delta === 0) return undefined
  return { direction: delta < 0 ? 'down' : 'up', text: `${Math.abs(Math.round(delta * 10) / 10)} ${unit} ${delta < 0 ? 'lower' : 'higher'} ${span}` }
}

function weeksBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (7 * 86_400_000)))
}

function Latest({ v }: { v: VitalsSummaryResponse }) {
  const { bp, sugar, weight, spo2, temperature } = v.latest
  const bpAvg = v.bp30.avgSystolic
  const sugarSeries = v.sugar.series
  const wSeries = v.weight.series
  return (
    <section aria-label="Latest readings" className="c1-grid c1-g4 c1-in" style={{ animationDelay: '60ms' }}>
      <StatCard
        label="Blood pressure"
        value={bp?.systolic ? `${bp.systolic}/${bp.diastolic}` : '—'}
        unit="mmHg"
        trend={bp?.systolic && bpAvg ? trendText(bp.systolic - bpAvg, 'points', 'than your 30-day average') : undefined}
        hint={bp ? STATUS_LABEL[bp.status] : 'No reading yet'}
        icon={<Icon d={ICONS.pulse} />}
        tone="sage"
      />
      <StatCard
        label="Fasting sugar"
        value={sugar?.value ?? '—'}
        unit="mg/dL"
        trend={sugarSeries.length > 1 ? trendText(sugarSeries[sugarSeries.length - 1]!.value - sugarSeries[0]!.value, 'mg/dL', `than ${sugarSeries.length} weeks ago`) : undefined}
        hint={sugar ? STATUS_LABEL[sugar.status] : 'No reading yet'}
        icon={<Icon d={ICONS.drop} />}
        tone="peach"
      />
      <StatCard
        label="Weight"
        value={weight?.value ?? '—'}
        unit="kg"
        trend={wSeries.length > 1 ? trendText(wSeries[wSeries.length - 1]!.value - wSeries[0]!.value, 'kg', `in ${weeksBetween(wSeries[0]!.measuredAt, wSeries[wSeries.length - 1]!.measuredAt)} weeks`) : undefined}
        hint={weight ? 'Latest weigh-in' : 'No reading yet'}
        icon={<Icon d={ICONS.scale} />}
        tone="blue"
      />
      <StatCard
        label="SpO₂ · Temp"
        value={spo2?.value ? `${spo2.value}%` : '—'}
        unit={temperature?.value ? `· ${temperature.value} °C` : undefined}
        hint={spo2 ? `${STATUS_LABEL[spo2.status]} · ${fmt.dateTime(spo2.measuredAt)}` : 'No reading yet'}
        icon={<Icon d={ICONS.lung} />}
      />
    </section>
  )
}

function AddReading() {
  const add = useAddVitalReading()
  const recent = useVitalReadings(undefined, 30, 4)
  const [kind, setKind] = useState<VitalKind>('bp')
  const [f, setF] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState('')
  const [result, setResult] = useState<{ flagged: boolean; notified: boolean } | null>(null)
  const set = (k: string) => (e: { target: { value: string } }) => {
    setF((o) => ({ ...o, [k]: e.target.value }))
    setResult(null)
  }

  function reset() {
    setF({})
    setNote('')
    setFormError('')
    setResult(null)
    add.reset()
  }

  function build(): AddVitalReadingRequest | string {
    const n = note.trim() || undefined
    if (kind === 'bp') {
      const systolic = num(f.sys ?? '')
      const diastolic = num(f.dia ?? '')
      if (!systolic || !diastolic) return 'Enter both the systolic and diastolic numbers.'
      if (systolic < 50 || systolic > 300 || diastolic < 30 || diastolic > 200) return 'Those numbers look outside the possible range. Please check them.'
      return { kind: 'bp', systolic, diastolic, pulse: num(f.pulse ?? ''), note: n }
    }
    if (kind === 'sugar') {
      const value = num(f.sugar ?? '')
      if (!value || value < 20 || value > 800) return 'Enter a sugar value between 20 and 800 mg/dL.'
      return { kind: 'sugar', value, context: (f.when || 'fasting') as 'fasting', note: n }
    }
    if (kind === 'weight') {
      const value = num(f.weight ?? '')
      if (!value || value < 2 || value > 400) return 'Enter a weight between 2 and 400 kg.'
      return { kind: 'weight', value, note: n }
    }
    if (kind === 'spo2') {
      const value = num(f.spo2 ?? '')
      if (!value || value < 50 || value > 100) return 'Enter SpO₂ between 50 and 100 percent.'
      return { kind: 'spo2', value, pulse: num(f.pulse ?? ''), note: n }
    }
    const value = num(f.temp ?? '')
    if (!value || value < 30 || value > 45) return 'Enter a temperature between 30 and 45 °C.'
    return { kind: 'temperature', value, context: (f.where || 'oral') as 'oral', note: n }
  }

  function save(e: FormEvent) {
    e.preventDefault()
    const body = build()
    if (typeof body === 'string') {
      setFormError(body)
      return
    }
    setFormError('')
    add.mutate(body, {
      onSuccess: (r) => {
        setResult({ flagged: r.flagged, notified: r.doctorNotified })
        setF({})
        setNote('')
      },
    })
  }

  return (
    <Box as="section" label="Add a reading">
      <form className="c1-form" onSubmit={save} noValidate>
        <div className="c1-bh">
          <h2 className="c1-bt">Add a reading</h2>
          <span className="c1-muted">Time is set when you save</span>
        </div>
        <div className="c1-seg" role="radiogroup" aria-label="Reading type">
          {KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={clsx(kind === k.id && 'on')} onClick={() => { setKind(k.id); reset() }}>
              {k.label}
            </button>
          ))}
        </div>
        {kind === 'bp' ? (
          <div className="c1-fr">
            <TextField label="Systolic" type="number" placeholder="120" helper="mmHg" value={f.sys ?? ''} onChange={set('sys')} />
            <TextField label="Diastolic" type="number" placeholder="80" helper="mmHg" value={f.dia ?? ''} onChange={set('dia')} />
            <TextField label="Pulse" type="number" placeholder="72" helper="beats / min" optional value={f.pulse ?? ''} onChange={set('pulse')} />
          </div>
        ) : null}
        {kind === 'sugar' ? (
          <div className="c1-fr">
            <TextField label="Blood sugar" type="number" placeholder="110" helper="mg/dL" value={f.sugar ?? ''} onChange={set('sugar')} />
            <Select label="When" options={SUGAR_WHEN} value={f.when ?? 'fasting'} onChange={(v) => setF((o) => ({ ...o, when: v }))} />
          </div>
        ) : null}
        {kind === 'weight' ? (
          <div className="c1-fr"><TextField label="Weight" type="number" step="0.1" placeholder="64.0" helper="kg" value={f.weight ?? ''} onChange={set('weight')} /></div>
        ) : null}
        {kind === 'spo2' ? (
          <div className="c1-fr">
            <TextField label="SpO₂" type="number" placeholder="98" helper="%" value={f.spo2 ?? ''} onChange={set('spo2')} />
            <TextField label="Pulse" type="number" placeholder="72" helper="beats / min" optional value={f.pulse ?? ''} onChange={set('pulse')} />
          </div>
        ) : null}
        {kind === 'temperature' ? (
          <div className="c1-fr">
            <TextField label="Temperature" type="number" step="0.1" placeholder="36.8" helper="°C" value={f.temp ?? ''} onChange={set('temp')} />
            <Select label="Measured at" options={TEMP_WHERE} value={f.where ?? 'oral'} onChange={(v) => setF((o) => ({ ...o, where: v }))} />
          </div>
        ) : null}
        <Textarea label="Note" optional rows={2} maxLength={300} placeholder="E.g. felt dizzy after lunch" value={note} onChange={(e) => setNote(e.target.value)} />
        {formError ? <Alert tone="danger" title="Check the numbers">{formError}</Alert> : null}
        <MutationError error={add.error} />
        {result ? (
          <div className={clsx('c1-note', result.flagged && 'is-warn')} role="status">
            {result.flagged
              ? result.notified
                ? 'Saved · outside your target, so your care team was notified'
                : 'Saved · outside your target'
              : 'Saved to your record · added to the chart'}
          </div>
        ) : null}
        <div className="c1-flt">
          <Button type="submit" loading={add.isPending}>Save reading</Button>
          <Button variant="ghost" onClick={reset}>Clear</Button>
        </div>
      </form>
      <div className="c1-recent" aria-label="Your latest readings">
        <div className="c1-bh"><h3 className="c1-bt" style={{ fontSize: 14 }}>Latest readings</h3><span className="c1-muted">Doctors see these only in a session</span></div>
        {recent.isPending ? (
          <Skeleton lines={4} height={14} />
        ) : (recent.data ?? []).length === 0 ? (
          <span className="c1-muted">No readings yet.</span>
        ) : (
          (recent.data ?? []).slice(0, 4).map((r) => (
            <div className="c1-rr" key={r.id}>
              <span className={clsx('c1-rd', r.flagged && 'bad')} aria-hidden="true" />
              <span className="c1-grow"><strong className="c1-strong">{r.display}</strong> <span className="c1-muted">{r.label}</span></span>
              <span className="c1-muted c1-num">{fmt.dateTime(r.measuredAt)}</span>
              <span className={clsx('c1-rs', r.flagged && 'bad')}>{STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
          ))
        )}
      </div>
    </Box>
  )
}

const RANGES = [
  { id: '30', label: '30 d', days: 30 },
  { id: '90', label: '90 d', days: 90 },
  { id: '365', label: '1 yr', days: 365 },
]

function BpCard({ v }: { v: VitalsSummaryResponse }) {
  const [range, setRange] = useState('30')
  const days = RANGES.find((r) => r.id === range)!.days
  const longer = useVitalReadings(days > 30 ? 'bp' : undefined, days, 500)
  const series = useMemo(() => {
    if (days === 30) return v.bp30.series
    return [...(longer.data ?? [])]
      .filter((r) => r.kind === 'bp' && r.systolic !== null && r.diastolic !== null)
      .map((r) => ({ measuredAt: r.measuredAt, systolic: r.systolic as number, diastolic: r.diastolic as number }))
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  }, [days, v.bp30.series, longer.data])
  const sysT = v.targets.find((t) => t.code === '8480-6')
  const target = sysT && sysT.low !== null && sysT.high !== null ? { sysLow: sysT.low, sysHigh: sysT.high } : null
  const b = v.bp30
  return (
    <Box
      title={`Blood pressure · ${RANGES.find((r) => r.id === range)!.label.replace(' d', ' days').replace('1 yr', '1 year')}`}
      actions={
        <div className="c1-seg" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className={clsx(range === r.id && 'on')} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
        </div>
      }
    >
      {days > 30 && longer.isPending ? (
        <Skeleton height={200} radius={12} />
      ) : series.length === 0 ? (
        <EmptyState title="No readings in this range">Add a reading to start your chart.</EmptyState>
      ) : (
        <BpChart
          points={series}
          target={target}
          label={`Systolic ${Math.min(...series.map((s) => s.systolic))} to ${Math.max(...series.map((s) => s.systolic))} and diastolic ${Math.min(...series.map((s) => s.diastolic))} to ${Math.max(...series.map((s) => s.diastolic))} over ${days} days`}
        />
      )}
      <div className="c1-lg2">
        <span><i style={{ background: '#3a726d' }} />Systolic</span>
        <span><i style={{ background: '#c9a86a' }} />Diastolic</span>
        {target ? <span><i style={{ background: '#dcebe0' }} />Target set by your doctor</span> : null}
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
        {b.count ? `${b.inRange} of ${b.count} readings in the last ${b.days} days were in range.` : 'No readings in the last 30 days.'} This is a count of your own readings, not a diagnosis.
      </p>
      <div className="c1-mini" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div><strong>{b.avgSystolic ? `${b.avgSystolic}/${b.avgDiastolic}` : '—'}</strong><span>30-day average</span></div>
        <div><strong>{b.highest ? `${b.highest.systolic}/${b.highest.diastolic}` : '—'}</strong><span>{b.highest ? `Highest · ${fmt.dayMon(b.highest.measuredAt)}` : 'Highest'}</span></div>
        <div><strong>{b.count ? `${b.inRange} of ${b.count}` : '—'}</strong><span>Readings in range</span></div>
      </div>
    </Box>
  )
}

function bmiPos(bmi: number): number {
  if (bmi < 18.5) return (bmi / 18.5) * 20
  if (bmi < 25) return 20 + ((bmi - 18.5) / 6.5) * 40
  if (bmi < 30) return 60 + ((bmi - 25) / 5) * 20
  return Math.min(98, 80 + ((bmi - 30) / 10) * 20)
}

function Lower({ v }: { v: VitalsSummaryResponse }) {
  const upcoming = useUpcoming(30)
  const nextTest = upcoming.data?.events.find((e) => e.kind === 'test' && /hba1c/i.test(e.title) && e.inDays >= 0)
  const sugarT = v.sugar.target
  const sugarLatest = v.latest.sugar
  const w = v.weight
  const first = w.series[0]
  const last = w.series[w.series.length - 1]
  return (
    <section className="c1-grid c1-g3 c1-in" style={{ animationDelay: '180ms' }}>
      <Box
        title={`Fasting sugar · ${v.sugar.series.length} weeks`}
        actions={sugarLatest ? <Badge tone={sugarLatest.flagged ? 'warning' : 'success'}>{STATUS_LABEL[sugarLatest.status] ?? sugarLatest.status}</Badge> : undefined}
      >
        {v.sugar.series.length ? (
          <>
            <BarsChart
              points={v.sugar.series}
              target={sugarT?.high ?? null}
              label={`Weekly fasting sugar from ${v.sugar.series[0]!.value} to ${v.sugar.series[v.sugar.series.length - 1]!.value} mg/dL`}
            />
            <p className="c1-muted" style={{ margin: 0 }}>
              {v.sugar.series[0]!.value} → {v.sugar.series[v.sugar.series.length - 1]!.value} mg/dL
              {sugarT?.high ? ` · target under ${sugarT.high} · dashed line` : ''}
            </p>
          </>
        ) : (
          <EmptyState title="No sugar readings yet">Add a fasting reading to start the chart.</EmptyState>
        )}
        <div className="c1-mini" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div>
            <strong>{v.hba1c.value !== null ? `${v.hba1c.value}${v.hba1c.unit}` : '—'}</strong>
            <span>HbA1c{v.hba1c.measuredAt ? ` · ${fmt.dayMon(v.hba1c.measuredAt)}` : ''}{v.hba1c.targetMax ? ` · target under ${v.hba1c.targetMax}%` : ''}</span>
          </div>
          <div>
            <strong>{nextTest ? fmt.dayMon(nextTest.startsAt) : '—'}</strong>
            <span>Next HbA1c test</span>
          </div>
        </div>
      </Box>

      <Box title="Weight & BMI" actions={<span className="c1-muted">{w.heightCm ? `Height ${w.heightCm} cm` : ''}</span>}>
        {w.bmi !== null ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 600, color: 'var(--ink-strong)' }}>{w.bmi}</span>
              <span className="c1-muted">BMI · {w.bmiBand ? `${humanise(w.bmiBand)} range` : ''}</span>
            </div>
            <div className="c1-band" aria-hidden="true"><b style={{ left: `${bmiPos(w.bmi)}%` }} /></div>
            <div className="c1-lg2" style={{ justifyContent: 'space-between' }}><span>Under</span><span>Healthy</span><span>Over</span><span>High</span></div>
          </>
        ) : (
          <span className="c1-muted">Add your height and a weight to see BMI.</span>
        )}
        {first && last ? (
          <>
            <p className="c1-muted" style={{ margin: 0 }}>
              {last.value - first.value === 0 ? 'No change' : `${last.value - first.value > 0 ? '+' : '−'}${Math.abs(Math.round((last.value - first.value) * 10) / 10)} kg`} in {weeksBetween(first.measuredAt, last.measuredAt)} weeks
            </p>
            <div style={{ marginTop: 'auto' }}>
              <TrendChart points={w.series} label={`Weight from ${first.value} to ${last.value} kg over ${weeksBetween(first.measuredAt, last.measuredAt)} weeks`} height={70} />
            </div>
            <div className="c1-lg2" style={{ justifyContent: 'space-between' }}>
              <span>{first.value} kg · {fmt.mon(first.measuredAt)}</span>
              {w.goalKg ? <span>Goal {w.goalKg} kg</span> : null}
              <span>{last.value} kg · latest</span>
            </div>
          </>
        ) : (
          <EmptyState title="No weight readings yet">Add a weight to see the trend.</EmptyState>
        )}
      </Box>

      <Box title="Devices" actions={<Badge tone="outline">Coming soon</Badge>}>
        {v.devices.map((d) => (
          <div className="c1-dev" key={d.name}>
            <span className="c1-ic" style={{ background: 'var(--tint-teal)', color: 'var(--primary-text)' }}><Icon d={ICONS.pulse} /></span>
            <div className="c1-grow">
              <strong className="c1-strong" style={{ fontSize: 14 }}>{d.name}</strong>
              <div className="c1-muted">{d.hint}</div>
            </div>
          </div>
        ))}
      </Box>
    </section>
  )
}

function AllReadings() {
  const readings = useVitalReadings(undefined, 90, 60)
  const cols: TableColumn<VitalReadingDto>[] = [
    { key: 'when', header: 'When', mono: true, render: (r) => fmt.dateTime(r.measuredAt) },
    { key: 'label', header: 'Type' },
    { key: 'display', header: 'Reading' },
    { key: 'note', header: 'Note', render: (r) => r.note ?? (r.context ? humanise(r.context) : '—') },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.flagged ? 'warning' : 'success'}>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
  ]
  return (
    <Box as="section" delay={240} label="All readings">
      <div className="c1-bh"><h2 className="c1-bt">All readings</h2><span className="c1-muted">Out-of-range rows are highlighted</span></div>
      <Async query={readings} what="your readings" skeleton={<Skeleton lines={6} height={16} />}>
        {(rows) => (
          <Table caption="Home vitals readings" columns={cols} rows={rows} rowKey="id" density="compact" striped isRowHighlighted={(r) => r.flagged} maxHeight={420} empty="No readings yet. Add one above." />
        )}
      </Async>
    </Box>
  )
}

export default function CitizenVitals() {
  const summary = useVitalsSummary()
  return (
    <Page label="Home vitals">
      <PageHeader eyebrow="Health" title="Home vitals" subtitle="Readings you take at home. Your doctor sees them only during a session you open." />
      <Async query={summary} what="your vitals" skeleton={<><div className="c1-grid c1-g4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={110} radius={20} />)}</div><Skeleton lines={8} height={16} /></>}>
        {(v) => (
          <>
            <Latest v={v} />
            <section className="c1-grid c1-g2 c1-in" style={{ animationDelay: '120ms' }}>
              <AddReading />
              <BpCard v={v} />
            </section>
            <Lower v={v} />
            <AllReadings />
          </>
        )}
      </Async>
    </Page>
  )
}

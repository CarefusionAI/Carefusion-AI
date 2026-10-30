import { useEffect, useMemo, useState } from 'react'
import type { GovMap, GovUnit } from '@carefusion/shared'
import { useGovMap } from '../../../../api/gov'
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton, Table } from '../../../../components/ui'
import type { TableColumn } from '../../../../components/ui'
import { Segmented } from '../common'
import { PALETTES, TileMap } from '../TileMap'
import type { TileCell } from '../TileMap'
import { DISEASE_NAMES } from '../types'
import type { SectionProps } from '../types'
import { fmtNum, fmtNum1 } from '../util'

type Metric = 'registered' | 'disease' | 'blood'

function bloodLevel(days: number): number {
  return days < 4 ? 4 : days < 6 ? 3 : days < 8 ? 2 : days < 11 ? 1 : 0
}

function diseaseLevel(perLakh: number, threshold: number): number {
  const r = perLakh / Math.max(0.0001, threshold)
  return r < 0.4 ? 0 : r < 0.7 ? 1 : r < 1 ? 2 : r < 1.4 ? 3 : 4
}

/** Colour level and label for one unit under one metric. The registered share is shaded relative to this area. */
function cellFor(u: GovUnit, metric: Metric, map: GovMap, regRange: [number, number]): TileCell {
  if (metric === 'registered') {
    const v = u.registered?.pctOfPopulation
    if (v === null || v === undefined) return { level: null, value: '–', spoken: 'Registered share not available' }
    const [lo, hi] = regRange
    const lvl = hi > lo ? Math.min(4, Math.floor(((v - lo) / (hi - lo)) * 5)) : 2
    const txt = v !== 0 && v < 1 ? `${v.toFixed(2)}%` : `${fmtNum1(v)}%`
    return { level: lvl, value: txt, spoken: `${txt} of residents registered` }
  }
  if (metric === 'disease') {
    const code = map.disease?.code
    const d = code ? u.diseases[code] : undefined
    if (!d || !d.reported) return { level: null, value: 'n/r', spoken: 'No report this week' }
    if (d.suppressed || d.perLakh === null) return { level: null, value: '<5', spoken: 'Fewer than 5 cases, hidden to protect privacy' }
    return {
      level: diseaseLevel(d.perLakh, map.disease?.thresholdPerLakh ?? 10),
      value: fmtNum1(d.perLakh),
      spoken: `${fmtNum1(d.perLakh)} cases per lakh${d.aboveThreshold ? ', above threshold' : ''}`,
    }
  }
  const days = u.blood?.daysCover
  if (days === null || days === undefined) return { level: null, value: '–', spoken: 'Blood cover not available' }
  return { level: bloodLevel(days), value: `${Math.round(days)} d`, spoken: `${Math.round(days)} days of blood cover` }
}

const LEGENDS: Record<Metric, string[]> = {
  registered: ['Lowest in area', '', '', '', 'Highest in area'],
  disease: ['Low', '', '', '', 'High'],
  blood: ['14 days', '', '', '', 'Under 4 days'],
}

function statusBadge(u: GovUnit) {
  if (u.hot) return <Badge tone="danger">Outbreak watch</Badge>
  if (u.status === 'low_blood') return <Badge tone="warning">Low blood</Badge>
  return <Badge tone="success">Normal</Badge>
}

/**
 * Tile map with the metric switch, the selected-unit card and "Needs attention".
 * Used on the Overview (compact) and on the Map section (with the ranking table).
 */
export function MapPanel({ ctx, goTo, compact }: SectionProps & { compact?: boolean }) {
  const [metric, setMetric] = useState<Metric>('disease')
  const [disease, setDisease] = useState<string | undefined>(undefined)
  const q = useGovMap(metric, disease)
  const map = q.data
  const [sel, setSel] = useState<string | null>(null)

  useEffect(() => {
    if (map && (!sel || !map.units.some((u) => u.id === sel))) {
      const hot = map.units.find((u) => u.hot)
      setSel((hot ?? map.units[0])?.id ?? null)
    }
  }, [map, sel])

  const regRange = useMemo<[number, number]>(() => {
    const vs = (map?.units ?? []).map((u) => u.registered?.pctOfPopulation).filter((v): v is number => typeof v === 'number')
    return vs.length ? [Math.min(...vs), Math.max(...vs)] : [0, 0]
  }, [map])

  const child = ctx.child
  const unit = map?.units.find((u) => u.id === sel) ?? null
  const avail = map?.availability[metric]
  const unavailable = avail && !avail.available ? avail.reason : null
  const diseaseCodes = useMemo(() => (map?.units[0] ? Object.keys(map.units[0].diseases) : []), [map])
  const diseaseName = map?.disease?.name ?? 'Disease'
  const metricLabel = metric === 'registered' ? 'Registered' : metric === 'blood' ? 'Blood cover' : `${diseaseName} rate`

  const alertable = unit && (unit.kind === 'district' || unit.kind === 'state')

  return (
    <div className="gv-stack">
      <div className={compact ? undefined : 'gv-split'}>
        <Card
          title={`${child.plural} · ${metricLabel}`}
          titleAs="h2"
          actions={
            <Segmented<Metric>
              label="Map metric"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'registered', label: 'Registered' },
                { value: 'disease', label: `${diseaseName} rate` },
                { value: 'blood', label: 'Blood cover' },
              ]}
            />
          }
        >
          <div className="gv-tight">
            {metric === 'disease' && diseaseCodes.length > 1 ? (
              <Select
                label="Disease"
                value={map?.disease?.code ?? ''}
                onChange={(v) => setDisease(v)}
                options={diseaseCodes.map((c) => ({ value: c, label: DISEASE_NAMES[c] ?? c }))}
              />
            ) : null}
            {unavailable ? (
              <Alert tone="info" title={`${metricLabel} is not available for ${child.plural.toLowerCase()}`}>
                {unavailable}
              </Alert>
            ) : null}
            {!map ? (
              q.isError ? (
                <Alert tone="danger" title="The map could not be loaded">
                  Please try again in a moment.
                </Alert>
              ) : (
                <Skeleton height={260} radius={12} />
              )
            ) : (
              <TileMap
                level={ctx.level}
                units={map.units}
                palette={metric}
                selectedId={sel}
                onSelect={setSel}
                cellOf={(u) => cellFor(u, metric, map, regRange)}
                label={`${child.plural} of ${ctx.unit.name}, coloured by ${metricLabel.toLowerCase()}`}
              />
            )}
            <div className="gv-legend">
              {PALETTES[metric].map((p, i) => (
                <span key={i}>
                  <span className="gv-sw" style={{ background: p.fill }} aria-hidden="true" />
                  {LEGENDS[metric][i]}
                </span>
              ))}
              <span>
                <span className="gv-sw" style={{ background: '#efe7de', borderStyle: 'dashed', borderColor: '#9a4a46' }} aria-hidden="true" />
                Outbreak watch (!)
              </span>
              <span style={{ marginLeft: 'auto' }}>
                Selected: <strong className="gv-strong">{unit?.name ?? '–'}</strong>
              </span>
            </div>
          </div>
        </Card>

        <div className="gv-stack">
          {unit && map ? (
            <Card title={unit.name} titleAs="h3" actions={statusBadge(unit)}>
              <div className="gv-tight">
                <div className="gv-tiles">
                  <div className="gv-tile">
                    <p className="gv-tile-label">Registered</p>
                    <p className="gv-tile-value">{cellFor(unit, 'registered', map, regRange).value}</p>
                  </div>
                  <div className="gv-tile">
                    <p className="gv-tile-label">{diseaseName}</p>
                    <p className="gv-tile-value">
                      {(() => {
                        const c = cellFor(unit, 'disease', map, regRange)
                        return c.value === '–' || c.value === '<5' || c.value === 'n/r' ? c.value : `${c.value} / lakh`
                      })()}
                    </p>
                  </div>
                  <div className="gv-tile">
                    <p className="gv-tile-label">Blood cover</p>
                    <p className="gv-tile-value">{unit.blood?.daysCover != null ? `${Math.round(unit.blood.daysCover)} days` : '–'}</p>
                  </div>
                  <div className="gv-tile">
                    <p className="gv-tile-label">Facilities</p>
                    <p className="gv-tile-value">{unit.facilities !== null ? fmtNum(unit.facilities) : '–'}</p>
                  </div>
                  <div className="gv-tile">
                    <p className="gv-tile-label">Doctors online</p>
                    <p className="gv-tile-value">{unit.liveSessions !== null ? fmtNum(unit.liveSessions) : '–'}</p>
                  </div>
                  <div className="gv-tile">
                    <p className="gv-tile-label">Admin</p>
                    <p className="gv-tile-value" style={{ fontSize: 15 }}>
                      {unit.admin ?? 'Assigned'}
                    </p>
                  </div>
                </div>
                {unit.kind === 'block' ? (
                  <p className="gv-muted">Registrations, blood and facilities are recorded by district, so a block shows only its disease numbers.</p>
                ) : null}
                <div className="gv-row">
                  <Button
                    size="sm"
                    disabled={!alertable}
                    onClick={() =>
                      goTo('alerts', {
                        alertTarget: { unitId: unit.id, unitName: unit.name, unitKind: unit.kind },
                        alertDraft: unit.hot && map.anomaly ? { title: map.anomaly.title, body: '' } : undefined,
                      })
                    }
                  >
                    {unit.kind === 'block' ? 'Alert the district' : `Alert this ${unit.kind}`}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => goTo('reports')}>
                    Export summary
                  </Button>
                </div>
                {unit.kind === 'block' ? <p className="gv-muted">Alerts go to a whole district or higher, not to a single block.</p> : null}
              </div>
            </Card>
          ) : null}
          {map && map.needsAttention.length ? (
            <Card title="Needs attention" titleAs="h3" actions={<span className="gv-muted">lowest · {metricLabel}</span>}>
              <ul className="gv-list" aria-label="Needs attention">
                {map.needsAttention.map((n) => (
                  <li key={n.id} className="gv-li">
                    <div className="gv-li-head">
                      <button type="button" className="gv-link" onClick={() => setSel(n.id)}>
                        {n.name}
                      </button>
                      <span className="gv-num gv-strong">{n.value === null ? '<5' : fmtNum1(n.value)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
      {!compact && map ? (
        <Card title={`Ranking · ${metricLabel}`} titleAs="h2" actions={<span className="gv-muted">Top {map.ranking.length} of {map.units.length}</span>}>
          <RankingTable map={map} metric={metric} regRange={regRange} unitLabel={child.label} />
        </Card>
      ) : null}
      {!compact && map ? (
        <Card tone="peach" title="How the map is coloured" titleAs="h3">
          <p className="gv-body">{map.legend.note}</p>
          <p className="gv-muted" style={{ marginTop: 8 }}>
            The registered share is shaded relative to this area (the demo has few registrations). Blood cover under {map.legend.blood.lowBelowDays} days is low, under {map.legend.blood.watchBelowDays} days is watch.
          </p>
        </Card>
      ) : null}
    </div>
  )
}

function RankingTable({ map, metric, regRange, unitLabel }: { map: GovMap; metric: Metric; regRange: [number, number]; unitLabel: string }) {
  const byId = new Map(map.units.map((u) => [u.id, u]))
  type Row = { rank: number; id: string; name: string }
  const rows: Row[] = map.ranking.map((r) => ({ rank: r.rank, id: r.id, name: r.name }))
  const cols: TableColumn<Row>[] = [
    { key: 'rank', header: '#', width: 48 },
    { key: 'name', header: unitLabel },
    ...(['registered', 'disease', 'blood'] as Metric[]).map((m) => ({
      key: m,
      header: m === 'registered' ? 'Registered' : m === 'disease' ? `${map.disease?.name ?? 'Disease'} / lakh` : 'Blood cover',
      align: 'right' as const,
      render: (r: Row) => {
        const u = byId.get(r.id)
        if (!u) return '–'
        return cellFor(u, m, map, regRange).value
      },
    })),
  ]
  return (
    <>
      <Table<Row> columns={cols} rows={rows} rowKey="id" caption={`Ranking by ${metric}`} striped />
      {!rows.length ? <EmptyState title="Nothing to rank yet" /> : null}
    </>
  )
}

export default function MapSection(props: SectionProps) {
  const { ctx } = props
  return (
    <div className="gv-stack">
      <PageHeader
        eyebrow={ctx.child.plural}
        title={`Map of ${ctx.unit.name}`}
        subtitle={`Each tile is one ${ctx.child.label.toLowerCase()}. Pick a tile to see its numbers, then message or alert it.`}
      />
      <MapPanel {...props} />
    </div>
  )
}

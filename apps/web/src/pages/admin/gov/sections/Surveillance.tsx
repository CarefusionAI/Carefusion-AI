import { useState } from 'react'
import type { GovAnomaly, GovSurveillance } from '@carefusion/shared'
import {
  govErrorText,
  useCreateAction,
  useFieldRequest,
  useGovSurveillance,
  useReviewAnomaly,
  useUpdateAction,
} from '../../../../api/gov'
import { AIInsight, Alert, Badge, Button, Card, EmptyState, PageHeader, Skeleton, StatCard, Table, TextField } from '../../../../components/ui'
import type { TableColumn } from '../../../../components/ui'
import { ActionModal, Dot, QueryState, Segmented, WidgetView, useGovToast } from '../common'
import { BarChart } from '../charts'
import type { SectionProps } from '../types'
import { fmtDateTime, fmtNum, fmtNum1, humanise, isoWeekLabel, statusTone } from '../util'

type Stats = Extract<GovSurveillance['stats'], { available: true }>['data']
type Rate = Extract<GovSurveillance['highestRates'], { available: true }>['data'][number]

function InsightBlock({ s, goTo }: { s: GovSurveillance; goTo: SectionProps['goTo'] }) {
  const review = useReviewAnomaly()
  const toast = useGovToast()
  const [fieldFor, setFieldFor] = useState<GovAnomaly | null>(null)
  const field = useFieldRequest()
  const [team, setTeam] = useState('')

  return (
    <WidgetView w={s.insight} title="Anomaly detection is not available">
      {(ins) =>
        ins.kind === 'anomaly' ? (
          <div className="gv-tight">
            <AIInsight
              title={ins.anomaly.title}
              module="Anomaly detection"
              status="caution"
              confidence={ins.anomaly.confidence}
              evidence={ins.anomaly.evidence}
              footer={ins.anomaly.needsEpidemiologistReview ? <Badge tone="outline">Needs epidemiologist review</Badge> : undefined}
            >
              {ins.anomaly.body}
            </AIInsight>
            <div className="gv-row">
              <Badge tone={statusTone(ins.anomaly.status)}>{humanise(ins.anomaly.status)}</Badge>
              {ins.anomaly.status === 'open' ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={review.isPending}
                    onClick={() =>
                      review.mutate(
                        { id: ins.anomaly.id, status: 'reviewed' },
                        { onSuccess: () => toast('Marked as reviewed by an epidemiologist.'), onError: (e) => toast(govErrorText(e), { error: true }) },
                      )
                    }
                  >
                    Mark as reviewed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={review.isPending}
                    onClick={() =>
                      review.mutate(
                        { id: ins.anomaly.id, status: 'dismissed' },
                        { onSuccess: () => toast('Anomaly dismissed.'), onError: (e) => toast(govErrorText(e), { error: true }) },
                      )
                    }
                  >
                    Dismiss
                  </Button>
                </>
              ) : null}
            </div>
            <div className="gv-row">
              <Button
                size="sm"
                variant="soft"
                onClick={() =>
                  goTo('alerts', { alertDraft: { title: ins.anomaly.title.slice(0, 80), body: '', category: 'outbreak' } })
                }
              >
                Draft an advisory
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setFieldFor(ins.anomaly)}>
                Request field investigation
              </Button>
            </div>
            <ActionModal
              open={fieldFor !== null}
              title="Request field investigation"
              confirmLabel="Send request"
              noReason
              onClose={() => setFieldFor(null)}
              onConfirm={async () => {
                if (!team.trim()) throw new Error('Name the team to send.')
                await field.mutateAsync({ anomalyId: fieldFor!.id, teamName: team.trim() })
                return `Field investigation requested · ${team.trim()}`
              }}
            >
              <p className="gv-body">
                Ask a field team to look into: <strong>{fieldFor?.title}</strong>. The request is recorded and the team is notified.
              </p>
              <TextField label="Team" required value={team} onChange={(e) => setTeam(e.target.value)} placeholder="District Rapid Response Team" />
            </ActionModal>
          </div>
        ) : (
          <AIInsight title={ins.title} module="Anomaly detection" status="verified" confidence={0.88} footer={<Badge tone="outline">Needs epidemiologist review</Badge>}>
            {ins.body}
          </AIInsight>
        )
      }
    </WidgetView>
  )
}

function ResponseActions({ s }: { s: GovSurveillance }) {
  const update = useUpdateAction()
  const create = useCreateAction()
  const toast = useGovToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [meta, setMeta] = useState('')
  const disease = s.disease?.code ?? ''
  const next: Record<string, 'planned' | 'in_progress' | 'done'> = { planned: 'in_progress', in_progress: 'done' }

  return (
    <Card title="Response actions" titleAs="h3" actions={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Add action</Button>}>
      {s.responseActions.length ? (
        <ul className="gv-list" aria-label="Response actions">
          {s.responseActions.map((a) => (
            <li key={a.id} className="gv-li">
              <div className="gv-li-head">
                <p className="gv-li-title">
                  <Dot tone={a.status === 'done' ? 'success' : a.status === 'in_progress' ? 'info' : 'warning'} />
                  {a.title}
                </p>
                <Badge tone={statusTone(a.status)}>{humanise(a.status)}</Badge>
              </div>
              {a.meta ? <p className="gv-li-sub">{a.meta}</p> : null}
              {next[a.status] ? (
                <div>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={update.isPending && update.variables?.id === a.id}
                    onClick={() =>
                      update.mutate(
                        { id: a.id, status: next[a.status]! },
                        { onSuccess: () => toast(`Marked ${humanise(next[a.status]!).toLowerCase()}.`), onError: (e) => toast(govErrorText(e), { error: true }) },
                      )
                    }
                  >
                    {a.status === 'planned' ? 'Start' : 'Mark done'}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No response actions yet" titleAs="h4">
          Record what teams are doing about this disease.
        </EmptyState>
      )}
      <ActionModal
        open={open}
        title="Add a response action"
        confirmLabel="Add action"
        noReason
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          if (!title.trim()) throw new Error('Give the action a title.')
          await create.mutateAsync({ disease, title: title.trim(), meta: meta.trim() || undefined })
          setTitle('')
          setMeta('')
          return 'Response action added.'
        }}
      >
        <TextField label="What is being done" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Detail" optional maxLength={240} value={meta} onChange={(e) => setMeta(e.target.value)} helper="For example where, since when, how many." />
      </ActionModal>
    </Card>
  )
}

function Body({ s, disease, setDisease, goTo, ctx }: { s: GovSurveillance; disease: string; setDisease: (d: string) => void } & SectionProps) {
  const name = s.disease?.name ?? 'Disease'
  const unit = ctx.child.label.toLowerCase()
  const rateCols: TableColumn<Rate>[] = [
    { key: 'name', header: ctx.child.label },
    { key: 'cases', header: 'Cases', align: 'right', render: (r) => r.casesLabel },
    { key: 'perLakh', header: 'Per lakh', align: 'right', render: (r) => (r.perLakh === null ? '–' : fmtNum1(r.perLakh)) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge tone={r.status === 'above_threshold' ? 'danger' : 'success'}>{r.status === 'above_threshold' ? 'Above threshold' : 'Normal'}</Badge>,
    },
  ]
  return (
    <div className="gv-stack">
      <PageHeader
        eyebrow="Disease surveillance · weekly, de-identified"
        title={`${name} in ${ctx.unit.name}`}
        subtitle={s.note}
        actions={
          s.diseases.length > 1 ? (
            <Segmented
              label="Disease"
              value={disease || (s.disease?.code ?? '')}
              onChange={setDisease}
              options={s.diseases.map((d) => ({ value: d.code, label: d.name }))}
            />
          ) : undefined
        }
      />

      <WidgetView w={s.stats} title="Weekly figures are not available">
        {(st: Stats) => (
          <div className="gv-grid-4">
            <StatCard
              tone="peach"
              label="This week"
              value={st.thisWeek === null ? '<5' : fmtNum(st.thisWeek)}
              unit="cases"
              trend={st.trend ? { direction: st.trend.direction, text: `${Math.abs(st.trend.pctVsBaseline)}% ${st.trend.direction === 'up' ? 'above' : 'below'} baseline` } : undefined}
              hint={st.trend ? undefined : 'No clear trend yet'}
            />
            <StatCard label="5-year baseline" value={st.baseline5y === null ? '–' : fmtNum(st.baseline5y)} unit="cases" hint={st.baselineNote} />
            <StatCard tone="blue" label="Rate" value={st.ratePerLakh === null ? '–' : fmtNum1(st.ratePerLakh)} unit="per lakh" hint={`${ctx.level === 'central' ? 'Country' : ctx.unit.name}-wide, this week`} />
            <StatCard
              label="Units above threshold"
              value={fmtNum(st.unitsAboveThreshold)}
              unit={`of ${fmtNum(st.unitsReporting)}`}
              hint={st.thresholdNote}
            />
          </div>
        )}
      </WidgetView>

      <div className="gv-split">
        <Card title={`Weekly cases${s.week ? ' · last 12 weeks' : ''}`} titleAs="h2">
          <WidgetView w={s.series} title="Weekly series not available">
            {(series) => (
              <BarChart
                items={series.map((p, i) => ({
                  label: isoWeekLabel(p.isoWeek),
                  value: p.cases,
                  highlight: i === series.length - 1,
                }))}
                baseline={series.map((p) => p.baseline)}
                baselineName="5-year baseline"
                valueName="Reported cases"
                label={`${name}: weekly reported cases for the last ${series.length} weeks against the 5-year baseline. Counts under 5 are hidden.`}
                labelEvery={3}
                showAllValues
                height={200}
              />
            )}
          </WidgetView>
        </Card>
        <InsightBlock s={s} goTo={goTo} />
      </div>

      <div className="gv-split-even">
        <Card title={`Highest rates · ${name}`} titleAs="h3" actions={<button type="button" className="gv-link" onClick={() => goTo('map')}>Open map</button>}>
          <WidgetView w={s.highestRates} title="Rates by area not available">
            {(rows) => <Table<Rate> columns={rateCols} rows={rows} rowKey="unitId" caption={`Highest ${name} rates by ${unit}`} empty="No area reported this week." />}
          </WidgetView>
        </Card>
        <ResponseActions s={s} />
      </div>

      {s.fieldRequests.length ? (
        <Card title="Field investigations" titleAs="h3">
          <ul className="gv-list" aria-label="Field investigation requests">
            {s.fieldRequests.map((f) => (
              <li key={f.id} className="gv-li">
                <div className="gv-li-head">
                  <p className="gv-li-title">{f.teamName}</p>
                  <Badge tone={statusTone(f.status)}>{humanise(f.status)}</Badge>
                </div>
                <p className="gv-li-sub">
                  {f.anomalyTitle} · requested by {f.requestedBy} · {fmtDateTime(f.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {s.anomalies.length > 1 ? (
        <Card title="All flagged patterns" titleAs="h3">
          <ul className="gv-list">
            {s.anomalies.map((a) => (
              <li key={a.id} className="gv-li">
                <div className="gv-li-head">
                  <p className="gv-li-title">{a.title}</p>
                  <Badge tone={statusTone(a.status)}>{humanise(a.status)}</Badge>
                </div>
                <p className="gv-li-sub">
                  {a.diseaseName} · simulated AI output · confidence {Math.round(a.confidence * 100)}%
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {ctx.level !== 'district' ? (
        <Card title={`By ${ctx.child.label.toLowerCase()}`} titleAs="h3">
          <WidgetView w={s.districts} title="Breakdown not available">
            {(rows) => (
              <Table
                caption={`${name} cases by ${unit}`}
                columns={[
                  { key: 'name', header: ctx.child.label },
                  { key: 'cases', header: 'Cases', align: 'right' as const, render: (r: (typeof rows)[number]) => (r.suppressed ? '<5' : r.cases === null ? '–' : fmtNum(r.cases)) },
                  { key: 'perLakh', header: 'Per lakh', align: 'right' as const, render: (r: (typeof rows)[number]) => (r.perLakh === null ? '–' : fmtNum1(r.perLakh)) },
                  { key: 'baseline', header: 'Baseline', align: 'right' as const, render: (r: (typeof rows)[number]) => (r.baseline === null ? '–' : fmtNum(r.baseline)) },
                  {
                    key: 'above',
                    header: 'Vs baseline',
                    render: (r: (typeof rows)[number]) => (r.aboveBaseline === null ? '–' : <Badge tone={r.aboveBaseline ? 'danger' : 'success'}>{r.aboveBaseline ? 'Above baseline' : 'Within baseline'}</Badge>),
                  },
                ]}
                rows={rows}
                rowKey="districtId"
                maxHeight={360}
                stickyHeader
              />
            )}
          </WidgetView>
        </Card>
      ) : null}
      <Alert tone="info">Counts under {ctx.smallCellMin} are hidden to protect privacy. Anomaly detection is a simulated AI output and always needs epidemiologist review.</Alert>
    </div>
  )
}

export default function Surveillance(props: SectionProps) {
  const [disease, setDisease] = useState('')
  const q = useGovSurveillance(disease || undefined)
  return (
    <QueryState q={q} skeleton={<Skeleton height={320} radius={16} />}>
      {(s) => <Body {...props} s={s} disease={disease} setDisease={setDisease} />}
    </QueryState>
  )
}


import { useState } from 'react'
import type { GovReportExport, GovReportPeriod, GovReports } from '@carefusion/shared'
import { downloadExport, govErrorText, useCreateExport, useGovReports } from '../../../../api/gov'
import { Alert, Badge, Button, Card, PageHeader, Select, Skeleton, Table } from '../../../../components/ui'
import { QueryState, useGovToast } from '../common'
import type { SectionProps } from '../types'
import { fmtDateTime, fmtDate, humanise } from '../util'

type Report = GovReports['reports'][number]

function sizeText(b: number | null): string {
  if (b === null) return '–'
  return b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`
}

function Body({ r }: { r: GovReports } & SectionProps) {
  const toast = useGovToast()
  const create = useCreateExport()
  const [period, setPeriod] = useState<GovReportPeriod>('30d')
  const [busy, setBusy] = useState<string | null>(null)
  const pdf = r.formats.find((f) => f.format === 'pdf')

  async function run(rep: Report) {
    setBusy(rep.code)
    try {
      const exp = await create.mutateAsync({ report: rep.code, period, format: 'csv' })
      await downloadExport(exp)
      toast(`${exp.filename} exported (de-identified) and downloaded.`)
    } catch (e) {
      toast(govErrorText(e), { error: true })
    } finally {
      setBusy(null)
    }
  }

  async function again(e: GovReportExport) {
    try {
      await downloadExport(e)
    } catch (err) {
      toast(govErrorText(err), { error: true })
    }
  }

  return (
    <div className="gv-stack">
      <PageHeader
        eyebrow="Oversight"
        title="Reports and export"
        subtitle="Every export is aggregated and de-identified. Counts under the small-cell limit are hidden."
        actions={
          <Select
            label="Period"
            value={period}
            onChange={(v) => setPeriod(v as GovReportPeriod)}
            options={r.periods.map((p) => ({ value: p.key, label: p.label }))}
            helper={r.periods.find((p) => p.key === period) ? `${fmtDate(r.periods.find((p) => p.key === period)!.from)} to ${fmtDate(r.periods.find((p) => p.key === period)!.to)}` : undefined}
          />
        }
      />
      <div className="gv-grid-3">
        {r.reports.map((rep) => (
          <Card key={rep.code} title={rep.title} titleAs="h2" actions={<Badge tone="outline">{humanise(rep.frequency)}</Badge>}>
            <div className="gv-tight">
              <p className="gv-body">{rep.description}</p>
              <p className="gv-muted">Counts under {rep.smallCellMin} are hidden.</p>
              <div className="gv-row">
                <Button size="sm" loading={busy === rep.code} onClick={() => void run(rep)}>
                  Export CSV
                </Button>
                <Button size="sm" variant="secondary" disabled title={pdf && !pdf.available ? pdf.reason : undefined}>
                  PDF
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {pdf && !pdf.available ? <Alert tone="info">{pdf.reason}</Alert> : null}
      <Card title="Recent exports" titleAs="h2" actions={<span className="gv-muted">{r.retentionNote}</span>}>
        <Table<GovReportExport>
          caption="Recent exports"
          rows={r.recentExports}
          rowKey="id"
          empty="No exports yet."
          columns={[
            { key: 'filename', header: 'File', mono: true },
            { key: 'title', header: 'Report' },
            { key: 'period', header: 'Period' },
            { key: 'by', header: 'By' },
            { key: 'createdAt', header: 'When', render: (e) => fmtDateTime(e.createdAt) },
            { key: 'size', header: 'Size', align: 'right', render: (e) => sizeText(e.sizeBytes) },
            { key: 'deid', header: '', render: (e) => (e.deidentified ? <Badge tone="success">De-identified</Badge> : null) },
            {
              key: 'dl',
              header: '',
              render: (e) =>
                e.format === 'csv' ? (
                  <Button size="sm" variant="ghost" onClick={() => void again(e)}>
                    Download
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>
    </div>
  )
}

export default function Reports(props: SectionProps) {
  const q = useGovReports()
  return (
    <QueryState q={q} skeleton={<Skeleton height={300} radius={16} />}>
      {(r) => <Body {...props} r={r} />}
    </QueryState>
  )
}

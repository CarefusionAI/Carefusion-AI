import { useEffect, useState } from 'react'
import type { GovDirectory, GovGrievances } from '@carefusion/shared'
import { useGovDirectory, useGovGrievances } from '../../../../api/gov'
import type { DirectoryParams } from '../../../../api/gov'
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton, StatCard, Table, Tabs, TextField } from '../../../../components/ui'
import type { TableColumn } from '../../../../components/ui'
import { QueryState } from '../common'
import type { SectionProps } from '../types'
import { fmtDate, fmtNum, humanise, severityTone, statusTone } from '../util'

type Row = GovDirectory['items'][number]
type Tab = 'doctors' | 'facilities' | 'staff' | 'grievances'
const PAGE = 25

function GrievanceList() {
  const q = useGovGrievances()
  return (
    <QueryState q={q} skeleton={<Skeleton height={240} radius={16} />}>
      {(g: GovGrievances) => (
        <div className="gv-stack">
          <div className="gv-grid-4">
            <StatCard tone="peach" label="Open" value={fmtNum(g.open)} hint="Complaints still being handled" />
            <StatCard label="Up to 2 days" value={fmtNum(g.ageing.upTo2Days)} />
            <StatCard tone="blue" label="3 to 7 days" value={fmtNum(g.ageing.from3To7Days)} />
            <StatCard label="Over 7 days" value={fmtNum(g.ageing.over7Days)} hint="Needs attention" />
          </div>
          <Card title="Grievances" titleAs="h2">
            <Table
              caption="Grievances about facilities in your area"
              rows={g.items}
              rowKey="id"
              empty="No grievances in your area."
              columns={[
                { key: 'ref', header: 'Ref', mono: true },
                { key: 'title', header: 'Complaint', render: (r) => r.title ?? '–' },
                { key: 'facility', header: 'Facility', render: (r) => r.facility ?? '–' },
                { key: 'district', header: 'District' },
                { key: 'severity', header: 'Severity', render: (r) => (r.severity ? <Badge tone={severityTone(r.severity === 'normal' ? 'low' : r.severity)}>{humanise(r.severity)}</Badge> : '–') },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{humanise(r.status)}</Badge> },
                { key: 'dueAt', header: 'Due', render: (r) => fmtDate(r.dueAt) },
              ]}
            />
            <p className="gv-muted" style={{ marginTop: 10 }}>{g.note}</p>
          </Card>
        </div>
      )}
    </QueryState>
  )
}

export default function Directory({ ctx, navState }: SectionProps) {
  const [tab, setTab] = useState<Tab>(navState?.directoryTab ?? 'doctors')
  const [status, setStatus] = useState<DirectoryParams['status']>('all')
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (navState?.directoryTab) setTab(navState.directoryTab)
  }, [navState])
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(text.trim())
      setOffset(0)
    }, 300)
    return () => window.clearTimeout(t)
  }, [text])

  const kind: DirectoryParams['kind'] = tab === 'grievances' ? 'doctors' : tab
  const q = useGovDirectory({ kind, status, q: search || undefined, limit: PAGE, offset })

  const cols: TableColumn<Row>[] = [
    { key: 'name', header: tab === 'facilities' ? 'Facility' : 'Name' },
    { key: 'detail', header: tab === 'doctors' ? 'Speciality' : tab === 'facilities' ? 'Type' : 'Role', render: (r) => r.detail ?? '–' },
    { key: 'ref', header: tab === 'doctors' ? 'HPR ID' : tab === 'facilities' ? 'HFR ID' : 'Registration', mono: true, render: (r) => r.ref ?? '–' },
    ...(tab === 'facilities' ? [] : [{ key: 'organisation', header: 'Where', render: (r: Row) => r.organisation ?? '–' }]),
    { key: 'district', header: 'District' },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)} dot>{humanise(r.status)}</Badge> },
    { key: 'verifiedAt', header: 'Verified', render: (r) => fmtDate(r.verifiedAt) },
  ]

  return (
    <div className="gv-stack">
      <PageHeader
        eyebrow="People and facilities"
        title="Directory"
        subtitle={`Doctors, facilities and staff in ${ctx.unit.name}. Citizens are never listed here.`}
      />
      <Tabs
        label="Directory"
        value={tab}
        onChange={(t) => {
          setTab(t as Tab)
          setOffset(0)
          setStatus('all')
        }}
        variant="segmented"
        tabs={[
          { id: 'doctors', label: 'Doctors' },
          { id: 'facilities', label: 'Facilities' },
          { id: 'staff', label: 'Staff' },
          { id: 'grievances', label: 'Grievances' },
        ]}
      />
      {tab === 'grievances' ? (
        <GrievanceList />
      ) : (
        <QueryState q={q} skeleton={<Skeleton height={320} radius={16} />}>
          {(d) => (
            <>
              <div className="gv-grid-4">
                <StatCard tone="blue" label="Doctors" value={fmtNum(d.stats.doctors)} />
                <StatCard tone="sage" label="Facilities" value={fmtNum(d.stats.facilities)} />
                <StatCard label="Staff" value={fmtNum(d.stats.staff)} />
                <StatCard tone="peach" label="Needs attention" value={fmtNum(d.stats.needsAttention)} hint={`${fmtNum(d.stats.suspended)} suspended · rest pending`} />
              </div>
              <Card
                title={`${humanise(tab)} (${fmtNum(d.total)})`}
                titleAs="h2"
                actions={
                  <div className="gv-row">
                    <TextField label="Search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name, ID or place" style={{ minWidth: 200 }} />
                    <Select
                      label="Status"
                      value={status}
                      onChange={(v) => {
                        setStatus(v as DirectoryParams['status'])
                        setOffset(0)
                      }}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'active', label: 'Active' },
                        { value: 'pending', label: 'Pending' },
                        { value: 'suspended', label: 'Suspended' },
                      ]}
                    />
                  </div>
                }
              >
                <Table<Row> columns={cols} rows={d.items} rowKey="id" caption={`${humanise(tab)} directory`} empty="No one matches this filter." />
                <div className="gv-row-between" style={{ marginTop: 12 }}>
                  <p className="gv-muted">
                    Showing {d.total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, d.total)} of {fmtNum(d.total)}
                  </p>
                  <div className="gv-row">
                    <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                      Previous
                    </Button>
                    <Button size="sm" variant="secondary" disabled={offset + PAGE >= d.total} onClick={() => setOffset(offset + PAGE)}>
                      Next
                    </Button>
                  </div>
                </div>
              </Card>
              {tab === 'facilities' && d.facilityMix.length ? (
                <Card title="Facility mix" titleAs="h3">
                  <Table
                    caption="Facilities by type"
                    rows={d.facilityMix}
                    rowKey="type"
                    columns={[
                      { key: 'type', header: 'Type' },
                      { key: 'count', header: 'Count', align: 'right' as const, render: (r) => fmtNum(r.count) },
                      { key: 'pct', header: 'On platform', align: 'right' as const, render: (r) => `${r.onPlatformPct}%` },
                    ]}
                  />
                </Card>
              ) : null}
              <Alert tone="info">{d.note}</Alert>
            </>
          )}
        </QueryState>
      )}
      {!q.data && q.isError && tab !== 'grievances' ? <EmptyState title="The directory could not be loaded" /> : null}
    </div>
  )
}

import { useState } from 'react'
import { Badge, PageHeader, StatCard, Table } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { useHospitalAdmissions, useHospitalDepartments } from '../../../api/hospitalAdmin'
import type { HospitalAdmissionsResponse } from '../../../api/hospitalAdmin'
import { Async, Box, Chips, ICONS, Icon, PageSkeleton, fmtDateTime, fmtDate, toneOfStatus } from '../opsKit'
import { DeptTag } from './shared'

type Row = HospitalAdmissionsResponse['items'][number]

const STATUS_LABEL: Record<Row['status'], string> = {
  critical: 'Critical',
  watch: 'Watch',
  stable: 'Stable',
  discharge_today: 'Discharge today',
}

export default function Admissions() {
  const [dept, setDept] = useState('')
  const depts = useHospitalDepartments()
  const q = useHospitalAdmissions(dept)
  const wardDepts = (depts.data?.items ?? []).filter((d) => d.isActive && d.totalBeds > 0)

  const cols: TableColumn<Row>[] = [
    { key: 'patient', header: 'Patient', render: (r) => <strong style={{ color: 'var(--ink)' }}>{r.patient}</strong> },
    { key: 'ipNumber', header: 'IP number', mono: true, render: (r) => r.ipNumber ?? '-' },
    { key: 'bed', header: 'Bed', render: (r) => r.bed ?? '-' },
    { key: 'department', header: 'Department', render: (r) => <DeptTag name={r.department} /> },
    { key: 'doctor', header: 'Doctor', render: (r) => r.doctor ?? '-' },
    { key: 'admittedAt', header: 'Admitted', render: (r) => fmtDateTime(r.admittedAt) },
    { key: 'expectedDischarge', header: 'Expected discharge', render: (r) => (r.expectedDischarge ? fmtDate(r.expectedDischarge) : '-') },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={toneOfStatus(r.status)} dot>{STATUS_LABEL[r.status]}</Badge> },
  ]

  return (
    <div className="ak-page">
      <PageHeader
        title="Admissions"
        subtitle="Patients admitted right now. Ward staff can open these records only while the admission is active."
        actions={q.data ? <Badge tone="teal">{q.data.items.length} shown</Badge> : undefined}
      />
      <Async query={q} skeleton={<PageSkeleton boxes={1} />}>
        {(data) => (
          <>
            <div className="ak-grid ak-g4 ak-in">
              <StatCard label="Admitted" value={data.kpis.admitted} hint={`${data.kpis.admittedSinceMidnight} since midnight`} tone="blue" icon={<Icon d={ICONS.bed} />} />
              <StatCard label="Discharges planned" value={data.kpis.dischargesPlanned} hint="Expected today" tone="sage" icon={<Icon d={ICONS.tick} />} />
              <StatCard label="Critical" value={data.kpis.critical} hint={`ICU ${data.kpis.criticalIcu} · Other wards ${data.kpis.criticalOther}`} tone="peach" icon={<Icon d={ICONS.warn} />} />
              <StatCard label="Avg stay" value={data.kpis.avgStayDays ?? '-'} unit={data.kpis.avgStayDays === null ? undefined : 'days'} hint="Across current admissions" />
            </div>
            <Box className="ak-in">
              <div className="ak-bh">
                <Chips
                  label="Filter by department"
                  value={dept}
                  onChange={setDept}
                  options={[{ id: '', label: 'All' }, ...wardDepts.map((d) => ({ id: d.name, label: d.name }))]}
                />
                <span className="ak-muted">Colour + name show the department</span>
              </div>
              <Table columns={cols} rows={data.items} rowKey="id" caption="Current admissions" density="compact" striped empty="No patients are admitted here right now." />
            </Box>
          </>
        )}
      </Async>
    </div>
  )
}

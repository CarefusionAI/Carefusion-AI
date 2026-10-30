import { useEffect, useState } from 'react'
import { Alert, Badge, Button, PageHeader, Select, Table, TextField } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import {
  useCreateDepartment,
  useHospitalBeds,
  useHospitalDepartments,
  useSetBedStatus,
  useUpdateDepartment,
} from '../../../api/hospitalAdmin'
import type { HospitalBedsResponse, HospitalDepartmentsResponse } from '../../../api/hospitalAdmin'
import { Async, Bar, Box, Chips, ConfirmModal, ICONS, Icon, PageSkeleton, humanise, useFlash } from '../opsKit'

type Dept = HospitalDepartmentsResponse['items'][number]
type Bed = HospitalBedsResponse['beds'][number]
type BedTarget = 'free' | 'reserved' | 'cleaning' | 'out_of_service'

const BED_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger' | 'info'> = {
  free: 'success',
  occupied: 'info',
  reserved: 'warning',
  cleaning: 'warning',
  out_of_service: 'danger',
}

function barTone(pct: number): 'low' | 'mid' | undefined {
  return pct >= 95 ? 'low' : pct >= 85 ? 'mid' : undefined
}

function DepartmentForm({
  mode,
  dept,
  onClose,
  onDone,
}: {
  mode: 'add' | 'rename' | null
  dept: Dept | null
  onClose: () => void
  onDone: (t: string) => void
}) {
  const create = useCreateDepartment()
  const update = useUpdateDepartment()
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    if (mode) {
      setName(mode === 'rename' ? (dept?.name ?? '') : '')
      setProblem(null)
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dept?.id])

  async function submit() {
    const n = name.trim()
    if (n.length < 2) return setProblem('Enter a name of at least 2 characters.')
    setProblem(null)
    try {
      if (mode === 'add') {
        await create.mutateAsync({ name: n })
        onDone(`${n} was added. Add beds to it from the ward setup.`)
      } else if (dept) {
        await update.mutateAsync({ id: dept.id, name: n })
        onDone(`Renamed to ${n}.`)
      }
      onClose()
    } catch {
      /* shown below */
    }
  }
  const err = mode === 'add' ? create.error : update.error
  return (
    <ConfirmModal
      open={mode !== null}
      title={mode === 'add' ? 'Add department' : `Rename ${dept?.name ?? 'department'}`}
      confirmLabel={mode === 'add' ? 'Add department' : 'Save name'}
      busy={create.isPending || update.isPending}
      error={problem ?? (err ? errorMessage(err) : null)}
      onConfirm={() => void submit()}
      onClose={onClose}
      size="sm"
    >
      {mode === 'rename' ? <p className="ak-p">The new name shows everywhere this department is listed, including the roster and admissions. Past records keep pointing at the same department.</p> : null}
      <TextField label="Department name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
    </ConfirmModal>
  )
}

function BedGrid({ onFlash }: { onFlash: (tone: 'success' | 'danger', t: string) => void }) {
  const [ward, setWard] = useState('')
  const q = useHospitalBeds(ward)
  const setStatus = useSetBedStatus()
  const [target, setTarget] = useState<{ bed: Bed; status: BedTarget } | null>(null)

  async function apply(bed: Bed, status: BedTarget) {
    try {
      await setStatus.mutateAsync({ id: bed.id, status })
      onFlash('success', `${bed.bedNo} is now ${humanise(status).toLowerCase()}.`)
      setTarget(null)
    } catch (e) {
      if (target) return
      onFlash('danger', errorMessage(e))
    }
  }

  const cols: TableColumn<Bed>[] = [
    { key: 'bedNo', header: 'Bed', render: (b) => <strong style={{ color: 'var(--ink)' }}>{b.bedNo}</strong> },
    { key: 'ward', header: 'Ward' },
    { key: 'bedType', header: 'Type', render: (b) => humanise(b.bedType) },
    { key: 'status', header: 'Status', render: (b) => <Badge tone={BED_TONE[b.status] ?? 'neutral'} dot>{humanise(b.status)}</Badge> },
    { key: 'patient', header: 'Patient', render: (b) => b.patient ?? '-' },
    {
      key: 'act',
      header: 'Set status',
      render: (b) =>
        b.status === 'occupied' ? (
          <span className="ak-muted">Has a patient</span>
        ) : (
          <Select
            aria-label={`Set status for ${b.bedNo}`}
            value={b.status}
            options={[
              { value: 'free', label: 'Free' },
              { value: 'reserved', label: 'Reserved' },
              { value: 'cleaning', label: 'Cleaning' },
              { value: 'out_of_service', label: 'Out of service' },
            ]}
            onChange={(v) => {
              if (v === b.status) return
              if (v === 'out_of_service') setTarget({ bed: b, status: v })
              else void apply(b, v as BedTarget)
            }}
          />
        ),
    },
  ]

  return (
    <Box title="Beds by ward">
      <Async query={q} skeleton={<PageSkeleton stats={false} boxes={1} />}>
        {(data) => (
          <>
            <Chips
              label="Filter by ward"
              value={ward}
              onChange={setWard}
              options={[{ id: '', label: 'All wards' }, ...data.wards.filter((w) => w.isActive).map((w) => ({ id: w.id, label: `${w.name} (${w.free} free)` }))]}
            />
            <Table columns={cols} rows={data.beds} rowKey="id" caption="Beds" density="compact" striped maxHeight={420} empty="No beds in this ward." />
          </>
        )}
      </Async>
      <ConfirmModal
        open={target !== null}
        title={`Take ${target?.bed.bedNo ?? 'bed'} out of service?`}
        confirmLabel="Take out of service"
        danger
        busy={setStatus.isPending}
        error={setStatus.isError ? errorMessage(setStatus.error) : null}
        onConfirm={() => target && void apply(target.bed, target.status)}
        onClose={() => setTarget(null)}
        size="sm"
      >
        <p className="ak-p">The bed stops counting as available. The free-bed numbers shared with the district dashboard drop by one until you set it back to free.</p>
      </ConfirmModal>
    </Box>
  )
}

export default function Beds() {
  const q = useHospitalDepartments()
  const update = useUpdateDepartment()
  const [form, setForm] = useState<{ mode: 'add' | 'rename'; dept: Dept | null } | null>(null)
  const [toggling, setToggling] = useState<Dept | null>(null)
  const { show, node } = useFlash()

  async function toggleActive(d: Dept) {
    try {
      await update.mutateAsync({ id: d.id, isActive: !d.isActive })
      setToggling(null)
      show('success', `${d.name} is now ${d.isActive ? 'inactive' : 'active'}.`)
    } catch {
      /* shown in modal */
    }
  }

  return (
    <div className="ak-page">
      <PageHeader
        title="Departments & beds"
        subtitle="Bed counts update from admissions. Published to the district dashboard every 15 minutes."
        actions={
          <Button variant="primary" icon={<Icon d={ICONS.plus} />} onClick={() => setForm({ mode: 'add', dept: null })}>
            Add department
          </Button>
        }
      />
      {node}
      <Async query={q} skeleton={<PageSkeleton stats={false} boxes={2} />}>
        {(data) => (
          <>
            <div className="ak-wrap ak-in">
              <Badge tone="teal">
                {data.totals.occupied} of {data.totals.total} beds occupied {'·'} {data.totals.pctFull}%
              </Badge>
              {data.unassignedBeds ? <Badge tone="warning">{data.unassignedBeds.total} beds have no department</Badge> : null}
            </div>
            <div className="ak-grid ak-g3 ak-in">
              {data.items.map((d) => (
                <Box key={d.id} className={d.isActive ? undefined : 'is-tint'}>
                  <div className="ak-bh">
                    <h2 className="ak-bt">{d.name}</h2>
                    {d.isActive ? <Badge tone={d.tone}>{d.pctFull}%</Badge> : <Badge tone="neutral">Inactive</Badge>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 30, fontWeight: 600, color: 'var(--ink-strong)' }}>{d.occupied}</span>
                    <span className="ak-muted">
                      of {d.totalBeds} beds {'·'} {d.free} free
                    </span>
                  </div>
                  <Bar pct={d.pctFull} tone={barTone(d.pctFull)} />
                  <div className="ak-muted">
                    Head: {d.head ?? 'Not assigned'} {'·'} {d.staff} staff
                  </div>
                  <div className="ak-wrap">
                    <button type="button" className="ak-rowbtn" onClick={() => setForm({ mode: 'rename', dept: d })}>
                      Rename
                    </button>
                    <button type="button" className={`ak-rowbtn${d.isActive ? ' is-danger' : ''}`} onClick={() => (d.isActive ? setToggling(d) : void toggleActive(d))}>
                      {d.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </Box>
              ))}
            </div>
            {data.items.length === 0 ? <Alert tone="info">No departments yet. Add the first one.</Alert> : null}
          </>
        )}
      </Async>
      <BedGrid onFlash={(tone, t) => show(tone, t)} />

      <DepartmentForm mode={form?.mode ?? null} dept={form?.dept ?? null} onClose={() => setForm(null)} onDone={(t) => show('success', t)} />
      <ConfirmModal
        open={toggling !== null}
        title={`Deactivate ${toggling?.name ?? 'department'}?`}
        confirmLabel="Deactivate"
        danger
        busy={update.isPending}
        error={update.isError ? errorMessage(update.error) : null}
        onConfirm={() => toggling && void toggleActive(toggling)}
        onClose={() => setToggling(null)}
        size="sm"
      >
        <p className="ak-p">
          The department is marked inactive. Its beds, staff and current admissions are not deleted or moved, and you can reactivate it at any time. Check that no one still relies on it before you continue.
        </p>
      </ConfirmModal>
    </div>
  )
}

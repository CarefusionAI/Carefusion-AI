import { useEffect, useState } from 'react'
import { Avatar, Badge, Button, PageHeader, Select, StatCard, Table, TextField } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useCreateHospitalStaff, useHospitalDepartments, useHospitalStaff } from '../../../api/hospitalAdmin'
import type { HospitalStaffMember } from '../../../api/hospitalAdmin'
import PersonPicker from '../PersonPicker'
import type { PersonHit } from '../../../api/peopleSearch'
import { Async, Box, Chips, ConfirmModal, ICONS, Icon, PageSkeleton, Row, RowText, UUID_RE, fmtDate, useFlash } from '../opsKit'

type RoleFilter = '' | 'doctor' | 'nurse' | 'lab' | 'radiology' | 'pharmacist'

const STATUS: Record<string, { label: string; tone: 'success' | 'neutral' | 'danger' }> = {
  on_duty: { label: 'On duty', tone: 'success' },
  off: { label: 'Off duty', tone: 'neutral' },
  deactivated: { label: 'Deactivated', tone: 'danger' },
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function AddStaffModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (text: string) => void }) {
  const create = useCreateHospitalStaff()
  const depts = useHospitalDepartments()
  const [person, setPerson] = useState<PersonHit | null>(null)
  const [staffRole, setStaffRole] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPerson(null)
      setStaffRole('')
      setDepartmentId('')
      setProblem(null)
      create.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function submit() {
    if (!person) return setProblem('Find and pick the person first.')
    if (!staffRole) return setProblem('Choose a staff role.')
    setProblem(null)
    try {
      await create.mutateAsync({
        personId: person.personId,
        staffRole: staffRole as 'nurse' | 'lab' | 'radiology',
        departmentId: departmentId || undefined,
      })
      onClose()
      onDone('Staff account created. It is active immediately.')
    } catch {
      /* shown below */
    }
  }

  return (
    <ConfirmModal
      open={open}
      title="Add a staff account"
      confirmLabel="Create account"
      busy={create.isPending}
      error={problem ?? (create.isError ? errorMessage(create.error) : null)}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <p className="ak-p">
        The person must already be registered. The account is active as soon as you create it and appears in the Staff Portal list. Doctors apply for themselves and are approved under Approvals.
      </p>
      <PersonPicker value={person} onPick={setPerson} />
      <Select
        label="Staff role"
        required
        placeholder="Select role"
        value={staffRole}
        options={[
          { value: 'nurse', label: 'Nurse' },
          { value: 'lab', label: 'Lab technician' },
          { value: 'radiology', label: 'Radiology technician' },
        ]}
        onChange={setStaffRole}
      />
      <Select
        label="Department"
        optional
        placeholder="No department"
        value={departmentId}
        options={(depts.data?.items ?? []).filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))}
        onChange={setDepartmentId}
      />
    </ConfirmModal>
  )
}

export default function Staff() {
  const [role, setRole] = useState<RoleFilter>('')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const query = useHospitalStaff(role, q)
  const [adding, setAdding] = useState(false)
  const { show, node } = useFlash()

  const cols: TableColumn<HospitalStaffMember>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={r.name} size={28} />
          <strong style={{ color: 'var(--ink)' }}>{r.name}</strong>
        </span>
      ),
    },
    { key: 'roleLabel', header: 'Role' },
    { key: 'department', header: 'Department', render: (r) => r.department ?? '-' },
    { key: 'registration', header: 'Registration', mono: true, render: (r) => r.registration ?? '-' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const s = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const }
        return <Badge tone={s.tone} dot>{s.label}</Badge>
      },
    },
  ]

  return (
    <div className="ak-page">
      <PageHeader
        title="Staff directory"
        subtitle={
          query.data
            ? `${query.data.kpis.activeAccounts} active accounts across ${query.data.kpis.departments} departments.`
            : 'Everyone with an account at this hospital.'
        }
        actions={
          <Button variant="primary" icon={<Icon d={ICONS.plus} />} onClick={() => setAdding(true)}>
            Add staff
          </Button>
        }
      />
      {node}
      <Async query={query} skeleton={<PageSkeleton boxes={2} />}>
        {(data) => (
          <>
            <div className="ak-grid ak-g4 ak-in">
              <StatCard label="Doctors" value={data.kpis.doctors} hint={`${data.kpis.doctorsOnDuty} on duty`} icon={<Icon d={ICONS.users} />} tone="sage" />
              <StatCard label="Nurses" value={data.kpis.nurses} hint={`${data.kpis.nursesOnDuty} on duty`} icon={<Icon d={ICONS.users} />} />
              <StatCard
                label="Technicians"
                value={data.kpis.technicians}
                hint={`Lab ${data.kpis.labTechnicians} · Radiology ${data.kpis.radiologyTechnicians}`}
                icon={<Icon d={ICONS.users} />}
                tone="blue"
              />
              <StatCard label="Pharmacists" value={data.kpis.pharmacists} hint="Linked hospital pharmacy" icon={<Icon d={ICONS.rx} />} tone="peach" />
            </div>

            <Box className="ak-in">
              <div className="ak-bh">
                <Chips<RoleFilter>
                  label="Filter by role"
                  value={role}
                  onChange={setRole}
                  options={[
                    { id: '', label: 'All' },
                    { id: 'doctor', label: 'Doctors' },
                    { id: 'nurse', label: 'Nurses' },
                    { id: 'lab', label: 'Lab' },
                    { id: 'radiology', label: 'Radiology' },
                    { id: 'pharmacist', label: 'Pharmacists' },
                  ]}
                />
                <label className="ak-search">
                  <Icon d={ICONS.search} />
                  <span className="cf-sr">Search staff by name</span>
                  <input type="search" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
              </div>
              <p className="ak-muted ak-table-note" aria-live="polite">
                Showing {data.items.length} of {data.total}
              </p>
              <Table columns={cols} rows={data.items} rowKey="userId" caption="Staff" striped empty="No staff match this filter." />
            </Box>

            {data.pendingInvites.length > 0 ? (
              <Box title="Pending invites" className="ak-in">
                <div>
                  {data.pendingInvites.map((i) => (
                    <Row key={i.id} icon={<Icon d={ICONS.mail} />} tone="blue" trailing={<Badge tone="warning">Invited</Badge>}>
                      <RowText title={i.name} sub={`${i.roleKind} · sent ${fmtDate(i.sentAt)} · expires ${fmtDate(i.expiresAt)}`} />
                    </Row>
                  ))}
                </div>
              </Box>
            ) : null}
          </>
        )}
      </Async>
      <AddStaffModal open={adding} onClose={() => setAdding(false)} onDone={(t) => show('success', t)} />
    </div>
  )
}

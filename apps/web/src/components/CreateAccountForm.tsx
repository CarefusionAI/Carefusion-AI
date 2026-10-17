import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { apiFetch, apiJson } from '../lib/api'
import { Alert, Field, Input, Spinner, Success, UUID, btnGhost, btnPrimary, inputCls } from './RegisterKit'

// Account-creation forms for admins (docs/09). Synthetic demo data only.

interface Option {
  id: number | string
  name: string
}

interface CreateResult {
  success?: boolean
  userId?: string
  status?: string
  errorMessage?: string
  message?: string
}

// POST JSON; returns the parsed body or an error message (works for 4xx/5xx too).
async function createAccount(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data: CreateResult = await res.json().catch(() => ({}))
    if (!res.ok || data.success === false) {
      return { ok: false, error: data.errorMessage ?? data.message ?? `Request failed (${res.status})` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Request failed' }
  }
}

// Loads a dropdown list once; shows an error string if the call fails.
function useOptions(path: string): { options: Option[]; loadError: string | null } {
  const [options, setOptions] = useState<Option[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    apiJson<Option[]>(path)
      .then((data) => {
        if (!cancelled) setOptions(data)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load options')
      })
    return () => {
      cancelled = true
    }
  }, [path])
  return { options, loadError }
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

// Collapsible card + submit handling shared by the three forms.
function FormShell({
  title,
  successText,
  validate,
  send,
  onReset,
  children,
}: {
  title: string
  successText: string
  validate: () => string | null
  send: () => Promise<{ ok: boolean; error?: string }>
  onReset: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSuccess(null)
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    const result = await send()
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'Request failed')
      return
    }
    onReset()
    setSuccess(successText)
  }

  function cancel() {
    onReset()
    setError(null)
    setOpen(false)
  }

  return (
    <section className="rounded-lg border border-primary-100 bg-white shadow-sm" aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-base font-semibold text-primary"
      >
        {title}
        <span aria-hidden="true" className="text-primary-400">
          {open ? '−' : '+'}
        </span>
      </button>
      {success && !open && (
        <div className="px-4 pb-4">
          <Success>{success}</Success>
        </div>
      )}
      {open && (
        <form onSubmit={(e) => void submit(e)} className="space-y-4 border-t border-primary-100 p-4" noValidate>
          {success && <Success>{success}</Success>}
          {error && <Alert>{error}</Alert>}
          {children}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btnPrimary} disabled={busy}>
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Creating...
                </span>
              ) : (
                'Create account'
              )}
            </button>
            <button type="button" className={btnGhost} disabled={busy} onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

const personIdProps = {
  label: 'Person ID',
  hint: 'UUID of the registered person (synthetic demo data).',
  placeholder: '00000000-0000-0000-0000-000000000000',
  autoComplete: 'off',
} as const

function checkPersonId(personId: string): string | null {
  return UUID.test(personId.trim()) ? null : 'Enter a valid Person ID (UUID).'
}

// ---------------------------------------------------------------------------
// Admin creating a lower-level admin: central -> zonal, zonal -> state, state -> district.

const ADMIN_LEVELS = {
  central: { target: 'zonal', title: 'Create Zonal Admin', areaLabel: 'Zone', areaKey: 'zoneId', numeric: true, optionsPath: '/v1/admin/zones' },
  zonal: { target: 'state', title: 'Create State Admin', areaLabel: 'State', areaKey: 'stateId', numeric: true, optionsPath: '/v1/admin/states' },
  state: { target: 'district', title: 'Create District Admin', areaLabel: 'District', areaKey: 'districtId', numeric: false, optionsPath: '/v1/register/districts' },
} as const

export function CreateAdminForm({ creatorLevel }: { creatorLevel: string }) {
  const cfg = ADMIN_LEVELS[creatorLevel as keyof typeof ADMIN_LEVELS]
  const { options, loadError } = useOptions(cfg?.optionsPath ?? '/v1/admin/zones')
  const [personId, setPersonId] = useState('')
  const [areaId, setAreaId] = useState('')

  if (!cfg) return null

  const reset = () => {
    setPersonId('')
    setAreaId('')
  }

  return (
    <FormShell
      title={cfg.title}
      successText="Admin account created — status: Pending"
      onReset={reset}
      validate={() => checkPersonId(personId) ?? (areaId ? null : `Select a ${cfg.areaLabel.toLowerCase()}.`)}
      send={() =>
        createAccount('/v1/admin/create-admin', {
          personId: personId.trim(),
          targetLevel: cfg.target,
          [cfg.areaKey]: cfg.numeric ? Number(areaId) : areaId, // zones/states are numeric, districts are UUIDs
        })
      }
    >
      {loadError && <Alert>{loadError}</Alert>}
      <Input {...personIdProps} value={personId} onChange={(e) => setPersonId(e.target.value)} />
      <Select
        label={cfg.areaLabel}
        value={areaId}
        onChange={setAreaId}
        placeholder={`Select ${cfg.areaLabel.toLowerCase()}`}
        options={options.map((o) => ({ value: String(o.id), label: o.name }))}
      />
    </FormShell>
  )
}

// ---------------------------------------------------------------------------
// Hospital admin creating nurse / lab / radiology staff.

const STAFF_ROLES = [
  { value: 'nurse', label: 'Nurse' },
  { value: 'lab', label: 'Lab technician' },
  { value: 'radiology', label: 'Radiology technician' },
]

export function CreateStaffForm() {
  const { options, loadError } = useOptions('/v1/register/hospitals')
  const [personId, setPersonId] = useState('')
  const [staffRole, setStaffRole] = useState('')
  const [hospitalId, setHospitalId] = useState('')

  const reset = () => {
    setPersonId('')
    setStaffRole('')
    setHospitalId('')
  }

  return (
    <FormShell
      title="Create Staff Account"
      successText="Staff account created — active immediately"
      onReset={reset}
      validate={() =>
        checkPersonId(personId) ?? (staffRole ? null : 'Select a staff role.') ?? (hospitalId ? null : 'Select a hospital.')
      }
      send={() =>
        createAccount('/v1/admin/create-staff', {
          personId: personId.trim(),
          staffRole,
          hospitalId,
        })
      }
    >
      {loadError && <Alert>{loadError}</Alert>}
      <Input {...personIdProps} value={personId} onChange={(e) => setPersonId(e.target.value)} />
      <Select label="Staff role" value={staffRole} onChange={setStaffRole} placeholder="Select role" options={STAFF_ROLES} />
      <Select
        label="Hospital"
        value={hospitalId}
        onChange={setHospitalId}
        placeholder="Select hospital"
        options={options.map((o) => ({ value: String(o.id), label: o.name }))}
      />
    </FormShell>
  )
}

// ---------------------------------------------------------------------------
// Pharmacy admin creating a pharmacist.

export function CreatePharmacistForm() {
  const { options, loadError } = useOptions('/v1/register/pharmacies')
  const [personId, setPersonId] = useState('')
  const [pharmacyId, setPharmacyId] = useState('')
  const [registrationNo, setRegistrationNo] = useState('')

  const reset = () => {
    setPersonId('')
    setPharmacyId('')
    setRegistrationNo('')
  }

  return (
    <FormShell
      title="Create Pharmacist Account"
      successText="Pharmacist account created — active immediately"
      onReset={reset}
      validate={() =>
        checkPersonId(personId) ??
        (pharmacyId ? null : 'Select a pharmacy.') ??
        (registrationNo.trim() ? null : 'Enter the registration number.')
      }
      send={() =>
        createAccount('/v1/admin/create-pharmacist', {
          personId: personId.trim(),
          pharmacyId,
          registrationNo: registrationNo.trim(),
        })
      }
    >
      {loadError && <Alert>{loadError}</Alert>}
      <Input {...personIdProps} value={personId} onChange={(e) => setPersonId(e.target.value)} />
      <Select
        label="Pharmacy"
        value={pharmacyId}
        onChange={setPharmacyId}
        placeholder="Select pharmacy"
        options={options.map((o) => ({ value: String(o.id), label: o.name }))}
      />
      <Input
        label="Registration number"
        placeholder="e.g. DEMO-PH-0001"
        value={registrationNo}
        onChange={(e) => setRegistrationNo(e.target.value)}
      />
    </FormShell>
  )
}

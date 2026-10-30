import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson } from '../lib/api'
import {
  Alert, Field, Input, Notice, RegisterShell, Spinner, StepIndicator, Success, UUID,
  btnGhost, btnPrimary, inputCls, post,
} from '../components/RegisterKit'

// Doctor self-registration wizard (docs/02, docs/08). HPR check is a mock connector.

interface Hpr {
  name: string
  council: string
  regNumber: string
  specialisation: string
}
interface Hospital {
  id: string
  hfr_id: string
  name: string
  ownership: string
  hospital_type: string
  district_id: string
}
interface Degree {
  degree: string
  year: string
}
interface Form {
  personId: string
  hprId: string
  hospitalId: string
  hospitalName: string
  employmentType: 'government' | 'private'
  specialisation: string
  department: string
  degrees: Degree[]
}

const STEPS = ['Person', 'HPR check', 'Hospital', 'Confirm']

// ---- Step 1: person ID ----
const PersonStep = ({ form, set }: { form: Form; set: (p: Partial<Form>) => void }) => (
  <div className="space-y-4">
    <Notice>You must first be registered as a citizen. Enter your Person ID from your citizen registration.</Notice>
    <Input
      label="Person ID (UUID)"
      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      autoComplete="off"
      value={form.personId}
      onChange={(e) => set({ personId: e.target.value.trim() })}
      hint={form.personId && !UUID.test(form.personId) ? 'This does not look like a valid Person ID.' : undefined}
    />
  </div>
)

// ---- Step 2: HPR verification (mock) ----
function HprStep({ form, set, hpr, onVerified }: { form: Form; set: (p: Partial<Form>) => void; hpr: Hpr | null; onVerified: (h: Hpr | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function verify() {
    setBusy(true)
    setError('')
    try {
      const r = await post<{ success: boolean; verified?: boolean; name?: string; council?: string; regNumber?: string; specialisation?: string }>(
        '/v1/register/doctor/verify-hpr',
        { hprId: form.hprId.trim() },
      )
      if (r.success && r.verified) {
        const h = { name: r.name ?? '', council: r.council ?? '', regNumber: r.regNumber ?? '', specialisation: r.specialisation ?? '' }
        onVerified(h)
        if (!form.specialisation) set({ specialisation: h.specialisation })
      } else {
        onVerified(null)
        setError(r.errorMessage ?? r.message ?? 'HPR ID could not be verified.')
      }
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <Notice>Healthcare Professionals Registry check (mock connector, demo only).</Notice>
      <Input
        label="HPR ID"
        hint="DEMO-HPR-71-xxxx for the demo"
        placeholder="DEMO-HPR-71-0001"
        autoComplete="off"
        value={form.hprId}
        onChange={(e) => { set({ hprId: e.target.value }); if (hpr) onVerified(null) }}
      />
      <button type="button" className={btnPrimary} disabled={busy || !form.hprId.trim()} onClick={verify}>
        {busy ? <Spinner /> : 'Verify HPR'}
      </button>
      {hpr && (
        <div className="space-y-2 rounded-md border border-green-300 bg-green-50 p-3">
          <p className="text-sm font-semibold text-green-800">HPR verified</p>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-primary-500">Name</dt><dd>{hpr.name}</dd>
            <dt className="text-primary-500">Council</dt><dd>{hpr.council}</dd>
            <dt className="text-primary-500">Registration no.</dt><dd>{hpr.regNumber}</dd>
            <dt className="text-primary-500">Specialisation</dt><dd>{hpr.specialisation || 'Not listed'}</dd>
          </dl>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

// ---- Step 3: hospital and employment ----
function EmploymentStep({ form, set }: { form: Form; set: (p: Partial<Form>) => void }) {
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiJson<Hospital[]>('/v1/register/hospitals')
      .then(setHospitals)
      .catch(() => setError('Could not load hospitals.'))
      .finally(() => setLoading(false))
  }, [])

  const setDegree = (i: number, p: Partial<Degree>) =>
    set({ degrees: form.degrees.map((d, j) => (j === i ? { ...d, ...p } : d)) })

  return (
    <div className="space-y-4">
      <Field label="Hospital">
        {(id) => (
          <select id={id} className={inputCls} value={form.hospitalId} disabled={loading} onChange={(e) => set({ hospitalId: e.target.value, hospitalName: hospitals.find((h) => h.id === e.target.value)?.name ?? '' })}>
            <option value="">{loading ? 'Loading...' : 'Select hospital'}</option>
            {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.hfr_id})</option>)}
          </select>
        )}
      </Field>
      <Field label="Employment type">
        {(id) => (
          <select id={id} className={inputCls} value={form.employmentType} onChange={(e) => set({ employmentType: e.target.value as Form['employmentType'] })}>
            <option value="government">Government</option>
            <option value="private">Private</option>
          </select>
        )}
      </Field>
      <Input label="Specialisation (optional)" hint="Pre-filled from HPR if available" value={form.specialisation} onChange={(e) => set({ specialisation: e.target.value })} />
      <Input label="Department (optional)" hint="Shown in the summary only for now; the department list is not available in the alpha." value={form.department} onChange={(e) => set({ department: e.target.value })} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-primary-800">Degrees (optional; both degree and 4-digit year needed)</legend>
        {form.degrees.map((d, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1"><Input label="Degree" placeholder="MBBS" value={d.degree} onChange={(e) => setDegree(i, { degree: e.target.value })} /></div>
            <div className="w-24"><Input label="Year" inputMode="numeric" maxLength={4} placeholder="2015" value={d.year} onChange={(e) => setDegree(i, { year: e.target.value.replace(/\D/g, '') })} /></div>
            <button type="button" className={btnGhost} aria-label={`Remove degree ${i + 1}`} onClick={() => set({ degrees: form.degrees.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <button type="button" className={btnGhost} onClick={() => set({ degrees: [...form.degrees, { degree: '', year: '' }] })}>Add degree</button>
      </fieldset>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

// ---- Step 4: confirmation ----
function ConfirmStep({ form, hpr, error }: { form: Form; hpr: Hpr | null; error: string }) {
  const degrees = form.degrees.filter((d) => d.degree.trim() && d.year.length === 4)
  const rows: [string, string][] = [
    ['Person ID', form.personId],
    ['HPR ID', form.hprId],
    ['Name (HPR)', hpr?.name ?? '-'],
    ['Council', hpr ? `${hpr.council} (${hpr.regNumber})` : '-'],
    ['Hospital', form.hospitalName || form.hospitalId],
    ['Employment', form.employmentType === 'government' ? 'Government' : 'Private'],
    ['Specialisation', form.specialisation || 'Not provided'],
    ['Department', form.department || 'Not provided'],
    ['Degrees', degrees.length ? degrees.map((d) => (d.year ? `${d.degree} (${d.year})` : d.degree)).join(', ') : 'None'],
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-primary-800">Please check your details. This creates a synthetic demo registration only.</p>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-primary-500">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

export default function RegisterDoctorPage() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>({
    personId: '', hprId: '', hospitalId: '', hospitalName: '', employmentType: 'government', specialisation: '', department: '', degrees: [],
  })
  const [hpr, setHpr] = useState<Hpr | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }))
  const canNext = [UUID.test(form.personId), !!hpr, !!form.hospitalId][step] ?? false

  async function register() {
    setBusy(true)
    setError('')
    const body = {
      personId: form.personId,
      hprId: form.hprId.trim(),
      hospitalId: form.hospitalId,
      councilName: hpr?.council ?? '',
      councilRegNo: hpr?.regNumber ?? '',
      employmentType: form.employmentType === 'government' ? 'govt' : 'private',
      ...(form.specialisation ? { specialisation: form.specialisation.trim() } : {}),
      // The API takes a department UUID; the free-text department is not sent until a department list exists.
      degrees: form.degrees
        .filter((d) => d.degree.trim() && d.year.length === 4)
        .map((d) => ({ degree: d.degree.trim(), year: Number(d.year) })),
    }
    try {
      const r = await post<{ success?: boolean }>('/v1/register/doctor', body)
      if (r.success) setDone(true)
      else setError(r.errorMessage ?? r.message ?? 'Registration failed.')
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  return (
    <RegisterShell title="Register as a doctor" subtitle={done ? 'All done' : `Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
      {!done && <StepIndicator steps={STEPS} step={step} />}
      {done ? (
        <div className="space-y-4">
          <Success>Registration submitted &mdash; status: Pending. Your account will be reviewed by the district admin, then the state admin.</Success>
          <Link to="/login" className={`${btnPrimary} inline-block`}>Go to login</Link>
        </div>
      ) : (
        <>
          {step === 0 && <PersonStep form={form} set={set} />}
          {step === 1 && <HprStep form={form} set={set} hpr={hpr} onVerified={setHpr} />}
          {step === 2 && <EmploymentStep form={form} set={set} />}
          {step === 3 && <ConfirmStep form={form} hpr={hpr} error={error} />}

          <div className="flex items-center justify-between border-t border-primary-100 pt-4">
            {step > 0 ? (
              <button type="button" className={btnGhost} disabled={busy} onClick={() => { setError(''); setStep(step - 1) }}>Back</button>
            ) : (
              <Link to="/login" className="text-sm font-medium text-primary-500 underline">Back to login</Link>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className={btnPrimary} disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
            ) : (
              <button type="button" className={btnPrimary} disabled={busy} onClick={register}>
                {busy ? <Spinner /> : 'Register as Doctor'}
              </button>
            )}
          </div>
        </>
      )}
    </RegisterShell>
  )
}

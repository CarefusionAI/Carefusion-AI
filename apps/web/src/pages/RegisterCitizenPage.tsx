import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, apiJson } from '../lib/api'

// Citizen registration wizard (docs/02, docs/07). All government services are mock connectors.

type Sex = 'female' | 'male' | 'other'
interface Ekyc {
  token: string
  name: string
  dob: string
  sex: Sex
  address: string
  photoBase64: string
}
interface Result {
  personId?: string
  abhaNumber?: string
  status?: string
}
interface Form {
  privacy: boolean
  location: boolean
  research: boolean
  phone: string
  email: string
  password: string
  confirm: string
  language: 'en' | 'ml' | 'hi'
  bloodGroup: string
  district: string
  guardian: string
}

const STEPS = ['Consent', 'Aadhaar', 'Face check', 'Profile', 'Confirm']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']
const LANGUAGES = { en: 'English', ml: 'Malayalam', hi: 'Hindi' } as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// 1x1 transparent PNG used as the simulated selfie.
const MOCK_SELFIE =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// POST JSON and return the parsed body even on 4xx/5xx (the API sends { message } or errorMessage).
async function post<T>(path: string, body: unknown): Promise<T & { message?: string }> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && !data.errorMessage && !data.message) data.errorMessage = `Request failed (${res.status})`
  return data
}

function ageFrom(dob: string): number {
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return 99
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age -= 1
  return age
}

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0
  if (pw.length >= 12) score += 1
  if (pw.length >= 16) score += 1
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1
  if (/\d/.test(pw)) score += 1
  if (/[^A-Za-z0-9]/.test(pw)) score += 1
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong']
  return { score, label: labels[score] ?? '' }
}

const btnPrimary =
  'rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50'
const btnGhost =
  'rounded-md border border-primary-200 bg-white px-4 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 disabled:opacity-50'
const inputCls =
  'mt-1 block w-full rounded-md border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 placeholder:text-primary-300 focus:border-primary focus:outline-none'

const Spinner = () => (
  <span
    role="status"
    aria-label="Loading"
    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
  />
)

const Alert = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
    {children}
  </p>
)

const Notice = ({ children }: { children: ReactNode }) => (
  <p role="status" className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-600">
    {children}
  </p>
)

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-primary-800">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-primary-500">{hint}</p>}
    </div>
  )
}

const Input = ({ label, hint, ...rest }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <Field label={label} hint={hint}>
    {(id) => <input id={id} className={inputCls} {...rest} />}
  </Field>
)

const Check = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="flex items-start gap-2 text-sm text-primary-900">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
    <span>{children}</span>
  </label>
)

function StepIndicator({ step }: { step: number }) {
  return (
    <ol aria-label="Registration progress" className="flex items-center">
      {STEPS.map((name, i) => {
        const done = i < step
        const active = i === step
        return (
          <li key={name} className="flex flex-1 items-center last:flex-none" aria-current={active ? 'step' : undefined}>
            <span
              title={name}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                done
                  ? 'border-primary bg-primary text-white'
                  : active
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-primary-200 bg-white text-primary-300'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            {i < STEPS.length - 1 && <span className={`mx-1 h-0.5 flex-1 ${done ? 'bg-primary' : 'bg-primary-100'}`} />}
          </li>
        )
      })}
    </ol>
  )
}

// ---- Step 1: privacy notice and consent ----
const ConsentStep = ({ form, set }: { form: Form; set: (p: Partial<Form>) => void }) => (
  <div className="space-y-4">
    <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-primary-100 bg-primary-50 p-3 text-sm text-primary-900">
      <p className="font-semibold">Privacy notice (summary, demo text)</p>
      <p>CareFusion AI collects and processes your health data to provide medical services.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Data collection: identity, contact details, health profile and records you create.</li>
        <li>Purpose limitation: used only for care, verification and service delivery.</li>
        <li>Storage: kept securely; your Aadhaar number is never stored, only a token.</li>
        <li>Your rights: access, correct, erase your data and withdraw consent at any time.</li>
        <li>Location logging: optional, used to verify that services were delivered.</li>
        <li>AI research: optional, anonymized data may help improve decision-support models.</li>
      </ul>
    </div>
    <Check checked={form.privacy} onChange={(v) => set({ privacy: v })}>
      I accept the privacy notice <span className="text-red-600">(required)</span>
    </Check>
    <Check checked={form.location} onChange={(v) => set({ location: v })}>
      I consent to location logging for service verification (optional)
    </Check>
    <Check checked={form.research} onChange={(v) => set({ research: v })}>
      I opt into anonymized AI research data sharing (optional)
    </Check>
  </div>
)

// ---- Step 2: Aadhaar OTP and e-KYC ----
function AadhaarStep({ ekyc, onVerified, onReset }: { ekyc: Ekyc | null; onVerified: (e: Ekyc) => void; onReset: () => void }) {
  const [aadhaar, setAadhaar] = useState('')
  const [otp, setOtp] = useState('')
  const [txnId, setTxnId] = useState('')
  const [confirmed, setConfirmed] = useState(!!ekyc)
  const [kyc, setKyc] = useState<Ekyc | null>(ekyc)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function sendOtp() {
    setBusy(true)
    setError('')
    try {
      const r = await post<{ success: boolean; txnId?: string; errorMessage?: string }>('/v1/register/citizen/init-aadhaar-otp', { aadhaarNumber: aadhaar })
      if (r.success && r.txnId) setTxnId(r.txnId)
      else setError(r.errorMessage ?? r.message ?? 'Could not send the OTP.')
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  async function verify() {
    setBusy(true)
    setError('')
    try {
      const r = await post<{ success: boolean; token?: string; name?: string; dob?: string; sex?: Sex; address?: string; photoBase64?: string; errorMessage?: string }>(
        '/v1/register/citizen/verify-aadhaar',
        { aadhaarNumber: aadhaar, otp, txnId },
      )
      if (r.success && r.token && r.name && r.dob && r.sex) {
        setKyc({ token: r.token, name: r.name, dob: r.dob, sex: r.sex, address: r.address ?? '', photoBase64: r.photoBase64 ?? '' })
        // The raw number is not needed any more: only the token is kept.
        setAadhaar('')
        setOtp('')
      } else setError(r.errorMessage ?? r.message ?? 'Verification failed.')
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  function tryAgain() {
    setKyc(null)
    setTxnId('')
    setConfirmed(false)
    onReset()
  }

  return (
    <div className="space-y-4">
      <Notice>Your Aadhaar number is not stored. Only a verification token is kept. (Mock connector, demo only.)</Notice>
      {!kyc ? (
        <>
          <Input
            label="Aadhaar number (12 digits)"
            inputMode="numeric"
            maxLength={12}
            placeholder="12-digit demo number"
            autoComplete="off"
            value={aadhaar}
            disabled={!!txnId}
            onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ''))}
          />
          {!txnId ? (
            <button type="button" className={btnPrimary} disabled={busy || aadhaar.length !== 12} onClick={sendOtp}>
              {busy ? <Spinner /> : 'Send OTP'}
            </button>
          ) : (
            <>
              <p role="status" className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-800">OTP sent to the phone linked with this Aadhaar (simulated).</p>
              <Input
                label="6-digit OTP"
                hint="Demo OTP: 123456"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              />
              <button type="button" className={btnPrimary} disabled={busy || otp.length !== 6} onClick={verify}>
                {busy ? <Spinner /> : 'Verify'}
              </button>
            </>
          )}
        </>
      ) : (
        <div className="space-y-3 rounded-md border border-primary-200 p-4">
          <p className="font-semibold text-primary-900">Is this information correct?</p>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
            <dt className="text-primary-500">Name</dt><dd>{kyc.name}</dd>
            <dt className="text-primary-500">Date of birth</dt><dd>{kyc.dob}</dd>
            <dt className="text-primary-500">Sex</dt><dd className="capitalize">{kyc.sex}</dd>
            <dt className="text-primary-500">Address</dt><dd>{kyc.address || 'Not provided'}</dd>
          </dl>
          {confirmed ? (
            <Notice>Details confirmed. Use Next to continue.</Notice>
          ) : (
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} onClick={() => { setConfirmed(true); onVerified(kyc) }}>Yes, continue</button>
              <button type="button" className={btnGhost} onClick={tryAgain}>No, try again</button>
            </div>
          )}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

// ---- Step 3: face verification (simulated capture) ----
function FaceStep({ ekyc, confidence, onPassed }: { ekyc: Ekyc; confidence: number | null; onPassed: (c: number) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function capture() {
    setBusy(true)
    setError('')
    try {
      const r = await post<{ success: boolean; match?: boolean; confidence?: number; errorMessage?: string }>('/v1/register/citizen/verify-face', {
        aadhaarToken: ekyc.token,
        selfieBase64: MOCK_SELFIE,
      })
      if (r.success && r.match) onPassed(r.confidence ?? 0)
      else setError(r.errorMessage ?? r.message ?? 'Face did not match. Please try again.')
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {ekyc.photoBase64 ? (
          <img src={`data:image/png;base64,${ekyc.photoBase64}`} alt="e-KYC photo (placeholder)" className="h-20 w-20 rounded border border-primary-200 bg-primary-50 object-cover" />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded border border-primary-200 bg-primary-50 text-xs text-primary-500">No photo</span>
        )}
        <p className="text-sm text-primary-800">Photo from e-KYC (placeholder image in the demo). A live selfie is compared with it.</p>
      </div>
      <Notice>Webcam capture is not used in the alpha. The button below sends a simulated selfie to the mock face check.</Notice>
      {confidence === null ? (
        <button type="button" className={btnPrimary} disabled={busy} onClick={capture}>
          {busy ? <Spinner /> : 'Simulate face capture'}
        </button>
      ) : (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
          Face verified &mdash; match confidence: {confidence.toFixed(1)}%
        </p>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

// ---- Step 4: health profile ----
function ProfileStep({ form, set, minor }: { form: Form; set: (p: Partial<Form>) => void; minor: boolean }) {
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const strength = passwordStrength(form.password)

  useEffect(() => {
    apiJson<{ id: string; name: string }[]>('/v1/register/districts')
      .then(setDistricts)
      .catch(() => setError('Could not load districts. You can continue without choosing one.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <Input label="Phone number (required)" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
      <Input label="Email (optional)" type="email" autoComplete="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
      <div>
        <Input label="Password (min 12 characters)" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set({ password: e.target.value })} />
        {form.password && (
          <div className="mt-2" aria-live="polite">
            <div className="h-1.5 w-full rounded bg-primary-100">
              <div className={`h-1.5 rounded ${strength.score < 3 ? 'bg-red-500' : strength.score < 4 ? 'bg-accent' : 'bg-green-600'}`} style={{ width: `${(strength.score / 5) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-primary-500">Strength: {strength.label}</p>
          </div>
        )}
      </div>
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={form.confirm}
        onChange={(e) => set({ confirm: e.target.value })}
        hint={form.confirm && form.confirm !== form.password ? 'Passwords do not match.' : undefined}
      />
      <Field label="Preferred language">
        {(id) => (
          <select id={id} className={inputCls} value={form.language} onChange={(e) => set({ language: e.target.value as Form['language'] })}>
            {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </Field>
      <Field label="Blood group">
        {(id) => (
          <select id={id} className={inputCls} value={form.bloodGroup} onChange={(e) => set({ bloodGroup: e.target.value })}>
            {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b === 'unknown' ? 'Unknown' : b}</option>)}
          </select>
        )}
      </Field>
      <Field label="District">
        {(id) => (
          <select id={id} className={inputCls} value={form.district} disabled={loading} onChange={(e) => set({ district: e.target.value })}>
            <option value="">{loading ? 'Loading...' : 'Select district'}</option>
            {districts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        )}
      </Field>
      {error && <Alert>{error}</Alert>}
      {minor && (
        <div className="space-y-2 rounded-md border border-accent-200 bg-accent-50 p-3">
          <p className="text-sm font-semibold text-accent-600">Guardian</p>
          <p className="text-sm text-primary-900">As you are under 18, a registered guardian must approve your account.</p>
          <Input
            label="Guardian's person ID (demo placeholder)"
            hint="Guardian's registered phone lookup is not available in the alpha. Enter the guardian's person ID (UUID)."
            value={form.guardian}
            onChange={(e) => set({ guardian: e.target.value.trim() })}
          />
        </div>
      )}
    </div>
  )
}

// ---- Step 5: confirmation ----
function ConfirmStep({ ekyc, form, error }: { ekyc: Ekyc; form: Form; error: string }) {
  const yn = (v: boolean) => (v ? 'Yes' : 'No')
  const rows: [string, string][] = [
    ['Name (e-KYC)', ekyc.name],
    ['Date of birth', ekyc.dob],
    ['Sex', ekyc.sex],
    ['Phone', form.phone],
    ['Email', form.email || 'Not provided'],
    ['Language', LANGUAGES[form.language]],
    ['Blood group', form.bloodGroup === 'unknown' ? 'Unknown' : form.bloodGroup],
    ['District', form.district || 'Not selected'],
    ['Privacy notice accepted', yn(form.privacy)],
    ['Location logging', yn(form.location)],
    ['AI research opt-in', yn(form.research)],
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-primary-800">Please check your details. This creates a synthetic demo account only.</p>
      <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-primary-500">{k}</dt>
            <dd className="break-words capitalize">{v}</dd>
          </div>
        ))}
      </dl>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

function SuccessCard({ result }: { result: Result }) {
  return (
    <div className="space-y-4">
      <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
        Registration complete (synthetic demo account).
      </p>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
        <dt className="text-primary-500">Person ID</dt><dd className="break-all">{result.personId ?? '-'}</dd>
        <dt className="text-primary-500">ABHA number</dt><dd>{result.abhaNumber ?? '-'}</dd>
        <dt className="text-primary-500">Status</dt><dd className="capitalize">{result.status ?? '-'}</dd>
      </dl>
      {result.status === 'pending' && <Notice>Your account is waiting for guardian approval.</Notice>}
      <Link to="/login" className={`${btnPrimary} inline-block`}>Go to login</Link>
    </div>
  )
}

export default function RegisterCitizenPage() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>({
    privacy: false, location: false, research: false, phone: '', email: '', password: '',
    confirm: '', language: 'en', bloodGroup: 'unknown', district: '', guardian: '',
  })
  const [ekyc, setEkyc] = useState<Ekyc | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }))
  const minor = ekyc ? ageFrom(ekyc.dob) < 18 : false
  const phoneOk = form.phone.replace(/\D/g, '').length >= 10
  const emailOk = !form.email || /^\S+@\S+\.\S+$/.test(form.email)
  const profileOk =
    phoneOk && emailOk && form.password.length >= 12 && form.password === form.confirm && (!minor || UUID.test(form.guardian))
  const canNext = [form.privacy, !!ekyc, confidence !== null, profileOk][step] ?? false

  async function register() {
    if (!ekyc) return
    setBusy(true)
    setError('')
    const body = {
      fullName: ekyc.name,
      dateOfBirth: ekyc.dob,
      sex: ekyc.sex,
      phone: form.phone.trim(),
      ...(form.email ? { email: form.email.trim() } : {}),
      password: form.password,
      aadhaarToken: ekyc.token,
      kycVerified: true,
      faceCheckPassed: true,
      preferredLanguage: form.language,
      bloodGroup: form.bloodGroup,
      ...(minor ? { guardianPersonId: form.guardian } : {}),
      privacyNoticeAccepted: true,
      locationLoggingAccepted: form.location,
      aiResearchOptIn: form.research,
      ...(form.district ? { districtName: form.district } : {}),
    }
    try {
      const r = await post<{ success: boolean } & Result & { errorMessage?: string }>('/v1/register/citizen', body)
      if (r.success) {
        setResult(r)
        set({ password: '', confirm: '' })
      } else setError(r.errorMessage ?? r.message ?? 'Registration failed.')
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-lg border border-primary-200 bg-white shadow-sm">
        <div className="rounded-t-lg border-b-4 border-accent bg-primary px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded bg-accent text-sm font-bold text-accent-foreground">CF</span>
            <div>
              <p className="text-lg font-bold leading-tight">CareFusion AI</p>
              <p className="text-xs text-primary-100">Unified Medical Affairs Platform</p>
            </div>
          </div>
          <h1 className="mt-4 text-xl font-bold">Create a new user</h1>
          <p className="mt-1 text-sm text-primary-100">
            {result ? 'All done' : `Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`} &middot; synthetic demo data only
          </p>
        </div>
        <div className="space-y-5 p-6">
          {!result && <StepIndicator step={step} />}
          {result ? (
            <SuccessCard result={result} />
          ) : (
            <>
              {step === 0 && <ConsentStep form={form} set={set} />}
              {step === 1 && (
                <AadhaarStep ekyc={ekyc} onVerified={(e) => { setEkyc(e); setStep(2) }} onReset={() => { setEkyc(null); setConfidence(null) }} />
              )}
              {step === 2 && ekyc && <FaceStep ekyc={ekyc} confidence={confidence} onPassed={setConfidence} />}
              {step === 3 && <ProfileStep form={form} set={set} minor={minor} />}
              {step === 4 && ekyc && <ConfirmStep ekyc={ekyc} form={form} error={error} />}

              <div className="flex items-center justify-between border-t border-primary-100 pt-4">
                {step > 0 ? (
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => { setError(''); setStep(step - 1) }}>Back</button>
                ) : (
                  <Link to="/login" className="text-sm font-medium text-primary-500 underline">Back to login</Link>
                )}
                {step < STEPS.length - 1 ? (
                  <button type="button" className={btnPrimary} disabled={!canNext} onClick={() => setStep(step + 1)}>
                    {step === 2 ? 'Continue' : 'Next'}
                  </button>
                ) : (
                  <button type="button" className={btnPrimary} disabled={busy} onClick={register}>
                    {busy ? <Spinner /> : 'Register'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

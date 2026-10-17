import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson } from '../lib/api'
import {
  Alert, Field, Input, Notice, RegisterShell, Spinner, StepIndicator, Success, UUID,
  btnGhost, btnPrimary, inputCls, post,
} from '../components/RegisterKit'

// Pharmacy admin self-registration (docs/02 section F, docs/09). Documents are skipped in the demo.

interface Pharmacy {
  id: string
  licence_no: string
  name: string
  pharmacy_type: string
  district_id: string
}

const STEPS = ['Identification', 'Result']

export default function RegisterPharmacyAdminPage() {
  const [step, setStep] = useState(0)
  const [personId, setPersonId] = useState('')
  const [pharmacyId, setPharmacyId] = useState('')
  const [licence, setLicence] = useState('')
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    apiJson<Pharmacy[]>('/v1/register/pharmacies')
      .then(setPharmacies)
      .catch(() => setLoadError('Could not load pharmacies.'))
      .finally(() => setLoading(false))
  }, [])

  async function register() {
    setBusy(true)
    setError('')
    try {
      const r = await post<{ success?: boolean }>('/v1/register/pharmacy-admin', {
        personId,
        pharmacyId,
        drugLicenceNo: licence.trim(),
      })
      if (r.success === false || r.message || r.errorMessage) setError(r.errorMessage ?? r.message ?? 'Registration failed.')
    } catch {
      setError('Could not reach the server.')
    }
    setStep(1)
    setBusy(false)
  }

  return (
    <RegisterShell title="Register as pharmacy admin" subtitle={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
      <StepIndicator steps={STEPS} step={step} />
      {step === 0 ? (
        <>
          <div className="space-y-4">
            <Notice>You must first have a citizen account. Enter your Person ID from your citizen registration.</Notice>
            <Input
              label="Person ID (UUID)"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              value={personId}
              onChange={(e) => setPersonId(e.target.value.trim())}
              hint={personId && !UUID.test(personId) ? 'This does not look like a valid Person ID.' : undefined}
            />
            <Field label="Pharmacy">
              {(id) => (
                <select id={id} className={inputCls} value={pharmacyId} disabled={loading} onChange={(e) => setPharmacyId(e.target.value)}>
                  <option value="">{loading ? 'Loading...' : 'Select pharmacy'}</option>
                  {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.licence_no})</option>)}
                </select>
              )}
            </Field>
            <Input
              label="Drug licence number"
              hint="DEMO-DL-xxxx for the demo"
              placeholder="DEMO-DL-0001"
              autoComplete="off"
              value={licence}
              onChange={(e) => setLicence(e.target.value)}
            />
            <p className="rounded-md bg-primary-50 px-3 py-2 text-xs text-primary-700">
              In the full system, you would upload photo ID, authorisation letter, pharmacy licence, and employee ID. These are skipped in the demo.
            </p>
            {loadError && <Alert>{loadError}</Alert>}
          </div>
          <div className="flex items-center justify-between border-t border-primary-100 pt-4">
            <Link to="/login/admin" className="text-sm font-medium text-primary-500 underline">Back to admin login</Link>
            <button type="button" className={btnPrimary} disabled={busy || !UUID.test(personId) || !pharmacyId || !licence.trim()} onClick={register}>
              {busy ? <Spinner /> : 'Register'}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {error ? (
            <>
              <Alert>{error}</Alert>
              <button type="button" className={btnGhost} onClick={() => { setError(''); setStep(0) }}>Back</button>
            </>
          ) : (
            <Success>Registration submitted &mdash; status: Pending. The district admin will review your application.</Success>
          )}
          <div>
            <Link to="/login/admin" className={`${btnPrimary} inline-block`}>Go to login</Link>
          </div>
        </div>
      )}
    </RegisterShell>
  )
}

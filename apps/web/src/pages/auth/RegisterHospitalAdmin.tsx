import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorText, listHospitals, registerHospitalAdmin } from '../../api/auth'
import type { HospitalRow } from '../../api/auth'
import { useAuth } from '../../context/AuthContext'
import { Alert, Badge, Button, Card, TextField } from '../../components/ui'
import AdminRegisterShell from './AdminRegisterShell'
import { Icon, ICON } from './authKit'

// Hospital admin registration (design: RegisterHospitalAdmin.dc.html).
// Real calls: hospital list (stand-in for the HFR lookup, which has no public endpoint yet) and
// POST /api/v1/register/hospital-admin. Documents and account details are simulated in the alpha.

const STEPS = ['Hospital (HFR)', 'Documents', 'Your account', 'Submitted']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DOCS = ['Photo ID', 'Authorisation letter', 'Hospital licence', 'Employee ID']

export default function RegisterHospitalAdminScreen() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const signedInPerson = user?.role === 'CITIZEN' ? user.personId : undefined

  const [step, setStep] = useState(0)
  const [hospitals, setHospitals] = useState<HospitalRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [hfrId, setHfrId] = useState('')
  const [found, setFound] = useState<HospitalRow | null>(null)
  const [checking, setChecking] = useState(false)
  const [hfrError, setHfrError] = useState('')
  const [files, setFiles] = useState<Record<number, string>>({})

  const [personInput, setPersonInput] = useState('')
  const [manualId, setManualId] = useState(false)
  const personId = signedInPerson && !manualId ? signedInPerson : personInput
  const [fullName, setFullName] = useState('')
  const [designation, setDesignation] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listHospitals()
      .then(setHospitals)
      .catch(() => setLoadError('Could not load the hospital registry. Check that the API is running.'))
  }, [])

  const personOk = UUID.test(personId)
  const blocked = (step === 0 && !found) || (step === 2 && !personOk)

  function checkHfr() {
    setChecking(true)
    setHfrError('')
    setFound(null)
    // The mock HFR is looked up in the demo hospital list. Short delay so the check feels like a lookup.
    window.setTimeout(() => {
      const match = hospitals.find((h) => h.hfr_id.toLowerCase() === hfrId.trim().toLowerCase())
      if (match) setFound(match)
      else setHfrError('HFR ID not found in the demo registry. Demo IDs look like DEMO-HFR-KL-0193.')
      setChecking(false)
    }, 600)
  }

  async function submit() {
    if (!found) return
    setBusy(true)
    setError('')
    try {
      const r = await registerHospitalAdmin({ personId, hospitalId: found.id })
      if (r.success === false || r.message || r.errorMessage) setError(errorText(r, 'Registration failed.'))
      else {
        setPassword('')
        setStep(3)
      }
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  function next() {
    if (step === 2) void submit()
    else setStep((s) => s + 1)
  }

  async function preview() {
    if (await login('HOSPITAL_ADMIN')) navigate('/hospital-admin')
  }

  const h2 = (text: string, lead: string) => (
    <div>
      <h2 className="au-h2" tabIndex={-1} data-step-heading style={{ outline: 'none' }}>{text}</h2>
      <p className="au-lead">{lead}</p>
    </div>
  )

  return (
    <AdminRegisterShell
      title="Register your hospital — CareFusion AI"
      pageTitle="Register your hospital"
      eyebrow="Hospital admin"
      subtitle="We verify the hospital with the Health Facility Registry (HFR). Your district admin approves the account."
      bannerText="HFR and document checks are mock connectors."
      steps={STEPS}
      step={step}
      atLast={step === 3}
      blocked={blocked}
      busy={busy}
      nextLabel={step === 2 ? 'Submit for approval' : 'Continue'}
      onBack={() => setStep((s) => Math.max(0, s - 1))}
      onNext={next}
      aside={
        <>
          <Card tone="peach" eyebrow="You'll need" title="Four documents" titleAs="h2">
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              <li>Your photo ID</li>
              <li>Authorisation letter from the hospital</li>
              <li>Hospital licence</li>
              <li>Your employee ID</li>
            </ul>
          </Card>
          <Card padding="compact" title="Who approves" titleAs="h2">
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-muted)' }}>The district admin for the hospital's district. Every decision is written to the audit log with a reason.</p>
          </Card>
        </>
      }
    >
      {step === 0 && (
        <div className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {h2('Find your hospital', 'Enter the HFR ID on your facility certificate.')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 260px' }}>
              <TextField
                label="HFR ID"
                value={hfrId}
                onChange={(e) => { setHfrId(e.target.value); setFound(null); setHfrError('') }}
                placeholder="DEMO-HFR-KL-0193"
                autoComplete="off"
                required
                helper="Demo IDs look like DEMO-HFR-KL-0193."
              />
            </div>
            <Button variant="soft" onClick={checkHfr} loading={checking} disabled={!hfrId.trim() || !hospitals.length}>Check with HFR</Button>
          </div>
          {loadError ? <Alert tone="danger" title="Registry not loaded">{loadError}</Alert> : null}
          {hfrError ? <Alert tone="danger" title="HFR check failed">{hfrError}</Alert> : null}
          {found ? (
            <div style={{ padding: 22, borderRadius: 18, background: 'var(--tint-sage)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 18, color: 'var(--ink-strong)' }}>{found.name}</strong>
                <Badge tone="success" dot>HFR verified</Badge>
              </div>
              <dl className="au-facts">
                <div><dt>Type</dt><dd>{found.ownership === 'govt' ? 'Government' : 'Private'}</dd></div>
                <div><dt>Category</dt><dd>{found.hospital_type}</dd></div>
                <div><dt>HFR ID</dt><dd>{found.hfr_id}</dd></div>
              </dl>
            </div>
          ) : null}
        </div>
      )}

      {step === 1 && (
        <div className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {h2('Upload documents', 'PDF or photo, up to 10 MB each. The district admin sees these when approving. Files stay in your browser in the alpha.')}
          {DOCS.map((label, i) => {
            const file = files[i]
            return (
              <div key={label} className="au-doc">
                <span className="au-doc-i" aria-hidden="true"><Icon d={ICON.doc} /></span>
                <span style={{ flex: 1, minWidth: 200 }}>
                  <strong style={{ color: 'var(--ink)' }}>{label}</strong>
                  <br />
                  <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{file ?? 'Not uploaded yet'}</span>
                </span>
                <Badge tone={file ? 'info' : 'neutral'} dot>{file ? 'Attached (demo)' : 'Optional in the demo'}</Badge>
                <label className={`cf-btn cf-btn-${file ? 'ghost' : 'soft'} cf-btn-sm`} style={{ cursor: 'pointer' }}>
                  <span className="cf-btn-label">{file ? 'Replace' : 'Upload'}</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="cf-sr"
                    aria-label={`${label} file`}
                    onChange={(e) => {
                      const name = e.target.files?.[0]?.name
                      if (name) setFiles((f) => ({ ...f, [i]: name }))
                    }}
                  />
                </label>
              </div>
            )
          })}
        </div>
      )}

      {step === 2 && (
        <div className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {h2('Your account', "You'll set up two-step verification after approval.")}
          {signedInPerson && !manualId ? (
            <Alert tone="info" title="Linked to your citizen account" action={<Button size="sm" variant="ghost" onClick={() => setManualId(true)}>Use another ID</Button>}>
              Person ID <code style={{ wordBreak: 'break-all' }}>{signedInPerson}</code>
            </Alert>
          ) : (
            <TextField
              label="Person ID (UUID)"
              value={personInput}
              onChange={(e) => setPersonInput(e.target.value.trim())}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              required
              helper="You must first have a citizen account. Use the person ID shown when your citizen registration finished."
              error={personInput && !personOk ? 'This does not look like a valid person ID.' : undefined}
            />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 18 }}>
            <TextField label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            <TextField label="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Medical Superintendent" />
            <TextField label="Official email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <TextField label="Mobile" prefix="+91" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel-national" />
          </div>
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" helper="At least 12 characters. Name, contact and password are not stored in the alpha; your account is linked to your citizen identity." />
          <Alert tone="info" title="Hardware security key recommended">Hospital admins manage staff accounts. A security key protects them if your password is ever leaked.</Alert>
          {error ? <Alert tone="danger" title="We could not submit your application">{error}</Alert> : null}
        </div>
      )}

      {step === 3 && (
        <div className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
          <Badge tone="warning" dot>Pending district approval</Badge>
          <h2 className="au-h2" tabIndex={-1} data-step-heading style={{ outline: 'none', fontFamily: 'var(--font-serif)', fontSize: 34, lineHeight: '40px' }}>Submitted for review</h2>
          <p className="au-lead" style={{ fontSize: 16 }}>
            The district admin for {found?.name ?? 'your hospital'} will check your HFR result and documents. If it isn't reviewed in time, it escalates to the state admin.
          </p>
          <Card tone="blue" eyebrow="What happens next" title="After approval" style={{ alignSelf: 'stretch' }}>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Set a password and two-step verification</li>
              <li>Fill in departments, timings and the map pin used for doctors' geofence</li>
              <li>Create nurse, lab and radiology accounts</li>
            </ul>
          </Card>
          <Button variant="secondary" onClick={preview}>Preview the hospital admin workspace</Button>
        </div>
      )}
    </AdminRegisterShell>
  )
}

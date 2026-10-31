import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorText, listHospitals, listPharmacies, registerPharmacyAdmin } from '../../api/auth'
import type { HospitalRow, PharmacyRow } from '../../api/auth'
import { useAuth } from '../../context/AuthContext'
import { Alert, Badge, Button, Card, Select, Switch, TextField } from '../../components/ui'
import AdminRegisterShell from './AdminRegisterShell'
import { Icon, ICON } from './authKit'

// Pharmacy admin registration (design: RegisterPharmacyAdmin.dc.html).
// Real calls: pharmacy list (stand-in for the drug-licence lookup, which has no public endpoint yet; the
// server re-checks the licence) and POST /api/v1/register/pharmacy-admin. Documents and hours are simulated.

const STEPS = ['Licence', 'Documents & hours', 'Your account', 'Submitted']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAYS = ['None — open daily', 'Sunday', 'Monday']

type Kind = 'govt_hospital' | 'private'

export default function RegisterPharmacyAdminScreen() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const signedInPerson = user?.role === 'CITIZEN' ? user.personId : undefined

  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<Kind>('govt_hospital')
  const [pharmacies, setPharmacies] = useState<PharmacyRow[]>([])
  const [hospitals, setHospitals] = useState<HospitalRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [linkedHospital, setLinkedHospital] = useState('')
  const [licence, setLicence] = useState('')
  const [found, setFound] = useState<PharmacyRow | null>(null)
  const [checking, setChecking] = useState(false)
  const [licError, setLicError] = useState('')

  const [licenceFile, setLicenceFile] = useState('')
  const [idFile, setIdFile] = useState('')
  const [opens, setOpens] = useState('08:00')
  const [closes, setCloses] = useState('20:00')
  const [holiday, setHoliday] = useState(DAYS[0]!)
  const [software, setSoftware] = useState(true)

  const [personInput, setPersonInput] = useState('')
  const [manualId, setManualId] = useState(false)
  const personId = signedInPerson && !manualId ? signedInPerson : personInput
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listPharmacies(), listHospitals()])
      .then(([p, h]) => {
        setPharmacies(p)
        setHospitals(h)
      })
      .catch(() => setLoadError('Could not load the registry. Check that the API is running.'))
  }, [])

  const personOk = UUID.test(personId)
  const blocked = (step === 0 && !found) || (step === 2 && !personOk)

  function checkLicence() {
    setChecking(true)
    setLicError('')
    setFound(null)
    window.setTimeout(() => {
      const wanted = licence.trim().toLowerCase()
      const match = pharmacies.find((p) => p.licence_no.toLowerCase() === wanted)
      if (!match) setLicError('Drug licence not found in the demo registry. Demo licences look like DEMO-DL-KL-2041.')
      else if (match.pharmacy_type !== kind)
        setLicError(`This licence belongs to a ${match.pharmacy_type === 'private' ? 'private pharmacy' : 'government hospital pharmacy'}. Change the pharmacy type above.`)
      else setFound(match)
      setChecking(false)
    }, 600)
  }

  async function submit() {
    if (!found) return
    setBusy(true)
    setError('')
    try {
      const r = await registerPharmacyAdmin({ personId, pharmacyId: found.id, drugLicenceNo: found.licence_no })
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
    if (await login('PHARMACY_ADMIN')) navigate('/pharmacy-admin')
  }

  const h2 = (text: string, lead: string) => (
    <div>
      <h2 className="au-h2" tabIndex={-1} data-step-heading style={{ outline: 'none' }}>{text}</h2>
      <p className="au-lead">{lead}</p>
    </div>
  )

  const fileRow = (label: string, file: string, set: (n: string) => void, iconPath: string) => (
    <div className="au-doc">
      <span className="au-doc-i" aria-hidden="true" style={{ background: 'var(--tint-sage)', color: 'var(--success)' }}><Icon d={iconPath} /></span>
      <span style={{ flex: 1, minWidth: 200 }}>
        <strong style={{ color: 'var(--ink)' }}>{label}</strong>
        <br />
        <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{file || 'Not uploaded yet'}</span>
      </span>
      <Badge tone={file ? 'info' : 'neutral'} dot>{file ? 'Attached (demo)' : 'Optional in the demo'}</Badge>
      <label className={`cf-btn cf-btn-${file ? 'ghost' : 'soft'} cf-btn-sm`} style={{ cursor: 'pointer' }}>
        <span className="cf-btn-label">{file ? 'Replace' : 'Upload'}</span>
        <input type="file" accept="application/pdf,image/*" className="cf-sr" aria-label={`${label} file`} onChange={(e) => { const n = e.target.files?.[0]?.name; if (n) set(n) }} />
      </label>
    </div>
  )

  return (
    <AdminRegisterShell
      title="Register your pharmacy — CareFusion AI"
      pageTitle="Register your pharmacy"
      eyebrow="Pharmacy admin"
      subtitle="Government hospital pharmacies and private pharmacies. Your district admin approves the account."
      bannerText="Drug licence checks are a mock connector for state drug control / CDSCO records."
      steps={STEPS}
      step={step}
      atLast={step === 3}
      blocked={blocked}
      busy={busy}
      nextLabel={step === 2 ? 'Submit for approval' : 'Continue'}
      onBack={() => setStep((s) => Math.max(0, s - 1))}
      onNext={next}
      aside={
        <Card tone="sage" eyebrow="After approval" title="Run your pharmacy here" titleAs="h2">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            <li>Live stock from the national medicine catalogue</li>
            <li>Near-expiry and low-stock alerts</li>
            <li>Controlled-drug register (Schedule H, H1, X)</li>
            <li>Pharmacist accounts and dispensing reports</li>
          </ul>
        </Card>
      }
    >
      {step === 0 && (
        <div className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {h2('What kind of pharmacy?', 'A government hospital pharmacy is linked to its hospital so doctors there can send prescriptions directly.')}
          <div role="radiogroup" aria-label="Pharmacy type" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {([
              ['govt_hospital', 'Government hospital pharmacy', 'Inside a government hospital'],
              ['private', 'Private pharmacy', 'Independent or chain store'],
            ] as const).map(([k, title, sub]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={`au-opt${kind === k ? ' on' : ''}`} onClick={() => { setKind(k); setFound(null); setLicError('') }}>
                <strong style={{ color: 'var(--ink)', fontSize: 16 }}>{title}</strong>
                <span style={{ fontSize: 14 }}>{sub}</span>
              </button>
            ))}
          </div>
          {kind === 'govt_hospital' ? (
            <Select
              label="Linked hospital"
              options={hospitals.map((h) => ({ value: h.id, label: h.name }))}
              value={linkedHospital}
              placeholder="Select hospital"
              onChange={setLinkedHospital}
              helper="Shown for the demo; the link comes from the licence record."
            />
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 260px' }}>
              <TextField
                label="Drug licence number"
                value={licence}
                onChange={(e) => { setLicence(e.target.value); setFound(null); setLicError('') }}
                placeholder="DEMO-DL-KL-2041"
                autoComplete="off"
                required
                helper="Demo licences look like DEMO-DL-KL-2041."
              />
            </div>
            <Button variant="soft" onClick={checkLicence} loading={checking} disabled={!licence.trim() || !pharmacies.length}>Check licence</Button>
          </div>
          {loadError ? <Alert tone="danger" title="Registry not loaded">{loadError}</Alert> : null}
          {licError ? <Alert tone="danger" title="Licence check failed">{licError}</Alert> : null}
          {found ? (
            <Alert tone="success" title="Licence found in the demo registry">
              {found.name} · {found.pharmacy_type === 'private' ? 'Private pharmacy' : 'Government hospital pharmacy'} · {found.licence_no}
            </Alert>
          ) : null}
        </div>
      )}

      {step === 1 && (
        <div className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {h2('Documents and hours', 'Patients see your hours and location in the medicine stock finder. Files stay in your browser in the alpha.')}
          {fileRow('Drug licence copy', licenceFile, setLicenceFile, ICON.doc)}
          {fileRow('Your photo ID', idFile, setIdFile, ICON.idCard)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 16, marginTop: 8 }}>
            <TextField label="Opens" value={opens} onChange={(e) => setOpens(e.target.value)} />
            <TextField label="Closes" value={closes} onChange={(e) => setCloses(e.target.value)} />
            <Select label="Weekly holiday" options={DAYS} value={holiday} onChange={setHoliday} />
          </div>
          <Switch label="We already use billing or stock software" description="We can sync stock automatically from supported software. Spreadsheet uploads aren't used." checked={software} onChange={setSoftware} />
        </div>
      )}

      {step === 2 && (
        <div className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {h2('Your account', "You'll create pharmacist accounts after approval.")}
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
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <TextField label="Mobile" prefix="+91" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel-national" />
            <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" helper="At least 12 characters. Not stored in the alpha." />
          </div>
          {error ? <Alert tone="danger" title="We could not submit your application">{error}</Alert> : null}
        </div>
      )}

      {step === 3 && (
        <div className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
          <Badge tone="warning" dot>Pending district approval</Badge>
          <h2 className="au-h2" tabIndex={-1} data-step-heading style={{ outline: 'none', fontFamily: 'var(--font-serif)', fontSize: 34, lineHeight: '40px' }}>
            Thank you{fullName.trim() ? `, ${fullName.trim().split(' ')[0]}` : ''}.
          </h2>
          <p className="au-lead" style={{ fontSize: 16 }}>Your licence check passed. The district admin will review your documents; overdue reviews escalate to the state.</p>
          <Button variant="secondary" onClick={preview}>Preview the pharmacy workspace</Button>
        </div>
      )}
    </AdminRegisterShell>
  )
}

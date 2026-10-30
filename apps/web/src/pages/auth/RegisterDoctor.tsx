import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, listHospitals, registerDoctor, verifyHpr } from '../../api/auth'
import type { HospitalRow, HprResult } from '../../api/auth'
import { useAuth } from '../../context/AuthContext'
import { Alert, Avatar, Badge, Button, Select, Switch, Tabs, TextField } from '../../components/ui'
import { AuthRoot, Icon, ICON, LinkButton, Logo } from './authKit'

// Doctor registration (design: RegisterDoctor.dc.html).
// Real calls: HPR check (mock connector) and the doctor registration, both under /api/v1/register/doctor.
// Documents, the authenticator and e-Sign are simulated in the alpha: nothing is uploaded or stored.

const STEPS: [string, string][] = [
  ['Citizen account', 'Identity link'],
  ['Registration', 'HPR + council'],
  ['Qualifications', 'Degree certificates'],
  ['Workplace', 'Hospital + proof'],
  ['Security', 'MFA + e-Sign'],
  ['Status', 'Approval chain'],
]
const LAST = STEPS.length - 1
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COUNCILS = ['Travancore-Cochin Medical Council', 'National Medical Commission']
const SPECS = ['General medicine', 'Cardiology', 'Paediatrics', 'Obstetrics and gynaecology', 'Radiology']
const DEPTS = ['General medicine', 'Casualty', 'Cardiology', 'Paediatrics']
const EMP_TABS = [
  { id: 'govt', label: 'Government' },
  { id: 'private', label: 'Private' },
]

interface DegreeRow {
  degree: string
  year: string
  file: string
}

const DocIcon = () => (
  <span className="au-doc-i" aria-hidden="true">
    <Icon d={ICON.docPlain} />
  </span>
)

export default function RegisterDoctorScreen() {
  const { user } = useAuth()
  const signedInPerson = user?.role === 'CITIZEN' ? user.personId : undefined

  const [step, setStep] = useState(0)
  const [manualId, setManualId] = useState(false)
  const [personInput, setPersonInput] = useState('')
  const personId = signedInPerson && !manualId ? signedInPerson : personInput

  const [hprId, setHprId] = useState('')
  const [council, setCouncil] = useState(COUNCILS[0]!)
  const [regNo, setRegNo] = useState('')
  const [hpr, setHpr] = useState<HprResult | null>(null)
  const [hprBusy, setHprBusy] = useState(false)
  const [hprError, setHprError] = useState('')

  const [specialisation, setSpecialisation] = useState(SPECS[0]!)
  const [degrees, setDegrees] = useState<DegreeRow[]>([{ degree: '', year: '', file: '' }])

  const [hospitals, setHospitals] = useState<HospitalRow[]>([])
  const [hospitalsError, setHospitalsError] = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [dept, setDept] = useState(DEPTS[0]!)
  const [emp, setEmp] = useState<'govt' | 'private'>('govt')
  const [proofFile, setProofFile] = useState('')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [signed, setSigned] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState<Date | null>(null)
  const [rejected, setRejected] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    listHospitals()
      .then(setHospitals)
      .catch(() => setHospitalsError('Could not load hospitals. Check that the API is running.'))
  }, [])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus()
  }, [step])

  const councilOptions = COUNCILS.includes(council) ? COUNCILS : [council, ...COUNCILS]
  const personOk = UUID.test(personId)
  const blocked = (step === 0 && !personOk) || (step === 1 && !hpr) || (step === 3 && !hospitalId)

  async function checkHpr() {
    setHprBusy(true)
    setHprError('')
    try {
      const r = await verifyHpr(hprId.trim())
      if (r.ok) {
        setHpr(r.hpr)
        setCouncil(r.hpr.council || council)
        setRegNo(r.hpr.regNumber || regNo)
        if (r.hpr.specialisation && SPECS.includes(r.hpr.specialisation)) setSpecialisation(r.hpr.specialisation)
      } else {
        setHpr(null)
        setHprError(r.error)
      }
    } catch {
      setHpr(null)
      setHprError('Could not reach the server.')
    }
    setHprBusy(false)
  }

  async function submit() {
    // After the demo "Fix documents" loop the application already exists, so do not send it twice.
    if (submitted) {
      setRejected(false)
      setStep(LAST)
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await registerDoctor({
        personId,
        hprId: hprId.trim(),
        hospitalId,
        councilName: council,
        councilRegNo: regNo.trim() || hpr?.regNumber || '',
        employmentType: emp,
        ...(specialisation ? { specialisation } : {}),
        degrees: degrees
          .filter((d) => d.degree.trim() && /^\d{4}$/.test(d.year))
          .map((d) => ({ degree: d.degree.trim(), year: Number(d.year) })),
      })
      if (r.success) {
        setSubmitted(new Date())
        setPassword('')
        setStep(LAST)
      } else setError(errorText(r, 'Registration failed.'))
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  function next() {
    if (step === 4) void submit()
    else setStep((s) => Math.min(LAST, s + 1))
  }

  const setDegree = (i: number, p: Partial<DegreeRow>) => setDegrees((rows) => rows.map((d, j) => (j === i ? { ...d, ...p } : d)))
  const due = submitted ? new Date(submitted.getTime() + 7 * 24 * 3600 * 1000) : null
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const heading = (title: string, lead: string, n: number) => (
    <div>
      <p className="au-lead" style={{ fontSize: 13 }}>Step {n} of {STEPS.length}</p>
      <h2 className="au-h2" tabIndex={-1} data-step-heading style={{ outline: 'none' }}>{title}</h2>
      <p className="au-lead">{lead}</p>
    </div>
  )

  return (
    <AuthRoot title="Register as a doctor — CareFusion AI" bannerText="HPR, e-Sign and document checks are mock connectors." main={false}>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap' }}>
        <aside aria-label="Registration progress" style={{ flex: '1 1 300px', maxWidth: 360, background: 'var(--tint-blue)', padding: '40px 28px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Logo height={32} style={{ padding: '0 12px' }} />
          <div style={{ padding: '0 12px' }}>
            <h1 style={{ margin: '0 0 6px', fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: '36px', fontWeight: 600, color: 'var(--ink-strong)' }}>Register as a doctor</h1>
            <p style={{ margin: 0, fontSize: 14 }}>Checked against HPR, then approved by your district admin and confirmed by the state.</p>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {STEPS.map(([label, desc], i) => (
              <li key={label} className={`au-rail-step ${i < step ? 'is-done' : i === step ? 'is-current' : ''}`} aria-current={i === step ? 'step' : undefined}>
                <span className="au-rail-dot" aria-hidden="true">{i < step ? '✓' : String(i + 1)}</span>
                <span>
                  <strong style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>{label}</strong>
                  <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{desc}</span>
                  <span className="cf-sr">{i < step ? ' (completed)' : i === step ? ' (current step)' : ''}</span>
                </span>
              </li>
            ))}
          </ol>
          <p style={{ margin: 'auto 0 0', padding: '0 12px', fontSize: 13 }}>Your doctor account is separate from your own citizen health record, and can never open it.</p>
        </aside>

        <main id="au-main" ref={mainRef} style={{ position: 'relative', overflow: 'hidden', flex: '999 1 560px', minWidth: 0, background: 'var(--surface-raised)', padding: '48px clamp(24px, 5vw, 72px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <svg className="au-wm au-wm-a" viewBox="0 0 64 64" aria-hidden="true"><rect x="21" y="5" width="18" height="50" rx="9" fill="#5e9e98" /><rect x="9" y="25" width="50" height="18" rx="9" fill="#d2b277" /><rect x="21" y="25" width="18" height="18" rx="2" fill="#3a726d" /></svg>
          <svg className="au-wm au-wm-b" viewBox="0 0 64 64" aria-hidden="true"><rect x="21" y="5" width="18" height="50" rx="9" fill="#86bdb8" /><rect x="9" y="25" width="50" height="18" rx="9" fill="#b7a6d4" /></svg>
          <svg className="au-wm au-wm-c" viewBox="0 0 64 64" aria-hidden="true"><rect x="21" y="5" width="18" height="50" rx="9" fill="#c9a86a" /><rect x="9" y="25" width="50" height="18" rx="9" fill="#86bdb8" /></svg>
          <div style={{ position: 'relative', width: '100%', maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
            {step === 0 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {heading('Link your citizen account', 'Every doctor is first a verified citizen. We link the doctor account to that identity.', 1)}
                {signedInPerson && !manualId ? (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 16, borderRadius: 16, background: 'var(--tint-sage)', flexWrap: 'wrap' }}>
                    <Avatar name="Demo Citizen" size={44} />
                    <span style={{ flex: 1, minWidth: 200 }}>
                      <strong style={{ color: 'var(--ink)' }}>{user?.displayName ?? 'Citizen'}</strong>
                      <br />
                      <span style={{ fontSize: 13 }}>Citizen · person ID <code style={{ wordBreak: 'break-all' }}>{signedInPerson}</code></span>
                    </span>
                    <Badge tone="success" dot>Signed in</Badge>
                  </div>
                ) : (
                  <>
                    <Alert tone="warning" title="Enter your person ID">
                      You must first be registered as a citizen. Enter the person ID shown when you finished your citizen registration.
                    </Alert>
                    <TextField
                      label="Person ID (UUID)"
                      value={personInput}
                      onChange={(e) => setPersonInput(e.target.value.trim())}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      autoComplete="off"
                      required
                      error={personInput && !personOk ? 'This does not look like a valid person ID.' : undefined}
                    />
                  </>
                )}
                {signedInPerson ? (
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setManualId((m) => !m)}>
                      {manualId ? 'Use the signed-in citizen account' : 'Use a different person ID'}
                    </Button>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 14 }}>
                    Not registered yet? <Link to="/register">Create your health account</Link> first.
                  </p>
                )}
                <Alert tone="info" title="How the two accounts work">
                  Use the User / Doctor switch on the login page. Opening a family member's record from the doctor account is allowed but flagged in the log.
                </Alert>
              </section>
            )}

            {step === 1 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {heading('Professional registration', 'We check these automatically with the Health Professional Registry (HPR).', 2)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 18 }}>
                  <TextField
                    label="HPR ID"
                    value={hprId}
                    onChange={(e) => { setHprId(e.target.value); if (hpr) setHpr(null) }}
                    placeholder="DEMO-HPR-71-0001"
                    autoComplete="off"
                    required
                    helper="Demo IDs look like DEMO-HPR-71-0001."
                  />
                  <Select label="Medical council" options={councilOptions.map((c) => ({ value: c, label: `${c} (demo)` }))} value={council} onChange={setCouncil} required />
                  <TextField label="Council registration number" value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="Filled in by the HPR check" autoComplete="off" required />
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button variant="soft" onClick={checkHpr} loading={hprBusy} disabled={!hprId.trim()}>Check with HPR</Button>
                  {hpr ? <Badge tone="success" dot>HPR match · {hpr.name}{hpr.specialisation ? ` · ${hpr.specialisation}` : ''}</Badge> : null}
                </div>
                {hprError ? <Alert tone="danger" title="HPR check failed">{hprError}</Alert> : null}
              </section>
            )}

            {step === 2 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {heading('Qualifications', 'Add each degree with its year. Certificates are attached for the district admin (PDF or photo, up to 10 MB each).', 3)}
                <Select label="Specialisation" options={hpr?.specialisation && !SPECS.includes(hpr.specialisation) ? [hpr.specialisation, ...SPECS] : SPECS} value={specialisation} onChange={setSpecialisation} />
                {degrees.map((d, i) => (
                  <div key={i} className="au-doc">
                    <DocIcon />
                    <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                      <TextField label="Degree" value={d.degree} onChange={(e) => setDegree(i, { degree: e.target.value })} placeholder="MBBS" autoComplete="off" />
                    </div>
                    <div style={{ flex: '0 1 110px', minWidth: 90 }}>
                      <TextField label="Year" value={d.year} onChange={(e) => setDegree(i, { year: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" placeholder="2015" autoComplete="off" />
                    </div>
                    <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                      <DocFile label={`Certificate for degree ${i + 1}`} file={d.file} onFile={(f) => setDegree(i, { file: f })} />
                    </div>
                    {degrees.length > 1 ? (
                      <Button variant="ghost" size="sm" aria-label={`Remove degree ${i + 1}`} onClick={() => setDegrees((rows) => rows.filter((_, j) => j !== i))}>Remove</Button>
                    ) : null}
                  </div>
                ))}
                <button type="button" className="au-doc au-doc-add" onClick={() => setDegrees((rows) => [...rows, { degree: '', year: '', file: '' }])}>+ Add another degree</button>
              </section>
            )}

            {step === 3 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {heading('Where you work', "Your hospital's map pin sets the area where you can open records.", 4)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 18 }}>
                  <Select
                    label="Hospital"
                    options={hospitals.map((h) => ({ value: h.id, label: `${h.name} (${h.hfr_id})` }))}
                    value={hospitalId}
                    placeholder={hospitals.length ? 'Select hospital' : 'Loading hospitals…'}
                    onChange={setHospitalId}
                    required
                  />
                  <Select label="Department" options={DEPTS} value={dept} onChange={setDept} helper="Shown for the demo; the department link is made when you are approved." />
                </div>
                {hospitalsError ? <Alert tone="danger" title="Hospitals not loaded">{hospitalsError}</Alert> : null}
                <Tabs variant="segmented" label="Employment type" tabs={EMP_TABS} value={emp} onChange={(v) => setEmp(v as 'govt' | 'private')} />
                <div className="au-doc">
                  <span className="au-doc-i" aria-hidden="true" style={{ background: 'var(--tint-peach)', color: 'var(--peach-text)' }}><Icon d={ICON.idCard} /></span>
                  <span style={{ flex: 1, minWidth: 180 }}>
                    <strong style={{ color: 'var(--ink)' }}>{emp === 'govt' ? 'Government employee ID or posting order' : 'Hospital employee ID'}</strong>
                    <br />
                    <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{emp === 'govt' ? 'Issued by the health department' : 'Issued by your hospital'}</span>
                  </span>
                  <DocFile label="Employment proof" file={proofFile} onFile={setProofFile} />
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {heading('Security and e-signature', 'Doctor accounts always use two-step verification. Your e-signature signs prescriptions.', 5)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 18 }}>
                  <TextField label="Doctor username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. dr.arun.nair" autoComplete="username" />
                  <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" helper="At least 12 characters. Not stored in the alpha: you sign in through the demo pages." />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', padding: 20, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <svg width="104" height="104" viewBox="0 0 21 21" role="img" aria-label="Authenticator setup QR (demo)" style={{ background: 'var(--surface-raised)', borderRadius: 12, padding: 8, border: '1px solid var(--border)' }}>
                    <g fill="#3f5263"><path d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z" /></g>
                    <g fill="#faf5ef"><path d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z" /></g>
                    <g fill="#3f5263"><path d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2zM9 0h2v3H9zM8 5h4v2H8zM13 9h3v2h-3zM9 9h2v4H9zM17 9h4v2h-4zM8 15h2v4H8zM12 14h3v2h-3zM16 16h3v3h-3zM12 18h2v3h-2zM1 9h4v2H1z" /></g>
                  </svg>
                  <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <strong style={{ color: 'var(--ink)' }}>Scan with your authenticator app</strong>
                    <TextField label="Enter the 6-digit code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" helper="Demo only: the code is not checked." />
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', padding: '18px 20px', borderRadius: 18, background: 'var(--tint-peach)' }}>
                  <span style={{ color: 'var(--peach-text)' }}><Icon size={28} d="M3 17c3-1 4-6 6-6s1 6 3 6s3-4 5-4s2 2 4 2M3 21h18" /></span>
                  <span style={{ flex: 1, minWidth: 200 }}>
                    <strong style={{ color: 'var(--ink)' }}>Set up e-Sign / DSC</strong>
                    <br />
                    <span style={{ fontSize: 14 }}>Government-approved signature for prescriptions with a verifiable QR. Mock provider in the alpha.</span>
                  </span>
                  <Button variant="secondary" onClick={() => setSigned(true)} disabled={signed}>{signed ? 'e-Sign linked ✓' : 'Link e-Sign'}</Button>
                </div>
                {error ? <Alert tone="danger" title="We could not submit your application">{error}</Alert> : null}
              </section>
            )}

            {step === LAST && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p className="au-lead" style={{ fontSize: 13 }}>Step 6 of 6</p>
                    <h2 className="au-h2" tabIndex={-1} data-step-heading style={{ outline: 'none', fontFamily: 'var(--font-serif)', fontSize: 34, lineHeight: '40px' }}>
                      {rejected ? 'Changes needed' : 'Waiting for district approval'}
                    </h2>
                  </div>
                  <Badge tone={rejected ? 'danger' : 'warning'} dot>{rejected ? 'Rejected' : 'Pending'}</Badge>
                </div>
                <p className="au-lead" style={{ fontSize: 16 }}>
                  {rejected
                    ? 'Your application was returned with a reason. Fix it and resubmit.'
                    : 'Most applications are reviewed within 7 days. If not, they escalate to the state admin automatically.'}
                </p>
                <ol className="au-tl">
                  <li><span className="au-dot" style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>✓</span><span><strong style={{ color: 'var(--ink)' }}>Submitted</strong><br /><span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{submitted ? submitted.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span></span></li>
                  <li><span className="au-dot" style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>✓</span><span><strong style={{ color: 'var(--ink)' }}>HPR checked automatically</strong><br /><span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Registration matched{hpr ? ` · ${hpr.council}` : ''}</span></span></li>
                  <li><span className={`au-dot ${rejected ? 'is-bad' : 'is-now'}`}>{rejected ? '!' : '3'}</span><span><strong style={{ color: 'var(--ink)' }}>District admin of your hospital's district</strong><br /><span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{rejected ? 'Returned · see reason below' : `In review${due ? ` · due ${fmt(due)}` : ''}`}</span></span></li>
                  <li><span className="au-dot" style={{ background: 'var(--surface-cream)', color: 'var(--ink-muted)' }}>4</span><span><strong style={{ color: 'var(--ink)' }}>State admin, Kerala — confirmation</strong><br /><span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Central admin checks flagged cases only</span></span></li>
                  <li><span className="au-dot" style={{ background: 'var(--surface-cream)', color: 'var(--ink-muted)' }}>5</span><span><strong style={{ color: 'var(--ink)' }}>Active</strong><br /><span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>You'll get an SMS and email</span></span></li>
                </ol>
                <div style={{ padding: '14px 16px', borderRadius: 14, border: '1px dashed var(--border-strong)' }}>
                  <Switch label="Demo: show a rejected application" checked={rejected} onChange={setRejected} />
                </div>
                {rejected ? (
                  <Alert
                    tone="danger"
                    title="Reason from the district admin"
                    action={<Button size="sm" variant="secondary" onClick={() => { setRejected(false); setStep(2) }}>Fix documents</Button>}
                  >
                    The MD certificate is unreadable. Upload a clear copy and resubmit — your other checks are kept.
                  </Alert>
                ) : null}
              </section>
            )}

            <div style={{ paddingTop: 28, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--border)', marginTop: 40 }}>
              {step < LAST ? (
                <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>Back</Button>
              ) : (
                <span />
              )}
              {step < LAST ? (
                <Button size="lg" onClick={next} disabled={blocked} loading={busy}>{step === 4 ? 'Submit for approval' : 'Continue'}</Button>
              ) : (
                <LinkButton to="/" size="lg">Back to home</LinkButton>
              )}
            </div>
          </div>
        </main>
      </div>
    </AuthRoot>
  )
}

/** Simulated certificate picker: remembers the chosen file name only. Nothing is uploaded. */
function DocFile({ label, file, onFile }: { label: string; file: string; onFile: (name: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        className="cf-sr"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => onFile(e.target.files?.[0]?.name ?? '')}
      />
      {file ? <Badge tone="info" dot>{file} · not uploaded (demo)</Badge> : null}
      <Button variant={file ? 'ghost' : 'soft'} size="sm" onClick={() => input.current?.click()}>{file ? 'Replace' : 'Attach file'}</Button>
    </div>
  )
}

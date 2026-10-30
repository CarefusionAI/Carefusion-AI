import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  aadhaarInitOtp,
  aadhaarVerify,
  errorText,
  faceVerify,
  listDistricts,
  registerCitizen,
} from '../../api/auth'
import type { Ekyc, Sex } from '../../api/auth'
import { Alert, Avatar, Badge, Button, Checkbox, Select, Switch, TextField } from '../../components/ui'
import type { BadgeTone } from '../../components/ui'
import { AuthRoot, Icon, ICON, LinkButton, Logo, useTimers } from './authKit'

// Citizen registration (design: RegisterCitizen.dc.html).
// Real calls: Aadhaar OTP + e-KYC, face check and the citizen registration all go to /api/v1/register/citizen/*
// (mock connectors). The raw Aadhaar number lives only in this component until e-KYC succeeds, then it is
// cleared and only the token is kept (CLAUDE.md rule 2).

const STEPS: [string, string][] = [
  ['Consent', 'Privacy and permissions'],
  ['Your details', 'Name, contact, password'],
  ['Aadhaar e-KYC', 'Token only'],
  ['Face check', 'Live match'],
  ['ABHA', 'Health ID'],
  ['Health profile', 'Blood group, contacts'],
  ['Done', 'Approval'],
]
const LAST = STEPS.length - 1

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEXES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
]
const BLOOD = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A−' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B−' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB−' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O−' },
  { value: 'unknown', label: 'Unknown' },
]
const RELATIONS = ['Husband', 'Wife', 'Parent', 'Child', 'Sibling', 'Friend']
const FALLBACK_DISTRICTS = ['Pathanamthitta', 'Thiruvananthapuram', 'Kollam', 'Kottayam', 'Ernakulam']

function ageFrom(dobIso: string): number {
  const d = new Date(dobIso)
  if (Number.isNaN(d.getTime())) return 99
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age -= 1
  return age
}

/** DD/MM/YYYY to YYYY-MM-DD, or null when it is not a real date. */
function parseDob(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim())
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const iso = `${yyyy}-${mm}-${dd}`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso
}

function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

function strength(pw: string): { score: number; label: string } {
  let score = 0
  if (pw.length >= 12) score += 1
  if (pw.length >= 16) score += 1
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 1
  const labels = ['Too short', 'Fair', 'Good', 'Good', 'Strong password']
  return { score, label: pw.length < 12 ? labels[0]! : labels[score]! }
}

/** Random demo Aadhaar-style number that starts 0000 so it can never be a real one. */
function demoAadhaar(): string {
  return '0000' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0')
}
function groupAadhaar(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

type Face = 'idle' | 'scanning' | 'done' | 'failed'
type AbhaState = 'pending' | 'loading' | 'done'

export default function RegisterCitizenScreen() {
  const later = useTimers()
  const [step, setStep] = useState(0)

  // 1 consent
  const [c1, setC1] = useState(true)
  const [c2, setC2] = useState(true)
  const [c3, setC3] = useState(false)

  // 2 details
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [sex, setSex] = useState<Sex>('female')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [district, setDistrict] = useState('')
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [minor, setMinor] = useState(false)
  const [districts, setDistricts] = useState<string[]>(FALLBACK_DISTRICTS)

  // 3 Aadhaar
  const [aadhaar, setAadhaar] = useState(demoAadhaar)
  const [masked, setMasked] = useState('')
  const [pan, setPan] = useState('')
  const [otp, setOtp] = useState('123456')
  const [txnId, setTxnId] = useState('')
  const [aBusy, setABusy] = useState(false)
  const [aError, setAError] = useState('')
  const [ekyc, setEkyc] = useState<Ekyc | null>(null)
  const [guardianMobile, setGuardianMobile] = useState('')
  const [guardianId, setGuardianId] = useState('')
  const [guardianConsent, setGuardianConsent] = useState(true)

  // 4 face, 5 ABHA
  const [face, setFace] = useState<Face>('idle')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [faceError, setFaceError] = useState('')
  const [abha, setAbha] = useState<AbhaState>('pending')

  // 6 profile
  const [blood, setBlood] = useState('unknown')
  const [allergies, setAllergies] = useState('')
  const [contactMobile, setContactMobile] = useState('')
  const [relation, setRelation] = useState('Husband')

  // 7 result
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [personId, setPersonId] = useState('')
  const [status, setStatus] = useState('')
  const [showFlagged, setShowFlagged] = useState(false)
  const [copied, setCopied] = useState(false)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    listDistricts()
      .then((rows) => {
        const names = rows.map((r) => r.name)
        if (names.length) setDistricts(names)
      })
      .catch(() => {
        // Keep the built-in list. The district is optional.
      })
  }, [])

  // Move focus to the new step heading so keyboard and screen-reader users notice the change.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus()
  }, [step])

  const kycMinor = ekyc ? ageFrom(ekyc.dob) < 18 : false
  const typedDob = parseDob(dob)
  const showGuardian = minor || kycMinor || (typedDob ? ageFrom(typedDob) < 18 : false)
  const guardianOk = !kycMinor || UUID.test(guardianId)
  const phoneOk = phone.replace(/\D/g, '').length >= 10
  const emailOk = !email || /^\S+@\S+\.\S+$/.test(email)
  const detailsOk = fullName.trim().length >= 2 && typedDob !== null && phoneOk && emailOk && password.length >= 12
  const pw = strength(password)

  const blocked =
    (step === 0 && !(c1 && c2)) ||
    (step === 1 && !detailsOk) ||
    (step === 2 && (!ekyc || !guardianOk)) ||
    (step === 3 && face !== 'done') ||
    (step === 4 && abha !== 'done')

  async function sendOtp() {
    setABusy(true)
    setAError('')
    try {
      const r = await aadhaarInitOtp(aadhaar)
      if (r.success && r.txnId) setTxnId(r.txnId)
      else setAError(errorText(r, 'Could not send the OTP.'))
    } catch {
      setAError('Could not reach the server.')
    }
    setABusy(false)
  }

  async function verifyOtp() {
    setABusy(true)
    setAError('')
    try {
      const r = await aadhaarVerify(aadhaar, otp, txnId)
      if (r.ok) {
        setEkyc(r.ekyc)
        setMasked(`XXXX XXXX ${aadhaar.slice(-4)}`)
        // The raw number is not needed any more: only the token is kept.
        setAadhaar('')
        setOtp('')
        if (ageFrom(r.ekyc.dob) < 18) setMinor(true)
      } else setAError(r.error)
    } catch {
      setAError('Could not reach the server.')
    }
    setABusy(false)
  }

  function resetAadhaar() {
    setEkyc(null)
    setTxnId('')
    setMasked('')
    setAadhaar(demoAadhaar())
    setOtp('123456')
    setFace('idle')
    setConfidence(null)
    setAbha('pending')
  }

  function startFace() {
    if (!ekyc) return
    setFace('scanning')
    setFaceError('')
    const started = Date.now()
    faceVerify(ekyc.token)
      .then((r) => {
        const wait = Math.max(0, 2200 - (Date.now() - started))
        later(() => {
          if (r.success && r.match) {
            setConfidence(r.confidence ?? null)
            setFace('done')
          } else {
            setFace('failed')
            setFaceError(errorText(r, 'The face did not match. Please try again.'))
          }
        }, wait)
      })
      .catch(() => {
        setFace('failed')
        setFaceError('Could not reach the server.')
      })
  }

  function makeAbha() {
    setAbha('loading')
    later(() => setAbha('done'), 1200)
  }

  async function submit() {
    if (!ekyc) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const r = await registerCitizen({
        fullName: ekyc.name,
        dateOfBirth: ekyc.dob,
        sex: ekyc.sex,
        phone: phone.trim(),
        ...(email ? { email: email.trim() } : {}),
        password,
        aadhaarToken: ekyc.token,
        kycVerified: true,
        faceCheckPassed: true,
        preferredLanguage: 'en',
        bloodGroup: blood,
        ...(kycMinor && UUID.test(guardianId) ? { guardianPersonId: guardianId } : {}),
        privacyNoticeAccepted: true,
        locationLoggingAccepted: c2,
        aiResearchOptIn: c3,
        ...(district ? { districtName: district } : {}),
      })
      if (r.success) {
        setPersonId(r.personId ?? '')
        setStatus(r.status ?? 'active')
        setPassword('')
        setStep(LAST)
      } else setSubmitError(errorText(r, 'Registration failed.'))
    } catch {
      setSubmitError('Could not reach the server.')
    }
    setSubmitting(false)
  }

  function next() {
    if (step === 5) void submit()
    else setStep((s) => Math.min(LAST, s + 1))
  }

  async function copyPersonId() {
    try {
      await navigator.clipboard.writeText(personId)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const firstName = (ekyc?.name ?? fullName).split(' ')[0] || ''
  const flagged = showFlagged || status === 'pending' || status === 'flagged'
  const faceStatus = { idle: 'Ready when you are.', scanning: 'Checking liveness…', done: 'Face matched to your Aadhaar photo.', failed: faceError || 'The face did not match.' }[face]
  const f1: BadgeTone = face === 'idle' ? 'neutral' : 'success'
  const f2: BadgeTone = face === 'done' ? 'success' : face === 'scanning' ? 'teal' : 'neutral'
  const f3: BadgeTone = face === 'done' ? 'success' : 'neutral'

  const heading = (title: string, lead: string, n: number) => (
    <div>
      <p className="au-lead" style={{ fontSize: 13 }}>Step {n} of {STEPS.length}</p>
      <h2 className="au-h2" tabIndex={-1} data-step-heading style={{ outline: 'none' }}>{title}</h2>
      <p className="au-lead">{lead}</p>
    </div>
  )

  return (
    <AuthRoot title="Create your health account — CareFusion AI" bannerText="Aadhaar e-KYC, face check and ABHA are mock connectors. Never enter a real Aadhaar number." main={false}>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap' }}>
        <aside aria-label="Registration progress" style={{ flex: '1 1 300px', maxWidth: 360, background: 'var(--tint-sage)', padding: '40px 28px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Logo height={32} style={{ padding: '0 12px' }} />
          <div style={{ padding: '0 12px' }}>
            <h1 style={{ margin: '0 0 6px', fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: '36px', fontWeight: 600, color: 'var(--ink-strong)' }}>Create your health account</h1>
            <p style={{ margin: 0, fontSize: 14 }}>About five minutes. Approved automatically when your checks pass.</p>
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
          <p style={{ margin: 'auto 0 0', padding: '0 12px', fontSize: 13 }}>
            Already registered? <Link to="/login">Log in</Link>
            <br />
            No smartphone? An ASHA worker or hospital help desk can register you and print a health card.
          </p>
        </aside>

        <main id="au-main" ref={mainRef} style={{ position: 'relative', overflow: 'hidden', flex: '999 1 560px', minWidth: 0, background: 'var(--surface-raised)', padding: '48px clamp(24px, 5vw, 72px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <svg className="au-wm au-wm-a" viewBox="0 0 64 64" aria-hidden="true"><rect x="21" y="5" width="18" height="50" rx="9" fill="#5e9e98" /><rect x="9" y="25" width="50" height="18" rx="9" fill="#d2b277" /><rect x="21" y="25" width="18" height="18" rx="2" fill="#3a726d" /></svg>
          <svg className="au-wm au-wm-b" viewBox="0 0 64 64" aria-hidden="true"><rect x="21" y="5" width="18" height="50" rx="9" fill="#86bdb8" /><rect x="9" y="25" width="50" height="18" rx="9" fill="#b7a6d4" /></svg>
          <svg className="au-wm au-wm-c" viewBox="0 0 64 64" aria-hidden="true"><rect x="21" y="5" width="18" height="50" rx="9" fill="#c9a86a" /><rect x="9" y="25" width="50" height="18" rx="9" fill="#86bdb8" /></svg>
          <div style={{ position: 'relative', width: '100%', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
            {step === 0 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {heading('Before you start', 'How CareFusion AI uses your information, in plain words.', 1)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                  <div className="au-panel"><strong style={{ color: 'var(--ink)' }}>Your record is yours</strong><p style={{ margin: '6px 0 0', fontSize: 14 }}>Doctors open it only with your key, for 30 minutes.</p></div>
                  <div className="au-panel"><strong style={{ color: 'var(--ink)' }}>Aadhaar is never stored</strong><p style={{ margin: '6px 0 0', fontSize: 14 }}>UIDAI confirms you; we keep a token, not the number.</p></div>
                  <div className="au-panel"><strong style={{ color: 'var(--ink)' }}>Everything is logged</strong><p style={{ margin: '6px 0 0', fontSize: 14 }}>You can see who opened your record and when.</p></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Checkbox label="I have read and accept the privacy notice (DPDP Act consent)" description="Required." checked={c1} onChange={setC1} />
                  <Checkbox label="Log my location area when I share my record or sign in" description="Required for the access log. Area only, never continuous tracking." checked={c2} onChange={setC2} />
                  <Checkbox label="Use my anonymised data to improve the AI" description="Optional and off by default. Change it any time in Settings." checked={c3} onChange={setC3} />
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {heading('About you', 'Name, date of birth and sex will be locked after Aadhaar verification.', 2)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 18 }}>
                  <TextField label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
                  <TextField
                    label="Date of birth"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    inputMode="numeric"
                    autoComplete="bday"
                    required
                    error={dob && !typedDob && dob.length >= 10 ? 'Enter a real date as DD/MM/YYYY.' : undefined}
                  />
                  <Select label="Sex" options={SEXES} value={sex} onChange={(v) => setSex(v as Sex)} required />
                  <TextField label="Mobile number" prefix="+91" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel-national" required helper="Verified with a one-time code." />
                  <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" optional error={email && !emailOk ? 'Enter an email like name@example.com.' : undefined} />
                  <Select label="District" options={districts} value={district} placeholder="Select district" onChange={setDistrict} />
                </div>
                <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" optional helper="Your verified Aadhaar address is used for the record." />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <TextField label="Create a password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required helper="At least 12 characters. We check it against known leaked passwords." />
                  <div aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
                    {[0, 1, 2, 3].map((i) => <span key={i} className={`au-pw${password && i < pw.score ? ' on' : ''}`} />)}
                  </div>
                  {password ? <span role="status" style={{ fontSize: 13, color: pw.score >= 3 && password.length >= 12 ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>{pw.label}</span> : null}
                </div>
                <Switch label="I'm registering a child under 18" description="A registered parent or guardian manages the account until the child turns 18." checked={minor} onChange={setMinor} />
              </section>
            )}

            {step === 2 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {heading('Verify with Aadhaar e-KYC', 'UIDAI sends a code to your Aadhaar-linked mobile. We keep only a token.', 3)}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                    <TextField
                      label="Aadhaar number (demo)"
                      value={ekyc ? masked : groupAadhaar(aadhaar)}
                      onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={!!ekyc || !!txnId}
                      error={!ekyc && /^[2-9]/.test(aadhaar) ? 'This looks like a real Aadhaar number. Do not enter one — use the demo number.' : undefined}
                      helper="Demo only — a real number is never accepted. The pre-filled number starts 0000."
                    />
                  </div>
                  {!ekyc ? (
                    <Button variant="soft" loading={aBusy && !txnId} disabled={aadhaar.length !== 12 || !!txnId} onClick={sendOtp}>
                      Send Aadhaar OTP
                    </Button>
                  ) : null}
                </div>
                {txnId && !ekyc ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <TextField label="6-digit Aadhaar OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" helper="Demo OTP: 123456" />
                    </div>
                    <Button loading={aBusy} disabled={otp.length !== 6} onClick={verifyOtp}>Verify</Button>
                  </div>
                ) : null}
                {aError ? <Alert tone="danger" title="Aadhaar check failed">{aError}</Alert> : null}
                {ekyc ? (
                  <Alert
                    tone="success"
                    title="e-KYC verified"
                    action={<Button variant="ghost" size="sm" onClick={resetAadhaar}>Use another number</Button>}
                  >
                    {ekyc.name} · born {displayDate(ekyc.dob)} · <span style={{ textTransform: 'capitalize' }}>{ekyc.sex}</span>. Stored as token <code>{ekyc.token.slice(0, 14)}…{ekyc.token.slice(-3)}</code> — Aadhaar shown as {masked}.
                  </Alert>
                ) : null}
                <TextField label="PAN" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))} optional placeholder="DEMOP0000X" helper="Demo only: PAN is not stored in the alpha." />
                {showGuardian ? (
                  <div className="au-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--tint-peach)', borderColor: 'transparent' }}>
                    <strong style={{ color: 'var(--ink)' }}>Child under 18 — guardian details</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: 14, border: '1.5px dashed var(--border-strong)', borderRadius: 14, background: 'var(--surface-raised)' }}>
                      <span style={{ color: 'var(--peach-text)' }}><Icon size={28} d="M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14l3-3l3 3" /></span>
                      <span style={{ flex: 1, minWidth: 160 }}><strong style={{ color: 'var(--ink)' }}>Birth certificate</strong><br /><span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>PDF or photo, up to 10 MB (not uploaded in the alpha)</span></span>
                      <Button variant="secondary" size="sm" disabled>Upload</Button>
                    </div>
                    <TextField label="Guardian's registered mobile" prefix="+91" value={guardianMobile} onChange={(e) => setGuardianMobile(e.target.value)} type="tel" helper="The guardian must already have a CareFusion account." />
                    <TextField
                      label="Guardian's person ID (demo)"
                      value={guardianId}
                      onChange={(e) => setGuardianId(e.target.value.trim())}
                      autoComplete="off"
                      required={kycMinor}
                      optional={!kycMinor}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      helper="The alpha cannot look up a guardian by mobile yet. Enter the guardian's person ID from their registration."
                      error={guardianId && !UUID.test(guardianId) ? 'This does not look like a valid person ID.' : undefined}
                    />
                    <Checkbox label="The guardian gives recorded consent for this child's data to be processed" checked={guardianConsent} onChange={setGuardianConsent} />
                    {ekyc && !kycMinor ? <p style={{ margin: 0, fontSize: 13 }}>Your verified date of birth shows you are 18 or over, so no guardian is needed and none will be sent.</p> : null}
                  </div>
                ) : null}
              </section>
            )}

            {step === 3 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {heading('Live face check', 'We match a live photo to your Aadhaar photo with UIDAI face authentication.', 4)}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
                  <div className="au-scan" role="img" aria-label="Camera preview with an oval face guide">
                    <svg viewBox="0 0 240 300" width="240" height="300" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
                      <circle cx="120" cy="120" r="46" fill="rgba(250,245,239,.75)" />
                      <path d="M44 300c6-62 38-96 76-96s70 34 76 96" fill="rgba(250,245,239,.75)" />
                    </svg>
                    {face === 'scanning' ? <span className="au-scanline" /> : null}
                    {face === 'done' ? (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220, 235, 224, .7)' }}>
                        <Icon d="M8 12.5l2.5 2.5L16 9.5M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z" size={72} stroke="var(--success)" strokeWidth={2} />
                      </span>
                    ) : null}
                  </div>
                  <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <ul className="au-mini-steps">
                      <li><Badge tone={f1}>1</Badge>Face the camera in good light</li>
                      <li><Badge tone={f2}>2</Badge>Blink twice when the line moves</li>
                      <li><Badge tone={f3}>3</Badge>Hold still while we match</li>
                    </ul>
                    <p aria-live="polite" style={{ margin: 0, fontWeight: 600, color: face === 'failed' ? 'var(--danger)' : 'var(--ink)' }}>
                      {faceStatus}
                      {face === 'done' && confidence !== null ? ` Match confidence ${confidence.toFixed(1)}%.` : ''}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>The camera is not used in the alpha: a simulated selfie is sent to the mock face check.</p>
                    <Button variant="soft" onClick={startFace} disabled={face === 'scanning'}>{face === 'done' || face === 'failed' ? 'Check again' : 'Start face check'}</Button>
                  </div>
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {heading('Your ABHA health ID', 'We create or link your national ABHA ID so your records can move with consent.', 5)}
                {abha !== 'done' ? (
                  <div className="au-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
                    <p style={{ margin: 0 }}>We found no existing ABHA for these details. We'll create one for you.</p>
                    <Button onClick={makeAbha} loading={abha === 'loading'}>Create my ABHA</Button>
                  </div>
                ) : (
                  <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 28, background: 'var(--primary)', color: 'var(--on-primary)', maxWidth: 460, boxShadow: '0 24px 48px rgba(58,114,109,.24)' }}>
                    <svg aria-hidden="true" viewBox="0 0 64 64" width="180" height="180" style={{ position: 'absolute', right: -40, top: -40, opacity: 0.14 }}>
                      <rect x="21" y="5" width="18" height="50" rx="9" fill="#faf5ef" />
                      <rect x="9" y="25" width="50" height="18" rx="9" fill="#faf5ef" />
                    </svg>
                    <p style={{ margin: '0 0 18px', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600 }}>ABHA health ID · demo</p>
                    <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 24, letterSpacing: '.08em' }}>DEMO-XXXX-XXXX</p>
                    <p style={{ margin: '6px 0 18px', fontSize: 14 }}>The mock ABHA service assigns your number when you submit.</p>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{ekyc?.name ?? fullName}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13 }}>{district ? `${district}, Kerala` : 'Kerala'}</p>
                  </div>
                )}
              </section>
            )}

            {step === 5 && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {heading('Health profile', 'What a doctor needs in an emergency. You can add more later.', 6)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 18 }}>
                  <Select label="Blood group" options={BLOOD} value={blood} onChange={setBlood} />
                  <TextField label="Allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} optional helper="Add allergies later in your profile." />
                  <Select label="Preferred language" options={['English']} value="English" onChange={() => undefined} helper="Malayalam and Hindi arrive after the pilot." />
                </div>
                <div className="au-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <strong style={{ color: 'var(--ink)' }}>Emergency contact <span aria-hidden="true" style={{ color: 'var(--danger)' }}>*</span></strong>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-muted)' }}>At least one. They must have their own CareFusion account and will set a separate emergency code. Contact lookup is simulated in the alpha.</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <TextField label="Their registered mobile" prefix="+91" value={contactMobile} onChange={(e) => setContactMobile(e.target.value)} type="tel" inputMode="tel" />
                    </div>
                    <div style={{ flex: '0 1 180px', minWidth: 0 }}>
                      <Select label="Relation" options={RELATIONS} value={relation} onChange={setRelation} />
                    </div>
                  </div>
                  {contactMobile.replace(/\D/g, '').length >= 10 ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, background: 'var(--tint-sage)' }}>
                      <Avatar name="Emergency contact" size={36} />
                      <span style={{ flex: 1 }}><strong style={{ color: 'var(--ink)' }}>{relation} (demo contact)</strong><br /><span style={{ fontSize: 13 }}>Registered · will get an invite to set an emergency code</span></span>
                      <Badge tone="success" dot>Found</Badge>
                    </div>
                  ) : null}
                </div>
                {submitError ? <Alert tone="danger" title="We could not create your account">{submitError}</Alert> : null}
              </section>
            )}

            {step === LAST && (
              <section className="au-step-in" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {!flagged ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
                    <span aria-hidden="true" style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--tint-sage)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon d={ICON.check} size={36} stroke="var(--success)" strokeWidth={2} />
                    </span>
                    <h2 className="au-h2" tabIndex={-1} data-step-heading style={{ outline: 'none', fontFamily: 'var(--font-serif)', fontSize: 36, lineHeight: '42px' }}>You're all set, {firstName}.</h2>
                    <p className="au-lead" style={{ fontSize: 17 }}>e-KYC and face check passed, so your account was approved automatically. Your ABHA ID is being linked.</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <LinkButton to="/login" variant="primary" size="lg">Log in to open my health record</LinkButton>
                      <LinkButton to="/login" size="lg">Set up face ID login</LinkButton>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
                    <Badge tone="warning" dot>Under review</Badge>
                    <h2 className="au-h2" tabIndex={-1} data-step-heading style={{ outline: 'none', fontFamily: 'var(--font-serif)', fontSize: 34, lineHeight: '40px' }}>We need a person to check your details</h2>
                    <p className="au-lead" style={{ fontSize: 16 }}>The face check did not match clearly. Nothing is wrong with your account — a reviewer will confirm it. We'll send an SMS when it's done.</p>
                    <ol className="au-mini-steps">
                      <li><Badge tone="success">Done</Badge>Submitted · {new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</li>
                      <li><Badge tone="warning">Now</Badge>District admin, Pathanamthitta — first review</li>
                      <li><Badge tone="neutral">Next</Badge>State admin, Kerala — second review</li>
                    </ol>
                  </div>
                )}
                {personId ? (
                  <div className="au-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <strong style={{ color: 'var(--ink)' }}>Your person ID (demo)</strong>
                    <code style={{ wordBreak: 'break-all', fontSize: 14 }}>{personId}</code>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>You need this ID to register as a doctor, hospital admin or pharmacy admin in the alpha demo.</p>
                    <div><Button variant="secondary" size="sm" onClick={copyPersonId}>{copied ? 'Copied' : 'Copy person ID'}</Button></div>
                  </div>
                ) : null}
                <div style={{ marginTop: 8, padding: '14px 16px', borderRadius: 14, border: '1px dashed var(--border-strong)' }}>
                  <Switch label="Demo: show the flagged-case outcome" description="Face mismatch, duplicate or suspicious data goes to district, then state." checked={showFlagged} onChange={setShowFlagged} />
                </div>
              </section>
            )}

            <div style={{ paddingTop: 28, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--border)', marginTop: 40 }}>
              {step < LAST ? (
                <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>Back</Button>
              ) : (
                <LinkButton to="/" variant="ghost">Back to home</LinkButton>
              )}
              {step < LAST ? (
                <Button size="lg" onClick={next} disabled={blocked} loading={submitting}>{step === 5 ? 'Submit' : 'Continue'}</Button>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </AuthRoot>
  )
}

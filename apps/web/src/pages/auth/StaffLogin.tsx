import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Role } from '@carefusion/shared'
import { useAuth } from '../../context/AuthContext'
import { Alert, Button, Select, TextField } from '../../components/ui'
import { AuthRoot, Blob, Eyebrow, Icon, Logo, OtpInput, PanelFx, demoRole, useTimers } from './authKit'

// Staff Portal login (design: StaffLogin.dc.html) for nurses, lab and radiology technicians and pharmacists.
// Staff accounts are made by a hospital or pharmacy admin, so there is no self-registration.
// The forms are visual only in the alpha; "Verify and open orders" and the demo links use POST /api/v1/auth/demo-login.

type StaffKey = 'nurse' | 'lab' | 'radiology' | 'pharmacist'

const STAFF: Record<StaffKey, { role: Role; label: string }> = {
  nurse: { role: 'NURSE', label: 'Nurse' },
  lab: { role: 'LAB_TECH', label: 'Lab technician' },
  radiology: { role: 'RADIOLOGY_TECH', label: 'Radiology technician' },
  pharmacist: { role: 'PHARMACIST', label: 'Pharmacist' },
}
const OPTIONS = (Object.keys(STAFF) as StaffKey[]).map((k) => ({ value: k, label: STAFF[k].label }))

const DEMO_LINKS: { key: StaffKey; code: string; label: string; color: string }[] = [
  { key: 'nurse', code: 'NUR', label: 'Nurse', color: 'var(--primary-text)' },
  { key: 'lab', code: 'LAB', label: 'Lab technician', color: 'var(--primary-text)' },
  { key: 'radiology', code: 'RAD', label: 'Radiology', color: 'var(--primary-text)' },
  { key: 'pharmacist', code: 'PHA', label: 'Pharmacist', color: 'var(--success)' },
]

export default function StaffLoginScreen() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const later = useTimers()
  const [key, setKey] = useState<StaffKey>('nurse')
  const [step, setStep] = useState<'creds' | 'code'>('creds')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')

  async function enter(k: StaffKey) {
    const role = STAFF[k].role
    if (await login(role)) navigate(demoRole(role).path)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    later(() => {
      setLoading(false)
      setStep('code')
    }, 900)
  }

  return (
    <AuthRoot title="Staff login — CareFusion AI" bannerText="Sign-in forms are visual only in the alpha — use the demo links to enter a role.">
      <div className="au-split">
        <section
          className="cf-panel"
          aria-label="About the staff workspace"
          style={{ position: 'relative', overflow: 'hidden', background: 'var(--tint-sage)', padding: '56px clamp(32px, 5vw, 72px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 40, minHeight: 640 }}
        >
          <PanelFx />
          <Blob size={460} color="var(--tint-blue)" style={{ right: -160, top: -140 }} />
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 12, alignSelf: 'flex-start' }}>
            <Logo label="CareFusion Staff Portal" to="/login/staff" />
            <span style={{ padding: '4px 10px', borderRadius: 9999, background: 'var(--surface-raised)', color: 'var(--success)', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>Staff Portal</span>
          </div>
          <div style={{ position: 'relative', maxWidth: 520 }}>
            <Eyebrow color="var(--success)" style={{ marginBottom: 12 }}>Hospital &amp; pharmacy staff</Eyebrow>
            <h1 style={{ margin: '0 0 16px', fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px, 4.4vw, 58px)', lineHeight: 1.04, fontWeight: 600, color: 'var(--ink-strong)', letterSpacing: '-0.015em' }}>Your orders are waiting.</h1>
            <p style={{ margin: 0, fontSize: 18, lineHeight: '29px' }}>Nurses, lab and radiology technicians and pharmacists see only what an order or prescription needs — never the full record.</p>
          </div>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="au-q">
              <span className="au-q-i"><Icon d="M9 4h6M9 4a2 2 0 0 0-2 2v0h10v0a2 2 0 0 0-2-2M7 6H5v15h14V6h-2M9 12h6M9 16h4" /></span>
              <span><strong style={{ color: 'var(--ink)' }}>Orders queue</strong><br /><span style={{ fontSize: 14 }}>BP every 4 h, CBC, chest X-ray — done and tagged to you.</span></span>
            </div>
            <div className="au-q">
              <span className="au-q-i"><Icon d="M3 12a9 9 0 0 1 15-6.7M21 12a9 9 0 0 1-15 6.7M18 2v4h-4M6 22v-4h4" /></span>
              <span><strong style={{ color: 'var(--ink)' }}>Works offline</strong><br /><span style={{ fontSize: 14 }}>Record vitals without a network; they sync when you're back.</span></span>
            </div>
          </div>
        </section>

        <main id="au-main" className="au-form-col">
          <div className="au-form-inner">
            {step === 'creds' ? (
              <div className="au-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2 className="au-form-title">Staff sign-in</h2>
                  <p className="au-lead">Use the account your hospital or pharmacy admin created for you.</p>
                </div>
                <form style={{ display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={submit}>
                  <Select label="I am a" options={OPTIONS} value={key} onChange={(v) => setKey(v as StaffKey)} />
                  <TextField label="Staff ID or email" placeholder="e.g. DEMO-ST-0412" autoComplete="username" required />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <TextField label="Password" type="password" autoComplete="current-password" required />
                    <Link to="/recovery" style={{ alignSelf: 'flex-end', fontSize: 13 }}>Forgot password?</Link>
                  </div>
                  <Button type="submit" size="lg" fullWidth loading={loading}>{loading ? 'Checking' : 'Sign in'}</Button>
                </form>
                <Alert tone="info" title="No self-registration">
                  {key === 'pharmacist' ? 'Your pharmacy admin creates pharmacist accounts.' : 'Contact your hospital admin for access.'} Got an activation link? <Link to="/staff/activate">Activate your account</Link>.
                </Alert>
              </div>
            ) : (
              <div className="au-fade" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <Button variant="ghost" size="sm" onClick={() => setStep('creds')} style={{ alignSelf: 'flex-start', paddingLeft: 4 }}>← Back</Button>
                <div>
                  <h2 className="au-form-title">Two-step verification</h2>
                  <p className="au-lead">Enter the 6-digit code from your authenticator app. Idle screens lock after 15 minutes. Demo only: any code works.</p>
                </div>
                <OtpInput value={code} onChange={setCode} />
                <Button size="lg" fullWidth onClick={() => enter(key)}>Verify and open orders</Button>
              </div>
            )}

            <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="au-eyebrow" style={{ color: 'var(--ink-muted)' }}>Demo — skip sign-in</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {DEMO_LINKS.map((d) => (
                  <button key={d.key} type="button" className="au-demo" onClick={() => enter(d.key)}>
                    <code style={{ color: d.color }}>{d.code}</code>{d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthRoot>
  )
}

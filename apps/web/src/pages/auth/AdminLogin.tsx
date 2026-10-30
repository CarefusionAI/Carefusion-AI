import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Role } from '@carefusion/shared'
import { useAuth } from '../../context/AuthContext'
import { Alert, Badge, Button, Select, TextField } from '../../components/ui'
import { AuthRoot, Blob, Eyebrow, Icon, ICON, Logo, PanelFx, demoRole, useTimers } from './authKit'

// Admin Console login (design: AdminLogin.dc.html).
// Hospital and pharmacy admins sign in with a password; district, state, zonal and central admins use
// Jan Parichay (a mock connector in the alpha) plus a hardware key. Forms are visual only in the alpha;
// the final step and the demo links use POST /api/v1/auth/demo-login.

type AdminKey = 'hospital' | 'pharmacy' | 'district' | 'state' | 'zonal' | 'central'

const ADMINS: Record<AdminKey, { role: Role; label: string; scope: string; name?: string; reg?: string }> = {
  hospital: { role: 'HOSPITAL_ADMIN', label: 'Hospital admin', scope: 'Demo General Hospital, Pathanamthitta', name: 'hospital admin', reg: '/register/hospital-admin' },
  pharmacy: { role: 'PHARMACY_ADMIN', label: 'Pharmacy admin', scope: 'Demo Hospital Pharmacy', name: 'pharmacy admin', reg: '/register/pharmacy-admin' },
  district: { role: 'DISTRICT_ADMIN', label: 'District admin', scope: 'Pathanamthitta district' },
  state: { role: 'STATE_ADMIN', label: 'State admin', scope: 'Kerala' },
  zonal: { role: 'ZONAL_ADMIN', label: 'Zonal admin', scope: 'South zone' },
  central: { role: 'CENTRAL_ADMIN', label: 'Central admin', scope: 'National' },
}
const KEYS = Object.keys(ADMINS) as AdminKey[]
const OPTIONS = KEYS.map((k) => ({ value: k, label: ADMINS[k].label }))
const isGov = (k: AdminKey) => k === 'district' || k === 'state' || k === 'zonal' || k === 'central'

const DEMO_LINKS: { key: AdminKey; code: string; label: string; color: string }[] = [
  { key: 'hospital', code: 'HAD', label: 'Hospital', color: 'var(--info)' },
  { key: 'pharmacy', code: 'PAD', label: 'Pharmacy', color: 'var(--success)' },
  { key: 'district', code: 'DAD', label: 'District', color: 'var(--ai)' },
  { key: 'state', code: 'SAD', label: 'State', color: 'var(--ai)' },
  { key: 'zonal', code: 'ZAD', label: 'Zonal', color: 'var(--ai)' },
  { key: 'central', code: 'CAD', label: 'Central', color: 'var(--ai)' },
]

export default function AdminLoginScreen() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const later = useTimers()
  const [key, setKey] = useState<AdminKey>('hospital')
  const [step, setStep] = useState<'creds' | 'key'>('creds')
  const [loading, setLoading] = useState(false)

  const meta = ADMINS[key]
  const gov = isGov(key)

  function enter(k: AdminKey) {
    const role = ADMINS[k].role
    login(role)
    navigate(demoRole(role).path)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    later(() => {
      setLoading(false)
      setStep('key')
    }, 900)
  }

  return (
    <AuthRoot title="Administrator login — CareFusion AI" bannerText="Jan Parichay and security keys are mock connectors in the alpha. Sign-in forms are visual only.">
      <div className="au-split">
        <section
          className="cf-panel"
          aria-label="Administration hierarchy"
          style={{ position: 'relative', overflow: 'hidden', background: 'var(--tint-lavender)', padding: '56px clamp(32px, 5vw, 72px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 36, minHeight: 640 }}
        >
          <PanelFx />
          <Blob size={480} color="var(--tint-peach)" style={{ right: -180, bottom: -160, filter: 'blur(90px)' }} />
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 12, alignSelf: 'flex-start' }}>
            <Logo label="CareFusion Admin Console" to="/login/admin" />
            <span style={{ padding: '4px 10px', borderRadius: 9999, background: 'var(--surface-raised)', color: 'var(--ai)', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>Admin Console</span>
          </div>
          <div style={{ position: 'relative', maxWidth: 520 }}>
            <Eyebrow color="var(--ai)" style={{ marginBottom: 12 }}>Administrators</Eyebrow>
            <h1 style={{ margin: '0 0 16px', fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px, 4.4vw, 58px)', lineHeight: 1.04, fontWeight: 600, color: 'var(--ink-strong)', letterSpacing: '-0.015em' }}>Oversight, with every action on the record.</h1>
            <p style={{ margin: 0, fontSize: 18, lineHeight: '29px' }}>Your scope is locked to your hospital, pharmacy or area. Approvals have time limits and escalate when overdue.</p>
          </div>
          <ol aria-label="Hierarchy" style={{ position: 'relative', margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { code: 'CAD', tone: 'ai', title: 'Central', text: 'whole country, 5 zones', ml: 0 },
              { code: 'ZAD', tone: 'ai', title: 'Zonal', text: 'North, South, East, West, Central', ml: 18 },
              { code: 'SAD', tone: 'ai', title: 'State', text: '28 states and 8 UTs', ml: 36 },
              { code: 'DAD', tone: 'ai', title: 'District', text: 'approves hospitals, pharmacies, doctors', ml: 54 },
              { code: 'HAD · PAD', tone: 'info', title: 'Hospital & pharmacy', text: '', ml: 72 },
            ].map((t) => (
              <li key={t.code} className="au-tier" style={{ marginLeft: t.ml }}>
                <span className={`cf-badge cf-badge-${t.tone}`} style={{ fontFamily: 'var(--font-mono)' }}>{t.code}</span>
                <span><strong style={{ color: 'var(--ink)' }}>{t.title}</strong>{t.text ? ` · ${t.text}` : ''}</span>
              </li>
            ))}
          </ol>
        </section>

        <main id="au-main" className="au-form-col">
          <div className="au-form-inner">
            {step === 'creds' ? (
              <div className="au-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2 className="au-form-title">Administrator sign-in</h2>
                  <p className="au-lead">Choose your role to see how you sign in.</p>
                </div>
                <Select label="I am a" options={OPTIONS} value={key} onChange={(v) => { setKey(v as AdminKey); setStep('creds') }} />

                {gov ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Button size="lg" fullWidth icon={<Icon d={ICON.shield} size={18} />} onClick={() => setStep('key')}>Sign in with Jan Parichay</Button>
                    <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-muted)' }}>
                      <Badge tone="peach">Coming soon</Badge>Government single sign-on — mock connector in the alpha.
                    </p>
                    <Alert tone="info" title="You'll also need your security key">
                      District, state, zonal and central admins confirm every sign-in with a hardware key. State, zonal and central sign in from an approved network.
                    </Alert>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>These accounts are created by the level above. There is no self-registration.</p>
                  </div>
                ) : (
                  <form style={{ display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={submit}>
                    <TextField label="Email or admin ID" placeholder="e.g. admin@demo-hospital.example" autoComplete="username" required />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <TextField label="Password" type="password" autoComplete="current-password" required />
                      <Link to="/recovery" style={{ alignSelf: 'flex-end', fontSize: 13 }}>Forgot password?</Link>
                    </div>
                    <Button type="submit" size="lg" fullWidth loading={loading}>{loading ? 'Checking' : 'Sign in'}</Button>
                    <p style={{ margin: 0, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 14 }}>
                      New {meta.name}? <Link to={meta.reg ?? '#'}>Register and upload your documents</Link>
                    </p>
                  </form>
                )}
              </div>
            ) : (
              <div className="au-fade" style={{ display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'flex-start' }}>
                <Button variant="ghost" size="sm" onClick={() => setStep('creds')} style={{ paddingLeft: 4 }}>← Back</Button>
                <span className="au-pulse" aria-hidden="true" style={{ width: 88, height: 88, borderRadius: 28, background: 'var(--tint-lavender)', color: 'var(--ai)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={40} strokeWidth={1.6}>
                    <rect x="7" y="2" width="10" height="14" rx="3" />
                    <path d="M10 16v4a2 2 0 0 0 4 0v-4M12 6v3" />
                  </Icon>
                </span>
                <div>
                  <h2 className="au-form-title">{gov ? 'Touch your security key' : 'Confirm with your second factor'}</h2>
                  <p className="au-lead">
                    Insert your security key and touch it when it blinks. Your scope: <strong style={{ color: 'var(--ink)' }}>{meta.scope}</strong>. Security keys are simulated in the alpha.
                  </p>
                </div>
                <Button size="lg" fullWidth onClick={() => enter(key)}>Key confirmed — continue</Button>
              </div>
            )}

            <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="au-eyebrow" style={{ color: 'var(--ink-muted)' }}>Demo — skip sign-in</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {DEMO_LINKS.map((d) => (
                  <button key={d.key} type="button" className="au-demo au-demo-sm" onClick={() => enter(d.key)}>
                    <code style={{ color: d.color, fontSize: 11 }}>{d.code}</code>{d.label}
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

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Role } from '@carefusion/shared'
import { useAuth } from '../../context/AuthContext'
import { Button, TextField } from '../../components/ui'
import { AuthRoot, Icon, ICON, OtpInput, PanelFx, demoRole, usePrefersReducedMotion, useTimers } from './authKit'

// Login for citizens and doctors (design: Login.dc.html).
// The forms are visual only in the alpha (CLAUDE.md rule 4: no real sign-in yet). "Verify and continue"
// and the demo links sign in as the demo citizen or demo doctor through POST /api/v1/auth/demo-login.

type Who = 'user' | 'doctor'
type Step = 'creds' | 'code'

const WORDS = ['connected.', 'protected.', 'understood.', 'in your hands.']
const WHO: Record<Who, { role: Role; label: string }> = {
  user: { role: 'CITIZEN', label: 'citizen' },
  doctor: { role: 'DOCTOR', label: 'doctor' },
}

function whoIcon(who: Who) {
  return who === 'user' ? ICON.user : ICON.doctor
}

export default function LoginScreen() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const reduced = usePrefersReducedMotion()
  const later = useTimers()

  const [who, setWho] = useState<Who>('user')
  const [step, setStep] = useState<Step>('creds')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const [bio, setBio] = useState(false)
  const [w, setW] = useState(0)
  const [key, setKey] = useState(482913)

  // Words and the sample key rotate only when the visitor has not asked for reduced motion.
  useEffect(() => {
    if (reduced) return
    const wt = window.setInterval(() => setW((n) => n + 1), 2800)
    const kt = window.setInterval(() => setKey(100000 + Math.floor(Math.random() * 900000)), 10000)
    return () => {
      window.clearInterval(wt)
      window.clearInterval(kt)
    }
  }, [reduced])

  const isUser = who === 'user'
  const word = reduced ? WORDS[0]! : WORDS[w % WORDS.length]!
  const keyCode = String(key).replace(/(\d{3})(\d{3})/, '$1 $2')

  function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    later(() => {
      setLoading(false)
      setStep('code')
    }, 900)
  }

  function enter(target: Who) {
    const cfg = WHO[target]
    login(cfg.role)
    navigate(demoRole(cfg.role).path)
  }

  function pick(next: Who) {
    setWho(next)
    setBio(false)
  }

  return (
    <AuthRoot title="Log in — CareFusion AI" bannerText="Sign-in forms are visual only in the alpha — use the demo links to enter a role.">
      <div className="au-split">
        <section
          className="cf-panel cf-panel-dark"
          aria-label="About CareFusion AI"
          style={{ position: 'relative', overflow: 'hidden', background: 'var(--primary)', color: 'var(--on-primary)', padding: '56px clamp(32px, 5vw, 72px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 40, minHeight: 640 }}
        >
          <PanelFx />
          <span className="au-drift" aria-hidden="true" style={{ position: 'absolute', width: 520, height: 520, borderRadius: 9999, background: '#86bdb8', opacity: 0.35, filter: 'blur(90px)', right: -180, top: -160 }} />
          <span className="au-drift" aria-hidden="true" style={{ position: 'absolute', width: 380, height: 380, borderRadius: 9999, background: '#c9a86a', opacity: 0.28, filter: 'blur(90px)', left: -120, bottom: -120, animationDelay: '-6s' }} />
          <svg aria-hidden="true" viewBox="0 0 64 64" width="440" height="440" style={{ position: 'absolute', right: -90, bottom: -110, opacity: 0.1 }}>
            <rect x="21" y="5" width="18" height="50" rx="9" fill="#faf5ef" />
            <rect x="9" y="25" width="50" height="18" rx="9" fill="#faf5ef" />
          </svg>

          <Link to="/" aria-label="CareFusion AI home" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 12, color: 'var(--on-primary)', textDecoration: 'none', alignSelf: 'flex-start' }}>
            <img src="/app-icon.svg" alt="" style={{ width: 44, height: 44 }} />
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 600 }}>CareFusion AI</span>
          </Link>

          <div className="au-stage" aria-hidden="true">
            <span className="au-ring r1" />
            <span className="au-ring r2" />
            <span className="au-ring r3" />
            <svg className="au-mark" viewBox="0 0 64 64" width="176" height="176">
              <rect className="au-cv" x="21" y="5" width="18" height="50" rx="9" fill="#86bdb8" />
              <rect className="au-ch" x="9" y="25" width="50" height="18" rx="9" fill="#d2b277" />
              <g className="au-core">
                <rect x="21" y="25" width="18" height="18" rx="2" fill="#faf5ef" opacity=".22" />
                <circle cx="30" cy="34" r="3.4" fill="#faf5ef" />
              </g>
            </svg>
            <div className="au-orbit-chips">
              <div className="au-chip au-c1">
                <span className="au-chip-k">Your key</span>
                <span className="au-chip-v">{keyCode}</span>
                <span className="au-bar"><span className="au-bar-in" /></span>
              </div>
              <div className="au-chip au-c2">
                <span className="au-chip-k">Doctor session</span>
                <span className="au-chip-v">30:00</span>
                <span className="au-chip-s">you can end it</span>
              </div>
              <div className="au-chip au-c3">
                <span className="au-chip-k">AI chat</span>
                <span className="au-chip-s">guidance only</span>
              </div>
              <div className="au-chip au-c4">
                <span className="au-chip-k">Access log</span>
                <span className="au-chip-s">every view recorded</span>
              </div>
            </div>
          </div>

          <div style={{ position: 'relative', maxWidth: 560 }}>
            <h1 className="au-rise-l" aria-label="Your health, connected." style={{ margin: '0 0 14px', fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px, 4.4vw, 60px)', lineHeight: 1.04, fontWeight: 600, letterSpacing: '-0.015em' }}>
              Your health,
              <br />
              <span aria-hidden="true" className={`au-word ${w % 2 ? 'au-wb' : 'au-wa'}`}>{word}</span>
            </h1>
            <p className="au-rise-l" style={{ margin: 0, fontSize: 18, lineHeight: '29px', opacity: 0.95, animationDelay: '120ms' }}>
              One sign-in for your health record — or, if you're a doctor, for the consultations you give.
            </p>
            <svg className="au-ecg-svg" viewBox="0 0 520 60" aria-hidden="true">
              <path className="au-ecg" d="M0 40 H150 L166 40 L178 18 L190 54 L204 6 L220 50 L232 40 H300 L312 30 L324 40 H520" fill="none" stroke="#faf5ef" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </section>

        <main id="au-main" className="au-form-col">
          <div className="au-form-inner">
            {step === 'creds' ? (
              <div className="au-fade" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div>
                  <h2 className="au-form-title">Log in</h2>
                  <p className="au-lead">Choose the account you want to open.</p>
                </div>
                <div role="radiogroup" aria-label="Account" className="au-who">
                  {(['user', 'doctor'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={who === k}
                      className={`au-who-o${who === k ? ' on' : ''}`}
                      onClick={() => pick(k)}
                    >
                      <span className="au-who-i" aria-hidden="true">
                        <Icon d={whoIcon(k)} size={22} />
                      </span>
                      <span>
                        <strong>{k === 'user' ? 'User' : 'Doctor'}</strong>
                        <span className="au-who-d">{k === 'user' ? 'My health record' : 'Consultations'}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <form style={{ display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={submit}>
                  {isUser ? (
                    <TextField key="id-user" label="Mobile number or email" prefix="+91" placeholder="98765 43210" autoComplete="username" required helper="First time on this device? We'll send a one-time code." />
                  ) : (
                    <TextField key="id-doc" label="Doctor username" placeholder="e.g. dr.arun.nair" autoComplete="username" required helper="This opens your doctor account, not your own health record." />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <TextField label="Password" type="password" autoComplete="current-password" required />
                    <Link to="/recovery" style={{ alignSelf: 'flex-end', fontSize: 13 }}>
                      Forgot password or lost phone?
                    </Link>
                  </div>
                  <Button type="submit" size="lg" fullWidth loading={loading}>
                    {loading ? 'Checking' : 'Log in'}
                  </Button>
                </form>
                {isUser ? (
                  <>
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      icon={<Icon d={ICON.face} size={18} />}
                      aria-describedby={bio ? 'au-bio-note' : undefined}
                      onClick={() => setBio(true)}
                    >
                      Use fingerprint or face ID
                    </Button>
                    {bio ? (
                      <p id="au-bio-note" role="status" style={{ margin: '-10px 0 0', fontSize: 13, color: 'var(--ink-muted)' }}>
                        Fingerprint and face ID are simulated in the alpha. Use the demo links below to open the citizen workspace.
                      </p>
                    ) : null}
                  </>
                ) : null}
                <p style={{ margin: 0, textAlign: 'center', color: 'var(--ink-muted)' }}>
                  {isUser ? 'New to CareFusion AI?' : 'Not registered as a doctor yet?'}{' '}
                  <Link to={isUser ? '/register' : '/register/doctor'}>{isUser ? 'Create new user' : 'Register as doctor'}</Link>
                </p>
              </div>
            ) : (
              <div className="au-fade" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <Button variant="ghost" size="sm" onClick={() => { setStep('creds'); setLoading(false) }} style={{ alignSelf: 'flex-start', paddingLeft: 4 }}>
                  ← Back
                </Button>
                <div>
                  <h2 className="au-form-title">{isUser ? 'Enter the code we sent' : 'Two-step verification'}</h2>
                  <p className="au-lead">
                    {isUser
                      ? 'A 6-digit code went to +91 ••••• 43210. After this you can switch to fingerprint or face ID.'
                      : 'Enter the 6-digit code from your authenticator app. Doctor accounts always need this step.'}
                  </p>
                </div>
                <OtpInput value={code} onChange={setCode} />
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>Didn't get it? You can resend in 0:24. Demo only: any code works.</p>
                <Button size="lg" fullWidth onClick={() => enter(who)}>
                  Verify and continue
                </Button>
              </div>
            )}

            <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="au-eyebrow" style={{ color: 'var(--ink-muted)' }}>Demo — skip sign-in</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                <button type="button" className="au-demo" onClick={() => enter('user')}>
                  <code style={{ color: 'var(--peach-text)' }}>CIT</code>Continue as citizen
                </button>
                <button type="button" className="au-demo" onClick={() => enter('doctor')}>
                  <code style={{ color: 'var(--primary-text)' }}>DOC</code>Continue as doctor
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 13 }}>
                Hospital staff or an administrator? Use the <Link to="/login/staff">Staff login</Link> or the{' '}
                <Link to="/login/admin">Admin login</Link>.
              </p>
            </div>
          </div>
        </main>
      </div>
    </AuthRoot>
  )
}

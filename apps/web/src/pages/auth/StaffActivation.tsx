import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Button, Stepper, TextField } from '../../components/ui'
import { AuthRoot, Blob, Eyebrow, Icon, ICON, Logo, PanelFx } from './authKit'

// Staff account activation (design: StaffActivation.dc.html). The invitation link is simulated:
// there is no activation endpoint in the alpha API, so nothing is saved. "Open my orders queue"
// signs in as the demo nurse through POST /api/v1/auth/demo-login.

const STEPS = ['Password', 'Two-step', 'Done']

export default function StaffActivationScreen() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [code, setCode] = useState('')

  const longEnough = pw.length >= 12
  const matches = pw.length > 0 && pw === pw2
  const canNext = step !== 0 || (longEnough && matches)

  const checks: [boolean, string][] = [
    [longEnough, 'At least 12 characters'],
    [pw.length > 0 && !/^(password|123456789012)/i.test(pw), 'Not found in leaked-password lists (simulated)'],
    [matches, 'Both entries match'],
  ]

  async function open() {
    if (await login('NURSE')) navigate('/nurse')
  }

  return (
    <AuthRoot title="Activate your account — CareFusion AI" bannerText="Activation links are simulated." theme="stf">
      <div className="au-split">
        <section className="cf-panel" aria-label="Your invitation" style={{ position: 'relative', overflow: 'hidden', background: 'var(--tint-peach)', padding: '56px clamp(32px, 5vw, 72px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 32, minHeight: 600 }}>
          <PanelFx />
          <Blob size={440} color="var(--tint-sage)" style={{ right: -160, bottom: -140 }} />
          <Logo to="/login/staff" label="CareFusion Staff Portal" style={{ position: 'relative', alignSelf: 'flex-start' }} />
          <div style={{ position: 'relative', maxWidth: 520 }}>
            <Eyebrow color="var(--peach-text)" style={{ marginBottom: 12 }}>You've been invited</Eyebrow>
            <h1 style={{ margin: '0 0 16px', fontFamily: 'var(--font-serif)', fontSize: 'clamp(38px, 4vw, 54px)', lineHeight: 1.05, fontWeight: 600, color: 'var(--ink-strong)' }}>Welcome to the team, Lekha.</h1>
            <p style={{ margin: 0, fontSize: 18, lineHeight: '29px' }}>Dr. Meera Krishnan created a <strong>Nurse</strong> account for you at Demo General Hospital, Pathanamthitta.</p>
          </div>
          <div style={{ position: 'relative', padding: 20, borderRadius: 18, background: 'rgba(250,245,239,.78)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ color: 'var(--ink)' }}>Invitation details</strong>
            <span style={{ fontSize: 14 }}>Staff ID <code>DEMO-ST-0412</code> · Ward 3, General medicine</span>
            <span style={{ fontSize: 14 }}>Link expires in 48 hours (demo)</span>
          </div>
        </section>

        <main id="au-main" className="au-form-col">
          <div className="au-form-inner">
            <Stepper label="Activation" steps={STEPS} current={step} />
            {step === 0 && (
              <div className="au-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <h2 className="au-h2" tabIndex={-1} style={{ margin: 0 }}>Create your password</h2>
                <TextField label="New password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
                <TextField label="Confirm password" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-live="polite">
                  {checks.map(([ok, text]) => (
                    <span key={text} className={`au-check ${ok ? 'ok' : 'no'}`}><i aria-hidden="true">{ok ? '✓' : '·'}</i>{text}<span className="cf-sr">{ok ? ' (met)' : ' (not met yet)'}</span></span>
                  ))}
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="au-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <h2 className="au-h2" style={{ margin: 0 }}>Turn on two-step verification</h2>
                <p className="au-lead">Scan this with an authenticator app, then enter the code it shows.</p>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                  <svg width="112" height="112" viewBox="0 0 21 21" role="img" aria-label="Authenticator QR (demo)" style={{ background: 'var(--surface)', borderRadius: 14, padding: 9, border: '1px solid var(--border)' }}>
                    <g fill="#3f5263"><path d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z" /></g>
                    <g fill="#f3eee8"><path d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z" /></g>
                    <g fill="#3f5263"><path d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2zM9 1h3v2H9zM8 5h2v3H8zM12 9h3v3h-3zM8 10h2v2H8zM16 9h4v2h-4zM9 14h2v4H9zM13 15h2v3h-2zM17 15h2v2h-2zM18 19h3v2h-3zM1 9h3v2H1z" /></g>
                  </svg>
                  <code style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: '20px' }}>Can't scan? Key:<br />DEMO 7K2Q MX4P 91LB</code>
                </div>
                <TextField label="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" helper="Demo only: the code is not checked." />
              </div>
            )}
            {step === 2 && (
              <div className="au-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
                <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--tint-sage)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={ICON.check} size={32} stroke="var(--success)" strokeWidth={2} />
                </span>
                <h2 tabIndex={-1} style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 32, lineHeight: '38px', fontWeight: 600, color: 'var(--ink-strong)' }}>Your account is active</h2>
                <p className="au-lead">Staff accounts are active as soon as you finish — no extra approval. Next time, sign in on the staff page.</p>
                <Button size="lg" fullWidth onClick={open}>Open my orders queue</Button>
              </div>
            )}
            {step < 2 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
                <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
                <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>{step === 1 ? 'Verify and activate' : 'Continue'}</Button>
              </div>
            ) : null}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>Not expecting this? Ignore it — the link expires on its own. Questions go to your hospital admin.</p>
          </div>
        </main>
      </div>
    </AuthRoot>
  )
}

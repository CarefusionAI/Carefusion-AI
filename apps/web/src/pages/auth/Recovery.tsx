import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, Button, Card, PageHeader, Select, Stepper, Tabs, TextField } from '../../components/ui'
import { AuthRoot, Logo, useTimers } from './authKit'

// Account recovery (design: Recovery.dc.html). Password reset and phone recovery are simulated in the
// alpha: there is no recovery endpoint, so no code is sent and nothing is changed.

const TABS = [
  { id: 'pw', label: 'Forgot password' },
  { id: 'phone', label: 'Lost or changed phone' },
]
const PW_STEPS = ['Find account', 'Code', 'New password']
const PW_LABELS = ['Send code', 'Verify code', 'Save password']
const DESKS = ['Demo General Hospital, Pathanamthitta — Help desk', 'Demo Taluk Hospital, Adoor — Help desk', 'ASHA worker, Ward 7 Adoor']

export default function RecoveryScreen() {
  const later = useTimers()
  const [mode, setMode] = useState<'pw' | 'phone'>('pw')
  const [pw, setPw] = useState(0)
  const [contact, setContact] = useState('')
  const [code, setCode] = useState('')
  const [newPw, setNewPw] = useState('')
  const [online, setOnline] = useState<'idle' | 'loading' | 'done'>('idle')
  const [desk, setDesk] = useState(DESKS[0]!)

  const disabled = (pw === 0 && contact.replace(/\D/g, '').length < 10 && !/^\S+@\S+\.\S+$/.test(contact)) || (pw === 1 && code.replace(/\D/g, '').length < 6) || (pw === 2 && newPw.length < 12)

  function startOnline() {
    setOnline('loading')
    later(() => setOnline('done'), 1400)
  }

  return (
    <AuthRoot title="Account recovery — CareFusion AI" bannerText="Aadhaar OTP and face check are mock connectors. No code is sent in the alpha." main={false}>
      <header style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 32px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Logo height={32} />
          <Link to="/login" style={{ fontSize: 14 }}>← Back to log in</Link>
        </div>
      </header>
      <main id="au-main" style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: '48px 32px 64px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <PageHeader eyebrow="Account recovery" title="Let's get you back in" subtitle="Choose what happened. Every recovery is recorded in your activity log." />
        <Tabs label="Recovery type" tabs={TABS} value={mode} onChange={(v) => setMode(v as 'pw' | 'phone')} />

        {mode === 'pw' ? (
          <div className="au-fade" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 28, alignItems: 'start' }}>
            <section className="au-way" aria-labelledby="pw-t" style={{ padding: 32 }}>
              <h2 id="pw-t" style={{ margin: 0, fontSize: 22, lineHeight: '30px', fontWeight: 600, color: 'var(--ink-strong)' }}>Reset your password</h2>
              <Stepper label="Reset steps" steps={PW_STEPS} current={Math.min(pw, 2)} />
              {pw === 0 ? <TextField label="Registered mobile or email" prefix="+91" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="username" placeholder="98765 43210" /> : null}
              {pw === 1 ? <TextField label="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" helper="Demo only: any 6 digits work. No code is sent." /> : null}
              {pw === 2 ? <TextField label="New password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" helper="At least 12 characters." /> : null}
              {pw === 3 ? (
                <Alert tone="success" title="Password changed (simulated)">
                  You've been signed out on other devices. <Link to="/login">Log in now</Link>
                </Alert>
              ) : null}
              {pw < 3 ? <Button size="lg" onClick={() => setPw((n) => n + 1)} disabled={disabled}>{PW_LABELS[pw]}</Button> : null}
            </section>
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Card tone="blue" eyebrow="Locked out?" title="After 5 wrong attempts">
                <p style={{ margin: 0, fontSize: 14 }}>Your account locks for 15 minutes, then unlocks by itself. Staff and admins can also ask their admin to reset it.</p>
              </Card>
              <Card padding="compact" title="Staff and admins">
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-muted)' }}>Resets also need your two-step code. Government admins recover through Jan Parichay.</p>
              </Card>
            </aside>
          </div>
        ) : (
          <div className="au-fade" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, alignItems: 'start' }}>
            <section className="au-way" aria-labelledby="ph-a" style={{ padding: 28, background: 'var(--tint-sage)', borderColor: 'transparent' }}>
              <div><Badge tone="success">Fastest</Badge></div>
              <h2 id="ph-a" style={{ margin: 0, fontSize: 22, lineHeight: '30px', fontWeight: 600, color: 'var(--ink-strong)' }}>Recover online on your new phone</h2>
              <div className="au-row"><span className="au-num">1</span><span>Verify with an <strong>Aadhaar OTP</strong> sent to your Aadhaar-linked number.</span></div>
              <div className="au-row"><span className="au-num">2</span><span>Do a <strong>live face check</strong> on the new phone.</span></div>
              <div className="au-row"><span className="au-num">3</span><span>Your <strong>old phone is logged out</strong> and your rotating key moves to this phone.</span></div>
              <div><Button size="lg" onClick={startOnline} loading={online === 'loading'} disabled={online === 'done'}>{online === 'done' ? 'Done' : 'Start online recovery'}</Button></div>
              {online === 'done' ? (
                <Alert tone="success" title="Phone moved (simulated)">
                  Old device "Redmi 9 (demo)" signed out. Your key now lives on this phone.
                </Alert>
              ) : null}
            </section>
            <section className="au-way" aria-labelledby="ph-b" style={{ padding: 28 }}>
              <div><Badge tone="peach">In person</Badge></div>
              <h2 id="ph-b" style={{ margin: 0, fontSize: 22, lineHeight: '30px', fontWeight: 600, color: 'var(--ink-strong)' }}>Get help at a hospital or from an ASHA worker</h2>
              <p style={{ margin: 0 }}>Bring any photo ID. Staff run the same Aadhaar and face checks for you, then move your account to the new phone — or print a health card if you don't have one.</p>
              <Select label="Nearest help desk" options={DESKS} value={desk} onChange={setDesk} />
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>Open 08:00–20:00 · No appointment needed</p>
            </section>
          </div>
        )}
      </main>
    </AuthRoot>
  )
}

import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getRoleConfig } from '../../config/roles'
import { Badge, Button } from '../../components/ui'
import { AuthRoot, LinkButton, Logo, PanelFx, loginPathFor } from './authKit'

// 403 screen (design: AccessDenied.dc.html). Shown by RequireAuth when a signed-in demo user opens a
// page that belongs to another role, and at /access-denied.

function refCode(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return `DEMO-403-${h.toString(16).toUpperCase().padStart(4, '0').slice(-4)}`
}

export default function AccessDeniedScreen() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const cfg = user ? getRoleConfig(user.role) : null
  const when = useMemo(() => new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), [])
  const loginPath = loginPathFor(user?.role)

  function signOut() {
    logout()
    navigate(loginPath)
  }

  return (
    <AuthRoot title="Access denied — CareFusion AI" bannerText="In the full system this attempt is written to the audit log." main={false}>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))' }}>
        <div className="cf-panel" aria-hidden="true" style={{ position: 'relative', overflow: 'hidden', background: 'var(--tint-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 420 }}>
          <PanelFx />
          <span style={{ position: 'absolute', width: 380, height: 380, borderRadius: 9999, background: 'var(--tint-lavender)', filter: 'blur(70px)', left: -80, top: -60 }} />
          <svg className="au-lock" width="220" height="260" viewBox="0 0 220 260" style={{ position: 'relative' }}>
            <path d="M60 110V78a50 50 0 0 1 100 0v32" fill="none" stroke="#86bdb8" strokeWidth="18" strokeLinecap="round" />
            <rect x="30" y="110" width="160" height="130" rx="36" fill="#faf5ef" />
            <rect x="30" y="110" width="160" height="130" rx="36" fill="none" stroke="#e4ddd6" strokeWidth="2" />
            <rect x="98" y="138" width="24" height="64" rx="12" fill="#5e9e98" />
            <rect x="78" y="158" width="64" height="24" rx="12" fill="#d2b277" />
            <rect x="98" y="158" width="24" height="24" fill="#3a726d" />
          </svg>
        </div>
        <main id="au-main" style={{ background: 'var(--surface-raised)', padding: '56px clamp(24px, 6vw, 96px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
          <Logo height={30} style={{ alignSelf: 'flex-start' }} />
          <div><Badge tone="danger" dot>Error 403</Badge></div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 46, lineHeight: '52px', fontWeight: 600, color: 'var(--ink-strong)' }}>This page isn't part of your role.</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: '28px', maxWidth: 560 }}>
            {cfg ? (
              <>You're signed in as <strong>{cfg.label}</strong>. Patient records open only through an order, admission mode or the patient's own key — so this link stays closed.</>
            ) : (
              <>You're not signed in with a role that can open this page. Patient records open only through an order, admission mode or the patient's own key — so this link stays closed.</>
            )}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Go back to the screens your role can use', 'Ask your hospital admin if you need different access', 'Signed in to the wrong account? Sign out and pick the right login page'].map((t) => (
              <li key={t} style={{ display: 'flex', gap: 10 }}><span aria-hidden="true" style={{ color: 'var(--success)', fontWeight: 700 }}>✓</span>{t}</li>
            ))}
          </ul>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {cfg ? (
              <>
                <LinkButton to={cfg.path} variant="primary" size="lg">Back to my {cfg.label.toLowerCase()} workspace</LinkButton>
                <Button variant="secondary" size="lg" onClick={signOut}>Sign out</Button>
              </>
            ) : (
              <>
                <LinkButton to="/login" variant="primary" size="lg">Log in</LinkButton>
                <LinkButton to="/" size="lg">Home</LinkButton>
              </>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>Reference <code>{refCode(pathname + (user?.role ?? ''))}</code> · {when}</p>
        </main>
      </div>
    </AuthRoot>
  )
}

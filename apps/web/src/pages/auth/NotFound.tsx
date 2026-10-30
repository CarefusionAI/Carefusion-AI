import { Link } from 'react-router-dom'
import { AuthRoot, Logo } from './authKit'

// 404 screen (design: NotFound.dc.html). Used as the router catch-all.

const NEXT: { to: string; badge: string; cls: string; text: string }[] = [
  { to: '/', badge: 'Home', cls: 'cf-badge-teal', text: 'CareFusion AI home page' },
  { to: '/login', badge: 'Log in', cls: 'cf-badge-info', text: 'Citizens and doctors' },
  { to: '/demo-signin', badge: 'Demo', cls: 'cf-badge-peach', text: "Open any role's workspace" },
  { to: '/recovery', badge: 'Help', cls: 'cf-badge-neutral', text: 'Lost phone or password' },
]

export default function NotFoundScreen() {
  return (
    <AuthRoot title="Page not found — CareFusion AI" bannerText="Alpha build." main={false}>
      <header style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 32px' }}><Logo height={32} /></div>
      </header>
      <main id="au-main" style={{ position: 'relative', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '56px 32px' }}>
        <span aria-hidden="true" style={{ position: 'absolute', width: 480, height: 480, borderRadius: 9999, background: 'var(--tint-peach)', filter: 'blur(90px)', right: '4%', top: -120 }} />
        <span aria-hidden="true" style={{ position: 'absolute', width: 420, height: 420, borderRadius: 9999, background: 'var(--tint-sage)', filter: 'blur(90px)', left: '2%', bottom: -160 }} />
        <div style={{ position: 'relative', width: '100%', maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: 56, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 120, lineHeight: 0.9, color: 'var(--primary-text)', letterSpacing: '-0.03em' }}>404</p>
            <h1 style={{ margin: 0, fontSize: 32, lineHeight: '40px', fontWeight: 600, color: 'var(--ink-strong)' }}>Page not found</h1>
            <p style={{ margin: 0, fontSize: 17, lineHeight: '28px', maxWidth: 480 }}>The page you were looking for has moved or no longer exists. Your records and appointments are safe.</p>
            <svg viewBox="0 0 560 120" role="img" aria-label="A calm heartbeat line" style={{ width: '100%', maxWidth: 520, height: 'auto' }}>
              <path className="au-ecg-draw" d="M0 80 H160 L178 80 L192 52 L206 104 L224 16 L244 100 L260 80 H320 L334 66 L348 80 H560" fill="none" stroke="#86bdb8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <circle className="au-dot-pulse" cx="556" cy="80" r="6" fill="#c9a86a" />
            </svg>
          </div>
          <nav aria-label="Where to next" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="au-eyebrow" style={{ color: 'var(--ink-muted)', margin: '0 0 4px' }}>Where to next</p>
            {NEXT.map((n) => (
              <Link key={n.to} to={n.to} className="au-qk">
                <span className={`cf-badge ${n.cls}`}>{n.badge}</span>
                {n.text}
              </Link>
            ))}
          </nav>
        </div>
      </main>
    </AuthRoot>
  )
}

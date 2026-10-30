import CfBackground from '../../components/CfBackground'
import { usePageTitle } from './authKit'
import './auth.css'

// Splash / loading screen (design: Splash.dc.html). Also usable as a full-page loading state.

export default function SplashScreen() {
  usePageTitle('CareFusion AI')
  return (
    <main
      className="cf-root au-root"
      aria-busy="true"
      style={{ position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 36, padding: '48px 24px', boxSizing: 'border-box' }}
    >
      <CfBackground theme="pub" />
      <span aria-hidden="true" style={{ position: 'absolute', width: 560, height: 560, borderRadius: 9999, background: 'var(--tint-sage)', filter: 'blur(100px)', left: '10%', top: -160 }} />
      <span aria-hidden="true" style={{ position: 'absolute', width: 480, height: 480, borderRadius: 9999, background: 'var(--tint-lavender)', filter: 'blur(100px)', right: '8%', bottom: -160 }} />
      <svg role="img" aria-label="CareFusion AI" width="132" height="132" viewBox="0 0 64 64" style={{ position: 'relative' }}>
        <rect className="au-cap-v" x="21" y="5" width="18" height="50" rx="9" fill="#5e9e98" />
        <rect className="au-cap-h" x="9" y="25" width="50" height="18" rx="9" fill="#d2b277" />
        <g className="au-splash-core">
          <rect x="21" y="25" width="18" height="18" rx="2" fill="#3a726d" />
          <circle cx="30" cy="34" r="3.2" fill="#faf5ef" />
        </g>
      </svg>
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-serif)', fontSize: 44, lineHeight: '50px', fontWeight: 600, color: 'var(--ink-strong)' }}>CareFusion AI</p>
        <p style={{ margin: 0, fontSize: 17, lineHeight: '28px', color: 'var(--ink-body)' }}>Your health, connected.</p>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div role="progressbar" aria-label="Loading" style={{ width: 240, height: 4, borderRadius: 9999, background: 'var(--surface-cream)', overflow: 'hidden' }}>
          <div className="au-splash-bar" style={{ width: '40%', height: '100%', borderRadius: 9999, background: 'var(--primary-soft)' }} />
        </div>
        <p aria-live="polite" style={{ margin: 0, fontSize: 14, color: 'var(--ink-muted)' }}>Preparing your workspace…</p>
      </div>
      <p style={{ position: 'absolute', bottom: 24, margin: 0, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--warning)' }}>Synthetic demo data</p>
    </main>
  )
}

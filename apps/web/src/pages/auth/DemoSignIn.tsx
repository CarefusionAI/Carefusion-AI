import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AuthRoot, Blob, DEMO_ROLES, Eyebrow, Icon, ICON, LinkButton, Logo, RoleCode } from './authKit'
import type { DemoRole } from './authKit'

// Internal demo launcher (design: DemoSignIn.dc.html). Not linked from the public site.
// Picking a role calls POST /api/v1/auth/demo-login (through AuthContext.login) and opens that role's home.

const GROUPS: { id: string; title: DemoRole['group'] }[] = [
  { id: 'g1', title: 'Citizens' },
  { id: 'g2', title: 'Medical staff' },
  { id: 'g3', title: 'Pharmacy' },
  { id: 'g4', title: 'Administrators' },
]

const REAL_PAGES = [
  { to: '/login', label: 'Citizens and doctors' },
  { to: '/login/staff', label: 'Nurses, lab, radiology, pharmacists' },
  { to: '/login/admin', label: 'Hospital, pharmacy & government admins' },
]

export default function DemoSignInScreen() {
  const { login } = useAuth()
  const navigate = useNavigate()

  function pick(r: DemoRole) {
    login(r.role)
    navigate(r.path)
  }

  return (
    <AuthRoot title="Demo sign-in — choose a role" bannerText="Demo sign-in skips passwords and is never part of a production build.">
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap' }}>
        <aside
          aria-label="About the demo"
          style={{ flex: '1 1 380px', maxWidth: 520, position: 'relative', overflow: 'hidden', background: 'var(--surface-raised)', borderRight: '1px solid var(--border)', padding: '48px 48px 40px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28 }}
        >
          <Blob size={420} color="var(--tint-sage)" style={{ left: -160, bottom: -160 }} />
          <Logo style={{ position: 'relative', alignSelf: 'flex-start' }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Eyebrow color="var(--accent-text)">Alpha demo</Eyebrow>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 44, lineHeight: '50px', fontWeight: 600, color: 'var(--ink-strong)', letterSpacing: '-0.01em' }}>Who are you signing in as today?</h1>
            <p style={{ margin: 0, fontSize: 17, lineHeight: '28px' }}>
              Pick any of the twelve roles to open its workspace with synthetic data. In the real product each role signs in on its own page with a password and two-step verification.
            </p>
          </div>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)' }}>Prefer the real sign-in pages?</p>
            {REAL_PAGES.map((p) => (
              <LinkButton key={p.to} to={p.to} style={{ justifyContent: 'space-between', height: 'auto', minHeight: 44, paddingTop: 10, paddingBottom: 10, textAlign: 'left', whiteSpace: 'normal', gap: 12 }}>
                {p.label}
                <span aria-hidden="true"> →</span>
              </LinkButton>
            ))}
          </div>
        </aside>

        <main id="au-main" style={{ flex: '999 1 560px', minWidth: 0, padding: '48px 56px 64px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 32 }}>
            {GROUPS.map((g, gi) => (
              <section key={g.id} className="au-rise" aria-labelledby={g.id} style={{ animationDelay: `${gi * 60}ms` }}>
                <h2 id={g.id} className="au-grp">
                  {g.title}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
                  {DEMO_ROLES.filter((r) => r.group === g.title).map((r) => (
                    <button key={r.role} type="button" className="au-role" onClick={() => pick(r)}>
                      <RoleCode code={r.code} bg={r.bg} color={r.color} />
                      <span>
                        <strong style={{ display: 'block', color: 'var(--ink)', fontSize: 16 }}>{r.label}</strong>
                        <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{r.who}</span>
                      </span>
                      <span className="au-go">
                        <Icon d={ICON.arrowRight} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>
              Every demo sign-in is written to the audit log as <code>auth.demo_login</code>.
            </p>
          </div>
        </main>
      </div>
    </AuthRoot>
  )
}

import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AIInsight, Avatar, Badge } from '../../components/ui'
import { AuthRoot, Icon, ICON, LinkButton, Logo } from './authKit'

// Landing page (design: Main.dc.html). Public, no sign-in needed.

const eyebrow: CSSProperties = { margin: 0, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }
const wrap: CSSProperties = { maxWidth: 1240, margin: '0 auto' }

function Tick({ children }: { children: ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Icon d={ICON.check} size={18} stroke="var(--success)" strokeWidth={2} />
      {children}
    </li>
  )
}

function Step({ n, bg, color, title, children }: { n: number; bg: string; color: string; title: string; children: ReactNode }) {
  return (
    <li className="cf-card cf-card-default" style={{ display: 'flex', gap: 18 }}>
      <span className="au-step-n" style={{ background: bg, color }}>
        {n}
      </span>
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, color: 'var(--ink)' }}>{title}</h3>
        <p style={{ margin: 0 }}>{children}</p>
      </div>
    </li>
  )
}

function Fact({ term, big, small }: { term: string; big: string; small: string }) {
  return (
    <div>
      <dt style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{term}</dt>
      <dd style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 600, color: 'var(--ink-strong)' }}>
        {big}
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-muted)' }}> · {small}</span>
      </dd>
    </div>
  )
}

function DoctorPoint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="au-role-link">
      <strong style={{ fontSize: 18, color: 'var(--ink)' }}>{title}</strong>
      <span>{children}</span>
    </div>
  )
}

function FooterLinks({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <nav aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
      <strong style={{ color: 'var(--ink)' }}>{title}</strong>
      {children}
    </nav>
  )
}

export default function MainScreen() {
  return (
    <AuthRoot title="CareFusion AI — Your health, connected" bannerText="This alpha uses simulated people, records and AI results. DEMO-0000 IDs are not real Aadhaar or ABHA numbers.">
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(243, 238, 232, 0.86)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ ...wrap, padding: '14px 32px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 40px' }}>
          <Logo />
          <nav aria-label="Main" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 28px', flex: '1 1 auto' }}>
            <a className="au-nl" href="#privacy">Your record, your key</a>
            <a className="au-nl" href="#ai">AI that shows its work</a>
            <a className="au-nl" href="#roles">For doctors</a>
            <a className="au-nl" href="#help">Help</a>
          </nav>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <LinkButton to="/login">Log in</LinkButton>
            <LinkButton to="/register" variant="primary">Create account</LinkButton>
          </div>
        </div>
      </header>

      <main id="au-main" style={{ flex: 1 }}>
        <section aria-labelledby="hero-title" style={{ position: 'relative', overflow: 'hidden' }}>
          <span className="au-orb" aria-hidden="true" style={{ width: 520, height: 520, background: 'var(--tint-sage)', right: '6%', top: -120 }} />
          <span className="au-orb" aria-hidden="true" style={{ width: 420, height: 420, background: 'var(--tint-lavender)', right: '30%', top: 260 }} />
          <span className="au-orb" aria-hidden="true" style={{ width: 360, height: 360, background: 'var(--tint-peach)', left: -120, bottom: -160 }} />
          <div style={{ ...wrap, position: 'relative', padding: '96px 32px 120px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: 72, alignItems: 'center' }}>
            <div className="au-rise" style={{ display: 'flex', flexDirection: 'column', gap: 28, alignItems: 'flex-start' }}>
              <span className="cf-badge cf-badge-teal" style={{ padding: '6px 14px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.5 3h3a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19.5v-15A1.5 1.5 0 0 1 10.5 3zM4.5 9h15A1.5 1.5 0 0 1 21 10.5v3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 13.5v-3A1.5 1.5 0 0 1 4.5 9z" />
                </svg>
                One national health record, with AI that assists — never decides
              </span>
              <h1 id="hero-title" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 'clamp(48px, 6.4vw, 84px)', lineHeight: 1.0, letterSpacing: '-0.02em', color: 'var(--ink-strong)' }}>
                Your health,
                <br />
                <span style={{ color: 'var(--primary-text)' }}>connected.</span>
              </h1>
              <p style={{ margin: 0, fontSize: 19, lineHeight: '31px', color: 'var(--ink-body)', maxWidth: 520 }}>
                Keep every report, prescription and scan in one place. Share it with a doctor using a key that changes every ten seconds — and end the session whenever you choose.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <LinkButton to="/register" variant="primary" size="lg">Create your health account</LinkButton>
                <LinkButton to="/login" size="lg">Log in</LinkButton>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '10px 24px', color: 'var(--ink-muted)', fontSize: 14 }}>
                <Tick>Free for every citizen</Tick>
                <Tick>Every access logged</Tick>
                <Tick>Works with a basic phone too</Tick>
              </ul>
            </div>

            <div role="img" aria-label="Preview: a rotating session key, an AI guidance card, home vitals and an appointment" style={{ position: 'relative', minHeight: 520 }}>
              <div className="au-float-a" style={{ position: 'absolute', left: '4%', top: 0, width: '62%', padding: 26, borderRadius: 24, background: 'var(--primary)', color: 'var(--on-primary)', boxShadow: '0 30px 60px rgba(58, 114, 109, 0.28)' }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, opacity: 0.9 }}>Share with doctor</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <div>
                    <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 30, lineHeight: '38px', letterSpacing: '.12em', fontWeight: 500 }}>482 913</p>
                    <p style={{ margin: '6px 0 0', fontSize: 13 }}>New key in 10 s · opens 30 min</p>
                  </div>
                  <svg width="84" height="84" viewBox="0 0 21 21" aria-hidden="true" style={{ background: '#faf5ef', borderRadius: 12, padding: 7, flex: 'none' }}>
                    <g fill="#3f5263"><path d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z" /></g>
                    <g fill="#faf5ef"><path d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z" /></g>
                    <g fill="#3f5263"><path d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2zM9 1h2v2H9zM8 4h3v2H8zM12 8h2v3h-2zM9 9h2v2H9zM15 9h3v2h-3zM8 13h2v3H8zM11 15h3v2h-3zM16 14h2v4h-2zM19 19h2v2h-2zM12 18h2v3h-2zM1 9h3v2H1z" /></g>
                  </svg>
                </div>
                <div style={{ marginTop: 16, height: 4, borderRadius: 9999, background: 'rgba(250, 245, 239, .25)', overflow: 'hidden' }}>
                  <div className="au-keybar" style={{ height: '100%', background: 'var(--accent)' }} />
                </div>
              </div>

              <div className="au-float-b" style={{ position: 'absolute', right: 0, top: 140, width: '56%', padding: 22, borderRadius: 20, background: 'var(--tint-lavender)', boxShadow: 'var(--shadow-lift)' }}>
                <p style={{ margin: '0 0 10px', display: 'inline-flex', gap: 6, alignItems: 'center', padding: '2px 10px', borderRadius: 9999, background: 'var(--surface-raised)', color: 'var(--ai)', fontSize: 12, fontWeight: 600 }}>AI Health Chat · guidance only · simulated AI output</p>
                <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--ink-strong)' }}>“I've had a mild fever since my booster.”</p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>A low fever for a day or two is common after a vaccine. Rest and drink fluids. If it lasts beyond 48 hours, see a doctor.</p>
              </div>

              <div className="au-float-c" style={{ position: 'absolute', left: 0, bottom: 30, width: '44%', padding: 20, borderRadius: 20, background: 'var(--tint-sage)', boxShadow: 'var(--shadow-card)' }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--success)' }}>Home vitals · self-reported</p>
                <p style={{ margin: 0, fontSize: 30, lineHeight: '38px', fontWeight: 600, color: 'var(--ink-strong)', fontVariantNumeric: 'tabular-nums' }}>
                  118<span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>/</span>76
                </p>
                <svg viewBox="0 0 160 36" width="100%" height="36" aria-hidden="true">
                  <path d="M0 26 C20 20 30 30 50 22 S80 10 100 18 S130 28 160 12" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>

              <div className="au-float-a" style={{ position: 'absolute', right: '6%', bottom: 0, width: '46%', padding: 20, borderRadius: 20, background: 'var(--surface-raised)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lift)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Avatar name="Dr. Arun Nair" size={40} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)' }}>Dr. Arun Nair</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>General medicine · Tue 21 Oct, 10:30</p>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Badge tone="success" dot>Confirmed by hospital</Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Platform facts" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
          <dl style={{ ...wrap, padding: '36px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 28, margin: '0 auto' }}>
            <Fact term="Hospitals connected" big="42" small="demo" />
            <Fact term="Doctor session length" big="30 min" small="you can end it" />
            <Fact term="Pilot" big="Kerala" small="Pathanamthitta, Kottayam" />
            <Fact term="Languages at launch" big="English" small="Malayalam, Hindi next" />
          </dl>
        </section>

        <section id="privacy" className="au-sec" aria-labelledby="privacy-title" style={{ ...wrap, padding: '112px 32px 56px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: 56, alignItems: 'start' }}>
          <div style={{ position: 'sticky', top: 120, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ ...eyebrow, color: 'var(--accent-text)' }}>Your record, your key</p>
            <h2 id="privacy-title" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 44, lineHeight: '50px', fontWeight: 600, color: 'var(--ink-strong)', letterSpacing: '-0.01em' }}>Nobody opens your record without you.</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: '28px' }}>A doctor needs the key on your phone — or your health card and a code sent to your basic phone. Every view is logged, and you see the history.</p>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Step n={1} bg="var(--tint-teal)" color="var(--primary-text)" title="Show your rotating key">A QR and a 6-digit number that change every 10 seconds, used once.</Step>
            <Step n={2} bg="var(--tint-blue)" color="var(--info)" title="One doctor, thirty minutes">They can read and add notes, never edit or delete. You can end the session early.</Step>
            <Step n={3} bg="var(--tint-peach)" color="var(--peach-text)" title="Emergencies need your contact">If you can't share, your emergency contact approves on their phone. Break-glass access is reviewed twice.</Step>
            <Step n={4} bg="var(--tint-sage)" color="var(--success)" title="See who looked, and when">Your access history lists every session. The log can't be edited by anyone.</Step>
          </ol>
        </section>

        <section id="ai" className="au-sec" aria-labelledby="ai-title" style={{ ...wrap, padding: '56px 32px 112px' }}>
          <div style={{ borderRadius: 28, background: 'var(--surface-raised)', border: '1px solid var(--border)', padding: 56, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 48, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ ...eyebrow, color: 'var(--ai)' }}>AI that shows its work</p>
              <h2 id="ai-title" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 40, lineHeight: '46px', fontWeight: 600, color: 'var(--ink-strong)' }}>Evidence first. The doctor decides.</h2>
              <p style={{ margin: 0, fontSize: 17, lineHeight: '28px' }}>
                Four tools — symptoms, medical images, genomics and vital-sign trends — propose hypotheses. Each is checked against guidelines and research, labelled VERIFIED, SUPPORTED WITH CAUTION or UNCERTAIN, and reviewed by a doctor before you ever see it.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Badge tone="ai">Symptom engine</Badge>
                <Badge tone="ai">Image analysis</Badge>
                <Badge tone="ai">Genomic analysis</Badge>
                <Badge tone="ai">Temporal analysis</Badge>
              </div>
            </div>
            <AIInsight
              module="Image analysis"
              status="caution"
              title="Possible right lower-lobe opacity"
              confidence={0.67}
              evidence={['NIH chest X-ray reference set', 'ICMR guideline: community-acquired pneumonia']}
              reviewed
              reviewedBy="Dr. Arun Nair"
            >
              <p style={{ margin: 0 }}>One supporting source. The doctor agreed: “Consistent with examination; chest X-ray repeat in 2 weeks.”</p>
            </AIInsight>
          </div>
        </section>

        <section id="roles" className="au-sec" aria-labelledby="roles-title" style={{ background: 'var(--surface-cream)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ ...wrap, padding: '96px 32px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 36 }}>
              <div style={{ maxWidth: 640 }}>
                <p style={{ ...eyebrow, color: 'var(--accent-text)', marginBottom: 8 }}>For doctors</p>
                <h2 id="roles-title" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 40, lineHeight: '46px', fontWeight: 600, color: 'var(--ink-strong)' }}>Consult with the whole record — and an assistant that cites its sources</h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <LinkButton to="/register/doctor">Register as a doctor</LinkButton>
                <LinkButton to="/login" variant="primary">Doctor login</LinkButton>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16 }}>
              <DoctorPoint title="Scan the patient's key">Thirty minutes with the full record — history, scans, lab reports — logged and time-limited.</DoctorPoint>
              <DoctorPoint title="Four AI tools">Symptoms, images, genomics and vital-sign trends, each with evidence and a status you agree or disagree with.</DoctorPoint>
              <DoctorPoint title="e-Signed prescriptions">Generic names, allergy and interaction warnings, live stock, and a verifiable QR.</DoctorPoint>
              <DoctorPoint title="Voice notes">Dictate; check the text; save it to the record. Your words, never edited by the AI.</DoctorPoint>
            </div>
          </div>
        </section>

        <section aria-labelledby="cta-title" style={{ ...wrap, padding: '112px 32px' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, background: 'var(--primary)', color: 'var(--on-primary)', padding: '64px 56px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 32 }}>
            <svg aria-hidden="true" width="360" height="360" viewBox="0 0 64 64" style={{ position: 'absolute', right: -60, top: -80, opacity: 0.16 }}>
              <rect x="21" y="5" width="18" height="50" rx="9" fill="#faf5ef" />
              <rect x="9" y="25" width="50" height="18" rx="9" fill="#faf5ef" />
            </svg>
            <div style={{ position: 'relative', maxWidth: 620 }}>
              <h2 id="cta-title" style={{ margin: '0 0 12px', fontFamily: 'var(--font-serif)', fontSize: 46, lineHeight: '52px', fontWeight: 600 }}>Your health, connected.</h2>
              <p style={{ margin: 0, fontSize: 18, lineHeight: '28px' }}>Register with Aadhaar e-KYC and a quick face check. It takes about five minutes, and your ABHA health ID is linked for you.</p>
            </div>
            <Link to="/register" className="cf-btn cf-btn-lg" style={{ position: 'relative', background: '#faf5ef', color: 'var(--primary-text)' }}>
              <span className="cf-btn-label">Create your health account</span>
            </Link>
          </div>
        </section>
      </main>

      <footer id="help" className="au-sec" style={{ background: 'var(--surface-raised)', borderTop: '1px solid var(--border)' }}>
        <div style={{ ...wrap, padding: '56px 32px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Logo height={30} style={{ alignSelf: 'flex-start' }} />
            <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 14, lineHeight: '21px' }}>A unified medical-affairs platform for citizens and care providers. Alpha demo on synthetic data.</p>
          </div>
          <FooterLinks label="Sign in" title="Account">
            <Link to="/login">Log in</Link>
            <Link to="/recovery">Recover access</Link>
          </FooterLinks>
          <FooterLinks label="Register" title="Register">
            <Link to="/register">Citizen</Link>
            <Link to="/register/doctor">Doctor</Link>
          </FooterLinks>
          <FooterLinks label="Support" title="Support">
            <Link to="/recovery">Lost phone or password</Link>
            <a href="#help">Privacy notice</a>
            <a href="#help">Accessibility</a>
          </FooterLinks>
        </div>
        <div style={{ ...wrap, padding: '16px 32px 32px', color: 'var(--ink-muted)', fontSize: 13, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
          <span>© 2026 CareFusion AI · Alpha</span>
          <span>Government integrations shown are mock connectors.</span>
        </div>
      </footer>
    </AuthRoot>
  )
}

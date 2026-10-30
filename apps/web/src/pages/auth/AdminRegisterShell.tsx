import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, Stepper } from '../../components/ui'
import { AuthRoot, Logo } from './authKit'

// Frame shared by the hospital-admin and pharmacy-admin registration screens:
// header, page title, stepper, form card with Back / Continue, and a side column.

export default function AdminRegisterShell({
  title,
  pageTitle,
  eyebrow,
  subtitle,
  bannerText,
  steps,
  step,
  atLast,
  blocked,
  busy,
  nextLabel,
  onBack,
  onNext,
  aside,
  children,
}: {
  title: string
  pageTitle: string
  eyebrow: string
  subtitle: string
  bannerText: string
  steps: string[]
  step: number
  atLast: boolean
  blocked: boolean
  busy: boolean
  nextLabel: string
  onBack: () => void
  onNext: () => void
  aside: ReactNode
  children: ReactNode
}) {
  const form = useRef<HTMLElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    form.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus()
  }, [step])

  return (
    <AuthRoot title={title} bannerText={bannerText} main={false}>
      <header style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 32px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Logo height={32} label="CareFusion Admin Console" to="/login/admin" />
          <p style={{ margin: 0, fontSize: 14 }}>
            Already approved? <Link to="/login/admin">Admin login</Link>
          </p>
        </div>
      </header>

      <main id="au-main" style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: '40px 32px 56px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <PageHeader eyebrow={eyebrow} title={pageTitle} subtitle={subtitle} />
        <Stepper label="Registration progress" steps={steps} current={step} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
          <section ref={form} aria-label="Form" style={{ flex: '999 1 600px', minWidth: 0, background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 24, boxShadow: 'var(--shadow-card)', padding: 36, boxSizing: 'border-box' }}>
            {children}
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              {atLast ? <span /> : <Button variant="ghost" onClick={onBack} disabled={step === 0 || busy}>Back</Button>}
              {atLast ? null : (
                <Button size="lg" onClick={onNext} disabled={blocked} loading={busy}>
                  {nextLabel}
                </Button>
              )}
            </div>
          </section>
          <aside aria-label="Checklist" style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {aside}
          </aside>
        </div>
      </main>
    </AuthRoot>
  )
}

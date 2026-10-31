import { useEffect, useRef, useState, type FormEvent } from 'react'

/** Asks for a role's reviewer password (shown only when the API says that role needs one). */
export default function ReviewerPasswordPrompt({
  roleLabel,
  error,
  busy,
  askPassword,
  onSubmit,
  onCancel,
}: {
  roleLabel: string
  error: string | null
  busy: boolean
  askPassword: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
}) {
  const [pw, setPw] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (pw && !busy) onSubmit(pw)
  }

  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(36,50,61,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="rp-title"
        onSubmit={submit}
        style={{ width: 'min(420px, 100%)', background: 'var(--surface-raised, #fffaf4)', color: 'var(--ink, #3f5263)', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <h2 id="rp-title" style={{ margin: 0, fontFamily: 'var(--font-serif, serif)', fontSize: 22 }}>
          {askPassword ? `Reviewer password for ${roleLabel}` : `Could not sign in as ${roleLabel}`}
        </h2>
        {askPassword ? (
          <>
            <p style={{ margin: 0, fontSize: 15, lineHeight: '22px' }}>
              This role is protected in the live demo. Enter the password you were given for it.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600 }}>
              Password
              <input
                ref={input}
                type="password"
                autoComplete="off"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'rp-err' : undefined}
                style={{ height: 44, padding: '0 12px', fontSize: 16, borderRadius: 10, border: '1px solid var(--border, #cfc6ba)' }}
              />
            </label>
          </>
        ) : null}
        {error ? <p id="rp-err" role="alert" style={{ margin: 0, color: 'var(--danger-text, #8a2f2f)', fontSize: 14 }}>{error}</p> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid var(--border, #cfc6ba)', background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
            {askPassword ? 'Cancel' : 'Close'}
          </button>
          {askPassword ? (
            <button type="submit" disabled={!pw || busy} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 0, background: 'var(--primary, #3a726d)', color: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 600, opacity: !pw || busy ? 0.6 : 1 }}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}

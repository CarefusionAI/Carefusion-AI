import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Alert, Button, TextField } from './ui'
import CfBackground from './CfBackground'

type State = 'checking' | 'open' | 'locked'

/**
 * Optional access-code screen for a shared demo. The API says whether a code is required
 * (GET /api/v1/access/status); when it is not, or the API is unreachable, the app opens as normal.
 */
export default function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/v1/access/status', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { required: false, granted: true }))
      .then((s: { required: boolean; granted: boolean }) => live && setState(s.required && !s.granted ? 'locked' : 'open'))
      .catch(() => live && setState('open'))
    return () => {
      live = false
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code }),
      })
      if (res.ok) {
        setState('open')
        return
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setError(body.message ?? 'That code is not right.')
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'open') return <>{children}</>
  if (state === 'checking') return <div role="status" aria-label="Loading" style={{ minHeight: '100vh' }} />

  return (
    <div className="cf-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <CfBackground theme="pub" />
      <main
        style={{ width: '100%', maxWidth: 440, background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 24, padding: 32, boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <img src="/logo.svg" alt="CareFusion AI" style={{ height: 32, width: 'auto', alignSelf: 'flex-start' }} />
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 28, lineHeight: '34px', color: 'var(--ink-strong)' }}>Private demo</h1>
          <p style={{ margin: '8px 0 0' }}>This alpha demo is shared with invited people only. Enter the access code you were given.</p>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField label="Access code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoFocus />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" loading={busy} disabled={code.trim().length === 0}>Open the demo</Button>
        </form>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>Synthetic demo data only. No real patient information.</p>
      </main>
    </div>
  )
}

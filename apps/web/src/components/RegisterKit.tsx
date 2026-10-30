import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { apiFetch } from '../lib/api'

// Shared building blocks for the role registration wizards (doctor, hospital admin, pharmacy admin).
// Styling matches RegisterCitizenPage. All government services are mock connectors.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST JSON and return the parsed body even on 4xx/5xx (the API sends { message } or errorMessage).
export async function post<T>(path: string, body: unknown): Promise<T & { message?: string; errorMessage?: string }> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && !data.errorMessage && !data.message) data.errorMessage = `Request failed (${res.status})`
  return data
}

export const btnPrimary =
  'rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50'
export const btnGhost =
  'rounded-lg border border-border-strong bg-surface-raised px-4 py-2.5 text-sm font-semibold text-ink transition-colors disabled:opacity-50'
export const inputCls =
  'mt-1 block w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink-strong placeholder:text-ink-muted focus:border-primary focus:outline-none'

export const Spinner = () => (
  <span
    role="status"
    aria-label="Loading"
    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
  />
)

export const Alert = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger-text">
    {children}
  </p>
)

export const Notice = ({ children }: { children: ReactNode }) => (
  <p role="status" className="rounded-lg border border-warning-soft bg-warning-soft px-3 py-2 text-sm text-warning-text">
    {children}
  </p>
)

export const Success = ({ children }: { children: ReactNode }) => (
  <p role="status" className="rounded-lg border border-ok-soft bg-ok-soft px-3 py-2 text-sm font-semibold text-ok-text">
    {children}
  </p>
)

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-strong">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export const Input = ({ label, hint, ...rest }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <Field label={label} hint={hint}>
    {(id) => <input id={id} className={inputCls} {...rest} />}
  </Field>
)

export function StepIndicator({ steps, step }: { steps: string[]; step: number }) {
  return (
    <ol aria-label="Registration progress" className="flex items-center">
      {steps.map((name, i) => {
        const done = i < step
        const active = i === step
        return (
          <li key={name} className="flex flex-1 items-center last:flex-none" aria-current={active ? 'step' : undefined}>
            <span
              title={name}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                done
                  ? 'border-primary bg-primary text-white'
                  : active
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border bg-surface-raised text-ink-muted'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            {i < steps.length - 1 && <span className={`mx-1 h-0.5 flex-1 ${done ? 'bg-primary' : 'bg-border'}`} />}
          </li>
        )
      })}
    </ol>
  )
}

/** Card with the CareFusion header used by the registration wizards. */
export function RegisterShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg">
      <div
        className="cf-card overflow-hidden rounded-xl border shadow-card"
        style={{
          background: 'rgba(250,245,239,.92)',
          borderColor: 'rgba(83,101,120,.13)',
        }}
      >
        <div className="px-6 pb-4 pt-6">
          <span className="text-lg font-semibold tracking-tight" style={{ color: '#3f5263' }}>
            CareFusion<span style={{ color: '#3a726d' }}> AI</span>
          </span>
          <h1 className="mt-4 font-serif text-2xl font-semibold" style={{ color: '#3f5263' }}>
            {title}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#586470' }}>
            {subtitle} &middot; synthetic demo data only
          </p>
        </div>
        <div className="space-y-5 px-6 pb-6">{children}</div>
      </div>
    </div>
  )
}

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
  'rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50'
export const btnGhost =
  'rounded-md border border-primary-200 bg-white px-4 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 disabled:opacity-50'
export const inputCls =
  'mt-1 block w-full rounded-md border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 placeholder:text-primary-300 focus:border-primary focus:outline-none'

export const Spinner = () => (
  <span
    role="status"
    aria-label="Loading"
    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
  />
)

export const Alert = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
    {children}
  </p>
)

export const Notice = ({ children }: { children: ReactNode }) => (
  <p role="status" className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-600">
    {children}
  </p>
)

export const Success = ({ children }: { children: ReactNode }) => (
  <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
    {children}
  </p>
)

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-primary-800">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-primary-500">{hint}</p>}
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
                    : 'border-primary-200 bg-white text-primary-300'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            {i < steps.length - 1 && <span className={`mx-1 h-0.5 flex-1 ${done ? 'bg-primary' : 'bg-primary-100'}`} />}
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
      <div className="rounded-lg border border-primary-200 bg-white shadow-sm">
        <div className="rounded-t-lg border-b-4 border-accent bg-primary px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded bg-accent text-sm font-bold text-accent-foreground">CF</span>
            <div>
              <p className="text-lg font-bold leading-tight">CareFusion AI</p>
              <p className="text-xs text-primary-100">Unified Medical Affairs Platform</p>
            </div>
          </div>
          <h1 className="mt-4 text-xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-primary-100">{subtitle} &middot; synthetic demo data only</p>
        </div>
        <div className="space-y-5 p-6">{children}</div>
      </div>
    </div>
  )
}

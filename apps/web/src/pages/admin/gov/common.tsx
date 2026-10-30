import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Widget } from '@carefusion/shared'
import { Alert, Button, EmptyState, Modal, Skeleton, Textarea } from '../../../components/ui'
import { govErrorText } from '../../../api/gov'

// ---------------------------------------------------------------- toasts

interface ToastItem {
  id: number
  text: string
  error: boolean
}

interface ToastApi {
  toast: (text: string, opts?: { error?: boolean }) => void
}

const ToastContext = createContext<ToastApi>({ toast: () => undefined })

export const useGovToast = () => useContext(ToastContext).toast

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const next = useRef(1)
  const timers = useRef<number[]>([])

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const toast = useCallback(
    (text: string, opts?: { error?: boolean }) => {
      const id = next.current++
      setItems((l) => [...l.slice(-3), { id, text, error: !!opts?.error }])
      timers.current.push(window.setTimeout(() => dismiss(id), opts?.error ? 7000 : 4500))
    },
    [dismiss],
  )
  useEffect(() => {
    const t = timers.current
    return () => t.forEach((x) => window.clearTimeout(x))
  }, [])
  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="gv-toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`gv-toast${t.error ? ' is-error' : ''}`}>
            <span style={{ flex: 1 }}>{t.text}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ---------------------------------------------------------------- loading, errors, unavailable widgets

export function BlockSkeleton({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="gv-tight">
      <Skeleton width="40%" height={20} />
      <Skeleton lines={rows} height={14} />
    </div>
  )
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert
      tone="danger"
      title="This could not be loaded"
      action={
        onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {govErrorText(error)}
    </Alert>
  )
}

/** Renders a query: skeleton while loading, a calm error with retry, then the data. */
export function QueryState<T>({
  q,
  children,
  skeleton,
}: {
  q: UseQueryResult<T>
  children: (data: T) => ReactNode
  skeleton?: ReactNode
}) {
  if (q.data !== undefined) return <>{children(q.data)}</>
  if (q.isError) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
  return <>{skeleton ?? <BlockSkeleton />}</>
}

/**
 * The API says `{ available: false, reason }` when no table can supply a number.
 * That is shown as a calm empty state with the reason, never as a zero.
 */
export function WidgetView<T>({
  w,
  title = 'Not available yet',
  children,
  compact,
}: {
  w: Widget<T> | undefined
  title?: string
  children: (data: T) => ReactNode
  compact?: boolean
}) {
  if (!w) return null
  if (w.available) return <>{children(w.data)}</>
  return (
    <EmptyState title={title} titleAs="h4" className={compact ? 'gv-empty-compact' : undefined}>
      {w.reason}
    </EmptyState>
  )
}

// ---------------------------------------------------------------- confirm modal with a reason

export interface ActionModalProps {
  open: boolean
  title: string
  confirmLabel: string
  tone?: 'primary' | 'danger'
  onClose: () => void
  /** Return text to show as a success toast. Throw to keep the dialog open with the error. */
  onConfirm: (reason: string) => Promise<string | void>
  reasonLabel?: string
  reasonRequired?: boolean
  reasonHelper?: string
  noReason?: boolean
  extra?: ReactNode
  children?: ReactNode
}

export function ActionModal({
  open,
  title,
  confirmLabel,
  tone = 'primary',
  onClose,
  onConfirm,
  reasonLabel = 'Reason',
  reasonRequired = false,
  reasonHelper,
  noReason,
  extra,
  children,
}: ActionModalProps) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useGovToast()

  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  async function confirm() {
    if (!noReason && reasonRequired && !reason.trim()) {
      setError(`${reasonLabel} is required.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const message = await onConfirm(reason.trim())
      if (message) toast(message)
      onClose()
    } catch (e) {
      setError(govErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      size="sm"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="gv-tight">
        {children}
        {noReason ? null : (
          <Textarea
            label={reasonLabel}
            optional={!reasonRequired}
            required={reasonRequired}
            rows={3}
            value={reason}
            helper={reasonHelper}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {extra}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- small shared pieces

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  emergencyValue,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  emergencyValue?: T
}) {
  return (
    <div role="group" aria-label={label} className="gv-seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={`${value === o.value ? 'is-on' : ''}${emergencyValue === o.value ? ' is-em' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Accessible two-column definition list. */
export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="gv-kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Dot({ tone }: { tone: 'danger' | 'warning' | 'info' | 'success' | 'neutral' }) {
  return <span className={`gv-dot gv-dot-${tone}`} aria-hidden="true" />
}

/** Smooth in-page jump to another console section, keeping the ?section= convention the shell nav uses. */
export function sectionHref(path: string, id: string): string {
  return `${path}?section=${id}`
}

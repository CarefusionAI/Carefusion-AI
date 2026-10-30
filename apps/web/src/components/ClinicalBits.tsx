import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { errorText } from '../api/clinicalHttp'
import { Alert, Button, Modal, Skeleton, Textarea } from './ui'

/** Error box with a retry button, used when a query fails. */
export function LoadError({ error, onRetry, title = 'Could not load this section' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Alert
      tone="danger"
      title={title}
      action={
        onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {errorText(error)}
    </Alert>
  )
}

/** Placeholder rows while data loads (screen readers get one status message). */
export function ListSkeleton({ rows = 4, height = 56, label = 'Loading' }: { rows?: number; height?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius={14} />
      ))}
    </div>
  )
}

export interface ConfirmModalProps {
  open: boolean
  title: string
  confirmLabel: string
  /** Show a reason box; confirm stays disabled until it has at least `minReason` characters. */
  reasonLabel?: string
  minReason?: number
  danger?: boolean
  busy?: boolean
  error?: unknown
  onClose: () => void
  onConfirm: (reason: string) => void
  children?: ReactNode
}

/** Confirmation dialog for actions that change records. Resets its reason every time it opens. */
export function ConfirmModal({ open, title, confirmLabel, reasonLabel, minReason = 3, danger, busy, error, onClose, onConfirm, children }: ConfirmModalProps) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])
  const needsReason = !!reasonLabel
  const ok = !needsReason || reason.trim().length >= minReason
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
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!ok} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
        {needsReason ? (
          <Textarea label={reasonLabel!} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required helper={`At least ${minReason} characters. This is written to the audit log.`} />
        ) : null}
        {error ? <Alert tone="danger">{errorText(error)}</Alert> : null}
      </div>
    </Modal>
  )
}

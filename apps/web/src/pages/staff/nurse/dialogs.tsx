import { useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Modal, Textarea } from '../../../components/ui'

/** Confirm a consequential action in a dialog (never a window.confirm). */
export function ConfirmModal({
  open,
  title,
  confirmLabel,
  tone = 'primary',
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  confirmLabel: string
  tone?: 'primary' | 'danger'
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
  children: ReactNode
}) {
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
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="nu-list">
        {children}
        {error ? (
          <Alert tone="danger" title="Not saved">
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  )
}

/** Ask for a written reason (min 3 characters) before rejecting or declining something. */
export function ReasonModal({
  open,
  title,
  confirmLabel,
  label = 'Reason',
  helper,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  confirmLabel: string
  label?: string
  helper?: string
  busy?: boolean
  error?: string | null
  onConfirm: (reason: string) => void
  onClose: () => void
  children?: ReactNode
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const short = reason.trim().length < 3
  function close() {
    setReason('')
    setTouched(false)
    onClose()
  }
  return (
    <Modal
      open={open}
      title={title}
      size="sm"
      onClose={busy ? undefined : close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              setTouched(true)
              if (!short) onConfirm(reason.trim())
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="nu-list">
        {children}
        <Textarea
          label={label}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helper={helper}
          error={touched && short ? 'Write at least 3 characters.' : undefined}
          maxLength={500}
        />
        {error ? (
          <Alert tone="danger" title="Not saved">
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  )
}

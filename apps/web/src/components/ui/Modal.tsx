import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Glyph } from './Glyph'
import { useStableId } from './useStableId'

export interface ModalProps {
  open: boolean
  title: ReactNode
  onClose?: () => void
  size?: 'sm' | 'md' | 'lg'
  glass?: boolean
  inline?: boolean
  footer?: ReactNode
  className?: string
  children?: ReactNode
}

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({ open, title, onClose, size = 'md', glass, inline, footer, className, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useStableId('cf-modal')

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = panel.current
    node?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && closeRef.current) {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key === 'Tab' && node) {
        const items = node.querySelectorAll<HTMLElement>(FOCUSABLE)
        if (!items.length) {
          e.preventDefault()
          node.focus()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === node)) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className={clsx('cf-modal-scrim', glass && 'is-glass', inline && 'is-inline')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx('cf-modal', `cf-modal-${size}`, className)}
      >
        <div className="cf-modal-head">
          <h2 id={titleId} className="cf-modal-title">
            {title}
          </h2>
          {onClose ? (
            <button type="button" className="cf-icon-btn" aria-label="Close" onClick={onClose}>
              <Glyph name="close" />
            </button>
          ) : null}
        </div>
        <div className="cf-modal-body">{children}</div>
        {footer ? <div className="cf-modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

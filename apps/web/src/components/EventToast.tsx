import { Link } from 'react-router-dom'
import type { CfEvent } from '../hooks/useEvents'
import { eventTag } from '../hooks/useEvents'

export interface EventToastProps {
  event: CfEvent | null
  onDismiss: () => void
}

/** Slide-in notification for a cross-role event. Announced politely to screen readers. */
export default function EventToast({ event, onDismiss }: EventToastProps) {
  if (!event) return null
  const { tag, tone } = eventTag(event.type)
  const href = event.href
  const internal = href?.startsWith('/')
  return (
    <div className="cf-toast" role="status" aria-live="polite">
      <span className={`cf-toast-tag cf-tk-${tone}`} aria-hidden="true">
        {tag}
      </span>
      <div className="cf-toast-body">
        <strong className="cf-toast-title">{event.title}</strong>
        {event.text ? <span className="cf-toast-text">{event.text}</span> : null}
        {href ? (
          <div className="cf-toast-link">
            {internal ? (
              <Link to={href} onClick={onDismiss}>
                Open
              </Link>
            ) : (
              <a href={href}>Open</a>
            )}
          </div>
        ) : null}
      </div>
      <button type="button" className="cf-toast-close" aria-label="Dismiss notification" onClick={onDismiss}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

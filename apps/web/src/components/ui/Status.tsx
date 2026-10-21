import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Glyph } from './Glyph'

/* ---------- Badge ---------- */
export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'ai'
  | 'teal'
  | 'peach'
  | 'gold'
  | 'outline'

export interface BadgeProps {
  tone?: BadgeTone
  icon?: ReactNode
  dot?: boolean
  className?: string
  children?: ReactNode
}

export function Badge({ tone = 'neutral', icon, dot, className, children }: BadgeProps) {
  return (
    <span className={clsx('cf-badge', `cf-badge-${tone}`, className)}>
      {icon ? (
        <span className="cf-badge-icon" aria-hidden="true">
          {icon}
        </span>
      ) : dot ? (
        <span className="cf-badge-dot" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  )
}

/* ---------- Alert ---------- */
export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'ai'

export interface AlertProps {
  tone?: AlertTone
  title?: ReactNode
  banner?: boolean
  action?: ReactNode
  onDismiss?: () => void
  className?: string
  children?: ReactNode
}

export function Alert({ tone = 'info', title, banner, action, onDismiss, className, children }: AlertProps) {
  const urgent = tone === 'danger'
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={clsx('cf-alert', `cf-alert-${tone}`, banner && 'is-banner', className)}
    >
      <Glyph name={tone === 'ai' ? 'ai' : tone} className="cf-alert-glyph" />
      <div className="cf-alert-text">
        {title ? <p className="cf-alert-title">{title}</p> : null}
        {children ? <div className="cf-alert-body">{children}</div> : null}
      </div>
      {action ? <div className="cf-alert-action">{action}</div> : null}
      {onDismiss ? (
        <button type="button" className="cf-icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <Glyph name="close" size={18} />
        </button>
      ) : null}
    </div>
  )
}

/* ---------- Skeleton ---------- */
export interface SkeletonProps {
  lines?: number
  width?: number | string
  height?: number | string
  radius?: number | string
  circle?: boolean
  className?: string
}

export function Skeleton({ lines = 0, width = '100%', height = 12, radius, circle, className }: SkeletonProps) {
  if (lines > 1) {
    return (
      <span className={clsx('cf-skel-stack', className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="cf-skel" style={{ height, width: i === lines - 1 ? '60%' : '100%' }} />
        ))}
      </span>
    )
  }
  return (
    <span
      className={clsx('cf-skel', circle && 'is-circle', className)}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius }}
    />
  )
}

/* ---------- EmptyState ---------- */
export interface EmptyStateProps {
  title: ReactNode
  icon?: ReactNode
  action?: ReactNode
  titleAs?: 'h2' | 'h3' | 'h4'
  className?: string
  children?: ReactNode
}

export function EmptyState({ title, icon, action, titleAs: TitleTag = 'h3', className, children }: EmptyStateProps) {
  return (
    <div className={clsx('cf-empty', className)}>
      <span className="cf-empty-icon" aria-hidden="true">
        {icon ?? <Glyph name="inbox" size={26} />}
      </span>
      <TitleTag className="cf-empty-title">{title}</TitleTag>
      {children ? <p className="cf-empty-body">{children}</p> : null}
      {action}
    </div>
  )
}

/* ---------- Avatar ---------- */
export type AvatarTone = 'teal' | 'lavender' | 'peach' | 'blue' | 'sage'
const AV_TONES: AvatarTone[] = ['teal', 'lavender', 'peach', 'blue', 'sage']

export interface AvatarProps {
  name: string
  size?: number
  tone?: AvatarTone
  className?: string
}

export function Avatar({ name, size = 40, tone, className }: AvatarProps) {
  const parts = name
    .replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  const resolved = tone ?? AV_TONES[sum % AV_TONES.length]
  return (
    <span
      className={clsx('cf-avatar', `cf-avatar-${resolved}`, className)}
      role="img"
      aria-label={name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {(first + last).toUpperCase()}
    </span>
  )
}

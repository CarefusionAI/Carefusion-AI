import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'soft' | 'ai' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  fullWidth,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={clsx(
        'cf-btn',
        `cf-btn-${variant}`,
        `cf-btn-${size}`,
        fullWidth && 'cf-btn-full',
        loading && 'is-loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
    >
      {loading ? (
        <span className="cf-spinner" aria-hidden="true" />
      ) : icon ? (
        <span className="cf-btn-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="cf-btn-label">{children}</span>
    </button>
  )
}

import type { ElementType, HTMLAttributes, MouseEventHandler, ReactNode } from 'react'
import clsx from 'clsx'

export type CardPadding = 'default' | 'compact' | 'flush'
export type CardTone = 'sage' | 'blue' | 'lavender' | 'peach' | 'cream' | 'brand'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: ElementType
  titleAs?: ElementType
  title?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  padding?: CardPadding
  tone?: CardTone
  interactive?: boolean
  onClick?: MouseEventHandler<HTMLElement>
}

export function Card({
  as,
  titleAs,
  title,
  eyebrow,
  actions,
  padding = 'default',
  tone,
  interactive,
  className,
  children,
  onClick,
  ...rest
}: CardProps) {
  const Tag: ElementType = as ?? (onClick ? 'button' : 'div')
  const isButton = Tag === 'button'
  const EyebrowTag: ElementType = isButton ? 'span' : 'p'
  const TitleTag: ElementType = isButton ? 'span' : (titleAs ?? 'h3')
  return (
    <Tag
      {...rest}
      type={isButton ? 'button' : undefined}
      onClick={onClick}
      className={clsx(
        'cf-card',
        `cf-card-${padding}`,
        tone && `cf-card-${tone}`,
        (interactive || onClick) && 'is-interactive',
        className,
      )}
    >
      {title || actions || eyebrow ? (
        <div className="cf-card-head">
          <div>
            {eyebrow ? <EyebrowTag className="cf-card-eyebrow">{eyebrow}</EyebrowTag> : null}
            {title ? <TitleTag className="cf-card-title">{title}</TitleTag> : null}
          </div>
          {actions ? <div className="cf-card-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  )
}

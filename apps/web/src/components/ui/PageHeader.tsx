import type { ElementType, ReactNode } from 'react'
import clsx from 'clsx'

export interface PageHeaderProps {
  title: ReactNode
  eyebrow?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  titleAs?: ElementType
  className?: string
}

export function PageHeader({ title, eyebrow, subtitle, actions, titleAs, className }: PageHeaderProps) {
  const TitleTag: ElementType = titleAs ?? 'h1'
  return (
    <header className={clsx('cf-pagehead', className)}>
      <div className="cf-pagehead-text">
        {eyebrow ? <p className="cf-pagehead-eyebrow">{eyebrow}</p> : null}
        <TitleTag className="cf-pagehead-title">{title}</TitleTag>
        {subtitle ? <p className="cf-pagehead-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="cf-pagehead-actions">{actions}</div> : null}
    </header>
  )
}

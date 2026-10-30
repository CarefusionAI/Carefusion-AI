import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Glyph } from './Glyph'

export interface StatCardProps {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  icon?: ReactNode
  hint?: ReactNode
  trend?: { direction?: 'up' | 'down'; text: ReactNode }
  tone?: 'sage' | 'blue' | 'lavender' | 'peach'
  className?: string
}

export function StatCard({ label, value, unit, icon, hint, trend, tone, className }: StatCardProps) {
  return (
    <div className={clsx('cf-stat', tone && `cf-tone-${tone}`, className)}>
      <div className="cf-stat-top">
        <p className="cf-stat-label">{label}</p>
        {icon ? (
          <span className="cf-stat-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="cf-stat-value">
        {value}
        {unit ? <span className="cf-stat-unit">{unit}</span> : null}
      </p>
      {trend ? (
        <p className={clsx('cf-stat-hint', trend.direction === 'up' && 'is-up', trend.direction === 'down' && 'is-down')}>
          {trend.direction ? <Glyph name={trend.direction} size={16} /> : null}
          {trend.text}
        </p>
      ) : hint ? (
        <p className="cf-stat-hint">{hint}</p>
      ) : null}
    </div>
  )
}

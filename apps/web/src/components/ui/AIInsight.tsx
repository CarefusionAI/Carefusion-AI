import type { ElementType, ReactNode } from 'react'
import clsx from 'clsx'
import { Glyph, type GlyphName } from './Glyph'

export type AIStatus = 'verified' | 'caution' | 'uncertain'

const AI_STATUS: Record<AIStatus, { cls: string; label: string; glyph: GlyphName }> = {
  verified: { cls: 'is-verified', label: 'VERIFIED', glyph: 'check' },
  caution: { cls: 'is-caution', label: 'SUPPORTED_WITH_CAUTION', glyph: 'warning' },
  uncertain: { cls: 'is-uncertain', label: 'UNCERTAIN', glyph: 'question' },
}

export interface AIInsightProps {
  title?: ReactNode
  titleAs?: ElementType
  module?: ReactNode
  status?: AIStatus
  /** 0 to 1 */
  confidence?: number
  evidence?: ReactNode[]
  /** Always true in the alpha: every AI output is simulated. */
  simulated?: boolean
  reviewed?: boolean
  reviewedBy?: string
  footer?: ReactNode
  label?: string
  className?: string
  children?: ReactNode
}

/** The only way to show AI output. Decision support only, never a diagnosis. */
export function AIInsight({
  title,
  titleAs,
  module,
  status,
  confidence,
  evidence,
  simulated = true,
  reviewed,
  reviewedBy,
  footer,
  label = 'AI insight',
  className,
  children,
}: AIInsightProps) {
  const st = status ? AI_STATUS[status] : null
  const conf = typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : null
  const TitleTag: ElementType = titleAs ?? 'h3'
  const pct = conf !== null ? Math.round(conf * 100) : 0
  return (
    <section className={clsx('cf-ai', className)} aria-label={label}>
      <div className="cf-ai-head">
        <span className="cf-ai-tag">
          <Glyph name="ai" size={14} />
          {simulated ? 'Simulated AI output' : 'AI-generated insight'}
        </span>
        {module ? <span className="cf-ai-module">{module}</span> : null}
        {st ? (
          <span className={clsx('cf-ai-status', st.cls)}>
            <Glyph name={st.glyph} size={14} />
            {st.label}
          </span>
        ) : null}
      </div>
      {title ? <TitleTag className="cf-ai-title">{title}</TitleTag> : null}
      {children ? <div className="cf-ai-body">{children}</div> : null}
      {conf !== null ? (
        <div className="cf-ai-conf">
          <span>Confidence</span>
          <span className="cf-ai-bar" role="img" aria-label={`Confidence ${pct} percent`}>
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="cf-num">{pct}%</span>
        </div>
      ) : null}
      {evidence && evidence.length ? (
        <ul className="cf-ai-evidence" aria-label="Evidence">
          {evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
      <div className="cf-ai-foot">
        <span className="cf-ai-review">
          <Glyph name={reviewed ? 'check' : 'shield'} size={16} />
          {reviewed ? (reviewedBy ? `Reviewed by ${reviewedBy}` : 'Reviewed by a clinician') : 'Requires clinician review'}
        </span>
        {footer}
      </div>
    </section>
  )
}

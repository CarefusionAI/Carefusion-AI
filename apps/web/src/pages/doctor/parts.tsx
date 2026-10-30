import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AIInsight, Alert, Badge, Button, Card, EmptyState, Modal, Skeleton, Textarea } from '../../components/ui'
import type { AIStatus } from '../../components/ui'
import { errorText, useAiReview } from '../../api/doctor'
import type { AIInsight as AiInsightData } from '../../api/doctor'
import { fmtDayTime, pct } from './format'

export const sectionHref = (section: string, extra?: Record<string, string>) => {
  const sp = new URLSearchParams({ section, ...(extra ?? {}) })
  return `/doctor?${sp.toString()}`
}

export function SectionLink({ section, extra, children }: { section: string; extra?: Record<string, string>; children: ReactNode }) {
  return (
    <Link className="dr-link" to={sectionHref(section, extra)}>
      {children}
    </Link>
  )
}

export function ErrorNote({ error, title = 'Could not complete that' }: { error: unknown; title?: string }) {
  if (!error) return null
  return (
    <Alert tone="danger" title={title}>
      {errorText(error)}
    </Alert>
  )
}

export function Loading({ lines = 4 }: { lines?: number }) {
  return (
    <div role="status" aria-label="Loading" className="dr-stack">
      <Skeleton width="40%" height={24} />
      <Skeleton lines={lines} />
    </div>
  )
}

export function Box({
  title,
  actions,
  tone,
  className,
  children,
}: {
  title?: ReactNode
  actions?: ReactNode
  tone?: 'sage' | 'blue' | 'lavender' | 'peach' | 'cream' | 'brand'
  className?: string
  children?: ReactNode
}) {
  return (
    <Card as="section" title={title} actions={actions} tone={tone} titleAs="h2" className={className}>
      <div className="dr-stack">{children}</div>
    </Card>
  )
}

export function Tok({ tone = 'teal', children }: { tone?: string; children: ReactNode }) {
  return (
    <span className={`dr-tok dr-t-${tone}`} aria-hidden="true">
      {children}
    </span>
  )
}

export function Row({ tok, tone, title, sub, right }: { tok?: ReactNode; tone?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="dr-row">
      {tok !== undefined ? <Tok tone={tone}>{tok}</Tok> : null}
      <div className="dr-row-main">
        <div className="dr-strong">{title}</div>
        {sub ? <div className="dr-muted">{sub}</div> : null}
      </div>
      {right}
    </div>
  )
}

export function Kv({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="dr-kv">
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Sent({ children }: { children: ReactNode }) {
  return (
    <div className="dr-sent" role="status">
      <span aria-hidden="true">&#10003;</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  )
}

export function Header({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="dr-between" style={{ alignItems: 'flex-end' }}>
      <div>
        <h1 className="dr-h1">{title}</h1>
        {subtitle ? <p className="dr-sub">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  )
}

export function NeedPatient({ what }: { what: string }) {
  return (
    <EmptyState
      title="No patient open"
      action={
        <Link to={sectionHref('open')} className="cf-btn cf-btn-primary cf-btn-md" style={{ textDecoration: 'none' }}>
          <span className="cf-btn-label">Open a patient</span>
        </Link>
      }
    >
      {what} needs an open patient session. Ask the patient for their key to start a 30-minute session.
    </EmptyState>
  )
}

/** Confirmation dialog for destructive or audited actions. The body must state the consequences. */
export function ConfirmModal({
  open,
  title,
  onClose,
  onConfirm,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  busy,
  error,
  confirmDisabled,
  children,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  onConfirm: () => void
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  error?: unknown
  confirmDisabled?: boolean
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
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="dr-stack">
        {children}
        <ErrorNote error={error} />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------------
// AI output (always simulated; always via the AIInsight component; doctor accepts, edits or rejects)
// ---------------------------------------------------------------------------------------------

const STATUS_MAP: Record<AiInsightData['status'], AIStatus> = {
  VERIFIED: 'verified',
  SUPPORTED_WITH_CAUTION: 'caution',
  UNCERTAIN: 'uncertain',
}

const REVIEW_BADGE: Record<string, { tone: 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
  pending: { tone: 'warning', label: 'Awaiting your review' },
  accepted: { tone: 'success', label: 'Accepted' },
  edited: { tone: 'info', label: 'Accepted with edits' },
  rejected: { tone: 'danger', label: 'Rejected' },
}

export function reviewBadge(state: string) {
  const r = REVIEW_BADGE[state] ?? REVIEW_BADGE.pending!
  return <Badge tone={r.tone}>{r.label}</Badge>
}

interface DisagreementLoose {
  note?: string
  agree?: boolean
  agreement?: number | boolean
  models?: { name: string; top?: string; finding?: string; confidence: number }[]
}

export function AiCard({
  insight,
  reviewer = 'Dr. Arun Nair',
  canReview = true,
  onReviewed,
  extra,
}: {
  insight: AiInsightData
  reviewer?: string
  canReview?: boolean
  onReviewed?: (updated: AiInsightData) => void
  extra?: ReactNode
}) {
  const [current, setCurrent] = useState<AiInsightData | null>(null)
  const view = current && current.runId === insight.runId ? current : insight
  const reviewed = view.review.state !== 'pending'
  const dis = view.disagreement as DisagreementLoose | null
  return (
    <div className="dr-stack">
      <AIInsight
        module={view.module}
        status={STATUS_MAP[view.status]}
        confidence={view.confidence}
        title={view.headline}
        evidence={view.evidence}
        simulated
        reviewed={reviewed}
        reviewedBy={view.review.reviewedBy ?? reviewer}
      >
        <p style={{ margin: 0, fontSize: 14 }}>{view.review.state === 'edited' && view.review.editedText ? view.review.editedText : view.text}</p>
        {view.hypotheses.length > 1 ? (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }} aria-label="Other possibilities the simulation weighed">
            {view.hypotheses.map((h) => (
              <li key={h.rank}>
                {h.label} ({pct(h.confidence)}%, {h.evidenceStatus.toLowerCase().replace(/_/g, ' ')})
              </li>
            ))}
          </ul>
        ) : null}
        {dis?.note ? (
          <p className="dr-muted" style={{ margin: '8px 0 0' }}>
            Disagreement report: {dis.note}
          </p>
        ) : null}
        {view.sources.length ? (
          <p className="dr-muted" style={{ margin: '4px 0 0' }}>
            Sources: {view.sources.map((s) => s.ref).join(', ')}
          </p>
        ) : null}
        {extra}
      </AIInsight>
      {view.runId ? (
        <ReviewPanel
          insight={view}
          canReview={canReview}
          onReviewed={(u) => {
            setCurrent(u)
            onReviewed?.(u)
          }}
        />
      ) : (
        <p className="dr-muted" style={{ margin: 0 }}>
          This summary is built on the fly and is not stored. Nothing is written to the chart unless you act on it.
        </p>
      )}
    </div>
  )
}

function ReviewPanel({ insight, canReview, onReviewed }: { insight: AiInsightData; canReview: boolean; onReviewed: (u: AiInsightData) => void }) {
  const review = useAiReview()
  const [mode, setMode] = useState<null | 'edit' | 'reject'>(null)
  const [note, setNote] = useState('')
  const [edited, setEdited] = useState('')
  const runId = insight.runId as string
  const state = insight.review.state

  function submit(body: { decision: 'accept' | 'edit' | 'reject'; note?: string; editedText?: string }) {
    review.mutate(
      { runId, ...body },
      {
        onSuccess: (u) => {
          setMode(null)
          setNote('')
          onReviewed(u)
        },
      },
    )
  }

  return (
    <div className="dr-stack" style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--surface)' }}>
      <div className="dr-between">
        <strong className="dr-strong">Your decision</strong>
        {reviewBadge(state)}
      </div>
      <p className="dr-muted" style={{ margin: 0 }}>
        {state === 'pending'
          ? 'The patient sees this result only after you have reviewed it. A rejected result is never shown to them.'
          : insight.review.visibleToPatient
            ? 'The patient can now see this result.'
            : 'The patient will not see this result.'}
        {insight.review.reason ? ` Note: ${insight.review.reason}` : ''}
        {insight.review.reviewedAt ? ` Reviewed ${fmtDayTime(insight.review.reviewedAt)}.` : ''}
      </p>
      {canReview ? (
        <div className="dr-wrap">
          <Button variant="primary" size="sm" disabled={review.isPending || state === 'accepted'} onClick={() => submit({ decision: 'accept' })}>
            Accept
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEdited(insight.review.editedText ?? insight.text)
              setMode('edit')
            }}
          >
            Edit finding
          </Button>
          <Button variant="danger" size="sm" onClick={() => setMode('reject')}>
            Reject
          </Button>
        </div>
      ) : null}
      {mode === null ? <ErrorNote error={review.error} /> : null}

      <Modal
        open={mode === 'edit'}
        title="Edit the finding"
        size="md"
        onClose={() => setMode(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={review.isPending} disabled={!edited.trim()} onClick={() => submit({ decision: 'edit', editedText: edited.trim(), note: note.trim() || undefined })}>
              Save edited finding
            </Button>
          </>
        }
      >
        <div className="dr-stack">
          <p style={{ margin: 0, fontSize: 14 }}>Your edited text replaces the simulated text. The patient then sees your version, marked as reviewed by you.</p>
          <Textarea label="Edited finding" value={edited} onChange={(e) => setEdited(e.target.value)} rows={5} maxLength={4000} />
          <Textarea label="Note (optional)" optional value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} />
          <ErrorNote error={review.error} />
        </div>
      </Modal>

      <ConfirmModal
        open={mode === 'reject'}
        title="Reject this AI result?"
        onClose={() => setMode(null)}
        onConfirm={() => submit({ decision: 'reject', note: note.trim() })}
        confirmLabel="Reject result"
        danger
        busy={review.isPending}
        error={review.error}
        confirmDisabled={note.trim().length === 0}
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          The result is marked rejected on the record and is never shown to the patient. This is logged against your name. You can run the analysis again later.
        </p>
        <Textarea label="Reason (required)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
        {note.trim().length === 0 ? <span className="dr-muted">Write a short reason to continue.</span> : null}
      </ConfirmModal>
    </div>
  )
}

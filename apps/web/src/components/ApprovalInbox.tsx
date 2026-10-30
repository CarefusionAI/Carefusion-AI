import { useCallback, useEffect, useState } from 'react'
import { apiFetch, apiJson } from '../lib/api'

// Reusable approval inbox for all admin levels (docs/09). Synthetic demo data only.

interface ApprovalItem {
  id: string
  subjectType: string
  step: number
  status: string
  submittedAt: string
  dueAt: string | null
  checkResults: unknown
  subjectUserId: string
  applicantName: string
  applicantAccountType: string
}

interface ApprovalInboxProps {
  adminLevel: string // 'district' | 'state' | 'zonal' | 'central'
}

interface ActionResult {
  success?: boolean
  nextStep?: number | string
  accountActivated?: boolean
  errorMessage?: string
  message?: string
}

const SUBJECT_LABELS: Record<string, string> = {
  doctor: 'Doctor registration',
  hospital_admin: 'Hospital admin registration',
  pharmacy_admin: 'Pharmacy admin registration',
  flagged_citizen: 'Flagged citizen review',
  flagged_doctor: 'Flagged doctor review',
}
const ACCOUNT_LABELS: Record<string, string> = {
  citizen: 'Citizen',
  doctor: 'Doctor',
  hospital_admin: 'Hospital Admin',
  pharmacy_admin: 'Pharmacy Admin',
}
const TOTAL_STEPS = 2

const btnPrimary =
  'rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const btnGhost =
  'rounded-lg border border-border-strong bg-surface-raised px-4 py-2.5 text-sm font-semibold text-ink transition-colors disabled:opacity-50'
const btnDanger =
  'rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50'

function humanise(value: string): string {
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// checkResults may be an array of strings/objects or an object of { name: boolean | string }.
function checkLabels(results: unknown): { label: string; ok: boolean }[] {
  if (!results) return []
  if (Array.isArray(results)) {
    return results.map((r) =>
      typeof r === 'string'
        ? { label: r, ok: true }
        : { label: String((r as { label?: string; name?: string }).label ?? (r as { name?: string }).name ?? 'Check'), ok: true },
    )
  }
  if (typeof results === 'object') {
    return Object.entries(results as Record<string, unknown>).map(([key, val]) => {
      const ok = val === true || val === 'passed' || val === 'verified' || val === 'ok'
      return { label: `${humanise(key)} ${ok ? 'verified' : String(val)}`, ok }
    })
  }
  return []
}

function StatusBadge({ status }: { status: string }) {
  const escalated = status === 'escalated'
  const cls = escalated ? 'bg-danger-soft text-danger-text' : 'bg-warning-soft text-warning-text'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{humanise(status)}</span>
}

export default function ApprovalInbox({ adminLevel }: ApprovalInboxProps) {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [active, setActive] = useState<{ id: string; kind: 'approve' | 'reject' } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await apiJson<ApprovalItem[]>('/v1/admin/approvals'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load approvals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function open(id: string, kind: 'approve' | 'reject') {
    setActive({ id, kind })
    setReason('')
    setActionError(null)
  }

  async function submit() {
    if (!active) return
    if (active.kind === 'reject' && !reason.trim()) {
      setActionError('A reason is required to reject.')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const res = await apiFetch(`/v1/admin/approvals/${active.id}/${active.kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      const data: ActionResult = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        setActionError(data.errorMessage ?? data.message ?? `Request failed (${res.status})`)
        return
      }
      const parts = [active.kind === 'approve' ? 'Approval recorded.' : 'Rejection recorded.']
      if (data.accountActivated) parts.push('The account is now active.')
      else if (data.nextStep) parts.push(`Moved to the next step (${data.nextStep}).`)
      setNotice(parts.join(' '))
      setActive(null)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-primary" role="status">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading approvals...
      </div>
    )
  }

  return (
    <section className="space-y-4" aria-label={`${adminLevel} approval inbox`}>
      {error && (
        <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-ok-soft bg-ok-soft px-3 py-2 text-sm text-ok-text">
          {notice}
        </p>
      )}
      {!error && items.length === 0 && (
        <p className="rounded-xl border border-border bg-surface-raised p-6 text-center text-sm text-ink-muted">
          No pending approvals
        </p>
      )}
      {items.map((item) => {
        const overdue = item.dueAt !== null && new Date(item.dueAt).getTime() < Date.now()
        const checks = checkLabels(item.checkResults)
        const isActive = active?.id === item.id
        return (
          <article key={item.id} className="cf-card space-y-3 rounded-xl border border-border bg-surface-raised p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-ink-strong">{item.applicantName}</h2>
                <p className="text-sm text-ink-muted">
                  {ACCOUNT_LABELS[item.applicantAccountType] ?? humanise(item.applicantAccountType)}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-muted">Request</dt>
                <dd className="text-ink-strong">{SUBJECT_LABELS[item.subjectType] ?? humanise(item.subjectType)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Step</dt>
                <dd className="text-ink-strong">
                  Step {item.step} of {TOTAL_STEPS}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Submitted</dt>
                <dd className="text-ink-strong">{formatDate(item.submittedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Due</dt>
                <dd className={overdue ? 'font-semibold text-danger-text' : 'text-ink-strong'}>
                  {formatDate(item.dueAt)}
                  {overdue && ' (overdue)'}
                </dd>
              </div>
            </dl>
            {checks.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {checks.map((c) => (
                  <li
                    key={c.label}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c.ok ? 'bg-ok-soft text-ok-text' : 'bg-warning-soft text-warning-text'}`}
                  >
                    {c.label}
                  </li>
                ))}
              </ul>
            )}
            {!isActive && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} onClick={() => open(item.id, 'approve')}>
                  Approve
                </button>
                <button type="button" className={btnDanger} onClick={() => open(item.id, 'reject')}>
                  Reject
                </button>
              </div>
            )}
            {isActive && active && (
              <div className="space-y-3 rounded-lg border border-border bg-surface-cream p-3">
                <label className="block text-sm font-medium text-ink">
                  {active.kind === 'approve' ? 'Reason (optional)' : 'Reason for rejection (required)'}
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink-strong focus:border-primary focus:outline-none"
                  />
                </label>
                {actionError && (
                  <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger-text">
                    {actionError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={active.kind === 'approve' ? btnPrimary : btnDanger}
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    {busy ? 'Saving...' : active.kind === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
                  </button>
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => setActive(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}

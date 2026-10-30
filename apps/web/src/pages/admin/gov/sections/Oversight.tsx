import { useEffect, useState } from 'react'
import type { GovAudit, GovFlaggedEvent, GovLogPage } from '@carefusion/shared'
import { useEscalateFlag, useGovAudit, useGovLogs, useJustifyFlag } from '../../../../api/gov'
import type { LogParams } from '../../../../api/gov'
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Skeleton, StatCard, Table, TextField } from '../../../../components/ui'
import { ActionModal, Dot, KV, QueryState, Segmented } from '../common'
import { BarChart, C } from '../charts'
import type { SectionProps } from '../types'
import { fmtDateTime, fmtNum, humanise, severityTone, statusTone } from '../util'

type Log = GovLogPage['items'][number]

const RULE_LABELS: Record<string, string> = {
  doctorSessionMinutes: 'Doctor session length (minutes)',
  breakGlassReviewHours: 'Break-glass review window (hours)',
  breakGlassCentralVerifyHours: 'Central verification of break-glass (hours)',
  failedSigninsBeforeLock: 'Failed sign-ins before lock',
  auditRetentionYears: 'Audit log retention (years)',
}

function cleanEvent(e: string): string {
  return e.replace(/\s*\[DEMO-AUD-[A-Z0-9]+\]\s*$/, '')
}

function refOf(e: string): string {
  return /\[(DEMO-AUD-[A-Z0-9]+)\]/.exec(e)?.[1] ?? ''
}

function Body({ a, ctx }: { a: GovAudit } & SectionProps) {
  const justify = useJustifyFlag()
  const esc = useEscalateFlag()
  const [open, setOpen] = useState<{ f: GovFlaggedEvent; kind: 'justify' | 'escalate' } | null>(null)
  const close = () => setOpen(null)
  const openFlags = a.flaggedEvents.filter((f) => f.status === 'open').length

  return (
    <div className="gv-stack">
      <PageHeader eyebrow="Oversight" title="Audit and security" subtitle="Flagged events, emergency access and the rules in force. Audit entries never show a patient's identity." />
      <div className="gv-grid-4">
        {a.kpis.map((k, i) => (
          <StatCard key={k.key} label={k.label} value={k.value === null ? '–' : fmtNum(k.value)} unit={k.unit ?? undefined} hint={k.hint} tone={(['peach', 'sage', undefined, 'blue'] as const)[i % 4]} />
        ))}
      </div>
      <div className="gv-split">
        <Card title="Flagged events" titleAs="h2" actions={<Badge tone={openFlags ? 'warning' : 'success'}>{openFlags} open</Badge>}>
          {a.flaggedEvents.length ? (
            <ul className="gv-list" aria-label="Flagged events">
              {a.flaggedEvents.map((f) => (
                <li key={f.id} className="gv-li">
                  <div className="gv-li-head">
                    <p className="gv-li-title">
                      <Dot tone={severityTone(f.severity) === 'danger' ? 'danger' : severityTone(f.severity) === 'warning' ? 'warning' : 'info'} />
                      {cleanEvent(f.event)}
                    </p>
                    <div className="gv-row" style={{ gap: 6 }}>
                      <Badge tone={severityTone(f.severity)}>{humanise(f.severity)} severity</Badge>
                      <Badge tone={statusTone(f.status)} dot>{humanise(f.status)}</Badge>
                    </div>
                  </div>
                  <p className="gv-li-sub">
                    {[f.actorRole, f.facility, f.district, fmtDateTime(f.createdAt), refOf(f.event)].filter(Boolean).join(' · ')}
                  </p>
                  {f.outcomeNote ? (
                    <p className="gv-muted">
                      {f.reviewedBy ? `${f.reviewedBy}: ` : ''}
                      {f.outcomeNote}
                      {f.escalatedToLevel ? ` (escalated to ${humanise(f.escalatedToLevel)})` : ''}
                    </p>
                  ) : null}
                  {f.status === 'open' ? (
                    <div className="gv-row" style={{ gap: 6 }}>
                      <Button size="sm" variant="secondary" onClick={() => setOpen({ f, kind: 'justify' })}>
                        Justified
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setOpen({ f, kind: 'escalate' })}>
                        Escalate
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing flagged" titleAs="h4">
              Events that break an access rule appear here for review.
            </EmptyState>
          )}
        </Card>
        <div className="gv-stack">
          <Card title="Break-glass · 12 weeks" titleAs="h3">
            <BarChart
              items={a.breakGlassWeekly.map((w, i) => ({ label: w.weekStart.slice(5), value: w.uses, highlight: i === a.breakGlassWeekly.length - 1 }))}
              label="Emergency (break-glass) record opens per week for the last 12 weeks"
              color={C.roseSoft}
              highlightColor={C.rose}
              labelEvery={4}
              showAllValues
              height={160}
              valueName="Break-glass uses"
              yFormat={(n) => n.toFixed(0)}
            />
          </Card>
          <Card title="Access rules in force" titleAs="h3">
            <KV rows={Object.entries(a.accessRules).map(([k, v]) => [RULE_LABELS[k] ?? humanise(k.replace(/([A-Z])/g, ' $1').toLowerCase()), String(v)] as [string, string])} />
          </Card>
        </div>
      </div>

      <ActionModal
        open={open?.kind === 'justify'}
        title="Mark this event as justified"
        confirmLabel="Mark justified"
        reasonRequired
        reasonLabel="Why is it justified?"
        reasonHelper="The note is kept in the audit log."
        onClose={close}
        onConfirm={async (note) => {
          await justify.mutateAsync({ id: open!.f.id, note })
          return 'Marked as justified.'
        }}
      >
        <p className="gv-body">{open ? cleanEvent(open.f.event) : ''}</p>
      </ActionModal>
      <ActionModal
        open={open?.kind === 'escalate'}
        title={`Escalate to ${a.escalateTo ?? ctx.escalateTo}`}
        confirmLabel="Escalate"
        tone="danger"
        reasonRequired
        reasonLabel="What should they look at?"
        onClose={close}
        onConfirm={async (note) => {
          await esc.mutateAsync({ id: open!.f.id, note })
          return `Escalated to ${a.escalateTo ?? ctx.escalateTo}.`
        }}
      >
        <p className="gv-body">{open ? cleanEvent(open.f.event) : ''}</p>
      </ActionModal>
    </div>
  )
}

export function AuditSection(props: SectionProps) {
  const q = useGovAudit()
  return (
    <QueryState q={q} skeleton={<Skeleton height={320} radius={16} />}>
      {(a) => <Body {...props} a={a} />}
    </QueryState>
  )
}

const LOG_TYPES: { value: LogParams['type']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'access', label: 'Record access' },
  { value: 'breakglass', label: 'Break-glass' },
  { value: 'admin', label: 'Admin' },
  { value: 'export', label: 'Exports' },
  { value: 'signin', label: 'Sign-in' },
]

const LEVEL_TEXT: Record<Log['level'], string> = { info: 'INFO', ok: 'OK', notice: 'NOTICE', alert: 'ALERT' }

export function LogsSection(_props: SectionProps) {
  const [type, setType] = useState<LogParams['type']>('all')
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(40)
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(text.trim()), 300)
    return () => window.clearTimeout(t)
  }, [text])
  const q = useGovLogs({ type, q: search || undefined, limit, offset: 0 })

  return (
    <div className="gv-stack">
      <PageHeader eyebrow="Oversight" title="Audit log" subtitle="Who did what, where and when. Entries are append-only and de-identified." />
      <Card
        titleAs="h2"
        title="Entries"
        actions={
          <div className="gv-row">
            <Segmented<LogParams['type']> label="Entry type" value={type} onChange={(v) => { setType(v); setLimit(40) }} options={LOG_TYPES} />
            <TextField label="Filter" value={text} onChange={(e) => setText(e.target.value)} placeholder="Event, role or place" />
          </div>
        }
      >
        <QueryState q={q} skeleton={<Skeleton height={300} radius={12} />}>
          {(d) => (
            <div className="gv-tight">
              <div className="gv-chips" aria-label="Counts by type">
                {Object.entries(d.counts).map(([k, v]) => (
                  <span key={k} className="gv-chip" style={{ background: 'var(--surface-cream)', color: 'var(--ink-body)' }}>
                    {humanise(k)} {fmtNum(v)}
                  </span>
                ))}
              </div>
              <Table<Log>
                caption="Audit log"
                rows={d.items}
                rowKey="seq"
                density="compact"
                empty="No entries match."
                columns={[
                  { key: 'at', header: 'Time', render: (r) => fmtDateTime(r.at) },
                  { key: 'level', header: 'Level', render: (r) => <Badge tone={severityTone(r.level)}>{LEVEL_TEXT[r.level]}</Badge> },
                  { key: 'event', header: 'Event' },
                  { key: 'actor', header: 'Actor', render: (r) => r.actorName ?? humanise(r.actorRole ?? '') },
                  { key: 'where', header: 'Where', render: (r) => r.where ?? '–' },
                  { key: 'ref', header: 'Ref', mono: true },
                ]}
              />
              <div className="gv-row-between">
                <p className="gv-muted">{d.note}</p>
                {d.items.length >= limit ? (
                  <Button size="sm" variant="secondary" onClick={() => setLimit(limit + 40)}>
                    Show more
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </QueryState>
      </Card>
      <Alert tone="info">No patient identity, IP address, GPS position or device is ever recorded here.</Alert>
    </div>
  )
}

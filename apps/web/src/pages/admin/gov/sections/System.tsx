import { useState } from 'react'
import type { GovSystem } from '@carefusion/shared'
import { isDemoSession, useGovSystem, useSetFlag } from '../../../../api/gov'
import { Alert, Badge, Button, Card, Checkbox, PageHeader, Skeleton, Switch, Table } from '../../../../components/ui'
import { ActionModal, Dot, KV, QueryState } from '../common'
import type { SectionProps } from '../types'
import { fmtDateTime } from '../util'

type Flag = GovSystem['flags'][number]

function Body({ s, ctx }: { s: GovSystem } & SectionProps) {
  const setFlag = useSetFlag()
  const [target, setTarget] = useState<{ flag: Flag; to: boolean } | null>(null)
  const [asPeer, setAsPeer] = useState(false)
  const close = () => {
    setTarget(null)
    setAsPeer(false)
  }
  const f = target?.flag
  const to = target?.to ?? false
  const needsSecond = f ? (to ? f.needsSecondSignerToChange.toOn : f.needsSecondSignerToChange.toOff) : false
  const pending = f?.pendingChange && f.pendingChange.enabled === to ? f.pendingChange : null
  const peerOffer = !!pending && pending.requestedBy === ctx.person.name && isDemoSession()

  return (
    <div className="gv-stack">
      <PageHeader eyebrow="National" title="System settings" subtitle="Platform-wide switches. Every change is written to the audit log." />
      <Alert tone="info" title="Two-person rule">
        {s.twoPersonRule}
      </Alert>
      <div className="gv-split">
        <Card title="Global flags" titleAs="h2">
          <div className="gv-tight">
            {s.flags.map((fl) => (
              <div key={fl.code} className="gv-tight" style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <Switch
                  label={fl.label}
                  description={fl.description ?? undefined}
                  checked={fl.enabled}
                  onChange={(v) => setTarget({ flag: fl, to: v })}
                />
                <div className="gv-row" style={{ gap: 6 }}>
                  <Badge tone={fl.enabled ? 'success' : 'neutral'}>{fl.enabled ? 'On' : 'Off'}</Badge>
                  {fl.needsSecondSignerToChange.toOn || fl.needsSecondSignerToChange.toOff ? <Badge tone="outline">Needs a second signer to turn {fl.needsSecondSignerToChange.toOff ? 'off' : 'on'}</Badge> : null}
                  {fl.pendingChange ? (
                    <>
                      <Badge tone="warning" dot>
                        Waiting: turn {fl.pendingChange.enabled ? 'on' : 'off'} requested by {fl.pendingChange.requestedBy ?? 'an admin'}
                      </Badge>
                      <Button size="sm" onClick={() => setTarget({ flag: fl, to: fl.pendingChange!.enabled })}>
                        Review and confirm
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
            <p className="gv-muted">{s.footnote}</p>
          </div>
        </Card>
        <div className="gv-stack">
          <Card title="System health" titleAs="h3" actions={<Badge tone={s.health.allNormal ? 'success' : 'warning'} dot>{s.health.allNormal ? 'All normal' : 'Needs attention'}</Badge>}>
            <ul className="gv-list" aria-label="Health checks">
              {s.health.checks.map((c) => (
                <li key={c.name} className="gv-li" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <span>
                    <Dot tone={c.ok ? 'success' : 'danger'} />
                    {c.name}
                    {c.detail ? <span className="gv-muted"> · {c.detail}</span> : null}
                  </span>
                  <Badge tone={c.ok ? 'success' : 'danger'}>{c.ok ? 'OK' : 'Check'}</Badge>
                </li>
              ))}
            </ul>
            <p className="gv-muted" style={{ marginTop: 8 }}>Checked {fmtDateTime(s.health.checkedAt)}</p>
          </Card>
          <Card title="Access rules" titleAs="h3">
            <KV rows={s.accessRules.map((r) => [r.description ?? r.code, typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value)] as [string, string])} />
          </Card>
        </div>
      </div>
      <Card title="Change history" titleAs="h2">
        <Table<GovSystem['history'][number]>
          caption="Change history of global flags"
          rows={s.history}
          rowKey="id"
          empty="No changes yet."
          columns={[
            { key: 'label', header: 'Setting' },
            { key: 'enabled', header: 'Changed to', render: (h) => <Badge tone={h.enabled ? 'success' : 'neutral'}>{h.enabled ? 'On' : 'Off'}</Badge> },
            { key: 'by', header: 'By', render: (h) => h.by ?? '–' },
            { key: 'secondSigner', header: 'Second signer', render: (h) => h.secondSigner ?? '–' },
            { key: 'note', header: 'Reason', render: (h) => h.note ?? '–' },
            { key: 'at', header: 'When', render: (h) => fmtDateTime(h.at) },
          ]}
        />
      </Card>

      <ActionModal
        open={target !== null}
        title={f ? `${pending ? 'Confirm: turn' : 'Turn'} ${to ? 'on' : 'off'} ${f.label}?` : ''}
        confirmLabel={needsSecond && !pending ? 'Request change' : `Turn ${to ? 'on' : 'off'}`}
        tone={!to && (f?.code === 'maint' || f?.code === 'bg' || f?.code === 'ai') ? 'danger' : to && f?.code === 'maint' ? 'danger' : 'primary'}
        reasonRequired
        reasonLabel="Reason"
        reasonHelper="At least 3 characters. Written to the audit log."
        onClose={close}
        onConfirm={async (reason) => {
          if (reason.length < 3) throw new Error('Give a reason of at least 3 characters.')
          const r = await setFlag.mutateAsync({ code: f!.code, enabled: to, reason, asPeer })
          setAsPeer(false)
          return r.pending ? 'Change requested. A second central admin must confirm it.' : `${f!.label} is now ${to ? 'on' : 'off'}.`
        }}
        extra={
          peerOffer ? (
            <Checkbox
              checked={asPeer}
              onChange={setAsPeer}
              label="Demo only: a peer admin of my level signs as the second signer"
              description="You requested this change. In a real deployment a different person must confirm."
            />
          ) : undefined
        }
      >
        <p className="gv-body">{f ? (to ? f.confirmTextOn : f.confirmTextOff) : ''}</p>
        {needsSecond ? (
          <Alert tone="warning" title="Needs two people">
            {pending
              ? `Requested by ${pending.requestedBy ?? 'an admin'}${pending.reason ? `: ${pending.reason}` : ''}. Your confirmation applies it.`
              : 'Your request is saved and a second central admin must confirm before it applies.'}
          </Alert>
        ) : null}
      </ActionModal>
    </div>
  )
}

export default function System(props: SectionProps) {
  const q = useGovSystem(props.ctx.level === 'central')
  return (
    <QueryState q={q} skeleton={<Skeleton height={320} radius={16} />}>
      {(s) => <Body {...props} s={s} />}
    </QueryState>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GovAlert, GovAlertList, GovAlertTarget } from '@carefusion/shared'
import {
  isDemoSession,
  useAlertReach,
  useCancelAlert,
  useCreateAlert,
  useGovAlerts,
  useSecondApproveAlert,
  useSendAlert,
} from '../../../../api/gov'
import type { AlertDraft } from '../../../../api/gov'
import { Alert, Badge, Button, Card, Checkbox, EmptyState, PageHeader, Select, Skeleton, Switch, TextField, Textarea } from '../../../../components/ui'
import { ActionModal, Dot, QueryState, Segmented } from '../common'
import type { SectionProps } from '../types'
import { fmtDateTime, fmtNum, humanise, statusTone } from '../util'

const CATEGORIES = [
  { value: 'outbreak', label: 'Outbreak' },
  { value: 'health_camp', label: 'Health camp' },
  { value: 'blood_donation', label: 'Blood donation' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'weather', label: 'Weather and disaster' },
  { value: 'general', label: 'General health' },
]

const WHEN = [
  { value: 'now', label: 'Send now' },
  { value: 'today18', label: 'Today 18:00' },
  { value: 'tomorrow7', label: 'Tomorrow 07:00' },
  { value: 'custom', label: 'Pick a date and time' },
]

const tkey = (t: { scope: string; id: string | number | null }) => `${t.scope}:${t.id ?? ''}`

function istDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function scheduleIso(when: string, custom: string): string | undefined {
  if (when === 'today18') return `${istDate(0)}T18:00:00+05:30`
  if (when === 'tomorrow7') return `${istDate(1)}T07:00:00+05:30`
  if (when === 'custom' && custom) return `${custom}:00+05:30`
  return undefined
}

function targetOf(list: GovAlertList, key: string): GovAlertTarget | undefined {
  return list.targets.find((t) => tkey(t) === key)
}

function AlertRow({ a, ctx, onSecond, onCancel, onSend }: { a: GovAlert; ctx: SectionProps['ctx']; onSecond: (a: GovAlert) => void; onCancel: (a: GovAlert) => void; onSend: (a: GovAlert) => void }) {
  const emergency = a.type === 'emergency'
  const when = a.sentAt ?? a.scheduledAt ?? a.startsAt
  return (
    <li className="gv-li">
      <div className="gv-li-head">
        <p className="gv-li-title">
          <Dot tone={emergency ? 'danger' : 'info'} />
          {a.title}
        </p>
        <div className="gv-row" style={{ gap: 6 }}>
          <Badge tone={emergency ? 'danger' : 'info'}>{emergency ? 'Emergency' : 'Advisory'}</Badge>
          <Badge tone={statusTone(a.status)} dot>
            {a.status === 'pending_second_approval' ? 'Awaiting 2nd admin' : humanise(a.status)}
          </Badge>
        </div>
      </div>
      <p className="gv-li-sub">
        {a.target.name} · {fmtDateTime(when)}
        {a.reach !== null ? ` · reach ${fmtNum(a.reach)}` : ''}
        {a.issuer && !a.issuedAtMyLevel ? ` · issued by ${a.issuer}` : ''}
      </p>
      {a.status === 'pending_second_approval' && a.issuedAtMyLevel ? (
        <p className="gv-muted">Issued by {a.issuedBy ?? 'you'}. A second admin must approve before it goes out.</p>
      ) : null}
      <div className="gv-row" style={{ gap: 6 }}>
        {a.status === 'pending_second_approval' ? (
          <Button size="sm" onClick={() => onSecond(a)}>
            Give second approval
          </Button>
        ) : null}
        {a.status === 'draft' ? (
          <Button size="sm" variant="secondary" onClick={() => onSend(a)}>
            {a.type === 'emergency' ? 'Send for second approval' : 'Send'}
          </Button>
        ) : null}
        {['draft', 'pending_second_approval', 'scheduled'].includes(a.status) && a.issuedAtMyLevel ? (
          <Button size="sm" variant="ghost" onClick={() => onCancel(a)}>
            Cancel alert
          </Button>
        ) : null}
      </div>
      <span className="cf-sr">Issued from {ctx.unit.name}</span>
    </li>
  )
}

function Body({ list, ctx, navState }: { list: GovAlertList } & SectionProps) {
  const create = useCreateAlert()
  const sendDraft = useSendAlert()
  const second = useSecondApproveAlert()
  const cancel = useCancelAlert()

  const [type, setType] = useState<'advisory' | 'emergency'>('advisory')
  const [target, setTarget] = useState(list.targets[0] ? tkey(list.targets[0]) : '')
  const [when, setWhen] = useState('now')
  const [custom, setCustom] = useState('')
  const [category, setCategory] = useState('outbreak')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sms, setSms] = useState(true)
  const [translate, setTranslate] = useState(true)
  const [confirm, setConfirm] = useState<null | { draft: boolean }>(null)
  const [secondFor, setSecondFor] = useState<GovAlert | null>(null)
  const [cancelFor, setCancelFor] = useState<GovAlert | null>(null)
  const [sendFor, setSendFor] = useState<GovAlert | null>(null)
  const [asPeer, setAsPeer] = useState(false)
  const applied = useRef(false)

  // Prefill from "Alert this district/state" on the map, "Draft an advisory" and "Call for donors".
  useEffect(() => {
    if (applied.current || !navState) return
    applied.current = true
    const t = navState.alertTarget
    if (t) {
      const match = list.targets.find((x) => x.id === t.unitId || (x.name === t.unitName))
      if (match) setTarget(tkey(match))
    }
    const d = navState.alertDraft
    if (d) {
      if (d.title) setTitle(d.title.slice(0, 80))
      if (d.body) setBody(d.body.slice(0, 320))
      if (d.category) setCategory(d.category)
      if (d.type) setType(d.type)
    }
  }, [navState, list.targets])

  const tgt = targetOf(list, target) ?? null
  const reach = useAlertReach(tgt ? { scope: tgt.scope, id: tgt.id } : null, category, type)
  const scheduled = scheduleIso(when, custom)
  const emergency = type === 'emergency'
  const invalid = !title.trim() || !body.trim() || !tgt || (when === 'custom' && !custom)

  const targetOptions = useMemo(() => list.targets.map((t) => ({ value: tkey(t), label: t.name })), [list.targets])
  const sendLabel = emergency ? 'Send for second approval' : scheduled ? 'Schedule advisory' : 'Send advisory'

  function reset() {
    setTitle('')
    setBody('')
    setWhen('now')
    setCustom('')
  }

  async function submit(asDraft: boolean) {
    if (!tgt) throw new Error('Choose who the alert goes to.')
    const draft: AlertDraft = {
      type,
      title: title.trim(),
      body: body.trim(),
      category,
      target: { scope: tgt.scope, id: tgt.id },
      scheduledAt: scheduled,
      sms,
      translate,
      saveAsDraft: asDraft,
    }
    const a = await create.mutateAsync(draft)
    reset()
    if (asDraft) return 'Draft saved.'
    if (a.status === 'pending_second_approval') return 'Saved. Waiting for a second admin to approve before it goes out.'
    if (a.status === 'scheduled') return `Scheduled for ${fmtDateTime(a.scheduledAt)}.`
    return `Sent to ${a.target.name}${a.reach !== null ? ` · reached ${fmtNum(a.reach)} app users` : ''}.`
  }

  const peerOffer = secondFor ? secondFor.issuedAtMyLevel && isDemoSession() : false

  return (
    <div className="gv-stack">
      <PageHeader
        eyebrow="Broadcast"
        title="Health alerts"
        subtitle="Alerts reach citizens' apps and, if you choose, SMS. Emergency alerts cannot be muted and need a second admin to confirm."
        actions={
          <Segmented
            label="Alert type"
            value={type}
            onChange={setType}
            emergencyValue="emergency"
            options={[
              { value: 'emergency', label: 'Emergency' },
              { value: 'advisory', label: 'Advisory' },
            ]}
          />
        }
      />
      {list.stats.awaitingSecondApproval ? (
        <Alert tone="warning" title={`${list.stats.awaitingSecondApproval} emergency alert${list.stats.awaitingSecondApproval > 1 ? 's' : ''} waiting for a second admin`}>
          {list.secondApprovalRule}
        </Alert>
      ) : null}
      <div className="gv-split">
        <Card title="Write the alert" titleAs="h2" actions={<Badge tone={emergency ? 'danger' : 'info'}>{emergency ? 'Emergency alert' : 'Health advisory'}</Badge>}>
          <form
            className="gv-tight"
            onSubmit={(e) => {
              e.preventDefault()
              if (!invalid) setConfirm({ draft: false })
            }}
          >
            <div className="gv-field-row">
              <Select label="Send to" value={target} onChange={setTarget} options={targetOptions} />
              <Select label="When" value={when} onChange={setWhen} options={WHEN} disabled={false} />
            </div>
            {when === 'custom' ? (
              <TextField label="Date and time (India time)" type="datetime-local" required value={custom} onChange={(e) => setCustom(e.target.value)} />
            ) : null}
            <Select label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
            <div>
              <TextField label="Title" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
              <p className="gv-ta-counter">{80 - title.length} characters left</p>
            </div>
            <div>
              <Textarea label="Message" required rows={5} maxLength={320} value={body} onChange={(e) => setBody(e.target.value)} />
              <p className="gv-ta-counter">{body.length} / 320 · plain words, one action</p>
            </div>
            <Switch label="Also send SMS" description="To phones without the app (mock SMS connector in the alpha)" checked={sms} onChange={setSms} />
            <Switch label="Translate automatically" description="Into the languages of the area" checked={translate} onChange={setTranslate} />
            <div className="gv-row">
              <Button type="submit" disabled={invalid} variant={emergency ? 'danger' : 'primary'}>
                {sendLabel}
              </Button>
              <Button variant="secondary" disabled={invalid} onClick={() => setConfirm({ draft: true })}>
                Save draft
              </Button>
              <Button variant="ghost" onClick={reset}>
                Clear
              </Button>
            </div>
            <p className="gv-muted" aria-live="polite">
              Estimated reach:{' '}
              <strong className="gv-strong">{reach.data ? `${fmtNum(reach.data.appRecipients)} app users` : reach.isError ? 'not available' : '...'}</strong>
              {reach.data && !emergency && reach.data.mutesApplied ? ' (people who muted this category are left out)' : ''}
              {reach.data && !reach.data.phoneOnlyRecipients.available ? ` · ${reach.data.phoneOnlyRecipients.reason}` : ''}
            </p>
          </form>
        </Card>
        <div className="gv-phone" aria-label="Preview of the notification on a phone">
          <div className="gv-phone-in">
            <div className="gv-phone-brand">
              <span>CareFusion AI</span>
              <span>now</span>
            </div>
            <div className={`gv-phone-card${emergency ? ' is-emergency' : ''}`}>
              <h4>
                {emergency ? 'Emergency alert' : 'Health advisory'} · {tgt?.name ?? 'Choose an area'}
              </h4>
              <h4>{title || 'Your title appears here'}</h4>
              <p>{body || 'Your message appears here. Keep it short and give one clear action.'}</p>
            </div>
            <p className="gv-phone-from">From {list.sender}</p>
          </div>
        </div>
      </div>

      <Card title="Sent and scheduled" titleAs="h2" actions={<span className="gv-muted">{list.stats.thisMonth} this month</span>}>
        {list.items.length ? (
          <ul className="gv-list" aria-label="Alerts sent and scheduled">
            {list.items.map((a) => (
              <AlertRow key={a.id} a={a} ctx={ctx} onSecond={setSecondFor} onCancel={setCancelFor} onSend={setSendFor} />
            ))}
          </ul>
        ) : (
          <EmptyState title="No alerts yet" titleAs="h4">
            Alerts you send or schedule appear here.
          </EmptyState>
        )}
        <p className="gv-muted" style={{ marginTop: 12 }}>
          {list.stats.scheduled} scheduled · {list.stats.drafts} drafts · {list.stats.awaitingSecondApproval} awaiting a second admin
        </p>
      </Card>

      <ActionModal
        open={confirm !== null}
        title={confirm?.draft ? 'Save as draft?' : emergency ? 'Send an emergency alert?' : scheduled ? 'Schedule this advisory?' : 'Send this advisory now?'}
        confirmLabel={confirm?.draft ? 'Save draft' : sendLabel}
        tone={emergency && !confirm?.draft ? 'danger' : 'primary'}
        noReason
        onClose={() => setConfirm(null)}
        onConfirm={() => submit(!!confirm?.draft)}
      >
        <div className="gv-tight">
          <p className="gv-body">
            <strong>{title}</strong>
          </p>
          <p className="gv-body">
            To {tgt?.name} · {reach.data ? `about ${fmtNum(reach.data.appRecipients)} app users` : 'reach not counted yet'}
            {sms ? ' · plus SMS' : ''}
          </p>
          {!confirm?.draft ? (
            emergency ? (
              <Alert tone="danger" title="Emergency alerts cannot be muted">
                It will not go out until a second admin approves it.
              </Alert>
            ) : (
              <Alert tone="warning">
                {scheduled ? `It goes out on ${fmtDateTime(scheduled)}.` : 'It goes out now and cannot be recalled.'}
              </Alert>
            )
          ) : null}
        </div>
      </ActionModal>

      <ActionModal
        open={secondFor !== null}
        title="Give second approval"
        confirmLabel="Approve and send"
        tone="danger"
        noReason
        onClose={() => {
          setSecondFor(null)
          setAsPeer(false)
        }}
        onConfirm={async () => {
          const a = await second.mutateAsync({ id: secondFor!.id, asPeer })
          setAsPeer(false)
          return a.status === 'scheduled' ? `Approved. Scheduled for ${fmtDateTime(a.scheduledAt)}.` : `Approved and sent to ${a.target.name}.`
        }}
        extra={
          peerOffer ? (
            <Checkbox
              checked={asPeer}
              onChange={setAsPeer}
              label="Demo only: a peer admin of my level signs as the second approver"
              description="You issued this alert. In a real deployment a different person must approve."
            />
          ) : undefined
        }
      >
        <p className="gv-body">
          <strong>{secondFor?.title}</strong> to {secondFor?.target.name}. Emergency alerts reach everyone in the area, even people who muted alerts.
        </p>
      </ActionModal>

      <ActionModal
        open={cancelFor !== null}
        title="Cancel this alert?"
        confirmLabel="Cancel alert"
        tone="danger"
        noReason
        onClose={() => setCancelFor(null)}
        onConfirm={async () => {
          await cancel.mutateAsync(cancelFor!.id)
          return 'Alert cancelled.'
        }}
      >
        <p className="gv-body">
          <strong>{cancelFor?.title}</strong> will not be sent.
        </p>
      </ActionModal>

      <ActionModal
        open={sendFor !== null}
        title={sendFor?.type === 'emergency' ? 'Send for second approval?' : 'Send this draft now?'}
        confirmLabel={sendFor?.type === 'emergency' ? 'Send for second approval' : 'Send'}
        tone={sendFor?.type === 'emergency' ? 'danger' : 'primary'}
        noReason
        onClose={() => setSendFor(null)}
        onConfirm={async () => {
          const a = await sendDraft.mutateAsync({ id: sendFor!.id })
          return a.status === 'pending_second_approval' ? 'Waiting for a second admin.' : a.status === 'scheduled' ? 'Scheduled.' : 'Sent.'
        }}
      >
        <p className="gv-body">
          <strong>{sendFor?.title}</strong> to {sendFor?.target.name}.
        </p>
      </ActionModal>
    </div>
  )
}

export default function Alerts(props: SectionProps) {
  const q = useGovAlerts()
  return (
    <QueryState q={q} skeleton={<Skeleton height={360} radius={16} />}>
      {(list) => <Body {...props} list={list} />}
    </QueryState>
  )
}

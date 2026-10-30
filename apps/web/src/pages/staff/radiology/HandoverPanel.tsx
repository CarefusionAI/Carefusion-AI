import { useState } from 'react'
import {
  useCreateRadHandover,
  useRadColleagues,
  useRadHandovers,
  useSignRadHandover,
  useWorklist,
} from '../../../api/radiology'
import type { HandoverView } from '../../../api/radiology'
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Select, Textarea } from '../../../components/ui'
import { ConfirmModal, ListSkeleton, LoadError } from '../../../components/ClinicalBits'
import { errorText } from '../../../api/clinicalHttp'
import { fmtDateTime } from './util'

const FLAG_TONE = { watch: 'danger', pending: 'warning', transfer: 'info', info: 'neutral' } as const
const FLAGS = [
  { value: 'info', label: 'For information' },
  { value: 'pending', label: 'Still pending' },
  { value: 'watch', label: 'Keep an eye on' },
  { value: 'transfer', label: 'Transfer' },
]
type Flag = 'watch' | 'pending' | 'transfer' | 'info'

function HandoverCard({ h, meId, onSign }: { h: HandoverView; meId: string | undefined; onSign: (h: HandoverView) => void }) {
  const mine = h.from.userId === meId
  const canSign = !h.signedAt && !mine && (!h.to || h.to.userId === meId)
  return (
    <div className="rt-ho">
      <div className="rt-bh">
        <strong style={{ color: 'var(--ink)' }}>
          {h.from.name} <span aria-hidden="true">→</span> {h.to ? h.to.name : 'next shift'}
        </strong>
        {h.signedAt ? (
          <Badge tone="success" dot>
            Signed by {h.signedBy?.name} · {fmtDateTime(h.signedAt)}
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            Not signed yet
          </Badge>
        )}
      </div>
      <p className="rt-muted">
        {h.unitName} · shift {h.shiftDate} · written {fmtDateTime(h.createdAt)}
      </p>
      {h.summary ? <p style={{ margin: 0, fontSize: 14 }}>{h.summary}</p> : null}
      {h.aiDraftText ? (
        <div className="rt-note">
          <Badge tone="ai">Simulated AI draft</Badge> <span>{h.aiDraftText}</span>
          <p className="rt-muted" style={{ marginTop: 6 }}>
            Simulated AI output. Decision support only; read and edit before you rely on it.
          </p>
        </div>
      ) : null}
      {h.items.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {h.items.map((it) => (
            <li key={it.id} className="rt-ho-item">
              <Badge tone={FLAG_TONE[it.flag as Flag] ?? 'neutral'}>{it.flag}</Badge>
              <span>
                {it.note}
                {it.fromAiDraft ? <span className="rt-src">From simulated AI draft</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {canSign ? (
        <div>
          <Button size="sm" variant="soft" onClick={() => onSign(h)}>
            Sign and take over
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Shift handover (design: "Shift handover notes"): write to a colleague, read recent handovers, sign the ones addressed to you. */
export default function HandoverPanel({ meId }: { meId: string | undefined }) {
  const list = useRadHandovers()
  const colleagues = useRadColleagues()
  const worklist = useWorklist()
  const create = useCreateRadHandover()
  const sign = useSignRadHandover()

  const [summary, setSummary] = useState('')
  const [toUserId, setToUserId] = useState('')
  const [useAi, setUseAi] = useState(false)
  const [items, setItems] = useState<{ orderId: string; flag: Flag; note: string }[]>([])
  const [signing, setSigning] = useState<HandoverView | null>(null)
  const [done, setDone] = useState(false)

  const orderOpts = [{ value: '', label: 'Not tied to an order' }, ...(worklist.data?.studies ?? []).map((s) => ({ value: s.orderId, label: `${s.orderRef} · ${s.bodyPart} · ${s.patientName}` }))]
  const canSave = summary.trim().length > 0 || items.some((i) => i.note.trim()) || useAi

  function save() {
    setDone(false)
    create.mutate(
      {
        toUserId: toUserId || undefined,
        summary: summary.trim() || undefined,
        useAiDraft: useAi,
        items: items.filter((i) => i.note.trim()).map((i) => ({ orderId: i.orderId || undefined, flag: i.flag, note: i.note.trim() })),
      },
      {
        onSuccess: () => {
          setSummary('')
          setItems([])
          setUseAi(false)
          setDone(true)
        },
      },
    )
  }

  return (
    <Card title="Shift handover" eyebrow="Radiology">
      <div className="rt-stack">
        <Select
          label="Hand over to"
          value={toUserId}
          onChange={setToUserId}
          placeholder="Next shift (anyone)"
          options={(colleagues.data ?? []).map((c) => ({ value: c.userId, label: c.name }))}
          helper="Only colleagues in radiology at your hospital."
        />
        <Textarea label="Handover note" placeholder="e.g. DR 1 calibration done at 15:10; CT head for the stat patient is still pending" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
        {items.map((it, i) => (
          <div key={i} className="rt-row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 160px' }}>
              <Select label="Flag" options={FLAGS} value={it.flag} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, flag: v as Flag } : x)))} />
            </div>
            <div style={{ flex: '2 1 220px' }}>
              <Select label="Order" options={orderOpts} value={it.orderId} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, orderId: v } : x)))} />
            </div>
            <div style={{ flex: '3 1 260px' }}>
              <Textarea label="Item note" rows={1} value={it.note} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
            </div>
            <Button size="sm" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}>
              Remove
            </Button>
          </div>
        ))}
        <div className="rt-row">
          <Button size="sm" variant="outline" onClick={() => setItems([...items, { orderId: '', flag: 'pending', note: '' }])}>
            Add an item
          </Button>
        </div>
        <Checkbox
          checked={useAi}
          onChange={setUseAi}
          label="Add a simulated AI draft"
          description="Simulated AI output summarising the queue. It is labelled as such and needs your review."
        />
        <div className="rt-row">
          <Button variant="soft" size="sm" loading={create.isPending} disabled={!canSave} onClick={save}>
            Save handover
          </Button>
          <span className="rt-muted">Timestamped and visible to the next shift.</span>
        </div>
        {create.isError ? <Alert tone="danger">{errorText(create.error)}</Alert> : null}
        {done ? <Alert tone="success" title="Handover saved">The person taking over signs it when they start their shift.</Alert> : null}
      </div>

      <h3 className="rt-h2" style={{ marginTop: 20 }}>
        Recent handovers
      </h3>
      {list.isLoading ? (
        <ListSkeleton rows={2} height={80} label="Loading handovers" />
      ) : list.isError ? (
        <LoadError error={list.error} onRetry={() => list.refetch()} />
      ) : list.data && list.data.length ? (
        <div className="rt-stack" style={{ marginTop: 8 }}>
          {list.data.map((h) => (
            <HandoverCard key={h.id} h={h} meId={meId} onSign={setSigning} />
          ))}
        </div>
      ) : (
        <EmptyState title="No handovers in the last two days">Notes you save above appear here.</EmptyState>
      )}

      <ConfirmModal
        open={!!signing}
        title="Sign this handover?"
        confirmLabel="Sign and take over"
        busy={sign.isPending}
        error={sign.error}
        onClose={() => {
          sign.reset()
          setSigning(null)
        }}
        onConfirm={() => signing && sign.mutate(signing.id, { onSuccess: () => setSigning(null) })}
      >
        <p style={{ margin: 0 }}>
          By signing you confirm that you have read the handover from {signing?.from.name} and you are taking over. A signed handover is a record and cannot be changed.
        </p>
      </ConfirmModal>
    </Card>
  )
}

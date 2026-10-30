import { useState } from 'react'
import { AIInsight, Badge, Button, Checkbox, Select, TextField, Textarea } from '../../../components/ui'
import { errMessage } from '../../../api/nurse'
import type { HandoverView } from '../../../api/nurse'
import { useLabColleagues, useLabCreateHandover, useLabHandovers, useLabMe, useLabSignHandover, useLabWorklist } from '../../../api/lab'
import { BoxHead, Empty, ErrorBlock, Loading, fmtDateTime } from './common'
import { ConfirmModal } from '../nurse/dialogs'

interface Item { key: string; orderId?: string; note: string; keep: boolean; ai: boolean }

/** Shift handover for the lab. The AI draft is simulated and is edited before it is written. */
export default function LabHandover() {
  const hv = useLabHandovers()
  const col = useLabColleagues()
  const wl = useLabWorklist()
  const me = useLabMe()
  const create = useLabCreateHandover()
  const sign = useLabSignHandover()
  const [to, setTo] = useState('')
  const [summary, setSummary] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [ai, setAi] = useState<string | null>(null)
  const [extra, setExtra] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [signing, setSigning] = useState<HandoverView | null>(null)
  const [signError, setSignError] = useState<string | null>(null)

  function draft() {
    const k = wl.data?.kpis
    const orders = wl.data?.orders ?? []
    const text = `${k?.openOrders ?? 0} open orders (${k?.statOrders ?? 0} STAT), ${k?.awaitingSample ?? 0} awaiting sample, ${k?.toVerify ?? 0} to verify, ${k?.samplesRejectedToday ?? 0} sample(s) rejected today.`
    setAi(text)
    if (!summary.trim()) setSummary(text)
    setItems(orders.filter((o) => o.priority === 'stat').map((o) => ({ key: o.orderId, orderId: o.orderId, keep: true, ai: true, note: `${o.orderRef} ${o.tests} (${o.patientName}) is STAT and still open.` })))
    setMsg(null)
  }

  function send() {
    setMsg(null)
    const kept = items.filter((i) => i.keep && i.note.trim())
    if (!kept.length && !summary.trim()) {
      setMsg({ ok: false, text: 'Add a summary or an item.' })
      return
    }
    create.mutate(
      { toUserId: to || undefined, summary: summary.trim() || undefined, useAiDraft: ai !== null, items: kept.map((i) => ({ orderId: i.orderId, flag: i.ai ? 'watch' : 'info', note: i.note.trim(), fromAiDraft: i.ai })) },
      {
        onSuccess: () => { setItems([]); setAi(null); setSummary(''); setMsg({ ok: true, text: 'Handover written. The next technician signs it to take over.' }) },
        onError: (e) => setMsg({ ok: false, text: errMessage(e) }),
      },
    )
  }

  return (
    <div className="lb-box">
      <BoxHead title="Shift handover" right={<Badge tone="neutral">{hv.data?.length ?? 0} recent</Badge>} />
      <div className="lb-actions" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <Select label="Hand over to" placeholder="Anyone on the next shift" options={(col.data ?? []).map((c) => ({ value: c.userId, label: c.name }))} value={to} onChange={setTo} />
        </div>
        <Button variant="outline" onClick={draft}>Draft with simulated AI</Button>
      </div>
      {ai ? (
        <AIInsight title="Handover draft" module="Lab shift handover" status="caution" simulated footer={<span className="lb-muted">Edit or untick items before you write it.</span>}>
          {ai}
        </AIInsight>
      ) : null}
      <Textarea label="Handover note" placeholder="e.g. Cobas c311 needs calibration before 15:00." rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={4000} />
      {items.map((it) => (
        <div className="lb-med" key={it.key}>
          <Checkbox label="" checked={it.keep} onChange={(v) => setItems((c) => c.map((x) => (x.key === it.key ? { ...x, keep: v } : x)))} />
          <div className="lb-grow">
            {it.ai ? <Badge tone="ai">Simulated AI draft</Badge> : null}
            <TextField label="Item" value={it.note} onChange={(e) => setItems((c) => c.map((x) => (x.key === it.key ? { ...x, note: e.target.value } : x)))} maxLength={1000} />
          </div>
        </div>
      ))}
      <div className="lb-actions" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}><TextField label="Add an item" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={1000} /></div>
        <Button size="sm" variant="soft" disabled={!extra.trim()} onClick={() => { setItems((c) => [...c, { key: `m-${Date.now()}`, note: extra.trim(), keep: true, ai: false }]); setExtra('') }}>Add</Button>
      </div>
      <div className="lb-actions">
        <Button loading={create.isPending} onClick={send}>Write handover</Button>
        {msg ? <Badge tone={msg.ok ? 'success' : 'danger'} icon={<span>{msg.ok ? '✓' : '‼'}</span>}>{msg.text}</Badge> : null}
      </div>

      {hv.isLoading ? (
        <Loading rows={2} label="Loading handovers" />
      ) : hv.isError ? (
        <ErrorBlock error={hv.error} onRetry={() => void hv.refetch()} />
      ) : (hv.data ?? []).length === 0 ? (
        <Empty title="No handovers yet">Handovers from the last two days show here.</Empty>
      ) : (
        <div className="lb-list">
          {hv.data!.map((h) => {
            const canSign = !h.signedAt && h.from.userId !== me.data?.userId && (!h.to || h.to.userId === me.data?.userId)
            return (
              <div className="lb-note" key={h.id}>
                <div className="lb-bh">
                  <strong style={{ color: 'var(--ink)' }}>{h.shiftDate} · from {h.from.name}</strong>
                  <Badge tone={h.signedAt ? 'success' : 'warning'} icon={<span>{h.signedAt ? '✓' : '…'}</span>}>{h.signedAt ? `Signed by ${h.signedBy?.name ?? ''}` : 'Waiting for sign-off'}</Badge>
                </div>
                {h.summary ? <p style={{ margin: '4px 0 0', fontSize: 14 }}>{h.summary}</p> : null}
                {h.aiDraftText ? <div style={{ marginTop: 6 }}><Badge tone="ai">Simulated AI draft used</Badge></div> : null}
                {h.items.map((i) => (
                  <div className="lb-pend-r" key={i.id}><span className={`lb-pd${i.flag === 'watch' ? ' is-bad' : ''}`} aria-hidden="true" /><span className="lb-grow">{i.note}</span></div>
                ))}
                <div className="lb-muted">{fmtDateTime(h.createdAt)}{h.to ? ` · to ${h.to.name}` : ''}</div>
                {canSign ? <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => { setSignError(null); setSigning(h) }}>Sign and take over</Button></div> : null}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmModal
        open={!!signing}
        title="Sign and take over this handover?"
        confirmLabel="Sign handover"
        busy={sign.isPending}
        error={signError}
        onClose={() => setSigning(null)}
        onConfirm={() => signing && sign.mutate(signing.id, { onSuccess: () => setSigning(null), onError: (e) => setSignError(errMessage(e)) })}
      >
        <p style={{ margin: 0 }}>You confirm you have read the notes from {signing?.from.name}. A signed handover is a record and cannot be changed.</p>
      </ConfirmModal>
    </div>
  )
}

import { useState } from 'react'
import {
  downloadDispensingCsv,
  useConfirmRecall,
  useDecideWardRequest,
  useDispensingLog,
  useExpiry,
  useMedicineBatches,
  useRecalls,
  useStock,
  useStockAction,
  useWardRequests,
} from '../../../api/pharmacist'
import type { ExpiryRow, RecallRow, StockActionBody, StockRow } from '../../../api/pharmacist'
import { errorText } from '../../../api/clinicalHttp'
import { Alert, Badge, Button, EmptyState, Modal, Select, Skeleton, StatCard, TextField, Textarea } from '../../../components/ui'
import { ACTION_LABEL, OUTCOME_LABEL, OUTCOME_TONE, fmtDate, fmtDateTime, inr, todayIst } from './util'

type Say = { say: (m: string) => void }

const LEVEL_W = { ok: '85%', low: '35%', out: '6%' } as const
const LEVEL_TEXT = { ok: 'In stock', low: 'Low', out: 'Out of stock' } as const
const LEVEL_TONE = { ok: 'success', low: 'warning', out: 'danger' } as const

// ------------------------------------------------------------------------------------ Stock
function BatchModal({ item, onClose, say }: { item: StockRow; onClose: () => void } & Say) {
  const batches = useMedicineBatches(item.medicineId)
  const act = useStockAction()
  const [target, setTarget] = useState<string | null>(null)
  const [action, setAction] = useState<StockActionBody['action']>('quarantine')
  const [reason, setReason] = useState('')
  const [qty, setQty] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    if (!target) return
    setErr(null)
    act.mutate(
      { stockItemId: target, action, reason: reason.trim(), quantity: qty ? Number(qty) : undefined },
      {
        onSuccess: (r) => {
          say(`${(ACTION_LABEL[action] ?? action).split(' (')[0]} · batch ${r.batchNo}`)
          setTarget(null)
          setReason('')
          setQty('')
        },
        onError: (e) => setErr(errorText(e)),
      },
    )
  }

  return (
    <Modal open title={`${item.medicine} · batches`} onClose={onClose} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      {batches.isLoading ? (
        <Skeleton lines={4} />
      ) : (
        <div className="ph-stack">
          {(batches.data ?? []).map((b) => (
            <div key={b.stockItemId} className="ph-ex">
              <div className="ph-ex-body">
                <strong>{b.batchNo}</strong>
                <p className="ph-muted">expires {fmtDate(b.expiryDate)} · {b.quantity} left · {inr(b.unitPrice)} each</p>
                {b.blocked ? <span className="ph-flag">Blocked{b.blockedReason ? `: ${b.blockedReason}` : ''}</span> : null}
              </div>
              <Button size="sm" variant="secondary" onClick={() => setTarget(b.stockItemId)}>Action</Button>
            </div>
          ))}
          {target ? (
            <div className="ph-stack">
              <Select label="What do you want to do?" value={action} onChange={(v) => setAction(v as StockActionBody['action'])} options={Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))} />
              {action !== 'quarantine' ? <TextField label={action === 'adjustment' ? 'Counted quantity' : 'Quantity'} type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} /> : null}
              <Textarea label="Reason (kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              {err ? <Alert tone="danger">{err}</Alert> : null}
              <div className="ph-row">
                <Button variant={action === 'write_off' ? 'danger' : 'primary'} onClick={submit} loading={act.isPending} disabled={reason.trim().length < 5}>Confirm</Button>
                <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  )
}

export function StockSection({ say }: Say) {
  const [level, setLevel] = useState('')
  const [q, setQ] = useState('')
  const stock = useStock(level, q)
  const wards = useWardRequests()
  const decide = useDecideWardRequest()
  const [open, setOpen] = useState<StockRow | null>(null)
  const s = stock.data?.summary

  return (
    <div className="ph-page">
      <section className="ph-grid ph-g4" aria-label="Stock summary">
        {s ? (
          <>
            <StatCard label="Items tracked" value={s.itemsTracked} tone="blue" />
            <StatCard label="Low" value={s.low} hint={`${s.out} out of stock`} tone="peach" />
            <StatCard label="Blocked batches" value={s.blockedBatches} />
            <StatCard label="Stock value" value={inr(s.stockValue)} hint={`${s.indentPending} indents pending`} tone="sage" />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={100} radius={16} />)
        )}
      </section>

      <div className="ph-row" style={{ alignItems: 'flex-end' }}>
        <TextField label="Search medicine" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ph-flt" role="group" aria-label="Stock level">
          {[['', 'All'], ['low', 'Low'], ['out', 'Out']].map(([v, l]) => (
            <button key={v} type="button" className="ph-fb" aria-pressed={level === v} onClick={() => setLevel(v!)}>{l}</button>
          ))}
        </div>
      </div>

      {stock.isError ? (
        <Alert tone="danger" title="Could not load stock">{errorText(stock.error)}</Alert>
      ) : stock.data && stock.data.items.length === 0 ? (
        <EmptyState title="No medicines match">Try another search.</EmptyState>
      ) : (
        <div className="ph-feed">
          {(stock.data?.items ?? []).map((it) => (
            <div key={it.medicineId} className="ph-ex">
              <div className="ph-ex-body">
                <strong>{it.medicine}</strong> <span className="ph-muted">{it.form}{it.schedule !== 'OTC' && it.schedule !== 'none' ? ` · Schedule ${it.schedule}` : ''}</span>
                <p className="ph-muted">
                  {it.onHand} on hand{it.reorderAt ? ` · reorder at ${it.reorderAt}` : ''} · {it.batches} batch{it.batches === 1 ? '' : 'es'}
                  {it.nearestExpiry ? ` · nearest expiry ${fmtDate(it.nearestExpiry)}` : ''}{it.nextSupply ? ` · next supply ${it.nextSupply}` : ''}
                </p>
              </div>
              <div className="ph-lvl" role="img" aria-label={LEVEL_TEXT[it.level]}><span className={`ph-lv-${it.level}`} style={{ width: LEVEL_W[it.level] }} /></div>
              <Badge tone={LEVEL_TONE[it.level]}>{LEVEL_TEXT[it.level]}</Badge>
              <Button size="sm" variant="secondary" onClick={() => setOpen(it)}>Batches</Button>
            </div>
          ))}
        </div>
      )}

      <div className="ph-stack">
        <h2 className="ph-h2">Ward requests</h2>
        {wards.data && wards.data.length > 0 ? (
          wards.data.map((w) => (
            <div key={w.id} className="ph-ex">
              <div className="ph-ex-body">
                <strong>{w.ward}</strong> · {w.medicine} × {w.quantity}
                <p className="ph-muted">{w.requestedBy} · {fmtDateTime(w.requestedAt)}{w.note ? ` · ${w.note}` : ''}</p>
              </div>
              <Badge tone={w.status === 'issued' ? 'success' : w.status === 'rejected' ? 'danger' : 'warning'}>{w.status}</Badge>
              {w.status === 'requested' || w.status === 'approved' ? (
                <>
                  <Button size="sm" onClick={() => decide.mutate({ id: w.id, decision: 'issued' }, { onSuccess: () => say('Issued to the ward'), onError: (e) => say(errorText(e)) })} loading={decide.isPending && decide.variables?.id === w.id}>Issue</Button>
                  <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: w.id, decision: 'rejected', note: 'Not available' }, { onSuccess: () => say('Request declined'), onError: (e) => say(errorText(e)) })}>Decline</Button>
                </>
              ) : null}
            </div>
          ))
        ) : (
          <p className="ph-muted">No ward requests right now.</p>
        )}
      </div>

      {open ? <BatchModal item={open} onClose={() => setOpen(null)} say={say} /> : null}
    </div>
  )
}

// ------------------------------------------------------------------------------------ Expiry and recalls
function dayClass(d: number) {
  return d <= 7 ? 'ph-d-bad' : d <= 30 ? 'ph-d-warn' : 'ph-d-ok'
}

function ExpiryItem({ r, onAct }: { r: ExpiryRow; onAct: (r: ExpiryRow) => void }) {
  return (
    <div className="ph-ex">
      <span className={`ph-days ${dayClass(r.daysLeft)}`}>{Math.max(0, r.daysLeft)}<small>days</small></span>
      <div className="ph-ex-body">
        <strong>{r.medicine}</strong>
        <p className="ph-muted">Batch {r.batchNo} · expires {fmtDate(r.expiryDate)} · {r.quantity} units · {inr(r.valueAtCost)}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => onAct(r)}>{r.suggestedAction === 'return_to_supplier' ? 'Return to supplier' : r.suggestedAction === 'use_first' ? 'Use first' : 'Quarantine'}</Button>
    </div>
  )
}

function RecallCard({ r, say }: { r: RecallRow; say: (m: string) => void }) {
  const confirm = useConfirmRecall()
  const [note, setNote] = useState('')
  const done = r.status === 'confirmed_off_shelf' || r.status === 'not_stocked'
  return (
    <div className="ph-fe" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="ph-bh">
        <div>
          <strong>{r.title}</strong>
          <p className="ph-muted">{r.recallRef} · {r.source}{r.recallClass ? ` · class ${r.recallClass}` : ''} · {fmtDate(r.issuedOn)}{r.batchNo ? ` · batch ${r.batchNo}` : ''}</p>
        </div>
        <Badge tone={done ? 'success' : r.urgent ? 'danger' : 'warning'} dot>
          {r.status === 'confirmed_off_shelf' ? 'Off the shelf' : r.status === 'not_stocked' ? 'Not stocked' : r.urgent ? 'Action needed' : 'To review'}
        </Badge>
      </div>
      {r.reason ? <p style={{ margin: 0 }}>{r.reason}</p> : null}
      {r.actionText ? <p className="ph-muted">{r.actionText}</p> : null}
      {done ? (
        <p className="ph-muted">Confirmed {fmtDateTime(r.confirmedAt)}{r.qtyOnShelf !== null ? ` · ${r.qtyOnShelf} units removed` : ''}.</p>
      ) : (
        <div className="ph-row" style={{ alignItems: 'flex-end' }}>
          <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={() => confirm.mutate({ id: r.recallId, status: 'confirmed_off_shelf', qtyOnShelf: r.qtyOnShelf ?? undefined, note: note.trim() || undefined }, { onSuccess: () => say('Confirmed off the shelf'), onError: (e) => say(errorText(e)) })} loading={confirm.isPending}>Taken off the shelf</Button>
          <Button variant="secondary" onClick={() => confirm.mutate({ id: r.recallId, status: 'not_stocked', note: note.trim() || undefined }, { onSuccess: () => say('Recorded as not stocked'), onError: (e) => say(errorText(e)) })}>We don't stock it</Button>
        </div>
      )}
    </div>
  )
}

export function ExpirySection({ say }: Say) {
  const expiry = useExpiry()
  const recalls = useRecalls()
  const act = useStockAction()
  const [target, setTarget] = useState<ExpiryRow | null>(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    if (!target) return
    const action: StockActionBody['action'] = target.suggestedAction === 'return_to_supplier' ? 'return_to_supplier' : 'quarantine'
    act.mutate(
      { stockItemId: target.stockItemId, action, reason: reason.trim() },
      {
        onSuccess: () => {
          say(action === 'quarantine' ? 'Batch quarantined' : 'Marked for return')
          setTarget(null)
          setReason('')
        },
        onError: (e) => setErr(errorText(e)),
      },
    )
  }

  const d = expiry.data
  return (
    <div className="ph-page">
      {d ? <Alert tone="info" title="Rule">{d.rule}</Alert> : null}
      <div className="ph-grid ph-g2">
        <div className="ph-stack">
          <h2 className="ph-h2">Expiring in 30 days {d ? <Badge tone="warning">{inr(d.within30DaysValue)} at cost</Badge> : null}</h2>
          {expiry.isLoading ? <Skeleton lines={4} /> : d && d.within30Days.length > 0 ? d.within30Days.map((r) => <ExpiryItem key={r.stockItemId} r={r} onAct={(x) => { setTarget(x); setErr(null) }} />) : <p className="ph-muted">Nothing expires in the next 30 days.</p>}
          <h2 className="ph-h2">31 to 90 days</h2>
          {d && d.within31to90Days.length > 0 ? d.within31to90Days.map((r) => <ExpiryItem key={r.stockItemId} r={r} onAct={(x) => { setTarget(x); setErr(null) }} />) : <p className="ph-muted">Nothing here.</p>}
        </div>
        <div className="ph-stack">
          <h2 className="ph-h2">Recalls</h2>
          {recalls.isLoading ? <Skeleton lines={4} /> : (recalls.data ?? []).length === 0 ? <p className="ph-muted">No recalls.</p> : recalls.data!.map((r) => <RecallCard key={r.recallId} r={r} say={say} />)}
        </div>
      </div>

      <Modal
        open={!!target}
        title={target ? `${target.medicine} · batch ${target.batchNo}` : ''}
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={submit} loading={act.isPending} disabled={reason.trim().length < 5}>Confirm</Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>The batch will no longer be offered at the counter. This is written to the audit log.</p>
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        {err ? <Alert tone="danger">{err}</Alert> : null}
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------------ Dispensing log
export function LogSection({ say }: Say) {
  const today = todayIst()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const log = useDispensingLog(from, to)
  const [busy, setBusy] = useState(false)

  async function onExport() {
    setBusy(true)
    try {
      const blob = await downloadDispensingCsv(from, to)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dispensing-log-${from}-${to}.csv`
      a.click()
      URL.revokeObjectURL(url)
      say('Log downloaded')
    } catch (e) {
      say(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ph-page">
      <div className="ph-row" style={{ alignItems: 'flex-end' }}>
        <TextField label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        <Button variant="secondary" onClick={() => void onExport()} loading={busy}>Download CSV</Button>
      </div>
      {log.isLoading ? (
        <Skeleton lines={6} />
      ) : log.isError ? (
        <Alert tone="danger" title="Could not load the log">{errorText(log.error)}</Alert>
      ) : (log.data ?? []).length === 0 ? (
        <EmptyState title="Nothing dispensed in these dates">Try a wider range. Demo data is dated 17 Oct 2026.</EmptyState>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Time', 'Prescription', 'Medicine', 'Outcome', 'Qty', 'Batch', 'By'].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--ink-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.data!.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="ph-mono" style={{ padding: '8px 10px' }}>{fmtDateTime(r.dispensedAt)}</td>
                  <td className="ph-mono" style={{ padding: '8px 10px' }}>{r.rxNumber}</td>
                  <td style={{ padding: '8px 10px' }}>{r.medicine}</td>
                  <td style={{ padding: '8px 10px' }}><Badge tone={OUTCOME_TONE[r.outcome] ?? 'neutral'}>{OUTCOME_LABEL[r.outcome] ?? r.outcome}</Badge></td>
                  <td style={{ padding: '8px 10px' }}>{r.quantity}</td>
                  <td className="ph-mono" style={{ padding: '8px 10px' }}>{r.batchNo ?? '—'}{r.batchOverrideReason ? ' *' : ''}</td>
                  <td style={{ padding: '8px 10px' }}>{r.pharmacist}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ph-muted">* A batch other than the earliest-expiry one was used; the reason is in the CSV.</p>
        </div>
      )}
    </div>
  )
}

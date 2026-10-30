import { useEffect, useMemo, useState } from 'react'
import {
  fetchHandoverQr,
  useCollected,
  useDispenseRx,
  useMarkReady,
  usePatientHistory,
  useQueue,
  useRefills,
  useRxDetail,
  useScanRx,
  useVerifyRx,
} from '../../../api/pharmacist'
import type { DispenseLineBody, HandoverQr, RxDetail, RxLine, RxStage } from '../../../api/pharmacist'
import { errorText } from '../../../api/clinicalHttp'
import { Alert, Badge, Button, EmptyState, Modal, Select, Skeleton, StatCard, TextField } from '../../../components/ui'
import QrCode from './QrCode'
import { CHECK_LABEL, STAGE_LABEL, STAGE_TONE, fmtDate, fmtDateTime } from './util'
import { demoDate } from '../../../lib/demoClock'

type Filter = 'all' | RxStage

interface LineState {
  outcome: 'dispensed' | 'substitute' | 'out_of_stock'
  qty: number
  stockItemId: string
  substituteMedicineId: string
  overrideReason: string
}

function initialLine(l: RxLine): LineState {
  return {
    outcome: l.inStock > 0 ? 'dispensed' : 'out_of_stock',
    qty: Math.min(l.remaining, l.inStock),
    stockItemId: l.fefoNextBatch?.stockItemId ?? '',
    substituteMedicineId: '',
    overrideReason: '',
  }
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div>
      <span className="ph-qty-lbl" id={`q-${label}`}>Quantity</span>
      <div className="ph-stp" role="group" aria-labelledby={`q-${label}`}>
        <button type="button" aria-label="Fewer" disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
        <span aria-live="polite">{value}</span>
        <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  )
}

function RxPanel({ detail, onChanged, say }: { detail: RxDetail; onChanged: () => void; say: (m: string) => void }) {
  const verify = useVerifyRx()
  const dispense = useDispenseRx()
  const ready = useMarkReady()
  const collected = useCollected()
  const history = usePatientHistory(detail.patient.personId)
  const [lines, setLines] = useState<Record<string, LineState>>({})
  const [err, setErr] = useState<string | null>(null)
  const [qr, setQr] = useState<HandoverQr | null>(null)
  const [confirmCollect, setConfirmCollect] = useState(false)
  const [collector, setCollector] = useState('')

  useEffect(() => {
    const next: Record<string, LineState> = {}
    for (const l of detail.items) next[l.itemId] = initialLine(l)
    setLines(next)
    setErr(null)
  }, [detail.prescription.id, detail.items])

  const rx = detail.prescription
  const stage: RxStage = rx.collectedAt ? 'collected' : rx.readyAt ? 'ready' : rx.verifiedAt ? 'verified' : 'pending'
  const blockers = detail.checks.filter((c) => c.severity === 'blocker' && !c.passed)
  const open = detail.items.filter((l) => l.remaining > 0)
  const set = (id: string, patch: Partial<LineState>) => setLines((s) => ({ ...s, [id]: { ...s[id]!, ...patch } }))

  function onVerify() {
    setErr(null)
    verify.mutate(rx.id, { onSuccess: (r) => (r.verified ? say(`Verified · token ${r.tokenLabel}`) : setErr('Fix the red checks first.')), onError: (e) => setErr(errorText(e)) })
  }

  function onDispense() {
    setErr(null)
    const body: DispenseLineBody[] = []
    for (const l of open) {
      const s = lines[l.itemId]
      if (!s) continue
      if (s.outcome === 'out_of_stock') {
        body.push({ itemId: l.itemId, outcome: 'out_of_stock', noteToDoctor: 'Out of stock at this pharmacy' })
        continue
      }
      if (s.qty < 1) continue
      const fefo = l.fefoNextBatch?.stockItemId
      const chosen = s.stockItemId || fefo
      if (s.outcome === 'dispensed' && chosen && fefo && chosen !== fefo && s.overrideReason.trim().length < 5) {
        setErr(`Say why you are not using the earliest-expiry batch for ${l.medicine}.`)
        return
      }
      if (s.outcome === 'substitute' && !s.substituteMedicineId) {
        setErr(`Choose a substitute for ${l.medicine}.`)
        return
      }
      body.push({
        itemId: l.itemId,
        outcome: s.outcome,
        quantity: s.qty,
        stockItemId: s.outcome === 'dispensed' ? chosen || undefined : undefined,
        substituteMedicineId: s.outcome === 'substitute' ? s.substituteMedicineId : undefined,
        batchOverrideReason: chosen && fefo && chosen !== fefo ? s.overrideReason.trim() : undefined,
        prescriberAgreed: s.outcome === 'substitute' ? true : undefined,
      })
    }
    if (body.length === 0) {
      setErr('Nothing to dispense yet. Set a quantity or mark an item out of stock.')
      return
    }
    dispense.mutate(
      { id: rx.id, lines: body },
      {
        onSuccess: (r) => {
          say(r.readyToCollect ? 'Dispensed · ready to collect' : r.partial ? 'Partly dispensed' : 'Dispensed')
          onChanged()
        },
        onError: (e) => setErr(errorText(e)),
      },
    )
  }

  function onReady() {
    setErr(null)
    ready.mutate(rx.id, { onSuccess: () => say('Marked ready to collect'), onError: (e) => setErr(errorText(e)) })
  }

  async function showQr() {
    setErr(null)
    try {
      setQr(await fetchHandoverQr(rx.id))
    } catch (e) {
      setErr(errorText(e))
    }
  }

  function onCollected() {
    collected.mutate(
      { id: rx.id, collectedByName: collector.trim() || undefined },
      {
        onSuccess: () => {
          setConfirmCollect(false)
          setCollector('')
          setQr(null)
          say('Handed over to the patient')
        },
        onError: (e) => setErr(errorText(e)),
      },
    )
  }

  return (
    <section className="ph-rx" aria-label={`Prescription ${rx.rxNumber}`}>
      <div className="ph-rx-h">
        <div>
          <span className="ph-mono">{rx.rxNumber}{rx.tokenLabel ? ` · token ${rx.tokenLabel}` : ''}</span>
          <h2>{detail.patient.fullName}</h2>
          <p className="ph-muted">
            {[detail.patient.age ? `${detail.patient.age} y` : null, detail.patient.sex].filter(Boolean).join(' · ')} · {detail.doctor.name}
            {detail.doctor.hprId ? ` · ${detail.doctor.hprId}` : ''} · valid until {fmtDate(rx.validUntil)}
          </p>
        </div>
        <Badge tone={STAGE_TONE[stage]} dot>{STAGE_LABEL[stage]}</Badge>
      </div>
      <div className="ph-rx-b">
        <div className="ph-checks" role="list" aria-label="Safety checks">
          {detail.checks.map((c) => {
            const cls = c.passed ? 'ok' : c.severity === 'blocker' ? 'bad' : 'warn'
            return (
              <div key={c.code} className={`ph-ck ${cls}`} role="listitem">
                <span className="ph-ico" aria-hidden="true">{c.passed ? '✓' : c.severity === 'blocker' ? '✕' : '!'}</span>
                <span>
                  <strong>{CHECK_LABEL[c.code] ?? c.code}</strong>
                  <span className="sr-only">{c.passed ? 'Passed. ' : c.severity === 'blocker' ? 'Blocked. ' : 'Check. '}</span>
                  {c.detail}
                </span>
              </div>
            )
          })}
        </div>

        {history.data && history.data.allergies.length > 0 ? (
          <Alert tone="warning" title="Allergies on file">{history.data.allergies.join(', ')}</Alert>
        ) : null}

        <div className="ph-stack">
          {detail.items.map((l) => {
            const s = lines[l.itemId]
            const done = l.remaining === 0
            return (
              <div key={l.itemId} className={`ph-it${done ? ' is-full' : l.inStock < l.remaining ? ' is-short' : ''}`}>
                <div className="ph-it-top">
                  <div>
                    <strong>{l.medicine}</strong> <span className="ph-muted">{l.form}</span>
                    <p className="ph-muted">
                      {[l.dose, l.frequency, l.durationDays ? `${l.durationDays} days` : null, l.withFood].filter(Boolean).join(' · ')}
                    </p>
                    {l.instructions ? <p className="ph-muted">{l.instructions}</p> : null}
                    {l.schedule !== 'OTC' && l.schedule !== 'none' ? <span className="ph-flag is-warn">Schedule {l.schedule}</span> : null}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Badge tone={done ? 'success' : l.inStock >= l.remaining ? 'neutral' : 'warning'}>
                      {done ? `Given ${l.dispensed}/${l.prescribed}` : `${l.remaining} to give · ${l.inStock} in stock`}
                    </Badge>
                  </div>
                </div>
                {!done && s && stage !== 'collected' ? (
                  <div className="ph-it-ctl">
                    <Select
                      label="What are you giving?"
                      value={s.outcome}
                      onChange={(v) => set(l.itemId, { outcome: v as LineState['outcome'], qty: v === 'out_of_stock' ? 0 : Math.min(l.remaining, Math.max(1, l.inStock)) })}
                      options={[
                        { value: 'dispensed', label: 'This medicine' },
                        ...(l.substitutes.length ? [{ value: 'substitute', label: 'A substitute' }] : []),
                        { value: 'out_of_stock', label: 'Out of stock' },
                      ]}
                    />
                    {s.outcome === 'dispensed' ? (
                      <Select
                        label="Batch (earliest expiry first)"
                        value={s.stockItemId}
                        onChange={(v) => set(l.itemId, { stockItemId: v })}
                        options={l.batches.filter((b) => !b.blocked && b.quantity > 0).map((b) => ({ value: b.stockItemId, label: `${b.batchNo} · exp ${fmtDate(b.expiryDate)} · ${b.quantity} left` }))}
                      />
                    ) : null}
                    {s.outcome === 'substitute' ? (
                      <Select
                        label="Substitute"
                        value={s.substituteMedicineId}
                        placeholder="Choose"
                        onChange={(v) => set(l.itemId, { substituteMedicineId: v })}
                        options={l.substitutes.map((x) => ({ value: x.medicineId, label: `${x.medicine} (${x.inStock} in stock)${x.requiresDoctorOk ? ' · needs doctor OK' : ''}` }))}
                      />
                    ) : null}
                    {s.outcome !== 'out_of_stock' ? (
                      <Stepper label={l.itemId} value={s.qty} max={l.remaining} onChange={(n) => set(l.itemId, { qty: n })} />
                    ) : null}
                    {s.outcome === 'dispensed' && s.stockItemId && l.fefoNextBatch && s.stockItemId !== l.fefoNextBatch.stockItemId ? (
                      <TextField label="Why not the earliest batch?" value={s.overrideReason} onChange={(e) => set(l.itemId, { overrideReason: e.target.value })} />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {err ? <Alert tone="danger" title="Could not continue">{err}</Alert> : null}
        {blockers.length > 0 && stage === 'pending' ? (
          <Alert tone="danger" title="Blocked">{blockers.map((b) => b.detail).join(' ')}</Alert>
        ) : null}

        <div className="ph-row">
          {stage === 'pending' ? <Button onClick={onVerify} loading={verify.isPending}>Verify prescription</Button> : null}
          {(stage === 'verified' || stage === 'pending') && open.length > 0 && stage === 'verified' ? (
            <Button onClick={onDispense} loading={dispense.isPending}>Dispense</Button>
          ) : null}
          {stage === 'verified' && open.length === 0 ? <Button onClick={onReady} loading={ready.isPending}>Mark ready to collect</Button> : null}
          {stage === 'verified' && open.length > 0 ? (
            <Button variant="secondary" onClick={onReady} loading={ready.isPending}>Close as partly dispensed</Button>
          ) : null}
          {stage === 'ready' ? (
            <>
              <Button variant="secondary" onClick={() => void showQr()}>Show handover code</Button>
              <Button onClick={() => setConfirmCollect(true)}>Handed over</Button>
            </>
          ) : null}
        </div>

        {history.data && history.data.history.length > 0 ? (
          <details>
            <summary className="ph-lk">Earlier dispensing for {history.data.patientName}</summary>
            <div className="ph-hist">
              {history.data.history.map((h, i) => (
                <div key={i} className="ph-fe" style={{ marginTop: 8 }}>
                  <span className="ph-fe-t">{fmtDate(h.dispensedAt)}</span>
                  <span>
                    <strong>{h.medicine}</strong> × {h.quantity}{h.type === 'partial' ? ` of ${h.prescribed}` : ''}
                    <span className="ph-muted"> · {h.rxNumber} · {h.doctor}{h.substitute ? ' · substitute' : ''}</span>
                  </span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <Modal open={!!qr} title="Handover code" onClose={() => setQr(null)} footer={<Button onClick={() => setQr(null)}>Close</Button>}>
        {qr ? (
          <div className="ph-qr">
            <QrCode text={qr.payload} label={`Handover code for ${qr.rxNumber}`} />
            <div className="ph-code">{qr.handoverCode}</div>
            <p className="ph-muted">{qr.note}</p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={confirmCollect}
        title="Hand over to the patient?"
        onClose={() => setConfirmCollect(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCollect(false)}>Not yet</Button>
            <Button onClick={onCollected} loading={collected.isPending}>Confirm handover</Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>This closes the prescription. Check the handover code or the patient's ID before you confirm.</p>
        <TextField label="Collected by" optional value={collector} onChange={(e) => setCollector(e.target.value)} helper="Leave empty if it is the patient." />
      </Modal>
    </section>
  )
}

export default function Queue({ say }: { say: (m: string) => void }) {
  const queue = useQueue()
  const scan = useScanRx()
  const refills = useRefills(7)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [qrToken, setQrToken] = useState('')
  const [scanErr, setScanErr] = useState<string | null>(null)
  const detail = useRxDetail(selected)

  const rows = useMemo(() => (queue.data?.prescriptions ?? []).filter((r) => filter === 'all' || r.stage === filter), [queue.data, filter])
  useEffect(() => {
    const first = queue.data?.prescriptions[0]
    if (!selected && first) setSelected(first.prescriptionId)
  }, [queue.data, selected])

  function onScan() {
    setScanErr(null)
    scan.mutate(qrToken.trim(), {
      onSuccess: (r) => {
        setSelected(r.prescriptionId)
        setQrToken('')
        say(`Added ${r.rxNumber} to the queue`)
      },
      onError: (e) => setScanErr(errorText(e)),
    })
  }

  const k = queue.data?.kpis
  return (
    <div className="ph-page">
      <section className="ph-grid ph-g4" aria-label="Today at the counter">
        {queue.isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={100} radius={16} />)
        ) : k ? (
          <>
            <StatCard label="Waiting" value={k.waiting} hint="Not verified yet" tone="peach" />
            <StatCard label="Ready to collect" value={k.readyToCollect} hint="Waiting for the patient" tone="blue" />
            <StatCard label="Dispensed today" value={k.dispensedToday} tone="sage" />
            <StatCard label="Low stock" value={k.lowStockBatches} hint={`${k.expiringWithin30Days} expiring in 30 days`} />
          </>
        ) : null}
      </section>

      <div className="ph-grid ph-gm">
        <div className="ph-col">
          <div className="ph-stack">
            <div className="ph-flt" role="group" aria-label="Filter queue">
              {(['all', 'pending', 'verified', 'ready', 'collected'] as Filter[]).map((f) => (
                <button key={f} type="button" className="ph-fb" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : STAGE_LABEL[f]}
                </button>
              ))}
            </div>
            {queue.isLoading ? (
              <Skeleton lines={5} />
            ) : queue.isError ? (
              <Alert tone="danger" title="Could not load the queue">{errorText(queue.error)}</Alert>
            ) : rows.length === 0 ? (
              <EmptyState title="Nothing in this list">New prescriptions from doctors appear here by themselves.</EmptyState>
            ) : (
              <div className="ph-q">
                {rows.map((r) => (
                  <button key={r.prescriptionId} type="button" className={`ph-qi${r.prescriptionId === selected ? ' is-sel' : ''}${r.stage === 'collected' ? ' is-done' : ''}`} onClick={() => setSelected(r.prescriptionId)} aria-pressed={r.prescriptionId === selected}>
                    <span className="ph-tok">{r.tokenLabel ?? '—'}</span>
                    <span className="ph-qi-body">
                      <strong>{r.patientName}</strong>
                      <span className="ph-muted">{r.rxNumber} · {r.itemCount} item{r.itemCount === 1 ? '' : 's'} · {r.doctor.name}{r.stage === 'pending' ? ` · waiting ${r.waitingMinutes} min` : ''}</span>
                    </span>
                    <Badge tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ph-stack">
            <h2 className="ph-h2">Add a walk-in prescription</h2>
            <div className="ph-row" style={{ alignItems: 'flex-end' }}>
              <TextField label="Scan or paste the prescription code" value={qrToken} onChange={(e) => setQrToken(e.target.value)} />
              <Button variant="secondary" onClick={onScan} disabled={qrToken.trim().length < 6} loading={scan.isPending}>Add</Button>
            </div>
            {scanErr ? <Alert tone="danger">{scanErr}</Alert> : null}
          </div>

          <div className="ph-stack">
            <h2 className="ph-h2">Refills due this week</h2>
            {refills.data && refills.data.length > 0 ? (
              <div className="ph-feed">
                {refills.data.map((r) => (
                  <div key={`${r.rxNumber}-${r.medicine}`} className="ph-fe">
                    <span className="ph-fe-t">{fmtDate(r.refillDueAt)}</span>
                    <span><strong>{r.patientName}</strong> · {r.medicine}{r.overdue ? <Badge tone="warning"> overdue</Badge> : null}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ph-muted">No refills due.</p>
            )}
          </div>
        </div>

        <div className="ph-col">
          {detail.isLoading && selected ? (
            <Skeleton height={360} radius={20} />
          ) : detail.isError ? (
            <Alert tone="danger" title="Could not open this prescription">{errorText(detail.error)}</Alert>
          ) : detail.data ? (
            <RxPanel detail={detail.data} onChanged={() => void detail.refetch()} say={say} />
          ) : (
            <EmptyState title="Choose a prescription">Pick one from the queue to check and dispense it.</EmptyState>
          )}
          <p className="ph-muted">Last checked {fmtDateTime(demoDate().toISOString())}. Synthetic demo data.</p>
        </div>
      </div>
    </div>
  )
}

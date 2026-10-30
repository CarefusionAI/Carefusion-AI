import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Checkbox, Select, TextField } from '../../../components/ui'
import { errMessage } from '../../../api/nurse'
import { useCollectSpecimen, useLabOrder, useLabWorklist, useSpecimenAction } from '../../../api/lab'
import type { LabSpecimen } from '../../../api/lab'
import { BoxHead, Empty, ErrorBlock, Loading, PRIORITY, PageLoading, STAGE, fmtTime, refText, waitText } from './common'
import { ReasonModal } from '../nurse/dialogs'
import type { Go } from '../nurse/types'

/** Deterministic decorative barcode from the order reference (the real label is printed by the label service). */
function Barcode({ seed }: { seed: string }) {
  const bars: { x: number; w: number }[] = []
  let x = 10
  let h = 7
  for (let i = 0; i < 70 && x < 250; i++) {
    h = (h * 31 + seed.charCodeAt(i % seed.length) + i) % 97
    const w = 1.5 + (h % 4)
    bars.push({ x, w })
    x += w + 2 + (h % 3)
  }
  return (
    <svg viewBox="0 0 260 70" width="100%" height="70" aria-hidden="true">
      <g fill="#3f5263">{bars.map((b, i) => <rect key={i} x={b.x} y="6" width={b.w} height="58" />)}</g>
    </svg>
  )
}

const SPEC_TONE: Record<string, 'info' | 'success' | 'danger' | 'neutral' | 'warning'> = { collected: 'info', in_lab: 'success', rejected: 'danger', done: 'neutral', pending: 'warning' }
const SPEC_LABEL: Record<string, string> = { collected: 'Collected', in_lab: 'Received in lab', rejected: 'Rejected', done: 'Done', pending: 'Pending' }

export default function Collect({ orderId, go }: { orderId: string | null; go: Go }) {
  const wl = useLabWorklist()
  const options = useMemo(() => (wl.data?.orders ?? []).filter((o) => ['new', 'awaiting_sample', 'running'].includes(o.stage)), [wl.data])
  const id = orderId ?? options[0]?.orderId ?? null
  const detail = useLabOrder(id)
  const collect = useCollectSpecimen()
  const spec = useSpecimenAction()
  const [checks, setChecks] = useState({ band: false, fasting: false, consent: false })
  const [tubes, setTubes] = useState<Record<string, boolean>>({})
  const [barcode, setBarcode] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [rejecting, setRejecting] = useState<LabSpecimen | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  useEffect(() => {
    setChecks({ band: false, fasting: false, consent: false })
    setTubes({})
    setBarcode('')
    setMsg(null)
  }, [id])

  if (wl.isLoading) return <PageLoading title="sample collection" />
  if (wl.isError) return <ErrorBlock error={wl.error} onRetry={() => void wl.refetch()} />
  if (!id) {
    return (
      <div className="lb-pg">
        <header><h1 className="lb-h1">Sample collection</h1></header>
        <Empty title="No orders to collect for" action={<Button variant="secondary" onClick={() => go('home')}>Back to worklist</Button>}>
          Every open order already has a sample. New orders appear on the worklist.
        </Empty>
      </div>
    )
  }

  const d = detail.data
  // Group tests by tube so one tick means one physical tube.
  const tubeGroups = (() => {
    const m = new Map<string, string[]>()
    for (const t of d?.tests ?? []) {
      const k = t.tubeType ?? 'Tube not specified'
      m.set(k, [...(m.get(k) ?? []), t.name])
    }
    return [...m.entries()].map(([name, names]) => ({ name, names }))
  })()
  const fastingNeeded = (d?.tests ?? []).some((t) => t.fastingRequired)
  const activeSpec = (d?.specimens ?? []).filter((s) => s.status !== 'rejected')
  const allTubes = tubeGroups.length > 0 && tubeGroups.every((g) => tubes[g.name])
  const ready = checks.band && (!fastingNeeded || checks.fasting) && allTubes
  const wlOrder = wl.data!.orders.find((o) => o.orderId === id)

  function mark() {
    if (!d) return
    setMsg(null)
    collect.mutate(
      {
        orderId: d.order.id,
        barcode: barcode.trim() || undefined,
        tubeType: tubeGroups.map((g) => g.name).join(', ').slice(0, 60),
        tubeCount: Math.min(20, Math.max(1, tubeGroups.length)),
        fasting: fastingNeeded ? checks.fasting : undefined,
      },
      {
        onSuccess: (r) => setMsg({ ok: true, text: `Collected ${fmtTime(r.collectedAt)} · barcode ${r.barcode}` }),
        onError: (e) => setMsg({ ok: false, text: errMessage(e) }),
      },
    )
  }

  return (
    <div className="lb-pg">
      <header className="lb-head">
        <div>
          <h1 className="lb-h1">Sample collection</h1>
          <p className="lb-sub">Scan the order barcode, check the patient band, then label the tubes.</p>
        </div>
        <div style={{ minWidth: 260 }}>
          <Select
            label="Order"
            options={options.map((o) => ({ value: o.orderId, label: `${o.orderRef} · ${o.patientName} · ${o.tests}` }))}
            value={id}
            onChange={(v) => go('collect', { order: v })}
          />
        </div>
      </header>

      {detail.isLoading ? (
        <Loading rows={6} label="Loading order" />
      ) : detail.isError ? (
        <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
      ) : d ? (
        <section className="lb-grid lb-g21">
          <div className="lb-box">
            <BoxHead
              title={`Order ${d.order.orderRef} · ${d.patient.fullName}${d.patient.age != null ? `, ${d.patient.age}` : ''}${d.patient.sex ? ` ${d.patient.sex.charAt(0).toUpperCase()}` : ''}`}
              right={<div className="lb-actions"><Badge tone="info">{d.patient.location}</Badge>{wlOrder ? <Badge tone={STAGE[wlOrder.stage].tone} icon={<span>{STAGE[wlOrder.stage].icon}</span>}>{STAGE[wlOrder.stage].label}</Badge> : null}</div>}
            />
            <div className="lb-scan" role="img" aria-label="Barcode label preview"><Barcode seed={d.order.orderRef} /></div>
            <p className="lb-code">{activeSpec[0]?.barcode ?? `${d.order.orderRef}-????`}</p>
            <p className="lb-muted" style={{ margin: 0 }}>
              {(PRIORITY[d.order.priority] ?? PRIORITY.routine!).label} · ordered by {d.order.orderedBy ?? 'the doctor'} · {d.order.details}
              {wlOrder ? ` · waiting ${waitText(wlOrder.waitingMinutes)}` : ''}
            </p>

            <h3 className="lb-bt">Tubes to fill</h3>
            <div className="lb-tube-grid">
              {tubeGroups.map((g) => {
                const on = !!tubes[g.name]
                return (
                  <div key={g.name} className={`lb-med${on ? ' is-done' : ''}`}>
                    <button type="button" className="lb-chk" aria-pressed={on} aria-label={`${on ? 'Undo filled' : 'Mark filled'}: ${g.name}`} onClick={() => setTubes((t) => ({ ...t, [g.name]: !on }))}>{on ? '✓' : ''}</button>
                    <div className="lb-grow"><strong className="lb-strong">{g.name}</strong><div className="lb-muted">{g.names.join(', ')}</div></div>
                  </div>
                )
              })}
            </div>

            <dl className="lb-kvx">
              <div><dt>Fasting</dt><dd className={fastingNeeded ? '' : 'is-good'}>{fastingNeeded ? 'Required for this order' : 'Not required'}</dd></div>
              <div><dt>Tubes</dt><dd>{tubeGroups.length}</dd></div>
              <div><dt>Collector</dt><dd>You</dd></div>
              <div><dt>Specimens so far</dt><dd>{activeSpec.length}</dd></div>
            </dl>

            <TextField label="Barcode" optional placeholder="Scan the label, or leave empty to assign one" value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={60} />

            {msg ? <Alert tone={msg.ok ? 'success' : 'danger'} title={msg.ok ? 'Sample recorded' : 'Not saved'}>{msg.text}</Alert> : null}
            <div className="lb-actions">
              <Button disabled={!ready} loading={collect.isPending} onClick={mark}>Mark collected</Button>
              {msg?.ok ? <Button variant="secondary" onClick={() => go('results', { order: d.order.id })}>Go to result entry</Button> : null}
              <Button variant="secondary" onClick={() => window.print()}>Print labels</Button>
            </div>
            {!ready ? <p className="lb-muted" style={{ margin: 0 }}>Tick every tube and the band check to enable collection.</p> : null}

            {d.specimens.length > 0 ? (
              <div className="lb-pend">
                <strong className="lb-strong">Specimens for this order</strong>
                {d.specimens.map((s) => (
                  <div className="lb-pend-r" key={s.id}>
                    <span className="lb-mono">{s.barcode}</span>
                    <span className="lb-grow">{s.tubeType ?? 'Tube'} × {s.tubeCount}{s.collectedAt ? ` · collected ${fmtTime(s.collectedAt)}` : ''}{s.rejectedReason ? ` · ${s.rejectedReason}` : ''}</span>
                    <Badge tone={SPEC_TONE[s.status] ?? 'neutral'} icon={<span>{s.status === 'rejected' ? '✕' : '✓'}</span>}>{SPEC_LABEL[s.status] ?? s.status}</Badge>
                    {s.status === 'collected' ? (
                      <button type="button" className="lb-lk" disabled={spec.isPending} onClick={() => spec.mutate({ id: s.id, action: 'receive' }, { onError: (e) => setMsg({ ok: false, text: errMessage(e) }) })}>Receive</button>
                    ) : null}
                    {['pending', 'collected', 'in_lab'].includes(s.status) ? (
                      <button type="button" className="lb-lk" onClick={() => { setModalError(null); setRejecting(s) }}>Reject sample…</button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="lb-list" style={{ gap: 18 }}>
            <div className="lb-box">
              <h2 className="lb-bt">Checks before collection</h2>
              <Checkbox label="Name and band ID match the order" checked={checks.band} onChange={(v) => setChecks((c) => ({ ...c, band: v }))} />
              {fastingNeeded ? (
                <Checkbox label="Fasting confirmed" description="At least the hours the test asks for" checked={checks.fasting} onChange={(v) => setChecks((c) => ({ ...c, fasting: v }))} />
              ) : (
                <p className="lb-muted" style={{ margin: 0 }}><span className="lb-ok" aria-hidden="true">✓</span> Fasting status: not required</p>
              )}
              <Checkbox label="Consent recorded by the ward" checked={checks.consent} onChange={(v) => setChecks((c) => ({ ...c, consent: v }))} />
              <h3 className="lb-bt" style={{ marginTop: 8 }}>Waiting for a sample</h3>
              {options.filter((o) => o.stage !== 'running').slice(0, 5).map((o) => (
                <div className="lb-row" key={o.orderId}>
                  <span className="lb-muted" style={{ width: 70 }}>{o.orderRef}</span>
                  <span className="lb-grow" style={{ fontSize: 14 }}>{o.tests}</span>
                  <Badge tone={o.priority === 'stat' ? 'danger' : 'neutral'} icon={<span>{o.priority === 'stat' ? '‼' : '…'}</span>}>{waitText(o.waitingMinutes)}</Badge>
                  <button type="button" className="lb-lk" aria-label={`Open ${o.orderRef}`} onClick={() => go('collect', { order: o.orderId })}>Open</button>
                </div>
              ))}
              {options.filter((o) => o.stage !== 'running').length === 0 ? <p className="lb-muted" style={{ margin: 0 }}>No other orders are waiting.</p> : null}
            </div>
            <div className="lb-box">
              <h2 className="lb-bt">Tests on this order</h2>
              {d.tests.map((t) => (
                <div className="lb-row" key={t.itemId}>
                  <div className="lb-grow"><strong className="lb-strong">{t.name}</strong><div className="lb-muted">{t.specimenType ?? ''} · ref {refText(t)} {t.unit ?? ''}</div></div>
                  <Badge tone="neutral">{t.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <ReasonModal
        open={!!rejecting}
        title="Reject this sample?"
        confirmLabel="Reject sample"
        label="Why is the sample rejected?"
        helper="The ordering doctor is told that a new sample is needed."
        busy={spec.isPending}
        error={modalError}
        onClose={() => { setRejecting(null); setModalError(null) }}
        onConfirm={(reason) => rejecting && spec.mutate({ id: rejecting.id, action: 'reject', reason }, { onSuccess: () => setRejecting(null), onError: (e) => setModalError(errMessage(e)) })}
      >
        <p style={{ margin: 0 }}>Barcode {rejecting?.barcode}</p>
      </ReasonModal>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { AIInsight, Alert, Badge, Button, Select, Textarea } from '../../../components/ui'
import { errMessage } from '../../../api/nurse'
import { useEnterResults, useLabOrder, useLabWorklist } from '../../../api/lab'
import type { LabResult, LabResultValue, LabTest } from '../../../api/lab'
import { BoxHead, Empty, ErrorBlock, FlagBadge, Loading, PageLoading, STAGE, flagFor, flagFromServer, refText } from './common'
import type { FlagKind } from './common'
import { ConfirmModal } from '../nurse/dialogs'
import CriticalBox, { CallModal } from './CriticalBox'
import type { Go } from '../nurse/types'

const isTextTest = (t: LabTest) => t.refLow == null && t.refHigh == null && !t.unit

function markPos(v: number, lo: number | null, hi: number | null): number {
  if (lo == null || hi == null || hi === lo || Number.isNaN(v)) return 50
  return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 50 + 25))
}

export default function Results({ orderId, go }: { orderId: string | null; go: Go }) {
  const wl = useLabWorklist()
  const options = useMemo(() => (wl.data?.orders ?? []).filter((o) => o.stage !== 'new'), [wl.data])
  const id = orderId ?? options.find((o) => o.stage === 'running' || o.stage === 'to_verify')?.orderId ?? options[0]?.orderId ?? null
  const detail = useLabOrder(id)
  const enter = useEnterResults()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saved, setSaved] = useState<LabResult | null>(null)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [call, setCall] = useState<{ resultValueId: string; label: string; suggestedName: string } | null>(null)

  const d = detail.data
  const current: LabResult | undefined = saved ?? d?.results.find((r) => ['draft', 'preliminary', 'verified', 'released', 'amended'].includes(r.status))

  // Fill the form from any existing draft / verified result when the order loads.
  useEffect(() => {
    setSaved(null)
    setMsg(null)
    setSubmitted(false)
    const r = d?.results.find((x) => ['draft', 'preliminary', 'verified', 'released', 'amended'].includes(x.status))
    const next: Record<string, string> = {}
    for (const v of r?.values ?? []) next[v.testCode] = v.valueNum != null ? String(v.valueNum) : (v.valueText ?? '')
    setVals(next)
    setComment(r?.clinicalComment ?? '')
  }, [d?.order.id, detail.dataUpdatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (wl.isLoading) return <PageLoading title="result entry" />
  if (wl.isError) return <ErrorBlock error={wl.error} onRetry={() => void wl.refetch()} />
  if (!id) {
    return (
      <div className="lb-pg">
        <header><h1 className="lb-h1">Result entry</h1></header>
        <Empty title="No orders ready for results" action={<Button variant="secondary" onClick={() => go('collect')}>Go to sample collection</Button>}>
          Collect a sample first, then enter the results here.
        </Empty>
      </div>
    )
  }

  const tests = d?.tests ?? []
  const locked = current?.status === 'released' || current?.status === 'amended'
  const serverByCode = new Map<string, LabResultValue>((current?.values ?? []).map((v) => [v.testCode, v]))
  const wlOrder = wl.data!.orders.find((o) => o.orderId === id)

  function rowFlag(t: LabTest): FlagKind {
    const raw = vals[t.testCode]
    if (raw == null || raw.trim() === '') return 'none'
    if (isTextTest(t)) return 'none'
    const n = Number(raw)
    return flagFor(n, t)
  }
  const flags = tests.map((t) => rowFlag(t))
  const abnormal = flags.filter((f) => f !== 'normal' && f !== 'none').length
  const criticals = flags.filter((f) => f === 'crit-low' || f === 'crit-high').length

  function errorFor(t: LabTest): string | undefined {
    const raw = (vals[t.testCode] ?? '').trim()
    if (raw === '') return 'Value needed'
    if (!isTextTest(t) && !Number.isFinite(Number(raw))) return 'Enter a number'
    return undefined
  }
  const incomplete = tests.some((t) => errorFor(t))

  function payload(action: 'save' | 'verify' | 'release') {
    return {
      orderId: id!,
      action,
      clinicalComment: comment.trim() || undefined,
      values: tests
        .filter((t) => (vals[t.testCode] ?? '').trim() !== '')
        .map((t) => (isTextTest(t) ? { testCode: t.testCode, valueText: vals[t.testCode]!.trim() } : { testCode: t.testCode, valueNum: Number(vals[t.testCode]) })),
    }
  }

  function run(action: 'save' | 'verify' | 'release', after?: () => void) {
    setMsg(null)
    setModalError(null)
    setSubmitted(true)
    const p = payload(action)
    if (p.values.length === 0) {
      setMsg({ ok: false, text: 'Enter at least one value.' })
      after?.()
      return
    }
    if (action !== 'save' && incomplete) {
      setMsg({ ok: false, text: 'Every test needs a value before you verify or release.' })
      after?.()
      return
    }
    enter.mutate(p, {
      onSuccess: (r) => {
        setSaved(r.result)
        after?.()
        const word = action === 'save' ? 'Draft saved' : action === 'verify' ? 'Verified' : 'Verified and released'
        setMsg({ ok: true, text: `${word}.${r.criticalValues.length ? ` ${r.criticalValues.length} critical value(s) need a phone call with read-back.` : ''}` })
      },
      onError: (e) => {
        if (after) setModalError(errMessage(e))
        else setMsg({ ok: false, text: errMessage(e) })
      },
    })
  }

  const serverCriticals = (current?.values ?? []).filter((v) => v.isCritical)
  const deltas = (current?.values ?? []).filter((v) => v.prevValue != null)

  return (
    <div className="lb-pg">
      <header className="lb-head">
        <div>
          <h1 className="lb-h1">Result entry</h1>
          <p className="lb-sub">
            {d ? `${d.order.orderRef} · ${d.order.details} · ${d.patient.fullName}${d.patient.age != null ? `, ${d.patient.age}` : ''}${d.patient.sex ? ` ${d.patient.sex.charAt(0).toUpperCase()}` : ''} · ${d.order.orderedBy ?? ''}` : 'Loading order'}
          </p>
        </div>
        <div className="lb-actions" style={{ alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260 }}>
            <Select label="Order" options={options.map((o) => ({ value: o.orderId, label: `${o.orderRef} · ${o.patientName} · ${o.tests}` }))} value={id} onChange={(v) => go('results', { order: v })} />
          </div>
          {wlOrder ? <Badge tone={STAGE[wlOrder.stage].tone} icon={<span>{STAGE[wlOrder.stage].icon}</span>}>{STAGE[wlOrder.stage].label}</Badge> : null}
          {current ? <Badge tone={current.status === 'released' ? 'success' : current.status === 'verified' ? 'info' : 'neutral'}>Result: {current.status}</Badge> : null}
        </div>
      </header>

      {detail.isLoading ? (
        <Loading rows={6} label="Loading order" />
      ) : detail.isError ? (
        <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
      ) : d ? (
        <section className="lb-grid lb-g21">
          <form className="lb-box" aria-label="Enter results" onSubmit={(e: FormEvent) => { e.preventDefault(); run('save') }} noValidate>
            <div className="lb-res is-head" aria-hidden="true"><span>Test</span><span>Value</span><span>Unit</span><span>Where it sits</span><span>Reference</span><span>Flag</span></div>
            {tests.map((t, i) => {
              const kind = locked ? flagFromServer(serverByCode.get(t.testCode)?.flag ?? null) : flags[i]!
              const n = Number(vals[t.testCode])
              const err = submitted ? errorFor(t) : undefined
              return (
                <div className="lb-res" key={t.itemId}>
                  <label className="lb-res-n" htmlFor={`res-${t.testCode}`}>{t.name}</label>
                  <div>
                    <input
                      id={`res-${t.testCode}`}
                      className="lb-res-i"
                      inputMode={isTextTest(t) ? 'text' : 'decimal'}
                      value={vals[t.testCode] ?? ''}
                      disabled={locked}
                      aria-invalid={err ? true : undefined}
                      aria-describedby={`res-ref-${t.testCode}`}
                      onChange={(e) => setVals((v) => ({ ...v, [t.testCode]: e.target.value }))}
                    />
                    {err ? <div className="lb-bad" style={{ fontSize: 12 }} role="alert">{err}</div> : null}
                  </div>
                  <span className="lb-muted">{t.unit ?? ''}</span>
                  <span className="lb-rng" aria-hidden="true">
                    <span className="lb-rng-ok" />
                    {!isTextTest(t) && Number.isFinite(n) && (vals[t.testCode] ?? '') !== '' ? <span className="lb-rng-m" style={{ left: `${markPos(n, t.refLow, t.refHigh)}%` }} /> : null}
                  </span>
                  <span className="lb-muted" id={`res-ref-${t.testCode}`}>{refText(t)}</span>
                  <FlagBadge kind={kind} />
                </div>
              )
            })}
            <Textarea label="Technician comment" optional rows={3} value={comment} disabled={locked} onChange={(e) => setComment(e.target.value)} maxLength={1000} />

            {msg ? <Alert tone={msg.ok ? 'success' : 'danger'} title={msg.ok ? 'Done' : 'Not saved'}>{msg.text}</Alert> : null}
            {locked ? (
              <Alert tone="info" title="Released">This result was released by {current?.releasedBy ?? 'the lab'}. A released result cannot be edited here.</Alert>
            ) : (
              <div className="lb-actions">
                <Button type="submit" variant="secondary" loading={enter.isPending && enter.variables?.action === 'save'}>Save draft</Button>
                <Button variant="secondary" loading={enter.isPending && enter.variables?.action === 'verify'} onClick={() => run('verify')}>Verify</Button>
                <Button onClick={() => { setModalError(null); setSubmitted(true); if (incomplete) { setMsg({ ok: false, text: 'Every test needs a value before you release.' }); return } setConfirmRelease(true) }}>Verify and release</Button>
              </div>
            )}
          </form>

          <div className="lb-list" style={{ gap: 18 }}>
            <Alert tone={criticals ? 'danger' : abnormal ? 'warning' : 'info'} title={`${abnormal} value${abnormal === 1 ? '' : 's'} outside range${criticals ? `, ${criticals} critical` : ''}`}>
              Flags go to the ordering doctor. Critical values need a phone call with read-back.
            </Alert>
            <AIInsight title="Entry assistant" module="Result entry" status="caution" simulated footer={<span className="lb-muted">Checks run on the typed values only.</span>}>
              {incomplete ? 'Some tests have no value yet.' : 'All tests have a value.'} {criticals ? 'Critical limits are crossed: call the doctor before release.' : 'No critical limit is crossed.'}
            </AIInsight>
            {serverCriticals.length > 0 ? (
              <div className="lb-box">
                <h2 className="lb-bt">Critical values in this result</h2>
                {serverCriticals.map((v) => (
                  <div className="lb-row" key={v.id}>
                    <Badge tone="danger" icon={<span>‼</span>}>{v.testCode} {v.valueNum ?? v.valueText}{v.unit ? ` ${v.unit}` : ''}</Badge>
                    <span className="lb-grow" style={{ fontSize: 14 }}>Call {d.order.orderedBy ?? 'the doctor'}</span>
                    <button type="button" className="lb-lk" onClick={() => setCall({ resultValueId: v.id, label: `${v.testCode} ${v.valueNum ?? ''} · ${d.patient.fullName}`, suggestedName: d.order.orderedBy ?? '' })}>Log call</button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="lb-box">
              <BoxHead title="Delta check" />
              {deltas.length === 0 ? (
                <p className="lb-muted" style={{ margin: 0 }}>No earlier value for these tests, or the result is not saved yet. Save a draft to run the delta check.</p>
              ) : (
                deltas.map((v) => (
                  <div className="lb-row" key={v.id}>
                    <span className="lb-grow" style={{ fontSize: 14 }}>{v.testName}</span>
                    <span className="lb-muted">{v.prevValue} → {v.valueNum}{v.deltaPrev != null ? ` (${v.deltaPrev > 0 ? '+' : ''}${Math.round(v.deltaPrev * 100) / 100})` : ''}</span>
                  </div>
                ))
              )}
              <p className="lb-muted" style={{ margin: 0 }}>Previous values come from this patient's earlier lab results only.</p>
            </div>
            <CriticalBox go={go} />
          </div>
        </section>
      ) : null}

      <ConfirmModal
        open={confirmRelease}
        title="Verify and release this result?"
        confirmLabel="Verify and release"
        busy={enter.isPending}
        error={modalError}
        onClose={() => setConfirmRelease(false)}
        onConfirm={() => run('release', () => setConfirmRelease(false))}
      >
        <p style={{ margin: 0 }}>{d?.order.orderRef} · {d?.patient.fullName}. Releasing closes the order and tells the ordering doctor.</p>
        {criticals ? <Alert tone="danger" title={`${criticals} critical value(s)`}>Phone the doctor and record the read-back after you release.</Alert> : <p className="lb-muted" style={{ margin: 0 }}>{abnormal} value(s) are outside range. The patient sees the result only when nothing is critical.</p>}
      </ConfirmModal>
      {call ? <CallModal target={call} onClose={() => setCall(null)} /> : null}
    </div>
  )
}

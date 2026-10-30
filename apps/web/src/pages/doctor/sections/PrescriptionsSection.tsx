import { useEffect, useMemo, useState } from 'react'
import { AIInsight, Alert, Badge, Button, Table, Textarea } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { useCheckRx, useMedicineSearch, useRxList, useSaveRxDraft, useSignRx } from '../../../api/doctor'
import type { MedicineHit, PrescriptionCheckResult, PrescriptionLine, RxListData, RxSignResult } from '../../../api/doctor'
import { useDoctorSession } from '../session'
import { Box, ConfirmModal, ErrorNote, Header, Loading, NeedPatient, Row } from '../parts'
import { fmtDayTime } from '../format'

interface Line {
  medicineId: string
  name: string
  dose: string
  frequency: string
  durationDays: number
  quantity: number
  withFood: 'before' | 'with' | 'after' | 'any'
  instructions: string
  qtyTouched: boolean
}

const FREQ: Record<string, number> = { OD: 1, BD: 2, TDS: 3, QID: 4, SOS: 1 }
const STOCK_TONE = { in: 'success', low: 'warning', out: 'danger', unknown: 'neutral' } as const

function toApi(l: Line): PrescriptionLine {
  return {
    medicineId: l.medicineId,
    dose: l.dose.trim(),
    frequency: l.frequency,
    durationDays: l.durationDays,
    quantity: l.quantity,
    withFood: l.withFood,
    instructions: l.instructions.trim() || undefined,
  }
}
const complete = (l: Line) => l.dose.trim().length > 0 && l.durationDays >= 1 && l.quantity > 0

export default function PrescriptionsSection() {
  const { active } = useDoctorSession()
  const sid = active?.sessionId ?? null
  const canWrite = Boolean(active && !active.readOnly)
  const list = useRxList()
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const hits = useMedicineSearch(dq)
  const check = useCheckRx(sid)
  const saveDraft = useSaveRxDraft(sid)
  const sign = useSignRx(sid)

  const [lines, setLines] = useState<Line[]>([])
  const [advice, setAdvice] = useState('')
  const [override, setOverride] = useState('')
  const [draftId, setDraftId] = useState<string | undefined>()
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState<RxSignResult | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  // New patient -> new prescription.
  useEffect(() => {
    setLines([])
    setAdvice('')
    setOverride('')
    setDraftId(undefined)
    setDone(null)
    check.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid])

  const key = useMemo(() => JSON.stringify(lines.map(toApi)), [lines])
  const allComplete = lines.length > 0 && lines.every(complete)
  useEffect(() => {
    if (!sid || !allComplete) return
    const t = setTimeout(() => check.mutate(lines.map(toApi)), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sid, allComplete])

  const checks: PrescriptionCheckResult | undefined = check.data
  const needOverride = Boolean(checks?.summary.needsOverrideReason)
  const overrideOk = !needOverride || override.trim().length >= 10
  const byMed = (id: string) => checks?.lines.find((l) => l.medicineId === id)

  function add(m: MedicineHit) {
    if (lines.some((l) => l.medicineId === m.id)) return
    setLines((ls) => [
      ...ls,
      { medicineId: m.id, name: m.name, dose: '1 tablet', frequency: 'OD', durationDays: 5, quantity: 5, withFood: 'after', instructions: '', qtyTouched: false },
    ])
    setQ('')
    setDone(null)
  }
  function patch(i: number, p: Partial<Line>) {
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l
        const next = { ...l, ...p }
        if (!next.qtyTouched && (p.frequency !== undefined || p.durationDays !== undefined)) next.quantity = (FREQ[next.frequency] ?? 1) * Math.max(1, next.durationDays)
        return next
      }),
    )
  }

  function doSign() {
    sign.mutate(
      { draftId, lines: lines.map(toApi), advice: advice.trim() || undefined, overrideReason: needOverride ? override.trim() : undefined },
      {
        onSuccess: (r) => {
          setConfirm(false)
          setDone(r)
          setLines([])
          setAdvice('')
          setOverride('')
          setDraftId(undefined)
          check.reset()
        },
      },
    )
  }
  function doDraft() {
    saveDraft.mutate(
      { draftId, lines: lines.map(toApi), advice: advice.trim() || undefined },
      {
        onSuccess: (r) => {
          setDraftId(r.draftId)
          setSavedAt(r.updatedAt)
        },
      },
    )
  }

  const issuedCols: TableColumn<RxListData['issued'][number]>[] = [
    { key: 'rxNumber', header: 'Rx number', mono: true },
    { key: 'patientName', header: 'Patient' },
    { key: 'medicines', header: 'Medicines' },
    { key: 'issuedAt', header: 'Issued', render: (r) => fmtDayTime(r.issuedAt) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'dispensed' ? 'success' : 'info'}>{r.status.replace(/_/g, ' ')}</Badge> },
  ]

  return (
    <div className="dr-page">
      <Header title="Prescriptions" subtitle="Build, check and e-sign. Patients see them instantly; pharmacies verify the signature." />
      {done ? (
        <Alert tone="success" title={`Signed ${done.rxNumber}`}>
          {done.message} Signed with the demo e-Sign (simulated), reference {done.signature.txnId}. Valid until {fmtDayTime(done.validUntil)}.
        </Alert>
      ) : null}
      {!active ? <NeedPatient what="Writing a prescription" /> : null}
      {active && !canWrite ? (
        <Alert tone="warning" title="Read-only session">
          An emergency (break-glass) session cannot prescribe.
        </Alert>
      ) : null}

      {canWrite && active ? (
        <section className="dr-grid dr-s21">
          <Box
            title={`New prescription · ${active.patient.name}`}
            actions={checks?.lines.some((l) => l.allergy?.blocked) ? <Badge tone="danger">Allergy flagged</Badge> : undefined}
          >
            <div>
              <label className="dr-lab" htmlFor="drugq">
                Search medicine
              </label>
              <input id="drugq" className="dr-inp" placeholder="Type a name, e.g. amox" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            </div>
            <div className="dr-wrap" aria-live="polite">
              {hits.isFetching ? <span className="dr-muted">Searching…</span> : null}
              {(hits.data ?? []).slice(0, 8).map((m) => (
                <button key={m.id} type="button" className="dr-chip" onClick={() => add(m)} aria-label={`Add ${m.name}, stock ${m.hospitalPharmacyStock}`}>
                  + {m.name}
                  <Badge tone={STOCK_TONE[m.hospitalPharmacyStock]}>{m.hospitalPharmacyStock === 'in' ? 'In stock' : m.hospitalPharmacyStock === 'low' ? 'Low' : m.hospitalPharmacyStock === 'out' ? 'Out' : '?'}</Badge>
                </button>
              ))}
              {dq && !hits.isFetching && (hits.data ?? []).length === 0 ? <span className="dr-muted">No medicine matches.</span> : null}
            </div>

            {lines.length === 0 ? <p className="dr-muted">Search and add at least one medicine.</p> : null}
            {lines.map((l, i) => {
              const c = byMed(l.medicineId)
              const blocked = Boolean(c?.allergy?.blocked)
              return (
                <div key={l.medicineId} className={blocked ? 'dr-drug warn' : 'dr-drug'}>
                  <span className="dr-tok dr-t-teal" aria-hidden="true">
                    Rx
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dr-between">
                      <strong className="dr-strong">{l.name}</strong>
                      <button type="button" className="dr-link" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove ${l.name}`}>
                        Remove
                      </button>
                    </div>
                    {blocked ? <div className="dr-err">{c?.allergy?.message}</div> : null}
                    <div className="dr-drug-fields">
                      <label>
                        <span className="dr-mini-lab">Dose</span>
                        <input className="dr-mini" value={l.dose} onChange={(e) => patch(i, { dose: e.target.value })} maxLength={200} />
                      </label>
                      <label>
                        <span className="dr-mini-lab">Frequency</span>
                        <select className="dr-mini" value={l.frequency} onChange={(e) => patch(i, { frequency: e.target.value })}>
                          {Object.keys(FREQ).map((f) => (
                            <option key={f}>{f}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="dr-mini-lab">Days</span>
                        <input className="dr-mini" type="number" min={1} max={365} value={l.durationDays} onChange={(e) => patch(i, { durationDays: Math.max(1, Number(e.target.value) || 1) })} />
                      </label>
                      <label>
                        <span className="dr-mini-lab">Quantity</span>
                        <input className="dr-mini" type="number" min={1} value={l.quantity} onChange={(e) => patch(i, { quantity: Math.max(1, Number(e.target.value) || 1), qtyTouched: true })} />
                      </label>
                      <label>
                        <span className="dr-mini-lab">With food</span>
                        <select className="dr-mini" value={l.withFood} onChange={(e) => patch(i, { withFood: e.target.value as Line['withFood'] })}>
                          <option value="before">Before food</option>
                          <option value="with">With food</option>
                          <option value="after">After food</option>
                          <option value="any">Any time</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              )
            })}

            <Textarea label="Advice" value={advice} onChange={(e) => setAdvice(e.target.value)} rows={2} maxLength={1000} optional />

            {needOverride ? (
              <div className="dr-stack">
                <Alert tone="danger" title="Override needed">
                  {checks?.summary.allergyBlocked ? 'A prescribed medicine conflicts with a recorded allergy. ' : ''}
                  {checks?.summary.hasMajorInteraction ? 'There is a major interaction. ' : ''}
                  Remove the medicine, or give a clinical reason to sign anyway. The reason is saved in the audit trail.
                </Alert>
                <Textarea label="Override reason (at least 10 characters)" value={override} onChange={(e) => setOverride(e.target.value)} rows={2} maxLength={500} />
              </div>
            ) : null}

            <div className="dr-wrap">
              <Button disabled={!allComplete || !overrideOk || check.isPending} onClick={() => setConfirm(true)}>
                {needOverride ? 'Sign with override' : 'Sign with e-Sign'}
              </Button>
              <Button variant="ghost" disabled={lines.length === 0} loading={saveDraft.isPending} onClick={doDraft}>
                Save draft
              </Button>
              <span className="dr-muted">Signed with the demo e-Sign (mock, same shape as Aadhaar e-Sign)</span>
            </div>
            {savedAt ? <p className="dr-muted" style={{ margin: 0 }}>Draft saved {fmtDayTime(savedAt)}.</p> : null}
            <ErrorNote error={saveDraft.error} title="Could not save the draft" />
          </Box>

          <Box title="Checks">
            {check.isPending ? <Loading lines={2} /> : null}
            {!checks && !check.isPending ? <p className="dr-muted">Checks run when every medicine has a dose, days and quantity.</p> : null}
            <ErrorNote error={check.error} title="Could not run the checks" />
            {checks ? (
              <>
                <AIInsight
                  module="Interaction and allergy check"
                  status={checks.summary.allergyBlocked || checks.summary.hasMajorInteraction ? 'caution' : 'verified'}
                  title={checks.summary.hasMajorInteraction ? 'Major interaction found' : checks.summary.allergyBlocked ? 'Allergy conflict found' : 'No major interactions'}
                  simulated
                >
                  <p style={{ margin: 0, fontSize: 14 }}>Rule-based check run by the demo service (simulated). It supports your judgement; it does not replace it.</p>
                </AIInsight>
                {checks.lines.map((l) => (
                  <div key={l.medicineId} className="dr-stack" style={{ gap: 4 }}>
                    <strong className="dr-strong">{l.name}</strong>
                    <div className="dr-row" style={{ padding: '4px 0' }}>
                      <span className={`dr-tok dr-t-${l.allergy?.blocked ? 'peach' : 'sage'}`} aria-hidden="true">
                        {l.allergy?.blocked ? '!' : 'OK'}
                      </span>
                      <div className="dr-muted dr-row-main">{l.allergy?.blocked ? l.allergy.message : 'No allergy conflict'}</div>
                    </div>
                    {l.interactions.map((x) => (
                      <div key={x.with} className="dr-muted">
                        Interacts with {x.with} ({x.severity}){x.note ? `: ${x.note}` : ''}
                      </div>
                    ))}
                    <div className="dr-muted">
                      {l.stock.pharmacy}: {l.stock.level === 'in' ? 'in stock' : l.stock.level === 'low' ? 'low stock' : l.stock.level === 'out' ? 'out of stock' : 'stock unknown'}
                      {l.stock.quantity != null ? ` (${l.stock.quantity})` : ''} &middot; schedule {l.schedule}
                    </div>
                  </div>
                ))}
                <p className="dr-muted" style={{ margin: 0 }}>
                  {checks.summary.renal}
                </p>
              </>
            ) : null}
          </Box>
        </section>
      ) : null}

      <section className="dr-grid dr-g2">
        <Box title="Drafts waiting">
          {list.isLoading ? <Loading lines={2} /> : null}
          {list.data && list.data.drafts.length === 0 ? <p className="dr-muted">No drafts.</p> : null}
          {(list.data?.drafts ?? []).map((d) => (
            <Row key={d.id} tok="Rx" title={d.patientName} sub={`${d.lines} item${d.lines === 1 ? '' : 's'}${d.advice ? ` · ${d.advice}` : ''} · ${fmtDayTime(d.updatedAt)}`} />
          ))}
          <p className="dr-muted" style={{ margin: 0 }}>
            To continue a draft, open the patient with their key and build it again here.
          </p>
        </Box>
        <Box title="Issued recently">
          <Table columns={issuedCols} rows={(list.data?.issued ?? []).slice(0, 8)} rowKey="id" striped density="compact" empty="Nothing issued yet." caption="Recently issued prescriptions" />
        </Box>
      </section>

      <ConfirmModal
        open={confirm}
        title="Sign this prescription?"
        onClose={() => setConfirm(false)}
        onConfirm={doSign}
        confirmLabel="Sign and send"
        busy={sign.isPending}
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          Signing records a legal prescription in your name with the demo e-Sign (mock). It is sent at once to the hospital pharmacy and to {active?.patient.name}'s medicines. A signed prescription cannot be edited; you would have to issue a new one.
        </p>
        {needOverride ? (
          <Alert tone="warning" title="Override recorded">
            Your reason is stored in the audit trail and reviewed if the patient is harmed: "{override.trim()}"
          </Alert>
        ) : null}
        {sign.error ? <Alert tone="danger" title="Not signed">{sign.error.message}</Alert> : null}
      </ConfirmModal>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Alert, Badge, Button, Checkbox, Modal, Select, TextField, Textarea } from '../../../components/ui'
import {
  errMessage,
  useAdminister,
  useBedDetail,
  useCountStock,
  useMar,
  useNurseBoard,
  useRequestStock,
  useWardStock,
} from '../../../api/nurse'
import type { MarDose, WardStock } from '../../../api/nurse'
import { BoxHead, Empty, ErrorBlock, Loading, PageLoading, fmtTime } from './common'
import type { Go } from './types'

const STATUS: Record<MarDose['status'], { label: string; icon: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  given: { label: 'Given', icon: '✓', tone: 'success' },
  due: { label: 'Due', icon: '…', tone: 'info' },
  overdue: { label: 'Overdue', icon: '!', tone: 'warning' },
  withheld: { label: 'Withheld', icon: '✕', tone: 'neutral' },
  refused: { label: 'Refused', icon: '✕', tone: 'neutral' },
  missed: { label: 'Missed', icon: '‼', tone: 'danger' },
  prn: { label: 'As needed', icon: '·', tone: 'neutral' },
}

export default function Mar({ bedId, go }: { bedId: string | null; go: Go }) {
  const board = useNurseBoard()
  const mar = useMar()
  const stock = useWardStock()
  const [giving, setGiving] = useState<MarDose | null>(null)

  const bed = board.data?.beds.find((b) => b.bedId === bedId)
  const doses = useMemo(() => {
    const all = mar.data?.doses ?? []
    return bed?.admissionId ? all.filter((d) => d.admissionId === bed.admissionId) : all
  }, [mar.data, bed])

  if (mar.isLoading || board.isLoading) return <PageLoading title="medication round" />
  if (mar.isError) return <ErrorBlock error={mar.error} onRetry={() => void mar.refetch()} title="Could not load the medication record" />
  const sum = mar.data!.summary
  const left = doses.filter((d) => d.status === 'due' || d.status === 'overdue').length
  const notGiven = doses.filter((d) => ['withheld', 'refused', 'missed'].includes(d.status))
  const timed = doses.filter((d) => !d.isPrn)
  const prn = doses.filter((d) => d.isPrn)

  return (
    <div className="nu-pg">
      <header className="nu-head">
        <div>
          <h1 className="nu-h1">Medication round</h1>
          <p className="nu-sub">
            Scan the patient band and the medicine before you record a dose.
            {bed ? ` Showing Bed ${bed.bedNo} only.` : ''}
          </p>
        </div>
        <div className="nu-actions">
          {bed ? <Button size="sm" variant="outline" onClick={() => go('mar')}>Show whole ward</Button> : null}
          <Badge tone="peach" icon={<span>!</span>}>{left} doses still to give</Badge>
        </div>
      </header>

      <section className="nu-grid nu-g21">
        <div className="nu-box">
          <BoxHead title="Doses today" right={<span className="nu-muted">{sum.given} of {sum.total} given · {sum.overdue} overdue</span>} />
          {timed.length === 0 && prn.length === 0 ? (
            <Empty title="No doses scheduled">There are no active medicine orders for the doses shown.</Empty>
          ) : (
            <div className="nu-list">
              {[...timed, ...prn].map((d) => {
                const st = STATUS[d.status]
                const done = d.status === 'given' || d.status === 'withheld' || d.status === 'refused' || d.status === 'missed'
                return (
                  <div key={`${d.medOrderId}-${d.dueAt ?? 'prn'}`} className={`nu-med${d.status === 'given' ? ' is-done' : d.status === 'overdue' ? ' is-late' : done ? ' is-off' : ''}`}>
                    <button
                      type="button"
                      className="nu-chk"
                      aria-label={done ? `${st.label}: ${d.medicine}, Bed ${d.bedNo}` : `Record dose: ${d.medicine}, Bed ${d.bedNo}`}
                      disabled={done}
                      onClick={() => setGiving(d)}
                    >
                      {d.status === 'given' ? '✓' : ''}
                    </button>
                    <span className="nu-muted" style={{ width: 54 }}>Bed {d.bedNo ?? '-'}</span>
                    <div className="nu-grow">
                      <strong className="nu-strong">{d.medicine}</strong>
                      <div className="nu-muted">
                        {d.patientName} · {d.dose} · {d.route}{d.instructions ? ` · ${d.instructions}` : ''}
                        {d.reason ? ` · ${d.reason}` : ''}
                      </div>
                    </div>
                    <Badge tone={st.tone} icon={<span>{st.icon}</span>}>{st.label}</Badge>
                    <span className="nu-muted" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'right' }}>
                      {d.isPrn ? 'PRN' : fmtTime(d.dueAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="nu-list" style={{ gap: 18 }}>
          <div className="nu-box">
            <h2 className="nu-bt">Withheld or refused</h2>
            {notGiven.length === 0 ? (
              <p className="nu-muted" style={{ margin: 0 }}>No doses withheld, refused or missed today.</p>
            ) : (
              notGiven.map((d) => (
                <div className="nu-row" key={`${d.medOrderId}-${d.dueAt}`}>
                  <span className="nu-muted" style={{ width: 54 }}>Bed {d.bedNo}</span>
                  <span className="nu-grow" style={{ fontSize: 14 }}>
                    {d.medicine} {STATUS[d.status].label.toLowerCase()}{d.reason ? ` — ${d.reason}` : ''}
                  </span>
                </div>
              ))
            )}
          </div>
          <WardStockBox stock={stock} />
        </div>
      </section>

      {giving ? <GiveDoseModal dose={giving} onClose={() => setGiving(null)} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------- record a dose
function GiveDoseModal({ dose, onClose }: { dose: MarDose; onClose: () => void }) {
  const board = useNurseBoard()
  const bedId = board.data?.beds.find((b) => b.admissionId === dose.admissionId)?.bedId
  const chart = useBedDetail(bedId)
  const admin = useAdminister()
  const [outcome, setOutcome] = useState<'given' | 'withheld' | 'refused' | 'missed'>('given')
  const [band, setBand] = useState(false)
  const [drug, setDrug] = useState(false)
  const [reason, setReason] = useState('')
  const [doseGiven, setDoseGiven] = useState(dose.dose)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allergies = chart.data?.patient?.allergies ?? []
  const needReason = outcome !== 'given' && reason.trim().length === 0
  const needScan = outcome === 'given' && !(band && drug)

  function submit() {
    setTouched(true)
    setError(null)
    if (needReason || needScan) return
    admin.mutate(
      {
        medOrderId: dose.medOrderId,
        dueAt: dose.dueAt ?? new Date().toISOString(),
        outcome,
        reason: outcome === 'given' ? undefined : reason.trim(),
        doseGiven: outcome === 'given' ? doseGiven.trim() || undefined : undefined,
        bandScanned: band,
        drugScanned: drug,
      },
      { onSuccess: onClose, onError: (e) => setError(errMessage(e)) },
    )
  }

  return (
    <Modal
      open
      title={`Record dose · Bed ${dose.bedNo ?? '-'}`}
      onClose={admin.isPending ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={admin.isPending}>Cancel</Button>
          <Button onClick={submit} loading={admin.isPending}>
            {outcome === 'given' ? 'Record as given' : `Record as ${outcome}`}
          </Button>
        </>
      }
    >
      <div className="nu-list">
        <div>
          <strong className="nu-strong">{dose.medicine}</strong>
          <div className="nu-muted">{dose.patientName} · {dose.dose} · {dose.route} · {dose.isPrn ? 'as needed' : `due ${fmtTime(dose.dueAt)}`}</div>
        </div>
        {chart.isLoading ? (
          <Loading rows={1} label="Checking allergies" />
        ) : allergies.length > 0 ? (
          <Alert tone="danger" title="Allergy check">
            {allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`).join('; ')}. Check this medicine against the allergy list before you give it.
          </Alert>
        ) : (
          <p className="nu-muted" style={{ margin: 0 }}>No allergies recorded for this patient.</p>
        )}
        <Select
          label="Outcome"
          options={[
            { value: 'given', label: 'Given' },
            { value: 'withheld', label: 'Withheld' },
            { value: 'refused', label: 'Patient refused' },
            { value: 'missed', label: 'Missed' },
          ]}
          value={outcome}
          onChange={(v) => setOutcome(v as typeof outcome)}
        />
        {outcome === 'given' ? (
          <>
            <Checkbox label="Patient band scanned" description="Simulated scan in the alpha" checked={band} onChange={setBand} />
            <Checkbox label="Medicine scanned" description="Simulated scan in the alpha" checked={drug} onChange={setDrug} />
            {touched && needScan ? <p className="nu-tag-bad" role="alert">Scan both the band and the medicine before you record this dose as given.</p> : null}
            <TextField label="Dose given" value={doseGiven} onChange={(e) => setDoseGiven(e.target.value)} optional maxLength={100} />
          </>
        ) : (
          <Textarea
            label="Reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={touched && needReason ? 'A reason is needed when a dose is not given.' : undefined}
            maxLength={500}
          />
        )}
        {error ? <Alert tone="danger" title="Not saved">{error}</Alert> : null}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- ward stock
function WardStockBox({ stock }: { stock: ReturnType<typeof useWardStock> }) {
  const [requesting, setRequesting] = useState(false)
  const [counting, setCounting] = useState<WardStock['items'][number] | null>(null)
  const data = stock.data
  return (
    <div className="nu-box">
      <BoxHead
        title="Ward stock"
        right={
          data && data.items.length > 0 ? (
            <Button size="sm" variant="soft" onClick={() => setRequesting(true)}>Request from pharmacy</Button>
          ) : undefined
        }
      />
      {stock.isLoading ? (
        <Loading rows={3} label="Loading ward stock" />
      ) : stock.isError ? (
        <ErrorBlock error={stock.error} onRetry={() => void stock.refetch()} title="Ward stock unavailable" />
      ) : !data || data.items.length === 0 ? (
        <Empty title="No stock lines">This ward has no stock list yet.</Empty>
      ) : (
        <>
          {data.items.map((s) => (
            <div className="nu-row" key={s.id}>
              <div className="nu-grow">
                <strong className="nu-strong">{s.medicine}</strong>
                <div className="nu-muted">Par level {s.parLevel}</div>
              </div>
              <Badge tone={s.level === 'ok' ? 'success' : s.level === 'low' ? 'warning' : 'danger'} icon={<span>{s.level === 'ok' ? '✓' : s.level === 'low' ? '!' : '‼'}</span>}>
                {s.level === 'out' ? 'Out' : s.level === 'low' ? `${s.quantity} left · low` : `${s.quantity}`}
              </Badge>
              <button type="button" className="nu-lk" aria-label={`Update count for ${s.medicine}`} onClick={() => setCounting(s)}>Count</button>
            </div>
          ))}
          {data.requests.length > 0 ? (
            <div className="nu-pend">
              <strong className="nu-strong">Recent requests</strong>
              {data.requests.slice(0, 3).map((r) => (
                <div className="nu-pend-r" key={r.id}>
                  <span className="nu-grow">{r.medicine} × {r.quantity}</span>
                  <Badge tone={r.status === 'issued' || r.status === 'fulfilled' ? 'success' : r.status === 'rejected' ? 'neutral' : 'info'}>{r.status}</Badge>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
      {requesting && data ? <RequestStockModal items={data.items} onClose={() => setRequesting(false)} /> : null}
      {counting ? <CountModal item={counting} onClose={() => setCounting(null)} /> : null}
    </div>
  )
}

function RequestStockModal({ items, onClose }: { items: WardStock['items']; onClose: () => void }) {
  const req = useRequestStock()
  const [medicineId, setMedicineId] = useState(items.find((i) => i.level !== 'ok')?.medicineId ?? items[0]?.medicineId ?? '')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const n = Number(qty)
  const bad = !qty.trim() || !Number.isFinite(n) || n <= 0
  const [touched, setTouched] = useState(false)
  return (
    <Modal
      open
      title="Request stock from pharmacy"
      size="sm"
      onClose={req.isPending ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={req.isPending}>Cancel</Button>
          <Button
            loading={req.isPending}
            onClick={() => {
              setTouched(true)
              setError(null)
              if (bad) return
              req.mutate({ medicineId, quantity: n, note: note.trim() || undefined }, { onSuccess: onClose, onError: (e) => setError(errMessage(e)) })
            }}
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="nu-list">
        <Select label="Medicine" options={items.map((i) => ({ value: i.medicineId, label: `${i.medicine} (${i.quantity} in stock)` }))} value={medicineId} onChange={setMedicineId} />
        <TextField label="Quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} error={touched && bad ? 'Enter a quantity above 0' : undefined} />
        <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        {error ? <Alert tone="danger" title="Not sent">{error}</Alert> : null}
      </div>
    </Modal>
  )
}

function CountModal({ item, onClose }: { item: WardStock['items'][number]; onClose: () => void }) {
  const count = useCountStock()
  const [qty, setQty] = useState(String(item.quantity))
  const [error, setError] = useState<string | null>(null)
  const n = Number(qty)
  const bad = qty.trim() === '' || !Number.isFinite(n) || n < 0
  return (
    <Modal
      open
      title={`Update count · ${item.medicine}`}
      size="sm"
      onClose={count.isPending ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={count.isPending}>Cancel</Button>
          <Button
            loading={count.isPending}
            onClick={() => {
              setError(null)
              if (bad) return
              count.mutate({ id: item.id, quantity: n }, { onSuccess: onClose, onError: (e) => setError(errMessage(e)) })
            }}
          >
            Save count
          </Button>
        </>
      }
    >
      <div className="nu-list">
        <p style={{ margin: 0 }}>Count what is on the shelf now. The old count was {item.quantity}.</p>
        <TextField label="Counted quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} error={bad ? 'Enter 0 or more' : undefined} />
        {error ? <Alert tone="danger" title="Not saved">{error}</Alert> : null}
      </div>
    </Modal>
  )
}

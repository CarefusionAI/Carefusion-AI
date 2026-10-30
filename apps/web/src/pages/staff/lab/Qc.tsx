import { useMemo, useState } from 'react'
import { Alert, Badge, Button, Modal, Select, Table, TextField, Textarea } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { errMessage } from '../../../api/nurse'
import { useInstrumentStatus, useLabQc, useRecordQc } from '../../../api/lab'
import type { LabInstrument, LabQcRun } from '../../../api/lab'
import { BoxHead, Empty, ErrorBlock, PageLoading, fmtDateTime } from './common'
import { ConfirmModal } from '../nurse/dialogs'

const RESULT: Record<LabQcRun['result'], { label: string; icon: string; tone: 'success' | 'warning' | 'danger' }> = {
  pass: { label: 'Pass', icon: '✓', tone: 'success' },
  warning: { label: 'Warning', icon: '!', tone: 'warning' },
  reject: { label: 'Rejected', icon: '‼', tone: 'danger' },
}
const INST_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { ok: 'success', calibrating: 'warning', down: 'danger', retired: 'neutral' }
const INST_LABEL: Record<string, string> = { ok: 'OK', calibrating: 'Calibrating', down: 'Down', retired: 'Retired' }
const INST_ICON: Record<string, string> = { ok: '✓', calibrating: '!', down: '‼', retired: '○' }
const RULE_TEXT: Record<string, string> = { '1-2s': '1₂s warning', '1-3s': '1₃s rejection', '2-2s': '2₂s rejection', 'R-4s': 'R₄s rejection', '4-1s': '4₁s rejection', '10x': '10x rejection' }
const ruleText = (r: string | null) => (r ? RULE_TEXT[r] ?? r : '')

export default function Qc() {
  const qc = useLabQc(7)
  const [sel, setSel] = useState('')
  const [recording, setRecording] = useState(false)
  const [setting, setSetting] = useState<{ inst: LabInstrument; status: 'ok' | 'calibrating' | 'down' | 'retired' } | null>(null)
  const status = useInstrumentStatus()
  const [modalError, setModalError] = useState<string | null>(null)

  const series = qc.data?.series ?? []
  const cur = useMemo(() => series.find((s) => s.key === sel) ?? series[0], [series, sel])

  if (qc.isLoading) return <PageLoading title="quality control" />
  if (qc.isError) return <ErrorBlock error={qc.error} onRetry={() => void qc.refetch()} title="Could not load QC" />
  const d = qc.data!
  const flagged = d.runs.filter((r) => r.result !== 'pass').slice(0, 3)

  const cols: TableColumn<LabQcRun>[] = [
    { key: 'runAt', header: 'Time', mono: true, render: (r) => fmtDateTime(r.runAt) },
    { key: 'testName', header: 'Analyte', render: (r) => `${r.testName} (${r.instrument})` },
    { key: 'qcLevel', header: 'Level', render: (r) => `L${r.qcLevel}` },
    { key: 'valueNum', header: 'Value', align: 'right', render: (r) => `${r.valueNum}${r.unit ? ` ${r.unit}` : ''}` },
    { key: 'zScore', header: 'z', align: 'right', render: (r) => r.zScore.toFixed(2) },
    {
      key: 'result',
      header: 'Result',
      render: (r) => (
        <Badge tone={RESULT[r.result].tone} icon={<span>{RESULT[r.result].icon}</span>}>
          {RESULT[r.result].label}{r.westgardRule ? ` · ${ruleText(r.westgardRule)}` : ''}
        </Badge>
      ),
    },
  ]

  return (
    <div className="lb-pg">
      <header className="lb-head">
        <div>
          <h1 className="lb-h1">Quality control</h1>
          <p className="lb-sub">Daily controls must pass before patient results are released. Last 7 days.</p>
        </div>
        <Button onClick={() => setRecording(true)}>Record a QC run</Button>
      </header>

      <section className="lb-grid lb-g4">
        <div className="lb-box"><span className="lb-muted">Runs · 24 h</span><strong className="lb-timer">{d.summary.runsLast24h}</strong></div>
        <div className="lb-box"><span className="lb-muted">Passed · 24 h</span><strong className="lb-timer">{d.summary.passedLast24h}</strong></div>
        <div className="lb-box"><span className="lb-muted">Warnings</span><strong className="lb-timer">{d.summary.warnings}</strong></div>
        <div className="lb-box"><span className="lb-muted">Rejected</span><strong className="lb-timer">{d.summary.rejected}</strong></div>
      </section>

      <section className="lb-grid lb-g21">
        <div className="lb-box">
          <BoxHead
            title={cur ? `Levey–Jennings · ${cur.testCode} control L${cur.qcLevel}` : 'Levey–Jennings'}
            right={cur ? <Badge tone={cur.points.some((p) => p.result === 'reject') ? 'danger' : cur.points.some((p) => p.result === 'warning') ? 'warning' : 'success'} icon={<span>{cur.points.some((p) => p.result === 'reject') ? '‼' : cur.points.some((p) => p.result === 'warning') ? '!' : '✓'}</span>}>{cur.points.some((p) => p.result === 'reject') ? 'Out of control' : cur.points.some((p) => p.result === 'warning') ? 'Warning' : 'In control'}</Badge> : undefined}
          />
          {series.length > 1 ? (
            <Select label="Control series" options={series.map((s) => ({ value: s.key, label: `${s.instrument} · ${s.testCode} · L${s.qcLevel} (${s.points.length} runs)` }))} value={cur?.key ?? ''} onChange={setSel} />
          ) : null}
          {cur ? <LjChart run={cur.points} /> : <Empty title="No QC runs yet">Record a run to see the chart.</Empty>}
          <Table columns={cols} rows={d.runs.slice(0, 12)} rowKey="id" density="compact" caption="Recent QC runs" empty="No QC runs in the last 7 days." />
        </div>

        <div className="lb-list" style={{ gap: 18 }}>
          {flagged.map((r) => (
            <Alert key={r.id} tone={r.result === 'reject' ? 'danger' : 'warning'} title={`${r.testName} L${r.qcLevel} — ${ruleText(r.westgardRule) || RESULT[r.result].label}`}>
              {r.result === 'reject' ? 'Do not release this test until a repeat run passes.' : 'Repeat the control before releasing this test.'} {fmtDateTime(r.runAt)} · {r.instrument}
            </Alert>
          ))}
          <div className="lb-box">
            <h2 className="lb-bt">Instruments</h2>
            {d.instruments.length === 0 ? <Empty title="No instruments">None are set up for this lab.</Empty> : null}
            {d.instruments.map((i) => (
              <div className="lb-inst" key={i.id}>
                <div className="lb-grow">
                  <strong className="lb-strong">{i.name}</strong>
                  <div className="lb-muted">{i.kind ?? ''}{i.nextCalibrationDue ? ` · calibrate by ${i.nextCalibrationDue}` : ''}</div>
                </div>
                <Badge tone={INST_TONE[i.status] ?? 'neutral'} icon={<span>{INST_ICON[i.status] ?? '·'}</span>}>{INST_LABEL[i.status] ?? i.status}</Badge>
                <div style={{ minWidth: 150 }}>
                  <Select
                    aria-label={`Change status of ${i.name}`}
                    options={Object.entries(INST_LABEL).map(([value, label]) => ({ value, label }))}
                    value={i.status}
                    onChange={(v) => { if (v !== i.status) { setModalError(null); setSetting({ inst: i, status: v as 'ok' | 'calibrating' | 'down' | 'retired' }) } }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="lb-box">
            <h2 className="lb-bt">Reagent lots</h2>
            {d.reagentLots.length === 0 ? <p className="lb-muted" style={{ margin: 0 }}>No reagent lots recorded.</p> : null}
            {d.reagentLots.map((l) => (
              <div className="lb-row" key={l.id}>
                <span className="lb-grow" style={{ fontSize: 14 }}>{l.reagent} · lot {l.lotNo}</span>
                <span className="lb-muted">exp {l.expiryDate ?? '-'}</span>
                {l.status !== 'in_use' && l.status !== 'ok' && l.status !== 'active' ? <Badge tone="warning" icon={<span>!</span>}>{l.status}</Badge> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {recording ? <RecordModal instruments={d.instruments} onClose={() => setRecording(false)} /> : null}
      <ConfirmModal
        open={!!setting}
        title="Change instrument status?"
        confirmLabel="Change status"
        tone={setting?.status === 'down' || setting?.status === 'retired' ? 'danger' : 'primary'}
        busy={status.isPending}
        error={modalError}
        onClose={() => setSetting(null)}
        onConfirm={() => setting && status.mutate({ id: setting.inst.id, status: setting.status }, { onSuccess: () => setSetting(null), onError: (e) => setModalError(errMessage(e)) })}
      >
        <p style={{ margin: 0 }}>{setting?.inst.name}: {INST_LABEL[setting?.inst.status ?? ''] ?? setting?.inst.status} → {INST_LABEL[setting?.status ?? ''] ?? setting?.status}.{setting?.status === 'down' || setting?.status === 'retired' ? ' Results from this instrument should not be released.' : ''}</p>
      </ConfirmModal>
    </div>
  )
}

function LjChart({ run }: { run: LabQcRun[] }) {
  if (run.length === 0) return null
  const mean = run[0]!.targetMean
  const sd = run[0]!.targetSd
  const W = 400
  const H = 160
  const y = (v: number) => H / 2 - ((v - mean) / (3.4 * sd)) * (H / 2)
  const x = (i: number) => (run.length === 1 ? W / 2 : 10 + (i / (run.length - 1)) * (W - 20))
  const path = run.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.valueNum).toFixed(1)}`).join(' ')
  const out = run.filter((p) => p.result !== 'pass').length
  return (
    <svg className="lb-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Control values over ${run.length} runs, ${out} outside two standard deviations`}>
      <rect x="0" y={y(mean + 2 * sd)} width={W} height={y(mean - 2 * sd) - y(mean + 2 * sd)} fill="#dcebe0" opacity=".6" />
      <path d={`M0 ${y(mean + 3 * sd)} H${W} M0 ${y(mean - 3 * sd)} H${W}`} stroke="#d99a96" strokeDasharray="4 4" />
      <path d={`M0 ${y(mean)} H${W}`} stroke="#857c74" />
      <path d={path} fill="none" stroke="#3a726d" strokeWidth="2" />
      {run.map((p, i) => (
        <g key={p.id}>
          {p.result === 'pass' ? <circle cx={x(i)} cy={y(p.valueNum)} r="3" fill="#3a726d" /> : <path d={`M${x(i) - 4} ${y(p.valueNum) - 4} l8 8 m0 -8 l-8 8`} stroke={p.result === 'reject' ? '#9a4a46' : '#8b6a2f'} strokeWidth="2.2" />}
        </g>
      ))}
      <text x="4" y="12" fontSize="10" fill="#586470">+3 SD</text>
      <text x="4" y={H - 4} fontSize="10" fill="#586470">−3 SD</text>
    </svg>
  )
}

function RecordModal({ instruments, onClose }: { instruments: LabInstrument[]; onClose: () => void }) {
  const rec = useRecordQc()
  const [f, setF] = useState({ instrumentId: instruments[0]?.id ?? '', testCode: '', level: '1', value: '', mean: '', sd: '', comment: '' })
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null)
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s))
  const errs = {
    testCode: f.testCode.trim() ? undefined : 'Enter the test code',
    value: Number.isFinite(num(f.value)) ? undefined : 'Enter a number',
    mean: Number.isFinite(num(f.mean)) ? undefined : 'Enter a number',
    sd: Number.isFinite(num(f.sd)) && num(f.sd) > 0 ? undefined : 'Enter a number above 0',
  }
  const bad = Object.values(errs).some(Boolean) || !f.instrumentId
  return (
    <Modal
      open
      title="Record a QC run"
      onClose={rec.isPending ? undefined : onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={rec.isPending}>Cancel</Button>
            <Button
              loading={rec.isPending}
              onClick={() => {
                setTouched(true)
                setError(null)
                if (bad) return
                rec.mutate(
                  { instrumentId: f.instrumentId, testCode: f.testCode.trim().toUpperCase(), qcLevel: Number(f.level), valueNum: num(f.value), targetMean: num(f.mean), targetSd: num(f.sd), comment: f.comment.trim() || undefined },
                  { onSuccess: (r) => setDone({ tone: r.result === 'pass' ? 'success' : r.result === 'warning' ? 'warning' : 'danger', text: `z = ${r.zScore.toFixed(2)}${r.westgardRule ? ` · ${ruleText(r.westgardRule)}` : ''}. ${r.message}` }), onError: (e) => setError(errMessage(e)) },
                )
              }}
            >
              Record run
            </Button>
          </>
        )
      }
    >
      <div className="lb-list">
        {done ? (
          <Alert tone={done.tone} title={done.tone === 'success' ? 'In control' : done.tone === 'warning' ? 'Warning' : 'QC rejected'}>{done.text}</Alert>
        ) : (
          <>
            <Select label="Instrument" options={instruments.map((i) => ({ value: i.id, label: i.name }))} value={f.instrumentId} onChange={(v) => setF({ ...f, instrumentId: v })} />
            <div className="lb-grid lb-g2" style={{ gap: 12 }}>
              <TextField label="Test code" placeholder="e.g. GLU" value={f.testCode} onChange={(e) => setF({ ...f, testCode: e.target.value })} error={touched ? errs.testCode : undefined} />
              <Select label="Control level" options={['1', '2', '3'].map((v) => ({ value: v, label: `Level ${v}` }))} value={f.level} onChange={(v) => setF({ ...f, level: v })} />
              <TextField label="Measured value" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} error={touched ? errs.value : undefined} />
              <TextField label="Target mean" inputMode="decimal" value={f.mean} onChange={(e) => setF({ ...f, mean: e.target.value })} error={touched ? errs.mean : undefined} />
              <TextField label="Target SD" inputMode="decimal" value={f.sd} onChange={(e) => setF({ ...f, sd: e.target.value })} error={touched ? errs.sd : undefined} />
            </div>
            <Textarea label="Comment" optional rows={2} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} maxLength={500} />
            {error ? <Alert tone="danger" title="Not saved">{error}</Alert> : null}
          </>
        )}
      </div>
    </Modal>
  )
}

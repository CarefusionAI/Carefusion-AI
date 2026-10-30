import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Badge, Button, Select, Switch, TextField, Textarea } from '../../../components/ui'
import { errMessage, useNurseBoard, useRecordVitals, useVitalsHistory } from '../../../api/nurse'
import type { VitalRow, VitalsResult } from '../../../api/nurse'
import { BoxHead, Empty, ErrorBlock, Loading, NEWS_PART_LABELS, NewsChip, fmtTime, newsBand, newsParts, PageLoading } from './common'
import type { Go } from './types'

interface Form {
  systolic: string
  diastolic: string
  pulse: string
  respRate: string
  spo2: string
  tempC: string
  glucose: string
  avpu: 'A' | 'C' | 'V' | 'P' | 'U'
  onOxygen: boolean
  pain: string
  note: string
}
const EMPTY: Form = { systolic: '', diastolic: '', pulse: '', respRate: '', spo2: '', tempC: '', glucose: '', avpu: 'A', onOxygen: false, pain: '', note: '' }

const AVPU_OPTIONS = [
  { value: 'A', label: 'Alert' },
  { value: 'C', label: 'New confusion' },
  { value: 'V', label: 'Responds to voice' },
  { value: 'P', label: 'Responds to pain' },
  { value: 'U', label: 'Unresponsive' },
]
const PAIN_OPTIONS = [{ value: '', label: 'Not asked' }, ...Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: i === 0 ? '0 · none' : i <= 3 ? `${i} · mild` : i <= 6 ? `${i} · moderate` : `${i} · severe` }))]

function numOrNaN(s: string): number {
  return s.trim() === '' ? NaN : Number(s)
}

interface Limits { min: number; max: number }
const LIMITS: Record<string, Limits> = {
  systolic: { min: 30, max: 300 },
  diastolic: { min: 20, max: 200 },
  pulse: { min: 10, max: 300 },
  respRate: { min: 0, max: 80 },
  spo2: { min: 40, max: 100 },
  tempC: { min: 25, max: 45 },
  glucose: { min: 10, max: 1000 },
}

function fieldError(name: keyof typeof LIMITS, value: string, required: boolean, integer: boolean): string | undefined {
  if (value.trim() === '') return required ? 'Required' : undefined
  const n = Number(value)
  const l = LIMITS[name]!
  if (!Number.isFinite(n)) return 'Enter a number'
  if (integer && !Number.isInteger(n)) return 'Whole number only'
  if (n < l.min || n > l.max) return `Between ${l.min} and ${l.max}`
  return undefined
}

export default function Vitals({ bedId, go }: { bedId: string | null; go: Go }) {
  const board = useNurseBoard()
  const [form, setForm] = useState<Form>(EMPTY)
  const [result, setResult] = useState<VitalsResult | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const record = useRecordVitals()

  const occupied = useMemo(
    () => [...(board.data?.beds ?? [])].filter((b) => b.admissionId).sort((a, b) => Number(b.mine) - Number(a.mine)),
    [board.data],
  )
  const current = occupied.find((b) => b.bedId === bedId) ?? occupied[0]
  const history = useVitalsHistory(current?.admissionId)

  // Switching patient clears the form and the last result.
  useEffect(() => {
    setForm(EMPTY)
    setResult(null)
    setSaveError(null)
    setSubmitted(false)
  }, [current?.bedId])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setResult(null)
  }

  const preview = useMemo(() => {
    const v = {
      respRate: numOrNaN(form.respRate),
      spo2: numOrNaN(form.spo2),
      onOxygen: form.onOxygen,
      systolic: numOrNaN(form.systolic),
      pulse: numOrNaN(form.pulse),
      tempC: numOrNaN(form.tempC),
      avpu: form.avpu,
    }
    if ([v.respRate, v.spo2, v.systolic, v.pulse, v.tempC].some((n) => Number.isNaN(n))) return null
    const parts = newsParts(v)
    return { parts, total: parts.reduce((a, b) => a + b, 0), band: newsBand(parts) }
  }, [form])

  if (board.isLoading) return <PageLoading title="vitals" />
  if (board.isError) return <ErrorBlock error={board.error} onRetry={() => void board.refetch()} />
  if (!current) {
    return (
      <div className="nu-pg">
        <header><h1 className="nu-h1">Record vitals</h1></header>
        <Empty title="No admitted patients" action={<Button variant="secondary" onClick={() => go('home')}>Back to ward home</Button>}>
          There is nobody on this ward to record vitals for.
        </Empty>
      </div>
    )
  }

  const errors = {
    systolic: fieldError('systolic', form.systolic, true, true),
    diastolic: fieldError('diastolic', form.diastolic, false, true),
    pulse: fieldError('pulse', form.pulse, true, true),
    respRate: fieldError('respRate', form.respRate, true, true),
    spo2: fieldError('spo2', form.spo2, true, true),
    tempC: fieldError('tempC', form.tempC, true, false),
    glucose: fieldError('glucose', form.glucose, false, false),
  }
  const hasError = Object.values(errors).some(Boolean)
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : undefined)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (hasError || !current?.admissionId) return
    record.mutate(
      {
        admissionId: current.admissionId,
        respRate: Number(form.respRate),
        spo2: Number(form.spo2),
        onOxygen: form.onOxygen,
        systolic: Number(form.systolic),
        diastolic: form.diastolic.trim() ? Number(form.diastolic) : undefined,
        pulse: Number(form.pulse),
        tempC: Number(form.tempC),
        avpu: form.avpu,
        glucoseMgDl: form.glucose.trim() ? Number(form.glucose) : undefined,
        painScore: form.pain !== '' ? Number(form.pain) : undefined,
        note: form.note.trim() || undefined,
      },
      {
        onSuccess: (r) => {
          setResult(r)
          setForm(EMPTY)
          setSubmitted(false)
        },
        onError: (err) => setSaveError(errMessage(err)),
      },
    )
  }

  const last = history.data?.[0]
  const hint = (v: number | undefined | null) => (v != null ? `Last: ${v}` : undefined)

  return (
    <div className="nu-pg">
      <header className="nu-head">
        <div>
          <h1 className="nu-h1">Record vitals</h1>
          <p className="nu-sub">Bed {current.bedNo} · {current.patientName} · NEWS is worked out as you type</p>
        </div>
        <div className="nu-pills" role="group" aria-label="Patient">
          {occupied.map((b) => (
            <button
              key={b.bedId}
              type="button"
              className={`nu-pill${b.bedId === current.bedId ? ' is-on' : ''}`}
              aria-pressed={b.bedId === current.bedId}
              onClick={() => go('vitals', { bed: b.bedId })}
            >
              Bed {b.bedNo}{b.mine ? ' · mine' : ''}
            </button>
          ))}
        </div>
      </header>

      <section className="nu-grid nu-g21">
        <form className="nu-box" onSubmit={onSubmit} aria-label="Vitals entry" noValidate>
          <div className="nu-vit">
            <TextField label="Systolic BP (mmHg)" inputMode="numeric" value={form.systolic} onChange={(e) => set('systolic', e.target.value)} error={show('systolic')} helper={hint(last?.systolic)} required />
            <TextField label="Diastolic BP (mmHg)" inputMode="numeric" value={form.diastolic} onChange={(e) => set('diastolic', e.target.value)} error={show('diastolic')} helper={hint(last?.diastolic)} optional />
            <TextField label="Pulse (/min)" inputMode="numeric" value={form.pulse} onChange={(e) => set('pulse', e.target.value)} error={show('pulse')} helper={hint(last?.pulse)} required />
            <TextField label="Resp. rate (/min)" inputMode="numeric" value={form.respRate} onChange={(e) => set('respRate', e.target.value)} error={show('respRate')} helper={hint(last?.respRate)} required />
            <TextField label="SpO2 (%)" inputMode="numeric" value={form.spo2} onChange={(e) => set('spo2', e.target.value)} error={show('spo2')} helper={hint(last?.spo2)} required />
            <TextField label="Temperature (°C)" inputMode="decimal" value={form.tempC} onChange={(e) => set('tempC', e.target.value)} error={show('tempC')} helper={hint(last?.tempC)} required />
            <TextField label="Blood sugar (mg/dL)" inputMode="numeric" value={form.glucose} onChange={(e) => set('glucose', e.target.value)} error={show('glucose')} helper="Random, if checked" optional />
            <Select label="Consciousness" options={AVPU_OPTIONS} value={form.avpu} onChange={(v) => set('avpu', v as Form['avpu'])} />
            <Select label="Pain score" options={PAIN_OPTIONS} value={form.pain} onChange={(v) => set('pain', v)} />
          </div>
          <Switch label="On supplemental oxygen" description="Adds 2 to the score" checked={form.onOxygen} onChange={(v) => set('onOxygen', v)} />
          <Textarea label="Observation note" optional rows={3} value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} />

          <div className="nu-actions">
            <Button type="submit" loading={record.isPending} disabled={!current.admissionId}>Save to chart</Button>
            {preview ? (
              <NewsChip score={preview.total} band={preview.band} />
            ) : (
              <span className="nu-muted">Fill in the required fields to see the NEWS score.</span>
            )}
          </div>

          {preview ? (
            <div className="nu-parts" aria-label="Score by parameter">
              {preview.parts.map((p, i) => (
                <span key={i} className={`nu-part${p >= 2 ? ' is-hot' : ''}`}>{NEWS_PART_LABELS[i]} {p}</span>
              ))}
            </div>
          ) : null}

          {saveError ? <Alert tone="danger" title="Vitals not saved">{saveError}</Alert> : null}
          {result ? <SavedResult r={result} bedNo={current.bedNo} /> : null}

          <div>
            <h3 className="nu-bt" style={{ marginBottom: 8 }}>Earlier readings</h3>
            {history.isLoading ? (
              <Loading rows={3} label="Loading earlier readings" />
            ) : history.isError ? (
              <ErrorBlock error={history.error} onRetry={() => void history.refetch()} />
            ) : (history.data ?? []).length === 0 ? (
              <Empty title="No earlier readings">This is the first set for this patient.</Empty>
            ) : (
              <div className="nu-hist" role="table" aria-label="Earlier readings">
                <div className="nu-hist-r nu-hist-h" role="row"><span role="columnheader">Time</span><span role="columnheader">BP</span><span role="columnheader">Pulse</span><span role="columnheader">SpO2</span><span role="columnheader">Temp</span><span role="columnheader">NEWS</span></div>
                {history.data!.slice(0, 6).map((v) => (
                  <div className="nu-hist-r" role="row" key={v.id}>
                    <span role="cell" className="nu-mono">{fmtTime(v.observedAt)}</span>
                    <span role="cell">{v.systolic}/{v.diastolic ?? '-'}</span>
                    <span role="cell">{v.pulse}</span>
                    <span role="cell">{v.spo2}%</span>
                    <span role="cell">{v.tempC}</span>
                    <span role="cell"><b className={v.newsScore >= 5 ? 'is-hi' : v.newsScore >= 3 ? 'is-mid' : 'is-ok'}>{v.newsScore}</b></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="nu-list" style={{ gap: 18 }}>
          <div className="nu-box">
            <h2 className="nu-bt">Temperature trend</h2>
            <TempChart rows={history.data ?? []} />
          </div>
          <div className="nu-box">
            <h2 className="nu-bt">What the score means</h2>
            <div className="nu-row"><span className="nu-news is-lo"><span aria-hidden="true">✓</span>0–2 Low</span><span className="nu-grow" style={{ fontSize: 14 }}>Routine · obs every 4–6 h</span></div>
            <div className="nu-row"><span className="nu-news is-mid"><span aria-hidden="true">!</span>3–4 Medium</span><span className="nu-grow" style={{ fontSize: 14 }}>Hourly obs · tell charge nurse. One parameter at 3 needs an urgent doctor review.</span></div>
            <div className="nu-row"><span className="nu-news is-hi"><span aria-hidden="true">‼</span>5–6 High</span><span className="nu-grow" style={{ fontSize: 14 }}>Sent to the treating doctor automatically</span></div>
            <div className="nu-row"><span className="nu-news is-hi"><span aria-hidden="true">‼</span>7+ Critical</span><span className="nu-grow" style={{ fontSize: 14 }}>Rapid response team · stay with the patient</span></div>
          </div>
        </div>
      </section>
    </div>
  )
}

function SavedResult({ r, bedNo }: { r: VitalsResult; bedNo: string }) {
  const parts = [r.newsParts.respRate, r.newsParts.spo2, r.newsParts.oxygen, r.newsParts.systolic, r.newsParts.pulse, r.newsParts.consciousness, r.newsParts.temperature]
  const tone = r.band === 'high' || r.band === 'medium' ? 'danger' : r.band === 'low_medium' ? 'warning' : 'success'
  return (
    <Alert tone={tone} title={`Saved ${fmtTime(r.observedAt)} · Bed ${bedNo} · NEWS ${r.newsScore}`}>
      <div className="nu-list">
        <span>{r.guidance}</span>
        <div className="nu-parts">
          {parts.map((p, i) => (
            <span key={i} className={`nu-part${p >= 2 ? ' is-hot' : ''}`}>{NEWS_PART_LABELS[i]} {p}</span>
          ))}
        </div>
        {r.escalation ? (
          <span>
            <Badge tone="danger" icon={<span>‼</span>}>Escalated</Badge>{' '}
            Level {r.escalation.level}: {r.escalation.pagedRole.replace(/_/g, ' ')} paged.
            {r.escalation.step ? ` Chain step ${r.escalation.step.step}: tell the ${r.escalation.step.notifyRole.replace(/_/g, ' ')} within ${r.escalation.step.withinMinutes} min.` : ''}
          </span>
        ) : (
          <span>No escalation needed.</span>
        )}
      </div>
    </Alert>
  )
}

function TempChart({ rows }: { rows: VitalRow[] }) {
  const pts = [...rows].reverse().slice(-12)
  if (pts.length < 2) return <Empty title="Not enough readings">At least two sets are needed to draw a trend.</Empty>
  const temps = pts.map((p) => p.tempC)
  const lo = Math.min(...temps, 36) - 0.3
  const hi = Math.max(...temps, 38) + 0.3
  const x = (i: number) => (i / (pts.length - 1)) * 300
  const y = (t: number) => 100 - ((t - lo) / (hi - lo)) * 90
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.tempC).toFixed(1)}`).join(' ')
  const first = pts[0]!
  const lastPt = pts[pts.length - 1]!
  return (
    <>
      <svg viewBox="0 0 300 110" role="img" aria-label={`Temperature moved from ${first.tempC} to ${lastPt.tempC} degrees over ${pts.length} readings`} style={{ width: '100%', height: 'auto' }}>
        <path d={`M0 ${y(38).toFixed(1)} H300`} stroke="#d99a96" strokeDasharray="4 4" />
        <path d={`M0 ${y(36).toFixed(1)} H300`} stroke="#e4ddd6" />
        <path d={path} fill="none" stroke="#9a4a46" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(pts.length - 1)} cy={y(lastPt.tempC)} r="4" fill="#9a4a46" />
      </svg>
      <div className="nu-muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{fmtTime(first.observedAt)}</span>
        <span>{first.tempC} → {lastPt.tempC} °C</span>
        <span>{fmtTime(lastPt.observedAt)}</span>
      </div>
    </>
  )
}

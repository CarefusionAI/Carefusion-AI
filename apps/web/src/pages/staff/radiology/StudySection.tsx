import { useEffect, useState } from 'react'
import {
  useLinkPrior,
  useRejectOrder,
  useSaveExposure,
  useStartStudy,
  useStudy,
  useSubmitStudy,
  useUpdateChecklist,
  useWorklist,
} from '../../../api/radiology'
import type { StudyDetail } from '../../../api/radiology'
import { Alert, Badge, Button, Card, Checkbox, EmptyState, PageHeader, TextField, AIInsight } from '../../../components/ui'
import { ConfirmModal, ListSkeleton, LoadError } from '../../../components/ClinicalBits'
import { errorText } from '../../../api/clinicalHttp'
import FilesList from './FilesList'
import ScheduleModal from './ScheduleModal'
import { MODALITY_LABEL, PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, fmtDate, fmtDateTime, modClass } from './util'

const AI_STATUS = { VERIFIED: 'verified', SUPPORTED_WITH_CAUTION: 'caution', UNCERTAIN: 'uncertain' } as const

function Viewer({ d }: { d: StudyDetail }) {
  const [zoom, setZoom] = useState(1)
  const [bright, setBright] = useState(1)
  const chest = /chest/i.test(d.study.bodyPart) && ['XR', 'PORTABLE'].includes(d.study.modality)
  const label = `${d.patient.fullName.split(' ')[0]} · ${d.patient.sex ? d.patient.sex[0]?.toUpperCase() : '?'} · ${d.patient.age ?? '?'}y`
  const imgs = d.series.reduce((n, s) => n + s.instanceCount, 0)
  return (
    <>
      <div className="rt-viewer" role="img" aria-label={`Simulated image viewer placeholder for ${d.study.bodyPart}. No real image is stored in the alpha.`}>
        <div style={{ width: '78%', transform: `scale(${zoom})`, filter: `brightness(${bright})`, transition: 'transform 200ms ease' }} aria-hidden="true">
          {chest ? (
            <svg viewBox="0 0 400 340" width="100%">
              <defs>
                <radialGradient id="rt-lg" cx="50%" cy="45%" r="60%">
                  <stop offset="0" stopColor="#5d6f7c" />
                  <stop offset="1" stopColor="#24323d" />
                </radialGradient>
              </defs>
              <rect width="400" height="340" fill="url(#rt-lg)" />
              <path d="M196 30 v290" stroke="#c9d4dc" strokeWidth="14" opacity=".55" />
              <path d="M188 60 C120 60 70 120 70 210 C70 280 110 310 150 310 C175 310 186 280 186 240 Z" fill="#1b2730" opacity=".85" />
              <path d="M206 60 C280 60 330 120 330 210 C330 280 290 310 250 310 C225 310 210 280 210 240 Z" fill="#1b2730" opacity=".85" />
              <g stroke="#9fb0bc" strokeWidth="5" fill="none" opacity=".5">
                <path d="M190 90 C140 80 100 100 80 130" />
                <path d="M190 120 C140 110 96 130 76 165" />
                <path d="M190 150 C140 140 94 160 74 200" />
                <path d="M206 90 C256 80 296 100 316 130" />
                <path d="M206 120 C256 110 300 130 320 165" />
                <path d="M206 150 C256 140 302 160 322 200" />
              </g>
              <ellipse cx="226" cy="236" rx="52" ry="44" fill="#8a9aa6" opacity=".45" />
            </svg>
          ) : (
            <svg viewBox="0 0 400 300" width="100%">
              <rect width="400" height="300" fill="#2e3f4c" />
              <text x="200" y="150" textAnchor="middle" fill="#9fb0bc" fontSize="22" fontFamily="IBM Plex Mono, monospace">
                {MODALITY_LABEL[d.study.modality] ?? d.study.modality} · {d.study.bodyPart}
              </text>
            </svg>
          )}
        </div>
        {d.study.status === 'in_progress' ? <span className="rt-scan" aria-hidden="true" /> : null}
        <span className="rt-vtag" style={{ left: 14, top: 12 }} aria-hidden="true">
          {label}
          <br />
          {d.study.bodyPart.toUpperCase()} · {fmtDate(d.study.orderedAt)}
        </span>
        <span className="rt-vtag" style={{ left: 14, bottom: 12 }} aria-hidden="true">
          Simulated placeholder
        </span>
        <span className="rt-vtag" style={{ right: 14, bottom: 12 }} aria-hidden="true">
          {imgs ? `${imgs} image${imgs === 1 ? '' : 's'}` : 'No images'} · {d.room?.name ?? 'No room'}
        </span>
        <div className="rt-tools" role="toolbar" aria-label="Viewer tools">
          <button type="button" className="rt-vbtn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1)))}>
            +
          </button>
          <button type="button" className="rt-vbtn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}>
            −
          </button>
          <button type="button" className="rt-vbtn" aria-label="Window level, cycle brightness" onClick={() => setBright((b) => (b >= 1.4 ? 0.7 : +(b + 0.35).toFixed(2)))}>
            ◐
          </button>
        </div>
      </div>
      <p className="rt-muted">Image viewer placeholder. The demo records file details only; it does not store or display real images.</p>
    </>
  )
}

function ExposureForm({ d }: { d: StudyDetail }) {
  const save = useSaveExposure()
  const [v, setV] = useState({ kvp: '', mas: '', dap: '', ms: '' })
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    const e = d.exposure
    setV({ kvp: e?.kvp?.toString() ?? '', mas: e?.mas?.toString() ?? '', dap: e?.dapMgycm2?.toString() ?? '', ms: e?.exposureMs?.toString() ?? '' })
  }, [d.exposure])
  const n = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s))
  const any = [v.kvp, v.mas, v.dap, v.ms].some((x) => n(x) !== undefined)
  return (
    <div className="rt-stack">
      <dl className="rt-kv is-4">
        <div>
          <dt>kVp</dt>
          <dd>{d.exposure?.kvp ?? '—'}</dd>
        </div>
        <div>
          <dt>mAs</dt>
          <dd>{d.exposure?.mas ?? '—'}</dd>
        </div>
        <div>
          <dt>Dose (DAP)</dt>
          <dd className={d.exposure?.dapMgycm2 !== null && d.exposure?.dapMgycm2 !== undefined ? 'good' : undefined}>{d.exposure?.dapMgycm2 ?? '—'}{d.exposure?.dapMgycm2 != null ? ' mGy·cm²' : ''}</dd>
        </div>
        <div>
          <dt>Exposure</dt>
          <dd>{d.exposure?.exposureMs != null ? `${d.exposure.exposureMs} ms` : '—'}</dd>
        </div>
      </dl>
      <div className="rt-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <TextField label="kVp" inputMode="decimal" value={v.kvp} onChange={(e) => setV({ ...v, kvp: e.target.value })} />
        <TextField label="mAs" inputMode="decimal" value={v.mas} onChange={(e) => setV({ ...v, mas: e.target.value })} />
        <TextField label="DAP (mGy·cm²)" inputMode="decimal" value={v.dap} onChange={(e) => setV({ ...v, dap: e.target.value })} />
        <TextField label="Exposure (ms)" inputMode="numeric" value={v.ms} onChange={(e) => setV({ ...v, ms: e.target.value })} />
      </div>
      <div className="rt-row">
        <Button
          size="sm"
          variant="soft"
          loading={save.isPending}
          disabled={!any}
          onClick={() => {
            setSaved(false)
            save.mutate(
              { studyId: d.study.id, kvp: n(v.kvp), mas: n(v.mas), dapMgycm2: n(v.dap), exposureMs: n(v.ms) === undefined ? undefined : Math.round(n(v.ms)!) },
              { onSuccess: () => setSaved(true) },
            )
          }}
        >
          Save exposure log
        </Button>
        {saved ? <span className="rt-muted" role="status">Saved to the exposure log.</span> : null}
      </div>
      {save.isError ? <Alert tone="danger">{errorText(save.error)}</Alert> : null}
    </div>
  )
}

export default function StudySection({
  studyId,
  onOpenStudy,
  onGo,
}: {
  studyId: string | null
  onOpenStudy: (id: string) => void
  onGo: (section: string, studyId?: string) => void
}) {
  const q = useStudy(studyId)
  const wl = useWorklist()
  const start = useStartStudy()
  const checklist = useUpdateChecklist()
  const link = useLinkPrior()
  const submit = useSubmitStudy()
  const reject = useRejectOrder()
  const [scheduling, setScheduling] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [sendFor, setSendFor] = useState(false)

  if (!studyId) {
    const open = (wl.data?.studies ?? []).filter((s) => s.studyId)
    return (
      <div className="rt-page">
        <PageHeader title="Study viewer" subtitle="Pick a study to check the patient, capture details and send images to the doctor." />
        <Card>
          {wl.isLoading ? (
            <ListSkeleton label="Loading studies" />
          ) : open.length === 0 ? (
            <EmptyState title="No study selected" action={<Button onClick={() => onGo('worklist')}>Go to the worklist</Button>}>
              Open a study from the worklist.
            </EmptyState>
          ) : (
            <div className="rt-wl">
              {open.map((r) => (
                <button key={r.orderId} type="button" className="rt-wi" onClick={() => onOpenStudy(r.studyId!)}>
                  <span className={`rt-mod ${modClass(r.modality)}`}>{MODALITY_LABEL[r.modality] ?? r.modality}</span>
                  <span style={{ minWidth: 0 }}>
                    <strong className="rt-title">{r.bodyPart}</strong>
                    <span className="rt-muted">
                      {r.patientName} · {r.orderRef}
                    </span>
                  </span>
                  <Badge tone={PRIORITY_TONE[r.priority] ?? 'neutral'}>{PRIORITY_LABEL[r.priority]}</Badge>
                  <Badge tone={STATUS_TONE[r.status] ?? 'neutral'} dot>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    )
  }

  if (q.isLoading) {
    return (
      <div className="rt-page" role="status" aria-label="Loading study">
        <ListSkeleton rows={1} height={40} />
        <ListSkeleton rows={3} height={140} />
      </div>
    )
  }
  if (q.isError || !q.data) return <LoadError error={q.error} onRetry={() => q.refetch()} title="Could not open this study" />

  const d = q.data
  const s = d.study
  const closed = ['reported', 'withdrawn'].includes(s.status)
  const canStart = ['waiting', 'scheduled'].includes(s.status)
  const canEdit = !closed
  const done = ['awaiting_report', 'reported'].includes(s.status)
  const cl = s.checklist
  const idMatched = cl.id_matched === true || cl.idMatched === true
  const viewsOk = cl.views_acquired === true
  const consentOk = cl.contrast_consent === true
  const creat = typeof cl.creatinine_mg_dl === 'number' ? cl.creatinine_mg_dl : null
  const activeFiles = d.files.filter((f) => !f.withdrawnAt)

  function tick(key: string, v: boolean) {
    checklist.mutate({ studyId: s.id, checklist: { [key]: v } })
  }

  const steps: { key: string; label: string; ok: boolean; control?: 'tick' }[] = [
    { key: 'id_matched', label: 'Patient ID and order matched on the console', ok: idMatched, control: 'tick' },
    { key: 'views_acquired', label: 'All views acquired, no motion blur', ok: viewsOk, control: 'tick' },
    ...(s.contrast ? [{ key: 'contrast_consent', label: `Contrast consent taken${creat !== null ? ` · creatinine ${creat} mg/dL` : ''}`, ok: consentOk, control: 'tick' as const }] : []),
  ]
  const doneCount = steps.filter((x) => x.ok).length + (s.burnedInNameChecked ? 1 : 0) + (d.readiness.priorLinked ? 1 : 0) + (activeFiles.length ? 1 : 0) + (done ? 1 : 0)
  const totalCount = steps.length + 4

  return (
    <div className="rt-page">
      <PageHeader
        eyebrow={`Order ${s.orderRef} · ordered by ${s.orderedBy ?? 'a doctor'} · ${fmtDateTime(s.orderedAt)}`}
        title={s.bodyPart}
        actions={
          <>
            <Button variant="secondary" onClick={() => onGo('worklist')}>
              Back to worklist
            </Button>
            {canStart ? (
              <Button variant="secondary" onClick={() => setScheduling(true)}>
                {s.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
              </Button>
            ) : null}
            {canStart ? (
              <Button variant="primary" loading={start.isPending} onClick={() => start.mutate({ studyId: s.id })}>
                Start study
              </Button>
            ) : (
              <Button variant="primary" onClick={() => onGo('upload', s.id)} disabled={closed}>
                Upload to this order
              </Button>
            )}
          </>
        }
      />
      {start.isError ? <Alert tone="danger">{errorText(start.error)}</Alert> : null}
      {checklist.isError ? <Alert tone="danger">{errorText(checklist.error)}</Alert> : null}

      <section className="rt-grid rt-gm">
        <Card>
          <div className="rt-stack">
            <Viewer d={d} />
            <div className="rt-thumbs" aria-label="Series and prior studies">
              {d.series.map((x, i) => (
                <span key={x.id} className={`rt-th${i === 0 ? ' is-on' : ''}`}>
                  S{x.seriesNo} {x.description ?? x.modality} ({x.instanceCount})
                </span>
              ))}
              {d.priors.map((p) => (
                <span key={p.studyId} className="rt-th">
                  Prior {fmtDate(p.date)} {p.bodyPart}
                </span>
              ))}
              {d.series.length === 0 && d.priors.length === 0 ? <span className="rt-th">No series yet</span> : null}
            </div>

            <h3 className="rt-h2">Exposure log</h3>
            <ExposureForm d={d} />

            <div className="rt-pend">
              <div className="rt-bh">
                <strong style={{ color: 'var(--ink)', fontSize: 14 }}>Before you send</strong>
                <span className="rt-muted">
                  {doneCount} of {totalCount} done
                </span>
              </div>
              {steps.map((x) => (
                <div key={x.key} className="rt-pend-r">
                  <Checkbox label={x.label} checked={x.ok} disabled={!canEdit || checklist.isPending} onChange={(v) => tick(x.key, v)} />
                </div>
              ))}
              <div className="rt-pend-r">
                <Checkbox
                  label="Patient name burned into the image matches the order"
                  checked={s.burnedInNameChecked}
                  disabled={!canEdit || checklist.isPending}
                  onChange={(v) => checklist.mutate({ studyId: s.id, burnedInNameChecked: v })}
                />
              </div>
              <div className="rt-pend-r">
                <span className={`rt-pd${d.readiness.priorLinked ? ' ok' : ''}`} aria-hidden="true" />
                <span style={{ flex: 1 }}>
                  {d.readiness.priorLinked ? 'Prior study linked for comparison' : 'Prior study linked for comparison (optional, see below)'}
                </span>
              </div>
              <div className="rt-pend-r">
                <span className={`rt-pd${activeFiles.length ? ' ok' : ''}`} aria-hidden="true" />
                <span style={{ flex: 1 }}>{activeFiles.length ? `${activeFiles.length} image file${activeFiles.length === 1 ? '' : 's'} recorded` : 'Image files recorded (none yet)'}</span>
              </div>
              <div className="rt-pend-r">
                <span className={`rt-pd${done ? ' ok' : ''}`} aria-hidden="true" />
                <span style={{ flex: 1 }}>Send to reporting doctor{s.orderedBy ? ` (${s.orderedBy})` : ''}</span>
              </div>
            </div>
          </div>
        </Card>

        <div className="rt-col">
          <Card title="Study details" titleAs="h2" actions={<Badge tone={STATUS_TONE[s.status] ?? 'neutral'} dot>{STATUS_LABEL[s.status] ?? s.status}</Badge>}>
            <div className="rt-stack">
              <dl className="rt-kv">
                <div>
                  <dt>Patient</dt>
                  <dd>
                    {d.patient.fullName}
                    {d.patient.age !== null ? ` · ${d.patient.age}` : ''}
                    {d.patient.sex ? ` ${d.patient.sex[0]?.toUpperCase()}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Modality</dt>
                  <dd>{MODALITY_LABEL[s.modality] ?? s.modality}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{PRIORITY_LABEL[s.priority] ?? s.priority}</dd>
                </div>
                <div>
                  <dt>Room</dt>
                  <dd>{d.room?.name ?? 'Not assigned'}</dd>
                </div>
                <div>
                  <dt>Where</dt>
                  <dd>{d.patient.location}</dd>
                </div>
                <div>
                  <dt>Contrast</dt>
                  <dd>{s.contrast ? 'Yes' : 'None'}</dd>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt>Clinical note</dt>
                  <dd>{s.clinicalNote ?? '—'}</dd>
                </div>
                {d.slot ? (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <dt>Booked slot</dt>
                    <dd>
                      {fmtDateTime(d.slot.startsAt)} to {fmtDateTime(d.slot.endsAt)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {d.patient.allergies.length ? (
                <Alert tone="danger" title="Allergy on record">
                  {d.patient.allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`).join('; ')}
                </Alert>
              ) : (
                <Alert tone="info" title="No allergy on record">Nothing recorded for this patient. Still ask before contrast.</Alert>
              )}
            </div>
          </Card>

          {d.aiPreRead ? (
            <AIInsight
              module="Image analysis · pre-read"
              status={AI_STATUS[d.aiPreRead.confidenceLabel]}
              confidence={d.aiPreRead.confidence}
              title={d.aiPreRead.finding}
              evidence={d.aiPreRead.evidence}
              simulated
              reviewed={false}
            >
              <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
                For the reporting doctor only. Not shown to the patient until a doctor reviews it. You don't act on this. {d.aiPreRead.disclaimer}
              </p>
            </AIInsight>
          ) : (
            <Alert tone="info" title="No simulated AI pre-read for this modality">The reporting doctor reads the images.</Alert>
          )}

          <Card title="Priors for comparison" titleAs="h2">
            <div className="rt-stack">
              {d.priors.length === 0 && d.priorCandidates.length === 0 ? (
                <p className="rt-muted">No earlier studies for this patient at this hospital.</p>
              ) : null}
              {d.priors.map((p) => (
                <div key={p.studyId} className="rt-eq">
                  <div>
                    <strong>
                      {MODALITY_LABEL[p.modality] ?? p.modality} · {p.bodyPart}
                    </strong>
                    <div className="rt-muted">{fmtDate(p.date)} · linked</div>
                  </div>
                  <Badge tone="success">Linked</Badge>
                </div>
              ))}
              {d.priorCandidates
                .filter((c) => !d.priors.some((p) => p.studyId === c.studyId))
                .map((c) => (
                  <div key={c.studyId} className="rt-eq">
                    <div>
                      <strong>
                        {MODALITY_LABEL[c.modality] ?? c.modality} · {c.bodyPart}
                      </strong>
                      <div className="rt-muted">
                        {fmtDate(c.date)} · {STATUS_LABEL[c.status] ?? c.status}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" disabled={!canEdit} loading={link.isPending && link.variables?.priorStudyId === c.studyId} onClick={() => link.mutate({ studyId: s.id, priorStudyId: c.studyId })}>
                      Link as prior
                    </Button>
                  </div>
                ))}
              {link.isError ? <Alert tone="danger">{errorText(link.error)}</Alert> : null}
            </div>
          </Card>

          <Card title="Files" titleAs="h2">
            <FilesList studyId={s.id} files={d.files} readOnly={closed} />
          </Card>

          <Card tone="lavender">
            <div className="rt-stack">
              <div className="rt-bh">
                <h2 className="rt-h2">Review</h2>
                <Badge tone="ai">{done ? 'With the doctor' : 'Pending'}</Badge>
              </div>
              <p style={{ margin: 0, fontSize: 14 }}>
                {done
                  ? `Study complete. ${s.orderedBy ?? 'The doctor'} was notified and reviews the images before the patient sees a report.`
                  : `When imaging is done, send it to the reporting doctor${s.orderedBy ? ` (${s.orderedBy})` : ''}. They review the images before the patient sees a report.`}
              </p>
              {!done && !d.readiness.canSubmit ? (
                <p className="rt-muted">
                  To send: {[!s.burnedInNameChecked ? 'confirm the name on the image' : null, !activeFiles.length ? 'record at least one image file' : null, !['in_progress', 'uploaded'].includes(s.status) ? 'start the study' : null].filter(Boolean).join(', ')}.
                </p>
              ) : null}
              <div className="rt-row">
                <Button size="sm" disabled={done || closed || !d.readiness.canSubmit} onClick={() => setSendFor(true)}>
                  {done ? 'Sent to doctor' : 'Mark complete and notify'}
                </Button>
                {canStart ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>
                    Decline order
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <ScheduleModal open={scheduling} onClose={() => setScheduling(false)} study={{ studyId: s.id, modality: s.modality, label: `${s.bodyPart} · ${d.patient.fullName}` }} />

      <ConfirmModal
        open={sendFor}
        title="Send to the reporting doctor?"
        confirmLabel="Mark complete and notify"
        busy={submit.isPending}
        error={submit.error}
        onClose={() => {
          submit.reset()
          setSendFor(false)
        }}
        onConfirm={() => submit.mutate(s.id, { onSuccess: () => setSendFor(false) })}
      >
        <p style={{ margin: 0 }}>
          {s.orderedBy ?? 'The ordering doctor'} is told the images for <strong>{s.bodyPart}</strong> ({d.patient.fullName}) are ready. After this the study is awaiting report.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={declining}
        title="Decline this imaging order?"
        confirmLabel="Decline order"
        reasonLabel="Reason for declining"
        danger
        busy={reject.isPending}
        error={reject.error}
        onClose={() => {
          reject.reset()
          setDeclining(false)
        }}
        onConfirm={(reason) => reject.mutate({ orderId: s.orderId, reason }, { onSuccess: () => { setDeclining(false); onGo('worklist') } })}
      >
        <p style={{ margin: 0 }}>The ordering doctor is told why. The study is withdrawn and this cannot be undone.</p>
      </ConfirmModal>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useAddFile, useStartStudy, useStudy, useSubmitStudy, useUpdateChecklist, useWorklist } from '../../../api/radiology'
import { Alert, Badge, Button, Card, Checkbox, EmptyState, PageHeader, Select } from '../../../components/ui'
import { ListSkeleton, LoadError } from '../../../components/ClinicalBits'
import { errorText } from '../../../api/clinicalHttp'
import FilesList from './FilesList'
import { MODALITY_LABEL, STATUS_LABEL, fileKind, fmtBytes, sha256Hex } from './util'

interface QueuedFile {
  id: string
  file: File
  state: 'hashing' | 'ready' | 'recording' | 'recorded' | 'error'
  sha256?: string
  error?: string
}

const MAX_BYTES = 2_147_483_648
const UPLOADABLE = ['in_progress', 'uploaded', 'awaiting_report']

export default function UploadSection({ studyId, onGo }: { studyId: string | null; onGo: (section: string, studyId?: string) => void }) {
  const wl = useWorklist()
  const [chosen, setChosen] = useState<string>(studyId ?? '')
  const options = (wl.data?.studies ?? []).filter((s) => s.studyId && !['reported', 'withdrawn'].includes(s.status))

  useEffect(() => {
    if (studyId) setChosen(studyId)
  }, [studyId])
  useEffect(() => {
    if (!chosen && options.length) setChosen(options.find((o) => UPLOADABLE.includes(o.status))?.studyId ?? options[0]!.studyId!)
  }, [chosen, options])

  const q = useStudy(chosen || null)
  const addFile = useAddFile()
  const start = useStartStudy()
  const checklist = useUpdateChecklist()
  const submit = useSubmitStudy()

  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [match, setMatch] = useState(false)
  const [over, setOver] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // Switching to another order clears the local queue (files only attach to one study).
  useEffect(() => {
    setQueue([])
    setSent(false)
    setErr(null)
  }, [chosen])
  useEffect(() => {
    if (q.data) setMatch(q.data.study.burnedInNameChecked)
  }, [q.data?.study.id, q.data?.study.burnedInNameChecked]) // eslint-disable-line react-hooks/exhaustive-deps

  const d = q.data
  const uploadable = !!d && UPLOADABLE.includes(d.study.status)
  const recordedCount = d?.files.filter((f) => !f.withdrawnAt).length ?? 0

  function add(list: FileList | null) {
    if (!list) return
    const items: QueuedFile[] = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      state: file.size > MAX_BYTES ? 'error' : 'hashing',
      error: file.size > MAX_BYTES ? 'Larger than 2 GB' : undefined,
    }))
    setQueue((cur) => [...cur, ...items])
    setSent(false)
    for (const it of items) {
      if (it.state !== 'hashing') continue
      sha256Hex(it.file)
        .then((sha) => setQueue((cur) => cur.map((x) => (x.id === it.id ? { ...x, state: 'ready', sha256: sha } : x))))
        .catch(() => setQueue((cur) => cur.map((x) => (x.id === it.id ? { ...x, state: 'ready' } : x))))
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    add(e.dataTransfer.files)
  }

  async function recordAll() {
    if (!d) return
    setBusy(true)
    setErr(null)
    let series = d.series.reduce((m, s) => Math.max(m, s.seriesNo), 0)
    for (const it of queue.filter((x) => x.state === 'ready')) {
      setQueue((cur) => cur.map((x) => (x.id === it.id ? { ...x, state: 'recording' } : x)))
      const kind = fileKind(it.file.name, it.file.type)
      try {
        await addFile.mutateAsync({
          studyId: d.study.id,
          file: {
            fileName: it.file.name,
            kind,
            mimeType: it.file.type || undefined,
            sizeBytes: it.file.size,
            sha256: it.sha256,
            ...(kind === 'dicom' || kind === 'zip' ? { seriesNo: ++series, seriesDescription: it.file.name.slice(0, 200) } : {}),
          },
        })
        setQueue((cur) => cur.map((x) => (x.id === it.id ? { ...x, state: 'recorded' } : x)))
      } catch (e) {
        setQueue((cur) => cur.map((x) => (x.id === it.id ? { ...x, state: 'error', error: errorText(e) } : x)))
        setErr(errorText(e))
        break
      }
    }
    // Recorded files now show in the "Recorded on this order" list below.
    setQueue((cur) => cur.filter((x) => x.state !== 'recorded'))
    setBusy(false)
  }

  async function sendToDoctor() {
    if (!d) return
    setBusy(true)
    setErr(null)
    try {
      if (!d.study.burnedInNameChecked) await checklist.mutateAsync({ studyId: d.study.id, burnedInNameChecked: true })
      await submit.mutateAsync(d.study.id)
      setSent(true)
    } catch (e) {
      setErr(errorText(e))
    }
    setBusy(false)
  }

  const readyCount = queue.filter((x) => x.state === 'ready').length
  const hashing = queue.some((x) => x.state === 'hashing' || x.state === 'recording')
  const alreadySent = !!d && ['awaiting_report', 'reported'].includes(d.study.status)
  const canSend = !!d && uploadable && !alreadySent && recordedCount > 0 && readyCount === 0 && !hashing && match && !busy

  return (
    <div className="rt-page">
      <PageHeader title="Upload images to an order" subtitle="Pick the order first. Files only attach to that patient and that study." />

      {wl.isError ? <LoadError error={wl.error} onRetry={() => wl.refetch()} /> : null}

      <section className="rt-grid rt-g2">
        <Card>
          <div className="rt-stack">
            <h2 className="rt-h2">1 · Choose the order</h2>
            {wl.isLoading ? (
              <ListSkeleton rows={2} height={48} label="Loading orders" />
            ) : options.length === 0 ? (
              <EmptyState title="No open imaging orders">Orders from doctors appear on the worklist first.</EmptyState>
            ) : (
              <Select
                label="Imaging order"
                value={chosen}
                onChange={(v) => setChosen(v)}
                options={options.map((s) => ({ value: s.studyId!, label: `${s.orderRef} · ${s.bodyPart} · ${s.patientName}` }))}
              />
            )}
            {q.isLoading && chosen ? <ListSkeleton rows={1} height={96} label="Loading order" /> : null}
            {q.isError ? <LoadError error={q.error} onRetry={() => q.refetch()} /> : null}
            {d ? (
              <dl className="rt-kv">
                <div>
                  <dt>Patient</dt>
                  <dd>{d.patient.fullName}</dd>
                </div>
                <div>
                  <dt>Study</dt>
                  <dd>{d.study.bodyPart}</dd>
                </div>
                <div>
                  <dt>Ordered by</dt>
                  <dd>{d.study.orderedBy ?? '—'}</dd>
                </div>
                <div>
                  <dt>Modality</dt>
                  <dd>
                    {MODALITY_LABEL[d.study.modality] ?? d.study.modality} · {STATUS_LABEL[d.study.status] ?? d.study.status}
                  </dd>
                </div>
              </dl>
            ) : null}

            {d && !uploadable ? (
              <Alert
                tone="warning"
                title={['waiting', 'scheduled'].includes(d.study.status) ? 'Start the study before uploading' : `This study is ${STATUS_LABEL[d.study.status] ?? d.study.status}`}
                action={
                  ['waiting', 'scheduled'].includes(d.study.status) ? (
                    <Button size="sm" variant="outline" loading={start.isPending} onClick={() => start.mutate({ studyId: d.study.id })}>
                      Start study
                    </Button>
                  ) : undefined
                }
              >
                Images can be added once imaging has started.
              </Alert>
            ) : null}

            <h2 className="rt-h2" style={{ marginTop: 6 }}>
              2 · Add files
            </h2>
            <button
              type="button"
              className={`rt-drop${over ? ' is-over' : ''}`}
              disabled={!uploadable}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--primary-text)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 16V4M7 9l5-5l5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
              </svg>
              <strong>Drop DICOM or images here, or click to add</strong>
              <span className="rt-muted">.dcm, .zip of a series, JPG/PNG · up to 2 GB per file</span>
            </button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept=".dcm,.zip,.jpg,.jpeg,.png,.pdf,application/dicom,image/*"
              onChange={(e) => {
                add(e.target.files)
                e.target.value = ''
              }}
            />
            <p className="rt-muted">The demo records each file's name, size and checksum against the order. The file bytes themselves are not stored.</p>

            <Checkbox
              label="Patient name and ID on the images match the order"
              checked={match}
              disabled={!uploadable || alreadySent}
              onChange={setMatch}
            />
            <div className="rt-row">
              <Button variant="soft" disabled={readyCount === 0 || busy || !uploadable} loading={busy && queue.some((x) => x.state === 'recording')} onClick={recordAll}>
                {readyCount ? `Record ${readyCount} file${readyCount === 1 ? '' : 's'}` : 'Record files'}
              </Button>
              <Button variant="primary" disabled={!canSend} loading={busy && !queue.some((x) => x.state === 'recording')} onClick={sendToDoctor}>
                {alreadySent || sent ? 'Sent' : 'Send to reporting doctor'}
              </Button>
              <Button variant="ghost" onClick={() => onGo('worklist')}>
                Cancel
              </Button>
            </div>
            {!canSend && d && uploadable && !alreadySent ? (
              <p className="rt-muted">
                To send: {[readyCount > 0 ? 'record the queued files' : null, recordedCount === 0 && readyCount === 0 ? 'add at least one file' : null, !match ? 'tick the name check' : null].filter(Boolean).join(', ') || 'one moment'}.
              </p>
            ) : null}
            {err ? <Alert tone="danger">{err}</Alert> : null}
          </div>
        </Card>

        <Card title="Files in this upload" titleAs="h2" actions={<span className="rt-muted">{queue.length + recordedCount} file{queue.length + recordedCount === 1 ? '' : 's'}</span>}>
          <div className="rt-stack">
            {queue.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Files waiting to be recorded">
                {queue.map((f) => {
                  const pct = f.state === 'hashing' ? 40 : f.state === 'ready' ? 70 : f.state === 'recording' ? 90 : f.state === 'recorded' ? 100 : 0
                  return (
                    <li key={f.id} className="rt-up">
                      <span className="rt-mod rt-m-ct rt-up-ext">{(f.file.name.split('.').pop() ?? 'file').slice(0, 4).toUpperCase()}</span>
                      <div className="rt-up-body">
                        <div className="rt-up-top">
                          <strong>{f.file.name}</strong>
                          <span className="rt-muted">{fmtBytes(f.file.size)}</span>
                        </div>
                        <div className="rt-bar" role="progressbar" aria-label={`${f.file.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                          <span style={{ transform: `scaleX(${pct / 100})` }} />
                        </div>
                        {f.error ? <span className="rt-muted" style={{ color: 'var(--danger)' }}>{f.error}</span> : null}
                      </div>
                      <span className="rt-muted" style={{ width: 84, textAlign: 'right' }}>
                        {f.state === 'hashing' ? 'Checking…' : f.state === 'ready' ? 'Ready' : f.state === 'recording' ? 'Recording…' : f.state === 'recorded' ? 'Recorded' : 'Failed'}
                      </span>
                      {f.state === 'ready' || f.state === 'error' ? (
                        <Button size="sm" variant="ghost" aria-label={`Remove ${f.file.name} from the queue`} onClick={() => setQueue((cur) => cur.filter((x) => x.id !== f.id))}>
                          Remove
                        </Button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}

            {d ? (
              <>
                <div className="rt-bh">
                  <h3 className="rt-h2">Recorded on this order</h3>
                  {recordedCount ? <Badge tone="success">{recordedCount} active</Badge> : null}
                </div>
                <FilesList studyId={d.study.id} files={d.files} readOnly={['reported', 'withdrawn'].includes(d.study.status)} />
              </>
            ) : null}

            {sent ? (
              <Alert tone="success" title="Sent to the doctor">
                Images are linked to {d?.study.orderRef}. {d?.study.orderedBy ?? 'The ordering doctor'} was notified and reviews them before the patient sees a report.
              </Alert>
            ) : null}

            <div className="rt-note-box">
              <strong style={{ color: 'var(--ink)', fontSize: 14 }}>Before you send</strong>
              <ul>
                <li>Burned-in names are checked against the order</li>
                <li>Wrong-patient uploads can be withdrawn within 24 h, with a reason</li>
                <li>Every upload is in the audit log</li>
              </ul>
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}

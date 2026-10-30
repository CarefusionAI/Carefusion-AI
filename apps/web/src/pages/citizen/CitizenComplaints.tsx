import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ComplaintDto } from '@carefusion/shared'
import { Alert, Badge, Button, Checkbox, EmptyState, Select, Skeleton, TextField, Textarea } from '../../components/ui'
import {
  errorText,
  useAddComplaintNote,
  useComplaintOptions,
  useComplaints,
  useCreateComplaint,
  useReopenComplaint,
} from '../../api/citizen2'
import { Box, C2Head, CardSkeleton, ErrorBox, fmtLong, fmtTime, useToast } from './c2kit'
import './citizen2.css'

const STAGES = ['Filed', 'Under review', 'Resolved']
const SEV_TONE = { normal: 'neutral', urgent: 'warning', safety: 'danger' } as const

function Tracker({ stage }: { stage: 0 | 1 | 2 }) {
  return (
    <div className="c2-tk-wrap" role="img" aria-label={`Progress: ${STAGES[stage]}, step ${stage + 1} of 3`}>
      <div className="c2-tk-line" aria-hidden="true"><span className={`c2-tk-fill c2-p${stage}`} /></div>
      {STAGES.map((s, i) => (
        <div key={s} className={`c2-tk${i < stage ? ' on' : ''}${i === stage ? (stage === 2 ? ' on' : ' now') : ''}`}>
          <span className="c2-tk-d" aria-hidden="true">{i < stage || stage === 2 ? '✓' : i + 1}</span>
          <b>{s}</b>
        </div>
      ))}
    </div>
  )
}

export default function CitizenComplaintsScreen() {
  const list = useComplaints()
  const options = useComplaintOptions()
  const create = useCreateComplaint()
  const addNote = useAddComplaintNote()
  const reopen = useReopenComplaint()
  const toast = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [note, setNote] = useState('')

  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('normal')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [placeKey, setPlaceKey] = useState('')
  const [placeText, setPlaceText] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [mayCall, setMayCall] = useState(true)
  const [filed, setFiled] = useState<ComplaintDto | null>(null)

  const complaints = list.data ?? []
  useEffect(() => {
    const first = complaints[0]
    if (!selectedId && first && !composing) setSelectedId(first.id)
  }, [complaints, selectedId, composing])
  const current = complaints.find((c) => c.id === selectedId) ?? null

  function resetForm() {
    setCategory('')
    setSeverity('normal')
    setTitle('')
    setBody('')
    setPlaceKey('')
    setPlaceText('')
    setVisitDate('')
    setMayCall(true)
  }

  function onFile(e: FormEvent) {
    e.preventDefault()
    if (!category) {
      toast.show('Choose a topic', 'What is this complaint about?')
      return
    }
    const place = options.data?.places.find((p) => `${p.type}:${p.id}` === placeKey)
    create.mutate(
      {
        category: category as never,
        severity: severity as never,
        title: title.trim(),
        body: body.trim(),
        hospitalId: place?.type === 'hospital' ? place.id : undefined,
        pharmacyId: place?.type === 'pharmacy' ? place.id : undefined,
        placeText: placeText.trim() || undefined,
        visitDate: visitDate || undefined,
        mayCallMe: mayCall,
      },
      {
        onSuccess: (c) => {
          setFiled(c)
          setSelectedId(c.id)
          setComposing(false)
          resetForm()
        },
        onError: (er) => toast.show('Could not file', errorText(er)),
      },
    )
  }

  function onNote() {
    if (!current || !note.trim()) return
    addNote.mutate(
      { id: current.id, text: note.trim() },
      {
        onSuccess: () => {
          setNote('')
          toast.show('Note added')
        },
        onError: (er) => toast.show('Could not add note', errorText(er)),
      },
    )
  }

  function onReopen() {
    if (!current) return
    if (note.trim().length < 3) {
      toast.show('Tell us what is still wrong', 'Write at least a few words in the box first.')
      return
    }
    reopen.mutate(
      { id: current.id, text: note.trim() },
      {
        onSuccess: () => {
          setNote('')
          toast.show('Complaint reopened', 'It goes back to the hospital admin.')
        },
        onError: (er) => toast.show('Could not reopen', errorText(er)),
      },
    )
  }

  const categories = options.data?.categories ?? []
  const label = (v: string) => categories.find((c) => c.value === v)?.label ?? v
  const placeName = (c: ComplaintDto) =>
    c.place ?? options.data?.places.find((p) => p.id === c.hospitalId || p.id === c.pharmacyId)?.name ?? '—'

  return (
    <div className="c2-page">
      <C2Head
        eyebrow="Care · Complaints"
        title="Complaints"
        lead="Tell us what went wrong. The hospital admin must reply within 7 days, and it moves up to the district if nobody does."
        actions={
          <Button onClick={() => { setComposing(true); setFiled(null) }} disabled={composing}>
            New complaint
          </Button>
        }
      />

      {filed ? (
        <div className="c2-success c2-in" role="status">
          <span className="c2-tick" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#faf5ef" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4l10-10" /></svg>
          </span>
          <div>
            <strong>Complaint {filed.ref} filed</strong>
            <div>You will hear back by {filed.dueAt ? fmtLong(filed.dueAt) : 'within 7 days'}.</div>
          </div>
        </div>
      ) : null}

      <div className="c2-grid c2-wide c2-in c2-d1">
        <div className="c2-stack">
          {composing ? (
            <Box title="New complaint" titleId="cm-new">
              <form onSubmit={onFile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="c2-two">
                  <Select label="What is it about?" value={category} onChange={setCategory} placeholder="Choose a topic" options={categories} />
                  <Select label="How serious?" value={severity} onChange={setSeverity} options={options.data?.severities ?? [{ value: 'normal', label: 'Normal' }]} />
                </div>
                <Select
                  label="Where did it happen?"
                  value={placeKey}
                  onChange={setPlaceKey}
                  placeholder="Choose a hospital or pharmacy"
                  optional
                  options={(options.data?.places ?? []).map((p) => ({ value: `${p.type}:${p.id}`, label: p.name }))}
                />
                <div className="c2-two">
                  <TextField label="Or say where" optional value={placeText} onChange={(e) => setPlaceText(e.target.value)} />
                  <TextField label="Date of visit" optional type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
                </div>
                <TextField label="Short title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
                <Textarea label="What happened?" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1000} required helper="Leave out other people's names and medical details." />
                <button type="button" className="c2-drop" disabled>
                  <span aria-hidden="true">＋</span>
                  <span>
                    <strong>Attach photos or documents</strong>
                    <br /><span className="c2-muted">Not available in this demo</span>
                  </span>
                </button>
                <Checkbox label="You may call me about this" checked={mayCall} onChange={setMayCall} />
                {severity === 'safety' || severity === 'urgent' ? (
                  <Alert tone="warning" title="In an emergency, call 108 first">
                    Complaints are read in working hours. {options.data?.helpline ?? ''}
                  </Alert>
                ) : null}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary" onClick={() => { setComposing(false); resetForm() }}>Cancel</Button>
                  <Button type="submit" loading={create.isPending} disabled={!category || title.trim().length < 3 || body.trim().length < 3 || (!placeKey && !placeText.trim())}>
                    File complaint
                  </Button>
                </div>
              </form>
            </Box>
          ) : current ? (
            <Box
              title={
                <>
                  <span className="c2-mono">{current.ref}</span> · {current.title ?? label(current.category)}
                </>
              }
              titleId="cm-cur"
              actions={<Badge tone={SEV_TONE[current.severity as keyof typeof SEV_TONE] ?? 'neutral'}>{current.severity}</Badge>}
            >
              <Tracker stage={current.stage} />
              <div className="c2-kv">
                <span>Topic</span><b>{label(current.category)}</b>
                <span>Place</span><b>{placeName(current)}</b>
                <span>Filed</span><b>{fmtLong(current.filedAt)}</b>
                <span>{current.resolvedAt ? 'Resolved' : 'Reply due'}</span>
                <b>{current.resolvedAt ? fmtLong(current.resolvedAt) : current.dueAt ? fmtLong(current.dueAt) : '—'}</b>
              </div>
              <p style={{ margin: 0 }}>{current.body}</p>
              {current.escalationLevel > 0 ? (
                <Alert tone="info" title="Moved up">This complaint has been passed to a higher level because it was not answered in time.</Alert>
              ) : null}
              <h3 className="c2-bt" style={{ margin: '4px 0 0' }}>Timeline</h3>
              <ol className="c2-tl2">
                {current.timeline.map((t) => (
                  <li key={t.id}>
                    <span className="d" aria-hidden="true" />
                    <span>
                      <strong>{t.actor}</strong> {t.kind.replace('_', ' ')}
                      {t.text ? <span className="c2-muted"> — {t.text}</span> : null}
                    </span>
                    <span className="c2-muted">{fmtLong(t.at)}, {fmtTime(t.at)}</span>
                  </li>
                ))}
              </ol>
              <Textarea
                label={current.stage === 2 ? 'Still not right? Tell us why' : 'Add a note'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {current.stage === 2 ? (
                  <Button variant="secondary" onClick={onReopen} loading={reopen.isPending}>Reopen complaint</Button>
                ) : null}
                {current.stage !== 2 ? (
                  <Button onClick={onNote} disabled={!note.trim()} loading={addNote.isPending}>Add note</Button>
                ) : null}
              </div>
            </Box>
          ) : list.isLoading ? (
            <CardSkeleton lines={6} label="Loading complaints" />
          ) : (
            <EmptyState
              title="No complaints"
              action={<Button onClick={() => setComposing(true)}>File a complaint</Button>}
            >
              Nothing filed yet. If something went wrong, tell us here.
            </EmptyState>
          )}
        </div>

        <aside className="c2-stack" aria-label="Your complaints">
          <Box title="Your complaints" titleId="cm-list">
            {list.isLoading ? (
              <Skeleton lines={4} />
            ) : list.isError ? (
              <ErrorBox error={list.error} onRetry={() => void list.refetch()} />
            ) : complaints.length === 0 ? (
              <p className="c2-muted" style={{ margin: 0 }}>Nothing here yet.</p>
            ) : (
              <div className="c2-list">
                {complaints.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`c2-cm${c.id === selectedId && !composing ? ' on' : ''}`}
                    onClick={() => { setSelectedId(c.id); setComposing(false); setFiled(null) }}
                    aria-current={c.id === selectedId && !composing ? 'true' : undefined}
                  >
                    <span className="c2-cm-i c2-t-teal" aria-hidden="true">{c.ref.slice(-4)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="c2-nm" style={{ display: 'block' }}>{c.title ?? label(c.category)}</span>
                      <span className="c2-muted">{placeName(c)} · {fmtLong(c.filedAt)}</span>
                    </span>
                    <Badge tone={c.stage === 2 ? 'success' : c.stage === 1 ? 'info' : 'warning'}>{STAGES[c.stage]}</Badge>
                  </button>
                ))}
              </div>
            )}
          </Box>

          <Box title="What happens next" titleId="cm-next">
            <ul className="c2-next3">
              {(options.data?.process ?? ['You file it', 'The hospital admin replies', 'It moves up if there is no reply']).map((p, i) => (
                <li key={p}><strong>Step {i + 1}</strong>{p}</li>
              ))}
            </ul>
            <div className="c2-esc">
              <p className="c2-esc-h">If nobody answers</p>
              <div className="c2-esc-r"><span className="c2-esc-n">1</span><span><strong>Hospital admin</strong><br />7 days</span></div>
              <div className="c2-esc-r"><span className="c2-esc-n">2</span><span><strong>District office</strong><br />next 7 days</span></div>
              <div className="c2-esc-r"><span className="c2-esc-n">3</span><span><strong>State office</strong><br />after that</span></div>
            </div>
            {options.data?.helpline ? <p className="c2-muted" style={{ margin: 0 }}>{options.data.helpline}</p> : null}
          </Box>
        </aside>
      </div>
      {toast.node}
    </div>
  )
}

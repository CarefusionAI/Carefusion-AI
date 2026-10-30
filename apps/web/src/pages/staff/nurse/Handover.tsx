import { useMemo, useState } from 'react'
import { AIInsight, Alert, Badge, Button, Checkbox, Select, TextField, Textarea } from '../../../components/ui'
import {
  errMessage,
  useAddNote,
  useCreateHandover,
  useHandoverItemDone,
  useMar,
  useNotes,
  useNurseBoard,
  useNurseColleagues,
  useNurseHandovers,
  useNurseMe,
  useNurseOrders,
  useNurseTasks,
  useSignHandover,
} from '../../../api/nurse'
import type { HandoverCreateInput, HandoverFlag, HandoverView } from '../../../api/nurse'
import { BoxHead, Empty, ErrorBlock, Loading, PageLoading, fmtDateTime, fmtTime } from './common'
import { ConfirmModal } from './dialogs'
import type { Go } from './types'

type DraftItem = HandoverCreateInput['items'][number] & { key: string; label: string; keep: boolean }

const FLAGS: { value: HandoverFlag; label: string }[] = [
  { value: 'watch', label: 'Watch closely' },
  { value: 'pending', label: 'Still to do' },
  { value: 'transfer', label: 'Transfer or discharge' },
  { value: 'info', label: 'For information' },
]
const FLAG_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = { watch: 'danger', pending: 'warning', transfer: 'info', info: 'neutral' }
const FLAG_ICON: Record<string, string> = { watch: '‼', pending: '!', transfer: '→', info: 'i' }
const flagLabel = (f: string) => FLAGS.find((x) => x.value === f)?.label ?? f

export default function Handover({ bedId, go }: { bedId: string | null; go: Go }) {
  const board = useNurseBoard()
  const me = useNurseMe()
  const mar = useMar()
  const orders = useNurseOrders('all')
  const tasks = useNurseTasks('mine', 'open')
  const handovers = useNurseHandovers()
  const colleagues = useNurseColleagues()
  const create = useCreateHandover()
  const sign = useSignHandover()
  const itemDone = useHandoverItemDone()

  const occupied = useMemo(() => (board.data?.beds ?? []).filter((b) => b.admissionId), [board.data])
  const [selBed, setSelBed] = useState<string>(bedId ?? '')
  const bed = occupied.find((b) => b.bedId === selBed) ?? occupied.find((b) => b.bedId === bedId) ?? occupied.find((b) => b.mine) ?? occupied[0]

  const [to, setTo] = useState('')
  const [summary, setSummary] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [aiText, setAiText] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [signing, setSigning] = useState<HandoverView | null>(null)
  const [signError, setSignError] = useState<string | null>(null)
  // manual item
  const [mBed, setMBed] = useState('')
  const [mFlag, setMFlag] = useState<HandoverFlag>('pending')
  const [mNote, setMNote] = useState('')

  if (board.isLoading) return <PageLoading title="handover" />
  if (board.isError) return <ErrorBlock error={board.error} onRetry={() => void board.refetch()} />

  const data = board.data!
  const overdue = (mar.data?.doses ?? []).filter((d) => d.status === 'overdue')
  const openOrders = (orders.data ?? []).filter((o) => o.actionable && (o.status === 'open' || o.status === 'accepted' || o.status === 'in_progress'))
  const watch = data.beds.filter((b) => b.admissionId && (b.latestNews ?? 0) >= 3)
  const myId = me.data?.userId

  /** Simulated AI draft: built from the live ward board, overdue doses and open orders. The nurse edits it before it is sent. */
  function draftWithAi() {
    const out: DraftItem[] = []
    for (const b of data.beds.filter((x) => x.admissionId && (x.latestNews ?? 0) >= 5)) {
      out.push({ key: `w-${b.bedId}`, label: `Bed ${b.bedNo}`, keep: true, admissionId: b.admissionId!, bedId: b.bedId, flag: 'watch', fromAiDraft: true, note: `Bed ${b.bedNo}: early-warning score ${b.latestNews}. Keep close observation and confirm the doctor has reviewed.` })
    }
    for (const d of overdue) {
      const b = data.beds.find((x) => x.admissionId === d.admissionId)
      out.push({ key: `d-${d.medOrderId}-${d.dueAt}`, label: `Bed ${d.bedNo}`, keep: true, admissionId: d.admissionId, bedId: b?.bedId, flag: 'pending', fromAiDraft: true, note: `Bed ${d.bedNo}: ${d.medicine} was due ${fmtTime(d.dueAt)} and is not recorded.` })
    }
    for (const o of openOrders.filter((x) => x.status === 'open')) {
      out.push({ key: `o-${o.id}`, label: `Bed ${o.bedNo ?? '-'}`, keep: true, orderId: o.id, flag: 'pending', fromAiDraft: true, note: `Bed ${o.bedNo ?? '-'}: order ${o.orderRef} (${o.details}) is waiting to be accepted.` })
    }
    const text = `${data.kpis.bedsOccupied} of ${data.kpis.bedsTotal} beds occupied. ${data.kpis.earlyWarning} patient(s) with NEWS 5 or more, ${data.kpis.overdueDoses} overdue dose(s), ${data.kpis.pendingOrders} order(s) waiting.`
    setItems(out)
    setAiText(text)
    if (!summary.trim()) setSummary(text)
    setMsg(null)
  }

  function addManual() {
    const b = occupied.find((x) => x.bedId === mBed)
    if (!mNote.trim()) return
    setItems((cur) => [
      ...cur,
      { key: `m-${Date.now()}`, label: b ? `Bed ${b.bedNo}` : 'Ward', keep: true, admissionId: b?.admissionId ?? undefined, bedId: b?.bedId, flag: mFlag, note: mNote.trim(), fromAiDraft: false },
    ])
    setMNote('')
  }

  function send() {
    setMsg(null)
    const kept = items.filter((i) => i.keep && i.note.trim())
    if (!kept.length && !summary.trim()) {
      setMsg({ ok: false, text: 'Add a summary or at least one item.' })
      return
    }
    create.mutate(
      {
        toUserId: to || undefined,
        summary: summary.trim() || undefined,
        useAiDraft: aiText !== null,
        items: kept.map(({ admissionId, bedId: bId, orderId, flag, note, fromAiDraft }) => ({ admissionId, bedId: bId, orderId, flag, note: note.trim(), fromAiDraft })),
      },
      {
        onSuccess: () => {
          setItems([])
          setAiText(null)
          setSummary('')
          setMsg({ ok: true, text: 'Handover written. The next nurse signs it to take over.' })
        },
        onError: (e) => setMsg({ ok: false, text: errMessage(e) }),
      },
    )
  }

  return (
    <div className="nu-pg">
      <header>
        <h1 className="nu-h1">Handover notes</h1>
        <p className="nu-sub">SBAR format · the nurse taking over signs the handover to accept it</p>
      </header>

      <section className="nu-grid nu-g2">
        <div className="nu-box">
          <SbarForm bedOptions={occupied} bedId={bed?.bedId ?? ''} onBed={setSelBed} admissionId={bed?.admissionId ?? null} />

          <div className="nu-pend">
            <div className="nu-bh">
              <strong className="nu-strong">Still open at handover</strong>
              <span className="nu-muted">{overdue.length + openOrders.length + (tasks.data?.length ?? 0)} items</span>
            </div>
            {overdue.map((d) => (
              <div className="nu-pend-r" key={`${d.medOrderId}-${d.dueAt}`}>
                <span className="nu-pd is-bad" aria-hidden="true" />
                <span className="nu-grow">Bed {d.bedNo} · {d.medicine} (due {fmtTime(d.dueAt)})</span>
                <span className="nu-tag-bad">‼ Overdue</span>
              </div>
            ))}
            {openOrders.slice(0, 5).map((o) => (
              <div className="nu-pend-r" key={o.id}>
                <span className="nu-pd" aria-hidden="true" />
                <span className="nu-grow">Bed {o.bedNo ?? '-'} · {o.details}</span>
                <span className="nu-muted">{o.orderRef}</span>
              </div>
            ))}
            {(tasks.data ?? []).slice(0, 5).map((t) => (
              <div className="nu-pend-r" key={t.id}>
                <span className="nu-pd" aria-hidden="true" />
                <span className="nu-grow">Bed {t.bedNo ?? '-'} · {t.title}</span>
                <span className="nu-muted">{fmtTime(t.dueAt)}</span>
              </div>
            ))}
            {overdue.length + openOrders.length + (tasks.data?.length ?? 0) === 0 ? <p className="nu-muted" style={{ margin: 0 }}>Nothing is open. Good to hand over.</p> : null}
          </div>

          <h2 className="nu-bt" style={{ marginTop: 6 }}>Write the handover</h2>
          <div className="nu-actions" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <Select
                label="Hand over to"
                placeholder="Anyone on the next shift"
                options={(colleagues.data ?? []).map((c) => ({ value: c.userId, label: c.name }))}
                value={to}
                onChange={setTo}
                helper={colleagues.isError ? 'Colleague list unavailable' : undefined}
              />
            </div>
            <Button variant="outline" onClick={draftWithAi}>Draft with simulated AI</Button>
          </div>

          {aiText ? (
            <AIInsight title="Handover draft" module="Shift handover" status="caution" simulated footer={<span className="nu-muted">Edit or remove items below before you send.</span>}>
              {aiText}
            </AIInsight>
          ) : null}

          <Textarea label="Summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={4000} helper="Shown at the top of the handover." />

          {items.length > 0 ? (
            <div className="nu-list" role="group" aria-label="Handover items">
              {items.map((it) => (
                <div key={it.key} className="nu-med">
                  <Checkbox label="" checked={it.keep} onChange={(v) => setItems((cur) => cur.map((x) => (x.key === it.key ? { ...x, keep: v } : x)))} />
                  <div className="nu-grow">
                    <div className="nu-actions" style={{ gap: 6 }}>
                      <Badge tone={FLAG_TONE[it.flag] ?? 'neutral'} icon={<span>{FLAG_ICON[it.flag]}</span>}>{flagLabel(it.flag)}</Badge>
                      {it.fromAiDraft ? <Badge tone="ai">Simulated AI draft</Badge> : null}
                      <span className="nu-muted">{it.label}</span>
                    </div>
                    <TextField
                      label={`Note for ${it.label}`}
                      value={it.note}
                      onChange={(e) => setItems((cur) => cur.map((x) => (x.key === it.key ? { ...x, note: e.target.value } : x)))}
                      maxLength={1000}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="nu-pend">
            <strong className="nu-strong">Add an item yourself</strong>
            <div className="nu-grid nu-g3" style={{ gap: 10 }}>
              <Select label="Bed" placeholder="Whole ward" options={occupied.map((b) => ({ value: b.bedId, label: `Bed ${b.bedNo} · ${b.patientName}` }))} value={mBed} onChange={setMBed} />
              <Select label="Type" options={FLAGS} value={mFlag} onChange={(v) => setMFlag(v as HandoverFlag)} />
              <TextField label="Note" value={mNote} onChange={(e) => setMNote(e.target.value)} maxLength={1000} />
            </div>
            <div><Button size="sm" variant="soft" disabled={!mNote.trim()} onClick={addManual}>Add to handover</Button></div>
          </div>

          <div className="nu-actions">
            <Button loading={create.isPending} onClick={send}>Write handover</Button>
            {msg ? <Badge tone={msg.ok ? 'success' : 'danger'} icon={<span>{msg.ok ? '✓' : '‼'}</span>}>{msg.text}</Badge> : null}
          </div>
        </div>

        <div className="nu-list" style={{ gap: 18 }}>
          <NotesBox admissionId={bed?.admissionId ?? null} bedNo={bed?.bedNo ?? ''} />

          <div className="nu-box">
            <BoxHead title="Recent handovers" right={<Badge tone="neutral">{handovers.data?.length ?? 0}</Badge>} />
            {handovers.isLoading ? (
              <Loading rows={3} label="Loading handovers" />
            ) : handovers.isError ? (
              <ErrorBlock error={handovers.error} onRetry={() => void handovers.refetch()} />
            ) : (handovers.data ?? []).length === 0 ? (
              <Empty title="No handovers yet">Handovers written in the last two days show here.</Empty>
            ) : (
              <div className="nu-list">
                {handovers.data!.map((h) => {
                  const canSign = !h.signedAt && h.from.userId !== myId && (!h.to || h.to.userId === myId)
                  return (
                    <div className="nu-note" key={h.id}>
                      <div className="nu-bh">
                        <strong style={{ color: 'var(--ink)' }}>{h.unitName} · {h.shiftDate}</strong>
                        <Badge tone={h.signedAt ? 'success' : 'warning'} icon={<span>{h.signedAt ? '✓' : '…'}</span>}>{h.signedAt ? `Signed by ${h.signedBy?.name ?? ''}` : 'Waiting for sign-off'}</Badge>
                      </div>
                      <div className="nu-muted">From {h.from.name}{h.to ? ` to ${h.to.name}` : ''} · {fmtDateTime(h.createdAt)}</div>
                      {h.summary ? <p>{h.summary}</p> : null}
                      {h.aiDraftText ? <div style={{ marginTop: 6 }}><Badge tone="ai">Simulated AI draft used</Badge></div> : null}
                      {h.items.map((i) => (
                        <div className="nu-pend-r" key={i.id}>
                          <span className={`nu-pd${i.flag === 'watch' ? ' is-bad' : ''}`} aria-hidden="true" />
                          <span className="nu-grow">{i.bedNo ? `Bed ${i.bedNo} · ` : ''}{i.note}</span>
                          {i.doneAt ? (
                            <Badge tone="success" icon={<span>✓</span>}>Done</Badge>
                          ) : h.signedAt || h.from.userId !== myId ? (
                            <button type="button" className="nu-lk" disabled={itemDone.isPending} onClick={() => itemDone.mutate({ id: h.id, itemId: i.id })}>Mark done</button>
                          ) : null}
                        </div>
                      ))}
                      {canSign ? (
                        <div style={{ marginTop: 8 }}>
                          <Button size="sm" onClick={() => { setSignError(null); setSigning(h) }}>Sign and take over</Button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="nu-box">
            <dl className="nu-kvx">
              <div><dt>Beds occupied</dt><dd>{data.kpis.bedsOccupied} of {data.kpis.bedsTotal}</dd></div>
              <div><dt>NEWS 5 or more</dt><dd className={data.kpis.earlyWarning ? 'is-bad' : 'is-good'}>{data.kpis.earlyWarning}</dd></div>
              <div><dt>Doses due next hour</dt><dd>{data.kpis.dosesDueNextHour}</dd></div>
              <div><dt>Overdue doses</dt><dd className={data.kpis.overdueDoses ? 'is-bad' : 'is-good'}>{data.kpis.overdueDoses}</dd></div>
            </dl>
            <div className="nu-pend">
              <div className="nu-bh"><strong className="nu-strong">Watch list for the next shift</strong><span className="nu-muted">{watch.length} patients</span></div>
              {watch.length === 0 ? <p className="nu-muted" style={{ margin: 0 }}>Nobody needs close watching.</p> : null}
              {watch.map((b) => (
                <div className="nu-pend-r" key={b.bedId}>
                  <span className={`nu-pd${(b.latestNews ?? 0) >= 5 ? ' is-bad' : ''}`} aria-hidden="true" />
                  <span className="nu-grow">Bed {b.bedNo} · {b.patientName} · NEWS {b.latestNews}</span>
                  <button type="button" className="nu-lk" onClick={() => go('admit', { bed: b.bedId })}>Open</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ConfirmModal
        open={!!signing}
        title="Sign and take over this handover?"
        confirmLabel="Sign handover"
        busy={sign.isPending}
        error={signError}
        onClose={() => setSigning(null)}
        onConfirm={() => signing && sign.mutate(signing.id, { onSuccess: () => setSigning(null), onError: (e) => setSignError(errMessage(e)) })}
      >
        <p style={{ margin: 0 }}>You confirm you have read the notes from {signing?.from.name}. A signed handover is a record and cannot be changed.</p>
      </ConfirmModal>
      {aiText === null && items.length === 0 ? null : null}
    </div>
  )
}

function SbarForm({ bedOptions, bedId, onBed, admissionId }: { bedOptions: { bedId: string; bedNo: string; patientName: string | null }[]; bedId: string; onBed: (id: string) => void; admissionId: string | null }) {
  const add = useAddNote()
  const [f, setF] = useState({ situation: '', background: '', assessment: '', recommendation: '' })
  const [touched, setTouched] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const missing = (k: keyof typeof f) => touched && f[k].trim().length === 0
  const bed = bedOptions.find((b) => b.bedId === bedId)
  function save() {
    setTouched(true)
    setMsg(null)
    if (!admissionId || Object.values(f).some((v) => v.trim().length === 0)) return
    add.mutate(
      { admissionId, kind: 'sbar', sbar: { situation: f.situation.trim(), background: f.background.trim(), assessment: f.assessment.trim(), recommendation: f.recommendation.trim() } },
      {
        onSuccess: () => {
          setF({ situation: '', background: '', assessment: '', recommendation: '' })
          setTouched(false)
          setMsg({ ok: true, text: 'SBAR note saved to the chart.' })
        },
        onError: (e) => setMsg({ ok: false, text: errMessage(e) }),
      },
    )
  }
  return (
    <>
      <h2 className="nu-bt">Write an SBAR note</h2>
      <Select label="Patient" options={bedOptions.map((b) => ({ value: b.bedId, label: `Bed ${b.bedNo} · ${b.patientName ?? ''}` }))} value={bedId} onChange={onBed} />
      {(['situation', 'background', 'assessment', 'recommendation'] as const).map((k) => (
        <Textarea
          key={k}
          label={k.charAt(0).toUpperCase() + k.slice(1)}
          rows={2}
          value={f[k]}
          onChange={(e) => setF((cur) => ({ ...cur, [k]: e.target.value }))}
          error={missing(k) ? 'This section is needed.' : undefined}
          maxLength={1000}
        />
      ))}
      <div className="nu-actions">
        <Button loading={add.isPending} disabled={!admissionId} onClick={save}>Save SBAR note{bed ? ` · Bed ${bed.bedNo}` : ''}</Button>
        {msg ? <Badge tone={msg.ok ? 'success' : 'danger'} icon={<span>{msg.ok ? '✓' : '‼'}</span>}>{msg.text}</Badge> : null}
      </div>
    </>
  )
}

function NotesBox({ admissionId, bedNo }: { admissionId: string | null; bedNo: string }) {
  const notes = useNotes(admissionId)
  const add = useAddNote()
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="nu-box">
      <BoxHead title={bedNo ? `Notes · Bed ${bedNo}` : 'Notes'} right={<Badge tone="neutral">{notes.data?.length ?? 0} notes</Badge>} />
      <Textarea label="Quick shift note" placeholder="e.g. Back from X-ray, comfortable." rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} helper="Saved with your name and the time." maxLength={4000} />
      <div className="nu-actions">
        <Button
          size="sm"
          variant="soft"
          disabled={!draft.trim() || !admissionId}
          loading={add.isPending}
          onClick={() => {
            setErr(null)
            if (!admissionId) return
            add.mutate({ admissionId, kind: 'note', body: draft.trim() }, { onSuccess: () => setDraft(''), onError: (e) => setErr(errMessage(e)) })
          }}
        >
          Add timestamped note
        </Button>
        {err ? <span className="nu-tag-bad" role="alert">{err}</span> : null}
      </div>
      {notes.isLoading ? (
        <Loading rows={2} label="Loading notes" />
      ) : notes.isError ? (
        <ErrorBlock error={notes.error} onRetry={() => void notes.refetch()} />
      ) : (notes.data ?? []).length === 0 ? (
        <Empty title="No notes yet">Notes for this patient appear here.</Empty>
      ) : (
        <div className="nu-list">
          {notes.data!.slice(0, 6).map((n) => (
            <div className={`nu-note${n.kind === 'sbar' ? ' is-flag' : ''}`} key={n.id}>
              <strong style={{ color: 'var(--ink)' }}>{n.kind === 'sbar' ? 'SBAR note' : 'Shift note'}</strong>
              {n.kind === 'sbar' && n.sbar ? (
                <div className="nu-seg" style={{ marginTop: 4, fontSize: 14 }}>
                  <span><span className="nu-sbar-k">S</span>{n.sbar.situation}</span>
                  <span><span className="nu-sbar-k">B</span>{n.sbar.background}</span>
                  <span><span className="nu-sbar-k">A</span>{n.sbar.assessment}</span>
                  <span><span className="nu-sbar-k">R</span>{n.sbar.recommendation}</span>
                </div>
              ) : (
                <p>{n.body}</p>
              )}
              <div className="nu-muted">{n.author} · {fmtDateTime(n.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

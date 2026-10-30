import { useEffect, useMemo, useState } from 'react'
import { Alert, Avatar, Badge, Button, Table, Textarea } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { errMessage, useAddNote, useBedDetail, useNurseBoard } from '../../../api/nurse'
import type { BedDetail } from '../../../api/nurse'
import { ACUITY_ICON, ACUITY_LABEL, BoxHead, Empty, ErrorBlock, Loading, NewsChip, fmtDateTime, fmtTime, orderStatusLabel, orderTypeLabel } from './common'
import { ConfirmModal } from './dialogs'
import { SESSION_SECONDS, appendLog, closeSession, openSession, readLog, sessionStart } from './session'
import type { AccessLogEntry } from './session'
import type { Go } from './types'

function pad(n: number) {
  return (n < 10 ? '0' : '') + n
}

function useCountdown(bedId: string | null) {
  const [startedAt, setStartedAt] = useState<number | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!bedId) {
      setStartedAt(undefined)
      return
    }
    const s = sessionStart(bedId)
    setStartedAt(s === null ? undefined : s)
  }, [bedId])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = startedAt ? Math.max(0, SESSION_SECONDS - Math.floor((now - startedAt) / 1000)) : 0
  return { startedAt, left, setStartedAt }
}

export default function Admit({ bedId, go }: { bedId: string | null; go: Go }) {
  const board = useNurseBoard()
  const detail = useBedDetail(bedId)
  const addNote = useAddNote()
  const { startedAt, left, setStartedAt } = useCountdown(bedId)
  const [confirmClose, setConfirmClose] = useState(false)
  const [note, setNote] = useState('')
  const [noteMsg, setNoteMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [log, setLog] = useState<AccessLogEntry[]>(() => readLog())

  const d = detail.data
  // Opening a bed with no session starts one (and writes the first access-log line).
  useEffect(() => {
    if (!bedId || !d || !d.admission || startedAt !== undefined) return
    const at = openSession(bedId)
    setStartedAt(at)
    appendLog({ at: new Date(at).toISOString(), bedNo: d.bed.bedNo, patient: d.patient?.fullName ?? '', what: 'Opened chart' })
    setLog(readLog())
  }, [bedId, d, startedAt, setStartedAt])

  const logRows = useMemo(
    () => log.map((l) => ({ t: fmtTime(l.at), p: `${l.patient} · Bed ${l.bedNo}`, w: l.what, r: 'Admission mode' })),
    [log],
  )
  const logCols: TableColumn<(typeof logRows)[number]>[] = [
    { key: 't', header: 'Time', mono: true },
    { key: 'p', header: 'Patient' },
    { key: 'w', header: 'What' },
    { key: 'r', header: 'Reason' },
  ]

  if (!bedId) {
    const beds = (board.data?.beds ?? []).filter((b) => b.admissionId)
    return (
      <div className="nu-pg">
        <header>
          <h1 className="nu-h1">Admission mode</h1>
          <p className="nu-sub">Nurses can open a patient only when they are admitted to your ward. Access ends on its own.</p>
        </header>
        <Lock />
        <div className="nu-box">
          <BoxHead title="Choose a patient to open" />
          {board.isLoading ? (
            <Loading rows={4} label="Loading beds" />
          ) : board.isError ? (
            <ErrorBlock error={board.error} onRetry={() => void board.refetch()} />
          ) : beds.length === 0 ? (
            <Empty title="No admitted patients">There are no patients on this ward right now.</Empty>
          ) : (
            <div className="nu-beds">
              {beds.map((b) => (
                <button
                  key={b.bedId}
                  type="button"
                  className={`nu-bed ${b.acuity === 'critical' ? 'is-crit' : b.acuity === 'watch' ? 'is-watch' : 'is-occ'}${b.mine ? ' is-mine' : ''}`}
                  aria-label={`Open chart: Bed ${b.bedNo}, ${b.patientName}, ${ACUITY_LABEL[b.acuity]}`}
                  onClick={() => go('admit', { bed: b.bedId })}
                >
                  <b>Bed {b.bedNo}</b>
                  <span>{b.patientName}</span>
                  <span className="nu-bed-tag">
                    <span aria-hidden="true">{ACUITY_ICON[b.acuity]}</span>
                    {ACUITY_LABEL[b.acuity]}
                    {b.mine ? ' · mine' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <AccessLog rows={logRows} cols={logCols} />
      </div>
    )
  }

  if (detail.isLoading) {
    return (
      <div className="nu-pg">
        <Loading rows={6} label="Opening chart" />
      </div>
    )
  }
  if (detail.isError) {
    return (
      <div className="nu-pg">
        <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} title="Could not open this chart" />
        <div><Button variant="secondary" onClick={() => go('home')}>Back to ward home</Button></div>
      </div>
    )
  }
  const data = d as BedDetail
  if (!data.admission || !data.patient) {
    return (
      <div className="nu-pg">
        <header>
          <h1 className="nu-h1">Bed {data.bed.bedNo}</h1>
          <p className="nu-sub">{data.bed.ward}</p>
        </header>
        <Empty title="This bed is free" action={<Button variant="secondary" onClick={() => go('home')}>Back to bed board</Button>}>
          Nobody is admitted to this bed, so there is no chart to open.
        </Empty>
      </div>
    )
  }

  const open = !!startedAt && left > 0
  const hh = Math.floor(left / 3600)
  const mm = Math.floor((left % 3600) / 60)
  const ss = left % 60
  const p = data.patient
  const adm = data.admission
  const latest = data.vitals?.[0]
  const hasAllergy = p.allergies.length > 0

  function closeNow() {
    if (bedId) closeSession(bedId)
    setStartedAt(0)
    appendLog({ at: new Date().toISOString(), bedNo: data.bed.bedNo, patient: p.fullName, what: 'Closed chart' })
    setLog(readLog())
    setConfirmClose(false)
  }
  function reopen() {
    if (!bedId) return
    const at = openSession(bedId)
    setStartedAt(at)
    appendLog({ at: new Date(at).toISOString(), bedNo: data.bed.bedNo, patient: p.fullName, what: 'Re-opened chart' })
    setLog(readLog())
  }
  function saveNote() {
    setNoteMsg(null)
    addNote.mutate(
      { admissionId: adm!.id, kind: 'note', body: note.trim() },
      {
        onSuccess: () => {
          setNote('')
          setNoteMsg({ ok: true, text: 'Note saved with your name and the time.' })
          appendLog({ at: new Date().toISOString(), bedNo: data.bed.bedNo, patient: p.fullName, what: 'Nursing note' })
          setLog(readLog())
        },
        onError: (e) => setNoteMsg({ ok: false, text: errMessage(e) }),
      },
    )
  }

  return (
    <div className="nu-pg">
      <header>
        <h1 className="nu-h1">Admission mode</h1>
        <p className="nu-sub">Nurses can open a patient only when they are admitted to your ward. Access ends on its own.</p>
      </header>
      <Lock />

      <section className="nu-grid nu-g21">
        <div className="nu-box">
          <BoxHead
            title={`Open chart · Bed ${data.bed.bedNo}`}
            right={open ? <Badge tone="success" dot>Session open</Badge> : <Badge tone="neutral">Session closed</Badge>}
          />
          <div className="nu-actions" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
            <Avatar name={p.fullName} size={52} tone="peach" />
            <div className="nu-grow">
              <strong style={{ color: 'var(--ink)', fontSize: 18 }}>
                {p.fullName}{p.age != null ? `, ${p.age}` : ''}{p.sex ? ` · ${p.sex.charAt(0).toUpperCase()}` : ''}
              </strong>
              <div className="nu-muted">
                {adm.ipNumber ?? 'IP number pending'} · admitted {fmtDateTime(adm.admittedAt)}
                {adm.diagnosis ? ` · ${adm.diagnosis}` : ''}
              </div>
            </div>
            <NewsChip score={latest?.newsScore} band={latest?.newsBand} />
          </div>

          {hasAllergy ? (
            <Alert tone="danger" title="Allergies on record">
              {p.allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}${a.severity ? ` · ${a.severity}` : ''}`).join('; ')}
            </Alert>
          ) : (
            <p className="nu-muted" style={{ margin: 0 }}>No allergies recorded.</p>
          )}

          {open ? (
            <>
              <div className="nu-actions" style={{ alignItems: 'baseline' }}>
                <span className="nu-timer" role="timer" aria-label={`Chart access time left ${hh} hours ${mm} minutes`}>{hh}:{pad(mm)}:{pad(ss)}</span>
                <span className="nu-muted">left of 2:00:00 · ends at shift change</span>
              </div>
              <div className="nu-bar" aria-hidden="true"><span style={{ transform: `scaleX(${left / SESSION_SECONDS})` }} /></div>
            </>
          ) : (
            <Alert tone="info" title="This chart is closed">
              Open it again to keep working. Each opening is written to the access log.
            </Alert>
          )}

          <div className="nu-grid nu-g3" style={{ gap: 10 }}>
            <div className="nu-note"><div className="nu-muted">Blood group</div><strong style={{ color: 'var(--ink)' }}>{p.bloodGroup && p.bloodGroup !== 'unknown' ? p.bloodGroup : 'Not recorded'}</strong></div>
            <div className="nu-note"><div className="nu-muted">Diet</div><strong style={{ color: 'var(--ink)' }}>{adm.diet ?? 'Not recorded'}</strong></div>
            <div className="nu-note"><div className="nu-muted">Mobility</div><strong style={{ color: 'var(--ink)' }}>{adm.mobility ?? 'Not recorded'}</strong></div>
          </div>
          <div className="nu-actions">
            {open ? (
              <>
                <Button size="sm" onClick={() => go('vitals', { bed: bedId })}>Record vitals</Button>
                <Button size="sm" variant="secondary" onClick={() => go('mar', { bed: bedId })}>Give medicines</Button>
                <Button size="sm" variant="secondary" onClick={() => go('handover', { bed: bedId })}>Write SBAR note</Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmClose(true)}>Close chart now</Button>
              </>
            ) : (
              <Button size="sm" onClick={reopen}>Open chart again</Button>
            )}
          </div>
        </div>

        <div className="nu-box">
          <h2 className="nu-bt">What you can see</h2>
          <div className="nu-row"><span style={{ color: 'var(--success)', fontWeight: 700 }} aria-hidden="true">✓</span><span>Vitals, medication chart, nursing notes (can see)</span></div>
          <div className="nu-row"><span style={{ color: 'var(--success)', fontWeight: 700 }} aria-hidden="true">✓</span><span>Orders from the treating doctor (can see)</span></div>
          <div className="nu-row"><span style={{ color: 'var(--success)', fontWeight: 700 }} aria-hidden="true">✓</span><span>Allergies, blood group, diet (can see)</span></div>
          <div className="nu-row"><span style={{ color: 'var(--danger)', fontWeight: 700 }} aria-hidden="true">✕</span><span>Past records from other hospitals (hidden)</span></div>
          <div className="nu-row"><span style={{ color: 'var(--danger)', fontWeight: 700 }} aria-hidden="true">✕</span><span>Genomic results, mental-health notes (hidden)</span></div>
          <div className="nu-row"><span style={{ color: 'var(--danger)', fontWeight: 700 }} aria-hidden="true">✕</span><span>AI Health Chat and imaging analysis (hidden)</span></div>
          {data.team && data.team.length > 0 ? (
            <div className="nu-pend">
              <strong className="nu-strong">Care team</strong>
              {data.team.map((t, i) => (
                <div className="nu-pend-r" key={i}><span className="nu-grow">{t.name}</span><span className="nu-muted">{t.role}</span></div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {open ? (
        <>
          <section className="nu-grid nu-g2">
            <div className="nu-box">
              <BoxHead title="Latest observations" right={<button type="button" className="nu-lk" onClick={() => go('vitals', { bed: bedId })}>Record vitals</button>} />
              {data.vitals && data.vitals.length > 0 ? (
                <div className="nu-hist" role="table" aria-label="Recent observations">
                  <div className="nu-hist-r nu-hist-h" role="row"><span role="columnheader">Time</span><span role="columnheader">BP</span><span role="columnheader">Pulse</span><span role="columnheader">SpO2</span><span role="columnheader">Temp</span><span role="columnheader">NEWS</span></div>
                  {data.vitals.slice(0, 5).map((v) => (
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
              ) : (
                <Empty title="No observations yet">Record the first set of vitals for this patient.</Empty>
              )}
            </div>
            <div className="nu-box">
              <BoxHead title="Medicines ordered" right={<button type="button" className="nu-lk" onClick={() => go('mar', { bed: bedId })}>Medication round</button>} />
              {data.medOrders && data.medOrders.length > 0 ? (
                data.medOrders.map((m) => (
                  <div className="nu-row" key={m.id}>
                    <div className="nu-grow">
                      <strong className="nu-strong">{m.medicine}</strong>
                      <div className="nu-muted">{m.dose} · {m.route} · {m.frequency}{m.isPrn ? ' · as needed' : ''}{m.instructions ? ` · ${m.instructions}` : ''}</div>
                    </div>
                  </div>
                ))
              ) : (
                <Empty title="No active medicines">The doctor has not ordered any medicines.</Empty>
              )}
            </div>
          </section>

          <section className="nu-grid nu-g3">
            <div className="nu-box">
              <BoxHead title="Tasks" />
              {data.tasks && data.tasks.length > 0 ? (
                data.tasks.map((t) => (
                  <div className="nu-row" key={t.id}>
                    <span className={`nu-mark${t.doneAt ? '' : ' is-open'}`} aria-hidden="true">✓</span>
                    <div className="nu-grow">
                      <strong className="nu-strong">{t.title}</strong>
                      <div className="nu-muted">{t.doneAt ? `Done ${fmtTime(t.doneAt)}` : `Due ${fmtTime(t.dueAt)}`}{t.mine ? ' · yours' : ''}</div>
                    </div>
                    <Badge tone={t.doneAt ? 'success' : 'neutral'}>{t.doneAt ? 'Done' : 'Open'}</Badge>
                  </div>
                ))
              ) : (
                <Empty title="No tasks">No nursing tasks for this patient.</Empty>
              )}
            </div>
            <div className="nu-box">
              <BoxHead title="Orders" />
              {data.orders && data.orders.length > 0 ? (
                data.orders.map((o) => (
                  <div className="nu-row" key={o.id}>
                    <div className="nu-grow">
                      <strong className="nu-strong">{o.details}</strong>
                      <div className="nu-muted">{o.orderRef} · {orderTypeLabel(o.type)} · {o.priority.toUpperCase()}</div>
                    </div>
                    <Badge tone={o.status === 'open' ? 'warning' : 'info'}>{orderStatusLabel(o.status)}</Badge>
                  </div>
                ))
              ) : (
                <Empty title="No open orders">Nothing is waiting for this patient.</Empty>
              )}
            </div>
            <div className="nu-box">
              <BoxHead title="Escalations" />
              {data.escalations && data.escalations.length > 0 ? (
                data.escalations.slice(0, 5).map((e) => (
                  <div className="nu-row" key={e.id}>
                    <div className="nu-grow">
                      <strong className="nu-strong">NEWS {e.newsScore} · level {e.level}</strong>
                      <div className="nu-muted">Paged {e.pagedRole.replace(/_/g, ' ')} {fmtTime(e.pagedAt)}{e.outcome ? ` · ${e.outcome}` : ''}</div>
                    </div>
                    <Badge tone={e.acknowledgedAt ? 'success' : 'danger'} icon={<span>{e.acknowledgedAt ? '✓' : '‼'}</span>}>{e.acknowledgedAt ? 'Acknowledged' : 'Waiting'}</Badge>
                  </div>
                ))
              ) : (
                <Empty title="No escalations">No early-warning escalations for this patient.</Empty>
              )}
            </div>
          </section>

          <section className="nu-grid nu-g2">
            <div className="nu-box">
              <BoxHead title="Nursing notes" right={<Badge tone="neutral">{data.notes?.length ?? 0} notes</Badge>} />
              <Textarea
                label="Quick shift note"
                placeholder="e.g. Comfortable, tolerating diet."
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                helper="Saved with your name and the time."
                maxLength={4000}
              />
              <div className="nu-actions">
                <Button size="sm" variant="soft" disabled={!note.trim()} loading={addNote.isPending} onClick={saveNote}>Add timestamped note</Button>
                {noteMsg ? <Badge tone={noteMsg.ok ? 'success' : 'danger'} icon={<span>{noteMsg.ok ? '✓' : '‼'}</span>}>{noteMsg.text}</Badge> : null}
              </div>
              <div className="nu-list">
                {(data.notes ?? []).slice(0, 6).map((n) => (
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
            </div>
            <AccessLog rows={logRows} cols={logCols} />
          </section>
        </>
      ) : (
        <AccessLog rows={logRows} cols={logCols} />
      )}

      <ConfirmModal
        open={confirmClose}
        title="Close this chart now?"
        confirmLabel="Close chart"
        tone="danger"
        onConfirm={closeNow}
        onClose={() => setConfirmClose(false)}
      >
        <p style={{ margin: 0 }}>Access to Bed {data.bed.bedNo} ({p.fullName}) ends now. You can open it again, and each opening is logged.</p>
      </ConfirmModal>
    </div>
  )
}

function Lock() {
  return (
    <div className="nu-lock">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="10" width="16" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      <div>
        <strong style={{ color: 'var(--ink)' }}>No free browsing.</strong>{' '}
        <span>You cannot search the national record. You see admitted patients on your ward, orders sent to you, and nothing else. Every chart view is written to the audit log and the patient can see it.</span>
      </div>
    </div>
  )
}

function AccessLog<R extends object>({ rows, cols }: { rows: R[]; cols: TableColumn<R>[] }) {
  return (
    <div className="nu-box">
      <BoxHead title="Your access log · this session" right={<Badge tone="outline">Visible to each patient</Badge>} />
      <Table columns={cols} rows={rows} density="compact" caption="Chart access log for this session" empty="No charts opened yet in this session." />
    </div>
  )
}

import { useState } from 'react'
import { Alert, Badge, Button, PageHeader, StatCard, TextField } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useConfirmRecall, useExpiry, useRecalls, useUndoRecall } from '../../../api/pharmacyAdmin'
import { Async, Box, ConfirmModal, EmptyBox, PageSkeleton, fmtDate, fmtDateTime, inr, num, useFlash } from '../opsKit'

type Recall = NonNullable<ReturnType<typeof useRecalls>['data']>['items'][number]

const BUCKET = {
  expired: { label: 'Expired', tone: 'danger' },
  within_30_days: { label: 'Within 30 days', tone: 'warning' },
  within_90_days: { label: 'Within 90 days', tone: 'info' },
} as const

export default function PharmacyExpiry() {
  const expiry = useExpiry()
  const recalls = useRecalls()
  const confirm = useConfirmRecall()
  const undo = useUndoRecall()
  const { node, show } = useFlash()
  const [target, setTarget] = useState<Recall | null>(null)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  async function onConfirm() {
    if (!target) return
    setProblem(null)
    try {
      await confirm.mutateAsync({ id: target.id, note: note.trim() || undefined })
      show('success', `${target.ref} confirmed. Matching batches are blocked and hidden from the finder.`)
      setTarget(null)
      setNote('')
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }

  async function onUndo(r: Recall) {
    try {
      await undo.mutateAsync({ id: r.id })
      show('success', `${r.ref} reopened. Blocked batches stay blocked until you release them in Inventory.`)
    } catch (e) {
      show('danger', errorMessage(e))
    }
  }

  return (
    <div className="ak-page">
      <PageHeader eyebrow="Stock" title="Expiry and recalls" subtitle="Batches close to their date, and recall notices that need your confirmation." />
      {node}

      <Box title="Recalls" actions={recalls.data ? <Badge tone={recalls.data.actionNeeded ? 'danger' : 'success'} dot>{recalls.data.actionNeeded} to action</Badge> : undefined}>
        <Async query={recalls} skeleton={<PageSkeleton stats={false} boxes={1} />}>
          {(d) =>
            d.items.length === 0 ? (
              <EmptyBox title="No recalls">Notices from the regulator and manufacturers show up here.</EmptyBox>
            ) : (
              <div className="ak-stack">
                {d.items.map((r) => {
                  const done = r.status === 'confirmed_off_shelf' || r.status === 'not_stocked'
                  return (
                    <div key={r.id} className="ak-card">
                      <div className="ak-bh">
                        <div>
                          <strong className="ak-strong">{r.title}</strong>
                          <div className="ak-muted">{r.ref} · {r.source} · class {r.recallClass} · {fmtDate(r.issuedOn)}{r.batchNo ? ` · batch ${r.batchNo}` : ''}</div>
                        </div>
                        <Badge tone={done ? 'success' : r.urgent ? 'danger' : 'warning'} dot>
                          {r.status === 'confirmed_off_shelf' ? 'Off the shelf' : r.status === 'not_stocked' ? 'Not stocked' : r.urgent ? 'Action needed' : 'To review'}
                        </Badge>
                      </div>
                      {r.reason ? <p style={{ margin: 0 }}>{r.reason}</p> : null}
                      {r.actionText ? <p className="ak-muted">{r.actionText}</p> : null}
                      <p className="ak-muted">{r.qtyOnShelf} units of {r.medicine} on your shelves.</p>
                      {done ? (
                        <div className="ak-wrap">
                          <span className="ak-muted">Confirmed {fmtDateTime(r.confirmedAt)}{r.confirmedBy ? ` by ${r.confirmedBy}` : ''}.</span>
                          <Button size="sm" variant="ghost" onClick={() => void onUndo(r)} loading={undo.isPending && undo.variables?.id === r.id}>Undo</Button>
                        </div>
                      ) : (
                        <div><Button onClick={() => { setTarget(r); setNote(''); setProblem(null) }}>Confirm and block</Button></div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          }
        </Async>
      </Box>

      <Async query={expiry} skeleton={<PageSkeleton boxes={1} />}>
        {(d) => (
          <>
            <section className="ak-grid ak-g4" aria-label="Expiry summary">
              <StatCard label="Expired" value={d.summary.expired} tone="peach" />
              <StatCard label="Within 30 days" value={d.summary.within30Days} hint={inr(d.summary.valueWithin30Days)} />
              <StatCard label="Within 90 days" value={d.summary.within90Days} tone="blue" />
              <StatCard label="Returnable" value={d.returnable.batches} hint={inr(d.returnable.value)} tone="sage" />
            </section>
            <Alert tone="info" title="Return rule">{d.returnable.rule}</Alert>
            <Box title="Batches">
              <div style={{ overflowX: 'auto' }}>
                <table className="ak-table">
                  <thead>
                    <tr><th scope="col">Medicine</th><th scope="col">Batch</th><th scope="col">Units</th><th scope="col">Expiry</th><th scope="col">Days left</th><th scope="col">Value</th><th scope="col">When</th></tr>
                  </thead>
                  <tbody>
                    {d.batches.map((b) => (
                      <tr key={`${b.medicine}-${b.batchNo}`}>
                        <td>{b.medicine}</td>
                        <td className="ak-mono">{b.batchNo}</td>
                        <td>{num(b.quantity)}</td>
                        <td>{fmtDate(b.expiry)}</td>
                        <td>{b.daysLeft < 0 ? `${-b.daysLeft} ago` : b.daysLeft}</td>
                        <td>{inr(b.value)}</td>
                        <td><Badge tone={BUCKET[b.bucket].tone}>{BUCKET[b.bucket].label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Box>
          </>
        )}
      </Async>

      <ConfirmModal
        open={!!target}
        title={target ? `Confirm ${target.ref}?` : ''}
        confirmLabel="Block batches"
        danger
        busy={confirm.isPending}
        error={problem}
        onConfirm={() => void onConfirm()}
        onClose={() => setTarget(null)}
      >
        <p>Batches of {target?.medicine} that match this recall will be blocked at the counter and hidden from the medicine finder. You can undo the confirmation, but blocked batches must be released one by one.</p>
        <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmModal>
    </div>
  )
}

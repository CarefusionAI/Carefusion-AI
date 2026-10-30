import { useEffect, useMemo, useState } from 'react'
import { Alert, Avatar, Badge, Button, Modal, PageHeader, Select, Textarea } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import {
  useApproveApplicant,
  useCheckApplicantDocument,
  useHospitalApprovals,
  useRejectApplicant,
} from '../../../api/hospitalAdmin'
import type { HospitalApplicant, HospitalApprovalFilter, HospitalApprovalsResponse, HospitalRejectReasonCode } from '../../../api/hospitalAdmin'
import { Async, Box, ConfirmModal, EmptyBox, ICONS, Icon, KV, PageSkeleton, Row, RowText, Chips, fmtDate, humanise, useFlash } from '../opsKit'

function statusView(status: string): { tone: 'warning' | 'success' | 'danger' | 'neutral'; label: string } {
  if (status === 'pending') return { tone: 'warning', label: 'Pending' }
  if (status === 'approved') return { tone: 'success', label: 'Approved' }
  if (status === 'rejected') return { tone: 'danger', label: 'Rejected' }
  return { tone: 'neutral', label: humanise(status) }
}

function ekycLabel(v: string | null): string {
  if (!v) return 'Not available'
  return v === 'passed' || v === 'verified' ? 'Verified' : humanise(v)
}

function Detail({
  a,
  rejectReasons,
  onDone,
}: {
  a: HospitalApplicant
  rejectReasons: HospitalApprovalsResponse['rejectReasons']
  onDone: (text: string) => void
}) {
  const check = useCheckApplicantDocument()
  const approve = useApproveApplicant()
  const reject = useRejectApplicant()
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [code, setCode] = useState<HospitalRejectReasonCode>('registration_unverified')
  const [rejectNote, setRejectNote] = useState('')
  const [docError, setDocError] = useState<string | null>(null)

  // New applicant selected: forget the half-written decision of the previous one.
  useEffect(() => {
    setConfirmApprove(false)
    setRejecting(false)
    setViewing(null)
    setNote('')
    setRejectNote('')
    setCode('registration_unverified')
    setDocError(null)
    approve.reset()
    reject.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id])

  const pending = a.status === 'pending'
  const st = statusView(a.status)
  const unchecked = a.documents.filter((d) => !d.checked).length
  const viewDoc = viewing !== null ? a.documents.find((d) => d.index === viewing) : undefined

  async function toggle(index: number, checked: boolean) {
    setDocError(null)
    try {
      await check.mutateAsync({ id: a.id, index, checked })
    } catch (e) {
      setDocError(errorMessage(e))
    }
  }

  async function doApprove() {
    try {
      const res = await approve.mutateAsync({ id: a.id, reason: note.trim() || undefined })
      setConfirmApprove(false)
      onDone(res.message ?? `${a.name} was approved.`)
    } catch {
      /* shown in the modal through approve.error */
    }
  }

  async function doReject() {
    try {
      await reject.mutateAsync({ id: a.id, reasonCode: code, reason: rejectNote.trim() || undefined })
      setRejecting(false)
      onDone(`${a.name}'s application was rejected. They were told the reason.`)
    } catch {
      /* shown in the modal through reject.error */
    }
  }

  const rejectNeedsNote = code === 'other' && !rejectNote.trim()

  return (
    <Box>
      <div className="ak-bh">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <Avatar name={a.name} size={48} />
          <div style={{ minWidth: 0 }}>
            <h2 className="ak-bt is-lg">{a.name}</h2>
            <div className="ak-muted">
              {a.role ?? 'Staff'} {'·'} {a.department ?? 'No department'} {'·'} applied {fmtDate(a.appliedAt)}
            </div>
          </div>
        </div>
        <Badge tone={st.tone} dot>
          {st.label}
        </Badge>
      </div>

      <KV
        cols={3}
        items={[
          { label: 'Registry', value: a.registry ?? 'Not provided' },
          { label: 'Aadhaar e-KYC', value: ekycLabel(a.ekyc) },
          { label: 'Employment', value: a.employment ?? 'Not provided' },
        ]}
      />

      <h3 className="ak-bt is-sm">Documents</h3>
      {a.documents.length === 0 ? (
        <p className="ak-muted">No documents were uploaded with this application.</p>
      ) : (
        <div>
          {a.documents.map((d) => (
            <Row
              key={d.index}
              icon={<Icon d={ICONS.doc} />}
              tone={d.expired ? 'danger' : d.checked ? 'sage' : 'teal'}
              trailing={
                <div className="ak-wrap" style={{ flexWrap: 'nowrap' }}>
                  <button type="button" className="ak-rowbtn" aria-label={`View ${d.title}`} onClick={() => setViewing(d.index)}>
                    View
                  </button>
                  {pending ? (
                    <button
                      type="button"
                      className={`ak-rowbtn${d.checked ? ' is-ok' : ''}`}
                      aria-pressed={d.checked}
                      disabled={check.isPending}
                      onClick={() => void toggle(d.index, !d.checked)}
                    >
                      {d.checked ? 'Checked' : 'Mark checked'}
                    </button>
                  ) : (
                    <Badge tone={d.checked ? 'success' : 'neutral'}>{d.checked ? 'Checked' : 'Not checked'}</Badge>
                  )}
                </div>
              }
            >
              <RowText
                title={
                  <>
                    {d.title} {d.expired ? <Badge tone="danger">Expired</Badge> : null}
                  </>
                }
                sub={d.meta}
              />
            </Row>
          ))}
        </div>
      )}
      {docError ? <Alert tone="danger">{docError}</Alert> : null}

      {pending ? (
        a.canApprove ? (
          <Alert tone="success" title="Ready to approve">
            Every document is checked. Approving activates the account straight away.
          </Alert>
        ) : (
          <Alert tone="warning" title="Not ready to approve">
            {a.blockReason ?? `Mark every document as checked before approving (${unchecked} left).`}
          </Alert>
        )
      ) : (
        <Alert tone={a.status === 'approved' ? 'success' : 'info'} title={`${st.label}${a.decidedAt ? ` on ${fmtDate(a.decidedAt)}` : ''}`}>
          {a.decisionReason ?? 'No reason was recorded.'}
        </Alert>
      )}

      {pending ? (
        <div className="ak-wrap">
          <Button variant="primary" disabled={!a.canApprove} onClick={() => setConfirmApprove(true)}>
            Approve and activate
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            Reject
          </Button>
          <Button variant="ghost" disabled title="Not available in the alpha demo">
            Ask for more documents
          </Button>
        </div>
      ) : null}

      <ConfirmModal
        open={confirmApprove}
        title={`Approve ${a.name}?`}
        confirmLabel="Approve and activate"
        busy={approve.isPending}
        error={approve.isError ? errorMessage(approve.error) : null}
        onConfirm={() => void doApprove()}
        onClose={() => setConfirmApprove(false)}
      >
        <p className="ak-p">
          This activates the account now. {a.name} can sign in to the Staff Portal straight away and is told by SMS and email (simulated). The decision is written to the audit log and cannot be undone from this screen.
        </p>
        <Textarea label="Note for the record" optional rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmModal>

      <ConfirmModal
        open={rejecting}
        title={`Reject ${a.name}?`}
        confirmLabel="Send rejection"
        danger
        busy={reject.isPending}
        disabled={rejectNeedsNote}
        error={reject.isError ? errorMessage(reject.error) : null}
        onConfirm={() => void doReject()}
        onClose={() => setRejecting(false)}
      >
        <p className="ak-p">
          The account stays closed and {a.name} is told the reason. To work here they would have to apply again. This cannot be undone from this screen.
        </p>
        <Select
          label="Reason for rejection"
          value={code}
          options={rejectReasons.map((r) => ({ value: r.code, label: r.label }))}
          onChange={(v) => setCode(v as HospitalRejectReasonCode)}
        />
        <Textarea
          label="Note to applicant"
          rows={3}
          required={code === 'other'}
          optional={code !== 'other'}
          helper={code === 'other' ? 'Required when the reason is Other.' : 'This is sent with the decision.'}
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
        />
      </ConfirmModal>

      <Modal
        open={viewDoc !== undefined}
        title={viewDoc?.title ?? 'Document'}
        size="sm"
        onClose={() => setViewing(null)}
        footer={
          <Button variant="secondary" onClick={() => setViewing(null)}>
            Close
          </Button>
        }
      >
        <div className="ak-stack">
          <p className="ak-p">{viewDoc?.meta}</p>
          <Alert tone="info" title="Synthetic document">
            The alpha stores document details only. No scanned file is attached to this application.
          </Alert>
        </div>
      </Modal>
    </Box>
  )
}

function View({ filter, setFilter }: { filter: HospitalApprovalFilter; setFilter: (f: HospitalApprovalFilter) => void }) {
  const q = useHospitalApprovals(filter)
  const [selected, setSelected] = useState<string | null>(null)
  const { show, node } = useFlash()

  const items = q.data?.items
  const current = useMemo(() => {
    if (!items || items.length === 0) return null
    return items.find((i) => i.id === selected) ?? items[0] ?? null
  }, [items, selected])

  return (
    <div className="ak-page">
      <PageHeader
        title="Staff approvals"
        subtitle="Check each document before approving. Doctors are also checked against the Healthcare Professionals Registry."
        actions={
          <Chips
            label="Filter queue"
            value={filter}
            onChange={(f) => {
              setFilter(f)
              setSelected(null)
            }}
            options={[
              { id: 'pending', label: 'Pending', count: q.data?.counts.pending },
              { id: 'doctors', label: 'Doctors', count: q.data?.counts.doctors },
              { id: 'decided', label: 'Decided', count: q.data?.counts.decided },
              { id: 'all', label: 'All', count: q.data?.counts.total },
            ]}
          />
        }
      />
      {node}
      <Async query={q} skeleton={<PageSkeleton stats={false} boxes={2} />}>
        {(data) =>
          data.items.length === 0 || !current ? (
            <EmptyBox title={filter === 'decided' ? 'No decisions yet' : 'Nobody is waiting'}>
              {filter === 'decided' ? 'Approved and rejected applicants appear here.' : 'New staff applications for this hospital appear here for your review.'}
            </EmptyBox>
          ) : (
            <div className="ak-grid ak-split ak-in">
              <div className="ak-box is-tight" role="group" aria-label="Applicants">
                {data.items.map((a) => {
                  const st = statusView(a.status)
                  return (
                    <button key={a.id} type="button" className="ak-pick" aria-pressed={a.id === current.id} onClick={() => setSelected(a.id)}>
                      <Avatar name={a.name} size={36} />
                      <span className="ak-pick-main">
                        <strong>{a.name}</strong>
                        <span className="ak-muted">
                          {a.role ?? 'Staff'} {'·'} {fmtDate(a.appliedAt, false)}
                        </span>
                      </span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </button>
                  )
                })}
              </div>
              <Detail key={current.id} a={current} rejectReasons={data.rejectReasons} onDone={(t) => show('success', t)} />
            </div>
          )
        }
      </Async>
    </div>
  )
}

export default function Approvals() {
  const [filter, setFilter] = useState<HospitalApprovalFilter>('pending')
  return <View filter={filter} setFilter={setFilter} />
}

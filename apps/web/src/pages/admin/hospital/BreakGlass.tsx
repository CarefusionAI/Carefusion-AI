import { useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Avatar, Badge, Button, PageHeader, Textarea } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useEscalateBreakGlass, useHospitalBreakGlass, useJustifyBreakGlass } from '../../../api/hospitalAdmin'
import type { HospitalBreakGlassItem } from '../../../api/hospitalAdmin'
import { Async, Box, ConfirmModal, EmptyBox, PageSkeleton, fmtDateTime, humanise, useFlash } from '../opsKit'

const STATUS: Record<HospitalBreakGlassItem['status'], { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  review_due: { label: 'Review due', tone: 'warning' },
  justified: { label: 'Justified', tone: 'success' },
  escalated: { label: 'Escalated to district', tone: 'danger' },
}

function Well({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ak-well">
      <div className="ak-well-label">{label}</div>
      <div className="ak-well-body">{children}</div>
    </div>
  )
}

export default function BreakGlass() {
  const q = useHospitalBreakGlass()
  const justify = useJustifyBreakGlass()
  const escalate = useEscalateBreakGlass()
  const [acting, setActing] = useState<{ item: HospitalBreakGlassItem; kind: 'justify' | 'escalate' } | null>(null)
  const [note, setNote] = useState('')
  const { show, node } = useFlash()

  function open(item: HospitalBreakGlassItem, kind: 'justify' | 'escalate') {
    setActing({ item, kind })
    setNote('')
    justify.reset()
    escalate.reset()
  }

  async function submit() {
    if (!acting) return
    try {
      if (acting.kind === 'justify') {
        await justify.mutateAsync({ sessionId: acting.item.sessionId, note: note.trim() || undefined })
        show('success', `Marked justified. The review is recorded against ${acting.item.doctor}.`)
      } else {
        await escalate.mutateAsync({ sessionId: acting.item.sessionId, note: note.trim() })
        show('success', 'Escalated to the district admin. It is in the audit log.')
      }
      setActing(null)
    } catch {
      /* shown in modal */
    }
  }

  const pendingErr = acting?.kind === 'justify' ? justify.error : escalate.error
  const needNote = acting?.kind === 'escalate' && note.trim().length < 5

  return (
    <div className="ak-page">
      <PageHeader
        title="Break-glass reviews"
        subtitle="Emergency openings without a citizen key must be reviewed within 72 hours. Citizens are notified either way."
        actions={q.data ? <Badge tone={q.data.needReview ? 'warning' : 'success'} dot>{q.data.needReview} need review</Badge> : undefined}
      />
      {node}
      <Async query={q} skeleton={<PageSkeleton stats={false} boxes={2} />}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyBox title="No emergency openings">Break-glass openings at this hospital appear here for review.</EmptyBox>
          ) : (
            data.items.map((b) => {
              const st = STATUS[b.status]
              const open_ = b.status === 'review_due'
              return (
                <Box key={b.sessionId} className="ak-in">
                  <div className="ak-bh">
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                      <Avatar name={b.doctor} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: 'var(--ink)' }}>
                          {b.doctor} opened {b.patient}'s record
                        </strong>
                        <div className="ak-muted">
                          {b.department ?? 'No department'} {'·'} {fmtDateTime(b.startedAt)} {'·'} open {b.minutesOpen} min
                          {b.matchMethod ? ` · matched by ${humanise(b.matchMethod).toLowerCase()}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="ak-wrap">
                      {open_ && b.hoursLeft !== null ? <span className="ak-muted">{b.hoursLeft} h left</span> : null}
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                  </div>
                  <div className="ak-grid ak-g3">
                    <Well label="Reason given">{b.reason ?? 'No reason recorded'}</Well>
                    <Well label="What was viewed">{b.viewed.length ? b.viewed.map((v) => v.label ?? humanise(v.kind)).join(', ') : 'Nothing recorded'}</Well>
                    <Well label="Evidence">{b.evidence ?? 'None attached'}</Well>
                  </div>
                  {!open_ ? (
                    <p className="ak-muted ak-table-note">
                      {b.reviewedAt ? `Reviewed ${fmtDateTime(b.reviewedAt)}. ` : ''}
                      {b.reviewNote ?? ''}
                      {b.status === 'escalated' ? ` District status: ${humanise(b.districtStatus)}.` : ''}
                    </p>
                  ) : (
                    <div className="ak-wrap">
                      <Button variant="primary" size="sm" onClick={() => open(b, 'justify')}>
                        Justified
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => open(b, 'escalate')}>
                        Not justified {'—'} escalate to district
                      </Button>
                    </div>
                  )}
                </Box>
              )
            })
          )
        }
      </Async>

      <ConfirmModal
        open={acting !== null}
        title={acting?.kind === 'justify' ? 'Mark this opening as justified?' : 'Escalate this opening to the district?'}
        confirmLabel={acting?.kind === 'justify' ? 'Mark justified' : 'Escalate to district'}
        danger={acting?.kind === 'escalate'}
        busy={justify.isPending || escalate.isPending}
        disabled={needNote}
        error={pendingErr ? errorMessage(pendingErr) : null}
        onConfirm={() => void submit()}
        onClose={() => setActing(null)}
      >
        {acting?.kind === 'justify' ? (
          <p className="ak-p">
            This closes the review: {acting.item.doctor}'s emergency opening of {acting.item.patient}'s record is recorded as justified by you. The decision is written to the audit log and cannot be changed from here.
          </p>
        ) : (
          <>
            <Alert tone="warning" title="This starts a district inquiry">
              The case goes to the district admin and is written to the audit log. It stays visible against {acting?.item.doctor}'s name until the district closes it.
            </Alert>
          </>
        )}
        <Textarea
          label={acting?.kind === 'justify' ? 'Note for the record' : 'Why was this not justified?'}
          required={acting?.kind === 'escalate'}
          optional={acting?.kind === 'justify'}
          helper={acting?.kind === 'escalate' ? 'At least 5 characters. The district admin reads this.' : undefined}
          rows={3}
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
        />
      </ConfirmModal>
    </div>
  )
}

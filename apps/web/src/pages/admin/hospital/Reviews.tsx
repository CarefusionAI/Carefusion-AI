import { useState } from 'react'
import { Avatar, Badge, PageHeader, Textarea } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useHospitalReviews, useReplyToReview } from '../../../api/hospitalAdmin'
import type { HospitalReviewsResponse } from '../../../api/hospitalAdmin'
import { Async, Bar, Box, Chips, ConfirmModal, EmptyBox, PageSkeleton, Stars, fmtDate, useFlash } from '../opsKit'
import { DeptTag } from './shared'

type Review = HospitalReviewsResponse['items'][number]
type StarFilter = '' | '5' | '4' | '3' | '2' | '1'

export default function Reviews() {
  const [stars, setStars] = useState<StarFilter>('')
  const q = useHospitalReviews(stars ? Number(stars) : undefined)
  const reply = useReplyToReview()
  const [target, setTarget] = useState<Review | null>(null)
  const [body, setBody] = useState('')
  const { show, node } = useFlash()

  async function send() {
    if (!target) return
    try {
      await reply.mutateAsync({ id: target.id, body: body.trim() })
      show('success', `Your reply to ${target.name} is public.`)
      setTarget(null)
    } catch {
      /* in modal */
    }
  }

  return (
    <div className="ak-page">
      <PageHeader title="Reviews" subtitle="What citizens say after a visit. Reviews are verified: only people with a completed visit can post." />
      {node}
      <Async query={q} skeleton={<PageSkeleton stats={false} boxes={2} />}>
        {(data) => {
          const s = data.summary
          return (
            <div className="ak-grid ak-g21 ak-in">
              <Box
                title="Recent reviews"
                actions={<span className="ak-muted">Newest first</span>}
              >
                <Chips<StarFilter>
                  label="Filter by stars"
                  value={stars}
                  onChange={setStars}
                  options={[
                    { id: '', label: 'All' },
                    { id: '5', label: '5 stars' },
                    { id: '4', label: '4 stars' },
                    { id: '3', label: '3 stars' },
                    { id: '2', label: '2 stars' },
                    { id: '1', label: '1 star' },
                  ]}
                />
                {data.items.length === 0 ? (
                  <p className="ak-muted">No reviews match this filter.</p>
                ) : (
                  <div>
                    {data.items.map((r) => (
                      <div key={r.id} className="ak-row is-top">
                        <Avatar name={r.name} size={36} />
                        <div className="ak-row-main">
                          <div className="ak-wrap" style={{ gap: 10 }}>
                            <strong className="ak-strong">{r.name}</strong>
                            <Stars n={r.stars} />
                            <span className="ak-muted">{fmtDate(r.createdAt, false)}</span>
                            <DeptTag name={r.department} />
                            {r.visitVerified ? <Badge tone="success">Verified visit</Badge> : null}
                          </div>
                          {r.text ? <p className="ak-p" style={{ marginTop: 4 }}>{r.text}</p> : null}
                          {r.tags.length ? (
                            <div className="ak-wrap" style={{ gap: 6, marginTop: 6 }}>
                              {r.tags.map((t) => (
                                <Badge key={t} tone="outline">{t}</Badge>
                              ))}
                            </div>
                          ) : null}
                          {r.replies.map((rep) => (
                            <div key={rep.id} className="ak-well" style={{ marginTop: 8 }}>
                              <div className="ak-well-label">
                                Reply from {rep.by} {'·'} {fmtDate(rep.at, false)}
                              </div>
                              <div className="ak-well-body">{rep.body}</div>
                            </div>
                          ))}
                          <div style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="ak-rowbtn"
                              onClick={() => {
                                reply.reset()
                                setBody('')
                                setTarget(r)
                              }}
                            >
                              {r.replies.length ? 'Reply again' : 'Reply'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="ak-stack" style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <h3 className="ak-bt is-sm">This month at a glance</h3>
                  <div className="ak-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    <div className="ak-callout"><b>{s.newThisMonth}</b><span className="ak-muted">New reviews</span></div>
                    <div className="ak-callout">
                      <b>{s.changeVsLastMonth === null ? '-' : `${s.changeVsLastMonth > 0 ? '+' : ''}${s.changeVsLastMonth}`}</b>
                      <span className="ak-muted">Rating vs last month</span>
                    </div>
                    <div className="ak-callout"><b>{s.avgReplyDays === null ? '-' : `${s.avgReplyDays} d`}</b><span className="ak-muted">Average reply time</span></div>
                  </div>
                  <div className="ak-note">
                    <span aria-hidden="true">{'ⓘ'}</span>
                    <span>Replies are public and signed as the hospital. Reviews can't be edited or removed by the hospital. Report abuse to the district admin instead.</span>
                  </div>
                </div>
              </Box>
              <div className="ak-col">
                <Box title="Rating distribution">
                  {s.count === 0 ? (
                    <p className="ak-muted">No reviews yet.</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <span className="ak-big" style={{ fontSize: 40 }}>{s.average?.toFixed(1) ?? '-'}</span>
                        <Stars n={s.average ?? 0} label={`Average ${s.average?.toFixed(1)} out of 5 stars`} />
                        <span className="ak-muted">{s.count} reviews</span>
                      </div>
                      {s.distribution.map((d) => (
                        <div key={d.stars} className="ak-rb">
                          <span className="ak-muted">{d.stars} star</span>
                          <Bar pct={d.pct} tone={d.stars <= 2 ? 'low' : 'gold'} />
                          <span className="ak-muted">{d.pct}%</span>
                        </div>
                      ))}
                      <p className="ak-muted ak-table-note">{s.repliedPct}% replied {'·'} {s.repliedWithin3DaysPct}% within 3 days</p>
                    </>
                  )}
                </Box>
                <Box title="By department">
                  {s.byDepartment.length === 0 ? (
                    <p className="ak-muted">No department ratings yet.</p>
                  ) : (
                    <div>
                      {s.byDepartment.map((d) => (
                        <div key={d.department} className="ak-row">
                          <span style={{ flex: 1, fontSize: 14, color: 'var(--ink)' }}>{d.department}</span>
                          <Stars n={d.avg} label={`${d.avg} out of 5`} />
                          <strong style={{ width: 32, textAlign: 'right', color: 'var(--ink)' }}>{d.avg.toFixed(1)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </Box>
                {s.topTags.length ? (
                  <Box title="Most mentioned">
                    <div className="ak-wrap" style={{ gap: 6 }}>
                      {s.topTags.map((t) => (
                        <Badge key={t.tag} tone="teal">{t.tag} {'·'} {t.count}</Badge>
                      ))}
                    </div>
                  </Box>
                ) : null}
              </div>
            </div>
          )
        }}
      </Async>

      <ConfirmModal
        open={target !== null}
        title={`Reply to ${target?.name ?? 'review'}`}
        confirmLabel="Post public reply"
        busy={reply.isPending}
        disabled={body.trim().length < 2}
        error={reply.isError ? errorMessage(reply.error) : null}
        onConfirm={() => void send()}
        onClose={() => setTarget(null)}
      >
        <p className="ak-p">Your reply is public and signed as the hospital. You cannot edit or delete it afterwards.</p>
        <Textarea label="Your reply" required rows={4} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
      </ConfirmModal>
    </div>
  )
}

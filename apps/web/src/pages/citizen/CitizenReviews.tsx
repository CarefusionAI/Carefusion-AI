import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ReviewDto, ReviewableVisitDto } from '@carefusion/shared'
import { Alert, Avatar, Badge, Button, EmptyState, Modal, Select, Skeleton, Textarea } from '../../components/ui'
import {
  errorText,
  useCreateReview,
  useHelpful,
  useMyReviews,
  useReportReview,
  useReviews,
} from '../../api/citizen2'
import type { ReviewFilters } from '../../api/citizen2'
import { Box, C2Head, CardSkeleton, ErrorBox, fmtLong, useToast } from './c2kit'
import './citizen2.css'

const TAGS = ['Caring staff', 'Short wait', 'Clean', 'Clear explanation', 'Good value', 'Long wait', 'Hard to find', 'Rushed']

function Stars({ n, label }: { n: number; label?: string }) {
  return (
    <span className="c2-stars" role="img" aria-label={label ?? `${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(n) ? '' : 'off'} aria-hidden="true">★</span>
      ))}
    </span>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="c2-picker" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i === 1 ? '' : 's'}`}
          className={`c2-st${i <= value ? ' on' : ''}`}
          onClick={() => onChange(i)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l2.6 5.6l6.1.7l-4.5 4.2l1.2 6L12 16.6L6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

export default function CitizenReviewsScreen() {
  const [filters, setFilters] = useState<ReviewFilters>({ sort: 'recent' })
  const list = useReviews(filters)
  const mine = useMyReviews()
  const helpful = useHelpful()
  const report = useReportReview()
  const create = useCreateReview()
  const toast = useToast()

  const [writeFor, setWriteFor] = useState<ReviewableVisitDto | null>(null)
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [reportFor, setReportFor] = useState<ReviewDto | null>(null)
  const [reason, setReason] = useState('')

  const summary = list.data?.summary
  const reviews = list.data?.reviews ?? []
  const reviewable = (mine.data?.reviewable ?? []).filter((v) => !v.alreadyReviewed)
  const total = Math.max(1, summary?.count ?? 1)

  function openWrite(v: ReviewableVisitDto) {
    setWriteFor(v)
    setStars(0)
    setComment('')
    setTags([])
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!writeFor) return
    if (stars < 1) {
      toast.show('Choose a rating', 'Tap a star from 1 to 5.')
      return
    }
    create.mutate(
      { targetType: writeFor.targetType, targetId: writeFor.targetId, stars, comment: comment.trim() || undefined, tags, opVisitId: writeFor.opVisitId },
      {
        onSuccess: () => {
          setWriteFor(null)
          toast.show('Thank you', 'Your review is verified because you visited.')
        },
        onError: (er) => toast.show('Could not post', errorText(er)),
      },
    )
  }

  function onReport() {
    if (!reportFor) return
    report.mutate(
      { id: reportFor.id, reason: reason.trim() },
      {
        onSuccess: () => {
          setReportFor(null)
          setReason('')
          toast.show('Reported', 'A hospital admin will look at it.')
        },
        onError: (er) => toast.show('Could not report', errorText(er)),
      },
    )
  }

  function onHelpful(r: ReviewDto) {
    helpful.mutate(r.id, { onError: (er) => toast.show('Could not save', errorText(er)) })
  }

  const set = (patch: Partial<ReviewFilters>) => setFilters((f) => ({ ...f, ...patch }))

  return (
    <div className="c2-page">
      <C2Head
        eyebrow="Care · Reviews"
        title="Reviews"
        lead="Honest feedback from people who visited. Only first names and an initial are shown. Reviews tied to a real visit are marked verified."
      />

      <div className="c2-grid c2-wide c2-in c2-d1">
        <div className="c2-stack">
          <Box title="Overall" titleId="rv-sum">
            {list.isLoading && !summary ? (
              <Skeleton height={120} radius={16} />
            ) : summary ? (
              <div className="c2-score">
                <div>
                  <div className="c2-big">{summary.average !== null ? summary.average.toFixed(1) : '–'}</div>
                  <Stars n={summary.average ?? 0} label={summary.average !== null ? `${summary.average.toFixed(1)} out of 5` : 'No ratings yet'} />
                  <div className="c2-muted" style={{ marginTop: 6 }}>
                    {summary.count} review{summary.count === 1 ? '' : 's'} · {summary.verified} verified · {summary.replied} answered
                  </div>
                </div>
                <div className="c2-dist">
                  {([5, 4, 3, 2, 1] as const).map((n) => {
                    const c = summary.distribution[String(n) as '1']
                    return (
                      <div className="c2-drow" key={n}>
                        <span>{n} star</span>
                        <div className="c2-dbar" aria-hidden="true"><span style={{ width: `${Math.round((100 * c) / total)}%` }} /></div>
                        <span className="c2-num">{c}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
            {summary && summary.tags.length > 0 ? (
              <div className="c2-chips" aria-label="What people mention">
                {summary.tags.map((t) => (
                  <span key={t.tag} className="c2-chip">{t.tag} · {t.count}</span>
                ))}
              </div>
            ) : null}
          </Box>

          <Box title="Filter" titleId="rv-filter">
            <div className="c2-filters">
              <Select
                label="Show"
                value={filters.targetType ?? ''}
                onChange={(v) => set({ targetType: (v || undefined) as ReviewFilters['targetType'] })}
                options={[{ value: '', label: 'Everything' }, { value: 'hospital', label: 'Hospitals' }, { value: 'doctor', label: 'Doctors' }, { value: 'pharmacy', label: 'Pharmacies' }]}
              />
              <Select
                label="Rating"
                value={String(filters.minStars ?? '')}
                onChange={(v) => set({ minStars: v ? Number(v) : undefined })}
                options={[{ value: '', label: 'Any' }, { value: '5', label: '5 stars' }, { value: '4', label: '4 stars and up' }, { value: '3', label: '3 stars and up' }]}
              />
              <Select
                label="Sort by"
                value={filters.sort ?? 'recent'}
                onChange={(v) => set({ sort: v as ReviewFilters['sort'] })}
                options={[{ value: 'recent', label: 'Newest' }, { value: 'rating', label: 'Highest rated' }, { value: 'helpful', label: 'Most helpful' }]}
              />
              <Button variant="ghost" onClick={() => setFilters({ sort: 'recent' })}>Clear filters</Button>
            </div>
          </Box>

          {list.isLoading ? (
            <CardSkeleton lines={5} label="Loading reviews" />
          ) : list.isError ? (
            <ErrorBox error={list.error} onRetry={() => void list.refetch()} />
          ) : reviews.length === 0 ? (
            <EmptyState title="No reviews match">Try clearing a filter.</EmptyState>
          ) : (
            <div className="c2-list">
              {reviews.map((r) => (
                <article key={r.id} className="c2-rv">
                  <div className="c2-rv-h">
                    <Avatar name={r.reviewerName} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="c2-nm">{r.reviewerName}{r.mine ? ' (you)' : ''}</div>
                      <div className="c2-muted">
                        {[r.targetName, r.department, r.location].filter(Boolean).join(' · ')} · {fmtLong(r.createdAt)}
                      </div>
                    </div>
                    <Stars n={r.stars} />
                  </div>
                  {r.verified ? <Badge tone="success" dot>Verified visit</Badge> : null}
                  {r.comment ? <p>{r.comment}</p> : null}
                  {r.tags.length > 0 ? (
                    <div className="c2-chips">{r.tags.map((t) => <span key={t} className="c2-chip">{t}</span>)}</div>
                  ) : null}
                  {r.reply ? (
                    <div className="c2-reply">
                      <strong>{r.reply.by ?? 'Hospital'} replied:</strong> {r.reply.text}
                    </div>
                  ) : null}
                  <div className="c2-rv-f">
                    <button type="button" className={`c2-helpful${r.markedHelpful ? ' on' : ''}`} aria-pressed={r.markedHelpful} onClick={() => onHelpful(r)} disabled={r.mine}>
                      Helpful · {r.helpful}
                    </button>
                    {r.mine ? null : (
                      <Button variant="ghost" size="sm" onClick={() => { setReportFor(r); setReason('') }}>Report</Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="c2-stack" aria-label="Write a review">
          <Box title="Write a review" titleId="rv-write">
            {mine.isLoading ? (
              <Skeleton lines={3} />
            ) : mine.isError ? (
              <ErrorBox error={mine.error} onRetry={() => void mine.refetch()} />
            ) : reviewable.length === 0 ? (
              <EmptyState title="Nothing to review right now">After a visit is finished, you can rate it here.</EmptyState>
            ) : (
              reviewable.map((v) => (
                <div key={v.opVisitId} className="c2-place">
                  <span className="c2-pi" aria-hidden="true">{v.targetType === 'doctor' ? 'Dr' : 'H'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="c2-nm">{v.title}</div>
                    <div className="c2-muted">{v.sub} · {fmtLong(v.visitDate)}</div>
                  </div>
                  <Button size="sm" onClick={() => openWrite(v)}>Rate</Button>
                </div>
              ))
            )}
          </Box>
          <Box title="Your reviews" titleId="rv-mine">
            {(mine.data?.reviews ?? []).length === 0 ? (
              <p className="c2-muted" style={{ margin: 0 }}>You have not written any reviews yet.</p>
            ) : (
              mine.data!.reviews.map((r) => (
                <div key={r.id} className="c2-place">
                  <Stars n={r.stars} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="c2-nm">{r.targetName}</div>
                    <div className="c2-muted">{fmtLong(r.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </Box>
          <Alert tone="info" title="Reviews are public">
            Never write medical details or other people's names in a review. Use Complaints for anything private.
          </Alert>
        </aside>
      </div>

      <Modal open={!!writeFor} title={writeFor ? `Rate ${writeFor.title}` : 'Rate'} onClose={() => setWriteFor(null)}>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <StarPicker value={stars} onChange={setStars} />
          <Textarea label="Your experience" optional value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} rows={4} />
          <div className="c2-tagpick" role="group" aria-label="What stood out">
            {TAGS.map((t) => {
              const on = tags.includes(t)
              return (
                <button key={t} type="button" className={`c2-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t].slice(0, 8))}>
                  {t}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button type="button" variant="secondary" onClick={() => setWriteFor(null)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Post review</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!reportFor}
        title="Report this review"
        onClose={() => setReportFor(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportFor(null)}>Cancel</Button>
            <Button variant="danger" disabled={reason.trim().length < 3} loading={report.isPending} onClick={onReport}>Send report</Button>
          </>
        }
      >
        <Textarea label="What is wrong with it?" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
      </Modal>
      {toast.node}
    </div>
  )
}

import { useState } from 'react'
import { Badge, Button, Switch, Textarea, TextField } from '../../../components/ui'
import { useProfile, useReplyReview, useUpdateProfile } from '../../../api/doctor'
import { Box, ErrorNote, Kv, Loading, Sent } from '../parts'
import { fmtDay, initials } from '../format'

const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n))

export default function ProfileSection() {
  const q = useProfile()
  const update = useUpdateProfile()
  const reply = useReplyReview()
  const [editing, setEditing] = useState(false)
  const [bio, setBio] = useState('')
  const [langs, setLangs] = useState('')
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [saved, setSaved] = useState(false)

  if (q.isLoading) return <Loading lines={8} />
  if (q.isError || !q.data) return <ErrorNote error={q.error} title="Could not load your profile" />
  const p = q.data

  function startEdit() {
    setBio(p.bio ?? '')
    setLangs(p.languages.join(', '))
    setSaved(false)
    setEditing(true)
  }
  function save() {
    update.mutate(
      { bio: bio.trim(), languages: langs.split(',').map((l) => l.trim()).filter(Boolean) },
      {
        onSuccess: () => {
          setEditing(false)
          setSaved(true)
        },
      },
    )
  }

  return (
    <div className="dr-page">
      <Box>
        <div className="dr-wrap" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div className="dr-photo" role="img" aria-label={`Initials of ${p.name}`}>
            {initials(p.name)}
          </div>
          <div style={{ flex: '1 1 320px', minWidth: 0 }} className="dr-stack">
            <h1 className="dr-h1">{p.name}</h1>
            <p style={{ margin: 0 }}>
              {p.degrees.map((d) => d.degree).join(', ')} &middot; {p.specialisation} &middot; {p.yearsExperience} years &middot; {p.hospital}
            </p>
            <div className="dr-wrap">
              {p.hprVerified ? (
                <Badge tone="success" dot>
                  HPR verified (mock)
                </Badge>
              ) : null}
              <Badge tone="outline">HPR {p.hprId}</Badge>
              <Badge tone="outline">{p.council}</Badge>
              {p.languages.length ? <Badge tone="info">{p.languages.join(' · ')}</Badge> : null}
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px 24px', borderRadius: 18, background: 'var(--surface)' }}>
            <div style={{ font: '600 40px/1 var(--font-serif)', color: 'var(--ink-strong)' }}>{p.rating.average.toFixed(1)}</div>
            <div className="dr-stars" aria-label={`${p.rating.average.toFixed(1)} out of 5 stars`}>
              {stars(p.rating.average)}
            </div>
            <div className="dr-muted">{p.rating.count} reviews</div>
          </div>
        </div>
      </Box>

      <section className="dr-grid dr-s21">
        <Box title="What patients say" actions={<Badge tone="neutral">Moderated by the hospital</Badge>}>
          {p.reviews.length === 0 ? <p className="dr-muted">No reviews yet.</p> : null}
          {p.reviews.map((r) => (
            <div key={r.id} className="dr-rev">
              <div className="dr-between">
                <strong className="dr-strong">
                  {r.who} {r.verifiedVisit ? <Badge tone="success">Verified visit</Badge> : null}
                </strong>
                <span className="dr-muted">{fmtDay(r.date)}</span>
              </div>
              <span className="dr-stars" aria-label={`${r.stars} out of 5 stars`}>
                {stars(r.stars)}
              </span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{r.text}</p>
              {r.myReply ? (
                <p className="dr-muted" style={{ margin: 0 }}>
                  <strong>Your reply:</strong> {r.myReply}
                </p>
              ) : replyFor === r.id ? (
                <div className="dr-stack">
                  <Textarea label="Your reply (the patient and the hospital admin can read it)" value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} maxLength={1000} />
                  <div className="dr-wrap">
                    <Button
                      size="sm"
                      loading={reply.isPending}
                      disabled={!replyText.trim()}
                      onClick={() =>
                        reply.mutate(
                          { id: r.id, body: replyText.trim() },
                          {
                            onSuccess: () => {
                              setReplyFor(null)
                              setReplyText('')
                            },
                          },
                        )
                      }
                    >
                      Post reply
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setReplyFor(null)}>
                      Cancel
                    </Button>
                  </div>
                  <ErrorNote error={reply.error} title="Could not post the reply" />
                </div>
              ) : (
                <div>
                  <button type="button" className="dr-link" onClick={() => setReplyFor(r.id)} aria-label={`Reply to ${r.who}`}>
                    Reply
                  </button>
                </div>
              )}
            </div>
          ))}
        </Box>

        <div className="dr-col">
          <Box title="Rating breakdown">
            <div role="img" aria-label={`Rating shares: ${[5, 4, 3, 2, 1].map((s) => `${s} stars ${p.rating.breakdown[String(s)] ?? 0}%`).join(', ')}`} className="dr-stack" style={{ gap: 10 }}>
              {[5, 4, 3, 2, 1].map((s) => (
                <div className="dr-rb" key={s}>
                  <span>{s} ★</span>
                  <span className="tr">
                    <span style={{ width: `${p.rating.breakdown[String(s)] ?? 0}%` }} />
                  </span>
                  <span className="dr-muted">{p.rating.breakdown[String(s)] ?? 0}%</span>
                </div>
              ))}
            </div>
          </Box>
          <Box title="Mentioned most">
            <div className="dr-wrap">
              {p.mostMentioned.map((m) => (
                <Badge key={m.tag} tone={/wait/i.test(m.tag) ? 'warning' : 'success'}>
                  {m.tag} · {m.count}
                </Badge>
              ))}
            </div>
            <Kv
              items={[
                { label: 'Consults this year', value: p.stats.consultsThisYear },
                { label: 'Teleconsults', value: p.stats.teleconsults },
                { label: 'Avg consult', value: `${p.stats.avgConsultMinutes} min` },
                { label: 'Referrals', value: p.stats.referrals },
              ]}
            />
          </Box>
          <Box title="About you" actions={!editing ? <button type="button" className="dr-link" onClick={startEdit}>Edit</button> : undefined}>
            {editing ? (
              <>
                <Textarea label="Short bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={1000} />
                <TextField label="Languages (comma separated)" value={langs} onChange={(e) => setLangs(e.target.value)} />
                <Switch label="Accept walk-in patients" checked={p.acceptsWalkin} onChange={(v) => update.mutate({ acceptsWalkin: v })} />
                <Switch label="Offer teleconsults" checked={p.offersTeleconsult} onChange={(v) => update.mutate({ offersTeleconsult: v })} />
                <div className="dr-wrap">
                  <Button size="sm" loading={update.isPending} onClick={save}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 14 }}>{p.bio || 'No bio yet.'}</p>
                <Kv
                  items={[
                    { label: 'Walk-ins', value: p.acceptsWalkin ? 'Accepted' : 'Not accepted' },
                    { label: 'Teleconsults', value: p.offersTeleconsult ? 'Offered' : 'Not offered' },
                    { label: 'Duty', value: `${p.dutyHours.from}–${p.dutyHours.to}, ${p.dutyHours.days}` },
                    { label: 'e-Sign', value: p.signingMethod === 'mock' ? 'Demo (mock)' : p.signingMethod },
                  ]}
                />
              </>
            )}
            {saved ? <Sent>Profile saved.</Sent> : null}
            <ErrorNote error={update.error} title="Could not save" />
          </Box>
        </div>
      </section>
    </div>
  )
}

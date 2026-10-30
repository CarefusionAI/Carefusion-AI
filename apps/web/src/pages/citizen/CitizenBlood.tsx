import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { CitizenBloodCampDto, CitizenBloodDonorDto, CitizenBloodRequestDto } from '@carefusion/shared'
import { Alert, Badge, Button, Checkbox, EmptyState, Modal, Skeleton, StatCard, Switch, TextField } from '../../components/ui'
import {
  errorText,
  useBloodBanks,
  useBloodChecklist,
  useBloodDonor,
  useBloodHistory,
  useBloodRequests,
  usePledgeCamp,
  useRespondBlood,
  useSaveChecklist,
  useSetAvailability,
  useWithdrawBlood,
} from '../../api/citizen2'
import { Box, C2Head, CardSkeleton, ErrorBox, fmtDD, fmtLong, fmtMon, fmtShort, fmtTime, fmtWd, fmtYmdShort, pluralize, useToast } from './c2kit'
import './citizen2.css'

const TIER_NAME = { new: 'New donor', bronze: 'Bronze donor', silver: 'Silver donor', gold: 'Gold donor' } as const
const NEXT_NAME = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const
const LEVEL_TEXT = { critical: 'Critical', low: 'Low', good: 'Good' } as const
const LEVEL_BAR = { critical: 'lo', low: 'md', good: 'hi' } as const
const LEVEL_W = { critical: '10%', low: '40%', good: '80%' } as const

/** Hours and minutes left until the eligibility moment, ticking every 30 seconds. */
function useRemainder(eligibleAt: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!eligibleAt) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [eligibleAt])
  if (!eligibleAt) return { h: 0, m: 0 }
  const day = 86_400_000
  const rem = (((new Date(eligibleAt).getTime() - now) % day) + day) % day
  return { h: Math.floor(rem / 3_600_000), m: Math.floor((rem % 3_600_000) / 60_000) }
}

function shareText(r: CitizenBloodRequestDto): string {
  return `Blood needed: ${r.bloodGroup}, ${pluralize(r.units, 'unit')} at ${r.hospitalName}. Please share. (CareFusion AI demo, synthetic data)`
}

export default function CitizenBloodScreen() {
  const donor = useBloodDonor()
  const reqs = useBloodRequests()
  const banks = useBloodBanks()
  const history = useBloodHistory()
  const checklist = useBloodChecklist()
  const setAvail = useSetAvailability()
  const respond = useRespondBlood()
  const withdraw = useWithdrawBlood()
  const pledge = usePledgeCamp()
  const saveList = useSaveChecklist()
  const toast = useToast()

  const [editList, setEditList] = useState(false)
  const [weight, setWeight] = useState('')
  const [diabetes, setDiabetes] = useState(false)
  const [tablets, setTablets] = useState(false)
  const [illness, setIllness] = useState(false)
  const [meal, setMeal] = useState(true)
  const [abha, setAbha] = useState(true)

  const d = donor.data
  const rem = useRemainder(d?.resting ? d.eligibleAt : null)

  function openChecklist() {
    const c = checklist.data
    setWeight(c?.weightKg ? String(c.weightKg) : '')
    setDiabetes(!!c?.hasDiabetes)
    setTablets(!!c?.onMedication)
    setIllness(!!c?.recentIllness)
    setMeal(c?.tips.mealAndWater ?? true)
    setAbha(c?.tips.abhaReady ?? true)
    setEditList(true)
  }

  function onSaveChecklist(e: FormEvent) {
    e.preventDefault()
    const w = Number(weight)
    if (!w || w < 20 || w > 250) {
      toast.show('Check your weight', 'Enter your weight in kg, between 20 and 250.')
      return
    }
    saveList.mutate(
      { weightKg: w, hasDiabetes: diabetes, onMedication: tablets, recentIllness: illness, mealAndWater: meal, abhaReady: abha },
      {
        onSuccess: (c) => {
          setEditList(false)
          toast.show('Answers saved', c.eligible ? 'You pass the checklist.' : (c.reasons[0] ?? 'Not eligible right now.'))
        },
        onError: (er) => toast.show('Could not save', errorText(er)),
      },
    )
  }

  function onAvail(on: boolean) {
    setAvail.mutate(on, {
      onSuccess: (x) => toast.show(on ? 'You are available' : 'Paused', x.ready ? 'Blood banks can send you requests.' : 'No requests will reach you.'),
      onError: (er) => toast.show('Could not change', errorText(er)),
    })
  }

  function onRespond(r: CitizenBloodRequestDto, response: 'will_donate' | 'cannot') {
    respond.mutate(
      { id: r.id, response, notifyCircle: response === 'cannot' ? true : undefined },
      {
        onSuccess: () =>
          toast.show(
            response === 'will_donate' ? 'Thank you' : 'Noted',
            response === 'will_donate' ? `Sent to the doctor at ${r.hospitalName}.` : 'We will tell your circle about this request.',
          ),
        onError: (er) => toast.show('Could not send', errorText(er)),
      },
    )
  }

  function onWithdraw(r: CitizenBloodRequestDto) {
    withdraw.mutate(r.id, { onSuccess: () => toast.show('Answer withdrawn'), onError: (er) => toast.show('Could not withdraw', errorText(er)) })
  }

  function onPledge(c: CitizenBloodCampDto) {
    pledge.mutate(c.id, {
      onSuccess: () => toast.show('Pledged', `${c.name} · a reminder is in Dates`),
      onError: (er) => toast.show('Could not pledge', errorText(er)),
    })
  }

  async function onShare(r: CitizenBloodRequestDto) {
    const text = shareText(r)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Blood needed', text })
        return
      }
      await navigator.clipboard.writeText(text)
      toast.show('Copied', 'Paste it in a message to family and friends.')
    } catch {
      toast.show('Could not share', 'Copy the details by hand instead.')
    }
  }

  const openReq = (reqs.data?.requests ?? []).filter((r) => !r.myResponse).length
  const statusBadge = (x: CitizenBloodDonorDto) =>
    x.resting ? { tone: 'warning' as const, text: 'Registered · resting' } : x.ready ? { tone: 'success' as const, text: 'Available for requests' } : { tone: 'neutral' as const, text: 'Paused by you' }

  return (
    <div className="c2-page">
      <C2Head
        eyebrow="Give · Blood donation"
        title="Blood donation"
        lead={
          d
            ? `You're a registered ${d.bloodGroup} donor. We only share your name and phone with a blood bank after you say yes to a request.`
            : 'We only share your name and phone with a blood bank after you say yes to a request.'
        }
        actions={
          d ? (
            <Switch
              label="Available for requests"
              description={d.switchNote ?? (d.ready ? 'Blood banks can send you requests' : 'Paused — no requests will reach you')}
              checked={d.ready}
              disabled={d.resting || setAvail.isPending}
              onChange={onAvail}
            />
          ) : undefined
        }
      />

      {donor.isLoading ? (
        <Skeleton height={190} radius={24} />
      ) : donor.isError ? (
        <ErrorBox error={donor.error} onRetry={() => void donor.refetch()} />
      ) : d ? (
        <section className="c2-bhero c2-in c2-d1" aria-label="Donor status">
          <svg className="c2-dropsvg" width="110" height="130" viewBox="0 0 110 130" aria-hidden="true">
            <path d="M55 6C75 36 100 60 100 86a45 45 0 0 1-90 0C10 60 35 36 55 6z" fill="#d99a96" />
            <path d="M55 6C75 36 100 60 100 86a45 45 0 0 1-90 0C10 60 35 36 55 6z" fill="none" stroke="#9a4a46" strokeWidth="2" opacity=".35" />
            <text x="55" y="98" textAnchor="middle" fontFamily="IBM Plex Sans" fontWeight="600" fontSize="30" fill="#faf5ef">{d.bloodGroup}</text>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone={statusBadge(d).tone} dot>{statusBadge(d).text}</Badge>
              {d.donorCode ? <Badge tone="outline">Donor ID {d.donorCode}</Badge> : null}
            </div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 26, lineHeight: '32px', color: 'var(--ink-strong)' }}>
              {d.resting && d.eligibleFrom ? `You can donate again on ${fmtYmdShort(d.eligibleFrom)}` : 'You can donate now'}
            </h2>
            <p style={{ margin: 0 }}>
              {d.resting
                ? `Whole blood needs ${d.restDaysTotal} days between donations. `
                : 'Your rest period is over. '}
              {d.lastDonationAt ? `Your last donation was on ${fmtLong(d.lastDonationAt)}.` : 'You have not donated yet.'}
            </p>
            {d.resting ? (
              <>
                <div className="c2-bar" style={{ maxWidth: 420, background: 'rgba(250,245,239,.8)' }} role="img" aria-label={`${d.restDaysDone} of ${d.restDaysTotal} days of rest done`}>
                  <span style={{ width: `${Math.round((100 * d.restDaysDone) / d.restDaysTotal)}%`, background: '#9a4a46', opacity: 0.55 }} />
                </div>
                <span className="c2-muted">{d.restDaysDone} of {d.restDaysTotal} days of rest done</span>
              </>
            ) : null}
          </div>
          {d.resting ? (
            <div className="c2-cd" role="timer" aria-label={`${d.daysUntilEligible} days, ${rem.h} hours until eligible`}>
              <div><b>{d.daysUntilEligible}</b><span>Days</span></div>
              <div><b>{String(rem.h).padStart(2, '0')}</b><span>Hours</span></div>
              <div><b>{String(rem.m).padStart(2, '0')}</b><span>Min</span></div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="c2-grid c2-g4 c2-in c2-d2" aria-label="Your giving">
        {donor.isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={104} radius={16} />)
        ) : d ? (
          <>
            <StatCard label="Donations" value={d.donations} hint={d.sinceYear ? `Since ${d.sinceYear}` : 'No donations yet'} tone="peach" />
            <StatCard label="Lives touched" value={d.livesHelped ? `up to ${d.livesHelped}` : '0'} hint="Each unit can help 3 people" />
            <StatCard label="Haemoglobin" value={d.lastHb ?? '—'} unit="g/dL" hint={`At last donation · ≥${d.minHb} needed`} tone="sage" />
            <StatCard label="Requests nearby" value={reqs.data ? openReq : '…'} unit="open" hint={reqs.data ? `Within ${reqs.data.radiusKm} km · ${reqs.data.compatibleGroups.slice(0, 3).join(' or ')}` : undefined} tone="blue" />
          </>
        ) : null}
      </section>

      <section className="c2-grid c2-wide c2-in c2-d3">
        <div className="c2-box">
          <div className="c2-bh">
            <h2 className="c2-bt">Requests near you</h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
              <span className="c2-live" aria-hidden="true" />
              Live
            </span>
          </div>
          {d?.resting && d.eligibleFrom ? (
            <Alert tone="info" title={`You're resting until ${fmtYmdShort(d.eligibleFrom)}`}>
              You can still share requests with family and friends, or pledge for a date after {fmtYmdShort(d.eligibleFrom)}.
            </Alert>
          ) : null}
          {reqs.isLoading ? (
            <CardSkeleton lines={4} label="Loading requests" />
          ) : reqs.isError ? (
            <ErrorBox error={reqs.error} onRetry={() => void reqs.refetch()} />
          ) : (reqs.data?.requests.length ?? 0) + (reqs.data?.camps.length ?? 0) === 0 ? (
            <EmptyState title="No requests right now">When a hospital near you needs your blood group, it shows up here.</EmptyState>
          ) : (
            <>
              {reqs.data!.requests.map((r) => {
                const sent = r.myResponse !== null
                const urgent = r.urgency !== 'normal'
                return (
                  <div key={r.id} className={`c2-req${sent ? ' sent' : urgent ? ' urgent' : ''}`}>
                    <div className="c2-bh">
                      <div>
                        <div className="c2-nm">{r.hospitalName}</div>
                        <div className="c2-muted">{r.meta}</div>
                      </div>
                      <Badge tone={sent ? 'success' : urgent ? 'danger' : 'warning'}>
                        {sent ? (r.myResponse === 'will_donate' ? 'You responded' : 'You said no') : r.urgency === 'critical' ? 'Critical' : urgent ? 'Urgent' : 'This week'}
                      </Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {sent ? (
                        <Button variant="ghost" size="sm" onClick={() => onWithdraw(r)} loading={withdraw.isPending && withdraw.variables === r.id}>Withdraw</Button>
                      ) : (
                        <>
                          <Button size="sm" disabled={!r.canDonate} onClick={() => onRespond(r, 'will_donate')} loading={respond.isPending && respond.variables?.id === r.id && respond.variables.response === 'will_donate'}>
                            I can donate
                          </Button>
                          <Button size="sm" variant="soft" onClick={() => onRespond(r, 'cannot')} loading={respond.isPending && respond.variables?.id === r.id && respond.variables.response === 'cannot'}>
                            I can't donate — notify my circle
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void onShare(r)}>Share request</Button>
                      <span className="c2-muted">
                        {sent
                          ? r.myResponse === 'will_donate'
                            ? 'Sent to the doctor and district blood network'
                            : 'Your circle will be told'
                          : r.canDonate
                            ? 'Live request from the Doctor app'
                            : d?.eligibleFrom
                              ? `Resting until ${fmtYmdShort(d.eligibleFrom)}`
                              : 'Resting'}
                      </span>
                    </div>
                  </div>
                )
              })}
              {reqs.data!.camps.map((c) => (
                <div key={c.id} className={`c2-req${c.pledged ? ' sent' : ''}`}>
                  <div className="c2-bh">
                    <div>
                      <div className="c2-nm">{c.name}</div>
                      <div className="c2-muted">
                        Camp · {fmtWd(c.startsAt)} {fmtShort(c.startsAt)}, {fmtTime(c.startsAt)}–{fmtTime(c.endsAt)} · {c.venue}
                        {c.distanceKm !== null ? ` · ${c.distanceKm} km` : ''}
                      </div>
                    </div>
                    <Badge tone={c.pledged ? 'success' : 'teal'}>{c.pledged ? 'You pledged' : 'Camp'}</Badge>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.pledged ? (
                      <span className="c2-muted">A reminder is in Dates</span>
                    ) : (
                      <>
                        <Button size="sm" disabled={!c.eligibleOnDay} onClick={() => onPledge(c)} loading={pledge.isPending && pledge.variables === c.id}>
                          Pledge for camp
                        </Button>
                        <span className="c2-muted">{c.eligibleOnDay ? 'After your rest period ✓' : 'You are still resting on this day'}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="c2-box">
          <div className="c2-bh">
            <h2 className="c2-bt">Donation history</h2>
            <Link to="/citizen/documents" className="c2-lk">Certificates</Link>
          </div>
          {history.isLoading ? (
            <CardSkeleton lines={4} label="Loading history" />
          ) : history.isError ? (
            <ErrorBox error={history.error} onRetry={() => void history.refetch()} />
          ) : (history.data?.donations.length ?? 0) === 0 ? (
            <EmptyState title="No donations yet">Your first donation will appear here with its certificate.</EmptyState>
          ) : (
            <>
              <ol className="c2-tl">
                {history.data!.donations.slice(0, 4).map((x) => (
                  <li key={x.id}>
                    <i aria-hidden="true" />
                    <div className="c2-nm">{fmtLong(x.donatedAt)} · {x.type}</div>
                    <div className="c2-muted">
                      {x.isCamp ? 'Camp · ' : ''}
                      {x.place}
                      {x.hb ? ` · Hb ${x.hb}` : ''}
                    </div>
                  </li>
                ))}
                {history.data!.donations.length > 4 ? (
                  <li>
                    <i aria-hidden="true" />
                    <div className="c2-nm">{history.data!.donations.length - 4} more{history.data!.sinceYear ? ` since ${history.data!.sinceYear}` : ''}</div>
                    <div className="c2-muted">All certificates saved in Documents</div>
                  </li>
                ) : null}
              </ol>
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <h3 className="c2-nm" style={{ margin: 0 }}>Your impact</h3>
                <div className="c2-impact">
                  <div><strong>{history.data!.count}</strong><span className="c2-muted" style={{ fontSize: 12 }}>Donations{history.data!.sinceYear ? ` since ${history.data!.sinceYear}` : ''}</span></div>
                  <div><strong>{history.data!.litres} L</strong><span className="c2-muted" style={{ fontSize: 12 }}>Blood given</span></div>
                  <div><strong>up to {history.data!.livesHelped}</strong><span className="c2-muted" style={{ fontSize: 12 }}>Patients helped</span></div>
                </div>
                <div className="c2-tier">
                  <span aria-hidden="true" style={{ fontSize: 22, color: 'var(--accent-text)' }}>★</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: 'var(--ink)' }}>{TIER_NAME[history.data!.tier]}</strong>
                    <div className="c2-muted">
                      {history.data!.nextTier && history.data!.donationsToNextTier
                        ? `${pluralize(history.data!.donationsToNextTier, 'more donation')} to reach ${NEXT_NAME[history.data!.nextTier]}`
                        : 'You have reached the top tier'}
                      {' · demo recognition'}
                    </div>
                  </div>
                </div>
                {d?.resting && d.eligibleFrom ? (
                  <div>
                    <div className="c2-bh">
                      <span className="c2-muted">Next eligible donation</span>
                      <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{fmtYmdShort(d.eligibleFrom)} · {pluralize(d.daysUntilEligible, 'day')}</strong>
                    </div>
                    <div className="c2-bar" style={{ marginTop: 6 }}>
                      <span style={{ width: `${Math.round((100 * d.restDaysDone) / d.restDaysTotal)}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="c2-grid c2-g2 c2-in c2-d4">
        <div className="c2-box">
          <div className="c2-bh">
            <h2 className="c2-bt">Blood bank stock{banks.data?.districtName ? ` · ${banks.data.districtName} district` : ''}</h2>
            <span className="c2-muted">Units today</span>
          </div>
          {banks.isLoading ? (
            <CardSkeleton lines={4} label="Loading stock" />
          ) : banks.isError ? (
            <ErrorBox error={banks.error} onRetry={() => void banks.refetch()} />
          ) : (banks.data?.groups ?? []).every((g) => g.units === 0) ? (
            <EmptyState title="No stock reported">Blood banks in your district have not sent today's numbers.</EmptyState>
          ) : (
            <>
              <div className="c2-bg">
                {banks.data!.groups.map((g) => (
                  <div className={`c2-bgc${g.mine ? ' me' : ''}`} key={g.group}>
                    <div className="c2-bh">
                      <b>{g.group.replace('-', '−')}</b>
                      <span className="c2-muted c2-num">{g.units}</span>
                    </div>
                    <div className="c2-bar" role="img" aria-label={`${g.group} stock ${LEVEL_TEXT[g.level]}`}>
                      <span className={LEVEL_BAR[g.level]} style={{ width: LEVEL_W[g.level] }} />
                    </div>
                    <span className="c2-muted">{LEVEL_TEXT[g.level]}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 14, background: banks.data!.shortGroups.length ? 'var(--danger-bg)' : 'var(--tint-sage)', fontSize: 13 }}>
                <span aria-hidden="true" style={{ color: banks.data!.shortGroups.length ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>{banks.data!.shortGroups.length ? '!' : '✓'}</span>
                <span>
                  {banks.data!.shortGroups.length ? (
                    <>
                      <strong style={{ color: 'var(--ink)' }}>Short this week: {banks.data!.shortGroups.map((g) => g.replace('-', '−')).join(', ')}.</strong>{' '}
                      {d && !banks.data!.shortGroups.includes(d.bloodGroup) ? `Your group (${d.bloodGroup}) is stable. ` : ''}
                    </>
                  ) : (
                    <strong style={{ color: 'var(--ink)' }}>All groups have enough cover. </strong>
                  )}
                  Stock is pooled from {pluralize(banks.data!.bankCount, 'blood bank')}{banks.data!.asOf ? ` and was last updated ${fmtShort(banks.data!.asOf)}, ${fmtTime(banks.data!.asOf)}` : ''}.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="c2-box">
          <div className="c2-bh">
            <h2 className="c2-bt">Before you donate</h2>
            <Button variant="ghost" size="sm" onClick={openChecklist} disabled={!checklist.data}>Update answers</Button>
          </div>
          {checklist.isLoading ? (
            <CardSkeleton lines={3} label="Loading checklist" />
          ) : checklist.isError ? (
            <ErrorBox error={checklist.error} onRetry={() => void checklist.refetch()} />
          ) : checklist.data ? (
            <>
              <dl className="c2-kv">
                <div><dt>Age</dt><dd>{checklist.data.age ?? '—'} · eligible {checklist.data.minAge}–{checklist.data.maxAge}</dd></div>
                <div><dt>Weight</dt><dd>{checklist.data.weightKg ? `${checklist.data.weightKg} kg` : 'Not answered'} · ≥ {checklist.data.minWeightKg} kg</dd></div>
                <div><dt>Diabetes</dt><dd>{checklist.data.diabetesNote}</dd></div>
                <div><dt>Last illness</dt><dd>{checklist.data.illnessNote}</dd></div>
              </dl>
              {checklist.data.reasons.length ? (
                <Alert tone="warning" title="Not eligible right now">{checklist.data.reasons.join(' · ')}</Alert>
              ) : null}
              <Checkbox label="Eat a meal and drink water 2 hours before" defaultChecked />
              <Checkbox label="Carry your ABHA card or show this app" />
              {d?.resting && d.eligibleFrom ? (
                <Link to="/citizen/dates" className="cf-btn cf-btn-secondary cf-btn-sm" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
                  <span className="cf-btn-label">Remind me on {fmtYmdShort(d.eligibleFrom)}</span>
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      <Modal
        open={editList}
        title="Update your answers"
        onClose={() => setEditList(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditList(false)}>Cancel</Button>
            <Button type="submit" form="c2-checklist-form" loading={saveList.isPending}>Save answers</Button>
          </>
        }
      >
        <form id="c2-checklist-form" onSubmit={onSaveChecklist} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField label="Weight (kg)" type="number" inputMode="decimal" min={20} max={250} step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} required />
          <Switch label="I have diabetes" checked={diabetes} onChange={setDiabetes} />
          <Switch label="I take medicines (tablets) for it" checked={tablets} onChange={setTablets} disabled={!diabetes} />
          <Switch label="I was ill in the last 4 weeks" checked={illness} onChange={setIllness} />
          <Checkbox label="I will eat a meal and drink water 2 hours before" checked={meal} onChange={setMeal} />
          <Checkbox label="I will carry my ABHA card or show this app" checked={abha} onChange={setAbha} />
          <p className="c2-muted" style={{ margin: 0 }}>The blood bank's doctor makes the final decision on the day.</p>
        </form>
      </Modal>
      {toast.node}
    </div>
  )
}

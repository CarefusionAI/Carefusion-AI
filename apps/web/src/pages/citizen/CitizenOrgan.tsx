import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { CitizenWitnessInviteResponse } from '@carefusion/shared'
import { Alert, Avatar, Badge, Button, Checkbox, EmptyState, Modal, Select, Skeleton, Stepper, TextField } from '../../components/ui'
import {
  errorText,
  useChooseDesk,
  useInformKin,
  useInviteWitness,
  useOrgan,
  useRemindWitnesses,
  useSetOrgans,
  useSignWitness,
  useWithdrawPledge,
} from '../../api/citizen2'
import { Box, C2Head, CardSkeleton, ErrorBox, Ic, PATHS, fmtLong, fmtShort, useToast } from './c2kit'
import './citizen2.css'

const FACTS = [
  { tone: 'sage' as const, d: PATHS.check, title: 'Only after death is certified', text: 'Brain-stem death is certified by a board of 4 doctors, none from the transplant team.' },
  { tone: 'blue' as const, d: PATHS.plus, title: 'Your family still decides', text: 'Doctors ask your next of kin. A pledge helps them say yes with confidence.' },
  { tone: 'peach' as const, d: PATHS.arrow, title: 'You can withdraw any time', text: 'One tap here, no reason needed. We tell KNOS within 24 hours.' },
  { tone: 'lav' as const, d: PATHS.lock, title: 'No payment, no sale', text: 'Buying or selling organs is a crime. Allocation follows the state waiting list.' },
]

const CHANNELS = [
  { value: 'sms', label: 'SMS link' },
  { value: 'app', label: 'In the app' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'I told them in person' },
]

export default function CitizenOrganScreen() {
  const organ = useOrgan()
  const setOrgans = useSetOrgans()
  const inform = useInformKin()
  const invite = useInviteWitness()
  const sign = useSignWitness()
  const remind = useRemindWitnesses()
  const desk = useChooseDesk()
  const withdraw = useWithdrawPledge()
  const toast = useToast()

  const [sel, setSel] = useState<string[] | null>(null)
  const [kinOpen, setKinOpen] = useState(false)
  const [kinName, setKinName] = useState('')
  const [kinRel, setKinRel] = useState('')
  const [kinChannel, setKinChannel] = useState('sms')
  const [witOpen, setWitOpen] = useState(false)
  const [witName, setWitName] = useState('')
  const [witRel, setWitRel] = useState('')
  const [witRelative, setWitRelative] = useState(false)
  const [link, setLink] = useState<CitizenWitnessInviteResponse | null>(null)
  const [wdOpen, setWdOpen] = useState(false)
  const [deskId, setDeskId] = useState('')

  const o = organ.data
  const pledge = o?.pledge ?? null
  const chosen = sel ?? pledge?.organs ?? []
  const dirty = sel !== null && JSON.stringify([...sel].sort()) !== JSON.stringify([...(pledge?.organs ?? [])].sort())
  const nameOf = (code: string) => o?.organTypes.find((t) => t.code === code)?.name ?? code

  function toggleOrgan(code: string) {
    const cur = chosen
    setSel(cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code])
  }

  function onSaveOrgans() {
    if (chosen.length === 0) {
      toast.show('Choose at least one', 'Pick what you would like to donate, then save.')
      return
    }
    setOrgans.mutate(chosen, {
      onSuccess: () => {
        setSel(null)
        toast.show(pledge ? 'Selection saved' : 'Pledge started', 'Next: tell your family.')
      },
      onError: (e) => toast.show('Could not save', errorText(e)),
    })
  }

  function onKin(e: FormEvent) {
    e.preventDefault()
    inform.mutate(
      { fullName: kinName.trim(), relation: kinRel.trim(), channel: kinChannel as 'sms' | 'app' | 'email' | 'in_person' },
      {
        onSuccess: () => {
          setKinOpen(false)
          setKinName('')
          setKinRel('')
          toast.show('Family informed', 'The link was sent (simulated SMS in the alpha).')
        },
        onError: (er) => toast.show('Could not save', errorText(er)),
      },
    )
  }

  function onWitness(e: FormEvent) {
    e.preventDefault()
    invite.mutate(
      { fullName: witName.trim(), relation: witRel.trim(), isRelative: witRelative },
      {
        onSuccess: (r) => {
          setWitOpen(false)
          setWitName('')
          setWitRel('')
          setWitRelative(false)
          setLink(r.invite)
        },
        onError: (er) => toast.show('Could not invite', errorText(er)),
      },
    )
  }

  function onDesk() {
    const id = deskId || o?.signingDesk?.hospitalId
    if (!id) return
    desk.mutate(id, {
      onSuccess: () => toast.show('Signing desk chosen', 'Take your ABHA card and two witnesses.'),
      onError: (er) => toast.show('Could not save', errorText(er)),
    })
  }

  function onWithdraw() {
    withdraw.mutate(undefined, {
      onSuccess: () => {
        setWdOpen(false)
        setSel(null)
        toast.show('Pledge withdrawn', 'We will tell KNOS within 24 hours (simulated).')
      },
      onError: (er) => {
        setWdOpen(false)
        toast.show('Could not withdraw', errorText(er))
      },
    })
  }

  const status = pledge?.status
  const cardList = chosen.length ? chosen.map(nameOf).join(', ') : 'Nothing selected yet'
  const pendingWitnesses = o?.witnesses.filter((w) => w.status !== 'signed') ?? []
  const earliestExpiry = pendingWitnesses.map((w) => w.linkExpiresAt).filter((x): x is string => !!x).sort()[0]
  const canEdit = o?.canEditOrgans ?? true

  return (
    <div className="c2-page">
      <C2Head
        eyebrow="Give · Organ donation"
        title="Organ & tissue pledge"
        lead="A pledge records your wish. Under the Transplantation of Human Organs and Tissues Act, 1994, your family is still asked for consent at the time — so tell them now."
        actions={
          <>
            <Badge tone={status === 'registered' ? 'success' : pledge ? 'warning' : 'neutral'} dot>
              {pledge ? pledge.stepLabel : 'Step 1 of 4 · choose what to donate'}
            </Badge>
            <Badge tone="outline">KNOS · {o?.stateName ?? 'Kerala'}</Badge>
          </>
        }
      />

      {organ.isLoading ? (
        <>
          <Skeleton height={120} radius={20} />
          <Skeleton height={260} radius={20} />
        </>
      ) : organ.isError ? (
        <ErrorBox error={organ.error} onRetry={() => void organ.refetch()} />
      ) : o ? (
        <>
          <section className="c2-box c2-in c2-d1" aria-label="Pledge progress">
            <Stepper label="Pledge progress" steps={o.steps} current={pledge?.currentStep ?? 0} />
            {!pledge ? (
              <Alert tone="info" title="Step 1: choose what you would like to donate">
                Pick organs and tissues below, then save. Nothing is shared until you finish all four steps.
              </Alert>
            ) : status === 'intent' ? (
              <Alert tone="info" title="Step 2: tell your family" action={<Button size="sm" onClick={() => setKinOpen(true)}>Tell a family member</Button>}>
                Your next of kin is asked at the time, so say it out loud now. We send them a link to acknowledge.
              </Alert>
            ) : status === 'family_informed' || status === 'signing' ? (
              <Alert tone="warning" title="Last step: sign at a registered hospital">
                Take your ABHA card to {o.signingDesk?.hospitalName ?? 'the hospital'} ({o.signingDesk?.where} · {o.signingDesk?.hours}). Two witnesses sign with you.
              </Alert>
            ) : status === 'registered' ? (
              <Alert tone="success" title="Your pledge is registered">
                {pledge.knosStatus === 'registered' ? `KNOS reference ${pledge.knosRef ?? 'on file'}.` : 'Waiting for KNOS to confirm the registration.'}
              </Alert>
            ) : null}
          </section>

          <section className="c2-grid c2-wide c2-in c2-d2">
            <div className="c2-box">
              <div className="c2-bh">
                <h2 className="c2-bt">What you'd like to donate</h2>
                <span className="c2-muted c2-num">{chosen.length} selected</span>
              </div>
              <div className="c2-og" role="group" aria-label="Organs and tissues">
                {o.organTypes.map((t) => {
                  const on = chosen.includes(t.code)
                  return (
                    <button key={t.code} type="button" className={`c2-org${on ? ' on' : ''}`} aria-pressed={on} disabled={!canEdit} onClick={() => toggleOrgan(t.code)}>
                      <span className={`c2-chk${on ? ' on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</span>
                      <span className="c2-grow">
                        <span className="c2-nm" style={{ display: 'block' }}>{t.name}</span>
                        <span className="c2-muted">{t.note}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button variant="soft" size="sm" disabled={!canEdit} onClick={() => setSel(o.organTypes.map((t) => t.code))}>Select all</Button>
                <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => setSel([])}>Clear</Button>
                <Button size="sm" onClick={onSaveOrgans} disabled={!canEdit || (pledge !== null && !dirty) || chosen.length === 0} loading={setOrgans.isPending}>
                  {pledge ? 'Save selection' : 'Start my pledge'}
                </Button>
                {!canEdit ? <span className="c2-muted">A registered pledge is locked. Withdraw it to change the selection.</span> : null}
              </div>
              <Checkbox label="Also donate my body for medical education" description="Not recorded in the alpha. A body-donation form is signed at the medical college." disabled />
            </div>

            <div className="c2-stack">
              <div className="c2-card c2-float" role="group" aria-label="Donor card preview">
                <svg aria-hidden="true" viewBox="0 0 64 64" width="190" height="190" style={{ position: 'absolute', right: -40, bottom: -50, opacity: 0.14 }}>
                  <rect x="21" y="5" width="18" height="50" rx="9" fill="#faf5ef" />
                  <rect x="9" y="25" width="50" height="18" rx="9" fill="#faf5ef" />
                </svg>
                <div className="c2-bh">
                  <span className="lbl">Organ donor card</span>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d2b277" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={PATHS.heart} />
                  </svg>
                </div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, lineHeight: '30px' }}>{o.card.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><div className="lbl">ABHA</div><div className="v c2-mono">{o.card.abhaNumber ?? '—'}</div></div>
                  <div><div className="lbl">Blood</div><div className="v">{o.card.bloodGroup}</div></div>
                  <div style={{ gridColumn: 'span 2' }}><div className="lbl">Pledged</div><div className="v">{cardList}</div></div>
                  <div style={{ gridColumn: 'span 2' }}><div className="lbl">Call family</div><div className="v">{o.card.callFamily ?? 'Add an emergency contact in Profile'}</div></div>
                </div>
              </div>
              <Link to="/citizen/documents" className="cf-btn cf-btn-secondary cf-btn-md" style={{ textDecoration: 'none' }}>
                <span className="cf-btn-label">Save card to wallet (PDF)</span>
              </Link>
              <div className="c2-box" style={{ gap: 10 }}>
                <h2 className="c2-bt" style={{ margin: 0 }}>Pledges in {o.stateName}</h2>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 28, lineHeight: '34px', fontWeight: 600, color: 'var(--ink-strong)' }}>{o.statePledges.toLocaleString('en-IN')}</span>
                  <span className="c2-muted">people have pledged · demo figure</span>
                </div>
                <div className="c2-bar" role="img" aria-label="64 percent of the demo target"><span style={{ width: '64%' }} /></div>
                <span className="c2-muted">Each donor can help up to 8 people. Your pledge stays private until it is needed.</span>
              </div>
            </div>
          </section>

          <section className="c2-grid c2-g2 c2-in c2-d3">
            <div className="c2-box">
              <div className="c2-bh">
                <h2 className="c2-bt">Family & witnesses</h2>
                <Link to="/citizen/profile" className="c2-lk">Edit contacts</Link>
              </div>
              {!pledge ? (
                <EmptyState title="Start your pledge first">Family and witnesses are added after you choose what to donate.</EmptyState>
              ) : (
                <>
                  <div>
                    {o.nextOfKin.map((k) => (
                      <div className="c2-row" key={k.id}>
                        <Avatar name={k.fullName} size={40} />
                        <div className="c2-grow">
                          <div className="c2-nm">{k.fullName} · {k.relation}</div>
                          <div className="c2-muted">
                            Next of kin{k.notifiedAt ? ` · informed ${fmtShort(k.notifiedAt)} by ${CHANNELS.find((c) => c.value === k.channel)?.label.toLowerCase() ?? k.channel}` : ''}
                          </div>
                        </div>
                        <Badge tone={k.status === 'acknowledged' ? 'success' : 'warning'}>{k.status === 'acknowledged' ? 'Acknowledged' : k.status === 'informed' ? 'Waiting' : 'Not sent'}</Badge>
                      </div>
                    ))}
                    {o.witnesses.map((w, i) => (
                      <div className="c2-row" key={w.id}>
                        <Avatar name={w.fullName} size={40} />
                        <div className="c2-grow">
                          <div className="c2-nm">{w.fullName} · {w.relation}</div>
                          <div className="c2-muted">Witness {i + 1} · {w.isRelative ? 'relative' : 'not a relative'}</div>
                        </div>
                        {w.status === 'signed' ? (
                          <Badge tone="success">Signed</Badge>
                        ) : (
                          <>
                            <Badge tone={w.status === 'expired' ? 'danger' : 'warning'}>{w.status === 'expired' ? 'Link expired' : 'Signing pending'}</Badge>
                            {status !== 'registered' ? (
                              <Button size="sm" variant="ghost" loading={sign.isPending && sign.variables === w.id} onClick={() => sign.mutate(w.id, { onSuccess: () => toast.show('Witness signed (demo)', `${w.fullName} signature recorded.`), onError: (er) => toast.show('Could not sign', errorText(er)) })} aria-label={`Demo: mark ${w.fullName} as signed`}>
                                Mark signed (demo)
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    ))}
                    {o.nextOfKin.length + o.witnesses.length === 0 ? (
                      <EmptyState title="Nobody added yet">Tell a family member, then invite two witnesses.</EmptyState>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button variant="soft" size="sm" onClick={() => setKinOpen(true)}>Tell a family member</Button>
                    <Button variant="soft" size="sm" onClick={() => setWitOpen(true)} disabled={status === 'registered' || o.witnesses.length >= 3}>Add a witness</Button>
                    <Button variant="ghost" size="sm" disabled={pendingWitnesses.length === 0 || remind.isPending} loading={remind.isPending} onClick={() => remind.mutate(undefined, { onSuccess: (r) => toast.show('Reminder sent', `${r.reminded} witness link${r.reminded === 1 ? '' : 's'} renewed for 7 days (simulated SMS).`), onError: (er) => toast.show('Could not send', errorText(er)) })}>
                      Send reminder to witnesses
                    </Button>
                  </div>
                  {status === 'family_informed' || status === 'signing' ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 220px' }}>
                        <Select label="Where will you sign?" options={o.hospitals.map((h) => ({ value: h.id, label: h.name }))} value={deskId || pledge.hospital?.id || o.signingDesk?.hospitalId || ''} onChange={setDeskId} />
                      </div>
                      <Button size="sm" variant="secondary" onClick={onDesk} loading={desk.isPending}>Choose this desk</Button>
                    </div>
                  ) : null}
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <div className="c2-bh">
                      <span className="c2-nm">Witness signatures</span>
                      <span className="c2-muted">{o.signedWitnesses} of 2 signed</span>
                    </div>
                    <div className="c2-bar" role="img" aria-label={`${o.signedWitnesses} of 2 witnesses have signed`}>
                      <span style={{ width: `${Math.min(100, o.signedWitnesses * 50)}%` }} />
                    </div>
                    <p className="c2-muted" style={{ margin: 0 }}>
                      Under the Transplantation of Human Organs Act, two witnesses sign — one must be a close relative.
                      {o.signedWitnesses >= 2 && !o.hasRelativeWitness ? ' You still need a relative to sign.' : ''}
                      {earliestExpiry ? ` The next link expires on ${fmtShort(earliestExpiry)}.` : ''}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="c2-box">
              <div className="c2-bh"><h2 className="c2-bt">What the pledge means</h2></div>
              {FACTS.map((f) => (
                <div className="c2-fact" key={f.title}>
                  <Ic tone={f.tone} d={f.d} />
                  <div>
                    <b>{f.title}</b>
                    <div className="c2-muted">{f.text}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link to="/citizen/ai-chat" className="cf-btn cf-btn-ai cf-btn-sm" style={{ textDecoration: 'none' }}>
                  <span className="cf-btn-label">Ask the AI a question</span>
                </Link>
                {pledge ? <Button variant="ghost" size="sm" onClick={() => setWdOpen(true)}>Withdraw pledge</Button> : null}
              </div>
              {pledge?.status === 'registered' ? null : <p className="c2-muted" style={{ margin: 0 }}>Pledged {pledge ? fmtLong(pledge.pledgedAt) : ''}</p>}
            </div>
          </section>
        </>
      ) : null}

      <Modal open={kinOpen} title="Tell a family member" onClose={() => setKinOpen(false)} footer={<><Button variant="secondary" onClick={() => setKinOpen(false)}>Cancel</Button><Button type="submit" form="c2-kin-form" loading={inform.isPending}>Send link</Button></>}>
        <form id="c2-kin-form" onSubmit={onKin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField label="Full name" value={kinName} onChange={(e) => setKinName(e.target.value)} required minLength={2} />
          <TextField label="Relation" value={kinRel} onChange={(e) => setKinRel(e.target.value)} placeholder="e.g. husband, mother" required minLength={2} />
          <Select label="How should we tell them?" options={CHANNELS} value={kinChannel} onChange={setKinChannel} />
          <p className="c2-muted" style={{ margin: 0 }}>Messages are simulated in the alpha. Use demo names only.</p>
        </form>
      </Modal>

      <Modal open={witOpen} title="Add a witness" onClose={() => setWitOpen(false)} footer={<><Button variant="secondary" onClick={() => setWitOpen(false)}>Cancel</Button><Button type="submit" form="c2-wit-form" loading={invite.isPending}>Create signing link</Button></>}>
        <form id="c2-wit-form" onSubmit={onWitness} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField label="Full name" value={witName} onChange={(e) => setWitName(e.target.value)} required minLength={2} />
          <TextField label="Relation" value={witRel} onChange={(e) => setWitRel(e.target.value)} placeholder="e.g. mother, neighbour" required minLength={2} />
          <Checkbox label="Close relative" description="At least one of the two witnesses must be a close relative." checked={witRelative} onChange={setWitRelative} />
        </form>
      </Modal>

      <Modal open={link !== null} title="Signing link created" size="sm" onClose={() => setLink(null)} footer={<Button onClick={() => setLink(null)}>Done</Button>}>
        {link ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0 }}>{link.witness.fullName} gets this link by SMS (simulated). It works for 7 days.</p>
            <code className="c2-mono" style={{ wordBreak: 'break-all', padding: 10, borderRadius: 12, background: 'var(--surface)' }}>{link.signingLink}</code>
            <p className="c2-muted" style={{ margin: 0 }}>Only a hash of the link is stored. In the demo you can use "Mark signed (demo)" next to the witness.</p>
          </div>
        ) : null}
      </Modal>

      <Modal open={wdOpen} title="Withdraw your pledge?" size="sm" onClose={() => setWdOpen(false)} footer={<><Button variant="secondary" onClick={() => setWdOpen(false)}>Keep my pledge</Button><Button variant="danger" onClick={onWithdraw} loading={withdraw.isPending}>Withdraw pledge</Button></>}>
        <p>No reason needed. KNOS is told within 24 hours (simulated in the alpha). You can pledge again any time.</p>
      </Modal>
      {toast.node}
    </div>
  )
}

export { CardSkeleton }

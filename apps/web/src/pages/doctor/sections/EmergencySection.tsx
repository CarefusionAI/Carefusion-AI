import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Checkbox, Select, Textarea, TextField } from '../../../components/ui'
import type { BadgeTone } from '../../../components/ui'
import { useBreakGlass, useColleagues, useEmergencyCard, useEmergencyInfo, useEmergencyLookup, useEndSession, useUnidentified } from '../../../api/doctor'
import type { BreakGlassRequest, DoctorSessionInfo } from '../../../api/doctor'
import { useCountdown, useDoctorSession } from '../session'
import { Box, ConfirmModal, ErrorNote, Header, Kv, Loading, Row, SectionLink, sectionHref } from '../parts'
import { fmtClock, fmtDayTime } from '../format'

const REVIEW: Record<string, BadgeTone> = { ok: 'success', cleared: 'success', pending: 'warning', flagged: 'danger' }
const MATCH = [
  { value: '', label: 'Not matched' },
  { value: 'face', label: 'Face' },
  { value: 'fingerprint', label: 'Fingerprint' },
  { value: 'face_and_fingerprint', label: 'Face and fingerprint' },
  { value: 'aadhaar_biometric', label: 'Aadhaar biometric' },
  { value: 'manual', label: 'Manual identification' },
]

function ActiveBreakGlass({ session }: { session: DoctorSessionInfo }) {
  const left = useCountdown(session.expiresAt)
  const end = useEndSession()
  const { setActiveId } = useDoctorSession()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  return (
    <section className="dr-crit" aria-live="polite" aria-label="Emergency session active">
      <div className="dr-between">
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontWeight: 700, color: 'var(--danger)' }}>
          <span className="dr-live red" aria-hidden="true" />
          Emergency session active
        </span>
        <span className="dr-timer" style={{ color: 'var(--danger)' }}>
          {fmtClock(left)}
        </span>
      </div>
      <p style={{ margin: 0 }}>
        Record of <strong>{session.patient.name}</strong> is open, read-only. The hospital admin and the patient's emergency contact have been notified.
      </p>
      <div className="dr-wrap">
        <Button
          variant="secondary"
          onClick={() => {
            setActiveId(session.sessionId)
            navigate(sectionHref('session'))
          }}
        >
          Open the record
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          End emergency session
        </Button>
      </div>
      <ConfirmModal
        open={confirm}
        title="End the emergency session?"
        onClose={() => setConfirm(false)}
        onConfirm={() => end.mutate(session.sessionId, { onSuccess: () => setConfirm(false) })}
        confirmLabel="End emergency session"
        danger
        busy={end.isPending}
        error={end.error}
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          The record closes immediately. The access stays on the audit trail and is still reviewed by the hospital admin and district. To read the record again you would need to break the glass again.
        </p>
      </ConfirmModal>
    </section>
  )
}

export default function EmergencySection() {
  const info = useEmergencyInfo()
  const unid = useUnidentified()
  const colleagues = useColleagues()
  const lookup = useEmergencyLookup()
  const bg = useBreakGlass()
  const { live, setActiveId } = useDoctorSession()
  const navigate = useNavigate()

  const [source, setSource] = useState<'unidentified' | 'abha'>('unidentified')
  const [abha, setAbha] = useState('')
  const [picked, setPicked] = useState<{ personId: string; label: string } | null>(null)
  const [showCard, setShowCard] = useState(false)
  const card = useEmergencyCard(showCard && picked ? picked.personId : null)
  const [category, setCategory] = useState<BreakGlassRequest['reasonCategory'] | ''>('')
  const [reason, setReason] = useState('')
  const [secondId, setSecondId] = useState('')
  const [method, setMethod] = useState('')
  const [evidence, setEvidence] = useState('')
  const [agree, setAgree] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const min = info.data?.minReasonLength ?? 20
  const windowMin = info.data?.windowMinutes ?? 15
  const activeBg = live.filter((s) => s.mode === 'break_glass')

  function choose(p: { personId: string; label: string } | null) {
    setPicked(p)
    setShowCard(false)
  }
  function doLookup(e: FormEvent) {
    e.preventDefault()
    if (!abha.trim()) return
    lookup.mutate(abha.trim(), { onSuccess: (r) => choose({ personId: r.personId, label: `${r.patient.name} (${r.patient.abhaNumber ?? 'ABHA'})` }) })
  }
  function review(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!picked) return setFormError('Choose the patient first.')
    if (!category) return setFormError('Pick a reason.')
    if (reason.trim().length < min) return setFormError(`Write at least ${min} characters of clinical justification (${reason.trim().length} so far).`)
    if (!secondId) return setFormError('Pick a second doctor who confirms the emergency.')
    if (!agree) return setFormError('Tick the box to confirm you understand this access is reviewed.')
    setConfirm(true)
  }
  function go() {
    if (!picked || !category) return
    bg.mutate(
      {
        patientPersonId: picked.personId,
        reasonCategory: category,
        reason: reason.trim(),
        secondDoctorUserId: secondId,
        matchMethod: (method || undefined) as BreakGlassRequest['matchMethod'],
        evidenceNote: evidence.trim() || undefined,
      },
      {
        onSuccess: (s) => {
          setConfirm(false)
          setActiveId(s.sessionId)
          navigate(sectionHref('session'))
        },
      },
    )
  }

  return (
    <div className="dr-page">
      <Header title="Emergency access" subtitle="Break-glass opens a patient's record without their key. Use it only when they can't consent." />
      {activeBg.map((s) => (
        <ActiveBreakGlass key={s.sessionId} session={s} />
      ))}

      <section className="dr-grid dr-s21">
        <form className="dr-stack" onSubmit={review} noValidate>
          <Box title="Request emergency access" actions={<Badge tone="danger">Audited</Badge>}>
            {info.isLoading ? <Loading /> : null}
            <ErrorNote error={info.error} title="Could not load the emergency rules" />
            {info.data && !info.data.enabled ? <Alert tone="warning" title="Emergency access is switched off">An administrator has disabled break-glass.</Alert> : null}

            <div className="dr-seg" role="group" aria-label="How to find the patient">
              <button type="button" className={source === 'unidentified' ? 'on' : ''} aria-pressed={source === 'unidentified'} onClick={() => setSource('unidentified')}>
                Unidentified patient
              </button>
              <button type="button" className={source === 'abha' ? 'on' : ''} aria-pressed={source === 'abha'} onClick={() => setSource('abha')}>
                Look up by ABHA
              </button>
            </div>

            {source === 'unidentified' ? (
              <div className="dr-stack" style={{ gap: 8 }} role="radiogroup" aria-label="Unidentified patients">
                {unid.isLoading ? <Loading lines={2} /> : null}
                {(unid.data ?? []).length === 0 && unid.data ? <p className="dr-muted">No unidentified patients registered.</p> : null}
                {(unid.data ?? []).map((u) => (
                  <button key={u.personId} type="button" role="radio" aria-checked={picked?.personId === u.personId} className={`dr-pick${picked?.personId === u.personId ? ' on' : ''}`} onClick={() => choose({ personId: u.personId, label: u.label })}>
                    <span className="dr-row-main">
                      <strong className="dr-strong">{u.label}</strong>
                      <span className="dr-muted" style={{ display: 'block' }}>
                        Registered {fmtDayTime(u.registeredAt)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="dr-stack" style={{ gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <TextField label="ABHA number" value={abha} onChange={(e) => setAbha(e.target.value)} placeholder="DEMO-0000-1234" autoComplete="off" />
                  </div>
                  <Button type="button" variant="secondary" loading={lookup.isPending} disabled={!abha.trim()} onClick={doLookup}>
                    Look up
                  </Button>
                </div>
                <ErrorNote error={lookup.error} title="No match" />
              </div>
            )}

            {picked ? (
              <div className="dr-stack" style={{ padding: 12, borderRadius: 14, background: 'var(--surface)' }}>
                <div className="dr-between">
                  <strong className="dr-strong">Selected: {picked.label}</strong>
                  <button type="button" className="dr-link" onClick={() => choose(null)}>
                    Change
                  </button>
                </div>
                {!showCard ? (
                  <div>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setShowCard(true)}>
                      Show emergency card (logged)
                    </Button>
                  </div>
                ) : card.isLoading ? (
                  <Loading lines={2} />
                ) : card.data ? (
                  <>
                    <Kv
                      items={[
                        { label: 'Blood group', value: card.data.bloodGroup ?? 'unknown' },
                        { label: 'Allergies', value: card.data.allergies.map((a) => a.substance).join(', ') || 'None recorded' },
                        { label: 'Conditions', value: card.data.conditions.map((c) => c.name).join(', ') || 'None recorded' },
                        { label: 'Contact', value: card.data.emergencyContacts[0] ? `${card.data.emergencyContacts[0].relation}` : 'None recorded' },
                      ]}
                    />
                    <p className="dr-muted" style={{ margin: 0 }}>{card.data.note}</p>
                  </>
                ) : (
                  <ErrorNote error={card.error} title="No emergency card" />
                )}
              </div>
            ) : null}

            <Select
              label="Reason"
              required
              placeholder="Choose a reason"
              value={category}
              onChange={(v) => setCategory(v as BreakGlassRequest['reasonCategory'])}
              options={(info.data?.reasonCategories ?? []).map((r) => ({ value: r.code, label: r.label }))}
            />
            <Textarea
              label="Clinical justification"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="What's happening and why you need the record now"
              helper={`At least ${min} characters (${reason.trim().length} so far).`}
            />
            <Select
              label="Second doctor who confirms the emergency"
              required
              placeholder={colleagues.isLoading ? 'Loading…' : 'Choose a doctor'}
              value={secondId}
              onChange={setSecondId}
              options={(colleagues.data ?? []).map((c) => ({ value: c.userId, label: `${c.name} (${c.specialisation})` }))}
            />
            <Select label="How was the patient matched?" optional value={method} onChange={setMethod} options={MATCH} />
            <Textarea label="Evidence note" optional value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={2} maxLength={1000} />
            <Checkbox
              label={`I understand this access is read-only for ${windowMin} minutes and is reviewed by the hospital admin and district`}
              checked={agree}
              onChange={setAgree}
            />
            {formError ? (
              <Alert tone="danger" title="Check the request">
                {formError}
              </Alert>
            ) : null}
            <div>
              <Button type="submit" variant="danger" size="lg" disabled={info.data?.enabled === false}>
                Break glass · {windowMin} minutes
              </Button>
            </div>
          </Box>
        </form>

        <div className="dr-col">
          <Box title="What happens">
            <div className="dr-tl">
              <div className="it">
                <strong className="dr-strong">{windowMin}-minute read-only window</strong>
                <div className="dr-muted">Allergies, blood group, medicines, conditions first. No prescribing or ordering.</div>
              </div>
              <div className="it">
                <strong className="dr-strong">Everyone is told</strong>
                <div className="dr-muted">{(info.data?.notified ?? ['Patient', 'Emergency contact', 'Hospital admin']).join(', ')}.</div>
              </div>
              <div className="it">
                <strong className="dr-strong">Reviewed afterwards</strong>
                <div className="dr-muted">{info.data?.reviewChain ?? 'Hospital admin, then district.'} Misuse can suspend your account.</div>
              </div>
            </div>
            <h3 className="dr-strong" style={{ margin: '6px 0 0' }}>
              Your last uses
            </h3>
            {(info.data?.lastUses ?? []).length === 0 ? <p className="dr-muted">None.</p> : null}
            {(info.data?.lastUses ?? []).map((u) => (
              <Row
                key={u.sessionId}
                title={`${fmtDayTime(u.at)} · ${u.reasonCategory.replace(/_/g, ' ')}`}
                sub={u.reason}
                right={
                  <Badge tone={REVIEW[(u.hospitalReview ?? 'pending').toLowerCase()] ?? 'neutral'}>
                    {u.hospitalReview ? `Hospital: ${u.hospitalReview}` : 'Not yet reviewed'}
                  </Badge>
                }
              />
            ))}
          </Box>
          <Box title="Use it when" tone="peach">
            <p className="dr-muted" style={{ margin: 0 }}>
              Use it for an unconscious or confused patient with no relative holding the key, or when life is threatened and minutes matter. Do not use it if the patient is awake and simply forgot their phone: ask them to sign in at the help desk, or use their key under <SectionLink section="open">Open patient</SectionLink>.
            </p>
          </Box>
        </div>
      </section>

      <ConfirmModal
        open={confirm}
        title="Break the glass?"
        onClose={() => setConfirm(false)}
        onConfirm={go}
        confirmLabel={`Break glass for ${windowMin} minutes`}
        danger
        busy={bg.isPending}
        error={bg.error}
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          You are opening the record of <strong>{picked?.label}</strong> without the patient's consent. It is read-only for {windowMin} minutes.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
          <li>The patient, their emergency contact and the hospital admin are told straight away.</li>
          <li>Your reason and your second doctor are written to the audit trail.</li>
          <li>The access is reviewed by the hospital admin and then the district. Misuse can lead to suspension.</li>
        </ul>
      </ConfirmModal>
    </div>
  )
}

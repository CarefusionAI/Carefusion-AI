import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Avatar, Badge, Button, Checkbox, Textarea } from '../../../components/ui'
import type { BadgeTone } from '../../../components/ui'
import { DoctorApiError, useOpenSession, useQueue, useSessions } from '../../../api/doctor'
import type { OpenSessionRequest } from '../../../api/doctor'
import { useDoctorSession } from '../session'
import { Box, ErrorNote, Header, Kv, Row, SectionLink, sectionHref } from '../parts'
import { fmtDayTime } from '../format'

const TONE: Record<string, BadgeTone> = { success: 'success', danger: 'danger', warning: 'warning', info: 'info', neutral: 'neutral' }

function getPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser cannot share a location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => reject(new Error('Could not read your location. Untick the location check to continue without it.')),
      { timeout: 10000, maximumAge: 60000 },
    )
  })
}

export default function OpenPatientSection() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const visitId = params.get('visit') ?? undefined
  const open = useOpenSession()
  const queue = useQueue()
  const sessions = useSessions()
  const { setActiveId, active } = useDoctorSession()

  const [mode, setMode] = useState<'key' | 'qr'>('key')
  const [keyText, setKeyText] = useState('')
  const [abhaText, setAbhaText] = useState('')
  const [qrText, setQrText] = useState('')
  const [checkLocation, setCheckLocation] = useState(false)
  const [needReason, setNeedReason] = useState(false)
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busyLocation, setBusyLocation] = useState(false)

  const linked = queue.data?.queue.find((q) => q.visitId === visitId)
  const waiting = (queue.data?.queue ?? []).filter((q) => q.status === 'checked_in' || q.status === 'waiting')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    let key: string
    let patientAbha: string | undefined
    if (mode === 'key') {
      patientAbha = abhaText.trim()
      if (patientAbha.length < 4) {
        setFormError('Enter the patient\'s ABHA number, as well as the 6-digit key.')
        return
      }
      const digits = keyText.replace(/\D/g, '')
      if (digits.length !== 6) {
        setFormError('Enter all 6 digits of the patient\'s key.')
        return
      }
      key = digits
    } else {
      key = qrText.trim()
      if (!/^cfkey:v1:/.test(key)) {
        setFormError('Paste the full QR text. It starts with cfkey:v1:')
        return
      }
    }
    const body: OpenSessionRequest = { key, visitId: linked?.visitId, ...(patientAbha ? { patientAbha } : {}) }
    if (checkLocation) {
      setBusyLocation(true)
      try {
        Object.assign(body, await getPosition())
      } catch (err) {
        setBusyLocation(false)
        setFormError(err instanceof Error ? err.message : 'Could not read your location.')
        return
      }
      setBusyLocation(false)
    }
    if (needReason) {
      if (reason.trim().length < 10) {
        setFormError('Write at least 10 characters explaining why you are opening this record outside the hospital.')
        return
      }
      body.reason = reason.trim()
    }
    open.mutate(body, {
      onSuccess: (s) => {
        setActiveId(s.sessionId)
        navigate(sectionHref('session'))
      },
      onError: (err) => {
        if (err instanceof DoctorApiError && /outside the hospital/i.test(err.message)) setNeedReason(true)
      },
    })
  }

  const recent = (sessions.data?.recent ?? []).slice(0, 4)

  return (
    <div className="dr-page">
      <Header title="Open a patient record" subtitle="Ask the patient for the 6-digit key on their phone. It changes every 10 seconds and works once." />
      {active ? (
        <Alert tone="info" title="A patient session is already open">
          {active.patient.name} is open. <SectionLink section="session">Go to the session</SectionLink>
        </Alert>
      ) : null}
      <section className="dr-grid dr-g2">
        <Box title="Patient's key">
          <form onSubmit={submit} className="dr-stack" style={{ gap: 18 }} noValidate>
            <div className="dr-seg" role="group" aria-label="How the key is given">
              <button type="button" className={mode === 'key' ? 'on' : ''} aria-pressed={mode === 'key'} onClick={() => setMode('key')}>
                6-digit key
              </button>
              <button type="button" className={mode === 'qr' ? 'on' : ''} aria-pressed={mode === 'qr'} onClick={() => setMode('qr')}>
                QR code text
              </button>
            </div>

            {mode === 'key' ? (
              <div>
                <label className="dr-lab" htmlFor="pabha">
                  Patient's ABHA number
                </label>
                <input
                  id="pabha"
                  className="dr-keyin"
                  style={{ fontSize: 16, letterSpacing: 0, marginBottom: 14 }}
                  autoComplete="off"
                  maxLength={40}
                  placeholder="DEMO-0000-1234"
                  value={abhaText}
                  onChange={(e) => setAbhaText(e.target.value)}
                />
                <label className="dr-lab" htmlFor="pkey">
                  Patient's key
                </label>
                <input
                  id="pkey"
                  className="dr-keyin"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="••• •••"
                  value={keyText}
                  onChange={(e) => setKeyText(e.target.value.replace(/[^\d ]/g, ''))}
                  aria-describedby="pkey-help"
                />
                <p id="pkey-help" className="dr-muted" style={{ margin: '8px 0 0' }}>
                  Ask the patient for their ABHA number and the current key (demo patient: DEMO-0000-1234, key on their Share and access screen). A session lasts 30 minutes and is logged to the patient.
                </p>
              </div>
            ) : (
              <div>
                <Textarea
                  label="QR text from the patient's phone"
                  value={qrText}
                  onChange={(e) => setQrText(e.target.value)}
                  rows={2}
                  placeholder="cfkey:v1:…"
                  helper="Camera scanning is not available in the alpha. Paste the QR text instead."
                />
              </div>
            )}

            {linked ? (
              <Alert tone="info" title={`Opening for token ${linked.token}`}>
                {linked.patientName} &middot; {linked.meta}. The session is linked to this OP visit.{' '}
                <button type="button" className="dr-link" onClick={() => navigate(sectionHref('open'))}>
                  Remove link
                </button>
              </Alert>
            ) : null}

            <Checkbox
              label="Check my location against the hospital"
              description="Optional. If you are outside the hospital you must give a reason."
              checked={checkLocation}
              onChange={setCheckLocation}
            />

            {needReason ? (
              <Alert tone="warning" title="You are outside the hospital">
                Opening a record from outside needs a reason. It is shown to the patient and to the hospital admin.
              </Alert>
            ) : null}
            {needReason ? (
              <Textarea
                label="Reason for opening outside the hospital"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                helper="At least 10 characters."
              />
            ) : null}

            {formError ? (
              <Alert tone="danger" title="Check the key">
                {formError}
              </Alert>
            ) : null}
            <ErrorNote error={open.error} title="Could not open the record" />

            <Button type="submit" size="lg" fullWidth loading={open.isPending || busyLocation}>
              Open 30-minute session
            </Button>
            <div className="dr-wrap">
              <span className="dr-muted">Patient unconscious or can't share?</span>
              <SectionLink section="emergency">Use emergency access</SectionLink>
            </div>
          </form>

          <div className="dr-stack" style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div className="dr-between">
              <h3 className="dr-strong" style={{ margin: 0 }}>
                Checked in and waiting
              </h3>
              <SectionLink section="schedule">Schedule</SectionLink>
            </div>
            {waiting.length === 0 ? <p className="dr-muted">No one is waiting right now.</p> : null}
            {waiting.map((q) => (
              <Row
                key={q.visitId}
                tok={q.token}
                tone={q.priority === 'normal' ? 'blue' : 'peach'}
                title={q.patientName}
                sub={q.meta}
                right={
                  <div className="dr-wrap">
                    <Badge tone={TONE[q.tone] ?? 'neutral'}>{q.statusLabel}</Badge>
                    <button type="button" className="dr-link" onClick={() => navigate(sectionHref('open', { visit: q.visitId }))} aria-label={`Link ${q.patientName} to this session`}>
                      Use
                    </button>
                  </div>
                }
              />
            ))}
            <Kv items={[{ label: 'Session length', value: '30 minutes' }, { label: 'Where it works', value: 'Inside your hospital' }]} />
          </div>
        </Box>

        <Box title="How the key works">
          <div className="dr-tl">
            <div className="it">
              <strong className="dr-strong">Patient shows key</strong>
              <div className="dr-muted">On their Home screen. Rotating, single use.</div>
            </div>
            <div className="it">
              <strong className="dr-strong">You get 30 minutes</strong>
              <div className="dr-muted">Read records, run AI tools, prescribe, order tests.</div>
            </div>
            <div className="it">
              <strong className="dr-strong">Patient sees everything</strong>
              <div className="dr-muted">Each file you open appears in their access log.</div>
            </div>
            <div className="it">
              <strong className="dr-strong">Session ends</strong>
              <div className="dr-muted">Timer runs out, you end it, or the patient ends it.</div>
            </div>
          </div>
          <h3 className="dr-strong" style={{ margin: '6px 0 0' }}>
            Recent sessions
          </h3>
          {recent.length === 0 ? <p className="dr-muted">No sessions yet.</p> : null}
          {recent.map((s) => (
            <div className="dr-row" key={s.sessionId}>
              <Avatar name={s.patient.name} size={32} />
              <div className="dr-row-main">
                <strong className="dr-strong">{s.patient.name}</strong>
                <div className="dr-muted">
                  {fmtDayTime(s.startedAt)} &middot; {s.endedBy ? `ended by ${s.endedBy}` : s.live ? 'live' : 'ended'}
                </div>
              </div>
            </div>
          ))}
          <div className="dr-tip">
            <span aria-hidden="true">i</span>
            <span>Keys change every 10 seconds and work once, only inside a registered hospital. If a key fails twice, ask the patient to refresh it on their phone.</span>
          </div>
        </Box>
      </section>
    </div>
  )
}

import { useState } from 'react'
import { Alert, Avatar, Badge } from '../../../../components/ui'
import { useEndSession } from '../../../../api/doctor'
import type { DoctorSessionInfo } from '../../../../api/doctor'
import { ConfirmModal } from '../../parts'
import { fmtClock, sexLetter } from '../../format'

function warnEnabled(): boolean {
  try {
    return window.localStorage.getItem('cf-doctor-warn-5min') !== 'off'
  } catch {
    return true
  }
}

export default function SessionBanner({
  session,
  secondsLeft,
  totalSeconds,
}: {
  session: DoctorSessionInfo
  secondsLeft: number
  totalSeconds: number
}) {
  const [confirm, setConfirm] = useState(false)
  const end = useEndSession()
  const bg = session.mode === 'break_glass'
  const p = session.patient
  const ratio = Math.min(1, Math.max(0, secondsLeft / totalSeconds))
  const low = secondsLeft <= 300
  const totalLabel = fmtClock(totalSeconds)

  return (
    <>
      <section className={bg ? 'dr-sess bg' : 'dr-sess'} aria-label={bg ? 'Active emergency session' : 'Active patient session'}>
        <Avatar name={p.name} size={52} tone="peach" />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <strong style={{ fontSize: 20 }}>{p.name}</strong>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            {sexLetter(p.sex)} &middot; {p.age ?? '?'} &middot; {p.bloodGroup}
            {p.abhaNumber ? ` · ABHA ${p.abhaNumber}` : ''}
            {p.district ? ` · ${p.district}` : ''}
          </div>
        </div>
        <div>
          <div className={low ? 'dr-timer low' : 'dr-timer'} aria-live="off">
            {fmtClock(secondsLeft)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>left of {totalLabel}</div>
        </div>
        <div className="dr-tbar" role="progressbar" aria-label="Session time left" aria-valuemin={0} aria-valuemax={totalSeconds} aria-valuenow={secondsLeft}>
          <span style={{ transform: `scaleX(${ratio})` }} />
        </div>
        <button type="button" className="dr-topbtn bad" onClick={() => setConfirm(true)}>
          End session
        </button>
      </section>

      {bg ? (
        <Alert tone="danger" title="Emergency (break-glass) session: read-only">
          You can read this record for {totalLabel.split(':')[0]} minutes. You cannot prescribe, order or refer from here. The patient, their emergency contact and the hospital admin have been told.
        </Alert>
      ) : null}
      {!bg && secondsLeft > 0 && secondsLeft <= 300 && warnEnabled() ? (
        <Alert tone="warning" title="Less than 5 minutes left">
          The session closes automatically at zero. Finish prescriptions and orders now, or ask the patient for a new key.
        </Alert>
      ) : null}
      {session.hiddenByPatient.length ? (
        <p className="dr-muted" style={{ margin: 0 }}>
          <Badge tone="neutral">Hidden by the patient</Badge> {session.hiddenByPatient.map((h) => h.replace(/_/g, ' ')).join(', ')}. This is their choice and is respected.
        </p>
      ) : null}

      <ConfirmModal
        open={confirm}
        title={`End the session with ${p.name}?`}
        onClose={() => setConfirm(false)}
        onConfirm={() => end.mutate(session.sessionId, { onSuccess: () => setConfirm(false) })}
        confirmLabel="End session now"
        danger
        busy={end.isPending}
        error={end.error}
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          Access to the record closes immediately. Afterwards you can see only the patient's name and what you added yourself (prescriptions, orders, AI reviews). To read the record again you need a new key from the patient.
        </p>
        <p style={{ margin: 0, fontSize: 14 }}>The patient sees that you ended the session in their access history.</p>
      </ConfirmModal>
    </>
  )
}


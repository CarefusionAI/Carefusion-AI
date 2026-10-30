import { useState } from 'react'
import { Alert, Badge, Button, Switch, Textarea } from '../../../components/ui'
import { errMessage, useAckAlert, useAckEscalation, useNurseAlerts } from '../../../api/nurse'
import { BoxHead, Empty, ErrorBlock, PageLoading, fmtDateTime, fmtTime } from './common'
import { ConfirmModal } from './dialogs'
import type { Go } from './types'

const PREF_KEY = 'cf-nurse-alert-prefs'
interface Prefs { overdue: boolean; lab: boolean; sms: boolean }
function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREF_KEY)
    if (raw) return { overdue: true, lab: true, sms: false, ...(JSON.parse(raw) as Partial<Prefs>) }
  } catch {
    /* use defaults */
  }
  return { overdue: true, lab: true, sms: false }
}

export default function Alerts({ go }: { go: Go }) {
  const alerts = useNurseAlerts()
  const ackAlert = useAckAlert()
  const ackEsc = useAckEscalation()
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [escId, setEscId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  function setPref(k: keyof Prefs, v: boolean) {
    const next = { ...prefs, [k]: v }
    setPrefs(next)
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(next))
    } catch {
      /* not saved: the choice only lasts for this visit */
    }
  }

  if (alerts.isLoading) return <PageLoading title="alerts" />
  if (alerts.isError) return <ErrorBlock error={alerts.error} onRetry={() => void alerts.refetch()} title="Could not load alerts" />
  const a = alerts.data!
  const esc = a.escalations.find((e) => e.id === escId)
  const total = a.clinicalAlerts.filter((x) => !x.acknowledgedAt).length + a.escalations.length + (prefs.overdue ? a.overdueDoses.length : 0)

  return (
    <div className="nu-pg">
      <header className="nu-head">
        <div>
          <h1 className="nu-h1">Alerts</h1>
          <p className="nu-sub">Clinical alerts for your patients and ward notices. {total} need attention.</p>
        </div>
      </header>
      {error ? <Alert tone="danger" title="Could not acknowledge" onDismiss={() => setError(null)}>{error}</Alert> : null}

      <section className="nu-grid nu-g2">
        <div className="nu-box">
          <BoxHead title="Needs attention" />
          {a.escalations.length === 0 && a.clinicalAlerts.length === 0 && (!prefs.overdue || a.overdueDoses.length === 0) ? (
            <Empty title="No alerts">Nothing needs your attention right now.</Empty>
          ) : null}
          {a.escalations.map((e) => (
            <Alert
              key={e.id}
              tone="danger"
              title={`Bed ${e.bedNo ?? '-'} · NEWS ${e.newsScore} — escalate`}
              action={<Button size="sm" variant="outline" onClick={() => { setOutcome(''); setModalError(null); setEscId(e.id) }}>Acknowledge</Button>}
            >
              {e.patientName}: {e.pagedRole.replace(/_/g, ' ')} paged {fmtTime(e.pagedAt)} (level {e.level}). Stay with the patient.
            </Alert>
          ))}
          {prefs.overdue
            ? a.overdueDoses.map((d) => (
                <Alert
                  key={`${d.medOrderId}-${d.dueAt}`}
                  tone="warning"
                  title={`Bed ${d.bedNo ?? '-'} · Overdue dose`}
                  action={<Button size="sm" variant="outline" onClick={() => go('mar')}>Medication round</Button>}
                >
                  {d.medicine} was due {fmtTime(d.dueAt)}.
                </Alert>
              ))
            : null}
          {a.clinicalAlerts.map((c) => {
            const tone = c.severity === 'critical' ? 'danger' : c.severity === 'warning' ? 'warning' : 'info'
            if (c.kind.includes('lab') && !prefs.lab) return null
            return (
              <Alert
                key={c.id}
                tone={tone}
                title={`${c.bedNo ? `Bed ${c.bedNo} · ` : ''}${c.title}`}
                action={
                  c.acknowledgedAt ? (
                    <Badge tone="success" icon={<span>✓</span>}>Acknowledged</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={ackAlert.isPending && ackAlert.variables === c.id}
                      onClick={() => { setError(null); ackAlert.mutate(c.id, { onError: (e) => setError(errMessage(e)) }) }}
                    >
                      Acknowledge
                    </Button>
                  )
                }
              >
                {c.patientName ? `${c.patientName} · ` : ''}{c.detail ?? ''} · {fmtDateTime(c.raisedAt)}
              </Alert>
            )
          })}
        </div>

        <div className="nu-box">
          <h2 className="nu-bt">Alert settings</h2>
          <Switch label="Early-warning escalations" description="Always on for assigned patients" checked disabled />
          <Switch label="Overdue medicine reminders" checked={prefs.overdue} onChange={(v) => setPref('overdue', v)} />
          <Switch label="Lab result ready" checked={prefs.lab} onChange={(v) => setPref('lab', v)} />
          <Switch label="Ward notices by SMS" description="Simulated in the alpha" checked={prefs.sms} onChange={(v) => setPref('sms', v)} />
          <div className="nu-pend">
            <strong className="nu-strong">What happens at each score</strong>
            <div className="nu-pend-r"><span className="nu-mono">3-4</span><span className="nu-grow">Hourly obs · tell the charge nurse</span></div>
            <div className="nu-pend-r"><span className="nu-mono">5-6</span><span className="nu-grow">Ward doctor paged automatically</span></div>
            <div className="nu-pend-r"><span className="nu-mono">7+</span><span className="nu-grow">Rapid response team paged</span></div>
          </div>
          <p className="nu-muted" style={{ margin: 0 }}>Critical alerts cannot be muted. They also reach the doctor's app and the ward board. Your other choices are kept on this device only.</p>
        </div>
      </section>

      <ConfirmModal
        open={!!esc}
        title="Acknowledge this escalation?"
        confirmLabel="Acknowledge"
        busy={ackEsc.isPending}
        error={modalError}
        onClose={() => setEscId(null)}
        onConfirm={() => esc && ackEsc.mutate({ id: esc.id, outcome: outcome.trim() || undefined }, { onSuccess: () => setEscId(null), onError: (e) => setModalError(errMessage(e)) })}
      >
        <p style={{ margin: 0 }}>Bed {esc?.bedNo} · {esc?.patientName} · NEWS {esc?.newsScore}. Say what happened so the next nurse knows.</p>
        <Textarea label="Outcome" optional rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={500} />
      </ConfirmModal>
    </div>
  )
}

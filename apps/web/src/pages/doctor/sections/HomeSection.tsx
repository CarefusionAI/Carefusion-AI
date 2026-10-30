import { Link, useNavigate } from 'react-router-dom'
import { Alert, Avatar, Badge, Button, StatCard } from '../../../components/ui'
import type { BadgeTone } from '../../../components/ui'
import {
  useAckAlert,
  useAckResult,
  useDoctorHome,
  useNotifications,
  useSchedule,
} from '../../../api/doctor'
import type { QueueRow } from '../../../api/doctor'
import { useDoctorSession } from '../session'
import { Box, ErrorNote, Header, Kv, Loading, Row, SectionLink, Tok, sectionHref } from '../parts'
import { fmtDayTime, fmtLongDate, fmtTime } from '../format'
import { demoDate } from '../../../lib/demoClock'

const QUEUE_TONE: Record<string, BadgeTone> = {
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
  neutral: 'neutral',
}

function greeting(isToday: boolean): string {
  if (!isToday) return 'Good afternoon'
  const h = demoDate().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function HomeSection() {
  const home = useDoctorHome()
  const sched = useSchedule()
  const notes = useNotifications()
  const ackAlert = useAckAlert()
  const ackResult = useAckResult()
  const navigate = useNavigate()
  const { active } = useDoctorSession()

  if (home.isLoading) return <Loading lines={8} />
  if (home.isError || !home.data) return <ErrorNote error={home.error} title="Could not load the home screen" />
  const d = home.data
  const s = d.stats
  const surname = d.doctor.name.replace(/^Dr\.?\s+/i, '').split(' ').slice(-1)[0]
  const waitingRows = d.queue.filter((q) => q.status !== 'done')
  const reviewCount = d.waitingForReview.ai.length + d.waitingForReview.results.length

  function callIn(q: QueueRow) {
    navigate(sectionHref('open', { visit: q.visitId }))
  }

  const week = sched.data?.week ?? []
  const maxPatients = Math.max(1, ...week.map((w) => w.patients))

  return (
    <div className="dr-page">
      <Header
        title={`${greeting(d.isToday)}, Dr. ${surname}`}
        subtitle={`${s.patientsToday} patients today · ${s.seen} seen · ${s.aiReviewsPending} AI results waiting for your review.`}
        actions={
          <div className="dr-wrap">
            <Badge tone="success" dot>
              On duty · {d.doctor.dutyHours.from}–{d.doctor.dutyHours.to}
            </Badge>
            <Badge tone="outline">HPR {d.doctor.hprId}</Badge>
          </div>
        }
      />
      <p className="dr-muted" style={{ margin: '-14px 0 0' }}>
        {fmtLongDate(d.clinicDate)} &middot; {d.doctor.department}, {d.doctor.hospital}
        {d.isToday ? '' : ' · demo clinic day'}
      </p>

      <section className="dr-grid dr-g5" aria-label="Today in numbers">
        <StatCard label="OP queue" value={s.waiting} unit="waiting" hint={s.avgWaitMinutes != null ? `Avg wait ${s.avgWaitMinutes} min` : 'Wait times appear once patients check in'} tone="blue" />
        <StatCard label="Seen today" value={s.seen} unit={`of ${s.patientsToday}`} tone="sage" />
        <StatCard
          label="AI reviews"
          value={s.aiReviewsPending}
          unit="pending"
          hint={s.oldestAiReviewAt ? `Oldest ${fmtDayTime(s.oldestAiReviewAt)}` : 'Nothing waiting'}
          tone="lavender"
        />
        <StatCard label="Orders back" value={s.ordersBack} unit="results" hint="Lab and radiology" />
        <StatCard label="Sessions" value={s.sessionsToday} unit="today" hint={`${s.sessionsThisWeek} this week · ${s.noShows} no-show`} />
      </section>

      <section className="dr-grid dr-s21">
        <Box
          title="Today's OP queue"
          actions={
            <div className="dr-wrap">
              <SectionLink section="schedule">Schedule</SectionLink>
              <SectionLink section="open">Open with key</SectionLink>
            </div>
          }
        >
          <div>
            {waitingRows.length === 0 ? <p className="dr-muted">No one is waiting.</p> : null}
            {waitingRows.map((q) => (
              <Row
                key={q.visitId}
                tok={q.token}
                tone={q.priority === 'normal' ? 'blue' : 'peach'}
                title={q.patientName}
                sub={q.meta}
                right={<Badge tone={QUEUE_TONE[q.tone] ?? 'neutral'}>{q.statusLabel}</Badge>}
              />
            ))}
          </div>
          <Kv
            items={[
              { label: 'Average wait', value: s.avgWaitMinutes != null ? `${s.avgWaitMinutes} min` : '-' },
              { label: 'Longest wait', value: s.longestWaitMinutes != null ? `${s.longestWaitMinutes} min` : '-' },
              { label: 'No-shows today', value: s.noShows },
              { label: 'Sessions today', value: s.sessionsToday },
            ]}
          />
          {d.nextUp ? (
            <div className="dr-nextup">
              <Tok tone="peach">{d.nextUp.token}</Tok>
              <div className="dr-row-main">
                <strong className="dr-strong">Next: {d.nextUp.patientName}</strong>
                <div className="dr-muted">{d.nextUp.meta}</div>
              </div>
              <Button size="sm" onClick={() => callIn(d.nextUp as QueueRow)}>
                Call in
              </Button>
            </div>
          ) : null}
        </Box>

        <div className="dr-col">
          <Box title="Waiting for your review" actions={<Badge tone="ai">{reviewCount} items</Badge>}>
            {reviewCount === 0 ? <p className="dr-muted">Nothing is waiting.</p> : null}
            {d.waitingForReview.results.slice(0, 4).map((r) => (
              <Row
                key={r.resultId}
                tok="LAB"
                tone={r.critical ? 'peach' : 'blue'}
                title={r.title}
                sub={`${r.patientName} · ${r.values} · ${r.releasedBy}`}
                right={
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={ackResult.isPending && ackResult.variables?.resultId === r.resultId}
                    onClick={() => ackResult.mutate({ resultId: r.resultId })}
                    aria-label={`Acknowledge ${r.title} for ${r.patientName}`}
                  >
                    Acknowledge
                  </Button>
                }
              />
            ))}
            {d.waitingForReview.ai.map((a) => (
              <Row
                key={a.runId}
                tok="AI"
                tone="lav"
                title={a.headline}
                sub={`${a.module} · ${a.status.toLowerCase().replace(/_/g, ' ')} · simulated`}
                right={
                  <Link className="dr-link" to={sectionHref(active ? 'session' : 'open')}>
                    {active ? 'Review' : 'Open patient'}
                  </Link>
                }
              />
            ))}
            <ErrorNote error={ackResult.error} />
          </Box>

          <Box title="Alerts" actions={<span className="dr-muted">{d.alerts.filter((a) => !a.acknowledged).length} active</span>}>
            {d.alerts.length === 0 ? <p className="dr-muted">No alerts.</p> : null}
            {d.alerts.map((a) => (
              <Alert
                key={a.id}
                tone={a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info'}
                title={a.title}
                action={
                  a.acknowledged ? (
                    <Badge tone="success">Acknowledged</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" loading={ackAlert.isPending && ackAlert.variables === a.id} onClick={() => ackAlert.mutate(a.id)}>
                      Acknowledge
                    </Button>
                  )
                }
              >
                {a.detail} &middot; {fmtDayTime(a.raisedAt)}
              </Alert>
            ))}
            <ErrorNote error={ackAlert.error} />
          </Box>
        </div>
      </section>

      <section className="dr-grid dr-s21">
        <Box title="Connected apps" actions={<span className="dr-muted">Refreshes every 15 s</span>}>
          <p className="dr-muted" style={{ margin: 0 }}>
            What patients, labs, nurses, pharmacies and the district send you, and what you send them.
          </p>
          <div className="dr-feed" aria-live="polite">
            {(notes.data?.events ?? []).slice(0, 6).map((n) => (
              <div className="dr-fi" key={n.id}>
                <span className={`tk dr-t-${n.tone}`} aria-hidden="true">
                  {n.chip}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dr-muted">
                    {n.sentByMe ? 'You' : n.from} &middot; {fmtTime(n.at)} &middot; {n.typeLabel}
                  </div>
                  <strong className="dr-strong" style={{ display: 'block' }}>
                    {n.title}
                  </strong>
                  <span className="dr-muted">{n.text}</span>
                </div>
              </div>
            ))}
            {notes.isLoading ? <Loading lines={2} /> : null}
          </div>
        </Box>
        <Box title="Recent patients" actions={<span className="dr-muted">Needs their key</span>}>
          {d.recentPatients.map((p) => (
            <button
              key={p.personId}
              type="button"
              className="dr-recent"
              onClick={() => navigate(sectionHref('open'))}
              aria-label={`${p.name}, ${p.sessions} sessions. Ask for their key`}
            >
              <Avatar name={p.name} size={38} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong className="dr-strong" style={{ display: 'block' }}>
                  {p.name}
                </strong>
                <span className="dr-muted">
                  {p.sessions} sessions · last {fmtDayTime(p.lastSessionAt)}
                </span>
              </span>
              <span className="dr-link" aria-hidden="true">
                Ask key &rarr;
              </span>
            </button>
          ))}
          <p className="dr-muted" style={{ margin: 0 }}>
            Opening asks for the patient's rotating key. You never browse records freely.
          </p>
        </Box>
      </section>

      <section className="dr-grid dr-g3">
        <Box title="This week" actions={<SectionLink section="schedule">Week view</SectionLink>}>
          {sched.isLoading ? (
            <Loading lines={2} />
          ) : (
            <>
              <div
                className="dr-bars"
                role="img"
                aria-label={`Patients seen per day: ${week.map((w) => `${w.weekday} ${w.patients}`).join(', ')}`}
              >
                {week.map((w) => (
                  <div key={w.date} className={w.date === d.clinicDate ? 'now' : ''} style={{ height: `${Math.max(4, (w.patients / maxPatients) * 100)}%` }} />
                ))}
              </div>
              <div className="dr-muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
                {week.map((w) => (
                  <span key={w.date}>{w.weekday}</span>
                ))}
              </div>
            </>
          )}
        </Box>
        <Box title="Pending prescriptions" actions={<SectionLink section="rx">Open</SectionLink>}>
          {d.pendingPrescriptions.length === 0 ? <p className="dr-muted">No drafts.</p> : null}
          {d.pendingPrescriptions.map((p) => (
            <Row key={p.draftId} tok="Rx" title={p.patientName} sub={`Draft · ${p.lines} item${p.lines === 1 ? '' : 's'}`} />
          ))}
        </Box>
        <Box title={d.handover ? `Handover to ${d.handover.to}` : 'Handover'} tone="sage" actions={<SectionLink section="referral">Prepare</SectionLink>}>
          {d.handover ? (
            <>
              <p style={{ margin: 0, fontSize: 14 }}>
                {d.handover.items.length} patient{d.handover.items.length === 1 ? '' : 's'} for <strong>{d.handover.to}</strong>.{' '}
                {d.handover.signedAt ? `Signed by ${d.handover.signedBy}.` : 'Not yet signed.'}
              </p>
              <Badge tone="ai">AI can draft the list (simulated). You approve it.</Badge>
            </>
          ) : (
            <p className="dr-muted">No handover prepared yet.</p>
          )}
        </Box>
      </section>
    </div>
  )
}

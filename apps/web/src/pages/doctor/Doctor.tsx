import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { useEvents } from '../../hooks/useEvents'
import { Alert, Badge, Button, Modal } from '../../components/ui'
import { useMarkNotificationsRead, useNotifications } from '../../api/doctor'
import { DoctorSessionProvider, useDoctorSession } from './session'
import { Loading, sectionHref } from './parts'
import { fmtClock, fmtDayTime } from './format'
import './doctor.css'

// The Doctor app. The role AppShell (sidebar, top bar, demo banner, event toasts) is supplied by <Layout>,
// so this page renders only the content. The sidebar links use /doctor?section=<id>.

type SectionComponent = LazyExoticComponent<ComponentType>

const SECTIONS: Record<string, SectionComponent> = {
  home: lazy(() => import('./sections/HomeSection')),
  open: lazy(() => import('./sections/OpenPatientSection')),
  session: lazy(() => import('./sections/PatientSessionSection')),
  schedule: lazy(() => import('./sections/ScheduleSection')),
  messages: lazy(() => import('./sections/MessagesSection')),
  rx: lazy(() => import('./sections/PrescriptionsSection')),
  orders: lazy(() => import('./sections/OrdersSection')),
  referral: lazy(() => import('./sections/ReferralSection')),
  emergency: lazy(() => import('./sections/EmergencySection')),
  donors: lazy(() => import('./sections/DonorsSection')),
  stock: lazy(() => import('./sections/StockSection')),
  profile: lazy(() => import('./sections/ProfileSection')),
  settings: lazy(() => import('./sections/SettingsSection')),
}

function Toolbar() {
  const { active, secondsLeft } = useDoctorSession()
  const notes = useNotifications()
  const markRead = useMarkNotificationsRead()
  const [bellOpen, setBellOpen] = useState(false)
  const unread = notes.data?.unread ?? 0

  return (
    <>
      <div className="dr-toolbar" role="toolbar" aria-label="Doctor quick actions">
        {active ? (
          <Link className="dr-topbtn" to={sectionHref('session')} aria-label={`Open patient session with ${active.patient.name}, ${fmtClock(secondsLeft)} left`}>
            <span className={active.mode === 'break_glass' ? 'dr-live red' : 'dr-live'} aria-hidden="true" />
            {active.patient.name} &middot; {fmtClock(secondsLeft)}
          </Link>
        ) : null}
        <button type="button" className="dr-topbtn" aria-label={`Notifications, ${unread} unread`} onClick={() => setBellOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />
          </svg>
          {unread > 0 ? <span className="dr-dot" aria-hidden="true" /> : null}
        </button>
        <Link className="dr-topbtn bad" to={sectionHref('emergency')}>
          Emergency access
        </Link>
        <Link className="dr-topbtn pri" to={sectionHref('open')}>
          Open patient
        </Link>
      </div>

      <Modal
        open={bellOpen}
        title={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        size="md"
        onClose={() => setBellOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBellOpen(false)}>
              Close
            </Button>
            <Button variant="primary" loading={markRead.isPending} disabled={unread === 0} onClick={() => markRead.mutate(undefined)}>
              Mark all as read
            </Button>
          </>
        }
      >
        {notes.isLoading ? (
          <Loading />
        ) : notes.isError ? (
          <Alert tone="danger" title="Could not load notifications">
            {notes.error.message}
          </Alert>
        ) : (
          <div className="dr-feed" aria-live="polite">
            {(notes.data?.events ?? []).slice(0, 25).map((n) => (
              <div className="dr-fi" key={n.id}>
                <span className={`tk dr-t-${n.tone}`} aria-hidden="true">
                  {n.chip}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dr-muted">
                    {n.typeLabel} &middot; {fmtDayTime(n.at)} {n.read ? '' : '(new)'}
                  </div>
                  <strong className="dr-strong" style={{ display: 'block' }}>
                    {n.title}
                  </strong>
                  <span className="dr-muted">{n.text}</span>
                  {n.href?.startsWith('/doctor') ? (
                    <div>
                      <Link className="dr-link" to={n.href} onClick={() => setBellOpen(false)}>
                        Open
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {(notes.data?.events ?? []).length === 0 ? <p className="dr-muted">No notifications.</p> : null}
          </div>
        )}
      </Modal>
    </>
  )
}

/** Cross-role events (booking, lab result, message...) arrive through useEvents (toast is shown by the shell). When a new
 *  one arrives, refresh the doctor's own lists so the screens stay current. */
function useRefreshOnEvents() {
  const { events } = useEvents('DOCTOR')
  const qc = useQueryClient()
  const last = useRef<string | null>(null)
  useEffect(() => {
    const newest = events[0]?.id ?? null
    if (last.current !== null && newest !== last.current) {
      for (const k of ['home', 'queue', 'schedule', 'notifications', 'messages', 'orders', 'orders-results', 'alerts', 'prescriptions']) {
        void qc.invalidateQueries({ queryKey: ['doctor', k] })
      }
    }
    last.current = newest
  }, [events, qc])
}

function DoctorApp() {
  const [params] = useSearchParams()
  const key = params.get('section') ?? 'home'
  const Section = SECTIONS[key] ?? SECTIONS.home!
  useRefreshOnEvents()
  return (
    <div className="dr-page">
      <Toolbar />
      <Suspense fallback={<Loading />}>
        <Section key={key} />
      </Suspense>
      <p className="dr-muted" style={{ margin: 0 }}>
        <Badge tone="ai">Simulated AI output</Badge> All AI results here are simulated for the demo, are guidance only, and need your review. Government connectors (e-Sign, HPR) are mocks.
      </p>
    </div>
  )
}

export default function DoctorScreen() {
  const { user } = useAuth()
  if (!user || user.role !== 'DOCTOR') {
    return (
      <Alert tone="warning" title="Sign in as a doctor">
        This screen is for the demo Doctor role. <Link to="/">Choose a role</Link> to continue.
      </Alert>
    )
  }
  return (
    <DoctorSessionProvider>
      <DoctorApp />
    </DoctorSessionProvider>
  )
}

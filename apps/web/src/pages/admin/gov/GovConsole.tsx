import { lazy, Suspense, useCallback, useEffect } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { GovLevel } from '@carefusion/shared'
import { GovApiError, useGovContext, useGovOverview } from '../../../api/gov'
import { Alert, Badge, Button, Card, EmptyState, Skeleton } from '../../../components/ui'
import { ErrorNote, ToastProvider } from './common'
import type { GovNavState, SectionProps } from './types'
import { LEVEL_NAME } from './util'
import './gov.css'

// One parametrised console for district, state, zonal and central admins. The signed-in admin's post
// decides the level, area and sections (GET /api/v1/gov/context); the four screens are thin wrappers.

const SECTIONS: Record<string, React.LazyExoticComponent<React.ComponentType<SectionProps>>> = {
  overview: lazy(() => import('./sections/Overview')),
  map: lazy(() => import('./sections/MapSection')),
  approvals: lazy(() => import('./sections/Approvals').then((m) => ({ default: m.ApprovalsSection }))),
  inbox: lazy(() => import('./sections/Approvals').then((m) => ({ default: m.InboxSection }))),
  alerts: lazy(() => import('./sections/Alerts')),
  surveillance: lazy(() => import('./sections/Surveillance')),
  blood: lazy(() => import('./sections/Blood')),
  audit: lazy(() => import('./sections/Oversight').then((m) => ({ default: m.AuditSection }))),
  logs: lazy(() => import('./sections/Oversight').then((m) => ({ default: m.LogsSection }))),
  reports: lazy(() => import('./sections/Reports')),
  directory: lazy(() => import('./sections/Directory')),
  admins: lazy(() => import('./sections/Admins')),
  // Central only: the API also refuses these for every other level.
  ai: lazy(() => import('./sections/AiGovernance')),
  settings: lazy(() => import('./sections/System')),
}

function Loading() {
  return (
    <div role="status" aria-label="Loading section" className="gv-stack">
      <Skeleton width="40%" height={28} />
      <Skeleton lines={5} />
    </div>
  )
}

function Strip({ approvals, onGo }: { approvals: number | null; onGo: (id: string) => void }) {
  const o = useGovOverview()
  const live = o.data?.liveSessions.now
  return (
    <div className="gv-strip">
      <span className="gv-live" aria-live="polite">
        {live === undefined ? '...' : live} live doctor sessions
      </span>
      <Button variant="secondary" size="sm" onClick={() => onGo('approvals')} aria-label={`Approvals waiting: ${approvals ?? 0}`}>
        Approvals{approvals ? ` (${approvals})` : ''}
      </Button>
      <Button size="sm" onClick={() => onGo('alerts')}>
        New alert
      </Button>
    </div>
  )
}

export default function GovConsole({ level }: { level: GovLevel }) {
  const q = useGovContext()
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const path = location.pathname
  const navState = (location.state as GovNavState | null) ?? null
  const section = params.get('section') ?? 'overview'

  const goTo = useCallback(
    (id: string, state?: GovNavState) => {
      navigate(`${path}?section=${id}`, { state: state ?? null })
    },
    [navigate, path],
  )

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [section])

  if (q.isError) {
    const forbidden = q.error instanceof GovApiError && (q.error.status === 403 || q.error.status === 401)
    return (
      <Card>
        {forbidden ? (
          <EmptyState
            title="This console is for government health admins"
            action={
              <Link to="/" className="cf-btn cf-btn-secondary cf-btn-md" style={{ textDecoration: 'none' }}>
                <span className="cf-btn-label">Back to the role selector</span>
              </Link>
            }
          >
            Sign in as a district, state, zonal or central admin to open it.
          </EmptyState>
        ) : (
          <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
        )}
      </Card>
    )
  }
  const ctx = q.data
  if (!ctx) return <Loading />

  const allowed = ctx.sections.find((s) => s.id === section)
  const Page = allowed ? SECTIONS[section] : undefined
  const approvals = ctx.sections.find((s) => s.id === 'approvals')?.badge ?? null

  return (
    <ToastProvider>
      <div className="gv-root">
        <Strip approvals={approvals} onGo={goTo} />
        {ctx.level !== level ? (
          <Alert tone="info" title={`You are signed in as a ${LEVEL_NAME[ctx.level]}`}>
            This screen is the {LEVEL_NAME[level]} console, but the console always follows your own post, so you are seeing the {LEVEL_NAME[ctx.level]} view for {ctx.unit.name}.
          </Alert>
        ) : null}
        <Suspense fallback={<Loading />}>
          {Page ? (
            <Page ctx={ctx} path={path} goTo={goTo} navState={navState} />
          ) : (
            <Card>
              <EmptyState
                title="This section is not part of your console"
                action={
                  <Button variant="secondary" onClick={() => goTo('overview')}>
                    Back to the overview
                  </Button>
                }
              >
                {section === 'ai' || section === 'settings'
                  ? 'AI governance and system settings are for the central admin only.'
                  : 'Pick a section from the menu.'}
              </EmptyState>
            </Card>
          )}
        </Suspense>
        <p className="gv-muted">
          <Badge tone="warning" dot>
            Synthetic demo data
          </Badge>{' '}
          {ctx.banner}
        </p>
      </div>
    </ToastProvider>
  )
}

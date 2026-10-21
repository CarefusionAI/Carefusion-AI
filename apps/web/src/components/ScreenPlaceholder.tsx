import { Link } from 'react-router-dom'
import { getScreen, SCREEN_GROUP_LABELS } from '../routes/screens'
import { Alert, Badge, Card, EmptyState, PageHeader } from './ui'

/** Stand-in for a design screen that has not been ported yet (Phase 1 foundation). */
export default function ScreenPlaceholder({ id }: { id: string }) {
  const screen = getScreen(id)
  if (!screen) {
    return <Alert tone="warning" title="Unknown screen">No design screen is registered as {id}.</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={SCREEN_GROUP_LABELS[screen.group]}
        title={screen.title}
        subtitle={`Design source: ${screen.id}.dc.html`}
        actions={<Badge tone="warning" dot>Placeholder</Badge>}
      />
      <Card>
        <EmptyState
          title="This screen has not been built yet"
          action={
            <Link to="/screens" className="cf-btn cf-btn-secondary cf-btn-md" style={{ textDecoration: 'none' }}>
              <span className="cf-btn-label">All design screens</span>
            </Link>
          }
        >
          The layout, navigation and styles are in place. The content of this screen is ported in a later phase.
          {screen.existingPath ? ` The current version lives at ${screen.existingPath}.` : ''}
        </EmptyState>
      </Card>
    </div>
  )
}

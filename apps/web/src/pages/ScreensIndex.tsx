import { Link } from 'react-router-dom'
import { SCREENS, SCREEN_GROUP_LABELS } from '../routes/screens'
import type { ScreenGroup } from '../routes/screens'
import { Badge, Card, PageHeader } from '../components/ui'

const GROUPS: ScreenGroup[] = ['auth', 'citizen', 'doctor', 'staff', 'admin']

/** Developer index of every design screen and its route while the port is in progress. */
export default function ScreensIndex() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Front-end port"
        title="Design screens"
        subtitle={`${SCREENS.length} screens from the Claude Design handoff. Each opens a placeholder until it is ported.`}
      />
      {GROUPS.map((g) => (
        <Card key={g} title={SCREEN_GROUP_LABELS[g]}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {SCREENS.filter((s) => s.group === g).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3">
                <Link to={`/screens/${s.slug}`}>{s.title}</Link>
                {s.path ? <Badge tone="teal">{s.path}</Badge> : null}
                {s.existingPath ? <Badge tone="outline">existing {s.existingPath}</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

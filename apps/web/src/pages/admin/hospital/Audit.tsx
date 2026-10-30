import { useState } from 'react'
import { Badge, Button, PageHeader, Table } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { useHospitalAudit } from '../../../api/hospitalAdmin'
import type { HospitalAuditItem } from '../../../api/hospitalAdmin'
import { Box, Chips, ErrorPanel, PanelSkeleton, downloadCsv, fmtDateTime, humanise } from '../opsKit'

type Group = '' | 'access' | 'admin' | 'system'
const GROUP_LABEL: Record<string, string> = { access: 'Record access', admin: 'Admin change', system: 'System' }

export default function Audit() {
  const [group, setGroup] = useState<Group>('')
  const q = useHospitalAudit(group)
  const rows: HospitalAuditItem[] = q.data?.pages.flatMap((p) => p.items) ?? []

  const cols: TableColumn<HospitalAuditItem>[] = [
    { key: 'at', header: 'When', render: (r) => fmtDateTime(r.at) },
    { key: 'actor', header: 'Who', render: (r) => <span>{r.actor}{r.actorType ? <span className="ak-muted"> {'·'} {humanise(r.actorType)}</span> : null}</span> },
    { key: 'summary', header: 'What', render: (r) => r.summary },
    { key: 'action', header: 'Action', mono: true },
    { key: 'group', header: 'Type', render: (r) => <Badge tone={r.group === 'access' ? 'info' : r.group === 'admin' ? 'teal' : 'neutral'}>{GROUP_LABEL[r.group] ?? r.group}</Badge> },
  ]

  return (
    <div className="ak-page">
      <PageHeader
        title="Audit log"
        subtitle="Every record access and admin change in this hospital. Read-only."
        actions={
          <Button
            variant="secondary"
            disabled={rows.length === 0}
            onClick={() => downloadCsv('hospital-audit-log.csv', ['When', 'Who', 'Action', 'Summary', 'Type'], rows.map((r) => [r.at, r.actor, r.action, r.summary, r.group]))}
          >
            Export CSV
          </Button>
        }
      />
      <Box className="ak-in">
        <Chips<Group>
          label="Filter audit log"
          value={group}
          onChange={setGroup}
          options={[
            { id: '', label: 'All' },
            { id: 'access', label: 'Record access' },
            { id: 'admin', label: 'Admin changes' },
            { id: 'system', label: 'System' },
          ]}
        />
        {q.isPending ? (
          <PanelSkeleton rows={6} title={false} />
        ) : q.isError ? (
          <ErrorPanel error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <Table columns={cols} rows={rows} rowKey="seq" caption="Audit log" density="compact" striped empty="No entries match this filter." />
            <div className="ak-wrap" style={{ justifyContent: 'space-between' }}>
              <span className="ak-muted" aria-live="polite">{rows.length} entries loaded. Export covers the loaded entries.</span>
              {q.hasNextPage ? (
                <Button variant="outline" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                  Load older entries
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Box>
    </div>
  )
}

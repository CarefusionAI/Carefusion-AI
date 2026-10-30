import type { ReactNode } from 'react'
import { Badge, Button, EmptyState } from '../../../../components/ui'
import { useAiList } from '../../../../api/doctor'
import type { AIInsight } from '../../../../api/doctor'
import { AiCard, Box, ErrorNote, Loading } from '../../parts'

/** Shared body of the Image analysis, Genomic and Trends tabs: stored runs of one AI tool plus a button to run a new one. */
export default function RunTab({
  sid,
  tool,
  title,
  intro,
  runLabel,
  onRun,
  running,
  error,
  canRun,
  canReview,
  controls,
  visual,
  hidden,
}: {
  sid: string
  tool: AIInsight['tool']
  title: string
  intro: string
  runLabel: string
  onRun: () => void
  running: boolean
  error: unknown
  canRun: boolean
  canReview: boolean
  controls?: ReactNode
  visual?: ReactNode
  hidden?: boolean
}) {
  const list = useAiList(sid)
  if (list.isLoading) return <Loading lines={5} />
  const runs = (list.data?.insights ?? []).filter((i) => i.tool === tool).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <section className="dr-grid dr-g2">
      <div className="dr-col">
        <Box title={title} actions={<Badge tone="ai">Simulated</Badge>}>
          <p style={{ margin: 0, fontSize: 14 }}>{intro}</p>
          {hidden ? (
            <p className="dr-muted" style={{ margin: 0 }}>
              The patient has hidden this category from doctors, so the AI may have little to analyse.
            </p>
          ) : null}
          {visual}
          {controls}
          <div className="dr-wrap">
            <Button variant="ai" onClick={onRun} loading={running} disabled={!canRun}>
              {runLabel}
            </Button>
            {!canRun ? <span className="dr-muted">Not available in a read-only session.</span> : null}
          </div>
          <ErrorNote error={error} title="The analysis could not run" />
        </Box>
      </div>
      <div className="dr-col">
        {runs.length === 0 ? (
          <EmptyState title="No analysis yet">Run the analysis to get a simulated result. You review it before the patient can see it.</EmptyState>
        ) : (
          runs.map((r) => <AiCard key={r.runId ?? r.createdAt} insight={r} canReview={canReview} />)
        )}
      </div>
    </section>
  )
}

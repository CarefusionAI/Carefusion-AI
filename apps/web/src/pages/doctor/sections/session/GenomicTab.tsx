import { useAiGenomic } from '../../../../api/doctor'
import RunTab from './RunTab'

export default function GenomicTab({ sid, canReview, readOnly, hidden }: { sid: string; canReview: boolean; readOnly: boolean; hidden: boolean }) {
  const run = useAiGenomic(sid)
  return (
    <RunTab
      sid={sid}
      tool="genomic"
      title="Pharmacogenomic panel"
      intro="A simulated panel of 24 genes is read against the patient's current medicines. Treat variants as a reason to double-check dosing, not as a decision."
      runLabel="Run genomic analysis (simulated)"
      onRun={() => run.mutate()}
      running={run.isPending}
      error={run.error}
      canRun={!readOnly}
      canReview={canReview}
      hidden={hidden}
    />
  )
}

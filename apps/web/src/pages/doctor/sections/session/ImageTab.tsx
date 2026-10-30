import { useState } from 'react'
import { Select } from '../../../../components/ui'
import { useAiImage, useSessionFiles } from '../../../../api/doctor'
import RunTab from './RunTab'

/** Drawn placeholder, not the patient's scan. The real file is opened from the Files tab. */
function ScanIllustration() {
  return (
    <figure className="dr-xray" style={{ margin: 0 }} aria-label="Illustration of a chest X-ray with the area the simulated AI points at. Not the real scan.">
      <svg viewBox="0 0 400 330" width="100%" height="100%" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        <g fill="none" stroke="#9aa6ae" strokeWidth="3" opacity=".55">
          <path d="M200 30 V300" />
          <path d="M200 70 C140 70 90 110 80 200 C75 250 100 290 150 290 C180 290 190 260 190 220 V80" />
          <path d="M200 70 C260 70 310 110 320 200 C325 250 300 290 250 290 C220 290 210 260 210 220 V80" />
        </g>
      </svg>
      <span className="hl" aria-hidden="true" />
      <figcaption>Illustration only. Open the real scan under Files.</figcaption>
    </figure>
  )
}

export default function ImageTab({ sid, canReview, readOnly, hidden }: { sid: string; canReview: boolean; readOnly: boolean; hidden: boolean }) {
  const files = useSessionFiles(sid)
  const run = useAiImage(sid)
  const scans = (files.data?.files ?? []).filter((f) => f.docType === 'scan')
  const [docId, setDocId] = useState('')
  return (
    <RunTab
      sid={sid}
      tool="image"
      title="Image analysis"
      intro="A simulated model looks at one of the patient's imaging files and points to what to check. It is a prompt to look closer, not a diagnosis."
      runLabel="Analyse image (simulated)"
      onRun={() => run.mutate(docId ? { documentId: docId } : undefined)}
      running={run.isPending}
      error={run.error}
      canRun={!readOnly}
      canReview={canReview}
      hidden={hidden}
      visual={<ScanIllustration />}
      controls={
        <Select
          label="Imaging file"
          value={docId}
          onChange={setDocId}
          options={[{ value: '', label: scans.length ? 'Latest imaging file' : 'No imaging files on record' }, ...scans.map((s) => ({ value: s.id, label: s.title }))]}
        />
      }
    />
  )
}

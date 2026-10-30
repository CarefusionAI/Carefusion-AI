import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLabMe } from '../../api/lab'
import { Alert } from '../../components/ui'
import Home from './lab/Home'
import Collect from './lab/Collect'
import Results from './lab/Results'
import Upload from './lab/Upload'
import Qc from './lab/Qc'
import Stats from './lab/Stats'
import type { Go } from './nurse/types'
import './lab/lab.css'

const SECTIONS = ['home', 'collect', 'results', 'upload', 'qc', 'stats'] as const
type Section = (typeof SECTIONS)[number]

/** Lab technician app (Staff Portal): worklist, sample collection, result entry, release, QC, turnaround. */
export default function LabTechScreen() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('section') as Section | null
  const section: Section = raw && (SECTIONS as readonly string[]).includes(raw) ? raw : 'home'
  const order = params.get('order')
  const me = useLabMe()

  const go: Go = useCallback(
    (s, extra) => {
      const next = new URLSearchParams()
      next.set('section', s)
      for (const [k, v] of Object.entries(extra ?? {})) next.set(k, v)
      setParams(next)
      window.scrollTo({ top: 0 })
    },
    [setParams],
  )

  return (
    <div className="lb-root">
      {me.isError ? (
        <Alert tone="warning" title="Lab account not found">
          This login has no active lab technician profile, so lab data cannot load. Sign in again as a lab technician from the role selector.
        </Alert>
      ) : null}
      {section === 'home' ? <Home go={go} /> : null}
      {section === 'collect' ? <Collect orderId={order} go={go} /> : null}
      {section === 'results' ? <Results orderId={order} go={go} /> : null}
      {section === 'upload' ? <Upload orderId={order} go={go} /> : null}
      {section === 'qc' ? <Qc /> : null}
      {section === 'stats' ? <Stats /> : null}
    </div>
  )
}

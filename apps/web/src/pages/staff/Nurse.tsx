import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNurseBoard, useNurseMe } from '../../api/nurse'
import { Alert, Badge } from '../../components/ui'
import Home from './nurse/Home'
import Admit from './nurse/Admit'
import Orders from './nurse/Orders'
import Vitals from './nurse/Vitals'
import Mar from './nurse/Mar'
import Handover from './nurse/Handover'
import Alerts from './nurse/Alerts'
import type { Go, SectionId } from './nurse/types'
import './nurse/nurse.css'

const SECTIONS: SectionId[] = ['home', 'admit', 'orders', 'vitals', 'mar', 'handover', 'alerts']

/** Nurse app (Staff Portal): ward board, bed charts, vitals with NEWS2, orders, medication round, handover, alerts. */
export default function NurseScreen() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('section') as SectionId | null
  const section: SectionId = raw && SECTIONS.includes(raw) ? raw : 'home'
  const bed = params.get('bed')
  const me = useNurseMe()
  const board = useNurseBoard()

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

  const first = me.data?.fullName?.replace(/^(Sr\.?|Br\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').split(' ')[0] ?? 'nurse'

  return (
    <div className="nu-root">
      {me.isError ? (
        <Alert tone="warning" title="Nurse account not found">
          This login has no active nurse profile, so ward data cannot load. Sign in again as a nurse from the role selector.
        </Alert>
      ) : null}
      <div className="nu-actions" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <Badge tone="teal" dot>{board.data?.ward?.name ?? 'Ward'}</Badge>
      </div>
      {section === 'home' ? <Home go={go} firstName={first} /> : null}
      {section === 'admit' ? <Admit bedId={bed} go={go} /> : null}
      {section === 'orders' ? <Orders /> : null}
      {section === 'vitals' ? <Vitals bedId={bed} go={go} /> : null}
      {section === 'mar' ? <Mar bedId={bed} go={go} /> : null}
      {section === 'handover' ? <Handover bedId={bed} go={go} /> : null}
      {section === 'alerts' ? <Alerts go={go} /> : null}
    </div>
  )
}

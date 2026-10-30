import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Select, Tabs } from '../../../components/ui'
import { useSessionSummary } from '../../../api/doctor'
import { useDoctorSession } from '../session'
import { NeedPatient, sectionHref } from '../parts'
import SessionBanner from './session/SessionBanner'
import SummaryTab from './session/SummaryTab'
import AiChatTab from './session/AiChatTab'
import ImageTab from './session/ImageTab'
import GenomicTab from './session/GenomicTab'
import TrendsTab from './session/TrendsTab'
import FilesTab from './session/FilesTab'

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'chat', label: 'AI chat' },
  { id: 'image', label: 'Image analysis' },
  { id: 'genomic', label: 'Genomic' },
  { id: 'trends', label: 'Trends' },
  { id: 'files', label: 'Files' },
]

export default function PatientSessionSection() {
  const { active, live, loading, setActiveId, secondsLeft, totalSeconds } = useDoctorSession()
  const [params] = useSearchParams()
  const initial = params.get('tab')
  const [tab, setTab] = useState(TABS.some((t) => t.id === initial) ? (initial as string) : 'summary')
  const summary = useSessionSummary(active?.sessionId ?? null)

  if (!active) {
    return (
      <div className="dr-page">
        <h1 className="dr-h1">Patient session</h1>
        {loading ? <p className="dr-muted">Checking for an open session…</p> : <NeedPatient what="The patient session" />}
      </div>
    )
  }

  const sid = active.sessionId
  const readOnly = active.readOnly
  const hidden = (k: string) => active.hiddenByPatient.includes(k)
  const s = summary.data

  return (
    <div className="dr-page">
      {live.length > 1 ? (
        <Select
          label="Open sessions"
          value={sid}
          onChange={setActiveId}
          options={live.map((l) => ({ value: l.sessionId, label: `${l.patient.name}${l.mode === 'break_glass' ? ' (emergency)' : ''}` }))}
        />
      ) : null}
      <SessionBanner session={active} secondsLeft={secondsLeft} totalSeconds={totalSeconds} />
      <div className="dr-wrap">
        {(s?.allergies ?? []).map((a) => (
          <Badge key={a.id} tone="danger">
            Allergy: {a.substance}
          </Badge>
        ))}
        {(s?.conditions ?? []).map((c) => (
          <Badge key={c.id} tone="warning">
            {c.name}
          </Badge>
        ))}
        {s?.emergencyContacts[0] ? <Badge tone="neutral">Emergency contact: {s.emergencyContacts[0].name}</Badge> : null}
        {!readOnly ? (
          <>
            <Link className="dr-link" to={sectionHref('rx')}>
              Prescribe
            </Link>
            <Link className="dr-link" to={sectionHref('orders')}>
              Order tests
            </Link>
            <Link className="dr-link" to={sectionHref('referral')}>
              Refer
            </Link>
          </>
        ) : null}
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} variant="segmented" label="Patient tools" />
      <div role="tabpanel" aria-labelledby={`${tab}-tab`}>
        {tab === 'summary' ? <SummaryTab sid={sid} /> : null}
        {tab === 'chat' ? <AiChatTab sid={sid} canReview /> : null}
        {tab === 'image' ? <ImageTab sid={sid} canReview readOnly={readOnly} hidden={hidden('imaging')} /> : null}
        {tab === 'genomic' ? <GenomicTab sid={sid} canReview readOnly={readOnly} hidden={hidden('genomic')} /> : null}
        {tab === 'trends' ? <TrendsTab sid={sid} canReview readOnly={readOnly} hidden={hidden('lab')} /> : null}
        {tab === 'files' ? <FilesTab sid={sid} /> : null}
      </div>
    </div>
  )
}

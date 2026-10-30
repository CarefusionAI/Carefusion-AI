import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useRadMe } from '../../api/radiology'
import { Alert } from '../../components/ui'
import { ListSkeleton, LoadError } from '../../components/ClinicalBits'
import EquipmentSection from './radiology/EquipmentSection'
import ScheduleSection from './radiology/ScheduleSection'
import StudySection from './radiology/StudySection'
import UploadSection from './radiology/UploadSection'
import WorklistSection from './radiology/WorklistSection'
import './radiology/radiology.css'

// Radiology technician app (design: RadiologyTech.dc.html). The section comes from ?section=
// (worklist, study, upload, equipment, schedule) so the sidebar in AppShell drives it; ?study= holds the open study.

const SECTIONS = ['worklist', 'study', 'upload', 'equipment', 'schedule'] as const
type Section = (typeof SECTIONS)[number]

export default function RadiologyTechScreen() {
  const me = useRadMe()
  const [params, setParams] = useSearchParams()
  const [lastStudy, setLastStudy] = useState<string | null>(null)

  const raw = params.get('section')
  const section: Section = (SECTIONS as readonly string[]).includes(raw ?? '') ? (raw as Section) : 'worklist'
  const studyId = params.get('study') ?? lastStudy

  const go = useCallback(
    (next: string, id?: string) => {
      const p = new URLSearchParams()
      p.set('section', next)
      const sid = id ?? (next === 'study' || next === 'upload' ? studyId : null)
      if (sid) {
        p.set('study', sid)
        setLastStudy(sid)
      }
      setParams(p)
    },
    [setParams, studyId],
  )
  const openStudy = useCallback((id: string) => go('study', id), [go])

  if (me.isLoading) {
    return (
      <div role="status" aria-label="Loading radiology workspace">
        <ListSkeleton rows={3} height={96} />
      </div>
    )
  }
  if (me.isError || !me.data) {
    return <LoadError error={me.error} onRetry={() => me.refetch()} title="Could not open the radiology workspace" />
  }
  const first = me.data.fullName.split(' ')[0] ?? me.data.fullName

  return (
    <div className="rt-root">
      <Alert tone="info" className="rt-sim-note">
        Patients, orders and images are simulated. You only see studies that a doctor ordered. Any AI pre-read is simulated AI output for the reporting doctor.
      </Alert>
      <div style={{ height: 16 }} />
      {section === 'worklist' ? <WorklistSection firstName={first} meId={me.data.userId} onOpenStudy={openStudy} onGo={go} /> : null}
      {section === 'study' ? <StudySection studyId={studyId} onOpenStudy={openStudy} onGo={go} /> : null}
      {section === 'upload' ? <UploadSection studyId={studyId} onGo={go} /> : null}
      {section === 'equipment' ? <EquipmentSection /> : null}
      {section === 'schedule' ? <ScheduleSection fullName={me.data.fullName} onOpenStudy={openStudy} /> : null}
    </div>
  )
}

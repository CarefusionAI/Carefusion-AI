import { Badge } from '../../../../components/ui'
import { useSessionSummary } from '../../../../api/doctor'
import { AiCard, Box, ErrorNote, Kv, Loading } from '../../parts'
import { fmtDay } from '../../format'

export default function SummaryTab({ sid }: { sid: string }) {
  const q = useSessionSummary(sid)
  if (q.isLoading) return <Loading lines={6} />
  if (q.isError || !q.data) return <ErrorNote error={q.error} title="Could not load the summary" />
  const d = q.data
  return (
    <section className="dr-grid dr-s21">
      <Box title="Timeline" actions={<Badge tone="outline">Latest first</Badge>}>
        {d.timeline.length === 0 ? <p className="dr-muted">No events on record yet.</p> : null}
        <div className="dr-tl">
          {d.timeline.map((t, i) => (
            <div className="it" key={`${t.at}-${i}`}>
              <strong className="dr-strong">
                {fmtDay(t.at)} &middot; {t.title}
              </strong>
              <div className="dr-muted">{t.detail}</div>
            </div>
          ))}
        </div>
        <div className="dr-wrap" style={{ marginTop: 'auto' }}>
          {d.allergies.map((a) => (
            <Badge key={a.id} tone="danger">
              Allergy: {a.substance}
              {a.reaction ? ` (${a.reaction})` : ''}
            </Badge>
          ))}
          {d.conditions.map((c) => (
            <Badge key={c.id} tone="warning">
              {c.name}
            </Badge>
          ))}
          <Badge tone="neutral">Blood group {d.patient.bloodGroup}</Badge>
          {d.organDonor ? <Badge tone="neutral">Organ donor (pledged)</Badge> : null}
          {d.specialCategories.map((s) => (
            <Badge key={s} tone="info">
              {s.replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      </Box>
      <div className="dr-col">
        <Box title="At a glance">
          <Kv items={d.glance.map((g) => ({ label: g.label, value: g.value }))} />
          <h3 className="dr-strong" style={{ margin: 0 }}>
            Current medicines
          </h3>
          {d.medications.length === 0 ? <p className="dr-muted">None on record.</p> : null}
          {d.medications.map((m) => (
            <div key={m.id} className="dr-muted">
              <strong className="dr-strong">{m.name}</strong> &middot; {m.dose ?? ''} {m.since ? `· since ${fmtDay(m.since)}` : ''}
            </div>
          ))}
          <h3 className="dr-strong" style={{ margin: 0 }}>
            Emergency contacts
          </h3>
          {d.emergencyContacts.map((c) => (
            <div key={c.name} className="dr-muted">
              {c.name} ({c.relation})
            </div>
          ))}
        </Box>
        <AiCard insight={d.aiSummary} />
      </div>
    </section>
  )
}

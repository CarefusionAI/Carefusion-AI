import { useState } from 'react'
import { Avatar, Badge, Button, Select, Table, Textarea, TextField } from '../../../components/ui'
import type { BadgeTone, TableColumn } from '../../../components/ui'
import { useBloodRequests, useCreateBloodRequest, useDonors } from '../../../api/doctor'
import type { BloodGroupFilter, DonorsData } from '../../../api/doctor'
import { useDoctorSession } from '../session'
import { Box, ConfirmModal, ErrorNote, Header, Loading, Row, Sent } from '../parts'
import { fmtDay, fmtDayTime } from '../format'

const GROUPS: BloodGroupFilter[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const URG: Record<string, BadgeTone> = { normal: 'neutral', urgent: 'warning', critical: 'danger' }

export default function DonorsSection() {
  const [group, setGroup] = useState<BloodGroupFilter>('B+')
  const [radius, setRadius] = useState(10)
  const donors = useDonors(group, radius)
  const requests = useBloodRequests()
  const create = useCreateBloodRequest()
  const { active } = useDoctorSession()
  const [units, setUnits] = useState(2)
  const [urgency, setUrgency] = useState<'normal' | 'urgent' | 'critical'>('urgent')
  const [hours, setHours] = useState(24)
  const [reason, setReason] = useState('')
  const [forPatient, setForPatient] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  const d = donors.data
  const ready = (d?.donors ?? []).filter((x) => x.ready)
  const bank = (d?.bloodBank ?? []).filter((b) => b.bloodGroup === group)
  const bankCols: TableColumn<DonorsData['bloodBank'][number]>[] = [
    { key: 'bank', header: 'Blood bank' },
    { key: 'units', header: 'Units', align: 'right' },
    { key: 'daysCover', header: 'Days cover', align: 'right', render: (b) => b.daysCover ?? '-' },
    { key: 'asOf', header: 'As of', render: (b) => fmtDay(b.asOf) },
  ]

  return (
    <div className="dr-page">
      <Header title="Donors" subtitle="Find willing blood donors near the hospital, or check organ pledges in an emergency." />
      <Box title="Blood group needed" actions={<span className="dr-muted">Within {radius} km of Demo General Hospital</span>}>
        <div className="dr-wrap" role="group" aria-label="Blood group">
          {GROUPS.map((g) => (
            <button key={g} type="button" className={`dr-chip${g === group ? ' on' : ''}`} aria-pressed={g === group} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
        <div style={{ maxWidth: 220 }}>
          <Select label="Search radius" value={String(radius)} onChange={(v) => setRadius(Number(v))} options={[{ value: '5', label: '5 km' }, { value: '10', label: '10 km' }, { value: '25', label: '25 km' }, { value: '50', label: '50 km' }]} />
        </div>
      </Box>

      <section className="dr-grid dr-s21">
        <Box title={`${ready.length} eligible donor${ready.length === 1 ? '' : 's'}`} actions={<Badge tone="danger">{group}</Badge>}>
          {donors.isLoading ? <Loading lines={3} /> : null}
          <ErrorNote error={donors.error} title="Could not load donors" />
          {sent ? <Sent>{sent}</Sent> : null}
          {(d?.donors ?? []).map((x) => (
            <div className="dr-row" key={x.personId}>
              <Avatar name={x.name} size={32} />
              <div className="dr-row-main">
                <strong className="dr-strong">{x.name}</strong>
                <div className="dr-muted">
                  {x.distanceKm != null ? `${x.distanceKm} km` : 'distance unknown'} &middot; {x.note}
                  {x.lastDonationAt ? ` · last gave ${fmtDay(x.lastDonationAt)}` : ''}
                </div>
              </div>
              <Badge tone={x.ready ? 'success' : 'neutral'}>{x.ready ? 'Ready' : 'Not yet eligible'}</Badge>
            </div>
          ))}
          {d && d.donors.length === 0 ? <p className="dr-muted">No donors of this group within {radius} km.</p> : null}
          <p className="dr-muted" style={{ margin: 0 }}>
            Names are shown only for donors who allow it. Phone numbers are never shared.
          </p>

          <h3 className="dr-strong" style={{ margin: '6px 0 0' }}>
            Ask for blood
          </h3>
          <div className="dr-grid dr-g3">
            <TextField label="Units" type="number" min={1} max={20} value={units} onChange={(e) => setUnits(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
            <Select label="Urgency" value={urgency} onChange={(v) => setUrgency(v as typeof urgency)} options={['normal', 'urgent', 'critical']} />
            <TextField label="Closes in (hours)" type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Math.min(168, Math.max(1, Number(e.target.value) || 1)))} />
          </div>
          <Textarea label="Reason" optional value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} />
          {active && !active.readOnly ? (
            <label className="dr-wrap" style={{ gap: 8 }}>
              <input type="checkbox" checked={forPatient} onChange={(e) => setForPatient(e.target.checked)} />
              <span className="dr-muted">Link to {active.patient.name} (open patient)</span>
            </label>
          ) : null}
          <div>
            <Button onClick={() => setConfirm(true)}>Request {units} unit{units === 1 ? '' : 's'} of {group}</Button>
          </div>
        </Box>

        <div className="dr-col">
          <Box title="Blood bank stock">
            <Table columns={bankCols} rows={bank} density="compact" empty="No blood bank holds this group in the feed." caption={`Blood bank stock for ${group}`} />
            <h3 className="dr-strong" style={{ margin: '6px 0 0' }}>
              Organ pledge lookup
            </h3>
            <p style={{ margin: 0, fontSize: 14 }}>{d?.organPledgeNote ?? 'Available only to transplant coordinators after brain-stem death is certified.'}</p>
            <Badge tone="outline">Restricted</Badge>
          </Box>
          <Box title="Your blood requests">
            {(requests.data ?? []).length === 0 && requests.data ? <p className="dr-muted">None yet.</p> : null}
            {(requests.data ?? []).map((r) => (
              <Row
                key={r.id}
                tok={r.bloodGroup}
                tone="peach"
                title={`${r.units} unit${r.units === 1 ? '' : 's'} · ${r.status}`}
                sub={`${r.donorsAlerted} alerted · ${r.willDonate} will donate · closes ${fmtDayTime(r.closesAt)}`}
                right={<Badge tone={URG[r.urgency] ?? 'neutral'}>{r.urgency}</Badge>}
              />
            ))}
          </Box>
        </div>
      </section>

      <ConfirmModal
        open={confirm}
        title={`Request ${units} unit${units === 1 ? '' : 's'} of ${group}?`}
        onClose={() => setConfirm(false)}
        confirmLabel="Send request"
        danger={urgency === 'critical'}
        busy={create.isPending}
        error={create.error}
        onConfirm={() =>
          create.mutate(
            { bloodGroup: group, units, urgency, reason: reason.trim() || undefined, closesInHours: hours, patientPersonId: forPatient && active ? active.patient.personId : undefined },
            {
              onSuccess: (r) => {
                setConfirm(false)
                setSent(`Request sent. ${r.donorsAlerted} nearby donor${r.donorsAlerted === 1 ? ' was' : 's were'} alerted. It closes ${fmtDayTime(r.closesAt)}.`)
              },
            },
          )
        }
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          Nearby {group} donors who are eligible get an alert in their app,. The request is logged against your name{forPatient && active ? ` and linked to ${active.patient.name}` : ''}.
        </p>
      </ConfirmModal>
    </div>
  )
}

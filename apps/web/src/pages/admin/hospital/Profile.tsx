import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, PageHeader, Select, Switch, Textarea, TextField } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useHospitalProfile, useRequestProfileChange } from '../../../api/hospitalAdmin'
import type { HospitalProfile, HospitalProfileChangeRequest } from '../../../api/hospitalAdmin'
import { Async, Box, ConfirmModal, HeroCross, ICONS, Icon, PageSkeleton, Row, RowText, fmtDate, humanise, toneOfStatus, useFlash } from '../opsKit'

const OWNERSHIP: Record<string, string> = { govt: 'Government', private: 'Private', trust: 'Trust', ngo: 'NGO' }
const TYPE: Record<string, string> = { GH: 'General hospital', DH: 'District hospital', CHC: 'Community health centre', PHC: 'Primary health centre' }

function Form({ p }: { p: HospitalProfile }) {
  const e = p.editable
  const request = useRequestProfileChange()
  const { show, node } = useFlash()
  const [phone, setPhone] = useState(e.phone ?? '')
  const [address, setAddress] = useState(e.address)
  const [op, setOp] = useState(e.timings.op ?? '')
  const [casualty, setCasualty] = useState(e.timings.casualty ?? '')
  const [helpDesk, setHelpDesk] = useState(e.timings.help_desk ?? '')
  const [about, setAbout] = useState(e.about ?? '')
  const [services, setServices] = useState<string[]>(e.services)
  const [newService, setNewService] = useState('')
  const [showInFindCare, setShowInFindCare] = useState(e.showInFindCare)
  const [acceptsBookings, setAcceptsBookings] = useState(e.acceptsBookings)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  const waiting = p.changeRequests.find((c) => c.status === 'pending')

  // Fields that really differ from what citizens see now.
  const diff = useMemo(() => {
    const d: HospitalProfileChangeRequest = {}
    const labels: string[] = []
    if (phone.trim() !== (e.phone ?? '')) (d.phone = phone.trim()), labels.push('Public phone')
    if (address.trim() !== e.address) (d.address = address.trim()), labels.push('Address')
    if (op !== (e.timings.op ?? '') || casualty !== (e.timings.casualty ?? '') || helpDesk !== (e.timings.help_desk ?? '')) {
      d.timings = { op: op.trim(), casualty: casualty.trim(), help_desk: helpDesk.trim() }
      labels.push('Timings')
    }
    if (about.trim() !== (e.about ?? '')) (d.about = about.trim()), labels.push('About')
    if (JSON.stringify(services) !== JSON.stringify(e.services)) (d.services = services), labels.push('Services')
    if (showInFindCare !== e.showInFindCare) (d.showInFindCare = showInFindCare), labels.push('Show in Find care')
    if (acceptsBookings !== e.acceptsBookings) (d.acceptsBookings = acceptsBookings), labels.push('Accept bookings')
    return { d, labels }
  }, [phone, address, op, casualty, helpDesk, about, services, showInFindCare, acceptsBookings, e])

  useEffect(() => {
    request.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming])

  function addService() {
    const s = newService.trim()
    if (s && !services.includes(s) && services.length < 30) setServices([...services, s])
    setNewService('')
  }

  async function send() {
    try {
      const res = await request.mutateAsync({ ...diff.d, note: note.trim() || undefined })
      setConfirming(false)
      setNote('')
      show('success', res.message ?? 'Sent to the district admin for approval.')
    } catch {
      /* in modal */
    }
  }

  const locked = !!waiting
  return (
    <div className="ak-page">
      <PageHeader
        title="Hospital profile"
        subtitle="Shown to citizens in Find care. Every change goes to the district admin for approval before it shows."
        actions={
          <Button variant="primary" disabled={locked || diff.labels.length === 0} onClick={() => setConfirming(true)}>
            Request changes
          </Button>
        }
      />
      {node}
      {waiting ? (
        <Alert tone="info" title="A change is waiting for the district admin">
          Sent {fmtDate(waiting.submittedAt)}. You can send another request once it is decided.
        </Alert>
      ) : null}
      <div className="ak-grid ak-g21 ak-in">
        <Box>
          <div className="ak-grid ak-g2">
            <TextField label="Hospital name" value={p.name} disabled readOnly helper="Legal detail. Raise it with the district admin." />
            <TextField label="HFR facility ID" value={p.hfrId} disabled readOnly />
            <Select label="Ownership" value={p.ownership} disabled options={[{ value: p.ownership, label: OWNERSHIP[p.ownership] ?? humanise(p.ownership) }]} helper="Legal detail" />
            <TextField label="Clinical establishment licence" value={p.licenceNo} disabled readOnly />
            <TextField label="Public phone" value={phone} disabled={locked} onChange={(ev) => setPhone(ev.target.value)} />
            <TextField label="Address" value={address} disabled={locked} onChange={(ev) => setAddress(ev.target.value)} />
            <TextField label="OP hours" value={op} disabled={locked} onChange={(ev) => setOp(ev.target.value)} helper="For example 08:00-14:00" />
            <TextField label="Casualty hours" value={casualty} disabled={locked} onChange={(ev) => setCasualty(ev.target.value)} />
            <TextField label="Help desk hours" value={helpDesk} disabled={locked} onChange={(ev) => setHelpDesk(ev.target.value)} />
          </div>
          <Textarea label="About" rows={3} maxLength={1000} value={about} disabled={locked} onChange={(ev) => setAbout(ev.target.value)} />
          <div className="ak-stack" style={{ gap: 4 }}>
            <Switch label="Show in Find care" description="Citizens can find this hospital." checked={showInFindCare} disabled={locked} onChange={setShowInFindCare} />
            <Switch label="Accept OP bookings" description="Citizens can book OP appointments here." checked={acceptsBookings} disabled={locked} onChange={setAcceptsBookings} />
          </div>
        </Box>
        <div className="ak-col">
          <div className="ak-hero">
            <HeroCross />
            <span className="ak-eyebrow">Health Facility Registry</span>
            <span className="ak-hero-big ak-mono" style={{ fontSize: 22 }}>{p.hfrId}</span>
            <p>
              {p.verifiedAt ? `Verified ${fmtDate(p.verifiedAt)}` : 'Not verified yet'} {'·'} {OWNERSHIP[p.ownership] ?? humanise(p.ownership)} {'·'} {TYPE[p.hospitalType] ?? p.hospitalType}
            </p>
          </div>
          <Box title="Services">
            <div className="ak-wrap" style={{ gap: 6 }} role="list" aria-label="Services">
              {services.length === 0 ? <span className="ak-muted">No services listed.</span> : null}
              {services.map((s) => (
                <span key={s} role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Badge tone="teal">{s}</Badge>
                  {!locked ? (
                    <button type="button" className="cf-icon-btn" aria-label={`Remove ${s}`} onClick={() => setServices(services.filter((x) => x !== s))} style={{ width: 24, height: 24 }}>
                      <span aria-hidden="true">{'×'}</span>
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
            {!locked ? (
              <div className="ak-wrap" style={{ alignItems: 'flex-end' }}>
                <TextField
                  label="Add a service"
                  value={newService}
                  maxLength={60}
                  onChange={(ev) => setNewService(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault()
                      addService()
                    }
                  }}
                />
                <Button variant="outline" onClick={addService} disabled={!newService.trim()}>
                  Add
                </Button>
              </div>
            ) : null}
          </Box>
          <Box title="Documents">
            {p.documents.length === 0 ? (
              <p className="ak-muted">No documents on file.</p>
            ) : (
              <div>
                {p.documents.map((d) => (
                  <Row key={d.id} icon={<Icon d={ICONS.doc} />} tone="sage" trailing={<Badge tone={toneOfStatus(d.status)}>{humanise(d.status)}</Badge>}>
                    <RowText title={d.title} sub={`${d.referenceNo ?? 'No reference'}${d.validUntil ? ` · valid till ${fmtDate(d.validUntil)}` : ''}`} />
                  </Row>
                ))}
              </div>
            )}
          </Box>
        </div>
      </div>

      {p.changeRequests.length ? (
        <Box title="Change requests" className="ak-in">
          <div>
            {p.changeRequests.map((c) => (
              <Row key={c.id} icon={<Icon d={ICONS.clipboard} />} tone="blue" trailing={<Badge tone={toneOfStatus(c.status)}>{humanise(c.status)}</Badge>}>
                <RowText
                  title={`Sent ${fmtDate(c.submittedAt)}`}
                  sub={c.decidedAt ? `Decided ${fmtDate(c.decidedAt)}${c.decisionReason ? ` · ${c.decisionReason}` : ''}` : 'Waiting for the district admin'}
                />
              </Row>
            ))}
          </div>
        </Box>
      ) : null}

      <ConfirmModal
        open={confirming}
        title="Send these changes to the district admin?"
        confirmLabel="Send for approval"
        busy={request.isPending}
        error={request.isError ? errorMessage(request.error) : null}
        onConfirm={() => void send()}
        onClose={() => setConfirming(false)}
      >
        <p className="ak-p">Nothing changes on Find care until the district admin approves. You cannot send another request while this one is waiting.</p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
          {diff.labels.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <Textarea label="Note for the district admin" optional rows={2} maxLength={500} value={note} onChange={(ev) => setNote(ev.target.value)} />
      </ConfirmModal>
    </div>
  )
}

export default function Profile() {
  const q = useHospitalProfile()
  return (
    <Async query={q} skeleton={<PageSkeleton stats={false} boxes={2} />}>
      {(p) => <Form key={p.id} p={p} />}
    </Async>
  )
}

import { useState } from 'react'
import { Alert, Badge, Button, PageHeader, Select, StatCard, TextField } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useAddComplianceDocument, useCompliance, usePharmacyAudit, usePharmacyProfile, useUpdateOpeningHours } from '../../../api/pharmacyAdmin'
import { Async, Box, Chips, ConfirmModal, EmptyBox, KV, PageSkeleton, fmtDate, fmtDateTime, humanise, toneOfStatus, useFlash } from '../opsKit'

const DOC_TYPES = [
  { value: 'drug_licence', label: 'Drug licence' },
  { value: 'gst', label: 'GST registration' },
  { value: 'fire_noc', label: 'Fire NOC' },
  { value: 'pharmacist_registration', label: 'Pharmacist registration' },
  { value: 'cold_chain', label: 'Cold-chain certificate' },
  { value: 'other', label: 'Other' },
]

export function PharmacyCompliance() {
  const compliance = useCompliance()
  const add = useAddComplianceDocument()
  const { node, show } = useFlash()
  const [open, setOpen] = useState(false)
  const [docType, setDocType] = useState('other')
  const [title, setTitle] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  async function submit() {
    if (title.trim().length < 3) return setProblem('Give the document a title.')
    setProblem(null)
    try {
      await add.mutateAsync({ docType, title: title.trim(), referenceNo: referenceNo.trim() || undefined, validUntil: validUntil || undefined })
      show('success', 'Document recorded. The file itself is not stored in this demo.')
      setOpen(false)
      setTitle('')
      setReferenceNo('')
      setValidUntil('')
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }

  return (
    <div className="ak-page">
      <PageHeader
        eyebrow="Governance"
        title="Licence and compliance"
        subtitle="Your licence, inspections and documents. Dates that are close are flagged early."
        actions={<Button onClick={() => { setOpen(true); setProblem(null) }}>Add document</Button>}
      />
      {node}
      <Async query={compliance} skeleton={<PageSkeleton boxes={1} />}>
        {(d) => (
          <>
            <section className="ak-grid ak-g4" aria-label="Compliance summary">
              <StatCard label="Licence" value={d.licence.number} hint={d.licence.validUntil ? `Valid until ${fmtDate(d.licence.validUntil)}` : 'No end date on file'} tone="sage" />
              <StatCard label="Compliance score" value={d.complianceScore === null ? '—' : `${d.complianceScore}%`} tone="blue" />
              <StatCard label="Last inspection" value={fmtDate(d.lastInspectionOn)} />
              <StatCard label="Next due" value={fmtDate(d.nextInspectionDue)} tone="peach" />
            </section>
            <Box title="Documents">
              {d.documents.length === 0 ? (
                <EmptyBox title="No documents yet">Add your licence and certificates.</EmptyBox>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="ak-table">
                    <thead>
                      <tr><th scope="col">Document</th><th scope="col">Reference</th><th scope="col">Valid until</th><th scope="col">Status</th><th scope="col">Verified</th></tr>
                    </thead>
                    <tbody>
                      {d.documents.map((x) => (
                        <tr key={x.id}>
                          <td><strong className="ak-strong">{x.title}</strong><div className="ak-muted">{humanise(x.docType)}</div></td>
                          <td className="ak-mono">{x.referenceNo ?? '—'}</td>
                          <td>{fmtDate(x.validUntil)}{x.daysLeft !== null ? <div className="ak-muted">{x.daysLeft < 0 ? `${-x.daysLeft} days ago` : `${x.daysLeft} days left`}</div> : null}</td>
                          <td><Badge tone={toneOfStatus(x.status)} dot>{humanise(x.status)}</Badge></td>
                          <td>{x.verifiedAt ? fmtDate(x.verifiedAt) : 'Not yet'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Box>
          </>
        )}
      </Async>
      <ConfirmModal open={open} title="Add a document" confirmLabel="Save" busy={add.isPending} error={problem} onConfirm={() => void submit()} onClose={() => setOpen(false)}>
        <Select label="Type" value={docType} onChange={setDocType} options={DOC_TYPES} />
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Reference number" optional value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        <TextField label="Valid until" optional type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </ConfirmModal>
    </div>
  )
}

export function PharmacyAudit() {
  const [group, setGroup] = useState('')
  const audit = usePharmacyAudit(group)
  const pages = audit.data?.pages ?? []
  const items = pages.flatMap((p) => p.items)
  return (
    <div className="ak-page">
      <PageHeader
        eyebrow="Governance"
        title="Audit log"
        subtitle={`Every dispense, stock change and staff action at this pharmacy. Kept for ${pages[0]?.retentionYears ?? 7} years and cannot be edited.`}
      />
      <Box>
        <Chips
          label="Show"
          value={group}
          onChange={setGroup}
          options={[{ id: '', label: 'Everything' }, { id: 'rx', label: 'Prescriptions' }, { id: 'stock', label: 'Stock' }, { id: 'staff', label: 'Staff' }]}
        />
      </Box>
      {audit.isPending ? (
        <PageSkeleton stats={false} boxes={1} />
      ) : audit.isError ? (
        <Alert tone="danger">{errorMessage(audit.error)}</Alert>
      ) : items.length === 0 ? (
        <EmptyBox title="Nothing logged here yet">Actions at this pharmacy appear as they happen.</EmptyBox>
      ) : (
        <Box title="Events">
          <div style={{ overflowX: 'auto' }}>
            <table className="ak-table">
              <thead><tr><th scope="col">#</th><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.seq}>
                    <td className="ak-mono">{r.seq}</td>
                    <td>{fmtDateTime(r.at)}</td>
                    <td>{r.actor}{r.actorType ? <div className="ak-muted">{humanise(r.actorType)}</div> : null}</td>
                    <td><strong className="ak-strong">{humanise(r.action)}</strong><div className="ak-muted">{r.summary}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {audit.hasNextPage ? <div style={{ marginTop: 12 }}><Button variant="secondary" onClick={() => void audit.fetchNextPage()} loading={audit.isFetchingNextPage}>Load older events</Button></div> : null}
        </Box>
      )}
    </div>
  )
}

export function PharmacyProfile() {
  const profile = usePharmacyProfile()
  const update = useUpdateOpeningHours()
  const { node, show } = useFlash()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  async function save(current: Record<string, unknown>) {
    setProblem(null)
    try {
      await update.mutateAsync({ ...current, note: text.trim() })
      show('success', 'Opening hours updated.')
      setOpen(false)
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }

  return (
    <div className="ak-page">
      <PageHeader eyebrow="Governance" title="Pharmacy profile" subtitle="Licence details are locked. You can change your opening hours." />
      {node}
      <Async query={profile} skeleton={<PageSkeleton stats={false} boxes={1} />}>
        {(p) => (
          <>
            <Box title={p.name} actions={<Badge tone={toneOfStatus(p.status)} dot>{humanise(p.status)}</Badge>}>
              <KV
                cols={3}
                items={[
                  { label: 'Licence', value: p.licenceNo },
                  { label: 'Valid until', value: fmtDate(p.licenceValidUntil) },
                  { label: 'Type', value: humanise(p.type) },
                  { label: 'Address', value: p.address },
                  { label: 'District', value: p.district },
                  { label: 'Linked hospital', value: p.linkedHospital ?? '—' },
                  { label: 'Counters', value: p.counters },
                  { label: 'Stock source', value: humanise(p.stockSource) },
                  { label: 'Jan Aushadhi', value: p.isJanAushadhi ? 'Yes' : 'No' },
                ]}
              />
              {p.lockedFields.length > 0 ? <p className="ak-muted">Locked: {p.lockedFields.map(humanise).join(', ')}. To change these, ask your district office.</p> : null}
            </Box>
            <Box title="Opening hours" actions={<Button size="sm" variant="secondary" onClick={() => { setOpen(true); setText(typeof p.openingHours.note === 'string' ? p.openingHours.note : ''); setProblem(null) }}>Edit</Button>}>
              <pre className="ak-mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(p.openingHours, null, 2)}</pre>
            </Box>
            {p.billingLink || p.lastSyncRun ? (
              <Box title="Stock sync">
                <KV
                  cols={3}
                  items={[
                    { label: 'Billing software', value: p.billingLink?.vendor ?? '—' },
                    { label: 'Last sync', value: fmtDateTime(p.lastSyncRun?.finishedAt ?? p.billingLink?.lastSyncAt) },
                    { label: 'Rows synced', value: p.lastSyncRun?.rowsSynced ?? '—' },
                  ]}
                />
              </Box>
            ) : null}
            <ConfirmModal open={open} title="Opening hours" confirmLabel="Save" busy={update.isPending} error={problem} onConfirm={() => void save(p.openingHours)} onClose={() => setOpen(false)}>
              <TextField label="Hours note" value={text} onChange={(e) => setText(e.target.value)} helper="For example: Mon–Sat 8:00–21:00, Sun 9:00–13:00" />
            </ConfirmModal>
          </>
        )}
      </Async>
    </div>
  )
}

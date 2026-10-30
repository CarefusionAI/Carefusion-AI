import { useState } from 'react'
import { AIInsight, Badge, Button, Select, Table, Textarea } from '../../../components/ui'
import type { BadgeTone, TableColumn } from '../../../components/ui'
import {
  useColleagues,
  useCreateHandover,
  useCreateReferral,
  useDestinationDoctors,
  useDestinations,
  useDraftHandover,
  useHandovers,
  usePastPatients,
  useReferrals,
  useSessionSummary,
  useSignHandover,
  useUpdateReferral,
} from '../../../api/doctor'
import type { HandoverItemRow, ReferralRow } from '../../../api/doctor'
import { useDoctorSession } from '../session'
import { AiCard, Box, ConfirmModal, ErrorNote, Header, Loading, NeedPatient, Row, Sent } from '../parts'
import { fmtDayTime } from '../format'

const FLAG: Record<string, { label: string; tone: BadgeTone }> = {
  watch: { label: 'Watch', tone: 'danger' },
  pending: { label: 'Pending', tone: 'warning' },
  transfer: { label: 'Transfer', tone: 'info' },
  info: { label: 'Info', tone: 'neutral' },
}

interface DraftItem {
  patientPersonId: string | null
  patientName: string
  flag: HandoverItemRow['flag']
  note: string
  fromAiDraft: boolean
}

function ReferralForm() {
  const { active } = useDoctorSession()
  const sid = active?.sessionId ?? null
  const canWrite = Boolean(active && !active.readOnly)
  const dest = useDestinations()
  const [hospitalId, setHospitalId] = useState('')
  const docs = useDestinationDoctors(hospitalId)
  const summary = useSessionSummary(canWrite ? sid : null)
  const create = useCreateReferral(sid)
  const [toUserId, setToUserId] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [urgency, setUrgency] = useState<'routine' | 'soon' | 'urgent'>('routine')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [showDraft, setShowDraft] = useState(false)

  const hospital = dest.data?.find((h) => h.id === hospitalId)
  const valid = hospitalId && specialty.trim().length >= 2 && reason.trim().length >= 5

  if (!active) return <Box title="New referral"><NeedPatient what="A referral" /></Box>
  if (!canWrite) return <Box title="New referral"><p className="dr-muted">An emergency (break-glass) session is read-only: no referrals.</p></Box>

  return (
    <Box title={`New referral · ${active.patient.name}`}>
      <Select
        label="Refer to (hospital)"
        value={hospitalId}
        onChange={(v) => {
          setHospitalId(v)
          setToUserId('')
          setSpecialty('')
        }}
        placeholder={dest.isLoading ? 'Loading…' : 'Choose a hospital'}
        options={(dest.data ?? []).map((h) => ({ value: h.id, label: `${h.name}${h.district ? ` (${h.district})` : ''}` }))}
      />
      <Select
        label="Specialty"
        value={specialty}
        onChange={setSpecialty}
        placeholder="Choose a specialty"
        options={hospital?.departments?.length ? hospital.departments : ['General medicine', 'Cardiology', 'Orthopaedics', 'Obstetrics and gynaecology', 'Paediatrics']}
      />
      <Select
        label="Doctor (optional)"
        optional
        value={toUserId}
        onChange={setToUserId}
        placeholder={hospitalId ? (docs.isLoading ? 'Loading…' : 'Any doctor') : 'Choose a hospital first'}
        disabled={!hospitalId}
        options={(docs.data ?? []).map((d) => ({ value: d.userId, label: `${d.name} (${d.specialisation})` }))}
      />
      <Select label="Urgency" value={urgency} onChange={(v) => setUrgency(v as typeof urgency)} options={['routine', 'soon', 'urgent']} />
      <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={1500} helper="At least 5 characters. The patient can read this." />
      <div className="dr-wrap">
        <Button disabled={!valid} onClick={() => setConfirm(true)}>
          Send referral
        </Button>
        <Button variant="ai" onClick={() => setShowDraft((v) => !v)} disabled={!summary.data}>
          Draft reason with AI (simulated)
        </Button>
      </div>
      {showDraft && summary.data ? (
        <div className="dr-stack">
          <AiCard insight={summary.data.aiSummary} canReview={false} />
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setReason(`${summary.data!.aiSummary.headline}. ${summary.data!.aiSummary.text}`.slice(0, 1500))
                setShowDraft(false)
              }}
            >
              Use as a starting point
            </Button>
            <span className="dr-muted"> You edit it before sending.</span>
          </div>
        </div>
      ) : null}
      {sent ? <Sent>{sent}</Sent> : null}
      <ConfirmModal
        open={confirm}
        title="Send this referral?"
        onClose={() => setConfirm(false)}
        confirmLabel="Send referral"
        busy={create.isPending}
        error={create.error}
        onConfirm={() =>
          create.mutate(
            { toHospitalId: hospitalId, toUserId: toUserId || undefined, specialty: specialty.trim(), urgency, reason: reason.trim() },
            {
              onSuccess: (r) => {
                setConfirm(false)
                setSent(`Referral to ${r.to} (${r.specialty}) sent. A referral note was added to ${active.patient.name}'s record and the patient sees it under Find care.`)
                setReason('')
              },
            },
          )
        }
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          {hospital?.name ?? 'The receiving hospital'} receives the referral reason and a note is added to {active.patient.name}'s record, visible to them. This is logged against your name. A sent referral cannot be recalled from this app; the receiving side marks it seen, accepted or closed.
        </p>
      </ConfirmModal>
    </Box>
  )
}

function HandoverBuilder() {
  const colleagues = useColleagues()
  const past = usePastPatients()
  const draftQ = useDraftHandover()
  const create = useCreateHandover()
  const [toUserId, setToUserId] = useState('')
  const [summary, setSummary] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [drafted, setDrafted] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [manualPatient, setManualPatient] = useState('')

  function runDraft() {
    draftQ.mutate(undefined, {
      onSuccess: (d) => {
        setItems(d.items)
        setDrafted(true)
      },
    })
  }
  function addManual() {
    const p = past.data?.find((x) => x.personId === manualPatient)
    setItems([...items, { patientPersonId: p?.personId ?? null, patientName: p?.name ?? 'General note', flag: 'info', note: '', fromAiDraft: false }])
    setManualPatient('')
  }
  const valid = toUserId && items.length > 0 && items.every((i) => i.note.trim().length > 0)
  const toName = colleagues.data?.find((c) => c.userId === toUserId)?.name

  return (
    <Box title="Prepare shift handover">
      <Select
        label="Hand over to"
        value={toUserId}
        onChange={setToUserId}
        placeholder={colleagues.isLoading ? 'Loading…' : 'Choose a colleague'}
        options={(colleagues.data ?? []).map((c) => ({ value: c.userId, label: `${c.name} (${c.specialisation})${c.visiting ? ' · visiting' : ''}` }))}
      />
      <div className="dr-wrap">
        <Button variant="ai" onClick={runDraft} loading={draftQ.isPending}>
          Draft list with AI (simulated)
        </Button>
        <span className="dr-muted">You approve every line before it is sent.</span>
      </div>
      <ErrorNote error={draftQ.error} title="Could not draft the list" />
      {drafted ? (
        <AIInsight module="Handover draft" title="Open orders, pending results and flags per patient" simulated>
          <p style={{ margin: 0, fontSize: 14 }}>Built from your queue, orders and alerts. Check each line, change the flag, edit or remove it. Nothing is sent until you confirm.</p>
        </AIInsight>
      ) : null}
      {items.map((it, i) => (
        <div key={i} className="dr-drug">
          <div style={{ flex: 1, minWidth: 0 }} className="dr-stack">
            <div className="dr-between">
              <strong className="dr-strong">
                {it.patientName} {it.fromAiDraft ? <Badge tone="ai">AI draft</Badge> : null}
              </strong>
              <button type="button" className="dr-link" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remove line for ${it.patientName}`}>
                Remove
              </button>
            </div>
            <Select label="Flag" value={it.flag} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, flag: v as DraftItem['flag'] } : x)))} options={Object.entries(FLAG).map(([value, f]) => ({ value, label: f.label }))} />
            <Textarea label="Note" value={it.note} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} rows={2} maxLength={500} />
          </div>
        </div>
      ))}
      <div className="dr-wrap" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <Select label="Add a patient line" value={manualPatient} onChange={setManualPatient} placeholder="General note" options={(past.data ?? []).map((p) => ({ value: p.personId, label: p.name }))} />
        </div>
        <Button variant="secondary" onClick={addManual}>
          Add line
        </Button>
      </div>
      <Textarea label="Summary (optional)" optional value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={2000} />
      <div>
        <Button disabled={!valid} onClick={() => setConfirm(true)}>
          Send handover
        </Button>
      </div>
      {sent ? <Sent>{sent}</Sent> : null}
      <ConfirmModal
        open={confirm}
        title={`Send handover to ${toName ?? 'your colleague'}?`}
        onClose={() => setConfirm(false)}
        confirmLabel="Approve and send"
        busy={create.isPending}
        error={create.error}
        onConfirm={() =>
          create.mutate(
            {
              toUserId,
              summary: summary.trim() || undefined,
              items: items.map((i) => ({ patientPersonId: i.patientPersonId ?? undefined, flag: i.flag, note: i.note.trim(), fromAiDraft: i.fromAiDraft })),
            },
            {
              onSuccess: (r) => {
                setConfirm(false)
                setSent(`Handover with ${r.items} line${r.items === 1 ? '' : 's'} sent to ${r.to}. They sign it to take over.`)
                setItems([])
                setSummary('')
                setDrafted(false)
              },
            },
          )
        }
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          {toName ?? 'Your colleague'} receives these {items.length} lines in their Doctor app and signs to take over responsibility. Lines drafted by the simulated AI are marked as such. You remain responsible until they sign.
        </p>
      </ConfirmModal>
    </Box>
  )
}

export default function ReferralSection() {
  const referrals = useReferrals()
  const handovers = useHandovers()
  const sign = useSignHandover()
  const update = useUpdateReferral()
  const [signId, setSignId] = useState<string | null>(null)

  const cols: TableColumn<ReferralRow>[] = [
    { key: 'patientName', header: 'Patient' },
    { key: 'to', header: 'To' },
    { key: 'sentAt', header: 'Sent', render: (r) => fmtDayTime(r.sentAt) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'accepted' ? 'success' : r.status === 'sent' ? 'neutral' : 'info'}>{r.status}</Badge> },
  ]

  return (
    <div className="dr-page">
      <Header title="Referral & handover" subtitle="Send a patient on with a summary they can see, or hand over your shift." />
      <section className="dr-grid dr-g2">
        <ReferralForm />
        <HandoverBuilder />
      </section>

      <Box title="Handovers">
        {handovers.isLoading ? <Loading lines={3} /> : null}
        <ErrorNote error={handovers.error} />
        {(handovers.data ?? []).length === 0 && handovers.data ? <p className="dr-muted">No handovers yet.</p> : null}
        {(handovers.data ?? []).map((h) => (
          <div key={h.id} className="dr-stack" style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
            <div className="dr-between">
              <strong className="dr-strong">
                {h.from} &rarr; {h.to} &middot; {h.unit}
              </strong>
              {h.signedAt ? <Badge tone="success">Signed by {h.signedBy}</Badge> : <Badge tone="warning">Waiting for {h.to}</Badge>}
            </div>
            <span className="dr-muted">{h.summary}</span>
            {h.items.map((i) => (
              <Row key={i.id} tok={i.patientName.slice(0, 1)} tone={i.flag === 'watch' ? 'peach' : i.flag === 'pending' ? 'blue' : 'sage'} title={i.patientName} sub={i.note} right={<Badge tone={FLAG[i.flag]?.tone ?? 'neutral'}>{FLAG[i.flag]?.label ?? i.flag}</Badge>} />
            ))}
            {h.canSign && !h.signedAt ? (
              <div>
                <Button size="sm" onClick={() => setSignId(h.id)}>
                  Sign and take over
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </Box>

      <Box title="Referrals">
        <Table columns={cols} rows={referrals.data?.sent ?? []} rowKey="id" striped caption="Referrals sent" empty="No referrals sent." />
        {(referrals.data?.received ?? []).length ? (
          <>
            <h3 className="dr-strong" style={{ margin: 0 }}>
              Received
            </h3>
            {(referrals.data?.received ?? []).map((r) => (
              <Row
                key={r.id}
                tok="REF"
                tone="lav"
                title={`${r.patientName} · ${r.to}`}
                sub={`From ${r.toHospital} · ${r.status}`}
                right={
                  <div className="dr-wrap">
                    {(['seen', 'accepted', 'closed'] as const).map((s) => (
                      <Button key={s} size="sm" variant="secondary" onClick={() => update.mutate({ id: r.id, status: s })} disabled={update.isPending}>
                        {s}
                      </Button>
                    ))}
                  </div>
                }
              />
            ))}
          </>
        ) : null}
        <ErrorNote error={update.error} />
      </Box>

      <ConfirmModal
        open={signId !== null}
        title="Take over this handover?"
        onClose={() => setSignId(null)}
        confirmLabel="Sign handover"
        busy={sign.isPending}
        error={sign.error}
        onConfirm={() => signId && sign.mutate(signId, { onSuccess: () => setSignId(null) })}
      >
        <p style={{ margin: 0, fontSize: 14 }}>Signing records that you have read the list and now carry responsibility for these patients.</p>
      </ConfirmModal>
    </div>
  )
}

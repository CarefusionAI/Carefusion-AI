import PersonPicker from '../PersonPicker'
import type { PersonHit } from '../../../api/peopleSearch'
import { useEffect, useState } from 'react'
import { Alert, Avatar, Badge, Button, PageHeader, Select, StatCard, Table, TextField, Textarea } from '../../../components/ui'
import type { TableColumn } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import {
  useCreatePharmacist,
  useDeactivatePharmacist,
  useInvitePharmacist,
  usePharmacists,
  useReactivatePharmacist,
  useResendInvite,
  useRevokeInvite,
} from '../../../api/pharmacyAdmin'
import type { PharmacistsResponse } from '../../../api/pharmacyAdmin'
import { Async, Box, ConfirmModal, ICONS, Icon, PageSkeleton, Row, RowText, UUID_RE, fmtDate, fmtDateTime, humanise, useFlash } from '../opsKit'

type Person = PharmacistsResponse['items'][number]
type Invite = PharmacistsResponse['pendingInvites'][number]

const COUNTER: Record<string, string> = { on: 'On shift', break: 'Break', off: 'Off' }

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invite = useInvitePharmacist()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [registrationNo, setRegistrationNo] = useState('')
  const [shift, setShift] = useState<'day' | 'night' | 'rotating'>('day')
  const [problem, setProblem] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setFullName('')
      setEmail('')
      setRegistrationNo('')
      setShift('day')
      setProblem(null)
      setLink(null)
      invite.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function submit() {
    if (fullName.trim().length < 2) return setProblem('Enter the full name.')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setProblem('Enter a valid work email.')
    if (registrationNo.trim().length < 3) return setProblem('Enter the pharmacy council registration number.')
    setProblem(null)
    try {
      const res = await invite.mutateAsync({ fullName: fullName.trim(), email: email.trim(), registrationNo: registrationNo.trim(), shift })
      setLink(res.mockActivationLink ?? '')
    } catch {
      /* shown below */
    }
  }

  if (link !== null) {
    return (
      <ConfirmModal open={open} title="Invite sent" confirmLabel="Done" cancelLabel="Close" onConfirm={onClose} onClose={onClose}>
        <Alert tone="success" title={`${fullName} was invited`}>
          The invite email is simulated in the alpha. They appear under Pending invites until they accept.
        </Alert>
        <TextField label="Simulated activation link" readOnly value={link} helper="Shown once. A real deployment emails this link and never stores the token." onFocus={(e) => e.currentTarget.select()} />
      </ConfirmModal>
    )
  }

  return (
    <ConfirmModal
      open={open}
      title="Invite a pharmacist"
      confirmLabel="Send invite"
      busy={invite.isPending}
      error={problem ?? (invite.isError ? errorMessage(invite.error) : null)}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <TextField label="Full name" required placeholder="As on pharmacy council registration" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <TextField label="Work email" type="email" required placeholder="name@pharmacy.example" value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField
        label="Kerala State Pharmacy Council number"
        required
        helper="We check this against the council register."
        value={registrationNo}
        onChange={(e) => setRegistrationNo(e.target.value)}
      />
      <Select
        label="Shift"
        value={shift}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'night', label: 'Night' },
          { value: 'rotating', label: 'Rotating' },
        ]}
        onChange={(v) => setShift(v as typeof shift)}
      />
    </ConfirmModal>
  )
}

function AddByIdModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (t: string) => void }) {
  const create = useCreatePharmacist()
  const [person, setPerson] = useState<PersonHit | null>(null)
  const [registrationNo, setRegistrationNo] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setPerson(null)
      setRegistrationNo('')
      setProblem(null)
      create.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  async function submit() {
    if (!person) return setProblem('Find and pick the person first.')
    if (registrationNo.trim().length < 3) return setProblem('Enter the registration number.')
    setProblem(null)
    try {
      await create.mutateAsync({ personId: person.personId, registrationNo: registrationNo.trim() })
      onClose()
      onDone('Pharmacist account created. It is active immediately.')
    } catch {
      /* shown below */
    }
  }
  return (
    <ConfirmModal
      open={open}
      title="Add a registered person"
      confirmLabel="Create account"
      busy={create.isPending}
      error={problem ?? (create.isError ? errorMessage(create.error) : null)}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <p className="ak-p">For someone who already has a CareFusion person record. The pharmacist account is active as soon as you create it.</p>
      <PersonPicker value={person} onPick={setPerson} />
      <TextField label="Registration number" required placeholder="e.g. DSPC DEMO-00000" value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} />
    </ConfirmModal>
  )
}

export default function Staff() {
  const [search, setSearch] = useState('')
  const q = usePharmacists(useDebounced(search.trim()))
  const [inviteOpen, setInviteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const deactivate = useDeactivatePharmacist()
  const reactivate = useReactivatePharmacist()
  const resend = useResendInvite()
  const revoke = useRevokeInvite()
  const [deactivating, setDeactivating] = useState<Person | null>(null)
  const [reason, setReason] = useState('')
  const [revoking, setRevoking] = useState<Invite | null>(null)
  const { show, node } = useFlash()

  async function doDeactivate() {
    if (!deactivating) return
    try {
      await deactivate.mutateAsync({ userId: deactivating.userId, reason: reason.trim() })
      show('success', `${deactivating.name} is deactivated. Their sessions ended.`)
      setDeactivating(null)
    } catch {
      /* in modal */
    }
  }
  async function doReactivate(p: Person) {
    try {
      await reactivate.mutateAsync({ userId: p.userId })
      show('success', `${p.name} can sign in again.`)
    } catch (e) {
      show('danger', errorMessage(e))
    }
  }
  async function doResend(i: Invite) {
    try {
      await resend.mutateAsync({ id: i.id })
      show('success', `Invite re-sent to ${i.name} (simulated).`)
    } catch (e) {
      show('danger', errorMessage(e))
    }
  }
  async function doRevoke() {
    if (!revoking) return
    try {
      await revoke.mutateAsync({ id: revoking.id })
      show('success', `The invite for ${revoking.name} was revoked.`)
      setRevoking(null)
    } catch {
      /* in modal */
    }
  }

  const cols: TableColumn<Person>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (p) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={p.name} size={28} />
          <span>
            <strong style={{ color: 'var(--ink)' }}>{p.name}</strong>
            <span className="ak-muted" style={{ display: 'block' }}>{p.role ?? 'Pharmacist'}</span>
          </span>
        </span>
      ),
    },
    { key: 'registrationNo', header: 'Council number', mono: true },
    { key: 'shift', header: 'Shift', render: (p) => humanise(p.shift) || '-' },
    { key: 'counter', header: 'Counter', render: (p) => (p.counter ? `${p.counter}${p.counterState ? ` · ${COUNTER[p.counterState] ?? p.counterState}` : ''}` : '-') },
    { key: 'fillsToday', header: 'Fills today', align: 'right' },
    { key: 'lastActiveAt', header: 'Last active', render: (p) => fmtDateTime(p.lastActiveAt) },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <span title={p.statusReason ?? undefined}>
          <Badge tone={p.status === 'active' ? 'success' : 'danger'} dot>{humanise(p.status)}</Badge>
        </span>
      ),
    },
    {
      key: 'act',
      header: <span className="cf-sr">Actions</span>,
      render: (p) =>
        p.status === 'active' ? (
          <button type="button" className="ak-rowbtn is-danger" aria-label={`Deactivate ${p.name}`} onClick={() => { deactivate.reset(); setReason(''); setDeactivating(p) }}>
            Deactivate
          </button>
        ) : (
          <button type="button" className="ak-rowbtn" aria-label={`Reactivate ${p.name}`} disabled={reactivate.isPending} onClick={() => void doReactivate(p)}>
            Reactivate
          </button>
        ),
    },
  ]

  return (
    <div className="ak-page">
      <PageHeader
        title="Pharmacists"
        subtitle="Only registered pharmacists can dispense. Deactivating someone ends their sessions at once."
        actions={
          <div className="ak-wrap">
            <Button variant="secondary" onClick={() => setAddOpen(true)}>
              Add registered person
            </Button>
            <Button variant="primary" icon={<Icon d={ICONS.plus} />} onClick={() => setInviteOpen(true)}>
              Invite pharmacist
            </Button>
          </div>
        }
      />
      {node}
      <Async query={q} skeleton={<PageSkeleton boxes={2} />}>
        {(data) => (
          <>
            <div className="ak-grid ak-g4 ak-in">
              <StatCard label="Active" value={data.kpis.active} hint={`of ${data.kpis.accounts} accounts`} icon={<Icon d={ICONS.users} />} tone="sage" />
              <StatCard label="Invites pending" value={data.kpis.invitesPending} hint={data.pendingInvites[0]?.name ?? 'None waiting'} icon={<Icon d={ICONS.mail} />} />
              <StatCard label="Fills today" value={data.items.reduce((a, p) => a + p.fillsToday, 0)} hint="All counters" icon={<Icon d={ICONS.rx} />} tone="blue" />
              <StatCard label="On a counter now" value={data.items.filter((p) => p.counterState === 'on').length} hint="Signed in and dispensing" icon={<Icon d={ICONS.shield} />} tone="peach" />
            </div>
            <Box title="Team" actions={
              <label className="ak-search">
                <Icon d={ICONS.search} />
                <span className="cf-sr">Search pharmacists by name</span>
                <input type="search" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
            } className="ak-in">
              <Table columns={cols} rows={data.items} rowKey="userId" caption="Pharmacy staff" empty="No pharmacists match." />
            </Box>
            <div className="ak-grid ak-g2 ak-in">
              <Box title="Pending invites">
                {data.pendingInvites.length === 0 ? (
                  <p className="ak-muted">No invites are waiting.</p>
                ) : (
                  <div>
                    {data.pendingInvites.map((i) => (
                      <Row
                        key={i.id}
                        icon={<Icon d={ICONS.mail} />}
                        tone="blue"
                        trailing={
                          <div className="ak-wrap" style={{ flexWrap: 'nowrap' }}>
                            <button type="button" className="ak-rowbtn" aria-label={`Resend invite to ${i.name}`} disabled={resend.isPending} onClick={() => void doResend(i)}>
                              Resend
                            </button>
                            <button type="button" className="ak-rowbtn is-danger" aria-label={`Revoke invite for ${i.name}`} onClick={() => { revoke.reset(); setRevoking(i) }}>
                              Revoke
                            </button>
                          </div>
                        }
                      >
                        <RowText
                          title={i.name}
                          sub={`${i.registrationNo ?? 'No number'} · sent ${fmtDate(i.sentAt, false)} · expires ${fmtDate(i.expiresAt, false)}${i.resendCount ? ` · resent ${i.resendCount}x` : ''}`}
                        />
                      </Row>
                    ))}
                  </div>
                )}
              </Box>
              <Box className="is-tint is-blue" title="What pharmacists can see">
                <p className="ak-p">
                  Only the prescription they are filling: medicine, dose, prescriber and allergies. No history, no documents, no AI chat. Every view is written to the audit log.
                </p>
                <div className="ak-wrap">
                  <Badge tone="teal">Prescription</Badge>
                  <Badge tone="teal">Allergies</Badge>
                  <Badge tone="outline">History: hidden</Badge>
                </div>
              </Box>
            </div>
          </>
        )}
      </Async>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <AddByIdModal open={addOpen} onClose={() => setAddOpen(false)} onDone={(t) => show('success', t)} />

      <ConfirmModal
        open={deactivating !== null}
        title={`Deactivate ${deactivating?.name ?? 'pharmacist'}?`}
        confirmLabel="Deactivate"
        danger
        busy={deactivate.isPending}
        disabled={reason.trim().length < 3}
        error={deactivate.isError ? errorMessage(deactivate.error) : null}
        onConfirm={() => void doDeactivate()}
        onClose={() => setDeactivating(null)}
      >
        <p className="ak-p">
          Their sessions end at once and they cannot dispense or sign in until you reactivate the account. Prescriptions they already dispensed stay in the audit log.
        </p>
        <Textarea label="Reason" required rows={2} maxLength={300} helper="At least 3 characters. Recorded against the account." value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmModal>

      <ConfirmModal
        open={revoking !== null}
        title={`Revoke the invite for ${revoking?.name ?? 'this person'}?`}
        confirmLabel="Revoke invite"
        danger
        busy={revoke.isPending}
        error={revoke.isError ? errorMessage(revoke.error) : null}
        onConfirm={() => void doRevoke()}
        onClose={() => setRevoking(null)}
        size="sm"
      >
        <p className="ak-p">The activation link stops working. To bring them in later you would send a new invite.</p>
      </ConfirmModal>
    </div>
  )
}

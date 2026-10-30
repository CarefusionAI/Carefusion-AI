import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { CitizenProfileResponse } from '@carefusion/shared'
import { Alert, Avatar, Badge, Button, Checkbox, EmptyState, Modal, Select, Skeleton, TextField } from '../../components/ui'
import {
  useAddFamily,
  useAddSpecialCategory,
  useCitizenProfile,
  useEndSpecialCategory,
  useFamily,
  useRemoveFamily,
  useSpecialCategoryTypes,
  useUpdateProfile,
  useVitalsSummary,
} from '../../api/citizen1'
import { Async, Box, Head, LinkBtn, MutationError, Page, humanise, fmt } from './CitizenKit'

// Profile (CitizenProfile.dc.html). Identity fields are locked (e-KYC); medical fields are editable.

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'hi', label: 'Hindi' },
]
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'].map((g) => ({ value: g, label: g === 'unknown' ? 'Unknown' : g }))
const STATUSES = [
  { value: 'untreated', label: 'Untreated' },
  { value: 'in progress', label: 'In progress' },
  { value: 'treated', label: 'Treated' },
]

function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? (p[p.length - 1]?.[0] ?? '') : '')).toUpperCase()
}

function age(dob: string): number {
  const d = new Date(`${dob}T00:00:00Z`)
  const now = new Date()
  let a = now.getUTCFullYear() - d.getUTCFullYear()
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) a--
  return a
}

/** Only the last four characters of the Aadhaar reference token are ever shown. */
function maskToken(token: string | null): string {
  return token ? `•••• •••• ${token.slice(-4)}` : '-'
}

function completeness(p: CitizenProfileResponse): number {
  const checks = [
    Boolean(p.person.abhaNumber),
    p.person.kycStatus === 'passed',
    p.person.faceCheckStatus === 'passed',
    p.profile.bloodGroup !== 'unknown',
    Boolean(p.profile.district),
    p.emergencyContacts.length > 0,
    p.profile.organDonorStatus !== 'none' && p.profile.organDonorStatus !== 'undecided',
    Boolean(p.profile.preferredLanguage),
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

function IdentityCard({ p }: { p: CitizenProfileResponse }) {
  const kyc = p.person.kycStatus === 'passed'
  const face = p.person.faceCheckStatus === 'passed'
  return (
    <section className="c1-idc c1-in" aria-label="Identity card" style={{ animationDelay: '60ms' }}>
      <svg aria-hidden="true" viewBox="0 0 64 64" width="260" height="260" style={{ position: 'absolute', right: -60, bottom: -80, opacity: 0.1 }}>
        <rect x="21" y="5" width="18" height="50" rx="9" fill="#3a726d" />
        <rect x="9" y="25" width="50" height="18" rx="9" fill="#c9a86a" />
      </svg>
      <div className="c1-ph" aria-hidden="true">
        {initials(p.person.fullName)}
        {kyc ? <i>✓</i> : null}
      </div>
      <div style={{ position: 'relative', minWidth: 0 }}>
        <div className="c1-flt" style={{ marginBottom: 6 }}>
          <Badge tone={kyc ? 'success' : 'warning'} dot>{kyc ? 'Aadhaar verified' : `e-KYC ${humanise(p.person.kycStatus)}`}</Badge>
          <Badge tone={face ? 'teal' : 'warning'}>{face ? 'Face check passed' : `Face check ${humanise(p.person.faceCheckStatus)}`}</Badge>
          {p.person.abhaNumber ? <Badge tone="gold">ABHA linked</Badge> : null}
        </div>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: '38px', color: 'var(--ink-strong)' }}>{p.person.fullName}</h2>
        <dl className="c1-ids">
          <div><dt>ABHA number</dt><dd className="c1-mono">{p.person.abhaNumber ?? '-'}</dd></div>
          <div><dt>ABHA address</dt><dd>{p.person.abhaAddress ?? '-'}</dd></div>
          <div><dt>Aadhaar token</dt><dd className="c1-mono">{maskToken(p.person.aadhaarToken)}</dd></div>
          <div><dt>Born</dt><dd>{fmt.date(`${p.person.dateOfBirth}T06:00:00Z`)} · {age(p.person.dateOfBirth)} y</dd></div>
          <div><dt>Sex</dt><dd>{humanise(p.person.sex)}</dd></div>
          <div><dt>Location</dt><dd>{[p.profile.district?.name, p.profile.state?.name].filter(Boolean).join(', ') || '-'}</dd></div>
        </dl>
      </div>
    </section>
  )
}

function HealthProfile({ p }: { p: CitizenProfileResponse }) {
  const vitals = useVitalsSummary()
  const update = useUpdateProfile()
  const [edit, setEdit] = useState(false)
  const [blood, setBlood] = useState(p.profile.bloodGroup)
  const [lang, setLang] = useState(p.profile.preferredLanguage)
  const [optIn, setOptIn] = useState(p.profile.aiResearchOptIn)
  const [saved, setSaved] = useState(false)
  const pct = completeness(p)

  useEffect(() => {
    setBlood(p.profile.bloodGroup)
    setLang(p.profile.preferredLanguage)
    setOptIn(p.profile.aiResearchOptIn)
  }, [p.profile.bloodGroup, p.profile.preferredLanguage, p.profile.aiResearchOptIn])

  function save(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    update.mutate(
      { bloodGroup: blood as never, preferredLanguage: lang as never, aiResearchOptIn: optIn },
      {
        onSuccess: () => {
          setSaved(true)
          setEdit(false)
        },
      },
    )
  }

  const w = vitals.data?.weight
  const latestWeight = vitals.data?.latest.weight
  return (
    <Box
      title="Health profile"
      actions={
        <div className="c1-flt" style={{ alignItems: 'center' }}>
          <span className="c1-muted">{pct}% complete</span>
          <Button variant="primary" size="sm" onClick={() => setEdit((v) => !v)}>{edit ? 'Close editor' : 'Edit health profile'}</Button>
        </div>
      }
    >
      <div className="c1-meter" role="progressbar" aria-label="Profile completeness" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {saved && !edit ? <div className="c1-note" role="status">Profile saved.</div> : null}
      {!edit ? (
        <dl className="c1-kv">
          <div><dt>Blood group</dt><dd>{p.profile.bloodGroup === 'unknown' ? 'Not set' : p.profile.bloodGroup}</dd></div>
          <div>
            <dt>Height / weight</dt>
            <dd>{w?.heightCm ? `${w.heightCm} cm` : '—'} · {latestWeight?.value ? `${latestWeight.value} kg` : '—'}</dd>
          </div>
          <div><dt>Preferred language</dt><dd>{LANGUAGES.find((l) => l.value === p.profile.preferredLanguage)?.label ?? p.profile.preferredLanguage}</dd></div>
          <div><dt>Organ donor</dt><dd>{humanise(p.profile.organDonorStatus)}</dd></div>
          <div><dt>AI research opt-in</dt><dd>{p.profile.aiResearchOptIn ? 'Yes' : 'No'}</dd></div>
        </dl>
      ) : (
        <form className="c1-form" onSubmit={save}>
          <div className="c1-form-2">
            <Select label="Blood group" options={BLOOD} value={blood} onChange={setBlood} />
            <Select label="Preferred language" options={LANGUAGES} value={lang} onChange={setLang} />
          </div>
          <Checkbox
            label="AI research opt-in"
            description="Allow de-identified data to be used in research (demo setting, simulated AI output only)."
            checked={optIn}
            onChange={setOptIn}
          />
          <MutationError error={update.error} />
          <div className="c1-flt">
            <Button type="submit" loading={update.isPending}>Save changes</Button>
            <Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
          </div>
          <p className="c1-muted" style={{ margin: 0 }}>Blood group and conditions you add show as “self-reported” until a doctor confirms them.</p>
        </form>
      )}
    </Box>
  )
}

function categoryTone(status: string): 'success' | 'warning' | 'neutral' {
  const s = status.toLowerCase()
  return s === 'treated' ? 'success' : s === 'untreated' ? 'warning' : 'neutral'
}

function SpecialCategories({ p }: { p: CitizenProfileResponse }) {
  const types = useSpecialCategoryTypes()
  const add = useAddSpecialCategory()
  const end = useEndSpecialCategory()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState(STATUSES[0]!.value)
  const [other, setOther] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const chosen = code || types.data?.[0]?.code || ''

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!chosen) return
    if (chosen === 'other' && !other.trim()) {
      setFormError('Please describe the category.')
      return
    }
    setFormError(null)
    add.mutate(
      { categoryCode: chosen, status, otherText: chosen === 'other' ? other.trim() : undefined },
      { onSuccess: () => setOther('') },
    )
  }

  return (
    <Box
      title="Special category status"
      actions={p.specialCategories.length ? <Badge tone="warning">{p.specialCategories.length} active</Badge> : <Badge tone="neutral">None</Badge>}
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: '22px' }}>
        Conditions or situations that help doctors care for you, such as a chronic illness card for free monthly medicines and a priority queue.
      </p>
      {p.specialCategories.length === 0 ? (
        <EmptyState title="No active special categories">Add one below if it applies to you.</EmptyState>
      ) : (
        <div>
          {p.specialCategories.map((c) => (
            <div className="c1-row" key={c.id}>
              <div className="c1-grow">
                <strong className="c1-strong">{c.categoryName}{c.otherText ? ` (${c.otherText})` : ''}</strong>
              </div>
              <Badge tone={categoryTone(c.status)}>{humanise(c.status)}</Badge>
              <Button variant="outline" size="sm" loading={end.isPending && end.variables === c.id} onClick={() => end.mutate(c.id)}>End</Button>
            </div>
          ))}
        </div>
      )}
      <MutationError error={end.error} />
      <form className="c1-form" onSubmit={submit} style={{ padding: 14, borderRadius: 14, background: 'var(--surface)' }}>
        <strong className="c1-strong" style={{ fontSize: 14 }}>Add category</strong>
        <div className="c1-form-2">
          <Select
            label="Category"
            options={(types.data ?? []).map((t) => ({ value: t.code, label: t.name }))}
            value={chosen}
            onChange={setCode}
            placeholder={types.isPending ? 'Loading…' : undefined}
          />
          <Select label="Status" options={STATUSES} value={status} onChange={setStatus} />
        </div>
        {chosen === 'other' ? <TextField label="Please describe" value={other} maxLength={200} onChange={(e) => setOther(e.target.value)} error={formError ?? undefined} /> : null}
        <MutationError error={add.error} />
        <div><Button type="submit" loading={add.isPending} disabled={!chosen}>Add category</Button></div>
      </form>
    </Box>
  )
}

function Contacts({ p }: { p: CitizenProfileResponse }) {
  const list = [...p.emergencyContacts].sort((a, b) => a.priority - b.priority)
  return (
    <Box title="Emergency contacts">
      {list.length === 0 ? (
        <EmptyState title="No emergency contacts yet">Contacts are called if break-glass access is used.</EmptyState>
      ) : (
        list.map((c, i) => (
          <div className="c1-cont" key={c.id}>
            <Avatar name={c.contactName} size={40} />
            <div className="c1-grow">
              <strong className="c1-strong">{c.contactName}</strong>
              <div className="c1-muted">{humanise(c.relation)}</div>
            </div>
            <Badge tone={i === 0 ? 'gold' : 'outline'}>{i === 0 ? 'First' : i === 1 ? 'Second' : `Priority ${c.priority}`}</Badge>
          </div>
        ))
      )}
      <p className="c1-muted" style={{ margin: 0 }}>Called automatically if break-glass access is used. Editing contacts comes in a later release.</p>
    </Box>
  )
}

function FamilyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const add = useAddFamily()
  const [abha, setAbha] = useState('')
  const [relation, setRelation] = useState('')
  const [canShow, setCanShow] = useState(false)
  function close() {
    add.reset()
    setAbha('')
    setRelation('')
    setCanShow(false)
    onClose()
  }
  return (
    <Modal
      open={open}
      title="Link a family member"
      size="sm"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button
            loading={add.isPending}
            disabled={abha.trim().length < 3 || relation.trim().length < 2}
            onClick={() => add.mutate({ abhaId: abha.trim(), relation: relation.trim(), canShowKey: canShow }, { onSuccess: close })}
          >
            Link
          </Button>
        </>
      }
    >
      <div className="c1-form">
        <TextField label="ABHA number or address" placeholder="DEMO-0000-1234" value={abha} onChange={(e) => setAbha(e.target.value)} helper="Demo values only. Never type a real number." />
        <TextField label="Relation" placeholder="e.g. mother" value={relation} onChange={(e) => setRelation(e.target.value)} />
        <Checkbox label="Can show my key for me" checked={canShow} onChange={setCanShow} />
        <MutationError error={add.error} />
      </div>
    </Modal>
  )
}

function Family() {
  const family = useFamily()
  const remove = useRemoveFamily()
  const [open, setOpen] = useState(false)
  return (
    <Box title="Family & guardian links">
      <Async query={family} what="your family links" skeleton={<Skeleton lines={3} height={14} />}>
        {(list) => (
          <>
            {list.map((f) => (
              <div className="c1-row" key={f.id}>
                <Avatar name={f.name} size={36} />
                <div className="c1-grow">
                  <strong className="c1-strong" style={{ fontSize: 14 }}>{f.name}</strong>
                  <div className="c1-muted">{f.note}</div>
                </div>
                <Badge tone={f.status === 'active' ? 'success' : f.status === 'guardian' ? 'teal' : 'warning'}>
                  {f.status === 'active' ? 'Linked' : f.status === 'guardian' ? 'Guardian' : 'Pending'}
                </Badge>
                {f.kind === 'adult' ? (
                  <LinkBtn bad ariaLabel={`Remove link with ${f.name}`} disabled={remove.isPending} onClick={() => remove.mutate(f.id)}>Remove</LinkBtn>
                ) : null}
              </div>
            ))}
            {list.length === 0 ? <EmptyState title="No links yet">Link a child, parent or someone you care for.</EmptyState> : null}
          </>
        )}
      </Async>
      <MutationError error={remove.error} />
      <button type="button" className="c1-fam" onClick={() => setOpen(true)}>
        <span className="c1-ic" style={{ background: 'var(--tint-teal)', color: 'var(--primary-text)', fontSize: 20 }} aria-hidden="true">+</span>
        <span><strong>Link a family member</strong><br /><span className="c1-muted">Child, parent or someone you care for</span></span>
      </button>
      <FamilyModal open={open} onClose={() => setOpen(false)} />
    </Box>
  )
}

function AddressLanguage({ p }: { p: CitizenProfileResponse }) {
  return (
    <Box title="Address & language">
      <dl className="c1-kv" style={{ gridTemplateColumns: '1fr' }}>
        <div><dt>District</dt><dd>{p.profile.district?.name ?? '-'}</dd></div>
        <div><dt>State</dt><dd>{p.profile.state?.name ?? '-'}</dd></div>
        <div><dt>App language</dt><dd>{LANGUAGES.find((l) => l.value === p.profile.preferredLanguage)?.label ?? p.profile.preferredLanguage}</dd></div>
      </dl>
    </Box>
  )
}

export default function CitizenProfile() {
  const profile = useCitizenProfile()
  return (
    <Page label="Profile">
      <Head eyebrow="Profile" title="Your health identity" sub="Verified with Aadhaar e-KYC and a live face check. Identity fields are locked; medical fields can be edited." />
      <Async query={profile} what="your profile" skeleton={<><Skeleton height={190} radius={28} /><Skeleton lines={5} height={16} /></>}>
        {(p) => (
          <>
            <IdentityCard p={p} />
            <section className="c1-grid c1-g2 c1-in" style={{ animationDelay: '120ms' }}>
              <HealthProfile p={p} />
              <SpecialCategories p={p} />
            </section>
            <section className="c1-grid c1-g3 c1-in" style={{ animationDelay: '180ms' }}>
              <Contacts p={p} />
              <Family />
              <AddressLanguage p={p} />
            </section>
            <section className="c1-grid c1-g2 c1-in" style={{ animationDelay: '240ms' }}>
              <Alert tone="info" title="Your identity is locked to you">
                Changing your name, date of birth or Aadhaar link needs a fresh e-KYC. Medical fields can be edited anytime and are labelled as self-reported.
              </Alert>
              <Alert tone="warning" title="Lost your phone?">
                Use “Recover access” on the login page. An Aadhaar OTP to a new number plus a face check moves your account safely.
              </Alert>
            </section>
          </>
        )}
      </Async>
    </Page>
  )
}

import { useEffect, useState } from 'react'
import type { GovAdmins } from '@carefusion/shared'
import { apiFetch, apiJson } from '../../../../lib/api'
import { useGovAdmins } from '../../../../api/gov'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Glyph, PageHeader, Select, Skeleton, Stepper, Table, TextField } from '../../../../components/ui'
import { QueryState, WidgetView, useGovToast } from '../common'
import type { SectionProps } from '../types'
import { fmtDate, humanise, statusTone } from '../util'

type Managed = Extract<GovAdmins['managed'], { available: true }>['data'][number]

interface Option {
  id: number | string
  name: string
}

// Which list fills the "Covers" select for each level that can create admins (see CreateAdminForm).
const CREATE_CFG = {
  zonal: { target: 'zonal', label: 'Zone', key: 'zoneId', numeric: true, options: '/v1/admin/zones' },
  state: { target: 'state', label: 'State', key: 'stateId', numeric: true, options: '/v1/admin/states' },
  district: { target: 'district', label: 'District', key: 'districtId', numeric: false, options: '/v1/register/districts' },
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function CreateForm({ createLevel, signers }: { createLevel: keyof typeof CREATE_CFG; signers: string[] }) {
  const cfg = CREATE_CFG[createLevel]
  const toast = useGovToast()
  const qc = useQueryClient()
  const [options, setOptions] = useState<Option[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [personId, setPersonId] = useState('')
  const [area, setArea] = useState('')
  const [order, setOrder] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiJson<Option[]>(cfg.options)
      .then((d) => !cancelled && setOptions(d))
      .catch(() => !cancelled && setLoadError('The list of areas could not be loaded.'))
    return () => {
      cancelled = true
    }
  }, [cfg.options])

  async function submit() {
    setError(null)
    if (!UUID.test(personId.trim())) return setError('Enter the nominee\'s person ID (a UUID from the demo identity).')
    if (!area) return setError(`Choose the ${cfg.label.toLowerCase()} this admin covers.`)
    setBusy(true)
    try {
      const res = await apiFetch('/v1/admin/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: personId.trim(), targetLevel: cfg.target, [cfg.key]: cfg.numeric ? Number(area) : area }),
      })
      const data = (await res.json().catch(() => ({}))) as { errorMessage?: string; message?: string; success?: boolean }
      if (!res.ok || data.success === false) {
        setError(data.errorMessage ?? data.message ?? `Request failed (${res.status})`)
        return
      }
      setStep(1)
      setPersonId('')
      setArea('')
      setOrder('')
      toast('Admin account requested. Waiting for the second signature.')
      void qc.invalidateQueries({ queryKey: ['gov', 'admins'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={`Create a ${cfg.target} admin`} titleAs="h3" actions={<span className="gv-muted">Step {step + 1} of 2</span>}>
      <form
        className="gv-tight"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Stepper steps={['Nominate', 'Second signature']} current={step} label="Create admin steps" />
        <TextField label="Person ID" required value={personId} onChange={(e) => setPersonId(e.target.value)} helper="The demo identity of the nominee. No Aadhaar number is entered here." />
        <Select label={`Covers (${cfg.label.toLowerCase()})`} required value={area} onChange={setArea} placeholder={`Choose a ${cfg.label.toLowerCase()}`} options={options.map((o) => ({ value: String(o.id), label: o.name }))} />
        <TextField label="Nomination order number" optional value={order} onChange={(e) => setOrder(e.target.value)} placeholder="G.O. DEMO-114/2026" helper="Kept for your records in the alpha." />
        {loadError ? <Alert tone="warning">{loadError}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="gv-callout gv-callout-blue">
          <p className="gv-strong" style={{ margin: 0 }}>Two-person sign-off</p>
          <p className="gv-muted">Requested by you. Second approver: {signers.length ? signers.join(' or ') : 'another admin of your level'}.</p>
        </div>
        <div>
          <Button type="submit" loading={busy}>
            Request account
          </Button>
        </div>
      </form>
    </Card>
  )
}

export default function Admins({ ctx }: SectionProps) {
  const q = useGovAdmins()
  return (
    <div className="gv-stack">
      <PageHeader eyebrow="People" title="Admin accounts" subtitle={ctx.createLevel ? `Create and review the ${ctx.createLevel} admins you manage.` : 'See who signs with you and the rules for admin accounts.'} />
      <QueryState q={q} skeleton={<Skeleton height={260} radius={16} />}>
        {(a) => (
          <div className="gv-split">
            <div className="gv-stack">
              <Card title="Admins you manage" titleAs="h2">
                <WidgetView w={a.managed} title="No admin accounts to manage">
                  {(rows) => (
                    <Table<Managed>
                      caption="Admins you manage"
                      rows={rows}
                      rowKey="userId"
                      empty="You have not created any admin accounts yet."
                      columns={[
                        { key: 'name', header: 'Name' },
                        { key: 'level', header: 'Role', render: (r) => `${humanise(r.level)} admin` },
                        { key: 'covers', header: 'Covers' },
                        { key: 'since', header: 'Since', render: (r) => fmtDate(r.since) },
                        { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)} dot>{humanise(r.status)}</Badge> },
                      ]}
                    />
                  )}
                </WidgetView>
              </Card>
              {a.createLevel && a.createLevel !== 'central' ? <CreateForm createLevel={a.createLevel as keyof typeof CREATE_CFG} signers={a.secondSigners} /> : null}
            </div>
            <div className="gv-stack">
              <Card title="Rules" titleAs="h3" tone="sage">
                <ul className="gv-checks">
                  {a.rules.map((r) => (
                    <li key={r}>
                      <Glyph name="shield" size={16} />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Second signers" titleAs="h3">
                {a.secondSigners.length ? (
                  <ul className="gv-list">
                    {a.secondSigners.map((s) => (
                      <li key={s} className="gv-li">
                        <p className="gv-li-title">{s}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="gv-muted">No other admin of your level and area exists yet.</p>
                )}
              </Card>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  )
}

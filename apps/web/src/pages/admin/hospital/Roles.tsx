import { useMemo, useState } from 'react'
import { Alert, Badge, Button, PageHeader } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useHospitalPermissions, useUpdatePermissions } from '../../../api/hospitalAdmin'
import type { HospitalPermissionMatrix } from '../../../api/hospitalAdmin'
import { Async, Box, ConfirmModal, PageSkeleton, useFlash } from '../opsKit'

const key = (role: string, code: string) => `${role}::${code}`

function Matrix({ m }: { m: HospitalPermissionMatrix }) {
  const save = useUpdatePermissions()
  // Draft = only the cells the admin has flipped, as the wanted value.
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState(false)
  const { show, node } = useFlash()

  const changes = useMemo(() => {
    const list: { roleKey: string; roleLabel: string; permissionCode: string; label: string; allowed: boolean }[] = []
    for (const p of m.permissions) {
      for (const r of m.roles) {
        const k = key(r.key, p.code)
        const cur = p.roles[r.key]?.allowed ?? false
        if (k in draft && draft[k] !== cur) list.push({ roleKey: r.key, roleLabel: r.label, permissionCode: p.code, label: p.label, allowed: draft[k] as boolean })
      }
    }
    return list
  }, [draft, m])

  function toggle(role: string, code: string, current: boolean) {
    const k = key(role, code)
    setDraft((d) => {
      const next = { ...d }
      const wanted = k in d ? !d[k] : !current
      if (wanted === current) delete next[k]
      else next[k] = wanted
      return next
    })
  }

  async function apply() {
    try {
      await save.mutateAsync({ changes: changes.map((c) => ({ roleKey: c.roleKey, permissionCode: c.permissionCode, allowed: c.allowed })) })
      setConfirming(false)
      setDraft({})
      show('success', `${changes.length} permission ${changes.length === 1 ? 'change' : 'changes'} saved. They apply to this hospital straight away.`)
    } catch {
      /* shown in modal */
    }
  }

  const dirty = changes.length > 0
  return (
    <div className="ak-page">
      <PageHeader
        title="Roles & permissions"
        subtitle="What each role can do inside this hospital. National rules (grey, dashed) can't be changed here."
        actions={
          <div className="ak-wrap">
            <Badge tone={dirty ? 'warning' : 'success'} dot>
              {dirty ? `${changes.length} unsaved ${changes.length === 1 ? 'change' : 'changes'}` : 'All changes saved'}
            </Badge>
            <Button variant="secondary" disabled={!dirty} onClick={() => setDraft({})}>
              Discard
            </Button>
            <Button variant="primary" disabled={!dirty} onClick={() => setConfirming(true)}>
              Review and save
            </Button>
          </div>
        }
      />
      {node}
      <Box className="ak-in" label="Permission matrix">
        <div style={{ overflowX: 'auto' }} tabIndex={0} aria-label="Permission matrix, scrolls sideways on small screens">
          <div className="ak-mxg" role="table" aria-label="Permission matrix">
            <div className="ak-mxg-row ak-mxg-head" role="row">
              <span role="columnheader">Permission</span>
              {m.roles.map((r) => (
                <span key={r.key} role="columnheader">
                  {r.label}
                </span>
              ))}
            </div>
            {m.permissions.map((p) => (
              <div key={p.code} className="ak-mxg-row" role="row">
                <span role="rowheader">
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>{p.label}</span>
                  <span className="ak-muted">{p.note ?? ''}</span>
                </span>
                {m.roles.map((r) => {
                  const cell = p.roles[r.key]
                  const cur = cell?.allowed ?? false
                  const k = key(r.key, p.code)
                  const on = k in draft ? (draft[k] as boolean) : cur
                  const changed = k in draft && draft[k] !== cur
                  const state = on ? 'allowed' : 'not allowed'
                  return (
                    <span key={r.key} role="cell">
                      <button
                        type="button"
                        className={`ak-cell${changed ? ' is-changed' : ''}`}
                        aria-pressed={on}
                        disabled={p.locked || !cell}
                        aria-label={`${r.label}: ${p.label}, ${state}${p.locked ? ', national rule, cannot be changed' : changed ? ', unsaved change' : cell?.overridden ? ', changed from default' : ''}`}
                        onClick={() => toggle(r.key, p.code, cur)}
                      >
                        {on ? '✓' : ''}
                      </button>
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="ak-muted ak-table-note">An amber ring marks a change you have not saved yet.</p>
      </Box>

      <ConfirmModal
        open={confirming}
        title="Save permission changes?"
        confirmLabel={`Save ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`}
        busy={save.isPending}
        error={save.isError ? errorMessage(save.error) : null}
        onConfirm={() => void apply()}
        onClose={() => setConfirming(false)}
      >
        <p className="ak-p">
          These take effect straight away for everyone in these roles at this hospital. Removing a permission can stop staff in the middle of their work. Each change is written to the audit log.
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {changes.map((c) => (
            <li key={key(c.roleKey, c.permissionCode)}>
              <strong>{c.roleLabel}</strong>: {c.label} {'→'} {c.allowed ? 'allowed' : 'not allowed'}
            </li>
          ))}
        </ul>
      </ConfirmModal>
    </div>
  )
}

export default function Roles() {
  const q = useHospitalPermissions()
  return (
    <Async query={q} skeleton={<PageSkeleton stats={false} boxes={2} />}>
      {(m) => (m.permissions.length ? <Matrix m={m} /> : <Alert tone="info">No permissions are configured for this hospital.</Alert>)}
    </Async>
  )
}

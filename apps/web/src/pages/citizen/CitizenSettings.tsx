import { useState } from 'react'
import type { DeviceDto, UpdatePreferencesRequest } from '@carefusion/shared'
import { Alert, Badge, Button, EmptyState, Modal, Skeleton, Switch, TextField } from '../../components/ui'
import {
  errorText,
  useCancelDeletion,
  useRequestDeletion,
  useRequestExport,
  useRevokeDevice,
  useRevokeOtherDevices,
  useSettings,
  useUpdatePreferences,
} from '../../api/citizen2'
import { Box, C2Head, ErrorBox, Ic, PATHS, fmtLong, fmtTime, useToast } from './c2kit'
import './citizen2.css'

const LANGS: { id: 'en' | 'ml' | 'hi'; native: string; name: string }[] = [
  { id: 'en', native: 'English', name: 'English' },
  { id: 'ml', native: 'മലയാളം', name: 'Malayalam' },
  { id: 'hi', native: 'हिन्दी', name: 'Hindi' },
]
const SIZES: { id: 'small' | 'default' | 'large' | 'xlarge'; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'default', label: 'Default' },
  { id: 'large', label: 'Large' },
  { id: 'xlarge', label: 'Extra large' },
]

function mb(bytes: number) {
  return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`
}

function deviceIcon(d: DeviceDto) {
  return d.platform.toLowerCase().includes('web') || d.platform.toLowerCase().includes('desktop') ? PATHS.laptop : PATHS.phone
}

export default function CitizenSettingsScreen() {
  const settings = useSettings()
  const update = useUpdatePreferences()
  const revoke = useRevokeDevice()
  const revokeOthers = useRevokeOtherDevices()
  const requestExport = useRequestExport()
  const requestDelete = useRequestDeletion()
  const cancelDelete = useCancelDeletion()
  const toast = useToast()

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<DeviceDto | null>(null)

  const s = settings.data
  const prefs = s?.preferences
  const privacy = (prefs?.privacy ?? {}) as Record<string, unknown>
  const size = prefs ? Math.max(0, SIZES.findIndex((x) => x.id === prefs.textSize)) : 1

  function save(patch: UpdatePreferencesRequest, done?: string) {
    update.mutate(patch, {
      onSuccess: () => done && toast.show(done),
      onError: (e) => toast.show('Could not save', errorText(e)),
    })
  }
  const savePrivacy = (k: string, v: boolean | string, done?: string) => save({ privacy: { [k]: v } }, done)

  function onExport(format: 'zip' | 'fhir') {
    requestExport.mutate(format, {
      onSuccess: (r) => toast.show('Export requested', r.note),
      onError: (e) => toast.show('Could not request export', errorText(e)),
    })
  }

  function onDelete() {
    requestDelete.mutate(reason.trim() || undefined, {
      onSuccess: (r) => {
        setConfirmDelete(false)
        setTyped('')
        setReason('')
        toast.show('Deletion requested', r.note)
      },
      onError: (e) => toast.show('Could not request deletion', errorText(e)),
    })
  }

  return (
    <div className="c2-page">
      <C2Head
        eyebrow="Account · Settings"
        title="Settings"
        lead="Language, text size, privacy, devices and your data. Changes save as soon as you make them."
      />

      {settings.isLoading ? (
        <Skeleton height={320} radius={18} />
      ) : settings.isError ? (
        <ErrorBox error={settings.error} onRetry={() => void settings.refetch()} />
      ) : s && prefs ? (
        <div className="c2-grid c2-g2 c2-in c2-d1">
          <div className="c2-stack">
            <Box title="Language" titleId="st-lang">
              <div className="c2-segl" role="radiogroup" aria-labelledby="st-lang">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={s.language === l.id}
                    className={`c2-lang${s.language === l.id ? ' on' : ''}`}
                    onClick={() => save({ preferredLanguage: l.id }, `Language set to ${l.name}`)}
                  >
                    <b>{l.native}</b>
                    <span className="c2-muted">{l.name}</span>
                  </button>
                ))}
              </div>
              <Switch
                label="Show English medical terms"
                description="Keep terms like HbA1c next to the translation."
                checked={prefs.showEnglishTerms}
                onChange={(v) => save({ showEnglishTerms: v })}
              />
              <p className="c2-muted" style={{ margin: 0 }}>Translations in this demo are simulated.</p>
            </Box>

            <Box title="Reading and display" titleId="st-read">
              <div role="radiogroup" aria-label="Text size" className="c2-szr">
                {SIZES.map((x, i) => (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={prefs.textSize === x.id}
                    aria-label={x.label}
                    className={`c2-sz${prefs.textSize === x.id ? ' on' : ''}`}
                    onClick={() => save({ textSize: x.id })}
                  >
                    <span className={`c2-szt s${i}`}>Aa</span>
                  </button>
                ))}
              </div>
              <div className={`c2-prev s${size}${prefs.highContrast ? ' hc' : ''}`}>
                Your next appointment is on Wednesday at 10:30 with Dr. Arun Nair.
              </div>
              <Switch label="High contrast" description="Darker text and stronger borders." checked={prefs.highContrast} onChange={(v) => save({ highContrast: v })} />
              <Switch label="Reduce motion" description="Turns off animations." checked={prefs.reduceMotion} onChange={(v) => save({ reduceMotion: v })} />
              <Switch label="Read aloud" description="Offer to read screens to you." checked={prefs.readAloud} onChange={(v) => save({ readAloud: v })} />
            </Box>

            <Box title="Privacy" titleId="st-priv">
              <Switch
                label="Emergency card without a key"
                description="Lets a doctor see blood group, allergies and emergency contacts in an emergency."
                checked={privacy.emergencyCardWithoutKey !== false}
                onChange={(v) => savePrivacy('emergencyCardWithoutKey', v)}
              />
              <Switch
                label="Let AI read my documents"
                description="Only after a doctor has reviewed the result do you see it. Simulated AI output."
                checked={privacy.aiReadsDocuments === true}
                onChange={(v) => savePrivacy('aiReadsDocuments', v)}
              />
              <Switch
                label="Allow anonymous research use"
                description="De-identified numbers only, never your name."
                checked={privacy.researchUse === true}
                onChange={(v) => savePrivacy('researchUse', v)}
              />
              <Switch
                label="Monthly summary email"
                checked={privacy.monthlySummaryEmail === true}
                onChange={(v) => savePrivacy('monthlySummaryEmail', v)}
              />
            </Box>
          </div>

          <div className="c2-stack">
            <Box title="Signed-in devices" titleId="st-dev" actions={
              s.devices.filter((d) => !d.current && !d.revoked).length > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => revokeOthers.mutate(undefined, { onSuccess: () => toast.show('Signed out other devices'), onError: (e) => toast.show('Could not sign out', errorText(e)) })} loading={revokeOthers.isPending}>
                  Sign out others
                </Button>
              ) : undefined
            }>
              <Switch
                label="Face check on a new device"
                description="Ask for a quick face check when you sign in somewhere new."
                checked={prefs.faceCheckNewDevice}
                onChange={(v) => save({ faceCheckNewDevice: v })}
              />
              {s.devices.length === 0 ? (
                <EmptyState title="No devices">Devices appear here after you sign in.</EmptyState>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {s.devices.map((d) => (
                    <li key={d.id} className="c2-sec">
                      <Ic tone={d.current ? 'teal' : 'blue'} d={deviceIcon(d)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="c2-nm">{d.name ?? d.platform}{d.current ? ' (this device)' : ''}</div>
                        <div className="c2-muted">
                          {[d.city, d.lastSeenAt ? `last seen ${fmtLong(d.lastSeenAt)}, ${fmtTime(d.lastSeenAt)}` : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {d.revoked ? (
                        <Badge tone="neutral">Signed out</Badge>
                      ) : d.current ? (
                        <Badge tone="success" dot>Active</Badge>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(d)}>Sign out</Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Box>

            <Box title="Your data" titleId="st-data">
              <p style={{ margin: 0 }}>
                {s.storage.documents} documents · {mb(s.storage.bytes)} stored.
              </p>
              {s.lastExport ? (
                <Alert tone="info" title={`Last export: ${s.lastExport.status}`}>
                  {s.lastExport.note}
                </Alert>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={() => onExport('zip')} loading={requestExport.isPending && requestExport.variables === 'zip'}>
                  Download my data (ZIP)
                </Button>
                <Button variant="secondary" onClick={() => onExport('fhir')} loading={requestExport.isPending && requestExport.variables === 'fhir'}>
                  Export as FHIR
                </Button>
              </div>
              <p className="c2-muted" style={{ margin: 0 }}>In this demo the export is recorded but no file is generated.</p>
            </Box>

            <Box title="Delete my account" titleId="st-del" className="c2-box-danger">
              {s.deletion && !s.deletion.cancelledAt ? (
                <Alert
                  tone="warning"
                  title={`Deletion scheduled for ${fmtLong(s.deletion.graceUntil)}`}
                  action={
                    <Button size="sm" variant="secondary" onClick={() => cancelDelete.mutate(undefined, { onSuccess: () => toast.show('Deletion cancelled'), onError: (e) => toast.show('Could not cancel', errorText(e)) })} loading={cancelDelete.isPending}>
                      Cancel deletion
                    </Button>
                  }
                >
                  {s.deletion.note}
                </Alert>
              ) : (
                <>
                  <p style={{ margin: 0 }}>
                    Clinical records are never erased, because doctors may need them. We close your account and hide your personal details after a 30-day grace period.
                  </p>
                  <div>
                    <Button variant="danger" onClick={() => setConfirmDelete(true)}>Request deletion</Button>
                  </div>
                </>
              )}
            </Box>
          </div>
        </div>
      ) : (
        <EmptyState title="No settings found">Please try again in a moment.</EmptyState>
      )}

      <Modal
        open={confirmDelete}
        title="Delete your account?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Keep my account</Button>
            <Button variant="danger" disabled={typed !== 'DELETE'} loading={requestDelete.isPending} onClick={onDelete}>
              Request deletion
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          You will be signed out everywhere after the 30-day grace period. You can cancel any time before then.
        </p>
        <TextField label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <TextField label="Reason" optional value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>

      <Modal
        open={!!revokeTarget}
        title="Sign out this device?"
        onClose={() => setRevokeTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() => {
                if (!revokeTarget) return
                revoke.mutate(revokeTarget.id, {
                  onSuccess: () => {
                    setRevokeTarget(null)
                    toast.show('Device signed out')
                  },
                  onError: (e) => toast.show('Could not sign out', errorText(e)),
                })
              }}
            >
              Sign out
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {revokeTarget?.name ?? 'This device'} will need to sign in again before it can open your records.
        </p>
      </Modal>
      {toast.node}
    </div>
  )
}

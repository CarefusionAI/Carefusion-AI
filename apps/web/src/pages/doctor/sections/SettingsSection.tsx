import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Select, Switch, TextField } from '../../../components/ui'
import { useSettings, useUpdateSettings } from '../../../api/doctor'
import type { UpdateDoctorSettings } from '@carefusion/shared'
import { useAuth } from '../../../context/AuthContext'
import { Box, ConfirmModal, ErrorNote, Header, Kv, Loading } from '../parts'

const CATEGORIES: { id: NonNullable<UpdateDoctorSettings['notifications']>[number]['category']; label: string }[] = [
  { id: 'my_care', label: 'My patients and orders' },
  { id: 'record_opened', label: 'Record opened or session ended' },
  { id: 'blood_requests', label: 'Blood requests' },
  { id: 'appointment_reminders', label: 'Appointment reminders' },
  { id: 'health_dept', label: 'Health department notices' },
  { id: 'emergency', label: 'Emergency alerts' },
]

function readWarn(): boolean {
  try {
    return window.localStorage.getItem('cf-doctor-warn-5min') !== 'off'
  } catch {
    return true
  }
}

export default function SettingsSection() {
  const q = useSettings()
  const update = useUpdateSettings()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [signOut, setSignOut] = useState(false)
  const [warn, setWarn] = useState(readWarn)

  if (q.isLoading) return <Loading lines={6} />
  if (q.isError || !q.data) return <ErrorNote error={q.error} title="Could not load settings" />
  const s = q.data
  const pref = s.preferences
  const on = (category: string) => s.notifications.find((n) => n.category === category && n.channel === 'app')?.enabled ?? true

  function setNotify(category: (typeof CATEGORIES)[number]['id'], enabled: boolean) {
    update.mutate({ notifications: [{ category, channel: 'app', enabled }] })
  }

  return (
    <div className="dr-page">
      <Header title="Settings" />
      <section className="dr-grid dr-g2">
        <Box title="Account" actions={<Badge tone="success">HPR verified (mock)</Badge>}>
          <Kv
            items={[
              { label: 'HPR ID', value: s.account.hprId },
              { label: 'Council', value: s.account.council },
              { label: 'e-Sign', value: s.account.eSign },
              { label: 'Idle sign-out', value: `${s.sessionRules.idleLogoutMinutes} min` },
            ]}
          />
          <p className="dr-muted" style={{ margin: 0 }}>
            Two-step sign-in: {s.account.twoFactor}
          </p>
        </Box>

        <Box title="Display">
          <Select
            label="Text size"
            value={pref.textSize}
            onChange={(v) => update.mutate({ textSize: v as typeof pref.textSize })}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'default', label: 'Default' },
              { value: 'large', label: 'Large' },
              { value: 'xlarge', label: 'Extra large' },
            ]}
          />
          <Switch label="High contrast" checked={pref.highContrast} onChange={(v) => update.mutate({ highContrast: v })} />
          <Switch label="Reduce motion" checked={pref.reduceMotion} onChange={(v) => update.mutate({ reduceMotion: v })} />
          <p className="dr-muted" style={{ margin: 0 }}>
            These preferences are saved to your account. Applying them across the whole app is not built in the alpha.
          </p>
        </Box>

        <Box title="Session and notifications">
          <Switch
            label="Warn me 5 minutes before a session ends"
            checked={warn}
            onChange={(v) => {
              setWarn(v)
              try {
                window.localStorage.setItem('cf-doctor-warn-5min', v ? 'on' : 'off')
              } catch {
                /* storage unavailable */
              }
            }}
            description="Saved on this device."
          />
          {CATEGORIES.map((c) => (
            <Switch key={c.id} label={c.label} description="In-app notification" checked={on(c.id)} onChange={(v) => setNotify(c.id, v)} />
          ))}
        </Box>

        <Box title="Quiet hours">
          <Switch
            label="Silence non-urgent notifications"
            checked={pref.quietHours.enabled}
            onChange={(v) => update.mutate({ quietHours: { ...pref.quietHours, enabled: v } })}
          />
          <div className="dr-grid dr-g2" style={{ gap: 12 }}>
            <TextField label="From" type="time" value={pref.quietHours.from} onChange={(e) => e.target.value && update.mutate({ quietHours: { ...pref.quietHours, from: e.target.value } })} />
            <TextField label="To" type="time" value={pref.quietHours.to} onChange={(e) => e.target.value && update.mutate({ quietHours: { ...pref.quietHours, to: e.target.value } })} />
          </div>
          <ErrorNote error={update.error} title="Could not save that setting" />
          <div>
            <Button variant="secondary" onClick={() => setSignOut(true)}>
              Sign out
            </Button>
          </div>
        </Box>
      </section>

      <ConfirmModal
        open={signOut}
        title="Sign out?"
        onClose={() => setSignOut(false)}
        confirmLabel="Sign out"
        danger
        onConfirm={() => {
          setSignOut(false)
          logout()
          navigate('/')
        }}
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          You return to the role selector. Any open patient session stays open on the server until its timer ends; end it first if you are done with the patient.
        </p>
      </ConfirmModal>
    </div>
  )
}

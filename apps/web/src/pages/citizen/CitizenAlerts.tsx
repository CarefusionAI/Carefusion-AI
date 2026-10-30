import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AlertGroup, AlertItemDto } from '@carefusion/shared'
import { Alert, Badge, Button, EmptyState, Skeleton, Switch } from '../../components/ui'
import { errorText, useAlerts, useMarkAlertsRead, useNotifPrefs, useUpdateNotifPrefs } from '../../api/citizen2'
import { Box, C2Head, CardSkeleton, ErrorBox, Ic, PATHS, fmtLong, fmtTime, useToast } from './c2kit'
import './citizen2.css'

type Tab = 'alerts' | 'updates' | 'reminders'

const TABS: { id: Tab; label: string }[] = [
  { id: 'alerts', label: 'Alerts' },
  { id: 'updates', label: 'Updates' },
  { id: 'reminders', label: 'Reminders' },
]

const GROUP_LABEL: Record<AlertGroup, string> = {
  emergency: 'Emergency',
  health_dept: 'Health department',
  my_care: 'My care',
  system: 'System',
}

const PREF_LABEL: Record<string, string> = {
  health_dept: 'Health department alerts',
  my_care: 'My care updates',
  record_opened: 'Someone opened my record',
  blood_requests: 'Blood requests near me',
  appointment_reminders: 'Appointment reminders',
  medicine_reminders: 'Medicine reminders',
  monthly_summary: 'Monthly summary',
  emergency: 'Emergency alerts',
}

const CHANNEL_LABEL: Record<string, string> = { app: 'App', sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp' }

function alertIcon(a: AlertItemDto) {
  if (a.severity === 'emergency') return <Ic tone="red" d={PATHS.warn} />
  if (a.group === 'health_dept') return <Ic tone="peach" d={PATHS.bell} />
  if (a.group === 'my_care') return <Ic tone="sage" d={PATHS.heart} />
  return <Ic tone="blue" d={PATHS.shield} />
}

function whenText(iso: string) {
  return `${fmtLong(iso)}, ${fmtTime(iso)}`
}

export default function CitizenAlertsScreen() {
  const [tab, setTab] = useState<Tab>('alerts')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const alerts = useAlerts(undefined, onlyUnread)
  const prefs = useNotifPrefs()
  const markRead = useMarkAlertsRead()
  const updatePrefs = useUpdateNotifPrefs()
  const toast = useToast()

  const items = alerts.data?.items ?? []
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { alerts: 0, updates: 0, reminders: 0 }
    for (const a of items) c[a.tab] += 1
    return c
  }, [items])
  const shown = items.filter((a) => a.tab === tab)
  const unread = alerts.data?.unread ?? 0

  function onMark(ids?: string[]) {
    markRead.mutate(ids, {
      onSuccess: (r) => toast.show(r.marked ? 'Marked as read' : 'Nothing new', r.marked ? `${r.marked} cleared.` : undefined),
      onError: (e) => toast.show('Could not update', errorText(e)),
    })
  }

  function onPref(category: string, channel: string, enabled: boolean) {
    updatePrefs.mutate(
      { prefs: [{ category: category as never, channel: channel as never, enabled }] },
      { onError: (e) => toast.show('Could not save', errorText(e)) },
    )
  }

  function onQuiet(enabled: boolean) {
    const q = prefs.data?.quietHours
    if (!q) return
    updatePrefs.mutate(
      { prefs: [{ category: 'my_care', channel: 'app', enabled: true }], quietHours: { enabled, from: q.from, to: q.to } },
      { onError: (e) => toast.show('Could not save', errorText(e)) },
    )
  }

  const channels = useMemo(() => {
    const set = new Set<string>()
    for (const p of prefs.data?.prefs ?? []) set.add(p.channel)
    return ['app', 'sms', 'email', 'whatsapp'].filter((c) => set.has(c))
  }, [prefs.data])
  const categories = useMemo(() => {
    const seen: string[] = []
    for (const p of prefs.data?.prefs ?? []) if (!seen.includes(p.category)) seen.push(p.category)
    return seen
  }, [prefs.data])

  return (
    <div className="c2-page">
      <C2Head
        eyebrow="Stay informed · Alerts"
        title="Alerts and notifications"
        lead="Health-department alerts, updates on your care and reminders, in one place. Emergency alerts can never be switched off."
        actions={
          <Button variant="secondary" size="sm" onClick={() => onMark()} loading={markRead.isPending} disabled={unread === 0}>
            Mark all as read
          </Button>
        }
      />

      <div className="c2-grid c2-wide c2-in c2-d1">
        <div className="c2-stack">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div className="c2-seg" role="tablist" aria-label="Notification type">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? 'on' : ''}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  <span className="c2-seg-n">{counts[t.id]}</span>
                </button>
              ))}
            </div>
            <label className="c2-onlyun">
              <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
              Only unread
            </label>
          </div>

          {alerts.isLoading ? (
            <CardSkeleton lines={5} label="Loading alerts" />
          ) : alerts.isError ? (
            <ErrorBox error={alerts.error} onRetry={() => void alerts.refetch()} />
          ) : shown.length === 0 ? (
            <EmptyState title={onlyUnread ? 'Nothing unread' : 'Nothing here yet'}>
              {tab === 'alerts'
                ? 'Alerts from your health department will appear here.'
                : tab === 'updates'
                  ? 'Updates on your appointments, lab results and prescriptions will appear here.'
                  : 'Reminders you set in Dates and Medicines will appear here.'}
            </EmptyState>
          ) : (
            <div className="c2-list" aria-live="polite">
              {shown.map((a) => (
                <article key={a.id} className={`c2-al${a.read ? '' : ' unread'}${a.severity === 'emergency' ? ' emg' : ''}`} role={a.severity === 'emergency' && !a.read ? 'alert' : undefined}>
                  {alertIcon(a)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <h2 className="c2-nm" style={{ margin: 0, fontSize: 15, lineHeight: '22px' }}>{a.title}</h2>
                      {a.severity === 'emergency' ? <Badge tone="danger" dot>Emergency</Badge> : <Badge tone="neutral">{GROUP_LABEL[a.group]}</Badge>}
                      {a.read ? null : <span className="c2-muted">Unread</span>}
                    </div>
                    <p style={{ margin: '4px 0 0' }}>{a.body}</p>
                    <div className="c2-muted" style={{ marginTop: 4 }}>
                      {a.issuer ? `${a.issuer} · ` : ''}
                      {whenText(a.at)}
                    </div>
                    <div className="acts">
                      {a.href && a.href.startsWith('/') ? (
                        <Link className="cf-btn cf-btn-secondary cf-btn-sm" to={a.href}>Open</Link>
                      ) : null}
                      {a.read ? null : (
                        <Button variant="ghost" size="sm" onClick={() => onMark([a.id])} loading={markRead.isPending && markRead.variables?.[0] === a.id}>
                          Mark as read
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="c2-stack" aria-label="Notification settings">
          <Box title="How we reach you" titleId="al-prefs">
            {prefs.isLoading ? (
              <Skeleton lines={5} />
            ) : prefs.isError ? (
              <ErrorBox error={prefs.error} onRetry={() => void prefs.refetch()} />
            ) : prefs.data ? (
              <>
                <div className="c2-lock" role="note">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={PATHS.lock} />
                  </svg>
                  {prefs.data.emergencyNote}
                </div>
                <div className="c2-table-scroll" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ textAlign: 'left', padding: '6px 0' }}>Notification</th>
                        {channels.map((c) => (
                          <th key={c} scope="col" style={{ padding: '6px 6px' }}>{CHANNEL_LABEL[c]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat) => (
                        <tr key={cat} style={{ borderTop: '1px solid var(--border)' }}>
                          <th scope="row" style={{ textAlign: 'left', fontWeight: 500, padding: '8px 8px 8px 0' }}>{PREF_LABEL[cat] ?? cat}</th>
                          {channels.map((ch) => {
                            const p = prefs.data!.prefs.find((x) => x.category === cat && x.channel === ch)
                            return (
                              <td key={ch} style={{ textAlign: 'center' }}>
                                {p ? (
                                  <input
                                    type="checkbox"
                                    style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                                    aria-label={`${PREF_LABEL[cat] ?? cat} by ${CHANNEL_LABEL[ch]}`}
                                    checked={p.enabled}
                                    disabled={p.locked || updatePrefs.isPending}
                                    onChange={(e) => onPref(cat, ch, e.target.checked)}
                                  />
                                ) : (
                                  <span aria-hidden="true">–</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Switch
                  label="Quiet hours"
                  description={`No sounds from ${prefs.data.quietHours.from} to ${prefs.data.quietHours.to}. Emergencies still reach you.`}
                  checked={prefs.data.quietHours.enabled}
                  onChange={onQuiet}
                  disabled={updatePrefs.isPending}
                />
              </>
            ) : null}
          </Box>
          <Alert tone="info" title="Simulated delivery">
            SMS, email and WhatsApp are mock connectors in this demo. Nothing is sent outside the app.
          </Alert>
        </aside>
      </div>
      {toast.node}
    </div>
  )
}

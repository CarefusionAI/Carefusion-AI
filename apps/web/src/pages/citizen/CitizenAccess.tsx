import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AccessHistoryRowDto, LiveSessionDto } from '@carefusion/shared'
import { Alert, Avatar, Badge, Button, EmptyState, Modal, Select, Skeleton, Switch, Table, Tabs, Textarea } from '../../components/ui'
import type { BadgeTone, TableColumn } from '../../components/ui'
import {
  errorMessage,
  useAccessHistory,
  useAccessOverview,
  useEndSession,
  useReportOpen,
  useRotatingKey,
  useSetAccessCategory,
} from '../../api/citizen1'
import { Async, Box, Head, KeyQr, LinkBtn, MutationError, Page, clock, fmt, useTick } from './CitizenKit'

// Share and access (CitizenAccess.dc.html): rotating key, live session, folder switches, history.

const STATUS: Record<AccessHistoryRowDto['status'], { tone: BadgeTone; label: string }> = {
  live: { tone: 'success', label: 'Live' },
  done: { tone: 'neutral', label: 'Closed' },
  ended: { tone: 'peach', label: 'Ended by you' },
  review: { tone: 'warning', label: 'Reviewed' },
}

function speakDigits(code: string) {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    synth.speak(new SpeechSynthesisUtterance(code.split('').join(' ')))
  } catch {
    // Speech is optional.
  }
}

function Hero() {
  useTick(1000)
  const key = useRotatingKey()
  const k = key.data
  const left = k ? Math.max(0, Math.ceil((new Date(k.expiresAt).getTime() - Date.now()) / 1000)) : 0
  const frac = k ? Math.min(1, left / k.windowSeconds) : 0
  return (
    <section className="c1-hero c1-in" aria-label="Your sharing key" style={{ animationDelay: '60ms' }}>
      <svg aria-hidden="true" viewBox="0 0 64 64" width="320" height="320" style={{ position: 'absolute', right: -90, top: -90, opacity: 0.08 }}>
        <rect x="21" y="5" width="18" height="50" rx="9" fill="#faf5ef" />
        <rect x="9" y="25" width="50" height="18" rx="9" fill="#faf5ef" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
        <span style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }}>
          Your key · changes every {k?.windowSeconds ?? 10} seconds
        </span>
        {key.isPending ? (
          <Skeleton width="80%" height={56} />
        ) : k ? (
          <span className="c1-code" aria-live="off">{k.display}</span>
        ) : (
          <span role="alert">The key is not available right now. {errorMessage(key.error, '')}</span>
        )}
        <div className="c1-kb">
          <span style={{ transform: `scaleX(${frac})` }} />
        </div>
        <p style={{ margin: 0, fontSize: 14 }}>
          {k ? `New key in ${left} s · ` : ''}each key works once, only inside a registered hospital.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="c1-kbtn solid" onClick={() => void key.refetch()}>New key now</button>
          <button type="button" className="c1-kbtn" disabled={!k} onClick={() => k && speakDigits(k.code)}>Read it aloud</button>
        </div>
      </div>
      <div className="c1-qr">
        {k ? <KeyQr code={k.code} size={190} label="QR code for the same key (demo drawing)" /> : <Skeleton width={190} height={190} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
        <span style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }}>How sharing works</span>
        {['Doctor types or scans your key at the hospital.', 'They see only the folders you allow below.', 'The session ends after 30 minutes, or when you end it.', 'Every open is written to your access history.'].map((t, i) => (
          <div className="c1-step" key={t}><b>{i + 1}</b><span>{t}</span></div>
        ))}
      </div>
    </section>
  )
}

function LiveSession({ s, ended, onEnd, ending }: { s: LiveSessionDto; ended: boolean; onEnd: () => void; ending: boolean }) {
  const go = useNavigate()
  const left = Math.max(0, Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / 1000))
  const total = Math.max(1, Math.round((new Date(s.expiresAt).getTime() - new Date(s.startedAt).getTime()) / 1000))
  const dash = 351.86 * (1 - left / total)
  return (
    <>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <svg className="c1-ring" viewBox="0 0 132 132" role="img" aria-label={`${Math.floor(left / 60)} minutes left of ${Math.round(total / 60)}`}>
          <circle className="bg" cx="66" cy="66" r="56" />
          <circle className="fg" cx="66" cy="66" r="56" strokeDasharray="351.86" strokeDashoffset={dash} />
          <text x="66" y="72" textAnchor="middle" fontSize="24" fontWeight="600" fill="#3f5263" fontFamily="IBM Plex Sans">{clock(left)}</text>
        </svg>
        <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Avatar name={s.doctorName} size={44} />
            <div>
              <strong className="c1-strong">{s.doctorName}</strong>
              <div className="c1-muted">{s.doctorLine}</div>
            </div>
          </div>
          <div className="c1-muted">{[s.facility, `started ${fmt.time(s.startedAt)}`].filter(Boolean).join(' · ')}</div>
          <div className="c1-flt">{s.scopeChips.map((c) => <span className="c1-chip" key={c}>{c}</span>)}</div>
        </div>
      </div>
      <div className="c1-flt">
        <Button variant="danger" size="md" loading={ending} disabled={ended} onClick={onEnd}>End session now</Button>
        <Button variant="outline" size="md" onClick={() => go('/citizen/messages')}>Message doctor</Button>
      </div>
    </>
  )
}

function SessionAndFolders() {
  useTick(1000)
  const overview = useAccessOverview()
  const end = useEndSession()
  const setCat = useSetAccessCategory()
  const [endedId, setEndedId] = useState<string | null>(null)
  const [endedAt, setEndedAt] = useState('')

  return (
    <section className="c1-grid c1-g2 c1-in" style={{ animationDelay: '120ms' }}>
      <Box
        title="Active session"
        actions={
          <span className={overview.data?.liveSessions.length ? 'c1-is-live' : 'c1-muted'}>
            <span className="c1-live" aria-hidden="true" />
            {overview.data?.liveSessions.length ? 'Live now' : 'No live session'}
          </span>
        }
      >
        <Async query={overview} what="your sessions" skeleton={<Skeleton lines={5} height={14} />}>
          {(o) => (
            <>
              {o.liveSessions.length === 0 ? (
                endedId ? (
                  <div className="c1-ended">
                    <strong className="c1-strong">Session ended by you at {endedAt}.</strong> The doctor can no longer open your record, and their app was told straight away. It stays in your history below.
                  </div>
                ) : (
                  <EmptyState title="Nobody has your record open">Show your key to a doctor to start a 30-minute session.</EmptyState>
                )
              ) : (
                o.liveSessions.map((s) => (
                  <LiveSession
                    key={s.id}
                    s={s}
                    ended={false}
                    ending={end.isPending && end.variables === s.id}
                    onEnd={() =>
                      end.mutate(s.id, {
                        onSuccess: () => {
                          setEndedId(s.id)
                          setEndedAt(fmt.time(new Date().toISOString()))
                        },
                      })
                    }
                  />
                ))
              )}
              <MutationError error={end.error} />
              {o.liveSessions[0] ? (
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div className="c1-bh"><h3 className="c1-bt" style={{ fontSize: 14 }}>Opened in this session</h3><span className="c1-muted">Live</span></div>
                  {o.liveSessions[0].openedInSession.length === 0 ? (
                    <span className="c1-muted">Nothing opened yet.</span>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: '6px 12px', fontSize: 13, alignItems: 'center' }}>
                      {o.liveSessions[0].openedInSession.map((i, idx) => (
                        <div key={idx} style={{ display: 'contents' }}>
                          <span className="c1-mono c1-muted">{fmt.time(i.at)}</span>
                          <span><strong className="c1-strong">{i.item}</strong> · {i.category}</span>
                          <span className="c1-chip">{i.state}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="c1-muted" style={{ margin: 0 }}>Imaging, genomics and mental health notes stay closed unless you switch them on.</p>
                </div>
              ) : null}
            </>
          )}
        </Async>
      </Box>

      <Box title="What a doctor can see" actions={overview.data ? <span className="c1-muted">{overview.data.sharedCount} of {overview.data.totalCategories} folders shared</span> : undefined}>
        <Async query={overview} what="your sharing switches" skeleton={<Skeleton lines={7} height={16} />}>
          {(o) => (
            <>
              {o.categories.map((c) => (
                <Switch
                  key={c.key}
                  label={c.label}
                  description={c.description}
                  checked={c.enabled}
                  disabled={c.locked || (setCat.isPending && setCat.variables?.key === c.key)}
                  onChange={(v) => setCat.mutate({ key: c.key, enabled: v })}
                />
              ))}
              <MutationError error={setCat.error} />
            </>
          )}
        </Async>
      </Box>
    </section>
  )
}

function History() {
  const [filter, setFilter] = useState<'all' | 'doctors' | 'staff'>('all')
  const history = useAccessHistory(filter)
  const rows = history.data?.rows ?? []
  const cols: TableColumn<AccessHistoryRowDto>[] = [
    { key: 'at', header: 'When', mono: true, width: 150, render: (r) => fmt.dateTime(r.at) },
    {
      key: 'who',
      header: 'Who',
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={r.who} size={28} />
          <strong>{r.who}</strong>
        </span>
      ),
    },
    { key: 'role', header: 'Role' },
    { key: 'how', header: 'How they got in' },
    { key: 'saw', header: 'What they saw' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={STATUS[r.status].tone} dot={r.status === 'live'}>{STATUS[r.status].label}</Badge>
      ),
    },
  ]
  return (
    <Box as="section" delay={180} label="Access history">
      <div className="c1-bh">
        <h2 className="c1-bt">Access history</h2>
        <Tabs
          label="Filter history"
          variant="segmented"
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          tabs={[
            { id: 'all', label: 'All', count: filter === 'all' ? history.data?.total : undefined },
            { id: 'doctors', label: 'Doctors' },
            { id: 'staff', label: 'Hospital staff' },
          ]}
        />
      </div>
      <Async query={history} what="your access history" skeleton={<Skeleton lines={6} height={16} />}>
        {(h) => (
          <>
            <Table
              caption="Who opened your record"
              columns={cols}
              rows={rows}
              rowKey="id"
              striped
              empty="No one has opened your record in this view."
            />
            <div className="c1-bh">
              <span className="c1-muted">Showing {rows.length} entries · {h.note}</span>
            </div>
          </>
        )}
      </Async>
    </Box>
  )
}

function ReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const history = useAccessHistory('all')
  const report = useReportOpen()
  const [sessionId, setSessionId] = useState('')
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const reportable = (history.data?.rows ?? []).filter((r) => r.sessionId)
  const options = reportable.map((r) => ({ value: r.sessionId as string, label: `${fmt.dateTime(r.at)} · ${r.who}` }))
  const chosen = sessionId || options[0]?.value || ''

  function close() {
    setDone(false)
    setText('')
    report.reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      title="Report an open"
      size="sm"
      onClose={close}
      footer={
        done ? (
          <Button onClick={close}>Close</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button
              loading={report.isPending}
              disabled={!chosen || text.trim().length < 3}
              onClick={() => report.mutate({ sessionId: chosen, text: text.trim() }, { onSuccess: () => setDone(true) })}
            >
              Send report
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Alert tone="success" title="Report sent">The hospital admin and the district officer can both see it.</Alert>
      ) : (
        <div className="c1-form">
          <p style={{ margin: 0 }}>Choose the entry you don't recognise and tell us why.</p>
          {options.length === 0 ? (
            <Alert tone="info" title="Nothing to report">Your history has no session entries yet.</Alert>
          ) : (
            <Select label="Which open?" options={options} value={chosen} onChange={setSessionId} />
          )}
          <Textarea label="What looks wrong?" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <MutationError error={report.error} />
        </div>
      )}
    </Modal>
  )
}

function Bottom() {
  const go = useNavigate()
  const overview = useAccessOverview()
  const [reporting, setReporting] = useState(false)
  return (
    <section className="c1-grid c1-g3 c1-in" style={{ animationDelay: '240ms' }}>
      <Box tone="peach" title="In an emergency" actions={<Badge tone="danger">Break-glass</Badge>}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: '22px' }}>
          {overview.data?.emergencyNote ??
            "If you can't share your key (unconscious, after an accident) an emergency doctor can open your emergency card only. They must give a reason, a second doctor confirms, and you get an alert straight away."}
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: '24px' }}>
          <li>Blood group, allergies, conditions, contact</li>
          <li>Ends after 60 minutes</li>
          <li>Reviewed by the district within 24 h</li>
        </ul>
      </Box>
      <Box title="Trusted family" actions={<LinkBtn onClick={() => go('/citizen/profile')}>Manage</LinkBtn>}>
        <Async query={overview} what="your family links" skeleton={<Skeleton lines={3} height={14} />}>
          {(o) =>
            o.family.length === 0 ? (
              <EmptyState title="No family links yet">Link a family member from your profile.</EmptyState>
            ) : (
              <div>
                {o.family.map((f) => (
                  <div className="c1-row" key={f.id}>
                    <Avatar name={f.name} size={36} />
                    <div className="c1-grow">
                      <strong className="c1-strong" style={{ fontSize: 14 }}>{f.name} · {f.relation}</strong>
                      <div className="c1-muted">{f.note}</div>
                    </div>
                    <Badge tone={f.status === 'active' ? 'success' : f.status === 'guardian' ? 'teal' : 'warning'}>
                      {f.status === 'active' ? 'Active' : f.status === 'guardian' ? 'Guardian' : 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            )
          }
        </Async>
      </Box>
      <Box title="Something looks wrong?">
        <p style={{ margin: 0, fontSize: 14, lineHeight: '22px' }}>
          If you don't recognise an open in your history, report it. The hospital's admin and the district officer both see your report.
        </p>
        <Button variant="outline" size="md" onClick={() => setReporting(true)}>Report an open</Button>
        <p className="c1-muted" style={{ margin: 0 }}>Grievance helpline 1800-000-0000 (demo)</p>
      </Box>
      <ReportModal open={reporting} onClose={() => setReporting(false)} />
    </section>
  )
}

export default function CitizenAccess() {
  const overview = useAccessOverview()
  const live = overview.data?.liveSessions.length ?? 0
  return (
    <Page label="Share and access">
      <Head
        eyebrow="Share & access"
        title="You decide who sees your record"
        sub="Show this key to one doctor. It opens a 30-minute session, then closes on its own."
        actions={
          overview.data ? (
            <>
              <Badge tone="success" dot={live > 0}>{live} live {live === 1 ? 'session' : 'sessions'}</Badge>
              <Badge tone="outline">{overview.data.opensThisMonth} opens this month</Badge>
            </>
          ) : undefined
        }
      />
      <Hero />
      <SessionAndFolders />
      <History />
      <Bottom />
    </Page>
  )
}

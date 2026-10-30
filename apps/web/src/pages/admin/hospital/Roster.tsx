import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, PageHeader } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useHospitalRoster, usePublishRoster, useUpdateRoster } from '../../../api/hospitalAdmin'
import type { HospitalRoster, RosterShift } from '../../../api/hospitalAdmin'
import { Async, Bar, Box, ConfirmModal, PageSkeleton, fmtDate, fmtDateTime, useFlash } from '../opsKit'

const SHIFT_LABEL: Record<RosterShift, string> = { op: 'OP', night: 'Night', off: 'Free', ward_round: 'Ward', teleconsult: 'Tele' }
const SHIFT_LONG: Record<RosterShift, string> = {
  op: 'OP shift',
  night: 'night on-call',
  off: 'free',
  ward_round: 'ward round',
  teleconsult: 'teleconsult',
}

/** Click cycle: free -> OP -> night -> free. Other shifts (ward round, teleconsult) go back to free. */
function nextShift(cur: RosterShift | null): RosterShift {
  if (cur === 'op') return 'night'
  if (cur === 'night') return 'off'
  if (cur === 'off' || cur === null) return 'op'
  return 'off'
}

function slotClass(s: RosterShift | null): string {
  if (s === 'op') return 'is-op'
  if (s === 'night') return 'is-night'
  if (s === 'ward_round' || s === 'teleconsult') return 'is-other'
  return ''
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function dayHead(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
}

function Grid({ r, weekStart, setWeekStart }: { r: HospitalRoster; weekStart: string; setWeekStart: (w: string) => void }) {
  const update = useUpdateRoster()
  const publish = usePublishRoster()
  const { show, node } = useFlash()
  const [draft, setDraft] = useState<Record<string, RosterShift>>({})
  const [confirming, setConfirming] = useState(false)

  useEffect(() => setDraft({}), [r.weekStart])

  const keyOf = (uid: string, date: string) => `${uid}|${date}`
  const eff = (uid: string, date: string): RosterShift | null => {
    const k = keyOf(uid, date)
    if (k in draft) return draft[k] as RosterShift
    return (r.doctors.find((d) => d.userId === uid)?.shifts[date] ?? null) as RosterShift | null
  }

  const coverage = useMemo(
    () =>
      r.days.map((date) => {
        let on = 0
        let night = 0
        for (const d of r.doctors) {
          const s = eff(d.userId, date)
          if (s && s !== 'off') on++
          if (s === 'night') night++
        }
        return { date, on, night, thin: on < r.rules.minDoctorsPerDay || night < r.rules.minNightOnCall }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, draft],
  )
  const thin = coverage.filter((c) => c.thin)
  const changedCount = Object.keys(draft).length
  const dirty = changedCount > 0

  function click(uid: string, date: string) {
    const cur = eff(uid, date)
    const next = nextShift(cur)
    const server = (r.doctors.find((d) => d.userId === uid)?.shifts[date] ?? null) as RosterShift | null
    setDraft((d) => {
      const copy = { ...d }
      const k = keyOf(uid, date)
      // Back to what the server already has (free is null or off) = no change.
      if (next === server || (server === null && next === 'off')) delete copy[k]
      else copy[k] = next
      return copy
    })
  }

  async function saveDraft(): Promise<boolean> {
    try {
      const cells = Object.entries(draft).map(([k, shift]) => {
        const [doctorUserId, date] = k.split('|') as [string, string]
        return { doctorUserId, date, shift }
      })
      await update.mutateAsync({ weekStart: r.weekStart, cells })
      setDraft({})
      return true
    } catch (e) {
      show('danger', errorMessage(e))
      return false
    }
  }

  async function doPublish() {
    if (dirty && !(await saveDraft())) return setConfirming(false)
    try {
      const res = await publish.mutateAsync({ weekStart: r.weekStart })
      setConfirming(false)
      show('success', res.message ?? 'Roster published.')
    } catch {
      /* in modal */
    }
  }

  const rangeLabel = `${fmtDate(r.days[0], false)} – ${fmtDate(r.days[6], false)}`
  return (
    <div className="ak-page">
      <PageHeader
        title="Doctor roster"
        subtitle={`Week of ${rangeLabel}. Click a slot to cycle free, OP, night. OP 08:00–14:00 · Night = casualty on-call.`}
        actions={
          <div className="ak-wrap">
            <Badge tone={dirty ? 'warning' : r.published ? 'success' : 'neutral'} dot>
              {dirty ? `${changedCount} unsaved` : r.published ? `Published ${fmtDateTime(r.publishedAt)}` : 'Draft'}
            </Badge>
            <Button variant="secondary" size="sm" disabled={!dirty} loading={update.isPending} onClick={() => void saveDraft().then((ok) => ok && show('success', 'Draft saved. Staff are not told until you publish.'))}>
              Save draft
            </Button>
            <Button variant="primary" size="sm" onClick={() => setConfirming(true)}>
              Publish roster
            </Button>
          </div>
        }
      />
      {node}
      <div className="ak-wrap" role="group" aria-label="Choose week">
        <Button variant="outline" size="sm" disabled={dirty} onClick={() => setWeekStart(shiftDate(weekStart, -7))}>
          Previous week
        </Button>
        <Button variant="outline" size="sm" disabled={dirty} onClick={() => setWeekStart(shiftDate(weekStart, 7))}>
          Next week
        </Button>
        {dirty ? <span className="ak-muted">Save or publish your edits before changing week.</span> : null}
      </div>
      <div className="ak-grid ak-g21 ak-in">
        <Box>
          {r.doctors.length === 0 ? (
            <p className="ak-muted">No active doctors work at this hospital yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div className="ak-rg" role="group" aria-label="Doctor roster for the week">
                <div className="ak-rg-row ak-rg-head">
                  <span className="ak-rg-dn">Doctor</span>
                  {r.days.map((d) => (
                    <span key={d} className="ak-rg-day">
                      {dayHead(d)}
                    </span>
                  ))}
                </div>
                {r.doctors.map((doc) => (
                  <div key={doc.userId} className="ak-rg-row">
                    <span className="ak-rg-dn">
                      {doc.name}
                      <span className="ak-muted" style={{ display: 'block', fontWeight: 400 }}>
                        {doc.department ?? ''}
                      </span>
                    </span>
                    {r.days.map((date) => {
                      const s = eff(doc.userId, date)
                      const changed = keyOf(doc.userId, date) in draft
                      return (
                        <button
                          key={date}
                          type="button"
                          className={`ak-slot ${slotClass(s)}${changed ? ' is-changed' : ''}`}
                          aria-label={`${doc.name}, ${dayHead(date)}: ${s ? SHIFT_LONG[s] : 'free'}${changed ? ', unsaved' : ''}. Activate to change.`}
                          onClick={() => click(doc.userId, date)}
                        >
                          {s && s !== 'off' ? SHIFT_LABEL[s] : '+'}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="ak-wrap ak-muted" style={{ gap: 16 }}>
            <span className="ak-legend"><span className="ak-legend-swatch is-op" />OP shift</span>
            <span className="ak-legend"><span className="ak-legend-swatch is-night" />Night on-call</span>
            <span className="ak-legend"><span className="ak-legend-swatch" />Free</span>
          </div>
        </Box>
        <div className="ak-col">
          <Box title="Coverage this week">
            {coverage.map((c) => (
              <div key={c.date} className="ak-rb">
                <span className="ak-muted">{dayHead(c.date).split(' ')[0]}</span>
                <Bar pct={(c.on / Math.max(1, r.rules.minDoctorsPerDay)) * 100} tone={c.thin ? 'low' : undefined} />
                <span className="ak-muted" title={`${c.night} on night call`}>
                  {c.on}/{r.doctors.length}
                </span>
              </div>
            ))}
            <p className="ak-muted ak-table-note">
              Minimum {r.rules.minDoctorsPerDay} doctors a day and {r.rules.minNightOnCall} on night call.
            </p>
          </Box>
          {thin.length ? (
            <Alert tone="warning" title={`Thin cover on ${thin.length} ${thin.length === 1 ? 'day' : 'days'}`}>
              {thin.map((c) => `${dayHead(c.date)} (${c.on} on duty, ${c.night} night)`).join('; ')}
            </Alert>
          ) : (
            <Alert tone="success" title="Every day is covered">
              Each day meets the minimum for OP and night on-call.
            </Alert>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirming}
        title="Publish this roster?"
        confirmLabel="Publish roster"
        busy={update.isPending || publish.isPending}
        error={publish.isError ? errorMessage(publish.error) : null}
        onConfirm={() => void doPublish()}
        onClose={() => setConfirming(false)}
      >
        <p className="ak-p">
          Every doctor on the roster is told their shifts for {rangeLabel} (simulated message). Changing a published week later turns it back into a draft until you publish again.
        </p>
        {dirty ? <p className="ak-p">Your {changedCount} unsaved {changedCount === 1 ? 'edit is' : 'edits are'} saved first.</p> : null}
        {thin.length ? (
          <Alert tone="warning" title="Cover is thin">
            {thin.length} {thin.length === 1 ? 'day is' : 'days are'} below the minimum. You can still publish.
          </Alert>
        ) : null}
      </ConfirmModal>
    </div>
  )
}

export default function Roster() {
  const [weekStart, setWeekStart] = useState('')
  const q = useHospitalRoster(weekStart)
  // First load: the API picks the current week; remember it so Previous/Next can step from it.
  const loaded = q.data?.weekStart
  useEffect(() => {
    if (!weekStart && loaded) setWeekStart(loaded)
  }, [weekStart, loaded])
  return (
    <Async query={q} skeleton={<PageSkeleton stats={false} boxes={2} />}>
      {(r) => <Grid r={r} weekStart={weekStart || r.weekStart} setWeekStart={setWeekStart} />}
    </Async>
  )
}

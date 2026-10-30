import { useState } from 'react'
import type { GovBlood } from '@carefusion/shared'
import { useGovBlood, useNotifyDonors } from '../../../../api/gov'
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Skeleton, StatCard, Table } from '../../../../components/ui'
import { ActionModal, KV, QueryState, WidgetView } from '../common'
import { C, HBars } from '../charts'
import type { SectionProps } from '../types'
import { fmtDateTime, fmtNum, humanise } from '../util'

type Bank = GovBlood['banks'][number]
type Request = GovBlood['requests'][number]

const LEVEL_TEXT = { low: 'Low', watch: 'Watch', good: 'Good' } as const

function levelBadge(level: Bank['level']) {
  if (!level) return <Badge tone="neutral">No data</Badge>
  return <Badge tone={level === 'low' ? 'danger' : level === 'watch' ? 'warning' : 'success'}>{LEVEL_TEXT[level]}</Badge>
}

function Body({ b, goTo }: { b: GovBlood } & SectionProps) {
  const notify = useNotifyDonors()
  const [req, setReq] = useState<Request | null>(null)
  const [notified, setNotified] = useState<Set<string>>(new Set())
  const call = b.callForDonors

  return (
    <div className="gv-stack">
      <PageHeader
        eyebrow="Blood and organ network"
        title="Blood and organ"
        subtitle="Blood banks and the organ pledges of citizens in your area. Waiting-list numbers are counts only."
        actions={
          call ? (
            <Button
              variant="soft"
              onClick={() => goTo('alerts', { alertDraft: { title: call.title.slice(0, 80), body: call.body, category: call.category || 'blood_donation' } })}
            >
              Call for donors
            </Button>
          ) : undefined
        }
      />
      <div className="gv-grid-4">
        <WidgetView w={b.stock} title="Stock not available" compact>
          {(s) => <StatCard tone="peach" label="Units in stock" value={fmtNum(s.totalUnits)} hint={`${b.banks.length} blood bank${b.banks.length === 1 ? '' : 's'}`} />}
        </WidgetView>
        <StatCard tone="sage" label="Registered donors" value={fmtNum(b.donors.registered)} hint={`${fmtNum(b.donors.ready)} ready to donate`} />
        <StatCard tone="blue" label="Organ pledges" value={fmtNum(b.organPledges.registered)} hint={`${fmtNum(b.organPledges.inProgress)} in progress`} />
        <WidgetView w={b.transplantsThisYear} title="Transplants not available" compact>
          {(n) => <StatCard label="Transplants this year" value={fmtNum(n)} hint="Counts only" />}
        </WidgetView>
      </div>

      <div className="gv-split">
        <div className="gv-stack">
          <Card title="Blood requests from hospitals" titleAs="h2" actions={<span className="gv-muted">{b.requests.length} open</span>}>
            {b.requests.length ? (
              <ul className="gv-list" aria-label="Open blood requests">
                {b.requests.map((r) => {
                  const done = notified.has(r.id)
                  return (
                    <li key={r.id} className="gv-li">
                      <div className="gv-li-head">
                        <p className="gv-li-title">
                          Blood needed · {r.bloodGroup} · {r.units} unit{r.units === 1 ? '' : 's'}
                        </p>
                        <Badge tone={r.urgency === 'critical' || r.urgency === 'urgent' ? 'danger' : 'warning'}>{humanise(r.urgency)}</Badge>
                      </div>
                      <p className="gv-li-sub">
                        {r.hospital} · {r.district}
                        {r.closesAt ? ` · needed by ${fmtDateTime(r.closesAt)}` : ''}
                      </p>
                      <div>
                        {done ? (
                          <Badge tone="success" dot>
                            Donors notified · Citizen app
                          </Badge>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => setReq(r)}>
                            Notify matching donors
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState title="No open blood requests" titleAs="h4">
                Requests from hospitals in your area appear here.
              </EmptyState>
            )}
          </Card>
          <Card title="Blood banks" titleAs="h2">
            <Table<Bank>
              caption="Blood banks and days of cover"
              rows={b.banks}
              rowKey="id"
              empty="No blood banks reported."
              columns={[
                { key: 'name', header: 'Blood bank', render: (r) => <span>{r.name}<span className="gv-muted"> · {r.district}</span></span> },
                { key: 'units', header: 'Units', align: 'right', render: (r) => fmtNum(r.units) },
                { key: 'days', header: 'Cover', align: 'right', render: (r) => (r.daysCover === null ? '–' : `${Math.round(r.daysCover)} d`) },
                { key: 'level', header: 'State', render: (r) => levelBadge(r.level) },
              ]}
            />
          </Card>
          <Card title="Donation camps" titleAs="h2">
            {b.camps.length ? (
              <ul className="gv-list" aria-label="Upcoming donation camps">
                {b.camps.map((c) => (
                  <li key={c.id} className="gv-li">
                    <div className="gv-li-head">
                      <p className="gv-li-title">{c.name}</p>
                      <span className="gv-muted">{c.targetUnits ? `target ${fmtNum(c.targetUnits)} units` : ''}</span>
                    </div>
                    <p className="gv-li-sub">
                      {c.venue} · {c.district} · {fmtDateTime(c.startsAt)} · {fmtNum(c.pledges)} pledges
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No upcoming camps" titleAs="h4" />
            )}
          </Card>
        </div>
        <div className="gv-stack">
          <Card title="Stock by blood group" titleAs="h3">
            <WidgetView w={b.stock} title="Stock not available">
              {(s) => (
                <div className="gv-tight">
                  {s.lowGroups.length ? (
                    <Alert tone="warning" title={`Low stock: ${s.lowGroups.join(', ')}`}>
                      Under {s.thresholds.lowBelowDays} days of cover.
                    </Alert>
                  ) : null}
                  <HBars
                    label="Blood stock by group, days of cover (low under 4 days, watch under 7)"
                    rows={s.byGroup.map((g) => ({
                      label: g.group,
                      value: g.daysCover ?? 0,
                      max: 14,
                      display: `${g.units} · ${g.daysCover === null ? '–' : `${Math.round(g.daysCover)} d`}`,
                      status: g.level ?? undefined,
                      color: g.level === 'low' ? C.rose : g.level === 'watch' ? C.goldSoft : C.tealSoft,
                    }))}
                  />
                  <p className="gv-muted">Shown as units · days of cover. Words and numbers carry the meaning, not colour alone: low is under {s.thresholds.lowBelowDays} days, watch under {s.thresholds.watchBelowDays}.</p>
                </div>
              )}
            </WidgetView>
          </Card>
          <Card title="Organ waiting list" titleAs="h3">
            <WidgetView w={b.waitingList} title="Waiting list not available">
              {(w) => (
                <div className="gv-tight">
                  <KV rows={w.organs.map((o) => [humanise(o.organ), fmtNum(o.waiting)] as [string, string])} />
                  <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
                  <KV
                    rows={[
                      ['Median wait · kidney', w.medianWaitKidneyDays === null ? '–' : `${Math.round(w.medianWaitKidneyDays / 36.5) / 10} years`],
                      ['Certified transplant centres', fmtNum(w.certifiedTransplantCentres)],
                    ]}
                  />
                  <p className="gv-muted">{w.medianNote}</p>
                  <p className="gv-muted">As of {w.asOf}</p>
                </div>
              )}
            </WidgetView>
          </Card>
        </div>
      </div>

      <ActionModal
        open={req !== null}
        title="Notify matching donors?"
        confirmLabel="Notify donors"
        noReason
        onClose={() => setReq(null)}
        onConfirm={async () => {
          await notify.mutateAsync(req!.id)
          setNotified((s) => new Set(s).add(req!.id))
          return `Donors notified · ${req!.bloodGroup} · ${req!.hospital}`
        }}
      >
        <p className="gv-body">
          Registered donors with blood group <strong>{req?.bloodGroup}</strong> near <strong>{req?.hospital}</strong> get a message in the citizen app. No donor details are shown to you.
        </p>
      </ActionModal>
    </div>
  )
}

export default function Blood(props: SectionProps) {
  const q = useGovBlood()
  return (
    <QueryState q={q} skeleton={<Skeleton height={320} radius={16} />}>
      {(b) => <Body {...props} b={b} />}
    </QueryState>
  )
}

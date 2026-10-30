import { useMemo, useState } from 'react'
import { Alert, Badge, Button, Select } from '../../../components/ui'
import { errMessage } from '../../../api/nurse'
import { useLabOrder, useLabRecent, useLabWorklist, useResultStage } from '../../../api/lab'
import { BoxHead, Empty, ErrorBlock, FlagBadge, Loading, PageLoading, flagFromServer, fmtDateTime } from './common'
import { ConfirmModal } from '../nurse/dialogs'
import type { Go } from '../nurse/types'

/** Release verified results and see what went out. (PDF attachment is not part of the alpha API: results are structured values.) */
export default function Upload({ orderId, go }: { orderId: string | null; go: Go }) {
  const wl = useLabWorklist()
  const recent = useLabRecent(48)
  const stage = useResultStage()
  const options = useMemo(() => (wl.data?.orders ?? []).filter((o) => o.stage === 'to_release'), [wl.data])
  const id = orderId ?? options[0]?.orderId ?? null
  const detail = useLabOrder(id)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  if (wl.isLoading) return <PageLoading title="reports" />
  if (wl.isError) return <ErrorBlock error={wl.error} onRetry={() => void wl.refetch()} />

  const d = detail.data
  const result = d?.results.find((r) => r.status === 'verified')
  const crit = (result?.values ?? []).filter((v) => v.isCritical)

  return (
    <div className="lb-pg">
      <header>
        <h1 className="lb-h1">Reports and release</h1>
        <p className="lb-sub">A report belongs to an order. There is no way to add a result to a patient directly.</p>
      </header>

      <section className="lb-grid lb-g21">
        <div className="lb-box">
          <BoxHead title="Release a verified result" />
          <Alert tone="info" title="Structured results in the alpha">
            Results are released as values with ranges and flags. Attaching a PDF report is not part of the alpha service yet.
          </Alert>
          {options.length === 0 ? (
            <Empty title="Nothing is waiting for release" action={<Button variant="secondary" onClick={() => go('results')}>Go to result entry</Button>}>
              Verify a result first. Verified results wait here for release.
            </Empty>
          ) : (
            <>
              <Select
                label="Order"
                options={options.map((o) => ({ value: o.orderId, label: `${o.orderRef} · ${o.patientName} · ${o.tests}` }))}
                value={id ?? ''}
                onChange={(v) => { setMsg(null); go('upload', { order: v }) }}
                helper="Only verified results from this lab"
              />
              {detail.isLoading ? (
                <Loading rows={4} label="Loading result" />
              ) : detail.isError ? (
                <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
              ) : result ? (
                <>
                  <div className="lb-pend">
                    {result.values.map((v) => (
                      <div className="lb-pend-r" key={v.id}>
                        <span className="lb-grow">{v.testName}</span>
                        <strong>{v.valueNum ?? v.valueText}{v.unit ? ` ${v.unit}` : ''}</strong>
                        <FlagBadge kind={flagFromServer(v.flag)} />
                      </div>
                    ))}
                  </div>
                  <dl className="lb-kvx">
                    <div><dt>Patient</dt><dd>{d!.patient.fullName}</dd></div>
                    <div><dt>Released to</dt><dd>{d!.order.orderedBy ?? 'Ordering doctor'}{crit.length ? '' : ' · patient'}</dd></div>
                    <div><dt>Verified by</dt><dd>{result.verifiedBy ?? '-'}</dd></div>
                    <div><dt>Critical values</dt><dd className={crit.length ? 'is-bad' : 'is-good'}>{crit.length ? `${crit.length} · call needed` : 'None'}</dd></div>
                  </dl>
                  {msg ? <Alert tone={msg.ok ? 'success' : 'danger'} title={msg.ok ? 'Released' : 'Not released'}>{msg.text}</Alert> : null}
                  <div className="lb-actions">
                    <Button onClick={() => { setModalError(null); setConfirm(true) }}>Release result</Button>
                    <Button variant="secondary" onClick={() => go('results', { order: d!.order.id })}>Open in result entry</Button>
                  </div>
                </>
              ) : (
                <Empty title="No verified result on this order">Verify the result in result entry first.</Empty>
              )}
            </>
          )}
        </div>

        <div className="lb-box">
          <BoxHead title="Recently released · 48 h" />
          {recent.isLoading ? (
            <Loading rows={4} label="Loading released results" />
          ) : recent.isError ? (
            <ErrorBlock error={recent.error} onRetry={() => void recent.refetch()} />
          ) : (recent.data ?? []).length === 0 ? (
            <Empty title="Nothing released yet">Released results show here.</Empty>
          ) : (
            recent.data!.map((r) => (
              <div className="lb-row" key={r.resultId}>
                <span className="lb-pdf" aria-hidden="true">RES</span>
                <div className="lb-grow">
                  <strong className="lb-strong">{r.tests} · {r.patientName}</strong>
                  <div className="lb-muted">{r.orderRef} · {fmtDateTime(r.releasedAt)}</div>
                </div>
                {r.hasCritical ? <Badge tone="danger" icon={<span>‼</span>}>Critical</Badge> : <Badge tone="success" icon={<span>✓</span>}>Sent</Badge>}
              </div>
            ))
          )}
          <div className="lb-pend">
            <div className="lb-pend-r"><span className="lb-pd" aria-hidden="true" /><span className="lb-grow">Patients see released results in their Lab folder</span></div>
            <div className="lb-pend-r"><span className="lb-pd" aria-hidden="true" /><span className="lb-grow">Critical results wait for the doctor's call first</span></div>
            <div className="lb-pend-r"><span className="lb-pd" aria-hidden="true" /><span className="lb-grow">Released reports are kept and cannot be deleted</span></div>
          </div>
        </div>
      </section>

      <ConfirmModal
        open={confirm}
        title="Release this result?"
        confirmLabel="Release result"
        busy={stage.isPending}
        error={modalError}
        onClose={() => setConfirm(false)}
        onConfirm={() =>
          result &&
          stage.mutate(
            { resultId: result.id, stage: 'release' },
            {
              onSuccess: () => { setConfirm(false); setMsg({ ok: true, text: 'The ordering doctor has been told.' }) },
              onError: (e) => setModalError(errMessage(e)),
            },
          )
        }
      >
        <p style={{ margin: 0 }}>{d?.order.orderRef} · {d?.patient.fullName}. Releasing closes the order and cannot be undone.</p>
      </ConfirmModal>
    </div>
  )
}

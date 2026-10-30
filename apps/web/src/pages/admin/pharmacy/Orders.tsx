import { useState } from 'react'
import { Alert, Badge, Button, PageHeader, StatCard, Textarea } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useApprovePurchaseOrder, usePurchaseOrder, usePurchaseOrders, useSendBackPurchaseOrder } from '../../../api/pharmacyAdmin'
import type { PurchaseOrderStatus } from '../../../api/pharmacyAdmin'
import { Async, Box, Chips, ConfirmModal, EmptyBox, KV, PageSkeleton, fmtDate, humanise, inr, toneOfStatus, useFlash } from '../opsKit'

function Detail({ id, onClose, say }: { id: string; onClose: () => void; say: (tone: 'success' | 'danger', text: string) => void }) {
  const detail = usePurchaseOrder(id)
  const approve = useApprovePurchaseOrder()
  const sendBack = useSendBackPurchaseOrder()
  const [confirm, setConfirm] = useState<'approve' | 'back' | null>(null)
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const po = detail.data

  async function run() {
    if (!po) return
    setProblem(null)
    try {
      if (confirm === 'approve') {
        await approve.mutateAsync({ id })
        say('success', `${po.poNumber} approved. It can now go to the supplier.`)
      } else {
        if (reason.trim().length < 5) return setProblem('Say what needs to change.')
        await sendBack.mutateAsync({ id, reason: reason.trim() })
        say('success', `${po.poNumber} sent back to ${po.raisedBy}.`)
      }
      setConfirm(null)
      setReason('')
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }

  return (
    <Box
      title={po ? `${po.poNumber} · ${po.supplier}` : 'Order'}
      actions={<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}
    >
      {detail.isPending ? (
        <p className="ak-muted">Loading…</p>
      ) : detail.isError ? (
        <Alert tone="danger">{errorMessage(detail.error)}</Alert>
      ) : po ? (
        <>
          <KV
            items={[
              { label: 'Status', value: <Badge tone={toneOfStatus(po.status)} dot>{humanise(po.status)}</Badge> },
              { label: 'Raised by', value: po.raisedBy },
              { label: 'Date', value: fmtDate(po.date) },
              { label: 'Expected', value: fmtDate(po.expectedOn) },
              { label: 'Total', value: inr(po.amount) },
              { label: 'Type', value: po.isIndent ? 'Indent' : 'Purchase order' },
            ]}
            cols={3}
          />
          {po.holdReason ? <Alert tone="warning" title="On hold">{po.holdReason}</Alert> : null}
          <div style={{ overflowX: 'auto' }}>
            <table className="ak-table">
              <thead>
                <tr><th scope="col">Medicine</th><th scope="col">Qty</th><th scope="col">Unit cost</th><th scope="col">Line total</th><th scope="col">Received</th></tr>
              </thead>
              <tbody>
                {po.lineItems.map((l) => (
                  <tr key={l.id}><td>{l.medicine}</td><td>{l.quantity}</td><td>{inr(l.unitCost)}</td><td>{inr(l.lineTotal)}</td><td>{l.receivedQty}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {po.status === 'pending_approval' ? (
            po.canApprove ? (
              <div className="ak-wrap">
                <Button onClick={() => setConfirm('approve')}>Approve order</Button>
                <Button variant="secondary" onClick={() => setConfirm('back')}>Send back</Button>
              </div>
            ) : (
              <Alert tone="info" title="You cannot approve this one">An order over the limit needs a different person than the one who raised it.</Alert>
            )
          ) : null}
        </>
      ) : null}
      <ConfirmModal
        open={confirm !== null}
        title={confirm === 'approve' ? `Approve ${po?.poNumber ?? 'order'}?` : `Send ${po?.poNumber ?? 'order'} back?`}
        confirmLabel={confirm === 'approve' ? `Approve ${po ? inr(po.amount) : ''}` : 'Send back'}
        busy={approve.isPending || sendBack.isPending}
        error={problem}
        onConfirm={() => void run()}
        onClose={() => { setConfirm(null); setProblem(null) }}
      >
        {confirm === 'approve' ? (
          <p>This commits {po ? inr(po.amount) : 'the amount'} to {po?.supplier}. You cannot undo it here.</p>
        ) : (
          <Textarea label="What needs to change?" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        )}
      </ConfirmModal>
    </Box>
  )
}

export default function PharmacyOrders() {
  const [status, setStatus] = useState<PurchaseOrderStatus | ''>('')
  const orders = usePurchaseOrders(status)
  const [open, setOpen] = useState<string | null>(null)
  const { node, show } = useFlash()

  return (
    <div className="ak-page">
      <PageHeader
        eyebrow="Stock"
        title="Purchase orders"
        subtitle="Orders to suppliers and indents to the state store. An order above the limit needs a second person to approve it."
      />
      {node}
      <Async query={orders} skeleton={<PageSkeleton boxes={1} />}>
        {(d) => (
          <>
            <section className="ak-grid ak-g4" aria-label="Order summary">
              <StatCard label="Awaiting approval" value={d.kpis.awaitingApproval} tone="peach" hint={`Limit ${inr(d.approvalThreshold)}`} />
              <StatCard label="In transit" value={d.kpis.inTransit} tone="blue" />
              <StatCard label="Spend this month" value={inr(d.kpis.spendThisMonth)} tone="sage" />
              <StatCard label="On-time delivery" value={d.kpis.onTimeDeliveryPct === null ? '—' : `${d.kpis.onTimeDeliveryPct}%`} />
            </section>
            <Box>
              <Chips
                label="Status"
                value={status}
                onChange={(v) => setStatus(v as PurchaseOrderStatus | '')}
                options={[
                  { id: '', label: 'All' },
                  { id: 'pending_approval', label: 'Needs approval' },
                  { id: 'approved', label: 'Approved' },
                  { id: 'in_transit', label: 'In transit' },
                  { id: 'received', label: 'Received' },
                  { id: 'held', label: 'On hold' },
                ]}
              />
            </Box>
            {d.items.length === 0 ? (
              <EmptyBox title="No orders">Nothing matches this filter.</EmptyBox>
            ) : (
              <Box title="Orders">
                <div style={{ overflowX: 'auto' }}>
                  <table className="ak-table">
                    <thead>
                      <tr>
                        <th scope="col">Order</th><th scope="col">Supplier</th><th scope="col">Lines</th><th scope="col">Amount</th><th scope="col">Raised by</th><th scope="col">Expected</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Open</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((o) => (
                        <tr key={o.id}>
                          <td className="ak-mono">{o.poNumber}{o.isIndent ? ' · indent' : ''}</td>
                          <td>{o.supplier}</td>
                          <td>{o.lines}</td>
                          <td>{inr(o.amount)}</td>
                          <td>{o.raisedBy}</td>
                          <td>{fmtDate(o.expectedOn)}</td>
                          <td><Badge tone={toneOfStatus(o.status)} dot>{humanise(o.status)}</Badge></td>
                          <td><Button size="sm" variant="secondary" onClick={() => setOpen(o.id)}>{o.needsApproval ? 'Review' : 'Open'}</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Box>
            )}
            {open ? <Detail id={open} onClose={() => setOpen(null)} say={show} /> : null}
          </>
        )}
      </Async>
    </div>
  )
}

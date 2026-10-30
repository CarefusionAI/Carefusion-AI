import { useEffect, useState } from 'react'
import { Badge, Button, PageHeader, Select, TextField, Textarea } from '../../../components/ui'
import type { BadgeTone } from '../../../components/ui'
import { errorMessage } from '../../../api/adminHttp'
import { useAdjustStock, useInventory, useSetPublished } from '../../../api/pharmacyAdmin'
import type { InventoryFilter } from '../../../api/pharmacyAdmin'
import { Async, Box, Chips, ConfirmModal, EmptyBox, PageSkeleton, fmtDate, inr, num, useFlash } from '../opsKit'
import { MiniSwitch } from './shared'

type Item = NonNullable<ReturnType<typeof useInventory>['data']>['items'][number]
type AdjustType = 'adjustment' | 'write_off' | 'return_to_supplier' | 'quarantine'

const LEVEL: Record<Item['level'], { label: string; tone: BadgeTone }> = {
  ok: { label: 'In stock', tone: 'success' },
  low: { label: 'Low', tone: 'warning' },
  blocked: { label: 'Blocked', tone: 'danger' },
  expired: { label: 'Expired', tone: 'danger' },
}

const TYPE_LABEL: Record<AdjustType, string> = {
  adjustment: 'Count correction',
  write_off: 'Write off',
  return_to_supplier: 'Return to supplier',
  quarantine: 'Quarantine',
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function PharmacyInventory() {
  const [filter, setFilter] = useState<InventoryFilter>('all')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(50)
  const q = useDebounced(search)
  const inventory = useInventory(filter, category, q, limit)
  const publish = useSetPublished()
  const adjust = useAdjustStock()
  const { node, show } = useFlash()

  const [target, setTarget] = useState<Item | null>(null)
  const [type, setType] = useState<AdjustType>('adjustment')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function openAdjust(it: Item) {
    setTarget(it)
    setType('adjustment')
    setDirection('in')
    setQuantity('')
    setReason('')
    setProblem(null)
  }

  async function togglePublished(it: Item, published: boolean) {
    try {
      await publish.mutateAsync({ id: it.id, published })
      show('success', `${it.medicine} is now ${published ? 'visible' : 'hidden'} in the medicine finder.`)
    } catch (e) {
      show('danger', errorMessage(e))
    }
  }

  async function submitAdjust() {
    if (!target) return
    const n = Number(quantity)
    if (type !== 'quarantine' && (!Number.isInteger(n) || n < 1)) return setProblem('Enter a whole number of units, 1 or more.')
    if (reason.trim().length < 5) return setProblem('Write a short reason for the audit log.')
    setProblem(null)
    try {
      await adjust.mutateAsync({ id: target.id, type, quantity: type === 'quarantine' ? 0 : n, direction: type === 'adjustment' ? direction : undefined, reason: reason.trim() })
      show('success', `${TYPE_LABEL[type]} saved for ${target.medicine}, batch ${target.batchNo}.`)
      setTarget(null)
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }

  return (
    <div className="ak-page">
      <PageHeader
        eyebrow="Stock"
        title="Inventory and finder"
        subtitle="Every batch on your shelves. Switch a batch off to hide it from the citizen medicine finder. Blocked and expired batches are never shown."
      />
      {node}
      <Box>
        <div className="ak-wrap" style={{ alignItems: 'flex-end' }}>
          <TextField label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Medicine or batch" />
          <Select
            label="Category"
            value={category}
            onChange={setCategory}
            options={[{ value: '', label: 'All categories' }, ...(inventory.data?.categories ?? []).map((c) => ({ value: c, label: c }))]}
          />
          <Chips
            label="Show"
            value={filter}
            onChange={(v) => setFilter(v as InventoryFilter)}
            options={[
              { id: 'all', label: 'All' },
              { id: 'low', label: 'Low' },
              { id: 'hidden', label: 'Hidden' },
              { id: 'blocked', label: 'Blocked' },
            ]}
          />
        </div>
      </Box>

      <Async query={inventory} skeleton={<PageSkeleton stats={false} boxes={1} />}>
        {(d) => (
          <Box title={`${num(d.matching)} of ${num(d.totalBatches)} batches`} actions={<span className="ak-muted">{num(d.totalSkus)} medicines</span>}>
            {d.items.length === 0 ? (
              <EmptyBox title="No batches match">Try another search or filter.</EmptyBox>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="ak-table">
                  <thead>
                    <tr>
                      <th scope="col">Medicine</th>
                      <th scope="col">Batch</th>
                      <th scope="col">On hand</th>
                      <th scope="col">Expiry</th>
                      <th scope="col">Price</th>
                      <th scope="col">Status</th>
                      <th scope="col">In finder</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <strong className="ak-strong">{it.medicine}</strong>
                          <div className="ak-muted">{it.form}{it.schedule !== 'OTC' && it.schedule !== 'none' ? ` · Schedule ${it.schedule}` : ''}</div>
                        </td>
                        <td className="ak-mono">{it.batchNo}</td>
                        <td>{num(it.onHand)} <span className="ak-muted">/ min {num(it.min)}</span></td>
                        <td>{fmtDate(it.expiry)}</td>
                        <td>{inr(it.unitPrice)}</td>
                        <td>
                          <Badge tone={LEVEL[it.level].tone} dot>{LEVEL[it.level].label}</Badge>
                          {it.blockedReason ? <div className="ak-muted">{it.blockedReason}</div> : null}
                        </td>
                        <td>
                          <MiniSwitch
                            on={it.published && !it.blockedReason}
                            label={`${it.medicine} batch ${it.batchNo} visible in the finder`}
                            disabled={!!it.blockedReason || it.level === 'expired' || publish.isPending}
                            title={it.blockedReason ? 'Blocked batches cannot be published' : undefined}
                            onChange={(v) => void togglePublished(it, v)}
                          />
                        </td>
                        <td><Button size="sm" variant="secondary" onClick={() => openAdjust(it)}>Adjust</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {d.showing < d.matching ? (
              <div style={{ marginTop: 12 }}>
                <Button variant="secondary" onClick={() => setLimit(limit + 50)}>Show more</Button>
              </div>
            ) : null}
          </Box>
        )}
      </Async>

      <ConfirmModal
        open={!!target}
        title={target ? `${target.medicine} · batch ${target.batchNo}` : ''}
        confirmLabel="Save change"
        danger={type === 'write_off'}
        busy={adjust.isPending}
        error={problem}
        onConfirm={() => void submitAdjust()}
        onClose={() => setTarget(null)}
      >
        <Select label="What happened?" value={type} onChange={(v) => setType(v as AdjustType)} options={(Object.keys(TYPE_LABEL) as AdjustType[]).map((v) => ({ value: v, label: TYPE_LABEL[v] }))} />
        {type === 'adjustment' ? (
          <Select label="Direction" value={direction} onChange={(v) => setDirection(v as 'in' | 'out')} options={[{ value: 'in', label: 'Add units (found more)' }, { value: 'out', label: 'Remove units (found fewer)' }]} />
        ) : null}
        {type !== 'quarantine' ? <TextField label="Units" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} /> : <p className="ak-muted">The whole batch will stop being offered at the counter and in the finder.</p>}
        <Textarea label="Reason (kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </ConfirmModal>
    </div>
  )
}

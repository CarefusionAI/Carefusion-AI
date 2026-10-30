import { useEffect, useState } from 'react'
import { Badge, Table } from '../../../components/ui'
import type { BadgeTone, TableColumn } from '../../../components/ui'
import { usePharmacyStock } from '../../../api/doctor'
import type { PharmacyStockRow } from '../../../api/doctor'
import { Box, ErrorNote, Header, Loading } from '../parts'

const TONE: Record<string, BadgeTone> = { in: 'success', low: 'warning', out: 'danger', unknown: 'neutral' }
const LABEL: Record<string, string> = { in: 'In stock', low: 'Low', out: 'Out of stock', unknown: 'Unknown' }

export default function StockSection() {
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  const stock = usePharmacyStock(dq)

  const cols: TableColumn<PharmacyStockRow>[] = [
    {
      key: 'medicine',
      header: 'Medicine',
      render: (r) => (
        <span>
          <strong className="dr-strong">{r.medicine}</strong> <span className="dr-muted">{r.form}</span>
          {r.janAushadhi ? (
            <>
              {' '}
              <Badge tone="teal">Jan Aushadhi</Badge>
            </>
          ) : null}
        </span>
      ),
    },
    {
      key: 'pharmacy',
      header: 'Pharmacy',
      render: (r) => (
        <span>
          {r.pharmacy}
          {r.ownPharmacy ? (
            <>
              {' '}
              <Badge tone="info">Your hospital</Badge>
            </>
          ) : null}
        </span>
      ),
    },
    { key: 'distanceKm', header: 'Distance', align: 'right', render: (r) => (r.distanceKm != null ? `${r.distanceKm} km` : '-') },
    { key: 'status', header: 'Stock', render: (r) => <Badge tone={TONE[r.status] ?? 'neutral'}>{LABEL[r.status] ?? r.status}</Badge> },
    { key: 'quantity', header: 'Quantity', align: 'right', render: (r) => r.quantity ?? '-' },
    { key: 'minPrice', header: 'From (Rs)', align: 'right', render: (r) => (r.minPrice != null ? r.minPrice.toFixed(2) : '-') },
  ]

  return (
    <div className="dr-page">
      <Header title="Pharmacy stock" subtitle="Check before you prescribe so patients don't walk to an empty counter." />
      <Box>
        <div>
          <label className="dr-lab" htmlFor="stq">
            Medicine
          </label>
          <input id="stq" className="dr-inp" placeholder="Search, e.g. insulin" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
      </Box>
      <Box>
        {stock.isLoading ? <Loading /> : null}
        <ErrorNote error={stock.error} title="Could not load stock" />
        {stock.data ? <Table columns={cols} rows={stock.data} striped caption="Pharmacy stock" empty="No medicine matches that name." /> : null}
      </Box>
    </div>
  )
}

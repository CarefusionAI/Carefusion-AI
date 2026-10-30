import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePharmacistMe, useSetCounter } from '../../api/pharmacist'
import type { CounterState } from '../../api/pharmacist'
import { Alert, Badge } from '../../components/ui'
import { useToast } from '../citizen/c2kit'
import Queue from './pharmacist/Queue'
import { ExpirySection, LogSection, StockSection } from './pharmacist/Inventory'
import './pharmacist/pharmacist.css'

const SECTIONS = ['queue', 'stock', 'expiry', 'log'] as const
type SectionId = (typeof SECTIONS)[number]

const COUNTER_LABEL: Record<string, string> = { on: 'Counter open', break: 'On a break', off: 'Counter closed' }
const COUNTER_TONE = { on: 'success', break: 'warning', off: 'neutral' } as const

/** Pharmacist app (Staff Portal): dispense queue, stock, expiry and recalls, dispensing log. */
export default function PharmacistScreen() {
  const [params] = useSearchParams()
  const raw = params.get('section') as SectionId | null
  const section: SectionId = raw && SECTIONS.includes(raw) ? raw : 'queue'
  const me = usePharmacistMe()
  const setCounter = useSetCounter()
  const toast = useToast()
  const say = useCallback((m: string) => toast.show(m), [toast])

  const state = (me.data?.counter?.state ?? 'off') as CounterState
  const next: CounterState = state === 'on' ? 'break' : 'on'

  return (
    <div className="ph-page">
      {me.isError ? (
        <Alert tone="warning" title="Pharmacist account not found">
          This login has no active pharmacist profile, so the dispense queue cannot load. Sign in again as a pharmacist from the role selector.
        </Alert>
      ) : null}
      <header className="ph-bh">
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: 'var(--ink-strong)' }}>
            {section === 'queue' ? 'Dispense queue' : section === 'stock' ? 'Stock levels' : section === 'expiry' ? 'Expiry watch and recalls' : 'Dispensing log'}
          </h1>
          <p className="ph-muted">
            {me.data ? `${me.data.fullName} · ${me.data.pharmacyName ?? 'Pharmacy'}${me.data.licenceNo ? ` · licence ${me.data.licenceNo}` : ''}` : 'Loading…'}
          </p>
        </div>
        <div className="ph-row">
          <Badge tone={COUNTER_TONE[state] ?? 'neutral'} dot>{COUNTER_LABEL[state] ?? state}{me.data?.counter?.counter ? ` · ${me.data.counter.counter}` : ''}</Badge>
          <button
            type="button"
            className="ph-lk"
            disabled={setCounter.isPending}
            onClick={() => setCounter.mutate({ counter: me.data?.counter?.counter ?? undefined, state: next }, { onSuccess: () => say(next === 'on' ? 'Counter open' : 'Break started') })}
          >
            {state === 'on' ? 'Start a break' : 'Open counter'}
          </button>
        </div>
      </header>

      {section === 'queue' ? <Queue say={say} /> : null}
      {section === 'stock' ? <StockSection say={say} /> : null}
      {section === 'expiry' ? <ExpirySection say={say} /> : null}
      {section === 'log' ? <LogSection say={say} /> : null}
      {toast.node}
    </div>
  )
}

import type { BadgeTone } from '../../../components/ui'
import type { RxStage } from '../../../api/pharmacist'

export { fmtDate, fmtDateTime, fmtMinutes, fmtTime, todayIst } from '../radiology/util'

export const STAGE_LABEL: Record<RxStage, string> = { pending: 'Waiting', verified: 'Verified', ready: 'Ready to collect', collected: 'Collected' }
export const STAGE_TONE: Record<RxStage, BadgeTone> = { pending: 'warning', verified: 'teal', ready: 'info', collected: 'success' }

export const OUTCOME_LABEL: Record<string, string> = { dispensed: 'Given', substitute: 'Substitute given', out_of_stock: 'Out of stock' }
export const OUTCOME_TONE: Record<string, BadgeTone> = { dispensed: 'success', substitute: 'info', out_of_stock: 'danger' }

export const CHECK_LABEL: Record<string, string> = {
  esignature: 'e-Signature',
  qr: 'QR code',
  hpr: 'Prescriber HPR ID',
  validity: 'Validity',
  allergy: 'Allergy',
  interaction: 'Interactions',
  stock: 'Stock',
}

export const ACTION_LABEL: Record<string, string> = {
  quarantine: 'Quarantine (block from dispensing)',
  return_to_supplier: 'Return to supplier',
  write_off: 'Write off',
  adjustment: 'Stock adjustment (count correction)',
}

export function inr(n: number): string {
  return `₹ ${Math.round(n).toLocaleString('en-IN')}`
}

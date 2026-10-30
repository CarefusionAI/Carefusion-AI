import type { GovContext, GovUnitKind } from '@carefusion/shared'

/** Carried through router state when one section hands work to another (for example "Alert this block"). */
export interface GovNavState {
  alertTarget?: { unitId: string; unitName: string; unitKind: GovUnitKind }
  directoryTab?: 'doctors' | 'facilities' | 'staff' | 'grievances'
  alertDraft?: { title: string; body: string; category?: string; type?: 'advisory' | 'emergency' }
}

export interface SectionProps {
  ctx: GovContext
  /** Route path of this console, for example /district-admin. */
  path: string
  goTo: (section: string, state?: GovNavState) => void
  navState: GovNavState | null
}

export const DISEASE_NAMES: Record<string, string> = {
  dengue: 'Dengue',
  fever: 'Acute fever',
  lepto: 'Leptospirosis',
  malaria: 'Malaria',
  diarrhoea: 'Diarrhoea',
}

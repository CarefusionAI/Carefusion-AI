import type { AccessCategoryDto } from '@carefusion/shared/dist/citizen-app.js'

export const CATEGORY_META: { key: string; label: string; description: string; defaultOn: boolean }[] = [
  { key: 'lab', label: 'Lab reports', description: 'Blood tests and other lab results', defaultOn: true },
  { key: 'rx', label: 'Prescriptions and medicines', description: 'E-signed prescriptions and current medicines', defaultOn: true },
  { key: 'vitals', label: 'Home vitals', description: 'Blood pressure, sugar, weight', defaultOn: true },
  { key: 'imaging', label: 'Imaging', description: 'X-ray, ultrasound, CT', defaultOn: false },
  { key: 'genomic', label: 'Genomic results', description: 'Hidden unless you turn this on', defaultOn: false },
  { key: 'mental_health', label: 'Mental health notes', description: 'Extra private, off by default', defaultOn: false },
]

export function buildCategories(rows: { category: string; enabled: boolean }[]): AccessCategoryDto[] {
  const set = new Map(rows.map((r) => [r.category, r.enabled]))
  return [
    {
      key: 'emg',
      label: 'Emergency card',
      description: 'Always visible in emergencies; cannot be turned off',
      enabled: true,
      locked: true,
    },
    ...CATEGORY_META.map((m) => ({
      key: m.key,
      label: m.label,
      description: m.description,
      enabled: set.get(m.key) ?? m.defaultOn,
      locked: false,
    })),
  ]
}

const ITEM_CATEGORY: Record<string, string> = {
  lab_result: 'Lab reports',
  lab: 'Lab reports',
  prescription: 'Prescriptions',
  rx: 'Prescriptions',
  vital: 'Vitals',
  vitals: 'Vitals',
  imaging: 'Imaging',
  emergency_card: 'Emergency card',
  document: 'Documents',
}
export function itemCategory(kind: string): string {
  return ITEM_CATEGORY[kind] ?? 'Other'
}

export function modeText(mode: string): string {
  switch (mode) {
    case 'key':
      return 'Your key'
    case 'card_otp':
      return 'Health card and OTP'
    case 'admission':
      return 'Admission mode'
    case 'break_glass':
      return 'Break-glass (emergency)'
    case 'emergency_contact':
    case 'emergency_aadhaar_fallback':
      return 'Emergency contact approval'
    default:
      return mode
  }
}

export function roleText(accountType: string, mode: string): string {
  if (mode === 'break_glass') return 'Emergency'
  switch (accountType) {
    case 'doctor':
      return 'Doctor'
    case 'staff':
      return 'Staff'
    case 'pharmacist':
      return 'Pharmacist'
    default:
      return 'Staff'
  }
}

/** audit.activity_log action prefix -> role label shown in the history. */
export function auditRole(action: string, accountType: string): string {
  if (action.startsWith('lab.')) return 'Lab tech'
  if (action.startsWith('imaging.')) return 'Radiology'
  if (action.startsWith('rx.')) return 'Pharmacist'
  if (action.startsWith('nurse.') || action.startsWith('admission.')) return 'Nurse'
  if (accountType === 'doctor') return 'Doctor'
  return 'Staff'
}

export const isDoctorRole = (role: string) => role === 'Doctor' || role === 'Emergency'

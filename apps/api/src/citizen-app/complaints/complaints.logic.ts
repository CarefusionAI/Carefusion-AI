export const CATEGORY_LABELS: Record<string, string> = {
  op_services: 'Long waiting time or OP services',
  pharmacy: 'Medicine not available',
  staff_conduct: 'Staff behaviour',
  cleanliness: 'Cleanliness',
  billing: 'Billing or fees',
  record_access: 'Privacy: record opened wrongly',
  lab: 'Lab or report delay',
  app: 'Problem with the app',
  other: 'Other',
}

export const SEVERITY_LABELS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent: affecting my treatment' },
  { value: 'safety', label: 'Safety concern' },
]

/** Design stages: 0 Filed, 1 Under review, 2 Resolved. */
export function stageOf(status: string): 0 | 1 | 2 {
  if (status === 'resolved' || status === 'closed') return 2
  if (status === 'open') return 0
  return 1
}

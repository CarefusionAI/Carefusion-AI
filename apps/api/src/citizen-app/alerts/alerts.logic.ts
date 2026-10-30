import type { AlertGroup } from '@carefusion/shared/dist/citizen-app.js'

type Tab = 'alerts' | 'updates' | 'reminders'

/** Where a care event (engage.event) shows up in the Alerts screen. */
const EVENT_MAP: Record<string, { group: AlertGroup; tab: Tab }> = {
  alert: { group: 'health_dept', tab: 'alerts' },
  'blood-request': { group: 'my_care', tab: 'alerts' },
  dispensed: { group: 'my_care', tab: 'reminders' },
  collected: { group: 'my_care', tab: 'updates' },
  booking: { group: 'my_care', tab: 'updates' },
  prescription: { group: 'my_care', tab: 'updates' },
  'lab-result': { group: 'my_care', tab: 'updates' },
  'imaging-result': { group: 'my_care', tab: 'updates' },
  'break-glass': { group: 'my_care', tab: 'updates' },
  'session-ended': { group: 'my_care', tab: 'updates' },
  'complaint-update': { group: 'my_care', tab: 'updates' },
  message: { group: 'my_care', tab: 'updates' },
}

export function mapEvent(type: string): { group: AlertGroup; tab: Tab } {
  return EVENT_MAP[type] ?? { group: 'my_care', tab: 'updates' }
}

/** Design rule: emergency and health-dept notices are "alerts"; a notice about a camp is a reminder. */
export function tabForAlert(group: AlertGroup, title: string): Tab {
  if (group === 'system') return 'updates'
  if (group === 'my_care') return 'updates'
  if (/camp/i.test(title)) return 'reminders'
  return 'alerts'
}

export const PREF_DEFAULT_OFF = new Set(['blood_requests', 'monthly_summary'])

export const DEFAULT_QUIET_HOURS = { enabled: true, from: '22:00', to: '07:00' }

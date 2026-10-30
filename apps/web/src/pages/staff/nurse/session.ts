// Admission mode: a chart opens for 2 hours. The timer and the "your access today" log live in this browser
// session (the alpha has no server-side chart-session endpoint); the server still records every write in the audit log.
export const SESSION_SECONDS = 2 * 60 * 60

const KEY = 'cf-nurse-chart-sessions'
const LOG_KEY = 'cf-nurse-access-log'

export interface AccessLogEntry {
  at: string
  bedNo: string
  patient: string
  what: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: the timer simply restarts on reload */
  }
}

export function sessionStart(bedId: string): number | null {
  const all = read<Record<string, number>>(KEY, {})
  return all[bedId] ?? null
}
export function openSession(bedId: string): number {
  const all = read<Record<string, number>>(KEY, {})
  const now = Date.now()
  all[bedId] = now
  write(KEY, all)
  return now
}
export function closeSession(bedId: string) {
  const all = read<Record<string, number>>(KEY, {})
  all[bedId] = 0
  write(KEY, all)
}

export function readLog(): AccessLogEntry[] {
  return read<AccessLogEntry[]>(LOG_KEY, [])
}
export function appendLog(entry: AccessLogEntry) {
  const log = readLog()
  log.unshift(entry)
  write(LOG_KEY, log.slice(0, 30))
}

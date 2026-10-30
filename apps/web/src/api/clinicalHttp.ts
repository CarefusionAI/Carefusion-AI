import { apiFetch } from '../lib/api'

// Small fetch layer for the radiology and pharmacist apps. Unlike apiJson it keeps the API's own
// error message ({ success:false, errorMessage, problems?, checks? }) so the UI can show it.

export class ApiRequestError extends Error {
  status: number
  problems: string[]
  checks: unknown[]
  constructor(status: number, message: string, problems: string[] = [], checks: unknown[] = []) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.problems = problems
    this.checks = checks
  }
}

async function readError(res: Response): Promise<ApiRequestError> {
  let message = `Request failed (${res.status})`
  let problems: string[] = []
  let checks: unknown[] = []
  try {
    const body = (await res.json()) as {
      errorMessage?: unknown
      message?: unknown
      problems?: unknown
      checks?: unknown
    }
    if (typeof body.errorMessage === 'string') message = body.errorMessage
    else if (typeof body.message === 'string') message = body.message
    else if (Array.isArray(body.message)) message = body.message.map(String).join('; ')
    if (Array.isArray(body.problems)) problems = body.problems.map(String)
    if (Array.isArray(body.checks)) checks = body.checks
  } catch {
    // Not JSON: keep the generic message.
  }
  if (res.status === 401) message = 'Your demo session is not signed in. Go back to the role selector.'
  if (res.status === 403 && message.startsWith('Request failed')) message = 'This account is not allowed to open this screen.'
  return new ApiRequestError(res.status, message, problems, checks)
}

export async function clinicalGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) throw await readError(res)
  return (await res.json()) as T
}

export async function clinicalSend<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw await readError(res)
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

/** Fetches a text file (for example a CSV export) with the auth header and returns it as a Blob. */
export async function clinicalDownload(path: string): Promise<Blob> {
  const res = await apiFetch(path)
  if (!res.ok) throw await readError(res)
  return res.blob()
}

export function errorText(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return err.problems.length ? `${err.message}: ${err.problems.join('; ')}` : err.message
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}

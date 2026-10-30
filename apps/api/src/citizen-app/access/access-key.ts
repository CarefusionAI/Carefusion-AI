import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Rotating share key (docs/15 section 11.1): a 6-digit number that changes every 10 seconds.
 * code = HMAC-SHA256(secret, "<personId>:<window>") reduced to 6 digits, window = floor(unix ms / 10000).
 * The doctor side calls verifyAccessKey(). "Single use" needs shared state (Valkey): not done in the alpha,
 * so a key can be re-used inside its 10-second window (see report gaps).
 */
export const KEY_WINDOW_SECONDS = 10

export function keyWindow(atMs: number): number {
  return Math.floor(atMs / (KEY_WINDOW_SECONDS * 1000))
}

export function deriveAccessKey(secret: string, personId: string, atMs: number): string {
  const mac = createHmac('sha256', secret).update(`${personId}:${keyWindow(atMs)}`).digest()
  return String(100000 + (mac.readUInt32BE(0) % 900000))
}

/** Short stable handle for the QR payload so the scanner can find the person without a database scan. */
export function keyHandle(secret: string, personId: string): string {
  return createHmac('sha256', secret).update(`handle:${personId}`).digest('hex').slice(0, 16)
}

/** Accepts the current window and `drift` earlier windows (clock skew and typing time). */
export function verifyAccessKey(secret: string, personId: string, code: string, atMs: number, drift = 1): boolean {
  const given = Buffer.from(code.replace(/\s/g, ''))
  for (let i = 0; i <= drift; i++) {
    const expected = Buffer.from(deriveAccessKey(secret, personId, atMs - i * KEY_WINDOW_SECONDS * 1000))
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true
  }
  return false
}

export function formatKey(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

export function keySecondsLeft(atMs: number): number {
  const w = KEY_WINDOW_SECONDS * 1000
  return Math.max(1, Math.ceil((w - (atMs % w)) / 1000))
}

/**
 * Spreadsheet programs run a cell that starts with = + - @ (or a tab / carriage return) as a formula.
 * Text that came from a user is prefixed with a single quote so it stays text when an admin opens the CSV.
 */
export function neutraliseCsvText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

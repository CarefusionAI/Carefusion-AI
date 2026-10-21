import { useId } from 'react'

/** React useId without the colons, safe for CSS selectors and aria attributes. */
export function useStableId(prefix: string, override?: string): string {
  const auto = useId()
  return override ?? `${prefix}-${auto.replace(/:/g, '')}`
}

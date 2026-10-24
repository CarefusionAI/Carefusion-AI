/** Token formula of the design: 8 + 2 * (position of the slot among that doctor's slots on the same day). */
export function tokenForIndex(index: number): number {
  return 8 + index * 2
}

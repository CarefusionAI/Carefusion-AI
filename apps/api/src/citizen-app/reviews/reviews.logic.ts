/** "Sreelatha Kurian Nair" -> "Sreelatha K." (first name and one initial only; reviews are public). */
export function publicName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'A patient'
  const first = parts[0]!
  const last = parts.length > 1 ? parts[parts.length - 1]! : null
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first
}

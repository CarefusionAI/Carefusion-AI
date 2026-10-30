/** Navigate to a nurse section, optionally with extra query params (for example { bed: '<bedId>' }). */
export type Go = (section: string, params?: Record<string, string>) => void

export type SectionId = 'home' | 'admit' | 'orders' | 'vitals' | 'mar' | 'handover' | 'alerts'

import clsx from 'clsx'

/** Small built-in glyphs (24px grid, 2px stroke) for states the design system draws itself. */
export const GLYPHS = {
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
  success: 'M8 12.5l2.5 2.5L16 9.5M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
  warning:
    'M12 9v4M12 17h.01M10.3 4.2L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z',
  danger: 'M12 8v5M12 16.5h.01M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  eye: 'M2 12s3.5-7 10-7s10 7 10 7s-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  eyeOff:
    'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  ai: 'M10.5 3h3a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19.5v-15A1.5 1.5 0 0 1 10.5 3zM4.5 9h15A1.5 1.5 0 0 1 21 10.5v3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 13.5v-3A1.5 1.5 0 0 1 4.5 9z',
  up: 'M7 14l5-5l5 5',
  down: 'M7 10l5 5l5-5',
  inbox: 'M4 13l2.5-7h11L20 13M4 13v6h16v-6M4 13h4.5l1 2h5l1-2H20',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9c-4.6-.7-8-4.5-8-9V6zM9 12l2 2l4-4',
  question: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
} as const

export type GlyphName = keyof typeof GLYPHS

export interface GlyphProps {
  name: GlyphName
  size?: number
  className?: string
}

export function Glyph({ name, size = 20, className }: GlyphProps) {
  return (
    <svg
      className={clsx('cf-glyph', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={GLYPHS[name]} />
    </svg>
  )
}

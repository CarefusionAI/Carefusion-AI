import { useMemo } from 'react'
import { encodeQr } from './qr'

/** Scannable QR code drawn as one SVG path. Dark modules on white with a 4-module quiet zone. */
export default function QrCode({ text, label }: { text: string; label: string }) {
  const modules = useMemo(() => encodeQr(text), [text])
  if (!modules) return <p className="ph-muted">This code is too long to draw. Use the written code below.</p>
  const n = modules.length
  const quiet = 4
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modules[r]![c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`
  const size = n + quiet * 2
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  )
}

// CLAUDE.md rule 1: every screen shows this banner. It has no close button on purpose.
// Text matches DEMO_BANNER_TEXT in packages/shared (hardcoded here until the web app
// has a runtime alias to the shared package).
const DEMO_BANNER_TEXT = 'SYNTHETIC DEMO DATA — NOT FOR CLINICAL USE'
const DEMO_BANNER_DETAIL =
  'This alpha uses simulated people, records and AI results. DEMO-0000 IDs are not real Aadhaar or ABHA numbers.'

export default function DemoBanner() {
  return (
    <div
      role="note"
      aria-label="Synthetic demo data notice"
      className="sticky top-0 z-50 w-full border-b"
      style={{
        background: 'rgba(198,145,58,.12)',
        borderColor: 'rgba(198,145,58,.25)',
      }}
    >
      <div className="mx-auto flex max-w-[1240px] items-start gap-3 px-4 py-2.5 sm:px-8">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8b6a2f"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#8b6a2f' }}>
            {DEMO_BANNER_TEXT}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: '#8b6a2f' }}>
            {DEMO_BANNER_DETAIL}
          </p>
        </div>
      </div>
    </div>
  )
}

// CLAUDE.md rule 1: every screen shows this banner. It has no close button on purpose.
// Text matches DEMO_BANNER_TEXT in packages/shared (hardcoded here until the web app
// has a runtime alias to the shared package).
const DEMO_BANNER_TEXT = 'SYNTHETIC DEMO DATA — NOT FOR CLINICAL USE'

export default function DemoBanner() {
  return (
    <div
      role="note"
      aria-label="Synthetic demo data notice"
      className="sticky top-0 z-50 w-full bg-amber-200 px-4 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-black"
    >
      {DEMO_BANNER_TEXT}
    </div>
  )
}

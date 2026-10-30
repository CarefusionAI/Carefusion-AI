export type CfTheme = 'pub' | 'cit' | 'doc' | 'stf' | 'adm'

export default function CfBackground({ theme = 'pub' }: { theme?: CfTheme }) {
  return (
    <div className={`cf-fx cf-fx-${theme}`} aria-hidden="true">
      <span className="fx-orb fx-o1" />
      <span className="fx-orb fx-o2" />
      <span className="fx-orb fx-o3" />
      <span className="fx-grid" />
      <svg className="fx-cross fx-c1" viewBox="0 0 64 64">
        <rect className="v" x="21" y="5" width="18" height="50" rx="9" />
        <rect className="h" x="9" y="25" width="50" height="18" rx="9" />
      </svg>
      <svg className="fx-cross fx-c2" viewBox="0 0 64 64">
        <rect className="v" x="21" y="5" width="18" height="50" rx="9" />
        <rect className="h" x="9" y="25" width="50" height="18" rx="9" />
      </svg>
      <svg className="fx-cross fx-c3" viewBox="0 0 64 64">
        <rect className="v" x="21" y="5" width="18" height="50" rx="9" />
        <rect className="h" x="9" y="25" width="50" height="18" rx="9" />
      </svg>
      <svg className="fx-ecg" viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d="M0 70 H260 L280 70 L294 40 L310 100 L328 14 L348 92 L362 70 H520 L536 56 L552 70 H820 L840 70 L854 44 L870 96 L888 20 L906 88 L920 70 H1200" />
      </svg>
      <span className="fx-p fx-p1" />
      <span className="fx-p fx-p2" />
      <span className="fx-p fx-p3" />
      <span className="fx-p fx-p4" />
      <span className="fx-p fx-p5" />
      <span className="fx-p fx-p6" />
    </div>
  )
}

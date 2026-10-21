import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { Role } from '@carefusion/shared'
import { useAuth } from '../context/AuthContext'
import { getRoleConfig } from '../config/roles'
import { ROLE_NAV, themeForRole } from '../config/nav'
import type { NavConfigItem } from '../config/nav'
import { useEvents } from '../hooks/useEvents'
import { useFocusTrap } from '../hooks/useFocusTrap'
import CfBackground from './CfBackground'
import DemoBanner from './DemoBanner'
import EventToast from './EventToast'
import { Avatar, BottomNav, Button, Glyph, Modal, Sidebar } from './ui'
import type { NavItemData, NavSection } from './ui'

const MORE_ID = '__more'

export interface AppShellProps {
  children: ReactNode
  /** Defaults to the signed-in demo user's role. */
  role?: Role
  /** Live counts per nav item id; overrides the demo badges in config/nav.ts. */
  badges?: Record<string, number | undefined>
  /** Page name shown in the breadcrumb. Defaults to the active nav item. */
  pageLabel?: string
}

function NavIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}

function itemHref(rolePath: string, item: NavConfigItem): string {
  return item.to ?? `${rolePath}?section=${item.id}`
}

/** Active when the pathname matches and, if the item targets a ?section=, that section is current. */
function isItemActive(href: string, firstId: string, pathname: string, search: string): boolean {
  const [path, query] = href.split('?')
  if (path !== pathname) return false
  if (!query) return true
  const wanted = new URLSearchParams(query).get('section')
  const current = new URLSearchParams(search).get('section') ?? firstId
  return wanted === current
}

export default function AppShell({ children, role: roleProp, badges, pageLabel }: AppShellProps) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const role = roleProp ?? user?.role
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const headRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const { toast, dismissToast } = useEvents(role)
  useFocusTrap(drawerRef, drawerOpen, () => setDrawerOpen(false))

  // Keep the sticky sidebar/toast offset equal to the banner + top bar height.
  useEffect(() => {
    const head = headRef.current
    const root = rootRef.current
    if (!head || !root || typeof ResizeObserver === 'undefined') return
    const apply = () => root.style.setProperty('--cf-head-h', `${head.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(head)
    return () => ro.disconnect()
  }, [])

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname, location.search])

  const model = useMemo(() => {
    if (!role) return null
    const cfg = getRoleConfig(role)
    const nav = ROLE_NAV[role]
    const firstId = nav.groups[0]?.items[0]?.id ?? ''
    let activeId = ''
    let activeLabel = ''
    const sections: NavSection[] = nav.groups.map((g) => ({
      title: g.title,
      items: g.items.map((it): NavItemData => {
        const href = itemHref(cfg.path, it)
        if (isItemActive(href, firstId, location.pathname, location.search)) {
          activeId = it.id
          activeLabel = it.label
        }
        const badge = badges && it.id in badges ? badges[it.id] : it.badge
        return { id: it.id, label: it.label, href, icon: <NavIcon d={it.icon} />, badge: badge || null }
      }),
    }))
    return { cfg, nav, sections, activeId, activeLabel }
  }, [role, badges, location.pathname, location.search])

  if (!role || !model) return <>{children}</>
  const { cfg, nav, sections, activeId, activeLabel } = model
  const theme = themeForRole(role)
  const flat = sections.flatMap((s) => s.items)
  const bottomItems: NavItemData[] = [
    ...flat.slice(0, 4),
    {
      id: MORE_ID,
      label: 'More',
      icon: <NavIcon d="M4 7h16M4 12h16M4 17h16" />,
    },
  ]

  function onSelect(id: string, e: MouseEvent<HTMLElement>, item: NavItemData) {
    if (id === MORE_ID) {
      setDrawerOpen(true)
      return
    }
    // Let the browser handle new-tab / modified clicks.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (item.href) {
      e.preventDefault()
      navigate(item.href)
    }
  }

  function endSession() {
    setConfirmEnd(false)
    setDrawerOpen(false)
    logout()
    navigate('/')
  }

  const logo = (
    <Link to="/" className="cf-logo" aria-label="CareFusion AI home">
      <img src="/logo.svg" alt="CareFusion AI" height={30} />
    </Link>
  )

  const who = (
    <div className="cf-side-who">
      <div className="cf-side-who-id">
        <Avatar name={user?.displayName ?? cfg.label} size={36} />
        <div className="cf-side-who-text">
          <p className="cf-side-who-name">{user?.displayName ?? cfg.label}</p>
          <p className="cf-side-who-role">{cfg.label}</p>
        </div>
      </div>
      <div className="cf-side-who-actions">
        <Button variant="outline" size="sm" fullWidth onClick={() => navigate('/')}>
          Switch role
        </Button>
        <Button variant="ghost" size="sm" fullWidth onClick={() => setConfirmEnd(true)}>
          End session
        </Button>
      </div>
    </div>
  )

  const sidebar = (
    <Sidebar
      sections={sections}
      activeId={activeId}
      onSelect={onSelect}
      header={logo}
      footer={who}
      label={`${nav.label} navigation`}
    />
  )

  return (
    <div ref={rootRef} className="cf-root cf-shell">
      <CfBackground theme={theme} />
      <a className="cf-skip" href="#main">
        Skip to content
      </a>

      <div ref={headRef} className="cf-shell-head">
        <DemoBanner />
        <div className="cf-topbar">
          <div className="cf-topbar-left">
            <button
              type="button"
              className="cf-icon-btn cf-menu-btn"
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <NavIcon d="M4 7h16M4 12h16M4 17h16" />
            </button>
            <span className="cf-topbar-logo">{logo}</span>
            <p className="cf-crumb">
              {cfg.label}
              <span aria-hidden="true"> › </span>
              <strong>{pageLabel ?? (activeLabel || 'Home')}</strong>
            </p>
          </div>
          <p className="cf-topbar-role">{cfg.label}</p>
        </div>
      </div>

      <div className="cf-shell-body">
        <aside className="cf-shell-side">{sidebar}</aside>
        <div className="cf-shell-main-col">
          <main id="main" className="cf-shell-main" tabIndex={-1}>
            <div className="cf-shell-content">{children}</div>
          </main>
        </div>
      </div>

      <div className="cf-shell-bottom">
        <BottomNav items={bottomItems} activeId={activeId} onSelect={onSelect} label={`${nav.label} quick navigation`} />
      </div>

      {drawerOpen ? (
        <div
          className="cf-drawer-scrim"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false)
          }}
        >
          <div ref={drawerRef} className="cf-drawer" role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1}>
            <button type="button" className="cf-icon-btn cf-drawer-close" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
              <Glyph name="close" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <Modal
        open={confirmEnd}
        title="End session?"
        size="sm"
        onClose={() => setConfirmEnd(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              Stay signed in
            </Button>
            <Button variant="danger" onClick={endSession}>
              End session
            </Button>
          </>
        }
      >
        <p>You will be signed out of this demo workspace and returned to the role selector. Unsaved changes on this screen are lost.</p>
      </Modal>

      <EventToast event={toast} onDismiss={dismissToast} />
    </div>
  )
}

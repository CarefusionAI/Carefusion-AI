import { useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import clsx from 'clsx'
import { Glyph } from './Glyph'

export interface NavItemData {
  id: string
  label: string
  icon?: ReactNode
  href?: string
  badge?: number | string | null
}

export interface NavSection {
  title?: string
  items: NavItemData[]
}

/**
 * Called when a nav item is clicked. For items with an href the browser would normally
 * follow the link; call event.preventDefault() in the handler to navigate in-app instead.
 */
export type NavSelectHandler = (id: string, event: MouseEvent<HTMLElement>, item: NavItemData) => void

function NavEntry({
  item,
  active,
  onSelect,
  cls,
}: {
  item: NavItemData
  active?: string
  onSelect?: NavSelectHandler
  cls: 'cf-nav' | 'cf-tab'
}) {
  const isActive = item.id === active
  const className = clsx(cls, isActive && 'is-active')
  const content = (
    <>
      {item.icon ? (
        <span className={`${cls}-icon`} aria-hidden="true">
          {item.icon}
        </span>
      ) : null}
      <span className={`${cls}-label`}>{item.label}</span>
      {item.badge != null ? (
        <span className={`${cls}-count`} aria-label={`${item.badge} new`}>
          {item.badge}
        </span>
      ) : null}
    </>
  )
  if (item.href) {
    return (
      <a
        href={item.href}
        className={className}
        aria-current={isActive ? 'page' : undefined}
        onClick={onSelect ? (e) => onSelect(item.id, e, item) : undefined}
      >
        {content}
      </a>
    )
  }
  return (
    <button
      type="button"
      className={className}
      aria-current={isActive ? 'page' : undefined}
      onClick={onSelect ? (e) => onSelect(item.id, e, item) : undefined}
    >
      {content}
    </button>
  )
}

/* ---------- Sidebar ---------- */
export interface SidebarProps {
  sections?: NavSection[]
  items?: NavItemData[]
  activeId?: string
  onSelect?: NavSelectHandler
  header?: ReactNode
  footer?: ReactNode
  label?: string
  className?: string
}

export function Sidebar({ sections, items, activeId, onSelect, header, footer, label = 'Main', className }: SidebarProps) {
  const secs: NavSection[] = sections ?? [{ items: items ?? [] }]
  return (
    <nav className={clsx('cf-sidebar', className)} aria-label={label}>
      {header ? <div className="cf-sidebar-head">{header}</div> : null}
      {secs.map((sec, i) => (
        <div key={i} className="cf-sidebar-section">
          {sec.title ? <p className="cf-sidebar-title">{sec.title}</p> : null}
          {sec.items.map((it) => (
            <NavEntry key={it.id} item={it} active={activeId} onSelect={onSelect} cls="cf-nav" />
          ))}
        </div>
      ))}
      {footer ? <div className="cf-sidebar-foot">{footer}</div> : null}
    </nav>
  )
}

/* ---------- BottomNav ---------- */
export interface BottomNavProps {
  items: NavItemData[]
  activeId?: string
  onSelect?: NavSelectHandler
  label?: string
  className?: string
}

export function BottomNav({ items, activeId, onSelect, label = 'Main', className }: BottomNavProps) {
  return (
    <nav className={clsx('cf-bottomnav', className)} aria-label={label}>
      {items.map((it) => (
        <NavEntry key={it.id} item={it} active={activeId} onSelect={onSelect} cls="cf-tab" />
      ))}
    </nav>
  )
}

/* ---------- Tabs ---------- */
export interface TabData {
  id: string
  label: ReactNode
  count?: number | string | null
  panelId?: string
}

export interface TabsProps {
  tabs: TabData[]
  value?: string
  defaultValue?: string
  onChange?: (id: string) => void
  variant?: 'underline' | 'segmented'
  label?: string
  className?: string
}

export function Tabs({ tabs, value, defaultValue, onChange, variant = 'underline', label, className }: TabsProps) {
  const [inner, setInner] = useState(defaultValue ?? tabs[0]?.id ?? '')
  const controlled = value !== undefined
  const current = controlled ? value : inner
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function select(id: string) {
    if (!controlled) setInner(id)
    onChange?.(id)
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const ids = tabs.map((t) => t.id)
    const i = ids.indexOf(current)
    let next: string | undefined
    if (e.key === 'ArrowRight') next = ids[(i + 1) % ids.length]
    else if (e.key === 'ArrowLeft') next = ids[(i - 1 + ids.length) % ids.length]
    else if (e.key === 'Home') next = ids[0]
    else if (e.key === 'End') next = ids[ids.length - 1]
    if (next) {
      e.preventDefault()
      select(next)
      refs.current[next]?.focus()
    }
  }

  return (
    <div role="tablist" aria-label={label} className={clsx('cf-tabs', `cf-tabs-${variant}`, className)} onKeyDown={onKey}>
      {tabs.map((t) => {
        const selected = t.id === current
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${t.id}-tab`}
            aria-selected={selected}
            aria-controls={t.panelId}
            tabIndex={selected ? 0 : -1}
            className={clsx('cf-tabs-tab', selected && 'is-selected')}
            ref={(n) => {
              refs.current[t.id] = n
            }}
            onClick={() => select(t.id)}
          >
            {t.label}
            {t.count != null ? <span className="cf-tabs-count">{t.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Stepper ---------- */
export interface StepperProps {
  steps: string[]
  current?: number
  label?: string
  className?: string
}

export function Stepper({ steps, current = 0, label = 'Progress', className }: StepperProps) {
  return (
    <ol className={clsx('cf-stepper', className)} aria-label={label}>
      {steps.map((text, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li key={i} className={`cf-step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="cf-step-marker" aria-hidden="true">
              {state === 'done' ? <Glyph name="check" size={16} /> : i + 1}
            </span>
            <span className="cf-step-label">
              {text}
              <span className="cf-sr">
                {state === 'done' ? ' (completed)' : state === 'current' ? ' (current step)' : ''}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// Per-role navigation for the authenticated app shell (ported from the Claude Design screens).
// Icons are 24px-grid SVG path strings, drawn Lucide-style at a 1.8px stroke by <NavIcon>.
import type { Role } from '@carefusion/shared'
import type { CfTheme } from '../components/CfBackground'

export interface NavConfigItem {
  id: string
  label: string
  /** SVG path data for the icon. */
  icon: string
  /** Demo badge count shown until live counts are wired in (AppShell `badges` prop overrides it). */
  badge?: number
  /** Explicit route. Default: `<role path>?section=<id>`. */
  to?: string
}

export interface NavConfigGroup {
  title?: string
  items: NavConfigItem[]
}

export interface RoleNav {
  /** Accessible label for the sidebar landmark. */
  label: string
  groups: NavConfigGroup[]
}

const P = {
  home: 'M3 11l9-7l9 7M5 10v10h5v-6h4v6h5V10',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  pulse: 'M3 12h4l3-7l4 14l3-7h4',
  ai: 'M10.5 3h3a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19.5v-15A1.5 1.5 0 0 1 10.5 3zM4.5 9h15A1.5 1.5 0 0 1 21 10.5v3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 13.5v-3A1.5 1.5 0 0 1 4.5 9z',
  chat: 'M4 5h16v11H8l-4 4z',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM21 21l-5-5',
  pill: 'M8.5 3.5a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7-7zM6 11l7 7',
  drop: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  star: 'M12 3l2.7 5.6l6.1.9l-4.4 4.3l1 6.1L12 17l-5.4 2.9l1-6.1L3.2 9.5l6.1-.9z',
  flag: 'M4 4h16v12H8l-4 4zM12 8v3M12 13.5h.01',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  cog: 'M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2',
  clipboard: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13l2 2l4-4',
  orders: 'M9 3h6v3H9zM6 5h12v16H6zM9 11h6M9 15h4',
  arrow: 'M4 12h12M12 6l6 6l-6 6',
  warn: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  lock: 'M4 10h16v10H4zM8 10V7a4 4 0 0 1 8 0v3',
  list: 'M4 6h16M4 12h16M4 18h10',
  box: 'M3 7l9-4l9 4v10l-9 4l-9-4zM3 7l9 4l9-4M12 11v10',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9c-4.6-.7-8-4.5-8-9V6z',
  shieldTick: 'M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6zM9 12l2 2l4-4',
  people:
    'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM2 21c1-4 3.5-6 7-6s6 2 7 6M17 11a3 3 0 1 0 0-6M22 21c-.6-2.6-2-4.3-4-5',
  audit: 'M4 5h16M4 10h16M4 15h10M4 20h7',
  logs: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  dash: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  map: 'M9 4L3 6v14l6-2l6 2l6-2V4l-6 2zM9 4v14M15 6v14',
  approve: 'M9 11l3 3l8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  inbox: 'M4 13h4l2 3h4l2-3h4M5 5h14l1 8v6H4v-6z',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6',
  report: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6',
  directory: 'M4 5h16v14H4zM8 10a2 2 0 1 0 0-.01M5.5 16c.6-1.6 1.5-2.5 2.5-2.5s1.9.9 2.5 2.5M13 9h4M13 13h4',
  adminKey: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9c-4.6-.7-8-4.5-8-9V6zM12 9v6M9 12h6',
  tube: 'M9 3h6M10 3v13a2 2 0 0 0 4 0V3M10 10h4',
  entry: 'M4 4h16v16H4zM8 9h8M8 13h5M8 17h3',
  upload: 'M12 16V4M7 9l5-5l5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  trend: 'M4 19h16M6 15l4-4l3 3l5-6',
  timer: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM12 7v5l3 2',
  image: 'M3 5h18v14H3zM8 15l3-3l2 2l3-4',
  equipment: 'M4 7h16v10H4zM8 21h8M12 17v4',
  ward: 'M4 4h16v16H4zM4 9h16M9 4v16',
  bed: 'M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-8v1M7 11a2 2 0 1 0 0-4a2 2 0 0 0 0 4z',
  hospital: 'M4 21V5l8-3l8 3v16M9 21v-5h6v5M12 7v4M10 9h4',
  approvalShield: 'M9 12l2 2l4-4M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6z',
} as const

const nursing: RoleNav = {
  label: 'Nurse',
  groups: [
    {
      items: [
        { id: 'home', label: 'Ward home', icon: P.home },
        { id: 'admit', label: 'Admission mode', icon: P.lock },
        { id: 'orders', label: 'Orders', icon: P.clipboard, badge: 3 },
      ],
    },
    {
      title: 'Care',
      items: [
        { id: 'vitals', label: 'Vitals', icon: P.pulse },
        { id: 'mar', label: 'Medication round', icon: P.pill },
        { id: 'handover', label: 'Handover', icon: P.chat },
      ],
    },
    { title: 'Shift', items: [{ id: 'alerts', label: 'Alerts', icon: P.bell, badge: 4 }] },
  ],
}

function adminConsole(opts: { central?: boolean }): RoleNav {
  const oversight: NavConfigItem[] = [
    { id: 'audit', label: 'Audit and security', icon: P.shield },
    { id: 'logs', label: 'Audit log', icon: P.logs },
    { id: 'reports', label: 'Reports and export', icon: P.report },
  ]
  if (opts.central) oversight.push({ id: 'ai', label: 'AI governance', icon: P.ai })
  const people: NavConfigItem[] = [
    { id: 'directory', label: 'Directory', icon: P.directory },
    { id: 'admins', label: 'Admin accounts', icon: P.adminKey },
  ]
  if (opts.central) people.push({ id: 'settings', label: 'System settings', icon: P.cog })
  return {
    label: 'Admin console',
    groups: [
      {
        items: [
          { id: 'overview', label: 'Overview', icon: P.dash },
          { id: 'map', label: 'Map and units', icon: P.map },
          { id: 'approvals', label: 'Approvals', icon: P.approve },
          { id: 'inbox', label: 'Approval inbox', icon: P.inbox },
        ],
      },
      {
        title: 'Public health',
        items: [
          { id: 'alerts', label: 'Health alerts', icon: P.megaphone },
          { id: 'surveillance', label: 'Disease surveillance', icon: P.pulse, badge: 1 },
          { id: 'blood', label: 'Blood and organ', icon: P.drop },
        ],
      },
      { title: 'Oversight', items: oversight },
      { title: 'People', items: people },
    ],
  }
}

/** Citizen screens are separate routes (one design screen each), so every item has an explicit `to`. */
const citizen: RoleNav = {
  label: 'Citizen',
  groups: [
    {
      items: [
        { id: 'home', label: 'Home', icon: P.home, to: '/citizen' },
        { id: 'access', label: 'Share and access', icon: P.key, to: '/citizen/access' },
        { id: 'documents', label: 'Documents', icon: P.folder, to: '/citizen/documents' },
        { id: 'dates', label: 'Dates', icon: P.calendar, badge: 2, to: '/citizen/dates' },
      ],
    },
    {
      title: 'Health',
      items: [
        { id: 'vitals', label: 'Home vitals', icon: P.pulse, to: '/citizen/vitals' },
        { id: 'ai', label: 'AI Health Chat', icon: P.ai, to: '/citizen/ai-chat' },
        { id: 'messages', label: 'Messages', icon: P.chat, badge: 1, to: '/citizen/messages' },
        { id: 'care', label: 'Find care', icon: P.search, to: '/citizen/care' },
        { id: 'medicines', label: 'Medicines', icon: P.pill, to: '/citizen/medicines' },
      ],
    },
    {
      title: 'Give',
      items: [
        { id: 'blood', label: 'Blood donation', icon: P.drop, to: '/citizen/blood' },
        { id: 'organ', label: 'Organ donation', icon: P.heart, to: '/citizen/organ' },
      ],
    },
    {
      title: 'Your voice',
      items: [
        { id: 'reviews', label: 'Reviews', icon: P.star, to: '/citizen/reviews' },
        { id: 'complaints', label: 'Complaints', icon: P.flag, badge: 1, to: '/citizen/complaints' },
      ],
    },
    {
      title: 'Account',
      items: [
        { id: 'profile', label: 'Profile', icon: P.user, to: '/citizen/profile' },
        { id: 'alerts', label: 'Alerts', icon: P.bell, to: '/citizen/alerts' },
        { id: 'settings', label: 'Settings', icon: P.cog, to: '/citizen/settings' },
      ],
    },
  ],
}

export const ROLE_NAV: Record<Role, RoleNav> = {
  CITIZEN: citizen,
  DOCTOR: {
    label: 'Doctor',
    groups: [
      {
        items: [
          { id: 'home', label: 'Home', icon: P.home },
          { id: 'open', label: 'Open patient', icon: P.key },
          { id: 'session', label: 'Patient session', icon: P.user, badge: 1 },
          { id: 'schedule', label: 'Schedule', icon: P.calendar },
          { id: 'messages', label: 'Messages', icon: P.chat },
        ],
      },
      {
        title: 'Clinical',
        items: [
          { id: 'rx', label: 'Prescriptions', icon: P.doc, badge: 2 },
          { id: 'orders', label: 'Orders', icon: P.orders, badge: 5 },
          { id: 'referral', label: 'Referral and handover', icon: P.arrow },
          { id: 'emergency', label: 'Emergency access', icon: P.warn },
        ],
      },
      {
        title: 'Resources',
        items: [
          { id: 'donors', label: 'Donors', icon: P.drop },
          { id: 'stock', label: 'Pharmacy stock', icon: P.pill },
        ],
      },
      {
        title: 'Account',
        items: [
          { id: 'profile', label: 'Profile and reviews', icon: P.star },
          { id: 'settings', label: 'Settings', icon: P.cog },
        ],
      },
    ],
  },
  NURSE: nursing,
  LAB_TECH: {
    label: 'Lab',
    groups: [
      {
        items: [
          { id: 'home', label: 'Worklist', icon: P.clipboard, badge: 9 },
          { id: 'collect', label: 'Sample collection', icon: P.tube },
          { id: 'results', label: 'Result entry', icon: P.entry },
          { id: 'upload', label: 'Upload report', icon: P.upload },
        ],
      },
      {
        title: 'Quality',
        items: [
          { id: 'qc', label: 'QC log', icon: P.trend },
          { id: 'stats', label: 'Turnaround', icon: P.timer },
        ],
      },
    ],
  },
  RADIOLOGY_TECH: {
    label: 'Radiology',
    groups: [
      {
        items: [
          { id: 'worklist', label: 'Worklist', icon: P.list, badge: 6 },
          { id: 'study', label: 'Study viewer', icon: P.image },
          { id: 'upload', label: 'Upload images', icon: P.upload },
        ],
      },
      {
        title: 'Department',
        items: [
          { id: 'equipment', label: 'Equipment', icon: P.equipment, badge: 2 },
          { id: 'schedule', label: 'Schedule', icon: P.calendar },
        ],
      },
    ],
  },
  PHARMACIST: {
    label: 'Pharmacist',
    groups: [
      {
        items: [
          { id: 'queue', label: 'Dispense queue', icon: P.list, badge: 4 },
          { id: 'stock', label: 'Stock levels', icon: P.box, badge: 5 },
          { id: 'expiry', label: 'Expiry watch', icon: P.clock, badge: 6 },
          { id: 'log', label: 'Dispensing log', icon: P.report },
        ],
      },
    ],
  },
  PHARMACY_ADMIN: {
    label: 'Pharmacy admin',
    groups: [
      {
        items: [
          { id: 'overview', label: 'Overview', icon: P.home },
          { id: 'staff', label: 'Pharmacists', icon: P.people },
        ],
      },
      {
        title: 'Stock',
        items: [
          { id: 'inventory', label: 'Inventory and finder', icon: P.box },
          { id: 'orders', label: 'Purchase orders', icon: P.clipboard },
          { id: 'expiry', label: 'Expiry and recalls', icon: P.warn, badge: 2 },
        ],
      },
      {
        title: 'Governance',
        items: [
          { id: 'compliance', label: 'Licence and compliance', icon: P.shieldTick },
          { id: 'audit', label: 'Audit log', icon: P.audit },
        ],
      },
    ],
  },
  HOSPITAL_ADMIN: {
    label: 'Hospital admin',
    groups: [
      {
        items: [
          { id: 'overview', label: 'Overview', icon: P.home },
          { id: 'approvals', label: 'Approvals', icon: P.approvalShield },
          { id: 'staff', label: 'Staff', icon: P.people },
        ],
      },
      {
        title: 'Hospital',
        items: [
          { id: 'admissions', label: 'Admissions', icon: P.ward },
          { id: 'roster', label: 'Doctor roster', icon: P.calendar },
          { id: 'beds', label: 'Departments and beds', icon: P.bed },
          { id: 'roles', label: 'Roles and permissions', icon: P.key },
          { id: 'profile', label: 'Hospital profile', icon: P.hospital },
        ],
      },
      {
        title: 'Citizens',
        items: [
          { id: 'complaints', label: 'Complaints', icon: P.chat },
          { id: 'reviews', label: 'Reviews', icon: P.star },
        ],
      },
      {
        title: 'Oversight',
        items: [
          { id: 'breakglass', label: 'Break-glass reviews', icon: P.warn },
          { id: 'audit', label: 'Audit log', icon: P.audit },
        ],
      },
    ],
  },
  DISTRICT_ADMIN: adminConsole({}),
  STATE_ADMIN: adminConsole({}),
  ZONAL_ADMIN: adminConsole({}),
  CENTRAL_ADMIN: adminConsole({ central: true }),
}

/** Background theme per role (Layout used to compute this inline). */
export function themeForRole(role: Role | null | undefined): CfTheme {
  if (!role) return 'pub'
  if (role === 'CITIZEN') return 'cit'
  if (role === 'DOCTOR') return 'doc'
  if (role === 'NURSE' || role === 'LAB_TECH' || role === 'RADIOLOGY_TECH' || role === 'PHARMACIST') return 'stf'
  return 'adm'
}

/** Role ids used by the event bus in the design (lowercase, no separators). */
export const EVENT_ROLE_KEY: Record<Role, string> = {
  CITIZEN: 'citizen',
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  LAB_TECH: 'labtech',
  RADIOLOGY_TECH: 'radiology',
  PHARMACIST: 'pharmacist',
  PHARMACY_ADMIN: 'pharmacyadmin',
  HOSPITAL_ADMIN: 'hospitaladmin',
  DISTRICT_ADMIN: 'district',
  STATE_ADMIN: 'state',
  ZONAL_ADMIN: 'zonal',
  CENTRAL_ADMIN: 'central',
}

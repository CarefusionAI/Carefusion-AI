import { z } from 'zod'

// Cross-role event feed (booking -> doctor, prescription -> pharmacist, ...).
// Mirrors engage.event_role / engage.event_type_ref in migration 120.
// Web side: apps/web/src/hooks/useEvents.ts reads { id, type, from, to[], title, text, href, at }.

export const EVENT_ROLES = [
  'citizen',
  'doctor',
  'nurse',
  'labtech',
  'radiology',
  'pharmacist',
  'pharmacyadmin',
  'hospitaladmin',
  'district',
  'state',
  'zonal',
  'central',
] as const
export const EventRoleSchema = z.enum(EVENT_ROLES)
export type EventRole = z.infer<typeof EventRoleSchema>

/** Government-side roles never receive events about a patient (database CHECK event_patient_not_to_gov). */
export const GOV_EVENT_ROLES: readonly EventRole[] = ['district', 'state', 'zonal', 'central']

/** An in-app route: one leading '/', no scheme, no '//', no spaces or backslashes (same rule as the database CHECK). */
export const AppHrefSchema = z
  .string()
  .max(500)
  .regex(/^\/([^/\s\\][^\s\\]*)?$/, "href must be an in-app path that starts with '/'")

/** One event as the web feed reads it. Extra fields are optional for richer UIs. */
export const EventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  from: EventRoleSchema,
  to: z.array(EventRoleSchema),
  title: z.string(),
  text: z.string(),
  href: z.string().optional(),
  at: z.string(), // ISO timestamp (created_at)
  // Extras (not required by the web hook)
  typeLabel: z.string().optional(),
  chip: z.string().optional(),
  chipTone: z.string().optional(),
  isRead: z.boolean().optional(),
  sentByMe: z.boolean().optional(),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  patientPersonId: z.string().nullable().optional(),
})
export type EventDto = z.infer<typeof EventSchema>

export const ListEventsQuerySchema = z.object({
  role: EventRoleSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
})
export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>

/** POST /events body. from_role always comes from the logged-in user, never from the body. */
export const EmitEventRequestSchema = z.object({
  type: z.string().min(1).max(60),
  to: z.array(EventRoleSchema).min(1).max(12),
  title: z.string().trim().min(1).max(200),
  text: z.string().max(1000).default(''),
  href: AppHrefSchema.optional(),
  toUserId: z.string().uuid().optional(),
  entityType: z.string().max(80).optional(),
  entityId: z.string().uuid().optional(),
  patientPersonId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  pharmacyId: z.string().uuid().optional(),
})
export type EmitEventRequest = z.infer<typeof EmitEventRequestSchema>

export const MarkEventsReadRequestSchema = z.object({
  /** Omit to mark every event you can see as read. */
  ids: z.array(z.string().uuid()).max(500).optional(),
})
export type MarkEventsReadRequest = z.infer<typeof MarkEventsReadRequestSchema>

export interface MarkEventsReadResponse {
  marked: number
}

export interface UnreadCountResponse {
  count: number
}

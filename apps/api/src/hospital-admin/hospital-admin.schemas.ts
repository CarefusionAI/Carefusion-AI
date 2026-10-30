import { z } from 'zod'

export const UuidSchema = z.string().uuid()

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const ApprovalFilterSchema = z.object({
  filter: z.enum(['pending', 'doctors', 'decided', 'all']).default('pending'),
})

export const DocumentCheckSchema = z.object({ checked: z.boolean() })

export const ApproveBodySchema = z.object({ reason: z.string().trim().min(1).max(2000).optional() })

export const REJECT_REASON_CODES = [
  'registration_unverified',
  'registration_expired',
  'document_unreadable',
  'not_employed_here',
  'other',
] as const

export const RejectBodySchema = z.object({
  reasonCode: z.enum(REJECT_REASON_CODES).default('registration_unverified'),
  reason: z.string().trim().max(2000).optional(),
})

export const StaffListQuerySchema = z.object({
  role: z.enum(['doctor', 'nurse', 'lab', 'radiology', 'pharmacist']).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const CreateStaffBodySchema = z.object({
  personId: UuidSchema,
  staffRole: z.enum(['nurse', 'lab', 'radiology']),
  departmentId: UuidSchema.optional(),
})

export const ROLE_KEYS = ['doctor', 'nurse', 'lab', 'radiology', 'pharmacist', 'front_desk'] as const

export const PermissionChangesSchema = z.object({
  changes: z
    .array(
      z.object({
        roleKey: z.enum(ROLE_KEYS),
        permissionCode: z.string().trim().min(1).max(64),
        allowed: z.boolean(),
      }),
    )
    .min(1)
    .max(60),
})

export const DepartmentCreateSchema = z.object({ name: z.string().trim().min(2).max(80) })
export const DepartmentUpdateSchema = z
  .object({ name: z.string().trim().min(2).max(80).optional(), isActive: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, 'Nothing to change')

export const BedListQuerySchema = z.object({
  wardId: UuidSchema.optional(),
  departmentId: UuidSchema.optional(),
})
export const BedStatusSchema = z.object({
  status: z.enum(['free', 'reserved', 'cleaning', 'out_of_service']),
})

export const AdmissionsQuerySchema = z.object({
  department: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export const RosterQuerySchema = z.object({ weekStart: isoDate.optional() })
export const RosterUpdateSchema = z.object({
  weekStart: isoDate,
  cells: z
    .array(
      z.object({
        doctorUserId: UuidSchema,
        date: isoDate,
        shift: z.enum(['op', 'night', 'off', 'ward_round', 'teleconsult']),
      }),
    )
    .min(1)
    .max(300),
})
export const RosterPublishSchema = z.object({ weekStart: isoDate })

export const BreakGlassJustifySchema = z.object({ note: z.string().trim().max(1000).optional() })
export const BreakGlassEscalateSchema = z.object({ note: z.string().trim().min(5, 'Say why this was not justified').max(1000) })

export const AuditQuerySchema = z.object({
  group: z.enum(['access', 'admin', 'system']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  beforeSeq: z.coerce.number().int().positive().optional(),
})

export const ComplaintQuerySchema = z.object({
  status: z.enum(['new', 'under_review', 'resolved', 'escalated', 'open']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export const ComplaintAssignSchema = z.object({
  assigneeUserId: UuidSchema.optional(),
  note: z.string().trim().max(500).optional(),
})
export const ComplaintResolveSchema = z.object({ resolution: z.string().trim().min(5).max(2000) })

export const ReviewQuerySchema = z.object({
  stars: z.coerce.number().int().min(1).max(5).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export const ReviewReplySchema = z.object({ body: z.string().trim().min(2).max(1000) })

export const ProfileChangeSchema = z
  .object({
    phone: z.string().trim().min(5).max(40).optional(),
    address: z.string().trim().min(5).max(300).optional(),
    about: z.string().trim().max(1000).optional(),
    timings: z
      .object({
        op: z.string().trim().max(40).optional(),
        casualty: z.string().trim().max(40).optional(),
        help_desk: z.string().trim().max(40).optional(),
      })
      .optional(),
    services: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    showInFindCare: z.boolean().optional(),
    acceptsBookings: z.boolean().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== 'note' && (v as Record<string, unknown>)[k] !== undefined),
    'Nothing to change',
  )

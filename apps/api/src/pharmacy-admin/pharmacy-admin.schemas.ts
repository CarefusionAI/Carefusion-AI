import { z } from 'zod'

export const UuidSchema = z.string().uuid()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const PharmacistsQuerySchema = z.object({ q: z.string().trim().max(80).optional() })
export const CreatePharmacistBodySchema = z.object({
  personId: UuidSchema,
  registrationNo: z.string().trim().min(3).max(60),
})
export const DeactivateBodySchema = z.object({ reason: z.string().trim().min(3).max(300) })
export const InviteBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  registrationNo: z.string().trim().min(3).max(60),
  shift: z.enum(['day', 'night', 'rotating']).default('day'),
})

export const InventoryQuerySchema = z.object({
  filter: z.enum(['all', 'low', 'hidden', 'blocked']).default('all'),
  category: z.string().trim().max(60).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const PublishBodySchema = z.object({ published: z.boolean() })
export const AdjustBodySchema = z.object({
  type: z.enum(['adjustment', 'write_off', 'return_to_supplier', 'quarantine']),
  quantity: z.number().positive().max(1_000_000),
  direction: z.enum(['in', 'out']).default('out'),
  reason: z.string().trim().min(3).max(300),
})

export const PoQuerySchema = z.object({
  status: z.enum(['draft', 'pending_approval', 'approved', 'held', 'sent', 'in_transit', 'received', 'cancelled']).optional(),
})
export const PoCreateSchema = z.object({
  supplierId: UuidSchema,
  expectedOn: isoDate.optional(),
  isIndent: z.boolean().default(false),
  lines: z
    .array(z.object({ medicineId: UuidSchema, quantity: z.number().positive().max(1_000_000), unitCost: z.number().min(0).max(1_000_000) }))
    .min(1)
    .max(200),
})
export const PoSendBackSchema = z.object({ reason: z.string().trim().min(3).max(300) })

export const RecallConfirmSchema = z.object({ note: z.string().trim().max(300).optional() })

export const DocumentCreateSchema = z.object({
  docType: z.string().trim().min(2).max(40),
  title: z.string().trim().min(2).max(160),
  referenceNo: z.string().trim().max(80).optional(),
  validFrom: isoDate.optional(),
  validUntil: isoDate.optional(),
})

export const AuditQuerySchema = z.object({
  group: z.enum(['rx', 'stock', 'staff']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  beforeSeq: z.coerce.number().int().positive().optional(),
})

export const ProfilePatchSchema = z.object({
  openingHours: z.record(z.string(), z.any()).refine((v) => Object.keys(v).length > 0, 'Nothing to change'),
})

import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { ZodType, ZodTypeDef } from 'zod'
import type { AuthenticatedUser } from '../auth/types'

export interface CitizenContext {
  personId: string
  userId: string
}

/** Pull the logged-in citizen's person_id / user_id off the request (set by the auth guard). */
export function requireCitizen(req: { user?: AuthenticatedUser }): CitizenContext {
  const { personId, userId } = req.user ?? {}
  if (!personId || !userId) {
    throw new ForbiddenException('No citizen account is linked to this login')
  }
  return { personId, userId }
}

export function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body ?? {})
  if (!result.success) {
    throw new BadRequestException({
      success: false,
      errorMessage: 'Invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return result.data
}

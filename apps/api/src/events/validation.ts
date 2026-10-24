import { BadRequestException } from '@nestjs/common'
import type { ZodType, ZodTypeDef } from 'zod'

/** Parse a body or query with a Zod schema; a failure is a 400 with the list of problems. */
export function parseWith<T>(schema: ZodType<T, ZodTypeDef, any>, input: unknown): T {
  const result = schema.safeParse(input ?? {})
  if (!result.success) {
    throw new BadRequestException({
      success: false,
      errorMessage: 'Invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return result.data
}

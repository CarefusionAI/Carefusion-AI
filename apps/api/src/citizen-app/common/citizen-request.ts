import { ForbiddenException } from '@nestjs/common'
import type { AuthenticatedUser } from '../../auth/types'

export type CitizenReq = { user?: AuthenticatedUser }

export interface CitizenCtx {
  user: AuthenticatedUser
  personId: string
  userId: string
}

/** The logged-in citizen: person_id and user_id come from the auth guard. */
export function citizenOf(req: CitizenReq): CitizenCtx {
  const user = req.user
  if (!user?.personId || !user.userId) {
    throw new ForbiddenException('No citizen account is linked to this login')
  }
  return { user, personId: user.personId, userId: user.userId }
}

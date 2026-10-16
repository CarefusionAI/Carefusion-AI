import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Role } from '@carefusion/shared'
import { ROLES_KEY } from './roles.decorator'
import type { AuthenticatedUser } from './types'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles || requiredRoles.length === 0) return true
    const user: AuthenticatedUser | undefined = context.switchToHttp().getRequest().user
    if (!user) return false
    return requiredRoles.includes(user.role)
  }
}

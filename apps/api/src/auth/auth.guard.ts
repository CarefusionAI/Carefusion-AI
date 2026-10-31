import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { Role } from '@carefusion/shared'
import { DatabaseService } from '../database/database.service'
import { IS_PUBLIC_KEY } from './public.decorator'
import { lookupDemoIdentity } from './demo-identity'
import { DemoCredentialsService } from './demo-credentials.service'
import type { AuthenticatedUser } from './types'

const ROLE_VALUES = new Set<string>(Object.values(Role))

@Injectable()
export class CfAuthGuard implements CanActivate {
  private readonly demoMode: boolean

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
    private readonly db: DatabaseService,
    private readonly creds: DemoCredentialsService,
  ) {
    this.demoMode = config.get<string>('DEMO_MODE', 'false') === 'true'
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest()

    // Try real JWT first.
    const authHeader: string | undefined = request.headers.authorization
    if (authHeader?.startsWith('Bearer ') && !authHeader.startsWith('Bearer demo:')) {
      const jwtGuard = new (AuthGuard('jwt'))()
      try {
        return await jwtGuard.canActivate(context) as boolean
      } catch {
        if (!this.demoMode) throw new UnauthorizedException('Invalid token')
      }
    }

    // Demo mode fallback: accept "Authorization: Bearer demo:<ROLE>" or "X-Demo-Role: <ROLE>".
    if (this.demoMode) {
      const demoRole = this.extractDemoRole(request)
      if (demoRole) {
        const user: AuthenticatedUser = {
          id: `demo-${demoRole.toLowerCase().replace(/_/g, '-')}`,
          username: `demo-${demoRole.toLowerCase().replace(/_/g, '-')}`,
          role: demoRole as Role,
          isDemo: true,
        }
        const identity = await lookupDemoIdentity(this.db, demoRole)
        if (identity) {
          user.personId = identity.personId
          user.userId = identity.userId
        }
        request.user = user
        return true
      }
    }

    throw new UnauthorizedException()
  }

  /**
   * The demo role a request claims. A role with a reviewer password only counts when the token is signed and
   * not expired; the X-Demo-Role header is ignored for such roles. Other roles keep the open demo behaviour.
   */
  private extractDemoRole(request: any): string | undefined {
    const authHeader: string | undefined = request.headers.authorization
    if (authHeader?.startsWith('Bearer demo:')) {
      const token = authHeader.slice('Bearer '.length)
      const claimed = token.split(':')[1]?.toUpperCase()
      if (claimed && ROLE_VALUES.has(claimed)) {
        if (!this.creds.requiresPassword(claimed)) return claimed
        const signed = this.creds.roleFromToken(token)
        if (signed && signed.toUpperCase() === claimed) return claimed
      }
      return undefined
    }
    const headerRole: string | undefined = request.headers['x-demo-role']
    if (headerRole) {
      const role = headerRole.toUpperCase()
      if (ROLE_VALUES.has(role) && !this.creds.requiresPassword(role)) return role
    }
    return undefined
  }
}

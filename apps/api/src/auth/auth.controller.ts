import { Controller, Get, Post, Body, Req, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Role } from '@carefusion/shared'
import { Public } from './public.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'
import { lookupDemoIdentity } from './demo-identity'
import type { AuthenticatedUser } from './types'

const ROLE_VALUES = new Set<string>(Object.values(Role))

interface DemoLoginBody {
  role: string
}

@Controller('api/v1/auth')
export class AuthController {
  private readonly demoMode: boolean

  constructor(
    config: ConfigService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
  ) {
    this.demoMode = config.get<string>('DEMO_MODE', 'false') === 'true'
  }

  @Get('me')
  me(@Req() req: any) {
    const user: AuthenticatedUser = req.user
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isDemo: user.isDemo,
      personId: user.personId,
      userId: user.userId,
    }
  }

  @Public()
  @Post('demo-login')
  async demoLogin(@Body() body: DemoLoginBody, @Req() req: any) {
    if (!this.demoMode) {
      throw new UnauthorizedException('Demo login is disabled')
    }
    const role = body.role?.toUpperCase()
    if (!role || !ROLE_VALUES.has(role)) {
      throw new UnauthorizedException('Invalid role')
    }
    const username = `demo-${role.toLowerCase().replace(/_/g, '-')}`
    const user: AuthenticatedUser = {
      id: username,
      username,
      role: role as any,
      isDemo: true,
    }
    const identity = await lookupDemoIdentity(this.db, role)
    if (identity) {
      user.personId = identity.personId
      user.userId = identity.userId
    }

    const ip = req.ip === '::1' ? '127.0.0.1' : req.ip?.replace('::ffff:', '')
    await this.audit.logAction(user, 'auth.demo_login', {
      ip,
      details: { role, demo: true },
    })

    return {
      token: `demo:${role}`,
      user: {
        id: username,
        username,
        role,
        isDemo: true,
        personId: identity?.personId ?? null,
        userId: identity?.userId ?? null,
      },
    }
  }
}

import { Controller, Get, Post, Body, Req, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Role } from '@carefusion/shared'
import { Public } from './public.decorator'
import type { AuthenticatedUser } from './types'

const ROLE_VALUES = new Set<string>(Object.values(Role))

interface DemoLoginBody {
  role: string
}

@Controller('api/v1/auth')
export class AuthController {
  private readonly demoMode: boolean

  constructor(config: ConfigService) {
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
    }
  }

  @Public()
  @Post('demo-login')
  demoLogin(@Body() body: DemoLoginBody) {
    if (!this.demoMode) {
      throw new UnauthorizedException('Demo login is disabled')
    }
    const role = body.role?.toUpperCase()
    if (!role || !ROLE_VALUES.has(role)) {
      throw new UnauthorizedException('Invalid role')
    }
    const username = `demo-${role.toLowerCase().replace(/_/g, '-')}`
    return {
      token: `demo:${role}`,
      user: {
        id: username,
        username,
        role,
        isDemo: true,
      },
    }
  }
}

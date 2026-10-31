import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, HttpException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { Public } from '../auth/public.decorator'
import { ACCESS_COOKIE, AccessService } from './access.service'

const VerifySchema = z.object({ code: z.string().min(1).max(100) })

@Controller('api/v1/access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Public()
  @Get('status')
  status(@Req() req: Request) {
    return { required: this.access.required(), granted: this.access.isGranted(req.headers.cookie) }
  }

  @Public()
  @Post('verify')
  @HttpCode(200)
  async verify(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Vercel sets x-vercel-forwarded-for itself; elsewhere fall back to the first forwarded address.
    const client = String(req.headers['x-vercel-forwarded-for'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0]!.trim()
    if (await this.access.isLocked(client)) throw new HttpException({ message: 'Too many wrong codes. Try again in a few minutes.' }, 429)
    const parsed = VerifySchema.safeParse(body)
    if (!parsed.success || !(await this.access.check(client, parsed.data.code))) {
      throw new UnauthorizedException({ message: 'That code is not right.' })
    }
    const secure = String(req.headers['x-forwarded-proto'] ?? req.protocol) === 'https' ? '; Secure' : ''
    res.setHeader('Set-Cookie', `${ACCESS_COOKIE}=${this.access.token()}; Path=/; Max-Age=43200; HttpOnly; SameSite=Lax${secure}`)
    return { granted: true }
  }
}

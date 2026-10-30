import { Injectable, NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { AccessService } from './access.service'

const OPEN = ['/api/v1/access/', '/api/v1/clock', '/health']

/** Blocks every API call without the access cookie, when an access code is configured. */
@Injectable()
export class AccessGateMiddleware implements NestMiddleware {
  constructor(private readonly access: AccessService) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (!this.access.required()) return next()
    const path = (req.originalUrl ?? req.url).split('?')[0]!
    if (OPEN.some((p) => path === p || path.startsWith(p))) return next()
    if (this.access.isGranted(req.headers.cookie)) return next()
    res.status(401).json({ message: 'Access code required', accessRequired: true })
  }
}

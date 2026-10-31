import type { INestApplication } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

/**
 * Baseline hardening shared by the long-running server (main.ts) and the Vercel function (serverless.ts):
 * no X-Powered-By, standard security headers on every API response, and CORS limited to the web origin.
 * `corsOrigin` false means same-origin only (the Vercel deployment serves web and API from one host).
 */
export function applySecurity(app: INestApplication, corsOrigin: string | false) {
  const http = app.getHttpAdapter().getInstance()
  http.disable('x-powered-by')
  http.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    next()
  })
  app.enableCors({ origin: corsOrigin, credentials: true })
}

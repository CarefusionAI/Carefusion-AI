import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common'
import type { ZodType, ZodTypeDef } from 'zod'
import {
  AadhaarEkycRequestSchema,
  AadhaarOtpInitRequestSchema,
  CitizenRegistrationRequestSchema,
  FaceCheckRequestSchema,
} from '@carefusion/shared'
import type {
  AadhaarEkycResponse,
  AadhaarOtpInitResponse,
  CitizenRegistrationResponse,
  FaceCheckResponse,
} from '@carefusion/shared'
import { Public } from '../auth/public.decorator'
import { RegistrationService } from './registration.service'

function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new BadRequestException({
      success: false,
      errorMessage: 'Invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return result.data
}

/** Public registration endpoints (no login needed). All connectors behind them are mocks. */
@Controller('api/v1/register')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Public()
  @Post('citizen/init-aadhaar-otp')
  initAadhaarOtp(@Body() body: unknown): Promise<AadhaarOtpInitResponse> {
    const { aadhaarNumber } = parseBody(AadhaarOtpInitRequestSchema, body)
    return this.registrationService.initAadhaarOtp(aadhaarNumber)
  }

  @Public()
  @Post('citizen/verify-aadhaar')
  verifyAadhaar(@Body() body: unknown): Promise<AadhaarEkycResponse> {
    const { aadhaarNumber, otp, txnId } = parseBody(AadhaarEkycRequestSchema, body)
    return this.registrationService.verifyAadhaarEkyc(aadhaarNumber, otp, txnId)
  }

  @Public()
  @Post('citizen/verify-face')
  verifyFace(@Body() body: unknown): Promise<FaceCheckResponse> {
    const { aadhaarToken, selfieBase64 } = parseBody(FaceCheckRequestSchema, body)
    return this.registrationService.verifyFace(aadhaarToken, selfieBase64)
  }

  @Public()
  @Post('citizen')
  registerCitizen(@Body() body: unknown): Promise<CitizenRegistrationResponse> {
    const req = parseBody(CitizenRegistrationRequestSchema, body)
    return this.registrationService.registerCitizen(req)
  }

  @Public()
  @Get('districts')
  districts(): Promise<{ id: string; name: string }[]> {
    return this.registrationService.listKeralaDistricts()
  }
}

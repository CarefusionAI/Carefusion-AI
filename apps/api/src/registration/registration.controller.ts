import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common'
import { z } from 'zod'
import type { ZodType, ZodTypeDef } from 'zod'
import {
  AadhaarEkycRequestSchema,
  AadhaarOtpInitRequestSchema,
  CitizenRegistrationRequestSchema,
  DoctorRegistrationRequestSchema,
  FaceCheckRequestSchema,
  HospitalAdminRegistrationRequestSchema,
  PharmacyAdminRegistrationRequestSchema,
} from '@carefusion/shared'
import type {
  AadhaarEkycResponse,
  AadhaarOtpInitResponse,
  CitizenRegistrationResponse,
  DoctorRegistrationResponse,
  FaceCheckResponse,
  HospitalAdminRegistrationResponse,
  HprVerifyResponse,
  PharmacyAdminRegistrationResponse,
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

const HprVerifyRequestSchema = z.object({ hprId: z.string().min(1) })
const DistrictQuerySchema = z.object({ districtId: z.string().uuid().optional() })

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

  @Public()
  @Post('doctor/verify-hpr')
  verifyHpr(@Body() body: unknown): Promise<HprVerifyResponse> {
    const { hprId } = parseBody(HprVerifyRequestSchema, body)
    return this.registrationService.verifyHpr(hprId)
  }

  @Public()
  @Post('doctor')
  registerDoctor(@Body() body: unknown): Promise<DoctorRegistrationResponse> {
    const req = parseBody(DoctorRegistrationRequestSchema, body)
    return this.registrationService.registerDoctor(req)
  }

  @Public()
  @Post('hospital-admin')
  registerHospitalAdmin(@Body() body: unknown): Promise<HospitalAdminRegistrationResponse> {
    const req = parseBody(HospitalAdminRegistrationRequestSchema, body)
    return this.registrationService.registerHospitalAdmin(req)
  }

  @Public()
  @Post('pharmacy-admin')
  registerPharmacyAdmin(@Body() body: unknown): Promise<PharmacyAdminRegistrationResponse> {
    const req = parseBody(PharmacyAdminRegistrationRequestSchema, body)
    return this.registrationService.registerPharmacyAdmin(req)
  }

  @Public()
  @Get('hospitals')
  hospitals(@Query() query: unknown) {
    const { districtId } = parseBody(DistrictQuerySchema, query)
    return this.registrationService.listHospitals(districtId)
  }

  @Public()
  @Get('pharmacies')
  pharmacies(@Query() query: unknown) {
    const { districtId } = parseBody(DistrictQuerySchema, query)
    return this.registrationService.listPharmacies(districtId)
  }
}

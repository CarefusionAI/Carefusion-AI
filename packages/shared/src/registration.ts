import { z } from 'zod'

// Aadhaar e-KYC mock request/response (matches UIDAI OTP-based e-KYC shape)
export const AadhaarEkycRequestSchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/, 'Must be 12 digits'),
  otp: z.string().length(6),
  txnId: z.string(),
})
export type AadhaarEkycRequest = z.infer<typeof AadhaarEkycRequestSchema>

export const AadhaarEkycResponseSchema = z.object({
  success: z.boolean(),
  token: z.string().optional(), // aadhaar reference token (NEVER raw number)
  name: z.string().optional(),
  dob: z.string().optional(), // YYYY-MM-DD
  sex: z.enum(['female', 'male', 'other']).optional(),
  address: z.string().optional(),
  photoBase64: z.string().optional(), // UIDAI photo (base64)
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
})
export type AadhaarEkycResponse = z.infer<typeof AadhaarEkycResponseSchema>

// Aadhaar OTP init (step before e-KYC)
export const AadhaarOtpInitRequestSchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/, 'Must be 12 digits'),
})
export type AadhaarOtpInitRequest = z.infer<typeof AadhaarOtpInitRequestSchema>

export const AadhaarOtpInitResponseSchema = z.object({
  success: z.boolean(),
  txnId: z.string().optional(),
  errorMessage: z.string().optional(),
})
export type AadhaarOtpInitResponse = z.infer<typeof AadhaarOtpInitResponseSchema>

// Face check mock (matches UIDAI face authentication shape)
export const FaceCheckRequestSchema = z.object({
  aadhaarToken: z.string(),
  selfieBase64: z.string(),
})
export type FaceCheckRequest = z.infer<typeof FaceCheckRequestSchema>

export const FaceCheckResponseSchema = z.object({
  success: z.boolean(),
  match: z.boolean().optional(),
  confidence: z.number().min(0).max(100).optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
})
export type FaceCheckResponse = z.infer<typeof FaceCheckResponseSchema>

// ABHA creation mock (matches ABDM ABHA creation shape)
export const AbhaCreateRequestSchema = z.object({
  aadhaarToken: z.string(),
  name: z.string(),
  dob: z.string(),
  sex: z.enum(['female', 'male', 'other']),
  phone: z.string(),
  email: z.string().email().optional(),
})
export type AbhaCreateRequest = z.infer<typeof AbhaCreateRequestSchema>

export const AbhaCreateResponseSchema = z.object({
  success: z.boolean(),
  abhaNumber: z.string().optional(), // DEMO-XXXX-XXXX format
  abhaAddress: z.string().optional(), // name@abdm
  errorMessage: z.string().optional(),
})
export type AbhaCreateResponse = z.infer<typeof AbhaCreateResponseSchema>

// Citizen registration request (what the frontend sends)
export const CitizenRegistrationRequestSchema = z.object({
  // Personal info
  fullName: z.string().min(2).max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: z.enum(['female', 'male', 'other']),
  phone: z.string().min(10).max(15),
  email: z.string().email().optional(),
  password: z.string().min(12),

  // Aadhaar verification results (from prior steps)
  aadhaarToken: z.string(),
  kycVerified: z.literal(true),
  faceCheckPassed: z.literal(true),

  // Health profile
  preferredLanguage: z.enum(['en', 'ml', 'hi']).default('en'),
  bloodGroup: z
    .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'])
    .default('unknown'),

  // Minor guardian (optional)
  guardianPersonId: z.string().uuid().optional(),

  // Consents
  privacyNoticeAccepted: z.literal(true),
  locationLoggingAccepted: z.boolean(),
  aiResearchOptIn: z.boolean().default(false),

  // District
  districtName: z.string().optional(),
})
export type CitizenRegistrationRequest = z.infer<typeof CitizenRegistrationRequestSchema>

export const CitizenRegistrationResponseSchema = z.object({
  success: z.boolean(),
  personId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  abhaNumber: z.string().optional(),
  status: z.enum(['active', 'pending', 'flagged']).optional(),
  errorMessage: z.string().optional(),
})
export type CitizenRegistrationResponse = z.infer<typeof CitizenRegistrationResponseSchema>

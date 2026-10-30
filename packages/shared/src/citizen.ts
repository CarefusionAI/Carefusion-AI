import { z } from 'zod'

// Mirrors identity.blood_group in the database.
export const BloodGroupSchema = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'])
export type BloodGroup = z.infer<typeof BloodGroupSchema>

export const PreferredLanguageSchema = z.enum(['en', 'ml', 'hi'])
export type PreferredLanguage = z.infer<typeof PreferredLanguageSchema>

// ---------- Citizen profile ----------
export const CitizenProfileResponseSchema = z.object({
  person: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    dateOfBirth: z.string(), // ISO date (YYYY-MM-DD)
    sex: z.string(),
    aadhaarToken: z.string().nullable(), // reference token only, never the number
    abhaNumber: z.string().nullable(),
    abhaAddress: z.string().nullable(),
    kycStatus: z.string(),
    faceCheckStatus: z.string(),
    identityLocked: z.boolean(),
    photoKey: z.string().nullable(),
  }),
  profile: z.object({
    preferredLanguage: z.string(),
    bloodGroup: z.string(),
    organDonorStatus: z.string(),
    aiResearchOptIn: z.boolean(),
    district: z.object({ id: z.string(), name: z.string() }).nullable(),
    state: z.object({ id: z.string(), name: z.string() }).nullable(),
  }),
  specialCategories: z.array(
    z.object({
      id: z.string().uuid(),
      categoryCode: z.string(),
      categoryName: z.string(),
      otherText: z.string().nullable(),
      status: z.string(),
    }),
  ),
  emergencyContacts: z.array(
    z.object({
      id: z.string().uuid(),
      contactPersonId: z.string().uuid(),
      contactName: z.string(),
      relation: z.string(),
      priority: z.number().int(),
    }),
  ),
})
export type CitizenProfileResponse = z.infer<typeof CitizenProfileResponseSchema>

export const UpdateCitizenProfileRequestSchema = z.object({
  preferredLanguage: PreferredLanguageSchema.optional(),
  bloodGroup: BloodGroupSchema.optional(),
  aiResearchOptIn: z.boolean().optional(),
})
export type UpdateCitizenProfileRequest = z.infer<typeof UpdateCitizenProfileRequestSchema>

// ---------- Special categories ----------
export const SpecialCategoryTypeSchema = z.object({
  code: z.string(),
  name: z.string(),
})
export type SpecialCategoryType = z.infer<typeof SpecialCategoryTypeSchema>

export const SpecialCategoryRequestSchema = z.object({
  categoryCode: z.string().trim().min(1).max(50),
  otherText: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().min(1).max(100), // e.g. treated / untreated / in progress
})
export type SpecialCategoryRequest = z.infer<typeof SpecialCategoryRequestSchema>

// ---------- Folders and documents ----------
// Mirrors records.doc_type in the database.
export const DocTypeSchema = z.enum([
  'consultation_note',
  'prescription',
  'lab_report',
  'scan',
  'vcf',
  'discharge_summary',
  'handover_note',
  'referral_note',
  'certificate',
  'upload',
  'text_note',
  'ai_chat_summary',
  'voice_note_transcript',
  'identity_proof',
  'organ_pledge_form',
])
export type DocType = z.infer<typeof DocTypeSchema>

export const FolderKindSchema = z.enum([
  'user',
  'doctor_uploads',
  'ai_chat',
  'image_analysis',
  'genomic_analysis',
  'temporal_analysis',
])
export type FolderKind = z.infer<typeof FolderKindSchema>

export const FolderResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: FolderKindSchema,
  parentFolderId: z.string().uuid().nullable(),
  documentCount: z.number().int().nonnegative(),
  createdAt: z.string(),
})
export type FolderResponse = z.infer<typeof FolderResponseSchema>

export const CreateFolderRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentFolderId: z.string().uuid().optional(),
})
export type CreateFolderRequest = z.infer<typeof CreateFolderRequestSchema>

export const RenameFolderRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
})
export type RenameFolderRequest = z.infer<typeof RenameFolderRequestSchema>

export const DocumentResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  docType: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  isSelfReported: z.boolean(),
  createdAt: z.string(),
})
export type DocumentResponse = z.infer<typeof DocumentResponseSchema>

// Multipart upload: the file itself is a form file field, the rest are text fields.
export const UploadDocumentRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  folderId: z.string().uuid(),
  docType: DocTypeSchema.default('upload'),
})
export type UploadDocumentRequest = z.infer<typeof UploadDocumentRequestSchema>

export const UploadDocumentResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  folderId: z.string().uuid(),
  docType: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number(),
  sha256: z.string(), // hex
  createdAt: z.string(),
})
export type UploadDocumentResponse = z.infer<typeof UploadDocumentResponseSchema>

export const DocumentDownloadResponseSchema = z.object({
  url: z.string(),
  title: z.string(),
  mimeType: z.string().nullable(),
})
export type DocumentDownloadResponse = z.infer<typeof DocumentDownloadResponseSchema>

export const MoveDocumentRequestSchema = z.object({
  toFolderId: z.string().uuid(),
})
export type MoveDocumentRequest = z.infer<typeof MoveDocumentRequestSchema>

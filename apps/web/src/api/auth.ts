// API calls used by the public sign-in and registration screens (pages/auth).
// Every government service behind these endpoints is a mock connector in the alpha
// (Aadhaar OTP / e-KYC, face check, ABHA, HPR, HFR). No raw Aadhaar number is kept: the
// browser sends it only to the mock OTP and e-KYC calls, then keeps the returned token.
import { apiFetch, apiJson } from '../lib/api'

export type Sex = 'female' | 'male' | 'other'

type WithError<T> = T & { message?: string; errorMessage?: string }

/** POST JSON and return the parsed body even on 4xx/5xx (the API sends { message } or { errorMessage }). */
export async function postJson<T>(path: string, body: unknown): Promise<WithError<T>> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as WithError<T>
  if (!res.ok && !data.errorMessage && !data.message) data.errorMessage = `Request failed (${res.status})`
  return data
}

/** Pick the message a user should see from a failed response. */
export function errorText(r: { message?: string; errorMessage?: string }, fallback: string): string {
  return r.errorMessage ?? r.message ?? fallback
}

/** 1x1 transparent PNG used as the simulated selfie (the alpha never opens the camera). */
export const MOCK_SELFIE =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// ---------- Citizen registration ----------

export interface Ekyc {
  token: string
  name: string
  dob: string
  sex: Sex
  address: string
  photoBase64: string
}

export function aadhaarInitOtp(aadhaarNumber: string) {
  return postJson<{ success: boolean; txnId?: string }>('/v1/register/citizen/init-aadhaar-otp', { aadhaarNumber })
}

export async function aadhaarVerify(aadhaarNumber: string, otp: string, txnId: string) {
  const r = await postJson<{
    success: boolean
    token?: string
    name?: string
    dob?: string
    sex?: Sex
    address?: string
    photoBase64?: string
  }>('/v1/register/citizen/verify-aadhaar', { aadhaarNumber, otp, txnId })
  if (r.success && r.token && r.name && r.dob && r.sex) {
    const ekyc: Ekyc = {
      token: r.token,
      name: r.name,
      dob: r.dob,
      sex: r.sex,
      address: r.address ?? '',
      photoBase64: r.photoBase64 ?? '',
    }
    return { ok: true as const, ekyc }
  }
  return { ok: false as const, error: errorText(r, 'Verification failed.') }
}

export function faceVerify(aadhaarToken: string, selfieBase64: string = MOCK_SELFIE) {
  return postJson<{ success: boolean; match?: boolean; confidence?: number }>('/v1/register/citizen/verify-face', {
    aadhaarToken,
    selfieBase64,
  })
}

export interface CitizenRegistration {
  fullName: string
  dateOfBirth: string
  sex: Sex
  phone: string
  email?: string
  password: string
  aadhaarToken: string
  kycVerified: true
  faceCheckPassed: true
  preferredLanguage: 'en' | 'ml' | 'hi'
  bloodGroup: string
  guardianPersonId?: string
  privacyNoticeAccepted: true
  locationLoggingAccepted: boolean
  aiResearchOptIn: boolean
  districtName?: string
}

export function registerCitizen(body: CitizenRegistration) {
  return postJson<{ success: boolean; personId?: string; userId?: string; abhaNumber?: string; status?: string }>(
    '/v1/register/citizen',
    body,
  )
}

export function listDistricts() {
  return apiJson<{ id: string; name: string }[]>('/v1/register/districts')
}

// ---------- Doctor registration ----------

export interface HprResult {
  name: string
  council: string
  regNumber: string
  specialisation: string
}

export async function verifyHpr(hprId: string) {
  const r = await postJson<{
    success: boolean
    verified?: boolean
    name?: string
    council?: string
    regNumber?: string
    specialisation?: string
  }>('/v1/register/doctor/verify-hpr', { hprId })
  if (r.success && r.verified) {
    const hpr: HprResult = {
      name: r.name ?? '',
      council: r.council ?? '',
      regNumber: r.regNumber ?? '',
      specialisation: r.specialisation ?? '',
    }
    return { ok: true as const, hpr }
  }
  return { ok: false as const, error: errorText(r, 'HPR ID could not be verified.') }
}

export interface DoctorRegistration {
  personId: string
  hprId: string
  hospitalId: string
  councilName: string
  councilRegNo: string
  employmentType: 'govt' | 'private'
  specialisation?: string
  degrees: { degree: string; year: number }[]
}

export function registerDoctor(body: DoctorRegistration) {
  return postJson<{ success?: boolean; userId?: string; status?: string }>('/v1/register/doctor', body)
}

// ---------- Hospital and pharmacy admins ----------

export interface HospitalRow {
  id: string
  hfr_id: string
  name: string
  ownership: string
  hospital_type: string
  district_id: string
}

export interface PharmacyRow {
  id: string
  licence_no: string
  name: string
  pharmacy_type: string
  district_id: string
}

export function listHospitals() {
  return apiJson<HospitalRow[]>('/v1/register/hospitals')
}

export function listPharmacies() {
  return apiJson<PharmacyRow[]>('/v1/register/pharmacies')
}

export function registerHospitalAdmin(body: { personId: string; hospitalId: string }) {
  return postJson<{ success?: boolean; userId?: string; status?: string }>('/v1/register/hospital-admin', body)
}

export function registerPharmacyAdmin(body: { personId: string; pharmacyId: string; drugLicenceNo: string }) {
  return postJson<{ success?: boolean; userId?: string; status?: string }>('/v1/register/pharmacy-admin', body)
}

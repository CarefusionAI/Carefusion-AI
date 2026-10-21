# 15 — Login, Registration, Authentication and Access Control: Complete Details

**Project:** CareFusion AI (Government Edition)
**Last updated:** 2026-10-17 (W4, Saturday S1; branch `w4-citizen-profile`)
**Status of this file:** Single-source reference. It combines design decisions (docs 02, 06, 08, 09), the current alpha implementation, and code references.
**Source of truth when docs disagree:** `docs/04_DECISION_LOG.md`.

> **SYNTHETIC DEMO DATA.** Everything in this file describes an alpha demo that uses synthetic data only. No real Aadhaar, ABHA or patient data is used. All government integrations are mock connectors. All AI outputs are simulated.

---

## Table of Contents

1. [Project context](#1-project-context)
2. [Roles](#2-roles)
3. [Login pages](#3-login-pages)
4. [Demo role switcher (alpha only)](#4-demo-role-switcher-alpha-only)
5. [Authentication flow (current alpha implementation)](#5-authentication-flow-current-alpha-implementation)
6. [Backend auth module in detail](#6-backend-auth-module-in-detail)
7. [API endpoints](#7-api-endpoints)
8. [Keycloak configuration](#8-keycloak-configuration)
9. [Registration flows (design)](#9-registration-flows-design)
10. [Who creates and approves whom](#10-who-creates-and-approves-whom)
11. [Patient record access](#11-patient-record-access)
12. [Session and security settings](#12-session-and-security-settings)
13. [Permissions matrix](#13-permissions-matrix)
14. [Mock government integrations (alpha)](#14-mock-government-integrations-alpha)
15. [Audit logging](#15-audit-logging)
16. [Implementation status](#16-implementation-status)
17. [Code reference index](#17-code-reference-index)
18. [Open questions](#18-open-questions)

---

## 1. Project context

CareFusion AI is a unified medical-affairs platform for Indian government health services (client: Ministry of Health and Family Welfare). It is being extended from an academic research system (IEEE ICSCST 2026, Paper 1609). The current goal is a **working alpha demo website on synthetic data**.

The alpha is a **website only** (React + NestJS + FastAPI). A React Native mobile app comes after funding.

### 1.1 Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm + Turborepo |
| `apps/web` | React 18 + Vite + TypeScript + shadcn/ui + Tailwind |
| `apps/api` | NestJS (Node 22) + Prisma |
| `apps/ai` | FastAPI (Python 3.12), simulated outputs |
| `packages/shared` | Shared types and Zod schemas |
| Database | PostgreSQL 16 + PostGIS |
| Identity provider | Keycloak |
| Cache | Valkey |
| File storage | MinIO (laptop) / Cloudflare R2 (alpha) |
| Mail (laptop) | Mailpit |

### 1.2 Hard rules that affect auth

These come from `CLAUDE.md` and apply to everything in this file.

1. **Synthetic data only.** Demo identifiers look like `DEMO-0000-1234` and can never pass as real Aadhaar or ABHA numbers.
2. **No raw Aadhaar anywhere.** Tokens only.
3. **AI is decision support only.** Citizens see an AI result only after a doctor has reviewed it.
4. **Government integrations are mock connectors** with the same request/response shape as the real service. No real government logos or look-alike official login pages.
5. **No secrets in the repo.** Settings come from `.env`. `.env.example` holds safe demo values.

### 1.3 Two authentication modes

The system runs in one of two modes, chosen by the `DEMO_MODE` environment variable on the API.

| Mode | Token | How identity is established | Used for |
|------|-------|-----------------------------|----------|
| Demo mode (`DEMO_MODE=true`) | `Bearer demo:<ROLE>` | Role is read straight from the token string; the person and user IDs are looked up in the database | The alpha demo, via the role switcher |
| Real mode | `Bearer <Keycloak JWT>` | JWT is validated against Keycloak's JWKS (RS256) | The production design; wired in the API but not yet used by the web app |

Both modes are accepted by the same global guard (`CfAuthGuard`), so the API does not need to change when the web app later moves to real Keycloak login.

---

## 2. Roles

There are **12 roles**. The same names are used in the shared `Role` enum (`packages/shared/src/index.ts`), the NestJS `@Roles()` decorator, the Keycloak realm roles, and the frontend role config (`apps/web/src/config/roles.ts`).

```
CITIZEN, DOCTOR, NURSE, LAB_TECH, RADIOLOGY_TECH, PHARMACIST, PHARMACY_ADMIN,
HOSPITAL_ADMIN, DISTRICT_ADMIN, STATE_ADMIN, ZONAL_ADMIN, CENTRAL_ADMIN
```

### 2.1 Role groups

| Group | Roles |
|-------|-------|
| Citizens | `CITIZEN` |
| Medical Staff | `DOCTOR`, `NURSE`, `LAB_TECH`, `RADIOLOGY_TECH` |
| Pharmacy | `PHARMACIST`, `PHARMACY_ADMIN` |
| Administrators | `HOSPITAL_ADMIN`, `DISTRICT_ADMIN`, `STATE_ADMIN`, `ZONAL_ADMIN`, `CENTRAL_ADMIN` |

### 2.2 Role badges (used by the role switcher)

| Role | Badge |
|------|-------|
| CITIZEN | CIT |
| DOCTOR | DOC |
| NURSE | NUR |
| LAB_TECH | LAB |
| RADIOLOGY_TECH | RAD |
| PHARMACIST | PHA |
| PHARMACY_ADMIN | PAD |
| HOSPITAL_ADMIN | HAD |
| DISTRICT_ADMIN | DAD |
| STATE_ADMIN | SAD |
| ZONAL_ADMIN | ZAD |
| CENTRAL_ADMIN | CAD |

### 2.3 Two accounts for doctors

A doctor has **two separate accounts**:

- a **citizen account** for their own health record, and
- a **doctor account** for the doctor tools.

The User / Doctor tab on the main login page chooses which one to sign in to. The doctor account **cannot** open its own citizen record (see section 11.6).

---

## 3. Login pages

There are **3 separate login pages**. All three are built as visual-only forms in the alpha.

### 3.1 Summary

| Page | Route | File | Who uses it |
|------|-------|------|-------------|
| Main login | `/login` | `apps/web/src/pages/LoginPage.tsx` | Citizens and doctors |
| Staff login | `/login/staff` | `apps/web/src/pages/StaffLoginPage.tsx` | Nurse, Lab Technician, Radiology Technician |
| Admin login | `/login/admin` | `apps/web/src/pages/AdminLoginPage.tsx` | All 6 administrator roles (including Pharmacy Admin) |

### 3.2 Main login page (`/login`)

- Has a **User / Doctor** tab switch.
- **User tab (citizens):** phone or email + password.
- **Doctor tab:** username + password.
- Links to **Create new user** (`/register`) and **Register as doctor** (`/register/doctor`).
- Cross-links to the staff and admin login pages.

### 3.3 Staff login page (`/login/staff`)

- For **Nurse**, **Lab Technician** and **Radiology Technician**.
- Has an **"I am a"** dropdown to choose the staff role.
- **No self-registration.** The page says "Contact your hospital admin for access."
- This matches the design: the hospital admin creates staff accounts (section 9.3).

### 3.4 Admin login page (`/login/admin`)

- For all **6 admin-level roles**.
- Has an **"I am a"** dropdown with: Hospital Admin, Pharmacy Admin, District Admin, State Admin, Zonal Admin, Central Admin.
- **Self-registration links** are shown for **Hospital Admin** and **Pharmacy Admin** only (these two self-register; section 10).
- **District, State, Zonal and Central admins** see a **Jan Parichay SSO** button, marked **"Coming soon"** in the alpha. These four levels are created by the level above, not self-registered.

### 3.5 Shared components

All three pages use the shared `LoginCard` component (`apps/web/src/components/LoginCard.tsx`) which provides the CF brand header (deep teal with an amber accent).

All three pages cross-link to each other through `LoginPageLinks`, so a user who lands on the wrong page can move to the right one.

### 3.6 Alpha behaviour of the forms

The forms are **visual only** in the alpha. Submitting a form shows a note telling the user to use the **demo role switcher** instead (section 4). No credentials are sent anywhere from these forms.

### 3.7 Route map (login-related)

| Route | Purpose | Built |
|-------|---------|-------|
| `/` | Demo role switcher | Yes |
| `/login` | Main login (User / Doctor) | Yes (visual) |
| `/login/staff` | Staff login | Yes (visual) |
| `/login/admin` | Admin login | Yes (visual) |
| `/register` | Citizen registration | Linked; flow not built |
| `/register/doctor` | Doctor registration | Linked; flow not built |

---

## 4. Demo role switcher (alpha only)

**File:** `apps/web/src/components/RoleSwitcher.tsx`
**Location:** `/` (the root route).

The role switcher is how the alpha is actually used. It lets a demo viewer sign in as any of the 12 roles in one click, with **no password**.

### 4.1 Layout

Buttons are grouped as:

- **Citizens**
- **Medical Staff**
- **Pharmacy**
- **Administrators**

Each button shows its role badge (CIT, DOC, NUR, LAB, RAD, PHA, PAD, HAD, DAD, SAD, ZAD, CAD).

### 4.2 What a click does

1. Calls `login(role)` from `AuthContext`.
2. `AuthContext` sets the token to `demo:<ROLE>`.
3. The app navigates to that role's dashboard path (defined in `apps/web/src/config/roles.ts`).

The role switcher must never ship to a production build. It exists only because `DEMO_MODE=true` in the alpha.

---

## 5. Authentication flow (current alpha implementation)

### 5.1 Frontend: `AuthContext`

**File:** `apps/web/src/context/AuthContext.tsx`

`AuthProvider` wraps the whole app and exposes `login(role)`, `logout()` and the current user.

**`DemoUser` type**

```typescript
type DemoUser = {
  username: string
  displayName: string
  role: Role
  personId?: string   // identity.person.id
  userId?: string     // identity.app_user.id
}
```

**`login(role)` sequence**

1. Set the auth token to `demo:<ROLE>` (stored in `sessionStorage` under `cf-demo-token`).
2. Store the role in `sessionStorage` under `cf-demo-role`.
3. Fire `POST /api/v1/auth/demo-login` to get the real `personId` and `userId` from the database.
4. Update `sessionStorage` with the `personId` and `userId`.

**`logout()`**

- Clears the token and all related session storage.

**Page load**

- Reads the stored role and token from `sessionStorage` and restores the session.
- `sessionStorage` is per browser tab. The demo session therefore **survives a page refresh in the same tab but does not carry across tabs or windows**.

**API calls**

- The token is sent as `Authorization: Bearer demo:<ROLE>` on every API call.

### 5.2 Session storage keys

| Key | Holds |
|-----|-------|
| `cf-demo-token` | `demo:<ROLE>` token string |
| `cf-demo-role` | The selected role |
| (person and user IDs) | Written after the `demo-login` response returns |

### 5.3 End-to-end sequence (demo mode)

```
Browser (RoleSwitcher)            API (NestJS)                      Database
        |                              |                                |
        | click "DOC"                  |                                |
        |-- login('DOCTOR') ---------->|                                |
        | set cf-demo-token            |                                |
        |   = demo:DOCTOR              |                                |
        |-- POST /api/v1/auth/demo-login { role: 'DOCTOR' } ----------->|
        |                              |-- lookupDemoIdentity(DOCTOR) ->|
        |                              |<-- { personId, userId } -------|
        |                              |-- audit: auth.demo_login ----->|
        |<-- { token, user } ----------|                                |
        | store personId/userId        |                                |
        | navigate to dashboard        |                                |
        |                              |                                |
        |-- GET /api/v1/... Authorization: Bearer demo:DOCTOR --------->|
        |                              | CfAuthGuard -> RolesGuard      |
```

---

## 6. Backend auth module in detail

All files live in `apps/api/src/auth/`.

### 6.1 File list

| File | Purpose |
|------|---------|
| `auth.module.ts` | Registers `JwtStrategy`, `CfAuthGuard` (global) and `RolesGuard` (global) |
| `auth.guard.ts` | `CfAuthGuard`: the main guard, applied globally |
| `jwt.strategy.ts` | `JwtStrategy`: Keycloak JWT validation through JWKS |
| `roles.guard.ts` | `RolesGuard`: checks the `@Roles()` decorator |
| `roles.decorator.ts` | `@Roles(...roles: Role[])` decorator |
| `public.decorator.ts` | `@Public()` decorator to skip authentication |
| `auth.controller.ts` | `/api/v1/auth/me` and `/api/v1/auth/demo-login` |
| `demo-identity.ts` | Maps a demo role to a real `person_id` / `user_id` from the database |
| `types.ts` | `AuthenticatedUser` and `JwtPayload` interfaces |

### 6.2 Guard order

Both guards are registered globally. Authentication runs first (`CfAuthGuard`), then authorisation (`RolesGuard`).

```
Request
  -> CfAuthGuard   (who are you?  sets request.user, or 401)
  -> RolesGuard    (are you allowed here?  checks @Roles(), or 403)
  -> Controller
```

### 6.3 `CfAuthGuard` flow (`auth.guard.ts`)

1. **Public route check.** If the route has `@Public()`, skip authentication.
2. **Real JWT.** If the request has `Authorization: Bearer <real-jwt>`, validate it with Keycloak's JWKS (RS256) via `JwtStrategy`.
3. **Demo mode.** If `DEMO_MODE=true` and the token is `Bearer demo:<ROLE>`, or an `X-Demo-Role` header is present:
   - Build an `AuthenticatedUser` with that role.
   - Call `lookupDemoIdentity()` to get `personId` and `userId` from the database.
   - Attach the user to `request.user`.
4. **Otherwise** respond **401 Unauthorized**.

Note: demo tokens are only honoured when `DEMO_MODE=true`. With `DEMO_MODE` off, a `demo:<ROLE>` token falls through to step 4 and is rejected.

### 6.4 `RolesGuard` flow (`roles.guard.ts`)

1. Read the `@Roles()` metadata from the handler and the class.
2. If no roles are specified, **allow** (any authenticated user).
3. Otherwise check that `request.user.role` is in the required list. If not, the request is rejected (403).

**Usage example**

```typescript
@Roles(Role.DOCTOR)
@Get('patients/:id')
getPatient() { /* only DOCTOR reaches here */ }

@Public()
@Get('/health')
health() { /* no auth */ }
```

### 6.5 `JwtStrategy` (`jwt.strategy.ts`)

| Item | Value |
|------|-------|
| Libraries | `passport-jwt` + `jwks-rsa` |
| Signing keys fetched from | `{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs` |
| Issuer checked | `{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}` |
| Algorithm | RS256 |
| Role source | `realm_access.roles` in the JWT payload, mapped to our `Role` enum |
| Fallback | `CITIZEN` if no matching role is found |

The fallback to `CITIZEN` is the least-privileged role, so an unrecognised token never gains staff or admin rights.

### 6.6 Demo identity resolution (`demo-identity.ts`)

Demo tokens only carry a role, but the API needs a real person and user to attach to records (for example, a citizen's profile and documents). `lookupDemoIdentity(role)` solves that.

- Maps each role to an `account_type` in the `identity.app_user` table.
- For staff roles (`NURSE`, `LAB_TECH`, `RADIOLOGY_TECH`) it also checks `identity.staff_profile.staff_role`.
- Finds the **first active user** for that role.
- **Caches** the result in memory (one lookup per role per process lifetime).
- Returns `{ personId, userId }`, or `undefined` if the database is not ready yet.

Because of the cache, restarting the API is needed after re-seeding the database if the "first active user" changes.

### 6.7 `AuthenticatedUser` type (`types.ts`)

```typescript
interface AuthenticatedUser {
  id: string
  username: string
  email?: string
  firstName?: string
  lastName?: string
  role: Role
  isDemo: boolean
  personId?: string  // identity.person.id
  userId?: string    // identity.app_user.id
}
```

### 6.8 `JwtPayload` type (`types.ts`)

```typescript
interface JwtPayload {
  sub: string
  preferred_username: string
  email?: string
  given_name?: string
  family_name?: string
  realm_access?: { roles: string[] }
  resource_access?: Record<string, { roles: string[] }>
}
```

### 6.9 How `JwtPayload` becomes `AuthenticatedUser`

| `AuthenticatedUser` field | From JWT |
|---------------------------|----------|
| `id` | `sub` |
| `username` | `preferred_username` |
| `email` | `email` |
| `firstName` | `given_name` |
| `lastName` | `family_name` |
| `role` | first matching entry of `realm_access.roles` (else `CITIZEN`) |
| `isDemo` | `false` |

For demo tokens, `isDemo` is `true` and `personId` / `userId` come from `lookupDemoIdentity()`.

---

## 7. API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/auth/me` | Required | Returns current user info: `id`, `username`, `email`, `role`, `isDemo`, `personId`, `userId` |
| POST | `/api/v1/auth/demo-login` | Public | Demo-only. Accepts `{ role }`, returns `{ token, user }` with `personId` / `userId`. Logs the action to the audit trail. |
| GET | `/health` | Public | Health check |

### 7.1 `POST /api/v1/auth/demo-login`

**Request**

```json
{ "role": "DOCTOR" }
```

**Response (shape)**

```json
{
  "token": "demo:DOCTOR",
  "user": {
    "id": "...",
    "username": "...",
    "role": "DOCTOR",
    "isDemo": true,
    "personId": "...",
    "userId": "..."
  }
}
```

- Public (no token needed) because it is the entry point of the demo.
- Writes an audit entry with action `auth.demo_login`.
- Should be disabled when `DEMO_MODE` is not `true`.

### 7.2 `GET /api/v1/auth/me`

- Requires a valid token (demo or real).
- Returns the `AuthenticatedUser` for the token, so the web app can confirm who it is signed in as.

### 7.3 Error responses

| Status | When |
|--------|------|
| 401 | No token, bad token, or a `demo:` token while `DEMO_MODE` is off |
| 403 | Token is valid but the role is not in `@Roles()` for that route |

---

## 8. Keycloak configuration

**Realm export:** `keycloak/realm-export.json`

### 8.1 Realm settings

| Setting | Value |
|---------|-------|
| Realm | `carefusion` |
| Display name | CareFusion AI |
| Registration | Allowed |
| Email as username | No |
| Login with email | Yes |
| Duplicate emails | No |
| Password reset | Yes |
| SSL required | none (**dev only**) |
| Access token lifespan | 900 seconds (15 min) |
| SSO session idle timeout | 900 seconds (15 min) |
| SSO session max lifespan | 28800 seconds (8 hours) |
| Password policy | Minimum 12 characters |
| OTP policy | TOTP, HmacSHA1, 6 digits, 30-second period |

SSL "none" is acceptable only on the laptop. It must be turned on for the hosted alpha (Oracle Always Free behind Caddy).

### 8.2 OIDC clients

| Client | Type | Flow | PKCE | Redirect URIs |
|--------|------|------|------|---------------|
| `carefusion-web` | Public | Authorization Code | S256 | `http://localhost:5173/*`, `https://*.vercel.app/*` |
| `carefusion-api` | Confidential (secret: `api-demo-secret-change-me`) | Service Account | n/a | n/a |

- The `api-demo-secret-change-me` value is a **demo-only** placeholder and must be replaced through `.env` for any hosted environment. Do not commit real secrets (Rule 7).
- The wildcard `https://*.vercel.app/*` redirect is for alpha previews only and should be narrowed to the real domain before any wider use.

### 8.3 Protocol mappers

Both clients have a `realm-roles` protocol mapper that puts realm roles into the `roles` claim in the **ID token, access token and userinfo**.

`JwtStrategy` reads `realm_access.roles` (the standard Keycloak claim), which Keycloak includes by default.

### 8.4 Demo users (12)

All demo users have the password **`Demo1234!pass`** (14 characters, so it meets the 12-character policy) and an email of the form `demo-<role>@carefusion.demo`.

| Username | Role |
|----------|------|
| `demo-citizen` | CITIZEN |
| `demo-doctor` | DOCTOR |
| `demo-nurse` | NURSE |
| `demo-labtech` | LAB_TECH |
| `demo-radiotech` | RADIOLOGY_TECH |
| `demo-pharmacist` | PHARMACIST |
| `demo-pharmadmin` | PHARMACY_ADMIN |
| `demo-hospitaladmin` | HOSPITAL_ADMIN |
| `demo-districtadmin` | DISTRICT_ADMIN |
| `demo-stateadmin` | STATE_ADMIN |
| `demo-zonaladmin` | ZONAL_ADMIN |
| `demo-centraladmin` | CENTRAL_ADMIN |

The email domain `carefusion.demo` is not a real domain, so these accounts cannot be confused with real people.

### 8.5 Environment variables used by auth

| Variable | Used by | Meaning |
|----------|---------|---------|
| `DEMO_MODE` | API | `true` enables `demo:<ROLE>` tokens and `/auth/demo-login` |
| `KEYCLOAK_URL` | API (`JwtStrategy`) | Base URL of Keycloak |
| `KEYCLOAK_REALM` | API (`JwtStrategy`) | Realm name (`carefusion`) |

Safe demo values are in `.env.example`; the real `.env` is never committed.

---

## 9. Registration flows (design)

These flows come from the design docs. Not all are built yet (see section 16). The shared Zod schemas already exist in `packages/shared/src/registration.ts`.

### 9.1 A. Citizen registration

**Steps**

1. **Open the app** and accept the privacy notice: DPDP consent, location logging, and an optional AI-research opt-in.
2. **Create new user:** name, phone, email, date of birth, sex, address, password (minimum 12 characters).
3. **Aadhaar e-KYC** (token only, never the raw Aadhaar number) plus a **live face check** (UIDAI face authentication). PAN is optional.
4. **Under 18:** birth certificate plus a parent or guardian, who must be a registered user, with recorded consent. The guardian manages the account. Control is handed over at 18.
5. **ABHA** is created or linked in the background.
6. **Health profile:** fill in the profile and add **at least one emergency contact** (who must be a registered user).
7. **Approval: automatic** if e-KYC and face check pass. Flagged cases go to the district admin, then the state admin.

**No-smartphone flow**

- **Assisted registration** by an ASHA worker or hospital staff, using the same e-KYC and face check.
- A **printed health card** with an ABHA QR code is issued.
- A doctor opens the record by scanning the card QR; an **OTP goes to the patient's basic phone**; this starts a **30-minute session**.

**Lost phone**

- **Online:** Aadhaar OTP + face check on the new phone.
- **Or:** assisted recovery at a hospital or with an ASHA worker.
- The old device is logged out and the rotating key moves to the new phone.

**Shared Zod schemas (`packages/shared/src/registration.ts`)**

| Schema | Purpose |
|--------|---------|
| `AadhaarOtpInitRequestSchema` / `AadhaarOtpInitResponseSchema` | Start Aadhaar OTP |
| `AadhaarEkycRequestSchema` / `AadhaarEkycResponseSchema` | Complete e-KYC |
| `FaceCheckRequestSchema` / `FaceCheckResponseSchema` | Live face check |
| `AbhaCreateRequestSchema` / `AbhaCreateResponseSchema` | ABHA create or link |
| `CitizenRegistrationRequestSchema` / `CitizenRegistrationResponseSchema` | Final registration |

**Citizen registration request fields**

| Field | Notes |
|-------|-------|
| `fullName` | |
| `dateOfBirth` | |
| `sex` | |
| `phone` | |
| `email` | Optional |
| `password` | Minimum 12 characters |
| `aadhaarToken` | Token only, never raw Aadhaar |
| `kycVerified` | **Must be `true`** |
| `faceCheckPassed` | **Must be `true`** |
| `preferredLanguage` | |
| `bloodGroup` | |
| `guardianPersonId` | Optional; required for under 18 |
| `privacyNoticeAccepted` | **Must be `true`** |
| `locationLoggingAccepted` | |
| `aiResearchOptIn` | Optional research consent |
| `districtName` | Optional |

### 9.2 B. Doctor registration

**Principles**

- Doctors have **two separate accounts**: citizen (own health record) and doctor (doctor tools).
- The User / Doctor switch on the login page picks which one.
- The doctor account **cannot** open its own citizen record.
- Opening a **family member's** record is allowed but **flagged in the log**.

**Steps**

1. Self-register with the **HPR ID** and **NMC / state council registration number**.
2. Add degrees and specialisation (certificates), plus hospital and department.
3. Employee proof. Government: government employee ID or posting order. Private: hospital employee ID.
4. HPR is checked automatically. Then **district admin approves**, then **state admin confirms**. Flagged cases go to the central admin.
5. Set a password and **mandatory MFA**. Set up an **e-signature** (e-Sign / DSC) for prescriptions.
6. Status moves `PENDING` to `ACTIVE`, or to `REJECTED` with a reason.

**Shared Zod schemas**

| Schema | Purpose |
|--------|---------|
| `DoctorRegistrationRequestSchema` / `DoctorRegistrationResponseSchema` | Registration |
| `HprVerifyResponseSchema` | Result of the HPR check |

**Doctor registration request fields**

| Field | Notes |
|-------|-------|
| `personId` | Must already exist as a citizen |
| `hprId` | |
| `councilName` | |
| `councilRegNo` | |
| `specialisation` | Optional |
| `degrees[]` | List of degrees |
| `hospitalId` | |
| `departmentId` | Optional |
| `employmentType` | Government or private |

### 9.3 C. Nurse, lab and radiology staff

- The **hospital admin creates** the account.
- The staff member gets an **activation link**, then sets a **password and MFA**.
- After login they see an **orders queue**. They can **upload only for ordered patients**.
- Activation is immediate (no extra approval).

**Shared Zod schemas**

| Schema | Purpose |
|--------|---------|
| `CreateStaffRequestSchema` | Hospital admin creates staff |
| `CreateAccountResponseSchema` | Response (shared by several create flows) |

### 9.4 D. Hospital admin

- **Self-registers** with: **HFR ID** + photo ID, authorisation letter, hospital licence, employee ID.
- The **district admin approves**.
- Then the user sets a password and **MFA** (a hardware key is recommended).

**Shared Zod schemas**

| Schema | Purpose |
|--------|---------|
| `HospitalAdminRegistrationRequestSchema` / `HospitalAdminRegistrationResponseSchema` | Registration |
| `HfrVerifyResponseSchema` | Result of the HFR check |

### 9.5 E. Pharmacy admin and pharmacist

- The **pharmacy admin self-registers** with a **drug licence number** (government hospital pharmacy or private).
- The licence is checked against state drug control / CDSCO records.
- The **district admin approves**. A government hospital pharmacy is linked to its hospital.
- The **pharmacy admin creates pharmacist accounts**. The pharmacist gets an activation link, then sets a password and MFA.

**Shared Zod schemas**

| Schema | Purpose |
|--------|---------|
| `PharmacyAdminRegistrationRequestSchema` / `PharmacyAdminRegistrationResponseSchema` | Registration |
| `CreatePharmacistRequestSchema` / `CreateAccountResponseSchema` | Pharmacy admin creates pharmacist |
| `DrugLicenceVerifyResponseSchema` | Result of the drug licence check |

### 9.6 F. District, State, Zonal and Central admins

- **Created by the level above**, and approved where the chain says so (section 10).
- Sign in with **Jan Parichay (government SSO) plus a hardware security key**. This applies to all four levels.
- An **approved network or VPN is recommended** for state, zonal and central.
- **Scope is locked** to the admin's geographic area.
- **Admin transfer:** open tasks hand over to the successor; accounts are never shared.

**Shared Zod schemas**

| Schema | Purpose |
|--------|---------|
| `CreateAdminRequestSchema` / `CreateAccountResponseSchema` | Higher admin creates a lower admin |

---

## 10. Who creates and approves whom

| Account | Created by | Approved by |
|---------|-----------|-------------|
| Central admin | Set up at launch (two-person approval) | None |
| Zonal admin (5 of them) | Central admin (two-person approval) | None |
| State admin | Zonal admin | Central admin |
| District admin | State admin | Zonal admin |
| Hospital admin | Self-registers | District admin |
| Pharmacy admin | Self-registers | District admin |
| Doctor | Self-registers | District admin, then state admin (central checks flagged cases only) |
| Nurse / lab / radiology staff | Hospital admin | None (immediate activation) |
| Pharmacist | Pharmacy admin | None (immediate activation) |
| Citizen | Self-registers (or assisted) | Automatic if e-KYC and face check pass; flagged goes to district then state |

**Approval time limits:** approvals have a time limit, and overdue items **escalate to the next level**. The exact number of days is **to be decided** (section 18).

**Implementation note:** the approval chain API is built (admin-ops module). The admin creation chain and the staff/pharmacist account creation were built in W3 (commit `e654770`).

### 10.1 Chain diagram

```
CENTRAL ADMIN  (launch, two-person approval)
   |
   +-- creates ZONAL ADMIN x5  (two-person approval)
          |
          +-- creates STATE ADMIN   --- approved by CENTRAL
          |      |
          |      +-- creates DISTRICT ADMIN --- approved by ZONAL
          |
          +-- DISTRICT ADMIN approves:
                 - HOSPITAL ADMIN  (self-registered)
                 - PHARMACY ADMIN  (self-registered)
                 - DOCTOR  (then STATE ADMIN confirms)
                 - flagged CITIZENS (then STATE ADMIN second)

HOSPITAL ADMIN  --creates--> NURSE, LAB_TECH, RADIOLOGY_TECH
PHARMACY ADMIN  --creates--> PHARMACIST
```

---

## 11. Patient record access

### 11.1 Normal visit: rotating key

- The citizen app shows a key that **changes every 10 seconds**, as a QR code plus a number.
- The doctor scans or types it. This opens a **30-minute session**, for **one doctor at a time**. The patient can **end the session early**.
- During the session the doctor can **read, add documents, highlight, and create folders**. The doctor can **never edit or delete**.
- After the session the doctor sees only the patient's **name and the doctor's own additions**.
- The patient is **notified of every session**.

### 11.2 Health card users (no smartphone)

- The patient has a **printed health card** with an ABHA QR code.
- The doctor scans the card; an **OTP goes to the patient's basic phone**; the doctor enters it to open a 30-minute session.

### 11.3 Admission mode

- The patient, or an emergency contact, grants the **treating team** access **until discharge**.
- **Every view is logged.**
- Staff (nurse, lab, radiology) can open records in **admission mode only**.

### 11.4 Referral

- A **referral note goes ahead** to the receiving doctor.
- The receiving doctor **still needs the patient's key** to open the record.

### 11.5 Emergency access (unconscious patient)

1. **Basic emergency information** (blood group, allergies, emergency contacts) is visible **without a key**.
2. For **detailed records**, the **emergency contact approves on their own phone** using an emergency code.
3. **Fallback:** the doctor types the contact's Aadhaar and the emergency code. (Check regulations; see section 18.)
4. If **no contact is reachable**, the doctor uses **break-glass** with a **mandatory reason**. Access is **time-limited**.
5. The **district admin reviews first**. The **central admin verifies within 24 hours**.
6. **Misuse** leads to account suspension and the case being reported to the medical council.

### 11.6 Doctor's own record

- The doctor account **cannot open its own citizen record**.
- A **family member's record** may be opened but is **flagged in the log**.

### 11.7 Summary table

| Situation | How access is granted | Duration | Logged |
|-----------|----------------------|----------|--------|
| Normal visit (smartphone) | Rotating 10-second key (QR or number) | 30 min or until patient ends | Yes; patient notified |
| Normal visit (no smartphone) | Health card QR + OTP to basic phone | 30 min | Yes |
| Admission | Patient or emergency contact grants treating team | Until discharge | Every view |
| Referral | Note goes ahead; receiving doctor needs key | Per visit | Yes |
| Emergency, contact reachable | Emergency contact approves with emergency code | Time-limited | Yes |
| Emergency, no contact | Break-glass with reason | Time-limited | Yes; district then central review |
| Own record (doctor) | Not allowed | n/a | n/a |
| Family record (doctor) | Allowed | Per visit | Flagged |

---

## 12. Session and security settings

| Setting | Value |
|---------|-------|
| Access token lifespan | 15 min |
| Refresh token (staff and admin) | 8 hours |
| Refresh token (citizen) | 30 days, device-bound |
| Doctor patient session | 30 min from key scan, or until the patient ends it |
| Admission mode | Until discharge |
| Rotating key | Changes every 10 seconds; single use; one active doctor session per patient |
| Lock after failed attempts | 5 attempts, then time-based unlock plus admin reset |
| Password minimum | 12 characters, with a breached-password check |
| JWT signing | RS256 or ES256, keys rotated |
| Refresh tokens | Rotated and revocable |
| "Log out everywhere" | Supported |
| Staff and admin idle timeout | 15 minutes |
| Rate limits | On OTP, key-entry and emergency-access endpoints |
| Doctor location check | At record open and every 5 min (hospital geofence) |

### 12.1 What the Keycloak realm already enforces

| Setting | Realm value | Matches design? |
|---------|-------------|-----------------|
| Access token lifespan | 900 s | Yes (15 min) |
| SSO idle timeout | 900 s | Yes (15 min idle for staff and admin) |
| SSO max lifespan | 28800 s | Yes (8 hours staff and admin refresh) |
| Password length | 12 | Yes |
| TOTP policy | 6 digits, 30 s | Yes (MFA basis) |

The citizen 30-day device-bound refresh token, the breached-password check, lockout after 5 attempts, and rate limits are **design targets not yet configured**.

### 12.2 Multi-factor authentication by role (design)

| Role | MFA requirement |
|------|----------------|
| Citizen | Password; device-bound refresh |
| Doctor | Password + mandatory MFA; e-signature for prescriptions |
| Nurse, lab, radiology | Password + MFA (set at activation) |
| Pharmacist | Password + MFA (set at activation) |
| Hospital admin | Password + MFA (hardware key recommended) |
| Pharmacy admin | Password + MFA |
| District, State, Zonal, Central admin | Jan Parichay SSO + hardware security key |

---

## 13. Permissions matrix

Source: doc 02. A blank cell means no access. "Yes" means permitted.

| Permission | Citizen | Doctor | Staff | Hosp. Admin | Pharm. Admin | Pharmacist | District | State | Zonal | Central |
|---|---|---|---|---|---|---|---|---|---|---|
| View own record | Yes | | | | | | | | | |
| Open patient record (key / card / admission) | | Yes | admission only | | | | | | | |
| Emergency access | | Yes | | | | | | | | |
| Run AI tools | guidance chat | Yes | | | | | | | | |
| See AI results | after doctor review | Yes | | | | | | | | |
| Upload data | Yes, own (incl. home vitals) | Yes | Yes, ordered patients | | | | | | | |
| Write / e-sign prescription | | Yes | | | | | | | | |
| Dispense | | | | | | Yes | | | | |
| Manage stock | | | | view (linked) | Yes | auto | | | | |
| Bed availability | view | | | Yes | | | | | | |
| Manage staff accounts | | | | Yes, staff | Yes, pharmacists | | | | | |
| Approve doctors | | | | | | | Yes, first | Yes, confirm | | flagged |
| Approve hospitals / pharmacies | | | | | | | Yes | | | |
| Flagged new users | | | | | | | Yes, first | Yes, second | | |
| Review emergency access | | | | | | | Yes, first | | | Yes, 24h |
| Moderate ratings / complaints | | | | | | | Yes | | | |
| Health alerts | mute normal | | | | | | | Yes, state | | Yes, national |
| Dashboards | | | | hospital | | | district | state | zone | national |
| View activity logs | access history only | | | | | | | with central permission | | Yes, all |
| Assign zones | | | | | | | | | | Yes |

### 13.1 Reading the matrix

- **Staff** here means nurse, lab technician and radiology technician.
- **Citizen AI access:** guidance chat only, and AI results are visible only after a doctor has reviewed them (Rule 3).
- **Citizen upload:** citizens upload their own data, including home vitals.
- **Manage stock:** the pharmacy admin manages stock; the pharmacist's stock updates are automatic from dispensing; the hospital admin has a view-only link for a linked pharmacy.
- **Activity logs:** the central admin can always view any log. The state admin needs central permission. A citizen sees only their own access history.

### 13.2 Mapping to `@Roles()` usage

When adding an endpoint, translate the matrix row into a `@Roles()` list.

| Matrix row | Suggested decorator |
|------------|--------------------|
| Write / e-sign prescription | `@Roles(Role.DOCTOR)` |
| Dispense | `@Roles(Role.PHARMACIST)` |
| Manage stock | `@Roles(Role.PHARMACY_ADMIN)` (read for `HOSPITAL_ADMIN`) |
| Manage staff accounts | `@Roles(Role.HOSPITAL_ADMIN, Role.PHARMACY_ADMIN)` with a check on which accounts each may create |
| Approve doctors | `@Roles(Role.DISTRICT_ADMIN, Role.STATE_ADMIN)` plus central for flagged |
| Assign zones | `@Roles(Role.CENTRAL_ADMIN)` |

Role checks alone are not enough for records: record access also needs a valid key, card or admission grant (section 11), and admin actions are scoped to the admin's geographic area.

---

## 14. Mock government integrations (alpha)

All government integrations are **mock connectors** using the **same request/response shape as the real services**. Nothing real is called.

| Integration | Purpose |
|-------------|---------|
| Aadhaar e-KYC (UIDAI) | OTP init and e-KYC verification |
| UIDAI face authentication | Live face check |
| ABHA (ABDM) | Health ID creation and linking |
| HPR | Health Professional Registry verification |
| HFR | Health Facility Registry verification |
| Jan Parichay | Government SSO for admin levels |
| e-Sign / DSC | Digital signatures for prescriptions |
| NOTTO | Organ donation registry |
| e-RaktKosh | Blood bank stock |
| Drug licence | Pharmacy licence verification |
| SMS | Notifications |

**Rules for the alpha**

- No real government logos or look-alike official pages.
- Everything is labelled **"planned integration"** or **"mock connector"**.
- Demo identifiers (for example `DEMO-0000-1234`) cannot pass as real Aadhaar or ABHA numbers.
- Aadhaar is handled as a **token only**, never a raw number.
- Because the mock connectors keep the real request/response shape, swapping in the real service later should only change the connector, not the callers.

**Where each mock is used in the auth flows**

| Flow | Mock connectors used |
|------|---------------------|
| Citizen registration | Aadhaar e-KYC, face authentication, ABHA, SMS |
| Doctor registration | HPR, e-Sign / DSC |
| Hospital admin registration | HFR |
| Pharmacy admin registration | Drug licence |
| Admin login (district to central) | Jan Parichay |
| Emergency access | SMS / OTP to emergency contact |

---

## 15. Audit logging

- **Every login, failure, action and permission change** goes to the user's permanent activity log.
- The log is **hash-chained and append-only**: no edits and no deletions.
- The audit service logs demo logins with the action `auth.demo_login`.
- Each entry includes the **IP address**, **details** and a **timestamp**.
- **Central admin** can always view any log. **State admin** can view logs only with central permission.
- A **patient** sees only the **access history** (who opened the record, and when).

**Implementation:** `apps/api/src/audit/audit.service.ts`.

### 15.1 Events that must be logged (design)

| Event | Notes |
|-------|-------|
| Login success and failure | Includes demo logins (`auth.demo_login`) |
| Lockout after 5 failed attempts | |
| Patient record session opened and closed | Patient notified |
| Family-member record opened by a doctor | Flagged |
| Emergency access and break-glass | Mandatory reason; reviewed by district then central |
| Account creation, approval, rejection | Whole approval chain |
| Permission changes | |
| Admin transfer | Task handover recorded |

---

## 16. Implementation status

Status as of 2026-10-17.

| Component | Status | Files |
|-----------|--------|-------|
| Login pages (3) | Built (visual only) | `apps/web/src/pages/LoginPage.tsx`, `StaffLoginPage.tsx`, `AdminLoginPage.tsx` |
| `LoginCard` shared component | Built | `apps/web/src/components/LoginCard.tsx` |
| Demo role switcher | Built | `apps/web/src/components/RoleSwitcher.tsx` |
| `AuthContext` (frontend) | Built | `apps/web/src/context/AuthContext.tsx` |
| Role config (frontend) | Built | `apps/web/src/config/roles.ts` |
| `CfAuthGuard` (backend) | Built | `apps/api/src/auth/auth.guard.ts` |
| `JwtStrategy` (Keycloak JWKS) | Built | `apps/api/src/auth/jwt.strategy.ts` |
| `RolesGuard` + `@Roles()` | Built | `apps/api/src/auth/roles.guard.ts`, `roles.decorator.ts` |
| `@Public()` decorator | Built | `apps/api/src/auth/public.decorator.ts` |
| Auth controller (`me` + `demo-login`) | Built | `apps/api/src/auth/auth.controller.ts` |
| Demo identity resolution | Built | `apps/api/src/auth/demo-identity.ts` |
| Auth types | Built | `apps/api/src/auth/types.ts` |
| Keycloak realm config | Built | `keycloak/realm-export.json` |
| Shared `Role` enum + Zod schemas | Built | `packages/shared/src/index.ts`, `registration.ts` |
| Audit logging | Built | `apps/api/src/audit/audit.service.ts` |
| Approval chain API | Built (admin-ops module) | `apps/api/src/admin-ops/` |
| Real Keycloak login flow | Not yet (forms show "use demo switcher") | n/a |
| OTP-based first login | Not yet | n/a |
| Aadhaar e-KYC mock connector | Not yet (schemas defined, connector not built) | n/a |
| Face check mock connector | Not yet (schemas defined, connector not built) | n/a |
| ABHA mock connector | Not yet (schemas defined, connector not built) | n/a |
| Citizen registration API | Not yet (schema defined, endpoint not built) | n/a |
| Doctor registration API | Not yet (schema defined, endpoint not built) | n/a |
| Jan Parichay SSO | Not yet (button shown, not connected) | n/a |
| MFA / hardware keys | Not yet | n/a |
| Doctor geofence checking | Not yet | n/a |
| Rotating key (10-second patient key) | Not yet | n/a |
| Emergency access flow | Not yet | n/a |
| Break-glass access | Not yet | n/a |

### 16.1 What works today

- Anyone can open `/`, click a role, and use the app as that role with a demo token.
- The API enforces authentication globally and role checks wherever `@Roles()` is used.
- Demo logins are audited.
- The citizen profile, documents and folders (W4) use the `personId` resolved by `lookupDemoIdentity()`.
- Keycloak can be started with the 12 demo users, and the API can already validate real JWTs.

### 16.2 What does not work yet

- The login forms do not authenticate anyone.
- There is no real registration (citizen, doctor or admin) through the web app.
- No MFA, no Jan Parichay, no geofence, no rotating key, no emergency or break-glass flow.

### 16.3 Suggested next steps (not yet agreed; mark as assumptions)

1. Wire the login forms to Keycloak (Authorization Code + PKCE with `carefusion-web`) while keeping the role switcher behind `DEMO_MODE`.
2. Build the three mock connectors (Aadhaar e-KYC, face check, ABHA) and the citizen registration endpoint.
3. Build the doctor registration endpoint with the mock HPR check and feed it into the existing approval chain.
4. Build the rotating key and the 30-minute doctor session.
5. Build emergency access and break-glass, then geofence checks.

The actual order follows `docs/13_DEMO_BUILD_PLAN.md`; this list is only a suggestion.

---

## 17. Code reference index

### 17.1 Frontend (`apps/web/src/`)

| Path | What it is |
|------|-----------|
| `pages/LoginPage.tsx` | Main login (User / Doctor tabs) |
| `pages/StaffLoginPage.tsx` | Staff login (nurse, lab, radiology) |
| `pages/AdminLoginPage.tsx` | Admin login (6 admin roles) |
| `components/LoginCard.tsx` | Shared card with CF brand header |
| `components/RoleSwitcher.tsx` | One-click demo login at `/` |
| `context/AuthContext.tsx` | `AuthProvider`, `DemoUser`, `login`, `logout` |
| `config/roles.ts` | Role metadata and dashboard paths |

### 17.2 Backend (`apps/api/src/`)

| Path | What it is |
|------|-----------|
| `auth/auth.module.ts` | Wires strategy and global guards |
| `auth/auth.guard.ts` | `CfAuthGuard` |
| `auth/jwt.strategy.ts` | `JwtStrategy` (Keycloak JWKS, RS256) |
| `auth/roles.guard.ts` | `RolesGuard` |
| `auth/roles.decorator.ts` | `@Roles(...)` |
| `auth/public.decorator.ts` | `@Public()` |
| `auth/auth.controller.ts` | `GET /auth/me`, `POST /auth/demo-login` |
| `auth/demo-identity.ts` | `lookupDemoIdentity()` |
| `auth/types.ts` | `AuthenticatedUser`, `JwtPayload` |
| `audit/audit.service.ts` | Hash-chained audit log writer |
| `admin-ops/` | Approval chain and account-creation API |

### 17.3 Shared and infra

| Path | What it is |
|------|-----------|
| `packages/shared/src/index.ts` | `Role` enum and shared types |
| `packages/shared/src/registration.ts` | Zod schemas for all registration and create-account flows |
| `keycloak/realm-export.json` | Keycloak realm, clients, mappers, demo users |
| `.env.example` | Safe demo values (`DEMO_MODE`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`) |
| `carefusion-db/migrations/` | SQL source of truth, including the `identity` schema |

### 17.4 Database tables touched by auth

| Table | Used for |
|-------|---------|
| `identity.person` | The human; `personId` |
| `identity.app_user` | The login account; `userId`; `account_type` maps to a role |
| `identity.staff_profile` | `staff_role` distinguishes nurse, lab tech, radiology tech |

See `docs/11_DATABASE_DESIGN.md` for the full schema.

### 17.5 Related docs

| Doc | Topic |
|-----|-------|
| `docs/02_LOGIN_AND_AUTH_FLOW.md` | Original login and auth design (permissions matrix source) |
| `docs/06_ROLES_PROPOSAL.md` | Role proposal |
| `docs/07_USER_APP_FLOW.md` | Citizen app |
| `docs/08_DOCTOR_APP_FLOW.md` | Doctor app |
| `docs/09_STAFF_AND_ADMIN_FLOWS.md` | Staff and admin flows |
| `docs/10_TECH_STACK.md` | Tech stack |
| `docs/11_DATABASE_DESIGN.md` | Database design |
| `docs/04_DECISION_LOG.md` | Decisions (source of truth) |

---

## 18. Open questions

These are unresolved. Do not build around them without asking Athun (Rule 9).

1. **Approval time limit.** How many days before an overdue approval escalates to the next level?
2. **UIDAI access.** Will this app get UIDAI e-KYC and face authentication access?
3. **Aadhaar fallback for emergency contacts.** Verify regulations for typing a contact's Aadhaar in the emergency fallback.
4. **PAN storage rules.** What are the rules for storing PAN?
5. **DPDP children's data and location logging.** What does the DPDP Act require for children's data and for consent to location logging?
6. **e-Sign / DSC onboarding.** How are doctors onboarded to e-Sign / DSC?
7. **Jan Parichay onboarding.** How does this app get onboarded to Jan Parichay?
8. **DPDP right to erasure versus "never delete" accounts.** How are these reconciled?
9. **NMC rules on doctor ratings.** What is allowed?
10. **CDSCO classification of AI modules.** How will the AI modules be classified?

### 18.1 Open items added while writing this file (assumptions to confirm)

- `POST /auth/demo-login` should return an error when `DEMO_MODE` is not `true`. Confirm this is enforced in code.
- The hosted alpha needs Keycloak SSL turned on, a new `carefusion-api` client secret, and narrower redirect URIs.
- The `lookupDemoIdentity()` cache lasts for the process lifetime; confirm this is acceptable after re-seeding.

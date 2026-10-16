import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, ExtractJwt } from 'passport-jwt'
import { passportJwtSecret } from 'jwks-rsa'
import { Role } from '@carefusion/shared'
import type { AuthenticatedUser, JwtPayload } from './types'

const ROLE_MAP: Record<string, Role> = {
  citizen: Role.CITIZEN,
  doctor: Role.DOCTOR,
  nurse: Role.NURSE,
  lab_tech: Role.LAB_TECH,
  radiology_tech: Role.RADIOLOGY_TECH,
  pharmacist: Role.PHARMACIST,
  pharmacy_admin: Role.PHARMACY_ADMIN,
  hospital_admin: Role.HOSPITAL_ADMIN,
  district_admin: Role.DISTRICT_ADMIN,
  state_admin: Role.STATE_ADMIN,
  zonal_admin: Role.ZONAL_ADMIN,
  central_admin: Role.CENTRAL_ADMIN,
}

function extractRole(payload: JwtPayload): Role {
  const realmRoles = payload.realm_access?.roles ?? []
  for (const r of realmRoles) {
    const mapped = ROLE_MAP[r]
    if (mapped) return mapped
  }
  return Role.CITIZEN
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const kcUrl = config.get<string>('KEYCLOAK_URL', 'http://keycloak:8080')
    const realm = config.get<string>('KEYCLOAK_REALM', 'carefusion')

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${kcUrl}/realms/${realm}/protocol/openid-connect/certs`,
      }),
      issuer: `${kcUrl}/realms/${realm}`,
      algorithms: ['RS256'],
    })
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      username: payload.preferred_username,
      email: payload.email,
      firstName: payload.given_name,
      lastName: payload.family_name,
      role: extractRole(payload),
      isDemo: payload.preferred_username?.startsWith('demo-') ?? false,
    }
  }
}

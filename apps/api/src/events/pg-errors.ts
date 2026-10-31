import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common'

interface PgError {
  code?: string
  message?: string
  constraint?: string
  detail?: string
}

/** Turn a PostgreSQL error into a clean HTTP error. Rule-code messages (CF070: ...) become the user-facing text. */
export function mapPgError(err: unknown): HttpException {
  if (err instanceof HttpException) return err
  const e = (err ?? {}) as PgError
  const raw = e.message ?? 'Database error'
  const clean = raw.replace(/^CF\d{3}:\s*/, '')
  switch (e.code) {
    case '23514': // check_violation (also our CFxxx rules)
      return new BadRequestException(clean)
    case '23503': // foreign_key_violation
      return new BadRequestException('A referenced record does not exist')
    case '23502': // not_null_violation
      return new BadRequestException('A required value is missing')
    case '23505': // unique_violation
      return new ConflictException('This already exists')
    case '22P02': // invalid_text_representation
    case '22007':
    case '22008':
      return new BadRequestException('Invalid value')
    case '42501': // insufficient_privilege / RLS WITH CHECK
      return new ForbiddenException('Not allowed')
    case 'P0001': // raise_exception
      return new BadRequestException(clean)
    default:
      return new InternalServerErrorException('Database error')
  }
}

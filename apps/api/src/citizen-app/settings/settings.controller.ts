import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common'
import {
  DeleteAccountRequestSchema,
  ExportRequestSchema,
  RevokeOtherDevicesRequestSchema,
  UpdatePreferencesRequestSchema,
} from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { SettingsService } from './settings.service'

/** Settings: preferences, signed-in devices, data export, account deletion request. */
@Controller('api/v1/citizen/settings')
@Roles(Role.CITIZEN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** GET /api/v1/citizen/settings -> SettingsResponse */
  @Get()
  get(@Req() req: CitizenReq) {
    return this.settings.get(citizenOf(req))
  }

  /** PATCH /api/v1/citizen/settings/preferences -> SettingsResponse */
  @Patch('preferences')
  update(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.settings.updatePreferences(citizenOf(req), parseWith(UpdatePreferencesRequestSchema, body))
  }

  /** GET /api/v1/citizen/settings/devices -> DeviceDto[] */
  @Get('devices')
  devices(@Req() req: CitizenReq) {
    return this.settings.listDevices(citizenOf(req))
  }

  /** POST /api/v1/citizen/settings/devices/revoke-others { keepDeviceId? } -> DeviceDto[] */
  @Post('devices/revoke-others')
  revokeOthers(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.settings.revokeOthers(citizenOf(req), parseWith(RevokeOtherDevicesRequestSchema, body))
  }

  /** POST /api/v1/citizen/settings/devices/:id/revoke -> DeviceDto[] */
  @Post('devices/:id/revoke')
  revoke(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.settings.revokeDevice(citizenOf(req), id)
  }

  /** GET /api/v1/citizen/settings/export -> ExportRequestDto[] */
  @Get('export')
  exports(@Req() req: CitizenReq) {
    return this.settings.listExports(citizenOf(req))
  }

  /** POST /api/v1/citizen/settings/export { format: zip|fhir } -> ExportRequestDto (recorded only in the alpha) */
  @Post('export')
  requestExport(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.settings.requestExport(citizenOf(req), parseWith(ExportRequestSchema, body))
  }

  /** POST /api/v1/citizen/settings/delete-request { confirm: "DELETE", reason? } -> DeletionRequestDto (30-day grace) */
  @Post('delete-request')
  requestDeletion(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.settings.requestDeletion(citizenOf(req), parseWith(DeleteAccountRequestSchema, body))
  }

  /** POST /api/v1/citizen/settings/delete-request/cancel -> { cancelled } */
  @Post('delete-request/cancel')
  cancelDeletion(@Req() req: CitizenReq) {
    return this.settings.cancelDeletion(citizenOf(req))
  }
}

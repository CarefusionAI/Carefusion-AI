import { Controller, Get } from '@nestjs/common'
import { Public } from './auth/public.decorator'
import { demoNowIso, demoNowMs } from './staff/common/demo-clock'

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'carefusion-api' }
  }

  /** The demo clock, so screens can show the same "today" as the data. frozen=false means the real time. */
  @Public()
  @Get('api/v1/clock')
  clock() {
    return { now: new Date(demoNowMs()).toISOString(), frozen: demoNowIso() !== null }
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import { ApprovalController } from '../src/approval/approval.controller'

const make = () => {
  const approval = { escalateOverdue: vi.fn().mockResolvedValue(3) }
  return { ctl: new ApprovalController(approval as never), approval }
}
const req = (secret?: string) => ({ headers: secret === undefined ? {} : { 'x-cron-secret': secret } })

describe('POST escalate', () => {
  afterEach(() => { delete process.env.CRON_SECRET })
  it('is closed when CRON_SECRET is not set, even with a header', async () => {
    const { ctl, approval } = make()
    await expect(ctl.escalate(req('anything'))).rejects.toThrow(ForbiddenException)
    await expect(ctl.escalate(req(''))).rejects.toThrow(ForbiddenException)
    expect(approval.escalateOverdue).not.toHaveBeenCalled()
  })
  it('rejects a missing or wrong secret', async () => {
    process.env.CRON_SECRET = 'right'
    const { ctl, approval } = make()
    await expect(ctl.escalate(req())).rejects.toThrow(ForbiddenException)
    await expect(ctl.escalate(req('wrong'))).rejects.toThrow(ForbiddenException)
    expect(approval.escalateOverdue).not.toHaveBeenCalled()
  })
  it('runs with the right secret', async () => {
    process.env.CRON_SECRET = 'right'
    const { ctl } = make()
    await expect(ctl.escalate(req('right'))).resolves.toEqual({ success: true, escalated: 3 })
  })
})

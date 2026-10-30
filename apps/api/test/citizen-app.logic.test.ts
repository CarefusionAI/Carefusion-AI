import { describe, expect, it } from 'vitest'
import { AppHrefSchema, EmitEventRequestSchema } from '@carefusion/shared/dist/events.js'
import {
  AddVitalReadingRequestSchema,
  CreateComplaintRequestSchema,
  DeleteAccountRequestSchema,
  UpdateNotificationPrefsRequestSchema,
} from '@carefusion/shared/dist/citizen-app.js'
import { KEY_WINDOW_SECONDS, deriveAccessKey, formatKey, keyHandle, verifyAccessKey } from '../src/citizen-app/access/access-key'
import { buildCategories } from '../src/citizen-app/access/access.logic'
import { detectRedFlag, pickSummary, simulateReply } from '../src/citizen-app/ai-chat/simulator'
import { stageOf } from '../src/citizen-app/complaints/complaints.logic'
import { buildIcs, daysBetweenIst, kindOfType, monthRangeIst } from '../src/citizen-app/dates/dates.logic'
import { publicName } from '../src/citizen-app/reviews/reviews.logic'
import { bmiBand, bmiOf, classifyBp, classifySugar, shouldNotifyDoctor } from '../src/citizen-app/vitals/vitals.logic'
import { tokenForIndex } from '../src/citizen-app/care/care.service.token'
import { mapEvent, tabForAlert } from '../src/citizen-app/alerts/alerts.logic'

const SECRET = 'test-secret'
const PERSON = 'cfd00000-0001-4000-8000-000000000001'

describe('rotating access key', () => {
  it('is 6 digits and stable inside a 10 second window', () => {
    const t = Date.UTC(2026, 9, 17, 9, 0, 1)
    const a = deriveAccessKey(SECRET, PERSON, t)
    expect(a).toMatch(/^\d{6}$/)
    expect(deriveAccessKey(SECRET, PERSON, t + 5000)).toBe(a)
  })
  it('changes in the next window and differs per person and secret', () => {
    const t = Date.UTC(2026, 9, 17, 9, 0, 1)
    expect(deriveAccessKey(SECRET, PERSON, t + KEY_WINDOW_SECONDS * 1000)).not.toBe(deriveAccessKey(SECRET, PERSON, t))
    expect(deriveAccessKey(SECRET, 'cfd00000-0001-4000-8000-000000000002', t)).not.toBe(deriveAccessKey(SECRET, PERSON, t))
    expect(deriveAccessKey('other', PERSON, t)).not.toBe(deriveAccessKey(SECRET, PERSON, t))
  })
  it('verifies the current and previous window only', () => {
    const t = Date.UTC(2026, 9, 17, 9, 0, 1)
    const code = deriveAccessKey(SECRET, PERSON, t)
    expect(verifyAccessKey(SECRET, PERSON, code, t)).toBe(true)
    expect(verifyAccessKey(SECRET, PERSON, formatKey(code), t + 10_000)).toBe(true)
    expect(verifyAccessKey(SECRET, PERSON, code, t + 30_000)).toBe(false)
    expect(verifyAccessKey(SECRET, PERSON, '000000', t)).toBe(false)
  })
  it('has a stable handle that is not the person id', () => {
    expect(keyHandle(SECRET, PERSON)).toMatch(/^[0-9a-f]{16}$/)
    expect(keyHandle(SECRET, PERSON)).toBe(keyHandle(SECRET, PERSON))
  })
})

describe('simulated AI chat', () => {
  const reviewed = [
    { documentId: 'd1', docTitle: 'Chest X-ray, PA view', title: 'No urgent findings', summary: 'Mild haze.', reviewer: 'Dr. Arun Nair' },
    { documentId: 'd2', docTitle: 'Lipid profile', title: 'Cholesterol slightly high', summary: 'LDL 142.', reviewer: 'Dr. Arun Nair' },
  ]
  const ctx = { reviewed, nextAppointment: { whenText: '21 Oct', doctor: 'Dr. Arun Nair' } }

  it('stops on red flags and points to 108', () => {
    expect(detectRedFlag('I have chest pain')).toBe('chest pain')
    const r = simulateReply('I cannot breathe properly', ctx)
    expect(r.redFlag).toBe(true)
    expect(r.text).toContain('108')
  })
  it('explains only doctor-reviewed results', () => {
    const r = simulateReply('Explain my chest x-ray result', ctx)
    expect(r.text).toContain('Dr. Arun Nair reviewed your Chest X-ray')
    expect(r.sourceRefs[0]?.document_id).toBe('d1')
    const none = simulateReply('Explain my eye test result', ctx)
    expect(none.text).toContain('reviewed it')
    expect(none.sourceRefs[0]?.label).toBe('Doctor review pending')
    const empty = simulateReply('Explain my lipid result', { reviewed: [], nextAppointment: null })
    expect(empty.sourceRefs[0]?.label).toBe('Doctor review pending')
  })
  it('never changes doses and always labels itself simulated', () => {
    const r = simulateReply('Should I take a higher dose of metformin?', ctx)
    expect(r.text).toContain('Only your doctor can change a dose')
    for (const q of ['hello', 'what is dengue', 'diet advice', 'diagnose me']) {
      const out = simulateReply(q, ctx)
      expect(out.text).toContain('simulated AI output')
      expect(out.sourceRefs.every((s) => s.simulated)).toBe(true)
    }
  })
  it('picks the latest summary when asked for the latest', () => {
    expect(pickSummary('explain my latest result', reviewed)?.documentId).toBe('d1')
    expect(pickSummary('lipid', reviewed)?.documentId).toBe('d2')
    expect(pickSummary('knee scan', reviewed)).toBeNull()
  })
})

describe('vitals rules', () => {
  const target = { systolic: { low: 90, high: 130 }, diastolic: { low: 60, high: 85 } }
  it('classifies blood pressure', () => {
    expect(classifyBp(118, 76, target)).toBe('in_range')
    expect(classifyBp(134, 86, target)).toBe('above_target')
    expect(classifyBp(142, 80, target)).toBe('high')
    expect(classifyBp(120, 92, target)).toBe('high')
    expect(classifyBp(85, 60, target)).toBe('low')
    expect(classifyBp(118, 76)).toBe('normal')
  })
  it('classifies sugar and notifies only on hard limits', () => {
    expect(classifySugar(132, 'fasting', 130)).toBe('above_target')
    expect(classifySugar(120, 'fasting', 130)).toBe('in_range')
    expect(classifySugar(190, 'random', null)).toBe('high')
    expect(classifySugar(60, 'fasting', 130)).toBe('low')
    expect(shouldNotifyDoctor('above_target')).toBe(false)
    expect(shouldNotifyDoctor('high')).toBe(true)
  })
  it('computes BMI bands', () => {
    expect(bmiOf(61, 158)).toBe(24.4)
    expect(bmiBand(24.4)).toBe('healthy')
    expect(bmiBand(27)).toBe('over')
    expect(bmiBand(31)).toBe('high')
    expect(bmiBand(17)).toBe('under')
  })
  it('validates reading requests', () => {
    expect(AddVitalReadingRequestSchema.safeParse({ kind: 'bp', systolic: 120, diastolic: 80 }).success).toBe(true)
    expect(AddVitalReadingRequestSchema.safeParse({ kind: 'bp', systolic: 120 }).success).toBe(false)
    expect(AddVitalReadingRequestSchema.safeParse({ kind: 'sugar', value: 100 }).success).toBe(true)
    expect(AddVitalReadingRequestSchema.safeParse({ kind: 'weight', value: -3 }).success).toBe(false)
  })
})

describe('dates', () => {
  it('maps database types to design kinds', () => {
    expect(kindOfType('refill_due')).toBe('med')
    expect(kindOfType('personal_reminder')).toBe('personal')
    expect(kindOfType('anything_else')).toBe('other')
  })
  it('works out an IST month range and day differences', () => {
    const { start, end } = monthRangeIst('2026-10')
    expect(start.toISOString()).toBe('2026-09-30T18:30:00.000Z')
    expect(end.toISOString()).toBe('2026-10-31T18:30:00.000Z')
    expect(daysBetweenIst(new Date('2026-10-17T09:30:00Z'), new Date('2026-10-21T05:00:00Z'))).toBe(4)
    expect(daysBetweenIst(new Date('2026-10-17T18:00:00Z'), new Date('2026-10-17T19:00:00Z'))).toBe(1)
  })
  it('builds an iCalendar feed with repeat rules and escaping', () => {
    const ics = buildIcs(
      [{ id: 'x1', title: 'BP, morning; sitting', startsAt: new Date('2026-10-20T01:30:00Z'), endsAt: null, notes: null, repeatRule: 'daily' }],
      new Date('2026-10-17T00:00:00Z'),
    )
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:BP\\, morning\; sitting')
    expect(ics).toContain('RRULE:FREQ=DAILY')
    expect(ics).toContain('DTSTART:20261020T013000Z')
  })
})

describe('care, alerts, access, reviews, complaints helpers', () => {
  it('uses the design token formula', () => {
    expect(tokenForIndex(4)).toBe(16)
    expect(tokenForIndex(0)).toBe(8)
  })
  it('maps events and alerts to tabs', () => {
    expect(mapEvent('dispensed')).toEqual({ group: 'my_care', tab: 'reminders' })
    expect(mapEvent('unknown-type').group).toBe('my_care')
    expect(tabForAlert('health_dept', 'Blood donation camp - 8 Nov')).toBe('reminders')
    expect(tabForAlert('emergency', 'Heatwave')).toBe('alerts')
  })
  it('builds the share switches with defaults and a locked emergency card', () => {
    const cats = buildCategories([{ category: 'imaging', enabled: true }])
    expect(cats[0]).toMatchObject({ key: 'emg', locked: true, enabled: true })
    expect(cats.find((c) => c.key === 'lab')?.enabled).toBe(true)
    expect(cats.find((c) => c.key === 'imaging')?.enabled).toBe(true)
    expect(cats.find((c) => c.key === 'genomic')?.enabled).toBe(false)
  })
  it('shortens reviewer names and maps complaint stages', () => {
    expect(publicName('Sreelatha Kurian Nair')).toBe('Sreelatha N.')
    expect(publicName('Madonna')).toBe('Madonna')
    expect(stageOf('open')).toBe(0)
    expect(stageOf('assigned')).toBe(1)
    expect(stageOf('reopened')).toBe(1)
    expect(stageOf('resolved')).toBe(2)
  })
})

describe('request schemas', () => {
  it('only accepts in-app hrefs', () => {
    for (const ok of ['/', '/citizen/alerts', '/doctor/queue?x=1']) expect(AppHrefSchema.safeParse(ok).success).toBe(true)
    for (const bad of ['https://evil.com', '//evil.com', 'citizen', '/a b', '/a\\b', 'javascript:alert(1)'])
      expect(AppHrefSchema.safeParse(bad).success).toBe(false)
  })
  it('validates an event to emit', () => {
    expect(EmitEventRequestSchema.safeParse({ type: 'booking', to: ['doctor'], title: 'x', href: '/doctor/queue' }).success).toBe(true)
    expect(EmitEventRequestSchema.safeParse({ type: 'booking', to: [], title: 'x' }).success).toBe(false)
    expect(EmitEventRequestSchema.safeParse({ type: 'booking', to: ['admin'], title: 'x' }).success).toBe(false)
  })
  it('keeps emergency alerts on and requires DELETE to delete', () => {
    expect(UpdateNotificationPrefsRequestSchema.safeParse({ prefs: [{ category: 'my_care', channel: 'app', enabled: false }] }).success).toBe(true)
    expect(DeleteAccountRequestSchema.safeParse({ confirm: 'delete' }).success).toBe(false)
    expect(DeleteAccountRequestSchema.safeParse({ confirm: 'DELETE' }).success).toBe(true)
  })
  it('needs a place for a complaint', () => {
    const base = { category: 'billing', title: 'Extra fee', body: 'Asked to pay' }
    expect(CreateComplaintRequestSchema.safeParse(base).success).toBe(false)
    expect(CreateComplaintRequestSchema.safeParse({ ...base, placeText: 'Taluk hospital' }).success).toBe(true)
  })
})

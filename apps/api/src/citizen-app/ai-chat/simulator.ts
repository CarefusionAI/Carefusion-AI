import { SIMULATED_AI_LABEL } from '@carefusion/shared/dist/citizen-app.js'
import type { ChatSourceRef } from '@carefusion/shared/dist/citizen-app.js'

/**
 * Rule-based SIMULATED guidance for the citizen AI chat. It is not a model, it never diagnoses, and it only
 * explains a result after a doctor has reviewed it (CLAUDE.md rule 3). Every reply says so.
 */
export const DISCLAIMER = 'This is simulated AI output, not a diagnosis.'
export const EMERGENCY_NUMBER = '108'

export interface ReviewedSummary {
  documentId: string
  /** The document's own title, e.g. "Chest X-ray, PA view". */
  docTitle: string
  /** Short headline of the summary, e.g. "No urgent findings". */
  title: string
  summary: string
  reviewer: string
}

export interface SimContext {
  reviewed: ReviewedSummary[]
  nextAppointment: { whenText: string; doctor: string } | null
}

export interface SimReply {
  text: string
  sourceRefs: ChatSourceRef[]
  redFlag: boolean
  redFlagReason: string | null
}

const RED_FLAGS: [RegExp, string][] = [
  [/chest (pain|tightness|pressure)/i, 'chest pain'],
  [/(can'?t|cannot|can not|unable to) breathe|trouble breathing|shortness of breath|breathless/i, 'breathing trouble'],
  [/unconscious|passed out|fainted|not responding/i, 'loss of consciousness'],
  [/stroke|face droop|slurred speech|one side (is )?weak/i, 'stroke signs'],
  [/(severe|heavy|heavily|uncontrolled) bleeding|bleeding (a lot|heavily)/i, 'severe bleeding'],
  [/seizure|convulsion|fits\b/i, 'seizure'],
  [/suicid|want to die|kill myself|self[- ]?harm|end my life/i, 'self-harm risk'],
  [/overdose|poison|swallowed (too many|a lot of)/i, 'poisoning or overdose'],
  [/heart attack/i, 'possible heart attack'],
]

export function detectRedFlag(text: string): string | null {
  for (const [re, reason] of RED_FLAGS) if (re.test(text)) return reason
  return null
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
}

/**
 * The reviewed summary that best matches the question (document title and headline words).
 * "latest/recent" asks for the newest one. No match means null: the AI must not guess at a result.
 */
export function pickSummary(text: string, reviewed: ReviewedSummary[]): ReviewedSummary | null {
  if (reviewed.length === 0) return null
  if (/\b(latest|recent|newest|last|new)\b/i.test(text)) return reviewed[0]!
  const q = words(text)
  let best: ReviewedSummary | null = null
  let bestScore = 0
  for (const r of reviewed) {
    let score = 0
    for (const w of words(`${r.docTitle} ${r.title}`)) if (q.has(w)) score++
    if (score > bestScore) {
      best = r
      bestScore = score
    }
  }
  return best
}

const sim = (label: string, extra: Partial<ChatSourceRef> = {}): ChatSourceRef => ({ label, simulated: true, ...extra })

export function simulateReply(text: string, ctx: SimContext): SimReply {
  const flag = detectRedFlag(text)
  if (flag) {
    return {
      text:
        `This may be an emergency (${flag}). Please stop chatting and call ${EMERGENCY_NUMBER} for an ambulance now, ` +
        'or go to the nearest hospital. If someone is near you, ask them to stay with you. ' +
        `I cannot assess an emergency. ${DISCLAIMER}`,
      sourceRefs: [sim('Emergency guidance')],
      redFlag: true,
      redFlagReason: flag,
    }
  }
  const t = text.toLowerCase()
  const ask = ctx.nextAppointment
    ? `I can add this question to your next visit on ${ctx.nextAppointment.whenText} with ${ctx.nextAppointment.doctor}, or you can message your doctor.`
    : 'You can message your doctor or book a visit from Find care.'

  if (/diagnos|do i have|am i having|what (disease|illness)|which disease/.test(t)) {
    return {
      text: `I cannot diagnose. I can explain words in your reports and suggest questions for your doctor. ${ask} ${DISCLAIMER}`,
      sourceRefs: [sim('General guidance')],
      redFlag: false,
      redFlagReason: null,
    }
  }
  if (/result|report|x-?ray|scan|lab\b|blood test|cholesterol|hba1c|ldl|sugar test|ultrasound|ct\b|mri/.test(t)) {
    const s = pickSummary(text, ctx.reviewed)
    if (s) {
      return {
        text: `${s.reviewer} reviewed your ${s.docTitle}. ${s.title}: ${s.summary} I cannot say more than your doctor's note. ${DISCLAIMER}`,
        sourceRefs: [sim(s.docTitle, { document_id: s.documentId })],
        redFlag: false,
        redFlagReason: null,
      }
    }
    const known = ctx.reviewed.length ? ` Results your doctor has reviewed: ${ctx.reviewed.map((r) => r.docTitle).join(', ')}.` : ''
    return {
      text:
        'I can only explain a result after your doctor has reviewed it, and I could not find a reviewed result that matches your question.' +
        `${known} Please check Documents again after your doctor has seen it. ${DISCLAIMER}`,
      sourceRefs: [sim('Doctor review pending')],
      redFlag: false,
      redFlagReason: null,
    }
  }
  if (/dose|tablet|medicine|metformin|atorvastatin|stop taking|skip|increase|higher|lower the/.test(t)) {
    return {
      text: `Only your doctor can change a dose or stop a medicine. ${ask} If you feel unwell after a medicine, call your doctor or ${EMERGENCY_NUMBER}. ${DISCLAIMER}`,
      sourceRefs: [sim('Prescription guidance')],
      redFlag: false,
      redFlagReason: null,
    }
  }
  if (/dengue|mosquito|fever|malaria|chikungunya/.test(t)) {
    return {
      text:
        'Warning signs that need a hospital visit include severe belly pain, repeated vomiting, bleeding from gums or nose, ' +
        'black stools, or feeling very drowsy. Remove standing water near your home and use nets or repellent. ' +
        `Drink plenty of fluids and see a doctor if fever lasts more than 2 days. ${DISCLAIMER}`,
      sourceRefs: [sim('Health department advisory')],
      redFlag: false,
      redFlagReason: null,
    }
  }
  if (/fast|diet|food|eat|meal|onam|diabet|sugar/.test(t)) {
    return {
      text:
        'With diabetes medicines, long gaps between meals can drop your sugar too low, so please do not stop or change medicines on your own. ' +
        'Signs of low sugar are shakiness, sweating, hunger, headache or confusion: take something sugary and tell your doctor. ' +
        `${ask} ${DISCLAIMER}`,
      sourceRefs: [sim('General guidance')],
      redFlag: false,
      redFlagReason: null,
    }
  }
  if (/pressure|bp\b|hypertension/.test(t)) {
    return {
      text: `Your doctor sets the blood pressure range that suits you; you can see it under Vitals. Measure at the same time each day, sitting and rested. ${ask} ${DISCLAIMER}`,
      sourceRefs: [sim('Vitals guidance')],
      redFlag: false,
      redFlagReason: null,
    }
  }
  return {
    text:
      'I can help with general health information, explain words in reports your doctor has reviewed, and suggest questions for your visit. ' +
      `${ask} ${DISCLAIMER}`,
    sourceRefs: [sim('General guidance')],
    redFlag: false,
    redFlagReason: null,
  }
}

export const SUGGESTIONS = [
  'Explain my latest reviewed result in simple words',
  'What are the warning signs of dengue?',
  'Can I fast during a festival while taking diabetes medicines?',
  'What questions should I ask at my next visit?',
]

export { SIMULATED_AI_LABEL }

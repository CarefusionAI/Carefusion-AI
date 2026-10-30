import { createHash } from 'node:crypto'
import type { AIInsight, AiStatus } from '@carefusion/shared/dist/doctor.js'

// =====================================================================
// SIMULATED AI (alpha rule 3). Nothing here is a model: answers come from fixed rules over the open patient's own data,
// are always labelled "Simulated AI output. Guidance only." and need a doctor's review before a citizen could see them.
// =====================================================================

export const SIM_LABEL = 'Simulated AI output. Guidance only.' as const

export interface SimContext {
  patientName: string
  age: number | null
  allergies: string[]
  conditions: string[]
  medications: string[]
  /** Latest lab values by test code: { LDL: { value: 142, unit: 'mg/dL', flag: 'H' } } */
  labs: Record<string, { value: number; unit: string | null; flag: string | null }>
  /** Lab series by test code (for the temporal module). */
  series: { code: string; name: string; unit: string | null; points: { at: string; value: number }[] }[]
}

export interface InsightDraft {
  tool: AIInsight['tool']
  module: string
  status: AiStatus
  confidence: number
  headline: string
  text: string
  evidence: string[]
  hypotheses: { label: string; confidence: number; evidenceStatus: AiStatus }[]
  sources: { type: 'guideline' | 'pubmed' | 'clinvar' | 'regional'; ref: string; store: 'global' | 'state'; relevance: number }[]
  disagreement: AIInsight['disagreement']
  redFlag?: boolean
  modelName: string
}

/** Stable pseudo-random number in [0,1) from text, so the same input gives the same simulated output. */
export function seeded(text: string, salt = ''): number {
  const h = createHash('sha256').update(`${salt}|${text}`).digest()
  return h.readUInt32BE(0) / 0x100000000
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Paper's disagreement reporting (Algorithm 1), simulated with three fake model votes. */
export function simulateDisagreement(topLabel: string, alt: string, status: AiStatus, confidence: number, seed: string): AIInsight['disagreement'] {
  const agree = status === 'VERIFIED'
  const agreement = status === 'VERIFIED' ? 1 : status === 'SUPPORTED_WITH_CAUTION' ? 0.67 : 0.33
  const jitter = (k: string) => round2(Math.min(0.99, Math.max(0.05, confidence + (seeded(seed, k) - 0.5) * 0.12)))
  return {
    agree,
    agreement,
    models: [
      { name: 'sim-model-a', top: topLabel, confidence: jitter('a') },
      { name: 'sim-model-b', top: status === 'UNCERTAIN' ? alt : topLabel, confidence: jitter('b') },
      { name: 'sim-model-c', top: status === 'VERIFIED' ? topLabel : agreement > 0.5 ? topLabel : alt, confidence: jitter('c') },
    ],
    note: agree
      ? 'All three simulated models agree. A doctor still reviews the result.'
      : 'The simulated models disagree. Treat this as a prompt to look closer, not as an answer.',
  }
}

// ---------------------------------------------------------------------
// Allergy classes (also used by the prescription checker)
// ---------------------------------------------------------------------
export const ALLERGY_CLASSES: { allergy: RegExp; drugs: RegExp; label: string }[] = [
  { allergy: /penicillin|amoxicillin|ampicillin/i, drugs: /penicillin|amoxicillin|ampicillin|clavulan|piperacillin|cloxacillin|flucloxacillin/i, label: 'penicillin-class' },
  { allergy: /sulfa|sulpha|sulfonamide|cotrimoxazole/i, drugs: /sulfa|sulpha|sulfonamide|cotrimoxazole|trimethoprim/i, label: 'sulfa' },
  { allergy: /nsaid|aspirin|ibuprofen|diclofenac/i, drugs: /aspirin|ibuprofen|diclofenac|naproxen|ketorolac/i, label: 'NSAID' },
  { allergy: /cephalosporin|ceftriaxone|cefixime/i, drugs: /cef|cephal/i, label: 'cephalosporin' },
]

export function allergyConflict(allergies: string[], drugName: string): { blocked: boolean; message: string } | null {
  for (const a of allergies) {
    const lower = drugName.toLowerCase()
    if (lower.includes(a.toLowerCase().split(' ')[0]!)) return { blocked: true, message: `Blocked: patient is allergic to ${a}` }
    for (const c of ALLERGY_CLASSES) if (c.allergy.test(a) && c.drugs.test(drugName)) return { blocked: true, message: `Blocked: patient is allergic to ${a} (${c.label} drug)` }
  }
  return null
}

// ---------------------------------------------------------------------
// Summary (on the fly, not stored)
// ---------------------------------------------------------------------
export function generateSummaryInsight(c: {
  patientName: string
  age: number | null
  allergies: string[]
  conditions: string[]
  medications: string[]
  glance: { label: string; value: string }[]
}): AIInsight {
  const parts: string[] = []
  if (c.conditions.length) parts.push(`Active conditions: ${c.conditions.slice(0, 3).join(', ')}.`)
  const labs = c.glance.filter((g) => ['HbA1c', 'LDL cholesterol'].includes(g.label)).map((g) => `${g.label} ${g.value}`)
  if (labs.length) parts.push(`Latest: ${labs.join('; ')}.`)
  if (c.allergies.length) parts.push(`Allergy: ${c.allergies.join(', ')}.`)
  if (c.medications.length) parts.push(`${c.medications.length} active medicine${c.medications.length === 1 ? '' : 's'}.`)
  const evidenceCount = (c.conditions.length ? 1 : 0) + (labs.length ? 1 : 0) + (c.medications.length ? 1 : 0)
  const status: AiStatus = evidenceCount >= 3 ? 'VERIFIED' : evidenceCount >= 1 ? 'SUPPORTED_WITH_CAUTION' : 'UNCERTAIN'
  const confidence = round2(0.55 + evidenceCount * 0.11)
  return {
    runId: null,
    tool: 'summary',
    module: 'Summary',
    status,
    confidence,
    headline: c.conditions[0] ? `${c.conditions[0]}${labs.length ? ' with recent results' : ''}` : 'Not enough recorded data to summarise',
    text: `${parts.join(' ') || 'No recorded conditions, results or medicines were shared.'} Guidance only.`,
    evidence: [`${c.conditions.length} condition(s)`, `${labs.length} recent lab value(s)`, `${c.medications.length} active medicine(s)`],
    hypotheses: [],
    sources: [],
    disagreement: null,
    review: { state: 'pending', verdict: null, reason: null, editedText: null, reviewedAt: null, reviewedBy: null, visibleToPatient: false },
    simulated: true,
    label: SIM_LABEL,
    createdAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------
// Clinical-assist chat
// ---------------------------------------------------------------------
export interface ChatSim {
  text: string
  status: AiStatus
  confidence: number
  redFlag: boolean
  redFlagReason: string | null
  evidence: string[]
  sourceLabels: string[]
  headline: string
}

const RED_FLAGS: [RegExp, string][] = [
  [/chest pain|crushing|radiating to (the )?(arm|jaw)/i, 'chest pain'],
  [/stroke|facial droop|slurred speech|sudden weakness/i, 'possible stroke'],
  [/unconscious|not breathing|cardiac arrest|collapsed/i, 'collapse / not breathing'],
  [/severe bleeding|haemorrhage|hemorrhage|vomiting blood/i, 'severe bleeding'],
  [/anaphylaxis|throat swelling|can't breathe|cannot breathe/i, 'severe allergic reaction'],
  [/suicid|self[- ]harm/i, 'risk of self-harm'],
]

export function simulateChat(question: string, ctx: SimContext): ChatSim {
  const q = question.trim()
  for (const [re, why] of RED_FLAGS) {
    if (re.test(q)) {
      return {
        headline: `Red flag: ${why}`,
        text: `Red flag (${why}). This needs urgent clinical assessment now: follow the emergency protocol and call 108 if the patient is not already in a casualty area. This simulated assistant will not give further advice here. Guidance only.`,
        status: 'UNCERTAIN',
        confidence: 0.4,
        redFlag: true,
        redFlagReason: why,
        evidence: ['Red-flag keyword rule'],
        sourceLabels: ['Emergency triage rule (simulated)'],
      }
    }
  }
  const allergies = ctx.allergies
  const meds = ctx.medications
  if (/antibiotic|infection|penicillin|amoxicillin|azithro|doxy/i.test(q)) {
    const pen = allergies.find((a) => /penicillin|amoxicillin/i.test(a))
    const text = pen
      ? `${pen} allergy is recorded. Avoid all penicillins; cephalosporin cross-reactivity is low but caution is advised. A macrolide (azithromycin) or doxycycline are reasonable for respiratory infections. Check kidney function and current medicines before prescribing. Guidance only.`
      : allergies.length
        ? `Recorded allergies: ${allergies.join(', ')}. No penicillin allergy is recorded. Choose by the likely organism and local guideline; check kidney function and interactions with ${meds.join(', ') || 'current medicines'}. Guidance only.`
        : `No allergies are recorded for this patient. Choose by the likely organism and local guideline; check kidney function and current medicines first. Guidance only.`
    return {
      headline: pen ? `Antibiotic options with ${pen.toLowerCase()} allergy` : 'Antibiotic choice',
      text,
      status: pen ? 'SUPPORTED_WITH_CAUTION' : 'UNCERTAIN',
      confidence: pen ? 0.78 : 0.55,
      redFlag: false,
      redFlagReason: null,
      evidence: [allergies.length ? `Allergy list: ${allergies.join(', ')}` : 'No allergies recorded', `${meds.length} active medicine(s) checked`],
      sourceLabels: ['Allergy list', 'Active medicines', 'Local antibiotic guideline (simulated)'],
    }
  }
  if (/statin|atorvastatin|cholesterol|ldl/i.test(q)) {
    const ldl = ctx.labs['LDL']
    return {
      headline: 'Statin question',
      text: `${ldl ? `Latest LDL is ${ldl.value} ${ldl.unit ?? ''}${ldl.flag && ldl.flag !== 'N' ? ' (above range)' : ''}. ` : ''}No clinically significant interaction is expected between metformin and a statin. Monitor liver enzymes at about 3 months and ask about muscle aches. Review adherence before changing the dose. Guidance only.`,
      status: ldl ? 'VERIFIED' : 'SUPPORTED_WITH_CAUTION',
      confidence: ldl ? 0.82 : 0.6,
      redFlag: false,
      redFlagReason: null,
      evidence: [ldl ? `LDL ${ldl.value} ${ldl.unit ?? ''}` : 'No LDL on file', `Medicines: ${meds.join(', ') || 'none recorded'}`],
      sourceLabels: ['Lab results', 'Active medicines', 'Lipid guideline (simulated)'],
    }
  }
  if (/summar|last (3|three) visits|history/i.test(q)) {
    return {
      headline: 'Summary of recent care',
      text: `${ctx.conditions.length ? `Conditions on record: ${ctx.conditions.join(', ')}. ` : ''}${Object.keys(ctx.labs).length ? `Latest labs: ${Object.entries(ctx.labs).map(([k, v]) => `${k} ${v.value}${v.unit ? ' ' + v.unit : ''}`).join(', ')}. ` : ''}${meds.length ? `Current medicines: ${meds.join(', ')}. ` : ''}Guidance only.`,
      status: ctx.conditions.length ? 'SUPPORTED_WITH_CAUTION' : 'UNCERTAIN',
      confidence: ctx.conditions.length ? 0.74 : 0.45,
      redFlag: false,
      redFlagReason: null,
      evidence: [`${ctx.conditions.length} condition(s)`, `${Object.keys(ctx.labs).length} lab value(s)`],
      sourceLabels: ['Problem list', 'Lab results'],
    }
  }
  if (/dose|how much|mg\b/i.test(q)) {
    return {
      headline: 'Dosing question',
      text: 'Dosing depends on weight, kidney and liver function and other medicines. This simulated assistant does not recommend doses; use the national formulary and your clinical judgement. Guidance only.',
      status: 'UNCERTAIN',
      confidence: 0.4,
      redFlag: false,
      redFlagReason: null,
      evidence: ['Dosing rule: no dose advice'],
      sourceLabels: ['National formulary (simulated)'],
    }
  }
  return {
    headline: 'General question',
    text: `Based on the open record${ctx.conditions.length ? ` (${ctx.conditions.slice(0, 2).join(', ')})` : ''}${allergies.length ? `, allergy: ${allergies.join(', ')}` : ''}, I cannot confirm more without further data. Please use your clinical judgement. Guidance only.`,
    status: 'UNCERTAIN',
    confidence: 0.45,
    redFlag: false,
    redFlagReason: null,
    evidence: ['Fallback rule'],
    sourceLabels: ['Open record'],
  }
}

// ---------------------------------------------------------------------
// Image analysis
// ---------------------------------------------------------------------
export function simulateImage(input: { title: string; modality: string | null; bodyPart: string | null; seed: string }): InsightDraft {
  const chest = /chest|cxr|lung|thorax/i.test(`${input.title} ${input.bodyPart ?? ''}`)
  const r = seeded(input.seed, 'img')
  const top = chest
    ? ['Mild right lower zone opacity, consistent with a resolving infection', 'Subsegmental atelectasis', 'Normal study with vascular overlap']
    : ['No acute abnormality identified', 'Degenerative change', 'Technique-related artefact']
  const c1 = round2(0.5 + r * 0.35)
  const c2 = round2((1 - c1) * 0.6)
  const c3 = round2(1 - c1 - c2)
  const status: AiStatus = c1 >= 0.82 ? 'VERIFIED' : c1 >= 0.6 ? 'SUPPORTED_WITH_CAUTION' : 'UNCERTAIN'
  return {
    tool: 'image',
    module: `Image analysis · ${input.title}`,
    status,
    confidence: c1,
    headline: top[0]!,
    text: chest
      ? `Pattern is consistent with a resolving infection. No pneumothorax and no effusion were detected by the simulation. Compare with the earlier film and correlate clinically. Guidance only.`
      : 'No obvious acute finding was detected by the simulation. A radiologist report remains the reference. Guidance only.',
    evidence: chest ? ['Increased density, right lower zone (box)', 'Compared with the earlier film', 'No pneumothorax or effusion'] : ['Whole-image scan', 'No focal density'],
    hypotheses: [
      { label: top[0]!, confidence: c1, evidenceStatus: status },
      { label: top[1]!, confidence: c2, evidenceStatus: 'UNCERTAIN' },
      { label: top[2]!, confidence: c3, evidenceStatus: 'UNCERTAIN' },
    ],
    sources: [
      { type: 'guideline', ref: 'DEMO-GL-CXR-001', store: 'global', relevance: 0.81 },
      { type: 'guideline', ref: 'DEMO-GL-LRTI-004', store: 'state', relevance: 0.74 },
    ],
    disagreement: simulateDisagreement(top[0]!, top[1]!, status, c1, input.seed),
    modelName: 'image-vision-sim',
  }
}

// ---------------------------------------------------------------------
// Genomic panel
// ---------------------------------------------------------------------
const GENES: { gene: string; variant: string; meaning: string; drug: RegExp | null; level: AiStatus }[] = [
  { gene: 'SLCO1B1', variant: 'c.521T>C heterozygous', meaning: 'statin muscle-side-effect risk raised', drug: /statin/i, level: 'UNCERTAIN' },
  { gene: 'CYP2C19', variant: '*1/*2', meaning: 'clopidogrel response reduced', drug: /clopidogrel/i, level: 'SUPPORTED_WITH_CAUTION' },
  { gene: 'CYP2C9', variant: '*1/*1', meaning: 'normal warfarin / NSAID metabolism', drug: /warfarin|ibuprofen|diclofenac/i, level: 'VERIFIED' },
  { gene: 'CYP2D6', variant: '*1/*4', meaning: 'intermediate metaboliser (some opioids, tamoxifen)', drug: /codeine|tramadol|tamoxifen/i, level: 'SUPPORTED_WITH_CAUTION' },
  { gene: 'TPMT', variant: '*1/*3A', meaning: 'thiopurine dose reduction needed', drug: /azathioprine|mercaptopurine/i, level: 'SUPPORTED_WITH_CAUTION' },
  { gene: 'VKORC1', variant: '-1639G>A', meaning: 'lower warfarin dose requirement', drug: /warfarin/i, level: 'SUPPORTED_WITH_CAUTION' },
]

export function simulateGenomic(ctx: SimContext, seed: string): InsightDraft {
  const order = GENES.map((g, i) => ({ g, k: seeded(seed, `gene${i}`) })).sort((a, b) => a.k - b.k).map((x) => x.g)
  // prefer genes that matter for the patient's medicines
  const medText = ctx.medications.join(' ')
  const relevant = GENES.filter((g) => g.drug && g.drug.test(medText))
  const pick = [...relevant, ...order.filter((g) => !relevant.includes(g))].slice(0, 3)
  const top = pick[0]!
  const status = top.level
  const confidence = round2(status === 'VERIFIED' ? 0.9 : status === 'SUPPORTED_WITH_CAUTION' ? 0.7 + seeded(seed, 'c') * 0.1 : 0.5 + seeded(seed, 'c') * 0.08)
  const impacted = relevant.map((g) => g.gene)
  return {
    tool: 'genomic',
    module: 'Genomic panel · 24 genes',
    status,
    confidence,
    headline: `${top.gene} ${top.variant}: ${top.meaning}`,
    text: `${impacted.length ? `Relevant to current medicines: ${impacted.join(', ')}. ` : ''}${top.meaning.charAt(0).toUpperCase() + top.meaning.slice(1)}. Consider a dose review and monitoring; evidence level is ${status === 'VERIFIED' ? 'high' : status === 'SUPPORTED_WITH_CAUTION' ? 'moderate' : 'low to moderate'}. Guidance only.`,
    evidence: pick.map((g) => `${g.gene} ${g.variant}`),
    hypotheses: pick.map((g, i) => ({ label: `${g.gene} ${g.variant}: ${g.meaning}`, confidence: round2(Math.max(0.3, confidence - i * 0.1)), evidenceStatus: g.level })),
    sources: [
      { type: 'clinvar', ref: `CLINVAR-DEMO-${top.gene}`, store: 'global', relevance: 0.8 },
      { type: 'guideline', ref: 'CPIC-DEMO-LEVEL-B', store: 'global', relevance: 0.7 },
    ],
    disagreement: simulateDisagreement(`${top.gene} ${top.variant}`, `${pick[1]?.gene ?? 'CYP2C9'} normal`, status, confidence, seed),
    modelName: 'genomic-panel-sim',
  }
}

// ---------------------------------------------------------------------
// Temporal trend
// ---------------------------------------------------------------------
export function simulateTemporal(ctx: SimContext, seed: string): InsightDraft {
  const lines: string[] = []
  const evidence: string[] = []
  const hyps: InsightDraft['hypotheses'] = []
  for (const s of ctx.series.filter((x) => x.points.length >= 2).slice(0, 3)) {
    const first = s.points[0]!
    const last = s.points[s.points.length - 1]!
    const pct = first.value ? Math.round(((last.value - first.value) / first.value) * 100) : 0
    const dir = pct > 3 ? 'up' : pct < -3 ? 'down' : 'steady'
    lines.push(`${s.name} ${dir}${dir === 'steady' ? '' : ` ${Math.abs(pct)}%`} (${first.value} to ${last.value}${s.unit ? ' ' + s.unit : ''})`)
    evidence.push(`${s.points.length} ${s.name} results`)
    hyps.push({ label: `${s.name} trend: ${dir}`, confidence: round2(0.8 - hyps.length * 0.08), evidenceStatus: 'VERIFIED' })
  }
  const enough = lines.length > 0
  const status: AiStatus = enough ? 'VERIFIED' : 'UNCERTAIN'
  const confidence = enough ? round2(0.78 + seeded(seed, 't') * 0.08) : 0.35
  return {
    tool: 'temporal',
    module: 'Temporal analysis',
    status,
    confidence,
    headline: enough ? lines[0]! : 'Not enough repeated results to show a trend',
    text: enough ? `${lines.join('; ')}. Review adherence and the next planned tests. Guidance only.` : 'At least two results of the same test are needed. Guidance only.',
    evidence,
    hypotheses: hyps,
    sources: enough ? [{ type: 'guideline', ref: 'DEMO-GL-TREND-002', store: 'global', relevance: 0.7 }] : [],
    disagreement: enough ? simulateDisagreement(lines[0]!, 'No clear trend', status, confidence, seed) : null,
    modelName: 'temporal-trend-sim',
  }
}

import type { VitalKind } from '@carefusion/shared/dist/citizen-app.js'

export const LOINC = {
  systolic: '8480-6',
  diastolic: '8462-4',
  pulse: '8867-4',
  sugarFasting: '1558-6',
  sugarOther: '2339-0',
  weight: '29463-7',
  height: '8302-2',
  spo2: '2708-6',
  temperature: '8310-5',
  hba1c: '4548-4',
  ldl: '13457-7',
} as const

export const KIND_LABEL: Record<VitalKind, string> = {
  bp: 'Blood pressure',
  sugar: 'Sugar',
  weight: 'Weight',
  spo2: 'SpO2',
  temperature: 'Temperature',
}

export const TARGET_LABEL: Record<string, string> = {
  [LOINC.systolic]: 'Systolic blood pressure',
  [LOINC.diastolic]: 'Diastolic blood pressure',
  [LOINC.sugarFasting]: 'Fasting sugar',
  [LOINC.weight]: 'Goal weight',
  [LOINC.hba1c]: 'HbA1c',
  [LOINC.ldl]: 'LDL cholesterol',
}

export type VitalStatus = 'in_range' | 'above_target' | 'high' | 'low' | 'normal'

export interface Band {
  low: number | null
  high: number | null
}

export interface BpTargets {
  systolic: Band
  diastolic: Band
}

/** Hard limits that tell the care team (design rule): BP >= 140 or >= 90 or systolic < 90. */
export function classifyBp(sys: number, dia: number, t?: BpTargets): VitalStatus {
  if (sys >= 140 || dia >= 90) return 'high'
  if (sys < 90) return 'low'
  if (t) {
    const aboveS = t.systolic.high !== null && sys > t.systolic.high
    const aboveD = t.diastolic.high !== null && dia > t.diastolic.high
    if (aboveS || aboveD) return 'above_target'
    const belowS = t.systolic.low !== null && sys < t.systolic.low
    const belowD = t.diastolic.low !== null && dia < t.diastolic.low
    if (belowS || belowD) return 'low'
    return 'in_range'
  }
  return 'normal'
}

/** Sugar: >= 180 high, < 70 low; fasting readings above the doctor's target are "above target". */
export function classifySugar(value: number, context: string | null, targetHigh: number | null): VitalStatus {
  if (value >= 180) return 'high'
  if (value < 70) return 'low'
  if (context === 'fasting' && targetHigh !== null) return value > targetHigh ? 'above_target' : 'in_range'
  return 'normal'
}

export function classifySpo2(value: number): VitalStatus {
  return value < 92 ? 'low' : 'normal'
}

export function classifyTemperature(celsius: number): VitalStatus {
  if (celsius >= 38) return 'high'
  if (celsius < 35) return 'low'
  return 'normal'
}

export function isFlagged(status: VitalStatus): boolean {
  return status === 'above_target' || status === 'high' || status === 'low'
}

/** Should the care team be told? Only the hard limits (high / low). */
export function shouldNotifyDoctor(status: VitalStatus): boolean {
  return status === 'high' || status === 'low'
}

export function bmiOf(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return Math.round((weightKg / (m * m)) * 10) / 10
}

export function bmiBand(bmi: number): 'under' | 'healthy' | 'over' | 'high' {
  if (bmi < 18.5) return 'under'
  if (bmi < 25) return 'healthy'
  if (bmi < 30) return 'over'
  return 'high'
}

import { describe, expect, it } from 'vitest'
import { neutraliseCsvText } from '../src/csv'
import { csvCell, toCsv } from '../src/gov-admin/gov-util'
import { mapPgError } from '../src/events/pg-errors'

describe('CSV cells', () => {
  it('prefixes text that a spreadsheet would run as a formula', () => {
    for (const bad of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx']) expect(neutraliseCsvText(bad)).toBe(`'${bad}`)
  })
  it('leaves normal text alone', () => {
    expect(neutraliseCsvText('Paracetamol 500')).toBe('Paracetamol 500')
    expect(neutraliseCsvText('')).toBe('')
  })
  it('csvCell neutralises strings but keeps numbers (including negative ones) as numbers', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell(null)).toBe('')
    expect(csvCell('a,b')).toBe('"a,b"')
  })
  it('toCsv applies it to every row', () => {
    expect(toCsv(['name'], [['=bad'], ['ok']])).toBe("name\n'=bad\nok\n")
  })
})

describe('database error mapping', () => {
  it('does not return the database text for a missing value', () => {
    const err = mapPgError({ code: '23502', message: 'null value in column "secret_col" of relation "x"' })
    expect(JSON.stringify(err.getResponse())).not.toContain('secret_col')
  })
})
